const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,disposition}=require('../public/js/ppic-sandbox-cache.js');
function storage(){const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const seed=(month='2026-09',fingerprint='a')=>({month,fingerprint,nodes:[],groups:[],initial:{}});
test('reopening gets the same snapshot without recomputing or exposing another account/day',()=>{
 const s=storage(),cache=create(s,'u1','2026-09-11');assert.equal(cache.write(seed()),true);
 assert.deepEqual(create(s,'u1','2026-09-11').read('2026-09').seed,seed());
 assert.equal(create(s,'u2','2026-09-11').read('2026-09'),null);
 assert.equal(create(s,'u1','2026-09-12').read('2026-09'),null);
 assert.equal(create(s,null,'2026-09-11').read('2026-09'),null);
 assert.equal(cache.read('2026-10'),null);
});
test('bounded cache preserves other browser data and tolerates unavailable storage',()=>{
 const s=storage();s.setItem('token','untouched');let at=0;const cache=create(s,'u1','day',()=>++at);
 for(const month of ['2026-06','2026-07','2026-08','2026-09'])cache.write(seed(month));
 assert.equal(s.length,4);assert.equal(cache.read('2026-06'),null);assert.equal(s.getItem('token'),'untouched');
 assert.equal(create(null,'u1','day').write(seed()),false);assert.equal(create(null,'u1','day').read('2026-09'),null);
 cache.remove('2026-09');assert.equal(cache.read('2026-09'),null);
});
test('malformed snapshots fall back to server load',()=>{
 const s=storage(),cache=create(s,'u1','day');cache.write(seed());const key=s.key(0);
 s.setItem(key,'broken');assert.equal(cache.read('2026-09'),null);
 s.setItem(key,JSON.stringify({seed:{month:'2026-09',fingerprint:'a'}}));assert.equal(cache.read('2026-09'),null);
 assert.equal(cache.write(seed('2026-10')),true);assert.deepEqual(cache.read('2026-10').seed,seed('2026-10'));
});
test('source validation preserves edits and defers changed snapshots until explicitly accepted',()=>{
 assert.equal(disposition(seed(),seed(),true),'unchanged');
 assert.equal(disposition(seed(),seed('2026-09','changed'),true),'defer');
 assert.equal(disposition(seed(),seed('2026-09','changed'),false),'replace');
 assert.equal(disposition(seed(),seed('2026-10'),true),'replace');
 assert.equal(disposition(null,seed(),false),'replace');
});
