import { z } from 'zod';
import { settingsSchema, defaultSettings } from '@youtube-note/shared';
import { store, stored, locked } from './storage';
import { apiUrl } from './network';
import { saveSecrets, removeVault } from './vault';
export async function readSettings() {
  const value = await stored('browserServiceSettings');
  return value === undefined
    ? structuredClone(defaultSettings)
    : settingsSchema.parse(value);
}
export async function saveSettings(input: unknown) {
  const payload = z
    .object({
      settings: settingsSchema,
      keys: z.record(z.string(), z.string().max(16000)),
    })
    .parse(input);
  return locked('settings', async () => {
    const previous = await readSettings();
    if (payload.settings.revision !== previous.revision)
      throw new Error('设置已在另一个窗口更新，请重新加载');
    const secrets: Record<string, string> = {};
    for (const profile of payload.settings.profiles) {
      if (profile.connection === 'codex')
        throw new Error('本机 Codex 需要切换到本机组件模式');
      const address = apiUrl(profile.baseUrl);
      if (
        profile.kind === 'supadata' &&
        address.href !== 'https://api.supadata.ai/v1/'
      )
        throw new Error('Supadata 地址请使用 https://api.supadata.ai/v1');
      const old = previous.profiles.find((p) => p.id === profile.id);
      if (old && old.baseUrl !== profile.baseUrl && !payload.keys[profile.id])
        throw new Error('更换服务地址必须重新填写密钥，避免旧密钥发送到新地址');
      if (payload.keys[profile.id]) {
        profile.credentialAccount = `${profile.id}-${crypto.randomUUID()}`;
        secrets[profile.credentialAccount] = payload.keys[profile.id];
      } else profile.credentialAccount = old?.credentialAccount;
      profile.configured = !!profile.credentialAccount;
    }
    if (Object.keys(secrets).length) await saveSecrets(secrets);
    const saved = { ...payload.settings, revision: previous.revision + 1 };
    await store('browserServiceSettings', saved);
    return saved;
  });
}

export async function resetBrowserKeys() {
  await locked('settings', () =>
    locked('vault', async () => {
      const current = await readSettings();
      await store('browserServiceSettings', {
        ...current,
        revision: current.revision + 1,
        profiles: current.profiles.map((p) => ({
          ...p,
          configured: false,
          credentialAccount: undefined,
        })),
      });
      await removeVault();
    }),
  );
}
