import { expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { writeUtf8Zip } from '../../scripts/utf8-zip.mjs';
it('中文文件名在本地头和中央目录都标记 UTF-8，并保留 Mac 执行权限', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-zip-'));
  const output = root + '.zip';
  try {
    const filename = '安装 Obsidian 连接.cmd';
    await writeFile(join(root, filename), '@echo off');
    await chmod(join(root, filename), 0o755);
    await writeUtf8Zip(root, output);
    const zip = await readFile(output);
    expect(zip.readUInt16LE(6) & 0x800).toBe(0x800);
    const size = zip.readUInt32LE(18),
      length = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + length).toString('utf8')).toBe(filename);
    expect(
      inflateRawSync(zip.subarray(30 + length, 30 + length + size)).toString(),
    ).toBe('@echo off');
    const central = 30 + length + size;
    expect(zip.readUInt32LE(central)).toBe(0x02014b50);
    expect(zip.readUInt16LE(central + 8) & 0x800).toBe(0x800);
    expect((zip.readUInt32LE(central + 38) >>> 16) & 0o100).toBe(0o100);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { force: true });
  }
});
