const express = require("express");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

function forwardHeaders(req, withBody = false) {
  const headers = {};
  ["authorization", "x-page-module", "x-page-code", "x-page-record"].forEach((name) => {
    const value = req.get(name);
    if (value) headers[name] = value;
  });
  if (withBody) headers["content-type"] = "application/json";
  return headers;
}

async function readBackend(response) {
  const value = await response.text();
  if (!value) return {};
  try { return JSON.parse(value); } catch { return { message: value }; }
}

async function proxy(req, res, endpoint, method = "GET") {
  try {
    const url = new URL(`${backendUrl}${endpoint}`);
    if (method === "GET") {
      Object.entries(req.query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
      });
    }
    const response = await fetch(url, {
      method,
      headers: forwardHeaders(req, method !== "GET"),
      body: method === "GET" ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await readBackend(response);
    res.status(response.status).json(payload);
  } catch (error) {
    const offline = error?.cause?.code === "ECONNREFUSED" || error?.name === "TimeoutError" || error?.name === "AbortError";
    res.status(503).json({
      code: "BACKEND_UNAVAILABLE",
      message: offline ? `Backend belum aktif di ${backendUrl}.` : "Log halaman gagal diakses.",
    });
  }
}

router.get("/", (req, res) => proxy(req, res, "/api/page-context"));
router.get("/overview", (req, res) => proxy(req, res, "/api/page-context/overview"));
router.post("/comments", (req, res) => proxy(req, res, "/api/page-context/comments", "POST"));
router.post("/errors", (req, res) => proxy(req, res, "/api/page-context/errors", "POST"));

module.exports = router;
