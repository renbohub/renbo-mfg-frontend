const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const { modules, getModule } = require('../src/moduleRegistry');
const layout = fs.readFileSync(path.join(__dirname, '../public/js/ppic-preparation-layout.js'), 'utf8');
const derived = require('../public/js/ppic-preparation-derived');
const capacityMatrix = require('../public/js/ppic-preparation-capacity-matrix');

async function preparationHtml() {
  return ejs.renderFile(path.join(__dirname, '../views/ppic/preparation.ejs'), {
    title: 'Shared worksheet verification', module: getModule('planning-ppic'), modules, activeModule: 'planning-ppic',
    initialMonth: '2026-09', pageScript: '', requiresAuth: true, socketUrl: '', mqttUrl: ''
  });
}

function sheetPanel(html, view) {
  const start = html.indexOf(`<section id="prep-${view}-panel"`);
  assert.notEqual(start, -1, `${view} panel exists`);
  const next = html.indexOf('<section id="prep-', start + 1);
  // Readiness has nested recovery/overview panels, so use the next top-level workbook panel.
  const end = view === 'readiness' ? html.indexOf('<section id="prep-workbook-panel"', start + 1)
    : view === 'vendor' ? html.indexOf('<dialog id="prep-results"', start + 1) : next;
  return html.slice(start, end);
}

test('all five lab tabs share worksheet chrome while preserving their distinct interactions', async () => {
  const html = await preparationHtml();
  assert.match(html, /<main class="[^"]*prep-unified-workbook/);
  for (const view of ['readiness', 'workbook', 'capacity', 'purchase', 'vendor']) {
    const panel = sheetPanel(html, view);
    assert.match(panel, new RegExp(`role="tabpanel" aria-labelledby="prep-page-${view}"`));
    assert.match(panel, /class="prep-workbook(?:\s[^"]*)?"/, `${view} worksheet frame`);
    assert.match(panel, /class="prep-sheetbar(?:\s[^"]*)?"/, `${view} worksheet tab bar`);
    assert.match(panel, /class="prep-ribbon(?:\s[^"]*)?"/, `${view} compact worksheet ribbon`);
    assert.match(panel, /class="prep-sheet-heading(?:\s[^"]*)?"/, `${view} sheet caption`);
    if (view === 'workbook') {
      assert.match(panel, /id="prep-cell-value"/);
    } else {
      assert.doesNotMatch(panel, /contenteditable=|id="prep-cell-value"|tabulator-editing/, `${view} remains read-only`);
    }
  }
  for (const view of ['capacity', 'purchase', 'vendor']) {
    const panel = sheetPanel(html, view);
    assert.match(panel, /class="prep-sheetbar prep-derived-heading"/);
    assert.match(panel, /class="prep-ribbon prep-derived-toolbar"/);
    assert.match(panel, view === 'capacity'
      ? /class="prep-sheet-readonly">Klik persentase atau qty untuk edit draft/
      : /class="prep-sheet-readonly">Hanya baca/);
    assert.match(panel, new RegExp(`id="prep-${view}-status"[^>]*role="status"[^>]*aria-live="polite"`));
    assert.match(panel, /class="prep-derived-table-wrap"[^>]*role="region"[^>]*tabindex="0"/);
    assert.match(panel, /data-enterprise-table="off"/);
    assert.ok(panel.indexOf('class="prep-sheetbar prep-derived-heading"') > panel.indexOf('class="prep-workbook"'), `${view} header is inside frame`);
    assert.ok(panel.indexOf('prep-derived-basis-details') > panel.indexOf(`id="prep-${view}-body"`), `${view} explanatory notes follow data`);
  }
  const readiness = sheetPanel(html, 'readiness');
  assert.ok(readiness.indexOf('prep-readiness-summary-details') > readiness.indexOf('id="prep-overview-panel"'), 'summary is below both readiness table views');
  assert.ok(readiness.indexOf('id="prep-recovery-notice"') < readiness.indexOf('class="prep-workbook'), 'recovery result notices stay visible above worksheet');
});

