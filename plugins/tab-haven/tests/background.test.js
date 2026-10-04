import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('后台只解除本扩展静音，拒绝其他来源、页面跳转及非内容脚本消息', async () => {
 let handler,updates=0;
 let tab={id:1,url:'https://x.com/',mutedInfo:{muted:true,reason:'extension',extensionId:'own'}};
 const chrome={runtime:{id:'own',onMessage:{addListener:fn=>{handler=fn;}}},tabs:{get:async()=>tab,update:async()=>{updates++;}}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/background.js',import.meta.url),'utf8'),{chrome});
 const sender={id:'own',frameId:0,tab:{id:1},url:'https://x.com/'};
 const run=()=>new Promise(resolve=>handler({type:'tab-haven-resume-audio'},sender,resolve));
 assert.equal((await run()).unmuted,true);assert.equal(updates,1);
 tab.mutedInfo.reason='user';assert.equal((await run()).unmuted,false);
 tab.mutedInfo.reason='extension';tab.mutedInfo.extensionId='other';assert.equal((await run()).unmuted,false);
 tab.mutedInfo.extensionId='own';tab.url='https://y.com/';assert.equal((await run()).unmuted,false);
 assert.equal(handler({type:'tab-haven-resume-audio'},{...sender,id:'other'},()=>{}),undefined);assert.equal(updates,1);
});
