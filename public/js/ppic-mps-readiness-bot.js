(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const symbols = { PASS: "✓", FAIL: "✕", WARNING: "!", UNKNOWN: "?" };
  const labels = { PASS: "OK", FAIL: "Terhambat", WARNING: "Perhatian", UNKNOWN: "Belum diperiksa" };
  const statuses = { NOT_READY: "BELUM SIAP UNTUK MRP RESMI", NEEDS_REVIEW: "PERLU VERIFIKASI", READY_WITH_RISK: "SIAP DENGAN CATATAN", READY: "SIAP DITINJAU UNTUK MRP" };
  window.MpsReadinessBot = { create({ request, getMonth }) {
    const $ = (id) => document.getElementById(id);
    const toggle = $("mrb-toggle"), panel = $("mrb-panel"), body = $("mrb-body"), refresh = $("mrb-refresh"), close = $("mrb-close"), time = $("mrb-time"), badge = $("mrb-badge");
    let version = 0;
    function render(report) {
      if (!report || report.month !== getMonth()) return;
      const { counts, checks } = report;
      badge.hidden = false; badge.textContent = `${counts.PASS}/${report.total}`;
      time.textContent = `${report.mpsNumber || report.month} · ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(report.checkedAt))}`;
      body.innerHTML = `<div class="mrb-result ${esc(report.status)}"><span>${counts.PASS} / ${report.total} parameter OK</span><strong>${esc(statuses[report.status] || statuses.NEEDS_REVIEW)}</strong><p>${counts.FAIL} terhambat · ${counts.WARNING} perhatian · ${counts.UNKNOWN} belum diperiksa</p></div><ul class="mrb-checks">${checks.map((c) => `<li class="${esc(c.status)}"><span class="mrb-symbol" aria-label="${esc(labels[c.status])}">${symbols[c.status] || "?"}</span><div class="mrb-check-content"><b>${esc(c.label)}</b><p>${esc(c.reason)}</p>${c.details?.length ? `<details><summary>Lihat rincian (${c.details.length})</summary><ul>${c.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>` : ""}${c.href?.startsWith("/modules/") ? `<a href="${esc(c.href)}">Buka rincian ETA →</a>` : ""}</div></li>`).join("")}</ul><p class="mrb-note">${esc(report.simulation)}</p><p class="mrb-note">${esc(report.scope)} Pembaruan ini hanya membaca data; tidak menghitung atau menyetujui MPS/MRP.</p>`;
    }
    async function load() {
      const current = ++version, month = getMonth();
      refresh.disabled = true; badge.hidden = true; time.textContent = `${month} · membaca data terbaru…`;
      body.innerHTML = '<p class="mrb-note">Memeriksa data MPS, inventory, BOM, ETA dan kapasitas…</p>';
      try {
        const data = await request(`/modules/api/planning-ppic/mps/workbench?month=${encodeURIComponent(month)}&page=1&pageSize=10`);
        if (current !== version || month !== getMonth()) return;
        if (!data.mrpReadiness) throw Error("Ringkasan kesiapan belum tersedia. Perbarui backend dan coba lagi.");
        render(data.mrpReadiness);
      } catch (error) {
        if (current === version && month === getMonth()) { time.textContent = `${month} · gagal memperbarui`; body.innerHTML = `<p class="mrb-error">${esc(error.message)} Gunakan Perbarui untuk mencoba kembali.</p>`; }
      } finally { if (current === version) refresh.disabled = false; }
    }
    function hide() { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
    toggle.addEventListener("click", () => { if (!panel.hidden) return hide(); panel.hidden = false; toggle.setAttribute("aria-expanded", "true"); close.focus(); load(); });
    close.addEventListener("click", hide);
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); hide(); } });
    refresh.addEventListener("click", load);
    $("mwb-month")?.addEventListener("change", () => { version++; badge.hidden = true; refresh.disabled = false; if (!panel.hidden) load(); });
    return { update(data) { if (data?.period !== getMonth()) return; version++; refresh.disabled = false; if (data.mrpReadiness) render(data.mrpReadiness); } };
  } };
})();
