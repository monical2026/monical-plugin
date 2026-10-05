import { parse } from 'tldts';

// 仅把公开 DNS 主机名交给图标服务；不发送路径、查询、端口或本机/IP 地址。
export function publicIconSource(pageUrl) {
  try {
    const page = new URL(pageUrl);
    if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password) return null;
    const host = page.hostname.toLowerCase().replace(/\.$/, '');
    const parsed = parse(host, { allowPrivateDomains: true });
    if (parsed.isIp || !parsed.domain || !(parsed.isIcann || parsed.isPrivate)) return null;
    const source = new URL('https://t0.gstatic.com/faviconV2');
    source.searchParams.set('client', 'SOCIAL');
    source.searchParams.set('type', 'FAVICON');
    source.searchParams.set('fallback_opts', 'TYPE,SIZE,URL');
    source.searchParams.set('url', `https://${host}`);
    source.searchParams.set('size', '64');
    return source.href;
  } catch { return null; }
}
export function createPublicIconLoader({ fetchImage = fetch, decode }) {
  return async pageUrl => {
    const source = publicIconSource(pageUrl);
    if (!source) return null;
    const response = await fetchImage(source, {
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    // 该服务未收录时可能随 404 返回默认图片，禁止降级到 <img> 把它当成功。
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
    const blob = await response.blob();
    if (!blob.size || blob.size > 512 * 1024) return null;
    return decode(blob);
  };
}
