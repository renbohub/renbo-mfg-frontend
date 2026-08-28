const express = require("express");
const path = require("path");
const { Readable } = require("stream");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

function safeUploadPath(value) {
  const decoded = decodeURIComponent(String(value || ""));
  if (!decoded.startsWith("/") || decoded.includes("\0") || decoded.includes("\\")) return "";
  const segments = decoded.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) return "";
  return `/${segments.map(encodeURIComponent).join("/")}`;
}

function safeDownloadName(value, fallback) {
  const cleaned = String(value || "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim().slice(0, 180);
  return cleaned || fallback;
}

router.use(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.sendStatus(405);
  let uploadPath;
  try { uploadPath = safeUploadPath(req.path); } catch (_error) { uploadPath = ""; }
  if (!uploadPath) return res.status(400).json({ message: "Path attachment tidak valid." });

  try {
    const response = await fetch(`${backendUrl}/uploads${uploadPath}`, {
      method: req.method,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return res.sendStatus(response.status);

    ["content-type", "content-length", "last-modified", "etag"].forEach((header) => {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    });
    res.setHeader("Cache-Control", response.headers.get("cache-control") || "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (String(req.query.download || "") === "1") {
      const filename = safeDownloadName(req.query.name, path.posix.basename(uploadPath));
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    } else {
      res.setHeader("Content-Disposition", "inline");
    }
    if (req.method === "HEAD" || !response.body) return res.end();
    Readable.fromWeb(response.body).on("error", () => res.destroy()).pipe(res);
  } catch (_error) {
    if (!res.headersSent) res.status(503).json({ message: "Attachment belum dapat dimuat." });
    else res.destroy();
  }
});

module.exports = router;
module.exports.safeUploadPath = safeUploadPath;
module.exports.safeDownloadName = safeDownloadName;
