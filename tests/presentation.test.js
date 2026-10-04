import test from 'node:test';
import assert from 'node:assert/strict';
import { retainOrder, siteTone, faviconSource } from '../src/presentation.js';
test('数量变化、查询过滤、新网站出现均不重排已有网站', () => {
 const order=[];
 const a={key:'a.com',name:'A',tabs:[1]}, b={key:'b.com',name:'B',tabs:[1,2,3]};
 assert.deepEqual(retainOrder([b,a],order).map(g=>g.key),['a.com','b.com']);
 assert.deepEqual(retainOrder([{...b,tabs:[1]}, {...a,tabs:[1,2,3,4]}],order).map(g=>g.key),order);
 retainOrder([b],order);
 assert.deepEqual(retainOrder([b,{key:'0.com',name:'0'},a],order).map(g=>g.key),['a.com','b.com','0.com']);
 assert.equal(siteTone(a.key),siteTone('a.com'));
});
test('图标走扩展 favicon 接口并完整编码网址，特殊页降级', () => {
 const runtime={getURL:path=>`chrome-extension://test${path}`};
 const url=new URL(faviconSource('https://example.com/?a=1&b=中文',runtime));
 assert.equal(url.protocol,'chrome-extension:'); assert.equal(url.searchParams.get('pageUrl'),'https://example.com/?a=1&b=中文');
 assert.equal(faviconSource('chrome://settings',runtime),null); assert.equal(faviconSource('https://example.com',null),null);
});
