const express = require('express');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

module.exports = function createStep1Proxy({ backendUrl, authHeader, common, getModule, getPage }) {
  const router = express.Router();
  const proxy = endpoint => async (req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const stop = () => { if (!res.writableFinished) controller.abort(); };
    res.on('close', stop);
    try {
      if (!req.get('authorization')) return res.status(401).json({ message: 'Login diperlukan.' });
      const url = new URL(backendUrl + endpoint(req));
      for (const [key, value] of Object.entries(req.query)) if (typeof value === 'string') url.searchParams.set(key, value);
      const headers = authHeader(req), options = { method: req.method, headers, signal: controller.signal };
      if (!['GET', 'HEAD'].includes(req.method)) {
        headers['content-type'] = req.get('content-type') || 'application/json';
        if (headers['content-type'].startsWith('multipart/form-data')) { options.body = req; options.duplex = 'half'; }
        else options.body = JSON.stringify(req.body || {});
      }
      const response = await fetch(url, options);
      res.status(response.status);
      for (const header of ['content-type', 'content-disposition', 'content-length']) {
        const value = response.headers.get(header); if (value) res.setHeader(header, value);
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!response.body) return res.end();
      await pipeline(Readable.fromWeb(response.body), res);
    } catch (error) {
      if (!res.headersSent) res.status(502).json({ message: 'Layanan dokumen belum tersedia. Silakan coba kembali.' });
      else res.destroy();
    } finally { clearTimeout(timer); res.off('close', stop); }
  };
  const encode = value => encodeURIComponent(value);
  const sales = req => `/api/sales/sales-orders/${encode(req.params.key)}`;
  router.get('/api/dashboard/executive/sales/customers', proxy(() => '/api/dashboard/executive/sales/customers'));
  for (const action of ['submit', 'reject', 'withdraw']) router.post(`/api/sales/sales-orders/:key/${action}`, proxy(req => `${sales(req)}/${action}`));
  router.get('/api/sales/sales-orders/:key/approvals', proxy(req => `${sales(req)}/approvals`));
  router.post('/api/sales/sales-orders/:key/attachments', proxy(req => `${sales(req)}/attachments`));
  router.delete('/api/sales/sales-orders/:key/attachments/:attachmentId', proxy(req => `${sales(req)}/attachments/${encode(req.params.attachmentId)}`));
  router.get('/api/sales/sales-orders/:key/attachments/:attachmentId/files/:fileIndex', proxy(req => `${sales(req)}/attachments/${encode(req.params.attachmentId)}/files/${encode(req.params.fileIndex)}`));
  router.get('/api/sales/forecasts/template', proxy(() => '/api/planning/forecasts/template'));
  router.get('/api/sales/forecasts/:key/history', proxy(req => `/api/planning/forecasts/${encode(req.params.key)}/history`));
  router.get('/api/outgoing/delivery-schedules/lookup', proxy(() => '/api/outgoing/delivery-schedules/lookup'));
  router.get('/api/outgoing/delivery-schedules/:key/note.pdf', proxy(req => `/api/outgoing/delivery-schedules/${encode(req.params.key)}/note.pdf`));
  router.get('/api/outgoing/delivery-schedules/:key/evidence/:kind', proxy(req => `/api/outgoing/delivery-schedules/${encode(req.params.key)}/evidence/${encode(req.params.kind)}`));
  for (const suffix of ['report.pdf', 'report.xlsx', 'labels.pdf', 'scan']) router.get(`/api/inventory/stock-opname/:stoNo/${suffix}`, proxy(req => `/api/inventory/stock-opname/${encode(req.params.stoNo)}/${suffix}`));
  router.get('/outgoing/scan', (req, res) => res.render('outgoing/scan', {
    ...common('outgoing'), title: 'Scan Surat Jalan', module: getModule('outgoing'), page: getPage('outgoing', 'delivery-schedules'), pageScript: '/js/delivery-scan.js',
  }));
  return router;
};
