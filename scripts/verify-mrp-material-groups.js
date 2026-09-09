"use strict";
const assert = require("node:assert/strict");
const { groupMaterials } = require("../public/js/ppic-mrp-material-groups");
const { supplyKey } = require("../public/js/ppic-mrp-supply-model");
const { summarizeCurrentStock } = require("../public/js/ppic-mrp-stock-summary");
const options = { supplyKey, summarizeCurrentStock };
function usage(id, official, preview = 0, override = {}) {
  return {
    _id: id, materialCode: "MI-M06-N01", materialName: "NUT-M6", uom: "PCS",
    fgLabel: id, fgCode: id, identificationCode: `PART-${id}`, process: "SPOT", _search: `nut-m6 part-${id}`,
    officialTotal: official, total: official, lookaheadTotal: preview, hasLookahead: preview > 0,
    _state: { key: "GREEN", label: "On track" },
    cells: new Map([["2026-09-07", {
      bucket: { key: "2026-09-07" }, qty: official + preview, rawQty: official + preview,
      officialQty: official, baselineQty: official - 1, additionalQty: 1, lookaheadQty: preview,
      hasLookahead: preview > 0, status: { key: "GREEN" },
      items: [{ id, supplyBreakdown: { warehouseStock: { lines: [{ stockBalanceId: "shared", qtyOnHand: 90 }] }, wipStock: { lines: [{ stockBalanceId: "wip", qtyOnHand: 12 }] } } }],
    }]]), ...override,
  };
}
const a = usage("A", 12, 5), b = usage("B", 8, 7);
const [group] = groupMaterials([a, b], options);
assert.equal(group.children.length, 2);
assert.equal(group.officialTotal, 20);
assert.equal(group.total, 20, "preview is not included in official total");
assert.equal(group.lookaheadTotal, 12);
assert.equal(group.cells.get("2026-09-07").qty, 32);
assert.equal(group.cells.get("2026-09-07").baselineQty, 18);
assert.equal(group.cells.get("2026-09-07").additionalQty, 2);
assert.equal(group.cells.get("2026-09-07").items.length, 2, "preserve bucket lineage");
assert.equal(group.currentStock.warehouseQty, 90, "shared WH snapshot must not double");
assert.equal(group.currentStock.wipQty, 12, "shared WIP snapshot must not double");
assert(group._search.includes("part-b"), "child search keeps complete material context");
assert.equal(groupMaterials([b, a], options)[0]._id, group._id, "expansion key stable across ordering");
assert.equal(a.cells.get("2026-09-07").items.length, 1, "do not mutate source requirements");
assert.equal(groupMaterials([a, usage("KG", 3, 0, { uom: "KG" }), usage("C1", 3, 0, { materialSupplyType: "CUSTOMER_SUPPLIED", supplyCustomerCode: "C1" }), usage("C2", 3, 0, { materialSupplyType: "CUSTOMER_SUPPLIED", supplyCustomerCode: "C2" })], options).length, 4);
const late = usage("late", 2, 0, { _state: { key: "LATE" } });
late.cells.get("2026-09-07").status = { key: "LATE" };
assert.equal(groupMaterials([a, late], options)[0]._state.key, "LATE");
assert.equal(groupMaterials([a, late], options)[0].cells.get("2026-09-07").status.key, "LATE");
assert.deepEqual(groupMaterials([], options), []);
const [withPartNumbers] = groupMaterials([
  usage("P1", 3, 0, { materialPartNumbers: [" PN-002 ", "PN-001"] }),
  usage("P2", 2, 0, { materialPartNumbers: ["PN-001", ""] }),
], options);
assert.deepEqual(withPartNumbers.materialPartNumbers, ["PN-001", "PN-002"], "show all distinct material part numbers without changing grouping");
assert.equal(withPartNumbers.officialTotal, 5);
assert.deepEqual(group.materialPartNumbers, [], "missing part number must not be replaced by FG or consumer part number");
console.log("PASS MRP material grouping: totals, lineage, stock dedup, units, ownership, search and stable keys");
assert.equal(groupMaterials([usage("DRAWING", 2, 0, { _materialCategory: "PURCHASE_PART" }), usage("UNIVERSAL", 3, 0, { _materialCategory: "UNIVERSAL_PURCHASE_PART" })], options).length, 2, "different procurement categories must not merge even with identical material codes");
