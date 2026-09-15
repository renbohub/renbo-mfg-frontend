'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const api=require('../public/js/ppic-preparation-outlook');
function snapshot(){return {month:'2026-09',rows:[{id:'a',customerCode:'C1',partCode:'FG-A',partNumber:'DRAW-A',partName:'Bracket',uomCode:'PCS',days:{'2026-09-01':100},demandCoverage:{'2026-09-01':{quantity:110,onTimeQty:100,shortageQty:10,status:'SHORTAGE',readyAt:'2026-09-02T06:00:00Z'}},deliveryLots:[{demandDate:'2026-09-01',quantity:110,producedQty:110}]},{id:'b',customerCode:'C2',partCode:'FG-B',uomCode:'KG',days:{'2026-09-01':5},demandCoverage:{'2026-09-01':{quantity:5,onTimeQty:5,shortageQty:0,status:'READY',stockOnly:true}}}],derived:{capacity:{rows:[{machineCode:'M1',date:'2026-09-01',loadHours:8,availableHours:10,status:'READY'},{machineCode:'M2',date:'2026-09-01',loadHours:4,availableHours:20,status:'READY'},{machineCode:'M3',date:'2026-09-01',loadHours:null,availableHours:null,status:'ATTENTION'}]},daily:{jobs:[{id:'job1'}],unscheduled:[]},purchase:{rows:[{status:'INCOMPLETE',needDate:'2026-09-01'},{status:'SKIPPED'}]},vendor:{rows:[{valid:true},{valid:false}]}}};}
test('delivery retains customer qty and exact system adjusted coverage without summing routing quantities',()=>{
  const source=snapshot(),before=structuredClone(source),rows=api.deliveryRows(source);
  assert.equal(rows.length,2);assert.equal(rows[0].customerQty,100);assert.equal(rows[0].quantity,110);assert.equal(rows[0].onTimeQty,100);assert.equal(rows[0].shortageQty,10);assert.equal(rows[0].status,'SHORTAGE');assert.equal(rows[0].lotCount,1);assert.equal(rows[1].readyAt,'Stok usable');assert.deepEqual(source,before);
});
test('KPI separates UOM, uses weighted hours, preserves missing values, and counts valid movements',()=>{
  const data=api.metrics(snapshot());
  assert.equal(data.units.length,2);assert.equal(data.units[0].coveragePct,100/110*100);assert.equal(data.units[1].coveragePct,100);
  assert.equal(data.loading.ratio,40);assert.equal(data.loading.known,2);assert.equal(data.loading.unknown,1);assert.equal(data.dailyJobs,1);assert.equal(data.unscheduled,0);assert.equal(data.purchaseRows,1);assert.equal(data.purchaseIncomplete,1);assert.equal(data.vendorValid,1);assert.equal(data.vendorRows,2);
});
test('unknown coverage and failed sources never look like verified zero requirements',()=>{
  const source=snapshot();delete source.rows[0].demandCoverage;source.derived.purchase={sourceError:true,rows:[]};delete source.derived.daily;source.derived.capacity={status:'ERROR',rows:[]};
  const data=api.metrics(source);assert.equal(data.delivery[0].status,'UNKNOWN');assert.equal(data.units[0].quantity,null);assert.equal(data.units[0].coveragePct,null);assert.equal(data.purchaseRows,null);assert.equal(data.dailyJobs,null);assert.equal(data.loading.ratio,null);assert.equal(data.loading.total,null);
  source.rows[0].uomCode='';source.rows[1].uomCode='';assert.equal(api.metrics(source).units.length,2,'unknown UOM never combined across source rows');
});
test('escaped identities and trusted-only status names cannot inject table markup',()=>{
  const source=snapshot();source.rows[0].partName='<img onerror="boom">';source.rows[0].demandCoverage['2026-09-01'].status='<script>';
  const html=api.tableRows(api.deliveryRows(source));assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/UNKNOWN/);
});
function fixture(){
  delete require.cache[require.resolve('../public/js/ppic-preparation-outlook')];const module=require('../public/js/ppic-preparation-outlook'),nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,attrs:{},handlers:{},addEventListener(k,h){this.handlers[k]=h;},setAttribute(k,v){this.attrs[k]=v;},click(){this.handlers.click?.();}});return nodes.get(id);};module.mount({getElementById:node});return {module,node};
}
test('both tabs update together, stay visible on lock, and clear stale results during recalculation and failures',()=>{
  const {module,node}=fixture(),source=snapshot(),state={month:'2026-09',name:'Sept',snapshot:source};
  module.update(state);assert.match(node('prep-delivery-body').innerHTML,/FG-A/);assert.match(node('prep-kpi-content').innerHTML,/40%/);
  const changed=structuredClone(source);changed.rows[0].days['2026-09-01']=40;changed.rows[0].demandCoverage['2026-09-01']={quantity:40,onTimeQty:40,shortageQty:0,status:'READY'};
  module.update({...state,snapshot:changed,dirty:true});assert.match(node('prep-delivery-status').textContent,/belum disimpan/);assert.match(node('prep-kpi-content').innerHTML,/100%/);
  module.update({...state,locked:true});assert.match(node('prep-kpi-status').textContent,/PPIC Released/);assert.equal(node('prep-delivery-search').disabled,false);
  for(const extra of [{loading:true},{error:'BOM <failed>'},{snapshot:null},{month:'2026-10'}]){module.update({...state,...extra});assert.doesNotMatch(node('prep-delivery-body').innerHTML,/FG-A/);assert.doesNotMatch(node('prep-kpi-content').innerHTML,/40%/);assert.equal(node('prep-delivery-search').disabled,true);assert.equal(node('prep-kpi-basis').textContent,'');}
});
test('delivery search, status filter, and pagination operate on latest source',()=>{
  const {module,node}=fixture(),source=snapshot();source.rows=Array.from({length:61},(_,i)=>({...structuredClone(source.rows[0]),id:String(i),partCode:'FG-'+i}));module.update({month:'2026-09',snapshot:source});
  assert.match(node('prep-delivery-count').textContent,/61 baris.*1 \/ 2/);node('prep-delivery-next').handlers.click();assert.match(node('prep-delivery-count').textContent,/2 \/ 2/);
  node('prep-delivery-search').value='FG-60';node('prep-delivery-search').handlers.input();assert.match(node('prep-delivery-count').textContent,/1 baris.*1 \/ 1/);
  node('prep-delivery-condition').value='READY';node('prep-delivery-condition').handlers.change();assert.match(node('prep-delivery-count').textContent,/0 baris/);
});
test('Lab renders exactly eight accessible tabs and same worksheet chrome for delivery and KPI',async()=>{
  const {modules,getModule}=require('../src/moduleRegistry');
  const html=await ejs.renderFile(path.join(__dirname,'../views/ppic/preparation.ejs'),{title:'PPIC Plan Lab',module:getModule('planning-ppic'),modules,activeModule:'planning-ppic',initialMonth:'2026-09',pageScript:'',requiresAuth:true,socketUrl:'',mqttUrl:''});
  const views=['readiness','workbook','capacity','purchase','vendor','daily','delivery','kpi'];assert.equal((html.match(/data-lab-page=/g)||[]).length,8);
  for(const view of views){assert.match(html,new RegExp('aria-controls="prep-'+view+'-panel"'));assert.match(html,new RegExp('id="prep-'+view+'-panel"[^>]*role="tabpanel"'));}
  for(const view of ['delivery','kpi']){const start=html.indexOf('id="prep-'+view+'-panel"'),panel=html.slice(start,html.indexOf('</section>\n</section>',start));assert.match(panel,/prep-sheetbar/);assert.match(panel,/prep-ribbon/);assert.match(panel,/prep-sheet-heading/);}
  const controller=fs.readFileSync(path.join(__dirname,'../public/js/ppic-preparation.js'),'utf8');assert.match(controller,/PrepLabOutlook\?\.update\(state\)/);
});
