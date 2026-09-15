'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const edit=require('../public/js/ppic-preparation-capacity-edit');
const date='2026-09-02';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

function fixture(commit=async()=>{},previewMachine){
  const nodes=new Map(),doc={activeElement:null,getElementById:id=>nodes.get(id)||null};
  function create(id){
    const node={id,value:'',textContent:'',checked:false,hidden:false,disabled:false,open:false,isConnected:true,handlers:{},
      addEventListener(type,handler){(this.handlers[type]||=[]).push(handler);},
      fire(type,event={}){let prevented=false;const payload={target:this,preventDefault(){prevented=true;},...event};const results=(this.handlers[type]||[]).map(handler=>handler(payload));return {prevented,results};},
      focus(){doc.activeElement=this;},select(){},showModal(){this.open=true;},close(){this.open=false;this.fire('close');}};
    nodes.set(id,node);return node;
  }
  create('prep-capacity-dialog');
  for(const key of ['cancel','close','quantity','coil','dies','preview','dayStatus','overtimeShift1','overtimeShift2','overtimeHoursShift1','overtimeHoursShift2','overlap','day-info','machine-summary','apply','reset','error','form','title','context','machine','child','shift1-info','shift2-info','ct','available','used','additional','remaining'])create('prep-capacity-edit-'+key);
  const opener=create('opener');opener.focus();
  return {mounted:edit.mount(doc,commit,previewMachine),node:key=>nodes.get('prep-capacity-edit-'+key),dialog:nodes.get('prep-capacity-dialog'),opener,doc};
}
const machine=overrides=>({machineId:'m1',machineCode:'M-001',date,availableHours:12.6,loadHours:650/60,defaultIsHoliday:false,shifts:[{sequence:1,startTime:'08:00',endTime:'17:00',breakMinutes:60,overtimeMinutes:0},{sequence:2,startTime:'17:00',endTime:'01:00',breakMinutes:60,overtimeMinutes:0}],options:{},...overrides});
const child=overrides=>({sourceRowId:'child',machineCode:'M-001',partCode:'C003-0010-030',partNumber:'22632-GB2-3000',processCode:'PRG',uomCode:'PCS',cycleTimeSeconds:1.5,grossWeightKg:.026,days:{[date]:{quantity:20000,coilChanges:3,dieChanges:1,setupSource:'AUTO'}},...overrides});
function openMachine(f,row=machine()){f.mounted.open({kind:'machine',id:row.machineId,date,row});return row;}
function openChild(f,row=child()){f.mounted.open({kind:'quantity',id:row.sourceRowId,date,row});return row;}
function metrics(f){return Object.fromEntries(['available','used','additional','remaining'].map(key=>[key,f.node(key).textContent]));}

test('capacity popup gracefully skips pages without its dialog',()=>assert.equal(edit.mount({getElementById:()=>null},()=>{}),null));
test('qty popup renders production, coil and dies as a numeric-only minute formula',()=>{
  const f=fixture();openChild(f);
  assert.equal(f.dialog.open,true);assert.equal(f.doc.activeElement,f.node('quantity'));
  assert.equal(f.node('preview').textContent,'500 menit + 90 menit + 60 menit = 650 menit');
  assert.doesNotMatch(f.node('preview').textContent,/Beban|produksi|pergantian|jam/);
  assert.match(f.node('context').textContent,/M-001.*2026-09-02.*C003-0010-030.*22632-GB2-3000.*PRG/);
});
test('qty input keeps automatic coil and die counts and refreshes the numeric formula',()=>{
  const f=fixture();openChild(f);
  f.node('quantity').value='100.000';f.node('quantity').fire('input');
  assert.equal(Number(f.node('coil').value),13);assert.equal(Number(f.node('dies').value),1);
  assert.equal(f.node('preview').textContent,'2.500 menit + 390 menit + 60 menit = 2.950 menit');
  f.node('quantity').value='0';f.node('quantity').fire('input');
  assert.equal(Number(f.node('coil').value),0);assert.equal(Number(f.node('dies').value),0);
  assert.equal(f.node('preview').textContent,'0 menit + 0 menit + 0 menit = 0 menit');
});
test('manual setup edits remain authoritative when quantity changes',()=>{
  const f=fixture();openChild(f);
  f.node('coil').value='4';f.node('coil').fire('input');f.node('dies').value='2';f.node('dies').fire('input');
  f.node('quantity').value='10.000';f.node('quantity').fire('input');
  assert.equal(Number(f.node('coil').value),4);assert.equal(Number(f.node('dies').value),2);
  assert.equal(f.node('preview').textContent,'250 menit + 120 menit + 120 menit = 490 menit');
});

