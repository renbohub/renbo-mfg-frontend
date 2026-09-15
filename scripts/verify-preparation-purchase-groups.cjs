'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../public/js/ppic-preparation-derived');

function fixture() {
  delete require.cache[modulePath];
  const api = require(modulePath), nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, hidden: false,
      handlers: {}, attrs: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this.attrs[name] = value; },
      click() { this.handlers.click?.(); },
      querySelectorAll() { return []; }
    });
    return nodes.get(id);
  };
  api.mount({ getElementById: node });
  return { api, node };
}

function row(purchaseGroup, partCode, extra = {}) {
  return {
    purchaseGroup, partCode, partNumber: 'DRAW-' + partCode, partName: 'Name ' + partCode,
    needDate: '2026-09-04', orderDate: '2026-09-01', materialType: null, materialWidth: null,
    uomCode: 'PCS', supplierCode: 'S001', requiredQty: 100, recommendedQty: 100,
    status: 'REVIEW', issues: [], sourceFgCodes: ['FG01'], bomNumbers: ['BOM01'], ...extra
  };
}
const source = rows => ({ derived: {
  purchase: { rows, warnings: [], basis: 'BOM from tab 02' },
  vendor: { rows: Array.from({ length: 61 }, (_, index) => ({ partCode: 'VENDOR-' + String(index).padStart(3, '0'), quantity: index + 1 })), warnings: [] },
  capacity: { rows: [], machineChildren: [], warnings: [] }
} });
const state = (snapshot, extra = {}) => ({ month: '2026-09', name: 'September', dirty: false, loading: false, error: '', snapshot, ...extra });
const html = f => f.node('prep-purchase-body').innerHTML;
const tableRows = value => value.match(/<tr\b[\s\S]*?<\/tr>/g) || [];
const groupRows = value => tableRows(value).filter(row => /data-purchase-toggle=/.test(row));
const dataRows = value => tableRows(value).filter(row => !/data-purchase-toggle=|prep-derived-empty/.test(row));
const tokens = value => [...value.matchAll(/data-purchase-toggle="([^"]+)"/g)].map(match => match[1]);
const text = value => value.replace(/<[^>]+>/g, '').trim();
const cells = value => value.match(/<td\b[\s\S]*?<\/td>/g) || [];
function search(f, term) {
  f.node('prep-purchase-search').value = term;
  f.node('prep-purchase-search').handlers.input();
}
function toggle(f, key) {
  const group = groupRows(html(f)).find(row => row.includes('data-purchase-toggle="' + key + '"'));
  assert.ok(group, 'group toggle must remain available: ' + key);
  const button = {
    dataset: { purchaseToggle: key },
    getAttribute: name => name === 'aria-expanded' ? group.match(/aria-expanded="([^"]+)"/)?.[1] : null,
    focus() {}
  };
  f.node('prep-purchase-body').handlers.click({ target: { closest: selector => selector === '[data-purchase-toggle]' ? button : null } });
}

test('purchase rows group by Purchase Part, Material and unclassified without losing or mutating requirements', () => {
  const f = fixture(), rows = [
    row('MATERIAL', 'MAT-A', { materialType: 'SPHC', materialWidth: 93.5 }),
    row('UNCLASSIFIED', 'UNKNOWN-A'),
    row('PURCHASE_PART', 'PART-A'),
    row('MATERIAL', 'MAT-B', { materialType: 'SPCC', materialWidth: 150 }),
    row('PURCHASE_PART', 'PART-B')
  ], data = source(rows), before = structuredClone(data);
  f.api.update(state(data));
  assert.deepEqual(tokens(html(f)), ['PURCHASE_PART', 'MATERIAL', 'UNCLASSIFIED']);
  const groups = groupRows(html(f));
  assert.match(text(groups[0]), /Purchase Part/);
  assert.match(text(groups[1]), /Material/);
  assert.match(text(groups[2]), /Belum diklasifikasikan/);
  groups.forEach(group => assert.match(group, /aria-expanded="true"/));
  assert.equal(dataRows(html(f)).length, rows.length);
  assert.ok(html(f).indexOf('PART-B') < html(f).indexOf('MAT-A'));
  assert.ok(html(f).indexOf('MAT-B') < html(f).indexOf('UNKNOWN-A'));
  assert.deepEqual(data, before, 'grouping is presentation only; qty, dates, units and source lineage must remain intact');
  const sorted = f.api.sortPurchaseRows(rows);
  assert.notEqual(sorted, rows, 'sorting must return a copy');
  assert.deepEqual(sorted.map(item => item.purchaseGroup), ['PURCHASE_PART', 'PURCHASE_PART', 'MATERIAL', 'MATERIAL', 'UNCLASSIFIED']);
  assert.deepEqual(rows, before.derived.purchase.rows);
});

