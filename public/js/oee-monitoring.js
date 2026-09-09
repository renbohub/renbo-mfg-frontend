(() => {
  "use strict";
  const M = window.OeeMonitoringModel;
  const $ = (id) => document.getElementById(id);
  const configNode = $("oee-config");
  if (!M || !configNode) return;
  const config = JSON.parse(configNode.textContent);
  const params = new URLSearchParams(location.search);
  const base = "/modules/production/oee-monitoring";
  const state = {
    date: config.initialDate, shift: params.get("shift") || "", query: params.get("q") || "",
    filter: ["recorded", "no-data"].includes(params.get("status")) ? params.get("status") : "all", machineId: config.machineId || "", demo: params.get("demo") === "1",
    data: null, loading: false, sequence: 0, controller: null, historyQuery: "", historyPage: 1, renderPending: false,
    actualShift: params.get("demo") === "1" ? params.get("actualShift") || "" : params.get("shift") || "",
    demoShift: params.get("demo") === "1" ? params.get("shift") || "" : params.get("sampleShift") || "",
  };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const barWidth = (value) => finite(value) ? Math.min(100, Math.max(0, Number(value))) : 0;
  const arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const icon = (name) => {
    const paths = { chart: '<path d="M4 18V6m5 12V9m5 9V4m5 14v-7"/>', machine: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8m-4-4v4m-4-9h2m4 0h2"/>', output: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>', time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', empty: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10h8m-8 4h4"/>' };
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chart}</svg>`;
  };
  function link(machineId = "") {
    const query = new URLSearchParams({ date: state.date });
    if (state.shift) query.set("shift", state.shift);
    if (state.demo) query.set("demo", "1");
    if (state.demo && state.actualShift) query.set("actualShift", state.actualShift);
    if (!state.demo && state.demoShift) query.set("sampleShift", state.demoShift);
    if (state.filter !== "all") query.set("status", state.filter);
    if (state.query) query.set("q", state.query);
    return `${base}${machineId ? "/" + encodeURIComponent(machineId) : ""}?${query}`;
  }
  function setUrl() { history.replaceState(null, "", link(state.machineId)); }
  function alert(message, isError = true) {
    $("oee-alert").textContent = message;
    $("oee-alert").hidden = !message;
    $("oee-alert").classList.toggle("is-error", isError);
  }
  function empty(title, copy, action = "") {
    return `<div class="oee-empty"><span class="oee-empty-icon">${icon("empty")}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;
  }
  function donut(value, large = false) {
    const percentage = barWidth(value);
    return `<div class="oee-donut${large ? " oee-donut--large" : ""}" role="img" aria-label="OEE ${esc(M.percent(value))}"><svg viewBox="0 0 140 140" aria-hidden="true"><circle class="oee-donut-track" cx="70" cy="70" r="59" fill="none" stroke-width="8"/><circle class="oee-donut-progress" style="opacity:${percentage > 0 ? 1 : 0}" cx="70" cy="70" r="59" fill="none" stroke-width="8" stroke-linecap="round" pathLength="100" stroke-dasharray="${percentage} 100" transform="rotate(-90 70 70)"/></svg><div class="oee-donut-label"><strong>${finite(value) ? esc(M.number(value, 1)) + '<small>%</small>' : "—"}</strong><span>OEE</span></div></div>`;
  }
  function factors(metrics) {
    return [["Availability", metrics.availability], ["Performance", metrics.performance], ["Quality", metrics.quality]].map(([label, value], index) => `<div class="oee-factor"><div class="oee-factor-label"><span><i class="oee-factor-key">${["A", "P", "Q"][index]}</i>${label}</span><strong>${esc(M.percent(value))}</strong></div><div class="oee-bar"><i style="width:${barWidth(value)}%"></i></div></div>`).join("");
  }
  const recorded = (machine) => machine.status === "recorded";
  function statusBadge(machine) {
    return `<span class="oee-status ${recorded(machine) ? "is-recorded" : "is-empty"}"><i aria-hidden="true"></i>${recorded(machine) ? "Ada catatan" : "Belum ada log"}</span>`;
  }
  function paretoChart(history, compact = false) {
    const rows = M.pareto(history);
    const total = rows.reduce((sum, row) => sum + row.durationMinutes, 0);
    const legend = '<div class="oee-chart-legend"><span><i class="oee-legend-bar"></i>Durasi (menit)</span><span><i class="oee-legend-line"></i>Kumulatif (%)</span></div>';
    if (!rows.length || total <= 0) return `<div class="oee-pareto-chart${compact ? " is-compact" : ""}">${legend}<div class="oee-pareto-empty">${icon("chart")}<span>${rows.length ? "Durasi downtime masih 0 menit" : "Belum ada downtime tercatat"}</span><small>Pareto tampil saat ada durasi downtime.</small></div></div>`;
    const width = Math.max(compact ? 280 : 480, rows.length * (compact ? 64 : 90) + 68);
    const height = compact ? 183 : 255;
    const left = 30, right = width - 34, top = 23, bottom = height - 45;
    const plotHeight = bottom - top, step = (right - left) / rows.length;
    const maximum = rows[0].durationMinutes;
    const magnitude = 10 ** Math.floor(Math.log10(maximum));
    const maxAxis = Math.ceil(maximum / magnitude) * magnitude;
    const x = index => left + step * (index + .5);
    const y = minutes => bottom - minutes / maxAxis * plotHeight;
    const cumulativeY = percent => bottom - percent / 100 * plotHeight;
    const axisNumber = value => M.number(value, maxAxis < 1 ? 2 : 1);
    function labelLines(value) {
      const limit = compact ? 12 : 19, words = String(value).split(" ");
      let first = words.shift() || "";
      while (words.length && first.length + words[0].length + 1 <= limit) first += " " + words.shift();
      return [first, words.join(" ")].map(line => line.length > limit ? line.slice(0, limit - 1) + "…" : line);
    }
    const grid = [0, .5, 1].map(fraction => `<g class="oee-chart-grid"><line x1="${left}" x2="${right}" y1="${bottom - fraction * plotHeight}" y2="${bottom - fraction * plotHeight}"/><text x="${left - 6}" y="${bottom - fraction * plotHeight + 3}" text-anchor="end">${esc(axisNumber(maxAxis * fraction))}</text><text class="oee-chart-percent" x="${right + 6}" y="${bottom - fraction * plotHeight + 3}">${fraction * 100}%</text></g>`).join("");
    const columns = rows.map((row, index) => {
      const columnWidth = Math.min(compact ? 29 : 44, step * .52);
      const lines = labelLines(row.reason);
      const description = `${row.reason}: ${M.duration(row.durationMinutes)}, ${row.count} kejadian, kumulatif ${M.percent(row.cumulativePercent)}`;
      return `<g class="oee-chart-category" tabindex="0" role="img" aria-label="${esc(description)}"><title>${esc(description)}</title><rect class="oee-chart-bar" x="${x(index) - columnWidth / 2}" y="${y(row.durationMinutes)}" width="${columnWidth}" height="${bottom - y(row.durationMinutes)}" rx="3"/><text class="oee-chart-value" x="${x(index)}" y="${Math.max(12, y(row.durationMinutes) - 7)}" text-anchor="middle">${esc(axisNumber(row.durationMinutes))}</text><text class="oee-chart-category-label" x="${x(index)}" y="${bottom + 17}" text-anchor="middle"><tspan x="${x(index)}">${esc(lines[0])}</tspan><tspan x="${x(index)}" dy="12">${esc(lines[1])}</tspan></text></g>`;
    }).join("");
    const line = `<polyline class="oee-chart-cumulative" points="${rows.map((row, index) => `${x(index)},${cumulativeY(row.cumulativePercent)}`).join(" ")}"/>${rows.map((row, index) => `<circle class="oee-chart-point" cx="${x(index)}" cy="${cumulativeY(row.cumulativePercent)}" r="3"><title>${esc(row.reason)} · kumulatif ${esc(M.percent(row.cumulativePercent))}</title></circle>`).join("")}`;
    return `<div class="oee-pareto-chart${compact ? " is-compact" : ""}">${legend}<div class="oee-chart-scroll" tabindex="0" role="region" aria-label="Pareto downtime, durasi terbesar di kiri. Geser untuk melihat semua penyebab."><svg class="oee-chart-svg" style="min-width:${compact && rows.length <= 5 ? 0 : width}px" viewBox="0 0 ${width} ${height}" role="group" aria-label="Pareto ${rows.length} penyebab downtime. Total ${esc(M.duration(total))}. Sumbu kiri menit, sumbu kanan persentase kumulatif.">${grid}${columns}${line}</svg></div></div>`;
  }
  function machineCard(machine) {
    const m = machine.metrics || {}, p = machine.production || {};
    const rows = [["CT", `${M.number(m.idealCycleTimeSeconds, 2)} dtk`, "Ideal cycle time per pcs"], ["Good", `${M.number(m.goodOutput)} pcs`, "Output baik"], ["Target", `${M.number(m.targetOutput)} pcs`, "Target output"], ["ACH", M.percent(m.achievementRate), "Pencapaian output"], ["RR", M.percent(m.rejectRate), "Reject rate"]];
    return `<article class="oee-machine oee-machine--compact${recorded(machine) ? "" : " is-empty"}" data-oee-machine="${esc(machine.id)}">
      <header class="oee-machine-head"><div class="oee-machine-id"><h3 title="${esc(machine.machineName || machine.machineCode)}">${icon("machine")}${esc(machine.machineName || machine.machineCode)}</h3></div>${statusBadge(machine)}</header>
      <div class="oee-card-performance"><div class="oee-card-gauge">${donut(m.oee)}<span>${esc(machine.machineType || machine.lineCode || "PRODUCTION")}</span></div><dl class="oee-card-readings">${rows.map(([label, value, title]) => `<div><dt title="${esc(title)}">${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></div>
      <div class="oee-card-factors">${[["A", "Availability", m.availability], ["P", "Performance", m.performance], ["Q", "Quality", m.quality]].map(([key, name, value]) => `<div title="${name}"><span>${key}</span><strong>${esc(M.percent(value))}</strong></div>`).join("")}</div>
      <div class="oee-card-times"><div><span>Runtime</span><strong>${esc(M.duration(m.runtimeMinutes))}</strong></div><div><span>Downtime</span><strong>${esc(M.duration(m.downtimeMinutes))}</strong></div></div>
      <dl class="oee-card-production"><div><dt>MO</dt><dd title="${esc(p.moNumber || "")}">${esc(p.moNumber || "—")}</dd></div><div><dt>Part</dt><dd title="${esc(p.partName || "")}">${esc(p.partName || "—")}</dd></div></dl>
      <section class="oee-card-pareto"><div class="oee-section-label"><span>Pareto downtime</span><span>${esc(M.number(machine.downtimeHistory?.length || 0))} kejadian</span></div>${paretoChart(machine.downtimeHistory, true)}</section>
      <a class="oee-machine-link" href="${esc(link(machine.id))}" aria-label="Lihat detail mesin ${esc(machine.machineName || machine.machineCode)}"><span>Lihat detail mesin</span>${arrow}</a>
    </article>`;
  }
  function overview() {
    const machines = M.selectMachines(state.data?.machines || [], state);
    document.querySelectorAll("[data-oee-filter]").forEach(button => {
      const active = state.filter === button.dataset.oeeFilter;
      button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
    });
    const all = state.data?.machines || [];
    for (const [name, count] of [["all", all.length], ["recorded", all.filter(recorded).length], ["no-data", all.filter(m => !recorded(m)).length]]) {
      document.querySelectorAll(`[data-oee-count="${name}"]`).forEach(element => element.textContent = state.data ? M.number(count) : "—");
    }
    if ($("oee-machine-count")) $("oee-machine-count").textContent = `${M.number(machines.length)} mesin`;
    $("oee-machines").innerHTML = machines.length ? machines.map(machineCard).join("") : empty(state.query || state.filter !== "all" ? "Mesin tidak ditemukan" : "Belum ada mesin untuk ditampilkan", state.query || state.filter !== "all" ? "Coba kata kunci lain atau pilih Semua mesin." : "Mesin yang tersedia akan muncul setelah master mesin dan production log tercatat.");
  }
  function info(label, value) { return `<div><dt>${esc(label)}</dt><dd>${esc(value || "—")}</dd></div>`; }
  function detail() {
    const machine = state.data?.machines?.find(item => String(item.id) === state.machineId);
    if (!machine) {
      $("oee-detail").innerHTML = empty("Mesin tidak ditemukan", "Mesin ini tidak tersedia pada sumber data yang dipilih.", `<a class="oee-back" href="${esc(link())}">← Kembali ke semua mesin</a>`);
      return;
    }
    const m = machine.metrics || {}, p = machine.production || {};
    document.title = `${machine.machineName || machine.machineCode} · Monitoring OEE`;
    $("oee-detail").innerHTML = `<div class="oee-detail-top"><a class="oee-back" href="${esc(link())}">← Semua mesin</a><label class="oee-machine-switch"><span>Pindah mesin</span><select id="oee-machine-switch" aria-label="Pindah detail mesin">${state.data.machines.map(item => `<option value="${esc(item.id)}"${String(item.id) === state.machineId ? " selected" : ""}>${esc(item.machineName || item.machineCode)}</option>`).join("")}</select></label></div>
      <section class="oee-detail-hero"><div class="oee-detail-heading"><span class="oee-eyebrow">MACHINE PERFORMANCE · ${esc(machine.machineCode)}</span><h2>${esc(machine.machineName || machine.machineCode)}</h2><p>${esc(p.partName || "Belum ada produksi pada periode terpilih")}</p>${statusBadge(machine)}<span class="oee-detail-location">${esc([machine.machineType, machine.lineCode, machine.location].filter(Boolean).join(" · "))}</span></div><div class="oee-detail-score">${donut(m.oee, true)}<div class="oee-detail-factors">${factors(m)}</div></div><div class="oee-detail-metrics">${[["Good output", M.number(m.goodOutput), "pcs baik"], ["Reject", M.number(m.rejectOutput), `${M.percent(m.rejectRate)} reject rate`], ["Target output", M.number(m.targetOutput), `${M.percent(m.achievementRate)} pencapaian`], ["Runtime", M.duration(m.runtimeMinutes), "Waktu proses bersih"], ["Downtime", M.duration(m.downtimeMinutes), "Waktu berhenti tercatat"], ["Ideal cycle time", M.number(m.idealCycleTimeSeconds, 2), "detik / pcs"]].map(([label, value, note]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join("")}</div></section>
      <div class="oee-detail-grid"><section class="oee-panel"><header class="oee-panel-head"><div><span class="oee-eyebrow">PRODUCTION CONTEXT</span><h3>Informasi produksi</h3></div><span class="oee-count">${esc(M.number(machine.logCount))} log</span></header><dl class="oee-info-grid">${info("Manufacturing order", p.moNumber)}${info("Work order", p.woNumber)}${info("Part number", p.partNumber || p.partCode)}${info("Nama part", p.partName)}${info("Operator", p.operatorName)}${info("Shift", p.shift ? `Shift ${p.shift}` : "")}${info("Log terbaru", p.logNumber)}${info("Pembaruan log", machine.lastUpdatedAt ? dateTime(machine.lastUpdatedAt) : "")}${info("Status aset mesin", machine.masterStatus)}</dl></section>
      <section class="oee-panel"><header class="oee-panel-head"><div><span class="oee-eyebrow">LOSS ANALYSIS</span><h3>Pareto downtime</h3></div>${icon("chart")}</header><div class="oee-detail-pareto">${paretoChart(machine.downtimeHistory)}<p>Durasi terbesar di kiri. Garis menunjukkan persentase kumulatif seluruh penyebab downtime.</p></div></section>
      <section class="oee-panel oee-panel--wide"><header class="oee-panel-head"><div><span class="oee-eyebrow">DOWNTIME LOGBOOK</span><h3>History downtime</h3></div><span class="oee-count">${esc(M.number(machine.downtimeHistory?.length || 0))} kejadian</span></header><div class="oee-history-toolbar"><label>${icon("search")}<input id="oee-history-search" type="search" placeholder="Cari alasan, operator, atau MO…" aria-label="Cari history downtime" value="${esc(state.historyQuery)}"></label><span>Waktu dalam WIB</span></div><div id="oee-history-table"></div></section></div>
      <details class="oee-method-note"><summary>Tentang perhitungan OEE dan sumber data</summary><p>OEE = Availability × Performance × Quality. Angka di halaman ini berasal dari production log pada tanggal dan shift terpilih. Status mesin menunjukkan keberadaan catatan produksi, bukan sinyal mesin secara langsung.</p>${(machine.dataQuality || []).map(note => `<p>${esc(typeof note === "string" ? note : note.message || note.code)}</p>`).join("")}</details>`;
    renderHistory(machine);
    $("oee-machine-switch").addEventListener("change", event => { location.href = link(event.target.value); });
    const searchHistory = event => { state.historyQuery = event.target.value; state.historyPage = 1; renderHistory(state.data?.machines?.find(item => String(item.id) === state.machineId) || machine); };
    for (const type of ["input", "change", "search"]) $("oee-history-search").addEventListener(type, searchHistory);
  }
  function renderHistory(machine) {
    const query = state.historyQuery.trim().toLowerCase();
    const items = (machine.downtimeHistory || []).filter(event => !query || [event.reason, event.category, event.operatorName, event.moNumber].some(value => String(value || "").toLowerCase().includes(query)));
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    state.historyPage = Math.min(pageCount, Math.max(1, state.historyPage));
    const slice = items.slice((state.historyPage - 1) * pageSize, state.historyPage * pageSize);
    $("oee-history-table").innerHTML = slice.length ? `<div class="oee-table-wrap"><table class="oee-table" data-enterprise-table="off"><thead><tr><th scope="col">Waktu mulai</th><th scope="col">Waktu selesai</th><th scope="col">Alasan downtime</th><th scope="col">Durasi</th><th scope="col">Operator / Shift</th><th scope="col">Manufacturing order</th></tr></thead><tbody>${slice.map(event => `<tr><td>${esc(M.clock(event.startTime))}</td><td>${esc(M.clock(event.endTime))}</td><td><strong class="oee-reason">${esc(event.reason || "Alasan belum dicatat")}</strong><small>${esc(event.category || "—")}</small></td><td><span class="oee-history-duration">${esc(M.duration(event.durationMinutes))}</span></td><td>${esc(event.operatorName || "—")}<small>${esc(event.shift ? "Shift " + event.shift : "—")}</small></td><td>${esc(event.moNumber || "—")}</td></tr>`).join("")}</tbody></table></div><div class="oee-pagination"><span>${(state.historyPage - 1) * pageSize + 1}–${Math.min(state.historyPage * pageSize, items.length)} dari ${items.length} kejadian</span><div><button type="button" data-oee-history-page="${state.historyPage - 1}"${state.historyPage === 1 ? " disabled" : ""} aria-label="History sebelumnya">←</button><span>${state.historyPage} / ${pageCount}</span><button type="button" data-oee-history-page="${state.historyPage + 1}"${state.historyPage === pageCount ? " disabled" : ""} aria-label="History berikutnya">→</button></div></div>` : empty(query ? "History tidak ditemukan" : "Belum ada downtime tercatat", query ? "Coba alasan atau operator yang berbeda." : "Kejadian downtime pada periode ini akan tampil di sini.");
    $("oee-history-table").querySelectorAll("[data-oee-history-page]").forEach(button => button.addEventListener("click", () => { state.historyPage = Number(button.dataset.oeeHistoryPage); renderHistory(machine); }));
  }
  function dateTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date) + " WIB" : "—";
  }
  function updateShifts() {
    const shifts = [...new Set([...(state.data?.shifts || []).map(value => typeof value === "object" ? value.code || value.shift : value), state.shift].filter(Boolean))];
    $("oee-shift").innerHTML = '<option value="">Semua shift</option>' + shifts.map(shift => `<option value="${esc(shift)}"${String(shift) === state.shift ? " selected" : ""}>Shift ${esc(shift)}</option>`).join("");
  }
  function render() {
    updateShifts();
    $("oee-overview").hidden = Boolean(state.machineId);
    $("oee-detail").hidden = !state.machineId;
    const searchLabel = $("oee-search").closest("label");
    if (searchLabel) searchLabel.hidden = Boolean(state.machineId);
    if (state.machineId) detail(); else overview();
    sourceControls();
  }
  function sourceControls() {
    $("oee-source-label").textContent = state.demo ? "Data contoh · simulasi" : "Production log";
    $("oee-source-label").classList.toggle("is-demo", state.demo);
    const demoButton = $("oee-demo");
    demoButton.textContent = state.demo ? "Data aktual" : "Lihat contoh";
    demoButton.title = state.demo ? "Kembali ke data produksi aktual" : "Lihat desain dengan data simulasi";
    demoButton.setAttribute("aria-pressed", String(state.demo));
    $("oee-updated").textContent = state.demo ? "Mode contoh · bukan data produksi" : state.data ? `Diperbarui ${dateTime(state.data.generatedAt)} · otomatis 30 detik` : "Menunggu pembaruan";
  }
  function loadingState() {
    $("oee-overview").hidden = Boolean(state.machineId); $("oee-detail").hidden = !state.machineId;
    const target = state.machineId ? $("oee-detail") : $("oee-machines");
    target.innerHTML = '<div class="oee-empty oee-loading"><span class="oee-loading-orbit" aria-hidden="true"></span><h3>Memuat kondisi produksi</h3><p>Menyiapkan ringkasan mesin dan history downtime.</p></div>';
  }
  async function load({ clear = false, silent = false } = {}) {
    const sequence = ++state.sequence;
    state.controller?.abort();
    state.controller = new AbortController();
    const controller = state.controller;
    if (clear) { state.data = null; alert(""); loadingState(); }
    sourceControls();
    state.loading = true;
    $("oee-refresh").disabled = true;
    $("oee-refresh").setAttribute("aria-busy", "true");
    const target = state.machineId ? $("oee-detail") : $("oee-machines");
    target.setAttribute("aria-busy", "true");
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      let payload;
      if (state.demo) payload = M.sample(state.date, state.shift);
      else {
        const query = new URLSearchParams({ date: state.date });
        if (state.shift) query.set("shift", state.shift);
        const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
        const response = await fetch(`/modules/api/production/oee-monitoring?${query}`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
        if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(link(state.machineId))}`); throw new Error("Sesi berakhir. Silakan masuk kembali."); }
        if (response.status === 403) throw new Error("Akun Anda belum memiliki akses untuk membaca laporan produksi.");
        payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Data OEE belum dapat dimuat. Coba perbarui kembali.");
        if (!Array.isArray(payload.machines) || !payload.summary) throw new Error("Respons data OEE belum lengkap. Coba perbarui kembali.");
      }
      if (sequence !== state.sequence) return;
      const unchanged = state.data && JSON.stringify([state.data.machines, state.data.summary, state.data.shifts]) === JSON.stringify([payload.machines, payload.summary, payload.shifts]);
      state.data = payload;
      alert("", false);
      // Avoid replacing an active history search field during background refresh.
      if (silent && state.machineId && document.activeElement?.id === "oee-history-search") {
        state.renderPending = state.renderPending || !unchanged; sourceControls();
      } else if (silent && unchanged && !state.renderPending) { sourceControls(); }
      else { render(); state.renderPending = false; }
    } catch (error) {
      if (sequence !== state.sequence) return;
      const message = ["AbortError", "TypeError", "SyntaxError"].includes(error.name) ? "Koneksi data belum tersedia. Coba perbarui kembali." : error.message;
      alert(`${message}${state.data ? " Data terakhir tetap ditampilkan; pembaruan tertunda." : ""}`);
      $("oee-updated").textContent = state.data ? "Pembaruan tertunda · menampilkan data terakhir" : "Data belum tersedia";
      if (!state.data) target.innerHTML = empty("Data produksi belum tersedia", "Gunakan Perbarui untuk mencoba kembali, atau Lihat contoh untuk meninjau desain dengan data simulasi.");
    } finally {
      clearTimeout(timeout);
      if (sequence === state.sequence) {
        state.loading = false; $("oee-refresh").disabled = false;
        $("oee-refresh").setAttribute("aria-busy", "false"); target.setAttribute("aria-busy", "false");
      }
    }
  }
  $("oee-date").value = state.date;
  $("oee-search").value = state.query;
  $("oee-date").addEventListener("change", event => {
    if (!event.target.value || !event.target.checkValidity()) return;
    state.date = event.target.value; state.historyPage = 1; setUrl(); load({ clear: true });
  });
  $("oee-shift").addEventListener("change", event => { state.shift = event.target.value; state[state.demo ? "demoShift" : "actualShift"] = state.shift; state.historyPage = 1; setUrl(); load({ clear: true }); });
  const searchMachines = event => { state.query = event.target.value; setUrl(); if (!state.machineId && state.data) overview(); };
  for (const type of ["input", "change", "search"]) $("oee-search").addEventListener(type, searchMachines);
  $("oee-refresh").addEventListener("click", () => load());
  $("oee-demo").addEventListener("click", () => {
    state.demo = !state.demo; state.shift = state.demo ? state.demoShift : state.actualShift;
    if (state.machineId) { location.href = link(); return; }
    setUrl(); load({ clear: true });
  });
  document.querySelectorAll("[data-oee-filter]").forEach(button => button.addEventListener("click", () => { state.filter = button.dataset.oeeFilter; setUrl(); if (state.data) overview(); }));
  $("oee-machines").addEventListener("click", event => {
    if (event.target.closest("a,button,input,select,.oee-pareto-chart") || window.getSelection()?.toString()) return;
    const card = event.target.closest("[data-oee-machine]");
    if (card) location.href = link(card.dataset.oeeMachine);
  });
  $("oee-fullscreen")?.addEventListener("click", async () => {
    const page = document.querySelector(".oee-page");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (page.classList.contains("is-presentation")) {
        page.classList.remove("is-presentation"); document.body.classList.remove("oee-focus-mode");
      } else await page.requestFullscreen();
    } catch {
      // Browsers embedded in enterprise shells may deny native fullscreen.
      // A viewport-sized presentation remains usable with the same exit control.
      page.classList.add("is-presentation"); document.body.classList.add("oee-focus-mode");
    }
    fullscreenState();
  });
  function fullscreenState() {
    const button = $("oee-fullscreen");
    const active = Boolean(document.fullscreenElement) || document.querySelector(".oee-page").classList.contains("is-presentation");
    if (button) { button.setAttribute("aria-pressed", String(active)); button.title = active ? "Keluar layar penuh" : "Layar penuh"; button.setAttribute("aria-label", button.title); }
  }
  document.addEventListener("fullscreenchange", fullscreenState);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.querySelector(".oee-page").classList.contains("is-presentation")) {
      document.querySelector(".oee-page").classList.remove("is-presentation");
      document.body.classList.remove("oee-focus-mode"); fullscreenState();
    }
  });
  let poll;
  function startPolling() {
    clearInterval(poll);
    poll = setInterval(() => { if (!document.hidden && !state.demo && !state.loading) load({ silent: true }); }, 30000);
  }
  startPolling();
  window.addEventListener("pagehide", () => { clearInterval(poll); state.controller?.abort(); });
  window.addEventListener("pageshow", event => { if (event.persisted) { startPolling(); load({ silent: true }); } });
  render();
  load({ clear: true });
})();
