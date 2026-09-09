(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HomeTaskModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const kinds = ["approval", "recovery", "comment", "notification"];
  const labels = { approval: "Persetujuan", recovery: "Tindak lanjut", comment: "Komentar", notification: "Notifikasi" };
  const key = (item) => `${item.kind}:${item.id}`;
  const overdue = (item, today) => Boolean(item.dueDate && String(item.dueDate).slice(0, 10) < today);
  function select(items, { filter = "all", query = "", sort = "priority", today = "" } = {}) {
    const q = query.trim().toLocaleLowerCase("id");
    const rank = (item) => overdue(item, today) ? -1 : kinds.indexOf(item.kind);
    const stamp = (item) => Number.isFinite(Date.parse(item.date)) ? Date.parse(item.date) : 0;
    return items.filter((item) => (filter === "all" || item.kind === filter) && (!q || [item.title, item.description, item.actor, item.reference, labels[item.kind]].join(" ").toLocaleLowerCase("id").includes(q)))
      .sort((a, b) => sort === "priority" ? rank(a) - rank(b) || stamp(a) - stamp(b) : sort === "oldest" ? stamp(a) - stamp(b) : stamp(b) - stamp(a));
  }
  function safeUrl(value) { return typeof value === "string" && /^\/(modules|master-data)(\/|\?|$)/.test(value) && !/[\\\r\n]/.test(value) ? value : null; }
  return { kinds, labels, key, overdue, select, safeUrl };
});
