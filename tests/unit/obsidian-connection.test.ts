import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readObsidianVaults,
  windowsObsidianExecutable,
} from '../../service/src/obsidian-discovery';
const scope = vi.hoisted(() => ({ directory: '', discovery: vi.fn() }));
vi.mock('../../service/src/config', () => ({
  get configDirectory() {
    return scope.directory;
  },
}));
vi.mock('../../service/src/obsidian-discovery', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../service/src/obsidian-discovery')
  >()),
  discoverObsidian: scope.discovery,
}));
import { obsidian } from '../../service/src/obsidian';
import { nativeRequestSchema } from '../../shared/src';
beforeEach(async () => {
  scope.directory = await mkdtemp(join(tmpdir(), 'vn-connection-'));
  scope.discovery.mockReset();
});
afterEach(async () => {
  await rm(scope.directory, { recursive: true, force: true });
});
const payload = {
  videoId: 'abcdefghijk',
  title: '视频',
  markdown: '# 笔记',
  copy: false,
};
async function registeredVault() {
  const folder = join(scope.directory, '知识库');
  await mkdir(join(folder, '.obsidian'), { recursive: true });
  // macOS /var is a symlink, discovery always returns canonical paths.
  const { realpath } = await import('node:fs/promises');
  const canonical = await realpath(folder);
  return { folder: canonical, vault: canonical, name: '知识库' };
}
it.each(['appMissing', 'noVaults'])(
  '状态 %s 拒绝选库和导出，不写入配置或笔记',
  async (state) => {
    scope.discovery.mockResolvedValue({ state, vaults: [] });
    expect(await obsidian('obsidianStatus', {})).toEqual({ state, vaults: [] });
    await expect(
      obsidian('obsidianChoose', { vault: '/tmp' }),
    ).rejects.toThrow();
    await expect(obsidian('obsidianExport', payload)).rejects.toThrow();
    expect(await readdir(scope.directory)).toEqual([]);
  },
);
it('仅允许登记知识库，正常写入、重复确认；卸载应用后拒绝继续写', async () => {
  const vault = await registeredVault();
  scope.discovery.mockResolvedValue({ state: 'ready', vaults: [vault] });
  expect(await obsidian('obsidianTarget', {})).toBeNull();
  await expect(
    obsidian('obsidianChoose', { vault: '/arbitrary' }),
  ).rejects.toThrow('不在');
  await obsidian('obsidianChoose', { vault: vault.vault });
  expect(await obsidian('obsidianTarget', {})).toEqual({
    folder: vault.folder,
    vault: vault.vault,
  });
  expect(await obsidian('obsidianExport', payload)).toMatchObject({
    status: 'saved',
  });
  expect(await obsidian('obsidianExport', payload)).toMatchObject({
    status: 'duplicate',
  });
  scope.discovery.mockResolvedValue({ state: 'appMissing', vaults: [] });
  await expect(
    obsidian('obsidianExport', { ...payload, copy: true }),
  ).rejects.toThrow('安装');
  expect(
    (await readdir(vault.folder)).filter((file) => file.endsWith('.md')),
  ).toHaveLength(1);
});
it('知识库取消登记后旧目标不能继续写入', async () => {
  const vault = await registeredVault();
  scope.discovery.mockResolvedValue({ state: 'ready', vaults: [vault] });
  await obsidian('obsidianChoose', { vault: vault.vault });
  scope.discovery.mockResolvedValue({
    state: 'ready',
    vaults: [{ folder: '/other', vault: '/other', name: 'other' }],
  });
  expect(await obsidian('obsidianTarget', {})).toBeNull();
  await expect(obsidian('obsidianExport', payload)).rejects.toThrow('移除');
});
it('只列出有效登记库，过滤失效路径和重复项；损坏配置不伪装没有知识库', async () => {
  const vault = await registeredVault();
  const config = join(scope.directory, 'obsidian.json');
  expect(await readObsidianVaults(config)).toEqual([]);
  await writeFile(
    config,
    JSON.stringify({
      vaults: {
        a: { path: vault.folder },
        b: { path: vault.folder },
        c: { path: join(scope.directory, 'gone') },
      },
    }),
  );
  expect(await readObsidianVaults(config)).toEqual([vault]);
  await writeFile(config, '{broken');
  await expect(readObsidianVaults(config)).rejects.toThrow();
});
it('协议包含状态检测；Windows 只解析 Obsidian 程序路径，不执行协议命令', () => {
  expect(
    nativeRequestSchema.safeParse({
      id: '1',
      operation: 'obsidianStatus',
      payload: {},
    }).success,
  ).toBe(true);
  expect(
    windowsObsidianExecutable('REG_SZ "D:\\Apps\\Obsidian\\Obsidian.exe" "%1"'),
  ).toBe('D:\\Apps\\Obsidian\\Obsidian.exe');
  expect(windowsObsidianExecutable('"C:\\other.exe" "%1"')).toBeUndefined();
});
