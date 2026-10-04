import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import {
  withAnalysisDiagnostic,
  readAnalysisDiagnostic,
} from '../../extension/src/ui/analysis-diagnostic';
import { parseReviewPlan } from '../../shared/src/ai/analysis-diagnostics';
import { planSchema } from '../../shared/src/ai/analysis-review-plan';
let fixture: ReturnType<typeof fakeChrome>;
beforeEach(() => {
  fixture = fakeChrome();
});
afterEach(() => vi.unstubAllGlobals());
it('字段缺失、null、类型与长度错误只报告结构，不复制正文', () => {
  const invalid = {
    summary: 'PRIVATE'.repeat(40),
    topics: [],
    knowledge: null,
    methods: [],
    prerequisites: [],
    quotes: [{ index: 'PRIVATE_KEY' }],
  };
  let message = '';
  try {
    parseReviewPlan(planSchema, invalid, '全片复核计划');
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain('summary: expected=too_big, actual=string');
  expect(message).toContain('knowledge: expected=array, actual=null');
  expect(message).toContain('quotes.[0].index: expected=number, actual=string');
  expect(message).not.toContain('PRIVATE');
});
it('诊断存储故障不影响成功生成，仍可在面板内复制', async () => {
  fixture.chrome.storage.local.set.mockRejectedValue(
    new Error('storage unavailable'),
  );
  const action = vi.fn(async () => {});
  await withAnalysisDiagnostic('storage-failed', action, () => true);
  expect(action).toHaveBeenCalledOnce();
  const report = await readAnalysisDiagnostic('storage-failed');
  expect(report).toContain('"storage": "memory"');
  expect(report).toContain('"outcome": "saved"');
});
it('诊断不记录未知异常正文，保持原错误与已有记录', async () => {
  const error = new Error('PRIVATE_KEY_AND_NOTES');
  await expect(
    withAnalysisDiagnostic(
      'error',
      async () => {
        throw error;
      },
      () => true,
    ),
  ).rejects.toBe(error);
  expect(await readAnalysisDiagnostic('error')).not.toContain('PRIVATE');
});
it('旧任务迟到不覆盖同视频新诊断，切换视频可标记取消', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withAnalysisDiagnostic(
    'race',
    async (trace) => {
      trace('old');
      await gate;
    },
    () => true,
  );
  await vi.waitFor(() =>
    expect(fixture.data.local.analysisDiagnosticsV1).toBeDefined(),
  );
  await withAnalysisDiagnostic(
    'race',
    async (trace) => {
      trace('new');
    },
    () => true,
  );
  release();
  await first;
  const result = await readAnalysisDiagnostic('race');
  expect(result).toContain('new');
  expect(result).not.toContain('"old"');
  await withAnalysisDiagnostic(
    'other',
    async () => {},
    () => false,
  );
  expect(await readAnalysisDiagnostic('other')).toContain('cancelled');
  expect(await readAnalysisDiagnostic('race')).toContain('new');
});
it('持久化有容量上限，事件最多 80 条，刷新模块后仍可读取', async () => {
  for (let i = 0; i < 12; i++)
    await withAnalysisDiagnostic(
      'bounded-' + i,
      async (trace) => {
        for (let j = 0; j < 100; j++) trace('event', { count: j });
      },
      () => true,
    );
  expect(
    Object.keys(fixture.data.local.analysisDiagnosticsV1 as object),
  ).toHaveLength(10);
  const report = JSON.parse(await readAnalysisDiagnostic('bounded-11'));
  expect(report.events).toHaveLength(80);
  expect(report.events[0].stage).toBe('ui.analysis.start');
  vi.resetModules();
  const reloaded = await import('../../extension/src/ui/analysis-diagnostic');
  expect(await reloaded.readAnalysisDiagnostic('bounded-11')).toContain(
    'ui.analysis.saved',
  );
});

it('每个复核阶段仅携带本轮 JSON 模板，完整生成模板保持独立', async () => {
  const { reviewPlanInstructions } =
    await import('../../shared/src/ai/analysis-review-plan');
  const { analysisRules, analysisContentRules } =
    await import('../../shared/src/ai/analysis-prompt');
  expect(analysisRules).toContain('"formatVersion":3');
  expect(analysisContentRules).not.toContain('"formatVersion":3');
  for (const [scope, fields] of [
    [
      'full',
      ['summary', 'topics', 'knowledge', 'methods', 'prerequisites', 'quotes'],
    ],
    ['chapters', ['summary', 'topics']],
    ['details', ['knowledge', 'methods', 'prerequisites', 'quotes']],
  ] as const) {
    const prompt = reviewPlanInstructions(scope);
    const example = JSON.parse(
      prompt.split('结构示例（序号不是建议选择）：')[1],
    );
    expect(Object.keys(example)).toEqual(fields);
    expect(prompt).not.toContain('"formatVersion":3');
  }
});
