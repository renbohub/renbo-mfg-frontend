const express = require('express');
const { Readable } = require('node:stream');
const router = express.Router();
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5017').replace(/\/$/, '');
const render = (mode, title) => (req, res) => res.render('incoming/partner-portal', { title, mode, recordNumber: req.params.inspectionNumber || req.params.grNumber || '' });
router.get('/partner-portal', render('partner', 'Portal Supplier & Vendor'));
router.get('/modules/incoming/partner-administration', render('admin', 'Pendaftaran Supplier & Akses Portal'));
router.get('/modules/incoming/inspections/:inspectionNumber/checklist', render('checklist', 'Checklist Verifikasi Incoming'));
router.get('/modules/incoming/documents/:grNumber', render('documents', 'Dokumen Goods Receipt'));
router.get('/modules/inventory/stock-policy/:id', (req,res) => res.render('incoming/stock-policy', { stockBalanceId: req.params.id }));
router.all('/inventory-policy/api/:id', async (req,res) => {
  if (!['GET','PATCH'].includes(req.method)) return res.sendStatus(405);
  if (!req.get('authorization')) return res.status(401).json({ message: 'Login diperlukan.' });
  try {
    const response = await fetch(`${backendUrl}/api/inventory/stock-balances/${encodeURIComponent(req.params.id)}${req.method === 'PATCH' ? '/policy' : ''}`, { method: req.method, headers: { authorization: req.get('authorization'), 'content-type':'application/json' }, ...(req.method === 'PATCH' ? {body:JSON.stringify(req.body || {})} : {}), signal:AbortSignal.timeout(30000) });
    res.setHeader('cache-control','private, no-store');res.status(response.status).json(await response.json().catch(()=>({message:'Respons tidak valid.'})));
  } catch { res.status(502).json({message:'Layanan inventory tidak dapat dihubungi.'}); }
});
router.all('/partner/api/*path', proxy('/partner-portal'));
router.all('/incoming-tools/api/*path', proxy(''));
function proxy(prefix) {
  return async (req, res) => {
    const parts = req.params.path;
    const segments = Array.isArray(parts) ? parts : [parts];
    if (segments.some(part => !part || part === '.' || part === '..' || /[\\/\x00-\x1f]/.test(part))) return res.status(400).json({ message: 'Path tidak valid.' });
    const path = segments.map(encodeURIComponent).join('/');
    if (!prefix && !path.startsWith('incoming/')) return res.status(404).json({ message: 'Route tidak tersedia.' });
    const authorization = req.get('authorization');
    if (!authorization) return res.status(401).json({ message: 'Login diperlukan.' });
    const headers = { authorization };
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      headers['content-type'] = req.get('content-type') || 'application/json';
      body = headers['content-type'].startsWith('multipart/form-data') ? req : JSON.stringify(req.body || {});
    }
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) if (typeof value === 'string') query.set(key, value);
    try {
      const response = await fetch(`${backendUrl}/api${prefix}/${path}?${query}`, { method: req.method, headers, body, ...(body === req ? { duplex: 'half' } : {}), signal: AbortSignal.timeout(60000) });
      res.status(response.status);
      for (const name of ['content-type','content-disposition','x-content-type-options']) { const value = response.headers.get(name); if (value) res.setHeader(name, value); }
      res.setHeader('cache-control', 'private, no-store');
      if (!response.body) return res.end();
      Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
    } catch (error) { if (!res.headersSent) res.status(502).json({ message: 'Layanan incoming tidak dapat dihubungi.' }); else res.destroy(); }
  };
}
module.exports = router;
