const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const registry = read("src/masterDataRegistry.js");
const masterRoutes = read("src/routes/masterData.js");
const moduleRoutes = read("src/routes/modules.js");
const form = read("views/master-data/work-center-form.ejs");
const detail = read("views/master-data/work-center-detail.ejs");
const formScript = read("public/js/work-center-form.js");
const detailScript = read("public/js/work-center-detail.js");
const style = read("public/css/work-center-master.css");
const backendController = read("../backend/src/prisma/controllers/engineering/RoutingController.js");
const backendRoutes = read("../backend/src/prisma/routes/engineering/routing.js");

assert.match(registry, /"work-centers": entity\(/, "Work Center harus terdaftar di Master Data");
assert.match(registry, /formView: "master-data\/work-center-form"/, "Work Center harus memakai form khusus");
assert.match(registry, /detailView: "master-data\/work-center-detail"/, "Work Center harus memakai detail khusus");
assert.match(registry, /lookup\("machineIds"[\s\S]+multiple: true/, "assignment mesin harus mendukung multi-select");
assert.match(masterRoutes, /config\.formView \|\| "master-data\/entity-form"/, "route Master Data harus mendukung form khusus");
assert.match(masterRoutes, /config\.detailView \|\| "master-data\/entity-detail"/, "route Master Data harus mendukung detail khusus");
assert.match(moduleRoutes, /manufacturing-bom\/work-centers[\s\S]+master-data\/work-centers/, "menu Work Center lama harus menuju Master Data baru");
assert.match(form, /wc-machine-table/, "form harus mempunyai machine assignment table");
assert.match(form, /Effective capacity/, "form harus menampilkan effective capacity");
assert.match(formScript, /machineIds: \[\.\.\.selected\]/, "submit harus mengirim semua mesin terpilih");
assert.match(formScript, /primaryMachineId: primaryId/, "submit harus mengirim mesin primary");
assert.match(detail, /Mesin yang Terhubung/, "detail harus menampilkan membership mesin");
assert.match(detailScript, /record\.machines/, "detail harus membaca relasi mesin authoritative");
assert.match(style, /@media\(max-width:720px\)/, "Work Center harus responsive untuk mobile");
assert.match(backendController, /assertMachinesAvailable/, "backend harus mencegah satu mesin masuk dua Work Center");
assert.match(backendController, /exports\.updateWorkCenter/, "backend harus menyediakan update Work Center");
assert.match(backendController, /primaryMachineId/, "backend harus menyimpan mesin primary");
assert.match(backendRoutes, /work-centers\/:key\/remove/, "backend harus menyediakan lifecycle nonaktif");

console.log("Work Center Master Data contract passed.");
