const express = require("express");
const { getEntity, getGroups, getPermissionCatalog } = require("../masterDataRegistry");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

function pageData(config = null) {
  const groups = getGroups();
  const currentGroup = config ? groups.find((group) => group.title === config.group) : null;
  return {
    requiresAuth: true,
    socketUrl: process.env.SOCKET_URL || "http://localhost:5017",
    mqttUrl: process.env.MQTT_URL || "",
    activeSubnav: config?.label || "",
    subnavItems: currentGroup?.items || [],
    groups
  };
}

function requireConfig(req, res) {
  const config = getEntity(req.params.entity);
  if (!config) {
    res.status(404).json({ message: "Modul Master Data tidak ditemukan." });
    return null;
  }
  return config;
}

function authHeader(req) {
  const headers = {};
  ["authorization", "x-page-module", "x-page-code", "x-page-record"].forEach((name) => {
    const value = req.get(name);
    if (value) headers[name] = value;
  });
  return headers;
}

function backendOffline(error) {
  return error?.cause?.code === "ECONNREFUSED" || error?.name === "TimeoutError" || error?.name === "AbortError";
}

async function readBackend(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function sendBackendError(res, response, payload) {
  return res.status(response.status).json({
    code: payload.code,
    message: payload.message || `Backend merespons ${response.status}.`,
    errors: payload.errors
  });
}

function nestedValue(object, path) { return String(path || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object); }
function sortRows(rows, field, direction) {
  if (!field) return rows;
  const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
  return [...rows].sort((left, right) => {
    const a = nestedValue(left, field);
    const b = nestedValue(right, field);
    if (a == null && b != null) return 1;
    if (b == null && a != null) return -1;
    const result = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a ?? ""), String(b ?? ""));
    return direction === "desc" ? -result : result;
  });
}

router.get("/", (_req, res) => {
  res.render("master-data/index", { title: "Master Data", groups: getGroups(), ...pageData() });
});

router.get("/items", (_req, res) => res.redirect("/master-data/products"));

