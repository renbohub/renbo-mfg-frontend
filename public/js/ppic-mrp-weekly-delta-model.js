(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpWeeklyDeltaModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const number = (value) => (Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0);
  const addDays = (value, days) => { const date = new Date(value); date.setUTCDate(date.getUTCDate() + days); return date; };
  const addMonths = (value, months) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  const key = (value) => new Date(value).toISOString().slice(0, 10);

  function buildWeeklyBuckets(planningMonth) {
    const parsed = new Date(planningMonth);
    const planning = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const groups = [-1, 0, 1].map((offset) => {
      const monthStart = addMonths(planning, offset);
      const monthEnd = addMonths(planning, offset + 1);
      const buckets = [];
      let cursor = new Date(monthStart);
      while (cursor.getUTCDay() !== 6) cursor = addDays(cursor, 1);
      let week = 1;
      while (cursor < monthEnd) {
        buckets.push({ key: key(cursor), start: new Date(cursor), end: addDays(cursor, 6), week: week++ });
        cursor = addDays(cursor, 7);
      }
      return { offset, key: key(monthStart).slice(0, 7), label: offset === -1 ? "M-1" : offset === 0 ? "M" : "M+1", monthStart, buckets };
    });
    const byKey = new Map(groups.flatMap((group) => group.buckets.map((bucket) => [bucket.key, { ...bucket, group }])));
    return { groups, byKey, flat: groups.flatMap((group) => group.buckets) };
  }

  function splitRequirementQty(qty, planKind) {
    const value = number(qty);
    const additional = String(planKind || "BASELINE").toUpperCase() === "DELTA";
    return { baselineQty: additional ? 0 : value, additionalQty: additional ? value : 0, totalQty: value };
  }

  return { buildWeeklyBuckets, splitRequirementQty };
}));
