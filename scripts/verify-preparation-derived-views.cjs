'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ejs = require('ejs');
const vm = require('node:vm');
const { modules, getModule } = require('../src/moduleRegistry');
const modulePath = require.resolve('../public/js/ppic-preparation-derived');
const matrix = require('../public/js/ppic-preparation-capacity-matrix');
const views = ['capacity', 'purchase', 'vendor'];

function fixture() {
  delete require.cache[modulePath];
  const api = require(modulePath), nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, hidden: false,
      handlers: {}, attrs: {}, clicks: 0,
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this.attrs[name] = value; },
      click() { this.clicks++; this.handlers.click?.(); }
    });
    return nodes.get(id);
  };
  api.mount({ getElementById: node });
  return { api, node, nodes };
}

function snapshot(suffix = 'A') {
  const machineKey='machine-' + suffix, machineCode='PRESS-' + suffix;
  return { derived: {
    capacity: { basis: 'Master Working Hour', rows: [{ machineKey, date: '2026-09-01', machineCode, availableHours: 8, loadHours: 1, remainingHours: 7, utilizationPct: 12.5, overloadHours: 0, status: 'READY', issues: [] }], machineChildren: [{ machineKey, machineCode, sourceRowId: 'source-' + suffix, partCode: 'WIP-' + suffix, partNumber: 'DRAW-' + suffix, processCode: 'CUT', parentPartCode: 'FG-' + suffix, uomCode: 'PCS', days: { '2026-09-01': { quantity: 10, loadHours: 1, issues: [] } }, unallocatedQty: 0, issues: [] }], warnings: [] },
    purchase: { basis: 'BOM demand from tab 02', rows: [{ needDate: '2026-09-02', orderDate: '2026-08-30', partCode: 'RM-' + suffix, partNumber: 'RM-DRAW-' + suffix, partName: 'Plate', uomCode: 'KG', supplierCode: 'S-' + suffix, requiredQty: 15, recommendedQty: 20, price: null, status: 'INCOMPLETE', issues: ['Harga belum tersedia'], sourceFgCodes: ['FG-' + suffix], bomNumbers: ['BOM-' + suffix] }], warnings: [] },
    vendor: { basis: 'BOM lead time only', rows: [{ dispatchDate: '2026-09-02', receiptDate: '2026-09-04', vendorCode: 'V-' + suffix, partCode: 'WIP-' + suffix, partNumber: 'DRAW-' + suffix, partName: 'Bracket', processCode: 'PLATING', leadTimeValue: 5, leadTimeUnit: 'DAY', quantity: 12, status: 'PLANNED', issues: [], parentPartCode: 'FG-' + suffix, bomNumber: 'BOM-' + suffix }], warnings: [] }
  } };
}
const state = (data, extra = {}) => ({ month: '2026-09', name: 'Scenario September', dirty: false, loading: false, error: '', snapshot: data, ...extra });
const body = (f, view) => f.node('prep-' + view + '-body').innerHTML;
const toggleMachine = (f, key) => {
  const button = { dataset: { capacityToggle: key }, getAttribute: name => name === 'aria-expanded' ? body(f, 'capacity').match(new RegExp('data-capacity-toggle="' + key + '" aria-expanded="([^"]+)"'))?.[1] : null };
  f.node('prep-capacity-body').handlers.click({ target: { closest: () => button } });
};
test('locking keeps frozen capacity, purchase and vendor visible while stopping BOM refresh and capacity edit',()=>{
  const f=fixture(),data=snapshot('FROZEN');f.api.update(state(data));f.api.update(state(data,{locked:true}));
  for(const view of views){assert.match(body(f,view),/FROZEN/);assert.match(f.node('prep-'+view+'-scenario').textContent,/LOCKED/);assert.equal(f.node('prep-'+view+'-search').disabled,false);}
  assert.equal(f.node('prep-capacity-refresh').disabled,true);
  f.node('prep-capacity-body').handlers.click({target:{closest:()=>({dataset:{capacityEdit:'machine',capacityId:'machine-FROZEN',capacityDate:'2026-09-01'}})}});
});

