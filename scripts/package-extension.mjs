import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const root = process.cwd();
const manifest = JSON.parse(
  await readFile('extension/dist/manifest.json', 'utf8'),
);
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
if (version !== manifest.version) throw new Error('请先构建当前版本的扩展');
const entries = [];
async function collect(folder, prefix = '') {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('安装包不接受符号链接');
    const name = prefix + item.name;
    if (item.isDirectory()) await collect(join(folder, item.name), name + '/');
    else if (/\.(js|css|html|json|png|svg|webp|woff2?)$/.test(name))
      entries.push({
        name: 'VideoNote/' + name,
        data: await readFile(join(folder, item.name)),
      });
  }
}
await collect('extension/dist');
entries.push({ name: 'VideoNote/LICENSE', data: await readFile('LICENSE') });
const extensionRequire = createRequire(resolve('extension/package.json'));
let notices = 'VideoNote 第三方运行时许可\n\n';
for (const name of ['react', 'react-dom', 'scheduler', 'zod']) {
  const resolver =
    name === 'scheduler'
      ? createRequire(extensionRequire.resolve('react-dom'))
      : extensionRequire;
  let folder = dirname(resolver.resolve(name));
  while (true) {
    try {
      if (
        JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
          .name === name
      )
        break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(folder);
    if (parent === folder) throw new Error('找不到依赖许可目录');
    folder = parent;
  }
  const license = (await readdir(folder)).find((f) =>
    /^license(?:\.md|\.txt)?$/i.test(f),
  );
  if (!license) throw new Error(`缺少 ${name} 许可证`);
  notices += `=== ${name} ===\n${await readFile(join(folder, license), 'utf8')}\n\n`;
}
entries.push({
  name: 'VideoNote/THIRD-PARTY-NOTICES.txt',
  data: Buffer.from(notices),
});
entries.push({
  name: '安装说明.txt',
  data: Buffer.from(
    `VideoNote ${version}\n\n1. 解压整个 ZIP，把 VideoNote 文件夹放到长期保留的位置。\n2. Chrome 打开 chrome://extensions，开启开发者模式。\n3. 点击加载已解压的扩展程序，选择内含 manifest.json 的 VideoNote 文件夹。\n\n无需安装 Node、pnpm 或本机组件。新安装默认浏览器模式，并自动打开设置页。\n需要 AI 时打开设置，创建密码加密密钥库，填写自己的服务 API Key、测试并保存，按 Chrome 提示授权相应服务域名。重启浏览器后需解锁一次。\n旧 Mac 用户在原 extension/dist 路径重新加载可保留扩展身份和本机模式；不要卸载扩展或清理数据。\n更新时覆盖原安装文件夹并在扩展页重新加载，保留同一路径以免改变扩展 ID。\nWindows 浏览器实机验收尚待完成；本地翻译取决于 Chrome 的设备和语言能力。\nObsidian 导出需另用对应系统安装包中的连接安装程序；连接组件或 Obsidian 不可用时入口置灰。安装后点击“检查 Obsidian 连接”并选择知识库；本机 Codex 与系统钥匙串仍属于可选本机模式。\n`,
  ),
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const locals = [],
  central = [];
let offset = 0;
for (const { name, data } of entries.sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  const filename = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  locals.push(local, filename, data);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(33, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(data.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(filename.length, 28);
  record.writeUInt32LE(offset, 42);
  central.push(record, filename);
  offset += local.length + filename.length + data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir('artifacts/releases', { recursive: true });
const destination = join(
  root,
  'artifacts/releases',
  `VideoNote-${version}-chrome.zip`,
);
await writeFile(destination, Buffer.concat([...locals, directory, end]));
console.log(
  `已生成 ${destination}（${entries.length} 个文件，${(await stat(destination)).size} 字节）`,
);
