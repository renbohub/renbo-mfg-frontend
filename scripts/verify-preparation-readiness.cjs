const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/ppic-preparation-readiness.js'), 'utf8');
function fixture(query='') {
  const nodes = new Map(), requests = [], events = [], windowHandlers={};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value:'', innerHTML:'', textContent:'', hidden:false, handlers:{}, attrs:{}, dataset:{}, focused:false, addEventListener(k, cb) { this.handlers[k] = cb; }, setAttribute(k,v) { this.attrs[k] = v; }, focus() { this.focused=true; } });
    return nodes.get(id);
  };
  node('prep-readiness-month').value = '2026-09';
  node('prep-readiness-status').value = 'ATTENTION';
  node('prep-workbook-panel').hidden = true;
  const tabs = ['readiness','workbook','capacity','purchase','vendor','daily','delivery','kpi'].map(name => { const tab = node(`prep-page-${name}`); tab.dataset.labPage = name; node(`prep-${name}-panel`).hidden=name!=='readiness'; return tab; });
  const location={href:'http://localhost:3100/modules/planning-ppic/preparation'+query};
  vm.runInNewContext(source, {
    document:{getElementById:node, querySelectorAll:() => tabs},
    window:{PpicReadinessRecovery:require('../public/js/ppic-readiness-recovery-model'),location,history:{replaceState:(a,b,url)=>{location.href=new URL(url,location.href).href;}},addEventListener:(name,cb)=>{windowHandlers[name]=cb;},dispatchEvent:event => events.push(event.type)}, URL, CustomEvent:class { constructor(type) { this.type = type; } },
    localStorage:{getItem:() => ''}, sessionStorage:{getItem:() => ''}, AbortSignal:{timeout:() => undefined},
    fetch:(url,options) => new Promise(resolve => requests.push({url,options,resolve})), Intl, Date
  });
  return {node, requests, events, location, windowHandlers};
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const payload = {checks:[{label:'Test <script>', owner:'PPIC', requirement:'Test', stages:['MRP'], status:'COMPLETE', total:1, complete:1, issues:[], href:'/master-data/parts'}], summary:{COMPLETE:1}, scope:'Read only', checkedAt:'2026-09-01T00:00:00Z'};
const model=require('../public/js/ppic-readiness-recovery-model');
test('all eight tabs support deep links and one visible panel with keyboard navigation',()=>{
  const f=fixture('?month=2026-09&tab=delivery');assert.equal(f.node('prep-delivery-panel').hidden,false);assert.equal(f.node('prep-readiness-panel').hidden,true);assert.ok(f.events.includes('prep:open-workbook'));
  f.node('prep-page-delivery').handlers.keydown({key:'End',preventDefault(){}});assert.equal(f.node('prep-kpi-panel').hidden,false);assert.equal(f.node('prep-delivery-panel').hidden,true);assert.equal(f.node('prep-page-kpi').attrs['aria-selected'],'true');assert.match(f.location.href,/tab=kpi/);
  f.node('prep-page-kpi').handlers.keydown({key:'Home',preventDefault(){}});assert.equal(f.node('prep-readiness-panel').hidden,false);assert.equal(f.node('prep-kpi-panel').hidden,true);
});
test('recovery groups only the exact shared supplier field and retains affected contexts',()=>{
  const check={id:'supplier-parameter',label:'Supplier',owner:'Purchasing',stages:['MRP'],issues:['A','B'].map(code=>({code,partCode:code,supplierCode:'S',bomNumber:'BOM-'+code,fieldIssues:[{field:'leadTimeDays',label:'Lead time',href:'/master-data/suppliers/id/edit?key=S#field-leadTimeDays'},{field:'moq',label:'MOQ',href:null}]}))};
  const rows=model.tasks([check]);assert.equal(rows.length,3);const lead=rows.find(r=>r.field==='leadTimeDays');assert.equal(lead.contexts.length,2);assert.equal(lead.shared,true);
  assert.equal(model.filter(rows,{term:'BOM-B'}).length,2);
  assert.equal(model.filter(rows,{status:'FALLBACK'}).length,0);
  assert.equal(model.safeHref('//example.com'),false);assert.equal(model.safeHref('/\\example.com'),false);
});
test('filters and page restore through URL, and recheck failures preserve last results with a warning',async()=>{
  const f=fixture('?readiness_q=Need&readiness_category=c&readiness_status=INCOMPLETE&readiness_view=recovery&readiness_page=2');
  const row={...payload.checks[0],id:'c',label:'Need',status:'INCOMPLETE',issues:Array.from({length:20},(_,i)=>({code:'P'+i,missing:['Need '+i]}))};
  const report={...payload,month:'2026-09',checks:[row]};
  f.requests[0].resolve({ok:true,json:async()=>report});await settle();
  assert.equal(f.node('prep-readiness-category').value,'c');assert.match(f.node('prep-recovery-page-label').textContent,/2 \/ 2/);
  const old=f.node('prep-recovery-body').innerHTML;
  const pending=f.node('prep-readiness-refresh').handlers.click();f.requests[1].resolve({ok:false,json:async()=>({message:'Offline'})});await pending;
  assert.equal(f.node('prep-recovery-body').innerHTML,old);assert.match(f.node('prep-readiness-message').textContent,/hasil sebelumnya/);assert.match(f.location.href,/readiness_page=2/);
});
test('returning from master automatically rechecks while preserving data until the server responds',async()=>{
  const f=fixture();const report={...payload,month:'2026-09',checks:[{...payload.checks[0],id:'c',status:'INCOMPLETE',issues:[{code:'P',missing:['Need parameter']}]}]};
  f.requests[0].resolve({ok:true,json:async()=>report});await settle();
  const before=f.node('prep-recovery-body').innerHTML;
  f.node('prep-recovery-body').handlers.click({target:{closest:selector=>selector==='[data-recovery-link]' ? {} : null}});
  f.windowHandlers.focus();assert.equal(f.node('prep-recovery-notice').hidden,false);assert.equal(f.node('prep-recovery-body').innerHTML,before);
  assert.equal(f.requests.length,2,'focus rechecks saved master changes without a page reload');
});
test('missing supplier fields use a full-width table with one row per field and safe edit links',async()=>{
  const f=fixture();
  const row={...payload.checks[0],id:'supplier-parameter',status:'INCOMPLETE',issueCount:1,issues:[{code:'P · S · B',partCode:'P',supplierCode:'S',bomNumber:'B',name:'Part <name>',missing:['Lead time','MOQ'],fieldIssues:[{field:'leadTimeDays',label:'Lead time (hari)',href:'/master-data/suppliers/s/edit?key=S#field-leadTimeDays',actionLabel:'Isi lead time'},{field:'moq',label:'MOQ',href:'javascript:alert(1)',actionLabel:'Unavailable'}]}]};
  f.requests[0].resolve({ok:true,json:async()=>({...payload,checks:[row]})});await settle();
  const html=f.node('prep-recovery-body').innerHTML;
  assert.match(html,/data-recovery-link/);assert.match(html,/Part &lt;name&gt;/);
  assert.match(html,/key=S#field-leadTimeDays/);assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('Lihat 1 data perlu'));
});
test('fallback filter and supplier provenance remain visible and escaped', async () => {
  const f=fixture();const row={...payload.checks[0],status:'FALLBACK',complete:0,fallbackCount:1,fallbacks:[{code:'M<1>',name:'Machine',missing:['System fallback']}],sources:[{code:'B<1>',notes:['MOQ: MATERIAL_PRICE_LIST']}]};
  f.requests[0].resolve({ok:true,json:async()=>({...payload,checks:[row],summary:{FALLBACK:1}})});await settle();
  assert.match(f.node('prep-readiness-summary').innerHTML,/Menggunakan fallback/);
  f.node('prep-readiness-status').value='FALLBACK';f.node('prep-readiness-status').handlers.change();
  assert.match(f.node('prep-recovery-body').innerHTML,/M&lt;1&gt;/);assert.match(f.node('prep-readiness-body').innerHTML,/MOQ: MATERIAL_PRICE_LIST/);
  f.node('prep-readiness-status').value='INCOMPLETE';f.node('prep-readiness-status').handlers.change();assert.match(f.node('prep-readiness-body').innerHTML,/Tidak ada parameter/);
});
test('default only reads readiness; workbook opens explicitly and filters escape text', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /readiness\?month=2026-09$/);
  assert.equal(f.requests[0].options.method, undefined);
  assert.deepEqual(f.events, []);
  f.requests[0].resolve({ok:true,json:async () => payload}); await settle();
  f.node('prep-view-overview').handlers.click();
  assert.match(f.node('prep-readiness-body').innerHTML, /Test &lt;script&gt;/);
  f.node('prep-readiness-status').value = 'INCOMPLETE';
  f.node('prep-readiness-status').handlers.change();
  assert.match(f.node('prep-readiness-body').innerHTML, /Tidak ada parameter/);
  f.node('prep-page-workbook').handlers.click();
  assert.equal(f.node('prep-workbook-panel').hidden, false);
  assert.deepEqual(f.events, ['prep:open-workbook']);
  f.node('prep-page-readiness').handlers.click();
  assert.equal(f.node('prep-workbook-panel').hidden, true);
});
test('failed request never produces complete counters', async () => {
  const f = fixture();
  f.requests[0].resolve({ok:false,json:async () => ({message:'Server unavailable'})}); await settle();
  assert.equal(f.node('prep-readiness-summary').innerHTML, '');
  assert.match(f.node('prep-readiness-body').innerHTML, /tidak ditandai lengkap/);
  assert.equal(f.node('prep-readiness-refresh').disabled, false);
});
test('invalid period invalidates pending response and clears old results', async () => {
  const f = fixture();
  f.node('prep-readiness-month').value = '';
  await f.node('prep-readiness-month').handlers.change();
  f.requests[0].resolve({ok:true,json:async () => payload}); await settle();
  assert.equal(f.node('prep-readiness-summary').innerHTML, '');
  assert.match(f.node('prep-readiness-message').textContent, /periode yang valid/);
  assert.equal(f.node('prep-readiness-panel').attrs['aria-busy'], 'false');
});

