// 常用入口不使用 Chrome 历史 favicon 缓存：缺失时它会返回可加载的地球图。
const bundled = {
  'bilibili.com': 'bilibili.ico', 'douyin.com': 'douyin.ico',
  'zhihu.com': 'zhihu.ico', 'youtube.com': 'youtube.png', 'reddit.com': 'reddit.png',
};
const cacheKey = 'tab-haven-shortcut-icons-v1';
export function bundledIcon(pageUrl, runtime) {
  try {
    const url = new URL(pageUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const entry = Object.entries(bundled).find(([host]) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (!entry) return null;
    const path = `/site-icons/${entry[1]}`;
    return runtime ? runtime.getURL(path) : path;
  } catch { return null; }
}
export function safeIconUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function directIconCandidates(pageUrl) {
  const safe = safeIconUrl(pageUrl);
  return safe ? ['/favicon.ico', '/apple-touch-icon.png', '/favicon.png'].map(path => new URL(path, safe).href) : [];
}
export function declaredIconCandidates(html, pageUrl, Parser = DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html');
  const base = safeIconUrl(doc.querySelector('base[href]')?.getAttribute('href') || pageUrl, pageUrl) || pageUrl;
  return [...new Set([...doc.querySelectorAll('link[rel][href]')]
    .filter(link => /(?:^|\s)(?:icon|apple-touch-icon|apple-touch-icon-precomposed)(?:\s|$)/i.test(link.getAttribute('rel')))
    .map(link => safeIconUrl(link.getAttribute('href'), base)).filter(Boolean))].slice(0, 6);
}
function validCached(value) {
  return typeof value === 'string' && value.length <= 65536 &&
    (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) || Boolean(safeIconUrl(value)));
}
export function createIconResolver({ storage, runtime, load, discover = async () => [], now = Date.now }) {
  const pending = new Map(), failures = new Map(), ready = new Map();
  function read() {
    try { const value = JSON.parse(storage.getItem(cacheKey)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  }
  function forget(url) {
    try { const cache = read(); delete cache[url]; storage.setItem(cacheKey, JSON.stringify(cache)); } catch { /* 图标缓存不可写不影响快捷入口。 */ }
    failures.delete(url); ready.delete(url);
  }
  function save(url, source) {
    if (!validCached(source)) return;
    try {
      const cache = read(); delete cache[url]; cache[url] = source;
      storage.setItem(cacheKey, JSON.stringify(Object.fromEntries(Object.entries(cache).slice(-64))));
    } catch { /* 配额不足时仍显示刚刚取得的图标。 */ }
  }
  async function resolve(url, { candidates = [], refresh = false } = {}) {
    const local = bundledIcon(url, runtime);
    if (local) return local;
    if (pending.has(url)) {
      if (!refresh) return pending.get(url);
      await pending.get(url);
    }
    if (refresh) forget(url);
    if (ready.has(url)) return ready.get(url);
    if (!refresh && (failures.get(url) || 0) > now()) return null;
    const work = (async () => {
      const cached = read()[url];
      const sources = [...new Set([validCached(cached) ? cached : null, ...candidates.filter(value => safeIconUrl(value)), ...directIconCandidates(url)].filter(Boolean))];
      for (const source of sources) {
        try { const result = await load(source); if (validCached(result)) { save(url, result); failures.delete(url); ready.set(url, result); return result; } }
        catch { /* 当前来源不可用则继续尝试。 */ }
      }
      // 常见地址都无效时，尝试网页声明；跨域不允许时由用户重取并授权。
      if (!candidates.length) {
        try {
          for (const source of (await discover(url)).filter(value => safeIconUrl(value)).slice(0, 6)) {
            if (sources.includes(source)) continue;
            try { const result = await load(source); if (validCached(result)) { save(url, result); ready.set(url, result); return result; } }
            catch { /* 继续尝试下一个声明。 */ }
          }
        } catch { /* 无授权或网站不可访问，保留可重试状态。 */ }
      }
      forget(url); failures.set(url, now() + 60_000); return null;
    })();
    pending.set(url, work);
    try { return await work; } finally { pending.delete(url); }
  }
  return { resolve, forget };
}
function imageLoaded(source) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('图标加载超时')); }, 3500);
    image.onload = () => { clearTimeout(timer); image.naturalWidth > 1 && image.naturalHeight > 1 ? resolve(image) : reject(new Error('图标无效')); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('图标不可用')); };
    image.src = source;
  });
}
function rasterize(image) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
  const scale = Math.min(48 / image.naturalWidth, 48 / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  canvas.getContext('2d').drawImage(image, (48 - w) / 2, (48 - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}
export async function loadWebsiteIcon(source) {
  if (source.startsWith('data:')) { await imageLoaded(source); return source; }
  // CORS 或已授予的网站权限允许时保存图片本身，避免下次依赖网络。
  try {
    const response = await fetch(source, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error('获取失败');
    const blob = await response.blob();
    if (blob.size > 512 * 1024) throw new Error('图标过大');
    const objectUrl = URL.createObjectURL(blob);
    try { return rasterize(await imageLoaded(objectUrl)); } finally { URL.revokeObjectURL(objectUrl); }
  } catch { /* 跨域图片可以展示，但不允许读取像素时只保存图标地址。 */ }
  await imageLoaded(source);
  return source;
}
export async function discoverWebsiteIcons(pageUrl) {
  const response = await fetch(pageUrl, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('网站暂时无法访问');
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('网页过大');
  return declaredIconCandidates(html, response.url || pageUrl);
}
