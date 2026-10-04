import type { AnalysisTrace } from '../../../shared/src/ai/analysis-diagnostics';
// 浏览器无法像 Node 一样钉住 DNS 地址：仅允许用户授予权限的公开 HTTPS 主机，拒绝 IP 和本地域名。
export function apiUrl(base: string, path = '') {
  const url = new URL(base);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== '443') ||
    !host.includes('.') ||
    host.endsWith('.') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    host.startsWith('[') ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
  )
    throw new Error(
      '浏览器模式仅支持公开 HTTPS 服务域名，不能使用本机、IP 或私网地址',
    );
  url.pathname =
    url.pathname.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
  return url;
}
export async function authorizeServices(bases: string[]) {
  const origins = [...new Set(bases.map((base) => `${apiUrl(base).origin}/*`))];
  if (origins.length && !(await chrome.permissions.request({ origins })))
    throw new Error('未授权服务网站访问，未发送请求或保存设置');
}
export async function requestJson(
  url: URL,
  headers: Record<string, string>,
  body?: unknown,
  timeout = 90000,
  trace?: AnalysisTrace,
): Promise<unknown> {
  trace?.('network.permission');
  apiUrl(url.origin);
  if (!(await chrome.permissions.contains({ origins: [`${url.origin}/*`] })))
    throw new Error('尚未授权此服务，请到设置页测试连接或保存设置');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    trace?.('network.send');
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    trace?.('network.response', { status: response.status });
    if (!response.ok)
      throw new Error(
        `外部服务返回 HTTP ${response.status}，请检查服务配置、权限或额度`,
      );
    if (!response.body) throw new Error('外部服务未返回内容');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('服务响应超过限制');
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    trace?.('network.body', { characters: length });
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error('外部服务未返回有效 JSON');
    }
  } catch (error) {
    trace?.(controller.signal.aborted ? 'network.timeout' : 'network.failed');
    if (error instanceof TypeError || controller.signal.aborted)
      throw new Error(
        '服务连接失败或超时，未自动重试；请检查网络、授权与服务地址',
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
