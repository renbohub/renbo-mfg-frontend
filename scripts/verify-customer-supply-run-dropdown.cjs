"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../public/js/customer-supplies.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function setup(runs, search = "") {
  const elements = new Map(), pending = new Map(), calls = [];
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, { value: "", innerHTML: "", textContent: "", disabled: false, handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; }, closest() { return get("main"); } });
    return elements.get(id);
  };
  const context = {
    document: { getElementById: get }, Intl, URL, URLSearchParams, setTimeout, clearTimeout,
    location: { href: `http://localhost/modules/purchasing/eta-monitor${search}`, search },
    history: { replaceState() {} }, localStorage: { getItem: () => "" }, sessionStorage: { getItem: () => "" },
    fetch: async (url) => {
      calls.push(url);
      let data;
      if (url.endsWith("/options")) data = { mrpRuns: runs, materials: [], uoms: [], warehouses: [] };
      else if (url.includes("/mrp/")) data = await new Promise((resolve, reject) => pending.set(decodeURIComponent(url.split("/mrp/")[1]), { resolve, reject }));
      else data = { items: [], total: 0 };
      return { ok: true, status: 200, json: async () => data };
    },
  };
  vm.runInNewContext(source, context); await flush();
  assert.equal(calls.length,0,'Customer operations are loaded only when expanded');
  const panel=get('eta-customer-operations');panel.open=true;panel.handlers.toggle();await flush();panel.handlers.toggle();await flush();
  assert.equal(calls.filter(url=>url.endsWith('/options')).length,1,'Reopening does not duplicate initialization');
  return { get, pending, async select(run) { get("cs-run").value = run; get("cs-run").handlers.change(); await flush(); } };
}
const runs = ["R013", "R012"].map((runNumber) => ({ runNumber, planningMonth: "2026-09-01T00:00:00Z", scenarioStatus: "APPROVED", status: "Completed" }));
const row = (id) => ({ id, partCode: id, requiredDate: "2026-09-01", netRequirement: 5 });
(async () => {
  const app = await setup(runs, "?run=R012");
  assert.equal(app.get("cs-run").value, "R012");
  assert.match(app.get("cs-run").innerHTML, /R013.*Sep 2026.*APPROVED/i);
  assert.equal(app.get("cs-run").disabled, false);
  assert.ok(app.pending.has("R012"));
  await app.select("R013");
  app.pending.get("R013").resolve({ items: [row("NEW-MATERIAL")] }); await flush();
  app.pending.get("R012").resolve({ items: [row("OLD-MATERIAL")] }); await flush();
  assert.match(app.get("cs-needs").innerHTML, /NEW-MATERIAL/);
  assert.doesNotMatch(app.get("cs-needs").innerHTML, /OLD-MATERIAL/);
  await app.select("R012");
  app.pending.get("R012").reject(new Error("Network error")); await flush();
  assert.match(app.get("cs-needs").textContent, /gagal dimuat/);
  assert.equal(app.get("cs-load-mrp").disabled, false);
  await app.select("");
  assert.equal(app.get("cs-load-mrp").disabled, true);
  assert.match(app.get("cs-needs").textContent, /Pilih MRP run/);
  const empty = await setup([]);
  assert.equal(empty.get("cs-run").disabled, true);
  assert.match(empty.get("cs-run").innerHTML, /Belum ada MRP run/);
  const invalid = await setup(runs, "?run=MISSING");
  assert.match(invalid.get("cs-message").textContent, /MISSING tidak tersedia/);
  assert.equal(invalid.pending.size, 0);
  const noNeeds = await setup(runs, "?run=R013");
  noNeeds.pending.get("R013").resolve({ items: [] }); await flush();
  assert.match(noNeeds.get("cs-needs").textContent, /Tidak ada kebutuhan/);
  console.log("PASS: run labels, deep links, automatic loading, stale responses, retry, placeholder, empty runs, invalid run, empty requirements.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
