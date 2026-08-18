(function () {
  "use strict";

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const qty = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(number(value));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const dateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
  const signed = (value) => number(value) > 0 ? `+${qty(value)}` : qty(value);
  const config = JSON.parse($("mdr-page-config")?.textContent || "{}");
  const state = { month: config.initialMonth, snapshotId: "", customerCode: "", q: "", page: 1, pageSize: 25, payload: null, requestId: 0, modalAction: null };
  let searchTimer = null;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `Permintaan gagal (${response.status})`);
      error.code = payload.code;
      throw error;
    }
    return payload;
  }

  function alert(message = "", kind = "danger") {
    const box = $("mdr-alert");
    box.hidden = !message;
    box.className = `mdr-alert ${kind}`;
    box.textContent = message;
  }

  function statusBadge(status) {
    return `<span class="mdr-badge ${esc(String(status || "").toLowerCase())}">${esc(String(status || "—").replaceAll("_", " "))}</span>`;
  }

  function updateSelect(select, firstLabel, values, selected, labeler = (value) => value) {
    const signature = JSON.stringify(values.map((value) => typeof value === "object" ? value.id : value));
    if (select.dataset.signature === signature) { select.value = selected || ""; return; }
    select.dataset.signature = signature;
    select.innerHTML = `<option value="">${esc(firstLabel)}</option>${values.map((value) => {
      const key = typeof value === "object" ? value.id : value;
      return `<option value="${esc(key)}">${esc(labeler(value))}</option>`;
    }).join("")}`;
    select.value = selected || "";
  }

  function renderSummary(payload) {
    const snapshot = payload.selectedSnapshot;
    const totals = snapshot ? {
      fccQty: snapshot.totalFccQty, poFirmQty: snapshot.totalPoFirmQty,
      unplannedPoQty: snapshot.totalUnplannedPoQty, effQty: snapshot.totalEffQty,
    } : payload.live.totals;
    const summary = snapshot ? { partCount: snapshot.partCount, blockedCount: snapshot.blockedCount, warningCount: snapshot.warningCount, readyCount: snapshot.partCount - snapshot.blockedCount - snapshot.warningCount } : payload.live.summary;
    const phaseSummary = snapshot?.phaseSummary || payload.live.summary;
    $("mdr-total-fcc").textContent = qty(totals.fccQty);
    $("mdr-total-po").textContent = qty(totals.poFirmQty);
    $("mdr-total-eff").textContent = qty(totals.effQty);
    $("mdr-total-unplanned").textContent = qty(totals.unplannedPoQty);
    $("mdr-prev-month-count").textContent = `${phaseSummary.previousMonthStartPartCount || 0} part`;
    $("mdr-prev-month-meta").textContent = `${qty(phaseSummary.previousMonthQty)} qty ditarik ke bulan sebelumnya`;
    $("mdr-readiness").textContent = `${summary.readyCount || 0} / ${summary.partCount || 0}`;
    $("mdr-readiness-meta").textContent = `${summary.blockedCount || 0} blocked · ${summary.warningCount || 0} warning`;
    $("mdr-summary-basis").textContent = snapshot ? snapshot.snapshotNumber : "Live source";
  }

  function renderWorkflow(payload) {
    const snapshot = payload.selectedSnapshot;
    const statuses = payload.workflow.statuses;
    const currentIndex = snapshot ? statuses.indexOf(snapshot.status) : -1;
    document.querySelectorAll("#mdr-workflow li").forEach((item, index) => {
      item.classList.toggle("is-current", index === currentIndex);
      item.classList.toggle("is-done", index < currentIndex || snapshot?.status === "FROZEN");
    });
    $("mdr-snapshot-title").textContent = snapshot?.snapshotNumber || "Belum ada snapshot";
    $("mdr-snapshot-meta").textContent = snapshot
      ? `${snapshot.status} · cut-off ${date(snapshot.cutoffDate)} · source as-of ${dateTime(snapshot.sourceDataAsOf)}`
      : "Buat snapshot dari live source untuk memulai review.";
    const actions = [];
    if (!snapshot) actions.push('<button type="button" class="btn btn-primary" data-action="create">Buat Snapshot</button>');
    else if (snapshot.status === "DRAFT") {
      actions.push('<button type="button" class="btn btn-outline-secondary" data-action="refresh">Refresh Source</button>');
      actions.push('<button type="button" class="btn btn-primary" data-action="review">Mark Reviewed</button>');
    } else if (snapshot.status === "REVIEWED") actions.push('<button type="button" class="btn btn-primary" data-action="approve">Approve PPIC</button>');
    else if (snapshot.status === "APPROVED") actions.push('<button type="button" class="btn btn-primary" data-action="freeze">Freeze Baseline</button>');
    else if (snapshot.status === "FROZEN" && snapshot.isCurrentRevision) actions.push('<button type="button" class="btn btn-outline-primary" data-action="revise">Buat Revision</button>');
    $("mdr-actions").innerHTML = actions.join("");
    const audits = snapshot?.actions || [];
    $("mdr-audit-summary").innerHTML = audits.length ? audits.slice(-4).reverse().map((row) => `<span><b>${esc(row.action)}</b> ${esc(row.actor || "system")} · ${dateTime(row.createdAt)}${row.reason ? `<small>${esc(row.reason)}</small>` : ""}</span>`).join("") : '<span>Belum ada audit workflow.</span>';
  }

  function renderSourceBanner(payload) {
    const banner = $("mdr-source-banner");
    const snapshot = payload.selectedSnapshot;
    const changed = payload.workflow.sourceChanged;
    banner.classList.toggle("is-changed", changed);
    banner.classList.toggle("is-frozen", snapshot?.status === "FROZEN" && !changed);
    $("mdr-source-title").textContent = !snapshot ? "Live source siap dibuat menjadi snapshot" : changed ? "FCC/PO berubah setelah snapshot dibuat" : "Snapshot sama dengan source terbaru";
    $("mdr-source-meta").textContent = !snapshot
      ? `Source as-of ${dateTime(payload.live.sourceDataAsOf)} · ${payload.live.summary.partCount} part`
      : changed ? "Workflow ditahan sampai Draft di-refresh atau revision baru dibuat." : `Terverifikasi pada ${dateTime(payload.live.sourceDataAsOf)}`;
    const button = $("mdr-source-action");
    button.hidden = !(changed && snapshot?.status === "DRAFT");
    button.textContent = "Refresh sekarang";
    button.dataset.action = "refresh";
  }

  function valueCell(value, css = "") {
    return `<td class="mdr-number ${css} ${number(value) === 0 ? "is-zero" : ""}">${qty(value)}</td>`;
  }

  function productionStartCell(planning = {}) {
    const previous = number(planning.previousMonthPhaseCount) > 0;
    return `<td class="mdr-production-start ${previous ? "is-previous" : ""}"><strong>${date(planning.earliestProductionStartDate)}</strong><small>Material ${date(planning.earliestMaterialRequiredDate)}</small>${previous ? `<em>${planning.previousMonthPhaseCount} phase · ${qty(planning.previousMonthQty)} qty prev. month</em>` : ""}</td>`;
  }

  function renderRows(payload) {
    if (!payload.items.length) {
      $("mdr-body").innerHTML = '<tr><td colspan="15" class="mdr-empty"><strong>Tidak ada demand pada filter ini.</strong><span>Ganti periode, customer, atau pencarian.</span></td></tr>';
      return;
    }
    $("mdr-body").innerHTML = payload.items.map((row) => {
      const current = row.currentSource || row;
      const snapshotEff = row.isSnapshotLine ? row.effQty : current.effQty;
      const issues = Array.isArray(row.readinessIssues) ? row.readinessIssues : current.readinessIssues || [];
      const readiness = row.readinessStatus || current.readinessStatus;
      const planning = row.phasePlanning || current.phasePlanning || {};
      return `<tr>
        <td class="mdr-part"><strong>${esc(row.partNumber || row.partCode)}</strong><small>${esc(row.partCode)} · ${esc(row.uomCode || current.uomCode || "—")}</small><span>${esc(row.partName || current.partName || "—")}</span></td>
        <td><div class="mdr-customer-list">${(row.customerCodes || current.customerCodes || []).map((code) => `<span>${esc(code)}</span>`).join("") || "—"}</div></td>
        ${valueCell(row.fccQty ?? current.fccQty, "fcc")}
        ${valueCell(row.poFirmQty ?? current.poFirmQty, "po")}
        ${valueCell(row.consumedFccQty ?? current.consumedFccQty)}
        ${valueCell(row.unplannedPoQty ?? current.unplannedPoQty, number(row.unplannedPoQty ?? current.unplannedPoQty) > 0 ? "is-risk" : "")}
        ${valueCell(snapshotEff, "eff")}
        ${valueCell(current.effQty, "eff-current")}
        <td class="mdr-number delta ${number(row.sourceDeltaEffQty) ? "is-changed" : ""}">${signed(row.sourceDeltaEffQty)}</td>
        <td class="mdr-number delta ${number(row.deltaEffQty) ? "is-changed" : ""}">${signed(row.deltaEffQty)}</td>
        ${productionStartCell(planning)}
        <td class="mdr-lead-status">${statusBadge(planning.status)}<small>${planning.lateCount || 0} late · ${planning.atRiskCount || 0} risk</small></td>
        <td class="mdr-number"><strong>${qty(row.effectivePhaseCount ?? current.effectivePhaseCount)}</strong><small class="mdr-phase-count">EFF / ${qty(row.deliveryPhaseCount ?? current.deliveryPhaseCount)} source</small></td>
        <td><button class="mdr-readiness-button" type="button" data-detail="${esc(row.partCode)}">${statusBadge(readiness)}<small>${issues.length} issue</small></button></td>
        <td><button class="mdr-source-button" type="button" data-detail="${esc(row.partCode)}">Timeline</button></td>
      </tr>`;
    }).join("");
  }

  function renderPagination(payload) {
    const page = payload.pagination;
    const start = page.total ? (page.page - 1) * page.pageSize + 1 : 0;
    const end = Math.min(page.page * page.pageSize, page.total);
    $("mdr-range").textContent = `${start}–${end} dari ${page.total} part`;
    $("mdr-page-label").textContent = `Halaman ${page.page} / ${page.totalPages}`;
    $("mdr-prev").disabled = page.page <= 1;
    $("mdr-next").disabled = page.page >= page.totalPages;
    $("mdr-result-meta").textContent = `${page.total} part · ${payload.selectedSnapshot ? payload.selectedSnapshot.snapshotNumber : "Live source"} · ${payload.formula.expression}`;
    $("mdr-table-title").textContent = `Demand ${payload.period.key}`;
  }

  function render(payload) {
    state.payload = payload;
    const selectedId = payload.selectedSnapshot?.id || "";
    state.snapshotId = selectedId;
    updateSelect($("mdr-snapshot"), "Live source — belum snapshot", payload.snapshots, selectedId, (row) => `${row.snapshotNumber} · ${row.status}${row.isCurrentRevision ? " · Current" : ""}`);
    updateSelect($("mdr-customer"), "Semua customer", payload.filters.customerOptions, state.customerCode);
    renderSummary(payload);
    renderWorkflow(payload);
    renderSourceBanner(payload);
    renderRows(payload);
    renderPagination(payload);
  }

  async function load() {
    const requestId = ++state.requestId;
    alert();
    document.body.classList.add("mdr-busy");
    const params = new URLSearchParams({ month: state.month, page: state.page, pageSize: state.pageSize });
    if (state.snapshotId) params.set("snapshotId", state.snapshotId);
    if (state.customerCode) params.set("customerCode", state.customerCode);
    if (state.q) params.set("q", state.q);
    try {
      const payload = await api(`/modules/api/planning-ppic/demand-planning/monthly-review?${params}`);
      if (requestId === state.requestId) render(payload);
    } catch (error) {
      if (requestId === state.requestId) {
        alert(error.message);
        $("mdr-body").innerHTML = `<tr><td colspan="15" class="mdr-empty"><strong>Monthly Demand gagal dimuat.</strong><span>${esc(error.message)}</span></td></tr>`;
      }
    } finally {
      if (requestId === state.requestId) document.body.classList.remove("mdr-busy");
    }
  }

  async function mutate(path, body = {}) {
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body) });
      state.snapshotId = result.id || state.snapshotId;
      closeModal();
      await load();
      alert("Perubahan tersimpan tanpa refresh halaman.", "success");
    } catch (error) {
      alert(error.message);
      $("mdr-modal-submit").disabled = false;
    }
  }

  function openModal(action) {
    state.modalAction = action;
    const snapshot = state.payload?.selectedSnapshot;
    const cutoff = String(snapshot?.cutoffDate || state.payload?.period.defaultCutoff || "").slice(0, 10);
    const copy = {
      create: ["CREATE SNAPSHOT", "Buat Monthly Demand Snapshot", "Angka live source akan disalin sebagai revision resmi Draft.", "Buat Snapshot"],
      approve: ["PPIC APPROVAL", "Approve Monthly Demand", "Approval mengesahkan hasil review sebelum baseline dibekukan.", "Approve"],
      revise: ["CONTROLLED REVISION", "Buat Revision Baru", "Frozen snapshot tetap tersimpan; revision berikutnya dibuat dari source terbaru.", "Buat Revision"],
    }[action];
    if (!copy) return;
    $("mdr-modal-eyebrow").textContent = copy[0];
    $("mdr-modal-title").textContent = copy[1];
    $("mdr-modal-description").textContent = copy[2];
    $("mdr-modal-submit").textContent = copy[3];
    $("mdr-modal-fields").innerHTML = action === "create" ? `
      <label><span>Periode</span><input value="${esc(state.month)}" disabled></label>
      <label><span>Cut-off date</span><input id="mdr-modal-cutoff" type="date" value="${esc(cutoff)}" required></label>
      <label class="span-2"><span>Catatan</span><textarea id="mdr-modal-notes" rows="3" placeholder="Catatan review periode…"></textarea></label>`
      : action === "approve" ? `<label class="span-2"><span>Catatan approval</span><textarea id="mdr-modal-reason" rows="4" minlength="5" required placeholder="Dasar approval PPIC…"></textarea></label>`
      : `
        <label><span>Revision berikutnya</span><input value="R${String(number(snapshot?.revision) + 1).padStart(2, "0")}" disabled></label>
        <label><span>Cut-off date</span><input id="mdr-modal-cutoff" type="date" value="${esc(cutoff)}" required></label>
        <label class="span-2"><span>Alasan revision</span><textarea id="mdr-modal-reason" rows="4" minlength="10" required placeholder="Jelaskan perubahan setelah Frozen…"></textarea></label>`;
    $("mdr-modal").classList.add("is-open");
    $("mdr-modal").setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    $("mdr-modal").classList.remove("is-open");
    $("mdr-modal").setAttribute("aria-hidden", "true");
    state.modalAction = null;
  }

  async function handleAction(action) {
    const snapshot = state.payload?.selectedSnapshot;
    if (["create", "approve", "revise"].includes(action)) return openModal(action);
    if (!snapshot) return;
    if (action === "refresh") {
      if (!window.confirm(`Refresh ${snapshot.snapshotNumber} dari FCC/PO terbaru?`)) return;
      return mutate(`/modules/api/planning-ppic/demand-planning/monthly-review/snapshots/${encodeURIComponent(snapshot.id)}/refresh`, {});
    }
    if (action === "review") {
      if (!window.confirm("Tandai Monthly Demand ini sudah direview Marketing/Planning?")) return;
      return mutate(`/modules/api/planning-ppic/demand-planning/monthly-review/snapshots/${encodeURIComponent(snapshot.id)}/review`, {});
    }
    if (action === "freeze") {
      if (!window.confirm(`Freeze ${snapshot.snapshotNumber} sebagai baseline resmi? Setelah Frozen, perubahan harus melalui revision baru.`)) return;
      return mutate(`/modules/api/planning-ppic/demand-planning/monthly-review/snapshots/${encodeURIComponent(snapshot.id)}/freeze`, { confirmed: true });
    }
  }

  function targetList(items, empty) {
    if (!items?.length) return `<p class="mdr-drawer-empty">${esc(empty)}</p>`;
    return `<div class="mdr-target-list">${items.map((item) => `<article><div><b>${esc(item.sourceNumber)}</b><span>${esc(item.headerStatus || "—")}</span></div><strong>${qty(item.qty)}</strong><small>${date(item.targetDate)} · ${esc(item.customerCode || "—")} · phase ${item.phaseNumber}</small></article>`).join("")}</div>`;
  }

  function phaseList(items) {
    if (!items?.length) return '<p class="mdr-drawer-empty">Belum ada effective delivery phase yang dapat dihitung.</p>';
    return `<div class="mdr-phase-list">${items.map((phase, index) => {
      const processes = Array.isArray(phase.processTimeline) ? phase.processTimeline : [];
      const shortages = Array.isArray(phase.materialShortages) ? phase.materialShortages : [];
      const vendorWindow = phase.vendorSendDate || phase.vendorReturnDate;
      return `<article class="${esc(String(phase.status || "").toLowerCase())}">
        <header><div><b>Phase ${phase.phaseNumber || index + 1}</b><span>${esc(phase.sourceNumber || "—")} · ${esc(phase.sourceType || "—")}</span></div>${statusBadge(phase.status)}<strong>${qty(phase.qty)}</strong></header>
        <div class="mdr-phase-grid"><div><span>Delivery</span><b>${date(phase.targetDeliveryDate)}</b></div><div><span>Latest production start</span><b>${dateTime(phase.productionLatestStartDate)}</b></div><div><span>Material required</span><b>${date(phase.materialRequiredDate)}</b></div><div><span>Latest PR</span><b>${date(phase.latestPrDate)}</b></div></div>
        <p class="mdr-phase-route">MBOM <b>${esc(phase.bomNumber || "belum tersedia")}</b> · produksi ${qty(phase.productionLeadTimeDays)} hari / ${qty(phase.exactProductionLeadTimeHours)} jam · ${phase.capacityShiftsPerDay || "—"} shift</p>
        ${vendorWindow ? `<p class="mdr-vendor-window">Vendor: kirim ${dateTime(phase.vendorSendDate)} → kembali ${dateTime(phase.vendorReturnDate)}</p>` : ""}
        ${shortages.length ? `<div class="mdr-shortages"><b>Material shortage</b>${shortages.map((item) => `<span>${esc(item.partCode)}: ${qty(item.shortageQty)} · need ${date(item.requiredDate)}</span>`).join("")}</div>` : ""}
        ${phase.calculationError ? `<p class="mdr-phase-error">${esc(phase.calculationError)}</p>` : ""}
        ${processes.length ? `<details><summary>Runtutan ${processes.length} proses</summary><ol>${processes.map((step) => `<li><span>${step.sequence}. ${esc(step.processCode || "PROCESS")} · ${esc(step.routingMode || "INHOUSE")}${step.vendorCode ? ` · ${esc(step.vendorCode)}` : ""}</span><b>${dateTime(step.latestStartDate)} → ${dateTime(step.latestFinishDate)}</b></li>`).join("")}</ol></details>` : ""}
      </article>`;
    }).join("")}</div>`;
  }

  function openDetail(partCode) {
    const row = state.payload?.items.find((item) => item.partCode === partCode);
    if (!row) return;
    const source = row.currentSource || row;
    const trace = row.sourceTrace || source.sourceTrace || {};
    const issues = row.readinessIssues || source.readinessIssues || [];
    const values = trace.formula?.values || {};
    const planning = row.phasePlanning || source.phasePlanning || {};
    $("mdr-drawer-title").textContent = row.partNumber || row.partCode;
    $("mdr-drawer-meta").textContent = `${row.partName || source.partName || "—"} · ${row.partCode} · ${row.uomCode || source.uomCode || "—"}`;
    $("mdr-drawer-body").innerHTML = `
      <section class="mdr-equation"><div><span>FCC</span><b>${qty(values.fccQty ?? source.fccQty)}</b></div><i>−</i><div><span>Consumed</span><b>${qty(values.consumedFccQty ?? source.consumedFccQty)}</b></div><i>+</i><div><span>PO Effective</span><b>${qty(values.poEffectiveQty ?? source.poEffectiveQty)}</b></div><i>=</i><div class="result"><span>EFF</span><b>${qty(values.effQty ?? source.effQty)}</b></div></section>
      <section class="mdr-phase-summary"><div><span>Earliest Production Start</span><b>${dateTime(planning.earliestProductionStartDate)}</b></div><div><span>Earliest Material Need</span><b>${date(planning.earliestMaterialRequiredDate)}</b></div><div class="previous"><span>Previous Month</span><b>${planning.previousMonthPhaseCount || 0} phase / ${qty(planning.previousMonthQty)} qty</b></div><div><span>MBOM</span><b>${esc((planning.bomNumbers || []).join(", ") || "—")}</b></div></section>
      <section class="mdr-source-section mdr-lead-time-section"><h3>Backward scheduling per EFF phase</h3><p>${esc(trace.leadTimePolicy?.expression || "Delivery - dispatch - BOM/routing lead time - material staging - procurement lead time")}</p>${phaseList(trace.effectiveDeliveryPhases)}</section>
      <section class="mdr-issue-list"><h3>Readiness</h3>${issues.length ? issues.map((issue) => `<article class="${esc(issue.severity.toLowerCase())}"><b>${esc(issue.code)}</b><span>${esc(issue.message)}</span></article>`).join("") : '<p>Semua pemeriksaan dasar siap.</p>'}</section>
      <section class="mdr-source-section"><h3>FCC targets</h3>${targetList(trace.fccTargets, "Tidak ada FCC target pada periode ini.")}</section>
      <section class="mdr-source-section"><h3>PO firm targets</h3>${targetList(trace.poTargets, "Tidak ada PO firm pada periode ini.")}</section>
      <section class="mdr-source-section"><h3>Data lineage</h3><p class="mdr-lineage-note">FCC/PO → demand consumption → EFF phase → MBOM explosion → routing &amp; vendor → material coverage → backward schedule.</p></section>`;
    $("mdr-drawer").classList.add("is-open");
    $("mdr-drawer").setAttribute("aria-hidden", "false");
  }

  function closeDrawer() { $("mdr-drawer").classList.remove("is-open"); $("mdr-drawer").setAttribute("aria-hidden", "true"); }

  $("mdr-month").addEventListener("change", (event) => { state.month = event.target.value; state.snapshotId = ""; state.page = 1; load(); });
  $("mdr-snapshot").addEventListener("change", (event) => { state.snapshotId = event.target.value; state.page = 1; load(); });
  $("mdr-customer").addEventListener("change", (event) => { state.customerCode = event.target.value; state.page = 1; load(); });
  $("mdr-page-size").addEventListener("change", (event) => { state.pageSize = Number(event.target.value); state.page = 1; load(); });
  $("mdr-search").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = event.target.value.trim(); state.page = 1; load(); }, 300); });
  $("mdr-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } });
  $("mdr-next").addEventListener("click", () => { if (state.page < (state.payload?.pagination.totalPages || 1)) { state.page += 1; load(); } });
  $("mdr-actions").addEventListener("click", (event) => { const button = event.target.closest("[data-action]"); if (button) handleAction(button.dataset.action); });
  $("mdr-source-action").addEventListener("click", (event) => handleAction(event.currentTarget.dataset.action));
  $("mdr-body").addEventListener("click", (event) => { const button = event.target.closest("[data-detail]"); if (button) openDetail(button.dataset.detail); });
  document.querySelectorAll("[data-close-drawer]").forEach((button) => button.addEventListener("click", closeDrawer));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
  $("mdr-modal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const action = state.modalAction;
    const snapshot = state.payload?.selectedSnapshot;
    $("mdr-modal-submit").disabled = true;
    if (action === "create") return mutate("/modules/api/planning-ppic/demand-planning/monthly-review/snapshots", { month: state.month, cutoffDate: $("mdr-modal-cutoff").value, notes: $("mdr-modal-notes").value.trim() });
    if (action === "approve") return mutate(`/modules/api/planning-ppic/demand-planning/monthly-review/snapshots/${encodeURIComponent(snapshot.id)}/approve`, { reason: $("mdr-modal-reason").value.trim() });
    if (action === "revise") return mutate(`/modules/api/planning-ppic/demand-planning/monthly-review/snapshots/${encodeURIComponent(snapshot.id)}/revisions`, { cutoffDate: $("mdr-modal-cutoff").value, reason: $("mdr-modal-reason").value.trim() });
  });
  $("mdr-export").addEventListener("click", () => {
    if (!state.payload) return;
    const columns = ["Part Number","Part Code","Part Name","Customer","FCC","PO Firm","FCC Consumed","Unplanned PO","EFF Snapshot","EFF Source","Delta Source","Readiness"];
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = state.payload.items.map((row) => [row.partNumber,row.partCode,row.partName,(row.customerCodes||[]).join("; "),row.fccQty,row.poFirmQty,row.consumedFccQty,row.unplannedPoQty,row.effQty,row.currentSource?.effQty,row.sourceDeltaEffQty,row.readinessStatus]);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + [columns, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    link.download = `monthly-demand-review-${state.month}.csv`; link.click(); URL.revokeObjectURL(link.href);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeDrawer(); closeModal(); } });

  load();
})();
