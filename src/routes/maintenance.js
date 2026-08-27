const express = require("express");
const { modules } = require("../moduleRegistry");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

function authHeader(req) {
  const headers = {};
  ["authorization", "x-page-module", "x-page-code", "x-page-record"].forEach((name) => {
    const value = req.get(name);
    if (value) headers[name] = value;
  });
  return headers;
}

async function readBackend(response) {
  const value = await response.text();
  if (!value) return {};
  try { return JSON.parse(value); } catch { return { message: value }; }
}

function offline(error) { return error?.cause?.code === "ECONNREFUSED" || error?.name === "TimeoutError" || error?.name === "AbortError"; }

router.get("/", (_req, res) => res.render("maintenance/index", {
  title: "Maintenance Data",
  requiresAuth: true,
  modules,
  activeModule: "maintenance",
  socketUrl: process.env.SOCKET_URL || "http://localhost:5017",
  mqttUrl: process.env.MQTT_URL || "",
  pageScript: "/js/maintenance.js?v=20260825-source-reset-1",
}));

router.get("/api/demand-flow/status", async (req, res) => {
  try {
    const response = await fetch(`${backendUrl}/api/maintenance/demand-flow/status`, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    res.status(response.status).json(payload);
  } catch (error) { res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: offline(error) ? `Backend belum aktif di ${backendUrl}.` : "Status maintenance gagal dimuat." }); }
});

router.get("/api/planning-flow/status", async (req, res) => {
  try {
    const response = await fetch(`${backendUrl}/api/maintenance/planning-flow/status`, { headers: authHeader(req), signal: AbortSignal.timeout(15000) });
    const payload = await readBackend(response);
    res.status(response.status).json(payload);
  } catch (error) { res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: offline(error) ? `Backend belum aktif di ${backendUrl}.` : "Status planning reset gagal dimuat." }); }
});

router.post("/api/planning-flow/reset", async (req, res) => {
  try {
    const response = await fetch(`${backendUrl}/api/maintenance/planning-flow/reset`, {
      method: "POST",
      headers: { ...authHeader(req), "content-type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(120000),
    });
    const payload = await readBackend(response);
    res.status(response.status).json(payload);
  } catch (error) { res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: offline(error) ? `Backend belum aktif di ${backendUrl}.` : "Reset planning gagal dikirim." }); }
});

router.post("/api/demand-flow/reset", async (req, res) => {
  try {
    const response = await fetch(`${backendUrl}/api/maintenance/demand-flow/reset`, {
      method: "POST",
      headers: { ...authHeader(req), "content-type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(120000),
    });
    const payload = await readBackend(response);
    res.status(response.status).json(payload);
  } catch (error) { res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: offline(error) ? `Backend belum aktif di ${backendUrl}.` : "Reset maintenance gagal dikirim." }); }
});

router.get("/api/source-planning-reset/sources", async (req, res) => {
  try {
    const params = new URLSearchParams();
    ["sourceType", "query", "limit"].forEach((key) => {
      if (req.query[key] != null) params.set(key, String(req.query[key]));
    });
    const response = await fetch(`${backendUrl}/api/maintenance/source-planning-reset/sources?${params}`, {
      headers: authHeader(req),
      signal: AbortSignal.timeout(15000),
    });
    res.status(response.status).json(await readBackend(response));
  } catch (error) { res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: offline(error) ? `Backend belum aktif di ${backendUrl}.` : "Daftar sumber reset gagal dimuat." }); }
});

for (const action of ["preview", "reset"]) {
  router.post(`/api/source-planning-reset/${action}`, async (req, res) => {
    try {
      const response = await fetch(`${backendUrl}/api/maintenance/source-planning-reset/${action}`, {
        method: "POST",
        headers: { ...authHeader(req), "content-type": "application/json" },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(120000),
      });
      res.status(response.status).json(await readBackend(response));
    } catch (error) { res.status(503).json({ code: "BACKEND_UNAVAILABLE", message: offline(error) ? `Backend belum aktif di ${backendUrl}.` : "Reset planning gagal diproses." }); }
  });
}

module.exports = router;
