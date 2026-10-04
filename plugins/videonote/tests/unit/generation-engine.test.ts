import { it, expect, vi, afterEach } from 'vitest';
import { generationEngine, type Ticket } from '../../shared/src/ai/generation';
import { defaultSettings, type Settings } from '../../shared/src';
import { fakeChrome } from '../helpers/browser-chrome';
const settings: Settings = {
  ...defaultSettings,
  revision: 1,
  subtitleProfile: 'p',
  profiles: [
    {
      id: 'p',
      name: 'subs',
      kind: 'supadata',
      baseUrl: 'https://api.supadata.ai/v1',
      model: '',
      configured: true,
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
function setup(request = vi.fn().mockResolvedValue({ jobId: 'fixture-job' })) {
  fakeChrome();
  let ticket: Ticket | null = null;
  const write = async (t: Ticket) => {
    ticket = structuredClone(t);
    return t;
  };
  const credential = vi.fn(async () => 'fixture-key');
  const engine = generationEngine(
    {
      read: async () => ticket,
      write,
      create: write,
      lock: (id, action) => navigator.locks.request(id, action),
    },
    credential,
    request,
  );
  return { engine, request, credential, read: () => ticket };
}
it('必须逐次确认并匹配票据、时长、修订；并发确认只有一次提交', async () => {
  const { engine, request } = setup();
  const input = { videoId: 'abcdefghijk', durationMs: 61000 };
  const ticket = await engine.prepareGeneration(input, settings);
  expect(request).not.toHaveBeenCalled();
  await expect(
    engine.confirmGeneration(
      { ...input, id: ticket.id, confirmed: false },
      settings,
    ),
  ).rejects.toThrow();
  await expect(
    engine.confirmGeneration(
      { ...input, id: ticket.id, confirmed: true, durationMs: 62000 },
      settings,
    ),
  ).rejects.toThrow('变化');
  const payload = { ...input, id: ticket.id, confirmed: true };
  const results = await Promise.all([
    engine.confirmGeneration(payload, settings),
    engine.confirmGeneration(payload, settings),
  ]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(results.every((r) => r.status === 'running')).toBe(true);
  expect(request.mock.calls[0][0].searchParams.get('mode')).toBe('generate');
});
it('提交结果未知后重开仍不重发；未解锁不把请求误标为已提交', async () => {
  const state = setup(vi.fn().mockRejectedValue(new Error('network')));
  const input = { videoId: 'abcdefghijk', durationMs: 1000 };
  const ticket = await state.engine.prepareGeneration(input, settings);
  const payload = { ...input, id: ticket.id, confirmed: true };
  state.credential.mockRejectedValueOnce(new Error('locked'));
  await expect(
    state.engine.confirmGeneration(payload, settings),
  ).rejects.toThrow('locked');
  expect(state.read()?.status).toBe('awaiting');
  await expect(
    state.engine.confirmGeneration(payload, settings),
  ).rejects.toThrow('未能确认');
  expect(state.read()?.status).toBe('unknown');
  expect((await state.engine.prepareGeneration(input, settings)).status).toBe(
    'unknown',
  );
  expect((await state.engine.confirmGeneration(payload, settings)).status).toBe(
    'unknown',
  );
  expect(state.request).toHaveBeenCalledTimes(1);
});
it('尚未提交的旧确认可以重新估算，旧票据无法确认新配置', async () => {
  const { engine } = setup();
  const input = { videoId: 'abcdefghijk', durationMs: 1000 };
  const old = await engine.prepareGeneration(input, settings);
  const next = { ...settings, revision: 2, generationCreditsPerMinute: 9 };
  const fresh = await engine.prepareGeneration(input, next);
  expect(fresh.id).not.toBe(old.id);
  expect(fresh.credits).toBe(9);
  await expect(
    engine.confirmGeneration({ ...input, id: old.id, confirmed: true }, next),
  ).rejects.toThrow('失效');
});
