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
it.each(['granted', 'prompt', 'denied'] as const)(
  '旧目录权限 %s 也不能绕过本机连接写入',
  async (permission) => {
    const { directory, files } = folder(permission);
    vi.mocked(rememberedDirectory).mockResolvedValue(directory);
    await expect(browserObsidian('status', undefined)).rejects.toThrow(
      '已停用',
    );
    await expect(browserObsidian('export', payload)).rejects.toThrow('已停用');
    expect(files.size).toBe(0);
    expect(rememberedDirectory).not.toHaveBeenCalled();
    expect(directory.requestPermission).not.toHaveBeenCalled();
  },
);
it('未连接时也明确拒绝旧入口，未知动作不能通过协议', async () => {
  vi.mocked(rememberedDirectory).mockResolvedValue(null);
  await expect(browserObsidian('export', payload)).rejects.toThrow('连接组件');
  expect(() =>
    requestSchema.parse({ type: 'browserObsidian', action: 'delete' }),
  ).toThrow();
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
