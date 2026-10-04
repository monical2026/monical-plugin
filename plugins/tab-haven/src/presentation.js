const tones = ['#e6ece6', '#e9eaf4', '#f2e6df', '#e1ebf2', '#f1e9d6', '#ede6ed'];
export function siteTone(key) {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}
// 首次按网站名称排序，此后新网站追加，数量和搜索不改变既有次序。
export function retainOrder(groups, order) {
  const unseen = groups.filter(group => !order.includes(group.key)).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  order.push(...unseen.map(group => group.key));
  const positions = new Map(order.map((key, index) => [key, index]));
  return [...groups].sort((a, b) => positions.get(a.key) - positions.get(b.key));
}
export function faviconSource(pageUrl, runtime) {
  try {
    if (!['http:', 'https:'].includes(new URL(pageUrl).protocol) || !runtime) return null;
    const url = new URL(runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '32');
    return url.href;
  } catch { return null; }
}
