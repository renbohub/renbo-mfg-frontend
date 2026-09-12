(function () {
  'use strict';
  const context = window.PPIC_WORKSPACE_CONTEXT, root = document.querySelector('[data-ppic-module]');
  if (!context || !root) return;
  const defaultMonth = context.filters.month;
  const $ = id => document.getElementById('ppw-' + id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null || !Number.isFinite(Number(value)) ? 'Belum diketahui' : new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value));
  const datetime = value => !value || !Number.isFinite(new Date(value).getTime()) ? 'Belum diketahui' : new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value));
  const date = value => !value || !Number.isFinite(new Date(value).getTime()) ? 'Belum diketahui' : new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'Asia/Jakarta'}).format(new Date(value));
  const monthName = value => /^\d{4}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z')) : 'Periode belum dipilih';
  const filterKeys = ['month','plant','customer','resource','scenario','q','demandType','day','week','status','compare'];
  const statusMeta = {
    OK:['ok','OK','✓'], READY:['ok','Siap','✓'], VALID:['ok','Valid','✓'],
    BLOCKER:['blocker','Blocker','×'], BLOCKED:['blocker','Blocked','×'],
    CONDITIONAL:['conditional','Bersyarat','!'], UNKNOWN:['unknown','Unknown','?'],
    NA:['na','N/A','—'], 'N/A':['na','N/A','—'], DRAFT:['unknown','Draft','○'],
    RELEASED:['ok','Released','✓'], CONFIRMED:['ok','Confirmed','✓'],
  };
  const meta = status => statusMeta[String(status || 'UNKNOWN').toUpperCase()] || ['unknown',String(status || 'Unknown'),'?'];
  const badge = status => { const [tone,label,icon] = meta(status); return '<span class="ppw-badge '+tone+'">'+icon+' '+escape(label)+'</span>'; };
  let snapshot = null, scenarios = [], scenarioAnalysis = null, scenarioFailure = '', selectedReadiness = '', selectedDemand = '', busy = false, requestVersion = 0, controller;
  const analysisPage = ['L05','L06','L07','L08','L09'].includes(context.page.id);
  const expanded = new Set();
  const empty = (title, copy) => '<div class="ppw-empty"><strong>'+escape(title)+'</strong>'+escape(copy)+'</div>';
  function filters() {
    const values = {}; for (const key of filterKeys) { const field = $('filters').elements.namedItem(key); const value = field ? field.value : context.filters[key]; if (value) values[key] = value; }
    return values;
  }
  function query(values = filters()) { return new URLSearchParams(Object.entries(values).filter(([key,value]) => filterKeys.includes(key) && value)); }
  function path(id, extras = {}) { const page = context.pages.find(item => item.id === id); return page ? page.href+'?'+query({...filters(),...extras}) : '#'; }
  function internalRoute(value) { return typeof value === 'string' && /^\/(?:modules|master-data|maintenance)(?:\/|\?|$)/.test(value) && !value.startsWith('//') ? value : null; }
  function sourceLink(value, label, classes = 'ppw-btn ppw-small') {
    const route = internalRoute(value); if (!route) return '<span class="ppw-badge unknown">Sumber belum ditautkan</span>';
    const url = new URL(route,location.origin), values = filters();
    const keys = url.pathname.startsWith('/modules/planning-ppic/') ? filterKeys : ['month'];
    for (const key of keys) if (!url.searchParams.has(key) && values[key]) url.searchParams.set(key,values[key]);
    return '<a class="'+classes+'" href="'+escape(url.pathname+url.search)+'">'+escape(label)+'</a>';
  }
  function navigation() {
    const values = filters(); context.filters = {...values};
    document.querySelectorAll('a[data-ppw-link]').forEach(link => { const url = new URL(link.href,location.origin); for (const key of filterKeys) url.searchParams.delete(key); for (const [key,value] of Object.entries(values)) url.searchParams.set(key,value); link.href = url.pathname+url.search; });
  }
  function setNotice(text, error = false) { $('notice').textContent = text || ''; $('notice').hidden = !text; $('notice').classList.toggle('error',error); }
  function setBusy(value) { busy = value; $('filters').querySelectorAll('input,select,button').forEach(node => node.disabled = value); $('page-actions').querySelectorAll('button').forEach(node => node.disabled = value); }
  function actionButton(action,label,primary=false) { return '<button type="button" class="ppw-btn '+(primary?'ppw-primary':'')+'" data-ppw-action="'+action+'">'+escape(label)+'</button>'; }
  function actions() {
    if (context.page.id === 'L01') $('page-actions').innerHTML = actionButton('refresh','↻ Perbarui snapshot')+'<a class="ppw-btn" href="'+escape(path('L04'))+'">Buka editor skenario</a><a class="ppw-btn ppw-primary" href="'+escape(path('L04'))+'">Lanjutkan MPS →</a>';
    if (context.page.id === 'L02') $('page-actions').innerHTML = actionButton('refresh','↻ Perbarui snapshot')+actionButton('validate','✓ Validasi ulang',true);
    if (context.page.id === 'L03') $('page-actions').innerHTML = actionButton('refresh','↻ Sinkron demand')+sourceLink('/modules/planning-ppic/demand-planning/delivery-workbench','Kelola demand','ppw-btn')+actionButton('export','↓ Ekspor CSV');
    if (analysisPage) $('page-actions').innerHTML = actionButton('refresh','↻ Hitung ulang')+'<a class="ppw-btn" href="'+escape(path('L04'))+'">Ubah skenario MPS</a>'+(context.page.id==='L07'?'<a class="ppw-btn ppw-primary" href="'+escape(path('L08'))+'">Lanjutkan daily draft →</a>':context.page.id==='L09'?'<a class="ppw-btn ppw-primary" href="'+escape(path('L10'))+'">Review kandidat release →</a>':'');
  }
  async function api(pathname, signal) {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const response = await fetch('/modules/api/planning-ppic/workspace'+pathname,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || 'Permintaan gagal ('+response.status+').'); error.status = response.status; error.code = payload.code; throw error; }
    return payload.success === true && payload.data != null ? payload.data : payload;
  }
  function selectOptions(id, options, first, selected) {
    const field = $(id), items = Array.isArray(options)?options:[];
    field.innerHTML = (first ? '<option value="">'+escape(first)+'</option>' : '')+items.map(item => '<option value="'+escape(item.value)+'">'+escape(item.label)+'</option>').join('');
    if (selected && !items.some(item => String(item.value) === selected)) field.insertAdjacentHTML('beforeend','<option value="'+escape(selected)+'">'+escape(selected)+' · filter aktif</option>');
    field.value = selected || (first ? '' : items[0]?.value || '');
  }
  function populateFilters(values) {
    selectOptions('plant',snapshot.filters?.plants,null,values.plant || snapshot.filters?.plants?.[0]?.value);
    selectOptions('customer',snapshot.filters?.customers,'Semua customer',values.customer);
    selectOptions('resource',snapshot.filters?.resources,'Semua resource',values.resource);
    selectOptions('scenario',scenarios.map(item=>({value:item.id,label:item.name+' · rev '+item.revision})),'Snapshot sumber',values.scenario);
    $('month').value = values.month; $('search').value = values.q || '';
  }
  function kpi(value, label, copy, tone = '', icon = '▥') { return '<article class="ppw-kpi '+tone+'"><span class="ppw-kpi-icon" aria-hidden="true">'+icon+'</span><div><strong>'+escape(number(value))+'</strong><h3>'+escape(label)+'</h3><p>'+escape(copy)+'</p></div></article>'; }
  function panel(title, body, extra = '') { return '<section class="ppw-panel"><header class="ppw-panel-heading"><h2>'+escape(title)+'</h2>'+extra+'</header>'+body+'</section>'; }
  function table(headers, rows) { return '<div class="ppw-table-scroll"><table class="ppw-table" data-enterprise-table="off"><thead><tr>'+headers.map(value=>'<th>'+escape(value)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'; }
  function sourceFreshness() {
    const source=snapshot.source || {};
    $('subtitle').textContent = monthName(snapshot.month)+' · '+(snapshot.scope?.label || 'Scope belum diketahui');
    $('freshness').innerHTML = '<span><strong>Snapshot:</strong> '+escape(datetime(snapshot.generatedAt))+'</span><span><strong>Sumber:</strong> '+escape(datetime(source.asOf))+'</span><span>'+badge(source.stale?'UNKNOWN':source.completeness==='COMPLETE'?'OK':'UNKNOWN')+' '+escape(source.stale?'Sumber berubah / perlu validasi ulang':source.completeness==='COMPLETE'?'Kelengkapan sumber terverifikasi':'Kelengkapan sumber belum sepenuhnya terverifikasi')+'</span>';
    if (snapshot.scope?.plantMappingAvailable === false) $('freshness').insertAdjacentHTML('beforeend','<span>ERP belum memiliki pemetaan plant; data ditampilkan pada scope '+escape(snapshot.scope.label || 'ERP')+'.</span>');
  }
  function renderHome() {
    const home=snapshot.home || {},stages=home.stages || [],exceptions=home.exceptions || [];
    const stageRows=stages.map(stage=>'<tr><td><strong>'+escape(stage.label)+'</strong></td><td>'+badge(stage.status)+'</td><td><small>'+escape(stage.detail || 'Belum ada evidence')+'</small></td><td>'+sourceLink(stage.route,'Lihat detail')+'</td></tr>').join('');
    const priorities=exceptions.map(item=>'<article class="ppw-exception '+meta(item.status)[0]+'"><span aria-hidden="true">'+meta(item.status)[2]+'</span><div><h3>'+escape(item.title)+'</h3><p>Owner: '+escape(item.owner || 'Belum ditetapkan')+' · '+escape(number(item.affectedCount))+' terdampak</p>'+badge(item.status)+'</div>'+sourceLink(item.route,'Buka masalah')+'</article>').join('');
    const saved=scenarios.map(item=>'<tr><td><strong>'+escape(item.name)+'</strong></td><td>'+escape(monthName(item.month))+'</td><td>'+escape(datetime(item.updatedAt))+'</td><td>'+escape(number(item.revision))+'</td><td>'+badge(item.status || 'DRAFT')+'</td><td><a class="ppw-btn ppw-small" href="'+escape(path('L04',{scenario:item.id}))+'">Buka skenario</a></td></tr>').join('');
    $('content').innerHTML='<section class="ppw-kpis">'+kpi(home.deliveryCount,'delivery','Kebutuhan customer dalam periode')+kpi(home.fgCount,'FG','Identitas produk unik')+kpi(home.blockerCount,'blocker data','Pemeriksaan yang menahan kelayakan','blocker','!')+kpi(home.unknownCount,'belum terverifikasi','Memerlukan evidence sumber','unknown','?')+'</section><div class="ppw-grid">'+panel('Progres persiapan planning',(stages.length?table(['Tahap','Status','Temuan','Aksi'],stageRows):empty('Status tahap belum tersedia','Periksa kelengkapan sumber.'))+'<footer class="ppw-panel-footer"><a href="'+escape(path('L02'))+'">Detail kesiapan data →</a></footer>')+panel('Prioritas planner',exceptions.length?'<div class="ppw-exceptions">'+priorities+'</div>':empty('Tidak ada exception yang teridentifikasi','Keadaan ini bukan persetujuan release. Periksa semua parameter wajib di tahap MPS.'))+'</div>'+panel('Skenario tersimpan',scenarios.length?table(['Nama skenario','Periode','Terakhir disimpan','Revisi','Status','Aksi'],saved):empty(scenarioFailure?'Daftar skenario belum tersedia':'Belum ada skenario tersimpan',scenarioFailure || 'Buka editor MPS, lakukan simulasi, lalu simpan skenario di server.'));
  }
  function readinessEvidence(item) {
    const diagnostics=(item.evidence || []).filter(row=>row.code==='BOM_INPUT_DIAGNOSTIC');
    if (!diagnostics.length) return '';
    const problems=diagnostics.filter(row=>['BLOCKER','CONDITIONAL'].includes(row.status)), missing=diagnostics.filter(row=>row.status==='UNKNOWN'), passed=diagnostics.filter(row=>['OK','NA'].includes(row.status));
    const cards=rows=>rows.map(row=>'<article class="ppw-evidence-card">'+badge(row.status)+' <strong>'+escape(row.partCode)+(row.component?' · '+escape(row.component):'')+'</strong><p>'+escape([row.document,row.process,row.phaseLabel].filter(Boolean).join(' · '))+'</p><dl><dt>Pemeriksaan</dt><dd>'+escape(row.field)+'</dd><dt>Nilai saat ini</dt><dd>'+escape(row.actual==null?'Belum tersedia':String(row.actual))+'</dd>'+(row.requirement?'<dt>Ketentuan</dt><dd>'+escape(row.requirement)+'</dd>':'')+'<dt>Penanggung jawab</dt><dd>'+escape(row.owner)+'</dd></dl><p><strong>Langkah berikutnya:</strong> '+escape(row.recommendation)+'</p>'+sourceLink(row.route,row.actionLabel || (row.route?.includes('/mps/')?'Buka rencana MPS':row.route?.endsWith('/processes')?'Buka routing BOM':'Buka BOM terkait'),'ppw-btn ppw-small')+'</article>').join('');
    const groups=(rows,label)=>rows.length?'<h3>'+label+' ('+rows.length+')</h3>'+[...new Set(rows.map(row=>row.partCode))].map((part,index)=>'<details class="ppw-diagnostic-group"'+(index===0?' open':'')+'><summary>'+escape(part)+' · '+rows.filter(row=>row.partCode===part).length+' pemeriksaan</summary>'+cards(rows.filter(row=>row.partCode===part))+'</details>').join(''):'';
    return groups(problems,'Perlu diperbaiki')+groups(missing,'Data yang perlu dilengkapi')+(!problems.length&&!missing.length?'<p>Seluruh pemeriksaan BOM, routing dan kuantitas yang berlaku pada cakupan ini lolos.</p>':'')+'<details class="ppw-diagnostic-group"><summary>'+passed.length+' pemeriksaan lolos / tidak berlaku — lihat bukti</summary>'+cards(passed)+'</details><p class="ppw-muted">Unknown berarti data sumber untuk pemeriksaan tersebut belum cukup. Kesiapan release juga bergantung pada dataset lain.</p>';
  }
  function readinessDetail(item) {
    if (!item) return panel('Detail kesiapan',empty('Pilih dataset','Buka satu baris untuk melihat evidence dan modul pemilik.'));
    const completeness=item.completeness || {};
    return panel(item.label+' · '+(item.owner || 'Owner belum ditetapkan'),'<div class="ppw-panel-body ppw-detail">'+badge(item.status)+'<dl><dt>Sumber</dt><dd>'+escape(item.source || 'Belum diketahui')+'</dd><dt>Terakhir diperbarui</dt><dd>'+escape(datetime(item.asOf))+'</dd><dt>Pemeriksaan dievaluasi</dt><dd>'+(Number(completeness.total)>0?escape(number(completeness.complete))+' / '+escape(number(completeness.total)):'Belum ada evaluasi yang dapat dihitung')+'</dd><dt>FG terdampak</dt><dd>'+escape(number(item.affectedFgCount))+'</dd><dt>Delivery terdampak</dt><dd>'+escape(number(item.affectedDeliveryCount))+'</dd><dt>Owner</dt><dd>'+escape(item.owner || 'Belum ditetapkan')+'</dd></dl>'+readinessEvidence(item)+'<h3>Ringkasan temuan</h3>'+(item.issues?.length?'<ul>'+item.issues.map(issue=>'<li>'+escape(typeof issue==='string'?issue:issue.message || issue.title || 'Temuan tanpa deskripsi')+'</li>').join('')+'</ul>':'<p class="ppw-muted">Tidak ada temuan yang dikembalikan sumber.</p>')+'<div class="ppw-actions">'+sourceLink(item.route,'Buka modul pemilik','ppw-btn ppw-primary')+'</div></div>');
  }
  function renderReadiness() {
    const items=snapshot.readiness || [],count=status=>items.filter(item=>String(item.status).toUpperCase()===status).length;
    if (!items.some(item=>item.id===selectedReadiness)) selectedReadiness=items.find(item=>item.status==='BLOCKER' || item.status==='UNKNOWN')?.id || items[0]?.id || '';
    const rows=items.map((item,index)=>'<tr class="'+(selectedReadiness===item.id?'selected':'')+'"><td>'+String(index+1)+'</td><td><button class="ppw-link" data-readiness="'+escape(item.id)+'">'+escape(item.label)+'</button></td><td>'+escape(datetime(item.asOf))+'</td><td>'+escape(item.owner || 'Belum ditetapkan')+'</td><td>'+badge(item.status)+'</td><td><small>'+escape(item.issues?.[0] || 'Tidak ada temuan dari sumber')+'</small></td><td><button type="button" class="ppw-btn ppw-small" aria-haspopup="dialog" aria-controls="ppw-dialog" data-readiness-dialog="true" data-readiness="'+escape(item.id)+'">Lihat detail</button></td></tr>').join('');
    $('content').innerHTML='<section class="ppw-kpis">'+kpi(count('OK'),'dataset OK','Dari '+items.length+' dataset','ok','✓')+kpi(count('BLOCKER'),'dataset blocker','Perbaiki pada modul pemilik','blocker','!')+kpi(count('CONDITIONAL'),'dataset bersyarat','Memerlukan mitigasi valid','conditional','!')+kpi(count('UNKNOWN'),'belum terverifikasi','Unknown menahan release terkait','unknown','?')+'</section><div class="ppw-grid ppw-detail-grid">'+panel('Kesiapan input planning',items.length?table(['#','Dataset','Versi / update','Owner','Status','Temuan','Aksi'],rows):empty('Dataset belum tersedia','Refresh setelah integrasi sumber tersedia.'))+readinessDetail(items.find(item=>item.id===selectedReadiness))+'</div>'+panel('Status sumber data','<div class="ppw-panel-body ppw-sources">'+items.map(item=>'<article class="ppw-source"><strong>'+escape(item.label)+'</strong> '+badge(item.status)+'<p>Owner: '+escape(item.owner || 'Belum ditetapkan')+'<br>Update: '+escape(datetime(item.asOf))+'</p></article>').join('')+'</div><footer class="ppw-panel-footer">Data wajib yang unknown menahan validasi rencana terkait. Tombol validasi menghitung kembali dari sumber ERP.</footer>');
  }
  function demandItems() { const term=String(filters().q || '').toLowerCase(),type=filters().demandType; return (snapshot.demand?.items || []).filter(item=>(!term || [item.partCode,item.partName,item.customerCode,item.customerName,item.sourceNumber,item.id].some(value=>String(value || '').toLowerCase().includes(term))) && (!type || (type==='FIRM'?item.firm:!item.firm))); }
  function totals(items, field) { const result=new Map(); for(const item of items){const key=item.uom || 'Unit unknown';if(!result.has(key))result.set(key,0);const prev=result.get(key);result.set(key,prev==null || item[field]==null || !Number.isFinite(Number(item[field]))?null:prev+Number(item[field]));} return [...result].map(([uom,qty])=>escape(number(qty))+' '+escape(uom)).join(' · ') || '—'; }
  function demandDetail(item) {
    if (!item) return panel('Informasi delivery',empty('Pilih delivery','Setiap delivery mempertahankan ID, due dan komitmen sumber.'));
    return panel(item.id,'<div class="ppw-panel-body ppw-detail">'+badge(item.status)+'<dl><dt>Customer</dt><dd>'+escape(item.customerCode)+'<br>'+escape(item.customerName)+'</dd><dt>FG</dt><dd>'+escape(item.partCode)+'<br>'+escape(item.partName)+'</dd><dt>Dokumen sumber</dt><dd>'+escape(item.sourceNumber || 'Belum diketahui')+'</dd><dt>PO line</dt><dd>'+escape(item.sourceLineId || 'Belum diketahui')+'</dd><dt>Tanggal due</dt><dd>'+escape(date(item.dueAt))+'<small>Jam komitmen customer belum tersedia</small></dd><dt>Kuantitas</dt><dd>'+escape(number(item.qty))+' '+escape(item.uom)+'</dd><dt>Alokasi qualified stock</dt><dd>'+escape(number(item.allocatedStockQty))+' '+escape(item.uom)+'</dd><dt>Net need</dt><dd>'+escape(number(item.netNeedQty))+' '+escape(item.uom)+'</dd><dt>Forecast dikonsumsi</dt><dd>'+escape(number(item.consumedForecastQty))+' '+escape(item.uom)+'</dd><dt>Jenis</dt><dd>'+escape(item.firm?'Firm':'Forecast')+'</dd><dt>Update</dt><dd>'+escape(datetime(item.updatedAt))+'</dd></dl><div class="ppw-actions">'+sourceLink(item.route,'Buka sumber / alokasi','ppw-btn ppw-primary')+'</div><p style="font-size:11px;color:#687f9f;margin-top:14px">Perubahan due, split dan konfirmasi harus mengikuti workflow sumber. Pembagian produksi di MPS tidak mengubah komitmen customer.</p></div>');
  }
  function renderDemand() {
    const items=demandItems(),groups=new Map();
    for(const item of items){const key=item.partCode+'|'+item.uom;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
    if(!items.some(item=>item.id===selectedDemand)) selectedDemand=items[0]?.id || '';
    let rows='';
    for(const [key,group] of groups){const isOpen=expanded.has(key),first=group[0];rows+='<tr class="ppw-parent"><td><button class="ppw-link" data-group="'+escape(key)+'" aria-expanded="'+isOpen+'">'+(isOpen?'▾':'▸')+' '+escape(first.partCode)+'</button><small>'+escape(first.partName)+' · '+group.length+' delivery</small></td><td>—</td><td>—</td><td>'+totals(group,'qty')+'</td><td>'+totals(group,'allocatedStockQty')+'</td><td>'+totals(group,'netNeedQty')+'</td><td colspan="3">'+group.length+' kebutuhan</td></tr>';if(isOpen)rows+=group.map(item=>'<tr class="'+(selectedDemand===item.id?'selected':'')+'"><td><button class="ppw-link" data-delivery="'+escape(item.id)+'">'+escape(item.id)+'</button><small>'+escape(item.sourceNumber)+'</small></td><td>'+escape(item.customerCode)+'<small>'+escape(item.customerName)+'</small></td><td>'+escape(date(item.dueAt))+'</td><td class="ppw-num">'+escape(number(item.qty))+'</td><td class="ppw-num">'+escape(number(item.allocatedStockQty))+'</td><td class="ppw-num">'+escape(number(item.netNeedQty))+'</td><td>'+badge(item.status)+'</td><td>'+escape(item.firm?'Firm':'Forecast')+'</td><td><button class="ppw-btn ppw-small" data-delivery="'+escape(item.id)+'">Detail</button></td></tr>').join('');}
    const type=filters().demandType || '';
    $('content').innerHTML='<section class="ppw-kpis">'+kpi(new Set(items.map(item=>item.partCode)).size,'FG','Dalam filter demand')+kpi(items.length,'delivery','ID kebutuhan independen')+kpi(items.filter(item=>item.firm).length,'firm delivery','Komitmen dari sumber Sales')+kpi(items.filter(item=>item.allocatedStockQty==null).length,'alokasi belum diketahui','Tidak dianggap tersedia','unknown','?')+'</section><div class="ppw-grid ppw-detail-grid">'+panel('Kebutuhan delivery per FG',(items.length?table(['Delivery / PO','Customer','Due date','Need','Alokasi stok','Net need','Status','Tipe','Aksi'],rows):empty('Tidak ada demand untuk filter ini','Ubah filter atau periksa demand pada modul pemilik.'))+'<footer class="ppw-inline-total"><span>Demand: <strong>'+totals(items,'qty')+'</strong></span><span>Alokasi stok: <strong>'+totals(items,'allocatedStockQty')+'</strong></span><span>Net need: <strong>'+totals(items,'netNeedQty')+'</strong></span></footer>','<div class="ppw-actions"><select id="ppw-demand-type" aria-label="Jenis demand" data-searchable-disabled="true"><option value=""'+(!type?' selected':'')+'>Firm / Forecast</option><option value="FIRM"'+(type==='FIRM'?' selected':'')+'>Firm</option><option value="FORECAST"'+(type==='FORECAST'?' selected':'')+'>Forecast</option></select><button class="ppw-btn ppw-small" data-ppw-action="expand">Buka semua</button></div>')+demandDetail(items.find(item=>item.id===selectedDemand))+'</div><div class="ppw-notice">Angka ditampilkan per UOM. Qualified stock yang belum terverifikasi ditampilkan sebagai unknown; firm demand yang mengonsumsi forecast tidak ditambahkan dua kali.</div>';
  }
  function render() { if(!snapshot)return;sourceFreshness();actions();if(context.page.id==='L01')renderHome();if(context.page.id==='L02')renderReadiness();if(context.page.id==='L03')renderDemand();if(analysisPage)window.PpicLabsPages.render({snapshot,scenarios,analysis:scenarioAnalysis,context,helpers:{$,escape,number,datetime,date,monthName,meta,badge,panel,table,empty,path,sourceLink,kpi,filters,api,setNotice,persistQuery}});navigation(); }
  const legacyDestinations = {L05:'/modules/planning-ppic/mps/workbench',L06:'/modules/planning-ppic/mrp',L07:'/modules/planning-ppic/monthly-production-plans',L08:'/modules/planning-ppic/daily-production-plans',L09:'/modules/planning-ppic/preparation',L10:'/modules/planning-ppic/mps/workbench?view=legacy',E01:'/modules/planning-ppic/production-actuals',E02:'/modules/production/daily-production-schedules',E03:'/modules/production/daily-production-schedules',E04:'/modules/production/wip',E05:'/modules/planning-ppic/mps/recovery-kanban',E06:'/modules/production/vendor-process-orders',E07:'/modules/outgoing/delivery-schedules',E08:'/modules/planning-ppic/mps/recovery-kanban',A10:'/modules/production/oee-monitoring'};
  function renderFuture() {
    $('loading').hidden=true;$('content').hidden=false;$('filters').hidden=true;$('freshness').textContent='Route terdaftar · implementasi fungsional belum tersedia';
    $('content').innerHTML=panel('Halaman belum diimplementasikan',empty(context.page.id+' · '+context.page.label,'Halaman ini masih menunggu batch implementasi. Data dan tindakan tidak disimulasikan sebagai hasil ERP.')+'<div class="ppw-panel-body ppw-actions"><a class="ppw-btn ppw-primary" href="'+escape(path('L01'))+'">Kembali ke Planning Home</a>'+(legacyDestinations[context.page.id]?sourceLink(legacyDestinations[context.page.id],'Buka fungsi ERP yang tersedia','ppw-btn'):'')+'</div>');
  }
  async function load(reason='refresh') {
    controller?.abort();controller=new AbortController();const version=++requestVersion,values=filters();
    setBusy(true);setNotice('');$('loading').hidden=!!snapshot;if(!snapshot)$('content').hidden=true;
    try {
      const response=await Promise.allSettled([api('?'+query(values),controller.signal),api('/scenarios?'+new URLSearchParams({month:values.month,plant:values.plant || 'ALL'}),controller.signal)]);
      if(version!==requestVersion)return;
      if(response[0].status==='rejected')throw response[0].reason;
      snapshot=response[0].value;scenarioFailure=response[1].status==='rejected'?response[1].reason.message:'';scenarios=response[1].status==='fulfilled'?(response[1].value.items || []):[];
      populateFilters(values);
      scenarioAnalysis=null;
      if(analysisPage && values.scenario)scenarioAnalysis=await api('/scenarios/'+encodeURIComponent(values.scenario)+'/analysis',controller.signal);
      if(scenarioAnalysis && (scenarioAnalysis.analysis?.month || scenarioAnalysis.month)!==values.month)throw new Error('Periode skenario berbeda dari filter. Pilih skenario yang tersimpan untuk bulan '+values.month+'.');
      if(version!==requestVersion)return;
      if(context.page.id==='L03' && !expanded.size)for(const item of snapshot.demand?.items || [])expanded.add(item.partCode+'|'+item.uom);
      render();$('content').hidden=false;
      if(response[1].status==='rejected')setNotice('Data sumber dimuat. Daftar skenario belum tersedia: '+response[1].reason.message,true);
      else if(reason==='validate')setNotice('Validasi dihitung ulang dari sumber ERP. Periksa hasil Blocker, Conditional, dan Unknown di bawah.');
      else if(reason==='refresh')setNotice('Snapshot sumber diperbarui.');
    }catch(error){if(version!==requestVersion || error.name==='AbortError')return;setNotice(error.status===403?'Akses data PPIC ditolak. '+error.message:error.message,true);if(analysisPage){scenarioAnalysis=null;$('content').hidden=false;$('content').innerHTML=empty('Analisis skenario belum tersedia',error.message);}else if(!snapshot){$('content').hidden=false;$('content').innerHTML=empty(error.status===403?'Akses ditolak':'Data PPIC belum tersedia','Tidak ada angka pengganti yang ditampilkan. Coba perbarui setelah sumber dapat diakses.');}else{$('freshness').textContent='Snapshot sebelumnya · pembaruan gagal; data dapat kedaluwarsa.';}}
    finally{if(version===requestVersion){$('loading').hidden=true;setBusy(false);}}
  }
  function persistQuery(replace=false) { const url=new URL(location.href); for(const key of filterKeys)url.searchParams.delete(key);for(const [key,value] of Object.entries(filters()))url.searchParams.set(key,value);window.history[replace?'replaceState':'pushState'](null,'',url);navigation(); }
  function exportDemand() {
    const rows=[['Delivery ID','Customer','FG','Due (ISO)','Need','UOM','Allocated qualified stock','Net need','Source','Type'],...demandItems().map(item=>[item.id,item.customerCode,item.partCode,item.dueAt,item.qty,item.uom,item.allocatedStockQty??'UNKNOWN',item.netNeedQty??'UNKNOWN',item.sourceNumber,item.firm?'Firm':'Forecast'])];
    const quote=value=>'"'+String(value ?? '').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"',url=URL.createObjectURL(new Blob(['\ufeff',rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='ppic-demand-'+filters().month+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-ppw-action]')?.dataset.ppwAction;if(action==='refresh' || action==='validate')load(action);if(action==='export')exportDemand();if(action==='expand'){for(const item of demandItems())expanded.add(item.partCode+'|'+item.uom);renderDemand();}
    const readiness=event.target.closest('[data-readiness]');if(readiness){const openDialog=readiness.dataset.readinessDialog==='true';selectedReadiness=readiness.dataset.readiness;renderReadiness();if(openDialog){const item=(snapshot.readiness || []).find(row=>row.id===selectedReadiness);if(item){$('dialog-title').textContent='Detail kesiapan · '+item.label;$('dialog-body').innerHTML=readinessDetail(item);$('dialog').showModal();}}}
    const delivery=event.target.closest('[data-delivery]');if(delivery){selectedDemand=delivery.dataset.delivery;renderDemand();}
    const group=event.target.closest('[data-group]');if(group){const key=group.dataset.group;expanded.has(key)?expanded.delete(key):expanded.add(key);renderDemand();}
  });
  root.addEventListener('change',event=>{if(event.target.id==='ppw-demand-type'){context.filters.demandType=event.target.value;persistQuery();renderDemand();}});
  $('filters').addEventListener('submit',event=>{event.preventDefault();if(busy)return;persistQuery();load('filter');});
  $('scenario').addEventListener('change',()=>{if(analysisPage){persistQuery();load('scenario');}else if($('scenario').value)location.assign(path('L04',{scenario:$('scenario').value}));});
  $('dialog-close').addEventListener('click',()=>$('dialog').close());
  $('dialog').addEventListener('close',()=>{if(context.page.id==='L02')Array.from(root.querySelectorAll('[data-readiness-dialog]')).find(button=>button.dataset.readiness===selectedReadiness)?.focus({preventScroll:true});});
  window.addEventListener('popstate',()=>{const values=Object.fromEntries(new URLSearchParams(location.search));if(!values.month)values.month=defaultMonth;context.filters={...values};for(const key of filterKeys){const field=$('filters').elements.namedItem(key);if(field)field.value=values[key] || '';}if(context.page.implemented)load('filter');});
  for(const key of filterKeys){const field=$('filters').elements.namedItem(key);if(field && context.filters[key]){if(field.tagName==='SELECT' && ![...field.options].some(option=>option.value===context.filters[key]))field.insertAdjacentHTML('beforeend','<option value="'+escape(context.filters[key])+'">'+escape(context.filters[key])+'</option>');field.value=context.filters[key];}}
  actions();navigation();if(context.page.implemented)load('initial');else renderFuture();
})();
