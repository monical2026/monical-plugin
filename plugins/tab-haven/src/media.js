// 此函数在目标网页的隔离环境运行，不能引用模块外部变量。
export async function controlMedia(pause, autoUnmute = false) {
  const saved = globalThis.__tabHavenPausedMedia ||= new Map();
  const media = new Set();
  function collect(root) {
    for (const element of root.querySelectorAll('*')) {
      if (element.matches('video,audio')) media.add(element);
      if (element.shadowRoot) collect(element.shadowRoot);
      if (element.tagName === 'IFRAME') {
        try { if (element.contentDocument) collect(element.contentDocument); } catch { /* 跨域播放器无法访问。 */ }
      }
    }
  }
  collect(document);
  let changed = 0, failed = 0;
  for (const [element] of saved) if (!element.isConnected) saved.delete(element);
  if (pause) {
    for (const element of media) {
      if (element.paused || element.ended) continue;
      try {
        element.pause();
        if (element.paused) {
          saved.set(element, element.currentSrc || element.src); changed++;
          if (element.__tabHavenResumeListener) { element.removeEventListener('play', element.__tabHavenResumeListener); delete element.__tabHavenResumeListener; }
          if (autoUnmute) {
            const source = element.currentSrc || element.src;
            const onPlay = () => {
              if (!saved.has(element) || source !== (element.currentSrc || element.src)) return;
              // 仅响应用户在播放器页面主动操作后的播放，避免网站自动播放解除静音。
              if (!element.ownerDocument.defaultView.navigator.userActivation?.isActive) return;
              globalThis.chrome.runtime.sendMessage({ type: 'tab-haven-resume-audio' }).then(result => {
                if (result?.unmuted) { saved.delete(element); element.removeEventListener('play', onPlay); delete element.__tabHavenResumeListener; }
              }).catch(() => {});
            };
            element.__tabHavenResumeListener = onPlay;
            element.addEventListener('play', onPlay);
          }
        }
        else failed++;
      } catch { failed++; }
    }
  } else {
    for (const [element, source] of saved) {
      if (!media.has(element) || source !== (element.currentSrc || element.src) || element.ended) { saved.delete(element); continue; }
      let timeout;
      try {
        await Promise.race([element.play(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('播放超时')), 3000); })]);
        saved.delete(element); changed++;
      } catch { element.pause(); failed++; }
      finally { clearTimeout(timeout); }
    }
  }
  return { found: media.size, changed, failed };
}

export async function setMediaState(browser, tab, muted) {
  const url = tab.pendingUrl || tab.url;
  let allowed = false;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol)) {
      // 在点击事件调用链中直接请求当前网站权限，保留用户手势。
      allowed = await browser.permissions.request({ origins: [`${parsed.protocol}//${parsed.hostname}/*`] });
    }
  } catch { /* 不支持的网站仍允许原生静音，并明确报告未暂停。 */ }
  const current = await browser.tabs.get(tab.id);
  if ((current.pendingUrl || current.url) !== url) throw new Error('页面已跳转，请重试');
  await browser.tabs.update(tab.id, { muted });
  if (!allowed) return { warning: muted ? '已静音，但未获得网站权限，视频未暂停。' : '已恢复声音，但未获得网站权限，请在原页面继续播放。' };
  try {
    const results = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: controlMedia, args: [muted, muted && !current.mutedInfo?.muted] });
    const result = results[0]?.result;
    if (!result || result.failed || (muted && !result.found)) return { warning: muted ? '已静音，但播放器未能完整暂停，请检查原页面。' : '已恢复声音，但播放器未能继续播放，请在原页面操作。' };
    return {};
  } catch {
    return { warning: muted ? '已静音，但此页面不允许控制播放器，视频可能仍在播放。' : '已恢复声音，但无法控制播放器，请在原页面继续播放。' };
  }
}
