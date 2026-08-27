const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const packageJson = JSON.parse(read("package.json"));
const frappePackage = JSON.parse(read("node_modules/frappe-gantt/package.json"));
const server = read("server.js");
const view = read("views/operations/detail.ejs");
const ui = read("public/js/operations-detail.js");
const css = read("public/css/mpp-p2-hierarchy.css");

assert(packageJson.dependencies["frappe-gantt"], "Frappe Gantt harus menjadi dependency lokal yang terkunci");
assert.strictEqual(frappePackage.license, "MIT", "library Gantt wajib memakai lisensi open-source MIT");
assert(server.includes('vendor("/vendor/frappe-gantt", "frappe-gantt/dist")'), "asset Gantt harus disajikan dari node_modules lokal");
assert(view.includes('/vendor/frappe-gantt/frappe-gantt.css'), "halaman MPP harus memuat stylesheet Frappe Gantt");
assert(view.includes('/vendor/frappe-gantt/frappe-gantt.umd.js'), "halaman MPP harus memuat runtime Frappe Gantt sebelum page script");
assert(ui.includes("new window.Gantt"), "MPP harus merender timeline dengan library Frappe Gantt");
assert(ui.includes("on_date_change"), "drag atau resize task harus memiliki alur konfirmasi tanggal");
assert(ui.includes("openMppPlacementEditor(task.allocationId, proposedStart, proposedEnd)"), "perubahan bar harus masuk ke dialog allocation yang tervalidasi");
assert(ui.includes("ignore: workingOnly ? (date) => date.getDay() === 0 : []"), "kalender kerja harus dapat mengabaikan hari Minggu");
assert(ui.includes("monthlyPlanWeeklyMatrixCard(record)"), "tabel mingguan harus tetap tersedia sebagai audit view");
assert(ui.includes("function buildMppForecastGanttTasks"), "tampilan ringkas harus menggabungkan child process menjadi satu baris per Forecast phase");
assert(ui.includes('rowMode !== "process"'), "Gantt harus memakai mode per Forecast sebagai default dan detail proses hanya saat diminta");
assert(css.includes(".mpp-gantt-frame"), "layout task list dan timeline harus mempunyai styling terintegrasi");
assert(css.includes('class*="mpp-gantt-vendor"'), "task vendor harus dapat dibedakan secara visual");
assert(ui.includes("function monthlyPlanRoutingTablesCard"), "Monthly Planning harus memiliki view operasi terpisah untuk INHOUSE dan VENDOR");
assert(ui.includes('table("INHOUSE"') && ui.includes('table("VENDOR"') && ui.includes('data-mpp-routing-table="${routingMode}"'), "INHOUSE dan VENDOR harus dirender sebagai dua tabel yang berbeda");
assert(ui.includes("capacityUnscheduled"), "kebutuhan di atas kapasitas harus tetap terlihat sebagai antrean overload di bulan owner");
assert(css.includes(".mpp-routing-tables"), "tabel operasi Monthly Planning harus memiliki layout responsif khusus");

console.log("MPP open-source Gantt contracts passed: 18/18 cases");
