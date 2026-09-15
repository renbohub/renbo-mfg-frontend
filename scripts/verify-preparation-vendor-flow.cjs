const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../public/js/ppic-preparation-model');
const T = require('../public/js/ppic-preparation-tree');

const month = '2026-09';
function workbook() {
  return {
    month, name: 'Vendor movements',
    delivery: [{ id: 'fg', partCode: 'FG', partNumber: 'DRAW-FG', uomCode: 'PCS', customerCode: 'C1', days: { '2026-09-10': 100 } }],
    production: [{ id: 'old-production', days: { '2026-09-05': 100 } }],
    material: [{ id: 'old-material', days: { '2026-09-01': 250 } }],
    processAllocations: { vendor: { '2026-09-08': 60, '2026-09-09': 40 } }
  };
}
function snapshot(vendorOverrides = {}) {
  return { rows: [{
    id: 'fg', currentStock: 35, unallocatedQty: 15, warnings: [], children: [
      {
        id: 'inhouse', partCode: 'WIP-CUT', rowType: 'In-house', allocationKind: 'INHOUSE_CAPACITY',
        processCode: 'CUT', uomCode: 'PCS', currentStock: 10, unallocatedQty: 5,
        days: { '2026-09-04': 60, '2026-09-05': 40 }
      },
      {
        id: 'vendor', partCode: 'WIP-PLATE', rowType: 'Vendor', allocationKind: 'VENDOR_LEAD_TIME',
        processCode: 'PLATING', uomCode: 'PCS', currentStock: 12, unallocatedQty: 7,
        vendorLeadTimeMinutes: 960, vendorLeadTimeValue: 2, vendorLeadTimeUnit: 'DAY', vendorLeadTimeSource: 'MBOM_DETAIL',
        days: { '2026-09-08': 60, '2026-09-09': 40 },
        vendorReceiptDays: { '2026-09-08': 60, '2026-09-09': 40 },
        vendorDispatchDays: { '2026-09-04': 60, '2026-09-07': 40 },
        ...vendorOverrides
      }
    ]
  }] };
}
function flat(w = workbook(), s = snapshot()) {
  const [fg] = T.rows(w, s);
  return [fg, ...fg._children];
}

const controller = fs.readFileSync(path.join(__dirname, '../public/js/ppic-preparation.js'), 'utf8');
const commonFormatters = controller.slice(controller.indexOf('  const esc='), controller.indexOf('  const title='));
const quantityHelpers = controller.slice(controller.indexOf('  function vendorMovements('), controller.indexOf('  async function renderSheet('));
function renderQuantity(row, field, { stale = false } = {}) {
  const w = workbook(), column = T.columns(month).find(c => c.field === field);
  assert.ok(column, 'Formatter fixture must use a visible column');
  const { quantityCell } = vm.runInNewContext(commonFormatters + quantityHelpers + '\n({ quantityCell });', {
    T, tree:{}, workbook: w, treeKey: stale ? '' : T.signature(w)
  });
  return quantityCell({ getRow: () => ({ getData: () => row }), getValue: () => row[field] }, column);
}
function vendorHalves(html) {
  assert.match(html, /^<span class="prep-vendor-flow"><span class="prep-vendor-in"/);
  const split = html.indexOf('<span class="prep-vendor-out"');
  assert.ok(split > 0, 'Outgoing half must follow incoming half');
  return { incoming: html.slice(0, split), outgoing: html.slice(split) };
}

