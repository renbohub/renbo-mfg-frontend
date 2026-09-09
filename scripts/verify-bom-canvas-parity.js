"use strict";

// Runs the real canvas functions against a small DOM/fetch harness. No database,
// browser session, draft approval, or BOM write is performed by these checks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const publicJs = path.resolve(__dirname, "../public/js");
const canvasSource = fs.readFileSync(path.join(publicJs, "bom-editor.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

class Element {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.listeners = new Map();
    this.controls = [];
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  set innerHTML(value) {
    this.html = String(value);
    this.controls = [...this.html.matchAll(/<(input|select|textarea|button)\b([^>]*)>/g)].map((match) => {
      const control = new Element();
      control.tagName = match[1].toUpperCase();
      control.disabled = /\bdisabled(?:\s|=|$)/.test(match[2]);
      control.checked = /\bchecked(?:\s|=|$)/.test(match[2]);
      for (const field of match[2].matchAll(/data-([\w-]+)="([^"]*)"/g)) {
        control.dataset[field[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = field[2];
      }
      return control;
    });
  }
  get innerHTML() {
    if (this.html !== undefined) return this.html;
    return String(this.textContent).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  addEventListener(name, listener) {
    this.listeners.set(name, [...(this.listeners.get(name) || []), listener]);
  }
  removeEventListener() {}
  querySelectorAll() { return this.controls; }
  querySelector() { return new Element(); }
  appendChild() {}
  replaceChildren(...children) { this.controls = children; this.value = children[0]?.value || ''; }
  setAttribute() {}
  focus() {}
  scrollIntoView() {}
}

function harness(records = {}, mode = "edit") {
  const elements = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  byId("bom-editor-config").textContent = JSON.stringify({ mode, recordKey: "BOM-TEST" });
  const storage = { getItem() { return "unit-test-token"; }, setItem() {} };
  const window = { addEventListener() {}, scrollTo() {}, crypto: { randomUUID: () => "test-uuid" } };
  const document = {
    getElementById: byId,
    createElement: () => new Element(),
    querySelector: byId,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({
    window, document, localStorage: storage, sessionStorage: storage,
    location: { pathname: "/modules/manufacturing-bom/bill-of-materials/BOM-TEST/edit", search: "", replace() {} },
    history: { replaceState() {} }, URLSearchParams, console, setTimeout, clearTimeout,
    confirm: () => false,
    Option: class { constructor(text, value) { this.textContent = text; this.value = value; } },
    fetch: async (url, options = {}) => {
      assert.equal(options.method || "GET", "GET", "test must never write a BOM");
      const key = decodeURIComponent(String(url).split("/").pop());
      assert.ok(records[key], `Unexpected fixture request ${url}`);
      return { ok: true, status: 200, json: async () => plain(records[key]) };
    },
  });
  for (const file of ["bom-machine-policy.js", "bom-executor-policy.js", "bom-commercial.js", "bom-canvas-panels.js"]) {
    const filename = path.join(publicJs, file);
    if (fs.existsSync(filename)) vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
    // A real browser's globalThis is window. Keep that alias for UMD helpers
    // while retaining a simple, isolated VM global in the fixture.
    for (const name of ["BomMachinePolicy", "BomExecutorPolicy", "BomCommercial", "BomCanvasPanels"]) {
      if (context[name]) window[name] = context[name];
      else if (window[name]) context[name] = window[name];
    }
  }
  const hook = `
    window.__canvasTest = {
      state, loadRecord, loadDraft, draftSnapshot, serializeBomNode, materialConsumption,
      assignProcessOccurrenceCodes, renderNodeProcesses, belongsToChildAssembly,
      expandLinkedBom, panels, commercial,
      quietRendering() {
        renderRoot = () => {};
        autoLayout = () => {};
        fitCanvas = () => {};
        renderAll = () => {};
        renderInspector = () => {};
        recalculatePendingPreviewCodes = () => {};
      }
    };
  `;
  assert.match(canvasSource, /\n  initialize\(\);\s*\n\}\)\(\);\s*$/,
    "canvas bootstrap must be replaced before the VM executes");
  vm.runInContext(canvasSource.replace(/\n  initialize\(\);\s*\n\}\)\(\);\s*$/, `${hook}\n})();`), context,
    { filename: "bom-editor.js" });
  const api = window.__canvasTest;
  api.quietRendering();
  return { api, elements, byId };
}

const machinePolicy = {
  primaryMachineId: "machine-primary", mode: "PARALLEL", maxParallelMachines: 2,
  requiresTooling: true, approvalReference: "TRIAL-2026-007",
  resources: [
    { machineId: "machine-primary", diesId: "die-one", cycleTimeSeconds: 4, setupMinutes: 12 },
    { machineId: "machine-spare", diesId: "die-two", cycleTimeSeconds: 5, setupMinutes: 15 },
  ],
};
const processes = [
  { id: "route-inhouse", processId: "press", routingMode: "INHOUSE", sequence: 10,
    machineId: "machine-primary", machineSpecificationCode: "PRESS-110T", cycleTime: 4,
    diesId: "die-one", machinePlanningPolicy: machinePolicy, notes: "Check fixture before each shift" },
  { id: "route-vendor", processId: "paint", routingMode: "VENDOR", sequence: 20,
    vendorId: "vendor-paint", cycleTime: 0, notes: "Finish satin; do not coat thread" },
];
const materialFields = {
  materialThickness: 1, materialWidth: 100, materialDensity: 0.000001,
  materialPitch: 50, materialCavity: 2, materialFormId: "form-coil",
  materialScheme: "ALTERNATIVE", defaultGrossWeight: 0.0025,
  alternateMaterialFormId: "form-sheet", alternateMaterialPitch: 60,
  alternateMaterialCavity: 3, alternateGrossWeight: 0.002, grossWeight: 0.002,
};
const parts = [
  { id: "fg", partCode: "FG-1", itemType: "FG", customerCode: "C001" },
  { id: "raw", partCode: "RAW-1", itemType: "RAW", rawType: "MATERIAL", supplierId: "supplier-master",
    materialId: "material", material: { id: "material", thickness: 4, width: 200, density: 0.000002 } },
  { id: "purchased", partCode: "PUR-1", itemType: "RAW", rawType: "PURCHASE_PART", supplierId: "supplier-master" },
  { id: "wip", partCode: "WIP-1", itemType: "WIP" },
];
const record = {
  id: "bom-id", noReg: "BOM-TEST", partId: "fg", part: parts[0], revision: 3,
  revisionPolicy: { isLatest: true, mode: "correction", usedInProduction: false, reason: "Belum dipakai produksi." },
  uomCode: "PCS", effectiveDate: "2026-07-01", notes: "July production fixture",
  details: [
    { id: "row-customer", partId: "raw", part: parts[1], category: "Purchase", qty: 2, uomCode: "PCS",
      materialSupplyType: "CUSTOMER_SUPPLIED", supplyCustomerId: "customer-owner", supplierId: null,
      ...materialFields },
    { id: "row-supplier", partId: "purchased", part: parts[2], category: "Purchase", qty: 3, uomCode: "PCS",
      materialSupplyType: "SUPPLIER_PURCHASE", supplierId: "supplier-bom-override" },
    { id: "row-routing", partId: "wip", part: parts[3], category: "inHouse", qty: 1, uomCode: "PCS", mbomProcesses: processes },
  ],
};

function seed(api) {
  Object.assign(api.state, {
    parts: plain(parts), materials: [], materialForms: [
      { id: "form-coil", symbol: "C", formName: "Coil" },
      { id: "form-sheet", symbol: "S", formName: "Sheet" },
    ],
    processMaster: [{ id: "press", processCode: "PRG", processName: "Press" }, { id: "paint", processCode: "PAINT", processName: "Paint" }],
    machines: [
      { id: "machine-primary", machineName: "P-1", machineCode: "M-001", machineSpecificationCode: "PRESS-110T", status: "Active", costingRate: 3600 },
      { id: "machine-spare", machineName: "P-2", machineCode: "M-002", machineSpecificationCode: "PRESS-110T", status: "Active" },
    ],
    dies: [{ id: "die-one", diesCode: "D-1", status: "Active" }, { id: "die-two", diesCode: "D-2", status: "Active" }],
    vendors: [{ id: "vendor-paint", vendorCode: "PAINTER", vendorName: "Paint supplier", status: "Active" }],
    customers: [{ id: "customer-owner", customerCode: "C001", status: "Active" }],
    suppliers: [{ id: "supplier-bom-override", supplierCode: "SUP-2" }],
    vendorProcesses: [{ id: "vp-paint", vendorProcessCode: "PAINT", vendorIds: ["vendor-paint"] }],
    machineCostRates: [], partPrices: [], materialPrices: [], vendorPrices: [], currencies: [],
  });
}

async function change(element, value, target = element) {
  target.value = value;
  for (const listener of element.listeners.get("change") || []) {
    await listener.call(element, { target, currentTarget: element });
  }
}

async function input(element, value, target = element) {
  target.value = value;
  for (const listener of element.listeners.get("input") || []) {
    await listener.call(element, { target, currentTarget: element });
  }
}

async function main() {
  const { api, byId } = harness({ "BOM-TEST": record });
  seed(api);
  await api.loadRecord();
  assert.equal(byId("bom-revision-mode").value, "correction");
  assert.equal(byId("bom-revision-mode").disabled, true);
  assert.equal(byId("bom-revision-note").required, false);
  assert.equal(byId("bom-save").disabled, false);
  const used = harness({ "BOM-TEST": { ...record, effectiveDate: "2026-07-01T17:00:00.000Z", revisionPolicy: { isLatest: true, mode: "newRevision", nextRevision: 4, nextEffectiveDate: "2026-08-20", reason: "Sudah dipakai produksi." } } });
  seed(used.api); await used.api.loadRecord();
  assert.equal(used.byId("bom-revision-mode").value, "newRevision");
  assert.equal(used.byId("bom-revision-note").required, true);
  assert.equal(used.byId("bom-effective").value, "2026-08-20");
  const historical = harness({ "BOM-TEST": { ...record, effectiveDate: "2026-07-01T17:00:00.000Z", revisionPolicy: { isLatest: false, mode: "correction", latestNoReg: "BOM-LATEST" } } });
  seed(historical.api); await historical.api.loadRecord();
  assert.equal(historical.byId("bom-save").disabled, true);
  assert.equal(historical.byId("bom-effective").value, "2026-07-02", "Jakarta midnight must not shift back a day on edit");
  const raw = api.state.nodes.find((node) => node.id === "row-customer");
  const purchased = api.state.nodes.find((node) => node.id === "row-supplier");
  const routing = api.state.nodes.find((node) => node.id === "row-routing");
  assert.equal(raw.materialSupplyType, "CUSTOMER_SUPPLIED", "load canvas must preserve customer material ownership");
  assert.equal(raw.supplyCustomerId, "customer-owner");
  assert.equal(purchased.supplierId, "supplier-bom-override", "BOM supplier must win over part-master supplier");

  const draft = api.draftSnapshot();
  const draftRaw = draft.nodes.find((node) => node.clientKey === "row-customer");
  const draftPurchased = draft.nodes.find((node) => node.clientKey === "row-supplier");
  assert.equal(draftRaw.materialSupplyType, "CUSTOMER_SUPPLIED");
  assert.equal(draftRaw.supplyCustomerId, "customer-owner");
  assert.equal(draftPurchased.supplierId, "supplier-bom-override");
  assert.deepEqual(plain(draft.nodes.find((node) => node.clientKey === "row-routing").processes), processes,
    "autosave must round-trip mixed vendor/in-house routing, notes, and tooling policy");

  const payload = plain(api.serializeBomNode(raw));
  assert.equal(payload.materialSupplyType, "CUSTOMER_SUPPLIED");
  assert.equal(payload.supplyCustomerId, "customer-owner");
  assert.equal(payload.supplierId, null);
  assert.equal(api.serializeBomNode(purchased).supplierId, "supplier-bom-override");
  for (const [key, value] of Object.entries(materialFields)) {
    assert.equal(payload[key], value, `${key} must survive canvas serialization without adopting a changed master snapshot`);
  }
  assert.deepEqual(plain(api.serializeBomNode(routing).mbomProcesses[0].machinePlanningPolicy), machinePolicy);
  assert.equal(api.serializeBomNode(routing).mbomProcesses[1].vendorId, "vendor-paint");

  api.assignProcessOccurrenceCodes();
  assert.equal(routing.processes[0].notes, processes[0].notes, "renumbering must not replace process notes with occurrence code");
  assert.equal(routing.processes[1].notes, processes[1].notes);
  assert.ok(routing.processes.every((process) => process.occurrenceCode && process.routingNumber));

  const invalidAlternative = { ...plain(raw), alternateMaterialPitch: null, alternateGrossWeight: null };
  api.materialConsumption(invalidAlternative);
  assert.equal(invalidAlternative.grossWeight, 0,
    "an incomplete active alternative must not silently display default material consumption");

  api.state.selectedId = "row-routing";
  api.renderNodeProcesses(routing);
  const routingHtml = byId("node-process-list").innerHTML;
  assert.match(routingHtml, /data-process-field="routingMode"/, "canvas must offer in-house/vendor mode");
  assert.match(routingHtml, /data-process-field="vendorId"/, "canvas must offer the eligible vendor selector");
  assert.match(routingHtml, /data-process-field="notes"/, "canvas must offer routing notes");
  assert.match(routingHtml, /data-policy-field="primaryMachineId"/, "in-house routing must retain machine planning policy");
  const readOnlyReference = { ...routing, external: true };
  api.renderNodeProcesses(readOnlyReference);
  assert.ok(byId("node-process-list").controls.length > 0);
  assert.ok(byId("node-process-list").controls.every((control) => control.disabled),
    "all process and tooling controls on referenced child BOM rows must remain read-only");

  // A linked WIP is an ownership boundary just as an FG is; the child BOM's
  // rows must never be copied into a parent draft or saved a second time.
  const linkedRecord = plain(record);
  linkedRecord.details = [
    { id: "row-host", partId: "wip", part: { ...parts[3], mbomHeaders: [{ noReg: "BOM-CHILD" }] }, category: "inHouse", qty: 2, uomCode: "PCS" },
    { ...plain(record.details[0]), id: "legacy-embedded", parentDetailId: "row-host" },
  ];
  const childRecord = {
    id: "child-id", noReg: "BOM-CHILD", partId: "wip", part: parts[3],
    details: [{ ...plain(record.details[0]), id: "child-owned-row", parentDetailId: null }],
  };
  const linked = harness({ "BOM-TEST": linkedRecord, "BOM-CHILD": childRecord });
  seed(linked.api);
  await linked.api.loadRecord();
  const childRows = linked.api.state.nodes.filter((node) => node.partId === "raw");
  assert.equal(childRows.length, 1, "legacy embedded and external child details must not both appear in the canvas");
  assert.equal(childRows[0].external, true);
  assert.equal(childRows[0].materialSupplyType, "CUSTOMER_SUPPLIED");
  assert.equal(childRows[0].supplyCustomerId, "customer-owner");
  assert.ok(linked.api.draftSnapshot().nodes.every((node) => node.partId !== "raw"),
    "referenced child details must be excluded from the parent draft");
  const localDescendant = { clientKey: "new-local-descendant", parentDetailId: "row-host", partId: "raw" };
  assert.equal(linked.api.belongsToChildAssembly(localDescendant), true,
    "linked WIP parent must be recognized as a child BOM ownership boundary");

  // A child BOM can itself contain a linked WIP plus obsolete embedded rows.
  // Only the leaf maintained in the grandchild BOM contributes to the price.
  const nestedPart = { id: "nested-wip", partCode: "WIP-2", itemType: "WIP" };
  const nestedParent = plain(linkedRecord);
  nestedParent.details = [{ ...plain(linkedRecord.details[0]), category: "Purchase", qty: 2 }];
  const nestedChild = {
    id: "child-id", noReg: "BOM-CHILD", partId: "wip", part: parts[3], details: [
      { id: "nested-host", partId: nestedPart.id,
        part: { ...nestedPart, mbomHeaders: [{ noReg: "BOM-GRANDCHILD" }] },
        qty: 1, uomCode: "PCS", category: "inHouse" },
      { id: "nested-legacy-leaf", parentDetailId: "nested-host", partId: "purchased", part: parts[2],
        qty: 99, uomCode: "PCS", category: "Purchase" },
    ],
  };
  const grandchild = {
    id: "grandchild-id", noReg: "BOM-GRANDCHILD", partId: nestedPart.id, part: nestedPart, details: [
      { id: "actual-leaf", partId: "purchased", part: parts[2], qty: 3, uomCode: "PCS", category: "Purchase" },
    ],
  };
  const nestedRecords = { "BOM-TEST": nestedParent, "BOM-CHILD": nestedChild, "BOM-GRANDCHILD": grandchild };
  const nested = harness(nestedRecords);
  seed(nested.api);
  nested.api.state.parts.push(nestedPart);
  nested.api.state.partPrices = [
    { partId: "wip", unitPrice: 100, effectiveFrom: "2026-01-01", currencyCode: "IDR" },
    { partId: "purchased", supplierId: "supplier-master", unitPrice: 10, effectiveFrom: "2026-01-01", currencyCode: "IDR" },
  ];
  await nested.api.loadRecord();
  const nestedHost = nested.api.state.nodes.find((node) => node.id === "row-host");
  const nestedLeaves = nested.api.state.nodes.filter((node) => node.partId === "purchased");
  assert.equal(nestedLeaves.length, 1, "nested linked BOM must suppress its own legacy embedded descendants");
  assert.equal(nestedLeaves[0].sourceDetailId, "actual-leaf");
  assert.equal(nestedLeaves[0].qty, 3);
  assert.equal(nested.api.panels.estimate(nestedHost).total, 60,
    "linked purchase host qty 2 must use child cost 3 x 10; do not add host purchase price 100 or obsolete embedded cost");
  assert.equal(nested.api.panels.estimate(nestedHost).lines, 1);
  assert.equal(nested.api.panels.estimate(nestedHost).covered, 1);

  const nestedDraft = plain(nested.api.draftSnapshot());
  assert.equal(nestedDraft.nodes.length, 1, "draft stores only the linked host, not expanded nested references");
  const reopened = harness({
    ...nestedRecords,
    "BOM-TEST": { id: "draft-id", status: "DRAFT", draftNumber: "DRAFT-TEST", updatedAt: "2026-07-01T00:00:00Z", payload: nestedDraft },
  }, "draft");
  seed(reopened.api);
  reopened.api.state.parts.push(nestedPart);
  reopened.api.state.partPrices = plain(nested.api.state.partPrices);
  await reopened.api.loadDraft();
  assert.equal(reopened.api.state.nodes.length, 3, "opening a draft must re-expand both child and grandchild references");
  assert.equal(reopened.api.state.nodes.filter((node) => node.external).length, 2);
  assert.equal(reopened.api.panels.estimate(reopened.api.state.nodes[0]).total, 60,
    "draft reload must restore linked costs, not show an empty or purchased host estimate");
  assert.equal(reopened.api.draftSnapshot().nodes.length, 1);

  // Exercise real change handlers: replacing the host removes references;
  // choosing the original part again must restore every nested reference.
  nested.api.state.selectedId = "row-host";
  await change(nested.byId("node-part"), "purchased");
  assert.equal(nested.api.state.nodes.length, 1);
  await change(nested.byId("node-part"), "wip");
  assert.equal(nested.api.state.nodes.length, 3,
    "switching a linked host away and back must clear descendant expansion caches and restore the grandchild");

  const eventFixture = harness({ "BOM-TEST": record });
  seed(eventFixture.api);
  await eventFixture.api.loadRecord();
  eventFixture.api.state.selectedId = "row-customer";
  await change(eventFixture.byId("node-category"), "inHouse");
  const changedSource = eventFixture.api.state.nodes.find((node) => node.id === "row-customer");
  assert.equal(changedSource.materialSupplyType, "SUPPLIER_PURCHASE",
    "changing category away from Purchase must clear customer supply so backend receives a valid source/category pair");
  assert.equal(changedSource.supplyCustomerId, null);

  eventFixture.api.state.selectedId = "row-routing";
  const routeList = eventFixture.byId("node-process-list");
  const target = new Element();
  target.closest = () => ({ dataset: { processIndex: "1" } });
  target.dataset.processField = "routingMode";
  await change(routeList, "INHOUSE", target);
  const editedVendor = eventFixture.api.state.nodes.find((node) => node.id === "row-routing").processes[1];
  assert.equal(editedVendor.vendorId, null, "switching to in-house must remove the vendor assignment");
  await change(routeList, "VENDOR", target);
  assert.equal(editedVendor.vendorId, "vendor-paint", "switching to vendor must select the sole eligible process vendor");
  assert.equal(editedVendor.machineId, null);
  assert.equal(editedVendor.diesId, null);
  assert.equal(editedVendor.cycleTime, 0);
  assert.equal(editedVendor.machinePlanningPolicy.primaryMachineId, undefined, "vendor default must not retain a top-level machine assignment");
  assert.deepEqual(plain(editedVendor.machinePlanningPolicy.execution.allowedModes), ["VENDOR"], "switching defaults must not implicitly authorize both modes");

  const editedInHouse = eventFixture.api.state.nodes.find((node) => node.id === "row-routing").processes[0];
  eventFixture.api.state.machines.push({ id: "machine-new-spec", machineCode: "S-1", machineSpecificationCode: "SPOT", status: "Active" });
  target.closest = () => ({ dataset: { processIndex: "0" } });
  target.dataset.processField = "machineSpecificationCode";
  await change(routeList, "SPOT", target);
  assert.equal(editedInHouse.machineId, "machine-new-spec");
  assert.equal(editedInHouse.diesId, null, "a new machine specification must not reuse a stale dies assignment");
  assert.deepEqual(plain(editedInHouse.machinePlanningPolicy), {});

  const externalRouting = eventFixture.api.state.nodes.find((node) => node.id === "row-routing");
  externalRouting.external = true;
  target.dataset.processField = "notes";
  const beforeExternalEdit = plain(externalRouting.processes);
  await change(routeList, "Should not be written into reference", target);
  assert.deepEqual(plain(externalRouting.processes), beforeExternalEdit,
    "referenced routing must reject change events in addition to disabling UI controls");

  const typing = harness({ "BOM-TEST": record });
  seed(typing.api);
  typing.api.state.machines[0].costingRate = 151200; // Rp42 per second.
  typing.api.state.machines[0].costingRateType = "PER_HOUR";
  await typing.api.loadRecord();
  typing.api.state.selectedId = "row-routing";
  const typingNode = typing.api.state.nodes.find((node) => node.id === "row-routing");
  typing.api.renderNodeProcesses(typingNode);
  const typingList = typing.byId("node-process-list");
  const listMarkupBefore = typingList.innerHTML;
  const controlsBefore = typingList.controls;
  const amount = new Element();
  const row = { dataset: { processIndex: "0" }, querySelector: () => amount };
  const typingTarget = new Element();
  typingTarget.dataset.processField = "cycleTime";
  typingTarget.closest = () => row;
  assert.equal(typing.api.commercial.processCost(typingNode.processes[0], typingNode).value, 168);
  await input(typingList, "5", typingTarget);
  const money210 = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(210);
  assert.equal(typingNode.processes[0].cycleTime, 5, "typing must update cycle time without waiting for blur/change");
  assert.equal(amount.textContent, money210, "5 seconds at Rp42/second must immediately show Rp210 on the routing card");
  assert.equal(typing.byId("canvas-summary-process").textContent, money210, "overview must update while cycle time is being typed");
  assert.ok(typing.byId("node-cost-breakdown").innerHTML.includes(money210), "cost panel must update without reopening it");
  assert.equal(typingList.innerHTML, listMarkupBefore, "typing must not replace the routing form and move the cursor");
  assert.equal(typingList.controls, controlsBefore, "typing must retain the existing input controls");
  typingTarget.dataset.processField = "notes";
  const typedNotes = "Check thread before coating\nDo not paint bearing surface";
  await input(typingList, typedNotes, typingTarget);
  assert.equal(typingNode.processes[0].notes, typedNotes, "notes must enter state immediately and preserve intentional newlines");
  assert.equal(typingList.controls, controlsBefore, "typing notes must retain the input and cursor");
  typingNode.external = true;
  await input(typingList, "Reference must stay unchanged", typingTarget);
  assert.equal(typingNode.processes[0].notes, typedNotes, "external reference must reject input events as well as change events");

  console.log("BOM canvas parity: material/source round-trip, mixed routing/tooling, notes, snapshots, read-only references, nested ownership/cost, draft re-expansion, change handlers, and live input costing passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
