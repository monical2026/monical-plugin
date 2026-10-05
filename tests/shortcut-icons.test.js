import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { bundledIcon, directIconCandidates, createIconResolver, createBrowserIconLoader, safeIconUrl } from '../src/shortcut-icons.js';
import { defaultShortcuts } from '../src/shortcuts.js';
const png = 'data:image/png;base64,aGVsbG8=';
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('全新配置的四个默认网站及 Reddit 均有实际随包图标，不读取缓存或联网', async () => {
  const resolver = createIconResolver({ storage: { getItem: () => { throw Error('不应读取缓存'); } }, load: () => { throw Error('不应联网'); } });
  for (const item of [...defaultShortcuts, {url:'https://reddit.com/'}]) {
    const path = await resolver.resolve(item.url);
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)));
  }
  assert.equal(bundledIcon('https://evilbilibili.com'), null);
  assert.equal(bundledIcon('https://bilibili.com.evil.org'), null);
  assert.equal(bundledIcon('chrome://youtube.com'), null);
  assert.equal(bundledIcon('https://www.zhihu.com', {getURL: path => `chrome-extension://id${path}`}), 'chrome-extension://id/site-icons/zhihu.ico');
});
test('新加任意网站不依赖 Chrome 缓存；首个源失败后回退并持久保存，刷新可离线读取', async () => {
  const saved = storage(), calls = [];
  const resolver = createIconResolver({storage:saved, load:async source => {
    calls.push(source); if (source.endsWith('/favicon.ico')) throw Error('404'); return png;
  }});
  const url = 'https://new.example/';
  assert.equal(await resolver.resolve(url), png);
  assert.ok(calls.includes('https://new.example/apple-touch-icon.png'));
  assert.equal(calls.length,4);
  const offline = createIconResolver({storage:saved, load:async source => { assert.equal(source, png); return source; }});
  assert.equal(await offline.resolve(url), png);
});
test('侧栏和弹窗合并并发加载；失败可重试；特殊路径发现优先于根目录猜测', async () => {
  let calls = 0, online = false, time = 100;
  const resolver = createIconResolver({ storage:storage(), now:()=>time, load:async source => {
    calls++; if (online && source.includes('/assets/logo.png')) return png; throw Error('失败');
  }});
  assert.deepEqual(await Promise.all([resolver.resolve('https://new.example/'),resolver.resolve('https://new.example/')]), [null,null]);
  assert.equal(calls,4);
  await resolver.resolve('https://new.example/'); assert.equal(calls,4);
  online = true; time++;
  assert.equal(await resolver.resolve('https://new.example/', {refresh:true,candidates:['https://new.example/assets/logo.png']}),png);
  assert.equal(calls,9);
});
test('损坏或不可写缓存不阻止图标获取；网址拒绝脚本和凭据', async () => {
  const resolver = createIconResolver({storage:{getItem:()=>'{broken',setItem:()=>{throw Error('quota');}},load:async()=>png});
  assert.equal(await resolver.resolve('https://example.com'),png);
  assert.deepEqual(directIconCandidates('javascript:alert(1)'),[]);
  assert.equal(safeIconUrl('https://user:password@example.com/a'),null);
  assert.equal(safeIconUrl('//cdn.example/icon.png','https://example.com'), 'https://cdn.example/icon.png');
});
test('新添加网站的常规路径失效时自动发现特殊路径，失败冷却后可恢复', async () => {
  let time=100, online=false, discovered=0;
  const resolver=createIconResolver({storage:storage(),now:()=>time,discover:async()=>{discovered++;return ['javascript:bad','https://new.example/assets/icon.svg'];},load:async source=>{
    if (online && source.endsWith('/assets/icon.svg')) return png;
    throw Error('离线');
  }});
  assert.equal(await resolver.resolve('https://new.example/'),null);
  assert.equal(discovered,1);
  online=true;time+=60_001;
  assert.equal(await resolver.resolve('https://new.example/'),png);
  assert.equal(discovered,2);
});
test('恢复浏览器已有图标；默认地球图必须排除，缺失继续走网站来源', async () => {
  const runtime={getURL:path=>`chrome-extension://test${path}`};
  const loader=createBrowserIconLoader(runtime,{fetchImage:async url=>({ok:true,arrayBuffer:async()=>new Uint8Array(new URL(url).searchParams.get('pageUrl')=== 'https://known.example/'?[1,2]:[3,4]).buffer}),decode:async()=>png});
  assert.equal(await loader('https://known.example/'),png);
  assert.equal(await loader('https://unknown.example/'),null);
  const resolver=createIconResolver({storage:storage(),browserIcon:loader,load:async()=>{throw Error('网络不可访问');}});
  assert.equal(await resolver.resolve('https://known.example/'),png);
});
test('重取失败保留此前可用的图标，不清空持久缓存', async () => {
  const saved=storage();
  const initial=createIconResolver({storage:saved,load:async()=>png});
  await initial.resolve('https://example.com/');
  const resolver=createIconResolver({storage:saved,load:async source=>{if(source===png)return png;throw Error('离线');}});
  assert.equal(await resolver.resolve('https://example.com/',{refresh:true}),png);
  assert.equal(JSON.parse(saved.getItem('tab-haven-shortcut-icons-v1'))['https://example.com/'],png);
});
