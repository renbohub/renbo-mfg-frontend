(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMpsBaselineDeltaModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const number = (value) => (Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0);
  const rounded = (value) => Math.round((number(value) + Number.EPSILON) * 1000000) / 1000000;

  function totalPlanQty({ baselineMpsQty, deltaMpsQty, approvedCutQty }) {
    return rounded(Math.max(number(baselineMpsQty) + number(deltaMpsQty) - number(approvedCutQty), 0));
  }

  function baselineActions({ locked, hasDraftMps }) {
    return {
      canPreview: Boolean(hasDraftMps),
      canGenerate: Boolean(hasDraftMps && !locked),
      label: locked ? "Baseline Locked" : "Generate Baseline",
    };
  }

  function deltaActionState({ pendingDeltaQty, locked }) {
    return {
      canPreview: Boolean(locked),
      canGenerate: Boolean(locked && number(pendingDeltaQty) > 0),
    };
  }

  return { totalPlanQty, baselineActions, deltaActionState };
}));
