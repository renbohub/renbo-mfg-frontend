'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const matrix = require('../public/js/ppic-preparation-capacity-matrix');

const month = '2026-09';
function source() {
  return {
    rows: matrix.dates(month).map(date => ({ machineKey: 'press-id', machineCode: 'PRESS-01', date, availableHours: 8, loadHours: date.endsWith('-01') ? 3 : 0, remainingHours: date.endsWith('-01') ? 5 : 8, utilizationPct: date.endsWith('-01') ? 37.5 : 0, overloadHours: 0, issues: [] })),
    machineChildren: [
      { machineKey: 'press-id', machineCode: 'PRESS-01', sourceRowId: 'occurrence-A', partCode: 'WIP-SAME', partNumber: 'DRAWING-1', partName: 'First occurrence', processCode: 'CUT', parentPartCode: 'FG-A', bomNumber: 'BOM-A', uomCode: 'PCS', unallocatedQty: 0, issues: [], days: Object.fromEntries(matrix.dates(month).map(date => [date, { quantity: date.endsWith('-01') ? 137 : 0, loadHours: date.endsWith('-01') ? 2 : 0, issues: [] }])) },
      { machineKey: 'press-id', machineCode: 'PRESS-01', sourceRowId: 'occurrence-B', partCode: 'WIP-SAME', partNumber: 'DRAWING-1', partName: 'Second occurrence', processCode: 'CUT', parentPartCode: 'FG-B', bomNumber: 'BOM-B', uomCode: 'KG', unallocatedQty: 0, issues: [], days: Object.fromEntries(matrix.dates(month).map(date => [date, { quantity: date.endsWith('-01') ? 263 : 0, loadHours: date.endsWith('-01') ? 1 : 0, issues: [] }])) }
    ]
  };
}
const machineRows = html => html.match(/<tr class="prep-capacity-machine"[\s\S]*?<\/tr>/g) || [];
const childRows = html => html.match(/<tr class="prep-capacity-child"[\s\S]*?<\/tr>/g) || [];
const cells = html => html.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/g) || [];
const visibleText = html => html.replace(/<[^>]+>/g, '').trim();

test('calendar is horizontal and retains all dates, including leap years and invalid-month safety', () => {
  assert.equal(matrix.dates('2026-09').length, 30);
  assert.equal(matrix.dates('2026-01').length, 31);
  assert.equal(matrix.dates('2026-02').length, 28);
  assert.equal(matrix.dates('2028-02').length, 29);
  for (const invalid of ['', null, '2026-13', '2026-00', '2026-9', '<script>']) assert.deepEqual(matrix.dates(invalid), []);
  const head = matrix.head(month);
  assert.match(head, /Mesin \/ Child Part.*Proses \/ FG sumber/);
  assert.equal((head.match(/scope="col"/g) || []).length, 34);
  assert.match(cells(head)[2], /class="prep-col-letter" aria-hidden="true">C<\/span><span class="prep-col-name">CT Actual BOM \(detik\/unit\)<\/span>/);
  assert.match(cells(head)[3], /title="2026-09-01">[\s\S]*?class="prep-col-letter" aria-hidden="true">D<\/span>/);
  assert.match(head, /title="2026-09-01">[\s\S]*?class="prep-col-name">01<\/span><small class="prep-capacity-weekday">Sel<\/small><\/th>/);
  assert.match(head, /title="2026-09-30">[\s\S]*?class="prep-col-name">30<\/span><small class="prep-capacity-weekday">Rab<\/small><\/th>/);
  assert.doesNotMatch(head, /2026-09-31|Tanggal<\/th>|Part Number<\/th>/);
});

test('one vertical row per stable machine groups daily hours but retains each child occurrence separately', () => {
  const data = source(), original = structuredClone(data);
  data.rows.push({ machineKey: 'press-other', machineCode: 'PRESS-00', date: '2026-09-03', loadHours: 0, availableHours: 0 });
  data.rows.push({ machineKey: 'out-of-month', machineCode: 'HIDDEN', date: '2026-08-31', loadHours: 99, availableHours: 1 });
  const groups = matrix.build(data, month);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.key), ['press-other', 'press-id']);
  const press = groups[1];
  assert.equal(Object.keys(press.days).length, 30);
  assert.equal(press.children.length, 2);
  assert.deepEqual(press.children.map(child => child.sourceRowId), ['occurrence-A', 'occurrence-B']);
  assert.equal(press.days['2026-09-01'].loadHours, 3);
  assert.deepEqual(data.machineChildren, original.machineChildren);
});

