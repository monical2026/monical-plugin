import { expect, it, vi, afterEach } from 'vitest';
const probe = vi.hoisted(() => ({
  files: new Set<string>(),
  stdout: '',
  error: null as Error | null,
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  stat: vi.fn(async (path: string) => {
    if (probe.files.has(path)) return { isFile: () => true };
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }),
}));
vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (_file: unknown, _args: unknown, _options: unknown, callback: Function) =>
      callback(probe.error, { stdout: probe.stdout, stderr: '' }),
  ),
}));
import { obsidianInstalled } from '../../service/src/obsidian-discovery';
afterEach(() => {
  vi.unstubAllGlobals();
  probe.files.clear();
  probe.stdout = '';
  probe.error = null;
});
it('Mac 标准位置存在应用时可用；残留配置不能替代应用', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin' });
  expect(await obsidianInstalled()).toBe(false);
  probe.files.add('/Applications/Obsidian.app/Contents/MacOS/Obsidian');
  expect(await obsidianInstalled()).toBe(true);
});
it('Windows 自定义安装路径从协议读取，程序不存在仍不可用', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  probe.stdout = 'REG_SZ "D:\\学习工具\\Obsidian.exe" "%1"';
  expect(await obsidianInstalled()).toBe(false);
  probe.files.add('D:\\学习工具\\Obsidian.exe');
  expect(await obsidianInstalled()).toBe(true);
});
it('探测超时不伪报应用未安装', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin' });
  probe.error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  await expect(obsidianInstalled()).rejects.toThrow('timeout');
});
