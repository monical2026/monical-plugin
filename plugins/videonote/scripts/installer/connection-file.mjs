import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
export function parseConnectionFile(text) {
  if (Buffer.byteLength(text) > 4096)
    throw new Error('连接文件过大，请从插件重新下载');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('不是有效连接文件，请从插件重新下载');
  }
  if (
    value?.kind !== 'videonote-connection' ||
    value.version !== 1 ||
    typeof value.extensionId !== 'string' ||
    !/^[a-p]{32}$/.test(value.extensionId)
  )
    throw new Error('连接文件不正确，请从 VideoNote 导出窗口重新下载');
  return value.extensionId;
}
export async function chooseConnectionFile() {
  let result;
  if (process.platform === 'darwin') {
    result = spawnSync(
      '/usr/bin/osascript',
      [
        '-e',
        'activate',
        '-e',
        'POSIX path of (choose file with prompt "选择从 VideoNote 下载的 VideoNote-connection.json 连接文件" of type {"public.json"})',
      ],
      { encoding: 'utf8', timeout: 300000 },
    );
    if (result.status !== 0 && result.stderr?.includes('-128')) return null;
  } else {
    const code = `Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='VideoNote: select VideoNote-connection.json'; $d.Filter='VideoNote connection (*.json)|*.json'; if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.FileName)}`;
    result = spawnSync(
      join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-STA',
        '-EncodedCommand',
        Buffer.from(code, 'utf16le').toString('base64'),
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 300000 },
    );
  }
  if (result.error || result.status !== 0)
    throw new Error('连接文件选择窗口未正常完成，请重新安装', {
      cause: result.error,
    });
  const file = result.stdout.trim();
  if (!file) return null;
  if ((await stat(file)).size > 4096)
    throw new Error('连接文件过大，请从插件重新下载');
  return parseConnectionFile(await readFile(file, 'utf8'));
}
