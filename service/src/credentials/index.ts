import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { credentialCommand } from '../platform';
const responseSchema = z.object({
  secret: z.string().optional(),
  saved: z.boolean().optional(),
  missing: z.boolean().optional(),
  error: z.string().optional(),
});
export async function credential(
  operation: 'get' | 'set',
  account: string,
  secret?: string,
): Promise<string | undefined> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(account)) throw new Error('凭据标识无效');
  if (
    process.platform === 'win32' &&
    secret !== undefined &&
    Buffer.byteLength(secret, 'utf16le') > 2560
  )
    throw new Error('密钥超过 Windows 凭据长度限制，未保存');
  const executable = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? './videonote-host.exe'
        : './keychain-bridge',
      import.meta.url,
    ),
  );
  const command = credentialCommand(executable);
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('系统凭据操作超时，请完成系统授权后重试'));
    }, 120000);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 65536) {
        child.kill();
        reject(new Error('系统凭据响应过大'));
      } else output.push(chunk);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('无法启动系统凭据组件，请重新构建安装'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error('凭据组件异常退出');
        const result = responseSchema.parse(
          JSON.parse(Buffer.concat(output).toString('utf8')),
        );
        if (result.error) throw new Error('系统凭据操作失败');
        if (operation === 'set' && result.saved !== true)
          throw new Error('凭据未保存');
        if (
          operation === 'get' &&
          result.secret === undefined &&
          result.missing !== true
        )
          throw new Error('凭据未返回');
        resolve(result.secret);
      } catch {
        reject(new Error('系统凭据操作未完成，请检查系统授权'));
      }
    });
    child.stdin.on('error', () => {
      clearTimeout(timer);
      child.kill();
      reject(new Error('系统凭据连接中断'));
    });
    child.stdin.end(JSON.stringify({ operation, account, secret }));
  });
}
