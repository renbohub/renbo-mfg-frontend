"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { collectSources, validationErrors, makePayload, checkStatus, qualifiedDies, changeAllocationField, replanPresentation, create } = require("../public/js/ppic-monthly-executor");

const source = { allocationId: "allocation-p1", planNumber: "MPP-09", lineNumber: 1, mbomProcessId: "press-route", processCode: "PRESS", partCode: "CH-001", qty: 1000, routingMode: "INHOUSE" };
const child = { partCode: "CH-001", processCodes: ["PRESS"], days: {
  "2026-09-08": { allocations: [source, { ...source }] },
  "2026-09-09": { allocations: [{ ...source, allocationId: "allocation-p2", qty: 500 }, { ...source, allocationId: "unsaved", stagedChangeId: "draft-1" }] },
} };
const remaining = [
  { planNumber: "MPP-09", lineNumber: 2, mbomProcessId: "press-route", partCode: "CH-001", processCode: "PRESS", remainingQty: 200 },
  { planNumber: "MPP-09", lineNumber: 3, mbomProcessId: "wash-route", partCode: "CH-001", processCode: "WASH", remainingQty: 200 },
  { planNumber: "MPP-09", lineNumber: 4, mbomProcessId: "press-route", partCode: "CH-002", processCode: "PRESS", remainingQty: 200 },
];
assert.equal(collectSources(child, remaining).length, 3, "Batch harus unik, draft editor dikecualikan, sisa part/proses yang sama tetap bisa dialihkan");
assert.deepEqual(collectSources(child, remaining, "2026-09-08").map((row) => row.allocationId), ["allocation-p1"], "Aksi dari cell tanggal hanya mengubah batch pada tanggal itu");

