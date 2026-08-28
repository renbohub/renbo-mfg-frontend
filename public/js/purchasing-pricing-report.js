(function () {
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const MONTH_LABELS = ["JAN","FEB","MAR","APR","MEI","JUN","JUL","AGU","SEP","OKT","NOV","DES"];
  const typeLabels = { material: "Harga Material", "purchase-part": "Harga Purchase Part", "vendor-process": "Harga Vendor Process" };
  const state = { type: "material", rows: [], report: null, chart: null, selectedComparisonKey: "" };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const num = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(value || 0));
  const money = (value, currency = "IDR") => { if (!(Number(value) > 0)) return "—"; try { return new Intl.NumberFormat("id-ID", { style:"currency", currency, maximumFractionDigits:2 }).format(Number(value)); } catch (_error) { return `${num(value, 2)} ${currency}`; } };
  function alert(message = "") { $("pricing-report-alert").textContent = message; $("pricing-report-alert").classList.toggle("d-none", !message); }

  function renderSummary() {
    const summary = state.report?.summary || {};
    $("pricing-summary-lines").textContent = num(summary.priceLines);
    $("pricing-summary-complete").textContent = num(summary.completeLines);
    $("pricing-summary-changed").textContent = num(summary.changedLines);
    $("pricing-summary-average").textContent = money(summary.latestAverageIdr, "IDR");
  }

  function ensureSelectedComparison() {
    if (!state.rows.some((row) => row.comparisonKey === state.selectedComparisonKey)) state.selectedComparisonKey = state.rows[0]?.comparisonKey || "";
  }

  function selectedRows() {
    return state.rows.filter((row) => row.comparisonKey === state.selectedComparisonKey);
  }

  function renderRows() {
    $("pricing-report-count").textContent = `${num(state.report?.total || state.rows.length)} baris`;
    $("pricing-report-rows").innerHTML = state.rows.map((row) => {
      const selected = row.comparisonKey === state.selectedComparisonKey;
      return `<tr class="${selected ? "is-chart-selected" : ""}">
        <td><button class="pricing-graph-choice ${selected ? "active" : ""}" type="button" data-graph-item="${esc(row.comparisonKey)}" aria-pressed="${selected}"><span aria-hidden="true">▥</span> Grafik</button></td>
        <td><span class="pricing-report-item"><strong>${esc(row.itemCode)}</strong><small>${esc(row.itemName)}</small></span></td><td>${esc(row.specification || "—")}</td><td><span class="pricing-report-item"><strong>${esc(row.partnerName)}</strong><small>${esc(row.partnerCode)}</small></span></td><td>${esc(row.currencyCode)}</td><td>${esc(row.uomCode)}</td>
        ${MONTHS.map((month) => `<td><span class="pricing-report-price ${Number(row[month]) > 0 ? "" : "missing"}">${esc(money(row[month], row.currencyCode))}</span></td>`).join("")}
        <td><strong>${esc(money(row.averagePrice, row.currencyCode))}</strong></td><td><span class="pricing-report-gap ${row.missingMonths ? "" : "complete"}">${row.missingMonths ? `${row.missingMonths} bulan kosong` : "Lengkap"}</span></td>
      </tr>`;
    }).join("") || '<tr><td colspan="20" class="text-center p-4 text-muted">Belum ada master harga pada filter ini.</td></tr>';
  }

  function monthlyIdr(row) {
    return Array.isArray(row.monthlyIdr) ? row.monthlyIdr.map(Number) : MONTHS.map((month) => Number(row[month] || 0));
  }

  function renderChart() {
    state.chart?.destroy();
    const root = $("pricing-report-chart"); root.innerHTML = "";
    const rows = selectedRows();
    if (!window.ApexCharts || !rows.length) {
      $("pricing-report-title").textContent = "Pilih item pada tabel";
      $("pricing-report-comparison").textContent = "Belum ada item dipilih";
      root.textContent = "Belum ada data harga untuk dibandingkan.";
      return;
    }

    const partnerSeries = rows.map((row) => ({
      name: [row.partnerCode, row.partnerName].filter((value) => value && value !== "-").join(" · ") || "Tanpa supplier/vendor",
      type: "column",
      data: monthlyIdr(row),
    }));
    const averages = MONTHS.map((_month, index) => {
      const values = partnerSeries.map((series) => Number(series.data[index] || 0)).filter((value) => value > 0);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    });
    const label = rows[0].comparisonLabel || [rows[0].itemCode, rows[0].itemName].filter(Boolean).join(" · ");
    $("pricing-report-title").textContent = label;
    $("pricing-report-comparison").textContent = `${rows.length} supplier/vendor dibandingkan · Harga dinormalisasi ke IDR`;
    $("pricing-report-description").textContent = "Batang menunjukkan harga bulanan setiap supplier/vendor; garis menunjukkan rata-rata supplier per bulan.";

    const series = [...partnerSeries, { name: "Rata-rata supplier", type: "line", data: averages }];
    const averageIndex = series.length - 1;
    const barColors = ["#1e78c7", "#18a26f", "#7759c2", "#e8872c", "#28a6b5", "#b55e96", "#d1495b", "#f0b429"];
    state.chart = new ApexCharts(root, {
      chart: { type:"line", height:300, stacked:false, toolbar:{show:false} },
      series,
      xaxis: { categories: MONTH_LABELS },
      plotOptions: { bar: { columnWidth:"58%", borderRadius:2 } },
      stroke: { width: series.map((_item, index) => index === averageIndex ? 3 : 0), curve:"smooth" },
      markers: { size: series.map((_item, index) => index === averageIndex ? 4 : 0) },
      colors: partnerSeries.map((_item, index) => barColors[index % barColors.length]).concat("#173f78"),
      dataLabels: { enabled:false },
      legend: { position:"top", horizontalAlign:"left" },
      yaxis: { title:{text:"Harga (IDR)"}, labels:{formatter:(value)=>num(value)} },
      tooltip: { shared:true, intersect:false, y:{formatter:(value)=>money(value,"IDR")} },
      noData: { text:"Belum ada harga untuk item ini." },
    });
    state.chart.render();
  }

  function syncType() {
    document.querySelectorAll("[data-pricing-type]").forEach((button) => button.classList.toggle("active", button.dataset.pricingType === state.type));
    $("pricing-report-detail-title").textContent = `Detail ${typeLabels[state.type]}`;
  }

  async function load({ resetSelection = false } = {}) {
    alert(""); syncType();
    if (resetSelection) state.selectedComparisonKey = "";
    const query = new URLSearchParams({ type: state.type, year: $("pricing-report-year").value, q: $("pricing-report-search").value, start:"0", length:"500" });
    try {
      const response = await fetch(`/modules/api/purchasing/pricing-report?${query}`, { headers:{Authorization:`Bearer ${token()}`} });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Pricing report gagal dimuat.");
      state.rows = payload.data || []; state.report = payload.report || {}; ensureSelectedComparison(); renderSummary(); renderRows(); renderChart();
    } catch (error) { state.rows=[]; state.report={summary:{},chart:{labels:[],series:[]}}; state.selectedComparisonKey=""; renderSummary(); renderRows(); renderChart(); alert(error.message); }
  }

  let timer;
  document.querySelectorAll("[data-pricing-type]").forEach((button) => button.addEventListener("click", () => { state.type = button.dataset.pricingType; load({ resetSelection:true }); }));
  $("pricing-report-rows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-graph-item]"); if (!button) return;
    state.selectedComparisonKey = button.dataset.graphItem; renderRows(); renderChart();
    $("pricing-report-chart").closest(".pricing-report-chart-card")?.scrollIntoView({ behavior:"smooth", block:"center" });
  });
  $("pricing-report-year").addEventListener("change", () => load({ resetSelection:true }));
  $("pricing-report-refresh").addEventListener("click", () => load());
  $("pricing-report-search").addEventListener("input", () => { clearTimeout(timer); timer=setTimeout(() => load({ resetSelection:true }),300); });
  $("pricing-report-export").addEventListener("click", function () { window.SharedDataTable?.exportTablePayload?.({ title:`Pricing Report - ${typeLabels[state.type]}`, subtitle:`Tahun ${$("pricing-report-year").value}`, fileName:`pricing-${state.type}-${$("pricing-report-year").value}`, headers:["Item","Nama","Spesifikasi","Partner","Currency","UOM",...MONTHS.map((month)=>month.slice(0,3).toUpperCase()),"Rata-rata","Bulan Kosong"], rows:state.rows.map((row)=>[row.itemCode,row.itemName,row.specification,row.partnerName,row.currencyCode,row.uomCode,...MONTHS.map((month)=>row[month]),row.averagePrice,row.missingMonths]) }, "xlsx", this); });
  load();
}());
