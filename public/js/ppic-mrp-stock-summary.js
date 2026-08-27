(function attachPpicMrpStockSummary(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpStockSummary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPpicMrpStockSummary() {
  "use strict";

  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fallbackKey = (kind, line, index) => [
    kind,
    line.warehouseCode,
    line.rackCode,
    line.lotNumber,
    line.sourcePartCode,
    line.stockType,
    index,
  ].map((value) => String(value || "-")).join("|");

  function uniqueLines(items, kind) {
    const result = new Map();
    for (const item of items || []) {
      const stock = item?.supplyBreakdown?.[kind] || {};
      (Array.isArray(stock.lines) ? stock.lines : []).forEach((line, index) => {
        const key = line.stockBalanceId || fallbackKey(kind, line, index);
        if (!result.has(key)) result.set(key, { ...line });
      });
    }
    return [...result.values()];
  }

  function summarizeCurrentStock(items = []) {
    const warehouseLines = uniqueLines(items, "warehouseStock");
    const wipLines = uniqueLines(items, "wipStock");
    const warehouseOnHandFromLines = warehouseLines.reduce((sum, line) => sum + number(line.qtyOnHand), 0);
    const warehouseAvailableFromLines = warehouseLines.reduce((sum, line) => sum + number(line.qtyAvailable), 0);
    const warehouseReservedFromLines = warehouseLines.reduce((sum, line) => sum + number(line.qtyReserved), 0);
    const warehouseQcFromLines = warehouseLines.reduce((sum, line) => sum + number(line.qtyQC), 0);
    // WIP equivalent represents raw material already embedded in a produced
    // output, so physical on-hand is the usable planning supply.
    const wipFromLines = wipLines.reduce((sum, line) => sum + number(line.qtyOnHand), 0);
    const warehouseOnHandFallback = Math.max(0, ...items.map((item) => number(item?.supplyBreakdown?.warehouseStock?.qtyOnHand ?? item?.supplyBreakdown?.warehouseStock?.qtyAvailable)));
    const warehouseAvailableFallback = Math.max(0, ...items.map((item) => number(item?.supplyBreakdown?.warehouseStock?.qtyAvailable)));
    const warehouseReservedFallback = Math.max(0, ...items.map((item) => number(item?.supplyBreakdown?.warehouseStock?.qtyReserved)));
    const warehouseQcFallback = Math.max(0, ...items.map((item) => number(item?.supplyBreakdown?.warehouseStock?.qtyQC)));
    const wipFallback = Math.max(0, ...items.map((item) => number(item?.supplyBreakdown?.wipStock?.planningSupplyQty)));
    const warehouseQty = warehouseLines.length ? warehouseOnHandFromLines : warehouseOnHandFallback;
    const warehouseAvailableQty = warehouseLines.length ? warehouseAvailableFromLines : warehouseAvailableFallback;
    const warehouseReservedQty = warehouseLines.length ? warehouseReservedFromLines : warehouseReservedFallback;
    const warehouseQcQty = warehouseLines.length ? warehouseQcFromLines : warehouseQcFallback;
    const wipQty = wipLines.length ? wipFromLines : wipFallback;
    return {
      warehouseQty,
      warehouseAvailableQty,
      warehouseReservedQty,
      warehouseQcQty,
      wipQty,
      totalQty: warehouseQty + wipQty,
      warehouseLines,
      wipLines,
    };
  }

  return { summarizeCurrentStock };
});
