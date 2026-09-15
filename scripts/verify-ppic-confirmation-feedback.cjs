'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const feedback=require('../public/js/ppic-confirmation-feedback');
const tables=require('../public/js/ppic-released-tables');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('schedule markers use exact row and projection references, with original and effective dates',()=>{
  const f={changes:[{view:'supplier',rowId:'r1',originalDate:'2026-09-18',currentDate:'2026-09-20',reason:'ETA supplier'},{view:'daily',rowId:'r1',originalDate:'2026-09-19',currentDate:'2026-09-21'}]};
  const html=feedback.marker({id:'r1'},f,'incoming-material');
  assert.match(html,/2026-09-18 → 2026-09-20/);assert.doesNotMatch(html,/2026-09-21/);
  assert.equal(feedback.marker({id:'r2',partCode:'same'},f,'incoming-material'),'');
  assert.match(feedback.marker({sourceRowId:'r1'},f,'supplier'),/ETA supplier/);
});
test('inline changes and labels are escaped and unsafe document destinations are excluded',()=>{
  assert.match(feedback.marker({scheduleChange:{reason:'<img onerror="x">',originalDate:'2026-09-18',currentDate:'2026-09-20'}}),/&lt;img/);
  const html=feedback.links('2026-09',{documents:[{type:'PURCHASE_SUGGESTION',number:'unsafe',href:'javascript:alert(1)'},{type:'VENDOR_CONFIRMATION',number:'bad',href:'/modules/\\evil'}]});
    assert.doesNotMatch(html,/javascript:|\\evil/);assert.match(html,/tab=ppic&amp;partner=customer/);assert.equal(feedback.links('invalid',{}),'');
});
test('multiple supplier suggestions remain individually reviewable',()=>{
  const docs=[1,2].map(i=>({type:'PURCHASE_SUGGESTION',number:'PS-'+i,href:'/modules/purchasing/purchase-suggestions/PS-'+i}));
  const html=feedback.links('2026-09',{documents:docs});
  assert.match(html,/2 dokumen/);assert.match(html,/PS-1/);assert.match(html,/PS-2/);
});
test('PPIC purchase source links to its release month while MRP sources remain unmodified',()=>{
  const info=feedback.releaseSource({runNumber:'PPIC_RELEASE:uuid',items:[{sourceRequirements:[{sourceType:'PPIC_RELEASE',month:'2026-09'}]}]});
  assert.equal(info.href,'/modules/planning-ppic/released?month=2026-09');assert.equal(info.label,'PPIC Released 2026-09');
  assert.equal(feedback.releaseSource({runNumber:'MRP-123'}),null);
});
test('compact feedback strip clears old month data when release is unavailable',()=>{
  const node={};feedback.render(node,{status:'LOCKED',month:'2026-09',feedback:{revision:2,pendingCount:3,confirmedCount:4,changes:[]}}, {sync:true});
  assert.equal(node.hidden,false);assert.match(node.innerHTML,/4 dikonfirmasi · 3 menunggu/);assert.match(node.innerHTML,/data-ppic-confirmation-sync/);
  feedback.render(node,{status:'DRAFT',month:'2026-10'});assert.equal(node.hidden,true);assert.equal(node.innerHTML,'');
});
test('monthly matrix renders a compact marker without changing quantities',()=>{
  const row={id:'r1',partCode:'P1',quantity:20,days:{'2026-09-20':20},scheduleChange:{originalDate:'2026-09-18',currentDate:'2026-09-20'}};
  const table=tables.monthlyTable({rows:[row],dates:['2026-09-18','2026-09-20']},[row],r=>feedback.marker(r));
  assert.match(table.body,/ppic-eta-changed/);assert.match(table.body,/has-plan">20/);assert.equal(row.quantity,20);
});
test('cross-tab notifications deduplicate BroadcastChannel/storage and carry no plan payload',()=>{
  const handlers={},events=[],stored=[];let channel;
  const win={crypto:{randomUUID:()=> 'id1'},CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}},BroadcastChannel:class {constructor(){channel=this;}postMessage(value){this.sent=value;}},addEventListener(type,fn){handlers[type]=fn;},dispatchEvent(event){events.push(event);},localStorage:{setItem(key,value){stored.push([key,value]);}}};
  feedback.connect(win);feedback.notify({month:'2026-09',source:'purchase-suggestion',secret:'omit'});
  assert.equal(events.length,1);assert.equal(channel.sent.month,'2026-09');assert.equal(channel.sent.secret,undefined);
  const received={...channel.sent,id:'remote'};channel.onmessage({data:received});handlers.storage({key:stored[0][0],newValue:JSON.stringify(received)});
  assert.equal(events.length,2);assert.equal(events[1].type,'ppic:confirmation-changed');
});
test('nested monthly changes and Lab source-process rows retain exact original/current dates',()=>{
  const change={view:'daily',rowId:'job1',sourceRowId:'process1',originalDate:'2026-09-18',currentDate:'2026-09-20'};
  assert.match(feedback.marker({scheduleChange:{changes:[change]}}),/2026-09-18 → 2026-09-20/);
  assert.match(feedback.marker({id:'process1'},{changes:[change]}),/2026-09-18 → 2026-09-20/);
});
test('blocked schedules and supplier split commitments remain visible and never total unlike units',()=>{
  const node={};feedback.render(node,{id:'rel1',status:'LOCKED',month:'2026-09',views:{daily:[{id:'j1',date:'2026-09-20',partCode:'FG1'}]},feedback:{conflicts:[{view:'daily',rowId:'j1',reason:'Material kurang'}],commitments:[{kind:'supplier',partnerCode:'S1',partCode:'M1',qty:10,uomCode:'KG',eta:'2026-09-19',leadTimeDays:2,moq:10},{kind:'supplier',partnerCode:'S2',partCode:'M1',qty:20,uomCode:'KG',eta:'2026-09-20',leadTimeDays:3,moq:20}]}});
  assert.match(node.innerHTML,/FG1 · 2026-09-20/);assert.match(node.innerHTML,/Material kurang/);assert.match(node.innerHTML,/2 alokasi partner/);assert.match(node.innerHTML,/S1/);assert.match(node.innerHTML,/S2/);assert.match(node.innerHTML,/releaseId=rel1/);
});
function lockedRefreshFixture(){
  const source=fs.readFileSync(path.join(__dirname,'../public/js/ppic-preparation.js'),'utf8');
  const fn=source.slice(source.indexOf('async function refreshTree('),source.indexOf('function columnTitle('));
  const workbook={month:'2026-09',delivery:[{id:'fg',days:{'2026-09-18':10}}]},requests=[],renders=[],nodes=new Map();
  const context=vm.createContext({workbook,confirmationFeedback:{revision:0},tree:{month:'2026-09',rows:[]},treeKey:JSON.stringify(workbook),treeRequest:0,treeLoading:false,treeError:'',monthState:{status:'LOCKED'},locked:()=>true,T:{signature:JSON.stringify},M:{clone:structuredClone},api:()=>new Promise(resolve=>requests.push(resolve)),feedbackUI:feedback,$:id=>{if(!nodes.has(id))nodes.set(id,{querySelector:()=>null});return nodes.get(id);},summaries(){},controls(){},syncSettings(){},json:()=>JSON.stringify(context.workbook),refreshHolidayHeaders:async()=>{},grid:{replaceData:async()=>renders.push(context.tree)},treeData(){return [];},filter(){},selected:null,history:[],historyIndex:0,message(){}});
  vm.runInContext(fn+'\nglobalThis.refresh = refreshTree;',context);return {context,requests,renders};
}
test('locked Lab background refresh applies effective workbook and snapshot together without clearing unchanged sheets',async()=>{
  const f=lockedRefreshFixture();const first=f.context.refresh(true);assert.equal(f.context.treeLoading,false);
  f.requests[0]({status:'LOCKED',month:'2026-09',feedback:{revision:1},workbook:{month:'2026-09',delivery:[{id:'fg',days:{'2026-09-20':10}}]},snapshot:{month:'2026-09',rows:[{id:'new'}]}});await first;
  assert.equal(f.context.workbook.delivery[0].days['2026-09-20'],10);assert.equal(f.context.tree.rows[0].id,'new');assert.equal(f.context.confirmationFeedback.revision,1);assert.equal(f.renders.length,1);
  const second=f.context.refresh(true);f.requests[1]({status:'LOCKED',month:'2026-09',feedback:{revision:1},snapshot:{rows:[]}});await second;assert.equal(f.renders.length,1);assert.equal(f.context.tree.rows[0].id,'new');
});
test('locked Lab refuses a delayed response after selected workbook changed',async()=>{
  const f=lockedRefreshFixture(),pending=f.context.refresh(true);f.context.workbook={month:'2026-10',delivery:[]};f.context.treeRequest++;
  f.requests[0]({status:'LOCKED',month:'2026-09',feedback:{revision:5},workbook:{month:'2026-09'},snapshot:{rows:[{id:'stale'}]}});await pending;
  assert.equal(f.context.workbook.month,'2026-10');assert.equal(f.renders.length,0);assert.equal(f.context.confirmationFeedback.revision,0);
});
