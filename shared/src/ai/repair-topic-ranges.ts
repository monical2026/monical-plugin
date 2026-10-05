import { z } from 'zod';
import { parseAnalysisOutput } from './analysis-output';
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
  const prompt = `这是唯一一次章节来源范围校正，不重新生成脉络正文。${correction}
${coverageInstruction(rows.length)}
下面给出上一份实际主题及错误范围、完整原文。逐项核对主题含义在原文中的位置，修正范围。不能把每个主题的编号重新从 1 开始，也不能套用示例编号。不得增加、删除、调序或改写主题正文。若原主题含义无法在原文定位，返回 {"unresolved":true}，禁止猜测。
只返回 {"topics":[{"index":0,"startId":"真实首编号","endId":"真实末编号"}]}，index 必须按原主题 0 到 ${topics.length - 1} 逐项出现一次；startId/endId 必须是本次原文编号。禁止返回其他字段。
原主题：${JSON.stringify(topics)}
原文：${JSON.stringify(rows)}`;
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
