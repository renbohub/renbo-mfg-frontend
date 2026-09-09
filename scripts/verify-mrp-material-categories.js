"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { materialCategory, materialCategories } = require("../public/js/ppic-mrp-supply-model");
const raw = { itemType: "RAW", rawType: "MATERIAL" };
const purchase = { itemType: "RAW", rawType: "PURCHASE_PART", hasDrawing: true };
const universal = { ...purchase, hasDrawing: false };
assert.equal(materialCategory({ part: raw }), "MATERIAL");
assert.equal(materialCategory({ part: purchase }), "PURCHASE_PART");
assert.equal(materialCategory({ part: universal }), "UNIVERSAL_PURCHASE_PART");
for (const part of [raw, purchase, universal, undefined]) {
  assert.equal(materialCategory({ part, materialSupplyType: "CUSTOMER_SUPPLIED" }), "CUSTOMER_SUPPLIED", "customer ownership must take precedence");
}
assert.equal(materialCategory({ part: { ...purchase, hasDrawing: undefined } }), "UNCLASSIFIED", "missing drawing flag must not silently become Universal");
assert.equal(materialCategory({ part: { partCode: "MI-NUT-M6", partName: "Universal nut" } }), "UNCLASSIFIED", "do not infer category from code or name");
assert.equal(materialCategory({ part: raw, mbomDetail: { materialSupplyType: "CUSTOMER_SUPPLIED" } }), "MATERIAL", "read ownership from run snapshot, not live BOM");
assert.equal(materialCategory({ _materialCategory: "PURCHASE_PART" }), "PURCHASE_PART");
assert.equal(materialCategories.length, 5);
const source = fs.readFileSync(require.resolve("../public/js/ppic-mrp-detail-simple.js"), "utf8");
assert.match(source, /_materialCategory: category/);
assert.match(source, /supplyModel\.supplyKey\(item\)\}\|\$\{category\}/, "weekly usage grouping must separate categories");
assert.match(source, /selectedMaterialCategory = button\.dataset\.mrpsCategory;\s*state\.page = 1;/);
assert.match(source, /\["matrix", "buy"\]\.includes\(state\.view\)/, "category filtering only applies to material views");
assert.match(source, /renderMaterialCategories\(eligible\)/, "counts must respect search, status and stock coverage filters");
console.log("PASS material categories: master drawing flag, ownership precedence, unknown data, weekly grouping and filter state.");
