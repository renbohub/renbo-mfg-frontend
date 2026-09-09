(function(){
  'use strict';
  const config=JSON.parse(document.getElementById('vendor-bom-config').textContent), monthly=window.MonthlyPricing;
  const form=document.getElementById('entity-form'), editor=document.getElementById('vendor-bom-rows'), alertBox=document.getElementById('form-alert');
  const saveButton=document.getElementById('save-button'), status=document.getElementById('bom-price-status'), summary=document.getElementById('fg-summary');
  const fg=form.elements.fgPartId, year=form.elements.pricingYear, currency=form.elements.currencyCode, customer=form.elements.customerId;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>localStorage.getItem('token')||sessionStorage.getItem('token')||'';
  const headers=extra=>({Authorization:`Bearer ${token()}`,...extra});
  let view=null, sequence=0, loading=false, dirty=false, initializing=true, lastContext=null, previewFailed=false;
  const editedRows=new Set();
  const context=()=>({fgPartId:fg.value,pricingYear:Number(year.value),currencyCode:currency.value||'IDR',customerId:customer.value||null,...(config.mode==='edit'?{recordId:config.recordId}: {})});
  function message(text){alertBox.textContent=text||'';alertBox.classList.toggle('d-none',!text);}
  async function request(url,options={}){const response=await fetch(url,{...options,headers:headers(options.headers)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||'Data belum dapat dimuat.');return body;}
  async function resolve(select,source,id){if(!id)return;const payload=await request(`/lookups/api/${source}/resolve/${encodeURIComponent(id)}`);if(payload.result)window.EnterpriseLookup.setSelected(select,payload.result);}
  function values(){return [...editor.querySelectorAll('[data-bom-price-row]')].map(card=>{
    const row=view.rows[Number(card.dataset.index)];return {...row,...monthly.read(card),selected:card.querySelector('[data-save-row]').checked,vendorId:card.querySelector('[data-vendor]').value||null,
      uomCode:card.querySelector('[data-uom]').value,minimumOrderQty:card.querySelector('[data-moq]').value,orderMultipleQty:card.querySelector('[data-multiple]').value,minimumCharge:card.querySelector('[data-charge]').value,notes:card.querySelector('[data-notes]').value};
  });}
  const options=(items,key,name,value)=>'<option value="">Pilih</option>'+items.map(item=>`<option value="${esc(item[key])}" ${item[key]===value?'selected':''}>${esc(name(item))}</option>`).join('');
  const vendorName=v=>v?`${v.vendorCode} · ${v.vendorName}`:'Belum dipilih';
  function identity(part){return `<dl class="vendor-bom-identity"><div><dt>Part Number</dt><dd>${esc(part.partNumber||'—')}</dd></div><div><dt>Part Name</dt><dd>${esc(part.partName||'—')}</dd></div><div><dt>Part Code</dt><dd>${esc(part.partCode||'—')}</dd></div></dl>`;}
  function supplierCard(row,index){
    const used=new Set(view.rows.filter(r=>r.key===row.key&&r.quoteKey!==row.quoteKey).map(r=>r.vendorId));
    const choices=row.availableVendors.filter(v=>v.id===row.vendorId||!used.has(v.id));
    return `<section class="vendor-bom-supplier ${row.selected===false?'is-unselected':''}" data-bom-price-row data-index="${index}" aria-label="Harga supplier ${esc(vendorName(row.availableVendors.find(v=>v.id===row.vendorId)))}">
      <div class="vendor-bom-supplier-heading"><h3>${esc(vendorName(row.availableVendors.find(v=>v.id===row.vendorId)))} ${row.isBomDefault?'<span class="vendor-bom-default-badge">Default BOM</span>':'<span class="vendor-bom-alternative-badge">Alternatif</span>'}</h3><div class="vendor-bom-supplier-actions"><label class="vendor-bom-check"><input type="checkbox" class="form-check-input" data-save-row ${row.selected!==false?'checked':''} ${!row.vendorProcessId?'disabled':''}>Simpan harga supplier ini</label>${row.added?'<button type="button" class="btn btn-sm btn-outline-secondary" data-cancel-supplier>Batalkan tambahan</button>':''}</div></div>
      ${row.problem?`<div class="alert alert-warning">${esc(row.problem)}</div>`:''}
      <div class="vendor-bom-meta"><label>Supplier<select class="form-select" data-searchable-disabled="true" data-vendor ${row.priceListId?'disabled':''}>${options(choices,'id',vendorName,row.vendorId)}</select></label><label>UOM Harga<select class="form-select" data-searchable-disabled="true" data-uom>${options(view.uoms,'uomCode',u=>`${u.uomCode} · ${u.uomName}`,row.uomCode)}</select></label><label>MOQ<input class="form-control" type="number" min="0" step="0.01" data-moq value="${esc(row.minimumOrderQty??'')}"></label><label>Kelipatan Order<input class="form-control" type="number" min="0" step="0.01" data-multiple value="${esc(row.orderMultipleQty??'')}"></label><label>Minimum Charge<input class="form-control" type="number" min="0" step="0.01" data-charge value="${esc(row.minimumCharge??'')}"></label></div>
      <p class="vendor-bom-source">${esc(row.priceSource)} · ${esc(view.currencyCode)} · ${view.pricingYear}</p>${monthly.toolbar()}${monthly.grid(row)}
      <label class="vendor-bom-note form-label">Catatan Supplier<input class="form-control" data-notes value="${esc(row.notes)}"></label>
      <div class="vendor-bom-files">${(row.quotationFiles||[]).filter(f=>typeof f.fileUrl==='string'&&f.fileUrl.startsWith('/uploads/quotations/')).map(f=>`<a href="${esc(f.fileUrl)}" target="_blank" rel="noopener">${esc(f.fileName||'Quotation tersimpan')}</a>`).join('')}</div>
    </section>`;
  }
  function render(){
    summary.classList.remove('d-none');summary.innerHTML=`<p><strong>FG terpilih</strong> · ${esc(view.bom.noReg)} · Revisi ${esc(view.bom.revision)}</p>${identity(view.fg)}`;
    const groups=[...new Set(view.rows.map(r=>r.key))];
    editor.innerHTML=groups.map((key,groupIndex)=>{
      const rows=view.rows.filter(r=>r.key===key), row=rows[0], used=new Set(rows.map(r=>r.vendorId));
      const canAdd=row.vendorProcessId&&!used.has(null)&&row.availableVendors.some(v=>!used.has(v.id));
      const defaults=[...new Map(row.bomDefaults.map(d=>[`${d.bomNumber}|${d.vendorId}`,d])).values()];
      return `<section class="vendor-bom-card" data-process-key="${esc(key)}">
        <div class="vendor-bom-card-heading"><div><h2>${groupIndex+1}. ${esc(row.processCode||'Proses belum lengkap')} · ${esc(row.processName)}</h2><small>${esc(row.category)} · ${rows.length} supplier</small></div><div class="vendor-bom-supplier-actions"><button type="button" class="btn btn-outline-primary" data-add-supplier ${canAdd?'':'disabled'}>+ Tambah supplier</button><a class="btn btn-light" href="${row.vendorProcessId?`/master-data/vendor-processes/${encodeURIComponent(row.vendorProcessId)}/edit?key=${encodeURIComponent(row.vendorProcessCode||row.processCode)}`:'/master-data/vendor-processes'}" target="_blank" rel="noopener">Atur supplier proses ↗</a></div></div>
        ${identity(row.part)}
        <div class="vendor-bom-defaults"><strong>Supplier default di BOM</strong>${defaults.map(d=>`<div><span>${esc(d.vendor?vendorName(d.vendor):d.vendorId?'Supplier BOM tidak aktif':'Belum ditetapkan')} <small>· ${esc(d.bomNumber)}</small></span><a href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(d.bomNumber)}/edit-table" target="_blank" rel="noopener">Atur default di BOM ↗</a></div>`).join('')}<small>Harga alternatif tidak mengubah supplier default. Costing BOM memakai supplier yang dipilih pada routing.</small></div>
        ${rows.map(r=>supplierCard(r,view.rows.indexOf(r))).join('')}
        <p class="vendor-bom-eligibility">Pilihan supplier mengikuti vendor aktif di <a href="${row.vendorProcessId?`/master-data/vendor-processes/${encodeURIComponent(row.vendorProcessId)}/edit?key=${encodeURIComponent(row.vendorProcessCode||row.processCode)}`:'/master-data/vendor-processes'}" target="_blank" rel="noopener">Master Proses Vendor · ${esc(row.processCode)}</a>.${!canAdd&&!used.has(null)?' Belum ada supplier alternatif lain. Tambahkan supplier pada master proses terlebih dahulu.':''}</p>
      </section>`;
    }).join('');
    editor.querySelectorAll('[data-bom-price-row]').forEach(card=>monthly.bind(card,view.rows[Number(card.dataset.index)]));
    status.textContent=view.rows.length?`${groups.length} proses vendor · ${view.rows.length} harga supplier. Centang harga supplier yang akan disimpan.`:'BOM FG ini belum mempunyai proses vendor.';
    saveButton.disabled=loading||!view.rows.some(r=>r.vendorProcessId);
  }
  async function load({changedQuoteKey=null,addProcessKey=null}={}){
    const preserve=Boolean(changedQuoteKey||addProcessKey), previous=view?values():[], previousFingerprint=view?.bomFingerprint;
    const ticket=++sequence;
    if(!fg.value){view=null;loading=false;dirty=false;editedRows.clear();editor.inert=false;editor.innerHTML='';summary.classList.add('d-none');saveButton.disabled=true;status.textContent='Pilih FG untuk melihat proses vendor dari BOM.';return;}
    loading=true;editor.inert=true;saveButton.disabled=true;message('');status.textContent='Memuat proses dan harga setiap supplier…';
    try{
      const input=context();
      if(preserve){input.vendorSelections={};for(const r of previous)(input.vendorSelections[r.key]||=[]).push(r.vendorId);if(addProcessKey)input.vendorSelections[addProcessKey].push(null);}
      const next=await request('/master-data/vendor-bom-prices/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
      if(ticket!==sequence)return;
      if(preserve&&previousFingerprint!==next.bomFingerprint)throw new Error('BOM berubah sejak form dibuka. Muat ulang proses dan harga sebelum melanjutkan.');
      const changed=previous.find(r=>r.quoteKey===changedQuoteKey);
      next.rows=next.rows.map(row=>{
        const old=preserve?previous.find(r=>r.quoteKey===row.quoteKey&&r.quoteKey!==changedQuoteKey):null;
        if(old)return {...row,...old};
        const added=(addProcessKey===row.key&&!row.vendorId)||(changed?.added&&changed.key===row.key&&changed.vendorId===row.vendorId);
        return {...row,added:Boolean(added),selected:added||Boolean(changed&&changed.key===row.key&&changed.vendorId===row.vendorId)||(!row.problem&&(config.mode!=='edit'||monthly.months.some(m=>row[m]!=null)))};
      });
      view=next;previewFailed=false;lastContext=context();render();
      if(!preserve){dirty=false;editedRows.clear();}else {dirty=true;if(changedQuoteKey)editedRows.delete(changedQuoteKey);}

    }catch(error){if(ticket===sequence){message(error.message);previewFailed=true;saveButton.disabled=true;status.textContent='Proses belum siap. Perbaiki pilihan lalu muat ulang.';
      if(preserve&&view){view.rows=previous.map(r=>({...r,vendorId:r.quoteKey===changedQuoteKey?view.rows.find(old=>old.quoteKey===r.quoteKey).vendorId:r.vendorId}));render();}
      else {view=null;editor.innerHTML='';summary.classList.add('d-none');}
    }}finally{if(ticket===sequence){loading=false;editor.inert=false;saveButton.disabled=previewFailed||!view||!view.rows.some(r=>r.vendorProcessId);if(addProcessKey&&!previewFailed){const index=view.rows.findIndex(r=>r.key===addProcessKey&&!r.vendorId);editor.querySelector(`[data-index="${index}"] [data-vendor]`)?.focus();}}}
  }
  async function changeContext(event){
    if(initializing)return;
    if(dirty&&!window.confirm('Ada harga yang belum disimpan. Ganti pilihan dan muat ulang harga?')){
      initializing=true;if(lastContext){year.value=lastContext.pricingYear;await resolve(fg,'vendor-bom-fgs',lastContext.fgPartId);await resolve(currency,'currencies',lastContext.currencyCode);if(lastContext.customerId)await resolve(customer,'customers',lastContext.customerId);else window.EnterpriseLookup.clear(customer);}initializing=false;return;
    }
    if(event?.target===fg && config.mode==='create'){
      const selected=window.EnterpriseLookup.getSelected(fg);initializing=true;
      try{if(selected?.customerId)await resolve(customer,'customers',selected.customerId);else window.EnterpriseLookup.clear(customer);}finally{initializing=false;}
    }
    await load();
  }
  function markEdited(target){const card=target.closest('[data-bom-price-row]');if(card&&view){dirty=true;editedRows.add(view.rows[Number(card.dataset.index)].quoteKey);}}
  editor.addEventListener('input',event=>{if(!event.target.matches('[data-vendor]'))markEdited(event.target);});
  editor.addEventListener('change',async event=>{
    if(event.target.matches('[data-vendor]')){const index=Number(event.target.closest('[data-bom-price-row]').dataset.index),row=view.rows[index];
      if(editedRows.has(row.quoteKey)&&!window.confirm('Harga supplier ini belum disimpan. Ganti supplier dan muat harga pilihannya?')){event.target.value=row.vendorId||'';return;}
      await load({changedQuoteKey:row.quoteKey});return;
    }
    markEdited(event.target);if(event.target.matches('[data-save-row]'))event.target.closest('[data-bom-price-row]').classList.toggle('is-unselected',!event.target.checked);
  });
  editor.addEventListener('click',async event=>{
    if(event.target.closest('[data-fill-months]')){monthly.fillEmpty(event.target.closest('[data-bom-price-row]'));markEdited(event.target);}
    if(event.target.closest('[data-add-supplier]'))await load({addProcessKey:event.target.closest('[data-process-key]').dataset.processKey});
    if(event.target.closest('[data-cancel-supplier]')){
      const index=Number(event.target.closest('[data-bom-price-row]').dataset.index), row=view.rows[index];
      if(editedRows.has(row.quoteKey)&&!window.confirm('Batalkan tambahan supplier ini dan buang harga yang belum disimpan?'))return;
      view.rows=values().filter((r,i)=>i!==index);editedRows.delete(row.quoteKey);dirty=true;render();
    }
  });
  [fg,year,currency,customer].forEach(el=>el.addEventListener('change',changeContext));
  if(window.jQuery)window.jQuery(form).on('select2:select.vendorBom select2:clear.vendorBom','select[data-enterprise-lookup]',function(){this.dispatchEvent(new Event('change',{bubbles:true}));});
  document.getElementById('reload-bom').addEventListener('click',async()=>{if(!dirty||window.confirm('Muat ulang dan buang perubahan harga yang belum disimpan?'))await load();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(loading||previewFailed||!view)return;message('');
    const rows=values().filter(r=>r.selected);if(!rows.length){message('Pilih minimal satu harga supplier untuk disimpan.');return;}
    for(const row of rows){if(row.problem){message(`${row.part.partCode}: ${row.problem}`);return;}if(!row.uomCode){message(`Pilih UOM harga untuk ${row.part.partCode}.`);return;}if(!monthly.months.some(m=>row[m]!=null&&row[m]!=='')){message(`Isi minimal satu bulan harga untuk ${row.part.partCode} · ${row.processCode} · ${vendorName(row.availableVendors.find(v=>v.id===row.vendorId))}, atau hilangkan centangnya.`);return;}}
    const payload={...context(),bomFingerprint:view.bomFingerprint,rows:rows.map(r=>({key:r.key,vendorId:r.vendorId,priceToken:r.priceToken,uomCode:r.uomCode,minimumOrderQty:r.minimumOrderQty,orderMultipleQty:r.orderMultipleQty,minimumCharge:r.minimumCharge,notes:r.notes,...Object.fromEntries(monthly.months.map(m=>[m,r[m]??null]))}))};
    const body=new FormData();body.append('payload',JSON.stringify(payload));[...form.elements.quotationFiles.files].forEach(f=>body.append('quotationFiles',f));
    loading=true;editor.inert=true;saveButton.disabled=true;saveButton.querySelector('i').classList.remove('d-none');
    try{const result=await request('/master-data/vendor-bom-prices/save',{method:'POST',body});dirty=false;status.textContent=`${result.supplierPrices} harga supplier pada ${result.processes} proses berhasil disimpan.`;location.replace('/master-data/vendor-price-lists');}
    catch(error){message(error.message);alertBox.scrollIntoView({behavior:'smooth',block:'center'});}
    finally{loading=false;editor.inert=false;saveButton.disabled=false;saveButton.querySelector('i').classList.add('d-none');}
  });
  async function init(){
    try{
      year.value=new Date(window.erpBusinessNow?.()||Date.now()).getFullYear();await resolve(currency,'currencies','IDR');
      if(config.mode==='edit'){
        const existing=await request(`/master-data/vendor-bom-prices/context/${encodeURIComponent(config.recordId)}`);year.value=existing.pricingYear;year.readOnly=true;await resolve(currency,'currencies',existing.currencyCode);await resolve(customer,'customers',existing.customerId);
        if(existing.readOnly){message(existing.message);status.innerHTML=`<a href="/master-data/vendor-price-lists/${encodeURIComponent(config.recordId)}">Lihat harga historis dan detail part tersimpan</a>`;return;}
        if(existing.fgPartId)await resolve(fg,'vendor-bom-fgs',existing.fgPartId);else status.textContent='Child part digunakan beberapa FG. Pilih FG yang akan dijadikan acuan BOM.';
      }
      if(fg.value)await load();
    }catch(error){message(error.message);}finally{initializing=false;}
  }
  init();
})();
