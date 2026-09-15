const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/js/ppic-preparation-model'),T=require('../public/js/ppic-preparation-tree');
const workbook=()=>({month:'2026-09',name:'Test',delivery:[{id:'d',partCode:'FG',partNumber:'PN',uomCode:'PCS',customerCode:'C1',days:{'2026-09-02':10}}],production:[{id:'p',partCode:'FG',uomCode:'PCS',days:{'2026-09-01':10}}],material:[{id:'m',partCode:'RAW',uomCode:'KG',days:{'2026-09-01':50}}]});
const snapshot=()=>({rows:[{id:'d',partNumber:'PN',children:[{id:'c',partCode:'CHILD',partNumber:'PN',rowType:'In-house',processCode:'CUT',uomCode:'PCS',days:{'2026-09-02':20}}],warnings:[]}]});
test('compact columns combine part identity and hide unit/customer without losing persisted context',()=>{
  const w=workbook(),cols=T.columns(w.month),rows=T.rows(w,snapshot());
  assert.equal(cols.some(c=>['partNumber','uomCode','customerCode'].includes(c.field)),false);
  assert.equal(cols.find(c=>c.field==='partCode').title,'Part Code / Part Number');
  assert.equal(rows[0].partNumber,'PN');assert.equal(rows[0]._children[0].partNumber,'PN');
  rows[0].d02=15;
  const saved=M.inflate(rows,'delivery',w.month)[0];
  assert.equal(saved.uomCode,'PCS');assert.equal(saved.customerCode,'C1');assert.equal(saved.partNumber,'PN');
  assert.equal(saved.days['2026-09-02'],15);
});
test('tree has editable FG demand and process date allocations, with read-only process metadata',()=>{
  const rows=T.rows(workbook(),snapshot()),cols=T.columns('2026-09'),qty=cols.find(c=>c.field==='d02');
  assert.equal(rows[0].rowType,'Delivery Need');assert.equal(rows[0].d02,10);assert.equal(rows[0]._children[0].d02,20);
  assert.equal(T.editable(rows[0],qty),true);assert.equal(T.editable(rows[0]._children[0],qty),true);
  assert.equal(T.editable(rows[0]._children[0],cols.find(c=>c.field==='partCode')),false);
  assert.equal(T.editable(rows[0],cols.find(c=>c.field==='explodeNo')),false);
  assert.equal(cols.filter(c=>c.date&&c.movement==='allocation').length,30);assert.equal(cols.filter(c=>c.date).length,30);
  assert.equal(cols.some(c=>c.movement==='dispatch'),false);
});
test('persisting parents retains legacy production/material, never stores derived children as demand',()=>{
  const w=workbook(),production=JSON.stringify(w.production),material=JSON.stringify(w.material);
  w.delivery=M.inflate(T.rows(w,snapshot()),'delivery',w.month);
  assert.equal(w.delivery.length,1);assert.equal(w.delivery[0]._children,undefined);
  assert.equal(JSON.stringify(w.production),production);assert.equal(JSON.stringify(w.material),material);
  assert.equal(M.totals(w.delivery).PCS,10);
});
test('export includes all children regardless of collapsed UI state, but no material',()=>{
  const rows=T.exportRows(workbook(),snapshot());assert.equal(rows.length,2);assert.equal(rows.some(r=>r.partCode==='RAW'),false);assert.equal(rows[1].processCode,'CUT');
});
test('missing or failed explosion produces an explicit notice rather than invented zero demand',()=>{
  const row=T.rows(workbook(),null,'Sumber gagal dibaca')[0]._children[0];
  assert.equal(row._kind,'NOTICE');assert.equal(row._total,null);assert.equal(row.d02,undefined);assert.match(row.partName,/gagal/);
});
test('delivery changes invalidate the tree while legacy material changes do not',()=>{
  const w=workbook(),key=T.signature(w);w.material[0].days['2026-09-01']=75;assert.equal(T.signature(w),key);
  w.delivery[0].days['2026-09-02']=15;assert.notEqual(T.signature(w),key);
});
test('vendor dispatch and lead-time overrides invalidate the tree without mutating legacy allocations',()=>{
  const w=workbook(),initial=T.signature(w);
  w.vendorDispatchAllocations={vendor:{'2026-09-01':10}};
  const dispatch=T.signature(w);assert.notEqual(dispatch,initial);
  w.vendorLeadTimeOverrides={vendor:{value:2,unit:'DAY'}};
  const override=T.signature(w);assert.notEqual(override,dispatch);
  w.vendorLeadTimeOverrides.vendor.value=3;assert.notEqual(T.signature(w),override);
  assert.equal(w.processAllocations,undefined);
});
test('valid FG without WIP processes has no false recovery warning',()=>{
  const source={rows:[{id:'d',children:[],warnings:[]}]},before=JSON.stringify(source);
  const rows=T.rows(workbook(),source);
  assert.equal(rows[0].rowType,'Delivery Need');assert.deepEqual(rows[0]._children,[]);
  assert.equal(JSON.stringify(source),before);
});
test('hierarchical process numbers and predecessor references are preserved without an FG prefix',()=>{
  const w=workbook(),s=snapshot();
  Object.assign(s.rows[0],{dependencyStatus:'KNOWN',deliveryPredecessors:['003.000.000']});
  Object.assign(s.rows[0].children[0],{explodeNo:'003.001.000',dependencyStatus:'KNOWN',productionStage:2,predecessorNumbers:['003.001.001'],parallelNumbers:['003.002.000']});
  const row=T.rows(w,s)[0],child=row._children[0];
  assert.equal(row.explodeNo,'FG 001');assert.equal(row.dependsOn,'003.000.000');
  assert.equal(child.explodeNo,'003.001.000');assert.equal(child.dependsOn,'003.001.001');assert.equal(child.parallelWith,'003.002.000');
  assert.equal(child.productionFlow,'Concurrent + Precedence');
  assert.ok(T.columns(w.month).filter(c=>['explodeNo','productionFlow','dependsOn'].includes(c.field)).every(c=>c.readonly));
  const saved=M.inflate([row],'delivery',w.month)[0];assert.equal(saved.explodeNo,undefined);assert.equal(saved.dependsOn,undefined);
});
