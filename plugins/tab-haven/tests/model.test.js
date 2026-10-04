import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, groupsFor, duplicateSets, closeSnapshot } from '../src/model.js';
const tab = (id, url, extra = {}) => ({ id, url, windowId: 1, title: '标题', ...extra });
test('跨子域分组，区分私有域与不同站点', () => {
 const groups = groupsFor([tab(1,'https://www.zhihu.com/a'),tab(2,'https://zhuanlan.zhihu.com/b'),tab(3,'https://alice.github.io/'),tab(4,'https://bob.github.io/')]);
 assert.equal(groups.length,3); assert.equal(groups[0].tabs.length,2); assert.equal(groupsFor([tab(1,'https://x.com','')],'不存在').length,0);
});
test('排除新标签页、扩展自身、隐身标签，保留其他扩展', () => {
 assert.equal(eligible(tab(1,'chrome://newtab/')),false);
 assert.equal(eligible(tab(1,'chrome-extension://own/index.html'),'chrome-extension://own'),false);
 assert.equal(eligible(tab(1,'https://x.com',{incognito:true})),false);
 assert.equal(eligible(tab(1,'chrome-extension://other/index.html'),'chrome-extension://own'),true);
});
test('精确重复识别保留参数、hash和协议，不按标题合并', () => {
 const tabs = ['https://x.com/?q=a','https://x.com/?q=a','https://x.com/?q=b','https://x.com/?q=a#b','http://x.com/?q=a','chrome://settings/','chrome://settings/'].map((url,i)=>tab(i,url));
 assert.equal(duplicateSets(tabs).length,1); assert.equal(duplicateSets(tabs)[0].remove.length,1);
});
test('重复项优先保留固定标签，其次活动、最近访问标签', () => {
 const tabs = [tab(1,'https://x.com',{active:true}),tab(2,'https://x.com',{pinned:true}),tab(3,'https://x.com',{lastAccessed:100})];
 assert.equal(duplicateSets(tabs)[0].keep.id,2); assert.equal(duplicateSets(tabs.filter(t=>!t.pinned))[0].keep.id,1);
});
test('关闭快照不包含后来新增标签，并跳过已导航或消失的页面', async () => {
 const snapshot = [tab(1,'https://x.com/a'),tab(2,'https://x.com/b'),tab(3,'https://x.com/c')], removed=[];
 const api = {list:async()=>[snapshot[0],tab(2,'https://x.com/new'),tab(4,'https://x.com/d')],remove:async id=>removed.push(id)};
 assert.deepEqual(await closeSnapshot(api,snapshot,''),{closed:1,skipped:2,failed:0}); assert.deepEqual(removed,[1]);
});
test('重复清理的保留项已关闭时不再删除最后一个', async () => {
 const last=tab(2,'https://x.com/'); const removed=[];
 const result=await closeSnapshot({list:async()=>[last],remove:async id=>removed.push(id)},[last],'',true);
 assert.equal(result.skipped,1); assert.equal(removed.length,0);
});
test('一个关闭失败不阻塞其他目标', async () => {
 const tabs=[tab(1,'https://x.com/a'),tab(2,'https://x.com/b')];
 const result=await closeSnapshot({list:async()=>tabs,remove:async id=>{if(id===1)throw Error('closed');}},tabs,'');
 assert.deepEqual(result,{closed:1,skipped:0,failed:1});
});

test('搜索匹配只影响展示，整组关闭范围仍完整', () => {
 const result=groupsFor([tab(1,'https://zhihu.com/a',{title:'学习'}),tab(2,'https://zhihu.com/b',{title:'旅行'})],'学习');
 assert.equal(result[0].matched.length,1); assert.equal(result[0].tabs.length,2);
});
