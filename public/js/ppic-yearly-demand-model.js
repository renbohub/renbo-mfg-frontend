(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicYearlyDemandModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const number = (value) => (Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0);

  function monthColumns(metric = {}) {
    if (!metric.lock?.locked) return [
      { key: "fcc", label: "FCT" },
      { key: "po", label: "PO" },
      { key: "efd", label: "EFD" },
    ];
    return [
      { key: "fcc", label: "FCT" },
      { key: "po", label: "PO" },
      { key: "lockedEfd", label: "EFD 🔒" },
      { key: "additional", label: "ADD" },
      { key: "current", label: "CURRENT" },
    ];
  }

  function displayMetricValue(metric = {}, key) {
    if (key === "lockedEfd") return number(metric.lock?.lockedEfd);
    if (key === "additional") return number(metric.additional?.qty);
    if (key === "current") return number(metric.currentQty ?? metric.po);
    return number(metric[key]);
  }

  function coverageStatus(metric = {}) {
    if (!metric.lock?.locked) return { key: "UNLOCKED", label: "Belum dikunci" };
    const additional = number(metric.additional?.qty);
    const pending = number(metric.additional?.pendingDeltaQty);
    if (additional <= 0) {
      const reduction = number(metric.additional?.reductionQty);
      return reduction > 0
        ? { key: "REDUCTION_EXCEPTION", label: `${reduction} potensi pengurangan` }
        : { key: "NO_ADDITIONAL", label: "Tidak ada tambahan" };
    }
    if (pending <= 0) return { key: "COVERED", label: "Tercover" };
    return { key: "UNCOVERED", label: `${pending} belum tercover` };
  }

  function baselineLinks(metric = {}) {
    if (!metric.lock?.locked) return [];
    const links = [];
    for (const number of metric.lock.baselineMpsNumbers || []) links.push({
      type: "MPS",
      number,
      href: `/modules/planning-ppic/mps/${encodeURIComponent(number)}`,
    });
    for (const number of metric.lock.baselineMrpNumbers || []) links.push({
      type: "MRP",
      number,
      href: `/modules/planning-ppic/mrp/${encodeURIComponent(number)}`,
    });
    return links;
  }

  return { monthColumns, displayMetricValue, coverageStatus, baselineLinks };
}));
