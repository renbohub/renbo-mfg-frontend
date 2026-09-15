'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ejs=require('ejs');
const api=require('../public/js/ppic-released-daily');
const origin=date=>Date.parse(date+'T00:00:00Z')/60000;
const job=(extra={})=>({id:'job-1',sourceRowId:'route-1',date:'2026-09-15',machineKey:'m1',machineCode:'P-1',partCode:'PART',partNumber:'1100',processCode:'PRESS',quantity:20,uomCode:'PCS',segments:[{start:origin('2026-09-15')+300,end:origin('2026-09-15')+420,qty:20,setupMinutes:30}],...extra});
const ng=(extra={})=>({id:'ng-1',sourceJobId:'job-1',sourceDate:'2026-09-02',partCode:'PART',machineCode:'P-1',quantity:10,recoveredQty:3,remainingQty:7,uomCode:'PCS',sourceNumber:'LOG-1',...extra});
test('Gantt uses a 05:00 operational day and clips split setup/production without shifting local clock',()=>{
  const j=job(),model=api.chartModel([j],[],'2026-09-15');
  assert.equal(model.start,origin('2026-09-15')+300);assert.equal(model.end-model.start,1440);
  const spans=api.segments(j,model.start);assert.equal(spans.length,2);assert.equal(spans[0].setup,true);assert.equal(spans[0].width,30/1440*100);assert.equal(spans[1].left,30/1440*100);
  assert.equal(api.clock(model.start),'05:00');assert.equal(api.clock(model.end),'05:00');
  const overnight=job({date:'2026-09-14',segments:[{start:model.start-20,end:model.start+20,qty:5}]});
  assert.equal(api.chartModel([overnight],[],'2026-09-15').jobs.length,1);assert.equal(api.segments(overnight,model.start)[0].width,20/1440*100);
});
test('Gantt is read-only, separates recovery, escapes source labels and keeps native machine numbers',()=>{
  const html=api.chart(api.chartModel([job(),job({id:'recover',recoveryId:'r1',partCode:'<script>'})],[{id:'m1',code:'P-1',windows:[]}],'2026-09-15'));
  assert.match(html,/P-1/);assert.match(html,/is-recovery/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/draggable|data-daily-job|pointerdown/);
  assert.match(html,/role="img" aria-label=/);assert.match(html,/is-setup/);
});
test('Gantt exposes native DPS only from verified server references with safe distinct document links',()=>{
  const html=api.jobIdentity(job({partCode:'PART<script>',scheduleNumber:'DPS/1',executionSchedules:[{scheduleNumber:'DPS/1'},{scheduleNumber:'DPS<2>'}]}));
  assert.match(html,/href="\/modules\/production\/daily-production-schedules\/DPS%2F1"/);assert.match(html,/href="\/modules\/production\/daily-production-schedules\/DPS%3C2%3E"/);assert.match(html,/DPS 2/);assert.match(html,/PART&lt;script&gt;/);assert.equal((html.match(/href=/g)||[]).length,2);
  assert.doesNotMatch(api.jobIdentity(job()),/href=/);
});
test('machine filter is independent of job dates and keeps naturally sorted machine numbers',()=>{
  const list=[{id:'b',code:'P-10',windows:[]},{id:'a',code:'P-2',windows:[]},{id:'inspection',code:'Inspection',windows:[]}];
  const model=api.chartModel([],list,'2026-09-15');assert.deepEqual(model.machines.map(x=>x.code),['P-2','P-10','Inspection']);
  assert.equal(api.chartModel([],list,'2026-09-15','b').machines[0].code,'P-10');
});
test('machine master station numbers are displayed without replacing raw matching codes',()=>{
  const machines=api.machineLabels([{id:'m1',code:'MC-001',windows:[]}],[job({machineCode:'MC-001'})],[{id:'m1',machineCode:'MC-001',machineName:'Press 80T (P-1)'}]);
  assert.equal(machines[0].label,'P-1');assert.equal(machines[0].code,'MC-001');
  const html=api.chart(api.chartModel([job({machineCode:'MC-001'})],machines,'2026-09-15'));assert.match(html,/title="MC-001">P-1/);
});
test('NG carries forward with origin date until fully scheduled; future NG never leaks backwards',()=>{
  const source=[ng(),ng({id:'done',remainingQty:0}),ng({id:'future',sourceDate:'2026-09-16'}),ng({id:'bad',sourceDate:'2026-02-30'})];
  assert.deepEqual(api.outstanding(source,'2026-09-15').map(x=>[x.id,x.sourceDate,x.remainingQty]),[['ng-1','2026-09-02',7]]);
  assert.equal(api.outstanding(source,'2026-09-01').length,0);assert.equal(api.outstanding(source,'2026-09-15','S-1').length,0);
});
test('ADD_QTY requires same released process occurrence, machine and UOM, not just matching part',()=>{
  const source=job(),target=job({id:'target',date:'2026-09-16'}),jobs=[source,target,job({id:'other-route',date:'2026-09-16',sourceRowId:'route-2'}),job({id:'other-machine',date:'2026-09-16',machineKey:'m2'}),job({id:'other-uom',date:'2026-09-16',uomCode:'KG'})];
  assert.deepEqual(api.candidates(jobs,ng(),'2026-09-16').map(x=>x.id),['target']);
  const input={month:'2026-09',sourceNgId:'ng-1',quantity:'4',targetDate:'2026-09-16',mode:'ADD_QTY',targetJobId:'target'};
  assert.equal(api.validateForm(input,ng(),jobs,'2026-09-15').quantity,4);
  assert.throws(()=>api.validateForm({...input,targetJobId:'other-route'},ng(),jobs,'2026-09-15'),/proses, mesin, dan UOM/);
});
test('recovery validation rejects excess NG, earlier, backdated and other-month target dates',()=>{
  const input={month:'2026-09',quantity:5,targetDate:'2026-09-16',mode:'NEW_PLAN'};
  for(const value of [0,-1,8,NaN,''])assert.throws(()=>api.validateForm({...input,quantity:value},ng(),[job()],'2026-09-15'),/Qty/);
  for(const targetDate of ['2026-09-02','2026-09-14','2026-10-01','2026-09-31'])assert.throws(()=>api.validateForm({...input,targetDate},ng(),[job()],'2026-09-15'),/tanggal/);
});
test('material shortage remains explicit while unknown material quantities never display as zero',()=>{
  const html=api.previewHtml({canCommit:false,blockers:['Material belum cukup'],warnings:['PO <pending>'],capacity:{availableMinutes:100,occupiedMinutes:90,requiredMinutes:30,remainingMinutes:-20},materials:[{partCode:'MAT',requiredQty:5,availableQty:null,shortageQty:3,uomCode:'KG',status:'SHORTAGE'}]});
  assert.match(html,/Material belum cukup/);assert.match(html,/PO &lt;pending&gt;/);assert.match(html,/is-shortage">3/);assert.match(html,/class="is-numeric">—/);assert.match(html,/-20/);
});

const source=fs.readFileSync(path.join(__dirname,'../public/js/ppic-released-daily.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const nodes=new Map(),requests=[],timers=[],events={};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,dataset:{},classList:{toggle(){}},addEventListener(key,fn){this[key]=fn;},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return nodes.get(id);};
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-09-15T02:00:00Z']));}}
  const document={getElementById:node,visibilityState:'visible',addEventListener(key,fn){events[key]=fn;},dispatchEvent(event){events[event.type]?.(event);}},window={addEventListener(key,fn){events[key]=fn;}};
  vm.runInNewContext(source,{document,window,Intl,Date:FixedDate,URLSearchParams,AbortSignal:{timeout(){}},crypto:{randomUUID:()=>String(requests.length)+'-request'},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),setInterval:fn=>timers.push(fn)});
  const mounted=window.PpicReleasedDaily.mount(document);
  const respond=async(index,data,status=200)=>{requests[index].resolve({ok:status<400,status,json:async()=>data});await tick();};
  return {node,requests,timers,events,mounted,respond};
}
const release=()=>({status:'LOCKED',month:'2026-09',views:{daily:[job()]}});
const daily=()=>({status:'LOCKED',month:'2026-09',date:'2026-09-15',jobs:[job(),job({id:'tomorrow',date:'2026-09-16'})],machines:[{id:'m1',code:'P-1',windows:[]}],summary:{byUom:[{uomCode:'PCS',goodQty:50,ngQty:10},{uomCode:'KG',goodQty:2,ngQty:0}],downtimeMinutes:15,unlinkedCount:2},actualRows:[{id:'log',date:'2026-09-15',partCode:'PART',machineCode:'P-1',goodQty:50,ngQty:10,uomCode:'PCS',downtimeMinutes:15,status:'LINKED',sourceNumber:'LOG-1',sourceHref:'/modules/production/logs/LOG-1'},{id:'unknown',date:'2026-09-15',partCode:'UNKNOWN',machineCode:'P-1',goodQty:null,ngQty:3,uomCode:'PCS',status:'UNLINKED',sourceNumber:'unsafe',sourceHref:'javascript:alert(1)'}],outstandingNg:[ng()],recoveries:[]});
test('mount only reads active released month, renders per-UOM real actual and origin NG, and polls without reload',async()=>{
  const f=fixture();f.mounted.update({active:false,month:'2026-09',payload:release()});assert.equal(f.requests.length,0);
  f.mounted.update({active:true,month:'2026-09',payload:release()});assert.match(f.requests[0].url,/released-daily\?month=2026-09&date=2026-09-15/);
  await f.respond(0,daily());assert.match(f.node('rd-summary').innerHTML,/PCS/);assert.match(f.node('rd-summary').innerHTML,/KG/);assert.doesNotMatch(f.node('rd-summary').innerHTML,/>52</);
  assert.match(f.node('rd-actual-body').innerHTML,/Belum terhubung/);assert.match(f.node('rd-actual-body').innerHTML,/class="is-numeric">—/);assert.doesNotMatch(f.node('rd-actual-body').innerHTML,/javascript:/);
  assert.match(f.node('rd-ng-body').innerHTML,/2026-09-02/);assert.match(f.node('rd-ng-body').innerHTML,/Dari hari sebelumnya/);
  f.timers[0]();f.events.focus();assert.equal(f.requests.length,2);await f.respond(1,daily());assert.equal(f.requests[1].options.cache,'no-store');
});
test('stale actual responses cannot replace another selected date or month; draft has no recovery read',async()=>{
  const f=fixture(),payload=release();f.mounted.update({active:true,month:'2026-09',payload});
  f.node('rd-date').value='2026-09-16';f.node('rd-date').change();
  await f.respond(1,{...daily(),date:'2026-09-16',actualRows:[{date:'2026-09-16',partCode:'CURRENT'}]});
  await f.respond(0,daily());assert.match(f.node('rd-actual-body').innerHTML,/CURRENT/);assert.doesNotMatch(f.node('rd-actual-body').innerHTML,/UNKNOWN/);
  f.mounted.update({active:true,month:'2026-10',payload:{status:'DRAFT'}});assert.equal(f.requests.length,2);assert.match(f.node('rd-message').textContent,/belum dirilis/);assert.equal(f.node('rd-ng-body').innerHTML,'');
});
test('source read failures clear actual and recovery actions while preserving frozen Gantt',async()=>{
  const f=fixture();f.mounted.update({active:true,month:'2026-09',payload:release()});await f.respond(0,{...daily(),jobs:[job(),job({id:'recovered',partCode:'CONFIRMED-RECOVERY',isRecovery:true})]});
  f.mounted.refresh();await f.respond(1,{message:'Source unavailable'},503);assert.match(f.node('rd-message').textContent,/Source unavailable/);assert.doesNotMatch(f.node('rd-ng-body').innerHTML,/data-rd-recover/);assert.match(f.node('rd-chart').innerHTML,/PART/);assert.match(f.node('rd-chart').innerHTML,/CONFIRMED-RECOVERY/);
});
test('a mismatched release id and invalid month cannot expose recovery actions',async()=>{
  const f=fixture();f.mounted.update({active:true,month:'2026-09',payload:{...release(),id:'current-release'}});await f.respond(0,{...daily(),releaseId:'other-release'});
  assert.match(f.node('rd-message').textContent,/versi, bulan, dan tanggal release/);assert.doesNotMatch(f.node('rd-ng-body').innerHTML,/data-rd-recover/);
  assert.doesNotThrow(()=>f.mounted.update({active:true,month:'invalid',payload:release()}));assert.equal(f.requests.length,1);
});
test('recovery requires validated preview; edits invalidate it; uncertain commit retries exact idempotent payload',async()=>{
  const f=fixture();f.mounted.update({active:true,month:'2026-09',payload:release()});await f.respond(0,daily());
  f.node('rd-ng-body').click({target:{closest:()=>({dataset:{rdRecover:'0'}})}});assert.equal(f.node('rd-dialog').open,true);assert.equal(f.node('rd-commit').disabled,true);
  assert.equal(f.node('rd-target-date').value,'2026-09-16');f.node('rd-form').submit({preventDefault(){}});assert.match(f.requests[1].url,/recovery-preview$/);
  await f.respond(1,{previewHash:'proof',canCommit:true,blockers:[],warnings:[],materials:[],capacity:{},job:job()});assert.equal(f.node('rd-commit').disabled,false);
  f.node('rd-quantity').value='4';f.node('rd-quantity').input();assert.equal(f.node('rd-commit').disabled,true);
  f.node('rd-form').submit({preventDefault(){}});await f.respond(2,{previewHash:'proof-2',canCommit:true,materials:[],capacity:{}});
  f.node('rd-commit').click();assert.equal(f.requests[3].options.method,'POST');const sent=JSON.parse(f.requests[3].options.body);assert.equal(sent.previewHash,'proof-2');assert.equal(sent.quantity,4);
  f.requests[3].reject(Error('Connection lost'));await tick();assert.equal(f.node('rd-mode').disabled,true);assert.match(f.node('rd-error').textContent,/belum terkonfirmasi/);
  f.node('rd-commit').click();assert.equal(f.requests[4].options.body,f.requests[3].options.body);await f.respond(4,{id:'recovery-1'});assert.equal(f.node('rd-dialog').open,false);assert.match(f.requests[5].url,/date=2026-09-16/);
  await f.respond(5,{...daily(),date:'2026-09-16'});
});
test('material blocker prevents commit and rejected stale preview requires a fresh review',async()=>{
  const f=fixture();f.mounted.update({active:true,month:'2026-09',payload:release()});await f.respond(0,daily());f.node('rd-ng-body').click({target:{closest:()=>({dataset:{rdRecover:'0'}})}});
  f.node('rd-form').submit({preventDefault(){}});await f.respond(1,{previewHash:'blocked',canCommit:false,blockers:['Material kurang'],materials:[],capacity:{}});assert.equal(f.node('rd-commit').disabled,true);f.node('rd-commit').click();assert.equal(f.requests.length,2);
  f.node('rd-form').submit({preventDefault(){}});await f.respond(2,{previewHash:'old',canCommit:true,materials:[],capacity:{}});f.node('rd-commit').click();await f.respond(3,{message:'Sumber berubah'},409);
  assert.equal(f.node('rd-commit').disabled,true);assert.match(f.node('rd-error').textContent,/Periksa kembali/);
});
test('partial contains accessible compact Gantt, real actual and recovery forms without another plan table',async()=>{
  const html=await ejs.renderFile(path.join(__dirname,'../views/ppic/partials/released-daily.ejs'),{});
  assert.match(html,/id="rd-chart"[^>]+role="region"/);assert.match(html,/Tanggal asal NG/);assert.match(html,/Downtime \(menit\)/);assert.match(html,/aria-labelledby="rd-dialog-title"/);assert.match(html,/value="ADD_QTY"/);assert.doesNotMatch(html,/draggable/);
});
