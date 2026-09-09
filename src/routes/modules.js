const { businessNow } = require("../businessClock");
const express = require("express");
const { randomUUID } = require("node:crypto");
const { modules, getModule, getPage } = require("../moduleRegistry");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");
const MONTHLY_PLAN_CREATE_TIMEOUT_MS = 120000;

function common(activeModule = "") {
  return { requiresAuth: true, modules, activeModule, socketUrl: process.env.SOCKET_URL || "http://localhost:5017", mqttUrl: process.env.MQTT_URL || "" };
}
function jakartaDateKey(value = businessNow()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function jakartaMonthKey(value = businessNow()) { return jakartaDateKey(value).slice(0, 7); }
function addMonthKey(month, offset) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}
function authHeader(req) {
  const headers = {};
  ["authorization", "x-page-module", "x-page-code", "x-page-record"].forEach((name) => {
    const value = req.get(name);
    if (value) headers[name] = value;
  });
  return headers;
}
router.use(require("./step1-proxy")({ backendUrl, authHeader, common, getModule, getPage }));
function findConfig(req, res) {
  const module = getModule(req.params.module);
  const page = getPage(req.params.module, req.params.page);
  if (!module || !page) { res.status(404).json({ message: "Menu modul tidak ditemukan." }); return null; }
  return { module, page };
}
async function readBackend(response) { const value = await response.text(); if (!value) return {}; try { return JSON.parse(value); } catch { return { message: value }; } }
function backendErrorChain(error, seen = new Set()) {
  if (!error || typeof error !== "object" || seen.has(error)) return [];
  seen.add(error);
  return [error, ...backendErrorChain(error.cause, seen),
    ...(Array.isArray(error.errors) ? error.errors.flatMap((child) => backendErrorChain(child, seen)) : [])];
}
function isOffline(error) { return backendErrorChain(error).some((item) => item.code === "ECONNREFUSED"); }
function isTimeout(error) {
  return backendErrorChain(error).some((item) => ["TimeoutError", "AbortError"].includes(item.name)
    || ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(item.code));
}
function nestedValue(object, path) { return String(path || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object); }
function requestedSort(query, columns = []) {
  const index = Number(query["order[0][column]"]);
  if (!Number.isInteger(index) || index < 0) return null;
  const requestedName = String(query[`columns[${index}][name]`] || query[`columns[${index}][data]`] || "").trim();
  const configured = requestedName
    ? columns.find((column) => column.data === requestedName) || (/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*$/.test(requestedName) ? { data: requestedName } : null)
    : columns[index];
  if (!configured?.data) return null;
  return { field: configured.data, direction: query["order[0][dir]"] === "desc" ? "desc" : "asc" };
}
function sortRows(rows, sort) {
  if (!sort) return rows;
  const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
  const normalized = (value) => {
    if (value == null) return { empty: true, value: "" };
    if (typeof value === "number" || typeof value === "boolean") return { empty: false, value };
    const text = String(value).trim();
    const numeric = Number(text.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    if (text && Number.isFinite(numeric) && /\d/.test(text) && !/[A-Za-z]/.test(text)) return { empty: false, value: numeric };
    return { empty: !text, value: text };
  };
  return [...rows].sort((left, right) => {
    const a = normalized(nestedValue(left, sort.field));
    const b = normalized(nestedValue(right, sort.field));
    if (a.empty !== b.empty) return a.empty ? 1 : -1;
    const result = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : collator.compare(String(a.value), String(b.value));
    return sort.direction === "desc" ? -result : result;
  });
}

async function proxyBomMutation(req, res, method, suffix = "") {
  try {
    const hasBody = !["GET", "DELETE"].includes(method);
    const response = await fetch(`${backendUrl}/api/mbom/mbom${suffix}`, {
      method,
      headers: { ...authHeader(req), ...(hasBody ? { "content-type": "application/json" } : {}) },
      body: hasBody ? JSON.stringify(req.body || {}) : undefined,
      signal: AbortSignal.timeout(30000)
    });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, detail: payload.detail, errors: payload.errors });
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "BOM gagal disimpan ke backend." });
  }
}

async function proxyPageMutation(req, res, endpoint, method, suffix = "", timeoutMs = 30000) {
  const startedAt = Date.now();
  try {
    const url = new URL(`${backendUrl}${endpoint}${suffix}`);
    if (method === "GET") {
      Object.entries(req.query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== "" && !url.searchParams.has(key)) url.searchParams.set(key, String(value));
      });
    }
    const response = await fetch(url, {
      method,
      headers: { ...authHeader(req), "content-type": "application/json" },
      body: ["GET", "DELETE"].includes(method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, code: payload.code, details: payload.details, errors: payload.errors, capacity: payload.capacity });
    res.status(response.status).json(payload);
  } catch (error) {
    const errorId = randomUUID();
    const codes = [...new Set(backendErrorChain(error).map((item) => item.code).filter((code) => typeof code === "string" && /^[A-Z0-9_]+$/.test(code)))];
    // Log transport diagnostics only: never authorization, request body, or raw errors.
    console.error("[backend-proxy]", JSON.stringify({ errorId, method, endpoint, route: req.route?.path, elapsedMs: Date.now() - startedAt, timeoutMs, codes }));
    if (isTimeout(error)) {
      return res.status(504).json({ code: "BACKEND_TIMEOUT", errorId, message: `Respons backend melewati batas waktu. Status proses belum terkonfirmasi; periksa daftar atau status plan sebelum mencoba ulang. Referensi: ${errorId}` });
    }
    if (isOffline(error)) {
      return res.status(503).json({ code: "BACKEND_UNAVAILABLE", errorId, message: `Koneksi ke backend ditolak. Periksa service backend dan konfigurasi BACKEND_URL. Referensi: ${errorId}` });
    }
    const disconnected = codes.some((code) => ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(code));
    return res.status(502).json({
      code: disconnected ? "BACKEND_CONNECTION_LOST" : "BACKEND_CONNECTION_ERROR",
      errorId,
      message: `${disconnected ? "Koneksi backend terputus sebelum respons selesai." : "Respons backend tidak berhasil diterima."} Status penyimpanan belum terkonfirmasi; periksa daftar atau status plan sebelum mencoba ulang. Referensi: ${errorId}`,
    });
  }
}

router.get("/", (_req, res) => res.render("modules/index", { title: "Pilih Modul", ...common() }));

