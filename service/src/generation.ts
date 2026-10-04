import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  generationEngine,
  ticketSchema,
  type Ticket,
} from '../../shared/src/ai/generation';
import { configDirectory } from './config';
import { credential } from './credentials';
import { requestJson } from './security/http';
export { estimateCredits } from '../../shared/src/ai/generation';
const folder = join(configDirectory, 'generation');
function path(videoId: string) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('视频标识无效');
  return join(folder, `${videoId}.json`);
}
async function read(videoId: string) {
  try {
    return ticketSchema.parse(
      JSON.parse(await readFile(path(videoId), 'utf8')),
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null;
    throw new Error('生成任务记录无法读取，已停止以防重复提交', {
      cause: error,
    });
  }
}
async function write(ticket: Ticket) {
  await writeFile(path(ticket.videoId), JSON.stringify(ticket), {
    mode: 0o600,
  });
  return ticket;
}
const engine = generationEngine(
  {
    read,
    write,
    create: write,
    lock: async (videoId, action) => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const lockPath = path(videoId) + '.operation.lock';
      const handle = await open(lockPath, 'wx').catch(() => {
        throw new Error('此字幕任务正在操作，请稍后重试');
      });
      try {
        return await action();
      } finally {
        await handle.close();
        await unlink(lockPath);
      }
    },
  },
  credential,
  requestJson,
);
export const { prepareGeneration, confirmGeneration, readJob } = engine;
