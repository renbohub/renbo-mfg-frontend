"use strict";

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
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function proxy(req, res, endpoint, method = "GET") {
  try {
    const response = await fetch(`${backendUrl}${endpoint}`, {
      method,
      headers: forwardHeaders(req, method !== "GET"),
      body: method === "GET" ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(method === "GET" ? 15000 : 100000),
    });
    return res.status(response.status).json(await readBackend(response));
  } catch (error) {
    const offline = error?.cause?.code === "ECONNREFUSED" || ["TimeoutError", "AbortError"].includes(error?.name);
    return res.status(503).json({
      code: "AI_BACKEND_UNAVAILABLE",
      message: offline ? `AI backend belum tersedia di ${backendUrl}.` : "AI Assistant gagal diakses.",
    });
  }
}

const id = (value) => encodeURIComponent(String(value || ""));

router.get("/status", (req, res) => proxy(req, res, "/api/ai/status"));
router.get("/capabilities", (req, res) => proxy(req, res, "/api/ai/capabilities"));
router.get("/conversations", (req, res) => proxy(req, res, "/api/ai/conversations"));
router.post("/conversations", (req, res) => proxy(req, res, "/api/ai/conversations", "POST"));
router.get("/conversations/:conversationId", (req, res) => proxy(req, res, `/api/ai/conversations/${id(req.params.conversationId)}`));
router.post("/conversations/:conversationId/messages", (req, res) => proxy(req, res, `/api/ai/conversations/${id(req.params.conversationId)}/messages`, "POST"));
router.get("/requests/:requestId", (req, res) => proxy(req, res, `/api/ai/requests/${id(req.params.requestId)}`));
router.delete("/requests/:requestId", (req, res) => proxy(req, res, `/api/ai/requests/${id(req.params.requestId)}`, "DELETE"));
router.get("/drafts/:draftId", (req, res) => proxy(req, res, `/api/ai/drafts/${id(req.params.draftId)}`));
router.post("/drafts/:draftId/reject", (req, res) => proxy(req, res, `/api/ai/drafts/${id(req.params.draftId)}/reject`, "POST"));
router.get("/admin/model-files", (req, res) => proxy(req, res, "/api/ai/admin/model-files"));
router.get("/admin/model-profiles", (req, res) => proxy(req, res, "/api/ai/admin/model-profiles"));
router.post("/admin/model-profiles", (req, res) => proxy(req, res, "/api/ai/admin/model-profiles", "POST"));
router.post("/admin/model-profiles/:profileId/test", (req, res) => proxy(req, res, `/api/ai/admin/model-profiles/${id(req.params.profileId)}/test`, "POST"));
router.post("/admin/model-profiles/:profileId/activate", (req, res) => proxy(req, res, `/api/ai/admin/model-profiles/${id(req.params.profileId)}/activate`, "POST"));
router.post("/admin/model-profiles/:profileId/rollback", (req, res) => proxy(req, res, `/api/ai/admin/model-profiles/${id(req.params.profileId)}/rollback`, "POST"));

module.exports = router;