test('derived sheet headings use worksheet letters without dropping semantic labels or allowing editing', () => {
  for (const view of ['purchase', 'vendor']) {
    const heading = derived.tableHead(view);
    const cells = heading.match(/<th\b[\s\S]*?<\/th>/g) || [];
    assert.ok(cells.length > 10);
    for (const [index, cell] of cells.entries()) {
      assert.match(cell, /scope="col"/);
      assert.match(cell, new RegExp(`class="prep-col-letter" aria-hidden="true">${String.fromCharCode(65 + index)}<`));
      assert.match(cell, /class="prep-col-name">[^<]+<\/span>/);
    }
    const rows = derived.tableRows(view, [{ partCode: 'PART', quantity: 3, requiredQty: 3 }]);
    assert.doesNotMatch(rows, /<input\b|contenteditable|role="textbox"/);
  }
  const heading = capacityMatrix.head('2026-09');
  assert.equal((heading.match(/scope="col"/g) || []).length, 34);
  const letters = [...heading.matchAll(/class="prep-col-letter" aria-hidden="true">([^<]+)<\/span>/g)].map(match => match[1]);
  assert.deepEqual(letters, Array.from({ length: 34 }, (_, index) => index < 26 ? String.fromCharCode(65 + index) : 'A' + String.fromCharCode(65 + index - 26)));
  assert.match(heading, /class="prep-col-letter" aria-hidden="true">C<\/span><span class="prep-col-name">CT Actual BOM \(detik\/unit\)<\/span>/);
  assert.match(heading, /title="2026-09-01"[^>]*>[\s\S]*?class="prep-col-name">01<\/span>/);
  assert.match(heading, /title="2026-09-30"[^>]*>[\s\S]*?class="prep-col-name">30<\/span>/);
  assert.match(heading, /class="prep-col-name">Total bulan<\/span>/);
});

