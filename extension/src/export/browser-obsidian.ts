import { z } from 'zod';
import { safeTitle } from '../../../shared/src/export-filename';
import { videoIdSchema } from '@youtube-note/shared';
export const browserExportSchema = z.object({
  videoId: videoIdSchema,
  title: z.string().max(1000),
  markdown: z.string().max(6_000_000),
});
export type BrowserExport = z.infer<typeof browserExportSchema>;
export interface ExportDirectory {
  name: string;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  values(): AsyncIterable<{ kind: string; name: string }>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{
      write(text: string): Promise<void>;
      close(): Promise<void>;
      abort(): Promise<void>;
    }>;
  }>;
}
export function pickExportDirectory(): Promise<ExportDirectory> {
  const host = window as Window & {
    showDirectoryPicker?: (options: {
      mode: 'readwrite';
      id: string;
    }) => Promise<ExportDirectory>;
  };
  if (!host.showDirectoryPicker)
    return Promise.reject(
      new Error('当前浏览器不支持文件夹授权，请改用“下载文件”保存 Markdown。'),
    );
  return host.showDirectoryPicker({
    mode: 'readwrite',
    id: 'videonote-obsidian',
  });
}
export async function writeBrowserObsidian(
  directory: ExportDirectory,
  input: BrowserExport,
  copy: boolean,
) {
  const request = browserExportSchema.parse(input);
  return navigator.locks.request(
    'videonote:browser-obsidian-write',
    async () => {
      const files: string[] = [];
      for await (const entry of directory.values())
        if (entry.kind === 'file') files.push(entry.name);
      const identity = `[${request.videoId}]`;
      const existing = files.filter(
        (name) => name.includes(identity) && name.endsWith('.md'),
      );
      if (existing.length && !copy)
        return { status: 'duplicate' as const, files: existing.slice(0, 5) };
      const stem = `${safeTitle(request.title)} ${identity}`;
      for (let n = existing.length ? 1 : 0; n < 10000; n++) {
        const filename = `${stem}${n ? (n === 1 ? '（副本）' : `（副本 ${n}）`) : ''}.md`;
        if (files.includes(filename)) continue;
        // 浏览器没有 exclusive-create；写入前再次检查，不覆盖已存在的文件。
        try {
          await directory.getFileHandle(filename);
          if (!copy) return { status: 'duplicate' as const, files: [filename] };
          continue;
        } catch (error) {
          if (
            !(error instanceof DOMException) ||
            error.name !== 'NotFoundError'
          )
            throw error;
        }
        const file = await directory.getFileHandle(filename, { create: true });
        const writable = await file.createWritable();
        try {
          await writable.write(request.markdown);
          await writable.close();
        } catch (error) {
          try {
            await writable.abort();
          } catch {
            /* 原写入错误优先；未报告保存成功。 */
          }
          throw error;
        }
        return { status: 'saved' as const, filename };
      }
      throw new Error('同名副本过多，请更换目标文件夹');
    },
  );
}
