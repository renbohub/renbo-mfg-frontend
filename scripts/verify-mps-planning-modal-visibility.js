const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "public/css/ppic-mps-workbench.css"), "utf8");
const view = fs.readFileSync(path.join(root, "views/ppic/mps-workbench.ejs"), "utf8");

assert.match(
  view,
  /id="mwb-planning-modal"[\s\S]*?class="mwb-modal-panel mwb-planning-panel"/,
  "baseline/delta preview must use the dedicated planning panel",
);

assert.match(
  css,
  /#mwb-planning-modal\[aria-hidden="false"\]\{[^}]*display:grid[^}]*place-items:center[^}]*overflow:auto[^}]*\}/,
  "open planning modal must remain centered and scrollable inside the viewport",
);

assert.match(
  css,
  /\.mwb-planning-panel\{[^}]*display:flex[^}]*flex-direction:column[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow:hidden[^}]*\}/,
  "planning panel must be constrained to the viewport",
);

assert.match(
  css,
  /\.mwb-planning-panel \.mwb-modal-content\{[^}]*min-height:0[^}]*overflow:auto[^}]*\}/,
  "long baseline rows must scroll in the modal body",
);

assert.match(
  css,
  /\.mwb-planning-panel>header,\.mwb-planning-panel>footer\{[^}]*flex:0 0 auto[^}]*\}/,
  "planning actions must remain visible while the preview body scrolls",
);

console.log("PASS verify-mps-planning-modal-visibility: preview stays inside viewport");
