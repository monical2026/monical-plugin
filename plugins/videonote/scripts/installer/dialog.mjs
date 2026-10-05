import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
export function dialog(message, input = false) {
  let result;
  if (process.platform === 'darwin') {
    const literal = JSON.stringify(message);
    const script = input
      ? `text returned of (display dialog ${literal} default answer "" with title "VideoNote Obsidian 连接" buttons {"取消", "安装"} default button "安装")`
      : `display dialog ${literal} with title "VideoNote Obsidian 连接" buttons {"好"} default button "好"`;
    result = spawnSync('/usr/bin/osascript', ['-e', 'activate', '-e', script], {
      encoding: 'utf8',
      timeout: 300000,
    });
  } else {
    const code =
      `Add-Type -AssemblyName Microsoft.VisualBasic; Add-Type -AssemblyName System.Windows.Forms; $m=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(message).toString('base64')}')); ` +
      (input
        ? `[Console]::Write([Microsoft.VisualBasic.Interaction]::InputBox($m,'VideoNote Obsidian',''))`
        : `[void][System.Windows.Forms.MessageBox]::Show($m,'VideoNote Obsidian')`);
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
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stderr?.includes('-128')) return null;
    throw new Error('安装窗口无法打开或已超时，请重新双击安装程序');
  }
  return input ? result.stdout.trim() || null : true;
}
