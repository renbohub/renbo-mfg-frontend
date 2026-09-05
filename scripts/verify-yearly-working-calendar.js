"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const registry = read("src/masterDataRegistry.js");
const view = read("views/master-data/yearly-working-calendar.ejs");
const script = read("public/js/yearly-working-calendar.js");
const css = read("public/css/yearly-working-calendar.css");

assert.match(registry, /"yearly-working-calendars"/);
assert.match(registry, /master-data\/yearly-working-calendar/);
assert.match(view, /Kalender Kerja Tahunan/);
assert.match(view, /Shift Ramadan/);
assert.match(view, /Working Day[\s\S]*Working Hours[\s\S]*Shift Master/);
assert.match(view, /Cakupan mesin/);
assert.match(script, /working-hour-profiles/);
assert.match(script, /syncProfileConnection/);
assert.match(script, /rule\.shift\?\.shiftCode/);
assert.match(script, /overwriteExisting/);
assert.match(script, /method: state\.editingId \? "PATCH" : "POST"/);
assert.match(css, /\.ywc-months/);

console.log("Yearly working calendar UI contract: OK");