test('machine expansion displays child part numbers, operation and source FG without summing unlike quantities', () => {
  const groups = matrix.build(source(), month);
  const closed = matrix.rows(groups, month);
  assert.equal(machineRows(closed).length, 1);
  assert.equal(childRows(closed).length, 0);
  assert.match(closed, /data-capacity-toggle="press-id" aria-expanded="false"/);
  const open = matrix.rows(groups, month, new Set(['press-id']));
  assert.equal(machineRows(open).length, 1);
  assert.equal(childRows(open).length, 2);
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /data-capacity-child="occurrence-A"[\s\S]*?WIP-SAME[\s\S]*?DRAWING-1[\s\S]*?CUT[\s\S]*?FG-A[\s\S]*?137 <small>PCS/);
  assert.match(open, /data-capacity-child="occurrence-B"[\s\S]*?FG-B[\s\S]*?263 <small>KG/);
  assert.match(machineRows(open)[0], /utilization-low[^>]*title="[^\"]*Beban: 3 jam · Tersedia: 8 jam[^>]*><strong>37,5%<\/strong><\/td>/);
  assert.equal(visibleText(cells(machineRows(open)[0]).at(-1)), '1,25%');
  assert.doesNotMatch(machineRows(open)[0], /137|263|400|PCS|KG/);
  for (const row of [...machineRows(open), ...childRows(open)]) assert.equal((row.match(/<t[dh]\b/g) || []).length, 34);
});

test('cycle time is read-only per child occurrence in seconds per unit, never a machine total', () => {
  const data = source();
  data.machineChildren[0].cycleTimeSeconds = 12.5;
  data.machineChildren[1].cycleTimeSeconds = 37.1256;
  const groups = matrix.build(data, month), before = structuredClone(data);
  assert.deepEqual(groups[0].children.map(child => child.cycleTimeSeconds), [12.5, 37.1256]);
  const html = matrix.rows(groups, month, new Set(['press-id']));
  assert.equal(visibleText(cells(machineRows(html)[0])[2]), '—', 'different process cycle times must not be summed or averaged on a machine');
  const children = childRows(html);
  assert.equal(visibleText(cells(children[0])[2]), '12,5');
  assert.equal(visibleText(cells(children[1])[2]), '37,126');
  assert.match(cells(children[0])[1], /CUT[\s\S]*FG-A/, 'cycle time follows operation / FG context');
  assert.match(cells(children[0])[3], /137 <small>PCS/, 'dates begin immediately after cycle time');
  assert.doesNotMatch(html, /<input\b|<select\b|contenteditable=/i);
  assert.deepEqual(data, before, 'displaying cycle time does not recalculate or mutate allocations');
  const filtered = matrix.rows(matrix.filter(groups, 'fg-b'), month, new Set(['press-id']));
  assert.equal(childRows(filtered).length, 1);
  assert.equal(visibleText(cells(childRows(filtered)[0])[2]), '37,126');
  assert.equal(visibleText(cells(machineRows(filtered)[0])[2]), '—');
});

test('missing and invalid cycle times remain unknown instead of displaying a zero or accepting markup', () => {
  for (const value of [null, undefined, '', ' ', 0, -1, NaN, Infinity, -Infinity, false, true, '0', '-2', 'unknown', '<img src=x onerror="x">']) {
    const data = source();
    data.machineChildren = [{ ...data.machineChildren[0], cycleTimeSeconds: value }];
    const html = matrix.rows(matrix.build(data, month), month, new Set(['press-id']));
    const cell = cells(childRows(html)[0])[2];
    assert.equal(visibleText(cell), '—', `invalid cycle time ${String(value)} remains unknown`);
    assert.doesNotMatch(cell, /<img\b|<script\b|<input\b|contenteditable=/i);
  }
  for (const [value, expected] of [[1, '1'], [0.125, '0,125'], ['2.5', '2,5']]) {
    const data = source();
    data.machineChildren = [{ ...data.machineChildren[0], cycleTimeSeconds: value }];
    const html = matrix.rows(matrix.build(data, month), month, new Set(['press-id']));
    assert.equal(visibleText(cells(childRows(html)[0])[2]), expected);
  }
});

test('search selects child occurrences but leaves all dates and complete machine capacity totals unchanged', () => {
  const data = source(), groups = matrix.build(data, month), original = structuredClone(groups);
  const filtered = matrix.filter(groups, ' fg-b ');
  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0].children.map(child => child.sourceRowId), ['occurrence-B']);
  assert.equal(filtered[0].filtered, true);
  assert.equal(filtered[0].days, groups[0].days, 'filter must retain complete machine load from every scheduled child');
  const html = matrix.rows(filtered, month, new Set(['press-id']));
  assert.equal(machineRows(html)[0].match(/prep-capacity-machine-value/g).length, 31);
  assert.equal(visibleText(cells(machineRows(html)[0]).at(-1)), '1,25%');
  assert.match(cells(machineRows(html)[0]).at(-1), /Beban: 3 jam · Tersedia: 240 jam/);
  assert.doesNotMatch(html, /data-capacity-child="occurrence-A"/);
  assert.match(html, /data-capacity-child="occurrence-B"/);
  assert.equal(matrix.filter(groups, 'press-01')[0].children.length, 2);
  assert.equal(matrix.filter(groups, 'drawing-1')[0].children.length, 2);
  assert.equal(matrix.filter(groups, 'BOM-A')[0].children.length, 1);
  assert.equal(matrix.filter(groups, '2026-09-30').length, 1);
  assert.deepEqual(matrix.filter(groups, 'not-found'), []);
  assert.deepEqual(groups, original);
});

