"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../public/js/ppic-mps-audit-model");
const buffer = { code: "BUFFER_POLICY_MET", label: "Buffer Policy", status: "WARNING", actual: { value: 50000, projectedEndingQty: 50000, targetBufferQty: 57500, unit: "PCS" }, requirement: { value: 57500, unit: "PCS" }, gap: { value: -7500, unit: "PCS" } };
assert.equal(model.facts(buffer).actual, "50.000 PCS");
assert.equal(model.facts(buffer).expected, "≥ 57.500 PCS");
assert.equal(model.facts(buffer).gap, "Kurang 7.500 PCS");
assert.equal(model.facts({ ...buffer, actual: { value: 0, unit: "PCS" } }).actual, "0 PCS", "zero is not missing");
assert.equal(model.facts({ code: "BUFFER_POLICY_MET", status: "NOT_CHECKED" }).actual, "Belum tersedia");
assert.match(model.facts({ code: "BUFFER_POLICY_MET", status: "NOT_CHECKED" }).action, /Lengkapi data/);
assert.equal(model.groupedStatus([{ status: "NA" }, { status: "NA" }]), "NA", "inapplicable must not become Pass");
assert.equal(model.groupedStatus([]), "NOT_CHECKED");
assert.equal(model.groupedStatus([{ status: "WARNING" }, { status: "NOT_CHECKED" }]), "NOT_CHECKED");
assert.equal(model.facts({ code: "FG_COVERAGE_AT_DUE_DATE", actual: { value: -5, unit: "PCS" }, requirement: { value: 1000 } }).expected, "≥ 0 setelah demand");
assert.equal(model.facts({ code: "CAPACITY_AVAILABLE", actual: { requiredCapacityHours: 20, netAvailableCapacityHours: 15, capacityGapHours: -5 } }).gap, "Kurang 5 jam");
assert.equal(model.facts({ code: "MATERIAL_READY_BY_START", actual: { value: 9876, unit: "PCS", shortageComponentCount: 3, maxMaterialLateDays: 2 } }).actual, "3 komponen kurang", "do not sum incompatible material units");
assert.equal(model.facts({ code: "FIRM_SUPPLY_ON_TIME", status: "NOT_CHECKED", gap: { value: 0 } }).gap, "Belum dihitung", "missing supply must not look like a zero gap");
assert.equal(model.facts({ code: "LEAD_TIME_AND_FINISH_FIT", gap: { value: -11520 } }).gap, "Terlambat 192 jam");
assert.doesNotMatch(model.measure({ value: "2026-10-31T00:00:00.000Z", unit: "datetime" }), /T00:00/);

const script = fs.readFileSync(path.join(__dirname, "../public/js/ppic-mps-workbench.js"), "utf8");
const definitionSource = script.slice(script.indexOf("  const checkpointDefinitions ="), script.indexOf("  function renderCheckpointTableLegacy"));
const renderSource = script.slice(script.indexOf("  function renderProductionEvidence"), script.indexOf("  async function submitChecklistRecovery"));
const esc = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[char]);
const context = vm.createContext({ auditModel: model, esc, num: String, label: String, checkStatusMeta: (status) => ({ label: status, tone: status === "PASS" ? "success" : "warning" }), date: (v) => v || "—", renderCapacityDecision: () => "", renderDecisionSupport: () => "", renderCheck: () => "", checkpointCodes: { "Material Supply": "MATERIAL_SUPPLY", "Production Capacity": "PRODUCTION_CAPACITY", "Vendor Process": "VENDOR_PROCESS", "Delivery Schedule": "DELIVERY_SCHEDULE" }, els: { month: { value: "2026-10" } }, state: { feasibilityDetail: { identity: { mpsRevision: 2 } } }, checklistRecoveryError: "", checklistRequestBusy: false, checklistRecovery: { items: [], canRequest: true, departments: [{ id: "D1", name: "PPIC", recipientCount: 1 }] } });
vm.runInContext(definitionSource + renderSource, context);
context.fixture = { identity: { rowType: "BUFFER" }, checks: [
  { code: "MPS_MATERIAL", label: "Material & waktu pembelian", status: "WARNING", actual: { display: "1 material kurang" }, requirement: { display: "Cukup saat mulai proses" }, reason: "Pembelian masih keburu", recommendation: "Minta pembelian material", evidence: [{ partCode: "RM1", requiredQty: 100, availableQty: 70, shortageQty: 30, uomCode: "KG", requiredDate: "2026-09-20", latestPurchaseAt: "2026-09-10", purchase: "Pembelian masih keburu" }] },
  { code: "MPS_CAPACITY", label: "Kapasitas produksi", status: "PASS" },
  { code: "MPS_VENDOR", label: "Lead time proses vendor", status: "NA", reason: "Tidak ada proses vendor pada BOM" },
] };
const html = vm.runInContext("renderFocusedCheckpoints(fixture)", context);
assert.equal((html.match(/class="mwb-audit-card /g) || []).length, 3, "three production areas including an explicit no-vendor result");
assert.match(html, /Data saat ini/); assert.match(html, /Seharusnya/); assert.match(html, /Kenapa:/);
assert.match(html, /data-checkpoint-request="MATERIAL_SUPPLY"/);
assert.match(html, /Batas ajukan beli/); assert.match(html, /30 KG/);
assert.match(html, /Tidak ada proses vendor pada BOM/);
assert.doesNotMatch(html, /Data &amp; buffer|Supply &amp; QC|Jadwal &amp; pengiriman|data-delivery-last-resort/);
assert.match(html, /<details class="mwb-audit-more"><summary>Data sumber/);
context.checklistRecovery.departments = [];
assert.match(vm.runInContext("renderFocusedCheckpoints(fixture)", context), /disabled title="Hubungkan akun/);
context.fixture.checks[0].status = "PASS";
assert.doesNotMatch(vm.runInContext("renderFocusedCheckpoints(fixture)", context), /data-checkpoint-request=/, "Pass does not create a recovery request");
context.fixture.checks[0].reason = '<img src=x onerror="alert(1)">';
context.fixture.checks[0].evidence[0].partCode = '<img src=x onerror="alert(1)">';
const safe = vm.runInContext("renderFocusedCheckpoints(fixture)", context);
assert.doesNotMatch(safe, /<img/); assert.match(safe, /&lt;img/);
context.fixture.deliverySuggestion = { eligible: false };
assert.doesNotMatch(vm.runInContext("renderFocusedCheckpoints(fixture)", context), /data-delivery-last-resort/);
context.fixture.deliverySuggestion = { eligible: true, requestedDeliveryDate: "2026-09-20", suggestedDeliveryDate: "2026-09-23", reason: "Recovery tidak memungkinkan" };
context.checklistRecovery.departments = [{ id: "S", code: "SALES", name: "Sales", recipientCount: 1 }];
const lastResort = vm.runInContext("renderFocusedCheckpoints(fixture)", context);
assert.match(lastResort, /data-delivery-last-resort/); assert.match(lastResort, /data-checkpoint-request="DELIVERY_SCHEDULE"/);
console.log("Focused production checksheet UI: three areas, quantities, purchase dates, no vendor, buffer, last-resort gate, recovery and escaping PASS");
