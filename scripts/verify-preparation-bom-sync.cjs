'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../public/js/ppic-preparation-bom-sync');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const revision=fingerprint=>({bomRevision:{fingerprint}});
function fixture(options={}){
  const nodes=new Map(),handlers={},windowHandlers={};let current={signature:'workbook-1',snapshot:revision('bom-1'),busy:false,loading:false},time=100000;
  const doc={visibilityState:'visible',getElementById:id=>nodes.get(id)||null,addEventListener(type,handler){handlers[type]=handler;},defaultView:{addEventListener(type,handler){windowHandlers[type]=handler;}}};
  for(const id of ['prep-bom-check','prep-bom-apply','prep-bom-status','prep-bom-warnings','prep-bom-warning-text']){
    const classes=new Set();nodes.set(id,{disabled:false,hidden:false,textContent:'',handlers:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},addEventListener(type,handler){this.handlers[type]=handler;},click(){if(!this.disabled)return this.handlers.click?.();}});
  }
  const calls={check:0,apply:0};
  const mounted=api.mount(doc,{getState:()=>current,check:async()=>{calls.check++;return options.check?options.check():revision('bom-2');},apply:async()=>{calls.apply++;return options.apply?.();},now:()=>time});
  return {mounted,doc,calls,check:nodes.get('prep-bom-check'),apply:nodes.get('prep-bom-apply'),status:nodes.get('prep-bom-status'),warningPanel:nodes.get('prep-bom-warnings'),warningText:nodes.get('prep-bom-warning-text'),get state(){return current;},setState(change){current={...current,...change};mounted.update();},advance(ms){time+=ms;},focus(){windowHandlers.focus?.();},visibility(value){doc.visibilityState=value;handlers.visibilitychange?.();}};
}
test('mount skips absent controls and initializes check readiness without applying or requesting',()=>{
  assert.equal(api.mount({getElementById:()=>null},{getState:()=>({})}),null);
  const f=fixture();assert.equal(f.check.disabled,false);assert.equal(f.apply.hidden,true);assert.equal(f.calls.check,0);assert.equal(f.calls.apply,0);
  assert.match(f.status.textContent,/klik Cek perubahan BOM/);
});
test('missing snapshot, loading and busy states disable both actions',async()=>{
  for(const state of [{snapshot:null},{snapshot:{}},{loading:true},{busy:true}]){
    const f=fixture();f.setState(state);assert.equal(f.check.disabled,true);assert.equal(f.apply.disabled,true);
    await f.mounted.inspect();assert.equal(f.calls.check,0);assert.match(f.status.textContent,/Tunggu hasil BOM/);
  }
});
test('locked month hides pending BOM changes and cannot check or apply, including after focus',async()=>{
  const f=fixture();await f.check.click();assert.equal(f.apply.hidden,false);
  f.setState({locked:true});assert.equal(f.check.disabled,true);assert.equal(f.apply.hidden,true);
  await f.apply.click();f.advance(15000);f.focus();await tick();
  assert.equal(f.calls.check,1);assert.equal(f.calls.apply,0);assert.match(f.status.textContent,/sudah lock/);
});
test('changed master only exposes apply button and does not auto-apply or mutate workbook state',async()=>{
  const f=fixture(),before=structuredClone(f.state);await f.mounted.inspect();
  assert.equal(f.calls.check,1);assert.equal(f.calls.apply,0);assert.equal(f.apply.hidden,false);assert.equal(f.apply.disabled,false);
  assert.equal(f.status.classList.contains('has-update'),true);assert.match(f.status.textContent,/Ada perubahan BOM/);
  assert.deepEqual(f.state,before);
});
test('unchanged BOM hides update prompt without applying',async()=>{
  const f=fixture({check:()=>revision('bom-1')});await f.mounted.inspect();
  assert.equal(f.apply.hidden,true);assert.equal(f.status.classList.contains('has-update'),false);assert.equal(f.calls.apply,0);
  assert.match(f.status.textContent,/sesuai master terbaru/);
});
test('inspection errors and missing revision clear obsolete pending updates and remain retryable',async()=>{
  let result=revision('bom-2');const f=fixture({check:()=>{if(result instanceof Error)throw result;return result;}});
  for(const bad of [Error('connection unavailable'),{},revision('')]){
    result=revision('bom-2');await f.mounted.inspect();assert.equal(f.apply.hidden,false);
    result=bad;await f.mounted.inspect();assert.equal(f.apply.hidden,true);assert.equal(f.check.disabled,false);
    assert.match(f.status.textContent,/Pemeriksaan BOM gagal/);assert.equal(f.calls.apply,0);
  }
});
test('only one concurrent check runs and its loading status disables both buttons',async()=>{
  const wait=deferred(),f=fixture({check:()=>wait.promise});const task=f.mounted.inspect();await f.mounted.inspect();
  assert.equal(f.calls.check,1);assert.equal(f.check.disabled,true);assert.equal(f.apply.disabled,true);assert.match(f.status.textContent,/Memeriksa perubahan BOM/);
  wait.resolve(revision('bom-2'));await task;assert.equal(f.check.disabled,false);assert.equal(f.apply.hidden,false);
});
test('responses for a previous workbook signature or BOM fingerprint are ignored',async()=>{
  for(const state of [{signature:'new-workbook'},{snapshot:revision('new-bom')}]){
    const wait=deferred(),f=fixture({check:()=>wait.promise}),task=f.mounted.inspect();f.setState(state);
    wait.resolve(revision('stale-bom'));await task;
    assert.equal(f.apply.hidden,true);assert.equal(f.status.classList.contains('has-update'),false);assert.doesNotMatch(f.status.textContent,/Ada perubahan BOM/);
  }
});
test('errors from stale requests do not overwrite current workbook messages',async()=>{
  const wait=deferred(),f=fixture({check:()=>wait.promise}),task=f.mounted.inspect();f.setState({signature:'new-workbook'});
  wait.reject(Error('old error'));await task;assert.doesNotMatch(f.status.textContent,/old error|gagal/);assert.equal(f.apply.hidden,true);
});
test('changing workbook parameters clears previous pending BOM revision',async()=>{
  const f=fixture();await f.mounted.inspect();assert.equal(f.apply.hidden,false);
  f.setState({signature:'edited-workbook'});assert.equal(f.apply.hidden,true);assert.equal(f.status.classList.contains('has-update'),false);
  await f.apply.click();assert.equal(f.calls.apply,0);
});
test('explicit apply uses callback once, locks controls and clears pending update after success',async()=>{
  const wait=deferred(),f=fixture({apply:()=>wait.promise});await f.mounted.inspect();const task=f.apply.click();
  assert.equal(f.calls.apply,1);assert.equal(f.apply.disabled,true);assert.equal(f.check.disabled,true);assert.match(f.status.textContent,/Mengambil BOM terbaru/);
  f.apply.click();await f.mounted.inspect();assert.equal(f.calls.apply,1);assert.equal(f.calls.check,1);
  wait.resolve();await task;assert.equal(f.apply.hidden,true);assert.equal(f.check.disabled,false);assert.match(f.status.textContent,/BOM terbaru dimuat/);
});
test('failed apply retains pending changes and supports retry without rechecking',async()=>{
  let failure=true;const f=fixture({apply:()=>{if(failure)throw Error('network fail');}});await f.mounted.inspect();await f.apply.click();
  assert.equal(f.apply.hidden,false);assert.equal(f.apply.disabled,false);assert.match(f.status.textContent,/BOM belum dapat diperbarui: network fail/);
  failure=false;await f.apply.click();assert.equal(f.apply.hidden,true);assert.equal(f.calls.apply,2);assert.equal(f.calls.check,1);
});
test('late apply completion cannot claim an update for a different workbook',async()=>{
  for(const failed of [false,true]){
    const wait=deferred(),f=fixture({apply:()=>wait.promise});await f.mounted.inspect();const task=f.apply.click();
    f.setState({signature:'different-workbook',snapshot:revision('different-bom')});
    if(failed)wait.reject(Error('old apply failure'));else wait.resolve();
    await task;
    assert.doesNotMatch(f.status.textContent,/BOM terbaru dimuat|old apply failure/);
    assert.equal(f.apply.hidden,true);assert.equal(f.check.disabled,false);
  }
});
test('returning focus or visibility checks automatically with throttle, never automatically applies',async()=>{
  const f=fixture();f.focus();await tick();assert.equal(f.calls.check,1);assert.equal(f.calls.apply,0);
  f.focus();f.visibility('visible');await tick();assert.equal(f.calls.check,1);
  f.advance(10001);f.visibility('hidden');await tick();assert.equal(f.calls.check,1);
  f.visibility('visible');await tick();assert.equal(f.calls.check,2);assert.equal(f.calls.apply,0);
  await f.mounted.inspect();assert.equal(f.calls.check,3,'Explicit check bypasses focus throttle');
});
test('check warnings come from latest master inspection, not the old workbook snapshot',async()=>{
  const f=fixture({check:()=>({...revision('bom-2'),warnings:['New BOM missing child','<img src=x>']})});
  f.setState({snapshot:{...revision('bom-1'),warnings:['Old allocation message']}});
  assert.equal(f.warningPanel.hidden,true);await f.mounted.inspect();
  assert.equal(f.warningPanel.hidden,false);assert.equal(f.warningText.textContent,'New BOM missing child\n<img src=x>');
  assert.doesNotMatch(f.warningText.textContent,/Old allocation/);assert.equal(f.warningText.innerHTML,undefined);
  assert.match(f.status.textContent,/Ada perubahan BOM.*2 catatan pemeriksaan BOM/);assert.equal(f.apply.hidden,false);
});
test('unchanged but invalid BOM uses attention wording and never claims readiness',async()=>{
  const f=fixture({check:()=>({...revision('bom-1'),warnings:['Cycle BOM detected']})});await f.mounted.inspect();
  assert.equal(f.apply.hidden,true);assert.equal(f.warningPanel.hidden,false);assert.equal(f.warningText.textContent,'Cycle BOM detected');
  assert.match(f.status.textContent,/Versi BOM belum berubah, tetapi sumbernya perlu ditinjau/);
  assert.doesNotMatch(f.status.textContent,/sudah sesuai master terbaru/);
});
test('latest clean check, failed check or workbook switch clear obsolete warning details',async()=>{
  let current={...revision('bom-1'),warnings:['Old warning']};const f=fixture({check:()=>{if(current instanceof Error)throw current;return current;}});
  for(const transition of ['clean','error','workbook']){
    current={...revision('bom-1'),warnings:['Old warning']};await f.mounted.inspect();assert.equal(f.warningPanel.hidden,false);
    if(transition==='workbook')f.setState({signature:'other-workbook'});else{current=transition==='error'?Error('failed check'):revision('bom-1');await f.mounted.inspect();}
    assert.equal(f.warningPanel.hidden,true);assert.equal(f.warningText.textContent,'');
  }
});
test('late warning result from a different source does not populate the current workbook panel',async()=>{
  const wait=deferred(),f=fixture({check:()=>wait.promise}),task=f.mounted.inspect();
  f.setState({signature:'new-workbook'});wait.resolve({...revision('old-result'),warnings:['Stale warning']});await task;
  assert.equal(f.warningPanel.hidden,true);assert.equal(f.warningText.textContent,'');assert.doesNotMatch(f.status.textContent,/Stale warning|catatan pemeriksaan/);
});
