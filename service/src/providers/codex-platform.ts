import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
export async function codexExecutable() {
  const candidates =
    process.platform === 'win32'
      ? [
          ...(process.env.VIDEONOTE_CODEX_PATH
            ? [process.env.VIDEONOTE_CODEX_PATH]
            : []),
          join(homedir(), '.local', 'bin', 'codex.exe'),
          ...(process.env.PATH ?? '')
            .split(';')
            .filter((p) => isAbsolute(p))
            .map((p) => join(p, 'codex.exe')),
        ].filter((p) => isAbsolute(p) && p.toLowerCase().endsWith('.exe'))
      : [
          join(homedir(), '.local/bin/codex'),
          '/opt/homebrew/bin/codex',
          '/usr/local/bin/codex',
        ];
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      /* 继续检查可执行程序位置，不执行 shell shim。 */
    }
  }
  throw new Error(
    process.platform === 'win32'
      ? '未找到原生 codex.exe，请安装并登录；可用 VIDEONOTE_CODEX_PATH 指定其绝对路径，暂不调用 .cmd 包装脚本。'
      : '未找到本机 Codex CLI，请先安装并使用 ChatGPT 登录。',
  );
}
export function codexEnvironment(): NodeJS.ProcessEnv {
  const common = {
    HOME: homedir(),
    ...(process.env.CODEX_HOME ? { CODEX_HOME: process.env.CODEX_HOME } : {}),
  };
  if (process.platform !== 'win32')
    return {
      ...common,
      PATH: `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
    };
  const env: NodeJS.ProcessEnv = { ...common };
  for (const key of [
    'SystemRoot',
    'WINDIR',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
    'TEMP',
    'TMP',
    'PATH',
  ])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}
