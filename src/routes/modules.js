const express = require("express");
const { modules, getModule, getPage } = require("../moduleRegistry");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

function common(activeModule = "") {
  return { requiresAuth: true, modules, activeModule, socketUrl: process.env.SOCKET_URL || "http://localhost:5017", mqttUrl: process.env.MQTT_URL || "" };
}
function authHeader(req) { const authorization = req.get("authorization"); return authorization ? { authorization } : {}; }
function findConfig(req, res) {
  const module = getModule(req.params.module);
  const page = getPage(req.params.module, req.params.page);
  if (!module || !page) { res.status(404).json({ message: "Menu modul tidak ditemukan." }); return null; }
  return { module, page };
}
async function readBackend(response) { const value = await response.text(); if (!value) return {}; try { return JSON.parse(value); } catch { return { message: value }; } }
function isOffline(error) { return error?.cause?.code === "ECONNREFUSED" || error?.name === "TimeoutError" || error?.name === "AbortError"; }

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

async function proxyPageMutation(req, res, endpoint, method, suffix = "") {
  try {
    const response = await fetch(`${backendUrl}${endpoint}${suffix}`, {
      method,
      headers: { ...authHeader(req), "content-type": "application/json" },
      body: ["GET", "DELETE"].includes(method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(30000)
    });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, code: payload.code, errors: payload.errors, capacity: payload.capacity });
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(503).json({ message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Perubahan gagal dikirim ke backend." });
  }
}

router.get("/", (_req, res) => res.render("modules/index", { title: "Pilih Modul", ...common() }));

router.get("/api/sales/:page/generate-number", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "GET", "/generate-number");
});
router.get("/api/planning-ppic/mrp/generate-number", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "GET", "/generate-number"));
router.get("/api/planning-ppic/mps/monthly-summary", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "GET", "/monthly-summary"));
router.get("/api/planning-ppic/mrp/general-summary", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "GET", "/general-summary"));
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

router.get("/api/:module/:page", async (req, res) => {
  const config = findConfig(req, res); if (!config) return;
  const { page: pageConfig } = config;
  const draw = Number(req.query.draw || 1);
  if (!pageConfig.apiReady || !pageConfig.endpoint) return res.json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], apiReady: false });
  const start = Math.max(Number(req.query.start || 0), 0);
  const length = Math.min(Math.max(Number(req.query.length || 20), 1), 500);
  try {
    const url = new URL(`${backendUrl}${pageConfig.endpoint}`);
    url.searchParams.set("page", String(Math.floor(start / length) + 1));
    url.searchParams.set("limit", String(length));
    const search = String(req.query["search[value]"] || req.query.q || "").trim();
    if (search) { url.searchParams.set("q", search); url.searchParams.set("search", search); }
    ["partId", "isDeleted", "includeDetails"].forEach((key) => {
      if (req.query[key] !== undefined && req.query[key] !== "") url.searchParams.set(key, String(req.query[key]));
    });
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    if (!response.ok) return res.status(response.status).json({ message: payload.message || `Backend merespons ${response.status}.`, code: payload.code });
    const candidate = Array.isArray(payload) ? payload : (payload.items || payload.data || payload.results || []);
    const items = Array.isArray(candidate) ? candidate : [];
    const total = Number(payload.total ?? payload.count ?? payload.pagination?.total ?? items.length);
    res.json({ draw, recordsTotal: total, recordsFiltered: total, data: items, apiReady: true, report: pageConfig.kind === "report" ? payload : undefined });
  } catch (error) {
    res.status(503).json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], code: "BACKEND_UNAVAILABLE", message: isOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Data gagal diambil dari backend." });
  }
});

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

