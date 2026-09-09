const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ppic-mps-workbench.js'), 'utf8');
const functions = source.slice(source.indexOf('  async function loadModalBomSelections()'), source.indexOf('  function openModal('));
function harness(request) {
  const panel = { textContent: '', innerHTML: '', hidden: true };
  const state = {};
  const els = { month: { value: '2026-09' }, modalSubmit: {}, modalForm: { querySelectorAll: () => [
    { value: 'rev7', dataset: { mwbBomKey: '2026-09|C003' } },
    { value: '', dataset: { mwbBomKey: '2026-09|C001' } },
  ] } };
  const context = vm.createContext({ state, els, $: () => panel, request, apiBase: '/mps', esc: String, date: String });
  vm.runInContext(functions, context);
  return { context, state, els, panel };
}
(async () => {
  let url;
  const ok = harness(async value => { url = value; return { items: [{ key: '2026-09|C003', month: '2026-09', partCode: 'C003', autoSelectedId: 'rev6', revisions: [
    { id: 'rev6', revision: 6, noReg: 'OLD', expiryDate: '2026-09-01' },
    { id: 'rev7', revision: 7, noReg: 'NEW', expiryDate: null },
  ] }] }; });
  await ok.context.loadModalBomSelections();
  assert.match(url, /months=2026-09&planningAnchorMonth=2026-09$/);
  assert.equal(ok.state.bomSelectionsReady, true);
  assert.equal(ok.els.modalSubmit.disabled, false);
  assert.match(ok.panel.innerHTML, /Rev 7/);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.context.readModalBomSelections())), { '2026-09|C003': 'rev7' });
  const fail = harness(async () => { throw Error('offline'); });
  await fail.context.loadModalBomSelections();
  assert.equal(fail.els.modalSubmit.disabled, true);
  assert.equal(fail.state.bomSelectionsReady, false);
  assert.match(fail.panel.textContent, /offline/);
  let resolve;
  const stale = harness(() => new Promise(done => { resolve = done; }));
  const pending = stale.context.loadModalBomSelections();
  stale.state.bomSelectionRequestId++;
  resolve([]);
  await pending;
  assert.equal(stale.els.modalSubmit.disabled, true);
  assert.equal(stale.state.bomSelectionsReady, false);
  assert.match(source, /mbomSelections: readModalBomSelections\(\)/);
  assert.match(source, /!isRecalculate && !state.bomSelectionsReady/);
  console.log('PASS: scoped BOM selections, payload, failed load and stale response guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
