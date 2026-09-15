'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const { getModule, modules } = require('../src/moduleRegistry');
const ui = require('../public/js/purchasing-document-ui');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

async function render(view, slug, pageSlug, mode = 'create') {
  const module = getModule(slug);
  return ejs.renderFile(path.join(__dirname, '../views', view + '.ejs'), {
    title: 'Purchasing UI verification', module, page: module.pages.find(p => p.slug === pageSlug),
    modules, activeModule: slug, mode, recordKey: mode === 'edit' ? 'TEST/001' : 'TEST-001',
    purchaseCategory: 'material', pageScript: '', requiresAuth: true, socketUrl: '', mqttUrl: ''
  });
}
function uniqueId(html, id) { assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id); }

test('PR and PO create/edit retain field IDs, form association, comments and accessible tabs', async () => {
  for (const mode of ['create', 'edit']) {
    for (const kind of ['pr', 'po']) {
      const html = await render('purchasing/' + kind + '-form', 'purchasing', kind === 'pr' ? 'purchase-requisitions' : 'purchase-order', mode);
      assert.match(html, /purchasing-document-page purchasing-document-form/);
      assert.match(html, /goods-receipt-detail\.css/);
      assert.match(html, /purchasing-document\.css/);
      assert.match(html, /purchasing-document-ui\.js/);
      assert.equal((html.match(/data-purchase-tab=/g) || []).length, 2);
      assert.match(html, /data-purchase-tab="Detail Item"/);
      assert.match(html, /data-purchase-tab="Catatan"/);
      assert.match(html, /role="region" aria-label="Detail item Purchase/);
      assert.match(html, /<label class="visually-hidden" for="(?:pr|po)-notes"/);
      assert.match(html, /Komentar Purchase/);
      const ids = kind === 'pr' ? ['pr-form','pr-status','pr-save','pr-number','pr-category','pr-date','required-date','requested-by','department-id','priority','po-type','header-material','pr-subcategory','demand-bucket','source-type','pr-lines','pr-total','pr-notes','pr-add-line','pr-columns'] : ['po-form','po-status','po-number','po-number-prefix','po-partner-kind','po-supplier','po-date','po-delivery-date','po-type','po-currency','po-payment-terms','po-subcategory','po-partner-name','po-contact','po-phone','po-email','po-address','po-lines','po-total','po-item-count','po-notes','po-add-line'];
      ids.forEach(id => uniqueId(html, id));
      const form = html.slice(html.indexOf('<form id="' + kind + '-form"'), html.indexOf('</form>', html.indexOf('<form id="' + kind + '-form"')));
      for (const id of [kind + '-lines', kind + '-notes']) assert.ok(form.includes('id="' + id + '"'), id + ' remains in form');
      if (kind === 'pr') assert.match(html, /id="pr-save"[^>]+form="pr-form"/);
      if (mode === 'edit') assert.match(html, /TEST%2F001/);
    }
  }
});

test('new document shell is scoped to PR/PO while GR, stock and other detail pages retain their shells', async () => {
  for (const page of ['purchase-order', 'purchase-requisitions']) {
    const html = await render('operations/detail', 'purchasing', page);
    assert.match(html, /purchasing-document-page/);
    for (const id of ['ops-detail-actions','ops-detail-status','ops-workflow-actions','ops-detail-shell','ops-detail-fields','ops-document-meta','ops-detail-collections']) uniqueId(html, id);
    assert.match(html, /class="gr-detail-metadata"/);
    assert.match(html, /purchasing-document-ui\.js/);
  }
  for (const [slug, page, expected] of [['incoming','goods-receipts','goods-receipt-detail-page'],['inventory','stock-balances','stock-balance-detail-page'],['purchasing','purchase-suggestions','purchase-suggestion-page']]) {
    const html = await render('operations/detail', slug, page);
    assert.ok(html.includes(expected));
    assert.doesNotMatch(html, /purchasing-document-ui\.js|purchasing-document-page/);
    uniqueId(html, 'ops-detail-status');
  }
});

// Minimal DOM fixture: exercises moving existing nodes and listeners without a
// browser, network requests, or submitting real purchasing documents.
function fixture() {
  const doc = { createElement: tag => new Element(tag), querySelector: () => null, activeElement: null };
  class Element {
    constructor(tag = 'div') { this.tagName=tag.toUpperCase(); this.ownerDocument=doc; this.children=[]; this.dataset={}; this.attrs={}; this.events={}; this.className=''; this.id=''; this.hidden=false; this.textContent=''; this.classList={add: name => { if (!this.matches('.'+name)) this.className+=' '+name; }, toggle: (name, on) => {this.className=this.className.split(' ').filter(c=>c!==name).join(' '); if(on)this.className+=' '+name;}}; }
    append(node) { if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(c=>c!==node); node.parentElement=this; this.children.push(node); }
    setAttribute(key,value) { this.attrs[key]=value; }
    addEventListener(name,fn) { this.events[name]=fn; }
    focus() { doc.activeElement=this; }
    matches(selector) { if(selector[0]==='.')return this.className.split(' ').includes(selector.slice(1)); if(selector==='[data-purchase-tab]')return this.dataset.purchaseTab!=null; return this.tagName.toLowerCase()===selector; }
    closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
    contains(node) { return node===this||this.children.some(c=>c.contains(node)); }
    querySelectorAll(selector) { return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]); }
    querySelector(selector) { if(selector===':scope > [data-purchase-workspace]')return this.children.find(c=>c.dataset.purchaseWorkspace)||null; return this.querySelectorAll(selector)[0]||null; }
  }
  const form=doc.createElement('form'),container=doc.createElement('div'); form.append(container);
  const cards=['Detail Item','Catatan'].map(label=>{const card=doc.createElement('section'); card.dataset.purchaseTab=label;card.className='ops-detail-card';container.append(card);return card;});
  const input=doc.createElement('input');input.value='Existing unsaved value';input.addEventListener('change',()=>{});cards[1].append(input);
  return {doc,form,container,cards,input};
}

