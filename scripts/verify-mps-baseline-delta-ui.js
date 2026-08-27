const assert = require("node:assert/strict");
const {
  totalPlanQty,
  baselineActions,
  deltaActionState,
} = require("../public/js/ppic-mps-baseline-delta-model");

function run() {
  assert.equal(totalPlanQty({ baselineMpsQty: 100, deltaMpsQty: 25, approvedCutQty: 10 }), 115);
  assert.equal(totalPlanQty({ baselineMpsQty: 10, deltaMpsQty: 0, approvedCutQty: 20 }), 0, "consolidated plan cannot be negative");

  assert.deepEqual(baselineActions({ locked: false, hasDraftMps: true }), {
    canPreview: true,
    canGenerate: true,
    label: "Generate Baseline",
  });
  assert.deepEqual(baselineActions({ locked: true, hasDraftMps: true }), {
    canPreview: true,
    canGenerate: false,
    label: "Baseline Locked",
  });

  assert.deepEqual(deltaActionState({ pendingDeltaQty: 0, locked: true }), { canPreview: true, canGenerate: false });
  assert.deepEqual(deltaActionState({ pendingDeltaQty: 12, locked: true }), { canPreview: true, canGenerate: true });
  assert.deepEqual(deltaActionState({ pendingDeltaQty: 12, locked: false }), { canPreview: false, canGenerate: false });

  console.log("PASS verify-mps-baseline-delta-ui: consolidated planning actions verified");
}

run();