test('stock-only zero-allocation rows do not imply a machine job, while pending and unknown rows remain inspectable', () => {
  const data = source(), base = data.machineChildren[0];
  const zeros = Object.fromEntries(matrix.dates(month).map(date => [date, { quantity: 0, loadHours: 0, issues: [] }]));
  data.machineChildren = [
    { ...base, sourceRowId: 'stock-only', days: zeros },
    { ...base, sourceRowId: 'pending', days: zeros, unallocatedQty: 7, issues: ['Belum dapat dijadwalkan'] },
    { ...base, sourceRowId: 'unknown', days: { ...zeros, '2026-09-10': { quantity: null, loadHours: null, issues: ['Sumber belum tersedia'] } } },
    { ...base, sourceRowId: 'outside-period', days: { '2026-08-31': { quantity: 5, loadHours: 1 } } }
  ];
  const groups = matrix.build(data, month);
  assert.deepEqual(groups[0].children.map(child => child.sourceRowId), ['pending', 'unknown']);
  const html = matrix.rows(groups, month, new Set(['press-id']));
  assert.match(html, /7 PCS belum teralokasi/);
  assert.match(html, /Belum dapat dijadwalkan/);
  assert.match(html, /Sumber belum tersedia/);
  assert.doesNotMatch(html, /stock-only|outside-period/);
});

test('unknown capacity and quantity never become zero, and missing monthly days keep totals unknown', () => {
  assert.match(matrix.machineCell({ availableHours: 0, loadHours: 0, remainingHours: 0, utilizationPct: 0, overloadHours: 0 }), /utilization-low[\s\S]*<strong>0%<\/strong><\/td>/);
  for (const unknown of [null, undefined, '', NaN, false]) {
    const machine = matrix.machineCell({ availableHours: unknown, loadHours: 0 });
    assert.match(machine, /utilization-unknown[\s\S]*Beban: 0 jam · Tersedia: — jam[\s\S]*<strong>—<\/strong><\/td>/);
    assert.doesNotMatch(machine, /utilization-low/);
    assert.match(matrix.childCell({ quantity: unknown, loadHours: unknown }, 'PCS'), /attention[\s\S]*<strong>— <small>PCS<\/small><\/strong><small>— jam/);
  }
  assert.match(matrix.machineCell({ availableHours: 8, loadHours: 10, overloadHours: 2, remainingHours: -2, utilizationPct: 125 }), /utilization-high[\s\S]*Over capacity: 2 jam[\s\S]*<strong>125%<\/strong><\/td>/);
  const data = source();
  data.rows = data.rows.slice(0, 1);
  data.machineChildren[0].days = { '2026-09-01': { quantity: 137, loadHours: 2 } };
  const html = matrix.rows(matrix.build(data, month), month, new Set(['press-id']));
  assert.equal(visibleText(cells(machineRows(html)[0]).at(-1)), '—');
  assert.match(cells(machineRows(html)[0]).at(-1), /utilization-unknown/);
  assert.match(childRows(html)[0], /<strong>— <small>PCS<\/small><\/strong><small>— jam/);
});

test('server identity, issue, UOM and attribute data is escaped on expansion and daily quantity edit controls', () => {
  const attack = '<img src=x onerror="x">\'&', data = source();
  data.rows.forEach(row => Object.assign(row, { machineKey: attack, machineCode: attack, issues: [attack] }));
  data.machineChildren.forEach(child => Object.assign(child, { machineKey: attack, sourceRowId: attack, partCode: attack, partNumber: attack, partName: attack, processCode: attack, parentPartCode: attack, bomNumber: attack, uomCode: attack, unallocatedQty: 1, issues: [attack] }));
  const html = matrix.rows(matrix.build(data, month), month, new Set([attack]));
  assert.doesNotMatch(html, /<img|<script|<input|<select|<textarea|contenteditable=/i);
  assert.match(html, /&lt;img src=x onerror=&quot;x&quot;&gt;&#39;&amp;/);
  assert.equal((html.match(/data-capacity-toggle=/g) || []).length, 1);
  assert.equal((html.match(/data-capacity-edit="quantity"/g) || []).length, 60);
  assert.doesNotMatch(html, /class="[^"]*<img/);
});

