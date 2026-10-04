import { stored, store } from './storage';
import { confirmRetry } from './retry-confirmation';
export async function guardedModelRequest<T>(
  identity: unknown,
  action: () => Promise<T>,
): Promise<T> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(identity)),
  );
  const key =
    'browserPendingAI:' +
    Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
  return navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('相同 AI 请求正在处理，请勿重复发送');
    if ((await stored(key)) && !(await confirmRetry()))
      throw new Error('已取消重发，原有笔记与内容保留');
    await store(key, { startedAt: Date.now() });
    const result = await action();
    await chrome.storage.local.remove(key);
    return result;
  });
}
