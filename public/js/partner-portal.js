(async function () {
  const config = JSON.parse(document.getElementById('portal-config').textContent);
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 6 });
  const day = value => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '-';
  const message = (text, ok = false) => { $('portal-message').hidden = !text; $('portal-message').textContent = text; $('portal-message').className = ok ? 'success' : ''; };
  const base = config.mode === 'partner' ? '/partner/api' : '/incoming-tools/api/incoming';
  if (!token) { location.replace('/login?next=' + encodeURIComponent(location.pathname)); return; }
  $('portal-logout').onclick = () => { for (const store of [localStorage, sessionStorage]) { store.removeItem('token'); store.removeItem('user'); } location.replace('/login'); };
  async function request(path, options = {}) {
    const response = await fetch(path.startsWith('/') ? path : `${base}/${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body && !(options.body instanceof FormData) ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
    if (response.status === 401) { $('portal-logout').click(); throw new Error('Sesi berakhir.'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Permintaan gagal.'); return payload;
  }
  const send = (path, body, method = 'POST') => request(path, { method, body: JSON.stringify(body || {}) });
  async function download(path, name) {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Unduh gagal.');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = name || 'dokumen'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function docButtons(documents, internal = false) {
    return (documents || []).map(doc => `<button type="button" data-download="${esc(doc.id)}" data-name="${esc(doc.fileName)}" ${internal ? 'data-internal="true"' : ''}>${esc(doc.fileName)} (${number(doc.fileSize / 1024)} KB)</button>`).join('');
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-download]');
    if (!button) return;
    try { await download(`${button.dataset.internal || config.mode !== 'partner' ? '/incoming-tools/api/incoming' : '/partner/api'}/documents/${encodeURIComponent(button.dataset.download)}`, button.dataset.name); } catch (error) { message(error.message); }
  });
  async function upload(path, file) {
    if (!file || file.size > 10 * 1024 * 1024) throw new Error('Pilih file maksimal 10 MB.');
    const form = new FormData(); form.append('document', file); return request(path, { method: 'POST', body: form });
  }
  async function busy(form, fn) {
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    try { await fn(); } catch (error) { message(error.message); } finally { buttons.forEach(button => button.disabled = false); }
  }
  let orders = [], checklist = null;
  async function loadOrders() {
    orders = await request('purchase-orders');
    $('notice-po').innerHTML = '<option value="">Pilih PO aktif</option>' + orders.map(po => `<option value="${esc(po.poNumber)}">${esc(po.poNumber)} · ${esc(po.status)}</option>`).join('');
    $('notice-lines').innerHTML = '<tr><td colspan="4">Pilih PO terlebih dahulu.</td></tr>';
  }
  function renderOrder() {
    const po = orders.find(row => row.poNumber === $('notice-po').value);
    $('notice-lines').innerHTML = (po?.details || []).filter(row => row.qtyUnregistered > 0).map(row => `<tr data-po-detail="${esc(row.id)}"><td><b>${esc(row.materialCode || row.partCode)}</b><small>${esc(row.materialName || row.partName || row.description)}</small></td><td>${number(row.qtyUnregistered)} ${esc(row.uomCode)}</td><td><input aria-label="Jumlah ${esc(row.materialCode || row.partCode)}" data-qty type="number" min="0" max="${row.qtyUnregistered}" step="any" value="0"></td><td><input aria-label="Lot supplier" data-lot maxlength="100"></td></tr>`).join('') || '<tr><td colspan="4">Seluruh sisa PO sudah diterima atau didaftarkan.</td></tr>';
  }
  function renderNotices(rows, internal = false) {
    return rows.map(row => `<article class="portal-row"><b>${esc(row.noticeNumber)}</b> <span class="portal-badge">${esc(row.status)}</span><small>${esc(row.poNumber)} · Surat jalan ${esc(row.deliveryNoteNumber)} · Rencana tiba ${day(row.expectedDate)} ${internal ? `· ${esc(row.po?.supplierName || row.po?.vendorName || '')}` : ''}${row.grNumber ? ` · GR ${esc(row.grNumber)}` : ''}</small><div>${(row.details || []).map(line => `${esc(line.itemCode)} ${number(line.qty)} ${esc(line.uomCode)} (lot ${esc(line.supplierLotNumber)})`).join('; ')}</div><nav>${docButtons(row.documents, internal)}${row.status === 'Submitted' ? internal ? `<a href="/modules/incoming/goods-receipts/new?partnerNoticeId=${encodeURIComponent(row.id)}">Terima & buat GR</a>` : `<button data-cancel="${esc(row.id)}">Batalkan pendaftaran</button>` : ''}</nav>${!internal && row.status === 'Submitted' ? `<form data-upload-notice="${esc(row.id)}"><input aria-label="Dokumen surat jalan" type="file" required accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"><button type="submit">Unggah surat jalan</button></form>` : ''}</article>`).join('') || '<p>Belum ada pendaftaran pada periode/status ini.</p>';
  }
  async function loadDashboard() {
    const result = await request(`dashboard?from=${encodeURIComponent($('period-from').value)}&to=${encodeURIComponent($('period-to').value)}`);
    $('portal-summary').innerHTML = result.summaryByUom.map(row => `<div class="portal-stat"><b>${esc(row.uomCode)}</b><strong>${number(row.received)} diterima</strong><small>Accepted ${number(row.accepted)} · Rejected ${number(row.rejected)}</small></div>`).join('') || '<p>Belum ada penerimaan pada periode ini.</p>';
    $('notice-list').innerHTML = renderNotices(result.notices);
    $('receipt-list').innerHTML = result.receipts.map(receipt => `<article class="portal-row"><b>${esc(receipt.grNumber)}</b> <span class="portal-badge">${esc(receipt.status)}</span><small>${esc(receipt.poNumber)} · Diterima ${day(receipt.receivedDate)} · SJ ${esc(receipt.deliveryNoteNumber)}</small>${receipt.details.map(line => `<div><b>${esc(line.poDetail.materialCode || line.poDetail.partCode || line.poDetail.description)}</b> — ${number(line.qtyReceived)} ${esc(line.uomCode)} · Lot ${esc(line.supplierLotNumber)}${line.incomingInspectionDetails.length ? line.incomingInspectionDetails.map(i => `<small>${esc(i.inspection.inspectionNumber)} · ${esc(i.inspection.status)} / ${esc(i.inspection.decision)} · Accepted ${number(i.qtyAccepted)} · Rejected ${number(i.qtyRejected)}${i.notes ? ` · ${esc(i.notes)}` : ''}</small>${(i.checklist?.rows || []).filter(c => c.result === 'FAIL').map(c => `<small>Temuan: ${esc(c.label)} — ${esc(c.notes)}</small>`).join('')}`).join('') : '<small>Menunggu inspeksi</small>'}</div>`).join('')}<nav>${docButtons(receipt.incomingDocuments)}</nav></article>`).join('') || '<p>Belum ada goods receipt pada periode ini.</p>';
    $('vendor-list').innerHTML = result.vendorOrders.map(row => `<article class="portal-row"><b>${esc(row.orderNumber)}</b> <span class="portal-badge">${esc(row.status)}</span><small>${day(row.receivedAt)} · ${esc(row.outputPartCode)} ${esc(row.outputPartName)}</small><div>Diterima ${number(row.qtyReceived)} ${esc(row.uomCode)} · Accepted ${number(row.qtyAccepted)} · Rejected ${number(row.qtyReject)}</div><small>${row.qualityInspections.map(i => `${esc(i.inspectionNumber)}: ${esc(i.status)}`).join('; ') || 'Menunggu inspeksi'}</small></article>`).join('') || '<p>Tidak ada penerimaan proses vendor pada periode ini.</p>';
  }
  async function initPartner() {
    const me = await request('me'); $('portal-identity').textContent = `${me.userName} · ${me.partnerAccess.partyName || me.partnerAccess.partyCode}`;
    const today = day(new Date()); $('notice-date').value = today; $('period-from').value = `${today.slice(0,7)}-01`; $('period-to').value = today;
    $('notice-po').onchange = renderOrder;
    $('notice-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget, async () => {
      const details = [...document.querySelectorAll('[data-po-detail]')].map(row => ({ poDetailId: row.dataset.poDetail, qty: Number(row.querySelector('[data-qty]').value), supplierLotNumber: row.querySelector('[data-lot]').value.trim() })).filter(row => row.qty > 0);
      const expectedDate = $('notice-date').value;
      const result = await send('notices', { poNumber: $('notice-po').value, deliveryNoteNumber: $('notice-number').value.trim(), expectedDate, notes: $('notice-notes').value.trim(), details });
      if (expectedDate < $('period-from').value || expectedDate > $('period-to').value) { $('period-from').value = `${expectedDate.slice(0,7)}-01`; $('period-to').value = expectedDate; }
      message(`${result.noticeNumber} berhasil didaftarkan. Unggah dokumen surat jalan pada pendaftaran di bawah.`, true); $('notice-number').value = ''; $('notice-notes').value = ''; await loadOrders(); await loadDashboard();
    }); };
    $('period-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget, loadDashboard); };
    $('notice-list').addEventListener('submit', event => { const form = event.target.closest('[data-upload-notice]'); if (!form) return; event.preventDefault(); busy(form, async () => { await upload(`notices/${encodeURIComponent(form.dataset.uploadNotice)}/documents`, form.querySelector('input').files[0]); message('Dokumen berhasil diunggah.', true); await loadDashboard(); }); });
    $('notice-list').addEventListener('click', event => { const button = event.target.closest('[data-cancel]'); if (!button) return; busy(button.parentElement, async () => { if (!window.confirm('Batalkan pendaftaran pengiriman ini?')) return; await send(`notices/${encodeURIComponent(button.dataset.cancel)}/cancel`); await loadOrders(); await loadDashboard(); }); });
    await loadOrders(); await loadDashboard();
    let refreshing = false;
    const timer = setInterval(async () => { if (document.hidden || refreshing || $('notice-list').contains(document.activeElement)) return; refreshing = true; try { await loadDashboard(); } catch (error) { message(error.message); } finally { refreshing = false; } }, 30000);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }
  async function loadAdminNotices() { $('admin-notices').innerHTML = renderNotices(await request(`partner-admin/notices?status=${encodeURIComponent($('admin-notice-status').value)}`), true); }
  let bindings = [];
  async function loadBindings() {
    const result = await request('partner-admin/access'); bindings = result.bindings;
    $('binding-user').innerHTML = '<option value="">Pilih akun</option>' + result.users.filter(user => !bindings.some(b => b.userId === user.id)).map(user => `<option value="${esc(user.id)}">${esc(user.username)} · ${esc(user.fullName)}</option>`).join('');
    $('binding-party').innerHTML = '<option value="">Pilih perusahaan</option>' + [...result.suppliers.map(p => ({ key: `supplier:${p.supplierCode}`, name: `Supplier: ${p.supplierCode} — ${p.supplierName || ''}` })), ...result.vendors.map(p => ({ key: `vendor:${p.vendorCode}`, name: `Vendor: ${p.vendorCode} — ${p.vendorName || ''}` }))].map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('');
    $('binding-list').innerHTML = bindings.map(row => `<article class="portal-row"><b>${esc(row.user.username)}</b><small>${esc(row.supplierCode || row.vendorCode)} · ${esc(row.supplier?.supplierName || row.vendor?.vendorName)} · ${row.isActive ? 'Aktif' : 'Nonaktif'}</small><button data-toggle-binding="${esc(row.userId)}">${row.isActive ? 'Nonaktifkan' : 'Aktifkan'} akses</button></article>`).join('') || '<p>Belum ada akun terhubung.</p>';
  }
  async function initAdmin(profile) {
    $('admin-refresh').onclick = () => busy($('admin-refresh').parentElement, loadAdminNotices); $('admin-notice-status').onchange = () => busy($('admin-refresh').parentElement, loadAdminNotices);
    await loadAdminNotices();
    if (!profile.isSuperAdmin) { $('binding-section').hidden = true; return; }
    $('binding-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget, async () => { const choice = $('binding-party').value, colon = choice.indexOf(':'); const kind = choice.slice(0,colon), code = choice.slice(colon+1); await send(`partner-admin/access/${encodeURIComponent($('binding-user').value)}`, { supplierCode: kind === 'supplier' ? code : null, vendorCode: kind === 'vendor' ? code : null, isActive: true }, 'PUT'); message('Akun terhubung. Login akun tersebut diarahkan ke portal.', true); await loadBindings(); }); };
    $('binding-list').onclick = event => { const button = event.target.closest('[data-toggle-binding]'); if (!button) return; busy(button.parentElement, async () => { const row = bindings.find(b => b.userId === button.dataset.toggleBinding); await send(`partner-admin/access/${encodeURIComponent(row.userId)}`, { supplierCode: row.supplierCode, vendorCode: row.vendorCode, isActive: !row.isActive }, 'PUT'); await loadBindings(); }); };
    await loadBindings();
  }
  function checkRow(row) {
    return `<div class="check-row" data-criterion="${esc(row.code)}"><label>Kriteria<input data-label value="${esc(row.label)}" maxlength="200" required ${row.code.startsWith('CUSTOM_') ? '' : 'readonly'}></label><label>Hasil<select data-result>${['PENDING','PASS','FAIL','NA'].map(result => `<option ${result === row.result ? 'selected' : ''}>${result}</option>`).join('')}</select></label><label>Standar<input data-expected value="${esc(row.expected)}" maxlength="200"></label><label>Aktual<input data-actual value="${esc(row.actual)}" maxlength="200"></label><label>Temuan / alasan<textarea data-notes maxlength="1000">${esc(row.notes)}</textarea></label></div>`;
  }
  async function initChecklist() {
    checklist = await request(`incoming-inspections/${encodeURIComponent(config.recordNumber)}/checklist`);
    const item = checklist.inspection;
    $('checklist-heading').textContent = `${item.inspectionNumber} · ${item.status} · GR ${item.grNumber}`;
    $('checklist-back').href = `/modules/incoming/incoming-inspections/${encodeURIComponent(item.inspectionNumber)}`;
    $('checklist-lines').innerHTML = item.details.map(line => `<article class="portal-row" data-inspection-line="${esc(line.id)}"><h3>Baris ${line.lineNumber}: ${esc(line.grDetail.poDetail.materialCode || line.grDetail.poDetail.partCode || line.grDetail.poDetail.description)}</h3><p>Lot ${esc(line.grDetail.supplierLotNumber)} · Diterima ${number(line.grDetail.qtyReceived)} ${esc(line.grDetail.uomCode)}</p><div data-criteria>${(line.checklist?.rows || checklist.criteria.map(row => ({ ...row, result: 'PENDING' }))).map(checkRow).join('')}</div>${item.status === 'Open' ? '<button type="button" data-add-criterion>Tambah kriteria khusus</button>' : ''}</article>`).join('');
    if (item.status !== 'Open') { $('checklist-form').querySelectorAll('input,select,textarea,button').forEach(input => input.disabled = true); }
    $('checklist-lines').onclick = event => { if (!event.target.closest('[data-add-criterion]')) return; const parent = event.target.closest('[data-inspection-line]'); parent.querySelector('[data-criteria]').insertAdjacentHTML('beforeend', checkRow({ code: `CUSTOM_${Date.now()}_${parent.querySelectorAll('[data-criterion]').length}`, label: '', result: 'PENDING' })); };
    $('checklist-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget, async () => {
      const lines = [...document.querySelectorAll('[data-inspection-line]')].map(line => ({ id: line.dataset.inspectionLine, rows: [...line.querySelectorAll('[data-criterion]')].map(row => ({ code: row.dataset.criterion, label: row.querySelector('[data-label]').value, result: row.querySelector('[data-result]').value, notes: row.querySelector('[data-notes]').value, expected: row.querySelector('[data-expected]').value, actual: row.querySelector('[data-actual]').value })) }));
      const result = await send(`incoming-inspections/${encodeURIComponent(config.recordNumber)}/checklist`, { lines }, 'PUT'); message(result.message, true);
    }); };
    $('checklist-pdf').onclick = () => busy($('checklist-pdf').parentElement, () => download(`${base}/incoming-inspections/${encodeURIComponent(config.recordNumber)}/report.pdf`, `${config.recordNumber}.pdf`));
  }
  async function initDocuments() {
    const path = `goods-receipts/${encodeURIComponent(config.recordNumber)}/documents`;
    const refresh = async () => { $('gr-document-list').innerHTML = `<nav>${docButtons(await request(path), true)}</nav>`; };
    $('gr-document-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget, async () => { await upload(path, $('gr-document-file').files[0]); $('gr-document-file').value = ''; message('Dokumen tersimpan.', true); await refresh(); }); };
    await refresh();
  }
  try {
    if (config.mode === 'partner') await initPartner();
    else {
      const profile = await request('/auth/api/profile');
      if (profile.partnerAccess) { location.replace('/partner-portal'); return; }
      $('portal-identity').textContent = profile.fullName || profile.username;
      if (config.mode === 'admin') await initAdmin(profile);
      if (config.mode === 'checklist') await initChecklist();
      if (config.mode === 'documents') await initDocuments();
    }
  } catch (error) { message(error.message); $('portal-identity').textContent = 'Periksa hak akses akun atau hubungi admin.'; }
})();
