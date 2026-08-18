(() => {
  "use strict";
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const config = JSON.parse(document.getElementById("mwb-page-config")?.textContent || "{}");
  const $ = (id) => document.getElementById(id);
  const els = { month: $("mwb-month"), status: $("mwb-status"), search: $("mwb-search"), pageSize: $("mwb-page-size"), sync: $("mwb-sync"), confirmMps: $("mwb-confirm-mps"), runMrp: $("mwb-run-mrp"), export: $("mwb-export"), body: $("mwb-body"), alert: $("mwb-alert"), sourceTitle: $("mwb-source-title"), sourceMeta: $("mwb-source-meta"), title: $("mwb-title"), meta: $("mwb-result-meta"), range: $("mwb-range"), prev: $("mwb-prev"), next: $("mwb-next"), pageLabel: $("mwb-page-label"), drawer: $("mwb-drawer"), drawerTitle: $("mwb-drawer-title"), drawerMeta: $("mwb-drawer-meta"), drawerBody: $("mwb-drawer-body"), zoomOut: $("mwb-zoom-out"), zoomIn: $("mwb-zoom-in"), zoomLabel: $("mwb-zoom-label"), fullscreen: $("mwb-fullscreen"), modal: $("mwb-modal"), modalForm: $("mwb-modal-form"), modalMessage: $("mwb-modal-message"), modalSubmit: $("mwb-modal-submit"), confirm: $("mwb-confirm"), actionModal: $("mwb-action-modal"), actionForm: $("mwb-action-form"), actionTitle: $("mwb-action-title"), actionDescription: $("mwb-action-description"), actionMessage: $("mwb-action-message"), actionConfirm: $("mwb-action-confirm"), actionConfirmCopy: $("mwb-action-confirm-copy"), actionSubmit: $("mwb-action-submit"), nextState: $("mwb-next-state"), flowMps: $("mwb-flow-mps"), flowGate: $("mwb-flow-gate"), flowMrp: $("mwb-flow-mrp"), nextTitle: $("mwb-next-title"), nextCopy: $("mwb-next-copy"), openMrp: $("mwb-open-mrp"), density: $("mwb-density"), board: document.querySelector(".mwb-board") };
  const state = { page: 1, pageSize: 25, data: null, loading: false, action: null, zoom: 1, drawerFullscreen: false, detailRequestId: 0 };
  const apiBase = "/modules/api/planning-ppic/mps";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const label = (value) => String(value || "—").replaceAll("_", " ");
  async function request(url, options = {}) { const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || `Request gagal (${response.status}).`); return payload; }
  function showAlert(message, success = false) { els.alert.hidden = !message; els.alert.textContent = message || ""; els.alert.classList.toggle("success", success); }
  function query() { const params = new URLSearchParams({ month: els.month.value || config.initialMonth, page: state.page, pageSize: state.pageSize }); if (els.status.value) params.set("status", els.status.value); if (els.search.value.trim()) params.set("q", els.search.value.trim()); return params; }
  function stack(m) { return `<div class="mwb-stack"><div><span>Free FG</span><b>${num(m.freeOpeningQty)}</b></div><div><span>Pegged SO</span><b>${num(m.peggedReservationQty)}</b></div><div class="total"><span>Nettable</span><b>${num(m.openingNettableQty)}</b></div>${Math.abs(m.openingVarianceQty) > .000001 ? `<div><span>vs resmi</span><b>${num(m.openingVarianceQty)}</b></div>` : ""}</div>`; }
  function renderRows(data) {
    if (!data.items.length) { const blocked = data.blockedForecasts || []; els.body.innerHTML = `<tr><td colspan="10" class="mwb-empty"><b>${data.mps ? "Tidak ada FG pada filter ini." : "Draft MPS periode ini belum ada."}</b><br><small>${data.mps ? "Ubah filter pencarian." : blocked.length ? `${blocked.length} Forecast masih ${blocked.map((row) => row.status).join("/")}; konfirmasi demand terlebih dahulu.` : "Klik Hitung Draft MPS untuk menarik demand aktif dan melakukan netting FG."}</small></td></tr>`; return; }
    els.body.innerHTML = data.items.map((item) => { const m = item.metrics; const bufferSource = item.bufferSource === "OVERRIDE" ? "Override" : "Master part"; return `<tr><td class="sticky-col mwb-part"><a href="#" data-detail="${esc(item.id)}">${esc(item.partNumber || item.partCode)}</a><b>${esc(item.partName || item.partCode)}</b><small>${esc(item.partCode)} · ${esc(item.mpsNumber)}</small><small>${esc(item.customerCode || "MULTI")} · ${esc(item.demandPolicy || "MTO")}</small></td><td><span class="mwb-status ${esc(item.status)}">${esc(label(item.status))}</span>${m.uncoveredQty > 0 ? `<small>${num(m.uncoveredQty)} uncovered</small>` : ""}</td><td class="mwb-metric"><b>${num(m.grossDemandQty)} ${esc(item.uomCode || "")}</b><small>${item.phases.length} customer phase</small></td><td class="mwb-metric mwb-buffer-cell"><b>${num(item.bufferQty)} ${esc(item.uomCode || "")}</b><small>${bufferSource} ${num(item.bufferPercent)}% × FCC ${esc(item.nextForecastMonth)} ${num(item.bufferBaseQty)}</small><small>FG selesai ${date(item.bufferTargetDate)}</small></td><td>${stack(m)}</td><td class="mwb-metric"><b>${num(m.firmReceiptQty)}</b><small>${item.receipts.length} open MO</small></td><td class="mwb-metric"><b>${num(m.plannedProductionQty)}</b><small>Customer + buffer</small></td><td class="mwb-metric"><b>${num(m.officialProjectedEndingQty)}</b><small>Ledger: ${num(m.projectedEndingQty)}</small></td><td class="mwb-date"><b>${date(item.earliestFgRequiredDate)}</b><small>Delivery ${date(item.earliestCustomerTargetDate)}</small></td><td><button class="mwb-row-action" type="button" data-detail="${esc(item.id)}">Buka netting</button></td></tr>`; }).join("");
  }
  function renderFlow(data) {
    const mps = data.mps;
    const mrp = data.mrp;
    const mpsLocked = ["Confirmed", "Released"].includes(mps?.status);
    const mrpRunning = mrp?.status === "Running";
    els.nextState.classList.remove("ready", "warning", "failed");
    els.flowMps.textContent = mps ? `${mps.mpsNumber} · ${mps.status}` : "Belum ada";
    els.flowGate.textContent = !mps ? "Bentuk Draft" : mpsLocked ? "Locked / siap MRP" : mps.replanRequired ? "Replan required" : "Perlu konfirmasi";
    els.flowMrp.textContent = mrp ? `${mrp.runNumber} · ${mrp.status}` : "Belum ada run";
    els.sync.disabled = Boolean(mps && mps.status !== "Draft");
    els.confirmMps.disabled = !mps || mps.status !== "Draft" || mps.replanRequired || !data.summary.partCount;
    els.runMrp.disabled = !mpsLocked || mrpRunning || mps?.replanRequired;
    els.runMrp.textContent = mrp && !mrpRunning ? "Jalankan Ulang MRP" : "Jalankan MRP";
    els.openMrp.hidden = !mrp;
    els.openMrp.href = `/modules/planning-ppic/control-tower?tab=mrp&month=${encodeURIComponent(data.period)}`;
    if (!mps) {
      els.nextState.classList.add("warning");
      els.nextTitle.textContent = "Langkah 1: bentuk Draft MPS";
      els.nextCopy.textContent = "MRP hanya dapat dibuat dari MPS resmi yang sudah memiliki detail.";
    } else if (mps.replanRequired) {
      els.nextState.classList.add("failed");
      els.nextTitle.textContent = "MPS harus dihitung ulang";
      els.nextCopy.textContent = mps.replanReason || "Demand sumber berubah; selesaikan replan sebelum konfirmasi dan MRP.";
    } else if (!mpsLocked) {
      els.nextState.classList.add("warning");
      els.nextTitle.textContent = "Langkah 2: Konfirmasi MPS";
      els.nextCopy.textContent = `${mps.mpsNumber} masih ${mps.status}. Audit netting, lalu konfirmasi agar MRP dapat dijalankan.`;
    } else if (!mrp) {
      els.nextState.classList.add("ready");
      els.nextTitle.textContent = "Langkah 3: Jalankan MRP";
      els.nextCopy.textContent = "MPS sudah terkunci, tetapi belum ada MRP run. Jalankan official MRP dari tombol di atas.";
    } else if (mrpRunning) {
      els.nextState.classList.add("warning");
      els.nextTitle.textContent = `MRP ${mrp.runNumber} sedang berjalan`;
      els.nextCopy.textContent = "Tunggu proses selesai; status akan diperbarui saat data dimuat ulang.";
    } else if (mrp.status === "Completed") {
      els.nextState.classList.add("ready");
      els.nextTitle.textContent = `MRP ${mrp.runNumber} selesai`;
      els.nextCopy.textContent = `${num(mrp.totalRequirements)} requirement dan ${num(mrp.totalPlannedOrders)} planned order terbentuk. Lanjutkan review di Month-End MRP Cockpit.`;
    } else {
      els.nextState.classList.add("failed");
      els.nextTitle.textContent = `MRP ${mrp.runNumber} ${mrp.status}`;
      els.nextCopy.textContent = mrp.errorMessage || "Periksa error, lalu jalankan ulang MRP setelah penyebab diperbaiki.";
    }
  }
  function render(data) {
    state.data = data; renderRows(data); renderFlow(data); const s = data.summary;
    $("mwb-kpi-demand").textContent = num(s.grossDemandQty); $("mwb-kpi-buffer").textContent = num(s.bufferQty); $("mwb-kpi-free").textContent = num(s.freeOpeningQty); $("mwb-kpi-pegged").textContent = num(s.peggedReservationQty); $("mwb-kpi-receipt").textContent = num(s.firmReceiptQty); $("mwb-kpi-production").textContent = num(s.plannedProductionQty); $("mwb-kpi-risk").textContent = num(s.uncoveredQty); $("mwb-kpi-risk-meta").textContent = `${num((s.varianceCount || 0) + (s.shortageCount || 0))} line perlu review`;
    const selected = els.status.value; els.status.innerHTML = `<option value="">Semua status</option>${data.statuses.map((row) => `<option value="${esc(row)}">${esc(label(row))}</option>`).join("")}`; els.status.value = data.statuses.includes(selected) ? selected : "";
    els.sourceTitle.textContent = data.mps ? `${data.mps.mpsNumber} · ${data.mps.status} · ${label(data.mps.lifecycleStatus)}` : `Belum ada MPS kanonis ${data.period}`;
    const blocked = data.blockedForecasts || [];
    els.sourceMeta.textContent = data.mps ? `Terakhir dihitung ${date(data.mps.updatedAt)}${data.mps.replanRequired ? ` · REPLAN: ${data.mps.replanReason || "source berubah"}` : ""}` : blocked.length ? `${blocked.map((row) => `${row.forecastNumber} ${row.status} (${num(row.qty)})`).join(" · ")} — konfirmasi Forecast sebelum dihitung ke MPS.` : "Hitung Draft MPS untuk membentuk dokumen resmi dari demand aktif.";
    els.title.textContent = `MPS ${data.period}`; els.meta.textContent = `${num(data.pagination.filtered)} FG · customer demand + buffer FCC bulan depan · target selesai akhir bulan`;
    const start = data.pagination.filtered ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0, end = Math.min(data.pagination.filtered, data.pagination.page * data.pagination.pageSize); els.range.textContent = `${start}–${end} dari ${num(data.pagination.filtered)}`; els.pageLabel.textContent = `Halaman ${data.pagination.page} / ${data.pagination.pages}`; els.prev.disabled = data.pagination.page <= 1; els.next.disabled = data.pagination.page >= data.pagination.pages;
  }
  async function load({ resetPage = false, quiet = false } = {}) { if (state.loading) return; if (resetPage) state.page = 1; state.loading = true; if (!quiet) els.body.innerHTML = '<tr><td colspan="10" class="mwb-empty">Menghitung tampilan netting FG…</td></tr>'; try { render(await request(`${apiBase}/workbench?${query()}`)); showAlert(""); } catch (error) { showAlert(error.message); els.body.innerHTML = `<tr><td colspan="10" class="mwb-empty">${esc(error.message)}</td></tr>`; } finally { state.loading = false; } }
  const miniTable = (headers, rows) => `<div style="overflow:auto"><table class="mwb-mini-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">Tidak ada data.</td></tr>`}</tbody></table></div>`;
  const matrixNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const matrixBaseCode = (value) => String(value || "").replace(/-\d{3}$/, "-000");
  const matrixStockQty = (stock, uomCode, field) => matrixNumber((stock?.byUom || []).find((row) => String(row.uomCode || "").toUpperCase() === String(uomCode || "").toUpperCase())?.[field]);
  const matrixStageLabel = (line) => {
    const process = (line.processes || []).at(-1) || {};
    return String(process.processCode || process.processName || "WIP").toUpperCase().replace(/[^A-Z0-9 /+&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "WIP";
  };
  const matrixStagePriority = (stage) => /PRG|PRESS|FORM|BLANK/.test(stage) ? 10 : /^BE$|BENDING/.test(stage) ? 15 : /SPOT/.test(stage) ? 20 : /WELD/.test(stage) ? 30 : /PAINT|COAT|PLAT|VENDOR/.test(stage) ? 40 : /INSP|QC|PACK|ASSY/.test(stage) ? 50 : 35;
  const cloneMatrixRows = (rows) => rows.map((row) => ({ ...row, stages: { ...row.stages }, sources: { ...row.sources } }));
  function buildPhaseMatrixModel(simulation) {
    const trace = simulation.inventoryTrace;
    if (!trace) return { stages: [], phases: [] };
    const lines = trace.traceLines || [];
    const partNumberByBase = new Map([[matrixBaseCode(trace.fgPartCode), trace.fgPartNumber]]);
    lines.forEach((line) => { if (line.partNumber) partNumberByBase.set(matrixBaseCode(line.partCode), line.partNumber); });
    const keyFor = (partNumber, partCode, partName) => partNumber || partNumberByBase.get(matrixBaseCode(partCode)) || matrixBaseCode(partCode) || `${partName || "PART"}:${partCode || "-"}`;
    const stageByPartCode = new Map();
    const stageSet = new Set();
    const occurrences = new Map();
    lines.filter((line) => line.category === "WIP").sort((a, b) => matrixNumber(b.minimumLevel) - matrixNumber(a.minimumLevel)).forEach((line) => {
      const base = matrixStageLabel(line);
      const occurrenceKey = `${keyFor(line.partNumber, line.partCode, line.partName)}|${base}`;
      const occurrence = matrixNumber(occurrences.get(occurrenceKey)) + 1;
      occurrences.set(occurrenceKey, occurrence);
      const duplicateCount = lines.filter((row) => row.category === "WIP" && keyFor(row.partNumber, row.partCode, row.partName) === keyFor(line.partNumber, line.partCode, line.partName) && matrixStageLabel(row) === base).length;
      const stage = duplicateCount > 1 ? `${base}-${occurrence}` : base;
      stageByPartCode.set(line.partCode, stage); stageSet.add(stage);
    });
    const stages = [...stageSet].sort((a, b) => matrixStagePriority(a) - matrixStagePriority(b) || a.localeCompare(b, "id", { numeric: true }));
    const grouped = new Map();
    const rowKeyByPartCode = new Map();
    const ensure = ({ partNumber, partCode, partName, rank = 1, materialUom = "PCS", grossWeight = 0 }) => {
      const key = keyFor(partNumber, partCode, partName);
      if (!grouped.has(key)) grouped.set(key, { key, rank, partNumber: partNumber || partNumberByBase.get(matrixBaseCode(partCode)) || partCode || "-", partCode: matrixBaseCode(partCode) || partCode || "-", partName: partName || "-", materialUom, grossWeight, materialOnHand: 0, materialReserved: 0, materialQC: 0, materialFree: 0, inbound: 0, stages: Object.fromEntries(stages.map((stage) => [stage, 0])), fgOnHand: 0, fgReserved: 0, fgFree: 0, sources: {} });
      const row = grouped.get(key); row.rank = Math.min(row.rank, rank); rowKeyByPartCode.set(partCode, key); return row;
    };
    const root = ensure({ partNumber: trace.fgPartNumber, partCode: trace.fgPartCode, partName: trace.fgPartName, rank: 0 });
    root.fgOnHand = matrixStockQty(trace.fgStock, "PCS", "qtyOnHand"); root.fgReserved = matrixStockQty(trace.fgStock, "PCS", "qtyReserved"); root.fgFree = matrixStockQty(trace.fgStock, "PCS", "qtyAvailable");
    for (const line of lines) {
      const material = line.category === "MATERIAL";
      const raw = material || line.category === "PURCHASE_PART";
      const uom = material ? "KG" : String(line.requirementUomCode || "PCS").toUpperCase();
      const row = ensure({ partNumber: line.partNumber, partCode: line.partCode, partName: line.partName, rank: line.category === "PURCHASE_PART" ? 2 : 1, materialUom: uom, grossWeight: matrixNumber(line.grossWeightPerPieceKg) });
      if (raw) {
        row.materialUom = uom; row.grossWeight = matrixNumber(line.grossWeightPerPieceKg);
        row.materialOnHand += matrixStockQty(line.stock, uom, "qtyOnHand"); row.materialReserved += matrixStockQty(line.stock, uom, "qtyReserved"); row.materialQC += matrixStockQty(line.stock, uom, "qtyQC"); row.materialFree += matrixStockQty(line.stock, uom, "qtyAvailable");
      } else if (line.category === "WIP") row.stages[stageByPartCode.get(line.partCode) || matrixStageLabel(line)] = matrixNumber(row.stages[stageByPartCode.get(line.partCode) || matrixStageLabel(line)]) + matrixStockQty(line.stock, "PCS", "qtyOnHand");
      else if (line.category === "COMPONENT_FG") { row.fgOnHand += matrixStockQty(line.stock, "PCS", "qtyOnHand"); row.fgReserved += matrixStockQty(line.stock, "PCS", "qtyReserved"); row.fgFree += matrixStockQty(line.stock, "PCS", "qtyAvailable"); }
    }
    const rows = [...grouped.values()].sort((a, b) => a.rank - b.rank || a.partNumber.localeCompare(b.partNumber, "id", { numeric: true }));
    const findRow = (collection, partCode) => collection.find((row) => row.key === rowKeyByPartCode.get(partCode));
    let stateRows = cloneMatrixRows(rows);
    const phaseViews = [];
    for (const phase of simulation.phases || []) {
      const before = cloneMatrixRows(stateRows);
      const plan = cloneMatrixRows(rows).map((row) => ({ ...row, materialOnHand: 0, materialReserved: 0, materialQC: 0, materialFree: 0, inbound: 0, stages: Object.fromEntries(stages.map((stage) => [stage, 0])), fgOnHand: 0, fgReserved: 0, fgFree: 0, sources: {} }));
      for (const purchase of phase.afterRows || []) {
        const row = findRow(plan, purchase.partCode); if (!row || matrixNumber(purchase.purchaseReceiptQty) <= 0) continue;
        row.inbound += matrixNumber(purchase.purchaseReceiptQty); row.sources.inbound = "MRP";
      }
      for (const production of phase.productionRows || []) {
        const qty = matrixNumber(production.plannedProductionQty); if (qty <= 0) continue;
        const row = findRow(plan, production.partCode); if (!row) continue;
        const stage = stageByPartCode.get(production.partCode) || (production.processes || []).at(-1);
        if (production.itemKind === "Component FG") { row.fgOnHand += qty; row.sources.fgOnHand = "MPS"; }
        else if (stage && Object.prototype.hasOwnProperty.call(row.stages, stage)) { row.stages[stage] += qty; row.sources[`stage:${stage}`] = "MPS"; }
      }
      if (matrixNumber(phase.mpsProductionQty) > 0) { const planRoot = plan.find((row) => row.key === root.key); planRoot.fgOnHand += matrixNumber(phase.mpsProductionQty); planRoot.sources.fgOnHand = "MPS"; }
      const afterPurchase = cloneMatrixRows(before);
      for (const purchase of phase.afterRows || []) {
        const row = findRow(afterPurchase, purchase.partCode); const qty = matrixNumber(purchase.purchaseReceiptQty); if (!row || qty <= 0) continue;
        row.materialOnHand += qty; row.materialFree += qty; row.sources.materialOnHand = "MRP"; row.sources.materialFree = "MRP";
      }
      const afterProduction = cloneMatrixRows(afterPurchase);
      for (const purchase of phase.afterRows || []) {
        const row = findRow(afterProduction, purchase.partCode); const used = matrixNumber(purchase.grossRequirement); if (!row || used <= 0) continue;
        row.materialOnHand = Math.max(row.materialOnHand - used, 0); row.materialFree = Math.max(row.materialFree - used, 0);
        row.sources.materialOnHand = "MPS"; row.sources.materialFree = "MPS";
      }
      for (const production of phase.productionRows || []) {
        const row = findRow(afterProduction, production.partCode); const used = matrixNumber(production.grossRequirement); if (!row || used <= 0) continue;
        const stage = stageByPartCode.get(production.partCode) || (production.processes || []).at(-1);
        if (production.itemKind === "Component FG") { row.fgOnHand = Math.max(row.fgOnHand - used, 0); row.fgFree = Math.max(row.fgFree - used, 0); row.sources.fgOnHand = "MPS"; row.sources.fgFree = "MPS"; }
        else if (stage && Object.prototype.hasOwnProperty.call(row.stages, stage)) { row.stages[stage] = Math.max(matrixNumber(row.stages[stage]) - used, 0); row.sources[`stage:${stage}`] = "MPS"; }
      }
      const afterRoot = afterProduction.find((row) => row.key === root.key); afterRoot.fgOnHand += matrixNumber(phase.mpsProductionQty); afterRoot.fgFree += matrixNumber(phase.mpsProductionQty); afterRoot.sources.fgOnHand = "MPS"; afterRoot.sources.fgFree = "MPS";
      const carry = cloneMatrixRows(afterProduction); const carryRoot = carry.find((row) => row.key === root.key); const delivery = matrixNumber(phase.fgQty); carryRoot.fgOnHand = Math.max(carryRoot.fgOnHand - delivery, 0); carryRoot.fgFree = Math.max(carryRoot.fgFree - delivery, 0); carryRoot.sources = {};
      phaseViews.push({ phase, before, plan, afterPurchase, afterProduction }); stateRows = carry;
    }
    return { stages, phases: phaseViews };
  }
  function matrixQty(value, uomCode, grossWeight = 0, showZero = false) {
    const qty = matrixNumber(value); const uom = String(uomCode || "PCS").toUpperCase();
    if (!showZero && Math.abs(qty) < .000001) return "-";
    const primary = `${num(qty)} ${esc(uom)}`;
    return uom === "KG" && matrixNumber(grossWeight) > 0 ? `${primary}<small>≈ ${num(qty / grossWeight)} PCS</small>` : primary;
  }
  function matrixCell(row, field, value, uom, mode, grossWeight = 0, previousValue = null, inlineState = null) {
    const current = matrixNumber(value); const previous = previousValue == null ? null : matrixNumber(previousValue);
    const difference = previous == null ? 0 : current - previous;
    const changed = previous != null && Math.abs(difference) > .000001;
    const source = row.sources?.[field]; const active = current > .000001;
    const classes = [
      source && (mode === "plan" || changed) ? `source-${source.toLowerCase()}` : "",
      mode === "plan" && source && active ? "needs-action" : "",
      changed ? (difference > 0 ? "mwb-delta-up" : "mwb-delta-down") : "",
    ].filter(Boolean).join(" ");
    const delta = changed
      ? `<small class="mwb-cell-delta ${difference > 0 ? "up" : "down"}">Δ ${difference > 0 ? "+" : ""}${num(difference)} ${esc(String(uom || "PCS").toUpperCase())}</small>`
      : mode === "plan" && source && active
        ? `<small class="mwb-cell-delta plan">Rencana ${num(current)} ${esc(String(uom || "PCS").toUpperCase())}</small>`
        : "";
    return `<td class="${classes}">${inlineState ? `<span class="mwb-inline-state ${inlineState.key}" title="${esc(inlineState.copy)}">${esc(inlineState.label)}</span>` : ""}${matrixQty(current, uom, grossWeight)}${delta}${source && (mode === "plan" || changed) ? `<em>${esc(source)}</em>` : ""}</td>`;
  }
  function horizontalTotal(row, mode) {
    const material = mode === "plan" ? row.inbound : row.materialOnHand;
    const materialPcs = row.materialUom === "KG" ? (row.grossWeight > 0 ? material / row.grossWeight : 0) : material;
    const pcs = materialPcs + Object.values(row.stages).reduce((sum, value) => sum + matrixNumber(value), 0) + matrixNumber(row.fgOnHand);
    const extra = row.materialUom === "KG" && row.grossWeight <= 0 && material > 0 ? ` + ${num(material)} KG` : "";
    return `${num(pcs)} PCS${extra}`;
  }
  function matrixTotalClasses(row, mode) {
    if (mode !== "plan") return "mwb-horizontal-total";
    const sources = [...new Set(Object.values(row.sources || {}))];
    const sourceClass = sources.length === 1 ? ` source-${String(sources[0]).toLowerCase()}` : "";
    return `mwb-horizontal-total${sources.length ? ` needs-action${sourceClass}` : ""}`;
  }
  function renderComparisonRow(row, previousRow, state, stages, showIdentity = false) {
    const mode = state.mode;
    const value = (field) => field.startsWith("stage:") ? row.stages[field.slice(6)] : row[field];
    const previous = (field) => previousRow == null ? null : field.startsWith("stage:") ? previousRow.stages[field.slice(6)] : previousRow[field];
    const totalClass = matrixTotalClasses(row, mode);
    const identity = showIdentity ? `<td class="mwb-matrix-identity" rowspan="4"><b>${esc(row.partNumber)}</b></td><td class="mwb-matrix-code" rowspan="4">${esc(row.partCode)}</td><td class="mwb-matrix-name" rowspan="4">${esc(row.partName)}</td>` : "";
    return `<tr class="mwb-state-row ${state.key}">${identity}${matrixCell(row, "materialOnHand", value("materialOnHand"), row.materialUom, mode, row.grossWeight, previous("materialOnHand"), state)}${matrixCell(row, "materialReserved", value("materialReserved"), row.materialUom, mode, row.grossWeight, previous("materialReserved"))}${matrixCell(row, "materialQC", value("materialQC"), row.materialUom, mode, row.grossWeight, previous("materialQC"))}${matrixCell(row, "materialFree", value("materialFree"), row.materialUom, mode, row.grossWeight, previous("materialFree"))}${matrixCell(row, "inbound", value("inbound"), row.materialUom, mode, row.grossWeight, previous("inbound"))}${stages.map((stage) => matrixCell(row, `stage:${stage}`, value(`stage:${stage}`), "PCS", mode, 0, previous(`stage:${stage}`))).join("")}${matrixCell(row, "fgOnHand", value("fgOnHand"), "PCS", mode, 0, previous("fgOnHand"))}${matrixCell(row, "fgReserved", value("fgReserved"), "PCS", mode, 0, previous("fgReserved"))}${matrixCell(row, "fgFree", value("fgFree"), "PCS", mode, 0, previous("fgFree"))}<td class="${totalClass}">${esc(horizontalTotal(row, mode))}</td></tr>`;
  }
  function renderPhaseComparisonMatrix(view, stages) {
    const states = [
      { key: "before", label: "BEFORE", copy: "Stock awal", rows: view.before, mode: "stock", compare: null },
      { key: "plan", label: "PLAN", copy: "Aksi MRP / MPS", rows: view.plan, mode: "plan", compare: null },
      { key: "after-mrp", label: "AFTER MRP", copy: "Setelah purchase", rows: view.afterPurchase, mode: "stock", compare: view.before },
      { key: "after-mps", label: "AFTER MPS", copy: "Setelah produksi", rows: view.afterProduction, mode: "stock", compare: view.afterPurchase },
    ];
    const keys = view.before.map((row) => row.key);
    const indexes = new Map(states.map((state) => [state.key, new Map(state.rows.map((row) => [row.key, row]))]));
    const body = keys.flatMap((key) => states.map((state, stateIndex) => {
      const row = indexes.get(state.key).get(key); const previousRow = state.compare?.find((item) => item.key === key) || null;
      return renderComparisonRow(row, previousRow, state, stages, stateIndex === 0);
    })).join("");
    const headers = ["P/N", "Part Code", "Part Name", "Material", "Reserved / Allocated", "QC Hold", "Material Free", "MRP Purchase / Inbound", ...stages, "FG On Hand / Plan", "FG Reserved", "FG Free", "Total Physical (PCS)"];
    return `<div class="mwb-matrix-scroll"><table class="mwb-matrix-table mwb-comparison-table inventory-shape" data-enterprise-table="off"><thead><tr class="mwb-group-head"><th colspan="8"></th>${stages.length ? `<th colspan="${stages.length}">WIP · perubahan per kondisi</th>` : ""}<th colspan="3">Finished Goods</th><th>Horizontal Total</th></tr><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}" class="mwb-matrix-empty">Belum ada data matrix.</td></tr>`}</tbody></table></div>`;
  }
  function renderPhaseFlowCard(view, stages) {
    const { phase, before, plan, afterPurchase, afterProduction } = view;
    const buffer = phase.isBuffer || phase.sourceType === "BUFFER";
    const title = buffer ? "Prepare stock awal bulan depan" : `${label(phase.sourceType)} · ${phase.sourceNumber || "—"}`;
    const description = buffer
      ? `FCC ${phase.nextForecastMonth} ${num(phase.bufferBaseQty)} × ${num(phase.bufferPercent)}% = target ${num(phase.bufferTargetQty)} PCS · FG selesai ${date(phase.fgRequiredDate)} · tanpa delivery keluar`
      : `${phase.customerCode || "MULTI"} · delivery ${num(phase.fgQty)} PCS · MPS production ${num(phase.mpsProductionQty)} PCS · finish ${date(phase.fgRequiredDate)}`;
    return `<article class="mwb-phase-card${buffer ? " buffer" : ""}"><header><div><span class="mwb-phase-number">${buffer ? "BUFFER PHASE" : `PHASE ${num(phase.sequence)}`}</span><h4>${esc(title)}</h4><p>${esc(description)}</p></div><span class="mwb-phase-table-count">1 matrix · 4 kondisi</span></header><div class="mwb-phase-flow"><section class="mwb-matrix-card comparison"><div class="mwb-matrix-title"><span>COMPARE</span><div><h5>Before → Plan → After MRP → After MPS</h5><p>Δ menunjukkan perubahan dari kondisi sebelumnya. Merah pada PLAN berarti perlu aksi beli atau produksi.</p></div></div>${renderPhaseComparisonMatrix(view, stages)}</section></div></article>`;
  }
  function renderPhaseSimulation(item) {
    const simulation = item.phasePurchaseSimulation;
    if (!simulation) return "";
    if (!simulation.available) return `<section class="mwb-section mwb-phase-simulation"><div class="mwb-simulation-head"><div><span>PHASE SIMULATION</span><h3>Forecast/SO → MPS → MRP</h3></div></div><div class="mwb-simulation-unavailable">${esc(simulation.message || "Simulasi belum tersedia.")}</div></section>`;
    const model = buildPhaseMatrixModel(simulation);
    const customerPhaseCount = simulation.phases.filter((phase) => !phase.isBuffer).length;
    const bufferPhaseCount = simulation.phases.length - customerPhaseCount;
    return `<section class="mwb-section mwb-phase-simulation"><div class="mwb-simulation-head"><div><span>PHASE STOCK FLOW</span><h3>${num(customerPhaseCount)} customer phase + ${num(bufferPhaseCount)} buffer phase · ${num(model.phases.length)} matrix</h3><p>Setiap phase memakai satu matrix dengan empat kondisi · ${esc(simulation.mrpRunNumber)} · detail dimuat saat netting dibuka</p></div><div class="mwb-simulation-rule"><b>Urutan per phase</b><span>Before → Plan → After MRP → After MPS → delivery → phase berikutnya</span></div></div><div class="mwb-phase-legend"><span class="mps">MPS / Production</span><span class="mrp">MRP / Purchase</span><span class="buffer">Buffer / opening next month</span><span class="action">Merah = harus produksi atau beli</span></div><p class="mwb-simulation-note"><b>Asumsi:</b> ${esc(simulation.assumption)}<br><b>MOQ:</b> Dinonaktifkan—purchase mengikuti net MRP aktual.</p><div class="mwb-phase-list">${model.phases.map((view) => renderPhaseFlowCard(view, model.stages)).join("")}</div></section>`;
  }
  function setDrawerZoom(value) {
    state.zoom = Math.min(1.4, Math.max(.7, Math.round(value * 10) / 10));
    els.drawer.style.setProperty("--mwb-drawer-zoom", state.zoom);
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    els.zoomOut.disabled = state.zoom <= .7;
    els.zoomIn.disabled = state.zoom >= 1.4;
  }
  function toggleDrawerFullscreen(force) {
    state.drawerFullscreen = typeof force === "boolean" ? force : !state.drawerFullscreen;
    els.drawer.classList.toggle("fullscreen", state.drawerFullscreen);
    els.fullscreen.setAttribute("aria-pressed", String(state.drawerFullscreen));
    els.fullscreen.textContent = state.drawerFullscreen ? "Keluar fullscreen" : "Fullscreen";
  }
  function renderDetail(item) {
    const m = item.metrics; els.drawerTitle.textContent = item.partNumber || item.partCode; els.drawerMeta.textContent = `${item.partName || item.partCode} · ${item.mpsNumber} · ${label(item.status)}`;
    const stocks = item.stockLines.map((r) => `<tr><td>${esc(r.warehouseCode)} / ${esc(r.rackCode || "—")}</td><td>${esc(r.lotNumber || "Tanpa lot")}</td><td>${num(r.qtyOnHand)}</td><td>${num(r.qtyReserved)}</td><td>${num(r.qtyQC)}</td><td><b>${num(r.qtyAvailable)}</b></td></tr>`);
    const reservations = item.reservations.map((r) => `<tr><td>${esc(r.reservationNumber)}</td><td>${esc(r.referenceType)} / ${esc(r.referenceNumber)}</td><td>${num(r.remainingQty)}</td><td>${num(r.nettableQty)}</td><td>${num(r.protectedQty)}</td><td>${r.peggedToCurrentDemand ? '<b style="color:#8059c6">Pegged sebagian/penuh</b>' : "Dilindungi"}</td></tr>`);
    const receipts = item.receipts.map((r) => `<tr><td>${date(r.date)}</td><td>${esc(r.moNumber)}</td><td>${esc(r.status)}</td><td>${num(r.qty)}</td><td>${r.assumedDate ? "Asumsi awal bucket" : "Tanggal MO"}</td></tr>`);
    const phases = [...item.phases, ...(item.bufferPhase ? [item.bufferPhase] : [])].map((r) => `<tr class="${r.sourceType === "BUFFER" ? "mwb-buffer-row" : ""}"><td>${date(r.fgRequiredDate)}</td><td>${r.sourceType === "BUFFER" ? "Tidak dikirim" : date(r.targetDeliveryDate)}</td><td>${esc(r.sourceType)}</td><td>${esc(r.sourceNumber)}</td><td>${r.sourceType === "BUFFER" ? "Akhir bulan" : r.phaseNumber}</td><td>${num(r.sourceType === "BUFFER" ? r.bufferTargetQty : r.qty)}</td></tr>`);
    const ledger = item.ledger.map((r) => `<tr><td>${date(r.eventDate)}</td><td>${esc(label(r.eventType))}<br><small>${esc(r.reference || "")}</small></td><td>${num(r.reservedUsedQty)}</td><td>${num(r.freeUsedQty)}</td><td>${num(r.plannedProductionQty || r.qtyIn)}</td><td>${num(r.qtyOut)}</td><td>${num(r.projectedFreeQty)}</td><td class="${r.uncoveredQty > 0 ? "SHORTAGE" : ""}">${esc(r.formula || r.note || "")}</td></tr>`);
    els.drawerBody.innerHTML = `<div class="mwb-detail-grid"><article><span>Physical on hand</span><b>${num(m.onHandQty)} ${esc(item.uomCode || "")}</b></article><article><span>Free FG</span><b>${num(m.freeOpeningQty)}</b></article><article><span>Pegged SO reservation</span><b>${num(m.peggedReservationQty)}</b></article><article><span>Protected reservation</span><b>${num(m.otherReservationQty + m.unusedPeggedReservationQty)}</b></article><article><span>Gross demand</span><b>${num(m.grossDemandQty)}</b></article><article class="buffer"><span>FCC ${esc(item.nextForecastMonth)}</span><b>${num(item.bufferBaseQty)} ${esc(item.uomCode || "")}</b></article><article class="buffer"><span>Buffer ${num(item.bufferPercent)}%</span><b>${num(item.bufferQty)} · selesai ${date(item.bufferTargetDate)}</b></article><article><span>Firm receipt</span><b>${num(m.firmReceiptQty)}</b></article><article><span>Net production</span><b>${num(m.plannedProductionQty)}</b></article><article><span>Official ending</span><b>${num(m.officialProjectedEndingQty)}</b></article></div><section class="mwb-section"><h3>Formula yang berlaku</h3><div class="mwb-formulas"><code>Buffer akhir ${esc(item.mpsNumber)} = ${num(item.bufferBaseQty)} FCC ${esc(item.nextForecastMonth)} × ${num(item.bufferPercent)}% ${item.bufferSource === "OVERRIDE" ? "override" : "master part"} = ${num(item.bufferQty)} ${esc(item.uomCode || "")}; target FG selesai ${date(item.bufferTargetDate)}</code><code>Opening nettable = ${num(m.freeOpeningQty)} free FG + ${num(m.peggedReservationQty)} pegged SO = ${num(m.openingNettableQty)}</code><code>${esc(item.formula.phaseNetting)}</code><code>${esc(item.formula.ending)}</code></div></section>${renderPhaseSimulation(item)}<section class="mwb-section"><h3>Chronological netting ledger</h3>${miniTable(["Tanggal","Event / Ref","Pegged","Free/Receipt","Production","Demand","Projected","Runtutan"], ledger)}</section><section class="mwb-section"><h3>Customer delivery &amp; buffer FG finish</h3>${miniTable(["FG required","Delivery","Source","Nomor","Phase","Qty"], phases)}</section><section class="mwb-section"><h3>FG stock per warehouse / lot</h3>${miniTable(["Warehouse / Rack","Lot","On hand","Reserved","QC","Free"], stocks)}</section><section class="mwb-section"><h3>Active reservation</h3><p>Reference SO harus cocok dan qty nettable dibatasi outstanding demand; sisanya tetap protected.</p>${miniTable(["Reservation","Reference","Remaining","Nettable","Protected","Perlakuan"], reservations)}</section><section class="mwb-section"><h3>Firm scheduled receipts</h3>${miniTable(["Due","MO","Status","Remaining","Sumber tanggal"], receipts)}</section><section class="mwb-section"><h3>Persisted calculation trace</h3><pre class="mwb-trace">${esc(JSON.stringify(item.calculationTrace, null, 2))}</pre></section>`;
    els.drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => els.drawer.querySelector(".mwb-drawer-panel")?.focus());
  }
  async function openDetail(item) {
    const requestId = ++state.detailRequestId;
    els.drawerTitle.textContent = item.partNumber || item.partCode;
    els.drawerMeta.textContent = `${item.partName || item.partCode} · menyiapkan phase matrix…`;
    els.drawerBody.innerHTML = '<div class="mwb-detail-loading"><span></span><b>Mengambil stock, BOM, MPS, dan MRP per phase…</b><small>Data berat baru dimuat saat netting dibuka.</small></div>';
    els.drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => els.drawer.querySelector(".mwb-drawer-panel")?.focus());
    const params = new URLSearchParams({ month: els.month.value || config.initialMonth, page: "1", pageSize: "10", detailId: item.id, includeSimulation: "true" });
    try {
      const payload = await request(`${apiBase}/workbench?${params}`);
      if (requestId !== state.detailRequestId || els.drawer.getAttribute("aria-hidden") === "true") return;
      renderDetail(payload.items?.find((row) => row.id === item.id) || item);
    } catch (error) {
      if (requestId !== state.detailRequestId) return;
      els.drawerBody.innerHTML = `<div class="mwb-detail-error"><b>Netting belum dapat dimuat.</b><span>${esc(error.message)}</span><button type="button" data-retry-detail>Ulangi</button></div>`;
      els.drawerBody.querySelector("[data-retry-detail]")?.addEventListener("click", () => openDetail(item));
    }
  }
  function closeDrawer() { state.detailRequestId += 1; els.drawer.setAttribute("aria-hidden", "true"); toggleDrawerFullscreen(false); }
  function openModal() { els.confirm.checked = false; els.modalMessage.textContent = `Periode ${els.month.value}: sistem akan menarik semua Forecast/SO aktif, memakai delivery/FG finish phase, lalu menghitung ulang Draft MPS kanonis.`; els.modal.setAttribute("aria-hidden", "false"); }
  function closeModal() { els.modal.setAttribute("aria-hidden", "true"); }
  function openActionModal(action) {
    const mps = state.data?.mps;
    if (!mps) return showAlert("MPS periode ini belum ada.");
    state.action = action;
    els.actionConfirm.checked = false;
    if (action === "confirm") {
      els.actionTitle.textContent = "Konfirmasi MPS";
      els.actionDescription.textContent = "Kunci hasil netting FG sebagai sumber resmi MRP tanpa refresh halaman.";
      els.actionMessage.textContent = `${mps.mpsNumber} akan berubah dari Draft menjadi Confirmed. Sistem akan memeriksa kesiapan routing dan UOM terlebih dahulu.`;
      els.actionConfirmCopy.textContent = "Saya sudah mengaudit demand, stock, reservasi, firm receipt, dan variance pada MPS ini.";
      els.actionSubmit.textContent = "Konfirmasi MPS";
    } else {
      els.actionTitle.textContent = state.data.mrp ? "Jalankan Ulang MRP" : "Jalankan MRP";
      els.actionDescription.textContent = "Explode BOM, lakukan time-phased netting, lalu bentuk planned order resmi.";
      els.actionMessage.textContent = `${mps.mpsNumber} akan dipakai untuk Month-End MRP periode ${state.data.period}. Run baru menjadi current revision dan tetap dapat ditelusuri dari cockpit.`;
      els.actionConfirmCopy.textContent = "Saya memahami MRP baru dapat menggantikan current plan dan planned order dari revision sebelumnya.";
      els.actionSubmit.textContent = state.data.mrp ? "Jalankan Ulang MRP" : "Jalankan MRP";
    }
    els.actionModal.setAttribute("aria-hidden", "false");
  }
  function closeActionModal() { els.actionModal.setAttribute("aria-hidden", "true"); state.action = null; }
  els.body.addEventListener("click", (event) => { const button = event.target.closest("[data-detail]"); if (!button) return; event.preventDefault(); const item = state.data?.items.find((row) => row.id === button.dataset.detail); if (item) openDetail(item); });
  els.modalForm.addEventListener("submit", async (event) => { event.preventDefault(); if (!els.confirm.checked) return; els.modalSubmit.disabled = true; els.modalSubmit.textContent = "Menghitung…"; try { const result = await request(`${apiBase}/monthly-sync`, { method: "POST", body: JSON.stringify({ months: [els.month.value], planningAnchorMonth: els.month.value }) }); closeModal(); showAlert(result.message || "Draft MPS berhasil dihitung.", true); await load({ resetPage: true, quiet: true }); } catch (error) { showAlert(error.message); } finally { els.modalSubmit.disabled = false; els.modalSubmit.textContent = "Hitung & simpan Draft"; } });
  els.actionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!els.actionConfirm.checked || !state.action || !state.data?.mps) return;
    const action = state.action;
    const originalLabel = els.actionSubmit.textContent;
    els.actionSubmit.disabled = true;
    els.actionSubmit.textContent = action === "confirm" ? "Mengonfirmasi…" : "Menjalankan MRP…";
    try {
      const mpsNumber = state.data.mps.mpsNumber;
      const result = action === "confirm"
        ? await request(`${apiBase}/${encodeURIComponent(mpsNumber)}/confirm`, { method: "PATCH", body: "{}" })
        : await request("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ mpsNumber }) });
      closeActionModal();
      showAlert(action === "confirm" ? `${result.mpsNumber || mpsNumber} berhasil dikonfirmasi. MRP sekarang dapat dijalankan.` : `${result.runNumber || "MRP"} berhasil dijalankan.`, true);
      await load({ resetPage: true, quiet: true });
    } catch (error) {
      showAlert(error.message);
    } finally {
      els.actionSubmit.disabled = false;
      els.actionSubmit.textContent = originalLabel;
    }
  });
  els.zoomOut.addEventListener("click", () => setDrawerZoom(state.zoom - .1));
  els.zoomIn.addEventListener("click", () => setDrawerZoom(state.zoom + .1));
  els.zoomLabel.addEventListener("click", () => setDrawerZoom(1));
  els.fullscreen.addEventListener("click", () => toggleDrawerFullscreen());
  setDrawerZoom(1);
  els.sync.addEventListener("click", openModal); els.confirmMps.addEventListener("click", () => openActionModal("confirm")); els.runMrp.addEventListener("click", () => openActionModal("mrp")); document.querySelectorAll("[data-close-modal]").forEach((node) => node.addEventListener("click", closeModal)); document.querySelectorAll("[data-close-action-modal]").forEach((node) => node.addEventListener("click", closeActionModal)); document.querySelectorAll("[data-close-drawer]").forEach((node) => node.addEventListener("click", closeDrawer));
  els.month.addEventListener("change", () => { $("mwb-review-link").href = `/modules/planning-ppic/demand-planning/monthly-review?month=${encodeURIComponent(els.month.value)}`; $("mwb-exception-link").href = `/modules/planning-ppic/demand-planning/exception-workbench?month=${encodeURIComponent(els.month.value)}`; load({ resetPage: true }); }); els.status.addEventListener("change", () => load({ resetPage: true })); els.pageSize.addEventListener("change", () => { state.pageSize = Number(els.pageSize.value) || 25; load({ resetPage: true }); }); let timer; els.search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load({ resetPage: true }), 320); });
  els.prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } }); els.next.addEventListener("click", () => { if (state.data && state.page < state.data.pagination.pages) { state.page += 1; load(); } }); els.density.addEventListener("click", () => { const comfortable = els.board.classList.toggle("comfortable"); els.density.textContent = comfortable ? "Compact view" : "Comfortable view"; });
  els.export.addEventListener("click", () => { const rows = state.data?.items || []; if (!rows.length) return showAlert("Tidak ada data pada halaman ini untuk diexport."); const columns = ["MPS","Part Code","Part Number","Part Name","Status","Gross Demand","Next Month Forecast","Buffer Percent","Buffer Qty","Buffer FG Finish","Free FG","Pegged SO","Firm Receipt","Net Production","Official Ending","Uncovered","UOM"]; const csv = [columns, ...rows.map((r) => [r.mpsNumber,r.partCode,r.partNumber,r.partName,r.status,r.metrics.grossDemandQty,r.bufferBaseQty,r.bufferPercent,r.bufferQty,r.bufferTargetDate,r.metrics.freeOpeningQty,r.metrics.peggedReservationQty,r.metrics.firmReceiptQty,r.metrics.plannedProductionQty,r.metrics.officialProjectedEndingQty,r.metrics.uncoveredQty,r.uomCode])].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `mps-netting-${els.month.value}.csv`; link.click(); URL.revokeObjectURL(link.href); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeDrawer(); closeModal(); closeActionModal(); } }); load();
})();
