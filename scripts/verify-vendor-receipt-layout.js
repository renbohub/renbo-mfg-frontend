const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

async function renderVendorReceipt() {
  const incomingPage = {
    slug: "incoming-from-vendor",
    label: "Incoming from Vendor",
    apiReady: true,
  };
  const incomingModule = {
    slug: "incoming",
    label: "Incoming",
    shortLabel: "Incoming",
    description: "Incoming operations",
    color: "blue",
    icon: "incoming",
    pages: [incomingPage],
  };

  return ejs.renderFile(
    path.join(__dirname, "..", "views", "incoming", "vendor-receipt.ejs"),
    {
      title: "Terima VPO",
      module: incomingModule,
      modules: [incomingModule],
      page: incomingPage,
      recordKey: "VPO-TEST-001",
      activeModule: "incoming",
      requiresAuth: false,
      pageScript: null,
      socketUrl: "",
      mqttUrl: "",
    },
  );
}

async function main() {
  const html = await renderVendorReceipt();
  const operationsCss = fs.readFileSync(path.join(__dirname, "..", "public", "css", "operations.css"), "utf8");
  const receiptScript = fs.readFileSync(path.join(__dirname, "..", "public", "js", "vendor-receipt.js"), "utf8");
  const commandHeaderStart = html.indexOf('class="vendor-receipt-command-header"');
  const commandHeaderEnd = html.indexOf("</header>", commandHeaderStart);
  const formIndex = html.indexOf('id="vendor-receipt-form"');
  const receiptTableIndex = html.indexOf('aria-label="Worksheet item penerimaan vendor"');
  const receiptWorkspaceIndex = html.indexOf('class="vendor-receipt-line-card vendor-receipt-data-workspace"');
  const itemsTabIndex = html.indexOf('data-vendor-receipt-view="items"');
  const postingTabIndex = html.indexOf('data-vendor-receipt-view="posting"');
  const auditTabIndex = html.indexOf('data-vendor-receipt-view="audit"');
  const postingPanelIndex = html.indexOf('data-vendor-receipt-panel="posting"');
  const auditPanelIndex = html.indexOf('data-vendor-receipt-panel="audit"');
  const receiptNotesIndex = html.indexOf('id="receiptNotes"');
  const inlineCommentFormIndex = html.indexOf('data-context-inline-comment-form');
  const inlineCommentListIndex = html.indexOf('data-context-inline-comment-list');
  const commandHeader = html.slice(commandHeaderStart, commandHeaderEnd);

  assert.notEqual(commandHeaderStart, -1, "vendor receipt command header must be rendered");
  assert.equal(html.indexOf('data-document-shell'), -1, "vendor receipt must keep its bespoke transaction header");
  assert.doesNotMatch(html, /partials\/document-(?:metadata|lines|notes)/, "vendor receipt must not be coupled to generic document partial markers");
  assert.notEqual(formIndex, -1, "goods receipt form must be rendered");
  assert.notEqual(receiptTableIndex, -1, "receipt worksheet must be rendered");
  assert.ok(
    formIndex > commandHeaderStart && formIndex < commandHeaderEnd,
    "goods receipt form must render inside the flat document header",
  );
  assert.match(
    commandHeader,
    /class="vendor-receipt-command-meta"[\s\S]*id="vendor-receipt-submit"[\s\S]*form="vendor-receipt-form"[\s\S]*Kembali ke daftar/,
    "submit action must sit beside the back-to-list action and target the header form",
  );
  assert.match(
    commandHeader,
    /class="vendor-receipt-unified-grid"[\s\S]*id="receivedAt"[\s\S]*id="deliveryNoteNumber"[\s\S]*id="warehouseCode"[\s\S]*id="rackCode"[\s\S]*id="lotNumber"/,
    "header metadata and editable receipt fields must share one unified grid",
  );
  assert.ok(!commandHeader.includes('id="receiptNotes"'), "receipt notes must not remain in the header");
  assert.ok(receiptNotesIndex > receiptTableIndex, "receipt notes must render below the item worksheet");
  assert.match(
    html.slice(receiptTableIndex, receiptNotesIndex + 250),
    /id="receiptNotes"[\s\S]*form="vendor-receipt-form"/,
    "receipt notes below the worksheet must remain associated with the receipt form",
  );
  assert.ok(!html.includes("vendor-receipt-header-workspace"), "header must not use separate left and right workspaces");
  assert.ok(!html.includes("vendor-receipt-upper-workspace"), "detached upper workspace must be removed");
  assert.notEqual(receiptWorkspaceIndex, -1, "receipt data workspace must be rendered");
  assert.ok(itemsTabIndex < postingTabIndex && postingTabIndex < auditTabIndex, "receipt, posting, and audit tabs must render in operational order");
  assert.ok(postingPanelIndex > receiptTableIndex && auditPanelIndex > postingPanelIndex, "inventory posting and audit must be separate panels in the table workspace");
  assert.match(html, /data-vendor-receipt-panel="posting"[^>]*hidden[\s\S]*data-vendor-receipt-panel="audit"[^>]*hidden/, "secondary panels must be hidden until selected");
  assert.match(html, /\/vendor\/tabulator\/js\/tabulator\.min\.js/, "vendor receipt must load local Tabulator assets");
  assert.ok(inlineCommentFormIndex > receiptNotesIndex, "inline comment form must render below receipt notes");
  assert.ok(inlineCommentListIndex > inlineCommentFormIndex, "inline page comments must render beside the receipt interaction area");
  assert.match(
    operationsCss,
    /\.vendor-receipt-page\s+\.vendor-receipt-command-header\s+\.vendor-receipt-form\s*\{[^}]*background:\s*transparent\s*;/,
    "vendor receipt header form must remain transparent",
  );

  assert.match(receiptScript, /new window\.Tabulator\("#vendor-receipt-table"/, "receipt worksheet must initialize Tabulator");
  assert.match(receiptScript, /field: "partCode"[\s\S]*frozen: true[\s\S]*field: "partNumber"[\s\S]*field: "receiptNow"[\s\S]*editor: "number"/, "Tabulator must keep identity frozen and receipt quantity editable");
  assert.match(receiptScript, /data-vendor-receipt-view[\s\S]*activateView/, "receipt workspace tabs must be interactive");
  assert.match(operationsCss, /Vendor Receipt · Tabulator worksheet with document tabs/, "Tabulator workspace must have scoped enterprise styling");

  console.log("Vendor receipt Tabulator worksheet, workspace tabs, and inline comments verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
