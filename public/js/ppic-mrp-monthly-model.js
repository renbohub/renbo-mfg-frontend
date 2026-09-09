(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpMonthlyModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function availableRuns(rows = []) {
    const runs = new Map();
    for (const row of rows) {
      if (!row.runNumber || row.scenarioAssumptions?.planningMode === "M_PLUS_ONE_PREVIEW") continue;
      runs.set(row.runNumber, row);
    }
    for (const row of runs.values()) {
      if (row.approvedRunNumber && !runs.has(row.approvedRunNumber)) runs.set(row.approvedRunNumber, {
        ...row, runNumber: row.approvedRunNumber, planRevision: row.approvedPlanRevision,
        presentationStatus: "APPROVED", _approvedAlternative: true,
      });
    }
    return [...runs.values()].sort((a, b) => Number(a.executionScope === "LINKED_SOURCE") - Number(b.executionScope === "LINKED_SOURCE")
      || Number(a.presentationStatus === "FAILED") - Number(b.presentationStatus === "FAILED")
      || Number(Boolean(a._approvedAlternative)) - Number(Boolean(b._approvedAlternative))
      || Number(b.planRevision || 0) - Number(a.planRevision || 0)
      || a.runNumber.localeCompare(b.runNumber));
  }
  function selectRun(rows, requested) {
    return (requested ? rows.find((row) => row.runNumber === requested) : rows[0]) || null;
  }
  return { availableRuns, selectRun };
}));
