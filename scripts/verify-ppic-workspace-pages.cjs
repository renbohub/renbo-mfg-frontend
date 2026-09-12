const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const registry=require('../src/ppicWorkspaceRegistry');
const {modules,getModule}=require('../src/moduleRegistry');
const createRouter=require('../src/routes/ppic-workspace');
const listen=app=>new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
const close=server=>new Promise(resolve=>server.close(resolve));
test('31 unique manifest routes preserve only bounded query filters',()=>{
  assert.equal(registry.pages.length,31);
  assert.equal(new Set(registry.pages.map(page=>page.id)).size,31);
  assert.equal(new Set(registry.pages.map(page=>page.href)).size,31);
  const filters=registry.filters({month:'2026-13',customer:'C003',resource:'M-001',scenario:'s1',q:'retainer',bad:'secret',plant:['ALL']},'2026-09');
  assert.equal(filters.month,'2026-09');assert.equal(filters.bad,undefined);assert.equal(filters.plant,undefined);
  const url=new URL(registry.href(registry.find('labs','mps-gantt'),filters),'http://localhost');
  assert.equal(url.searchParams.get('customer'),'C003');assert.equal(url.searchParams.get('scenario'),'s1');
  assert.equal(registry.find('labs','missing'),undefined);
});
test('all 31 routes render existing header; unimplemented pages stay explicit; domain defaults follow business month',async()=>{
  const app=express();app.set('view engine','ejs');app.set('views',path.join(__dirname,'../views'));
  app.use('/modules',createRouter({backendUrl:'http://127.0.0.1:1',authHeader:()=>({}),common:activeModule=>({requiresAuth:true,modules,activeModule,socketUrl:'',mqttUrl:''}),getModule,businessNow:()=>new Date('2026-08-20T00:00:00Z')}));
  const server=await listen(app),origin='http://127.0.0.1:'+server.address().port;
  try{for(const page of registry.pages){const res=await fetch(origin+page.href+'?customer=C003&resource=M-001');const html=await res.text();assert.equal(res.status,200,page.id+': '+html.slice(0,200));assert.ok(html.includes('/img/mitsutoyo-indonesia-logo.png'),page.id+' original header');assert.ok(html.includes('PPIC Labs')&&html.includes('Execution Control')&&html.includes('Analytics'));assert.ok(html.includes('customer=C003'),page.id+' filter links');assert.ok(html.includes(page.domain==='labs'?'2026-09':page.domain==='analytics'?'2026-07':'2026-08'),page.id+' business period');if(page.id!=='L04'){assert.ok(html.includes('data-implemented="'+page.implemented+'"'));assert.ok(html.includes('data-page="'+page.id+'"'));assert.ok(html.includes(page.id==='L10'?'/js/ppic-workspace-release.js':['E01','E02','E03','E04','E05'].includes(page.id)?'/js/ppic-execution-workspace.js':['E06','E07','E08','E09','E10'].includes(page.id)?'/js/ppic-execution-followup.js':page.domain==='analytics' && page.id!=='A09'?'/js/ppic-analytics-workspace.js':page.id==='A09'?'/js/ppic-improvement-actions.js':'/js/ppic-module-workspace.js')); }}}finally{await close(server);}
});
test('workspace proxy rejects anonymous access, forwards page headers/body/query, preserves errors and revisions',async()=>{
  const seen=[],backend=express();backend.use(express.json());backend.use((req,res)=>{seen.push({path:req.path,query:req.query,headers:req.headers,body:req.body,method:req.method});if(req.query.deny)return res.status(403).json({code:'PLANT_SCOPE_UNAVAILABLE',message:'Scope ditolak'});if(req.method==='PUT')return res.status(409).json({code:'STALE_REVISION',details:{currentRevision:3}});return res.json({items:[],revision:2});});
  const api=await listen(backend),app=express();app.use(express.json());app.use('/modules',createRouter({backendUrl:'http://127.0.0.1:'+api.address().port,authHeader:req=>({authorization:req.get('authorization'),'x-page-code':req.get('x-page-code')||''}),common:()=>({}),getModule,businessNow:()=>new Date()}));const proxy=await listen(app),origin='http://127.0.0.1:'+proxy.address().port;
  try{const endpoint=origin+'/modules/api/planning-ppic/workspace';let res=await fetch(endpoint);assert.equal(res.status,401);assert.equal(seen.length,0);res=await fetch(endpoint+'?month=2026-09&customer=C003',{headers:{authorization:'Bearer fixture','x-page-code':'master-production-schedule'}});assert.equal(res.status,200);assert.equal(seen[0].path,'/api/planning/workspace');assert.equal(seen[0].query.customer,'C003');assert.equal(seen[0].headers['x-page-code'],'master-production-schedule');assert.match(res.headers.get('cache-control'),/no-store/);res=await fetch(endpoint+'?deny=1',{headers:{authorization:'Bearer fixture'}});assert.equal(res.status,403);assert.equal((await res.json()).code,'PLANT_SCOPE_UNAVAILABLE');res=await fetch(endpoint+'/scenarios/s1',{method:'PUT',headers:{authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({expectedRevision:2,operationId:'op-fixture'})});assert.equal(res.status,409);assert.equal((await res.json()).details.currentRevision,3);assert.equal(seen.at(-1).body.expectedRevision,2);res=await fetch(endpoint+'/seed',{method:'POST',headers:{authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({month:'2026-09',force:false})});assert.equal(res.status,200);assert.equal(seen.at(-1).path,'/api/planning/workspace/seed');for(const suffix of ['/execution','/followup/delivery-fulfillment','/analytics']){res=await fetch(endpoint+suffix+'?date=2026-09-12&month=2026-09',{headers:{authorization:'Bearer fixture'}});assert.equal(res.status,200);assert.equal(seen.at(-1).path,'/api/planning/workspace'+suffix);assert.equal(seen.at(-1).query.date,'2026-09-12');}}finally{await close(proxy);await close(api);}
});

test('Execution preserves explicit month without a date, and explicit date sets the matching month',async()=>{
  const app=express();app.set('view engine','ejs');app.set('views',path.join(__dirname,'../views'));
  app.use('/modules',createRouter({backendUrl:'http://127.0.0.1:1',authHeader:()=>({}),common:activeModule=>({requiresAuth:true,modules,activeModule,socketUrl:'',mqttUrl:''}),getModule,businessNow:()=>new Date('2026-08-31T00:00:00Z')}));
  const server=await listen(app),origin='http://127.0.0.1:'+server.address().port;
  try{for(const [query,month,date] of [['month=2026-09','2026-09','2026-09-01'],['month=2026-08','2026-08','2026-08-31'],['month=2026-08&date=2026-09-12','2026-09','2026-09-12']]){const html=await (await fetch(origin+'/modules/planning-ppic/execution/delivery-fulfillment?'+query)).text(),context=JSON.parse(html.match(/window\.PPIC_WORKSPACE_CONTEXT=(.*?);<\/script>/)[1]);assert.equal(context.filters.month,month);assert.equal(context.filters.date,date);}}
  finally{await close(server);}
});
