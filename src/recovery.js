// 只记录本仪表盘实际关闭成功的页面，恢复失败的条目保留供重试。
export function createRecovery(api) {
  const batches = [];
  let restoring = false, sequence = 0;
  return {
    get count() { return batches.at(-1)?.length || 0; },
    get items() { return batches.slice().reverse().flat().map(tab => ({ ...tab })); },
    get busy() { return restoring; },
    add(tabs) { if (tabs.length) batches.push(tabs.map(tab => ({ ...tab, recoveryId: ++sequence }))); },
    async restore(recoveryId) {
      if (restoring || !batches.length) return { restored: 0, failed: 0 };
      restoring = true;
      const batch = recoveryId === undefined ? batches.at(-1) : batches.find(batch => batch.some(tab => tab.recoveryId === recoveryId));
      if (!batch) { restoring = false; return { restored: 0, failed: 0 }; }
      const remaining = [];
      let restored = 0;
      try {
        for (const tab of [...batch].sort((a, b) => a.windowId - b.windowId || (a.index || 0) - (b.index || 0))) {
          if (recoveryId !== undefined && tab.recoveryId !== recoveryId) { remaining.push(tab); continue; }
          try {
            const url = new URL(tab.pendingUrl || tab.url);
            if (!['https:', 'http:', 'file:', 'chrome:', 'chrome-extension:'].includes(url.protocol)) throw new Error('不支持恢复此地址');
            await api.reopen(tab); restored++;
          } catch { remaining.push(tab); }
        }
        const index = batches.indexOf(batch);
        if (remaining.length) batches[index] = remaining;
        else batches.splice(index, 1);
        return { restored, failed: recoveryId === undefined ? remaining.length : Number(remaining.some(tab => tab.recoveryId === recoveryId)) };
      } finally { restoring = false; }
    },
  };
}
