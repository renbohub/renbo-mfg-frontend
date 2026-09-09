"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const view = fs.readFileSync(path.join(root, "views/ppic/mps-workbench.ejs"), "utf8");
const script = fs.readFileSync(path.join(root, "public/js/ppic-mps-workbench.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/css/ppic-mps-workbench.css"), "utf8");
const routes = fs.readFileSync(path.join(root, "src/routes/modules.js"), "utf8");

for (const label of ["Feasible", "Feasible dengan Risiko", "Tidak Feasible", "Belum Dievaluasi", "Tidak Berlaku"]) assert.match(view, new RegExp(label));
for (const status of ["FEASIBLE", "FEASIBLE_WITH_RISK", "NOT_FEASIBLE", "NOT_EVALUATED", "NA"]) assert.match(script, new RegExp(status));
assert.doesNotMatch(view, /Feasible with Action/);
assert.doesNotMatch(script, /FEASIBLE_WITH_ACTION/);
assert.match(view, /id="mwb-feasibility-modal"/);
assert.match(view, /Checksheet Kelayakan Produksi/);
assert.match(view, /data-feasibility-filter="issues"/);
assert.doesNotMatch(view, /id="mwb-feasibility-recalculate"/);
assert.doesNotMatch(view, /id="mwb-check-delivery"/);
assert.doesNotMatch(view, /id="mwb-capacity-check"/);
assert.doesNotMatch(view, /id="mwb-rccp-calculate"/);
assert.doesNotMatch(script, /feasibility\/recalculate/);
assert.doesNotMatch(script, /delivery-feasibility\/review/);
assert.doesNotMatch(script, /\/rccp\/run/);
assert.match(view, /dihitung otomatis saat MPS dibuat atau dihitung ulang/);
assert.match(view, /colspan="21"/);
assert.match(script, /data-feasibility-line/);
assert.match(script, /\/workbench\/lines\/\$\{encodeURIComponent\(lineId\)\}\/feasibility/);
assert.match(routes, /\/api\/planning-ppic\/mps\/workbench\/lines\/:lineId\/feasibility/);
assert.match(routes, /\/api\/planning\/mps\/workbench\/lines\/\$\{encodeURIComponent\(req\.params\.lineId\)\}\/feasibility/);
assert.match(script, /mwb-feasibility-loading/);
assert.match(script, /data-feasibility-retry/);
assert.match(script, /event\.stopPropagation\(\)/);
assert.match(script, /closeFeasibilityModal\(\)/);
assert.match(script, /state\.feasibilityOrigin/);
assert.match(script, /event\.key === "Tab"/);
assert.match(script, /event\.key === "Escape"/);
assert.doesNotMatch(script, /isBufferBatch \? '<span class="mwb-dash">—<\/span>' : checklistCell/, "buffer must no longer bypass checklist");
assert.match(css, /\.mwb-checklist-summary/);
assert.match(css, /\.mwb-feasibility-panel/);
assert.match(css, /\.mwb-demand-table.*position:sticky/);

console.log("MPS feasibility checklist UI verification passed.");
const audit = require("../public/js/ppic-mps-audit-model.js");
assert.equal(audit.facts({ code: "MPS_MATERIAL", status: "NOT_CHECKED", gap: { display: "Kurang material; menunggu ETA customer" } }).gap,
  "Kurang material; menunggu ETA customer", "a calculated shortage must not be labelled uncalculated when only ETA is missing");
assert.match(script, /Periksa Checksheet/);
assert.match(routes, /checksheet\/evaluate/);
