(function () {
  "use strict";
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const num = (value) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const date = (value) => value ? String(value).slice(0, 10) : "-";
  const dateTime = (value) => {
    if (!value) return "-";
    const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(parsed);
  };
  const currentAnchor = () => { const now = new Date(); if (now.getDate() < 20) now.setMonth(now.getMonth() - 1); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };
  const mpsWindowLabel = (anchor) => { const [year, month] = String(anchor || currentAnchor()).split("-").map(Number), end = new Date(year, month + 1, 1); return `${anchor || currentAnchor()} → ${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`; };
  let rows = [];
  let selected = null;
  let lastImpact = null;
  let currentRecovery = null;
  let currentFeasibility = null;
  let previewSupplierSelections = {};
  let previewVendorProcessAdjustments = [];
  let mpsSelectedRowIds = new Set();
  let mpsSelectorBusy = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Permintaan gagal (${response.status})`);
    return payload;
  }
  function alert(message, kind = "danger") { const box = $("ppic-alert"); box.textContent = message; box.className = `alert alert-${kind} mx-4 mt-3`; }
  function badge(value) { const code = String(value || "-").toLowerCase().replace(/[^a-z0-9]+/g, "-"); return `<span class="demand-badge ${code}">${esc(value || "-")}</span>`; }
  function friendlyStatus(value) { return ({ NOT_SIMULATED: "Belum dihitung", MASTER_DATA_INCOMPLETE: "Master data belum lengkap", NOT_FEASIBLE: "Tidak tercapai", AT_RISK: "Berisiko", FEASIBLE: "Dapat dicapai", RISK_WAIVER: "Asumsi risiko", CAPACITY_NOT_SIMULATED: "Capacity belum disimulasikan", SUPPLIER_LEAD_TIME: "Lead time supplier", MATERIAL_SHORTAGE: "Material kurang", CAPACITY: "Capacity produksi" })[value] || value || "-"; }
  function statusBadge(value) { return badge(friendlyStatus(value)); }
  function capacityState(value) { const state = { ENOUGH: ["Cukup", "enough"], TIGHT: ["Kritis", "tight"], NOT_ENOUGH: ["Tidak cukup", "not-enough"], NO_DEMAND: ["Bulan pembanding", "no-demand"] }[value] || ["Belum tersedia", "unavailable"]; return { label: state[0], css: state[1] }; }
  function hours(minutes) { return `${num(Number(minutes || 0) / 60)} jam`; }
  function draftSoSummary(row) {
    const drafts = row?.draftSalesOrders || [];
    if (!drafts.length) return "";
    return `<div class="draft-so-list">${drafts.map((item) => `<a href="/modules/sales/sales-orders/${encodeURIComponent(item.sourceNumber)}" title="Buka dan konfirmasi Sales Order"><b>${esc(item.sourceNumber)}</b><span>${date(item.targetDate)} &middot; ${num(item.qty)}</span><em>Draft - belum konsumsi Forecast</em></a>`).join("")}</div>`;
  }
  function finishSplits(row) {
    const configured = Array.isArray(row?.fgFinishSplits) ? row.fgFinishSplits : [];
    const splits = configured.map((split, index) => ({ phaseNumber: Number(split.phaseNumber || index + 1), targetFinishDate: date(split.targetFinishDate || split.fgRequiredDate), qty: Number(split.qty || 0) })).filter((split) => split.targetFinishDate !== "-" && split.qty > 0);
    return splits.length ? splits : [{ phaseNumber: 1, targetFinishDate: date(row?.fgRequiredDate || row?.targetDate), qty: Number(row?.demandQty || 0) }];
  }
  function finishSummary(row) { return `<div class="fg-finish-summary">${finishSplits(row).map((split) => `<span><b>${date(split.targetFinishDate)}</b><small>Split ${split.phaseNumber} · ${num(split.qty)}</small></span>`).join("")}</div>`; }
  function finishSplitEditorRow(split, index) { return `<div class="fg-finish-split-row" data-fg-split><span class="fg-finish-split-label">Split ${index + 1}</span><label>Tanggal finish<input class="review-fg-split-date" type="date" value="${date(split.targetFinishDate) === "-" ? "" : date(split.targetFinishDate)}"></label><label>Qty<input class="review-fg-split-qty" type="number" min="0.01" step=".01" value="${Number(split.qty || 0)}"></label><button type="button" data-remove-fg-split aria-label="Hapus split">×</button></div>`; }
  function refreshFinishSplitEditor() {
    const splitRows = [...document.querySelectorAll("[data-fg-split]")];
    splitRows.forEach((row, index) => { const label = row.querySelector(".fg-finish-split-label"); if (label) label.textContent = `Split ${index + 1}`; const remove = row.querySelector("[data-remove-fg-split]"); if (remove) remove.disabled = splitRows.length === 1; });
    const total = splitRows.reduce((sum, row) => sum + Number(row.querySelector(".review-fg-split-qty")?.value || 0), 0);
    const target = Number(selected?.demandQty || 0); const output = $("review-fg-split-total");
    if (output) { output.textContent = `${num(total)} / ${num(target)}`; output.classList.toggle("is-mismatch", Math.abs(total - target) > 0.005); }
  }
  function renderCapacity(items = []) {
    const root = $("demand-capacity-months"); if (!root) return;
    if (!items.length) { root.innerHTML = `<div class="demand-capacity-empty">Belum ada Forecast delivery target untuk membentuk horizon capacity.</div>`; return; }
    root.innerHTML = items.map((item) => { const state = capacityState(item.status); return `<article class="demand-capacity-month ${state.css}">
      <header><div><small>${date(`${item.month}-01`)}</small><strong>${state.label}</strong></div><b>${num(item.utilizationPercent)}%</b></header>
      <div class="demand-capacity-meter"><i style="width:${Math.min(Math.max(Number(item.utilizationPercent || 0), 0), 100)}%"></i></div>
      <dl><div><dt>Forecast</dt><dd>${num(item.forecastQty)}</dd></div><div><dt>Actual SO</dt><dd>${num(item.actualSalesOrderQty)}</dd></div><div><dt>Effective</dt><dd>${num(item.effectiveDemandQty)}</dd></div><div><dt>Sisa capacity</dt><dd>${hours(item.remainingMinutes)}</dd></div></dl>
      <footer>${num(item.deliveryPhaseCount)} phase · ${num(item.activeMachineCount)} mesin · ${num(item.overloadedCells)} overload</footer>
    </article>`; }).join("");
  }

  function render(payload) {
    rows = payload.items || [];
    $("demand-anchor").textContent = "Pilih saat run";
    $("demand-anchor-input").value = payload.planningAnchorMonth || currentAnchor();
    $("demand-outstanding").textContent = num(payload.summary?.outstandingQty);
    $("demand-line-count").textContent = `${num(payload.total)} delivery phases${Number(payload.summary?.draftSalesOrderCount || 0) ? ` · ${num(payload.summary.draftSalesOrderCount)} Draft SO menunggu confirm` : ""}`;
    $("demand-risk").textContent = `${num(payload.summary?.critical)} / ${num(payload.summary?.atRisk)}`;
    $("demand-unreviewed").textContent = num(payload.summary?.unreviewed);
    renderCapacity(payload.capacityMonths || []);
    $("ppic-head").innerHTML = `<tr><th>Sumber Demand</th><th>Customer / Part</th><th>Target Delivery</th><th>Komposisi Demand</th><th>Prioritas</th><th>Target Finish FG</th><th>Risiko Delivery</th><th>Constraint</th><th>Buffer / Status</th><th>Action</th></tr>`;
    renderRows(rows);
    $("ppic-footer").textContent = `${num(payload.total)} delivery target phase · exact customer due date tetap dipertahankan`;
    const flow = $("planning-flowbar");
    flow?.querySelector('[data-flow-step="demand"]')?.classList.add("active");
  }
  function legacyRenderRows(items) {
    const body = $("ppic-rows");
    if (!items.length) { body.innerHTML = `<tr><td colspan="16" class="text-center py-5 text-muted">Tidak ada Forecast delivery phase pada rolling horizon ini.</td></tr>`; return; }
    body.innerHTML = items.map((row) => `<tr>
      <td data-label="Forecast Target"><b>${esc(row.demandType === "UNPLANNED_SO" ? "Belum ada Forecast" : row.sourceNumber)}</b><small>${row.demandType === "UNPLANNED_SO" ? badge("UNPLANNED_SO") : `Forecast phase ${esc(row.phaseNumber)}`}</small></td>
      <td data-label="Customer / Part"><b>${esc(row.customerCode || "-")}</b><small>${esc(row.partCode)}</small></td>
      <td data-label="Forecast / Effective Delivery"><b>${date(row.effectiveTargetDate || row.targetDate || row.targetDeliveryDate)}</b><small>Forecast ${date(row.forecastTargetDate || row.targetDate || row.targetDeliveryDate)}${Number(row.pullForwardDays||0)>0?` · <strong>maju ${num(row.pullForwardDays)} hari</strong>`:""}</small></td>
      <td data-label="Forecast" class="ppic-number"><b>${num(row.forecastQty)}</b><small>${esc(row.planningPolicy || "MTS")}</small></td>
      <td data-label="Actual SO" class="ppic-number"><b>${num(row.actualSalesOrderQty)}</b><small title="${esc((row.actualSalesOrders || []).map((item) => `${item.sourceNumber} ${date(item.targetDate)}: ${num(item.qty)}`).join(" | "))}">${num((row.actualSalesOrders || []).length)} SO target · delivered ${num(row.actualSalesOrderDeliveredQty)}</small></td>
      <td data-label="Effective / Outstanding" class="ppic-number"><b>${num(row.demandQty)}</b><small>Outstanding ${num(row.outstandingQty)}</small></td>
      <td data-label="System Priority"><b>${num(row.systemPriorityScore)}</b><button class="demand-score-info" title="Lihat faktor score" data-score="${esc(row.id)}">?</button></td>
      <td data-label="Manual">${Number(row.manualPriorityAdjustment || 0) > 0 ? "+" : ""}${num(row.manualPriorityAdjustment)}</td>
      <td data-label="Final">${badge(row.priorityClass)} <b>${num(row.finalPriorityScore)}</b></td>
      <td data-label="Target Finish FG">${finishSummary(row)}</td><td data-label="Feasibility">${badge(row.feasibilityStatus)}</td>
      <td data-label="Earliest Feasible">${date(row.earliestFeasibleDeliveryDate)}</td><td data-label="Constraint"><span class="demand-constraint">${esc(row.criticalConstraint || "-")}</span></td>
      <td data-label="Buffer">${num(row.bufferPercent)}%<small>${num(row.bufferQty)} · ${row.bufferSource === "PART_MASTER" ? "Master" : "Override PPIC"}</small></td><td data-label="Status">${badge(row.planningStatus)}${row.dueDateRecoveryStatus?`<small>Recovery R${num(row.dueDateRecoveryRevision)} · ${esc(row.dueDateRecoveryStatus)}</small>`:""}${row.displacementProposalStatus?`<small>Displacement ${esc(row.displacementProposalStatus)}</small>`:""}</td>
      <td data-label="Action"><div class="demand-actions"><button data-review="${esc(row.id)}">Review</button><button data-recovery="${esc(row.id)}" class="recovery-action">Capai due date</button><button data-simulate="${esc(row.id)}">Impact</button>${row.displacementProposalStatus==='PENDING_APPROVAL'?`<button data-approve-proposal="${esc(row.displacementProposalId)}">Approve impact</button>`:""}</div></td>
    </tr>`).join("");
  }
  function renderRows(items) {
    const body = $("ppic-rows");
    if (!items.length) { body.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted">Tidak ada Forecast delivery phase pada rolling horizon ini.</td></tr>`; return; }
    body.innerHTML = items.map((row) => `<tr>
      <td data-label="Sumber Demand">${row.demandType === "UNPLANNED_SO" ? `<b>Belum ada Forecast</b><small>${badge("SO tanpa Forecast")}</small>` : `<a class="demand-source-link" href="/modules/sales/forecasts/${encodeURIComponent(row.sourceNumber)}"><b>${esc(row.sourceNumber)}</b></a><small>Forecast phase ${esc(row.phaseNumber)}</small>`}</td>
      <td data-label="Customer / Part"><b>${esc(row.customerCode || "-")}</b><small>${esc(row.partCode)}</small></td>
      <td data-label="Target Delivery"><b>${date(row.effectiveTargetDate || row.targetDate || row.targetDeliveryDate)}</b><small>Forecast awal ${date(row.forecastTargetDate || row.targetDate || row.targetDeliveryDate)}${Number(row.pullForwardDays || 0) > 0 ? ` &middot; <strong>maju ${num(row.pullForwardDays)} hari</strong>` : ""}</small></td>
      <td data-label="Komposisi Demand"><div class="demand-composition"><span><small>Forecast</small><b>${num(row.forecastQty)}</b></span><span><small>Actual SO</small><b>${num(row.actualSalesOrderQty)}</b></span><span class="provisional"><small>Draft SO</small><b>${num(row.draftSalesOrderQty)}</b></span><span><small>Effective</small><b>${num(row.demandQty)}</b></span><span><small>Outstanding</small><b>${num(row.outstandingQty)}</b></span></div><small title="${esc((row.actualSalesOrders || []).map((item) => `${item.sourceNumber} ${date(item.targetDate)}: ${num(item.qty)}`).join(" | "))}">${num((row.actualSalesOrders || []).length)} SO confirmed &middot; ${esc(row.planningPolicy || "MTS")}</small>${draftSoSummary(row)}</td>
      <td data-label="Prioritas"><div class="demand-priority-compact">${badge(row.priorityClass)}<b>${num(row.finalPriorityScore)}</b><button class="demand-score-info" title="Lihat faktor score" data-score="${esc(row.id)}">?</button></div><small>System ${num(row.systemPriorityScore)} &middot; Manual ${Number(row.manualPriorityAdjustment || 0) > 0 ? "+" : ""}${num(row.manualPriorityAdjustment)}</small></td>
      <td data-label="Target Finish FG">${finishSummary(row)}</td>
      <td data-label="Risiko Delivery"><div class="demand-risk-state">${statusBadge(row.feasibilityStatus)}${row.requiresRiskApproval ? `<span class="risk-waiver-flag" title="Ada asumsi lead time yang dikecualikan">! Approval risiko</span>` : ""}</div><small>Earliest ${date(row.earliestFeasibleDeliveryDate)}</small></td>
      <td data-label="Constraint"><span class="demand-constraint">${esc(friendlyStatus(row.criticalConstraint))}</span></td>
      <td data-label="Buffer / Status"><b>${num(row.bufferPercent)}%</b><small>${num(row.bufferQty)} &middot; ${row.bufferSource === "PART_MASTER" ? "Master" : "Override PPIC"}</small>${badge(row.planningStatus)}${row.dueDateRecoveryStatus ? `<small>Recovery R${num(row.dueDateRecoveryRevision)} &middot; ${esc(row.dueDateRecoveryStatus)}</small>` : ""}</td>
      <td data-label="Action"><div class="demand-actions"><button data-review="${esc(row.id)}">Review</button><button data-recovery="${esc(row.id)}" class="recovery-action">Capai due date</button><button data-simulate="${esc(row.id)}">Impact</button>${row.displacementProposalStatus === "PENDING_APPROVAL" ? `<button data-approve-proposal="${esc(row.displacementProposalId)}">Approve impact</button>` : ""}</div></td>
    </tr>`).join("");
  }

  async function load() {
    if ($("ppic-primary")) $("ppic-primary").disabled = true;
    try {
      const params = new URLSearchParams();
      const priority = $("demand-priority")?.value; const feasibility = $("demand-feasibility")?.value;
      if (priority) params.set("priorityClass", priority); if (feasibility) params.set("feasibilityStatus", feasibility);
      params.set("planningAnchorMonth", $("demand-anchor-input")?.value || currentAnchor());
      render(await api(`/modules/api/planning-ppic/demand-planning?${params}`));
      if ($("ppic-primary")) $("ppic-primary").disabled = false;
    } catch (error) { alert(error.message); }
  }
  function riskControlsFromForm() {
    return {
      productionProcess: true,
      supplierLeadTime: Boolean($("risk-supplier-lead-time")?.checked),
      receivingQc: Boolean($("risk-receiving-qc")?.checked),
      safety: Boolean($("risk-safety-lead-time")?.checked),
    };
  }
  function updateRiskSwitches() {
    const states = [
      ["risk-supplier-lead-time", "risk-state-supplier"],
      ["risk-receiving-qc", "risk-state-qc"],
      ["risk-safety-lead-time", "risk-state-safety"],
    ];
    states.forEach(([inputId, stateId]) => {
      const input = $(inputId); const state = $(stateId); if (!input || !state) return;
      state.textContent = input.checked ? "Dipakai" : "Dilepas";
      state.classList.toggle("is-waived", !input.checked);
    });
  }
  function supplierSelectionsFromForm() {
    const selections = { ...previewSupplierSelections };
    document.querySelectorAll("[data-supplier-part]").forEach((select) => {
      if (select.value) selections[select.dataset.supplierPart] = select.value;
      else delete selections[select.dataset.supplierPart];
    });
    return selections;
  }
  function renderSupplierAlternatives(payload = {}) {
    const root = $("risk-supplier-options"); if (!root) return;
    const alternatives = payload.constraintDetails?.supplierAlternatives || [];
    previewSupplierSelections = { ...(payload.constraintDetails?.supplierSelections || previewSupplierSelections) };
    if (!alternatives.length) { root.innerHTML = `<div class="risk-empty">Tidak ada material purchase atau alternatif supplier aktif.</div>`; return; }
    root.innerHTML = alternatives.map((row) => {
      const options = row.options || [];
      const selectedValue = previewSupplierSelections[row.partCode] || (payload.constraintDetails?.supplierStrategy === "FASTEST" ? "FASTEST" : row.selectedSupplierItemId || "");
      return `<label class="supplier-choice"><span><b>${esc(row.partCode)}</b><small>${esc(row.partName || "Material purchase")}</small></span><select data-supplier-part="${esc(row.partCode)}"><option value="FASTEST" ${selectedValue === "FASTEST" ? "selected" : ""}>Otomatis supplier tercepat</option>${options.map((item) => `<option value="${esc(item.supplierItemId)}" ${selectedValue === item.supplierItemId ? "selected" : ""}>${esc(item.supplierName || item.supplierCode || "Supplier")} - ${num(item.leadTimeDays)} hari${item.isPreferred ? " (preferred)" : ""}</option>`).join("")}</select><small>Dipakai: ${esc(row.selectedSupplierName || row.selectedSupplierCode || "belum tersedia")} &middot; ${esc(row.selectionSource || "-")}</small></label>`;
    }).join("");
  }
  function vendorProcessAdjustmentsFromForm() {
    const rows = [...document.querySelectorAll("[data-vendor-process-key]")];
    if (!rows.length) return [...previewVendorProcessAdjustments];
    return rows.map((row) => {
      const masterDurationHours = Number(row.dataset.masterHours || 0);
      const adjustedDurationHours = Number(row.querySelector("[data-vendor-duration]")?.value || 0);
      const reason = row.querySelector("[data-vendor-reason]")?.value.trim() || "";
      return { key: row.dataset.vendorProcessKey, masterDurationHours, adjustedDurationHours, reason };
    }).filter((row) => Math.abs(row.adjustedDurationHours - row.masterDurationHours) > 0.000001);
  }
  function validateVendorProcessAdjustments() {
    for (const row of document.querySelectorAll("[data-vendor-process-key]")) {
      const master = Number(row.dataset.masterHours || 0);
      const duration = Number(row.querySelector("[data-vendor-duration]")?.value || 0);
      const reason = row.querySelector("[data-vendor-reason]")?.value.trim() || "";
      if (duration < 0.25) return "Durasi vendor minimal 0,25 jam; vendor process tidak dapat dihapus dari routing.";
      if (Math.abs(duration - master) > 0.000001 && reason.length < 5) return "Alasan adjustment vendor wajib diisi minimal 5 karakter.";
    }
    return null;
  }
  function renderVendorProcesses(payload = {}) {
    const root = $("vendor-process-adjustments"); if (!root) return;
    const processes = payload.constraintDetails?.vendorProcesses || [];
    previewVendorProcessAdjustments = [...(payload.constraintDetails?.vendorProcessAdjustments || previewVendorProcessAdjustments)];
    if (!processes.length) { root.innerHTML = `<div class="risk-empty">Routing demand ini tidak memiliki vendor process.</div>`; return; }
    root.innerHTML = processes.map((process) => `<article class="vendor-adjustment-row ${process.adjustmentApplied ? "is-adjusted" : ""}" data-vendor-process-key="${esc(process.key)}" data-master-hours="${Number(process.masterDurationHours || 0)}"><div class="vendor-adjustment-identity"><small>${esc(process.detailCode || "Route")} &middot; Sequence ${num(process.sequence)}</small><b>${esc(process.processCode || process.processName || "Vendor process")}</b><span>${esc(process.vendorName || process.vendorCode || "Vendor belum dipilih")}</span></div><div class="vendor-duration-master"><small>Durasi master</small><b>${num(process.masterDurationHours)} jam</b></div><label>Durasi planning (jam)<input type="number" min="0.25" step="0.25" value="${Number(process.adjustedDurationHours || process.masterDurationHours || 0)}" data-vendor-duration></label><label>Alasan adjustment<input type="text" value="${esc(process.reason || "")}" placeholder="Wajib jika berbeda dari master" data-vendor-reason></label></article>`).join("");
  }
  function renderRiskPreview(payload = {}) {
    currentFeasibility = payload;
    const productionBasis = document.querySelector(".risk-toggle-grid .is-required small");
    if (productionBasis) productionBasis.textContent = `Dihitung per jam dari routing, cycle time, dan ${num(payload.capacityAssumption?.shiftsPerDay || 1)} shift`;
    const root = $("risk-preview-result"); if (!root) return;
    const waived = payload.waivedRisks || [];
    const calculation = payload.constraintDetails?.earliestFgCalculation || {};
    root.innerHTML = `<div><small>FG paling awal</small><b>${dateTime(payload.earliestFeasibleFgDate)}</b></div><div><small>Durasi produksi</small><b>${num(payload.exactProductionLeadTimeHours ?? calculation.exactProductionLeadTimeHours)} jam</b></div><div><small>Jam capacity / hari</small><b>${num(calculation.productionHoursPerDay)} jam</b></div><div><small>Delivery paling awal</small><b>${dateTime(payload.earliestFeasibleDeliveryDate)}</b></div><div><small>Hasil</small>${statusBadge(payload.status)}</div><div><small>Constraint</small><b>${esc(friendlyStatus(payload.criticalConstraint))}</b></div>${waived.length ? `<p><strong>Perlu approval risiko:</strong> ${esc(waived.map((row) => row.label).join(", "))}. Preview memakai asumsi Review ini; nilai master dan risiko operasional tetap dipertahankan untuk audit.</p>` : ""}`;
    renderSupplierAlternatives(payload);
    renderVendorProcesses(payload);
  }
  async function loadRiskPreview(row = selected) {
    if (!row) return;
    const vendorValidation = validateVendorProcessAdjustments();
    if (vendorValidation) return alert(vendorValidation, "warning");
    const button = $("recalculate-feasibility"); if (button) { button.disabled = true; button.textContent = "Menghitung..."; }
    const preview = $("risk-preview-result"); if (preview) preview.innerHTML = `<span class="demand-loading-inline">Menghitung ulang lead time dan earliest FG...</span>`;
    try {
      const payload = await api("/modules/api/planning-ppic/demand-planning/feasibility", { method: "POST", body: JSON.stringify({ deliveryTargetId: row.id, leadTimeControls: riskControlsFromForm(), supplierStrategy: $("risk-supplier-strategy")?.value || "PREFERRED", supplierSelections: supplierSelectionsFromForm(), vendorProcessAdjustments: vendorProcessAdjustmentsFromForm() }) });
      renderRiskPreview(payload);
    } catch (error) { if (preview) preview.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`; }
    finally { if (button) { button.disabled = false; button.textContent = "Hitung ulang preview"; } }
  }
  function openDrawer(row, mode = "review") {
    selected = row; const drawer = $("demand-drawer"); drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    $("demand-drawer-title").textContent = mode === "impact" ? "Simulation impact" : mode === "score" ? "Explainable priority score" : mode === "recovery" ? "Due Date Recovery Plan" : `Review ${row.sourceNumber}`;
    $("demand-drawer-meta").textContent = `${row.customerCode || "-"} · ${row.partCode} · effective delivery ${date(row.effectiveTargetDate || row.targetDate || row.targetDeliveryDate)}`;
    if (mode === "impact") return simulate(row);
    if (mode === "recovery") return loadRecoveryPlan(row);
    if (mode === "score") {
      const labels = { overdue: "Overdue", dueHorizon: "Remaining days", firmness: "SO / Forecast firmness", customerPriority: "Customer priority", urgent: "Urgent / expedite", deliveryRisk: "Delivery risk", materialRisk: "Material risk", capacityRisk: "Capacity risk" };
      const factors = row.priorityScoreBreakdown || {};
      $("demand-drawer-body").innerHTML = `<div class="demand-score-total"><div><span>System score</span><b>${num(row.systemPriorityScore)}</b></div><div><span>Manual adjustment</span><b>${Number(row.manualPriorityAdjustment || 0) > 0 ? "+" : ""}${num(row.manualPriorityAdjustment)}</b></div><div><span>Final priority</span><b>${esc(row.priorityClass)} · ${num(row.finalPriorityScore)}</b></div></div><div class="demand-score-factors">${Object.entries(labels).map(([key,label]) => `<article><span>${esc(label)}</span><b>+${num(factors[key])}</b><div><i style="width:${Math.min(Number(factors[key] || 0) / 35 * 100, 100)}%"></i></div></article>`).join("")}</div><p class="demand-simulation-note">Score adalah rekomendasi explainable. Adjustment manual tidak mengubah faktor sistem dan wajib memiliki alasan.</p>`;
      return;
    }
    const configuredSplits = finishSplits(row);
    const savedOptions = row.feasibilityOptions || {};
    const controls = { productionProcess: true, supplierLeadTime: true, receivingQc: true, safety: true, ...(savedOptions.leadTimeControls || {}) };
    previewSupplierSelections = { ...(savedOptions.supplierSelections || {}) };
    previewVendorProcessAdjustments = [...(savedOptions.vendorProcessAdjustments || [])];
    currentFeasibility = null;
    $("demand-drawer-body").innerHTML = `<div class="demand-review-grid">
      <section class="risk-assumption-card span-2"><header><div><b>Asumsi FG Risk Delivery</b><small>Klik switch sampai tertulis <strong>Dilepas</strong>, lalu tekan Hitung ulang preview. Proses produksi selalu wajib.</small></div><button type="button" id="recalculate-feasibility">Hitung ulang preview</button></header><div class="risk-toggle-grid"><label class="is-required"><input type="checkbox" checked disabled><span><b>Proses produksi</b><small>Dihitung per jam dari routing, cycle time, dan ${num(2)} shift</small></span><em>Wajib</em></label><label><input id="risk-supplier-lead-time" type="checkbox" ${controls.supplierLeadTime ? "checked" : ""}><span><b>Lead time supplier</b><small>Klik untuk memasukkan/melepas asumsi</small></span><em id="risk-state-supplier">Dipakai</em></label><label><input id="risk-receiving-qc" type="checkbox" ${controls.receivingQc ? "checked" : ""}><span><b>Receiving QC</b><small>Klik untuk memasukkan/melepas asumsi</small></span><em id="risk-state-qc">Dipakai</em></label><label><input id="risk-safety-lead-time" type="checkbox" ${controls.safety ? "checked" : ""}><span><b>Safety lead time</b><small>Klik untuk memasukkan/melepas asumsi</small></span><em id="risk-state-safety">Dipakai</em></label></div><label class="supplier-strategy">Strategi supplier<select id="risk-supplier-strategy"><option value="PREFERRED" ${savedOptions.supplierStrategy !== "FASTEST" ? "selected" : ""}>Supplier preferred dari master</option><option value="FASTEST" ${savedOptions.supplierStrategy === "FASTEST" ? "selected" : ""}>Supplier tercepat per material</option></select><small>Supplier tercepat dipilih dari Supplier Item aktif berdasarkan lead time terpendek; tie-break tetap deterministic.</small></label><div id="risk-supplier-options" class="risk-supplier-options"><div class="risk-empty">Memuat alternatif supplier...</div></div><div id="risk-preview-result" class="risk-preview-result"><span class="demand-loading-inline">Memuat feasibility...</span></div><p class="risk-governance-note">Melepas switch hanya mengubah kalkulasi what-if. Risiko operasional tetap dicatat dan wajib di-approve PPIC.</p></section>
      <section class="vendor-adjustment-card span-2"><header><div><b>Vendor Process Planning</b><small>Durasi master tetap menjadi baseline. PPIC dapat mengubah durasi planning per jam untuk demand ini tanpa mengubah routing master.</small></div><span>Dependency wajib</span></header><div id="vendor-process-adjustments"><div class="risk-empty">Memuat vendor process...</div></div><p>Jika durasi dipercepat, isi alasan dan lakukan <strong>Hitung ulang preview</strong>. Percepatan dicatat sebagai risiko yang memerlukan approval PPIC / Purchasing.</p></section>
      <section class="fg-finish-split-editor span-2"><header><div><b>Target Finish FG</b><small>Boleh dipecah beberapa tanggal. Forecast original ${date(row.forecastTargetDate || row.targetDate || row.targetDeliveryDate)}; deadline efektif ${date(row.effectiveTargetDate || row.targetDate || row.targetDeliveryDate)}.</small></div><button type="button" data-add-fg-split>+ Tambah split</button></header><div id="review-fg-splits">${configuredSplits.map(finishSplitEditorRow).join("")}</div><footer><span>Total split harus sama dengan Effective Demand</span><b id="review-fg-split-total"></b></footer></section>
      <label>Manual Priority Adjustment<input id="review-adjustment" type="number" min="-30" max="30" value="${Number(row.manualPriorityAdjustment || 0)}"></label>
      <label class="span-2">Alasan Adjustment<textarea id="review-reason" rows="2" placeholder="Wajib bila adjustment tidak nol"></textarea></label>
      <label>Buffer %<input id="review-buffer-percent" type="number" min="0" step=".01" value="${Number(row.bufferPercent || 0)}"><small>Default Master Part: ${num(row.masterBufferPercent)}%</small></label>
      <label>Buffer Qty<input id="review-buffer-qty" type="number" min="0" step=".01" value="${Number(row.bufferQty || 0)}"><small>Editable khusus target ini</small></label>
      <label class="demand-check"><input id="review-urgent" type="checkbox" ${row.urgentFlag ? "checked" : ""}> Urgent / expedite</label>
      <label>Status<select id="review-status"><option>REVIEWED</option><option>APPROVED</option><option>HOLD</option><option>REJECTED</option></select></label>
    </div><div class="demand-current-feasibility"><b>Demand composition</b><span>Forecast ${num(row.forecastQty)} · Actual SO ${num(row.actualSalesOrderQty)} · Effective ${num(row.demandQty)}</span></div><div class="demand-current-feasibility"><b>Current feasibility</b><span>${badge(row.feasibilityStatus)} ${esc(row.criticalConstraint || "Tidak ada constraint")}</span></div><footer><button class="btn btn-outline-secondary" data-simulate-inline>Simulasikan impact</button><button class="btn btn-primary" id="save-demand-review">Simpan Review & Recheck</button></footer>`;
    const percentInput = $("review-buffer-percent"); const qtyInput = $("review-buffer-qty");
    percentInput?.addEventListener("input", () => { qtyInput.value = (Number(row.demandQty || 0) * Number(percentInput.value || 0) / 100).toFixed(2); });
    qtyInput?.addEventListener("input", () => { if (Number(row.demandQty || 0) > 0) percentInput.value = (Number(qtyInput.value || 0) / Number(row.demandQty) * 100).toFixed(2); });
    refreshFinishSplitEditor();
    updateRiskSwitches();
    loadRiskPreview(row);
  }
  function recoveryChecklistFromForm() {
    return [...document.querySelectorAll("[data-recovery-item]")].map((item) => ({
      id: item.dataset.recoveryItem,
      selected: Boolean(item.querySelector("[data-recovery-selected]")?.checked),
      owner: item.querySelector("[data-recovery-owner]")?.value.trim() || null,
      targetDate: item.querySelector("[data-recovery-date]")?.value || null,
      notes: item.querySelector("[data-recovery-notes]")?.value.trim() || null,
      evidenceReference: item.querySelector("[data-recovery-evidence]")?.value.trim() || null,
    }));
  }
  function recoveryEvidence(item = {}) {
    const evidence = item.evidence || {};
    if (Array.isArray(evidence.materials) && evidence.materials.length) return `${evidence.materials.length} material: ${evidence.materials.slice(0, 3).map((row) => row.partCode).join(", ")}${evidence.materials.length > 3 ? "…" : ""}`;
    if (Array.isArray(evidence.blockerCodes) && evidence.blockerCodes.length) return evidence.blockerCodes.join(", ");
    return item.verification || "Bukti penyelesaian wajib tersedia sebelum milestone ditutup.";
  }
  function renderRecoveryPlan(payload) {
    currentRecovery = payload;
    const recommendation = payload.recommendation || {};
    const plan = payload.plan;
    const checklist = Array.isArray(plan?.checklist) ? plan.checklist : recommendation.actions || [];
    const status = plan?.status || "SYSTEM_RECOMMENDATION";
    const locked = ["PENDING_APPROVAL", "APPROVED"].includes(status);
    const pending = status === "PENDING_APPROVAL";
    $("demand-drawer-body").innerHTML = `<div class="recovery-overview ${Number(recommendation.recoveryGapDays || plan?.recoveryGapDays) > 0 ? "has-gap" : "is-protected"}"><div><small>CUSTOMER DUE</small><b>${date(recommendation.requestedDeliveryDate || plan?.requestedDeliveryDate)}</b></div><div><small>EARLIEST DELIVERY</small><b>${date(recommendation.earliestFeasibleDeliveryDate || plan?.earliestFeasibleDelivery)}</b></div><div><small>GAP</small><b>${num(recommendation.recoveryGapDays ?? plan?.recoveryGapDays)} hari</b></div><div><small>STATUS</small>${badge(status)}</div></div>
      <div class="recovery-principle"><b>Tujuan checklist</b><span>Mengunci tindakan yang diperlukan agar due date customer tetap diproteksi. Approval tidak mengubah requested delivery date.</span></div>
      <div class="recovery-checklist">${checklist.map((item, index) => `<article data-recovery-item="${esc(item.id)}" class="${item.selected !== false ? "is-selected" : ""}"><header><label><input type="checkbox" data-recovery-selected ${item.selected !== false ? "checked" : ""} ${item.required || locked ? "disabled" : ""}><span>${index + 1}</span><div><b>${esc(item.title)}</b><small>${esc(item.category)}${item.required ? " · WAJIB" : " · OPSIONAL"}</small></div></label>${Number(item.expectedRecoveryDays || 0) > 0 ? `<strong>Potensi ${num(item.expectedRecoveryDays)} hari</strong>` : ""}</header><p>${esc(item.reason)}</p><div class="recovery-fields"><label>PIC<input data-recovery-owner value="${esc(item.owner || item.ownerRole || "")}" placeholder="Nama PIC / departemen" ${locked ? "disabled" : ""}></label><label>Target selesai<input data-recovery-date type="date" value="${date(item.targetDate) === "-" ? "" : date(item.targetDate)}" ${locked ? "disabled" : ""}></label><label class="span-2">Catatan tindakan<textarea data-recovery-notes rows="2" placeholder="Apa yang akan dilakukan?" ${locked ? "disabled" : ""}>${esc(item.notes || "")}</textarea></label><label class="span-2">Bukti / referensi<input data-recovery-evidence value="${esc(item.evidenceReference || "")}" placeholder="Nomor PR/PO, allocation, konfirmasi supplier, atau dokumen lain" ${locked ? "disabled" : ""}></label></div><details><summary>Kriteria berhasil</summary><p>${esc(item.verification || "-")}</p><small>${esc(recoveryEvidence(item))}</small></details></article>`).join("")}</div>
      <label class="recovery-plan-notes">Catatan umum<textarea id="recovery-plan-notes" rows="3" ${locked ? "disabled" : ""}>${esc(plan?.notes || "")}</textarea></label>
      ${plan?.approvedBy ? `<div class="recovery-approval-record"><b>Approved PPIC oleh ${esc(plan.approvedBy)}</b><span>${date(plan.approvedAt)} · ${esc(plan.approvalReason || "")}</span></div>` : ""}
      ${pending ? `<section class="recovery-approval-form"><h3>Approval PPIC</h3><label>Catatan keputusan<textarea id="recovery-approval-reason" rows="3" placeholder="Jelaskan mengapa kombinasi tindakan ini cukup untuk melindungi due date"></textarea></label><label class="recovery-ack"><input id="recovery-approval-ack" type="checkbox"> Saya telah memeriksa PIC, target waktu, dependency, dan kriteria keberhasilan seluruh tindakan.</label></section>` : ""}
      <footer>${!locked ? `<button class="btn btn-outline-primary" id="save-recovery-plan">Simpan Draft</button>${plan ? `<button class="btn btn-primary" id="submit-recovery-plan">Ajukan Approval PPIC</button>` : ""}` : ""}${pending ? `<button class="btn btn-outline-danger" id="reject-recovery-plan">Reject</button><button class="btn btn-primary" id="approve-recovery-plan">Approve Recovery Plan</button>` : ""}${status === "APPROVED" ? `<button class="btn btn-outline-primary" id="revise-recovery-plan">Buat Revisi</button>` : ""}</footer>`;
  }
  async function loadRecoveryPlan(row) {
    $("demand-drawer-body").innerHTML = `<div class="demand-loading">Menyusun tindakan dari lead time, material, dan capacity…</div>`;
    try { renderRecoveryPlan(await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(row.id)}/recovery-plan`)); }
    catch (error) { $("demand-drawer-body").innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`; }
  }
  async function saveRecoveryPlan() {
    try {
      const plan = await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(selected.id)}/recovery-plan`, { method: "PUT", body: JSON.stringify({ checklist: recoveryChecklistFromForm(), notes: $("recovery-plan-notes")?.value.trim() || null }) });
      alert(`Recovery Plan R${plan.revision} tersimpan sebagai Draft.`, "success"); await loadRecoveryPlan(selected); await load();
    } catch (error) { alert(error.message); }
  }
  async function submitRecoveryPlan() {
    const plan = currentRecovery?.plan; if (!plan) return alert("Simpan Draft terlebih dahulu.", "warning");
    try { await api(`/modules/api/planning-ppic/demand-planning/recovery-plans/${encodeURIComponent(plan.id)}/submit`, { method: "POST", body: "{}" }); alert("Recovery Plan diajukan untuk approval PPIC.", "success"); await loadRecoveryPlan(selected); await load(); }
    catch (error) { alert(error.message); }
  }
  async function decideRecoveryPlan(decision) {
    const plan = currentRecovery?.plan; if (!plan) return;
    const reason = $("recovery-approval-reason")?.value.trim() || "";
    if (reason.length < 10) return alert(`Catatan ${decision} minimal 10 karakter.`, "warning");
    const acknowledgedRisk = Boolean($("recovery-approval-ack")?.checked);
    if (decision === "approve" && !acknowledgedRisk) return alert("Centang pernyataan pemeriksaan PPIC sebelum approve.", "warning");
    try { await api(`/modules/api/planning-ppic/demand-planning/recovery-plans/${encodeURIComponent(plan.id)}/${decision}`, { method: "PATCH", body: JSON.stringify({ reason, acknowledgedRisk }) }); alert(decision === "approve" ? "Recovery Plan disetujui PPIC dan audit tersimpan." : "Recovery Plan ditolak untuk diperbaiki.", "success"); await loadRecoveryPlan(selected); await load(); }
    catch (error) { alert(error.message); }
  }
  async function saveReview() {
    const adjustment = Number($("review-adjustment").value || 0); const reason = $("review-reason").value.trim();
    if (adjustment !== 0 && !reason) return alert("Alasan manual priority adjustment wajib diisi.", "warning");
    const vendorValidation = validateVendorProcessAdjustments();
    if (vendorValidation) return alert(vendorValidation, "warning");
    const fgFinishSplits = [...document.querySelectorAll("[data-fg-split]")].map((row, index) => ({ phaseNumber: index + 1, targetFinishDate: row.querySelector(".review-fg-split-date")?.value || null, qty: Number(row.querySelector(".review-fg-split-qty")?.value || 0) }));
    if (fgFinishSplits.some((split) => !split.targetFinishDate || split.qty <= 0)) return alert("Setiap split wajib memiliki tanggal finish dan qty lebih dari nol.", "warning");
    const customerTarget = date(selected?.effectiveTargetDate || selected?.targetDate || selected?.targetDeliveryDate);
    if (fgFinishSplits.some((split) => split.targetFinishDate > customerTarget)) return alert(`Target Finish FG tidak boleh melewati delivery customer ${customerTarget}.`, "warning");
    const splitTotal = fgFinishSplits.reduce((sum, split) => sum + split.qty, 0);
    if (Math.abs(splitTotal - Number(selected?.demandQty || 0)) > 0.005) return alert(`Total split ${num(splitTotal)} harus sama dengan Effective Demand ${num(selected?.demandQty)}.`, "warning");
    try {
      await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(selected.id)}/review`, { method: "PATCH", body: JSON.stringify({ fgFinishSplits, fgRequiredDate: fgFinishSplits[0]?.targetFinishDate || null, manualPriorityAdjustment: adjustment, manualAdjustmentReason: reason, bufferPercent: Number($("review-buffer-percent").value || 0), bufferQty: Number($("review-buffer-qty").value || 0), urgentFlag: $("review-urgent").checked, status: $("review-status").value, runFeasibility: true, leadTimeControls: riskControlsFromForm(), supplierStrategy: $("risk-supplier-strategy")?.value || "PREFERRED", supplierSelections: supplierSelectionsFromForm(), vendorProcessAdjustments: vendorProcessAdjustmentsFromForm() }) });
      closeDrawer(); alert("Demand review tersimpan; target delivery Marketing tidak diubah.", "success"); await load();
    } catch (error) { alert(error.message); }
  }
  async function simulate(row) {
    $("demand-drawer-body").innerHTML = `<div class="demand-loading">Menghitung schedule terdampak…</div>`;
    try {
      const result = await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(row.id)}/simulate-impact`, { method: "POST", body: "{}" });
      lastImpact = result;
      const immutable = result.affectedSchedules.some((item)=>item.decision==="IMMUTABLE");
      $("demand-drawer-body").innerHTML = `<div class="demand-impact-summary"><b>${result.affectedSchedules.length} schedule berpotensi terdampak</b><span>${result.requiresApproval ? "Approval diperlukan sebelum commit" : "Tidak ada protected schedule"}</span></div><div class="demand-impact-list">${result.affectedSchedules.length ? result.affectedSchedules.map((item) => `<article><div><b>${esc(item.scheduleNumber)}</b><small>${esc(item.affectedCustomer || "-")}</small></div><div><span>${date(item.oldCompletion)} → ${date(item.newCompletion)}</span><small>${item.deltaDays > 0 ? "+" : ""}${item.deltaDays} hari · ${esc(item.affectedDeliveryRisk)}</small></div>${badge(item.decision)}</article>`).join("") : `<p>Tidak ada schedule yang perlu digeser.</p>`}</div><p class="demand-simulation-note">Simulation only — belum ada DPP yang diubah.</p>${immutable?'<div class="alert alert-warning">Proposal tidak dapat diajukan karena menyentuh DPP In Progress/Completed.</div>':`<label class="demand-proposal-reason">Alasan proposal<textarea id="demand-proposal-reason" rows="2" placeholder="Jelaskan urgensi dan dampak yang diterima"></textarea></label><footer><button class="btn btn-primary" id="submit-displacement-proposal">Ajukan untuk approval</button></footer>`}`;
    } catch (error) { $("demand-drawer-body").innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`; }
  }
  async function submitDisplacementProposal(){const reason=$("demand-proposal-reason")?.value.trim();if(!reason||reason.length<10)return alert("Alasan displacement proposal minimal 10 karakter.","warning");try{const proposal=await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(selected.id)}/displacement-proposals`,{method:"POST",body:JSON.stringify({reason,proposedCompletion:lastImpact?.targetDeliveryDate})});$("demand-drawer-body").innerHTML=`<div class="alert alert-success">Proposal ${esc(proposal.id)} tersimpan dengan status ${esc(proposal.status)}. DPP belum berubah sampai governance selesai.</div>`}catch(error){alert(error.message)}}
  async function approveProposal(id){const reason=window.formPrompt?await window.formPrompt("Alasan approval impact (minimal 10 karakter):","",{title:"Approve DPP displacement"}):window.prompt("Alasan approval impact (minimal 10 karakter):","");if(reason===null)return;if(String(reason).trim().length<10)return alert("Alasan approval minimal 10 karakter.","warning");try{await api(`/modules/api/planning-ppic/demand-planning/displacement-proposals/${encodeURIComponent(id)}/approve`,{method:"PATCH",body:JSON.stringify({reason:String(reason).trim()})});alert("Impact displacement disetujui dan tercatat dalam audit.","success");await load()}catch(error){alert(error.message)}}
  function closeDrawer() { $("demand-drawer").classList.remove("open"); $("demand-drawer").setAttribute("aria-hidden", "true"); selected = null; currentFeasibility = null; previewSupplierSelections = {}; previewVendorProcessAdjustments = []; }
  const mpsRowMonth = (row) => date(row.effectiveTargetDate || row.targetDate || row.targetDeliveryDate).slice(0, 7);
  const mpsMonthLabel = (month) => {
    const parsed = new Date(`${month}-01T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? month : new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(parsed);
  };
  const mpsSelectableRows = () => rows
    .filter((row) => Number(row.outstandingQty ?? row.demandQty ?? 0) > 0 && /^\d{4}-\d{2}$/.test(mpsRowMonth(row)))
    .sort((left, right) => `${mpsRowMonth(left)}|${date(left.effectiveTargetDate || left.targetDate)}|${left.partCode || ""}`.localeCompare(`${mpsRowMonth(right)}|${date(right.effectiveTargetDate || right.targetDate)}|${right.partCode || ""}`));
  const selectedMpsRows = () => mpsSelectableRows().filter((row) => mpsSelectedRowIds.has(row.id));
  const selectedMpsMonths = () => [...new Set(selectedMpsRows().map(mpsRowMonth))].sort();
  const deliveryTargetIdsForMpsRow = (row) => [...new Set([
    row.id,
    ...(row.actualSalesOrders || []).map((item) => item.deliveryTargetId),
    ...(row.effectiveDeliverySplits || []).map((item) => item.deliveryTargetId),
  ].filter(Boolean))];
  function setMpsSelectorMessage(message = "", kind = "info") {
    const root = $("mps-run-selector-message");
    if (!root) return;
    root.textContent = message;
    root.className = `mps-run-selector-message${message ? ` is-${kind}` : ""}`;
  }
  function updateMpsSelectorStats() {
    const selectedRows = selectedMpsRows();
    const months = selectedMpsMonths();
    const totalQty = selectedRows.reduce((sum, row) => sum + Number(row.outstandingQty ?? row.demandQty ?? 0), 0);
    const unreviewed = selectedRows.filter((row) => !["REVIEWED", "APPROVED"].includes(String(row.planningStatus || "").toUpperCase())).length;
    $("mps-run-month-count").textContent = months.length;
    $("mps-run-line-count").textContent = selectedRows.length;
    $("mps-run-qty").textContent = num(totalQty);
    $("mps-run-review-summary").textContent = selectedRows.length
      ? `${months.map(mpsMonthLabel).join(" + ")} - ${selectedRows.length} target${unreviewed ? ` - ${unreviewed} belum direview` : ""}`
      : "Belum ada target dipilih";
    $("mps-run-submit").disabled = !selectedRows.length || months.length > 3 || mpsSelectorBusy;
  }
  function renderMpsSelector() {
    const root = $("mps-run-selector-groups");
    const query = String($("mps-run-search")?.value || "").trim().toLowerCase();
    const allRows = mpsSelectableRows();
    const grouped = new Map();
    allRows.forEach((row) => { const month = mpsRowMonth(row); if (!grouped.has(month)) grouped.set(month, []); grouped.get(month).push(row); });
    const html = [...grouped.entries()].map(([month, monthRows]) => {
      const visibleRows = query ? monthRows.filter((row) => [row.sourceNumber, row.customerCode, row.partCode, ...(row.actualSalesOrders || []).map((item) => item.sourceNumber)].some((value) => String(value || "").toLowerCase().includes(query))) : monthRows;
      if (!visibleRows.length) return "";
      const selectedCount = monthRows.filter((row) => mpsSelectedRowIds.has(row.id)).length;
      const monthSelected = selectedCount === monthRows.length;
      const monthQty = monthRows.reduce((sum, row) => sum + Number(row.outstandingQty ?? row.demandQty ?? 0), 0);
      const reviewed = monthRows.filter((row) => ["REVIEWED", "APPROVED"].includes(String(row.planningStatus || "").toUpperCase())).length;
      return `<details class="mps-run-month-group" ${selectedCount || query ? "open" : ""} data-mps-month-group="${esc(month)}">
        <summary><label class="mps-run-month-check" onclick="event.stopPropagation()"><input type="checkbox" data-mps-month="${esc(month)}" ${monthSelected ? "checked" : ""}><span><b>${esc(mpsMonthLabel(month))}</b><small>${selectedCount}/${monthRows.length} dipilih - ${reviewed}/${monthRows.length} reviewed</small></span></label><div><b>${num(monthQty)}</b><small>effective qty</small></div><i aria-hidden="true">⌄</i></summary>
        <div class="mps-run-lines">${visibleRows.map((row) => {
          const checked = mpsSelectedRowIds.has(row.id);
          const actualSo = (row.actualSalesOrders || []).map((item) => item.sourceNumber).filter(Boolean);
          return `<label class="mps-run-line ${checked ? "is-selected" : ""}"><input type="checkbox" data-mps-row="${esc(row.id)}" ${checked ? "checked" : ""}><span class="mps-run-line-source"><b>${esc(row.sourceNumber || "SO tanpa Forecast")}</b><small>${actualSo.length ? `Actual SO ${esc(actualSo.join(", "))}` : "Forecast demand"}</small></span><span><small>Customer / FG</small><b>${esc(row.customerCode || "-")} - ${esc(row.partCode || "-")}</b></span><span><small>Target Delivery</small><b>${date(row.effectiveTargetDate || row.targetDate)}</b><em>FG ${date(row.fgRequiredDate)}</em></span><span class="mps-run-line-qty"><small>Forecast / SO / Effective</small><b>${num(row.forecastQty)} / ${num(row.actualSalesOrderQty)} / ${num(row.outstandingQty ?? row.demandQty)}</b></span><span>${statusBadge(row.feasibilityStatus)}<small>${esc(row.planningStatus || "UNREVIEWED")}</small></span></label>`;
        }).join("")}</div>
      </details>`;
    }).join("");
    root.innerHTML = html || `<div class="mps-run-selector-empty">Tidak ada delivery target yang cocok dengan pencarian.</div>`;
    root.querySelectorAll("[data-mps-month]").forEach((input) => {
      const monthRows = grouped.get(input.dataset.mpsMonth) || [];
      const selectedCount = monthRows.filter((row) => mpsSelectedRowIds.has(row.id)).length;
      input.indeterminate = selectedCount > 0 && selectedCount < monthRows.length;
    });
    updateMpsSelectorStats();
  }
  function openMpsSelector() {
    const available = mpsSelectableRows();
    mpsSelectedRowIds = new Set();
    [...new Set(available.map(mpsRowMonth))].slice(0, 3).forEach((month) => available.filter((row) => mpsRowMonth(row) === month).forEach((row) => mpsSelectedRowIds.add(row.id)));
    $("mps-run-search").value = "";
    setMpsSelectorMessage(available.length ? "Default memilih maksimal tiga bulan Target Delivery paling awal. Anda dapat mengubah pilihan sebelum membuat MPS." : "Belum ada outstanding demand yang dapat dibuat menjadi MPS.", available.length ? "info" : "warning");
    renderMpsSelector();
    $("mps-run-selector").classList.add("open");
    $("mps-run-selector").setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
  function closeMpsSelector(force = false) {
    if (mpsSelectorBusy && !force) return;
    $("mps-run-selector").classList.remove("open");
    $("mps-run-selector").setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }
  function toggleMpsMonth(month, checked) {
    const targetRows = mpsSelectableRows().filter((row) => mpsRowMonth(row) === month);
    const currentMonths = new Set(selectedMpsMonths());
    if (checked && !currentMonths.has(month) && currentMonths.size >= 3) {
      setMpsSelectorMessage("Maksimal tiga bulan dalam satu run MPS. Uncheck salah satu bulan terlebih dahulu.", "warning");
      return renderMpsSelector();
    }
    targetRows.forEach((row) => checked ? mpsSelectedRowIds.add(row.id) : mpsSelectedRowIds.delete(row.id));
    setMpsSelectorMessage();
    renderMpsSelector();
  }
  function toggleMpsRow(id, checked) {
    const row = mpsSelectableRows().find((item) => item.id === id); if (!row) return;
    const month = mpsRowMonth(row); const currentMonths = new Set(selectedMpsMonths());
    if (checked && !currentMonths.has(month) && currentMonths.size >= 3) {
      setMpsSelectorMessage("Baris tidak dipilih karena satu run MPS dibatasi maksimal tiga bulan.", "warning");
      return renderMpsSelector();
    }
    checked ? mpsSelectedRowIds.add(id) : mpsSelectedRowIds.delete(id);
    setMpsSelectorMessage();
    renderMpsSelector();
  }
  async function submitMpsSelection() {
    const selectedRows = selectedMpsRows(); const months = selectedMpsMonths();
    if (!selectedRows.length) return setMpsSelectorMessage("Pilih minimal satu delivery target.", "warning");
    if (months.length > 3) return setMpsSelectorMessage("Maksimal tiga bulan dalam satu run MPS.", "warning");
    const unreviewed = selectedRows.filter((row) => !["REVIEWED", "APPROVED"].includes(String(row.planningStatus || "").toUpperCase())).length;
    if (unreviewed && !confirm(`${unreviewed} delivery target terpilih belum direview. Tetap buat MPS sebagai Draft?`)) return;
    const selectedDeliveryTargetIds = [...new Set(selectedRows.flatMap(deliveryTargetIdsForMpsRow))];
    mpsSelectorBusy = true; updateMpsSelectorStats();
    const button = $("mps-run-submit"); const oldLabel = button.textContent; button.textContent = "Membuat MPS...";
    try {
      const anchor = months[0] || $("demand-anchor-input").value || currentAnchor();
      const result = await api("/modules/api/planning-ppic/mps/monthly-sync", { method: "POST", body: JSON.stringify({ planningAnchorMonth: anchor, months, selectedDeliveryTargetIds }) });
      alert(`${result.items?.length || result.mpsNumbers?.length || 0} MPS berhasil dibuat untuk ${(result.months || months).map(mpsMonthLabel).join(", ")}.`, "success");
      closeMpsSelector(true);
      setTimeout(() => { location.href = "/modules/planning-ppic/mps"; }, 450);
    } catch (error) { setMpsSelectorMessage(error.message, "danger"); alert(error.message); }
    finally { mpsSelectorBusy = false; button.textContent = oldLabel; updateMpsSelectorStats(); }
  }
  function runRollingMps() { openMpsSelector(); }
  function exportCsv() { const columns = ["sourceNumber","customerCode","partCode","targetDate","forecastQty","actualSalesOrderQty","demandQty","outstandingQty","planningPolicy","systemPriorityScore","manualPriorityAdjustment","finalPriorityScore","priorityClass","fgRequiredDate","feasibilityStatus","earliestFeasibleDeliveryDate","criticalConstraint","bufferPercent","bufferQty","bufferSource","planningStatus"]; const csv = [columns.join(","), ...rows.map((row) => columns.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `demand-planning-${$("demand-anchor-input")?.value || currentAnchor()}.csv`; link.click(); URL.revokeObjectURL(link.href); }

  $("ppic-primary").textContent = "Buat MPS Demand Matrix"; $("ppic-primary").disabled = true; $("ppic-primary").addEventListener("click", runRollingMps);
  $("ppic-filter").addEventListener("click", () => $("demand-filter-panel").classList.toggle("is-hidden"));
  $("demand-apply-filter").addEventListener("click", load); $("ppic-export").addEventListener("click", exportCsv);
  $("ppic-search").addEventListener("input", (event) => { const q = event.target.value.toLowerCase(); renderRows(rows.filter((row) => [row.sourceNumber,row.customerCode,row.partCode,row.criticalConstraint,...(row.draftSalesOrders || []).map((item) => item.sourceNumber)].some((value) => String(value || "").toLowerCase().includes(q)))); });
  $("ppic-rows").addEventListener("click", (event) => { const approve=event.target.closest("[data-approve-proposal]");if(approve)return approveProposal(approve.dataset.approveProposal);const review = event.target.closest("[data-review]"); const recovery = event.target.closest("[data-recovery]"); const impact = event.target.closest("[data-simulate]"); const score = event.target.closest("[data-score]"); const id = review?.dataset.review || recovery?.dataset.recovery || impact?.dataset.simulate || score?.dataset.score; const row = rows.find((item) => item.id === id); if (!row) return; if (score) return openDrawer(row, "score"); if (recovery) return openDrawer(row, "recovery"); openDrawer(row, impact ? "impact" : "review"); });
  $("demand-drawer").addEventListener("click", (event) => { if (event.target.closest("[data-close-drawer]")) closeDrawer(); if (event.target.id === "save-demand-review") saveReview(); if(event.target.id==="submit-displacement-proposal")submitDisplacementProposal(); if(event.target.id==="save-recovery-plan")saveRecoveryPlan(); if(event.target.id==="submit-recovery-plan")submitRecoveryPlan(); if(event.target.id==="approve-recovery-plan")decideRecoveryPlan("approve"); if(event.target.id==="reject-recovery-plan")decideRecoveryPlan("reject"); if(event.target.id==="revise-recovery-plan")saveRecoveryPlan(); if (event.target.closest("[data-simulate-inline]") && selected) openDrawer(selected, "impact"); const add = event.target.closest("[data-add-fg-split]"); if (add && selected) { const root = $("review-fg-splits"); root?.insertAdjacentHTML("beforeend", finishSplitEditorRow({ targetFinishDate: selected.fgRequiredDate || selected.targetDate, qty: 0 }, root.children.length)); refreshFinishSplitEditor(); } const remove = event.target.closest("[data-remove-fg-split]"); if (remove && document.querySelectorAll("[data-fg-split]").length > 1) { remove.closest("[data-fg-split]")?.remove(); refreshFinishSplitEditor(); } });
  $("demand-drawer").addEventListener("click", (event) => { if (event.target.id === "recalculate-feasibility") loadRiskPreview(); });
  $("demand-drawer").addEventListener("change", (event) => { if (event.target.matches("#risk-supplier-lead-time,#risk-receiving-qc,#risk-safety-lead-time")) updateRiskSwitches(); });
  $("demand-drawer").addEventListener("input", (event) => { if (event.target.matches(".review-fg-split-qty,.review-fg-split-date")) refreshFinishSplitEditor(); });
  $("mps-run-selector").addEventListener("click", (event) => { if (event.target.closest("[data-close-mps-selector]")) closeMpsSelector(); if (event.target.id === "mps-run-submit") submitMpsSelection(); });
  $("mps-run-selector").addEventListener("change", (event) => { if (event.target.matches("[data-mps-month]")) toggleMpsMonth(event.target.dataset.mpsMonth, event.target.checked); if (event.target.matches("[data-mps-row]")) toggleMpsRow(event.target.dataset.mpsRow, event.target.checked); });
  $("mps-run-search").addEventListener("input", renderMpsSelector);
  load();
})();
