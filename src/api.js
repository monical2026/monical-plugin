export const isExtension = Boolean(globalThis.chrome?.tabs?.query && globalThis.chrome?.runtime?.id);
const sample = [
  ['douyin.com/video/101', '城市散步｜把日常过成电影', 1], ['douyin.com/video/102', '周末做一份好吃的早餐', 1], ['douyin.com/video/101', '城市散步｜把日常过成电影', 2], ['douyin.com/video/103', '值得收藏的旅行目的地', 1],
  ['zhihu.com/question/123', '有哪些让生活变得更好的小习惯？', 1], ['zhihu.com/question/456', '如何建立自己的知识体系？', 2], ['zhihu.com/question/123', '有哪些让生活变得更好的小习惯？', 2],
  ['github.com/explore', 'Explore · GitHub', 1], ['github.com/trending', 'Trending repositories on GitHub', 1],
  ['bilibili.com/video/BV1', '一个安静的下午，和一本书', 2], ['bilibili.com/video/BV2', '从零开始理解设计', 2],
  ['figma.com/community', 'Figma Community', 1], ['notion.so/workspace', '我的灵感笔记', 2],
];
let demoTabs = sample.map(([path, title, windowId], index) => ({ id: index + 1, url: `https://${path}`, title, windowId, active: index === 0, pinned: false }));
const listeners = new Set();
export const api = isExtension ? {
  list: () => chrome.tabs.query({ windowType: 'normal' }),
  remove: id => chrome.tabs.remove(id),
  async activate(tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); },
  subscribe(callback) {
    const events = [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onActivated, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.windows.onRemoved];
    events.forEach(event => event.addListener(callback));
    return () => events.forEach(event => event.removeListener(callback));
  },
} : {
  list: async () => [...demoTabs],
  async remove(id) { demoTabs = demoTabs.filter(tab => tab.id !== id); listeners.forEach(fn => fn()); },
  async activate() { /* 演示模式不操作真实标签。 */ },
  subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
};
