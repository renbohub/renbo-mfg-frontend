"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
const view = fs.readFileSync(path.join(__dirname, "../views/ppic/capacity.ejs"), "utf8");
assert.match(view, /AI Capacity Analysis/); assert.match(view, /ppic\.get_capacity_risk/);
const ai = fs.readFileSync(path.join(__dirname, "../public/js/ai-context-actions.js"), "utf8");
assert.doesNotMatch(ai, /capacity-adopt-simulation|capacity-override|capacity-sync-dpp/);
console.log("AI capacity actions: OK");
