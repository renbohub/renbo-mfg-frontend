"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createEditorState, reduceEditorState, getQueueSummary, getUnallocatedNotice, getAuthoritativeCapacity, getChildPlanningSummary, getRemainingCandidates, getRemainingAllocationLimit, getPreviousStockRows, isSameAllocationRow, evaluateTargetAvailability, buildCutPasteChange, distributeRemainingQty, projectStagedMatrix, formatMaterialWarnings, hydrateStagedChanges, replaceStagedChange, validateVendorDates } = require("../public/js/ppic-monthly-capacity-editor");

assert.throws(() => validateVendorDates("2026-09-19", "2026-09-18"),
  /Tanggal kirim\/allocation 2026-09-19.*tanggal kembali 2026-09-18/i,
  "UI harus menjelaskan kedua tanggal vendor sebelum request dikirim");
assert.doesNotThrow(() => validateVendorDates("2026-09-19", "2026-09-19"));

assert.deepStrictEqual(hydrateStagedChanges([{
  id: "change-existing-draft",
  changeType: "ALLOCATE_REMAINING",
  afterValue: {
    type: "ALLOCATE_REMAINING",
    partCode: "C002-C004-020",
    targetDate: "2026-09-19",
    vendorReturnDate: "2026-09-21",
  },
}]), [{
  type: "ALLOCATE_REMAINING",
  partCode: "C002-C004-020",
  targetDate: "2026-09-19",
  vendorReturnDate: "2026-09-21",
  _changeId: "change-existing-draft",
}], "draft allocation dari session OPEN harus kembali muncul di dropdown setelah editor dibuka ulang");

assert.strictEqual(typeof formatMaterialWarnings, "function", "Save Changes harus mempunyai formatter material warning");
assert.match(formatMaterialWarnings([{
  code: "MATERIAL_SHORTAGE_WARNING",
  targetPartCode: "C002-C007-010",
  processCode: "SPOT",
  requestedQty: 80,
  inputAvailableQty: 0,
  shortageQty: 80,
  uomCode: "PCS",
}]), /SPOT[\s\S]*80 PCS[\s\S]*shortage 80 PCS/i,
"warning setelah Save harus menjelaskan proses, kebutuhan, dan shortage");

const initial = {
  planNumber: "MPP-202609-001",
  currentDate: "2026-09-06",
  rows: [{ id: "a1", qty: 100, date: "2026-09-06", machineId: "m1" }],
  queue: [],
};
let state = createEditorState(initial);
state = reduceEditorState(state, { type: "START", sessionId: "s1" });
state = reduceEditorState(state, { type: "QUEUE", item: { id: "q1", qty: 40, partCode: "PART-A", latestFinishDate: "2026-09-05" } });
assert.strictEqual(getQueueSummary(state).qty, 40);
assert.strictEqual(getQueueSummary(state).urgent, 1);
state = reduceEditorState(state, { type: "CANCEL" });
assert.deepStrictEqual(state.rows, initial.rows, "Cancel UI harus memulihkan snapshot awal");
assert.deepStrictEqual(state.queue, []);
assert.strictEqual(state.mode, "READONLY");

