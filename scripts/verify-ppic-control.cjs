'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ejs=require('ejs');
const {groups}=require('../src/ppicPageMap');
const script=fs.readFileSync(path.join(__dirname,'../public/js/ppic-control.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const nodes=new Map(),requests=[],intervals=[],listeners={};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,dataset:{},attrs:{},classList:{add(){},remove(){}},addEventListener(key,fn){this[key]=fn;},setAttribute(key,value){this.attrs[key]=value;},focus(){this.focused=true;}});return nodes.get(id);};
  const tabs=groups[2].tabs.map(([key,label])=>{const tab=node('tab-'+key);tab.dataset.controlView=key;tab.textContent=label;return tab;});
  node('ppic-control').dataset.initialView='customer';node('control-month').value='2026-09';
  const location={href:'http://localhost:3100/modules/planning-ppic/control'};
  vm.runInNewContext(script,{document:{getElementById:node,querySelectorAll:()=>tabs,visibilityState:'visible',addEventListener(key,fn){listeners[key]=fn;}},window:{addEventListener(key,fn){listeners[key]=fn;}},localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),setInterval:fn=>intervals.push(fn),URL,URLSearchParams,AbortSignal:{timeout(){}},location,history:{replaceState(_a,_b,url){location.href=String(url);}},Intl,Date});
  const respond=async(index,payload,ok=true)=>{requests[index].resolve({ok,json:async()=>payload});await tick();};
  return {node,tabs,requests,respond,intervals,listeners,location};
}
const payload=(view='customer',month='2026-09')=>({month,view,status:'LOCKED',basis:'Release terpilih',columns:[{key:'partCode',label:'Part'},{key:'actualQty',label:'Aktual',type:'number'},{key:'sourceNumber',label:'Sumber',type:'link'},{key:'status',label:'Status'}],items:[{partCode:'P<script>',actualQty:null,sourceNumber:'PR/1',sourceHref:'/modules/purchasing/purchase-requisitions/PR%2F1',status:'UNLINKED'}],actualItems:[{sourceNumber:'LOG',partCode:'ACTUAL',actualQty:0,status:'PENDING_APPROVAL',issue:'Belum terhubung'}],summary:{rowCount:1,verifiedRows:0,unlinkedRows:1,actualEventCount:1},warnings:[]});
test('three PPIC groups expose 8/8/5 tabs and retain legacy routes as hidden pages',()=>{
  const {getModule,getPage}=require('../src/moduleRegistry'),ppic=getModule('planning-ppic');
  assert.deepEqual(ppic.pages.filter(p=>!p.navHidden).map(p=>[p.slug,p.tabs.length]),[['preparation',8],['released',8],['control',5]]);
  assert.equal(getPage('planning-ppic','monthly-production-plans').navHidden,true);
  assert.equal(new Set(groups.flatMap(group=>group.tabs.map((tab,i)=>group.code+'.'+(i+1)))).size,21);
});
test('control renders numbered tabs, shared navigation and month without old stage dock',async()=>{
  const {modules,getModule}=require('../src/moduleRegistry');
  const html=await ejs.renderFile(path.join(__dirname,'../views/ppic/control.ejs'),{title:groups[2].label,module:getModule('planning-ppic'),modules,activeModule:'planning-ppic',activePage:'control',controlTabs:groups[2].tabs,initialMonth:'2026-09',initialView:'loading',requiresAuth:true,pageScript:'',socketUrl:'',mqttUrl:''});
  assert.equal((html.match(/data-ppic-section=/g)||[]).length,3);assert.equal((html.match(/data-control-view=/g)||[]).length,5);
  assert.match(html,/control-tab-loading[^>]+aria-selected="true"/);assert.match(html,/\/control\?month=2026-09/);assert.doesNotMatch(html,/ppic-nav-stage/);
  assert.match(html,/data-enterprise-table="off"/);
});
test('control keeps unknown actual distinct from zero, escapes cells and restricts document links',async()=>{
  const f=fixture(),data=payload();data.items.push({partCode:'bad',sourceNumber:'Unsafe',sourceHref:'/modules/\\evil.example'});
  await f.respond(0,data);
  assert.match(f.node('control-body').innerHTML,/P&lt;script&gt;/);assert.match(f.node('control-body').innerHTML,/—/);assert.match(f.node('control-body').innerHTML,/PR%2F1/);assert.doesNotMatch(f.node('control-body').innerHTML,/href="[^\"]*evil/);
  f.node('control-actual').click();assert.match(f.node('control-body').innerHTML,/ACTUAL/);assert.match(f.node('control-body').innerHTML,/>0<\/td>/);assert.doesNotMatch(f.node('control-body').innerHTML,/P&lt;script&gt;/);
  assert.match(f.node('control-basis').textContent,/belum dihitung/);assert.equal(f.requests.length,1);
});
test('all five tabs load own API view and stale month/view responses cannot replace selection',async()=>{
  const f=fixture();f.node('tab-loading').click();assert.match(f.requests[1].url,/view=loading/);
  await f.respond(1,payload('loading'));await f.respond(0,payload());assert.equal(f.node('tab-loading').attrs['aria-selected'],'true');
  f.node('control-month').value='2026-10';f.node('control-month').change();f.node('tab-vendor').click();
  await f.respond(3,payload('vendor','2026-10'));await f.respond(2,payload('loading','2026-10'));
  assert.equal(f.node('tab-vendor').attrs['aria-selected'],'true');assert.match(f.location.href,/month=2026-10/);assert.match(f.location.href,/view=vendor/);
  for(const key of ['supplier','production','customer']){f.node('tab-'+key).click();assert.match(f.requests.at(-1).url,new RegExp('view='+key));await f.respond(f.requests.length-1,payload(key,'2026-10'));}
});
test('multiple actual documents retain individual safe links and evidence dates',async()=>{
  const f=fixture(),data=payload();data.items[0].references=[{number:'LOG-A',href:'/modules/production/production-logs/LOG-A',date:'2026-09-02',quantity:3},{number:'LOG-B',href:'/modules/production/production-logs/LOG-B',date:'2026-10-01',quantity:4},{number:'Bad',href:'https://evil.example'}];
  await f.respond(0,data);const html=f.node('control-body').innerHTML;
  assert.match(html,/href="\/modules\/production\/production-logs\/LOG-A"/);assert.match(html,/href="\/modules\/production\/production-logs\/LOG-B"/);assert.match(html,/2026-10-01/);assert.doesNotMatch(html,/href="https:/);
  f.node('control-actual').click();assert.match(f.node('control-basis').textContent,/di luar bulan/);
});
test('drafts, failures and mismatched responses clear stale data without implying zero actual',async()=>{
  const f=fixture();await f.respond(0,payload());f.node('control-refresh').click();await f.respond(1,{month:'2026-09',view:'customer',status:'DRAFT',items:[]});
  assert.equal(f.node('control-summary').hidden,true);assert.match(f.node('control-message').textContent,/Belum ada rencana/);assert.doesNotMatch(f.node('control-body').innerHTML,/P&lt;script&gt;/);
  f.node('control-refresh').click();await f.respond(2,{message:'Sumber aktual gagal'},false);assert.equal(f.node('control-message').textContent,'Sumber aktual gagal');
  f.node('control-refresh').click();await f.respond(3,payload('vendor'));assert.match(f.node('control-message').textContent,/tidak sesuai/);
  f.node('control-month').value='2026-13';f.node('control-month').change();await tick();assert.equal(f.requests.length,4);assert.match(f.node('control-message').textContent,/bulan monitoring/);
});
test('search, status filter, paging and keyboard tab navigation do not reload the page',async()=>{
  const f=fixture(),data=payload();data.items=Array.from({length:65},(_,i)=>({partCode:'PART-'+i,status:i%2?'FULFILLED':'UNLINKED'}));await f.respond(0,data);
  assert.equal(f.node('control-page').textContent,'1 / 2');f.node('control-next').click();assert.equal(f.node('control-page').textContent,'2 / 2');
  f.node('control-filter').value='FULFILLED';f.node('control-filter').change();assert.equal(f.node('control-count').textContent,'32 baris');
  f.node('control-search').value='PART-1';f.node('control-search').input();assert.equal(f.node('control-count').textContent,'6 baris');assert.equal(f.requests.length,1);
  f.node('control-reset').click();assert.equal(f.node('control-count').textContent,'65 baris');
  f.tabs[0].keydown({key:'End',preventDefault(){}});assert.equal(f.tabs[4].focused,true);assert.match(f.requests[1].url,/view=vendor/);
});
test('periodic updates refresh actuals even after lock and suppress simultaneous reads',async()=>{
  const f=fixture();f.intervals[0]();assert.equal(f.requests.length,1);await f.respond(0,payload());
  f.intervals[0]();assert.equal(f.requests.length,2);f.listeners.focus();assert.equal(f.requests.length,2);
  const data=payload();data.items[0].actualQty=12;data.items[0].status='FULFILLED';await f.respond(1,data);assert.match(f.node('control-body').innerHTML,/>12<\/td>/);
  assert.equal(f.requests[1].options.cache,'no-store');
});
test('shared group links follow month changes from Lab, Released and Control',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/js/ppic-sections.js'),'utf8'),events={},links=groups.map(g=>({href:'http://localhost:3100/modules/planning-ppic/'+g.slug}));
  const location={href:'http://localhost:3100/modules/planning-ppic/preparation'};
  vm.runInNewContext(source,{document:{querySelectorAll:()=>links,addEventListener(key,fn){events[key]=fn;}},window:{addEventListener(key,fn){events[key]=fn;}},URL,location});
  for(const id of ['prep-plan-month','release-month','control-month']){events.change({target:{id,value:'2026-10'}});assert.ok(links.every(link=>link.href.endsWith('?month=2026-10')));}
  events['prep:month-loaded']({detail:{month:'2027-01'}});assert.ok(links.every(link=>link.href.endsWith('?month=2027-01')));
  events.change({target:{id:'control-month',value:'invalid'}});assert.ok(links.every(link=>link.href.endsWith('?month=2027-01')));
});
