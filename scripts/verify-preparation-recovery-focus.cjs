const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const focus=require('../public/js/ppic-recovery-focus');
const recovery=require('../public/js/ppic-readiness-recovery-model');
test('focus is opt-in and rejects selector injection while bounding query metadata',()=>{
  assert.equal(focus.parse('?readiness_fields=partName'),null);
  const p=focus.parse('?readiness=1&readiness_fields=partName,policy.primaryMachineId,%22%5D%3Bbody,partName&readiness_month=wrong');
  assert.deepEqual(p.fields,['partName','policy.primaryMachineId']);assert.equal(p.month,'');
});
test('generic master fields resolve by id/name, never change field values',()=>{
  const input={id:'field-bufferStock',value:150};
  const doc={getElementById:id=>id===input.id ? input : null,querySelector:()=>null};
  assert.deepEqual(focus.targets(doc,{fields:['bufferStock']}),[input]);assert.equal(input.value,150);
});
test('BOM focus is scoped to exact detail and process, not first occurrence of same part',()=>{
  const wrong={dataset:{processId:'r1'}},field={value:''};
  const route={dataset:{processId:'r2'},querySelectorAll:selector=>selector==='[data-policy-field="primaryMachineId"]' ? [field] : []};
  const inspector={dataset:{readinessDetail:'d2'}};
  const doc={getElementById:id=>id==='bom-inspector-form' ? inspector : null,querySelectorAll:()=>[wrong,route]};
  const config={detail:'d2',process:'r2',fields:['policy.primaryMachineId']};
  assert.deepEqual(focus.targets(doc,config),[field]);
  assert.deepEqual(focus.targets(doc,{...config,detail:'d1'}),[]);
  assert.deepEqual(focus.targets(doc,{...config,process:'missing'}),[]);
});
test('different component/process issues are not merged merely because their BOM and part match',()=>{
  const check={id:'bom-quantity',label:'BOM',stages:['MRP'],issues:['d1','d2'].map(id=>({code:'BOM1',sourceId:id,partCode:'P',fieldIssues:[{field:'node-qty',label:'Qty harus positif',href:`/modules/manufacturing-bom/bill-of-materials/BOM1/edit?focusDetail=${id}`}]}))};
  assert.equal(recovery.tasks([check]).length,2);
});
test('recovery row is compact with accessible full-detail action and no stacked small paragraphs',()=>{
  const source=fs.readFileSync(require.resolve('../public/js/ppic-preparation-readiness.js'),'utf8');
  const row=source.split('return `<tr class="prep-recovery-compact">')[1].split('`;')[0];
  assert.doesNotMatch(row,/<small|<br|<details/);assert.match(row,/prep-cell-ellipsis/);
  assert.match(source,/data-recovery-detail/);assert.match(source,/showModal\(\)/);
  const css=fs.readFileSync(require('node:path').join(__dirname,'../public/css/ppic-preparation-workbench.css'),'utf8');
  assert.match(css,/height: 38px/);assert.match(css,/white-space: nowrap/);
});
test('source form highlighting never sets values, submits, fetches or fabricates completion',()=>{
  const source=fs.readFileSync(require.resolve('../public/js/ppic-recovery-focus.js'),'utf8');
  assert.doesNotMatch(source,/\.value\s*=|\.submit\(|fetch\(|innerHTML\s*=/);
  assert.match(source,/document-form:loaded/);assert.match(source,/disimpan dan diperiksa ulang/);
});
