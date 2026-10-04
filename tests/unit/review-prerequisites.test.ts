import { expect, it, vi } from 'vitest';
import { normalizeReviewPrerequisites } from '../../shared/src/ai/review-prerequisites';
import {
  planSchema,
  applyReviewPlan,
} from '../../shared/src/ai/analysis-review-plan';
import { requestReviewPlan } from '../../shared/src/ai/analysis-review-request';
import { reviewMaterial } from '../../shared/src/ai/analysis-review';
import { resolveAnalysis } from '../../shared/src/ai/analysis';
import { segmentSchema } from '../../shared/src';
const item = {
  title: '代数',
  description: '理解变量与等式',
  origin: '讲者明确',
};
const items = [item, { ...item, title: '几何' }];
const schema = planSchema.pick({ prerequisites: true });
it.each(
  [[0], [{ index: 0 }], [{ index: 0, ...item }], [item], [0, { index: 1 }]].map(
    (prerequisites) => ({ prerequisites }),
  ),
)('仅将可确认的原条目引用转换为索引 %j', ({ prerequisites }) => {
  const input = { prerequisites };
  const before = structuredClone(input);
  const result = schema.parse(normalizeReviewPrerequisites(input, items));
  expect(result.prerequisites).toEqual(
    prerequisites.length === 2 ? [0, 1] : [0],
  );
  expect(input).toEqual(before);
});
it.each([
  { index: -1 },
  { index: 99 },
  { index: 0.5 },
  { index: '0' },
  { index: 0, title: '模型擅自修改' },
  { index: 0, extra: true },
  { title: '代数' },
  {},
  { indexes: [0] },
  { ...item, description: '新增内容' },
])('不猜测或吞掉不能核实的对象 %j', (value) => {
  expect(
    schema.safeParse(
      normalizeReviewPrerequisites({ prerequisites: [value] }, items),
    ).success,
  ).toBe(false);
});
it('没有显式索引且正文匹配多条时拒绝歧义', () => {
  expect(
    schema.safeParse(
      normalizeReviewPrerequisites({ prerequisites: [item] }, [item, item]),
    ).success,
  ).toBe(false);
});
function material(count = 1) {
  const segments = Array.from({ length: count }, (_, i) =>
    segmentSchema.parse({
      id: String(i),
      startMs: i * 1000,
      endMs: (i + 1) * 1000,
      original: '原文',
    }),
  );
  const analysis = resolveAnalysis(
    {
      formatVersion: 3,
      summary: '总结',
      topics: segments.map((_, i) => ({
        title: '主题',
        introduction: '介绍',
        startId: String(i + 1),
        endId: String(i + 1),
        problem: [],
        application: [],
        keyPoints: ['要点'],
        clipVerdict: '高',
        clipReason: ['完整'],
      })),
      knowledge: [],
      methods: [],
      quotes: [],
      prerequisites: [item],
    },
    segments,
  );
  return reviewMaterial(analysis, segments);
}
it('复现 prerequisites[0] 对象导致旧校验失败，修复后保留原正文；重复索引仍拒绝', () => {
  const data = material();
  const plan = {
    summary: '总结',
    topics: [{ startId: '1', endId: '1' }],
    knowledge: [],
    methods: [],
    quotes: [],
    prerequisites: [{ index: 0 }],
  };
  expect(planSchema.safeParse(plan).success).toBe(false);
  expect(applyReviewPlan(plan, data).prerequisites[0]).toMatchObject(item);
  expect(() =>
    applyReviewPlan({ ...plan, prerequisites: [0, { index: 0 }] }, data),
  ).toThrow('重复或无效');
});
it('长片拆分复核同样接受安全对象引用，恰好两个请求', async () => {
  const data = material(25);
  const generate = vi
    .fn()
    .mockResolvedValueOnce(
      JSON.stringify({
        summary: '总结',
        topics: data.topics.map((t) => ({
          startId: t.startId,
          endId: t.endId,
        })),
      }),
    )
    .mockResolvedValueOnce(
      JSON.stringify({
        knowledge: [],
        methods: [],
        quotes: [],
        prerequisites: [{ index: 0 }],
      }),
    );
  const plan = await requestReviewPlan(data, generate);
  expect(applyReviewPlan(plan, data).prerequisites[0]).toMatchObject(item);
  expect(generate).toHaveBeenCalledTimes(2);
});

it('未知对象的诊断仅显示允许字段的类型，不泄漏值及未知键名', async () => {
  const { parseReviewPlan } =
    await import('../../shared/src/ai/analysis-diagnostics');
  let message = '';
  try {
    parseReviewPlan(
      schema,
      {
        prerequisites: [
          { index: 'PRIVATE', title: 'SECRET', PRIVATE_KEY: 'VALUE' },
        ],
      },
      '复核',
    );
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain(
    'object{index:string,title:string; unknownFields=1}',
  );
  expect(message).not.toMatch(/PRIVATE|SECRET|VALUE/);
});
