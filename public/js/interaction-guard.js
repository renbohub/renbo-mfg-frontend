(function () {
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  window.confirmAction = function confirmAction(message, options = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "ops-modal-backdrop interaction-confirm-backdrop";
      wrap.innerHTML = `<section class="ops-modal interaction-confirm" role="alertdialog" aria-modal="true" aria-labelledby="interaction-confirm-title">
        <header><div><p class="ops-eyebrow">Konfirmasi tindakan</p><h2 id="interaction-confirm-title">${escapeHtml(options.title || "Pastikan tindakan")}</h2></div><button type="button" class="btn-close" data-confirm-cancel aria-label="Tutup"></button></header>
        <div class="ops-modal-body"><p>${escapeHtml(message || "Lanjutkan tindakan ini?")}</p>${options.detail ? `<small>${escapeHtml(options.detail)}</small>` : ""}</div>
        <footer><button type="button" class="btn btn-outline-secondary" data-confirm-cancel>Batal</button><button type="button" class="btn btn-danger" data-confirm-accept>${escapeHtml(options.confirmLabel || "Ya, lanjutkan")}</button></footer>
      </section>`;
      document.body.appendChild(wrap);
      const close = (value) => { document.removeEventListener("keydown", onKey); wrap.remove(); resolve(value); };
      const onKey = (event) => { if (event.key === "Escape") close(false); };
      document.addEventListener("keydown", onKey);
      wrap.querySelectorAll("[data-confirm-cancel]").forEach((button) => button.addEventListener("click", () => close(false)));
      wrap.querySelector("[data-confirm-accept]").addEventListener("click", () => close(true));
      wrap.addEventListener("click", (event) => { if (event.target === wrap) close(false); });
      requestAnimationFrame(() => wrap.querySelector("[data-confirm-accept]")?.focus());
    });
  };

  const destructive = (element) => {
    const text = `${element.dataset.action || ""} ${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`;
    return element.matches("[data-confirm-delete],[data-delete]") || /\b(delete|remove|hapus)\b/i.test(text);
  };
  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest("button,a");
    if (!trigger || !destructive(trigger) || trigger.dataset.confirmedOnce === "true") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const confirmed = await window.confirmAction(trigger.dataset.confirmMessage || "Data yang dihapus mungkin sudah dipakai sebagai referensi. Yakin ingin melanjutkan?", { title: "Konfirmasi hapus", confirmLabel: "Ya, hapus data" });
    if (!confirmed) return;
    trigger.dataset.confirmedOnce = "true";
    const nativeConfirm = window.confirm;
    window.confirm = () => true;
    try { trigger.click(); }
    finally {
      window.confirm = nativeConfirm;
      delete trigger.dataset.confirmedOnce;
    }
  }, true);
})();
