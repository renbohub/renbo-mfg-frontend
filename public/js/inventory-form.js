(function () {
  const config = JSON.parse(document.getElementById("inventory-form-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const form = document.getElementById("inventory-form");
  const alertBox = document.getElementById("inventory-form-alert");
  const state = { warehouses: [], racks: [], lots: [], parts: [], materials: [], uoms: [], materialPieceSources: [], movementLines: [], editingLineId: null, stoPreviewSignature: null };
  const value = (id) => document.getElementById(id)?.value?.trim() || "";
  const esc = (input) => String(input ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const show = (message, type = "danger") => { alertBox.textContent = message; alertBox.className = `alert alert-${type}`; };
  const rows = (payload) => Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);

  async function lookup(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Lookup master gagal dimuat.");
    return rows(payload);
  }

  function fillSelect(id, source, valueOf, labelOf, placeholder) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.multiple ? [...select.selectedOptions].map((option) => option.value) : select.value;
    const placeholderOption = select.multiple ? "" : `<option value="">${esc(placeholder)}</option>`;
    select.innerHTML = `${placeholderOption}${source.map((row) => `<option value="${esc(valueOf(row))}">${esc(labelOf(row))}</option>`).join("")}`;
    if (select.multiple) [...select.options].forEach((option) => { option.selected = current.includes(option.value); });
    else if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function fillLocations() {
    const warehouses = state.warehouses.filter((row) => row.warehouseCode && row.isActive !== false);
    fillSelect("warehouseCode", warehouses, (row) => row.warehouseCode, (row) => `${row.warehouseCode} — ${row.warehouseName || ""}`, "Pilih warehouse");
    fillSelect("destinationWarehouseCode", warehouses, (row) => row.warehouseCode, (row) => `${row.warehouseCode} — ${row.warehouseName || ""}`, "Pilih warehouse tujuan");
    fillRacks("rackCode", value("warehouseCode"));
    fillRacks("destinationRackCode", value("destinationWarehouseCode"));
  }

  function fillRacks(targetId, warehouseCode) {
    const racks = state.racks.filter((row) => row.rackCode && row.isActive !== false && warehouseCode && row.warehouseCode === warehouseCode);
    const emptyLabel = config.page === "stock-opname" ? "Semua rack" : "Tanpa rack";
    fillSelect(targetId, racks, (row) => row.rackCode, (row) => `${row.rackCode} — ${row.rackName || row.zone || ""}`, warehouseCode ? emptyLabel : "Pilih warehouse terlebih dahulu");
  }

  function fillStoStockTypes() {
    if (config.page !== "stock-opname") return;
    const options = {
      MATERIAL: [["", "Semua material scope"], ["Material", "Material"], ["Purchase Part", "Purchase Part"]],
      WIP: [["", "Semua WIP / WP scope"], ["WIP", "WIP"], ["WP", "WP"], ["Semi-Finished", "Semi-Finished"]],
      FG: [["", "Semua finished goods scope"], ["Finished Goods", "Finished Goods"], ["FG", "FG (legacy)"]],
    }[value("stoType")] || [];
    const select = document.getElementById("stockType");
    const current = [...select.selectedOptions].map((option) => option.value);
    select.innerHTML = options.filter(([optionValue]) => optionValue).map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}">${esc(optionLabel)}</option>`).join("");
    [...select.options].forEach((option) => { option.selected = current.includes(option.value); });
    state.stoPreviewSignature = null;
  }

  function fillLots() {
    const selectedPartCode = value("partCode");
    const selectedMaterialCode = value("materialCode");
    const lots = (!selectedPartCode && !selectedMaterialCode ? [] : state.lots).filter((row) => row.lotNumber
      && (!selectedPartCode || row.partCode === selectedPartCode)
      && (!selectedMaterialCode || row.materialCode === selectedMaterialCode));
    fillSelect("lotNumber", lots, (row) => row.lotNumber, (row) => `${row.lotNumber}${row.materialCode ? ` — ${row.materialCode}` : row.partCode ? ` — ${row.partCode}` : ""}`, "Tanpa lot");
  }

  function deriveStockType(part) {
    if (String(part?.itemType || "").toUpperCase() === "FG") return "Finished Goods";
    if (String(part?.itemType || "").toUpperCase() === "WIP") return "WIP";
    if (String(part?.rawType || "").toUpperCase() === "PURCHASE_PART") return "Purchase Part";
    if (String(part?.itemType || "").toUpperCase() === "RAW" || part?.materialId) return "Material";
    return "";
  }

  function partProcessName(part) {
    if (Array.isArray(part?.bomProcessNames) && part.bomProcessNames.length) return part.bomProcessNames.join(", ");
    const processes = (part?.mbomDetails || []).flatMap((detail) => (detail.mbomProcesses || []).map((process) => ({ ...process, revision: detail.mbomHeader?.revision || 0 })))
      .sort((left, right) => Number(right.revision || 0) - Number(left.revision || 0) || Number(left.sequence || 0) - Number(right.sequence || 0));
    const process = processes.find((item) => item.process?.processName || item.occurrenceCode);
    return process?.occurrenceCode || process?.process?.processName || part?.process?.processName || "";
  }

  function setValue(id, nextValue) {
    const input = document.getElementById(id);
    if (input) input.value = nextValue ?? "";
  }

  const usesMaterialPieceConversion = () => value("inputMode") === "MATERIAL_FROM_PART_PCS";

  function setDisabled(id, disabled) {
    const input = document.getElementById(id);
    if (input) input.disabled = disabled;
  }

  function selectUom(uomCode) {
    const select = document.getElementById("uomCode");
    if (!select) return;
    let option = [...select.options].find((item) => item.value.toUpperCase() === String(uomCode).toUpperCase());
    if (!option) {
      option = document.createElement("option");
      option.value = String(uomCode).toUpperCase();
      option.textContent = `${option.value} - ${option.value}`;
      select.append(option);
    }
    select.value = option.value;
  }

  function clearItemIdentity() {
    ["partCode", "partNumber", "partName", "materialId", "materialCode", "materialName", "materialType", "itemReference", "itemName"].forEach((id) => setValue(id, ""));
  }

  function fillItems() {
    clearItemIdentity();
    setValue("itemCode", "");
    const stockType = value("stockType");
    const itemLabel = document.getElementById("inventory-item-label");
    if (stockType === "Material") {
      if (itemLabel) itemLabel.textContent = "Material *";
      fillSelect("itemCode", state.materials, (row) => row.materialCode, (row) => `${row.materialCode} — ${row.materialName || row.spec || ""}`, "Pilih material");
    } else {
      if (itemLabel) itemLabel.textContent = "Part *";
      const parts = state.parts.filter((part) => {
        if (stockType === "Purchase Part") return String(part.rawType || "").toUpperCase() === "PURCHASE_PART";
        if (stockType === "WIP") return String(part.itemType || "").toUpperCase() === "WIP";
        if (stockType === "Finished Goods") return String(part.itemType || "").toUpperCase() === "FG";
        return false;
      });
      fillSelect("itemCode", parts, (row) => row.partCode, (row) => `${row.partCode} — ${row.partNumber || "-"} — ${row.partName || ""}${partProcessName(row) ? ` — (${partProcessName(row)})` : ""}`, stockType ? "Pilih part" : "Pilih stock type terlebih dahulu");
    }
    fillLots();
  }

  function fillMaterialPieceSources() {
    fillSelect(
      "materialPieceSource",
      state.materialPieceSources,
      (row) => row.mbomDetailId,
      (row) => `${row.sourcePartCode} - ${row.sourcePartNumber || "-"} - ${row.materialCode} - GW ${Number(row.grossWeightKgPerPcs || 0).toFixed(2)} kg/pcs - ${row.mbomNoReg}`,
      "Pilih part raw material dan referensi BOM",
    );
  }

  function selectedMaterialPieceSource() {
    return state.materialPieceSources.find((row) => row.mbomDetailId === value("materialPieceSource")) || null;
  }

  function renderMaterialPiecePreview() {
    const preview = document.getElementById("material-piece-preview");
    if (!preview) return;
    const source = selectedMaterialPieceSource();
    const sourceQtyPcs = Number(value("sourceQtyPcs"));
    if (!source) {
      preview.innerHTML = "Pilih part sumber untuk menghitung <b>PCS x gross weight BOM</b> menjadi stok material KG.";
      setValue("qty", "");
      return;
    }
    const grossWeight = Number(source.grossWeightKgPerPcs || 0);
    const convertedQty = Number.isFinite(sourceQtyPcs) && sourceQtyPcs > 0 ? sourceQtyPcs * grossWeight : 0;
    const roundedQty = convertedQty > 0 ? Number(convertedQty.toFixed(9)) : 0;
    setValue("qty", roundedQty || "");
    preview.innerHTML = `<strong>${esc(source.sourcePartCode)} (${esc(source.sourcePartNumber || "-")})</strong> - ${esc(sourceQtyPcs > 0 ? sourceQtyPcs : 0)} PCS x ${esc(grossWeight)} kg/pcs = <strong>${esc(roundedQty)} KG</strong><br><small>Stok tujuan: ${esc(source.materialCode)} - Referensi ${esc(source.mbomNoReg)} - Parent ${esc(source.parentPartCode || "-")}</small>`;
  }

  function syncMaterialPieceSource() {
    if (!usesMaterialPieceConversion()) return;
    clearItemIdentity();
    const source = selectedMaterialPieceSource();
    if (!source) {
      setValue("itemCode", "");
      renderMaterialPiecePreview();
      fillLots();
      return;
    }
    setValue("itemCode", source.materialCode);
    setValue("materialId", source.materialId);
    setValue("materialCode", source.materialCode);
    setValue("materialName", source.materialName);
    setValue("materialType", source.materialType);
    setValue("itemReference", source.materialType || source.materialSpec || "Material");
    setValue("itemName", `${source.materialCode} - ${source.materialName || source.materialSpec || ""}`);
    selectUom("KG");
    renderMaterialPiecePreview();
    fillLots();
  }

  function syncInputMode() {
    if (config.page !== "stock-movements") return;
    const conversionMode = usesMaterialPieceConversion();
    document.querySelectorAll("[data-material-piece-field]").forEach((field) => field.classList.toggle("d-none", !conversionMode));
    const source = document.getElementById("materialPieceSource");
    const sourceQty = document.getElementById("sourceQtyPcs");
    if (source) source.required = conversionMode;
    if (sourceQty) sourceQty.required = conversionMode;
    ["stockType", "itemCode", "uomCode"].forEach((id) => setDisabled(id, conversionMode));
    const qty = document.getElementById("qty");
    if (qty) qty.readOnly = conversionMode;
    document.getElementById("inventory-reference-label").textContent = conversionMode ? "Material Type / Spec" : "Part Number / Material Type";
    document.getElementById("inventory-name-label").textContent = conversionMode ? "Material yang Masuk" : "Nama Item";
    document.getElementById("inventory-uom-label").textContent = conversionMode ? "UOM Hasil" : "UOM *";
    document.getElementById("inventory-qty-label").textContent = conversionMode ? "Qty Hasil (KG)" : "Qty *";
    if (conversionMode) {
      setValue("stockType", "Material");
      fillItems();
      selectUom("KG");
      syncMaterialPieceSource();
    } else {
      setValue("materialPieceSource", "");
      setValue("sourceQtyPcs", "");
      setValue("qty", "");
      fillItems();
    }
    if (conversionMode) document.getElementById("inventory-item-label").textContent = "Material Tujuan";
    syncInputModeRequirements();
  }

  function syncItem() {
    clearItemIdentity();
    const stockType = value("stockType");
    const selectedCode = value("itemCode");
    let suggestedUom = "";
    if (stockType === "Material") {
      const material = state.materials.find((row) => row.materialCode === selectedCode);
      if (material) {
        setValue("materialId", material.id);
        setValue("materialCode", material.materialCode);
        setValue("materialName", material.materialName || material.spec);
        setValue("materialType", material.materialType);
        setValue("itemReference", material.materialType || material.materialForm);
        setValue("itemName", material.materialName || material.spec);
        suggestedUom = material.defaultConversionUomCode || (String(material.materialForm || "").toUpperCase() === "PIECES" ? "PCS" : "KG");
      }
    } else {
      const part = state.parts.find((row) => row.partCode === selectedCode);
      if (part) {
        setValue("partCode", part.partCode);
        setValue("partNumber", part.partNumber);
        setValue("partName", part.partName);
        setValue("itemReference", part.partNumber);
        setValue("itemName", part.partName);
        suggestedUom = part.stockUomCode || part.baseUomCode || part.productionUomCode || part.purchaseUomCode || "";
      }
    }
    const uom = document.getElementById("uomCode");
    const matchingUom = uom && [...uom.options].find((option) => option.value.toLowerCase() === String(suggestedUom).toLowerCase());
    if (matchingUom) uom.value = matchingUom.value;
    fillLots();
  }

  function syncMovementFields() {
    const movementType = value("movementType");
    document.querySelectorAll("[data-transfer-field]").forEach((field) => field.classList.toggle("d-none", movementType !== "TRANSFER"));
    document.querySelectorAll("[data-adjustment-field]").forEach((field) => field.classList.toggle("d-none", movementType !== "ADJUSTMENT"));
    const destinationWarehouse = document.getElementById("destinationWarehouseCode");
    const adjustmentType = document.getElementById("adjustmentType");
    if (destinationWarehouse) destinationWarehouse.required = movementType === "TRANSFER";
    if (adjustmentType) adjustmentType.required = movementType === "ADJUSTMENT";
  }

  function movementLinePayload() {
    const source = selectedMaterialPieceSource();
    return {
      movementType: value("movementType"),
      inputMode: value("inputMode") || "DIRECT",
      warehouseCode: value("warehouseCode"),
      rackCode: value("rackCode") || null,
      destinationWarehouseCode: value("destinationWarehouseCode") || null,
      destinationRackCode: value("destinationRackCode") || null,
      partCode: value("partCode"),
      partNumber: value("partNumber") || null,
      partName: value("partName") || null,
      materialId: value("materialId") || null,
      materialCode: value("materialCode") || null,
      materialName: value("materialName") || null,
      materialType: value("materialType") || null,
      stockType: value("stockType"),
      lotNumber: value("lotNumber") || null,
      uomCode: value("uomCode"),
      qty: Number(value("qty")),
      sourceMbomDetailId: value("materialPieceSource") || null,
      sourcePartCode: source?.sourcePartCode || null,
      sourceQtyPcs: usesMaterialPieceConversion() ? Number(value("sourceQtyPcs")) : null,
      adjustmentType: value("adjustmentType") || null,
      referenceNumber: value("referenceNumber") || null,
      notes: value("notes") || null,
    };
  }

  function validateMovementEditor() {
    syncMovementFields();
    syncInputModeRequirements();
    if (!form.reportValidity()) return false;
    const payload = movementLinePayload();
    if (!payload.stockType || (!payload.partCode && !payload.materialCode)) { show("Pilih Stock Type dan item untuk baris ini."); return false; }
    if (!(Number(payload.qty) > 0)) { show("Qty harus lebih besar dari 0."); return false; }
    return true;
  }

  function syncInputModeRequirements() {
    if (config.page !== "stock-movements") return;
    const conversionMode = usesMaterialPieceConversion();
    const itemCode = document.getElementById("itemCode");
    const stockType = document.getElementById("stockType");
    const uomCode = document.getElementById("uomCode");
    if (itemCode) itemCode.required = !conversionMode;
    if (stockType) stockType.required = !conversionMode;
    if (uomCode) uomCode.required = !conversionMode;
  }

  function resetMovementEditor() {
    state.editingLineId = null;
    clearItemIdentity();
    ["itemCode", "lotNumber", "qty", "materialPieceSource", "sourceQtyPcs", "referenceNumber", "notes"].forEach((id) => setValue(id, ""));
    setValue("itemReference", ""); setValue("itemName", "");
    fillItems(); fillLots();
    const add = document.getElementById("inventory-add-line");
    if (add) add.textContent = "＋ Tambahkan ke Daftar";
    const preview = document.getElementById("material-piece-preview");
    if (preview && usesMaterialPieceConversion()) preview.innerHTML = "Pilih part sumber untuk menghitung <b>PCS x gross weight BOM</b> menjadi stok material KG.";
  }

  function renderMovementLines() {
    if (config.page !== "stock-movements") return;
    const body = document.getElementById("inventory-batch-body");
    const count = document.getElementById("inventory-batch-count");
    const clear = document.getElementById("inventory-clear-lines");
    if (count) count.textContent = `${state.movementLines.length} item siap disimpan`;
    if (clear) clear.disabled = !state.movementLines.length;
    const submit = document.getElementById("inventory-submit");
    if (submit) submit.textContent = state.movementLines.length ? `Simpan ${state.movementLines.length} Movement` : "Simpan Semua Movement";
    if (!body) return;
    if (!state.movementLines.length) {
      body.innerHTML = '<tr data-empty><td colspan="9"><div class="inventory-batch-empty">Belum ada item. Isi form lalu klik <b>Tambahkan ke Daftar</b>.</div></td></tr>';
      return;
    }
    body.innerHTML = state.movementLines.map((line, index) => {
      const payload = line.payload; const itemCode = payload.materialCode || payload.partCode || "-";
      const itemRef = payload.materialType || payload.partNumber || "-"; const itemName = payload.materialName || payload.partName || "-";
      const location = `${payload.warehouseCode}${payload.rackCode ? ` / ${payload.rackCode}` : ""}`;
      const destination = payload.movementType === "TRANSFER" ? ` → ${payload.destinationWarehouseCode}${payload.destinationRackCode ? ` / ${payload.destinationRackCode}` : ""}` : "";
      const shownQty = payload.inputMode === "MATERIAL_FROM_PART_PCS" ? `${qtyText(payload.sourceQtyPcs, "PCS")} PCS → ${qtyText(payload.qty, payload.uomCode)} ${esc(payload.uomCode || "")}` : `${qtyText(payload.qty, payload.uomCode)} ${esc(payload.uomCode || "")}`;
      return `<tr><td>${index + 1}</td><td><span class="inventory-batch-type">${esc(payload.movementType)}</span>${payload.adjustmentType ? `<small class="d-block mt-1">${esc(payload.adjustmentType)}</small>` : ""}</td><td>${esc(location)}${esc(destination)}</td><td>${esc(payload.stockType)}</td><td class="inventory-batch-item"><b>${esc(itemCode)}</b><span>${esc(itemRef)}</span><small>${esc(itemName)}</small></td><td>${esc(payload.lotNumber || "Tanpa lot")}</td><td class="inventory-batch-qty">${shownQty}</td><td>${esc(payload.referenceNumber || "-")}</td><td><div class="d-flex gap-1"><button class="btn btn-sm btn-outline-primary" type="button" data-edit-movement-line="${esc(line.id)}">Edit</button><button class="inventory-batch-remove" type="button" data-remove-movement-line="${esc(line.id)}" title="Hapus">×</button></div></td></tr>`;
    }).join("");
  }

  function qtyText(nextValue, uomCode) {
    return window.SharedDataTable?.formatQuantity ? window.SharedDataTable.formatQuantity(nextValue, uomCode, { maximumFractionDigits: 2 }) : Number(nextValue || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }

  function addOrUpdateMovementLine() {
    if (!state.editingLineId && state.movementLines.length >= 100) {
      show("Maksimal 100 baris dalam satu transaksi. Simpan daftar ini sebelum membuat batch berikutnya.", "warning");
      return;
    }
    if (!validateMovementEditor()) return;
    const payload = movementLinePayload();
    if (state.editingLineId) {
      const target = state.movementLines.find((line) => line.id === state.editingLineId);
      if (target) target.payload = payload;
      show("Baris berhasil diperbarui. Perubahan belum memengaruhi stok sampai disimpan.", "success");
    } else {
      state.movementLines.push({ id: window.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random()}`, payload });
      show("Item ditambahkan ke daftar. Tambahkan item berikutnya atau simpan seluruh movement.", "success");
    }
    resetMovementEditor(); renderMovementLines();
  }

  function editMovementLine(id) {
    const line = state.movementLines.find((item) => item.id === id); if (!line) return;
    const payload = line.payload; state.editingLineId = id;
    setValue("movementType", payload.movementType); syncMovementFields();
    setValue("inputMode", payload.inputMode); syncInputMode();
    setValue("warehouseCode", payload.warehouseCode); fillRacks("rackCode", payload.warehouseCode); setValue("rackCode", payload.rackCode);
    setValue("destinationWarehouseCode", payload.destinationWarehouseCode); fillRacks("destinationRackCode", payload.destinationWarehouseCode); setValue("destinationRackCode", payload.destinationRackCode);
    setValue("stockType", payload.stockType); fillItems();
    if (payload.inputMode === "MATERIAL_FROM_PART_PCS") {
      setValue("materialPieceSource", payload.sourceMbomDetailId); setValue("sourceQtyPcs", payload.sourceQtyPcs); syncMaterialPieceSource();
    } else { setValue("itemCode", payload.materialCode || payload.partCode); syncItem(); setValue("qty", payload.qty); }
    fillLots(); setValue("lotNumber", payload.lotNumber); setValue("uomCode", payload.uomCode); setValue("adjustmentType", payload.adjustmentType); setValue("referenceNumber", payload.referenceNumber); setValue("notes", payload.notes);
    const add = document.getElementById("inventory-add-line"); if (add) add.textContent = "Simpan Perubahan Baris";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selectedValues = (id) => {
    const select = document.getElementById(id);
    return select ? [...select.selectedOptions].map((option) => option.value).filter(Boolean) : [];
  };
  const commaValues = (id) => [...new Set(value(id).split(",").map((item) => item.trim()).filter(Boolean))];
  function stockOpnamePayload() {
    return {
      countMode: value("countMode") || "FULL",
      stoType: value("stoType"),
      stockTypes: selectedValues("stockType"),
      warehouseCode: value("warehouseCode"),
      rackCodes: selectedValues("rackCode"),
      lotNumbers: commaValues("lotNumbers"),
      stoDate: value("stoDate"),
      toleranceQty: Number(value("toleranceQty") || 0),
      tolerancePercent: Number(value("tolerancePercent") || 0),
      includeZeroBalance: document.getElementById("includeZeroBalance")?.checked !== false,
      notes: value("notes") || null,
    };
  }
  const stockOpnameSignature = () => JSON.stringify(stockOpnamePayload());
  async function previewStockOpnameScope() {
    if (config.page !== "stock-opname") return null;
    if (!form.reportValidity()) return null;
    const body = stockOpnamePayload();
    if (body.countMode === "CYCLE" && !body.rackCodes.length && !body.lotNumbers.length) {
      throw new Error("Cycle Count wajib memilih minimal satu rack atau lot.");
    }
    const response = await fetch("/modules/api/inventory/stock-opname/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Preview scope gagal.");
    state.stoPreviewSignature = stockOpnameSignature();
    const panel = document.getElementById("sto-scope-preview");
    if (panel) {
      const summary = payload.summary || {};
      panel.classList.remove("d-none");
      panel.innerHTML = `<header><div><strong>${esc(summary.lineCount || 0)} line masuk scope</strong><small>${esc(body.countMode)} · ${esc(body.stoType)} · ${esc(body.warehouseCode)}</small></div><span class="badge text-bg-light">On Hand ${esc(Number(summary.qtyOnHand || 0).toLocaleString("id-ID"))}</span></header>
        <div class="p-3"><div class="d-flex flex-wrap gap-3"><span>Reserved <b>${esc(Number(summary.qtyReserved || 0).toLocaleString("id-ID"))}</b></span><span>QC <b>${esc(Number(summary.qtyQC || 0).toLocaleString("id-ID"))}</b></span><span>Free <b>${esc(Number(summary.qtyAvailable || 0).toLocaleString("id-ID"))}</b></span></div>
        ${(payload.stockTypeBreakdown || []).map((row) => `<div><small>${esc(row.stockType)}: ${esc(row.lineCount)} line · ${esc(Number(row.qtyOnHand || 0).toLocaleString("id-ID"))}</small></div>`).join("")}
        ${(payload.warnings || []).map((warning) => `<div class="text-warning"><small>${esc(warning)}</small></div>`).join("")}</div>`;
    }
    return payload;
  }
  async function loadLookups() {
    try {
      const requests = [
        lookup("/modules/api/inventory/warehouses?limit=500&isActive=true"),
        lookup("/modules/api/inventory/racks?limit=1000&isActive=true"),
        ...(config.page === "stock-movements" ? [
          lookup("/modules/api/inventory/lots?limit=1000&isDeleted=false"),
          lookup("/master-data/api/parts?page=1&limit=500&isDeleted=false&includeBomProcess=true"),
          lookup("/master-data/api/materials?start=0&length=500&isDeleted=false"),
          lookup("/master-data/api/uom?start=0&length=500&isDeleted=false"),
          lookup("/modules/api/inventory/stock-movements/material-piece-sources"),
        ] : []),
      ];
      const [warehouses, racks = [], lots = [], parts = [], materials = [], uoms = [], materialPieceSources = []] = await Promise.all(requests);
      Object.assign(state, { warehouses, racks, lots, parts, materials, uoms, materialPieceSources });
      fillLocations();
      if (!state.warehouses.some((row) => row.warehouseCode && row.isActive !== false)) {
        show("Warehouse aktif belum tersedia. Tambahkan dahulu melalui Master Data → Gudang.", "warning");
      }
      if (config.page === "stock-movements") {
        fillSelect("uomCode", state.uoms, (row) => row.uomCode, (row) => `${row.uomCode} — ${row.uomName || ""}`, "Pilih UOM");
        fillMaterialPieceSources();
        fillItems();
        fillLots();
        syncInputMode();
      }
      fillStoStockTypes();
    } catch (error) {
      show(error.message);
    }
  }

  const dateInput = document.getElementById("stoDate");
  if (dateInput) {
    const today = new Date();
    dateInput.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  document.getElementById("movementType")?.addEventListener("change", syncMovementFields);
  document.getElementById("inputMode")?.addEventListener("change", syncInputMode);
  document.getElementById("stockType")?.addEventListener("change", () => {
    if (config.page === "stock-opname") state.stoPreviewSignature = null;
    else fillItems();
  });
  document.getElementById("stoType")?.addEventListener("change", fillStoStockTypes);
  document.getElementById("sto-preview-scope")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await previewStockOpnameScope(); show("Preview scope berhasil dimuat.", "success"); }
    catch (error) { show(error.message); }
    finally { event.currentTarget.disabled = false; }
  });
  ["countMode", "warehouseCode", "rackCode", "lotNumbers", "toleranceQty", "tolerancePercent", "includeZeroBalance"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => { state.stoPreviewSignature = null; });
  });
  document.getElementById("itemCode")?.addEventListener("change", syncItem);
  document.getElementById("materialPieceSource")?.addEventListener("change", syncMaterialPieceSource);
  document.getElementById("sourceQtyPcs")?.addEventListener("input", renderMaterialPiecePreview);
  document.getElementById("warehouseCode")?.addEventListener("change", () => fillRacks("rackCode", value("warehouseCode")));
  document.getElementById("destinationWarehouseCode")?.addEventListener("change", () => fillRacks("destinationRackCode", value("destinationWarehouseCode")));
  document.getElementById("inventory-add-line")?.addEventListener("click", addOrUpdateMovementLine);
  document.getElementById("inventory-clear-lines")?.addEventListener("click", () => {
    if (!state.movementLines.length || !window.confirm("Kosongkan seluruh daftar Stock Movement yang belum disimpan?")) return;
    state.movementLines = []; resetMovementEditor(); renderMovementLines(); show("Daftar dikosongkan.", "warning");
  });
  document.getElementById("inventory-batch-body")?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-movement-line]");
    const remove = event.target.closest("[data-remove-movement-line]");
    if (edit) return editMovementLine(edit.dataset.editMovementLine);
    if (!remove) return;
    state.movementLines = state.movementLines.filter((line) => line.id !== remove.dataset.removeMovementLine);
    if (state.editingLineId === remove.dataset.removeMovementLine) resetMovementEditor();
    renderMovementLines();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncMovementFields();
    let body;
    if (config.page === "stock-movements") {
      if (state.editingLineId) { show("Selesaikan perubahan baris dengan klik Simpan Perubahan Baris."); return; }
      if (!state.movementLines.length) {
        if (!validateMovementEditor()) { show("Tambahkan minimal satu item ke daftar sebelum menyimpan."); return; }
        state.movementLines.push({ id: window.crypto?.randomUUID?.() || `line-${Date.now()}`, payload: movementLinePayload() });
        renderMovementLines();
      }
      body = { items: state.movementLines.map((line) => line.payload) };
    } else {
      if (!form.reportValidity()) return;
      body = stockOpnamePayload();
      if (state.stoPreviewSignature !== stockOpnameSignature()) {
        const preview = await previewStockOpnameScope();
        if (!preview || !Number(preview.summary?.lineCount || 0)) {
          show("Scope tidak memiliki stock balance. Ubah filter lalu preview kembali.");
          return;
        }
      }
    }
    const endpoint = config.page === "stock-movements" ? "/modules/api/inventory/stock-movements" : "/modules/api/inventory/stock-opname";
    const submitButton = document.getElementById("inventory-submit");
    try {
      if (submitButton) submitButton.disabled = true;
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Transaksi gagal disimpan.");
      const key = config.page === "stock-movements" ? payload.items?.[0]?.movementNumber : payload.stoNo;
      const conversion = payload.conversion;
      const batch = payload.batch;
      show(batch ? `${batch.processedLines} item berhasil diproses menjadi ${batch.movementCount} Stock Movement.` : conversion
        ? `Transaksi berhasil: ${conversion.sourceQtyPcs} PCS ${conversion.sourcePartCode} dikonversi menjadi ${conversion.convertedQtyKg} KG ${conversion.materialCode}.`
        : "Transaksi berhasil dibuat.", "success");
      setTimeout(() => location.assign(batch ? `/modules/inventory/${config.page}` : `/modules/inventory/${config.page}/${encodeURIComponent(key || "")}`), 700);
    } catch (error) {
      show(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  syncMovementFields();
  renderMovementLines();
  loadLookups();
})();
