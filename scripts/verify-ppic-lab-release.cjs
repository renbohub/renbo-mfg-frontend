'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ejs=require('ejs');
const source=fs.readFileSync(path.join(__dirname,'../public/js/ppic-lab-released.js'),'utf8');
const tables=require('../public/js/ppic-released-tables.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const data=()=>({month:'2026-09',id:'release-id',revision:3,status:'LOCKED',name:'Plan <test>',releasedBy:'PPIC',releasedAt:'2026-09-15T01:00:00Z',counts:{monthly:1,daily:1,supplier:2,vendor:0,delivery:1},views:{monthly:[{partCode:'P<script>',quantity:7,uomCode:'PCS'}],daily:[{date:'2026-09-12',quantity:7,segments:[{start:300,end:360}]}],supplier:[{partCode:'MAT-1',purchaseGroup:'MATERIAL',requiredQty:12,prNumber:'PR/1',materialWidth:30},{partCode:'BUY-1',purchaseGroup:'PURCHASE_PART',requiredQty:4,prNumber:'PR/2'}],vendor:[],delivery:[{date:'2026-09-15',quantity:7}]},documents:[{type:'PR_SUPPLIER',number:'PR/1'},{type:'PR_SUPPLIER',number:'PR/2'}]});
test('all department pages carry their scope, show frozen rows and avoid PPIC-only actual requests',async()=>{
  const pages=require('../../library/ppic-planning/released-pages.cjs');
  const {getModule}=require('../src/moduleRegistry');
  const permissions=require('../src/masterDataRegistry').getPermissionCatalog();
  for(const page of pages){
    assert.ok(getModule(page.module).pages.some(p=>p.slug===page.slug&&!p.navHidden));
    assert.equal(permissions.find(p=>p.moduleCode===page.module&&p.pageCode===page.slug).resourceCode,page.resource);
    const f=fixture(page.view,'monthly',page.module+'/'+page.slug),url=new URL(f.requests[0].url,'http://localhost');
    assert.equal(url.searchParams.get('scope'),page.module+'/'+page.slug);
    assert.equal(url.searchParams.get('view'),page.view);
    const payload=data(),items=payload.views[page.source].filter(row=>!page.category||row.purchaseGroup===page.category);
    await f.respond(0,{...payload,views:undefined,items});
    assert.equal(f.requests.length,1,page.module+'/'+page.slug+' must not need PPIC control access');
    assert.equal(f.node('release-empty').hidden,true);
    assert.doesNotMatch(f.node('release-message').textContent,/gagal/);
    if(page.module==='production'&&page.view==='daily')assert.match(f.node('release-department-link').href,/daily-production-schedules\?date=2026-09-01$/);
    if(page.module==='purchasing')assert.match(f.node('release-department-link').href,/\/purchasing\/purchase-requisitions\?month=2026-09$/);
  }
});
function fixture(view='',initial='monthly',scope='',withFeedback=false){
  const nodes=new Map(),requests=[],handlers={},timers=[],dailyUpdates=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,dataset:{},attrs:{},focus(){this.focused=true;},classList:{add(){},remove(){}},addEventListener(type,fn){this[type]=fn;},setAttribute(key,value){this.attrs[key]=value;}});return nodes.get(id);};
  const tabs=(view?[]:['monthly','mrp','daily','recovery','delivery','vendor','incoming-supplier','incoming-material']).map(key=>{const n=node('tab-'+key);n.dataset.releaseTab=key;return n;});
  node('release-month').value='2026-09';node('release-recovery-scope').value='plan';let location={href:'http://localhost:3100/modules/planning-ppic/released?view='+initial};
  vm.runInNewContext(source,{document:{visibilityState:'visible',querySelector:()=>({dataset:{releaseView:view,releaseScope:scope,initialView:initial}}),getElementById:node,querySelectorAll:selector=>selector==='[data-release-tab]'?tabs:[],addEventListener(type,fn){handlers[type]=fn;}},window:{PpicConfirmationFeedback:withFeedback?require('../public/js/ppic-confirmation-feedback'):undefined,PPICReleasedTables:tables,PpicReleasedDaily:{mount:()=>({update:state=>dailyUpdates.push(state)})},addEventListener(type,fn){handlers[type]=fn;}},localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},fetch:(url)=>new Promise(resolve=>requests.push({url,resolve})),URL,URLSearchParams,location,history:{replaceState(_a,_b,url){location.href=String(url);}},AbortSignal:{timeout(){}},Intl,Date,setInterval:fn=>timers.push(fn)});
  const respond=async(index,payload,ok=true)=>{requests[index].resolve({ok,json:async()=>payload});await tick();};
  return {node,requests,respond,handlers,timers,location,dailyUpdates};
}

