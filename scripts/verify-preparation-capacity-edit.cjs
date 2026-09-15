'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const edit=require('../public/js/ppic-preparation-capacity-edit');
const tree=require('../public/js/ppic-preparation-tree');
const matrix=require('../public/js/ppic-preparation-capacity-matrix');
const date='2026-09-01',next='2026-09-02';
const initial=()=>({month:'2026-09',name:'Draft',delivery:[],production:[{id:'legacy'}],material:[],processAllocations:{other:{[date]:9}}});
const snapshot={derived:{capacity:{rows:[{machineId:'m',date,shifts:[{sequence:1},{sequence:2}]}],machineChildren:[{sourceRowId:'r',partCode:'P',processCode:'PRG',uomCode:'PCS',days:{[date]:{quantity:10},[next]:{quantity:20}}}]}}};
test('quantity popup updates the same manual month as Workbook while preserving unrelated edits and legacy data',()=>{
  const workbook=initial(),before=tree.signature(workbook);
  edit.apply(workbook,snapshot,{kind:'quantity',id:'r',date,quantity:'33.600',coilChanges:'2',dieChanges:'1'});
  assert.equal(workbook.processAllocations.r[date],33600);assert.equal(workbook.processAllocations.r[next],20);
  assert.equal(Object.keys(workbook.processAllocations.r).length,30);assert.equal(workbook.processAllocations.other[date],9);
  assert.deepEqual(workbook.processSetupCounts.r[date],{coilChanges:2,dieChanges:1});assert.equal(workbook.production[0].id,'legacy');
  assert.notEqual(tree.signature(workbook),before);
  const restored=JSON.parse(JSON.stringify(workbook));assert.equal(tree.signature(restored),tree.signature(workbook));
});
test('invalid quantity, fractional setup counts, foreign dates and stale identities are atomic',()=>{
  for(const change of [{quantity:'0,5'},{coilChanges:'1,5'},{dieChanges:'-1'},{date:'2026-10-01'},{id:'missing'}]){
    const workbook=initial(),before=JSON.stringify(workbook);
    assert.throws(()=>edit.apply(workbook,snapshot,{kind:'quantity',id:'r',date,quantity:'10',coilChanges:'0',dieChanges:'0',...change}));
    assert.equal(JSON.stringify(workbook),before);
  }
});
test('machine options alter signature, preserve per-machine isolation and reset to master',()=>{
  const workbook=initial(),before=tree.signature(workbook);
  edit.apply(workbook,snapshot,{kind:'machine',id:'m',date,overtimeShift1:true,overtimeShift2:true,overtimeHoursShift1:'1,5',overtimeHoursShift2:'2',overlap:true});
  assert.deepEqual(workbook.machineDayOverrides.m[date],{overtimeShift1:true,overtimeShift2:true,overtimeHoursShift1:1.5,overtimeHoursShift2:2,overlap:true});
  assert.notEqual(tree.signature(workbook),before);assert.equal(workbook.processAllocations.other[date],9);
  edit.apply(workbook,snapshot,{kind:'machine',id:'m',date,reset:true});assert.equal(workbook.machineDayOverrides.m[date],undefined);
});
test('machine popup rejects enabled overtime with zero hours and unavailable shifts',()=>{
  assert.throws(()=>edit.apply(initial(),snapshot,{kind:'machine',id:'m',date,overtimeShift1:true,overtimeHoursShift1:0}),/jam lembur/);
  assert.throws(()=>edit.apply(initial(),{derived:{capacity:{rows:[{machineId:'m',date,shifts:[]}]}}},{kind:'machine',id:'m',date,overtimeShift2:true,overtimeHoursShift2:2}),/tidak tersedia/);
});
test('daily cells are keyboard-editable and overtime combinations plus overlap have distinct markers',()=>{
  for(const [options,label] of [[{overtimeShift1:true},'1'],[{overtimeShift2:true},'2'],[{overtimeShift1:true,overtimeShift2:true},'1+2']]){
    const html=matrix.machineCell({availableHours:12.6,loadHours:14,utilizationPct:14/12.6*100,options:{...options,overlap:true}},{id:'m',date,label:'M-001'});
    assert.ok(html.includes('aria-label="Lembur shift '+label+'"'));assert.match(html,/aria-label="Overlap shift"/);
    assert.match(html,/data-capacity-edit="machine"/);assert.match(html,/data-capacity-date="2026-09-01"/);
  }
  const child=matrix.childCell({quantity:0,loadHours:1.5,coilChanges:1,dieChanges:1},'PCS',{id:'r',date,label:'P'});
  assert.match(child,/data-capacity-edit="quantity"/);assert.match(child,/Coil 1 · Dies 1/);
  assert.doesNotMatch(matrix.machineCell({}),/data-capacity-edit/,'monthly totals remain computed');
});
