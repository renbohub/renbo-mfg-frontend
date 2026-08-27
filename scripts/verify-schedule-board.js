const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { modules, getModule, getPage } = require("../src/moduleRegistry");

const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const boardScript = read("frontend/public/js/schedule-board.js");
const boardCss = read("frontend/public/css/schedule-board.css");
const moduleRoutes = read("frontend/src/routes/modules.js");
const incomingController = read("backend/src/prisma/controllers/incoming/IncomingTransactionController.js");
const outgoingController = read("backend/src/prisma/controllers/outgoing/OutgoingTransactionController.js");
const outgoingRoutes = read("backend/src/prisma/routes/outgoing/transactions.js");

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
