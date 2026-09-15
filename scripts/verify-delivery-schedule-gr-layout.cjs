const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ejs=require('ejs');
const {getModule,modules}=require('../src/moduleRegistry');
async function render(slug,pageSlug){const module=getModule(slug);return ejs.renderFile(path.join(__dirname,'../views/operations/detail.ejs'),{title:'Layout verification',module,page:module.pages.find(p=>p.slug===pageSlug),modules,activeModule:slug,recordKey:'DS-20260828-BBAC2E7C',purchaseCategory:'',pageScript:'',requiresAuth:true,socketUrl:'',mqttUrl:''});}
test('delivery schedule uses GR header, metadata shell and retained action targets',async()=>{
 const html=await render('outgoing','delivery-schedules');
 assert.match(html,/goods-receipt-detail-page delivery-schedule-detail-page/);
 assert.match(html,/gr-detail-commandbar/);assert.match(html,/gr-detail-metadata/);assert.match(html,/goods-receipt-detail.css/);
 for(const id of ['ops-workflow-actions','ops-detail-status','ops-detail-fields','ops-document-meta','ops-detail-collections','ops-detail-alert'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.doesNotMatch(html,/Workflow &amp; Aksi|<h2>Workflow & Aksi/);
 assert.match(html,/\/modules\/outgoing\/delivery-schedules/);
});
test('GR and unrelated outgoing pages keep their own layout',async()=>{
 const gr=await render('incoming','goods-receipts');assert.match(gr,/gr-detail-commandbar/);assert.doesNotMatch(gr,/delivery-schedule-detail-page/);
 const module=getModule('outgoing');const other=module.pages.find(p=>p.slug!=='delivery-schedules'&&p.kind!=='report');
 if(other){const html=await render('outgoing',other.slug);assert.doesNotMatch(html,/delivery-schedule-detail-page/);}
});
test('delivery schedule retains actions and uses accessible GR tabs',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/js/operations-detail.js'),'utf8');
 assert.match(js,/isStockBalancePage\(\) \|\| isDeliverySchedulePage\(\)\) initializeGoodsReceiptWorkspace/);
 assert.match(js,/Unduh Surat Jalan \+ QR/);assert.match(js,/Scan Surat Jalan/);
 assert.match(js,/isDeliverySchedulePage\(\) && node.matches\('\.mpp-readiness-card'\)/);
});
