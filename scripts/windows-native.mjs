import { access, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
export async function buildWindowsNative(root, quiet = false) {
  const windows = process.env.SystemRoot || 'C:\\Windows';
  let compiler;
  for (const framework of ['Framework64', 'Framework']) {
    const candidate = join(
      windows,
      'Microsoft.NET',
      framework,
      'v4.0.30319',
      'csc.exe',
    );
    try {
      await access(candidate);
      compiler = candidate;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!compiler) throw new Error('需要 Windows .NET Framework 4.x C# 编译器');
  const output = join(root, 'service/dist/videonote-host.exe');
  const result = spawnSync(
    compiler,
    [
      '/nologo',
      '/target:exe',
      '/platform:anycpu',
      '/optimize+',
      '/reference:System.Runtime.Serialization.dll',
      '/reference:System.Windows.Forms.dll',
      `/out:${output}`,
      join(root, 'service/native/windows/Host.cs'),
    ],
    { stdio: quiet ? 'pipe' : 'inherit', windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error('Windows 本机组件构建失败');
}
export async function installWindowsNative(extensionId) {
  const directory = join(
    process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
    'VideoNote',
  );
  await mkdir(directory, { recursive: true });
  // 注册之前先核对全部产物，不生成指向缺失程序的注册记录。
  for (const file of ['host.mjs', 'videonote-host.exe'])
    await access(resolve('service/dist', file));
  for (const file of ['host.mjs', 'videonote-host.exe'])
    await copyFile(resolve('service/dist', file), join(directory, file));
  const runtime = join(directory, 'node.exe');
  if (
    resolve(process.execPath).toLowerCase() !== resolve(runtime).toLowerCase()
  )
    await copyFile(process.execPath, runtime);
  const registration = {
    name: 'com.youtube_note.host',
    description: 'VideoNote 本机组件',
    path: join(directory, 'videonote-host.exe'),
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  const manifest = join(directory, 'host-registration.json');
  await writeFile(manifest, JSON.stringify(registration, null, 2), 'utf8');
  const result = spawnSync(
    join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'),
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
    throw new Error('Windows 本机组件注册失败，请检查当前用户的注册表权限');
  process.stdout.write(
    'Windows 本机组件已注册。回到扩展设置页，点击重新连接。未读取或写入任何 API key。\n',
  );
}
