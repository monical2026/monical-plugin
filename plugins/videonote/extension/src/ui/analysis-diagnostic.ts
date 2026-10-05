import {
  AnalysisPlanFormatError,
  AnalysisReviewError,
  type AnalysisTrace,
} from '../../../shared/src/ai/analysis-diagnostics';
import { locked, store, stored } from '../browser-service/storage';
export type AnalysisDiagnostic = {
  version: string;
  runId: string;
  startedAt: string;
  outcome: 'running' | 'saved' | 'failed' | 'cancelled';
  issues: string[];
  events: {
    stage: string;
    elapsedMs: number;
    count?: number;
    status?: number;
    characters?: number;
  }[];
  storage: 'local' | 'memory';
};
const key = 'analysisDiagnosticsV1';
const memory = new Map<string, AnalysisDiagnostic>();
async function save(videoId: string, report: AnalysisDiagnostic) {
  // 各视频独立归属；新任务开始后，旧任务不能覆盖其诊断。
  if (memory.get(videoId)?.runId !== report.runId) return;
  try {
    await locked(key, async () => {
      if (memory.get(videoId)?.runId !== report.runId) return;
      const previous = await stored(key);
      const rows: Record<string, unknown> =
        previous && typeof previous === 'object'
          ? Object.fromEntries(Object.entries(previous))
          : {};
      const current = rows[videoId];
      if (
        current &&
        typeof current === 'object' &&
        'startedAt' in current &&
        typeof current.startedAt === 'string' &&
        current.startedAt > report.startedAt
      )
        return;
      if (
        report.outcome !== 'running' &&
        current &&
        typeof current === 'object' &&
        'runId' in current &&
        current.runId !== report.runId
      )
        return;
      delete rows[videoId];
      rows[videoId] = report;
      await store(key, Object.fromEntries(Object.entries(rows).slice(-10)));
    });
  } catch {
    // 诊断存储失败不得阻断生成、保存笔记或替换原错误；面板内仍可复制。
    report.storage = 'memory';
  }
}
export async function readAnalysisDiagnostic(videoId: string): Promise<string> {
  let report: unknown = memory.get(videoId);
  try {
    const rows = await stored(key);
    if (
      memory.get(videoId)?.storage !== 'memory' &&
      rows &&
      typeof rows === 'object'
    )
      report = Reflect.get(rows, videoId) ?? report;
  } catch {
    if (!report) throw new Error('诊断存储无法读取');
  }
  return report
    ? JSON.stringify(report, null, 2)
    : '当前视频没有脉络诊断。请在此版本点击一次“脉络”，报错后再复制。';
}
export async function withAnalysisDiagnostic(
  videoId: string,
  action: (trace: AnalysisTrace) => Promise<void>,
  active: () => boolean,
) {
  const start = Date.now();
  const report: AnalysisDiagnostic = {
    version: chrome.runtime.getManifest?.().version ?? 'test',
    runId: crypto.randomUUID(),
    startedAt: new Date(start).toISOString(),
    outcome: 'running',
    issues: [],
    events: [],
    storage: 'local',
  };
  memory.delete(videoId);
  memory.set(videoId, report);
  if (memory.size > 10) memory.delete(memory.keys().next().value ?? '');
  const trace: AnalysisTrace = (stage, detail) => {
    report.events.push({ stage, elapsedMs: Date.now() - start, ...detail });
    if (report.events.length > 80) report.events.splice(1, 1);
  };
  trace('ui.analysis.start');
  await save(videoId, report);
  try {
    await action(trace);
    report.outcome = active() ? 'saved' : 'cancelled';
    trace(`ui.analysis.${report.outcome}`);
  } catch (error) {
    report.outcome = 'failed';
    report.issues =
      error instanceof AnalysisPlanFormatError ||
      error instanceof AnalysisReviewError
        ? error.issues
        : [];
    trace('ui.analysis.failed');
    throw error;
  } finally {
    await save(videoId, report);
  }
}
