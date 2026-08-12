(function () {
  const modalNode = document.getElementById("bom-report-modal");
  if (!modalNode) return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalNode);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const qty = (value, uomCode = "") => window.SharedDataTable?.formatQuantity
    ? window.SharedDataTable.formatQuantity(value, uomCode, { maximumFractionDigits: 2 })
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(number(value));
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number(value));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "-";
  let bomOptions = [];
  let activeReport = null;

  async function getJson(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Report BOM gagal dimuat.");
    return payload;
  }

  async function loadOptions() {
    if (bomOptions.length) return bomOptions;
    const payload = await getJson("/modules/api/manufacturing-bom/bill-of-materials?start=0&length=500&includeDetails=false");
    bomOptions = payload.data || [];
    const select = document.getElementById("bom-report-select");
    select.innerHTML = '<option value="">Pilih BOM...</option>' + bomOptions.map((row) =>
      `<option value="${esc(row.noReg)}">${esc(row.noReg)} · ${esc(row.part?.partCode || "-")} · Part No. ${esc(row.part?.partNumber || "-")} · ${esc(row.part?.partName || "-")}</option>`
    ).join("");
    return bomOptions;
  }

  function managementPayload(report) {
    const h = report.header; const s = report.summary;
    const summaryRows = [
      ["BOM Number", h.noReg], ["Parent Part Code", h.partCode], ["Parent Part Number", h.partNumber], ["Parent Part Name", h.partName],
      ["Revision", h.revision], ["Effective Date", h.effectiveDate], ["Costing Date", report.costingDate], ["Costing Status", s.costingStatus],
      ["Direct Component Lines", s.directComponentCount], ["Exploded Child Lines", s.explodedComponentCount], ["Total Exploded Lines", s.componentCount], ["BOM Sources", s.sourceBomCount],
      ["Maximum Level", s.maxLevel], ["Process Lines", s.processCount], ["Material Cost", s.materialCost], ["Process Cost", s.processCost],
      ["Overhead Cost", s.overheadCost], ["Estimated Cost / Unit", s.costPerUnit], ["Price Coverage", `${s.pricedLines}/${s.priceApplicableLines}`], ["Unpriced Lines", s.unpricedLines],
    ];
    const detailHeaders = ["Line", "Level", "Source BOM", "Source Revision", "Linked Child BOM", "Child BOM Revision", "Parent Part Code", "Parent Part Number", "Part Code", "Part Number", "Part Name", "Item Type", "Category", "Qty per Parent", "Cumulative Qty / Root", "UOM", "Material Code", "Material Type", "Material Spec", "Material Form", "Thickness", "Width", "Gross Weight KG", "Scrap %", "Lead Time", "LT Unit", "Supplier / Vendor", "Price Source", "Original Currency", "Original Unit Price", "Exchange Rate", "Unit Price IDR", "Price UOM", "Price Effective From", "Price Effective Until", "Purchase Amount IDR", "Process Cost / Unit IDR", "Estimated Line Cost IDR", "Estimated Extended Cost IDR"];
    const detailRows = report.rows.map((row) => [row.line, row.level, row.sourceBomNoReg, row.sourceBomRevision, row.linkedBomNoReg, row.linkedBomRevision, row.parentPartCode, row.parentPartNumber, row.partCode, row.partNumber, row.partName, row.itemType, row.category, row.qty, row.cumulativeQty, row.uomCode, row.materialCode, row.materialType, row.materialSpec, row.materialForm, row.thickness, row.width, row.grossWeightKg, row.scrapPercent, row.leadTime, row.leadTimeUnit, row.supplierName || row.supplierCode, row.priceSource, row.priceCurrency, row.unitPriceOriginal, row.priceExchangeRate, row.unitPrice, row.priceUom, row.priceEffectiveFrom, row.priceEffectiveUntil, row.purchaseAmount, row.processCostPerUnit, row.estimatedLineCost, row.estimatedExtendedCost]);
    const routingHeaders = ["Source BOM", "Source Revision", "Level", "Part Code", "Part Number", "Routing", "Sequence", "Process Code", "Process Name", "Mode", "Machine Code", "Machine Name", "Machine Spec", "Dies", "Vendor", "Cycle Time (sec)", "Original Currency", "Original Rate", "Exchange Rate", "Rate IDR", "Rate Type", "Process Cost / Unit IDR", "Rate Source", "Effective From"];
    const routingRows = report.rows.flatMap((row) => row.processes.map((process) => [row.sourceBomNoReg, row.sourceBomRevision, row.level, row.partCode, row.partNumber, process.routingNumber, process.sequence, process.processCode, process.processName, process.routingMode, process.machineCode, process.machineName, process.machineSpecificationCode, process.diesCode, process.vendorName || process.vendorCode, process.cycleTimeSeconds, process.rateCurrency, process.originalRate, process.exchangeRate, process.rate, process.rateType, process.processCostPerUnit, process.priceSource, process.effectiveFrom]));
    return {
      title: `BOM Report ${h.noReg}`,
      subtitle: `${h.partCode || "-"} · Part No. ${h.partNumber || "-"} · ${h.partName || "-"} · Rev ${h.revision}`,
      fileName: `bom-report-${h.noReg}-rev-${h.revision}`,
      headers: ["Level", "Source BOM", "Parent Part", "Part Code", "Part Number", "Part Name", "Cumulative Qty", "Material / Spec", "Unit Price", "Process / Cycle Time", "Extended Cost"],
      rows: report.rows.map((row) => [row.level, `${row.sourceBomNoReg} Rev ${row.sourceBomRevision}`, [row.parentPartCode, row.parentPartNumber].filter(Boolean).join(" / "), row.partCode, row.partNumber, row.partName, `${qty(row.cumulativeQty, row.uomCode)} ${row.uomCode || ""}`, [row.materialCode, row.materialType, row.materialSpec].filter(Boolean).join(" · "), row.unitPrice, row.processes.map((process) => `${process.processCode || process.processName || "-"} (${qty(process.cycleTimeSeconds)} sec)`).join("; "), row.estimatedExtendedCost]),
      summary: [
        { label: "Parent Part", value: h.partCode || "-" }, { label: "Part Number", value: h.partNumber || "-" },
        { label: "Revision", value: `Rev ${h.revision}` }, { label: "Cost / Unit", value: money(s.costPerUnit) },
        { label: "Exploded Lines", value: String(s.componentCount) }, { label: "Child Lines", value: String(s.explodedComponentCount) },
        { label: "Price Coverage", value: `${s.pricedLines}/${s.priceApplicableLines}` }, { label: "Status", value: s.costingStatus },
      ],
      sheets: [
        { name: "Management Summary", headers: ["Management Summary", "Value"], rows: summaryRows },
        { name: "BOM Structure & Cost", headers: detailHeaders, rows: detailRows },
        { name: "Routing & Cycle Time", headers: routingHeaders, rows: routingRows },
      ],
    };
  }

  function managementPdfPayload(report) {
    const h = report.header; const s = report.summary;
    return {
      title: `BOM Management Report ${h.noReg}`,
      subtitle: `${h.partCode || "-"} · Part No. ${h.partNumber || "-"} · ${h.partName || "-"} · Rev ${h.revision} · Costing ${String(report.costingDate).slice(0, 10)}`,
      fileName: `bom-management-${h.noReg}-rev-${h.revision}`,
      headers: ["Lvl", "Source BOM", "Parent Part", "Part Code / Part Number", "Nama / Material", "Qty / Root", "Harga / Sumber", "Process / Cycle", "Extended Cost"],
      rows: report.rows.map((row) => [
        row.level,
        `${row.sourceBomNoReg}\nRev ${row.sourceBomRevision}`,
        [row.parentPartCode, row.parentPartNumber].filter(Boolean).join("\n"),
        [row.partCode, `Part No. ${row.partNumber || "-"}`].join("\n"),
        [row.partName, row.materialCode, row.materialType, row.materialSpec].filter(Boolean).join("\n"),
        `${qty(row.cumulativeQty, row.uomCode)} ${row.uomCode || ""}`,
        `${money(row.unitPrice)}\n${[row.priceSource, row.supplierName || row.supplierCode].filter(Boolean).join(" · ")}`,
        row.processes.map((process) => `${process.processCode || process.processName || "-"} · ${qty(process.cycleTimeSeconds)} sec`).join("\n") || "-",
        money(row.estimatedExtendedCost),
      ]),
      summary: [
        { label: "Parent Part", value: h.partCode || "-" }, { label: "Part Number", value: h.partNumber || "-" },
        { label: "Revision", value: `Rev ${h.revision}` }, { label: "Estimated Cost / Unit", value: money(s.costPerUnit) },
        { label: "Exploded Lines", value: String(s.componentCount) }, { label: "BOM Sources", value: String(s.sourceBomCount) },
        { label: "Price Coverage", value: `${s.pricedLines}/${s.priceApplicableLines}` }, { label: "Costing Status", value: s.costingStatus },
      ],
    };
  }

  function render(report) {
    activeReport = report;
    const h = report.header; const s = report.summary;
    document.getElementById("bom-report-empty").classList.add("d-none");
    document.getElementById("bom-report-content").classList.remove("d-none");
    const cards = [
      ["Parent Part", h.partCode, `Part No. ${h.partNumber || "-"}`], ["Revision", `Rev ${h.revision}`, date(h.effectiveDate)],
      ["Material Cost", money(s.materialCost), "Live price list"], ["Process Cost", money(s.processCost), "Cycle × machine rate"],
      ["Child Explosion", `${s.explodedComponentCount} line`, `${s.sourceBomCount} BOM · max level ${s.maxLevel}`], ["Price Coverage", `${s.pricedLines}/${s.priceApplicableLines}`, s.unpricedLines ? `${s.unpricedLines} line belum harga` : "Semua line tercover"],
    ];
    document.getElementById("bom-report-summary").innerHTML = cards.map(([label, value, note]) => `<article><span>${esc(label)}</span><strong>${esc(value || "-")}</strong><small>${esc(note)}</small></article>`).join("");
    document.getElementById("bom-report-preview-body").innerHTML = report.rows.map((row) => `<tr><td>${row.level}<small class="d-block text-muted">${esc(row.sourceBomNoReg)} Rev ${esc(row.sourceBomRevision)}</small></td><td class="bom-report-part"><strong>${esc(row.partCode || "-")}</strong><small>Part No. ${esc(row.partNumber || "-")}</small>${row.linkedBomNoReg ? `<small class="bom-report-child-bom">↳ ${esc(row.linkedBomNoReg)} Rev ${esc(row.linkedBomRevision)}</small>` : ""}</td><td class="bom-report-part"><strong>${esc(row.partName || "-")}</strong><small>${esc([row.materialCode, row.materialType, row.materialSpec].filter(Boolean).join(" · ") || "-")}</small></td><td>${qty(row.qty, row.uomCode)} / parent<small class="d-block text-muted">${qty(row.cumulativeQty, row.uomCode)} ${esc(row.uomCode || "")} / root</small></td><td>${esc(row.priceSource)}<small class="d-block text-muted">${esc(row.supplierName || row.supplierCode || "")}</small></td><td>${money(row.unitPrice)}</td><td>${row.processes.map((process) => `${esc(process.processCode || process.processName || "-")} · ${qty(process.cycleTimeSeconds)} sec`).join("<br>") || "-"}</td><td>${money(row.estimatedExtendedCost)}</td></tr>`).join("");
    ["bom-report-xlsx", "bom-report-pdf", "bom-report-diagram-pdf", "bom-report-canvas"].forEach((id) => { document.getElementById(id).disabled = false; });
  }

  async function loadReport(noReg) {
    if (!noReg) return;
    const costingDate = document.getElementById("bom-report-date").value;
    render(await getJson(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(noReg)}/report${costingDate ? `?costingDate=${encodeURIComponent(costingDate)}` : ""}`));
  }

  async function open(noReg = "") {
    await loadOptions();
    document.getElementById("bom-report-date").value = new Date().toISOString().slice(0, 10);
    modal.show();
    if (noReg) { document.getElementById("bom-report-select").value = noReg; await loadReport(noReg); }
  }

  function buildDiagramCanvas(report) {
    const h = report.header; const s = report.summary;
    const nodeWidth = 270; const nodeHeight = 118; const horizontalGap = 34; const verticalGap = 78; const margin = 55; const headingHeight = 178;
    const rootKey = "BOM-ROOT"; const childrenByParent = new Map();
    report.rows.forEach((row) => {
      const parentKey = row.parentNodeKey || rootKey;
      if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
      childrenByParent.get(parentKey).push(row);
    });
    const subtreeLeaves = new Map();
    const leafCount = (key, visiting = new Set()) => {
      if (subtreeLeaves.has(key)) return subtreeLeaves.get(key);
      if (visiting.has(key)) return 1;
      const next = new Set(visiting).add(key); const children = childrenByParent.get(key) || [];
      const count = children.length ? children.reduce((sum, child) => sum + leafCount(child.nodeKey, next), 0) : 1;
      subtreeLeaves.set(key, Math.max(1, count)); return Math.max(1, count);
    };
    const totalLeaves = leafCount(rootKey); const positions = new Map(); let maxDepth = 0;
    const place = (key, startLeaf, depth) => {
      const children = childrenByParent.get(key) || []; const span = leafCount(key); maxDepth = Math.max(maxDepth, depth);
      if (key === rootKey) positions.set(key, { x: margin + (startLeaf + span / 2) * (nodeWidth + horizontalGap) - nodeWidth / 2, y: headingHeight });
      let cursor = startLeaf;
      children.forEach((child) => {
        const childSpan = leafCount(child.nodeKey);
        positions.set(child.nodeKey, { x: margin + (cursor + childSpan / 2) * (nodeWidth + horizontalGap) - nodeWidth / 2, y: headingHeight + (depth + 1) * (nodeHeight + verticalGap) });
        place(child.nodeKey, cursor, depth + 1); cursor += childSpan;
      });
    };
    place(rootKey, 0, 0);
    const width = Math.max(1500, margin * 2 + totalLeaves * (nodeWidth + horizontalGap));
    const height = Math.max(650, headingHeight + (maxDepth + 1) * (nodeHeight + verticalGap) + margin);
    const maxCanvasSide = 16000; const maxCanvasPixels = 100000000;
    const renderScale = Math.min(1, maxCanvasSide / width, maxCanvasSide / height, Math.sqrt(maxCanvasPixels / (width * height)));
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * renderScale); canvas.height = Math.ceil(height * renderScale);
    const context = canvas.getContext("2d"); context.scale(renderScale, renderScale); context.fillStyle = "#f5f7fb"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#e2e8f0";
    for (let x = 10; x < width; x += 20) for (let y = headingHeight - 5; y < height; y += 20) context.fillRect(x, y, 1, 1);
    context.fillStyle = "#172554"; context.fillRect(0, 0, width, 148); context.fillStyle = "#fff"; context.font = "700 34px Arial"; context.fillText(`BOM EXPLOSION · ${h.noReg} · Rev ${h.revision}`, margin, 48);
    context.font = "700 22px Arial"; context.fillText(`${h.partCode || "-"} · Part No. ${h.partNumber || "-"} · ${h.partName || "-"}`, margin, 84);
    context.fillStyle = "#c7d2fe"; context.font = "15px Arial"; context.fillText(`${s.componentCount} exploded lines · ${s.sourceBomCount} BOM source · Level ${s.maxLevel} · Costing ${String(report.costingDate).slice(0, 10)} · ${money(s.costPerUnit)}`, margin, 118);
    const roundRect = (x, y, w, h, radius) => {
      context.beginPath();
      if (typeof context.roundRect === "function") context.roundRect(x, y, w, h, radius);
      else { context.rect(x, y, w, h); }
    };
    const clippedText = (value, maxWidth) => {
      const source = String(value || "-"); if (context.measureText(source).width <= maxWidth) return source;
      let result = source; while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
      return `${result}…`;
    };
    report.rows.forEach((row) => {
      const child = positions.get(row.nodeKey); const parent = positions.get(row.parentNodeKey || rootKey); if (!child || !parent) return;
      const parentBottom = parent.y + nodeHeight; const childTop = child.y; const busY = parentBottom + (childTop - parentBottom) * .47;
      context.strokeStyle = "#94a3b8"; context.lineWidth = 2; context.beginPath(); context.moveTo(parent.x + nodeWidth / 2, parentBottom); context.lineTo(parent.x + nodeWidth / 2, busY); context.lineTo(child.x + nodeWidth / 2, busY); context.lineTo(child.x + nodeWidth / 2, childTop); context.stroke();
      context.fillStyle = "#64748b"; context.beginPath(); context.arc(child.x + nodeWidth / 2, childTop, 3.2, 0, Math.PI * 2); context.fill();
    });
    const drawNode = (key, row) => {
      const position = positions.get(key); if (!position) return; const x = position.x; const y = position.y;
      const rawMaterial = row?.rawType === "MATERIAL"; const purchased = row?.category === "Purchase"; const vendor = row?.category === "Vendor";
      const palette = !row ? ["#eef2ff", "#4f46e5", "#4338ca"] : rawMaterial ? ["#f0f9ff", "#0ea5e9", "#0369a1"] : purchased ? ["#fff7ed", "#f97316", "#c2410c"] : vendor ? ["#fdf4ff", "#c026d3", "#86198f"] : ["#f0fdf4", "#22c55e", "#15803d"];
      context.shadowColor = "rgba(15,23,42,.12)"; context.shadowBlur = 12; context.shadowOffsetY = 4; roundRect(x, y, nodeWidth, nodeHeight, 11); context.fillStyle = "#fff"; context.fill(); context.shadowColor = "transparent";
      context.strokeStyle = palette[1]; context.lineWidth = !row ? 2.5 : 1.8; roundRect(x, y, nodeWidth, nodeHeight, 11); context.stroke(); context.fillStyle = palette[1]; context.fillRect(x, y, 6, nodeHeight);
      context.fillStyle = palette[0]; roundRect(x + 14, y + 11, nodeWidth - 28, 22, 5); context.fill();
      context.fillStyle = palette[2]; context.font = "700 10px Arial"; context.fillText(!row ? "PRODUK UTAMA" : `LEVEL ${row.level} · ${row.category} · ${row.sourceBomNoReg} R${row.sourceBomRevision}`, x + 22, y + 26);
      context.fillStyle = "#101828"; context.font = "700 15px Arial"; context.fillText(clippedText(row?.partCode || h.partCode || "-", nodeWidth - 38), x + 18, y + 53);
      context.fillStyle = "#475467"; context.font = "700 11px Arial"; context.fillText(clippedText(`Part No. ${row?.partNumber || h.partNumber || "-"}`, nodeWidth - 38), x + 18, y + 72);
      context.fillStyle = "#667085"; context.font = "10px Arial"; context.fillText(clippedText(row?.partName || h.partName || "-", nodeWidth - 38), x + 18, y + 89);
      context.fillStyle = "#f2f4f7"; context.fillRect(x + 1, y + 96, nodeWidth - 2, 21); context.fillStyle = "#475467"; context.font = "700 9px Arial";
      context.fillText(row ? `Qty/root ${qty(row.cumulativeQty, row.uomCode)} ${row.uomCode || ""}${row.linkedBomNoReg ? ` · Child BOM ${row.linkedBomNoReg}` : ""}` : `Root BOM · ${s.componentCount} exploded lines`, x + 18, y + 110);
    };
    drawNode(rootKey, null); report.rows.forEach((row) => drawNode(row.nodeKey, row));
    return canvas;
  }

  function canvasExport(report) {
    const canvas = buildDiagramCanvas(report); const h = report.header;
    canvas.toBlob((blob) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `bom-diagram-${h.noReg}-rev-${h.revision}.png`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }, "image/png");
  }

  async function diagramPdfExport(report, button) {
    const canvas = buildDiagramCanvas(report); const h = report.header;
    const imagesDataUrls = [canvas.toDataURL("image/png")];
    const tileWidth = 1600; const tileHeight = 950;
    const columns = Math.ceil(canvas.width / tileWidth); const rows = Math.ceil(canvas.height / tileHeight);
    if (columns > 1 || rows > 1) {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const sourceX = column * tileWidth; const sourceY = row * tileHeight;
          const width = Math.min(tileWidth, canvas.width - sourceX); const height = Math.min(tileHeight, canvas.height - sourceY);
          const tile = document.createElement("canvas"); tile.width = width; tile.height = height;
          const context = tile.getContext("2d"); context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
          context.drawImage(canvas, sourceX, sourceY, width, height, 0, 0, width, height);
          imagesDataUrls.push(tile.toDataURL("image/png"));
        }
      }
    }
    const payload = {
      title: `BOM Diagram ${h.noReg}`,
      subtitle: `${h.partCode || "-"} · Part No. ${h.partNumber || "-"} · ${h.partName || "-"} · Rev ${h.revision}`,
      fileName: `bom-diagram-${h.noReg}-rev-${h.revision}`,
      imagesDataUrls,
    };
    await window.SharedDataTable.exportTablePayload(payload, "image-pdf", button);
  }

  function installRowReportActions() {
    document.querySelectorAll("#bom-table tbody tr").forEach((row) => {
      const actionBox = row.querySelector(".bom-icon-actions"); const reference = row.querySelector(".bom-code-link")?.textContent?.trim();
      if (!actionBox || !reference || actionBox.querySelector("[data-bom-report]")) return;
      const button = document.createElement("button"); button.type = "button"; button.dataset.bomReport = reference; button.title = "BOM Management Report"; button.textContent = "⇩"; actionBox.insertBefore(button, actionBox.children[1] || null);
    });
  }
  new MutationObserver(installRowReportActions).observe(document.getElementById("bom-table"), { childList: true, subtree: true });
  installRowReportActions();
  document.getElementById("bom-open-report").addEventListener("click", () => open().catch((error) => window.alert(error.message)));
  document.addEventListener("click", (event) => { const button = event.target.closest("[data-bom-report]"); if (button) open(button.dataset.bomReport).catch((error) => window.alert(error.message)); });
  document.getElementById("bom-report-preview").addEventListener("click", () => loadReport(document.getElementById("bom-report-select").value).catch((error) => window.alert(error.message)));
  document.getElementById("bom-report-select").addEventListener("change", (event) => { if (event.target.value) loadReport(event.target.value).catch((error) => window.alert(error.message)); });
  document.getElementById("bom-report-xlsx").addEventListener("click", (event) => { if (activeReport) window.SharedDataTable.exportTablePayload(managementPayload(activeReport), "xlsx", event.currentTarget); });
  document.getElementById("bom-report-pdf").addEventListener("click", (event) => { if (activeReport) window.SharedDataTable.exportTablePayload(managementPdfPayload(activeReport), "pdf", event.currentTarget); });
  document.getElementById("bom-report-diagram-pdf").addEventListener("click", (event) => { if (activeReport) diagramPdfExport(activeReport, event.currentTarget).catch((error) => window.alert(error.message)); });
  document.getElementById("bom-report-canvas").addEventListener("click", () => { if (activeReport) canvasExport(activeReport); });
})();
