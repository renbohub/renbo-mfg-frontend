(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const form = document.getElementById("inventory-form");
  const alertBox = document.getElementById("inventory-form-alert");
  const stockSelect = document.getElementById("stockBalanceId");
  const partSelect = document.getElementById("targetPartCode");
  const allocationQty = document.getElementById("allocationQty");
  const addButton = document.getElementById("reservation-add-line");
  const allocationBody = document.getElementById("reservation-allocation-body");
  const state = { stocks: [], parts: [], selectedStock: null, allocations: [] };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const num = (value) => Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 6 });
  const value = (id) => document.getElementById(id)?.value?.trim() || "";
  const show = (message, type = "danger") => { alertBox.textContent = message; alertBox.className = `alert alert-${type}`; };

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, ...(options.body ? { "Content-Type": "application/json" } : {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Data gagal diproses.");
    return payload;
  }

  function setToday() {
    const now = new Date();
    document.getElementById("reservationDate").value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function allocatedQty() { return state.allocations.reduce((sum, row) => sum + Number(row.qty || 0), 0); }
  function remainingFreeStock() { return Math.max(Number(state.selectedStock?.freeStockQty || 0) - allocatedQty(), 0); }

  async function loadStocks() {
    try {
      const payload = await request("/modules/api/inventory/stock-reservations/stock-options");
      state.stocks = payload.items || [];
      stockSelect.innerHTML = '<option value="">Pilih material / lokasi stock</option>' + state.stocks.map((row) => `<option value="${esc(row.id)}">${esc(row.materialCode)} · ${esc(row.materialName || row.materialType || "-")} · ${esc(row.warehouseCode)} / ${esc(row.rackCode || "Tanpa rack")} / ${esc(row.lotNumber || "Tanpa lot")} · Free ${num(row.freeStockQty)} ${esc(row.uomCode || "")}</option>`).join("");
      stockSelect.disabled = !state.stocks.length;
      if (!state.stocks.length) show("Belum ada material dengan free stock.", "warning");
    } catch (error) { show(error.message); }
  }

  function renderPartOptions() {
    const available = state.parts.filter((part) => !state.allocations.some((row) => row.partCode === part.partCode));
    partSelect.innerHTML = '<option value="">Pilih part RAW MATERIAL terkait</option>' + available.map((part) => `<option value="${esc(part.partCode)}">${esc(part.partCode)} · ${esc(part.partNumber || "Tanpa PN")} · ${esc(part.partName || "-")}</option>`).join("");
    partSelect.disabled = !state.selectedStock || !available.length;
  }

  async function loadRelatedParts() {
    state.parts = [];
    partSelect.innerHTML = '<option value="">Memuat part RAW MATERIAL terkait...</option>';
    partSelect.disabled = true;
    if (!state.selectedStock) return;
    try {
      const payload = await request(`/modules/api/inventory/stock-reservations/part-options?stockBalanceId=${encodeURIComponent(state.selectedStock.id)}`);
      state.parts = payload.items || [];
      renderPartOptions();
      if (state.parts.length === 1) {
        partSelect.value = state.parts[0].partCode;
        syncEditor();
        show(`Part ${state.parts[0].partCode} dipilih otomatis karena material ini hanya memiliki satu part RAW MATERIAL.`, "info");
      } else if (!state.parts.length) show(`Material ${state.selectedStock.materialCode} belum terhubung ke part RAW MATERIAL.`, "warning");
      else show(`Material ini digunakan oleh ${state.parts.length} part RAW MATERIAL. Pilih part tujuan secara manual.`, "info");
    } catch (error) { show(error.message); }
  }

  async function selectStock() {
    const next = state.stocks.find((row) => row.id === stockSelect.value) || null;
    if (state.allocations.length && state.selectedStock?.id !== next?.id && !window.confirm("Ganti material akan mengosongkan daftar alokasi part. Lanjutkan?")) {
      stockSelect.value = state.selectedStock?.id || "";
      return;
    }
    if (state.selectedStock?.id !== next?.id) state.allocations = [];
    state.selectedStock = next;
    renderStock(); renderAllocations(); syncEditor();
    await loadRelatedParts();
  }

  function renderStock() {
    const box = document.getElementById("reservation-stock-summary");
    if (!state.selectedStock) { box.classList.add("d-none"); return; }
    const stock = state.selectedStock;
    box.classList.remove("d-none");
    box.innerHTML = `<article><small>Material</small><strong>${esc(stock.materialCode)}</strong><span>${esc(stock.materialName || stock.materialType || "-")}</span></article><article><small>On Hand</small><strong>${num(stock.qtyOnHand)}</strong><span>${esc(stock.uomCode || "")}</span></article><article><small>Reserved Existing</small><strong>${num(stock.qtyReserved)}</strong><span>QC ${num(stock.qtyQC)}</span></article><article><small>Free / Sisa Form</small><strong>${num(stock.freeStockQty)} / ${num(remainingFreeStock())}</strong><span>${esc(stock.warehouseCode)} · ${esc(stock.rackCode || "Tanpa rack")}</span></article>`;
  }

  function syncEditor() {
    const enabled = Boolean(state.selectedStock && partSelect.value && remainingFreeStock() > 0);
    allocationQty.disabled = !state.selectedStock;
    allocationQty.max = remainingFreeStock();
    addButton.disabled = !enabled;
  }

  function addAllocation() {
    const part = state.parts.find((row) => row.partCode === partSelect.value);
    const qty = Number(allocationQty.value);
    if (!state.selectedStock || !part) return show("Pilih material stock dan part RAW MATERIAL terkait.");
    if (!(qty > 0) || qty > remainingFreeStock() + 0.0000001) return show(`Qty harus lebih besar dari 0 dan maksimal ${num(remainingFreeStock())} ${state.selectedStock.uomCode || ""}.`);
    state.allocations.push({ ...part, qty });
    allocationQty.value = "";
    renderPartOptions(); renderAllocations(); renderStock(); syncEditor();
    show(`Alokasi untuk ${part.partCode} ditambahkan.`, "success");
  }

  function renderAllocations() {
    document.getElementById("reservation-allocation-count").textContent = `${state.allocations.length} part`;
    document.getElementById("reservation-allocation-help").textContent = state.selectedStock
      ? `Total ${num(allocatedQty())} ${state.selectedStock.uomCode || ""}; sisa free stock ${num(remainingFreeStock())}.`
      : "Total reserve tidak boleh melebihi free stock.";
    if (!state.allocations.length) {
      allocationBody.innerHTML = '<tr><td colspan="7" class="inventory-batch-empty">Belum ada alokasi part RAW MATERIAL.</td></tr>';
      return;
    }
    allocationBody.innerHTML = state.allocations.map((row, index) => `<tr><td>${index + 1}</td><td><b>${esc(row.partCode)}</b></td><td>${esc(row.partNumber || "-")}</td><td>${esc(row.partName || "-")}</td><td class="inventory-batch-qty">${num(row.qty)}</td><td>${esc(state.selectedStock?.uomCode || "")}</td><td><button class="inventory-batch-remove" type="button" data-remove-allocation="${index}" title="Hapus">×</button></td></tr>`).join("");
  }

  stockSelect.addEventListener("change", selectStock);
  partSelect.addEventListener("change", syncEditor);
  allocationQty.addEventListener("input", syncEditor);
  addButton.addEventListener("click", addAllocation);
  allocationBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-allocation]");
    if (!button) return;
    state.allocations.splice(Number(button.dataset.removeAllocation), 1);
    renderPartOptions(); renderAllocations(); renderStock(); syncEditor();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || !state.selectedStock || !state.allocations.length) return show("Pilih material stock dan tambahkan minimal satu part RAW MATERIAL terkait.");
    if (allocatedQty() > Number(state.selectedStock.freeStockQty) + 0.0000001) return show("Total alokasi melebihi free stock.");
    const submit = document.getElementById("inventory-submit");
    try {
      submit.disabled = true;
      const payload = await request("/modules/api/inventory/stock-reservations", { method: "POST", body: JSON.stringify({
        stockBalanceId: state.selectedStock.id,
        reservationDate: value("reservationDate"),
        expiryDate: value("expiryDate") || null,
        notes: value("notes") || null,
        items: state.allocations.map((row) => ({ targetPartCode: row.partCode, qty: row.qty })),
      }) });
      show(payload.message || "Stock berhasil di-reserve ke part RAW MATERIAL.", "success");
      setTimeout(() => location.assign("/modules/inventory/stock-reservations"), 700);
    } catch (error) { show(error.message); submit.disabled = false; }
  });

  setToday(); renderAllocations(); syncEditor(); loadStocks();
})();