router.get("/formulas", (_req, res) => res.render("master-data/formulas", { title: "Master Formula", pageScript: "/js/master-formulas.js?v=20260827-dropdown-1", ...pageData() }));
router.get("/api/formulas", async (req, res) => {
  try { const url = new URL(`${backendUrl}/api/system/master-formulas`); Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, String(v))); const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) }); const payload = await readBackend(response); if (!response.ok) return sendBackendError(res, response, payload); res.json(payload); }
  catch (error) { res.status(503).json({ message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Tidak dapat mengambil formula." }); }
});
router.post("/api/formulas/simulate", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/master-formulas" }, "POST", "/simulate"));
router.post("/api/formulas", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/master-formulas" }, "POST"));
router.patch("/api/formulas/:id", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/master-formulas" }, "PATCH", `/${encodeURIComponent(req.params.id)}`));
router.delete("/api/formulas/:id", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/master-formulas" }, "DELETE", `/${encodeURIComponent(req.params.id)}`));

router.get("/api/excel-imports", async (req, res) => {
  try {
    const url = new URL(`${backendUrl}/api/system/excel-imports`);
    Object.entries(req.query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res, response, payload);
    res.json(payload);
  } catch (error) { res.status(503).json({ message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Tidak dapat mengambil batch import." }); }
});
router.post("/api/excel-imports/preview", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", "/preview"));
router.post("/api/excel-imports/upload-preview", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", "/upload-preview"));
router.post("/api/excel-imports/forecast-preview", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", "/forecast-preview"));
router.post("/api/excel-imports/historical-preview", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", "/historical-preview"));
router.post("/api/excel-imports/legacy-preview", (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", "/legacy-preview"));
router.post("/api/excel-imports/legacy-stage", (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", "/legacy-stage"));
router.post("/api/excel-imports/:key/apply-legacy", (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", `/${encodeURIComponent(req.params.key)}/apply-legacy`));
for (const [route, endpoint] of [
  ["/api/excel-imports/:key/legacy-report", req => `/${encodeURIComponent(req.params.key)}/legacy-report`],
  ["/api/excel-imports/legacy-template/:kind", req => `/legacy-template/${encodeURIComponent(req.params.kind)}`],
]) router.get(route, async (req, res) => {
  try {
    const response = await fetch(`${backendUrl}/api/system/excel-imports${endpoint(req)}`, { headers: authHeader(req), signal: AbortSignal.timeout(30000) });
    res.status(response.status);
    for (const name of ["content-type", "content-disposition"]) { const value = response.headers.get(name); if (value) res.setHeader(name, value); }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.status(502).json({ message: "Template/laporan migrasi belum dapat dimuat." }); }
});
router.post("/api/excel-imports", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST"));
router.patch("/api/excel-imports/:key/approve", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "PATCH", `/${encodeURIComponent(req.params.key)}/approve`));
router.post("/api/excel-imports/:key/apply-forecast", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", `/${encodeURIComponent(req.params.key)}/apply-forecast`));
router.post("/api/excel-imports/:key/apply-historical", async (req, res) => proxyMutation(req, res, { endpoint: "/api/system/excel-imports" }, "POST", `/${encodeURIComponent(req.params.key)}/apply-historical`));

router.get("/api/foundation/supplier-items", async (req, res) => {
  try {
    const url = new URL(`${backendUrl}/api/master-data/foundation/supplier-items`);
    Object.entries(req.query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res, response, payload);
    res.json(payload);
  } catch (error) {
    res.status(503).json({ message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Tidak dapat mengambil Supplier Item." });
  }
});

// Dedicated proxy preserves hierarchy filters and pagination for the two
// master screens. Backend authorization remains authoritative for each action.
router.get("/hmi-api/:kind", async (req, res) => {
  try {
    const url = new URL(`${backendUrl}/api/master-data/hmi-reasons/${encodeURIComponent(req.params.kind)}`);
    for (const [key,value] of Object.entries(req.query)) if (typeof value === "string") url.searchParams.set(key,value);
    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res,response,payload);
    res.json(payload);
  } catch (error) { res.status(503).json({ message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Master tidak dapat dimuat." }); }
});
router.post("/hmi-api/:kind", (req,res) => proxyMutation(req,res,{ endpoint: `/api/master-data/hmi-reasons/${encodeURIComponent(req.params.kind)}` },"POST"));
router.patch("/hmi-api/:kind/:id", (req,res) => proxyMutation(req,res,{ endpoint: `/api/master-data/hmi-reasons/${encodeURIComponent(req.params.kind)}/${encodeURIComponent(req.params.id)}` },"PATCH"));
router.post("/hmi-api/:kind/:id/:action", (req,res) => {
  if (!["archive","restore"].includes(req.params.action)) return res.status(404).json({ message:"Aksi tidak ditemukan." });
  return proxyMutation(req,res,{ endpoint: `/api/master-data/hmi-reasons/${encodeURIComponent(req.params.kind)}/${encodeURIComponent(req.params.id)}/${req.params.action}` },"POST");
});

router.get("/api/:entity/generate-code", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config || !config.generateCode) return;
  try {
    const response = await fetch(`${backendUrl}${config.endpoint}/generate-code`, { headers: authHeader(req), signal: AbortSignal.timeout(10000) });
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res, response, payload);
    res.json(payload);
  } catch (error) {
    res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Gagal membuat kode otomatis." });
  }
});

router.get("/api/:entity", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  const draw = Number(req.query.draw || 1);
  const start = Math.max(Number(req.query.start || 0), 0);
  const length = Math.min(Math.max(Number(req.query.length || 20), 1), 500);
  const page = Math.floor(start / length) + 1;
  const search = String(req.query["search[value]"] || req.query.q || "").trim();
  const orderColumn = Number(req.query["order[0][column]"]);
  const requestedName = Number.isInteger(orderColumn) ? String(req.query[`columns[${orderColumn}][name]`] || "").trim() : "";
  const sortColumn = requestedName
    ? config.columns.find((column) => column.data === requestedName)
    : Number.isFinite(orderColumn) ? config.columns[orderColumn - 1] : null;
  const sortDirection = req.query["order[0][dir]"] === "desc" ? "desc" : "asc";
  const canSortLocally = Boolean(sortColumn && start + length <= 500);

  try {
    const url = new URL(`${backendUrl}${config.endpoint}`);
    const fetchLength = canSortLocally ? start + length : length;
    url.searchParams.set("page", canSortLocally ? "1" : String(page));
    url.searchParams.set("limit", String(fetchLength));
    if (search) url.searchParams.set("q", search);

    if (sortColumn?.data) {
      url.searchParams.set("sortBy", sortColumn.data);
      url.searchParams.set("sortOrder", sortDirection);
      url.searchParams.set("sort", `${sortColumn.data}:${sortDirection}`);
    }

    const reserved = /^(draw|start|length|q|search\[|order\[|columns\[|_)|^entity$/;
    Object.entries(req.query).forEach(([key, value]) => {
      if (!reserved.test(key) && typeof value === "string" && value !== "") url.searchParams.set(key, value);
    });

    const response = await fetch(url, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res, response, payload);
    const items = Array.isArray(payload) ? payload : (payload.items || payload.data || []);
    const total = Number(payload.total ?? payload.count ?? items.length);
    const sorted = sortRows(items, sortColumn?.data, sortDirection);
    const data = canSortLocally ? sorted.slice(start, start + length) : sorted;
    res.json({ draw, recordsTotal: total, recordsFiltered: Number(payload.filteredTotal ?? payload.filtered ?? total), data });
  } catch (error) {
    res.status(503).json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], code: "BACKEND_UNAVAILABLE", message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Tidak dapat mengambil data dari backend." });
  }
});

router.get('/vendor-bom-prices/context/:id', async (req,res) => {
  try {
    const response=await fetch(`${backendUrl}/api/master-data/vendor-price-lists/bom-context/${encodeURIComponent(req.params.id)}`,{headers:authHeader(req),signal:AbortSignal.timeout(15000)});
    const payload=await readBackend(response); if(!response.ok) return sendBackendError(res,response,payload);res.json(payload);
  } catch(error) {res.status(503).json({message:'Data harga dan BOM belum dapat dimuat.'});}
});
router.post('/vendor-bom-prices/preview',(req,res)=>proxyMutation(req,res,{endpoint:'/api/master-data/vendor-price-lists'},'POST','/bom-preview'));
router.post('/vendor-bom-prices/save',(req,res)=>proxyMutation(req,res,{endpoint:'/api/master-data/vendor-price-lists'},'POST','/bom-save'));

router.get("/api/:entity/:key", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  try {
    const response = await fetch(`${backendUrl}${config.endpoint}/${encodeURIComponent(req.params.key)}${config.monthlyPricing && req.query.monthlyForm === "true" ? "?monthlyForm=true" : ""}`, { headers: authHeader(req), signal: AbortSignal.timeout(10000) });
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res, response, payload);
    res.json(payload);
  } catch (error) {
    res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Tidak dapat membuka detail data." });
  }
});

async function proxyMutation(req, res, config, method, suffix = "") {
  const isMultipart = req.is("multipart/form-data");
  const headers = authHeader(req);
  const options = { method, headers, signal: AbortSignal.timeout(30000) };
  if (isMultipart) {
    headers["content-type"] = req.get("content-type");
    options.body = req;
    options.duplex = "half";
  } else {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(req.body || {});
  }
  try {
    const response = await fetch(`${backendUrl}${config.endpoint}${suffix}`, options);
    const payload = await readBackend(response);
    if (!response.ok) return sendBackendError(res, response, payload);
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Perubahan data gagal dikirim ke backend." });
  }
}

router.post("/api/:entity/bulk-remove", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  return proxyMutation(req, res, config, config.bulkMethod, config.bulkPath);
});

router.post("/api/parts/shift-process-sequences", async (req, res) => {
  const config = getEntity("parts");
  return proxyMutation(req, res, config, "POST", "/shift-process-sequences");
});

router.post("/api/:entity", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  return proxyMutation(req, res, config, "POST");
});

router.patch("/api/:entity/:id", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  return proxyMutation(req, res, config, config.updateMethod, `/${encodeURIComponent(req.params.id)}`);
});

router.delete("/api/:entity/:id", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  return proxyMutation(req, res, config, config.removeMethod, `/${encodeURIComponent(req.params.id)}${config.removeSuffix}`);
});

router.get("/:entity/new", (req, res) => {
  const config = getEntity(req.params.entity);
  if (!config) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  res.render(config.formView || "master-data/entity-form", { title: `Tambah ${config.singular}`, config, mode: "create", recordId: "", recordKey: "", pageScript: config.formPageScript || "/js/entity-form.js?v=20260908-inheritance-1", ...pageData(config) });
});

router.get("/:entity/:id/edit", (req, res) => {
  const config = getEntity(req.params.entity);
  if (!config) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  res.render(config.formView || "master-data/entity-form", { title: `Edit ${config.singular}`, config, mode: "edit", recordId: req.params.id, recordKey: String(req.query.key || req.params.id), pageScript: config.formPageScript || "/js/entity-form.js?v=20260908-inheritance-1", ...pageData(config) });
});

router.get("/:entity/:key", (req, res) => {
  const config = getEntity(req.params.entity);
  if (!config) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  res.render(config.detailView || "master-data/entity-detail", { title: `Detail ${config.singular}`, config, recordKey: req.params.key, pageScript: config.detailPageScript || "/js/entity-detail.js?v=20260827-part-files-2", ...pageData(config) });
});

router.get("/:entity", (req, res) => {
  const config = getEntity(req.params.entity);
  if (!config) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  if (config.customView) {
    return res.render(config.customView, {
      title: config.label,
      config,
      permissionCatalog: getPermissionCatalog(),
      pageScript: config.pageScript,
      ...pageData(config)
    });
  }
  res.render("master-data/entity-list", { title: config.label, config, pageScript: "/js/entity-list.js?v=20260908-plain-pricing-list-1", ...pageData(config) });
});

module.exports = router;
