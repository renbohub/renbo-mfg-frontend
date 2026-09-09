"use strict";

const assert = require("node:assert/strict");
const { buildWeeklyBuckets, splitRequirementQty } = require("../public/js/ppic-mrp-weekly-delta-model");

function run() {
  const model = buildWeeklyBuckets("2026-09-01");
  const current = model.groups.find((group) => group.offset === 0);
  assert.deepEqual(current.buckets.map((row) => row.key), ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  assert.deepEqual(current.buckets.map((row) => row.week), [1, 2, 3, 4], "week number resets at the start of each month");
  assert.deepEqual(splitRequirementQty(25, "BASELINE"), { baselineQty: 25, additionalQty: 0, totalQty: 25 });
  assert.deepEqual(splitRequirementQty(12, "DELTA"), { baselineQty: 0, additionalQty: 12, totalQty: 12 });
  assert.deepEqual(splitRequirementQty(-4, "DELTA"), { baselineQty: 0, additionalQty: 0, totalQty: 0 });
  const full = buildWeeklyBuckets("2026-09-01", ["2026-06-01", "2027-01-31"]);
  assert(full.byKey.has("2026-06-01")); assert(full.byKey.has("2027-01-25"));
  assert(model.byKey.has("2026-08-31"), "first days of September must not disappear");
  assert.equal(full.flat.length, new Set(full.flat.map((row) => row.key)).size);
  for (const bucket of full.flat) { assert.equal(bucket.start.getUTCDay(), 1); assert.equal(bucket.end.getUTCDay(), 0); }
  console.log("PASS verify-mrp-weekly-delta-ui: Monday–Sunday buckets cover the complete horizon without duplicates and split Baseline/Additional");
}

run();
