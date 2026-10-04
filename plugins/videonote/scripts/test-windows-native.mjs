import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
if (process.platform !== 'win32')
  throw new Error('此测试必须在 Windows 上运行，不接受模拟通过');
const root = await mkdtemp(join(tmpdir(), 'VideoNote 中文 smoke '));
const account = `test-${randomUUID()}`;
const binary = join(root, 'videonote-host.exe');
const origin = `chrome-extension://${'a'.repeat(32)}/`;
let saved = false;
function invoke(args, input) {
  return spawnSync(binary, args, {
    input,
    timeout: 15000,
    windowsHide: true,
    env: { ...process.env, LOCALAPPDATA: root },
  });
}
function credential(operation, secret) {
  const result = invoke(
    ['--credentials'],
    JSON.stringify({ operation, account, secret }),
  );
  assert.equal(result.status, 0, '凭据组件退出异常');
  return JSON.parse(result.stdout.toString('utf8'));
}
try {
  for (const name of ['host.mjs', 'videonote-host.exe'])
    await copyFile(resolve('service/dist', name), join(root, name));
  await copyFile(process.execPath, join(root, 'node.exe'));
  const config = join(root, 'VideoNote');
  await mkdir(config);
  await writeFile(
    join(config, 'host-registration.json'),
    JSON.stringify({ allowed_origins: [origin] }),
  );
  assert.equal(credential('get').missing, true);
  const fixture = 'VideoNote-smoke-仅测试-' + randomUUID();
  assert.equal(credential('set', fixture).saved, true);
  saved = true;
  assert.equal(credential('get').secret, fixture);
  assert.ok(credential('set', 'x'.repeat(1281)).error, '超长凭据必须拒绝');
  assert.equal(credential('get').secret, fixture, '拒绝写入不能破坏已有凭据');
  const body = Buffer.from(
    JSON.stringify({ id: randomUUID(), operation: 'status', payload: {} }),
  );
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  const packet = Buffer.concat([header, body]);
  const result = invoke([origin], packet);
  assert.equal(result.status, 0, 'Native Messaging 启动失败');
  assert.equal(result.stdout.readUInt32LE(), result.stdout.length - 4);
  assert.ok(JSON.parse(result.stdout.subarray(4).toString('utf8')).data);
  const denied = invoke([`chrome-extension://${'b'.repeat(32)}/`], packet);
  assert.notEqual(denied.status, 0, '未注册扩展不能访问组件');
  assert.equal(denied.stdout.length, 0);
  console.log(
    'Windows 原生凭据、中文空格路径、二进制通信与来源拒绝测试通过；未调用外部服务。',
  );
} finally {
  if (saved) {
    const result = spawnSync(
      join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmdkey.exe'),
      [`/delete:com.youtube-note.credentials/${account}`],
      { windowsHide: true },
    );
    if (result.status !== 0)
      throw new Error(
        '本次测试凭据清理失败，请在 Windows 凭据管理器清理 test- 前缀的测试条目',
      );
  }
  await rm(root, { recursive: true, force: true });
}
