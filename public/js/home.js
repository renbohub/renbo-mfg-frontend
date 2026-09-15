(() => {
  "use strict";
  const model = window.HomeTaskModel;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const icons = { approval: "✓", recovery: "↗", comment: "↔", notification: "◉" };
  const actions = { approval: "Tinjau persetujuan", recovery: "Buka tindak lanjut", comment: "Buka percakapan", notification: "Lihat pembaruan" };
  const state = { sources: {}, items: [], filter: "all", query: "", sort: "priority", selected: null, limit: 8, today: "", loading: false, loaded: false };
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const dateLabel = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  function alert(message) { $("home-alert").textContent = message; $("home-alert").hidden = !message; }
  const errorMessage = (error) => ["TypeError", "TimeoutError", "AbortError", "SyntaxError"].includes(error?.name) ? "Koneksi belum tersedia. Data terakhir tetap ditampilkan; coba muat ulang sebentar lagi." : error.message;
  async function request(url, options = {}) {
    const requestToken = token();
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000), headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" } });
    if (response.status === 401) {
      if (token() === requestToken) {
        for (const storage of [localStorage, sessionStorage]) {
          storage.removeItem("token"); storage.removeItem("user");
        }
        location.replace("/login?next=%2Fhome");
      }
      throw new Error("Sesi berakhir. Silakan masuk kembali.");
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Permintaan belum berhasil. Coba lagi.");
    return payload;
  }
  function identity() {
    const user = window.ERP_PERMISSIONS?.user() || {};
    const name = user.employee?.fullName || user.fullName || user.username || "Anda";
    $("home-greeting-name").textContent = name.split(/\s+/)[0];
  }
  function calendar() {
    const now = window.erpBusinessNow?.() || new Date();
    $("home-date-day").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" }).format(now);
    $("home-date-value").textContent = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(now);
    state.today = now.toISOString().slice(0, 10);
  }
  function empty(title, copy) { return `<div class="home-empty"><span aria-hidden="true">✓</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>`; }
  function badge(item) { return model.overdue(item, state.today) ? '<span class="home-tag is-late">Lewat target</span>' : `<span class="home-tag ${["comment", "notification"].includes(item.kind) ? "is-neutral" : ""}">${esc(item.kind === "approval" ? "Perlu keputusan" : item.kind === "recovery" ? ({ OPEN: "Perlu tindak lanjut", WAITING: "Menunggu", IN_PROGRESS: "Dikerjakan" }[item.status] || item.status) : item.status)}</span>`; }
  function detail() {
    const item = state.items.find((row) => model.key(row) === state.selected);
    if (!item) { $("home-detail-content").innerHTML = '<div class="home-detail-empty"><span aria-hidden="true">↗</span><h3>Pilih aktivitas</h3><p>Detail dan tombol tindakan akan muncul di sini setelah Anda memilih item dalam daftar.</p></div>'; return; }
    const link = model.safeUrl(item.url);
    const amount = item.amount != null ? `<div><dt>Nilai dokumen</dt><dd>${esc(item.currency || "")} ${esc(new Intl.NumberFormat("id-ID").format(item.amount))}</dd></div>` : "";
    $("home-detail-content").innerHTML = `<div class="home-detail-inner"><span class="home-kind-icon ${esc(item.kind)}" aria-hidden="true">${icons[item.kind]}</span><div class="home-eyebrow">${esc(model.labels[item.kind])}</div><h3>${esc(item.title)}</h3>${badge(item)}<p class="home-detail-description mt-3">${esc(item.description || "Buka dokumen untuk melihat detail lengkap.")}</p><dl class="home-detail-meta"><div><dt>${item.kind === "recovery" ? "Penanggung jawab" : "Dari"}</dt><dd>${esc(item.actor || "Sistem")}</dd></div><div><dt>Diperbarui</dt><dd>${esc(dateLabel(item.date))}</dd></div>${item.reference ? `<div><dt>Referensi</dt><dd>${esc(item.reference)}</dd></div>` : ""}${item.dueDate ? `<div><dt>Target selesai</dt><dd>${esc(dateLabel(item.dueDate))}</dd></div>` : ""}${amount}</dl>${link ? `<a class="home-primary-action" href="${esc(link)}">${actions[item.kind]} <span>↗</span></a>` : '<p class="home-detail-hint">Tidak ada tautan dokumen yang tersedia untuk item ini.</p>'}${item.kind === "notification" && item.canMarkRead ? '<button type="button" class="home-detail-secondary" id="home-mark-read">Tandai sudah dibaca</button>' : ""}${item.kind === "approval" ? '<p class="home-detail-hint">Periksa isi dokumen sebelum menyetujui atau menolaknya.</p>' : ""}</div>`;
    $("home-mark-read")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        await request(`/home/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "PUT" });
        await load();
      } catch (error) { alert(errorMessage(error)); if ($("home-mark-read")) $("home-mark-read").disabled = false; }
    });
  }
  function render() {
    document.querySelectorAll("[data-home-filter]").forEach((button) => {
      const active = button.dataset.homeFilter === state.filter;
      button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
    });
    model.kinds.forEach((kind) => {
      const source = state.sources[kind];
      document.querySelector(`[data-home-count="${kind}"]`).textContent = source?.available ? `${source.total}${source.limited ? "+" : ""}` : "—";
    });
    const filtered = model.select(state.items, state);
    if (!filtered.some((item) => model.key(item) === state.selected)) state.selected = filtered[0] ? model.key(filtered[0]) : null;
    const shown = filtered.slice(0, state.limit);
    const unavailable = state.filter === "all" ? model.kinds.every((kind) => !state.sources[kind]?.available) : !state.sources[state.filter]?.available;
    $("home-task-count").textContent = state.loaded && !unavailable ? filtered.length : "—";
    $("home-list-caption").textContent = unavailable ? "Sumber data belum tersedia" : `${shown.length} dari ${filtered.length} aktivitas${state.filter === "all" ? "" : " · " + model.labels[state.filter]}`;
    $("home-task-list").innerHTML = shown.length ? shown.map((item) => `<button type="button" class="home-task-row ${state.selected === model.key(item) ? "is-selected" : ""}" data-task-key="${esc(model.key(item))}" aria-pressed="${state.selected === model.key(item)}" aria-controls="home-detail-content"><span class="home-kind-icon ${esc(item.kind)}" aria-hidden="true">${icons[item.kind]}</span><span class="home-task-copy"><strong>${esc(item.title)}</strong><p>${esc(item.description || item.reference || "Lihat detail aktivitas")}</p><span class="home-task-meta"><span>${esc(model.labels[item.kind])}</span><i></i><span>${esc(item.actor || "Sistem")}</span><i></i><span>${esc(dateLabel(item.date))}</span></span></span><span class="home-task-right">${badge(item)}<span aria-hidden="true">↗</span></span></button>`).join("") : unavailable ? empty("Data belum dapat dimuat", "Pilih Muat ulang untuk mencoba kembali.") : state.query ? empty("Tidak ada hasil yang cocok", "Coba kata kunci lain atau pilih Reset filter untuk melihat semua aktivitas.") : empty(state.filter === "all" ? "Belum ada aktivitas" : `Belum ada ${model.labels[state.filter].toLocaleLowerCase("id")}`, "Aktivitas baru akan muncul di sini sesuai akses akun Anda.");
    $("home-task-list").setAttribute("aria-busy", "false");
    $("home-load-more").hidden = shown.length >= filtered.length;
    $("home-list-foot").textContent = Object.values(state.sources).some((source) => source.limited) ? "Sebagian aktivitas dimuat. Buka modul terkait untuk melihat daftar lengkap." : "Data sesuai akses akun Anda. Komentar menampilkan diskusi terbaru.";
    $("home-reset-filters").hidden = state.filter === "all" && !state.query.trim() && state.sort === "priority";
    detail();
  }
  async function load() {
    if (state.loading) return;
    state.loading = true; $("home-refresh").disabled = true; $("home-task-list").setAttribute("aria-busy", "true"); alert("");
    try {
      const payload = await request("/home/api/tasks");
      state.sources = payload.sources; state.today = payload.currentDate || state.today; state.loaded = true;
      state.items = model.kinds.flatMap((kind) => state.sources[kind]?.items || []);
      const failures = model.kinds.filter((kind) => !state.sources[kind]?.available);
      if (failures.length) alert(`${failures.map((kind) => model.labels[kind]).join(", ")} belum dapat dimuat. Data lainnya tetap tersedia.`);
      $("home-sync").textContent = `Diperbarui ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
      render();
    } catch (error) {
      alert(errorMessage(error)); $("home-sync").textContent = state.loaded ? "Pembaruan gagal · menampilkan data sebelumnya" : "Belum terhubung";
      if (!state.loaded) render();
    } finally { state.loading = false; $("home-refresh").disabled = false; $("home-task-list").setAttribute("aria-busy", "false"); }
  }
  const scrollToSection = (element) => element.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  document.querySelectorAll("[data-home-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.homeFilter; state.limit = 8; render();
    if (button.classList.contains("home-metric") && matchMedia("(max-width: 950px)").matches) {
      $("home-search").focus({ preventScroll: true }); scrollToSection(document.querySelector(".home-inbox"));
    }
  }));
  $("home-reset-filters").addEventListener("click", () => {
    state.filter = "all"; state.query = ""; state.sort = "priority"; state.limit = 8;
    $("home-search").value = ""; $("home-sort").value = "priority";
    render(); $("home-search").focus({ preventScroll: true });
  });
  $("home-back-to-list").addEventListener("click", () => {
    const row = state.selected && document.querySelector(`[data-task-key="${CSS.escape(state.selected)}"]`);
    (row || $("home-search")).focus({ preventScroll: true });
    scrollToSection(row || document.querySelector(".home-inbox"));
  });
  $("home-search").addEventListener("input", (event) => { state.query = event.target.value; state.limit = 8; render(); });
  $("home-sort").addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  $("home-task-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-key]"); if (!button) return;
    state.selected = button.dataset.taskKey; render();
    if (matchMedia("(max-width: 950px)").matches) {
      $("home-detail-title").focus({ preventScroll: true }); scrollToSection(document.querySelector(".home-detail"));
    } else document.querySelector(`[data-task-key="${CSS.escape(state.selected)}"]`)?.focus({ preventScroll: true });
  });
  $("home-load-more").addEventListener("click", () => { state.limit += 8; render(); });
  $("home-refresh").addEventListener("click", load);
  window.addEventListener("erp:permissions-ready", identity);
  window.addEventListener("pageshow", () => { if (!token()) { $("home-task-list").replaceChildren(); $("home-detail-content").replaceChildren(); location.replace("/login"); } });
  window.addEventListener("focus", () => { if (state.loaded) load(); });
  identity(); calendar(); load();
})();
