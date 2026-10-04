import test from 'node:test';
import assert from 'node:assert/strict';
import { homepage, addShortcut, openHomepage } from '../src/shortcuts.js';
test('只保存首页，移除文章路径参数，拒绝危险地址和凭据', () => {
 assert.equal(homepage('www.bilibili.com/video/123?a=1#x'),'https://www.bilibili.com/');
 for (const url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com']) assert.throws(()=>homepage(url));
 assert.throws(()=>addShortcut([{name:'B站',url:'https://www.bilibili.com/'}],'重复','https://www.bilibili.com/video/a'));
});
test('首页已存在则激活，视频页面不冒充首页', async () => {
 const actions=[]; let tabs=[{id:1,url:'https://www.bilibili.com/video/a'}];
 const api={list:async()=>tabs,create:async url=>actions.push(['create',url]),activate:async tab=>actions.push(['activate',tab.id])};
 assert.equal(await openHomepage(api,'https://www.bilibili.com/'),'created');
 tabs.push({id:2,url:'https://www.bilibili.com/'});
 assert.equal(await openHomepage(api,'https://www.bilibili.com/'),'reused');
 assert.deepEqual(actions,[['create','https://www.bilibili.com/'],['activate',2]]);
});
