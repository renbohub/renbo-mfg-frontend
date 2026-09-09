"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const view = read("views", "ppic", "mps-recovery-kanban.ejs");
const script = read("public", "js", "ppic-mps-recovery-kanban.js");
const workbench = read("public", "js", "ppic-mps-workbench.js");
const routes = read("src", "routes", "modules.js");
const registry = read("src", "moduleRegistry.js");
const backendDir = fs.existsSync(path.join(root, "..", "renbo-mfg-backend")) ? "renbo-mfg-backend" : "backend";
const backendRoutes = read("..", backendDir, "src", "prisma", "routes", "planning", "demand-planning.js");
const controller = read("..", backendDir, "src", "prisma", "controllers", "planning", "DemandPlanningController.js");
const workbenchService = read("..", backendDir, "src", "prisma", "services", "planning", "mpsWorkbenchService.js");

for (const status of ["OPEN", "IN_PROGRESS", "WAITING", "DONE"]) {
  assert.match(view + script + controller, new RegExp(status));
}
for (const checkpoint of ["Master Data", "Production Capacity", "Material Supply", "Vendor Process", "Delivery Schedule"]) {
  assert.match(workbench, new RegExp(checkpoint));
}
for (const column of ["Checkpoint", "Status", "Recovery", "Feedback Status", "Dept"]) assert.match(workbench, new RegExp(column));
assert.match(view, /data-feedback-column/);
assert.match(script, /dragstart/);
assert.match(script, /data-card-status/);
assert.match(script, /feedback-status/);
assert.match(routes, /mps\/recovery-kanban/);
assert.match(routes, /demand-planning\/recovery-plans/);
assert.match(registry, /"mps-recovery"/);
assert.match(backendRoutes, /listRecoveryPlans/);
assert.match(backendRoutes, /updateRecoveryFeedbackStatus/);
assert.match(controller, /RECOVERY_FEEDBACK_STATUSES/);
for (const operationalField of ["Max Kedatangan", "Total Lead Time", "Supplier Lead Time", "Request lead time supplier lebih cepat", "Event working calendar", "LAST RESORT"]) {
  assert.match(workbench, new RegExp(operationalField, "i"));
}
for (const decisionField of ["decisionSupport", "requestedSupplierLeadTimeDays", "capacityWindowForProfile", "totalLeadTimeDays", "lastResort"]) {
  assert.match(workbenchService, new RegExp(decisionField));
}
assert.match(workbenchService, /Master working hours x mesin tersedia x efficiency - maintenance\/calendar downtime/);
assert.match(workbench, /recovery upstream harus dituntaskan lebih dulu/);

console.log("MPS recovery checkpoint and Kanban contracts: OK");
