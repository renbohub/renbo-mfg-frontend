const express = require("express");

const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");

router.get("/login", (req, res) => {
  const requestedNext = typeof req.query.next === "string" ? req.query.next : "";
  const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.startsWith("/login")
    ? requestedNext
    : "/modules";
  res.render("auth/login", {
    title: "Masuk",
    nextPath,
    socketUrl: "",
    mqttUrl: "",
    pageScript: "/js/login.js"
  });
});

router.post("/auth/api/login", async (req, res) => {
  const identifier = String(req.body.identifier || "").trim();
  const password = String(req.body.password || "");
  if (!identifier || !password) return res.status(400).json({ message: "Username/email dan password wajib diisi." });

  try {
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
      signal: AbortSignal.timeout(10000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = { AUTH_USER_NOT_FOUND: "Username atau email tidak ditemukan.", AUTH_INVALID_PASSWORD: "Password yang dimasukkan salah." };
      return res.status(response.status).json({ message: messages[payload.code] || payload.message || "Login gagal." });
    }
    res.json({ token: payload.token, user: payload.user });
  } catch (error) {
    const offline = error?.cause?.code === "ECONNREFUSED" || error?.name === "TimeoutError";
    res.status(503).json({
      code: "BACKEND_UNAVAILABLE",
      message: offline ? `Backend belum aktif di ${backendUrl}. Jalankan backend terlebih dahulu.` : "Tidak dapat terhubung ke layanan autentikasi."
    });
  }
});

router.get("/auth/api/profile", async (req, res) => {
  const authorization = req.get("authorization");
  if (!authorization) return res.status(401).json({ message: "Token tidak ditemukan." });
  try {
    const response = await fetch(`${backendUrl}/api/users/profile`, {
      headers: { authorization },
      signal: AbortSignal.timeout(10000)
    });
    const payload = await response.json().catch(() => ({}));
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(503).json({ message: "Profil dan permission terbaru tidak dapat dimuat." });
  }
});

module.exports = router;
