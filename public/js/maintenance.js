(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
  const day = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "—";
  const state = { sourceType: "FORECAST", rows: [], selected: new Set(), preview: null, loading: false, searchTimer: null };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Permintaan maintenance gagal (${response.status}).`);
    return payload;
  }

  function show(message = "", tone = "danger") {
    const target = $("maintenance-alert");
    target.hidden = !message;
    target.textContent = message;
    target.dataset.tone = tone;
  }

  function renderCounts(counts = {}) {
    ["salesOrderHeader", "forecast", "mPS", "mRPRun"].forEach((key) => {
      const node = $(`count-${key}`);
      if (node) node.textContent = num(counts[key]);
    });
  }

  async function loadStatus({ quiet = false } = {}) {
    try {
      const result = await api("/maintenance/api/demand-flow/status");
      renderCounts(result.counts);
      if (!quiet) show("Status data berhasil diperbarui.", "success");
    } catch (error) { show(error.message); }
  }

  function selectedLayers() {
    const layers = new Set([...document.querySelectorAll("[data-reset-layer]:checked")].map((node) => node.value));
    if (layers.has("MPS")) { layers.add("MRP"); layers.add("PRODUCTION_PLAN"); }
    if (layers.has("MRP")) layers.add("PRODUCTION_PLAN");
    document.querySelectorAll("[data-reset-layer]").forEach((node) => { node.checked = layers.has(node.value); });
    return [...layers];
  }

  function invalidatePreview(message = "Preview perlu diperbarui.") {
    state.preview = null;
    $("reset-impact").className = "maintenance-impact empty";
    $("reset-impact").innerHTML = `<p>${esc(message)}</p>`;
    $("reset-reason").disabled = true;
    $("reset-confirmation").disabled = true;
    $("reset-submit").disabled = true;
  }

  function renderSources() {
    const target = $("reset-source-list");
    if (!state.rows.length) {
      target.innerHTML = "<p>Tidak ada sumber demand yang cocok.</p>";
      return;
    }
    target.innerHTML = state.rows.map((row) => {
      const checked = state.selected.has(row.sourceNumber);
      const period = row.periodStart ? `${day(row.periodStart)}${row.periodEnd ? ` – ${day(row.periodEnd)}` : ""}` : "Periode tidak tersedia";
      return `<label class="maintenance-source-option ${checked ? "selected" : ""}" role="option" aria-selected="${checked}">
        <input type="checkbox" data-reset-source="${esc(row.sourceNumber)}" ${checked ? "checked" : ""}>
        <span><b>${esc(row.sourceNumber)}</b><small>${esc(row.label || row.customerCode || "Tanpa nama")} · ${esc(period)}</small></span>
        <em>${esc(row.status || "—")}</em>
      </label>`;
    }).join("");
  }

  async function loadSources() {
    if (state.loading) return;
    state.loading = true;
    $("reset-source-list").innerHTML = "<p>Memuat sumber demand…</p>";
    try {
      const query = $("reset-search").value.trim();
      const result = await api(`/maintenance/api/source-planning-reset/sources?sourceType=${encodeURIComponent(state.sourceType)}&query=${encodeURIComponent(query)}&limit=80`);
      state.rows = result.rows || [];
      renderSources();
    } catch (error) {
      show(error.message);
      $("reset-source-list").innerHTML = "<p>Daftar sumber gagal dimuat.</p>";
    } finally { state.loading = false; }
  }

  function payload(extra = {}) {
    return { sourceType: state.sourceType, sourceNumbers: [...state.selected], layers: selectedLayers(), ...extra };
  }

  function impactCard(value, label) {
    return `<article><b>${num(value)}</b><small>${esc(label)}</small></article>`;
  }

  function renderPreview(preview) {
    const impact = preview.impact || {};
    const protectedData = preview.protected || {};
    const warnings = (preview.warnings || []).map((warning) => `<div class="maintenance-impact-warning">${esc(warning)}</div>`).join("");
    $("reset-impact").className = "maintenance-impact";
    $("reset-impact").innerHTML = [
      impactCard(impact.sourceToDraft, "Forecast / SO → Draft"),
      impactCard(impact.mps, "MPS"),
      impactCard(impact.rccp, "RCCP Run"),
      impactCard(impact.mrp, "MRP Run"),
      impactCard(impact.plannedOrders, "Planned Order"),
      impactCard(impact.purchaseSuggestions, "Purchase Suggestion"),
      impactCard(impact.monthlyPlans, "Monthly Plan"),
      impactCard(impact.dailyPlans, "Daily Schedule"),
      warnings,
      `<div class="maintenance-impact-safe">Terlindungi: ${num(protectedData.stockBalances?.count)} stock balance · ${num(protectedData.stockMovements?.count)} movement · ${num(protectedData.goodsReceipts)} Goods Receipt · ${num(protectedData.productionLogs)} Production Log.</div>`,
    ].join("");
    $("reset-reason").disabled = false;
    $("reset-confirmation").disabled = false;
    validateSubmit();
  }

  function validateSubmit() {
    $("reset-submit").disabled = !(state.preview
      && $("reset-reason").value.trim().length >= 5
      && $("reset-confirmation").value.trim() === "RESET_SELECTED_PLANNING");
  }

  async function preview() {
    show("");
    const button = $("reset-preview");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Menganalisis…";
    try {
      state.preview = await api("/maintenance/api/source-planning-reset/preview", { method: "POST", body: JSON.stringify(payload()) });
      renderPreview(state.preview);
    } catch (error) {
      invalidatePreview();
      show(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function submit() {
    validateSubmit();
    if ($("reset-submit").disabled) return;
    const button = $("reset-submit");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Mereset…";
    try {
      const result = await api("/maintenance/api/source-planning-reset/reset", {
        method: "POST",
        body: JSON.stringify(payload({ reason: $("reset-reason").value.trim(), confirmation: $("reset-confirmation").value.trim() })),
      });
      show(`Reset selesai. ${num(result.impact?.sourceToDraft)} sumber kembali Draft; ${num(result.impact?.mrp)} MRP dan ${num(result.impact?.monthlyPlans)} Production Plan dihapus. Inventory tetap utuh.`, "success");
      state.selected.clear();
      $("reset-selected-count").textContent = "0 dipilih";
      $("reset-reason").value = "";
      $("reset-confirmation").value = "";
      document.querySelectorAll("[data-reset-layer]").forEach((node) => { node.checked = false; });
      invalidatePreview("Reset selesai. Pilih sumber untuk proses berikutnya.");
      await Promise.all([loadStatus({ quiet: true }), loadSources()]);
    } catch (error) {
      show(error.message);
      button.disabled = false;
      button.textContent = original;
    }
  }

  $("refresh-maintenance").addEventListener("click", () => Promise.all([loadStatus(), loadSources()]));
  $("reset-preview").addEventListener("click", preview);
  $("reset-submit").addEventListener("click", submit);
  $("reset-reason").addEventListener("input", validateSubmit);
  $("reset-confirmation").addEventListener("input", validateSubmit);
  $("reset-source-list").addEventListener("change", (event) => {
    const input = event.target.closest("[data-reset-source]");
    if (!input) return;
    if (input.checked) state.selected.add(input.dataset.resetSource);
    else state.selected.delete(input.dataset.resetSource);
    $("reset-selected-count").textContent = `${state.selected.size} dipilih`;
    renderSources();
    invalidatePreview();
  });
  document.querySelectorAll("[data-reset-source-type]").forEach((button) => button.addEventListener("click", () => {
    state.sourceType = button.dataset.resetSourceType;
    state.selected.clear();
    $("reset-selected-count").textContent = "0 dipilih";
    document.querySelectorAll("[data-reset-source-type]").forEach((node) => {
      const active = node === button;
      node.classList.toggle("active", active);
      node.setAttribute("aria-pressed", String(active));
    });
    invalidatePreview();
    loadSources();
  }));
  $("reset-search").addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(loadSources, 250);
  });
  document.querySelectorAll("[data-reset-layer]").forEach((input) => input.addEventListener("change", () => {
    const production = document.querySelector('[data-reset-layer="PRODUCTION_PLAN"]');
    const mrp = document.querySelector('[data-reset-layer="MRP"]');
    const mps = document.querySelector('[data-reset-layer="MPS"]');
    if (input.value === "MPS" && input.checked) { mrp.checked = true; production.checked = true; }
    if (input.value === "MRP" && input.checked) production.checked = true;
    if (input.value === "MRP" && !input.checked) mps.checked = false;
    if (input.value === "PRODUCTION_PLAN" && !input.checked) { mrp.checked = false; mps.checked = false; }
    invalidatePreview();
  }));

  loadStatus({ quiet: true });
  loadSources();
})();
