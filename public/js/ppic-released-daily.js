(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PpicReleasedDaily=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const fmt=value=>numeric(value)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value)):'—';
  const origin=date=>Date.parse(date+'T00:00:00Z')/60000;
  const day=minute=>new Date(minute*60000).toISOString().slice(0,10);
  const dateValid=date=>/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(date||'')&&Number.isFinite(origin(date))&&day(origin(date))===date;
  const monthValid=month=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'');
  const lastDate=month=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);
  const addDay=(date,count=1)=>day(origin(date)+count*1440);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const clock=minute=>{if(!numeric(minute))return '—';const n=((Math.round(Number(minute))%1440)+1440)%1440;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
  const link=(number,href)=>number&&typeof href==='string'&&/^\/modules\//.test(href)&&!href.includes('\\')?'<a href="'+esc(href)+'">'+esc(number)+'</a>':esc(number||'—');
  const machineKey=job=>String(job.machineKey||job.machineId||job.machineCode||'UNKNOWN');
  const recoveryJob=job=>Boolean(job.recoveryId||job.sourceNgId||job.isRecovery||job.sourceType==='PPIC_RECOVERY'||job.planType==='RECOVERY');
  function machineLabels(machines,jobs,metadata=[]){
    const labels=Array.isArray(metadata)?metadata:Object.entries(metadata).map(([id,value])=>typeof value==='string'?{id,label:value}:{id,...value});
    const map=new Map(machines.map(machine=>[String(machine.id),{...machine}]));
    for(const job of jobs)if(!map.has(machineKey(job)))map.set(machineKey(job),{id:machineKey(job),code:job.machineCode||machineKey(job),windows:null});
    for(const machine of map.values()){
      const master=labels.find(item=>String(item.id||item.machineId||item.machineKey)===machine.id||String(item.machineCode||item.code)===machine.code);
      const name=String(master?.machineName||master?.name||'').trim(),station=name.match(/(?:^|\s|\()([A-Z]{1,3}-\d+)(?=$|\s|\))/i);
      machine.label=master?.machineNumber||master?.machineNo||master?.displayNumber||master?.label||station?.[1]||name||machine.code;
    }
    return [...map.values()];
  }

  function chartModel(jobs=[],machines=[],date,filter=''){
    const start=origin(date)+300,end=start+1440,map=new Map();
    for(const machine of machines){const id=String(machine.id||machine.machineKey||machine.code);map.set(id,{...machine,id,code:machine.code||machine.machineCode||id,jobs:[],windows:machine.windows??null});}
    for(const job of jobs){const id=machineKey(job);if(!map.has(id))map.set(id,{id,code:job.machineCode||id,jobs:[],windows:null});}
    const visible=jobs.filter(job=>job.date===date||(job.segments||[]).some(segment=>segment.end>start&&segment.start<end));
    for(const job of visible)map.get(machineKey(job)).jobs.push(job);
    const stationRank=machine=>/^[A-Z]{1,3}-?\d+$/i.test(machine.label||machine.code)?0:1;
    return {start,end,jobs:visible,machines:[...map.values()].filter(machine=>!filter||machine.id===filter).sort((a,b)=>stationRank(a)-stationRank(b)||(a.label||a.code).localeCompare(b.label||b.code,undefined,{numeric:true}))};
  }
  function segments(job,start){
    return (job.segments||[]).flatMap(segment=>{
      if(!numeric(segment.start)||!numeric(segment.end)||segment.end<=segment.start)return [];
      const setup=Math.max(0,Math.min(segment.end-segment.start,Number(segment.setupMinutes)||0));
      const pieces=setup>0?[{start:segment.start,end:segment.start+setup,setup:true},{start:segment.start+setup,end:segment.end,setup:false}]:[{start:segment.start,end:segment.end,setup:!(segment.qty>0)}];
      return pieces.filter(piece=>piece.end>start&&piece.start<start+1440&&piece.end>piece.start).map(piece=>({...piece,left:(Math.max(start,piece.start)-start)/1440*100,width:(Math.min(start+1440,piece.end)-Math.max(start,piece.start))/1440*100,qty:segment.qty}));
    });
  }
  function closed(windows,start){
    if(!Array.isArray(windows))return '';
    let cursor=start,html='';
    const band=(a,b)=>'<i class="rd-gantt-closed" style="left:'+((a-start)/1440*100)+'%;width:'+((b-a)/1440*100)+'%" aria-hidden="true"></i>';
    for(const [a,b]of windows.filter(([a,b])=>b>start&&a<start+1440).map(([a,b])=>[Math.max(start,a),Math.min(start+1440,b)]).sort((a,b)=>a[0]-b[0])){if(a>cursor)html+=band(cursor,a);cursor=Math.max(cursor,b);}
    if(cursor<start+1440)html+=band(cursor,start+1440);return html;
  }
  function bars(job,start,summary=false){
    const isRecovery=recoveryJob(job);
    return segments(job,start).map(segment=>{
      const text=[isRecovery?'Recovery':'Release',job.partCode,job.processCode,segment.setup?'Setup':fmt(segment.qty)+' '+(job.uomCode||''),clock(segment.start)+'–'+clock(segment.end),...job.issues||[]].join(' · ');
      return '<span class="rd-gantt-bar'+(isRecovery?' is-recovery':'')+(segment.setup?' is-setup':'')+(job.issues?.length?' is-issue':'')+'" style="left:'+segment.left+'%;width:'+segment.width+'%" title="'+esc(text)+'"'+(!summary?' role="img" aria-label="'+esc(text)+'"':' aria-hidden="true"')+'>'+(!summary?esc(segment.setup?'Setup':fmt(segment.qty)+' '+(job.uomCode||'')):'')+'</span>';
    }).join('');
  }
  function jobIdentity(job){
    const schedules=[...new Map([...(job.scheduleNumber?[{scheduleNumber:job.scheduleNumber}]:[]),...(job.executionSchedules||job.nativeSchedules||[])].filter(row=>typeof row.scheduleNumber==='string'&&row.scheduleNumber).map(row=>[row.scheduleNumber,row])).values()];
    const label=esc(job.partCode)+' · '+esc(job.processCode||'—');
    const href=number=>'/modules/production/daily-production-schedules/'+encodeURIComponent(number);
    const primary=schedules.length?'<a class="rd-job-link" href="'+href(schedules[0].scheduleNumber)+'" aria-label="Buka Daily Plan '+esc(schedules[0].scheduleNumber)+'" title="'+esc(schedules[0].scheduleNumber)+'">'+label+'</a>':label;
    const extra=schedules.slice(1).map((row,index)=>'<a class="rd-job-link" href="'+href(row.scheduleNumber)+'" title="'+esc(row.scheduleNumber)+'" aria-label="Buka Daily Plan '+esc(row.scheduleNumber)+'">DPS '+(index+2)+'</a>').join(' · ');
    return '<strong title="'+esc([job.partCode,job.partNumber,job.partName].filter(Boolean).join(' · '))+'">'+primary+(globalThis.PpicConfirmationFeedback?.marker(job,null,'daily')||'')+'</strong><small>'+esc(job.partNumber||job.parentPartCode||'')+(recoveryJob(job)?' · Recovery':'')+(extra?' · '+extra:'')+'</small>';
  }
  function chart(model,collapsed=new Set()){
    let html='<div class="rd-gantt"><div class="rd-gantt-row rd-gantt-header"><div class="rd-gantt-identity">Mesin / Part / Proses</div><div class="rd-gantt-axis"><div class="rd-gantt-days"><span>'+esc(day(model.start))+'</span><span>'+esc(day(model.end))+' (+1)</span></div><div class="rd-gantt-hours">'+Array.from({length:24},(_,i)=>'<span>'+String((i+5)%24).padStart(2,'0')+':00</span>').join('')+'</div><b class="rd-gantt-end">05:00</b></div></div>';
    for(const machine of model.machines){
      const shade=closed(machine.windows,model.start),minutes=machine.jobs.reduce((sum,job)=>sum+(job.segments||[]).reduce((total,s)=>total+Math.max(0,Math.min(s.end,model.end)-Math.max(s.start,model.start)),0),0);
      html+='<div class="rd-gantt-row rd-gantt-machine"><div class="rd-gantt-identity"><button type="button" data-rd-machine="'+esc(machine.id)+'" aria-expanded="'+!collapsed.has(machine.id)+'" aria-label="Buka atau tutup mesin '+esc(machine.label||machine.code)+'">'+(collapsed.has(machine.id)?'+':'−')+'</button><strong title="'+esc(machine.code)+'">'+esc(machine.label||machine.code)+'</strong><span class="rd-job-qty">'+machine.jobs.length+' proses · '+fmt(minutes)+' menit</span></div><div class="rd-gantt-track">'+shade+machine.jobs.map(job=>bars(job,model.start,true)).join('')+'</div></div>';
      if(!collapsed.has(machine.id))for(const job of machine.jobs){
        html+='<div class="rd-gantt-row"><div class="rd-gantt-identity"><div>'+jobIdentity(job)+'</div><span class="rd-job-qty">'+fmt(job.quantity)+' '+esc(job.uomCode)+'</span></div><div class="rd-gantt-track">'+shade+bars(job,model.start)+'</div></div>';
      }
    }
    html+='</div>';
    if(!model.machines.length||!model.machines.some(machine=>machine.jobs.length))html+='<p class="rd-empty">Tidak ada jadwal produksi pada tanggal dan mesin terpilih.</p>';
    return html;
  }
  function outstanding(items=[],date,machineCode=''){
    return items.filter(row=>dateValid(row.sourceDate)&&row.sourceDate<=date&&Number(row.remainingQty)>1e-6&&(!machineCode||row.machineCode===machineCode)).sort((a,b)=>a.sourceDate.localeCompare(b.sourceDate)||String(a.partCode).localeCompare(String(b.partCode)));
  }
  function candidates(jobs,source,targetDate){
    const sourceJob=jobs.find(job=>job.id===source?.sourceJobId);
    if(!sourceJob)return [];
    return jobs.filter(job=>job.date===targetDate&&job.sourceRowId===sourceJob.sourceRowId&&machineKey(job)===machineKey(sourceJob)&&job.uomCode===sourceJob.uomCode);
  }
  function validateForm(input,source,jobs,currentDate=today()){
    if(!source?.id||!(source.remainingQty>0))throw Error('NG sumber sudah ditindaklanjuti. Perbarui kondisi aktual.');
    if(!numeric(input.quantity)||!(Number(input.quantity)>0)||Number(input.quantity)>Number(source.remainingQty)+1e-6)throw Error('Qty harus lebih dari 0 dan tidak melebihi sisa NG.');
    if(!dateValid(input.targetDate)||input.targetDate.slice(0,7)!==input.month||input.targetDate<=source.sourceDate||input.targetDate<currentDate)throw Error('Pilih tanggal setelah NG terjadi, mulai hari ini, dalam bulan release yang sama.');
    if(!['NEW_PLAN','ADD_QTY'].includes(input.mode))throw Error('Pilih cara recovery.');
    if(input.mode==='ADD_QTY'&&!candidates(jobs,source,input.targetDate).some(job=>job.id===input.targetJobId))throw Error('Pilih jadwal tujuan dengan proses, mesin, dan UOM yang sama.');
    return {...input,quantity:Number(input.quantity)};
  }
  function previewHtml(data){
    const notes=(data.warnings||[]).map(note=>'<li class="rd-warning">'+esc(note)+'</li>').join(''),blockers=(data.blockers||[]).map(note=>'<li class="rd-blocker">'+esc(note)+'</li>').join('');
    const job=data.job,cap=data.capacity||{};
    let html='<h4>'+(!data.canCommit?'Recovery perlu diperbaiki':'Hasil pemeriksaan recovery')+'</h4>'+(notes||blockers?'<ul>'+blockers+notes+'</ul>':'');
    if(job)html+='<p><strong>'+esc(job.machineCode||cap.machineCode||job.machineKey)+'</strong> · '+esc(job.date)+' · '+fmt(job.quantity)+' '+esc(job.uomCode)+' · '+(job.segments||[]).map(s=>esc(clock(s.start)+'–'+clock(s.end))).join(', ')+'</p>';
    html+='<p class="rd-capacity"><span>Tersedia <strong>'+fmt(cap.availableMinutes)+'</strong> menit</span><span>Terpakai <strong>'+fmt(cap.occupiedMinutes)+'</strong> menit</span><span>Recovery <strong>'+fmt(cap.requiredMinutes)+'</strong> menit</span><span>Sisa <strong>'+fmt(cap.remainingMinutes)+'</strong> menit</span></p>';
    html+='<div class="rd-table-wrap"><table data-enterprise-table="off"><thead><tr><th>Material / part input</th><th>Diperlukan</th><th>Tersedia</th><th>Kurang</th><th>UOM</th><th>Kondisi</th></tr></thead><tbody>'+(data.materials||[]).map(row=>'<tr><td>'+esc(row.partCode)+'</td><td class="is-numeric">'+fmt(row.requiredQty)+'</td><td class="is-numeric">'+fmt(row.availableQty)+'</td><td class="is-numeric'+(row.shortageQty>0?' is-shortage':'')+'">'+fmt(row.shortageQty)+'</td><td>'+esc(row.uomCode)+'</td><td>'+esc(row.status||'Belum terverifikasi')+'</td></tr>').join('')+'</tbody></table></div>';
    if(!data.materials?.length)html+='<p>Ikuti hasil validasi sumber material sebelum menyimpan recovery.</p>';
    return html;
  }

  function mount(doc){
    const root=doc.getElementById('released-daily');if(!root)return {update(){},refresh(){}};
    const $=id=>doc.getElementById('rd-'+id);
    let state={},data=null,planData=null,error='',loading=false,serial=0,previewSerial=0,selected=null,preview=null,requestId='',submitting=false,checking=false,uncertain=null,collapsed=new Set(),visibleNg=[];
    const ready=()=>state.active&&state.payload?.status==='LOCKED'&&monthValid(state.month);
    const jobs=()=>(data?.jobs||planData?.jobs||state.payload?.views?.daily||state.payload?.items||[]).map(job=>({...job,scheduleChanges:globalThis.PpicConfirmationFeedback?.changesFor(job,state.payload?.feedback,'daily')}));
    const machines=()=>machineLabels(data?.machines||planData?.machines||state.payload?.snapshot?.derived?.daily?.machines||[],jobs(),state.payload?.machineLabels||[]);
    const machineLabel=code=>machines().find(machine=>machine.code===code||machine.id===code)?.label||code;
    const note=(text,isError=false)=>{$('message').textContent=text;$('message').classList.toggle('is-error',isError);};
    const selectedCode=()=>{const id=$('machine').value;return id?(chartModel(jobs(),machines(),$('date').value).machines.find(machine=>machine.id===id)?.code||id):'';};
    const uid=()=>crypto.randomUUID();
    function controls(){
      const month=monthValid(state.month)?state.month:'2000-01';
      for(const id of ['date','machine'])$(id).disabled=!ready();
      $('prev').disabled=!ready()||$('date').value<month+'-02';$('next').disabled=!ready()||$('date').value>=lastDate(month);
      for(const id of ['quantity','target-date','tomorrow','mode','target-job'])$(id).disabled=submitting||checking||Boolean(uncertain);
      $('check').disabled=submitting||checking||Boolean(uncertain);$('commit').disabled=submitting||checking||(!uncertain&&(!preview?.canCommit||!preview?.previewHash));
      $('close').disabled=submitting;$('cancel').disabled=submitting;
      $('check').textContent=checking?'Memeriksa…':'Periksa material & kapasitas';$('commit').textContent=submitting?'Menyimpan…':uncertain?'Coba lagi penyimpanan':'Simpan recovery';
    }
    function render(){
      root.hidden=!state.active;controls();if(!state.active)return;
      if(!ready()){
        note(state.error||((state.loading)?'Memuat rencana release…':'Bulan ini belum dirilis. Kondisi aktual dan recovery tersedia setelah Lock & Release.'),Boolean(state.error));
        $('chart').innerHTML='<p class="rd-empty">'+esc(state.error||'Rencana harian resmi belum tersedia.')+'</p>';$('summary').innerHTML='';$('actual-body').innerHTML='';$('ng-body').innerHTML='';$('ng-count').textContent='';$('range').textContent='';return;
      }
      const previous=$('machine').value,all=chartModel(jobs(),machines(),$('date').value);
      $('machine').innerHTML='<option value="">Semua mesin</option>'+all.machines.map(machine=>'<option value="'+esc(machine.id)+'">'+esc(machine.label||machine.code)+'</option>').join('');
      $('machine').value=all.machines.some(machine=>machine.id===previous)?previous:'';
      const model=chartModel(jobs(),machines(),$('date').value,$('machine').value);$('chart').innerHTML=chart(model,collapsed);
      $('range').textContent=$('date').value+' 05:00 → '+day(model.end)+' 05:00';
      note(error?'Aktual gagal diperbarui: '+error:loading?'Memuat kondisi aktual…':'Jadwal release dan recovery tersimpan · pembaruan aktual otomatis 15 detik',Boolean(error));
      if(!data){
        $('summary').innerHTML='<div class="rd-summary-block">'+esc(error?'Aktual belum tersedia':'Memuat ringkasan aktual…')+'</div>';
        const empty='<tr><td colspan="8" class="rd-empty">'+esc(error?'Sumber aktual belum tersedia. Coba Perbarui data.':'Memuat kondisi aktual…')+'</td></tr>';
        $('actual-body').innerHTML=empty;$('ng-body').innerHTML=empty;$('ng-count').textContent='';return;
      }
      const sum=data.summary||{};
      $('summary').innerHTML=(sum.byUom||[]).map(row=>'<div class="rd-summary-block"><strong>'+esc(row.uomCode||'UOM tidak diketahui')+'</strong><span>Good <strong>'+fmt(row.goodQty)+'</strong></span><span>NG <strong class="rd-ng-value">'+fmt(row.ngQty)+'</strong></span></div>').join('')+'<div class="rd-summary-block"><span>Downtime <strong>'+fmt(sum.downtimeMinutes)+'</strong> menit</span></div><div class="rd-summary-block"><span>Belum terhubung <strong>'+fmt(sum.unlinkedCount)+'</strong> log</span></div>'+(!(sum.byUom||[]).length?'<div class="rd-summary-block"><small>Belum ada aktual approved yang terhubung.</small></div>':'');
      $('updated').textContent=data.asOf?'Diperbarui '+new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(data.asOf))+' WIB · 15 detik':'Pembaruan otomatis setiap 15 detik';
      const code=selectedCode(),rows=(data.actualRows||[]).filter(row=>(!row.date||row.date===$('date').value)&&(!code||row.machineCode===code));
      const statuses={LINKED:['Terhubung · approved','is-linked'],PENDING_APPROVAL:['Menunggu approval','is-pending'],UNLINKED:['Belum terhubung','is-unlinked']};
      $('actual-body').innerHTML=rows.map(row=>{const status=statuses[row.status]||['Belum terverifikasi','is-unlinked'];return '<tr><td>'+esc(machineLabel(row.machineCode))+'</td><td class="rd-part-cell"><strong>'+esc(row.partCode)+'</strong><small>'+esc(row.processCode)+'</small></td><td class="is-numeric">'+fmt(row.goodQty)+'</td><td class="is-numeric">'+fmt(row.ngQty)+'</td><td>'+esc(row.uomCode)+'</td><td class="is-numeric">'+fmt(row.downtimeMinutes)+'</td><td><span class="rd-status '+status[1]+'">'+status[0]+'</span></td><td>'+link(row.sourceNumber,row.sourceHref)+'</td></tr>';}).join('')||'<tr><td colspan="8" class="rd-empty">Belum ada log produksi pada tanggal dan mesin terpilih.</td></tr>';
      visibleNg=outstanding(data.outstandingNg,$('date').value,code);$('ng-count').textContent=visibleNg.length+' sumber NG terbuka';
      $('ng-body').innerHTML=visibleNg.map((row,index)=>'<tr><td>'+esc(row.sourceDate)+(row.sourceDate<$('date').value?'<span class="rd-carry">Dari hari sebelumnya</span>':'')+'</td><td>'+esc(machineLabel(row.machineCode))+'</td><td class="rd-part-cell"><strong>'+esc(row.partCode)+'</strong><small>'+esc(row.processCode)+'</small></td><td class="is-numeric">'+fmt(row.quantity)+'</td><td class="is-numeric">'+fmt(row.recoveredQty)+'</td><td class="is-numeric">'+fmt(row.remainingQty)+'</td><td>'+esc(row.uomCode)+'</td><td>'+link(row.sourceNumber,row.sourceHref)+'</td><td><button type="button" class="rd-recover-button" data-rd-recover="'+index+'">'+(uncertain?.sourceNgId===row.id?'Periksa penyimpanan':'Jadwalkan recovery')+'</button></td></tr>').join('')||'<tr><td colspan="9" class="rd-empty">Tidak ada NG terhubung yang belum dijadwalkan sampai tanggal ini.</td></tr>';
    }
    async function api(path,body){
      const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';
      const response=await fetch('/modules/api/planning-ppic/preparation/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(45000),...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json();if(!response.ok)throw Object.assign(Error(result.message||'Data gagal diproses.'),{status:response.status});return result;
    }
    async function refresh(force=false){
      if(!ready()||loading&&!force||submitting)return;
      const request=++serial,month=state.month,date=$('date').value;loading=true;error='';render();
      try{
        const result=await api('released-daily?'+new URLSearchParams({month,date}));
        if(request!==serial||month!==state.month||date!==$('date').value||!state.active)return;
        if(result.month!==month||result.date!==date||result.status!=='LOCKED'||state.payload?.id&&result.releaseId!==state.payload.id)throw Error('Sumber aktual tidak sesuai versi, bulan, dan tanggal release.');
        data=result;planData={jobs:result.jobs,machines:result.machines};
        if(uncertain&&(result.recoveries||[]).some(item=>item.requestId===uncertain.requestId)){uncertain=null;selected=null;preview=null;$('dialog').close();}
      }catch(e){if(request===serial){data=null;error=e.message;}}
      finally{if(request===serial){loading=false;render();}}
    }
    function resetPreview(){previewSerial++;preview=null;$('preview').hidden=true;$('error').hidden=true;controls();}
    function targets(){
      const old=$('target-job').value,list=candidates(jobs(),selected,$('target-date').value);
      $('target-label').hidden=$('mode').value!=='ADD_QTY';
      $('target-job').innerHTML='<option value="">'+(list.length?'Pilih jadwal tujuan':'Tidak ada jadwal yang sesuai pada tanggal ini')+'</option>'+list.map(job=>'<option value="'+esc(job.id)+'">'+esc(machineLabel(job.machineCode||machineKey(job)))+' · '+esc(job.partCode)+' · '+fmt(job.quantity)+' '+esc(job.uomCode)+' · '+(job.segments||[]).map(s=>esc(clock(s.start)+'–'+clock(s.end))).join(', ')+'</option>').join('');
      $('target-job').value=list.some(job=>job.id===old)?old:list.length===1?list[0].id:'';
    }
    function nextAvailable(){return [addDay($('date').value),addDay(selected.sourceDate),today()].sort().at(-1);}
    function open(source){
      if(!ready()||submitting||!data)return;
      if(uncertain&&uncertain.sourceNgId!==source.id){note('Penyimpanan recovery sebelumnya belum terkonfirmasi. Buka sumber NG sebelumnya untuk mencoba kembali.',true);return;}
      selected=source;requestId=uncertain?.requestId||uid();resetPreview();
      $('source').textContent=[source.partCode,source.partName,machineLabel(source.machineCode),'NG terjadi '+source.sourceDate,source.sourceNumber].filter(Boolean).join(' · ');
      $('quantity').value=uncertain?.quantity??source.remainingQty;$('quantity').max=source.remainingQty;
      $('quantity-help').textContent='Maksimal '+fmt(source.remainingQty)+' '+source.uomCode+' dari NG tanggal '+source.sourceDate;
      $('target-date').min=[addDay(source.sourceDate),today()].sort().at(-1);$('target-date').max=lastDate(state.month);
      $('target-date').value=uncertain?.targetDate||nextAvailable();$('mode').value=uncertain?.mode||'NEW_PLAN';targets();
      if(uncertain){$('target-job').value=uncertain.targetJobId||'';$('error').textContent='Status penyimpanan belum terkonfirmasi. Coba lagi dengan permintaan yang sama untuk mencegah duplikasi.';$('error').hidden=false;}
      controls();$('dialog').showModal();$('quantity').focus();
    }
    function input(){return {month:state.month,sourceNgId:selected?.id,quantity:$('quantity').value,targetDate:$('target-date').value,mode:$('mode').value,...($('mode').value==='ADD_QTY'?{targetJobId:$('target-job').value}:{}),requestId};}
    async function check(){
      if(!selected||checking||submitting||uncertain)return;
      let body;try{body=validateForm(input(),selected,jobs());}catch(e){$('error').textContent=e.message;$('error').hidden=false;return;}
      resetPreview();const request=++previewSerial;checking=true;controls();
      try{const result=await api('recovery-preview',body);if(request!==previewSerial||!selected)return;preview={...result,input:body};$('preview').innerHTML=previewHtml(result);$('preview').hidden=false;}
      catch(e){if(request===previewSerial){$('error').textContent=e.message;$('error').hidden=false;}}
      finally{if(request===previewSerial){checking=false;controls();}}
    }
    async function commit(){
      if(submitting||checking||(!uncertain&&(!selected||!preview?.canCommit||!preview.previewHash)))return;
      const body=uncertain||{...preview.input,previewHash:preview.previewHash};submitting=true;$('error').hidden=true;controls();
      try{
        await api('recovery-plan',body);uncertain=null;selected=null;preview=null;$('dialog').close();
        serial++;loading=false;data=null;error='';
        if(body.month===state.month)$('date').value=body.targetDate;
        doc.dispatchEvent(new CustomEvent('ppic:recovery-saved',{detail:{month:body.month,targetDate:body.targetDate}}));
      }catch(e){
        // A lost response may follow a successful commit. Keep the same request id
        // and exact preview payload so a retry can only return that same recovery.
        if(!e.status||e.status>=500){uncertain=body;$('error').textContent='Status penyimpanan belum terkonfirmasi: '+e.message+' Coba lagi; permintaan yang sama tidak membuat recovery ganda.';}
        else{uncertain=null;preview=null;requestId=uid();$('error').textContent=e.message+' Periksa kembali material dan kapasitas.';}
        $('error').hidden=false;
      }finally{submitting=false;controls();if(!selected)refresh(true);}
    }
    function changeDate(date){
      if(!ready())return;$('date').value=dateValid(date)&&date.slice(0,7)===state.month?date:state.month+'-01';serial++;loading=false;data=null;error='';render();refresh(true);
    }
    $('date').addEventListener('change',()=>changeDate($('date').value));
    for(const [id,delta]of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>changeDate(addDay($('date').value,delta)));
    $('machine').addEventListener('change',render);
    $('chart').addEventListener('click',event=>{const button=event.target.closest('[data-rd-machine]');if(!button)return;const id=button.dataset.rdMachine;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);render();});
    $('ng-body').addEventListener('click',event=>{const button=event.target.closest('[data-rd-recover]');if(button)open(visibleNg[Number(button.dataset.rdRecover)]);});
    for(const [id,event]of [['quantity','input'],['target-date','change'],['mode','change'],['target-job','change']])$(id).addEventListener(event,()=>{if(uncertain)return;resetPreview();if(id!=='quantity')targets();});
    $('tomorrow').addEventListener('click',()=>{if(!selected||uncertain)return;$('target-date').value=nextAvailable();resetPreview();targets();});
    $('form').addEventListener('submit',event=>{event.preventDefault();check();});$('commit').addEventListener('click',commit);
    const close=()=>{if(submitting)return;previewSerial++;checking=false;selected=null;preview=null;$('dialog').close();};
    $('close').addEventListener('click',close);$('cancel').addEventListener('click',close);$('dialog').addEventListener('cancel',event=>{if(submitting)event.preventDefault();else close();});
    function update(next){
      const changed=next.month!==state.month||next.payload!==state.payload,activated=next.active&&!state.active;
      state=next;
      if(changed){serial++;previewSerial++;loading=false;checking=false;data=null;planData=null;error='';collapsed.clear();if(!submitting){selected=null;preview=null;$('dialog').close();}}
      if(monthValid(state.month)){
        $('date').min=state.month+'-01';$('date').max=lastDate(state.month);
        if(!dateValid($('date').value)||$('date').value.slice(0,7)!==state.month)$('date').value=today().slice(0,7)===state.month?today():state.month+'-01';
      }
      if(!state.active){serial++;loading=false;if(!submitting){previewSerial++;checking=false;selected=null;$('dialog').close();}}
      render();if(ready()&&(changed||activated||!data&&!loading&&!error))refresh();
    }
    const poll=()=>{if(doc.visibilityState==='visible'&&!checking&&!submitting&&!$('dialog').open)refresh();};
    setInterval(poll,15000);window.addEventListener('focus',poll);doc.addEventListener('visibilitychange',poll);
    return {update,refresh:()=>refresh(true)};
  }
  return {mount,chartModel,machineLabels,segments,chart,jobIdentity,outstanding,candidates,validateForm,previewHtml,clock,dateValid};
});
