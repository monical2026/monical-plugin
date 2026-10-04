import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import { rpc } from '../../extension/src/lib/rpc';
import { unlockVault } from '../../extension/src/browser-service/vault';
import { saveSettings } from '../../extension/src/browser-service/settings';
import { defaultSettings } from '../../shared/src';
let fixture: ReturnType<typeof fakeChrome>;
beforeEach(() => {
  fixture = fakeChrome();
});
afterEach(() => vi.unstubAllGlobals());
it('全新安装不调用 Native Messaging，浏览器配置后实际 RPC 可翻译和提问', async () => {
  expect(await rpc({ type: 'settings' })).toEqual(defaultSettings);
  await unlockVault('fixture-password-123');
  await saveSettings({
    settings: {
      ...defaultSettings,
      profiles: [
        {
          id: 'p',
          name: 'demo',
          kind: 'llm',
          baseUrl: 'https://api.example.com/v1',
          model: 'fixture-model',
        },
      ],
      analyzeProfile: 'p',
      translateProfile: 'p',
    },
    keys: { p: 'fixture-key' },
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '[{"id":"s1","text":"你好"}]' } }],
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '解释内容' } }] }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  expect(
    await rpc({
      type: 'native',
      operation: 'generate',
      payload: {
        task: 'translate',
        segments: [
          { id: 's1', startMs: 0, endMs: 1000, original: 'hello', revision: 0 },
        ],
      },
    }),
  ).toEqual([{ id: 's1', text: '你好' }]);
  const { questionRequestSchema } = await import('../../shared/src/questions');
  const request = questionRequestSchema.parse({
    task: 'ask',
    videoId: 'abcdefghijk',
    question: '什么意思',
    excerpt: 'hello',
    sources: [{ id: 's1', startMs: 0, original: 'hello' }],
    history: [],
  });
  expect(
    await rpc({ type: 'native', operation: 'generate', payload: request }),
  ).toEqual({ answer: '解释内容' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fixture.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  expect(JSON.stringify(fixture.data.local)).not.toContain('fixture-key');
});
it('本机模式仍转发原 RPC，过期设置窗口不能覆盖另一模式', async () => {
  fixture.data.local.serviceBackend = 'native';
  fixture.chrome.runtime.sendMessage.mockResolvedValue({
    data: { marker: 'native' },
  });
  expect(await rpc({ type: 'settings' })).toEqual({ marker: 'native' });
  await expect(
    rpc({
      type: 'native',
      operation: 'saveSettings',
      serviceMode: 'browser',
      payload: {},
    }),
  ).rejects.toThrow('模式已');
  expect(fixture.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
});
it('后台浏览器模式读取配置不依赖 Native Messaging，未配置字幕返回业务提示', async () => {
  const { native } =
    await import('../../extension/src/background/native-client');
  expect(await native('settings', undefined)).toEqual(defaultSettings);
  await expect(
    native('transcript', { videoId: 'abcdefghijk', mode: 'native' }),
  ).rejects.toThrow('选择对应服务');
  expect(fixture.chrome.runtime.sendMessage).not.toHaveBeenCalled();
});
it('未解锁保存失败不丢配置，解锁后保存并重新读取会显示已保存', async () => {
  const { readSettings } =
    await import('../../extension/src/browser-service/settings');
  const { isProfileSaved } =
    await import('../../extension/src/options/save-state');
  const request = {
    settings: {
      ...defaultSettings,
      profiles: [
        {
          id: 'p',
          kind: 'llm',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-flash',
        },
      ],
    },
    keys: { p: 'fixture-key' },
  };
  await expect(
    rpc({
      type: 'native',
      operation: 'saveSettings',
      serviceMode: 'browser',
      payload: request,
    }),
  ).rejects.toThrow('解锁');
  expect(await readSettings()).toEqual(defaultSettings);
  expect(request.keys.p).toBe('fixture-key');
  await unlockVault('fixture-password-123');
  await rpc({
    type: 'native',
    operation: 'saveSettings',
    serviceMode: 'browser',
    payload: request,
  });
  const saved = await readSettings();
  expect(saved.profiles[0].configured).toBe(true);
  expect(isProfileSaved(saved.profiles[0], saved.profiles[0], '')).toBe(true);
});
