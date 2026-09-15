const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../public/js/ppic-preparation-additional-po'),T=require('../public/js/ppic-preparation-tree');
test('workbook hides E/F relations; summary headers follow M/M+1 across year boundaries',()=>{
 const cols=T.columns('2026-12');assert.ok(!cols.some(c=>['productionFlow','dependsOn'].includes(c.field)));assert.match(cols.find(c=>c.field==='poQty').title,/Des/);assert.match(cols.find(c=>c.field==='forecastQty').title,/Jan/);assert.ok(cols.findIndex(c=>c.field==='additionalPoQty')<cols.findIndex(c=>c.field==='currentStock'));
});
test('revision overlay preserves release and adds hatched children only for new production',()=>{
 const w={month:'2026-09',delivery:[{id:'fg',days:{'2026-09-20':10}}]},s={rows:[{id:'fg',children:[{id:'original',days:{'2026-09-19':10}}],demandCoverage:{'2026-09-25':{status:'READY'}},demandContext:{buffer:{quantity:20,days:{'2026-09-30':20}}}}]};
 const before=JSON.stringify([w,s]),ctx={groups:{},revisions:[{rowId:'fg',mode:'BUFFER',quantity:5,deliveryDate:'2026-09-25'},{rowId:'fg',mode:'PRODUCTION',quantity:7,deliveryDate:'2026-09-26',revision:2,snapshot:{rows:[{children:[{id:'extra',days:{'2026-09-24':7}}]}]}}]};
 const r=A.merge(w,s,ctx);assert.equal(JSON.stringify([w,s]),before);assert.equal(r.workbook.delivery[0].days['2026-09-25'],5);assert.equal(r.snapshot.rows[0].demandContext.buffer.quantity,15);assert.equal(r.snapshot.rows[0].children[0].additionalAllocation,undefined);assert.equal(r.snapshot.rows[0].children[1].additionalAllocation,true);assert.equal(r.snapshot.rows[0].demandCoverage['2026-09-25'].status,'SHORTAGE');assert.deepEqual(A.merge(w,s,ctx),r);
});
test('capacity merge adds loads without doubling available machine hours',()=>{const base={capacity:{rows:[{machineKey:'M1',date:'2026-09-25',availableHours:8,loadHours:3}],machineChildren:[]}},extra={capacity:{rows:[{machineKey:'M1',date:'2026-09-25',availableHours:8,loadHours:2}],machineChildren:[]}};A.mergeDerived(base,extra);assert.equal(base.capacity.rows[0].loadHours,5);assert.equal(base.capacity.rows[0].availableHours,8);assert.equal(base.capacity.rows[0].utilizationPct,62.5);});
