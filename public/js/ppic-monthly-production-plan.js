(() => {
  "use strict";
  const config = JSON.parse(document.getElementById("mpp-month-config")?.textContent || "{}");
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const entryParams = new URLSearchParams(window.location.search);
  const entryPlanNumber = entryParams.get("planNumber") || null;
  const entryFocusDate = entryParams.get("date") || null;
  let autoEditorRequested = entryParams.get("editor") === "1";
  const state = { data: null, collapsed: new Set(), knownGroups: new Set(), search: "", type: "", editor: null, stagedChanges: [], cutClipboard: null, recommendation: null, selectedRecommendationIds: new Set(), recommendationBusy: false, activePlan: null, workflowAction: null, workflowBusy: false, workflowDetailLoading: false };
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const qty = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const percent = (value) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(value) || 0)}%`;
  const hours = (minutes) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format((Number(minutes) || 0) / 60)} jam`;
  const monthLabel = (month) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const shortDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)) : "-";
  const dateParts = (key) => {
    const date = new Date(`${key}T00:00:00Z`);
    return {
      day: date.getUTCDate(),
      weekday: new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(date),
      short: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date),
      weekend: [0, 6].includes(date.getUTCDay()),
    };
  };
  const currentJakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format((globalThis.erpBusinessNow?.() || new Date()));

  async function api(url, options = {}) {
    const response = await fetch(url, { method: options.method || "GET", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: options.body == null ? undefined : JSON.stringify(options.body), credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "Monthly Production Plan gagal dimuat.");
      error.status = response.status;
      error.code = payload.code || null;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function resourceChip(row) {
    if (row.type === "OUTSOURCE") return '<span class="mpp-resource-type vendor">VENDOR</span>';
    if (row.type === "BLOCKER") return '<span class="mpp-resource-type blocker">BLOCKER</span>';
    return '<span class="mpp-resource-type">IN-HOUSE</span>';
  }

  function cutCellState(row, child, key) {
    if (!state.cutClipboard) return null;
    const sameRow = window.MppCapacityEditor?.isSameAllocationRow(state.cutClipboard, row?.key, child?.key);
    if (!sameRow) return "invalid";
    return state.cutClipboard.sourceDate === key ? "source" : "target";
  }

  function quantityLabel(day) {
    const entries = Object.entries(day.quantities || {});
    return entries.length ? entries.map(([unit, value]) => `${qty(value)} ${esc(unit)}`).join(" · ") : `${qty(day.qty)} ${esc((day.uomCodes || []).length === 1 ? day.uomCodes[0] : "")}`;
  }
  function lotDetails(day) {
    const rows = (day.lots || []).map(lot => `<tr><td>${esc(lot.lotPlanNumber)}</td><td>${esc(lot.partCode)} / ${esc(lot.processCode)}</td><td>${esc(lot.partNumber || state.data?.rows?.flatMap(row=>row.children||[]).find(child=>child.partCode===lot.partCode)?.partNumber || "—")}</td><td>${esc(lot.shift)}</td><td>${qty(lot.qty)} ${esc(lot.uomCode)}</td><td>${lot.allocations.map(a => `${esc(a.planNumber || "—")} · ${qty(a.qty)}`).join("<br>")}</td></tr>`).join("");
    return `<section><h4>Rencana lot per shift</h4><p>Perkiraan lot berdasarkan tanggal operasional, mesin, shift, part, dan proses. Alokasi sumber tetap ditelusuri.</p>${rows ? `<table class="table"><thead><tr><th>Rencana lot</th><th>Part / proses</th><th>Part Number</th><th>Shift</th><th>Jumlah</th><th>Alokasi rencana</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>Belum ada rencana lot dengan identitas shift lengkap.</p>"}${(day.lotExceptions || []).map(row => `<p>${esc(row.partCode)}: ${esc(row.reason)}</p>`).join("")}</section>`;
  }
  function parentCell(row, key) {
    const day = row.days?.[key] || {};
    const hasQty = Number(day.qty) > 0;
    const hasLoad = Number(day.loadMinutes) > 0;
    const hasBlocker = Boolean(day.blocker);
    if (!hasQty && !hasLoad && !hasBlocker && day.recommendationMoved) return '<td class="mpp-empty-cell mpp-recommendation-moved"><span class="mpp-recommended-label">MOVED</span></td>';
    if (!hasQty && !hasLoad && !hasBlocker) return state.editor
      ? `<td class="mpp-empty-cell mpp-cell-editable"><button class="mpp-cell-button" type="button" data-cell-row="${esc(row.key)}" data-cell-date="${key}" aria-label="Atur capacity ${esc(resourceLabel(row))} ${key}">＋</button></td>`
      : '<td class="mpp-empty-cell">–</td>';
    const load = Number(day.loadPercent) || 0;
    const capacityState = hasBlocker || load > 100 ? "overload" : load > 85 ? "warning" : hasLoad ? "safe" : "";
    const capacityLabel = capacityState === "overload" ? "OVERLOAD" : capacityState === "warning" ? "WARNING" : capacityState === "safe" ? "AMAN" : "";
    const loadClass = capacityState === "overload" ? "mpp-load-blocked" : capacityState === "warning" ? "mpp-load-watch" : capacityState === "safe" ? "mpp-load-safe" : "";
    const body = `${hasQty ? `<span class="mpp-day-value">${quantityLabel(day)}</span>` : ""}${day.lotCount ? `<span class="mpp-day-meta">${day.lotCount} lot · ${day.shiftCount} shift</span>` : ""}${hasLoad ? `<span class="mpp-day-meta">${percent(load)} · ${hours(day.loadMinutes)}</span>` : row.type === "OUTSOURCE" ? '<span class="mpp-day-meta">Vendor process</span>' : ""}${day.staged ? '<span class="mpp-staged-label">DRAFT</span>' : ""}${capacityState ? `<span class="mpp-cell-capacity ${capacityState}">${capacityLabel}</span>` : ""}${hasBlocker ? `<span class="mpp-blocker-stack">${percent(day.blocker.peakPercent)} BLOCKER</span>` : ""}`;
    const recommendationClass = day.recommendationOverload ? "mpp-recommendation-overload" : day.recommended ? "mpp-recommended-cell" : day.recommendationMoved ? "mpp-recommendation-moved" : "";
    return `<td class="${loadClass} ${day.staged ? "mpp-staged-preview" : ""} ${recommendationClass} ${state.editor ? "mpp-cell-editable" : ""}"><button class="mpp-cell-button" type="button" data-cell-row="${esc(row.key)}" data-cell-date="${key}">${body}</button></td>`;
  }

  function childCell(row, child, key) {
    const day = child.days?.[key] || {};
    const cutState = cutCellState(row, child, key);
    if (child.type === "BLOCKER" && day.blocker) return `<td class="mpp-load-blocked"><button class="mpp-cell-button" type="button" data-cell-row="${esc(row.key)}" data-cell-child="${esc(child.key)}" data-cell-date="${key}"><span class="mpp-day-value">${percent(day.blocker.peakPercent)}</span><span class="mpp-day-meta">+${hours(day.blocker.excessMinutes)}</span></button></td>`;
    if ((Number(day.qty) || 0) <= 0 && (Number(day.minutes) || 0) <= 0 && day.recommendationMoved) {
      return '<td class="mpp-empty-cell mpp-recommendation-moved"><span class="mpp-recommended-label">MOVED</span></td>';
    }
    if ((Number(day.qty) || 0) <= 0 && (Number(day.minutes) || 0) <= 0) {
      const canAllocate = state.editor && state.editor.scope !== "GLOBAL" && remainingCandidatesFor(row, child).length > 0;
      const cutClickable = Boolean(state.cutClipboard && state.editor?.scope !== "GLOBAL");
      return canAllocate || cutClickable
        ? `<td class="mpp-empty-cell mpp-cell-editable ${cutState === "target" ? "mpp-cut-target" : cutState === "invalid" ? "mpp-cut-invalid-target" : ""}"><button class="mpp-cell-button mpp-allocation-add" type="button" data-cell-row="${esc(row.key)}" data-cell-child="${esc(child.key)}" data-cell-date="${key}" aria-label="${cutState === "target" ? `Paste ${esc(child.partCode)} pada ${key}` : cutState === "invalid" ? "Baris ini bukan target Cut & Paste" : `Alokasikan remaining ${esc(child.partCode)} pada ${key}`}">${cutState === "target" ? '<span class="mpp-paste-label">PASTE</span>' : cutState === "invalid" ? '<span class="mpp-paste-locked">–</span>' : "＋"}</button></td>`
        : '<td class="mpp-empty-cell">–</td>';
    }
    const allocationEditable = state.editor && state.editor.scope !== "GLOBAL" && day.allocations?.length;
    const recommendationClass = day.recommendationOverload ? "mpp-recommendation-overload" : day.recommended ? "mpp-recommended-cell" : day.recommendationMoved ? "mpp-recommendation-moved" : "";
    const recommendationIds = (day.recommendationItemIds || []).filter(Boolean);
    const checked = recommendationIds.length && recommendationIds.every((id) => state.selectedRecommendationIds.has(id));
    const selector = recommendationIds.length ? `<label class="mpp-recommendation-check" title="Pilih proposal pada cell ini"><input type="checkbox" data-recommendation-items="${esc(recommendationIds.join(","))}" ${checked ? "checked" : ""}><span>SELECT</span></label>` : "";
    return `<td class="${allocationEditable ? "mpp-cell-editable" : ""} ${day.staged ? "mpp-staged-preview" : ""} ${recommendationClass} ${cutState === "source" ? "mpp-cut-source" : cutState === "target" ? "mpp-cut-target" : cutState === "invalid" ? "mpp-cut-invalid-target" : ""}"><button class="mpp-cell-button" type="button" data-cell-row="${esc(row.key)}" data-cell-child="${esc(child.key)}" data-cell-date="${key}"><span class="mpp-day-value">${qty(day.qty)}</span><span class="mpp-day-meta">${esc((day.uomCodes || []).join(" / ") || "PCS")}${day.minutes ? ` · ${hours(day.minutes)}` : ""}</span>${cutState === "source" ? '<span class="mpp-cut-label">CUT</span>' : cutState === "target" ? '<span class="mpp-paste-label">PASTE DI SINI</span>' : day.staged ? '<span class="mpp-staged-label">DRAFT</span>' : day.recommended ? '<span class="mpp-recommended-label">RECOMMENDED</span>' : ""}</button>${selector}</td>`;
  }

  function emptyPlanningCells() {
    return '<td class="mpp-summary-cell empty">–</td><td class="mpp-summary-cell empty">–</td><td class="mpp-summary-cell empty">–</td><td class="mpp-summary-cell empty">–</td><td class="mpp-summary-cell empty">–</td>';
  }

  function childPlanningCells(child) {
    if (child.type !== "PART") return emptyPlanningCells();
    const summary = window.MppCapacityEditor?.getChildPlanningSummary(child) || { available: false };
    const production = summary.production ?? qty(child.monthlyProductionQty);
    const warehouseStockCell = summary.available
      ? `<td class="mpp-summary-cell stock-wh" title="${esc(summary.warehouseStockBreakdown)}"><b>${esc(summary.warehouseStock)}</b></td>`
      : '<td class="mpp-summary-cell empty">–</td>';
    const wipStockCell = summary.available
      ? `<td class="mpp-summary-cell stock-wip" title="${esc(summary.wipStockBreakdown)}"><b>${esc(summary.wipStock)}</b></td>`
      : '<td class="mpp-summary-cell empty">–</td>';
    const requirementCell = summary.available
      ? `<td class="mpp-summary-cell requirement" title="${esc(summary.requirementBreakdown)}"><b>${esc(summary.requirement)}</b></td>`
      : '<td class="mpp-summary-cell empty">–</td>';
    const remainingCell = summary.available
      ? `<td class="mpp-summary-cell remaining" title="Sisa kebutuhan part dan proses yang sama, setelah stok dan produksi di seluruh mesin"><b>${esc(summary.remaining)}</b></td>`
      : '<td class="mpp-summary-cell empty">–</td>';
    return `${warehouseStockCell}${wipStockCell}${requirementCell}<td class="mpp-summary-cell production" title="Total alokasi produksi pada mesin / vendor ini selama bulan terpilih"><b>${esc(production)}</b></td>${remainingCell}`;
  }

  function displayRows() {
    let rows = state.data?.rows || [];
    if (state.editor && state.stagedChanges.length) rows = window.MppCapacityEditor?.projectStagedMatrix(rows, state.stagedChanges) || rows;
    if (state.recommendation) rows = window.MppRecommendation?.projectRecommendationRows(rows, state.recommendation) || rows;
    return window.MppCapacityEditor?.withPlanningTotals(rows) || rows;
  }

  const resourceLabel = (row) => row?.machineName || row?.machineCode || row?.resourceCode || row?.workCenterCode || "Belum dialokasikan";
  const resourceDetail = (row) => row?.machineCode || row?.resourceName || row?.workCenterName || "";
  const resourceSearch = (row) => [resourceLabel(row), resourceDetail(row), row.workCenterCode, row.workCenterName, row.lineCode].filter(Boolean).join(" ").toLowerCase();

  function visibleRows() {
    const term = state.search.toLowerCase();
    return displayRows().filter((row) => {
      if (state.type && row.type !== state.type) return false;
      if (!term) return true;
      return `${resourceSearch(row)} ${row.children?.map((child) => `${child.partNumber || ""} ${child.partCode} ${child.partName} ${child.processCodes?.join(" ")}`).join(" ")} ${row.fgRequirements?.map((item) => `${item.partNumber || ""} ${item.partCode} ${item.partName || ""} ${item.processCode || ""}`).join(" ")}`.toLowerCase().includes(term);
    });
  }

  function renderHeader() {
    $("mpp-month-thead").innerHTML = `<tr><th>Mesin / Part</th><th class="mpp-summary-head stock-wh"><span>Stock WH</span></th><th class="mpp-summary-head stock-wip"><span>Stock WIP</span></th><th class="mpp-summary-head requirement"><span>Kebutuhan EFD</span></th><th class="mpp-summary-head production"><span>Total Produksi</span></th><th class="mpp-summary-head remaining"><span>Remain Allocation</span></th>${state.data.dates.map((key) => {
      const info = dateParts(key);
      return `<th class="mpp-date-head ${info.weekend ? "weekend" : ""} ${key === currentJakartaDate ? "today" : ""}"><span>${esc(info.weekday)}</span><b>${info.day}</b><small>${key === currentJakartaDate ? "Hari ini" : "Target"}</small></th>`;
    }).join("")}</tr>`;
  }

  const executor = window.MppExecutor?.create({ api, onApplied: (planNumber) => load(planNumber) });
  function executorSources(child, date = null) {
    return window.MppExecutor?.collectSources(child, state.data?.editor?.remainingAllocations || state.data?.remainingAllocations || [], date) || [];
  }
  function executorButton(row, child, date = null) {
    if (child?.type !== "PART" || !executorSources(child, date).length) return "";
    return `<button type="button" class="mpp-executor-launch" data-executor-row="${esc(row.key)}" data-executor-child="${esc(child.key)}" ${date ? `data-executor-date="${esc(date)}"` : ""} ${state.editor || state.recommendationBusy || state.workflowBusy ? 'disabled title="Selesaikan editor atau proses plan sebelum mengubah pelaksana"' : 'title="Pilih mesin atau vendor aktual untuk batch dan proses ini"'}>Ubah Pelaksana</button>`;
  }
  function openExecutor(rowKey, childKey, date = null) {
    if (!executor || state.editor || state.recommendationBusy || state.workflowBusy) return;
    const row = (state.data?.rows || []).find((item) => item.key === rowKey);
    const child = row?.children?.find((item) => item.key === childKey);
    const sources = executorSources(child, date);
    if (!sources.length) return;
    $("mpp-month-dialog").close();
    executor.open(sources);
  }

  function renderBody() {
    const rows = visibleRows();
    const resourceHtml = rows.map((row) => {
      const isCollapsed = state.collapsed.has(row.key);
      const term = state.search.toLowerCase();
      const matchingChildren = !term || resourceSearch(row).includes(term) ? row.children : row.children.filter((child) => `${child.partNumber || ""} ${child.partCode} ${child.partName || ""} ${(child.processCodes || []).join(" ")}`.toLowerCase().includes(term));
      const childRows = matchingChildren.map((child) => {
        const processLabel = (child.processCodes || []).join(" · ") || "Proses belum ditentukan";
        return `<tr class="mpp-part-row ${child.type === "BLOCKER" ? "blocker" : ""}" data-parent="${esc(row.key)}" ${isCollapsed ? "hidden" : ""}><td><div class="mpp-part-label"><i>↳</i><div><b>${esc(child.partNumber || child.partCode)}</b><small>${esc(child.partCode)} · ${esc(child.partName || "Part produksi")}</small>${child.type === "PART" ? `<span class="mpp-part-trace"><em>${esc(child.itemType || "WIP")}</em><strong>Process ${esc(processLabel)}</strong></span>` : ""}${executorButton(row, child)}</div></div></td>${childPlanningCells(child)}${state.data.dates.map((key) => childCell(row, child, key)).join("")}</tr>`;
      }).join("");
      return `<tr class="mpp-wc-row ${row.type === "OUTSOURCE" ? "vendor" : ""} ${row.blockerCount > 0 ? "blocked" : ""}"><td><button class="mpp-wc-toggle" type="button" data-toggle-row="${esc(row.key)}" aria-expanded="${!isCollapsed}"><i>▼</i><span><b>${esc(resourceLabel(row))}</b><small>${esc(resourceDetail(row))}${row.machineId && row.workCenterCode ? ` · WC ${esc(row.workCenterCode)}` : ""}</small></span><span class="mpp-resource-chips">${resourceChip(row)}</span></button></td>${emptyPlanningCells()}${state.data.dates.map((key) => parentCell(row, key)).join("")}</tr>${childRows}`;
    }).join("");
    const fgByPart = new Map();
    for (const requirement of state.data.fgRequirements || []) {
      const searchable = `${requirement.partNumber || ""} ${requirement.partCode || ""} ${requirement.partName || ""}`.toLowerCase();
      if (state.search && !searchable.includes(state.search.toLowerCase())) continue;
      if (!fgByPart.has(requirement.partCode)) fgByPart.set(requirement.partCode, { ...requirement, days: {} });
      const part = fgByPart.get(requirement.partCode);
      if (!part.days[requirement.fgRequiredDate]) part.days[requirement.fgRequiredDate] = { qty: 0, uomCodes: [], planNumbers: [] };
      const day = part.days[requirement.fgRequiredDate];
      day.qty += Number(requirement.qty) || 0;
      if (!day.uomCodes.includes(requirement.uomCode || "PCS")) day.uomCodes.push(requirement.uomCode || "PCS");
      if (requirement.planNumber && !day.planNumbers.includes(requirement.planNumber)) day.planNumbers.push(requirement.planNumber);
    }
    const fgParts = [...fgByPart.values()].sort((left, right) => (left.partNumber || left.partCode).localeCompare(right.partNumber || right.partCode));
    const fgCollapsed = state.collapsed.has("FG_REQUIRED");
    const fgGroupHtml = !state.type && fgParts.length ? `<tr class="mpp-fg-group-row"><td><button class="mpp-fg-toggle" type="button" data-toggle-fg="FG_REQUIRED" aria-expanded="${!fgCollapsed}"><i>▼</i><span><b>FG REQUIRED</b><small>${fgParts.length} FG parent · qty ditampilkan pada tanggal wajib selesai</small></span><em>FG</em></button></td>${emptyPlanningCells()}${state.data.dates.map((key) => {
      const total = fgParts.reduce((sum, part) => sum + (Number(part.days[key]?.qty) || 0), 0);
      return total > 0 ? `<td class="mpp-fg-group-cell"><b>${qty(total)}</b><small>FG required</small></td>` : '<td class="mpp-empty-cell">–</td>';
    }).join("")}</tr>${fgParts.map((part) => `<tr class="mpp-fg-parent-row" data-fg-parent="FG_REQUIRED" ${fgCollapsed ? "hidden" : ""}><td><div class="mpp-fg-parent-label"><i>FG</i><div><b>${esc(part.partNumber || part.partCode)}</b><small>${esc(part.partCode)} · ${esc(part.partName || "FG parent")}</small></div></div></td>${emptyPlanningCells()}${state.data.dates.map((key) => {
      const day = part.days[key];
      return Number(day?.qty) > 0 ? `<td class="mpp-fg-due-cell"><b>${qty(day.qty)}</b><small>${esc(day.uomCodes.join(" / ") || "PCS")}</small></td>` : '<td class="mpp-empty-cell">–</td>';
    }).join("")}</tr>`).join("")}` : "";
    const html = `${resourceHtml}${fgGroupHtml}`;
    $("mpp-month-tbody").innerHTML = html || `<tr><td colspan="${state.data.dates.length + 6}" class="mpp-month-empty">Tidak ada allocation yang sesuai filter.</td></tr>`;
    $("mpp-month-range").textContent = `${rows.filter((row) => row.machineId).length} Mesin · ${rows.filter((row) => row.type === "OUTSOURCE").length} Vendor · ${rows.reduce((sum, row) => sum + row.children.filter((child) => child.type === "PART").length, 0)} Part · ${fgParts.length} FG parent`;
    bindTableEvents();
  }

  function renderSummary() {
    const data = state.data;
    const capacity = window.MppCapacityEditor?.getAuthoritativeCapacity(data.summary, data.capacity) || data.capacity || {};
    const overloaded = Number(capacity.overloadedCells || data.summary?.overloadedCells || 0);
    const proposed = Number(data.summary?.unallocatedCount || 0);
    const materialHold = Number(data.summary?.materialHoldCount || 0);
    const crossMonth = Number(data.summary?.crossMonthCount || 0);
    $("mpp-kpi-plans").textContent = qty(data.summary?.planCount);
    $("mpp-kpi-centers").textContent = qty(data.summary?.machineCount);
    $("mpp-kpi-load").textContent = percent(capacity.utilizationPercent);
    $("mpp-kpi-load-note").textContent = `${hours(capacity.loadMinutes)} / ${hours(capacity.availableMinutes)}`;
    $("mpp-kpi-blockers").textContent = qty(overloaded);
    $("mpp-health-capacity-value").textContent = `${qty(overloaded)} overload`;
    $("mpp-health-proposed-value").textContent = `${qty(proposed)} operasi`;
    $("mpp-health-material-value").textContent = `${qty(materialHold)} phase`;
    $("mpp-health-cross-month-value").textContent = `${qty(crossMonth)} operasi`;
    $("mpp-health-capacity").className = overloaded ? "danger" : "safe";
    $("mpp-health-proposed").className = proposed ? "warning" : "safe";
    $("mpp-health-material").className = materialHold ? "warning" : "safe";
    $("mpp-health-cross-month").className = crossMonth ? "info" : "safe";
    const monthState = overloaded
      ? { text: "CAPACITY OVERLOAD", className: "blocked" }
      : proposed
        ? { text: "ALOKASI BELUM DISIMPAN", className: "warning" }
        : materialHold
          ? { text: "MATERIAL WARNING", className: "warning" }
          : { text: "SIAP DIREVIEW", className: "ready" };
    $("mpp-month-state").textContent = monthState.text;
    $("mpp-month-state").className = `mpp-month-state ${monthState.className}`;
    $("mpp-month-caption").textContent = `Jadwal Produksi · ${monthLabel(data.month)}`;
    const unallocatedNotice = window.MppCapacityEditor?.getUnallocatedNotice(data.summary);
    $("mpp-month-alert").hidden = !unallocatedNotice;
    $("mpp-month-alert").textContent = unallocatedNotice?.message || "";
    $("mpp-month-alert").classList.toggle("warning", Boolean(unallocatedNotice));
  }

  function setRecommendationBusy(busy) {
    state.recommendationBusy = Boolean(busy);
    const button = $("mpp-recommendation-generate");
    if (button) {
      button.disabled = state.recommendationBusy || Boolean(state.editor);
      button.textContent = state.recommendationBusy ? "OR-Tools mengoptimasi…" : "✦ Auto Allocation CP-SAT";
    }
    for (const id of ["mpp-recommendation-apply-all", "mpp-recommendation-apply-selected", "mpp-recommendation-apply-resource", "mpp-recommendation-discard"]) {
      if ($(id)) $(id).disabled = state.recommendationBusy;
    }
  }

  function renderRecommendationBar() {
    const bar = $("mpp-recommendation-bar");
    const scenario = state.recommendation;
    bar.hidden = !scenario;
    document.body.classList.toggle("mpp-recommendation-active", Boolean(scenario));
    if (!scenario) {
      setRecommendationBusy(false);
      return;
    }
    setRecommendationBusy(state.recommendationBusy);
    const summary = window.MppRecommendation?.getScenarioSummary(scenario) || {};
    const badge = window.MppRecommendation?.renderScenarioBadge(scenario) || scenario.status;
    const scenarioSource = window.MppRecommendation?.renderScenarioSource(scenario) || "RULE-BASED";
    const solver = scenario.aiValidationSummary?.solver || {};
    $("mpp-recommendation-summary").innerHTML = `<div class="mpp-recommendation-title" title="${esc(JSON.stringify(scenario.aiValidationSummary || {}))}"><span>${esc(scenarioSource)}</span><strong>${esc(badge)}</strong><small>${solver.taskCount != null ? `${qty(solver.taskCount)} task · ${esc(solver.engineVersion || "0.9.1")} · ${qty(solver.wallTimeSeconds)} detik` : "Plan resmi belum berubah"}</small></div><dl><div><dt>FG on-time</dt><dd>${qty(summary.fgOnTimeCount)}</dd></div><div class="late"><dt>FG late</dt><dd>${qty(summary.fgLateCount)}</dd></div><div><dt>New</dt><dd>${qty(summary.newAllocationCount)}</dd></div><div><dt>Moved / split</dt><dd>${qty(summary.movedOrSplitCount)}</dd></div><div class="overload"><dt>Overload</dt><dd>${qty(summary.overloadCellCount)}</dd></div><div class="queue"><dt>Material Queue</dt><dd>${qty(summary.materialQueueQty)}</dd></div><div class="${summary.fgCoverageReady ? "ready" : "late"}"><dt>FG covered</dt><dd>${summary.fgCoverageReady ? "YES" : "NO"}</dd></div><div class="${Number(summary.remainingAllocationQty) > 0 ? "queue" : "ready"}"><dt>Remain</dt><dd>${qty(summary.remainingAllocationQty)}</dd></div></dl>`;
    const resourceSelect = $("mpp-recommendation-resource");
    const selectedValue = resourceSelect.value;
    const resourceKeys = [...new Set((scenario.items || []).filter((item) => item.changeType && item.applyStatus === "PENDING").map(recommendationResourceKey).filter(Boolean))].sort();
    const matrixRows = displayRows();
    resourceSelect.innerHTML = '<option value="">Pilih Mesin / Vendor</option>' + resourceKeys.map((key) => {
      const row = matrixRows.find((candidate) => candidate.key === key);
      return '<option value="' + esc(key) + '">' + esc(row ? resourceLabel(row) + ' · ' + resourceDetail(row) : key) + '</option>';
    }).join("");
    if (resourceKeys.includes(selectedValue)) resourceSelect.value = selectedValue;
    $("mpp-recommendation-apply-resource").disabled = state.recommendationBusy || !resourceSelect.value;
    $("mpp-recommendation-apply-selected").disabled = state.recommendationBusy || state.selectedRecommendationIds.size === 0;
    $("mpp-recommendation-apply-all").disabled = state.recommendationBusy || Number(summary.selectableCount || 0) === 0;
    $("mpp-recommendation-queue").disabled = Number(summary.materialQueueQty || 0) <= 0 && Number(summary.carryOverQty || 0) <= 0;
  }

  function render() {
    renderHeader();
    renderSummary();
    renderBody();
    renderEditorToolbar();
    renderRecommendationBar();
    renderReleaseRail();
  }

  function workflowPlanOptions() {
    return state.data?.editor?.plans || [];
  }

  function pendingMoDetails(plan) {
    return (plan?.details || []).filter((detail) => {
      if (String(detail.notes || "").includes("[MRP-PRODUCTION]")) return false;
      if (["Cancelled", "Completed"].includes(detail.status)) return false;
      return Math.max(Number(detail.qtyPlanned || 0) - Number(detail.qtyReleased || 0), 0) > 0;
    });
  }

  function firstDailyPlanDate(plan) {
    return (plan?.dailyProductionPlans || []).map((row) => String(row.scheduleDate || "").slice(0, 10)).filter(Boolean).sort()[0] || null;
  }

  function workflowView(plan) {
    if (!plan) return { action: null, step: "PLAN BELUM TERSEDIA", title: "Pilih Monthly Production Plan", copy: "Plan akan muncul setelah MPS dan MRP membentuk kebutuhan produksi.", label: "Belum tersedia", disabled: true };
    if (state.workflowDetailLoading) return { action: null, step: "MEMERIKSA GATE", title: "Membaca readiness plan", copy: "Matrix sudah dapat dibaca sambil kesiapan jadwal mesin, MO, dan Daily Plan dimuat.", label: "Memeriksa…", disabled: true };
    if (plan.replanRequired) return { action: null, step: "REPLAN REQUIRED", title: "Sumber atau jadwal sudah berubah", copy: plan.replanReason || "Sinkronkan ulang Monthly Plan sebelum melanjutkan.", label: "Replan diperlukan", disabled: true };
    if (state.editor) return { action: null, step: "EDITOR AKTIF", title: "Selesaikan draft allocation", copy: "Save atau Cancel perubahan editor sebelum menjalankan tindakan resmi.", label: "Editor sedang aktif", disabled: true };
    if (plan.status === "Draft") return { action: "CONFIRM", step: "1 / 4 · REVIEW PLAN", title: "Kunci plan hasil review", copy: "Confirm menyatakan qty, delivery phase, dan allocation sudah diperiksa. Halaman tidak akan refresh.", label: "Confirm Plan", disabled: false };
    if (plan.status === "Confirmed") {
      const summary = plan.planReadiness?.summary || {};
      const ready = plan.planReadiness?.releaseReady === true;
      return { action: "RELEASE", step: "2 / 4 · KESIAPAN PLAN", title: ready ? "Jadwal mesin siap untuk release" : "Selesaikan kendala jadwal dan material", copy: ready ? `${Number(summary.warning || 0)} warning non-blocking. Release membuka pembuatan MO.` : `${Number(summary.blocking || 0)} blocker dan ${Number(summary.overridable || 0)} override belum selesai. Periksa rincian kesiapan dan jadwal mesin di halaman ini.`, label: ready ? "Release Plan" : "Belum siap release", disabled: !ready };
    }
    if (["Released", "In Progress"].includes(plan.status)) {
      const pending = pendingMoDetails(plan);
      if (!(plan.manufacturingOrders || []).length || pending.length) return { action: "CREATE_MO", step: "3 / 4 · PRODUCTION ORDER", title: "Bentuk MO dari line Monthly Plan", copy: `${pending.length} line masih memiliki qty yang belum direlease ke Manufacturing Order.`, label: "Buat MO Reference", disabled: !pending.length };
      const dailyDate = firstDailyPlanDate(plan);
      if (!dailyDate) return { action: "PUBLISH_DPP", step: "4 / 4 · DAILY PLAN", title: "Turunkan allocation ke Daily Plan", copy: "Tanggal, mesin, proses vendor, shift, dan MO mengikuti allocation resmi Monthly Plan.", label: "Publish ke Daily Plan", disabled: false };
      return { action: "OPEN_DAILY", step: "SIAP DIEKSEKUSI", title: "Draft Daily Plan sudah terbentuk", copy: `Buka ${dailyDate} untuk validasi dan release ke Production.`, label: "Buka Daily Plan", disabled: false, dailyDate };
    }
    return { action: null, step: String(plan.status || "STATUS").toUpperCase(), title: "Plan hanya dapat dilihat", copy: "Tidak ada tindakan workflow berikutnya untuk status ini.", label: "Tidak ada tindakan", disabled: true };
  }

  function renderReleaseRail() {
    const select = $("mpp-workflow-plan");
    if (!select) return;
    const plans = workflowPlanOptions();
    const selected = state.activePlan?.planNumber || plans[0]?.planNumber || "";
    select.innerHTML = plans.length
      ? plans.map((plan) => `<option value="${esc(plan.planNumber)}" ${plan.planNumber === selected ? "selected" : ""}>${esc(plan.planNumber)} · ${esc(plan.status)}</option>`).join("")
      : '<option value="">Belum ada plan</option>';
    select.disabled = state.workflowBusy || plans.length < 2;
    const plan = state.activePlan;
    const view = workflowView(plan);
    state.workflowAction = view.action;
    const status = String(plan?.status || "Draft");
    $("mpp-workflow-status").textContent = status.toUpperCase();
    $("mpp-workflow-status").className = status.toLowerCase().replace(/\s+/g, "-");
    $("mpp-workflow-step").textContent = view.step;
    $("mpp-workflow-title").textContent = view.title;
    $("mpp-workflow-copy").textContent = view.copy;
    const scheduleLink = $("mpp-workflow-schedule");
    scheduleLink.href = "#mpp-month-board";
    scheduleLink.hidden = !plan || !["Confirmed", "Released", "In Progress"].includes(plan.status);
    const issues = plan?.planReadiness?.issues || [];
    $("mpp-workflow-issues").hidden = !issues.length;
    $("mpp-workflow-issue-list").innerHTML = issues.map((issue) => `<li><b>${esc([issue.machineCode, issue.partCode, issue.processCode].filter(Boolean).join(" · ") || issue.severity || "Plan")}</b><span>${esc(issue.message || issue.reason || issue.code || "Periksa jadwal dan sumber plan.")}</span></li>`).join("");
    const dailyDate = view.dailyDate || firstDailyPlanDate(plan);
    const dailyLink = $("mpp-workflow-daily");
    dailyLink.hidden = !dailyDate;
    if (dailyDate) dailyLink.href = `/modules/planning-ppic/daily-production-plans?date=${encodeURIComponent(dailyDate)}`;
    const button = $("mpp-workflow-action");
    button.textContent = state.workflowBusy ? "Memproses…" : view.label;
    button.disabled = state.workflowBusy || view.disabled;
    button.dataset.action = view.action || "";
  }

  function showWorkflowMessage(message, tone = "info") {
    const alert = $("mpp-month-alert");
    alert.textContent = message;
    alert.classList.remove("warning", "info");
    if (tone === "warning") alert.classList.add("warning");
    if (tone === "info" || tone === "success") alert.classList.add("info");
    alert.hidden = false;
  }

  function openWorkflowDialog() {
    const plan = state.activePlan;
    const view = workflowView(plan);
    if (!plan || !view.action || view.disabled) return;
    if (view.action === "OPEN_DAILY") {
      window.location.href = `/modules/planning-ppic/daily-production-plans?date=${encodeURIComponent(view.dailyDate)}`;
      return;
    }
    const copy = {
      CONFIRM: ["CONFIRM PRODUCTION PLAN", "Confirm Monthly Production Plan", "Qty, delivery phase, dan allocation akan dikunci sebagai hasil review PPIC.", "Saya sudah memeriksa qty, delivery phase, dan allocation plan."],
      RELEASE: ["CAPACITY GATE", "Release Monthly Production Plan", "Release hanya berhasil bila capacity, routing, dan delivery coverage tidak memiliki blocker.", "Saya sudah memeriksa hasil Capacity Check dan seluruh blocker."],
      CREATE_MO: ["PRODUCTION ORDER", "Buat Manufacturing Order", `${pendingMoDetails(plan).length} line residual akan dibuatkan MO reference.`, "Saya menyetujui pembuatan MO berdasarkan qty residual plan."],
      PUBLISH_DPP: ["DAILY PLAN", "Publish allocation ke Daily Plan", "Sistem akan membuat draft Daily Plan per tanggal dan menautkan MO, mesin, proses, serta shift.", "Saya sudah memeriksa allocation dan siap membentuk draft Daily Plan."],
    }[view.action];
    $("mpp-workflow-dialog-kicker").textContent = copy[0];
    $("mpp-workflow-dialog-title").textContent = copy[1];
    $("mpp-workflow-dialog-summary").innerHTML = `<b>${esc(plan.planNumber)} · ${esc(plan.status)}</b><span>${esc(copy[2])}</span>`;
    $("mpp-workflow-confirm-copy").textContent = copy[3];
    $("mpp-workflow-confirm").checked = false;
    $("mpp-workflow-dialog-submit").textContent = view.label;
    $("mpp-workflow-dialog").showModal();
  }

  async function runWorkflowAction() {
    const plan = state.activePlan;
    const action = state.workflowAction;
    if (!plan || !action || action === "OPEN_DAILY") return;
    state.workflowBusy = true;
    renderReleaseRail();
    try {
      let result;
      if (action === "CONFIRM") result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}/confirm`, { method: "POST", body: {} });
      if (action === "RELEASE") result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}/release`, { method: "POST", body: {} });
      if (action === "CREATE_MO") {
        const items = pendingMoDetails(plan).map((detail) => ({ referenceType: "MonthlyProductionPlan", monthlyProductionPlanNumber: plan.planNumber, monthlyProductionPlanLineNumber: detail.lineNumber, qtyPlanned: Math.max(Number(detail.qtyPlanned || 0) - Number(detail.qtyReleased || 0), 0), plannedStartDate: detail.latestStartDate || plan.periodStart, plannedEndDate: detail.fgRequiredDate || detail.requiredDate || plan.periodEnd, status: "Planned" }));
        result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}/release-mos`, { method: "POST", body: { items } });
      }
      if (action === "PUBLISH_DPP") result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}/daily-plans`, { method: "POST", body: { source: "MONTHLY_PLAN_WORKFLOW" } });
      $("mpp-workflow-dialog").close();
      const messages = { CONFIRM: "Plan berhasil dikonfirmasi.", RELEASE: "Plan berhasil direlease; MO sekarang dapat dibuat.", CREATE_MO: "MO reference berhasil dibuat dari line plan.", PUBLISH_DPP: `Draft Daily Plan berhasil dibuat untuk ${Number(result?.revisions?.length || 0)} tanggal.` };
      const followUpCount = [
        ...(Array.isArray(result?.warnings) ? result.warnings : []),
        ...(Array.isArray(result?.notices) ? result.notices : []),
      ].filter((item) => item?.code === "UNSCHEDULED_FOLLOW_UP").length;
      await load(plan.planNumber);
      showWorkflowMessage(`${messages[action]}${followUpCount ? ` ${followUpCount} item unscheduled dicatat sebagai warning tindak lanjut.` : ""}`, followUpCount ? "warning" : "success");
      window.PpicWorkflow?.refresh(state.data?.month);
    } catch (error) {
      showWorkflowMessage(error.message, "warning");
    } finally {
      state.workflowBusy = false;
      renderReleaseRail();
    }
  }

  function editorPlans() { return state.data?.editor?.plans || []; }
  function selectedEditorPlan() { return editorPlans().find((plan) => plan.planNumber === $("mpp-editor-plan").value) || editorPlans()[0] || null; }
  function allMachines() {
    const map = new Map();
    for (const row of state.data?.rows || []) for (const day of Object.values(row.days || {})) for (const machine of day.machines || []) if (machine.id) map.set(machine.id, machine);
    return [...map.values()].sort((left, right) => String(left.machineCode).localeCompare(String(right.machineCode)));
  }
  const remainingCandidateKey = (candidate) => `${candidate.planNumber}|${candidate.lineNumber}|${candidate.mbomProcessId}`;
  const remainingPoolKey = (candidate) => [candidate.planNumber, candidate.partCode, candidate.processCode, candidate.mbomProcessId, String(candidate.routingMode || "INHOUSE").toUpperCase()].join("|");
  function candidateInputAvailabilityEvents(candidate) {
    const inputs = new Map((candidate.inputStockSources || []).map((source) => [source.partCode, Math.max(Number(source.qtyPerParent || 1), 0.000001)]));
    if (!inputs.size) return candidate.inputAvailabilityEvents || [];
    const events = [...(candidate.inputAvailabilityEvents || [])];
    const seen = new Set();
    for (const row of state.data?.rows || []) for (const child of row.children || []) for (const day of Object.values(child.days || {})) {
      for (const allocation of day.allocations || []) {
        const identity = allocation.allocationId || [allocation.planNumber, allocation.lineNumber, allocation.mbomProcessId, allocation.scheduleDate, allocation.qty].join("|");
        if (seen.has(identity)) continue;
        seen.add(identity);
        if (allocation.mbomProcessId === candidate.mbomProcessId) {
          events.push({ type: "CONSUMPTION", sourceId: identity, date: allocation.scheduleDate, qty: Number(allocation.qty || 0) });
        } else if (inputs.has(allocation.partCode)) {
          events.push({
            type: "SUPPLY",
            sourceId: identity,
            partCode: allocation.partCode,
            date: allocation.vendorReturnDate || allocation.scheduleDate,
            qty: Number(allocation.expectedReturnQty ?? allocation.qty ?? 0) / inputs.get(allocation.partCode),
          });
        }
      }
    }
    for (const [index, change] of state.stagedChanges.filter((item) => item.type === "ALLOCATE_REMAINING").entries()) {
      const sourceId = change.recommendationItemId || ["staged", index, change.planNumber, change.lineNumber, change.mbomProcessId, change.targetDate].join("|");
      if (change.mbomProcessId === candidate.mbomProcessId) {
        events.push({ type: "CONSUMPTION", sourceId, date: change.targetDate, qty: Number(change.qty || 0) });
      } else if (inputs.has(change.partCode)) {
        events.push({
          type: "SUPPLY",
          sourceId,
          partCode: change.partCode,
          date: change.vendorReturnDate || change.targetDate,
          qty: Number(change.qty || 0) / inputs.get(change.partCode),
        });
      }
    }
    return events;
  }
  function availableRemainingAllocations() {
    const stagedByCandidate = new Map();
    for (const change of state.stagedChanges.filter((item) => item.type === "ALLOCATE_REMAINING")) {
      const splits = Array.isArray(change.allocations) && change.allocations.length
        ? change.allocations
        : [{ lineNumber: change.lineNumber, qty: change.qty }];
      for (const split of splits) {
        const key = `${change.planNumber}|${split.lineNumber}|${change.mbomProcessId}`;
        stagedByCandidate.set(key, (stagedByCandidate.get(key) || 0) + Number(split.qty || 0));
      }
    }
    return (state.data?.editor?.remainingAllocations || state.data?.remainingAllocations || [])
      .filter((candidate) => !state.editor?.planNumber || candidate.planNumber === state.editor.planNumber)
      .map((candidate) => ({
        ...candidate,
        remainingQty: Math.max(Number(candidate.remainingQty || 0) - Number(stagedByCandidate.get(remainingCandidateKey(candidate)) || 0), 0),
        inputAvailabilityEvents: candidateInputAvailabilityEvents(candidate),
      }));
  }
  function remainingCandidatesFor(row, child) {
    return window.MppCapacityEditor?.getRemainingCandidates(availableRemainingAllocations(), row, child) || [];
  }
  function renderEditorToolbar() {
    const select = $("mpp-editor-plan");
    const button = $("mpp-editor-start");
    const plans = editorPlans();
    select.hidden = plans.length <= 1;
    const previous = select.value;
    select.innerHTML = plans.map((plan) => `<option value="${esc(plan.planNumber)}" ${plan.planNumber === previous ? "selected" : ""}>${esc(plan.planNumber)} · ${esc(plan.status)}</option>`).join("");
    const selected = selectedEditorPlan();
    const scope = $("mpp-editor-scope");
    button.hidden = Boolean(state.editor);
    button.disabled = !selected || !selected.editable;
    button.textContent = selected?.requiresReplan ? "↻ Replan Residual" : "✎ Mode Editor";
    select.disabled = Boolean(state.editor);
    scope.hidden = Boolean(state.editor) || !state.data?.editor?.permissions?.globalCalendar || Boolean(selected?.requiresReplan);
    scope.disabled = Boolean(state.editor) || Boolean(selected?.requiresReplan);
    if (selected?.requiresReplan) scope.value = "PLAN";
    $("mpp-editor-queue").hidden = !state.editor;
    updateEditorFooter();
  }
  function updateEditorFooter() {
    if (!state.editor) return;
    const staged = state.stagedChanges.length;
    const existingQueue = state.data?.editor?.queue || [];
    const queued = state.stagedChanges.filter((change) => change.type === "QUEUE_ALLOCATION").reduce((sum, change) => sum + Number(change.qty || 0), 0) + existingQueue.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const allocated = state.stagedChanges.filter((change) => change.type === "ALLOCATE_REMAINING").reduce((sum, change) => sum + Number(change.qty || 0), 0);
    if (state.cutClipboard) {
      $("mpp-editor-queue-title").textContent = `CUT · ${state.cutClipboard.partCode || "Allocation"} · ${qty(state.cutClipboard.qty)} ${state.cutClipboard.uomCode || "PCS"}`;
      $("mpp-editor-queue-note").textContent = "Pilih tanggal tujuan pada baris yang sama. Angka sumber belum berubah sampai Available di Target dinyatakan cukup.";
    } else {
      $("mpp-editor-queue-title").textContent = `${staged} perubahan draft${allocated ? ` · ${qty(allocated)} qty dialokasikan` : ""}${queued ? ` · ${qty(queued)} qty dalam antrian` : ""}`;
    }
    const draftLabel = state.editor?.scope === "REPLAN" ? "Replan residual" : state.editor?.scope === "GLOBAL" ? "Kalender mesin global" : "Plan resmi";
    if (!state.cutClipboard) $("mpp-editor-queue-note").textContent = staged ? `${draftLabel} belum berubah. Save menerapkan seluruh perubahan sekaligus.` : existingQueue.length ? `${existingQueue.length} antrian aktif; rekomendasi menjaga predecessor, successor, dan FG required.` : state.editor?.scope === "REPLAN" ? "Replan hanya mengubah allocation Draft; histori Published tetap immutable." : state.editor?.scope === "GLOBAL" ? "Global hanya mengubah kalender mesin; allocation production plan tidak ikut berubah." : "Klik cell mesin atau child part untuk mulai mengatur.";
    $("mpp-editor-cut-cancel").hidden = !state.cutClipboard;
    $("mpp-editor-undo").disabled = staged === 0;
    $("mpp-editor-save").disabled = staged === 0;
  }

  async function startEditor() {
    const plan = selectedEditorPlan();
    if (!plan) throw new Error("Monthly Production Plan aktif tidak ditemukan.");
    if (!plan.editable) throw new Error("Status Monthly Production Plan ini tidak dapat diedit.");
    const scope = plan.requiresReplan ? "REPLAN" : ($("mpp-editor-scope").value || "PLAN");
    const opened = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}/capacity-editor`, { method: "POST", body: { scope } });
    const persisted = await api(`/modules/api/planning-ppic/monthly-plan/capacity-editor/${encodeURIComponent(opened.id)}`);
    state.editor = { ...opened, ...persisted, planNumber: plan.planNumber };
    state.stagedChanges = window.MppCapacityEditor?.hydrateStagedChanges(persisted.changes || []) || [];
    state.cutClipboard = null;
    document.body.classList.add("mpp-editor-active");
    render();
  }

  async function loadActiveRecommendation(planNumber) {
    state.recommendation = null;
    state.selectedRecommendationIds.clear();
    if (!planNumber) return;
    try {
      const payload = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/recommendations/active`);
      state.recommendation = window.MppRecommendation?.normalizeScenario(payload) || null;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  async function generateRecommendation() {
    const plan = selectedEditorPlan();
    if (!plan) throw new Error("Monthly Production Plan aktif tidak ditemukan.");
    if (!plan.editable) throw new Error("Recommendation hanya dapat dibuat untuk plan yang masih dapat diedit.");
    setRecommendationBusy(true);
    try {
      const payload = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}/recommendations`, { method: "POST", body: {} });
      state.recommendation = window.MppRecommendation?.normalizeScenario(payload) || null;
      state.selectedRecommendationIds.clear();
      render();
    } finally {
      setRecommendationBusy(false);
      renderRecommendationBar();
    }
  }

  function recommendationResourceKey(item) {
    const value = item.proposedValue || {};
    return value.targetMachineId ? "MACHINE:" + value.targetMachineId : value.vendorId ? "VENDOR:" + value.vendorId : value.targetRowKey;
  }

  async function applyRecommendation(selection) {
    if (!state.recommendation?.id) throw new Error("Scenario recommendation aktif tidak ditemukan.");
    setRecommendationBusy(true);
    try {
      const result = await api(`/modules/api/planning-ppic/monthly-plan/recommendations/${encodeURIComponent(state.recommendation.id)}/apply`, { method: "POST", body: { selection } });
      state.editor = { ...result.session, planNumber: result.scenario?.plan?.planNumber || selectedEditorPlan()?.planNumber };
      const newChanges = (result.stagedChanges || []).map((row) => ({ ...(row.afterValue || row), _changeId: row.id || row._changeId || null }));
      state.stagedChanges = [...state.stagedChanges, ...newChanges];
      state.recommendation = window.MppRecommendation?.normalizeScenario(result.scenario) || null;
      state.selectedRecommendationIds.clear();
      document.body.classList.add("mpp-editor-active");
      render();
      if (result.projectedReadiness) {
        const readiness = result.projectedReadiness;
        $("mpp-month-alert").hidden = false;
        $("mpp-month-alert").textContent = readiness.ready
          ? "Draft memenuhi gate: FG ter-cover dan Remaining Allocation 0. Review lalu Save Changes."
          : `Draft belum siap release: FG ${readiness.fgCovered ? "sudah" : "belum"} ter-cover · Remaining Allocation ${qty(readiness.remainingAllocationQty)}.`;
      }
    } finally {
      setRecommendationBusy(false);
      renderRecommendationBar();
    }
  }

  async function discardRecommendation() {
    if (!state.recommendation?.id) return;
    if (!window.confirm("Discard scenario recommendation ini? Plan resmi dan draft editor yang sudah dipilih tidak ikut dihapus.")) return;
    setRecommendationBusy(true);
    try {
      await api(`/modules/api/planning-ppic/monthly-plan/recommendations/${encodeURIComponent(state.recommendation.id)}/discard`, { method: "POST", body: {} });
      state.recommendation = null;
      state.selectedRecommendationIds.clear();
      render();
    } finally {
      setRecommendationBusy(false);
    }
  }

  function openMaterialQueue() {
    const items = state.recommendation?.items || [];
    $("mpp-material-queue-body").innerHTML = window.MppRecommendation?.renderMaterialQueue(items) || '<div class="mpp-material-queue-empty">Material Queue belum tersedia.</div>';
    $("mpp-material-queue-dialog").showModal();
  }

  function openAutoAllocationDialog() {
    const options = state.recommendation
      ? window.MppRecommendation?.getAutoAllocationOptions(state.recommendation) || []
      : [
          { mode: "ALL", ready: null },
          { mode: "EXISTING_TASKS", ready: null },
        ];
    $("mpp-auto-allocation-options").innerHTML = options.map((option, index) => {
      const all = option.mode === "ALL";
      const title = all ? "Auto Allocation Semua" : "Task yang sudah ada saja";
      const note = all
        ? "Atur ulang task existing dan buat allocation baru untuk sisa kebutuhan."
        : "Hanya move/split task existing; tidak membuat allocation baru.";
      const calculated = option.ready !== null;
      const metrics = calculated
        ? `<i>${qty(option.existingTaskCount)} existing</i><i>${qty(option.newTaskCount)} baru</i><i>FG ${option.fgCovered ? "covered" : "belum covered"}</i><i>Remain ${qty(option.projectedRemainingQty)}</i>`
        : "<i>Kebutuhan dihitung setelah cakupan dipilih</i>";
      const stateLabel = calculated ? (option.ready ? "READY" : "BELUM READY") : "SIAP DIHITUNG";
      return `<label class="mpp-auto-option ${calculated ? (option.ready ? "ready" : "blocked") : "pending"}"><input type="radio" name="autoAllocationMode" value="${option.mode}" ${index === 0 ? "checked" : ""}><span class="mpp-auto-radio" aria-hidden="true"></span><span class="mpp-auto-copy"><b>${title}</b><small>${note}</small><span class="mpp-auto-metrics">${metrics}</span></span><strong class="mpp-auto-state">${stateLabel}</strong></label>`;
    }).join("");
    $("mpp-auto-allocation-dialog").showModal();
  }

  function startAutoAllocation() {
    openAutoAllocationDialog();
  }

  async function applyAutoAllocationMode(mode) {
    if (!state.recommendation) await generateRecommendation();
    await applyRecommendation({ mode });
  }

  function capacityEditorBody(row, key, day) {
    const machines = day.machines?.length ? day.machines : allMachines().filter((machine) => row.machineCodes?.includes(machine.machineCode));
    const global = state.editor?.scope === "GLOBAL";
    return `<input type="hidden" name="editorMode" value="MACHINE_DAY"><input type="hidden" name="scheduleDate" value="${key}"><div class="mpp-editor-help"><b>${global ? "Global machine calendar" : "Plan-specific capacity"}</b><span>${global ? "Berlaku ke seluruh plan yang memakai mesin ini pada tanggal yang dipilih. Allocation plan tidak berubah." : "Aktif/nonaktifkan mesin dan tentukan jam efektif khusus plan ini. Global calendar tidak ikut berubah."}</span></div><div class="mpp-machine-editor-list">${machines.map((machine, index) => `<article class="mpp-machine-editor-card" role="group" aria-labelledby="mpp-machine-title-${index}"><header class="mpp-machine-editor-card-head"><label><input name="machineActive-${index}" type="checkbox" ${machine.active !== false ? "checked" : ""}><span><b id="mpp-machine-title-${index}">${esc(resourceLabel(machine))}</b><small>${esc(resourceDetail(machine))}</small></span></label><em>${percent(machine.availableMinutes ? machine.loadMinutes / machine.availableMinutes * 100 : 0)} load</em></header><input type="hidden" name="machineId-${index}" value="${esc(machine.id)}"><div class="mpp-editor-fields"><label>Shift mulai<input name="startTime-${index}" type="time" value="07:00" required></label><label>Shift selesai<input name="endTime-${index}" type="time" value="14:00" required></label><label>Break (menit)<input name="breakMinutes-${index}" type="number" min="0" step="5" value="0"></label><label>Lembur (menit)<input name="overtimeMinutes-${index}" type="number" min="0" step="15" value="0"></label></div></article>`).join("") || '<div class="mpp-editor-empty">Data mesin belum tersedia pada tanggal ini.</div>'}</div><label class="mpp-editor-reason">Alasan perubahan<textarea name="reason" rows="2" required placeholder="Contoh: overtime untuk mengejar FG required"></textarea></label>`;
  }

  function stockLevelTable(candidates, key) {
    const stockRows = window.MppCapacityEditor?.getPreviousStockRows(candidates, { targetDate: key }) || [];
    return `<section class="mpp-stock-level"><header><div><span>STOCK LEVEL SEBELUMNYA</span><b>Sumber material sebelum batch dijalankan</b></div><small>Cut-off ${esc(dateParts(key).short)}</small></header><div class="mpp-stock-level-scroll"><table class="mpp-stock-level-table"><thead><tr><th>Part No</th><th>Part Code</th><th>Type</th><th>Stock WH</th><th>Reserved</th><th>Alokasi s/d Target</th><th>Available di Target</th></tr></thead><tbody>${stockRows.map((source) => { const previousWip = source.sourceRole === "PREVIOUS_WIP"; return `<tr class="${previousWip ? "mpp-stock-previous-wip" : "mpp-stock-direct-input"}"><td><b>${previousWip ? "↳ " : ""}${esc(source.partNumber || source.partCode)}</b><small>${esc(source.partName || "")}</small></td><td>${esc(source.partCode)}</td><td><span class="mpp-stock-type">${esc(source.itemType || "-")}</span>${previousWip ? '<small class="mpp-stock-level-note">1 level sebelum FG</small>' : ""}</td><td>${qty(source.stockWhQty)}<small>${esc(source.uomCode)}</small></td><td>${qty(source.stockReservedQty)}<small>${esc(source.uomCode)}</small></td><td>${qty(source.allocatedBeforeTargetQty)}<small>${esc(source.uomCode)}</small></td><td class="${Number(source.availableAtTargetQty || 0) > 0 ? "available" : "empty"}" title="Free stock + receipt terjadwal - konsumsi sampai target">${qty(source.availableAtTargetQty)}<small>${esc(source.uomCode)}</small></td></tr>`; }).join("") || '<tr><td colspan="7" class="mpp-stock-empty">Sumber stock level sebelumnya belum terpetakan.</td></tr>'}</tbody></table></div></section>`;
  }

  function syncAllocationStockTable() {
    const container = $("mpp-editor-dialog-body")?.querySelector("[data-allocation-stock]");
    const allocationId = $("mpp-editor-dialog-body")?.querySelector('[name="allocationId"]')?.value;
    const targetDate = $("mpp-editor-dialog-body")?.querySelector('[name="targetDate"]')?.value || state.activeAllocationEditor?.key;
    const allocation = state.activeAllocationEditor?.allocations?.find((item) => item.allocationId === allocationId);
    if (!container || !allocation || !targetDate) return;
    const candidate = { ...allocation, inputAvailabilityEvents: candidateInputAvailabilityEvents(allocation) };
    container.innerHTML = stockLevelTable([candidate], targetDate);
  }

  function syncAllocationEditorFields() {
    const body = $("mpp-editor-dialog-body");
    const allocationId = body?.querySelector('[name="allocationId"]')?.value;
    const allocation = state.activeAllocationEditor?.allocations?.find((item) => item.allocationId === allocationId);
    if (!body || !allocation) return;
    const targetMachine = body.querySelector('[name="targetMachineId"]');
    if (targetMachine && allocation.machineId) targetMachine.value = allocation.machineId;
    const quantity = body.querySelector('[name="qty"]');
    const targetDate = body.querySelector('[name="targetDate"]');
    const vendorSendDate = body.querySelector('[name="vendorSendDate"]');
    const vendorReturnDate = body.querySelector('[name="vendorReturnDate"]');
    if (quantity) {
      quantity.value = Number(allocation.qty || 0);
      quantity.readOnly = Boolean(allocation.stagedChangeId && allocation.draftChange?.type === "ALLOCATE_REMAINING");
      quantity.title = quantity.readOnly ? "Qty draft tetap; Undo jika ingin mengubah pembagian qty." : "";
    }
    if (targetDate) targetDate.value = String(allocation.scheduleDate || state.activeAllocationEditor?.key || "").slice(0, 10);
    if (vendorSendDate) vendorSendDate.value = String(allocation.vendorSendDate || allocation.scheduleDate || state.activeAllocationEditor?.key || "").slice(0, 10);
    if (vendorReturnDate) {
      vendorReturnDate.value = String(allocation.vendorReturnDate || allocation.scheduleDate || state.activeAllocationEditor?.key || "").slice(0, 10);
      vendorReturnDate.min = vendorSendDate?.value || targetDate?.value || state.activeAllocationEditor?.key || "";
    }
    syncAllocationStockTable();
  }

  function allocationEditorBody(row, child, key, day) {
    const allocations = (day.allocations || []).filter((allocation) => allocation.editable !== false);
    const machines = allMachines();
    const vendor = row.type === "OUTSOURCE";
    state.activeAllocationEditor = { allocations, key, rowKey: row.key, childKey: child.key, partCode: child.partCode, processCode: (child.processCodes || []).join(" · ") };
    return `<input type="hidden" name="editorMode" value="ALLOCATION"><div class="mpp-editor-help"><b>${vendor ? "Vendor batch" : "Move / split allocation"}</b><span>Pilih Cut untuk memindahkan full allocation langsung dari matrix, atau gunakan form untuk split dan pengaturan detail.</span><button class="mpp-cut-action" type="button" data-cut-allocation>✂ Cut</button></div><div class="mpp-editor-fields two"><label>Allocation<select name="allocationId" required>${allocations.map((allocation) => `<option value="${esc(allocation.allocationId)}" data-qty="${allocation.qty}">${allocation.stagedChangeId ? "DRAFT · " : ""}${esc(allocation.planNumber || "Plan")} · ${qty(allocation.qty)} ${esc(allocation.uomCode)}</option>`).join("")}</select></label><label>Aksi<select name="actionType"><option value="${vendor ? "VENDOR_BATCH" : "MOVE_ALLOCATION"}">${vendor ? "Ubah / split vendor batch" : "Pindah / split"}</option><option value="QUEUE_ALLOCATION">Lepas ke antrian</option></select></label><label>Qty<input name="qty" type="number" min="0.01" step="0.01" value="${allocations[0]?.qty || 0}" required></label><label>Target tanggal<input name="targetDate" type="date" value="${key}" required></label>${vendor ? `<label>Tanggal kirim vendor<input name="vendorSendDate" type="date" value="${key}" required></label><label>Tanggal kembali vendor<input name="vendorReturnDate" type="date" min="${key}" value="${allocations[0]?.vendorReturnDate || key}" required></label>` : `<label>Mesin tujuan<select name="targetMachineId">${machines.map((machine) => `<option value="${esc(machine.id)}">${esc(resourceLabel(machine))} · ${esc(resourceDetail(machine))}</option>`).join("")}</select></label>`}</div><div data-allocation-stock="${esc(allocations[0]?.allocationId || "")}"></div><label class="mpp-force-check"><input name="force" type="checkbox"> Force Move bila melanggar arahan dependency/capacity</label><label class="mpp-editor-reason">Alasan<textarea name="reason" rows="2" required placeholder="Alasan operasional dan catatan dependency"></textarea></label>`;
  }

  function remainingAllocationEditorBody(row, child, key) {
    const candidates = remainingCandidatesFor(row, child);
    const limit = window.MppCapacityEditor?.getRemainingAllocationLimit(candidates, { targetDate: key }) || { maxQty: 0, demandRemainingQty: 0, inputAvailableQty: 0 };
    const vendorMode = row.type === "OUTSOURCE";
    const allowedMachineIds = new Set(candidates.flatMap((candidate) => candidate.allowedMachineIds || []));
    const machines = (state.data?.editor?.machines || allMachines()).filter((machine) => !allowedMachineIds.size || allowedMachineIds.has(machine.id));
    const vendors = state.data?.editor?.vendors || [];
    const first = candidates[0] || {};
    const defaultVendorId = first.vendorId || vendors[0]?.id || "";
    const defaultReturnDate = first.recommendedReturnDate || key;
    const stockTable = stockLevelTable(candidates, key);
    return `<input type="hidden" name="editorMode" value="ALLOCATE_REMAINING"><input type="hidden" name="candidateKey" value="${esc(remainingCandidateKey(first))}"><input type="hidden" name="routingMode" value="${vendorMode ? "VENDOR" : "INHOUSE"}"><div class="mpp-editor-help"><b>Allocate batch</b><span>Qty otomatis di-pegging ke delivery phase paling awal. Plan baru berubah setelah Save Changes.</span></div><div class="mpp-remaining-summary"><span>${esc(child.partCode)}</span><b>${esc((child.processCodes || []).join(" · ") || "Process")}</b><em>Maks. ${qty(limit.maxQty)} ${esc(first.uomCode || "PCS")}</em></div><div class="mpp-editor-fields two"><label>Remaining demand<input value="${qty(limit.demandRemainingQty)} ${esc(first.uomCode || "PCS")} · ${candidates.length} delivery phase" readonly></label><label>Qty allocation<input name="qty" type="number" min="0.01" step="0.01" max="${Number(limit.maxQty || 0)}" value="${Number(limit.maxQty || 0)}" required></label><label>Tanggal target<input name="targetDate" type="date" value="${key}" required></label>${vendorMode ? `<label>Vendor<select name="vendorId" required>${vendors.map((vendor) => `<option value="${esc(vendor.id)}" ${vendor.id === defaultVendorId ? "selected" : ""}>${esc(vendor.vendorCode)} · ${esc(vendor.vendorName || "")}</option>`).join("")}</select></label><label>Tanggal kembali vendor<input name="vendorReturnDate" type="date" min="${key}" value="${defaultReturnDate}" required></label>` : `<label>Mesin<select name="targetMachineId" required>${machines.map((machine) => `<option value="${esc(machine.id)}" ${machine.id === row.machineId ? "selected" : ""}>${esc(resourceLabel(machine))} · ${esc(resourceDetail(machine))}</option>`).join("")}</select></label><label>Shift<select name="shift" required><option value="1">Shift 1</option><option value="2">Shift 2</option><option value="3">Shift 3</option></select></label><label>Jam mulai<input name="plannedStartTime" type="time"></label><label>Jam selesai<input name="plannedEndTime" type="time"></label>`}</div>${stockTable}<label class="mpp-force-check"><input name="force" type="checkbox"> Force bila tanggal melanggar arahan dependency atau capacity</label><label class="mpp-editor-reason">Alasan allocation<textarea name="reason" rows="2" required placeholder="Contoh: kirim batch sesuai stock WIP tersedia"></textarea></label>`;
  }

  function showEditorNotice(message, type = "warning") {
    const alert = $("mpp-month-alert");
    alert.textContent = message;
    alert.classList.toggle("warning", type === "warning");
    alert.classList.toggle("info", type === "info");
    alert.hidden = false;
  }

  function beginCutFromDialog() {
    const body = $("mpp-editor-dialog-body");
    const allocationId = body?.querySelector('[name="allocationId"]')?.value;
    const context = state.activeAllocationEditor;
    const allocation = context?.allocations?.find((item) => item.allocationId === allocationId);
    if (!allocation || !context?.childKey) throw new Error("Allocation yang akan di-cut tidak ditemukan.");
    const stagedIndex = allocation.stagedChangeId
      ? state.stagedChanges.findIndex((change) => change._changeId === allocation.stagedChangeId)
      : -1;
    const stagedDraft = stagedIndex >= 0 ? state.stagedChanges[stagedIndex] : null;
    const stagedAvailabilitySourceId = stagedDraft?.type === "ALLOCATE_REMAINING"
      ? (stagedDraft.recommendationItemId || ["staged", stagedIndex, stagedDraft.planNumber, stagedDraft.lineNumber, stagedDraft.mbomProcessId, stagedDraft.targetDate].join("|"))
      : null;
    state.cutClipboard = {
      allocation: JSON.parse(JSON.stringify(allocation)),
      allocationId: allocation.allocationId,
      rowKey: context.rowKey,
      childKey: context.childKey,
      sourceDate: String(allocation.scheduleDate || context.key || "").slice(0, 10),
      qty: Number(allocation.qty || 0),
      uomCode: allocation.uomCode || "PCS",
      partCode: allocation.partCode || context.partCode,
      processCode: allocation.processCode || context.processCode,
      routingMode: allocation.routingMode,
      ignoredAvailabilitySourceIds: [allocation.allocationId, allocation.sourceAllocationId, stagedAvailabilitySourceId].filter(Boolean),
    };
    $("mpp-editor-dialog").close();
    showEditorNotice(`Cut siap: ${state.cutClipboard.partCode} · ${qty(state.cutClipboard.qty)} ${state.cutClipboard.uomCode}. Pilih tanggal lain pada baris yang sama.`, "info");
    renderBody();
    updateEditorFooter();
  }

  function cancelCut(message = null) {
    const clipboard = state.cutClipboard;
    state.cutClipboard = null;
    if (message && clipboard) showEditorNotice(message, "warning");
    renderBody();
    updateEditorFooter();
  }

  async function stageEditorChange(change) {
    const staged = await api(`/modules/api/planning-ppic/monthly-plan/capacity-editor/${encodeURIComponent(state.editor.id)}/changes`, { method: "POST", body: change });
    const normalized = { ...(staged.afterValue || change), _changeId: staged.id || change.replaceChangeId || null };
    state.stagedChanges = change.replaceChangeId
      ? (window.MppCapacityEditor?.replaceStagedChange(state.stagedChanges, change.replaceChangeId, normalized) || state.stagedChanges)
      : [...state.stagedChanges, normalized];
    return normalized;
  }

  async function pasteCutAllocation(row, child, key) {
    const clipboard = state.cutClipboard;
    if (!clipboard) return;
    if (!window.MppCapacityEditor?.isSameAllocationRow(clipboard, row?.key, child?.key)) {
      return cancelCut(`Paste dibatalkan: target harus tetap pada baris ${clipboard.partCode} · ${clipboard.processCode || "proses yang sama"}. Qty sumber ${qty(clipboard.qty)} ${clipboard.uomCode} tidak berubah.`);
    }
    if (clipboard.sourceDate === key) {
      return cancelCut(`Cut dibatalkan. Allocation ${clipboard.partCode} tetap pada ${shortDate(clipboard.sourceDate)}.`);
    }
    const allocation = clipboard.allocation;
    const candidate = {
      ...allocation,
      inputAvailabilityEvents: candidateInputAvailabilityEvents(allocation),
    };
    const availability = window.MppCapacityEditor?.evaluateTargetAvailability(candidate, clipboard.qty, {
      targetDate: key,
      ignoreSourceIds: clipboard.ignoredAvailabilitySourceIds || [allocation.allocationId, allocation.sourceAllocationId].filter(Boolean),
    }) || { known: false, sufficient: false, availableQty: 0 };
    if (!availability.sufficient) {
      const availableText = availability.known ? `${qty(availability.availableQty)} ${clipboard.uomCode}` : "belum dapat dihitung";
      showEditorNotice(`Paste ditolak untuk ${shortDate(key)}: Available di Target ${availableText}, sedangkan Cut membutuhkan ${qty(clipboard.qty)} ${clipboard.uomCode}. Angka sumber tetap utuh.`, "warning");
      return;
    }
    const change = window.MppCapacityEditor?.buildCutPasteChange(clipboard, key);
    if (!change?.type) throw new Error("Perubahan Cut & Paste tidak dapat dibentuk.");
    try {
      await stageEditorChange(change);
      state.cutClipboard = null;
      showEditorNotice(`Cut & Paste masuk draft: ${clipboard.partCode} · ${qty(clipboard.qty)} ${clipboard.uomCode} ke ${shortDate(key)}. Available di Target ${qty(availability.availableQty)} ${clipboard.uomCode}.`, "info");
      renderBody();
      updateEditorFooter();
    } catch (error) {
      showEditorNotice(`${error.message} Allocation sumber belum berubah.`, "warning");
    }
  }

  function openEditorCell(row, source, key) {
    const child = source !== row ? source : null;
    const day = source?.days?.[key] || {};
    $("mpp-editor-dialog-title").textContent = `${child?.partCode || resourceLabel(row)} · ${dateParts(key).short}`;
    const allocateRemaining = child && !(day.allocations || []).some((allocation) => allocation.editable !== false) && remainingCandidatesFor(row, child).length > 0;
    $("mpp-editor-dialog").classList.toggle("mpp-remaining-dialog", Boolean(child));
    $("mpp-editor-dialog-kicker").textContent = allocateRemaining ? "REMAIN ALLOCATION" : child ? "ALLOCATION EDITOR" : "MACHINE-DAY CAPACITY";
    $("mpp-editor-dialog-body").innerHTML = allocateRemaining ? remainingAllocationEditorBody(row, child, key) : child ? allocationEditorBody(row, child, key, day) : capacityEditorBody(row, key, day);
    syncAllocationEditorFields();
    $("mpp-editor-dialog-body").querySelector('[name="allocationId"]')?.addEventListener("change", syncAllocationEditorFields);
    $("mpp-editor-dialog-body").querySelector("[data-cut-allocation]")?.addEventListener("click", () => {
      try { beginCutFromDialog(); }
      catch (error) { showEditorNotice(error.message, "warning"); }
    });
    $("mpp-editor-dialog-body").querySelector('[name="targetDate"]')?.addEventListener("change", syncAllocationStockTable);
    $("mpp-editor-dialog-body").querySelector('[name="vendorSendDate"]')?.addEventListener("change", (event) => {
      const returned = $("mpp-editor-dialog-body").querySelector('[name="vendorReturnDate"]');
      if (returned) returned.min = event.currentTarget.value;
    });
    $("mpp-editor-dialog").showModal();
  }

  async function stageEditorForm(form) {
    const values = new FormData(form);
    const mode = values.get("editorMode");
    const changes = [];
    if (values.get("vendorReturnDate")) {
      window.MppCapacityEditor?.validateVendorDates(
        values.get("vendorSendDate") || values.get("targetDate"),
        values.get("vendorReturnDate"),
      );
    }
    if (mode === "MACHINE_DAY") {
      const machineIds = [...form.querySelectorAll('[name^="machineId-"]')];
      for (const field of machineIds) {
        const index = field.name.split("-").pop();
        const active = Boolean(form.elements[`machineActive-${index}`]?.checked);
        changes.push({ type: "MACHINE_DAY", entityType: "MACHINE_DAY", machineId: field.value, scheduleDate: values.get("scheduleDate"), dayStatus: active ? "WORKING" : "HOLIDAY", shifts: active ? [{ shiftCode: "SHIFT-1", startTime: values.get(`startTime-${index}`), endTime: values.get(`endTime-${index}`), breakMinutes: Number(values.get(`breakMinutes-${index}`) || 0), overtimeMinutes: Number(values.get(`overtimeMinutes-${index}`) || 0) }] : [], reason: values.get("reason") });
      }
    } else if (mode === "ALLOCATE_REMAINING") {
      const candidate = availableRemainingAllocations().find((item) => remainingCandidateKey(item) === values.get("candidateKey"));
      if (!candidate) throw new Error("Remain Allocation sudah berubah. Muat ulang Monthly Plan.");
      const candidates = availableRemainingAllocations().filter((item) => remainingPoolKey(item) === remainingPoolKey(candidate));
      const requestedQty = Number(values.get("qty"));
      const targetDate = values.get("targetDate");
      const allocations = window.MppCapacityEditor?.distributeRemainingQty(candidates, requestedQty, { targetDate });
      changes.push({ type: "ALLOCATE_REMAINING", planNumber: candidate.planNumber, lineNumber: candidate.lineNumber, mbomProcessId: candidate.mbomProcessId, partCode: candidate.partCode, processCode: candidate.processCode, uomCode: candidate.uomCode || "PCS", qty: requestedQty, allocations, targetDate, routingMode: values.get("routingMode"), targetMachineId: values.get("targetMachineId") || null, shift: values.get("shift") || null, plannedStartTime: values.get("plannedStartTime") || null, plannedEndTime: values.get("plannedEndTime") || null, diesId: values.get("diesId") || null, vendorId: values.get("vendorId") || null, vendorReturnDate: values.get("vendorReturnDate") || null, force: values.get("force") === "on", reason: values.get("reason") });
    } else {
      const type = String(values.get("actionType"));
      const selectedAllocation = state.activeAllocationEditor?.allocations?.find((item) => item.allocationId === values.get("allocationId"));
      if (selectedAllocation?.stagedChangeId) {
        const originalDraft = selectedAllocation.draftChange || {};
        const vendorDraft = String(originalDraft.routingMode || selectedAllocation.routingMode || "").toUpperCase() === "VENDOR";
        changes.push({
          ...originalDraft,
          replaceChangeId: selectedAllocation.stagedChangeId,
          qty: originalDraft.type === "ALLOCATE_REMAINING" ? originalDraft.qty : Number(values.get("qty")),
          targetDate: vendorDraft ? (values.get("vendorSendDate") || values.get("targetDate")) : values.get("targetDate"),
          targetMachineId: values.get("targetMachineId") || originalDraft.targetMachineId || null,
          vendorReturnDate: values.get("vendorReturnDate") || originalDraft.vendorReturnDate || null,
          force: values.get("force") === "on",
          reason: values.get("reason"),
        });
      } else {
        changes.push({ type, allocationId: values.get("allocationId"), qty: Number(values.get("qty")), targetDate: values.get("targetDate"), targetMachineId: values.get("targetMachineId") || null, vendorSendDate: values.get("vendorSendDate") || null, vendorReturnDate: values.get("vendorReturnDate") || null, routingMode: type === "VENDOR_BATCH" ? "VENDOR" : undefined, force: values.get("force") === "on", reason: values.get("reason") });
      }
    }
    for (const change of changes) await stageEditorChange(change);
    $("mpp-editor-dialog").close();
    updateEditorFooter();
    renderBody();
  }

  function openCell(rowKey, childKey, key) {
    const row = displayRows().find((item) => item.key === rowKey);
    const source = childKey ? row?.children.find((item) => item.key === childKey) : row;
    if (state.editor) {
      if (state.editor.scope === "GLOBAL" && childKey) return;
      if (state.cutClipboard) return pasteCutAllocation(row, childKey ? source : null, key);
      return openEditorCell(row, source, key);
    }
    const day = source?.days?.[key] || {};
    const date = dateParts(key);
    $("mpp-dialog-title").textContent = `${source?.partCode || resourceLabel(row)} · ${date.short}`;
    const plans = day.planNumbers || [];
    $("mpp-dialog-body").innerHTML = `<div class="mpp-dialog-grid"><article><span>Planned Qty</span><b>${qty(day.qty)} ${esc((day.uomCodes || []).join(" / ") || "PCS")}</b></article><article><span>Capacity Load</span><b>${day.loadPercent != null && Number(day.loadMinutes) > 0 ? percent(day.loadPercent) : day.minutes ? hours(day.minutes) : "-"}</b></article><article><span>Mesin / Vendor</span><b>${esc(resourceLabel(row))}</b></article><article><span>Process</span><b>${esc((source?.processCodes || []).join(" · ") || row?.type || "-")}</b></article><article><span>FG Required</span><b>${esc((day.fgRequiredDates || source?.fgRequiredDates || []).map(shortDate).join(", ") || "-")}</b></article></div>${day.blocker ? `<div class="mpp-month-alert"><b>Capacity blocker ${percent(day.blocker.peakPercent)}</b><br>${hours(day.blocker.excessMinutes)} belum mendapat kapasitas. Tetap berada di owner month untuk dialokasikan manual.</div>` : ""}<div class="mpp-dialog-plans"><span>Sumber Monthly Plan</span><div>${plans.length ? plans.map((plan) => `<a href="/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(plan)}">${esc(plan)} ↗</a>`).join("") : "<small>Tidak ada nomor plan pada cell ini.</small>"}</div></div>`;
    $("mpp-dialog-body").insertAdjacentHTML("beforeend", lotDetails(day));
    const executorAction = childKey ? executorButton(row, source, key) : "";
    if (executorAction) {
      $("mpp-dialog-body").insertAdjacentHTML("beforeend", `<div class="mpp-dialog-executor-actions"><p>Atur mesin, vendor, atau pembagian qty untuk batch pada tanggal ini.</p>${executorAction}</div>`);
      $("mpp-dialog-body").querySelector("[data-executor-row]")?.addEventListener("click", () => openExecutor(row.key, source.key, key));
    }
    $("mpp-month-dialog").showModal();
  }

  function bindTableEvents() {
    $("mpp-month-tbody").querySelectorAll("[data-executor-row]").forEach((button) => button.addEventListener("click", () => openExecutor(button.dataset.executorRow, button.dataset.executorChild, button.dataset.executorDate || null)));
    document.querySelectorAll("[data-toggle-row]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.toggleRow;
      if (state.collapsed.has(key)) state.collapsed.delete(key); else state.collapsed.add(key);
      renderBody();
    }));
    document.querySelectorAll("[data-toggle-fg]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.toggleFg;
      if (state.collapsed.has(key)) state.collapsed.delete(key); else state.collapsed.add(key);
      renderBody();
    }));
    document.querySelectorAll("[data-cell-row]").forEach((button) => button.addEventListener("click", () => openCell(button.dataset.cellRow, button.dataset.cellChild || null, button.dataset.cellDate)));
    document.querySelectorAll("[data-recommendation-items]").forEach((checkbox) => checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      for (const id of String(checkbox.dataset.recommendationItems || "").split(",").filter(Boolean)) {
        if (checkbox.checked) state.selectedRecommendationIds.add(id); else state.selectedRecommendationIds.delete(id);
      }
      renderRecommendationBar();
    }));
  }

  async function load(planNumber = null) {
    const month = $("mpp-month-input").value || config.initialMonth;
    $("mpp-month-alert").hidden = true;
    $("mpp-month-alert").classList.remove("warning");
    $("mpp-month-state").textContent = "MEMUAT";
    $("mpp-month-state").className = "mpp-month-state";
    try {
      const requestedPlan = (typeof planNumber === "string" && planNumber) || (autoEditorRequested ? entryPlanNumber : null);
      const planQuery = requestedPlan ? `?planNumber=${encodeURIComponent(requestedPlan)}` : "";
      state.data = await api(`/modules/api/planning-ppic/monthly-plan/matrix/${encodeURIComponent(month)}${planQuery}`);
      if (state.data.month !== month || state.data.dates?.some((key) => !key.startsWith(`${month}-`))) {
        throw new Error(`Kalender Monthly Plan tidak sinkron: meminta ${month}, menerima ${state.data.month || "periode tidak dikenal"}.`);
      }
      const keepEditorContext = autoEditorRequested;
      const url = new URL("/modules/planning-ppic/monthly-production-plans", window.location.origin);
      url.searchParams.set("month", month);
      if (requestedPlan) url.searchParams.set("planNumber", requestedPlan);
      if (keepEditorContext && entryFocusDate) url.searchParams.set("date", entryFocusDate);
      if (keepEditorContext) url.searchParams.set("editor", "1");
      history.replaceState(null, "", `${url.pathname}${url.search}`);
      $("mpp-editor-scope").value = state.data.editor?.defaultScope || "PLAN";
      for (const groupKey of [...state.data.rows.map((row) => row.key), "FG_REQUIRED"]) {
        if (!state.knownGroups.has(groupKey)) state.collapsed.add(groupKey);
        state.knownGroups.add(groupKey);
      }
      state.editor = null;
      state.stagedChanges = [];
      state.cutClipboard = null;
      state.recommendation = null;
      state.selectedRecommendationIds.clear();
      document.body.classList.remove("mpp-editor-active");
      const activePlan = requestedPlan || state.data.editor?.plans?.[0]?.planNumber || null;
      state.activePlan = state.data.editor?.plans?.find((plan) => plan.planNumber === activePlan) || null;
      state.workflowDetailLoading = Boolean(activePlan);
      render();
      const [activePlanDetail] = await Promise.all([
        activePlan ? api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(activePlan)}`) : Promise.resolve(null),
        loadActiveRecommendation(activePlan),
      ]);
      state.activePlan = activePlanDetail;
      state.workflowDetailLoading = false;
      render();
      if (keepEditorContext) {
        autoEditorRequested = false;
        try {
          await startEditor();
          if (entryFocusDate) document.querySelector(`[data-cell-date="${CSS.escape(entryFocusDate)}"]`)?.scrollIntoView({ block: "center", inline: "center" });
        } catch (editorError) {
          $("mpp-month-alert").textContent = editorError.message;
          $("mpp-month-alert").hidden = false;
        }
      }
    } catch (error) {
      state.workflowDetailLoading = false;
      $("mpp-month-alert").textContent = error.message;
      $("mpp-month-alert").hidden = false;
      $("mpp-month-tbody").innerHTML = '<tr><td class="mpp-month-empty">Data Monthly Production Plan belum dapat dimuat.</td></tr>';
      $("mpp-month-state").textContent = "GAGAL DIMUAT";
      $("mpp-month-state").className = "mpp-month-state blocked";
    }
  }

  $("mpp-month-input").addEventListener("change", () => load());
  $("mpp-month-refresh").addEventListener("click", () => load(state.editor?.planNumber || selectedEditorPlan()?.planNumber || null));
  $("mpp-editor-plan").addEventListener("change", (event) => load(event.target.value));
  $("mpp-workflow-plan")?.addEventListener("change", (event) => load(event.target.value));
  $("mpp-workflow-action")?.addEventListener("click", openWorkflowDialog);
  $("mpp-workflow-dialog-close")?.addEventListener("click", () => $("mpp-workflow-dialog").close());
  $("mpp-workflow-dialog-cancel")?.addEventListener("click", () => $("mpp-workflow-dialog").close());
  $("mpp-workflow-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget && !state.workflowBusy) event.currentTarget.close(); });
  $("mpp-workflow-form")?.addEventListener("submit", async (event) => { event.preventDefault(); if (!$("mpp-workflow-confirm").checked) return; await runWorkflowAction(); });
  $("mpp-editor-scope").addEventListener("change", () => renderEditorToolbar());
  $("mpp-editor-start").addEventListener("click", async () => { try { await startEditor(); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-recommendation-generate").addEventListener("click", async () => { try { await startAutoAllocation(); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-recommendation-resource").addEventListener("change", () => renderRecommendationBar());
  $("mpp-recommendation-apply-resource").addEventListener("click", async () => { try { const key = $("mpp-recommendation-resource").value; if (key) await applyRecommendation({ mode: "ITEMS", itemIds: (state.recommendation?.items || []).filter((item) => recommendationResourceKey(item) === key && item.changeType && item.applyStatus === "PENDING").map((item) => item.id) }); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-recommendation-apply-selected").addEventListener("click", async () => { try { await applyRecommendation({ mode: "ITEMS", itemIds: [...state.selectedRecommendationIds] }); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-recommendation-apply-all").addEventListener("click", () => { try { openAutoAllocationDialog(); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-recommendation-discard").addEventListener("click", async () => { try { await discardRecommendation(); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-recommendation-queue").addEventListener("click", openMaterialQueue);
  $("mpp-material-queue-close").addEventListener("click", () => $("mpp-material-queue-dialog").close());
  $("mpp-material-queue-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $("mpp-auto-allocation-close").addEventListener("click", () => $("mpp-auto-allocation-dialog").close());
  $("mpp-auto-allocation-cancel").addEventListener("click", () => $("mpp-auto-allocation-dialog").close());
  $("mpp-auto-allocation-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $("mpp-auto-allocation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = new FormData(event.currentTarget).get("autoAllocationMode") || "ALL";
    $("mpp-auto-allocation-dialog").close();
    try { await applyAutoAllocationMode(mode); }
    catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; }
  });
  $("mpp-month-search").addEventListener("input", (event) => { state.search = event.target.value.trim(); if (state.data) renderBody(); });
  $("mpp-month-type").addEventListener("change", (event) => { state.type = event.target.value; if (state.data) renderBody(); });
  $("mpp-month-expand").addEventListener("click", (event) => {
    if (!state.data) return;
    const allExpanded = state.collapsed.size === 0;
    state.collapsed = allExpanded ? new Set(state.data.rows.map((row) => row.key)) : new Set();
    event.currentTarget.textContent = allExpanded ? "Buka semua" : "Tutup semua";
    renderBody();
  });
  $("mpp-dialog-close").addEventListener("click", () => $("mpp-month-dialog").close());
  $("mpp-month-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $("mpp-editor-dialog-close").addEventListener("click", () => $("mpp-editor-dialog").close());
  $("mpp-editor-dialog-cancel").addEventListener("click", () => $("mpp-editor-dialog").close());
  $("mpp-editor-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $("mpp-editor-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await stageEditorForm(event.currentTarget); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-editor-cut-cancel").addEventListener("click", () => cancelCut("Cut dibatalkan. Allocation sumber tetap pada tanggal semula."));
  $("mpp-editor-undo").addEventListener("click", async () => { if (!state.editor || !state.stagedChanges.length) return; try { await api(`/modules/api/planning-ppic/monthly-plan/capacity-editor/${encodeURIComponent(state.editor.id)}/undo`, { method: "POST", body: {} }); state.stagedChanges.pop(); await loadActiveRecommendation(state.editor.planNumber); render(); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-editor-cancel").addEventListener("click", async () => { if (!state.editor) return; if (!window.confirm("Batalkan seluruh perubahan editor? Plan resmi tetap seperti sebelum Mode Editor dibuka.")) return; try { const planNumber = state.editor.planNumber; await api(`/modules/api/planning-ppic/monthly-plan/capacity-editor/${encodeURIComponent(state.editor.id)}/cancel`, { method: "POST", body: {} }); await load(planNumber); } catch (error) { $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  $("mpp-editor-save").addEventListener("click", async () => { if (!state.editor || !state.stagedChanges.length) return; try { const planNumber = state.editor.planNumber; $("mpp-editor-save").disabled = true; $("mpp-editor-save").textContent = "Menyimpan…"; const result = await api(`/modules/api/planning-ppic/monthly-plan/capacity-editor/${encodeURIComponent(state.editor.id)}/commit`, { method: "POST", body: {} }); await load(planNumber); const warningMessage = window.MppCapacityEditor?.formatMaterialWarnings(result.warnings || []); if (warningMessage) { $("mpp-month-alert").textContent = warningMessage; $("mpp-month-alert").classList.add("warning"); $("mpp-month-alert").hidden = false; } } catch (error) { $("mpp-editor-save").disabled = false; $("mpp-editor-save").textContent = "Save Changes"; $("mpp-month-alert").classList.remove("warning"); $("mpp-month-alert").textContent = error.message; $("mpp-month-alert").hidden = false; } });
  async function initializeMonthlyPlan() {
    if (entryPlanNumber) {
      try {
        const result = await api(`/modules/api/planning-ppic/monthly-plan?start=0&length=10&search%5Bvalue%5D=${encodeURIComponent(entryPlanNumber)}`);
        const plan = (result.data || []).find((item) => item.planNumber === entryPlanNumber) || null;
        const planMonth = String(plan?.planMonth || plan?.periodStart || "").slice(0, 7);
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(planMonth)) $("mpp-month-input").value = planMonth;
      } catch (_) {
        // The matrix load below will surface the authoritative access/not-found error.
      }
    }
    await load(entryPlanNumber);
  }
  initializeMonthlyPlan();
})();