test('confirmed ETA polling updates official schedule, markers and selected view without reload',async()=>{
  const f=fixture('','monthly','',true),initial=data();initial.views.monthly[0].id='monthly-1';initial.feedback={revision:0,changes:[],pendingCount:1};await f.respond(0,initial);
  f.timers[0]();assert.match(f.requests[1].url,/preparation\/released/);
  const updated=data();updated.views.monthly[0].id='monthly-1';updated.views.monthly[0].quantity=9;updated.feedback={revision:1,confirmedCount:1,pendingCount:0,changes:[{view:'monthly',rowId:'monthly-1',originalDate:'2026-09-18',currentDate:'2026-09-20'}]};
  await f.respond(1,updated);
  assert.match(f.node('release-body').innerHTML,/ppic-eta-changed/);assert.match(f.node('release-body').innerHTML,/2026-09-18 → 2026-09-20/);assert.match(f.node('release-confirmation-feedback').innerHTML,/1 dikonfirmasi/);assert.match(f.location.href,/view=monthly/);
});
test('slow effective-plan polling cannot overwrite another month and department reads retain scope',async()=>{
  const f=fixture('monthly','monthly','production/monthly-plan',true),initial=data();initial.items=initial.views.monthly;initial.feedback={revision:0};await f.respond(0,initial);
  f.timers[0]();assert.match(f.requests[1].url,/scope=production%2Fmonthly-plan/);
  f.node('release-month').value='2026-10';f.node('release-month').change();await f.respond(2,{status:'DRAFT',month:'2026-10'});await f.respond(1,{...initial,feedback:{revision:1,confirmedCount:99}});
  assert.equal(f.node('release-confirmation-feedback').hidden,true);assert.doesNotMatch(f.node('release-confirmation-feedback').innerHTML,/99/);assert.match(f.location.href,/2026-10/);
});

test('release tabs show exact snapshots, split incoming categories and keep safe PR links without reload',async()=>{
  const f=fixture();await f.respond(0,data());
  assert.match(f.node('release-body').innerHTML,/P&lt;script&gt;/);assert.match(f.node('release-info').innerHTML,/Plan &lt;test&gt;/);
  f.node('tab-mrp').click();assert.match(f.node('release-body').innerHTML,/PR%2F1/);assert.match(f.node('release-body').innerHTML,/>12</);assert.doesNotMatch(f.node('release-body').innerHTML,/BUY-1/);
  f.node('release-subtabs').click({target:{closest:()=>({dataset:{releaseMaterial:'PURCHASE_PART'}})}});assert.match(f.node('release-body').innerHTML,/BUY-1/);assert.doesNotMatch(f.node('release-body').innerHTML,/MAT-1/);
  f.node('tab-incoming-material').click();assert.match(f.node('release-body').innerHTML,/MAT-1/);assert.doesNotMatch(f.node('release-body').innerHTML,/BUY-1/);assert.doesNotMatch(f.node('release-document-links').innerHTML,/PR%2F2/);
  f.node('tab-incoming-supplier').click();assert.match(f.node('release-body').innerHTML,/BUY-1/);assert.doesNotMatch(f.node('release-body').innerHTML,/MAT-1/);assert.match(f.location.href,/view=incoming-supplier/);
  f.node('tab-vendor').click();assert.match(f.node('release-body').innerHTML,/Tidak ada data/);assert.equal(f.requests.length,3);
  f.node('tab-daily').click();assert.equal(f.node('release-data').hidden,true);assert.equal(f.dailyUpdates.at(-1).active,true);assert.equal(f.dailyUpdates.at(-1).payload.status,'LOCKED');
});