test('one editable column per date preserves stock positions and hides standalone outgoing columns', () => {
  const columns = T.columns(month);
  assert.deepEqual(columns.slice(0, 10).map(c => c.field), [
    'explodeNo', 'partCode', 'rowType', 'processCode', 'partName', 'poQty', 'forecastQty', 'additionalPoQty', 'currentStock', 'unallocatedQty'
  ]);
  assert.deepEqual(columns.slice(8, 10).map(c => [M.letter(columns.indexOf(c)), c.title, c.readonly]), [
    ['I', 'Current Stock', true], ['J', 'Unallocated Qty', true]
  ]);
  for (const [index, date] of M.dates(month).entries()) {
    const day = date.slice(-2), receipt = columns[10 + index];
    assert.deepEqual([receipt.field, receipt.date, receipt.title, receipt.movement, receipt.numeric, receipt.width],
      ['d' + day, date, day, 'allocation', true, 144]);
    assert.notEqual(receipt.readonly, true);
  }
  assert.equal(columns.length, 41); assert.equal(columns.filter(c => c.date).length, 30);
  assert.equal(columns.some(c => /^out\d\d$/.test(c.field) || c.field === '_vendorOutTotal'), false);
  const total = columns.find(c => c.field === '_total');
  assert.deepEqual([total.title, total.width, total.numeric, total.readonly], ['Total', 144, true, true]);
});

test('vendor dispatch and receipt dates remain distinct without doubling receipt or FG quantities', () => {
  const w = workbook(), s = snapshot(), before = M.clone({ w, s });
  const [fg, inhouse, vendor] = flat(w, s);
  assert.deepEqual([vendor.d04, vendor.d07, vendor.d08, vendor.in04, vendor.in08, vendor.in09], [60, 40, 0, 0, 60, 40]);
  assert.equal(vendor._total, 100); assert.equal(vendor._vendorInTotal, 100);
  assert.equal(fg._total, 100); assert.equal(inhouse._total, 100);
  assert.deepEqual([fg.currentStock, fg.unallocatedQty, inhouse.currentStock, inhouse.unallocatedQty, vendor.currentStock, vendor.unallocatedQty],
    [35, 15, 10, 5, 12, 7]);
  const persistedDelivery = M.inflate([fg], 'delivery', month);
  assert.deepEqual(persistedDelivery[0].days, { '2026-09-10': 100 });
  assert.deepEqual(M.totals(persistedDelivery), { PCS: 100 });
  assert.deepEqual({ w, s }, before);
});

test('FG and in-house rows preserve their original daily quantities and leave vendor outgoing blank', () => {
  const [fg, inhouse] = flat();
  for (const row of [fg, inhouse]) {
    for (const date of M.dates(month)) assert.equal(row['out' + date.slice(-2)], null, row.id + ' ' + date);
    assert.equal(row._vendorOutTotal, null);
  }
  assert.deepEqual([fg.d04, fg.d10, inhouse.d04, inhouse.d05, inhouse.d08], [0, 100, 60, 40, 0]);
});

test('unknown vendor lead time leaves outgoing unknown while preserving receipts and explicit zero lead time is known', () => {
  const unknown = flat(workbook(), snapshot({ vendorLeadTimeMinutes: null, vendorLeadTimeValue: null, vendorLeadTimeUnit: null }))[2];
  for (const date of M.dates(month)) assert.equal(unknown['d' + date.slice(-2)], null);
  assert.equal(unknown._total, null);
  assert.deepEqual([unknown.in08, unknown.in09, unknown._vendorInTotal], [60, 40, 100]);
  const zero = flat(workbook(), snapshot({ vendorLeadTimeMinutes: 0, vendorLeadTimeValue: 0, vendorDispatchDays: { '2026-09-08': 60, '2026-09-09': 40 } }))[2];
  assert.deepEqual([zero.out01, zero.out08, zero.out09, zero._vendorOutTotal], [0, 60, 40, 100]);
});

test('outgoing total counts only the visible month without dropping off-month backend evidence', () => {
  const source = snapshot({ vendorDispatchDays: { '2026-08-31': 60, '2026-09-07': 40, '2026-10-01': 25 } });
  const vendor = flat(workbook(), source)[2];
  assert.equal(vendor.d07, 40); assert.equal(vendor._total, 40); assert.equal(vendor._vendorInTotal, 100);
  assert.equal(vendor.vendorDispatchDays['2026-08-31'], 60); assert.equal(vendor.vendorDispatchDays['2026-10-01'], 25);
});

