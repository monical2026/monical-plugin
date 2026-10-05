import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getObsidianStatus,
  getObsidianTarget,
  type ObsidianTarget,
} from '../export/obsidian';
import { errorText } from '../lib/rpc';
import { z } from 'zod';
export function useObsidian() {
  const [state, setState] = useState('checking');
  const [detail, setDetail] = useState('');
  const [vaults, setVaults] = useState<(ObsidianTarget & { name: string })[]>(
    [],
  );
  const [target, setTarget] = useState<ObsidianTarget | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setState('checking');
    setTarget(null);
    setDetail('');
    try {
      const result = await getObsidianStatus();
      const selected =
        result.state === 'ready' ? await getObsidianTarget() : null;
      if (current !== generation.current) return;
      setVaults(result.vaults);
      setTarget(selected);
      setState(result.state);
    } catch (error) {
      if (current !== generation.current) return;
      setState('unavailable');
      setVaults([]);
      setDetail(
        error instanceof z.ZodError
          ? '连接组件版本过旧或检测结果不兼容，请重新安装连接组件。'
          : errorText(error),
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const hint =
    state === 'checking'
      ? '正在检查 Obsidian 连接…'
      : state === 'appMissing'
        ? '未检测到 Obsidian。请先安装并打开 Obsidian，再检查连接。'
        : state === 'noVaults'
          ? '请先在 Obsidian 中创建或打开知识库，再检查连接。'
          : state === 'unavailable'
            ? 'Obsidian 连接不可用。请双击安装包中的连接安装程序，安装后重新检查。'
            : 'Obsidian 已连接，可选择知识库导出。';
  return { state, detail, hint, vaults, target, setTarget, refresh };
}
