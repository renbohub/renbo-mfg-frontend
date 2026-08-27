"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const registry = read("src/masterDataRegistry.js");
const view = read("views/master-data/ai-model-profiles.ejs");
const script = read("public/js/ai-model-profiles.js");
const css = read("public/css/ai-model-profiles.css");
const head = read("views/partials/head.ejs");
const pkg = JSON.parse(read("package.json"));

assert.match(registry, /"ai-model-profiles"[\s\S]*customView:\s*"master-data\/ai-model-profiles"/);
assert.match(registry, /permission:\s*"aiModelProfiles"/);
assert.match(view, /AI Model Registry/);
assert.match(view, /id="ai-profile-table"/);
assert.match(view, /id="ai-profile-dialog"/);
assert.match(view, /id="ai-model-file"/);
assert.doesNotMatch(view, /type="(?:text|url)"[^>]*(?:path|model-file)/i, "Model path tidak boleh menjadi input bebas.");
assert.match(script, /\/ai\/api\/admin\/model-files/);
assert.match(script, /\/ai\/api\/admin\/model-profiles/);
assert.match(script, /data-model-action="test"/);
assert.match(script, /data-model-action="activate"/);
assert.match(script, /data-model-action="rollback"/);
assert.match(script, /\$\{type\}`/);
assert.match(script, /isSuperAdmin/);
assert.match(script, /profiles\.items/);
assert.match(script, /files\.items/);
assert.match(script, /ai-prompt-version"\)\.value\s*=\s*"ERP_ASSISTANT_V1"/);
assert.match(view, /id="ai-prompt-version"[^>]*value="ERP_ASSISTANT_V1"/);
assert.match(script, /DRAFT|TESTING|ACTIVE|INACTIVE|FAILED/);
assert.match(css, /ai-model-registry/);
assert.match(css, /@media\s*\(max-width:/);
assert.match(head, /ai-model-profiles\.css/);
assert.strictEqual(pkg.scripts["test:ai-model-profile-page"], "node scripts/verify-ai-model-profile-page.js");

console.log("AI model profile page contract: OK");
