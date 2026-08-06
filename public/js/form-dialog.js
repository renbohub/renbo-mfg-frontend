(function () {
  window.formPrompt = function (label, initial = "", options = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "ops-modal-backdrop";
      wrap.innerHTML = `<form class="ops-modal" style="max-width:520px"><header><div><p class="ops-eyebrow">Input diperlukan</p><h2>${String(options.title || "Lengkapi data").replace(/[<>&]/g, "")}</h2></div><button type="button" class="btn-close" data-cancel aria-label="Tutup"></button></header><div class="ops-modal-body"><label class="form-label">${String(label).replace(/[<>&]/g, "")}</label><input class="form-control" data-value required></div><footer><button type="button" class="btn btn-outline-secondary" data-cancel>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></footer></form>`;
      document.body.appendChild(wrap);
      const input = wrap.querySelector("[data-value]"); input.value = initial ?? ""; input.focus();
      const close = (value) => { wrap.remove(); resolve(value); };
      wrap.querySelectorAll("[data-cancel]").forEach((el) => el.addEventListener("click", () => close(null)));
      wrap.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); close(input.value); });
    });
  };
})();
