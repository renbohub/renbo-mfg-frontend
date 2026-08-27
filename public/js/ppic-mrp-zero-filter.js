(function attachPpicMrpZeroFilter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpZeroFilter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPpicMrpZeroFilter() {
  "use strict";

  const ZERO_TOLERANCE = 0.000001;

  function qty(value) {
    return Number.isFinite(Number(value)) ? Math.abs(Number(value)) : 0;
  }

  function shouldHideZeroMatrixRow(row = {}, enabled = false) {
    if (!enabled) return false;
    return qty(row.officialTotal) <= ZERO_TOLERANCE
      && qty(row.lookaheadTotal) <= ZERO_TOLERANCE;
  }

  return { shouldHideZeroMatrixRow };
});
