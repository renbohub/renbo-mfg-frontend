const express=require('express');
const router=express.Router();
const backendUrl=(process.env.BACKEND_URL||'http://localhost:5017').replace(/\/$/,'');
router.get('/master-data/parts/:key/routing',(req,res)=>res.render('master-data/part-routing',{partKey:req.params.key,routingKey:'',mode:'part'}));
router.get('/modules/engineering/routings/new',(req,res)=>res.render('master-data/part-routing',{partKey:'',routingKey:'',mode:'new'}));
router.get('/modules/engineering/routings/:key/edit',(req,res)=>res.render('master-data/part-routing',{partKey:'',routingKey:req.params.key,mode:'edit'}));
router.all('/routing-tools/api/*path',async(req,res)=>{
  const segments=Array.isArray(req.params.path)?req.params.path:[req.params.path];
  if(segments.some(segment=>!segment||segment==='.'||segment==='..'||/[\\/\x00-\x1f]/.test(segment)))return res.status(400).json({message:'Path tidak valid.'});
  if(!['routing-options','routings','parts'].includes(segments[0]))return res.sendStatus(404);
  if(!req.get('authorization'))return res.status(401).json({message:'Login diperlukan.'});
  if(!['GET','POST','PATCH','DELETE'].includes(req.method))return res.sendStatus(405);
  try{
    const query=new URLSearchParams();for(const[key,value]of Object.entries(req.query))if(typeof value==='string')query.set(key,value);
    const response=await fetch(`${backendUrl}/api/engineering/${segments.map(encodeURIComponent).join('/')}?${query}`,{method:req.method,headers:{authorization:req.get('authorization'),'content-type':'application/json'},...(['POST','PATCH','DELETE'].includes(req.method)?{body:JSON.stringify(req.body||{})}:{}),signal:AbortSignal.timeout(30000)});
    res.setHeader('cache-control','private, no-store');res.status(response.status).json(await response.json().catch(()=>({message:'Respons routing tidak valid.'})));
  }catch{res.status(502).json({message:'Layanan routing belum dapat dihubungi.'});}
});
module.exports=router;
