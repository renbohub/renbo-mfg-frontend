(() => {
  'use strict';
  const $=id=>document.getElementById(id), M=window.PrepWorkbook, T=window.PrepProcessTree;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(n)||0);
  const title={delivery:'Delivery Schedule',production:'Production Schedule',material:'Material Arrival'};
  const hint={delivery:'Jumlah delivery per tanggal · perubahan hanya berlaku dalam draft ini.',production:'Jumlah FG selesai per tanggal · klik dua kali / Enter untuk edit · tempel rentang dari Excel.',material:'Jumlah material tiba per tanggal · isi proyeksi stok awal · pisahkan satuan dan pemilik customer.'};
  let workbook,grid,active='delivery',selected=null,id=null,revision=null,busy=false,dirty=false,result=null,history=[],historyIndex=0,savedJSON=null;
  let adjustmentPopup=null,additionalContext=null,additionalEditor=null;
  let monthState={status:'LOADING'},systemBaseline=null,releaseReview=null,statusRequest=0;
  const feedbackUI=window.PpicConfirmationFeedback;
  let confirmationFeedback=null,remoteSyncPending=false;
  const pendingEta=()=>['CONFIRMING','REVIEW'].includes(monthState.status);
  const locked=()=>monthState.status==='LOCKED'||pendingEta();
  let tree=null,treeKey='',treeRequest=0,treeTimer=null,treeLoading=false,treeError='',expanded=new Set(),bomSync=null,vendorEditor=null;
  const columns=()=>T.columns(workbook.month);
  const derived=()=>{bomSync?.update();const state={month:workbook.month,name:workbook.name,dirty,busy,locked:locked(),loading:treeLoading,error:treeError,feedback:confirmationFeedback,snapshot:treeKey===T.signature(workbook)?tree:null};window.PrepDerivedViews?.update(state);window.PrepDailyPlan?.update(state);window.PrepLabOutlook?.update(state);};
  const treeData=()=>T.rows(workbook,treeKey===T.signature(workbook)?tree:null,treeLoading?'Mengambil child proses dari BOM…':treeError||'Klik Perbarui alokasi untuk memuat proses.');
  async function refreshTree(quiet=false){
    let key=T.signature(workbook),unchanged=false;const request=++treeRequest;
    if(!quiet){treeLoading=true;treeError='';summaries();}
    try {
      const released=locked()?await api('/lab-state?month='+encodeURIComponent(workbook.month)):null;
      let payload=released?released.snapshot:await api('/process-tree','POST',workbook);
      const poContext=await api('/additional-po?month='+encodeURIComponent(workbook.month));
      if(request!==treeRequest||key!==T.signature(workbook))return;
      if(released){
        if(released.month!==workbook.month||!['LOCKED','CONFIRMING','REVIEW'].includes(released.status))throw Error('Versi rencana resmi berubah. Pilih ulang bulan plan.');
        if(quiet&&tree&&JSON.stringify(additionalContext)===JSON.stringify(poContext)&&JSON.stringify(confirmationFeedback)===JSON.stringify(released.feedback||null)){unchanged=true;return;}
        confirmationFeedback=released.feedback||null;monthState.feedbackRevision=confirmationFeedback?.revision||0;
        feedbackUI?.render($('prep-confirmation-feedback'),released);
        if(released.workbook){workbook=M.clone(released.workbook);syncSettings();savedJSON=json();history=[savedJSON];historyIndex=0;key=T.signature(workbook);}
      }
      if(request!==treeRequest||key!==T.signature(workbook))return;
      additionalContext=poContext;
      if(released){const merged=window.PrepAdditionalPo.merge(workbook,payload,poContext);workbook=merged.workbook;payload=merged.snapshot;key=T.signature(workbook);savedJSON=json();history=[savedJSON];historyIndex=0;}else payload.poContext=poContext;
      tree=payload;treeKey=key;
    }catch(error){if(request!==treeRequest||key!==T.signature(workbook))return;tree=null;treeKey='';treeError=error.message;message('Explode BOM belum tersedia: '+error.message,true);}
    finally{if(request===treeRequest&&!unchanged){treeLoading=false;if(key===T.signature(workbook)){const viewport=$('prep-grid').querySelector('.tabulator-tableholder'),scroll=viewport?{left:viewport.scrollLeft,top:viewport.scrollTop}:null;const anchor=selected?{rowId:selected.getRow().getData().id,field:selected.getField()}:null;selected=null;await refreshHolidayHeaders();await grid?.replaceData(treeData());filter();const restored=anchor&&grid?.getRows('active').filter(r=>r.getData()._kind==='FG').flatMap(r=>[r,...(r.isTreeExpanded()?r.getTreeChildren():[])]).find(r=>r.getData().id===anchor.rowId)?.getCell(anchor.field);if(restored){grid.addRange(restored,restored);selectCell(restored);}else{$('prep-cell-address').textContent='—';$('prep-cell-value').value='';$('prep-cell-label').textContent='';$('prep-selection-status').textContent='Siap';}if(viewport&&scroll)viewport.scrollTo(scroll);summaries();controls();}}}
  }
  function columnTitle(column,index,holiday=false){
    const weekday=column.date?['Min','Sen','Sel','Rab','Kam','Jum','Sab'][new Date(column.date+'T00:00:00Z').getUTCDay()]:'';
    return '<span class="prep-col-letter" aria-hidden="true">'+M.letter(index)+'</span><span class="prep-col-name'+(column.date?' prep-date-title':'')+'">'+esc(column.title)+'</span>'+(weekday?'<span class="prep-date-weekday">'+weekday+'</span>':'')+(holiday?'<small class="prep-holiday-label">LIBUR</small>':'');
  }
  async function refreshHolidayHeaders(){
    const cols=columns();
    for(const column of grid?.getColumns?.()||[]){const index=cols.findIndex(c=>c.field===column.getField()),spec=cols[index];if(!spec?.date)continue;
      const holiday=tree?.dayStatusByDate?.[spec.date]?.isHoliday;
      await column.updateDefinition({cssClass:holiday?'prep-holiday':spec.weekend?'prep-weekend':'',titleFormatter:()=>columnTitle(spec,index,holiday)});
    }
  }
  function queueTree(){clearTimeout(treeTimer);treeKey='';tree=null;treeRequest++;treeLoading=true;treeTimer=setTimeout(()=>{treeTimer=null;refreshTree();},400);}
  const empty=month=>({month,name:'Preparation '+month,delivery:[],production:[],material:[],sourceNotes:[],sourceAt:'',allocationSettings:{plannedDowntimeHoursPerDay:0,postProcessGapHours:0},processAllocations:{}});
  function syncSettings(){workbook.allocationSettings ||= {plannedDowntimeHoursPerDay:0,postProcessGapHours:0};workbook.processAllocations ||= {};$('prep-planned-downtime').value=workbook.allocationSettings.plannedDowntimeHoursPerDay||0;$('prep-process-gap').value=workbook.allocationSettings.postProcessGapHours||0;}
  const json=()=>M.stable(workbook);
  function message(text='',error=false){for(const key of ['prep-message','prep-global-message']){const node=$(key);node.hidden=!text;node.textContent=text;node.classList.toggle('is-error',error);}window.PrepDailyPlan?.notify(text);}
  function controls(){
    for(const node of $('prep-workbook-panel').querySelectorAll('.prep-actions button,.prep-scenario input,.prep-scenario select,.prep-scenario button,.prep-ribbon button,.prep-sheetbar button,.prep-allocation-settings input,.prep-allocation-settings button'))node.disabled=busy;
    $('prep-undo').disabled=busy||historyIndex===0;$('prep-redo').disabled=busy||historyIndex===history.length-1;
    $('prep-cell-value').disabled=busy||!selected||(['PROCESS','ADJUSTMENT'].includes(selected.getRow().getData()._kind)&&(treeLoading||treeKey!==T.signature(workbook)))||!T.editable(selected.getRow().getData(),columns().find(c=>c.field===selected.getField())||{readonly:true});
    if($('prep-reset-demand-adjustment'))$('prep-reset-demand-adjustment').disabled=busy||treeLoading||treeKey!==T.signature(workbook)||selected?.getRow().getData()._kind!=='ADJUSTMENT';
    if($('prep-vendor-lead-time'))$('prep-vendor-lead-time').disabled=busy||treeLoading||treeKey!==T.signature(workbook)||selected?.getRow().getData().allocationKind!=='VENDOR_LEAD_TIME';$('prep-save-status').textContent=busy?'Memproses…':dirty?'Perubahan belum disimpan':id?'Tersimpan · revisi '+revision:'Draft baru · belum disimpan';
    document.querySelector('.prep-page').classList.toggle('prep-loading',busy);
    if(locked()){
      for(const node of $('prep-workbook-panel').querySelectorAll('button,input,select'))node.disabled=true;
      for(const key of ['prep-month','prep-scenarios','prep-export','prep-expand-all','prep-collapse-all','prep-search'])$(key).disabled=busy;
    }
    for(const node of document.querySelectorAll('[data-additional-part]'))node.disabled=busy||treeLoading;
    for(const key of ['prep-plan-month','prep-readiness-month'])$(key).disabled=busy;
    $('prep-plan-month').value=workbook.month;
    $('prep-rollback-system').disabled=busy||locked()||!systemBaseline;
    $('prep-lock-review').disabled=busy||locked()||!id||treeLoading;
    $('prep-capacity-refresh').disabled=busy||locked()||treeLoading;
    $('prep-eta-review').hidden=!pendingEta();$('prep-eta-review').disabled=busy;
    $('prep-released-link').hidden=pendingEta();
    $('prep-lock-status').textContent=pendingEta()?(monthState.status==='REVIEW'?'REVIEW · konfirmasi lengkap · periksa perubahan':'MENUNGGU KONFIRMASI ETA')+' · putaran '+monthState.round:locked()?'LOCKED · revisi '+monthState.revision+' · ETA '+(confirmationFeedback?.revision||0)+' · '+monthState.releasedBy:monthState.status==='LOADING'?'Memuat status bulan…':id?'DRAFT · '+workbook.month+' · revisi '+revision:'DRAFT · buka workbook dan simpan untuk lock bulan ini';
    $('prep-lock-status').classList.toggle('prep-lock-state',locked());
    $('prep-released-link').href='/modules/planning-ppic/released?month='+encodeURIComponent(workbook.month);
    derived();
  }
  async function action(fn,readOnly=false){if(busy)return;if(locked()&&!readOnly){message('Bulan sudah lock. Gunakan Review ETA & Perubahan untuk melanjutkan.',true);return;}busy=true;controls();message();try{await fn();}catch(error){$('prep-month').value=workbook.month;$('prep-scenarios').value=id||'';message(error.message,true);if(!tree&&!treeLoading){treeError=error.message;summaries();}}finally{busy=false;controls();}}
  async function api(path,method='GET',body){const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';const response=await fetch('/modules/api/planning-ppic/preparation'+path,{method,cache:'no-store',signal:AbortSignal.timeout(190000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const payload=await response.json();if(!response.ok)throw Error(payload.message||'Permintaan gagal.');return payload;}
  function summaries(){
    for(const sheet of ['delivery'])$('prep-'+sheet+'-total').textContent=Object.entries(M.totals(workbook[sheet])).map(([unit,n])=>fmt(n)+' '+unit).join(' · ')||'0';

    $('prep-tab-delivery').textContent=workbook.delivery.length;
    $('prep-source-notes').innerHTML=(workbook.sourceNotes||[]).map(note=>'<li>'+esc(note)+'</li>').join('');
    $('prep-result-status').textContent=treeLoading?'Menghitung kapasitas…':treeError?'Gagal diperiksa':tree?(tree.warnings.length?'Perlu ditinjau':'Alokasi tersedia'):'Belum dihitung';
    $('prep-show-result').hidden=true;
    $('prep-tree-count').textContent=treeKey===T.signature(workbook)?String(tree?.rows.reduce((n,r)=>n+r.children.length,0)||0):'—';
    $('prep-tree-basis').textContent=tree?.basis||'FG = Delivery Need. Buka FG untuk melihat kebutuhan proses dari BOM. Material Need dilewati.';
    $('prep-allocation-status').textContent=treeLoading?'Menghitung alokasi…':treeError?'Alokasi gagal diperiksa':tree?((tree.warnings?.length||0)+' catatan · '+new Set([...Object.keys(workbook.processAllocations||{}),...Object.keys(workbook.vendorDispatchAllocations||{})]).size+' baris manual'):'Belum dihitung';
    $('prep-allocation-issues').innerHTML=(tree?.warnings||[]).slice(0,100).map(w=>'<li>'+esc(w)+'</li>').join('')+((tree?.warnings?.length||0)>100?'<li>'+String(tree.warnings.length-100)+' catatan tambahan tersedia melalui tooltip masing-masing baris.</li>':'');
    derived();
  }
  function commit(){
    if(locked())return;
    if(grid)workbook.delivery=M.inflate(grid.getData().filter(row=>row._kind==='FG'),active,workbook.month);
    workbook.name=$('prep-name').value.trim();
    const snapshot=json();if(history[historyIndex]!==snapshot){history=history.slice(0,historyIndex+1);history.push(snapshot);if(history.length>60)history.shift();historyIndex=history.length-1;result=null;}
    dirty=snapshot!==savedJSON;summaries();controls();
  }
  function selectCell(cell){
    if(!cell?.getField()||cell.getField()==='_row')return;
    selected=cell;const cols=columns(),index=cols.findIndex(c=>c.field===cell.getField()),column=cols[index];
    $('prep-cell-address').textContent=M.letter(index)+cell.getRow().getPosition();
    $('prep-cell-label').textContent=(column?.date||column?.title||'')+(column?.date&&cell.getRow().getData().allocationKind==='VENDOR_LEAD_TIME'?' · ▲ Qty keluar vendor':'');
    const value=cell.getValue();$('prep-cell-value').value=cell.getRow().getData()._kind==='ADJUSTMENT'?(value?.shortage??'')+' | '+(value?.buffer??''):typeof value==='number'?String(value).replace('.',','):value??'';
    controls();
  }
  function selection(range){const cells=range.getCells().flat();if(cells[0])selectCell(cells[0]);const numeric=cells.filter(c=>columns().find(col=>col.field===c.getField())?.numeric);$('prep-selection-status').textContent=cells.length+' sel'+(numeric.length?' · Jumlah '+fmt(numeric.reduce((sum,c)=>sum+(Number(c.getValue())||0),0)):'');}
  function openVendorLead(rowId){
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook)){message('Tunggu hasil BOM terbaru sebelum mengubah lead time.',true);return;}
    const row=tree?.rows.flatMap(parent=>parent.children||[]).find(row=>row.id===rowId);
    if(!row||row.allocationKind!=='VENDOR_LEAD_TIME'){message('Pilih baris vendor terlebih dahulu.',true);return;}
    vendorEditor?.open(row);
  }
  function openAdjustment(cell){
    const column=columns().find(c=>c.field===cell.getField()),row=cell.getRow().getData();
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook)||row._kind!=='ADJUSTMENT'||!column?.date)return;
    adjustmentPopup?.open(row,column.date,T.signature(workbook));
  }
  function editor(cell,onRendered,success,cancel){
    const column=columns().find(c=>c.field===cell.getField());if(locked()||busy||(['PROCESS','ADJUSTMENT'].includes(cell.getRow().getData()._kind)&&(treeLoading||treeKey!==T.signature(workbook)))||!T.editable(cell.getRow().getData(),column))return false;
    if(cell.getRow().getData()._kind==='ADJUSTMENT'){openAdjustment(cell);return false;}
    const input=document.createElement(column.options?'select':'input');
    if(column.options)for(const value of column.options){const opt=document.createElement('option');opt.value=value;opt.textContent=value==='SUPPLIER_PURCHASE'?'Pembelian supplier':'Milik customer';input.append(opt);}else{input.type='text';if(column.numeric)input.inputMode='decimal';}
    input.value=typeof cell.getValue()==='number'?String(cell.getValue()).replace('.',','):cell.getValue()??'';
    const vendor=cell.getRow().getData().allocationKind==='VENDOR_LEAD_TIME'&&column.date;
    input.setAttribute('aria-label',(vendor?'Qty keluar vendor tanggal '+column.date:column.title)+' baris '+cell.getRow().getPosition());
    let finished=false;const apply=()=>{if(finished)return;try{const value=M.parse(input.value,column);finished=true;success(value);message();}catch(error){message(error.message,true);input.focus();}};
    onRendered(()=>{input.focus();input.select?.();});input.addEventListener('blur',apply);input.addEventListener('keydown',e=>{if(e.key==='Escape'){finished=true;cancel();}else if(e.key==='Enter'){e.preventDefault();apply();}else if(e.key==='Tab'){try{M.parse(input.value,column);}catch(error){e.preventDefault();e.stopPropagation();message(error.message,true);return;}apply();}});
    if(!vendor)return input;
    const wrapper=document.createElement('span');wrapper.className='prep-vendor-flow prep-vendor-editor';
    wrapper.innerHTML=vendorHalf('receipt',cell.getRow().getData()['in'+column.date.slice(-2)],[],[],false) + vendorHalf('dispatch',cell.getValue(),[],[],true);
    wrapper.querySelector('.prep-vendor-out .prep-vendor-amount').replaceWith(input);
    return wrapper;
  }
  function vendorMovements(row,column){
    if(row.allocationKind!=='VENDOR_LEAD_TIME'||!column.date)return [];
    return (row.vendorMovements||[]).filter(move=>Number(move.quantity)>0&&(column.movement==='dispatch'?move.dispatchDate:move.receiptDate)===column.date);
  }
  function movementLabel(move){
    const when=(at,date)=>at?String(at).slice(0,16).replace('T',' '):date||'belum dapat dihitung';
    return (move.valid?'':'⚠ ')+fmt(move.quantity)+' qty: keluar '+when(move.dispatchAt,move.dispatchDate)+' → masuk '+when(move.receiptAt,move.receiptDate);
  }
  function quantityMarkup(value,issues=[],invalid=false){
    if(value==null)return '—';
    if(issues.length||invalid)return '<span class="prep-qty-warning" title="'+esc(issues.join(' · ')||'Qty manual belum valid; tidak dihitung sebagai coverage FG.')+'">'+fmt(value)+' ⚠</span>';
    return Number(value)===0?'<span class="prep-zero">0</span>':fmt(value);
  }
  function vendorHalf(direction,value,issues,moves,editable=true){
    const incoming=direction==='receipt',label=incoming?'Qty masuk':'Qty keluar',arrow=incoming?'▼':'▲';
    const detail=[label+': '+(value==null?'belum dapat dihitung':fmt(value)),incoming?'Otomatis dari qty keluar dan lead time aktif · hanya baca':editable?'Klik untuk edit qty keluar':'Total qty keluar periode · hanya baca',...moves.map(movementLabel),...issues].join(' · ');
    return '<span class="prep-vendor-'+(incoming?'in':'out')+'" data-quantity-state="'+(value==null?'unknown':Number(value)===0?'zero':'filled')+'" aria-label="'+esc(label+' '+(value==null?'belum diketahui':fmt(value)))+'"'+(!incoming&&editable?'':' aria-readonly="true"')+' title="'+esc(detail)+'"><span class="prep-vendor-arrow" aria-hidden="true">'+arrow+'</span><span class="prep-vendor-amount">'+quantityMarkup(value,issues)+'</span></span>';
  }
  function quantityCell(cell,column){
    const row=cell.getRow().getData(),value=cell.getValue();
    cell.getElement?.()?.classList.toggle('prep-additional-hatch',!!column.date&&(!!row.additionalAllocation&&Number(value)>0||Number(row.additionalProductionDays?.[column.date])>0));
    if(column.field==='additionalPoQty'&&row._kind==='FG'&&value>0)return '<button type="button" class="prep-additional-qty" data-additional-part="'+esc(row.partCode)+'" aria-label="Proses Additional PO '+esc(row.partCode)+'">'+fmt(value)+' ↗</button>';
    const holiday=column.date&&(row.dayStatusByDate?.[column.date]||tree?.dayStatusByDate?.[column.date])?.isHoliday===true;cell.getElement?.()?.classList.toggle('prep-holiday',!!holiday);
    if(row._kind==='NOTICE')return '—';
    if(row._kind==='ADJUSTMENT'&&(column.date||column.field==='_total')){
      const total=value?.shortage==null||value?.buffer==null?null:Number(value.shortage)+Number(value.buffer);
      const detail='Shortage: '+(value?.shortage==null?'belum diketahui':fmt(value.shortage))+' · Buffer: '+(value?.buffer==null?'belum diketahui':fmt(value.buffer));
      const tag=column.date?'button':'span';
      return '<'+tag+' class="prep-adjustment-summary"'+(column.date?' type="button" aria-label="Edit shortage dan buffer '+esc(column.date)+'"':'')+' title="'+esc(detail+(column.date?' · Klik untuk edit':' · Total periode'))+'"><span class="prep-adjustment-icon" aria-hidden="true">⚙</span><span>'+quantityMarkup(total)+'</span></'+tag+'>';
    }
    if(row._kind==='FG'&&column.date&&Number(value)>0){const coverage=treeKey===T.signature(workbook)?row.demandCoverage?.[column.date]:null;const tone={READY:'ready',TIGHT:'tight',SHORTAGE:'shortage'}[coverage?.status]||'unknown';const detail=coverage?(tone==='ready'?'Tercapai sebelum hari delivery':tone==='tight'?'Mepet: FG siap pada hari delivery':'Belum tercapai saat delivery')+(Number(coverage.quantity)!==Number(value)?' · Termasuk buffer/shortage pada tanggal ini':'')+' · Qty tepat waktu '+fmt(coverage.onTimeQty)+' / '+fmt(coverage.quantity)+' · Shortage '+fmt(coverage.shortageQty)+(coverage.readyAt?' · Siap '+coverage.readyAt.slice(0,16).replace('T',' '):coverage.stockOnly?' · Ditutup stok tersedia':''):'Menunggu perhitungan terbaru';return '<span class="prep-demand-cell prep-demand-'+tone+'" title="'+esc(detail)+'">'+fmt(value)+'</span>';}
    if(['PROCESS','ADJUSTMENT'].includes(row._kind)&&treeKey!==T.signature(workbook))return '…';
    const moves=vendorMovements(row,{...column,movement:'receipt'}),issues=[...(column.date?row.allocationIssuesByDate?.[column.date]||[]:[]),...moves.filter(move=>!move.valid).map(movementLabel)];
    if(row.allocationKind==='VENDOR_LEAD_TIME'&&(column.date||column.field==='_total')){
      const dispatchMoves=vendorMovements(row,{...column,movement:'dispatch'}),dispatchIssues=dispatchMoves.filter(move=>!move.valid).map(movementLabel);
      const receiptIssues=column.field==='_total'&&Number(row.invalidAllocatedQty)>0?[fmt(row.invalidAllocatedQty)+' qty masuk belum valid; tidak dihitung sebagai coverage FG.']:issues;
      return '<span class="prep-vendor-flow">'+vendorHalf('receipt',row[column.date?'in'+column.date.slice(-2):'_vendorInTotal'],receiptIssues,moves,false)+vendorHalf('dispatch',value,dispatchIssues,dispatchMoves,!!column.date)+'</span>';
    }
    const invalid=column.field==='unallocatedQty'&&Number(row.invalidAllocatedQty)>0;
    return quantityMarkup(value,issues,invalid);
  }
  async function renderSheet(){
    $('prep-selection-status').textContent='Siap';
    selected=null;$('prep-cell-address').textContent='—';$('prep-cell-value').value='';$('prep-cell-label').textContent='';
    // Recreate the host too: clipboard listeners from a destroyed Tabulator
    // must not survive into a different sheet or a reloaded draft.
    if(grid){const host=$('prep-grid');grid.destroy();host.replaceWith(host.cloneNode(false));}
    const cols=columns();
    $('prep-sheet-title').textContent='FG Delivery Need & Alokasi Proses';$('prep-sheet-hint').innerHTML='Khusus vendor: <span class="prep-vendor-in-legend">▼ Masuk</span> di kiri (otomatis) · <span class="prep-vendor-out-legend">▲ Keluar</span> di kanan (klik untuk edit) · Header tetap per tanggal. Garis-garis: produksi tambahan.';
    document.querySelectorAll('[data-sheet]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.sheet===active)));
    grid=new Tabulator('#prep-grid',{
      data:treeData(),index:'id',height:'clamp(300px, calc(100dvh - 300px), 1000px)',layout:'fitDataStretch',rowHeight:40,
      dataTree:true,dataTreeFilter:false,dataTreeChildField:'_children',dataTreeElementColumn:'partCode',dataTreeStartExpanded:row=>expanded.has(row.getData().id),dataTreeChildIndent:20,
      rowFormatter:row=>{row.getElement().classList.toggle('prep-demand-adjustment',row.getData()._kind==='ADJUSTMENT');row.getElement().classList.toggle('prep-fg-parent',row.getData()._kind==='FG');row.getElement().classList.toggle('prep-process-child',row.getData()._kind==='PROCESS');row.getElement().classList.toggle('prep-tree-notice',row.getData()._kind==='NOTICE');row.getElement().classList.toggle('prep-allocation-invalid',Number(row.getData().invalidAllocatedQty)>0);},
      placeholder:'Belum ada baris. Klik “Tambah baris” atau “Ambil data bulan” untuk mulai.',
      selectableRange:1,selectableRangeColumns:false,selectableRangeRows:true,selectableRangeClearCells:false,selectableRangeAutoFocus:false,selectableRangeInitializeDefault:false,
      editTriggerEvent:'dblclick',clipboard:true,clipboardCopyStyled:false,clipboardCopyConfig:{columnHeaders:false,rowHeaders:false},clipboardCopyRowRange:'range',
      clipboardPasteParser:function(text){try{
        if(busy)throw Error('Tunggu proses sebelumnya selesai.');
        const cell=grid.getRanges()[0]?.getCells().flat()[0]||selected;if(!cell)throw Error('Pilih sel awal sebelum menempel.');
        const startColumn=cols.findIndex(c=>c.field===cell.getField());if(startColumn<0)throw Error('Pilih kolom data.');
        const rows=grid.getRows('active').filter(row=>row.getData()._kind==='FG').flatMap(row=>[row,...(row.isTreeExpanded()?row.getTreeChildren():[])]).map(row=>row.getData());
        const startRow=rows.findIndex(row=>row.id===cell.getRow().getData().id);
        return T.pasteVisible(rows,cols,startRow,startColumn,text);
      }catch(error){message(error.message,true);return false;}},
      clipboardPasteAction:function(rows){action(async()=>{if(rows.some(row=>['PROCESS','ADJUSTMENT'].includes(row._kind))&&(treeLoading||treeKey!==T.signature(workbook)))throw Error('Tunggu hasil BOM terbaru sebelum menempel alokasi proses.');const staged=M.clone(workbook);for(const data of rows)T.captureProcess(staged,data);clearTimeout(treeTimer);treeTimer=null;treeRequest++;treeLoading=false;const components=grid.getRows().filter(row=>row.getData()._kind==='FG').flatMap(row=>[row,...row.getTreeChildren()]);for(const data of rows)await components.find(row=>row.getData().id===data.id)?.update(data);workbook.processAllocations=staged.processAllocations;workbook.vendorDispatchAllocations=staged.vendorDispatchAllocations;workbook.demandAdjustments=staged.demandAdjustments;commit();queueTree();});return [];},
      columnDefaults:{headerSort:false,resizable:true,editor,formatter:'plaintext',accessorClipboard:(value,data,_type,params,column)=>data._kind==='ADJUSTMENT'?T.exportValue(data,columns().find(c=>c.field===column.getField())||{}):value},
      rowHeader:{title:'',field:'_row',formatter:'rownum',width:45,frozen:true,editor:false,headerSort:false,hozAlign:'center',headerHozAlign:'center'},
      columns:cols.map((column,index)=>({
        title:column.title,field:column.field,width:column.width,frozen:!!column.frozen,minWidth:column.date||column.field==='_total'?144:70,vertAlign:'middle',hozAlign:column.numeric?'right':'left',editor:column.readonly?false:editor,editable:cell=>!locked()&&!busy&&(!['PROCESS','ADJUSTMENT'].includes(cell.getRow().getData()._kind)||!treeLoading&&treeKey===T.signature(workbook))&&T.editable(cell.getRow().getData(),column),
        tooltip:(_event,cell)=>{if(column.date||column.field==='_total')return false;const row=cell.getRow().getData();return esc(row._kind==='NOTICE'?row.partName:[cell.getValue(),row.partNumber&&'Part Number: '+row.partNumber,row.parallelWith&&'Concurrent candidates: '+row.parallelWith,row.dependsOn&&'Predecessor: '+row.dependsOn,Number.isFinite(row.requiredQty)&&'Kebutuhan: '+fmt(row.requiredQty),Number.isFinite(row.stockAssigned)&&'Stok dialokasikan: '+fmt(row.stockAssigned),row.allocationMode&&'Mode: '+row.allocationMode,row.sourceNote,row._kind==='ADJUSTMENT'&&'Qty otomatis dari sistem: '+(row.autoQuantity==null?'belum terverifikasi':fmt(row.autoQuantity)),T.vendorLeadLabel(row),...vendorMovements(row,column).map(movementLabel),Number(row.invalidAllocatedQty)>0&&'Alokasi belum valid: '+fmt(row.invalidAllocatedQty)+' (belum menjadi coverage)',column.field==='currentStock'&&'Snapshot fisik saat ini; stok bebas dikurangi reserved/QC dan hanya dipakai sekali per part.',...(row.allocationIssues||[]),row.bomNumber,...(row.path||[])].filter(Boolean).join(' · '));},
        titleFormatter:()=>columnTitle(column,index,column.date&&tree?.dayStatusByDate?.[column.date]?.isHoliday),
        cssClass:column.date&&tree?.dayStatusByDate?.[column.date]?.isHoliday?'prep-holiday':column.field==='explodeNo'?'prep-explode-number':column.field==='unallocatedQty'?'prep-unallocated':column.field==='_total'?'prep-total':column.weekend?'prep-weekend':'',
        formatter:column.field==='partCode'?cell=>{const row=cell.getRow().getData();return '<span class="prep-part-identity"><strong>'+esc(row.partCode||'—')+(feedbackUI?.marker(row,confirmationFeedback,row._kind==='FG'?'delivery':null)||'')+'</strong><small>'+esc(row.partNumber||'—')+'</small></span>';}:column.field==='productionFlow'?cell=>'<span class="prep-flow prep-flow-'+({parallel:'parallel',serial:'serial',unknown:'unknown'}[cell.getRow().getData().flowTone]||'delivery')+'">'+esc(cell.getValue()||'—')+'</span>':column.field==='processCode'?cell=>{const row=cell.getRow().getData();return '<span class="prep-process-label">'+esc(cell.getValue()||'')+(T.vendorLeadLabel(row)?'<button type="button" class="prep-vendor-lead-trigger" data-vendor-lead="'+esc(row.id)+'" aria-label="Ubah lead time vendor '+esc(row.partCode)+' '+esc(row.processCode)+'">'+esc(T.vendorLeadLabel(row))+' ✎</button>':'')+'</span>';}:column.field==='partNumber'?(cell)=>esc(cell.getValue()||'—'):column.numeric?cell=>quantityCell(cell,column):column.field==='rowType'?cell=>esc(cell.getValue()||'')+(cell.getRow().getData().allocationMode==='MANUAL'?' <small class="prep-manual-tag">Manual</small>':''):'plaintext',
      })),
    });
    grid.on('cellClick',(event,cell)=>{if(event.target.closest('[data-additional-part]')){additionalEditor?.open(cell.getRow().getData().partCode);return;}const editDispatch=!!event.target.closest('.prep-vendor-out');if(cell.getField()!=='_row'&&!grid.getRanges().some(range=>range.getCells().flat().includes(cell)))grid.addRange(cell,cell);selectCell(cell);const element=cell.getElement();element.tabIndex=0;element.focus({preventScroll:true});if(cell.getRow().getData()._kind==='ADJUSTMENT'){openAdjustment(cell);return;}if(editDispatch&&columns().find(c=>c.field===cell.getField())?.date)setTimeout(()=>{if(selected===cell&&element.isConnected&&!busy&&!treeLoading&&treeKey===T.signature(workbook))cell.edit();},0);});grid.on('rangeChanged',selection);grid.on('rangeAdded',selection);
    grid.on('dataTreeRowExpanded',row=>expanded.add(row.getData().id));grid.on('dataTreeRowCollapsed',row=>expanded.delete(row.getData().id));
    // Never replace the grid with an older response while a delivery cell is being edited.
    grid.on('cellEditing',()=>{clearTimeout(treeTimer);treeTimer=null;treeRequest++;treeLoading=false;});
    grid.on('cellEditCancelled',()=>{if(treeKey!==T.signature(workbook))queueTree();});
    grid.on('cellEdited',cell=>{if(locked()){cell.restoreOldValue();return;}const row=cell.getRow(),data=row.getData();try{if(['PROCESS','ADJUSTMENT'].includes(data._kind)&&(treeLoading||treeKey!==T.signature(workbook)))throw Error('Tunggu hasil BOM terbaru sebelum mengedit alokasi proses.');T.captureProcess(workbook,data);}catch(error){cell.restoreOldValue();message(error.message,true);return;}const total=Object.values(T.dayValues(data,workbook.month)).reduce((sum,n)=>sum+n,0);row.update({_total:data._kind==='ADJUSTMENT'?T.adjustmentTotals(data,workbook.month):total,...(data._kind==='PROCESS'?{unallocatedQty:Math.max(0,(data.requiredQty||0)-(data.stockAssigned||0)-total)}:{}),...(cell.getField()==='partCode'?{partNumber:''}:{})});commit();queueTree();selectCell(cell);});
    $('prep-grid').addEventListener('keydown',event=>{if(event.key==='Enter'&&!busy&&selected&&!event.target.closest('input,select,textarea')){event.preventDefault();event.stopPropagation();if(selected.getRow().getData()._kind==='ADJUSTMENT')openAdjustment(selected);else selected.edit();}},true);
    $('prep-grid').addEventListener('dblclick',event=>{if(event.target.closest('.prep-vendor-in')){event.preventDefault();event.stopImmediatePropagation();}},true);
    $('prep-grid').addEventListener('click',event=>{const button=event.target.closest('[data-vendor-lead]');if(button){event.preventDefault();event.stopImmediatePropagation();openVendorLead(button.dataset.vendorLead);}},true);
    await new Promise(resolve=>grid.on('tableBuilt',resolve));
    filter();summaries();controls();
  }
  function filter(){if(!grid)return;const term=$('prep-search').value.toLowerCase().trim();const match=row=>[row.partCode,row.partNumber,row.partName,row.customerCode,row.processCode,row.bomNumber,row.explodeNo,row.productionFlow].some(value=>String(value||'').toLowerCase().includes(term));grid.setFilter(row=>!term||match(row)||(row._children||[]).some(match));}
  async function replaceWorkbook(payload,record=null){clearTimeout(treeTimer);treeRequest++;tree=null;treeKey='';treeLoading=false;treeError='';expanded=new Set();workbook=M.clone(payload);systemBaseline=M.clone(record?.systemBaseline||payload);$('prep-rollback-system').title=record?.systemBaselineLegacy?'Draft lama: qty FG kembali ke draft tersimpan; seluruh alokasi manual kembali otomatis.':'Kembali ke qty sumber dan parameter sistem awal draft.';if(record?.monthState)monthState=record.monthState;syncSettings();id=record?.id||null;revision=record?.revision||null;result=null;dirty=false;$('prep-name').value=workbook.name;$('prep-month').value=workbook.month;$('prep-search').value='';savedJSON=json();history=[json()];historyIndex=0;await renderSheet();if(workbook.delivery.length)await refreshTree();}
  async function listDrafts(){const drafts=await api('?month='+encodeURIComponent(workbook.month));$('prep-scenarios').innerHTML='<option value="">Skenario baru</option>'+drafts.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+' · rev '+d.revision+'</option>').join('');$('prep-scenarios').value=id||'';return drafts;}
  function discardAllowed(){return !dirty||window.confirm('Ada perubahan yang belum disimpan. Lanjutkan dan tinggalkan perubahan ini?');}
  async function loadMonth(month){monthState=await api('/month-status?month='+encodeURIComponent(month));const drafts=await api('?month='+encodeURIComponent(month));if(drafts.length){const record=await api('/'+encodeURIComponent(locked()?monthState.preparationId:drafts[0].id));await replaceWorkbook(record.payload,record);}else{const payload=await api('/source?month='+encodeURIComponent(month));await replaceWorkbook(payload);message('Snapshot bulan siap. Edit jadwal lalu simpan sebagai draft eksperimen.');}await listDrafts();syncMonth();}
  function showResults(){
    if(!result)return;
    const delivery=result.delivery.map(row=>'<tr class="'+(row.maxShortage>0?'prep-result-risk':'')+'"><td>'+esc(row.partCode)+'</td><td>'+esc(row.partNumber||'—')+'</td><td>'+esc(row.uomCode)+'</td><td>'+fmt(row.maxShortage)+'</td><td>'+esc(row.firstShortageDate||'—')+'</td><td>'+fmt(row.closingBalance)+'</td></tr>').join('');
    const materials=result.materials.map(row=>'<tr class="'+(row.maxShortage>0||row.outsidePeriod.length?'prep-result-risk':'')+'"><td>'+esc(row.partCode)+'<small style="display:block">'+esc(row.customerCode?'Milik '+row.customerCode:'Pembelian supplier')+'</small></td><td>'+esc(row.partNumber||'—')+'</td><td>'+esc(row.uomCode)+'</td><td>'+fmt(row.maxShortage)+'</td><td>'+esc(row.firstShortageDate||'—')+'</td><td>'+fmt(row.closingBalance)+'</td></tr>').join('');
    $('prep-results-body').innerHTML='<p>'+esc(result.basis)+'</p>'+(result.warnings.length?'<ul class="prep-result-warnings">'+result.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'')+'<h3>Delivery vs produksi</h3><p>Saldo awal FG = 0 dalam perbandingan jadwal ini. Kekurangan maksimum menunjukkan kebutuhan produksi yang belum terpenuhi pada tanggalnya.</p><table class="prep-result-table" data-enterprise-table="off"><thead><tr><th>Part</th><th>Part Number</th><th>Satuan</th><th>Kekurangan maksimum</th><th>Pertama kurang</th><th>Saldo akhir</th></tr></thead><tbody>'+ (delivery||'<tr><td colspan="6">Belum ada jadwal.</td></tr>')+'</tbody></table><h3>Estimasi MRP material</h3><table class="prep-result-table" data-enterprise-table="off"><thead><tr><th>Material / pemilik</th><th>Part Number</th><th>Satuan</th><th>Kekurangan maksimum</th><th>Pertama kurang</th><th>Saldo akhir</th></tr></thead><tbody>'+(materials||'<tr><td colspan="6">Belum ada kebutuhan material yang dapat dihitung. Periksa jadwal dan BOM.</td></tr>')+'</tbody></table>'+result.materials.map(row=>'<details><summary>'+esc(row.partCode)+' · Part Number '+esc(row.partNumber||'—')+' · rincian tanggal dan BOM</summary><table class="prep-result-table" data-enterprise-table="off"><thead><tr><th>Tanggal</th><th>Kedatangan</th><th>Kebutuhan</th><th>Saldo</th></tr></thead><tbody>'+row.daily.map(d=>'<tr><td>'+esc(d.date)+'</td><td>'+fmt(d.received)+'</td><td>'+fmt(d.required)+'</td><td>'+fmt(d.balance)+'</td></tr>').join('')+row.outsidePeriod.map(d=>'<tr class="prep-result-risk"><td>'+esc(d.date)+' (sebelum periode)</td><td>—</td><td>'+fmt(d.quantity)+'</td><td>Belum tercakup</td></tr>').join('')+'</tbody></table><p>'+row.sources.map(s=>esc(s.partCode)+' · '+esc(s.bomNumber)+' · '+esc(s.requiredDate)+' · '+fmt(s.quantity)+' '+esc(row.uomCode)).join('<br>')+'</p></details>').join('');
    $('prep-results').showModal();
  }
  $('prep-close-results').addEventListener('click',()=>$('prep-results').close());$('prep-show-result').addEventListener('click',showResults);
  document.querySelectorAll('[data-sheet]').forEach(button=>button.addEventListener('click',()=>action(async()=>{active=button.dataset.sheet;$('prep-search').value='';await renderSheet();})));
  $('prep-search').addEventListener('input',()=>{if(grid)filter();});$('prep-name').addEventListener('change',()=>commit());
  $('prep-cell-value').addEventListener('change',()=>{if(locked()||busy||!selected)return;try{const column=columns().find(c=>c.field===selected.getField());if(['PROCESS','ADJUSTMENT'].includes(selected.getRow().getData()._kind)&&(treeLoading||treeKey!==T.signature(workbook)))throw Error('Tunggu hasil BOM terbaru sebelum mengedit alokasi proses.');if(!T.editable(selected.getRow().getData(),column))throw Error('Pilih kolom tanggal yang dapat diedit.');selected.setValue(selected.getRow().getData()._kind==='ADJUSTMENT'?T.parseAdjustment($('prep-cell-value').value,selected.getValue()):M.parse($('prep-cell-value').value,column));}catch(error){message(error.message,true);}});
  $('prep-add').addEventListener('click',async()=>{let editCell;await action(async()=>{if(workbook.delivery.length>=2000)throw Error('Maksimal 2.000 baris.');$('prep-search').value='';filter();const row=await grid.addRow(T.rows({month:workbook.month,delivery:[M.blank(active,crypto.randomUUID())]},null)[0],false);commit();await grid.scrollToRow(row);grid.addRange(row.getCell('partCode'),row.getCell('partCode'));selectCell(row.getCell('partCode'));editCell=row.getCell('partCode');});editCell?.edit();});
  $('prep-delete').addEventListener('click',()=>action(async()=>{const ranged=grid.getRanges()[0]?.getRows()||[];const rows=ranged.length?ranged:(selected?[selected.getRow()]:[]);if(!rows.length)throw Error('Pilih sel pada FG yang ingin dihapus.');if(rows.some(r=>r.getData()._kind!=='FG'))throw Error('Pilih baris FG saja. Child proses mengikuti BOM dan tidak dapat dihapus dari workbook.');await grid.deleteRow(rows.map(row=>row.getData().id));commit();selected=null;queueTree();}));
  async function undo(direction){const next=historyIndex+direction;if(next<0||next>=history.length)return;clearTimeout(treeTimer);treeRequest++;tree=null;treeKey='';historyIndex=next;workbook=JSON.parse(history[next]);syncSettings();$('prep-name').value=workbook.name;dirty=json()!==savedJSON;result=null;await renderSheet();await refreshTree();}
  $('prep-undo').addEventListener('click',()=>action(()=>undo(-1)));$('prep-redo').addEventListener('click',()=>action(()=>undo(1)));
  document.addEventListener('keydown',event=>{if(locked()||busy||!event.ctrlKey&&!event.metaKey||event.target.closest('input,textarea,select'))return;if(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y'){event.preventDefault();action(()=>undo(event.key.toLowerCase()==='y'||event.shiftKey?1:-1));}});
  async function saveDraft(){commit();const record=await api(id?'/'+encodeURIComponent(id):'',id?'PUT':'POST',{...workbook,...(id?{revision}:{systemBaseline})});id=record.id;revision=record.revision;workbook=record.payload;systemBaseline=record.systemBaseline;monthState=record.monthState;savedJSON=json();dirty=false;history=[json()];historyIndex=0;await renderSheet();await refreshTree();await listDrafts();message('Draft tersimpan di server · revisi '+revision+'.');}
  $('prep-save').addEventListener('click',()=>action(saveDraft));
  $('prep-simulate').addEventListener('click',()=>action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();}));
  $('prep-capacity-refresh')?.addEventListener('click',()=>action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();}));
  bomSync=window.PrepBomSync?.mount(document,{
    getState:()=>({signature:workbook?T.signature(workbook):'',snapshot:treeKey===(workbook&&T.signature(workbook))?tree:null,busy,locked:locked(),loading:treeLoading}),
    check:()=>api('/bom-status','POST',M.clone(workbook)),
    apply:async()=>{await action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();});if(treeError)throw Error(treeError);},
  });
  adjustmentPopup=window.PrepAdjustmentEdit?.mount(document,async change=>{
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook))throw Error('Tunggu perhitungan terbaru sebelum mengedit.');
    if(!window.PrepAdjustmentEdit.apply(workbook,tree,change))return;
    await action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();});
    if(treeError)throw Error('Perubahan ada di draft, tetapi perhitungan gagal: '+treeError);
  });
  vendorEditor=window.PrepVendorEdit?.mount(document,async change=>{
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook))throw Error('Tunggu hasil BOM terbaru sebelum mengedit.');
    window.PrepVendorEdit.apply(workbook,tree,change);
    await action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();});
    if(treeError)throw Error('Perubahan ada di draft, tetapi perhitungan gagal: '+treeError);
  });
  $('prep-reset-demand-adjustment')?.addEventListener('click',()=>action(async()=>{const row=selected?.getRow().getData();if(row?._kind!=='ADJUSTMENT')throw Error('Pilih baris buffer atau shortage.');if(workbook.demandAdjustments?.[row.parentId])delete workbook.demandAdjustments[row.parentId];commit();clearTimeout(treeTimer);await refreshTree();}));
  $('prep-vendor-lead-time')?.addEventListener('click',()=>openVendorLead(selected?.getRow().getData().id));
  const capacityEditor=window.PrepCapacityEdit?.mount(document,async change=>{
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook))throw Error('Tunggu perhitungan terbaru sebelum mengedit.');
    window.PrepCapacityEdit.apply(workbook,tree,change);
    await action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();});
    if(treeError)throw Error('Perubahan ada di draft, tetapi perhitungan gagal: '+treeError);
  },async change=>{
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook))throw Error('Tunggu perhitungan terbaru.');
    // Preview through the same read-only allocator so overnight shifts, holidays,
    // downtime and efficiency cannot diverge from the result after Apply.
    const key=T.signature(workbook),draft=M.clone(workbook);
    window.PrepCapacityEdit.apply(draft,tree,change);
    const preview=await api('/process-tree','POST',draft);
    if(key!==T.signature(workbook))throw Error('Draft berubah; buka kembali pengaturan kapasitas.');
    return preview.derived?.capacity?.rows.find(row=>row.machineId===change.id&&row.date===change.date);
  });
  window.addEventListener('prep:edit-capacity',event=>{if(!locked()&&!busy&&!treeLoading&&treeKey===T.signature(workbook))capacityEditor?.open(event.detail);});
  window.PrepDailyPlan?.mount(document,async change=>{
    if(locked()||busy||treeLoading||treeKey!==T.signature(workbook))throw Error('Tunggu perhitungan terbaru sebelum menggeser jadwal.');
    window.PrepDailyPlan.apply(workbook,tree,change);
    await action(async()=>{commit();clearTimeout(treeTimer);await refreshTree();});
    if(treeError)throw Error('Posisi ada di draft, tetapi pemeriksaan gagal: '+treeError);
  });
  for(const [id,key,max] of [['prep-planned-downtime','plannedDowntimeHoursPerDay',24],['prep-process-gap','postProcessGapHours',2160]])$(id).addEventListener('change',()=>{if(locked()||busy)return;try{const value=M.quantity($(id).value);if(value>max)throw Error('Nilai maksimal '+max+' jam.');workbook.allocationSettings[key]=value;commit();queueTree();}catch(error){syncSettings();message(error.message,true);}});
  $('prep-reset-allocations').addEventListener('click',()=>action(async()=>{if((Object.keys(workbook.processAllocations||{}).length||Object.keys(workbook.vendorDispatchAllocations||{}).length)&&!window.confirm('Hitung ulang semua alokasi manual? Perubahan dapat dikembalikan dengan Undo.'))return;workbook.processAllocations={};workbook.vendorDispatchAllocations={};commit();clearTimeout(treeTimer);await refreshTree();}));
  $('prep-expand-all').addEventListener('click',()=>grid?.getRows().forEach(row=>row.treeExpand()));
  $('prep-collapse-all').addEventListener('click',()=>grid?.getRows().forEach(row=>row.treeCollapse()));
  $('prep-source').addEventListener('click',()=>{if(discardAllowed())action(async()=>{await replaceWorkbook(await api('/source?month='+encodeURIComponent(workbook.month)));await listDrafts();message('Snapshot sumber dimuat sebagai skenario baru.');});});
  $('prep-new').addEventListener('click',()=>{if(discardAllowed())action(async()=>{await replaceWorkbook(empty(workbook.month));await listDrafts();});});
  $('prep-scenarios').addEventListener('change',event=>{const next=event.target.value;if(locked()&&next!==monthState.preparationId){event.target.value=id||'';message('Bulan sudah lock. Workbook yang aktif adalah versi release.',true);return;}if(!discardAllowed()){event.target.value=id||'';return;}action(async()=>{if(next){const record=await api('/'+encodeURIComponent(next));await replaceWorkbook(record.payload,record);}else await replaceWorkbook(empty(workbook.month));},true);});
  $('prep-month').addEventListener('change',event=>changeMonth(event.target.value));
  $('prep-export').addEventListener('click',()=>action(async()=>{commit();clearTimeout(treeTimer);if(treeKey!==T.signature(workbook))await refreshTree();if(!tree||treeKey!==T.signature(workbook))throw Error('Explode BOM belum tersedia; periksa ulang sebelum ekspor.');const cols=columns(),sheets=[{name:'FG & Child Proses',headers:cols.map(c=>c.date||c.title),rows:T.exportRows(workbook,tree).map(row=>cols.map(c=>c.field==='partCode'?(row._kind!=='FG'?'  ↳ ':'')+[row.partCode,row.partNumber].filter(Boolean).join(' / '):T.exportValue(row,c)))}];const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';const response=await fetch('/table-documents/xlsx',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({title:workbook.name,subtitle:(locked()?'PPIC Released · ':'Production Plan Lab · draft eksperimen ')+workbook.month,headers:sheets[0].headers,rows:[],sheets})});if(!response.ok){const error=await response.json();throw Error(error.message||'Ekspor gagal.');}const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='Production-Plan-Lab-'+workbook.month+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},true));
  function syncMonth(){
    for(const key of ['prep-plan-month','prep-month','prep-readiness-month'])$(key).value=workbook.month;
    const url=new URL(location.href);url.searchParams.set('month',workbook.month);url.searchParams.delete('readiness_month');window.history.replaceState(null,'',url);
    for(const link of document.querySelectorAll('.ppic-workspace-nav a')){const target=new URL(link.href,location.href);if(['/modules/planning-ppic/preparation','/modules/planning-ppic/released'].includes(target.pathname)){target.searchParams.set('month',workbook.month);link.href=target.pathname+target.search;}}
    window.dispatchEvent(new CustomEvent('prep:month-loaded',{detail:{month:workbook.month}}));controls();
  }
  function changeMonth(month){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||busy||!discardAllowed()){for(const key of ['prep-plan-month','prep-month','prep-readiness-month'])$(key).value=workbook.month;return;}
    statusRequest++;releaseReview=null;confirmationFeedback=null;feedbackUI?.render($('prep-confirmation-feedback'),null);
    action(async()=>{if(workbookStarted)await loadMonth(month);else{const next=await api('/month-status?month='+encodeURIComponent(month));workbook=empty(month);monthState=next;systemBaseline=null;syncMonth();}},true);
  }
  $('prep-plan-month').addEventListener('change',event=>changeMonth(event.target.value));
  window.addEventListener('prep:month-request',event=>changeMonth(event.detail.month));
  $('prep-rollback-system').addEventListener('click',()=>{
    if(locked()||!window.confirm('Kembalikan qty delivery, buffer/shortage, alokasi, kapasitas, lead time vendor, dan posisi harian ke dasar sistem?'))return;
    action(async()=>{if(id){const record=await api('/'+encodeURIComponent(id)+'/rollback','POST',{revision});await replaceWorkbook(record.payload,record);}else{const baseline=M.clone(systemBaseline);for(const key of ['processAllocations','vendorDispatchAllocations','vendorLeadTimeOverrides','demandAdjustments','machineDayOverrides','processSetupCounts','dailyScheduleOverrides'])baseline[key]={};await replaceWorkbook(baseline);dirty=true;}message('Qty dan pengaturan manual dikembalikan ke dasar sistem. Keenam tab telah diperbarui.');});
  });
  $('prep-lock-review').addEventListener('click',()=>action(async()=>{
    if(dirty)await saveDraft();
    releaseReview=null;$('prep-release-confirm').disabled=true;$('prep-release-review').textContent='Memeriksa paket dan sumber terbaru…';$('prep-release-dialog').showModal();
    try{releaseReview=await api('/'+encodeURIComponent(id)+'/release-review','POST',{revision});
      $('prep-release-review').innerHTML='<p><strong>'+esc(workbook.name)+' · '+esc(workbook.month)+' · revisi '+revision+'</strong></p><p>'+Object.entries(releaseReview.counts).map(([key,n])=>esc({monthly:'Monthly Plan',daily:'Daily Plan',supplier:'PR Supplier',vendor:'PR Vendor',delivery:'Delivery Plan'}[key])+': '+fmt(n)+' baris').join(' · ')+'</p>'+(releaseReview.blockers.length?'<h3>Perlu diperbaiki sebelum lock</h3><ul>'+releaseReview.blockers.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>':'<p>Lock menyimpan usulan dan mengirim rekomendasi konfirmasi supplier, vendor, serta material customer. Setelah seluruh kebutuhan terkonfirmasi, review perubahan jadwal lalu pilih Confirm Release atau Ajukan Ulang ETA.</p>')+(releaseReview.warnings.length?'<details><summary>'+releaseReview.warnings.length+' catatan perhitungan</summary><ul>'+releaseReview.warnings.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul></details>':'');
      $('prep-release-confirm').disabled=!!releaseReview.blockers.length;
    }catch(error){$('prep-release-review').textContent=error.message;}
  }));
  $('prep-release-cancel').addEventListener('click',()=>$('prep-release-dialog').close());
  $('prep-release-confirm').addEventListener('click',()=>action(async()=>{
    if(!releaseReview||releaseReview.blockers.length)return;
    $('prep-release-confirm').disabled=true;
    try{monthState=await api('/'+encodeURIComponent(id)+'/lock','POST',{revision,reviewHash:releaseReview.reviewHash});$('prep-release-dialog').close();await loadMonth(workbook.month);message('Bulan '+workbook.month+' dilock untuk konfirmasi ETA. Review perubahan sebelum Confirm Release.');}
    catch(error){releaseReview=null;$('prep-release-review').textContent=error.message+' Tutup lalu periksa ulang paket/status bulan.';throw error;}
  }));
  window.PpicConfirmationGate?.mount({api,action,state:()=>monthState,reload:()=>loadMonth(workbook.month),message});
  async function syncRemote(){
    if(busy||treeLoading||remoteSyncPending||document.visibilityState==='hidden')return;
    remoteSyncPending=true;
    const month=workbook.month,currentId=id,request=++statusRequest;
    try{const state=await api('/month-status?month='+encodeURIComponent(month));if(request!==statusRequest||month!==workbook.month||busy)return;
      if(['LOCKED','CONFIRMING','REVIEW'].includes(state.status)){
        if(locked()){
          monthState=state;
          if(workbookStarted)await refreshTree(true);
          else{const released=await api('/lab-state?month='+encodeURIComponent(month));if(request!==statusRequest||month!==workbook.month)return;confirmationFeedback=released.feedback||null;feedbackUI?.render($('prep-confirmation-feedback'),released);}
          controls();return;
        }
        if(dirty){sessionStorage.setItem('ppic-lab-unreleased:'+month,JSON.stringify(workbook));}
        const localDirty=dirty;monthState=state;
        if(workbookStarted)await action(()=>loadMonth(month),true);
        controls();if(localDirty)message('Bulan di-lock oleh sesi lain. Versi release dimuat; salinan edit lokal tersimpan di sesi browser dengan kunci ppic-lab-unreleased:'+month+'.');
      }else{const wasLocked=locked();monthState=state;if(wasLocked){confirmationFeedback=null;feedbackUI?.render($('prep-confirmation-feedback'),state);if(workbookStarted)await action(()=>loadMonth(month),true);controls();message('Release bulan ini telah ditarik. Draft planning dapat diperiksa dan dilock ulang.');return;}controls();if(currentId){const latest=await api('/'+encodeURIComponent(currentId));if(request!==statusRequest||currentId!==id||month!==workbook.month||busy)return;if(latest.revision!==revision){if(dirty)message('Draft diperbarui di sesi lain. Edit lokal masih dipertahankan; buka kembali draft terbaru sebelum menyimpan.',true);else await action(()=>replaceWorkbook(latest.payload,latest),true);}}}
      bomSync?.inspect(true);
    }catch(error){if(request===statusRequest){$('prep-lock-status').textContent='Sinkronisasi tertunda: '+error.message;$('prep-lock-review').disabled=true;}}finally{remoteSyncPending=false;}
  }
  window.addEventListener('focus',syncRemote);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncRemote();});setInterval(syncRemote,15000);
  window.addEventListener('ppic:confirmation-changed',event=>{if(!event.detail?.month||event.detail.month===workbook.month)syncRemote();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  additionalEditor=window.PrepAdditionalPo.mount({api,getContext:()=>additionalContext,reload:()=>refreshTree(),message});
  workbook=empty($('prep-month').value);$('prep-name').value=workbook.name;
  let workbookStarted=false;
  syncRemote();
  window.addEventListener('prep:open-workbook',()=>{
    if(workbookStarted){if(grid&&!$('prep-workbook-panel').hidden)grid.redraw(true);return;}
    workbookStarted=true;
    action(async()=>{await loadMonth(workbook.month);},true);
  });
})();
