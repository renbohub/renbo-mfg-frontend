'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const materialModel=require('../public/js/purchasing-material-model');
const {getLookupSource}=require('../src/lookupRegistry');
const read=name=>fs.readFileSync(path.join(__dirname,'../public/js',name),'utf8');
const number=value=>Number(value)||0;
test('material quantity is KG even if old package metadata exists',()=>{
  assert.deepEqual(materialModel.storedKgValues({qty:250.5,uomCode:'KG',unitPrice:12000,purchasePackageQty:2,conversionFactor:200}),{qty:250.5,unitPrice:12000,valid:true});
  assert.deepEqual(materialModel.storedKgValues({qty:2,uomCode:'COIL',unitPrice:2000000,conversionFactor:200,conversionUomCode:'KG'}),{qty:400,unitPrice:10000,valid:true});
  assert.equal(materialModel.storedKgValues({qty:2,uomCode:'SHEET',unitPrice:10000}).valid,false);
  assert.equal(materialModel.form('PCS'),'');assert.equal(materialModel.form('S'),'SHEET');
});
test('prices per KG are not multiplied by package factors; form prices require a valid KG conversion',()=>{
  assert.equal(materialModel.pricePerKg({unitPrice:10000,uomCode:'KG',conversionFactor:200},'COIL'),10000);
  assert.equal(materialModel.pricePerKg({unitPrice:2000000,uomCode:'COIL',conversionFactor:200,conversionUomCode:'KG'},'COIL'),10000);
  assert.equal(materialModel.pricePerKg({unitPrice:2000000,uomCode:'COIL'},'COIL'),null);
  assert.equal(materialModel.pricePerKg({unitPrice:12000,uomCode:'KG',CSP:'S'},'COIL'),null);
  assert.equal(materialModel.pricePerKg({unitPrice:12000,uomCode:'KG',CSP:'P'},'COIL'),null);
  assert.equal(materialModel.pricePerKg({unitPrice:0,uomCode:'KG'},'SHEET'),0);
});
test('raw-material lookup carries distinct part and material identities and searches through Parts API',()=>{
  const source=getLookupSource('pr-raw-material-parts');assert.equal(source.endpoint,'/api/master-data/parts');
  assert.equal(source.queryMap.q,'q');assert.equal(source.allowedParents.rawType,'rawType');assert.ok(source.dataKeys.includes('partNumber'));assert.ok(source.dataKeys.includes('material'));
  const item={id:'RAW-001',data:{id:'part-id',partCode:'RAW-001',partNumber:'DRAW-001',partName:'Raw steel',itemType:'RAW',rawType:'MATERIAL',material:{id:'material-id',materialCode:'SPHC-1.6-110'}}};
  const selected=materialModel.rawPartSelection(item);assert.equal(selected.material.id,'material-id');assert.equal(selected.partId,'part-id');assert.equal(selected.partNumber,'DRAW-001');
  assert.equal(materialModel.rawPartSelection({...item,data:{...item.data,rawType:'PURCHASE_PART'}}),null);
  assert.equal(materialModel.rawPartSelection({...item,data:{...item.data,material:null}}),null);
});
test('manual PO payload uses KG and preserves raw part number, without package multiplication',()=>{
  const source=read('purchasing-po-form.js');const code=source.slice(source.indexOf('  function linePayload('),source.indexOf('  async function init('));
  const context={number,$:()=>({value:''})};vm.createContext(context);vm.runInContext(code,context);
  const fields={type:'RAW_MATERIAL',qty:'250.5',form:'SHEET',description:'Raw steel',uom:'KG',price:'12000'};
  const row={_record:{materialId:'mat',materialCode:'SPHC-1.6-110',partCode:'RAW-001',partNumber:'DRAW-001',partName:'Raw steel'},_total:3006000,querySelector:selector=>({value:fields[selector.replace('[data-line-','').replace(']','')]})};
  const result=context.linePayload(row,0);assert.equal(result.qty,250.5);assert.equal(result.uomCode,'KG');assert.equal(result.purchasePackageUomCode,'SHEET');assert.equal(result.CSP,'S');assert.equal(result.partCode,'RAW-001');assert.equal(result.partNumber,'DRAW-001');assert.equal(result.totalAmount,3006000);
  for(const key of ['purchasePackageQty','conversionFactor','convertedPurchaseQty','conversionUomCode'])assert.equal(result[key],null,key);
  fields.type='PURCHASE_PART';fields.uom='PCS';assert.equal(context.linePayload(row,0).uomCode,'PCS');
});
test('manual PR payload accepts form only, locks KG, and retains raw part trace',()=>{
  const source=read('purchasing-pr-form.js');const code=source.slice(source.indexOf('  function linePayload('),source.indexOf('  function show('));
  const material={id:'mat',materialCode:'SPHC-1.6-110',materialName:'Steel',spec:'SPHC',width:110};
  const context={number,materialModel,state:{materials:[material],parts:[]},supplierAllocationPayload:()=>[],initialSupplierAllocations:()=>[]};vm.createContext(context);vm.runInContext(code,context);
  const fields={category:'MATERIAL',part:material.materialCode,qty:'250.5',csp:'C','package-qty':'','conversion-uom':'','conversion-factor':'',description:'Raw steel',uom:'PCS',price:'12000',supplier:'S001',spec:'SPHC',thickness:'1.6',width:'110',notes:''};
  const row={_sourceRecord:{partCode:'RAW-001',partNumber:'DRAW-001',partName:'Raw steel'},querySelector:selector=>({value:fields[selector.replace('.line-','')]||''})};
  const result=context.linePayload(row);assert.equal(result.uomCode,'KG');assert.equal(result.qty,250.5);assert.equal(result.purchasePackageUomCode,'COIL');assert.equal(result.partCode,'RAW-001');assert.equal(result.partNumber,'DRAW-001');
  for(const key of ['purchasePackageQty','conversionFactor','convertedPurchaseQty','conversionUomCode'])assert.equal(result[key],null,key);
});