assert.deepStrictEqual(getUnallocatedNotice({ unallocatedCount: 5, unallocatedQty: 242, crossMonthCount: 2 }), {
  count: 5,
  message: "5 operasi · 242 qty belum menjadi allocation tersimpan (3 bulan ini). 2 operasi harus dimulai di bulan sebelumnya dan tetap terlihat di ringkasan lintas bulan. Jalankan Auto Allocation atau atur melalui Mode Editor.",
});
assert.strictEqual(getUnallocatedNotice({ unallocatedCount: 0, unallocatedQty: 0 }), null);
assert.deepStrictEqual(
  getAuthoritativeCapacity({ unallocatedMinutes: 5, overloadedCells: 1 }, { loadMinutes: 125, availableMinutes: 100 }),
  { loadMinutes: 120, availableMinutes: 100, utilizationPercent: 120, overloadedCells: 1 },
);
assert.strictEqual(typeof getChildPlanningSummary, "function", "UI harus mempunyai formatter ringkas untuk stock dan total kebutuhan child part");
assert.deepStrictEqual(getChildPlanningSummary({ planning: {
  currentStockQty: 50,
  stockCoverageQty: 104,
  wipCoverageQty: 40,
  fgCoverageQty: 14,
  stockCoverageSources: [
    { kind: "CURRENT", partCode: "PART-A", equivalentQty: 50 },
    { kind: "WIP", partCode: "WIP-WELD", equivalentQty: 40 },
    { kind: "FG", partCode: "FG-PARENT", equivalentQty: 14 },
  ],
  efdQty: 684,
  bufferQty: 224,
  shortageM1Qty: 10,
  totalRequirementQty: 918,
  uomCode: "PCS",
}, monthlyProductionQty: 100 }), {
  available: true,
  warehouseStock: "50",
  wipStock: "54",
  requirement: "918",
  production: "100",
  remaining: "714",
  uomCode: "PCS",
  warehouseStockBreakdown: "PART-A 50",
  wipStockBreakdown: "WIP-WELD 40 + FG-PARENT 14",
  requirementBreakdown: "EFD 684 + Buffer 224 + M-1 10",
});
assert.strictEqual(getChildPlanningSummary({ planning: {
  currentStockQty: 20,
  wipCoverageQty: 40,
  fgCoverageQty: 10,
  totalRequirementQty: 100,
  uomCode: "PCS",
}, monthlyProductionQty: 50 }).remaining, "0", "remain allocation tidak boleh negatif ketika stock dan produksi sudah menutup kebutuhan");
assert.deepStrictEqual(getChildPlanningSummary({}), { available: false }, "child tanpa sumber MPS tidak boleh menampilkan angka palsu");

const remainingCandidates = [
  { planNumber: "MPP-001", lineNumber: 1, mbomProcessId: "route-paint", partCode: "PART-A", processCode: "PAINT", routingMode: "VENDOR", remainingQty: 40 },
  { planNumber: "MPP-001", lineNumber: 2, mbomProcessId: "route-insp", partCode: "PART-A", processCode: "INSP-PACK-1", routingMode: "INHOUSE", remainingQty: 60 },
  { planNumber: "MPP-001", lineNumber: 3, mbomProcessId: "route-weld", partCode: "PART-B", processCode: "WELD-1", routingMode: "INHOUSE", remainingQty: 20 },
];
assert.deepStrictEqual(
  getRemainingCandidates(remainingCandidates, { type: "OUTSOURCE" }, { partCode: "PART-A", processCodes: ["PAINT"] }),
  [remainingCandidates[0]],
  "cell kosong vendor hanya boleh menawarkan remaining route vendor yang tepat",
);
assert.deepStrictEqual(
  getRemainingCandidates(remainingCandidates, { type: "INHOUSE" }, { partCode: "PART-A", processCodes: ["INSP-PACK-1"] }),
  [remainingCandidates[1]],
  "cell kosong in-house harus menawarkan remaining route in-house yang tepat",
);

const paintingPool = [
  { lineNumber: 39, remainingQty: 22, requiredDate: "2026-08-25", inputAvailableQty: 191 },
  { lineNumber: 56, remainingQty: 60, requiredDate: "2026-08-25", inputAvailableQty: 191 },
  { lineNumber: 40, remainingQty: 20, requiredDate: "2026-08-28", inputAvailableQty: 191 },
  { lineNumber: 41, remainingQty: 80, requiredDate: "2026-09-01", inputAvailableQty: 191 },
  { lineNumber: 122, remainingQty: 40, requiredDate: "2026-09-08", inputAvailableQty: 191 },
];
assert.deepStrictEqual(getRemainingAllocationLimit(paintingPool), {
  maxQty: 222,
  demandRemainingQty: 222,
  inputAvailableQty: 191,
}, "planning batch mengikuti remaining demand; stock level sebelumnya menjadi warning, bukan blocker");
assert.deepStrictEqual(distributeRemainingQty(paintingPool, 191), [
  { lineNumber: 39, qty: 22 },
  { lineNumber: 56, qty: 60 },
  { lineNumber: 40, qty: 20 },
  { lineNumber: 41, qty: 80 },
  { lineNumber: 122, qty: 9 },
], "UI harus mengirim pegging batch lintas delivery phase secara deterministik");

