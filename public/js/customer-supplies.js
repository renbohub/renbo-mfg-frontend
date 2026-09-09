(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(v) || 0);
  const day = (v) => v ? new Date(v).toISOString().slice(0, 10) : "—";
  const today = () => day(globalThis.erpBusinessNow?.() || new Date());
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const base = "/modules/api/incoming/customer-supplies";
  let options = { materials: [], warehouses: [], uoms: [] }, requests = [], needs = [], page = 1, total = 0, currentForm;
  const expanded = new Set();
  let loadedRun = "", needsVersion = 0;
  function renderRunOptions() {
    const runs = options.mrpRuns || [];
    $("cs-run").innerHTML = `<option value="">${runs.length ? "Pilih MRP run" : "Belum ada MRP run"}</option>` + runs.map((run) => {
      const period = run.planningMonth ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(run.planningMonth)) : "Periode —";
      const status = ["running", "failed"].includes(String(run.status).toLowerCase()) ? run.status : run.scenarioStatus || run.status;
      return `<option value="${esc(run.runNumber)}">${esc(run.runNumber)} · ${esc(period)} · ${esc(status)}</option>`;
    }).join("");
    $("cs-run").disabled = !runs.length;
  }
  const labels = { REQUESTED: "Diminta", PLANNED: "Rencana", CONFIRMED: "Dikonfirmasi", CANCELLED: "Dibatalkan", PENDING: "Menunggu QC", COMPLETED: "QC selesai" };
  async function api(path = "", body) {
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token()}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; throw new Error("Silakan login kembali."); }
    if (!response.ok) throw new Error(data.message || "Data gagal diproses.");
    return data;
  }
  function message(value, error = false) { $("cs-message").className = `alert ${error ? "alert-danger" : "alert-success"}`; $("cs-message").textContent = value; }
  const button = (label, action, req, child = "") => `<button type="button" class="btn btn-sm btn-outline-primary" data-action="${action}" data-request="${esc(req)}" data-child="${esc(child)}">${label}</button>`;
  const table = (headers, rows) => `<div class="cs-table-wrap"><table class="cs-table" data-enterprise-table="off"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="cs-empty">Belum ada data.</td></tr>`}</tbody></table></div>`;
  const chip = (status) => `<span class="cs-chip ${["PLANNED", "PENDING"].includes(status) ? "warn" : ""}">${esc(labels[status] || status)}</span>`;
  function details(r) {
    const shipments = r.shipments.map((s) => {
      const received = s.receipts.reduce((a, x) => a + x.receivedQty, 0);
      return `<tr><td>${day(s.eta)}<small>Siap QC: ${day(s.readyDate)}</small></td><td class="qty">${fmt(s.qty)} ${esc(r.uomCode)}<small>Terima ${fmt(received)}</small></td><td>${chip(s.status)}<small>${esc(s.confirmationReference || "Belum ada konfirmasi customer")}</small></td><td>${s.status === "PLANNED" ? button("Konfirmasi", "confirm", r.id, s.id) : ""}${s.status === "CONFIRMED" && received < s.qty ? button("Terima", "receive", r.id, s.id) : ""}${s.status !== "CANCELLED" && received < s.qty ? button("Ubah ETA sisa", "reschedule", r.id, s.id) : ""}${s.status !== "CANCELLED" && !s.receipts.length ? button("Batalkan", "cancel", r.id, s.id) : ""}</td></tr>`;
    }).join("");
    const receipts = r.shipments.flatMap((s) => s.receipts).map((x) => `<tr><td>${esc(x.receiptNumber)}<small>${esc(x.deliveryNoteNumber)} · ${day(x.receivedDate)}</small></td><td>${esc(x.warehouseCode)}<small>Lot ${esc(x.lotNumber)}</small></td><td class="qty">${fmt(x.receivedQty)} ${esc(r.uomCode)}</td><td>${chip(x.qcStatus)}<small>Lolos ${fmt(x.acceptedQty)} · Reject ${fmt(x.rejectedQty)}</small></td><td>${x.qcStatus === "PENDING" ? button("Hasil QC", "inspect", r.id, x.id) : esc(x.qcReference || "")}</td></tr>`).join("");
    return `<h3>Jadwal kiriman ${r.status !== "CANCELLED" ? button("＋ Kiriman", "shipment", r.id) : chip(r.status)} ${r.status !== "CANCELLED" && !r.shipments.some((s) => s.receipts.length) ? button("Batalkan permintaan", "cancel-request", r.id) : ""}</h3>${table(["ETA / siap dipakai", "Qty", "Konfirmasi", "Aksi"], shipments)}<h3>Penerimaan & QC</h3>${table(["Penerimaan / surat jalan", "Lokasi", "Qty terima", "QC", "Aksi"], receipts)}<details><summary class="small mt-3">Riwayat perubahan</summary><pre>${esc(JSON.stringify(r.history, null, 2))}</pre></details>`;
  }
  function render() {
    $("cs-requests").innerHTML = table(["Permintaan", "Customer / material", "Dibutuhkan", "Diminta", "Konfirmasi", "Terima", "QC hold", "Aksi"], requests.map((r) => `<tr><td>${esc(r.requestNumber)}<small>${esc(r.sourceRunNumber || "Permintaan manual")}</small></td><td>${esc(r.customerCode)} · ${esc(r.materialCode || r.partCode)}<small>${esc(r.partCode)} · ${esc(options.materials.find((m) => m.partCode === r.partCode)?.partName || "")}</small></td><td>${day(r.requiredDate)}</td><td class="qty">${fmt(r.qtyRequested)} ${esc(r.uomCode)}</td><td class="qty">${fmt(r.confirmedQty)}</td><td class="qty">${fmt(r.receivedQty)}</td><td class="qty">${fmt(r.pendingQcQty)}</td><td>${button(expanded.has(r.id) ? "▾ Tutup" : "▸ Detail", "expand", r.id)}</td></tr>${expanded.has(r.id) ? `<tr><td colspan="8" class="cs-detail">${details(r)}</td></tr>` : ""}`).join(""));
    $("cs-stock").innerHTML = table(["Pemilik / material", "Gudang / lot", "Lolos QC", "Keluar", "Tersedia", "Aksi"], requests.flatMap((r) => r.shipments.flatMap((s) => s.receipts.filter((x) => x.qcStatus === "COMPLETED").map((x) => `<tr><td>${esc(r.customerCode)} · ${esc(r.materialCode || r.partCode)}<small>${esc(x.receiptNumber)}</small></td><td>${esc(x.warehouseCode)}<small>${esc(x.lotNumber)}</small></td><td class="qty">${fmt(x.acceptedQty)}</td><td class="qty">${fmt(x.issuedQty)}</td><td class="qty">${fmt(x.acceptedQty - x.issuedQty)} ${esc(r.uomCode)}</td><td>${x.acceptedQty > x.issuedQty ? button("Keluar produksi", "issue", r.id, x.id) : "—"}</td></tr>`))).join(""));
    $("cs-page-info").textContent = `${total} permintaan · Halaman ${page}`;
    $("cs-prev").disabled = page <= 1; $("cs-next").disabled = page * 50 >= total;
  }
  async function reload() { const result = await api(`?limit=50&page=${page}&q=${encodeURIComponent($("cs-search").value)}`); requests = result.items; total = result.total; render(); }
  async function loadNeeds() {
    const run = $("cs-run").value, version = ++needsVersion;
    loadedRun = ""; needs = [];
    $("cs-load-mrp").disabled = true;
    $("cs-needs").textContent = run ? "Memuat kebutuhan…" : "Pilih MRP run untuk melihat kebutuhan material customer.";
    if (!run) return;
    let data;
    try { data = await api(`/mrp/${encodeURIComponent(run)}`); }
    catch (error) {
      if (version !== needsVersion) return;
      $("cs-needs").textContent = "Kebutuhan gagal dimuat. Klik Lihat kebutuhan untuk mencoba lagi.";
      throw error;
    } finally { if (version === needsVersion) $("cs-load-mrp").disabled = !$("cs-run").value; }
    if (version !== needsVersion || $("cs-run").value !== run) return;
    loadedRun = run; needs = data.items;
    if (!needs.length) { $("cs-needs").textContent = "Tidak ada kebutuhan material suplai customer pada run ini."; return; }
    $("cs-needs").innerHTML = table(["Pilih", "Material / customer", "FG pemakai", "Dibutuhkan", "Kebutuhan net", "Permintaan"], needs.map((r) => `<tr><td><input type="checkbox" aria-label="Pilih ${esc(r.partCode)} ${day(r.requiredDate)}" data-need="${esc(r.id)}" ${r.requestedIn || Number(r.firmNetRequirement ?? r.netRequirement) <= 0 ? "disabled" : ""}></td><td>${esc(r.partCode)}<small>${esc(r.supplyCustomerCode)}</small></td><td>${esc(r.fgPartCode || r.rootDemandSourceNumber || "—")}</td><td>${day(r.materialRequiredDate || r.requiredDate)}</td><td class="qty">${fmt(r.firmNetRequirement ?? r.netRequirement)} ${esc(r.uomCode)}</td><td>${esc(r.requestedIn || "Belum diminta")}</td></tr>`).join("")) + '<button type="button" id="cs-create-mrp" class="btn btn-primary mt-3">Buat permintaan terpilih per minggu</button>';
  }
  const field = (name, label, type = "text", value = "", extra = "") => `<label>${label}<input class="form-control" name="${name}" type="${type}" value="${esc(value)}" required ${extra}></label>`;
  const qtyField = (name, label, value, min = "0.000001") => field(name, label, "number", value, `min="${min}" step="0.000001"`);
  function dialog(title, html, path, transform = (x) => x) {
    currentForm = { path, transform, idempotencyKey: crypto.randomUUID() };
    $("cs-form-title").textContent = title; $("cs-form-fields").innerHTML = html; $("cs-form-error").textContent = "";
    $("cs-dialog").showModal();
  }
  function openAction(action, id, childId) {
    const r = requests.find((x) => x.id === id); if (!r) return;
    const s = r.shipments.find((x) => x.id === childId), receipt = r.shipments.flatMap((x) => x.receipts).find((x) => x.id === childId);
    const p = `/${encodeURIComponent(id)}`;
    if (action === "cancel-request") dialog("Batalkan permintaan suplai customer", field("reason", "Alasan pembatalan"), `${p}/cancel`);
    if (action === "expand") { expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); }
    if (action === "shipment") dialog(`Jadwal kiriman · ${r.customerCode}`, qtyField("qty", `Qty (${r.uomCode})`, Math.max(0, r.qtyRequested - r.shipments.filter((x) => x.status !== "CANCELLED").reduce((a, x) => a + x.qty, 0))) + field("eta", "ETA tiba di pabrik", "date") + field("readyDate", "Siap dipakai setelah QC", "date"), `${p}/shipments`);
    if (action === "confirm") dialog(`Konfirmasi ${fmt(s.qty)} ${r.uomCode} · ETA ${day(s.eta)}`, field("confirmationReference", "Referensi konfirmasi dari customer"), `${p}/shipments/${childId}/confirm`);
    if (action === "cancel") dialog("Batalkan kiriman / ganti jadwal", field("reason", "Alasan (buat kiriman baru untuk jadwal revisi)"), `${p}/shipments/${childId}/cancel`);
    if (action === "reschedule") dialog("Ubah ETA sisa kiriman · perlu konfirmasi ulang", field("eta", "ETA tiba", "date", day(s.eta)) + field("readyDate", "Siap setelah QC", "date", day(s.readyDate)) + field("reason", "Alasan perubahan"), `${p}/shipments/${childId}/reschedule`);
    if (action === "receive") dialog("Penerimaan material customer · QC hold", qtyField("receivedQty", `Qty terima (${r.uomCode})`, s.qty - s.receipts.reduce((a, x) => a + x.receivedQty, 0)) + field("receivedDate", "Tanggal diterima", "date", today()) + `<label>Gudang<select name="warehouseCode" class="form-select" required><option value="">Pilih gudang</option>${options.warehouses.map((w) => `<option value="${esc(w.warehouseCode)}">${esc(w.warehouseCode)} · ${esc(w.warehouseName)}</option>`).join("")}</select></label>` + field("lotNumber", "Lot material") + field("deliveryNoteNumber", "Nomor surat jalan"), `${p}/shipments/${childId}/receive`);
    if (action === "inspect") dialog(`Hasil QC · ${fmt(receipt.receivedQty)} ${r.uomCode} diterima`, qtyField("acceptedQty", "Qty lolos QC", "", "0") + qtyField("rejectedQty", "Qty reject", "", "0") + field("qcReference", "Nomor/referensi hasil inspeksi"), `${p}/receipts/${childId}/inspect`);
    if (action === "issue") dialog(`Keluar produksi · stok milik ${r.customerCode}`, qtyField("qty", `Qty keluar (${r.uomCode})`, "") + field("reference", "Referensi pengeluaran produksi / MO"), `${p}/receipts/${childId}/issue`);
  }
  $("cs-new").addEventListener("click", () => dialog("Permintaan material customer", `<label class="full">Material & customer pemilik<select name="materialIndex" class="form-select" required><option value="">Pilih material</option>${options.materials.map((m, i) => `<option value="${i}">${esc(m.customerCode)} · ${esc(m.materialCode || m.partCode)} · ${esc(m.partCode)}</option>`).join("")}</select></label>` + qtyField("qtyRequested", "Qty diminta", "") + `<label>Satuan<select class="form-select" name="uomCode" required><option value="">Pilih satuan</option>${options.uoms.map((u) => `<option value="${esc(u.uomCode)}">${esc(u.uomCode)}</option>`).join("")}</select></label>` + field("requiredDate", "Tanggal dibutuhkan", "date") + '<label>Catatan<input class="form-control" name="notes"></label>', "", (v) => ({ ...v, partCode: options.materials[Number(v.materialIndex)].partCode, customerCode: options.materials[Number(v.materialIndex)].customerCode })));
  $("cs-close").addEventListener("click", () => $("cs-dialog").close());
  $("cs-form-fields").addEventListener("change", (event) => {
    if (event.target.name === "materialIndex") {
      const material = options.materials[Number(event.target.value)];
      const unit = $("cs-form").elements.namedItem("uomCode");
      if (material && unit) unit.value = material.uomCode || "";
    }
  });
  $("cs-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const submit = event.submitter; submit.disabled = true;
    try {
      const input = currentForm.transform(Object.fromEntries(new FormData(event.target)));
      await api(currentForm.path, { ...input, idempotencyKey: currentForm.idempotencyKey });
      $("cs-dialog").close(); message("Tersimpan. Hitung ulang checksheet/MRP untuk memakai data suplai terbaru."); await reload();
    } catch (e) { $("cs-form-error").textContent = e.message; } finally { submit.disabled = false; }
  });
  $("cs-page-info").closest("main").addEventListener("click", async (event) => {
    const b = event.target.closest("[data-action]"); if (b) openAction(b.dataset.action, b.dataset.request, b.dataset.child);
    if (event.target.id === "cs-create-mrp") {
      const target = event.target; target.disabled = true;
      try { if (!loadedRun || loadedRun !== $("cs-run").value) throw new Error("Muat kebutuhan MRP run terpilih terlebih dahulu."); const ids = [...document.querySelectorAll("[data-need]:checked")].map((x) => x.dataset.need); if (!ids.length) throw new Error("Pilih kebutuhan terlebih dahulu."); const result = await api("/from-mrp", { runNumber: loadedRun, requirementIds: ids }); message(`${result.count} permintaan dibuat, dikelompokkan per material/customer/minggu.`); await Promise.all([reload(), loadNeeds()]); } catch (e) { message(e.message, true); } finally { target.disabled = false; }
    }
  });
  $("cs-refresh").addEventListener("click", () => reload().catch((e) => message(e.message, true)));
  $("cs-load-mrp").addEventListener("click", () => loadNeeds().catch((e) => message(e.message, true)));
  $("cs-run").addEventListener("change", () => {
    $("cs-message").className = "alert d-none";
    const url = new URL(location.href);
    $("cs-run").value ? url.searchParams.set("run", $("cs-run").value) : url.searchParams.delete("run");
    history.replaceState(null, "", url);
    loadNeeds().catch((e) => message(e.message, true));
  });
  $("cs-prev").addEventListener("click", () => { page--; reload().catch((e) => message(e.message, true)); });
  $("cs-next").addEventListener("click", () => { page++; reload().catch((e) => message(e.message, true)); });
  let timer; $("cs-search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; reload().catch((e) => message(e.message, true)); }, 300); });
  (async () => {
    try { options = await api("/options"); }
    catch (error) { $("cs-run").innerHTML = '<option value="">Daftar run gagal dimuat — muat ulang halaman</option>'; throw error; }
    renderRunOptions();
    $("cs-search").value = new URLSearchParams(location.search).get("q") || "";
    const run = new URLSearchParams(location.search).get("run");
    if (run && !(options.mrpRuns || []).some((r) => r.runNumber === run)) {
      message(`MRP run ${run} tidak tersedia. Pilih run lain.`, true);
    } else if (run) { $("cs-run").value = run; }
    await Promise.all([reload(), loadNeeds()]);
  })().catch((e) => message(e.message, true));
})();