test('all three derived tables are populated together from the same latest tab 02 snapshot', () => {
  const f = fixture(), data = snapshot('BEFORE'), original = structuredClone(data);
  f.api.update(state(data));
  for (const view of views) {
    assert.match(body(f, view), /BEFORE/);
    assert.match(f.node('prep-' + view + '-scenario').textContent, /2026-09.*Scenario September.*Draft tab 02/);
    assert.match(f.node('prep-' + view + '-status').textContent, /Otomatis dari tab 02/);
    assert.equal(f.node('prep-' + view + '-search').disabled, false);
  }
  assert.deepEqual(data, original, 'rendering must not mutate the authoritative allocation snapshot');
  f.api.update(state(snapshot('AFTER'), { name: 'Unsaved <draft>', dirty: true }));
  for (const view of views) {
    assert.doesNotMatch(body(f, view), /BEFORE/);
    assert.match(body(f, view), /AFTER/);
    assert.match(f.node('prep-' + view + '-scenario').textContent, /Unsaved <draft>.*belum disimpan/);
  }
});

test('pending recalculation, errors, missing snapshot and missing derived result clear every stale table', () => {
  const f = fixture();
  for (const transition of [
    { loading: true, expected: /Menghitung ulang/, busy: 'true' },
    { error: 'BOM <unavailable>', expected: /BOM &lt;unavailable&gt;/, busy: 'false' },
    { snapshot: null, expected: /Worksheet Schedule/, busy: 'false' },
    { snapshot: {}, expected: /Hasil turunan belum tersedia/, busy: 'false' }
  ]) {
    f.api.update(state(snapshot('STALE')));
    f.api.update(state(snapshot('STALE'), transition));
    for (const view of views) {
      assert.doesNotMatch(body(f, view), /STALE/);
      assert.match(body(f, view), transition.expected);
      assert.equal(f.node('prep-' + view + '-panel').attrs['aria-busy'], transition.busy);
      assert.equal(f.node('prep-' + view + '-basis').textContent, '');
      assert.equal(f.node('prep-' + view + '-count').textContent, '');
      assert.equal(f.node('prep-' + view + '-search').disabled, true);
      assert.equal(f.node('prep-' + view + '-prev').disabled, true);
      assert.equal(f.node('prep-' + view + '-next').disabled, true);
      assert.equal(f.node('prep-' + view + '-warnings').innerHTML, '');
    }
    assert.equal(f.node('prep-capacity-expand').disabled, true);
    assert.equal(f.node('prep-capacity-collapse').disabled, true);
  }
  f.api.update(state(null, { month: '2026-02', loading: true }));
  assert.match(f.node('prep-capacity-head').innerHTML, /2026-02-28/);
  assert.doesNotMatch(f.node('prep-capacity-head').innerHTML, /2026-09|2026-02-29/);
  assert.match(body(f, 'capacity'), /colspan="32"/);
});

test('capacity cycle time refreshes with the latest tab 02 snapshot and clears while recalculating', () => {
  const f = fixture(), data = snapshot('CT');
  data.derived.capacity.machineChildren[0].cycleTimeSeconds = 12.5;
  const cycleCell = () => {
    const row = body(f, 'capacity').match(/<tr class="prep-capacity-child"[\s\S]*?<\/tr>/)?.[0] || '';
    return (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/g) || [])[2]?.replace(/<[^>]+>/g, '').trim();
  };
  f.api.update(state(data));
  toggleMachine(f, 'machine-CT');
  assert.equal(cycleCell(), '12,5');
  const changed = structuredClone(data);
  changed.derived.capacity.machineChildren[0].cycleTimeSeconds = 25.75;
  f.api.update(state(changed, { dirty: true }));
  assert.equal(cycleCell(), '25,75', 'machine stays expanded and displays the fresh per-process cycle time');
  f.api.update(state(changed, { loading: true }));
  assert.equal(cycleCell(), undefined, 'stale cycle time is removed with old capacity rows');
  assert.match(body(f, 'capacity'), /colspan="34"/);
  f.api.update(state(data));
  assert.equal(cycleCell(), '12,5', 'restored source is reflected without manual refresh');
});

