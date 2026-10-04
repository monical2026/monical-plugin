import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { nativeDirectory } from '../../service/src/platform';
import { parseFolderResult } from '../../service/src/folder-picker';
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(), spawn: mocks.spawn,
}));
import { credential } from '../../service/src/credentials';
afterEach(() => { vi.restoreAllMocks(); mocks.spawn.mockReset(); });
it('Mac 保留原配置位置，Windows 使用当前用户目录并支持中文空格', () => {
  expect(nativeDirectory('darwin', '/Users/test', 'ignored')).toBe('/Users/test/Library/Application Support/YouTubeNote');
  expect(nativeDirectory('win32', 'C:\\Users\\学习 者', undefined)).toBe('C:\\Users\\学习 者\\AppData\\Local\\VideoNote');
  expect(nativeDirectory('win32', 'unused', 'D:\\用户数据')).toBe('D:\\用户数据\\VideoNote');
  expect(() => nativeDirectory('linux')).toThrow('仅支持');
});
it('取消目录选择不成为有效路径，错误和矛盾的响应不能用于导出', () => {
  expect(parseFolderResult('{"cancelled":true}')).toBeUndefined();
  expect(parseFolderResult('{"folder":"C:\\\\学习 笔记"}')).toBe('C:\\学习 笔记');
  for (const response of ['{}','{"folder":""}','{"error":"detail"}','{"folder":"C:","cancelled":true}'])
    expect(() => parseFolderResult(response)).toThrow();
});
function fakeProcess(reply: object, exitCode = 0) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: vi.fn() });
  let input = '';
  child.stdin.on('data', b => { input += b.toString(); });
  child.stdin.on('finish', () => {
    const bytes = Buffer.from(JSON.stringify(reply));
    for (const byte of bytes) child.stdout.emit('data', Buffer.from([byte]));
    child.emit('close', exitCode);
  });
  mocks.spawn.mockReturnValue(child);
  return () => input;
}
describe.each(['darwin', 'win32'] as const)('凭据边界 %s', platform => {
  it('密钥只走标准输入，写入成功才返回，读取缺失不冒充密钥', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    const input = fakeProcess({ saved: true });
    await credential('set', 'test-account', 'fixture-only-not-a-real-key');
    expect(JSON.parse(input()).secret).toBe('fixture-only-not-a-real-key');
    const [binary, args] = mocks.spawn.mock.calls[0];
    expect(binary).toMatch(platform === 'win32' ? /videonote-host.exe$/ : /keychain-bridge$/);
    expect(args).toEqual(platform === 'win32' ? ['--credentials'] : []);
    expect(JSON.stringify(mocks.spawn.mock.calls)).not.toContain('fixture-only');
    fakeProcess({ secret: '中文测试🔑' });
    expect(await credential('get', 'test-account')).toBe('中文测试🔑');
    fakeProcess({ missing: true });
    expect(await credential('get', 'test-account')).toBeUndefined();
  });
  it('拒绝伪成功和敏感错误原文，非法账号不启动组件', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    fakeProcess({ saved: true }, 1);
    await expect(credential('set', 'test-account', 'fixture')).rejects.toThrow('未完成');
    fakeProcess({});
    await expect(credential('set', 'test-account', 'fixture')).rejects.toThrow('未完成');
    fakeProcess({ error: 'PRIVATE_DIAGNOSTIC' });
    await expect(credential('get', 'test-account')).rejects.not.toThrow('PRIVATE_DIAGNOSTIC');
    mocks.spawn.mockClear();
    await expect(credential('get', '../bad')).rejects.toThrow('无效');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
