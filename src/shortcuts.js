export const defaultShortcuts = [
  { name: '哔哩哔哩', url: 'https://www.bilibili.com/' },
  { name: '抖音', url: 'https://www.douyin.com/' },
  { name: '知乎', url: 'https://www.zhihu.com/' },
  { name: 'YouTube', url: 'https://www.youtube.com/' },
];
export function homepage(value) {
  const text = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error('请输入有效的网站地址，例如 https://www.bilibili.com');
  return `${url.origin}/`;
}
export function addShortcut(items, name, value) {
  const url = homepage(value);
  if (!name.trim() || name.trim().length > 30) throw new Error('名称请填写 1–30 个字');
  if (items.some(item => item.url === url)) throw new Error('这个网站首页已经在左侧了');
  return [...items, { name: name.trim(), url }];
}
export async function openHomepage(api, value) {
  const url = homepage(value);
  const existing = (await api.list()).find(tab => !tab.incognito && (tab.pendingUrl || tab.url) === url);
  if (existing) { await api.activate(existing); return 'reused'; }
  await api.create(url);
  return 'created';
}
