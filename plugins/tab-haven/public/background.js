// 播放器主动播放后解除本扩展设置的标签静音，不干预其他来源的静音。
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'tab-haven-resume-audio' || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
  (async () => {
    const tab = await chrome.tabs.get(sender.tab.id);
    if (tab.incognito || (tab.pendingUrl || tab.url) !== sender.url) return { unmuted: false };
    if (!tab.mutedInfo?.muted || tab.mutedInfo.reason !== 'extension' || tab.mutedInfo.extensionId !== chrome.runtime.id) return { unmuted: false };
    await chrome.tabs.update(tab.id, { muted: false });
    return { unmuted: true };
  })().then(respond, () => respond({ unmuted: false }));
  return true;
});