test('manual outgoing remains known without lead time and receipt is explicitly unknown', () => {
  const w = workbook(); w.vendorDispatchAllocations = { vendor: { '2026-09-04': 75 } };
  const source = snapshot({ vendorAllocationBasis: 'DISPATCH', vendorLeadTimeMinutes: null, vendorDispatchDays: { '2026-09-04': 75 }, vendorReceiptDays: {}, days: {} });
  const vendor = flat(w, source)[2];
  assert.equal(vendor.d04, 75); assert.equal(vendor.d08, 0); assert.equal(vendor._total, 75);
  for (const date of M.dates(month)) assert.equal(vendor['in' + date.slice(-2)], null);
  assert.equal(vendor._vendorInTotal, null);
  assert.equal(T.exportValue(vendor, T.columns(month).find(column => column.field === 'd04')), '▼ — | ▲ 75');
});

test('pending source refresh preserves current manual outgoing values instead of reverting to stale response', () => {
  const w = workbook(); w.vendorDispatchAllocations = { vendor: { '2026-09-06': 125 } };
  const vendor = flat(w)[2];
  assert.equal(vendor.d06, 125); assert.equal(vendor.d04, 0); assert.equal(vendor._total, 125);
  assert.equal(vendor.vendorDispatchDays['2026-09-04'], 60, 'Backend evidence remains intact for provenance');
  assert.ok(!Object.values(T.dayValues(vendor, month)).some(Number.isNaN));
  assert.equal(renderQuantity(vendor, 'd06', { stale: true }), '…');
});

test('missing dispatch source or invalid explicit quantities are not fabricated as zero', () => {
  const missing = flat(workbook(), snapshot({ vendorDispatchDays: undefined }))[2];
  assert.equal(missing.d04, null); assert.equal(missing._total, null); assert.equal(missing.in08, 60);
  const noReceipt = flat(workbook(), snapshot({ vendorAllocationBasis: 'DISPATCH', vendorReceiptDays: undefined, days: {} }))[2];
  assert.equal(noReceipt.d04, 60); assert.equal(noReceipt.in08, null); assert.equal(noReceipt._vendorInTotal, null);
  for (const invalid of [null, NaN, -1, 'bad']) {
    const vendor = flat(workbook(), snapshot({ vendorDispatchDays: { '2026-09-04': invalid } }))[2];
    assert.equal(vendor.d04, null); assert.equal(vendor._total, null);
  }
});

test('vendor lead-time label uses the BOM value and unit, and distinguishes unknown from zero', () => {
  const [fg, inhouse, vendor] = flat();
  assert.equal(T.vendorLeadLabel(fg), ''); assert.equal(T.vendorLeadLabel(inhouse), '');
  assert.equal(T.vendorLeadLabel(vendor), 'LT 2 hari · BOM');
  for (const [value, unit, minutes, label] of [
    [90, 'MINUTE', 90, 'LT 90 menit · BOM'], [1.5, 'HOUR', 90, 'LT 1,5 jam · BOM'],
    [30, 'SECOND', 0.5, 'LT 30 detik · BOM'], [0, 'DAY', 0, 'LT 0 hari · BOM']
  ]) {
    assert.equal(T.vendorLeadLabel({ ...vendor, vendorLeadTimeValue: value, vendorLeadTimeUnit: unit, vendorLeadTimeMinutes: minutes }), label);
  }
  for (const value of [null, undefined, -1, NaN]) {
    assert.equal(T.vendorLeadLabel({ ...vendor, vendorLeadTimeMinutes: value }), 'LT BOM belum valid');
  }
  assert.equal(T.vendorLeadLabel({ ...vendor, vendorLeadTimeSource: 'WORKBOOK_OVERRIDE' }), 'LT 2 hari · Workbook');
  assert.equal(T.vendorLeadLabel({ ...vendor, vendorLeadTimeSource: 'WORKBOOK_OVERRIDE', vendorLeadTimeMinutes: null }), 'LT Workbook belum valid');
  assert.equal(T.vendorLeadLabel({ ...vendor, vendorLeadTimeValue: NaN }), 'LT 960 menit · BOM');
});

