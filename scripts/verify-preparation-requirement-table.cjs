'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const derived=require('../public/js/ppic-preparation-derived');

test('Requirement pages retain their titles and original table layout without weekly controls or assets',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../views/ppic/preparation.ejs'),'utf8');
  assert.match(source,/04 <span>Purchase Requirement/);assert.match(source,/05 <span>Vendor Requirement/);
  assert.doesNotMatch(source,/prep-requirement-matrix|prep-requirement-controls|ppic-preparation-requirements|Kebutuhan Mingguan/);
  assert.match(derived.tableHead('purchase'),/Tanggal perlu/);
  assert.match(derived.tableHead('vendor'),/Keluar ke vendor.*Masuk kembali.*Vendor.*Nama PT \/ Vendor/);
  assert.doesNotMatch(derived.tableHead('vendor'),/Current Stock|M−1/);
});
test('vendor company name is next to code, escaped, searchable and unknown remains blank rather than guessed',()=>{
  const columns=derived.columns.vendor,name=columns.findIndex(([key])=>key==='vendorName');
  assert.equal(name,columns.findIndex(([key])=>key==='vendorCode')+1);
  const rows=[{vendorCode:'V001',vendorName:'PT. Vendor & Mitra',quantity:25000},{vendorCode:'V002',vendorName:null,quantity:5000}];
  const html=derived.tableRows('vendor',rows);
  assert.match(html,/PT\. Vendor &amp; Mitra/);assert.match(html,/25\.000/);assert.match(html,/5\.000/);
  assert.deepEqual(derived.filterRows(rows,'vendor & mitra','vendor'),[rows[0]]);
  const cells=derived.tableRows('vendor',[rows[1]]).match(/<td\b[\s\S]*?<\/td>/g);
  assert.match(cells[name],/>—<\/span>/);
  const attack=derived.tableRows('vendor',[{vendorName:'<img src=x onerror="attack">'}]);
  assert.doesNotMatch(attack,/<img\b/);assert.match(attack,/&lt;img/);
});
