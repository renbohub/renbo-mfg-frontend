(function(root) {
  'use strict';
  const safeHref = href => typeof href === 'string' && /^\/(?!\/)/.test(href) && !/[\\\r\n]/.test(href);
  const rank = {ERROR:0,INCOMPLETE:1,EMPTY:2,FALLBACK:3};
  function tasks(checks) {
    const grouped = new Map();
    for (const check of checks) {
      const issues = [...(check.issues || []).map(issue => ({...issue,status:'INCOMPLETE'})), ...(check.fallbacks || []).map(issue => ({...issue,status:'FALLBACK'}))];
      if (['ERROR','EMPTY'].includes(check.status)) issues.push({code:check.label,name:'',status:check.status,missing:[check.status === 'ERROR' ? 'Sumber gagal dibaca. Periksa koneksi lalu coba lagi.' : 'Data master belum tersedia.']});
      for (const issue of issues) {
        const fields = issue.fieldIssues?.length ? issue.fieldIssues : (issue.missing || []).map(label => ({label,href:check.status === 'ERROR' ? null : check.href,actionLabel:'Buka master'}));
        for (const field of fields) {
          const href = safeHref(field.href) ? field.href : null;
          // Only an exact shared supplier field is safe to group across part/BOM contexts.
          const shared = field.field === 'leadTimeDays' && href && /^\/master-data\/suppliers\/[^/]+\/edit\?/.test(href);
          const key = shared ? `${check.id}|${field.field}|${href}` : `${check.id}|${issue.sourceId || issue.code}|${field.field || field.label}|${field.label}|${href}`;
          if (!grouped.has(key)) grouped.set(key,{key,checkId:check.id,category:check.label,owner:check.owner,stages:check.stages,status:issue.status,label:field.label,field:field.field,href,actionLabel:field.actionLabel || 'Buka master',contexts:[],shared,notes:[]});
          const task = grouped.get(key);
          task.contexts.push({code:issue.code,part:issue.partCode || issue.code,partNumber:issue.partNumber || '',name:issue.name || '',supplier:issue.supplierCode || '',bom:field.sourceBom || issue.bomNumber || ''});
          task.notes.push(...(issue.notes || []),...(field.sourceText ? [field.sourceText] : []));
        }
      }
    }
    return [...grouped.values()].map(t=>({...t,shared:t.shared && t.contexts.length > 1})).sort((a,b)=>(rank[a.status] ?? 9)-(rank[b.status] ?? 9) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }
  function filter(tasks,{term='',stage='',status='',category=''}={}) {
    const search=term.trim().toLowerCase();
    return tasks.filter(t=>(!stage || t.stages.includes(stage)) && (!category || t.checkId === category) && (!status || (status === 'ATTENTION' ? ['ERROR','INCOMPLETE','EMPTY'].includes(t.status) : status === t.status)) && (!search || [t.label,t.field,t.category,t.owner,...t.notes,...t.contexts.flatMap(c=>Object.values(c))].join(' ').toLowerCase().includes(search)));
  }
  const api={tasks,filter,safeHref};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.PpicReadinessRecovery=api;
})(typeof window !== 'undefined' ? window : globalThis);
