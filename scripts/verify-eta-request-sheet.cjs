'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map(),requests=[];let nextId=0,reloaded=0,failNext=false;
class Element{
  constructor(id){this.id=id;this.events={};this.value='';this.disabled=false;this.checked=false;this.hidden=false;this.dataset={};this.fields={};}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelectorAll(){return [];}
  showModal(){this.open=true;}
  close(){this.open=false;}
  reportValidity(){return true;}
  set innerHTML(value){this.html=value;if(this.id==='eta-batch-content'){
    const form=new Element('eta-batch-form');for(const match of value.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g))form.fields[match[1]]=match[0].match(/value="([^"]*)"/)?.[1]||'';nodes.set(form.id,form);nodes.set('eta-batch-error',new Element('eta-batch-error'));
  }}
  get innerHTML(){return this.html||'';}
}
const html=fs.readFileSync('views/purchasing/eta-monitor.ejs','utf8');for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));
nodes.get('eta-sheet-group').value='day';
const window={crypto:{randomUUID:()=>`test-request-${String(++nextId).padStart(16,'0')}`}};
const ctx=vm.createContext({window,document:{getElementById:id=>nodes.get(id)},Intl,FormData:class{constructor(form){this.fields=form.fields;}*[Symbol.iterator](){yield*Object.entries(this.fields);}}});
vm.runInContext(fs.readFileSync('public/js/eta-request-sheet.js','utf8'),ctx);
const model=window.EtaRequestSheet;
const rows=[1,2].map((n)=>({id:'PS:'+n,sourceType:'suggestions',category:'PURCHASE_PART',code:'PART-1',name:'<img onerror=bad>',partNumber:'PN-1',partnerCode:'S001',partner:'Supplier',needDate:'2026-09-'+(15+n),demandQty:n*10,requiredQty:100,qty:100,moq:100,uom:'PCS',leadTime:2,requiresQc:true,canConfirm:true,canMerge:true,mergeKey:'same',sourceFingerprint:'fingerprint-'+n}));
const api=model.mount({api:async(url,body)=>{requests.push({url,body});if(failNext){failNext=false;throw Error('Temporary failure');}return {saved:true};},reload:async()=>{reloaded++;},notify(){},openDetail(){}});
const update=()=>api.update({active:true,rows,filtered:rows,period:'2026-09',loading:false});
(async()=>{
  update();assert.match(nodes.get('eta-sheet-body').innerHTML,/&lt;img/);assert.doesNotMatch(nodes.get('eta-sheet-body').innerHTML,/<img/);
  assert.match(nodes.get('eta-sheet-body').innerHTML,/data-field="moq"/);assert.match(nodes.get('eta-sheet-body').innerHTML,/2026-09-16/);assert.match(nodes.get('eta-sheet-body').innerHTML,/2026-09-17/);
  nodes.get('eta-sheet-all').events.change({target:{checked:true}});assert.equal(nodes.get('eta-merge-selected').disabled,false);
  nodes.get('eta-merge-selected').events.click();assert.equal(nodes.get('eta-batch-dialog').open,true);
  const form=nodes.get('eta-batch-form');assert.equal(form.fields.qty,'100','MOQ applied once; not 200');assert.equal(form.fields.moq,'100');
  form.fields.reference='Fixture only';failNext=true;
  await form.events.submit({preventDefault(){}});assert.equal(nodes.get('eta-batch-error').hidden,false);assert.equal(reloaded,0);
  await form.events.submit({preventDefault(){}});assert.equal(requests[0].body.requestId,requests[1].body.requestId,'Unchanged retry reuses batch identity');
  assert.equal(requests[1].body.merge,true);assert.equal(requests[1].body.items.length,2);assert.equal(requests[1].body.items[0].sourceFingerprint,'fingerprint-1');assert.equal(reloaded,1);
  assert.equal(nodes.get('eta-batch-dialog').open,false);
  assert.match(model.mergeProblem([rows[0],{...rows[1],mergeKey:'other'}]),/spesifikasi/);
  api.error('Unavailable');assert.match(nodes.get('eta-sheet-body').innerHTML,/Unavailable/);assert.doesNotMatch(nodes.get('eta-sheet-body').innerHTML,/PART-1/);
  assert.equal(model.draft({...rows[0],confirmedMoq:0,confirmedQty:20}).moq,0);
  assert.equal(model.clipboardValue('1.000,50','number'),'1000.50');assert.equal(model.clipboardValue('1.000','number'),'1000');assert.equal(model.clipboardValue('0,625','number'),'0.625');assert.equal(model.clipboardValue('16/09/2026','date'),'2026-09-16');assert.equal(model.clipboardValue('31/02/2026','date'),'');assert.equal(model.clipboardValue('=1+1','number'),'');
  const customer={...rows[0],id:'CR:customer1',sourceType:'customer',category:'CUSTOMER',materialCode:'RAW',moq:null,canMerge:false,qtyEditable:true,leadTime:null};
  api.update({active:true,rows:[customer],filtered:[customer],period:'2026-09'});
  assert.match(nodes.get('eta-sheet-body').innerHTML,/Material Customer/);assert.doesNotMatch(nodes.get('eta-sheet-body').innerHTML,/data-field="(?:moq|purchasePackageUomCode|materialWidth)"/);
  nodes.get('eta-sheet-all').events.change({target:{checked:true}});assert.equal(nodes.get('eta-merge-selected').disabled,true);
  nodes.get('eta-save-selected').events.click();assert.equal(nodes.get('eta-batch-dialog').open,true,'Customer ETA does not require purchase specs or lead time');
  const customerForm=nodes.get('eta-batch-form');customerForm.fields.reference='Customer confirmation fixture';await customerForm.events.submit({preventDefault(){}});
  assert.equal(requests.at(-1).body.items[0].id,customer.id);assert.equal(requests.at(-1).body.merge,false);
  const shipment={...customer,id:'CS:shipment1',qtyEditable:false};api.update({active:true,rows:[shipment],filtered:[shipment],period:'2026-09'});
  assert.match(nodes.get('eta-sheet-body').innerHTML,/<input data-field="qty"[^>]+disabled/,'Existing shipment quantity remains fixed');
  console.log('PASS ETA sheet: grouped editable cells, escaped labels, selection, one MOQ, batch payload, failed retry idempotency, reload and error state');
})().catch(error=>{console.error(error);process.exitCode=1;});