const inspectionPool = [{
  lineNumber: 43,
  remainingQty: 394,
  inputAvailableQty: 60,
  inputAvailabilityEvents: [
    { type: "CONSUMPTION", date: "2026-09-01", qty: 60 },
    { type: "SUPPLY", date: "2026-09-03", qty: 191 },
  ],
}];
assert.deepStrictEqual(getRemainingAllocationLimit(inspectionPool, { targetDate: "2026-09-02" }), {
  maxQty: 394,
  demandRemainingQty: 394,
  inputAvailableQty: 0,
}, "material belum tersedia tetap boleh direncanakan dan ditandai warning");
assert.deepStrictEqual(getRemainingAllocationLimit(inspectionPool, { targetDate: "2026-09-03" }), {
  maxQty: 394,
  demandRemainingQty: 394,
  inputAvailableQty: 191,
}, "receipt terjadwal memperbarui nilai warning tanpa membatasi planning demand");

const repeatedStockCandidate = {
  inputStockSources: [{
    partNumber: "11058-1290", partCode: "C002-C004-020", partName: "BRACKET COMP", itemType: "WIP",
    stockWhQty: 60, stockReservedQty: 5, availableQty: 55, qtyPerParent: 1, uomCode: "PCS",
  }],
  inputAvailabilityEvents: [
    { type: "CONSUMPTION", date: "2026-09-03", qty: 40, sourceId: "allocation-insp-1" },
    { type: "SUPPLY", partCode: "C002-C004-020", date: "2026-09-08", qty: 10, sourceId: "allocation-paint-1" },
    { type: "CONSUMPTION", date: "2026-09-09", qty: 5, sourceId: "allocation-insp-2" },
  ],
};
assert.deepStrictEqual(getPreviousStockRows([repeatedStockCandidate, repeatedStockCandidate], { targetDate: "2026-09-09" }), [{
  partNumber: "11058-1290",
  partCode: "C002-C004-020",
  partName: "BRACKET COMP",
  itemType: "WIP",
  sourceRole: "DIRECT_INPUT",
  stockWhQty: 60,
  stockReservedQty: 5,
  allocatedBeforeTargetQty: 45,
  scheduledSupplyQty: 10,
  availableAtTargetQty: 20,
  uomCode: "PCS",
}], "tabel sumber stock harus memasukkan allocation sebelum dan pada hari target tanpa menggandakan event lintas delivery phase");

const cutClipboardFixture = {
  rowKey: "WC:INSPECTION",
  childKey: "PART:C002-C004-010:INSP-PACK-2",
  sourceDate: "2026-09-07",
  qty: 31,
  partCode: "C002-C004-010",
  processCode: "INSP-PACK-2",
  allocation: {
    allocationId: "allocation-insp-2",
    qty: 31,
    uomCode: "PCS",
    scheduleDate: "2026-09-07",
    machineId: "machine-insp",
    partCode: "C002-C004-010",
    processCode: "INSP-PACK-2",
    routingMode: "INHOUSE",
  },
};
assert.strictEqual(isSameAllocationRow(cutClipboardFixture, "WC:INSPECTION", "PART:C002-C004-010:INSP-PACK-2"), true,
  "paste hanya boleh pada child row yang persis sama");
assert.strictEqual(isSameAllocationRow(cutClipboardFixture, "WC:INSPECTION", "PART:C002-C004-030:INSP-PACK-1"), false,
  "baris atas/bawah tidak boleh menerima paste");
