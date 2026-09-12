(() => {
  'use strict';
  const $=id=>document.getElementById(id), M=window.PrepWorkbook;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(n)||0);
  const title={delivery:'Delivery Schedule',production:'Production Schedule',material:'Material Arrival'};
  const hint={delivery:'Jumlah delivery per tanggal · perubahan hanya berlaku dalam draft ini.',production:'Jumlah FG selesai per tanggal · klik dua kali / Enter untuk edit · tempel rentang dari Excel.',material:'Jumlah material tiba per tanggal · isi proyeksi stok awal · pisahkan satuan dan pemilik customer.'};
  let workbook,grid,active='production',selected=null,id=null,revision=null,busy=false,dirty=false,result=null,history=[],historyIndex=0,savedJSON=null;
  const empty=month=>({month,name:'Preparation '+month,delivery:[],production:[],material:[],sourceNotes:[],sourceAt:''});
  const json=()=>M.stable(workbook);
  function message(text='',error=false){$('prep-message').hidden=!text;$('prep-message').textContent=text;$('prep-message').classList.toggle('is-error',error);}
  function controls(){
    for(const node of document.querySelectorAll('.prep-actions button,.prep-scenario input,.prep-scenario select,.prep-scenario button,.prep-ribbon button,.prep-sheetbar button'))node.disabled=busy;
    $('prep-undo').disabled=busy||historyIndex===0;$('prep-redo').disabled=busy||historyIndex===history.length-1;
    $('prep-cell-value').disabled=busy||!selected||selected.getField()==='_total';
    $('prep-save-status').textContent=busy?'Memproses…':dirty?'Perubahan belum disimpan':id?'Tersimpan · revisi '+revision:'Draft baru · belum disimpan';
    document.querySelector('.prep-page').classList.toggle('prep-loading',busy);
  }
  async function action(fn){if(busy)return;busy=true;controls();message();try{await fn();}catch(error){$('prep-month').value=workbook.month;$('prep-scenarios').value=id||'';message(error.message,true);}finally{busy=false;controls();}}
  async function api(path,method='GET',body){const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';const response=await fetch('/modules/api/planning-ppic/preparation'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const payload=await response.json();if(!response.ok)throw Error(payload.message||'Permintaan gagal.');return payload;}
  function summaries(){
    for(const sheet of ['delivery','production'])$('prep-'+sheet+'-total').textContent=Object.entries(M.totals(workbook[sheet])).map(([unit,n])=>fmt(n)+' '+unit).join(' · ')||'0';
    $('prep-material-count').textContent=workbook.material.length+' material';
    for(const sheet of Object.keys(title))$('prep-tab-'+sheet).textContent=workbook[sheet].length;
    $('prep-source-notes').innerHTML=(workbook.sourceNotes||[]).map(note=>'<li>'+esc(note)+'</li>').join('');
    $('prep-result-status').textContent=result?(result.warnings.length?'Perlu ditinjau':result.delivery.some(r=>r.maxShortage>0)||result.materials.some(r=>r.maxShortage>0||r.outsidePeriod.length)?'Ada kekurangan':'Jadwal seimbang'):'Belum dihitung';
    $('prep-show-result').hidden=!result;
  }
  function commit(){
    if(grid)workbook[active]=M.inflate(grid.getData(),active,workbook.month);
    workbook.name=$('prep-name').value.trim();
    const snapshot=json();if(history[historyIndex]!==snapshot){history=history.slice(0,historyIndex+1);history.push(snapshot);if(history.length>60)history.shift();historyIndex=history.length-1;result=null;}
    dirty=snapshot!==savedJSON;summaries();controls();
  }
  function selectCell(cell){
    if(!cell?.getField()||cell.getField()==='_row')return;
    selected=cell;const cols=M.columns(active,workbook.month),index=cols.findIndex(c=>c.field===cell.getField()),column=cols[index];
    $('prep-cell-address').textContent=M.letter(index)+cell.getRow().getPosition();
    $('prep-cell-label').textContent=column?.date||column?.title||'';
    const value=cell.getValue();$('prep-cell-value').value=typeof value==='number'?String(value).replace('.',','):value??'';
    controls();
  }
  function selection(range){const cells=range.getCells().flat();if(cells[0])selectCell(cells[0]);const numeric=cells.filter(c=>M.columns(active,workbook.month).find(col=>col.field===c.getField())?.numeric);$('prep-selection-status').textContent=cells.length+' sel'+(numeric.length?' · Jumlah '+fmt(numeric.reduce((sum,c)=>sum+(Number(c.getValue())||0),0)):'');}
  function editor(cell,onRendered,success,cancel){
    const column=M.columns(active,workbook.month).find(c=>c.field===cell.getField()),input=document.createElement(column.options?'select':'input');
    if(column.options)for(const value of column.options){const opt=document.createElement('option');opt.value=value;opt.textContent=value==='SUPPLIER_PURCHASE'?'Pembelian supplier':'Milik customer';input.append(opt);}else{input.type='text';if(column.numeric)input.inputMode='decimal';}
    input.value=typeof cell.getValue()==='number'?String(cell.getValue()).replace('.',','):cell.getValue()??'';
    input.setAttribute('aria-label',column.title+' baris '+cell.getRow().getPosition());
    let finished=false;const apply=()=>{if(finished)return;try{const value=M.parse(input.value,column);finished=true;success(value);message();}catch(error){message(error.message,true);input.focus();}};
    onRendered(()=>{input.focus();input.select?.();});input.addEventListener('blur',apply);input.addEventListener('keydown',e=>{if(e.key==='Escape'){finished=true;cancel();}else if(e.key==='Enter'){e.preventDefault();apply();}else if(e.key==='Tab'){try{M.parse(input.value,column);}catch(error){e.preventDefault();e.stopPropagation();message(error.message,true);return;}apply();}});return input;
  }
  async function renderSheet(){
    selected=null;$('prep-cell-address').textContent='—';$('prep-cell-value').value='';$('prep-cell-label').textContent='';
    // Recreate the host too: clipboard listeners from a destroyed Tabulator
    // must not survive into a different sheet or a reloaded draft.
    if(grid){const host=$('prep-grid');grid.destroy();host.replaceWith(host.cloneNode(false));}
    const cols=M.columns(active,workbook.month);
    $('prep-sheet-title').textContent=title[active];$('prep-sheet-hint').textContent=hint[active];
    document.querySelectorAll('[data-sheet]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.sheet===active)));
    grid=new Tabulator('#prep-grid',{
      data:M.flatten(workbook[active],workbook.month),index:'id',height:420,layout:'fitDataStretch',rowHeight:35,
      placeholder:'Belum ada baris. Klik “Tambah baris” atau “Ambil data bulan” untuk mulai.',
      selectableRange:1,selectableRangeColumns:false,selectableRangeRows:true,selectableRangeClearCells:false,selectableRangeAutoFocus:false,selectableRangeInitializeDefault:false,
      editTriggerEvent:'dblclick',clipboard:true,clipboardCopyStyled:false,clipboardCopyConfig:{columnHeaders:false,rowHeaders:false},clipboardCopyRowRange:'range',
      clipboardPasteParser:function(text){try{
        if(busy)throw Error('Tunggu proses sebelumnya selesai.');
        const cell=grid.getRanges()[0]?.getCells().flat()[0]||selected;if(!cell)throw Error('Pilih sel awal sebelum menempel.');
        const startColumn=cols.findIndex(c=>c.field===cell.getField());if(startColumn<0)throw Error('Pilih kolom data.');
        if($('prep-search').value)throw Error('Kosongkan pencarian sebelum menempel rentang.');
        const rows=grid.getData(),startRow=rows.findIndex(row=>row.id===cell.getRow().getData().id);
        return M.paste(rows,cols,startRow,startColumn,text,()=>M.flatten([M.blank(active,crypto.randomUUID())],workbook.month)[0]);
      }catch(error){message(error.message,true);return false;}},
      clipboardPasteAction:function(rows){const normalized=M.flatten(M.inflate(rows,active,workbook.month),workbook.month);busy=true;controls();grid.replaceData(normalized).then(()=>commit()).catch(error=>message(error.message,true)).finally(()=>{busy=false;controls();});return [];},
      columnDefaults:{headerSort:false,resizable:true,editor,formatter:'plaintext'},
      rowHeader:{title:'',field:'_row',formatter:'rownum',width:45,frozen:true,editor:false,headerSort:false,hozAlign:'center',headerHozAlign:'center'},
      columns:cols.map((column,index)=>({
        title:column.title,field:column.field,width:column.width,minWidth:70,hozAlign:column.numeric?'right':'left',editor:column.readonly?false:editor,
        titleFormatter:()=>'<span class="prep-col-letter">'+M.letter(index)+'</span><span class="prep-col-name">'+esc(column.title)+'</span>',
        cssClass:column.readonly?'prep-total':column.weekend?'prep-weekend':'',
        formatter:column.numeric?(cell)=>Number(cell.getValue())===0?'<span style="color:#a1adbc">0</span>':fmt(cell.getValue()):column.field==='supplyType'?(cell)=>cell.getValue()==='CUSTOMER_SUPPLIED'?'Milik customer':'Pembelian supplier':'plaintext',
      })),
    });
    grid.on('cellClick',(_event,cell)=>{if(cell.getField()!=='_row'&&!grid.getRanges().some(range=>range.getCells().flat().includes(cell)))grid.addRange(cell,cell);selectCell(cell);const element=cell.getElement();element.tabIndex=0;element.focus({preventScroll:true});});grid.on('rangeChanged',selection);grid.on('rangeAdded',selection);
    grid.on('cellEdited',cell=>{const row=cell.getRow(),total=M.dates(workbook.month).reduce((sum,date)=>sum+(Number(row.getData()['d'+date.slice(-2)])||0),0);row.update({_total:total});commit();selectCell(cell);});
    $('prep-grid').addEventListener('keydown',event=>{if(event.key==='Enter'&&!busy&&selected&&!event.target.closest('input,select,textarea')){event.preventDefault();event.stopPropagation();selected.edit();}},true);
    await new Promise(resolve=>grid.on('tableBuilt',resolve));
    filter();summaries();controls();
  }
  function filter(){const term=$('prep-search').value.toLowerCase().trim();grid.setFilter(row=>!term||[row.partCode,row.partName,row.customerCode,row.resource].some(value=>String(value||'').toLowerCase().includes(term)));}
  async function replaceWorkbook(payload,record=null){workbook=M.clone(payload);id=record?.id||null;revision=record?.revision||null;result=null;dirty=false;$('prep-name').value=workbook.name;$('prep-month').value=workbook.month;$('prep-search').value='';savedJSON=json();history=[json()];historyIndex=0;await renderSheet();}
  async function listDrafts(){const drafts=await api('?month='+encodeURIComponent(workbook.month));$('prep-scenarios').innerHTML='<option value="">Skenario baru</option>'+drafts.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+' · rev '+d.revision+'</option>').join('');$('prep-scenarios').value=id||'';return drafts;}
  function discardAllowed(){return !dirty||window.confirm('Ada perubahan yang belum disimpan. Lanjutkan dan tinggalkan perubahan ini?');}
  async function loadMonth(month){const drafts=await api('?month='+encodeURIComponent(month));if(drafts.length){const record=await api('/'+encodeURIComponent(drafts[0].id));await replaceWorkbook(record.payload,record);}else{const payload=await api('/source?month='+encodeURIComponent(month));await replaceWorkbook(payload);message('Snapshot bulan siap. Edit jadwal lalu simpan sebagai draft eksperimen.');}await listDrafts();}
  function showResults(){
    if(!result)return;
    const delivery=result.delivery.map(row=>'<tr class="'+(row.maxShortage>0?'prep-result-risk':'')+'"><td>'+esc(row.partCode)+'</td><td>'+esc(row.uomCode)+'</td><td>'+fmt(row.maxShortage)+'</td><td>'+esc(row.firstShortageDate||'—')+'</td><td>'+fmt(row.closingBalance)+'</td></tr>').join('');
    const materials=result.materials.map(row=>'<tr class="'+(row.maxShortage>0||row.outsidePeriod.length?'prep-result-risk':'')+'"><td>'+esc(row.partCode)+'<small style="display:block">'+esc(row.customerCode?'Milik '+row.customerCode:'Pembelian supplier')+'</small></td><td>'+esc(row.uomCode)+'</td><td>'+fmt(row.maxShortage)+'</td><td>'+esc(row.firstShortageDate||'—')+'</td><td>'+fmt(row.closingBalance)+'</td></tr>').join('');
    $('prep-results-body').innerHTML='<p>'+esc(result.basis)+'</p>'+(result.warnings.length?'<ul class="prep-result-warnings">'+result.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'')+'<h3>Delivery vs produksi</h3><p>Saldo awal FG = 0 dalam perbandingan jadwal ini. Kekurangan maksimum menunjukkan kebutuhan produksi yang belum terpenuhi pada tanggalnya.</p><table class="prep-result-table" data-enterprise-table="off"><thead><tr><th>Part</th><th>Satuan</th><th>Kekurangan maksimum</th><th>Pertama kurang</th><th>Saldo akhir</th></tr></thead><tbody>'+ (delivery||'<tr><td colspan="5">Belum ada jadwal.</td></tr>')+'</tbody></table><h3>Estimasi MRP material</h3><table class="prep-result-table" data-enterprise-table="off"><thead><tr><th>Material / pemilik</th><th>Satuan</th><th>Kekurangan maksimum</th><th>Pertama kurang</th><th>Saldo akhir</th></tr></thead><tbody>'+(materials||'<tr><td colspan="5">Belum ada kebutuhan material yang dapat dihitung. Periksa jadwal dan BOM.</td></tr>')+'</tbody></table>'+result.materials.map(row=>'<details><summary>'+esc(row.partCode)+' · rincian tanggal dan BOM</summary><table class="prep-result-table" data-enterprise-table="off"><thead><tr><th>Tanggal</th><th>Kedatangan</th><th>Kebutuhan</th><th>Saldo</th></tr></thead><tbody>'+row.daily.map(d=>'<tr><td>'+esc(d.date)+'</td><td>'+fmt(d.received)+'</td><td>'+fmt(d.required)+'</td><td>'+fmt(d.balance)+'</td></tr>').join('')+row.outsidePeriod.map(d=>'<tr class="prep-result-risk"><td>'+esc(d.date)+' (sebelum periode)</td><td>—</td><td>'+fmt(d.quantity)+'</td><td>Belum tercakup</td></tr>').join('')+'</tbody></table><p>'+row.sources.map(s=>esc(s.partCode)+' · '+esc(s.bomNumber)+' · '+esc(s.requiredDate)+' · '+fmt(s.quantity)+' '+esc(row.uomCode)).join('<br>')+'</p></details>').join('');
    $('prep-results').showModal();
  }
  $('prep-close-results').addEventListener('click',()=>$('prep-results').close());$('prep-show-result').addEventListener('click',showResults);
  document.querySelectorAll('[data-sheet]').forEach(button=>button.addEventListener('click',()=>action(async()=>{active=button.dataset.sheet;$('prep-search').value='';await renderSheet();})));
  $('prep-search').addEventListener('input',()=>{if(grid)filter();});$('prep-name').addEventListener('change',()=>commit());
  $('prep-cell-value').addEventListener('change',()=>{if(!selected)return;try{const column=M.columns(active,workbook.month).find(c=>c.field===selected.getField());selected.setValue(M.parse($('prep-cell-value').value,column));}catch(error){message(error.message,true);}});
  $('prep-add').addEventListener('click',()=>action(async()=>{if(workbook[active].length>=2000)throw Error('Maksimal 2.000 baris.');$('prep-search').value='';filter();const row=await grid.addRow(M.flatten([M.blank(active,crypto.randomUUID())],workbook.month)[0],false);commit();await grid.scrollToRow(row);grid.addRange(row.getCell('partCode'),row.getCell('partCode'));selectCell(row.getCell('partCode'));row.getCell('partCode').edit();}));
  $('prep-delete').addEventListener('click',()=>action(async()=>{const ranged=grid.getRanges()[0]?.getRows()||[];const rows=ranged.length?ranged:(selected?[selected.getRow()]:[]);if(!rows.length)throw Error('Pilih sel pada baris yang ingin dihapus.');await grid.deleteRow(rows.map(row=>row.getData().id));commit();selected=null;}));
  async function undo(direction){const next=historyIndex+direction;if(next<0||next>=history.length)return;historyIndex=next;workbook=JSON.parse(history[next]);$('prep-name').value=workbook.name;dirty=json()!==savedJSON;result=null;await renderSheet();}
  $('prep-undo').addEventListener('click',()=>action(()=>undo(-1)));$('prep-redo').addEventListener('click',()=>action(()=>undo(1)));
  document.addEventListener('keydown',event=>{if(busy||!event.ctrlKey&&!event.metaKey||event.target.closest('input,textarea,select'))return;if(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y'){event.preventDefault();action(()=>undo(event.key.toLowerCase()==='y'||event.shiftKey?1:-1));}});
  $('prep-save').addEventListener('click',()=>action(async()=>{commit();const record=await api(id?'/'+encodeURIComponent(id):'',id?'PUT':'POST',{...workbook,...(id?{revision}:{})});id=record.id;revision=record.revision;workbook=record.payload;savedJSON=json();dirty=false;history=[json()];historyIndex=0;await renderSheet();await listDrafts();message('Draft tersimpan di server · revisi '+revision+'.');}));
  $('prep-simulate').addEventListener('click',()=>action(async()=>{commit();result=await api('/simulate','POST',workbook);summaries();showResults();}));
  $('prep-source').addEventListener('click',()=>{if(discardAllowed())action(async()=>{await replaceWorkbook(await api('/source?month='+encodeURIComponent(workbook.month)));await listDrafts();message('Snapshot sumber dimuat sebagai skenario baru.');});});
  $('prep-new').addEventListener('click',()=>{if(discardAllowed())action(async()=>{await replaceWorkbook(empty(workbook.month));await listDrafts();});});
  $('prep-scenarios').addEventListener('change',event=>{const next=event.target.value;if(!discardAllowed()){event.target.value=id||'';return;}action(async()=>{if(next){const record=await api('/'+encodeURIComponent(next));await replaceWorkbook(record.payload,record);}else await replaceWorkbook(empty(workbook.month));});});
  $('prep-month').addEventListener('change',event=>{const month=event.target.value;if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){event.target.value=workbook.month;message('Pilih bulan yang valid.',true);return;}if(!discardAllowed()){event.target.value=workbook.month;return;}action(()=>loadMonth(month));});
  $('prep-export').addEventListener('click',()=>action(async()=>{commit();const sheets=Object.keys(title).map(sheet=>{const columns=M.columns(sheet,workbook.month),rows=M.flatten(workbook[sheet],workbook.month);return {name:title[sheet],headers:columns.map(c=>c.date||c.title),rows:rows.map(row=>columns.map(c=>row[c.field]??''))};});const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';const response=await fetch('/table-documents/xlsx',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({title:workbook.name,subtitle:'Preparation PPIC · draft eksperimen '+workbook.month,headers:sheets[0].headers,rows:[],sheets})});if(!response.ok){const error=await response.json();throw Error(error.message||'Ekspor gagal.');}const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='Preparation-PPIC-'+workbook.month+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  workbook=empty($('prep-month').value);$('prep-name').value=workbook.name;
  action(async()=>{await replaceWorkbook(workbook);await loadMonth(workbook.month);});
})();
