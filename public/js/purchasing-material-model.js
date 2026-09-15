(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PurchasingMaterial=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const unit=value=>String(value||'').trim().toUpperCase();
  const form=value=>({C:'COIL',S:'SHEET',COIL:'COIL',SHEET:'SHEET'})[unit(value)]||'';
  function storedKgValues(data={}) {
    const qty=Number(data.qty??1),price=Number(data.unitPrice??0),uom=unit(data.uomCode||'KG');
    if(uom==='KG')return {qty,unitPrice:price,valid:true};
    const factor=Number(data.conversionFactor);
    if(form(uom)&&unit(data.conversionUomCode)==='KG'&&factor>0&&Number.isFinite(factor))return {qty:qty*factor,unitPrice:price/factor,valid:true};
    return {qty:'',unitPrice:'',valid:false};
  }
  function pricePerKg(price={},selectedForm) {
    const priceForm=form(price.purchasePackageUomCode||price.CSP),targetForm=form(selectedForm),uom=unit(price.uomCode);
    if((price.purchasePackageUomCode||price.CSP)&&!priceForm)return null;
    if(priceForm&&targetForm&&priceForm!==targetForm)return null;
    const value=Number(price.unitPrice);
    if(price.unitPrice==null||price.unitPrice===''||!Number.isFinite(value)||value<0)return null;
    if(uom==='KG')return value;
    const factor=Number(price.conversionFactor);
    if(targetForm&&form(uom)===targetForm&&unit(price.conversionUomCode)==='KG'&&factor>0&&Number.isFinite(factor))return value/factor;
    return null;
  }
  function rawPartSelection(item={}) {
    const part=item.data||{},material=part.material;
    if(part.itemType!=='RAW'||part.rawType!=='MATERIAL'||!material?.id||!material.materialCode||material.isDeleted) return null;
    return {material:{...material},partId:part.id,partCode:part.partCode||item.id,partNumber:part.partNumber||null,partName:part.partName||null};
  }
  return {form,storedKgValues,pricePerKg,rawPartSelection};
});
