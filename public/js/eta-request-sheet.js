(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v==null?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(v));
  const names={MATERIAL:'Material',PURCHASE_PART:'Purchase Part',UNIVERSAL_PART:'Universal Part',VENDOR:'Proses Vendor',CUSTOMER:'Material Customer',OTHER:'Lainnya'};
  const fields=['moq','qty','leadTimeDays','eta','readyDate','purchasePackageUomCode','materialWidth','materialLength'];
  const has=v=>v!==null&&v!==undefined&&v!=='';
  function clipboardValue(value,type){
    let text=String(value||'').trim();
    if(type==='number'){
      text=text.replace(/[\s\u00a0]/g,'');
      if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');
      else if(/^[+-]?\d{1,3}(\.\d{3})+$/.test(text))text=text.replace(/\./g,'');
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)&&Number.isFinite(Number(text))?text:'';
    }
    if(type==='date'){
      const parts=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(parts)text=parts[3]+'-'+parts[2].padStart(2,'0')+'-'+parts[1].padStart(2,'0');
      const date=new Date(text+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text?text:'';
    }
    return text.toUpperCase();
  }
  function draft(row){return {moq:row.confirmedMoq??row.moq??0,qty:row.confirmedQty??row.requiredQty??row.qty,leadTimeDays:row.confirmedLeadTimeDays??row.leadTime??'',eta:row.eta||row.targetArrivalDate||row.needDate||'',readyDate:row.requiresQc?(row.readyDate||row.eta||row.targetArrivalDate||row.needDate||''):'',purchasePackageUomCode:row.purchasePackageUomCode||'',materialWidth:row.materialWidth??'',materialLength:row.materialLength??'',sourceFingerprint:row.sourceFingerprint,confirmationId:row.confirmationRecord?.id||null};}
  const sumByUnit=rows=>Object.entries(rows.reduce((s,r)=>(s[r.uom]=(s[r.uom]||0)+Number(r.demandQty??r.requiredQty??r.qty),s),{})).map(([u,q])=>fmt(q)+' '+u).join(' · ');
  function mergeProblem(rows){if(rows.length<2)return 'Pilih minimal dua jadwal.';if(rows.some(r=>!r.canMerge)||new Set(rows.map(r=>r.mergeKey)).size!==1)return 'Pilih item, spesifikasi, satuan, partner, proses, dan paket PPIC yang sama.';return '';}
  function mount({api,reload,notify,openDetail}){
    const $=id=>document.getElementById(id),host=$('eta-request-sheet');
    if(!host)return null;
    let all=[],visible=[],month='',selected=new Set(),drafts=new Map(),collapsed=new Set(),saving=false,mode=false,lastSource='';
    const data=row=>drafts.get(row.id)||draft(row);
    const editable=row=>row.canConfirm===true;
    const picked=()=>all.filter(row=>selected.has(row.id));
    function controls(){
      const rows=picked();$('eta-selected').textContent=rows.length?`${rows.length} jadwal · ${sumByUnit(rows)}`:'Pilih baris untuk konfirmasi';
      $('eta-save-selected').disabled=saving||!rows.length;
      $('eta-merge-selected').disabled=saving||Boolean(mergeProblem(rows));
      $('eta-merge-selected').title=mergeProblem(rows)||'Gabungkan jadwal menjadi satu komitmen ETA';
      $('eta-sheet-all').checked=visible.some(editable)&&visible.filter(editable).every(row=>selected.has(row.id));
      $('eta-sheet-all').indeterminate=visible.some(row=>selected.has(row.id))&&!$('eta-sheet-all').checked;
    }
    function groupDate(row){
      const value=row.needDate||'',group=$('eta-sheet-group').value;
      if(group==='item')return row.code+(row.process?' · '+row.process:'');
      if(group==='month')return value.slice(0,7)||'Tanpa tanggal';
      if(group==='week'&&value){const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));return 'Minggu '+date.toISOString().slice(0,10);}
      return value||'Tanpa tanggal';
    }
    function input(row,key,type='number'){
      const value=data(row)[key]??'',customer=row.category==='CUSTOMER',readonly=!editable(row)||saving||key==='qty'&&row.qtyEditable===false;
      if(customer&&['moq','purchasePackageUomCode'].includes(key))return '—';
      if(customer&&['materialWidth','materialLength'].includes(key))return fmt(row[key]);
      if(key==='purchasePackageUomCode')return row.materialCode?`<select data-field="${key}" data-id="${esc(row.id)}" aria-label="Bentuk ${esc(row.code)}" ${readonly?'disabled':''}><option value="">Pilih</option>${['COIL','SHEET','PCS'].map(v=>`<option ${value===v?'selected':''}>${v}</option>`).join('')}</select>`:'—';
      if(['materialWidth','materialLength'].includes(key)&&!row.materialCode||key==='readyDate'&&!row.requiresQc)return '—';
      const required=!(customer&&key==='leadTimeDays')&&(!['materialWidth','materialLength'].includes(key)||key==='materialWidth'&&row.materialCode||key==='materialLength'&&data(row).purchasePackageUomCode==='SHEET');
      return `<input data-field="${key}" data-id="${esc(row.id)}" aria-label="${esc(({qty:'Qty konfirmasi',moq:'MOQ',leadTimeDays:'Lead time',eta:'ETA',readyDate:'Siap QC',materialWidth:'Lebar',materialLength:'Panjang'})[key])} ${esc(row.code)} ${esc(row.needDate)}" type="${type}" value="${esc(value)}" ${type==='number'?`step="any" min="${['qty','materialWidth'].includes(key)?'0.000001':'0'}" ${key==='leadTimeDays'?'max="3650"':''}`:''} ${required?'required':''} ${readonly?'disabled':''}>`;
    }
    function render(){
      const groups=new Map();
      for(const row of visible){const key=JSON.stringify([row.category,row.partnerCode,groupDate(row)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
      $('eta-sheet-body').innerHTML=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,rows])=>{
        rows.sort((a,b)=>String(a.needDate).localeCompare(String(b.needDate))||String(a.code).localeCompare(String(b.code)));
        const first=rows[0],closed=collapsed.has(key);
        return `<tr class="eta-sheet-group"><td colspan="16"><button type="button" data-collapse="${esc(key)}" aria-expanded="${!closed}">${closed?'▸':'▾'} <b>${esc(names[first.category]||first.category)} · ${esc(first.partnerCode||'Belum ada partner')} ${esc(first.partner||'')}</b><span>${esc(groupDate(first))} · ${rows.length} jadwal · ${esc(sumByUnit(rows))}</span></button></td></tr>`+(closed?'':rows.map(row=>{
          const d=data(row),changed=drafts.has(row.id),group=row.scheduleGroup;
          return `<tr data-sheet-row="${esc(row.id)}" class="${selected.has(row.id)?'is-selected ':''}${changed?'is-edited':''}"><td><input type="checkbox" data-pick="${esc(row.id)}" aria-label="Pilih ${esc(row.code)} ${esc(row.needDate)}" ${selected.has(row.id)?'checked':''} ${!editable(row)||saving?'disabled':''}></td><td class="eta-sheet-identity" title="${esc(row.name)}"><b>${esc(row.code)}</b><small>${esc(row.name)}${row.process?' · '+esc(row.process):''}</small></td><td title="${esc(row.partNumber)}">${esc(row.partNumber||'—')}</td><td>${esc(row.needDate||'—')}${row.sendDate?'<small>Kirim '+esc(row.sendDate)+'</small>':''}</td><td class="num">${fmt(row.demandQty)}</td><td>${esc(row.uom)}</td><td>${input(row,'moq')}</td><td>${input(row,'qty')}</td><td>${input(row,'leadTimeDays')}</td><td>${input(row,'eta','date')}</td><td>${input(row,'readyDate','date')}</td><td>${input(row,'purchasePackageUomCode')}</td><td>${input(row,'materialWidth')}</td><td>${input(row,'materialLength')}</td><td title="${esc(row.readiness?.reason||row.blockReason||'')}"><span class="eta-sheet-status ${row.confirmed?'confirmed':''}">${row.confirmed?'Terkonfirmasi':'Menunggu'}</span>${group?`<small title="${esc(group.originIds?.length||group.memberIds?.length)} jadwal asal">${esc(group.id)} · ${fmt(group.quantity)} ${esc(group.uom)}</small>`:''}</td><td><button type="button" data-sheet-detail="${esc(row.id)}" title="Rincian dan dokumen sumber" aria-label="Rincian ${esc(row.code)}">↗</button></td></tr>`;
        }).join(''));
      }).join('')||'<tr><td colspan="16" class="eta-sheet-empty">'+(all.length?'Tidak ada jadwal sesuai filter. Ubah pencarian atau nonaktifkan Fokus yang perlu ditindaklanjuti untuk melihat jadwal yang sudah dikonfirmasi.':'Belum ada permintaan ETA. Permintaan muncul setelah usulan PPIC Lab dikunci untuk konfirmasi.')+'</td></tr>';
      $('eta-sheet-range').textContent=visible.length+' jadwal · '+groups.size+' kelompok';controls();
    }
    function update({active,rows,filtered,period,loading}){
      host.hidden=!active;mode=active;if(!active)return;
      month=period;all=rows;visible=filtered;
      const signature=month+'|'+rows.map(row=>row.id+':'+row.sourceFingerprint+':'+(row.confirmationRecord?.id||'')).join('|');
      if(signature!==lastSource){lastSource=signature;selected.clear();drafts.clear();}
      if(loading){$('eta-sheet-body').innerHTML='<tr><td colspan="16" class="eta-sheet-empty">Memuat permintaan ETA PPIC Lab…</td></tr>';return;}
      render();
    }
    function changeField(node){
      const row=all.find(row=>row.id===node.dataset.id);if(!row||!editable(row))return;
      drafts.set(row.id,{...data(row),[node.dataset.field]:node.value});selected.add(row.id);
      node.closest('tr')?.classList.add('is-edited','is-selected');const check=node.closest('tr')?.querySelector('[data-pick]');if(check)check.checked=true;controls();
    }
    function validRows(rows){
      for(const row of rows){const d=data(row),customer=row.category==='CUSTOMER';if(!has(d.qty)||Number(d.qty)<=0||!customer&&(!has(d.moq)||Number(d.moq)<0||!has(d.leadTimeDays))||has(d.leadTimeDays)&&(!Number.isFinite(Number(d.leadTimeDays))||Number(d.leadTimeDays)<0||Number(d.leadTimeDays)>3650)||!d.eta||row.requiresQc&&!d.readyDate)return customer?`${row.code}: lengkapi qty, ETA dan tanggal siap QC; lead time opsional harus 0–3.650 hari.`:`${row.code}: lengkapi qty, MOQ, lead time, ETA dan tanggal siap QC.`;if(!customer&&row.materialCode&&(!d.purchasePackageUomCode||Number(d.materialWidth)<=0||d.purchasePackageUomCode==='SHEET'&&Number(d.materialLength)<=0))return `${row.code}: lengkapi bentuk, lebar dan panjang sheet material.`;}
      return '';
    }
    function show(merge){
      const rows=picked();if(!rows.length)return;
      const error=merge?mergeProblem(rows):validRows(rows);if(error){notify(error,true);return;}
      const first=rows[0],d=data(first),total=rows.reduce((n,r)=>n+Number(r.demandQty),0),moq=Math.max(...rows.map(r=>Number(data(r).moq)||0)),multiple=Math.max(...rows.map(r=>Number(r.orderMultiple)||0));
      const quantity=multiple>0?Math.ceil(Math.max(total,moq)/multiple)*multiple:Math.max(total,moq);
      $('eta-batch-title').textContent=merge?'Gabungkan jadwal ETA':'Konfirmasi '+rows.length+' jadwal';
      $('eta-batch-content').innerHTML=`<p><b>${esc(first.partnerCode)} ${merge?esc(first.partner):'· '+rows.length+' jadwal terpilih'}</b></p><div class="eta-batch-sources">${rows.map(r=>`<span>${esc(r.code)} · ${esc(r.needDate)} · ${fmt(r.demandQty)} ${esc(r.uom)}</span>`).join('')}</div><form id="eta-batch-form"><div class="eta-batch-fields">${merge?`<label>Total qty (${esc(first.uom)})<input name="qty" type="number" min="0.000001" step="any" value="${quantity}" required></label><label>MOQ gabungan<input name="moq" type="number" min="0" step="any" value="${moq}" required></label><label>Lead time (hari)<input name="leadTimeDays" type="number" min="0" max="3650" step="any" value="${esc(d.leadTimeDays)}" required></label><label>ETA ${first.category==='VENDOR'?'kembali':'tiba'}<input name="eta" type="date" value="${esc(d.eta)}" required></label>${rows.some(r=>r.requiresQc)?`<label>Siap setelah QC<input name="readyDate" type="date" value="${esc(d.readyDate)}" required></label>`:''}${first.materialCode?`<label>Bentuk material<select name="purchasePackageUomCode" required><option value="">Pilih</option>${['COIL','SHEET','PCS'].map(v=>`<option ${v===d.purchasePackageUomCode?'selected':''}>${v}</option>`).join('')}</select></label><label>Lebar (mm)<input name="materialWidth" type="number" min="0.000001" step="any" value="${esc(d.materialWidth)}" required></label><label>Panjang sheet (mm)<input name="materialLength" type="number" min="0" step="any" value="${esc(d.materialLength)}"></label>`:''}`:''}<label class="wide">Referensi konfirmasi<input name="reference" maxlength="500" placeholder="PIC · WA/email · tanggal" required></label><label class="wide">Catatan (opsional)<input name="notes" maxlength="2000"></label></div><p class="eta-batch-help">${merge?'MOQ berlaku sekali untuk total gabungan. Tanggal dan kuantitas kebutuhan asal tetap dapat ditelusuri.':'Nilai pada tabel akan disimpan untuk setiap jadwal terpilih.'}</p><div id="eta-batch-error" role="alert" hidden></div><footer><button type="submit" class="eta-button primary">${merge?'Gabung & simpan konfirmasi':'Simpan konfirmasi'}</button></footer></form>`;
      const form=$('eta-batch-form'),newId=()=>root.crypto?.randomUUID?.()||'eta-batch-'+Date.now()+'-'+Math.random().toString(36).slice(2);let requestId=newId();form.addEventListener('input',()=>{requestId=newId();});form.addEventListener('submit',async event=>{
        event.preventDefault();if(saving||!form.reportValidity())return;
        const values=Object.fromEntries(new FormData(form));
        const payload={month,requestId,merge,...values,items:rows.map(row=>({id:row.id,...data(row)}))};
        saving=true;$('eta-batch-close').disabled=true;form.querySelectorAll('input,select,button').forEach(node=>node.disabled=true);$('eta-batch-error').hidden=true;controls();
        try{await api('/modules/api/purchasing/eta-monitor/ppic/confirm-batch',payload);root.PpicConfirmationFeedback?.notify({month,source:'ppic'});$('eta-batch-dialog').close();selected.clear();drafts.clear();notify(merge?`${rows.length} jadwal berhasil digabung dan dikonfirmasi.`:`${rows.length} jadwal berhasil dikonfirmasi.`);await reload();}
        catch(error){$('eta-batch-error').textContent=error.message;$('eta-batch-error').hidden=false;}
        finally{saving=false;$('eta-batch-close').disabled=false;form.querySelectorAll('input,select,button').forEach(node=>node.disabled=false);controls();}
      });$('eta-batch-dialog').showModal();
    }
    host.addEventListener('input',event=>{if(event.target.matches('[data-field]'))changeField(event.target);});
    host.addEventListener('change',event=>{const node=event.target;if(node.matches('select[data-field]'))changeField(node);if(node.dataset.pick){if(node.checked)selected.add(node.dataset.pick);else selected.delete(node.dataset.pick);node.closest('tr')?.classList.toggle('is-selected',node.checked);controls();}});
    host.addEventListener('click',event=>{const node=event.target.closest('[data-collapse],[data-sheet-detail]');if(!node)return;if(node.dataset.collapse){const key=node.dataset.collapse;collapsed.has(key)?collapsed.delete(key):collapsed.add(key);render();}else{const row=all.find(r=>r.id===node.dataset.sheetDetail);if(row)openDetail(row);}});
    host.addEventListener('keydown',event=>{const node=event.target;if(!node.dataset.field||node.tagName==='SELECT'||!['Enter','ArrowUp','ArrowDown'].includes(event.key))return;const inputs=[...host.querySelectorAll('[data-field="'+node.dataset.field+'"]')].filter(n=>!n.disabled),index=inputs.indexOf(node),next=inputs[index+(event.key==='ArrowUp'?-1:1)];if(next){event.preventDefault();next.focus();next.select?.();}});
    host.addEventListener('paste',event=>{
      const node=event.target,text=event.clipboardData?.getData('text/plain');if(!node.dataset.field||!text||node.disabled)return;
      event.preventDefault();const displayed=[...host.querySelectorAll('tr[data-sheet-row]')],start=displayed.indexOf(node.closest('tr')),column=fields.indexOf(node.dataset.field);
      text.trimEnd().split(/\r?\n/).forEach((line,i)=>line.split('\t').forEach((value,j)=>{const target=displayed[start+i]?.querySelector('[data-field="'+fields[column+j]+'"]');if(target&&!target.disabled){target.value=clipboardValue(value,target.type);changeField(target);}}));
    });
    $('eta-sheet-all').addEventListener('change',event=>{for(const row of visible.filter(editable))event.target.checked?selected.add(row.id):selected.delete(row.id);render();});
    $('eta-sheet-group').addEventListener('change',render);
    $('eta-save-selected').addEventListener('click',()=>show(false));$('eta-merge-selected').addEventListener('click',()=>show(true));
    $('eta-batch-close').addEventListener('click',()=>{if(!saving)$('eta-batch-dialog').close();});$('eta-batch-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
    return {update,error:text=>{$('eta-sheet-body').innerHTML='<tr><td colspan="16" class="eta-sheet-empty">'+esc(text)+' Muat ulang permintaan ETA.</td></tr>';},hasChanges:()=>mode&&drafts.size>0,start:()=>{const row=visible.find(editable);if(row){selected.add(row.id);render();show(false);}}};
  }
  root.EtaRequestSheet={mount,draft,mergeProblem,clipboardValue};
})(typeof window==='undefined'?module.exports:window);
