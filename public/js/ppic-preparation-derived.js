(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./ppic-preparation-capacity-matrix'):root.PrepCapacityMatrix);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.PrepDerivedViews=api;api.mount(root.document);}
})(typeof globalThis!=='undefined'?globalThis:this,function(CapacityMatrix){
  'use strict';
  const labels={READY:'Dalam kapasitas',IDLE:'Belum terpakai',OVER_CAPACITY:'Over capacity',ATTENTION:'Perlu ditinjau',BLOCKED:'Belum valid',UNSCHEDULED:'Belum terjadwal',PLANNED:'Terjadwal',REVIEW:'Usulan awal',INCOMPLETE:'Parameter belum lengkap',ERROR:'Gagal dihitung',SKIPPED:'Tidak dibeli'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number=value=>value==null||value===''||!Number.isFinite(Number(value))?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value));
  const join=value=>Array.isArray(value)?value.filter(Boolean).join(', '):value;
  const columns={
    capacity:[['date','Tanggal'],['machineCode','Mesin'],['partCodes','Part Code'],['partNumbers','Part Number'],['processCodes','Proses'],['availableHours','Jam tersedia','number'],['loadHours','Beban (jam)','number'],['remainingHours','Sisa (jam)','number'],['utilizationPct','Utilisasi %','number'],['overloadHours','Overload (jam)','number'],['status','Kondisi','status'],['issues','Catatan']],
    purchase:[['needDate','Tanggal perlu'],['orderDate','Pesan paling lambat'],['partCode','Part Code'],['partNumber','Part Number'],['partName','Nama part / material'],['materialType','Material type'],['materialWidth','Lebar (mm)','number'],['uomCode','Satuan BOM'],['supplierCode','Supplier'],['supplierName','Nama supplier'],['requiredQty','Kebutuhan kotor','number'],['recommendedQty','Usulan awal (MOQ)','number'],['price','Harga satuan','number'],['currencyCode','Mata uang'],['priceUomCode','Satuan harga'],['leadTimeDays','Lead time (hari)','number'],['status','Kondisi','status'],['issues','Catatan'],['sourceFgCodes','FG sumber'],['bomNumbers','BOM sumber']],
    vendor:[['dispatchDate','▲ Keluar ke vendor'],['receiptDate','▼ Masuk kembali'],['vendorCode','Vendor'],['vendorName','Nama PT / Vendor'],['partCode','Part Code'],['partNumber','Part Number'],['partName','Nama part'],['processCode','Proses'],['leadTime','Lead time BOM'],['quantity','Qty','number'],['uomCode','Satuan'],['status','Kondisi','status'],['issues','Catatan'],['parentPartCode','FG sumber'],['bomNumber','BOM sumber']],
  };
  const titles={capacity:'Detail Capacity Production',purchase:'Purchase / Request Material Requirement',vendor:'Vendor Requirement'};
  let documentRef=null,state={},last=null;
  const pages={};
  const expandedMachines=new Set();
  const collapsedMachines=new Set();
  const collapsedPurchaseGroups=new Set();
  const purchaseGroups=[['PURCHASE_PART','Purchase Part'],['MATERIAL','Material'],['UNCLASSIFIED','Belum diklasifikasikan']];
  let visibleMachines=[];
  const purchaseGroup=row=>purchaseGroups.some(([key])=>key===row.purchaseGroup)?row.purchaseGroup:'UNCLASSIFIED';
  const sortPurchaseRows=rows=>purchaseGroups.flatMap(([key])=>rows.filter(row=>purchaseGroup(row)===key));
  function cellValue(row,key){
    if(key==='leadTime'){
      const unit={DAY:'hari',HOUR:'jam',MINUTE:'menit',SECOND:'detik'}[row.leadTimeUnit]||row.leadTimeUnit||'';
      return row.leadTimeValue==null?'—':number(row.leadTimeValue)+' '+unit;
    }
    return join(row[key]);
  }
  function filterRows(rows,term,view){
    const query=String(term||'').trim().toLowerCase();
    return !query?rows:rows.filter(row=>{
      if(Object.values(row).some(value=>String(join(value)??'').toLowerCase().includes(query)))return true;
      if(view!=='purchase'&&!Object.hasOwn(row,'purchaseGroup'))return false;
      return purchaseGroups.find(([key])=>key===purchaseGroup(row))[1].toLowerCase().includes(query)
        ||row.materialWidth!=null&&number(row.materialWidth).toLowerCase().includes(query);
    });
  }
  function tableHead(view){return columns[view].map(([key,label],index)=>'<th scope="col"'+(key==='dispatchDate'?' class="prep-derived-out"':key==='receiptDate'?' class="prep-derived-in"':'')+'>'+CapacityMatrix.columnLabel(label,index)+'</th>').join('');}
  function tableRows(view,rows){return rows.map(row=>'<tr>'+columns[view].map(([key,,type])=>{
    const raw=cellValue(row,key),value=raw==null||raw===''?'—':raw;
    if(type==='status')return '<td><span class="prep-derived-badge '+(Object.hasOwn(labels,raw)?raw:'ATTENTION')+'">'+escape(labels[raw]||value)+'</span></td>';
    if(type==='number')return '<td class="prep-derived-number">'+number(raw)+'</td>';
    return '<td title="'+escape(value)+'"><span class="prep-derived-cell">'+escape(value)+(key==='partCode'?(globalThis.PpicConfirmationFeedback?.marker(row,state.feedback,view==='purchase'?'supplier':view)||''):'')+'</span></td>';
  }).join('')+'</tr>').join('');}
  function purchaseRows(rows,collapsed=new Set()){
    // Presentation grouping only: do not combine different dates, suppliers,
    // BOM occurrences, grades, widths or units into a new procurement quantity.
    return purchaseGroups.map(([key,label])=>{
      const members=rows.filter(row=>purchaseGroup(row)===key);if(!members.length)return '';
      const open=!collapsed.has(key);
      return '<tr class="prep-purchase-group"><th scope="rowgroup" colspan="'+columns.purchase.length+'"><button type="button" data-purchase-toggle="'+key+'" aria-expanded="'+open+'" aria-label="'+(open?'Tutup':'Buka')+' kelompok '+label+'"><span aria-hidden="true">'+(open?'−':'+')+'</span> '+label+'</button><small>'+members.length+' baris di halaman ini</small></th></tr>'+(open?tableRows('purchase',members):'');
    }).join('');
  }
  function render(view){
    const panel=documentRef?.getElementById('prep-'+view+'-panel');if(!panel)return;
    const byId=suffix=>documentRef.getElementById('prep-'+view+'-'+suffix),result=state.snapshot?.derived?.[view];
    byId('scenario').textContent=[state.month,state.name,state.locked?'LOCKED · PPIC Released':state.dirty?'Perubahan tab 02 belum disimpan':'Draft tab 02'].filter(Boolean).join(' · ');
    panel.setAttribute('aria-busy',String(!!state.loading));
    const failed=result?.sourceError||result?.status==='ERROR',fresh=!state.loading&&!state.error&&result,available=fresh&&!failed;
    const message=state.error?'Hasil belum tersedia: '+state.error:state.loading?'Menghitung ulang dari perubahan tab 02…':!state.snapshot?'Buka atau tunggu Worksheet Schedule untuk memuat sumber.':!result?'Hasil turunan belum tersedia. Buka tab 02 lalu Perbarui alokasi.':failed?'Hasil belum terverifikasi: '+(result.warnings?.[0]||'Sumber gagal dibaca. Perbarui alokasi dari tab 02.'):'Otomatis dari tab 02 · termasuk edit yang belum disimpan';
    byId('status').textContent=message;
    if(state.locked&&available)byId('status').textContent='Snapshot PPIC Released · hanya baca';
    byId('basis').textContent=fresh?result.basis||'':'';
    const matrix=view==='capacity',pageSize=matrix?10:50;
    const filtered=available?(matrix?CapacityMatrix.filter(CapacityMatrix.build(result,state.month),byId('search').value):filterRows(result.rows||[],byId('search').value,view)):[];
    const rows=view==='purchase'?sortPurchaseRows(filtered):filtered;
    const maxPage=Math.max(1,Math.ceil(rows.length/pageSize));pages[view]=Math.max(1,Math.min(pages[view]||1,maxPage));
    const start=(pages[view]-1)*pageSize;
    if(matrix)visibleMachines=rows.slice(start,start+pageSize);
    byId('head').innerHTML=matrix?CapacityMatrix.head(state.month):'<tr>'+tableHead(view)+'</tr>';
    const openMachines=new Set(expandedMachines);
    if(matrix&&byId('search').value.trim())visibleMachines.forEach(machine=>{if(!collapsedMachines.has(machine.key))openMachines.add(machine.key);});
    const slice=rows.slice(start,start+pageSize);
    const rowHtml=matrix?CapacityMatrix.rows(visibleMachines,state.month,openMachines):view==='purchase'?purchaseRows(slice,collapsedPurchaseGroups):tableRows(view,slice);
    byId('body').innerHTML=available&&rows.length?rowHtml:'<tr><td colspan="'+(matrix?CapacityMatrix.dates(state.month).length+4:columns[view].length)+'" class="prep-derived-empty">'+escape(available?'Tidak ada baris sesuai jadwal/filter. Periksa catatan sumber sebelum menyimpulkan kebutuhan sudah terpenuhi.':message)+'</td></tr>';
    byId('count').textContent=available?rows.length+(matrix?' mesin':' baris')+' · halaman '+pages[view]+' / '+maxPage:'';
    byId('prev').disabled=!available||pages[view]<=1;byId('next').disabled=!available||pages[view]>=maxPage;
    const warnings=fresh?[...(result.warnings||[])]:[];
    if(available&&view==='capacity')for(const row of result.unallocatedRows||[])warnings.push([row.partCode,row.partNumber,row.processCode,number(row.quantity)+' qty belum terjadwal',join(row.issues)].filter(Boolean).join(' · '));
    byId('warnings').innerHTML=warnings.map(warning=>'<li>'+escape(warning)+'</li>').join('');
    byId('notes').hidden=!warnings.length;
    byId('notes-count').textContent='Catatan sumber ('+warnings.length+')';
    byId('search').disabled=!available;
    if(matrix) {
      for(const action of ['expand','collapse'])if(byId(action))byId(action).disabled=!available||!rows.length;
      if(byId('refresh'))byId('refresh').disabled=!!state.loading||!!state.busy||!!state.locked||!state.month;
      for(const button of byId('body').querySelectorAll?.('[data-capacity-edit]')||[])button.disabled=!!state.locked||!!state.busy;
    }
  }
  function update(next){
    state=next;
    if(last&&['month','name','dirty','busy','locked','loading','error','snapshot'].every(key=>last[key]===next[key]))return;
    last=next;Object.keys(columns).forEach(render);
  }
  function mount(doc){
    documentRef=doc;
    for(const view of Object.keys(columns)){
      const input=doc.getElementById('prep-'+view+'-search');if(!input)continue;
      input.addEventListener('input',()=>{pages[view]=1;if(view==='purchase')collapsedPurchaseGroups.clear();render(view);});
      for(const [action,direction] of [['prev',-1],['next',1]])doc.getElementById('prep-'+view+'-'+action).addEventListener('click',()=>{pages[view]=(pages[view]||1)+direction;render(view);});
      doc.getElementById('prep-'+view+'-back').addEventListener('click',()=>doc.getElementById('prep-page-workbook').click());
      render(view);
    }
    doc.getElementById('prep-purchase-body')?.addEventListener('click',event=>{
      if(state.loading||state.error||!state.snapshot)return;
      const button=event.target.closest('[data-purchase-toggle]');if(!button)return;
      const key=button.dataset.purchaseToggle;if(!purchaseGroups.some(([group])=>group===key))return;
      if(collapsedPurchaseGroups.has(key))collapsedPurchaseGroups.delete(key);else collapsedPurchaseGroups.add(key);
      render('purchase');
      const buttons=doc.getElementById('prep-purchase-body').querySelectorAll?.('[data-purchase-toggle]')||[];
      [...buttons].find(next=>next.dataset.purchaseToggle===key)?.focus({preventScroll:true});
    });
    doc.getElementById('prep-capacity-body')?.addEventListener('click',event=>{
      const edit=event.target.closest('[data-capacity-edit]');
      if(edit?.dataset?.capacityEdit){
        if(state.locked||state.busy||state.loading||state.error||!state.snapshot)return;
        const {capacityEdit:kind,capacityId:id,capacityDate:date}=edit.dataset,result=state.snapshot.derived?.capacity;
        const row=kind==='machine'?result?.rows.find(row=>row.machineId===id&&row.date===date):result?.machineChildren.find(row=>row.sourceRowId===id);
        if(row)doc.defaultView.dispatchEvent(new doc.defaultView.CustomEvent('prep:edit-capacity',{detail:{kind,id,date,row,opener:edit}}));
        return;
      }
      const button=event.target.closest('[data-capacity-toggle]');if(!button)return;
      const key=button.dataset.capacityToggle;
      if(button.getAttribute('aria-expanded')==='true'){expandedMachines.delete(key);collapsedMachines.add(key);}else{expandedMachines.add(key);collapsedMachines.delete(key);}
      render('capacity');
      const buttons=doc.getElementById('prep-capacity-body').querySelectorAll?.('[data-capacity-toggle]')||[];
      [...buttons].find(next=>next.dataset.capacityToggle===key)?.focus({preventScroll:true});
    });
    doc.getElementById('prep-capacity-expand')?.addEventListener('click',()=>{visibleMachines.forEach(machine=>{expandedMachines.add(machine.key);collapsedMachines.delete(machine.key);});render('capacity');});
    doc.getElementById('prep-capacity-collapse')?.addEventListener('click',()=>{visibleMachines.forEach(machine=>{expandedMachines.delete(machine.key);collapsedMachines.add(machine.key);});render('capacity');});
  }
  return {columns,titles,labels,cellValue,filterRows,tableHead,tableRows,purchaseGroup,sortPurchaseRows,purchaseRows,update,mount};
});
