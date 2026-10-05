import { expect, it, vi, afterEach } from 'vitest';
import { parseConnectionFile } from '../../scripts/installer/connection-file.mjs';
import { downloadObsidianConnection } from '../../extension/src/background/obsidian-connection-file';
import { requestSchema } from '../../shared/src';
afterEach(() => vi.unstubAllGlobals());
it('下载的文件直接被安装器解析，编号只取当前扩展，无需剪贴板或可编辑框', async () => {
  const id = 'a'.repeat(32);
  const download = vi.fn(async () => 1);
  vi.stubGlobal('chrome', { runtime: { id }, downloads: { download } });
  expect(await downloadObsidianConnection()).toBe(1);
  const request = download.mock.calls[0][0];
  expect(request.filename).toBe('VideoNote-connection.json');
  expect(
    parseConnectionFile(decodeURIComponent(request.url.split(',')[1])),
  ).toBe(id);
  expect(
    requestSchema.parse({
      type: 'downloadObsidianConnection',
      extensionId: 'malicious',
    }),
  ).toEqual({ type: 'downloadObsidianConnection' });
});
it.each([
  '{}',
  'bad',
  JSON.stringify({
    kind: 'videonote-connection',
    version: 1,
    extensionId: 'arbitrary',
  }),
  JSON.stringify({
    kind: 'videonote-connection',
    version: 2,
    extensionId: 'a'.repeat(32),
  }),
])('非法连接文件不注册：%s', (text) => {
  expect(() => parseConnectionFile(text)).toThrow();
});
it('取消下载不报告成功；真正的错误继续报错', async () => {
  const download = vi
    .fn()
    .mockRejectedValueOnce(new Error('User canceled'))
    .mockRejectedValueOnce(new Error('permission'));
  vi.stubGlobal('chrome', {
    runtime: { id: 'a'.repeat(32) },
    downloads: { download },
  });
  expect(await downloadObsidianConnection()).toBeNull();
  await expect(downloadObsidianConnection()).rejects.toThrow('permission');
});
