import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import {
  writeBrowserObsidian,
  pickExportDirectory,
  type ExportDirectory,
} from '../../extension/src/export/browser-obsidian';
const input = {
  videoId: 'abcdefghijk',
  title: '视频:标题',
  markdown: '# 个人笔记',
};
beforeEach(() => fakeChrome());
afterEach(() => vi.unstubAllGlobals());
function folder() {
  const files = new Map<string, string>();
  let fail = false;
  const abort = vi.fn(async () => {});
  const directory: ExportDirectory = {
    name: '学习笔记',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    async *values() {
      for (const name of files.keys()) yield { kind: 'file', name };
    },
    async getFileHandle(name, options) {
      if (!files.has(name) && !options?.create)
        throw new DOMException('', 'NotFoundError');
      return {
        async createWritable() {
          let pending = '';
          return {
            async write(text) {
              if (fail) throw new Error('磁盘写入失败');
              pending = text;
            },
            async close() {
              files.set(name, pending);
            },
            abort,
          };
        },
      };
    },
  };
  return {
    directory,
    files,
    abort,
    fail: () => {
      fail = true;
    },
  };
}
it('首次导出写入中文 Markdown，同视频改标题仍提示重复，确认只生成副本', async () => {
  const state = folder();
  expect(
    await writeBrowserObsidian(state.directory, input, false),
  ).toMatchObject({ status: 'saved' });
  expect([...state.files.values()]).toEqual(['# 个人笔记']);
  expect(
    await writeBrowserObsidian(
      state.directory,
      { ...input, title: '改标题' },
      false,
    ),
  ).toMatchObject({ status: 'duplicate' });
  expect(state.files.size).toBe(1);
  await writeBrowserObsidian(
    state.directory,
    { ...input, markdown: '新内容' },
    true,
  );
  expect([...state.files.values()]).toEqual(['# 个人笔记', '新内容']);
});
it('两个导出页同时保存同视频，只有一次首次写入，不覆盖旧文件', async () => {
  const state = folder();
  const result = await Promise.all([
    writeBrowserObsidian(state.directory, input, false),
    writeBrowserObsidian(state.directory, input, false),
  ]);
  expect(result.map((r) => r.status)).toEqual(['saved', 'duplicate']);
  expect(state.files.size).toBe(1);
});
it('写入失败不报告成功，调用 abort，已有文件保持不变', async () => {
  const state = folder();
  await writeBrowserObsidian(state.directory, input, false);
  state.fail();
  await expect(
    writeBrowserObsidian(state.directory, input, true),
  ).rejects.toThrow('磁盘写入失败');
  expect(state.abort).toHaveBeenCalledOnce();
  expect([...state.files.values()]).toEqual(['# 个人笔记']);
});
it('选择文件夹直接调用浏览器 picker，取消不会调用本机组件', async () => {
  const picker = vi.fn().mockRejectedValue(new DOMException('', 'AbortError'));
  vi.stubGlobal('window', { showDirectoryPicker: picker });
  const pending = pickExportDirectory();
  expect(picker).toHaveBeenCalledWith({
    mode: 'readwrite',
    id: 'videonote-obsidian',
  });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it('文件列表权限失败原样报错，不尝试创建或覆盖文件', async () => {
  const state = folder();
  state.directory.values = async function* () {
    throw new DOMException('denied', 'NotAllowedError');
    yield { kind: '', name: '' };
  };
  const create = vi.spyOn(state.directory, 'getFileHandle');
  await expect(
    writeBrowserObsidian(state.directory, input, false),
  ).rejects.toMatchObject({ name: 'NotAllowedError' });
  expect(create).not.toHaveBeenCalled();
});
