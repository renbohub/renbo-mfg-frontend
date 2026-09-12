const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const C=require('../public/js/ppic-sandbox-cache.js');
const source=fs.readFileSync(require.resolve('../public/js/ppic-sandbox.js'),'utf8');
// Exercise the actual page loader with a delayed transport and lightweight view adapters.
const loader=source.slice(source.indexOf('  async function load('),source.indexOf('  const filteredRows='));
const seed=(fingerprint='a')=>({month:'2026-09',fingerprint,nodes:[],groups:[],initial:{},cache:{requestMs:500}});
function harness(cached=seed()){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='month'?'2026-09':'',hidden:id==='content',open:false,close(){this.open=false;}});return elements.get(id);};
 const requests=[],events=[];
 const context=vm.createContext({C,$:element,AbortController,DOMException,setTimeout,clearTimeout,
   snapshotCache:{read:()=>cached?{seed:cached}:null,write:()=>true,remove:()=>events.push('evict')},
   localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},
   fetch:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
   compute:async()=>({elapsedMs:10}),controls:()=>{},message:()=>{},sourceLabel:()=>{},draftNotice:()=>{},closeEditor:()=>{},num:n=>n,
   events
 });
 vm.runInContext(`let busy=false,seed,result,requestId=0,requestController,refreshing=false,pendingFresh=null,sourceStatus='',scenarioRevision=0,history=[{}],overrides={},gantt;const serverScenarios=false;
 function install(payload,next){seed=payload;result=next;$('loading').hidden=true;$('content').hidden=false;events.push('paint');}
 ${loader}`,context);
 return {context,requests,events,element,run:code=>vm.runInContext(code,context)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const respond=(h,payload=seed(),status=200)=>h.requests.at(-1).resolve({ok:status===200,status,json:async()=>payload});
test('slow server does not block cached Gantt or adjustment controls',async()=>{
 const h=harness(),done=h.run('load()');await tick();
 assert.deepEqual(h.events,['paint']);assert.equal(h.element('loading').hidden,true);
 assert.equal(h.run('busy'),false);assert.equal(h.run('refreshing'),true);
 respond(h);await done;
 assert.deepEqual(h.events,['paint']);assert.match(h.run('sourceStatus'),/Snapshot sesi/);
});
test('new source arriving during edits is offered separately without replacing the scenario',async()=>{
 const h=harness(),done=h.run('load()');await tick();h.run('history.push({vendor:{leadDays:2}});scenarioRevision++');
 respond(h,seed('changed'));await done;
 assert.equal(h.run('seed.fingerprint'),'a');assert.equal(h.run('pendingFresh.fingerprint'),'changed');assert.deepEqual(h.events,['paint']);
});
test('even an open unsaved adjustment form defers an incoming changed snapshot',async()=>{
 const h=harness(),done=h.run('load()');await tick();h.element('editor').open=true;
 respond(h,seed('changed'));await done;assert.equal(h.run('pendingFresh.fingerprint'),'changed');
});

test('an open quantity allocation form preserves unsaved edits when source refresh completes',async()=>{
 const h=harness(),done=h.run('load()');await tick();h.element('allocation-editor').open=true;
 respond(h,seed('changed'));await done;assert.equal(h.run('seed.fingerprint'),'a');assert.equal(h.run('pendingFresh.fingerprint'),'changed');
});
test('failed background request keeps cached chart and shows unverified status',async()=>{
 const h=harness(),done=h.run('load()');await tick();h.requests[0].reject(Error('offline'));await done;
 assert.equal(h.element('content').hidden,false);assert.equal(h.run('busy'),false);assert.match(h.run('sourceStatus'),/belum terverifikasi/);
});
test('denied access removes cached chart instead of leaving protected data visible',async()=>{
 const h=harness(),done=h.run('load()');await tick();respond(h,{},403);await done;
 assert.equal(h.element('content').hidden,true);assert.equal(h.run('seed'),null);assert.ok(h.events.includes('evict'));
});
test('first visit builds once; a late response from an old month cannot replace current selection',async()=>{
 const cold=harness(null),initial=cold.run('load()');await tick();assert.equal(cold.events.length,0);assert.equal(cold.run('busy'),true);
 respond(cold);await initial;assert.deepEqual(cold.events,['paint']);
 const h=harness(),old=h.run('load()');await tick();h.element('month').value='2026-10';
 // A different month has no usable cached snapshot.
 h.context.snapshotCache.read=()=>null;
 const current=h.run('load()');await tick();
 h.requests[0].resolve({ok:true,status:200,json:async()=>seed('old')});await old;
 respond(h,{...seed('current'),month:'2026-10'});await current;
 assert.equal(h.run('seed.month'),'2026-10');assert.equal(h.run('seed.fingerprint'),'current');
});
