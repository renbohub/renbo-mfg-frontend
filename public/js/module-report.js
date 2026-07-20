(async function () {
  const config = JSON.parse(document.getElementById("module-page-config").textContent);
  const values = [0, 0, 0];
  if (config.apiReady) {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const response = await fetch(`/modules/api/${config.module}/${config.slug}?start=0&length=500`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      document.getElementById("report-total").textContent = new Intl.NumberFormat("id-ID").format(payload.recordsTotal || payload.data?.length || 0);
      (Array.isArray(payload.data) ? payload.data : []).forEach((item) => { const status = String(item.status || "").toLowerCase(); if (/complete|closed|approved|done/.test(status)) values[1]++; else values[0]++; });
      document.getElementById("report-open").textContent = values[0]; document.getElementById("report-completed").textContent = values[1];
    }
  }
  if (window.ApexCharts) new ApexCharts(document.querySelector("#report-chart"), { chart: { type: "donut", height: 260, toolbar: { show: false } }, labels: ["Open / Process", "Completed", "Other"], series: values, colors: ["#f59e0b", "#10b981", "#d1d5db"], legend: { position: "bottom" }, dataLabels: { enabled: false } }).render();
})();
