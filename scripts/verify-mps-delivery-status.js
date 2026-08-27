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
assert.strictEqual(typeof deliveryStatus.inspectionAction, "function", "production module must expose inspectionAction");
assert.strictEqual(typeof deliveryStatus.reviewRequest, "function", "production module must expose reviewRequest");
assert.strictEqual(typeof deliveryStatus.blockedGateTitle, "function", "production module must expose blockedGateTitle");
assert.strictEqual(typeof deliveryStatus.inspectionSuccessMessage, "function", "production module must expose inspectionSuccessMessage");

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
  label: "Hitung ulang feasibility",
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

assert.deepStrictEqual(deliveryStatus.inspectionAction({
  feasibilityStatus: "STALE",
  blockerCount: 8,
}), {
  label: "Periksa 8 Delivery",
  tone: "warning",
});
assert.deepStrictEqual(deliveryStatus.inspectionAction({
  feasibilityStatus: "FEASIBLE",
  blockerCount: 0,
}), {
  label: "Periksa Ulang Delivery",
  tone: "success",
});
assert.deepStrictEqual(deliveryStatus.inspectionAction({
  feasibilityStatus: "INFEASIBLE",
  blockerCount: 3,
}), {
  label: "Periksa Ulang Delivery",
  tone: "danger",
});
assert.deepStrictEqual(deliveryStatus.reviewRequest("MPS/202609", "DT 1"), {
  url: "/modules/api/planning-ppic/mps/MPS%2F202609/delivery-feasibility/review",
  options: {
    method: "POST",
    body: JSON.stringify({ deliveryTargetIds: ["DT 1"] }),
  },
});
assert.deepStrictEqual(deliveryStatus.reviewRequest("MPS-202609"), {
  url: "/modules/api/planning-ppic/mps/MPS-202609/delivery-feasibility/review",
  options: {
    method: "POST",
    body: JSON.stringify({ deliveryTargetIds: [] }),
  },
});
assert.strictEqual(deliveryStatus.blockedGateTitle({ feasibilityStatus: "STALE" }), "Delivery Belum Diperiksa");
assert.strictEqual(deliveryStatus.blockedGateTitle({ feasibilityStatus: "INFEASIBLE" }), "Delivery Infeasible");
assert.strictEqual(
  deliveryStatus.inspectionSuccessMessage({ reviewedCount: 8 }),
  "8 delivery phase selesai diperiksa. Delivery aman dikonfirmasi otomatis; blocker tetap memerlukan tindakan.",
);

console.log("MPS table delivery status contracts: OK");
