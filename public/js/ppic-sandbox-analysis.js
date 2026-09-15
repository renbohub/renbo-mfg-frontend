(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PpicSandboxAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
  const minutes=(spans,a,b)=>spans.reduce((sum,[s,e])=>sum+overlap(s,e,a,b),0);
  function weeks(month,E){
    const start=E.at(month+'-01'),end=Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)/60000;
    const out=[];for(let a=start;a<end;a+=7*1440)out.push({id:out.length,label:'W'+(out.length+1),start:a,end:Math.min(a+7*1440,end)});return out;
  }
  function analyze(seed,result,E){
    const buckets=weeks(seed.month,E),byId=new Map(result.rows.map(n=>[n.id,n]));
    const resources=seed.resources.map(resource=>{
      const windows=E.subtract(resource.windows,resource.unavailable||[]),reservations=E.merge(resource.reservations||resource.blocked||[]);
      const tasks=result.rows.filter(n=>n.kind==='process'&&n.machineId===resource.id);
      const cells=buckets.map(w=>{
        const capacity=minutes(windows,w.start,w.end);
        const existing=windows.reduce((sum,[a,b])=>sum+reservations.reduce((s,[c,d])=>s+overlap(Math.max(a,w.start),Math.min(b,w.end),c,d),0),0);
        const planned=tasks.reduce((sum,n)=>sum+minutes(n.planned.segments||[],w.start,w.end),0);
        return {...w,capacity,existing,planned,load:existing+planned,percent:capacity>0?(existing+planned)/capacity*100:null,over:Math.max(0,existing+planned-capacity),taskIds:tasks.filter(n=>minutes(n.planned.segments||[],w.start,w.end)>0).map(n=>n.id)};
      });
      const total=cells.reduce((s,c)=>({capacity:s.capacity+c.capacity,load:s.load+c.load}),{capacity:0,load:0});
      return {id:resource.id,code:resource.code,name:resource.name,type:'Machine',cells,percent:total.capacity?total.load/total.capacity*100:null,peak:Math.max(0,...cells.map(c=>c.percent||0)),tasks};
    });
    for(const vendor of seed.vendors){
      const tasks=result.rows.filter(n=>n.kind==='vendor'&&n.vendorId===vendor.id);if(!tasks.length)continue;
      resources.push({id:'vendor:'+vendor.id,code:vendor.vendorCode,name:vendor.vendorName,type:'External',tasks,cells:buckets.map(w=>({...w,percent:null,capacity:null,taskIds:tasks.filter(n=>overlap(n.planned.start,n.planned.end,w.start,w.end)>0).map(n=>n.id)})),percent:null,peak:null});
    }
    const ranking=resources.flatMap(r=>r.cells.filter(c=>c.percent!=null||c.over>0).map(c=>({...c,resource:r}))).sort((a,b)=>(b.percent??Infinity)-(a.percent??Infinity)||b.load-a.load);
    const paths=result.groups.map(g=>{
      const members=result.rows.filter(n=>n.groupId===g.id),ids=new Set(members.map(n=>n.id)),fg=members.find(n=>n.kind==='fg');
      if(!fg||members.some(n=>!Number.isFinite(n.planned.start)||!Number.isFinite(n.planned.end)))return {group:g,unresolved:true,nodes:[]};
      const ordered=E.topology(members).ordered.map(id=>byId.get(id)),early=new Map(),late=new Map(),duration=n=>Math.max(0,n.planned.end-n.planned.start);
      for(const n of ordered)early.set(n.id,Math.max(0,...n.dependencies.filter(id=>ids.has(id)).map(id=>early.get(id)))+duration(n));
      const length=early.get(fg.id),critical=[];late.set(fg.id,length);
      for(const n of [...ordered].reverse()){
        const end=late.get(n.id);if(end==null)continue;
        if(Math.abs(end-early.get(n.id))<1e-6)critical.push(n);
        for(const id of n.dependencies.filter(id=>ids.has(id)))late.set(id,Math.min(late.get(id)??Infinity,end-duration(n)));
      }
      return {group:g,length,nodes:critical.reverse(),unresolved:false};
    });
    return {buckets,resources,ranking,paths,byId};
  }
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(n,d=1)=>Number.isFinite(n)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:d}).format(n):'—';
  const date=value=>value?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T00:00:00Z')):'—';
  const pct=n=>n==null?'—':num(n,0)+'%';
  const tone=c=>c.over>0||c.percent>100?'over':c.percent>=90?'near':c.percent==null?'unknown':'normal';
  const status=c=>({over:'Overload',near:'Near capacity',unknown:'Belum tersedia',normal:'Normal'}[tone(c)]);
  const table=(headers,rows)=>rows.length?`<table data-enterprise-table="off"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="ppsb-analysis-empty">Tidak ada temuan untuk pilihan ini.</p>';
  const edit=(id,label)=>`<button type="button" class="ppsb-analysis-link" data-edit="${escape(id)}">${escape(label)}</button>`;
  function create({element,E,onPath}){
    let seed,result,model,groupIds,tab='capacity',selected=null,activePath=null;
    const tabs=[['capacity','Resource Capacity'],['bottleneck','Bottleneck Analysis'],['material','Material Readiness'],['critical','Critical Path'],['exception','Exception List']];
    element.innerHTML=`<header class="ppsb-analysis-header"><div role="tablist" aria-label="Analisis perencanaan">${tabs.map(([id,label],i)=>`<button type="button" role="tab" id="ppsb-analysis-tab-${id}" data-analysis-tab="${id}" aria-controls="ppsb-analysis-panel" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${label}</button>`).join('')}</div><button type="button" class="ppsb-analysis-toggle" aria-label="Ciutkan panel analisis" aria-expanded="true">⌄</button></header><div class="ppsb-analysis-panel" id="ppsb-analysis-panel" role="tabpanel" aria-labelledby="ppsb-analysis-tab-capacity" tabindex="0"></div><p class="ppsb-analysis-caption"></p>`;
    const panel=element.querySelector('[role="tabpanel"]'),caption=element.querySelector('.ppsb-analysis-caption');
    const visible=g=>!groupIds||groupIds.has(g.id);
    function selectTab(id){tab=id;activePath=null;element.querySelectorAll('[role="tab"]').forEach(b=>{const active=b.dataset.analysisTab===id;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});panel.setAttribute('aria-labelledby','ppsb-analysis-tab-'+id);onPath([]);render();}
    element.addEventListener('keydown',event=>{const button=event.target.closest('[role="tab"]');if(!button)return;const i=tabs.findIndex(([id])=>id===button.dataset.analysisTab);let next;if(event.key==='ArrowRight')next=(i+1)%tabs.length;if(event.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!=null){event.preventDefault();selectTab(tabs[next][0]);element.querySelector('#ppsb-analysis-tab-'+tabs[next][0]).focus();}});
    element.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.analysisTab)selectTab(button.dataset.analysisTab);
      if(button.hasAttribute('data-capacity')){selected=JSON.parse(button.dataset.capacity);render();}
      if(button.dataset.path){activePath=button.dataset.path;const path=model.paths.find(p=>p.group.id===activePath);if(path)onPath(path.nodes.map(n=>n.id));}
      if(button.classList.contains('ppsb-analysis-toggle')){const collapsed=element.classList.toggle('is-collapsed');button.setAttribute('aria-expanded',!collapsed);button.setAttribute('aria-label',collapsed?'Buka panel analisis':'Ciutkan panel analisis');button.textContent=collapsed?'⌃':'⌄';}
    });
    function render(){
      if(!model)return;
      const scoped=result.rows.filter(n=>visible(result.groups.find(g=>g.id===n.groupId)));
      const selectedResource=model.resources.find(r=>r.id===selected?.[0]),focus=selectedResource?{...selectedResource.cells[selected[1]],resource:selectedResource}:model.ranking[0];
      if(tab==='capacity'||tab==='bottleneck'){
        const capacity=table(['Resource / Work Center','Type',...model.buckets.map(w=>`<span title="${date(E.day(w.start))}–${date(E.day(w.end-1))}">${w.label}</span>`),'Total','Status'],model.resources.map(r=>[`${escape(r.code)}<small title="${escape(r.name)}">${escape(r.name)}</small>`,r.type,...r.cells.map(c=>`<button type="button" class="ppsb-heat ${tone(c)}" aria-pressed="${focus?.resource.id===r.id&&focus?.id===c.id}" data-capacity="${escape(JSON.stringify([r.id,c.id]))}" title="${escape(r.code)} · ${c.label} · ${r.type==='External'?'Kapasitas vendor belum dimodelkan':`${num(c.load/60)} jam beban / ${num(c.capacity/60)} jam kalender; ${num(c.existing/60)} jam rencana lain`}" aria-label="${escape(r.code)} ${c.label}: ${pct(c.percent)}">${pct(c.percent)}</button>`),pct(r.percent),`<span class="ppsb-analysis-badge ${tone({percent:r.peak,over:r.cells.some(c=>c.over>0)?1:0})}">${r.type==='External'?'Belum dimodelkan':status({percent:r.peak,over:r.cells.some(c=>c.over>0)?1:0})}</span>`]));
        const ranked=model.ranking.slice(0,tab==='bottleneck'?15:5);
        const ranking=ranked.length?`<ol class="ppsb-bottlenecks">${ranked.map((c,i)=>`<li><button type="button" class="${tone(c)}" data-capacity="${escape(JSON.stringify([c.resource.id,c.id]))}"><b>${i+1}</b><strong>${escape(c.resource.code)}</strong><em>${pct(c.percent)}</em><span>${c.label} · ${c.over>0?`Over ${num(c.over/60)} jam`:c.percent>=90?'Near capacity':'Normal'}</span></button></li>`).join('')}</ol>`:'<p class="ppsb-analysis-empty">Belum ada kapasitas mesin terukur.</p>';
        const tasks=(focus?.taskIds||[]).map(id=>model.byId.get(id));
        const impacted=result.groups.filter(g=>visible(g)&&tasks.some(n=>n.groupId===g.id));
        const impact=table(['FG / Need','Part Number','Delay¹','Qty (pcs)','Review'],impacted.map(g=>{const alternatives=tasks.find(n=>n.groupId===g.id&&n.machineOptions?.length>1),fg=result.rows.find(n=>n.groupId===g.id&&n.kind==='fg');return [escape(g.partCode)+`<small>${date(g.targetDate)}</small>`,escape(g.partNumber || '—'),`<span class="${g.targetSpareDays<0?'ppsb-delay':''}">${g.targetSpareDays==null?'—':num(Math.max(0,-g.targetSpareDays),2)}</span>`,num(g.qty,0),edit(alternatives?.id||fg?.id,alternatives?'Mesin alternatif':'FG need')];}));
        panel.innerHTML=`<div class="ppsb-analysis-grid ${tab==='bottleneck'?'ppsb-analysis-bottleneck':''}">${tab==='capacity'?`<section class="ppsb-analysis-column ppsb-resource-table">${capacity}</section>`:''}<section class="ppsb-analysis-column"><h3>${tab==='capacity'?'Top 5 Beban / Bottleneck':'Peringkat resource per minggu'}</h3>${ranking}</section><section class="ppsb-analysis-column"><h3>Bottleneck Impact</h3><p>FG yang memakai ${escape(focus?.resource.code||'resource')} ${escape(focus?.label||'')} · ${focus?status(focus):'—'}</p>${impact}</section><section class="ppsb-analysis-column ppsb-analysis-legend"><h3>Legend</h3><span><i class="material"></i>Material</span><span><i class="process"></i>In-house</span><span><i class="vendor"></i>Vendor</span><span><i class="fg"></i>FG need</span><span><i class="over"></i>Over capacity</span><span><i class="near"></i>≥90% capacity</span><span><i class="critical"></i>Jalur dipilih</span><span><i class="today"></i>Tanggal bisnis</span></section></div>`;
        caption.textContent=`${seed.month} · W1: tgl 1–7, dst. Beban semua FG + rencana lain / kalender net downtime; status = puncak mingguan. ¹Delay total FG (hari kalender), bukan akibat satu mesin. Vendor belum punya kapasitas terukur.`;
      }else if(tab==='material'){
        panel.innerHTML=table(['Material / FG need','Part Number','Bruto','Stok terpakai','Kiriman firm','Rencana','Qty net','Beli / minta','Kebutuhan proses','Siap estimasi','Readiness'],scoped.filter(n=>n.kind==='material').sort((a,b)=>(a.requiredAt??a.planned.end??Infinity)-(b.requiredAt??b.planned.end??Infinity)).map(n=>{
          const g=result.groups.find(g=>g.id===n.groupId),ready=n.earliest?.end,required=n.requiredAt??n.planned.end,late=Number.isFinite(ready)&&Number.isFinite(required)&&ready>required;
          const state=late?`Terlambat ${num((ready-required)/1440,2)} hari`:n.plannedSupplyQty>0?'Suplai belum firm':n.issues.length?'Periksa':n.qty===0?'Tertutup stok / firm':n.availableDate?'Sesuai asumsi':n.ownership==='CUSTOMER_SUPPLIED'?'Konfirmasi customer':'Konfirmasi pembelian';
          return [edit(n.id,n.partCode)+`<small>${escape(g.partCode)} · ${date(g.targetDate)} · ${escape(n.ownership==='CUSTOMER_SUPPLIED'?n.owner:'Perusahaan')}</small>`,escape(n.partNumber || '—'),`${num(n.grossQty,3)} ${escape(n.uom)}`,num(n.onHandQty||0,3),num(n.firmSupplyQty||0,3),num(n.plannedSupplyQty||0,3),`${num(n.qty,3)} ${escape(n.uom)}`,n.qty>0?date(n.startAt):'—',date(E.stamp(required)),Number.isFinite(ready)?date(E.stamp(ready)):'—',`<span class="ppsb-analysis-badge ${late?'over':n.qty===0&&!n.plannedSupplyQty&&!n.issues.length?'normal':'near'}">${!Number.isFinite(ready)||!Number.isFinite(required)?'Belum terjadwal':state}</span>`];
        }));caption.textContent='Bruto − alokasi stok − kiriman firm − suplai rencana = net. Alokasi mengikuti tanggal konsumsi, per material/pemilik/satuan. Kiriman belum menjadi stok; klik material untuk rincian sumber dan adjustment.';
      }else if(tab==='critical'){
        panel.innerHTML=table(['FG / Need','Part Number','Rentang jalur','Aktivitas kritis BOM','Spare target','Gantt'],model.paths.filter(p=>visible(p.group)).map(p=>[`${escape(p.group.partCode)}<small>${date(p.group.targetDate)} · ${num(p.group.qty,0)} pcs</small>`,escape(p.group.partNumber || '—'),p.unresolved?'Belum terjadwal':`${num(p.length/60)} jam kalender`,p.unresolved?'Selesaikan aktivitas yang belum terjadwal':p.nodes.map(n=>edit(n.id,n.title)).join(' · '),`${num(p.group.targetSpareDays,2)} hari`,p.unresolved?'—':`<button type="button" class="ppsb-analysis-link" data-path="${escape(p.group.id)}">Lihat jalur</button>`]));caption.textContent='CPM dependensi BOM dengan durasi rentang kalender skenario. Cabang paralel dapat sama-sama kritis; ini bukan slack kapasitas mesin. Lihat jalur memberi garis merah pada aktivitas terkait.';
      }else{
        const rows=scoped.flatMap(n=>(n.issues||[]).map(issue=>[edit(n.id,n.partCode),escape(n.partNumber || '—'),escape(n.title),escape(issue)]));
        rows.push(...(result.issues||[]).map(issue=>['Sumber data','—','—',escape(issue)]));
        rows.push(...result.groups.filter(g=>visible(g)&&g.targetSpareDays<0).map(g=>[edit(result.rows.find(n=>n.kind==='fg'&&n.groupId===g.id)?.id,g.partCode),escape(g.partNumber || '—'),'FG need '+date(g.targetDate),`Estimasi selesai melewati target ${num(-g.targetSpareDays,2)} hari.`]));
        panel.innerHTML=table(['Part / FG','Part Number','Aktivitas','Temuan'],rows);caption.textContent=`${rows.length} temuan untuk FG yang ditampilkan. Klik part untuk membuka adjustment; masalah master perlu diselesaikan pada sumber data.`;
      }
    }
    return {update(nextSeed,nextResult,ids){if(seed!==nextSeed||result!==nextResult){if(seed?.month!==nextSeed.month){selected=null;activePath=null;}seed=nextSeed;result=nextResult;model=analyze(seed,result,E);if(activePath)onPath(model.paths.find(p=>p.group.id===activePath)?.nodes.map(n=>n.id)||[]);}groupIds=ids;render();}};
  }
  return {weeks,analyze,create};
});