test('legacy off-month positive dispatch blocks conversion atomically rather than dropping quantities', () => {
  const w = workbook(), vendor = flat(w, snapshot({ vendorDispatchDays: { '2026-08-31': 60, '2026-09-07': 40 } }))[2];
  const before = M.clone(w); vendor.d07 = 20;
  assert.throws(() => T.captureProcess(w, vendor), /di luar periode workbook/);
  assert.deepEqual(w, before);
  const automatic = workbook(); delete automatic.processAllocations.vendor;
  T.captureProcess(automatic, vendor);
  assert.equal(automatic.vendorDispatchAllocations.vendor['2026-09-07'], 20);
});
test('legacy positive receipts require known lead time before first outgoing conversion can replace them',()=>{
  for(const lead of [null,undefined,NaN,-1]){
    const w=workbook(),vendor=flat(w,snapshot({vendorLeadTimeMinutes:lead}))[2],before=M.clone(w);
    vendor.d04=75;
    assert.throws(()=>T.captureProcess(w,vendor),/Isi lead time vendor terlebih dahulu/);
    assert.deepEqual(w,before,'Unknown legacy dispatch must not silently become zero or remove original receipt map');
  }
  const w=workbook();w.vendorDispatchAllocations={vendor:{'2026-09-04':75}};
  const vendor=flat(w,snapshot({vendorAllocationBasis:'DISPATCH',vendorLeadTimeMinutes:null,vendorDispatchDays:{'2026-09-04':75},vendorReceiptDays:{},days:{}}))[2];
  vendor.d04=80;T.captureProcess(w,vendor);
  assert.equal(w.vendorDispatchAllocations.vendor['2026-09-04'],80);assert.equal(w.processAllocations.vendor,undefined);
  const fresh=workbook();delete fresh.processAllocations.vendor;
  const unverified=flat(fresh,snapshot({vendorLeadTimeMinutes:null,vendorReceiptDays:{},days:{}}))[2];
  unverified.d04=25;T.captureProcess(fresh,unverified);
  assert.equal(fresh.vendorDispatchAllocations.vendor['2026-09-04'],25);
});

test('in-house capture keeps its existing allocation model while invalid numbers reject before mutation', () => {
  const w = workbook(), [, inhouse, vendor] = flat(w);
  inhouse.d05 = 70; T.captureProcess(w, inhouse);
  assert.equal(w.processAllocations.inhouse['2026-09-05'], 70);
  assert.equal(w.vendorDispatchAllocations, undefined);
  const before = M.clone(w); vendor.d04 = NaN;
  assert.throws(() => T.captureProcess(w, vendor), /Jumlah harus/);
  assert.deepEqual(w, before);
});

test('vendor outgoing edits persist all month dates and replace only the matching legacy receipt allocation', () => {
  const w = workbook(), before = M.clone(w), [, , vendor] = flat(w);
  w.processAllocations.inhouse = { '2026-09-05': 30 };
  vendor.d08 = 25; vendor.d09 = 0; vendor.in04 = 999; vendor._vendorInTotal = 999;
  T.captureProcess(w, vendor);
  assert.equal(w.vendorDispatchAllocations.vendor['2026-09-08'], 25); assert.equal(w.vendorDispatchAllocations.vendor['2026-09-09'], 0);
  assert.equal(w.vendorDispatchAllocations.vendor['2026-09-04'], 60);
  assert.equal(Object.keys(w.vendorDispatchAllocations.vendor).length, 30);
  assert.ok(Object.keys(w.vendorDispatchAllocations.vendor).every(key => /^2026-09-\d\d$/.test(key)));
  assert.equal(w.processAllocations.vendor, undefined);
  assert.deepEqual(w.processAllocations.inhouse, { '2026-09-05': 30 });
  assert.deepEqual(w.delivery, before.delivery); assert.deepEqual(w.production, before.production); assert.deepEqual(w.material, before.material);
});