test('machine utilization colors update live and restore after Undo while child rows stay expanded', () => {
  const f = fixture(), original = snapshot('LIVE'), edited = structuredClone(original);
  const dailyCell = () => {
    const row = body(f, 'capacity').match(/<tr class="prep-capacity-machine"[\s\S]*?<\/tr>/)?.[0] || '';
    return (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/g) || [])[3] || '';
  };
  f.api.update(state(original));
  toggleMachine(f, 'machine-LIVE');
  assert.match(dailyCell(), /utilization-low[^>]*><strong>12,5%<\/strong><\/td>/);
  Object.assign(edited.derived.capacity.rows[0], { loadHours: 8, remainingHours: 0, utilizationPct: 100 });
  f.api.update(state(edited, { loading: true, dirty: true }));
  assert.equal(dailyCell(), '', 'old machine utilization cannot remain visible during recalculation');
  f.api.update(state(edited, { dirty: true }));
  assert.match(dailyCell(), /utilization-high[^>]*><strong>100%<\/strong><\/td>/);
  assert.match(body(f, 'capacity'), /data-capacity-child="source-LIVE"/);
  f.api.update(state(original));
  assert.match(dailyCell(), /utilization-low[^>]*><strong>12,5%<\/strong><\/td>/);
  assert.match(body(f, 'capacity'), /data-capacity-child="source-LIVE"/);
  assert.match(body(f, 'purchase'), /RM-LIVE/);
  assert.match(body(f, 'vendor'), /V-LIVE/);
});

test('columns retain part numbers, calendar dates, BOM lineage and separate machine/purchase/vendor meaning', () => {
  const f = fixture(), data = snapshot();
  for (const view of ['purchase', 'vendor']) assert.match(f.api.tableHead(view), /Part Number/);
  f.api.update(state(data));
  assert.match(f.node('prep-capacity-head').innerHTML, /Mesin \/ Child Part.*Proses \/ FG sumber.*2026-09-01.*2026-09-30.*Total bulan/);
  assert.doesNotMatch(body(f, 'capacity'), /DRAW-A/);
  toggleMachine(f, 'machine-A');
  assert.match(body(f, 'capacity'), /WIP-A.*DRAW-A.*CUT.*FG-A/);
  assert.match(f.api.tableHead('purchase'), /Tanggal perlu.*Pesan paling lambat/);
  assert.match(f.api.tableHead('purchase'), /Mata uang.*Satuan harga.*Lead time \(hari\)/);
  assert.match(f.api.tableHead('vendor'), /Qty.*Satuan/);
  assert.match(f.api.tableHead('vendor'), /prep-derived-out.*▲ Keluar ke vendor.*prep-derived-in.*▼ Masuk kembali/);
  assert.match(f.api.tableRows('vendor', data.derived.vendor.rows), /2026-09-02.*2026-09-04.*5 hari.*FG-A.*BOM-A/);
  assert.equal(f.api.cellValue({ leadTimeValue: 0, leadTimeUnit: 'HOUR' }, 'leadTime'), '0 jam');
  assert.equal(f.api.cellValue({ leadTimeValue: null, leadTimeUnit: 'HOUR' }, 'leadTime'), '—');
  assert.equal(f.api.cellValue({ partNumbers: ['DRAW-A', 'DRAW-B'] }, 'partNumbers'), 'DRAW-A, DRAW-B');
});

test('a purchase source failure is explicit and cannot be mistaken for zero need or hide the other projections', () => {
  const f=fixture(), data=snapshot('GOOD');
  data.derived.purchase={rows:[],sourceError:true,status:'ERROR',warnings:['Sumber <purchase> gagal dibaca'],basis:'Nilai kosong bukan kebutuhan nol.'};
  f.api.update(state(data));
  assert.match(body(f,'purchase'), /Hasil belum terverifikasi.*Sumber &lt;purchase&gt; gagal dibaca/);
  assert.match(f.node('prep-purchase-status').textContent, /belum terverifikasi/);
  assert.equal(f.node('prep-purchase-count').textContent, '');
  assert.equal(f.node('prep-purchase-search').disabled, true);
  assert.match(f.node('prep-purchase-basis').textContent, /bukan kebutuhan nol/);
  assert.match(body(f,'capacity'), /PRESS-GOOD/); assert.match(body(f,'vendor'), /V-GOOD/);
});

