(function () {
  if (window.DeliveryWorkflow) return;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const stylesheet = document.createElement("link"); stylesheet.rel = "stylesheet"; stylesheet.href = "/css/delivery-workflow.css?v=20260908-1"; document.head.appendChild(stylesheet);
  let openDialog = null;
  const readFile = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("File tidak dapat dibaca.")); reader.readAsDataURL(file); });
  function collect(action, record = {}) {
    if (openDialog) return Promise.resolve(null);
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog"); openDialog = dialog; dialog.className = "delivery-dialog";
      const pod = action === "pod";
      const field = (name, label, value = "", required = false) => `<label>${label}<input class="form-control" name="${name}" maxlength="${name === "driver" || name === "carrier" || name === "receivedBy" ? 200 : 100}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
      dialog.innerHTML = `<form><h2>${pod ? "Konfirmasi penerimaan (POD)" : "Data pengiriman"}</h2><p>${esc(record.scheduleNumber)} · SO ${esc(record.soNumber)}</p><div class="delivery-dialog__fields">${pod
        ? `${field("receivedBy", "Nama penerima *", "", true)}<label>Bukti foto / dokumen (opsional, maks. 5 MB)<input class="form-control" type="file" name="podFile" accept="image/png,image/jpeg,application/pdf"><small>PNG, JPG, atau PDF. Pilih foto dari kamera atau galeri perangkat.</small></label><div><label for="delivery-signature">Tanda tangan penerima (opsional)</label><canvas id="delivery-signature" width="720" height="240" aria-label="Area tanda tangan penerima menggunakan jari atau mouse"></canvas><button type="button" class="btn btn-sm btn-outline-secondary" data-clear-signature>Hapus tanda tangan</button></div>`
        : `${field("driver", "Pengemudi", record.driver)}${field("carrier", "Kurir / ekspedisi", record.carrier)}<p class="delivery-dialog__hint">Isi minimal pengemudi atau kurir / ekspedisi.</p>${field("vehicle", "Kendaraan / nomor polisi", record.vehicle)}${field("trackingNumber", "Nomor resi / tracking", record.trackingNumber)}${field("shippingMethod", "Metode pengiriman", record.shippingMethod)}`}</div><label class="delivery-dialog__confirm"><input type="checkbox" name="confirmed" required> ${pod ? "Saya memastikan barang pada surat jalan telah diterima sesuai kuantitas yang tercantum." : "Saya memastikan penugasan dan data pengiriman sudah benar."}</label><p class="delivery-dialog__error" role="alert"></p><div class="delivery-dialog__actions"><button type="button" class="btn btn-outline-secondary" data-cancel>Batal</button><button type="submit" class="btn btn-primary">${pod ? "Simpan POD" : "Kirim shipment"}</button></div></form>`;
      document.body.appendChild(dialog);
      const form = dialog.querySelector("form"); const canvas = dialog.querySelector("canvas");
      let drew = false; let drawing = false; let strokes = 0;
      if (canvas) {
        const ctx = canvas.getContext("2d"); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#102a43";
        const point = (event) => { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height]; };
        canvas.addEventListener("pointerdown", (event) => { drawing = true; canvas.setPointerCapture(event.pointerId); ctx.beginPath(); ctx.moveTo(...point(event)); });
        canvas.addEventListener("pointermove", (event) => { if (!drawing) return; ctx.lineTo(...point(event)); ctx.stroke(); drew = true; strokes += 1; });
        ["pointerup", "pointercancel"].forEach((type) => canvas.addEventListener(type, () => { drawing = false; }));
        dialog.querySelector("[data-clear-signature]").addEventListener("click", () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drew = false; strokes = 0; });
      }
      let settled = false;
      const close = (result) => { if (settled) return; settled = true; dialog.close(); dialog.remove(); openDialog = null; resolve(result); };
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(null); });
      dialog.querySelector("[data-cancel]").addEventListener("click", () => close(null));
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); if (!form.reportValidity()) return;
        const button = form.querySelector('[type="submit"]'); if (button.disabled) return; button.disabled = true;
        try {
          const result = { confirmed: true };
          for (const name of pod ? ["receivedBy"] : ["driver", "carrier", "vehicle", "trackingNumber", "shippingMethod"]) result[name] = form.elements[name].value.trim();
          if (pod) {
            if (!result.receivedBy) throw new Error("Nama penerima wajib diisi.");
            const file = form.elements.podFile.files[0];
            if (file) {
              if (file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "application/pdf"].includes(file.type)) throw new Error("Bukti harus PNG, JPG, atau PDF maksimal 5 MB.");
              result.podFile = { name: file.name, dataUrl: await readFile(file) };
            }
            if (drew && strokes >= 2) result.receivedSignature = canvas.toDataURL("image/png");
          } else if (!result.driver && !result.carrier) throw new Error("Isi pengemudi atau kurir / ekspedisi.");
          close(result);
        } catch (error) { dialog.querySelector('[role="alert"]').textContent = error.message; button.disabled = false; }
      });
      dialog.showModal(); form.querySelector("input")?.focus();
    });
  }
  window.DeliveryWorkflow = { collect, isOpen: () => Boolean(openDialog) };
})();
