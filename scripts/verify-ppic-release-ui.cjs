const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/js/ppic-workspace-release.js'),'utf8');
async function harness(firstResult,options={}){
 const nodes=new Map(),events={},requests=[],historyChanges=[];let persisted=null,mutationCount=0,uuidCount=0;
 const review={scenarioId:'S1',scenarioName:'Saved scenario',scenarioRevision:2,month:'2026-09',evaluatedAt:'2026-09-01T02:00:00Z',stale:false,bundleHash:'HASH',readiness:{counts:{UNKNOWN:1},canRelease:false},capabilities:{submit:true,approve:true,release:true},checks:[{id:'source',label:'Evidence',status:'UNKNOWN'}],bundle:{demand:[],groups:[],operations:[]}};
 const valid={id:'R1',scenarioId:'S1',scenarioRevision:2,revision:1,status:'SUBMITTED',review,submittedBy:'Planner',history:[],createdAt:'2026-09-01T02:00:00Z',replayed:true};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:id==='ppw-release-note'?'Bukti perlu ditinjau.':'',innerHTML:'',textContent:'',hidden:false,classList:{toggle(){}},querySelectorAll:()=>[],addEventListener:(name,fn)=>events[id+':'+name]=fn,showModal(){},close(){}});return nodes.get(id);};
 const root={addEventListener:(name,fn)=>events['root:'+name]=fn},location={href:'http://localhost/modules/planning-ppic/labs/release-baseline?month=2026-09&scenario=S1',origin:'http://localhost'};
 const setUrl=url=>{location.href=String(url);historyChanges.push(location.href);};
 const sandbox={window:{PPIC_WORKSPACE_CONTEXT:{page:{id:'L10'},filters:{month:'2026-09',scenario:'S1'}},addEventListener(){}},document:{querySelector:()=>root,getElementById:node,querySelectorAll:()=>[]},location,history:{replaceState(_a,_b,url){setUrl(url);},pushState(_a,_b,url){setUrl(url);}},localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},crypto:{randomUUID:()=> 'operation-'+(++uuidCount)},URL,URLSearchParams,Intl,Date,fetch:async(path,config={})=>{
  requests.push({path,...config});let payload;
  if(config.method){mutationCount++;if(mutationCount===1){if(options.invalidJson)return {ok:true,status:200,json:async()=>{throw new SyntaxError('Invalid JSON');}};payload=firstResult;}else{persisted=valid;payload={success:true,data:valid};}}
  else if(path.includes('/release/review'))payload=review;
  else if(path.includes('/release/requests/'))payload=persisted||valid;
  else if(path.includes('/release/requests'))payload={items:persisted?[persisted]:[]};
  else payload={items:[{id:'S1',name:'Saved scenario',revision:2}]};
  return {ok:true,status:200,json:async()=>payload};
 }};
 vm.createContext(sandbox);await vm.runInContext(source,sandbox);
 const click=async action=>events['root:click']({target:{closest:selector=>selector==='[data-release-action]'?{dataset:{releaseAction:action}}:null}});
 return {click,requests,historyChanges,notice:()=>node('ppw-notice').textContent,location};
}
test('L10 rejects incomplete mutation responses without URL writes or success and preserves replay identity',async()=>{
 for(const invalid of [{},{id:'R1',scenarioId:'S1',revision:0,status:'SUBMITTED'},{id:'R1',scenarioId:'S1',revision:1.5,status:'SUBMITTED'},{id:'R1',scenarioId:'S1',revision:1,status:'UNKNOWN'},{id:'R1',scenarioId:'OTHER',revision:1,status:'SUBMITTED'}]){
  const app=await harness(invalid);await app.click('submit');assert.match(app.notice(),/belum dapat diverifikasi/);assert.equal(app.historyChanges.length,0);assert.doesNotMatch(app.notice(),/Keputusan tersimpan|undefined/);await app.click('submit');const mutations=app.requests.filter(row=>row.method);assert.equal(mutations.length,2);assert.equal(mutations[0].body,mutations[1].body);assert.match(app.notice(),/Keputusan tersimpan di server · revisi 1/);assert.match(app.location.href,/release=R1/);
 }
});
test('L10 invalid JSON cannot claim mutation success and an identical valid replay can recover',async()=>{const app=await harness(null,{invalidJson:true});await app.click('submit');assert.match(app.notice(),/belum dapat diverifikasi/);assert.equal(app.historyChanges.length,0);await app.click('submit');const mutations=app.requests.filter(row=>row.method);assert.equal(mutations[0].body,mutations[1].body);assert.match(app.notice(),/Keputusan tersimpan/);});
