require("dotenv").config();

const path = require("path");
const express = require("express");
const authRoutes = require("./src/routes/auth");
const masterDataRoutes = require("./src/routes/masterData");
const modulesRoutes = require("./src/routes/modules");
const pageContextRoutes = require("./src/routes/pageContext");
const maintenanceRoutes = require("./src/routes/maintenance");
const tableDocumentRoutes = require("./src/routes/tableDocuments");
const aiRoutes = require("./src/routes/ai");
const lookupRoutes = require("./src/routes/lookups");
const uploadRoutes = require("./src/routes/uploads");
const { modules } = require("./src/moduleRegistry");

const app = express();
const port = Number(process.env.PORT || 3100);
const host = process.env.FRONTEND_HOST || "0.0.0.0";
const publicOrigin = process.env.FRONTEND_PUBLIC_ORIGIN || `http://localhost:${port}`;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("x-powered-by");

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", uploadRoutes);

const vendor = (route, folder) => app.use(route, express.static(path.join(__dirname, "node_modules", folder)));
vendor("/vendor/bootstrap", "bootstrap/dist");
vendor("/vendor/jquery", "jquery/dist");
vendor("/vendor/select2", "select2/dist");
vendor("/vendor/datatables", "datatables.net/js");
vendor("/vendor/datatables-bs5", "datatables.net-bs5");
vendor("/vendor/alpine", "alpinejs/dist");
vendor("/vendor/apexcharts", "apexcharts/dist");
vendor("/vendor/frappe-gantt", "frappe-gantt/dist");
vendor("/vendor/tabulator", "tabulator-tables/dist");
vendor("/vendor/socket.io-client", "socket.io-client/dist");
vendor("/vendor/mqtt", "mqtt/dist");

app.get("/health", (_req, res) => res.json({ ok: true, service: "frontend" }));
app.get("/", (_req, res) => res.redirect("/login"));
app.use(require("./src/businessClock").clockMiddleware);
app.patch("/demo-date", async (req, res, next) => {
  try {
    const backend = (process.env.BACKEND_URL || "http://localhost:5017").replace(/\/$/, "");
    const response = await fetch(`${backend}/api/system/settings/current-date`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: req.get("authorization") || "" },
      body: JSON.stringify({ demoDate: req.body.demoDate }), signal: AbortSignal.timeout(10000),
    });
    res.status(response.status).type("json").send(await response.text());
  } catch (error) { res.status(502).json({ message: "Gagal menghubungi server. Tanggal belum diubah." }); }
});
app.use(authRoutes);
app.use(require("./src/routes/partner-portal"));
app.use(require("./src/routes/home"));
app.use(require("./src/routes/part-routing"));
app.use("/modules", modulesRoutes);
app.use("/master-data", masterDataRoutes);
app.use("/page-context/api", pageContextRoutes);
app.use("/maintenance", maintenanceRoutes);
app.use("/table-documents", tableDocumentRoutes);
app.use("/ai/api", aiRoutes);
app.use("/lookups/api", lookupRoutes);
app.get("/logs", (_req, res) => res.render("logs/index", {
  title: "Log Center",
  requiresAuth: true,
  modules,
  activeModule: "log-center",
  socketUrl: process.env.SOCKET_URL || "http://localhost:5017",
  mqttUrl: process.env.MQTT_URL || "",
  pageScript: "/js/log-center.js",
}));

app.use((req, res) => res.status(404).render("errors/404", { title: "Halaman tidak ditemukan" }));

app.use((err, req, res, _next) => {
  console.error(err);
  if (req.path.startsWith("/master-data/api/") || req.path.startsWith("/modules/api/") || req.path.startsWith("/page-context/api/") || req.path.startsWith("/ai/api/") || req.path.startsWith("/lookups/api/")) {
    return res.status(err.status || 500).json({ message: err.message || "Terjadi kesalahan" });
  }
  res.status(err.status || 500).render("errors/500", { title: "Terjadi kesalahan", error: err });
});

app.listen(port, host, () => {
  console.log(`Frontend ready at ${publicOrigin} (listening on ${host}:${port})`);
});
