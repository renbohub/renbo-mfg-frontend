(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpNettingSummary = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function summarize(items, isLookahead) {
    const result = { official: { count: 0, gross: 0, covered: 0, net: 0, complete: true }, preview: { count: 0, gross: 0, covered: 0, net: 0, complete: true } };
    for (const item of items) {
      const preview = isLookahead(item);
      const group = preview ? result.preview : result.official;
      group.count++;
      const grossValue = preview ? item.mPlusOneDeliveryRequirementQty ?? item.grossRequirement : item.grossRequirement;
      const netValue = preview ? item.mPlusOneActualNetPurchaseQty ?? item.netRequirement : item.netRequirement;
      if (grossValue == null || netValue == null || !Number.isFinite(Number(grossValue)) || !Number.isFinite(Number(netValue))) { group.complete = false; continue; }
      const gross = Math.max(Number(grossValue), 0), net = Math.max(Number(netValue), 0);
      group.gross += gross;
      group.net += net;
      // These are allocations in this run, NOT repeated physical stock snapshots.
      group.covered += Math.max(gross - net, 0);
    }
    return result;
  }
  function includeRequirement(netQty, grossQty, showCovered) {
    return Number(netQty) > .000001 || (showCovered && Number(grossQty) > .000001);
  }
  return { summarize, includeRequirement };
}));
