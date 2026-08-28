(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EnterpriseLookupModel = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeQuery(value) {
    return text(value).replace(/\s+/g, " ");
  }

  function isInternalId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
  }

  function composeLabel(option = {}, { includeMeta = false } = {}) {
    const code = text(option.code);
    const name = text(option.name);
    const supplied = text(option.text);
    const base = [code, name].filter(Boolean).join(" · ") || supplied;
    const parts = [base];
    if (includeMeta && text(option.meta)) parts.push(text(option.meta));
    if (option.active === false && !/tidak aktif/i.test(base)) parts.push("Tidak aktif");
    return parts.filter(Boolean).join(" · ");
  }

  function normalizeResponse(payload = {}) {
    const rows = Array.isArray(payload.results) ? payload.results : [];
    return {
      results: rows.map((row) => ({
        id: text(row.id),
        text: composeLabel(row),
        code: text(row.code),
        name: text(row.name),
        meta: text(row.meta),
        active: row.active !== false,
        ...(row.data && typeof row.data === "object" ? { data: row.data } : {})
      })).filter((row) => row.id),
      pagination: { more: Boolean(payload.pagination?.more) }
    };
  }

  function currentOption(dataset = {}) {
    const id = text(dataset.currentId);
    if (!id) return null;
    const active = String(dataset.currentActive ?? "true").toLowerCase() !== "false";
    const suppliedText = text(dataset.currentText) || (isInternalId(id) ? "Referensi tersimpan" : id);
    return {
      id,
      text: active || /tidak aktif/i.test(suppliedText) ? suppliedText : `${suppliedText} · Tidak aktif`,
      active,
      current: true
    };
  }

  function isDependencyReady(value) {
    if (Array.isArray(value)) return value.some((item) => text(item));
    return Boolean(text(value));
  }

  function isResolvedValue(value, optionValues) {
    const expected = Array.isArray(value) ? value.map(text).filter(Boolean) : [text(value)].filter(Boolean);
    if (!expected.length) return true;
    const available = new Set((optionValues || []).map(text));
    return expected.every((item) => available.has(item));
  }

  return { normalizeResponse, composeLabel, currentOption, normalizeQuery, isDependencyReady, isResolvedValue };
});
