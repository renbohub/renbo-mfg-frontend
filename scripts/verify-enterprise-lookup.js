const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const failures = [];
let contracts = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function requireText(relativePath, pattern, label) {
  contracts += 1;
  if (!pattern.test(read(relativePath))) failures.push(`${relativePath}: ${label}`);
}

function requireOrdered(relativePath, needles) {
  const source = read(relativePath);
  let cursor = -1;
  needles.forEach((needle) => {
    contracts += 1;
    const index = source.indexOf(needle);
    if (index < 0) failures.push(`${relativePath}: asset ${needle} belum dimuat`);
    else if (index <= cursor) failures.push(`${relativePath}: asset ${needle} berada pada urutan yang salah`);
    cursor = Math.max(cursor, index);
  });
}

function assertEqual(actual, expected, label) {
  contracts += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

async function verifyLookupGateway() {
  const registryPath = path.join(ROOT, "src/lookupRegistry.js");
  const routePath = path.join(ROOT, "src/routes/lookups.js");
  contracts += 2;
  if (!fs.existsSync(registryPath)) failures.push("src/lookupRegistry.js: allowlist lookup belum tersedia");
  if (!fs.existsSync(routePath)) failures.push("src/routes/lookups.js: gateway lookup belum tersedia");
  if (!fs.existsSync(registryPath) || !fs.existsSync(routePath)) return;

  const { getLookupSource, listLookupSources } = require(registryPath);
  const { normalizeLookupPayload, createLookupHandler } = require(routePath);
  const requiredSources = ["customers", "suppliers", "vendors", "parts", "products", "materials", "uom", "currencies", "payment-terms", "warehouses", "racks", "lots", "employees", "divisions", "machines", "work-centers", "processes", "sub-processes", "dies", "working-hour-profiles", "sales-orders", "purchase-orders", "manufacturing-orders", "work-orders"];
  requiredSources.forEach((source) => {
    contracts += 1;
    if (!getLookupSource(source)) failures.push(`lookup source ${source} belum di-allowlist`);
  });
  assertEqual(requiredSources.every((source) => listLookupSources().includes(source)), true, "lookup registry wajib memuat source inti");
  assertEqual(
    [getLookupSource("suppliers").queryMap.q, getLookupSource("suppliers").queryMap.pageSize],
    ["q", "limit"],
    "lookup supplier meneruskan parameter pencarian dan pagination yang dibaca backend",
  );

  const normalized = normalizeLookupPayload({ data: [{ id: "P1", partCode: "C001", partName: "Bracket", status: "Active", purchaseUomCode: "PCS" }], total: 3 }, getLookupSource("parts"), 1, 1);
  assertEqual(normalized, {
    results: [{ id: "P1", text: "C001 · Bracket", code: "C001", name: "Bracket", meta: "", active: true, data: { purchaseUomCode: "PCS", partCode: "C001", partName: "Bracket" } }],
    pagination: { more: true }
  }, "gateway menormalisasi envelope dan pagination");

  const calls = [];
  const handler = createLookupHandler({
    backendUrl: "http://backend.test",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [], total: 0 }) };
    }
  });
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { source: "racks" }, query: { q: "QC", page: "2", pageSize: "25", warehouseCode: "WH-001", endpoint: "/forbidden" }, get: (name) => name === "authorization" ? "Bearer test" : undefined }, response);
  assertEqual(response.statusCode, 400, "gateway menolak query parameter yang tidak diizinkan");

  const okResponse = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { source: "racks" }, query: { q: "QC", page: "2", pageSize: "25", warehouseCode: "WH-001" }, get: (name) => name === "authorization" ? "Bearer test" : undefined }, okResponse);
  contracts += 3;
  if (okResponse.statusCode !== 200) failures.push("gateway gagal meneruskan query valid");
  if (!calls[0]?.url.includes("warehouseCode=WH-001")) failures.push("gateway tidak meneruskan parent filter yang diizinkan");
  if (calls[0]?.options?.headers?.authorization !== "Bearer test") failures.push("gateway tidak meneruskan authorization header");

  for (const source of ["vendors", "customers", "parts"]) {
    await handler({ params: { source }, query: { q: "bintang", page: "2", pageSize: "25" }, get() {} }, okResponse);
    const url = new URL(calls.at(-1).url);
    assertEqual([url.searchParams.get("q"), url.searchParams.get("limit"), url.searchParams.get("page")], ["bintang", "25", "2"], `${source} uses backend search/pagination contract`);
  }

  const missingResponse = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { source: "not-registered" }, query: {}, get() {} }, missingResponse);
  assertEqual(missingResponse.statusCode, 404, "gateway menolak source yang tidak dikenal");

  const upstreamHandler = createLookupHandler({ backendUrl: "http://backend.test", fetchImpl: async () => ({ ok: false, status: 422, text: async () => JSON.stringify({ code: "INVALID_PARENT", message: "Parent tidak valid" }) }) });
  const upstreamResponse = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await upstreamHandler({ params: { source: "racks" }, query: {}, get() {} }, upstreamResponse);
  assertEqual([upstreamResponse.statusCode, upstreamResponse.body.code], [422, "INVALID_PARENT"], "gateway mempertahankan error upstream");

  const timeoutHandler = createLookupHandler({ backendUrl: "http://backend.test", fetchImpl: async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; } });
  const timeoutResponse = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await timeoutHandler({ params: { source: "parts" }, query: {}, get() {} }, timeoutResponse);
  assertEqual([timeoutResponse.statusCode, timeoutResponse.body.code], [504, "LOOKUP_TIMEOUT"], "gateway membedakan timeout");
}