test('Preparation keeps its workbench while all PPIC pages share three section links', async () => {
  const pages = ['preparation', 'yearly-demand', 'production-actuals', 'monthly-delivery', 'planning-sandbox', 'mrp-detail-simple', 'monthly-production-plan', 'daily-production-plan'];
  for (const page of pages) {
    const html = await ejs.renderFile(path.join(__dirname, `../views/ppic/${page}.ejs`), {
      title: 'Layout verification', module: getModule('planning-ppic'), modules, activeModule: 'planning-ppic',
      initialMonth: '2026-09', initialDate: '2026-09-12', currentYear: 2026, monthlyMode: true,
      recordKey: '', selectedRun: '', pageScript: '', requiresAuth: true, socketUrl: '', mqttUrl: ''
    });
    assert.equal((html.match(/src="\/js\/ppic-preparation-layout.js/g) || []).length, page === 'preparation' ? 1 : 0, page);
    assert.equal(html.includes('/css/ppic-preparation-workbench.css'), page === 'preparation', page);
    assert.equal((html.match(/class="[^"]*ppic-nav-stage/g) || []).length, 0, page);
    assert.equal((html.match(/data-ppic-section=/g) || []).length, 3, page);
    assert.ok(html.includes('/img/mitsutoyo-indonesia-logo.png'), page);
    if (page === 'preparation') {
      assert.ok(html.includes('id="prep-page-readiness" role="tab" aria-selected="true"'));
      assert.ok(html.includes('id="prep-workbook-panel" role="tabpanel" aria-labelledby="prep-page-workbook" hidden'));
      assert.ok(html.includes('Master Data Readiness'));
      assert.ok(html.includes('class="prep-workbook prep-readiness-workbook"'), 'readiness uses the workbook frame');
      assert.equal((html.match(/class="prep-(?:recovery|readiness)-table prep-master-grid"/g) || []).length, 2, 'both read-only views use workbook grid styling');
      assert.equal((html.match(/<th scope="col"><span class="prep-col-letter" aria-hidden="true">/g) || []).length, 12, 'sheet-style headings retain semantic column labels');
      assert.ok(html.indexOf('class="prep-recovery-guide"') > html.indexOf('id="prep-overview-panel"'), 'help stays below the working tables');
      for (const id of ['prep-grid', 'prep-month', 'prep-save', 'prep-simulate', 'prep-export', 'prep-undo', 'prep-redo', 'prep-cell-value', 'prep-results', 'prep-selection-status']) {
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
      }
      assert.equal((html.match(/role="tab" data-sheet=/g) || []).length, 1);
      assert.ok(html.includes('FG &amp; Child Proses'));
      assert.ok(html.includes('id="prep-expand-all"') && html.includes('id="prep-collapse-all"'));
      assert.ok(html.indexOf('class="prep-sheetbar"') < html.indexOf('id="prep-grid"'), 'sheet selection stays visible above workbook');
    }
  }
});

test('readiness visual overrides stay scoped to Preparation and retain visible grid controls', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/ppic-preparation-workbench.css'), 'utf8');
  assert.match(css, /\.prep-workbench \.prep-master-grid > thead > tr > th \{[^}]*position: sticky;[^}]*background: #f6f8fc;/);
  assert.match(css, /\.prep-workbench \.prep-master-grid > tbody > tr > td \{[^}]*border-right: 1px solid #e8edf5;/);
  assert.match(css, /\.prep-workbench \.prep-recovery-toolbar button\[aria-pressed=true\] \{[^}]*inset 0 -2px #4c73eb/);
  assert.match(css, /:is\([^)]*\.prep-recovery-table-wrap[^)]*#prep-overview-panel[^)]*\)\s*\{[^}]*overflow:\s*auto/);
});

test('shared worksheet layout contains wide grids and gives each tab the same scroll viewport', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/ppic-preparation-workbench.css'), 'utf8');
  assert.doesNotMatch(css, /:has\(#prep-page-workbook\[aria-selected=/, 'layout no longer depends on tab 02 being selected');
  assert.match(css, /\.prep-workbench(?:\.prep-unified-workbook)?\s*\{[^}]*display:\s*grid/);
  assert.match(css, />\s*\[role=(?:"tabpanel"|tabpanel)\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*min-width:\s*0/);
  const viewport = css.match(/:is\([^)]*\.prep-derived-table-wrap[^)]*\.prep-recovery-table-wrap[^)]*#prep-overview-panel[^)]*\)\s*\{([^}]*)\}/);
  assert.ok(viewport, 'readiness and all derived tables share one viewport rule');
  assert.match(viewport[1], /height:\s*clamp\(300px,\s*calc\(100dvh - 300px\),\s*1000px\)/);
  assert.match(viewport[1], /overflow:\s*auto/);
  assert.doesNotMatch(css, /calc\(100dvh - 470px\)|min\(65dvh,\s*750px\)/, 'legacy tab-specific viewport sizing is removed');
  assert.match(css, /\.prep-capacity-matrix tbody :is\(\.prep-capacity-identity,\s*\.prep-capacity-context\)\s*\{[^}]*top:\s*auto/, 'row headers are not pinned to the vertical table header');
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 700px)'));
  assert.match(mobile, /\.prep-capacity-identity[^}]*width:\s*200px/, 'small screens reserve room for scrolling dates');
  assert.match(mobile, /\.prep-capacity-context[^}]*left:\s*auto/, 'second metadata column does not cover all mobile date columns');
});

function fixture({ supported = true } = {}) {
  const bodyClasses = new Set(), rootClasses = new Set(), stageNodes = Array.from({ length: 5 }, (_, index) => ({ href: `/stage-${index}`, active: index === 1 }));
  const properties = {}, roots = [];
  function node() { return { children: [], append(child) { this.children.push(child); }, setAttribute(name, value) { this[name] = value; }, getBoundingClientRect: () => ({ height: 70 }) }; }
  const root = { classList: { add: value => rootClasses.add(value) }, after: item => roots.push(item) };
  const body = { classList: { add: value => bodyClasses.add(value) }, style: { setProperty: (name, value) => { properties[name] = value; } } };
  const document = {
    body, createElement: node,
    querySelector(selector) {
      if (selector === '.ppic-wb-stage-dock') return roots[0] || null;
      if (selector === 'body > .ppic-workspace-nav') return { querySelectorAll: () => stageNodes };
      return supported ? root : null;
    }
  };
  const context = { document, window: { addEventListener() {}, ResizeObserver: class { observe() {} } } };
  context.ResizeObserver = context.window.ResizeObserver;
  return { run: () => vm.runInNewContext(layout, context), roots, rootClasses, bodyClasses, properties, stageNodes };
}
test('layout reuses the existing stage links once, preserving permissions and active state', () => {
  const f = fixture(); f.run(); f.run();
  assert.equal(f.roots.length, 1);
  assert.deepEqual(f.roots[0].children[0].children, f.stageNodes);
  assert.equal(f.roots[0].children[0].children[1].active, true);
  assert.equal(f.properties['--ppic-wb-dock-height'], '70px');
  assert.ok(f.rootClasses.has('prep-workbench'));
});
test('layout ignores any page without the Preparation root', () => {
  const f = fixture({ supported: false }); f.run();
  assert.equal(f.roots.length, 0); assert.equal(f.bodyClasses.size, 0);
});
