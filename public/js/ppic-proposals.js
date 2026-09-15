(() => {
  "use strict";
  if (document.querySelector("[data-ppic-sandbox]")) return;
  if (!location.pathname.startsWith("/modules/planning-ppic/") || /production-actuals|recovery|daily-production|demand-planning|monthly-delivery/.test(location.pathname)) return;
  const control = document.querySelector('main input[type="month"]');
  if (!control) return;
  const esc=x=>String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const t=(k,p)=>window.PpicI18n.t(k,p), num=x=>new Intl.NumberFormat(window.PpicI18n.locale(),{maximumFractionDigits:2}).format(Number(x)||0);
  const mode=location.pathname.includes("monthly-production")?"monthly":location.pathname.includes("/mrp")?"material":"fg";
  const section=document.createElement("section");
  section.className="app-container ppic-calendar-page ppic-calendar-card";
  section.innerHTML=`
    <header class="ppic-card-heading"><div><span class="ppic-eyebrow" data-ppic-i18n="planningCalendar">${esc(t("planningCalendar"))}</span><h2 data-proposal-title>${esc(t(mode === "material" ? "materialProposal" : "proposal"))}</h2><p data-ppic-i18n="calendarHint">${esc(t("calendarHint"))}</p></div></header>
    <div class="ppic-calendar-tools ppic-calendar-filters" role="group" aria-label="${esc(t("search"))}">
      <label class="ppic-calendar-search"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input data-proposal-search type="search" aria-label="${esc(t("proposalSearch"))}" placeholder="${esc(t("proposalSearch"))}"></label>
      <select data-searchable-disabled data-proposal-period aria-label="${esc(t("timeSummary"))}"><option value="day">${esc(t("dayView"))}</option><option value="week">${esc(t("weekView"))}</option></select>
      <div class="ppic-calendar-actions"><button type="button" data-proposal-refresh>${esc(t("refreshProposal"))}</button><button type="button" data-proposal-export>${esc(t("export"))}</button></div>
    </div>
    <p data-proposal-status class="ppic-calendar-status" role="status"></p>
    <div data-proposal-table class="ppic-calendar-scroll" tabindex="0" role="region" aria-label="${esc(t("planningCalendar"))}"></div>
    <footer class="ppic-calendar-tools ppic-calendar-pagination"><span data-proposal-page aria-live="polite"></span><div class="ppic-pagination-controls"><button type="button" data-proposal-prev disabled>${esc(t("previous"))}</button><button type="button" data-proposal-next disabled>${esc(t("next"))}</button></div></footer>`;
  section.setAttribute("data-quantity-formatted", "true");
  const main=document.querySelector("main"); const period=control.closest("section") || main.querySelector("header"); if(period)period.after(section);else main.prepend(section);
  const audit=main.querySelector(".mwb-board");if(audit){const details=document.createElement("details");details.className="ppic-legacy-audit app-container";details.innerHTML="<summary>Rincian MPS dan pemeriksaan lanjutan</summary>";audit.before(details);details.append(audit);}
  let result=null, requestId=0, page=1; const opened=new Set();
  const el=key=>section.querySelector(`[data-proposal-${key}]`);
  if(mode==="material"){el("period").value="week";el("period").hidden=true;}
  function monday(date){const d=new Date(`${String(date).slice(0,10)}T00:00:00Z`);if(!Number.isFinite(d.getTime()))return null;d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
  function rows(){
    if(!result)return [];
    if(mode==="fg")return result.workbench.items.map(item=>({key:item.partCode,label:`${item.partNumber||item.partCode} · ${item.partName}`,unit:item.uomCode,item,sources:[...item.phases,...(item.bufferPhase?[item.bufferPhase]:[])],days:[...item.phases,...(item.bufferPhase?[item.bufferPhase]:[])].reduce((days,phase)=>{const key=String(phase.fgRequiredDate||"").slice(0,10);if(key)days[key]=(days[key]||0)+Number(phase.plannedProductionQty||0);return days;},{})}));
    if(mode==="monthly") {
      const groups=new Map();
      for(const lot of result.lots||[]){const allocation=result.allocations.find(row=>row.machineId===lot.machineId),key=lot.machineId;if(!groups.has(key))groups.set(key,{key,label:allocation?.machineCode||key,unit:"lot",days:{},sources:[]});const group=groups.get(key);group.days[lot.scheduleDate]=(group.days[lot.scheduleDate]||0)+1;group.sources.push(lot);}
      for(const allocation of result.allocations.filter(row=>row.vendorId)){const key=JSON.stringify([allocation.vendorId,allocation.uomCode]);if(!groups.has(key))groups.set(key,{key,label:allocation.vendorCode||allocation.vendorId,unit:allocation.uomCode,days:{},sources:[]});const group=groups.get(key),date=String(allocation.scheduleDate).slice(0,10);group.days[date]=(group.days[date]||0)+Number(allocation.qty);group.sources.push(allocation);}
      return [...groups.values()];
    }
    const grouped=new Map();
    const inputs=mode==="material"?result.materials:result.allocations;
    for(const input of inputs){const label=mode==="material"?input.partCode:input.machineCode||input.vendorId||"Belum ada mesin",unit=input.uomCode||"—",key=JSON.stringify([label,unit,mode==="material"?[input.supplyCustomerCode||input.materialSupplyType,input.category]:""]);if(!grouped.has(key))grouped.set(key,{key,label,unit,days:{},sources:[]});const row=grouped.get(key);const date=String(mode==="material"?input.materialRequiredDate||input.requiredDate||"":input.scheduleDate||"").slice(0,10);if(date)row.days[date]=(row.days[date]||0)+Number(mode==="material"?input.netRequirement:input.qty);row.sources.push(input);}
    return [...grouped.values()];
  }
  function filtered(){const term=el("search").value.toLowerCase();return rows().filter(row=>!term||`${row.label} ${row.unit} ${JSON.stringify(row.sources)}`.toLowerCase().includes(term));}
  function columns(all){return window.PpicCalendar.columns(control.value,{weekly:mode==="material"||el("period").value==="week",horizon:mode==="material"?1:0,dates:all.flatMap(row=>Object.keys(row.days))});}
  const pageSizeControl=document.createElement("select");pageSizeControl.setAttribute("data-searchable-disabled", "true");pageSizeControl.setAttribute("aria-label", "Baris induk per halaman");pageSizeControl.innerHTML=[25,50,100].map(value=>'<option value="'+value+'">'+value+'</option>').join("");el("next").after(pageSizeControl);const pageLimit=()=>Number(pageSizeControl.value)||25;pageSizeControl.addEventListener("change",()=>{page=1;render();});

  function render(){const all=filtered(),cols=columns(all),pages=Math.max(1,Math.ceil(all.length/pageLimit()));page=Math.min(page,pages);el("title").textContent=t(mode === "material" ? "materialProposal" : "proposal");el("page").textContent=t("pageGroups",{page,pages,count:all.length});el("prev").disabled=page===1;el("next").disabled=page===pages;
    const errors=(result?.plans||[]).map(plan=>plan.recommendation?.error).filter(Boolean),missing=(result?.materials||[]).filter(row=>!window.PpicCalendar.dateKey(row.materialRequiredDate||row.requiredDate)).length;
    if(result)el("status").textContent=t(result.sourceMode === "LOCKED_BASELINE" ? "proposalLocked" : "proposalCurrent")+" · "+(result.mpsNumber||t("empty"))+" · "+t("revision")+" "+(result.mpsRevision||"—")+". "+(errors.length?t("incompleteSlots"):"")+(missing?" "+t("missingDates",{count:missing}):"");
    el("table").innerHTML=`<table data-enterprise-table="off"><thead><tr><th rowspan="2">${mode==="fg"?"FG":mode==="material"?t("materialOwner"):t("machine")}</th><th rowspan="2">${t("quantity")}</th>${window.PpicCalendar.headingGroups(cols,mode==="material"||el("period").value==="week").map(group=>`<th colspan="${group.span}">${esc(group.label)}</th>`).join("")}</tr><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${all.slice((page-1)*pageLimit(),page*pageLimit()).map(row=>`<tr><td><button type="button" data-proposal-group="${esc(row.key)}" aria-expanded="${opened.has(row.key)}">${opened.has(row.key)?"▾":"▸"} ${esc(row.label)}</button><small>Part Number: ${esc(row.item?.partNumber || [...new Set(row.sources.map(s=>s.partNumber).filter(Boolean))].join(", ") || "—")}</small><small>${esc(row.unit)}${mode==="material"?` · ${esc(row.sources[0]?.supplyCustomerCode||row.sources[0]?.materialSupplyType||"")}`:""}</small></td><td>${num(Object.values(row.days).reduce((a,b)=>a+b,0))}</td>${cols.map(c=>{const amount=c.days.reduce((sum,date)=>sum+(row.days[date]||0),0);return `<td>${amount?`<button type="button" data-proposal-review="${esc(row.key)}" data-proposal-column="${esc(c.key)}">${num(amount)}</button>`:"—"}</td>`;}).join("")}</tr>${opened.has(row.key)?`<tr><td colspan="${cols.length+2}"><details open><summary>${t("detail")} · ${t("sourcesCount",{count:row.sources.length})}</summary>${row.sources.map(source=>`<p>${esc(source.partCode||source.sourceNumber||row.item?.partCode)} · Part Number: ${esc(source.partNumber||row.item?.partNumber||"—")} · ${esc(source.processCode||source.customerCode||"")} · ${esc(String(source.materialRequiredDate||source.requiredDate||source.scheduleDate||source.fgRequiredDate||"").slice(0,10))} · ${num(source.netRequirement??source.qty??source.plannedProductionQty)} ${esc(source.uomCode||row.unit)}${source.lotPlanNumber?` · ${esc(source.lotPlanNumber)} · Shift ${esc(source.shift)}`:""}</p>`).join("")}</details></td></tr>`:""}`).join("")||`<tr><td colspan="${cols.length+2}">${t("empty")}</td></tr>`}</tbody></table>`;
  }
  function openCell(row,columnKey){
    const column=columns(filtered()).find(c=>c.key===columnKey);if(!row||!column)return;
    const sources=row.sources.filter(source=>column.days.includes(window.PpicCalendar.dateKey(source.materialRequiredDate||source.requiredDate||source.scheduleDate||source.fgRequiredDate)));
    const dialog=document.createElement("dialog");dialog.className="ppic-plan-review";dialog.setAttribute("data-quantity-formatted","true");
    const heads=mode==="material"?[t("required"),"FG / "+t("source"),t("gross"),t("stockAllocated"),t("timelySupply"),t("net"),t("orderDeadline")]:[t("date"),t("processPart"),"Shift",t("quantity"),t("lots")];
    const cells=sources.map(source=>mode==="material"?[window.PpicCalendar.dateKey(source.materialRequiredDate||source.requiredDate),[source.fgPartCode,source.sourceNumber].filter(Boolean).join(" · "),num(source.grossRequirement),num(source.onHandQty),num(source.firmSupplyQty),num(source.netRequirement),window.PpicCalendar.dateKey(source.orderDate)]:[window.PpicCalendar.dateKey(source.scheduleDate),[source.partCode,"Part Number: "+(source.partNumber||"—"),source.processCode].filter(Boolean).join(" / "),source.shift||"—",num(source.qty),source.lotPlanNumber||"—"]);
    const purchases=[...new Map(sources.flatMap(source=>source.plannedOrders||[]).map(order=>[order.orderNumber,order])).values()];
    dialog.innerHTML='<header><div><h2>'+esc(row.label)+'</h2><p>'+esc(column.label)+' · '+esc(row.unit)+' · '+esc(result.planningRevision)+'</p></div><button data-close>×</button></header><div class="ppr-body"><div class="ppr-scroll"><table data-enterprise-table="off"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+cells.map(c=>'<tr>'+c.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+ (purchases.length?'<h3>'+esc(t("procurement"))+'</h3>'+purchases.map(order=>'<p>'+esc(order.orderNumber)+' · '+num(order.qty)+' '+esc(order.uomCode)+' · '+esc(order.supplierCode||'—')+'</p>').join(''):'')+'</div><footer><button data-close>'+esc(t("close"))+'</button></footer>';
    dialog.addEventListener("click",event=>{if(event.target.closest("[data-close]"))dialog.close();});dialog.addEventListener("close",()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  async function load(){
    const id=++requestId;
    result=null;
    el("table").innerHTML=`<div class="ppic-calendar-empty">${esc(t("loading"))}</div>`;
    el("table").setAttribute("aria-busy", "true");
    el("status").textContent=t("loading");
    el("prev").disabled=true;
    el("next").disabled=true;
    const sourceIdentifier=`MONTH:${control.value}`;
    try {
      const token=localStorage.getItem("token")||sessionStorage.getItem("token")||"";
      const response=await fetch(`/modules/api/planning-ppic/mps/${encodeURIComponent(sourceIdentifier)}/integrated-preview`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:"{}"});
      const data=await response.json();
      if(!response.ok)throw Error(data.message||t("proposalFailed"));
      if(id!==requestId)return;
      result=data;render();
      window.dispatchEvent(new CustomEvent("ppic:proposal-ready",{detail:data}));
    } catch(error) {
      if(id===requestId){
        el("status").textContent=error.message;
        el("table").innerHTML=`<div class="ppic-calendar-empty">${esc(t("proposalFailed"))}</div>`;
      }
    } finally {
      if(id===requestId)el("table").setAttribute("aria-busy", "false");
    }
  }
  section.addEventListener("click",event=>{const toggle=event.target.closest("[data-proposal-group]");if(toggle){const key=toggle.dataset.proposalGroup;opened.has(key)?opened.delete(key):opened.add(key);render();}const review=event.target.closest("[data-proposal-review]");if(review&&result?.mpsNumber){const row=rows().find(row=>row.key===review.dataset.proposalReview);if(mode!=="fg"){openCell(row,review.dataset.proposalColumn);return;}window.PpicPlanReview?.open({mpsNumber:result.sourceIdentifier,item:row?.item||result.workbench.items[0],preview:result,onConfirmed:load});}});
  el("search").addEventListener("input",()=>{page=1;render();});el("period").addEventListener("change",render);el("refresh").addEventListener("click",load);el("prev").addEventListener("click",()=>{page--;render();});el("next").addEventListener("click",()=>{page++;render();});control.addEventListener("change",()=>{page=1;load();});
  el("export").addEventListener("click",()=>{const values=[[t("groups"),t("unit"),t("required"),t("quantity")],...filtered().flatMap(row=>Object.entries(row.days).map(([date,amount])=>[row.label,row.unit,date,amount]))],url=URL.createObjectURL(new Blob(["\ufeff",values.map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""').replace(/^[=+@-]/,"'$&")}"`).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`usulan-${mode}-${control.value}.csv`;link.click();URL.revokeObjectURL(url);});
  let refreshTimer;const refreshSoon=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(load,500);};window.addEventListener("focus",refreshSoon);window.addEventListener("ppic:demand-changed",refreshSoon);window.addEventListener("ui:languagechange",render);load();
})();
