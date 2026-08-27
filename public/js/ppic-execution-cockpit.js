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
      columns: ["Production Plan / Line", "Process", "Mode / Resource", "Schedule", "Latest start", "Latest finish", "FG required", "Customer target", "Qty", "Status", "Formula"],
      rows: (data) => data.scheduleRows || [], status: (row) => row.capacityLate ? "LATE" : row.routingMode,
      cells: (row) => [
        `<b>${esc(row.planNumber)}</b><small>Line ${esc(row.lineNumber)}</small>`, `<b>${esc(row.processCode || "-")}</b><small>Seq ${esc(row.sequence)} · ${esc(row.processName || "")}</small>`,
        `${chip(row.routingMode, row.routingMode === "VENDOR" ? "vendor" : "")}<small>${esc(row.resourceCode || "Belum dialokasikan")} · ${esc(row.resourceName || "-")}</small>`,
        `<b>${day(row.routingMode === "VENDOR" ? row.vendorSendDate : row.scheduleDate)}</b><small>${row.routingMode === "VENDOR" ? `Return ${day(row.vendorReturnDate)}` : "Internal operation"}</small>`, day(row.latestStartDate), day(row.latestFinishDate), day(row.fgRequiredDate), day(row.customerTargetDate), `<b>${num(row.plannedQty)}</b><small>${esc(row.uomCode || "")}</small>`, chip(row.capacityLate ? "LATE" : row.status, row.capacityLate ? "late" : "ready"), `<small>${esc(row.backwardFormula)}</small>`,
      ],
    },
    mrp: {
      eyebrow: "MRP RUN GOVERNANCE", title: "MRP Planning Runs", help: "Review revision resmi dari MPS sampai planned order. Hanya revision CURRENT yang menjadi sumber Production Plan.", href: "/modules/planning-ppic/mrp", sourceLabel: "Buka MRP current",
      columns: ["MRP Run / Revision", "Source MPS", "Planning Window", "Kaitan Eksekusi", "Requirement Lines", "Planned Orders", "Status", "Aksi"], rows: (data) => data.mrpRuns || [], status: (row) => row.presentationStatus || row.status,
      cells: (row) => {
        const runHref = `/modules/planning-ppic/mrp/${encodeURIComponent(row.runNumber || "")}`;
        const mpsMonth = String(row.mpsNumber || "").match(/(\d{4})(\d{2})$/);
        const mpsHref = mpsMonth ? `/modules/planning-ppic/mps/workbench?month=${mpsMonth[1]}-${mpsMonth[2]}` : "/modules/planning-ppic/mps/workbench";
        return [
          `<a class="pec-doc-link" href="${runHref}"><b>${esc(row.runNumber)}</b></a><small>${esc(row.planNumber || "MRP Plan")} · Revision ${esc(row.planRevision || 0)}</small>`,
          `<a class="pec-doc-link" href="${mpsHref}"><b>${esc(row.mpsNumber || "-")}</b></a><small>Sumber kebutuhan resmi</small>`,
          `<b>${day(row.runDate)}</b><small>Cutoff ${day(row.cutoffDate)}</small>`,
          `${chip(row.executionScope === "LINKED_SOURCE" ? "LINKED SOURCE" : row.executionScope === "PERIOD_HISTORY" ? "PREVIEW / HISTORY" : "PERIODE DEMAND", row.executionScope === "LINKED_SOURCE" || row.executionScope === "PERIOD_HISTORY" ? "vendor" : "ready")}<small>${esc(row.executionScopeLabel || row.planScope || "MPS")}</small>`,
          `<b class="pec-number">${num(row.totalRequirements)}</b><small>hasil BOM explosion</small>`,
          `<b class="pec-number">${num(row.totalPlannedOrders)}</b><small>saran produksi / beli</small>`,
          `${chip(row.status, row.status === "Completed" ? "ready" : "blocked")}${row.isCurrentPlan ? chip("CURRENT", "current") : row.presentationStatus === "SIMULATION" ? chip("SIMULATION", "vendor") : chip("SUPERSEDED")}`,
          `<a class="pec-row-action" href="${runHref}">Buka detail <span aria-hidden="true">→</span></a>`,
        ];
      },
    },
    orders: {
      eyebrow: "PLANNED ORDER WORKBENCH", title: "Release & coverage queue", help: "Qty, order date, required date, MOQ/package, dan release gap dapat diaudit tanpa menyembunyikan netting MRP.", href: "/modules/planning-ppic/planned-orders",
      columns: ["Planned Order", "Part", "Type", "Order date", "Required", "Planned qty", "Released", "Release gap", "Supplier / Vendor", "MOQ / Package", "Status", "Timing"], rows: (data) => data.plannedOrders || [], status: (row) => row.timing === "LATE_RELEASE" ? "LATE_RELEASE" : row.status,
      cells: (row) => [`<a href="/modules/planning-ppic/planned-orders/${encodeURIComponent(row.orderNumber)}"><b>${esc(row.orderNumber)}</b></a><small>${esc(row.runNumber || "")}</small>`, `<b>${esc(row.partCode)}</b>`, chip(row.orderType, row.orderType === "Purchase" ? "vendor" : ""), day(row.orderDate), day(row.requiredDate), `<b>${num(row.qty)}</b><small>${esc(row.uomCode || "")}</small>`, num(row.qtyReleased), `<b>${num(row.releaseGap)}</b><small>${esc(row.formula)}</small>`, esc(row.supplierCode || row.vendorCode || "Belum dipilih"), `<b>${row.purchaseQtyKg ? `${num(row.purchaseQtyKg)} kg` : row.purchasePackageQty ? num(row.purchasePackageQty) : row.lotCount ? `${num(row.lotCount)} lot` : "-"}</b><small>${row.kgPerLot ? `${num(row.kgPerLot)} kg/lot` : ""}</small>`, chip(row.status, row.releaseGap > 0 ? "blocked" : "ready"), chip(row.timing, row.timing === "LATE_RELEASE" ? "late" : "ready")],
    },
    mpp: {
      eyebrow: "PRODUCTION PLAN HORIZON", title: "Executable production plan", help: "Satu owner plan mengikuti demand-phase horizon. Bulan hanya memfilter tanggal yang sedang ditinjau.", href: "/modules/planning-ppic/monthly-production-plans",
      columns: ["Plan ID", "Production Horizon", "Source MPS / MRP", "Line", "FG Planned Qty", "FG Released Qty", "Operations", "Daily plans", "Data / Timing", "Status"], rows: (data) => data.plans || [], status: (row) => row.replanRequired ? "REPLAN_REQUIRED" : row.status,
      cells: (row) => [`<a href="/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(row.planNumber)}"><b>${esc(row.planNumber)}</b></a>`, `<b>${day(row.periodStart)}</b><small>s/d ${day(row.periodEnd)}</small><small>Est. start ${day(row.estimatedStart)}</small>`, `<b>${esc(row.sourceType || "-")}</b><small>Snapshot ${(row.sourceMrpRunNumbers || []).map(esc).join(", ") || "-"}</small>${row.currentSourceMrpNumber ? `<small>Current ${esc(row.currentSourceMrpNumber)}</small>` : ""}`, num(row.detailCount), num(row.plannedQty), num(row.releasedQty), num(row.allocationCount), num(row.dailyPlanCount), row.replanRequired ? `${chip("REPLAN", "blocked")}<small>${esc(row.replanReason || "")}</small>` : chip("CURRENT", "ready"), chip(row.status, ["Released", "Closed"].includes(row.status) ? "ready" : "blocked")],
    },
    control: {
      eyebrow: "CONTROL TOWER & PERIOD CLOSING", title: "Exception gates", help: "Period close hanya aktif ketika MPS, capacity, MRP, planned order, dan Production Plan tidak menyisakan blocker.", href: "#period-closing",
      columns: ["Reference", "Blocker code", "Pesan", "Tahap", "Aksi"], rows: (data) => data.blockers || [], status: (row) => row.code,
      cells: (row) => [`<b>${esc(row.reference || "-")}</b>`, chip(row.code, "blocked"), esc(row.message), esc(String(row.code || "").split("_")[0]), `<button type="button" class="btn btn-sm btn-outline-primary" data-pec-open-ref="${esc(row.reference || "")}">Review</button>`],
    },
  };

  function renderHeader() {
    const data = state.data; const closed = data.periodState?.status === "CLOSED";
    $("pec-period-banner").className = `pec-period app-container${closed ? " closed" : data.summary.blockers ? " blocked" : ""}`;
    $("pec-period-status").textContent = `${data.month} · PERIODE EKSEKUSI · ${closed ? "CLOSED" : "OPEN"}`;
    $("pec-period-meta").textContent = closed ? `Ditutup ${day(data.periodState.closedAt)} oleh ${data.periodState.closedBy || "PPIC"}.` : data.summary.blockers ? `${data.summary.blockers} blocker aktif; periode belum dapat ditutup.` : "Semua gate siap untuk period closing.";
    const lateSchedule = Number(data.summary.lateAllocations || 0) + Number(data.summary.latePlans || 0);
    $("pec-period-badges").innerHTML = `<span class="pec-badge ${lateSchedule ? "bad" : "ok"}">${num(lateSchedule)} late schedule</span><span class="pec-badge ${data.summary.openPlannedOrders ? "bad" : "ok"}">${num(data.summary.openPlannedOrders)} open order</span><span class="pec-badge ${data.summary.blockers ? "bad" : "ok"}">${num(data.summary.blockers)} blocker</span>`;
    $("pec-stages").innerHTML = data.stages.map((item) => `<a class="pec-stage ${esc(item.state)}" href="${esc(item.href)}"><span>${esc(item.code)}</span><b>${esc(item.label)}</b><small>${esc(item.message)}</small><i>${num(item.count)}</i></a>`).join("");
    $("pec-formula-list").innerHTML = (data.formulas || []).map((row) => `<article><b>${esc(row.output)}</b><code>${esc(row.formula)}</code><small>${esc(row.source)}</small></article>`).join("");
    $("pec-closing-open").textContent = closed ? "Reopen Period" : "Period Closing";
  }

  function renderViewContext() {
    const isMrp = state.tab === "mrp";
    const page = document.querySelector(".pec-page");
    page.classList.toggle("pec-view-mrp", isMrp);
    $("pec-page-eyebrow").textContent = isMrp ? "PLANNING PPIC / MRP GOVERNANCE" : "PLANNING PPIC / EXECUTION GOVERNANCE";
    $("pec-page-title").textContent = isMrp ? "MRP Planning Runs" : "Planning Execution Cockpit";
    $("pec-page-copy").textContent = isMrp
      ? "Revision resmi dari Rolling MPS untuk kebutuhan produksi dan pembelian, lengkap dengan jejak sumber dan status current."
      : "Satu runtutan resmi dari MPS, backward schedule, month-end MRP, planned order, MPP, sampai period closing.";

    if (isMrp) {
      const rows = state.data.mrpRuns || [];
      const sourceMps = new Set(rows.map((row) => row.mpsNumber).filter(Boolean)).size;
      const currentRows = rows.filter((row) => row.isCurrentPlan);
      const latestPreviewByMps = new Set();
      const previewRows = rows.filter((row) => {
        if (row.presentationStatus !== "SIMULATION" || latestPreviewByMps.has(row.mpsNumber)) return false;
        latestPreviewByMps.add(row.mpsNumber);
        return true;
      });
      const kpiRows = currentRows.length ? currentRows : previewRows;
      if (!currentRows.length && rows.length) {
        $("pec-page-copy").textContent = "MRP simulasi tersedia dan tetap dapat diaudit, tetapi belum ada revision CURRENT. Approve MPS lalu jalankan MRP Official untuk menjadi sumber Production Plan.";
      }
      const currentRuns = currentRows.length;
      const requirementLines = kpiRows.reduce((total, row) => total + Number(row.totalRequirements || 0), 0);
      const plannedOrders = kpiRows.reduce((total, row) => total + Number(row.totalPlannedOrders || 0), 0);
      const linked = rows.filter((row) => row.executionScope === "LINKED_SOURCE").length;
      const kpis = [
        ["Source MPS", sourceMps, "source", `${linked} linked ke eksekusi ${state.data.month}`],
        ["Current MRP", currentRuns, "current", "revision aktif untuk planning"],
        ["Requirement Lines", requirementLines, "requirements", currentRows.length ? "hasil current BOM explosion & netting" : "preview simulasi terbaru"],
        ["Planned Orders", plannedOrders, "orders", currentRows.length ? "saran produksi dan pembelian official" : "preview, belum untuk release"],
      ];
      $("pec-kpis").innerHTML = kpis.map(([label, value, tone, detail]) => `<article class="${tone}"><span>${esc(label)}</span><strong>${num(value)}</strong><small>${esc(detail)}</small></article>`).join("");
      return;
    }

    const genericKpis = [["Demand Phases", state.data.summary.demandPhases], ["MPS Demand Frozen", state.data.summary.mps, false, state.data.summary.linkedMps ? `${num(state.data.summary.linkedMps)} linked source` : "periode demand"], ["Current MRP", state.data.summary.completedMrp, false, state.data.summary.linkedCompletedMrp ? `${num(state.data.summary.linkedCompletedMrp)} linked source` : "periode demand"], ["Open Orders", state.data.summary.openPlannedOrders, true], ["Production Plans", state.data.summary.plans], ["Operations", state.data.summary.allocations], ["Vendor Ops", state.data.summary.vendorAllocations], ["Blockers", state.data.summary.blockers, true]];
    $("pec-kpis").innerHTML = genericKpis.map(([label, value, risk, detail]) => `<article class="${risk && value ? "risk" : ""}"><span>${esc(label)}</span><strong>${num(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</article>`).join("");
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
    $("pec-panel-eyebrow").textContent = def.eyebrow; $("pec-panel-title").textContent = def.title; $("pec-panel-help").textContent = def.help;
    const currentMrp = state.tab === "mrp" ? visible.find((row) => row.isCurrentPlan) || rows.find((row) => row.isCurrentPlan) : null;
    const previewMrp = state.tab === "mrp" ? visible.find((row) => row.presentationStatus === "SIMULATION") || rows.find((row) => row.presentationStatus === "SIMULATION") || rows[0] : null;
    const preferredMrp = currentMrp || previewMrp;
    $("pec-open-source").href = preferredMrp ? `/modules/planning-ppic/mrp/${encodeURIComponent(preferredMrp.runNumber)}` : def.href;
    $("pec-open-source").textContent = currentMrp ? (def.sourceLabel || "Buka MRP current") : previewMrp ? "Buka preview terbaru" : (def.sourceLabel || "Buka halaman sumber");
    $("pec-thead").innerHTML = `<tr>${def.columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr>`;
    $("pec-tbody").innerHTML = visible.length ? visible.map((row) => `<tr>${def.cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${def.columns.length}" class="pec-empty">Tidak ada data untuk filter ini.</td></tr>`;
    $("pec-range").textContent = rows.length ? `${start + 1}–${Math.min(start + state.limit, rows.length)} dari ${rows.length}` : "0 data"; $("pec-page").textContent = `${state.page} / ${pages}`; $("pec-prev").disabled = state.page <= 1; $("pec-next").disabled = state.page >= pages;
  }
  function selectTab(tab) { state.tab = tab; state.page = 1; document.querySelectorAll("[data-pec-tab]").forEach((button) => button.classList.toggle("active", button.dataset.pecTab === tab)); if (state.data) { const query = new URLSearchParams({ month: state.data.month }); if (tab !== "capacity") query.set("tab", tab); history.replaceState({}, "", `${location.pathname}?${query}`); renderViewContext(); renderStatusOptions(); renderTable(); } }

  async function load() {
    alertBox(""); $("pec-tbody").innerHTML = '<tr><td class="pec-empty">Memuat data…</td></tr>';
    try { state.data = await api(`/modules/api/planning-ppic/execution-cockpit?month=${encodeURIComponent($("pec-month").value || config.initialMonth)}`); renderHeader(); selectTab(state.tab); }
    catch (error) { alertBox(error.message); $("pec-tbody").innerHTML = `<tr><td class="pec-empty">${esc(error.message)}</td></tr>`; }
  }

  function openClosing() {
    const closed = state.data.periodState?.status === "CLOSED"; state.closeMode = closed ? "reopen" : "close"; const command = `${closed ? "REOPEN" : "CLOSE"} ${state.data.month}`;
    $("pec-modal-title").textContent = closed ? "Reopen Period" : "Period Closing"; $("pec-modal-subtitle").textContent = closed ? "Reopen mengizinkan koreksi MPS/MRP/Capacity/Production Plan kembali." : "Closing membekukan versi planning periode ini."; $("pec-confirm-label").textContent = `Ketik ${command}`; $("pec-confirmation").value = ""; $("pec-reason").value = ""; $("pec-reason-wrap").hidden = !closed;
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
