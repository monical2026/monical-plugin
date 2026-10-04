import { build } from 'vite';
import { resolve } from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildWindowsNative } from './windows-native.mjs';
const root = process.cwd();
const extensionOnly = process.argv.includes('--extension-only');
const version = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
).version;
for (const file of [
  'extension/manifest.json',
  'extension/package.json',
  'service/package.json',
  'shared/package.json',
]) {
  if (
    JSON.parse(await readFile(resolve(root, file), 'utf8')).version !== version
  )
    throw new Error(`版本号不一致：${file}，应为 ${version}`);
}
const output = resolve(root, 'extension/dist');
await build({
  root: resolve(root, 'extension'),
  build: {
    outDir: output,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: resolve(root, 'extension/panel.html'),
        options: resolve(root, 'extension/options.html'),
      },
    },
  },
});
for (const [name, entry, format] of [
  ['background', 'background/index.ts', 'es'],
  ['content', 'content/index.ts', 'iife'],
  ['bridge', 'content/bridge.ts', 'iife'],
  ['bilibili-bridge', 'content/bilibili-bridge.ts', 'iife'],
]) {
  await build({
    configFile: false,
    build: {
      outDir: output,
      emptyOutDir: false,
      lib: {
        entry: resolve(root, `extension/src/${entry}`),
        name: `YouTubeNote_${name.replaceAll('-', '_')}`,
        formats: [format],
        fileName: () => `${name}.js`,
      },
    },
  });
}
await copyFile(
  resolve(root, 'extension/manifest.json'),
  resolve(output, 'manifest.json'),
);
if (!extensionOnly) {
  await build({
    configFile: false,
    ssr: { noExternal: true },
    build: {
      ssr: resolve(root, 'service/src/host.ts'),
      outDir: resolve(root, 'service/dist'),
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: 'host.mjs' } },
    },
  });
  await mkdir(resolve(root, 'service/dist'), { recursive: true });
  if (process.platform === 'win32') {
    await buildWindowsNative(root);
  } else if (process.platform === 'darwin') {
    const swift = spawnSync(
      'swiftc',
      [
        resolve(root, 'service/native/keychain/bridge.swift'),
        '-o',
        resolve(root, 'service/dist/keychain-bridge'),
      ],
      { stdio: 'inherit' },
    );
    if (swift.status !== 0) throw new Error('钥匙串组件构建失败');
  } else {
    throw new Error('本机组件目前仅支持 macOS 和 Windows 构建');
  }
}
