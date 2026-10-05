import { reviewMergeWarnings } from './review-merge-warnings';
import { normalizeReviewPrerequisites } from './review-prerequisites';
import { parseReviewPlan, AnalysisReviewError } from './analysis-diagnostics';
import { assertTopicCoverage } from './analysis-coverage';
import { z } from 'zod';
import type { reviewMaterial } from './analysis-review';
type Material = ReturnType<typeof reviewMaterial>;
const strings = z.array(z.string().min(1));
const complete = (rows: string[] | undefined) =>
  !!rows?.length && rows.every((row) => row.trim().length > 0);
const group = {
  indexes: z.array(z.number().int().nonnegative()).min(1),
  title: z.string().optional(),
};
export const planSchema = z.object({
  summary: z.string().min(1).max(200),
  topics: z
    .array(
      z.object({
        startId: z.coerce.string(),
        endId: z.coerce.string(),
        title: z.string().optional(),
        introduction: z.string().optional(),
        problem: strings.optional(),
        application: strings.optional(),
        keyPoints: strings.optional(),
        clipVerdict: z.enum(['高', '中', '低', '需核对画面']).optional(),
        clipReason: strings.optional(),
      }),
    )
    .min(1),
  knowledge: z.array(
    z.object({
      ...group,
      understanding: strings.optional(),
      role: strings.optional(),
    }),
  ),
  methods: z.array(
    z.object({
      ...group,
      applicability: z.string().optional(),
      steps: strings.optional(),
      limitations: strings.optional(),
    }),
  ),
  prerequisites: z.array(z.number().int().nonnegative()),
  quotes: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      excerpt: z.string().min(1).optional(),
      chinese: z.string().min(1).optional(),
    }),
  ),
});
const reviewPlanRules = `本次只返回精简的复核计划，不输出上文完整脉络 JSON，未改文字由程序保留，禁止重复抄写整份材料。
章节先检查是否只是同一完整解释的中间阶段。比如变化率、时间系数、圆周运动若共同回答同一个公式为何成立，就合为完整议题，不把每一步都保留成独立章节。此例不是当前材料的事实。
所有 index/indexes 必须直接引用输入条目上显式标注的 index 字段，不要自行计数或猜数组序号，更不要与字幕 segmentId 混用。每个原条目最多进入一个组；可删除不符合要求的关键点、方法、金句、前置知识，但主题必须完整连续覆盖 1 到 segmentCount。
summary 必须重新写出简短全片总结（最多 200 字符）。复核计划只采用下方结构：分组用 indexes 数字数组，保留序号用数字，不能返回完整脉络条目。所有顶层字段都必须提供，空数组写 []，不要用 null。可选文字字段不修改时直接省略，不要写 null。limitations、steps、understanding、role 等分条字段必须为字符串数组。
topics：每项只写 startId/endId；需要改的字段才附上。合并或拆分造成范围变化时必须同时写新 title、introduction、keyPoints、clipVerdict、clipReason，并按需更新 problem/application。startId/endId 必须从 allowedBoundaryIds 列表中选择，不能取未列出的中间编号。合并应使用所合并章节的真实首末编号，不猜未知位置。
knowledge：保留条目写 {indexes:[序号]}；语义同义合并时 indexes 列全部原序号，必须写整合后的 understanding/role，标题按需改；来源自动合并，顺序首项为主要讲解来源。不要丢不同条件。优先保留能串起全片主要问题与解法的关键点；同一核心概念的下位细节并入核心含义，不把所有推导小点都升格成全片关键点。
合并前自检：多个 indexes 的 knowledge 必须同时提供非空 understanding 和 role；多个 indexes 的 methods 必须提供 applicability、非空 steps 和 limitations。无法写出完整合并内容时分别返回单项 indexes，不要提交只有多个索引的空合并计划。
methods：保留写 {indexes:[序号]}；合并时必须写整合后的 applicability/steps/limitations，保留必要条件，来源自动合并。去掉没有具体用法或只是重复要点的项目。
prerequisites：必须是数字数组，例如 [0,2]，数字来自输入 prerequisites 的 index；没有保留项为 []。不要返回 {index:0}、{title:...} 或完整前置知识对象。只筛选原条目，正文由程序保留，去除非必要门槛及重复基础。
quotes：只列合格候选的 {index:序号}；如候选开头指代不明，可截取同一原话内独立成立的连续子串，同时写 excerpt 和忠实 chinese。只选一句或两句，宁缺毋滥。“In both cases...”“depending on what you're trying to answer about it...”在没有具体对象时不能独立表达，应删除或取其中完整独立的原句。不要只因句子完整就认作金句。
`;
export function reviewPlanInstructions(scope: 'full' | 'chapters' | 'details') {
  const chapters = {
    summary: '全片总结',
    topics: [{ startId: '1', endId: '5' }],
  };
  const details = {
    knowledge: [{ indexes: [0] }],
    methods: [{ indexes: [0] }],
    prerequisites: [0],
    quotes: [{ index: 0 }],
  };
  const example =
    scope === 'chapters'
      ? chapters
      : scope === 'details'
        ? details
        : { ...chapters, ...details };
  return `${reviewPlanRules}\n本轮只输出 ${Object.keys(example).join('、')} 字段，不输出其他顶层字段。只输出 JSON，结构示例（序号不是建议选择）：${JSON.stringify(example)}`;
}
function select<T>(
  items: T[],
  indexes: number[],
  seen: Set<number>,
  field: string,
) {
  return indexes.map((index) => {
    if (!items[index] || seen.has(index))
      throw new AnalysisReviewError(
        '全片复核返回重复或无效条目，已有结果未覆盖',
        [`${field}: invalid or duplicate index`],
      );
    seen.add(index);
    return items[index];
  });
}
export function applyReviewPlan(input: unknown, data: Material) {
  const plan = parseReviewPlan(
    planSchema,
    normalizeReviewPrerequisites(input, data.prerequisites),
    '全片复核计划',
  );
  assertTopicCoverage(plan.topics, data.segmentCount);
  const warnings: string[] = [];
  const seenKnowledge = new Set<number>(),
    seenMethods = new Set<number>();
  return {
    formatVersion: 3,
    warnings,
    summary: plan.summary,
    topics: plan.topics.map((patch) => {
      const base = data.topics.find(
        (t) =>
          Number(t.startId) <= Number(patch.startId) &&
          Number(t.endId) >= Number(patch.startId),
      );
      if (!base)
        throw new AnalysisReviewError(
          '全片复核主题没有有效来源，已有结果未覆盖',
          ['topics: invalid source'],
        );
      if (patch.startId !== base.startId || patch.endId !== base.endId) {
        const boundaries = new Set([
          ...data.boundaryEvidence.map((s) => s.id),
          ...data.topics.flatMap((t) => [t.startId, t.endId]),
        ]);
        if (
          !boundaries.has(patch.startId) ||
          !boundaries.has(patch.endId) ||
          !patch.title ||
          !patch.introduction ||
          !patch.keyPoints?.length ||
          !patch.clipVerdict ||
          !patch.clipReason?.length
        )
          throw new AnalysisReviewError(
            '调整章节边界缺少完整说明，已有结果未覆盖',
            [
              'topics: changed boundary requires valid source, title, introduction, keyPoints, clipVerdict, clipReason',
            ],
          );
      }
      return { ...base, ...patch };
    }),
    knowledge: plan.knowledge.flatMap(({ indexes, ...patch }) => {
      const items = select(
        data.knowledge,
        indexes,
        seenKnowledge,
        'knowledge.indexes',
      );
      if (
        items.length > 1 &&
        (!complete(patch.understanding) || !complete(patch.role))
      ) {
        warnings.push(reviewMergeWarnings.knowledge);
        return items;
      }
      return {
        ...items[0],
        ...patch,
        segmentIds: [...new Set(items.flatMap((k) => k.segmentIds))],
        sources: items.flatMap((k) =>
          k.sources.map((source) => ({
            ...source,
            label: source.label === '主要讲解' ? k.title : source.label,
          })),
        ),
      };
    }),
    methods: plan.methods.flatMap(({ indexes, ...patch }) => {
      const items = select(
        data.methods,
        indexes,
        seenMethods,
        'methods.indexes',
      );
      if (
        items.length > 1 &&
        (!patch.applicability?.trim() ||
          !complete(patch.steps) ||
          !patch.limitations)
      ) {
        warnings.push(reviewMergeWarnings.methods);
        return items;
      }
      return {
        ...items[0],
        ...patch,
        sources: items.flatMap((m) =>
          m.sources.map((source) => ({
            ...source,
            label: source.label === '主要讲解' ? m.title : source.label,
          })),
        ),
      };
    }),
    prerequisites: select(
      data.prerequisites,
      plan.prerequisites,
      new Set(),
      'prerequisites',
    ),
    quotes: plan.quotes
      .map((patch) => {
        const quote = data.quotes[patch.index];
        if (
          !quote ||
          (patch.excerpt &&
            (!quote.excerpt.includes(patch.excerpt) || !patch.chinese))
        )
          throw new AnalysisReviewError(
            '复核金句不在已核验原话中，已有结果未覆盖',
            ['quotes: invalid index, excerpt or translation'],
          );
        return {
          ...quote,
          ...(patch.excerpt
            ? { excerpt: patch.excerpt, chinese: patch.chinese }
            : {}),
        };
      })
      .filter(
        (q, i, all) =>
          all.findIndex((item) => item.excerpt === q.excerpt) === i,
      ),
  };
}
