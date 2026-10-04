import test from 'node:test';
import assert from 'node:assert/strict';
import { controlMedia, setMediaState } from '../src/media.js';
test('仅暂停正在播放的媒体，恢复不启动本来暂停或换源的媒体', async () => {
 const make=(paused)=>({paused,ended:false,isConnected:true,src:'video.mp4',matches:()=>true,pause(){this.paused=true;},async play(){this.paused=false;}});
 const playing=make(false), stopped=make(true), changed=make(false);
 globalThis.document={querySelectorAll:()=>[playing,stopped,changed]};
 try {
  assert.equal((await controlMedia(true)).changed,2);assert.equal(playing.paused,true);
  changed.src='other.mp4';assert.equal((await controlMedia(false)).changed,1);
  assert.equal(playing.paused,false);assert.equal(stopped.paused,true);assert.equal(changed.paused,true);
 } finally {delete globalThis.document;delete globalThis.__tabHavenPausedMedia;}
});
test('请求只限当前站点，拒绝时静音但报告未暂停；页面导航后不操作', async () => {
 let request,updates=0,injections=0;
 const tab={id:1,url:'https://www.bilibili.com/video/a'};
 const browser={permissions:{request:async value=>{request=value;return false;}},tabs:{get:async()=>tab,update:async()=>updates++},scripting:{executeScript:async()=>{injections++;}}};
 const result=await setMediaState(browser,tab,true);
 assert.deepEqual(request,{origins:['https://www.bilibili.com/*']});assert.match(result.warning,/未暂停/);assert.equal(updates,1);assert.equal(injections,0);
 browser.tabs.get=async()=>({...tab,url:'https://other.com/'});
 await assert.rejects(setMediaState(browser,tab,true),/跳转/);assert.equal(updates,1);
});
test('授权后传递暂停意图，注入失败不误报成功', async () => {
 const tab={id:2,url:'https://x.com/'};let injected;
 const browser={permissions:{request:async()=>true},tabs:{get:async()=>tab,update:async()=>{}},scripting:{executeScript:async options=>{injected=options;return [{result:{found:1,changed:1,failed:0}}];}}};
 assert.deepEqual(await setMediaState(browser,tab,true),{});assert.deepEqual(injected.args,[true,true]);
 browser.scripting.executeScript=async()=>{throw Error();};assert.match((await setMediaState(browser,tab,true)).warning,/仍在播放/);
});
test('主动播放发出恢复请求，自动播放不触发；监听器在下一次暂停可重新绑定', async () => {
 let listener,requests=0;const activation={isActive:false};
 const element={paused:false,ended:false,isConnected:true,src:'video.mp4',matches:()=>true,ownerDocument:{defaultView:{navigator:{userActivation:activation}}},pause(){this.paused=true;},addEventListener(type,fn){listener=fn;},removeEventListener(){listener=null;}};
 globalThis.document={querySelectorAll:()=>[element]};globalThis.chrome={runtime:{sendMessage:async()=>{requests++;return {unmuted:true};}}};
 try {
  await controlMedia(true,true);listener();assert.equal(requests,0);
  activation.isActive=true;listener();await Promise.resolve();assert.equal(requests,1);assert.equal(listener,null);
  element.paused=false;await controlMedia(true,true);assert.equal(typeof listener,'function');
 } finally {delete globalThis.document;delete globalThis.chrome;delete globalThis.__tabHavenPausedMedia;}
});
