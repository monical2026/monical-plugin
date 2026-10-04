import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { fakeChrome } from '../helpers/browser-chrome';
import {
  unlockVault,
  lockVault,
  vaultStatus,
  readSecret,
  saveSecrets,
} from '../../extension/src/browser-service/vault';
import {
  saveSettings,
  readSettings,
  resetBrowserKeys,
} from '../../extension/src/browser-service/settings';
import { defaultSettings } from '../../shared/src';
let fixture: ReturnType<typeof fakeChrome>;
beforeEach(() => {
  fixture = fakeChrome();
});
afterEach(() => vi.unstubAllGlobals());
it('首次无需组件，密钥只在加密库持久化；会话结束后拒绝读取，正确密码恢复', async () => {
  expect(await vaultStatus()).toEqual({ initialized: false, unlocked: false });
  await unlockVault('fixture-password-123');
  await saveSecrets({ one: 'fake-key-中文' });
  expect(JSON.stringify(fixture.data.local)).not.toContain('fake-key');
  expect(JSON.stringify(fixture.data.local)).not.toContain('fixture-password');
  expect(await readSecret('one')).toBe('fake-key-中文');
  await lockVault();
  await expect(readSecret('one')).rejects.toThrow('解锁');
  const before = structuredClone(fixture.data.local);
  await expect(unlockVault('wrong-password-123')).rejects.toThrow('不正确');
  expect(fixture.data.local).toEqual(before);
  await unlockVault('fixture-password-123');
  expect(await readSecret('one')).toBe('fake-key-中文');
  expect(fixture.chrome.storage.session.setAccessLevel).toHaveBeenCalledWith({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
});
it('配置写入带修订检查，更换地址不能复用旧密钥，重置不清笔记/本机配置', async () => {
  await unlockVault('fixture-password-123');
  const request = {
    settings: {
      ...defaultSettings,
      profiles: [
        {
          id: 'p',
          name: 'test',
          kind: 'llm',
          baseUrl: 'https://api.example.com/v1',
          model: 'model',
          configured: false,
        },
      ],
      analyzeProfile: 'p',
    },
    keys: { p: 'fake-key' },
  };
  const saved = await saveSettings(request);
  await expect(saveSettings(request)).rejects.toThrow('另一个窗口');
  await expect(
    saveSettings({
      settings: {
        ...saved,
        profiles: [
          { ...saved.profiles[0], baseUrl: 'https://other.example.com/v1' },
        ],
      },
      keys: {},
    }),
  ).rejects.toThrow('重新填写');
  expect((await readSettings()).profiles[0].baseUrl).toBe(
    'https://api.example.com/v1',
  );
  fixture.data.local.unrelatedNotes = ['keep'];
  fixture.data.local.serviceBackend = 'native';
  await resetBrowserKeys();
  expect(fixture.data.local.unrelatedNotes).toEqual(['keep']);
  expect(fixture.data.local.serviceBackend).toBe('native');
  expect((await readSettings()).profiles[0].configured).toBe(false);
  expect(await vaultStatus()).toEqual({ initialized: false, unlocked: false });
});
it('持久化失败不替换旧配置，长密钥加密不超过函数参数栈', async () => {
  await unlockVault('fixture-password-123');
  await saveSecrets(
    Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => ['k' + i, 'x'.repeat(15000)]),
    ),
  );
  expect((await readSecret('k11'))?.length).toBe(15000);
  const before = structuredClone(fixture.data.local.browserServiceVault);
  fixture.chrome.storage.local.set.mockRejectedValueOnce(new Error('quota'));
  await expect(saveSecrets({ k11: 'replace' })).rejects.toThrow('quota');
  expect(fixture.data.local.browserServiceVault).toEqual(before);
});
