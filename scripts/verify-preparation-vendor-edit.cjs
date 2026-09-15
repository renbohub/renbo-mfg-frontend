'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../public/js/ppic-preparation-vendor-edit');
const clone=value=>structuredClone(value);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const row=overrides=>({id:'vendor',allocationKind:'VENDOR_LEAD_TIME',partCode:'WIP',partNumber:'DRAW',processCode:'PLATE',resource:'V001',bomNumber:'MBOM-1',vendorLeadTimeValue:2,vendorLeadTimeUnit:'DAY',vendorLeadTimeSource:'MBOM_DETAIL',vendorAllocationBasis:'RECEIPT',allocationMode:'MANUAL',...overrides});
const snapshot=()=>({rows:[{id:'fg',children:[row(),{id:'inhouse',allocationKind:'INHOUSE_CAPACITY'}]}]});
const workbook=()=>({month:'2026-09',delivery:[{id:'fg',days:{'2026-09-10':100}}],processAllocations:{vendor:{'2026-09-08':100}},vendorDispatchAllocations:{another:{'2026-09-04':25}},vendorLeadTimeOverrides:{another:{value:4,unit:'HOUR'}}});

function fixture(commit=async()=>{}){
  const nodes=new Map(),doc={activeElement:null,getElementById:id=>nodes.get(id)||null};
  function create(id){
    const node={id,value:'',textContent:'',hidden:false,disabled:false,isConnected:true,handlers:{},focusCalls:0,selected:false,open:false,
      addEventListener(type,handler){this.handlers[type]=handler;},
      fire(type,event={}){let prevented=false;const payload={preventDefault(){prevented=true;},...event};const result=this.handlers[type]?.(payload);return {result,prevented};},
      focus(){doc.activeElement=this;this.focusCalls++;},select(){this.selected=true;},showModal(){this.open=true;},close(){this.open=false;}};
    nodes.set(id,node);return node;
  }
  for(const id of ['prep-vendor-dialog','prep-vendor-lead-time',...['close','cancel','value','unit','preview','apply','reset','error','form','context','source','legacy'].map(name=>'prep-vendor-edit-'+name)])create(id);
  const opener=create('opener');opener.focus();
  const mounted=api.mount(doc,commit),node=name=>nodes.get('prep-vendor-edit-'+name);
  return {mounted,node,doc,opener,dialog:nodes.get('prep-vendor-dialog'),fallback:nodes.get('prep-vendor-lead-time')};
}

