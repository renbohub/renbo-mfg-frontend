"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (relativePath) => {
  const filePath = path.resolve(__dirname, "..", relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
};

const routes = read("src/routes/modules.js");
const subnav = read("views/partials/module-subnav.ejs");
const controlTowerView = read("views/ppic/execution-cockpit.ejs");
const view = read("views/ppic/mrp-planning-runs.ejs");
const script = read("public/js/ppic-mrp-planning-runs.js");
const styles = read("public/css/ppic-mrp-planning-runs.css");
const mpsView = read("views/ppic/mps-workbench.ejs");
const mpsScript = read("public/js/ppic-mps-workbench.js");
const detailScript = read("public/js/ppic-mrp-detail-simple.js");

assert(routes.includes('res.render("ppic/mrp-planning-runs"'), "route /planning-ppic/mrp harus merender halaman MRP terpisah");
assert(routes.includes('req.query.view === "runs"'), "daftar run harus tetap dapat diakses sebagai tampilan sekunder");
assert(routes.includes('monthlyMode: true'), "halaman MRP utama harus langsung merender tabel bulanan");
assert(detailScript.includes('if (!cfg.monthlyMode) await ensureAutomaticMPlusOnePreview()'), "membuka tabel bulanan tidak boleh membuat scenario secara otomatis");
assert(routes.includes('req.query.tab === "mrp"'), "URL Control Tower lama dengan tab=mrp harus ditangani sebagai redirect kompatibilitas");
assert(routes.includes('/modules/planning-ppic/mrp?month='), "redirect kompatibilitas harus mempertahankan periode MRP");
assert(subnav.includes("href: '/modules/planning-ppic/mrp'"), "subnav MRP harus menunjuk ke halaman terpisah");
assert(!controlTowerView.includes('data-pec-tab="mrp"'), "Control Tower tidak boleh lagi menampilkan tab MRP");

["mrp-month", "mrp-search", "mrp-status", "mrp-kpis", "mrp-tbody", "mrp-open-run"].forEach((id) => {
  assert(view.includes(`id="${id}"`), `halaman MRP harus memiliki ${id}`);
});
assert(view.includes("activePage: 'mrp'"), "subnav halaman terpisah harus mengaktifkan menu MRP");
assert(!view.includes("pec-closing-open"), "halaman MRP terpisah tidak boleh membawa Period Closing");
assert(!view.includes("data-pec-tab"), "halaman MRP terpisah tidak boleh membawa tab Control Tower");

assert(script.includes("/modules/api/planning-ppic/execution-cockpit?month="), "halaman MRP harus membaca sumber data planning yang kanonis");
assert(script.includes('"SIMULATED"'), "halaman MRP harus menampilkan hasil kalkulasi sebagai lifecycle Simulated");
assert(script.includes('"APPROVED"'), "halaman MRP harus menampilkan current official sebagai lifecycle Approved");
assert(!script.includes('"SIMULATION"'), "halaman daftar MRP tidak boleh lagi memakai mode/label SIMULATION");
assert(script.includes("/approve"), "working revision Simulated harus dapat di-approve dari halaman MRP");
assert(!mpsView.includes('id="mwb-simulate-mrp"'), "Rolling MPS tidak boleh lagi mempunyai mode/tombol simulasi terpisah");
assert(!mpsScript.includes('action === "mrp-simulation"'), "Rolling MPS harus memakai satu aksi Hitung MRP yang menghasilkan working revision");
assert(mpsScript.includes("selesai dihitung dan siap direview"), "Rolling MPS harus menjelaskan hasil sebagai working revision, bukan official otomatis");
assert(detailScript.includes("/approve"), "detail MRP Simulated harus menyediakan aksi approval snapshot yang sama");
assert(styles.includes("min-width:1080px"), "tabel MRP harus mempertahankan matriks desktop dengan internal scroll");
assert(styles.includes("@media(max-width:780px)"), "halaman MRP harus mempunyai layout tablet/mobile");
assert(styles.includes(".mrp-table-scroll"), "overflow tabel harus dimiliki halaman MRP, bukan viewport");

console.log("Separate MRP Planning Runs page contracts: OK");
