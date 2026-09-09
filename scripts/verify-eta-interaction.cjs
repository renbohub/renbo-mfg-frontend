"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const view = read("views/purchasing/eta-monitor.ejs").replace(/<%- include[^\n]*%>/g, "").replace(/<%= initialMonth %>/g, "2026-09");
const style = read("public/css/purchasing-eta.css");
const script = read("public/js/purchasing-eta.js");
const seed = () => [1, 2].map((id) => ({ id: `MPSM:detail:phase:${id}`, code: `RAW-${id}`, name: "Material <img src=x onerror=alert(1)>", partNumber: `PN-${id}`, partner: "PT. Supplier & Co", partnerCode: "S002", source: "MPS-202609", mpsRevision: 7, qty: 100, uom: "KG", needDate: "2026-09-20", eta: "2026-09-20", requiresQc: true, category: "MATERIAL", timing: "ON_TRACK", confirmation: "PLANNED", confirmed: false, canConfirm: true, leadTime: 3, sourceFingerprint: `fingerprint-${id}`, href: "/modules/planning-ppic/mps", stage: "Sebelum release MPS" }));
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    let items = seed(), submissions = [], etaMode = "MANUAL", etaModeVersion = 0;
    await page.route("http://eta.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("/modules/api/")) {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON(); submissions.push(body);
          const item = items.find((r) => r.id === body.id);
          assert.equal(body.sourceFingerprint, item.sourceFingerprint); assert.ok(body.requestId); assert.ok(body.reference);
          Object.assign(item, { confirmed: true, confirmedQty: body.qty, eta: body.eta, readyDate: body.readyDate, confirmation: "CONFIRMED" });
          return route.fulfill({ json: { saved: true, sourceKey: item.id, item: { ...item, readiness: { ready: true } } } });
        }
        const visibleItems = items.map((r) => etaMode === "BOM" ? { ...r, etaMode, etaBasis: "BOM", confirmed: false, confirmation: "BOM", readyDate: r.needDate, readiness: { ready: true } } : r);
        return route.fulfill({ json: { asOf: "2026-09-06", selectedMpsNumber: "MPS-202609", permissions: {canConfirm:true,canEvaluate:true}, items: visibleItems, documents: [{ mpsNumber: "MPS-202609", revision: 7, etaMode, etaModeVersion, status: "Draft", capacityStatus: "FEASIBLE", deliveryStatus: "FEASIBLE", eta: { total: 2, confirmed: visibleItems.filter((i) => i.confirmed || i.etaBasis === "BOM").length, ready: visibleItems.every((i) => i.confirmed || i.etaBasis === "BOM") }, href: "/modules/planning-ppic/mps" }] } });
      }
      if (url.pathname.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: style });
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}.app-container{width:100%;padding:24px}th,td{padding:12px}${style}</style></head><body>${view}<script>${script}</script></body></html>` });
    });
    for (const width of [390, 768, 1280, 1920]) {
      items = seed(); etaMode = "MANUAL"; etaModeVersion = 0; await page.setViewportSize({ width, height: 920 }); await page.goto("http://eta.test/modules/purchasing/eta-monitor");
      await page.waitForFunction(() => document.querySelector("#eta-count").textContent === "2");
      assert.equal(await page.locator("#eta-body img").count(), 0, "source names must be escaped");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}px`);
      await page.locator("#eta-start").click(); await page.locator("#eta-form").waitFor();
      assert.ok(await page.locator("#eta-dialog").evaluate((e) => e.getBoundingClientRect().width <= innerWidth), "dialog fits viewport");
      await page.locator('[name="qty"]').fill("50");
      assert.match(await page.locator("#eta-form-warning").textContent(), /kurang 50/);
      await page.locator('[name="qty"]').fill("100");
      await page.locator('[name="eta"]').fill("2026-09-19"); await page.locator('[name="readyDate"]').fill("2026-09-20");
      await page.locator('[name="reference"]').fill("PIC / WA / 06 September");
      await page.locator('button[name="next"]').click();
      await page.waitForFunction(() => document.querySelector("#eta-detail").textContent.includes("RAW-2"));
      assert.equal(submissions.at(-1).qty, 100); assert.equal(submissions.at(-1).readyDate, "2026-09-20");
      await page.locator("#eta-close").click();
      assert.equal(await page.locator("#eta-body [data-detail]").count(), 1, "completed confirmation is removed from the work queue");
      await page.locator("#eta-unresolved").uncheck(); assert.equal(await page.locator("#eta-body [data-detail]").count(), 2);
      const confirmationsBeforeMode = submissions.length;
      assert.equal(await page.locator("#eta-method").count(), 0, "source is selected in MPS only");
      etaMode = "BOM"; await page.locator("#eta-refresh").click();
      await page.waitForFunction(() => document.querySelector("#eta-method-panel").textContent.includes("Explode lead time BOM"));
      assert.equal(await page.locator("#eta-pending").textContent(), "0");
      assert.match(await page.locator("#eta-body").textContent(), /Perkiraan By BOM/);
      assert.match(await page.locator("#eta-method-panel").textContent(), /Atur sumber ETA di MPS/);
      assert.equal(submissions.length, confirmationsBeforeMode, "mode switch must not fabricate supplier confirmations");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `mode selector overflow at ${width}px`);
      if (width === 390 || width === 1280) await page.screenshot({ path: path.join(root, `eta-review-${width}.png`), fullPage: true });
      etaMode = "MANUAL"; await page.locator("#eta-refresh").click();
      await page.waitForFunction(() => document.querySelector("#eta-method-panel").textContent.includes("Sumber ETA MPS-202609: Konfirmasi ETA"));
      assert.equal(await page.locator("#eta-pending").textContent(), "1");
    }
    assert.deepEqual(errors, []); console.log("PASS ETA UI: 390/768/1280/1920px, no page overflow, form validation, escaped sources, confirmation payload, Save & next, filters.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
