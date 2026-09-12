const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../public/js/ppic-scenario-store');
test('server scenario save keeps exact qty and CAS revision and only reports real success',async()=>{
  const requests=[],store=create({token:()=>'test',operationId:()=>'op-1',fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({success:true,data:{id:'s1',revision:3}})};}});
  const saved=await store.save({month:'2026-09',expectedRevision:2,payload:{version:1,overrides:{fg:{qty:1123}}}},'s1');
  assert.equal(saved.revision,3);assert.equal(requests[0].options.method,'PUT');const body=JSON.parse(requests[0].options.body);assert.equal(body.payload.overrides.fg.qty,1123);assert.equal(body.expectedRevision,2);assert.equal(body.operationId,'op-1');
});
test('uncertain retry reuses operation ID, changed payload gets a new identity',async()=>{
  let seq=0;const calls=[];const store=create({operationId:()=>String(++seq),fetch:async(_url,o)=>{calls.push(JSON.parse(o.body));throw Error('offline');}});
  await assert.rejects(store.save({name:'A'}));await assert.rejects(store.save({name:'A'}));await assert.rejects(store.save({name:'B'}));
  assert.deepEqual(calls.map(x=>x.operationId),['1','1','2']);
});
test('forbidden and stale writes propagate error rather than reporting saved',async()=>{
  for(const status of [403,409]){const store=create({operationId:()=>'x',fetch:async()=>({ok:false,status,json:async()=>({message:'Rejected',code:'STALE'})})});await assert.rejects(store.save({}),e=>e.status===status&&e.code==='STALE');}
});
