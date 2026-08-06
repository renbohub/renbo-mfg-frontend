(function () {
  const config = JSON.parse(document.getElementById("module-page-config").textContent);
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const columns = Array.isArray(config.reportColumns) ? config.reportColumns : [];
  const state = { rows: [], report: null, chart: null };
  let timer = null;
  const gallery = window.ListGallery?.init({
    root: "#report-list-root",
    storageKey: `report-view:${config.module}:${config.slug}`,
    title: (row) => shared.get(row, columns[0]?.data) || config.label,
    subtitle: (row) => shared.get(row, columns[1]?.data) || config.description,
    status: (row) => row.status || row.readinessStatus || row.costingStatus || row.agingStatus || "Report",
  });

  const label = (key) => String(key || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
  const isCurrencyKey = (key) => /cost|amount|revenue|margin|cogs|spend|price/i.test(key);
  const isPercentKey = (key) => /percent|coverage|rate|efficiency/i.test(key);
  const displayValue = (key, value) => {
    if (isPercentKey(key)) return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(shared.number(value))}%`;
    if (isCurrencyKey(key)) return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(shared.number(value));
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(shared.number(value));
  };
  function setAlert(message = "") {
    const box = document.getElementById("report-alert");
    box.textContent = message;
    box.classList.toggle("d-none", !message);
  }
  function renderSummary() {
    const entries = Object.entries(state.report?.summary || {});
    entries.slice(0, 4).forEach(([key, value], index) => {
      document.getElementById(`report-label-${index}`).textContent = label(key);
      document.getElementById(`report-value-${index}`).textContent = displayValue(key, value);
      document.getElementById(`report-note-${index}`).textContent = "Sesuai filter laporan";
    });
    for (let index = entries.length; index < 4; index += 1) {
      document.getElementById(`report-label-${index}`).textContent = "No Data";
      document.getElementById(`report-value-${index}`).textContent = "0";
      document.getElementById(`report-note-${index}`).textContent = "Belum tersedia";
    }
    document.getElementById("report-insights").innerHTML = entries.slice(4).map(([key, value]) =>
      `<div><span>${shared.escapeHtml(label(key))}</span><strong>${shared.escapeHtml(displayValue(key, value))}</strong></div>`,
    ).join("") || "<span>Tidak ada gap tambahan pada filter ini.</span>";
  }
  function renderRows() {
    const body = document.getElementById("report-rows");
    document.getElementById("report-count").innerHTML = `<i></i> ${new Intl.NumberFormat("id-ID").format(state.report?.total || state.rows.length)} baris`;
    body.innerHTML = state.rows.map((row) =>
      `<tr>${columns.map((column) => `<td>${shared.format(shared.get(row, column.data), column.type)}</td>`).join("")}</tr>`,
    ).join("") || `<tr><td colspan="${Math.max(columns.length, 1)}" class="text-center p-4 text-muted">Belum ada data laporan.</td></tr>`;
    gallery?.setRows(state.rows);
  }
  function renderFilterOptions() {
    const machine = document.getElementById("report-machine");
    if (!machine) return;
    const selected = machine.value;
    const machines = Array.isArray(state.report?.filterOptions?.machines)
      ? state.report.filterOptions.machines
      : [];
    const knownMachines = [...new Set([
      ...[...machine.options].map((option) => option.value).filter(Boolean),
      ...machines,
    ])].sort();
    machine.innerHTML = `<option value="">Semua mesin</option>${knownMachines.map((code) =>
      `<option value="${shared.escapeHtml(code)}">${shared.escapeHtml(code)}</option>`,
    ).join("")}`;
    machine.value = knownMachines.includes(selected) ? selected : "";
  }
  function renderChart() {
    state.chart?.destroy();
    const chart = state.report?.chart || {};
    const rawSeries = Array.isArray(chart.series) ? chart.series : [];
    const multiSeries = rawSeries.some((item) => typeof item === "object");
    const options = multiSeries
      ? {
          chart: { type: "line", height: 290, toolbar: { show: false } },
          series: rawSeries,
          xaxis: { categories: chart.labels || [] },
          stroke: { width: 3, curve: "smooth" },
          colors: ["#4f46e5", "#10b981", "#f59e0b", "#ef4444"],
          dataLabels: { enabled: false },
          legend: { position: "bottom" },
        }
      : {
          chart: { type: "bar", height: 290, toolbar: { show: false } },
          series: [{ name: "Value", data: rawSeries }],
          xaxis: { categories: chart.labels || [] },
          plotOptions: { bar: { borderRadius: 6, distributed: true } },
          colors: ["#4f46e5", "#10b981", "#f59e0b", "#ef4444"],
          dataLabels: { enabled: false },
          legend: { show: false },
        };
    state.chart = new ApexCharts(document.querySelector("#report-chart"), options);
    state.chart.render();
  }
  async function load() {
    if (!config.apiReady) return;
    setAlert("");
    const query = new URLSearchParams({ start: "0", length: "500", q: document.getElementById("report-search").value });
    const month = document.getElementById("report-month")?.value;
    if (month) {
      const [year, monthNumber] = month.split("-").map(Number);
      const startDate = `${month}-01`;
      const endDate = new Date(year, monthNumber, 0);
      query.set("startDate", startDate);
      query.set("endDate", `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`);
    }
    const machineCode = document.getElementById("report-machine")?.value;
    if (machineCode) query.set("machineCode", machineCode);
    const response = await fetch(`/modules/api/${config.module}/${config.slug}?${query}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAlert(payload.message || "Laporan gagal dimuat.");
      state.rows = [];
      state.report = { total: 0, summary: {}, chart: { labels: [], series: [] } };
    } else {
      state.rows = Array.isArray(payload.data) ? payload.data : [];
      state.report = payload.report || { total: payload.recordsTotal || state.rows.length, summary: {}, chart: { labels: [], series: [] } };
    }
    renderFilterOptions();
    renderSummary();
    renderRows();
    renderChart();
  }

  document.getElementById("report-search").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 300);
  });
  document.getElementById("report-refresh").addEventListener("click", load);
  document.getElementById("report-month")?.addEventListener("change", load);
  document.getElementById("report-machine")?.addEventListener("change", load);
  document.getElementById("report-export").addEventListener("click", () =>
    shared.downloadCsv(
      `${config.module}-${config.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      columns.map((column) => column.label),
      state.rows.map((row) => columns.map((column) => shared.get(row, column.data) ?? "")),
    ),
  );
  load().catch((error) => setAlert(error.message));
})();
