const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const model = require("../public/js/home-task-model");
const { taskUrl } = require("../src/routes/home");
const { modules } = require("../src/moduleRegistry");
async function main() {
  const items = [{ id: "a", kind: "approval", title: "PO-01", date: "2026-09-02" }, { id: "r", kind: "recovery", title: "Material", dueDate: "2026-09-01", date: "2026-09-03" }, { id: "n", kind: "notification", title: "Ready", date: "2026-09-04" }];
  assert.deepEqual(model.select(items, { today: "2026-09-05" }).map((x) => x.id), ["r", "a", "n"]);
  assert.equal(model.select(items, { query: "po-01" })[0].id, "a");
  assert.equal(model.select(items, { filter: "comment" }).length, 0);
  assert.equal(model.select(items, { sort: "latest" })[0].id, "n");
  for (const unsafe of ["javascript:alert(1)", "//evil.test", "/modules\\evil.test", "https://evil.test"]) assert.equal(model.safeUrl(unsafe), null);
  assert.equal(taskUrl({ module: "purchasing", page: "purchase-orders", record: "PO/01", kind: "approval" }), "/modules/purchasing/purchase-order/PO%2F01");
  assert.equal(taskUrl({ url: "javascript:alert(1)" }), null);
  const html = await ejs.renderFile(path.join(__dirname, "../views/home/index.ejs"), { title: "Beranda", modules, requiresAuth: true, activeModule: "", demoDate: "2026-09-05", pageStyles: ["/css/home.css"], pageScript: "/js/home.js" });
  assert.ok(html.includes('id="home-task-list"'));
  assert.ok(html.includes('id="home-detail-content"'));
  assert.ok(html.includes('href="/modules"'));
  assert.ok(html.includes('name="viewport"'));
  assert.ok(html.includes('aria-live="polite"'));
  console.log("Home UI PASS: priority, filters, search, safe links, document routing, full EJS render.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
