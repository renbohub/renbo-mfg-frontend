(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const element = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
  const number = (value) => Number(value || 0);
  const normalizedUom = (value) => String(value || "").trim().toUpperCase();
  const isDiscreteUom = (value) => ["PCS", "PC", "PIECE", "PIECES", "SHEET", "SHEETS", "COIL", "COILS"].includes(normalizedUom(value));
  const formatNumber = (value, uomCode = "") => new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: isDiscreteUom(uomCode) ? 0 : 2,
  }).format(number(value));
  const formatDate = (value, withTime = false) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", withTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" }).format(date);
  };
  const locationLabel = (location) => [location?.warehouseCode, location?.rackCode, location?.lotNumber].filter(Boolean).join(" · ") || "-";
  const reference = (href, value, label = "") => value
    ? `<a class="fg-ref" href="${href}">${label ? `<small>${escapeHtml(label)}</small>` : ""}${escapeHtml(value)}</a>`
    : "-";

  const state = { pending: [], history: [], warehouses: [], activeTab: "pending", current: null };
  const modal = element("fg-receive-modal");
  const form = element("fg-receive-form");
  const warehouseSelect = element("fg-warehouse");
  const rackSelect = element("fg-rack");
  const searchInput = element("fg-search");

  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan FG Receipt gagal diproses.");
    return payload;
  };

  function showAlert(message, type = "danger") {
    const alert = !modal.classList.contains("d-none") && type === "danger"
      ? element("fg-modal-alert")
      : element("fg-alert");
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearAlert() {
    element("fg-alert").className = "alert d-none";
    element("fg-modal-alert").className = "alert d-none";
  }

  function matchesSearch(row) {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return true;
    return JSON.stringify(row).toLowerCase().includes(query);
  }

  function qtyCell(value, uomCode, extraClass = "") {
    return `<div class="fg-cell-stack fg-qty ${extraClass}"><strong>${formatNumber(value, uomCode)}</strong><small>${escapeHtml(uomCode || "-")}</small></div>`;
  }

  function sourceWipsCell(row) {
    const sources = Array.isArray(row.sourceWips) ? row.sourceWips : [];
    if (!sources.length) {
      return `<div class="fg-cell-stack"><b>${escapeHtml(row.sourcePart?.partCode || "-")}</b><small>Tidak ada detail movement</small></div>`;
    }
    return `<div class="fg-source-wips">${sources.map((source) => {
      const label = `${source.partCode || "WIP"} · ${formatNumber(source.qty, source.uomCode)} ${source.uomCode || ""}`;
      return `<a href="/modules/inventory/stock-movements/${encodeURIComponent(source.movementNumber)}" title="${escapeHtml(locationLabel(source.location))}"><b>${escapeHtml(source.movementNumber)}</b><span>${escapeHtml(label)}</span></a>`;
    }).join("")}</div>`;
  }

  function renderPending() {
    const rows = state.pending.filter(matchesSearch);
    const stateLabels = {
      READY_TO_RECEIVE: "Ready to Receive",
      WAITING_FINAL_OUTPUT: "Menunggu Final WIP",
      WAITING_PRODUCTION: "Menunggu Production",
      WAITING_QC: "Menunggu QC",
      WAITING_RECEIPT_RECONCILIATION: "Periksa Qty Receipt",
    };
    const resolutionLinks = (row) => {
      const references = (row.blockers || []).flatMap((blocker) => blocker.references || []);
      return references
        .filter((entry, index, all) => entry?.href && entry?.label && all.findIndex((candidate) => candidate.href === entry.href) === index)
        .map((entry) => `<a class="fg-resolution-link" href="${escapeHtml(entry.href)}"><small>${escapeHtml(entry.type || "REF")}</small>${escapeHtml(entry.label)}</a>`)
        .join("");
    };
    element("fg-pending-body").innerHTML = rows.map((row) => `
      <tr data-inspection="${escapeHtml(row.inspectionNumber)}">
        <td><div class="fg-cell-stack">${row.inspectionNumber
          ? reference(`/modules/qc/quality-inspections/${encodeURIComponent(row.inspectionNumber)}`, row.inspectionNumber)
          : reference(`/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(row.monthlyProductionPlanNumber)}`, row.monthlyProductionPlanNumber, "MPP")}<small>${formatDate(row.inspectionDate || row.dueDate)}</small></div></td>
        <td><div class="fg-cell-stack"><span class="fg-receipt-state ${escapeHtml(String(row.receiptState || "").toLowerCase())}">${escapeHtml(stateLabels[row.receiptState] || row.receiptState || "Pending")}</span>${row.blockers?.[0]?.message ? `<small title="${escapeHtml(row.blockers[0].message)}">${escapeHtml(row.blockers[0].code || "BLOCKER")}</small>` : ""}</div></td>
        <td>${reference(`/modules/production/production-logs/${encodeURIComponent(row.productionLogNumber)}`, row.productionLogNumber)}</td>
        <td><div class="fg-cell-stack">${reference(`/modules/production/manufacturing-orders/${encodeURIComponent(row.moNumber)}`, row.moNumber, "MO")}${reference(`/modules/production/work-orders/${encodeURIComponent(row.woNumber)}`, row.woNumber, "WO")}</div></td>
        <td>${sourceWipsCell(row)}</td>
        <td><div class="fg-cell-stack"><b>${escapeHtml(row.sourceLocation?.warehouseCode || "-")}</b><small>${escapeHtml([row.sourceLocation?.rackCode, row.sourceLocation?.lotNumber].filter(Boolean).join(" · ") || "Tanpa rack / lot")}</small></div></td>
        <td><div class="fg-cell-stack fg-part"><strong>${escapeHtml(row.fgPart?.partCode || "-")}</strong><small>${escapeHtml(row.fgPart?.partName || row.fgPart?.partNumber || "-")}</small></div></td>
        <td>${qtyCell(row.qtyPassed, row.uomCode)}</td>
        <td>${qtyCell(row.qtyReceived, row.uomCode)}</td>
        <td>${qtyCell(row.qtyPending, row.uomCode, "fg-pending")}</td>
        <td>${row.actionable && row.inspectionNumber
          ? `<button class="btn btn-primary" type="button" data-fg-receive="${escapeHtml(row.inspectionNumber)}">Receive FG</button>`
          : `<div class="fg-resolution-links">${resolutionLinks(row) || '<span class="text-muted">Selesaikan blocker sumber</span>'}</div>`}</td>
      </tr>`).join("");
    element("fg-pending-empty").classList.toggle("d-none", rows.length > 0);
  }

  function renderHistory() {
    const rows = state.history.filter(matchesSearch);
    element("fg-history-body").innerHTML = rows.map((row) => `
      <tr>
        <td>${reference(`/modules/production/fg-receipt/${encodeURIComponent(row.movementNumber)}`, row.movementNumber)}</td>
        <td>${formatDate(row.receivedAt, true)}</td>
        <td>${reference(`/modules/qc/quality-inspections/${encodeURIComponent(row.inspectionNumber)}`, row.inspectionNumber)}</td>
        <td><div class="fg-cell-stack">${reference(`/modules/production/manufacturing-orders/${encodeURIComponent(row.moNumber)}`, row.moNumber, "MO")}${reference(`/modules/production/work-orders/${encodeURIComponent(row.woNumber)}`, row.woNumber, "WO")}</div></td>
        <td>${reference(`/modules/production/production-logs/${encodeURIComponent(row.productionLogNumber)}`, row.productionLogNumber)}</td>
        <td><div class="fg-cell-stack fg-part"><strong>${escapeHtml(row.fgPart?.partCode || "-")}</strong><small>${escapeHtml(row.fgPart?.partName || row.fgPart?.partNumber || "-")}</small></div></td>
        <td><div class="fg-cell-stack"><b>${escapeHtml(row.targetLocation?.warehouseCode || "-")}</b><small>${escapeHtml([row.targetLocation?.rackCode, row.targetLocation?.lotNumber].filter(Boolean).join(" · ") || "Tanpa rack / lot")}</small></div></td>
        <td>${qtyCell(row.qtyReceived, row.uomCode)}</td>
        <td>${escapeHtml(row.performedBy || "-")}</td>
        <td><button class="btn btn-outline-danger fg-rollback" type="button" data-fg-rollback="${escapeHtml(row.movementNumber)}">Rollback</button></td>
      </tr>`).join("");
    element("fg-history-empty").classList.toggle("d-none", rows.length > 0);
  }

  function summaryQuantity(rows, field) {
    const totals = new Map();
    rows.forEach((row) => {
      const uom = normalizedUom(row.uomCode) || "UNIT";
      totals.set(uom, number(totals.get(uom)) + number(row[field]));
    });
    return [...totals.entries()].map(([uom, qty]) => `${formatNumber(qty, uom)} ${uom}`).join(" · ") || "0";
  }

  function renderAll() {
    element("fg-pending-count").textContent = formatNumber(state.pending.length, "PCS");
    element("fg-pending-qty").textContent = summaryQuantity(state.pending, "qtyPending");
    element("fg-history-count").textContent = formatNumber(state.history.length, "PCS");
    element("fg-tab-pending-count").textContent = state.pending.length;
    element("fg-tab-history-count").textContent = state.history.length;
    renderPending();
    renderHistory();
  }

  function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll("[data-fg-tab]").forEach((button) => button.classList.toggle("active", button.dataset.fgTab === tab));
    element("fg-pending-panel").classList.toggle("d-none", tab !== "pending");
    element("fg-history-panel").classList.toggle("d-none", tab !== "history");
  }

  function fillWarehouseOptions(selectedCode = "") {
    warehouseSelect.innerHTML = `<option value="">Pilih warehouse...</option>${state.warehouses.map((warehouse) => `<option value="${escapeHtml(warehouse.warehouseCode)}" ${warehouse.warehouseCode === selectedCode ? "selected" : ""}>${escapeHtml(warehouse.warehouseCode)} · ${escapeHtml(warehouse.warehouseName || "Tanpa nama")}</option>`).join("")}`;
  }

  async function loadRacks(warehouseCode, selectedRack = "") {
    rackSelect.disabled = true;
    rackSelect.innerHTML = '<option value="">Memuat rack...</option>';
    if (!warehouseCode) {
      rackSelect.innerHTML = '<option value="">Pilih warehouse terlebih dahulu</option>';
      return;
    }
    try {
      const payload = await api(`/modules/api/production/fg-receipts/racks?warehouseCode=${encodeURIComponent(warehouseCode)}&isActive=true&limit=500`);
      const racks = Array.isArray(payload.items) ? payload.items : [];
      rackSelect.innerHTML = `<option value="">Tanpa rack</option>${racks.map((rack) => `<option value="${escapeHtml(rack.rackCode)}" ${rack.rackCode === selectedRack ? "selected" : ""}>${escapeHtml(rack.rackCode)} · ${escapeHtml(rack.rackName || rack.zone || "Lokasi")}</option>`).join("")}`;
      rackSelect.disabled = false;
    } catch (error) {
      rackSelect.innerHTML = '<option value="">Rack gagal dimuat</option>';
      showAlert(error.message);
    }
  }

  async function openReceive(row) {
    state.current = row;
    clearAlert();
    element("fg-modal-title").textContent = `Receive ${row.fgPart?.partCode || "Finished Goods"}`;
    element("fg-modal-subtitle").textContent = `${row.inspectionNumber} · pending ${formatNumber(row.qtyPending, row.uomCode)} ${row.uomCode || ""}`;
    element("fg-modal-reference").innerHTML = [
      ["QC Inspection", row.inspectionNumber], ["Production Entry", row.productionLogNumber],
      ["MO / WO", [row.moNumber, row.woNumber].filter(Boolean).join(" / ")], ["Source WIP", row.sourcePart?.partCode],
      ["FG Part", row.fgPart?.partCode], ["Source Location", locationLabel(row.sourceLocation)],
      ["Qty Passed", `${formatNumber(row.qtyPassed, row.uomCode)} ${row.uomCode || ""}`],
      ["Already Received", `${formatNumber(row.qtyReceived, row.uomCode)} ${row.uomCode || ""}`],
    ].map(([label, value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || "-")}</strong></div>`).join("");
    const qtyInput = element("fg-receive-qty");
    qtyInput.value = row.qtyPending;
    qtyInput.max = row.qtyPending;
    qtyInput.step = isDiscreteUom(row.uomCode) ? "1" : "0.001";
    element("fg-qty-help").textContent = `Maksimal ${formatNumber(row.qtyPending, row.uomCode)} ${row.uomCode || ""}${isDiscreteUom(row.uomCode) ? "; tanpa desimal" : ""}.`;
    element("fg-lot").value = "Otomatis saat simpan";
    element("fg-notes").value = "";
    const preferredWarehouse = state.warehouses.some((warehouse) => warehouse.warehouseCode === row.sourceLocation?.warehouseCode)
      ? row.sourceLocation.warehouseCode
      : "";
    fillWarehouseOptions(preferredWarehouse);
    await loadRacks(preferredWarehouse, preferredWarehouse ? row.sourceLocation?.rackCode : "");
    modal.classList.remove("d-none");
    document.body.style.overflow = "hidden";
    qtyInput.focus();
    qtyInput.select();
  }

  function closeModal() {
    modal.classList.add("d-none");
    document.body.style.overflow = "";
    state.current = null;
    form.reset();
    element("fg-modal-alert").className = "alert d-none";
  }

  async function loadData({ preserveTab = true } = {}) {
    const refresh = element("fg-refresh");
    refresh.disabled = true;
    clearAlert();
    if (!preserveTab) element("fg-loading").classList.remove("d-none");
    try {
      const [pendingPayload, historyPayload, warehousePayload] = await Promise.all([
        api("/modules/api/production/fg-receipts/pending?limit=500"),
        api("/modules/api/production/fg-receipts/history?limit=500"),
        api("/modules/api/production/fg-receipts/warehouses?isActive=true&limit=500"),
      ]);
      state.pending = Array.isArray(pendingPayload.items) ? pendingPayload.items : [];
      state.history = Array.isArray(historyPayload.items) ? historyPayload.items : [];
      state.warehouses = Array.isArray(warehousePayload.items) ? warehousePayload.items : [];
      element("fg-loading").classList.add("d-none");
      renderAll();
      setTab(state.activeTab);
      return state.pending;
    } catch (error) {
      element("fg-loading").classList.add("d-none");
      showAlert(error.message);
      throw error;
    } finally {
      refresh.disabled = false;
    }
  }

  document.querySelectorAll("[data-fg-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.fgTab)));
  searchInput.addEventListener("input", renderAll);
  element("fg-refresh").addEventListener("click", () => loadData().catch(() => {}));
  warehouseSelect.addEventListener("change", () => loadRacks(warehouseSelect.value));
  document.querySelectorAll("[data-fg-close]").forEach((button) => button.addEventListener("click", closeModal));
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.classList.contains("d-none")) closeModal(); });

  element("fg-pending-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-fg-receive]");
    if (!button) return;
    const row = state.pending.find((item) => item.inspectionNumber === button.dataset.fgReceive);
    if (row) openReceive(row);
  });

  element("fg-history-body").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-fg-rollback]");
    if (!button) return;
    const row = state.history.find((item) => item.movementNumber === button.dataset.fgRollback);
    if (!row || !confirm(`Rollback ${row.movementNumber}?\n\n${formatNumber(row.qtyReceived, row.uomCode)} ${row.uomCode || ""} akan dikeluarkan dari stock FG dan dikembalikan ke source WIP.`)) return;
    button.disabled = true;
    try {
      await api(`/modules/api/production/fg-receipts/${encodeURIComponent(row.movementNumber)}/rollback`, { method: "PATCH", body: "{}" });
      showAlert(`FG Receipt ${row.movementNumber} berhasil di-rollback.`, "success");
      await loadData();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const row = state.current;
    if (!row) return;
    const qty = number(element("fg-receive-qty").value);
    if (qty <= 0 || qty > number(row.qtyPending) + 0.000001) {
      showAlert(`Qty harus lebih dari 0 dan maksimal ${formatNumber(row.qtyPending, row.uomCode)} ${row.uomCode || ""}.`);
      return;
    }
    if (isDiscreteUom(row.uomCode) && !Number.isInteger(qty)) {
      showAlert(`Qty ${row.uomCode} harus bilangan bulat tanpa desimal.`);
      return;
    }
    if (!warehouseSelect.value) {
      showAlert("Warehouse tujuan wajib dipilih.");
      warehouseSelect.focus();
      return;
    }
    const submit = element("fg-submit");
    submit.disabled = true;
    submit.textContent = "Posting...";
    try {
      const payload = await api(`/modules/api/production/fg-receipts/${encodeURIComponent(row.inspectionNumber)}/receive`, {
        method: "PATCH",
        body: JSON.stringify({
          qty,
          warehouseCode: warehouseSelect.value,
          rackCode: rackSelect.value || null,
          notes: element("fg-notes").value.trim() || null,
        }),
      });
      closeModal();
      showAlert(`FG Receipt ${payload.fgMovementNumber || row.inspectionNumber} berhasil diposting.`, "success");
      state.activeTab = payload.pendingQty > 0 ? "pending" : "history";
      await loadData();
    } catch (error) {
      showAlert(error.message);
    } finally {
      submit.disabled = false;
      submit.textContent = "Post FG Receipt";
    }
  });

  loadData({ preserveTab: false }).then((rows) => {
    const requestedInspection = new URLSearchParams(location.search).get("inspection");
    if (!requestedInspection) return;
    const row = rows.find((item) => item.inspectionNumber === requestedInspection);
    if (row) openReceive(row);
    else showAlert(`Inspection ${requestedInspection} tidak memiliki qty FG yang pending. Cek tab History atau pastikan QC final sudah Completed.`, "warning");
  }).catch(() => {});
})();
