(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const qty=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value)||0);
  root.PpicConfirmationGate={mount({api,action,state,reload,message}){
    const $=id=>document.getElementById(id);let review=null;
    $('prep-eta-review').addEventListener('click',()=>action(async()=>{
      review=null;$('prep-eta-confirm').disabled=true;$('prep-eta-resubmit').disabled=true;
      $('prep-eta-content').textContent='Memuat konfirmasi dan menghitung perubahan terbaru…';$('prep-eta-reason').value='';$('prep-eta-dialog').showModal();
      try{review=await api('/confirmation-rounds/'+encodeURIComponent(state().id)+'/review','POST',{});}catch(error){$('prep-eta-content').textContent=error.message+' Tutup dan buka kembali review.';throw error;}
      const f=review.feedback||{},rows=f.pending||[],changes=f.changes||[],conflicts=f.conflicts||[];
      $('prep-eta-content').innerHTML='<p><strong>'+esc(review.month)+' · Putaran '+review.round+'</strong> · '+qty(f.confirmedCount)+' terkonfirmasi · '+qty(f.pendingCount)+' menunggu · '+changes.length+' perubahan jadwal</p>'+
        '<p>1 Lock usulan → 2 Konfirmasi departemen → <strong>3 Review PPIC</strong> → 4 Release resmi</p>'+
        (f.pendingCount?'<p>Lengkapi konfirmasi partner, qty, lead time, MOQ, dan ETA. Confirm Release tersedia setelah semua kebutuhan terpenuhi.</p>':'<p>Konfirmasi lengkap. Periksa perubahan jadwal, kapasitas, dan dampak delivery sebelum release.</p>')+
        '<div class="prep-eta-table"><table data-enterprise-table="off"><thead><tr><th>Jenis / Partner</th><th>Part</th><th>Kebutuhan</th><th>Confirmed</th><th>Status</th><th>Target ETA jika ajukan ulang</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.kind)+' / '+esc(r.partnerCode||'—')+'</td><td>'+esc(r.partCode)+'</td><td>'+qty(r.requiredQty)+' '+esc(r.uomCode)+'</td><td>'+qty(r.confirmedQty)+'</td><td>'+(r.href?'<a href="'+esc(r.href)+'" target="_blank" rel="noopener">'+esc(r.status)+' ↗</a>':esc(r.status))+'</td><td><input type="date" data-eta-target="'+esc(r.releaseRowId)+'" value="'+esc(r.targetEta||r.needDate||'')+'" aria-label="Target ETA '+esc(r.partCode)+'"></td></tr>').join('')+'</tbody></table></div>'+
        ((f.commitments||[]).length?'<details open><summary>Rincian komitmen partner</summary><div class="prep-eta-table"><table data-enterprise-table="off"><thead><tr><th>Jenis / Part</th><th>Partner</th><th>Qty</th><th>ETA</th><th>Siap setelah QC</th><th>LT hari</th><th>MOQ</th></tr></thead><tbody>'+f.commitments.map(c=>'<tr><td>'+esc(c.kind)+' / '+esc(c.partCode)+'</td><td>'+esc(c.partnerCode)+'</td><td>'+qty(c.qty)+' '+esc(c.uomCode)+'</td><td>'+esc(c.eta||'—')+'</td><td>'+esc(c.readyDate||'—')+'</td><td>'+esc(c.leadTimeDays??'—')+'</td><td>'+esc(c.moq??'—')+'</td></tr>').join('')+'</tbody></table></div></details>':'')+
        '<h3>Perubahan jadwal</h3>'+(changes.length?'<div class="prep-eta-table"><table data-enterprise-table="off"><thead><tr><th>Rencana / Part</th><th>Sebelum</th><th>Sesudah</th><th>Alasan</th></tr></thead><tbody>'+changes.map(c=>{const r=Object.values(review.views||{}).flat().find(r=>r.id===c.rowId)||{};return '<tr><td>'+esc(c.view)+' · '+esc(r.partCode||c.partCode||'')+'</td><td>'+esc(c.originalDate||c.previousDate)+'</td><td>'+esc(c.currentDate)+'</td><td>'+esc(c.reason)+'</td></tr>';}).join('')+'</tbody></table></div>':'<p>Tidak ada perubahan tanggal.</p>')+
        (conflicts.length?'<h3>Perlu diselesaikan sebelum release</h3><ul>'+conflicts.map(c=>'<li>'+esc(c.reason)+'</li>').join('')+'</ul>':'');
      $('prep-eta-confirm').disabled=review.status!=='REVIEW'||!!conflicts.length;$('prep-eta-resubmit').disabled=false;
      root.PpicConfirmationFeedback?.render($('prep-confirmation-feedback'),review);
    },true));
    $('prep-eta-close').addEventListener('click',()=>$('prep-eta-dialog').close());
    async function finish(resubmit){
      if(!review)return;
      const body={reviewHash:review.reviewHash,feedbackRevision:review.feedbackRevision};
      if(resubmit){body.reason=$('prep-eta-reason').value.trim();if(!body.reason){message('Isi alasan pengajuan ulang ETA.',true);$('prep-eta-reason').focus();return;}body.targets=Object.fromEntries([...document.querySelectorAll('[data-eta-target]')].filter(n=>n.value).map(n=>[n.dataset.etaTarget,n.value]));}
      await action(async()=>{
        $('prep-eta-confirm').disabled=true;$('prep-eta-resubmit').disabled=true;
        try{await api('/confirmation-rounds/'+encodeURIComponent(review.id)+(resubmit?'/resubmit-eta':'/confirm-release'),'POST',body);$('prep-eta-dialog').close();review=null;await reload();message(resubmit?'ETA diajukan ulang. Seluruh partner perlu mengkonfirmasi putaran baru.':'Confirm Release berhasil. Rencana resmi PPIC dan departemen telah diterbitkan.');}
        catch(error){review=null;$('prep-eta-content').textContent=error.message+' Tutup dan buka Review ETA kembali.';throw error;}
      },true);
    }
    $('prep-eta-confirm').addEventListener('click',()=>finish(false));
    $('prep-eta-resubmit').addEventListener('click',()=>finish(true));
  }};
})(window);
