(function () {
  const cfg = JSON.parse(document.getElementById("ppic-page-config").textContent);
  const tab = cfg.activeTab;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const day = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const num = (value) => new Intl.NumberFormat("id-ID").format(Number(value || 0));
  const capacityHours = (minutes) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(minutes || 0) / 60)} jam`;
  const currentMonthKey = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}`;
  };
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
    mps: { title: "Master Production Schedule", subtitle: "Satu jadwal induk per bulan dari konsolidasi Forecast dan Sales Order.", url: "/modules/api/planning-ppic/master-production-schedule?start=0&length=100", primary: "Hitung Ulang Bulan Dipilih", head: ["No", "MPS ID", "Periode", "Demand Sources", "Produk / Part", "Qty Plan", "Status", "Aksi"] },
    "monthly-plan": { title: "Monthly Production Plans", subtitle: "Target produksi, kapasitas, dan realisasi per bulan.", url: "/modules/api/planning-ppic/monthly-plan?start=0&length=100", primary: "Create New Plan", head: ["No", "Plan ID", "Bulan", "Target Qty", "Actual Qty", "Progress", "Status", "Aksi"] },
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
    const month = $("mps-summary-month").value; const forecast = $("mps-summary-forecast").value; const customer = $("mps-summary-customer").value; const scope = $("mps-summary-scope").value; const group = $("mps-summary-group").value;
    const filtered = monthlyRows.filter((row) => (!month || row.month === month) && (!forecast || row.forecastNumber === forecast) && (!customer || row.customerCode === customer) && (!scope || row.itemScope === scope));
    const aggregate = new Map();
    for (const row of filtered) {
      const key = group === "customer" ? `${row.month}|${row.customerCode}` : group === "part" ? `${row.month}|${row.partCode}` : group === "forecast" ? `${row.month}|${row.forecastNumber}` : `${row.month}|${row.forecastNumber}|${row.customerCode}|${row.partCode}|${row.scheduleType}|${row.itemScope}`;
      const item = aggregate.get(key) || { ...row, forecasts: new Set(), customers: new Set(), parts: new Set(), partCodes: new Set(), partNames: new Set(), schedules: new Set(), scopes: new Set(), mps: new Set(), forecastQty: 0, actualSalesOrderQty: 0, bufferQty: 0, qtyPlanned: 0 };
      item.forecasts.add(row.forecastNumber); item.customers.add(row.customerCode); item.parts.add(`${row.partCode}${row.partName ? ` — ${row.partName}` : ""}`); item.schedules.add(row.scheduleType); item.scopes.add(row.itemScope); row.mpsNumbers.forEach((value) => item.mps.add(value));
      item.partCodes.add(row.partCode); if (row.partName) item.partNames.add(row.partName);
      item.forecastQty += Number(row.forecastQty || 0); item.actualSalesOrderQty += Number(row.actualSalesOrderQty || 0); item.bufferQty += Number(row.bufferQty || 0); item.qtyPlanned += Number(row.qtyPlanned || 0); aggregate.set(key, item);
    }
    const compact = (values) => [...values].join(", ");
    const items = [...aggregate.values()].sort((left, right) => `${left.month}|${compact(left.forecasts)}|${compact(left.customers)}|${compact(left.partCodes)}`.localeCompare(`${right.month}|${compact(right.forecasts)}|${compact(right.customers)}|${compact(right.partCodes)}`));
    $("mps-summary-rows").innerHTML = items.map((row) => `<tr><td>${esc(row.month)}</td><td>${esc(compact(row.forecasts))}</td><td>${esc(compact(row.customers))}</td><td>${esc(compact(row.partCodes))}</td><td>${esc(compact(row.partNames))}</td><td>${esc(compact(row.schedules))}</td><td>${esc(compact(row.scopes))}</td><td>${esc(compact(row.mps))}</td><td class="ppic-number">${num(row.forecastQty)}</td><td class="ppic-number">${num(row.actualSalesOrderQty)}</td><td class="ppic-number">${num(row.bufferQty)}</td><td class="ppic-number"><b>${num(row.qtyPlanned)}</b></td></tr>`).join("") || '<tr><td colspan="12" class="ppic-empty">Tidak ada kebutuhan untuk filter yang dipilih</td></tr>';
    $("mps-summary-footer").innerHTML = `Menampilkan <b>${items.length}</b> ringkasan kebutuhan bulanan dari <b>${filtered.length}</b> baris MPS.`;
  }
  async function loadMonthlySummary() {
    if (tab !== "mps") return;
    monthlyRows = await api("/modules/api/planning-ppic/mps/monthly-summary");
    setOptions("mps-summary-month", monthlyRows.map((row) => row.month), "Semua bulan");
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
    if (tab === "mps") return row.status === "Draft" ? `<button class="ppic-link-btn" data-confirm-mps="${esc(row.mpsNumber)}">Confirm</button>` : row.status === "Confirmed" ? `<button class="ppic-link-btn" data-run-mrp="${esc(row.mpsNumber)}">Run MRP</button> <button class="ppic-link-btn" data-make-plan="${esc(row.mpsNumber)}">Production Plan</button>` : "-";
    return "-";
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
    gallery?.setRows(visible);
    $("ppic-head").innerHTML = `<tr>${config.head.map((head) => `<th>${head}</th>`).join("")}</tr>`;
    $("ppic-rows").innerHTML = visible.map((row, index) => {
      if (tab === "mrp") return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.runNumber)}">${esc(row.planNumber || row.runNumber)}</a>${row.planRevision ? `<small class="d-block text-muted">Rev. ${num(row.planRevision)}</small>` : ""}</td><td>${esc(row.mpsNumber)}</td><td>${date(row.runDate)}</td><td class="ppic-number">${num(row.totalRequirements)}</td><td class="ppic-number">${num(row.totalPlannedOrders)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
      if (tab === "mps") { const sources = [...(row.forecastNumbers || []), ...(row.soNumbers || [])].join(", ") || row.forecastNumber || "-"; return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.mpsNumber)}">${esc(row.mpsNumber)}</a></td><td>${date(row.periodStart)} — ${date(row.periodEnd)}</td><td>${esc(sources)}</td><td>${num(row.partCount)} part</td><td class="ppic-number">${num(row.totalPlannedQty)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`; }
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
    $("ppic-footer").innerHTML = `Menampilkan <b>${visible.length}</b> dari <b>${rows.length}</b> data`;
    renderCapacityHeatmap();
  }
  async function load() {
    try { rows = await api(config.url); $("ppic-title").textContent = config.title; $("ppic-subtitle").textContent = config.subtitle; $("ppic-primary").textContent = config.primary; syncListFilterOptions(); syncListFilterBadge(); render(); $("ppic-alert").classList.add("d-none"); }
    catch (error) { showAlert(error.message); }
  }
  $("ppic-search").addEventListener("input", render);
  ["mps-summary-group", "mps-summary-month", "mps-summary-forecast", "mps-summary-customer", "mps-summary-scope"].forEach((id) => $(id)?.addEventListener("change", renderMonthlySummary));
  $("ppic-filter").addEventListener("click", () => { const panel = ensureListFilterPanel(); panel.hidden = !panel.hidden; $("ppic-filter").setAttribute("aria-expanded", String(!panel.hidden)); });
  $("ppic-primary").addEventListener("click", async () => {
    if (tab === "consume-forecast") return void (location.href = "/modules/sales/forecasts/new");
    if (tab === "mps") {
      const month = $("mps-summary-month")?.value;
      if (!month) return showAlert("Pilih satu bulan pada filter Bulan sebelum menghitung ulang MPS.", "warning");
      if (!confirm(`Hitung ulang MPS ${month} dari Forecast, SO, dan saldo stock terbaru?`)) return;
      const button = $("ppic-primary");
      button.disabled = true;
      try {
        await api("/modules/api/planning-ppic/mps/monthly-sync", { method: "POST", body: JSON.stringify({ months: [month] }) });
        showAlert(`MPS ${month} sudah diperbarui. Jalankan MRP secara manual setelah MPS dikonfirmasi.`, "success");
        await Promise.all([load(), loadMonthlySummary()]);
      } catch (error) {
        showAlert(error.message);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (tab === "mrp") showAlert("Jalankan MRP dari baris MPS yang berstatus Confirmed pada tab MPS.", "info");
    else showAlert("Production Plan dibuat dari MPS Confirmed setelah MRP Completed.", "info");
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-make-mps],[data-confirm-mps],[data-run-mrp],[data-make-plan]");
    if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.makeMps) { const months = button.dataset.months || ""; if (!confirm(`Konsolidasikan seluruh Forecast dan SO ${months ? `untuk ${months}` : ""} ke MPS bulanan?`)) return; const monthlyMode=button.dataset.makeMps==="MONTHLY";const result = await api(monthlyMode?"/modules/api/planning-ppic/mps/monthly-sync":"/modules/api/planning-ppic/mps/from-forecast", { method: "POST", body: JSON.stringify({ ...(monthlyMode?{}:{forecastNumber:button.dataset.makeMps}), months: months ? months.split(",").filter(Boolean) : undefined }) }); const docs = Array.isArray(result) ? result : (result.items || []); location.href = docs.length > 1 ? "/modules/planning-ppic/mps" : `/modules/planning-ppic/mps/${encodeURIComponent(docs[0]?.mpsNumber || "")}`; }
      else if (button.dataset.confirmMps) { if (!confirm(`Konfirmasi MPS ${button.dataset.confirmMps}?`)) return; await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(button.dataset.confirmMps)}/confirm`, { method: "PATCH", body: "{}" }); await load(); }
      else if (button.dataset.makePlan) { if (!confirm(`Buat Production Plan dari ${button.dataset.makePlan}?`)) return; const input = await window.formPrompt("Persentase forecast untuk Production Plan (0-100). SO aktual tetap menjadi minimum.", "100", { title: "Production Plan" }); if (input === null) return; const productionPercent = Number(input); if (!Number.isFinite(productionPercent) || productionPercent < 0 || productionPercent > 100) return showAlert("Persentase Production Plan harus antara 0 sampai 100.", "warning"); const result = await api("/modules/api/planning-ppic/monthly-plan/from-mps", { method: "POST", body: JSON.stringify({ mpsNumber: button.dataset.makePlan, productionPercent }) }); const firstPlan = result.items?.[0]?.planNumber; location.href = firstPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(firstPlan)}` : "/modules/planning-ppic/monthly-plan"; }
      else { if (!confirm(`Jalankan MRP untuk ${button.dataset.runMrp}?`)) return; const generated = await api("/modules/api/planning-ppic/mrp/generate-number"); const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: button.dataset.runMrp }) }); location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`; }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  load();
})();
