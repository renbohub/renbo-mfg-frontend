"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const pricing=require('../public/js/monthly-pricing'),{getEntity}=require('../src/masterDataRegistry');
const source=fs.readFileSync(path.resolve(__dirname,'../public/js/entity-list.js'),'utf8');
function harness(slug,raw) {
  const config=getEntity(slug),nodes=new Map(),exports=[];let options,displayRows;
  function node(id){if(id==='master-import-modal')return null;if(!nodes.has(id))nodes.set(id,{value:'',textContent:id==='entity-config'?JSON.stringify(config):'',classList:{add(){},remove(){},toggle(){},contains(){return false;}},events:{},addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(id);}
  const $=()=>({value:'',text(v){this.value=String(v);return this;},html(){return this.value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}});
  $.ajax=({success})=>success({data:structuredClone(raw),recordsTotal:raw.length,recordsFiltered:raw.length});
  class DataTable {constructor(_selector,settings){options=settings;settings.ajax({},payload=>{displayRows=payload.data;});this.ajax={reload(){}};}rows(){return{invalidate(){return{draw(){}};}};}search(){return{draw(){}};}}
  const document={getElementById:node,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={MonthlyPricing:pricing,addEventListener(){},SharedDataTable:{exportTablePayload:async(payload,format)=>exports.push({payload,format})},alert(message){throw new Error(message);}};
  vm.runInNewContext(source,{window,document,$,DataTable,localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},URLSearchParams,Intl,Date,Set,Map,fetch:async()=>({ok:true,json:async()=>({data:structuredClone(raw)})}),setTimeout,clearTimeout,confirm:()=>false});
  return {config,nodes,options,displayRows,exports};
}
(async()=>{
  for(const slug of ['part-price-lists','material-price-lists','vendor-price-lists','product-price-lists']) {
    const row={id:'fixture',pricingYear:2026,unitPrice:null,january:100,june:120,september:90};
    if(slug==='vendor-price-lists')row.details=[{vendorProcessId:'p',unitPrice:null,january:80,june:100,september:70},{vendorProcessId:'q',unitPrice:null,january:20}];
    const h=harness(slug,[row]);const record=h.displayRows[0];
    assert.equal(record.february,100);assert.equal(record.july,120);assert.equal(record.december,90);
    assert.equal(record.monthlyOverrides.july,false,'list projection does not create an override');
    const july=h.options.columns.find(col=>col.name==='july');
    assert.equal(july.render(null,'sort',record),120,'sort/type data stays numeric');
    assert.equal(july.render(null,'display',record),'120','main table displays only the formatted effective price');
    for(const format of ['xlsx','pdf']) {
      await h.nodes.get(`export-data-${format}`).events.click({currentTarget:{}});
      const exportRow=h.exports.at(-1).payload.rows[0];
      for(const [month,expected] of Object.entries({january:100,february:100,july:120,december:90}))assert.equal(exportRow[h.config.columns.findIndex(col=>col.data===month)],expected,`${slug} ${format} ${month}`);
    }
    assert.equal(row.february,undefined,'raw API row remains unmodified');
    assert.deepEqual(pricing.project(record),record,'display projection is idempotent');
  }
  const zero=pricing.project({pricingYear:2026,january:0,june:50});assert.equal(zero.february,0);assert.match(pricing.cell(zero,'february'),/<strong>0<\/strong>/);
  const legacy=pricing.project({unitPrice:200,effectiveFrom:'2026-03-01',effectiveUntil:'2026-06-30'});assert.equal(legacy.february,null);assert.equal(legacy.june,200);assert.equal(legacy.july,null);
  assert.match(pricing.cell(legacy,'july'),/–/);
  console.log('PASS monthly price list: sparse AJAX projection, plain numeric cells, vendor monthly totals, PDF+XLSX exports for all 4 price lists, zero, bounded legacy periods, immutable/idempotent projection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
