import test from 'node:test';
import assert from 'node:assert/strict';
import { publicIconSource, createPublicIconLoader } from '../src/public-icons.js';
import { createIconResolver } from '../src/shortcut-icons.js';
const png='data:image/png;base64,aGVsbG8=';
test('公共服务只接收域名，排除路径、查询、凭据、本机地址及 IP',()=>{
  const source=new URL(publicIconSource('https://chat.deepseek.com:8443/private/chat?secret=abc#history'));
  assert.equal(source.hostname,'t0.gstatic.com');
  assert.equal(source.searchParams.get('url'),'https://chat.deepseek.com');
  for(const word of ['private','secret','abc','8443','history'])assert.equal(source.href.includes(word),false);
  for(const url of ['http://localhost','http://127.0.0.1','http://10.0.0.2','http://[::1]','https://internal.local','https://site.invalid','https://user:pass@example.com','file:///test'])assert.equal(publicIconSource(url),null,url);
});
test('公共服务的 404 默认图、HTML、超大图均不视为成功，不带凭据或 Referer',async()=>{
  for(const [ok,type,size] of [[false,'image/png',12],[true,'text/html',12],[true,'image/png',600000]]){
    const load=createPublicIconLoader({fetchImage:async(url,options)=>{
      assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');
      return {ok,headers:new Headers({'content-type':type}),blob:async()=>new Blob([new Uint8Array(size)])};
    },decode:()=>{throw Error('不应解码');}});
    assert.equal(await load('https://example.com'),null);
  }
});
test('无浏览历史及原站不可达时使用公共后备，并缓存为本地图片；已有图标不向第三方请求',async()=>{
  const map=new Map(),storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
  let publicCalls=0;
  const resolver=createIconResolver({storage,load:async()=>{throw Error('原站不可达');},publicIcon:async()=>{publicCalls++;return png;}});
  assert.equal(await resolver.resolve('https://chat.deepseek.com/'),png);assert.equal(publicCalls,1);
  const offline=createIconResolver({storage,load:async source=>{assert.equal(source,png);return png;},publicIcon:()=>{throw Error('缓存命中不应访问服务');}});
  assert.equal(await offline.resolve('https://chat.deepseek.com/'),png);
  const direct=createIconResolver({storage,load:async()=>png,publicIcon:async()=>{publicCalls++;return null;}});
  assert.equal(await direct.resolve('https://example.com/'),png);assert.equal(publicCalls,1);
});
test('公共服务异常不妨碍入口加载或重取失败时保留原图',async()=>{
  const resolver=createIconResolver({storage:{getItem:()=>null,setItem:()=>{}},load:async()=>{throw Error('网络故障');},publicIcon:async()=>{throw Error('服务超时');}});
  assert.equal(await resolver.resolve('https://example.com/'),null);
});