test('horizontal and vertical date paste changes outgoing for vendors and does not edit computed incoming', () => {
  const rows = flat(), before = structuredClone(rows), columns = T.columns(month);
  const receiptIndex = columns.findIndex(c => c.field === 'd08');
  for (const row of rows) {
    assert.equal(T.editable(row, columns[receiptIndex]), true);
    assert.equal(T.editable(row, columns.find(c => c.field === '_total')), false);
  }
  const pasted = T.pasteVisible(rows, columns, 0, receiptIndex, '10\t11\n20\t21\n30\t31');
  assert.deepEqual(pasted.map(row => [row.d08, row.d09]), [[10, 11], [20, 21], [30, 31]]);
  for (const date of M.dates(month)) assert.equal(pasted[2]['in' + date.slice(-2)], before[2]['in' + date.slice(-2)]);
  assert.equal(pasted[2]._vendorInTotal, 100);
  const w = workbook(); T.captureProcess(w, pasted[2]);
  assert.deepEqual([w.vendorDispatchAllocations.vendor['2026-09-08'], w.vendorDispatchAllocations.vendor['2026-09-09']], [30, 31]);
  assert.ok(Object.keys(w.vendorDispatchAllocations.vendor).every(key => /^2026-09-\d\d$/.test(key)));
  assert.deepEqual(rows, before);
  for (const [field, value] of [['_total', '20'], ['d30', '20\t40']]) {
    const start = columns.findIndex(column => column.field === field);
    assert.throws(() => T.pasteVisible(rows, columns, 2, start, value), /hanya baca/);
    assert.deepEqual(rows, before);
  }
});

test('export keeps both vendor directions in one date and total column without injecting them into delivery', () => {
  const w = workbook(), exported = T.exportRows(w, snapshot()), columns = T.columns(month);
  assert.deepEqual(exported.map(row => row.id), ['fg', 'inhouse', 'vendor']);
  const outgoingDay = columns.findIndex(c => c.field === 'd04'), receiptDay = columns.findIndex(c => c.field === 'd08');
  const vendorCells = columns.map(column => T.exportValue(exported[2], column));
  assert.equal(vendorCells[outgoingDay], '▼ 0 | ▲ 60'); assert.equal(vendorCells[receiptDay], '▼ 60 | ▲ 0');
  assert.equal(vendorCells[columns.findIndex(c => c.field === '_total')], '▼ 100 | ▲ 100');
  assert.equal(exported[0]._vendorOutTotal, null); assert.equal(exported[1]._vendorOutTotal, null);
  assert.deepEqual(w.delivery[0].days, { '2026-09-10': 100 });
});

test('export formats vendor arrows with Indonesian quantities and preserves unknown outgoing rather than inventing zero', () => {
  const vendor = flat()[2], columns = T.columns(month), date = columns.find(c => c.field === 'd08'), total = columns.find(c => c.field === '_total');
  assert.equal(T.exportValue({ ...vendor, in08: 1250.5, d08: 90.125 }, date), '▼ 1.250,5 | ▲ 90,125');
  assert.equal(T.exportValue({ ...vendor, _vendorInTotal: 1250.5, _total: 90.125 }, total), '▼ 1.250,5 | ▲ 90,125');
  const unknown = flat(workbook(), snapshot({ vendorLeadTimeMinutes: null }))[2];
  assert.equal(T.exportValue(unknown, date), '▼ 60 | ▲ —');
  assert.equal(T.exportValue(unknown, total), '▼ 100 | ▲ —');
  assert.equal(T.exportValue({ ...vendor, d08: null, in08: null }, date), '▼ — | ▲ —');
});

