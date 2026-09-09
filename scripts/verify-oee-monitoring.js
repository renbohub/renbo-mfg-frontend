"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

async function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}
async function main() {
  let upstreamStatus = 200;
  let received;
  const upstream = express();
  upstream.get("/api/production/production-reports/oee-monitoring", (req, res) => {
    received = { query: req.query, authorization: req.get("authorization") };
    res.status(upstreamStatus).json(upstreamStatus === 200 ? { summary: { machineCount: 0 }, machines: [], shifts: [] } : { message: "Akses ditolak", code: "DENIED" });
  });
  const backend = await listen(upstream);
  process.env.BACKEND_URL = `http://127.0.0.1:${backend.address().port}`;
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/modules", require("../src/routes/modules"));
  const frontend = await listen(app);
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  try {
    for (const suffix of ["", "/P1", "/%3Cscript%3Ealert(1)%3C%2Fscript%3E"]) {
      const response = await fetch(`${origin}/modules/production/oee-monitoring${suffix}?date=2026-09-08`);
      assert.equal(response.status, 200, `Renders ${suffix || "overview"}`);
      const html = await response.text();
      assert.match(html, /id="oee-config"/);
      assert.match(html, /id="oee-machines"/);
      assert.match(html, /id="oee-detail"/);
      assert.match(html, /oee-monitoring-model\.js/);
      assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
      const config = JSON.parse(html.match(/id="oee-config"[^>]*>([\s\S]*?)<\/script>/)[1]);
      assert.equal(config.initialDate, "2026-09-08");
      if (suffix === "/P1") assert.equal(config.machineId, "P1");
    }
    let response = await fetch(`${origin}/modules/api/production/oee-monitoring?date=2026-09-08&shift=1A`, { headers: { Authorization: "Bearer test-oee" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.deepEqual({ ...received.query }, { date: "2026-09-08", shift: "1A" });
    assert.equal(received.authorization, "Bearer test-oee");
    assert.deepEqual((await response.json()).machines, []);
    for (const status of [400, 401, 403, 500]) {
      upstreamStatus = status;
      response = await fetch(`${origin}/modules/api/production/oee-monitoring?date=2026-09-08`);
      assert.equal(response.status, status, "Preserves upstream errors without fake success/sample data");
      assert.equal((await response.json()).code, "DENIED");
    }
    console.log("OEE UI integration PASS: overview/detail render, route precedence, escaped config, date/shift/auth proxy, no-cache and upstream errors.");
  } finally {
    await Promise.all([new Promise(resolve => frontend.close(resolve)), new Promise(resolve => backend.close(resolve))]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
