(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepDailyPlan=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const origin=date=>Date.parse(date+'T00:00:00Z')/60000;
  const day=minute=>new Date(minute*60000).toISOString().slice(0,10);
  const clock=minute=>{const n=((Math.round(minute)%1440)+1440)%1440;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
  const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n)||0);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bounds=job=>[job.sourceStart+job.offsetMinutes,job.sourceEnd+job.offsetMinutes];
  function position(job,offset){const base=origin(job.date)+300;return Number.isInteger(offset)&&Math.abs(offset)<=1440&&job.sourceStart+offset>=base-1e-6&&job.sourceEnd+offset<=base+1440+1e-6;}
  function timeOffset(job,time){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Isi jam mulai yang valid.');
    const minute=Number(time.slice(0,2))*60+Number(time.slice(3));
    return Math.round(origin(job.date)+minute+(minute<300?1440:0)-job.sourceStart);
  }
  function apply(workbook,snapshot,change){
    const job=snapshot?.derived?.daily?.jobs.find(j=>j.id===change.id);
    if(!job||job.date.slice(0,7)!==workbook.month||change.sourceSignature!==job.sourceSignature)throw Error('Sumber alokasi berubah. Buka kembali proses dari hasil terbaru.');
    if(!change.reset&&!position(job,change.offsetMinutes))throw Error('Seluruh proses harus berada dalam rentang 05.00–05.00 hari produksi yang sama.');
    workbook.dailyScheduleOverrides ||= {};
    if(change.reset){delete workbook.dailyScheduleOverrides[job.sourceRowId]?.[job.date];if(!Object.keys(workbook.dailyScheduleOverrides[job.sourceRowId]||{}).length)delete workbook.dailyScheduleOverrides[job.sourceRowId];}
    else{workbook.dailyScheduleOverrides[job.sourceRowId] ||= {};workbook.dailyScheduleOverrides[job.sourceRowId][job.date]={offsetMinutes:change.offsetMinutes,sourceSignature:job.sourceSignature};}
    return true;
  }
  function view(data,date,query=''){
    const start=origin(date)+300,end=start+1440,term=query.trim().toLowerCase();
    const jobs=(data?.jobs||[]).filter(j=>j.date===date||j.segments.some(s=>s.end>start&&s.start<end));
    return {start,end,jobs,machines:(data?.machines||[]).map(m=>({...m,jobs:jobs.filter(j=>j.machineKey===m.id),windows:m.windows.filter(([a,b])=>b>start&&a<end)})).filter(m=>!term||[m.code,...m.jobs.flatMap(j=>[j.partCode,j.partNumber,j.partName,j.processCode,j.parentPartCode])].join(' ').toLowerCase().includes(term))};
  }
  function bars(job,index,start,summary=false){
    const manual=Boolean(job.offsetMinutes),issue=job.issues?.length;
    const title=[job.partCode,job.partNumber,job.processCode,fmt(job.quantity)+' '+job.uomCode,clock(bounds(job)[0])+'–'+clock(bounds(job)[1]),...job.issues||[]].join(' · ');
    return job.segments.filter(s=>s.end>start&&s.start<start+1440).map(s=>{
      const a=Math.max(start,s.start),b=Math.min(start+1440,s.end),style='left:'+((a-start)/1440*100)+'%;width:'+((b-a)/1440*100)+'%';
      return summary?'<i class="prep-daily-bar summary '+(issue?'issue':manual?'manual':'')+'" style="'+style+'" title="'+esc(title)+'"></i>':
        '<button type="button" class="prep-daily-bar '+(issue?'issue':manual?'manual':'')+'" data-daily-job="'+index+'" style="'+style+'" title="'+esc(title)+'" aria-label="'+esc(title)+'">'+esc(s.qty>0?fmt(s.qty)+' '+job.uomCode:'Setup')+'</button>';
    }).join('');
  }
  function closed(windows,start){
    const sorted=windows.map(([a,b])=>[Math.max(start,a),Math.min(start+1440,b)]).sort((a,b)=>a[0]-b[0]);let cursor=start,html='';
    const band=(a,b)=>'<i class="prep-daily-closed" style="left:'+((a-start)/1440*100)+'%;width:'+((b-a)/1440*100)+'%"></i>';
    for(const [a,b]of sorted){if(a>cursor)html+=band(cursor,a);cursor=Math.max(cursor,b);}if(cursor<start+1440)html+=band(cursor,start+1440);return html;
  }
  function chart(model,collapsed=new Set()){
    let html='<div class="prep-daily-row prep-daily-header"><div class="prep-daily-identity"><span class="prep-col-letter">A</span>Mesin / Child Part</div><div class="prep-daily-axis"><div class="prep-daily-dayband"><span>'+esc(day(model.start))+'</span><span>'+esc(day(model.end))+' (+1)</span></div><div class="prep-daily-hours">'+Array.from({length:24},(_,i)=>'<span>'+String((i+5)%24).padStart(2,'0')+':00</span>').join('')+'<b class="prep-daily-end">05:00</b></div></div></div>';
    model.machines.forEach((machine,mi)=>{
      const shade=closed(machine.windows,model.start),minutes=machine.jobs.reduce((n,j)=>n+j.segments.reduce((t,s)=>t+Math.max(0,Math.min(s.end,model.end)-Math.max(s.start,model.start)),0),0);
      html+='<div class="prep-daily-row prep-daily-machine"><div class="prep-daily-identity"><button type="button" data-daily-machine="'+mi+'" aria-expanded="'+!collapsed.has(machine.id)+'" aria-label="Buka/tutup mesin '+esc(machine.code)+'">'+(collapsed.has(machine.id)?'+':'−')+'</button><div><strong>'+esc(machine.code)+'</strong><small>'+machine.jobs.length+' proses · '+fmt(minutes)+' menit'+(!machine.windows.length?' · LIBUR / tidak tersedia':'')+'</small></div></div><div class="prep-daily-track">'+shade+machine.jobs.map(j=>bars(j,model.jobs.indexOf(j),model.start,true)).join('')+'</div></div>';
      if(!collapsed.has(machine.id))for(const job of machine.jobs){
        const index=model.jobs.indexOf(job),[a,b]=bounds(job);
        html+='<div class="prep-daily-row prep-daily-child"><div class="prep-daily-identity"><span class="prep-daily-branch">└</span><div><strong>'+esc(job.partCode)+(globalThis.PpicConfirmationFeedback?.marker(job,state.feedback,'daily')||'')+' <span>'+esc(job.partNumber||'—')+'</span></strong><small>'+esc(job.processCode||'—')+' · '+fmt(job.quantity)+' '+esc(job.uomCode)+' · CT '+fmt(job.cycleTimeSeconds)+' dtk</small><small>'+esc(job.parentPartCode)+' · '+clock(a)+'–'+clock(b)+(day(b)!==job.date?' (+1)':'')+(job.issues.length?' · ⚠ '+job.issues.length:'')+'</small></div></div><div class="prep-daily-track">'+shade+bars(job,index,model.start)+'</div></div>';
      }
    });
    if(!model.machines.length)html+='<p class="prep-daily-empty">Tidak ada mesin yang sesuai pencarian / sumber alokasi.</p>';
    else if(!model.jobs.length)html+='<p class="prep-daily-empty">Belum ada alokasi produksi pada rentang ini. Pilih tanggal lain atau periksa alokasi tab 02.</p>';
    return html;
  }
  let state={},doc,commit,model,collapsed=new Set(),selected=null,drag=null,submitting=false,suppressClick=false;
  const $=id=>doc?.getElementById('prep-daily-'+id);
  const ready=()=>!state.busy&&!state.loading&&!state.error&&Boolean(state.snapshot?.derived?.daily);
  function message(text=''){$('message').hidden=!text;$('message').textContent=text;}
  function render(){
    if(!doc)return;
    const month=state.month||'',last=month?new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10):'';
    if(month&&$('date').value.slice(0,7)!==month){$('date').value=month+'-01';collapsed.clear();}
    $('date').min=month+'-01';$('date').max=last;
    $('scenario').textContent=(state.name||month||'')+' · '+(state.locked?'LOCKED · PPIC Released':state.dirty?'Perubahan belum disimpan':'Draft aktif');
    for(const id of ['date','expand','collapse','search','save','undo','redo'])$(id).disabled=!ready();
    $('undo').disabled=!ready()||doc.getElementById('prep-undo').disabled;$('redo').disabled=!ready()||doc.getElementById('prep-redo').disabled;
    if(state.locked)for(const id of ['save','undo','redo'])$(id).disabled=true;
    $('prev').disabled=!ready()||$('date').value<=$('date').min;$('next').disabled=!ready()||$('date').value>=last;
    if(!ready()){$('chart').innerHTML='<p class="prep-daily-empty">'+esc(state.error||((state.loading||state.busy)?'Menghitung slot produksi…':'Buka workbook untuk memuat alokasi produksi.'))+'</p>';$('status').textContent=state.error?'Gagal memuat':'Menunggu sumber terbaru…';$('count').textContent='';$('unplaced').hidden=true;model=null;return;}
    const data=state.snapshot.derived.daily;model=view(data,$('date').value,$('search').value);
    const errors=model.jobs.filter(j=>j.issues.length).length;
    $('status').textContent=errors?errors+' proses perlu ditinjau':'Slot produksi tersedia';
    $('range').textContent=$('date').value+' 05.00 → '+day(model.end)+' 05.00';
    $('chart').innerHTML=chart(model,collapsed);$('basis').textContent=data.basis;
    if(state.locked){$('status').textContent='Snapshot PPIC Released · hanya baca';for(const button of $('chart').querySelectorAll('[data-daily-job]'))button.disabled=true;}
    $('count').textContent=model.machines.length+' mesin · '+model.jobs.length+' proses';
    const missing=data.unscheduled.filter(j=>!j.date||j.date===$('date').value);
    $('unplaced').hidden=!missing.length;$('unplaced-count').textContent=missing.length+' alokasi tanpa slot waktu';
    $('unplaced-list').innerHTML=missing.map(j=>'<li>'+esc([j.partCode,j.partNumber,fmt(j.quantity),j.reason].filter(Boolean).join(' · '))+'</li>').join('');
  }
  function update(next){const changed=state.snapshot!==next.snapshot||state.busy!==next.busy||state.locked!==next.locked||state.loading!==next.loading||state.month!==next.month||state.dirty!==next.dirty||state.name!==next.name||state.error!==next.error;state=next;if(changed){drag=null;render();}}
  async function save(job,offsetMinutes,reset=false){
    if(state.locked)throw Error('Bulan sudah lock. Jadwal hanya dapat dibaca.');
    if(!ready()||submitting)throw Error('Tunggu perhitungan terbaru.');
    if(!reset&&!position(job,offsetMinutes))throw Error('Posisi melewati rentang 05.00–05.00.');
    submitting=true;for(const id of ['apply','reset','cancel','close'])$(id).disabled=true;
    try{await commit({id:job.id,sourceSignature:job.sourceSignature,offsetMinutes,reset});message(reset?'Posisi kembali mengikuti alokasi otomatis.':'Posisi diperbarui di draft. Periksa penanda konflik, lalu Simpan draft.');}
    finally{submitting=false;for(const id of ['apply','reset','cancel','close'])$(id).disabled=false;}
  }
  function open(job){
    if(state.locked||!ready()||submitting)return;
    if(job.date!==$('date').value){message('Slot ini berasal dari hari produksi '+job.date+'. Buka tanggal tersebut untuk mengubahnya.');return;}
    selected=job;$('detail').textContent=[state.snapshot.derived.daily.machines.find(m=>m.id===job.machineKey)?.code,job.partCode,job.partNumber,job.processCode].filter(Boolean).join(' · ');
    $('start').value=clock(bounds(job)[0]);$('duration').textContent=fmt(job.quantity)+' '+job.uomCode+' · '+fmt(job.loadMinutes-job.setupMinutes)+' menit + '+fmt(job.setupMinutes)+' menit = '+fmt(job.loadMinutes)+' menit';
    $('issues').innerHTML=job.issues.map(i=>'<li>'+esc(i)+'</li>').join('');$('error').hidden=true;preview();$('dialog').showModal();$('start').focus();
  }
  function preview(){if(!selected)return;try{const offset=timeOffset(selected,$('start').value);$('preview').textContent='Selesai '+clock(selected.sourceEnd+offset)+(day(selected.sourceEnd+offset)!==selected.date?' (+1 hari)':'')+(position(selected,offset)?'':' · Di luar rentang 05.00–05.00');}catch(e){$('preview').textContent=e.message;}}
  function mount(document,onCommit){
    doc=document;commit=onCommit;
    for(const name of ['back','save','undo','redo'])$(name).addEventListener('click',()=>doc.getElementById(name==='back'?'prep-page-workbook':'prep-'+name).click());
    $('date').addEventListener('change',()=>{if($('date').value<$('date').min||$('date').value>$('date').max||!$('date').value)$('date').value=$('date').min;message();render();});
    $('search').addEventListener('input',render);
    for(const [id,delta]of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{$('date').value=day(origin($('date').value)+delta*1440);message();render();});
    $('expand').addEventListener('click',()=>{collapsed.clear();render();});$('collapse').addEventListener('click',()=>{collapsed=new Set(model.machines.map(m=>m.id));render();});
    $('chart').addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const toggle=event.target.closest('[data-daily-machine]');if(toggle){const id=model.machines[Number(toggle.dataset.dailyMachine)].id;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);render();return;}const button=event.target.closest('[data-daily-job]');if(button)open(model.jobs[Number(button.dataset.dailyJob)]);});
    $('chart').addEventListener('keydown',event=>{const button=event.target.closest('[data-daily-job]');if(!button||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const job=model.jobs[Number(button.dataset.dailyJob)];if(job.date!==$('date').value)return;save(job,job.offsetMinutes+(event.key==='ArrowLeft'?-15:15)).catch(e=>message(e.message));});
    $('chart').addEventListener('pointerdown',event=>{suppressClick=false;const button=event.target.closest('[data-daily-job]');if(state.locked||!button||event.button!==0||!ready()||submitting)return;const job=model.jobs[Number(button.dataset.dailyJob)];if(job.date!==$('date').value)return;drag={button,job,x:event.clientX,width:button.parentElement.getBoundingClientRect().width,pointer:event.pointerId,index:button.dataset.dailyJob,offset:job.offsetMinutes,moved:false};button.setPointerCapture(event.pointerId);});
    $('chart').addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;const delta=event.clientX-drag.x;if(Math.abs(delta)<4&&!drag.moved)return;drag.moved=true;drag.offset=Math.round((drag.job.offsetMinutes+delta/drag.width*1440)/15)*15;const shift=(drag.offset-drag.job.offsetMinutes)/1440*drag.width;for(const bar of $('chart').querySelectorAll('[data-daily-job="'+drag.index+'"]')){bar.style.transform='translateX('+shift+'px)';bar.classList.add('dragging');}message(clock(drag.job.sourceStart+drag.offset)+' → '+clock(drag.job.sourceEnd+drag.offset)+(position(drag.job,drag.offset)?'':' · Di luar rentang hari produksi'));});
    $('chart').addEventListener('pointerup',event=>{if(!drag||drag.pointer!==event.pointerId)return;const current=drag;drag=null;if(!current.moved)return;suppressClick=true;render();save(current.job,current.offset).catch(e=>message(e.message));});
    const cancelDrag=()=>{if(drag){drag=null;suppressClick=true;render();message('Pergeseran dibatalkan.');}};
    $('chart').addEventListener('pointercancel',cancelDrag);doc.addEventListener('keydown',e=>{if(e.key==='Escape')cancelDrag();});
    const close=()=>{if(submitting)return;$('dialog').close();selected=null;};for(const id of ['close','cancel'])$(id).addEventListener('click',close);
    $('dialog').addEventListener('cancel',e=>{if(submitting)e.preventDefault();else selected=null;});$('start').addEventListener('input',preview);
    const submit=async reset=>{try{if(!selected)return;await save(selected,reset?0:timeOffset(selected,$('start').value),reset);close();}catch(e){$('error').textContent=e.message;$('error').hidden=false;}};
    $('form').addEventListener('submit',event=>{event.preventDefault();submit(false);});$('reset').addEventListener('click',()=>submit(true));
    return {render};
  }
  return {apply,view,chart,position,timeOffset,clock,bounds,mount,update,notify:text=>{if(doc)message(text);}};
});
