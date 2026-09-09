(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpSupplyModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Use the run's supply snapshot, not a later edit to the live BOM.
  const isCustomerSupplied = (row = {}) => String(row.materialSupplyType || "").trim().toUpperCase() === "CUSTOMER_SUPPLIED";
  const supplyLabel = (row = {}) => isCustomerSupplied(row) ? `Disuplai customer${row.supplyCustomerCode ? ` ${row.supplyCustomerCode}` : ""}` : "Beli ke supplier";
  const supplyKey = (row = {}) => isCustomerSupplied(row) ? `CUSTOMER_SUPPLIED|${row.supplyCustomerCode || ""}` : "SUPPLIER_PURCHASE";
  function matrixQty(row, { netQty, discrete, lookahead }) {
    // Purchase order qty is intentionally zero for free-issue material; its physical requirement is not zero.
    const value = isCustomerSupplied(row) || lookahead || !discrete ? netQty : row.plannedOrderQtyPcs ?? netQty;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  const materialCategories = [
    { key: "MATERIAL", label: "Material", help: "Bahan baku yang dibeli ke supplier" },
    { key: "PURCHASE_PART", label: "Purchase Part", help: "Part beli dengan drawing pada master part" },
    { key: "UNIVERSAL_PURCHASE_PART", label: "Universal Part", help: "Part beli tanpa drawing pada master part" },
    { key: "CUSTOMER_SUPPLIED", label: "Suplai Customer", help: "Material milik customer; bukan kebutuhan pembelian" },
    { key: "UNCLASSIFIED", label: "Belum Dikategorikan", help: "Kategori master part belum lengkap" },
  ];
  function materialCategory(row = {}) {
    // Ownership in the MRP snapshot takes precedence over master purchase categories.
    if (isCustomerSupplied(row)) return "CUSTOMER_SUPPLIED";
    if (row._materialCategory) return row._materialCategory;
    const part = row.part || {};
    const itemType = String(part.itemType || "").trim().toUpperCase();
    const rawType = String(part.rawType || "").trim().toUpperCase();
    if (itemType === "RAW" && rawType === "MATERIAL") return "MATERIAL";
    if (rawType === "PURCHASE_PART" && typeof part.hasDrawing === "boolean") return part.hasDrawing ? "PURCHASE_PART" : "UNIVERSAL_PURCHASE_PART";
    return "UNCLASSIFIED";
  }
  return { isCustomerSupplied, supplyLabel, supplyKey, matrixQty, materialCategory, materialCategories };
}));
