"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "public/js/ppic-mps-table-layout.js");
const { offsets } = require(scriptPath);
const widths = [36, 146, 184, ...Array(15).fill(82), 48, 192, 152];
assert.deepEqual(offsets(widths, 36), {
  "--mwb-left-pn": 36, "--mwb-left-name": 182,
  "--mwb-right-action": 344, "--mwb-right-checklist": 152,
  "--mwb-group-height": 36,
});
const resized = widths.map((width) => width * 1.25);
assert.equal(offsets(resized, 45)["--mwb-left-name"], 227.5);
assert.equal(offsets(resized, 45)["--mwb-right-action"], 430);
const mobile = [...widths];
mobile[1] = 132;
assert.equal(offsets(mobile, 48)["--mwb-left-name"], 168);

// Exercise the actual controller against changing browser measurements.
let observerCallback, resizeCallback, writes = 0;
let height = 36;
const scheduled = [];
const properties = new Map();
const headers = { cells: widths.map((width) => ({ width, getBoundingClientRect() { return { width: this.width }; } })) };
const groups = { getBoundingClientRect: () => ({ height }) };
const observed = [];
const table = {
  querySelector: (selector) => selector === ".mwb-sub-head" ? headers : groups,
  style: {
    getPropertyValue: (name) => properties.get(name),
    setProperty: (name, value) => { writes++; properties.set(name, value); },
  },
};
vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), {
  window: {
    document: { readyState: "complete", querySelector: () => table },
    ResizeObserver: class { constructor(callback) { observerCallback = callback; } observe(element) { observed.push(element); } },
    requestAnimationFrame: (callback) => scheduled.push(callback),
    addEventListener: (event, callback) => { assert.equal(event, "resize"); resizeCallback = callback; },
  },
});
assert.equal(observed.length, 23, "observe each column plus table and group header");
assert.equal(properties.get("--mwb-group-height"), "36px");
assert.equal(writes, 5);
observerCallback(); observerCallback();
assert.equal(scheduled.length, 1, "batch resize events into one frame");
scheduled.shift()();
assert.equal(writes, 5, "avoid redundant style writes / observer loops");
headers.cells[1].width = 201.25;
headers.cells[20].width = 180.5;
height = 48;
resizeCallback(); scheduled.shift()();
assert.equal(properties.get("--mwb-left-name"), "237.25px");
assert.equal(properties.get("--mwb-right-action"), "372.5px");
assert.equal(properties.get("--mwb-group-height"), "48px");

const view = fs.readFileSync(path.join(root, "views/ppic/mps-workbench.ejs"), "utf8");
const group = view.match(/<tr class="mwb-group-head">(.*?)<\/tr>/s)[1];
const columns = [...group.matchAll(/<th\b([^>]*)>/g)].reduce((total, match) => total + Number(match[1].match(/colspan="(\d+)"/)?.[1] || 1), 0);
assert.equal(columns, 21, "group spans must match all 21 detail columns");
assert.match(view, /colspan="2" class="mwb-group-identity"/);
assert.match(view, /ppic-mps-table-layout\.css\?v=/);
assert.match(view, /ppic-mps-table-layout\.js\?v=/);
console.log("MPS table layout: offsets, zoom, resize observer, header height and 21-column spans passed.");
