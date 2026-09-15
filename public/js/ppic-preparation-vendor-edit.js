(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ppic-preparation-model'):root.PrepWorkbook);if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepVendorEdit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const units={SECOND:'detik',MINUTE:'menit',HOUR:'jam',DAY:'hari'};
  const format=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(value);
  function apply(workbook,snapshot,change){
    const row=snapshot?.rows?.flatMap(parent=>parent.children||[]).find(row=>row.id===change.id);
    if(!row||row.allocationKind!=='VENDOR_LEAD_TIME')throw Error('Pilih proses vendor pada hasil BOM terbaru.');
    if(change.reset){if(workbook.vendorLeadTimeOverrides)delete workbook.vendorLeadTimeOverrides[change.id];return;}
    if(change.value==null||String(change.value).trim()==='')throw Error('Isi lead time, termasuk 0 bila tanpa jeda.');
    if(!Object.hasOwn(units,change.unit))throw Error('Pilih satuan lead time yang valid.');
    const value=M.quantity(change.value);
    workbook.vendorLeadTimeOverrides||={};
    workbook.vendorLeadTimeOverrides[change.id]={value,unit:change.unit};
  }
  function mount(doc,commit){
    const dialog=doc.getElementById('prep-vendor-dialog');if(!dialog)return null;
    const $=key=>doc.getElementById('prep-vendor-edit-'+key);let selection=null,submitting=false,opener=null;
    function close(){if(submitting)return;dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true});else doc.getElementById('prep-vendor-lead-time')?.focus({preventScroll:true});}
    $('close').addEventListener('click',close);$('cancel').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
    function preview(){
      try{if(!$('value').value.trim())throw Error('Isi lead time terlebih dahulu.');
        const value=M.quantity($('value').value),hours=value*({SECOND:1/3600,MINUTE:1/60,HOUR:1,DAY:24}[$('unit').value]);
        $('preview').textContent='Qty masuk mengikuti qty keluar; waktu masuk = waktu keluar + '+format(hours)+' jam efektif vendor. 1 hari = 24 jam; tanggal libur Master Working Hours dilewati sehingga tanggal masuk mundur.';
      }catch(error){$('preview').textContent=error.message;}
    }
    $('value').addEventListener('input',preview);$('unit').addEventListener('change',preview);
    async function submit(reset){
      if(submitting||!selection)return;
      submitting=true;$('apply').disabled=true;$('reset').disabled=true;$('error').textContent='';
      try{await commit({id:selection.id,value:$('value').value,unit:$('unit').value,reset});submitting=false;close();}
      catch(error){$('error').textContent=error.message;}
      finally{submitting=false;$('apply').disabled=false;$('reset').disabled=false;}
    }
    $('form').addEventListener('submit',event=>{event.preventDefault();submit(false);});$('reset').addEventListener('click',()=>submit(true));
    return {open(row){
      selection=row;opener=doc.activeElement;$('error').textContent='';
      $('context').textContent=[row.partCode,row.partNumber,row.processCode,row.resource,row.bomNumber].filter(Boolean).join(' · ');
      const bomValue=row.vendorBomLeadTimeValue??(row.vendorLeadTimeSource==='MBOM_DETAIL'?row.vendorLeadTimeValue:null);
      const bomUnit=row.vendorBomLeadTimeUnit??(row.vendorLeadTimeSource==='MBOM_DETAIL'?row.vendorLeadTimeUnit:null);
      $('source').textContent='BOM: '+(bomValue==null?'belum diisi':format(bomValue)+' '+(units[bomUnit]||bomUnit||''))+' · Sumber aktif: '+(row.vendorLeadTimeSource==='WORKBOOK_OVERRIDE'?'Workbook':'BOM');
      $('value').value=row.vendorLeadTimeValue==null?'':String(row.vendorLeadTimeValue).replace('.',',');
      $('unit').value=Object.hasOwn(units,row.vendorLeadTimeUnit)?row.vendorLeadTimeUnit:'HOUR';
      $('legacy').hidden=row.vendorAllocationBasis!=='RECEIPT'||row.allocationMode!=='MANUAL';
      $('reset').disabled=false;preview();dialog.showModal();$('value').focus();$('value').select();
    }};
  }
  return {apply,mount};
});
