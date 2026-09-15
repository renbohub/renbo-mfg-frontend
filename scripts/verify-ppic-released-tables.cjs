'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const tables=require('../public/js/ppic-released-tables');
function fixture(){
  const dates=Array.from({length:30},(_,index)=>'2026-09-'+String(index+1).padStart(2,'0'));
  const days=(active)=>Object.fromEntries(dates.map(date=>[date,date.endsWith('01')?active:{coilChanges:0,dieChanges:0,productionHours:0}]));
  const children=[{sourceRowId:'first',machineKey:'m1',machineCode:'MC-1',days:days({coilChanges:2,dieChanges:1,productionHours:1})},{sourceRowId:'second',machineKey:'m1',machineCode:'MC-1',days:days({coilChanges:0,dieChanges:1,productionHours:2})}];
  return {month:'2026-09',status:'LOCKED',views:{monthly:[{id:JSON.stringify(['first','m1','PCS']),sourceRowId:'first',machineCode:'MC-1',partCode:'PART-A',quantity:12,uomCode:'PCS',days:{'2026-09-01':12}},{id:JSON.stringify(['second','m1','KG']),sourceRowId:'second',machineCode:'MC-1',partCode:'PART-B',quantity:20,uomCode:'KG',days:{'2026-09-01':20}},{id:JSON.stringify(['third','m2','PCS']),sourceRowId:'third',machineCode:'MC-2',partCode:'PART-C',quantity:9,uomCode:'PCS',days:{'2026-09-02':9}}]},machineLabels:[{id:'m1',machineCode:'MC-1',machineName:'Press Machine (P-2)'},{id:'m2',machineCode:'MC-2',machineName:'P-1'}],snapshot:{derived:{capacity:{coilSeconds:1800,dieSeconds:3600,machineChildren:children,rows:dates.map(date=>({id:'m1:'+date,machineKey:'m1',machineCode:'MC-1',date,availableHours:6,loadHours:date.endsWith('01')?6:0,remainingHours:date.endsWith('01')?0:6,utilizationPct:date.endsWith('01')?100:0,status:date.endsWith('01')?'READY':'IDLE'}))},daily:{machines:[{id:'m1',code:'MC-1'},{id:'m2',code:'MC-2'}]}}}};
}
test('machine tabs use literal master numbers sorted naturally and monthly source selects matching machine only',()=>{
  const payload=fixture(),options=tables.machineOptions(payload);
  assert.deepEqual(options.map(row=>[row.label,row.key,row.rowCount]),[['P-1','m2',1],['P-2','m1',2]]);
  const model=tables.monthlyModel(payload,'m1');assert.deepEqual(model.rows.map(row=>row.partCode),['PART-A','PART-B']);assert.equal(model.dates.length,30);
  assert.match(tables.machineTabs(options,'m1'),/data-release-machine="m1"/);assert.match(tables.machineTabs(options,'m1'),/>P-2</);
});
test('machine numbers never invented from index, family or tonnage when no label is present',()=>{
  const payload=fixture();delete payload.machineLabels;
  assert.deepEqual(tables.machineOptions(payload).map(row=>row.label),['MC-1','MC-2']);
  payload.machineLabels={m1:'W-7',m2:{machineNumber:'S-1'}};
  assert.deepEqual(tables.machineOptions(payload).map(row=>row.label),['S-1','W-7']);
});
test('a named station without numbered asset uses its real master name with the code retained',()=>{
  const payload=fixture();payload.machineLabels=[{id:'m1',machineCode:'MC-1',machineName:'INSPECTION'}];
  const option=tables.machineOptions(payload).find(machine=>machine.key==='m1');assert.equal(option.label,'INSPECTION');assert.equal(option.code,'MC-1');
  assert.equal(tables.machineOptions(payload).at(-1).label,'INSPECTION');
  assert.match(tables.machineTabs([option],'m1'),/title="INSPECTION · MC-1"/);
});
test('daily resume uses setup counts once per operation and one shared machine calendar',()=>{
  const payload=fixture();payload.snapshot.derived.capacity.machineChildren.push(structuredClone(payload.snapshot.derived.capacity.machineChildren[0]));
  const model=tables.monthlyModel(payload,'m1'),day=model.daily[0];
  assert.equal(day.coilChanges,2);assert.equal(day.dieChanges,2);assert.equal(day.coilMinutes,60);assert.equal(day.dieMinutes,120);assert.equal(day.setupMinutes,180);
  assert.equal(day.productionMinutes,180);assert.equal(day.loadMinutes,360);assert.equal(day.availableMinutes,360);assert.equal(day.remainingMinutes,0);assert.equal(day.loadingRatio,100);
  assert.equal(model.daily[1].loadMinutes,0);assert.equal(model.daily[1].availableMinutes,360);assert.equal(model.daily[1].setupMinutes,0);
});
test('incomplete calendar or counts retain unknown; an unresolved date is not available zero',()=>{
  const payload=fixture(),cap=payload.snapshot.derived.capacity;
  cap.rows=cap.rows.filter(row=>row.date!=='2026-09-02');delete cap.machineChildren[0].days['2026-09-01'].coilChanges;
  const model=tables.monthlyModel(payload,'m1');assert.equal(model.daily[0].coilChanges,null);assert.equal(model.daily[0].setupMinutes,null);assert.equal(model.daily[1].availableMinutes,null);assert.equal(model.daily[1].loadMinutes,null);
  const other=tables.monthlyModel(payload,'m2');assert.equal(other.hasCapacity,false);assert.equal(other.daily[0].dieChanges,null);assert.match(tables.monthlySummary(other),/belum tersedia/);
});
test('conflicting duplicate setup evidence is not silently double counted',()=>{
  const payload=fixture(),cap=payload.snapshot.derived.capacity,duplicate=structuredClone(cap.machineChildren[0]);duplicate.days['2026-09-01'].coilChanges=4;cap.machineChildren.push(duplicate);
  const model=tables.monthlyModel(payload,'m1');assert.equal(model.daily[0].coilChanges,null);assert.equal(model.daily[0].setupMinutes,null);assert.equal(model.daily[0].availableMinutes,360);
});
test('time constants must be frozen evidence; percentages are labelled as percentages',()=>{
  const payload=fixture();delete payload.snapshot.derived.capacity.coilSeconds;
  const model=tables.monthlyModel(payload,'m1');assert.equal(model.daily[0].coilMinutes,null);assert.equal(model.daily[1].coilMinutes,0);
  const html=tables.monthlySummary(model);assert.match(html,/LOADING RATIO.*?\(%\)/);assert.match(html,/C\/T Coil/);assert.match(html,/2 kali/);assert.doesNotMatch(html,/LOADING RATIO.*?\(minute\)/);
});
test('monthly rows retain per-part UOM, escape identities and do not create combined heterogeneous quantity',()=>{
  const model=tables.monthlyModel(fixture(),'m1');model.rows[0].partCode='<img src=x>';model.rows[0].days['2026-09-02']=null;
  const rendered=tables.monthlyTable(model);assert.match(rendered.body,/&lt;img src=x&gt;/);assert.match(rendered.body,/>KG<\/td>/);assert.match(rendered.body,/>PCS<\/td>/);assert.match(rendered.body,/>—<\/td>/);assert.equal(rendered.columnCount,37);
  const summary=tables.monthlySummary(model);assert.doesNotMatch(summary,/Total Qty|32/);
});
test('MRP uses two material tabs and grouping by supplier identity even when names repeat',()=>{
  assert.match(tables.categoryTabs('MATERIAL'),/aria-selected="true"[^>]+data-release-material="MATERIAL"/);
  const rows=[{supplierCode:'S2',supplierName:'PT Same',partCode:'B'},{supplierCode:'S1',supplierName:'PT Same',partCode:'A'},{supplierCode:'S2',supplierName:'PT Same',partCode:'C'}];
  assert.deepEqual(tables.grouped(rows,'mrp').map(group=>group.rows.map(row=>row.partCode)),[['A'],['B','C']]);assert.deepEqual(tables.sortGrouped(rows,'mrp').map(row=>row.partCode),['A','B','C']);
});
test('fulfillment merges exact row id; absent or ambiguous evidence stays unknown instead of zero',()=>{
  const rows=[{id:'a',quantity:20},{id:'b',quantity:10},{id:'c',quantity:8}];
  const control={items:[{id:'a',actualQty:0,status:'PARTIAL'},{id:'c',actualQty:2},{id:'c',actualQty:3}]};
  const result=tables.fulfillmentRows(rows,control);
  assert.deepEqual(result.map(row=>[row.actualQty,row.remainingQty]),[[0,20],[null,null],[null,null]]);assert.equal(result[0].fulfillmentPct,0);assert.equal(result[1].fulfillmentStatus,'UNLINKED');
  assert.match(tables.fulfillmentStatus(result[0]),/role="progressbar"/);assert.doesNotMatch(tables.fulfillmentStatus(result[1]),/role="progressbar"/);
});
test('delivery/vendor/supplier grouping uses correct partner and safe status bars retain overfulfillment',()=>{
  for(const [view,key] of [['delivery','customer'],['vendor','vendor'],['incoming-material','supplier']])assert.equal(tables.partner({[key+'Code']:'A<1'},view).label,'A<1');
  const [row]=tables.fulfillmentRows([{id:'a',quantity:5}],{items:[{id:'a',actualQty:6,status:'FULFILLED',issue:'<unsafe>'}]});
  assert.equal(row.remainingQty,0);assert.equal(row.fulfillmentPct,120);
  const html=tables.fulfillmentStatus(row);assert.match(html,/120%/);assert.match(html,/aria-valuenow="100"/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/width:120/);
  const group=tables.groupRows([{customerCode:'<C>',quantity:3}],'delivery',[['quantity','Qty','qty']],row=>String(row.quantity));assert.match(group,/&lt;C&gt;/);assert.match(group,/colspan="1"/);
});
test('model and grouped fulfillment are read-only transformations of the frozen release',()=>{
  const payload=fixture(),before=JSON.stringify(payload);
  tables.monthlyModel(payload,'m1');tables.fulfillmentRows(payload.views.monthly,{items:[]});tables.sortGrouped(payload.views.monthly,'delivery');assert.equal(JSON.stringify(payload),before);
});