test('unknown numeric sources remain unknown, while actual zero is rendered as zero', () => {
  const f = fixture();
  const html = matrix.machineCell({ availableHours: null, loadHours: 0, remainingHours: '', utilizationPct: undefined, overloadHours: Number.NaN });
  assert.match(html, /utilization-unknown[\s\S]*<strong>—<\/strong><\/td>/);
  assert.match(html, /Beban: 0 jam · Tersedia: — jam/);
  assert.doesNotMatch(html, /—%|utilization-low/);
  assert.match(html, /Sisa: — jam/);
  assert.deepEqual(f.api.filterRows([{ loadHours: 0 }, { loadHours: null }], '0'), [{ loadHours: 0 }]);
});

test('tables, warnings, unknown statuses and attribute titles escape server data and contain no editable controls', () => {
  const f = fixture(), attack = '<img src=x onerror="alert(1)">', data = snapshot();
  for (const view of views) {
    for (const [key] of f.api.columns[view]) data.derived[view].rows[0][key] = attack;
    data.derived[view].warnings = [attack];
  }
  data.derived.capacity.rows[0].date = '2026-09-01';
  Object.assign(data.derived.capacity.machineChildren[0], { machineCode: attack, partCode: attack, partNumber: attack, partName: attack, processCode: attack, parentPartCode: attack, bomNumber: attack, uomCode: attack, issues: [attack] });
  f.api.update(state(data));
  toggleMachine(f, 'machine-A');
  for (const view of views) {
    const html = body(f, view) + f.node('prep-' + view + '-warnings').innerHTML;
    assert.doesNotMatch(html, /<img|<script|<input|<select|<textarea|contenteditable=/i);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.match(html, view === 'capacity' ? /prep-capacity-machine-value utilization-unknown/ : /prep-derived-badge ATTENTION/);
    assert.doesNotMatch(html, /class="[^"]*<img/);
  }
});

test('capacity paginates by 10 machines, searches child metadata independently and clamps on recalculation', () => {
  const f = fixture(), data = snapshot();
  data.derived.capacity.rows = Array.from({ length: 21 }, (_, index) => ({ machineKey: 'mc-' + index, machineCode: 'MC-' + String(index).padStart(3, '0'), date: '2026-09-01', loadHours: 1, availableHours: 8 }));
  data.derived.capacity.machineChildren = data.derived.capacity.rows.map((row,index) => ({ ...row, sourceRowId: 'src-' + index, partCode: 'WIP-' + index, partNumber: 'UNIQUE-DRAW-' + index, days: { '2026-09-01': { quantity: 5, loadHours: 1 } } }));
  f.api.update(state(data));
  assert.equal((body(f, 'capacity').match(/class="prep-capacity-machine"/g) || []).length, 10);
  assert.match(f.node('prep-capacity-count').textContent, /21 mesin.*1 \/ 3/);
  f.node('prep-capacity-next').click();
  assert.match(f.node('prep-capacity-count').textContent, /2 \/ 3/);
  assert.match(body(f, 'capacity'), /MC-010/);
  assert.doesNotMatch(body(f, 'capacity'), /MC-000/);
  f.node('prep-capacity-next').click();
  assert.equal((body(f, 'capacity').match(/class="prep-capacity-machine"/g) || []).length, 1);
  assert.equal(f.node('prep-capacity-next').disabled, true);
  f.node('prep-capacity-search').value = 'UNIQUE-DRAW-19';
  f.node('prep-capacity-search').handlers.input();
  assert.match(f.node('prep-capacity-count').textContent, /1 mesin.*1 \/ 1/);
  assert.match(body(f, 'capacity'), /MC-019/);
  assert.match(body(f, 'capacity'), /UNIQUE-DRAW-19/);
  assert.match(f.node('prep-capacity-head').innerHTML, /2026-09-01.*2026-09-30/);
  assert.match(body(f, 'purchase'), /RM-A/);
  assert.match(body(f, 'vendor'), /V-A/);
  f.node('prep-capacity-search').value = '';
  f.node('prep-capacity-search').handlers.input();
  f.node('prep-capacity-next').click();
  f.api.update(state(snapshot('SMALL')));
  assert.match(f.node('prep-capacity-count').textContent, /1 mesin.*1 \/ 1/);
  assert.match(body(f, 'capacity'), /PRESS-SMALL/);
  assert.equal(f.node('prep-capacity-prev').disabled, true);
});