test('export keeps FG and in-house quantities numeric and vendor metadata raw', () => {
  const [fg, inhouse, vendor] = flat(), columns = T.columns(month), day = columns.find(c => c.field === 'd04'), total = columns.find(c => c.field === '_total');
  assert.equal(T.exportValue(fg, day), 0); assert.equal(T.exportValue(inhouse, day), 60);
  assert.equal(T.exportValue(fg, total), 100); assert.equal(T.exportValue(inhouse, total), 100);
  assert.equal(T.exportValue(vendor, columns.find(c => c.field === 'currentStock')), 12);
  assert.equal(T.exportValue(vendor, columns.find(c => c.field === 'processCode')), 'PLATING');
  assert.equal(T.exportValue(vendor, { field: 'missingMetadata' }), '');
  assert.equal(T.exportValue({ ...fg, currentStock: null }, { field: 'currentStock' }), '');
});

test('actual formatter splits only vendor dates into green incoming left and red outgoing right', () => {
  const [fg, inhouse, vendor] = flat(), { incoming, outgoing } = vendorHalves(renderQuantity(vendor, 'd08'));
  assert.match(incoming, /class="prep-vendor-arrow"[^>]*>▼<\/span>/);
  assert.match(incoming, /class="prep-vendor-amount">60<\/span>/);
  assert.match(incoming, /aria-readonly="true"/);
  assert.match(incoming, /Otomatis dari qty keluar/);
  assert.match(outgoing, /class="prep-vendor-arrow"[^>]*>▲<\/span>/);
  assert.doesNotMatch(outgoing, /aria-readonly="true"/);
  assert.match(outgoing, /Klik.*edit qty keluar/);
  assert.match(outgoing, /class="prep-zero">0<\/span>/);
  assert.match(renderQuantity(fg, 'd10'), /prep-demand-unknown.*>100<\/span>/); assert.equal(renderQuantity(inhouse, 'd04'), '60');
  assert.equal(renderQuantity(vendor, 'currentStock'), '12');
  const css = fs.readFileSync(path.join(__dirname, '../public/css/ppic-preparation-workbench.css'), 'utf8');
  assert.match(css, /\.prep-vendor-in \.prep-vendor-arrow[^{}]*\{[^}]*color:\s*#15803d;/);
  assert.match(css, /\.prep-vendor-out \.prep-vendor-arrow[^{}]*\{[^}]*color:\s*#dc2626;/);
});

test('receipt-date warnings stay on incoming half and preserve meaningful zero missed-need warnings', () => {
  const vendor = flat()[2];
  vendor.allocationIssuesByDate = { '2026-09-08': ['Tanggal masuk belum memenuhi kebutuhan.'] };
  for (const receipt of [60, 0]) {
    const { incoming, outgoing } = vendorHalves(renderQuantity({ ...vendor, in08: receipt }, 'd08'));
    assert.match(incoming, /prep-qty-warning/); assert.match(incoming, /Tanggal masuk belum memenuhi kebutuhan/);
    assert.doesNotMatch(outgoing, /prep-qty-warning|⚠|Tanggal masuk belum memenuhi kebutuhan/);
  }
});

test('matching positive invalid dispatch warns outgoing without warning an unrelated same-date receipt', () => {
  const vendor = flat()[2];
  vendor.vendorMovements = [{ quantity: 60, dispatchDate: '2026-09-04', receiptDate: '2026-09-08', valid: false }];
  const dispatch = vendorHalves(renderQuantity(vendor, 'd04'));
  assert.match(dispatch.outgoing, /prep-qty-warning/); assert.match(dispatch.outgoing, /60 ⚠/);
  assert.match(dispatch.outgoing, /keluar 2026-09-04 → masuk 2026-09-08/);
  assert.doesNotMatch(dispatch.incoming, /prep-qty-warning|⚠/);
  const receipt = vendorHalves(renderQuantity(vendor, 'd08'));
  assert.match(receipt.incoming, /prep-qty-warning/); assert.doesNotMatch(receipt.outgoing, /prep-qty-warning|⚠/);
});

test('zero-only invalid vendor movements create neither warning badges nor phantom movement tooltips', () => {
  const vendor = flat()[2];
  vendor.vendorMovements = [{ quantity: 0, dispatchDate: '2026-09-04', receiptDate: '2026-09-08', valid: false }];
  for (const field of ['d04', 'd08']) {
    const html = renderQuantity(vendor, field);
    assert.doesNotMatch(html, /prep-qty-warning|⚠|0 qty: keluar/);
    vendorHalves(html);
  }
});

test('formatter retains receipt value beside unknown outgoing and suppresses stale calculated quantities', () => {
  const vendor = flat(workbook(), snapshot({ vendorLeadTimeMinutes: null }))[2];
  const { incoming, outgoing } = vendorHalves(renderQuantity(vendor, 'd08'));
  assert.match(incoming, /class="prep-vendor-amount">60<\/span>/);
  assert.match(outgoing, /class="prep-vendor-amount">—<\/span>/);
  assert.match(outgoing, /Qty keluar belum diketahui/);
  assert.doesNotMatch(outgoing, /prep-zero/);
  assert.equal(renderQuantity(vendor, 'd08', { stale: true }), '…');
});

test('formatter preserves manually entered outgoing beside unknown calculated incoming', () => {
  const w = workbook(); w.vendorDispatchAllocations = { vendor: { '2026-09-04': 75 } };
  const vendor = flat(w, snapshot({ vendorAllocationBasis: 'DISPATCH', vendorLeadTimeMinutes: null, vendorDispatchDays: { '2026-09-04': 75 }, vendorReceiptDays: {}, days: {} }))[2];
  for (const field of ['d04', '_total']) {
    const { incoming, outgoing } = vendorHalves(renderQuantity(vendor, field));
    assert.match(incoming, /class="prep-vendor-amount">—<\/span>/);
    assert.match(incoming, /aria-readonly="true"/);
    assert.match(outgoing, /class="prep-vendor-amount">75<\/span>/);
    assert.doesNotMatch(incoming, /prep-zero/);
  }
});

test('vendor total formatter shows distinct receipt and outgoing totals with readonly meaning', () => {
  const vendor = flat()[2];
  vendor._total = 40; vendor.invalidAllocatedQty = 5;
  const { incoming, outgoing } = vendorHalves(renderQuantity(vendor, '_total'));
  assert.match(incoming, /100 ⚠/); assert.match(incoming, /5 qty masuk belum valid/);
  assert.match(incoming, /aria-readonly="true"/); assert.match(incoming, /hanya baca/);
  assert.doesNotMatch(incoming, /Klik dua kali untuk edit/);
  assert.match(outgoing, /class="prep-vendor-amount">40<\/span>/);
  assert.doesNotMatch(outgoing, /prep-qty-warning|⚠/);
});

test('actual formatter escapes warning text and movement details inside tooltip attributes', () => {
  const vendor = flat()[2];
  vendor.allocationIssuesByDate = { '2026-09-08': ['<img src=x onerror="alert(1)"> & \'quoted\''] };
  vendor.vendorMovements = [{ quantity: 60, dispatchDate: '2026-09-04', dispatchAt: '<img src=x>&"\'', receiptDate: '2026-09-08', valid: false }];
  for (const field of ['d04', 'd08']) {
    const html = renderQuantity(vendor, field);
    assert.doesNotMatch(html, /<img|onerror="alert/);
    assert.match(html, /&lt;img src=x&gt;&amp;&quot;&#39;/);
  }
  const receipt = renderQuantity(vendor, 'd08');
  assert.match(receipt, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;quoted&#39;/);
});