router.post("/api/manufacturing-bom/bill-of-materials", (req, res) => proxyBomMutation(req, res, "POST"));
router.patch("/api/manufacturing-bom/bill-of-materials/:id", (req, res) => proxyBomMutation(req, res, "PATCH", `/${encodeURIComponent(req.params.id)}`));
router.delete("/api/manufacturing-bom/bill-of-materials/:noReg", (req, res) => proxyBomMutation(req, res, "DELETE", `/${encodeURIComponent(req.params.noReg)}`));
router.get("/api/manufacturing-bom/bill-of-materials/drafts", (req, res) => proxyBomMutation(req, res, "GET", "/drafts"));
router.get("/api/manufacturing-bom/bill-of-materials/drafts/:id", (req, res) => proxyBomMutation(req, res, "GET", `/drafts/${encodeURIComponent(req.params.id)}`));
router.post("/api/manufacturing-bom/bill-of-materials/drafts", (req, res) => proxyBomMutation(req, res, "POST", "/drafts"));
router.patch("/api/manufacturing-bom/bill-of-materials/drafts/:id", (req, res) => proxyBomMutation(req, res, "PATCH", `/drafts/${encodeURIComponent(req.params.id)}`));
router.post("/api/manufacturing-bom/bill-of-materials/drafts/:id/complete", (req, res) => proxyBomMutation(req, res, "POST", `/drafts/${encodeURIComponent(req.params.id)}/complete`));

router.post("/api/sales/:page", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "POST");
});
router.patch("/api/sales/:page/:key", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "PATCH", `/${encodeURIComponent(req.params.key)}`);
});
router.delete("/api/sales/:page/:key", (req, res) => {
  const page = getPage("sales", req.params.page); if (!page) return res.status(404).json({ message: "Menu Sales tidak ditemukan." });
  return proxyPageMutation(req, res, page.endpoint, "DELETE", `/${encodeURIComponent(req.params.key)}`);
});
router.post("/api/sales/quotations/:key/make-to-so", (req, res) => proxyPageMutation(req, res, "/api/sales/quotations", "POST", `/${encodeURIComponent(req.params.key)}/make-to-so`));

router.post("/api/planning-ppic/mps/from-forecast", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "POST", "/from-forecast"));
router.patch("/api/planning-ppic/mps/:key/adjustments", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/adjustments`));
router.patch("/api/planning-ppic/mps/:key/confirm", (req, res) => proxyPageMutation(req, res, "/api/planning/mps", "PATCH", `/${encodeURIComponent(req.params.key)}/confirm`));
router.post("/api/planning-ppic/mrp/run", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", "/run"));
router.patch("/api/planning-ppic/mrp/:key/requirements/buffer", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "PATCH", `/${encodeURIComponent(req.params.key)}/requirements/buffer`));
router.patch("/api/planning-ppic/mrp/:key/requirements/order-percent", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "PATCH", `/${encodeURIComponent(req.params.key)}/requirements/order-percent`));
router.post("/api/planning-ppic/mrp/:key/output/purchase-request", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", `/${encodeURIComponent(req.params.key)}/output/purchase-request`));
router.post("/api/planning-ppic/mrp/:key/output/production-plan", (req, res) => proxyPageMutation(req, res, "/api/planning/mrp", "POST", `/${encodeURIComponent(req.params.key)}/output/production-plan`));
router.post("/api/planning-ppic/monthly-plan/from-mps", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", "/from-mps"));
router.post("/api/planning-ppic/monthly-plan/:key/confirm", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/confirm`));
router.post("/api/planning-ppic/monthly-plan/:key/release", (req, res) => proxyPageMutation(req, res, "/api/planning/monthly-production-plans", "POST", `/${encodeURIComponent(req.params.key)}/release`));
router.post("/api/planning-ppic/monthly-plan/:key/release-mos", (req, res) => proxyPageMutation(req, res, "/api/production/manufacturing-orders", "POST", "/bulk-create"));

