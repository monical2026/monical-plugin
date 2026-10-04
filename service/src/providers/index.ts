import {
  modelBody,
  modelText,
  translateSegments,
} from '../../../shared/src/ai/model';
import { analyzeSegments } from './analysis';
import { codexText } from './codex';
import { z } from 'zod';
import {
  segmentSchema,
  type Profile,
  type Segment,
} from '@youtube-note/shared';
import { credential } from '../credentials';
import { requestJson, serviceUrl } from '../security/http';
export async function llm(
  profile: Profile,
  prompt: string,
  temporaryKey?: string,
): Promise<string> {
  if (profile.connection === 'codex') return codexText(profile.model, prompt);
  const key =
    temporaryKey ??
    (await credential('get', profile.credentialAccount ?? profile.id));
  if (!key) throw new Error('尚未保存此服务的 API key，请在设置页填写');
  const data = await requestJson(
    serviceUrl(profile.baseUrl, 'chat/completions'),
    { Authorization: `Bearer ${key}` },
    modelBody(profile, prompt),
  );
  return modelText(data);
}
export async function translate(profile: Profile, segments: Segment[]) {
  return translateSegments(segments, (prompt) => llm(profile, prompt));
}
export async function analyze(profile: Profile, segments: Segment[]) {
  return analyzeSegments(segments, (prompt) => llm(profile, prompt));
}
export async function transcript(profile: Profile, videoId: string) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('视频标识无效');
  const key = await credential('get', profile.credentialAccount ?? profile.id);
  if (!key) throw new Error('请先设置 Supadata API key');
  const url = new URL('https://api.supadata.ai/v1/transcript');
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set('mode', 'native');
  const data = z
    .object({
      lang: z.string().max(30).optional(),
      content: z.array(
        z.object({
          text: z.string(),
          offset: z.number(),
          duration: z.number(),
        }),
      ),
    })
    .parse(await requestJson(url, { 'x-api-key': key }));
  return data.content.map((cue, i) =>
    segmentSchema.parse({
      id: `supadata-${i}`,
      startMs: cue.offset,
      endMs: cue.offset + cue.duration,
      original: cue.text,
      sourceLanguage: data.lang,
    }),
  );
}
