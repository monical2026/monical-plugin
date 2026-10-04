import { homedir } from 'node:os';
import { join, win32 } from 'node:path';
export function nativeDirectory(
  platform = process.platform,
  home = homedir(),
  localAppData = process.env.LOCALAPPDATA,
) {
  if (platform === 'darwin')
    return join(home, 'Library', 'Application Support', 'YouTubeNote');
  if (platform === 'win32')
    return win32.join(
      localAppData || win32.join(home, 'AppData', 'Local'),
      'VideoNote',
    );
  throw new Error('本机组件目前仅支持 macOS 和 Windows');
}
export function credentialCommand(
  executable: string,
  platform = process.platform,
) {
  if (platform === 'darwin') return { executable, args: [] as string[] };
  if (platform === 'win32') return { executable, args: ['--credentials'] };
  throw new Error('当前系统不支持凭据组件');
}
