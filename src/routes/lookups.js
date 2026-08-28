const express = require("express");
const { getLookupSource } = require("../lookupRegistry");

const router = express.Router();
const defaultBackendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

function nestedValue(object, fieldPath) {
  return String(fieldPath || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object);
}

function firstValue(object, keys) {
  for (const key of keys || []) {
    const value = nestedValue(object, key);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function selectedData(record, keys) {
  const data = {};
  (keys || []).forEach((fieldPath) => {
    const value = nestedValue(record, fieldPath);
    if (value === undefined) return;
    const parts = String(fieldPath).split(".");
    let target = data;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) target[part] = value;
      else target = target[part] ||= {};
    });
  });
  return data;
}

function rowsFromPayload(payload, resultPaths) {
  if (Array.isArray(payload)) return payload;
  for (const resultPath of resultPaths || []) {
    const rows = nestedValue(payload, resultPath);
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

function totalFromPayload(payload, fallback) {
  const candidates = [payload?.total, payload?.recordsTotal, payload?.pagination?.total, payload?.meta?.total, payload?.count];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value === undefined ? fallback : Number(value);
}

function activeValue(record, activeKey) {
  const value = nestedValue(record, activeKey);
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  return !["inactive", "disabled", "archived", "retired", "false", "0"].includes(String(value).trim().toLowerCase());
}

function normalizeLookupPayload(payload, config, page = 1, pageSize = 25) {
  const rows = rowsFromPayload(payload, config.resultPaths);
  const results = rows.map((record) => {
    const id = nestedValue(record, config.valueKey);
    const code = String(firstValue(record, config.codeKeys) || "").trim();
    const name = String(firstValue(record, config.nameKeys) || "").trim();
    const meta = String(firstValue(record, config.metaKeys) || "").trim();
    const data = selectedData(record, config.dataKeys);
    return {
      id: String(id ?? ""),
      text: [code, name].filter(Boolean).join(" · ") || "Referensi tersimpan",
      code,
      name,
      meta,
      active: activeValue(record, config.activeKey),
      ...(Object.keys(data).length ? { data } : {})
    };
  }).filter((item) => item.id);
  const total = totalFromPayload(payload, results.length);
  return { results, pagination: { more: Number(page) * Number(pageSize) < total } };
}

function recordFromPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) return payload.data;
  if (payload.item && typeof payload.item === "object" && !Array.isArray(payload.item)) return payload.item;
  if (payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)) return payload.result;
  return payload;
}

async function readBackend(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function forwardedHeaders(req) {
  const headers = {};
  ["authorization", "x-page-module", "x-page-code", "x-page-record"].forEach((name) => {
    const value = req.get?.(name);
    if (value) headers[name] = value;
  });
  return headers;
}

function createLookupHandler({ fetchImpl = global.fetch, backendUrl = defaultBackendUrl } = {}) {
  return async function lookupHandler(req, res) {
    const config = getLookupSource(req.params.source);
    if (!config) return res.status(404).json({ code: "LOOKUP_SOURCE_NOT_FOUND", message: "Sumber lookup tidak tersedia." });

    const allowedQuery = new Set([...Object.keys(config.queryMap), ...Object.keys(config.allowedParents)]);
    const unsupported = Object.keys(req.query || {}).filter((key) => !allowedQuery.has(key));
    if (unsupported.length) return res.status(400).json({ code: "LOOKUP_QUERY_NOT_ALLOWED", message: `Filter lookup tidak diizinkan: ${unsupported.join(", ")}.` });

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const url = new URL(`${backendUrl}${config.endpoint}`);
    Object.entries(config.queryMap).forEach(([incoming, outgoing]) => {
      let value = req.query[incoming];
      if (incoming === "page") value = page;
      if (incoming === "pageSize") value = pageSize;
      if (value !== undefined && value !== "") url.searchParams.set(outgoing, String(value));
    });
    Object.entries(config.allowedParents).forEach(([incoming, outgoing]) => {
      const value = req.query[incoming];
      if (value !== undefined && value !== "") url.searchParams.set(outgoing, String(value));
    });

    try {
      const response = await fetchImpl(url, { headers: forwardedHeaders(req), signal: AbortSignal.timeout(15000) });
      const payload = await readBackend(response);
      if (!response.ok) return res.status(response.status).json({ code: payload.code, message: payload.message || `Backend merespons ${response.status}.`, errors: payload.errors });
      return res.json(normalizeLookupPayload(payload, config, page, pageSize));
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      return res.status(timedOut ? 504 : 503).json({ code: timedOut ? "LOOKUP_TIMEOUT" : "LOOKUP_UNAVAILABLE", message: timedOut ? "Pencarian lookup melewati batas waktu." : "Data lookup belum dapat dimuat." });
    }
  };
}

function createLookupResolveHandler({ fetchImpl = global.fetch, backendUrl = defaultBackendUrl } = {}) {
  return async function lookupResolveHandler(req, res) {
    const config = getLookupSource(req.params.source);
    if (!config) return res.status(404).json({ code: "LOOKUP_SOURCE_NOT_FOUND", message: "Sumber lookup tidak tersedia." });
    try {
      let response = await fetchImpl(`${backendUrl}${config.endpoint}/${encodeURIComponent(req.params.value)}`, {
        headers: forwardedHeaders(req), signal: AbortSignal.timeout(15000)
      });
      let payload = await readBackend(response);
      let record = response.ok ? recordFromPayload(payload) : null;
      if (!record) {
        const url = new URL(`${backendUrl}${config.endpoint}`);
        url.searchParams.set("q", String(req.params.value));
        url.searchParams.set("search", String(req.params.value));
        url.searchParams.set("page", "1");
        url.searchParams.set("limit", "100");
        response = await fetchImpl(url, { headers: forwardedHeaders(req), signal: AbortSignal.timeout(15000) });
        payload = await readBackend(response);
        if (!response.ok) return res.status(response.status).json({ code: payload.code, message: payload.message || "Referensi lookup tidak ditemukan." });
        const expected = String(req.params.value);
        record = rowsFromPayload(payload, config.resultPaths).find((row) => String(nestedValue(row, config.valueKey) ?? "") === expected) || null;
      }
      const normalized = normalizeLookupPayload(record ? [record] : [], config, 1, 1).results[0];
      if (!normalized) return res.status(404).json({ code: "LOOKUP_VALUE_NOT_FOUND", message: "Referensi lookup tidak ditemukan." });
      return res.json({ result: normalized });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      return res.status(timedOut ? 504 : 503).json({ code: timedOut ? "LOOKUP_TIMEOUT" : "LOOKUP_UNAVAILABLE", message: timedOut ? "Pencarian lookup melewati batas waktu." : "Data lookup belum dapat dimuat." });
    }
  };
}

router.get("/:source/resolve/:value", createLookupResolveHandler());
router.get("/:source", createLookupHandler());

module.exports = router;
module.exports.normalizeLookupPayload = normalizeLookupPayload;
module.exports.createLookupHandler = createLookupHandler;
module.exports.createLookupResolveHandler = createLookupResolveHandler;