test('downstream qty edits keep automatic coil at zero and explain that GW is not required',()=>{
  for(const grossWeightKg of [null,9]){
    const f=fixture();openChild(f,child({coilSetupApplicable:false,grossWeightKg,days:{[date]:{quantity:20000,coilChanges:0,dieChanges:1,setupSource:'AUTO'}}}));
    assert.match(f.node('ct').textContent,/GW tidak diperlukan/);
    f.node('quantity').value='10.000';f.node('quantity').fire('input');
    assert.equal(Number(f.node('coil').value),0);assert.equal(Number(f.node('dies').value),1);
    assert.equal(f.node('preview').textContent,'250 menit + 0 menit + 60 menit = 310 menit');
    f.node('coil').value='2';f.node('coil').fire('input');
    f.node('quantity').value='20.000';f.node('quantity').fire('input');
    assert.equal(Number(f.node('coil').value),2,'explicit PPIC setup correction is preserved');
  }
});

test('first RAW process still shows missing GW and valid GW in the popup',()=>{
  const f=fixture();openChild(f,child({coilSetupApplicable:true,grossWeightKg:null}));
  assert.match(f.node('ct').textContent,/GW material RAW belum tersedia/);
  openChild(f,child({coilSetupApplicable:true}));assert.match(f.node('ct').textContent,/0,026 kg\/unit/);
});
test('numeric formulas use Indonesian separators and at most three decimal digits',()=>{
  const f=fixture();openChild(f,child({cycleTimeSeconds:1,days:{[date]:{quantity:1,coilChanges:0,dieChanges:0,setupSource:'WORKBOOK'}}}));
  assert.equal(f.node('preview').textContent,'0,017 menit + 0 menit + 0 menit = 0,017 menit');
});
test('unknown or invalid qty calculation never presents a valid-looking zero',()=>{
  const f=fixture();openChild(f,child({cycleTimeSeconds:null}));
  assert.match(f.node('preview').textContent,/— menit/);
  assert.doesNotMatch(f.node('preview').textContent,/CT|valid|Beban|NaN|Infinity/);
  openChild(f);f.node('quantity').value='=20+1';f.node('quantity').fire('input');
  assert.match(f.node('preview').textContent,/— menit/);
  assert.doesNotMatch(f.node('preview').textContent,/Masukkan|Format|NaN|Infinity/);
});
test('machine popup shows available, used, added and remaining minutes on opening',()=>{
  const f=fixture();openMachine(f);
  assert.equal(f.doc.activeElement,f.node('dayStatus'));
  assert.deepEqual(metrics(f),{available:'756 menit',used:'650 menit',additional:'0 menit',remaining:'106 menit'});
});
test('machine minute values retain precision and expose overload as negative remaining',()=>{
  const f=fixture();openMachine(f,machine({availableHours:1/7,loadHours:1/3}));
  assert.deepEqual(metrics(f),{available:'8,571 menit',used:'20 menit',additional:'0 menit',remaining:'-11,429 menit'});
});
test('unknown master availability or machine load is not silently converted to zero',()=>{
  const f=fixture();openMachine(f,machine({availableHours:null,loadHours:null}));
  assert.equal(f.node('available').textContent,'— menit');assert.equal(f.node('used').textContent,'— menit');assert.equal(f.node('remaining').textContent,'— menit');
});
test('selecting a holiday immediately previews zero available minutes without applying draft edits',()=>{
  const commits=[],f=fixture(async change=>commits.push(change)),row=machine(),before=structuredClone(row);openMachine(f,row);
  f.node('dayStatus').value='HOLIDAY';f.node('dayStatus').fire('change');
  assert.deepEqual(metrics(f),{available:'0 menit',used:'650 menit',additional:'-756 menit',remaining:'-650 menit'});
  assert.equal(f.node('overtimeShift1').disabled,true);assert.equal(f.node('overlap').disabled,true);
  f.node('cancel').fire('click');assert.equal(f.dialog.open,false);assert.equal(f.doc.activeElement,f.opener);
  assert.deepEqual(commits,[]);assert.deepEqual(row,before);
});
test('machine controls debounce proposed capacity and render the available increment without committing',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const commits=[],calls=[],pending=deferred(),f=fixture(async change=>commits.push(change),change=>{calls.push(change);return pending.promise;});
  const row=machine(),before=structuredClone(row);openMachine(f,row);
  assert.equal(calls.length,0,'opening already-calculated capacity requires no preview request');
  f.node('overtimeShift1').checked=true;f.node('overtimeShift1').fire('change');
  f.node('overtimeHoursShift1').value='1';f.node('overtimeHoursShift1').fire('input');
  t.mock.timers.tick(100);
  f.node('overtimeHoursShift1').value='2';f.node('overtimeHoursShift1').fire('input');
  t.mock.timers.tick(249);assert.equal(calls.length,0);
  t.mock.timers.tick(1);assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{kind:'machine',id:'m1',date,dayStatus:'MASTER',overtimeShift1:true,overtimeShift2:false,overlap:false,overtimeHoursShift1:'2',overtimeHoursShift2:'0'});
  assert.deepEqual(metrics(f),{available:'— menit',used:'650 menit',additional:'— menit',remaining:'— menit'});
  pending.resolve({availableHours:14.4,loadHours:0});await flush();
  assert.deepEqual(metrics(f),{available:'864 menit',used:'650 menit',additional:'108 menit',remaining:'214 menit'});
  assert.deepEqual(row,before);assert.deepEqual(commits,[]);
});
test('an older async capacity response cannot replace a newer proposed machine setting',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const first=deferred(),second=deferred(),calls=[],f=fixture(undefined,change=>{calls.push(change);return calls.length===1?first.promise:second.promise;});openMachine(f);
  f.node('overlap').checked=true;f.node('overlap').fire('change');t.mock.timers.tick(250);
  f.node('overtimeShift2').checked=true;f.node('overtimeHoursShift2').value='1';f.node('overtimeShift2').fire('change');t.mock.timers.tick(250);
  second.resolve({availableHours:15});await flush();assert.equal(f.node('available').textContent,'900 menit');
  first.resolve({availableHours:13});await flush();assert.equal(f.node('available').textContent,'900 menit');
});
test('reopening a different machine invalidates the previous capacity preview',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=deferred(),f=fixture(undefined,()=>pending.promise);openMachine(f);
  f.node('overlap').checked=true;f.node('overlap').fire('change');t.mock.timers.tick(250);
  openMachine(f,machine({machineId:'m2',machineCode:'M-002',availableHours:7,loadHours:3}));
  pending.resolve({availableHours:20});await flush();
  assert.deepEqual(metrics(f),{available:'420 menit',used:'180 menit',additional:'0 menit',remaining:'240 menit'});
});
test('canceling a popup invalidates pending preview responses and commits nothing',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=deferred(),commits=[],f=fixture(async change=>commits.push(change),()=>pending.promise);openMachine(f);
  f.node('overlap').checked=true;f.node('overlap').fire('change');t.mock.timers.tick(250);
  f.node('cancel').fire('click');const before=metrics(f);
  pending.resolve({availableHours:20});await flush();
  assert.equal(f.dialog.open,false);assert.deepEqual(metrics(f),before);assert.deepEqual(commits,[]);
});
test('a holiday change cancels a pending preview and cannot regain capacity from its stale response',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=deferred(),f=fixture(undefined,()=>pending.promise);openMachine(f);
  f.node('overlap').checked=true;f.node('overlap').fire('change');t.mock.timers.tick(250);
  f.node('dayStatus').value='HOLIDAY';f.node('dayStatus').fire('change');
  pending.resolve({availableHours:15});await flush();
  assert.deepEqual(metrics(f),{available:'0 menit',used:'650 menit',additional:'-756 menit',remaining:'-650 menit'});
});
test('preview errors retain known load but show unknown capacity, increment and remaining',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(undefined,async()=>{throw Error('Master tidak tersedia');});openMachine(f);
  f.node('overlap').checked=true;f.node('overlap').fire('change');t.mock.timers.tick(250);await flush();
  assert.deepEqual(metrics(f),{available:'— menit',used:'650 menit',additional:'— menit',remaining:'— menit'});
  assert.equal(f.node('machine-summary').title,'Master tidak tersedia');
});
test('restoring opening controls restores opening capacity and cancels unsent previews',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const calls=[],f=fixture(undefined,async change=>{calls.push(change);return {availableHours:15};});openMachine(f);
  f.node('overlap').checked=true;f.node('overlap').fire('change');
  f.node('overlap').checked=false;f.node('overlap').fire('change');t.mock.timers.tick(250);await flush();
  assert.deepEqual(metrics(f),{available:'756 menit',used:'650 menit',additional:'0 menit',remaining:'106 menit'});assert.equal(calls.length,0);
});
