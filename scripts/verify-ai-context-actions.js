"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const action = read("public/js/ai-context-actions.js");
for (const file of ["views/modules/report.ejs", "views/operations/dashboard.ejs", "views/production/execution-matrix.ejs"]) assert.match(read(file), /data-ai-capability/);
assert.match(action, /allowedCapabilities/); assert.match(action, /ERP_AI_ASSISTANT\.open/); assert.doesNotMatch(action, /innerHTML|outerHTML/);
console.log("AI contextual actions: OK");
