(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const config = JSON.parse($("mrp-config")?.textContent || "{}");
  const state = { data: null, rows: [], page: 1, limit: 25, search: "", status: "", compact: true, loading: false };
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value || 0));
  const day = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "—";
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request gagal (${response.status}).`);
    return payload;
  }

  function presentationStatus(row) {
    const lifecycle = String(row.presentationStatus || "").toUpperCase();
    if (["DRAFT", "SIMULATED", "APPROVED", "FAILED"].includes(lifecycle)) return lifecycle;
    if (row.isCurrentPlan) return "APPROVED";
    if (String(row.status || "").toUpperCase() === "FAILED") return "FAILED";
    if (String(row.status || "").toUpperCase() === "RUNNING") return "DRAFT";
    return "SIMULATED";
  }

  function chip(value, tone = "") {
    return `<span class="mrp-chip ${esc(tone)}">${esc(value || "—")}</span>`;
  }

  function filteredRows() {
    const query = state.search.toLowerCase();
    return state.rows.filter((row) => {
      if (state.status && presentationStatus(row) !== state.status) return false;
      return !query || JSON.stringify(row).toLowerCase().includes(query);
    });
  }

  function renderStatusOptions() {
    const values = [...new Set(state.rows.map(presentationStatus))];
    $("mrp-status").innerHTML = '<option value="">Semua status</option>' + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
    $("mrp-status").value = state.status;
  }

  function renderSummary() {
    const rows = state.rows;
    const approvedRows = rows.filter((row) => presentationStatus(row) === "APPROVED");
    const waitingRows = rows.filter((row) => ["DRAFT", "SIMULATED"].includes(presentationStatus(row)));
    const approvedRunNumbers = new Set(rows.map((row) => row.approvedRunNumber || (presentationStatus(row) === "APPROVED" ? row.runNumber : null)).filter(Boolean));
    const basisRows = rows.filter((row) => presentationStatus(row) !== "FAILED");
    const sourceCount = new Set(rows.map((row) => row.mpsNumber).filter(Boolean)).size;
    $("mrp-kpi-source").textContent = num(sourceCount);
    $("mrp-kpi-current").textContent = num(approvedRunNumbers.size);
    $("mrp-kpi-requirements").textContent = num(basisRows.reduce((total, row) => total + Number(row.totalRequirements || 0), 0));
    $("mrp-kpi-orders").textContent = num(basisRows.reduce((total, row) => total + Number(row.totalPlannedOrders || 0), 0));
    $("mrp-kpi-source-meta").textContent = `${num(rows.filter((row) => row.executionScope === "LINKED_SOURCE").length)} linked ke periode ${state.data.month}`;
    $("mrp-kpi-requirements-meta").textContent = waitingRows.length ? "working revision terbaru untuk direview" : "hasil Approved BOM explosion & netting";
    $("mrp-kpi-orders-meta").textContent = waitingRows.length ? "draft make / buy, belum untuk release" : "saran Approved produksi dan pembelian";

    const preferred = waitingRows[0] || approvedRows[0] || rows[0] || null;
    const docStatus = $("mrp-doc-status");
    docStatus.className = `mrp-doc-status ${waitingRows.length ? "preview" : approvedRows.length ? "current" : "empty"}`;
    docStatus.textContent = waitingRows.length ? `${waitingRows.length} MENUNGGU APPROVAL` : approvedRows.length ? "MRP APPROVED" : "BELUM ADA MRP";
    $("mrp-context-copy").textContent = waitingRows.length
      ? "Working revision sudah selesai dihitung. Review netting lalu Approve tanpa menghitung ulang snapshot."
      : approvedRows.length
        ? "Semua working revision yang tampil sudah Approved dan dapat menjadi sumber Production Plan."
        : "Belum ada MRP pada periode ini. Mulai dari Rolling MPS untuk menghitung working revision.";
    $("mrp-action-note").textContent = waitingRows.length
      ? `${waitingRows.length} working revision belum Approved; output eksekusi tetap diblokir.`
      : approvedRows.length
        ? `${approvedRows.length} MRP Approved menjadi sumber resmi Production Plan.`
        : "Jalankan MRP dari Rolling MPS setelah delivery dan RCCP diperiksa.";
    const openRun = $("mrp-open-run");
    openRun.hidden = !preferred;
    if (preferred) {
      openRun.href = `/modules/planning-ppic/mrp/${encodeURIComponent(preferred.runNumber)}`;
      openRun.textContent = waitingRows.length ? "Review MRP aktif" : "Buka MRP Approved";
    }
  }

  function rowHtml(row) {
    const status = presentationStatus(row);
    const runHref = `/modules/planning-ppic/mrp/${encodeURIComponent(row.runNumber || "")}`;
    const mpsMonth = String(row.mpsNumber || "").match(/(\d{4})(\d{2})$/);
    const mpsHref = mpsMonth ? `/modules/planning-ppic/mps/workbench?month=${mpsMonth[1]}-${mpsMonth[2]}` : "/modules/planning-ppic/mps/workbench";
    const scopeLabel = row.executionScope === "LINKED_SOURCE" ? "LINKED SOURCE" : "ACTIVE REVISION";
    const scopeTone = row.executionScope === "PERIOD" ? "ready" : "preview";
    const lifecycleTone = status === "APPROVED" ? "current" : status === "SIMULATED" ? "preview" : status === "FAILED" ? "blocked" : "muted";
    const officialCopy = row.approvedRunNumber && row.approvedRunNumber !== row.runNumber ? `Official saat ini ${row.approvedRunNumber}` : row.status;
    const action = status === "SIMULATED" && String(row.scenarioAssumptions?.planningMode || "").toUpperCase() !== "M_PLUS_ONE_PREVIEW"
      ? `<button class="mrp-row-approve" type="button" data-approve-run="${esc(row.runNumber)}">Approve</button>`
      : `<a class="mrp-row-action" href="${runHref}" aria-label="Buka detail ${esc(row.runNumber)}">Buka <span aria-hidden="true">→</span></a>`;
    return `<tr>
      <td><a class="mrp-doc-link" href="${runHref}"><b>${esc(row.runNumber)}</b></a><small>${esc(row.planNumber || "MRP Plan")} · Revision ${esc(row.planRevision || 0)}</small></td>
      <td><a class="mrp-doc-link" href="${mpsHref}"><b>${esc(row.mpsNumber || "—")}</b></a><small>Sumber kebutuhan ${status === "APPROVED" ? "Approved" : "snapshot aktif"}</small></td>
      <td><b>${day(row.runDate)}</b><small>Cutoff ${day(row.cutoffDate)}</small></td>
      <td>${chip(scopeLabel, scopeTone)}<small>${esc(row.executionScopeLabel || row.planScope || "MPS")}</small></td>
      <td class="mrp-number"><b>${num(row.totalRequirements)}</b><small>BOM explosion</small></td>
      <td class="mrp-number"><b>${num(row.totalPlannedOrders)}</b><small>make / buy</small></td>
      <td>${chip(status, lifecycleTone)}<small>${esc(officialCopy || "—")}</small></td>
      <td>${action}</td>
    </tr>`;
  }

  function renderTable() {
    const rows = filteredRows();
    const pages = Math.max(Math.ceil(rows.length / state.limit), 1);
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.limit;
    const visible = rows.slice(start, start + state.limit);
    $("mrp-tbody").innerHTML = visible.length ? visible.map(rowHtml).join("") : '<tr><td colspan="8" class="mrp-empty">Tidak ada MRP untuk filter ini.</td></tr>';
    $("mrp-range").textContent = rows.length ? `${start + 1}–${Math.min(start + state.limit, rows.length)} dari ${rows.length}` : "0 data";
    $("mrp-page").textContent = `Halaman ${state.page} / ${pages}`;
    $("mrp-prev").disabled = state.page <= 1;
    $("mrp-next").disabled = state.page >= pages;
  }

  function render() {
    renderStatusOptions();
    renderSummary();
    renderTable();
    $("mrp-open-mps").href = `/modules/planning-ppic/mps/workbench?month=${encodeURIComponent(state.data.month)}`;
    $("mrp-material-table").href = `/modules/planning-ppic/mrp?month=${encodeURIComponent(state.data.month)}`;
  }

  function showAlert(message) {
    const target = $("mrp-alert");
    target.hidden = !message;
    target.textContent = message || "";
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    showAlert("");
    $("mrp-tbody").innerHTML = '<tr><td colspan="8" class="mrp-empty">Memuat MRP Planning Runs…</td></tr>';
    try {
      const month = $("mrp-month").value || config.initialMonth;
      state.data = await api(`/modules/api/planning-ppic/execution-cockpit?month=${encodeURIComponent(month)}`);
      state.rows = state.data.mrpRuns || [];
      state.page = 1;
      history.replaceState({}, "", `${location.pathname}?month=${encodeURIComponent(state.data.month)}&view=runs`);
      render();
    } catch (error) {
      state.rows = [];
      showAlert(error.message);
      renderTable();
    } finally {
      state.loading = false;
    }
  }

  async function approve(runNumber, button) {
    if (!window.confirm(`Approve ${runNumber}? Snapshot netting yang sama akan menjadi MRP current tanpa dihitung ulang.`)) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Memproses…";
    try {
      await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(runNumber)}/approve`, { method: "PATCH", body: "{}" });
      await load();
    } catch (error) {
      showAlert(error.message);
      button.disabled = false;
      button.textContent = original;
    }
  }

  function exportCsv() {
    const headers = ["MRP Run", "Revision", "Source MPS", "Run Date", "Cutoff", "Scope", "Requirement Lines", "Planned Orders", "Run Status", "Planning Status"];
    const rows = filteredRows().map((row) => [row.runNumber, row.planRevision, row.mpsNumber, day(row.runDate), day(row.cutoffDate), row.executionScopeLabel, row.totalRequirements, row.totalPlannedOrders, row.status, presentationStatus(row)]);
    const csv = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mrp-planning-runs-${state.data?.month || config.initialMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  $("mrp-refresh").addEventListener("click", load);
  $("mrp-month").addEventListener("change", load);
  $("mrp-search").addEventListener("input", (event) => { state.search = event.target.value.trim(); state.page = 1; renderTable(); });
  $("mrp-status").addEventListener("change", (event) => { state.status = event.target.value; state.page = 1; renderTable(); });
  $("mrp-limit").addEventListener("change", (event) => { state.limit = Number(event.target.value) || 25; state.page = 1; renderTable(); });
  $("mrp-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderTable(); } });
  $("mrp-next").addEventListener("click", () => { const pages = Math.max(Math.ceil(filteredRows().length / state.limit), 1); if (state.page < pages) { state.page += 1; renderTable(); } });
  $("mrp-density").addEventListener("click", () => { state.compact = !state.compact; document.querySelector(".mrp-board").classList.toggle("comfortable", !state.compact); $("mrp-density").setAttribute("aria-pressed", String(!state.compact)); });
  $("mrp-export").addEventListener("click", exportCsv);
  $("mrp-tbody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-approve-run]");
    if (button) approve(button.dataset.approveRun, button);
  });

  load();
})();