test('derived tabs lazily request the same workbook source while keeping their own panel selected', () => {
  const f = fixture(), names = ['readiness','workbook','capacity','purchase','vendor'];
  f.node('prep-workbook-panel').innerHTML = 'unsaved workbook editor';
  for (const name of ['capacity','purchase','vendor','workbook','capacity','readiness']) {
    f.node('prep-page-' + name).handlers.click();
    for (const other of names) {
      assert.equal(f.node('prep-' + other + '-panel').hidden, other !== name, name + ' selects exactly one panel');
      assert.equal(f.node('prep-page-' + other).attrs['aria-selected'], String(other === name));
      assert.equal(f.node('prep-page-' + other).tabIndex, other === name ? 0 : -1);
    }
    assert.equal(f.node('prep-workbook-actions').hidden, name !== 'workbook');
    assert.equal(f.node('prep-workbook-panel').innerHTML, 'unsaved workbook editor', 'tab switching must not reset the draft DOM');
  }
  assert.equal(f.requests.length, 1, 'tab views issue no independent readiness or planning API requests');
  assert.deepEqual(f.events, Array(5).fill('prep:open-workbook'));
});

test('all eight lab tabs support roving keyboard selection, wrapping and Home/End', () => {
  const f = fixture();
  function press(from, key, expected) {
    let prevented = false;
    f.node('prep-page-' + from).handlers.keydown({ key, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(f.node('prep-page-' + expected).focused, true);
    assert.equal(f.node('prep-page-' + expected).attrs['aria-selected'], 'true');
    assert.equal(f.node('prep-' + expected + '-panel').hidden, false);
  }
  press('readiness', 'End', 'kpi');
  press('kpi', 'ArrowRight', 'readiness');
  press('readiness', 'ArrowLeft', 'kpi');
  press('kpi', 'ArrowLeft', 'delivery');
  press('delivery', 'ArrowLeft', 'daily');
  press('daily', 'ArrowLeft', 'vendor');
  press('vendor', 'ArrowLeft', 'purchase');
  press('purchase', 'ArrowLeft', 'capacity');
  press('capacity', 'Home', 'readiness');
  let prevented = false;
  const before = [...f.events];
  f.node('prep-page-readiness').handlers.keydown({ key: 'Tab', preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.deepEqual(f.events, before);
});
