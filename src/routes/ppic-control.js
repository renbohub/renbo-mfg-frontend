'use strict';
const express=require('express');
const {groups}=require('../ppicPageMap');
module.exports=function({common,getModule,businessNow}){
  const router=express.Router(),group=groups.find(group=>group.slug==='control');
  router.get('/planning-ppic/control',(req,res)=>{
    const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(req.query.month||'')?req.query.month:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(businessNow()).slice(0,7);
    const view=group.tabs.some(([key])=>key===req.query.view)?req.query.view:'customer';
    res.render('ppic/control',{...common('planning-ppic'),module:getModule('planning-ppic'),activePage:'control',title:group.label,controlTabs:group.tabs,initialMonth:month,initialView:view,pageScript:'/js/ppic-control.js?v=20260915-structure-1'});
  });
  return router;
};
