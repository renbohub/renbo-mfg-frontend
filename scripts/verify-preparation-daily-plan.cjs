'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../public/js/ppic-preparation-daily'),T=require('../public/js/ppic-preparation-tree');
const o=Date.parse('2026-09-01T00:00:00Z')/60000;
function fixture(){const job={id:'job',sourceRowId:'process',date:'2026-09-01',machineKey:'m1',partCode:'P',partNumber:'PN',processCode:'PRG',uomCode:'PCS',quantity:100,loadMinutes:120,setupMinutes:20,cycleTimeSeconds:60,sourceStart:o+480,sourceEnd:o+600,offsetMinutes:0,sourceSignature:'a'.repeat(64),segments:[{start:o+480,end:o+600,qty:100}],issues:[]};return {jobs:[job],machines:[{id:'m1',code:'M-001',windows:[[o+480,o+960]]}],unscheduled:[],basis:'Draft'};}
test('Gantt axis has 24 hourly columns and midnight belongs to the next date',()=>{
  const data=fixture(),model=D.view(data,'2026-09-01'),html=D.chart(model);
  assert.equal(model.end-model.start,1440);assert.equal(D.clock(model.start),'05:00');assert.equal(D.clock(model.end),'05:00');
  assert.match(html,/2026-09-02 \(\+1\)/);assert.match(html,/23:00/);assert.match(html,/00:00/);assert.equal((html.match(/<span>\d\d:00<\/span>/g)||[]).length,24);
});
test('editing persists offsets only, invalidates freshness, preserves all monthly qty and supports reset',()=>{
  const data=fixture(),w={month:'2026-09',delivery:[{id:'fg',days:{'2026-09-02':100}}],processAllocations:{p:{'2026-09-01':100}},vendorDispatchAllocations:{v:{'2026-09-02':100}}},before=structuredClone(w),key=T.signature(w);
  D.apply(w,{derived:{daily:data}},{id:'job',sourceSignature:'a'.repeat(64),offsetMinutes:15});
  assert.notEqual(T.signature(w),key);assert.deepEqual(w.delivery,before.delivery);assert.deepEqual(w.processAllocations,before.processAllocations);assert.deepEqual(w.vendorDispatchAllocations,before.vendorDispatchAllocations);
  assert.equal(w.dailyScheduleOverrides.process['2026-09-01'].offsetMinutes,15);
  D.apply(w,{derived:{daily:data}},{id:'job',sourceSignature:'a'.repeat(64),reset:true});assert.equal(T.signature(w),key);
});
test('stale, unavailable and out-of-range positions are rejected atomically',()=>{
  const w={month:'2026-09'},snapshot={derived:{daily:fixture()}};
  for(const change of [{id:'missing'},{id:'job',sourceSignature:'stale',offsetMinutes:15},{id:'job',sourceSignature:'a'.repeat(64),offsetMinutes:-181},{id:'job',sourceSignature:'a'.repeat(64),offsetMinutes:1141}]){assert.throws(()=>D.apply(w,snapshot,change));assert.deepEqual(w,{month:'2026-09'});}
});
test('precise time edit understands 00:00–04:59 as next morning and enforces complete duration',()=>{
  const job=fixture().jobs[0];assert.equal(D.timeOffset(job,'00:00'),960);assert.equal(D.timeOffset(job,'05:00'),-180);
  assert.ok(D.position(job,D.timeOffset(job,'03:00')));assert.equal(D.position(job,D.timeOffset(job,'04:00')),false);assert.throws(()=>D.timeOffset(job,'25:00'));
});
test('machine search, collapse, empty state and HTML escaping preserve safe labels',()=>{
  const data=fixture();data.jobs[0].partNumber='<img onerror="x">';
  assert.equal(D.view(data,'2026-09-01','PRG').machines.length,1);assert.equal(D.view(data,'2026-09-01','unknown').machines.length,0);
  const html=D.chart(D.view(data,'2026-09-01'));assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
  assert.doesNotMatch(D.chart(D.view(data,'2026-09-01'),new Set(['m1'])),/data-daily-job=/);
  assert.match(D.chart(D.view(data,'2026-09-03')),/Belum ada alokasi/);
});
function ui(){
  delete require.cache[require.resolve('../public/js/ppic-preparation-daily')];const api=require('../public/js/ppic-preparation-daily'),nodes=new Map(),calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',disabled:false,hidden:false,innerHTML:'',textContent:'',handlers:{},style:{},classList:{add(){}},addEventListener(type,fn){this.handlers[type]=fn;},click(){this.handlers.click?.({});},focus(){},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll(){return []}});return nodes.get(id);};
  const doc={getElementById:node,addEventListener(type,fn){node('document').handlers[type]=fn;}};
  api.mount(doc,async change=>calls.push(change));api.update({month:'2026-09',name:'Test',snapshot:{derived:{daily:fixture()}},busy:false,loading:false,dirty:false});
  const bar={dataset:{dailyJob:'0'},style:{},classList:{add(){}},parentElement:{getBoundingClientRect:()=>({width:1440})},setPointerCapture(){},closest(selector){return selector==='[data-daily-job]'?this:null;}};
  return {api,node,calls,bar,chart:node('prep-daily-chart'),async flush(){await new Promise(resolve=>setImmediate(resolve));}};
}
test('pointer drag commits snapped position once; Escape and pointer cancellation do not commit',async()=>{
  const f=ui(),event={target:f.bar,button:0,pointerId:1,clientX:100};
  f.chart.handlers.pointerdown(event);f.chart.handlers.pointermove({...event,clientX:122});f.chart.handlers.pointerup({...event,clientX:122});await f.flush();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].offsetMinutes,15);
  f.chart.handlers.pointerdown(event);f.chart.handlers.pointermove({...event,clientX:140});f.node('document').handlers.keydown({key:'Escape'});f.chart.handlers.pointerup(event);assert.equal(f.calls.length,1);
  f.chart.handlers.pointerdown(event);f.chart.handlers.pointercancel();f.chart.handlers.pointerup(event);assert.equal(f.calls.length,1);
});
test('loading invalidates in-flight drag; keyboard and dialog are reachable; busy disables editing',async()=>{
  const f=ui(),event={target:f.bar,button:0,pointerId:1,clientX:100};
  f.chart.handlers.pointerdown(event);f.api.update({month:'2026-09',loading:true});f.chart.handlers.pointerup({...event,clientX:140});assert.equal(f.calls.length,0);assert.equal(f.node('prep-daily-date').disabled,true);
  f.api.update({month:'2026-09',snapshot:{derived:{daily:fixture()}}});f.chart.handlers.keydown({target:f.bar,key:'ArrowRight',preventDefault(){}});await f.flush();assert.equal(f.calls[0].offsetMinutes,15);
  f.chart.handlers.click({target:f.bar});assert.equal(f.node('prep-daily-dialog').open,true);assert.equal(f.node('prep-daily-start').value,'08:00');f.node('prep-daily-cancel').click();assert.equal(f.node('prep-daily-dialog').open,false);
});
test('daily edits use existing controller history refresh and Save, never a separate storage channel',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/js/ppic-preparation.js'),'utf8');assert.match(source,/PrepDailyPlan\?\.mount\(document,async change=>/);assert.match(source,/PrepDailyPlan\.apply\(workbook,tree,change\)/);
  const daily=fs.readFileSync(path.join(__dirname,'../public/js/ppic-preparation-daily.js'),'utf8');
  assert.doesNotMatch(daily,/\bfetch\s*\(|localStorage|sessionStorage/);assert.match(daily,/doc\.getElementById\(name==='back'\?'prep-page-workbook':'prep-'\+name\)\.click/);
});
test('locked daily snapshot stays visible and searchable but cannot drag, edit or save',async()=>{
  const f=ui();f.api.update({month:'2026-09',name:'Frozen',locked:true,busy:false,snapshot:{derived:{daily:fixture()}}});
  assert.match(f.chart.innerHTML,/data-daily-job=/);assert.equal(f.node('prep-daily-search').disabled,false);assert.equal(f.node('prep-daily-save').disabled,true);
  const event={target:f.bar,button:0,pointerId:1,clientX:100};f.chart.handlers.pointerdown(event);f.chart.handlers.pointermove({...event,clientX:150});f.chart.handlers.pointerup(event);
  f.chart.handlers.keydown({target:f.bar,key:'ArrowRight',preventDefault(){}});await f.flush();f.chart.handlers.click({target:f.bar});
  assert.equal(f.calls.length,0);assert.ok(!f.node('prep-daily-dialog').open);assert.match(f.node('prep-daily-status').textContent,/hanya baca/);
});
