import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { dialog } from './dialog.mjs';
import { installFiles } from './register.mjs';
import { buildWindowsNative } from './windows-native.mjs';
const source = dirname(fileURLToPath(import.meta.url));
async function install() {
  const extensionId = dialog(
    '请先在 VideoNote 的导出窗口点击“复制安装连接编号”，然后粘贴到下方。\n仅为当前用户安装连接，不修改已有笔记或服务配置。',
    true,
  );
  if (extensionId === null) return;
  if (!/^[a-p]{32}$/.test(extensionId))
    throw new Error('连接编号不正确，请从 VideoNote 导出窗口重新复制');
  let stage;
  try {
    let payload = source;
    if (process.platform === 'win32') {
      // 使用 Windows 自带的 .NET Framework，不要求用户安装开发工具或输入命令。
      stage = await mkdtemp(join(tmpdir(), 'videonote-install-'));
      await mkdir(join(stage, 'service/native/windows'), { recursive: true });
      await mkdir(join(stage, 'service/dist'), { recursive: true });
      await copyFile(
        join(source, 'Host.cs'),
        join(stage, 'service/native/windows/Host.cs'),
      );
      await buildWindowsNative(stage, true);
      payload = join(stage, 'service/dist');
      for (const file of ['node.exe', 'host.mjs'])
        await copyFile(join(source, file), join(payload, file));
    }
    const destination =
      process.platform === 'win32'
        ? join(
            process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'),
            'VideoNote',
          )
        : join(homedir(), 'Library/Application Support/YouTubeNote');
    await installFiles({
      source: payload,
      destination,
      extensionId,
      platform: process.platform,
      home: homedir(),
      windowsRoot: process.env.SystemRoot || 'C:\\Windows',
    });
    dialog(
      '连接组件安装完成。\n请回到 VideoNote 导出窗口，点击“检查 Obsidian 连接”。\n如果尚未安装 Obsidian，请先安装并打开它，创建或打开知识库后再检查。',
    );
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
  }
}
try {
  await install();
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : '未知错误';
  try {
    dialog(`安装未完成：${message}\n请检查安装指南后重试。`);
  } catch {
    process.stderr.write('安装未完成，安装窗口不可用。\n');
  }
}
