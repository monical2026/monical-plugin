import { safeTitle } from '../../shared/src/export-filename';
export { safeTitle } from '../../shared/src/export-filename';
import { videoIdSchema } from '@youtube-note/shared';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  realpath,
  stat,
  open,
  readdir,
  unlink,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { configDirectory } from './config';
import { discoverObsidian } from './obsidian-discovery';
const targetSchema = z.object({ folder: z.string(), vault: z.string() });
const exportSchema = z.object({
  videoId: videoIdSchema,
  title: z.string().max(1000),
  markdown: z.string().max(6_000_000),
  copy: z.boolean().default(false),
});
export async function validateTarget(folder: string) {
  const canonical = await realpath(folder);
  if (!(await stat(canonical)).isDirectory()) throw new Error('目标不是文件夹');
  let ancestor = canonical;
  while (true) {
    try {
      if ((await stat(join(ancestor, '.obsidian'))).isDirectory())
        return { folder: canonical, vault: ancestor };
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    const parent = dirname(ancestor);
    if (parent === ancestor)
      throw new Error(
        '请选择 Obsidian 知识库或其中的文件夹（知识库需包含 .obsidian 文件夹）',
      );
    ancestor = parent;
  }
}
export async function writeObsidian(folder: string, input: unknown) {
  const request = exportSchema.parse(input);
  const target = await validateTarget(folder);
  if (target.folder !== folder)
    throw new Error('目标文件夹位置已变化，请重新选择');
  const files = await readdir(folder);
  const identity = `[${request.videoId}]`;
  const existing = files.filter(
    (file) => file.includes(identity) && file.endsWith('.md'),
  );
  if (existing.length && !request.copy)
    return { status: 'duplicate', files: existing.slice(0, 5) };
  const stem = `${safeTitle(request.title)} ${identity}`;
  for (let number = existing.length ? 1 : 0; number < 10000; number++) {
    const suffix =
      number === 0 ? '' : number === 1 ? '（副本）' : `（副本 ${number}）`;
    const filename = `${stem}${suffix}.md`;
    let file;
    try {
      file = await open(join(folder, filename), 'wx', 0o600);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        if (!request.copy) return { status: 'duplicate', files: [filename] };
        continue;
      }
      throw error;
    }
    try {
      await file.writeFile(request.markdown, 'utf8');
      await file.sync();
    } catch (error) {
      await unlink(join(folder, filename));
      throw error;
    } finally {
      await file.close();
    }
    return { status: 'saved', filename, folder };
  }
  throw new Error('同名副本过多，请更换导出文件夹');
}
export async function obsidian(operation: string, payload: unknown) {
  const settingsFile = join(configDirectory, 'obsidian-target.json');
  const discovery = await discoverObsidian();
  if (operation === 'obsidianStatus') return discovery;
  if (discovery.state !== 'ready')
    throw new Error(
      discovery.state === 'appMissing'
        ? '未检测到 Obsidian，请安装后点击“检查 Obsidian 连接”'
        : '请先在 Obsidian 中创建或打开知识库，再检查连接',
    );
  if (operation === 'obsidianChoose') {
    const { vault } = z.object({ vault: z.string() }).parse(payload);
    const target = discovery.vaults.find((item) => item.vault === vault);
    if (!target)
      throw new Error('知识库不在 Obsidian 已登记列表中，请重新检查连接');
    await mkdir(configDirectory, { recursive: true, mode: 0o700 });
    const temporary = join(configDirectory, `obsidian-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(target), { mode: 0o600 });
    await rename(temporary, settingsFile);
    return target;
  }
  let target;
  try {
    target = targetSchema.parse(
      JSON.parse(await readFile(settingsFile, 'utf8')),
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      if (operation === 'obsidianTarget') return null;
      throw new Error('请先选择 Obsidian 保存文件夹', { cause: error });
    }
    throw new Error('Obsidian 目录配置无法读取，请重新选择文件夹', {
      cause: error,
    });
  }
  if (
    !discovery.vaults.some(
      (item) => item.vault === target.vault && item.folder === target.folder,
    )
  ) {
    if (operation === 'obsidianTarget') return null;
    throw new Error('原知识库已移除或位置变化，请重新选择知识库');
  }
  if (operation === 'obsidianTarget') return target;
  return writeObsidian(target.folder, payload);
}
