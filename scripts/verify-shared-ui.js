const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const failures = [];
let contracts = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function requireText(relativePath, patterns) {
  const source = read(relativePath);
  patterns.forEach(({ pattern, label }) => {
    contracts += 1;
    if (!pattern.test(source)) failures.push(`${relativePath}: ${label}`);
  });
}

const listViews = [
  "views/master-data/entity-list.ejs",
  "views/master-data/items.ejs",
  "views/modules/list.ejs",
  "views/modules/report.ejs",
  "views/sales/list.ejs",
  "views/bom/list.ejs",
  "views/operations/dashboard.ejs",
  "views/ppic/dashboard.ejs",
  "views/ppic/capacity.ejs",
];

listViews.forEach((relativePath) => requireText(relativePath, [
  { pattern: /partials\/view-switcher/, label: "shared view switcher belum dipakai" },
]));

requireText("views/partials/view-switcher.ejs", [
  { pattern: /data-list-view="table"/, label: "mode Table tidak tersedia" },
  { pattern: /data-list-view="gallery"/, label: "mode Gallery tidak tersedia" },
  { pattern: /data-list-view="heatmap"/, label: "mode Heatmap tidak tersedia" },
  { pattern: /data-list-view="kanban"/, label: "mode Kanban tidak tersedia" },
  { pattern: /aria-pressed/, label: "state aksesibilitas view switcher tidak tersedia" },
]);

requireText("public/js/gallery-view.js", [
  { pattern: /allowedModes = new Set\(\["table", "gallery", "heatmap", "kanban"\]\)/, label: "empat mode shared belum dikunci" },
  { pattern: /renderGallery/, label: "renderer Gallery tidak tersedia" },
  { pattern: /renderHeatmap/, label: "renderer Heatmap tidak tersedia" },
  { pattern: /renderKanban/, label: "renderer Kanban tidak tersedia" },
  { pattern: /localStorage\.setItem/, label: "preferensi view belum disimpan" },
]);

const operationalForms = [
  "views/production/shared-form.ejs",
  "views/production/log-form.ejs",
  "views/production/schedule-form.ejs",
  "views/inventory/form.ejs",
  "views/operations/supply-chain-form.ejs",
];

operationalForms.forEach((relativePath) => requireText(relativePath, [
  { pattern: /class="ops-detail-card/, label: "shared form card belum dipakai" },
  { pattern: /module-form-section-title/, label: "section title form belum konsisten" },
  { pattern: /module-form-actions/, label: "footer action form belum konsisten" },
]));

requireText("public/css/shared-ui.css", [
  { pattern: /form\.ops-detail-card/, label: "shared operational form style tidak tersedia" },
  { pattern: /\.module-table-shell,[\s\S]*\.ops-table-card/, label: "shared table surface tidak tersedia" },
  { pattern: /#sales-form[\s\S]*#pr-form/, label: "Sales dan PR belum mengikuti shared form style" },
]);

requireText("views/sales/list.ejs", [
  { pattern: /sales-master-toolbar/, label: "toolbar list Sales belum mengikuti Master Data" },
  { pattern: /sales-status-filter/, label: "filter status Sales belum tersedia" },
  { pattern: /entity-table-shell sales-master-table/, label: "table Sales belum memakai shell Master Data" },
]);

requireText("views/sales/form.ejs", [
  { pattern: /entity-form-card sales-document-form/, label: "form Sales belum memakai card Master Data" },
  { pattern: /form-actions sales-form-actions/, label: "footer action form Sales belum konsisten" },
]);

requireText("views/sales/detail.ejs", [
  { pattern: /entity-detail-page/, label: "detail Sales belum memakai layout Master Data" },
]);

requireText("views/partials/module-subnav.ejs", [
  { pattern: /module\.pages/, label: "submenu module belum bersumber dari registry" },
  { pattern: /module-subnav-inner/, label: "shell submenu module belum tersedia" },
  { pattern: /normalizedActivePage/, label: "active state submenu module belum dinormalisasi" },
]);

[
  "views/modules/hub.ejs",
  "views/modules/list.ejs",
  "views/modules/report.ejs",
  "views/operations/dashboard.ejs",
  "views/operations/detail.ejs",
  "views/ppic/dashboard.ejs",
  "views/ppic/capacity.ejs",
  "views/ppic/detail.ejs",
  "views/inventory/form.ejs",
  "views/operations/supply-chain-form.ejs",
  "views/production/log-form.ejs",
  "views/production/schedule-form.ejs",
  "views/production/shared-form.ejs",
  "views/purchasing/pr-form.ejs",
  "views/purchasing/po-form.ejs",
  "views/purchasing/invoice-form.ejs",
].forEach((relativePath) => requireText(relativePath, [
  { pattern: /partials\/module-subnav/, label: "submenu tingkat kedua belum dipakai" },
]));

requireText("views/modules/list.ejs", [
  { pattern: /module-master-toolbar/, label: "list generic belum memakai toolbar Master Data" },
  { pattern: /module-master-table/, label: "list generic belum full-width" },
]);

requireText("views/operations/dashboard.ejs", [
  { pattern: /operations-master-toolbar/, label: "list operasional belum memakai toolbar Master Data" },
  { pattern: /operations-master-table/, label: "list operasional belum full-width" },
]);

requireText("public/css/shared-ui.css", [
  { pattern: /\.module-subnav[\s\S]*\.module-subnav-inner/, label: "style submenu module belum tersedia" },
  { pattern: /\.module-card-grid,[\s\S]*repeat\(auto-fit/, label: "dashboard module belum responsif" },
  { pattern: /\.report-panels[\s\S]*minmax\(0, 2fr\)/, label: "dashboard report belum full-width responsif" },
  { pattern: /@media \(max-width: 700px\)[\s\S]*\.report-stat-grid/, label: "responsive mobile dashboard belum tersedia" },
]);

requireText("views/master-data/index.ejs", [
  { pattern: /partials\/header-master/, label: "landing Master Data belum memakai header Master Data" },
  { pattern: /master-hub-toolbar/, label: "toolbar landing Master Data belum tersedia" },
  { pattern: /master-hub-grid/, label: "grid landing Master Data belum tersedia" },
]);

requireText("public/css/master-data.css", [
  { pattern: /\.master-hub-grid[\s\S]*repeat\(auto-fit/, label: "grid Master Data belum full-width responsif" },
  { pattern: /@media \(max-width: 640px\)[\s\S]*\.master-hub-grid/, label: "landing Master Data belum responsif di mobile" },
]);

if (failures.length) {
  console.error(`Shared UI contract failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Shared UI contract passed: ${contracts} checks across ${listViews.length} list/report views and ${operationalForms.length} operational forms.`);
