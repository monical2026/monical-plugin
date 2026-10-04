import { z } from 'zod';
import {
  segmentSchema,
  SUPADATA_GENERATION_RATE,
  type Settings,
  type Profile,
} from '../index';
export const ticketSchema = z.object({
  id: z.string(),
  videoId: z.string().regex(/^[\w-]{11}$/),
  durationMs: z.number().positive(),
  credits: z.number().positive(),
  rate: z.number().positive(),
  settingsRevision: z.number(),
  profileId: z.string(),
  status: z.enum([
    'awaiting',
    'submitting',
    'running',
    'completed',
    'unknown',
    'failed',
  ]),
  jobId: z.string().optional(),
  segments: z.array(segmentSchema).optional(),
});
export type Ticket = z.infer<typeof ticketSchema>;
export function estimateCredits(durationMs: number, rate: number | null) {
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    rate === null ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    throw new Error('无法估算生成消耗，请先填写计价规则并确认视频时长');
  return Math.ceil(durationMs / 60000) * rate;
}
function source(settings: Settings): Profile {
  const profile = settings.profiles.find(
    (p) => p.id === settings.subtitleProfile && p.kind === 'supadata',
  );
  if (!profile?.configured) throw new Error('请先配置字幕服务');
  return profile;
}
export interface GenerationStore {
  read(videoId: string): Promise<Ticket | null>;
  write(ticket: Ticket): Promise<Ticket>;
  create(ticket: Ticket): Promise<Ticket>;
  lock<T>(videoId: string, action: () => Promise<T>): Promise<T>;
}
export function generationEngine(
  storage: GenerationStore,
  credential: (
    operation: 'get',
    account: string,
  ) => Promise<string | undefined>,
  requestJson: (url: URL, headers: Record<string, string>) => Promise<unknown>,
) {
  const { read, write } = storage;
  async function prepareGeneration(input: unknown, settings: Settings) {
    const payload = z
      .object({ videoId: z.string(), durationMs: z.number().positive() })
      .parse(input);
    const profile = source(settings);
    const existing = await read(payload.videoId);
    if (
      existing &&
      (existing.status !== 'awaiting' ||
        (existing.settingsRevision === settings.revision &&
          existing.durationMs === payload.durationMs &&
          existing.profileId === profile.id))
    )
      return existing;
    const ticket: Ticket = {
      id: crypto.randomUUID(),
      ...payload,
      credits: estimateCredits(
        payload.durationMs,
        settings.generationCreditsPerMinute ?? SUPADATA_GENERATION_RATE,
      ),
      rate: settings.generationCreditsPerMinute ?? SUPADATA_GENERATION_RATE,
      settingsRevision: settings.revision,
      profileId: profile.id,
      status: 'awaiting',
    };
    return storage.create(ticket);
  }

  async function acceptResult(ticket: Ticket, input: unknown) {
    const parsed = z
      .object({
        jobId: z.string().optional(),
        status: z.string().optional(),
        content: z
          .array(
            z.object({
              text: z.string(),
              offset: z.number().nonnegative(),
              duration: z.number().nonnegative(),
            }),
          )
          .optional(),
      })
      .parse(input);
    if (parsed.content?.length) {
      return write({
        ...ticket,
        status: 'completed',
        segments: parsed.content.map((cue, i) =>
          segmentSchema.parse({
            id: `generated-${i}`,
            sourceCueIds: [`generated-${i}`],
            startMs: cue.offset,
            endMs: cue.offset + cue.duration,
            original: cue.text,
          }),
        ),
      });
    }
    if (parsed.status === 'failed')
      return write({ ...ticket, status: 'failed' });
    if (parsed.jobId || ticket.jobId)
      return write({
        ...ticket,
        status: 'running',
        jobId: parsed.jobId ?? ticket.jobId,
      });
    throw new Error('字幕服务未返回任务编号或内容，禁止重复提交');
  }
  async function confirmGeneration(input: unknown, settings: Settings) {
    const payload = z
      .object({
        videoId: z.string(),
        id: z.string(),
        durationMs: z.number(),
        confirmed: z.literal(true),
      })
      .parse(input);
    const ticket = await read(payload.videoId);
    if (!ticket || ticket.id !== payload.id) throw new Error('生成确认已失效');
    if (ticket.status !== 'awaiting') return ticket;
    if (
      ticket.settingsRevision !== settings.revision ||
      ticket.durationMs !== payload.durationMs
    )
      throw new Error('设置或视频时长已变化，请重新核对生成计划');
    const profile = source(settings);
    if (profile.id !== ticket.profileId) throw new Error('字幕服务已变化');
    const key = await credential(
      'get',
      profile.credentialAccount ?? profile.id,
    );
    if (!key) throw new Error('字幕服务密钥尚未保存');
    await write({ ...ticket, status: 'submitting' });
    try {
      const url = new URL('https://api.supadata.ai/v1/transcript');
      url.searchParams.set(
        'url',
        `https://www.youtube.com/watch?v=${ticket.videoId}`,
      );
      url.searchParams.set('mode', 'generate');
      return await acceptResult(
        ticket,
        await requestJson(url, { 'x-api-key': key }),
      );
    } catch {
      await write({ ...ticket, status: 'unknown' });
      throw new Error(
        '生成提交结果未能确认，已保留任务且不会自动重发；请在服务后台核对。',
      );
    }
  }
  async function readJob(input: unknown, settings: Settings) {
    const payload = z.object({ videoId: z.string() }).parse(input);
    const ticket = await read(payload.videoId);
    if (!ticket) throw new Error('没有对应生成任务');
    if (ticket.status !== 'running' || !ticket.jobId) return ticket;
    const profile = settings.profiles.find(
      (p) => p.id === ticket.profileId && p.kind === 'supadata',
    );
    if (!profile) throw new Error('生成任务原服务已移除');
    const key = await credential(
      'get',
      profile.credentialAccount ?? profile.id,
    );
    if (!key) throw new Error('原字幕服务密钥未配置');
    const url = new URL(
      `https://api.supadata.ai/v1/transcript/${encodeURIComponent(ticket.jobId)}`,
    );
    return acceptResult(ticket, await requestJson(url, { 'x-api-key': key }));
  }

  return {
    prepareGeneration: (input: unknown, settings: Settings) =>
      storage.lock(
        z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }).parse(input)
          .videoId,
        () => prepareGeneration(input, settings),
      ),
    confirmGeneration: (input: unknown, settings: Settings) =>
      storage.lock(
        z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }).parse(input)
          .videoId,
        () => confirmGeneration(input, settings),
      ),
    readJob: (input: unknown, settings: Settings) =>
      storage.lock(
        z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }).parse(input)
          .videoId,
        () => readJob(input, settings),
      ),
  };
}
