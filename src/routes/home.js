const router = require("express").Router();
const { modules } = require("../moduleRegistry");
const backend = () => (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");
const aliases = { "master-production-schedule": "mps", "material-requirements-planning": "mrp", "monthly-production-plan": "monthly-production-plans", "purchase-orders": "purchase-order" };
function safeUrl(value) {
  if (typeof value !== "string" || !/^\/(modules|master-data)(\/|\?|$)/.test(value) || /[\\\r\n]/.test(value)) return null;
  return value;
}
function taskUrl(item) {
  if (item.url) return safeUrl(item.url);
  const group = modules.find((entry) => entry.slug === item.module);
  const page = group?.pages.find((entry) => [item.page, aliases[item.page]].includes(entry.slug));
  if (!page) return item.module === "master-data" && /^[a-z0-9-]+$/.test(item.page || "") ? `/master-data/${item.page}${item.record ? '/' + encodeURIComponent(item.record) : ''}${item.kind === "comment" ? '?openComments=1' : ''}` : null;
  const path = `/modules/${group.slug}/${aliases[page.slug] || page.slug}`;
  const target = item.record ? `${path}/${encodeURIComponent(item.record)}` : path;
  return item.kind === "comment" ? `${target}?openComments=1` : target;
}
router.get("/home", (_req, res) => res.render("home/index", {
  title: "Beranda", requiresAuth: true, modules, activeModule: "", pageStyles: ["/css/home.css?v=20260909-friendly-1"], pageScript: "/js/home.js?v=20260912-auth",
  socketUrl: process.env.SOCKET_URL || "http://localhost:5017", mqttUrl: "",
}));
router.get("/home/api/tasks", async (req, res) => {
  try {
    const response = await fetch(`${backend()}/api/home`, { headers: { Authorization: req.get("authorization") || "" }, signal: AbortSignal.timeout(20000) });
    const payload = await response.json();
    if (response.ok) Object.values(payload.sources || {}).forEach((source) => source.items.forEach((item) => { item.url = taskUrl(item); }));
    res.set("Cache-Control", "no-store").status(response.status).json(payload);
  } catch (_error) { res.status(503).json({ message: "Beranda belum dapat terhubung. Coba muat ulang sebentar lagi." }); }
});
router.put("/home/api/notifications/:id/read", async (req, res) => {
  try {
    const response = await fetch(`${backend()}/api/notifications/${encodeURIComponent(req.params.id)}/read`, { method: "PUT", headers: { Authorization: req.get("authorization") || "" }, signal: AbortSignal.timeout(10000) });
    res.status(response.status).json(await response.json());
  } catch (_error) { res.status(503).json({ message: "Notifikasi belum berhasil diperbarui." }); }
});
module.exports = router;
module.exports.taskUrl = taskUrl;
