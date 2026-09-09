"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "public/js/ppic-mps-workbench.js"), "utf8");
const view = fs.readFileSync(path.join(root, "views/ppic/mps-workbench.ejs"), "utf8");
const code = script.slice(script.indexOf("  function rccpMachineCount("), script.indexOf("  function renderRccpTimeline("));
const context = { num: String, number: Number, esc: String, date: String, label: String,
  capacityTone: () => "success", rccpBucketContributions: () => [],
  els: { rccpWeekly: { innerHTML: "" } } };
vm.createContext(context);
vm.runInContext(code, context);
assert.equal(context.rccpMachineCount({ resourceCount: 3, resourceType: "INTERNAL" }), "3 mesin");
assert.equal(context.rccpMachineCount({ resourceCount: 0 }), "0 mesin");
for (const value of [undefined, null, "", -1, 1.5, "invalid"]) assert.equal(context.rccpMachineCount({ resourceCount: value }), "—");
assert.equal(context.rccpMachineCount({ resourceCount: 4, resourceType: "OUTSOURCE" }), "— (vendor)");
assert.equal(context.rccpMachineCount({ resourceCount: 2, resourceType: "VENDOR" }), "— (vendor)");
assert.equal(context.rccpMachineList({ partBreakdown: [{ capacityBasis: { type: "WORK_CENTER", machines: [{ machineCode: "M-001" }, { machineCode: "M-004" }] } }] }), "M-001, M-004");
context.renderRccpWeekly({ loads: [{ resourceCode: "PRG", resourceCount: 3, resourceType: "INTERNAL" }], timeBuckets: [
  { resourceCode: "PRG", resourceType: "INTERNAL", bucketStart: "2026-09-01", bucketEnd: "2026-09-07", loadPercentage: 50, currentMpsLoad: 10, availableCapacity: 20 },
  { resourceCode: "PAINT", resourceType: "OUTSOURCE", bucketStart: "2026-09-01", bucketEnd: "2026-09-07", loadPercentage: 20, currentMpsLoad: 4, availableCapacity: 20 },
] });
assert.match(context.els.rccpWeekly.innerHTML, /Jumlah Mesin/);
assert.match(context.els.rccpWeekly.innerHTML, /3 mesin/);
assert.match(context.els.rccpWeekly.innerHTML, /— \(vendor\)/);
assert.match(view, /Jumlah Mesin<\/th><th>Current MPS/);
assert.match(script, /esc\(rccpMachineCount\(row\)\)/);
assert.match(script, /colspan="8">Memuat RCCP/);
assert.match(script, /colspan="8">RCCP belum tersedia/);
console.log("RCCP machine count: saved capacity count, weekly/summary columns, vendor and missing data PASS");
