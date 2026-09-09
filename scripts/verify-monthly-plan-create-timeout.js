const assert = require('node:assert/strict');
const router = require('../src/routes/modules');

async function main() {
  const routes = [
    { path: '/api/planning-ppic/monthly-plan/from-mps', backend: '/api/planning/monthly-production-plans/from-mps', body: { mpsNumber: 'MPS-TEST', productionPercent: 100 } },
    { path: '/api/planning-ppic/mrp/:key/output/production-plan', backend: '/api/planning/mrp/MRP-TEST/output/production-plan', body: {} },
  ];
  const originalFetch = global.fetch;
  const originalTimeout = AbortSignal.timeout;
  const budgets = [];
  const invoke = async (route) => {
    const layer = router.stack.find(entry => entry.route?.path === route.path && entry.route.methods.post);
    assert.ok(layer, `Monthly Plan creation route must exist: ${route.path}`);
    const req = { route: layer.route, params: { key: 'MRP-TEST' }, body: route.body, get: name => name === 'authorization' ? 'Bearer test' : undefined };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await layer.route.stack[0].handle(req, res);
    return res;
  };
  AbortSignal.timeout = milliseconds => { budgets.push(milliseconds); return originalTimeout(milliseconds); };
  try {
    let calls = 0;
    global.fetch = async (url, options) => {
      calls += 1;
      const route = routes.find(entry => entry.backend === new URL(url).pathname);
      assert.ok(route, 'Must forward to the correct backend creation endpoint');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.authorization, 'Bearer test');
      assert.deepEqual(JSON.parse(options.body), route.body);
      // Cross the old real 30-second deadline without touching a live backend.
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(options.signal.reason); };
        const timer = setTimeout(() => { options.signal.removeEventListener('abort', abort); resolve(); }, 31000);
        options.signal.addEventListener('abort', abort, { once: true });
      });
      return new Response(JSON.stringify({ primaryPlanNumber: 'MPP-TEST', items: [{ planNumber: 'MPP-TEST' }] }), { status: 201 });
    };
    const completed = await Promise.all(routes.map(invoke));
    completed.forEach(result => {
      assert.equal(result.statusCode, 201);
      assert.equal(result.body.primaryPlanNumber, 'MPP-TEST');
    });
    assert.equal(calls, 2, 'Each creation must run once without automatic retries');
    assert.deepEqual(budgets, [120000, 120000]);

    global.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
    for (const route of routes) {
      const timedOut = await invoke(route);
      assert.equal(timedOut.statusCode, 504);
      assert.equal(timedOut.body.code, 'BACKEND_TIMEOUT');
    }

    global.fetch = async () => new Response(JSON.stringify({ message: 'MRP must be approved', code: 'MRP_NOT_APPROVED' }), { status: 409 });
    for (const route of routes) {
      const rejected = await invoke(route);
      assert.equal(rejected.statusCode, 409);
      assert.equal(rejected.body.code, 'MRP_NOT_APPROVED');
    }
    console.log('PASS: both MPS and MRP creation routes accept responses after 31 seconds, preserve timeout/validation errors, and never retry automatically.');
  } finally {
    global.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
