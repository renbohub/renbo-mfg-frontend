"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const report = { month: "2026-09", mpsNumber: "MPS-202609", checkedAt: new Date().toISOString(), status: "NOT_READY", total: 2, counts: { PASS: 1, FAIL: 1, WARNING: 0, UNKNOWN: 0 }, checks: [{ id: "machine", label: "Kapasitas mesin / RCCP", status: "PASS", reason: "RCCP FEASIBLE." }, { id: "eta", label: "ETA proses vendor", status: "FAIL", reason: "11 jadwal belum siap.", details: ["C003-0010-020 · GSN · Lead time kosong", '<img src=x onerror="alert(1)">'], href: "/modules/purchasing/eta-monitor" }], scope: "Seluruh part dalam MPS periode terpilih.", simulation: "Simulasi belum menjadi rencana resmi." };
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.setContent(`<input id="mwb-month" value="2026-09"><style>${read("public/css/ppic-mps-readiness-bot.css")}</style>${read("views/partials/mps-readiness-bot.ejs").replace(/<link[^>]+>|<script[\s\S]*?<\/script>/g, "")}`);
    await page.addScriptTag({ content: read("public/js/ppic-mps-readiness-bot.js") });
    await page.evaluate((fixture) => {
      window.fixture = fixture; window.mode = "ok"; window.calls = [];
      window.bot = MpsReadinessBot.create({ getMonth: () => document.getElementById("mwb-month").value, request: async (url) => {
        calls.push(url); if (mode === "error") throw Error("Network unavailable");
        if (mode === "slow") return new Promise((resolve) => { window.resolveOld = resolve; });
        return { mrpReadiness: { ...fixture, month: document.getElementById("mwb-month").value } };
      } });
    }, report);
    await page.getByRole("button", { name: "Buka bot kesiapan MRP" }).click();
    await page.getByText("BELUM SIAP UNTUK MRP RESMI", { exact: true }).waitFor();
    assert.equal(await page.locator("#mrb-toggle").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#mrb-body img").count(), 0);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const box = await page.locator("#mrb-panel").boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 800);
    }
    const out = path.resolve(root, "../output/mps-readiness-bot"); fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, "desktop.png") });
    await page.setViewportSize({ width: 390, height: 800 }); await page.screenshot({ path: path.join(out, "mobile.png") });
    await page.evaluate(() => { mode = "error"; }); await page.locator("#mrb-refresh").click();
    await page.getByText(/Network unavailable/).waitFor(); assert.equal(await page.locator(".mrb-result").count(), 0, "failed refresh clears old green statuses");
    await page.evaluate(() => { mode = "slow"; }); await page.locator("#mrb-refresh").click();
    await page.evaluate(() => { mode = "ok"; const month = document.getElementById("mwb-month"); month.value = "2026-10"; month.dispatchEvent(new Event("change")); });
    await page.getByText("BELUM SIAP UNTUK MRP RESMI", { exact: true }).waitFor();
    await page.evaluate(() => resolveOld({ mrpReadiness: { ...fixture, status: "READY" } }));
    assert.match(await page.locator(".mrb-result strong").textContent(), /BELUM SIAP/);
    await page.locator("#mrb-close").focus(); await page.keyboard.press("Escape"); assert.equal(await page.locator("#mrb-panel").isVisible(), false);
    assert.equal(await page.locator("#mrb-toggle").evaluate((el) => el === document.activeElement), true);
    assert.deepEqual(errors, []);
    console.log("PASS bot: open/close, keyboard focus, current period, stale-response race, failed refresh, escaped content, mobile and desktop layout.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