const productionWorkflowActions = {
  "manufacturing-orders": { "availability-check": "GET", release: "PATCH", start: "PATCH", "generate-work-orders": "POST" },
  "work-orders": { start: "PATCH" },
  "daily-production-schedules": { release: "POST", start: "POST" },
  "production-logs": { submit: "PATCH" }
};
router.post("/api/production-workflow/:page/:key/:action", (req, res) => {
  const page = getPage("production", req.params.page);
  const method = productionWorkflowActions[req.params.page]?.[req.params.action];
  if (!page?.endpoint || !method) return res.status(404).json({ message: "Workflow Production tidak tersedia untuk dokumen ini." });
  const suffix = `/${encodeURIComponent(req.params.key)}/${encodeURIComponent(req.params.action)}`;
  return proxyPageMutation(req, res, page.endpoint, method, suffix);
});
const purchasingWorkflowActions = {
  "purchase-order": { "submit-checking": "PATCH", approve: "PATCH", send: "PATCH", confirm: "PATCH" }
};
router.post("/api/purchasing-workflow/:page/:key/:action", (req, res) => {
  const page = getPage("purchasing", req.params.page);
  const method = purchasingWorkflowActions[req.params.page]?.[req.params.action];
  if (!page?.endpoint || !method) return res.status(404).json({ message: "Workflow Purchasing tidak tersedia untuk dokumen ini." });
  const suffix = `/${encodeURIComponent(req.params.key)}/${encodeURIComponent(req.params.action)}`;
  return proxyPageMutation(req, res, page.endpoint, method, suffix);
});

function renderSales(res, req, view, mode = "") {
  const module = getModule("sales"); const page = getPage("sales", req.params.page);
  if (!page) return res.status(404).render("errors/404", { title: "Menu Sales tidak ditemukan" });
  return res.render(view, { title: page.label, module, page, mode, recordKey: req.params.key || "", pageScript: `/js/sales-${view.split("/").pop()}.js`, ...common(module.slug) });
}
router.get("/sales/:page/new", (req, res) => renderSales(res, req, "sales/form", "create"));
router.get("/sales/:page/:key/edit", (req, res) => renderSales(res, req, "sales/form", "edit"));
router.get("/sales/:page/:key", (req, res) => renderSales(res, req, "sales/detail"));
router.get("/sales/:page", (req, res) => renderSales(res, req, "sales/list"));

function renderPpic(res, tab = "mrp") {
  const module = getModule("planning-ppic");
  tab = { "material-requirements-planning": "mrp", "master-production-schedule": "mps" }[tab] || tab;
  const ppicTabs = { mrp: "MRP", mps: "MPS", "monthly-plan": "Monthly Plan", "consume-forecast": "Consume Forecast", "capacity-planning": "Capacity Planning" };
  if (!ppicTabs[tab]) return res.status(404).render("errors/404", { title: "Menu PPIC tidak ditemukan" });
  if (tab === "capacity-planning") return res.render("ppic/capacity", { title: ppicTabs[tab], module, activePpicTab: tab, pageScript: "/js/ppic-capacity.js", ...common(module.slug) });
  return res.render("ppic/dashboard", { title: ppicTabs[tab], module, activePpicTab: tab, pageScript: "/js/ppic-dashboard.js", ...common(module.slug) });
}
function renderPpicGeneral(res, tab) {
  const module = getModule("planning-ppic");
  if (!["mrp", "mps"].includes(tab)) return res.status(404).render("errors/404", { title: "Menu PPIC tidak ditemukan" });
  return res.render("ppic/general", { title: `${tab.toUpperCase()} General`, module, activePpicTab: tab, pageScript: "/js/ppic-general.js", ...common(module.slug) });
}
function renderPpicDetail(res, req) {
  const module = getModule("planning-ppic");
  const tab = { "material-requirements-planning": "mrp", "master-production-schedule": "mps" }[req.params.tab] || req.params.tab;
  const ppicTabs = { mrp: "MRP", mps: "MPS", "monthly-plan": "Monthly Plan", "consume-forecast": "Consume Forecast" };
  if (!ppicTabs[tab]) return res.status(404).render("errors/404", { title: "Menu PPIC tidak ditemukan" });
  return res.render("ppic/detail", { title: `${ppicTabs[tab]} Detail`, module, activePpicTab: tab, recordKey: req.params.key, pageScript: "/js/ppic-detail.js", ...common(module.slug) });
}
router.get("/planning-ppic", (_req, res) => renderPpic(res, "mrp"));
router.get("/planning-ppic/mrp/general", (_req, res) => renderPpicGeneral(res, "mrp"));
router.get("/planning-ppic/mps/general", (_req, res) => renderPpicGeneral(res, "mps"));
router.get("/planning-ppic/:tab/:key", (req, res) => renderPpicDetail(res, req));
router.get("/planning-ppic/:tab", (req, res) => renderPpic(res, req.params.tab));

