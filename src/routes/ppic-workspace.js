'use strict';
const express = require('express');
const registry = require('../ppicWorkspaceRegistry');
module.exports = function createPpicWorkspace({ backendUrl, authHeader, common, getModule, businessNow }) {
  const router = express.Router();
  async function proxy(req, res) {
    if (!req.get('authorization')) return res.status(401).json({ code:'AUTH_REQUIRED', message:'Login diperlukan.' });
    const suffix = req.path.replace('/api/planning-ppic/workspace','');
    const url = new URL(`${backendUrl}/api/planning/workspace${suffix}`);
    for (const [key,value] of Object.entries(req.query)) if (typeof value === 'string') url.searchParams.set(key,value);
    try {
      const response = await fetch(url, { method:req.method, headers:{...authHeader(req),'Content-Type':'application/json'}, ...(!['GET','HEAD'].includes(req.method)?{body:JSON.stringify(req.body||{})}:{}), signal:AbortSignal.timeout(120000) });
      res.set('Cache-Control','private, no-store');
      const payload = await response.text();
      res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(payload);
    } catch (error) { res.status(error.name === 'TimeoutError' ? 504 : 502).json({code:'WORKSPACE_UNAVAILABLE',message:'Data PPIC belum dapat diambil. Jika sedang menyimpan, periksa daftar skenario sebelum mencoba kembali.'}); }
  }
  router.get('/api/planning-ppic/workspace', proxy);
  router.get('/api/planning-ppic/workspace/execution', proxy);
  router.get('/api/planning-ppic/workspace/followup/:page', proxy);
  router.get('/api/planning-ppic/workspace/analytics', proxy);
  router.get('/api/planning-ppic/workspace/improvements', proxy);
  router.get('/api/planning-ppic/workspace/improvements/:id', proxy);
  router.post('/api/planning-ppic/workspace/improvements', proxy);
  router.put('/api/planning-ppic/workspace/improvements/:id', proxy);
  router.post('/api/planning-ppic/workspace/improvements/:id/transition', proxy);
  router.get('/api/planning-ppic/workspace/release/review', proxy);
  router.get('/api/planning-ppic/workspace/release/requests', proxy);
  router.get('/api/planning-ppic/workspace/release/requests/:id', proxy);
  router.post('/api/planning-ppic/workspace/release/requests', proxy);
  router.post('/api/planning-ppic/workspace/release/requests/:id/:action', proxy);
  router.post('/api/planning-ppic/workspace/seed', proxy);
  router.get('/api/planning-ppic/workspace/scenarios', proxy);
  router.get('/api/planning-ppic/workspace/scenarios/compare', proxy);
  router.post('/api/planning-ppic/workspace/scenarios', proxy);
  router.get('/api/planning-ppic/workspace/scenarios/:id', proxy);
  router.get('/api/planning-ppic/workspace/scenarios/:id/analysis', proxy);
  router.put('/api/planning-ppic/workspace/scenarios/:id', proxy);
  router.get('/planning-ppic/:domain/:slug', (req,res,next) => {
    const page = registry.find(req.params.domain,req.params.slug);
    if (!page) return next();
    const now = businessNow(),month = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(now).slice(0,7);
    const [year,m] = month.split('-').map(Number);
    const defaultMonth = page.domain === 'labs' ? new Date(Date.UTC(year,m,1)).toISOString().slice(0,7) : page.domain === 'analytics' ? new Date(Date.UTC(year,m-2,1)).toISOString().slice(0,7) : month;
    const selectedFilters = registry.filters(req.query,defaultMonth),module = getModule('planning-ppic');
    const initialDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    if(page.domain==='execution'){
      if(/^\d{4}-\d{2}-\d{2}$/.test(selectedFilters.date || '')) selectedFilters.month=selectedFilters.date.slice(0,7);
      else selectedFilters.date=selectedFilters.month===month?initialDate:selectedFilters.month+'-01';
    }
    const locals = {...common(module.slug),title:page.label,module,activePpicTab:page.id==='L04'?'mps':page.slug,initialMonth:selectedFilters.month,initialDate,ppicWorkspacePage:page,ppicWorkspaceRegistry:registry,ppicWorkspaceFilters:selectedFilters};
    const executionPage=['E01','E02','E03','E04','E05'].includes(page.id),followupPage=['E06','E07','E08','E09','E10'].includes(page.id),analyticsPage=page.domain==='analytics' && page.id!=='A09';
    return res.render(page.id==='L04'?'ppic/planning-sandbox':'ppic/workspace',{...locals,pageScript:page.id==='L04'?'/js/ppic-sandbox.js?v=20260913-part-number-1':page.id==='L10'?'/js/ppic-workspace-release.js?v=20260912-1':executionPage?'/js/ppic-execution-workspace.js?v=20260913-part-number-1':followupPage?'/js/ppic-execution-followup.js?v=20260912-1':analyticsPage?'/js/ppic-analytics-workspace.js?v=20260913-part-number-1':page.id==='A09'?'/js/ppic-improvement-actions.js?v=20260912-1':'/js/ppic-module-workspace.js?v=20260913-part-number-1'});
  });
  return router;
};
