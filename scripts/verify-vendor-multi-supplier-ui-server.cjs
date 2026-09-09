const express=require('express');
const path=require('node:path');
const app=express(); app.use(express.json());
app.use(express.static(path.join(__dirname,'../public')));
app.use('/vendor/bootstrap',express.static(path.join(__dirname,'../node_modules/bootstrap/dist')));
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const vendors=['A','B','C'].map(s=>({id:`supplier-${s}`,vendorCode:`TEST-${s}`,vendorName:`Supplier simulasi ${s}`}));
const key='child-test|process-test';
const part={id:'child-test',partNumber:'PART TEST',partName:'Child part simulasi',partCode:'CHILD-TEST'};
const fg={id:'fg-test',partNumber:'FG TEST',partName:'FG simulasi',partCode:'FG-TEST'};
let saved=null;
app.get('/lookups/api/:source/resolve/:id',(req,res)=>res.json({result:{id:req.params.id,text:req.params.id==='fg-test'?'FG simulasi':req.params.id}}));
app.get('/master-data/vendor-bom-prices/context/:id',(req,res)=>res.json({recordId:req.params.id,pricingYear:2026,currencyCode:'IDR',customerId:null,fgPartId:'fg-test'}));
app.post('/master-data/vendor-bom-prices/preview',(req,res)=>{
  const ids=req.body.vendorSelections?.[key]||['supplier-A'];
  const rows=ids.map(vendorId=>({key,quoteKey:JSON.stringify([key,vendorId]),vendorId,isBomDefault:vendorId==='supplier-A',part,vendorProcessId:'process-test',processCode:'TEST',processName:'Proses simulasi',category:'OTHER',availableVendors:vendors,bomDefaults:[{routeId:'route-test',bomNumber:'BOM-TEST',vendorId:'supplier-A',vendor:vendors[0]}],uomCode:'PCS',priceToken:`token-${vendorId}`,priceListId:vendorId==='supplier-A'?'price-A':null,priceSource:vendorId==='supplier-A'?'Harga tersimpan':'Belum ada harga',notes:'',quotationFiles:[],problem:vendorId?null:'Pilih supplier aktif yang melayani proses ini.',...Object.fromEntries(months.map(m=>[m,vendorId==='supplier-A'?(m==='january'?100:m==='june'?120:null):null]))}));
  res.json({fg,bom:{noReg:'BOM-TEST',revision:1},bomFingerprint:'ui-fixture',pricingYear:2026,currencyCode:'IDR',rows,uoms:[{uomCode:'PCS',uomName:'Pieces'}]});
});
app.post('/master-data/vendor-bom-prices/save',express.raw({type:()=>true,limit:'1mb'}),(req,res)=>{
  const body=req.body.toString(); const match=body.match(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/); if(!match)return res.status(400).json({message:'Missing payload'});
  saved=JSON.parse(match[1]);res.json({ok:true,processes:1,supplierPrices:saved.rows.length});
});
app.get('/master-data/vendor-price-lists',(req,res)=>res.type('html').send('<h1>Hasil uji antarmuka</h1><pre>'+JSON.stringify(saved,null,2).replace(/</g,'&lt;')+'</pre>'));
app.get('/fixture',async(req,res)=>{
  let html=await (await fetch('http://localhost:3100/master-data/vendor-price-lists/4a50740d-ec4d-4f35-afaa-dafa3be3fa8c/edit')).text();
  html=html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(all,attrs)=>/vendor-bom-config|src="\/js\/(monthly-pricing|vendor-bom-price-form)\.js/.test(attrs)?all:'');
  const setup='<script>window.erpBusinessNow=()=>new Date("2026-09-09");window.EnterpriseLookup={setSelected:(el,r)=>{el.replaceChildren(new Option(r.text,r.id,true,true));},clear:el=>{el.value="";},getSelected:()=>null};</script>';
  html=html.replace('<script id="vendor-bom-config"',setup+'<script id="vendor-bom-config"');
  html=html.replace('<body>','<body><div style="padding:12px;background:#fff3cd">UJI ANTARMUKA — DATA SIMULASI. Tidak terhubung ke penyimpanan ERP.</div>');res.type('html').send(html);
});
app.listen(3122,'127.0.0.1',()=>console.log('UI fixture ready at http://127.0.0.1:3122/fixture'));