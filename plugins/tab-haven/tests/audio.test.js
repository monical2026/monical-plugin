import test from 'node:test';
import assert from 'node:assert/strict';
import { audioState, audioSummary } from '../src/audio.js';
test('静音优先于 audible，避免已静音页面仍被计为出声', () => {
 const tabs=[{audible:true},{audible:true,mutedInfo:{muted:true}},{audible:false,mutedInfo:{muted:true}},{}];
 assert.deepEqual(tabs.map(audioState),['audible','muted','muted','silent']);
 assert.equal(audioSummary(tabs),'1 页正在出声 · 2 页已静音');
 assert.equal(audioSummary([{}]),'');
});