const context = { scope: { allocationId: "allocation-p1", lineNumber: 1, mbomProcessId: "press-route", qty: 1000, uomCode: "PCS" }, policy: { defaultMode: "INHOUSE", allowedModes: ["INHOUSE", "VENDOR"], allowSplit: true } };
const split = [
  { routingMode: "INHOUSE", plannedQty: 600, machineId: "P-1", diesId: "D-1", scheduleDate: "2026-09-08", shift: "1", vendorId: "old-vendor", vendorReturnDate: "2026-09-10" },
  { routingMode: "VENDOR", plannedQty: 400, vendorId: "BT", scheduleDate: "2026-09-08", vendorReturnDate: "2026-09-10", machineId: "old-machine", shift: "2" },
];
assert.deepEqual(validationErrors(context, split, "Kapasitas mesin penuh"), []);
const payload = makePayload(context, split, "  Kapasitas mesin penuh  ");
assert.equal(payload.allocations[0].plannedQty + payload.allocations[1].plannedQty, 1000);
assert.equal(payload.reason, "Kapasitas mesin penuh");
assert.equal(payload.allocations[0].diesId, "D-1");
assert.equal(payload.allocations[0].vendorId, undefined, "Nilai vendor lama tidak boleh terkirim untuk batch in-house");
assert.equal(payload.allocations[1].machineId, undefined, "Nilai mesin lama tidak boleh terkirim untuk batch vendor");
assert.equal(payload.allocations[1].vendorSendDate, "2026-09-08");
assert.equal(payload.allocations[1].shift, undefined);
assert(validationErrors(context, [{ ...split[0], plannedQty: 1001 }], "Replan").some((error) => error.includes("Total pembagian")), "Pembagian berlebih ditolak sebelum preview");
assert(validationErrors(context, [{ ...split[0], plannedQty: 999 }], "Replan").some((error) => error.includes("Total pembagian")), "Sisa tidak boleh diam-diam hilang dari alokasi");
assert(validationErrors(context, [{ ...split[1], plannedQty: 1000, vendorReturnDate: "2026-09-07" }], "Replan").some((error) => error.includes("ETA")));
assert(validationErrors({ ...context, policy: { ...context.policy, allowSplit: false } }, split, "Replan").some((error) => error.includes("Pembagian qty")));
assert(validationErrors({ ...context, policy: { ...context.policy, allowedModes: ["INHOUSE"] } }, split, "Replan").some((error) => error.includes("belum diizinkan")));
assert(validationErrors(context, split, " ").some((error) => error.includes("alasan")));
assert.equal(makePayload({ ...context, scope: { ...context.scope, allocationId: null } }, split, "Alokasi sisa").allocationId, undefined, "Residual memakai identitas line/proses, bukan ID allocation palsu");
assert.equal(checkStatus("capacity", { readiness: { ok: true, warningCount: 0 } }), "PASS");
assert.equal(checkStatus("capacity", { readiness: { ok: false } }), "BLOCKED");
assert.equal(checkStatus("material", { ready: false, summary: { blocking: 2 } }), "BLOCKED");
assert.equal(checkStatus("sequence", { issues: [{ severity: "blocking", code: "SUCCESSOR" }] }), "BLOCKED");
assert.equal(checkStatus("sequence", { issues: [] }), "PASS");
assert.equal(checkStatus("capacity", undefined), "", "Pemeriksaan yang belum berjalan tidak boleh ditampilkan sebagai siap");
const toolingContext = { ...context, machineResources: [{ machineId: "P-1", diesId: "D-1" }, { machineId: "P-2", diesId: "D-2" }], dies: [{ id: "D-1", diesCode: "D-1" }, { id: "D-2", diesCode: "D-2" }, { id: "OTHER", diesCode: "Tooling tidak terkait" }] };
assert.deepEqual(qualifiedDies(toolingContext, "P-1").map((dies) => dies.id), ["D-1"], "Dropdown tooling hanya boleh berisi tooling qualified untuk mesin terpilih");
assert.deepEqual(qualifiedDies(toolingContext, "").map((dies) => dies.id), [], "Tanpa mesin tidak boleh menawarkan seluruh tooling aktif");
const changedMachine = changeAllocationField(toolingContext, { ...split[0] }, "machineId", "P-2");
assert.equal(changedMachine.diesId, "", "Ganti mesin harus mengembalikan tooling ke default BOM mesin baru");
assert.equal(makePayload(context, [changedMachine], "Ganti mesin").allocations[0].diesId, null, "Tooling otomatis harus dikirim null agar backend memakai BOM mesin target");
assert.equal(changeAllocationField(toolingContext, { ...split[0], diesId: "OTHER" }, "shift", "2").diesId, "", "Tooling lama yang tidak lagi qualified tidak boleh ikut dikirim tersembunyi");
const pendingReplan = replanPresentation({ canApply: true, requiresReplan: true, affectedDocuments: [{ type: "PO", blocking: true }] });
assert.equal(pendingReplan.label, "Simpan Usulan Replan");
assert.equal(pendingReplan.pending, true);
assert.match(pendingReplan.caption, /Alokasi resmi tetap/);
const draftPrReplan = replanPresentation({ canApply: true, requiresReplan: true, affectedDocuments: [{ type: "PR", status: "Draft", blocking: false }] });
assert.equal(draftPrReplan.label, "Terapkan Replan", "Draft PR yang bisa disinkronkan harus menunjukkan penerapan langsung");
assert.equal(draftPrReplan.pending, false);
assert.match(draftPrReplan.caption, /Alokasi akan diperbarui dan dokumen draft terkait disinkronkan/);
assert.doesNotMatch(draftPrReplan.caption, /Alokasi resmi tetap/);
assert.equal(replanPresentation({ canApply: true, requiresReplan: true, affectedDocuments: [] }).label, "Terapkan Replan", "Replan plan yang tidak lagi terhalang dokumen dapat diterapkan langsung");
assert.equal(replanPresentation({ canApply: true, requiresReplan: false, affectedDocuments: [] }, "change-1").label, "Terapkan Replan", "Resume yang dokumennya sudah beres tetap ditandai sebagai Replan");
assert.equal(replanPresentation({ canApply: true, requiresReplan: false, affectedDocuments: [] }).label, "Simpan Perubahan");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "public/js/ppic-monthly-executor.js"), "utf8");
const page = fs.readFileSync(path.join(root, "public/js/ppic-monthly-production-plan.js"), "utf8");
const view = fs.readFileSync(path.join(root, "views/ppic/monthly-production-plan.ejs"), "utf8");
assert.match(page, /executorButton\(row, child\)/);
assert.match(page, /if \(!executor \|\| state\.editor/, "Draft editor harus diselesaikan sebelum mengubah pelaksana");
assert.match(script, /previewToken: state\.preview\.previewToken/, "Commit harus membawa hasil preview yang diverifikasi backend");
assert.match(script, /state\.preview = null;[\s\S]*state\.previewBody = null;/, "Perubahan form harus membatalkan preview sebelumnya");
assert.match(script, /state\.submited|state\.submitted/, "Simpan tidak boleh terkirim ganda dari dialog yang sama");
assert.match(script, /Simpan Usulan Replan/);
assert.match(script, /Alokasi resmi belum berubah/);
assert.match(script, /data-executor-resume/);
assert.match(script, /changeId: state\.changeId/);
assert.match(script, /data-executor-cancel-change/);
assert.match(view, /ppic-monthly-executor\.js\?v=/);
assert.match(view, /aria-labelledby="mpp-executor-title"/);
async function verifyDialogLifecycle() {
  // Small DOM doubles exercise the real dialog lifecycle; no browser or business API writes.
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: "", innerHTML: "", textContent: "", hidden: false, disabled: false, checked: false, open: false, listeners: {},
      classList: { toggle() {} }, querySelectorAll() { return []; }, querySelector() { return null; },
      scrollIntoView() {}, showModal() { this.open = true; }, close() { this.open = false; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async emit(type, event = {}) { return this.listeners[type]?.({ preventDefault() {}, ...event }); },
    });
    return elements.get(id);
  }
  const savedDocument = global.document;
  global.document = { getElementById: element };
  const el = (suffix) => element(`mpp-executor-${suffix}`);
  const calls = [];
  let applied = 0;
  const proposal = { allocationId: source.allocationId, lineNumber: 1, mbomProcessId: "press-route", reason: "Mesin penuh", allocations: [
    { routingMode: "INHOUSE", plannedQty: 1000, machineId: "P-1", scheduleDate: "2026-09-08", shift: "1" },
  ] };
  const options = { ...toolingContext, policy: { ...context.policy, errors: ["Mesin default sedang tidak tersedia"] }, planNumber: "MPP-09", currentAllocations: [{ ...proposal.allocations[0] }], machines: [{ id: "P-1", machineCode: "M-001", machineName: "P-1" }], vendors: [{ id: "BT", vendorName: "Bintang Timur" }], shifts: ["1"], periodStart: "2026-09-01", requiresReplan: true, affectedDocuments: [{ type: "PO", number: "PO-1", blocking: true, url: "/modules/purchasing/purchase-orders/PO-1" }], history: [] };
  try {
    const dialog = create({
      api: async (url, request = {}) => {
        calls.push({ url, ...request });
        if (url.includes("executor-options")) return options;
        if (url.endsWith("/preview")) return { canApply: true, requiresReplan: true, affectedDocuments: options.affectedDocuments, previewToken: "verified-1", checks: { capacity: { readiness: { ok: true } }, material: { ready: true }, sequence: { issues: [] } } };
        if (request.method === "POST") return { status: "PENDING_REPLAN", requiresResolution: true, changeId: "change-1", message: "Alokasi belum berubah." };
        return { items: [{ id: "change-1", status: "PENDING_REPLAN", newValue: { proposal } }] };
      },
      onApplied: async () => { applied += 1; },
    });
    await dialog.open([{ ...source, scheduleDate: "2026-09-08", machineId: "P-1" }]);
    assert.equal(el("apply").disabled, true);
    assert.equal(el("preview").disabled, false, "Masalah mesin default tidak boleh mencegah preview peralihan pelaksana yang valid");
    assert.match(el("allocations").innerHTML, /Otomatis sesuai BOM · D-1/);
    assert.doesNotMatch(el("allocations").innerHTML, /Tooling tidak terkait/);
    el("reason").value = "Mesin penuh";
    await el("reason").emit("input");
    await el("preview").emit("click");
    assert.equal(el("apply").disabled, false);
    assert.equal(el("apply").textContent, "Simpan Usulan Replan");
    const previewCount = calls.filter((row) => row.url.endsWith("/preview")).length;
    await el("reason").emit("input");
    assert.equal(el("apply").disabled, true, "Mengubah alasan membatalkan preview lama");
    await el("apply").emit("click");
    assert.equal(calls.filter((row) => row.method === "POST" && !row.url.endsWith("/preview")).length, 0);
    await el("preview").emit("click");
    assert.equal(calls.filter((row) => row.url.endsWith("/preview")).length, previewCount + 1);
    await el("apply").emit("click");
    assert.equal(applied, 0, "Replan perlu konfirmasi dokumen dari user");
    el("replan-confirm").checked = true;
    await el("apply").emit("click");
    assert.equal(applied, 1);
    const committed = calls.find((row) => row.method === "POST" && !row.url.endsWith("/preview"));
    assert.equal(committed.body.replan, true);
    assert.equal(committed.body.previewToken, "verified-1");
    assert.equal(el("apply").disabled, true, "Dialog tidak boleh menyimpan lagi setelah respons pending");
    assert.match(el("message").textContent, /Alokasi belum berubah/);
    await el("apply").emit("click");
    assert.equal(applied, 1, "Klik ganda tidak boleh mengirim perubahan lagi");
    assert.match(el("history-body").innerHTML, /Lanjutkan Replan/);
    assert.match(el("history-body").innerHTML, /Batalkan Usulan/);
  } finally { global.document = savedDocument; }
}
verifyDialogLifecycle().then(() => console.log("Monthly executor UI: batch isolation, quantity conservation, resource payloads, preview invalidation, Replan confirmation and duplicate-submit guards passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
