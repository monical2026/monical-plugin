import type { AnalysisTrace } from '../../../shared/src/ai/analysis-diagnostics';
import { analysisProgress } from './analysis-progress';
import { z } from 'zod';
import {
  profileSchema,
  segmentSchema,
  parseAnalysisRequest,
  type Profile,
} from '@youtube-note/shared';
import { analyzeSegments } from '../../../shared/src/ai/analysis';
import { reviewAnalysis } from '../../../shared/src/ai/analysis-review';
import { answerQuestion } from '../../../shared/src/ai/questions';
import { translateSegments } from '../../../shared/src/ai/model';
import { readSettings, saveSettings } from './settings';
import { llm, profileKey, transcript } from './providers';
import { apiUrl, requestJson } from './network';
import { generation } from './generation';
export async function browserService(
  operation: string,
  input: unknown,
  trace?: AnalysisTrace,
): Promise<unknown> {
  const settings = await readSettings();
  if (operation === 'settings' || operation === 'status') return settings;
  if (operation === 'saveSettings') return saveSettings(input);
  const profile = (id: string, kind: Profile['kind']) => {
    const value = settings.profiles.find((p) => p.id === id && p.kind === kind);
    if (!value) throw new Error('请在设置页选择对应服务');
    return value;
  };
  if (operation === 'probe' || operation === 'models') {
    const request = z
      .object({ profile: profileSchema, key: z.string().max(16000).optional() })
      .parse(input);
    const old = settings.profiles.find((p) => p.id === request.profile.id);
    if (!request.key && old?.baseUrl !== request.profile.baseUrl)
      throw new Error('测试新地址请填写密钥');
    const selected = {
      ...request.profile,
      credentialAccount: old?.credentialAccount,
    };
    if (selected.kind !== 'llm')
      throw new Error('字幕服务在实际获取字幕时验证');
    if (operation === 'probe') {
      await llm(selected, '请只回复 OK。', request.key || undefined);
      return { ok: true };
    }
    return z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(
        await requestJson(apiUrl(selected.baseUrl, 'models'), {
          Authorization: `Bearer ${request.key || (await profileKey(selected))}`,
        }),
      )
      .data.map((m) => m.id);
  }
  if (operation === 'transcript') {
    const request = z
      .object({ videoId: z.string(), mode: z.literal('native') })
      .parse(input);
    return transcript(
      profile(settings.subtitleProfile, 'supadata'),
      request.videoId,
    );
  }
  if (['prepareGeneration', 'confirmGeneration', 'job'].includes(operation))
    return generation(operation, input, settings);
  if (operation === 'generate') {
    const task = z.object({ task: z.string() }).parse(input).task;
    if (task === 'ask')
      return answerQuestion(input, (prompt) =>
        llm(profile(settings.analyzeProfile, 'llm'), prompt),
      );
    if (task === 'analyze' || task === 'reviewAnalysis') {
      trace?.(`browser.${task}`);
      const payload = parseAnalysisRequest(input);
      const selected = settings.profiles.find(
        (p) => p.id === settings.analyzeProfile && p.kind === 'llm',
      );
      if (!selected)
        throw new Error(
          '浏览器模式可直接整理脉络：请在设置的“模型分工”中选择“中文摘要与视频脉络”的 API 模型并保存。',
        );
      if (selected.connection === 'codex')
        throw new Error(
          '当前脉络选中了本机 Codex。浏览器模式请改选 API 模型并保存，无需安装组件。',
        );
      const generate = (prompt: string) =>
        llm(selected, prompt, undefined, trace);
      return analysisProgress(
        input,
        selected,
        settings.revision,
        task,
        () =>
          payload.task === 'reviewAnalysis'
            ? reviewAnalysis(
                payload.analysis,
                payload.segments,
                generate,
                trace,
              )
            : analyzeSegments(payload.segments, generate),
        trace,
      );
    }
    const request = z
      .object({
        task: z.literal('translate'),
        segments: z.array(segmentSchema).min(1).max(15000),
      })
      .parse(input);
    return translateSegments(request.segments, (prompt) =>
      llm(profile(settings.translateProfile, 'llm'), prompt),
    );
  }
  throw new Error('此功能需要可选本机组件；普通文件导出无需组件');
}
