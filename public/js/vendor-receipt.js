(function () {
  const config = JSON.parse(document.getElementById("vendor-receipt-config").textContent);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const formatQty = (value, uomCode = "") => window.SharedDataTable.formatQuantity(number(value), uomCode, { maximumFractionDigits: 2 });
  const formatDate = (value, withTime = false) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("id-ID", withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" }).format(date);
  };
  const localDateTimeValue = (date = new Date()) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const statusClass = (status) => String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let racks = [];
  let currentOrder = null;
  let receiptTable = null;
  let canReceive = false;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload;
  }

  function showAlert(message, type = "danger", allowHtml = false) {
    const box = $("vendor-receipt-alert");
    box.className = `alert alert-${type}`;
    if (allowHtml) box.innerHTML = message;
    else box.textContent = message;
  }

  function rackOptions(warehouseCode, selected = "") {
    const eligible = racks.filter((rack) => rack.isActive !== false && rack.warehouseCode === warehouseCode);
    return `<option value="">${warehouseCode ? "Tanpa rack" : "Pilih warehouse terlebih dahulu"}</option>${eligible.map((rack) => `<option value="${esc(rack.rackCode)}" ${rack.rackCode === selected ? "selected" : ""}>${esc(rack.rackCode)} — ${esc(rack.rackName || rack.zone || "")}</option>`).join("")}`;
  }

  function updateAfterReceipt() {
    if (!currentOrder) return;
    const receiptQty = number($("qtyReceived")?.value);
    const received = number(currentOrder.qtyReceived);
    const sent = number(currentOrder.qtySent);
    const after = received + receiptQty;
    receiptTable?.updateData([{ id: "receipt-line", receiptNow: receiptQty, receivedAfter: after, isOver: after > sent + 0.005 }]);
    $("posting-vendor-out").textContent = `− ${formatQty(receiptQty, currentOrder.uomCode)}`;
    $("posting-qc-in").textContent = `+ ${formatQty(receiptQty, currentOrder.uomCode)}`;
  }

  function gripFormatter() {
    return `<span class="vendor-receipt-row-grip" role="img" aria-label="Pegangan baris" title="Pegangan baris">${Array.from({ length: 6 }, () => "<i></i>").join("")}</span>`;
  }

  function quantityFormatter(cell) {
    const row = cell.getRow().getData();
    return `<span class="vendor-receipt-quantity"><b>${esc(formatQty(cell.getValue(), row.uomCode))}</b><em>${esc(row.uomCode || "—")}</em></span>`;
  }

  function receiptFormatter(cell) {
    const row = cell.getRow().getData();
    const element = cell.getElement();
    element.title = `Maksimum ${formatQty(row.outstanding, row.uomCode)} ${row.uomCode || ""}`.trim();
    return `<span class="vendor-receipt-tabulator-edit-value"><b>${esc(formatQty(cell.getValue(), row.uomCode))}</b><em>${esc(row.uomCode || "—")}</em></span>`;
  }

  function destinationFormatter(cell) {
    const row = cell.getRow().getData();
    cell.getElement().title = `Available 0 ${row.uomCode || ""} sampai QC release`.trim();
    return `<span class="vendor-receipt-hold-badge">${esc(cell.getValue())}</span>`;
  }

  function initReceiptTable() {
    if (!window.Tabulator) throw new Error("Tabulator gagal dimuat.");
    receiptTable = new window.Tabulator("#vendor-receipt-table", {
      index: "id",
      data: [],
      layout: "fitDataStretch",
      height: "auto",
      placeholder: "Memuat detail item…",
      columnDefaults: { headerSort: false, resizable: true, vertAlign: "middle" },
      columns: [
        { title: "", field: "handle", width: 42, minWidth: 42, maxWidth: 42, frozen: true, hozAlign: "center", headerHozAlign: "center", formatter: gripFormatter, resizable: false },
        { title: "Part Code", field: "partCode", width: 170, minWidth: 150, frozen: true, cssClass: "is-identity", formatter: (cell) => `<b>${esc(cell.getValue() || "—")}</b>` },
        { title: "Part No", field: "partNumber", width: 160, minWidth: 140, cssClass: "is-identity", formatter: (cell) => `<b>${esc(cell.getValue() || "—")}</b>` },
        { title: "Part Name", field: "partName", width: 220, minWidth: 180, tooltip: true, formatter: (cell) => `<span>${esc(cell.getValue() || "—")}</span>` },
        { title: "Sent", field: "sent", width: 125, minWidth: 110, hozAlign: "right", headerHozAlign: "right", formatter: quantityFormatter },
        { title: "Received", field: "received", width: 130, minWidth: 115, hozAlign: "right", headerHozAlign: "right", formatter: quantityFormatter },
        {
          title: "Receipt Now",
          field: "receiptNow",
          width: 145,
          minWidth: 130,
          hozAlign: "right",
          headerHozAlign: "right",
          cssClass: "is-editable",
          formatter: receiptFormatter,
          editor: "number",
          editable: () => canReceive,
          editorParams: (cell) => ({ min: 0, max: cell.getRow().getData().outstanding, step: "any", verticalNavigation: "table" }),
          cellEdited: (cell) => {
            const row = cell.getRow().getData();
            const value = Math.min(Math.max(number(cell.getValue()), 0), number(row.outstanding));
            if (Math.abs(value - number(cell.getValue())) > 0.000001) cell.setValue(value, true);
            $("qtyReceived").value = String(value);
            updateAfterReceipt();
          },
        },
        { title: "Received After", field: "receivedAfter", width: 145, minWidth: 130, hozAlign: "right", headerHozAlign: "right", formatter: (cell) => `<span class="vendor-receipt-quantity ${cell.getRow().getData().isOver ? "is-over" : ""}"><b>${esc(formatQty(cell.getValue(), cell.getRow().getData().uomCode))}</b><em>${esc(cell.getRow().getData().uomCode || "—")}</em></span>` },
        { title: "Destination", field: "destination", width: 140, minWidth: 130, formatter: destinationFormatter },
      ],
    });
  }

  function activateView(view) {
    document.querySelectorAll("[data-vendor-receipt-view]").forEach((button) => {
      const active = button.dataset.vendorReceiptView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-vendor-receipt-panel]").forEach((panel) => {
      const active = panel.dataset.vendorReceiptPanel === view;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (view === "items") requestAnimationFrame(() => receiptTable?.redraw(true));
  }

  function renderHistory(order) {
    const receiptHistory = Array.isArray(order.receiptHistory) ? order.receiptHistory : [];
    const qualityInspections = Array.isArray(order.qualityInspections) ? order.qualityInspections : [];
    const linkedNumbers = new Set(receiptHistory.map((row) => row.qualityInspection?.inspectionNumber).filter(Boolean));
    const cards = receiptHistory.map((receipt) => {
      const inspection = receipt.qualityInspection;
      return `<article class="vendor-receipt-history-card">
        <div class="vendor-receipt-history-head"><div><small>${esc(formatDate(receipt.movementDate, true))}</small><b>${esc(receipt.movementNumber)}</b></div><strong>${esc(formatQty(receipt.qty, receipt.uomCode || order.uomCode))}</strong></div>
        <dl><div><dt>Lokasi QC Hold</dt><dd>${esc([receipt.warehouseCode, receipt.rackCode].filter(Boolean).join(" / ") || "—")}</dd></div><div><dt>Lot</dt><dd>${esc(receipt.lotNumber || "—")}</dd></div></dl>
        ${inspection ? `<a class="vendor-receipt-qc-link" href="/modules/qc/quality-inspections/${encodeURIComponent(inspection.inspectionNumber)}"><span>QC Inspection</span><b>${esc(inspection.inspectionNumber)}</b><em class="is-${esc(statusClass(inspection.status))}">${esc(inspection.status)} · ${esc(inspection.decision)}</em></a>` : '<div class="vendor-receipt-qc-missing">Receipt lama — belum tertaut ke dokumen QC otomatis</div>'}
      </article>`;
    });
    qualityInspections.filter((inspection) => !linkedNumbers.has(inspection.inspectionNumber)).forEach((inspection) => {
      cards.push(`<article class="vendor-receipt-history-card is-legacy-qc"><small>QC terkait Vendor Process</small><a class="vendor-receipt-qc-link" href="/modules/qc/quality-inspections/${encodeURIComponent(inspection.inspectionNumber)}"><span>Quality Inspection</span><b>${esc(inspection.inspectionNumber)}</b><em class="is-${esc(statusClass(inspection.status))}">${esc(inspection.status)} · ${esc(inspection.decision)}</em></a></article>`);
    });
    $("vendor-receipt-history").innerHTML = cards.join("") || '<p class="ops-muted">Belum ada receipt. Qty yang diterima pertama kali akan tampil di sini bersama nomor QC-nya.</p>';
    $("vendor-receipt-audit-count").textContent = String(cards.length);
  }

  function renderOrder(order) {
    currentOrder = order;
    const sent = number(order.qtySent);
    const received = number(order.qtyReceived);
    const outstanding = Math.max(sent - received, 0);
    const inspections = Array.isArray(order.qualityInspections) ? order.qualityInspections : [];
    const qcPending = inspections.filter((item) => item.status !== "Completed").reduce((sum, item) => sum + number(item.qtyInspected), 0);
    const anyCompletedQc = inspections.some((item) => item.status === "Completed");

    $("vendor-receipt-title").textContent = order.orderNumber || config.recordKey;
    const outputIdentity = [order.outputPartCode, order.outputPartNumber].filter(Boolean).join(" / ") || "Output vendor";
    $("vendor-receipt-subtitle").textContent = `${outputIdentity} · ${order.outputPartName || "—"}`;
    $("vendor-receipt-status").textContent = order.status || "—";
    $("vendor-receipt-status").className = `vendor-receipt-status is-${statusClass(order.status)}`;
    $("metric-sent").textContent = formatQty(sent, order.uomCode);
    $("metric-received").textContent = formatQty(received, order.uomCode);
    $("metric-outstanding").textContent = formatQty(outstanding, order.uomCode);
    $("metric-qc").textContent = formatQty(qcPending, order.uomCode);
    $("metric-sent-uom").textContent = order.uomCode || "—";
    $("metric-received-uom").textContent = order.uomCode || "—";
    $("metric-outstanding-uom").textContent = order.uomCode || "—";
    $("reference-vendor").textContent = [order.vendorCode, order.vendorName].filter(Boolean).join(" · ") || "—";
    $("reference-process").textContent = [order.processCode, order.processName].filter(Boolean).join(" · ") || "—";
    $("reference-mo").textContent = order.moNumber || "—";
    $("reference-mo").href = order.moNumber ? `/modules/production/manufacturing-orders/${encodeURIComponent(order.moNumber)}` : "#";
    $("reference-due").textContent = formatDate(order.dueDate);

    $("flow-received").classList.toggle("is-done", received > 0);
    $("flow-received").classList.toggle("is-active", received <= 0);
    $("flow-qc").classList.toggle("is-done", anyCompletedQc);
    $("flow-qc").classList.toggle("is-active", received > 0 && !anyCompletedQc);
    $("flow-release").classList.toggle("is-active", anyCompletedQc);

    if (!$("lotNumber").value) $("lotNumber").value = order.receiveLotNumber || order.vendorLotNumber || `${order.orderNumber}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    canReceive = outstanding > 0 && !["Closed", "Cancelled"].includes(order.status);
    $("qtyReceived").value = String(outstanding);
    receiptTable?.setData([{
      id: "receipt-line",
      partCode: order.outputPartCode || "—",
      partNumber: order.outputPartNumber || "—",
      partName: order.outputPartName || "—",
      sent,
      received,
      receiptNow: outstanding,
      outstanding,
      receivedAfter: received + outstanding,
      destination: "QC HOLD",
      uomCode: order.uomCode || "—",
      isOver: false,
    }]);
    updateAfterReceipt();
    $("vendor-receipt-submit").disabled = !canReceive;
    $("vendor-receipt-submit").textContent = canReceive ? "Post Receipt to QC Hold" : "Seluruh Qty Sudah Diterima";
    [...$("vendor-receipt-form").elements].forEach((field) => {
      if (field.id !== "vendor-receipt-submit" && field.tagName !== "A") field.disabled = !canReceive;
    });
    renderHistory(order);
  }

  async function loadPage() {
    try {
      const [orderPayload, warehousePayload, rackPayload] = await Promise.all([
        api(`/modules/api/incoming/incoming-from-vendor/${encodeURIComponent(config.recordKey)}`),
        api("/modules/api/inventory/warehouses?start=0&length=500"),
        api("/modules/api/inventory/racks?start=0&length=1000&isActive=true"),
      ]);
      const warehouses = Array.isArray(warehousePayload) ? warehousePayload : (warehousePayload.data || warehousePayload.items || []);
      racks = Array.isArray(rackPayload) ? rackPayload : (rackPayload.data || rackPayload.items || []);
      const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive !== false);
      $("warehouseCode").insertAdjacentHTML("beforeend", activeWarehouses.map((warehouse) => `<option value="${esc(warehouse.warehouseCode)}">${esc(warehouse.warehouseCode)} — ${esc(warehouse.warehouseName || "")}</option>`).join(""));
      const preferredWarehouse = orderPayload.receiveWarehouseCode || activeWarehouses.find((warehouse) => /qc/i.test(`${warehouse.warehouseCode} ${warehouse.warehouseName || ""}`))?.warehouseCode || "";
      if (preferredWarehouse && activeWarehouses.some((warehouse) => warehouse.warehouseCode === preferredWarehouse)) $("warehouseCode").value = preferredWarehouse;
      $("rackCode").innerHTML = rackOptions($("warehouseCode").value, orderPayload.receiveRackCode || "");
      renderOrder(orderPayload);
    } catch (error) {
      showAlert(error.message);
      $("vendor-receipt-submit").disabled = true;
    }
  }

  $("warehouseCode").addEventListener("change", () => {
    $("rackCode").innerHTML = rackOptions($("warehouseCode").value);
  });

  document.querySelectorAll("[data-vendor-receipt-view]").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.vendorReceiptView));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const buttons = [...document.querySelectorAll("[data-vendor-receipt-view]")];
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const target = buttons[(buttons.indexOf(button) + offset + buttons.length) % buttons.length];
      activateView(target.dataset.vendorReceiptView);
      target.focus();
      event.preventDefault();
    });
  });

  $("vendor-receipt-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentOrder) return;
    const qtyReceived = number($("qtyReceived").value);
    const outstanding = Math.max(number(currentOrder.qtySent) - number(currentOrder.qtyReceived), 0);
    if (qtyReceived <= 0) return showAlert("Qty datang harus lebih dari 0.");
    if (qtyReceived > outstanding + 0.005) return showAlert(`Qty datang melebihi outstanding ${formatQty(outstanding, currentOrder.uomCode)}.`);

    const button = $("vendor-receipt-submit");
    button.disabled = true;
    button.textContent = "Memproses receipt & QC…";
    try {
      const payload = await api(`/modules/api/vendor-process-workflow/${encodeURIComponent(config.recordKey)}/receive`, {
        method: "POST",
        body: JSON.stringify({
          qtyReceived,
          receivedAt: $("receivedAt").value,
          deliveryNoteNumber: $("deliveryNoteNumber").value.trim() || null,
          warehouseCode: $("warehouseCode").value,
          rackCode: $("rackCode").value || null,
          lotNumber: $("lotNumber").value.trim(),
          notes: $("receiptNotes").value.trim() || null,
        }),
      });
      const inspection = payload.qualityInspection;
      const inspectionLink = inspection?.inspectionNumber
        ? `<a class="alert-link" href="/modules/qc/quality-inspections/${encodeURIComponent(inspection.inspectionNumber)}">Buka ${esc(inspection.inspectionNumber)}</a>`
        : "QC Inspection sudah dibuat.";
      showAlert(`Receipt <b>${esc(payload.movementNumber || "berhasil")}</b> masuk QC Hold. ${inspectionLink}`, "success", true);
      await loadPage();
    } catch (error) {
      showAlert(error.message);
      button.disabled = false;
      button.textContent = "Post Receipt to QC Hold";
    }
  });

  $("receivedAt").value = localDateTimeValue();
  initReceiptTable();
  activateView("items");
  loadPage();
})();
