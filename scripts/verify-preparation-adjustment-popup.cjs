'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../public/js/ppic-preparation-adjustment-edit'),T=require('../public/js/ppic-preparation-tree');
const workbook=()=>({month:'2026-09',delivery:[{id:'fg',partCode:'FG',uomCode:'PCS',days:{'2026-09-10':100}}],processAllocations:{process:{'2026-09-01':100}}});
const snapshot=()=>({rows:[{id:'fg',children:[],warnings:[],demandContext:{previousMonth:'2026-08',nextMonth:'2026-10',shortage:{verified:true,source:'SYSTEM',days:{'2026-09-01':5},quantity:5},buffer:{verified:true,source:'SYSTEM',days:{'2026-09-30':20},quantity:20}}}]});
const change=w=>({parentId:'fg',date:'2026-09-01',signature:T.signature(w),shortage:5,buffer:0});
test('popup changes the chosen date and preserves untouched sources, delivery and process allocations',()=>{
  const w=workbook(),s=snapshot(),before=structuredClone({w,s});
  assert.equal(api.apply(w,s,{...change(w),shortage:'7,5'}),true);
  assert.equal(w.demandAdjustments.fg.shortage['2026-09-01'],7.5);
  assert.equal(w.demandAdjustments.fg.buffer,undefined);
  delete w.demandAdjustments;assert.deepEqual({w,s},before);
});
test('unchanged values are a no-op and invalid or stale changes fail atomically',()=>{
  const w=workbook(),s=snapshot(),before=structuredClone(w);
  assert.equal(api.apply(w,s,change(w)),false);assert.deepEqual(w,before);
  for(const extra of [{buffer:-1},{shortage:''},{buffer:'=1+1'},{date:'2026-10-01'},{parentId:'missing'},{signature:'stale'}]){
    assert.throws(()=>api.apply(w,s,{...change(w),...extra}));assert.deepEqual(w,before);
  }
});
test('unknown source stays unknown when left blank; explicit zero is a valid correction',()=>{
  const w=workbook(),s=snapshot();s.rows[0].demandContext.buffer={verified:false,source:'SYSTEM',days:{},quantity:null};
  assert.equal(api.apply(w,s,{...change(w),buffer:''}),false);
  assert.equal(api.apply(w,s,{...change(w),buffer:'0'}),true);
  assert.equal(w.demandAdjustments.fg.buffer['2026-09-01'],0);
  assert.equal(w.demandAdjustments.fg.shortage,undefined);
});
function fixture(commit=async()=>{}){
  const nodes=new Map(),doc={activeElement:null,getElementById:id=>nodes.get(id)};
  for(const id of ['prep-adjustment-dialog','prep-grid','opener',...['close','cancel','shortage','buffer','shortage-source','buffer-source','total','apply','error','form','context'].map(key=>'prep-adjustment-edit-'+key)]){
    nodes.set(id,{value:'',textContent:'',disabled:false,open:false,isConnected:true,events:{},addEventListener(type,fn){this.events[type]=fn;},fire(type){return this.events[type]?.({preventDefault(){}});},focus(){doc.activeElement=this;},select(){},showModal(){this.open=true;},close(){this.open=false;this.fire('close');}});
  }
  const opener=nodes.get('opener');opener.focus();
  return {doc,opener,dialog:nodes.get('prep-adjustment-dialog'),node:key=>nodes.get('prep-adjustment-edit-'+key),mounted:api.mount(doc,commit)};
}
test('opening and cancelling popup preserves data and returns focus; submit sends both quantities',async()=>{
  const w=workbook(),s=snapshot(),calls=[],f=fixture(async change=>calls.push(change)),row=T.rows(w,s)[0]._children[0];
  f.mounted.open(row,'2026-09-01',T.signature(w));
  assert.equal(f.node('shortage').value,'5');assert.equal(f.node('buffer').value,'0');
  assert.match(f.node('context').textContent,/FG.*1 September 2026/);
  f.node('shortage').value='10';f.node('cancel').fire('click');
  assert.equal(f.dialog.open,false);assert.equal(f.doc.activeElement,f.opener);assert.equal(calls.length,0);
  f.mounted.open(row,'2026-09-01',T.signature(w));f.node('shortage').value='10';f.node('buffer').value='2';
  await f.node('form').fire('submit');
  assert.deepEqual(calls,[{...change(w),shortage:10,buffer:2}]);assert.equal(f.dialog.open,false);
});
test('validation and commit errors retain popup inputs without losing the edit',async()=>{
  const f=fixture(async()=>{throw Error('Draft changed');}),w=workbook();
  f.mounted.open(T.rows(w,snapshot())[0]._children[0],'2026-09-01',T.signature(w));
  f.node('buffer').value='-1';await f.node('form').fire('submit');assert.equal(f.dialog.open,true);assert.ok(f.node('error').textContent);
  f.node('buffer').value='2';await f.node('form').fire('submit');assert.equal(f.node('error').textContent,'Draft changed');assert.equal(f.node('buffer').value,'2');assert.equal(f.dialog.open,true);assert.equal(f.node('apply').disabled,false);
});
