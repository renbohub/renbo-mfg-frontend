(function () {
  const config = JSON.parse(document.getElementById("module-page-config").textContent);
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const columns = Array.isArray(config.reportColumns) ? config.reportColumns : [];
  const inventoryMode = config.reportMode === "inventory-traceability";
  const state = { rows: [], report: null, chart: null, selectedFgPartId: "", inventoryMatrixMode: "qty" };
  let timer = null;
  const gallery = window.ListGallery?.init({
    root: "#report-list-root",
    storageKey: `report-view:${config.module}:${config.slug}`,
    title: (row) => shared.get(row, columns[0]?.data) || config.label,
    subtitle: (row) => shared.get(row, columns[1]?.data) || config.description,
    status: (row) => row.status || row.readinessStatus || row.costingStatus || row.agingStatus || "Report",
  });

  const reportLabels = {
    reworkSuccessfulQty: "Rework Berhasil",
    reworkRecoveredValue: "Nilai Rework Terselamatkan",
    scrapQty: "Scrap Final",
    scrapValue: "Nilai Scrap",
    scrapKg: "Berat Scrap",
    missingUnitCostRows: "Part Belum Ada Biaya",
    missingWeightRows: "Part Belum Ada Berat",
    missingScrapPriceRows: "Scrap Belum Ada Harga/KG",
  };
  const label = (key) => reportLabels[key] || String(key || "").replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
  const numberFrom = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const isCurrencyKey = (key) => /cost|amount|revenue|margin|cogs|spend|price|value/i.test(key);
  const isPercentKey = (key) => /percent|coverage|rate|efficiency/i.test(key);
  const displayValue = (key, value) => {
    if (/Rows$/.test(key)) return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(numberFrom(value));
    if (["reworkSuccessfulQty", "scrapQty"].includes(key)) return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(numberFrom(value))} PCS`;
    if (key === "scrapKg") return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(numberFrom(value))} KG`;
    if (isPercentKey(key)) return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberFrom(value))}%`;
    if (isCurrencyKey(key)) return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(numberFrom(value));
    return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberFrom(value));
  };
  const displayQuantity = (value, uomCode) => shared.formatQuantity(value, uomCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function setAlert(message = "") {
    const box = document.getElementById("report-alert");
    box.textContent = message;
    box.classList.toggle("d-none", !message);
  }
  function renderSummary() {
    const entries = Object.entries(state.report?.summary || {});
    const notes = {
      reworkSuccessfulQty: "Qty Good dari Work Order Rework",
      reworkRecoveredValue: "Aset terselamatkan dalam Rupiah",
      scrapQty: "Keputusan final QC dalam PCS",
      scrapValue: "Estimasi nilai jual scrap dalam Rupiah",
    };
    entries.slice(0, 4).forEach(([key, value], index) => {
      document.getElementById(`report-label-${index}`).textContent = label(key);
      document.getElementById(`report-value-${index}`).textContent = displayValue(key, value);
      document.getElementById(`report-note-${index}`).textContent = notes[key] || "Sesuai filter laporan";
    });
    for (let index = entries.length; index < 4; index += 1) {
      document.getElementById(`report-label-${index}`).textContent = "No Data";
      document.getElementById(`report-value-${index}`).textContent = "0,00";
      document.getElementById(`report-note-${index}`).textContent = "Belum tersedia";
    }
    document.getElementById("report-insights").innerHTML = entries.slice(4).map(([key, value]) =>
      `<div><span>${shared.escapeHtml(label(key))}</span><strong>${shared.escapeHtml(displayValue(key, value))}</strong></div>`,
    ).join("") || "<span>Tidak ada gap tambahan pada filter ini.</span>";
  }
  function renderRows() {
    if (inventoryMode) return renderInventoryDetail();
    const body = document.getElementById("report-rows");
    document.getElementById("report-count").innerHTML = `<i></i> ${new Intl.NumberFormat("id-ID").format(state.report?.total || state.rows.length)} baris`;
    body.innerHTML = state.rows.map((row) =>
      `<tr>${columns.map((column) => `<td>${shared.format(shared.get(row, column.data), column.type)}</td>`).join("")}</tr>`,
    ).join("") || `<tr><td colspan="${Math.max(columns.length, 1)}" class="text-center p-4 text-muted">Belum ada data laporan.</td></tr>`;
    gallery?.setRows(state.rows);
  }

  const traceCategory = (value) => ({ COMPONENT_FG: "Child Part / FG", WIP: "WIP", MATERIAL: "Material", PURCHASE_PART: "Purchase Part", OTHER: "Other" }[value] || value || "Other");
  const uomStock = (stock, uomCode, key) => numberFrom((stock?.byUom || []).find((row) => String(row.uomCode || "").toLowerCase() === uomCode)?.[key]);
  const pcsStock = (line, key) => {
    const actualPcs = uomStock(line.stock, "pcs", key);
    const grossWeight = numberFrom(line.grossWeightPerPieceKg);
    if (line.category !== "MATERIAL" || grossWeight <= 0) return actualPcs;
    return uomStock(line.stock, "kg", key) / grossWeight;
  };
  const stockAttributionTitle = (line, key) => {
    if (line.stockAttribution?.method !== "MATERIAL_PIECE_CONVERSION_HISTORY") return "Material: KG ÷ GW per PCS";
    return `${key}: alokasi material mengikuti histori konversi PCS → KG untuk ${line.stockAttribution.sourcePartCode}; ${displayQuantity(line.stockAttribution.attributedKg, "KG")} kg (${numberFrom(line.stockAttribution.sharePercent).toLocaleString("id-ID", { maximumFractionDigits: 2 })}% dari pool material).`;
  };
  const processLabel = (line) => (line.processes || []).map((row) => [row.processCode, row.processName].filter(Boolean).join(" — ")).join(" → ") || "—";
  const stockStatus = (line) => (line.stock?.byUom || []).some((row) => numberFrom(row.qtyAvailable) > 0) ? "AVAILABLE" : "NO AVAILABLE STOCK";
  const selectedFg = () => (state.report?.traceability?.items || []).find((row) => row.fgPartId === state.selectedFgPartId) || null;
  const exportQuantity = (value, uomCode) => shared.isDiscreteUom(uomCode) ? Math.round(numberFrom(value)) : Number(numberFrom(value).toFixed(2));
  const availablePcs = (line) => Math.round(line.category === "MATERIAL" ? pcsStock(line, "qtyAvailable") : uomStock(line.stock, "pcs", "qtyAvailable"));
  const plannedAllocatedByUom = (line, uomCode) => numberFrom((line.plannedPurchaseAllocation?.byUom || []).find((row) => String(row.uomCode || "").toLowerCase() === String(uomCode || "").toLowerCase())?.qty);
  const matrixQty = (qty, uomCode, grossWeight = 0) => {
    const uom = String(uomCode || "PCS").toUpperCase();
    const value = numberFrom(qty);
    const primary = shared.isDiscreteUom(uom)
      ? `${Math.round(value).toLocaleString("id-ID")} ${uom}`
      : `${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${uom}`;
    if (uom !== "KG" || numberFrom(grossWeight) <= 0) return primary;
    return `${primary} / ~ ${Math.round(value / numberFrom(grossWeight)).toLocaleString("id-ID")} PCS`;
  };
  const matrixBasePartCode = (partCode) => String(partCode || "").replace(/-\d{3}$/, "-000");
  const matrixPartLabel = (partNumber, _partName, partCode) => String(partNumber || partCode || "-").trim();
  const matrixProcessLabel = (line) => {
    const routes = Array.isArray(line.processes) ? line.processes : [];
    const process = routes[routes.length - 1] || {};
    return String(process.processCode || process.processName || "WIP")
      .toUpperCase().replace(/[^A-Z0-9 /+&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "WIP";
  };
  const matrixProcessPriority = (label) => {
    if (/PRG|PROGRESSIVE|PRESS|FORM|BLANK/.test(label)) return 10;
    if (/^BE$|BENDING/.test(label)) return 15;
    if (/SPOT/.test(label)) return 20;
    if (/WELD/.test(label)) return 30;
    if (/PAINT|COAT|PLAT|VENDOR/.test(label)) return 40;
    if (/INSP|QC|PACK|ASSY|ASSEMB/.test(label)) return 50;
    return 35;
  };
  const matrixRupiah = (value) => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(numberFrom(value));
  const matrixValuationAmount = (quantity, uomCode, valuation, grossWeight = 0) => {
    const qtyValue = numberFrom(quantity);
    if (!qtyValue) return { amount: 0, missing: false };
    if (!valuation?.priced || numberFrom(valuation.unitPriceIdr) <= 0) return { amount: 0, missing: true };
    const qtyUom = String(uomCode || "PCS").toUpperCase();
    const priceUom = String(valuation.uomCode || qtyUom).toUpperCase();
    let pricedQty = qtyValue;
    if (priceUom !== qtyUom) {
      if (shared.isDiscreteUom(priceUom) && shared.isDiscreteUom(qtyUom)) pricedQty = qtyValue;
      else if (priceUom === "PCS" && qtyUom === "KG" && numberFrom(grossWeight) > 0) pricedQty = qtyValue / numberFrom(grossWeight);
      else if (priceUom === "KG" && shared.isDiscreteUom(qtyUom) && numberFrom(grossWeight) > 0) pricedQty = qtyValue * numberFrom(grossWeight);
      else return { amount: 0, missing: true };
    }
    return { amount: pricedQty * numberFrom(valuation.unitPriceIdr), missing: false };
  };
  const matrixValueLabel = (value, missing, hasQuantity = true) => {
    if (!hasQuantity) return "";
    if (missing && numberFrom(value) > 0) return `${matrixRupiah(value)} + harga belum lengkap`;
    if (missing) return "Belum ada harga";
    return matrixRupiah(value);
  };
  function buildInventoryMatrix(fg) {
    const lines = fg?.traceLines || [];
    const partNumberByBaseCode = new Map([[matrixBasePartCode(fg.fgPartCode), fg.fgPartNumber]]);
    for (const line of lines) {
      const baseCode = matrixBasePartCode(line.partCode);
      if (baseCode && line.partNumber && (!partNumberByBaseCode.has(baseCode) || line.category === "COMPONENT_FG")) partNumberByBaseCode.set(baseCode, line.partNumber);
    }
    const identity = (line) => {
      const resolvedPartNumber = line.partNumber || partNumberByBaseCode.get(matrixBasePartCode(line.partCode)) || "";
      return {
        key: resolvedPartNumber || matrixBasePartCode(line.partCode) || `${line.partName || "PART"}:${line.partCode || "-"}`,
        partNumber: resolvedPartNumber,
      };
    };
    const valuationByPartNumber = new Map();
    if (fg.fgPartNumber && fg.fgValuation?.priced) valuationByPartNumber.set(fg.fgPartNumber, fg.fgValuation);
    lines.forEach((line) => {
      const partNumber = line.partNumber || partNumberByBaseCode.get(matrixBasePartCode(line.partCode));
      if (partNumber && line.valuation?.priced && !valuationByPartNumber.has(partNumber)) valuationByPartNumber.set(partNumber, line.valuation);
    });
    const wipByPart = new Map();
    for (const line of lines.filter((row) => row.category === "WIP")) {
      const part = identity(line);
      if (!wipByPart.has(part.key)) wipByPart.set(part.key, []);
      wipByPart.get(part.key).push({ line, baseLabel: matrixProcessLabel(line), level: numberFrom(line.minimumLevel) });
    }
    const stageByLine = new Map();
    const stageDefinitions = new Map();
    for (const [partKey, partStages] of wipByPart.entries()) {
      partStages.sort((left, right) => right.level - left.level || String(right.line.partCode || "").localeCompare(String(left.line.partCode || ""), "id", { numeric: true }));
      const totals = partStages.reduce((map, stage) => map.set(stage.baseLabel, numberFrom(map.get(stage.baseLabel)) + 1), new Map());
      const occurrences = new Map();
      for (const stage of partStages) {
        const occurrence = numberFrom(occurrences.get(stage.baseLabel)) + 1;
        occurrences.set(stage.baseLabel, occurrence);
        const label = numberFrom(totals.get(stage.baseLabel)) > 1 ? `${stage.baseLabel}-${occurrence}` : stage.baseLabel;
        stageByLine.set(`${partKey}|${stage.line.partCode}`, label);
        if (!stageDefinitions.has(label)) stageDefinitions.set(label, { label, baseLabel: stage.baseLabel, occurrence });
      }
    }
    const stages = [...stageDefinitions.values()]
      .sort((left, right) => matrixProcessPriority(left.baseLabel) - matrixProcessPriority(right.baseLabel)
        || left.baseLabel.localeCompare(right.baseLabel, "id", { numeric: true })
        || left.occurrence - right.occurrence)
      .map((stage) => stage.label);
    const grouped = new Map();
    const ensure = ({ partNumber, partName, partCode, rank = 1 }) => {
      const key = partNumber || partNumberByBaseCode.get(matrixBasePartCode(partCode)) || matrixBasePartCode(partCode) || `${partName || ""}:${partCode || "-"}`;
      if (!grouped.has(key)) grouped.set(key, {
        key,
        rank,
        label: matrixPartLabel(partNumber, partName, partCode),
        partCode: matrixBasePartCode(partCode) || "-",
        partName: String(partName || "-").trim(),
        materialOnHand: 0,
        materialReserved: 0,
        materialQC: 0,
        materialAvailable: 0,
        materialPlannedAllocation: 0,
        materialUomCode: "PCS",
        grossWeight: 0,
        fgOnHand: 0,
        fgReserved: 0,
        fgFree: 0,
        stages: Object.fromEntries(stages.map((stage) => [stage, 0])),
        values: {
          material: { onHand: 0, reserved: 0, qc: 0, available: 0, inbound: 0 },
          fg: { onHand: 0, reserved: 0, free: 0 },
          stages: Object.fromEntries(stages.map((stage) => [stage, 0])),
        },
        missingValues: {
          material: { onHand: false, reserved: false, qc: false, available: false, inbound: false },
          fg: { onHand: false, reserved: false, free: false },
          stages: Object.fromEntries(stages.map((stage) => [stage, false])),
        },
        priceSources: new Set(),
      });
      const row = grouped.get(key);
      row.rank = Math.min(row.rank, rank);
      if ((row.label === "-" || !partNumber) && partNumberByBaseCode.get(matrixBasePartCode(partCode))) row.label = partNumberByBaseCode.get(matrixBasePartCode(partCode));
      if ((!row.partName || row.partName === "-") && partName) row.partName = String(partName).trim();
      if ((!row.partCode || row.partCode === "-") && partCode) row.partCode = matrixBasePartCode(partCode);
      return row;
    };
    const addValue = (row, bucket, field, quantity, uomCode, valuation, grossWeight = 0) => {
      const result = matrixValuationAmount(quantity, uomCode, valuation, grossWeight);
      row.values[bucket][field] = numberFrom(row.values[bucket][field]) + result.amount;
      row.missingValues[bucket][field] = Boolean(row.missingValues[bucket][field] || result.missing);
      if (valuation?.priced && valuation.source) row.priceSources.add(valuation.source);
    };
    const root = ensure({ partNumber: fg.fgPartNumber, partName: fg.fgPartName, partCode: fg.fgPartCode, rank: 0 });
    // FG tetap harus terlihat saat seluruh stock sudah reserved. Menggunakan
    // qtyAvailable di sini dahulu membuat FG COMP 20 pcs hilang dari matrix.
    const rootFgOnHand = Math.round(uomStock(fg.fgStock, "pcs", "qtyOnHand"));
    const rootFgReserved = Math.round(uomStock(fg.fgStock, "pcs", "qtyReserved"));
    const rootFgFree = Math.round(uomStock(fg.fgStock, "pcs", "qtyAvailable"));
    root.fgOnHand += rootFgOnHand;
    root.fgReserved += rootFgReserved;
    root.fgFree += rootFgFree;
    addValue(root, "fg", "onHand", rootFgOnHand, "PCS", fg.fgValuation);
    addValue(root, "fg", "reserved", rootFgReserved, "PCS", fg.fgValuation);
    addValue(root, "fg", "free", rootFgFree, "PCS", fg.fgValuation);
    for (const line of lines) {
      const part = identity(line);
      const row = ensure({ partNumber: part.partNumber, partName: line.partName, partCode: line.partCode, rank: line.category === "PURCHASE_PART" ? 2 : 1 });
      if (line.category === "MATERIAL") {
        row.materialUomCode = "KG";
        row.grossWeight = numberFrom(line.grossWeightPerPieceKg);
        const quantities = {
          onHand: uomStock(line.stock, "kg", "qtyOnHand"),
          reserved: uomStock(line.stock, "kg", "qtyReserved"),
          qc: uomStock(line.stock, "kg", "qtyQC"),
          available: uomStock(line.stock, "kg", "qtyAvailable"),
          inbound: plannedAllocatedByUom(line, "kg") || plannedAllocatedByUom(line, "pcs") * row.grossWeight,
        };
        row.materialOnHand += quantities.onHand;
        row.materialReserved += quantities.reserved;
        row.materialQC += quantities.qc;
        row.materialAvailable += quantities.available;
        row.materialPlannedAllocation += quantities.inbound;
        Object.entries(quantities).forEach(([field, value]) => addValue(row, "material", field, value, "KG", line.valuation, row.grossWeight));
      } else if (line.category === "PURCHASE_PART") {
        const uom = String(line.requirementUomCode || "PCS").toUpperCase();
        row.materialUomCode = uom;
        const quantities = {
          onHand: uomStock(line.stock, uom.toLowerCase(), "qtyOnHand"),
          reserved: uomStock(line.stock, uom.toLowerCase(), "qtyReserved"),
          qc: uomStock(line.stock, uom.toLowerCase(), "qtyQC"),
          available: uomStock(line.stock, uom.toLowerCase(), "qtyAvailable"),
          inbound: plannedAllocatedByUom(line, uom),
        };
        row.materialOnHand += quantities.onHand;
        row.materialReserved += quantities.reserved;
        row.materialQC += quantities.qc;
        row.materialAvailable += quantities.available;
        row.materialPlannedAllocation += quantities.inbound;
        Object.entries(quantities).forEach(([field, value]) => addValue(row, "material", field, value, uom, line.valuation));
      }
      else if (line.category === "COMPONENT_FG") {
        const quantities = {
          onHand: Math.round(uomStock(line.stock, "pcs", "qtyOnHand")),
          reserved: Math.round(uomStock(line.stock, "pcs", "qtyReserved")),
          free: Math.round(uomStock(line.stock, "pcs", "qtyAvailable")),
        };
        row.fgOnHand += quantities.onHand;
        row.fgReserved += quantities.reserved;
        row.fgFree += quantities.free;
        Object.entries(quantities).forEach(([field, value]) => addValue(row, "fg", field, value, "PCS", line.valuation));
      }
      else if (line.category === "WIP") {
        const stage = stageByLine.get(`${part.key}|${line.partCode}`) || matrixProcessLabel(line);
        if (!Object.prototype.hasOwnProperty.call(row.stages, stage)) {
          row.stages[stage] = 0;
          row.values.stages[stage] = 0;
          row.missingValues.stages[stage] = false;
        }
        const stageQty = Math.round(uomStock(line.stock, "pcs", "qtyOnHand"));
        row.stages[stage] = numberFrom(row.stages[stage]) + stageQty;
        addValue(row, "stages", stage, stageQty, "PCS", line.valuation?.priced ? line.valuation : valuationByPartNumber.get(part.partNumber));
      }
    }
    const rows = [...grouped.values()].filter((row) => row.label && row.label !== "-")
      .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, "id", { numeric: true }));
    const horizontalPhysical = (row) => {
      const wipPcs = stages.reduce((sum, stage) => sum + numberFrom(row.stages[stage]), 0);
      const fgPcs = numberFrom(row.fgOnHand);
      const materialQty = numberFrom(row.materialOnHand);
      const materialUom = String(row.materialUomCode || "PCS").toUpperCase();
      let materialPcs = 0;
      let unconvertedQty = 0;
      if (shared.isDiscreteUom(materialUom)) materialPcs = materialQty;
      else if (materialUom === "KG" && numberFrom(row.grossWeight) > 0) materialPcs = materialQty / numberFrom(row.grossWeight);
      else unconvertedQty = materialQty;
      return { pcsEquivalent: materialPcs + wipPcs + fgPcs, unconvertedQty, unconvertedUom: materialUom };
    };
    const horizontalPhysicalLabel = (row) => {
      const total = horizontalPhysical(row);
      const labels = [];
      if (total.pcsEquivalent || !total.unconvertedQty) labels.push(`${Math.round(total.pcsEquivalent).toLocaleString("id-ID")} PCS`);
      if (total.unconvertedQty) labels.push(`${matrixQty(total.unconvertedQty, total.unconvertedUom)} (GW kosong)`);
      return labels.join(" + ") || "0 PCS";
    };
    const headers = ["P/N", "Part Code", "Part Name", "Material On Hand", "Reserved / Allocated", "QC Hold", "Material Free", "Inbound Allocation", ...stages, "FG On Hand", "FG Reserved", "FG Free", "Total Physical (PCS)"];
    const valueHeaders = ["P/N", "Part Code", "Part Name", "Material On Hand (Rp)", "Reserved / Allocated (Rp)", "QC Hold (Rp)", "Material Free (Rp)", "Inbound Allocation (Rp)", ...stages.map((stage) => `${stage} (Rp)`), "FG On Hand (Rp)", "FG Reserved (Rp)", "FG Free (Rp)", "Total Nilai Stock (Rp)"];
    const totalsByUom = (field) => {
      const totals = new Map();
      rows.forEach((row) => totals.set(row.materialUomCode, numberFrom(totals.get(row.materialUomCode)) + numberFrom(row[field])));
      return [...totals.entries()].filter(([, value]) => value).map(([uom, value]) => matrixQty(value, uom)).join(" | ") || "0";
    };
    const horizontalGrandTotal = rows.reduce((result, row) => {
      const total = horizontalPhysical(row);
      result.pcsEquivalent += total.pcsEquivalent;
      if (total.unconvertedQty) result.unconverted.set(total.unconvertedUom, numberFrom(result.unconverted.get(total.unconvertedUom)) + total.unconvertedQty);
      return result;
    }, { pcsEquivalent: 0, unconverted: new Map() });
    const horizontalGrandTotalLabel = [
      `${Math.round(horizontalGrandTotal.pcsEquivalent).toLocaleString("id-ID")} PCS`,
      ...[...horizontalGrandTotal.unconverted.entries()].filter(([, value]) => value).map(([uom, value]) => `${matrixQty(value, uom)} (GW kosong)`),
    ].join(" + ");
    const totals = [
      "TOTAL PHYSICAL", "-", "Snapshot stok fisik",
      totalsByUom("materialOnHand"), totalsByUom("materialReserved"), totalsByUom("materialQC"), totalsByUom("materialAvailable"), totalsByUom("materialPlannedAllocation"),
      ...stages.map((stage) => matrixQty(rows.reduce((sum, row) => sum + numberFrom(row.stages[stage]), 0), "PCS")),
      matrixQty(rows.reduce((sum, row) => sum + numberFrom(row.fgOnHand), 0), "PCS"),
      matrixQty(rows.reduce((sum, row) => sum + numberFrom(row.fgReserved), 0), "PCS"),
      matrixQty(rows.reduce((sum, row) => sum + numberFrom(row.fgFree), 0), "PCS"),
      horizontalGrandTotalLabel,
    ];
    const horizontalValue = (row) => {
      const amount = numberFrom(row.values.material.onHand)
        + stages.reduce((sum, stage) => sum + numberFrom(row.values.stages[stage]), 0)
        + numberFrom(row.values.fg.onHand);
      const missing = Boolean(row.missingValues.material.onHand
        || stages.some((stage) => row.missingValues.stages[stage])
        || row.missingValues.fg.onHand);
      return { amount, missing };
    };
    const aggregateValue = (bucket, field, qtyField) => {
      const amount = rows.reduce((sum, row) => sum + numberFrom(row.values[bucket][field]), 0);
      const missing = rows.some((row) => row.missingValues[bucket][field]);
      const hasQuantity = rows.some((row) => numberFrom(row[qtyField]) !== 0);
      return matrixValueLabel(amount, missing, hasQuantity);
    };
    const aggregateStageValue = (stage) => matrixValueLabel(
      rows.reduce((sum, row) => sum + numberFrom(row.values.stages[stage]), 0),
      rows.some((row) => row.missingValues.stages[stage]),
      rows.some((row) => numberFrom(row.stages[stage]) !== 0),
    );
    const valueRows = rows.map((row) => {
      const totalValue = horizontalValue(row);
      return [
        row.label,
        row.partCode,
        row.partName,
        matrixValueLabel(row.values.material.onHand, row.missingValues.material.onHand, row.materialOnHand !== 0),
        matrixValueLabel(row.values.material.reserved, row.missingValues.material.reserved, row.materialReserved !== 0),
        matrixValueLabel(row.values.material.qc, row.missingValues.material.qc, row.materialQC !== 0),
        matrixValueLabel(row.values.material.available, row.missingValues.material.available, row.materialAvailable !== 0),
        matrixValueLabel(row.values.material.inbound, row.missingValues.material.inbound, row.materialPlannedAllocation !== 0),
        ...stages.map((stage) => matrixValueLabel(row.values.stages[stage], row.missingValues.stages[stage], row.stages[stage] !== 0)),
        matrixValueLabel(row.values.fg.onHand, row.missingValues.fg.onHand, row.fgOnHand !== 0),
        matrixValueLabel(row.values.fg.reserved, row.missingValues.fg.reserved, row.fgReserved !== 0),
        matrixValueLabel(row.values.fg.free, row.missingValues.fg.free, row.fgFree !== 0),
        matrixValueLabel(totalValue.amount, totalValue.missing, true),
      ];
    });
    const grandValue = rows.reduce((sum, row) => sum + horizontalValue(row).amount, 0);
    const grandValueMissing = rows.some((row) => horizontalValue(row).missing);
    const valueTotals = [
      "TOTAL NILAI", "-", "Snapshot nilai referensi",
      aggregateValue("material", "onHand", "materialOnHand"),
      aggregateValue("material", "reserved", "materialReserved"),
      aggregateValue("material", "qc", "materialQC"),
      aggregateValue("material", "available", "materialAvailable"),
      aggregateValue("material", "inbound", "materialPlannedAllocation"),
      ...stages.map(aggregateStageValue),
      aggregateValue("fg", "onHand", "fgOnHand"),
      aggregateValue("fg", "reserved", "fgReserved"),
      aggregateValue("fg", "free", "fgFree"),
      matrixValueLabel(grandValue, grandValueMissing, true),
    ];
    return {
      stages,
      headers,
      valueHeaders,
      rows,
      values: [...rows.map((row) => [
          row.label,
          row.partCode,
          row.partName,
          matrixQty(row.materialOnHand, row.materialUomCode, row.grossWeight),
          matrixQty(row.materialReserved, row.materialUomCode, row.grossWeight),
          matrixQty(row.materialQC, row.materialUomCode, row.grossWeight),
          matrixQty(row.materialAvailable, row.materialUomCode, row.grossWeight),
          matrixQty(row.materialPlannedAllocation, row.materialUomCode, row.grossWeight),
          ...stages.map((stage) => row.stages[stage] ? matrixQty(row.stages[stage], "PCS") : ""),
          row.fgOnHand ? matrixQty(row.fgOnHand, "PCS") : "",
          row.fgReserved ? matrixQty(row.fgReserved, "PCS") : "",
          row.fgFree ? matrixQty(row.fgFree, "PCS") : "",
          horizontalPhysicalLabel(row),
        ]), totals],
      valueValues: [...valueRows, valueTotals],
      totals,
      valueTotals,
      valuationMissingRows: rows.filter((row) => horizontalValue(row).missing).length,
    };
  }
  const inventorySubtitle = (fg) => `${fg.fgPartCode} | ${[fg.fgPartNumber, fg.fgPartName].filter(Boolean).join(" - ")} | BOM ${fg.mbomNoReg || "-"} Rev ${fg.mbomRevision ?? "-"} | Snapshot ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format((globalThis.erpBusinessNow?.() || new Date()))}`;
  function inventorySummary(fg) {
    const lines = fg.traceLines || [];
    return [
      { label: "Finished Goods", value: fg.fgPartCode },
      { label: "BOM Aktif", value: `${fg.mbomNoReg || "-"} Rev ${fg.mbomRevision ?? "-"}` },
      { label: "Total Item", value: `${lines.length} item` },
      { label: "Status", value: fg.traceStatus || "-" },
    ];
  }
  function inventoryDetailData(fg) {
    const headers = ["Stock Type", "Part Code", "Part Number", "Part Name", "Process", "Material / Spec", "Level", "Req / FG", "GW KG/PCS", "On Hand KG", "On Hand PCS", "Reserved PCS", "Available KG", "Available PCS", "Status"];
    const rows = (fg.traceLines || []).map((line) => {
      const requirementUom = String(line.requirementUomCode || "unit").toUpperCase();
      const materialSpec = [line.materialType, line.materialCode, line.materialSpec].filter(Boolean).join(" - ");
      return [traceCategory(line.category), line.partCode || "-", line.partNumber || "-", line.partName || "-", processLabel(line), materialSpec || "-", numberFrom(line.minimumLevel), `${exportQuantity(line.requiredPerFg, requirementUom)} ${requirementUom}`, line.category === "MATERIAL" ? exportQuantity(line.grossWeightPerPieceKg, "KG") : "", exportQuantity(uomStock(line.stock, "kg", "qtyOnHand"), "KG"), exportQuantity(pcsStock(line, "qtyOnHand"), "PCS"), exportQuantity(pcsStock(line, "qtyReserved"), "PCS"), exportQuantity(uomStock(line.stock, "kg", "qtyAvailable"), "KG"), exportQuantity(pcsStock(line, "qtyAvailable"), "PCS"), stockStatus(line)];
    });
    return { headers, rows };
  }
  function inventoryDetailPayload(fg) {
    const detail = inventoryDetailData(fg); const matrix = buildInventoryMatrix(fg);
    return {
      title: `Inventory Detail - ${fg.fgPartCode}`,
      subtitle: inventorySubtitle(fg),
      fileName: `inventory-detail-${fg.fgPartCode}-${(globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10)}`,
      headers: detail.headers,
      rows: detail.rows,
      summary: inventorySummary(fg),
      pageSize: "A3",
      keepColumnsTogether: true,
      columnWidths: [0.9, 1.15, 1.05, 1.15, 1.2, 1.8, 0.4, 0.72, 0.7, 0.7, 0.72, 0.72, 0.7, 0.72, 0.9],
      alignments: ["left", "left", "left", "left", "left", "left", "center", "right", "right", "right", "right", "right", "right", "right", "center"],
      sheets: [
        { name: "Detail Inventory", title: `Detail ${fg.fgPartCode}`, subtitle: inventorySubtitle(fg), headers: detail.headers, rows: detail.rows },
        { name: "Stock Matrix", title: `Stock Matrix ${fg.fgPartCode}`, subtitle: "Total horizontal = Material On Hand dalam PCS + WIP On Hand + FG On Hand; status Reserved/QC/Free tidak dijumlah ulang", headers: matrix.headers, rows: matrix.values, groupHeaders: [{ label: "WIP On Hand", start: 8, span: matrix.stages.length }, { label: "Finished Goods", start: 8 + matrix.stages.length, span: 3 }, { label: "Horizontal Total", start: 11 + matrix.stages.length, span: 1 }].filter((group) => group.span > 0) },
      ],
    };
  }
  function inventoryMatrixPayload(fg) {
    const matrix = buildInventoryMatrix(fg);
    const groupHeaders = [{ label: "WIP On Hand", start: 8, span: matrix.stages.length }, { label: "Finished Goods", start: 8 + matrix.stages.length, span: 3 }, { label: "Horizontal Total", start: 11 + matrix.stages.length, span: 1 }].filter((group) => group.span > 0);
    const columnWidths = matrix.headers.map((_header, index) => index === 0 ? 1.4 : index === 1 ? 1.35 : index === 2 ? 1.25 : index >= 3 && index <= 7 ? 1.35 : 1);
    const alignments = matrix.headers.map((_header, index) => index < 3 ? "left" : "center");
    const valueSubtitle = `Nilai referensi per ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format((globalThis.erpBusinessNow?.() || new Date()))}: qty x harga aktif dalam IDR; part in-house fallback Live MBOM Costing${matrix.valuationMissingRows ? `; ${matrix.valuationMissingRows} baris belum lengkap harganya` : ""}.`;
    return {
      title: `Inventory Stock Matrix - ${fg.fgPartCode}`,
      subtitle: `${inventorySubtitle(fg)} | Tampilan Qty PCS`,
      fileName: `inventory-matrix-${fg.fgPartCode}-${(globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10)}`,
      headers: matrix.headers,
      rows: matrix.values,
      summary: inventorySummary(fg),
      pageSize: matrix.headers.length > 8 ? "A3" : "A4",
      keepColumnsTogether: true,
      columnWidths,
      alignments,
      groupHeaders,
      sheets: [
        { name: "Qty PCS", title: `Stock Matrix Qty - ${fg.fgPartCode}`, subtitle: inventorySubtitle(fg), headers: matrix.headers, rows: matrix.values, groupHeaders },
        { name: "Nilai Rupiah", title: `Stock Matrix Rupiah - ${fg.fgPartCode}`, subtitle: valueSubtitle, headers: matrix.valueHeaders, rows: matrix.valueValues, groupHeaders },
      ],
      sections: [{
        title: `Inventory Stock Matrix Rupiah - ${fg.fgPartCode}`,
        subtitle: valueSubtitle,
        headers: matrix.valueHeaders,
        rows: matrix.valueValues,
        keepColumnsTogether: true,
        columnWidths,
        alignments,
        groupHeaders,
      }],
    };
  }
  function syncInventoryExportButtons() {
    const enabled = Boolean(selectedFg());
    ["inventory-detail-xlsx", "inventory-detail-pdf", "inventory-matrix-open"].forEach((id) => { const button = document.getElementById(id); if (button) button.disabled = !enabled; });
  }
  function renderInventoryMatrixDialog() {
    const fg = selectedFg(); if (!fg) return;
    const matrix = buildInventoryMatrix(fg);
    const valueMode = state.inventoryMatrixMode === "value";
    const headers = valueMode ? matrix.valueHeaders : matrix.headers;
    const values = valueMode ? matrix.valueValues : matrix.values;
    document.getElementById("inventory-matrix-title").textContent = `Stock Matrix - ${fg.fgPartCode}`;
    document.getElementById("inventory-matrix-subtitle").textContent = `${inventorySubtitle(fg)} | ${valueMode ? "Nilai Rupiah" : "Qty PCS"}`;
    const mode = document.getElementById("inventory-matrix-mode");
    if (mode) mode.textContent = valueMode ? "NILAI RUPIAH" : "QTY PCS";
    const change = document.getElementById("inventory-matrix-change");
    if (change) {
      change.textContent = valueMode ? "Change ke Qty" : "Change ke Rupiah";
      change.setAttribute("aria-pressed", valueMode ? "true" : "false");
    }
    const groupHeader = `<tr><th colspan="8"></th>${matrix.stages.length ? `<th colspan="${matrix.stages.length}">WIP On Hand</th>` : ""}<th colspan="3">Finished Goods</th><th colspan="1">Horizontal Total</th></tr>`;
    document.getElementById("inventory-matrix-head").innerHTML = `${groupHeader}<tr>${headers.map((header) => `<th>${shared.escapeHtml(header)}</th>`).join("")}</tr>`;
    document.getElementById("inventory-matrix-body").innerHTML = values.map((row) => `<tr>${row.map((cell) => `<td class="${String(cell).includes("Belum ada harga") || String(cell).includes("harga belum lengkap") ? "is-unpriced" : ""}">${shared.escapeHtml(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}">Belum ada saldo untuk ditampilkan.</td></tr>`;
    const note = document.getElementById("inventory-matrix-note");
    if (note) note.textContent = valueMode
      ? `Nilai = qty × harga referensi aktif dalam IDR. Part in-house memakai fallback Live MBOM Costing. ${matrix.valuationMissingRows ? `${matrix.valuationMissingRows} baris mempunyai harga yang belum lengkap dan ditandai pada tabel.` : "Seluruh baris stock fisik mempunyai referensi harga."}`
      : "Free = On Hand - Reserved - QC. Total horizontal = Material On Hand dalam PCS + seluruh WIP On Hand + FG On Hand. Reserved/Allocated, QC, dan Free tidak dijumlah ulang. Inbound belum menjadi stock.";
  }
  const groupValue = (line, grouping) => grouping === "process" ? processLabel(line) : grouping === "level" ? `Level ${numberFrom(line.minimumLevel)}` : traceCategory(line.category);
  function renderInventoryOptions() {
    const select = document.getElementById("inventory-fg-select");
    if (!select) return;
    const rows = state.report?.traceability?.items || [];
    const previous = state.selectedFgPartId || select.value;
    select.innerHTML = `<option value="">Pilih FG...</option>${rows.map((row) => `<option value="${shared.escapeHtml(row.fgPartId)}">${shared.escapeHtml(row.fgPartCode)} — ${shared.escapeHtml([row.fgPartNumber, row.fgPartName].filter(Boolean).join(" · "))}</option>`).join("")}`;
    state.selectedFgPartId = rows.some((row) => row.fgPartId === previous) ? previous : "";
    select.value = state.selectedFgPartId;
  }
  function renderInventoryDetail() {
    const body = document.getElementById("report-rows");
    const count = document.getElementById("report-count");
    const resume = document.getElementById("inventory-fg-resume");
    if (!body || !count || !resume) return;
    const fg = selectedFg();
    if (!fg) {
      count.innerHTML = "<i></i> Pilih FG";
      resume.classList.add("d-none");
      body.innerHTML = '<tr><td colspan="15" class="inventory-detail-empty"><strong>Pilih Finished Goods terlebih dahulu</strong><span>Detail BOM dan stok tanpa pemisahan lot akan ditampilkan di sini.</span></td></tr>';
      syncInventoryExportButtons();
      return;
    }
    const query = String(document.getElementById("inventory-detail-search")?.value || "").trim().toLowerCase();
    const grouping = document.getElementById("inventory-detail-group")?.value || "stockType";
    const lines = (fg.traceLines || []).filter((line) => !query || [line.partCode, line.partNumber, line.partName, line.materialCode, line.materialName, line.materialType, line.materialSpec, processLabel(line), traceCategory(line.category)].some((value) => String(value || "").toLowerCase().includes(query)));
    if (grouping !== "none") lines.sort((left, right) => groupValue(left, grouping).localeCompare(groupValue(right, grouping)) || numberFrom(left.minimumLevel) - numberFrom(right.minimumLevel) || String(left.partCode || "").localeCompare(String(right.partCode || "")));
    const wipCount = lines.filter((line) => line.category === "WIP").length;
    const materialCount = lines.filter((line) => line.category === "MATERIAL").length;
    const purchaseCount = lines.filter((line) => line.category === "PURCHASE_PART").length;
    resume.classList.remove("d-none");
    resume.innerHTML = `<article><small>FG Dipilih</small><strong>${shared.escapeHtml(fg.fgPartCode)}</strong><span>${shared.escapeHtml([fg.fgPartNumber, fg.fgPartName].filter(Boolean).join(" · "))}</span></article><article><small>BOM Aktif</small><strong>${shared.escapeHtml(fg.mbomNoReg || "Belum tersedia")}</strong><span>Revision ${shared.escapeHtml(fg.mbomRevision ?? "—")}</span></article><article><small>Komposisi</small><strong>${new Intl.NumberFormat("id-ID").format(lines.length)} item</strong><span>${wipCount} WIP · ${materialCount} material · ${purchaseCount} purchase part</span></article><article><small>Status FG</small><strong>${shared.escapeHtml(fg.traceStatus || "—")}</strong><span>Saldo digabung tanpa lot</span></article>`;
    count.innerHTML = `<i></i> ${new Intl.NumberFormat("id-ID").format(lines.length)} detail`;
    const groupCounts = lines.reduce((result, line) => { const key = groupValue(line, grouping); result[key] = (result[key] || 0) + 1; return result; }, {});
    const html = [];
    let lastGroup = null;
    for (const line of lines) {
      const group = groupValue(line, grouping);
      if (grouping !== "none" && group !== lastGroup) {
        html.push(`<tr class="inventory-detail-group"><td colspan="15"><span>${shared.escapeHtml(group)}</span><small>${new Intl.NumberFormat("id-ID").format(groupCounts[group])} item</small></td></tr>`);
        lastGroup = group;
      }
      const materialSpec = [line.materialType, line.materialSpec].filter(Boolean).join(" · ") || "—";
      const status = stockStatus(line);
      const requirementUom = String(line.requirementUomCode || "unit").toUpperCase();
      const grossWeight = line.category === "MATERIAL" && numberFrom(line.grossWeightPerPieceKg) > 0 ? `${displayQuantity(line.grossWeightPerPieceKg, "KG")} kg` : "—";
      html.push(`<tr><td><span class="inventory-stock-type inventory-stock-type--${shared.escapeHtml(String(line.category || "other").toLowerCase().replace(/[^a-z]+/g, "-"))}">${shared.escapeHtml(traceCategory(line.category))}</span></td><td class="inventory-process-cell">${shared.escapeHtml(processLabel(line))}</td><td><a class="inventory-part-link" href="/master-data/parts/${encodeURIComponent(line.partCode || "")}">${shared.escapeHtml(line.partCode || "—")}</a><small>${shared.escapeHtml((line.sourceBoms || []).join(", "))}</small></td><td><strong>${shared.escapeHtml(line.partNumber || "—")}</strong><small>${shared.escapeHtml(line.partName || "")}</small></td><td class="inventory-material-cell">${shared.escapeHtml(materialSpec)}</td><td>${shared.escapeHtml(numberFrom(line.minimumLevel))}</td><td><strong>${shared.escapeHtml(displayQuantity(line.requiredPerFg, requirementUom))}</strong> ${shared.escapeHtml(requirementUom)}</td><td title="PCS material = KG ÷ GW per PCS">${shared.escapeHtml(grossWeight)}</td><td>${shared.escapeHtml(displayQuantity(uomStock(line.stock, "kg", "qtyOnHand"), "KG"))}</td><td title="${shared.escapeHtml(stockAttributionTitle(line, "On Hand"))}">${shared.escapeHtml(displayQuantity(pcsStock(line, "qtyOnHand"), "PCS"))}</td><td>${shared.escapeHtml(displayQuantity(uomStock(line.stock, "kg", "qtyReserved"), "KG"))}</td><td title="${shared.escapeHtml(stockAttributionTitle(line, "Reserved"))}">${shared.escapeHtml(displayQuantity(pcsStock(line, "qtyReserved"), "PCS"))}</td><td>${shared.escapeHtml(displayQuantity(uomStock(line.stock, "kg", "qtyAvailable"), "KG"))}</td><td title="${shared.escapeHtml(stockAttributionTitle(line, "Available"))}">${shared.escapeHtml(displayQuantity(pcsStock(line, "qtyAvailable"), "PCS"))}</td><td><span class="inventory-trace-status inventory-trace-status--${shared.escapeHtml(status.toLowerCase().replace(/[^a-z]+/g, "-"))}">${shared.escapeHtml(status)}</span></td></tr>`);
    }
    body.innerHTML = html.join("") || '<tr><td colspan="15" class="inventory-detail-empty"><strong>Detail tidak ditemukan</strong><span>Ubah kata pencarian atau pilih FG lain.</span></td></tr>';
    syncInventoryExportButtons();
  }

  function renderFilterOptions() {
    const machine = document.getElementById("report-machine");
    if (!machine) return;
    const selected = machine.value;
    const machines = Array.isArray(state.report?.filterOptions?.machines) ? state.report.filterOptions.machines : [];
    const knownMachines = [...new Set([...machine.options].map((option) => option.value).filter(Boolean).concat(machines))].sort();
    machine.innerHTML = `<option value="">Semua mesin</option>${knownMachines.map((code) => `<option value="${shared.escapeHtml(code)}">${shared.escapeHtml(code)}</option>`).join("")}`;
    machine.value = knownMachines.includes(selected) ? selected : "";
  }
  function renderChart() {
    state.chart?.destroy();
    const chart = state.report?.chart || {};
    const rawSeries = Array.isArray(chart.series) ? chart.series : [];
    const chartRoot = document.querySelector("#report-chart");
    if (!Array.isArray(chart.labels) || !chart.labels.length) {
      chartRoot.innerHTML = '<div class="report-chart-empty"><strong>Belum ada hasil QC final</strong><span>Grafik muncul setelah ada judgment rework atau scrap pada bulan terpilih.</span></div>';
      state.chart = null;
      return;
    }
    chartRoot.innerHTML = "";
    const multiSeries = rawSeries.some((item) => typeof item === "object");
    const options = multiSeries ? {
      chart: { type: "line", height: 290, toolbar: { show: false } }, series: rawSeries,
      xaxis: { categories: chart.labels || [] }, stroke: { width: 3, curve: "smooth" },
      colors: ["#4f46e5", "#10b981", "#f59e0b", "#ef4444"], dataLabels: { enabled: false }, legend: { position: "bottom" },
    } : {
      chart: { type: "bar", height: 290, toolbar: { show: false } }, series: [{ name: "Value", data: rawSeries }],
      xaxis: { categories: chart.labels || [] }, plotOptions: { bar: { borderRadius: 6, distributed: true } },
      colors: ["#4f46e5", "#10b981", "#f59e0b", "#ef4444"], dataLabels: { enabled: false }, legend: { show: false },
    };
    state.chart = new ApexCharts(chartRoot, options);
    state.chart.render();
  }
  async function load() {
    if (!config.apiReady) return;
    setAlert("");
    const query = new URLSearchParams({ start: "0", length: "500", q: inventoryMode ? "" : document.getElementById("report-search").value });
    const month = document.getElementById("report-month")?.value;
    if (month) {
      const [year, monthNumber] = month.split("-").map(Number);
      const endDate = new Date(year, monthNumber, 0);
      query.set("startDate", `${month}-01`);
      query.set("endDate", `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`);
    }
    const machineCode = document.getElementById("report-machine")?.value;
    if (machineCode) query.set("machineCode", machineCode);
    const response = await fetch(`/modules/api/${config.module}/${config.slug}?${query}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAlert(payload.message || "Laporan gagal dimuat.");
      state.rows = [];
      state.report = { total: 0, summary: {}, chart: { labels: [], series: [] } };
    } else {
      state.rows = Array.isArray(payload.data) ? payload.data : [];
      state.report = payload.report || { total: payload.recordsTotal || state.rows.length, summary: {}, chart: { labels: [], series: [] } };
    }
    renderFilterOptions();
    renderInventoryOptions();
    renderSummary();
    renderRows();
    renderChart();
  }

  document.getElementById("report-search").addEventListener("input", () => {
    if (inventoryMode) {
      const search = document.getElementById("report-search").value.trim().toLowerCase();
      if (!search) return;
      const items = state.report?.traceability?.items || [];
      const directMatch = items.find((row) => [row.fgPartCode, row.fgPartNumber, row.fgPartName].some((value) => String(value || "").toLowerCase().includes(search)));
      const match = directMatch || items.find((row) => (row.traceLines || []).some((line) => [line.partCode, line.partNumber, line.partName, line.materialCode, line.materialName, line.materialType, line.materialSpec, processLabel(line)].some((value) => String(value || "").toLowerCase().includes(search))));
      if (match) {
        state.selectedFgPartId = match.fgPartId;
        document.getElementById("inventory-fg-select").value = match.fgPartId;
        document.getElementById("inventory-detail-search").value = directMatch ? "" : search;
        renderInventoryDetail();
      }
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(load, 300);
  });
  document.getElementById("report-refresh").addEventListener("click", load);
  document.getElementById("report-month")?.addEventListener("change", load);
  document.getElementById("report-machine")?.addEventListener("change", load);
  document.getElementById("inventory-fg-select")?.addEventListener("change", (event) => { state.selectedFgPartId = event.target.value; renderInventoryDetail(); });
  document.getElementById("inventory-detail-search")?.addEventListener("input", renderInventoryDetail);
  document.getElementById("inventory-detail-group")?.addEventListener("change", renderInventoryDetail);
  document.getElementById("report-export").addEventListener("click", () => shared.downloadCsv(
    `${config.module}-${config.slug}-${(globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10)}.csv`, columns.map((column) => column.label),
    state.rows.map((row) => columns.map((column) => shared.get(row, column.data) ?? "")),
  ));
  document.getElementById("inventory-detail-xlsx")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryDetailPayload(fg), "xlsx", this); });
  document.getElementById("inventory-detail-pdf")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryDetailPayload(fg), "pdf", this); });
  document.getElementById("inventory-matrix-open")?.addEventListener("click", () => { const dialog = document.getElementById("inventory-matrix-dialog"); state.inventoryMatrixMode = "qty"; renderInventoryMatrixDialog(); if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute("open", ""); });
  document.getElementById("inventory-matrix-change")?.addEventListener("click", () => { state.inventoryMatrixMode = state.inventoryMatrixMode === "qty" ? "value" : "qty"; renderInventoryMatrixDialog(); });
  document.getElementById("inventory-matrix-close")?.addEventListener("click", () => document.getElementById("inventory-matrix-dialog")?.close());
  document.getElementById("inventory-matrix-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.getElementById("inventory-matrix-xlsx")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryMatrixPayload(fg), "xlsx", this); });
  document.getElementById("inventory-matrix-pdf")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryMatrixPayload(fg), "pdf", this); });
  load().catch((error) => setAlert(error.message));
})();
