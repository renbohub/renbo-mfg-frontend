(() => {
  "use strict";
  const deliveryStatus = window.MpsDeliveryStatus;
  const recoveryActions = window.MpsRecoveryActions;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const config = JSON.parse(document.getElementById("mwb-page-config")?.textContent || "{}");
  const $ = (id) => document.getElementById(id);
  const els = { month: $("mwb-month"), status: $("mwb-status"), search: $("mwb-search"), pageSize: $("mwb-page-size"), sync: $("mwb-sync"), confirmMps: $("mwb-confirm-mps"), runMrp: $("mwb-run-mrp"), export: $("mwb-export"), body: $("mwb-body"), alert: $("mwb-alert"), sourceTitle: $("mwb-source-title"), sourceMeta: $("mwb-source-meta"), title: $("mwb-title"), meta: $("mwb-result-meta"), range: $("mwb-range"), prev: $("mwb-prev"), next: $("mwb-next"), pageLabel: $("mwb-page-label"), drawer: $("mwb-drawer"), drawerTitle: $("mwb-drawer-title"), drawerMeta: $("mwb-drawer-meta"), drawerBody: $("mwb-drawer-body"), zoomOut: $("mwb-zoom-out"), zoomIn: $("mwb-zoom-in"), zoomLabel: $("mwb-zoom-label"), fullscreen: $("mwb-fullscreen"), modal: $("mwb-modal"), modalForm: $("mwb-modal-form"), modalEyebrow: $("mwb-modal-eyebrow"), modalTitle: $("mwb-modal-title"), modalCopy: $("mwb-modal-copy"), modalMessage: $("mwb-modal-message"), modalSubmit: $("mwb-modal-submit"), confirm: $("mwb-confirm"), actionModal: $("mwb-action-modal"), actionForm: $("mwb-action-form"), actionTitle: $("mwb-action-title"), actionDescription: $("mwb-action-description"), actionMessage: $("mwb-action-message"), actionConfirm: $("mwb-action-confirm"), actionConfirmCopy: $("mwb-action-confirm-copy"), actionSubmit: $("mwb-action-submit"), formulaModal: $("mwb-formula-modal"), formulaTitle: $("mwb-formula-title"), formulaMeta: $("mwb-formula-meta"), formulaBody: $("mwb-formula-body"), bufferModal: $("mwb-buffer-modal"), bufferForm: $("mwb-buffer-form"), bufferPart: $("mwb-buffer-part"), bufferPercent: $("mwb-buffer-percent"), bufferMessage: $("mwb-buffer-message"), bufferSubmit: $("mwb-buffer-submit"), rccpModal: $("mwb-rccp-modal"), rccpMeta: $("mwb-rccp-meta"), rccpResults: $("mwb-rccp-results"), rccpSummary: $("mwb-rccp-summary"), rccpOffsetWarning: $("mwb-rccp-offset-warning"), rccpWeekly: $("mwb-rccp-weekly"), rccpRecommendations: $("mwb-rccp-recommendations"), rccpTimeline: $("mwb-rccp-timeline"), rccpBody: $("mwb-rccp-body"), rccpReasonField: $("mwb-rccp-reason-field"), rccpReason: $("mwb-rccp-reason"), rccpExceptions: $("mwb-rccp-exceptions"), rccpActions: $("mwb-rccp-actions"), rowMenu: $("mwb-row-menu"), nextState: $("mwb-next-state"), flowMps: $("mwb-flow-mps"), flowGate: $("mwb-flow-gate"), flowMrp: $("mwb-flow-mrp"), nextTitle: $("mwb-next-title"), nextCopy: $("mwb-next-copy"), openMrp: $("mwb-open-mrp"), density: $("mwb-density"), board: document.querySelector(".mwb-board"), docStatus: $("mwb-doc-status"), actionNote: $("mwb-action-note") };
  Object.assign(els, { bulkAcceptLate: $("mwb-bulk-accept-late"), deliveryGateBadge: $("mwb-delivery-gate-badge"), deliveryGateReason: $("mwb-delivery-gate-reason"), deliveryGateDetails: $("mwb-delivery-gate-details"), gateDrawer: $("mwb-gate-drawer"), gateDrawerMeta: $("mwb-gate-drawer-meta"), gateDrawerBody: $("mwb-gate-drawer-body"), recoveryDrawer: $("mwb-recovery-drawer"), recoveryTitle: $("mwb-recovery-title"), recoveryMeta: $("mwb-recovery-meta"), recoveryMessage: $("mwb-recovery-message"), recoveryBody: $("mwb-recovery-body") });
  Object.assign(els, { baselineStatus: $("mwb-baseline-status"), baselineMeta: $("mwb-baseline-meta"), lockMps: $("mwb-lock-mps"), recalculate: $("mwb-recalculate"), planningModal: $("mwb-planning-modal"), planningTitle: $("mwb-planning-title"), planningMeta: $("mwb-planning-meta"), planningBody: $("mwb-planning-body"), planningConfirm: $("mwb-planning-confirm") });
  Object.assign(els, { feasibilityModal: $("mwb-feasibility-modal"), feasibilityTitle: $("mwb-feasibility-title"), feasibilityMeta: $("mwb-feasibility-meta"), feasibilityBody: $("mwb-feasibility-body"), feasibilityFooterMeta: $("mwb-feasibility-footer-meta") });
  els.month?.addEventListener("change", () => { const link = $("mwb-recovery-kanban"); if (link) link.href = `/modules/planning-ppic/mps/recovery-kanban?month=${encodeURIComponent(els.month.value)}`; });
  const stockGroupHeading = document.querySelector(".mwb-demand-table .stock-group");
  const stockColumnHeading = document.querySelector(".mwb-demand-table .mwb-sub-head th:nth-child(14)");
  if (stockGroupHeading) stockGroupHeading.textContent = "Usable Stock";
  if (stockColumnHeading) { stockColumnHeading.textContent = "Usable"; stockColumnHeading.title = "qtyAvailable; rincian On Hand, Reserved, Allocated, QC Hold, dan Blocked ada di modal"; }
  const state = { page: 1, pageSize: 25, data: null, loading: false, action: null, rowItem: null, phaseAction: null, recoveryAction: null, recoveryPayload: null, recoverySourcePayload: null, recoveryBusy: false, bufferItem: null, rccpRun: null, planningPreview: null, planningMode: null, planningBusy: false, modalMode: "sync", zoom: 1, drawerFullscreen: false, detailRequestId: 0, expanded: new Set(), expandedBatches: new Set(), feasibilityLineId: null, feasibilityDetail: null, feasibilityFilter: "all", feasibilityOrigin: null };
  const apiBase = "/modules/api/planning-ppic/mps";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const signedNum = (value) => {
    const qty = number(value);
    if (Math.abs(qty) <= 0.000001) return "0";
    return `${qty > 0 ? "+" : "−"}${num(Math.abs(qty))}`;
  };
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const isoDate = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString().slice(0, 10) : "";
  const cappedFgFinish = (fgRequiredDate, targetDeliveryDate) => {
    if (!fgRequiredDate || !targetDeliveryDate) return fgRequiredDate;
    return new Date(fgRequiredDate) > new Date(targetDeliveryDate) ? targetDeliveryDate : fgRequiredDate;
  };
  const enforceFgFinishCap = (data) => {
    for (const item of data?.items || []) {
      item.onHandStockQty = item.currentStockQty;
      item.currentStockQty = item.availableStockQty;
      for (const phase of item.phases || []) phase.fgRequiredDate = cappedFgFinish(phase.fgRequiredDate, phase.targetDeliveryDate);
      for (const phase of item.phasePurchaseSimulation?.phases || []) phase.fgRequiredDate = cappedFgFinish(phase.fgRequiredDate, phase.targetDeliveryDate);
    }
    return data;
  };
  const dateRange = (start, end) => `${date(start)} – ${date(end)}`;
  const label = (value) => String(value || "—").replaceAll("_", " ");
  const assessmentMeta = {
    FEASIBLE: { label: "Feasible", icon: "✓", tone: "success" },
    FEASIBLE_WITH_RISK: { label: "Feasible dengan Risiko", icon: "!", tone: "warning" },
    NOT_FEASIBLE: { label: "Tidak Feasible", icon: "×", tone: "danger" },
    NOT_EVALUATED: { label: "Belum Dievaluasi", icon: "?", tone: "neutral" },
    NA: { label: "Tidak Berlaku", icon: "—", tone: "muted" },
  };
  const assessmentStatus = (value) => assessmentMeta[String(value || "").toUpperCase()] || assessmentMeta.NOT_EVALUATED;
  const assessmentSummary = (assessment = {}) => assessment.summary || assessment.checklistSummary || assessment;
  const assessmentBadge = (assessment = {}) => {
    const summary = assessmentSummary(assessment); const meta = assessmentStatus(summary.status);
    const subtext = summary.primaryConstraint?.impact || summary.primaryConstraint?.label || (summary.status === "NOT_EVALUATED" ? `${num(summary.notCheckedCount)} parameter belum dicek` : "");
    return `<span class="mwb-feasibility-status ${meta.tone}" title="${esc(subtext || meta.label)}"><span><i aria-hidden="true">${meta.icon}</i>${esc(meta.label)}</span>${subtext ? `<small>${esc(subtext)}</small>` : ""}</span>`;
  };
  const checklistCell = (assessment = {}, lineId = "") => {
    const summary = assessmentSummary(assessment); const meta = assessmentStatus(summary.status);
    lineId = lineId || summary.lineId || "";
    if (!lineId && !summary.totalCount) return '<span class="mwb-dash">—</span>';
    const counts = `${num(summary.failCount)} gagal · ${num(summary.warningCount)} risiko · ${num(summary.notCheckedCount)} belum dicek`;
    return `<button type="button" class="mwb-checklist-summary ${meta.tone}" data-feasibility-line="${esc(lineId)}" title="${esc(counts)}" aria-label="Buka checklist kelayakan: ${num(summary.okCount)}/${num(summary.totalCount)} OK, ${esc(counts)}"><span><i aria-hidden="true">${meta.icon}</i><b>${num(summary.okCount)}/${num(summary.totalCount)} OK</b></span><small>${esc(counts)}</small></button>`;
  };
  const assessmentSummaryCell = (summary = {}) => {
    return checklistCell(summary, "__TOTAL__");
  };
  const leadTime = (value) => number(value) > 0 ? `${num(value)}d` : "—";
  const capacityTone = (status) => ({ FEASIBLE: "success", WARNING: "warning", OVERLOAD: "danger", OVERRIDDEN: "neutral", NOT_CHECKED: "muted", RUNNING: "info", INVALID: "muted" }[String(status || "").toUpperCase()] || "muted");
  const capacityBadge = (capacity = {}) => `<button class="mwb-capacity-link ${capacityTone(capacity.status)}" type="button" data-view-rccp="${esc(capacity.rccpRunId || "")}" ${capacity.rccpRunId ? "" : "disabled"}>${esc(label(capacity.status || "NOT_CHECKED"))}</button>`;
  const formulaButton = (kind, itemId, phaseId = "", partCode = "") => `<button class="mwb-formula-help" type="button" data-formula-kind="${esc(kind)}" data-item-id="${esc(itemId)}" data-phase-id="${esc(phaseId)}" data-part-code="${esc(partCode)}" aria-label="Lihat formula MPS Qty" title="Lihat formula MPS Qty">?</button>`;
  const mpsNumberCell = (value, kind, itemId, phaseId = "", partCode = "") => `<div class="mwb-mps-cell"><b>${num(value)}</b>${formulaButton(kind, itemId, phaseId, partCode)}</div>`;
  const planNumberCell = (item) => mpsNumberCell(item.planMetrics?.totalPlanQty ?? item.metrics?.plannedProductionQty, "root", item.id);
  const poDeltaCell = (item, locked) => {
    if (!locked) return '<td class="mwb-po-delta is-unlocked" title="Lock MPS untuk mulai memantau perubahan PO">—</td>';
    const qty = number(item.planMetrics?.poDeltaQty);
    const tone = qty > 0.000001 ? "is-positive" : qty < -0.000001 ? "is-negative" : "is-zero";
    return `<td class="mwb-po-delta ${tone}" title="PO aktif ${num(item.planMetrics?.currentPoQty)} − PO saat lock ${num(item.planMetrics?.lockedPoQty)}"><b>${signedNum(qty)}</b></td>`;
  };
  const actionButtonContent = (kind) => { const action = recoveryActions.actionButton(kind); return `<span aria-hidden="true">${esc(action.icon)}</span>${action.compact ? "" : `<b>${esc(action.label)}</b>`}`; };
  async function request(url, options = {}) { const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(payload.message || `Request gagal (${response.status}).`); error.payload = payload; error.code = payload.code; throw error; } return payload; }
  function showAlert(message, success = false) { els.alert.hidden = !message; els.alert.textContent = message || ""; els.alert.classList.toggle("success", success); }
  const checkMeta = {
    PASS: { label: "OK", icon: "✓", tone: "success" }, WARNING: { label: "Risiko", icon: "!", tone: "warning" },
    FAIL: { label: "Gagal", icon: "×", tone: "danger" }, NOT_CHECKED: { label: "Belum Dicek", icon: "?", tone: "neutral" },
    NA: { label: "Tidak Berlaku", icon: "—", tone: "muted" },
  };
  const checkStatusMeta = (value) => checkMeta[String(value || "NOT_CHECKED").toUpperCase()] || checkMeta.NOT_CHECKED;
  const displayMeasure = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value !== "object") return esc(value);
    if (value.display) return esc(value.display);
    if (value.value !== null && value.value !== undefined) return `${esc(value.value)}${value.unit ? ` ${esc(value.unit)}` : ""}`;
    return "—";
  };
  const displayDateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  function renderMpsCalculation(calc = {}) {
    const fields = [
      ["EFD M-1", calc.previousEfdQty], ["Delivered M-1", calc.previousDeliveredQty], ["Shortage M-1", calc.previousShortageQty],
      ["EFD M", calc.currentEfdQty], ["EFD M+1", calc.lookAheadEfdQty], ["Buffer Qty", calc.bufferQty],
      ["Gross Requirement", calc.grossRequirementQty], ["Usable Stock", calc.usableStockQty], ["Firm Receipt", calc.firmReceiptQty],
      ["Raw Net Requirement", calc.rawNetRequirementQty], ["Lot Rounding", calc.lotRoundingDeltaQty], ["Baseline MPS", calc.baselineMpsQty],
      ["Delta MPS", calc.deltaMpsQty], ["Approved Cut", calc.approvedCutQty], ["Final MPS Qty", calc.finalMpsQty],
    ];
    return `<section class="mwb-feasibility-section" id="mwb-feasibility-calculation"><header><div><small>MPS CALCULATION</small><h3>Rincian Perhitungan MPS</h3></div><span class="${calc.reconciled ? "success" : "danger"}">${calc.reconciled ? "Terekonsiliasi" : "Perlu rekonsiliasi"}</span></header><p class="mwb-feasibility-formula">${esc(calc.formula || "Formula authoritative MPS ledger")}</p><div class="mwb-calculation-grid">${fields.map(([name, raw]) => `<div><span>${esc(name)}</span><b>${raw === null || raw === undefined ? "—" : num(raw)}</b></div>`).join("")}</div></section>`;
  }
  function renderCheck(check = {}) {
    const meta = checkStatusMeta(check.status); const issue = check.status !== "PASS" && check.status !== "NA";
    const evidence = [...(check.evidence || []), ...(check.affectedEntities || []).map((entity) => ({ affectedEntity: entity })), ...(check.missingFields || []).map((field) => ({ missingField: field }))];
    return `<details class="mwb-feasibility-check ${meta.tone}" data-check-issue="${issue ? "1" : "0"}"><summary><span class="mwb-check-icon" aria-hidden="true">${meta.icon}</span><div><b>${esc(check.label)}</b><small>${esc(check.description || "")}</small></div>${check.critical ? '<em>Critical</em>' : ""}<strong>${meta.label}</strong></summary><div class="mwb-check-detail"><div class="mwb-check-values"><div><span>Requirement</span><b>${displayMeasure(check.requirement)}</b></div><div><span>Actual</span><b>${displayMeasure(check.actual)}</b></div><div><span>Gap</span><b>${displayMeasure(check.gap)}</b></div></div><p><b>Alasan:</b> ${esc(check.reason || "—")}</p><p><b>Rekomendasi:</b> ${esc(check.recommendation || "Tidak ada tindakan tambahan.")}</p>${evidence.length ? `<details class="mwb-check-evidence"><summary>Evidence &amp; sumber data (${evidence.length})</summary><pre>${esc(JSON.stringify(evidence, null, 2))}</pre></details>` : '<p class="mwb-no-evidence">Tidak ada evidence tambahan.</p>'}</div></details>`;
  }
  const checkpointDefinitions = [
    { name: "Master Data", dept: "PPIC", recovery: "Correct Master Data", codes: ["MASTER_DATA_READY", "LOT_BATCH_YIELD_VALID", "BUFFER_POLICY_MET"] },
    { name: "Production Capacity", dept: "Production", recovery: "Add Overtime / Change Production Line", codes: ["CAPACITY_AVAILABLE", "RESOURCE_CALENDAR_AVAILABLE", "ROUTING_SEQUENCE_VALID"] },
    { name: "Material Supply", dept: "Purchasing", recovery: "Expedite Material", codes: ["FG_COVERAGE_AT_DUE_DATE", "MATERIAL_READY_BY_START"] },
    { name: "Vendor Process", dept: "Purchasing", recovery: "Expedite Vendor", codes: ["FIRM_SUPPLY_ON_TIME", "QUALITY_RELEASE_READY"] },
    { name: "Delivery Schedule", dept: "Sales", recovery: "Change Delivery Target", codes: ["LEAD_TIME_AND_FINISH_FIT", "DELIVERY_SLOT_AVAILABLE"] },
  ];
  function checkpointRows(checks = []) {
    const rank = { FAIL: 3, NOT_CHECKED: 2, WARNING: 1, PASS: 0, NA: -1 };
    return checkpointDefinitions.map((definition) => {
      const details = definition.codes.map((code) => checks.find((check) => check.code === code)).filter(Boolean);
      const applicable = details.filter((check) => check.status !== "NA");
      const worst = [...applicable].sort((a, b) => (rank[b.status] ?? 2) - (rank[a.status] ?? 2))[0];
      const rawStatus = worst?.status || "PASS";
      const status = rawStatus === "FAIL" ? "NOT_OK" : ["WARNING", "NOT_CHECKED"].includes(rawStatus) ? "WARNING" : "OK";
      return { ...definition, details, status, recovery: status === "OK" ? "—" : definition.recovery, feedbackStatus: status === "OK" ? "—" : "Open" };
    });
  }
  function renderCheckpointTableLegacy(checks = []) {
    const rows = checkpointRows(checks); const okCount = rows.filter((row) => row.status === "OK").length; const openCount = rows.length - okCount;
    const overall = rows.some((row) => row.status === "NOT_OK") ? { label: "NOT FEASIBLE", tone: "danger", icon: "●" } : rows.some((row) => row.status === "WARNING") ? { label: "WARNING", tone: "warning", icon: "●" } : { label: "FEASIBLE", tone: "success", icon: "●" };
    const body = rows.map((row) => {
      const meta = row.status === "OK" ? { label: "OK", tone: "success", icon: "✓" } : row.status === "NOT_OK" ? { label: "Not OK", tone: "danger", icon: "●" } : { label: "Warning", tone: "warning", icon: "●" };
      const issue = row.status !== "OK";
      return `<details class="mwb-checkpoint-row ${meta.tone}" data-check-issue="${issue ? "1" : "0"}"><summary><span class="mwb-checkpoint-name">${esc(row.name)}</span><span class="mwb-checkpoint-status ${meta.tone}"><i>${meta.icon}</i>${meta.label}</span><span class="mwb-checkpoint-recovery">${esc(row.recovery)}</span><span class="mwb-checkpoint-feedback ${issue ? "open" : ""}">${esc(row.feedbackStatus)}</span><span class="mwb-checkpoint-dept">${esc(row.dept)}</span><i class="mwb-checkpoint-expand" aria-hidden="true">⌄</i></summary><div class="mwb-checkpoint-detail"><p>Detail parameter di balik checkpoint:</p>${row.details.map(renderCheck).join("") || '<span class="mwb-no-evidence">Tidak ada rule teknis yang berlaku.</span>'}</div></details>`;
    }).join("");
    return `<section class="mwb-feasibility-section mwb-checkpoint-section"><header><div><small>5 CHECKPOINT MPS</small><h3>Checklist Kelayakan &amp; Recovery</h3></div><a href="/modules/planning-ppic/mps/recovery-kanban?month=${encodeURIComponent(els.month.value)}">Buka Recovery Kanban →</a></header><div class="mwb-checkpoint-table"><div class="mwb-checkpoint-head"><span>Checkpoint</span><span>Status</span><span>Recovery</span><span>Feedback Status</span><span>Dept</span><i></i></div>${body}</div><footer class="mwb-checkpoint-summary ${overall.tone}"><b>MPS Status: <span>${overall.icon} ${overall.label}</span></b><strong>${okCount} / 5 Checkpoints OK</strong><strong>${openCount} Recovery Actions Open</strong></footer></section>`;
  }
  const issueReasons = (row) => row.details
    .filter((check) => !["PASS", "NA"].includes(String(check.status || "").toUpperCase()))
    .map((check) => check.reason || check.description)
    .filter(Boolean);
  const decisionTable = (headings, body) => `<div class="mwb-decision-table"><table><thead><tr>${headings.map((heading) => `<th>${esc(heading)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  function renderSupplierDecision(row, support = {}) {
    const rows = support.rows || [];
    const problem = rows.length
      ? `${rows.length} material shortage harus tiba paling lambat sesuai tanggal kebutuhan produksi.`
      : (issueReasons(row)[0] || "Tidak ada shortage supplier yang teridentifikasi.");
    const body = rows.length ? decisionTable(
      ["Material / Supplier", "Shortage", "Max Kedatangan", "Total Lead Time", "Supplier Lead Time", "Proses Internal", "Solusi"],
      rows.map((item) => `<tr><td><b>${esc(item.partCode || "—")}</b><small>${esc(item.supplierName || item.supplierCode || "Supplier belum dipilih")}</small></td><td>${num(item.shortageQty)} ${esc(item.uomCode || "")}</td><td><b>${date(item.maxArrivalDate)}</b><small>Latest request ${date(item.latestRequestDate)}</small></td><td>${num(item.totalLeadTimeDays)} hari</td><td>${num(item.supplierLeadTimeDays)} hari</td><td>${num(item.internalProcessLeadTimeDays)} hari</td><td><strong>${esc(item.action || `Request supplier LT ≤ ${num(item.requestedSupplierLeadTimeDays)} hari`)}</strong><small>Perlu percepatan ${num(item.requiredAccelerationDays)} hari</small></td></tr>`).join(""),
    ) : '<p class="mwb-decision-empty">Belum ada baris shortage supplier pada assessment ini.</p>';
    return `<section class="mwb-decision-block material"><div class="mwb-decision-copy"><div><small>MASALAH</small><b>${esc(problem)}</b></div><div><small>SOLUSI · PURCHASING</small><b>${esc(support.actionLabel || "Request lead time supplier lebih cepat")}</b></div></div>${body}</section>`;
  }
  function renderCapacityDecision(row, support = {}) {
    const workCenters = support.workCenters || [];
    const problem = workCenters.length
      ? `${workCenters.length} work center dihitung untuk window FG ${date(support.windowStart)} sampai ${date(support.windowEnd)}.`
      : "Master RCCP resource profile untuk part ini belum tersedia; kapasitas belum dapat dihitung.";
    const workCenterCards = workCenters.map((item) => {
      const events = (item.calendarWindow?.days || []).filter((day) => day.eventName || day.eventType);
      const eventRows = events.length
        ? events.map((event) => `<li><b>${date(event.date)}</b><span>${esc(event.eventType || "CALENDAR")} · ${esc(event.eventName || "Working calendar override")} · ${num(event.availableMachines)} mesin / ${num(event.availableHours)} jam</span></li>`).join("")
        : '<li><span>Tidak ada maintenance atau override pada window ini.</span></li>';
      return `<article class="mwb-capacity-window"><header><div><small>WORK CENTER</small><b>${esc(item.resourceName || item.resourceCode || "—")}</b><span>${esc(item.machineName || item.machineCode || "Mesin sesuai resource profile")}</span></div><em class="${item.authoritative ? "official" : "preview"}">${item.authoritative ? "RCCP OFFICIAL" : "PREVIEW"}</em></header><div class="mwb-capacity-metrics"><div><span>Master Working Hour</span><b>${num(item.masterWorkingHoursPerDay)} jam/hari</b></div><div><span>Master Mesin</span><b>${num(item.masterMachineCount)} mesin</b></div><div><span>Required</span><b>${num(item.requiredHours)} jam</b></div><div><span>Available 1–FG</span><b>${num(item.availableHours)} jam</b></div><div><span>Utilization</span><b>${item.utilizationPct == null ? "—" : `${num(item.utilizationPct)}%`}</b></div></div><p class="mwb-capacity-formula">${esc(support.formula || "Master working hours x mesin tersedia x efficiency - downtime")}</p><details class="mwb-calendar-events"><summary>Event working calendar (${events.length})</summary><ul>${eventRows}</ul></details></article>`;
    }).join("");
    const mode = workCenters.length && !support.authoritative ? '<p class="mwb-decision-notice">Angka ini preview dari master working hour dan kalender mesin. Jalankan RCCP untuk angka approval.</p>' : "";
    return `<section class="mwb-decision-block capacity"><div class="mwb-decision-copy"><div><small>MASALAH</small><b>${esc(problem)}</b></div><div><small>SOLUSI · PRODUCTION</small><b>Add Overtime / Change Production Line</b></div></div>${mode}${workCenterCards || '<p class="mwb-decision-empty">Lengkapi resource profile, mesin, shift, dan working calendar.</p>'}</section>`;
  }
  function renderVendorDecision(row, support = {}) {
    const processes = support.processes || [];
    if (!processes.length) return '<section class="mwb-decision-block vendor"><p class="mwb-decision-empty"><b>Tidak ada proses vendor pada routing.</b> Checkpoint ini tidak menjadi blocker.</p></section>';
    return `<section class="mwb-decision-block vendor"><div class="mwb-decision-copy"><div><small>MASALAH</small><b>${num(support.totalLeadTimeDays)} hari total lead time vendor terdaftar.</b></div><div><small>SOLUSI · PURCHASING</small><b>${esc(support.actionLabel || "Request percepatan proses vendor")}</b></div></div>${decisionTable(["Process", "Vendor", "Lead Time", "Tindak Lanjut"], processes.map((item) => `<tr><td><b>${esc(item.processName || item.processCode || "—")}</b><small>${esc(item.componentPartCode || "")}</small></td><td>${esc(item.vendorName || item.vendorCode || "Belum ditentukan")}</td><td>${num(item.vendorLeadTimeDays)} hari</td><td><strong>Request Purchasing</strong></td></tr>`).join(""))}</section>`;
  }
  function renderDeliveryDecision(row, support = {}, upstreamOpen) {
    const blocked = Boolean(upstreamOpen);
    return `<section class="mwb-decision-block delivery ${blocked ? "locked" : "ready"}"><div class="mwb-decision-copy"><div><small>DELIVERY TARGET</small><b>${date(support.requestedDeliveryDate)} → earliest feasible ${date(support.earliestFeasibleDeliveryDate)}</b></div><div><small>LAST RESORT · SALES</small><b>${blocked ? "Ditahan — recovery upstream harus dituntaskan lebih dulu" : esc(support.actionLabel || "Change Delivery Target")}</b></div></div><p>${blocked ? "Perubahan delivery belum menjadi solusi aktif. Supplier, capacity, dan vendor harus sudah dipercepat atau dinyatakan mentok terlebih dahulu." : "Semua opsi recovery upstream sudah selesai; perubahan target delivery dapat diajukan ke Sales."}</p></section>`;
  }
  function renderDecisionSupport(row, support, upstreamOpen) {
    if (row.name === "Material Supply") return renderSupplierDecision(row, support.supplier);
    if (row.name === "Production Capacity") return renderCapacityDecision(row, support.capacity);
    if (row.name === "Vendor Process") return renderVendorDecision(row, support.vendor);
    if (row.name === "Delivery Schedule") return renderDeliveryDecision(row, support.delivery, upstreamOpen);
    const reasons = issueReasons(row);
    return `<section class="mwb-decision-block master"><div class="mwb-decision-copy"><div><small>MASALAH</small><b>${esc(reasons[0] || "Master data lengkap.")}</b></div><div><small>SOLUSI · PPIC</small><b>${esc(row.status === "OK" ? "Tidak ada tindakan" : "Correct Master Data")}</b></div></div></section>`;
  }
  function renderOperationalCheckpointTable(detail = {}) {
    const support = detail.decisionSupport || {};
    const rows = checkpointRows(detail.checks || []).map((row) => ({ ...row }));
    const vendorRow = rows.find((row) => row.name === "Vendor Process");
    if (vendorRow && !(support.vendor?.processes || []).length) Object.assign(vendorRow, { status: "OK", recovery: "—", feedbackStatus: "—" });
    const upstreamOpen = rows.slice(0, 4).some((row) => row.status !== "OK");
    const deliveryRow = rows.find((row) => row.name === "Delivery Schedule");
    if (deliveryRow?.status !== "OK" && upstreamOpen) deliveryRow.recovery = "Ditahan — recovery upstream";
    const okCount = rows.filter((row) => row.status === "OK").length; const openCount = rows.length - okCount;
    const overall = rows.some((row) => row.status === "NOT_OK") ? { label: "NOT FEASIBLE", tone: "danger", icon: "●" } : rows.some((row) => row.status === "WARNING") ? { label: "WARNING", tone: "warning", icon: "●" } : { label: "FEASIBLE", tone: "success", icon: "●" };
    const body = rows.map((row) => {
      const meta = row.status === "OK" ? { label: "OK", tone: "success", icon: "✓" } : row.status === "NOT_OK" ? { label: "Not OK", tone: "danger", icon: "●" } : { label: "Warning", tone: "warning", icon: "●" };
      const issue = row.status !== "OK";
      return `<details class="mwb-checkpoint-row ${meta.tone}" data-check-issue="${issue ? "1" : "0"}" ${issue ? "open" : ""}><summary><span class="mwb-checkpoint-name">${esc(row.name)}</span><span class="mwb-checkpoint-status ${meta.tone}"><i>${meta.icon}</i>${meta.label}</span><span class="mwb-checkpoint-recovery">${esc(row.recovery)}</span><span class="mwb-checkpoint-feedback ${issue ? "open" : ""}">${esc(row.feedbackStatus)}</span><span class="mwb-checkpoint-dept">${esc(row.dept)}</span><i class="mwb-checkpoint-expand" aria-hidden="true">⌄</i></summary><div class="mwb-checkpoint-detail">${renderDecisionSupport(row, support, upstreamOpen)}<details class="mwb-technical-rules"><summary>Detail rule teknis (${row.details.length})</summary>${row.details.map(renderCheck).join("") || '<span class="mwb-no-evidence">Tidak ada rule teknis yang berlaku.</span>'}</details></div></details>`;
    }).join("");
    return `<section class="mwb-feasibility-section mwb-checkpoint-section"><header><div><small>5 CHECKPOINT MPS · PROBLEM → SOLUTION</small><h3>Checklist Kelayakan &amp; Recovery</h3></div><a href="/modules/planning-ppic/mps/recovery-kanban?month=${encodeURIComponent(els.month.value)}">Buka Recovery Kanban →</a></header><div class="mwb-checkpoint-table"><div class="mwb-checkpoint-head"><span>Checkpoint</span><span>Status</span><span>Recovery</span><span>Feedback Status</span><span>Dept</span><i></i></div>${body}</div><footer class="mwb-checkpoint-summary ${overall.tone}"><b>MPS Status: <span>${overall.icon} ${overall.label}</span></b><strong>${okCount} / 5 Checkpoints OK</strong><strong>${openCount} Recovery Actions Open</strong></footer></section>`;
  }
  function renderFeasibilityDetail(detail) {
    state.feasibilityDetail = detail;
    const identity = detail.identity || {}; const summary = detail.summary || {}; const meta = assessmentStatus(summary.status);
    els.feasibilityMeta.textContent = `${identity.partNumber || "MPS"} · ${identity.partName || ""} · ${identity.batchLabel || identity.rowType || ""} · ${identity.period || els.month.value} · MPS ${num(identity.mpsQty)}`;
    const cards = [[`${num(summary.okCount)}/${num(summary.totalCount)} OK`, "Parameter lolos"], [`${num(summary.failCount)} Gagal`, "Critical/non-critical"], [`${num(summary.warningCount)} Risiko`, "Perlu perhatian"], [`${num(summary.notCheckedCount)} Belum Dicek`, "Data belum tersedia"], [date(identity.requiredDeliveryAt), "Required Delivery"], [date(summary.earliestFeasibleDeliveryAt), "Earliest Feasible"], [summary.lateByWorkingDays === null || summary.lateByWorkingDays === undefined ? "—" : `${num(summary.lateByWorkingDays)} hari`, "Late Days"], [summary.primaryConstraint?.impact || summary.primaryConstraint?.label || "—", "Primary Constraint"]];
    els.feasibilityBody.innerHTML = `<div class="mwb-feasibility-overall ${meta.tone}"><span aria-hidden="true">${meta.icon}</span><div><small>OVERALL STATUS</small><b>${esc(meta.label)}</b></div></div><div class="mwb-feasibility-cards">${cards.map(([main, sub]) => `<article><b>${esc(main)}</b><span>${esc(sub)}</span></article>`).join("")}</div>${renderOperationalCheckpointTable(detail)}${renderMpsCalculation(detail.mpsCalculation || {})}`;
    els.feasibilityFooterMeta.textContent = `Last evaluated ${displayDateTime(summary.evaluatedAt)} · Source as of ${displayDateTime(summary.sourceDataAsOf)} · ${summary.rulesVersion || "—"} · ${summary.formulaVersion || "—"}`;
    applyFeasibilityFilter();
    return;
    const grouped = (detail.checks || []).reduce((map, item) => { (map[item.group] ||= []).push(item); return map; }, {});
    els.feasibilityBody.innerHTML = `<div class="mwb-feasibility-overall ${meta.tone}"><span aria-hidden="true">${meta.icon}</span><div><small>OVERALL STATUS</small><b>${esc(meta.label)}</b></div></div><div class="mwb-feasibility-cards">${cards.map(([main, sub]) => `<article><b>${esc(main)}</b><span>${esc(sub)}</span></article>`).join("")}</div>${renderMpsCalculation(detail.mpsCalculation || {})}<section class="mwb-feasibility-section"><header><div><small>12 RULES · ${esc(detail.summary?.rulesVersion || "")}</small><h3>Checklist Parameter</h3></div></header><div class="mwb-check-groups">${Object.entries(grouped).map(([group, checks]) => `<section><h4>${esc(group)}</h4>${checks.map(renderCheck).join("")}</section>`).join("") || '<div class="mwb-feasibility-empty">Tidak ada parameter yang berlaku.</div>'}</div></section>`;
    els.feasibilityFooterMeta.textContent = `Last evaluated ${displayDateTime(summary.evaluatedAt)} · Source as of ${displayDateTime(summary.sourceDataAsOf)} · ${summary.rulesVersion || "—"} · ${summary.formulaVersion || "—"}`;
    applyFeasibilityFilter();
  }
  function applyFeasibilityFilter() {
    els.feasibilityModal?.querySelectorAll("[data-feasibility-filter]").forEach((button) => button.classList.toggle("active", button.dataset.feasibilityFilter === state.feasibilityFilter));
    els.feasibilityBody?.querySelectorAll("[data-check-issue]").forEach((node) => { node.hidden = state.feasibilityFilter === "issues" && node.dataset.checkIssue !== "1"; });
  }
  function renderAggregateFeasibility() {
    const summary = state.data?.feasibilitySummary || {}; const meta = assessmentStatus(summary.status);
    els.feasibilityMeta.textContent = `Total baris planning yang terlihat · ${state.data?.pagination?.filtered || 0} FG`;
    els.feasibilityBody.innerHTML = `<div class="mwb-feasibility-overall ${meta.tone}"><span aria-hidden="true">${meta.icon}</span><div><small>OVERALL VISIBLE ROWS</small><b>${esc(meta.label)}</b></div></div><div class="mwb-feasibility-cards"><article><b>${num(summary.okCount)}/${num(summary.totalCount)} OK</b><span>Parameter applicable</span></article><article><b>${num(summary.failCount)} Gagal</b><span>Perlu tindakan</span></article><article><b>${num(summary.warningCount)} Risiko</b><span>Perlu perhatian</span></article><article><b>${num(summary.notCheckedCount)} Belum Dicek</b><span>Data belum lengkap</span></article></div><section class="mwb-feasibility-section"><header><div><small>VISIBLE PLANNING ROWS</small><h3>Ringkasan per FG</h3></div></header><div class="mwb-feasibility-part-list">${(state.data?.items || []).map((item) => `<button type="button" data-feasibility-line="${esc(item.lineId || item.id)}"><span><b>${esc(item.partNumber || item.partCode)}</b><small>${esc(item.partName || "")}</small></span>${assessmentBadge(item.checklistSummary || item.feasibilityAssessment)}</button>`).join("")}</div></section>`;
    els.feasibilityFooterMeta.textContent = "Total hanya menjumlah parameter applicable pada planning rows yang terlihat; NA tidak masuk denominator.";
  }
  async function openFeasibility(lineId, origin) {
    state.feasibilityOrigin = origin || document.activeElement; state.feasibilityLineId = lineId; state.feasibilityFilter = "all";
    els.feasibilityModal.setAttribute("aria-hidden", "false"); els.feasibilityTitle.textContent = "Checklist Kelayakan Schedule & Delivery";
    if (lineId === "__TOTAL__") { renderAggregateFeasibility(); els.feasibilityModal.querySelector("[data-close-feasibility-modal]")?.focus(); return; }
    els.feasibilityMeta.textContent = "Memuat evaluasi…"; els.feasibilityBody.innerHTML = '<div class="mwb-feasibility-loading">Memuat rincian feasibility…</div>';
    try {
      const detail = await request(`${apiBase}/workbench/lines/${encodeURIComponent(lineId)}/feasibility?month=${encodeURIComponent(els.month.value)}`);
      if (state.feasibilityLineId === lineId) renderFeasibilityDetail(detail);
    } catch (error) {
      els.feasibilityBody.innerHTML = `<div class="mwb-feasibility-error"><b>Rincian gagal dimuat.</b><p>${esc(error.message)}</p><button type="button" class="btn btn-primary" data-feasibility-retry>Ulangi</button></div>`;
    }
    els.feasibilityModal.querySelector("[data-close-feasibility-modal]")?.focus();
  }
  function closeFeasibilityModal() { if (!els.feasibilityModal || els.feasibilityModal.getAttribute("aria-hidden") === "true") return; els.feasibilityModal.setAttribute("aria-hidden", "true"); state.feasibilityLineId = null; const origin = state.feasibilityOrigin; state.feasibilityOrigin = null; if (origin?.isConnected) origin.focus(); }
  function query() { const params = new URLSearchParams({ month: els.month.value || config.initialMonth, page: state.page, pageSize: state.pageSize }); if (els.status.value) params.set("status", els.status.value); if (els.search.value.trim()) params.set("q", els.search.value.trim()); return params; }
  function stack(m) { return `<div class="mwb-stack"><div><span>Free FG</span><b>${num(m.freeOpeningQty)}</b></div><div><span>Pegged SO</span><b>${num(m.peggedReservationQty)}</b></div><div class="total"><span>Nettable</span><b>${num(m.openingNettableQty)}</b></div>${Math.abs(m.openingVarianceQty) > .000001 ? `<div><span>vs resmi</span><b>${num(m.openingVarianceQty)}</b></div>` : ""}</div>`; }
  function renderRows(data) {
    if (!data.items.length) { const excluded = data.blockedForecasts || []; els.body.innerHTML = `<tr><td colspan="21" class="mwb-empty"><b>${data.mps ? "Tidak ada FG pada filter ini." : "Draft MPS periode ini belum ada."}</b><br><small>${data.mps ? "Ubah filter pencarian." : excluded.length ? `${excluded.length} Forecast ${excluded.map((row) => row.status).join("/")} dikecualikan dari EFD. Klik Buat MPS Production Plan untuk memproses demand Confirmed/SO aktif.` : "Klik Buat MPS Production Plan untuk menarik EFD, stock, dan delivery aktual."}</small></td></tr>`; return; }
    const rows = data.items.map((item) => {
      const m = item.metrics; const open = state.expanded.has(item.id); const customerPhases = deliveryStatus.decoratePhases(item.phases || [], data.deliveryGate?.snapshots || []); const phases = [...customerPhases, ...(item.bufferPhase ? [item.bufferPhase] : [])]; const components = item.components || [];
      const delivery = item.delivery || {};
      const rootAssessment = item.feasibilityAssessment || {};
      const capacity = item.capacity || { status: "NOT_CHECKED", maxLoadPercentage: 0, rccpRunId: null };
      const main = `<tr class="mwb-fg-row ${open ? "is-expanded" : ""}"><td class="mwb-toggle-col"><button type="button" data-toggle-row="${esc(item.id)}" aria-expanded="${open}">${open ? "▼" : "▶"}</button></td><td class="mwb-part"><b>${esc(item.partNumber || item.partCode)}</b><small>${esc(item.partCode)}</small></td><td class="mwb-part-name">${esc(item.partName || item.partCode)}</td><td class="mwb-type">FG</td><td class="mwb-num">${num(item.efdM1)}</td><td class="mwb-num mwb-delivered">${num(item.deliveredM1)}</td><td class="mwb-num mwb-shortage">${num(item.shortageM1)}</td><td class="mwb-num mwb-current-efd">${num(item.efdM)}</td>${poDeltaCell(item, data.planningLock?.locked)}<td class="mwb-num mwb-lookahead-efd" title="Demand EFD M+1 · look-ahead, belum menjadi MPS Qty resmi">${num(item.efdMPlus1)}</td><td class="mwb-num mwb-buffer-value">${num(item.bufferPercent)}%</td><td class="mwb-num mwb-buffer-value"><b>${num(item.bufferQty)}</b></td><td class="mwb-dash">—</td><td class="mwb-stock-value" title="Available ${num(item.availableStockQty)} · Reserved ${num(item.stockReservedQty)} · QC ${num(item.stockQcQty)}">${num(item.currentStockQty)}</td><td class="mwb-mps-value ${number(item.planMetrics?.totalPlanQty ?? m.plannedProductionQty) > 0 ? "has-mps" : ""}">${planNumberCell(item)}</td><td class="mwb-lead-time">${leadTime(item.leadTimeDays)}</td><td class="mwb-capacity-cell">${capacityBadge(capacity)}</td><td class="mwb-capacity-load">${capacity.rccpRunId ? `${num(capacity.maxLoadPercentage)}%` : "—"}</td><td><button class="mwb-row-action" type="button" data-row-menu="${esc(item.id)}" aria-haspopup="menu" aria-label="Atur MPS ${esc(item.partNumber || item.partCode)}" title="Atur MPS">${actionButtonContent("root")}</button></td><td>${checklistCell(rootAssessment)}</td><td>${assessmentBadge(rootAssessment)}</td></tr>`;
      if (!open) return main;
      const children = phases.length ? phases.map((phase, phaseIndex) => {
        const phaseQty = number(phase.plannedProductionQty ?? phase.qty);
        const isBufferBatch = phase.sourceType === "BUFFER";
        const phaseStatus = isBufferBatch ? { label: "Buffer", tone: "info" } : phase.feasibility;
        const phaseAssessment = phase.feasibilityAssessment || {};
        const batchKey = `${item.id}::${phase.id || phaseIndex}`;
        const batchOpen = state.expandedBatches.has(batchKey);
        const phaseDecision = isBufferBatch ? null : deliveryStatus.phaseAction(phaseStatus);
        const phaseAction = isBufferBatch
          ? `<button class="mwb-batch-action is-detail" type="button" data-detail="${esc(item.id)}" aria-label="Lihat detail netting buffer" title="Detail buffer">${actionButtonContent("buffer")}</button>`
          : phaseDecision.mode === "handle"
            ? `<button class="mwb-batch-action is-handle" type="button" data-phase-menu="${esc(item.id)}" data-phase-id="${esc(phase.id || String(phaseIndex))}" aria-haspopup="menu" aria-label="Tangani delivery ${esc(phase.sourceNumber || `Batch ${phaseIndex + 1}`)}" title="Tangani delivery"><span aria-hidden="true">${esc(phaseDecision.icon)}</span></button>`
            : `<button class="mwb-batch-action ${phaseDecision.mode === "recheck" ? "is-recheck" : "is-safe"}" type="button" data-phase-detail-direct="${esc(phase.deliveryTargetId || "")}" aria-label="Lihat hasil: ${esc(phaseDecision.label)}" title="Hasil dihitung otomatis saat MPS dibuat atau dihitung ulang"><span aria-hidden="true">${esc(phaseDecision.icon)}</span></button>`;
        const phaseSupplyNote = isBufferBatch
          ? `${esc(phase.sourceNumber || "Demand phase")} · ${components.length} child part${number(phase.bufferAllocatedQty) > 0 ? ` · buffer ${num(phase.bufferAllocatedQty)}` : ""}`
          : `${esc(phase.sourceNumber || "Demand phase")} · demand ${num(phase.qty)} · stock FG dipakai ${num(phase.stockUsedQty)} · produksi ${num(phaseQty)}`;
        const phaseRow = `<tr class="mwb-batch-row ${isBufferBatch ? "is-buffer" : ""} ${batchOpen ? "is-expanded" : ""}"><td class="mwb-toggle-col"><button class="mwb-batch-toggle" type="button" data-toggle-batch="${esc(batchKey)}" aria-expanded="${batchOpen}" aria-label="${batchOpen ? "Tutup" : "Buka"} child part batch ${phaseIndex + 1}">${batchOpen ? "▼" : "▶"}</button></td><td></td><td class="mwb-batch-name"><b>${isBufferBatch ? "Batch Buffer Akhir Bulan" : `Batch ${phaseIndex + 1}`} — ${date(phase.fgRequiredDate)}</b><small>${phaseSupplyNote}</small></td><td class="mwb-type">${isBufferBatch ? "BUFFER" : "—"}</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-mps-value ${phaseQty > 0 ? "has-mps" : ""}">${mpsNumberCell(phaseQty, "phase", item.id, phase.id || String(phaseIndex))}</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td>${phaseAction}</td><td>${checklistCell(phaseAssessment)}</td><td>${assessmentBadge(phaseAssessment)}</td></tr>`;
        const componentRows = batchOpen ? components.map((component) => {
          const itemType = String(component.itemType || "").toUpperCase();
          const isFgChild = itemType === "FG";
          const componentType = isFgChild ? "FG" : "WIP";
          const netting = (component.phaseNetting || []).find((row) => row.phaseId === (phase.id || String(phaseIndex))) || component.phaseNetting?.[phaseIndex] || {};
          const grossQty = number(netting.grossRequirementQty ?? component.qtyPerFg * phaseQty);
          const netQty = number(netting.netRequirementQty ?? grossQty);
          const plannedQty = number(netting.plannedOrderQty ?? netQty);
          const processLabel = (component.processes || []).map((process) => process.occurrenceCode || process.processCode || process.processName).filter(Boolean).join(" → ") || "Proses MBOM belum ditentukan";
          const processTitle = (component.processes || []).map((process) => `${process.routingNumber ? `${process.routingNumber} · ` : ""}${process.processCode || ""} ${process.processName || ""}`.trim()).filter(Boolean).join(" → ") || processLabel;
          const nettingLabel = grossQty <= 0 ? "Tidak perlu produksi" : netQty <= 0 ? "Stock Covered" : `${componentType} ${num(plannedQty)}`;
          const nettingTone = netQty <= 0 ? "success" : "info";
          const cumulativeLeadTime = netting.leadTime || {};
          const leadTimeTitle = plannedQty <= 0
            ? "MPS Qty 0, lead time 0"
            : `LT kumulatif = ${num(cumulativeLeadTime.ownCycleLoadHours)} jam cycle sendiri + ${num(cumulativeLeadTime.parentHours)} jam level atas + ${num(cumulativeLeadTime.ownVendorLeadTimeDays)} hari vendor sendiri + ${num(cumulativeLeadTime.minimumLeadTimeAdjustmentHours)} jam minimum = ${num(cumulativeLeadTime.totalDays)} hari (2 shift × 7 jam)`;
          return `<tr class="mwb-component-row" data-batch-child="${esc(batchKey)}"><td></td><td class="mwb-part mwb-child-part"><b>${esc(component.partNumber || component.partCode || "-")}</b><small>L${num(component.level)} · ${esc(component.partCode || "Part Code —")}</small></td><td class="mwb-component-name"><b>${esc(component.partName)}</b><small title="${esc(processTitle)}">${esc(processLabel)}</small></td><td class="mwb-type ${isFgChild ? "fg-child" : "wip"}">${componentType}</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-num" title="Kebutuhan per FG dari struktur MBOM">${num(component.qtyPerFg)}</td><td class="mwb-stock-value" title="Stock awal phase ${num(netting.openingStockQty)} · Dipakai ${num(netting.stockUsedQty)} · Sisa ${num(netting.endingStockQty)} · Firm receipt dipakai ${num(netting.firmReceiptUsedQty)}">${num(netting.openingStockQty)}</td><td class="mwb-mps-value ${plannedQty > 0 ? "has-mps" : ""}" title="Gross ${num(grossQty)} - stock ${num(netting.stockUsedQty)} - firm receipt ${num(netting.firmReceiptUsedQty)} = net ${num(netQty)}">${mpsNumberCell(plannedQty, "component", item.id, phase.id || String(phaseIndex), component.partCode)}</td><td class="mwb-lead-time" title="${esc(leadTimeTitle)}">${number(cumulativeLeadTime.totalDays) > 0 ? `${num(cumulativeLeadTime.totalDays)}d` : "—"}</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td class="mwb-dash">—</td><td><span class="mwb-delivery-status ${nettingTone}" title="${esc(nettingLabel)} · Netting berantai antar-phase">${esc(nettingLabel)}</span></td></tr>`;
        }).join("") : "";
        return phaseRow + componentRows;
      }).join("") : `<tr class="mwb-batch-row"><td></td><td colspan="20">Belum ada delivery batch untuk item ini.</td></tr>`;
      return main + children;
    }).join("");
    const total = (key) => data.items.reduce((sum, item) => sum + number(key.split(".").reduce((value, part) => value?.[part], item)), 0);
    const percents = [...new Set(data.items.map((item) => number(item.bufferPercent)))];
    const totalMps = data.items.reduce((sum, item) => sum + number(item.planMetrics?.totalPlanQty ?? item.metrics?.plannedProductionQty), 0);
    const totalCapacity = { status: data.mps?.capacityStatus || "NOT_CHECKED", rccpRunId: data.rccp?.id || null };
    const totalFeasibility = data.feasibilitySummary || {};
    const totalPoDelta = data.items.reduce((sum, item) => sum + number(item.planMetrics?.poDeltaQty), 0);
    const totalPoTone = totalPoDelta > 0.000001 ? "is-positive" : totalPoDelta < -0.000001 ? "is-negative" : "is-zero";
    const totalRow = `<tr class="mwb-total-row"><td></td><td><b>Total</b></td><td>—</td><td>—</td><td>${num(total("efdM1"))}</td><td class="mwb-delivered">${num(total("deliveredM1"))}</td><td class="mwb-shortage">${num(total("shortageM1"))}</td><td>${num(total("efdM"))}</td><td class="mwb-po-delta ${data.planningLock?.locked ? totalPoTone : "is-unlocked"}"><b>${data.planningLock?.locked ? signedNum(totalPoDelta) : "—"}</b></td><td class="mwb-lookahead-efd" title="Total demand EFD M+1 · look-ahead">${num(total("efdMPlus1"))}</td><td>${percents.length === 1 ? `${num(percents[0])}%` : "—"}</td><td>${num(total("bufferQty"))}</td><td>—</td><td class="mwb-stock-value">${num(total("currentStockQty"))}</td><td class="mwb-mps-value ${totalMps > 0 ? "has-mps" : ""}">${num(totalMps)}</td><td>—</td><td>${capacityBadge(totalCapacity)}</td><td>${data.rccp ? `${num(data.rccp.maxLoadPercentage)}%` : "—"}</td><td>—</td><td>${assessmentSummaryCell(totalFeasibility)}</td><td>${assessmentBadge(totalFeasibility)}</td></tr>`;
    els.body.innerHTML = rows + totalRow;
    [...els.body.querySelectorAll(".mwb-fg-row")].forEach((row, index) => {
      const item = data.items[index]; if (!item) return; const cells = row.cells;
      if (cells[13]) { cells[13].textContent = num(item.availableStockQty); cells[13].title = `On Hand ${num(item.onHandStockQty)} · Reserved ${num(item.stockReservedQty)} · Allocated ${item.allocatedStockQty == null ? "belum tersedia" : num(item.allocatedStockQty)} · QC Hold ${num(item.stockQcQty)} · Blocked ${item.blockedStockQty == null ? "belum tersedia" : num(item.blockedStockQty)} · Usable ${num(item.availableStockQty)}`; }
      const cap = item.capacity || {}; if (cells[17] && cap.requiredCapacityHours != null && cap.netAvailableCapacityHours != null) { cells[17].innerHTML = `<b>${num(cap.requiredCapacityHours)}h / ${num(cap.netAvailableCapacityHours)}h</b><small>${num(cap.maxLoadPercentage)}%</small>`; cells[17].title = "Required load / net available capacity"; }
    });
  }
  function gateTone(gate = {}) {
    if (gate.officialGateStatus === "APPROVED_WITH_EXCEPTION") return "exception";
    if (gate.officialGateStatus !== "BLOCKED") return "feasible";
    return gate.feasibilityStatus === "INFEASIBLE" ? "blocked" : "stale";
  }
  function renderDeliveryGate(data) {
    if (!els.deliveryGateBadge || !els.deliveryGateReason || !els.deliveryGateDetails) return;
    const gate = data.deliveryGate || { feasibilityStatus: "STALE", officialGateStatus: "BLOCKED", blockerCount: 1, snapshots: [], reason: "Hitung Draft MPS untuk membentuk snapshot delivery." };
    const title = gate.officialGateStatus === "APPROVED_WITH_EXCEPTION" ? "APPROVED WITH EXCEPTION" : gate.officialGateStatus === "READY_TO_RELEASE" ? "READY TO RELEASE" : gate.feasibilityStatus;
    els.deliveryGateBadge.textContent = label(title);
    els.deliveryGateBadge.className = `mwb-gate-badge ${gateTone(gate)}`;
    els.deliveryGateReason.textContent = `${gate.reason || "Delivery feasibility belum tersedia."} · ${number(gate.blockerCount)} blocker · ${number(gate.exceptionCount)} exception`;
    els.deliveryGateDetails.disabled = !(gate.snapshots || []).length;
  }
  function openGateDrawer(deliveryTargetId = "") {
    const gate = state.data?.deliveryGate;
    if (!gate) return;
    els.gateDrawerMeta.textContent = `${state.data.mps?.mpsNumber || "MPS"} · ${label(gate.officialGateStatus)} · ${number(gate.blockerCount)} blocker`;
    const snapshots = (gate.snapshots || []).filter((row) => !deliveryTargetId || row.deliveryTargetId === deliveryTargetId);
    els.gateDrawerBody.innerHTML = snapshots.length ? `<div class="mwb-gate-list">${snapshots.map((row) => {
      const sourcePath = row.sourceType === "SALES_ORDER" ? "sales-orders" : "forecasts";
      const status = row.sourceCurrent === false ? "STALE" : row.feasibilityStatus;
      return `<article class="mwb-gate-card ${gateTone({ feasibilityStatus: status, officialGateStatus: row.officialGateStatus })}"><header><div><small>${esc(row.sourceType)} · DELIVERY PHASE</small><h3>${esc(row.sourceNumber)} · ${esc(row.partCode)}</h3></div><span>${esc(label(status))}</span></header><dl><div><dt>Delivery asli</dt><dd>${date(row.originalTargetDate)}</dd></div><div><dt>Komitmen efektif</dt><dd>${date(row.effectiveCommitmentDate)}</dd></div><div><dt>Qty</dt><dd>${num(row.quantity)}</dd></div><div><dt>Disposition</dt><dd>${esc(label(row.dispositionStatus))}</dd></div></dl><p>${esc(row.assessmentDetail?.criticalConstraint || (row.officialGateStatus === "BLOCKED" ? "Recovery atau Accept Late diperlukan sebelum official release." : "Delivery phase dapat dipromosikan."))}</p><footer><a href="/modules/sales/${sourcePath}/${encodeURIComponent(row.sourceNumber)}">Buka ${esc(row.sourceType === "SALES_ORDER" ? "Sales Order" : "Forecast")}</a></footer></article>`;
    }).join("")}</div>` : `<p class="mwb-empty-gate">Belum ada snapshot delivery phase. Hitung ulang Draft MPS.</p>`;
    els.gateDrawer.setAttribute("aria-hidden", "false");
  }
  function closeGateDrawer() { els.gateDrawer.setAttribute("aria-hidden", "true"); }
  function recoveryStatusTone(status) {
    if (status === "APPROVED") return "success";
    if (status === "PENDING_APPROVAL") return "warning";
    if (["REJECTED", "REPLAN_REQUIRED"].includes(status)) return "danger";
    return "info";
  }
  function recoveryEvidence(item = {}) {
    const evidence = item.evidence || {};
    if (Array.isArray(evidence.materials) && evidence.materials.length) return `${evidence.materials.length} material: ${evidence.materials.slice(0, 3).map((row) => row.partCode).join(", ")}${evidence.materials.length > 3 ? "…" : ""}`;
    if (Array.isArray(evidence.blockerCodes) && evidence.blockerCodes.length) return evidence.blockerCodes.join(", ");
    return item.verification || "Bukti penyelesaian wajib tersedia sebelum milestone ditutup.";
  }
  function showRecoveryMessage(message = "", tone = "danger") {
    els.recoveryMessage.hidden = !message;
    els.recoveryMessage.className = `mwb-recovery-message ${tone}`;
    els.recoveryMessage.textContent = message;
  }
  function setRecoveryBusy(busy) {
    state.recoveryBusy = busy;
    els.recoveryBody.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  }
  function renderRecoveryPlan(payload, requestedAction = "recovery") {
    const view = recoveryActions.simpleFormModel(payload, requestedAction);
    state.recoveryPayload = view;
    state.recoverySourcePayload = payload;
    if (state.recoveryAction) state.recoveryAction.requestedAction = view.mode;
    const recommendation = view.recommendation || {};
    const plan = view.plan;
    const selected = view.selectedAction || {};
    const requestedDate = recommendation.requestedDeliveryDate || plan?.requestedDeliveryDate;
    const earliestDate = recommendation.earliestFeasibleDeliveryDate || plan?.earliestFeasibleDelivery;
    const gapDays = number(recommendation.recoveryGapDays ?? plan?.recoveryGapDays);
    const methodOptions = view.methods.map((item) => `<option value="${esc(item.id)}" ${item.id === selected.id ? "selected" : ""}>${esc(item.title || label(item.id))}${number(item.expectedRecoveryDays) > 0 ? ` · potensi ${num(item.expectedRecoveryDays)} hari` : ""}</option>`).join("");
    const modeCopy = view.mode === "accept-late"
      ? { title: "Accept Late", date: "Tanggal komitmen baru", note: "Alasan keterlambatan", placeholder: "Jelaskan penyebab dan persetujuan perubahan tanggal" }
      : { title: "Recovery", date: "Target selesai", note: "Rencana tindakan", placeholder: "Jelaskan tindakan recovery yang akan dilakukan" };
    els.recoveryBody.innerHTML = `<div class="mwb-recovery-summary ${gapDays > 0 ? "has-gap" : "is-protected"}"><div><small>CUSTOMER DUE</small><b>${date(requestedDate)}</b></div><span aria-hidden="true">→</span><div><small>ESTIMASI SELESAI</small><b>${date(earliestDate)}</b></div><strong>${gapDays > 0 ? `Terlambat ${num(gapDays)} hari` : "Due date aman"}</strong><em class="mwb-recovery-status ${recoveryStatusTone(view.status)}">${esc(label(view.status))}</em></div>
      <div class="mwb-recovery-mode" role="tablist" aria-label="Jenis penanganan"><button type="button" role="tab" aria-selected="${view.mode === "recovery"}" class="${view.mode === "recovery" ? "active" : ""}" data-recovery-mode="recovery" ${view.locked ? "disabled" : ""}>↻ Recovery</button><button type="button" role="tab" aria-selected="${view.mode === "accept-late"}" class="${view.mode === "accept-late" ? "active" : ""}" data-recovery-mode="accept-late" ${view.locked || !view.checklist.some((item) => item.id === "ACCEPT_LATE") ? "disabled" : ""}>! Accept Late</button></div>
      <section class="mwb-recovery-simple-card"><header><div><small>KEPUTUSAN PPIC</small><h3>${modeCopy.title}</h3></div><span>${view.mode === "accept-late" ? "Perlu approval" : "Lindungi due date"}</span></header>
        ${view.mode === "recovery" ? `<label class="span-2">Metode recovery<select id="mwb-recovery-method" ${view.locked ? "disabled" : ""}>${methodOptions}</select></label>` : ""}
        <div class="mwb-recovery-simple-grid"><label>PIC<input id="mwb-recovery-owner" value="${esc(selected.owner || selected.ownerRole || "")}" placeholder="Nama / departemen" ${view.locked ? "disabled" : ""}></label><label>${modeCopy.date}<input id="mwb-recovery-target" type="date" value="${esc(isoDate(selected.targetDate || (view.mode === "accept-late" ? earliestDate : "")))}" ${view.locked ? "disabled" : ""}></label></div>
        <label>${modeCopy.note}<textarea id="mwb-recovery-notes" rows="3" placeholder="${modeCopy.placeholder}" ${view.locked ? "disabled" : ""}>${esc(selected.notes || plan?.notes || "")}</textarea></label>
        <label>Bukti / referensi <small>(opsional)</small><input id="mwb-recovery-evidence" value="${esc(selected.evidenceReference || "")}" placeholder="PO, email supplier, hasil trial, atau dokumen lain" ${view.locked ? "disabled" : ""}></label>
      </section>
      <details class="mwb-recovery-system-checks"><summary><span>✓</span><b>${view.requiredChecks.length} pemeriksaan sistem tetap tercatat</b><small>Lihat audit checklist</small></summary><ul>${view.requiredChecks.map((item) => `<li><span>${esc(item.title || label(item.id))}</span><small>${esc(item.owner || item.ownerRole || item.category || "SYSTEM")}</small></li>`).join("")}</ul></details>
      ${plan?.approvedBy ? `<div class="mwb-recovery-approval-record"><b>${plan.isApplicableToCurrentCalculation === false ? "Approval historis" : "Approved PPIC"} oleh ${esc(plan.approvedBy)}</b><span>${date(plan.approvedAt)} · ${esc(plan.approvalReason || "")}</span></div>` : ""}
      ${view.pending ? `<section class="mwb-recovery-approval-form"><h3>Approval PPIC</h3><label>Catatan keputusan<textarea id="mwb-recovery-approval-reason" rows="3" placeholder="Jelaskan mengapa tindakan ini cukup untuk melindungi due date"></textarea></label><label class="mwb-recovery-ack"><input id="mwb-recovery-approval-ack" type="checkbox"> Saya telah memeriksa PIC, target waktu, dependency, dan bukti tindakan.</label></section>` : ""}
      <footer class="mwb-recovery-actions"><button class="btn btn-outline-secondary" type="button" data-close-recovery-simple>${view.pending ? "Nanti" : "Batal"}</button>${!view.locked ? `<button class="btn btn-primary" type="button" data-recovery-command="submit">Ajukan ${modeCopy.title}</button>` : ""}${view.pending ? `<button class="btn btn-outline-danger" type="button" data-recovery-command="reject">Tolak</button><button class="btn btn-primary" type="button" data-recovery-command="approve">Setujui</button>` : ""}${view.status === "APPROVED" ? `<button class="btn btn-outline-primary" type="button" data-recovery-command="revise">Buat Revisi</button>` : ""}</footer>`;
  }
  function recoveryChecklistFromForm() {
    return recoveryActions.mergeSimpleForm(state.recoveryPayload?.checklist || [], {
      mode: state.recoveryPayload?.mode,
      methodId: $("mwb-recovery-method")?.value || null,
      owner: $("mwb-recovery-owner")?.value.trim() || null,
      targetDate: $("mwb-recovery-target")?.value || null,
      notes: $("mwb-recovery-notes")?.value.trim() || null,
      evidenceReference: $("mwb-recovery-evidence")?.value.trim() || null,
    });
  }
  async function loadRecoveryPlan(item, phase, requestedAction = "recovery") {
    const deliveryTargetId = phase?.deliveryTargetId;
    state.recoveryAction = { item, phase, deliveryTargetId, requestedAction };
    els.recoveryTitle.textContent = requestedAction === "accept-late" ? "Konfirmasi Accept Late" : "Recovery Delivery Phase";
    els.recoveryMeta.textContent = `${phase?.sourceNumber || "Delivery phase"} · ${item?.partNumber || item?.partCode || "-"} · due ${date(phase?.targetDeliveryDate || phase?.fgRequiredDate)}`;
    els.recoveryDrawer.setAttribute("aria-hidden", "false");
    els.recoveryBody.innerHTML = `<div class="mwb-recovery-loading">Memuat recovery plan dan feasibility terbaru…</div>`;
    showRecoveryMessage();
    if (!deliveryTargetId) { els.recoveryBody.innerHTML = `<div class="mwb-recovery-empty">Delivery target belum tersedia pada batch ini. Hitung ulang Draft MPS.</div>`; return; }
    try { renderRecoveryPlan(await request(recoveryActions.endpoints(deliveryTargetId).load), requestedAction); }
    catch (error) { els.recoveryBody.innerHTML = `<div class="mwb-recovery-empty">${esc(error.message)}</div>`; }
  }
  function closeRecoveryDrawer() {
    if (state.recoveryBusy) return;
    els.recoveryDrawer.setAttribute("aria-hidden", "true");
    state.recoveryAction = null;
    state.recoveryPayload = null;
    state.recoverySourcePayload = null;
    showRecoveryMessage();
  }
  async function runRecoveryCommand(command) {
    if (state.recoveryBusy || !state.recoveryAction?.deliveryTargetId) return;
    const action = state.recoveryAction;
    const currentPlan = state.recoveryPayload?.plan;
    const endpoints = recoveryActions.endpoints(action.deliveryTargetId, currentPlan?.id);
    setRecoveryBusy(true); showRecoveryMessage();
    try {
      if (["save", "submit", "revise"].includes(command)) {
        const saved = await request(endpoints.save, { method: "PUT", body: JSON.stringify({ checklist: recoveryChecklistFromForm(), notes: $("mwb-recovery-notes")?.value.trim() || null }) });
        if (command === "submit") await request(recoveryActions.endpoints(action.deliveryTargetId, saved.id).submit, { method: "POST", body: "{}" });
        showRecoveryMessage(command === "submit" ? "Recovery Plan berhasil diajukan untuk approval PPIC." : command === "revise" ? `Revision R${saved.revision} berhasil dibuat.` : `Draft R${saved.revision} berhasil disimpan.`, "success");
      } else {
        if (!currentPlan?.id) throw new Error("Recovery Plan belum tersedia.");
        const reason = $("mwb-recovery-approval-reason")?.value.trim() || "";
        if (reason.length < 10) throw new Error(`Catatan ${command} minimal 10 karakter.`);
        const acknowledgedRisk = Boolean($("mwb-recovery-approval-ack")?.checked);
        if (command === "approve" && !acknowledgedRisk) throw new Error("Centang pernyataan pemeriksaan PPIC sebelum approve.");
        await request(endpoints[command], { method: "PATCH", body: JSON.stringify({ reason, acknowledgedRisk }) });
        showRecoveryMessage(command === "approve" ? "Recovery Plan disetujui dan audit tersimpan." : "Recovery Plan ditolak untuk diperbaiki.", "success");
      }
      await load({ quiet: true });
      await loadRecoveryPlan(action.item, action.phase, action.requestedAction);
    } catch (error) {
      const details = Array.isArray(error.payload?.errors) ? ` ${error.payload.errors.join(" ")}` : "";
      showRecoveryMessage(`${error.message}${details}`);
    } finally { setRecoveryBusy(false); }
  }
  function renderFlow(data) {
    const mps = data.mps;
    const rccp = data.rccp;
    const mrp = data.mrp;
    const deliveryGate = data.deliveryGate || {};
    const deliveryAllowed = deliveryGate.officialGateStatus && deliveryGate.officialGateStatus !== "BLOCKED";
    const mpsApproved = mps?.lifecycleStatus === "APPROVED" && mps?.status === "Confirmed";
    const mrpRunning = mrp?.status === "Running";
    els.nextState.classList.remove("ready", "warning", "failed");
    els.flowMps.textContent = mps ? `${mps.mpsNumber} · ${mps.status}` : "Belum ada Draft";
    els.flowGate.textContent = !mps ? "Menunggu Draft MPS" : mps.replanRequired ? "Replan required" : `RCCP ${label(mps.capacityStatus)} · Delivery Gate ${label(deliveryGate.officialGateStatus || deliveryGate.feasibilityStatus || "UNKNOWN")}`;
    els.flowMrp.textContent = mrp ? `${mrp.runNumber} · ${mrp.isCurrentPlan === false ? "STALE / perlu rerun" : label(mrp.scenarioStatus || mrp.status)}` : "Belum ada run";
    // Calculation/reassessment remains available for Confirmed/Approved MPS;
    // only immutable released/completed history is protected.
    els.sync.disabled = Boolean(mps && ["Released", "Completed"].includes(mps.status));
    const syncFull = els.sync.querySelector(".mwb-sync-full");
    const syncShort = els.sync.querySelector(".mwb-sync-short");
    if (syncFull) syncFull.textContent = mps ? "Hitung Ulang MPS" : "Buat MPS Production Plan";
    if (syncShort) syncShort.textContent = mps ? "Hitung Ulang" : "Buat MPS";
    const acceptLateTargets = (deliveryGate.snapshots || []).filter((row) => row.sourceCurrent !== false
      && String(row.feasibilityStatus || "").toUpperCase() === "INFEASIBLE"
      && String(row.dispositionStatus || "").toUpperCase() !== "ACCEPT_LATE_APPROVED");
    if (els.bulkAcceptLate) {
      els.bulkAcceptLate.hidden = !acceptLateTargets.length;
      els.bulkAcceptLate.disabled = !mps || !mrp?.runNumber || !acceptLateTargets.length || state.recoveryBusy || ["Released", "Completed"].includes(mps.status);
      els.bulkAcceptLate.textContent = `! Accept Late Semua (${acceptLateTargets.length})`;
      els.bulkAcceptLate.title = mrp?.runNumber ? `Gunakan hasil ${mrp.runNumber} dan approve Accept Late seluruh blocker.` : "Hitung MRP terlebih dahulu.";
      els.bulkAcceptLate.dataset.deliveryTargetIds = acceptLateTargets.map((row) => row.deliveryTargetId).filter(Boolean).join(",");
    }
    // The authoritative approval checks are the active RCCP result and
    // Delivery Gate. A stale lifecycle label must not hide an otherwise valid
    // MPS approval action; the backend revalidates both gates on submit.
    els.confirmMps.disabled = !mps || mps.replanRequired || !data.summary.partCount || !rccp?.approvalAllowed || !deliveryAllowed;
    els.runMrp.disabled = !mps || !data.summary.partCount || mrpRunning || mps?.replanRequired;
    els.runMrp.textContent = mrp && !mrpRunning ? "Hitung Revision MRP" : "Hitung MRP";
    els.openMrp.hidden = !mrp;
    els.openMrp.href = `/modules/planning-ppic/mrp?month=${encodeURIComponent(data.period)}`;
    if (!mps) {
      els.nextState.classList.add("warning");
      els.nextTitle.textContent = "Langkah 1: bentuk Draft MPS";
      els.nextCopy.textContent = "Bentuk MPS Qty sebelum rough-cut capacity check dijalankan.";
    } else if (mps.replanRequired) {
      els.nextState.classList.add("failed");
      els.nextTitle.textContent = "MPS harus dihitung ulang";
      els.nextCopy.textContent = mps.replanReason || "Demand sumber berubah; selesaikan replan lalu jalankan RCCP ulang.";
    } else if (!rccp || mps.capacityStatus === "NOT_CHECKED") {
      els.nextState.classList.add("warning");
      els.nextTitle.textContent = "Evaluasi otomatis belum lengkap";
      els.nextCopy.textContent = `${mps.mpsNumber} belum memiliki hasil RCCP aktif. Lengkapi master data lalu gunakan Hitung Ulang MPS.`;
    } else if (["WARNING", "OVERLOAD"].includes(rccp.status) && !rccp.approvalAllowed) {
      els.nextState.classList.add(rccp.status === "OVERLOAD" ? "failed" : "warning");
      els.nextTitle.textContent = `RCCP ${rccp.status}`;
      els.nextCopy.textContent = rccp.status === "WARNING" ? "Acknowledge warning sebelum Approve MPS." : "Approve diblokir; revisi MPS atau lakukan authorized override.";
    } else if (!deliveryAllowed) {
      els.nextState.classList.add("failed");
      els.nextTitle.textContent = deliveryStatus.blockedGateTitle(deliveryGate);
      els.nextCopy.textContent = `${deliveryGate.reason || "Selesaikan recovery atau Accept Late."} Simulasi MRP tetap dapat dijalankan.`;
    } else if (!mpsApproved) {
      els.nextState.classList.add("ready");
      els.nextTitle.textContent = "Langkah 3: Approve / Freeze MPS";
      els.nextCopy.textContent = `RCCP ${rccp.status}; MPS dapat di-approve tanpa membuat Production Order.`;
    } else if (!mrp) {
      els.nextState.classList.add("ready");
      els.nextTitle.textContent = "MPS Approved";
      els.nextCopy.textContent = "Flow MPS → RCCP selesai. MRP adalah step planning berikutnya.";
    } else if (mrpRunning) {
      els.nextState.classList.add("warning");
      els.nextTitle.textContent = `MRP ${mrp.runNumber} sedang berjalan`;
      els.nextCopy.textContent = "Tunggu proses selesai; status akan diperbarui saat data dimuat ulang.";
    } else if (mrp.status === "Completed") {
      els.nextState.classList.add("ready");
      els.nextTitle.textContent = `MRP ${mrp.runNumber} selesai`;
      els.nextCopy.textContent = `${num(mrp.totalRequirements)} requirement dan ${num(mrp.totalPlannedOrders)} planned order terbentuk. Lanjutkan review di MRP Planning Run.`;
    } else {
      els.nextState.classList.add("failed");
      els.nextTitle.textContent = `MRP ${mrp.runNumber} ${mrp.status}`;
      els.nextCopy.textContent = mrp.errorMessage || "Periksa error, lalu jalankan ulang MRP setelah penyebab diperbaiki.";
    }
  }
  async function runBulkAcceptLate() {
    const button = els.bulkAcceptLate;
    const mpsNumber = state.data?.mps?.mpsNumber;
    const runNumber = state.data?.mrp?.runNumber;
    const deliveryTargetIds = String(button?.dataset.deliveryTargetIds || "").split(",").filter(Boolean);
    if (!button || button.disabled || !mpsNumber || !runNumber || !deliveryTargetIds.length) return;
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = "! Memproses Accept Late…";
    showAlert();
    try {
      const result = await request("/modules/api/planning-ppic/demand-planning/recovery-plans/bulk-accept-late", {
        method: "POST",
        body: JSON.stringify({ runNumber, deliveryTargetIds, reason: `Trial: Accept Late massal dari ${mpsNumber}.`, acknowledgedRisk: true }),
      });
      await load({ quiet: true });
      const failed = number(result.failed?.length);
      const skipped = number(result.skipped?.length);
      showAlert(`${number(result.processed?.length)} delivery langsung di-Accept Late.${skipped ? ` ${skipped} dilewati.` : ""}${failed ? ` ${failed} gagal diproses.` : ""}`, failed === 0);
    } catch (error) {
      showAlert(error.message);
      button.disabled = false;
      button.textContent = previous;
    }
  }
  function renderEfdWindow(data) {
    const window = data.efdWindow || { months: [], totals: {} };
    const monthText = (key) => key ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date(`${key}-01T00:00:00Z`)) : "-";
    const [m1, m, mp1] = window.months || [];
    $("mwb-efd-m1-label").textContent = `EFD M-1 (${monthText(m1)})`;
    $("mwb-efd-m-label").textContent = `EFD M (${monthText(m)})`;
    $("mwb-efd-mp1-label").textContent = `EFD M+1 (${monthText(mp1)})`;
    $("mwb-efd-m1").textContent = num(window.totals?.[m1]);
    $("mwb-efd-m").textContent = num(window.totals?.[m]);
    $("mwb-efd-mp1").textContent = num(window.totals?.[mp1]);
    $("mwb-efd-total").textContent = num(window.total);
    $("mwb-efd-rule").textContent = window.rule?.label || "General rule EFD";
    $("mwb-pill-m1").textContent = `${monthText(m1)} (M-1)`; $("mwb-pill-m").textContent = `${monthText(m)} (M)`; $("mwb-pill-mp1").textContent = `${monthText(mp1)} (M+1)`;
    $("mwb-group-m1").textContent = `${monthText(m1)} (M-1)`; $("mwb-group-m").textContent = `${monthText(m)} (M)`; $("mwb-group-mp1").textContent = `${monthText(mp1)} (M+1 · Look-ahead)`;
  }
  function renderPlanningControls(data) {
    const lock = data.planningLock || { locked: false, lockIds: [] };
    const changedParts = number(lock.changedPartCount ?? (data.items || []).filter((item) => Math.abs(number(item.planMetrics?.poDeltaQty)) > 0.000001).length);
    const poDeltaQty = number(lock.poDeltaQty ?? (data.items || []).reduce((sum, item) => sum + number(item.planMetrics?.poDeltaQty), 0));
    els.baselineStatus.textContent = lock.locked
      ? `Baseline PO Locked · status MPS tetap ${data.mps?.status || "-"}`
      : `Baseline PO belum dikunci · MPS ${data.mps?.status || "belum ada"}`;
    els.baselineMeta.textContent = lock.locked
      ? changedParts
        ? `${changedParts} part berubah · total perubahan PO ${signedNum(poDeltaQty)} · gunakan Generate Delta MPS untuk PO tambahan dan Production Cut untuk pengurangan.`
        : `Baseline PO aktif${lock.lockedBy ? ` · dikunci oleh ${lock.lockedBy}` : ""}. Belum ada perubahan PO.`
      : "Klik Lock MPS (PO Baseline) untuk menyimpan PO saat ini sebagai pembanding PO+. Ini tidak meng-approve MPS.";
    els.lockMps.disabled = !data.mps || lock.locked;
    els.lockMps.textContent = lock.locked ? "🔒 Baseline PO Locked" : "🔒 Lock MPS (PO Baseline)";
    els.sync.disabled = lock.locked;
    els.sync.title = lock.locked ? "MPS sudah dikunci. Gunakan Delta MPS atau Production Cut saat PO berubah." : "Hitung atau perbarui Draft MPS sebelum dikunci.";
    const pendingDeltaQty = (data.items || []).reduce((sum, item) => sum + number(item.planMetrics?.pendingDeltaQty), 0);
    els.recalculate.disabled = !lock.locked || pendingDeltaQty <= 0;
    els.recalculate.textContent = "＋ Generate Delta MPS";
    els.recalculate.title = !lock.locked ? "Lock MPS terlebih dahulu." : pendingDeltaQty <= 0 ? "Tidak ada PO tambahan yang belum tercover." : `Preview dan generate Delta MPS ${num(pendingDeltaQty)} qty tanpa mengubah baseline.`;
  }
  function closePlanningModal() {
    if (state.planningBusy) return;
    els.planningModal.setAttribute("aria-hidden", "true");
    state.planningPreview = null;
    state.planningMode = null;
  }
  function planningTable(preview) {
    const rows = preview.rows || [];
    return `<div class="mwb-planning-summary"><article><span>Scope terkunci</span><b>${num(rows.length)}</b></article><article><span>Total PO baseline</span><b>${num(rows.reduce((sum, row) => sum + number(row.poQtyLocked), 0))}</b></article><article><span>Total EFD</span><b>${num(rows.reduce((sum, row) => sum + number(row.efdQtyLocked), 0))}</b></article></div>${miniTable(["Customer", "Part", "FCT", "PO baseline", "EFD"], rows.map((row) => `<tr><td>${esc(row.customerCode)}</td><td>${esc(row.partCode)}</td><td>${num(row.forecastQtyLocked)}</td><td><b>${num(row.poQtyLocked)}</b></td><td>${num(row.efdQtyLocked)}</td></tr>`))}`;
  }
  async function previewPlanning() {
    if (!state.data?.mps || state.planningBusy) return;
    state.planningBusy = true;
    state.planningMode = "baseline";
    els.planningTitle.textContent = "Lock MPS untuk baseline PO+";
    els.planningMeta.textContent = "Tindakan ini hanya menyimpan pembanding PO+. Status dokumen MPS tetap Draft sampai tombol Approve MPS dijalankan.";
    els.planningBody.innerHTML = `<p>Memeriksa data planning terbaru…</p>`;
    els.planningConfirm.hidden = true;
    els.planningModal.setAttribute("aria-hidden", "false");
    try {
      const body = { mpsNumbers: [state.data.mps.mpsNumber] };
      const preview = await request(`${apiBase}/baseline/preview`, { method: "POST", body: JSON.stringify(body) });
      state.planningPreview = preview;
      els.planningBody.innerHTML = planningTable(preview);
      const canGenerate = !state.data.planningLock?.locked;
      els.planningConfirm.hidden = !canGenerate;
      els.planningConfirm.textContent = "Lock MPS (PO Baseline)";
    } catch (error) {
      els.planningBody.innerHTML = `<p class="mwb-planning-error">${esc(error.message)}</p>`;
    } finally { state.planningBusy = false; }
  }
  async function previewDeltaPlanning() {
    if (!state.data?.planningLock?.locked || state.planningBusy) return;
    state.planningBusy = true;
    state.planningMode = "delta";
    els.planningTitle.textContent = "Preview Delta MPS untuk PO tambahan";
    els.planningMeta.textContent = "Coverage dijalankan berurutan dari free FG stock, firm FG receipt, lalu Delta MPS. Baseline MPS tidak diubah.";
    els.planningBody.innerHTML = `<p>Memeriksa coverage PO tambahan terbaru…</p>`;
    els.planningConfirm.hidden = true;
    els.planningModal.setAttribute("aria-hidden", "false");
    try {
      const lockIds = state.data.planningLock.lockIds || [];
      const preview = await request(`${apiBase}/delta/preview`, { method: "POST", body: JSON.stringify({ lockIds }) });
      state.planningPreview = preview;
      const summary = preview.summary || {};
      els.planningBody.innerHTML = `<div class="mwb-planning-summary"><article><span>PO tambahan</span><b>${num(summary.additionalQty)}</b></article><article><span>Free FG stock</span><b>${num(summary.stockQty)}</b></article><article><span>Firm FG receipt</span><b>${num(summary.firmReceiptQty)}</b></article><article><span>Delta MPS</span><b>${num(summary.deltaMpsQty)}</b></article></div>${miniTable(["Customer", "Part", "Required date", "Pending", "Delta MPS"], (preview.demands || []).map((row) => `<tr><td>${esc(row.customerCode)}</td><td>${esc(row.partCode)}</td><td>${date(row.requiredDate)}</td><td>${num(row.pendingDeltaQty)}</td><td>${num((preview.deltaLines || []).filter((line) => line.baselineLockId === row.baselineLockId).reduce((sum, line) => sum + number(line.qty), 0))}</td></tr>`))}`;
      els.planningConfirm.hidden = false;
      els.planningConfirm.textContent = number(summary.deltaMpsQty) > 0 ? "Generate Delta MPS" : "Simpan Coverage PO Tambahan";
    } catch (error) {
      els.planningBody.innerHTML = `<p class="mwb-planning-error">${esc(error.message)}</p>`;
    } finally { state.planningBusy = false; }
  }
  async function generatePlanning() {
    const preview = state.planningPreview;
    if (!preview || state.planningBusy) return;
    state.planningBusy = true;
    els.planningConfirm.disabled = true;
    const original = els.planningConfirm.textContent;
    els.planningConfirm.textContent = "Generating…";
    try {
      const isDelta = state.planningMode === "delta";
      const body = isDelta
        ? { lockIds: state.data.planningLock.lockIds || [], expectedFingerprint: preview.fingerprint, idempotencyKey: `delta-${els.month.value}-${Date.now()}` }
        : { mpsNumbers: [state.data.mps.mpsNumber], expectedFingerprint: preview.fingerprint };
      const result = await request(`${apiBase}/${isDelta ? "delta/generate" : "baseline/generate"}`, { method: "POST", body: JSON.stringify(body) });
      state.planningBusy = false;
      closePlanningModal();
      showAlert(result.message || (isDelta ? "Delta MPS berhasil dibuat tanpa mengubah baseline." : "Baseline PO berhasil dikunci. Status dokumen MPS tidak berubah dan masih perlu Approve MPS."), true);
      await load({ resetPage: true, quiet: true });
    } catch (error) { els.planningBody.insertAdjacentHTML("afterbegin", `<p class="mwb-planning-error">${esc(error.message)}</p>`); }
    finally { state.planningBusy = false; els.planningConfirm.disabled = false; els.planningConfirm.textContent = original; }
  }
  function render(data) {
    data = enforceFgFinishCap(data);
    state.data = data; renderRows(data); renderDeliveryGate(data); renderFlow(data); renderEfdWindow(data); renderPlanningControls(data); const s = data.summary;
    $("mwb-kpi-demand").textContent = num(s.grossDemandQty); $("mwb-kpi-buffer").textContent = num(s.bufferQty); $("mwb-kpi-free").textContent = num(s.freeOpeningQty); $("mwb-kpi-pegged").textContent = num(s.peggedReservationQty); $("mwb-kpi-receipt").textContent = num(s.firmReceiptQty); $("mwb-kpi-production").textContent = num(s.plannedProductionQty); $("mwb-kpi-risk").textContent = num(s.uncoveredQty); $("mwb-kpi-risk-meta").textContent = `${num((s.varianceCount || 0) + (s.shortageCount || 0))} line perlu review`;
    const selected = els.status.value; els.status.innerHTML = `<option value="">Semua status</option>${data.statuses.map((row) => { const meta = assessmentStatus(row); return `<option value="${esc(row)}">${meta.icon} ${esc(meta.label)}</option>`; }).join("")}`; els.status.value = data.statuses.includes(selected) ? selected : "";
    els.sourceTitle.textContent = data.mps ? `${data.mps.mpsNumber} · ${data.mps.status} · ${label(data.mps.lifecycleStatus)}` : `Belum ada revision MPS untuk delivery filter ${data.period}`;
    const excluded = data.blockedForecasts || [];
    els.sourceMeta.textContent = data.mps ? `Demand horizon ${date(data.mps.periodStart)} – ${date(data.mps.periodEnd)} · dihitung ${date(data.mps.updatedAt)}${data.mps.replanRequired ? ` · REPLAN: ${data.mps.replanReason || "source berubah"}` : ""}` : excluded.length ? `${excluded.map((row) => `${row.forecastNumber} ${row.status} (${num(row.qty)})`).join(" · ")} — dikecualikan; Draft MPS hanya menarik Forecast Confirmed dan SO aktif.` : "Hitung Draft MPS untuk membentuk revision resmi dari demand aktif.";
    els.title.textContent = "Master Production Schedule"; els.meta.textContent = `${num(data.pagination.filtered)} FG · EFD window ${data.efdWindow?.months?.join(" / ") || data.period}`;
    const documentStatus = String(data.mps?.status || "");
    const documentHint = documentStatus === "Draft" ? "Belum Approved" : documentStatus === "Confirmed" ? "Approved" : documentStatus || "Belum ada";
    els.docStatus.textContent = data.mps ? `${data.mps.mpsNumber} · ${documentStatus} · ${documentHint}` : "Belum ada Draft MPS";
    els.docStatus.className = `mwb-doc-status ${String(documentStatus || "empty").toLowerCase()}`;
    els.docStatus.title = data.mps ? `Status dokumen: ${documentStatus}. Lifecycle kalkulasi: ${label(data.mps.lifecycleStatus)}. RCCP: ${label(data.mps.capacityStatus)}.` : "Belum ada dokumen MPS untuk periode ini.";
    els.actionNote.textContent = "Flow otomatis saat create/hitung ulang: MPS netting → RCCP → delivery feasibility → checklist. RCCP tidak membuat Production Order.";
    const start = data.pagination.filtered ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0, end = Math.min(data.pagination.filtered, data.pagination.page * data.pagination.pageSize); els.range.textContent = `${start}–${end} dari ${num(data.pagination.filtered)}`; els.pageLabel.textContent = `Halaman ${data.pagination.page} / ${data.pagination.pages}`; els.prev.disabled = data.pagination.page <= 1; els.next.disabled = data.pagination.page >= data.pagination.pages;
  }
  async function load({ resetPage = false, quiet = false } = {}) { if (state.loading) return; if (resetPage) state.page = 1; state.loading = true; if (!quiet) els.body.innerHTML = '<tr><td colspan="21" class="mwb-empty">Menghitung MPS dari EFD, stock, delivery, RCCP, dan checklist feasibility…</td></tr>'; try { const data = await request(`${apiBase}/workbench?${query()}`); render(data); showAlert(data.mps?.replanRequired ? data.mps.replanReason || "EFD berubah; hitung ulang Draft MPS." : ""); } catch (error) { showAlert(error.message); els.body.innerHTML = `<tr><td colspan="21" class="mwb-empty">${esc(error.message)}</td></tr>`; } finally { state.loading = false; } }
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
    const ledger = item.ledger.map((r) => `<tr><td>${date(r.eventDate)}</td><td>${esc(label(r.eventType))}<br><small>${esc(r.reference || "")}</small></td><td>${num(r.reservedUsedQty)}</td><td>${num(r.freeUsedQty)}</td><td>${num(r.plannedProductionQty ?? r.qtyIn)}</td><td>${num(r.qtyOut)}</td><td>${num(r.projectedFreeQty)}</td><td class="${r.uncoveredQty > 0 ? "SHORTAGE" : ""}">${esc(r.formula || r.note || "")}</td></tr>`);
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
  function openModal(mode = "sync") {
    state.modalMode = mode;
    els.confirm.checked = false;
    if (mode === "recalculate") {
      const poDeltaQty = number(state.data?.planningLock?.poDeltaQty);
      const changedParts = number(state.data?.planningLock?.changedPartCount ?? (state.data?.items || []).filter((item) => Math.abs(number(item.planMetrics?.poDeltaQty)) > 0.000001).length);
      els.modalEyebrow.textContent = "APPLY PO+ TO PRODUCTION";
      els.modalTitle.textContent = "Recalculate MPS";
      els.modalCopy.textContent = "Perubahan PO setelah Lock MPS akan diterapkan ke demand dan production plan.";
      els.modalMessage.textContent = `Periode ${els.month.value}: terapkan total PO+ ${signedNum(poDeltaQty)} pada ${changedParts} part, lalu perbarui baseline setelah perhitungan berhasil.`;
      els.modalSubmit.textContent = "Terapkan PO+ & Recalculate";
    } else {
      const recalculatingExistingMps = Boolean(state.data?.mps);
      els.modalEyebrow.textContent = "CALCULATE OFFICIAL DRAFT";
      els.modalTitle.textContent = recalculatingExistingMps ? "Hitung Ulang MPS" : "Buat Draft MPS";
      els.modalCopy.textContent = "Demand, stock, MPS netting, RCCP, delivery feasibility, dan checklist akan dihitung dalam satu proses.";
      els.modalMessage.textContent = `Periode ${els.month.value}: sistem akan ${recalculatingExistingMps ? "memperbarui" : "membentuk"} Draft MPS kanonis lalu menyimpan hasil evaluasi otomatisnya.`;
      els.modalSubmit.textContent = recalculatingExistingMps ? "Hitung Ulang & Simpan" : "Hitung & simpan Draft";
    }
    els.modal.setAttribute("aria-hidden", "false");
  }
  function closeModal() { els.modal.setAttribute("aria-hidden", "true"); }
  function closeFormulaModal() { els.formulaModal.setAttribute("aria-hidden", "true"); }
  function openFormulaModal(button) {
    const item = state.data?.items.find((row) => row.id === button.dataset.itemId);
    if (!item) return;
    const kind = button.dataset.formulaKind;
    const phases = [...(item.phases || []), ...(item.bufferPhase ? [item.bufferPhase] : [])];
    const phase = phases.find((row, index) => String(row.id || index) === String(button.dataset.phaseId));
    let title = `Formula MPS Qty · ${item.partCode}`;
    let meta = `${item.partNumber || item.partCode} · ${item.mpsNumber}`;
    let equation = "";
    let rows = [];
    if (kind === "root") {
      const m = item.metrics || {};
      equation = `max((Gross ${num(m.grossDemandQty)} + Buffer ${num(m.targetEndingStockQty)} - Opening ${num(m.openingNettableQty)} - Firm receipt ${num(m.firmReceiptQty)}) × ${num(item.productionPercent)}%, shortage SO) = ${num(m.plannedProductionQty)}`;
      rows = [["Gross demand", m.grossDemandQty], ["Target buffer akhir", m.targetEndingStockQty], ["Opening nettable", m.openingNettableQty], ["Firm receipt", m.firmReceiptQty], ["MPS Qty", m.plannedProductionQty]];
    } else if (kind === "phase" && phase) {
      title = `${phase.sourceType === "BUFFER" ? "Formula Batch Buffer" : "Formula MPS Qty Phase"} · ${item.partCode}`;
      meta = `${phase.sourceNumber || "BUFFER"} · selesai ${date(phase.fgRequiredDate)}`;
      const customerQty = number(phase.customerProductionQty ?? (phase.sourceType === "BUFFER" ? 0 : phase.plannedProductionQty));
      const bufferQty = number(phase.bufferAllocatedQty ?? (phase.sourceType === "BUFFER" ? phase.plannedProductionQty : 0));
      equation = `${num(customerQty)} kebutuhan customer + ${num(bufferQty)} alokasi buffer = ${num(phase.plannedProductionQty)} MPS Qty`;
      rows = [["Produksi customer", customerQty], ["Buffer pada phase", bufferQty], ["MPS Qty phase", phase.plannedProductionQty]];
    } else if (kind === "component" && phase) {
      const component = (item.components || []).find((row) => row.partCode === button.dataset.partCode);
      const netting = component?.phaseNetting?.find((row) => String(row.phaseId) === String(phase.id || button.dataset.phaseId)) || component?.phaseNetting?.[phases.indexOf(phase)] || {};
      title = `Formula MPS Qty · ${component?.partCode || "Child part"}`;
      meta = `${component?.partNumber || component?.partCode || "-"} · ${phase.sourceNumber || "BUFFER"}`;
      const dependencies = Array.isArray(netting.dependencies) ? netting.dependencies : [];
      const dependencyEquation = dependencies.map((dependency) => `${num(dependency.qtyPerParent)} × ${num(dependency.parentPlannedQty)} produksi ${dependency.parentPartCode}`).join(" + ");
      const cumulativeLeadTime = netting.leadTime || {};
      equation = `${dependencyEquation || `${num(component?.qtyPerFg)} × ${num(phase.plannedProductionQty ?? phase.qty)} produksi parent`} = ${num(netting.grossRequirementQty)} gross; ${num(netting.grossRequirementQty)} - ${num(netting.stockUsedQty)} stock - ${num(netting.firmReceiptUsedQty)} firm receipt = ${num(netting.plannedOrderQty)} MPS Qty. ${number(netting.plannedOrderQty) <= 0 ? "MPS Qty 0; tidak ada task solver." : cumulativeLeadTime.calculationMethod === "OFFICIAL_MRP_OR_TOOLS_WASM_CP_SAT" ? `Netting time mengikuti official MRP OR-Tools CP-SAT: ${date(cumulativeLeadTime.startDate)} sampai ${date(cumulativeLeadTime.endDate)} (${num(cumulativeLeadTime.totalDays)} hari kalender).` : "Jalankan official MRP untuk memperoleh netting time CP-SAT."}`;
      rows = [
        ...dependencies.map((dependency) => [`Produksi parent ${dependency.parentPartCode} × ${num(dependency.qtyPerParent)}`, dependency.parentPlannedQty]),
        ["Stock awal phase", netting.openingStockQty], ["Gross requirement", netting.grossRequirementQty], ["Stock dipakai", netting.stockUsedQty], ["Sisa stock ke phase berikut", netting.endingStockQty], ["Firm receipt dipakai", netting.firmReceiptUsedQty], ["MPS Qty child", netting.plannedOrderQty],
        ["Cycle load sendiri (jam)", cumulativeLeadTime.ownCycleLoadHours], ["Lead time level atas (jam)", cumulativeLeadTime.parentHours], ["Vendor kumulatif (hari)", cumulativeLeadTime.vendorLeadTimeDays], ["Penyesuaian minimum 2 jam", cumulativeLeadTime.minimumLeadTimeAdjustmentHours], ["Jam kerja per hari", 14], ["Lead time WIP kumulatif (hari)", cumulativeLeadTime.totalDays],
      ];
    }
    els.formulaTitle.textContent = title;
    els.formulaMeta.textContent = meta;
    els.formulaBody.innerHTML = `<div class="mwb-formula-equation">${esc(equation)}</div><dl>${rows.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${num(value)}</dd></div>`).join("")}</dl>`;
    els.formulaModal.setAttribute("aria-hidden", "false");
  }
  function closeRowMenu() { els.rowMenu.hidden = true; state.rowItem = null; state.phaseAction = null; }
  function openRowMenu(button, item) {
    state.rowItem = item;
    state.phaseAction = null;
    els.rowMenu.innerHTML = '<button type="button" role="menuitem" data-row-action="buffer"><span>◫</span><b>Edit Buffer Stock</b></button><button type="button" role="menuitem" data-row-action="confirm"><span>✓</span><b>Approve MPS</b></button>';
    const rect = button.getBoundingClientRect();
    els.rowMenu.style.left = `${Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198))}px`;
    els.rowMenu.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 116)}px`;
    els.rowMenu.querySelector('[data-row-action="buffer"]').disabled = state.data?.mps?.lifecycleStatus === "APPROVED";
    els.rowMenu.querySelector('[data-row-action="confirm"]').disabled = !state.data?.rccp?.approvalAllowed || state.data?.deliveryGate?.officialGateStatus === "BLOCKED";
    els.rowMenu.hidden = false;
  }
  function openPhaseMenu(button, item, phase) {
    const status = phase.feasibility || deliveryStatus.phaseStatus(phase.feasibilitySnapshot || {});
    const links = deliveryStatus.actionLinks(phase.deliveryTargetId);
    state.rowItem = null;
    state.phaseAction = { item, phase };
    els.rowMenu.innerHTML = `<button type="button" role="menuitem" data-phase-detail="${esc(links.detail)}"><span>?</span><b>Detail Feasibility</b></button>${status.canRecovery ? `<button type="button" role="menuitem" data-phase-action="${esc(links.recovery)}"><span>↻</span><b>Konfirmasi Recovery</b></button>` : ""}${status.canAcceptLate ? `<button type="button" role="menuitem" data-phase-action="${esc(links.acceptLate)}"><span>!</span><b>Konfirmasi Accept Late</b></button>` : ""}`;
    const rect = button.getBoundingClientRect();
    els.rowMenu.style.left = `${Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228))}px`;
    els.rowMenu.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 154)}px`;
    els.rowMenu.hidden = false;
  }
  function openBufferModal(item) {
    state.bufferItem = item;
    els.bufferPart.textContent = `${item.partNumber || item.partCode} · ${item.partCode}`;
    els.bufferPercent.value = number(item.bufferPercent);
    const mode = item.bufferAllocationMode === "DISTRIBUTE_TO_PHASES" ? "DISTRIBUTE_TO_PHASES" : "SEPARATE_END_MONTH";
    els.bufferForm.querySelector(`input[name="bufferAllocationMode"][value="${mode}"]`).checked = true;
    els.bufferMessage.textContent = `Buffer ${num(item.bufferQty)} dihitung dari EFD ${item.nextForecastMonth} × ${num(item.bufferPercent)}%.${state.data?.mps?.status === "Confirmed" ? " Perubahan akan membuka schedule kembali menjadi Draft dan MRP perlu dijalankan ulang." : ""}`;
    els.bufferModal.setAttribute("aria-hidden", "false");
  }
  function closeBufferModal() { els.bufferModal.setAttribute("aria-hidden", "true"); state.bufferItem = null; }
  function rccpExceptionMarkup(exceptions = []) {
    if (!exceptions.length) return "";
    return `<b>RCCP belum dapat diselesaikan</b><ul>${exceptions.map((item) => `<li>${esc(item.message || item.code || item)}</li>`).join("")}</ul>`;
  }
  function rccpBucketContributions(run, resourceCode, bucketKey) {
    const load = (run?.loads || []).find((row) => row.resourceCode === resourceCode);
    return (Array.isArray(load?.partBreakdown) ? load.partBreakdown : []).flatMap((part) =>
      (Array.isArray(part.bucketAllocations) ? part.bucketAllocations : [])
        .filter((allocation) => String(allocation.bucketStart).slice(0, 10) === bucketKey)
        .map((allocation) => ({ ...part, allocation })));
  }
  function openRccpBucketTrace(resourceCode, bucketKey) {
    const run = state.rccpRun;
    const bucket = (run?.timeBuckets || []).find((row) => row.resourceCode === resourceCode
      && String(row.bucketStart).slice(0, 10) === bucketKey);
    if (!bucket) return;
    const contributions = rccpBucketContributions(run, resourceCode, bucketKey);
    els.formulaTitle.textContent = `${resourceCode} · Minggu ${dateRange(bucket.bucketStart, bucket.bucketEnd)}`;
    els.formulaMeta.textContent = `Bucket ${bucket.isPreviousMonth ? "M-1" : "M"}; tanggal proses aktual ditampilkan per sumber di bawah`;
    const equation = contributions.length
      ? `${contributions.map((item) => `${num(item.allocation.hours)} h`).join(" + ")} = ${num(bucket.currentMpsLoad)} h`
      : `${num(bucket.currentMpsLoad)} / ${num(bucket.availableCapacity)} h = ${num(bucket.loadPercentage)}%`;
    const rows = contributions.map((item) => {
      const source = item.sourceNumber || item.sourceType || "MPS";
      const days = `${num(item.allocation.workingDays)}/${num(item.allocation.totalWorkingDays)} hari`;
      const processDates = dateRange(item.calculatedStartDate, item.calculatedFinishDate);
      return [`${source} · FG Due ${date(item.requiredDate)}`, `${num(item.resourceRequirementQty)} pcs · proses ${processDates} · ${days} · ${num(item.allocation.hours)} h`];
    });
    rows.push(["Available Capacity", `${num(bucket.availableCapacity)} h`], ["Load", `${num(bucket.loadPercentage)}%`]);
    els.formulaBody.innerHTML = `<div class="mwb-formula-equation">${esc(equation)}</div><dl>${rows.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
    els.formulaModal.setAttribute("aria-hidden", "false");
  }
  function renderRccpWeekly(run) {
    const buckets = run?.timeBuckets || [];
    const weeks = [...new Map(buckets.map((row) => [String(row.bucketStart).slice(0, 10), row])).entries()];
    const resources = [...new Set(buckets.map((row) => row.resourceCode))];
    if (!weeks.length) { els.rccpWeekly.innerHTML = '<p class="mwb-empty">Weekly bucket belum tersedia.</p>'; return; }
    els.rccpWeekly.innerHTML = `<table class="mwb-rccp-table mwb-rccp-weekly-table" data-enterprise-table="off"><thead><tr><th>Resource</th>${weeks.map(([, row]) => `<th class="${row.isPreviousMonth ? "is-offset" : ""}"><span>Minggu ${date(row.bucketStart)}</span><small>s.d. ${date(row.bucketEnd)} · ${row.isPreviousMonth ? "M-1" : "M"}</small></th>`).join("")}<th>Status</th></tr></thead><tbody>${resources.map((resourceCode) => {
      const rows = buckets.filter((row) => row.resourceCode === resourceCode);
      const status = rows.filter((row) => number(row.currentMpsLoad) > 0).sort((a, b) => number(b.loadPercentage) - number(a.loadPercentage))[0]?.status || "FEASIBLE";
      return `<tr><td><b>${esc(resourceCode)}</b><small>${esc(rows[0]?.resourceType || "INTERNAL")}</small></td>${weeks.map(([key]) => {
        const row = rows.find((item) => String(item.bucketStart).slice(0, 10) === key);
        const contributions = row ? rccpBucketContributions(run, resourceCode, key) : [];
        const content = `<b>${row ? `${num(row.loadPercentage)}%` : "—"}</b><small>${row ? `${num(row.currentMpsLoad)} / ${num(row.availableCapacity)} h` : ""}</small>${contributions.length ? `<em>${num(contributions.length)} sumber · lihat audit</em>` : ""}`;
        return `<td class="mwb-rccp-week-cell ${row?.isPreviousMonth ? "is-offset" : ""}">${contributions.length ? `<button type="button" data-rccp-bucket="${esc(key)}" data-rccp-resource="${esc(resourceCode)}" aria-label="Lihat sumber load ${esc(resourceCode)} minggu ${esc(dateRange(row.bucketStart, row.bucketEnd))}">${content}</button>` : content}</td>`;
      }).join("")}<td><span class="mwb-capacity-pill ${capacityTone(status)}">${esc(label(status))}</span></td></tr>`;
    }).join("")}</tbody></table>`;
  }
  function renderRccpTimeline(run) {
    const groups = new Map();
    for (const row of run?.offsetDetails || []) {
      const key = `${row.mpsDetailId}|${row.mpsPhaseId || row.requiredDate}`;
      const group = groups.get(key) || { partCode: row.partCode, qty: row.phaseQty, requiredDate: row.requiredDate, rows: [] };
      group.rows.push(row); groups.set(key, group);
    }
    els.rccpTimeline.innerHTML = [...groups.values()].map((group, index) => `<article class="mwb-rccp-timeline-phase"><header><h4>${esc(group.partCode)} · Phase ${index + 1} · ${num(group.qty)} pcs</h4><span>FG Due ${date(group.requiredDate)}</span></header><div class="mwb-rccp-timeline-flow">${group.rows.sort((a, b) => number(a.sequence) - number(b.sequence)).map((row, rowIndex) => `${rowIndex ? '<i class="mwb-rccp-timeline-arrow">→</i>' : ""}<div class="mwb-rccp-timeline-step"><b>${esc(row.resourceCode)}</b><small>${date(row.calculatedStartDate)}${String(row.calculatedFinishDate).slice(0, 10) !== String(row.calculatedStartDate).slice(0, 10) ? ` – ${date(row.calculatedFinishDate)}` : ""}</small><small>${num(row.leadTimeValue)} ${esc(label(row.leadTimeUnit))} · ${esc(row.calendarId || "Calendar")}</small><span class="mwb-capacity-pill ${capacityTone(row.status)}">${num(row.loadPercentage)}%</span></div>`).join("")}<i class="mwb-rccp-timeline-arrow">→</i><div class="mwb-rccp-timeline-step"><b>FG DUE</b><small>${date(group.requiredDate)}</small></div></div></article>`).join("") || '<p class="mwb-empty">Timeline belum tersedia.</p>';
  }
  function renderRccpRecommendations(run) {
    const rows = run?.recommendations || [];
    els.rccpRecommendations.hidden = !rows.length;
    els.rccpRecommendations.innerHTML = rows.length ? `<header><div><small>FEASIBILITY RECOMMENDATION</small><h3>Earlier feasible start</h3></div></header>${rows.map((row) => `<article class="mwb-rccp-recommendation"><div><h4>${esc(row.resourceCode)} · ${esc(label(row.recommendationType))}</h4><p>${esc(row.reason || "Pindahkan capacity allocation tanpa mengubah FG Required Date.")}</p><dl><div><dt>Calculated Start</dt><dd>${date(row.originalStartDate)} · ${num(row.originalLoadPercentage)}%</dd></div><div><dt>Recommended</dt><dd>${date(row.recommendedStartDate)} · ${num(row.recommendedLoadPercentage)}%</dd></div><div><dt>Status</dt><dd>${esc(label(row.status))}</dd></div></dl></div>${row.status === "PROPOSED" ? `<button class="btn btn-primary" type="button" data-rccp-recommendation="${esc(row.id)}">Use Recommendation</button>` : '<span class="mwb-capacity-pill success">APPLIED</span>'}</article>`).join("")}` : "";
  }
  function renderRccp(run) {
    state.rccpRun = run || null;
    els.rccpResults.hidden = false;
    const loads = run?.loads || [];
    const maxLoad = loads.reduce((max, row) => Math.max(max, number(row.loadPercentage)), 0);
    const overloaded = loads.filter((row) => row.status === "OVERLOAD").length;
    const warning = loads.filter((row) => row.status === "WARNING").length;
    els.rccpMeta.textContent = run ? `${state.data?.mps?.mpsNumber || "MPS"} · revision ${num(run.mpsRevision)} · dihitung ${date(run.completedAt || run.createdAt)}` : "Belum ada RCCP run.";
    els.rccpSummary.innerHTML = run ? `
      <article><span>Status</span><b class="${capacityTone(run.status)}">${esc(label(run.status))}</b></article>
      <article><span>MPS Qty</span><b>${num(run.mpsQtySnapshot)} pcs</b></article>
      <article><span>Capacity Horizon</span><b>${date(run.capacityHorizonStart)} – ${date(run.capacityHorizonEnd)}</b></article>
      <article><span>Earliest Start</span><b>${date(run.earliestStartDate)}</b></article>
      <article><span>Offset Status</span><b class="${run.hasPreviousMonthLoad ? "warning" : "success"}">${esc(label(run.offsetStatus))}</b></article>
      <article><span>Maximum load</span><b>${num(maxLoad)}%</b></article>
      <article><span>Exception</span><b>${num(overloaded)} overload · ${num(warning)} warning</b></article>` : "";
    els.rccpOffsetWarning.hidden = !run?.hasPreviousMonthLoad;
    els.rccpOffsetWarning.innerHTML = run?.hasPreviousMonthLoad ? `<span>OFFSET TO M-1</span><div><b>Produksi harus dimulai pada ${date(run.earliestStartDate)}</b><small>MPS tetap ${date(run.planningPeriod)}. RCCP otomatis memeriksa capacity bulan sebelumnya sampai FG due ${date(run.latestRequiredDate)}.</small></div>` : "";
    renderRccpWeekly(run);
    renderRccpTimeline(run);
    renderRccpRecommendations(run);
    els.rccpBody.innerHTML = loads.length ? loads.map((row) => `<tr>
      <td><b>${esc(row.resourceCode)}</b><small>${esc(row.resourceName || row.resourceCode)}</small></td>
      <td>${num(row.currentMpsLoad)} h</td><td>${num(row.existingLoad)} h</td><td><b>${num(row.totalLoad)} h</b></td>
      <td>${num(row.availableCapacity)} h<small>${num(row.workingDays)} hari × ${num(row.shiftsPerDay)} shift</small></td>
      <td><b>${num(row.loadPercentage)}%</b></td><td><span class="mwb-capacity-pill ${capacityTone(row.status)}">${esc(label(row.status))}</span></td>
    </tr>`).join("") : `<tr><td colspan="7">${run ? "Tidak ada critical resource pada hasil ini." : "Belum ada hasil RCCP."}</td></tr>`;
    const needsReason = run && ((run.status === "WARNING" && !run.acknowledgedAt) || run.status === "OVERLOAD");
    els.rccpReasonField.hidden = !needsReason;
    els.rccpReason.value = "";
    const planningExceptions = Array.isArray(run?.exceptions) ? run.exceptions : [];
    els.rccpExceptions.hidden = !planningExceptions.length;
    els.rccpExceptions.innerHTML = rccpExceptionMarkup(planningExceptions);
    let actions = '<button type="button" class="btn btn-outline-secondary" data-close-rccp-modal>Kembali ke MPS</button>';
    if (run?.status === "WARNING" && !run.acknowledgedAt) actions += '<button type="button" class="btn btn-warning" data-rccp-action="acknowledge">Acknowledge Warning</button>';
    else if (run?.status === "OVERLOAD") actions += '<button type="button" class="btn btn-outline-secondary" data-rccp-action="revise">Revisi MPS</button><button type="button" class="btn btn-danger" data-rccp-action="override">Authorized Override</button>';
    else if (run?.approvalAllowed) actions += `<button type="button" class="btn btn-primary" data-close-rccp-modal>${run.status === "OVERRIDDEN" ? "Override Tercatat" : run.status === "WARNING" ? "Warning Diterima" : "Capacity Confirmed"}</button>`;
    els.rccpActions.innerHTML = actions;
  }
  function closeRccpModal() { els.rccpModal.setAttribute("aria-hidden", "true"); }
  async function openRccp() {
    const mps = state.data?.mps;
    if (!mps) return showAlert("MPS periode ini belum ada.");
    els.rccpModal.setAttribute("aria-hidden", "false");
    els.rccpResults.hidden = false;
    els.rccpMeta.textContent = "Memuat hasil RCCP otomatis…";
    els.rccpSummary.innerHTML = "";
    els.rccpBody.innerHTML = '<tr><td colspan="7">Memuat RCCP…</td></tr>';
    els.rccpReasonField.hidden = true;
    els.rccpExceptions.hidden = true;
    els.rccpActions.innerHTML = '<button type="button" class="btn btn-outline-secondary" data-close-rccp-modal>Kembali ke MPS</button>';
    try {
      const result = await request(`${apiBase}/${encodeURIComponent(mps.mpsNumber)}/rccp/latest`);
      const run = result.rccp ?? result;
      if (!run) throw new Error("Belum ada hasil RCCP otomatis. Buat atau hitung ulang MPS untuk menjalankannya.");
      renderRccp(run);
      await load({ quiet: true });
    } catch (error) {
      state.rccpRun = null;
      els.rccpMeta.textContent = error.message;
      els.rccpBody.innerHTML = '<tr><td colspan="7">RCCP belum tersedia.</td></tr>';
      els.rccpExceptions.innerHTML = rccpExceptionMarkup(error.payload?.exceptions || [{ message: error.message }]);
      els.rccpExceptions.hidden = false;
    }
  }
  function openActionModal(action) {
    const mps = state.data?.mps;
    if (!mps) return showAlert("MPS periode ini belum ada.");
    state.action = action;
    els.actionConfirm.checked = false;
    if (action === "confirm") {
      els.actionTitle.textContent = "Approve / Freeze MPS";
      els.actionDescription.textContent = "Approve MPS setelah RCCP dinyatakan layak atau exception kapasitas sudah disetujui.";
      els.actionMessage.textContent = `${mps.mpsNumber} akan berubah menjadi Approved / Demand Frozen. Approval ini tidak membuat Production Order.`;
      els.actionConfirmCopy.textContent = "Saya sudah mengaudit demand, stock, MPS Qty, serta hasil RCCP dan exception kapasitasnya.";
      els.actionSubmit.textContent = "Approve MPS";
    } else {
      els.actionTitle.textContent = state.data.mrp ? "Hitung Revision MRP" : "Hitung MRP";
      els.actionDescription.textContent = "Explode BOM dan lakukan time-phased netting sebagai working revision untuk direview PPIC.";
      els.actionMessage.textContent = `${mps.mpsNumber} akan dihitung untuk horizon ${date(mps.periodStart)} – ${date(mps.periodEnd)}. Hasil berstatus Simulated sampai PPIC melakukan Approve.`;
      els.actionConfirmCopy.textContent = "Saya memahami hasil kalkulasi belum menjadi sumber Production Plan, PR, atau PO sebelum Approved.";
      els.actionSubmit.textContent = state.data.mrp ? "Hitung Revision" : "Hitung MRP";
    }
    els.actionModal.setAttribute("aria-hidden", "false");
  }
  function closeActionModal() { els.actionModal.setAttribute("aria-hidden", "true"); state.action = null; }
  els.body.addEventListener("click", (event) => {
    const feasibilityButton = event.target.closest("[data-feasibility-line]");
    if (feasibilityButton) { event.preventDefault(); event.stopPropagation(); openFeasibility(feasibilityButton.dataset.feasibilityLine, feasibilityButton); return; }
    const rccpButton = event.target.closest("[data-view-rccp]");
    if (rccpButton && rccpButton.dataset.viewRccp) { event.preventDefault(); openRccp(); return; }
    const formula = event.target.closest("[data-formula-kind]");
    if (formula) { event.preventDefault(); openFormulaModal(formula); return; }
    const directPhaseDetail = event.target.closest("[data-phase-detail-direct]");
    if (directPhaseDetail) { event.preventDefault(); openGateDrawer(directPhaseDetail.dataset.phaseDetailDirect); return; }
    const menuButton = event.target.closest("[data-row-menu]");
    if (menuButton) { event.preventDefault(); const item = state.data?.items.find((row) => row.id === menuButton.dataset.rowMenu); if (item) openRowMenu(menuButton, item); return; }
    const phaseMenuButton = event.target.closest("[data-phase-menu]");
    if (phaseMenuButton) {
      event.preventDefault();
      const item = state.data?.items.find((row) => row.id === phaseMenuButton.dataset.phaseMenu);
      const phases = deliveryStatus.decoratePhases(item?.phases || [], state.data?.deliveryGate?.snapshots || []);
      const phase = phases.find((row) => String(row.id) === String(phaseMenuButton.dataset.phaseId));
      if (item && phase) openPhaseMenu(phaseMenuButton, item, phase);
      return;
    }
    const batchToggle = event.target.closest("[data-toggle-batch]");
    if (batchToggle) { const key = batchToggle.dataset.toggleBatch; state.expandedBatches.has(key) ? state.expandedBatches.delete(key) : state.expandedBatches.add(key); renderRows(state.data); return; }
    const toggle = event.target.closest("[data-toggle-row]");
    if (toggle) { const id = toggle.dataset.toggleRow; state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); renderRows(state.data); return; }
    const button = event.target.closest("[data-detail]"); if (!button) return; event.preventDefault(); const item = state.data?.items.find((row) => row.id === button.dataset.detail); if (item) openDetail(item);
  });
  els.rccpWeekly.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rccp-bucket]");
    if (!button) return;
    openRccpBucketTrace(button.dataset.rccpResource, button.dataset.rccpBucket);
  });
  els.rowMenu.addEventListener("click", (event) => {
    const phaseDetail = event.target.closest("[data-phase-detail]");
    if (phaseDetail && state.phaseAction) {
      const deliveryTargetId = phaseDetail.dataset.phaseDetail;
      closeRowMenu();
      openGateDrawer(deliveryTargetId);
      return;
    }
    const phaseAction = event.target.closest("[data-phase-action]");
    if (phaseAction && state.phaseAction) {
      const selectedPhase = state.phaseAction;
      const requestedAction = phaseAction.dataset.phaseAction;
      closeRowMenu();
      loadRecoveryPlan(selectedPhase.item, selectedPhase.phase, requestedAction);
      return;
    }
    const button = event.target.closest("[data-row-action]");
    if (!button || button.disabled || !state.rowItem) return;
    const item = state.rowItem;
    closeRowMenu();
    if (button.dataset.rowAction === "buffer") openBufferModal(item);
    else if (button.dataset.rowAction === "confirm") openActionModal("confirm");
  });
  els.bufferForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const item = state.bufferItem;
    if (!item || !state.data?.mps) return;
    const bufferPercent = number(els.bufferPercent.value);
    if (bufferPercent < 0 || bufferPercent > 100) { els.bufferMessage.textContent = "Buffer harus antara 0 sampai 100%."; return; }
    const bufferAllocationMode = els.bufferForm.querySelector('input[name="bufferAllocationMode"]:checked')?.value || "SEPARATE_END_MONTH";
    els.bufferSubmit.disabled = true;
    els.bufferSubmit.textContent = "Menyimpan…";
    try {
      await request(`${apiBase}/${encodeURIComponent(state.data.mps.mpsNumber)}/adjustments`, {
        method: "PATCH",
        body: JSON.stringify({ detailIds: [item.id], bufferPercent, productionPercent: number(item.productionPercent ?? 100), scope: "line", bufferAllocationMode }),
      });
      closeBufferModal();
      showAlert(`Buffer ${item.partCode} berhasil diperbarui dan netting phase dihitung ulang.`, true);
      await load({ resetPage: true, quiet: true });
    } catch (error) { els.bufferMessage.textContent = error.message; }
    finally { els.bufferSubmit.disabled = false; els.bufferSubmit.textContent = "Simpan Buffer"; }
  });
  els.modalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!els.confirm.checked) return;
    const isRecalculate = state.modalMode === "recalculate";
    els.modalSubmit.disabled = true;
    els.modalSubmit.textContent = isRecalculate ? "Menerapkan PO+…" : "Menghitung…";
    try {
      const endpoint = isRecalculate ? "recalculate" : "monthly-sync";
      const result = await request(`${apiBase}/${endpoint}`, { method: "POST", body: JSON.stringify({ months: [els.month.value], planningAnchorMonth: els.month.value }) });
      closeModal();
      const solverEvidence = result.solverRun?.runNumber
        ? ` · ${result.solverRun.runNumber} · ${num(result.solverRun.targetCount)} target`
        : "";
      const automaticFailures = (result.automaticEvaluation?.items || []).flatMap((item) => [item.rccp, item.delivery, item.checklist]
        .filter((step) => step && step.completed === false)
        .map((step) => `${item.mpsNumber}: ${step.message}`));
      showAlert(`${result.message || (isRecalculate ? "PO+ berhasil diterapkan ke MPS." : "Draft MPS berhasil dihitung.")}${solverEvidence}${automaticFailures.length ? ` · ${automaticFailures.join(" · ")}` : ""}`, automaticFailures.length === 0);
      await load({ resetPage: true, quiet: true });
    } catch (error) { showAlert(error.message); }
    finally { els.modalSubmit.disabled = false; els.modalSubmit.textContent = isRecalculate ? "Terapkan PO+ & Recalculate" : state.data?.mps ? "Hitung Ulang & Simpan" : "Hitung & simpan Draft"; }
  });
  els.actionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!els.actionConfirm.checked || !state.action || !state.data?.mps) return;
    const action = state.action;
    const originalLabel = els.actionSubmit.textContent;
    els.actionSubmit.disabled = true;
    els.actionSubmit.textContent = action === "confirm" ? "Mengonfirmasi…" : "Menghitung MRP…";
    try {
      const mpsNumber = state.data.mps.mpsNumber;
      const result = action === "confirm"
        ? await request(`${apiBase}/${encodeURIComponent(mpsNumber)}/approve`, { method: "PATCH", body: "{}" })
        : await request("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ mpsNumber, planningMode: "OFFICIAL" }) });
      closeActionModal();
      if (action === "confirm") {
        showAlert(`${result.mpsNumber || mpsNumber} berhasil di-approve setelah RCCP dan delivery gate.`, true);
        await load({ resetPage: true, quiet: true });
        window.PpicWorkflow?.refresh(els.month.value);
      } else {
        showAlert(`${result.runNumber || "MRP"} selesai dihitung dan siap direview.`, true);
        location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber)}`;
      }
    } catch (error) {
      showAlert(error.message);
    } finally {
      els.actionSubmit.disabled = false;
      els.actionSubmit.textContent = originalLabel;
    }
  });
  els.rccpRecommendations.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rccp-recommendation]");
    if (!button || !state.rccpRun) return;
    button.disabled = true;
    try {
      const result = await request(`${apiBase}/rccp/${encodeURIComponent(state.rccpRun.id)}/recommendations/${encodeURIComponent(button.dataset.rccpRecommendation)}/apply`, { method: "POST", body: "{}" });
      renderRccp(result);
      showAlert("Recommendation diterapkan pada planned production start dan capacity allocation; FG Required Date tidak berubah.", true);
      await load({ quiet: true });
    } catch (error) {
      els.rccpExceptions.innerHTML = rccpExceptionMarkup([{ message: error.message }]);
      els.rccpExceptions.hidden = false;
      button.disabled = false;
    }
  });
  els.rccpActions.addEventListener("click", async (event) => {
    const close = event.target.closest("[data-close-rccp-modal]");
    if (close) { closeRccpModal(); return; }
    const button = event.target.closest("[data-rccp-action]");
    if (!button || !state.rccpRun) return;
    if (button.dataset.rccpAction === "revise") { closeRccpModal(); showAlert("Revisi MPS Qty atau buffer, lalu gunakan Hitung Ulang MPS agar RCCP diperbarui otomatis."); return; }
    const reason = els.rccpReason.value.trim();
    if (reason.length < 5) { els.rccpExceptions.innerHTML = rccpExceptionMarkup([{ message: "Alasan minimal 5 karakter." }]); els.rccpExceptions.hidden = false; return; }
    const action = button.dataset.rccpAction;
    button.disabled = true;
    try {
      const result = await request(`${apiBase}/rccp/${encodeURIComponent(state.rccpRun.id)}/${action === "acknowledge" ? "acknowledge" : "override"}`, { method: "POST", body: JSON.stringify({ reason }) });
      renderRccp(result);
      showAlert(action === "acknowledge" ? "Warning RCCP sudah di-acknowledge. MPS dapat di-approve." : "Authorized overload override sudah tercatat. MPS dapat di-approve.", true);
      await load({ quiet: true });
    } catch (error) {
      els.rccpExceptions.innerHTML = rccpExceptionMarkup(error.payload?.exceptions || [{ message: error.message }]);
      els.rccpExceptions.hidden = false;
      button.disabled = false;
    }
  });
  els.zoomOut.addEventListener("click", () => setDrawerZoom(state.zoom - .1));
  els.zoomIn.addEventListener("click", () => setDrawerZoom(state.zoom + .1));
  els.zoomLabel.addEventListener("click", () => setDrawerZoom(1));
  els.fullscreen.addEventListener("click", () => toggleDrawerFullscreen());
  setDrawerZoom(1);
  els.sync.addEventListener("click", () => openModal("sync")); if (els.bulkAcceptLate) els.bulkAcceptLate.addEventListener("click", runBulkAcceptLate); els.confirmMps.addEventListener("click", () => openActionModal("confirm")); els.runMrp.addEventListener("click", () => openActionModal("mrp")); if (els.deliveryGateDetails) els.deliveryGateDetails.addEventListener("click", () => openGateDrawer()); document.querySelectorAll("[data-close-modal]").forEach((node) => node.addEventListener("click", closeModal)); document.querySelectorAll("[data-close-action-modal]").forEach((node) => node.addEventListener("click", closeActionModal)); document.querySelectorAll("[data-close-planning-modal]").forEach((node) => node.addEventListener("click", closePlanningModal)); document.querySelectorAll("[data-close-formula-modal]").forEach((node) => node.addEventListener("click", closeFormulaModal)); document.querySelectorAll("[data-close-feasibility-modal]").forEach((node) => node.addEventListener("click", closeFeasibilityModal)); document.querySelectorAll("[data-close-buffer-modal]").forEach((node) => node.addEventListener("click", closeBufferModal)); document.querySelectorAll("[data-close-rccp-modal]").forEach((node) => node.addEventListener("click", closeRccpModal)); document.querySelectorAll("[data-close-drawer]").forEach((node) => node.addEventListener("click", closeDrawer)); document.querySelectorAll("[data-close-gate-drawer]").forEach((node) => node.addEventListener("click", closeGateDrawer)); document.querySelectorAll("[data-close-recovery-drawer]").forEach((node) => node.addEventListener("click", closeRecoveryDrawer));
  els.feasibilityModal?.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-feasibility-filter]");
    if (filter) { state.feasibilityFilter = filter.dataset.feasibilityFilter; applyFeasibilityFilter(); return; }
    const retry = event.target.closest("[data-feasibility-retry]");
    if (retry && state.feasibilityLineId) { openFeasibility(state.feasibilityLineId, state.feasibilityOrigin); return; }
    const line = event.target.closest("[data-feasibility-line]");
    if (line) { openFeasibility(line.dataset.feasibilityLine, state.feasibilityOrigin); }
  });
  els.lockMps.addEventListener("click", previewPlanning);
  els.recalculate.addEventListener("click", previewDeltaPlanning);
  els.planningConfirm.addEventListener("click", generatePlanning);
  els.recoveryBody.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-recovery-simple]")) { closeRecoveryDrawer(); return; }
    const mode = event.target.closest("[data-recovery-mode]");
    if (mode && state.recoverySourcePayload && !state.recoveryPayload?.locked) { renderRecoveryPlan(state.recoverySourcePayload, mode.dataset.recoveryMode); return; }
    const command = event.target.closest("[data-recovery-command]");
    if (command) runRecoveryCommand(command.dataset.recoveryCommand);
  });
  document.addEventListener("click", (event) => { if (!els.rowMenu.hidden && !event.target.closest("#mwb-row-menu") && !event.target.closest("[data-row-menu]") && !event.target.closest("[data-phase-menu]")) closeRowMenu(); });
  els.month.addEventListener("change", () => { $("mwb-review-link").href = `/modules/planning-ppic/demand-planning/monthly-review?month=${encodeURIComponent(els.month.value)}`; $("mwb-exception-link").href = `/modules/planning-ppic/demand-planning/exception-workbench?month=${encodeURIComponent(els.month.value)}`; load({ resetPage: true }); }); els.status.addEventListener("change", () => load({ resetPage: true })); els.pageSize.addEventListener("change", () => { state.pageSize = Number(els.pageSize.value) || 25; load({ resetPage: true }); }); let timer; els.search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load({ resetPage: true }), 320); });
  els.prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } }); els.next.addEventListener("click", () => { if (state.data && state.page < state.data.pagination.pages) { state.page += 1; load(); } }); els.density.addEventListener("click", () => { const comfortable = els.board.classList.toggle("comfortable"); els.density.textContent = comfortable ? "Compact view" : "Comfortable view"; });
  els.export.addEventListener("click", () => { const rows = state.data?.items || []; if (!rows.length) return showAlert("Tidak ada data pada halaman ini untuk diexport."); const columns = ["MPS","Part Code","Part Number","Part Name","EFD M-1","DLV M-1","Shortage M-1","EFD M","PO+","EFD M+1","Buffer Percent","Buffer Qty","Current Stock","Available Stock","MPS Qty","Lead Time (day)","Capacity Status","Capacity Load (%)","Delivery Status","Netting Status","UOM"]; const csv = [columns, ...rows.map((r) => [r.mpsNumber,r.partCode,r.partNumber,r.partName,r.efdM1,r.deliveredM1,r.shortageM1,r.efdM,r.planMetrics?.poDeltaQty,r.efdMPlus1,r.bufferPercent,r.bufferQty,r.currentStockQty,r.availableStockQty,r.metrics.plannedProductionQty,r.leadTimeDays,r.capacity?.status,r.capacity?.maxLoadPercentage,r.delivery?.statusLabel,r.status,r.uomCode])].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `mps-production-matrix-${els.month.value}.csv`; link.click(); URL.revokeObjectURL(link.href); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeDrawer(); closeModal(); closeActionModal(); closePlanningModal(); closeFormulaModal(); closeFeasibilityModal(); closeBufferModal(); closeRccpModal(); closeRecoveryDrawer(); closeRowMenu(); return; }
    if (event.key === "Tab" && els.feasibilityModal?.getAttribute("aria-hidden") === "false") {
      const focusable = [...els.feasibilityModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hidden && node.offsetParent !== null);
      if (!focusable.length) return; const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }); load();
})();