test('out-of-order month response cannot overwrite current selection; failures clear old rows',async()=>{
  const f=fixture();f.node('release-month').value='2026-10';f.node('release-month').change();
  await f.respond(1,{month:'2026-10',status:'DRAFT'});await f.respond(0,data());
  assert.equal(f.node('release-data').hidden,true);assert.match(f.node('release-message').innerHTML,/2026-10/);
  f.node('release-refresh').click();await f.respond(2,{message:'Forbidden'},false);assert.equal(f.node('release-data').hidden,true);assert.equal(f.node('release-message').textContent,'Forbidden');
});

test('department pages use only their permitted projection and poll until release then stop',async()=>{
  const f=fixture('supplier');assert.match(f.requests[0].url,/view=supplier/);
  await f.respond(0,{status:'DRAFT'});f.timers[0]();assert.equal(f.requests.length,2);
  const payload=data();await f.respond(1,{...payload,items:payload.views.supplier});assert.match(f.node('release-body').innerHTML,/>12</);
  f.timers[0]();assert.equal(f.requests.length,2);assert.equal(f.node('release-department-link').hidden,true);
});

test('all six release routes render and PPIC always shows eight numbered tabs',async()=>{
  const {modules,getModule}=require('../src/moduleRegistry');
  for(const [moduleSlug,view,activePage] of [['planning-ppic','','released'],['production','monthly','monthly-plan'],['production','daily','daily-plan'],['purchasing','supplier','pr-supplier'],['purchasing','vendor','pr-vendor'],['outgoing','delivery','delivery-plan-schedule']]){
    const html=await ejs.renderFile(path.join(__dirname,'../views/ppic/released.ejs'),{title:'PPIC Released Data',module:getModule(moduleSlug),modules,activeModule:moduleSlug,activePage,releaseView:view,initialMonth:'2026-09',pageScript:'/js/ppic-lab-released.js',requiresAuth:true,socketUrl:'',mqttUrl:''});
    assert.ok(html.includes('data-release-view="'+view+'"'));assert.ok(html.includes('id="release-month"'));assert.ok(html.includes('?month=2026-09'));
    if(!view){assert.ok(!html.includes('Demand Tahunan'));assert.equal((html.match(/data-release-tab=/g)||[]).length,8);assert.match(html,/id="release-tabs"[^>]*aria-label="Halaman PPIC Released Data"/);assert.doesNotMatch(html,/id="release-tabs"[^>]*hidden/);}
  }
});

test('MRP search and category preserve selected URL and keyboard tab navigation',async()=>{
  const f=fixture('','mrp');await f.respond(0,data());assert.match(f.node('release-view-title').textContent,/Material Requirement/);
  f.node('release-category').value='MATERIAL';f.node('release-category').change();assert.doesNotMatch(f.node('release-body').innerHTML,/BUY-1/);
  f.node('release-search').value='absent';f.node('release-search').input();assert.match(f.node('release-body').innerHTML,/Tidak ada data sesuai/);
  f.node('tab-mrp').keydown({key:'End',preventDefault(){}});assert.equal(f.node('tab-incoming-material').focused,true);assert.equal(f.node('tab-incoming-material').attrs['aria-selected'],'true');
});

