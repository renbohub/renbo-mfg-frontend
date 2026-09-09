(function () {
  const config = JSON.parse(document.getElementById("supply-form-config").textContent); const $ = (id) => document.getElementById(id); const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0; const value = (id) => $(id)?.value?.trim() || "";
  const qty = (amount, uomCode = "") => window.SharedDataTable.formatQuantity(amount, uomCode, { maximumFractionDigits: 2 });
  const show = (message, type = "danger") => { const box = $("supply-form-alert"); box.textContent = message; box.className = `alert alert-${type}`; };
  const isIncoming = config.module === "incoming";
  let incomingRacks = [];
  let currentSourceRows = [];
  let partnerNotice = null;
  let savedReceipt = null;
  const AUTO_CLOSE_SHORTAGE_PERCENT = 5;
  const rackOptions = (warehouseCode, selected = "") => {
    const rows = incomingRacks.filter((rack) => rack.isActive !== false && rack.warehouseCode === warehouseCode);
    return `<option value="">${warehouseCode ? "Tanpa rack" : "Pilih warehouse terlebih dahulu"}</option>${rows.map((rack) => `<option value="${esc(rack.rackCode)}" ${rack.rackCode === selected ? "selected" : ""}>${esc(rack.rackCode)} — ${esc(rack.rackName || rack.zone || "")}</option>`).join("")}`;
  };
  const allocationEditor = (row) => {
    const sources = Array.isArray(row.sources) ? row.sources : [];
    return `<div class="gr-allocation-editor" data-allocation-editor>
      <div class="gr-allocation-heading"><b>Alokasi kebutuhan part</b><small>${sources.length ? "Wajib sama dengan qty datang" : "PO manual: masuk buffer"}</small></div>
      ${sources.map((source) => `<label class="gr-allocation-line"><span><b>${esc(source.partCode || source.fgPartCode || source.plannedOrderNumber || "Demand")}</b><small>Due ${esc(String(source.dueDate || "-").slice(0, 10))} · sisa ${esc(source.remainingQty)} ${esc(source.uomCode || row.allocationUom || "")}</small></span><input data-allocation-source="${esc(source.id)}" class="form-control form-control-sm" type="number" min="0" max="${esc(source.remainingQty)}" step="any" value="0"></label>`).join("")}
      <label class="gr-allocation-line is-buffer"><span><b>BUFFER / EXCESS MOQ</b><small>Sisa pembelian di luar demand part</small></span><input data-allocation-buffer class="form-control form-control-sm" type="number" min="0" step="any" value="0"></label>
      <div class="gr-allocation-total" data-allocation-total></div>
    </div>`;
  };
  const incomingLotRow = (row, primary = false) => `<tr data-source-detail="${esc(row.id)}" data-outstanding="${esc(row.outstanding)}" data-conversion-factor="${esc(row.conversionFactor || 1)}" data-allocation-uom="${esc(row.allocationUom || row.uom)}" data-lot-primary="${primary ? "true" : "false"}">
    <td class="gr-item-cell"><b>${esc(row.code)}</b><small>${esc(row.name)}</small><em>${esc(row.uom)}</em>${primary ? `<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-add-lot="${esc(row.id)}">+ Tambah Lot</button>` : `<button type="button" class="btn btn-sm btn-outline-danger mt-2" data-remove-lot>Hapus Lot</button>`}</td>
    <td class="ops-number"><b>${primary ? qty(row.ordered,row.uom) : ""}</b><small>${primary ? esc(row.uom) : "Lot tambahan"}</small></td>
    <td class="ops-number"><b>${primary ? qty(row.used,row.uom) : ""}</b><small>${primary ? esc(row.uom) : ""}</small></td>
    <td class="ops-number"><b>${primary ? qty(row.outstanding,row.uom) : ""}</b><small>${primary ? esc(row.uom) : ""}</small></td>
    <td class="gr-arrival-cell"><input data-qty class="form-control form-control-sm" type="number" min="0" step="any" value="${primary ? esc(row.outstanding) : "0"}"><small>${primary ? "Boleh kurang / lebih; dapat dipecah per lot" : "Qty lot ini"}</small></td>
    <td data-variance class="gr-variance"></td>
    <td><div class="gr-lot-rack"><div class="gr-auto-lot"><small>Internal Lot</small><b>Otomatis per lot</b></div><label><span>Supplier Lot *</span><input data-supplier-lot class="form-control form-control-sm" required placeholder="Input lot / batch supplier"></label><label><span>Rack Warehouse</span><select data-rack class="form-select form-select-sm">${rackOptions(value("warehouseCode"))}</select></label></div>${allocationEditor(row)}</td>
  </tr>`;
  async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Permintaan gagal."); return payload.data || payload.item || payload; }
  function updateAllocationState(row) {
    const target = num(row.querySelector("[data-qty]")?.value) * num(row.dataset.conversionFactor || 1);
    const allocated = [...row.querySelectorAll("[data-allocation-source], [data-allocation-buffer]")].reduce((sum, input) => sum + num(input.value), 0);
    const status = row.querySelector("[data-allocation-total]");
    const delta = allocated - target;
    if (status) {
      status.className = `gr-allocation-total ${Math.abs(delta) <= 0.000001 ? "is-match" : "is-mismatch"}`;
      status.textContent = Math.abs(delta) <= 0.000001
        ? `Teralokasi ${allocated} ${row.dataset.allocationUom || ""}`
        : `Belum balance: target ${target}, alokasi ${allocated} (${delta > 0 ? "+" : ""}${delta})`;
    }
    return Math.abs(delta) <= 0.000001;
  }
  function redistributeAllocations(detailId) {
    const source = currentSourceRows.find((item) => String(item.id) === String(detailId));
    if (!source) return;
    const rows = [...document.querySelectorAll("[data-source-detail]")].filter((row) => String(row.dataset.sourceDetail) === String(detailId));
    const remainingBySource = new Map((source.sources || []).map((item) => [String(item.id), num(item.remainingQty)]));
    rows.forEach((row) => {
      let qtyToAllocate = num(row.querySelector("[data-qty]")?.value) * num(row.dataset.conversionFactor || 1);
      row.querySelectorAll("[data-allocation-source]").forEach((input) => {
        const sourceId = String(input.dataset.allocationSource);
        const allocated = Math.min(qtyToAllocate, num(remainingBySource.get(sourceId)));
        input.value = allocated > 0 ? allocated : 0;
        remainingBySource.set(sourceId, Math.max(num(remainingBySource.get(sourceId)) - allocated, 0));
        qtyToAllocate -= allocated;
      });
      const buffer = row.querySelector("[data-allocation-buffer]");
      if (buffer) buffer.value = qtyToAllocate > 0 ? qtyToAllocate : 0;
      updateAllocationState(row);
    });
  }
  function allocationPayload(row) {
    const demand = [...row.querySelectorAll("[data-allocation-source]")].map((input) => ({
      allocationType: "DEMAND",
      prSourceId: input.dataset.allocationSource,
      allocatedQty: num(input.value),
    })).filter((allocation) => allocation.allocatedQty > 0);
    const bufferQty = num(row.querySelector("[data-allocation-buffer]")?.value);
    if (bufferQty > 0) demand.push({ allocationType: "BUFFER", allocatedQty: bufferQty, notes: "MOQ / order multiple excess buffer" });
    return demand;
  }
  function updateReceiptSummary() {
    if (!isIncoming) return;
    const rows = [...document.querySelectorAll("[data-source-detail]")];
    const grouped = new Map();
    rows.forEach((row) => {
      const group = grouped.get(row.dataset.sourceDetail) || { outstanding: num(row.dataset.outstanding), actual: 0, rows: [] };
      group.actual += num(row.querySelector("[data-qty]")?.value);
      group.rows.push(row);
      grouped.set(row.dataset.sourceDetail, group);
      updateAllocationState(row);
    });
    const totals = [...grouped.values()].reduce((result, group) => {
      const outstanding = group.outstanding;
      const actual = group.actual;
      result.outstanding += outstanding;
      result.actual += actual;
      result.shortage += Math.max(outstanding - actual, 0);
      result.over += Math.max(actual - outstanding, 0);
      const variance = actual - outstanding;
      const cell = group.rows.find((row) => row.dataset.lotPrimary === "true")?.querySelector("[data-variance]");
      if (cell) {
        cell.className = `gr-variance ${variance > 0 ? "is-over" : variance < 0 ? "is-short" : "is-match"}`;
        cell.innerHTML = variance > 0 ? `<b>+${esc(variance)}</b><small>Lebih</small>` : variance < 0 ? `<b>${esc(variance)}</b><small>Kurang</small>` : "<b>0</b><small>Sesuai</small>";
      }
      group.rows.filter((row) => row.dataset.lotPrimary !== "true").forEach((row) => { const extra = row.querySelector("[data-variance]"); if (extra) extra.innerHTML = "<small>Digabung ke item</small>"; });
      return result;
    }, { outstanding: 0, actual: 0, shortage: 0, over: 0 });
    const shortagePercent = totals.outstanding > 0 ? totals.shortage / totals.outstanding * 100 : 0;
    const recommendedStatus = totals.shortage <= 0
      ? "Completed"
      : shortagePercent <= AUTO_CLOSE_SHORTAGE_PERCENT ? "Close PO" : "Partial Receipt";
    const action = value("shortageAction") || "AUTO";
    const finalStatus = action === "CLOSE_PO" ? "Close PO" : action === "KEEP_OPEN" ? "Partial Receipt" : recommendedStatus;
    $("gr-summary-outstanding").textContent = `${totals.outstanding}`;
    $("gr-summary-arrival").textContent = `${totals.actual}`;
    $("gr-summary-shortage").textContent = `${totals.shortage}`;
    $("gr-summary-over").textContent = `${totals.over}`;
    $("gr-summary-status").textContent = finalStatus;
    $("gr-summary-status").className = `gr-summary-status ${finalStatus === "Partial Receipt" ? "is-partial" : "is-complete"}`;
    $("gr-variance-help").textContent = totals.shortage > 0
      ? `Kekurangan ${shortagePercent.toFixed(2)}%. Batas auto-close ${AUTO_CLOSE_SHORTAGE_PERCENT}%. ${recommendedStatus === "Close PO" ? "Selisih kecil: sistem dapat menutup PO." : "Selisih masih besar: PO disarankan tetap Partial Receipt."}`
      : totals.over > 0 ? `Barang datang lebih ${totals.over}. Over-receipt akan dicatat sebagai variance.` : "Qty datang sesuai dengan outstanding PO.";
    $("closeReason").required = action === "CLOSE_PO" && totals.shortage > 0;
  }
  async function loadSource() {
    const source = value("sourceNumber"); if (!source) return show(isIncoming ? "Nomor PO wajib diisi." : "Nomor SO wajib diisi.");
    try {
      const [doc, allocationPlan] = isIncoming
        ? await Promise.all([
            api(`/modules/api/purchasing/purchase-order/${encodeURIComponent(source)}`),
            api(`/modules/api/incoming/goods-receipts/allocation-plan/${encodeURIComponent(source)}`),
          ])
        : [await api(`/modules/api/sales/sales-orders/${encodeURIComponent(source)}`), null];
      const details = Array.isArray(doc.details) ? doc.details : [];
      const planByDetail = new Map((allocationPlan?.details || []).map((row) => [String(row.poDetailId), row]));
      const rows = details.map((row) => { const ordered = num(row.qty); const used = num(isIncoming ? row.qtyReceived : row.qtyDelivered); const outstanding = Math.max(ordered - used, 0); const plan = planByDetail.get(String(row.id)); return { id: row.id, code: row.materialCode || row.partCode || row.part?.partCode || "-", name: row.materialName || row.partName || row.part?.partName || row.description || "-", ordered, used, outstanding, uom: row.uomCode || "", conversionFactor: plan?.conversionFactor || 1, allocationUom: plan?.allocationUomCode || row.uomCode || "", sources: plan?.sources || [] }; }).filter((row) => row.outstanding > 0);
      currentSourceRows = rows;
      $("supply-detail-body").innerHTML = rows.map((row) => isIncoming
        ? incomingLotRow(row, true)
        : `<tr data-source-detail="${esc(row.id)}"><td><b>${esc(row.code)}</b><small class="d-block">${esc(row.name)}</small></td><td>${esc(row.outstanding)} ${esc(row.uom)}</td><td><input data-qty class="form-control form-control-sm" type="number" min="0" max="${esc(row.outstanding)}" step="any" value="${esc(row.outstanding)}"></td><td><input data-line-notes class="form-control form-control-sm" placeholder="Catatan schedule"></td></tr>`).join("") || `<tr><td colspan="${isIncoming ? 7 : 4}" class="ops-muted">Tidak ada qty outstanding.</td></tr>`;
      if (isIncoming) {
        if (partnerNotice && partnerNotice.poNumber === source) {
          const seen = new Set();
          document.querySelectorAll('[data-source-detail]').forEach(row => { row.querySelector('[data-qty]').value = 0; row.querySelector('[data-supplier-lot]').required = false; });
          for (const line of partnerNotice.details) {
            const sourceRow = rows.find(row => row.id === line.poDetailId);
            if (!sourceRow) continue;
            let row = [...document.querySelectorAll('[data-source-detail]')].find(row => row.dataset.sourceDetail === line.poDetailId);
            if (seen.has(line.poDetailId)) { row.insertAdjacentHTML('afterend', incomingLotRow(sourceRow, false)); row = row.nextElementSibling; }
            seen.add(line.poDetailId);
            row.querySelector('[data-qty]').value = line.qty;
            row.querySelector('[data-supplier-lot]').value = line.supplierLotNumber;
            row.querySelector('[data-supplier-lot]').required = true;
          }
        }
        rows.forEach((row) => redistributeAllocations(row.id));
        updateReceiptSummary();
      }
      if (!isIncoming && !value("deliveryAddress")) $("deliveryAddress").value = doc.shippingAddress || "";
    } catch (error) { show(error.message); }
  }
  $("supply-load-source").addEventListener("click", loadSource);
  $("supply-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const elementRows = [...document.querySelectorAll("[data-source-detail]")].filter((row) => num(row.querySelector("[data-qty]")?.value) > 0);
    if (!elementRows.length) return show("Pilih minimal satu qty transaksi.");
    if (isIncoming && elementRows.some((row) => !updateAllocationState(row))) return show("Total alokasi kebutuhan part harus sama dengan qty datang pada setiap lot.");
    const rows = elementRows.map((row) => ({
      id: row.dataset.sourceDetail,
      qty: num(row.querySelector("[data-qty]")?.value),
      supplierLot: row.querySelector("[data-supplier-lot]")?.value?.trim() || null,
      rack: row.querySelector("[data-rack]")?.value?.trim() || null,
      notes: row.querySelector("[data-line-notes]")?.value?.trim() || null,
      allocations: isIncoming ? allocationPayload(row) : [],
    }));
    const source = value("sourceNumber");
    const body = isIncoming
      ? { poNumber: source, warehouseCode: value("warehouseCode"), deliveryNoteNumber: value("deliveryNoteNumber") || null, notes: value("notes") || null, shortageAction: value("shortageAction") || "AUTO", closeReason: value("closeReason") || null, details: rows.map((row) => ({ poDetailId: row.id, qtyReceived: row.qty, supplierLotNumber: row.supplierLot, rackCode: row.rack, allocations: row.allocations })) }
      : { soNumber: source, plannedDate: value("plannedDate"), deliveryAddress: value("deliveryAddress") || null, shippingMethod: value("shippingMethod") || null, notes: value("notes") || null, details: rows.map((row) => ({ soDetailId: row.id, qty: row.qty, notes: row.notes })) };
    if (isIncoming && partnerNotice) body.partnerNoticeId = partnerNotice.id;
    const submitButtons = [...document.querySelectorAll('[type="submit"]')];
    try {
      const files = isIncoming ? [...($('incoming-documents')?.files || [])] : [];
      if (files.length > 10 || files.some(file => file.size > 10 * 1024 * 1024)) throw new Error('Maksimal 10 dokumen, 10 MB per file.');
      submitButtons.forEach(button => { button.disabled = true; });
      const doc = savedReceipt || await api(isIncoming ? "/modules/api/incoming/goods-receipts" : "/modules/api/outgoing/delivery-schedules", { method: "POST", body: JSON.stringify(body) });
      if (isIncoming) savedReceipt = doc;
      const key = isIncoming ? doc.grNumber : doc.scheduleNumber;
      for (const file of files) {
        const uploadKey = `${file.name}:${file.size}:${file.lastModified}`;
        if ((savedReceipt.uploadedFiles || []).includes(uploadKey)) continue;
        const form = new FormData(); form.append('document', file);
        const response = await fetch(`/incoming-tools/api/incoming/goods-receipts/${encodeURIComponent(key)}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`GR ${key} sudah tersimpan; unggah ${file.name} gagal: ${payload.message || 'coba lagi'}. Klik Simpan untuk mencoba ulang unggahan tanpa membuat GR baru.`);
        savedReceipt.uploadedFiles = [...(savedReceipt.uploadedFiles || []), uploadKey];
      }
      show(isIncoming ? `Goods Receipt berhasil dibuat dan dialokasikan ke kebutuhan part. Status PO: ${doc.poStatus || "diperbarui"}.` : "Dokumen berhasil dibuat.", "success");
      setTimeout(() => location.assign(`/modules/${config.module}/${config.page}/${encodeURIComponent(key)}`), 550);
    } catch (error) { show(error.message); } finally { submitButtons.forEach(button => { button.disabled = false; }); }
  });
  async function initIncomingLookups() {
    const noticeId = new URLSearchParams(location.search).get('partnerNoticeId');
    if (noticeId) {
      partnerNotice = await api(`/incoming-tools/api/incoming/partner-admin/notices/${encodeURIComponent(noticeId)}`);
      if (partnerNotice.status !== 'Submitted') throw new Error('Pendaftaran supplier sudah diterima/dibatalkan.');
      $('deliveryNoteNumber').value = partnerNotice.deliveryNoteNumber;
      $('deliveryNoteNumber').readOnly = true;
      const info = $('partner-notice-info'); info.classList.remove('d-none'); info.textContent = `Pendaftaran ${partnerNotice.noticeNumber}: periksa qty fisik dan alokasi. ${partnerNotice.documents.length} dokumen surat jalan akan ditautkan ke GR.`;
    }
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
    const requestedPoNumber = partnerNotice?.poNumber || new URLSearchParams(location.search).get("poNumber");
    if (requestedPoNumber) {
      const matched = eligiblePurchaseOrders.find((po) => po.poNumber === requestedPoNumber);
      if (matched) {
        $("sourceNumber").value = requestedPoNumber;
        if (partnerNotice) $('sourceNumber').disabled = true;
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
    $("sourceNumber").addEventListener("change", () => {
      if (value("sourceNumber")) loadSource();
      else {
        currentSourceRows = [];
        $("supply-detail-body").innerHTML = '<tr><td colspan="7" class="ops-muted">Pilih Purchase Order yang akan dikonsumsi.</td></tr>';
        updateReceiptSummary();
      }
    });
    $("supply-detail-body").addEventListener("input", (event) => {
      const row = event.target.closest("[data-source-detail]");
      if (!row) return;
      if (event.target.matches("[data-qty]")) redistributeAllocations(row.dataset.sourceDetail);
      else if (event.target.matches("[data-allocation-source], [data-allocation-buffer]")) updateAllocationState(row);
      updateReceiptSummary();
    });
    $("supply-detail-body").addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-add-lot]");
      if (addButton) {
        const source = currentSourceRows.find((row) => String(row.id) === String(addButton.dataset.addLot));
        if (!source) return;
        const primaryRow = addButton.closest("tr");
        primaryRow.insertAdjacentHTML("afterend", incomingLotRow(source, false));
        redistributeAllocations(source.id);
        updateReceiptSummary();
        return;
      }
      const removeButton = event.target.closest("[data-remove-lot]");
      if (removeButton) {
        const removed = removeButton.closest("tr");
        const detailId = removed?.dataset.sourceDetail;
        removed?.remove();
        if (detailId) redistributeAllocations(detailId);
        updateReceiptSummary();
      }
    });
    $("shortageAction").addEventListener("change", updateReceiptSummary);
    $("warehouseCode").addEventListener("change", () => {
      document.querySelectorAll("[data-rack]").forEach((select) => {
        const selected = select.value;
        select.innerHTML = rackOptions(value("warehouseCode"), selected);
      });
    });
    initIncomingLookups().catch((error) => show(error.message));
  } else {
    const today = (globalThis.erpBusinessNow?.() || new Date());
    $("plannedDate").value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
})();
