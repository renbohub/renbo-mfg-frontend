const fs = require("fs");
const path = require("path");
const { getEntity } = require("../src/masterDataRegistry");

function verify(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const config = getEntity("vendor-processes");
const formTemplate = fs.readFileSync(path.join(__dirname, "..", "views/master-data/entity-form.ejs"), "utf8");
const detailScript = fs.readFileSync(path.join(__dirname, "..", "public/js/entity-detail.js"), "utf8");
const processCode = config.fields.find((field) => field.name === "vendorProcessCode");
const vendors = config.fields.find((field) => field.name === "vendorIds");

verify("master terdaftar sebagai Kode Proses Vendor", config.label === "Kode Proses Vendor");
verify("kode dipilih dari Master Data Proses", processCode?.lookup?.entity === "process-codes" && processCode.lookup.valueKey === "processCode");
verify("vendor pelaksana mendukung multi assignment", vendors?.lookup?.entity === "vendors" && vendors.multiple === true);
verify("list menampilkan vendor dan penggunaan price list", config.columns.some((column) => column.data === "vendorCount") && config.columns.some((column) => column.data === "priceListCount"));
verify("field turunan tidak ikut form edit", formTemplate.includes("!item.formHidden"));
verify("field khusus form tidak mengotori detail", detailScript.includes("!field.detailHidden"));

console.log("Vendor process master UI contract verified.");
