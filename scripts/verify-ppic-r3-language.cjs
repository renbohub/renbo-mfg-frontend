const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let language='id';const document={readyState:'loading',addEventListener(){},querySelectorAll(){return [];}},window={localStorage:{getItem:()=>language},addEventListener(){}};
const context={window,document,Node:{TEXT_NODE:3},Intl};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/ppic-language.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/shared-data-table.js'),'utf8'),context);
for(const [key,title,quantity] of [['id','Demand Tahunan','112.308'],['en','Annual Demand','112,308'],['ja','年間需要','112,308']]){
 language=key;assert.equal(window.PpicI18n.t('annual'),title);const formatted=new Intl.NumberFormat(window.PpicI18n.locale()).format(112308);assert.equal(formatted,quantity);
 const node={nodeType:3,nodeValue:formatted+' PCS',parentElement:{closest:selector=>selector.includes('[data-quantity-formatted]')?{}:null}};window.SharedDataTable.normalizePcsDisplay(node);assert.equal(node.nodeValue,quantity+' PCS','Already localized numbers must not be parsed as Indonesian decimals');
 assert(!window.PpicI18n.t('pageGroups',{page:1,pages:2,count:50}).includes('{'));
}
const calendar=require('../public/js/ppic-calendar-model');const cols=calendar.columns('2026-10',{weekly:true,horizon:1});assert.equal(calendar.headingGroups(cols,true)[0].key,'2026-09');assert.equal(cols.filter(c=>c.days.includes('2026-10-02')).length,1);
const inputs=Array.from({length:10000},(_,i)=>({customerCode:'C'+Math.floor(i/20),partCode:'P'+i,uomCode:i%2?'KG':'PCS',effectiveDeliverySplits:[{targetDate:'2026-10-02',qty:10,sourceNumber:'SO-'+i}]}));
const start=performance.now(),rows=calendar.deliveryRows(inputs,'2026-10'),total=calendar.totalsByUnit(rows);assert.equal(rows.length,10000);assert.deepEqual(total,{PCS:50000,KG:50000});assert.equal(rows.filter(r=>r.sourceNumber==='SO-9999').length,1);
console.log('PASS PPIC R3 languages, locale quantity preservation, weekly ownership and 10,000-row calendar model ('+Math.round(performance.now()-start)+' ms). Browser performance is a separate check.');
