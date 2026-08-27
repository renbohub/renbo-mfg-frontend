const assert = require("node:assert/strict");
const {
  monthColumns,
  displayMetricValue,
  coverageStatus,
  baselineLinks,
} = require("../public/js/ppic-yearly-demand-model");

function run() {
  const unlocked = { fcc: 50, po: 40, efd: 50, lock: { locked: false } };
  assert.deepEqual(monthColumns(unlocked).map((column) => column.key), ["fcc", "po", "efd"]);

  const locked = {
    fcc: 100,
    po: 130,
    efd: 130,
    currentQty: 130,
    lock: { locked: true, lockedEfd: 100, baselineMpsNumbers: ["MPS-202609-B001"], baselineMrpNumbers: ["MRP-202609-B001"] },
    additional: { qty: 30, coveredFgStockQty: 5, coveredFirmReceiptQty: 10, generatedDeltaQty: 7, pendingDeltaQty: 8, uncoveredQty: 8 },
  };
  assert.deepEqual(monthColumns(locked).map((column) => column.key), ["fcc", "po", "lockedEfd", "additional", "current"]);
  assert.equal(displayMetricValue(locked, "lockedEfd"), 100, "locked column never shows recalculated live EFD");
  assert.equal(displayMetricValue(locked, "additional"), 30);
  assert.equal(displayMetricValue(locked, "current"), 130);
  assert.deepEqual(coverageStatus(locked), { key: "UNCOVERED", label: "8 belum tercover" });
  assert.deepEqual(
    baselineLinks(locked),
    [
      { type: "MPS", number: "MPS-202609-B001", href: "/modules/planning-ppic/mps/MPS-202609-B001" },
      { type: "MRP", number: "MRP-202609-B001", href: "/modules/planning-ppic/mrp/MRP-202609-B001" },
    ],
  );

  const fullyCovered = { ...locked, additional: { ...locked.additional, pendingDeltaQty: 0, uncoveredQty: 0 } };
  assert.deepEqual(coverageStatus(fullyCovered), { key: "COVERED", label: "Tercover" });

  console.log("PASS verify-yearly-demand-lock-ui: locked month presentation verified");
}

run();
