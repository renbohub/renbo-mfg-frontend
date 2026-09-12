importScripts("/js/ppic-sandbox-engine.js?v=20260912-8-delivery-qty");
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,result:PpicSandboxEngine.calculate(data.seed,data.overrides)}); }
  catch(error) { self.postMessage({id:data.id,error:error.message}); }
};