assert.deepStrictEqual(evaluateTargetAvailability({
  inputAvailableQty: 0,
  inputStockSources: [{ partCode: "C002-C004-020", inputGroupKey: "C002-C004-020", availableQty: 40, qtyPerParent: 1, uomCode: "PCS" }],
  inputAvailabilityEvents: [
    { type: "CONSUMPTION", sourceId: "allocation-insp-2", date: "2026-09-07", qty: 31 },
    { type: "CONSUMPTION", sourceId: "allocation-other", date: "2026-09-08", qty: 5 },
  ],
}, 31, { targetDate: "2026-09-09", ignoreSourceIds: ["allocation-insp-2"] }), {
  known: true,
  sufficient: true,
  requestedQty: 31,
  availableQty: 35,
  targetDate: "2026-09-09",
  rows: [{
    partNumber: null, partCode: "C002-C004-020", partName: null, itemType: null, sourceRole: "DIRECT_INPUT",
    stockWhQty: 40, stockReservedQty: 0, allocatedBeforeTargetQty: 5, scheduledSupplyQty: 0,
    availableAtTargetQty: 35, uomCode: "PCS",
  }],
}, "availability paste harus mengeluarkan konsumsi allocation yang sedang di-cut");
assert.strictEqual(evaluateTargetAvailability({
  inputAvailableQty: 20,
  inputStockSources: [{ partCode: "INPUT", inputGroupKey: "INPUT", availableQty: 20, qtyPerParent: 1 }],
}, 31, { targetDate: "2026-09-09" }).sufficient, false,
"paste harus ditolak ketika Available di Target lebih kecil dari qty Cut");
assert.deepStrictEqual(buildCutPasteChange(cutClipboardFixture, "2026-09-09"), {
  type: "MOVE_ALLOCATION",
  allocationId: "allocation-insp-2",
  qty: 31,
  targetDate: "2026-09-09",
  targetMachineId: "machine-insp",
  vendorSendDate: null,
  vendorReturnDate: null,
  routingMode: "INHOUSE",
  partCode: "C002-C004-010",
  processCode: "INSP-PACK-2",
  targetRowKey: "WC:INSPECTION",
  targetChildKey: "PART:C002-C004-010:INSP-PACK-2",
  force: false,
  reason: "Cut & Paste manual 2026-09-07 ke 2026-09-09",
}, "Cut & Paste valid harus membentuk full move, bukan duplikasi qty");

const fgWithPreviousWip = {
  remainingQty: 100,
  inputAvailableQty: 83,
  inputStockGroups: [
    { requiredPartCode: "FG-A", inputGroupKey: "FG-A", availableOutputQty: 83 },
    { requiredPartCode: "FG-B", inputGroupKey: "FG-B", availableOutputQty: 84 },
  ],
  inputStockSources: [
    { partNumber: "FG-001", partCode: "FG-A", itemType: "FG", sourceRole: "DIRECT_INPUT", inputGroupKey: "FG-A", stockWhQty: 0, stockReservedQty: 0, availableQty: 0, qtyPerParent: 1, uomCode: "PCS" },
    { partNumber: "WIP-001", partCode: "WIP-A", itemType: "WIP", sourceRole: "PREVIOUS_WIP", inputGroupKey: "FG-A", stockWhQty: 83, stockReservedQty: 0, availableQty: 83, qtyPerParent: 1, uomCode: "PCS" },
    { partNumber: "FG-002", partCode: "FG-B", itemType: "FG", sourceRole: "DIRECT_INPUT", inputGroupKey: "FG-B", stockWhQty: 0, stockReservedQty: 0, availableQty: 0, qtyPerParent: 1, uomCode: "PCS" },
    { partNumber: "WIP-002", partCode: "WIP-B", itemType: "WIP", sourceRole: "PREVIOUS_WIP", inputGroupKey: "FG-B", stockWhQty: 84, stockReservedQty: 0, availableQty: 84, qtyPerParent: 1, uomCode: "PCS" },
  ],
  inputAvailabilityEvents: [
    { type: "CONSUMPTION", date: "2026-09-03", qty: 31, sourceId: "assembly-1" },
    { type: "SUPPLY", partCode: "WIP-B", date: "2026-09-04", qty: 100, sourceId: "wip-b-receipt" },
  ],
};
assert.deepStrictEqual(getRemainingAllocationLimit([fgWithPreviousWip], { targetDate: "2026-09-04" }), {
  maxQty: 100,
  demandRemainingQty: 100,
  inputAvailableQty: 52,
}, "netting tetap menghitung bottleneck untuk warning tanpa memblokir qty planning");
assert.deepStrictEqual(getPreviousStockRows([fgWithPreviousWip], { targetDate: "2026-09-04" }).map((row) => ({
  partCode: row.partCode, sourceRole: row.sourceRole, allocatedBeforeTargetQty: row.allocatedBeforeTargetQty, availableAtTargetQty: row.availableAtTargetQty,
})), [
  { partCode: "FG-A", sourceRole: "DIRECT_INPUT", allocatedBeforeTargetQty: 0, availableAtTargetQty: 0 },
  { partCode: "WIP-A", sourceRole: "PREVIOUS_WIP", allocatedBeforeTargetQty: 31, availableAtTargetQty: 52 },
  { partCode: "FG-B", sourceRole: "DIRECT_INPUT", allocatedBeforeTargetQty: 0, availableAtTargetQty: 0 },
  { partCode: "WIP-B", sourceRole: "PREVIOUS_WIP", allocatedBeforeTargetQty: 31, availableAtTargetQty: 153 },
], "tabel harus memperlihatkan WIP satu level di bawah FG dan membebankan consumption ke sumber yang benar");

