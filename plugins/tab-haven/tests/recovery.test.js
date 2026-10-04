import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecovery } from '../src/recovery.js';
import { closeSnapshot } from '../src/model.js';
test('只记录实际关闭成功的最新状态，跳过导航和失败项', async () => {
  const original = [1,2,3].map(id=>({id,url:`https://x.com/${id}`}));
  const current = original.map(t=>({...t,pinned:true})); current[1].url='https://x.com/new';
  const saved=[];
  await closeSnapshot({list:async()=>current,remove:async id=>{if(id===3)throw Error();}},original,'',false,t=>saved.push(t));
  assert.deepEqual(saved,[current[0]]);
});
test('逐批恢复、按原位置排序，部分失败仅重试失败项', async () => {
  const opened=[]; let fail=true;
  const recovery=createRecovery({reopen:async t=>{if(t.id===2&&fail)throw Error();opened.push(t.id);}});
  recovery.add([{id:0,url:'https://x.com/0'}]);
  recovery.add([{id:2,url:'https://x.com/2',windowId:1,index:2},{id:1,url:'https://x.com/1',windowId:1,index:1}]);
  assert.deepEqual(await recovery.restore(),{restored:1,failed:1}); assert.equal(recovery.count,1);
  fail=false; await recovery.restore(); await recovery.restore();
  assert.deepEqual(opened,[1,2,0]); assert.equal(recovery.count,0);
});
test('重复点击恢复不会创建两份，拒绝可执行地址', async () => {
  let release; let calls=0;
  const recovery=createRecovery({reopen:()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  recovery.add([{url:'https://x.com/'}]);
  const pending=recovery.restore(); await recovery.restore(); assert.equal(calls,1); release(); await pending;
  recovery.add([{url:'javascript:alert(1)'}]);
  assert.deepEqual(await recovery.restore(),{restored:0,failed:1}); assert.equal(calls,1);
});
test('可跨批次选择一项恢复，同网址条目互不影响，失效选择不重复恢复', async () => {
 const opened=[];
 const recovery=createRecovery({reopen:async t=>opened.push(t.id)});
 recovery.add([{id:1,url:'https://x.com'}]);
 recovery.add([{id:2,url:'https://x.com'},{id:3,url:'https://x.com/3'}]);
 const choice=recovery.items.find(t=>t.id===2).recoveryId;
 assert.deepEqual(await recovery.restore(choice),{restored:1,failed:0});
 assert.deepEqual(recovery.items.map(t=>t.id),[3,1]);
 await recovery.restore(choice); assert.deepEqual(opened,[2]);
});
test('30 分钟到期精确移除，旧选择不能恢复，失败不续期', async () => {
 let time=0,calls=0;
 const recovery=createRecovery({reopen:async()=>{calls++;throw Error();}},()=>time);
 recovery.add([{url:'https://x.com'}]);const id=recovery.items[0].recoveryId;
 time=29*60000;await recovery.restore(id);assert.equal(recovery.items[0].expiresAt,30*60000);
 time=30*60000;assert.equal(recovery.items.length,0);await recovery.restore(id);assert.equal(calls,1);
});
test('超过 100 页淘汰最早记录，新批次单独计时', () => {
 let time=0;const recovery=createRecovery({},()=>time);
 recovery.add(Array.from({length:105},(_,id)=>({id,url:'https://x.com'})));
 assert.equal(recovery.items.length,100);assert.equal(recovery.items[0].id,5);
 time=60000;recovery.add([{id:200,url:'https://x.com'}]);
 assert.equal(recovery.items.length,100);assert.equal(recovery.items[0].id,200);
 time=30*60000;assert.deepEqual(recovery.items.map(t=>t.id),[200]);
});
test('恢复等待期间记录过期不影响后来新增的批次', async () => {
 let time=0,release;const recovery=createRecovery({reopen:()=>new Promise(r=>{release=r;})},()=>time);
 recovery.add([{url:'https://x.com/old'}]);const pending=recovery.restore();
 time=30*60000;assert.equal(recovery.items.length,0);recovery.add([{url:'https://x.com/new'}]);
 release();await pending;assert.equal(recovery.items[0].url,'https://x.com/new');
});
