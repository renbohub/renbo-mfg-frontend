"use strict";

const assert = require("assert");

let deliveryStatus = {};
try {
  deliveryStatus = require("../public/js/ppic-mps-delivery-status");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

assert.strictEqual(typeof deliveryStatus.phaseStatus, "function", "production module must expose phaseStatus");
assert.strictEqual(typeof deliveryStatus.decoratePhases, "function", "production module must expose decoratePhases");
assert.strictEqual(typeof deliveryStatus.summarizePhases, "function", "production module must expose summarizePhases");
assert.strictEqual(typeof deliveryStatus.actionLinks, "function", "production module must expose actionLinks");
assert.strictEqual(typeof deliveryStatus.phaseAction, "function", "production module must expose phaseAction");
assert.strictEqual(typeof deliveryStatus.blockedGateTitle, "function", "production module must expose blockedGateTitle");

const feasible = deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "FEASIBLE",
  dispositionStatus: "NONE",
});
assert.deepStrictEqual(feasible, {
  code: "FEASIBLE",
  label: "Delivery Feasible",
  tone: "success",
  canRecovery: false,
  canAcceptLate: false,
});
assert.deepStrictEqual(deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "FEASIBLE",
  dispositionStatus: "ACCEPT_LATE_APPROVED",
}), feasible, "current stock-covered feasibility must win over a historical Accept Late disposition");
assert.deepStrictEqual(deliveryStatus.phaseAction(feasible), {
  mode: "detail",
  icon: "i",
  label: "Detail feasibility",
});

const atRisk = deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "AT_RISK",
  dispositionStatus: "NONE",
});
assert.deepStrictEqual(atRisk, {
  code: "AT_RISK",
  label: "Delivery At Risk",
  tone: "warning",
  canRecovery: false,
  canAcceptLate: false,
});
assert.deepStrictEqual(deliveryStatus.phaseAction(atRisk), {
  mode: "detail",
  icon: "i",
  label: "Detail feasibility",
});

const infeasible = deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "NOT_FEASIBLE",
  dispositionStatus: "NONE",
});
assert.deepStrictEqual(infeasible, {
  code: "INFEASIBLE",
  label: "Delivery Infeasible",
  tone: "danger",
  canRecovery: true,
  canAcceptLate: true,
});
assert.deepStrictEqual(deliveryStatus.phaseAction(infeasible), {
  mode: "handle",
  icon: "!",
  label: "Tangani delivery",
});

const incomplete = deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "MASTER_DATA_INCOMPLETE",
  dispositionStatus: "ACCEPT_LATE_APPROVED",
});
assert.deepStrictEqual(incomplete, {
  code: "MASTER_DATA_INCOMPLETE",
  label: "Master Data Belum Lengkap",
  tone: "warning",
  canRecovery: true,
  canAcceptLate: false,
}, "incomplete master data must not be rendered as Accept Late");
assert.strictEqual(deliveryStatus.phaseAction(incomplete).mode, "handle");

assert.deepStrictEqual(deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "INFEASIBLE",
  dispositionStatus: "RECOVERY_PENDING",
}), {
  code: "RECOVERY_PENDING",
  label: "Recovery Proposed",
  tone: "warning",
  canRecovery: true,
  canAcceptLate: true,
});

assert.deepStrictEqual(deliveryStatus.phaseStatus({
  sourceCurrent: true,
  feasibilityStatus: "INFEASIBLE",
  dispositionStatus: "ACCEPT_LATE_APPROVED",
}), {
  code: "ACCEPT_LATE_APPROVED",
  label: "Accept Late",
  tone: "accept-late",
  canRecovery: false,
  canAcceptLate: false,
});

assert.strictEqual(deliveryStatus.phaseStatus({ feasibilityStatus: "STALE" }).label, "Belum Diperiksa");
assert.deepStrictEqual(deliveryStatus.phaseAction(deliveryStatus.phaseStatus({ feasibilityStatus: "STALE" })), {
  mode: "recheck",
  icon: "↻",
  label: "Hasil stale — gunakan Hitung Ulang MPS",
});
assert.strictEqual(
  deliveryStatus.phaseAction(deliveryStatus.phaseStatus({ sourceCurrent: true, feasibilityStatus: "INFEASIBLE", dispositionStatus: "ACCEPT_LATE_APPROVED" })).mode,
  "detail",
  "approved exception must not ask PPIC to confirm the delivery again",
);

const phases = deliveryStatus.decoratePhases([
  { id: "P1", deliveryTargetId: "DT-1", sourceNumber: "FCT-001", fgRequiredDate: "2026-09-05" },
  { id: "P2", deliveryTargetId: "DT-2", sourceNumber: "FCT-001", fgRequiredDate: "2026-09-12" },
], [
  { deliveryTargetId: "DT-1", feasibilityStatus: "FEASIBLE", sourceCurrent: true, dispositionStatus: "NONE" },
  { deliveryTargetId: "DT-2", feasibilityStatus: "INFEASIBLE", sourceCurrent: true, dispositionStatus: "NONE" },
]);
assert.strictEqual(phases[0].feasibility.label, "Delivery Feasible");
assert.strictEqual(phases[1].feasibility.label, "Delivery Infeasible");
assert.strictEqual(deliveryStatus.summarizePhases(phases).label, "Delivery Infeasible");

assert.deepStrictEqual(deliveryStatus.actionLinks("DT 1"), {
  detail: "DT 1",
  recovery: "recovery",
  acceptLate: "accept-late",
});

assert.strictEqual(deliveryStatus.blockedGateTitle({ feasibilityStatus: "STALE" }), "Delivery Belum Diperiksa");
assert.strictEqual(deliveryStatus.blockedGateTitle({ feasibilityStatus: "INFEASIBLE" }), "Delivery Infeasible");
assert.strictEqual(deliveryStatus.blockedGateTitle({ feasibilityStatus: "MASTER_DATA_INCOMPLETE" }), "Master Data Delivery Belum Lengkap");

console.log("MPS table delivery status contracts: OK");