const matrixFixture = [{
  key: "VENDOR:PAINT",
  type: "OUTSOURCE",
  days: { "2026-09-01": { qty: 0, minutes: 0, allocations: [], uomCodes: [] } },
  children: [{
    key: "PART:C002-C004-020:PAINT",
    partCode: "C002-C004-020",
    processCodes: ["PAINT"],
    monthlyProductionQty: 0,
    days: { "2026-09-01": { qty: 0, minutes: 0, allocations: [], uomCodes: [] } },
  }],
}];
const previewRows = projectStagedMatrix(matrixFixture, [{
  _changeId: "change-draft-1",
  type: "ALLOCATE_REMAINING",
  planNumber: "MPP-202608-001",
  lineNumber: 39,
  mbomProcessId: "route-paint",
  partCode: "C002-C004-020",
  processCode: "PAINT",
  routingMode: "VENDOR",
  qty: 191,
  targetDate: "2026-09-01",
  vendorReturnDate: "2026-09-03",
}]);
assert.strictEqual(previewRows[0].children[0].days["2026-09-01"].qty, 191,
  "allocation draft harus langsung muncul pada cell matrix tanpa menunggu Save Changes");
assert.strictEqual(previewRows[0].children[0].days["2026-09-01"].staged, true);
assert.strictEqual(previewRows[0].children[0].days["2026-09-01"].allocations[0].editable, true,
  "allocation yang masih draft editor harus tetap tersedia di dropdown");
assert.strictEqual(previewRows[0].children[0].days["2026-09-01"].allocations[0].stagedChangeId, "change-draft-1");
assert.strictEqual(previewRows[0].children[0].monthlyProductionQty, 191);
assert.strictEqual(matrixFixture[0].children[0].days["2026-09-01"].qty, 0,
  "preview tidak boleh memutasi snapshot resmi agar Cancel dapat memulihkan canvas");
assert.deepStrictEqual(replaceStagedChange([
  { _changeId: "change-draft-1", type: "ALLOCATE_REMAINING", targetDate: "2026-09-01" },
  { _changeId: "change-draft-2", type: "MOVE_ALLOCATION", targetDate: "2026-09-02" },
], "change-draft-1", { type: "ALLOCATE_REMAINING", targetDate: "2026-09-03" }), [
  { _changeId: "change-draft-1", type: "ALLOCATE_REMAINING", targetDate: "2026-09-03" },
  { _changeId: "change-draft-2", type: "MOVE_ALLOCATION", targetDate: "2026-09-02" },
], "koreksi dropdown harus mengganti draft yang sama tanpa menambah allocation baru");

