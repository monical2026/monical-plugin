import { readAnalysisDiagnostic } from '../../extension/src/ui/analysis-diagnostic';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import { unlockVault } from '../../extension/src/browser-service/vault';
import { saveSettings } from '../../extension/src/browser-service/settings';
import { defaultSettings, recordSchema } from '../../shared/src';
import { videoActions } from '../../extension/src/ui/videoActions';
let fixture: ReturnType<typeof fakeChrome>;
beforeEach(() => {
  fixture = fakeChrome();
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  'valid',
  'coverage',
  'coverage-restart',
  'coverage-missing-opening',
  'invalid-plan',
  'prerequisite-reference',
  'prerequisite-copy',
  'incomplete-merge',
  'invalid-merge-index',
])(
  '实际视频操作经浏览器 RPC 完成分析与全片复核，范围校正=%s，完全不调用本机',
  async (scenario) => {
    await unlockVault('fixture-password-123');
    await saveSettings({
      settings: {
        ...defaultSettings,
        analyzeProfile: 'p',
        profiles: [
          {
            id: 'p',
            name: 'API',
            kind: 'llm',
            baseUrl: 'https://api.example.com/v1',
            model: 'demo',
          },
        ],
      },
      keys: { p: 'fixture-key' },
    });
    const responses = [
      {
        formatVersion: 3,
        summary: '局部总结',
        topics: [
          {
            title: '验证需求',
            startId: '1',
            endId: '1',
            introduction: '通过付费意愿验证需求。',
            problem: [],
            application: [],
            keyPoints: ['先验证需求'],
            clipVerdict: '高',
            clipReason: ['做法完整'],
          },
        ],
        knowledge: [],
        prerequisites: [],
        quotes: [],
        methods: [],
      },
      {
        summary: '全片总结',
        topics: [{ startId: '1', endId: '1' }],
        knowledge: [],
        methods: [],
        prerequisites: [],
        quotes: [],
      },
    ];
    const prerequisite = {
      title: '基础',
      description: '原材料说明',
      origin: '讲者明确',
    };
    if (scenario.startsWith('prerequisite-')) {
      Object.assign(responses[0], { prerequisites: [prerequisite] });
      Object.assign(responses[1], {
        prerequisites: [
          scenario === 'prerequisite-reference' ? { index: 0 } : prerequisite,
        ],
      });
    }
    if (scenario === 'incomplete-merge' || scenario === 'invalid-merge-index') {
      const sources = [
        { segmentId: '1', endSegmentId: '1', label: '主要讲解' },
      ];
      Object.assign(responses[0], {
        knowledge: [0, 1].map((i) => ({
          title: `关键点${i}`,
          understanding: [`含义${i}`],
          role: [`作用${i}`],
          segmentIds: ['1'],
          sources,
        })),
        methods: [0, 1].map((i) => ({
          title: `方法${i}`,
          description: '描述',
          applicability: `条件${i}`,
          steps: [`步骤${i}`],
          limitations: [`限制${i}`],
          segmentId: '1',
          sources,
        })),
      });
      Object.assign(responses[1], {
        knowledge: [
          { indexes: scenario === 'invalid-merge-index' ? [0, 99] : [0, 1] },
        ],
        methods: [{ indexes: [0, 1] }],
      });
    }
    if (scenario === 'coverage') {
      const invalid = structuredClone(responses[0]);
      invalid.topics[0].startId = '2';
      responses.splice(0, 1, invalid, {
        topics: responses[0].topics.map((topic, index) => ({
          index,
          startId: topic.startId,
          endId: topic.endId,
        })),
      });
    }
    if (scenario === 'coverage-restart') {
      const base = responses[0].topics[0];
      const ranges = [
        [1, 10],
        [11, 20],
        [21, 30],
        [31, 38],
        [39, 40],
      ];
      responses[0].topics = ranges.map(([start, end], index) => ({
        ...base,
        title: `主题${index}`,
        startId: String(index === 4 ? 1 : start),
        endId: String(index === 4 ? 7 : end),
      }));
      responses[1].topics = ranges.map(([start, end]) => ({
        startId: String(start),
        endId: String(end),
      }));
      responses.splice(1, 0, {
        topics: ranges.map(([start, end], index) => ({
          index,
          startId: String(start),
          endId: String(end),
        })),
      });
    }
    if (scenario === 'coverage-missing-opening') {
      const base = responses[0].topics[0];
      responses[0].topics = [{ ...base, startId: '8', endId: '40' }];
      responses[1].topics = [
        { startId: '1', endId: '7' },
        { startId: '8', endId: '40' },
      ];
      responses.splice(1, 0, {
        topics: [
          {
            ...base,
            title: '开场目标',
            startId: '1',
            endId: '7',
            introduction: '明确本课的学习目标。',
          },
          ...responses[0].topics,
        ],
      });
    }
    if (scenario === 'invalid-plan') {
      Object.assign(responses[1], {
        methods: [{ indexes: [0], limitations: 'PRIVATE_MODEL_TEXT' }],
      });
    }
    const fetch = vi.fn(
      async (_url: unknown, _options?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify(responses.shift()) } },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    let record = recordSchema.parse({
      videoId: 'abcdefghijk',
      title: '测试',
      revision: 0,
      notes: [],
      analysis: null,
      segments: [
        {
          id: 's1',
          startMs: 0,
          endMs: 10000,
          original: '先验证客户愿不愿意付费，再做完整产品。',
        },
      ],
    });
    if (
      scenario === 'coverage-restart' ||
      scenario === 'coverage-missing-opening'
    )
      record = recordSchema.parse({
        ...record,
        segments: Array.from({ length: 40 }, (_, index) => ({
          id: `s${index + 1}`,
          startMs: index * 1000,
          endMs: (index + 1) * 1000,
          original: `来源正文 ${index + 1}`,
        })),
      });
    const error = vi.fn();
    const actions = videoActions({
      record,
      context: null,
      tabId: 1,
      mutate: async (change) => {
        record = change(record);
        return record;
      },
      setError: error,
      busy: '',
      generation: { current: 1 },
      jobLock: { current: null },
      setBusy: vi.fn(),
      setProgress: vi.fn(),
      setCandidate: vi.fn(),
    });
    await actions.analyze();
    const diagnostic = await readAnalysisDiagnostic(record.videoId);
    expect(diagnostic).toContain('rpc.browser');
    expect(diagnostic).toContain('network.response');
    expect(diagnostic).toContain('browser.reviewAnalysis');
    expect(diagnostic).not.toContain('fixture-key');
    expect(diagnostic).not.toContain(record.segments[0].original);
    expect(diagnostic).not.toContain('PRIVATE_MODEL_TEXT');
    if (scenario === 'invalid-merge-index') {
      expect(diagnostic).toContain('review.knowledge.invalidIndexes');
      expect(diagnostic).toContain('review.merge.preserved');
      expect(record.analysis?.knowledge).toHaveLength(2);
      expect(record.analysis?.knowledge?.map((k) => k.understanding)).toEqual([
        ['含义0'],
        ['含义1'],
      ]);
      expect(record.analysis?.warnings).toContain(
        '关键点复核引用重复或越界，本次未应用关键点合并与筛选，已保留全部原条目及出处。',
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      return;
    }
    if (scenario === 'incomplete-merge') {
      expect(record.analysis?.knowledge).toHaveLength(2);
      expect(record.analysis?.knowledge?.map((k) => k.understanding)).toEqual([
        ['含义0'],
        ['含义1'],
      ]);
      expect(record.analysis?.methods.map((m) => m.steps)).toEqual([
        ['步骤0'],
        ['步骤1'],
      ]);
      expect(record.analysis?.methods.map((m) => m.limitations)).toEqual([
        ['限制0'],
        ['限制1'],
      ]);
      expect(record.analysis?.warnings).toHaveLength(2);
      expect(diagnostic).toContain('review.merge.preserved');
    }
    if (scenario === 'invalid-plan') {
      expect(diagnostic).toContain(
        'methods.[0].limitations: expected=array, actual=string',
      );
      expect(diagnostic).toContain('"outcome": "failed"');
      expect(record.analysis).toBeNull();
      expect(error).toHaveBeenLastCalledWith(
        expect.stringContaining('methods.[0].limitations'),
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      const reviewPrompt = JSON.parse(fetch.mock.calls[1][1]?.body as string)
        .messages[1].content;
      expect(reviewPrompt).not.toContain('"formatVersion":3');
      expect(reviewPrompt).toContain('indexes');
      return;
    }
    expect(error.mock.calls.filter(([value]) => value)).toEqual([]);
    expect(record.analysis?.summary).toBe('全片总结');
    if (scenario.startsWith('prerequisite-'))
      expect(record.analysis?.prerequisites?.[0]).toMatchObject(prerequisite);
    expect(record.analysis?.topics[0].startSegmentId).toBe('s1');
    expect(fetch).toHaveBeenCalledTimes(
      scenario.startsWith('coverage') ? 3 : 2,
    );
    if (scenario === 'coverage-missing-opening') {
      expect(record.analysis?.topics).toHaveLength(2);
      expect(record.analysis?.topics[0]).toMatchObject({
        title: '开场目标',
        startSegmentId: 's1',
        endSegmentId: 's7',
        startMs: 0,
        endMs: 7000,
      });
      expect(record.analysis?.topics[1]).toMatchObject({
        startSegmentId: 's8',
        endSegmentId: 's40',
      });
    }
    if (scenario === 'coverage-restart')
      expect(record.analysis?.topics[4]).toMatchObject({
        startSegmentId: 's39',
        endSegmentId: 's40',
        startMs: 38000,
        endMs: 40000,
      });
    expect(fixture.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  },
);
it('未指定脉络模型时给出浏览器 API 设置指引，不要求安装组件', async () => {
  const { rpc } = await import('../../extension/src/lib/rpc');
  await expect(
    rpc({
      type: 'native',
      operation: 'generate',
      payload: {
        task: 'analyze',
        segments: [
          { id: 's1', startMs: 0, endMs: 1000, original: '内容', revision: 0 },
        ],
      },
    }),
  ).rejects.toThrow('模型分工');
  expect(fixture.chrome.runtime.sendMessage).not.toHaveBeenCalled();
});
