import { AnalysisReviewError } from './analysis-diagnostics';
// 保持连续覆盖校验；只向模型反馈来源编号，不扩写或猜测主题范围。
export class AnalysisCoverageError extends AnalysisReviewError {
  constructor(public readonly detail: string) {
    super(`脉络主题来源范围不完整：${detail}。已有结果未覆盖。`, [
      `topics.coverage: ${detail}`,
    ]);
  }
}
export function assertTopicCoverage(
  topics: { startId: string; endId: string }[],
  count: number,
) {
  let next = 1;
  for (const [index, topic] of topics.entries()) {
    const start = Number(topic.startId),
      end = Number(topic.endId);
    if (start !== next || !Number.isInteger(end) || end < start || end > count)
      throw new AnalysisCoverageError(
        `第 ${index + 1} 个主题应从 ${next} 开始，实际为 ${start}–${end}，本次有效编号为 1–${count}`,
      );
    next = end + 1;
  }
  if (next !== count + 1)
    throw new AnalysisCoverageError(
      `主题只覆盖到 ${next - 1}，必须覆盖到 ${count}`,
    );
}
export function coverageInstruction(count: number) {
  return `来源编号契约：本次输入只有 ${count} 个片段，编号为 1 到 ${count}（不是秒数、不是主题序号）。第一个主题 startId 必须为 "1"，最后一个主题 endId 必须为 "${count}"；每个后续主题 startId 必须等于前一个 endId + 1，startId/endId 都为该范围内整数且 startId <= endId。必须覆盖开场及结尾，不允许跳过片段。输出前逐项检查。`;
}
export async function correctCoverage<T>(
  action: (correction: string) => Promise<T>,
): Promise<T> {
  try {
    return await action('');
  } catch (error) {
    if (!(error instanceof AnalysisCoverageError)) throw error;
    try {
      return await action(
        `上次已完成的回复未通过来源编号检查：${error.detail}。这是唯一一次针对该错误的校正，请核对原始材料，并严格按本次任务指定的结构返回校正结果，不重复错误。`,
      );
    } catch (second) {
      if (!(second instanceof AnalysisCoverageError)) throw second;
      throw new AnalysisReviewError(
        `模型校正后仍未满足来源范围：${second.detail}。已停止，不再自动请求，已有结果保留。请复制脉络诊断以便检查。`,
        [
          ...error.issues.map((issue) => `initial.${issue}`),
          ...second.issues.map((issue) => `repair.${issue}`),
        ],
      );
    }
  }
}
