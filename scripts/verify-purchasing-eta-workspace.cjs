"use strict";
// Offline UI checks: no backend imports, credentials, or network calls.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const script = read("public/js/purchasing-eta.js");
const html = require("ejs").render(read("views/purchasing/eta-monitor.ejs"), { initialMonth: "2026-09", include: () => "" });
const documents = ["MPS-A", "MPS-B"].map((mpsNumber) => ({ mpsNumber, revision: 2, status: "Calculated", href: "#checksheet", capacityStatus: "FEASIBLE", deliveryStatus: "READY", eta: { total: 3, confirmed: 0, ready: false } }));
const row = (mpsNumber, category, extra = {}) => ({ id: `${mpsNumber}-${category}`, mpsNumber, source: mpsNumber, mpsRevision: 2, category, code: `${category}-${mpsNumber}`, name: "Fixture material / process", partner: "Partner fixture", partnerCode: "PARTNER-01", leadTime: 7, needDate: "2026-09-18", targetArrivalDate: "2026-09-17", eta: "2026-09-17", requiredQty: 20, qty: 20, uom: "PCS", timing: "MISSING", confirmation: "PLANNED", canConfirm: true, href: "#source", sourceFingerprint: "fixture-fingerprint", ...extra });
const items = [row("MPS-A", "MATERIAL"), row("MPS-B", "MATERIAL", { confirmedLeadTimeDays: 2.5, effectiveLeadTimeDays: 2.5 }), row("MPS-B", "VENDOR"), row("MPS-B", "CUSTOMER")];
const payload = (selectedMpsNumber = "MPS-B", extra = {}) => ({ documents, selectedMpsNumber, items, permissions: { canConfirm: true, canEvaluate: false }, ...extra });
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 409, json: async () => body });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function harness(search = "?month=2026-09&mpsNumber=MPS-B", initial = payload()) {
  const elements = new Map(), requests = [], pending = [];
  class Element {
    constructor(id) { this.id = id; this.value = ""; this.checked = false; this.hidden = false; this.dataset = {}; this.events = {}; this.fields = {}; this._html = ""; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this[name] = value; }
    querySelectorAll() { return []; }
    reportValidity() { return true; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    set innerHTML(value) {
      this._html = value;
      if (["eta-source", "eta-mps"].includes(this.id)) this.value = value.match(/<option value="([^"]*)"/)?.[1] || "";
      if (this.id === "eta-detail") {
        elements.delete("eta-form");
        if (value.includes('id="eta-form"')) {
          const form = new Element("eta-form");
          for (const match of value.matchAll(/<(?:input|select|textarea)\b[^>]*name="([^"]+)"[^>]*>/g)) form.fields[match[1]] = match[0].match(/value="([^"]*)"/)?.[1] || "";
          elements.set("eta-form", form);
        }
      }
    }
    get innerHTML() { return this._html; }
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element(match[1]));
  for (const id of ["eta-form-error", "eta-form-warning"]) elements.set(id, new Element(id));
  elements.get("eta-month").value = "2026-09"; elements.get("eta-unresolved").checked = true;
  const buttons = ["", "supplier", "vendor", "customer", "checksheet"].map((category) => { const b = new Element(); b.dataset.etaPartner = category; return b; });
  const location = { href: `http://fixture.local/${search}`, search }; let nextId = 0;
  const context = vm.createContext({
    document: { getElementById: (id) => elements.get(id) || null, querySelectorAll: () => buttons },
    location, history: { replaceState: (_state, _title, url) => { location.href = String(url); location.search = new URL(url).search; } },
    window: { crypto: { randomUUID: () => `fixture-request-${String(++nextId).padStart(16, "0")}` } },
    localStorage: { getItem: () => "" }, sessionStorage: { getItem: () => "" },
    URL, URLSearchParams, AbortController, Intl, setTimeout, clearTimeout,
    FormData: class { constructor(form) { this.fields = form.fields; } get(key) { return this.fields[key] ?? null; } *[Symbol.iterator]() { yield* Object.entries(this.fields); } },
    fetch: async (url, options) => { requests.push({ url, ...options }); return pending.length ? pending.shift()(url, options) : response(initial); },
  });
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, "globalThis.etaTest = { openDetail, load, save, filteredRows }; })();"), context);
  return { elements, requests, pending, buttons, api: context.etaTest };
}
async function run() {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "rendered EJS IDs are unique");
  const h = harness(); const el = (id) => h.elements.get(id);
  assert.match(el("eta-documents").innerHTML, /Memuat MPS-B/);
  assert.doesNotMatch(el("eta-documents").innerHTML, /tidak tersedia/);
  assert.equal(el("eta-documents")["aria-busy"], "true");
  await tick();
  assert.equal(el("eta-documents")["aria-busy"], "false");
  assert.match(h.requests[0].url, /mps\?month=2026-09&mpsNumber=MPS-B/);
  assert.equal(h.requests.length, 1, "GET never auto-evaluates checksheet");
  assert.equal((el("eta-documents").innerHTML.match(/<article/g) || []).length, 1);
  assert.doesNotMatch(el("eta-documents").innerHTML, /MPS-A|data-evaluate/);
  assert.match(el("eta-mps").innerHTML, /MPS-A/); assert.match(el("eta-mps").innerHTML, /MPS-B/);
  assert.doesNotMatch(el("eta-body").innerHTML, /MPS-A/);
  for (const label of ["Supplier", "Vendor", "Customer"]) assert.ok(el("eta-body").innerHTML.includes(`Konfirmasi ${label}`));
  assert.match(el("eta-body").innerHTML, /Konfirmasi 2,5 hari/); assert.match(el("eta-body").innerHTML, /Master 7 hari/);
  for (const category of ["vendor", "customer", "supplier"]) {
    h.buttons.find((b) => b.dataset.etaPartner === category).events.click();
    assert.equal(h.api.filteredRows().length, 1); assert.equal(h.requests.length, 1, "category filter stays within MPS");
  }
  el("eta-mps").value = "MPS-A"; el("eta-mps").events.change(); await tick();
  assert.match(h.requests.at(-1).url, /mpsNumber=MPS-A/);
  assert.equal(el("eta-error").hidden, false, "server-selected mismatch fails closed");
  assert.doesNotMatch(el("eta-body").innerHTML, /MATERIAL-MPS-B/);
  h.pending.push(async () => response(payload("MPS-A"))); await h.api.load();
  assert.match(el("eta-documents").innerHTML, /MPS-A/); assert.doesNotMatch(el("eta-body").innerHTML, /MPS-B/);
  let resolveOld;
  h.pending.push(() => new Promise((resolve) => { resolveOld = resolve; })); const old = h.api.load();
  assert.match(el("eta-documents").innerHTML, /Memuat MPS-A/);
  assert.doesNotMatch(el("eta-documents").innerHTML, /tidak tersedia/);
  h.pending.push(async () => response(payload("MPS-B", { permissions: { canConfirm: true, canEvaluate: true } })));
  el("eta-mps").value = "MPS-B"; el("eta-mps").events.change(); await tick();
  resolveOld(response(payload("MPS-A"))); await old;
  assert.match(el("eta-documents").innerHTML, /MPS-B/); assert.match(el("eta-documents").innerHTML, /data-evaluate/);
  el("eta-month").value = "2026-10"; el("eta-month").events.change(); await tick();
  assert.doesNotMatch(h.requests.at(-1).url, /mpsNumber=/, "month switch clears selection");
  for (const [extra, expected] of [
    [{ confirmationRecord: { valid: true, leadTimeDays: 0 }, confirmedLeadTimeDays: 5 }, "0"],
    [{ confirmationRecord: { valid: true, leadTimeDays: 2.5 } }, "2.5"],
    [{ confirmationRecord: { valid: false, leadTimeDays: 2 }, confirmedLeadTimeDays: 2 }, "7"],
    [{ leadTime: null, confirmedLeadTimeDays: null }, ""],
  ]) {
    h.api.openDetail(row("MPS-B", "MATERIAL", extra));
    assert.equal(el("eta-form").fields.leadTimeDays, expected);
    assert.match(el("eta-detail").innerHTML, /name="leadTimeDays"[^>]*required/);
    assert.match(el("eta-detail").innerHTML, /readonly value="PARTNER-01/);
    assert.doesNotMatch(el("eta-detail").innerHTML, /name="(?:partnerCode|supplierCode|vendorCode)"/);
  }
  h.api.openDetail(row("MPS-B", "VENDOR", { canConfirm: false, blockedLink: { href: "/modules/master-data/vendors", label: "Lengkapi Vendor" } }));
  assert.equal(el("eta-form"), undefined); assert.match(el("eta-detail").innerHTML, /href="\/modules\/master-data\/vendors"/);
  h.api.openDetail(row("MPS-B", "CUSTOMER", { partnerCode: null })); assert.equal(el("eta-form"), undefined);
  for (const [value, expected] of [[213.27143759999998, "213.271438"], [20, "20"], [0, "0"], [0.000001, "0.000001"], [Infinity, ""], ["invalid", ""]]) {
    h.api.openDetail(row("MPS-B", "CUSTOMER", { confirmedQty: value, targetArrivalDate: null, needDate: "2026-09-01", leadTime: null }));
    assert.equal(el("eta-form").fields.qty, expected, "qty default is finite and rounded to six decimal places");
    assert.equal(el("eta-form").fields.leadTimeDays, "", "unknown lead time remains blank");
    assert.match(el("eta-detail").innerHTML, /Siap produksi 01 Sep 2026; target tiba belum ditetapkan/);
    assert.doesNotMatch(el("eta-detail").innerHTML, /Target tiba 01 Sep 2026/);
  }
  h.api.openDetail(row("MPS-B", "CUSTOMER", { requiredQty: 213.27143759999998 }));
  assert.equal(el("eta-form").fields.qty, "213.271438", "requirement fallback also rounds");
  assert.match(el("eta-detail").innerHTML, /Target tiba 17 Sep 2026/, "actual target keeps its label");
  h.api.openDetail(row("MPS-B", "VENDOR", { earliestReturnDate: "2026-09-22", leadTimeFits: false, readiness: { ready: false, reason: "Vendor lead time melewati jendela proses." } }));
  assert.match(el("eta-detail").innerHTML, /22 Sep 2026/);
  assert.match(el("eta-detail").innerHTML, /Vendor lead time melewati jendela proses/);
  h.api.openDetail(row("MPS-B", "VENDOR", { confirmationRecord: { id: "CONF-1", valid: true, leadTimeDays: 7 } }));
  const form = el("eta-form"); form.fields.reference = "Fixture only";
  for (const invalid of ["", "-1", "Infinity", "NaN", "3650.1"]) {
    form.fields.leadTimeDays = invalid; const before = h.requests.length;
    await h.api.save({ preventDefault() {}, currentTarget: form }); assert.equal(h.requests.length, before, `invalid lead ${invalid} cannot submit`);
  }
  form.fields.leadTimeDays = "0";
  const fail = async () => response({ message: "Sumber berubah; refresh" }, false);
  h.pending.push(fail); await h.api.save({ preventDefault() {}, currentTarget: form });
  const body = JSON.parse(h.requests.at(-1).body);
  assert.equal(body.mpsNumber, "MPS-B"); assert.equal(body.leadTimeDays, 0); assert.equal(body.sourceFingerprint, "fixture-fingerprint"); assert.equal(body.confirmationId, "CONF-1");
  h.pending.push(fail); await h.api.save({ preventDefault() {}, currentTarget: form });
  assert.equal(JSON.parse(h.requests.at(-1).body).requestId, body.requestId, "unchanged retry preserves idempotency");
  form.fields.leadTimeDays = "1.5"; form.events.input();
  h.pending.push(fail); await h.api.save({ preventDefault() {}, currentTarget: form });
  const changed = JSON.parse(h.requests.at(-1).body); assert.equal(changed.leadTimeDays, 1.5); assert.notEqual(changed.requestId, body.requestId);
  const legacy = harness("?tab=supplier&source=orders", { items: [row("PO-1", "MATERIAL")] }); await tick();
  assert.match(legacy.requests[0].url, /\/orders\?month=/); assert.equal(legacy.elements.get("eta-documents").hidden, true);
  legacy.api.openDetail(row("PO-1", "MATERIAL"));
  const legacyForm = legacy.elements.get("eta-form"); legacyForm.fields.reference = "Fixture only";
  legacy.pending.push(fail); await legacy.api.save({ preventDefault() {}, currentTarget: legacyForm });
  const legacyBody = JSON.parse(legacy.requests.at(-1).body);
  assert.equal(legacyBody.confirmationId, null); assert.equal(legacyBody.mpsNumber, undefined);
  const vendorRisk = harness(undefined, payload("MPS-B", { items: [row("MPS-B", "VENDOR", { confirmed: true, confirmation: "CONFIRMED", timing: "ON_TRACK", confirmedQty: 20, readiness: { ready: false, reason: "Lead time vendor tidak muat" } })] })); await tick();
  assert.equal(vendorRisk.api.filteredRows().length, 1, "vendor readiness failure remains in follow-up filter even with on-time ETA");
  const unknown = harness(undefined, payload("MPS-B", { items: [row("MPS-B", "VENDOR", { confirmed: true, confirmation: "CONFIRMED", timing: "UNKNOWN", confirmedQty: 20 })] })); await tick();
  assert.equal(unknown.api.filteredRows().length, 1, "UNKNOWN timing always remains in follow-up");
  const empty = harness("?month=2026-09&tab=mps", payload(null, { documents: [], items: [] })); await tick();
  assert.equal(empty.elements.get("eta-start").disabled, true); assert.match(empty.elements.get("eta-documents").innerHTML, /Pilih MPS/);
  for(const search of ['?month=2026-09&tab=ppic&source=ppic&partner=customer','?month=2026-09&tab=customer&source=customer&releaseId=round1']){
    const customer=harness(search,{items:[row('CR1','CUSTOMER',{sourceType:'customer'}),row('PS1','MATERIAL',{sourceType:'suggestions'})]});await tick();
    assert.match(customer.requests[0].url,/\/ppic\?month=/);
    const button=customer.buttons.find(b=>b.dataset.etaPartner==='customer');assert.equal(button.hidden,false);assert.equal(button['aria-pressed'],'true');
    assert.equal(customer.api.filteredRows().length,1);assert.equal(customer.api.filteredRows()[0].category,'CUSTOMER');
    customer.api.openDetail(customer.api.filteredRows()[0]);assert.equal(customer.elements.get('eta-form').fields.moq,undefined);
  }
  console.log("PASS ETA workspace: EJS, exact MPS, categories, stale responses, permissions, lead-time defaults/limits, fixed partner, scoped payload, optimistic confirmation, idempotency, legacy and empty states (offline).");
}
if (process.argv.includes("--serve")) {
  // Isolated visual preview: even accidental submissions are rejected locally.
  require("node:http").createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method !== "GET") { res.writeHead(405, { "Content-Type": "application/json" }); return res.end('{"message":"Read-only fixture: confirmations disabled"}'); }
    if (url.pathname.startsWith("/modules/api/")) { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(payload(url.searchParams.get("mpsNumber") || "MPS-B"))); }
    const assets = { "/js/purchasing-eta.js": ["public/js/purchasing-eta.js", "text/javascript"], "/css/purchasing-eta.css": ["public/css/purchasing-eta.css", "text/css"], "/css/purchase-suggestion-compact-ui.css": ["public/css/purchase-suggestion-compact-ui.css", "text/css"] };
    if (assets[url.pathname]) { const [file, type] = assets[url.pathname]; res.setHeader("Content-Type", type); return res.end(read(file)); }
    if (url.pathname !== "/") { res.writeHead(404); return res.end(); }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f7f9fc;font-family:Arial,sans-serif}.app-container{margin:auto;padding:24px;max-width:1500px}*{box-sizing:border-box}</style></head><body>${html}<script src="/js/purchasing-eta.js"></script></body></html>`);
  }).listen(4179, "127.0.0.1", () => console.log("Read-only ETA fixture: http://127.0.0.1:4179/?mpsNumber=MPS-B"));
} else run().catch((error) => { console.error(error); process.exitCode = 1; });
