const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/js/ppic-preparation-model');
const recovery=require('../public/js/ppic-readiness-recovery-model');
test('all three sheets have read-only Part Number and export/roundtrip keeps it',()=>{
  for(const sheet of ['delivery','production','material']){
    const columns=M.columns(sheet,'2026-09'),column=columns.find(c=>c.field==='partNumber');
    assert.equal(column.title,'Part Number');assert.equal(column.readonly,true);
    assert.throws(()=>M.parse('WRONG',column),/master part/);
    const row={...M.blank(sheet,'1'),partCode:'P',partNumber:'PN-001',days:{'2026-09-02':42}};
    const flat=M.flatten([row],'2026-09');
    assert.equal(M.inflate(flat,sheet,'2026-09')[0].partNumber,'PN-001');
    assert.throws(()=>M.paste(flat,columns,0,columns.indexOf(column),'WRONG',()=>M.blank(sheet,'2')),/master part/);
    assert.equal(flat[0].partNumber,'PN-001');assert.equal(flat[0].d02,42);
  }
});
test('recovery keeps every child code when drawing numbers are shared and searches number',()=>{
  const tasks=recovery.tasks([{id:'supplier',label:'Supplier',stages:['MRP'],issues:['A','B'].map(partCode=>({code:partCode,partCode,partNumber:'DRAWING-123',fieldIssues:[{field:'leadTimeDays',label:'Lead time',href:'/master-data/suppliers/one/edit?key=S001'}]}))}]);
  assert.equal(tasks.length,1);assert.equal(tasks[0].contexts.length,2);
  assert.deepEqual(tasks[0].contexts.map(c=>c.part),['A','B']);
  assert.equal(recovery.filter(tasks,{term:'drawing-123'}).length,1);
  assert.equal(recovery.filter(tasks,{term:'unknown'}).length,0);
});
test('actual production and vendor tables render master numbers without shifting quantities',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',handlers:{},setAttribute(){},append(){},after(){},addEventListener(name,fn){this.handlers[name]=fn;}});return nodes.get(id);};
  node('pa-month').value='2026-09';node('pa-period').value='day';
  const payload={month:'2026-09',rows:[{resource:'M1',partCode:'CHILD',partNumber:'DRAWING-123',partName:'Child',processCode:'CUT',unit:'PCS',good:3,target:10,shortfall:7,sources:[],days:{}}],vendors:[{vendorCode:'V1',partCode:'CHILD',partNumber:'DRAWING-123',processCode:'COAT',orderNumber:'VPO-1',target:10,sent:10,received:3,acceptedPosition:2,ng:1,unit:'PCS'}]};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/ppic-production-actuals.js'),'utf8'),{
    document:{querySelector:()=>node('root'),getElementById:node,createElement:()=>node('created')},
    window:{PpicCalendar:require('../public/js/ppic-calendar-model'),PpicI18n:{t:key=>key,locale:()=> 'id-ID'},addEventListener(){}},
    localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},fetch:async()=>({ok:true,json:async()=>payload}),Intl,Date,
  });
  await new Promise(resolve=>setImmediate(resolve));
  node('pa-table').handlers.click({target:{closest:()=>({dataset:{paGroup:'M1'}})}});
  assert.match(node('pa-table').innerHTML,/<th rowspan="2">Part Number<\/th>/);
  assert.match(node('pa-table').innerHTML,/<td>DRAWING-123<\/td><td>3 \/ 10/);
  assert.match(node('pa-table').innerHTML,/colspan="33"/);
  assert.match(node('pa-vendors').innerHTML,/<td>DRAWING-123<\/td><td>VPO-1<\/td><td>10 PCS/);
  node('pa-search').value='drawing-123';node('pa-search').handlers.input();
  assert.match(node('pa-table').innerHTML,/DRAWING-123/);
});
