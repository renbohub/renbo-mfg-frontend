(function(root,factory) {
  const api=factory();
  if(typeof module === 'object' && module.exports) module.exports=api;
  else { root.PpicRecoveryFocus=api;api.install(root); }
})(typeof window !== 'undefined' ? window : globalThis,function() {
  'use strict';
  function parse(search) {
    const q=new URLSearchParams(search);
    if(q.get('readiness') !== '1') return null;
    const fields=[...new Set((q.get('readiness_fields') || '').split(',').filter(f=>/^[a-zA-Z][a-zA-Z0-9.-]{0,79}$/.test(f)))].slice(0,12);
    return {fields,issue:(q.get('readiness_issue') || 'Periksa parameter yang ditandai.').slice(0,1200),month:/^20\d{2}-(0[1-9]|1[0-2])$/.test(q.get('readiness_month') || '') ? q.get('readiness_month') : '',detail:q.get('focusDetail') || '',process:q.get('focusProcess') || '',sourceOnly:q.get('readiness_source_only') === '1'};
  }
  function targets(doc,config) {
    const inspector=doc.getElementById('bom-inspector-form');
    // A reused inspector must never mark a different component/process by accident.
    if(config.detail && inspector?.dataset.readinessDetail !== config.detail) return [];
    let scope=doc;
    if(config.process) {
      scope=[...doc.querySelectorAll('[data-process-id]')].find(el=>el.dataset.processId === config.process);
      if(!scope) return [];
    }
    const found=[];
    for(const field of config.fields) {
      const split=field.indexOf('.');
      if(split>0 && ['policy','process','node'].includes(field.slice(0,split))) {
        const prefix=field.slice(0,split),name=field.slice(split+1);
        found.push(...scope.querySelectorAll(`[data-${prefix}-field="${name}"]`));
      } else {
        const el=doc.getElementById(field) || doc.getElementById(`field-${field}`) || doc.querySelector(`[name="${field}"]`);
        if(el && (scope === doc || scope.contains(el))) found.push(el);
      }
    }
    return [...new Set(found)];
  }
  function install(win) {
    const config=parse(win.location.search),doc=win.document;
    if(!config || !config.fields.length || !/^\/(master-data\/|modules\/manufacturing-bom\/)/.test(win.location.pathname)) return;
    const main=doc.querySelector('main');if(!main) return;
    const banner=doc.createElement('aside');banner.className='ppic-recovery-focus-banner';banner.setAttribute('role','status');
    const title=doc.createElement('strong');title.textContent='Perbaikan master untuk PPIC';
    const message=doc.createElement('p');message.textContent=config.issue;
    const state=doc.createElement('p');state.textContent='Menunggu sumber data selesai dimuat…';
    const link=doc.createElement('a');link.textContent='Kembali & periksa Readiness';
    link.href='/modules/planning-ppic/preparation?readiness_status=ATTENTION&readiness_view=recovery'+(config.month ? '&readiness_month='+encodeURIComponent(config.month) : '');
    banner.append(title,message,state,link);main.prepend(banner);
    let ready=false,focused=false,marked=[];
    function apply() {
      if(!ready) return;
      marked.forEach(el=>{el.classList.remove('ppic-recovery-field');el.removeAttribute('data-ppic-recovery');});marked=[];
      const found=targets(doc,config);
      for(const el of found) {
        let box=el;
        if(el.matches('input,select,textarea')) box=el.closest('label,.form-field,.bom-header-field') || el;
        box.classList.add('ppic-recovery-field');box.setAttribute('data-ppic-recovery',config.sourceOnly ? 'Konteks sumber — form parameter belum tersedia' : 'Periksa / isi parameter ini');marked.push(box);
      }
      state.textContent=found.length ? 'Field kuning perlu diisi atau ditinjau sesuai kondisi di atas. Penanda berasal dari pemeriksaan sebelumnya; perubahan belum dianggap selesai sampai disimpan dan diperiksa ulang.' : 'Field sumber tidak ditemukan pada tampilan ini. Record mungkin berubah atau komponen lain sedang dipilih; buka ulang link dari Readiness. Tidak ada data yang diubah otomatis.';
      if(found.length && config.sourceOnly) state.textContent='Bagian kuning menunjukkan konteks sumber saja. Field parameter belum tersedia di form ini; kondisi tetap belum lengkap.';
      if(found.length && !focused) {
        focused=true;
        marked[0].scrollIntoView({block:'center'});
        // Keep Select2 and disabled historical fields visible without changing values.
        const input=found.find(el=>!el.disabled && el.type !== 'hidden' && el.getClientRects().length);
        input?.focus?.({preventScroll:true});
      }
    }
    doc.addEventListener('document-form:loaded',()=>{ready=true;apply();},true);
    win.addEventListener('ppic-recovery:ready',()=>{ready=true;apply();});
    win.addEventListener('ppic-recovery:render',apply);
    // Exposed for asynchronous BOM rendering; never invokes a save or input event.
    api.apply=apply;
  }
  const api={parse,targets,install};return api;
});
