import { expect, it, vi } from 'vitest';
import { analyzeSegments, resolveAnalysis } from '../../shared/src/ai/analysis';
import { reviewAnalysis } from '../../shared/src/ai/analysis-review';
import { segmentSchema } from '../../shared/src';
const segments = Array.from({ length: 3 }, (_, i) =>
  segmentSchema.parse({
    id: `s${i}`,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
    original: `来源正文 ${i}`,
  }),
);
const output = (start = '1', end = '3') => ({
  formatVersion: 3,
  summary: '总结',
  topics: [
    {
      title: '主题',
      startId: start,
      endId: end,
      introduction: '介绍',
      keyPoints: ['观点'],
      problem: [],
      application: [],
      clipVerdict: '高',
      clipReason: ['理由'],
    },
  ],
  knowledge: [],
  prerequisites: [],
  quotes: [],
  methods: [],
});
it.each([
  ['2', '3'],
  ['0', '3'],
  ['1', '99'],
  ['1', '2'],
])('复现范围错误 %s–%s，最多一次定向校正后保留真实映射', async (start, end) => {
  expect(() => resolveAnalysis(output(start, end), segments)).toThrow(
    '来源范围',
  );
  const generate = vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(output(start, end)))
    .mockResolvedValueOnce(JSON.stringify(output()));
  const result = await analyzeSegments(segments, generate);
  expect(result.topics[0]).toMatchObject({
    startSegmentId: 's0',
    endSegmentId: 's2',
    startMs: 0,
    endMs: 3000,
  });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0]).toContain('唯一一次');
  expect(generate.mock.calls[0][0]).toContain('编号为 1 到 3');
});
it('校正仍失败明确停止，不无限重试或猜测来源', async () => {
  const generate = vi.fn().mockResolvedValue(JSON.stringify(output('2')));
  await expect(analyzeSegments(segments, generate)).rejects.toThrow('已停止');
  expect(generate).toHaveBeenCalledTimes(2);
});
it('网络失败或返回非 JSON 不自动补发', async () => {
  for (const generate of [
    vi.fn().mockRejectedValue(new Error('网络断开')),
    vi.fn().mockResolvedValue('not json'),
  ]) {
    await expect(analyzeSegments(segments, generate)).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  }
});
it('完整复核中的首主题缺口也校正，保留原有已验证主题含义', async () => {
  const analysis = resolveAnalysis(output(), segments);
  const plan = (start: string) => ({
    summary: '全片总结',
    topics: [{ startId: start, endId: '3' }],
    knowledge: [],
    methods: [],
    prerequisites: [],
    quotes: [],
  });
  const generate = vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(plan('2')))
    .mockResolvedValueOnce(JSON.stringify(plan('1')));
  const result = await reviewAnalysis(analysis, segments, generate);
  expect(result.summary).toBe('全片总结');
  expect(result.topics[0].introduction).toBe('介绍');
  expect(result.topics[0].startSegmentId).toBe('s0');
  expect(generate).toHaveBeenCalledTimes(2);
});

it('长片只校正失败的章节请求，不重复已无关的提炼复核请求', async () => {
  const { requestReviewPlan } =
    await import('../../shared/src/ai/analysis-review-request');
  const { reviewMaterial } =
    await import('../../shared/src/ai/analysis-review');
  const source = Array.from({ length: 25 }, (_, i) =>
    segmentSchema.parse({
      id: `s${i}`,
      startMs: i * 1000,
      endMs: (i + 1) * 1000,
      original: `内容 ${i}`,
    }),
  );
  const data = output();
  data.topics = source.map((_, i) => ({
    ...output().topics[0],
    startId: String(i + 1),
    endId: String(i + 1),
  }));
  const material = reviewMaterial(resolveAnalysis(data, source), source);
  const generate = vi
    .fn()
    .mockResolvedValueOnce(
      JSON.stringify({
        summary: '总结',
        topics: [{ startId: '2', endId: '25' }],
      }),
    )
    .mockResolvedValueOnce(
      JSON.stringify({
        summary: '总结',
        topics: material.topics.map((t) => ({
          startId: t.startId,
          endId: t.endId,
        })),
      }),
    )
    .mockResolvedValueOnce(
      JSON.stringify({
        knowledge: [],
        methods: [],
        prerequisites: [],
        quotes: [],
      }),
    );
  await expect(requestReviewPlan(material, generate)).resolves.toMatchObject({
    summary: '总结',
  });
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate.mock.calls[1][0]).toContain('唯一一次');
  expect(generate.mock.calls[2][0]).toContain('本轮只复核关键点');
});
