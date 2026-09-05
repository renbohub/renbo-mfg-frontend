const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { modules, getModule, getPage } = require("../src/moduleRegistry");
let scheduleBoardModel = {};
try { scheduleBoardModel = require("../public/js/schedule-board-model"); } catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const boardScript = read("frontend/public/js/schedule-board.js");
const boardCss = read("frontend/public/css/schedule-board.css");
const moduleRoutes = read("frontend/src/routes/modules.js");
const incomingController = read("backend/src/prisma/controllers/incoming/IncomingTransactionController.js");
const outgoingController = read("backend/src/prisma/controllers/outgoing/OutgoingTransactionController.js");
const outgoingRoutes = read("backend/src/prisma/routes/outgoing/transactions.js");

assert.equal(typeof scheduleBoardModel.expandOutgoingEvents, "function", "Outgoing Plan/Actual/Balance model must exist");
assert.equal(typeof scheduleBoardModel.summarizeOutgoingCell, "function", "Outgoing four-row cell summary must exist");
assert.equal(typeof scheduleBoardModel.expandIncomingEvents, "function", "Incoming Plan/Actual matrix model must exist");
const advance = scheduleBoardModel.expandOutgoingEvents([{ reference: "DS-1", eventAt: "2026-09-10", actualAt: "2026-09-08", qty: 100, completedQty: 100 }]);
assert.deepStrictEqual(advance.map((row) => ({ date: row.displayAt, plan: row.planQty, actual: row.actualQty, balance: row.balanceQty, status: row.timingStatus })), [
  { date: "2026-09-10", plan: 100, actual: 0, balance: 100, status: "ADVANCE" },
  { date: "2026-09-08", plan: 0, actual: 100, balance: 0, status: "ADVANCE" },
]);
const onTime = scheduleBoardModel.expandOutgoingEvents([{ reference: "DS-2", eventAt: "2026-09-10", actualAt: "2026-09-10", qty: 80, completedQty: 80 }]);
assert.deepStrictEqual(onTime.map((row) => ({ plan: row.planQty, actual: row.actualQty, balance: row.balanceQty, status: row.timingStatus })), [
  { plan: 80, actual: 80, balance: 0, status: "ON TIME" },
]);
const late = scheduleBoardModel.expandOutgoingEvents([{ reference: "DS-3", eventAt: "2026-09-10", actualAt: "2026-09-12", qty: 60, completedQty: 60 }]);
assert.deepStrictEqual(late.map((row) => ({ date: row.displayAt, plan: row.planQty, actual: row.actualQty, balance: row.balanceQty, status: row.timingStatus })), [
  { date: "2026-09-10", plan: 60, actual: 0, balance: 60, status: "LATE" },
  { date: "2026-09-12", plan: 0, actual: 60, balance: 0, status: "LATE" },
]);
assert.deepStrictEqual(scheduleBoardModel.summarizeOutgoingCell(late.filter((row) => row.displayAt === "2026-09-10")), { plan: 60, actual: 0, balance: 60, status: "LATE" });
assert.deepStrictEqual(scheduleBoardModel.summarizeOutgoingCell([]), { plan: 0, actual: 0, balance: 0, status: "" });
const incomingLate = scheduleBoardModel.expandIncomingEvents(
  [{ matchKey: "PO-1|MAT-1|KG", eventAt: "2026-09-10", qty: 100, reference: "PO-1" }],
  [{ matchKey: "PO-1|MAT-1|KG", actualAt: "2026-09-12", completedQty: 40, reference: "GR-1" }],
);
assert.deepStrictEqual(incomingLate.map((row) => ({ date: row.displayAt, plan: row.planQty, actual: row.actualQty, balance: row.balanceQty, status: row.timingStatus })), [
  { date: "2026-09-10", plan: 100, actual: 0, balance: 100, status: "LATE" },
  { date: "2026-09-12", plan: 0, actual: 40, balance: 0, status: "LATE" },
]);

[
  'data-board-mode="hour"',
  'data-board-mode="week"',
  'data-board-mode="date"',
  'data-board-shift="-1"',
  'data-board-shift="1"',
].forEach((contract) => assert(read("frontend/views/partials/schedule-board.ejs").includes(contract), `Missing UI contract ${contract}`));
assert(boardScript.includes('state.mode === "hour"') && boardScript.includes("direction * 7") && boardScript.includes("getMonth() + direction"), "Period navigation rules are incomplete");
assert(boardScript.includes('["MATERIAL", "PURCHASE_PART"]') && boardScript.includes('row.itemType === "FINISHED_GOOD"'), "Item-type scope is not enforced in the board client");
assert(boardCss.includes("position:sticky") && boardCss.includes("overflow:auto"), "Matrix sticky/scroll layout is missing");
assert(boardScript.includes("schedule-board__fixed-part") && boardScript.includes("schedule-board__fixed-customer") && boardScript.includes("schedule-board__fixed-metric"), "Outgoing frozen-column classes are missing");
assert(boardCss.includes(".schedule-board__fixed-metric{position:sticky"), "Planned/Actual/Balance/Status column must remain frozen");
assert(incomingController.includes('itemType = detail.materialCode ? "MATERIAL" : detail.partCode ? "PURCHASE_PART"') && incomingController.includes("vendorRows"), "Incoming data contract is incomplete");
assert(outgoingController.includes("exports.deliveryBoard") && outgoingController.includes('itemType: "FINISHED_GOOD"'), "Outgoing FG endpoint is incomplete");
assert(outgoingRoutes.includes('router.get("/delivery-board"'), "Outgoing delivery-board route is missing");
assert(moduleRoutes.includes('router.get("/api/outgoing/delivery-board"') && moduleRoutes.includes('res.render("outgoing/dashboard"'), "Frontend outgoing route/proxy is incomplete");

const common = (module, page, pageScript) => ({
  title: page.label,
  requiresAuth: true,
  modules,
  module,
  page,
  activeModule: module.slug,
  socketUrl: "",
  mqttUrl: "",
  pageScript,
});

async function render(view, locals) {
  const html = await ejs.renderFile(path.join(frontendRoot, "views", view), locals);
  assert(html.includes("data-schedule-board"), `${view} did not render schedule board`);
  assert(html.includes("data-board-period-label"), `${view} did not render period navigation`);
}

(async () => {
  const incoming = getModule("incoming");
  const outgoing = getModule("outgoing");
  await render("incoming/dashboard.ejs", common(incoming, getPage("incoming", "dashboard"), "/js/incoming-dashboard.js"));
  await render("outgoing/dashboard.ejs", common(outgoing, getPage("outgoing", "dashboard"), "/js/schedule-board.js"));
  console.log("Schedule board contracts and EJS rendering passed.");
})().catch((error) => { console.error(error); process.exit(1); });
