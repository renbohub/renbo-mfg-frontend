"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { create } = require("../public/js/bom-commercial.js");

let date = "2026-07-15";
const state = {
  parts: [
    { id: "part", supplierId: "s1", itemType: "RAW", rawType: "PART", purchaseUomCode: "PCS" },
    { id: "steel", supplierId: "s1", itemType: "RAW", rawType: "MATERIAL", materialId: "mat" },
    { id: "wip", itemType: "WIP" },
  ],
  materials: [{ id: "mat", materialGradeId: "grade", materialSubstanceId: "substance", thickness: 2, defaultPurchaseUomCode: "KG" }],
  materialForms: [{ id: "coil", symbol: "C" }, { id: "sheet", symbol: "S", defaultPurchaseUomCode: "SHEET" }],
  currencies: [{ currencyCode: "USD", exchangeRate: 15000 }],
  partPrices: [
    { id: "s1-old", partId: "part", supplierId: "s1", effectiveFrom: "2026-01-01", unitPrice: 100 },
    { id: "s2", partId: "part", supplierId: "s2", effectiveFrom: "2026-06-01", unitPrice: 2, currencyCode: "USD" },
    { id: "future", partId: "part", supplierId: "s2", effectiveFrom: "2026-08-01", unitPrice: 99 },
    { id: "inactive", partId: "part", supplierId: "s2", effectiveFrom: "2026-07-01", unitPrice: 98, isActive: false },
  ],
  materialPrices: [
    { id: "steel-rate", supplierId: "s1", materialId: "mat", effectiveFrom: "2026-01-01", unitPrice: 12000 },
    { id: "unrelated", supplierId: "s1", effectiveFrom: "2026-02-01", unitPrice: 999 },
  ],
  machines: [
    { id: "p1", machineCode: "P-1", machineSpecificationCode: "PRESS", status: "Active", costingRate: 3600, costingRateType: "PER_HOUR" },
    { id: "p2", machineCode: "P-2", machineSpecificationCode: "PRESS", status: "Active", costingRate: 120, costingRateType: "PER_MINUTE" },
    { id: "p3", machineCode: "P-3", costingRate: 30, costingRateType: "PER_CYCLE" },
  ],
  machineCostRates: [{ id: "hour-rate", machineId: "p1", effectiveFrom: "2026-07-01", effectiveUntil: "2026-07-31", unitPrice: 0.24, currencyCode: "USD", costingRateType: "PER_HOUR" }],
  processMaster: [{ id: "press", processCode: "PRG", processName: "Press" }, { id: "plate", processCode: "PLT", processName: "Plating" }],
  vendors: [{ id: "v1", vendorCode: "A", status: "Active" }, { id: "v2", vendorCode: "B", status: "Active" }, { id: "v3", vendorCode: "C", status: "Inactive" }, { id: "v4", vendorCode: "D", isDeleted: true }],
  vendorProcesses: [{ id: "vp", vendorProcessCode: "plt", vendorProcessName: "Plating", vendorIds: ["v1", "v2", "v3", "v4"] }],
  vendorPrices: [
    { id: "generic", vendorId: "v1", effectiveFrom: "2026-06-01", details: [{ vendorProcessId: "vp", unitPrice: 200 }] },
    { id: "exact", vendorId: "v1", partId: "wip", effectiveFrom: "2026-01-01", currencyCode: "USD", details: [{ vendorProcess: { vendorProcessCode: "PLT" }, unitPrice: 0.1 }] },
    { id: "other-part", vendorId: "v1", partId: "elsewhere", effectiveFrom: "2026-07-01", details: [{ vendorProcessId: "vp", unitPrice: 500 }] },
    { id: "future-v2", vendorId: "v2", effectiveFrom: "2026-08-01", details: [{ vendorProcessId: "vp", unitPrice: 700 }] },
  ],
};
const api = create({ getState: () => state, getDate: () => date });

