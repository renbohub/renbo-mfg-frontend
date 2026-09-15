(async () => {
  "use strict";
  const root=document.querySelector("[data-ppic-sandbox]");if(!root)return;
  const $=id=>document.getElementById(`ppsb-${id}`),E=window.PpicSandboxEngine;
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=(n,d=1)=>n!=null&&n!==''&&Number.isFinite(Number(n))?new Intl.NumberFormat("id-ID",{maximumFractionDigits:d}).format(n):"—";
  const fmt=value=>value?new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value.slice(0,10)}T00:00:00Z`)):"Belum terjadwal";
  const time=value=>value?`${fmt(value)} · ${value.slice(11,16)}`:"Belum terjadwal";
  const kinds={fg:"Target FG",process:"Proses in-house",vendor:"Proses vendor",material:"Material"};
  const states={ready:"Ada spare",risk:"Delivery risk",late:"Lewat target FG",attention:"Perlu perhatian"};
  const colors={fg:"#3e67d6",process:"#218e85",vendor:"#9870ce",material:"#d6a24b"};
  let criticalIds=new Set();
  let seed,result,overrides={},history=[{}],historyIndex=0,selected="",kind="all",board="material",page=0,gantt,editing,busy=false;
  let worker,workerId=0;const pending=new Map();
  try {worker=new Worker("/js/ppic-sandbox-worker.js?v=20260912-8-delivery-qty");worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};worker.onerror=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error("Perhitungan worker gagal. Muat ulang halaman."));}pending.clear();worker.terminate();worker=null;};}catch(_){worker=null;}
  function compute(s,o){if(!worker)return Promise.resolve().then(()=>E.calculate(s,o));return new Promise((resolve,reject)=>{const id=++workerId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error("Perhitungan terlalu lama; sederhanakan skenario atau muat ulang."));},20000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,seed:s,overrides:o});});}
  const C=window.PpicSandboxCache,expanded=new Set(),searchTools=$("search-tools");
  let requestId=0,requestController,refreshing=false,pendingFresh=null,sourceStatus="",scenarioRevision=0;
  const scenarioStore=window.PpicScenarioStore.create({fetch:window.fetch.bind(window),token:()=>localStorage.getItem("token")||sessionStorage.getItem("token")||""});
  const serverScenarios=Boolean(root.dataset.workspace);$("save-copy").hidden=!serverScenarios;
  const viewControl=$("view"),riskControl=$("risk"),searchControl=$("search");
  const viewQuery=new URL(location.href).searchParams;
  viewControl.value=['delivery','resource','material'].includes(viewQuery.get('ganttView'))?viewQuery.get('ganttView'):'delivery';
  riskControl.value=['all','risk','unknown'].includes(viewQuery.get('risk'))?viewQuery.get('risk'):'all';searchControl.value=viewQuery.get('q')||'';
  let savedScenario=null,scenarioList=[],scenarioBusy=false,openedScenarioId="";
  let snapshotCache;
  try {
    const user=JSON.parse(localStorage.getItem("user")||sessionStorage.getItem("user")||"{}");
    const identity=(localStorage.getItem("token")||sessionStorage.getItem("token"))&&(user.id||user.username);
    snapshotCache=C.create(sessionStorage,identity?String(identity):null,new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
  } catch (_) { snapshotCache=C.create(null,null,""); }
  function sourceLabel(){ $("freshness").textContent=sourceStatus;$("refresh").hidden=!pendingFresh; }
  function install(payload,next,month){
    closeEditor();$("picker").close();$("allocation-editor").close();seed=payload;result=next;overrides={};history=[{}];historyIndex=0;scenarioRevision++;expanded.clear();selected="";page=0;$("name").value="Skenario awal";
    savedScenario=null;$("official").href="/modules/planning-ppic/mps/workbench?view=legacy&month="+month;const url=new URL(location.href);url.searchParams.set("month",month);window.history.replaceState(null,"",url);updateWorkspaceLinks();
    $("loading").hidden=true;$("content").hidden=false;render(true);
  }
  function draftNotice(){
    if(draft()&&draft().fingerprint!==seed.fingerprint)message("Data sumber sudah berubah. Skenario tersimpan lama tidak diterapkan; gunakan snapshot baru ini.");
    else if(draft())message("Ada skenario tersimpan untuk snapshot ini. Klik Buka tersimpan untuk melanjutkan.");
  }
  let TaskStore,GroupedGantt,workingDateSegments;
  try {({TaskStore,GroupedGantt,workingDateSegments}=await import("/vendor/ppic-gantt/index.js?v=20260912-8-delivery-qty"));}catch(error){$("loading").hidden=true;message(`Library Gantt gagal dimuat: ${error.message}`,true);return;}
  class PlanningGantt extends GroupedGantt {
    render(){super.render();this.content.querySelector('.ew-gantt-toolbar .ew-spacer')?.before(searchTools);this.content.querySelectorAll('.ew-grouped-segment').forEach(bar=>bar.classList.toggle('ppsb-critical-segment',JSON.parse(bar.dataset.taskIds||'[]').some(id=>criticalIds.has(id))));}
    tasks(){return super.tasks().filter(t=>this.options.visibleIds.has(t.id)).sort((a,b)=>{const ga=this.options.phaseMap.get(this.options.rows.get(a.id).groupId),gb=this.options.phaseMap.get(this.options.rows.get(b.id).groupId);return ga.partCode.localeCompare(gb.partCode)||ga.targetDate.localeCompare(gb.targetDate)||ga.id.localeCompare(gb.id)||a.startMinute-b.startMinute;});}
    empty(){const el=document.createElement("div");el.className="ew-empty";el.textContent=seed?.nodes.length?"Tidak ada aktivitas terjadwal untuk filter ini. Periksa daftar aktivitas yang belum mendapat jadwal.":"Belum ada kebutuhan produksi pada bulan ini. Pilih bulan demand lain atau periksa rencana delivery.";return el;}
    edit(id){openEditor(id);}
  }
  const fgKey=g=>g.splitKey||JSON.stringify([g.partCode,g.customer]);
  const includesGroup=id=>{const g=result.groups.find(g=>g.id===id),query=new URL(location.href).searchParams,customer=query.get('customer'),resource=query.get('resource'),risk=riskControl.value;return !!g&&(!selected||fgKey(g)===selected)&&(!customer||customer==='ALL'||g.customer===customer)&&(!resource||resource==='ALL'||result.rows.some(n=>n.groupId===id&&(n.machineId===resource||n.vendorId===resource||seed.resources.find(r=>r.id===n.machineId)?.code===resource)))&&(risk==='all'||risk==='risk'&&['risk','late'].includes(g.status)||risk==='unknown'&&g.status==='attention');};
  function fgRows(){
    const groups=new Map();
    for(const g of result.groups.filter(g=>g.active!==false)){const key=fgKey(g);if(!groups.has(key))groups.set(key,{...g,id:key,qty:0,phases:[],status:"ready"});const fg=groups.get(key);fg.qty+=g.qty;fg.phases.push(g);if(["ready","risk","late","attention"].indexOf(g.status)>["ready","risk","late","attention"].indexOf(fg.status))fg.status=g.status;}
    return [...groups.values()];
  }
  function message(text,error=false){$("message").hidden=!text;$("message").textContent=text;$("message").classList.toggle("ppsb-error",error);}
  function draftKey(){let user={};try{user=JSON.parse(localStorage.getItem("user")||sessionStorage.getItem("user")||"{}");}catch(_){}return `ppic-sandbox:v1:${user.id||user.username||"session"}:${seed?.month}`;}
  function draft(){try{return JSON.parse(localStorage.getItem(draftKey())||"null");}catch(_){return null;}}
  function controls(){root.querySelectorAll("[data-kind]").forEach(button=>button.disabled=busy||!seed);$("load").disabled=busy||refreshing||scenarioBusy;$("month").disabled=busy||scenarioBusy;$("refresh").disabled=busy||refreshing;for(const id of ["save","save-copy","reset","export","allocations"])$(id).disabled=busy||scenarioBusy||!seed;$("undo").disabled=busy||historyIndex===0;$("redo").disabled=busy||historyIndex>=history.length-1;$("restore").disabled=busy||scenarioBusy||!seed;$("apply").disabled=busy;$("allocation-apply").disabled=busy;}
  function updateWorkspaceLinks(){
    const current=new URL(location.href);
    document.querySelectorAll('[data-ppw-link],#ppsb-workspace-stages a,.ppsb-stage-dock a').forEach(link=>{const url=new URL(link.href,location.origin);for(const key of ['month','plant','customer','resource','q','demandType','scenario']){if(current.searchParams.has(key))url.searchParams.set(key,current.searchParams.get(key));else url.searchParams.delete(key);}link.href=url.pathname+url.search;});
  }
  async function openServerScenario(id){
    if(busy||scenarioBusy)return;scenarioBusy=true;controls();
    try{
      const record=await scenarioStore.get(id),snapshot=record.payload?.seed;
      if(!snapshot||snapshot.month!==record.month)throw new Error('Snapshot skenario tidak lengkap.');
      const next=await compute(snapshot,record.payload.overrides||{});
      install(snapshot,next,record.month);overrides=structuredClone(record.payload.overrides||{});history=[{},structuredClone(overrides)];historyIndex=1;savedScenario=record;openedScenarioId=record.id;
      $("month").value=record.month;$("name").value=record.name;
      const url=new URL(location.href);url.searchParams.set('scenario',record.id);window.history.replaceState(null,'',url);updateWorkspaceLinks();
      $("scenarios").close();sourceStatus=record.stale?'Snapshot tersimpan sudah berbeda dari sumber terbaru':'Snapshot skenario tersimpan';render(true);sourceLabel();
      message(record.stale?'Skenario lama dibuka untuk review. Sumber berubah; hitung ulang snapshot sebelum menyimpan versi baru.':`Skenario ${record.name} · revisi ${record.revision} dibuka dari server.`,Boolean(record.stale));
      const operation=url.searchParams.get('operation');if(operation&&result.rows.some(row=>row.id===operation))openEditor(operation);
    }catch(error){message(error.message,true);}finally{scenarioBusy=false;controls();}
  }
  async function listScenarios({autoOpen=false}={}){
    if(!seed||!serverScenarios)return;
    try{
      const response=await scenarioStore.list(seed.month);scenarioList=Array.isArray(response)?response:response.items||[];
      const id=new URL(location.href).searchParams.get('scenario');
      if(autoOpen&&id&&id!==openedScenarioId)await openServerScenario(id);
    }catch(error){message('Daftar skenario server belum tersedia: '+error.message,true);}
  }
  async function saveScenario(asCopy=false){
    if(busy||scenarioBusy||!seed)return;const name=$("name").value.trim();if(!name)return message('Nama skenario wajib diisi.',true);
    if(!serverScenarios){try{localStorage.setItem(draftKey(),JSON.stringify({version:1,fingerprint:seed.fingerprint,month:seed.month,name,overrides,savedAt:new Date().toISOString()}));message('Skenario disimpan di browser ini.');}catch(_){message('Penyimpanan browser tidak tersedia. Skenario belum tersimpan.',true);}controls();return;}
    scenarioBusy=true;controls();
    try{
      const record=await scenarioStore.save({name,month:seed.month,sourceIdentifier:seed.mpsNumber||'MONTH:'+seed.month,sourceFingerprint:seed.fingerprint,payload:{version:1,overrides},...(!asCopy&&savedScenario?{expectedRevision:savedScenario.revision}:{})},!asCopy?savedScenario?.id:undefined);
      savedScenario=record;openedScenarioId=record.id;const url=new URL(location.href);url.searchParams.set('scenario',record.id);window.history.replaceState(null,'',url);updateWorkspaceLinks();
      message(`Skenario ${record.name} tersimpan di server · revisi ${record.revision}.`);await listScenarios();
    }catch(error){message(error.message,true);}finally{scenarioBusy=false;controls();}
  }
  async function load({force=false}={}){
    if(busy)return;
    const month=$("month").value,id=++requestId;
    requestController?.abort();requestController=new AbortController();
    const controller=requestController;
    let timer,blocking=true,fromSession=false;
    closeEditor();$("picker").close();busy=true;refreshing=true;pendingFresh=null;controls();message("");
    sourceStatus=force?"Menghitung ulang snapshot…":"Memeriksa perubahan sumber…";sourceLabel();
    try {
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("Pilih bulan demand yang valid.");
      if(!force){
        const cached=snapshotCache.read(month);
        if(cached){
          try {
            const next=await compute(cached.seed,{});if(id!==requestId)return;
            install(cached.seed,next,month);
            fromSession=true;
            sourceStatus="Snapshot sesi langsung tampil · memeriksa perubahan sumber…";sourceLabel();
          }catch(_){snapshotCache.remove(month);}
        }
      }
      const visible=seed?.month===month;
      $("loading").hidden=visible;$("content").hidden=!visible;
      if(visible){busy=false;blocking=false;controls();}
      else $("status").textContent="Menyiapkan snapshot awal bulan ini…";
      const token=localStorage.getItem("token")||sessionStorage.getItem("token")||"";
      timer=setTimeout(()=>controller.abort(new DOMException("Snapshot timeout","TimeoutError")),185000);
      const response=await fetch(serverScenarios?"/modules/api/planning-ppic/workspace/seed":"/modules/api/planning-ppic/mps/"+encodeURIComponent("MONTH:"+month)+"/experiment-seed",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(serverScenarios?{month,force,plant:new URL(location.href).searchParams.get('plant')||'ALL'}:{force}),signal:controller.signal});
      const body=await response.json().catch(()=>({})),payload=body.data??body;if(id!==requestId)return;
      if(!response.ok){
        if(response.status===401||response.status===403){snapshotCache.remove(month);closeEditor();$("picker").close();seed=null;result=null;gantt?.destroy();gantt=null;}
        throw new Error(payload.message||"Snapshot gagal dimuat ("+response.status+").");
      }
      snapshotCache.write(payload);
      const active=()=>busy&&!blocking||history.length>1||Object.keys(overrides).length>0||$("editor").open||$("picker").open||$("allocation-editor").open;
      let action=C.disposition(seed,payload,active());
      if(action==="replace"){
        const revision=scenarioRevision,next=await compute(payload,{});if(id!==requestId)return;
        action=C.disposition(seed,payload,active()||revision!==scenarioRevision);
        if(action==="replace"){install(payload,next,month);draftNotice();}
      }
      if(action==="defer"){
        pendingFresh=payload;sourceStatus="Data sumber berubah · skenario aktif tetap dipertahankan";
        message("Snapshot baru tersedia. Simpan skenario bila diperlukan, lalu klik Muat data baru untuk beralih.");
      }else{
        seed.cache=payload.cache;sourceStatus=fromSession?"Snapshot sesi · data sumber sudah diperiksa":"Data sumber sudah diperiksa";
        if(action==="unchanged")$("engine").textContent="Snapshot tersimpan · "+num((payload.cache?.requestMs||0)/1000,2)+" dtk · "+num(result.elapsedMs,1)+" ms";
      }
    }catch(error){
      if(id!==requestId)return;
      message(error.name==="TimeoutError"?"Pemeriksaan server melewati batas waktu. Snapshot sesi tetap tersedia bila sudah dimuat.":error.message,true);
      sourceStatus=seed?"Snapshot belum terverifikasi · pemeriksaan sumber gagal":"Data awal belum tersedia";
      $("status").textContent=seed?"Snapshot sebelumnya tetap ditampilkan.":"Data awal belum tersedia.";if(seed)$("month").value=seed.month;
    }finally{
      clearTimeout(timer);
      if(id===requestId){if(blocking)busy=false;refreshing=false;$("loading").hidden=true;$("content").hidden=!seed;sourceLabel();controls();}
    }
  }
  const filteredRows=()=>{const q=searchControl.value.trim().toLowerCase(),phases=new Map(result.groups.map(g=>[g.id,g])),view=viewControl.value;return result.rows.filter(n=>{const g=phases.get(n.groupId);return g.active!==false&&includesGroup(n.groupId)&&`${g.partCode} ${g.partNumber || ''} ${g.partName} ${g.customer}`.toLowerCase().includes(q)&&(view==='delivery'||view==='material'&&n.kind==='material'||view==='resource'&&['process','vendor'].includes(n.kind))&&(kind==="all"||(kind==="production"?["process","vendor","fg"].includes(n.kind):n.kind==="material"));});};
  function render(fitRange=false){
    const risks=result.groups.filter(g=>g.status!=="ready").length,processSeconds=result.rows.reduce((s,n)=>s+(n.calculation?.totalSeconds||0),0),purchases=result.rows.filter(n=>n.kind==="material"&&n.qty>0&&n.start).map(n=>n.start).sort();
    $("metrics").innerHTML=[['◇',num(result.groups.length,0),'Target FG · semua customer'],['◷',`${num(processSeconds/3600)} jam`,'Total beban proses'],['↘',purchases[0]?fmt(purchases[0]).replace(/ 202\d/,""):"—",'Tanggal beli paling awal'],['!',num(risks,0),'Target perlu ditinjau']].map(([icon,value,label])=>`<div class="ppsb-metric"><div class="ppsb-metric-icon" aria-hidden="true">${icon}</div><div><strong>${esc(value)}</strong><span>${label}</span></div></div>`).join("");
    const q=searchControl.value.trim().toLowerCase(),fgs=fgRows();$("group-count").textContent=fgs.length;
    $("groups").innerHTML=fgs.filter(g=>`${g.partCode} ${g.partNumber || ''} ${g.partName} ${g.customer}`.toLowerCase().includes(q)).map(g=>`<button type="button" class="ppsb-group" data-group="${esc(g.id)}" aria-pressed="${selected===g.id}"><strong>${esc(g.partCode)}</strong><small>Part Number: ${esc(g.partNumber || '—')}</small><small>${esc(g.customer)} · ${esc(g.partName)}<br>${num(g.qty)} pcs produksi</small><div><span>${g.phases.length} target tanggal</span><span class="ppsb-badge ${g.status}">${states[g.status]}</span></div></button>`).join("")||'<p class="ppsb-empty">FG tidak ditemukan.</p>';
    const group=fgs.find(g=>g.id===selected);$("selected-title").textContent=group?`${group.partCode} · ${group.partName}`:"Satu FG, satu baris";$("selected-customer").textContent=group?`${group.customer} · ${num(group.qty)} PCS PRODUKSI`:"MPS + MRP + MPP";
    $("selected-detail").textContent=`${fgs.length} FG · ${result.groups.filter(g=>g.active!==false).length} pembagian · ▸ buka FG`;
    $("edit-fg").hidden=!group;$("all").setAttribute("aria-pressed",String(!selected));
    $("status").textContent=`${seed.mpsNumber||"Belum ada demand"} · Snapshot ${seed.sourceMode==="LOCKED_BASELINE"?"baseline terkunci":"demand aktif"} · Tanggal bisnis ${fmt(seed.businessDate)} · ${Object.keys(overrides).length} adjustment`;
    $("engine").textContent=`${seed.cache?.hit?"Snapshot tersimpan":seed.cache?.shared?"Snapshot bersama":"Snapshot baru"} · ${num((seed.cache?.requestMs??seed.initial.elapsedMs)/1000,2)} dtk · ${result.engine==="CP_SAT_INITIAL"?"Awal CP-SAT":"Urutan BOM"} · ${num(result.elapsedMs,1)} ms`;
    renderGantt(fitRange);renderBoard();analysis.update(seed,result,new Set(result.groups.filter(g=>g.active!==false&&includesGroup(g.id)&&`${g.partCode} ${g.partNumber || ''} ${g.partName} ${g.customer}`.toLowerCase().includes(searchControl.value.trim().toLowerCase())).map(g=>g.id)));
    const initialErrors=(seed.initial.plans||[]).filter(p=>p.error).map(p=>p.error);
    $("assumptions-body").innerHTML=`<p>Simulasi awal CP-SAT: <strong>${esc(seed.initial.solver?.status||"Belum berjalan")}</strong>, ${num(seed.initial.solver?.taskCount||0,0)} segmen proses. Snapshot lengkap ${num(seed.initial.elapsedMs/1000)} detik. ${!seed.initial.solver?.feasible?`Alokasi CP-SAT belum tersedia; tampilan memakai hitungan urutan BOM. ${esc(seed.initial.solver?.error||"")}`:"Hasil solver memeriksa waktu dan kapasitas; temuan kualifikasi master tetap perlu diselesaikan."}</p><ul>${seed.assumptions.map(s=>`<li>${esc(s)}</li>`).join("")}</ul><p>Rentang snapshot ${fmt(seed.horizonStart)} – ${fmt(seed.horizonEnd)}. Semua waktu mengikuti jam operasional lokal (WIB). Bar menunjukkan jadwal mundur yang dibutuhkan; estimasi selesai paling cepat dihitung maju dari tanggal bisnis. Garis putus-putus menandai tanggal bisnis; hari libur mengikuti working calendar.</p>${initialErrors.length?`<details><summary>Kendala rencana sumber (${initialErrors.length})</summary><p style="white-space:pre-wrap">${esc(initialErrors.join("\n"))}</p></details>`:""}`;
    controls();
  }
  function renderGantt(fitRange){
    const rows=filteredRows(),scheduled=rows.filter(n=>n.start&&n.end),phaseMap=new Map(result.groups.map(g=>[g.id,g]));
    const fgs=fgRows().filter(g=>scheduled.some(n=>fgKey(phaseMap.get(n.groupId))===g.id)),limit=50,pages=Math.max(1,Math.ceil(fgs.length/limit));page=Math.min(page,pages-1);
    const visibleGroups=new Set(fgs.slice(page*limit,(page+1)*limit).map(g=>g.id));
    const visible=scheduled.filter(n=>visibleGroups.has(fgKey(phaseMap.get(n.groupId)))),validRows=result.rows.filter(n=>n.start&&n.end),validIds=new Set(validRows.map(n=>n.id));
    const saved=gantt?{start:gantt.start,end:gantt.end,zoom:gantt.dayWidth,x:gantt.content.querySelector('.ew-scroll')?.scrollLeft||0,y:gantt.content.querySelector('.ew-scroll')?.scrollTop||0}:null;
    const dates=visible.flatMap(n=>[n.start,n.end]).sort(),begin=dates[0]||`${seed.month}-01`,finish=dates.at(-1)||`${seed.month}-28`;
    if(saved&&(begin<saved.start||finish>saved.end))fitRange=true;
    const start=fitRange||!saved?E.day(E.at(begin)-1440):saved.start;
    const labelWidth=$("gantt").clientWidth<550?180:310;
    const zoom=saved?.zoom||Math.max(16,Math.min(40,Math.floor(($("gantt").clientWidth-labelWidth)/Math.max(14,(E.at(finish)-E.at(begin))/1440+3))));
    const fillDays=Math.max(14,Math.ceil(($("gantt").clientWidth-labelWidth)/zoom));
    const end=fitRange||!saved?E.day(Math.max(E.at(finish)+1440,E.at(start)+(fillDays-1)*1440)):saved.end;
    const searchInput=$("search"),searchFocused=document.activeElement===searchInput,searchCursor=searchInput.selectionStart;
    gantt?.destroy();
    const store=new TaskStore({columns:Object.keys(kinds).map(id=>({id,title:kinds[id],color:colors[id]})),tasks:validRows.map(n=>({id:n.id,title:`${n.kind==="fg"?"◇ ":""}${n.partCode} · ${n.title}`,status:n.kind,start:n.start,end:n.end,dependencies:n.dependencies.filter(id=>validIds.has(id)),description:`${n.partCode} ${n.title}`,startMinute:n.planned.start,endMinute:n.planned.end}))});
    const rowMap=new Map(result.rows.map(n=>[n.id,n])),fgMap=new Map(fgs.map(g=>[g.id,g]));
    gantt=new PlanningGantt($("gantt"),{
      store,readOnly:true,start,end,labelWidth,dayWidth:zoom,referenceDate:seed.businessDate,
      visibleIds:new Set(visible.map(n=>n.id)),rows:rowMap,phaseMap,
      maxDayWidth:720,zoomLevels:[24,96,480],zoomLabels:{24:"Bulan",96:"Minggu",480:"Hari"},
      expanded,groupHeading:viewControl.value==='resource'?'Resource / operasi':viewControl.value==='material'?'Material / kebutuhan':'FG / FG need per delivery',
      parentGroup:t=>{const n=rowMap.get(t.id),g=fgMap.get(fgKey(phaseMap.get(n.groupId)));if(viewControl.value==='resource'){const resource=n.kind==='process'?seed.resources.find(r=>r.id===n.machineId):seed.vendors.find(v=>v.id===n.vendorId);return {id:'resource:'+(n.machineId||n.vendorId||n.id),title:resource?.code||resource?.vendorCode||'Belum dipilih',subtitle:resource?.name||resource?.vendorName||n.kind};}if(viewControl.value==='material')return {id:'material:'+(n.materialPoolId||n.partCode+':'+n.uom+':'+n.owner),title:n.partCode,subtitle:n.partName+' · '+n.uom+' · '+(n.owner||'Stok')};return {id:g.id,title:g.partCode,subtitle:`${g.partName} · ${g.customer} · ${g.phases.length} pembagian`};},
      taskGroup:t=>{const g=phaseMap.get(rowMap.get(t.id).groupId);return {id:g.id,title:`${g.isRemainder?"Sisa":"FG"} ${fmt(g.targetDate)} · ${num(g.qty)} pcs`,subtitle:`${g.isRemainder?"Sisa pembagian · acuan delivery":"Delivery"} ${fmt(g.deliveryDate)} · ${states[g.status]}`};},
      onGroupEdit:g=>openEditor(result.rows.find(n=>n.kind==="fg"&&n.groupId===g.id)?.id),
      onSegmentClick:(tasks,g)=>openActivityPicker(tasks.map(t=>t.id),g.title),
      taskPhase:t=>{const g=phaseMap.get(rowMap.get(t.id).groupId);return {id:g.id,title:`FG ${fmt(g.targetDate)} · ${num(g.qty)} pcs`,subtitle:`Delivery ${fmt(g.deliveryDate)} · ${states[g.status]}`,sortKey:g.targetDate};},
      taskLabel:t=>`${rowMap.get(t.id).title} · ${rowMap.get(t.id).partCode}`,
      taskTooltip:t=>{const n=rowMap.get(t.id),g=phaseMap.get(n.groupId);return `${kinds[n.kind]} · ${n.partCode} · ${n.title}\n${time(n.startAt)} → ${time(n.endAt)} · ${num(n.qty)} ${n.uom} · Target FG ${fmt(g.targetDate)}`;},
      onTaskClick:t=>openEditor(t.id),
      onPhaseEdit:phase=>openEditor(`fg-${phase.id.slice(6)}`),
      taskRange:t=>({start:t.startMinute*60000,end:t.endMinute*60000}),
      taskSegments:t=>{const n=rowMap.get(t.id);return t.startMinute===t.endMinute?undefined:workingDateSegments(t.startMinute*60000,t.endMinute*60000,(n.kind==="process"?seed.resources.find(r=>r.id===n.machineId)?.closedDates:null)||seed.workingCalendar?.closedDates||[]);},
      dependencyConflict:(a,b)=>a.endMinute>b.startMinute,
      taskSubtitle:t=>{
        const n=rowMap.get(t.id);
        const resource=n.kind==="process"?seed.resources.find(r=>r.id===n.machineId)?.code:n.kind==="vendor"?seed.vendors.find(v=>v.id===n.vendorId)?.vendorCode:n.kind==="material"?(n.qty===0?"Stok / suplai":n.ownership==="CUSTOMER_SUPPLIED"?"Material customer":"Pembelian"):"Target selesai";
        const detail=n.kind==="vendor"?`${num(n.leadDays)} hari ${n.leadBasis==="working"?"kerja":"kalender"}${n.calculation.totalSeconds?` + ${num(n.calculation.totalSeconds/3600,2)} jam`:""}`:n.calculation?`${num(n.calculation.totalSeconds/3600,2)} jam`:n.kind==="material"?`${num(n.qty||n.grossQty)} ${n.uom}`:fmt(n.targetDate);
        return `${resource||"Belum dipilih"} · ${detail}`;
      },
      note:"Material siap sebelum proses pertama. Bar tersambung pada hari kerja dan hanya putus saat libur; warna menunjukkan jenis aktivitas. Buffer dibagi ke FG yang masih perlu produksi. Klik segmen untuk adjustment.",
      onError:error=>message(error.message,true)
    });
    if(searchFocused){searchInput.focus({preventScroll:true});searchInput.setSelectionRange(searchCursor,searchCursor);}
    if(saved&&!fitRange){const scroll=gantt.content.querySelector('.ew-scroll');if(scroll){scroll.scrollLeft=saved.x;scroll.scrollTop=saved.y;}}
    $("page").textContent=`${fgs.length?`${page*limit+1}–${Math.min((page+1)*limit,fgs.length)}`:0} dari ${fgs.length} FG · ${scheduled.length} aktivitas`;
    $("prev").disabled=page===0;$("next").disabled=page>=pages-1;$("pagination").hidden=pages===1;
    const missing=rows.filter(n=>!n.start||!n.end);$("unscheduled").hidden=!missing.length;$("unscheduled").innerHTML=`<strong>${missing.length} aktivitas belum mendapat jadwal.</strong> Klik untuk periksa:<br>${missing.map(n=>`<button type="button" data-edit="${n.id}">${esc(n.partCode)} · ${esc(n.title)}</button>`).join("")}`;
  }
  const editLink=n=>`<button type="button" class="ppsb-table-link" data-edit="${esc(n.id)}">${esc(n.partCode)}</button><small>${esc(n.title)}</small>`;
  function table(head,rows){return rows.length?`<table data-enterprise-table="off"><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`:'<div class="ppsb-empty">Tidak ada data untuk pilihan ini.</div>';}
  function renderBoard(){
    const members=result.rows.filter(n=>includesGroup(n.groupId));let head=[],rows=[];
    if(board==="material"){
      $("board-caption").textContent="Tanggal paling lambat mengikuti kebutuhan proses pertama. Material customer memakai tanggal permintaan; kebutuhan net dialokasikan menurut tanggal konsumsi pada skenario ini.";
      head=["Material / part","Part Number","Pemenuhan","Kebutuhan net","Lead time","Beli / minta paling lambat","Dibutuhkan proses","Status"];
      rows=members.filter(n=>n.kind==="material").sort((a,b)=>(a.start||"").localeCompare(b.start||"")).map(n=>[editLink(n),esc(n.partNumber || "—"),esc(n.ownership==="CUSTOMER_SUPPLIED"?`Customer · ${n.owner}`:`Supplier · ${n.owner||"Belum ditentukan"}`),`${num(n.qty)} ${esc(n.uom)}`,`${num(n.leadDays)} hari ${n.leadBasis==="working"?"kerja":"kalender"}`,n.qty>0?esc(time(n.startAt)):'<span class="ppsb-muted">Tertutup stok / suplai</span>',esc(time(n.endAt)),`<span class="ppsb-badge ${n.issues.length?"attention":"ready"}">${n.issues.length?"Periksa":"Terhitung"}</span>`]);
    }else if(board==="process"){
      $("board-caption").textContent="Beban mesin = (cycle time × kuantitas / performance) + setup/downtime tambahan. Transfer menambah lead time tanpa memakai kapasitas mesin. Batch ekuivalen dibulatkan per 8 jam; kuantitas tidak dipecah otomatis.";
      head=["Part / proses","Part Number","Mesin / vendor","Qty produksi","Total proses","Batch × 8 jam","Mulai","Selesai"];
      rows=members.filter(n=>["process","vendor"].includes(n.kind)).sort((a,b)=>(a.startAt||"").localeCompare(b.startAt||"")).map(n=>[editLink(n),esc(n.partNumber || "—"),esc(n.kind==="process"?seed.resources.find(r=>r.id===n.machineId)?.code||"Belum dipilih":seed.vendors.find(v=>v.id===n.vendorId)?.vendorCode||"Belum dipilih"),num(n.qty),`${num(n.calculation.totalSeconds,1)} detik<small>${num(n.calculation.totalSeconds/3600,2)} jam${n.kind==="vendor"?` + ${num(n.leadDays)} hari lead time`:""}</small>`,num(n.calculation.batches,0),esc(time(n.startAt)),esc(time(n.endAt))]);
    }else if(board==="capacity"){
      $("board-caption").textContent=`Gabungan seluruh FG pada bulan ${seed.month}. Beban = proses skenario + reservasi rencana lain; kapasitas memakai kalender mesin setelah downtime tercatat.`;
      head=["Mesin","Jam tersedia","Rencana lain","Skenario ini","Utilisasi"];
      rows=result.resources.map(r=>[`${esc(r.code)}<small>${esc(r.name)}</small>`,`${num(r.capacity.capacityMinutes/60)} jam`,`${num(r.capacity.existingMinutes/60)} jam`,`${num(r.capacity.plannedMinutes/60)} jam`,`<span class="ppsb-capacity-bar ${r.capacity.percent>85?"high":""}"><i style="width:${Math.min(100,r.capacity.percent||0)}%"></i></span>${r.capacity.percent==null?"Tidak ada kapasitas":`${num(r.capacity.percent)}%`}`]);
    }else{
      $("board-caption").textContent="Temuan per tugas dan sumber. Hasil ini simulasi; selesaikan temuan sebelum memakai rencana resmi.";
      head=["Part / proses","Part Number","Temuan"];
      rows=members.filter(n=>n.issues.length).map(n=>[editLink(n),esc(n.partNumber || "—"),n.issues.map(i=>esc(i)).join("<br>")]);
      rows.push(...result.issues.map(i=>["Sumber data","—",esc(i)]));
      rows.push(...result.groups.filter(g=>includesGroup(g.id)&&g.targetSpareDays<0).map(g=>[esc(g.partCode),esc(g.partNumber || "—"),`Estimasi tercepat ${esc(time(g.earliestFinish))}; melewati target FG ${num(-g.targetSpareDays)} hari.`]));
    }
    $("table").innerHTML=table(head,rows);
  }
  function field(label,name,value,type="number",extra=""){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} ${type==="number"?'min="0" max="10080" step="0.01" required':""}></label>`;}
  function getAdjustment(){
    const f=$("form"),n=result.rows.find(r=>r.id===editing),get=k=>f.elements.namedItem(k)?.value;
    if(n.kind==="fg")return {targetDate:get("targetDate"),qty:Number(get("qty"))};
    if(n.kind==="material")return {leadDays:Number(get("leadDays")),leadBasis:get("leadBasis"),availableDate:get("availableDate")||null};
    const patch={cycleSeconds:Number(get("cycleSeconds")),efficiency:Number(get("efficiency"))/100,transitionMinutes:Number(get("transitionMinutes")),downtime:Object.fromEntries(["coil","dies","rest","setup","briefing"].map(k=>[k,Number(get(`dt-${k}`))]))};
    if(n.kind==="process")patch.machineId=get("machineId");else Object.assign(patch,{vendorId:get("vendorId"),leadDays:Number(get("leadDays")),leadBasis:get("leadBasis")});
    return patch;
  }
  function formula(){try{const n=result.rows.find(r=>r.id===editing),o=getAdjustment();if(!n)return;
    if(n.kind==="fg"){$("formula").innerHTML=`Produksi pembagian ini: <strong>${num(o.qty,3)} ${esc(n.uom)}</strong>. Total FG bulanan menjadi <strong>${num(result.groups.filter(g=>fgKey(g)===fgKey(result.groups.find(g=>g.id===n.groupId))).reduce((sum,g)=>sum+g.qty,0)-n.qty+o.qty,3)} ${esc(n.uom)}</strong>.<br>Durasi, kebutuhan material, dan tanggal proses dihitung ulang. Qty manual tidak dibulatkan lagi.`;return;}
    if(n.kind==="material"){$("formula").innerHTML=`Tanggal beli / permintaan = kebutuhan proses − <strong>${num(o.leadDays)} hari ${o.leadBasis==="working"?"kerja sesuai working calendar":"kalender"}</strong>.<br>Lead time tidak dikalikan kuantitas. Tanggal siap opsional adalah asumsi kedatangan skenario.`;return;}
    const d=E.duration({...n,...o});$("formula").innerHTML=`(${num(o.cycleSeconds)} detik × ${num(n.qty)} / ${num(o.efficiency,2)}) + ${num(d.downtimeMinutes)} menit setup/downtime × 60<br><strong>${num(d.totalSeconds)} detik</strong> · ${num(d.totalSeconds/3600,2)} jam · ceil(${num(d.totalSeconds/3600,2)} / 8) = <strong>${num(d.batches,0)} batch</strong><br>Transfer ${num(d.transitionMinutes)} menit menjadi jeda sebelum proses berikutnya.${n.kind==="vendor"?`<br>Ditambah lead time vendor ${num(o.leadDays)} hari ${o.leadBasis==="working"?"kerja":"kalender"}.`:""}`;$("editor-error").textContent="";
    }catch(error){$("editor-error").textContent=error.message;}}
  let pickerIds=[];
  function renderPicker(){
    const q=$("picker-search").value.trim().toLowerCase(),ids=new Set(pickerIds),phases=new Map(result.groups.map(g=>[g.id,g]));
    const rows=result.rows.filter(n=>ids.has(n.id)).sort((a,b)=>(a.startAt||"z").localeCompare(b.startAt||"z")||a.id.localeCompare(b.id));
    $("picker-list").innerHTML=rows.filter(n=>`${kinds[n.kind]} ${n.partCode} ${n.title} ${phases.get(n.groupId).targetDate}`.toLowerCase().includes(q)).map(n=>{const g=phases.get(n.groupId);return `<button type="button" class="ppsb-activity" data-edit="${esc(n.id)}"><span class="ppsb-activity-kind"><i class="ppsb-dot ppsb-dot-${n.kind}"></i>${kinds[n.kind]}</span><strong>${esc(n.partCode)} · ${esc(n.title)}</strong><span>${esc(time(n.startAt))} → ${esc(time(n.endAt))}</span><small>Target FG ${fmt(g.targetDate)} · ${num(n.qty)} ${esc(n.uom)}${n.issues.length?" · Perlu perhatian":""}</small></button>`;}).join("")||'<p class="ppsb-empty">Aktivitas tidak ditemukan.</p>';
  }
  function openActivityPicker(ids,title){
    if(busy||!ids.length)return;
    if(ids.length===1){openEditor(ids[0]);return;}
    pickerIds=[...new Set(ids)];$("picker-title").textContent=title;$("picker-count").textContent=`${pickerIds.length} aktivitas · pilih yang ingin disesuaikan`;
    $("picker-search").value="";renderPicker();if(!$("picker").open)$("picker").showModal();
  }
  $("picker-search").addEventListener("input",renderPicker);
  $("picker-close").addEventListener("click",()=>$("picker").close());
  function openEditor(id){
    if(busy)return;const n=result.rows.find(r=>r.id===id);if(!n)return;editing=id;const g=result.groups.find(g=>g.id===n.groupId);
    if($("picker").open)$("picker").close();
    $("editor-type").textContent=kinds[n.kind];$("editor-title").textContent=n.kind==="fg"?n.partCode:n.title;$("editor-context").textContent=`${n.partCode} · ${g.customer} · FG ${g.partCode}`;
    $("editor-summary").innerHTML=`<div class="ppsb-editor-summary"><div><span>Kuantitas produksi / net</span><strong>${num(n.qty,n.kind==="material"?3:1)} ${esc(n.uom)}</strong></div><div><span>Delivery need</span><strong>${fmt(g.deliveryDate)}</strong></div><div><span>Komposisi qty awal: delivery / buffer / pembulatan</span><strong>${num(g.customerProductionQty??g.qty)} / ${num(g.bufferQty||0)} / ${num(g.roundingQty||0)} pcs</strong></div><div><span>Ditutup stok/suplai FG</span><strong>${num(g.stockCoveredQty||0)} pcs</strong></div><div><span>${states[g.status]}</span><strong>${g.spareDays==null?"Belum terhitung":g.spareDays<0?`${num(Math.abs(g.spareDays))} hari melewati target`:`${num(g.spareDays)} hari spare`}</strong></div></div>`;
    const basis=()=>`<label>Basis lead time<select name="leadBasis" data-searchable-disabled="true"><option value="working" selected>Working calendar · skip hari libur</option></select></label>`;
    let fields="";
    if(n.kind==="fg")fields=`<div class="ppsb-fields"><label>Qty produksi pembagian ini<input name="qty" type="number" value="${esc(n.qty)}" min="0" max="1000000000" step="any" required ${g.initialQty===0?'readonly title="Pembagian awal 0 belum memiliki urutan BOM produksi."':""}></label>${field("Target FG selesai · pukul 17.00","targetDate",n.targetDate,"date",`min="${seed.horizonStart}" max="${E.day(E.at(seed.horizonEnd)-1440)}" required data-allow-past="true"`)}<label>Delivery customer<input value="${fmt(g.deliveryDate)}" readonly></label></div><p class="ppsb-help">Qty bebas diubah, termasuk sisa di bawah 1.000. Nilai 0 menonaktifkan pembagian. Target FG dapat dimajukan atau dimundurkan; delivery customer tetap menjadi pembanding risiko.</p>`;
    else if(n.kind==="material")fields=`<div class="ppsb-fields">${field("Lead time material · hari","leadDays",n.leadDays)}${basis()}${field("Material siap · opsional, pukul 08.00","availableDate",n.availableDate||"","date",'data-allow-past="true"')}<label>Jenis pemenuhan<input readonly value="${esc(n.ownership==="CUSTOMER_SUPPLIED"?`Material customer ${n.owner}`:`Pembelian supplier ${n.owner}`)}"></label></div><p class="ppsb-help">Tanggal siap dan lead time berlaku untuk sisa kebutuhan net. Kosongkan tanggal siap untuk memakai tanggal bisnis + lead time. Stok dan kiriman dialokasikan ulang sesuai urutan tanggal konsumsi; tanggal siap di sini adalah asumsi, bukan penerimaan stok.</p>`;
    else {
      const resource=n.kind==="process"?`<label class="ppsb-wide">Mesin yang memenuhi routing<select name="machineId" data-searchable-disabled="true" required><option value="">Pilih mesin</option>${n.machineOptions.map(m=>`<option value="${esc(m.machineId)}" ${m.machineId===n.machineId?"selected":""}>${esc(seed.resources.find(r=>r.id===m.machineId)?.code||m.machineId)}${m.diesId?" · memakai dies/jig":""}</option>`).join("")}</select></label>`:`<label class="ppsb-wide">Vendor skenario<select name="vendorId" data-searchable-disabled="true" required><option value="">Pilih vendor</option>${seed.vendors.map(v=>`<option value="${esc(v.id)}" ${v.id===n.vendorId?"selected":""}>${esc(v.vendorCode)} · ${esc(v.vendorName)}</option>`).join("")}</select></label>${field("Lead time vendor · hari","leadDays",n.leadDays)}${basis()}`;
      fields=`<div class="ppsb-fields">${resource}${field("Cycle time · detik / unit","cycleSeconds",n.cycleSeconds)}${field("Performance · %","efficiency",n.efficiency*100)}${field("Waktu antar proses · menit / lot","transitionMinutes",n.transitionMinutes)}<label>Batch acuan<input value="8 jam / batch" readonly></label></div><fieldset><legend>Planned downtime · menit per lot</legend><div class="ppsb-downtime">${[["coil","Dandory coil"],["dies","Dandory dies"],["rest","Istirahat"],["setup","Setting awal"],["briefing","Briefing"]].map(([key,label])=>field(label,`dt-${key}`,n.downtime[key])).join("")}</div><p class="ppsb-help">Ditambahkan satu kali untuk lot ini. Nilai 0 berarti belum dialokasikan. Isi hanya tambahan yang belum masuk penutupan kalender atau downtime mesin.</p></fieldset>`;
    }
    $("editor-fields").innerHTML=fields;
    if(n.kind==="material"){
      $("editor-fields").insertAdjacentHTML("beforeend",`<div class="ppsb-evidence"><h3>Netting untuk FG need ini</h3><p>Kebutuhan bruto <strong>${num(n.grossQty,3)} ${esc(n.uom)}</strong> − stok dialokasikan ${num(n.onHandQty||0,3)} − kiriman firm ${num(n.firmSupplyQty||0,3)} − suplai rencana ${num(n.plannedSupplyQty||0,3)} = <strong>net ${num(n.qty,3)} ${esc(n.uom)}</strong>.</p><p>Dibutuhkan sebelum proses: <strong>${esc(time(n.requiredAt!=null?E.stamp(n.requiredAt):n.endAt))}</strong>. ${n.coverageOnly?"Komponen tertutup stok/suplai, tanpa pengadaan baru.":"Stok bersama diprioritaskan ke konsumsi paling awal."}</p>${n.supplyTimeline?.length?table(["Sumber alokasi","Siap","Qty"],n.supplyTimeline.map(s=>[esc(s.sourceType==="OPENING_STOCK"?"Stok awal":s.sourceNumber||s.sourceType),esc(time(s.availableAt||s.availableDate)),num(s.qty,3)+" "+esc(n.uom)])):""}${n.excludedGeneralStockQty>0?`<p class="ppsb-help">Stok gudang umum ${num(n.excludedGeneralStockQty,3)} ${esc(n.uom)} belum memiliki pencatatan sebagai stok milik ${esc(n.owner)}, sehingga tidak dipakai untuk kebutuhan customer ini.</p>`:""}</div>`);
    }
    const leadInput=$("form").elements.namedItem("leadDays");if(leadInput){leadInput.max="365";if(n.kind==="vendor")leadInput.min="1";}
    const eff=$("form").elements.namedItem("efficiency");if(eff){eff.min="1";eff.max="100";}
    const ct=$("form").elements.namedItem("cycleSeconds");if(ct){ct.max="1000000";if(n.kind==="process")ct.min="0.01";}
    const chain=result.rows.filter(r=>r.groupId===n.groupId&&r.calculation).sort((a,b)=>(a.startAt||"").localeCompare(b.startAt||""));
    $("editor-evidence").innerHTML=`<div class="ppsb-evidence"><h3>Dampak jadwal saat ini</h3><p>Rencana mundur: <strong>${esc(time(n.startAt))}</strong> → <strong>${esc(time(n.endAt))}</strong><br>FG paling cepat dari tanggal bisnis: <strong>${esc(time(g.earliestFinish))}</strong><br>Total beban proses FG: ${num(g.processSeconds)} detik (${num(g.processSeconds/3600,2)} jam).</p>${n.capacity?`<p>Kapasitas gabungan mesin yang memenuhi proses, 1 ${esc(seed.month)} sampai delivery: (${num(n.capacity.plannedMinutes/60)} jam skenario + ${num(n.capacity.existingMinutes/60)} jam rencana lain) / ${num(n.capacity.capacityMinutes/60)} jam tersedia = <strong>${n.capacity.percent==null?"Belum tersedia":`${num(n.capacity.percent)}%`}</strong>.</p>`:""}${n.issues.length?`<p class="ppsb-error">${n.issues.map(i=>esc(i)).join("<br>")}</p>`:""}${n.kind==="fg"?`<h3>Urutan proses &amp; batching</h3><div class="ppsb-table-scroll">${table(["Part / proses","Waktu proses","Batch × 8 jam","Mesin / vendor"],chain.map(r=>[editLink(r),`${num(r.calculation.totalSeconds)} detik`,num(r.calculation.batches,0),esc(r.kind==="process"?seed.resources.find(m=>m.id===r.machineId)?.code:seed.vendors.find(v=>v.id===r.vendorId)?.vendorCode)]))}</div>`:""}</div>`;
    $("editor-error").textContent="";formula();root.classList.add("ppsb-panel-open");if(!$("editor").open)$("editor").show();
    requestAnimationFrame(()=>{const scroll=gantt?.content.querySelector('.ew-scroll');if(scroll&&Number.isFinite(n.planned.start))scroll.scrollLeft=Math.max(0,(n.planned.start-E.at(gantt.start))/1440*gantt.dayWidth-24);});
  }
  async function apply(next,{record=true}={}){scenarioRevision++;busy=true;controls();try{const computed=await compute(seed,next);result=computed;overrides=structuredClone(next);if(record){history=history.slice(0,historyIndex+1);history.push(structuredClone(next));if(history.length>50)history.shift();historyIndex=history.length-1;}render();return true;}catch(error){message(error.message,true);$("editor-error").textContent=error.message;return false;}finally{busy=false;controls();}}
  function readAllocationOverrides(){
    const next=structuredClone(overrides);
    for(const input of $("allocation-rows").querySelectorAll("[data-fg-qty]")){
      const qty=Number(input.value);if(!input.value.trim()||!Number.isFinite(qty)||qty<0||qty>1e9)throw new Error("Isi semua qty dengan angka 0–1.000.000.000.");
      const id=input.dataset.fgQty,original=seed.nodes.find(n=>n.id===id).qty;
      next[id]={...next[id],qty};if(qty===Number(original)){delete next[id].qty;if(!Object.keys(next[id]).length)delete next[id];}
    }
    return next;
  }
  function previewAllocationTotals(){
    try{
      const next=readAllocationOverrides(),fgNodes=new Map(seed.nodes.filter(n=>n.kind==="fg").map(n=>[n.groupId,n]));
      const value=g=>Number(next[fgNodes.get(g.id).id]?.qty??fgNodes.get(g.id).qty);
      for(const section of $("allocation-rows").querySelectorAll("[data-allocation-key]")){
        const groups=result.groups.filter(g=>fgKey(g)===section.dataset.allocationKey),sum=groups.reduce((s,g)=>s+value(g),0),initial=groups.reduce((s,g)=>s+Number(g.initialQty??g.qty),0),difference=sum-initial;
        section.querySelector("[data-allocation-total]").textContent=`${num(sum,3)} ${groups[0].uom||"pcs"} · ${groups.filter(g=>value(g)>0).length} pembagian aktif${Math.abs(difference)>1e-6?` · ${difference>0?"+":""}${num(difference,3)} dari awal`:""}`;
        for(const cell of section.querySelectorAll("[data-qty-shortage]")){
          const g=groups.find(g=>g.id===cell.dataset.qtyShortage);
          if(!Number.isFinite(Number(g.requiredProductionQty))){cell.textContent="Periksa qty delivery";continue;}
          const due=groups.filter(row=>row.deliveryDate<=g.deliveryDate),shortage=Math.max(0,due.reduce((s,row)=>s+Number(row.requiredProductionQty||0)-value(row),0));
          cell.textContent=shortage>1e-6?`Kurang ${num(shortage,3)} sampai tanggal ini`:"Terpenuhi secara qty";cell.classList.toggle("ppsb-error",shortage>1e-6);
        }
        const hasTail=groups.some(g=>g.isRemainder&&value(g)>0);section.querySelectorAll("[data-merge-remainder]").forEach(button=>button.disabled=!hasTail);
      }
      $("allocation-error").textContent="";
    }catch(error){$("allocation-error").textContent=error.message;}
  }
  function openAllocationEditor(){
    if(busy||!result)return;closeEditor();$("picker").close();
    const sets=new Map(),fgNodes=new Map(result.rows.filter(n=>n.kind==="fg").map(n=>[n.groupId,n]));
    for(const g of result.groups){const key=fgKey(g);if(!sets.has(key))sets.set(key,[]);sets.get(key).push(g);}
    $("allocation-rows").innerHTML=[...sets].map(([key,groups])=>{
      groups.sort((a,b)=>Number(a.isRemainder)-Number(b.isRemainder)||Number(a.splitIndex||0)-Number(b.splitIndex||0)||String(a.deliveryDate).localeCompare(String(b.deliveryDate)));
      const first=groups[0],hasTail=groups.some(g=>g.isRemainder),initial=groups.reduce((s,g)=>s+Number(g.initialQty??g.qty),0);
      return `<section class="ppsb-allocation-section" data-allocation-key="${esc(key)}"><div class="ppsb-allocation-heading"><div><h3>${esc(first.partCode)} · ${esc(first.partName)}</h3><p>Part Number: ${esc(first.partNumber || '—')}</p><p>Awal ${num(initial,3)} ${esc(first.uom||"pcs")} · ${first.deliveryCount||groups.filter(g=>!g.isRemainder).length} delivery</p><strong data-allocation-total></strong></div>${hasTail?`<div class="ppsb-allocation-actions"><button type="button" class="ppsb-btn" data-merge-remainder="${esc(key)}">Gabungkan sisa ke terakhir</button><button type="button" class="ppsb-btn" data-merge-remainder="${esc(key)}" data-round-last="100">Gabung + bulatkan terakhir ke 100</button></div>`:""}</div><div class="ppsb-table-scroll"><table data-enterprise-table="off"><thead><tr><th>Pembagian</th><th>Delivery</th><th>Qty awal</th><th>Qty skenario</th><th>Kebutuhan sampai delivery</th></tr></thead><tbody>${groups.map((g,index)=>`<tr class="${g.isRemainder?"ppsb-remainder-row":""}"><td>${g.isRemainder?"Sisa terpisah":`Delivery ${g.splitIndex||index+1}`}<small>${esc(g.customer)}</small></td><td>${fmt(g.deliveryDate)}</td><td class="ppsb-num">${num(g.initialQty??g.qty,3)}</td><td><input aria-label="Qty ${esc(g.partCode)} ${g.isRemainder?"sisa":"delivery "+(g.splitIndex||index+1)}" data-fg-qty="${esc(fgNodes.get(g.id).id)}" type="number" min="0" max="1000000000" step="any" required value="${esc(g.qty)}" ${g.initialQty===0?'readonly title="Pembagian awal 0 belum memiliki urutan BOM produksi."':""}></td><td data-qty-shortage="${esc(g.id)}"></td></tr>`).join("")}</tbody></table></div></section>`;
    }).join("")||'<p class="ppsb-empty">Belum ada pembagian produksi pada bulan ini.</p>';
    previewAllocationTotals();$("allocation-editor").showModal();
  }
  $("allocations").addEventListener("click",openAllocationEditor);
  $("allocation-form").addEventListener("input",previewAllocationTotals);
  $("allocation-form").addEventListener("click",event=>{
    const button=event.target.closest("[data-merge-remainder]");if(!button||busy)return;
    try{
      const next=E.mergeRemainderOverrides(seed,readAllocationOverrides(),button.dataset.mergeRemainder,{roundTo:Number(button.dataset.roundLast||0)});
      for(const input of $("allocation-rows").querySelectorAll("[data-fg-qty]"))if(next[input.dataset.fgQty]?.qty!=null)input.value=next[input.dataset.fgQty].qty;
      previewAllocationTotals();
    }catch(error){$("allocation-error").textContent=error.message;}
  });
  $("allocation-form").addEventListener("submit",async event=>{
    event.preventDefault();if(busy||!$("allocation-form").reportValidity())return;
    try{if(await apply(readAllocationOverrides())){$("allocation-editor").close();message("Pembagian diterapkan. Qty produksi, durasi, material, dan risiko delivery dihitung ulang. Simpan skenario untuk melanjutkan nanti.");}else $("allocation-error").textContent=$("editor-error").textContent;}
    catch(error){$("allocation-error").textContent=error.message;}
  });
  for(const id of ["allocation-close","allocation-cancel"])$(id).addEventListener("click",()=>$("allocation-editor").close());
  $("form").addEventListener("input",formula);
  $("form").addEventListener("change",event=>{const n=result.rows.find(r=>r.id===editing);if(event.target.name==="vendorId"){const v=seed.vendors.find(v=>v.id===event.target.value);if(v?.leadTimeDays!=null)$("form").elements.namedItem("leadDays").value=Math.max(1,Number(v.leadTimeDays));}if(event.target.name==="machineId"){const m=n.machineOptions.find(m=>m.machineId===event.target.value);if(m?.cycleTimeSeconds>0)$("form").elements.namedItem("cycleSeconds").value=m.cycleTimeSeconds;if(m?.setupMinutes!=null)$("form").elements.namedItem("dt-setup").value=m.setupMinutes;}formula();});
  $("form").addEventListener("submit",async event=>{event.preventDefault();if(busy||!$("form").reportValidity())return;const next={...overrides,[editing]:{...overrides[editing],...getAdjustment()}};if(await apply(next)){closeEditor();message(`Adjustment diterapkan. ${result.rows.length} aktivitas dihitung ulang dalam ${num(result.elapsedMs)} ms.`);}});
  function closeEditor(){$("editor").close();root.classList.remove("ppsb-panel-open");}
  for(const id of ["close","cancel"])$(id).addEventListener("click",closeEditor);
  root.addEventListener("click",event=>{const edit=event.target.closest("[data-edit]");if(edit)openEditor(edit.dataset.edit);const group=event.target.closest("[data-group]");if(group){selected=group.dataset.group;page=0;render(true);}const k=event.target.closest("[data-kind]");if(k&&result){kind=k.dataset.kind;page=0;root.querySelectorAll("[data-kind]").forEach(b=>b.setAttribute("aria-pressed",String(b===k)));renderGantt(true);}const b=event.target.closest("[data-board]");if(b){board=b.dataset.board;root.querySelectorAll("[data-board]").forEach(t=>t.setAttribute("aria-pressed",String(t===b)));renderBoard();}});
  searchControl.addEventListener("input",()=>{page=0;if(result)render();});$("all").addEventListener("click",()=>{selected="";searchControl.value="";page=0;render(true);});$("edit-fg").addEventListener("click",()=>openActivityPicker(result.rows.filter(n=>n.kind==="fg"&&includesGroup(n.groupId)).map(n=>n.id),"Pilih target FG"));
  function persistView(){const url=new URL(location.href);for(const [key,value]of [['q',searchControl.value],['ganttView',viewControl.value],['risk',riskControl.value]]){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}window.history.replaceState(null,'',url);updateWorkspaceLinks();}
  searchControl.addEventListener('input',persistView);$("all").addEventListener('click',persistView);
  for(const id of ['view','risk'])$(id).addEventListener('change',()=>{persistView();if(result)render(true);});
  $("checks").addEventListener('click',()=>{const url=new URL('/modules/planning-ppic/labs/data-readiness',location.origin);url.searchParams.set('month',seed?.month||$("month").value);if(searchControl.value)url.searchParams.set('q',searchControl.value);location.assign(url.pathname+url.search);});
  $("prev").addEventListener("click",()=>{page--;renderGantt(true);});$("next").addEventListener("click",()=>{page++;renderGantt(true);});
  $("load").addEventListener("click",async()=>{await load({force:true});await listScenarios();});$("month").addEventListener("change",async()=>{const url=new URL(location.href);url.searchParams.delete("scenario");window.history.replaceState(null,"",url);openedScenarioId="";await load();await listScenarios();});
  $("undo").addEventListener("click",async()=>{const next=historyIndex-1;if(next>=0&&await apply(history[next],{record:false})){historyIndex=next;controls();}});
  $("redo").addEventListener("click",async()=>{const next=historyIndex+1;if(next<history.length&&await apply(history[next],{record:false})){historyIndex=next;controls();}});
  $("reset").addEventListener("click",async()=>{if(await apply({}))message("Skenario kembali ke parameter snapshot awal. Undo tersedia.");});
  $("save").addEventListener("click",()=>saveScenario());
  $("save-copy").addEventListener("click",()=>saveScenario(true));
  $("restore").addEventListener("click",async()=>{
    if(!serverScenarios){const d=draft();if(!d||d.fingerprint!==seed.fingerprint)return message('Skenario browser untuk snapshot ini belum tersedia.',true);if(await apply(d.overrides)){$("name").value=d.name||'Skenario tersimpan';message('Skenario browser telah dibuka.');}return;}
    await listScenarios();
    $("scenarios-list").innerHTML=scenarioList.length?scenarioList.map(record=>'<button type="button" class="ppsb-scenario-choice" data-scenario-id="'+esc(record.id)+'"><strong>'+esc(record.name)+'</strong><span>'+esc(record.month)+' · revisi '+esc(record.revision)+' · '+esc(record.updatedAt||'')+'</span></button>').join(''):'<p>Belum ada skenario tersimpan untuk bulan ini.</p>';
    const legacy=draft();if(legacy?.fingerprint===seed.fingerprint)$("scenarios-list").insertAdjacentHTML('beforeend','<button type="button" class="ppsb-btn" data-local-scenario>Impor skenario lama dari browser ini</button>');
    $("scenarios").showModal();
  });
  $("scenarios-close").addEventListener("click",()=>$("scenarios").close());
  $("scenarios-list").addEventListener("click",async event=>{
    const button=event.target.closest('[data-scenario-id]');if(button)return openServerScenario(button.dataset.scenarioId);
    if(event.target.closest('[data-local-scenario]')){const d=draft();if(d?.fingerprint===seed.fingerprint&&await apply(d.overrides)){$("name").value=d.name||'Skenario browser';savedScenario=null;$("scenarios").close();message('Skenario browser dimuat. Klik Simpan skenario untuk menyimpannya ke server.');}}
  });
  $("export").addEventListener("click",()=>{const quote=v=>`"${String(v??"").replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;const rows=[["Jenis","FG","FG Part Number","Part","Part Number","Proses","Qty net","Mulai","Selesai","Jam proses","Batch 8 jam","Lead hari","Temuan"],...result.rows.map(n=>[kinds[n.kind],seed.groups.find(g=>g.id===n.groupId)?.partCode,seed.groups.find(g=>g.id===n.groupId)?.partNumber,n.partCode,n.partNumber,n.title,n.qty,n.startAt,n.endAt,n.calculation?.totalSeconds/3600||0,n.calculation?.batches||0,n.leadDays||0,n.issues.join("; ")])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`ppic-simulasi-${seed.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  let resizeTimer;
  const resizeGantt=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(result&&!busy&&gantt?.labelWidth!==($("gantt").clientWidth<550?180:310))renderGantt(false);},150);};
  window.addEventListener("resize",resizeGantt);
  if(window.ResizeObserver)new ResizeObserver(resizeGantt).observe($("gantt"));
  const backgroundState=new Map();
  function setFocus(on){
    if(on){for(const element of root.parentElement.children)if(element!==root&&!/^(SCRIPT|STYLE|LINK)$/.test(element.tagName)){if(!backgroundState.has(element))backgroundState.set(element,element.inert);element.inert=true;}}
    else{for(const [element,inert] of backgroundState)element.inert=inert;backgroundState.clear();}
    root.classList.toggle("ppsb-focus",on);document.body.classList.toggle("ppsb-focus-active",on);$("fullscreen").textContent=on?"Keluar layar penuh":"Layar penuh";$("fullscreen").setAttribute("aria-pressed",String(on));if(result)renderGantt(false);
  }
  $("fullscreen").addEventListener("click",()=>setFocus(!root.classList.contains("ppsb-focus")));
  $("refresh").addEventListener("click",async()=>{
    if(busy||refreshing||!pendingFresh)return;
    const payload=pendingFresh;busy=true;controls();
    try {const next=await compute(payload,{});install(payload,next,payload.month);pendingFresh=null;sourceStatus="Snapshot baru diterapkan";message("");}
    catch(error){message(error.message,true);}
    finally{busy=false;sourceLabel();controls();}
  });
  document.addEventListener("keydown",event=>{if(event.key!=="Escape"||$("picker").open||$("allocation-editor").open||$("scenarios").open)return;if($("editor").open){closeEditor();event.preventDefault();}else if(!root.classList.contains("ppsb-page-only")&&root.classList.contains("ppsb-focus")){setFocus(false);event.preventDefault();}});
  root.classList.add("ppsb-focus","ppsb-page-only");
  document.body.classList.add("ppsb-gantt-page");window.scrollTo(0,0);
  const stageDock=document.createElement("nav");stageDock.className="module-subnav ppic-workspace-nav ppsb-stage-dock";stageDock.setAttribute("aria-label","Tahapan perencanaan PPIC");
  const stageLinks=document.createElement("div");stageLinks.className="app-container module-subnav-inner";
  document.querySelectorAll(".ppic-workspace-nav .ppic-nav-stage,#ppsb-workspace-stages a").forEach(link=>{link.classList.add("ppic-nav-stage");stageLinks.append(link);});document.getElementById("ppsb-workspace-stages")?.remove();
  stageDock.append(stageLinks);root.after(stageDock);
  const sizePage=()=>{const top=Math.max(0,root.getBoundingClientRect().top);root.style.setProperty("--ppsb-page-top",`${top}px`);root.style.setProperty("--ppsb-dock-height",`${stageDock.getBoundingClientRect().height}px`);};
  sizePage();requestAnimationFrame(sizePage);window.addEventListener("resize",sizePage);
  if(window.ResizeObserver){const observer=new ResizeObserver(sizePage);document.querySelectorAll('body>header,body>nav').forEach(el=>observer.observe(el));observer.observe(stageDock);}
  const analysis=window.PpicSandboxAnalysis.create({element:$("analysis"),E,onPath:ids=>{
    criticalIds=new Set(ids);if(!result)return;
    if(ids.length){const node=result.rows.find(n=>n.id===ids[0]),group=result.groups.find(g=>g.id===node?.groupId);if(group)expanded.add(fgKey(group));}
    renderGantt(false);
  }});
  await load();await listScenarios({autoOpen:true});
})();