test('material type and width have explicit columns while missing source values stay unknown', () => {
  const f = fixture(), columns = f.api.columns.purchase;
  assert.ok(columns.some(([key, label]) => key === 'partName' && label === 'Nama part / material'));
  assert.ok(columns.some(([key, label]) => key === 'materialType' && label === 'Material type'));
  assert.ok(columns.some(([key, label, kind]) => key === 'materialWidth' && label === 'Lebar (mm)' && kind === 'number'));
  const rows = [row('MATERIAL', 'MAT', { materialType: 'SPHC', materialWidth: 93.5 }), row('PURCHASE_PART', 'PART')];
  const rendered = dataRows(f.api.tableRows('purchase', rows));
  const typeIndex = columns.findIndex(([key]) => key === 'materialType');
  const widthIndex = columns.findIndex(([key]) => key === 'materialWidth');
  assert.equal(text(cells(rendered[0])[typeIndex]), 'SPHC');
  assert.equal(text(cells(rendered[0])[widthIndex]), '93,5');
  assert.equal(text(cells(rendered[1])[typeIndex]), '—');
  assert.equal(text(cells(rendered[1])[widthIndex]), '—');
  assert.match(f.api.tableHead('purchase'), /Material type/);
  assert.match(f.api.tableHead('purchase'), /Lebar \(mm\)/);
  assert.match(rendered[0], /FG01.*BOM01/);
});

test('only groups with data appear and unexpected classification never drops a requirement', () => {
  const f = fixture();
  for (const [rows, expected] of [
    [[row('MATERIAL', 'MAT')], ['MATERIAL']],
    [[row('PURCHASE_PART', 'PART')], ['PURCHASE_PART']],
    [[row(null, 'UNKNOWN'), row('NEW_ENUM', 'UNKNOWN-2')], ['UNCLASSIFIED']]
  ]) {
    f.api.update(state(source(rows)));
    assert.deepEqual(tokens(html(f)), expected);
    assert.equal(dataRows(html(f)).length, rows.length);
  }
});

test('search matches material grade, numeric width and group labels without filtering the other tables', () => {
  const f = fixture(), data = source([
    row('PURCHASE_PART', 'PART'),
    row('MATERIAL', 'MAT-SPHC', { materialType: 'SPHC', materialWidth: 93.5 }),
    row('MATERIAL', 'MAT-SPCC', { materialType: 'SPCC', materialWidth: 150 })
  ]);
  f.api.update(state(data));
  for (const term of [' sphc ', '93.5', '93,5']) {
    search(f, term);
    assert.deepEqual(tokens(html(f)), ['MATERIAL']);
    assert.equal(dataRows(html(f)).length, 1);
    assert.match(html(f), /MAT-SPHC/);
    assert.doesNotMatch(html(f), /MAT-SPCC/);
    assert.match(f.node('prep-purchase-count').textContent, /1 baris.*1 \/ 1/);
  }
  search(f, 'Purchase Part');
  assert.deepEqual(tokens(html(f)), ['PURCHASE_PART']);
  assert.equal(dataRows(html(f)).length, 1);
  search(f, 'Material');
  assert.deepEqual(tokens(html(f)), ['MATERIAL']);
  assert.equal(dataRows(html(f)).length, 2);
  assert.match(f.node('prep-vendor-body').innerHTML, /VENDOR-000/);
  assert.match(f.node('prep-vendor-count').textContent, /61 baris.*1 \/ 2/);
  search(f, 'no-match');
  assert.deepEqual(tokens(html(f)), []);
  assert.match(html(f), /Tidak ada baris sesuai jadwal\/filter/);
});

test('legacy purchase rows can be found using their visible unclassified label without changing vendor search', () => {
  const f = fixture(), legacy = row(undefined, 'LEGACY');
  delete legacy.purchaseGroup;
  f.api.update(state(source([legacy])));
  search(f, 'Belum diklasifikasikan');
  assert.deepEqual(tokens(html(f)), ['UNCLASSIFIED']);
  assert.match(html(f), /DRAW-LEGACY/);
  assert.deepEqual(f.api.filterRows([{partCode:'VENDOR'}], 'Belum diklasifikasikan', 'vendor'), []);
});