test('recovery loads actual separately, keeps unknown qty empty, polls updates and exposes source errors',async()=>{
  const f=fixture('','recovery');await f.respond(0,data());assert.match(f.requests[1].url,/control.*view=recovery/);
  const actual={month:'2026-09',status:'LOCKED',view:'recovery',asOf:'2026-09-15T02:00:00Z',basis:'Aktual approved',columns:[{key:'plannedQty',label:'Qty release',type:'number'},{key:'actualQty',label:'Aktual terhubung',type:'number'},{key:'issue',label:'Keterangan',type:'text'}],actualColumns:[{key:'verifiedQty',label:'Qty terhubung release',type:'number'},{key:'sourceNumber',label:'Sumber',type:'link'}],items:[{date:'2026-09-12',partCode:'P1',actualQty:null,recoveryQty:null,plannedQty:7,issue:'Belum terhubung'}],actualItems:[{partCode:'ACTUAL',actualQty:3,verifiedQty:null,sourceNumber:'LOG<1>',sourceHref:'/modules/production/daily-production-logs/LOG-1'}],warnings:[]};
  await f.respond(1,actual);assert.match(f.node('release-body').innerHTML,/Belum terhubung/);assert.match(f.node('release-body').innerHTML,/class="is-numeric">—/);
  f.node('release-recovery-scope').value='actual';f.node('release-recovery-scope').change();assert.match(f.node('release-body').innerHTML,/LOG&lt;1&gt;/);assert.match(f.node('release-body').innerHTML,/daily-production-logs\/LOG-1/);assert.match(f.node('release-head').innerHTML,/Qty terhubung release/);
  f.timers[0]();assert.equal(f.requests.length,3);await f.respond(2,{message:'Source unavailable'},false);assert.equal(f.node('release-data').hidden,true);assert.match(f.node('release-message').textContent,/Aktual produksi gagal dimuat: Source unavailable/);
  f.node('tab-monthly').click();assert.equal(f.node('release-data').hidden,false);assert.match(f.node('release-body').innerHTML,/P&lt;script&gt;/);
});

test('stale recovery response cannot enter another month and unreleased tabs remain navigable',async()=>{
  const f=fixture('','recovery');await f.respond(0,data());f.node('release-month').value='2026-10';f.node('release-month').change();
  await f.respond(2,{month:'2026-10',status:'DRAFT'});await f.respond(1,{status:'LOCKED',items:[{partCode:'STALE'}]});
  assert.doesNotMatch(f.node('release-body').innerHTML,/STALE/);f.node('tab-incoming-material').click();assert.equal(f.node('tab-incoming-material').attrs['aria-selected'],'true');assert.equal(f.node('release-data').hidden,true);assert.match(f.location.href,/month=2026-10/);
});

test('recovery renders each document reference safely and explains related activity outside the month',async()=>{
  const f=fixture('','recovery');await f.respond(0,data());
  await f.respond(1,{month:'2026-09',status:'LOCKED',items:[{sourceNumber:'LOG-1, LOG-2',sourceHref:'/modules/production/production-logs/LOG-1',references:[{number:'LOG-1',href:'/modules/production/production-logs/LOG-1'},{number:'LOG-2',href:'/modules/production/production-logs/LOG-2'},{number:'Unsafe',href:'javascript:alert(1)'}]}],actualItems:[]});
  const html=f.node('release-body').innerHTML;assert.match(html,/href="\/modules\/production\/production-logs\/LOG-1">LOG-1<\/a>/);assert.match(html,/href="\/modules\/production\/production-logs\/LOG-2">LOG-2<\/a>/);assert.doesNotMatch(html,/javascript:/);
  f.node('release-recovery-scope').value='actual';f.node('release-recovery-scope').change();assert.match(f.node('release-basis').textContent,/dokumen di luar bulan/);
});