test('purchase and vendor tables retain independent 50-row pagination', () => {
  const f=fixture(), data=snapshot();
  for(const view of ['purchase','vendor']) data.derived[view].rows=Array.from({length:101},(_,index)=>({...data.derived[view].rows[0],partCode:'ROW-'+String(index).padStart(3,'0')}));
  f.api.update(state(data));
  for(const view of ['purchase','vendor']){
    assert.equal((body(f,view).match(/<tr>/g)||[]).length,50);
    assert.match(f.node('prep-'+view+'-count').textContent,/101 baris.*1 \/ 3/);
    f.node('prep-'+view+'-next').click();
    assert.match(body(f,view),/ROW-050/);
    assert.doesNotMatch(body(f,view),/ROW-000/);
  }
  assert.match(body(f,'capacity'),/PRESS-A/);
});

test('machine expand and collapse state survives recalculation and both controls work without clearing search', () => {
  const f=fixture(), data=snapshot();
  f.api.update(state(data));
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child=/);
  toggleMachine(f,'machine-A');
  assert.match(body(f,'capacity'),/data-capacity-child="source-A"/);
  f.api.update(state(structuredClone(data),{dirty:true}));
  assert.match(body(f,'capacity'),/data-capacity-child="source-A"/);
  f.api.update(state(null,{loading:true,dirty:true}));
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child=/);
  f.api.update(state(structuredClone(data),{dirty:true}));
  assert.match(body(f,'capacity'),/data-capacity-child="source-A"/);
  f.node('prep-capacity-search').value='DRAW-A';
  f.node('prep-capacity-search').handlers.input();
  assert.match(body(f,'capacity'),/data-capacity-child="source-A"/);
  f.node('prep-capacity-collapse').click();
  assert.equal(f.node('prep-capacity-search').value,'DRAW-A');
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child=/);
  assert.match(body(f,'capacity'),/PRESS-A/);
  f.api.update(state(structuredClone(data),{dirty:true}));
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child=/,'recalculation must respect an explicit collapse even during search');
  f.node('prep-capacity-expand').click();
  assert.equal(f.node('prep-capacity-search').value,'DRAW-A');
  assert.match(body(f,'capacity'),/data-capacity-child="source-A"/);
  toggleMachine(f,'machine-A');
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child=/,'individual collapse must also work on an auto-expanded search result');
  toggleMachine(f,'machine-A');
  assert.match(body(f,'capacity'),/data-capacity-child="source-A"/);
});

test('matching child search opens an untouched machine and does not expose unrelated child occurrences', () => {
  const f=fixture(),data=snapshot();
  data.derived.capacity.machineChildren.push({...data.derived.capacity.machineChildren[0],sourceRowId:'source-B',partNumber:'DRAW-B',partCode:'WIP-B'});
  f.api.update(state(data));
  f.node('prep-capacity-search').value='DRAW-B';
  f.node('prep-capacity-search').handlers.input();
  assert.match(body(f,'capacity'),/data-capacity-child="source-B"/);
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child="source-A"/);
  assert.match(body(f,'capacity'),/Beban: 1 jam · Tersedia: 8 jam[\s\S]*<strong>12,5%<\/strong>/,'filter must show full source machine utilization, not recompute load from visible child rows');
  f.node('prep-capacity-collapse').click();
  assert.equal(f.node('prep-capacity-search').value,'DRAW-B');
  assert.doesNotMatch(body(f,'capacity'),/data-capacity-child=/);
});

