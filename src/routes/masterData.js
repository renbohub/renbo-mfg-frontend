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
  const authorization = req.get("authorization");
  return authorization ? { authorization } : {};
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

router.get("/", (_req, res) => {
  res.render("master-data/index", { title: "Master Data", groups: getGroups(), ...pageData() });
});

router.get("/items", (_req, res) => res.redirect("/master-data/products"));

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

  try {
    const url = new URL(`${backendUrl}${config.endpoint}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(length));
    if (search) url.searchParams.set("q", search);

    const orderColumn = Number(req.query["order[0][column]"]);
    const sortColumn = Number.isFinite(orderColumn) ? config.columns[orderColumn - 1] : null;
    if (sortColumn?.data && !sortColumn.data.includes(".")) {
      url.searchParams.set("sortBy", sortColumn.data);
      url.searchParams.set("sortOrder", req.query["order[0][dir]"] === "desc" ? "desc" : "asc");
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
    res.json({ draw, recordsTotal: total, recordsFiltered: total, data: items });
  } catch (error) {
    res.status(503).json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], code: "BACKEND_UNAVAILABLE", message: backendOffline(error) ? `Backend belum aktif di ${backendUrl}.` : "Tidak dapat mengambil data dari backend." });
  }
});

router.get("/api/:entity/:key", async (req, res) => {
  const config = requireConfig(req, res);
  if (!config) return;
  try {
    const response = await fetch(`${backendUrl}${config.endpoint}/${encodeURIComponent(req.params.key)}`, { headers: authHeader(req), signal: AbortSignal.timeout(10000) });
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
  res.render("master-data/entity-form", { title: `Tambah ${config.singular}`, config, mode: "create", recordId: "", recordKey: "", pageScript: "/js/entity-form.js", ...pageData(config) });
});

router.get("/:entity/:id/edit", (req, res) => {
  const config = getEntity(req.params.entity);
  if (!config) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  res.render("master-data/entity-form", { title: `Edit ${config.singular}`, config, mode: "edit", recordId: req.params.id, recordKey: String(req.query.key || req.params.id), pageScript: "/js/entity-form.js", ...pageData(config) });
});

router.get("/:entity/:key", (req, res) => {
  const config = getEntity(req.params.entity);
  if (!config) return res.status(404).render("errors/404", { title: "Modul tidak ditemukan" });
  res.render("master-data/entity-detail", { title: `Detail ${config.singular}`, config, recordKey: req.params.key, pageScript: "/js/entity-detail.js", ...pageData(config) });
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
  res.render("master-data/entity-list", { title: config.label, config, pageScript: "/js/entity-list.js", ...pageData(config) });
});

module.exports = router;
