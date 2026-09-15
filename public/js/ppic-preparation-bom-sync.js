(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepBomSync=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function mount(doc,{getState,check,apply,now=()=>Date.now()}){
    const checkButton=doc.getElementById('prep-bom-check'),applyButton=doc.getElementById('prep-bom-apply'),status=doc.getElementById('prep-bom-status');
    if(!checkButton||!applyButton||!status)return null;
    const warningPanel=doc.getElementById('prep-bom-warnings'),warningText=doc.getElementById('prep-bom-warning-text');
    let checking=false,applying=false,pending=null,lastKey='',lastCheck=0,serial=0,message='',warnings=[];
    const key=state=>[state.signature,state.snapshot?.bomRevision?.fingerprint||''].join('|');
    const ready=state=>state.snapshot?.bomRevision?.fingerprint&&!state.busy&&!state.loading&&!state.locked;
    function update(){
      const state=getState(),next=key(state);
      if(next!==lastKey){lastKey=next;pending=null;message='';warnings=[];serial++;}
      checkButton.disabled=!ready(state)||checking||applying;
      applyButton.hidden=!pending;applyButton.disabled=!ready(state)||checking||applying;
      status.textContent=applying?'Mengambil BOM terbaru…':checking?'Memeriksa perubahan BOM…':message||(!ready(state)?'Tunggu hasil BOM untuk memeriksa perubahan.':'BOM dimuat · klik Cek perubahan BOM setelah mengubah master.');
      status.classList.toggle('has-update',!!pending);
      if(state.locked){pending=null;applyButton.hidden=true;status.textContent='Bulan sudah lock · BOM mengikuti snapshot PPIC Released.';}
      if(warningPanel&&warningText){warningPanel.hidden=!warnings.length;warningText.textContent=warnings.join('\n');}
    }
    async function inspect(automatic=false){
      update();const state=getState();if(!ready(state)||checking||applying||automatic&&now()-lastCheck<10000)return;
      const captured=key(state),request=++serial;lastCheck=now();checking=true;update();
      try{
        const result=await check();
        if(request!==serial||captured!==key(getState()))return;
        if(!result.bomRevision?.fingerprint)throw Error('Sumber BOM belum dapat diverifikasi.');
        pending=result.bomRevision.fingerprint!==state.snapshot.bomRevision.fingerprint?result.bomRevision:null;
        message=pending?'Ada perubahan BOM. Klik Ambil perubahan BOM untuk menghitung ulang; edit manual dan lead time workbook tetap dipertahankan.':'BOM yang dipakai sudah sesuai master terbaru.';
        warnings=result.warnings||[];
        if(warnings.length)message=(pending?'Ada perubahan BOM. Klik Ambil perubahan BOM; edit manual tetap dipertahankan.':'Versi BOM belum berubah, tetapi sumbernya perlu ditinjau.')+' Ada '+warnings.length+' catatan pemeriksaan BOM.';
      }catch(error){if(request===serial&&captured===key(getState())){pending=null;warnings=[];message='Pemeriksaan BOM gagal: '+error.message;}}
      finally{checking=false;update();}
    }
    checkButton.addEventListener('click',()=>inspect());
    applyButton.addEventListener('click',async()=>{
      if(!pending||!ready(getState())||applying)return;
      const capturedSignature=getState().signature;applying=true;update();
      try{await apply();if(capturedSignature===getState().signature){pending=null;message='BOM terbaru dimuat. Periksa catatan alokasi bila ada proses yang berubah.';}}
      catch(error){if(capturedSignature===getState().signature)message='BOM belum dapat diperbarui: '+error.message;}
      finally{applying=false;update();}
    });
    doc.defaultView?.addEventListener('focus',()=>inspect(true));
    doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')inspect(true);});
    update();return {update,inspect};
  }
  return {mount};
});
