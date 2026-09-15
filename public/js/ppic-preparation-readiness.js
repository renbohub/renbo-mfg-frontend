(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const labels = { COMPLETE:'Lengkap', INCOMPLETE:'Perlu dilengkapi', FALLBACK:'Menggunakan fallback', EMPTY:'Data belum tersedia', ERROR:'Gagal diperiksa', NOT_APPLICABLE:'Tidak berlaku' };
  const stageNames = { MPS:'Master Production Schedule', MRP:'Material Requirements Planning', MPP:'Monthly Production Plan', DPP:'Daily Production Plan' };
  const recovery = window.PpicReadinessRecovery;
  let view = 'recovery', page = 1, openedMaster = false, restoredCategory = '';
  let recoveryRows = [];
  const filterIds = {q:'prep-readiness-search',stage:'prep-readiness-stage',status:'prep-readiness-status',category:'prep-readiness-category'};
  function remember() {
    try {
      const url = new URL(window.location.href);
      Object.entries(filterIds).forEach(([key,id]) => { const value=$(id).value; if(value) url.searchParams.set(`readiness_${key}`,value); else url.searchParams.delete(`readiness_${key}`); });
      url.searchParams.set('readiness_month',$('prep-readiness-month').value);
      url.searchParams.set('readiness_view',view);url.searchParams.set('readiness_page',String(page));
      window.history.replaceState(null,'',url.pathname+url.search+url.hash);
    } catch (_) { /* Filters still work when browser history is unavailable. */ }
  }
  try {
    const query = new URL(window.location.href).searchParams;
    restoredCategory=query.get('readiness_category') || '';
    Object.entries(filterIds).forEach(([key,id])=>{if(query.has(`readiness_${key}`)) $(id).value=query.get(`readiness_${key}`);});
    const savedMonth=query.get('month');if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(savedMonth || '')) $('prep-readiness-month').value=savedMonth;
    view=query.get('readiness_view') === 'overview' ? 'overview' : 'recovery';
    page=Math.max(1,Math.min(10000,Number(query.get('readiness_page')) || 1));
  } catch (_) {}
  function setView(name) {
    view=name;$('prep-recovery-panel').hidden=name !== 'recovery';$('prep-overview-panel').hidden=name !== 'overview';
    $('prep-view-recovery').setAttribute('aria-pressed',String(name === 'recovery'));$('prep-view-overview').setAttribute('aria-pressed',String(name === 'overview'));
  }
  function renderRecovery() {
    if(!result) return;
    const all=recovery.tasks(result.checks), filtered=recovery.filter(all,{term:$('prep-readiness-search').value,stage:$('prep-readiness-stage').value,status:$('prep-readiness-status').value,category:$('prep-readiness-category').value});
    const pages=Math.max(1,Math.ceil(filtered.length/15));page=Math.min(page,pages);
    $('prep-recovery-total').textContent=`${all.filter(t=>t.status !== 'FALLBACK').length} tindakan unik · ${all.filter(t=>t.status === 'FALLBACK').length} fallback`;
    if(view === 'recovery') $('prep-readiness-count').textContent=`${filtered.length} tindakan sesuai filter · field supplier yang sama digabung`;
    $('prep-recovery-page-label').textContent=view === 'recovery' ? `Halaman ${page} / ${pages}` : '';
    $('prep-recovery-prev').disabled=page <= 1;$('prep-recovery-next').disabled=page >= pages;
    recoveryRows=filtered;
    $('prep-recovery-body').innerHTML=filtered.slice((page-1)*15,page*15).map((t,index)=>{
      const first=t.contexts[0];
      const related=`<button type="button" data-recovery-detail="${(page-1)*15+index}" title="Lihat kondisi lengkap, part terdampak dan sumber parameter">Rincian (${t.contexts.length})</button>`;
      const action=t.status === 'ERROR' ? '<button type="button" data-recovery-retry>Periksa ulang</button>' : t.href ? `<a class="prep-recovery-action" data-recovery-link href="${escape(t.href)}" title="${escape(t.actionLabel)} · buka sumber dan field terkait di tab baru" target="_blank" rel="noopener">${escape(t.actionLabel)} ↗</a>` : '<span class="prep-recovery-unavailable" title="Form perbaikan langsung belum tersedia. Lihat Rincian untuk sumber terkait.">Form belum tersedia</span>';
      const numbers=[...new Set(t.contexts.map(c=>c.partNumber).filter(Boolean))].join(', ') || '—';
      const partner=[first.supplier, t.shared ? `${t.contexts.length} konteks BOM` : first.bom].filter(Boolean).join(' · ') || '—';
      return `<tr class="prep-recovery-compact"><td><div class="prep-recovery-line"><span class="prep-readiness-badge ${escape(t.status)}" title="${escape(labels[t.status])}">${escape(t.status === 'FALLBACK' ? 'Fallback' : t.status === 'ERROR' ? 'Gagal baca' : 'Perlu diisi / diganti')}</span><strong class="prep-cell-ellipsis" title="${escape(t.label+' · '+t.category+' · '+t.owner)}">${escape(t.label)}</strong></div></td><td title="${escape(first.part+' · '+first.name)}"><span class="prep-cell-ellipsis">${t.shared ? 'Beberapa part' : `<strong>${escape(first.part)}</strong> · ${escape(first.name)}`}</span></td><td title="${escape(numbers)}"><span class="prep-cell-ellipsis">${escape(numbers)}</span></td><td title="${escape(partner)}"><span class="prep-cell-ellipsis">${escape(partner)}</span></td><td>${related}</td><td>${action}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="prep-recovery-empty"><strong>Tidak ada tindakan sesuai filter.</strong><p>Coba reset filter atau buka Ringkasan parameter. Ini bukan pernyataan bahwa seluruh master sudah lengkap.</p><button type="button" data-recovery-reset>Reset filter</button></td></tr>';
    if(result.checks.some(c=>c.truncated)) $('prep-recovery-total').textContent+=' · sebagian rincian dibatasi 50 data per kategori';
    remember();
  }
  const actionLink = (href,label) => typeof href === 'string' && /^\/(?!\/)/.test(href) && !href.includes('\\') ? `<a href="${escape(href)}" target="_blank" rel="noopener">${escape(label)} ↗</a>` : `<span>${escape(label || 'Form belum tersedia')}</span>`;
  let result = null, requestId = 0;
  const tabs = [...document.querySelectorAll('[data-lab-page]')];
  function showPage(name) {
    if(!tabs.some(tab=>tab.dataset.labPage===name))return;
    tabs.forEach(tab => { const selected = tab.dataset.labPage === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    for(const tab of tabs){const panel=$('prep-'+tab.dataset.labPage+'-panel');if(panel)panel.hidden=name!==tab.dataset.labPage;}
    $('prep-workbook-actions').hidden = name !== 'workbook';
    try {const url=new URL(window.location.href);url.searchParams.set('tab',name);window.history.replaceState(null,'',url.pathname+url.search+url.hash);}catch(_){}
    if (name !== 'readiness') window.dispatchEvent(new CustomEvent('prep:open-workbook'));
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showPage(tab.dataset.labPage));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); showPage(tabs[next].dataset.labPage);
    });
  });
  try {const requested=new URL(window.location.href).searchParams.get('tab');if(requested)showPage(requested);}catch(_){}
  function render() {
    if (!result) return;
    const term = $('prep-readiness-search').value.trim().toLowerCase(), stage = $('prep-readiness-stage').value, status = $('prep-readiness-status').value;
    const checks = result.checks.filter(check => (!$('prep-readiness-category').value || check.id === $('prep-readiness-category').value) && (!stage || check.stages.includes(stage)) && (!status || (status === 'ATTENTION' && ['ERROR','INCOMPLETE','EMPTY'].includes(check.status)) || check.status === status || (status === 'FALLBACK' && check.fallbackCount > 0)) && (!term || [check.label,check.owner,check.requirement,...[...check.issues,...(check.fallbacks || []),...(check.sources || [])].map(issue => `${issue.code} ${issue.partNumber || ''} ${issue.name || ''} ${(issue.missing || []).join(' ')} ${(issue.notes || []).join(' ')}`)].join(' ').toLowerCase().includes(term)));
    $('prep-readiness-count').textContent = `${checks.length} / ${result.checks.length} parameter`;
    $('prep-readiness-body').innerHTML = checks.map(check => {
      const detail = check.status === 'ERROR' ? '<small>Sumber gagal dibaca; status belum dapat disimpulkan.</small>' : check.status === 'EMPTY' ? '<small>Belum ada data dalam cakupan pemeriksaan ini.</small>' : '';
      const sources = check.sources?.length ? `<details><summary>Sumber parameter per konteks BOM</summary><ul>${check.sources.map(row => `<li><strong>${escape(row.code)}</strong><small>Part Number: ${escape(row.partNumber || '—')}</small><span>${escape(row.notes.join(' · '))}</span></li>`).join('')}</ul>${check.total > 50 ? '<p>Ditampilkan 50 konteks pertama.</p>' : ''}</details>` : '';
      return `<tr><td><strong>${escape(check.label)}</strong><details><summary>Aturan pemeriksaan</summary><p>${escape(check.requirement)}</p></details>${detail}${sources}</td><td><div class="prep-readiness-tags">${check.stages.map(value => `<span>${escape(value)}</span>`).join('')}</div></td><td><span class="prep-readiness-badge ${escape(check.status)}">${escape(labels[check.status])}</span></td><td class="prep-readiness-number">${check.total == null ? '—' : `${check.complete} / ${check.total}`}${check.fallbackCount ? `<br><small>${check.fallbackCount} fallback</small>` : ''}</td><td>${escape(check.owner)}</td><td>${check.issues.length || check.fallbackCount || check.status === 'ERROR' ? `<button type="button" data-check-recover="${escape(check.id)}">Lihat tindakan →</button>` : actionLink(check.href,'Buka master')}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="prep-readiness-empty">Tidak ada parameter sesuai filter.</td></tr>';
    renderRecovery();
  }
  async function load() {
    const month = $('prep-readiness-month').value;
    const id = ++requestId;
    if(result?.month !== month) result = null;
    $('prep-readiness-refresh').disabled = true;
    $('prep-readiness-panel').setAttribute('aria-busy', 'true');
    $('prep-readiness-message').textContent = 'Memeriksa master data aktual…';
    $('prep-recovery-recheck').disabled=true;
    $('prep-recovery-bottom-recheck').disabled=true;
    if(!result) {
      $('prep-readiness-summary').innerHTML = ''; $('prep-readiness-stages').innerHTML = '';
      $('prep-readiness-checked').textContent = ''; $('prep-readiness-count').textContent = '';
      $('prep-readiness-scope').textContent = '';
      $('prep-readiness-body').innerHTML = '<tr><td colspan="6" class="prep-readiness-empty">Memeriksa kelengkapan parameter…</td></tr>';
      $('prep-recovery-body').innerHTML='<tr><td colspan="6">Memeriksa master data aktual…</td></tr>';
    }
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
      $('prep-readiness-message').textContent = 'Pilih periode yang valid.';
      $('prep-readiness-body').innerHTML = '<tr><td colspan="6" class="prep-readiness-empty">Pilih periode untuk memeriksa master data.</td></tr>';
      $('prep-readiness-refresh').disabled = false;
      $('prep-recovery-recheck').disabled=false;
      $('prep-recovery-bottom-recheck').disabled=false;
      $('prep-recovery-body').innerHTML='<tr><td colspan="6">Pilih periode yang valid untuk memeriksa master.</td></tr>';
      $('prep-readiness-panel').setAttribute('aria-busy', 'false');
      return;
    }
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const response = await fetch(`/modules/api/planning-ppic/preparation/readiness?month=${encodeURIComponent(month)}`, { headers:{Authorization:`Bearer ${token}`}, cache:'no-store', signal:AbortSignal.timeout(65000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Pemeriksaan master data gagal.');
      if (!Array.isArray(payload.checks) || !payload.summary) throw new Error('Hasil pemeriksaan tidak valid.');
      if (id !== requestId) return;
      result = payload;
      const category=restoredCategory || $('prep-readiness-category').value;restoredCategory='';
      $('prep-readiness-category').innerHTML='<option value="">Semua kategori</option>'+payload.checks.map(c=>`<option value="${escape(c.id)}">${escape(c.label)}</option>`).join('');
      $('prep-readiness-category').value=payload.checks.some(c=>c.id === category) ? category : '';
      $('prep-readiness-message').textContent = 'Data aktual · hanya baca · tidak mengubah master atau rencana resmi.';
      $('prep-readiness-summary').innerHTML = ['INCOMPLETE','FALLBACK','COMPLETE','EMPTY','ERROR'].map(status => `<button type="button" class="${status}" data-status-filter="${status}"><span>${labels[status]}</span><strong>${payload.summary[status] || 0}</strong><small>kategori · klik untuk melihat</small></button>`).join('');
      $('prep-readiness-stages').innerHTML = Object.entries(stageNames).map(([stage, name]) => { const checks = payload.checks.filter(c => c.stages.includes(stage) && c.status !== 'NOT_APPLICABLE'); return `<article><strong>${stage}</strong><span>${name}</span><small>${checks.filter(c => c.status === 'COMPLETE').length} / ${checks.length} parameter lengkap</small></article>`; }).join('');
      $('prep-readiness-scope').textContent = payload.scope;
      $('prep-readiness-checked').textContent = 'Diperiksa: ' + new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(payload.checkedAt)) + ' WIB';
      render();
      if(openedMaster) { $('prep-recovery-notice').hidden=false;$('prep-recovery-notice-text').textContent='Pemeriksaan terbaru selesai. Tindakan yang masih tercantum belum terpenuhi; tidak ditandai selesai secara manual.';openedMaster=false; }
    } catch(error) {
      if (id !== requestId) return;
      $('prep-readiness-message').textContent = ['TimeoutError','TypeError','SyntaxError'].includes(error.name) ? 'Sumber data belum dapat dibaca. Coba Periksa ulang setelah server tersedia.' : error.message;
      if(result) $('prep-readiness-message').textContent+=' Hasil di bawah adalah hasil sebelumnya, belum berhasil diperbarui.';
      else {
        $('prep-readiness-body').innerHTML = '<tr><td colspan="6" class="prep-readiness-empty">Belum ada hasil yang dapat dipastikan. Data tidak ditandai lengkap.</td></tr>';
        $('prep-recovery-body').innerHTML='<tr><td colspan="6" class="prep-recovery-empty">Pemeriksaan gagal. Tidak ada data yang ditandai lengkap.<br><button type="button" data-recovery-retry>Coba lagi</button></td></tr>';
      }
    } finally {
      if (id === requestId) { $('prep-readiness-refresh').disabled = false; $('prep-recovery-recheck').disabled=false; $('prep-recovery-bottom-recheck').disabled=false; $('prep-readiness-panel').setAttribute('aria-busy','false'); }
    }
  }
  $('prep-readiness-refresh').addEventListener('click', load);
  $('prep-readiness-month').addEventListener('change',()=>{if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test($('prep-readiness-month').value))return load();window.dispatchEvent(new CustomEvent('prep:month-request',{detail:{month:$('prep-readiness-month').value}}));});
  window.addEventListener('prep:month-loaded',event=>{$('prep-readiness-month').value=event.detail.month;load();});
  const changed=()=>{page=1;render();};
  $('prep-readiness-search').addEventListener('input', changed);
  $('prep-readiness-stage').addEventListener('change', changed);
  $('prep-readiness-category').addEventListener('change', changed);
  $('prep-readiness-status').addEventListener('change',()=>{if(['COMPLETE','NOT_APPLICABLE'].includes($('prep-readiness-status').value)) setView('overview');changed();});
  function resetFilters() { Object.values(filterIds).forEach(id=>$(id).value='');$('prep-readiness-status').value='ATTENTION';page=1;render(); }
  $('prep-readiness-reset').addEventListener('click',resetFilters);
  $('prep-view-recovery').addEventListener('click',()=>{setView('recovery');if(['COMPLETE','NOT_APPLICABLE'].includes($('prep-readiness-status').value)) $('prep-readiness-status').value='ATTENTION';changed();});
  $('prep-view-overview').addEventListener('click',()=>{setView('overview');$('prep-readiness-status').value='';changed();});
  $('prep-recovery-prev').addEventListener('click',()=>{page=Math.max(1,page-1);renderRecovery();$('prep-recovery-panel').scrollIntoView?.({block:'start'});});
  $('prep-recovery-next').addEventListener('click',()=>{page++;renderRecovery();$('prep-recovery-panel').scrollIntoView?.({block:'start'});});
  $('prep-readiness-summary').addEventListener('click',event=>{const button=event.target.closest('[data-status-filter]');if(button) {$('prep-readiness-status').value=button.dataset.statusFilter;setView(button.dataset.statusFilter === 'COMPLETE' ? 'overview' : 'recovery');changed();}});
  $('prep-readiness-body').addEventListener('click',event=>{const button=event.target.closest('[data-check-recover]');if(button) {$('prep-readiness-category').value=button.dataset.checkRecover;$('prep-readiness-status').value='';setView('recovery');changed();}});
  $('prep-recovery-recheck').addEventListener('click',load);
  $('prep-recovery-bottom-recheck').addEventListener('click',load);
  $('prep-recovery-body').addEventListener('click',event=>{
    const detail=event.target.closest('[data-recovery-detail]');
    if(detail) {
      const task=recoveryRows[Number(detail.dataset.recoveryDetail)];
      if(task) {
        $('prep-recovery-detail-content').innerHTML=`<h3>${escape(task.label)}</h3><p>${escape(task.category)} · ${escape(task.owner)} · ${escape(labels[task.status])}</p><table class="prep-context-table" data-enterprise-table="off"><thead><tr><th>Part / nama</th><th>Part Number</th><th>Supplier / BOM</th></tr></thead><tbody>${task.contexts.map(c=>`<tr><td>${escape(c.part)}<small>${escape(c.name)}</small></td><td>${escape(c.partNumber || '—')}</td><td>${escape([c.supplier,c.bom].filter(Boolean).join(' · ') || '—')}</td></tr>`).join('')}</tbody></table>${[...new Set(task.notes)].map(n=>`<p>${escape(n)}</p>`).join('')}${task.href ? actionLink(task.href,task.actionLabel) : '<p>Tidak ada link field yang dapat dibuka. Periksa sumber data atau ketersediaan form master.</p>'}`;
        $('prep-recovery-detail').showModal();
      }
    }
    if(event.target.closest('[data-recovery-retry]')) load();
    if(event.target.closest('[data-recovery-reset]')) resetFilters();
    if(event.target.closest('[data-recovery-link]')) { openedMaster=true;remember();$('prep-recovery-notice').hidden=false;$('prep-recovery-notice-text').textContent='Isi dan simpan perubahan di tab master, lalu kembali ke sini untuk memeriksa hasilnya.'; }
  });
  $('prep-recovery-detail-close').addEventListener('click',()=>$('prep-recovery-detail').close());
  $('prep-recovery-detail-content').addEventListener('click',event=>{
    if(event.target.closest('a')) { openedMaster=true;remember();$('prep-recovery-notice').hidden=false;$('prep-recovery-notice-text').textContent='Isi dan simpan perubahan di tab master, lalu kembali ke sini untuk memeriksa hasilnya.'; }
  });
  window.addEventListener('focus',()=>{if(openedMaster)load();});
  setView(view);
  load();
})();