const moveFixture = [{
  key: "MACHINE:machine-1",
  machineId: "machine-1",
  type: "INHOUSE",
  days: {
    "2026-09-01": { qty: 100, minutes: 50, allocations: [] },
    "2026-09-03": { qty: 0, minutes: 0, allocations: [] },
  },
  children: [{
    key: "PART:WIP-WELD:WELD-1",
    partCode: "WIP-WELD",
    processCodes: ["WELD-1"],
    monthlyProductionQty: 100,
    days: {
      "2026-09-01": {
        qty: 100,
        minutes: 50,
        allocations: [{
          allocationId: "allocation-weld-1",
          qty: 100,
          scheduleDate: "2026-09-01",
          partCode: "WIP-WELD",
          processCode: "WELD-1",
        }],
      },
      "2026-09-03": { qty: 0, minutes: 0, allocations: [] },
    },
  }],
}, { key: "MACHINE:machine-2", machineId: "machine-2", type: "INHOUSE", days: {}, children: [] }];
const movePreview = projectStagedMatrix(moveFixture, [{
  type: "SPLIT_ALLOCATION",
  allocationId: "allocation-weld-1",
  qty: 40,
  targetDate: "2026-09-03",
  targetMachineId: "machine-2",
  partCode: "WIP-WELD",
  processCode: "WELD-1",
}]);
assert.strictEqual(movePreview[0].children[0].days["2026-09-01"].qty, 60,
  "applied recommendation split must subtract quantity from its source allocation");
assert.strictEqual(movePreview[1].children[0].days["2026-09-03"].qty, 40,
  "applied recommendation split must appear at the target date");
assert.strictEqual(movePreview[1].children[0].days["2026-09-03"].staged, true);
assert.strictEqual(movePreview[0].children[0].days["2026-09-03"].qty, 0,
  "split to another machine must not stay on its original machine");
assert.strictEqual(moveFixture[0].children[0].days["2026-09-01"].qty, 100,
  "staged move projection must keep official matrix immutable for Cancel");

const pageScript = fs.readFileSync(path.join(__dirname, "../public/js/ppic-monthly-production-plan.js"), "utf8");
const pageCss = fs.readFileSync(path.join(__dirname, "../public/css/ppic-monthly-production-plan.css"), "utf8");
assert.match(pageScript, /mpp-editor-scope[\s\S]*renderEditorToolbar\(\)/,
  "Pergantian scope harus merender ulang toolbar editor dengan fungsi yang tersedia");
assert.doesNotMatch(pageScript, /=>\s*renderToolbar\(\)/,
  "Listener scope tidak boleh memanggil nama fungsi lama");
assert.match(pageScript, /mpp-editor-scope"\)\.value\s*=\s*state\.data\.editor\?\.defaultScope\s*\|\|\s*"PLAN"/,
  "Reload/Cancel harus mengembalikan scope default ke plan-specific");
assert.doesNotMatch(pageScript, /<fieldset class="mpp-machine-editor-card">/,
  "Machine card tidak boleh memakai fieldset/legend yang membuat grid collapse pada popup sempit");
assert.match(pageScript, /<article class="mpp-machine-editor-card"[^>]*>[\s\S]*mpp-machine-editor-card-head/,
  "Machine card harus memakai struktur article/header yang stabil");
assert.match(pageCss, /\.mpp-machine-editor-list\{[^}]*overflow-x:hidden/,
  "Daftar mesin tidak boleh menghasilkan scrollbar horizontal");
assert.match(pageCss, /\.mpp-editor-fields\{[^}]*width:100%/,
  "Grid field editor harus memenuhi lebar kartu mesin");
assert.match(pageScript, /data-cut-allocation/,
  "popup allocation harus menyediakan aksi Cut");
assert.match(pageScript, /evaluateTargetAvailability[\s\S]*ignoreSourceIds/,
  "paste matrix harus memvalidasi Available di Target tanpa menghitung konsumsi sumber Cut");
assert.match(pageCss, /\.mpp-editor-active td\.mpp-cut-target/,
  "target paste pada baris yang sama harus terlihat jelas");

console.log("MPP capacity editor state contract passed.");
