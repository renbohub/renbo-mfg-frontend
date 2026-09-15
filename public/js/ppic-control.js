(() => {
  'use strict';
  const root=document.getElementById('ppic-control');if(!root)return;
  const $=id=>document.getElementById(id),tabs=[...document.querySelectorAll('[data-control-view]')];
  const names=Object.fromEntries(tabs.map(tab=>[tab.dataset.controlView,tab.textContent.trim()]));
  let view=Object.hasOwn(names,root.dataset.initialView)?root.dataset.initialView:'customer',payload=null,scope='plan',page=1,serial=0,loading=false;
  const PAGE_SIZE=50;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const known=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const number=value=>known(value)?Number(value).toLocaleString('id-ID',{maximumFractionDigits:3}):'—';
  const statuses={UNLINKED:'Belum terhubung',UNVERIFIED:'Belum terverifikasi',UNAVAILABLE:'Belum tersedia',PARTIAL:'Terpenuhi sebagian',FULFILLED:'Terpenuhi',COMPLETE:'Selesai',COMPLETED:'Selesai',PENDING:'Menunggu aktual',PLANNED:'Terencana',SHORTAGE:'Kurang',OVER_CAPACITY:'Melebihi kapasitas',LATE:'Terlambat',ON_TRACK:'Sesuai rencana',VERIFIED:'Terverifikasi',NO_RELEASE:'Belum dirilis',RECOVERY_REQUIRED:'Perlu recovery'};
  const statusLabel=value=>statuses[value]||value||'—';
  const tone=value=>['FULFILLED','COMPLETE','COMPLETED','ON_TRACK','VERIFIED'].includes(value)?'is-good':['SHORTAGE','OVER_CAPACITY','LATE','RECOVERY_REQUIRED'].includes(value)?'is-bad':['PARTIAL','PENDING','UNLINKED','UNVERIFIED'].includes(value)?'is-attention':'';
  const defaults=[{key:'date',label:'Tanggal',type:'date'},{key:'partCode',label:'Part Code'},{key:'partNumber',label:'Part Number'},{key:'plannedQty',label:'Qty plan',type:'number'},{key:'actualQty',label:'Qty aktual',type:'number'},{key:'uomCode',label:'UOM'},{key:'status',label:'Status',type:'status'},{key:'issue',label:'Catatan'}];
  const actualDefaults=[{key:'date',label:'Tanggal',type:'date'},{key:'sourceNumber',label:'Dokumen'},{key:'partCode',label:'Part Code'},{key:'partNumber',label:'Part Number'},{key:'partnerCode',label:'Partner'},{key:'machineCode',label:'Mesin'},{key:'actualQty',label:'Qty aktual',type:'number'},{key:'uomCode',label:'UOM'},{key:'status',label:'Status',type:'status'},{key:'issue',label:'Keterkaitan rencana'}];
  function safeHref(value){
    if(typeof value!=='string'||!value.startsWith('/modules/')||/[\\\u0000-\u001f]/.test(value))return null;
    const url=new URL(value,location.href);return url.origin===new URL(location.href).origin?url.pathname+url.search+url.hash:null;
  }
  function cell(row,column){
    const value=row[column.key],type=column.type;
    if(column.key==='status'||type==='status')return '<span class="ppic-sheet-pill '+tone(value)+'">'+esc(statusLabel(value))+'</span>';
    if(column.key==='utilizationPct')return known(value)?'<span class="ppic-sheet-pill '+(Number(value)>=100?'is-bad':Number(value)>=80?'is-attention':'is-good')+'">'+esc(number(value))+'%</span>':'—';
    if(column.key==='issue')return '<span class="ppic-sheet-note" title="'+esc(value||'')+'">'+esc(value||'—')+'</span>';
    if(column.key==='sourceNumber'||type==='link'){
      if(row.references?.length)return row.references.map(reference=>{
        const href=safeHref(reference.href),label=reference.number||'Sumber',detail=[reference.date,known(reference.quantity)?number(reference.quantity)+' '+(row.uomCode||''):null].filter(Boolean).join(' · ');
        return href?'<a href="'+esc(href)+'" title="'+esc(detail)+'">'+esc(label)+' ↗</a>':esc(label);
      }).join('<br>');
      const href=safeHref(row.sourceHref);return href&&value?'<a href="'+esc(href)+'">'+esc(value)+' ↗</a>':esc(value||'—');
    }
    if(['number','qty','percent','percentage','hours'].includes(type))return esc(number(value))+(known(value)&&['percent','percentage'].includes(type)?'%':'');
    if(type==='date')return esc(value?String(value).slice(0,10):'—');
    return esc(Array.isArray(value)?value.join(' · '):value??'—');
  }
  function updateUrl(){
    const url=new URL(location.href);url.searchParams.set('view',view);url.searchParams.set('month',$('control-month').value);history.replaceState(null,'',url);
    $('control-release-link').href='/modules/planning-ppic/released?month='+encodeURIComponent($('control-month').value);
  }
  function sourceRows(){return scope==='actual'?(payload?.actualItems||[]):(payload?.items||[]);}
  function fillFilters(){
    const previous=$('control-filter').value,values=[...new Set(sourceRows().map(row=>row.status).filter(Boolean))].sort();
    $('control-filter').innerHTML='<option value="">Semua status</option>'+values.map(value=>'<option value="'+esc(value)+'">'+esc(statusLabel(value))+'</option>').join('');
    $('control-filter').value=values.includes(previous)?previous:'';
  }
  function render(){
    tabs.forEach(tab=>{const active=tab.dataset.controlView===view;tab.setAttribute('aria-selected',String(active));tab.setAttribute('tabindex',active?'0':'-1');});
    $('control-panel').setAttribute('aria-labelledby','control-tab-'+view);
    $('control-plan').setAttribute('aria-pressed',String(scope==='plan'));$('control-actual').setAttribute('aria-pressed',String(scope==='actual'));
    const columns=(scope==='actual'?payload?.actualColumns:payload?.columns)|| (scope==='actual'?actualDefaults:defaults);
    const search=$('control-search').value.trim().toLowerCase(),filter=$('control-filter').value;
    const rows=sourceRows().filter(row=>(!filter||row.status===filter)&&(!search||Object.values(row).flat().join(' ').toLowerCase().includes(search)));
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages);
    $('control-head').innerHTML='<tr>'+columns.map((column,index)=>'<th scope="col"><small>'+String.fromCharCode(65+index)+'</small>'+esc(column.label)+'</th>').join('')+'</tr>';
    const empty=loading?'Memuat data…':!payload?'Data belum tersedia.':payload.status==='DRAFT'?'Belum ada PPIC Released untuk bulan ini.':search||filter?'Tidak ada data sesuai filter.':scope==='actual'?'Belum ada aktivitas aktual pada sumber bulan ini.':'Tidak ada baris rencana untuk tampilan ini.';
    $('control-body').innerHTML=rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(row=>'<tr>'+columns.map(column=>'<td class="'+(['number','qty','percent','percentage','hours'].includes(column.type)?'is-number':column.key==='issue'||column.key==='recoveryAction'?'is-note':'')+'">'+cell(row,column)+'</td>').join('')+'</tr>').join('')||'<tr><td class="ppic-sheet-empty" colspan="'+columns.length+'">'+esc(empty)+'</td></tr>';
    $('control-count').textContent=number(rows.length)+' baris';$('control-page').textContent=page+' / '+pages;$('control-prev').disabled=page<=1;$('control-next').disabled=page>=pages;
    $('control-basis').textContent=scope==='actual'?(payload?.actualBasis||'Aktivitas bulan terpilih dan dokumen terkait release, termasuk penyelesaian di luar bulan. Baris tanpa referensi release belum dihitung sebagai pemenuhan rencana.'):(payload?.basis||'Rencana dari PPIC Released pada bulan terpilih.');
  }
  function summary(){
    const data=payload?.summary;
    $('control-summary').hidden=!data||payload.status!=='LOCKED';
    if(!data)return;
    $('control-summary').innerHTML=[['Baris rencana',data.rowCount],['Aktual terverifikasi',data.verifiedRows],['Aktual belum terhubung',data.unlinkedRows],['Dokumen aktivitas',data.actualEventCount]].map(([label,value])=>'<div><strong>'+number(value)+'</strong><small>'+esc(label)+'</small></div>').join('');
  }
  async function load(quiet=false){
    const month=$('control-month').value,selectedView=view,request=++serial;loading=true;$('control-refresh').disabled=true;$('control-table').setAttribute('aria-busy','true');
    if(!quiet){payload=null;$('control-summary').hidden=true;$('control-message').textContent='Memuat rencana dan aktual…';$('control-status').textContent='Memuat status bulan…';render();}
    $('control-message').classList.remove('is-error');
    try{
      if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('Pilih bulan monitoring yang valid.');
      updateUrl();
      const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';
      const response=await fetch('/modules/api/planning-ppic/preparation/control?'+new URLSearchParams({month,view:selectedView}),{headers:{...(token?{Authorization:'Bearer '+token}:{})},cache:'no-store',signal:AbortSignal.timeout(125000)});
      const data=await response.json();if(request!==serial)return;
      if(!response.ok)throw Error(data.message||'Data monitoring gagal dimuat.');
      if(data.month!==month||data.view!==selectedView)throw Error('Periode atau tampilan respons tidak sesuai permintaan. Perbarui data.');
      payload=data;loading=false;fillFilters();summary();render();
      $('control-status').textContent=(data.status==='LOCKED'?'RELEASED':'DRAFT')+' · '+month;
      $('control-message').textContent=data.status==='DRAFT'?'Belum ada rencana yang dirilis untuk bulan '+month+'. Siapkan dan lock rencana melalui PPIC Plan Lab.':(data.warnings||[]).join(' · ')||'Rencana release dan sumber aktual sudah diperbarui.';
    }catch(error){
      if(request!==serial)return;payload=null;loading=false;$('control-summary').hidden=true;$('control-status').textContent='Data belum tersedia';$('control-message').textContent=error.message;$('control-message').classList.add('is-error');fillFilters();render();
    }finally{if(request===serial){loading=false;$('control-refresh').disabled=false;$('control-table').setAttribute('aria-busy','false');}}
  }
  function selectView(key){if(!Object.hasOwn(names,key))return;view=key;scope='plan';page=1;$('control-filter').value='';render();load();}
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectView(tab.dataset.controlView));
    tab.addEventListener('keydown',event=>{
      let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
      event.preventDefault();tabs[next].focus();selectView(tabs[next].dataset.controlView);
    });
  });
  $('control-month').addEventListener('change',()=>{page=1;load();});$('control-refresh').addEventListener('click',()=>load());
  $('control-search').addEventListener('input',()=>{page=1;render();});$('control-filter').addEventListener('change',()=>{page=1;render();});
  $('control-reset').addEventListener('click',()=>{$('control-search').value='';$('control-filter').value='';page=1;render();});
  $('control-prev').addEventListener('click',()=>{page--;render();});$('control-next').addEventListener('click',()=>{page++;render();});
  for(const key of ['plan','actual'])$('control-'+key).addEventListener('click',()=>{scope=key;page=1;fillFilters();render();});
  const refresh=()=>{if(!loading&&document.visibilityState!=='hidden')load(true);};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,15000);
  window.addEventListener('popstate',()=>{const url=new URL(location.href);$('control-month').value=url.searchParams.get('month')||$('control-month').value;selectView(url.searchParams.get('view')||'customer');});
  load();
})();
