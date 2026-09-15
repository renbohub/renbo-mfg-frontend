'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/js/production-log-form.js'),'utf8');
const helpers=source.slice(source.indexOf('  function isWholeDayPpicSchedule('),source.indexOf('  function applySchedule('));
function fixture(initial='1A'){
  const nodes={shift:{value:initial,options:['','1','2','3','1A','1B','2A','2B','3A','3C'].map(value=>({value,hidden:false,disabled:false}))},'production-log-shift-label':{textContent:''},'production-log-shift-help':{hidden:true}};
  const context=vm.createContext({element:id=>nodes[id],value:id=>nodes[id]?.value||'',setValue:(id,value)=>nodes[id].value=value});
  vm.runInContext(helpers,context);return {nodes,apply:context.applyScheduleShift,whole:context.isWholeDayPpicSchedule};
}
const ppic={scheduleNumber:'DPS-PPIC-1',shift:'PPIC',demandSourceType:'PPIC_RELEASE',demandSourceNumber:'release-id'};
test('whole-day PPIC entry requires operator selection of one of six actual shifts',()=>{
  const f=fixture('1A');f.apply(ppic);assert.equal(f.nodes.shift.value,'');assert.equal(f.nodes['production-log-shift-label'].textContent,'Shift aktual *');assert.equal(f.nodes['production-log-shift-help'].hidden,false);
  assert.ok(f.nodes.shift.options.filter(o=>['1','2','3'].includes(o.value)).every(o=>o.hidden&&o.disabled));
  assert.ok(f.nodes.shift.options.filter(o=>['1A','1B','2A','2B','3A','3C'].includes(o.value)).every(o=>!o.hidden&&!o.disabled));
  assert.equal(ppic.shift,'PPIC','changing log shift never mutates release schedule');
});
test('editing retains valid actual shift and switching back to normal schedules preserves original shift behavior',()=>{
  const f=fixture('2B');f.apply(ppic,true);assert.equal(f.nodes.shift.value,'2B');
  f.apply({shift:'3C',demandSourceType:'DELIVERY_PHASE'});assert.equal(f.nodes.shift.value,'3C');assert.equal(f.nodes['production-log-shift-help'].hidden,true);assert.equal(f.nodes['production-log-shift-label'].textContent,'Shift *');assert.ok(f.nodes.shift.options.every(o=>!o.hidden&&!o.disabled));
  f.apply({shift:'2'});assert.equal(f.nodes.shift.value,'2');
});
test('PPIC exception requires explicit release source and does not apply to arbitrary text shifts',()=>{
  const f=fixture();assert.equal(f.whole({...ppic,demandSourceType:'MANUAL'}),false);assert.equal(f.whole({...ppic,demandSourceNumber:''}),false);assert.equal(f.whole({...ppic,shift:'1A'}),false);
  f.apply({...ppic,demandSourceType:'MANUAL'});assert.equal(f.nodes['production-log-shift-help'].hidden,true);
});
test('legacy valid actual shift aliases normalize on edit; a new daily selection clears previous shift',()=>{
  const f=fixture('2');f.apply(ppic,true);assert.equal(f.nodes.shift.value,'2A');f.apply(ppic);assert.equal(f.nodes.shift.value,'');
});
test('form exposes required labelled actual shift and validates it before collecting/submitting output',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../views/production/log-form.ejs'),'utf8');assert.match(html,/id="shift" required aria-describedby="production-log-shift-help"/);assert.match(html,/<option value="">Pilih shift aktual/);
  const submit=source.slice(source.indexOf('  form.addEventListener("submit"'));assert.ok(submit.indexOf('Pilih shift aktual produksi')<submit.indexOf('collectCoilPhases()'));assert.match(submit,/shift: value\("shift"\)/);
});
