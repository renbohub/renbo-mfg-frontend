(function () {
  "use strict";

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const qty = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(number(value));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const demandModel = window.PpicYearlyDemandModel;
  const config = JSON.parse($("yd-page-config")?.textContent || "{}");
  const state = { year: Number(config.currentYear) || (globalThis.erpBusinessNow?.() || new Date()).getFullYear(), customerCode: "", q: "", page: 1, pageSize: 25, payload: null, requestId: 0, editing: null };
  let searchTimer = null;
  const expandedParts = new Set();

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
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
    $("yd-head").innerHTML = '<tr><th scope="col" class="yd-part-number">Part Number / Code</th><th scope="col" class="yd-part-name">Nama part / customer</th>' + payload.months.map(month => '<th scope="col">' + monthNames[month.index - 1] + '</th>').join('') + '<th scope="col" class="yd-annual-total">Total EFD</th></tr>';
  }

  function metricCell(row, month, type) {
    const metric = row.months[month.key] || {};
    if (type === "lockedEfd") {
      if (!metric.lock?.locked) return '<td class="yd-value lockedEfd is-empty">—</td>';
      return `<td class="yd-value lockedEfd"><button type="button" data-open-lock data-part="${esc(row.partCode)}" data-month="${esc(month.key)}" title="Lihat baseline EFD terkunci"><span>${qty(demandModel.displayMetricValue(metric, type))}</span><small>🔒</small></button></td>`;
    }
    if (type === "additional") {
      if (!metric.lock?.locked) return '<td class="yd-value additional is-empty">—</td>';
      const status = demandModel.coverageStatus(metric);
      const value = demandModel.displayMetricValue(metric, type);
      return `<td class="yd-value additional ${value === 0 ? "is-zero" : "has-additional"}"><button type="button" data-open-add data-part="${esc(row.partCode)}" data-month="${esc(month.key)}" title="${esc(status.label)}"><span>${qty(value)}</span><small class="${esc(status.key.toLowerCase())}">${esc(status.label)}</small></button></td>`;
    }
    if (type === "current") {
      const value = demandModel.displayMetricValue(metric, type);
      return `<td class="yd-value current ${value === 0 ? "is-zero" : ""}">${qty(value)}</td>`;
    }
    const value = number(metric[type]);
    if (type !== "efd") return `<td class="yd-value ${type} ${value === 0 ? "is-zero" : ""}">${qty(value)}</td>`;
    if (metric.lock?.locked) return `<td class="yd-value eff is-locked"><button type="button" data-open-lock data-part="${esc(row.partCode)}" data-month="${esc(month.key)}" title="EFD sudah dikunci"><span>${qty(metric.lock.lockedEfd)}</span><small>🔒</small></button></td>`;
    const overridden = Boolean(metric.efdOverride);
    const sourceLabel = ({ MANUAL: "Manual", FORECAST_FALLBACK: "Forecast", FORECAST: "Forecast", ACTUAL_PO: "PO aktual", PO: "PO aktual" })[metric.efdSource] || "Override";
    return `<td class="yd-value eff ${value === 0 ? "is-zero" : ""} ${overridden ? "is-overridden" : ""}"><button type="button" data-edit-efd data-part="${esc(row.partCode)}" data-month="${esc(month.key)}" title="Edit sumber EFD"><span>${qty(value)}</span>${overridden ? `<small>${esc(sourceLabel)}</small>` : ""}</button></td>`;
  }

  function renderBody(payload) {
    const detail = (row) => ['fcc', 'po', 'lockedEfd', 'additional', 'current'].map((key) => `
      <tr class="yd-part-detail">
        <th scope="row" colspan="2" class="yd-detail-label"><span aria-hidden="true">↳</span> ${{ fcc: 'Forecast', po: 'PO firm', lockedEfd: 'EFD terkunci', additional: 'Demand tambahan', current: 'PO terkini' }[key]}</th>
        ${payload.months.map((month) => metricCell(row, month, key)).join('')}
        <td class="yd-detail-total" aria-label="Tidak dijumlahkan">—</td>
      </tr>`).join('');
    $("yd-body").innerHTML = payload.items.map((row) => {
      const expanded = expandedParts.has(row.partCode);
      return `<tr class="yd-part-row ${expanded ? 'is-expanded' : ''}">
        <td class="yd-part-number">
          <button type="button" class="yd-part-toggle" data-expand-part="${esc(row.partCode)}" aria-expanded="${expanded}" title="${expanded ? 'Tutup' : 'Buka'} rincian demand ${esc(row.partNumber || row.partCode)}">
            <span class="yd-part-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span><span>${esc(row.partNumber || row.partCode)}</span>
          </button>
          <small>${esc(row.partCode)} · ${esc(row.uomCode)}</small>
        </td>
        <td class="yd-part-name"><strong title="${esc(row.partName)}">${esc(row.partName)}</strong><small>${esc(row.customerCodes.join(', '))}</small></td>
        ${payload.months.map((month) => metricCell(row, month, 'efd')).join('')}
        <td class="yd-value eff yd-annual-total">${qty(row.totals.eff)}</td>
      </tr>${expanded ? detail(row) : ''}`;
    }).join('') || '<tr><td colspan="15" class="yd-empty">Belum ada demand pada filter ini.</td></tr>';
    // Backend summary is over the complete filtered result; do not label a page
    // subtotal as the total of all records or add quantities of unlike units.
    $("yd-foot").innerHTML = '';
  }

  function renderSummary(payload) {
    $("yd-total-fcc").textContent = qty(payload.totals.fcc);
    $("yd-total-po").textContent = qty(payload.totals.po);
    $("yd-total-eff").textContent = qty(payload.totals.eff);
    $("yd-consumed-fcc").textContent = qty(payload.totals.consumedFcc);
    $("yd-part-count").textContent = `${payload.summary.partCount} part`;
    $("yd-customer-count").textContent = `${payload.summary.customerCount} customer`;
    $("yd-coverage").textContent = `${qty(payload.summary.forecastCoveragePercent)}% dari EFD`;
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

  $("yd-body").addEventListener("click", event => { const button=event.target.closest("[data-expand-part]"); if(!button)return; const key=button.dataset.expandPart; expandedParts.has(key)?expandedParts.delete(key):expandedParts.add(key); renderBody(state.payload); });

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
      $("yd-body").innerHTML = `<tr><td class="yd-empty" colspan="15"><strong>Yearly Demand gagal dimuat.</strong><span>${esc(error.message)}</span><button type="button" id="yd-retry">Coba lagi</button></td></tr>`;
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

  function closeCoverage() {
    $("yd-coverage-drawer").classList.remove("is-open");
    $("yd-coverage-drawer").setAttribute("aria-hidden", "true");
  }

  async function openCoverage(partCode, month, focus = "additional") {
    const row = state.payload?.items.find((item) => item.partCode === partCode);
    const metric = row?.months?.[month];
    if (!row || !metric?.lock?.locked) return;
    const monthLabel = `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
    $("yd-coverage-title").textContent = `${focus === "lock" ? "Baseline terkunci" : "Coverage ADD"} · ${row.partNumber || row.partCode}`;
    $("yd-coverage-meta").textContent = `${row.partName || "-"} · ${monthLabel} · ${row.uomCode}`;
    $("yd-coverage-body").innerHTML = '<p class="yd-source-empty">Memuat ledger coverage…</p>';
    $("yd-coverage-drawer").classList.add("is-open");
    $("yd-coverage-drawer").setAttribute("aria-hidden", "false");
    try {
      const params = new URLSearchParams({ month, partCode });
      if (state.customerCode) params.set("customerCode", state.customerCode);
      const payload = await api(`/modules/api/planning-ppic/demand-planning/yearly/additional-coverage?${params}`);
      const aggregate = payload.aggregate || {};
      const links = demandModel.baselineLinks({ lock: {
        locked: true,
        baselineMpsNumbers: aggregate.baselineMpsNumbers || [],
        baselineMrpNumbers: aggregate.baselineMrpNumbers || [],
      } });
      $("yd-coverage-body").innerHTML = `
        <section class="yd-coverage-summary">
          <article><span>EFD Locked</span><strong>${qty(aggregate.lockedEfdQty)}</strong></article>
          <article><span>Current SO</span><strong>${qty(aggregate.currentSoQty)}</strong></article>
          <article class="is-add"><span>ADD</span><strong>${qty(aggregate.additionalQty)}</strong></article>
          <article class="is-pending"><span>Pending Delta</span><strong>${qty(aggregate.pendingDeltaQty)}</strong></article>
        </section>
        <section class="yd-coverage-waterfall">
          <h3>Urutan coverage resmi</h3>
          <div><span>1 · Free FG Stock</span><strong>${qty(aggregate.coveredFgStockQty)}</strong></div>
          <div><span>2 · Firm FG Receipt</span><strong>${qty(aggregate.coveredFirmReceiptQty)}</strong></div>
          <div><span>3 · Delta MPS</span><strong>${qty(aggregate.generatedDeltaQty)}</strong></div>
          <div class="is-uncovered"><span>4 · Uncovered</span><strong>${qty(aggregate.uncoveredQty)}</strong></div>
        </section>
        <section class="yd-coverage-documents"><h3>Dokumen baseline</h3><div>${links.length ? links.map((link) => `<a href="${esc(link.href)}"><span>${esc(link.type)}</span>${esc(link.number)}</a>`).join("") : '<p class="yd-source-empty">Belum ada dokumen baseline tertaut.</p>'}</div></section>
        <section class="yd-coverage-scopes"><h3>Customer dan delivery phase</h3>${(payload.items || []).map((item) => `
          <article>
            <header><div><strong>${esc(item.customerCode)}</strong><small>Locked oleh ${esc(item.lock?.lockedBy || "system")}</small></div><b>${qty(item.additionalQty)} ADD</b></header>
            <div class="yd-coverage-sources">${(item.sourceSalesOrders || []).length ? item.sourceSalesOrders.map((source) => `<span><b>${esc(source.sourceNumber)}</b> · Phase ${esc(source.phaseNumber)} · ${qty(source.qty)} ${esc(source.uomCode || item.uomCode || "")}</span>`).join("") : '<span>Belum ada SO aktif pada scope ini.</span>'}</div>
            ${number(item.reductionQty) > 0 ? `<div class="yd-cut-zone" data-cut-zone="${esc(item.baselineLockId)}"><p>SO current lebih kecil ${qty(item.reductionQty)} dari EFD locked.</p><button type="button" class="yd-cut-preview" data-preview-cut="${esc(item.baselineLockId)}" data-cut-qty="${number(item.reductionQty)}">Preview Production Cut</button></div>` : ""}
          </article>`).join("") || '<p class="yd-source-empty">Tidak ada scope coverage.</p>'}</section>`;
    } catch (error) {
      $("yd-coverage-body").innerHTML = `<p class="yd-source-empty">${esc(error.message)}</p>`;
    }
  }

  function openEfdModal(partCode, month) {
    const row = state.payload?.items.find((item) => item.partCode === partCode);
    const metric = row?.months?.[month];
    if (!row || !metric) return;
    if (metric.lock?.locked) return openCoverage(partCode, month, "lock");
    state.editing = { row, metric, month };
    $("yd-efd-part").textContent = row.partNumber || row.partCode;
    $("yd-efd-name").textContent = row.partName || "-";
    $("yd-efd-month").textContent = `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
    $("yd-po-preview").textContent = `Preview: PO Qty = ${qty(metric.po)} → EFD = ${qty(metric.po || metric.fcc)}`;
    $("yd-fct-preview").textContent = `Preview: FCT Qty = ${qty(metric.fcc)} → EFD = ${qty(metric.fcc)}`;
    const source = metric.efdOverride?.source || (metric.efdSource === "MANUAL" ? "MANUAL" : metric.efdSource?.startsWith("PO") ? "PO" : "FORECAST");
    document.querySelectorAll('input[name="efdSource"]').forEach((input) => { input.checked = input.value === source; });
    $("yd-manual-qty").value = source === "MANUAL" ? number(metric.efdOverride?.manualQty ?? metric.efd) : "";
    $("yd-reset-efd").hidden = !metric.efdOverride;
    $("yd-efd-modal").setAttribute("aria-hidden", "false");
  }

  function closeEfdModal() { $("yd-efd-modal").setAttribute("aria-hidden", "true"); state.editing = null; }
  function openRuleModal() {
    const mode = state.payload?.efdRule?.mode || "PO_THEN_FORECAST";
    document.querySelectorAll('input[name="ruleMode"]').forEach((input) => { input.checked = input.value === mode; });
    $("yd-rule-modal").setAttribute("aria-hidden", "false");
  }
  function closeRuleModal() { $("yd-rule-modal").setAttribute("aria-hidden", "true"); }

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
      const columns = ["Part Number", "Part Code", "Part Name", "Customer", "UOM", ...monthNames.flatMap((month) => [`${month} FCT`, `${month} PO`, `${month} EFD`]), "Total FCT", "Total PO", "Total EFD"];
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
  $("yd-rule-open").addEventListener("click", openRuleModal);
  $("yd-density-toggle")?.addEventListener("click", (event) => {
    const card = document.querySelector(".yd-matrix-card");
    const compact = !card.classList.contains("is-compact");
    card.classList.toggle("is-compact", compact);
    event.currentTarget.classList.toggle("is-active", compact);
    event.currentTarget.setAttribute("aria-pressed", String(compact));
    event.currentTarget.title = compact ? "Gunakan tampilan nyaman" : "Gunakan tampilan ringkas";
  });
  $("yd-body").addEventListener("click", (event) => {
    const coverageButton = event.target.closest("[data-open-add], [data-open-lock]");
    if (coverageButton) return openCoverage(coverageButton.dataset.part, coverageButton.dataset.month, coverageButton.hasAttribute("data-open-lock") ? "lock" : "additional");
    const button = event.target.closest("[data-edit-efd]");
    if (button) openEfdModal(button.dataset.part, button.dataset.month);
  });
  $("yd-coverage-body").addEventListener("click", async (event) => {
    const previewButton = event.target.closest("[data-preview-cut]");
    if (previewButton) {
      const zone = previewButton.closest("[data-cut-zone]");
      previewButton.disabled = true;
      try {
        const preview = await api("/modules/api/planning-ppic/mps/production-cut/preview", { method: "POST", body: JSON.stringify({ baselineLockId: previewButton.dataset.previewCut, requestedQty: number(previewButton.dataset.cutQty) }) });
        const summary = preview.summary || {};
        zone.innerHTML = `<div class="yd-cut-preview-result"><b>Dapat dikurangi ${qty(summary.approvedCutQty)}</b><span>Qty produksi/WIP terlindungi ${qty(summary.protectedProductionQty)}</span>${summary.hasSupplierPoWarning ? `<strong>Supplier PO ${qty(summary.supplierPoQty)} sudah terbit dan tidak akan diubah.</strong>` : ""}</div><form data-create-cut="${esc(previewButton.dataset.previewCut)}" data-cut-fingerprint="${esc(preview.sourceFingerprint)}"><label>Qty cut<input type="number" min="0" max="${number(summary.approvedCutQty)}" step="0.001" value="${number(summary.approvedCutQty)}" required></label><label>Alasan<textarea minlength="10" required placeholder="Jelaskan alasan pengurangan produksi…"></textarea></label><button type="submit">Ajukan Production Cut</button></form>`;
      } catch (error) { zone.insertAdjacentHTML("beforeend", `<p class="yd-cut-error">${esc(error.message)}</p>`); previewButton.disabled = false; }
      return;
    }
    const approveButton = event.target.closest("[data-approve-cut]");
    if (approveButton) {
      approveButton.disabled = true;
      try {
        const result = await api(`/modules/api/planning-ppic/mps/production-cut/${encodeURIComponent(approveButton.dataset.approveCut)}/approve`, { method: "PATCH", body: "{}" });
        approveButton.closest("[data-cut-zone]").innerHTML = `<p class="yd-cut-success">${esc(result.adjustmentNumber)} diterapkan: ${qty(result.appliedQty)} qty produksi dikurangi. Qty produced/WIP dan supplier PO tetap terlindungi.</p>`;
        await load();
      } catch (error) { approveButton.insertAdjacentHTML("beforebegin", `<p class="yd-cut-error">${esc(error.message)}</p>`); approveButton.disabled = false; }
    }
  });
  $("yd-coverage-body").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-create-cut]");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await api("/modules/api/planning-ppic/mps/production-cut", { method: "POST", body: JSON.stringify({ baselineLockId: form.dataset.createCut, requestedQty: number(form.querySelector("input").value), expectedFingerprint: form.dataset.cutFingerprint, reason: form.querySelector("textarea").value.trim() }) });
      const adjustment = result.adjustment;
      form.closest("[data-cut-zone]").innerHTML = `<p><b>${esc(adjustment.adjustmentNumber)}</b> menunggu approval.</p><button type="button" class="yd-cut-approve" data-approve-cut="${esc(adjustment.adjustmentNumber)}">Approve &amp; Apply Cut ${qty(result.preview?.summary?.approvedCutQty)}</button>`;
    } catch (error) { form.insertAdjacentHTML("afterbegin", `<p class="yd-cut-error">${esc(error.message)}</p>`); button.disabled = false; }
  });
  $("yd-efd-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.editing) return;
    const source = document.querySelector('input[name="efdSource"]:checked')?.value;
    if (!source) return showAlert("Pilih sumber EFD terlebih dahulu.");
    const manualQty = number($("yd-manual-qty").value);
    if (source === "MANUAL" && $("yd-manual-qty").value === "") return showAlert("Masukkan nilai EFD manual.");
    $("yd-save-efd").disabled = true;
    try {
      const body = { partCode: state.editing.row.partCode, month: state.editing.month, source, ...(source === "MANUAL" ? { manualQty } : {}) };
      const result = await api("/modules/api/planning-ppic/demand-planning/yearly/efd", { method: "PUT", body: JSON.stringify(body) });
      closeEfdModal(); showAlert(result.message); await load();
    } catch (error) { showAlert(error.message); }
    finally { $("yd-save-efd").disabled = false; }
  });
  $("yd-reset-efd").addEventListener("click", async () => {
    if (!state.editing) return;
    $("yd-reset-efd").disabled = true;
    try {
      const result = await api("/modules/api/planning-ppic/demand-planning/yearly/efd", { method: "DELETE", body: JSON.stringify({ partCode: state.editing.row.partCode, month: state.editing.month }) });
      closeEfdModal(); showAlert(result.message); await load();
    } catch (error) { showAlert(error.message); }
    finally { $("yd-reset-efd").disabled = false; }
  });
  $("yd-rule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = document.querySelector('input[name="ruleMode"]:checked')?.value;
    if (!mode) return;
    $("yd-save-rule").disabled = true;
    try {
      const result = await api("/modules/api/planning-ppic/demand-planning/yearly/rule", { method: "PUT", body: JSON.stringify({ mode }) });
      closeRuleModal(); showAlert(result.message); await load();
    } catch (error) { showAlert(error.message); }
    finally { $("yd-save-rule").disabled = false; }
  });
  document.querySelectorAll("[data-close-efd]").forEach((button) => button.addEventListener("click", closeEfdModal));
  document.querySelectorAll("[data-close-rule]").forEach((button) => button.addEventListener("click", closeRuleModal));
  document.querySelectorAll("[data-close-lineage]").forEach((button) => button.addEventListener("click", closeLineage));
  document.querySelectorAll("[data-close-coverage]").forEach((button) => button.addEventListener("click", closeCoverage));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeLineage(); closeCoverage(); closeEfdModal(); closeRuleModal(); } });

  initYears();
  load();
})();
