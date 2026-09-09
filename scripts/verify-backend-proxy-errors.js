const assert = require('node:assert/strict');
const http = require('node:http');
const router = require('../src/routes/modules');

async function main() {
  const handler = router.stack.find(layer => layer.route?.path === '/api/planning-ppic/monthly-plan/from-mps' && layer.route.methods.post).route.stack[0].handle;
  const originalFetch = global.fetch;
  const originalLog = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  const req = { body: { confidential: 'private-payload' }, get: () => 'private-token' };
  const invoke = async () => {
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await handler(req, res);
    assert.ok(res.body.errorId);
    return res;
  };
  const server = http.createServer((request, response) => {
    if (request.url === '/body') {
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' });
      response.write('{"items":');
      setTimeout(() => response.destroy(), 20);
    } else request.socket.destroy();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const path of ['/headers', '/body']) {
      let calls = 0;
      global.fetch = (_url, options) => {
        calls += 1;
        return originalFetch(`http://127.0.0.1:${server.address().port}${path}`, options);
      };
      const result = await invoke();
      assert.equal(result.statusCode, 502);
      assert.equal(result.body.code, 'BACKEND_CONNECTION_LOST');
      assert.equal(calls, 1, 'Never retry a mutation after a connection loss');
    }
    for (const code of ['ECONNREFUSED', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ENOTFOUND']) {
      global.fetch = async () => { throw new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error('private-payload'), { code })]) }); };
      const result = await invoke();
      const expected = code === 'ECONNREFUSED' ? 'BACKEND_UNAVAILABLE' : code === 'ENOTFOUND' ? 'BACKEND_CONNECTION_ERROR' : 'BACKEND_TIMEOUT';
      assert.equal(result.body.code, expected);
    }
    assert.ok(logs.every(log => !log.includes('private-payload') && !log.includes('private-token')));
    assert.ok(logs.every(log => log.includes('elapsedMs') && log.includes('errorId')));
  } finally {
    global.fetch = originalFetch;
    console.error = originalLog;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('PASS: real socket loss before/during response, nested connection errors, timeouts, no mutation retries, and redacted diagnostics.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
