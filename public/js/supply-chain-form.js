(function () {
  const config = JSON.parse(document.getElementById("supply-form-config").textContent); const $ = (id) => document.getElementById(id); const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0; const value = (id) => $(id)?.value?.trim() || "";
  const show = (message, type = "danger") => { const box = $("supply-form-alert"); box.textContent = message; box.className = `alert alert-${type}`; };
  const isIncoming = config.module === "incoming";
  let incomingRacks = [];
  const rackOptions = (warehouseCode, selected = "") => {
    const rows = incomingRacks.filter((rack) => rack.isActive !== false && rack.warehouseCode === warehouseCode);
    return `<option value="">${warehouseCode ? "Tanpa rack" : "Pilih warehouse terlebih dahulu"}</option>${rows.map((rack) => `<option value="${esc(rack.rackCode)}" ${rack.rackCode === selected ? "selected" : ""}>${esc(rack.rackCode)} — ${esc(rack.rackName || rack.zone || "")}</option>`).join("")}`;
  };
  async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Permintaan gagal."); return payload.data || payload.item || payload; }
  async function loadSource() {
    const source = value("sourceNumber"); if (!source) return show(isIncoming ? "Nomor PO wajib diisi." : "Nomor SO wajib diisi.");
    try {
      const doc = await api(isIncoming ? `/modules/api/purchasing/purchase-order/${encodeURIComponent(source)}` : `/modules/api/sales/sales-orders/${encodeURIComponent(source)}`);
      const details = Array.isArray(doc.details) ? doc.details : [];
      const rows = details.map((row) => { const ordered = num(row.qty); const used = num(isIncoming ? row.qtyReceived : row.qtyDelivered); const outstanding = Math.max(ordered - used, 0); return { id: row.id, code: row.materialCode || row.partCode || row.part?.partCode || "-", name: row.materialName || row.partName || row.part?.partName || row.description || "-", outstanding, uom: row.uomCode || "" }; }).filter((row) => row.outstanding > 0);
      $("supply-detail-body").innerHTML = rows.map((row) => `<tr data-source-detail="${esc(row.id)}"><td><b>${esc(row.code)}</b><small class="d-block">${esc(row.name)}</small></td><td>${esc(row.outstanding)} ${esc(row.uom)}</td><td><input data-qty class="form-control form-control-sm" type="number" min="0" max="${esc(row.outstanding)}" step="any" value="${esc(row.outstanding)}"></td><td>${isIncoming ? `<div class="d-grid gap-1"><input data-lot class="form-control form-control-sm" placeholder="Lot supplier / internal"><select data-rack class="form-select form-select-sm">${rackOptions(value("warehouseCode"))}</select></div>` : '<input data-line-notes class="form-control form-control-sm" placeholder="Catatan schedule">'}</td></tr>`).join("") || '<tr><td colspan="4" class="ops-muted">Tidak ada qty outstanding.</td></tr>';
      if (!isIncoming && !value("deliveryAddress")) $("deliveryAddress").value = doc.shippingAddress || "";
    } catch (error) { show(error.message); }
  }
  $("supply-load-source").addEventListener("click", loadSource);
  $("supply-form").addEventListener("submit", async (event) => { event.preventDefault(); const rows = [...document.querySelectorAll("[data-source-detail]")].map((row) => ({ id: row.dataset.sourceDetail, qty: num(row.querySelector("[data-qty]")?.value), lot: row.querySelector("[data-lot]")?.value?.trim() || null, rack: row.querySelector("[data-rack]")?.value?.trim() || null, notes: row.querySelector("[data-line-notes]")?.value?.trim() || null })).filter((row) => row.qty > 0); if (!rows.length) return show("Pilih minimal satu qty transaksi."); const source = value("sourceNumber"); const body = isIncoming ? { poNumber: source, warehouseCode: value("warehouseCode"), deliveryNoteNumber: value("deliveryNoteNumber") || null, notes: value("notes") || null, details: rows.map((row) => ({ poDetailId: row.id, qtyReceived: row.qty, lotNumber: row.lot, rackCode: row.rack })) } : { soNumber: source, plannedDate: value("plannedDate"), deliveryAddress: value("deliveryAddress") || null, shippingMethod: value("shippingMethod") || null, notes: value("notes") || null, details: rows.map((row) => ({ soDetailId: row.id, qty: row.qty, notes: row.notes })) }; try { const doc = await api(isIncoming ? "/modules/api/incoming/goods-receipts" : "/modules/api/outgoing/delivery-schedules", { method: "POST", body: JSON.stringify(body) }); const key = isIncoming ? doc.grNumber : doc.scheduleNumber; show("Dokumen berhasil dibuat.", "success"); setTimeout(() => location.assign(`/modules/${config.module}/${config.page}/${encodeURIComponent(key)}`), 350); } catch (error) { show(error.message); } });
  async function initIncomingLookups() {
    const [purchaseOrders, warehouses, racks] = await Promise.all([
      api("/modules/api/purchasing/purchase-order?start=0&length=500"),
      api("/modules/api/inventory/warehouses?start=0&length=500"),
      api("/modules/api/inventory/racks?start=0&length=1000&isActive=true"),
    ]);
    incomingRacks = Array.isArray(racks) ? racks : [];
    const eligiblePurchaseOrders = (Array.isArray(purchaseOrders) ? purchaseOrders : [])
      .filter((po) => ["Sent", "Confirmed", "Partial Receipt"].includes(po.status));
    $("sourceNumber").insertAdjacentHTML("beforeend", eligiblePurchaseOrders
      .map((po) => `<option value="${esc(po.poNumber)}">${esc(po.poNumber)} — ${esc(po.status)} — ${esc(po.supplierName || po.vendorName || po.supplier?.supplierName || po.vendor?.vendorName || "")}</option>`).join(""));
    const activeWarehouses = (Array.isArray(warehouses) ? warehouses : [])
      .filter((warehouse) => warehouse.isActive !== false);
    $("warehouseCode").insertAdjacentHTML("beforeend", activeWarehouses
      .map((warehouse) => `<option value="${esc(warehouse.warehouseCode)}">${esc(warehouse.warehouseCode)} — ${esc(warehouse.warehouseName || "")}</option>`).join(""));
    const requestedPoNumber = new URLSearchParams(location.search).get("poNumber");
    if (requestedPoNumber) {
      const matched = eligiblePurchaseOrders.find((po) => po.poNumber === requestedPoNumber);
      if (matched) {
        $("sourceNumber").value = requestedPoNumber;
        await loadSource();
        if (!activeWarehouses.length) show("PO sudah dipilih. Tambahkan Master Warehouse aktif sebelum menyimpan Goods Receipt.", "warning");
      } else {
        show(`PO ${requestedPoNumber} belum berstatus Sent/Confirmed atau tidak memiliki akses untuk Goods Receipt.`);
      }
    } else if (!eligiblePurchaseOrders.length) {
      show("Belum ada PO berstatus Sent, Confirmed, atau Partial Receipt yang dapat diterima.", "warning");
    } else if (!activeWarehouses.length) {
      show("Tambahkan Master Warehouse aktif sebelum membuat Goods Receipt.", "warning");
    }
  }
  if (isIncoming) {
    $("warehouseCode").addEventListener("change", () => {
      document.querySelectorAll("[data-rack]").forEach((select) => {
        const selected = select.value;
        select.innerHTML = rackOptions(value("warehouseCode"), selected);
      });
    });
    initIncomingLookups().catch((error) => show(error.message));
  } else {
    const today = new Date();
    $("plannedDate").value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
})();