test('lead time override affects only selected workbook field and preserves master and legacy allocations',()=>{
  const w=workbook(),s=snapshot(),before=clone({w,s});
  api.apply(w,s,{id:'vendor',value:'1,5',unit:'HOUR'});
  assert.deepEqual(w.vendorLeadTimeOverrides.vendor,{value:1.5,unit:'HOUR'});
  delete w.vendorLeadTimeOverrides.vendor;
  assert.deepEqual({w,s},before);
});
test('zero is explicit and valid while reset restores BOM source without modifying other overrides',()=>{
  const w=workbook(),s=snapshot();
  api.apply(w,s,{id:'vendor',value:0,unit:'DAY'});
  assert.deepEqual(w.vendorLeadTimeOverrides.vendor,{value:0,unit:'DAY'});
  api.apply(w,s,{id:'vendor',reset:true});
  assert.deepEqual(w.vendorLeadTimeOverrides,{another:{value:4,unit:'HOUR'}});
  assert.deepEqual(w.processAllocations.vendor,{'2026-09-08':100});
  assert.doesNotThrow(()=>api.apply(w,s,{id:'vendor',reset:true}));
});
test('invalid values and units reject atomically without creating override containers',()=>{
  for(const change of [{value:''},{value:' '},{value:null},{value:-1},{value:NaN},{value:Infinity},{value:'=1+1'},{value:1e13},{unit:'WEEK'},{unit:'__proto__'}]){
    const w=workbook(),s=snapshot();delete w.vendorLeadTimeOverrides;const before=clone({w,s});
    assert.throws(()=>api.apply(w,s,{id:'vendor',value:2,unit:'DAY',...change}));
    assert.deepEqual({w,s},before);
  }
});
test('missing source and non-vendor selection reject both edits and reset without changing workbook',()=>{
  for(const s of [undefined,{rows:[]},snapshot()])for(const id of ['missing','inhouse'])for(const reset of [false,true]){
    const w=workbook(),before=clone(w);
    assert.throws(()=>api.apply(w,s,{id,value:2,unit:'DAY',reset}),/Pilih proses vendor/);
    assert.deepEqual(w,before);
  }
});
test('mount gracefully skips pages without vendor dialog',()=>assert.equal(api.mount({getElementById:()=>null},()=>{}),null));
test('dialog identifies part and BOM, previews hours and selects editable lead time on open',()=>{
  const f=fixture();f.mounted.open(row());
  assert.equal(f.dialog.open,true);assert.equal(f.doc.activeElement,f.node('value'));assert.equal(f.node('value').selected,true);
  assert.equal(f.node('value').value,'2');assert.equal(f.node('unit').value,'DAY');
  assert.match(f.node('context').textContent,/WIP.*DRAW.*PLATE.*V001.*MBOM-1/);
  assert.match(f.node('source').textContent,/BOM: 2 hari.*Sumber aktif: BOM/);
  assert.match(f.node('preview').textContent,/\+ 48 jam/);assert.equal(f.node('legacy').hidden,false);
  f.node('value').value='1';f.node('value').fire('input');
  assert.match(f.node('preview').textContent,/\+ 24 jam/);
  assert.match(f.node('preview').textContent,/1 hari = 24 jam/);
  assert.match(f.node('preview').textContent,/libur Master Working Hours dilewati/);
  f.node('value').value='1,5';f.node('unit').value='HOUR';f.node('value').fire('input');
  assert.match(f.node('preview').textContent,/\+ 1,5 jam/);
  f.node('unit').value='MINUTE';f.node('unit').fire('change');assert.match(f.node('preview').textContent,/\+ 0,025 jam/);
});
test('dialog shows BOM and active workbook override separately without HTML injection',()=>{
  const f=fixture();f.mounted.open(row({partCode:'<img src=x>',vendorLeadTimeSource:'WORKBOOK_OVERRIDE',vendorBomLeadTimeValue:3,vendorBomLeadTimeUnit:'DAY',vendorLeadTimeValue:1.5,vendorLeadTimeUnit:'HOUR',vendorAllocationBasis:'DISPATCH'}));
  assert.match(f.node('source').textContent,/BOM: 3 hari.*Sumber aktif: Workbook/);
  assert.match(f.node('context').textContent,/<img src=x>/);assert.equal(f.node('context').innerHTML,undefined);
  assert.equal(f.node('value').value,'1,5');assert.equal(f.node('legacy').hidden,true);
});
test('missing BOM lead time stays blank rather than defaulting to zero',()=>{
  const f=fixture();f.mounted.open(row({vendorLeadTimeValue:null,vendorLeadTimeUnit:null,allocationMode:'AUTO'}));
  assert.equal(f.node('value').value,'');assert.equal(f.node('unit').value,'HOUR');assert.match(f.node('source').textContent,/belum diisi/);
  assert.match(f.node('preview').textContent,/Isi lead time/);assert.equal(f.node('legacy').hidden,true);
});
test('successful apply commits selected row once, locks submission and returns focus',async()=>{
  const pending=deferred(),calls=[],f=fixture(change=>{calls.push(change);return pending.promise;});f.mounted.open(row());
  f.node('value').value='3';const event=f.node('form').fire('submit');assert.equal(event.prevented,true);
  assert.equal(f.node('apply').disabled,true);assert.equal(f.node('reset').disabled,true);
  f.node('form').fire('submit');f.node('reset').fire('click');f.node('cancel').fire('click');
  assert.equal(calls.length,1);assert.equal(f.dialog.open,true);assert.equal(f.dialog.fire('cancel').prevented,true);
  assert.deepEqual(calls[0],{id:'vendor',value:'3',unit:'DAY',reset:false});
  pending.resolve();await tick();assert.equal(f.dialog.open,false);assert.equal(f.doc.activeElement,f.opener);
  assert.equal(f.node('apply').disabled,false);assert.equal(f.node('reset').disabled,false);
});
test('failed commit keeps dialog values, shows text error and permits correction',async()=>{
  const f=fixture(async()=>{throw Error('<bad lead time>');});f.mounted.open(row());f.node('form').fire('submit');await tick();
  assert.equal(f.dialog.open,true);assert.equal(f.node('value').value,'2');assert.equal(f.node('error').textContent,'<bad lead time>');
  assert.equal(f.node('apply').disabled,false);assert.equal(f.node('reset').disabled,false);
});
test('reset commits reset flag and closing without commit restores surviving opener or fallback',async()=>{
  const calls=[],f=fixture(async change=>calls.push(change));f.mounted.open(row());f.node('reset').fire('click');await tick();
  assert.equal(calls.length,1);assert.equal(calls[0].reset,true);assert.equal(f.dialog.open,false);
  f.opener.focus();f.mounted.open(row());f.opener.isConnected=false;f.node('close').fire('click');
  assert.equal(f.dialog.open,false);assert.equal(f.doc.activeElement,f.fallback);assert.equal(calls.length,1);
});