router.get("/api/sales/:page/generate-number", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "GET", "/generate-number");
});
router.get("/api/sales/sales-orders/line-preview", (req, res) => proxyReadWithQuery(req, res, "/api/sales/sales-orders/line-preview", "Preview harga dan margin gagal dimuat."));
router.get("/api/sales/sales-orders/forecast-targets", (req, res) => proxyReadWithQuery(req, res, "/api/sales/sales-orders/forecast-targets", "Target Forecast yang dapat dikonsumsi gagal dimuat."));
router.get("/api/planning-ppic/demand-planning", (req, res) => proxyReadWithQuery(req, res, "/api/planning/demand-planning", "Demand Planning gagal dimuat."));
router.get("/api/planning-ppic/demand-planning/yearly", (req, res) => proxyReadWithQuery(req, res, "/api/planning/demand-planning/yearly", "Yearly Demand gagal dimuat."));
router.get("/api/planning-ppic/demand-planning/yearly/additional-coverage", (req, res) => proxyReadWithQuery(req, res, "/api/planning/demand-planning/yearly/additional-coverage", "Coverage PO tambahan gagal dimuat."));
router.put("/api/planning-ppic/demand-planning/yearly/rule", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/yearly", "PUT", "/rule"));
router.put("/api/planning-ppic/demand-planning/yearly/efd", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/yearly", "PUT", "/efd"));
router.delete("/api/planning-ppic/demand-planning/yearly/efd", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/yearly", "DELETE", "/efd"));
router.get("/api/planning-ppic/demand-planning/monthly-review", (req, res) => proxyReadWithQuery(req, res, "/api/planning/demand-planning/monthly-review", "Monthly Demand Review gagal dimuat."));
router.post("/api/planning-ppic/demand-planning/monthly-review/snapshots", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/monthly-review", "POST", "/snapshots"));
router.post("/api/planning-ppic/demand-planning/monthly-review/snapshots/:snapshotId/refresh", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/monthly-review", "POST", `/snapshots/${encodeURIComponent(req.params.snapshotId)}/refresh`));
router.post("/api/planning-ppic/demand-planning/monthly-review/snapshots/:snapshotId/review", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/monthly-review", "POST", `/snapshots/${encodeURIComponent(req.params.snapshotId)}/review`));
router.post("/api/planning-ppic/demand-planning/monthly-review/snapshots/:snapshotId/approve", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/monthly-review", "POST", `/snapshots/${encodeURIComponent(req.params.snapshotId)}/approve`));
router.post("/api/planning-ppic/demand-planning/monthly-review/snapshots/:snapshotId/freeze", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/monthly-review", "POST", `/snapshots/${encodeURIComponent(req.params.snapshotId)}/freeze`));
router.post("/api/planning-ppic/demand-planning/monthly-review/snapshots/:snapshotId/revisions", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/monthly-review", "POST", `/snapshots/${encodeURIComponent(req.params.snapshotId)}/revisions`));
router.get("/api/planning-ppic/demand-planning/exception-workbench", (req, res) => proxyReadWithQuery(req, res, "/api/planning/demand-planning/exception-workbench", "Demand Exception Workbench gagal dimuat."));
router.post("/api/planning-ppic/demand-planning/exception-workbench/sync", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/exception-workbench", "POST", "/sync"));
router.get("/api/planning-ppic/demand-planning/exception-workbench/:exceptionId", (req, res) => proxyReadWithQuery(req, res, `/api/planning/demand-planning/exception-workbench/${encodeURIComponent(req.params.exceptionId)}`, "Detail demand exception gagal dimuat."));
router.patch("/api/planning-ppic/demand-planning/exception-workbench/:exceptionId/assignment", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/exception-workbench", "PATCH", `/${encodeURIComponent(req.params.exceptionId)}/assignment`));
router.post("/api/planning-ppic/demand-planning/exception-workbench/:exceptionId/notes", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning/exception-workbench", "POST", `/${encodeURIComponent(req.params.exceptionId)}/notes`));
router.post("/api/planning-ppic/demand-planning/exception-workbench/:exceptionId/:action", (req, res) => {
  const action = ["acknowledge", "start", "resolve", "close", "reopen"].includes(req.params.action) ? req.params.action : null;
  if (!action) return res.status(404).json({ message: "Aksi demand exception tidak tersedia." });
  return proxyPageMutation(req, res, "/api/planning/demand-planning/exception-workbench", "POST", `/${encodeURIComponent(req.params.exceptionId)}/${action}`);
});
router.post("/api/planning-ppic/demand-planning/feasibility", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "POST", "/feasibility"));
router.get("/api/planning-ppic/demand-planning/recovery-plans", (req, res) => proxyReadWithQuery(req, res, "/api/planning/demand-planning/recovery-plans", "Kanban Recovery MPS gagal dimuat."));
router.patch("/api/planning-ppic/demand-planning/recovery-plans/:planId/feedback-status", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "PATCH", `/recovery-plans/${encodeURIComponent(req.params.planId)}/feedback-status`));
router.get("/api/planning-ppic/demand-planning/:deliveryTargetId/recovery-plan", (req, res) => proxyReadWithQuery(req, res, `/api/planning/demand-planning/${encodeURIComponent(req.params.deliveryTargetId)}/recovery-plan`, "Recovery Plan gagal dimuat."));
router.put("/api/planning-ppic/demand-planning/:deliveryTargetId/recovery-plan", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "PUT", `/${encodeURIComponent(req.params.deliveryTargetId)}/recovery-plan`));
router.post("/api/planning-ppic/demand-planning/recovery-plans/bulk-accept-late", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "POST", "/recovery-plans/bulk-accept-late", 120000));
router.post("/api/planning-ppic/demand-planning/recovery-plans/:planId/submit", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "POST", `/recovery-plans/${encodeURIComponent(req.params.planId)}/submit`));
router.patch("/api/planning-ppic/demand-planning/recovery-plans/:planId/:decision", (req, res) => {
  const decision = ["approve", "reject"].includes(req.params.decision) ? req.params.decision : null;
  if (!decision) return res.status(404).json({ message: "Keputusan Recovery Plan tidak tersedia." });
  return proxyPageMutation(req, res, "/api/planning/demand-planning", "PATCH", `/recovery-plans/${encodeURIComponent(req.params.planId)}/${decision}`);
});
router.patch("/api/planning-ppic/demand-planning/:deliveryTargetId/review", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "PATCH", `/${encodeURIComponent(req.params.deliveryTargetId)}/review`));
router.post("/api/planning-ppic/demand-planning/:deliveryTargetId/simulate-impact", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "POST", `/${encodeURIComponent(req.params.deliveryTargetId)}/simulate-impact`));
router.post("/api/planning-ppic/demand-planning/:deliveryTargetId/displacement-proposals", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "POST", `/${encodeURIComponent(req.params.deliveryTargetId)}/displacement-proposals`));
router.patch("/api/planning-ppic/demand-planning/displacement-proposals/:proposalId/approve", (req, res) => proxyPageMutation(req, res, "/api/planning/demand-planning", "PATCH", `/displacement-proposals/${encodeURIComponent(req.params.proposalId)}/approve`));
router.get("/api/planning-ppic/mrp/generate-number", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "GET", "/generate-number"));
router.get("/api/planning-ppic/mps/monthly-summary", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", "/monthly-summary"));
router.get("/api/planning-ppic/mps/workbench", (req, res) => {
  const query = new URLSearchParams();
  ["month", "q", "status", "page", "pageSize", "detailId", "includeSimulation"].forEach((key) => { if (req.query[key] !== undefined && req.query[key] !== "") query.set(key, String(req.query[key])); });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return proxyPageMutation(req, res, "/api/planning/mps", "GET", `/workbench${suffix}`);
});
router.get("/api/planning-ppic/mps/workbench/lines/:lineId/feasibility", (req, res) => proxyReadWithQuery(
  req,
  res,
  `/api/planning/mps/workbench/lines/${encodeURIComponent(req.params.lineId)}/feasibility`,
  "Detail checklist kelayakan schedule gagal dimuat.",
));
router.get("/api/planning-ppic/mps/workbench/lines/:lineId/recovery-requests", (req, res) => proxyReadWithQuery(req, res, `/api/planning/mps/workbench/lines/${encodeURIComponent(req.params.lineId)}/recovery-requests`, "Recovery checklist gagal dimuat."));
router.post("/api/planning-ppic/mps/workbench/lines/:lineId/recovery-requests", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", `/workbench/lines/${encodeURIComponent(req.params.lineId)}/recovery-requests`));
router.get("/api/planning-ppic/mps/recovery-requests", (req, res) => proxyReadWithQuery(req, res, "/api/planning/mps/recovery-requests", "Inbox recovery gagal dimuat."));
router.patch("/api/planning-ppic/mps/recovery-requests/:requestId/feedback", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/recovery-requests/${encodeURIComponent(req.params.requestId)}/feedback`));
router.get("/api/planning-ppic/mps/mbom-revision-options", (req, res) => {
  const query = new URLSearchParams();
  if (req.query.months) query.set("months", String(req.query.months));
  if (req.query.planningAnchorMonth) query.set("planningAnchorMonth", String(req.query.planningAnchorMonth));
  if (req.query.selectedDeliveryTargetIds) query.set("selectedDeliveryTargetIds", String(req.query.selectedDeliveryTargetIds));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return proxyPageMutation(req, res, "/api/planning/mps", "GET", `/mbom-revision-options${suffix}`);
});
router.get("/api/planning-ppic/mrp/general-summary", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "GET", "/general-summary"));
router.get("/api/planning-ppic/capacity-planning/scenarios", (req, res) => proxyPageMutation(req, res, "/api/planning/capacity-planning", "GET", "/scenarios"));
router.put("/api/planning-ppic/capacity-planning/scenarios/:scenarioKey", (req, res) => proxyPageMutation(req, res, "/api/planning/capacity-planning", "PUT", `/scenarios/${encodeURIComponent(req.params.scenarioKey)}`));
router.get("/api/planning-ppic/capacity-planning/presets", (req, res) => proxyPageMutation(req, res, "/api/planning/capacity-planning", "GET", `/presets${req.query.month ? `?month=${encodeURIComponent(req.query.month)}` : ""}`));
router.post("/api/planning-ppic/capacity-planning/presets", (req, res) => proxyPageMutation(req, res, "/api/planning/capacity-planning", "POST", "/presets"));
router.put("/api/planning-ppic/capacity-planning/presets/:presetId", (req, res) => proxyPageMutation(req, res, "/api/planning/capacity-planning", "PUT", `/presets/${encodeURIComponent(req.params.presetId)}`));
router.get("/api/planning-ppic/capacity-planning", async (req, res) => {
  try {
    const url = new URL(`${backendUrl}/api/planning/capacity-planning`);
    Object.entries(req.query).forEach(([key, value]) => { if (value !== undefined && value !== "") url.searchParams.set(key, String(value)); });
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(30000) });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, code: payload.code });
    res.json(payload);
  } catch (error) { res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Capacity Planning gagal dimuat." }); }
});

router.get("/api/sales/forecasts/demand-summary", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "GET", "/demand-summary"));
router.get("/api/planning-ppic/consume-forecast/monthly", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "GET", "/monthly-consumption"));
router.get("/api/planning-ppic/consume-forecast/monthly/:month", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "GET", `/monthly-consumption/${encodeURIComponent(req.params.month)}`));

router.get("/api/dashboard/executive/:module", async (req, res) => {
  try {
    const url = new URL(`${backendUrl}/api/dashboard/executive/${encodeURIComponent(req.params.module)}`);
    ["year", "customerCode", "period", "actualBasis"].forEach(key => { if (req.query[key]) url.searchParams.set(key, String(req.query[key])); });
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(30000) });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.` });
    res.json(payload);
  } catch (error) {
    res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Executive dashboard gagal dimuat." });
  }
});

async function proxyReadWithQuery(req, res, endpoint, errorMessage) {
  try {
    const url = new URL(`${backendUrl}${endpoint}`);
    Object.entries(req.query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(30000) });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, code: payload.code });
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(response.status).json(payload);
  } catch (error) {
    return res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : errorMessage });
  }
}

router.get("/api/production/fg-receipts/pending", (req, res) => proxyReadWithQuery(req, res, "/api/production/quality-inspections/fg-receipts/pending", "Pending FG Receipt gagal dimuat."));
router.get("/api/production/fg-receipts/history", (req, res) => proxyReadWithQuery(req, res, "/api/production/quality-inspections/fg-receipts/history", "History FG Receipt gagal dimuat."));
router.get("/api/production/fg-receipts/history/:movementNumber", (req, res) => proxyPageMutation(req, res, "/api/production/quality-inspections/fg-receipts/history", "GET", `/${encodeURIComponent(req.params.movementNumber)}`));
router.get("/api/production/fg-receipts/warehouses", (req, res) => proxyReadWithQuery(req, res, "/api/inventory/warehouses", "Warehouse tujuan gagal dimuat."));
router.get("/api/production/fg-receipts/racks", (req, res) => proxyReadWithQuery(req, res, "/api/inventory/racks", "Rack tujuan gagal dimuat."));
router.get("/api/production/daily-production-schedules/gantt", (req, res) => proxyReadWithQuery(req, res, "/api/production/daily-production-schedules/gantt", "Weekly Gantt produksi gagal dimuat."));
router.post("/api/production/machine-availability-events", (req, res) => proxyPageMutation(req, res, "/api/production/machine-availability-events", "POST"));
router.patch("/api/production/machine-availability-events/:id/resolve", (req, res) => proxyPageMutation(req, res, "/api/production/machine-availability-events", "PATCH", `/${encodeURIComponent(req.params.id)}/resolve`));
router.get("/api/planning-ppic/daily-plan/workspace", (req, res) => proxyReadWithQuery(req, res, "/api/planning/daily-plan-revisions/workspace", "Workspace Daily Plan gagal dimuat."));
router.post("/api/planning-ppic/daily-plan/auto-correct", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "POST", "/auto-correct"));
router.post("/api/planning-ppic/daily-plan/execution-shortfalls/allocate", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "POST", "/execution-shortfalls/allocate"));
router.post("/api/planning-ppic/daily-plan/revisions", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "POST"));
router.patch("/api/planning-ppic/daily-plan/revisions/:revisionId/items/:scheduleId", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "PATCH", `/${encodeURIComponent(req.params.revisionId)}/items/${encodeURIComponent(req.params.scheduleId)}`));
router.post("/api/planning-ppic/daily-plan/revisions/:revisionId/items/:scheduleId/release", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "POST", `/${encodeURIComponent(req.params.revisionId)}/items/${encodeURIComponent(req.params.scheduleId)}/release`));
router.post("/api/planning-ppic/daily-plan/revisions/:revisionId/validate", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "POST", `/${encodeURIComponent(req.params.revisionId)}/validate`));
router.post("/api/planning-ppic/daily-plan/revisions/:revisionId/release", (req, res) => proxyPageMutation(req, res, "/api/planning/daily-plan-revisions", "POST", `/${encodeURIComponent(req.params.revisionId)}/release`));
router.get("/api/production/production-logs/hmi-reasons", (req, res) => proxyReadWithQuery(req, res, "/api/production/production-logs/hmi-reasons", "Master reason HMI gagal dimuat."));
router.get("/api/production/oee-monitoring", (req, res) => proxyReadWithQuery(req, res, "/api/production/production-reports/oee-monitoring", "Data monitoring OEE belum dapat dimuat."));
router.patch("/api/production/fg-receipts/:inspectionNumber/receive", (req, res) => proxyPageMutation(req, res, "/api/production/quality-inspections", "PATCH", `/${encodeURIComponent(req.params.inspectionNumber)}/receive-fg`));
router.patch("/api/production/fg-receipts/:movementNumber/rollback", (req, res) => proxyPageMutation(req, res, "/api/production/quality-inspections/fg-receipts", "PATCH", `/${encodeURIComponent(req.params.movementNumber)}/rollback`));

