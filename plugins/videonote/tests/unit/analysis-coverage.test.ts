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
    .mockResolvedValueOnce(
      JSON.stringify({ topics: [{ index: 0, startId: '1', endId: '3' }] }),
    );
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
  const generate = vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(output('2')))
    .mockResolvedValueOnce(
      JSON.stringify({ topics: [{ index: 0, startId: '2', endId: '3' }] }),
    );
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

it('复现 40 段第 5 主题回到 1–7：校正只改范围，保留首轮全部正文', async () => {
  const source = Array.from({ length: 40 }, (_, i) =>
    segmentSchema.parse({
      id: `seg${i + 1}`,
      startMs: i * 1000,
      endMs: (i + 1) * 1000,
      original: `原文 ${i + 1}`,
    }),
  );
  const data = output('1', '40');
  data.topics = [
    [1, 10],
    [11, 20],
    [21, 30],
    [31, 38],
    [1, 7],
  ].map(([start, end], index) => ({
    ...output().topics[0],
    title: `主题${index}`,
    introduction: `原介绍${index}`,
    startId: String(start),
    endId: String(end),
  }));
  const generate = vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(data))
    .mockResolvedValueOnce(
      JSON.stringify({
        topics: [
          [1, 10],
          [11, 20],
          [21, 30],
          [31, 38],
          [39, 40],
        ].map(([start, end], index) => ({
          index,
          startId: String(start),
          endId: String(end),
        })),
      }),
    );
  const result = await analyzeSegments(source, generate);
  expect(result.topics[4]).toMatchObject({
    title: '主题4',
    introduction: '原介绍4',
    startSegmentId: 'seg39',
    endSegmentId: 'seg40',
    startMs: 38000,
    endMs: 40000,
  });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0]).toContain('"startId":"1","endId":"7"');
  expect(generate.mock.calls[1][0]).toContain('原文 40');
  expect(generate.mock.calls[1][0]).not.toContain('knowledge');
});
it('校正拒绝改写正文、缺失主题或重复索引，无第三次请求', async () => {
  for (const topics of [
    [{ index: 1, startId: '1', endId: '3' }],
    [],
    [{ index: 0, startId: '1', endId: '3', title: '篡改' }],
  ]) {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(output('2')))
      .mockResolvedValueOnce(JSON.stringify({ topics }));
    await expect(analyzeSegments(segments, generate)).rejects.toThrow(
      '逐项对应',
    );
    expect(generate).toHaveBeenCalledTimes(2);
  }
});
