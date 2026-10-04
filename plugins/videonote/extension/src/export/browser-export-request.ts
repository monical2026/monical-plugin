import { browserExportSchema, type BrowserExport } from './browser-obsidian';
import { trustedStorage } from '../browser-service/storage';
import { z } from 'zod';
const prefix = 'obsidian-export:';
const requestSchema = z.object({
  createdAt: z.number(),
  payload: browserExportSchema,
});
export async function openBrowserExport(
  input: BrowserExport,
  changeTarget = false,
) {
  const payload = browserExportSchema.parse(input);
  await trustedStorage();
  const pending = await chrome.storage.session.get(null);
  const expired = Object.entries(pending).flatMap(([key, value]) => {
    if (!key.startsWith(prefix)) return [];
    const parsed = requestSchema.safeParse(value);
    return !parsed.success ||
      Date.now() - parsed.data.createdAt > 30 * 60 * 1000
      ? [key]
      : [];
  });
  if (expired.length) await chrome.storage.session.remove(expired);
  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    [prefix + id]: { createdAt: Date.now(), payload },
  });
  try {
    await chrome.tabs.create({
      url: chrome.runtime.getURL(
        `obsidian.html?request=${id}${changeTarget ? '&changeTarget=1' : ''}`,
      ),
    });
  } catch (error) {
    await chrome.storage.session.remove(prefix + id);
    throw error;
  }
}
export async function takeBrowserExport(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new Error('导出请求无效，请从原视频重新打开导出。');
  await trustedStorage();
  const result = requestSchema.safeParse(
    (await chrome.storage.session.get(prefix + id))[prefix + id],
  );
  if (!result.success || Date.now() - result.data.createdAt > 30 * 60 * 1000)
    throw new Error('导出请求已过期，请从原视频重新打开导出。');
  return result.data.payload;
}
export async function clearBrowserExport(id: string) {
  await chrome.storage.session.remove(prefix + id);
}