test('tabs preserve original input nodes and state, expose ARIA relationships and are idempotent', () => {
  const f=fixture(),listener=f.input.events.change;
  const result=ui.tabs(f.container,f.cards,'test','Test tabs');
  assert.equal(f.cards[1].children[0],f.input);assert.equal(f.input.value,'Existing unsaved value');assert.equal(f.input.events.change,listener);
  assert.deepEqual(f.cards.map(c=>c.hidden),[false,true]);
  result.buttons.forEach((button,i)=>{assert.equal(button.type,'button');assert.equal(button.attrs['aria-controls'],f.cards[i].id);assert.equal(f.cards[i].attrs['aria-labelledby'],button.id);});
  result.buttons[1].events.click();assert.deepEqual(f.cards.map(c=>c.hidden),[true,false]);assert.equal(result.buttons[1].attrs['aria-selected'],'true');
  assert.equal(ui.tabs(f.container,f.cards,'test','Test tabs'),null);
});

test('tabs support arrows, Home and End with focus and no accidental form submit', () => {
  const f=fixture(),{buttons}=ui.tabs(f.container,f.cards,'test','Test tabs');let prevented=0;
  const press=(index,key)=>buttons[index].events.keydown({key,preventDefault(){prevented++;}});
  press(0,'ArrowLeft');assert.equal(f.doc.activeElement,buttons[1]);
  press(1,'Home');assert.equal(f.doc.activeElement,buttons[0]);
  press(0,'End');assert.equal(f.doc.activeElement,buttons[1]);
  press(1,'ArrowRight');assert.equal(f.doc.activeElement,buttons[0]);assert.equal(prevented,4);
});

test('invalid controls reveal the correct form tab and collapsed details', () => {
  const f=fixture();f.doc.querySelector=()=>f.container;
  const details=f.doc.createElement('details');f.cards[1].append(details);details.append(f.input);
  ui.mountForm(f.doc);f.form.events.invalid({target:f.input});
  assert.deepEqual(f.cards.map(c=>c.hidden),[true,false]);assert.equal(details.open,true);
});

test('detail tabs keep blockers visible and preserve nested cards inside their parent panel', () => {
  const f=fixture(),blocker=f.doc.createElement('section'),nested=f.doc.createElement('section');
  blocker.className='ops-detail-card mpp-readiness-card';f.container.append(blocker);
  nested.className='ops-detail-card';f.cards[0].append(nested);
  const page={querySelector:()=>f.container,querySelectorAll:()=>[]};f.doc.querySelector=()=>page;
  const result=ui.mountDetails(f.doc);
  assert.equal(result.cards.length,2);assert.equal(blocker.parentElement,f.container);assert.equal(blocker.hidden,false);
  assert.equal(nested.parentElement,f.cards[0]);result.activate(1);assert.equal(blocker.hidden,false);
});

test('PO summary uses existing totals after quantity, tax, discount and conversion calculation', () => {
  const source=read('public/js/purchasing-po-form.js');
  const functions=source.slice(source.indexOf('  function syncLine('),source.indexOf('  function lookupItem('));
  const nodes={'po-currency':{value:'IDR'},'po-total':{},'po-item-count':{}};const rows=[];
  nodes['po-lines']={querySelectorAll:()=>rows};
  const context={$:id=>nodes[id],number:value=>Number(value)||0,Intl,materialModel:require('../public/js/purchasing-material-model')};vm.createContext(context);vm.runInContext(functions,context);
  function row(qty,price,record={},type='OTHER') {
    const fields={};for(const key of ['type','form','uom','factor','price','qty'])fields[key]={value:{type,form:'COIL',uom:'PCS',factor:200,price,qty}[key],classList:{toggle(){}}};
    fields.total={};fields.source={};
    const value={_record:record,querySelector:selector=>selector==='[data-price-source]'?fields.source:fields[selector.replace('[data-line-','').replace(']','')]};rows.push(value);return value;
  }
  const first=row(10,100,{discountType:'nominal',discount:100,tax:11});context.syncLine(first);assert.equal(first._total,999.0000000000001);
  const material=row(2,0,{},'RAW_MATERIAL');material._price={unitPrice:3,uomCode:'KG',minimumCharge:1500,partnerName:'Test',currencyCode:'IDR'};context.syncLine(material);
  assert.equal(material._total,1500);assert.equal(nodes['po-item-count'].textContent,'2 item');assert.equal(nodes['po-total'].textContent,'IDR 2.499');
  rows.pop();context.updateSummary();assert.equal(nodes['po-item-count'].textContent,'1 item');assert.equal(nodes['po-total'].textContent,'IDR 999');
  rows.pop();context.updateSummary();assert.equal(nodes['po-total'].textContent,'IDR 0');
});
