const assert = require("node:assert/strict");
const workspace = require("../public/js/bom-table-workspace");

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = {};
    this.attributes = {};
    this.hidden = false;
    this.classList = { toggle() {} };
  }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatchEvent(event) { (this.listeners[event.type] || []).forEach((handler) => handler(event)); }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function row(partId, label, number, otherOptions = []) {
  const element = new Element({ rowKey: partId || "new" });
  element.part = { value: partId, selectedOptions: [{ textContent: label }], options: [{ textContent: label }, ...otherOptions.map((textContent) => ({ textContent }))] };
  element.querySelector = (selector) => selector === '[data-field="partId"]' ? element.part : selector === ".bom-part-number" ? { textContent: number } : null;
  return element;
}

const table = new Element();
const body = new Element();
body.rows = [row("a", "C003-0017 Retainer", "RET-KPH", ["C999 Bracket"]), row("b", "C004 Bracket", "BR-100")];
body.querySelectorAll = () => body.rows;
const search = new Element(); search.value = "";
const count = new Element();
const empty = new Element();
const buttons = Object.keys(workspace.views).map((view) => new Element({ bomColumnView: view }));
const commandbar = new Element();
const controller = {
  headers: Array(18).fill({}), state: { hidden: [], widths: { 1: 320 }, frozen: [0] }, commandbar,
  persistAndApply() { this.writes = (this.writes || 0) + 1; },
  renderSettingsRows() {}, applyColumnVisibility() {}, renderPinnedOverlay() {},
};
const elements = { "bom-detail-edit-table": table, "bom-table-edit-rows": body, "bom-table-search": search, "bom-table-row-count": count, "bom-table-search-empty": empty };
const document = { getElementById: (id) => elements[id], querySelectorAll: () => buttons };
const window = { SharedDataTable: { enhance: () => controller }, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } } };
const events = [];
table.addEventListener("bom-table:view-change", (event) => events.push(event.detail.view));
const instance = workspace.initialize(document, window);

assert.equal(table.dataset.bomView, "structure");
assert.equal(count.textContent, "2 dari 2 komponen");
assert.equal(empty.hidden, true);
assert.deepEqual(controller.state.hidden, [7, 8, 10, 11, 12, 13, 14, 15, 16]);
assert.deepEqual(controller.state.widths, { 1: 320 });
assert.deepEqual(controller.state.frozen, [0]);
assert.equal(buttons[0].attributes["aria-pressed"], "true");
assert.equal(workspace.initialize(document, window), instance, "Initialization must not duplicate handlers.");

search.value = "bracket"; search.dispatchEvent({ type: "input" });
assert.equal(body.rows[0].hidden, true, "Unselected options must not make a row match.");
assert.equal(body.rows[1].hidden, false);
assert.equal(count.textContent, "1 dari 2 komponen");
search.value = "kph retainer"; search.dispatchEvent({ type: "input" });
assert.equal(body.rows[0].hidden, false, "Part number and label must be searchable together.");
assert.equal(body.rows[1].hidden, true);
search.value = "missing"; search.dispatchEvent({ type: "input" });
assert.equal(empty.hidden, false);
assert.equal(count.textContent, "0 dari 2 komponen");

body.rows.push(row("", "Pilih Part", ""));
table.dispatchEvent({ type: "bom-table:rows-rendered" });
assert.equal(body.rows[2].hidden, false, "An added empty row must remain editable while searching.");
assert.equal(body.rows[0].hidden, true, "The current query must survive rendering.");
assert.equal(count.textContent, "1 dari 3 komponen");
assert.equal(empty.hidden, true);

buttons[1].dispatchEvent({ type: "click" });
assert.equal(table.dataset.bomView, "material");
assert.equal(body.rows[0].hidden, true, "Changing column views must preserve row search.");
assert.deepEqual(controller.state.hidden, workspace.hiddenColumns("material"));
controller.state.hidden = controller.state.hidden.filter((index) => index !== 7);
commandbar.dispatchEvent({ type: "change", target: { closest: () => ({}) } });
assert.equal(table.dataset.bomView, "custom");
assert.equal(buttons.every((button) => button.attributes["aria-pressed"] === "false"), true);
const manualColumns = [...controller.state.hidden];
table.dispatchEvent({ type: "bom-table:rows-rendered" });
assert.deepEqual(controller.state.hidden, manualColumns, "Rendering must not reset manually selected columns.");

instance.setView("cost");
assert.deepEqual(controller.state.hidden, [4, 5, 6, 10, 11, 16]);
instance.setView("all");
assert.deepEqual(controller.state.hidden, []);
assert.ok(events.includes("custom"));
search.value = ""; search.dispatchEvent({ type: "input" });
assert.equal(body.rows.every((item) => !item.hidden), true);
assert.equal(body.rows.length, 3, "Search must never remove component rows.");
console.log("BOM table workspace passed: column presets, shared manual settings, selected-part search, and draft-row visibility.");
