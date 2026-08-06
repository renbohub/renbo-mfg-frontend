(function () {
  const config = JSON.parse(document.getElementById("inventory-form-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const form = document.getElementById("inventory-form");
  const alertBox = document.getElementById("inventory-form-alert");
  const state = { warehouses: [], racks: [], lots: [], parts: [], materials: [], uoms: [], materialPieceSources: [] };
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
    const current = select.value;
    select.innerHTML = `<option value="">${esc(placeholder)}</option>${source.map((row) => `<option value="${esc(valueOf(row))}">${esc(labelOf(row))}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
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
      WIP: [["", "Semua WIP scope"], ["WIP", "WIP"], ["Semi-Finished", "Semi-Finished"]],
      FG: [["", "Semua finished goods scope"], ["Finished Goods", "Finished Goods"], ["FG", "FG (legacy)"]],
    }[value("stoType")] || [];
    const select = document.getElementById("stockType");
    const current = select.value;
    select.innerHTML = options.map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}">${esc(optionLabel)}</option>`).join("");
    select.value = options.some(([optionValue]) => optionValue === current) ? current : "";
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
      (row) => `${row.sourcePartCode} - ${row.sourcePartNumber || "-"} - ${row.materialCode} - GW ${Number(row.grossWeightKgPerPcs || 0).toFixed(6)} kg/pcs - ${row.mbomNoReg}`,
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
  document.getElementById("stockType")?.addEventListener("change", fillItems);
  document.getElementById("stoType")?.addEventListener("change", fillStoStockTypes);
  document.getElementById("itemCode")?.addEventListener("change", syncItem);
  document.getElementById("materialPieceSource")?.addEventListener("change", syncMaterialPieceSource);
  document.getElementById("sourceQtyPcs")?.addEventListener("input", renderMaterialPiecePreview);
  document.getElementById("warehouseCode")?.addEventListener("change", () => fillRacks("rackCode", value("warehouseCode")));
  document.getElementById("destinationWarehouseCode")?.addEventListener("change", () => fillRacks("destinationRackCode", value("destinationWarehouseCode")));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncMovementFields();
    if (!form.reportValidity()) return;
    const body = config.page === "stock-movements"
      ? {
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
          sourcePartCode: selectedMaterialPieceSource()?.sourcePartCode || null,
          sourceQtyPcs: usesMaterialPieceConversion() ? Number(value("sourceQtyPcs")) : null,
          adjustmentType: value("adjustmentType") || null,
          referenceNumber: value("referenceNumber") || null,
          notes: value("notes") || null,
        }
      : { stoType: value("stoType"), stockType: value("stockType"), warehouseCode: value("warehouseCode"), rackCode: value("rackCode") || null, stoDate: value("stoDate"), notes: value("notes") || null };
    const endpoint = config.page === "stock-movements" ? "/modules/api/inventory/stock-movements" : "/modules/api/inventory/stock-opname";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Transaksi gagal disimpan.");
      const key = config.page === "stock-movements" ? payload.items?.[0]?.movementNumber : payload.stoNo;
      const conversion = payload.conversion;
      show(conversion
        ? `Transaksi berhasil: ${conversion.sourceQtyPcs} PCS ${conversion.sourcePartCode} dikonversi menjadi ${conversion.convertedQtyKg} KG ${conversion.materialCode}.`
        : "Transaksi berhasil dibuat.", "success");
      setTimeout(() => location.assign(`/modules/inventory/${config.page}/${encodeURIComponent(key || "")}`), 500);
    } catch (error) {
      show(error.message);
    }
  });

  syncMovementFields();
  loadLookups();
})();