const purchasedPart = { partId: "part", category: "Purchase", supplierId: "s2", qty: 3, uomCode: "PCS" };
let info = api.purchaseInfo(purchasedPart);
assert.equal(info.value, 30000, "Selected supplier and currency must determine the price");
assert.equal(info.source.id, "s2", "Future and inactive prices cannot replace the effective price");
assert.equal(info.priceQty, 3);
assert.equal(info.prefill.supplierId, "s2");
assert.equal(info.kind, "purchase");
assert.equal(api.purchaseInfo({ ...purchasedPart, supplierId: "missing" }).found, false, "Missing selected supplier pricing must not fall back to another supplier");
assert.equal(api.purchaseInfo({ partId: "wip", category: "inHouse" }), null);
assert.equal(api.purchaseInfo({ partId: "unknown", category: "Purchase", qty: 1 }).found, false, "An incomplete material price must not match an unrelated part");

const material = { partId: "steel", category: "Purchase", qty: 4, grossWeight: 0.25, uomCode: "PCS", materialFormId: "coil" };
info = api.purchaseInfo(material);
assert.equal(info.value, 12000);
assert.equal(info.priceQty, 1, "Material costing quantity is BOM quantity times gross kg per piece");
assert.equal(info.qtyUnit, "kg");
assert.equal(info.prefill.materialGradeId, "grade", "Canvas materials loaded separately must work");
assert.equal(info.prefill.purchasePackageUomCode, "COIL");
assert.equal(api.purchaseInfo({ ...material, materialScheme: "ALTERNATIVE", alternateMaterialFormId: "sheet" }).prefill.purchasePackageUomCode, "SHEET");
const supplied = api.purchaseInfo({ ...material, materialSupplyType: "CUSTOMER_SUPPLIED", supplyCustomerId: "customer" });
assert.equal(supplied.value, 0);
assert.equal(supplied.found, true, "Customer supplied zero is valid, rather than missing pricing");
assert.equal(supplied.customerSupplied, true);
assert.equal(supplied.source, null);
assert.equal(api.purchaseInfo({ ...purchasedPart, materialSupplyType: "CUSTOMER_SUPPLIED" }).customerSupplied, false, "Customer material supply cannot accidentally zero an ordinary purchased part");
assert.equal(api.purchaseInfo({ ...purchasedPart, part: state.parts[1], materialSupplyType: "CUSTOMER_SUPPLIED" }).customerSupplied, false, "Changing the selected part must invalidate embedded raw-material identity");
assert.equal(api.purchaseInfo({ partId: "unknown", part: state.parts[1], category: "Purchase", qty: 1 }).found, false, "A stale embedded part from another ID cannot contribute its material price");

date = "2026-08-02";
assert.equal(api.purchaseInfo(purchasedPart).source.id, "future", "Changing the BOM effective date changes applicable pricing");
date = "2026-07-15";
state.partPrices.push({ id: "annual", supplierId: "s1", partId: "annual", pricingYear: 2026, may: 40, july: 60, august: 100 });
assert.equal(api.purchaseInfo({ partId: "annual", category: "Purchase", qty: 1 }).value, 60, "Legacy monthly pricing must use current or earlier month");

const press = { processId: "press", machineId: "p1", machineSpecificationCode: "PRESS", cycleTime: 30 };
assert.equal(api.machineCostPerSecond(press).value, 1);
assert.equal(api.processCost(press).value, 30, "Cycle time is measured in seconds");
assert.equal(api.machineRateDisplay(press).value, 3600);
assert.equal(api.machineRateDisplay(press).unit, "/ jam");
const primaryP2 = { ...press, machinePlanningPolicy: { primaryMachineId: "p2" } };
assert.equal(api.representativeMachine(primaryP2).id, "p2", "Validated primary machine overrides the specification representative");
assert.equal(api.processCost(primaryP2).value, 60);
assert.equal(api.processCost({ machineId: "p3", cycleTime: 10 }).value, 30, "PER_CYCLE must not be divided by an hour");
assert.equal(api.processCost({ machineId: "p3", cycleTime: 0 }).found, false, "A missing CT is not a complete process estimate");
assert.equal(api.processCost({ machineId: "missing", cycleTime: 10 }).found, false, "Unknown machine cannot borrow an unrelated rate");

