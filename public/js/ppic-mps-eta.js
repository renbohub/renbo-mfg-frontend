(() => {
  "use strict";
  const label = (mode) => mode === "BOM" ? "Explode lead time BOM" : "Konfirmasi ETA";
  window.MpsEtaControls = { create({ request, reload, notify }) {
    const $ = (id) => document.getElementById(id);
    const select = $("mwb-eta-source-select"), save = $("mwb-eta-source-save"), link = $("mwb-eta-source-link");
    const description = $("mwb-eta-source-description"), status = $("mwb-eta-source-state");
    const draftModes = new Map();
    let current = null, busy = false;
    function update() {
      const doc = current?.mps, active = current?.etaGate?.mode || "MANUAL";
      const editable = !busy && (doc ? current.etaPermissions?.canUpdate && ["Draft", "Confirmed"].includes(doc.status) : current?.etaPermissions?.canCreate);
      select.disabled = !editable;
      save.hidden = !doc;
      save.disabled = !editable || select.value === active;
      save.textContent = busy ? "Menyimpan…" : "Simpan sumber ETA";
      link.hidden = !doc;
      link.href = `/modules/purchasing/eta-monitor?month=${encodeURIComponent(current?.period || "")}&mpsNumber=${encodeURIComponent(doc?.mpsNumber || "")}&tab=mps&source=mps`;
      description.textContent = select.value === "BOM"
        ? "ETA dihitung dari explode BOM, lead time supplier/vendor, transit, dan kesiapan setelah QC. Konfirmasi tetap tersimpan untuk dipakai saat memilih Konfirmasi ETA."
        : "ETA memakai qty, lead time, dan tanggal kesiapan yang dikonfirmasi Supplier, Vendor, atau Customer pada halaman ETA.";
      status.textContent = busy ? "Menyimpan sumber ETA MPS…" : !current ? "Memuat sumber ETA…" : !doc
        ? `MPS baru periode ${current.period} akan memakai ${label(select.value)}. Lanjutkan dengan Buat MPS.`
        : `${doc.mpsNumber} · Aktif: ${label(active)}.${select.value !== active ? " Pilihan baru belum disimpan." : ""}${editable ? "" : " Sumber ETA hanya dapat diubah oleh PPIC pada MPS Draft atau Confirmed."}`;
    }
    function render(data) {
      current = data;
      select.value = data.mps ? data.etaGate?.mode || "MANUAL" : draftModes.get(data.period) || "MANUAL";
      update();
    }
    function creationOptions() {
      if (busy) throw Error("Sumber ETA sedang disimpan. Tunggu sampai selesai.");
      if (current?.mps && select.value !== (current.etaGate?.mode || "MANUAL")) throw Error("Simpan sumber ETA MPS sebelum melanjutkan proses.");
      return current?.mps ? {} : { etaMode: select.value };
    }
    select.addEventListener("change", () => {
      if (!current?.mps) draftModes.set(current?.period, select.value);
      update();
    });
    save.addEventListener("click", async () => {
      if (save.disabled || !current?.mps || busy) return;
      const doc = current.mps, mode = select.value, version = current.etaGate?.modeVersion || 0;
      busy = true; update();
      try {
        const result = await request(`/modules/api/planning-ppic/mps/${encodeURIComponent(doc.mpsNumber)}/eta-mode`, {
          method: "PATCH", body: JSON.stringify({ etaMode: mode, revision: doc.revision, etaModeVersion: version }),
        });
        if (current?.mps?.mpsNumber === doc.mpsNumber) {
          current.etaGate = { ...current.etaGate, mode: result.etaMode, modeVersion: result.etaModeVersion };
          select.value = result.etaMode;
        }
        await reload();
        notify(`${doc.mpsNumber}: sumber ETA ${label(mode)} tersimpan.`, true);
      } catch (error) {
        // Refresh after an uncertain/stale save before allowing a retry.
        try { await reload(); } catch (_) { /* Keep the original save error visible. */ }
        notify(error.message);
      } finally { busy = false; update(); }
    });
    return { render, creationOptions };
  } };
})();
