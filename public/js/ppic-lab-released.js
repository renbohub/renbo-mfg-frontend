(() => {
  'use strict';
  const root=document.querySelector('[data-release-view]');if(!root)return;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(value):'—';
  const fixed=root.dataset.releaseView;
  const scope=root.dataset.releaseScope;
  const tables=window.PPICReleasedTables,daily=window.PpicReleasedDaily?.mount(document);
  const feedback=window.PpicConfirmationFeedback;
  let feedbackLoading=false;
  const titles={monthly:'Monthly Production Plan',mrp:'Material Requirement Plan',daily:'Daily Production Schedule',recovery:'Actual Daily Production Condition Recovery',delivery:'Delivery Customer Planning',vendor:'Delivery / Incoming Vendor Planning','incoming-supplier':'Incoming Supplier Planning','incoming-material':'Incoming Material from Supplier Planning',supplier:'PR Supplier · PPIC'};
  const requested=new URL(location.href).searchParams.get('view')||root.dataset.initialView;
  let view=fixed||(titles[requested]&&requested!=='supplier'?requested:'monthly'),payload=null,recovery=null,page=1,serial=0,recoverySerial=0,loading=false,recoveryLoading=false,recoveryError='';
  let machineKey='',materialCategory='MATERIAL',actualSerial=0;
  const actualCache=new Map(),actualPending=new Map(),actualErrors=new Map();
  const actualView=()=>fixed?null:({delivery:'customer',vendor:'vendor','incoming-supplier':'supplier','incoming-material':'supplier'})[view];
  const targets={}; // Planning stays in PPIC; operational document links remain on rows.
  const supplierColumns=[['needDate','Tanggal perlu'],['orderDate','Batas order'],['partCode','Part'],['partNumber','Part Number'],['partName','Nama part'],['purchaseGroup','Kategori','category'],['supplierCode','Supplier'],['supplierName','Nama supplier'],['requiredQty','Kebutuhan kotor','qty'],['uomCode','UOM'],['prNumber','PR','pr'],['confirmedEta','ETA terkonfirmasi'],['confirmedQty','Qty confirmed','qty'],['leadTimeDays','Lead time (hari)','qty'],['moq','MOQ','qty'],['confirmedAllocations','Alokasi partner','allocations']];
  const columns={
    monthly:[['partCode','Part'],['partNumber','Part Number'],['partName','Nama part'],['parentPartCode','FG sumber'],['processCode','Proses'],['machineCode','Mesin'],['quantity','Qty bulan','qty'],['uomCode','UOM']],
    daily:[['date','Tanggal'],['machineCode','Mesin'],['partCode','Part'],['partNumber','Part Number'],['processCode','Proses'],['quantity','Qty','qty'],['uomCode','UOM'],['segments','Slot waktu','slots'],['parentPartCode','FG sumber']],
    supplier:supplierColumns,mrp:supplierColumns,
    'incoming-supplier':supplierColumns.filter(([key])=>key!=='purchaseGroup'),
    'incoming-material':[...supplierColumns.filter(([key])=>key!=='purchaseGroup'),['materialType','Jenis material'],['materialWidth','Lebar','qty'],['materialThickness','Tebal','qty']],
    vendor:[['dispatchDate','Kirim vendor'],['receiptDate','Terima kembali'],['vendorCode','Vendor'],['vendorName','Nama vendor'],['partCode','Part'],['partNumber','Part Number'],['processCode','Proses'],['quantity','Qty','qty'],['uomCode','UOM'],['prNumber','PR','pr']],
    delivery:[['date','Tanggal delivery'],['customerCode','Customer'],['partCode','Part'],['partNumber','Part Number'],['partName','Nama part'],['quantity','Qty','qty'],['uomCode','UOM']],
    recovery:[['date','Tanggal'],['partCode','Part'],['partNumber','Part Number'],['machineCode','Mesin'],['processCode','Proses'],['plannedQty','Qty plan','qty'],['actualQty','Qty aktual terverifikasi','qty'],['recoveryQty','Qty recovery','qty'],['uomCode','UOM'],['status','Kondisi'],['issue','Tindak lanjut','note'],['sourceNumber','Sumber','source']],
    actual:[['date','Tanggal'],['partCode','Part'],['partNumber','Part Number'],['machineCode','Mesin'],['processCode','Proses'],['actualQty','Qty aktual','qty'],['uomCode','UOM'],['status','Kondisi'],['issue','Keterkaitan plan','note'],['sourceNumber','Sumber','source']]
  };
  const basis={
    monthly:'Jumlah produksi per proses dan mesin dari rencana PPIC yang sudah Confirm Release. Kolom tanggal menunjukkan distribusi qty bulan tersebut.',
    daily:'Jadwal harian resmi dan slot mesin dari rencana PPIC yang sudah Confirm Release. Jam mengikuti jam lokal pabrik.',
    mrp:'Kebutuhan kotor material dan purchase part dari BOM saat release. Stok material dan PO terbuka belum dinetkan; Purchasing meninjau qty final sebelum approval PR.',
    supplier:'PR berstatus Draft. Purchasing meninjau stok, PO terbuka, MOQ, konversi dan harga sebelum approval.',
    'incoming-supplier':'Rencana kedatangan purchase part dari supplier. Tanggal perlu menjadi target kedatangan, sesuai kebutuhan PPIC saat release.',
    'incoming-material':'Rencana kedatangan material RAW dari supplier. Tanggal perlu menjadi target kedatangan; jenis, lebar dan tebal mengikuti material saat release.',
    vendor:'Jadwal pengiriman proses ke vendor dan penerimaan kembali dari rencana PPIC yang sudah Confirm Release. Dokumen PR jasa vendor mengikuti versi release yang sama.',
    delivery:'Komitmen rencana delivery per customer dan part dari PPIC, termasuk kebutuhan forecast. Pelaksanaan shipment mengikuti Sales Order.',
    recovery:'Aktual produksi dibandingkan dengan jadwal release. Aktivitas yang belum terhubung ke rencana ditampilkan terpisah untuk ditelusuri.'
  };
  titles['material-plan']='Material Requirement · Warehouse';titles['incoming-vendor']='Vendor Incoming Plan';
  columns['material-plan']=supplierColumns;columns['incoming-vendor']=columns.vendor;
  basis['material-plan']='Kebutuhan material dan purchase part dari PPIC Released. Permintaan persiapan material per jadwal tersedia di Material Preparation Queue.';
  basis['incoming-vendor']='Rencana kedatangan hasil proses vendor dari PPIC Released. Penerimaan aktual dicatat melalui Incoming from Vendor.';
  const projection=()=>['mrp','material-plan','incoming-supplier','incoming-material'].includes(view)?'supplier':view==='incoming-vendor'?'vendor':view;
  const time=minute=>Number.isFinite(Number(minute))?new Date(Number(minute)*60000).toISOString().slice(11,16):'—';
  const letter=index=>index<26?String.fromCharCode(65+index):String.fromCharCode(64+Math.floor(index/26))+String.fromCharCode(65+index%26);
  function syncView(){
    $('release-view-title').textContent=titles[view];
    $('release-basis').textContent=(view==='recovery'&&recovery?.basis?String(recovery.basis):basis[view])+(view==='recovery'&&$('release-recovery-scope').value==='actual'?' Aktivitas bulan terpilih serta dokumen di luar bulan yang terhubung ke release ini.':'');
    $('release-category-label').hidden=view!=='supplier';
    $('release-recovery-label').hidden=view!=='recovery';
    if(!fixed)$('release-panel').setAttribute('aria-labelledby','release-tab-'+view);
    document.querySelectorAll('[data-release-tab]').forEach(button=>{const active=button.dataset.releaseTab===view;button.setAttribute('aria-selected',String(active));button.setAttribute('tabindex',active?'0':'-1');});
    const executionTargets={daily:['Daily Production Schedule','/modules/production/daily-production-schedules'],'material-plan':['Material Preparation Queue','/modules/inventory/material-issues'],'incoming-vendor':['Incoming from Vendor','/modules/incoming/incoming-from-vendor'],vendor:['Prepare Delivery to Vendor','/modules/production/prepare-delivery-vendor']};
    if(scope?.startsWith('purchasing/'))executionTargets[view]=['Purchase Requisition','/modules/purchasing/purchase-requisitions'];
    const target=fixed?executionTargets[view]:(targets[view]||targets[projection()]),link=$('release-department-link');link.hidden=!target;
    if(target){link.textContent='Buka '+target[0]+' ↗';link.href=target[1]+(fixed&&view==='daily'?'?date='+encodeURIComponent($('release-month').value+'-01'):'?month='+encodeURIComponent($('release-month').value));}
    const url=new URL(location.href);url.searchParams.set('month',$('release-month').value);if(!fixed)url.searchParams.set('view',view);history.replaceState(null,'',url);
  }
  function showEmpty(text){$('release-data').hidden=true;$('release-empty').hidden=false;$('release-empty').textContent=text;}
  function documents(){
    const type=projection()==='supplier'?'PR_SUPPLIER':view==='vendor'?'PR_VENDOR':null;
    const group=view==='incoming-supplier'?'PURCHASE_PART':view==='incoming-material'?'MATERIAL':null;
    const numbers=group?new Set((payload?.views?.supplier||[]).filter(row=>row.purchaseGroup===group).map(row=>row.prNumber)):null;
    const docs=type?(payload?.documents||[]).filter(doc=>doc.type===type&&(!numbers||numbers.has(doc.number))):[];
    $('release-documents').hidden=!docs.length;
    $('release-document-links').innerHTML=docs.map(doc=>'<a href="/modules/purchasing/purchase-requisitions/'+encodeURIComponent(doc.number)+'">'+esc(doc.number)+'</a>').join('');
  }
  function cell(row,key,kind){
    if(kind==='allocations'){const legs=row.confirmedAllocations||[];return legs.length?'<span title="'+esc(legs.map(c=>[c.partnerCode,fmt(c.qty)+' '+(row.uomCode||''),'ETA '+String(c.eta||'').slice(0,10),'LT '+fmt(c.leadTimeDays)+' hari','MOQ '+fmt(c.moq)].join(' · ')).join('; '))+'">'+esc(legs.length+' alokasi · '+[...new Set(legs.map(c=>c.partnerCode))].join(', '))+'</span>':'—';}
    if(key==='supplierCode'&&row.confirmedSuppliers?.length)return esc(row.confirmedSuppliers.join(', '));
    if(key==='partCode')return esc(row[key]??'—')+(feedback?.marker(row,payload?.feedback,projection())||'');
    if(['date','needDate','dispatchDate','receiptDate'].includes(key)){const changes=feedback?.changesFor(row,payload?.feedback,projection())||[];return '<span'+(changes.length?' title="'+esc(changes.map(feedback.changeText).join('; '))+'"':'')+'>'+esc(row[key]??'—')+'</span>';}
    if(kind==='fulfillment')return tables.fulfillmentStatus(row);
    if(kind==='pr')return row.prNumber?'<a href="/modules/purchasing/purchase-requisitions/'+encodeURIComponent(row.prNumber)+'">'+esc(row.prNumber)+'</a>':'—';
    if(kind==='source'){
      const sourceLink=(number,href)=>number&&typeof href==='string'&&/^\/modules\//.test(href)&&!href.includes('\\')?'<a href="'+esc(href)+'">'+esc(number)+'</a>':esc(number||'—');
      if(row.references?.length){const refs=new Map(row.references.map(ref=>[JSON.stringify([ref.number,ref.href]),ref]));return [...refs.values()].map(ref=>sourceLink(ref.number,ref.href)).join('<br>');}
      return sourceLink(row.sourceNumber,row.sourceHref);
    }
    if(kind==='slots')return (row.segments||[]).map(s=>esc(time(s.start)+'–'+time(s.end))).join('<br>')||'—';
    if(kind==='day')return fmt(row.days?.[key]||0);
    if(kind==='qty'||kind==='number'||kind==='percent')return fmt(row[key])+(kind==='percent'&&row[key]!=null?'%':'');
    if(kind==='category')return ({MATERIAL:'Material',PURCHASE_PART:'Purchase part'})[row[key]]||esc(row[key]||'Belum terklasifikasi');
    return esc(row[key]??'—');
  }
  function render(){
    syncView();documents();
    feedback?.render($('release-confirmation-feedback'),payload,{sync:!fixed});
    daily?.update({active:view==='daily',month:$('release-month').value,payload,loading});
    $('release-subtabs').hidden=true;$('release-monthly-summary').hidden=true;
    if(view==='daily'&&daily){$('release-data').hidden=true;$('release-empty').hidden=true;return;}
    if(!payload||payload.status!=='LOCKED')return;
    if(view==='recovery'&&!recovery){showEmpty(recoveryError||'Memuat kondisi aktual produksi…');return;}
    const actual=view==='recovery'&&$('release-recovery-scope').value==='actual';
    let items=view==='recovery'?(actual?recovery.actualItems:recovery.items)||[]:fixed?payload.items||[]:payload.views?.[projection()]||[];
    if(view==='incoming-supplier')items=items.filter(row=>row.purchaseGroup==='PURCHASE_PART');
    if(view==='incoming-material')items=items.filter(row=>row.purchaseGroup==='MATERIAL');
    let monthly=null;
    if(view==='monthly'&&tables){monthly=tables.monthlyModel(payload,machineKey);machineKey=monthly.machine?.key||'';items=monthly.rows;$('release-subtabs').hidden=false;$('release-subtabs').innerHTML=tables.machineTabs(monthly.options,machineKey);}
    if(view==='mrp'&&tables){$('release-subtabs').hidden=false;$('release-subtabs').innerHTML=tables.categoryTabs(materialCategory);}
    if(actualView()&&tables)items=tables.fulfillmentRows(items,actualCache.get(actualView()));
    const term=$('release-search').value.trim().toLowerCase(),category=view==='mrp'?materialCategory:view==='supplier'?$('release-category').value:'';
    let rows=items.filter(row=>(!category||row.purchaseGroup===category)&&(!term||Object.values(row).some(value=>typeof value!=='object'&&String(value??'').toLowerCase().includes(term))));
    const grouped=tables&&['mrp','supplier','delivery','vendor','incoming-supplier','incoming-material'].includes(view);
    if(grouped)rows=tables.sortGrouped(rows,view);
    const pages=Math.max(1,Math.ceil(rows.length/50));page=Math.max(1,Math.min(page,pages));
    const month=payload.month,days=view==='monthly'?Array.from({length:new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0')):[];
    const recoveryColumns=view==='recovery'?(actual?recovery.actualColumns:recovery.columns):null;
    let baseColumns=recoveryColumns?.length?recoveryColumns.map(c=>[c.key,c.label,c.key==='sourceNumber'?'source':c.key==='issue'?'note':c.type]):columns[actual?'actual':view];
    if(actualView()&&tables){baseColumns=baseColumns.filter(([key])=>!['quantity','requiredQty'].includes(key));const uom=baseColumns.findIndex(([key])=>key==='uomCode');baseColumns.splice(uom<0?baseColumns.length:uom,0,['plannedQty','Qty plan','qty'],['actualQty','Qty actual','qty'],['remainingQty','Remaining','qty']);baseColumns.push(['fulfillmentStatus','Status pemenuhan','fulfillment']);}
    const visibleColumns=[...baseColumns,...days.map(date=>[date,date.slice(-2),'day'])];
    $('release-head').innerHTML='<tr>'+visibleColumns.map(([,label],index)=>'<th scope="col"><span class="lab-release-col-letter" aria-hidden="true">'+letter(index)+'</span>'+esc(label)+'</th>').join('')+'</tr>';
    $('release-body').innerHTML=rows.slice((page-1)*50,page*50).map(row=>'<tr>'+visibleColumns.map(([key,,kind])=>'<td class="'+(['qty','number','percent','day'].includes(kind)?'is-numeric':kind==='note'?'is-note':'')+'">'+cell(row,key,kind)+'</td>').join('')+'</tr>').join('')||'<tr><td class="lab-release-empty-cell" colspan="'+visibleColumns.length+'">'+(items.length?'Tidak ada data sesuai pencarian atau kategori.':'Tidak ada data '+esc(actual?'aktivitas aktual':titles[view])+' pada release bulan ini.')+'</td></tr>';
    if(grouped&&rows.length)$('release-body').innerHTML=tables.groupRows(rows.slice((page-1)*50,page*50),view,visibleColumns,cell);
    if(monthly){const table=tables.monthlyTable(monthly,rows.slice((page-1)*50,page*50),row=>feedback?.marker(row,payload?.feedback,'monthly')||'');$('release-head').innerHTML=table.head;$('release-body').innerHTML=table.body;$('release-monthly-summary').innerHTML=tables.monthlySummary(monthly);$('release-monthly-summary').hidden=!monthly.machine;}
    $('release-count').textContent=rows.length+' baris'+(rows.length!==items.length?' / '+items.length:'');$('release-page').textContent=page+' / '+pages;$('release-prev').disabled=page<=1;$('release-next').disabled=page>=pages;
    $('release-data').hidden=false;$('release-empty').hidden=true;
    if(view==='recovery'&&recoveryError){$('release-message').classList.add('is-error');$('release-message').textContent=recoveryError;}
  }
  async function get(path,body){
    const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';
    const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(190000)});
    const data=await response.json();if(!response.ok)throw Error(data.message||'Data gagal dimuat.');return data;
  }
  function releasedMessage(){
    $('release-message').classList.remove('is-error');
    $('release-message').textContent='LOCKED · Semua departemen memakai versi release yang sama.';
    if(view==='recovery'&&recovery){const notes=recovery.warnings||[];$('release-message').textContent='Aktual diperbarui '+(recovery.asOf?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(recovery.asOf))+' WIB':'dari sumber produksi')+(notes.length?' · '+notes.join(' · '):'');}
    if(actualView()){
      const control=actualCache.get(actualView()),error=actualErrors.get(actualView());
      if(error){$('release-message').classList.add('is-error');$('release-message').textContent=error;}
      else if(control)$('release-message').textContent='LOCKED · Aktual diperbarui '+(control.asOf?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(control.asOf))+' WIB':'dari transaksi')+' · '+(control.warnings?.join(' · ')||'Qty actual mengikuti transaksi terhubung; — berarti belum terverifikasi.');
      else $('release-message').textContent='LOCKED · Memuat aktual pemenuhan…';
    }
  }
  async function loadActual(){
    const key=actualView();if(!key||payload?.status!=='LOCKED'||actualPending.has(key))return;
    const month=payload.month,releaseId=payload.id,request=actualSerial;actualPending.set(key,request);actualErrors.delete(key);
    try{
      const data=await get('/modules/api/planning-ppic/preparation/control?'+new URLSearchParams({month,view:key}));
      if(request!==actualSerial||month!==$('release-month').value)return;
      if(data.status!=='LOCKED'||data.month!==month||data.releaseId!==releaseId)throw Error('Versi aktual tidak sesuai release bulan terpilih.');
      actualCache.set(key,data);
    }catch(error){if(request===actualSerial){actualCache.delete(key);actualErrors.set(key,'Aktual pemenuhan gagal dimuat: '+error.message+' Qty plan tetap dari release; aktual belum tersedia.');}}
    finally{if(request===actualSerial){actualPending.delete(key);if(actualView()===key){render();releasedMessage();}}}
  }
  async function loadRecovery(){
    if(payload?.status!=='LOCKED')return;
    const request=++recoverySerial,month=$('release-month').value;recoveryLoading=true;recoveryError='';
    if(view==='recovery'&&!recovery){showEmpty('Memuat kondisi aktual produksi…');$('release-message').classList.remove('is-error');$('release-message').textContent='Memuat aktual produksi untuk dibandingkan dengan PPIC Released…';}
    try{
      const data=await get('/modules/api/planning-ppic/preparation/control?'+new URLSearchParams({month,view:'recovery'}));
      if(request!==recoverySerial||month!==$('release-month').value)return;
      if(data.status!=='LOCKED')throw Error('Status release berubah. Perbarui data bulan ini.');
      recovery=data;if(view==='recovery'){releasedMessage();render();}
    }catch(error){if(request===recoverySerial){recovery=null;recoveryError='Aktual produksi gagal dimuat: '+error.message;if(view==='recovery'){$('release-message').classList.add('is-error');$('release-message').textContent=recoveryError;render();}}}
    finally{if(request===recoverySerial)recoveryLoading=false;}
  }
  async function load(){
    const month=$('release-month').value,request=++serial;loading=true;$('release-refresh').disabled=true;
    recoverySerial++;recoveryLoading=false;recovery=null;recoveryError='';payload=null;
    feedback?.render($('release-confirmation-feedback'),null);
    actualSerial++;actualCache.clear();actualPending.clear();actualErrors.clear();
    $('release-info').hidden=true;$('release-documents').hidden=true;$('release-head').innerHTML='';$('release-body').innerHTML='';
    showEmpty('Menyiapkan data bulan terpilih…');syncView();
    daily?.update({active:view==='daily',month,payload:null,loading:true});
    $('release-message').classList.remove('is-error');$('release-message').textContent='Memuat PPIC Released Data…';
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){loading=false;$('release-refresh').disabled=false;$('release-message').textContent='Pilih bulan yang valid.';showEmpty('Pilih bulan untuk melihat rencana resmi.');daily?.update({active:view==='daily',month,payload:null,loading:false,error:'Pilih bulan yang valid.'});return;}
    for(const link of document.querySelectorAll('.module-subnav a,.ppic-section-nav a')){const target=new URL(link.href,location.href);if(['/modules/planning-ppic/preparation','/modules/planning-ppic/released','/modules/planning-ppic/control',...Object.values(targets).map(item=>item[1])].includes(target.pathname)){target.searchParams.set('month',month);link.href=target.pathname+target.search;}}
    try{
      const data=await get('/modules/api/planning-ppic/preparation/released?'+new URLSearchParams({month,...(fixed?{view:fixed,...(scope?{scope}:{})}:{})}));if(request!==serial)return;
      payload=data;page=1;
      if(data.status!=='LOCKED'){
        $('release-message').innerHTML='Bulan '+esc(month)+' belum dirilis. '+(!fixed?'<a href="/modules/planning-ppic/preparation?month='+encodeURIComponent(month)+'">Buka PPIC Plan Lab →</a>':'Data muncul otomatis setelah PPIC melakukan konfirmasi ETA, review, dan Confirm Release.');
        showEmpty('Rencana resmi belum tersedia untuk bulan '+month+'. Pilih bulan lain atau selesaikan konfirmasi ETA, review, dan Confirm Release di PPIC Plan Lab.');return;
      }
      releasedMessage();$('release-info').hidden=false;
      $('release-info').innerHTML='<span class="lab-release-badge">LOCKED</span><strong>'+esc(data.name||month)+'</strong><span>Revisi '+esc(data.revision)+'</span><span>Dirilis '+esc(data.releasedBy)+' · '+esc(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.releasedAt)))+' WIB</span>';
      render();if(view==='recovery')await loadRecovery();if(actualView())await loadActual();
    }catch(error){if(request===serial){payload=null;$('release-message').classList.add('is-error');$('release-message').textContent=error.message;showEmpty('Sumber release gagal dimuat. Perbarui data untuk mencoba lagi.');}}
    finally{if(request===serial){loading=false;$('release-refresh').disabled=false;daily?.update({active:view==='daily',month,payload,loading:false,error:payload?null:$('release-message').textContent});}}
  }
  function selectView(next){
    view=next;page=1;render();
    if(payload?.status==='LOCKED'){releasedMessage();if(view==='recovery'&&!recovery&&!recoveryLoading)loadRecovery();}
    if(actualView()&&!actualCache.has(actualView()))loadActual();
  }
  async function refreshFeedback(sync=false){
    if(loading||feedbackLoading||payload?.status!=='LOCKED')return;
    const month=$('release-month').value,request=serial,releaseId=payload.id;feedbackLoading=true;
    const button=$('release-confirmation-feedback')?.querySelector?.('[data-ppic-confirmation-sync]');if(button)button.disabled=true;
    try{
      if(sync)await get('/modules/api/planning-ppic/preparation/confirmations/sync',{month});
      const data=await get('/modules/api/planning-ppic/preparation/released?'+new URLSearchParams({month,...(fixed?{view:fixed,...(scope?{scope}:{})}:{})}));
      if(request!==serial||month!==$('release-month').value)return;
      if(data.status!=='LOCKED'||data.id!==releaseId||data.month!==month)throw Error('Versi release berubah. Perbarui data bulan ini.');
      if(sync||JSON.stringify(data.feedback||{})!==JSON.stringify(payload.feedback||{})){
        payload=data;actualSerial++;actualCache.clear();actualPending.clear();actualErrors.clear();recovery=null;render();releasedMessage();
        if(view==='recovery')loadRecovery();if(actualView())loadActual();
      }
      if(sync){$('release-message').textContent='Rekomendasi departemen dan ETA terbaru sudah disinkronkan.';feedback?.notify({month,source:'release-sync'});}
    }catch(error){if(request===serial){$('release-message').classList.add('is-error');$('release-message').textContent='Pembaruan ETA tertunda: '+error.message;}}
    finally{feedbackLoading=false;if(button)button.disabled=false;}
  }
  $('release-confirmation-feedback')?.addEventListener('click',event=>{if(event.target.closest('[data-ppic-confirmation-sync]'))refreshFeedback(true);});
  window.addEventListener('ppic:confirmation-changed',event=>{if(!event.detail?.month||event.detail.month===$('release-month').value)refreshFeedback(false);});
  $('release-month').addEventListener('change',load);$('release-refresh').addEventListener('click',load);
  for(const [id,event] of [['release-search','input'],['release-category','change'],['release-recovery-scope','change']])$(id).addEventListener(event,()=>{page=1;render();});
  $('release-prev').addEventListener('click',()=>{page--;render();});$('release-next').addEventListener('click',()=>{page++;render();});
  function selectDetail(button){if(button.dataset.releaseMachine!==undefined)machineKey=button.dataset.releaseMachine;if(button.dataset.releaseMaterial)materialCategory=button.dataset.releaseMaterial;page=1;render();}
  $('release-subtabs').addEventListener('click',event=>{const button=event.target.closest('[data-release-machine],[data-release-material]');if(button)selectDetail(button);});
  $('release-subtabs').addEventListener('keydown',event=>{const tabs=[...$('release-subtabs').querySelectorAll('button[role="tab"]')],index=tabs.indexOf(event.target);if(index<0)return;const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next===null)return;event.preventDefault();selectDetail(tabs[next]);$('release-subtabs').querySelectorAll('button[role="tab"]')[next]?.focus();});
  const tabs=Array.from(document.querySelectorAll('[data-release-tab]'));
  tabs.forEach((button,index)=>{
    button.addEventListener('click',()=>selectView(button.dataset.releaseTab));
    button.addEventListener('keydown',event=>{const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next===null)return;event.preventDefault();tabs[next].focus();selectView(tabs[next].dataset.releaseTab);});
  });
  const refreshPending=()=>{if(loading||document.visibilityState!=='visible')return;if(payload?.status!=='LOCKED')load();else {if(feedback)refreshFeedback();if(view==='recovery'&&!recoveryLoading)loadRecovery();else if(actualView())loadActual();}};
  window.addEventListener('focus',refreshPending);document.addEventListener('visibilitychange',refreshPending);setInterval(refreshPending,15000);load();
})();
