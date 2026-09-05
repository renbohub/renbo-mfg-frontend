"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const script = fs.readFileSync(path.join(__dirname, "../public/js/ppic-mps-workbench.js"), "utf8");

assert(script.includes("data = enforceFgFinishCap(data)"));
assert(script.includes("number(phase.plannedProductionQty ?? phase.qty)"));
assert(!script.includes("number(phase.plannedProductionQty || phase.qty)"));
assert(script.includes("stock FG dipakai ${num(phase.stockUsedQty)}"));

console.log("MPS phase stock netting UI PASS");
