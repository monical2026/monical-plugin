import { afterEach, expect, it, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import { checkObsidianConnection } from '../../extension/src/export/obsidian';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('后台一直不回复时20秒内结束检查，随后可重新检查', async () => {
  vi.useFakeTimers();
  const { chrome } = fakeChrome();
  chrome.runtime.sendMessage.mockImplementationOnce(
    () => new Promise(() => {}),
  );
  const failed = expect(checkObsidianConnection()).rejects.toThrow('20 秒');
  await vi.advanceTimersByTimeAsync(20_000);
  await failed;
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    data: { state: 'appMissing', vaults: [] },
  });
  expect(await checkObsidianConnection()).toMatchObject({
    state: 'appMissing',
    target: null,
  });
  expect(vi.getTimerCount()).toBe(0);
});
it('状态成功但读取目标卡住也受同一个期限约束，迟到回复不能变为成功', async () => {
  vi.useFakeTimers();
  const { chrome } = fakeChrome();
  let finish: (value: unknown) => void = () => {};
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    data: { state: 'ready', vaults: [] },
  });
  chrome.runtime.sendMessage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = checkObsidianConnection();
  const failed = expect(request).rejects.toThrow('检查连接超时');
  await vi.advanceTimersByTimeAsync(20_000);
  await failed;
  finish({ data: null });
  await expect(request).rejects.toThrow('检查连接超时');
  expect(vi.getTimerCount()).toBe(0);
});
it('就绪与目标读取成功时清理计时器，缺软件不读取目标', async () => {
  vi.useFakeTimers();
  const { chrome } = fakeChrome();
  const target = { folder: '/fixture', vault: '/fixture' };
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    data: { state: 'ready', vaults: [{ ...target, name: 'fixture' }] },
  });
  chrome.runtime.sendMessage.mockResolvedValueOnce({ data: target });
  expect(await checkObsidianConnection()).toMatchObject({
    state: 'ready',
    target,
  });
  expect(vi.getTimerCount()).toBe(0);
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    data: { state: 'appMissing', vaults: [] },
  });
  await checkObsidianConnection();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
});
