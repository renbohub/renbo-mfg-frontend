(function () {
  const cfg = JSON.parse(document.getElementById("ppic-page-config").textContent);
  const tab = cfg.activeTab;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const num = (value) => new Intl.NumberFormat("id-ID").format(Number(value || 0));
  let rows = [];
  let monthlyRows = [];
  const config = {
    mrp: { title: "Material Requirements Planning", subtitle: "Perhitungan kebutuhan material dan planned order dari MPS yang sudah dikonfirmasi.", url: "/modules/api/planning-ppic/material-requirements-planning?start=0&length=100", primary: "Run MRP", head: ["No", "MRP ID", "MPS", "Periode", "Requirements", "Planned Order", "Status", "Aksi"] },
    mps: { title: "Master Production Schedule", subtitle: "Jadwal induk produksi yang dihasilkan dari forecast bulanan customer.", url: "/modules/api/planning-ppic/master-production-schedule?start=0&length=100", primary: "Create MPS", head: ["No", "MPS ID", "Periode", "Forecast", "Produk / Part", "Qty Plan", "Status", "Aksi"] },
    "monthly-plan": { title: "Monthly Production Plans", subtitle: "Target produksi, kapasitas, dan realisasi per bulan.", url: "/modules/api/planning-ppic/monthly-plan?start=0&length=100", primary: "Create New Plan", head: ["No", "Plan ID", "Bulan", "Target Qty", "Actual Qty", "Progress", "Status", "Aksi"] },
    "consume-forecast": { title: "Material Consume Forecast", subtitle: "Monitor forecast customer yang telah digunakan sebagai demand planning.", url: "/modules/api/planning-ppic/consume-forecast?start=0&length=100", primary: "Create Forecast", head: ["No", "Forecast ID", "Periode", "Customer", "Forecast Qty", "Status", "Aksi"] },
  }[tab];
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
    if (tab === "consume-forecast") return row.status === "Confirmed" ? `<button class="ppic-link-btn" data-make-mps="${esc(row.forecastNumber)}">Buat MPS</button>` : `<a class="ppic-link-btn" href="/modules/sales/forecasts/${encodeURIComponent(row.forecastNumber)}">Lihat</a>`;
    if (tab === "mps") return row.status === "Draft" ? `<button class="ppic-link-btn" data-confirm-mps="${esc(row.mpsNumber)}">Confirm</button>` : row.status === "Confirmed" ? `<button class="ppic-link-btn" data-run-mrp="${esc(row.mpsNumber)}">Run MRP</button> <button class="ppic-link-btn" data-make-plan="${esc(row.mpsNumber)}">Production Plan</button>` : "-";
    return "-";
  }
  function render() {
    const query = $("ppic-search").value.toLowerCase();
    const visible = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
    $("ppic-head").innerHTML = `<tr>${config.head.map((head) => `<th>${head}</th>`).join("")}</tr>`;
    $("ppic-rows").innerHTML = visible.map((row, index) => {
      if (tab === "mrp") return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.runNumber)}">${esc(row.runNumber)}</a></td><td>${esc(row.mpsNumber)}</td><td>${date(row.runDate)}</td><td class="ppic-number">${num(row.totalRequirements)}</td><td class="ppic-number">${num(row.totalPlannedOrders)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
      if (tab === "mps") return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.mpsNumber)}">${esc(row.mpsNumber)}</a></td><td>${date(row.periodStart)} — ${date(row.periodEnd)}</td><td>${esc(row.forecastNumber)}</td><td>${num(row.partCount)} part</td><td class="ppic-number">${num(row.totalPlannedQty)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
      if (tab === "monthly-plan") { const target = Number(row.targetQty || 0); const actual = Number(row.actualQty || 0); const progress = target ? Math.round(actual / target * 100) : 0; return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.planNumber)}">${esc(row.planNumber)}</a></td><td>${date(row.planMonth)}</td><td class="ppic-number">${num(target)}</td><td class="ppic-number">${num(actual)}</td><td class="ppic-number">${progress}%</td><td>${badge(row.status)}</td><td>-</td></tr>`; }
      return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.forecastNumber)}">${esc(row.forecastNumber)}</a></td><td>${date(row.periodStart)} — ${date(row.periodEnd)}</td><td>${esc(row.customerCode)}</td><td class="ppic-number">${num(row.totalForecastQty)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
    }).join("") || `<tr><td colspan="${config.head.length}" class="ppic-empty">Belum ada data ${esc(config.title)}</td></tr>`;
    $("ppic-footer").innerHTML = `Menampilkan <b>${visible.length}</b> dari <b>${rows.length}</b> data`;
  }
  async function load() {
    try { rows = await api(config.url); $("ppic-title").textContent = config.title; $("ppic-subtitle").textContent = config.subtitle; $("ppic-primary").textContent = config.primary; render(); $("ppic-alert").classList.add("d-none"); }
    catch (error) { showAlert(error.message); }
  }
  $("ppic-search").addEventListener("input", render);
  ["mps-summary-group", "mps-summary-month", "mps-summary-forecast", "mps-summary-customer", "mps-summary-scope"].forEach((id) => $(id)?.addEventListener("change", renderMonthlySummary));
  $("ppic-filter").addEventListener("click", () => showAlert("Filter lanjutan akan mengikuti periode, customer, dan status dokumen.", "info"));
  $("ppic-primary").addEventListener("click", () => { if (tab === "consume-forecast") location.href = "/modules/sales/forecasts/new"; else if (tab === "mps") showAlert("Buat MPS dari baris Forecast Confirmed pada tab Consume Forecast.", "info"); else if (tab === "mrp") showAlert("Jalankan MRP dari baris MPS yang berstatus Confirmed pada tab MPS.", "info"); else showAlert("Production Plan dibuat dari MPS Confirmed setelah MRP Completed.", "info"); });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-make-mps],[data-confirm-mps],[data-run-mrp],[data-make-plan]");
    if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.makeMps) { if (!confirm(`Buat Draft MPS dari ${button.dataset.makeMps}?`)) return; const result = await api("/modules/api/planning-ppic/mps/from-forecast", { method: "POST", body: JSON.stringify({ forecastNumber: button.dataset.makeMps }) }); location.href = result.items?.length > 1 ? "/modules/planning-ppic/mps" : `/modules/planning-ppic/mps/${encodeURIComponent(result.mpsNumber)}`; }
      else if (button.dataset.confirmMps) { if (!confirm(`Konfirmasi MPS ${button.dataset.confirmMps}?`)) return; await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(button.dataset.confirmMps)}/confirm`, { method: "PATCH", body: "{}" }); await load(); }
      else if (button.dataset.makePlan) { if (!confirm(`Buat Production Plan dari ${button.dataset.makePlan}?`)) return; const input = window.prompt("Persentase forecast untuk Production Plan (0-100). SO aktual tetap menjadi minimum.", "100"); if (input === null) return; const productionPercent = Number(input); if (!Number.isFinite(productionPercent) || productionPercent < 0 || productionPercent > 100) return showAlert("Persentase Production Plan harus antara 0 sampai 100.", "warning"); const result = await api("/modules/api/planning-ppic/monthly-plan/from-mps", { method: "POST", body: JSON.stringify({ mpsNumber: button.dataset.makePlan, productionPercent }) }); const firstPlan = result.items?.[0]?.planNumber; location.href = firstPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(firstPlan)}` : "/modules/planning-ppic/monthly-plan"; }
      else { if (!confirm(`Jalankan MRP untuk ${button.dataset.runMrp}?`)) return; const generated = await api("/modules/api/planning-ppic/mrp/generate-number"); const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: button.dataset.runMrp }) }); location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`; }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  load();
})();
