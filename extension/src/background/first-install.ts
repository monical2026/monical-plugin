// 只在首次安装打开设置；更新和启动不打断用户，也不重置配置。
export async function firstInstall(reason: string) {
  if (reason !== 'install') return;
  await chrome.runtime.openOptionsPage();
}
