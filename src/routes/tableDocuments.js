const express = require("express");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");
const allowed = new Set(["xlsx", "pdf", "image-pdf", "template", "import-preview"]);

function authHeaders(req) {
  const headers = {};
  ["authorization", "x-page-module", "x-page-code", "x-page-record"].forEach((name) => {
    const value = req.get(name);
    if (value) headers[name] = value;
  });
  return headers;
}

router.post("/:action", async (req, res) => {
  if (!allowed.has(req.params.action)) return res.status(404).json({ message: "Aksi dokumen tidak ditemukan." });
  const multipart = req.is("multipart/form-data");
  const headers = authHeaders(req);
  if (!headers.authorization && req.body?._token) headers.authorization = `Bearer ${String(req.body._token)}`;
  const options = { method: "POST", headers, signal: AbortSignal.timeout(120000) };
  if (multipart) {
    headers["content-type"] = req.get("content-type");
    options.body = req;
    options.duplex = "half";
  } else {
    let payload = req.body || {};
    if (typeof payload.payload === "string") {
      try { payload = JSON.parse(payload.payload); }
      catch (_error) { return res.status(400).json({ message: "Payload dokumen tidak valid." }); }
    } else if (payload && typeof payload === "object") {
      const { _token, ...cleanPayload } = payload;
      payload = cleanPayload;
    }
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(payload);
  }
  try {
    const response = await fetch(`${backendUrl}/api/system/table-documents/${req.params.action}`, options);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!response.ok) {
      const payload = contentType.includes("json") ? await response.json() : { message: await response.text() };
      return res.status(response.status).json({ message: payload.message || "Dokumen gagal diproses." });
    }
    res.status(response.status);
    ["content-type", "content-disposition", "cache-control"].forEach((name) => {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    });
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(503).json({ message: error?.name === "TimeoutError" ? "Pembuatan dokumen melewati batas waktu." : "Layanan dokumen belum tersedia." });
  }
});

module.exports = router;
