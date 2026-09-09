"use strict";
// Isolated browser fixtures: all API requests are intercepted, no ERP data writes.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright"), ejs = require("ejs");
const router = require("../src/routes/masterData"), pricing = require("../public/js/monthly-pricing");
const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
function pageData(slug, mode) {
  const routePath = mode === "create" ? "/:entity/new" : "/:entity/:id/edit";
  const handler = router.stack.find(layer=>layer.route?.path === routePath && layer.route.methods.get).route.stack[0].handle;
  let rendered;
  handler({params:{entity:slug,id:"fixture-price"},query:{}},{render:(view,data)=>{rendered={view,data};}});
  assert.equal(rendered.view,"master-data/entity-form");
  if(slug!=="parts")assert.equal(rendered.data.config.monthlyPricing,true);
  assert.match(rendered.data.pageScript,/inheritance/);
  return rendered;
}
const sourceVersions = [{id:"fixture-price",updatedAt:"2026-09-08T00:00:00.000Z"}];
const months = pricing.months;
const fields = anchors => Object.fromEntries(months.map(m=>[m,anchors[m]??null]));
const meta = anchors => ({...fields(anchors),monthlyOverrides:Object.fromEntries(months.map(m=>[m,anchors[m]!=null])),monthlyResolved:Object.fromEntries(pricing.resolve(anchors).map(m=>[m.month,m.value]))});
const bootstrap = `<script>window.EnterpriseLookup={setSelected:(input,item)=>{const option=new Option(item.text||item.id,item.id,true,true);input.add(option);},getSelected:(input)=>({id:input?.value})};document.addEventListener('document-form:loaded',()=>{window.formReady=true;},true);</script>`;
function renderPage(slug, mode) {
  const {view,data} = pageData(slug,mode);
  const content = ejs.render(read(`views/${view}.ejs`),data,{filename:path.join(root,`views/${view}.ejs`),includer:(original,parsed)=>original.includes("document-shell")?{filename:parsed}:{template:" "}});
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial;margin:0}*{box-sizing:border-box}.d-none{display:none!important}.app-container{padding:20px;max-width:1600px;margin:auto}.entity-form-workspace{display:block}.form-section{margin:20px 0}.form-grid{display:grid;gap:12px}.field-wide{grid-column:1/-1}.form-field>label{display:block}.form-control,.form-select{padding:9px;border:1px solid #aaa;border-radius:5px;min-width:0;width:100%}.form-section-nav{display:none}.document-shell{display:flex;justify-content:space-between;align-items:center}.form-label{font-size:12px}.btn{padding:8px;cursor:pointer}.monthly-vendor-meta label{min-width:0}</style>${bootstrap}</head><body>${content}<script src="/js/entity-form.js"></script></body></html>`;
}
(async()=>{
  const browser = await chromium.launch({channel:"msedge",headless:true});
  const errors=[]; let scenario, submissions=[];
  try {
    const page = await browser.newPage({viewport:{width:1366,height:950}}); page.on("pageerror",error=>errors.push(error.message));
    await page.route("http://pricing.test/**",async route=>{
      const url = new URL(route.request().url());
      if(url.pathname.startsWith("/js/")) return route.fulfill({contentType:"application/javascript",body:read(`public${url.pathname}`)});
      if(url.pathname.startsWith("/css/")) return route.fulfill({contentType:"text/css",body:read(`public${url.pathname}`)});
      if(route.request().method()!=="GET") {
        const req=route.request(),type=req.headers()["content-type"];
        let body;
        if(type.includes("multipart/form-data")) {
          body=Object.fromEntries(await new Response(req.postDataBuffer(),{headers:{"content-type":type}}).formData());
          months.forEach(m=>{if(Object.hasOwn(body,m))body[m]=body[m]===""?null:Number(body[m]);});
          if(body.monthlySourceVersions)body.monthlySourceVersions=JSON.parse(body.monthlySourceVersions);
        } else body=JSON.parse(req.postData());
        submissions.push({slug:scenario.slug,method:req.method(),body});
        return route.fulfill({status:400,json:{message:"Captured verification only"}});
      }
      if(url.pathname.startsWith("/lookups/api/")) return route.fulfill({json:{result:{id:decodeURIComponent(url.pathname.split('/').pop()),text:"Fixture"}}});
      if(url.pathname==="/master-data/api/vendor-processes") return route.fulfill({json:{data:[{id:"proc-a",vendorProcessCode:"PA",vendorProcessName:"Process A",vendorIds:["fixture-vendor"]},{id:"proc-b",vendorProcessCode:"PB",vendorProcessName:"Process B",vendorIds:["fixture-vendor"]}]}});
      if(url.pathname==="/master-data/api/uom") return route.fulfill({json:{data:[{uomCode:"PCS",uomName:"Pieces"}]}});
      if(url.pathname===`/master-data/api/${scenario.slug}/fixture-price`) {
        if(scenario.slug==='parts')return route.fulfill({json:{id:'fixture-price',partCode:'LEGACY-TEST',partName:'Fixture part',itemType:'RAW',rawType:'PURCHASE_PART',category:'LEGACY-CATEGORY'}});
        const anchors = {january:100,june:120,september:90};
        const detail = {vendorProcessId:"proc-a",uomCode:"PCS",...meta(anchors)};
        return route.fulfill({json:{id:"fixture-price",pricingYear:2026,isActive:true,vendorId:"fixture-vendor",partId:"fixture-part",uomCode:"PCS",...(scenario.ineligible?{priceEligibility:{eligible:false,reason:"Fixture: routing BOM Vendor belum berlaku."}}:{}),monthlyPlan:{pricingYear:2026,...meta(anchors),sourceVersions,sourceCount:1,details:[detail]}}});
      }
      if(url.pathname.startsWith("/master-data/api/")) return route.fulfill({json:{data:[]}});
      return route.fulfill({contentType:"text/html",body:renderPage(scenario.slug,scenario.mode)});
    });
    async function open(slug,mode,ineligible=false) {
      scenario={slug,mode,ineligible}; await page.goto(`http://pricing.test/master-data/${slug}/${mode==="create"?"new":"fixture-price/edit"}`, {waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>window.formReady===true);
      assert.equal(await page.locator('[name="unitPrice"], [data-detail-price]').count(),0,`${slug}/${mode} must use monthly editor`);
      assert.equal(await page.locator('[data-month-price], [data-detail-month]').count(),12);
      assert.equal(await page.locator('[name="pricingYear"]').evaluate(el=>el.readOnly),mode==="edit");
      if(slug==="vendor-price-lists") {await page.locator('[data-detail-process]').selectOption("proc-a");await page.locator('[data-detail-uom]').selectOption("PCS");}
    }
    const input = m => page.locator(scenario.slug==="vendor-price-lists"?`[data-detail-month="${m}"]`:`[name="${m}"]`).first();
    const value = m=>input(m).inputValue();
    async function set(m,v) {await input(m).fill(v);await input(m).blur();}
    async function submit() {
      await page.evaluate(()=>{
        document.querySelectorAll('#entity-form [required]').forEach(input=>{if(input.value)return;if(input.tagName==='SELECT')input.add(new Option('Fixture','fixture-value',true,true));else if(input.type!=='hidden')input.value=input.type==='number'?'1':'Fixture';});
        document.querySelector('#entity-form').requestSubmit();
      });
      await page.waitForFunction(()=>document.querySelector('#form-alert').textContent==='Captured verification only');
      return submissions.at(-1);
    }
    for(const slug of ["part-price-lists","material-price-lists","vendor-price-lists"]) {
      await open(slug,"create");
      await set("january","100"); assert.equal(await value("december"),"100");
      await set("september","90"); await set("june","120");
      assert.equal(await value("may"),"100"); assert.equal(await value("august"),"120"); assert.equal(await value("december"),"90");
      assert.match(await input("july").locator('..').textContent(),/Mengikuti Juni/);
      assert.match(await input("june").locator('..').textContent(),/↑ 20 \(20%\)/);
      assert.ok(await input("july").evaluate(el=>el.closest('.monthly-price-cell').classList.contains('monthly-price-inherited')));
      await set("january","110"); await set("june","");
      assert.equal(await value("june"),"110",`${slug} clearing restores inheritance`); assert.equal(await value("august"),"110"); assert.equal(await value("september"),"90");
      await set("june","0"); assert.equal(await value("july"),"0"); assert.match(await input("june").locator('..').textContent(),/↓ 110 \(100%\)/);
      let saved=await submit();
      const row=slug==="vendor-price-lists"?JSON.parse(saved.body.details)[0]:saved.body;
      assert.equal(saved.method,"POST");assert.equal(saved.body.pricingMode,"MONTHLY");
      assert.equal(row.january,110);assert.equal(row.june,0);assert.equal(row.july,null);assert.equal(row.september,90);assert.equal(row.december,null);
      await open(slug,"edit"); assert.equal(await value("july"),"120");
      await set("june","130"); assert.equal(await value("august"),"130"); assert.equal(await value("september"),"90");
      await set("june",""); assert.equal(await value("july"),"100");
      await set("june","140"); await page.locator('[data-reset-month="june"]').click(); assert.equal(await value("july"),"100");
      saved=await submit(); const editRow=slug==="vendor-price-lists"?JSON.parse(saved.body.details)[0]:saved.body;
      assert.equal(saved.method,"PATCH"); assert.deepEqual(saved.body.monthlySourceVersions,sourceVersions);
      assert.equal(editRow.june,null);assert.equal(editRow.july,null);assert.equal(editRow.september,90);
    }
    // Each process keeps its own anchors through add/remove and re-render.
    await open("vendor-price-lists","create");await set("january","100");await set("september","90");
    await page.locator('#vendor-price-detail-add').click();
    await page.locator('[data-vendor-price-row]').nth(1).locator('[data-detail-process]').selectOption('proc-b');
    await page.locator('[data-vendor-price-row]').nth(1).locator('[data-detail-uom]').selectOption('PCS');
    await page.locator('[data-vendor-price-row]').nth(1).locator('[data-detail-month="january"]').fill('200');
    await page.locator('[data-vendor-price-row]').nth(1).locator('[data-detail-month="january"]').blur();
    await page.locator('[data-detail-remove="0"]').click();assert.equal(await value('december'),'200');
    assert.equal(await input('january').evaluate(el=>el.dataset.priceOverride),'true');assert.equal(await input('december').evaluate(el=>el.dataset.priceOverride),'false');
    await open("material-price-lists","create");await set("january","100");await set("june","120");
    await page.locator('[data-fill-price]').fill('110');await page.locator('[data-fill-months]').click();
    assert.equal(await value('may'),'110');assert.equal(await value('july'),'120','toolbar preserves a future override');
    await input('june').evaluate(el=>{el.value='';el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await value('july'),'110','change-only clearing inherits without creating an anchor');
    await set('june','125');await set('september','90');
    const output=path.resolve(root,'../output/pricing-update');fs.mkdirSync(output,{recursive:true});
    for(const width of [390,768,1366]) {
      await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`monthly form overflow ${width}`);
      if(width!==768)await page.locator('#form-section-harga-bulanan').screenshot({path:path.join(output,`monthly-price-editor-${width}.png`)});
    }
    for(const slug of ['part-price-lists','vendor-price-lists']) {
      await open(slug,'edit',true);assert.equal(await page.locator('#save-button').isDisabled(),true);
      assert.match(await page.locator('#form-alert').textContent(),/routing BOM Vendor/);
      const prior=submissions.length;
      await page.evaluate(()=>document.querySelector('#entity-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(submissions.length,prior,'blocked historical price cannot submit even with a synthetic submit');
    }
    scenario={slug:'parts',mode:'edit'};
    await page.goto('http://pricing.test/master-data/parts/fixture-price/edit',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.formReady===true);
    assert.equal(await page.locator('[name="category"]').inputValue(),'LEGACY-CATEGORY');
    assert.match(await page.locator('[name="category"] option:checked').textContent(),/nilai tersimpan/);
    assert.equal(await page.locator('#purchase-part-routing-link').isVisible(),true);
    await page.locator('[name="partName"]').fill('Unrelated edit');
    const preserved=await submit();assert.equal(preserved.body.category,'LEGACY-CATEGORY','unrelated part edit preserves category outside current PD/WD/MD choices');
    assert.deepEqual(errors,[]);
    console.log(`PASS monthly pricing browser: real NEW/EDIT route+EJS for 3 slugs, sparse POST/PATCH, clear/zero/future overrides, vendor row isolation, eligibility guard, legacy category preservation, indicators, and 390/768/1366px; ${submissions.length} intercepted submissions, zero live writes.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
