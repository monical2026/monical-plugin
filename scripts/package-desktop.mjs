import { writeUtf8Zip } from './utf8-zip.mjs';
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  chmod,
  cp,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const runtimeVersion = '22.23.3';
const base = `https://nodejs.org/dist/v${runtimeVersion}/`;
const cache = resolve('artifacts/runtime-cache', runtimeVersion);
await mkdir(cache, { recursive: true });
async function download(name) {
  const file = join(cache, name.replaceAll('/', '-'));
  try {
    return { file, data: await readFile(file) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(base + name, {
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok)
    throw new Error(`运行时下载失败：${name} ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(file, data);
  return { file, data };
}
const checksums = (await download('SHASUMS256.txt')).data.toString();
async function verified(name) {
  const { file, data } = await download(name);
  const expected = checksums
    .split('\n')
    .find((line) => line.endsWith('  ' + name))
    ?.split(' ')[0];
  if (!expected || createHash('sha256').update(data).digest('hex') !== expected)
    throw new Error(`运行时校验失败：${name}`);
  return file;
}
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error(`打包失败：${command}\n${result.stderr || ''}`, {
      cause: result.error,
    });
}
if (process.platform !== 'darwin')
  throw new Error(
    '本打包脚本使用 macOS ditto 制作并保留应用权限，请在 Mac 构建',
  );
const stage = await mkdtemp(join(tmpdir(), 'videonote-package-'));
try {
  const macArchive = await verified(
    `node-v${runtimeVersion}-darwin-arm64.tar.gz`,
  );
  run('/usr/bin/tar', ['-xzf', macArchive, '-C', stage]);
  const windowsArchive = await verified(`node-v${runtimeVersion}-win-x64.zip`);
  run('/usr/bin/ditto', ['-x', '-k', windowsArchive, stage]);
  const windowsRuntime = join(
    stage,
    `node-v${runtimeVersion}-win-x64/node.exe`,
  );
  const license = join(stage, `node-v${runtimeVersion}-darwin-arm64/LICENSE`);
  for (const platform of ['windows-x64', 'mac-arm64']) {
    const root = join(stage, platform);
    await mkdir(root, { recursive: true });
    run('/usr/bin/ditto', [
      '-x',
      '-k',
      resolve(`artifacts/releases/VideoNote-${version}-chrome.zip`),
      root,
    ]);
    const app = join(root, '安装 Obsidian 连接.app');
    const resources =
      platform === 'mac-arm64'
        ? join(app, 'Contents/Resources')
        : join(root, '连接组件');
    await mkdir(resources, { recursive: true });
    for (const file of [
      'install.mjs',
      'dialog.mjs',
      'register.mjs',
      'connection-file.mjs',
    ])
      await copyFile(join('scripts/installer', file), join(resources, file));
    await copyFile(
      'scripts/windows-native.mjs',
      join(resources, 'windows-native.mjs'),
    );
    await copyFile('service/dist/host.mjs', join(resources, 'host.mjs'));
    await copyFile(license, join(resources, 'NODE-LICENSE.txt'));
    await copyFile('LICENSE', join(resources, 'VIDEONOTE-LICENSE.txt'));
    if (platform === 'windows-x64') {
      await copyFile(windowsRuntime, join(resources, 'node.exe'));
      await copyFile(
        'service/native/windows/Host.cs',
        join(resources, 'Host.cs'),
      );
      // cmd 本身仅启动自带运行时；用户只双击，不输入命令。
      // 纯 ASCII 启动器兼容 Windows 非 UTF-8 控制台；资源目录通过相对 ASCII 名定位。
      await cp(resources, join(root, 'connector'), { recursive: true });
      await rm(resources, { recursive: true });
      await writeFile(
        join(root, '安装 Obsidian 连接.cmd'),
        '@echo off\r\n"%~dp0connector\\node.exe" "%~dp0connector\\install.mjs"\r\n',
        'ascii',
      );
    } else {
      await copyFile(
        join(stage, `node-v${runtimeVersion}-darwin-arm64/bin/node`),
        join(resources, 'node'),
      );
      await copyFile(
        'service/dist/keychain-bridge',
        join(resources, 'keychain-bridge'),
      );
      await chmod(join(resources, 'node'), 0o755);
      await chmod(join(resources, 'keychain-bridge'), 0o755);
      const executables = join(app, 'Contents/MacOS');
      await mkdir(executables, { recursive: true });
      await writeFile(
        join(executables, 'install'),
        '#!/bin/sh\nBASE="$(cd "$(dirname "$0")/../Resources" && pwd)"\nexec "$BASE/node" "$BASE/install.mjs"\n',
        { mode: 0o755 },
      );
      await writeFile(
        join(app, 'Contents/Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>install</string><key>CFBundleIdentifier</key><string>com.videonote.connector-installer</string><key>CFBundleName</key><string>安装 Obsidian 连接</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${version}</string><key>LSUIElement</key><true/></dict></plist>`,
      );
    }
    await copyFile(
      'DOC/obsidian-install.md',
      join(root, 'Obsidian 安装指南.md'),
    );
    await writeFile(
      join(root, '安装说明.txt'),
      `VideoNote ${version} — ${platform}\n\n1. 完整解压到长期保留的位置。在 chrome://extensions 加载 VideoNote 文件夹。\n更新请覆盖原来的插件文件夹并重新加载，不要卸载，不要换路径。\n2. 在插件“导出”窗口点击“下载安装连接文件”。\n3. 双击“安装 Obsidian 连接”，选择刚下载的 VideoNote-connection.json 文件完成安装。\n4. 回到插件，点击“检查 Obsidian 连接”，选择知识库后导出。\n\n无需安装 Node.js、pnpm，无需输入命令。连接组件可选，仅 Obsidian 导出需要；普通文件下载、AI 浏览器模式照常使用。\n未安装 Obsidian 时导出保持灰色，请先安装 Obsidian 并打开一个知识库后再检查。\nWindows 需系统自带的 .NET Framework 4.x，当前 Windows 实机验收待完成；Mac 包仅适用 Apple 芯片。安装包未做商业签名/公证，系统可能要求确认或拦截；不要关闭系统防护。详见 Obsidian 安装指南.md。\n`,
    );
    const output = resolve(
      `artifacts/releases/VideoNote-${version}-${platform}.zip`,
    );
    await writeUtf8Zip(root, output);
    const data = await readFile(output);
    const sha = createHash('sha256').update(data).digest('hex');
    await writeFile(
      output + '.sha256',
      `${sha}  ${output.split('/').at(-1)}\n`,
    );
    console.log(`${output} (${data.length} bytes) SHA256 ${sha}`);
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
