(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.PpicConfirmationFeedback=api;api.connect(root);}
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validMonth=value=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(value||'');
  const safeHref=value=>typeof value==='string'&&/^\/modules\//.test(value)&&!/[\\\u0000-\u001f]/.test(value)?value:null;
  const day=value=>typeof value==='string'?value.slice(0,10):'';
  const qty=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value)):'—';
  function changesFor(row,feedback,view){
    const inline=row?.scheduleChanges||row?.scheduleChange;
    if(inline)return (Array.isArray(inline)?inline:[inline]).filter(Boolean).flatMap(change=>Array.isArray(change.changes)?change.changes:[change]);
    const ids=[row?.id,row?.sourceRowId,row?.releaseRowId].filter(value=>value!=null).map(String);
    const aliases={mrp:'supplier','incoming-supplier':'supplier','incoming-material':'supplier','incoming-vendor':'vendor','material-plan':'supplier'};
    const changes=(feedback?.changes||[]).filter(change=>(!change.view||!view||(aliases[view]||view)===change.view)&&[change.rowId,change.releaseRowId,change.sourceRowId].some(id=>id!=null&&ids.includes(String(id))));
    if(!changes.length&&row?.confirmedEta&&row.confirmedEta!==row.needDate)changes.push({originalDate:row.needDate,currentDate:row.confirmedEta,reason:'ETA partner terkonfirmasi'});
    return changes;
  }
  function changeText(change){
    const before=day(change.originalDate||change.previousDate||change.fromDate),after=day(change.currentDate||change.date||change.toDate);
    const dates=before||after?[before||'—',after||'—'].join(' → '):'Distribusi jadwal diperbarui';
    return dates+(change.reason?' · '+change.reason:' · Konfirmasi ETA');
  }
  function marker(row,feedback,view){
    const changes=changesFor(row,feedback,view);
    const conflicts=(feedback?.conflicts||[]).filter(c=>c.rowId===row?.id&&(!view||!c.view||view===c.view));
    if(row?.scheduleConflict||conflicts.length)return '<span class="ppic-eta-changed" tabindex="0" title="'+esc(row?.scheduleConflict||conflicts.map(c=>c.reason).join('; '))+'">⚠ ETA</span>';
    if(!changes.length)return '';
    const text=changes.map(changeText).join('; ');
    return '<span class="ppic-eta-changed" tabindex="0" title="'+esc(text)+'" aria-label="Jadwal berubah: '+esc(text)+'">↻ ETA</span>';
  }
  function documents(feedback,kind){return (feedback?.documents||[]).filter(doc=>doc.type===kind&&safeHref(doc.href));}
  function releaseSource(record={},item={}){
    const refs=[...(item.sourceRequirements||[]),...(record.items||[]).flatMap(row=>row.sourceRequirements||[])];
    const source=refs.find(ref=>ref.sourceType==='PPIC_RELEASE');
    if(record.sourceType!=='PPIC_RELEASE'&&!record.releaseId&&!String(record.runNumber||'').startsWith('PPIC_RELEASE:')&&!source)return null;
    const month=[record.planningMonth,record.month,source?.month,item.materialRequiredDate,record.dueDate].map(value=>String(value||'').slice(0,7)).find(validMonth);
    if(['CONFIRMING','REVIEW'].includes(record.ppicStage))return {type:'PPIC Konfirmasi ETA',label:'PPIC Konfirmasi ETA'+(month?' '+month:''),href:'/modules/planning-ppic/preparation'+(month?'?month='+month:''),month};
    return {type:'PPIC Released',label:'PPIC Released'+(month?' '+month:''),href:'/modules/planning-ppic/released'+(month?'?month='+month:''),month};
  }
  function links(month,feedback,releaseId){
    if(!validMonth(month))return '';
    const groups=[['PURCHASE_SUGGESTION','Konfirmasi ETA Supplier','/modules/purchasing/eta-monitor?month='+month+'&tab=ppic&partner=supplier'],['VENDOR_CONFIRMATION','Konfirmasi ETA Vendor','/modules/purchasing/eta-monitor?month='+month+'&tab=ppic&partner=vendor'],['CUSTOMER_SUPPLY_REQUEST','Konfirmasi ETA Material Customer','/modules/purchasing/eta-monitor?month='+month+'&tab=ppic&partner=customer']];
    return groups.map(([type,label,fallback],index)=>{const docs=documents(feedback,type),target=fallback+(releaseId?'&releaseId='+encodeURIComponent(releaseId):'');return '<div class="ppic-eta-destination"><a href="'+esc(target)+'"><span>0'+(index+1)+'</span>'+label+' ↗</a>'+(docs.length?'<details><summary>'+docs.length+' dokumen</summary>'+docs.map(doc=>'<a href="'+esc(doc.href)+'">'+esc(doc.number)+'</a>').join('')+'</details>':'')+'</div>';}).join('');
  }
  function render(node,payload,{sync=false}={}){
    if(!node)return;
    node.hidden=!['LOCKED','CONFIRMING','REVIEW'].includes(payload?.status);if(node.hidden){node.innerHTML='';return;}
    const f=payload.feedback||{},changes=f.changes||[];
    node.innerHTML='<div class="ppic-eta-summary"><strong>Konfirmasi ETA · revisi '+esc(f.revision||0)+'</strong><span>'+esc(f.confirmedCount??0)+' dikonfirmasi · '+esc(f.pendingCount??0)+' menunggu</span><span>'+changes.length+' perubahan jadwal</span>'+(sync?'<button type="button" data-ppic-confirmation-sync>Sinkronkan rekomendasi & ETA</button>':'')+'</div><div class="ppic-eta-destinations">'+links(payload.month,f,payload.id)+'</div>'+(changes.length?'<details class="ppic-eta-change-list"><summary>Lihat tanggal sebelum → sesudah</summary><div>'+changes.slice(0,100).map(c=>'<p><b>'+esc(c.partCode||c.processCode||c.view||'Jadwal')+'</b> '+esc(changeText(c))+'</p>').join('')+(changes.length>100?'<p>'+esc(changes.length-100)+' perubahan lainnya ditandai pada baris jadwal.</p>':'')+'</div></details>':'')+'<p class="ppic-eta-feedback-note">'+(payload.status==='LOCKED'?'Konfirmasi partner memperbarui rencana resmi mulai hari ini.':'Simulasi menunggu review PPIC dan Confirm Release. Rencana resmi belum diterbitkan.')+' Tanda ↻ ETA menunjukkan jadwal yang berubah.</p>';
    if(f.conflicts?.length){const rows=[...Object.values(payload.views||{}).flat(),...(payload.items||[])];node.innerHTML+='<details class="ppic-eta-change-list" open><summary>⚠ '+f.conflicts.length+' jadwal perlu ditinjau</summary><div>'+f.conflicts.map(c=>{const row=rows.find(r=>r.id===c.rowId)||{};return '<p><b>'+esc(c.partCode||row.partCode||c.view||'Jadwal')+' · '+esc(c.date||row.date||row.needDate||row.receiptDate||'—')+'</b> '+esc(c.reason)+'</p>';}).join('')+'</div></details>';}
    if(f.commitments?.length)node.innerHTML+='<details class="ppic-eta-change-list"><summary>'+f.commitments.length+' alokasi partner terkonfirmasi</summary><div class="ppic-eta-commitments"><table data-enterprise-table="off"><thead><tr><th>Jenis</th><th>Partner</th><th>Part</th><th>Qty</th><th>UOM</th><th>ETA</th><th>Siap dipakai</th><th>LT (hari)</th><th>MOQ</th><th>Dokumen</th></tr></thead><tbody>'+f.commitments.map(c=>'<tr><td>'+esc({supplier:'Supplier',vendor:'Vendor',customer:'Customer'}[c.kind]||c.kind)+'</td><td>'+esc(c.partnerCode)+'</td><td>'+esc(c.partCode)+'</td><td>'+qty(c.qty)+'</td><td>'+esc(c.uomCode)+'</td><td>'+esc(day(c.eta)||'—')+'</td><td>'+esc(day(c.readyDate)||'—')+'</td><td>'+qty(c.leadTimeDays)+'</td><td>'+qty(c.moq)+'</td><td>'+esc(c.sourceDocumentNumber)+'</td></tr>').join('')+'</tbody></table></div></details>';
  }
  let host,channel,lastSeen='';
  function connect(win){
    host=win;
    const receive=data=>{if(!data||data.type!=='PPIC_ETA_CHANGED'||typeof data.id!=='string'||data.id===lastSeen)return;lastSeen=data.id;win.dispatchEvent(new win.CustomEvent('ppic:confirmation-changed',{detail:data}));};
    try{channel=new win.BroadcastChannel('ppic-confirmations');channel.onmessage=event=>receive(event.data);}catch{}
    win.addEventListener('storage',event=>{if(event.key==='ppic-confirmation-change'){try{receive(JSON.parse(event.newValue));}catch{}}});
  }
  function notify(detail={}){
    if(!host)return;
    const data={type:'PPIC_ETA_CHANGED',id:host.crypto?.randomUUID?.()||String(Date.now())+Math.random(),month:validMonth(detail.month)?detail.month:null,source:detail.source||'confirmation'};
    lastSeen=data.id;try{channel?.postMessage(data);}catch{}try{host.localStorage.setItem('ppic-confirmation-change',JSON.stringify(data));}catch{}
    host.dispatchEvent(new host.CustomEvent('ppic:confirmation-changed',{detail:data}));
  }
  return {validMonth,safeHref,changesFor,changeText,marker,releaseSource,links,render,connect,notify};
});