const vendorRoute = { processId: "plate", routingMode: "VENDOR", vendorId: "v1", cycleTime: 999 };
assert.equal(api.vendorProcessMaster(vendorRoute).id, "vp", "Vendor process master matches process code without case sensitivity");
assert.equal(api.processCost(vendorRoute, { partId: "wip" }).value, 1500, "Part-specific vendor price wins over a newer generic price");
assert.equal(api.processCost(vendorRoute, { partId: "unknown" }).value, 200, "Other part pricing cannot leak into a generic process estimate");
assert.equal(api.processCost(vendorRoute).value, 200, "Without a part, only generic vendor pricing is meaningful");
assert.equal(api.processCost({ ...vendorRoute, processId: "press" }, { partId: "wip" }).found, false, "Different process pricing cannot be borrowed");
const changedProcess = { ...vendorRoute, processId: "press", process: state.processMaster[1] };
assert.equal(api.vendorProcessMaster(changedProcess), null, "Changing the process selector must invalidate the previous embedded process master");
assert.equal(api.processCost(changedProcess, { partId: "wip" }).found, false, "The previous process price must disappear immediately after changing process ID");
assert.equal(api.vendorProcessMaster({ ...changedProcess, processId: "unknown" }), null, "An unknown selected ID cannot retain the previous process's vendor eligibility");
assert.equal(api.vendorProcessMaster({ ...changedProcess, processId: null }), null, "Clearing the process selector also clears stale vendor eligibility");
assert.deepEqual(api.eligibleVendors(vendorRoute, { partId: "wip" }).map(({ vendor }) => vendor.id), ["v1", "v2"], "Only approved active vendors are eligible");
assert.equal(api.eligibleVendors(vendorRoute, { partId: "wip" })[1].rate.found, false, "Eligible vendor with future pricing remains an explicit price gap");
const ambiguous = { ...vendorRoute, vendorId: "invalid" };
api.autoSelectEligibleVendor(ambiguous, { partId: "wip" });
assert.equal(ambiguous.vendorId, null, "Multiple eligible vendors require a choice instead of silently selecting the cheapest");
const existing = { ...vendorRoute };
api.autoSelectEligibleVendor(existing, { partId: "wip" });
assert.equal(existing.vendorId, "v1", "A valid existing vendor selection is preserved");
state.vendorProcesses[0].vendorIds = ["v2"];
api.autoSelectEligibleVendor(ambiguous, { partId: "wip" });
assert.equal(ambiguous.vendorId, "v2", "Exactly one eligible vendor can be selected automatically even when its price is missing");
state.vendorProcesses[0].vendorIds = ["v1", "v2"];

const estimate = api.processEstimate({ partId: "wip", processes: [press, vendorRoute, { processId: "press", machineId: "unknown", cycleTime: 10 }] });
assert.deepEqual(estimate, { value: 1530, vendor: 1500, perSecond: 1, seconds: 40, lines: 3, covered: 2 });
assert.deepEqual(api.processEstimate({ partId: "wip", mbomProcesses: [press, vendorRoute] }), { value: 1530, vendor: 1500, perSecond: 1, seconds: 30, lines: 2, covered: 2 }, "Table and canvas routing shapes must share costing semantics");
const aliasState = { ...state, processes: state.processMaster };
delete aliasState.processMaster;
assert.equal(create({ getState: () => aliasState, getDate: () => date }).vendorProcessMaster(vendorRoute).id, "vp");

const fields = { supplierId: null, materialSupplyType: "CUSTOMER_SUPPLIED", supplyCustomerId: "customer", vendorId: "legacy-vendor" };
assert.deepEqual(api.detailFields({ ...fields, partId: "part" }), fields, "Explicit null supplier and existing detail vendor must survive roundtrip");
assert.deepEqual(api.detailFields({ partId: "part" }), { supplierId: "s1", materialSupplyType: "SUPPLIER_PURCHASE", supplyCustomerId: null, vendorId: null });
assert.deepEqual(api.detailFields({ ...fields, materialSupplyType: null }), { ...fields, materialSupplyType: null });

const browser = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/bom-commercial.js"), "utf8"), browser);
assert.equal(typeof browser.BomCommercial.create, "function", "Browser script exposes the same factory without Node dependencies");
assert.equal(browser.BomCommercial.create().processEstimate({}).value, 0);
console.log("BOM commercial helper: supplier/material pricing, dated vendor eligibility, machine costing, field roundtrip, and browser contract passed.");
