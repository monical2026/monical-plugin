import { expect, it, afterEach } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registration,
  installFiles,
} from '../../scripts/installer/register.mjs';
const roots: string[] = [];
afterEach(async () => {
  for (const path of roots.splice(0))
    await rm(path, { recursive: true, force: true });
});
it('安装只接受精确扩展来源，保留原已授权 ID，不接受通配符或注入', () => {
  const id = 'a'.repeat(32),
    old = 'b'.repeat(32);
  const result = registration(
    { allowed_origins: [`chrome-extension://${old}/`, '*', 'https://evil'] },
    id,
    '/host',
  );
  expect(result.allowed_origins).toEqual([
    `chrome-extension://${old}/`,
    `chrome-extension://${id}/`,
  ]);
  expect(() => registration({}, 'a; touch /tmp/no', '/host')).toThrow();
});
it('Mac 安装保存运行时并注册，保留原服务配置和目标；重复安装不重复来源', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-install-'));
  roots.push(root);
  const source = join(root, '源文件'),
    destination = join(root, "安装 ' 目录");
  await mkdir(source);
  await mkdir(destination);
  for (const name of ['node', 'host.mjs', 'keychain-bridge'])
    await writeFile(join(source, name), 'fixture');
  await writeFile(join(destination, 'settings.json'), '保留配置');
  await writeFile(join(destination, 'obsidian-target.json'), '保留目标');
  const input = {
    source,
    destination,
    extensionId: 'a'.repeat(32),
    platform: 'darwin',
    home: root,
  };
  await installFiles(input);
  await installFiles(input);
  expect(await readFile(join(destination, 'settings.json'), 'utf8')).toBe(
    '保留配置',
  );
  expect(
    await readFile(join(destination, 'obsidian-target.json'), 'utf8'),
  ).toBe('保留目标');
  const registration = JSON.parse(
    await readFile(
      join(
        root,
        'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.youtube_note.host.json',
      ),
      'utf8',
    ),
  );
  expect(registration.allowed_origins).toHaveLength(1);
  expect(registration.path).toBe(join(destination, 'launch.sh'));
  expect((await stat(registration.path)).mode & 0o100).toBeTruthy();
  expect(await readFile(registration.path, 'utf8')).toContain("'\\''");
});
