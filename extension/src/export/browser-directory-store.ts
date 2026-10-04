import type { ExportDirectory } from './browser-obsidian';
import { store } from '../browser-service/storage';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('videonote-file-access', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('targets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('无法打开知识库连接记录，原笔记未改动'));
  });
}
async function access(
  mode: IDBTransactionMode,
  handle?: ExportDirectory,
): Promise<unknown> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('targets', mode);
      const store = tx.objectStore('targets');
      const request =
        mode === 'readwrite'
          ? store.put(handle, 'obsidian')
          : store.get('obsidian');
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () =>
        reject(new Error('知识库连接保存或读取失败，请重试；原笔记未改动'));
      tx.onerror = () =>
        reject(new Error('知识库连接保存或读取失败，请重试；原笔记未改动'));
    });
  } finally {
    db.close();
  }
}
export async function rememberDirectory(handle: ExportDirectory) {
  await access('readwrite', handle);
  await store('browserObsidianConnection', {
    name: handle.name,
    updatedAt: Date.now(),
  });
}
export async function rememberedDirectory(): Promise<ExportDirectory | null> {
  const value = await access('readonly');
  if (value === undefined) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('queryPermission' in value) ||
    typeof value.queryPermission !== 'function' ||
    !('requestPermission' in value) ||
    typeof value.requestPermission !== 'function' ||
    !('getFileHandle' in value) ||
    typeof value.getFileHandle !== 'function' ||
    !('values' in value) ||
    typeof value.values !== 'function'
  )
    throw new Error('保存的知识库连接不可用，请重新连接文件夹');
  return value as ExportDirectory;
}
