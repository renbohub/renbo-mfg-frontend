(function () {
  const config = JSON.parse(document.getElementById("module-page-config").textContent);
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const columns = Array.isArray(config.reportColumns) ? config.reportColumns : [];
  const inventoryMode = config.reportMode === "inventory-traceability";
  const state = { rows: [], report: null, chart: null, selectedFgPartId: "" };
  let timer = null;
  const gallery = window.ListGallery?.init({
    root: "#report-list-root",
    storageKey: `report-view:${config.module}:${config.slug}`,
    title: (row) => shared.get(row, columns[0]?.data) || config.label,
    subtitle: (row) => shared.get(row, columns[1]?.data) || config.description,
    status: (row) => row.status || row.readinessStatus || row.costingStatus || row.agingStatus || "Report",
  });

  const label = (key) => String(key || "").replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
  const numberFrom = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const isCurrencyKey = (key) => /cost|amount|revenue|margin|cogs|spend|price/i.test(key);
  const isPercentKey = (key) => /percent|coverage|rate|efficiency/i.test(key);
  const displayValue = (key, value) => {
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
    entries.slice(0, 4).forEach(([key, value], index) => {
      document.getElementById(`report-label-${index}`).textContent = label(key);
      document.getElementById(`report-value-${index}`).textContent = displayValue(key, value);
      document.getElementById(`report-note-${index}`).textContent = "Sesuai filter laporan";
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
    return `${primary} / ≈ ${Math.round(value / numberFrom(grossWeight)).toLocaleString("id-ID")} PCS`;
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
      });
      const row = grouped.get(key);
      row.rank = Math.min(row.rank, rank);
      if ((row.label === "-" || !partNumber) && partNumberByBaseCode.get(matrixBasePartCode(partCode))) row.label = partNumberByBaseCode.get(matrixBasePartCode(partCode));
      if ((!row.partName || row.partName === "-") && partName) row.partName = String(partName).trim();
      if ((!row.partCode || row.partCode === "-") && partCode) row.partCode = matrixBasePartCode(partCode);
      return row;
    };
    const root = ensure({ partNumber: fg.fgPartNumber, partName: fg.fgPartName, partCode: fg.fgPartCode, rank: 0 });
    // FG tetap harus terlihat saat seluruh stock sudah reserved. Menggunakan
    // qtyAvailable di sini dahulu membuat FG COMP 20 pcs hilang dari matrix.
    root.fgOnHand += Math.round(uomStock(fg.fgStock, "pcs", "qtyOnHand"));
    root.fgReserved += Math.round(uomStock(fg.fgStock, "pcs", "qtyReserved"));
    root.fgFree += Math.round(uomStock(fg.fgStock, "pcs", "qtyAvailable"));
    for (const line of lines) {
      const part = identity(line);
      const row = ensure({ partNumber: part.partNumber, partName: line.partName, partCode: line.partCode, rank: line.category === "PURCHASE_PART" ? 2 : 1 });
      if (line.category === "MATERIAL") {
        row.materialUomCode = "KG";
        row.grossWeight = numberFrom(line.grossWeightPerPieceKg);
        row.materialOnHand += uomStock(line.stock, "kg", "qtyOnHand");
        row.materialReserved += uomStock(line.stock, "kg", "qtyReserved");
        row.materialQC += uomStock(line.stock, "kg", "qtyQC");
        row.materialAvailable += uomStock(line.stock, "kg", "qtyAvailable");
        row.materialPlannedAllocation += plannedAllocatedByUom(line, "kg") || plannedAllocatedByUom(line, "pcs") * row.grossWeight;
      } else if (line.category === "PURCHASE_PART") {
        const uom = String(line.requirementUomCode || "PCS").toUpperCase();
        row.materialUomCode = uom;
        row.materialOnHand += uomStock(line.stock, uom.toLowerCase(), "qtyOnHand");
        row.materialReserved += uomStock(line.stock, uom.toLowerCase(), "qtyReserved");
        row.materialQC += uomStock(line.stock, uom.toLowerCase(), "qtyQC");
        row.materialAvailable += uomStock(line.stock, uom.toLowerCase(), "qtyAvailable");
        row.materialPlannedAllocation += plannedAllocatedByUom(line, uom);
      }
      else if (line.category === "COMPONENT_FG") {
        row.fgOnHand += Math.round(uomStock(line.stock, "pcs", "qtyOnHand"));
        row.fgReserved += Math.round(uomStock(line.stock, "pcs", "qtyReserved"));
        row.fgFree += Math.round(uomStock(line.stock, "pcs", "qtyAvailable"));
      }
      else if (line.category === "WIP") {
        const stage = stageByLine.get(`${part.key}|${line.partCode}`) || matrixProcessLabel(line);
        if (!Object.prototype.hasOwnProperty.call(row.stages, stage)) row.stages[stage] = 0;
        row.stages[stage] = numberFrom(row.stages[stage]) + Math.round(uomStock(line.stock, "pcs", "qtyOnHand"));
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
    return {
      stages,
      headers,
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
      totals,
    };
  }
  const inventorySubtitle = (fg) => `${fg.fgPartCode} | ${[fg.fgPartNumber, fg.fgPartName].filter(Boolean).join(" - ")} | BOM ${fg.mbomNoReg || "-"} Rev ${fg.mbomRevision ?? "-"} | Snapshot ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`;
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
      fileName: `inventory-detail-${fg.fgPartCode}-${new Date().toISOString().slice(0, 10)}`,
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
    return {
      title: `Inventory Stock Matrix - ${fg.fgPartCode}`,
      subtitle: inventorySubtitle(fg),
      fileName: `inventory-matrix-${fg.fgPartCode}-${new Date().toISOString().slice(0, 10)}`,
      headers: matrix.headers,
      rows: matrix.values,
      summary: inventorySummary(fg),
      pageSize: matrix.headers.length > 8 ? "A3" : "A4",
      keepColumnsTogether: true,
      columnWidths: matrix.headers.map((_header, index) => index === 0 ? 1.4 : index === 1 ? 1.35 : index === 2 ? 1.25 : index >= 3 && index <= 7 ? 1.35 : 1),
      alignments: matrix.headers.map((_header, index) => index < 3 ? "left" : "center"),
      groupHeaders: [{ label: "WIP On Hand", start: 8, span: matrix.stages.length }, { label: "Finished Goods", start: 8 + matrix.stages.length, span: 3 }, { label: "Horizontal Total", start: 11 + matrix.stages.length, span: 1 }].filter((group) => group.span > 0),
    };
  }
  function syncInventoryExportButtons() {
    const enabled = Boolean(selectedFg());
    ["inventory-detail-xlsx", "inventory-detail-pdf", "inventory-matrix-open"].forEach((id) => { const button = document.getElementById(id); if (button) button.disabled = !enabled; });
  }
  function renderInventoryMatrixDialog() {
    const fg = selectedFg(); if (!fg) return;
    const matrix = buildInventoryMatrix(fg);
    document.getElementById("inventory-matrix-title").textContent = `Stock Matrix - ${fg.fgPartCode}`;
    document.getElementById("inventory-matrix-subtitle").textContent = inventorySubtitle(fg);
    const groupHeader = `<tr><th colspan="8"></th>${matrix.stages.length ? `<th colspan="${matrix.stages.length}">WIP On Hand</th>` : ""}<th colspan="3">Finished Goods</th><th colspan="1">Horizontal Total</th></tr>`;
    document.getElementById("inventory-matrix-head").innerHTML = `${groupHeader}<tr>${matrix.headers.map((header) => `<th>${shared.escapeHtml(header)}</th>`).join("")}</tr>`;
    document.getElementById("inventory-matrix-body").innerHTML = matrix.values.map((row) => `<tr>${row.map((cell) => `<td>${shared.escapeHtml(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${matrix.headers.length}">Belum ada saldo untuk ditampilkan.</td></tr>`;
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
    state.chart = new ApexCharts(document.querySelector("#report-chart"), options);
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
    `${config.module}-${config.slug}-${new Date().toISOString().slice(0, 10)}.csv`, columns.map((column) => column.label),
    state.rows.map((row) => columns.map((column) => shared.get(row, column.data) ?? "")),
  ));
  document.getElementById("inventory-detail-xlsx")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryDetailPayload(fg), "xlsx", this); });
  document.getElementById("inventory-detail-pdf")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryDetailPayload(fg), "pdf", this); });
  document.getElementById("inventory-matrix-open")?.addEventListener("click", () => { const dialog = document.getElementById("inventory-matrix-dialog"); renderInventoryMatrixDialog(); if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute("open", ""); });
  document.getElementById("inventory-matrix-close")?.addEventListener("click", () => document.getElementById("inventory-matrix-dialog")?.close());
  document.getElementById("inventory-matrix-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.getElementById("inventory-matrix-xlsx")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryMatrixPayload(fg), "xlsx", this); });
  document.getElementById("inventory-matrix-pdf")?.addEventListener("click", function () { const fg = selectedFg(); if (fg) shared.exportTablePayload(inventoryMatrixPayload(fg), "pdf", this); });
  load().catch((error) => setAlert(error.message));
})();
