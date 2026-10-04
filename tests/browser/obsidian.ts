// 真实 OPFS 目录及 IndexedDB 句柄持久化；仅目录选择与 Chrome session 为夹具。
const id = '12345678-1234-4234-8234-123456789012';
history.replaceState(null, '', `?request=${id}`);
const values: Record<string, unknown> = {
  ['obsidian-export:' + id]: {
    createdAt: Date.now(),
    payload: {
      videoId: 'abcdefghijk',
      title: '浏览器导出验证',
      markdown: '# 测试笔记\n完整正文',
    },
  },
};
const root = await navigator.storage.getDirectory();
const directory = await root.getDirectoryHandle('videonote-export-test', {
  create: true,
});
Object.assign(window, {
  exportFixture: { directory },
  showDirectoryPicker: async () => directory,
});
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: { async setAccessLevel() {}, async set() {} },
      session: {
        async setAccessLevel() {},
        async get(key: string) {
          return { [key]: values[key] };
        },
        async remove(key: string) {
          delete values[key];
        },
      },
    },
  },
});
await import('../../extension/src/export/BrowserObsidianPage');
export {};
