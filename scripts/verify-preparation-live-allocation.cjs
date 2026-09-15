const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/js/ppic-preparation-model'),T=require('../public/js/ppic-preparation-tree');
const month='2026-09';
const workbook=()=>({month,name:'Live allocation',delivery:[{id:'fg',partCode:'FG',partNumber:'DRAW-FG',uomCode:'PCS',customerCode:'C1',days:{'2026-09-10':100}}],production:[{id:'legacy-production',days:{'2026-09-05':100}}],material:[{id:'legacy-material',days:{'2026-09-03':250}}],allocationSettings:{plannedDowntimeHoursPerDay:1,postProcessGapHours:4},processAllocations:{}});
const snapshot=()=>({rows:[{id:'fg',currentStock:35,unallocatedQty:15,requiredQty:100,stockAssigned:30,children:[{id:'process',partCode:'WIP',partNumber:'DRAW-WIP',uomCode:'PCS',processCode:'PRESS',rowType:'In-house',days:{'2026-09-04':25,'2026-09-05':30},currentStock:10,unallocatedQty:5,allocationIssues:['Capacity fixture warning']}],warnings:[]}]});
const visible=()=>{const fg=T.rows(workbook(),snapshot())[0];return [fg,...fg._children];};
const cols=()=>T.columns(month);

test('PO/forecast/additional precede read-only Current Stock and Unallocated Qty',()=>{
  const c=cols(),rows=visible();
  assert.deepEqual(c.slice(4,11).map(col=>col.field),['partName','poQty','forecastQty','additionalPoQty','currentStock','unallocatedQty','d01']);
  assert.deepEqual(c.slice(8,10).map(col=>[M.letter(c.indexOf(col)),col.title,col.numeric,col.readonly]),[['I','Current Stock',true,true],['J','Unallocated Qty',true,true]]);
  for(const row of rows)for(const col of c.slice(5,10))assert.equal(T.editable(row,col),false);
  assert.equal(rows[0].currentStock,35);assert.equal(rows[0].unallocatedQty,15);
  assert.equal(rows[1].currentStock,10);assert.equal(rows[1].unallocatedQty,5);
  const empty=T.rows(workbook(),null)[0];assert.equal(empty.currentStock,null);assert.equal(empty.unallocatedQty,null);
});
test('PROCESS allows only date edits and NOTICE allows no edits; FG demand dates stay editable',()=>{
  const [fg,child]=visible(),notice={_kind:'NOTICE'};
  for(const col of cols()) {
    assert.equal(T.editable(child,col),!!col.date&&!col.readonly,`${col.field} process editability`);
    assert.equal(T.editable(notice,col),false,`${col.field} notice editability`);
    if(col.date)assert.equal(T.editable(fg,col),!col.readonly);
  }
  assert.equal(T.editable(child,undefined),false);
});
test('captureProcess stores the complete month including zeros and preserves source/legacy sheets',()=>{
  const w=workbook(),[fg,child]=visible(),before=M.clone(w),originalChild=M.clone(child);
  T.captureProcess(w,fg);T.captureProcess(w,{id:'notice',_kind:'NOTICE'});assert.deepEqual(w.processAllocations,{});
  child.id=JSON.stringify(['fg-id',JSON.stringify(['bom',Array(15).fill('WIP-occurrence'),'process-id'])]);child.d04=0;child.d05=12.5;
  T.captureProcess(w,child);
  assert.equal(Object.keys(w.processAllocations).length,1);assert.ok(child.id.length>100);
  const saved=w.processAllocations[child.id];assert.equal(Object.keys(saved).length,30);assert.equal(saved['2026-09-04'],0);assert.equal(saved['2026-09-05'],12.5);assert.equal(saved['2026-09-30'],0);
  assert.equal(saved.currentStock,undefined);assert.equal(saved.requiredQty,undefined);
  assert.deepEqual(w.delivery,before.delivery);assert.deepEqual(w.production,before.production);assert.deepEqual(w.material,before.material);assert.deepEqual(w.allocationSettings,before.allocationSettings);
  assert.equal(child._kind,originalChild._kind);assert.equal(child.currentStock,originalChild.currentStock);
  T.captureProcess(w,{...child,d05:0});assert.equal(w.processAllocations[child.id]['2026-09-05'],0);
});
test('pasteVisible parses a real-grid rectangle across FG/process dates without mutating originals',()=>{
  const rows=visible(),before=M.clone(rows),c=cols(),start=c.findIndex(col=>col.field==='d04');
  const result=T.pasteVisible(rows,c,0,start,'1.250\t0\r\n2,5\t12\r\n');
  assert.deepEqual(rows,before);assert.equal(result.length,2);
  assert.deepEqual(result.map(row=>[row.d04,row.d05]),[[1250,0],[2.5,12]]);
  assert.equal(result[0].d10,100);assert.equal(result[1].currentStock,10);
  const w=workbook();for(const row of result)T.captureProcess(w,row);
  w.delivery=M.inflate(result.filter(row=>row._kind==='FG'),'delivery',month);
  assert.equal(w.delivery[0].days['2026-09-04'],1250);assert.equal(w.delivery[0].uomCode,'PCS');assert.equal(w.delivery[0].customerCode,'C1');
  assert.equal(w.processAllocations.process['2026-09-04'],2.5);assert.equal(w.processAllocations.process['2026-09-05'],12);
});

