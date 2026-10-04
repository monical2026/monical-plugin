import { z } from 'zod';
import { segmentSchema, type Profile } from '@youtube-note/shared';
import { modelBody, modelText } from '../../../shared/src/ai/model';
import { apiUrl, requestJson } from './network';
import { readSecret } from './vault';
import { guardedModelRequest } from './request-ledger';
export async function profileKey(profile: Profile) {
  if (profile.connection === 'codex')
    throw new Error('本机 Codex 仅在本机组件模式可用');
  const key = await readSecret(profile.credentialAccount ?? profile.id);
  if (!key) throw new Error('请先在设置页保存此服务的 API Key');
  return key;
}
export async function llm(
  profile: Profile,
  prompt: string,
  temporaryKey?: string,
) {
  if (profile.connection === 'codex')
    throw new Error('本机 Codex 需要本机组件');
  const key = temporaryKey ?? (await profileKey(profile));
  return guardedModelRequest({ profile, prompt }, async () =>
    modelText(
      await requestJson(
        apiUrl(profile.baseUrl, 'chat/completions'),
        { Authorization: `Bearer ${key}` },
        modelBody(profile, prompt),
      ),
    ),
  );
}
export async function transcript(profile: Profile, videoId: string) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('视频标识无效');
  const url = new URL('https://api.supadata.ai/v1/transcript');
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set('mode', 'native');
  const data = z
    .object({
      lang: z.string().optional(),
      content: z.array(
        z.object({
          text: z.string(),
          offset: z.number().nonnegative(),
          duration: z.number().nonnegative(),
        }),
      ),
    })
    .parse(
      await requestJson(
        url,
        { 'x-api-key': await profileKey(profile) },
        undefined,
        25000,
      ),
    );
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
