// 随包图标、已保存图片与网络发现协同工作，浏览器缓存只作为经校验的备用来源。
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
  return safe ? ['/favicon.ico', '/apple-touch-icon.png', '/favicon.png', '/favicon.svg'].map(path => new URL(path, safe).href) : [];
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
export function createIconResolver({ storage, runtime, load, discover = async () => [], browserIcon = async () => null, publicIcon = async () => null, now = Date.now }) {
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
    if (refresh) { ready.delete(url); failures.delete(url); }
    if (ready.has(url)) return ready.get(url);
    if (!refresh && (failures.get(url) || 0) > now()) return null;
    const work = (async () => {
      const cached = read()[url];
      if (!refresh && validCached(cached)) {
        try { const result = await load(cached); if (validCached(result)) { ready.set(url, result); return result; } }
        catch { /* 缓存失效后继续查找。 */ }
      }
      const sources = [...new Set([...candidates.filter(value => safeIconUrl(value)), ...directIconCandidates(url)].filter(Boolean))];
      try {
        const browser = await browserIcon(url);
        if (validCached(browser)) { save(url, browser); ready.set(url, browser); return browser; }
      } catch { /* 没有真实缓存图标时继续从网站取得，不把地球图视为成功。 */ }
      async function firstAvailable(addresses) {
        try {
          return await Promise.any(addresses.map(async source => {
            const result = await load(source);
            if (!validCached(result)) throw new Error('图标无效');
            return result;
          }));
        } catch { return null; }
      }
      const direct = await firstAvailable(sources);
      if (direct) { save(url, direct); ready.set(url, direct); return direct; }
      // 同一批候选并发尝试，避免四个慢地址串行阻塞后备服务。
      if (!candidates.length) {
        try {
          const declared = (await discover(url)).filter(value => safeIconUrl(value) && !sources.includes(value)).slice(0, 6);
          const result = await firstAvailable(declared);
          if (result) { save(url, result); ready.set(url, result); return result; }
        } catch { /* 无授权或网站不可访问，继续尝试后备。 */ }
      }
      if (refresh && validCached(cached)) {
        try { const previous = await load(cached); if (validCached(previous)) { ready.set(url, previous); return previous; } }
        catch { /* 旧图标也无法显示时保留记录，后续仍可重试。 */ }
      }
      try {
        const result = await publicIcon(url);
        if (validCached(result)) { save(url, result); ready.set(url, result); return result; }
      } catch { /* 后备服务不可达时保留文字入口和重试。 */ }
      failures.set(url, now() + 60_000); return null;
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
    return await decodeIconBlob(blob);
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

// 扩展 favicon 接口会把“没有图标”返回为成功的默认图片。
// 与保留 .invalid 域名得到的默认图比较，不能仅检查 HTTP 状态或 onload。
export function createBrowserIconLoader(runtime, { fetchImage = fetch, decode = loadWebsiteIcon } = {}) {
  let missing;
  function source(pageUrl) {
    const url = new URL(runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl); url.searchParams.set('size', '32');
    url.searchParams.set('fallbackToHost', '1');
    return url.href;
  }
  async function bytes(url) {
    const result = await fetchImage(url, { signal: AbortSignal.timeout(3500) });
    if (!result.ok) throw new Error('浏览器图标不可用');
    return new Uint8Array(await result.arrayBuffer());
  }
  return async pageUrl => {
    if (!runtime || !safeIconUrl(pageUrl)) return null;
    if (!missing) missing = bytes(source('https://tab-haven-missing.invalid/')).catch(error => { missing = null; throw error; });
    const [fallback, actual] = await Promise.all([missing, bytes(source(pageUrl))]);
    if (actual.length === fallback.length && actual.every((byte, i) => byte === fallback[i])) return null;
    const result = await decode(source(pageUrl));
    return result.startsWith('data:image/png;base64,') ? result : null;
  };
}

export async function decodeIconBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);
  try { return rasterize(await imageLoaded(objectUrl)); } finally { URL.revokeObjectURL(objectUrl); }
}
