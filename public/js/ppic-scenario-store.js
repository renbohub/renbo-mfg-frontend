(function(root){
  'use strict';
  function create({fetch:transport,token=()=>'',base='/modules/api/planning-ppic/workspace',operationId=()=>crypto.randomUUID()}){
    let pending;
    async function request(path,method='GET',body){
      const response=await transport(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},...(body?{body:JSON.stringify(body)}:{})});
      const value=await response.json().catch(()=>({}));
      if(!response.ok){const error=Object.assign(new Error(value.message||'Skenario gagal diproses ('+response.status+').'),{status:response.status,code:value.code});throw error;}
      return value.data??value;
    }
    return {
      list:month=>request('/scenarios?month='+encodeURIComponent(month)),
      get:id=>request('/scenarios/'+encodeURIComponent(id)),
      async save(body,id){
        const key=JSON.stringify([id||null,body]);
        if(pending?.key!==key)pending={key,body:{...body,operationId:operationId()}};
        // An uncertain transport failure retains the same operation identity.
        const result=await request('/scenarios'+(id?'/'+encodeURIComponent(id):''),id?'PUT':'POST',pending.body);
        pending=null;return result;
      }
    };
  }
  root.PpicScenarioStore={create};if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
