import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import { rememberedDirectory } from '../../extension/src/export/browser-directory-store';
import { browserObsidian } from '../../extension/src/background/browser-obsidian';
import { firstInstall } from '../../extension/src/background/first-install';
import type { ExportDirectory } from '../../extension/src/export/browser-obsidian';
import { requestSchema } from '../../shared/src';
vi.mock('../../extension/src/export/browser-directory-store', () => ({
  rememberedDirectory: vi.fn(),
}));
beforeEach(() => {
  fakeChrome();
  vi.mocked(rememberedDirectory).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
function folder(permission: PermissionState = 'granted') {
  const files = new Map<string, string>();
  const directory: ExportDirectory = {
    name: '已连接知识库',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => 'granted'),
    async *values() {
      for (const name of files.keys()) yield { name, kind: 'file' };
    },
    async getFileHandle(name, options) {
      if (!files.has(name) && !options?.create)
        throw new DOMException('', 'NotFoundError');
      return {
        async createWritable() {
          let value = '';
          return {
            async write(text) {
              value = text;
            },
            async close() {
              files.set(name, value);
            },
            async abort() {},
          };
        },
      };
    },
  };
  return { directory, files };
}
const payload = {
  videoId: 'abcdefghijk',
  title: '视频',
  markdown: '# 学习笔记',
  copy: false,
};
it('已连接且权限有效时，后台直接写入；不弹文件夹选择或重新请求权限', async () => {
  const { directory, files } = folder();
  vi.mocked(rememberedDirectory).mockResolvedValue(directory);
  expect(await browserObsidian('status', undefined)).toEqual({
    folder: '已连接知识库',
    vault: '已连接知识库',
  });
  expect(await browserObsidian('export', payload)).toMatchObject({
    status: 'saved',
  });
  expect([...files.values()]).toEqual(['# 学习笔记']);
  expect(directory.requestPermission).not.toHaveBeenCalled();
  expect(await browserObsidian('export', payload)).toMatchObject({
    status: 'duplicate',
  });
  expect(files.size).toBe(1);
});
it.each(['prompt', 'denied'] as const)(
  '权限 %s 时不写入，由独立页面重新授权',
  async (permission) => {
    const { directory, files } = folder(permission);
    vi.mocked(rememberedDirectory).mockResolvedValue(directory);
    expect(await browserObsidian('export', payload)).toEqual({
      status: 'authorizationRequired',
    });
    expect(files.size).toBe(0);
    expect(directory.requestPermission).not.toHaveBeenCalled();
  },
);
it('未连接时返回连接需求；协议拒绝未知动作，非法视频不能写入', async () => {
  vi.mocked(rememberedDirectory).mockResolvedValue(null);
  expect(await browserObsidian('export', payload)).toEqual({
    status: 'authorizationRequired',
  });
  expect(() =>
    requestSchema.parse({ type: 'browserObsidian', action: 'delete' }),
  ).toThrow();
  await expect(
    browserObsidian('export', { ...payload, videoId: '../bad' }),
  ).rejects.toThrow();
});
it('只有首次安装自动打开设置，更新和重载原因不打开；失败不假报成功', async () => {
  const openOptionsPage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { runtime: { openOptionsPage } });
  for (const reason of ['update', 'chrome_update', 'shared_module_update'])
    await firstInstall(reason);
  expect(openOptionsPage).not.toHaveBeenCalled();
  await firstInstall('install');
  expect(openOptionsPage).toHaveBeenCalledOnce();
  openOptionsPage.mockRejectedValueOnce(new Error('失败'));
  await expect(firstInstall('install')).rejects.toThrow('失败');
});
