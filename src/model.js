import { getDomain } from 'tldts';

const names = { 'douyin.com': '抖音', 'zhihu.com': '知乎', 'bilibili.com': '哔哩哔哩', 'youtube.com': 'YouTube', 'google.com': 'Google', 'github.com': 'GitHub', 'figma.com': 'Figma', 'notion.so': 'Notion', 'taobao.com': '淘宝', 'xiaohongshu.com': '小红书' };
export function address(tab) { return tab.pendingUrl || tab.url || ''; }
export function eligible(tab, ownOrigin = '') {
  const url = address(tab);
  return Number.isInteger(tab.id) && !tab.incognito && url && !url.startsWith('chrome://newtab') && !url.startsWith('chrome://new-tab-page') && !(ownOrigin && url.startsWith(`${ownOrigin}/`));
}
export function siteFor(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return { key: parsed.protocol, name: parsed.protocol === 'file:' ? '本地文件' : '浏览器与其他页面', host: parsed.protocol };
    const host = getDomain(parsed.hostname, { allowPrivateDomains: true }) || parsed.hostname;
    return { key: host, name: names[host] || host, host };
  } catch { return { key: 'other', name: '其他页面', host: '其他' }; }
}
export function duplicateKey(tab) {
  try { const url = new URL(address(tab)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function duplicateSets(tabs) {
  const map = new Map();
  for (const tab of tabs) { const key = duplicateKey(tab); if (key) map.set(key, [...(map.get(key) || []), tab]); }
  return [...map.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(Boolean(b.active)) - Number(Boolean(a.active)) || (b.lastAccessed || 0) - (a.lastAccessed || 0) || a.id - b.id);
    return { key, keep: sorted[0], remove: sorted.slice(1) };
  });
}
export function groupsFor(tabs, query = '', mode = 'all') {
  const groups = new Map();
  for (const tab of tabs) {
    const site = siteFor(address(tab));
    if (!groups.has(site.key)) groups.set(site.key, { ...site, tabs: [] });
    groups.get(site.key).tabs.push(tab);
  }
  const needle = query.trim().toLocaleLowerCase();
  return [...groups.values()].map(group => ({ ...group, matched: group.tabs.filter(tab => (mode === 'all' || (mode === 'audible' ? tab.audible && !tab.mutedInfo?.muted : tab.pinned)) && `${group.name} ${tab.title || ''} ${address(tab)}`.toLocaleLowerCase().includes(needle)) })).filter(group => group.matched.length).sort((a, b) => b.tabs.length - a.tabs.length || a.name.localeCompare(b.name));
}
// 执行时重新核对地址，跳过已导航、已关闭或变成仪表盘的标签。
export async function closeSnapshot(api, snapshot, ownOrigin, duplicateOnly = false, onClosed = () => {}, protectPinned = false) {
  const current = (await api.list()).filter(tab => eligible(tab, ownOrigin));
  const byId = new Map(current.map(tab => [tab.id, tab]));
  const selected = new Set(snapshot.map(tab => tab.id));
  const results = { closed: 0, skipped: 0, failed: 0 };
  for (const original of snapshot) {
    const tab = byId.get(original.id);
    const hasSurvivor = !duplicateOnly || current.some(other => !selected.has(other.id) && duplicateKey(other) === duplicateKey(tab || {}) && duplicateKey(other));
    if (!tab || (protectPinned && tab.pinned) || address(tab) !== address(original) || !hasSurvivor) { results.skipped++; continue; }
    try { await api.remove(tab.id); results.closed++; onClosed({ ...tab }); } catch { results.failed++; }
  }
  return results;
}

// 所有网站共用同一份搜索结果，避免全选和展示范围不一致。
export function matchingTabs(tabs, query, mode = 'all') {
  return groupsFor(tabs, query, mode).flatMap(group => group.matched);
}
export function selectCurrentResults(selection, tabs, query, mode = 'all') {
  selection.clear();
  for (const tab of matchingTabs(tabs, query, mode)) selection.set(tab.id, address(tab));
}
