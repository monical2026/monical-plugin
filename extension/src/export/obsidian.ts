import { z } from 'zod';
import { rpc } from '../lib/rpc';
export const obsidianTargetSchema = z.object({
  folder: z.string(),
  vault: z.string(),
});
export type ObsidianTarget = z.infer<typeof obsidianTargetSchema>;
const resultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('duplicate'), files: z.array(z.string()) }),
  z.object({
    status: z.literal('saved'),
    filename: z.string(),
    folder: z.string(),
  }),
]);
export async function getObsidianTarget() {
  return obsidianTargetSchema
    .nullable()
    .parse(
      await rpc({ type: 'native', operation: 'obsidianTarget', payload: {} }),
    );
}
export async function chooseObsidianTarget(vault: string) {
  const result = z
    .union([obsidianTargetSchema, z.object({ cancelled: z.literal(true) })])
    .parse(
      await rpc({
        type: 'native',
        operation: 'obsidianChoose',
        payload: { vault },
      }),
    );
  return 'cancelled' in result ? null : result;
}
export async function sendToObsidian(payload: {
  videoId: string;
  title: string;
  markdown: string;
  copy: boolean;
}) {
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 7_000_000)
    throw new Error('内容过大，请减少所选内容后导出，或使用下载文件');
  return resultSchema.parse(
    await rpc({ type: 'native', operation: 'obsidianExport', payload }),
  );
}
export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('文件生成失败'));
    reader.onerror = () => reject(new Error('文件生成失败'));
    reader.readAsDataURL(blob);
  });
}

export async function browserObsidianTarget() {
  return obsidianTargetSchema
    .nullable()
    .parse(await rpc({ type: 'browserObsidian', action: 'status' }));
}
export async function sendBrowserObsidian(payload: {
  videoId: string;
  title: string;
  markdown: string;
  copy: boolean;
}) {
  return z
    .union([
      z.object({ status: z.literal('authorizationRequired') }),
      z.object({ status: z.literal('duplicate'), files: z.array(z.string()) }),
      z.object({ status: z.literal('saved'), filename: z.string() }),
    ])
    .parse(await rpc({ type: 'browserObsidian', action: 'export', payload }));
}

export async function getObsidianStatus() {
  return z
    .object({
      state: z.enum(['ready', 'appMissing', 'noVaults']),
      vaults: z.array(obsidianTargetSchema.extend({ name: z.string() })),
    })
    .parse(
      await rpc({ type: 'native', operation: 'obsidianStatus', payload: {} }),
    );
}

// 整个只读检查共用期限，包含后台未响应、锁等待及第二次目标读取。
export async function checkObsidianConnection() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    const status = await getObsidianStatus();
    const target = status.state === 'ready' ? await getObsidianTarget() : null;
    return { ...status, target };
  })();
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                '检查连接超时（20 秒）。请运行最新版完整包中的“安装 Obsidian 连接”，完成后重启浏览器，再检查连接。',
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