test('locked controller blocks mutation actions while still permitting month navigation and export',async()=>{
  const script=fs.readFileSync(path.join(__dirname,'../public/js/ppic-preparation.js'),'utf8');
  const action=script.match(/^  async function action\(.*$/m)[0],events=[];
  const context=vm.createContext({busy:false,locked:()=>true,message:text=>events.push(text),controls(){}});
  const run=vm.runInContext(action+'\naction',context);
  await run(()=>assert.fail('locked mutation executed'));assert.match(events[0],/sudah lock/);
  let read=false;await run(async()=>{read=true;},true);assert.equal(read,true);
});

test('fulfillment joins exact release rows, updates live and clears stale actual after failure',async()=>{
  const f=fixture('','delivery'),payload=data();payload.views.delivery=[{id:'DEL-1',customerCode:'C01',partCode:'P1',quantity:10,uomCode:'PCS'}];
  await f.respond(0,payload);assert.match(f.requests[1].url,/view=customer/);assert.match(f.node('release-body').innerHTML,/C01/);assert.match(f.node('release-head').innerHTML,/Remaining/);
  const control={status:'LOCKED',month:'2026-09',releaseId:payload.id,items:[{id:'DEL-1',actualQty:4,status:'PARTIAL'}]};
  await f.respond(1,control);assert.match(f.node('release-body').innerHTML,/class="is-numeric">6</);assert.match(f.node('release-body').innerHTML,/aria-valuenow="40"/);
  f.timers[0]();await f.respond(2,{message:'Unavailable'},false);assert.equal(f.node('release-data').hidden,false);assert.match(f.node('release-body').innerHTML,/class="is-numeric">—</);assert.doesNotMatch(f.node('release-body').innerHTML,/aria-valuenow="40"/);assert.match(f.node('release-message').textContent,/gagal dimuat/);
});

test('fulfillment refuses another release and pending old-month requests cannot overwrite new selection',async()=>{
  const f=fixture('','delivery');await f.respond(0,data());
  await f.respond(1,{status:'LOCKED',month:'2026-09',releaseId:'WRONG',items:[]});assert.match(f.node('release-message').textContent,/Versi aktual tidak sesuai/);
  f.timers[0]();f.node('release-month').value='2026-10';f.node('release-month').change();
  await f.respond(3,{status:'DRAFT',month:'2026-10'});await f.respond(2,{status:'LOCKED',month:'2026-09',releaseId:'release-id',items:[{id:'OLD',actualQty:9}]});
  assert.equal(f.node('release-data').hidden,true);assert.doesNotMatch(f.node('release-body').innerHTML,/OLD/);
});

test('monthly machine selector and daily summary stay independent from row search',async()=>{
  const f=fixture(),payload=data();payload.views.monthly=[{id:JSON.stringify(['ROW1','M1','PCS']),sourceRowId:'ROW1',machineCode:'MC1',partCode:'PART1',quantity:10},{id:JSON.stringify(['ROW2','M2','PCS']),sourceRowId:'ROW2',machineCode:'MC2',partCode:'PART2',quantity:20}];payload.machineLabels=[{id:'M1',machineCode:'MC1',machineName:'P-1'},{id:'M2',machineCode:'MC2',machineName:'S-1'}];
  await f.respond(0,payload);assert.match(f.node('release-subtabs').innerHTML,/P-1/);assert.doesNotMatch(f.node('release-body').innerHTML,/PART2/);
  f.node('release-subtabs').click({target:{closest:()=>({dataset:{releaseMachine:'M2'}})}});assert.match(f.node('release-body').innerHTML,/PART2/);assert.match(f.node('release-monthly-summary').innerHTML,/Resume harian · S-1/);
  const summary=f.node('release-monthly-summary').innerHTML;f.node('release-search').value='absent';f.node('release-search').input();assert.equal(f.node('release-monthly-summary').innerHTML,summary);assert.match(f.node('release-body').innerHTML,/Tidak ada data produksi/);
});

test('daily module receives inactive and failure transitions without exposing the old table',async()=>{
  const f=fixture('','daily');await f.respond(0,data());assert.equal(f.node('release-data').hidden,true);assert.equal(f.dailyUpdates.at(-1).active,true);
  f.node('tab-mrp').click();assert.equal(f.dailyUpdates.at(-1).active,false);assert.equal(f.node('release-data').hidden,false);
  f.node('tab-daily').click();f.node('release-month').value='';f.node('release-month').change();assert.equal(f.dailyUpdates.at(-1).loading,false);assert.match(f.dailyUpdates.at(-1).error,/bulan yang valid/);
});
