import { expect, it, afterEach, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import {
  getObsidianStatus,
  chooseObsidianTarget,
  sendToObsidian,
} from '../../extension/src/export/obsidian';
import { native } from '../../extension/src/background/native-client';
afterEach(() => vi.unstubAllGlobals());
it('浏览器模式的 Obsidian 请求也经过后台本机路由，不使用目录授权或模型服务', async () => {
  const { chrome, data } = fakeChrome();
  data.local.serviceBackend = 'browser';
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    data: { state: 'appMissing', vaults: [] },
  });
  expect(await getObsidianStatus()).toEqual({
    state: 'appMissing',
    vaults: [],
  });
  expect(chrome.runtime.sendMessage.mock.calls[0][0]).toMatchObject({
    type: 'native',
    operation: 'obsidianStatus',
  });
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    data: { folder: '/vault', vault: '/vault' },
  });
  await chooseObsidianTarget('/vault');
  expect(chrome.runtime.sendMessage.mock.calls[1][0]).toMatchObject({
    operation: 'obsidianChoose',
    payload: { vault: '/vault' },
  });
  chrome.runtime.sendMessage.mockResolvedValueOnce({
    error: '未安装 Obsidian',
  });
  await expect(
    sendToObsidian({
      videoId: 'abcdefghijk',
      title: 'a',
      markdown: 'b',
      copy: false,
    }),
  ).rejects.toThrow('未安装');
});
it('后台 Obsidian 始终调用 Native Messaging，缺组件不回退到浏览器目录', async () => {
  const { chrome } = fakeChrome();
  const sendNativeMessage = vi
    .fn()
    .mockRejectedValue(new Error('Native messaging host not found'));
  Object.assign(chrome.runtime, { sendNativeMessage });
  await expect(native('obsidianStatus', {})).rejects.toThrow('本机组件');
  expect(sendNativeMessage).toHaveBeenCalledOnce();
});
