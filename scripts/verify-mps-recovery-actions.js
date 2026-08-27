"use strict";

const assert = require("assert");

let recoveryActions = {};
try {
  recoveryActions = require("../public/js/ppic-mps-recovery-actions");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

assert.strictEqual(typeof recoveryActions.actionButton, "function", "production module must expose actionButton");
assert.strictEqual(typeof recoveryActions.endpoints, "function", "production module must expose endpoints");
assert.strictEqual(typeof recoveryActions.preparePlan, "function", "production module must expose preparePlan");
assert.strictEqual(typeof recoveryActions.simpleFormModel, "function", "production module must expose simpleFormModel");
assert.strictEqual(typeof recoveryActions.mergeSimpleForm, "function", "production module must expose mergeSimpleForm");
assert.strictEqual(typeof recoveryActions.shouldRefreshDeliveryAfterCommand, "function", "production module must expose shouldRefreshDeliveryAfterCommand");

assert.deepStrictEqual(recoveryActions.actionButton("root"), { label: "Atur", icon: "⚙", compact: true });
assert.deepStrictEqual(recoveryActions.actionButton("phase"), { label: "Tangani", icon: "!", compact: true });
assert.deepStrictEqual(recoveryActions.actionButton("buffer"), { label: "Detail", icon: "?", compact: true });

assert.deepStrictEqual(recoveryActions.endpoints("DT 1", "PLAN/7"), {
  load: "/modules/api/planning-ppic/demand-planning/DT%201/recovery-plan",
  save: "/modules/api/planning-ppic/demand-planning/DT%201/recovery-plan",
  submit: "/modules/api/planning-ppic/demand-planning/recovery-plans/PLAN%2F7/submit",
  approve: "/modules/api/planning-ppic/demand-planning/recovery-plans/PLAN%2F7/approve",
  reject: "/modules/api/planning-ppic/demand-planning/recovery-plans/PLAN%2F7/reject",
});

const fixture = {
  recommendation: {
    actions: [
      { id: "EXPEDITE_SUPPLIER", title: "Percepat supplier", selected: true },
      { id: "ACCEPT_LATE", title: "Accept Late", selected: false },
    ],
  },
  plan: null,
};
const prepared = recoveryActions.preparePlan(fixture, "accept-late");
assert.strictEqual(prepared.status, "SYSTEM_RECOMMENDATION");
assert.strictEqual(prepared.locked, false);
assert.strictEqual(prepared.pending, false);
assert.strictEqual(prepared.checklist.find((row) => row.id === "ACCEPT_LATE").selected, true);
assert.strictEqual(fixture.recommendation.actions[1].selected, false, "preparePlan must not mutate API data");

const pending = recoveryActions.preparePlan({
  recommendation: { actions: [] },
  plan: { status: "PENDING_APPROVAL", checklist: [{ id: "ACCEPT_LATE", selected: false }] },
}, "accept-late");
assert.strictEqual(pending.locked, true);
assert.strictEqual(pending.pending, true);
assert.strictEqual(pending.checklist[0].selected, false, "locked plans must not be changed by requested action");

const simpleFixture = {
  recommendation: {
    actions: [
      { id: "RELEASE_PR", title: "Release PR", required: true, selected: true, owner: "Purchasing" },
      { id: "EXPEDITE_SUPPLIER", title: "Percepat supplier", required: false, selected: true, owner: "Purchasing" },
      { id: "ACCEPT_LATE", title: "Accept Late", required: false, selected: false, owner: "PPIC Approver" },
    ],
  },
};
const recoveryForm = recoveryActions.simpleFormModel(simpleFixture, "recovery");
assert.strictEqual(recoveryForm.mode, "recovery");
assert.strictEqual(recoveryForm.requiredChecks.length, 1);
assert.deepStrictEqual(recoveryForm.methods.map((row) => row.id), ["EXPEDITE_SUPPLIER"]);
assert.strictEqual(recoveryForm.selectedAction.id, "EXPEDITE_SUPPLIER");

const mergedRecovery = recoveryActions.mergeSimpleForm(recoveryForm.checklist, {
  mode: "recovery",
  methodId: "EXPEDITE_SUPPLIER",
  owner: "Purchasing Lead",
  targetDate: "2026-08-28",
  notes: "Supplier sanggup kirim lebih cepat",
  evidenceReference: "EMAIL-001",
});
assert.strictEqual(mergedRecovery.find((row) => row.id === "RELEASE_PR").selected, true, "required system checks must be retained");
assert.strictEqual(mergedRecovery.find((row) => row.id === "RELEASE_PR").owner, "Purchasing", "an existing explicit checklist PIC must be preserved");
assert.strictEqual(mergedRecovery.find((row) => row.id === "EXPEDITE_SUPPLIER").owner, "Purchasing Lead");
assert.strictEqual(mergedRecovery.find((row) => row.id === "ACCEPT_LATE").selected, false);

const forceChecklist = [
  { id: "RELEASE_PR_PO", title: "Release PR/PO", required: true, selected: true, owner: null, targetDate: "2026-08-23" },
  { id: "SUPPLIER_COMMITMENT", title: "Supplier commitment", required: true, selected: true, owner: null, targetDate: "2026-08-23" },
  { id: "RUN_CAPACITY_SIMULATION", title: "Capacity simulation", required: true, selected: true, owner: null, targetDate: "2026-08-23" },
  { id: "VENDOR_SLOT_COMMITMENT", title: "Vendor slot", required: true, selected: true, owner: null, targetDate: "2026-08-23" },
  { id: "DAILY_CONTROL", title: "Daily control", required: true, selected: true, owner: null, targetDate: "2026-09-05" },
  { id: "FORCE_WITH_REASON", title: "Force", required: false, selected: false, owner: null, targetDate: "2026-08-23" },
];
const mergedForce = recoveryActions.mergeSimpleForm(forceChecklist, {
  mode: "recovery",
  methodId: "FORCE_WITH_REASON",
  owner: "PPIC Lead",
  targetDate: "2026-08-23",
  notes: "Force disetujui karena komitmen vendor sudah tersedia",
  evidenceReference: "APPROVAL-001",
});
assert.deepStrictEqual(
  mergedForce.filter((row) => row.required).map((row) => row.owner),
  Array(5).fill("PPIC Lead"),
  "Force must assign the visible PIC to every hidden required checklist item",
);
assert.strictEqual(mergedForce.find((row) => row.id === "FORCE_WITH_REASON").selected, true);
assert.strictEqual(mergedForce.find((row) => row.id === "FORCE_WITH_REASON").notes, "Force disetujui karena komitmen vendor sudah tersedia");

const lateForm = recoveryActions.simpleFormModel(simpleFixture, "accept-late");
assert.strictEqual(lateForm.mode, "accept-late");
assert.strictEqual(lateForm.selectedAction.id, "ACCEPT_LATE");
const mergedLate = recoveryActions.mergeSimpleForm(lateForm.checklist, {
  mode: "accept-late",
  targetDate: "2026-09-08",
  notes: "Customer menyetujui tanggal baru",
});
assert.strictEqual(mergedLate.find((row) => row.id === "RELEASE_PR").selected, true);
assert.strictEqual(mergedLate.find((row) => row.id === "EXPEDITE_SUPPLIER").selected, false);
assert.strictEqual(mergedLate.find((row) => row.id === "ACCEPT_LATE").selected, true);
assert.strictEqual(mergedLate.find((row) => row.id === "ACCEPT_LATE").targetDate, "2026-09-08");

["save", "submit", "revise", "approve", "reject"].forEach((command) => {
  assert.strictEqual(recoveryActions.shouldRefreshDeliveryAfterCommand(command), true, `${command} must refresh the MPS delivery snapshot`);
});
assert.strictEqual(recoveryActions.shouldRefreshDeliveryAfterCommand("load"), false);

console.log("MPS in-page recovery action contracts: OK");
