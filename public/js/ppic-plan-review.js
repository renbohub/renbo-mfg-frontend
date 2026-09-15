(() => {
  "use strict";
  const esc = value => String(value ?? "—").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const t = key => window.PpicI18n.t(key);
  const qty = value => new Intl.NumberFormat(window.PpicI18n.locale(), { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat(window.PpicI18n.locale(), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
  const dialog = document.createElement("dialog");
  dialog.className = "ppic-plan-review";
  dialog.setAttribute("data-quantity-formatted", "true");
  dialog.setAttribute("aria-labelledby", "ppr-title");
  document.body.append(dialog);
  let context, result, busy = false, sequence = 0, operationId, safetyDays = 2, machineSelections = {}, before = null;
  const table = (columns, rows) => `<div class="ppr-scroll"><table data-enterprise-table="off"><thead><tr>${columns.map(column => `<th>${esc(column)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${columns.length}">${esc(t("empty"))}</td></tr>`}</tbody></table></div>`;
  const reasons = () => [...new Set([
    ...(result?.plans || []).map(plan => plan.recommendation?.error),
    ...(result?.exceptions || []).map(row => row.reason),
    ...(result?.workbench?.rccp?.exceptions || []).map(row => row.message),
    result?.workbench?.mps?.deliveryFeasibilityReason,
    result?.workbench?.deliveryGate?.reason,
    ...(result?.plans || []).flatMap(plan => (plan.recommendation?.blockers || []).map(row => row.message || row.reason || row.code)),
  ].filter(Boolean))];
  function deliverySummary(){return table([t("source"),t("deliveryDate"),t("fgReadyBy"),t("estimatedReady"),t("spareCalendar")],(context.item.phases||[]).map(phase=>{
    const slots=result.allocations.filter(row=>row.fgPartCode===context.item.partCode && String(row.customerTargetDate||"").slice(0,10)===String(phase.targetDeliveryDate||"").slice(0,10));
    const finish=slots.length?new Date(Math.max(...slots.map(row=>new Date(row.plannedFinishAt).getTime()))):null;
    const spare=finish&&phase.fgRequiredDate?Math.floor((new Date(String(phase.fgRequiredDate).slice(0,10)+"T00:00:00Z")-new Date(finish.toISOString().slice(0,10)+"T00:00:00Z"))/86400000):null;
    return '<tr><td>'+esc(phase.sourceNumber)+'</td><td>'+date(phase.targetDeliveryDate)+'</td><td>'+date(phase.fgRequiredDate)+'</td><td>'+date(finish)+'</td><td>'+(spare==null?'—':qty(spare))+'</td></tr>';
  }))+'<small>'+esc(t("spareHelp"))+'</small>';}
  function materialComparison(){
    function summarize(value){const rows=new Map();for(const material of value.materials){const key=JSON.stringify([material.partCode,material.uomCode,material.materialSupplyType,material.supplyCustomerCode]);if(!rows.has(key))rows.set(key,{label:material.partCode+' / '+material.uomCode+' / '+(material.supplyCustomerCode||material.materialSupplyType||''),dates:new Set(),net:0});const row=rows.get(key);row.dates.add(String(material.materialRequiredDate||material.requiredDate).slice(0,10));row.net+=Number(material.netRequirement||0);}return rows;}
    const prior=summarize(before),next=summarize(result),keys=[...new Set([...prior.keys(),...next.keys()])];
    const value=row=>row?[...row.dates].sort().map(date).join(', ')+' · '+qty(row.net):'—';
    return table([t('materialImpact'),t('before'),t('after')],keys.filter(key=>value(prior.get(key))!==value(next.get(key))).map(key=>'<tr><td>'+esc((next.get(key)||prior.get(key)).label)+'</td><td>'+esc(value(prior.get(key)))+'</td><td>'+esc(value(next.get(key)))+'</td></tr>'));
  }
  function render(message = "") {
    const m = context?.item?.metrics || {};
    const blockers = reasons();
    const status = (result?.materialTimingStatus === "UNRESOLVED" || result?.plans?.some(plan => plan.recommendation?.error || !plan.recommendation?.ready)) ? "unknown" : result?.plans?.some(plan => plan.recommendation?.phaseResults?.some(row => row.status === "LATE")) ? "late" : result?.workbench?.deliveryGate?.feasibilityStatus === "AT_RISK" ? "risk" : "onTime";
    const canConfirm = result && !busy && result.materialTimingStatus === "CONSISTENT" && result.plans.length > 0 && result.plans.every(plan => plan.recommendation?.ready || plan.preservedExecution)
      && result.workbench?.rccp?.approvalAllowed && result.workbench?.deliveryGate?.officialGateStatus !== "BLOCKED";
    dialog.innerHTML = `<header><div><small>${esc(result ? `${result.mpsNumber} · ${t("preview")}` : t("preview"))}</small><h2 id="ppr-title">${esc(t("review"))}</h2><p>${esc(context?.item?.partCode)} · ${esc(context?.item?.partName || "")}</p></div><button type="button" data-ppr-close aria-label="${esc(t("close"))}">×</button></header>
      <div class="ppr-body" aria-busy="${busy}"><p>${esc(t("scope"))}</p><div class="ppr-summary">${[["demand", m.grossDemandQty], ["stock", (context?.item?.phases || []).reduce((sum, phase) => sum + Number(phase.stockUsedQty || 0), 0)], ["production", m.plannedProductionQty]].map(([key, value]) => `<article><span>${esc(t(key))}</span><b>${qty(value)} ${esc(context?.item?.uomCode || "")}</b></article>`).join("")}</div>
      <div class="ppr-tools"><label>${esc(t("safety"))}<input data-ppr-safety type="number" min="0" max="30" step="1" value="${safetyDays}" ${busy ? "disabled" : ""}></label><button type="button" data-ppr-simulate ${busy ? "disabled" : ""}>${esc(t("simulate"))}</button></div><small>${esc(t("safetyHelp"))}</small>
      <p role="status">${esc(message || (busy ? t("loading") : ""))}</p>
      ${result ? `<section class="ppr-reasons"><h3>${esc(t("reasons"))}</h3><strong>${esc(t(status))}</strong>${blockers.map(reason => `<p>${esc(reason)}</p>`).join("")}</section>
      <details open><summary>${esc(t("delivery"))}</summary>${deliverySummary()}</details>
      <details><summary>${esc(t("capacity"))}</summary>${table([t("machine"),t("period"),t("requiredHours"),t("availableHours"),"%"],(context.item.capacity?.evidence||[]).map(row=>`<tr><td>${esc(row.workCenter)}</td><td>${date(row.bucketStart)}–${date(row.bucketEnd)}</td><td>${qty(row.requiredHours)}</td><td>${qty(row.availableHours)}</td><td>${qty(row.availableHours>0?row.requiredHours/row.availableHours*100:0)}</td></tr>`))}</details>
      <details open><summary>${esc(t("process"))} · ${esc(t("machine"))}</summary>${table(["Part / "+t("process"),"Part Number",t("machine"),"Cycle time / Setup",t("reasons")],(result.processes||[]).map(row=>'<tr><td>'+esc(row.partCode)+' / '+esc(row.processCode)+'</td><td>'+esc(row.partNumber||'—')+'</td><td>'+(row.routingMode==='VENDOR'?esc(row.vendorCode || row.vendorName || row.vendorId):'<select data-ppr-machine="'+esc(row.id)+'" data-searchable-disabled '+(busy?'disabled':'')+'><option value="">'+esc(t('defaultMachine'))+'</option>'+row.machineOptions.map(option=>'<option value="'+esc(option.machineId)+'" '+(machineSelections[row.id]===option.machineId?'selected':'')+'>'+esc(option.machineCode)+'</option>').join('')+'</select>')+'</td><td>'+row.machineOptions.map(option=>esc(option.machineCode)+': '+qty(option.cycleTimeSeconds)+' s / '+qty(option.setupMinutes)+' min').join('<br>')+'</td><td>'+row.errors.map(esc).join('<br>')+'</td></tr>'))}</details>
      ${before ? '<details><summary>'+esc(t('comparison'))+'</summary>'+table([t('summary'),t('before'),t('after')],[['slots',before.allocations.length,result.allocations.length],['lots',before.lots.length,result.lots.length]].map(([key,a,b])=>'<tr><td>'+esc(t(key))+'</td><td>'+qty(a)+'</td><td>'+qty(b)+'</td></tr>'))+materialComparison()+'<p>'+esc(t('comparisonHint'))+'</p></details>' : ''}
      <details open><summary>${esc(t("process"))} · ${esc(t("lots"))}</summary>${table([t("date"), t("machine"), "Shift", "Part / " + t("process"), "Part Number", t("quantity"), t("lots")], result.allocations.map(row => `<tr><td>${date(row.scheduleDate)}<small>${esc(row.plannedStartTime)}–${esc(row.plannedEndTime)}</small></td><td>${esc(row.machineCode || row.vendorCode || row.vendorId)}</td><td>${esc(row.shift)}</td><td>${esc(row.partCode)} / ${esc(row.processCode)}</td><td>${esc(row.partNumber || '—')}</td><td>${qty(row.qty)} ${esc(row.uomCode)}</td><td>${result.lots.filter(lot => lot.allocations.some(a => a.allocationId === row.allocationId)).map(lot => esc(lot.lotPlanNumber)).join("<br>") || "—"}</td></tr>`))}${!result.allocations.length ? `<p>${esc(t("noSlots"))}</p>` : ""}</details>
      <details open><summary>${esc(t("material"))}</summary>${table(["Part", "Part Number", t("required"), t("gross"), t("net"), t("allocations")], result.materials.map(row => `<tr><td>${esc(row.partCode)}</td><td>${esc(row.partNumber || '—')}</td><td>${date(row.materialRequiredDate || row.requiredDate)}</td><td>${qty(row.grossRequirement)} ${esc(row.uomCode)}</td><td>${qty(row.netRequirement)} ${esc(row.uomCode)}</td><td>${esc(row.supplyCustomerCode || (row.materialSupplyType === "SUPPLIER_PURCHASE" ? t("supplierPurchase") : row.materialSupplyType) || "")}</td></tr>`))}</details>` : ""}</div>
      <footer><button type="button" data-ppr-close>${esc(t("cancel"))}</button><button class="ppr-confirm" type="button" data-ppr-confirm ${canConfirm ? "" : "disabled"}>${esc(t("confirm"))}</button></footer>`;
  }
  async function request(action, body) {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const response = await fetch(`/modules/api/planning-ppic/mps/${encodeURIComponent(context.mpsNumber)}/${action}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok || payload.approvalRequired || payload.approvalPending || response.status === 202) throw new Error(payload.message || `HTTP ${response.status}`);
    return payload;
  }
  async function simulate() {
    const current = ++sequence;
    busy = true; if(result)before = result; result = null; render();
    try { const next = await request("integrated-preview", { safetyDays, machineSelections }); if (current !== sequence) return; result = next; context.item = next.workbench.items.find(item => item.partCode === context.item?.partCode) || context.item; operationId = crypto.randomUUID(); }
    catch (error) { if (current === sequence) { busy = false; render(error.message); return; } }
    if (current === sequence) { busy = false; render(); }
  }
  dialog.addEventListener("click", async event => {
    if (event.target.closest("[data-ppr-close]")) { if (busy && result) return; sequence++; dialog.close(); return; }
    if (event.target.closest("[data-ppr-simulate]") && !busy) { safetyDays = Number(dialog.querySelector("[data-ppr-safety]").value); await simulate(); }
    if (event.target.closest("[data-ppr-confirm]") && result && !busy) {
      busy = true; render(t("saving"));
      try { const saved = await request("confirm-plan", { safetyDays, machineSelections, expectedFingerprint: result.fingerprint, operationId }); busy = false; result = null; render(t("saved")); window.PpicWorkflow?.refresh(saved.month); await context.onConfirmed?.(); }
      catch (error) { busy = false; render(error.message); }
    }
  });
  dialog.addEventListener("change", event => { if(event.target.matches("[data-ppr-machine]")){const id=event.target.dataset.pprMachine;if(event.target.value)machineSelections[id]=event.target.value;else delete machineSelections[id];simulate();return;} if (event.target.matches("[data-ppr-safety]")) { safetyDays = Number(event.target.value); result = null; render(); } });
  dialog.addEventListener("cancel", event => { if (busy && result) event.preventDefault(); else sequence++; });
  window.addEventListener("ui:languagechange", () => { if (dialog.open) render(); });
  window.PpicPlanReview = { open(value) { context = value; before=null; machineSelections={...(value.preview?.options?.machineSelections||{})}; safetyDays = value.preview?.options?.safetyDays ?? 2; result = value.preview || null; operationId = crypto.randomUUID(); busy = false; render(); dialog.showModal(); if (!result) simulate(); } };
})();
