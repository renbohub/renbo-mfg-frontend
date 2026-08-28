(function () {
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const state = { report: null, rows: [], requestId: 0 };
  let searchTimer = null;

  const elements = {
    client: document.getElementById("outgoing-client-select"),
    fg: document.getElementById("outgoing-fg-select"),
    months: document.getElementById("outgoing-history-months"),
    search: document.getElementById("outgoing-report-search"),
    alert: document.getElementById("outgoing-report-alert"),
    head: document.getElementById("outgoing-matrix-thead"),
    body: document.getElementById("outgoing-matrix-tbody"),
    count: document.getElementById("outgoing-report-count"),
    title: document.getElementById("outgoing-matrix-title"),
    export: document.getElementById("outgoing-report-export"),
  };

  const escape = (value) => shared.escapeHtml(value ?? "");
  const qty = (value, uomCode = "PCS") => shared.formatQuantity(value, uomCode, { maximumFractionDigits: 2 });
  const date = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
  };
  const monthLabel = (key) => {
    const parsed = new Date(`${key}-01T00:00:00Z`);
    return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
  };
  const option = (value, label, selected = false) => `<option value="${escape(value)}"${selected ? " selected" : ""}>${escape(label)}</option>`;

  function setAlert(message = "") {
    elements.alert.textContent = message;
    elements.alert.classList.toggle("d-none", !message);
  }

  function renderFilters() {
    const selectedClient = elements.client.value;
    const customers = state.report?.filterOptions?.customers || [];
    elements.client.innerHTML = '<option value="">Pilih client...</option>' + customers.map((row) => option(row.customerCode, `${row.customerCode} — ${row.customerName}`, row.customerCode === selectedClient)).join("");
    elements.client.value = customers.some((row) => row.customerCode === selectedClient) ? selectedClient : "";

    const selectedFg = elements.fg.value;
    const finishedGoods = state.report?.filterOptions?.finishedGoods || [];
    elements.fg.innerHTML = '<option value="">Semua FG client</option>' + finishedGoods.map((row) => option(row.partCode, [row.partNumber, row.partCode, row.partName].filter(Boolean).join(" — "), row.partCode === selectedFg)).join("");
    elements.fg.disabled = !elements.client.value || !finishedGoods.length;
    elements.fg.value = finishedGoods.some((row) => row.partCode === selectedFg) ? selectedFg : "";
  }

  function renderSummary() {
    const summary = state.report?.summary || {};
    document.getElementById("outgoing-summary-fg").textContent = new Intl.NumberFormat("id-ID").format(number(summary.finishedGoods));
    document.getElementById("outgoing-summary-delivered").textContent = `${qty(summary.deliveredQty)} PCS`;
    document.getElementById("outgoing-summary-free").textContent = `${qty(summary.fgFreeQty)} PCS`;
    document.getElementById("outgoing-summary-next").textContent = `${qty(summary.nextPlannedQty)} PCS`;
  }

  function stockBreakdown(rows) {
    if (!Array.isArray(rows) || !rows.length) return '<span class="outgoing-stock-empty">—</span>';
    return `<div class="outgoing-stock-list">${rows.map((row) => `<span><b>${escape(qty(row.qty, row.uomCode))}</b> ${escape(row.uomCode)}</span>`).join("")}</div>`;
  }

  function deliveryCell(delivery, type) {
    if (!delivery) return `<span class="outgoing-delivery-empty">${type === "next" ? "Belum ada planning" : "Belum ada history"}</span>`;
    const status = type === "next" ? `<em>${escape(delivery.status || "Scheduled")}</em>` : "";
    return `<div class="outgoing-delivery-cell"><strong>${escape(date(delivery.date))}</strong><span>${escape(qty(delivery.qty))} PCS</span><a href="/modules/outgoing/delivery-schedules/${encodeURIComponent(delivery.scheduleNumber)}">${escape(delivery.scheduleNumber)}</a>${status}</div>`;
  }

  function renderMatrix() {
    const periods = state.report?.historyPeriods || [];
    const stockColumnCount = 5;
    elements.head.innerHTML = `<tr class="outgoing-matrix-groups"><th colspan="3">Finished Goods</th><th colspan="${Math.max(periods.length, 1)}">History Delivery</th><th rowspan="2">Total<br>Delivered</th><th colspan="${stockColumnCount}">Stock Context</th><th colspan="2">Delivery Control</th></tr><tr><th>P/N</th><th>Part Code</th><th>Part Name</th>${periods.map((period) => `<th>${escape(monthLabel(period.key))}</th>`).join("") || "<th>Periode</th>"}<th>Material<br>Available</th><th>WIP<br>On Hand</th><th>FG<br>On Hand</th><th>FG<br>Reserved</th><th>FG<br>Free</th><th>Last Delivery</th><th>Planning Delivery<br>Selanjutnya</th></tr>`;
    const totalColumns = 3 + Math.max(periods.length, 1) + 1 + stockColumnCount + 2;
    if (!elements.client.value) {
      elements.body.innerHTML = `<tr><td colspan="${totalColumns}" class="outgoing-matrix-empty"><strong>Pilih client terlebih dahulu</strong><span>Matrix akan menampilkan Finished Goods milik client yang dipilih.</span></td></tr>`;
      elements.title.textContent = "Pilih client untuk menampilkan matrix";
      elements.count.innerHTML = "<i></i> Menunggu client";
      elements.export.disabled = true;
      return;
    }
    const selectedClientLabel = elements.client.options[elements.client.selectedIndex]?.textContent || elements.client.value;
    const selectedFgLabel = elements.fg.value ? elements.fg.options[elements.fg.selectedIndex]?.textContent : "Semua FG";
    elements.title.textContent = `${selectedClientLabel} · ${selectedFgLabel}`;
    elements.count.innerHTML = `<i></i> ${new Intl.NumberFormat("id-ID").format(state.rows.length)} FG`;
    elements.export.disabled = !state.rows.length;
    elements.body.innerHTML = state.rows.map((row) => `<tr>
      <td class="outgoing-part-number"><strong>${escape(row.partNumber || "—")}</strong><small>${escape(row.uomCode || "PCS")}</small></td>
      <td><a class="outgoing-part-link" href="/master-data/parts/${encodeURIComponent(row.partCode || "")}">${escape(row.partCode || "—")}</a></td>
      <td class="outgoing-part-name">${escape(row.partName || "—")}<span class="outgoing-stock-status">${escape(row.stockStatus || "NO STOCK DATA")}</span></td>
      ${periods.map((period) => `<td class="outgoing-history-cell${number(row.history?.[period.key]) ? " has-value" : ""}">${number(row.history?.[period.key]) ? escape(qty(row.history[period.key], row.uomCode)) : "—"}</td>`).join("") || '<td class="outgoing-history-cell">—</td>'}
      <td class="outgoing-history-total">${escape(qty(row.historyTotalQty, row.uomCode))}</td>
      <td>${stockBreakdown(row.materialAvailable)}</td>
      <td>${stockBreakdown(row.wipOnHand)}</td>
      <td>${stockBreakdown(row.fgOnHand)}</td>
      <td>${stockBreakdown(row.fgReserved)}</td>
      <td class="outgoing-fg-free">${stockBreakdown(row.fgFree)}</td>
      <td>${deliveryCell(row.lastDelivery, "last")}</td>
      <td>${deliveryCell(row.nextDelivery, "next")}</td>
    </tr>`).join("") || `<tr><td colspan="${totalColumns}" class="outgoing-matrix-empty"><strong>Tidak ada Finished Goods</strong><span>Ubah client, pilihan FG, atau kata pencarian.</span></td></tr>`;
  }

  function exportCsv() {
    const periods = state.report?.historyPeriods || [];
    const stockText = (rows) => (rows || []).map((row) => `${qty(row.qty, row.uomCode)} ${row.uomCode}`).join(" | ");
    const deliveryText = (delivery) => delivery ? `${date(delivery.date)} | ${qty(delivery.qty)} PCS | ${delivery.scheduleNumber}` : "";
    const headers = ["P/N", "Part Code", "Part Name", ...periods.map((period) => `Delivery ${monthLabel(period.key)}`), "Total Delivered", "Material Available", "WIP On Hand", "FG On Hand", "FG Reserved", "FG Free", "Last Delivery", "Planning Delivery Selanjutnya"];
    const rows = state.rows.map((row) => [row.partNumber, row.partCode, row.partName, ...periods.map((period) => row.history?.[period.key] || 0), row.historyTotalQty, stockText(row.materialAvailable), stockText(row.wipOnHand), stockText(row.fgOnHand), stockText(row.fgReserved), stockText(row.fgFree), deliveryText(row.lastDelivery), deliveryText(row.nextDelivery)]);
    shared.downloadCsv(`outgoing-delivery-matrix-${elements.client.value}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  async function load() {
    const requestId = ++state.requestId;
    setAlert("");
    const query = new URLSearchParams({ start: "0", length: "500", historyMonths: elements.months.value });
    if (elements.client.value) query.set("customerCode", elements.client.value);
    if (elements.fg.value) query.set("fgPartCode", elements.fg.value);
    if (elements.search.value.trim()) query.set("q", elements.search.value.trim());
    elements.count.innerHTML = "<i></i> Memuat...";
    try {
      const response = await fetch(`/modules/api/outgoing/outgoing-report?${query}`, { headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== state.requestId) return;
      if (!response.ok) throw new Error(payload.message || "Outgoing Report gagal dimuat.");
      state.rows = Array.isArray(payload.data) ? payload.data : [];
      state.report = payload.report || { items: state.rows, filterOptions: {}, historyPeriods: [], summary: {} };
      renderFilters();
      renderSummary();
      renderMatrix();
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.rows = [];
      setAlert(error.message || "Outgoing Report gagal dimuat.");
      renderSummary();
      renderMatrix();
    }
  }

  elements.client.addEventListener("change", () => { elements.fg.value = ""; load(); });
  elements.fg.addEventListener("change", load);
  elements.months.addEventListener("change", load);
  elements.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 300); });
  document.getElementById("outgoing-report-refresh").addEventListener("click", load);
  elements.export.addEventListener("click", exportCsv);
  load();
})();