router.get("/api/purchasing-po/:key/pdf", async (req, res) => {
  try {
    const response = await fetch(`${backendUrl}/api/purchasing/purchase-order/${encodeURIComponent(req.params.key)}/pdf`, {
      headers: authHeader(req),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const payload = await readBackend(response);
      return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.` });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": response.headers.get("content-disposition") || `attachment; filename="purchase-order.pdf"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    });
    return res.send(buffer);
  } catch (error) {
    return res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "PDF Purchase Order gagal dibuat." });
  }
});

router.get("/api/planning-ppic/execution-cockpit", (req, res) => proxyReadWithQuery(req, res, "/api/planning/execution-cockpit", "Planning Execution Cockpit gagal dimuat."));
router.post("/api/planning-ppic/execution-cockpit/:month/close", (req, res) => proxyPageMutation(req, res, "/api/planning/execution-cockpit", "POST", `/${encodeURIComponent(req.params.month)}/close`));
router.post("/api/planning-ppic/execution-cockpit/:month/reopen", (req, res) => proxyPageMutation(req, res, "/api/planning/execution-cockpit", "POST", `/${encodeURIComponent(req.params.month)}/reopen`));

// Schedule boards return purpose-built matrix payloads, so they must be
// registered before the generic module/page data-table proxy below.
router.get("/api/incoming/dashboard", (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  return proxyPageMutation(req, res, "/api/incoming/dashboard", "GET", query ? `?${query}` : "");
});
router.get("/api/outgoing/delivery-board", (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  return proxyPageMutation(req, res, "/api/outgoing/delivery-board", "GET", query ? `?${query}` : "");
});

// Dedicated customer-owned material workflow (never routed to purchase PO).
router.get("/api/incoming/customer-supplies", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "GET", `?${new URLSearchParams(req.query)}`));
router.get("/api/incoming/customer-supplies/options", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "GET", "/options"));
router.get("/api/incoming/customer-supplies/mrp/:runNumber", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "GET", `/mrp/${encodeURIComponent(req.params.runNumber)}`));
router.post("/api/incoming/customer-supplies", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "POST"));
router.post("/api/incoming/customer-supplies/from-mrp", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "POST", "/from-mrp"));
router.post("/api/incoming/customer-supplies/:id/shipments", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "POST", `/${encodeURIComponent(req.params.id)}/shipments`));
router.post("/api/incoming/customer-supplies/:id/cancel", (req, res) => proxyPageMutation(req, res, "/api/incoming/customer-supplies", "POST", `/${encodeURIComponent(req.params.id)}/cancel`));
router.post("/api/incoming/customer-supplies/:id/:kind/:childId/:action", (req, res) => {
  const { id, kind, childId, action } = req.params;
  if (!({ shipments: ["confirm", "cancel", "receive", "reschedule"], receipts: ["inspect", "issue"] }[kind] || []).includes(action)) return res.status(404).json({ message: "Aksi tidak tersedia." });
  return proxyPageMutation(req, res, "/api/incoming/customer-supplies", "POST", `/${encodeURIComponent(id)}/${kind}/${encodeURIComponent(childId)}/${action}`);
});
router.get("/incoming/customer-supplies", (req, res) => res.redirect(302, `/modules/purchasing/customer-supplies${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));
router.get("/purchasing/customer-supplies", (_req, res) => {
  const module = getModule("purchasing"), page = getPage("purchasing", "customer-supplies");
  res.render("incoming/customer-supplies", { title: "Suplai Material Customer", module, page, pageScript: "/js/customer-supplies.js?v=20260906-3", ...common(module.slug) });
});
router.get("/api/purchasing/eta-monitor/:source", (req, res) => {
  if (!["mps", "suggestions", "orders", "vendor-plans", "vendor-orders", "customer"].includes(req.params.source)) return res.status(404).json({ message: "Sumber ETA tidak tersedia." });
  return proxyReadWithQuery(req, res, `/api/purchasing/eta-monitor/${req.params.source}`, "Data ETA gagal dimuat.");
});
router.post("/api/purchasing/eta-monitor/:source/confirm", (req, res) => {
  if (!["mps", "suggestions", "orders", "vendor-plans", "vendor-orders", "customer"].includes(req.params.source)) return res.status(404).json({ message: "Sumber ETA tidak tersedia." });
  return proxyPageMutation(req, res, "/api/purchasing/eta-monitor", "POST", `/${encodeURIComponent(req.params.source)}/confirm`, 45000);
});
router.get("/purchasing/eta-monitor", (req, res) => {
  const module = getModule("purchasing"), page = getPage("purchasing", "eta-monitor");
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || "") ? req.query.month : jakartaMonthKey();
  res.render("purchasing/eta-monitor", { title: "Konfirmasi ETA MPS", module, page, initialMonth, pageScript: "/js/purchasing-eta.js?v=20260907-mps-source-1", ...common(module.slug) });
});

router.get("/api/:module/:page", async (req, res) => {
  const config = findConfig(req, res); if (!config) return;
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const { page: pageConfig } = config;
  const draw = Number(req.query.draw || 1);
  if (!pageConfig.apiReady || !pageConfig.endpoint) return res.json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], apiReady: false });
  const start = Math.max(Number(req.query.start || 0), 0);
  const length = Math.min(Math.max(Number(req.query.length || 20), 1), 500);
  const sort = requestedSort(req.query, pageConfig.columns || []);
  const canSortLocally = Boolean(sort && start + length <= 500);
  try {
    const url = new URL(`${backendUrl}${pageConfig.endpoint}`);
    const fetchLength = canSortLocally ? start + length : length;
    url.searchParams.set("page", canSortLocally ? "1" : String(Math.floor(start / length) + 1));
    url.searchParams.set("limit", String(fetchLength));
    const search = String(req.query["search[value]"] || req.query.q || "").trim();
    if (search) { url.searchParams.set("q", search); url.searchParams.set("search", search); }
    if (pageConfig.slug === "bill-of-materials" && req.query.revisionScope === "LATEST") {
      url.searchParams.set("revisionScope", "LATEST");
    }
    if (pageConfig.slug === "bill-of-materials" && req.query.includeCompleteness === "true") url.searchParams.set("includeCompleteness", "true");
    ["partId", "partCode", "customerCode", "fgPartCode", "historyMonths", "isDeleted", "isActive", "includeDetails", "status", "type", "sourceType", "referenceType", "warehouseCode", "stockType", "lowStock", "poType", "category", "prCategory", "sourceModule", "startDate", "endDate", "month", "year", "machineCode", "lineCode", "dateScope", "scheduleDate", "shift"].forEach((key) => {
      if (req.query[key] !== undefined && req.query[key] !== "") url.searchParams.set(key, String(req.query[key]));
    });
    Object.entries(pageConfig.fixedQuery || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
    if (sort) {
      url.searchParams.set("sortBy", sort.field);
      url.searchParams.set("sortOrder", sort.direction);
      url.searchParams.set("sort", `${sort.field}:${sort.direction}`);
    }
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, code: payload.code });
    const candidate = Array.isArray(payload) ? payload : (payload.items || payload.data || payload.results || []);
    const items = Array.isArray(candidate) ? candidate : [];
    const total = Number(payload.total ?? payload.count ?? payload.pagination?.total ?? items.length);
    const sorted = sortRows(items, sort);
    const data = canSortLocally ? sorted.slice(start, start + length) : sorted;
    res.json({ draw, recordsTotal: total, recordsFiltered: Number(payload.filteredTotal ?? payload.filtered ?? total), data, apiReady: true, report: pageConfig.kind === "report" ? payload : undefined });
  } catch (error) {
    res.status(503).json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], code: "BACKEND_UNAVAILABLE", message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Data gagal diambil dari backend." });
  }
});

router.get("/api/inventory/stock-reservations/stock-options", (req, res) => proxyReadWithQuery(req, res, "/api/inventory/stock-reservations/stock-options", "Daftar free stock gagal dimuat."));
router.get("/api/inventory/stock-reservations/part-options", (req, res) => proxyReadWithQuery(req, res, "/api/inventory/stock-reservations/part-options", "Daftar part number gagal dimuat."));
// Must be registered before the generic /api/:module/:page/:key reader below.
router.get("/api/vendor-process-workflow/:key/send-options", (req, res) => (
  proxyPageMutation(
    req,
    res,
    "/api/production/vendor-process-orders",
    "GET",
    `/${encodeURIComponent(req.params.key)}/send-options`,
  )
));
router.get("/api/:module/:page/:key", async (req, res) => {
  const config = findConfig(req, res); if (!config) return;
  if (!config.page.apiReady || !config.page.endpoint) return res.status(501).json({ message: "API untuk menu ini belum tersedia." });
  try {
    const response = await fetch(`${backendUrl}${config.page.endpoint}/${encodeURIComponent(req.params.key)}`, { headers: authHeader(req), signal: AbortSignal.timeout(10000) });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.` });
    res.json(payload);
  } catch (error) { res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Detail gagal diambil." }); }
});
router.patch("/api/inventory/stock-reservations/:reservationNumber/cancel", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-reservations", "PATCH", `/${encodeURIComponent(req.params.reservationNumber)}/cancel`));
router.post("/api/inventory/stock-reservations", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-reservations", "POST"));

router.post("/api/manufacturing-bom/bill-of-materials", (req, res) => proxyBomMutation(req, res, "POST"));
router.patch("/api/manufacturing-bom/bill-of-materials/:id", (req, res) => proxyBomMutation(req, res, "PATCH", `/${encodeURIComponent(req.params.id)}`));
router.delete("/api/manufacturing-bom/bill-of-materials/:noReg", (req, res) => proxyBomMutation(req, res, "DELETE", `/${encodeURIComponent(req.params.noReg)}`));
router.get("/api/manufacturing-bom/bill-of-materials/:noReg/report", (req, res) => proxyReadWithQuery(req, res, `/api/mbom/mbom/${encodeURIComponent(req.params.noReg)}/report`, "Report BOM gagal dimuat."));
router.get("/api/manufacturing-bom/bill-of-materials/:noReg/history", (req, res) => proxyReadWithQuery(req, res, `/api/mbom/mbom/${encodeURIComponent(req.params.noReg)}/history`, "Riwayat BOM gagal dimuat."));
router.get("/api/manufacturing-bom/bill-of-materials/drafts", (req, res) => proxyBomMutation(req, res, "GET", "/drafts"));
router.get("/api/manufacturing-bom/bill-of-materials/drafts/:id", (req, res) => proxyBomMutation(req, res, "GET", `/drafts/${encodeURIComponent(req.params.id)}`));
router.post("/api/manufacturing-bom/bill-of-materials/drafts", (req, res) => proxyBomMutation(req, res, "POST", "/drafts"));
router.patch("/api/manufacturing-bom/bill-of-materials/drafts/:id", (req, res) => proxyBomMutation(req, res, "PATCH", `/drafts/${encodeURIComponent(req.params.id)}`));
router.post("/api/manufacturing-bom/bill-of-materials/drafts/:id/complete", (req, res) => proxyBomMutation(req, res, "POST", `/drafts/${encodeURIComponent(req.params.id)}/complete`));

router.post("/api/sales/:page", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "POST");
});
router.patch("/api/sales/sales-orders/:key/confirm", (req, res) => proxyPageMutation(req, res, "/api/sales/sales-orders", "PATCH", `/${encodeURIComponent(req.params.key)}/confirm`));
router.post("/api/sales/sales-orders/:key/revise", (req, res) => proxyPageMutation(req, res, "/api/sales/sales-orders", "POST", `/${encodeURIComponent(req.params.key)}/revise`));
router.patch("/api/sales/:page/:key", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "PATCH", `/${encodeURIComponent(req.params.key)}`);
});
router.delete("/api/sales/:page/:key", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "DELETE", `/${encodeURIComponent(req.params.key)}`);
});
router.post("/api/sales/quotations/:key/make-to-so", (req, res) => proxyPageMutation(req, res, "/api/sales/quotations", "POST", `/${encodeURIComponent(req.params.key)}/make-to-so`));
router.get("/api/sales/forecasts/planning-tool", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "GET", "/planning-tool"));
router.get("/api/sales/forecasts/:key/planning-tool", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "GET", `/${encodeURIComponent(req.params.key)}/planning-tool`));
router.post("/api/sales/forecasts/:key/planning-tool", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "POST", `/${encodeURIComponent(req.params.key)}/planning-tool/sync`));
router.post("/api/sales/forecasts/:key/submit", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "POST", `/${encodeURIComponent(req.params.key)}/submit`));
router.post("/api/sales/forecasts/:key/approve", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "POST", `/${encodeURIComponent(req.params.key)}/approve`));
router.post("/api/sales/forecasts/:key/revise", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "POST", `/${encodeURIComponent(req.params.key)}/revise`));
router.post("/api/planning-ppic/forecasts/:key/close", (req, res) => proxyPageMutation(req, res, "/api/planning/forecasts", "POST", `/${encodeURIComponent(req.params.key)}/close`));

