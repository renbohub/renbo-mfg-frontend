(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ppic-preparation-model'):root.PrepWorkbook,typeof module==='object'&&module.exports?require('./ppic-preparation-tree'):root.PrepProcessTree);if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepAdjustmentEdit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M,T){
  'use strict';
  const format=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(value);
  function values(input,current){
    return Object.fromEntries(['shortage','buffer'].map(kind=>{
      const raw=input[kind];
      if(raw==null||String(raw).trim()===''){
        if(current?.[kind]==null)return [kind,null];
        throw Error('Isi qty '+kind+', termasuk 0 jika tidak ada.');
      }
      return [kind,M.quantity(raw)];
    }));
  }
  function apply(workbook,snapshot,change){
    if(change.signature!==T.signature(workbook))throw Error('Draft sudah berubah. Tutup dan buka kembali pengaturan ini.');
    if(!M.dates(workbook.month).includes(change.date))throw Error('Pilih tanggal pada periode workbook.');
    const row=T.rows(workbook,snapshot).find(parent=>parent.id===change.parentId)?._children.find(child=>child._kind==='ADJUSTMENT');
    if(!row)throw Error('Data shortage/buffer belum tersedia. Perbarui alokasi terlebih dahulu.');
    const field='d'+change.date.slice(-2),next=values(change,row[field]);
    if(M.stable(next)===M.stable(row[field]))return false;
    row[field]=next;
    const staged=M.clone(workbook);
    T.captureProcess(staged,row);
    workbook.demandAdjustments=staged.demandAdjustments;
    return true;
  }
  function mount(doc,commit){
    const dialog=doc.getElementById('prep-adjustment-dialog');if(!dialog)return null;
    const $=key=>doc.getElementById('prep-adjustment-edit-'+key);let selection=null,submitting=false,opener=null;
    function restoreFocus(){if(opener?.isConnected)opener.focus({preventScroll:true});else doc.getElementById('prep-grid')?.focus({preventScroll:true});}
    function close(){if(!submitting)dialog.close();}
    $('close').addEventListener('click',close);$('cancel').addEventListener('click',close);
    dialog.addEventListener('close',restoreFocus);
    dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
    function preview(){
      try{const next=values({shortage:$('shortage').value,buffer:$('buffer').value},selection?.value);
        $('total').textContent=Object.values(next).some(value=>value==null)?'Total belum lengkap':'Total tambahan kebutuhan: '+format(next.shortage+next.buffer)+' '+(selection?.uomCode||'qty');
      }catch(error){$('total').textContent=error.message;}
    }
    for(const kind of ['shortage','buffer'])$(kind).addEventListener('input',preview);
    $('form').addEventListener('submit',async event=>{
      event.preventDefault();if(submitting||!selection)return;
      $('error').textContent='';
      try{
        const next=values({shortage:$('shortage').value,buffer:$('buffer').value},selection.value);
        submitting=true;$('apply').disabled=true;
        await commit({parentId:selection.parentId,date:selection.date,signature:selection.signature,...next});
        submitting=false;close();
      }catch(error){$('error').textContent=error.message;}
      finally{submitting=false;$('apply').disabled=false;}
    });
    return {open(row,date,signature){
      if(dialog.open)return;
      const value=row['d'+date.slice(-2)];
      selection={parentId:row.parentId,date,signature,value,uomCode:row.uomCode};opener=doc.activeElement;
      $('context').textContent=[row.partCode,row.partNumber,new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'))].filter(Boolean).join(' · ');
      $('error').textContent='';
      for(const kind of ['shortage','buffer']){
        $(kind).value=value?.[kind]==null?'':String(value[kind]).replace('.',',');
        const source=row.adjustmentContext?.[kind];
        $(kind+'-source').textContent=(kind==='shortage'?'Bulan sebelumnya':'Bulan berikutnya')+' · '+(source?.source==='WORKBOOK'?'Koreksi workbook':source?.verified?'Otomatis':'Belum terverifikasi');
      }
      preview();dialog.showModal();$('shortage').focus();$('shortage').select();
    }};
  }
  return {values,apply,mount};
});
