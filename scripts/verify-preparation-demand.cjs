'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../public/js/ppic-preparation-tree'),M=require('../public/js/ppic-preparation-model');
const w=()=>({month:'2026-09',delivery:[{id:'fg',partCode:'FG',partNumber:'PN',uomCode:'PCS',days:{'2026-09-10':100}}]});
const source=()=>({rows:[{id:'fg',partNumber:'PN',children:[],warnings:[],demandCoverage:{'2026-09-10':{status:'READY'}},demandContext:{nextMonth:'2026-10',previousMonth:'2026-08',note:'Basis',buffer:{days:{'2026-09-30':20},quantity:20,autoQuantity:20,source:'SYSTEM',verified:true},shortage:{days:{'2026-09-01':5},quantity:5,autoQuantity:5,source:'SYSTEM',verified:true}}}]});
test('one combined adjustment row appear below FG demand, retain identity and dates without changing actual delivery',()=>{
  const workbook=w(),snapshot=source(),before=structuredClone(workbook),rows=T.rows(workbook,snapshot);
  assert.equal(rows[0]._children.length,1);assert.equal(rows[0]._children[0]._kind,'ADJUSTMENT');
  assert.deepEqual(rows[0]._children[0].d30,{shortage:0,buffer:20});assert.deepEqual(rows[0]._children[0].d01,{shortage:5,buffer:0});
  assert.equal(rows[0]._children[0].partNumber,'PN');assert.equal(rows[0].d10,100);
  assert.equal(rows[0].demandCoverage['2026-09-10'].status,'READY');assert.deepEqual(workbook,before);
});
test('editing adjustment dates stores only override map and survives serialization/signature changes',()=>{
  const workbook=w(),before=T.signature(workbook),row=T.rows(workbook,source())[0]._children[0];
  row.d30.buffer=0;row.d29.buffer=17;T.captureProcess(workbook,row);
  assert.equal(workbook.demandAdjustments.fg.buffer['2026-09-29'],17);assert.equal(workbook.demandAdjustments.fg.buffer['2026-09-30'],0);
  assert.equal(workbook.processAllocations,undefined);assert.deepEqual(workbook.delivery,w().delivery);
  assert.equal(workbook.demandAdjustments.fg.shortage,undefined,'untouched shortage remains automatic');
  assert.notEqual(T.signature(workbook),before);assert.deepEqual(M.clone(workbook).demandAdjustments,workbook.demandAdjustments);
  assert.equal(T.editable(row,T.columns(workbook.month).find(c=>c.field==='partCode')),false);
  assert.equal(T.editable(row,T.columns(workbook.month).find(c=>c.field==='d29')),true);
});

test('combined clipboard and export preserve both halves and reject malformed quantities',()=>{
  const workbook=w(),row=T.rows(workbook,source())[0]._children[0],cols=T.columns(workbook.month),index=cols.findIndex(c=>c.field==='d01');
  const pasted=T.pasteVisible([row],cols,0,index,'7 | 12')[0];
  T.captureProcess(workbook,pasted);assert.equal(workbook.demandAdjustments.fg.shortage['2026-09-01'],7);assert.equal(workbook.demandAdjustments.fg.buffer['2026-09-01'],12);
  assert.equal(T.exportValue(pasted,cols[index]),'7 | 12');assert.throws(()=>T.parseAdjustment('-1 | 5'));assert.throws(()=>T.parseAdjustment('1|2|3'));
});
test('unknown source stays a dash rather than a verified zero and cannot mutate source state',()=>{
  const snapshot=source();snapshot.rows[0].demandContext.buffer={days:{},quantity:null,autoQuantity:null,verified:false,source:'SYSTEM'};
  const row=T.rows(w(),snapshot)[0]._children[0];assert.equal(row.d30.buffer,null);assert.equal(row._total.buffer,null);
});

test('explicit zero can correct an unknown half without changing the other automatic source',()=>{
  const snapshot=source(),workbook=w();snapshot.rows[0].demandContext.buffer={days:{},quantity:null,verified:false,source:'SYSTEM'};
  const row=T.rows(workbook,snapshot)[0]._children[0];row.d30.buffer=0;T.captureProcess(workbook,row);
  assert.equal(workbook.demandAdjustments.fg.buffer['2026-09-30'],0);assert.equal(workbook.demandAdjustments.fg.shortage,undefined);
});
