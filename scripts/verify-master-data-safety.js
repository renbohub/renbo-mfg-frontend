const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { getRegistry, getEntity } = require("../src/masterDataRegistry");
const { getLookupSource } = require("../src/lookupRegistry");
const { safeUploadPath, safeDownloadName } = require("../src/routes/uploads");

const registry = getRegistry();
for (const [slug, config] of Object.entries(registry)) {
  for (const field of config.fields || []) {
    if (/(Id|Ids)$/.test(field.name) && !["taxId", "employeeId", "nationalId"].includes(field.name) && !field.formHidden) {
      assert.strictEqual(field.type, "lookup", `${slug}.${field.name} harus dropdown lookup`);
    }
    if (field.type === "lookup") {
      const source = getLookupSource(field.lookup.entity);
      assert(source, `${slug}.${field.name} memakai lookup yang tidak terdaftar`);
      assert.strictEqual(source.valueKey, field.lookup.valueKey, `${slug}.${field.name} value lookup tidak konsisten`);
      assert.notStrictEqual(field.lookup.labelKey, "id", `${slug}.${field.name} tidak boleh menampilkan internal ID`);
    }
  }
}

const part = getEntity("parts");
assert(part.fields.some((field) => field.name === "photos" && field.type === "file" && field.accept === "image/*"), "Master Part harus mempunyai upload photo");
assert(part.fields.some((field) => field.name === "files" && field.type === "file" && /dwg/.test(field.accept)), "Master Part harus mempunyai upload drawing");
assert(!part.fields.some((field) => ["partBases", "attachments"].includes(field.name) && !field.formHidden), "Master Part tidak boleh menampilkan editor array JSON mentah");
assert.strictEqual(getEntity("customers").fields.find((field) => field.name === "paymentTerms")?.type, "lookup", "Payment Terms customer harus dropdown");
assert.strictEqual(getEntity("vendor-price-lists").fields.find((field) => field.name === "details")?.type, "vendor-price-details", "Harga vendor harus memakai editor baris terstruktur");

const detailUi = fs.readFileSync(path.join(__dirname, "../public/js/entity-detail.js"), "utf8");
const formUi = fs.readFileSync(path.join(__dirname, "../public/js/entity-form.js"), "utf8");
const lookupRoute = fs.readFileSync(path.join(__dirname, "../src/routes/lookups.js"), "utf8");
const lookupModel = fs.readFileSync(path.join(__dirname, "../public/js/enterprise-lookup-model.js"), "utf8");
const pricingView = fs.readFileSync(path.join(__dirname, "../views/purchasing/pricing-report.ejs"), "utf8");
const pricingUi = fs.readFileSync(path.join(__dirname, "../public/js/purchasing-pricing-report.js"), "utf8");
const approvalRulesView = fs.readFileSync(path.join(__dirname, "../views/master-data/approval-rules.ejs"), "utf8");
const formulasView = fs.readFileSync(path.join(__dirname, "../views/master-data/formulas.ejs"), "utf8");
assert(detailUi.includes("!Array.isArray(value) || value.length > 0"), "Detail master harus menyembunyikan array kosong");
assert(formUi.includes("resolveLookupOption"), "Edit master harus resolve label lookup, bukan menampilkan UUID");
assert(formUi.includes("tasks.push(resolveLookupOption(field, input, value))"), "Prefill lookup master harus resolve label bisnis");
assert(!lookupRoute.includes('firstValue(record, config.codeKeys) || id'), "Lookup gateway tidak boleh memakai internal ID sebagai label");
assert(lookupModel.includes('isInternalId(id) ? "Referensi tersimpan" : id'), "Lookup awal harus menyembunyikan UUID internal");
assert(formUi.includes("vendor-price-details-editor"), "Editor harga vendor terstruktur belum aktif");
assert(detailUi.includes("master-file-preview") && detailUi.includes("download=1&name="), "Attachment Master Part harus mempunyai preview dan download");
assert(detailUi.includes("Drawing wajib, tetapi file belum diunggah") && detailUi.includes("emptyPartFile"), "Detail Master Part harus menampilkan status attachment kosong");
assert.strictEqual(safeUploadPath("/parts/attachments/file.png"), "/parts/attachments/file.png", "Path upload valid harus dapat diproxy");
assert.strictEqual(safeUploadPath("/parts/../secret.txt"), "", "Proxy upload harus menolak traversal path");
assert.strictEqual(safeDownloadName("drawing/part?.pdf", "file"), "drawing_part_.pdf", "Nama download harus disanitasi");
assert(["material", "purchase-part", "vendor-process"].every((type) => pricingView.includes(`data-pricing-type=\"${type}\"`)), "Pricing Report harus memisahkan tiga report");
assert(pricingView.includes("Pilih Grafik") && pricingUi.includes("data-graph-item"), "Tabel pricing harus menyediakan pemilih grafik per item");
assert(pricingUi.includes('type: "column"') && pricingUi.includes('name: "Rata-rata supplier", type: "line"'), "Grafik pricing harus memakai batang supplier dan garis rata-rata");
assert(/<select[^>]+id="rule-currency"[^>]+data-enterprise-lookup="currencies"/.test(approvalRulesView), "Currency Approval Rule harus memakai master dropdown");
assert(/<select[^>]+id="formula-module-input"/.test(formulasView), "Module Master Formula harus memakai dropdown");
console.log("Master data safety contracts passed.");
