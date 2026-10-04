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
it.each([false, true])(
  '实际视频操作经浏览器 RPC 完成分析与全片复核，范围校正=%s，完全不调用本机',
  async (invalidFirst) => {
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
    if (invalidFirst) {
      const invalid = structuredClone(responses[0]);
      invalid.topics[0].startId = '2';
      responses.unshift(invalid);
    }
    const fetch = vi.fn(
      async () =>
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
    expect(error.mock.calls.filter(([value]) => value)).toEqual([]);
    expect(record.analysis?.summary).toBe('全片总结');
    expect(record.analysis?.topics[0].startSegmentId).toBe('s1');
    expect(fetch).toHaveBeenCalledTimes(invalidFirst ? 3 : 2);
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
