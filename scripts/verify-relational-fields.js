const { getEntity, getGroups } = require("../src/masterDataRegistry");
const { getLookupSource } = require("../src/lookupRegistry");
const fs = require("fs");
const path = require("path");

const expected = {
  "price-list": {
    partCode: ["part-codes", "partCode"],
    materialCode: ["material-codes", "materialCode"],
    supplierCode: ["supplier-codes", "supplierCode"]
  },
  "scrap-price-masters": { partCode: ["part-codes", "partCode"] },
  machines: { warehouseCode: ["warehouse-codes", "warehouseCode"] },
  dies: {
    customerCode: ["customer-codes", "customerCode"],
    warehouseCode: ["warehouse-codes", "warehouseCode"]
  },
  "dies-maintenance": { vendorCode: ["vendor-codes", "vendorCode"] },
  "dies-usage": { machineCode: ["machine-codes", "machineCode"] },
  employees: { divisionIds: ["divisions", "id", true] }
};

const failures = [];
let checks = 0;

Object.entries(expected).forEach(([slug, fields]) => {
  const entity = getEntity(slug);
  if (!entity) { failures.push(`${slug}: entity tidak ditemukan`); return; }
  Object.entries(fields).forEach(([name, [source, valueKey, multiple]]) => {
    checks += 1;
    const field = entity.fields.find((candidate) => candidate.name === name);
    if (!field) failures.push(`${slug}.${name}: field tidak ditemukan`);
    else if (field.type !== "lookup") failures.push(`${slug}.${name}: masih ${field.type}, harus lookup`);
    else if (field.lookup?.entity !== source || field.lookup?.valueKey !== valueKey) failures.push(`${slug}.${name}: lookup harus ${source}.${valueKey}`);
    else if (Boolean(field.multiple) !== Boolean(multiple)) failures.push(`${slug}.${name}: multiple harus ${Boolean(multiple)}`);
  });
});

const identityAndExternalText = {
  machines: ["machineCode", "serialNumber"],
  dies: ["diesCode", "diesNumber"],
  "dies-maintenance": ["maintenanceNumber"],
  "dies-usage": ["referenceNumber"]
};
Object.entries(identityAndExternalText).forEach(([slug, names]) => names.forEach((name) => {
  checks += 1;
  const field = getEntity(slug)?.fields.find((candidate) => candidate.name === name);
  if (!field || field.type !== "text") failures.push(`${slug}.${name}: identity/referensi eksternal harus tetap text`);
}));

checks += 1;
const entityForm = fs.readFileSync(path.join(__dirname, "..", "views", "master-data", "entity-form.ejs"), "utf8");
if (!/item\.readOnly[\s\S]*readonly/.test(entityForm)) failures.push("entity-form: field turunan readOnly belum dirender readonly");

const usedLookupSources = [...new Set(getGroups().flatMap((group) => group.items).flatMap((item) =>
  (getEntity(item.slug)?.fields || []).filter((field) => field.type === "lookup").map((field) => field.lookup.entity)))];
usedLookupSources.forEach((source) => {
  checks += 1;
  if (!getLookupSource(source)) failures.push(`lookup registry: source ${source} dipakai Master Data tetapi belum di-allowlist`);
});

getGroups().flatMap((group) => group.items).forEach((item) => {
  (getEntity(item.slug)?.fields || []).filter((field) => field.type === "lookup").forEach((field) => {
    checks += 1;
    const lookupSource = getLookupSource(field.lookup.entity);
    if (lookupSource && lookupSource.valueKey !== field.lookup.valueKey) {
      failures.push(`${item.slug}.${field.name}: gateway mengirim ${lookupSource.valueKey}, tetapi payload membutuhkan ${field.lookup.valueKey}`);
    }
  });
});

[
  "work-center-form.ejs",
  "work-center-detail.ejs",
  "working-hour-profile-form.ejs",
  "working-hour-profile-detail.ejs"
].forEach((file) => {
  checks += 1;
  const source = fs.readFileSync(path.join(__dirname, "..", "views", "master-data", file), "utf8");
  if (!/partials\/document-shell/.test(source)) failures.push(`${file}: special master belum memakai document shell`);
});

const salesFormScript = fs.readFileSync(path.join(__dirname, "..", "public", "js", "sales-form.js"), "utf8");
[
  ["customer-codes", "customerCode"],
  ["part-codes", "partCode"],
  ["uom", "uomCode"]
].forEach(([source, valueKey]) => {
  checks += 1;
  if (!new RegExp(`data-enterprise-lookup=[\"']${source}[\"'][\\s\\S]{0,220}data-value-key=[\"']${valueKey}[\"']`).test(salesFormScript)) {
    failures.push(`sales-form: lookup ${source}.${valueKey} belum strict`);
  }
});
checks += 1;
if (!/EnterpriseLookup\??\.scan\(tr\)/.test(salesFormScript)) failures.push("sales-form: row dinamis belum discan EnterpriseLookup");

const bomEditorView = fs.readFileSync(path.join(__dirname, "..", "views", "bom", "editor.ejs"), "utf8");
[
  ["bom-root-part", "parts", "id"],
  ["bom-root-uom", "uom", "uomCode"],
  ["node-part", "parts", "id"],
  ["node-uom", "uom", "uomCode"],
  ["quick-customer-code", "customer-codes", "customerCode"],
  ["quick-material-id", "materials", "id"]
].forEach(([id, source, valueKey]) => {
  checks += 1;
  const tag = new RegExp(`<select[^>]*id=[\"']${id}[\"'][^>]*>`).exec(bomEditorView)?.[0] || "";
  if (!tag.includes(`data-enterprise-lookup=\"${source}\"`) || !tag.includes(`data-value-key=\"${valueKey}\"`)) failures.push(`bom-editor.${id}: lookup ${source}.${valueKey} belum strict`);
});

const bomTableScript = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bom-table-editor.js"), "utf8");
[
  ["parts", "id"],
  ["uom", "uomCode"],
  ["processes", "id"]
].forEach(([source, valueKey]) => {
  checks += 1;
  if (!new RegExp(`data-enterprise-lookup=[\"']${source}[\"'][\\s\\S]{0,220}data-value-key=[\"']${valueKey}[\"']`).test(bomTableScript)) failures.push(`bom-table-editor: lookup ${source}.${valueKey} belum strict`);
});
checks += 1;
if (!/EnterpriseLookup\??\.scan\(rowsTarget\)/.test(bomTableScript)) failures.push("bom-table-editor: rows dinamis belum discan EnterpriseLookup");

if (failures.length) {
  console.error(`Relational field audit failed (${failures.length}/${checks}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Relational field audit passed: ${checks}/${checks}`);
