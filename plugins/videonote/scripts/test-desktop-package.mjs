import { mkdtemp, readFile, rm, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { installFiles } from './installer/register.mjs';
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const root = await mkdtemp(join(tmpdir(), 'vn-package-test-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { timeout: 60000, ...options });
  assert.equal(
    result.status,
    0,
    `${command} failed: ${result.error?.message || result.stderr?.toString()}`,
  );
  return result;
}
try {
  for (const platform of ['windows-x64', 'mac-arm64']) {
    const archive = resolve(
      `artifacts/releases/VideoNote-${version}-${platform}.zip`,
    );
    const bytes = await readFile(archive);
    const end = bytes.length - 22;
    let cursor = bytes.readUInt32LE(end + 16);
    const count = bytes.readUInt16LE(end + 10);
    for (let index = 0; index < count; index++) {
      assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
      assert.equal(bytes.readUInt16LE(cursor + 8) & 0x800, 0x800);
      const local = bytes.readUInt32LE(cursor + 42);
      assert.equal(bytes.readUInt16LE(local + 6) & 0x800, 0x800);
      cursor +=
        46 +
        bytes.readUInt16LE(cursor + 28) +
        bytes.readUInt16LE(cursor + 30) +
        bytes.readUInt16LE(cursor + 32);
    }
    const digest = createHash('sha256')
      .update(await readFile(archive))
      .digest('hex');
    assert.equal(
      (await readFile(archive + '.sha256', 'utf8')).split(' ')[0],
      digest,
    );
    run('/usr/bin/unzip', ['-t', archive]);
    const extracted = join(root, platform);
    await mkdir(extracted);
    run('/usr/bin/ditto', ['-x', '-k', archive, extracted]);
    assert.equal(
      JSON.parse(
        await readFile(join(extracted, 'VideoNote/manifest.json'), 'utf8'),
      ).version,
      version,
    );
    assert.match(
      await readFile(join(extracted, '安装说明.txt'), 'utf8'),
      /检查 Obsidian 连接/,
    );
    await stat(join(extracted, 'Obsidian 安装指南.md'));
    if (platform === 'windows-x64') {
      await stat(join(extracted, 'connector/connection-file.mjs'));
      const command = await readFile(
        join(extracted, '安装 Obsidian 连接.cmd'),
        'ascii',
      );
      assert.match(command, /%~dp0connector\\node.exe/);
      const node = await readFile(join(extracted, 'connector/node.exe'));
      assert.equal(node.subarray(0, 2).toString(), 'MZ');
      assert.match(
        await readFile(join(extracted, 'connector/Host.cs'), 'utf8'),
        /Task\.Run/,
      );
      continue;
    }
    const app = join(extracted, '安装 Obsidian 连接.app/Contents');
    assert.ok((await stat(join(app, 'MacOS/install'))).mode & 0o100);
    run('/bin/sh', ['-n', join(app, 'MacOS/install')]);
    const resources = join(app, 'Resources');
    await stat(join(resources, 'connection-file.mjs'));
    assert.match(
      run(join(resources, 'node'), ['--version']).stdout.toString(),
      /^v22\.23\.3/,
    );
    const home = join(root, '测试 home');
    const destination = join(home, 'Library/Application Support/YouTubeNote');
    const extensionId = 'a'.repeat(32);
    await installFiles({
      source: resources,
      destination,
      home,
      platform: 'darwin',
      extensionId,
    });
    const body = Buffer.from(
      JSON.stringify({
        id: 'fixture',
        operation: 'obsidianStatus',
        payload: {},
      }),
    );
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    const result = run(
      join(destination, 'launch.sh'),
      [`chrome-extension://${extensionId}/`],
      {
        input: Buffer.concat([header, body]),
        env: { ...process.env, HOME: home },
        timeout: 15000,
      },
    );
    assert.equal(result.stdout.readUInt32LE(0), result.stdout.length - 4);
    const response = JSON.parse(result.stdout.subarray(4).toString());
    assert.ok(['appMissing', 'noVaults'].includes(response.data?.state));
    const rejected = spawnSync(
      join(destination, 'launch.sh'),
      [`chrome-extension://${'b'.repeat(32)}/`],
      {
        input: Buffer.concat([header, body]),
        env: { ...process.env, HOME: home },
        timeout: 15000,
      },
    );
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout.length, 0);
  }
  console.log(
    '两个 ZIP 完整性与版本通过；Windows 包结构通过；Mac 解压权限、自带运行时、隔离安装、Native Messaging 状态响应与拒绝未授权来源通过。',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
