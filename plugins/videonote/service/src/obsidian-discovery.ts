import { stat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, basename, win32 } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
const execute = promisify(execFile);
async function exists(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return false;
    throw error;
  }
}
export function windowsObsidianExecutable(command: string) {
  return command.match(/"([^"\r\n]+[\\/]Obsidian\.exe)"/i)?.[1];
}
export async function obsidianInstalled() {
  if (process.platform === 'darwin') {
    for (const directory of ['/Applications', join(homedir(), 'Applications')])
      if (await exists(join(directory, 'Obsidian.app/Contents/MacOS/Obsidian')))
        return true;
    const { stdout } = await execute(
      '/usr/bin/mdfind',
      ['kMDItemCFBundleIdentifier == "md.obsidian"'],
      { timeout: 5000, maxBuffer: 65536 },
    );
    for (const path of stdout.trim().split('\n').filter(Boolean))
      if (await exists(join(path, 'Contents/MacOS/Obsidian'))) return true;
    return false;
  }
  if (process.platform !== 'win32')
    throw new Error('当前系统不支持 Obsidian 检测');
  const paths = [
    win32.join(
      process.env.LOCALAPPDATA || win32.join(homedir(), 'AppData/Local'),
      'Obsidian/Obsidian.exe',
    ),
    win32.join(
      process.env.LOCALAPPDATA || win32.join(homedir(), 'AppData/Local'),
      'Programs/Obsidian/Obsidian.exe',
    ),
    win32.join(
      process.env.ProgramFiles || 'C:\\Program Files',
      'Obsidian/Obsidian.exe',
    ),
  ];
  for (const path of paths) if (await exists(path)) return true;
  const powershell = win32.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  // 显式 UTF-8 输出，避免中文自定义安装路径经过控制台代码页后损坏。
  const script = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; $ErrorActionPreference='Stop'; $p='Registry::HKEY_CLASSES_ROOT\\obsidian\\shell\\open\\command'; if (Test-Path -LiteralPath $p) { [Console]::Write((Get-Item -LiteralPath $p).GetValue('')) }`;
  const { stdout } = await execute(
    powershell,
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 5000, windowsHide: true, maxBuffer: 16384 },
  );
  const registered = windowsObsidianExecutable(stdout);
  if (registered) paths.push(registered);
  for (const path of paths) if (await exists(path)) return true;
  return false;
}
export async function readObsidianVaults(configFile: string) {
  let raw: string;
  try {
    raw = await readFile(configFile, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return [];
    throw new Error('无法读取 Obsidian 知识库列表，请检查访问权限', {
      cause: error,
    });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new Error('Obsidian 知识库列表损坏，请先在 Obsidian 中检查', {
      cause: error,
    });
  }
  const parsed = z
    .object({
      vaults: z
        .record(z.string(), z.object({ path: z.string().min(1) }))
        .default({}),
    })
    .safeParse(decoded);
  if (!parsed.success)
    throw new Error('Obsidian 知识库列表格式无法识别，请更新连接组件');
  const vaults: { folder: string; vault: string; name: string }[] = [];
  for (const { path } of Object.values(parsed.data.vaults)) {
    try {
      const canonical = await realpath(path);
      if (!(await stat(join(canonical, '.obsidian'))).isDirectory()) continue;
      if (!vaults.some((v) => v.vault === canonical))
        vaults.push({
          folder: canonical,
          vault: canonical,
          name: basename(canonical),
        });
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
  return vaults;
}
export async function discoverObsidian() {
  if (!(await obsidianInstalled()))
    return { state: 'appMissing' as const, vaults: [] };
  const config =
    process.platform === 'win32'
      ? win32.join(
          process.env.APPDATA || win32.join(homedir(), 'AppData/Roaming'),
          'obsidian/obsidian.json',
        )
      : join(homedir(), 'Library/Application Support/obsidian/obsidian.json');
  const vaults = await readObsidianVaults(config);
  return {
    state: vaults.length ? ('ready' as const) : ('noVaults' as const),
    vaults,
  };
}
