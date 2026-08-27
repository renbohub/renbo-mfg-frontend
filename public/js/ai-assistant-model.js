(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ERP_AI_ASSISTANT_MODEL = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalizeRequestState(row = {}) {
    const status = String(row.status || "").toUpperCase();
    return {
      ...row,
      status,
      busy: ["QUEUED", "RUNNING"].includes(status),
      terminal: ["COMPLETED", "FAILED", "CANCELLED"].includes(status),
    };
  }

  function nextPollDelay(attempt) {
    return attempt < 3 ? 700 : attempt < 8 ? 1400 : 2500;
  }

  function renderSourceLabel(source = {}) {
    return [source.entityType, source.label || source.entityId].filter(Boolean).join(" · ") || "Sumber ERP";
  }

  function safeSourceHref(value) {
    const href = String(value || "").trim();
    if (!href.startsWith("/") || href.startsWith("//") || /[\u0000-\u001f]/.test(href)) return "#";
    return href;
  }

  return { normalizeRequestState, nextPollDelay, renderSourceLabel, safeSourceHref };
});
