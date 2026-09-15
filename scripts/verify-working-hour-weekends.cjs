const {test}=require('node:test'),assert=require('node:assert/strict');
const master=require('../public/js/working-hour-profile-model');
const edit=require('../public/js/ppic-preparation-capacity-edit');
const matrix=require('../public/js/ppic-preparation-capacity-matrix');
test('default weekend holiday zeroes weekly totals while preserving templates for a working exception',()=>{
  const rules=[{shiftId:'s1',dayOfWeek:6,startTime:'08:00',endTime:'12:00',isEnabled:true}];
  const shifts=[{id:'s1',shiftCode:'SHIFT-1',sequence:1}];
  const off=master.normalizeSchedule(rules,shifts,{saturdayIsHoliday:true,sundayIsHoliday:true});
  assert.equal(off[5].totalMinutes,0);assert.equal(off[5].templateMinutes,240);assert.equal(off[5].isHoliday,true);
  assert.equal(master.buildRulesPayload(off).find(r=>r.dayOfWeek===6).isEnabled,true);
  const on=master.normalizeSchedule(rules,shifts,{saturdayIsHoliday:false});assert.equal(on[5].totalMinutes,240);
});
test('Lab can select holiday or working per date and reset without mutating the master template',()=>{
  const date='2026-09-05',row={machineId:'m',date,defaultIsHoliday:true,shifts:[{sequence:1}]},snapshot={derived:{capacity:{rows:[row]}}};
  const workbook={month:'2026-09'},before=JSON.stringify(snapshot);
  edit.apply(workbook,snapshot,{kind:'machine',id:'m',date,dayStatus:'WORKING'});
  assert.equal(workbook.machineDayOverrides.m[date].dayStatus,'WORKING');
  edit.apply(workbook,snapshot,{kind:'machine',id:'m',date,dayStatus:'HOLIDAY',overtimeShift2:true});
  assert.equal(workbook.machineDayOverrides.m[date].dayStatus,'HOLIDAY','closing is valid even without overtime templates');
  edit.apply(workbook,snapshot,{kind:'machine',id:'m',date,reset:true});assert.equal(workbook.machineDayOverrides.m[date],undefined);
  assert.equal(JSON.stringify(snapshot),before);
});
test('calendar identifies weekends and holidays while retaining visible manual work on closed dates',()=>{
  const head=matrix.head('2026-09');assert.match(head,/is-weekend" title="2026-09-05"[^]*?>Sab<\/small>/);assert.match(head,/is-weekend" title="2026-09-06"[^]*?>Min<\/small>/);
  const off=matrix.machineCell({isHoliday:true,availableHours:0,loadHours:0,utilizationPct:0},{id:'m',date:'2026-09-05',label:'M1'});
  assert.match(off,/is-holiday/);assert.match(off,/>LIBUR</);assert.doesNotMatch(off,/>0%</);assert.match(off,/data-capacity-edit="machine"/);
  const manual=matrix.machineCell({isHoliday:true,availableHours:0,loadHours:2},{id:'m',date:'2026-09-05',label:'M1'});
  assert.match(manual,/holiday-load/);assert.match(manual,/2 jam teralokasi/);
  const child=matrix.childCell({isHoliday:true,quantity:10,loadHours:2},'PCS');assert.match(child,/holiday-load/);assert.match(child,/>10 /);
});
