import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import { guardedModelRequest } from '../../extension/src/browser-service/request-ledger';
import { analysisProgress } from '../../extension/src/browser-service/analysis-progress';
import { analysisSchema, profileSchema } from '../../shared/src';
import { confirmRetry } from '../../extension/src/browser-service/retry-confirmation';
vi.mock('../../extension/src/browser-service/retry-confirmation', () => ({
  confirmRetry: vi.fn(),
}));
let fixture: ReturnType<typeof fakeChrome>;
beforeEach(() => {
  fixture = fakeChrome();
  vi.mocked(confirmRetry).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it('未知 AI 请求取消后不重发，明确确认才重新请求', async () => {
  const action = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue('ok');
  await expect(guardedModelRequest('same', action)).rejects.toThrow('network');
  expect(
    Object.keys(fixture.data.local).some((k) =>
      k.startsWith('browserPendingAI:'),
    ),
  ).toBe(true);
  vi.mocked(confirmRetry).mockResolvedValueOnce(false);
  await expect(guardedModelRequest('same', action)).rejects.toThrow('已取消');
  expect(action).toHaveBeenCalledTimes(1);
  vi.mocked(confirmRetry).mockResolvedValueOnce(true);
  expect(await guardedModelRequest('same', action)).toBe('ok');
  expect(action).toHaveBeenCalledTimes(2);
  expect(
    Object.keys(fixture.data.local).some((k) =>
      k.startsWith('browserPendingAI:'),
    ),
  ).toBe(false);
});
it('已完成分析批次可恢复，同一轮配置变化停止而非混用模型', async () => {
  const profile = profileSchema.parse({
    id: 'p',
    name: 'demo',
    kind: 'llm',
    baseUrl: 'https://api.example.com/v1',
    model: 'm',
  });
  const result = analysisSchema.parse({
    summary: '总结',
    topics: [],
    quotes: [],
    methods: [],
  });
  const action = vi.fn(async () => result);
  const input = {
    task: 'analyze',
    workflow: { videoId: 'abcdefghijk', source: 'v1', runId: 'run1' },
  };
  await analysisProgress(input, profile, 1, 'analyze', action);
  const resumed = { ...input, workflow: { ...input.workflow, runId: 'run2' } };
  expect(
    await analysisProgress(resumed, profile, 1, 'analyze', action),
  ).toEqual(result);
  expect(action).toHaveBeenCalledTimes(1);
  await expect(
    analysisProgress(resumed, profile, 2, 'analyze', action),
  ).rejects.toThrow('配置已变化');
  await analysisProgress(
    { ...resumed, task: 'reviewAnalysis' },
    profile,
    1,
    'reviewAnalysis',
    action,
  );
  expect(fixture.data.local['browserAnalysis:abcdefghijk']).toBeUndefined();
});