test('50-data-row pagination sorts before slicing and repeats a continuing group header', () => {
  const f = fixture(), parts = Array.from({ length: 60 }, (_, index) => row('PURCHASE_PART', 'PART-' + String(index).padStart(3, '0')));
  const materials = Array.from({ length: 5 }, (_, index) => row('MATERIAL', 'MAT-' + index, { materialType: 'SPHC', materialWidth: index + 100 }));
  const rows = [materials[0], ...parts.slice(0, 30), row('UNCLASSIFIED', 'UNKNOWN-A'), ...materials.slice(1), ...parts.slice(30), row('UNCLASSIFIED', 'UNKNOWN-B')];
  f.api.update(state(source(rows)));
  assert.equal(dataRows(html(f)).length, 50);
  assert.deepEqual(tokens(html(f)), ['PURCHASE_PART']);
  assert.match(f.node('prep-purchase-count').textContent, /67 baris.*1 \/ 2/);
  assert.doesNotMatch(html(f), /MAT-0|UNKNOWN-A/);
  const firstPage = dataRows(html(f)).map(text);
  f.node('prep-purchase-next').click();
  assert.equal(dataRows(html(f)).length, 17);
  assert.deepEqual(tokens(html(f)), ['PURCHASE_PART', 'MATERIAL', 'UNCLASSIFIED']);
  assert.match(f.node('prep-purchase-count').textContent, /67 baris.*2 \/ 2/);
  assert.equal(f.node('prep-purchase-next').disabled, true);
  const allText = firstPage.concat(dataRows(html(f)).map(text));
  assert.equal(new Set(allText).size, rows.length, 'every source row is shown exactly once across pages');
  assert.match(f.node('prep-vendor-count').textContent, /61 baris.*1 \/ 2/);
  f.node('prep-vendor-next').click();
  assert.match(f.node('prep-vendor-count').textContent, /61 baris.*2 \/ 2/);
  assert.match(f.node('prep-purchase-count').textContent, /67 baris.*2 \/ 2/);
});

test('collapse is presentation only, survives recalculation and does not turn hidden data into an empty result', () => {
  const f = fixture(), data = source([row('PURCHASE_PART', 'PART'), row('MATERIAL', 'MAT', { materialType: 'SPHC', materialWidth: 120 })]);
  f.api.update(state(data));
  toggle(f, 'MATERIAL');
  assert.match(groupRows(html(f))[1], /aria-expanded="false"/);
  assert.doesNotMatch(html(f), /DRAW-MAT/);
  assert.match(html(f), /DRAW-PART/);
  assert.match(f.node('prep-purchase-count').textContent, /2 baris/);
  f.api.update(state(structuredClone(data), { dirty: true }));
  assert.match(groupRows(html(f))[1], /aria-expanded="false"/);
  assert.doesNotMatch(html(f), /DRAW-MAT/);
  toggle(f, 'PURCHASE_PART');
  assert.equal(dataRows(html(f)).length, 0);
  assert.equal(groupRows(html(f)).length, 2);
  assert.doesNotMatch(html(f), /Tidak ada baris/);
  search(f, 'SPHC');
  assert.deepEqual(tokens(html(f)), ['MATERIAL']);
  assert.doesNotMatch(html(f), /Tidak ada baris/);
  assert.match(html(f), /DRAW-MAT/, 'a new search reveals matching rows');
  toggle(f, 'MATERIAL');
  assert.doesNotMatch(html(f), /DRAW-MAT/);
  f.api.update(state(structuredClone(data), { dirty: true }));
  assert.doesNotMatch(html(f), /DRAW-MAT/, 'explicit collapse during a search survives recalculation');
  toggle(f, 'MATERIAL');
  assert.match(html(f), /DRAW-MAT/);
  assert.equal(f.node('prep-purchase-search').value, 'SPHC');
  assert.deepEqual(data.derived.purchase.rows.map(item => item.requiredQty), [100, 100]);
});

test('stale and failed snapshots hide group headings as well as purchase data until a valid refresh', () => {
  const f = fixture(), data = source([row('MATERIAL', 'STALE', { materialType: 'SPHC', materialWidth: 120 })]);
  f.api.update(state(data));
  toggle(f, 'MATERIAL');
  for (const transition of [{ loading: true }, { error: 'Unavailable' }, { snapshot: null }]) {
    f.api.update(state(data, transition));
    assert.deepEqual(tokens(html(f)), []);
    assert.doesNotMatch(html(f), /DRAW-STALE|SPHC/);
    assert.equal(f.node('prep-purchase-search').disabled, true);
    f.api.update(state(structuredClone(data)));
    assert.match(groupRows(html(f))[0], /aria-expanded="false"/, 'refresh must preserve explicit collapse');
  }
  const failed = structuredClone(data);
  Object.assign(failed.derived.purchase, { sourceError: true, status: 'ERROR', warnings: ['Master unavailable'] });
  f.api.update(state(failed));
  assert.deepEqual(tokens(html(f)), []);
  assert.match(html(f), /Hasil belum terverifikasi/);
  assert.doesNotMatch(html(f), /SPHC/);
});

test('material metadata and unexpected group identifiers are escaped rather than inserted as markup', () => {
  const f = fixture(), attack = '<img src=x onerror="alert(1)">';
  f.api.update(state(source([row(attack, 'PART', { partName: attack, materialType: attack, materialWidth: attack })])));
  assert.deepEqual(tokens(html(f)), ['UNCLASSIFIED']);
  assert.match(html(f), /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html(f), /<img\b|<script\b|<input\b|contenteditable=/i);
  const widthIndex = f.api.columns.purchase.findIndex(([key]) => key === 'materialWidth');
  assert.equal(text(cells(dataRows(html(f))[0])[widthIndex]), '—');
});
