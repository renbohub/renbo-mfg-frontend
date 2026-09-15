'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const M=require('../public/js/ppic-preparation-model');
const T=require('../public/js/ppic-preparation-tree');
const source=fs.readFileSync(path.join(__dirname,'../public/js/ppic-preparation.js'),'utf8');
const workbook=()=>({month:'2026-09',delivery:[{id:'fg',days:{'2026-09-10':100}}],processAllocations:{vendor:{'2026-09-08':100},other:{'2026-09-05':5}},vendorLeadTimeOverrides:{vendor:{value:2,unit:'DAY'}},material:[{id:'legacy',days:{'2026-09-01':10}}]});
function processRow(id,kind,qty){
  return {id,_kind:'PROCESS',allocationKind:kind,vendorLeadTimeMinutes:960,...Object.fromEntries(M.dates('2026-09').map(date=>['d'+date.slice(-2),date==='2026-09-04'?qty:0])),vendorDispatchDays:{'2026-09-04':qty}};
}
function pasteFixture(){
  const w=workbook(),events=[],errors=[],components=new Map(),cancelledTimers=[],updateStates=[];let pending;
  const data=[{id:'fg',_kind:'FG',d10:100},processRow('inhouse','INHOUSE_CAPACITY',20),processRow('vendor','VENDOR_LEAD_TIME',100)];
  for(const value of data)components.set(value.id,{data:M.clone(value),getData(){return this.data;},getTreeChildren(){return [...components.values()].filter(row=>row.data._kind==='PROCESS');},async update(row){updateStates.push({request:context.treeRequest,timer:context.treeTimer,loading:context.treeLoading});events.push('update:'+row.id);this.data=M.clone(row);}});
  const context=vm.createContext({locked:()=>false,workbook:w,M,T,treeKey:T.signature(w),treeLoading:false,treeRequest:4,treeTimer:99,clearTimeout:id=>cancelledTimers.push(id),grid:{getRows:()=>[components.get('fg')]},action(callback){pending=Promise.resolve().then(callback).catch(error=>errors.push(error.message));},commit(){events.push('commit');},queueTree(){events.push('queue');}});
  const line=source.split(/\r?\n/).find(line=>line.includes('clipboardPasteAction:function(rows)'));
  assert.ok(line,'Controller paste action must exist');
  const fn=vm.runInContext('({'+line.trim().replace(/,$/,'')+'}).clipboardPasteAction',context);
  return {w,data,events,errors,components,context,cancelledTimers,updateStates,async paste(rows){assert.equal(fn(rows).length,0);await pending;}};
}
test('controller preflights every pasted process before modifying any visible row or workbook map',async()=>{
  for(const invalid of ['legacy-outside','bad-number']){
    const f=pasteFixture(),before=M.clone(f.w),rows=f.data.map(row=>M.clone(row));
    rows[0].d10=250;rows[1].d04=30;rows[2].d04=80;
    if(invalid==='legacy-outside')rows[2].vendorDispatchDays={'2026-08-31':100};else rows[2].d04=NaN;
    await f.paste(rows);
    assert.deepEqual(f.w,before);assert.deepEqual(f.events,[]);
    assert.equal(f.errors.length,1);assert.match(f.errors[0],invalid==='legacy-outside'?/di luar periode workbook/:/Jumlah harus/);
    assert.equal(f.components.get('fg').data.d10,100);assert.equal(f.components.get('inhouse').data.d04,20);assert.equal(f.components.get('vendor').data.d04,100);
  }
});
test('successful mixed paste commits outgoing vendor and in-house allocations together then queues one refresh',async()=>{
  const f=pasteFixture(),rows=f.data.map(row=>M.clone(row)),legacy=M.clone(f.w.material),overrides=M.clone(f.w.vendorLeadTimeOverrides);
  rows[0].d10=200;rows[1].d04=30;rows[2].d04=80;
  await f.paste(rows);
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.events,['update:fg','update:inhouse','update:vendor','commit','queue']);
  assert.deepEqual(f.cancelledTimers,[99]);assert.equal(f.context.treeRequest,5);
  assert.deepEqual(f.updateStates,Array.from({length:3},()=>({request:5,timer:null,loading:false})),'Old request and queued timer are invalidated before the first awaited row update');
  assert.equal(f.w.processAllocations.vendor,undefined);assert.equal(f.w.processAllocations.inhouse['2026-09-04'],30);
  assert.equal(f.w.vendorDispatchAllocations.vendor['2026-09-04'],80);assert.equal(Object.keys(f.w.vendorDispatchAllocations.vendor).length,30);
  assert.deepEqual(f.w.processAllocations.other,{'2026-09-05':5});assert.deepEqual(f.w.material,legacy);assert.deepEqual(f.w.vendorLeadTimeOverrides,overrides);
});
test('a rejected direct vendor cell edit restores old value before total, commit or refresh can change',()=>{
  const w=workbook(),before=M.clone(w),events=[],errors=[],data=processRow('vendor','VENDOR_LEAD_TIME',80);
  data.vendorDispatchDays={'2026-08-31':100};let listener;
  const row={getData:()=>data,update:()=>events.push('update')},cell={getRow:()=>row,restoreOldValue(){data.d04=100;events.push('restore');}};
  const context=vm.createContext({locked:()=>false,workbook:w,M,T,treeKey:T.signature(w),treeLoading:false,grid:{on(_event,fn){listener=fn;}},message:text=>errors.push(text),commit:()=>events.push('commit'),queueTree:()=>events.push('queue'),selectCell:()=>events.push('select')});
  const line=source.split(/\r?\n/).find(line=>line.includes("grid.on('cellEdited',"));
  assert.ok(line);vm.runInContext(line,context);listener(cell);
  assert.deepEqual(w,before);assert.deepEqual(events,['restore']);assert.equal(data.d04,100);assert.match(errors[0],/di luar periode workbook/);
});
test('stale or loading process paste is rejected before preflight and leaves pending recalculation intact',async()=>{
  for(const state of [{treeLoading:true},{treeKey:'stale-source'}]){
    const f=pasteFixture(),before=M.clone(f.w);Object.assign(f.context,state);
    await f.paste(f.data.map(row=>({...row,d04:75})));
    assert.deepEqual(f.w,before);assert.deepEqual(f.events,[]);assert.deepEqual(f.cancelledTimers,[]);
    assert.equal(f.context.treeRequest,4);assert.equal(f.context.treeTimer,99);assert.match(f.errors[0],/Tunggu hasil BOM terbaru/);
  }
});
test('FG-only paste remains available while its old process allocation is calculating',async()=>{
  const f=pasteFixture();f.context.treeLoading=true;f.context.treeKey='stale-source';
  await f.paste([{...f.data[0],d10:150}]);
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.events,['update:fg','commit','queue']);
  assert.equal(f.context.treeRequest,5);assert.equal(f.components.get('fg').data.d10,150);
});
test('stale direct process edits restore old quantity without creating manual allocations',()=>{
  for(const state of [{treeLoading:true},{treeKey:'stale-source'}]){
    const w=workbook(),before=M.clone(w),events=[],errors=[],data=processRow('vendor','VENDOR_LEAD_TIME',80);let listener;
    const cell={getRow:()=>({getData:()=>data,update:()=>events.push('update')}),restoreOldValue(){data.d04=100;events.push('restore');}};
    const context=vm.createContext({locked:()=>false,workbook:w,M,T,treeKey:T.signature(w),treeLoading:false,...state,grid:{on(_event,fn){listener=fn;}},message:text=>errors.push(text),commit:()=>events.push('commit'),queueTree:()=>events.push('queue'),selectCell:()=>events.push('select')});
    vm.runInContext(source.split(/\r?\n/).find(line=>line.includes("grid.on('cellEdited',")),context);listener(cell);
    assert.deepEqual(w,before);assert.deepEqual(events,['restore']);assert.match(errors[0],/Tunggu hasil BOM terbaru/);
  }
});
test('stale process cannot open cell editor, pass editable predicate or commit from formula bar',()=>{
  for(const state of [{treeLoading:true},{treeKey:'stale-source'}]){
    const w=workbook(),errors=[],data=processRow('vendor','VENDOR_LEAD_TIME',100);let formula;
    const selected={getField:()=> 'd04',getRow:()=>({getData:()=>data}),setValue:()=>assert.fail('Stale formula must not set cell value')};
    const context=vm.createContext({locked:()=>false,workbook:w,M,T,busy:false,selected,treeKey:T.signature(w),treeLoading:false,...state,columns:()=>T.columns(w.month),message:text=>errors.push(text),$:()=>({value:'75',addEventListener(_event,fn){formula=fn;}})});
    const editorSource=source.slice(source.indexOf('  function editor('),source.indexOf('  function vendorMovements('));
    const editor=vm.runInContext(editorSource+'\neditor',context);assert.equal(editor(selected),false);
    const definition=source.split(/\r?\n/).find(line=>line.includes('editable:cell=>'));
    const editable=vm.runInContext('('+definition.slice(definition.indexOf('editable:')+9).trim().replace(/,$/,'')+')',context);
    assert.equal(editable(selected),false);
    const formulaLine=source.split(/\r?\n/).find(line=>line.includes("$('prep-cell-value').addEventListener('change'"));
    vm.runInContext(formulaLine,context);formula();assert.match(errors[0],/Tunggu hasil BOM terbaru/);
  }
});
