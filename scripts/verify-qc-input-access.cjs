const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'../public/js',file),'utf8');
test('QC edit preserves source identity including vendor receipt',()=>{
  const code=read('production-shared-form.js');
  const c={};vm.createContext(c);
  vm.runInContext(code.slice(code.indexOf('  function qcSourceFields'),code.indexOf('  const token')),c);
  const source={vendorProcessOrderId:'vpo',moId:'mo',partId:'part',uomCode:'pcs',batchNumber:'lot'};
  const payload=c.qcSourceFields(source);
  assert.equal(payload.vendorProcessOrderId,'vpo');
  assert.equal(payload.moId,'mo');
  assert.equal(payload.productionLogId,null);
  assert.equal(payload.batchNumber,'lot');
  assert.equal(Object.hasOwn(payload,'uomCode'),false);
  assert.equal(c.qcSourceFields({productionLogId:'log',woId:'wo'}).productionLogId,'log');
  assert.match(code,/Object.assign\(body, qcSourceFields\(loadedRecord\)\)/);
});
test('Draft QC exposes input link separately from stock release',()=>{
  const code=read('operations-detail.js');
  const block=code.slice(code.indexOf('    } else if (config.page.slug === "quality-inspections")'),code.indexOf('    } else if (config.page.ngDispositionFlow)'));
  assert.match(block,/status === "draft"/);
  assert.match(block,/\/edit#field-qtyPassed/);
  assert.match(block,/Input Hasil QC \/ Qty OK & NG/);
  assert.match(block,/actionButton\("complete"/);
});
