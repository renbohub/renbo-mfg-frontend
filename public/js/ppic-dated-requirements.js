(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicDatedRequirements = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function dateKey(value) {
    if (!value || (value instanceof Date && !Number.isFinite(value.getTime()))) return null;
    const key = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const date = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : null;
  }
  const requiredDate = (row) => dateKey(row.materialRequiredDate || row.requiredDate);
  function status(items, { today, acceptedTargets = new Set(), warningDays = 7 } = {}) {
    const open = items.filter((row) => Number(row.netRequirement) > 0);
    if (!open.length) return { key: "COVERED", label: "Terpenuhi", tone: "covered" };
    if (open.some((row) => !requiredDate(row))) return { key: "UNDATED", label: "Belum ada estimasi tanggal", tone: "warning" };
    const anchor = dateKey(today);
    if (!anchor) return { key: "UNDATED", label: "Tanggal acuan belum tersedia", tone: "warning" };
    const late = open.filter((row) => requiredDate(row) < anchor);
    if (late.length) {
      const handled = late.every((row) => {
        const ids = (row._demandSources || row.customerPegging || []).map((source) => source.deliveryTargetId).filter(Boolean);
        return ids.length > 0 && ids.every((id) => acceptedTargets.has(id));
      });
      return handled ? { key: "ACCEPT_LATE", label: "Keterlambatan disetujui", tone: "accept-late" }
        : { key: "LATE", label: "Terlambat — kebutuhan belum terpenuhi", tone: "late-unhandled" };
    }
    const limit = new Date(`${anchor}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + warningDays);
    return open.some((row) => requiredDate(row) <= dateKey(limit))
      ? { key: "WARNING", label: `Kebutuhan dalam ${warningDays} hari`, tone: "warning" }
      : { key: "GREEN", label: `Kebutuhan lebih dari ${warningDays} hari`, tone: "on-track" };
  }
  return { dateKey, requiredDate, status };
}));
