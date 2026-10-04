// 恢复记录仅在当前页面有效，过期或超过容量的旧记录自动移除。
export const RECOVERY_TTL = 30 * 60 * 1000;
export const RECOVERY_LIMIT = 100;
export function createRecovery(api, now = Date.now) {
  const batches = [];
  let restoring = false, sequence = 0;
  function prune() {
    const time = now();
    for (const batch of batches) {
      for (let i = batch.length - 1; i >= 0; i--) if (batch[i].expiresAt <= time) batch.splice(i, 1);
    }
    let excess = batches.reduce((sum, batch) => sum + batch.length, 0) - RECOVERY_LIMIT;
    for (const batch of batches) {
      if (excess > 0) excess -= batch.splice(0, excess).length;
    }
    for (let i = batches.length - 1; i >= 0; i--) if (!batches[i].length) batches.splice(i, 1);
  }
  return {
    get count() { prune(); return batches.at(-1)?.length || 0; },
    get items() { prune(); return batches.slice().reverse().flat().map(tab => ({ ...tab })); },
    get busy() { return restoring; },
    add(tabs) {
      if (tabs.length) batches.push(tabs.map(tab => ({ ...tab, recoveryId: ++sequence, expiresAt: now() + RECOVERY_TTL })));
      prune();
    },
    async restore(recoveryId) {
      prune();
      if (restoring || !batches.length) return { restored: 0, failed: 0 };
      const batch = recoveryId === undefined ? batches.at(-1) : batches.find(batch => batch.some(tab => tab.recoveryId === recoveryId));
      if (!batch) return { restored: 0, failed: 0 };
      restoring = true;
      let restored = 0, failed = 0;
      try {
        const selected = batch.filter(tab => recoveryId === undefined || tab.recoveryId === recoveryId);
        for (const tab of selected.sort((a, b) => a.windowId - b.windowId || (a.index || 0) - (b.index || 0))) {
          prune();
          if (!batch.includes(tab)) continue;
          try {
            const url = new URL(tab.pendingUrl || tab.url);
            if (!['https:', 'http:', 'file:', 'chrome:', 'chrome-extension:'].includes(url.protocol)) throw new Error('不支持恢复此地址');
            await api.reopen(tab); restored++;
            const index = batch.indexOf(tab);
            if (index >= 0) batch.splice(index, 1);
          } catch { failed++; }
        }
        return { restored, failed };
      } finally { restoring = false; prune(); }
    },
  };
}
