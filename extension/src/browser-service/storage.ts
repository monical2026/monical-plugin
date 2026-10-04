// 浏览器服务配置与旧本机配置隔离；仅扩展受信任页面可读。
export async function trustedStorage() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
  await chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
}
export async function stored(key: string): Promise<unknown> {
  await trustedStorage();
  return (await chrome.storage.local.get(key))[key];
}
export async function store(key: string, value: unknown) {
  await trustedStorage();
  await chrome.storage.local.set({ [key]: value });
}
export function locked<T>(name: string, action: () => Promise<T>) {
  return navigator.locks.request(`videonote:${name}`, action);
}
export type Backend = 'browser' | 'native';
export async function backend(): Promise<Backend> {
  const value = await stored('serviceBackend');
  if (value === undefined || value === 'browser') return 'browser';
  if (value === 'native') return 'native';
  throw new Error('服务模式设置无法读取，请在设置页重新选择');
}
