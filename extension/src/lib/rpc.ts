import type { AnalysisTrace } from '../../../shared/src/ai/analysis-diagnostics';
import { backend } from '../browser-service/storage';
import { z } from 'zod';
async function remote(input: unknown): Promise<unknown> {
  const response: unknown = await chrome.runtime.sendMessage(input);
  const parsed = z
    .object({ data: z.unknown().optional(), error: z.string().optional() })
    .parse(response);
  if (parsed.error) throw new Error(parsed.error);
  return parsed.data;
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试';
}

export async function rpc(
  input: unknown,
  trace?: AnalysisTrace,
): Promise<unknown> {
  const route = z
    .object({
      type: z.string(),
      operation: z.string().optional(),
      serviceMode: z.enum(['browser', 'native']).optional(),
      payload: z.unknown().optional(),
      tabId: z.number().optional(),
    })
    .parse(input);
  if (route.type !== 'settings' && route.type !== 'native')
    return remote(input);
  return navigator.locks.request(
    'videonote:backend',
    { mode: route.operation === 'saveSettings' ? 'exclusive' : 'shared' },
    async () => {
      const selected = await backend();
      trace?.(`rpc.${selected}`);
      if (route.serviceMode && route.serviceMode !== selected)
        throw new Error('服务模式已在其他窗口变化，请重新加载设置');
      if (selected === 'native' || route.operation?.startsWith('obsidian'))
        return remote(input);
      if (
        ['prepareGeneration', 'confirmGeneration'].includes(
          route.operation ?? '',
        )
      )
        await remote({
          type: 'native',
          operation: 'validateBrowserGeneration',
          payload: route.payload,
          tabId: route.tabId,
        });
      const { browserService } = await import('../browser-service/service');
      return browserService(
        route.type === 'settings' ? 'settings' : (route.operation ?? ''),
        route.payload,
        trace,
      );
    },
  );
}
