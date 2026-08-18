(() => {
  const $ = (id) => document.getElementById(id);
  const config = JSON.parse($("pec-config")?.textContent || "{}");
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const state = { data: null, tab: ["capacity", "mrp", "orders", "mpp", "control"].includes(requestedTab) ? requestedTab : "capacity", page: 1, limit: 25, search: "", status: "", closeMode: "close" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value || 0));
  const day = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "-";
  const chip = (label, tone = "") => `<span class="pec-chip ${esc(tone)}">${esc(label || "-")}</span>`;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || `Request gagal (${response.status})`); error.payload = payload; throw error; }
    return payload;
  };
  const alertBox = (message, success = false) => { const target = $("pec-alert"); target.hidden = !message; target.textContent = message || ""; target.className = `pec-alert${success ? " success" : ""}`; };

  const definitions = {
    capacity: {
      eyebrow: "BACKWARD SCHEDULING", title: "Operation schedule", help: "Customer target → FG required → latest finish → latest start; vendor send/return tetap terlihat.", href: "/modules/planning-ppic/capacity-planning",
      columns: ["MPP / Line", "Process", "Mode / Resource", "Schedule", "Latest start", "Latest finish", "FG required", "Customer target", "Qty", "Status", "Formula"],
      rows: (data) => data.scheduleRows || [], status: (row) => row.capacityLate ? "LATE" : row.routingMode,
      cells: (row) => [
        `<b>${esc(row.planNumber)}</b><small>Line ${esc(row.lineNumber)}</small>`, `<b>${esc(row.processCode || "-")}</b><small>Seq ${esc(row.sequence)} · ${esc(row.processName || "")}</small>`,
        `${chip(row.routingMode, row.routingMode === "VENDOR" ? "vendor" : "")}<small>${esc(row.resourceCode || "Belum dialokasikan")} · ${esc(row.resourceName || "-")}</small>`,
        `<b>${day(row.routingMode === "VENDOR" ? row.vendorSendDate : row.scheduleDate)}</b><small>${row.routingMode === "VENDOR" ? `Return ${day(row.vendorReturnDate)}` : "Internal operation"}</small>`, day(row.latestStartDate), day(row.latestFinishDate), day(row.fgRequiredDate), day(row.customerTargetDate), `<b>${num(row.plannedQty)}</b><small>${esc(row.uomCode || "")}</small>`, chip(row.capacityLate ? "LATE" : row.status, row.capacityLate ? "late" : "ready"), `<small>${esc(row.backwardFormula)}</small>`,
      ],
    },
    mrp: {
      eyebrow: "MONTH-END MRP COCKPIT", title: "Official MRP revision", help: "Satu current plan per MPS; official freeze dijalankan setiap akhir bulan.", href: "/modules/planning-ppic/mrp",
      columns: ["MRP Run", "Plan / Revision", "MPS", "Run date", "Cutoff", "Scope", "Requirements", "Planned Orders", "Status", "Current"], rows: (data) => data.mrpRuns || [], status: (row) => row.status,
      cells: (row) => [`<b>${esc(row.runNumber)}</b>`, `<b>${esc(row.planNumber || "-")}</b><small>Revision ${esc(row.planRevision)}</small>`, esc(row.mpsNumber || "-"), day(row.runDate), day(row.cutoffDate), esc(row.planScope || "MPS"), num(row.totalRequirements), num(row.totalPlannedOrders), chip(row.status, row.status === "Completed" ? "ready" : "blocked"), chip(row.isCurrentPlan ? "CURRENT" : "SUPERSEDED", row.isCurrentPlan ? "ready" : "")],
    },
    orders: {
      eyebrow: "PLANNED ORDER WORKBENCH", title: "Release & coverage queue", help: "Qty, order date, required date, MOQ/package, dan release gap dapat diaudit tanpa menyembunyikan netting MRP.", href: "/modules/planning-ppic/planned-orders",
      columns: ["Planned Order", "Part", "Type", "Order date", "Required", "Planned qty", "Released", "Release gap", "Supplier / Vendor", "MOQ / Package", "Status", "Timing"], rows: (data) => data.plannedOrders || [], status: (row) => row.timing === "LATE_RELEASE" ? "LATE_RELEASE" : row.status,
      cells: (row) => [`<a href="/modules/planning-ppic/planned-orders/${encodeURIComponent(row.orderNumber)}"><b>${esc(row.orderNumber)}</b></a><small>${esc(row.runNumber || "")}</small>`, `<b>${esc(row.partCode)}</b>`, chip(row.orderType, row.orderType === "Purchase" ? "vendor" : ""), day(row.orderDate), day(row.requiredDate), `<b>${num(row.qty)}</b><small>${esc(row.uomCode || "")}</small>`, num(row.qtyReleased), `<b>${num(row.releaseGap)}</b><small>${esc(row.formula)}</small>`, esc(row.supplierCode || row.vendorCode || "Belum dipilih"), `<b>${row.purchaseQtyKg ? `${num(row.purchaseQtyKg)} kg` : row.purchasePackageQty ? num(row.purchasePackageQty) : row.lotCount ? `${num(row.lotCount)} lot` : "-"}</b><small>${row.kgPerLot ? `${num(row.kgPerLot)} kg/lot` : ""}</small>`, chip(row.status, row.releaseGap > 0 ? "blocked" : "ready"), chip(row.timing, row.timing === "LATE_RELEASE" ? "late" : "ready")],
    },
    mpp: {
      eyebrow: "MONTHLY PRODUCTION PLAN", title: "Released production plan", help: "MPP hanya menjadi executable setelah current MRP, material readiness, dan capacity recommendation selaras.", href: "/modules/planning-ppic/monthly-production-plans",
      columns: ["MPP", "Periode", "Source", "Line", "Planned qty", "Released qty", "Operations", "Daily plans", "Replan", "Status"], rows: (data) => data.plans || [], status: (row) => row.replanRequired ? "REPLAN_REQUIRED" : row.status,
      cells: (row) => [`<a href="/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(row.planNumber)}"><b>${esc(row.planNumber)}</b></a>`, `<b>${day(row.periodStart)}</b><small>s/d ${day(row.periodEnd)}</small>`, esc(row.sourceType || "-"), num(row.detailCount), num(row.plannedQty), num(row.releasedQty), num(row.allocationCount), num(row.dailyPlanCount), row.replanRequired ? `${chip("REPLAN", "blocked")}<small>${esc(row.replanReason || "")}</small>` : chip("CURRENT", "ready"), chip(row.status, ["Released", "Closed"].includes(row.status) ? "ready" : "blocked")],
    },
    control: {
      eyebrow: "CONTROL TOWER & PERIOD CLOSING", title: "Exception gates", help: "Period close hanya aktif ketika MPS, capacity, MRP, planned order, dan MPP tidak menyisakan blocker.", href: "#period-closing",
      columns: ["Reference", "Blocker code", "Pesan", "Tahap", "Aksi"], rows: (data) => data.blockers || [], status: (row) => row.code,
      cells: (row) => [`<b>${esc(row.reference || "-")}</b>`, chip(row.code, "blocked"), esc(row.message), esc(String(row.code || "").split("_")[0]), `<button type="button" class="btn btn-sm btn-outline-primary" data-pec-open-ref="${esc(row.reference || "")}">Review</button>`],
    },
  };

  function renderHeader() {
    const data = state.data; const closed = data.periodState?.status === "CLOSED";
    $("pec-period-banner").className = `pec-period app-container${closed ? " closed" : data.summary.blockers ? " blocked" : ""}`;
    $("pec-period-status").textContent = `${data.month} · ${closed ? "CLOSED" : "OPEN"}`;
    $("pec-period-meta").textContent = closed ? `Ditutup ${day(data.periodState.closedAt)} oleh ${data.periodState.closedBy || "PPIC"}.` : data.summary.blockers ? `${data.summary.blockers} blocker aktif; periode belum dapat ditutup.` : "Semua gate siap untuk period closing.";
    $("pec-period-badges").innerHTML = `<span class="pec-badge ${data.summary.lateAllocations ? "bad" : "ok"}">${num(data.summary.lateAllocations)} late capacity</span><span class="pec-badge ${data.summary.openPlannedOrders ? "bad" : "ok"}">${num(data.summary.openPlannedOrders)} open order</span><span class="pec-badge ${data.summary.blockers ? "bad" : "ok"}">${num(data.summary.blockers)} blocker</span>`;
    $("pec-stages").innerHTML = data.stages.map((item) => `<a class="pec-stage ${esc(item.state)}" href="${esc(item.href)}"><span>${esc(item.code)}</span><b>${esc(item.label)}</b><small>${esc(item.message)}</small><i>${num(item.count)}</i></a>`).join("");
    const kpis = [["Demand Phases", data.summary.demandPhases], ["MPS", data.summary.mps], ["Completed MRP", data.summary.completedMrp], ["Open Orders", data.summary.openPlannedOrders, true], ["MPP", data.summary.plans], ["Operations", data.summary.allocations], ["Vendor Ops", data.summary.vendorAllocations], ["Blockers", data.summary.blockers, true]];
    $("pec-kpis").innerHTML = kpis.map(([label, value, risk]) => `<article class="${risk && value ? "risk" : ""}"><span>${esc(label)}</span><strong>${num(value)}</strong></article>`).join("");
    $("pec-formula-list").innerHTML = (data.formulas || []).map((row) => `<article><b>${esc(row.output)}</b><code>${esc(row.formula)}</code><small>${esc(row.source)}</small></article>`).join("");
    $("pec-closing-open").textContent = closed ? "Reopen Period" : "Period Closing";
  }

  function filteredRows() {
    const def = definitions[state.tab]; const query = state.search.toLowerCase();
    return def.rows(state.data).filter((row) => (!query || JSON.stringify(row).toLowerCase().includes(query)) && (!state.status || String(def.status(row) || "") === state.status));
  }
  function renderStatusOptions() {
    const def = definitions[state.tab]; const values = [...new Set(def.rows(state.data).map(def.status).filter(Boolean))].sort();
    $("pec-status").innerHTML = '<option value="">Semua status</option>' + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join(""); state.status = "";
  }
  function renderTable() {
    const def = definitions[state.tab]; const rows = filteredRows(); const pages = Math.max(Math.ceil(rows.length / state.limit), 1); state.page = Math.min(state.page, pages); const start = (state.page - 1) * state.limit; const visible = rows.slice(start, start + state.limit);
    $("pec-panel-eyebrow").textContent = def.eyebrow; $("pec-panel-title").textContent = def.title; $("pec-panel-help").textContent = def.help; $("pec-open-source").href = def.href;
    $("pec-thead").innerHTML = `<tr>${def.columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr>`;
    $("pec-tbody").innerHTML = visible.length ? visible.map((row) => `<tr>${def.cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${def.columns.length}" class="pec-empty">Tidak ada data untuk filter ini.</td></tr>`;
    $("pec-range").textContent = rows.length ? `${start + 1}–${Math.min(start + state.limit, rows.length)} dari ${rows.length}` : "0 data"; $("pec-page").textContent = `${state.page} / ${pages}`; $("pec-prev").disabled = state.page <= 1; $("pec-next").disabled = state.page >= pages;
  }
  function selectTab(tab) { state.tab = tab; state.page = 1; document.querySelectorAll("[data-pec-tab]").forEach((button) => button.classList.toggle("active", button.dataset.pecTab === tab)); if (state.data) { const query = new URLSearchParams({ month: state.data.month }); if (tab !== "capacity") query.set("tab", tab); history.replaceState({}, "", `${location.pathname}?${query}`); renderStatusOptions(); renderTable(); } }

  async function load() {
    alertBox(""); $("pec-tbody").innerHTML = '<tr><td class="pec-empty">Memuat data…</td></tr>';
    try { state.data = await api(`/modules/api/planning-ppic/execution-cockpit?month=${encodeURIComponent($("pec-month").value || config.initialMonth)}`); renderHeader(); selectTab(state.tab); }
    catch (error) { alertBox(error.message); $("pec-tbody").innerHTML = `<tr><td class="pec-empty">${esc(error.message)}</td></tr>`; }
  }

  function openClosing() {
    const closed = state.data.periodState?.status === "CLOSED"; state.closeMode = closed ? "reopen" : "close"; const command = `${closed ? "REOPEN" : "CLOSE"} ${state.data.month}`;
    $("pec-modal-title").textContent = closed ? "Reopen Period" : "Period Closing"; $("pec-modal-subtitle").textContent = closed ? "Reopen mengizinkan koreksi MPS/MRP/Capacity/MPP kembali." : "Closing membekukan versi planning periode ini."; $("pec-confirm-label").textContent = `Ketik ${command}`; $("pec-confirmation").value = ""; $("pec-reason").value = ""; $("pec-reason-wrap").hidden = !closed;
    $("pec-modal-blockers").innerHTML = !closed && state.data.blockers.length ? `<p><b>${state.data.blockers.length} blocker masih aktif:</b></p>${state.data.blockers.slice(0, 20).map((row) => `<div class="pec-modal-blocker"><b>${esc(row.reference)}</b> · ${esc(row.message)}</div>`).join("")}` : `<div class="pec-badge ok">${closed ? "Periode sedang CLOSED." : "Semua gate siap."}</div>`;
    $("pec-modal-submit").disabled = !closed && state.data.blockers.length > 0; $("pec-modal-submit").textContent = closed ? "Reopen Period" : "Close Period"; $("pec-modal").setAttribute("aria-hidden", "false"); setTimeout(() => $("pec-confirmation").focus(), 0);
  }
  const closeModal = () => $("pec-modal").setAttribute("aria-hidden", "true");

  function exportCsv() {
    const def = definitions[state.tab]; const rows = filteredRows(); const clean = (html) => { const div = document.createElement("div"); div.innerHTML = html; return div.textContent.trim(); }; const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [def.columns.map(quote).join(","), ...rows.map((row) => def.cells(row).map((cell) => quote(clean(cell))).join(","))].join("\r\n"); const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `ppic-${state.tab}-${state.data.month}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  document.querySelectorAll("[data-pec-tab]").forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.pecTab)));
  document.querySelectorAll("[data-pec-close]").forEach((button) => button.addEventListener("click", closeModal));
  $("pec-refresh").addEventListener("click", load); $("pec-month").addEventListener("change", load); $("pec-closing-open").addEventListener("click", openClosing); $("pec-export").addEventListener("click", exportCsv);
  $("pec-search").addEventListener("input", (event) => { state.search = event.target.value.trim(); state.page = 1; renderTable(); }); $("pec-status").addEventListener("change", (event) => { state.status = event.target.value; state.page = 1; renderTable(); }); $("pec-limit").addEventListener("change", (event) => { state.limit = Number(event.target.value) || 25; state.page = 1; renderTable(); });
  $("pec-prev").addEventListener("click", () => { state.page -= 1; renderTable(); }); $("pec-next").addEventListener("click", () => { state.page += 1; renderTable(); });
  $("pec-close-form").addEventListener("submit", async (event) => { event.preventDefault(); const submit = $("pec-modal-submit"); submit.disabled = true; try { const payload = { confirmation: $("pec-confirmation").value.trim(), reason: $("pec-reason").value.trim() }; const result = await api(`/modules/api/planning-ppic/execution-cockpit/${encodeURIComponent(state.data.month)}/${state.closeMode}`, { method: "POST", body: JSON.stringify(payload) }); closeModal(); await load(); alertBox(result.message, true); } catch (error) { alertBox(error.message); if (error.payload?.blockers?.length) selectTab("control"); } finally { submit.disabled = false; } });
  load();
})();