function verifyLookupModel() {
  const model = require(path.join(ROOT, "public/js/enterprise-lookup-model.js"));
  contracts += 8;
  if (typeof model.normalizeResponse !== "function") failures.push("lookup model belum mengekspor normalizeResponse");
  if (typeof model.composeLabel !== "function") failures.push("lookup model belum mengekspor composeLabel");
  if (typeof model.currentOption !== "function") failures.push("lookup model belum mengekspor currentOption");
  if (typeof model.normalizeQuery !== "function") failures.push("lookup model belum mengekspor normalizeQuery");
  if (typeof model.isDependencyReady !== "function") failures.push("lookup model belum mengekspor isDependencyReady");
  if (typeof model.isResolvedValue !== "function") failures.push("lookup model belum mengekspor isResolvedValue");
  if (typeof model.closestDialog !== "function") failures.push("lookup model belum mengekspor closestDialog");
  if (typeof model.dropdownHost !== "function") failures.push("lookup model belum mengekspor dropdownHost");
  if (failures.some((failure) => failure.startsWith("lookup model"))) return;

  assertEqual(model.normalizeResponse({ results: [{ id: 8, code: "P-008", name: "Bracket", meta: "PCS", active: true }], pagination: { more: 1 } }), {
    results: [{ id: "8", text: "P-008 · Bracket", code: "P-008", name: "Bracket", meta: "PCS", active: true }],
    pagination: { more: true }
  }, "lookup model menormalisasi response gateway");
  assertEqual(model.composeLabel({ code: "P-008", name: "Bracket", meta: "PCS", active: false }, { includeMeta: true }), "P-008 · Bracket · PCS · Tidak aktif", "label current inactive tetap informatif");
  assertEqual(model.currentOption({ currentId: "8", currentText: "P-008 · Bracket", currentActive: "false" }), { id: "8", text: "P-008 · Bracket · Tidak aktif", active: false, current: true }, "edit preload mempertahankan current inactive");
  assertEqual([model.normalizeQuery("  bracket  "), model.normalizeQuery("   ")], ["bracket", ""], "query lookup dinormalisasi");
  assertEqual([model.isDependencyReady("WH-01"), model.isDependencyReady(""), model.isDependencyReady(null)], [true, false, false], "dependency readiness eksplisit");
  assertEqual([model.isResolvedValue("P1", ["", "P1"]), model.isResolvedValue("P2", ["P1"])], [true, false], "strict value harus didukung option");
  const nativeDialog = { nodeName: "DIALOG" };
  const fieldWrapper = { nodeName: "DIV" };
  const selectInsideNativeDialog = { parentElement: fieldWrapper, closest: (selector) => selector.includes("dialog") ? nativeDialog : null };
  assertEqual(model.closestDialog(selectInsideNativeDialog), nativeDialog, "lookup di native dialog memakai dialog sebagai dropdown parent");
  assertEqual(model.dropdownHost(selectInsideNativeDialog), fieldWrapper, "lookup di native dialog memakai wrapper field untuk koordinat dropdown");
}

function verifyBrowserAdapterContracts() {
  requireText("public/js/enterprise-lookup.js", /tags:\s*false/, "Select2 tags harus dimatikan eksplisit");
  requireText("public/js/enterprise-lookup.js", /Authorization:\s*`Bearer \$\{token\}`/, "request Select2 lookup belum mengirim token autentikasi");
  requireText("public/js/enterprise-lookup.js", /minimumInputLength/, "minimum input length belum dikonfigurasi");
  requireText("public/js/enterprise-lookup.js", /dropdownParent/, "dropdown modal parent belum ditangani");
  requireText("public/js/enterprise-lookup.js", /enterprise-lookup:invalid/, "event invalid belum tersedia");
  requireText("public/js/enterprise-lookup.js", /enterprise-lookup:cleared/, "event cascade clear belum tersedia");
  requireText("public/js/enterprise-lookup.js", /MutationObserver/, "dynamic lookup scanner belum tersedia");
  requireText("public/js/enterprise-lookup.js", /window\.EnterpriseLookup|root\.EnterpriseLookup/, "public EnterpriseLookup API belum tersedia");
  requireText("public/js/enterprise-lookup.js", /getSelected/, "adapter belum mengekspor data record terpilih untuk autofill");
  requireText("public/js/entity-form.js", /EnterpriseLookup\??\.getSelected/, "form master belum memakai data pilihan AJAX untuk autofill");
}

requireText("server.js", /vendor\("\/vendor\/select2", "select2\/dist"\)/, "asset Select2 belum dilayani secara lokal");
requireText("views/partials/head.ejs", /\/vendor\/select2\/css\/select2\.min\.css/, "CSS Select2 lokal belum dimuat");
requireOrdered("views/partials/footer.ejs", [
  "/vendor/jquery/jquery.min.js",
  "/vendor/select2/js/select2.full.min.js",
  "/js/enterprise-lookup-model.js",
  "/js/enterprise-lookup.js",
  "/js/searchable-select.js"
]);
requireText("public/js/searchable-select.js", /:not\(\[data-enterprise-lookup\]\)/, "legacy searchable select belum mengecualikan enterprise lookup");
requireText("public/js/searchable-select.js", /classList\.contains\("select2-hidden-accessible"\)/, "guard Select2 yang sudah aktif belum tersedia");

(async () => {
  await verifyLookupGateway();
  verifyLookupModel();
  verifyBrowserAdapterContracts();
  if (failures.length) {
    console.error(`Enterprise lookup contract failed (${failures.length}/${contracts}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log(`Enterprise lookup contracts passed: ${contracts}/${contracts}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