test('empty results never assert readiness or fulfillment and retain blockers/unscheduled work', () => {
  const f = fixture(), data = snapshot();
  for (const view of views) data.derived[view].rows = [];
  data.derived.capacity.machineChildren = [];
  data.derived.capacity.unallocatedRows = [{ partCode: 'WIP-BLOCKED', partNumber: 'DRAW-BLOCKED', processCode: 'CUT', quantity: 20, issues: ['Cycle time belum diisi'] }];
  data.derived.purchase.warnings = ['Supplier belum ditemukan'];
  f.api.update(state(data));
  for (const view of views) assert.match(body(f, view), /sebelum menyimpulkan kebutuhan sudah terpenuhi/);
  assert.match(f.node('prep-capacity-warnings').innerHTML, /WIP-BLOCKED.*DRAW-BLOCKED.*20 qty belum terjadwal.*Cycle time/);
  assert.equal(f.node('prep-capacity-notes').hidden, false);
  assert.match(f.node('prep-capacity-notes-count').textContent, /1/);
  assert.match(f.node('prep-purchase-warnings').innerHTML, /Supplier belum ditemukan/);
  assert.equal(f.node('prep-vendor-notes').hidden, true);
});

test('back controls open the existing workbook tab without creating or mutating a workbook', () => {
  const f = fixture(), data = snapshot(), original = structuredClone(data);
  f.api.update(state(data, { dirty: true }));
  for (const view of views) f.node('prep-' + view + '-back').click();
  assert.equal(f.node('prep-page-workbook').clicks, 3);
  assert.deepEqual(data, original);
});

test('controller publishes a result only for the current workbook signature, including edits, Undo and source changes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/ppic-preparation.js'), 'utf8');
  const declaration = source.match(/^\s*const derived=\(\)=>[^\r\n]+/m)?.[0];
  assert.ok(declaration, 'shared derived snapshot publisher must exist');
  const T = require('../public/js/ppic-preparation-tree'), frames = [], bomUpdates = [];
  const original = { month: '2026-09', name: 'Initial draft', delivery: [{ id: 'FG', partCode: 'FG', days: { '2026-09-10': 10 } }], production: [], material: [], allocationSettings: { plannedDowntimeHoursPerDay: 0, postProcessGapHours: 0 }, processAllocations: {} };
  const context = vm.createContext({confirmationFeedback:null, locked:()=>false, workbook: structuredClone(original), busy: false, dirty: false, treeLoading: false, treeError: '', tree: snapshot('ORIGINAL'), treeKey: T.signature(original), T, bomSync: { update: () => bomUpdates.push(true) }, window: { PrepDerivedViews: { update: value => frames.push(value) } } });
  vm.runInContext(declaration + '\nglobalThis.publish = derived;', context);
  context.publish();
  assert.equal(frames.at(-1).snapshot, context.tree);
  context.workbook.delivery[0].days['2026-09-10'] = 30;
  context.dirty = true;
  context.publish();
  assert.equal(frames.at(-1).snapshot, null, 'direct quantity edit must immediately invalidate all three old tables');
  context.treeLoading = true;
  context.publish();
  assert.equal(frames.at(-1).loading, true);
  assert.equal(frames.at(-1).snapshot, null);
  context.tree = snapshot('EDITED');
  context.treeKey = T.signature(context.workbook);
  context.treeLoading = false;
  context.publish();
  assert.equal(frames.at(-1).snapshot, context.tree);
  context.workbook = structuredClone(original);
  context.publish();
  assert.equal(frames.at(-1).snapshot, null, 'Undo must not reuse the just-edited allocation result');
  context.tree = snapshot('UNDONE');
  context.treeKey = T.signature(context.workbook);
  context.publish();
  assert.match(frames.at(-1).snapshot.derived.capacity.rows[0].machineCode, /UNDONE/);
  context.workbook.month = '2026-10';
  context.workbook.name = 'October <draft>';
  context.publish();
  assert.equal(frames.at(-1).snapshot, null);
  assert.equal(frames.at(-1).month, '2026-10');
  assert.equal(frames.at(-1).name, 'October <draft>');
  context.treeError = 'Latest source failed';
  context.publish();
  assert.equal(frames.at(-1).error, 'Latest source failed');
  assert.equal(frames.at(-1).snapshot, null);
  assert.equal(bomUpdates.length,frames.length,'Every published state refreshes BOM change controls too');
});

