"use strict";

const assert = require("node:assert/strict");
const { buildWeeklyBuckets, splitRequirementQty } = require("../public/js/ppic-mrp-weekly-delta-model");

function run() {
  const model = buildWeeklyBuckets("2026-09-01");
  const current = model.groups.find((group) => group.offset === 0);
  assert.deepEqual(current.buckets.map((row) => row.key), ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
  assert.deepEqual(current.buckets.map((row) => row.week), [1, 2, 3, 4], "week number resets at the start of each month");
  assert.deepEqual(splitRequirementQty(25, "BASELINE"), { baselineQty: 25, additionalQty: 0, totalQty: 25 });
  assert.deepEqual(splitRequirementQty(12, "DELTA"), { baselineQty: 0, additionalQty: 12, totalQty: 12 });
  assert.deepEqual(splitRequirementQty(-4, "DELTA"), { baselineQty: 0, additionalQty: 0, totalQty: 0 });
  console.log("PASS verify-mrp-weekly-delta-ui: Saturday buckets reset monthly and split Baseline/Additional");
}

run();
