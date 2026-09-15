const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (status, payload = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => payload });
function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}
function browser(pathname, fetch) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      dataset: { next: '/home' }, listeners: {}, textContent: '', value: '',
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      querySelector: (selector) => element(`${id} ${selector}`),
      setAttribute() {}, reportValidity: () => true
    });
    return elements.get(id);
  }
  const redirects = [];
  const context = {
    localStorage: storage(), sessionStorage: storage(), fetch, AbortSignal, URL,
    location: { pathname, search: '', origin: 'http://localhost:3100', replace: (url) => redirects.push(url) },
    document: { getElementById: element, querySelectorAll: () => [], querySelector: element },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    HomeTaskModel: require('../public/js/home-task-model')
  };
  context.window = context;
  vm.createContext(context);
  return {
    ...context, element, redirects,
    run(file) { vm.runInContext(readFileSync(path.join(__dirname, '../public/js', file), 'utf8'), context, { filename: file }); }
  };
}
function seed(store) {
  store.setItem('token', 'test-stale-token');
  store.setItem('user', JSON.stringify({ partnerAccess: { id: 'cached-binding' } }));
}
test('login rejects stale session in both stores without redirecting to home or cached partner portal', async () => {
  const b = browser('/login', async () => response(401));
  seed(b.localStorage); seed(b.sessionStorage);
  b.run('session.js'); b.run('login.js'); await flush();
  assert.deepEqual(b.redirects, []);
  for (const store of [b.localStorage, b.sessionStorage]) {
    assert.equal(store.getItem('token'), null); assert.equal(store.getItem('user'), null);
  }
  assert.match(b.element('login-alert').textContent, /Sesi berakhir/);
  assert.equal(b.element('login-button').disabled, false);
});
test('login redirects only after profile validation, using fresh partner access and original destination', async () => {
  for (const [profile, destination] of [[{ username: 'test' }, '/modules'], [{ partnerAccess: { id: 'test' } }, '/partner-portal']]) {
    let complete;
    const b = browser('/login', () => new Promise((resolve) => { complete = resolve; }));
    seed(b.sessionStorage); b.element('login-form').dataset.next = '/modules';
    b.run('login.js'); assert.deepEqual(b.redirects, []);
    assert.equal(b.element('login-button').disabled, true);
    complete(response(200, profile)); await flush();
    assert.deepEqual(b.redirects, [destination]);
    assert.deepEqual(JSON.parse(b.sessionStorage.getItem('user')), profile);
  }
});
test('profile server/network errors keep saved session but do not redirect', async () => {
  for (const fetch of [async () => response(500), async () => response(503), async () => { throw new TypeError('offline'); }]) {
    const b = browser('/login', fetch); seed(b.localStorage);
    b.run('login.js'); await flush();
    assert.deepEqual(b.redirects, []);
    assert.equal(b.localStorage.getItem('token'), 'test-stale-token');
    assert.equal(b.element('login-button').disabled, false);
    assert.match(b.element('login-alert').textContent, /server aktif/);
  }
});
test('login submission stores a valid token only, respecting remember-me', async () => {
  for (const [payload, remember] of [[{}, false], [{ token: 'test-new-token', user: {} }, false], [{ token: 'test-new-token', user: {} }, true]]) {
    const b = browser('/login', async () => response(200, payload));
    const form = b.element('login-form');
    form.identifier = { value: 'test' }; form.password = { value: 'test-only' };
    b.element('remember').checked = remember;
    b.run('login.js'); await form.listeners.submit({ preventDefault() {} });
    assert.deepEqual(b.redirects, payload.token ? ['/home'] : []);
    assert.equal((remember ? b.localStorage : b.sessionStorage).getItem('token'), payload.token || null);
    assert.equal((remember ? b.sessionStorage : b.localStorage).getItem('token'), null);
  }
});
test('home and protected profile clear rejected session before login; login no longer bounces back', async () => {
  for (const file of ['home.js', 'session.js']) {
    const b = browser('/home', async () => response(401));
    seed(b.localStorage); seed(b.sessionStorage);
    b.run(file); await flush();
    assert.deepEqual(b.redirects, ['/login?next=%2Fhome']);
    assert.equal(b.localStorage.getItem('token'), null);
    assert.equal(b.sessionStorage.getItem('token'), null);
    b.location.pathname = '/login'; b.run('login.js'); await flush();
    assert.equal(b.redirects.length, 1);
  }
});
test('late 401 must not remove a newer session', async () => {
  for (const file of ['login.js', 'session.js', 'home.js']) {
    let complete;
    const b = browser(file === 'login.js' ? '/login' : '/home', () => new Promise((resolve) => { complete = resolve; }));
    seed(b.localStorage); b.run(file);
    b.localStorage.setItem('token', 'test-new-token');
    complete(response(401)); await flush();
    assert.deepEqual(b.redirects, []);
    assert.equal(b.localStorage.getItem('token'), 'test-new-token');
  }
});