test('small or older source results retain explicit unknown hours without inventing child allocations', () => {
  const groups = matrix.build({ rows: [{ id: 'stable-machine:2026-09-01', date: '2026-09-01', machineCode: 'MC', availableHours: null, loadHours: null, issues: ['Sumber mesin belum terverifikasi'] }] }, month);
  assert.equal(groups[0].key, 'stable-machine');
  assert.deepEqual(groups[0].children, []);
  const html = matrix.rows(groups, month, new Set(['stable-machine']));
  assert.match(html, /Sumber mesin belum terverifikasi/);
  assert.doesNotMatch(html, /data-capacity-toggle=|prep-capacity-child"/);
  assert.match(html, /utilization-unknown[\s\S]*<strong>—<\/strong><\/td>/);
});

test('machine cells show only utilization with green below 80, yellow from 80 and red from 100', () => {
  const cases = [[0, 'low', '0%'], [37.5, 'low', '37,5%'], [79.999, 'low', '79,999%'], [80, 'medium', '80%'], [99.999, 'medium', '99,999%'], [100, 'high', '100%'], [125, 'high', '125%']];
  for (const [pct, color, expected] of cases) {
    const html = matrix.machineCell({ utilizationPct: pct, loadHours: pct / 100 * 8, availableHours: 8, remainingHours: 8 - pct / 100 * 8, overloadHours: Math.max(0, pct / 100 * 8 - 8), issues: [] });
    assert.match(html, new RegExp('class="prep-capacity-machine-value utilization-' + color + '"'));
    assert.equal(visibleText(html), expected, 'machine cell must not contain hours, fractions or warning symbols beside its utilization');
    assert.match(html, /title="[^\"]*Beban: [^\"]+ jam · Tersedia: 8 jam · Sisa:/);
    assert.doesNotMatch(html, /<small>/, 'hours stay available on hover, not as a second visible line');
  }
  for (const [pct, color, roundedBoundary] of [[79.9999, 'low', '80%'], [99.9999, 'medium', '100%']]) {
    const html = matrix.machineCell({ utilizationPct: pct, loadHours: pct / 100 * 8, availableHours: 8 });
    assert.match(html, new RegExp('utilization-' + color));
    assert.notEqual(visibleText(html), roundedBoundary, 'rounding cannot display a threshold from a different utilization color');
  }
});

test('missing or invalid utilization is neutral, with no implied zero or fabricated percentage', () => {
  for (const utilizationPct of [null, undefined, '', ' ', NaN, Infinity, -Infinity, false, true, -1, 'bad', '<img src=x>']) {
    const html = matrix.machineCell({ utilizationPct, loadHours: 4, availableHours: 8 });
    assert.equal(visibleText(html), '—', String(utilizationPct));
    assert.match(html, /utilization-unknown/);
    assert.match(html, /Beban: 4 jam · Tersedia: 8 jam/);
    assert.doesNotMatch(html, /utilization-low|<img/);
  }
  const absent = matrix.machineCell();
  assert.equal(visibleText(absent), '—');
  assert.match(absent, /utilization-unknown/);
});

test('work allocated without any available hours is explicit over capacity, never green or unknown', () => {
  const html = matrix.machineCell({ utilizationPct: null, loadHours: 2, availableHours: 0, remainingHours: -2, overloadHours: 2, issues: ['Jam tersedia nol'] });
  assert.match(html, /utilization-high/);
  assert.equal(visibleText(html), '&gt;100%');
  assert.match(html, /Beban: 2 jam · Tersedia: 0 jam.*Jam tersedia nol/);
});

test('known utilization colors are not overridden by blockers or hours from individual days', () => {
  const issue = 'Routing perlu diperiksa';
  for (const [utilizationPct, color] of [[25, 'low'], [80, 'medium'], [100, 'high']]) {
    const html = matrix.machineCell({ utilizationPct, loadHours: utilizationPct / 100 * 8, availableHours: 8, issues: [issue] });
    assert.match(html, new RegExp('utilization-' + color));
    assert.match(html, /Routing perlu diperiksa/);
    assert.equal(visibleText(html), utilizationPct + '%');
  }
  const data = source();
  Object.assign(data.rows[0], { loadHours: 10, remainingHours: -2, utilizationPct: 125, overloadHours: 2 });
  const html = machineRows(matrix.rows(matrix.build(data, month), month))[0], total = cells(html).at(-1);
  assert.match(cells(html)[3], /utilization-high/);
  assert.match(total, /utilization-low/, 'month color reflects 10 / 240 hours, not its one overloaded day');
  assert.match(total, /Beban: 10 jam · Tersedia: 240 jam.*Over capacity: 2 jam/);
  assert.equal(visibleText(total), '4,167%');
});
