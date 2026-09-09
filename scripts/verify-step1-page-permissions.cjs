const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

async function visit(pathname, moduleCode, pageCode, allowed) {
  const user = { username: "operator-test", roles: [{ roleName: "Operator" }], effectivePermissions: allowed ? [{ moduleCode, pageCode, resourceCode: pageCode, actions: ["read"] }] : [] };
  const values = new Map([["user", JSON.stringify(user)], ["token", "test-session"]]);
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const body = { innerHTML: "<main>Authorized tool page</main>" };
  const context = { localStorage: storage, sessionStorage: storage, location: { pathname, origin: "http://localhost", replace() {} }, document: { body, querySelectorAll: () => [] }, window: { dispatchEvent() {} }, fetch: async () => ({ ok: true, json: async () => user }), URL, CustomEvent: class {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../public/js/session.js"), "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  return body.innerHTML;
}

test("new STEP 1 tool pages use their parent page permission for ordinary users", async () => {
  for (const [url, moduleCode, pageCode] of [
    ["/modules/outgoing/scan", "outgoing", "delivery-schedules"],
    ["/modules/incoming/documents/GR-001", "incoming", "goods-receipts"],
    ["/modules/incoming/inspections/IQC-001/checklist", "incoming", "incoming-inspections"],
    ["/modules/incoming/partner-administration", "incoming", "goods-receipts"],
    ["/modules/inventory/stock-policy/stock-1", "inventory", "stock-balances"],
  ]) {
    assert.doesNotMatch(await visit(url, moduleCode, pageCode, true), /Akses halaman ditolak/, `${url} must remain available with parent read permission`);
    assert.match(await visit(url, moduleCode, pageCode, false), /Akses halaman ditolak/, `${url} must remain denied without parent permission`);
  }
});
