import {
  readFile,
  mkdir,
  writeFile,
  copyFile,
  chmod,
  rename,
} from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
export function registration(previous, extensionId, executable) {
  if (!/^[a-p]{32}$/.test(extensionId))
    throw new Error('连接编号应为 32 位小写字母，请从插件导出窗口重新复制');
  const origins = Array.isArray(previous?.allowed_origins)
    ? previous.allowed_origins.filter(
        (value) =>
          typeof value === 'string' &&
          /^chrome-extension:\/\/[a-p]{32}\/$/.test(value),
      )
    : [];
  return {
    name: 'com.youtube_note.host',
    description: 'VideoNote 本机连接',
    path: executable,
    type: 'stdio',
    allowed_origins: [
      ...new Set([...origins, `chrome-extension://${extensionId}/`]),
    ],
  };
}
export async function installFiles({
  source,
  destination,
  extensionId,
  platform,
  home,
  windowsRoot,
}) {
  const manifest = join(destination, 'host-registration.json');
  let previous;
  try {
    previous = JSON.parse(await readFile(manifest, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new Error('原连接注册信息无法读取，未覆盖，请检查安装', {
        cause: error,
      });
  }
  const executable = join(
    destination,
    platform === 'win32' ? 'videonote-host.exe' : 'launch.sh',
  );
  const config = registration(previous, extensionId, executable);
  const files =
    platform === 'win32'
      ? ['node.exe', 'host.mjs', 'videonote-host.exe']
      : ['node', 'host.mjs', 'keychain-bridge'];
  // 核对所有输入后才修改安装目录，配置、凭据及导出目标均不覆盖。
  for (const file of files) await readFile(join(source, file));
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const file of files) {
    const temporary = join(destination, file + '.installing');
    await copyFile(join(source, file), temporary);
    if (platform === 'darwin') await chmod(temporary, 0o700);
    await rename(temporary, join(destination, file));
  }
  if (platform === 'darwin') {
    const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
    await writeFile(
      executable,
      `#!/bin/sh\nexec ${quote(join(destination, 'node'))} ${quote(join(destination, 'host.mjs'))} "$@"\n`,
      { mode: 0o700 },
    );
  }
  await writeFile(manifest + '.installing', JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  await rename(manifest + '.installing', manifest);
  if (platform === 'darwin') {
    const hosts = join(
      home,
      'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    );
    await mkdir(hosts, { recursive: true });
    await copyFile(manifest, join(hosts, 'com.youtube_note.host.json'));
  } else {
    const result = spawnSync(
      join(windowsRoot, 'System32/reg.exe'),
      [
        'ADD',
        'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.youtube_note.host',
        '/ve',
        '/t',
        'REG_SZ',
        '/d',
        manifest,
        '/f',
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (result.error || result.status !== 0)
      throw new Error('连接注册失败，请检查当前用户注册表权限后重试');
  }
}
