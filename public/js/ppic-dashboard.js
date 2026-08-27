(function () {
  const cfg = JSON.parse(document.getElementById("ppic-page-config").textContent);
  const tab = cfg.activeTab;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const day = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
  const capacityHours = (minutes) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(minutes || 0) / 60)} jam`;
  const currentMonthKey = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}`;
  };
  const currentMpsAnchor = () => { const now = new Date(), anchor = new Date(now.getFullYear(), now.getMonth() + (now.getDate() < 20 ? -1 : 0), 1); return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`; };
  const mpsWindowMonths = (anchor = currentMpsAnchor()) => { const [year, month] = anchor.split("-").map(Number); return [0, 1, 2].map((offset) => { const value = new Date(year, month - 1 + offset, 1); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`; }); };
  let rows = [];
  let monthlyRows = [];
  const listFilterKey = `ppic-list-filter:${tab}`;
  let listFilters;
  try {
    const savedFilters = localStorage.getItem(listFilterKey);
    listFilters = { period: "", customer: "", status: "", ...(savedFilters ? JSON.parse(savedFilters) : {}), ...(tab === "consume-forecast" ? { period: currentMonthKey() } : {}) };
  }
  catch (_error) { listFilters = { period: "", customer: "", status: "" }; }
  const config = {
    mrp: { title: "Material Requirements Planning", subtitle: "Perhitungan kebutuhan material dan planned order dari MPS yang sudah dikonfirmasi.", url: "/modules/api/planning-ppic/material-requirements-planning?start=0&length=100", primary: "Run MRP", head: ["No", "MRP ID", "MPS", "Periode", "Requirements", "Planned Order", "Status", "Aksi"] },
    mps: { title: "Rolling Master Production Schedule", subtitle: "MPS Demand Matrix memakai rolling demand horizon. Bulan hanya filter target delivery dan satu revision dapat memicu satu MRP Planning Run.", url: "/modules/api/planning-ppic/master-production-schedule?start=0&length=100", primary: "Refresh dari Demand Planning", head: ["No", "Planning Horizon", "Target Delivery", "Demand Sources", "Coverage", "Qty Plan", "Due Protection", "Status", "Aksi"] },
    "monthly-plan": { title: "Production Plans", subtitle: "Target, kapasitas, dan realisasi berdasarkan demand-phase horizon lintas bulan.", url: "/modules/api/planning-ppic/monthly-plan?start=0&length=100", primary: "Create Production Plan", head: ["No", "Plan ID", "Planning Horizon", "Target Qty", "Actual Qty", "Progress", "Status", "Aksi"] },
    "consume-forecast": { title: "Consume Forecast Bulanan", subtitle: "Forecast, delivery customer, target produksi, dan pembelian material dikelompokkan berdasarkan bulan kebutuhannya.", url: "/modules/api/planning-ppic/consume-forecast/monthly", primary: "Buat Forecast", head: ["No", "Bulan Kebutuhan", "Forecast", "Delivery Customer / SO", "Consume Forecast", "Target Produksi", "Material Dibeli", "MPS / MRP", "Aksi"] },
  }[tab];
  const gallery = window.ListGallery?.init({
    root: "#ppic-list-root",
    storageKey: `ppic-view:${tab}`,
    title: (row) => (tab === "mrp" ? row.planNumber : null) || row.runNumber || row.mpsNumber || row.planNumber || row.forecastNumber || "PPIC",
    subtitle: (row) => row.partName || row.customerCode || row.mpsNumber || config?.title || "PPIC",
    status: (row) => row.status || "Tanpa Status",
    card: (row) => {
      const key = row.runNumber || row.mpsNumber || row.planNumber || row.forecastNumber;
      const metrics = [
        ["Periode", row.periodStart || row.runDate || row.planMonth],
        ["Forecast", row.forecastNumber],
        ["Qty Plan", row.totalPlannedQty ?? row.targetQty ?? row.totalForecastQty],
        ["Status", row.status],
      ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value ?? "-")}</strong></div>`).join("");
      return `<article class="list-gallery-card"><div class="list-gallery-card-head"><div><h3>${esc(key || config.title)}</h3><small>${esc(row.customerCode || row.mpsNumber || config.title)}</small></div>${badge(row.status)}</div><div class="list-gallery-meta">${metrics}</div>${key ? `<div class="list-gallery-actions"><a href="${detailLink(key)}">Lihat detail</a></div>` : ""}</article>`;
    },
  });
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal");
    return payload.data || payload.items || payload;
  }
  function showAlert(message, kind = "danger") {
    const box = $("ppic-alert");
    box.textContent = message;
    box.className = `alert alert-${kind}`;
  }
  function badge(status) { return `<span class="ppic-badge ${esc(String(status || "Draft").toLowerCase().replaceAll(" ", "-"))}">${esc(status || "Draft")}</span>`; }
  function setOptions(id, values, label) {
    const select = $(id); if (!select) return;
    const selected = select.value;
    select.innerHTML = `<option value="">${label}</option>${[...new Set(values)].sort().map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
    select.value = [...select.options].some((option) => option.value === selected) ? selected : "";
  }
  function periodOf(row) {
    const value = row.periodStart || row.runDate || row.planMonth || row.month || row.periodEnd;
    return value ? String(value).slice(0, 7) : "";
  }
  function customerOf(row) { return String(row.customerCode || row.customerName || row.customer?.customerCode || row.customer?.customerName || ""); }
  function ensureListFilterPanel() {
    let panel = document.getElementById("ppic-list-filter-panel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "ppic-list-filter-panel";
    panel.className = "ppic-list-filter-panel app-container";
    panel.hidden = true;
    panel.innerHTML = '<div><strong>Filter Data</strong><span>Filter berlaku pada tabel aktif</span></div><label><span>Periode</span><select data-ppic-list-filter="period"></select></label><label><span>Customer</span><select data-ppic-list-filter="customer"></select></label><label><span>Status</span><select data-ppic-list-filter="status"></select></label><button type="button" class="btn btn-sm btn-outline-secondary" data-ppic-list-reset>Reset</button>';
    document.querySelector(".ppic-master-toolbar")?.insertAdjacentElement("afterend", panel);
    panel.querySelectorAll("[data-ppic-list-filter]").forEach((control) => control.addEventListener("change", () => {
      listFilters[control.dataset.ppicListFilter] = control.value;
      localStorage.setItem(listFilterKey, JSON.stringify(listFilters));
      render();
      syncListFilterBadge();
    }));
    panel.querySelector("[data-ppic-list-reset]").addEventListener("click", () => {
      listFilters = { period: "", customer: "", status: "" };
      localStorage.removeItem(listFilterKey);
      syncListFilterOptions();
      render();
      syncListFilterBadge();
    });
    return panel;
  }
  function syncListFilterOptions() {
    const panel = ensureListFilterPanel();
    const options = {
      period: [...new Set([...rows.map(periodOf).filter(Boolean), ...(tab === "consume-forecast" ? [currentMonthKey()] : [])])].sort(),
      customer: [...new Set(rows.map(customerOf).filter(Boolean))].sort(),
      status: [...new Set(rows.map((row) => String(row.status || row.mpsStatus || "")).filter(Boolean))].sort(),
    };
    const labels = { period: "Semua periode", customer: "Semua customer", status: "Semua status" };
    panel.querySelectorAll("[data-ppic-list-filter]").forEach((control) => {
      const key = control.dataset.ppicListFilter;
      control.innerHTML = `<option value="">${labels[key]}</option>${options[key].map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
      control.value = options[key].includes(listFilters[key]) ? listFilters[key] : "";
      listFilters[key] = control.value;
      control.closest("label").classList.toggle("d-none", key === "customer" && options[key].length === 0);
    });
  }
  function syncListFilterBadge() {
    const button = $("ppic-filter");
    const count = Object.values(listFilters).filter(Boolean).length;
    button.classList.toggle("active", count > 0);
    button.innerHTML = `Filter${count ? ` <span class="ppic-filter-count">${count}</span>` : ""}`;
  }
  function renderMonthlySummary() {
    const section = $("mps-monthly-summary"); if (!section) return;
    if (tab !== "mps") { section.classList.add("d-none"); return; }
    section.classList.remove("d-none");
    const forecast = $("mps-summary-forecast")?.value || "";
    const customer = $("mps-summary-customer")?.value || "";
    const filtered = monthlyRows.filter((row) => row.scheduleType === "FG RECEIPT" && (!forecast || row.forecastNumber === forecast) && (!customer || row.customerCode === customer));
    const months = [...new Set(filtered.map((row) => row.month).filter(Boolean))].sort();
    const documentByNumber = new Map(rows.map((row) => [row.mpsNumber, row]));
    const matrix = new Map();
    for (const row of filtered) {
      const rowKey = `${row.customerCode || "Tanpa Customer"}|${row.partCode || "Tanpa Part"}`;
      const item = matrix.get(rowKey) || { customerCode: row.customerCode || "Tanpa Customer", partCode: row.partCode || "Tanpa Part", partName: row.partName || row.partNumber || "-", months: new Map(), total: 0 };
      const cell = item.months.get(row.month) || { forecastQty: 0, actualSalesOrderQty: 0, bufferQty: 0, qtyPlanned: 0, forecasts: new Set(), mpsNumbers: new Set() };
      cell.forecastQty += Number(row.forecastQty || 0); cell.actualSalesOrderQty += Number(row.actualSalesOrderQty || 0); cell.bufferQty += Number(row.bufferQty || 0); cell.qtyPlanned += Number(row.qtyPlanned || 0);
      if (row.forecastNumber) cell.forecasts.add(row.forecastNumber); (row.mpsNumbers || []).forEach((value) => cell.mpsNumbers.add(value));
      item.months.set(row.month, cell); item.total += Number(row.qtyPlanned || 0); matrix.set(rowKey, item);
    }
    $("mps-summary-head").innerHTML = `<tr><th class="identity">Customer</th><th class="part">Finished Good</th>${months.map((value) => `<th>${esc(date(`${value}-01`))}<small class="d-block text-muted">Target Delivery</small></th>`).join("")}<th>Total MPS</th></tr>`;
    const matrixRows = [...matrix.values()].sort((left, right) => `${left.customerCode}|${left.partCode}`.localeCompare(`${right.customerCode}|${right.partCode}`));
    $("mps-summary-rows").innerHTML = matrixRows.map((row) => `<tr><td class="identity"><b>${esc(row.customerCode)}</b></td><td class="part"><b>${esc(row.partCode)}</b><small class="d-block text-muted">${esc(row.partName)}</small></td>${months.map((monthKey) => {
      const cell = row.months.get(monthKey); if (!cell) return '<td><span class="text-muted">-</span></td>';
      const mpsNumber = [...cell.mpsNumbers][0]; const document = documentByNumber.get(mpsNumber) || {};
      // MRP is a planning-cycle action and is intentionally absent from the
      // delivery buckets. Production Plan ownership follows the demand-phase horizon.
      const workflowAction = ["Confirmed", "Released"].includes(document.status)
        ? `<button data-make-plan="${esc(mpsNumber)}">Production Plan</button>`
        : "";
      return `<td><div class="mps-matrix-cell"><span class="forecast"><em>Forecast</em><b>${num(cell.forecastQty)}</b></span><span class="so"><em>Actual SO</em><b>${num(cell.actualSalesOrderQty)}</b></span><span class="buffer"><em>Buffer</em><b>${num(cell.bufferQty)}</b></span><span class="target"><em>Target MPS</em><b>${num(cell.qtyPlanned)}</b></span><small>${esc([...cell.forecasts].join(", ") || "Tanpa Forecast")} · ${esc(document.status || "Draft")}</small><div class="mps-matrix-actions">${mpsNumber ? `<a href="${detailLink(mpsNumber)}">Buka Matrix</a>` : ""}${workflowAction}</div></div></td>`;
    }).join("")}<td class="ppic-number"><b>${num(row.total)}</b></td></tr>`).join("") || `<tr><td colspan="${months.length + 3}" class="ppic-empty">Belum ada FG receipt pada horizon ini.</td></tr>`;
    $("mps-summary-footer").innerHTML = `Menampilkan <b>${matrixRows.length}</b> kombinasi customer/FG pada <b>${months.length}</b> bulan Target Delivery. Forecast dan SO tetap traceable pada dokumen MPS.`;
  }
  async function loadMonthlySummary() {
    if (tab !== "mps") return;
    monthlyRows = await api("/modules/api/planning-ppic/mps/monthly-summary");
    setOptions("mps-summary-forecast", monthlyRows.map((row) => row.forecastNumber), "Semua forecast");
    setOptions("mps-summary-customer", monthlyRows.map((row) => row.customerCode), "Semua customer");
    renderMonthlySummary();
  }
  function detailLink(key) { return `/modules/planning-ppic/${tab}/${encodeURIComponent(key)}`; }
  function action(row) {
    if (tab === "consume-forecast") {
      const monthKey = String(row.month).slice(0, 7);
      return `<a class="ppic-link-btn" href="/modules/planning-ppic/consume-forecast/${encodeURIComponent(monthKey)}">Detail</a> <button class="ppic-link-btn" data-make-mps="MONTHLY" data-months="${esc(monthKey)}">${row.mpsNumber ? "Hitung ulang" : "Buat MPS"}</button>`;
    }
    if (tab === "mps") { const cycleNumbers = row.mpsNumbers || [row.mpsNumber], cycleData = esc(cycleNumbers.join(",")); return `<div class="mps-row-actions"><a class="ppic-link-btn" href="${detailLink(row.mpsNumber)}">Buka Planning Cycle</a>${row.bucketAligned===false?'<button class="ppic-link-btn primary" data-recalculate-mps-window>Hitung ulang window</button>':row.status === "Draft" ? `<button class="ppic-link-btn primary" data-confirm-mps="${esc(row.mpsNumber)}" data-mps-numbers="${cycleData}">Review & Lock Cycle</button>` : row.status === "Confirmed" ? `<button class="ppic-link-btn primary" data-run-mrp="${esc(row.mpsNumber)}" data-mps-numbers="${cycleData}">Run MRP Cycle (${cycleNumbers.length} bulan)</button>` : ""}</div>`; }
    return "-";
  }
  function mpsCycleRows(input) {
    if (tab !== "mps") return input;
    const sorted = [...input].sort((left, right) => new Date(left.periodStart) - new Date(right.periodStart));
    const cycles = [];
    for (let index = 0; index < sorted.length;) {
      const first = sorted[index]; const group = [first];
      const anchorKey = String(first.planningAnchorMonth || first.periodStart).slice(0, 7);
      while (group.length < 3 && sorted[index + group.length]) {
        const candidate = sorted[index + group.length];
        const expected = new Date(group.at(-1).periodStart); expected.setUTCMonth(expected.getUTCMonth() + 1, 1);
        const sameCycle = String(candidate.planningAnchorMonth || candidate.periodStart).slice(0, 7) === anchorKey;
        const contiguous = String(candidate.periodStart).slice(0, 7) === expected.toISOString().slice(0, 7);
        if (!sameCycle || !contiguous) break;
        group.push(candidate);
      }
      const locked = group.every((row) => ["Confirmed", "Released"].includes(row.status));
      cycles.push({ ...first, mpsNumbers: group.map((row) => row.mpsNumber), periodEnd: group.at(-1).periodEnd,
        targetDeliveryStart: group[0].targetDeliveryStart, targetDeliveryEnd: group.at(-1).targetDeliveryEnd,
        forecastNumbers: [...new Set(group.flatMap((row) => row.forecastNumbers || []))], soNumbers: [...new Set(group.flatMap((row) => row.soNumbers || []))],
        priorityClasses: [...new Set(group.flatMap((row) => row.priorityClasses || []))], totalPlannedQty: group.reduce((sum, row) => sum + Number(row.totalPlannedQty || 0), 0),
        partCount: Math.max(...group.map((row) => Number(row.partCount || 0))), customerCount: Math.max(...group.map((row) => Number(row.customerCount || 0))),
        deliveryPhaseCount: group.reduce((sum, row) => sum + Number(row.deliveryPhaseCount || 0), 0), bucketAligned: group.every((row) => row.bucketAligned !== false), status: locked ? "Confirmed" : "Draft" });
      index += group.length;
    }
    return cycles;
  }
  function capacityState(capacity = {}) {
    return {
      ENOUGH: { label: "Cukup", css: "enough" },
      TIGHT: { label: "Cukup, kapasitas kritis", css: "tight" },
      NOT_ENOUGH: { label: "Tidak cukup", css: "not-enough" },
      NOT_PLANNED: { label: "Belum masuk Production Plan", css: "not-planned" },
      UNAVAILABLE: { label: "Belum dapat dihitung", css: "unavailable" },
    }[capacity.status] || { label: "Belum dapat dihitung", css: "unavailable" };
  }
  function renderCapacityHeatmap() {
    const section = $("consume-capacity-section");
    if (!section || tab !== "consume-forecast") return;
    const capacityRows = rows.filter((row) => row.capacity);
    const thisMonth = currentMonthKey();
    const current = capacityRows.find((row) => String(row.month).slice(0, 7) === thisMonth);
    $("consume-capacity-heatmap").innerHTML = capacityRows.map((row) => {
      const capacity = row.capacity || {};
      const state = capacityState(capacity);
      const utilization = Number(capacity.utilizationPercent || 0);
      const isCurrent = String(row.month).slice(0, 7) === thisMonth;
      return `<article class="consume-capacity-cell ${state.css} ${isCurrent ? "is-current" : ""}">
        <div><span>${isCurrent ? "BULAN INI" : "BULAN"}</span><b>${esc(date(row.month))}</b></div>
        <strong>${capacity.status === "UNAVAILABLE" ? "-" : `${num(utilization)}%`}</strong>
        <div class="consume-capacity-meter"><i style="width:${Math.min(Math.max(utilization, 0), 100)}%"></i></div>
        <small>${esc(state.label)} · Peak ${num(capacity.peakLoadPercent)}%</small>
        <footer><span>Total ${num(utilization)}%</span><span>${capacityHours(capacity.remainingMinutes)} sisa</span></footer>
        ${capacity.planNumbers?.length ? `<em>${capacity.planNumbers.map(esc).join(", ")}</em>` : '<em>Forecast belum tercakup MPP</em>'}
      </article>`;
    }).join("") || '<div class="consume-capacity-empty">Belum ada bucket Forecast bulan berjalan atau bulan mendatang untuk dihitung.</div>';
    const state = capacityState(current?.capacity || {});
    $("consume-capacity-current-month").textContent = current ? date(current.month) : date(`${thisMonth}-01`);
    $("consume-capacity-current-state").textContent = current ? state.label : "Tidak ada bucket Forecast bulan ini";
    $("consume-capacity-current-percent").textContent = current?.capacity?.status === "UNAVAILABLE" || !current ? "-" : `${num(current.capacity.utilizationPercent)}%`;
    $("consume-capacity-current-hours").textContent = current ? `${capacityHours(current.capacity.totalLoadMinutes)} dari ${capacityHours(current.capacity.totalAvailableMinutes)}` : "Belum ada data kapasitas";
    $("consume-capacity-current-remaining").textContent = current ? capacityHours(current.capacity.remainingMinutes) : "-";
    $("consume-capacity-current-machines").textContent = current ? `${num(current.capacity.activeMachineCount)} mesin aktif` : "-";
    $("consume-capacity-current-conclusion").textContent = current ? state.label : "Belum ada demand";
    $("consume-capacity-current-conclusion").className = state.css;
    $("consume-capacity-current-blockers").textContent = current ? `Peak ${num(current.capacity.peakLoadPercent)}%${current.capacity.bottleneckMachineCode ? ` · ${current.capacity.bottleneckMachineCode}` : ""} · ${num(current.capacity.overloadedCells)} overload` : "-";
  }
  function render() {
    const query = $("ppic-search").value.toLowerCase();
    const visible = rows.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(query)
      && (!listFilters.period || periodOf(row) === listFilters.period)
      && (!listFilters.customer || customerOf(row) === listFilters.customer)
      && (!listFilters.status || String(row.status || row.mpsStatus || "") === listFilters.status));
    const displayRows = mpsCycleRows(visible);
    gallery?.setRows(displayRows);
    $("ppic-head").innerHTML = `<tr>${config.head.map((head) => `<th>${head}</th>`).join("")}</tr>`;
    $("ppic-rows").innerHTML = displayRows.map((row, index) => {
      if (tab === "mrp") return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.runNumber)}">${esc(row.planNumber || row.runNumber)}</a>${row.planRevision ? `<small class="d-block text-muted">Rev. ${num(row.planRevision)}</small>` : ""}</td><td>${esc(row.mpsNumber)}</td><td>${date(row.planningMonth || row.runDate)}</td><td class="ppic-number">${num(row.totalRequirements)}</td><td class="ppic-number">${num(row.totalPlannedOrders)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
      if (tab === "mps") { const forecasts=row.forecastNumbers||[],salesOrders=row.soNumbers||[],deliveryStart=day(row.targetDeliveryStart),deliveryEnd=day(row.targetDeliveryEnd),deliveryRange=deliveryStart===deliveryEnd?deliveryStart:`${deliveryStart} – ${deliveryEnd}`,priorities=row.priorityClasses||[]; return `<tr class="${row.bucketAligned===false?'mps-bucket-mismatch':''}"><td data-label="No">${index + 1}</td><td data-label="Planning Cycle"><a class="ppic-id" href="${detailLink(row.mpsNumber)}">${esc((row.mpsNumbers||[row.mpsNumber]).join(" + "))}</a><small>${date(row.periodStart)} – ${date(row.periodEnd)} · satu run MRP</small></td><td data-label="Target Delivery"><b>${esc(deliveryRange)}</b><small>FG required ${row.fgRequiredStart?esc(day(row.fgRequiredStart)):"belum direview"}</small></td><td data-label="Demand Sources"><div class="mps-source-stack">${forecasts.length?`<span><b>Forecast</b>${esc(forecasts.join(", "))}</span>`:""}${salesOrders.length?`<span><b>Actual SO</b>${esc(salesOrders.join(", "))}</span>`:""}${!forecasts.length&&!salesOrders.length?"-":""}</div></td><td data-label="Coverage"><b>${num(row.partCount)} part · ${num(row.customerCount)} customer</b><small>${num(row.deliveryPhaseCount)} delivery phase</small></td><td data-label="Qty Plan" class="ppic-number"><b>${num(row.totalPlannedQty)}</b></td><td data-label="Due Protection"><div class="mps-priority-list">${row.bucketAligned===false?'<span class="ppic-badge cancelled">BUCKET MISMATCH</span>':priorities.length?priorities.map((value)=>badge(value)).join(""):"<span class=\"text-muted\">Belum direview</span>"}</div></td><td data-label="Status">${badge(row.status)}${row.bucketAligned===false?'<small>Replan diperlukan</small>':''}</td><td data-label="Aksi">${action(row)}</td></tr>`; }
      if (tab === "monthly-plan") { const target = Number(row.targetQty || 0); const actual = Number(row.actualQty || 0); const progress = target ? Math.round(actual / target * 100) : 0; return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.planNumber)}">${esc(row.planNumber)}</a></td><td>${date(row.planMonth)}</td><td class="ppic-number">${num(target)}</td><td class="ppic-number">${num(actual)}</td><td class="ppic-number">${progress}%</td><td>${badge(row.status)}</td><td>-</td></tr>`; }
      const deliveryRange = row.earliestDeliveryDate ? `${day(row.earliestDeliveryDate)}${row.latestDeliveryDate && day(row.latestDeliveryDate) !== day(row.earliestDeliveryDate) ? ` – ${day(row.latestDeliveryDate)}` : ""}` : "Belum ada target delivery";
      const purchaseRange = row.earliestPurchaseDate ? `${day(row.earliestPurchaseDate)}${row.latestPurchaseDate && day(row.latestPurchaseDate) !== day(row.earliestPurchaseDate) ? ` – ${day(row.latestPurchaseDate)}` : ""}` : "Belum ada planned purchase";
      const planningLinks = [
        row.mpsNumber ? `<a class="ppic-id" href="/modules/planning-ppic/mps/${encodeURIComponent(row.mpsNumber)}">${esc(row.mpsNumber)}</a>` : badge(row.mpsStatus),
        row.mrpRunNumber ? `<a class="ppic-id d-block mt-1" href="/modules/planning-ppic/mrp/${encodeURIComponent(row.mrpRunNumber)}">${esc(row.mrpRunNumber)}</a>` : '<small class="d-block text-muted mt-1">MRP belum dijalankan</small>',
        row.replanRequired ? '<span class="ppic-badge cancelled d-block mt-1">Replan diperlukan</span>' : "",
      ].join("");
      const monthKey = String(row.month).slice(0, 7);
      return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="/modules/planning-ppic/consume-forecast/${encodeURIComponent(monthKey)}"><b>${esc(monthKey)}</b></a><small class="d-block text-muted">Produksi / delivery / purchase</small></td><td class="ppic-number">${num(row.forecastQty)}<small class="d-block text-muted">${num(row.forecastCount)} forecast · ${num(row.partCount)} FG</small></td><td class="ppic-number"><b>${num(row.actualSalesOrderQty)}</b><small class="d-block text-muted">Target ${num(row.customerDeliveryQty)} · ${esc(deliveryRange)}</small></td><td class="ppic-number"><b>${num(row.consumedForecastQty)}</b><small class="d-block text-muted">Sisa forecast ${num(row.remainingForecastQty)}</small></td><td class="ppic-number"><b>${num(row.productionTargetQty)}</b><small class="d-block text-muted">${num(row.productionPartCount)} FG · ${esc(row.mpsStatus)}</small></td><td class="ppic-number"><b>${num(row.materialPurchaseOrderCount)} order</b><small class="d-block text-muted">${num(row.materialPartCount)} material</small><small class="d-block text-muted">${esc(purchaseRange)}</small></td><td>${planningLinks}</td><td>${action(row)}</td></tr>`;
    }).join("") || `<tr><td colspan="${config.head.length}" class="ppic-empty">Belum ada data ${esc(config.title)}</td></tr>`;
    $("ppic-footer").innerHTML = tab === "mps" ? `Menampilkan <b>${displayRows.length}</b> rolling planning cycle dari <b>${rows.length}</b> source bucket` : `Menampilkan <b>${visible.length}</b> dari <b>${rows.length}</b> data`;
    renderPlanningFlowbar();
    renderCapacityHeatmap();
  }
  function renderPlanningFlowbar() {
    const root = $("planning-flowbar"); if (!root) return;
    const hasLockedMps = rows.some((row) => row.status !== "Draft" && row.status !== "Superseded");
    const hasRunnableMps = rows.some((row) => row.status === "Confirmed");
    root.querySelectorAll("[data-flow-step]").forEach((item) => {
      const step = item.dataset.flowStep;
      const active = (tab === "mps" && step === (hasRunnableMps ? "run-mrp" : hasLockedMps ? "mps" : "lock")) || (tab === "mrp" && step === "mrp") || (tab === "demand-planning" && step === "demand");
      const done = (tab === "mps" && (step === "demand" || (step === "lock" && hasLockedMps))) || (tab === "mrp" && ["demand", "mps", "lock", "run-mrp"].includes(step));
      item.classList.toggle("active", active); item.classList.toggle("done", done);
    });
  }
  async function load() {
    try { rows = await api(config.url); $("ppic-title").textContent = config.title; $("ppic-subtitle").textContent = config.subtitle; $("ppic-primary").textContent = config.primary; syncListFilterOptions(); syncListFilterBadge(); render(); $("ppic-alert").classList.add("d-none"); }
    catch (error) { showAlert(error.message); }
  }
  async function recalculateMpsWindow() {
    const anchor=currentMpsAnchor(),months=mpsWindowMonths(anchor);
    const mbomSelections = await chooseMbomRevisions(months, anchor);
    if (mbomSelections === null) return;
    if (!confirm(`Hitung ulang MPS berdasarkan Target Delivery untuk ${months.join(", ")}? Revisi BOM terpilih akan disimpan pada setiap baris MPS.`)) return;
    const button=$("ppic-primary"); if(button)button.disabled=true;
    try { const result=await api("/modules/api/planning-ppic/mps/monthly-sync",{method:"POST",body:JSON.stringify({planningAnchorMonth:anchor,mbomSelections})}); showAlert(`${(result.months||months).join(", ")} selesai dihitung. Setiap baris MPS sudah mengunci revisi BOM sesuai FG Required Date.`,"success"); await Promise.all([load(),loadMonthlySummary()]); }
    catch(error){showAlert(error.message);}finally{if(button)button.disabled=false;}
  }
  function ensureMbomRevisionDialog() {
    let dialog = document.getElementById("mps-mbom-revision-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "mps-mbom-revision-dialog";
    dialog.className = "mps-mbom-revision-dialog";
    dialog.innerHTML = '<form method="dialog"><header><div><small>MPS BOM CONTROL</small><h2>Pilih Revisi BOM</h2><p>Default mengikuti revisi yang aktif pada FG Required Date. Override manual tetap disimpan sebagai audit.</p></div><button type="button" data-close-mbom aria-label="Tutup">×</button></header><div class="mps-mbom-revision-body" data-mbom-body></div><footer><button class="btn btn-outline-secondary" type="button" data-close-mbom>Batal</button><button class="btn btn-primary" type="submit" value="apply">Gunakan & Lanjutkan</button></footer></form>';
    document.body.appendChild(dialog);
    dialog.querySelectorAll("[data-close-mbom]").forEach((button) => button.addEventListener("click", () => dialog.close("cancel")));
    return dialog;
  }
  async function chooseMbomRevisions(months, anchor) {
    let items;
    try {
      items = await api(`/modules/api/planning-ppic/mps/mbom-revision-options?months=${encodeURIComponent(months.join(","))}&planningAnchorMonth=${encodeURIComponent(anchor)}`);
    } catch (error) {
      showAlert(`Pilihan revisi BOM gagal dimuat: ${error.message}`);
      return null;
    }
    const dialog = ensureMbomRevisionDialog();
    const body = dialog.querySelector("[data-mbom-body]");
    body.innerHTML = items.length ? items.map((item) => {
      const automatic = item.revisions.find((revision) => revision.id === item.autoSelectedId);
      const autoLabel = automatic
        ? `Otomatis — Rev ${automatic.revision} · ${automatic.noReg}`
        : "Otomatis — tidak ada revisi aktif (akan menjadi blocker)";
      const options = [`<option value="">${esc(autoLabel)}</option>`, ...item.revisions.map((revision) => {
        const period = `${revision.effectiveDate ? day(revision.effectiveDate) : "tanpa awal"} – ${revision.expiryDate ? day(revision.expiryDate) : "seterusnya"}`;
        return `<option value="${esc(revision.id)}">Rev ${esc(revision.revision)} · ${esc(revision.noReg)} · ${esc(period)}${revision.effectiveForSelectionDate ? " · aktif" : " · di luar periode"}</option>`;
      })].join("");
      return `<article class="mps-mbom-revision-row"><div><small>${esc(item.month)}</small><strong>${esc(item.partCode)}</strong><span>Tanggal acuan ${esc(day(item.selectionDate))}</span></div><label><span>Revisi untuk explosion MRP</span><select class="form-select" data-mbom-key="${esc(item.key)}">${options}</select></label><div class="mps-mbom-auto"><b>${automatic ? `Rev ${esc(automatic.revision)}` : "BOM belum aktif"}</b><span>${automatic ? esc(automatic.revisionNote || "Tidak ada catatan revisi") : "Lengkapi effective date atau pilih override."}</span></div></article>`;
    }).join("") : '<div class="mps-mbom-empty">Tidak ada demand Forecast/SO aktif pada window ini.</div>';
    return new Promise((resolve) => {
      const onClose = () => {
        dialog.removeEventListener("close", onClose);
        if (dialog.returnValue !== "apply") return resolve(null);
        const selections = {};
        dialog.querySelectorAll("[data-mbom-key]").forEach((select) => { if (select.value) selections[select.dataset.mbomKey] = select.value; });
        resolve(selections);
      };
      dialog.addEventListener("close", onClose);
      dialog.showModal();
    });
  }
  $("ppic-search").addEventListener("input", render);
  ["mps-summary-group", "mps-summary-month", "mps-summary-forecast", "mps-summary-customer", "mps-summary-scope"].forEach((id) => $(id)?.addEventListener("change", renderMonthlySummary));
  $("ppic-filter").addEventListener("click", () => { const panel = ensureListFilterPanel(); panel.hidden = !panel.hidden; $("ppic-filter").setAttribute("aria-expanded", String(!panel.hidden)); });
  $("ppic-primary").addEventListener("click", async () => {
    if (tab === "consume-forecast") return void (location.href = "/modules/sales/forecasts/new");
    if (tab === "mps") {
      return void recalculateMpsWindow();
    }
    if (tab === "mrp") showAlert("Jalankan MRP dari baris MPS yang berstatus Confirmed pada tab MPS.", "info");
    else showAlert("Production Plan dibuat dari MPS Confirmed setelah MRP Completed.", "info");
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-make-mps],[data-confirm-mps],[data-run-mrp],[data-make-plan],[data-recalculate-mps-window]");
    if (!button) return;
    button.disabled = true;
    try {
      if(button.hasAttribute("data-recalculate-mps-window")) return void recalculateMpsWindow();
      if (button.dataset.makeMps) { const months = button.dataset.months || ""; if (!confirm(`Konsolidasikan seluruh Forecast dan SO ${months ? `untuk delivery filter ${months}` : ""} ke Rolling MPS?`)) return; const monthlyMode=button.dataset.makeMps==="MONTHLY";const result = await api(monthlyMode?"/modules/api/planning-ppic/mps/monthly-sync":"/modules/api/planning-ppic/mps/from-forecast", { method: "POST", body: JSON.stringify({ ...(monthlyMode?{}:{forecastNumber:button.dataset.makeMps}), months: months ? months.split(",").filter(Boolean) : undefined }) }); const docs = Array.isArray(result) ? result : (result.items || []); location.href = docs.length > 1 ? "/modules/planning-ppic/mps" : `/modules/planning-ppic/mps/${encodeURIComponent(docs[0]?.mpsNumber || "")}`; }
      else if (button.dataset.confirmMps) { const cycleNumbers=(button.dataset.mpsNumbers||button.dataset.confirmMps).split(",").filter(Boolean); if (!confirm(`Review dan lock planning cycle ${cycleNumbers.join(" + ")}?`)) return; for (const cycleMpsNumber of cycleNumbers) await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(cycleMpsNumber)}/confirm`, { method: "PATCH", body: "{}" }); await Promise.all([load(), loadMonthlySummary()]); }
      else if (button.dataset.makePlan) { if (!confirm(`Buat Production Plan dari ${button.dataset.makePlan}?`)) return; const input = await window.formPrompt("Persentase forecast untuk Production Plan (0-100). SO aktual tetap menjadi minimum.", "100", { title: "Production Plan" }); if (input === null) return; const productionPercent = Number(input); if (!Number.isFinite(productionPercent) || productionPercent < 0 || productionPercent > 100) return showAlert("Persentase Production Plan harus antara 0 sampai 100.", "warning"); const result = await api("/modules/api/planning-ppic/monthly-plan/from-mps", { method: "POST", body: JSON.stringify({ mpsNumber: button.dataset.makePlan, productionPercent }) }); const primaryPlan = result.primaryPlanNumber || result.items?.find((item) => Number(item.receiptLineCount || 0) > 0)?.planNumber || result.items?.[0]?.planNumber; location.href = primaryPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(primaryPlan)}` : "/modules/planning-ppic/monthly-plan"; }
      else { const cycleNumbers=(button.dataset.mpsNumbers||button.dataset.runMrp).split(",").filter(Boolean); if (!confirm(`Jalankan satu MRP untuk planning cycle ${cycleNumbers.join(" + ")}?`)) return; const generated = await api("/modules/api/planning-ppic/mrp/generate-number"); const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: button.dataset.runMrp, mpsNumbers: cycleNumbers }) }); location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`; }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  Promise.all([load(), loadMonthlySummary()]).then(renderMonthlySummary).catch((error) => showAlert(error.message));
})();
