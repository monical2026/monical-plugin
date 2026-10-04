import { z } from 'zod';
import { stored, store, locked, trustedStorage } from './storage';
const vaultKey = 'browserServiceVault';
const sessionKey = 'browserServiceUnlock';
const vaultSchema = z.object({
  version: z.literal(1),
  salt: z.string().max(100),
  iv: z.string().max(100),
  ciphertext: z.string().max(1000000),
});
const secretsSchema = z.record(z.string(), z.string().max(16000));
function encode(bytes: Uint8Array) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(text);
}
function decode(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}
async function open(cipher: z.infer<typeof vaultSchema>, key: CryptoKey) {
  try {
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(cipher.iv) },
      key,
      decode(cipher.ciphertext),
    );
    return secretsSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error('解锁密码不正确或密钥库已损坏，未改动已保存内容');
  }
}
async function seal(
  secrets: Record<string, string>,
  key: CryptoKey,
  salt: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(secrets)),
  );
  return {
    version: 1 as const,
    salt,
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  };
}
async function unlocked() {
  await trustedStorage();
  const session: unknown = (await chrome.storage.session.get(sessionKey))[
    sessionKey
  ];
  const parsed = z
    .object({ raw: z.string(), salt: z.string() })
    .safeParse(session);
  if (!parsed.success) throw new Error('请先到设置页解锁浏览器密钥库');
  const cipher = vaultSchema.parse(await stored(vaultKey));
  if (parsed.data.salt !== cipher.salt)
    throw new Error('密钥库已变化，请重新解锁');
  const key = await crypto.subtle.importKey(
    'raw',
    decode(parsed.data.raw),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, cipher };
}
export async function vaultStatus() {
  const value = await stored(vaultKey);
  if (value === undefined) return { initialized: false, unlocked: false };
  vaultSchema.parse(value);
  try {
    await unlocked();
    return { initialized: true, unlocked: true };
  } catch {
    return { initialized: true, unlocked: false };
  }
}
export async function unlockVault(password: string) {
  if (password.length < 10 || password.length > 200)
    throw new Error('解锁密码需为 10～200 个字符');
  return locked('vault', async () => {
    const value = await stored(vaultKey);
    const cipher = value === undefined ? undefined : vaultSchema.parse(value);
    const salt = cipher
      ? decode(cipher.salt)
      : crypto.getRandomValues(new Uint8Array(16));
    const key = await derive(password, salt);
    if (cipher) await open(cipher, key);
    else await store(vaultKey, await seal({}, key, encode(salt)));
    await chrome.storage.session.set({
      [sessionKey]: {
        raw: encode(new Uint8Array(await crypto.subtle.exportKey('raw', key))),
        salt: encode(salt),
      },
    });
  });
}
export async function lockVault() {
  await chrome.storage.session.remove(sessionKey);
}
export async function readSecret(account: string) {
  const { key, cipher } = await unlocked();
  return (await open(cipher, key))[account];
}
export async function saveSecrets(values: Record<string, string>) {
  await locked('vault', async () => {
    const { key, cipher } = await unlocked();
    const secrets = await open(cipher, key);
    await store(
      vaultKey,
      await seal(
        { ...secrets, ...secretsSchema.parse(values) },
        key,
        cipher.salt,
      ),
    );
  });
}

export async function removeVault() {
  await lockVault();
  await chrome.storage.local.remove(vaultKey);
}
