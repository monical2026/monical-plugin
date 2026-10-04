import { it, expect, vi, afterEach } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import {
  apiUrl,
  requestJson,
} from '../../extension/src/browser-service/network';
afterEach(() => vi.unstubAllGlobals());
it('拒绝 HTTP、账号、重定向式参数、IP 与本地域名', () => {
  for (const base of [
    'http://api.example.com',
    'https://a:b@api.example.com',
    'https://api.example.com?key=x',
    'https://127.0.0.1',
    'https://[::1]',
    'https://box.local',
    'https://localhost',
    'https://api.example.com:8443',
  ])
    expect(() => apiUrl(base)).toThrow();
  expect(apiUrl('https://api.example.com/v1', 'models').href).toBe(
    'https://api.example.com/v1/models',
  );
});
it('权限拒绝不发送密钥，请求禁止重定向与 Cookie，错误不回显正文', async () => {
  const { chrome } = fakeChrome();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  chrome.permissions.contains.mockResolvedValueOnce(false);
  await expect(
    requestJson(apiUrl('https://api.example.com'), {
      Authorization: 'fixture',
    }),
  ).rejects.toThrow('授权');
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(
    new Response('SECRET_SERVER_DETAIL', { status: 401 }),
  );
  await expect(
    requestJson(
      apiUrl('https://api.example.com'),
      { Authorization: 'fixture' },
      { x: 1 },
    ),
  ).rejects.toThrow('HTTP 401');
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    redirect: 'error',
    method: 'POST',
  });
  fetch.mockResolvedValueOnce(new Response('{"ok":true}'));
  expect(await requestJson(apiUrl('https://api.example.com'), {})).toEqual({
    ok: true,
  });
});