router.get("/manufacturing-bom/bill-of-materials/new", (_req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/editor", { title: "BOM Generator", module, page, mode: "create", recordKey: "", pageScript: "/js/bom-editor.js", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/drafts/:id/edit", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/editor", { title: "Draft BOM Canvas", module, page, mode: "draft", recordKey: req.params.id, pageScript: "/js/bom-editor.js", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/:key/edit", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/editor", { title: "Edit BOM Canvas", module, page, mode: "edit", recordKey: req.params.key, pageScript: "/js/bom-editor.js", ...common(module.slug) });
});

router.get("/manufacturing-bom/bill-of-materials/:key/edit-table", (req, res) => {
  const module = getModule("manufacturing-bom"); const page = getPage("manufacturing-bom", "bill-of-materials");
  res.render("bom/table-editor", { title: "Edit BOM Table", module, page, recordKey: req.params.key, pageScript: "/js/bom-table-editor.js", ...common(module.slug) });
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
  res.render("bom/list", { title: "Bill of Materials", module, page, pageScript: "/js/bom-list.js", ...common(module.slug) });
});

function renderOperationsDashboard(res, req, moduleSlug, defaultPage) {
  const module = getModule(moduleSlug);
  const page = getPage(moduleSlug, req.params.page || defaultPage);
  if (!module || !page) return res.status(404).render("errors/404", { title: `Menu ${module?.label || "operasional"} tidak ditemukan` });
  if (page.kind === "report") return res.render("modules/report", { title: page.label, module, page, pageScript: "/js/module-report.js", ...common(module.slug) });
  return res.render("operations/dashboard", { title: page.label, module, page, pageScript: "/js/operations-dashboard.js", ...common(module.slug) });
}
function renderOperationsDetail(res, req, moduleSlug) {
  const module = getModule(moduleSlug);
  const page = getPage(moduleSlug, req.params.page);
  if (!module || !page || !page.apiReady || page.kind !== "data") return res.status(404).render("errors/404", { title: `Detail ${module?.label || "operasional"} tidak ditemukan` });
  return res.render("operations/detail", { title: `Detail ${page.label}`, module, page, recordKey: req.params.key, pageScript: "/js/operations-detail.js", ...common(module.slug) });
}

router.get("/inventory", (req, res) => renderOperationsDashboard(res, req, "inventory", "stock-balances"));
router.get("/inventory/:page/:key", (req, res) => renderOperationsDetail(res, req, "inventory"));
router.get("/inventory/:page", (req, res) => renderOperationsDashboard(res, req, "inventory", "stock-balances"));
router.get("/production", (req, res) => renderOperationsDashboard(res, req, "production", "manufacturing-orders"));
router.get("/production/:page/:key", (req, res) => renderOperationsDetail(res, req, "production"));
router.get("/production/:page", (req, res) => renderOperationsDashboard(res, req, "production", "manufacturing-orders"));
router.get("/purchasing", (req, res) => renderOperationsDashboard(res, req, "purchasing", "purchase-requisitions"));
router.get("/purchasing/:page/:key", (req, res) => renderOperationsDetail(res, req, "purchasing"));
router.get("/purchasing/:page", (req, res) => renderOperationsDashboard(res, req, "purchasing", "purchase-requisitions"));
router.get("/incoming", (req, res) => renderOperationsDashboard(res, req, "incoming", "goods-receipts"));
router.get("/incoming/:page/:key", (req, res) => renderOperationsDetail(res, req, "incoming"));
router.get("/incoming/:page", (req, res) => renderOperationsDashboard(res, req, "incoming", "goods-receipts"));
router.get("/outgoing", (req, res) => renderOperationsDashboard(res, req, "outgoing", "delivery-orders"));
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
  if (page.kind === "report") return res.render("modules/report", { title: page.label, module, page, pageScript: "/js/module-report.js", ...common(module.slug) });
  res.render("modules/list", { title: page.label, module, page, pageScript: "/js/module-list.js", ...common(module.slug) });
});

module.exports = router;