router.post("/api/planning-ppic/mps/from-forecast", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/from-forecast"));
router.post("/api/planning-ppic/mps/monthly-sync", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/monthly-sync"));
router.patch("/api/planning-ppic/mps/:key/eta-mode", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/eta-mode`, 15000));
router.post("/api/planning-ppic/mps/:key/checksheet/evaluate", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", `/${encodeURIComponent(req.params.key)}/checksheet/evaluate`, 300000));
router.post("/api/planning-ppic/mps/baseline/preview", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/baseline/preview"));
router.post("/api/planning-ppic/mps/baseline/generate", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/baseline/generate"));
router.post("/api/planning-ppic/mps/delta/preview", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/delta/preview"));
router.post("/api/planning-ppic/mps/delta/generate", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/delta/generate"));
router.post("/api/planning-ppic/mps/production-cut/preview", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/production-cut/preview"));
router.post("/api/planning-ppic/mps/production-cut", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/production-cut"));
router.patch("/api/planning-ppic/mps/production-cut/:adjustmentNumber/approve", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/production-cut/${encodeURIComponent(req.params.adjustmentNumber)}/approve`));
router.post("/api/planning-ppic/mps/:key/delivery-phases", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", `/${encodeURIComponent(req.params.key)}/delivery-phases`));
router.patch("/api/planning-ppic/mps/:key/delivery-phases/:phaseId/remove", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/delivery-phases/${encodeURIComponent(req.params.phaseId)}/remove`));
router.patch("/api/planning-ppic/mps/:key/adjustments", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/adjustments`));
router.patch("/api/planning-ppic/mps/:key/confirm", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/confirm`));
router.patch("/api/planning-ppic/mps/:key/approve", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/approve`));
router.get("/api/planning-ppic/mps/:key/rccp/latest", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", `/${encodeURIComponent(req.params.key)}/rccp/latest`));
router.get("/api/planning-ppic/mps/rccp/:runId", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", `/rccp/${encodeURIComponent(req.params.runId)}`));
router.get("/api/planning-ppic/mps/rccp/:runId/timeline", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", `/rccp/${encodeURIComponent(req.params.runId)}/timeline`));
router.get("/api/planning-ppic/mps/rccp/:runId/offset-load", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", `/rccp/${encodeURIComponent(req.params.runId)}/offset-load`));
router.get("/api/planning-ppic/mps/rccp/:runId/recommendations", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", `/rccp/${encodeURIComponent(req.params.runId)}/recommendations`));
router.post("/api/planning-ppic/mps/rccp/:runId/recommendations/:recommendationId/apply", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", `/rccp/${encodeURIComponent(req.params.runId)}/recommendations/${encodeURIComponent(req.params.recommendationId)}/apply`));
router.post("/api/planning-ppic/mps/rccp/:runId/acknowledge", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", `/rccp/${encodeURIComponent(req.params.runId)}/acknowledge`));
router.post("/api/planning-ppic/mps/rccp/:runId/override", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", `/rccp/${encodeURIComponent(req.params.runId)}/override`));
router.post("/api/planning-ppic/mrp/run", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", "/run"));
router.post("/api/planning-ppic/mrp/delta/run", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", "/delta/run"));
router.patch("/api/planning-ppic/mrp/:key/approve", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "PATCH", `/${encodeURIComponent(req.params.key)}/approve`));
router.patch("/api/planning-ppic/mrp/:key/requirements/buffer", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "PATCH", `/${encodeURIComponent(req.params.key)}/requirements/buffer`));
router.get("/api/planning-ppic/mrp/:key/procurement-view", (req, res) => proxyReadWithQuery(req, res, `/api/planning/mrp/${encodeURIComponent(req.params.key)}/procurement-view`, "Procurement View MRP gagal dimuat."));
router.get("/api/planning-ppic/mrp/:key/customer-pegging-view", (req, res) => proxyReadWithQuery(req, res, `/api/planning/mrp/${encodeURIComponent(req.params.key)}/customer-pegging-view`, "Customer Pegging View MRP gagal dimuat."));
router.patch("/api/planning-ppic/mrp/:key/requirements/order-percent", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "PATCH", `/${encodeURIComponent(req.params.key)}/requirements/order-percent`));
router.patch("/api/planning-ppic/mrp/:key/planned-orders/procurement", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "PATCH", `/${encodeURIComponent(req.params.key)}/planned-orders/procurement`));
router.post("/api/planning-ppic/mrp/:key/output/purchase-suggestions", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", `/${encodeURIComponent(req.params.key)}/output/purchase-suggestions`));
router.post("/api/planning-ppic/mrp/:key/output/production-plan", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", `/${encodeURIComponent(req.params.key)}/output/production-plan`, MONTHLY_PLAN_CREATE_TIMEOUT_MS));
router.get("/api/planning-ppic/monthly-plan/from-mps/preview", (req, res) => proxyReadWithQuery(req, res, "/api/planning/monthly-production-plans/from-mps/preview", "Preview Production Plan gagal dimuat."));
router.get("/api/planning-ppic/monthly-production-plans/:key/executor-options", (req, res) => proxyReadWithQuery(req, res, `/api/planning/monthly-production-plans/${encodeURIComponent(req.params.key)}/executor-options`, "Pilihan pelaksana gagal dimuat."));
router.get("/api/planning-ppic/monthly-production-plans/:key/executor-changes", (req, res) => proxyReadWithQuery(req, res, `/api/planning/monthly-production-plans/${encodeURIComponent(req.params.key)}/executor-changes`, "Riwayat pelaksana gagal dimuat."));
router.post("/api/planning-ppic/monthly-production-plans/:key/executor-changes/preview", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/executor-changes/preview`, 60000));
router.post("/api/planning-ppic/monthly-production-plans/:key/executor-changes", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/executor-changes`, 60000));
router.post("/api/planning-ppic/monthly-production-plans/:key/executor-changes/:changeId/cancel", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/executor-changes/${encodeURIComponent(req.params.changeId)}/cancel`, 60000));
router.get("/api/planning-ppic/monthly-plan/matrix/:month", (req, res) => proxyReadWithQuery(req, res, `/api/planning/monthly-production-plans/matrix/${encodeURIComponent(req.params.month)}`, "Monthly Production Plan gagal dimuat."));
router.get("/api/planning-ppic/monthly-plan/matrix", (req, res) => proxyReadWithQuery(req, res, "/api/planning/monthly-production-plans/matrix", "Monthly Production Plan gagal dimuat."));
router.get("/api/planning-ppic/monthly-plan/:key", (req, res) => proxyReadWithQuery(req, res, `/api/planning/monthly-production-plans/${encodeURIComponent(req.params.key)}`, "Detail Monthly Production Plan gagal dimuat."));
router.post("/api/planning-ppic/monthly-plan/:key/capacity-editor", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/capacity-editor`));
router.post("/api/planning-ppic/monthly-plan/:key/recommendations", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/recommendations`, 120000));
router.get("/api/planning-ppic/monthly-plan/:key/recommendations/active", (req, res) => proxyReadWithQuery(req, res, `/api/planning/monthly-production-plans/${encodeURIComponent(req.params.key)}/recommendations/active`, "Scenario recommendation aktif gagal dimuat."));
router.get("/api/planning-ppic/monthly-plan/recommendations/:scenarioId", (req, res) => proxyReadWithQuery(req, res, `/api/planning/monthly-production-plans/recommendations/${encodeURIComponent(req.params.scenarioId)}`, "Detail scenario recommendation gagal dimuat."));
router.post("/api/planning-ppic/monthly-plan/recommendations/:scenarioId/apply", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/recommendations/${encodeURIComponent(req.params.scenarioId)}/apply`, 120000));
router.post("/api/planning-ppic/monthly-plan/recommendations/:scenarioId/discard", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/recommendations/${encodeURIComponent(req.params.scenarioId)}/discard`));
router.get("/api/planning-ppic/monthly-plan/capacity-editor/:sessionId", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "GET", `/capacity-editor/${encodeURIComponent(req.params.sessionId)}`));
router.post("/api/planning-ppic/monthly-plan/capacity-editor/:sessionId/changes", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/capacity-editor/${encodeURIComponent(req.params.sessionId)}/changes`));
router.get("/api/planning-ppic/monthly-plan/capacity-editor/:sessionId/preview", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "GET", `/capacity-editor/${encodeURIComponent(req.params.sessionId)}/preview`));
router.post("/api/planning-ppic/monthly-plan/capacity-editor/:sessionId/cancel", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/capacity-editor/${encodeURIComponent(req.params.sessionId)}/cancel`));
router.post("/api/planning-ppic/monthly-plan/capacity-editor/:sessionId/undo", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/capacity-editor/${encodeURIComponent(req.params.sessionId)}/undo`));
router.post("/api/planning-ppic/monthly-plan/capacity-editor/:sessionId/commit", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/capacity-editor/${encodeURIComponent(req.params.sessionId)}/commit`));
// Creation also synchronizes MPS details and calculates capacity recommendations.
// Give it the same computation budget as the standalone recommendation route.
router.post("/api/planning-ppic/monthly-plan/from-mps", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", "/from-mps", MONTHLY_PLAN_CREATE_TIMEOUT_MS));
router.post("/api/planning-ppic/monthly-plan/:key/confirm", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/confirm`));
router.post("/api/planning-ppic/monthly-plan/:key/release", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/release`));
router.post("/api/planning-ppic/monthly-plan/:key/daily-plans", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/daily-plans`));
router.post("/api/planning-ppic/monthly-plan/:key/manual-daily-plans", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/manual-daily-plans`));
router.post("/api/planning-ppic/monthly-plan/:key/manual-allocations", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/manual-allocations`));
router.get("/api/planning-ppic/monthly-plan/:key/capacity-flow-rule", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "GET", `/${encodeURIComponent(req.params.key)}/capacity-flow-rule`));
router.put("/api/planning-ppic/monthly-plan/:key/capacity-flow-rule", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "PUT", `/${encodeURIComponent(req.params.key)}/capacity-flow-rule`));
router.post("/api/planning-ppic/monthly-plan/:key/capacity-recommendation", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/capacity-recommendation`));
router.post("/api/planning-ppic/monthly-plan/:key/capacity-adopt-simulation", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/capacity-adopt-simulation`));
router.patch("/api/planning-ppic/monthly-plan/:key/manual-allocations/:allocationId", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "PATCH", `/${encodeURIComponent(req.params.key)}/manual-allocations/${encodeURIComponent(req.params.allocationId)}`));
router.patch("/api/planning-ppic/monthly-plan/:key/manual-allocations/:allocationId/remove", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "PATCH", `/${encodeURIComponent(req.params.key)}/manual-allocations/${encodeURIComponent(req.params.allocationId)}/remove`));
router.post("/api/planning-ppic/monthly-plan/:key/capacity-override", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/capacity-override`));
router.post("/api/planning-ppic/monthly-plan/:key/capacity-machine-override", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/capacity-machine-override`));
router.post("/api/planning-ppic/monthly-plan/:key/capacity-day", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/capacity-day`));
router.post("/api/planning-ppic/capacity-day", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", "/capacity-day"));
router.post("/api/planning-ppic/monthly-plan/:key/release-mos", (req, res) => proxyPageMutation(req, res, "/api/production/manufacturing-orders", "POST", "/bulk-create"));
router.post("/api/production/daily-production-schedules/dispatch-from-work-orders", (req, res) => proxyPageMutation(req, res, "/api/production/daily-production-schedules", "POST", "/dispatch-from-work-orders"));
router.post("/api/production/daily-production-schedules/:key/consume", (req, res) => proxyPageMutation(req, res, "/api/production/daily-production-schedules", "POST", `/${encodeURIComponent(req.params.key)}/consume`));
router.post("/api/production/daily-production-schedules", (req, res) => proxyPageMutation(req, res, "/api/production/daily-production-schedules", "POST"));
router.patch("/api/production/daily-production-schedules/:key", (req, res) => proxyPageMutation(req, res, "/api/production/daily-production-schedules", "PATCH", `/${encodeURIComponent(req.params.key)}`));

const productionWorkflowActions = {
  "manufacturing-orders": { "availability-check": "GET", release: "PATCH", start: "PATCH", complete: "PATCH", cancel: "PATCH", "generate-work-orders": "POST" },
  "work-orders": { start: "PATCH", complete: "PATCH", cancel: "PATCH" },
  "daily-production-schedules": { consume: "POST", release: "POST", start: "POST", complete: "POST", cancel: "POST" },
  "vendor-process-orders": { send: "PATCH", receive: "PATCH", reprice: "PATCH" },
  "material-issues": { prepare: "PATCH", issue: "PATCH", close: "PATCH" },
  "quality-inspections": { complete: "PATCH", "receive-fg": "PATCH" },
  "production-logs": { submit: "PATCH", approve: "PATCH", "ensure-qc": "PATCH" },
  "ng-dispositions": { judge: "PATCH" }
};
const vendorProcessWorkflowActions = { send: "PATCH", receive: "PATCH", reprice: "PATCH" };
router.post("/api/vendor-process-workflow/:key/:action", (req, res) => {
  const method = vendorProcessWorkflowActions[req.params.action];
  if (!method) return res.status(404).json({ message: "Workflow Vendor Process tidak tersedia untuk aksi ini." });
  return proxyPageMutation(req, res, "/api/production/vendor-process-orders", method, `/${encodeURIComponent(req.params.key)}/${encodeURIComponent(req.params.action)}`);
});
router.post("/api/production-workflow/:page/:key/:action", (req, res) => {
  const page = getPage("production", req.params.page);
  const method = productionWorkflowActions[req.params.page]?.[req.params.action];
  if (!page?.endpoint || !method) return res.status(404).json({ message: "Workflow Production tidak tersedia untuk dokumen ini." });
  const suffix = `/${encodeURIComponent(req.params.key)}/${encodeURIComponent(req.params.action)}`;
  return proxyPageMutation(req, res, page.endpoint, method, suffix);
});
const qcWorkflowActions = {
  "quality-inspections": { complete: "PATCH", "receive-fg": "PATCH" },
  "ng-dispositions": { judge: "PATCH" },
};
router.post("/api/qc-workflow/:page/:key/:action", (req, res) => {
  const page = getPage("qc", req.params.page);
  const method = qcWorkflowActions[req.params.page]?.[req.params.action];
  if (!page?.endpoint || !method) return res.status(404).json({ message: "Workflow QC tidak tersedia untuk dokumen ini." });
  const suffix = `/${encodeURIComponent(req.params.key)}/${encodeURIComponent(req.params.action)}`;
  return proxyPageMutation(req, res, page.endpoint, method, suffix);
});
const purchasingWorkflowActions = {
  "purchase-requisitions": { submit: "PATCH", approve: "PATCH", reject: "PATCH", "confirm-suppliers": "PATCH", "make-po": "POST" },
  "purchase-order": { "submit-checking": "PATCH", approve: "PATCH", revise: "PATCH", reject: "PATCH", send: "PATCH", confirm: "PATCH", cancel: "PATCH", "manual-complete": "PATCH" },
  "purchase-invoices": { submit: "PATCH", approve: "PATCH", post: "PATCH", pay: "PATCH" }
};
router.post("/api/purchasing-workflow/:page/:key/:action", (req, res) => {
  const page = getPage("purchasing", req.params.page);
  const method = purchasingWorkflowActions[req.params.page]?.[req.params.action];
  if (!page?.endpoint || !method) return res.status(404).json({ message: "Workflow Purchasing tidak tersedia untuk dokumen ini." });
  const suffix = `/${encodeURIComponent(req.params.key)}/${encodeURIComponent(req.params.action)}`;
  return proxyPageMutation(req, res, page.endpoint, method, suffix);
});
router.patch("/api/purchasing-pr/:key/confirm-suppliers", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-requisitions", "PATCH", `/${encodeURIComponent(req.params.key)}/confirm-suppliers`));
router.post("/api/purchasing-pr/consolidate-to-po", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-requisitions", "POST", "/consolidate-to-po"));
router.post("/api/purchasing-pr", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-requisitions", "POST"));
router.patch("/api/purchasing-pr/:key", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-requisitions", "PATCH", `/${encodeURIComponent(req.params.key)}`));
router.patch("/api/purchasing-suggestions/:key/items/:itemId", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-suggestions", "PATCH", `/${encodeURIComponent(req.params.key)}/items/${encodeURIComponent(req.params.itemId)}`));
router.post("/api/purchasing-suggestions/:key/auto-confirm-suppliers", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-suggestions", "POST", `/${encodeURIComponent(req.params.key)}/auto-confirm-suppliers`));
router.get("/api/purchasing-suggestions/:key/items/:itemId/supplier-master", (req, res) => {
  const query = new URLSearchParams();
  if (req.query.supplierCode) query.set("supplierCode", String(req.query.supplierCode));
  if (req.query.asOf) query.set("asOf", String(req.query.asOf));
  const suffix = `/${encodeURIComponent(req.params.key)}/items/${encodeURIComponent(req.params.itemId)}/supplier-master${query.size ? `?${query}` : ""}`;
  return proxyPageMutation(req, res, "/api/purchasing/purchase-suggestions", "GET", suffix);
});
router.post("/api/purchasing-suggestions/:key/convert-to-pr", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-suggestions", "POST", `/${encodeURIComponent(req.params.key)}/convert-to-pr`));
router.get("/api/purchasing-po/:key/revisions", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-order", "GET", `/${encodeURIComponent(req.params.key)}/revisions`));
router.post("/api/purchasing-po", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-order", "POST"));
router.patch("/api/purchasing-po/:id", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-order", "PATCH", `/${encodeURIComponent(req.params.id)}`));
router.post("/api/purchasing-invoice", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-invoices", "POST"));
router.patch("/api/purchasing-invoice/:key", (req, res) => proxyPageMutation(req, res, "/api/purchasing/purchase-invoices", "PATCH", `/${encodeURIComponent(req.params.key)}`));
router.get("/api/inventory/stock-movements/material-piece-sources", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-movements", "GET", `/material-piece-sources${req.query.q ? `?q=${encodeURIComponent(req.query.q)}` : ""}`));
router.post("/api/inventory/stock-movements", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-movements", "POST"));
router.patch("/api/inventory/material-issues/:key", (req, res) => proxyPageMutation(req, res, "/api/production/material-issues", "PATCH", `/${encodeURIComponent(req.params.key)}`));
router.post("/api/inventory/stock-opname/preview", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-opname", "POST", "/preview"));
router.post("/api/inventory/stock-opname", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-opname", "POST"));
router.get("/api/inventory/stock-opname/:stoNo/adjust-preview", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-opname", "GET", `/${encodeURIComponent(req.params.stoNo)}/adjust-preview`));
router.patch("/api/inventory/stock-opname/:stoNo/:action", (req, res) => proxyPageMutation(req, res, "/api/inventory/stock-opname", "PATCH", `/${encodeURIComponent(req.params.stoNo)}/${encodeURIComponent(req.params.action)}`));
router.post("/api/production/production-logs", (req, res) => proxyPageMutation(req, res, "/api/production/production-logs", "POST"));
router.patch("/api/production/production-logs/:key", (req, res) => proxyPageMutation(req, res, "/api/production/production-logs", "PATCH", `/${encodeURIComponent(req.params.key)}`));
const editableProductionPages = new Set([
  "manufacturing-orders", "work-orders", "material-issues",
  "quality-inspections", "wip", "downtime-logs",
]);
router.post("/api/production-documents/:page", (req, res) => {
  const page = getPage("production", req.params.page) || getPage("qc", req.params.page);
  if (!page?.endpoint) return res.status(404).json({ message: "Dokumen Production tidak ditemukan." });
  if (req.params.page === "vendor-process-orders") {
    const moNumber = String(req.body?.moNumber || "").trim();
    if (!moNumber) return res.status(400).json({ message: "MO Number wajib dipilih untuk generate Vendor Process Order." });
    return proxyPageMutation(req, res, page.endpoint, "POST", `/generate-from-mo/${encodeURIComponent(moNumber)}`);
  }
  if (!editableProductionPages.has(req.params.page)) return res.status(404).json({ message: "Form create tidak tersedia untuk dokumen ini." });
  return proxyPageMutation(req, res, page.endpoint, "POST");
});
router.patch("/api/production-documents/:page/:key", (req, res) => {
  const page = getPage("production", req.params.page) || getPage("qc", req.params.page);
  if (!page?.endpoint || (!editableProductionPages.has(req.params.page) && req.params.page !== "vendor-process-orders")) {
    return res.status(404).json({ message: "Form edit tidak tersedia untuk dokumen ini." });
  }
  return proxyPageMutation(req, res, page.endpoint, "PATCH", `/${encodeURIComponent(req.params.key)}`);
});
router.post("/api/incoming/goods-receipts/:key/create-inspection", (req, res) => proxyPageMutation(req, res, "/api/incoming/incoming-inspections", "POST"));
router.post("/api/incoming/goods-receipts/:key/release-without-qc", (req, res) => proxyPageMutation(req, res, "/api/incoming/goods-receipts", "POST", `/${encodeURIComponent(req.params.key)}/release-without-qc`));
router.get("/api/incoming/goods-receipts/allocation-plan/:poNumber", (req, res) => proxyPageMutation(req, res, "/api/incoming/goods-receipts", "GET", `/allocation-plan/${encodeURIComponent(req.params.poNumber)}`));
router.post("/api/incoming/goods-receipts", (req, res) => proxyPageMutation(req, res, "/api/incoming/goods-receipts", "POST"));
router.post("/api/incoming/incoming-inspections/:key/complete", (req, res) => proxyPageMutation(req, res, "/api/incoming/incoming-inspections", "POST", `/${encodeURIComponent(req.params.key)}/complete`));
router.post("/api/incoming/incoming-inspections/:key/putaway", (req, res) => proxyPageMutation(req, res, "/api/incoming/incoming-inspections", "POST", `/${encodeURIComponent(req.params.key)}/putaway`));
router.post("/api/incoming/incoming-inspections/:key/dispose-rejected", (req, res) => proxyPageMutation(req, res, "/api/incoming/incoming-inspections", "POST", `/${encodeURIComponent(req.params.key)}/dispose-rejected`));
router.post("/api/outgoing/delivery-schedules/:key/:action", (req, res) => {
  const action = ["pick", "pack", "ship", "pod", "fail"].includes(req.params.action) ? req.params.action : null;
  if (!action) return res.status(404).json({ message: "Aksi delivery tidak tersedia." });
  return proxyPageMutation(req, res, "/api/outgoing/delivery-schedules", "POST", `/${encodeURIComponent(req.params.key)}/${action}`);
});
router.post("/api/outgoing/delivery-schedules", (req, res) => proxyPageMutation(req, res, "/api/outgoing/delivery-schedules", "POST"));

function renderSales(res, req, view, mode = "") {
  const module = getModule("sales"); const page = getPage("sales", req.params.page);
  if (!page) return res.status(404).render("errors/404", { title: "Menu Sales tidak ditemukan" });
  if (page.kind === "report") {
    return res.render("modules/report", { title: page.label, module, page, pageScript: "/js/module-report.js?v=20260818-inventory-matrix-8", ...common(module.slug) });
  }
  return res.render(view, { title: page.label, module, page, mode, recordKey: req.params.key || "", pageScript: `/js/sales-${view.split("/").pop()}.js${view === "sales/form" ? "?v=20260909-delivery-phases-1" : view === "sales/detail" ? "?v=20260909-delivery-phases-1" : ""}`, ...common(module.slug) });
}
router.get("/sales/:page/new", (req, res) => renderSales(res, req, "sales/form", "create"));
router.get("/sales/:page/:key/edit", (req, res) => renderSales(res, req, "sales/form", "edit"));
router.get("/sales/:page/:key", (req, res) => renderSales(res, req, "sales/detail"));
router.get("/sales/:page", (req, res) => renderSales(res, req, "sales/list"));

function redirectPlanningWorkspace(req, res, destination = "monthly-production-plans") {
  const query = new URLSearchParams();
  const month = String(req?.query?.month || req?.query?.date || req?.query?.startDate || "").slice(0, 7);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) query.set("month", month);
  if (destination === "monthly-production-plans" && typeof req?.query?.planNumber === "string" && req.query.planNumber) query.set("planNumber", req.query.planNumber);
  return res.redirect(302, `/modules/planning-ppic/${destination}${query.size ? `?${query}` : ""}`);
}

function renderPpic(res, tab = "mrp", req = null) {
  const module = getModule("planning-ppic");
  tab = { "material-requirements-planning": "mrp", "master-production-schedule": "mps", "monthly-plan": "monthly-production-plans" }[tab] || tab;
  if (tab === "dashboard") return res.render("modules/executive-dashboard", { title: "Planning Performance", module, ...common(module.slug) });
  const ppicTabs = { mrp: "MRP Planning Run", mps: "Rolling MPS", "demand-planning": "Demand Planning", "capacity-planning": "Capacity Planning", "daily-production-plans": "Daily Production Plan", "control-tower": "Control Tower", "planned-orders": "Planned Orders", "monthly-production-plans": "Production Plans" };
  if (!ppicTabs[tab]) return res.status(404).render("errors/404", { title: "Menu PPIC tidak ditemukan" });
  if (tab === "demand-planning") return res.render("ppic/yearly-demand", { title: "Demand Planning", module, activePpicTab: tab, currentYear: businessNow().getFullYear(), pageScript: "/js/ppic-yearly-demand.js?v=20260821-efd-1", ...common(module.slug) });
  if (tab === "capacity-planning") return redirectPlanningWorkspace(req, res);
  if (["control-tower", "planned-orders", "monthly-production-plans", "daily-production-plans"].includes(tab)) return renderOperationsDashboard(res, { params: { page: tab }, query: req?.query || {} }, "planning-ppic", tab);
  return res.render("ppic/dashboard", { title: ppicTabs[tab], module, activePpicTab: tab, pageScript: tab === "demand-planning" ? "/js/ppic-demand-planning.js?v=20260812-1" : "/js/ppic-dashboard.js?v=20260812-1", ...common(module.slug) });
}
function renderPpicDetail(res, req) {
  const module = getModule("planning-ppic");
  const tab = { "material-requirements-planning": "mrp", "master-production-schedule": "mps", "monthly-plan": "monthly-production-plans" }[req.params.tab] || req.params.tab;
  const ppicTabs = { mrp: "MRP Planning Run", mps: "Rolling MPS", "demand-planning": "Demand Planning", "daily-production-plans": "Daily Production Plan", "control-tower": "Control Tower", "planned-orders": "Planned Orders", "monthly-production-plans": "Production Plans" };
  if (!ppicTabs[tab]) return res.status(404).render("errors/404", { title: "Menu PPIC tidak ditemukan" });
  if (["control-tower", "planned-orders", "monthly-production-plans", "daily-production-plans"].includes(tab)) return renderOperationsDetail(res, { params: { ...req.params, page: tab }, query: req.query || {} }, "planning-ppic");
  if (tab === "mrp") return res.render("ppic/mrp-detail-simple", { title: "MRP Planning Run", module, activePpicTab: tab, recordKey: req.params.key, pageScript: "/js/ppic-mrp-detail-simple.js?v=20260906-categories", ...common(module.slug) });
  return res.render("ppic/detail", { title: `${ppicTabs[tab]} Detail`, module, activePpicTab: tab, recordKey: req.params.key, pageScript: "/js/ppic-detail.js?v=20260813-management-matrix-2", ...common(module.slug) });
}
router.get("/planning-ppic", (_req, res) => res.redirect(308, "/modules/planning-ppic/demand-planning"));
router.get("/planning-ppic/mrp/general", (_req, res) => res.redirect(308, "/modules/planning-ppic/mrp"));
router.get("/planning-ppic/mps/general", (_req, res) => res.redirect(308, "/modules/planning-ppic/mps/workbench"));
router.get("/planning-ppic/monthly-plan/:key", (req, res) => res.redirect(308, `/modules/planning-ppic/monthly-production-plans?planNumber=${encodeURIComponent(req.params.key)}`));
router.get("/planning-ppic/monthly-plan", (_req, res) => res.redirect(308, "/modules/planning-ppic/monthly-production-plans"));
router.get("/planning-ppic/demand-planning/monthly-review", (req, res) => {
  const module = getModule("planning-ppic");
  const nextMonth = addMonthKey(jakartaMonthKey(), 1);
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : nextMonth;
  return res.render("ppic/monthly-demand-review", { title: "Monthly Demand Review", module, activePpicTab: "demand-planning", initialMonth, pageScript: "/js/ppic-monthly-demand-review.js?v=20260820-1", ...common(module.slug) });
});
router.get("/planning-ppic/demand-planning/delivery-workbench", (req, res) => {
  const module = getModule("planning-ppic");
  if (!module) return res.status(404).render("errors/not-found", { title: "Modul tidak ditemukan" });
  return res.render("ppic/dashboard", {
    title: "Delivery Feasibility & Recovery",
    module,
    activePpicTab: "demand-planning",
    pageScript: "/js/ppic-demand-planning.js?v=20260823-delivery-actions-1",
    ...common(module.slug),
  });
});
router.get("/planning-ppic/demand-planning/exception-workbench", (req, res) => {
  const module = getModule("planning-ppic");
  const nextMonth = addMonthKey(jakartaMonthKey(), 1);
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : nextMonth;
  return res.render("ppic/demand-exception-workbench", { title: "Demand Exception Workbench", module, activePpicTab: "demand-planning", initialMonth, pageScript: "/js/ppic-demand-exception-workbench.js?v=20260818-2", ...common(module.slug) });
});
router.get("/planning-ppic/mps/workbench", (req, res) => {
  const module = getModule("planning-ppic");
  const nextMonth = addMonthKey(jakartaMonthKey(), 1);
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : nextMonth;
  return res.render("ppic/mps-workbench", { title: "Master Production Schedule", module, activePpicTab: "mps", initialMonth, pageScript: "/js/ppic-mps-workbench.js?v=20260907-mps-source-1", ...common(module.slug) });
});
router.get("/planning-ppic/mps/recovery-kanban", (req, res) => {
  const module = getModule("planning-ppic");
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : jakartaMonthKey();
  return res.render("ppic/mps-recovery-kanban", { title: "MPS Recovery Kanban", module, activePpicTab: "mps-recovery", initialMonth, pageScript: "/js/ppic-mps-recovery-kanban.js?v=20260905-production-recovery", ...common(module.slug) });
});
router.get("/planning-ppic/tutorial", (req, res) => redirectPlanningWorkspace(req, res));
router.get("/planning-ppic/control-tower", (req, res) => {
  return redirectPlanningWorkspace(req, res, ["mrp", "orders"].includes(req.query.tab) ? "mrp" : "monthly-production-plans");
});
router.get("/planning-ppic/dashboard", (req, res) => redirectPlanningWorkspace(req, res));
router.get("/planning-ppic/mps", (req, res) => res.redirect(308, `/modules/planning-ppic/mps/workbench${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));
router.get("/planning-ppic/master-production-schedule", (req, res) => res.redirect(308, `/modules/planning-ppic/mps/workbench${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));
router.get("/planning-ppic/mrp", (req, res) => {
  const module = getModule("planning-ppic");
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : jakartaMonthKey();
  if (req.query.view === "runs") return res.render("ppic/mrp-planning-runs", { title: "MRP Planning Runs", module, activePpicTab: "mrp", initialMonth, pageScript: "/js/ppic-mrp-planning-runs.js?v=20260906-monthly", ...common(module.slug) });
  return res.render("ppic/mrp-detail-simple", { title: "Material Requirements Planning", module, activePpicTab: "mrp", initialMonth, monthlyMode: true, selectedRun: typeof req.query.run === "string" ? req.query.run : "", recordKey: "", pageScript: "/js/ppic-mrp-detail-simple.js?v=20260906-categories", ...common(module.slug) });
});
router.get("/planning-ppic/material-requirements-planning", (req, res) => res.redirect(308, `/modules/planning-ppic/mrp${req.query.month ? `?month=${encodeURIComponent(req.query.month)}` : ""}`));
router.get("/planning-ppic/planned-orders", (req, res) => redirectPlanningWorkspace(req, res, "mrp"));
router.get("/planning-ppic/monthly-production-plans", (req, res) => {
  const module = getModule("planning-ppic");
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : jakartaMonthKey();
  return res.render("ppic/monthly-production-plan", { title: "Monthly Production Plan", module, activePpicTab: "monthly-production-plans", initialMonth, pageScript: "/js/ppic-monthly-production-plan.js?v=20260908-executor-1", ...common(module.slug) });
});
router.get("/planning-ppic/monthly-production-plans/:key", (req, res) => res.redirect(308, `/modules/planning-ppic/monthly-production-plans?planNumber=${encodeURIComponent(req.params.key)}`));
router.get("/planning-ppic/daily-production-plans", (req, res) => {
  const module = getModule("planning-ppic");
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : jakartaDateKey();
  return res.render("ppic/daily-production-plan", { title: "Daily Production Plan", module, activePpicTab: "daily-production-plans", initialDate, pageScript: "", ...common(module.slug) });
});

router.get("/manufacturing-bom/work-centers", (_req, res) => res.redirect(302, "/master-data/work-centers"));
router.get("/planning-ppic/consume-forecast", (_req, res) => res.redirect(308, "/modules/planning-ppic/demand-planning"));
router.get("/planning-ppic/:tab/:key", (req, res) => renderPpicDetail(res, req));
router.get("/planning-ppic/:tab", (req, res) => renderPpic(res, req.params.tab, req));

router.get("/manufacturing-bom/bill-of-materials/new", (_req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/editor", { title: "BOM Generator", module, page, mode: "create", recordKey: "", pageScript: "/js/bom-editor.js?v=20260909-dies-1", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/drafts/:id/edit", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/editor", { title: "Draft BOM Canvas", module, page, mode: "draft", recordKey: req.params.id, pageScript: "/js/bom-editor.js?v=20260909-dies-1", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/:key/edit", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/editor", { title: "Edit BOM Canvas", module, page, mode: "edit", recordKey: req.params.key, pageScript: "/js/bom-editor.js?v=20260909-dies-1", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/:key/edit-table", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/table-editor", { title: "Edit BOM Table", module, page, recordKey: req.params.key, pageScript: "/js/bom-table-editor.js?v=20260909-completeness-1", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/:key/processes", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/processes", { title: "BOM Proses", module, page, recordKey: req.params.key, pageScript: "/js/bom-detail.js", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/:key", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/detail", { title: "Detail BOM", module, page, recordKey: req.params.key, pageScript: "/js/bom-detail.js", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials", (_req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/list", { title: "Bill of Materials", module, page, pageScript: "/js/bom-list.js?v=20260908-governance-1", ...common(module.slug) });
});

function renderOperationsDashboard(res, req, moduleSlug, defaultPage) {
  const module = getModule(moduleSlug);
  const page = getPage(moduleSlug, req.params.page || defaultPage);
  if (!module || !page) return res.status(404).render("errors/404", { title: `Menu ${module?.label || "operasional"} tidak ditemukan` });
  if (page.kind === "dashboard" && moduleSlug === "incoming") return res.render("incoming/dashboard", { title: page.label, module, page, pageScript: "/js/incoming-dashboard.js?v=20260828-lot-link-2", ...common(module.slug) });
  if (page.kind === "dashboard" && moduleSlug === "outgoing") return res.render("outgoing/dashboard", { title: page.label, module, page, pageScript: "/js/schedule-board.js?v=20260828-frozen-metrics-1", ...common(module.slug) });
  if (page.kind === "dashboard") return res.render("modules/executive-dashboard", { title: page.label, module, page, ...common(module.slug) });
  if (page.reportMode === "outgoing-delivery-matrix") return res.render("outgoing/report", { title: page.label, module, page, pageStyles: ["/css/outgoing-report.css?v=20260827-1"], pageScript: "/js/outgoing-report.js?v=20260827-1", ...common(module.slug) });
  if (page.reportMode === "purchase-pricing") return res.render("purchasing/pricing-report", { title: page.label, module, page, pageStyles: ["/css/purchasing-pricing-report.css?v=20260828-supplier-chart-1"], pageScript: "/js/purchasing-pricing-report.js?v=20260828-supplier-chart-1", ...common(module.slug) });
  if (page.reportMode === "production-cost-actual") return res.render("production/cost-report", { title: page.label, module, page, initialMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : jakartaMonthKey(), pageStyles: ["/css/production-cost-report.css?v=20260828-1"], pageScript: "/js/production-cost-report.js?v=20260828-1", ...common(module.slug) });
  if (page.kind === "report") return res.render("modules/report", { title: page.label, module, page, pageScript: "/js/module-report.js?v=20260818-inventory-matrix-8", ...common(module.slug) });
  if (moduleSlug === "production" && page.slug === "fg-receipt") {
    return res.render("production/fg-receipt", { title: page.label, module, page, pageScript: "/js/production-fg-receipt.js?v=20260806-1", ...common(module.slug) });
  }
  const isPurchaseRequisition = moduleSlug === "purchasing" && page.slug === "purchase-requisitions";
  const requestedCategory = String(req.query.category || "").toLowerCase();
  const supportedPurchaseCategories = new Set(["material", "purchase-part", "universal-purchase-part", "vendor-process", "non-production"]);
  const purchaseCategory = isPurchaseRequisition
    ? (supportedPurchaseCategories.has(requestedCategory) ? requestedCategory : "purchase-part")
    : null;
  const initialHorizonMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || "")) ? String(req.query.month) : "";
  return res.render("operations/dashboard", { title: page.label, module, page, purchaseCategory, initialHorizonMonth, pageScript: "/js/operations-dashboard.js?v=20260820-horizon-flow-1", ...common(module.slug) });
}
function renderOperationsDetail(res, req, moduleSlug) {
  const module = getModule(moduleSlug);
  const page = getPage(moduleSlug, req.params.page);
  if (!module || !page || !page.apiReady || page.kind !== "data") return res.status(404).render("errors/404", { title: `Detail ${module?.label || "operasional"} tidak ditemukan` });
  const requestedCategory = String(req.query.category || "").toLowerCase();
  const isPurchaseRequisition = moduleSlug === "purchasing" && page.slug === "purchase-requisitions";
  const supportedPurchaseCategories = new Set(["material", "purchase-part", "universal-purchase-part", "vendor-process", "non-production"]);
  const purchaseCategory = isPurchaseRequisition ? (supportedPurchaseCategories.has(requestedCategory) ? requestedCategory : "purchase-part") : null;
  return res.render("operations/detail", { title: `Detail ${page.label}`, module, page, recordKey: req.params.key, purchaseCategory, pageScript: "/js/operations-detail.js?v=20260908-step1", ...common(module.slug) });
}

router.get("/inventory", (req, res) => renderOperationsDashboard(res, req, "inventory", "stock-balances"));
function renderInventoryForm(res, req, mode) {
  const module = getModule("inventory"); const page = getPage("inventory", req.params.page);
  if (!page || !["stock-movements", "stock-opname", "stock-reservations"].includes(page.slug)) return res.status(404).render("errors/404", { title: "Form inventory tidak ditemukan" });
  const pageScript = page.slug === "stock-reservations" ? "/js/stock-reservation-form.js?v=20260813-auto-single-part-1" : "/js/inventory-form.js?v=20260812-multiple-1";
  return res.render("inventory/form", { title: `Buat ${page.label}`, module, page, mode, pageScript, ...common(module.slug) });
}
function renderStockOpnameCountForm(req, res) {
  const module = getModule("inventory");
  const page = getPage("inventory", "stock-opname");
  return res.render("inventory/stock-opname-count", {
    title: `Counting ${req.params.stoNo}`,
    module,
    page,
    stoNo: req.params.stoNo,
    pageScript: "/js/stock-opname-count.js?v=20260908-step1",
    ...common(module.slug),
  });
}
function renderSupplyChainForm(res, req, moduleSlug) {
  const module = getModule(moduleSlug); const page = getPage(moduleSlug, req.params.page);
  const valid = (moduleSlug === "incoming" && page?.slug === "goods-receipts") || (moduleSlug === "outgoing" && page?.slug === "delivery-schedules");
  if (!valid) return res.status(404).render("errors/404", { title: "Form transaksi tidak ditemukan" });
  return res.render("operations/supply-chain-form", { title: `Buat ${page.label}`, module, page, pageScript: "/js/supply-chain-form.js", ...common(module.slug) });
}
router.get("/inventory/:page/new", (req, res) => renderInventoryForm(res, req, "create"));
router.get("/inventory/stock-opname/:stoNo/count", renderStockOpnameCountForm);
router.get("/inventory/:page/:key", (req, res) => renderOperationsDetail(res, req, "inventory"));
router.get("/inventory/:page", (req, res) => renderOperationsDashboard(res, req, "inventory", "stock-balances"));
router.get("/production", (req, res) => renderOperationsDashboard(res, req, "production", "daily-production-schedules"));
function renderOeeMonitoring(req, res) {
  const module = getModule("production");
  const page = getPage("production", "oee-monitoring");
  const requestedDate = String(req.query.date || "");
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : jakartaDateKey();
  return res.render("production/oee-monitoring", {
    title: req.params.machineId ? "Detail Mesin · Monitoring OEE" : "Monitoring OEE",
    module, page, initialDate, machineId: req.params.machineId || "",
    pageScript: "/js/oee-monitoring.js?v=20260908-2", ...common(module.slug)
  });
}
router.get("/production/oee-monitoring", renderOeeMonitoring);
router.get("/production/oee-monitoring/:machineId", renderOeeMonitoring);
const legacyQcTarget = (req, page, suffix = "") => {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return `/modules/qc/${page}${suffix}${query}`;
};
router.get("/production/ng-dispositions", (req, res) => res.redirect(308, legacyQcTarget(req, "ng-dispositions")));
router.get("/production/ng-dispositions/:key", (req, res) => res.redirect(308, legacyQcTarget(req, "ng-dispositions", `/${encodeURIComponent(req.params.key)}`)));
router.get("/production/quality-inspections/new", (req, res) => res.redirect(308, legacyQcTarget(req, "quality-inspections", "/new")));
router.get("/production/quality-inspections/:key/edit", (req, res) => res.redirect(308, legacyQcTarget(req, "quality-inspections", `/${encodeURIComponent(req.params.key)}/edit`)));
router.get("/production/quality-inspections/:key", (req, res) => res.redirect(308, legacyQcTarget(req, "quality-inspections", `/${encodeURIComponent(req.params.key)}`)));
router.get("/production/quality-inspections", (req, res) => res.redirect(308, legacyQcTarget(req, "quality-inspections")));
router.get("/production/daily-production-schedules", (req, res) => {
  const module = getModule("production");
  const page = getPage("production", "daily-production-schedules");
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : jakartaDateKey();
  return res.render("production/execution-matrix", { title: "Daily Production Schedule", module, page, initialDate, pageScript: "", ...common(module.slug) });
});
function renderProductionForm(res, req, mode) {
  const module = getModule("production"); const page = getPage("production", req.params.page);
  const shared = new Set([...editableProductionPages, "vendor-process-orders"]);
  if (!page || !["production-logs", "daily-production-schedules", ...shared].includes(page.slug)) return res.status(404).render("errors/404", { title: "Form production tidak ditemukan" });
  if (page.slug === "daily-production-schedules") return res.render("production/schedule-form", { title: `${mode === "edit" ? "Revisi" : "Buat"} Daily Production Schedule`, module, page, mode, recordKey: req.params.key || "", pageScript: "/js/production-schedule-form.js", ...common(module.slug) });
  if (page.slug === "production-logs") return res.render("production/log-form", { title: `${mode === "edit" ? "Edit" : "Buat"} Production Entry`, module, page, mode, recordKey: req.params.key || "", pageScript: "/js/production-log-form.js?v=20260908-erp-masters-1", ...common(module.slug) });
  return res.render("production/shared-form", { title: `${mode === "edit" ? "Edit" : "Buat"} ${page.label}`, module, page, mode, recordKey: req.params.key || "", pageScript: "/js/production-shared-form.js", ...common(module.slug) });
}
router.get("/production/:page/new", (req, res) => renderProductionForm(res, req, "create"));
router.get("/production/:page/:key/edit", (req, res) => renderProductionForm(res, req, "edit"));
router.get("/production/:page/:key", (req, res) => renderOperationsDetail(res, req, "production"));
router.get("/production/:page", (req, res) => renderOperationsDashboard(res, req, "production", "manufacturing-orders"));
router.get("/qc", (_req, res) => res.redirect(308, "/modules/qc/ng-dispositions"));
function renderQcForm(res, req, mode) {
  const module = getModule("qc");
  const page = getPage("qc", req.params.page);
  if (!page || page.slug !== "quality-inspections") return res.status(404).render("errors/404", { title: "Form QC tidak ditemukan" });
  return res.render("production/shared-form", { title: `${mode === "edit" ? "Edit" : "Buat"} ${page.label}`, module, page, mode, recordKey: req.params.key || "", pageScript: "/js/production-shared-form.js?v=20260826-qc-module-1", ...common(module.slug) });
}
router.get("/qc/:page/new", (req, res) => renderQcForm(res, req, "create"));
router.get("/qc/:page/:key/edit", (req, res) => renderQcForm(res, req, "edit"));
router.get("/qc/:page/:key", (req, res) => renderOperationsDetail(res, req, "qc"));
router.get("/qc/:page", (req, res) => renderOperationsDashboard(res, req, "qc", "ng-dispositions"));
router.get("/purchasing", (req, res) => renderOperationsDashboard(res, req, "purchasing", "purchase-requisitions"));
function renderPurchaseRequisitionForm(res, req, mode) {
  const module = getModule("purchasing");
  const page = getPage("purchasing", "purchase-requisitions");
  const requestedCategory = String(req.query.category || "").toLowerCase();
  const supportedPurchaseCategories = new Set(["material", "purchase-part", "universal-purchase-part", "vendor-process", "non-production"]);
  const purchaseCategory = supportedPurchaseCategories.has(requestedCategory) ? requestedCategory : "purchase-part";
  return res.render("purchasing/pr-form", {
    title: mode === "edit" ? "Edit Purchase Requisition" : "Buat Purchase Requisition",
    module,
    page,
    mode,
    recordKey: req.params.key || "",
    purchaseCategory,
      pageScript: "/js/purchasing-pr-form.js?v=20260908-pr-reference-1",
    ...common(module.slug),
  });
}
function renderPurchaseInvoiceForm(res, req, mode) {
  const module = getModule("purchasing");
  const page = getPage("purchasing", "purchase-invoices");
  return res.render("purchasing/invoice-form", {
    title: mode === "edit" ? "Edit Purchase Invoice" : "Buat Purchase Invoice",
    module,
    page,
    mode,
    recordKey: req.params.key || "",
    ...common(module.slug),
  });
}
function renderPurchaseOrderForm(res, req, mode) {
  const module = getModule("purchasing");
  const page = getPage("purchasing", "purchase-order");
  return res.render("purchasing/po-form", {
    title: mode === "edit" ? "Edit Purchase Order" : "Buat Purchase Order",
    module,
    page,
    mode,
    recordKey: req.params.key || "",
    ...common(module.slug),
  });
}
router.get("/purchasing/purchase-requisitions/new", (req, res) => renderPurchaseRequisitionForm(res, req, "create"));
router.get("/purchasing/purchase-requisitions/:key/edit", (req, res) => renderPurchaseRequisitionForm(res, req, "edit"));
router.get("/purchasing/purchase-order/new", (req, res) => renderPurchaseOrderForm(res, req, "create"));
router.get("/purchasing/purchase-order/:key/edit", (req, res) => renderPurchaseOrderForm(res, req, "edit"));
router.get("/purchasing/purchase-invoices/new", (req, res) => renderPurchaseInvoiceForm(res, req, "create"));
router.get("/purchasing/purchase-invoices/:key/edit", (req, res) => renderPurchaseInvoiceForm(res, req, "edit"));
router.get("/purchasing/:page/:key", (req, res) => renderOperationsDetail(res, req, "purchasing"));
router.get("/purchasing/:page", (req, res) => renderOperationsDashboard(res, req, "purchasing", "purchase-requisitions"));
router.get("/incoming", (req, res) => renderOperationsDashboard(res, req, "incoming", "goods-receipts"));
router.get("/incoming/incoming-from-vendor/:key", (req, res) => {
  const module = getModule("incoming");
  const page = getPage("incoming", "incoming-from-vendor");
  if (!module || !page) return res.status(404).render("errors/404", { title: "Incoming from Vendor tidak ditemukan" });
  return res.render("incoming/vendor-receipt", {
    title: `Terima ${req.params.key}`,
    module,
    page,
    recordKey: req.params.key,
    pageStyles: ["/vendor/tabulator/css/tabulator.min.css"],
    pageScript: "/js/vendor-receipt.js?v=20260827-tabulator-tabs-1",
    ...common(module.slug),
  });
});
router.get("/incoming/:page/new", (req, res) => renderSupplyChainForm(res, req, "incoming"));
router.get("/incoming/:page/:key", (req, res) => renderOperationsDetail(res, req, "incoming"));
router.get("/incoming/:page", (req, res) => renderOperationsDashboard(res, req, "incoming", "goods-receipts"));
router.get("/outgoing", (req, res) => renderOperationsDashboard(res, req, "outgoing", "delivery-orders"));
router.get("/outgoing/:page/new", (req, res) => renderSupplyChainForm(res, req, "outgoing"));
router.get("/outgoing/:page/:key", (req, res) => renderOperationsDetail(res, req, "outgoing"));
router.get("/outgoing/:page", (req, res) => renderOperationsDashboard(res, req, "outgoing", "delivery-orders"));

router.get("/:module", (req, res) => {
  const module = getModule(req.params.module);
  if (!module) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  res.render("modules/hub", { title: module.label, module, ...common(module.slug) });
});

router.get("/:module/:page", (req, res) => {
  const module = getModule(req.params.module); const page = getPage(req.params.module, req.params.page);
  if (!module || !page) return res.status(404).render("errors/404", { title: "Menu tidak ditemukan" });
  if (page.kind === "dashboard") return res.render("modules/executive-dashboard", { title: page.label, module, page, ...common(module.slug) });
  if (page.kind === "report") return res.render("modules/report", { title: page.label, module, page, pageScript: "/js/module-report.js?v=20260818-inventory-matrix-8", ...common(module.slug) });
  res.render("modules/list", { title: page.label, module, page, pageScript: "/js/module-list.js", ...common(module.slug) });
});

module.exports = router;
