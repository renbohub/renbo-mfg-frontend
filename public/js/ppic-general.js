(function () {
  const cfg = JSON.parse(document.getElementById("ppic-general-config").textContent);
  const tab = cfg.activeTab;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const num = (value) => new Intl.NumberFormat("id-ID").format(Number(value || 0));
  const compact = (values) => [...values].filter(Boolean).join(", ");
  let rows = [];
  let filters = {};

  async function api(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "General summary gagal dimuat");
    return payload.data || payload.items || payload;
  }
  function showError(message) { const box = $("ppic-general-alert"); box.textContent = message; box.className = "alert alert-danger"; }
  function setOptions(root, key, label, values) {
    root.insertAdjacentHTML("beforeend", `<select data-general-filter="${key}"><option value="">${label}</option>${[...new Set(values.filter(Boolean))].sort().map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select>`);
  }
  function setupFilters() {
    const root = $("ppic-general-filters");
    root.innerHTML = "";
    setOptions(root, "group", "Detail", ["detail", "month", "customer", "part", "forecast"]);
    setOptions(root, "month", "Semua bulan", rows.map((row) => row.month));
    setOptions(root, "customer", "Semua customer", rows.map((row) => row.customerCode));
    setOptions(root, "forecast", "Semua forecast", rows.map((row) => row.forecastNumber));
    setOptions(root, "part", "Semua part", rows.map((row) => row.partCode));
    root.querySelectorAll("[data-general-filter]").forEach((input) => input.addEventListener("change", () => { filters[input.dataset.generalFilter] = input.value; render(); }));
  }
  function filteredRows() { return rows.filter((row) => (!filters.month || row.month === filters.month) && (!filters.customer || row.customerCode === filters.customer) && (!filters.forecast || row.forecastNumber === filters.forecast) && (!filters.part || row.partCode === filters.part)); }
  function aggregate(source) {
    const group = filters.group || "detail";
    const map = new Map();
    source.forEach((row) => {
      const key = group === "month" ? row.month : group === "customer" ? `${row.month}|${row.customerCode}` : group === "part" ? `${row.month}|${row.partCode}` : group === "forecast" ? `${row.month}|${row.forecastNumber}` : `${row.month}|${row.forecastNumber}|${row.customerCode}|${row.partCode}`;
      const item = map.get(key) || { ...row, forecasts: new Set(), customers: new Set(), parts: new Set(), runs: new Set(), mps: new Set(), forecastQty: 0, actualSalesOrderQty: 0, bufferQty: 0, grossRequirement: 0, netRequirement: 0, adjustedOrderQty: 0 };
      item.forecasts.add(row.forecastNumber); item.customers.add(row.customerCode); item.parts.add(row.partCode); if (row.runNumbers) row.runNumbers.forEach((value) => item.runs.add(value)); if (row.mpsNumbers) row.mpsNumbers.forEach((value) => item.mps.add(value));
      item.forecastQty += Number(row.forecastQty || 0); item.actualSalesOrderQty += Number(row.actualSalesOrderQty || 0); item.bufferQty += Number(row.bufferQty || 0); item.grossRequirement += Number(row.grossRequirement || 0); item.netRequirement += Number(row.netRequirement || 0); item.adjustedOrderQty += Number(row.adjustedOrderQty || row.qtyPlanned || 0); map.set(key, item);
    });
    return [...map.values()].sort((a, b) => `${a.month}|${a.partCode}`.localeCompare(`${b.month}|${b.partCode}`));
  }
  function render() {
    const source = aggregate(filteredRows());
    const isMps = tab === "mps";
    const heads = isMps ? ["Bulan Forecast", "Forecast", "Customer", "Part Code", "Part Name", "Klasifikasi", "MPS", "Forecast Qty", "Actual SO", "Buffer", "Kebutuhan Plan"] : ["Bulan Kebutuhan", "Forecast", "Customer", "Part Code", "Part Name", "MRP Run", "MPS", "Forecast Qty", "Actual SO", "Buffer", "Gross Req", "Net Req", "Purchase Plan"];
    $("ppic-general-title").textContent = isMps ? "MPS General per Forecast Month" : "MRP General per Forecast Month";
    $("ppic-general-subtitle").textContent = isMps ? "Ringkasan seluruh MPS per bulan forecast; buka MPS Header untuk melihat satu header." : "Ringkasan kebutuhan MRP aktif per bulan; buka MRP Header untuk melihat satu run.";
    $("ppic-general-table-title").textContent = isMps ? "General MPS" : "General MRP";
    $("ppic-general-head").innerHTML = `<tr>${heads.map((head) => `<th>${esc(head)}</th>`).join("")}</tr>`;
    $("ppic-general-rows").innerHTML = source.map((row) => isMps
      ? `<tr><td>${esc(row.month)}</td><td>${esc(compact(row.forecasts))}</td><td>${esc(compact(row.customers))}</td><td><b>${esc(row.partCode)}</b></td><td>${esc(row.partName || row.partNumber || "-")}</td><td>${esc(row.itemScope || row.itemType || "-")}</td><td>${esc(compact(row.mps || row.mpsNumbers || []))}</td><td class="ppic-number">${num(row.forecastQty)}</td><td class="ppic-number">${num(row.actualSalesOrderQty)}</td><td class="ppic-number">${num(row.bufferQty)}</td><td class="ppic-number"><b>${num(row.qtyPlanned || row.adjustedOrderQty)}</b></td></tr>`
      : `<tr><td>${esc(row.month)}</td><td>${esc(compact(row.forecasts))}</td><td>${esc(compact(row.customers))}</td><td><b>${esc(row.partCode)}</b></td><td>${esc(row.partName || row.partNumber || "-")}</td><td>${esc(compact(row.runs))}</td><td>${esc(compact(row.mps))}</td><td class="ppic-number">${num(row.forecastQty)}</td><td class="ppic-number">${num(row.actualSalesOrderQty)}</td><td class="ppic-number">${num(row.bufferQty)}</td><td class="ppic-number">${num(row.grossRequirement)}</td><td class="ppic-number">${num(row.netRequirement)}</td><td class="ppic-number"><b>${num(row.adjustedOrderQty)}</b></td></tr>`).join("") || `<tr><td colspan="${heads.length}" class="ppic-empty">Tidak ada data untuk filter yang dipilih.</td></tr>`;
    $("ppic-general-footer").innerHTML = `Menampilkan <b>${source.length}</b> baris general dari <b>${filteredRows().length}</b> baris sumber.`;
  }
  async function load() {
    try { rows = await api(tab === "mps" ? "/modules/api/planning-ppic/mps/monthly-summary" : "/modules/api/planning-ppic/mrp/general-summary"); setupFilters(); render(); }
    catch (error) { showError(error.message); }
  }
  load();
})();
