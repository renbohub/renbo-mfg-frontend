"use strict";

const assert = require("assert");
const fs = require("fs");
const {
  normalizeRequestState,
  nextPollDelay,
  renderSourceLabel,
  safeSourceHref,
} = require("../public/js/ai-assistant-model");

assert.strictEqual(normalizeRequestState({ status: "RUNNING" }).busy, true);
assert.strictEqual(normalizeRequestState({ status: "COMPLETED" }).terminal, true);
assert.strictEqual(normalizeRequestState({ status: "FAILED" }).terminal, true);
assert.strictEqual(nextPollDelay(0), 700);
assert.strictEqual(nextPollDelay(4), 1400);
assert.strictEqual(nextPollDelay(8), 2500);
assert.strictEqual(renderSourceLabel({ entityType: "MRP", entityId: "MRP-1" }), "MRP · MRP-1");
assert.strictEqual(safeSourceHref("/modules/planning-ppic/mrp/MRP-1"), "/modules/planning-ppic/mrp/MRP-1");
assert.strictEqual(safeSourceHref("https://evil.example/steal"), "#");
assert.strictEqual(safeSourceHref("javascript:alert(1)"), "#");

const head = fs.readFileSync("views/partials/head.ejs", "utf8");
const footer = fs.readFileSync("views/partials/footer.ejs", "utf8");
const nav = fs.readFileSync("views/partials/context-navbar-actions.ejs", "utf8");
const proxy = fs.readFileSync("src/routes/ai.js", "utf8");
const assistant = fs.readFileSync("public/js/ai-assistant.js", "utf8");
assert.match(head, /ai-assistant\.css/);
assert.match(footer, /include\('ai-assistant'\)/);
assert.match(footer, /ai-assistant\.js/);
assert.match(nav, /data-ai-assistant-open/);
assert.match(proxy, /\/api\/ai\/conversations/);
assert.doesNotMatch(proxy, /req\.params\.endpoint/);
assert.match(assistant, /__ERP_AI_ASSISTANT_INITIALIZED__/);
assert.match(assistant, /conversationPromise/);
assert.match(assistant, /conversation\.title\s*===\s*contextText\(state\.context\)/);

console.log("AI assistant UI contract passed.");
