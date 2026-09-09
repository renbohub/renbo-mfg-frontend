const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://responsive.test/**', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('http://responsive.test/');
    const head = fs.readFileSync(path.join(root, 'views/partials/head.ejs'), 'utf8');
    const styles = ['node_modules/bootstrap/dist/css/bootstrap.min.css', 'node_modules/datatables.net-bs5/css/dataTables.bootstrap5.css',
      ...Array.from(head.matchAll(/href="\/css\/([^"?]+)/g), match => `public/css/${match[1]}`)];
    for (const style of styles) await page.addStyleTag({ path: path.join(root, style) });
    for (const script of ['node_modules/jquery/dist/jquery.js', 'node_modules/datatables.net/js/dataTables.js', 'node_modules/datatables.net-bs5/js/dataTables.bootstrap5.js', 'public/js/shared-data-table.js']) {
      await page.addScriptTag({ path: path.join(root, script) });
    }
    for (const width of [375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const shell of ['entity-table-shell operations-master-table', 'entity-table-shell module-master-table', 'entity-table-shell sales-master-table', 'report-master-table', 'ppic-table-card ppic-master-table']) {
        for (const rows of [0, 30]) {
          await page.evaluate(({ shell, rows }) => {
            document.querySelector('main')?.remove();
            document.body.insertAdjacentHTML('beforeend', `<main><section class="table-shell ${shell}"><div class="list-table-view"><table id="test-table" class="table w-100"><thead><tr>${Array.from({ length: 18 }, (_, i) => `<th>WAREHOUSE COLUMN ${i}</th>`).join('')}</tr></thead></table></div></section></main>`);
            window.testTable = new DataTable('#test-table', {
              ...SharedDataTable.defaults(),
              data: Array.from({ length: rows }, () => Array.from({ length: 18 }, (_, i) => `Stock reservation ${i}`)),
            });
            SharedDataTable.enhanceAll();
          }, { shell, rows });
          await page.waitForFunction(() => document.querySelector('#test-table').dataset.enterpriseTableReady === 'true');
          const metrics = await page.evaluate(() => {
            const host = document.querySelector('.dt-layout-table > .col-12');
            const footer = document.querySelector('.dt-layout-end');
            const before = footer.getBoundingClientRect().x;
            host.scrollLeft = 200;
            return { page: document.documentElement.scrollWidth, viewport: innerWidth, scroll: host.scrollLeft, footerMoved: footer.getBoundingClientRect().x !== before };
          });
          assert.ok(metrics.page <= width + 1, JSON.stringify({ width, shell, rows, ...metrics }));
          assert.ok(metrics.scroll > 0, `Table must scroll at ${width}: ${shell}`);
          assert.equal(metrics.footerMoved, false, 'Pagination must stay outside the scroll area');
          await page.evaluate(() => window.testTable.destroy());
        }
      }
    }
    console.log('PASS: 50 responsive table cases, including empty tables and fixed pagination.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
