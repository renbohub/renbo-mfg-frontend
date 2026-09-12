"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const view = read("views/partials/mps-eta-source.ejs"), css = read("public/css/ppic-mps-eta.css"), script = read("public/js/ppic-mps-eta.js");
const fixture = { period: "2026-09", mps: { mpsNumber: "MPS-202609", revision: 7, status: "Draft" }, etaGate: { mode: "MANUAL", modeVersion: 0 }, etaPermissions: { canCreate: true, canUpdate: true } };
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    for (const width of [390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 620 });
      await page.setContent(`<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:16px;font-family:Arial}.mwb-primary-action,.mwb-outline-action{padding:10px;border-radius:8px;border:1px solid #b6c2d4;background:white;color:#29385a}.mwb-primary-action{background:#4338ca;color:white}button:disabled{opacity:.5}${css}</style></head><body>${view}<p id="message"></p><script>${script}</script></body></html>`);
      await page.evaluate((data) => {
        window.data = data; window.calls = []; window.failNext = false;
        window.controls = MpsEtaControls.create({
          request: async (url, options) => {
            const body = JSON.parse(options.body); calls.push({url,method:options.method,body});
            if (failNext) { failNext = false; throw Error("MPS berubah. Refresh status sebelum menyimpan."); }
            if (body.etaModeVersion !== window.data.etaGate.modeVersion) throw Error("Stale mode");
            window.data.etaGate.mode = body.etaMode; window.data.etaGate.modeVersion++;
            return { etaMode: body.etaMode, etaModeVersion: window.data.etaGate.modeVersion };
          },
          reload: async () => controls.render(window.data),
          notify: (message) => document.querySelector("#message").textContent = message,
        });
        controls.render(window.data);
      }, fixture);
      const select = page.locator("#mwb-eta-source-select"), save = page.locator("#mwb-eta-source-save");
      assert.equal(await select.inputValue(), "MANUAL"); assert.equal(await save.isDisabled(), true);
      await select.selectOption("BOM");
      assert.match(await page.locator("#mwb-eta-source-state").textContent(), /belum disimpan/);
      assert.match(await page.evaluate(() => { try {controls.creationOptions();} catch(e) {return e.message;} }), /Simpan sumber/);
      await save.click();
      await page.waitForFunction(() => document.querySelector("#mwb-eta-source-state").textContent.includes("Aktif: Explode lead time BOM"));
      assert.deepEqual(await page.evaluate(() => calls[0]), {url:"/modules/api/planning-ppic/mps/MPS-202609/eta-mode",method:"PATCH",body:{etaMode:"BOM",revision:7,etaModeVersion:0}});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `MPS source overflow at ${width}`);
      if ([390,1280].includes(width)) await page.screenshot({path:path.join(root,`mps-eta-source-${width}.png`)});
      await select.selectOption("MANUAL"); await save.click();
      await page.waitForFunction(() => document.querySelector("#mwb-eta-source-state").textContent.includes("Aktif: Konfirmasi ETA"));
      assert.equal(await page.evaluate(() => calls.at(-1).body.etaModeVersion), 1);
      await page.evaluate(() => {failNext=true;}); await select.selectOption("BOM"); await save.click();
      await page.waitForFunction(() => document.querySelector("#message").textContent.includes("MPS berubah"));
      assert.equal(await select.inputValue(), "MANUAL", "rejected save refreshes the active source");
      await page.evaluate(() => {data.etaPermissions.canUpdate=false;controls.render(data);});
      assert.equal(await select.isDisabled(), true); assert.equal(await save.isDisabled(), true);
      await page.evaluate(() => {data.etaPermissions.canUpdate=true;data.mps.status="Released";controls.render(data);});
      assert.equal(await select.isDisabled(), true);
      await page.evaluate(() => {data.mps=null;data.period="2026-10";controls.render(data);});
      assert.equal(await save.isVisible(), false); await select.selectOption("BOM");
      assert.deepEqual(await page.evaluate(() => controls.creationOptions()), {etaMode:"BOM"});
      await page.evaluate(() => controls.render(data)); assert.equal(await select.inputValue(), "BOM");
      await page.evaluate(() => {data.period="2026-11";controls.render(data);}); assert.equal(await select.inputValue(), "BOM", "new MPS defaults to BOM");
    }
    const integrated = { ...structuredClone(fixture), items: [], statuses: [], summary: { partCount: 0 }, pagination: { page: 1, pages: 1, pageSize: 25, filtered: 0 }, efdWindow: { months: ["2026-08", "2026-09", "2026-10"], totals: {}, total: 0 }, deliveryGate: {} };
    const fullView = read("views/ppic/mps-workbench.ejs")
      .replace("<%- include('../partials/mps-eta-source') %>", view)
      .replace(/<%- include[^\n]*%>/g, "")
      .replace(/<%= initialMonth %>/g, "2026-09")
      .replace(/<%- JSON.stringify[^\n]*%>/g, '{"initialMonth":"2026-09"}');
    await page.route("http://mps.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("/modules/api/")) {
        if (url.pathname.endsWith("/eta-mode")) {
          const input = route.request().postDataJSON(); assert.equal(input.revision, 7);
          integrated.etaGate.mode=input.etaMode; integrated.etaGate.modeVersion++;
          return route.fulfill({json:{etaMode:input.etaMode,etaModeVersion:integrated.etaGate.modeVersion}});
        }
        return route.fulfill({json:integrated});
      }
      if (/^\/(js|css)\/[\w.-]+\.(js|css)$/.test(url.pathname)) return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css',body:read(`public${url.pathname}`)});
      return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fullView}<script>${read('public/js/ppic-mps-workbench.js')}</script></body></html>`});
    });
    await page.goto("http://mps.test/modules/planning-ppic/mps/workbench?month=2026-09");
    await page.waitForFunction(() => document.querySelector('#mwb-eta-source-state').textContent.includes('MPS-202609'));
    await page.locator('#mwb-eta-source-select').selectOption('BOM'); await page.locator('#mwb-eta-source-save').click();
    await page.waitForFunction(() => document.querySelector('#mwb-eta-source-state').textContent.includes('Aktif: Explode lead time BOM'));
    assert.match(await page.locator('#mwb-alert').textContent(), /tersimpan/);
    assert.deepEqual(errors, []);
    const workbench = read("public/js/ppic-mps-workbench.js"), routes = read("src/routes/modules.js");
    assert.match(workbench, /etaControls\.render\(data\)/); assert.match(workbench, /mbomSelections: readModalBomSelections\(\), \.\.\.etaOptions/);
    assert.match(routes, /router\.patch\("\/api\/planning-ppic\/mps\/:key\/eta-mode"/);
    assert.doesNotMatch(read("public/js/purchasing-eta.js"), /data-save-mode|eta-monitor\/mps\/mode/);
    console.log("PASS MPS ETA source: new-MPS choice, save/version payload, active source, stale-save refresh, read-only/released locks, 390–1920px, MPS integration and no ETA-page setting.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode=1; });
