(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMrpMaterialGroups = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const priority = { LATE: 0, ACCEPT_LATE: 1, WARNING: 2, GREEN: 3, COVERED: 4 };
  const worst = (states) => states.filter(Boolean).sort((a, b) => (priority[a.key] ?? 9) - (priority[b.key] ?? 9))[0];
  function groupMaterials(rows, { supplyKey, summarizeCurrentStock }) {
    const groups = new Map();
    for (const row of rows) {
      // Never combine different units or customer-owned supply pools.
      const key = JSON.stringify([row.materialCode, row.uom, supplyKey(row), row._materialCategory || "UNCLASSIFIED"]);
      if (!groups.has(key)) groups.set(key, {
        ...row, _id: `material:${key}`, children: [], cells: new Map(),
        officialTotal: 0, lookaheadTotal: 0, total: 0, hasLookahead: false,
      });
      const group = groups.get(key);
      group.children.push(row);
      group.officialTotal += row.officialTotal;
      group.lookaheadTotal += row.lookaheadTotal;
      group.hasLookahead ||= row.hasLookahead;
      for (const [bucketKey, source] of row.cells) {
        if (!group.cells.has(bucketKey)) group.cells.set(bucketKey, {
          bucket: source.bucket, qty: 0, rawQty: 0, officialQty: 0, baselineQty: 0,
          additionalQty: 0, lookaheadQty: 0, hasLookahead: false, items: [],
        });
        const cell = group.cells.get(bucketKey);
        for (const field of ["qty", "rawQty", "officialQty", "baselineQty", "additionalQty", "lookaheadQty"]) cell[field] += Number(source[field]) || 0;
        cell.hasLookahead ||= source.hasLookahead;
        cell.items.push(...source.items);
        cell.status = worst([cell.status, source.status]);
      }
    }
    return [...groups.values()].map((group) => {
      group.children.sort((a, b) => a.fgLabel.localeCompare(b.fgLabel) || a.identificationCode.localeCompare(b.identificationCode) || a.process.localeCompare(b.process));
      group.total = group.officialTotal;
      group._state = worst(group.children.map((row) => row._state));
      group.materialPartNumbers = [...new Set(group.children.flatMap((row) => row.materialPartNumbers || []).map((value) => String(value).trim()).filter(Boolean))].sort();
      group._search = group.children.map((row) => row._search).join(" ").toLowerCase();
      group.fgLabel = `${new Set(group.children.map((row) => row.fgCode)).size} FG`;
      group.fgName = "Semua part pemakai";
      group.identificationCode = `${group.children.length} pemakaian`;
      group.process = "Semua proses";
      group.currentStock = summarizeCurrentStock([...group.cells.values()].flatMap((cell) => cell.items));
      return group;
    }).sort((a, b) => a.materialCode.localeCompare(b.materialCode) || a.uom.localeCompare(b.uom) || a._id.localeCompare(b._id));
  }
  return { groupMaterials };
}));
