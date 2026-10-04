import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const execute = promisify(execFile);
export function parseFolderResult(stdout: string): string | undefined {
  const result = z
    .object({
      folder: z.string().min(1).optional(),
      cancelled: z.boolean().optional(),
      error: z.string().optional(),
    })
    .parse(JSON.parse(stdout));
  if (result.error) throw new Error('选择文件夹失败，请重试');
  if (result.cancelled && !result.folder) return undefined;
  if (!result.folder || result.cancelled) throw new Error('文件夹选择结果无效');
  return result.folder;
}
export async function chooseFolder(): Promise<string | undefined> {
  if (process.platform === 'win32') {
    const { stdout } = await execute(
      fileURLToPath(new URL('./videonote-host.exe', import.meta.url)),
      ['--folder'],
      {
        timeout: 120000,
        maxBuffer: 16384,
        windowsHide: true,
        encoding: 'utf8',
      },
    );
    return parseFolderResult(stdout);
  }
  if (process.platform !== 'darwin') throw new Error('当前系统不支持目录选择');
  try {
    const { stdout } = await execute(
      '/usr/bin/osascript',
      [
        '-e',
        'POSIX path of (choose folder with prompt "选择 Obsidian 知识库或其中用于存放视频笔记的文件夹")',
      ],
      { timeout: 120000, maxBuffer: 16384 },
    );
    return stdout.trim();
  } catch (error) {
    if (error instanceof Error && error.message.includes('-128'))
      return undefined;
    throw new Error('选择文件夹失败或超时，请重试', { cause: error });
  }
}
