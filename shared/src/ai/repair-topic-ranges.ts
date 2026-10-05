import { z } from 'zod';
import { parseAnalysisOutput, analysisTopicsSchema } from './analysis-output';
import { analysisContentRules } from './analysis-prompt';
import { AnalysisReviewError } from './analysis-diagnostics';
import { assertTopicCoverage, coverageInstruction } from './analysis-coverage';
export async function repairTopicRanges(
  previous: unknown,
  rows: { id: string; text: string }[],
  generate: (prompt: string) => Promise<string>,
  correction: string,
) {
  const original = parseAnalysisOutput(previous);
  const topics = original.topics.map((topic, index) => ({ index, ...topic }));
  const prompt = `这是唯一一次章节来源校正。${correction}
${coverageInstruction(rows.length)}
${analysisContentRules}
本轮只输出 topics，不输出或更改其他栏目。上一份主题可能遗漏开场、结尾或中间内容，也可能顺序或编号错误；不能假定原主题数量正确。
先核对完整原文：遗漏内容必须补写有原文依据的主题，必要时拆分、合并或重排，并同步主题正文。禁止只把现有主题起点强改成 1 来掩盖遗漏；开场/过渡内容也应如实归入对应主题，不虚构问题、方法或价值。
只返回 {"topics":[{"title":"据原文填写","startId":"真实首编号","endId":"真实末编号","introduction":"据该范围概述","keyPoints":["原文要点"],"problem":[],"application":[],"applicationOrigin":"讲者明确","clipVerdict":"低","clipReason":["据原文判断"]}]}。这是字段说明，不得照抄示例正文。返回按原文顺序覆盖全部输入的完整主题数组，不返回 index。若无法定位则返回 {"unresolved":true}，禁止猜测。
原主题（仅供核对，可修正）：${JSON.stringify(topics)}
完整原文：${JSON.stringify(rows)}`;
  const text = await generate(prompt);
  let input: unknown;
  try {
    input = JSON.parse(
      text
        .trim()
        .replace(/^\x60\x60\x60(?:json)?\s*/i, '')
        .replace(/\s*\x60\x60\x60$/, ''),
    );
  } catch {
    throw new AnalysisReviewError('章节校正未返回有效 JSON，已有结果保留。', [
      'topics.repair: invalid JSON',
    ]);
  }
  // 新协议允许补齐遗漏主题；沿用正文解析契约，其他栏目只取首轮结果。
  const replacement = z
    .object({ topics: z.array(analysisTopicsSchema.element.strict()).min(1) })
    .strict()
    .safeParse(input);
  if (replacement.success) {
    assertTopicCoverage(replacement.data.topics, rows.length);
    return { ...original, topics: replacement.data.topics };
  }
  // 兼容仅返回编号映射的模型，但仍要求同序同数量且完整覆盖。
  const parsed = z
    .object({
      topics: z.array(
        z
          .object({
            index: z.number().int().nonnegative(),
            startId: z.coerce.string(),
            endId: z.coerce.string(),
          })
          .strict(),
      ),
    })
    .strict()
    .safeParse(input);
  if (
    !parsed.success ||
    parsed.data.topics.length !== topics.length ||
    parsed.data.topics.some((item, index) => item.index !== index)
  )
    throw new AnalysisReviewError(
      '章节校正无法逐项对应原主题，已有结果保留，请复制诊断。',
      ['topics.repair: unresolved or invalid mapping'],
    );
  assertTopicCoverage(parsed.data.topics, rows.length);
  return {
    ...original,
    topics: original.topics.map((topic, index) => ({
      ...topic,
      startId: parsed.data.topics[index].startId,
      endId: parsed.data.topics[index].endId,
    })),
  };
}
