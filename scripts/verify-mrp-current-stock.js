"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let stockSummary = {};
try {
  stockSummary = require("../public/js/ppic-mrp-stock-summary");
} catch (_error) {
  stockSummary = {};
}

const { summarizeCurrentStock } = stockSummary;

assert.strictEqual(
  typeof summarizeCurrentStock,
  "function",
  "MRP harus menyediakan agregator current stock yang dapat diuji",
);

const sharedWarehouseLine = {
  stockBalanceId: "stock-wh-1",
  warehouseCode: "WH-RM",
  warehouseName: "Raw Material",
  rackCode: "R-01",
  lotNumber: "LOT-01",
  qtyOnHand: 120,
  qtyReserved: 20,
  qtyQC: 0,
  qtyAvailable: 100,
  uomCode: "PCS",
};
const sharedWipLine = {
  stockBalanceId: "stock-wip-1",
  warehouseCode: "WH-WIP",
  warehouseName: "WIP",
  rackCode: "W-02",
  lotNumber: "LOT-WELD",
  sourcePartCode: "C002-C005-010",
  sourcePartName: "BRACKET WELD",
  sourceItemType: "WIP",
  supplyClass: "WIP_EQUIVALENT",
  qtyOnHand: 45,
  qtyReserved: 10,
  qtyQC: 0,
  qtyAvailable: 35,
  uomCode: "PCS",
};

const requirement = {
  supplyBreakdown: {
    warehouseStock: { qtyAvailable: 100, lines: [sharedWarehouseLine] },
    wipStock: { planningSupplyQty: 45, lines: [sharedWipLine] },
  },
};

const summary = summarizeCurrentStock([requirement, requirement]);
assert.strictEqual(summary.warehouseQty, 120, "field WH harus menampilkan physical on-hand, bukan hanya free stock");
assert.strictEqual(summary.warehouseAvailableQty, 100, "free stock warehouse harus tetap tersedia untuk audit netting");
assert.strictEqual(summary.wipQty, 45, "stock WIP fisik yang sama tidak boleh dijumlah dua kali");
assert.strictEqual(summary.totalQty, 165, "total current stock harus menggabungkan physical WH dan WIP");
assert.strictEqual(summary.warehouseLines.length, 1, "detail warehouse harus dideduplikasi");
assert.strictEqual(summary.wipLines.length, 1, "detail WIP harus dideduplikasi");
assert.strictEqual(summary.wipLines[0].sourcePartCode, "C002-C005-010", "popup harus mempertahankan part sumber WIP");
assert.strictEqual(summary.wipLines[0].sourcePartName, "BRACKET WELD", "popup harus mempertahankan nama part sumber WIP");

const legacy = summarizeCurrentStock([
  { supplyBreakdown: { warehouseStock: { qtyAvailable: 12 }, wipStock: { planningSupplyQty: 8 } } },
  { supplyBreakdown: { warehouseStock: { qtyAvailable: 12 }, wipStock: { planningSupplyQty: 8 } } },
]);
assert.strictEqual(legacy.totalQty, 20, "fallback summary lama tidak boleh menggandakan snapshot antar requirement");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
const detailScript = read("public/js/ppic-mrp-detail-simple.js");
const stockHelper = read("public/js/ppic-mrp-stock-summary.js");
const view = read("views/ppic/mrp-detail-simple.ejs");
const styles = read("public/css/ppic-mrp-detail-simple.css");
assert(detailScript.includes("doc.lifecycleStatus"), "badge MRP harus membaca lifecycle canonical dari backend, bukan menebak semua state sebagai Simulated");
assert(detailScript.includes("doc.approvalEligibility"), "aksi approval MRP harus mengikuti eligibility authoritative dari backend");
assert(detailScript.includes('colspan="2" class="mrps-current-stock-group">Current Stock</th>'), "matrix mingguan harus mengelompokkan WH dan WIP dalam header Current Stock");
assert(detailScript.includes('class="mrps-stock-subhead">WH</th>'), "Current Stock harus mempunyai subkolom WH");
assert(detailScript.includes('class="mrps-stock-subhead">WIP</th>'), "Current Stock harus mempunyai subkolom WIP");
assert(detailScript.includes('data-stock-kind="warehouse"'), "nilai warehouse harus berada di field sendiri");
assert(detailScript.includes('data-stock-kind="wip"'), "nilai WIP harus berada di field sendiri");
assert(detailScript.includes('const num = (value, digits = 2)'), "angka continuous UOM harus dibatasi maksimal dua digit desimal");
assert(detailScript.includes('const qty = (value, uomCode, digits = 2)'), "formatter quantity harus memakai batas dua digit desimal");
assert(detailScript.includes('Warehouse on hand'), "popup harus membedakan physical on-hand dari available untuk netting");
assert(detailScript.includes('Available<b>'), "popup harus menampilkan free/available stock untuk audit netting");
assert(detailScript.includes('data-mrps-stock='), "nilai stock matrix harus dapat membuka popup");
assert(stockHelper.includes("stockBalanceId"), "agregator stock harus dideduplikasi memakai stock balance fisik");
assert(view.includes('id="mrps-stock-modal"'), "detail sumber stock harus memakai popup di page yang sama");
assert(view.includes('/js/ppic-mrp-stock-summary.js'), "agregator stock harus dimuat sebelum script halaman");
assert(styles.includes(".mrps-current-stock-cell"), "kolom stock harus memiliki style tabel yang ringkas");
assert(styles.includes(".mrps-stock-line.wip"), "popup harus membedakan sumber WIP secara visual");

console.log("MRP current-stock contracts passed: 24/24 cases");
