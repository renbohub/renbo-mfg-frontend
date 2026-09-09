(function () {
  if (window.ExecutiveDashboardLoaded) return;
  window.ExecutiveDashboardLoaded = true;

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const format = (value, type = "number", compact = false) => {
    const numeric = number(value);
    if (type === "currency") return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(numeric);
    if (type === "percent") return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(numeric)}%`;
    return new Intl.NumberFormat("id-ID", { notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 }).format(numeric);
  };

  function createDashboard(root) {
    const state = { payload: null, metric: null, actualBasis: "BOOKED", chart: null, request: 0, controller: null };
    const module = root.dataset.module || "system";
    const node = (selector) => root.querySelector(selector);

    function setError(message = "") {
      const target = node("[data-executive-error]");
      target.textContent = message;
      target.classList.toggle("d-none", !message);
    }

    function renderMetrics() {
      const options = state.payload?.metricOptions || [];
      node("[data-executive-metrics]").innerHTML = options.map((option) =>
        `<button type="button" data-executive-metric="${escapeHtml(option.value)}" class="${option.value === state.metric ? "active" : ""}">${escapeHtml(option.label)}</button>`,
      ).join("");
    }

    function renderActualBasis() {
      const options = state.payload?.actualBasisOptions || [];
      const wrap = node("[data-executive-basis-wrap]");
      const selector = node("[data-executive-basis]");
      wrap.hidden = !options.length;
      if (!options.length) return;
      selector.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === state.actualBasis ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
    }

    function renderKpis() {
      const kpis = state.payload?.kpisByMetric?.[state.metric] || state.payload?.kpis || [];
      node("[data-executive-kpis]").innerHTML = kpis.map((item, index) =>
        `<article class="executive-kpi executive-kpi--${escapeHtml(item.tone || "neutral")}">
          <div><small>${escapeHtml(item.label)}</small><b>${String(index + 1).padStart(2, "0")}</b></div>
          <strong>${escapeHtml(format(item.value, item.format, true))}</strong>
          <footer><span>${escapeHtml(item.note || "")}</span>${item.trend ? `<em>${escapeHtml(item.trend)}</em>` : ""}</footer>
        </article>`,
      ).join("");
    }

    function renderInsights() {
      const insights = state.payload?.insightsByMetric?.[state.metric] || state.payload?.insights || [];
      node("[data-executive-insights]").innerHTML = insights.map((item) =>
        `<article class="executive-insight executive-insight--${escapeHtml(item.tone || "neutral")}">
          <span></span><div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.note || "")}</p></div>
        </article>`,
      ).join("") || '<p class="executive-dashboard__empty">Belum ada status.</p>';
      const context = state.payload?.context || [];
      node("[data-executive-context]").innerHTML = context.map((item) =>
        `<div><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`,
      ).join("");
    }

    function renderDefinitions() {
      const definitions = state.payload?.definitions || [];
      const target = node("[data-executive-definitions]");
      target.hidden = !definitions.length;
      target.innerHTML = definitions.map((item) => `<article><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.note || "")}</p></article>`).join("");
    }

    function renderExceptions() {
      const exceptions = state.payload?.exceptions || [];
      const wrap = node("[data-executive-exceptions-wrap]");
      wrap.hidden = !exceptions.length;
      node("[data-executive-exception-count]").textContent = `${exceptions.length} issue`;
      node("[data-executive-exceptions]").innerHTML = exceptions.map((item) => {
        const content = `<span class="executive-exception__severity executive-exception__severity--${escapeHtml(String(item.severity || "INFO").toLowerCase())}">${escapeHtml(item.severity || "INFO")}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.code)}</small><p>${escapeHtml(item.detail || "")}</p></div>${item.value !== null && item.value !== undefined ? `<b>${escapeHtml(format(item.value, "number", true))}</b>` : ""}`;
        return item.link ? `<a href="${escapeHtml(item.link)}" class="executive-exception">${content}</a>` : `<article class="executive-exception">${content}</article>`;
      }).join("");
    }

    function renderDetails() {
      const tables = state.payload?.detailTables || [];
      node("[data-executive-details]").innerHTML = tables.map((item, tableIndex) => `<article class="executive-detail-card">
        <div class="executive-dashboard__panel-head"><div><small>RECONCILIATION</small><h3>${escapeHtml(item.title)}</h3></div>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ""}</div>
        <div class="table-responsive"><table data-enterprise-links="off"><thead><tr>${(item.columns || []).map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${(item.rows || []).map((row) => `<tr>${(item.columns || []).map((column) => `<td class="${column.format && column.format !== "text" ? "text-end" : ""}">${escapeHtml(column.format ? format(row[column.key], column.format) : row[column.key])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${item.columns?.length || 1}" class="text-center">Belum ada data.</td></tr>`}</tbody></table></div>
        <button type="button" class="executive-detail-card__export" data-executive-export-table="${tableIndex}">Export tabel</button>
      </article>`).join("");
    }

    function csvValue(value) {
      const raw = String(value ?? "");
      return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    }

    function exportTables(tableIndex = null) {
      const tables = state.payload?.detailTables || [];
      const selected = tableIndex === null ? tables : tables[tableIndex] ? [tables[tableIndex]] : [];
      if (!selected.length) return setError("Belum ada detail yang dapat diekspor.");
      const lines = [];
      selected.forEach((item, index) => {
        if (index) lines.push("");
        lines.push(csvValue(item.title));
        lines.push((item.columns || []).map((column) => csvValue(column.label)).join(","));
        (item.rows || []).forEach((row) => lines.push((item.columns || []).map((column) => csvValue(row[column.key])).join(",")));
      });
      const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${module}-dashboard-${state.payload?.year || "data"}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function renderChart() {
      state.chart?.destroy();
      const metricMode = state.payload?.comparison?.modes?.[state.metric];
      const series = Array.isArray(metricMode) ? metricMode : [];
      const labels = state.payload?.comparison?.labelsByMetric?.[state.metric] || state.payload?.comparison?.labels || [];
      const isSalesTrend = series.length >= 3;
      const valueFormat = /VALUE|PRICE/.test(String(state.metric || "")) ? "currency" : "number";
      const colors = isSalesTrend ? ["#8b5cf6", "#38bdf8", "#64748b"] : ["#8b5cf6", "#2dd4bf"];
      const target = node("[data-executive-chart]");
      if (!series.length || typeof ApexCharts === "undefined") {
        target.innerHTML = '<div class="executive-dashboard__empty">Data grafik belum tersedia.</div>';
        return;
      }
      state.chart = new ApexCharts(target, {
        chart: {
          type: isSalesTrend ? "line" : "area",
          height: 330,
          background: "transparent",
          toolbar: { show: false },
          animations: { enabled: true, easing: "easeinout", speed: 650 },
        },
        series,
        colors,
        stroke: { curve: "smooth", width: series.map((_item, index) => index === 0 ? 4 : 2.5), dashArray: series.map((_item, index) => index === 2 ? 5 : 0) },
        fill: isSalesTrend ? { opacity: 0.03 } : { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.02, stops: [0, 95, 100] } },
        markers: { size: isSalesTrend ? 3 : 0, strokeWidth: 0, hover: { size: 6 } },
        dataLabels: { enabled: false },
        grid: { borderColor: "rgba(148,163,184,.24)", strokeDashArray: 4, padding: { left: 4, right: 12 } },
        xaxis: { categories: labels, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: "#64748b", fontSize: "11px" } } },
        yaxis: { labels: { formatter: (value) => format(value, valueFormat, true), style: { colors: "#64748b", fontSize: "11px" } } },
        tooltip: { theme: "light", y: { formatter: (value) => format(value, valueFormat) } },
        legend: { position: "top", horizontalAlign: "right", labels: { colors: "#334155" }, markers: { size: 5 } },
      });
      state.chart.render();
    }

    function render() {
      const payload = state.payload;
      node("[data-executive-title]").textContent = payload.title || "Ringkasan";
      node("[data-executive-subtitle]").textContent = payload.subtitle || "";
      node("[data-executive-chart-title]").textContent = payload.comparison?.modes?.[state.metric]?.map((item) => item.name).join(" / ") || "Perbandingan";
      node("[data-executive-period]").textContent = payload.periodLabel || "";
      renderMetrics();
      renderActualBasis();
      renderKpis();
      renderInsights();
      renderDefinitions();
      renderExceptions();
      renderDetails();
      renderChart();
    }

    async function load() {
      const request = ++state.request;
      state.controller?.abort();
      state.controller = new AbortController();
      const controller = state.controller;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 35000);
      setError("");
      root.classList.add("is-loading");
      try {
        const year = node("[data-executive-year]").value;
        const params = new URLSearchParams({ year, actualBasis: state.actualBasis });
        if (node("[data-executive-customer]")) params.set("customerCode", node("[data-executive-customer]").value);
        if (node("[data-executive-group]")) params.set("period", node("[data-executive-group]").value);
        const response = await fetch(`/modules/api/dashboard/executive/${encodeURIComponent(module)}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` },
          signal: state.controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "Dashboard gagal dimuat.");
        if (request !== state.request) return;
        state.payload = payload;
        state.actualBasis = payload.actualBasis || state.actualBasis;
        state.metric = payload.metricOptions?.some((item) => item.value === state.metric) ? state.metric : payload.defaultMetric || payload.metricOptions?.[0]?.value;
        render();
        const freshness = node("[data-executive-freshness]");
        if (freshness) freshness.textContent = `Diperbarui ${new Date(payload.generatedAt).toLocaleTimeString('id-ID')} · pembaruan otomatis setiap 30 detik saat halaman aktif.`;
      } catch (error) {
        if (request !== state.request || (error.name === "AbortError" && !timedOut)) return;
        setError(timedOut ? "Pembaruan terlalu lama. Silakan coba kembali." : error.message);
        const freshness = node("[data-executive-freshness]");
        if (freshness) freshness.textContent = "Pembaruan gagal. Data yang masih tampil adalah hasil pembaruan sebelumnya.";
      } finally {
        clearTimeout(timeout);
        if (request === state.request) root.classList.remove("is-loading");
      }
    }

    root.addEventListener("click", (event) => {
      const metric = event.target.closest("[data-executive-metric]");
      if (metric) {
        state.metric = metric.dataset.executiveMetric;
        renderMetrics();
        renderKpis();
        renderInsights();
        renderChart();
        node("[data-executive-chart-title]").textContent = state.payload.comparison?.modes?.[state.metric]?.map((item) => item.name).join(" / ") || "Perbandingan";
      }
      if (event.target.closest("[data-executive-refresh]")) load();
      if (event.target.closest("[data-executive-export]")) exportTables();
      const tableExport = event.target.closest("[data-executive-export-table]");
      if (tableExport) exportTables(Number(tableExport.dataset.executiveExportTable));
    });
    node("[data-executive-year]").addEventListener("change", load);
    node("[data-executive-customer]")?.addEventListener("change", load);
    node("[data-executive-group]")?.addEventListener("change", load);
    async function loadCustomers() {
      const select = node("[data-executive-customer]");
      if (!select) return;
      try {
        const response = await fetch('/modules/api/dashboard/executive/sales/customers', { headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(15000) });
        const rows = await response.json();
        if (!response.ok) throw new Error(rows.message || "Daftar customer gagal dimuat.");
        select.innerHTML = '<option value="">Semua customer</option>' + rows.map(row => `<option value="${escapeHtml(row.customerCode)}">${escapeHtml(row.customerCode)} — ${escapeHtml(row.customerName)}</option>`).join('');
      } catch (error) { select.title = error.message; setError(error.message); }
    }
    loadCustomers();
    const refreshTimer = setInterval(() => { if (!document.hidden && !root.closest('[data-dashboard-panel][hidden]') && !root.classList.contains('is-loading')) load(); }, 30000);
    window.addEventListener('pagehide', () => { clearInterval(refreshTimer); state.controller?.abort(); }, { once: true });
    node("[data-executive-basis]").addEventListener("change", (event) => { state.actualBasis = event.target.value || "BOOKED"; load(); });
    root.addEventListener("executive-dashboard:activate", () => {
      if (state.payload) renderChart();
      else load();
    });
    if (!root.closest("[data-dashboard-panel][hidden]")) load();
  }

  document.querySelectorAll("[data-executive-dashboard]").forEach(createDashboard);
})();
