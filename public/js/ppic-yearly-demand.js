(function () {
  "use strict";

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const qty = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(number(value));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const config = JSON.parse($("yd-page-config")?.textContent || "{}");
  const state = { year: Number(config.currentYear) || new Date().getFullYear(), customerCode: "", q: "", page: 1, pageSize: 25, payload: null, requestId: 0 };
  let searchTimer = null;

  async function api(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Permintaan gagal (${response.status})`);
    return payload;
  }

  function initYears() {
    const select = $("yd-year");
    const years = [];
    for (let year = state.year - 3; year <= state.year + 3; year += 1) years.push(year);
    select.innerHTML = years.map((year) => `<option value="${year}" ${year === state.year ? "selected" : ""}>${year}</option>`).join("");
  }

  function setBusy(busy) {
    document.body.classList.toggle("yd-is-loading", busy);
    $("yd-export").disabled = busy;
    if (busy) $("yd-result-meta").textContent = "Mengambil FCC, PO, dan menjalankan netting…";
  }

  function showAlert(message = "") {
    const alert = $("yd-alert");
    alert.hidden = !message;
    alert.textContent = message;
  }

  function updateCustomerOptions(options = []) {
    const select = $("yd-customer");
    const current = state.customerCode;
    const signature = JSON.stringify(options);
    if (select.dataset.optionSignature === signature) return;
    select.dataset.optionSignature = signature;
    select.innerHTML = `<option value="">Semua customer</option>${options.map((code) => `<option value="${esc(code)}">${esc(code)}</option>`).join("")}`;
    select.value = current;
  }

  function renderHead(payload) {
    $("yd-head").innerHTML = `
      <tr class="yd-month-head">
        <th rowspan="2" class="yd-part-number">Part Number</th>
        <th rowspan="2" class="yd-part-name">Part Name</th>
        ${payload.months.map((month) => `<th colspan="3">${monthNames[month.index - 1]}<small>${payload.year}</small></th>`).join("")}
        <th colspan="3" class="yd-total-head">Total ${payload.year}</th>
      </tr>
      <tr class="yd-metric-head">
        ${payload.months.map(() => '<th class="fcc">FCC</th><th class="po">PO</th><th class="eff">EFF</th>').join("")}
        <th class="fcc yd-total-col">FCC</th><th class="po">PO</th><th class="eff">EFF</th>
      </tr>`;
  }

  function metricCell(row, month, type) {
    const metric = row.months[month.key] || {};
    const value = number(metric[type]);
    if (type !== "eff") return `<td class="yd-value ${type} ${value === 0 ? "is-zero" : ""}">${qty(value)}</td>`;
    return `<td class="yd-value eff ${value === 0 ? "is-zero" : ""}"><button type="button" data-lineage data-part="${esc(row.partCode)}" data-month="${esc(month.key)}" title="Lihat formula dan sumber EFF">${qty(value)}</button></td>`;
  }

  function renderBody(payload) {
    if (!payload.items.length) {
      $("yd-body").innerHTML = '<tr><td class="yd-empty" colspan="41"><strong>Belum ada demand pada filter ini.</strong><span>Coba ganti tahun, customer, atau kata pencarian.</span></td></tr>';
      $("yd-foot").innerHTML = "";
      return;
    }
    $("yd-body").innerHTML = payload.items.map((row) => `
      <tr>
        <td class="yd-part-number"><strong>${esc(row.partNumber || row.partCode)}</strong><small>${esc(row.partCode)} · ${esc(row.planningPolicy)} · ${esc(row.uomCode)}</small></td>
        <td class="yd-part-name"><strong>${esc(row.partName || "-")}</strong><small>${esc(row.customerCodes.join(", ") || "Tanpa customer")}</small></td>
        ${payload.months.map((month) => metricCell(row, month, "fcc") + metricCell(row, month, "po") + metricCell(row, month, "eff")).join("")}
        <td class="yd-value fcc yd-total-col"><strong>${qty(row.totals.fcc)}</strong></td>
        <td class="yd-value po"><strong>${qty(row.totals.po)}</strong></td>
        <td class="yd-value eff"><strong>${qty(row.totals.eff)}</strong></td>
      </tr>`).join("");
    $("yd-foot").innerHTML = `
      <tr>
        <th colspan="2">Total semua hasil filter</th>
        ${payload.months.map((month) => {
          const total = payload.items.reduce((sum, row) => {
            const metric = row.months[month.key] || {};
            sum.fcc += number(metric.fcc); sum.po += number(metric.po); sum.eff += number(metric.eff);
            return sum;
          }, { fcc: 0, po: 0, eff: 0 });
          return `<td class="fcc">${qty(total.fcc)}</td><td class="po">${qty(total.po)}</td><td class="eff">${qty(total.eff)}</td>`;
        }).join("")}
        <td class="fcc yd-total-col">${qty(payload.totals.fcc)}</td>
        <td class="po">${qty(payload.totals.po)}</td>
        <td class="eff">${qty(payload.totals.eff)}</td>
      </tr>`;
  }

  function renderSummary(payload) {
    $("yd-total-fcc").textContent = qty(payload.totals.fcc);
    $("yd-total-po").textContent = qty(payload.totals.po);
    $("yd-total-eff").textContent = qty(payload.totals.eff);
    $("yd-consumed-fcc").textContent = qty(payload.totals.consumedFcc);
    $("yd-part-count").textContent = `${payload.summary.partCount} part`;
    $("yd-customer-count").textContent = `${payload.summary.customerCount} customer`;
    $("yd-coverage").textContent = `${qty(payload.summary.forecastCoveragePercent)}% dari EFF`;
    $("yd-matrix-title").textContent = `Demand ${payload.year}`;
    const page = payload.pagination;
    const start = page.total ? (page.page - 1) * page.pageSize + 1 : 0;
    const end = Math.min(page.page * page.pageSize, page.total);
    $("yd-result-meta").textContent = `Menampilkan ${qty(start)}–${qty(end)} dari ${qty(page.total)} part · angka dalam UOM masing-masing part`;
    $("yd-range").textContent = `${qty(start)}–${qty(end)} dari ${qty(page.total)} data`;
    $("yd-page-label").textContent = `Halaman ${page.page} / ${page.totalPages}`;
    $("yd-prev").disabled = page.page <= 1;
    $("yd-next").disabled = page.page >= page.totalPages;
    $("yd-formula-expression").textContent = payload.formula.monthlyExpression;
    $("yd-formula-rules").innerHTML = payload.formula.rules.map((rule) => `<li>${esc(rule)}</li>`).join("");
  }

  function render(payload) {
    state.payload = payload;
    updateCustomerOptions(payload.filters.customerOptions);
    renderHead(payload);
    renderBody(payload);
    renderSummary(payload);
  }

  async function load() {
    const requestId = ++state.requestId;
    setBusy(true);
    showAlert();
    const params = new URLSearchParams({ year: state.year, page: state.page, pageSize: state.pageSize });
    if (state.customerCode) params.set("customerCode", state.customerCode);
    if (state.q) params.set("q", state.q);
    try {
      const payload = await api(`/modules/api/planning-ppic/demand-planning/yearly?${params}`);
      if (requestId !== state.requestId) return;
      render(payload);
    } catch (error) {
      if (requestId !== state.requestId) return;
      showAlert(error.message);
      $("yd-body").innerHTML = `<tr><td class="yd-empty" colspan="41"><strong>Yearly Demand gagal dimuat.</strong><span>${esc(error.message)}</span><button type="button" id="yd-retry">Coba lagi</button></td></tr>`;
      $("yd-retry")?.addEventListener("click", load);
    } finally {
      if (requestId === state.requestId) setBusy(false);
    }
  }

  function sourceList(summary, emptyText) {
    if (!summary?.count) return `<p class="yd-source-empty">${esc(emptyText)}</p>`;
    return `<div class="yd-source-tags">${summary.values.map((value) => `<span>${esc(value)}</span>`).join("")}${summary.truncated ? `<em>+${summary.count - summary.values.length} sumber</em>` : ""}</div>`;
  }

  function openLineage(partCode, month) {
    const row = state.payload?.items.find((item) => item.partCode === partCode);
    const metric = row?.months?.[month];
    if (!row || !metric) return;
    const label = monthNames[Number(month.slice(5, 7)) - 1];
    $("yd-lineage-title").textContent = `${row.partNumber || row.partCode} · ${label} ${month.slice(0, 4)}`;
    $("yd-lineage-meta").textContent = `${row.partName || "-"} · ${row.customerCodes.join(", ") || "Tanpa customer"} · ${row.uomCode}`;
    $("yd-lineage-body").innerHTML = `
      <section class="yd-lineage-equation">
        <div><span>FCC</span><strong>${qty(metric.fcc)}</strong></div>
        <i>−</i>
        <div><span>Consumed</span><strong>${qty(metric.consumedFcc)}</strong></div>
        <i>+</i>
        <div><span>PO efektif</span><strong>${qty(metric.poEffective)}</strong></div>
        <i>=</i>
        <div class="result"><span>EFF</span><strong>${qty(metric.eff)}</strong></div>
      </section>
      <p class="yd-equation-note">PO efektif = PO ${qty(metric.po)} + pull-in ${qty(metric.poPullIn)} − pull-out ${qty(metric.poPullOut)}. Cross-month netting mengikuti target paling awal.</p>
      <section class="yd-lineage-grid">
        <article><header><span>FCC source</span><b>${metric.lineage.fccSources.count} dokumen</b></header>${sourceList(metric.lineage.fccSources, "Tidak ada FCC pada bulan ini.")}</article>
        <article><header><span>PO firm source</span><b>${metric.lineage.poSources.count} dokumen</b></header>${sourceList(metric.lineage.poSources, "Tidak ada PO firm pada bulan ini.")}</article>
        <article><header><span>Effective source</span><b>${metric.lineage.effectiveSources.count} dokumen</b></header>${sourceList(metric.lineage.effectiveSources, "Tidak ada EFF pada bulan ini.")}</article>
      </section>
      <footer><strong>${metric.lineage.matchedPoCount}</strong> alokasi PO berhasil dipasangkan ke FCC pada customer–part yang sama.</footer>`;
    $("yd-lineage").classList.add("is-open");
    $("yd-lineage").setAttribute("aria-hidden", "false");
  }

  function closeLineage() {
    $("yd-lineage").classList.remove("is-open");
    $("yd-lineage").setAttribute("aria-hidden", "true");
  }

  async function exportCsv() {
    if (!state.payload) return;
    $("yd-export").disabled = true;
    $("yd-export").textContent = "Menyiapkan…";
    try {
      const all = [];
      const totalPages = Math.ceil(state.payload.pagination.total / 200);
      for (let page = 1; page <= totalPages; page += 1) {
        const params = new URLSearchParams({ year: state.year, page, pageSize: 200 });
        if (state.customerCode) params.set("customerCode", state.customerCode);
        if (state.q) params.set("q", state.q);
        const payload = await api(`/modules/api/planning-ppic/demand-planning/yearly?${params}`);
        all.push(...payload.items);
      }
      const columns = ["Part Number", "Part Code", "Part Name", "Customer", "UOM", ...monthNames.flatMap((month) => [`${month} FCC`, `${month} PO`, `${month} EFF`]), "Total FCC", "Total PO", "Total EFF"];
      const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = [columns.map(quote).join(",")];
      for (const row of all) {
        const values = [row.partNumber, row.partCode, row.partName, row.customerCodes.join("; "), row.uomCode];
        for (const month of state.payload.months) values.push(row.months[month.key].fcc, row.months[month.key].po, row.months[month.key].eff);
        values.push(row.totals.fcc, row.totals.po, row.totals.eff);
        lines.push(values.map(quote).join(","));
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      link.download = `yearly-demand-${state.year}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      showAlert(error.message);
    } finally {
      $("yd-export").disabled = false;
      $("yd-export").textContent = "Export CSV";
    }
  }

  $("yd-search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = event.target.value.trim(); state.page = 1; load(); }, 300);
  });
  $("yd-customer").addEventListener("change", (event) => { state.customerCode = event.target.value; state.page = 1; load(); });
  $("yd-year").addEventListener("change", (event) => { state.year = Number(event.target.value); state.page = 1; load(); });
  $("yd-page-size").addEventListener("change", (event) => { state.pageSize = Number(event.target.value); state.page = 1; load(); });
  $("yd-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); $("yd-scroll").scrollTo({ left: 0, behavior: "smooth" }); } });
  $("yd-next").addEventListener("click", () => { if (state.page < (state.payload?.pagination.totalPages || 1)) { state.page += 1; load(); $("yd-scroll").scrollTo({ left: 0, behavior: "smooth" }); } });
  $("yd-export").addEventListener("click", exportCsv);
  $("yd-formula-toggle").addEventListener("click", () => {
    const panel = $("yd-formula-panel");
    panel.hidden = !panel.hidden;
    $("yd-formula-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    $("yd-formula-toggle").textContent = panel.hidden ? "Lihat formula" : "Tutup formula";
  });
  document.querySelectorAll("[data-density]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-density]").forEach((item) => item.classList.toggle("is-active", item === button));
    document.querySelector(".yd-matrix-card").classList.toggle("is-compact", button.dataset.density === "compact");
  }));
  $("yd-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-lineage]");
    if (button) openLineage(button.dataset.part, button.dataset.month);
  });
  document.querySelectorAll("[data-close-lineage]").forEach((button) => button.addEventListener("click", closeLineage));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLineage(); });

  initYears();
  load();
})();
