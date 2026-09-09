"use strict";
const assert = require("node:assert/strict");
const { summarize, includeRequirement } = require("../public/js/ppic-mrp-netting-summary");
const preview = (row) => Boolean(row.preview);
const rows = [
  { grossRequirement: 100, netRequirement: 20, onHandQty: 100 },
  { grossRequirement: 40, netRequirement: 0, onHandQty: 100 },
  { preview: true, grossRequirement: 70, netRequirement: 30 },
];
const result = summarize(rows, preview);
assert.deepEqual(result.official, { count: 2, gross: 140, covered: 120, net: 20, complete: true });
assert.deepEqual(result.preview, { count: 1, gross: 70, covered: 40, net: 30, complete: true });
assert.equal(summarize([{ grossRequirement: 100 }], preview).official.complete, false);
assert.equal(summarize([{ grossRequirement: "bad", netRequirement: 0 }], preview).official.complete, false);
assert.equal(summarize([{ grossRequirement: 0, netRequirement: 0 }], preview).official.complete, true);
assert.equal(summarize([{ preview: true, grossRequirement: 999, netRequirement: 999, mPlusOneDeliveryRequirementQty: 50, mPlusOneActualNetPurchaseQty: 10 }], preview).preview.net, 10);
assert.equal(includeRequirement(0, 100, false), false);
assert.equal(includeRequirement(0, 100, true), true, "covered material can be shown without inventing buy qty");
assert.equal(includeRequirement(5, 100, false), true);
assert.equal(includeRequirement(0, 0, true), false, "do not create rows with no requirement");
const covered = summarize([{ materialSupplyType: "CUSTOMER_SUPPLIED", grossRequirement: 12, netRequirement: 0 }], preview);
assert.equal(covered.official.covered, 12);
console.log("PASS compact MRP netting: snapshot coverage, missing data, preview separation and covered visibility");
