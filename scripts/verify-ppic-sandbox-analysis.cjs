const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../../library/ppic-planning/engine.js');
const A=require('../public/js/ppic-sandbox-analysis.js');
const start=E.at('2026-09-01');
const node=(id,duration,deps=[],offset=0)=>({id,kind:id==='fg'?'fg':'process',machineId:'m',groupId:'g',dependencies:deps,planned:{start:start+offset,end:start+offset+duration,segments:duration?[[start+offset,start+offset+duration]]:[]}});
const base={month:'2026-09',resources:[],vendors:[]};
const result=rows=>({rows,groups:[{id:'g',partCode:'FG'}]});
test('month weeks clip at month end, including leap February, without losing or duplicating a day',()=>{
 for(const [month,days] of [['2026-09',30],['2028-02',29],['2026-02',28],['2026-12',31]]){
  const weeks=A.weeks(month,E);assert.equal(weeks.reduce((s,w)=>s+w.end-w.start,0),days*1440);
  for(let i=1;i<weeks.length;i++)assert.equal(weeks[i].start,weeks[i-1].end);
 }
});
test('weekly capacity excludes closures, merges existing reservations and uses actual process segments',()=>{
 const seed={...base,resources:[{id:'m',code:'M',windows:[[start,start+100],[start+7*1440,start+7*1440+100]],unavailable:[[start+40,start+50],[start+7*1440,start+7*1440+100]],reservations:[[start+10,start+30],[start+20,start+40]]}]};
 const input=result([node('p',50,[],50),node('fg',0,['p'],100)]),model=A.analyze(seed,input,E),r=model.resources[0];
 assert.equal(r.cells[0].capacity,90);assert.equal(r.cells[0].existing,30);assert.equal(r.cells[0].planned,50);
 assert.equal(r.cells[1].percent,null);assert.equal(r.percent,80/90*100);assert.deepEqual(r.cells[0].taskIds,['p']);
 assert.equal(r.cells.reduce((s,c)=>s+c.load,0),80);
});
test('overload is measured; missing vendor capacity stays unknown, never inferred from lead time',()=>{
 const seed={...base,resources:[{id:'m',code:'M',windows:[[start,start+100]]}],vendors:[{id:'v',vendorCode:'V'}]};
 const rows=[node('p',100),node('p2',50),{...node('v',200),kind:'vendor',vendorId:'v'},node('fg',0,['p','p2','v'],200)];
 const m=A.analyze(seed,result(rows),E);
 assert.equal(m.ranking[0].percent,150);assert.equal(m.ranking[0].over,50);
 assert.equal(m.resources.find(r=>r.type==='External').percent,null);assert.equal(m.ranking.some(c=>c.resource.type==='External'),false);
});
test('CPM identifies longest dependency branch; tied parallel branches both remain critical',()=>{
 const rows=[node('a',60),node('b',120),node('c',30,['a','b'],120),node('fg',0,['c'],150)];
 let path=A.analyze(base,result(rows),E).paths[0];assert.equal(path.length,150);assert.deepEqual(new Set(path.nodes.map(n=>n.id)),new Set(['b','c','fg']));
 rows[0]=node('a',120);path=A.analyze(base,result(rows),E).paths[0];assert.equal(path.nodes.length,4);
});
test('unscheduled nodes do not produce a falsely complete critical path',()=>{
 const rows=[{...node('a',60),planned:{segments:[]}},node('fg',0,['a'])];assert.equal(A.analyze(base,result(rows),E).paths[0].unresolved,true);
});
test('changed scenario recomputes load and paths without mutating source data',()=>{
 const seed={...base,resources:[{id:'m',code:'M',windows:[[start,start+100]]}]},initial=result([node('a',40),node('fg',0,['a'],40)]),before=JSON.stringify({seed,initial});
 const first=A.analyze(seed,initial,E),next=A.analyze(seed,result([node('a',80),node('fg',0,['a'],80)]),E);
 assert.equal(first.resources[0].percent,40);assert.equal(next.resources[0].percent,80);assert.equal(next.paths[0].length,80);assert.equal(JSON.stringify({seed,initial}),before);
});
