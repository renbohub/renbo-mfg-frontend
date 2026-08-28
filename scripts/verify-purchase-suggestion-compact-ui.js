const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const baseJs = fs.readFileSync(path.join(root, "public/js/operations-detail.js"), "utf8");
const compactJs = fs.readFileSync(path.join(root, "public/js/purchase-suggestion-compact-ui.js"), "utf8");
const css = [
  fs.readFileSync(path.join(root, "public/css/purchase-suggestion-workbench.css"), "utf8"),
  fs.readFileSync(path.join(root, "public/css/purchase-suggestion-compact-ui.css"), "utf8"),
].join("\n");

const checks = [
  [compactJs.includes("ps-compact-table"), "main table uses compact purchase-suggestion contract"],
  [compactJs.includes("Purchase Max"), "main table exposes latest purchase date"],
  [compactJs.includes("Current Stock"), "main table exposes current stock"],
  [compactJs.includes("data-ps-kind=\"material\""), "material rows expose their automatic type"],
  [compactJs.includes("data-ps-kind=\"purchase-part\""), "purchase-part rows expose their automatic type"],
  [compactJs.includes("Wait Confirm"), "pending rows use the short Wait Confirm status"],
  [compactJs.includes('"Coverage"') && compactJs.includes('"covered"'), "Covered by MOQ rows use the Coverage status instead of Wait Confirm"],
  [compactJs.includes("ps-supplier-name"), "supplier column renders a single supplier name"],
  [!compactJs.includes("ps-readiness-hint"), "readiness explanation is omitted from compact rows"],
  [baseJs.includes("data-due-calculation") && compactJs.includes("ps-due-primary"), "purchase-max formula help remains available"],
  [baseJs.includes("function suggestionEditor") && !compactJs.includes("compactConfirmationModal"), "original confirmation popup remains untouched"],
  [css.includes(".ps-compact-table"), "compact table styling exists"],
  [css.includes("color: #334155 !important"), "compact table header has an explicit high-contrast text color"],
  [css.includes(".ps-simple-status"), "short status styling exists"],
  [css.includes(".ps-simple-status.covered"), "coverage status styling exists"],
  [css.includes(".ps-supplier-name"), "supplier-name-only styling exists"],
];

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  console.error(`Purchase Suggestion compact UI contract failed (${failed.length}/${checks.length}):`);
  failed.forEach((label) => console.error(`- ${label}`));
  process.exit(1);
}

console.log(`Purchase Suggestion compact UI contract passed: ${checks.length}/${checks.length}`);