test('controller keeps asynchronous request guards and restores a workbook without retaining old derived results', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/ppic-preparation.js'), 'utf8');
  const refresh = source.slice(source.indexOf('async function refreshTree('), source.indexOf('function queueTree()'));
  assert.match(refresh, /request=\+\+treeRequest/);
  assert.match(refresh, /if\(request!==treeRequest\|\|key!==T\.signature\(workbook\)\)return;\s*tree=payload;treeKey=key;/);
  assert.match(refresh, /finally\{if\(request===treeRequest&&!unchanged\)/);
  for (const name of ['replaceWorkbook', 'undo']) {
    const line = source.split(/\r?\n/).find(value => value.includes('async function ' + name + '('));
    assert.match(line, /treeRequest\+\+/);
    assert.match(line, /tree=null;treeKey=''/);
    assert.ok(line.indexOf("treeKey=''") < line.indexOf('await renderSheet()'), name + ' must clear previous output before rendering');
    assert.match(line, /await refreshTree\(\)/);
  }
  for (const [start, end] of [['function controls()', 'async function action('], ['function summaries()', 'function ']]) {
    const after = source.slice(source.indexOf(start) + start.length);
    const body = after.slice(0, after.indexOf(end));
    assert.match(body, /derived\(\)/, start + ' publishes current source metadata/status');
  }
  const lazy = source.slice(source.indexOf("window.addEventListener('prep:open-workbook'"));
  assert.match(lazy, /if\(workbookStarted\)\{[^\n]*return;\}/, 'switching 03/04/05 must not reload or discard the live workbook');
  assert.ok(lazy.indexOf('workbookStarted=true') < lazy.indexOf('await loadMonth(workbook.month)'));
});

test('Preparation template has eight unique accessible tabs and read-only derived table panels', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '../views/ppic/preparation.ejs'), {
    title: 'Derived views verification', module: getModule('planning-ppic'), modules, activeModule: 'planning-ppic',
    initialMonth: '2026-09', pageScript: '', requiresAuth: true, socketUrl: '', mqttUrl: ''
  });
  assert.equal((html.match(/data-lab-page=/g) || []).length, 8);
  for (const view of ['readiness', 'workbook', ...views, 'daily', 'delivery', 'kpi']) {
    assert.equal((html.match(new RegExp('id="prep-page-' + view + '"', 'g')) || []).length, 1);
    assert.equal((html.match(new RegExp('id="prep-' + view + '-panel"', 'g')) || []).length, 1);
    assert.match(html, new RegExp('id="prep-' + view + '-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="prep-page-' + view + '"'));
  }
  for (const view of views) {
    for (const suffix of ['scenario', 'status', 'basis', 'search', 'head', 'body', 'count', 'prev', 'next', 'back', 'warnings', 'notes', 'notes-count']) {
      assert.equal((html.match(new RegExp('id="prep-' + view + '-' + suffix + '"', 'g')) || []).length, 1, view + '-' + suffix);
    }
  }
  assert.equal((html.match(/src="\/js\/ppic-preparation-derived\.js/g) || []).length, 1);
  assert.equal((html.match(/src="\/js\/ppic-preparation-capacity-matrix\.js/g) || []).length, 1);
  for(const action of ['expand','collapse']) assert.equal((html.match(new RegExp('id="prep-capacity-'+action+'"','g'))||[]).length,1);
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage\.setItem|sessionStorage\.setItem/, 'derived tables must not create independent API reads or persist a competing workbook');
});