test('real-grid paste supports a single receipt date vertically and rejects invalid later columns atomically',()=>{
  const rows=visible(),before=M.clone(rows),c=cols(),start=c.findIndex(col=>col.field==='d04');
  const result=T.pasteVisible(rows,c,0,start,'1.250\r\n2,5\r\n');
  assert.deepEqual(result.map(row=>row.d04),[1250,2.5]);assert.deepEqual(rows,before);
  assert.throws(()=>T.pasteVisible(rows,c,0,start,'10\t20\n30\t-1'));
  assert.deepEqual(rows,before);
});
test('paste is atomic when a later row contains invalid quantity or a readonly notice',()=>{
  const rows=visible(),before=M.clone(rows),c=cols(),start=c.findIndex(col=>col.field==='d04');
  for(const text of ['15\n-1','15\n=SUM(A1:A2)','15\n1000000000001']) {
    assert.throws(()=>T.pasteVisible(rows,c,0,start,text));assert.deepEqual(rows,before);
  }
  const withNotice=[rows[0],{id:'notice',_kind:'NOTICE',partName:'Missing BOM'}],noticeBefore=M.clone(withNotice);
  assert.throws(()=>T.pasteVisible(withNotice,c,0,start,'15\n20'),/hanya baca/);assert.deepEqual(withNotice,noticeBefore);
});
test('paste rejects computed stock/metadata/total and out-of-range cells without altering rows',()=>{
  const rows=visible(),before=M.clone(rows),c=cols();
  for(const field of ['currentStock','unallocatedQty','explodeNo','processCode','_total']) assert.throws(()=>T.pasteVisible(rows,c,0,c.findIndex(col=>col.field===field),'10'),/hanya baca/);
  assert.throws(()=>T.pasteVisible(rows,c,1,c.findIndex(col=>col.field==='partCode'),'REPLACE-WIP'),/hanya baca/);
  const day=c.findIndex(col=>col.field==='d01');
  for(const startRow of [-1,rows.length])assert.throws(()=>T.pasteVisible(rows,c,startRow,day,'10'),/baris terlihat/);
  assert.throws(()=>T.pasteVisible(rows,c,0,day,'1\n2\n3'),/baris terlihat/);
  assert.throws(()=>T.pasteVisible(rows,c,0,-1,'1'),/hanya baca/);
  assert.throws(()=>T.pasteVisible(rows,c,0,c.length,'1'),/hanya baca/);
  assert.throws(()=>T.pasteVisible(rows,c,0,c.findIndex(col=>col.field==='d30'),'1\t2'),/hanya baca/);
  assert.deepEqual(rows,before);
});
test('signature invalidates on settings or manual changes but not legacy production/material edits',()=>{
  const w=workbook(),key=T.signature(w);w.production[0].days['2026-09-05']=200;w.material[0].days['2026-09-03']=500;assert.equal(T.signature(w),key);
  w.allocationSettings.plannedDowntimeHoursPerDay=2;assert.notEqual(T.signature(w),key);const downtime=T.signature(w);
  w.allocationSettings.postProcessGapHours=6;assert.notEqual(T.signature(w),downtime);const gap=T.signature(w);
  w.processAllocations.process={'2026-09-01':0};assert.notEqual(T.signature(w),gap);const manual=T.signature(w);
  w.processAllocations.process['2026-09-01']=5;assert.notEqual(T.signature(w),manual);
  const reordered={...w,allocationSettings:{postProcessGapHours:6,plannedDowntimeHoursPerDay:2}};assert.equal(T.signature(w),T.signature(reordered));
});
