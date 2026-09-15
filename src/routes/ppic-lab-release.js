'use strict';
const express=require('express');
module.exports=function({common,getModule,businessNow}){
  const router=express.Router();
  const views=new Set(['monthly','mrp','daily','recovery','delivery','vendor','incoming-supplier','incoming-material']);
  const pages=[['planning-ppic','released','PPIC Released Data',''],...require('../../../library/ppic-planning/released-pages.cjs').map(item=>[item.module,item.slug,item.label,item.view])];
  for(const [moduleSlug,slug,label,view] of pages)router.get(`/${moduleSlug}/${slug}`,(req,res)=>{
    const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(req.query.month||'')?req.query.month:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(businessNow()).slice(0,7);
    const initialView=view||(views.has(req.query.view)?req.query.view:'monthly');
    res.render('ppic/released',{...common(moduleSlug),module:getModule(moduleSlug),activePage:slug,title:label,releaseView:view,releaseScope:view?moduleSlug+'/'+slug:'',initialView,initialMonth:month,pageScript:'/js/ppic-lab-released.js?v=20260916-departments-1'});
  });
  return router;
};
