require("dotenv").config();

const path = require("path");
const express = require("express");
const authRoutes = require("./src/routes/auth");
const masterDataRoutes = require("./src/routes/masterData");
const modulesRoutes = require("./src/routes/modules");

const app = express();
const port = Number(process.env.PORT || 3100);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("x-powered-by");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const vendor = (route, folder) => app.use(route, express.static(path.join(__dirname, "node_modules", folder)));
vendor("/vendor/bootstrap", "bootstrap/dist");
vendor("/vendor/jquery", "jquery/dist");
vendor("/vendor/datatables", "datatables.net/js");
vendor("/vendor/datatables-bs5", "datatables.net-bs5");
vendor("/vendor/alpine", "alpinejs/dist");
vendor("/vendor/apexcharts", "apexcharts/dist");
vendor("/vendor/socket.io-client", "socket.io-client/dist");
vendor("/vendor/mqtt", "mqtt/dist");

app.get("/health", (_req, res) => res.json({ ok: true, service: "frontend" }));
app.get("/", (_req, res) => res.redirect("/login"));
app.use(authRoutes);
app.use("/modules", modulesRoutes);
app.use("/master-data", masterDataRoutes);

app.use((req, res) => res.status(404).render("errors/404", { title: "Halaman tidak ditemukan" }));

app.use((err, req, res, _next) => {
  console.error(err);
  if (req.path.startsWith("/master-data/api/") || req.path.startsWith("/modules/api/")) {
    return res.status(err.status || 500).json({ message: err.message || "Terjadi kesalahan" });
  }
  res.status(err.status || 500).render("errors/500", { title: "Terjadi kesalahan", error: err });
});

app.listen(port, () => {
  console.log(`Frontend ready at http://localhost:${port}`);
});
