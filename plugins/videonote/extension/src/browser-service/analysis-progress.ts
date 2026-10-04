import type { AnalysisTrace } from '../../../shared/src/ai/analysis-diagnostics';
import { z } from 'zod';
import {
  analysisSchema,
  type Analysis,
  type Profile,
} from '@youtube-note/shared';
import { stored, store, locked } from './storage';
const schema = z.object({
  stamp: z.string(),
  runId: z.string().optional(),
  parts: z.record(z.string(), analysisSchema),
  updatedAt: z.number(),
});
export async function analysisProgress(
  input: unknown,
  profile: Profile,
  revision: number,
  task: string,
  action: () => Promise<Analysis>,
  trace?: AnalysisTrace,
) {
  const request = z
    .object({
      workflow: z
        .object({
          videoId: z.string(),
          source: z.string(),
          runId: z.string().optional(),
        })
        .optional(),
    })
    .parse(input);
  if (!request.workflow) return action();
  const key = 'browserAnalysis:' + request.workflow.videoId;
  const stamp = JSON.stringify([3, request.workflow.source, profile, revision]);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify({
            ...z.record(z.string(), z.unknown()).parse(input),
            workflow: {
              videoId: request.workflow.videoId,
              source: request.workflow.source,
            },
          }),
        ),
      ),
    ),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
  return locked(key, async () => {
    const previous = schema.safeParse(await stored(key));
    if (
      previous.success &&
      request.workflow?.runId &&
      previous.data.runId === request.workflow.runId &&
      previous.data.stamp !== stamp
    )
      throw new Error('服务配置已变化，请重新开始整理，避免混用模型');
    const checkpoint =
      previous.success &&
      previous.data.stamp === stamp &&
      Date.now() - previous.data.updatedAt < 86400000
        ? previous.data
        : { stamp, parts: {}, updatedAt: Date.now() };
    if (checkpoint.parts[hash]) {
      trace?.('cache.hit');
      await store(key, { ...checkpoint, runId: request.workflow?.runId });
      return checkpoint.parts[hash];
    }
    trace?.('cache.miss');
    const result = await action();
    if (task === 'reviewAnalysis') await chrome.storage.local.remove(key);
    else
      await store(key, {
        ...checkpoint,
        runId: request.workflow?.runId,
        parts: { ...checkpoint.parts, [hash]: result },
        updatedAt: Date.now(),
      });
    return result;
  });
}
