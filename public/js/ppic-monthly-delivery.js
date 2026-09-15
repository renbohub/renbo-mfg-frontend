(() => {
  'use strict';
  document.querySelector('.ppic-delivery-page')?.setAttribute('data-quantity-formatted', 'true');
  const $=id=>document.getElementById(id), m=window.PpicCalendar, t=k=>window.PpicI18n.t(k);
  const num=n=>new Intl.NumberFormat(window.PpicI18n.locale(),{maximumFractionDigits:3}).format(Number(n)||0);
  const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Intl.DateTimeFormat(window.PpicI18n.locale(),{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)):'—';
  let data=[],page=1,sequence=0;const opened=new Set();
  function rows(){const term=$('pd-search').value.toLowerCase();return m.deliveryRows(data,$('pd-month').value).filter(row=>!term||[row.customerCode,row.partCode,row.partNumber,row.partName,row.sourceNumber,...(row.schedules||[]).map(s=>s.scheduleNumber)].join(' ').toLowerCase().includes(term));}
  const total=(items,field='qty')=>Object.entries(m.totalsByUnit(items,row=>row[field])).map(([unit,value])=>num(value)+' '+esc(unit)).join(' · ');
  function progress(items){return ['qty','deliveredQty','remainingQty'].map(field=>'<td>'+total(items,field)+'</td>').join('');}
  function detail(row){return '<p>'+date(row.date)+' · '+esc(row.sourceType)+' · '+esc(row.sourceNumber)+'</p><p>'+esc(t('quantity'))+': '+num(row.qty)+' '+esc(row.unit)+' · '+esc(t('delivered'))+': '+num(row.deliveredQty)+' · '+esc(t('remaining'))+': '+num(row.remainingQty)+'</p><p>'+esc(t('fgReadyBy'))+': '+date(row.fgRequiredDate)+'</p>'+(row.criticalConstraint?'<p>'+esc(row.criticalConstraint)+'</p>':'')+(row.schedules||[]).map(s=>'<p>'+esc(s.scheduleNumber)+' · '+esc(t('sent'))+': '+date(s.shippedAt)+' · '+esc(t('receivedAt'))+': '+date(s.receivedAt)+' · '+num(s.deliveredQty)+' '+esc(row.unit)+'</p>').join('')+(row.progressBasis?'<small>'+esc(t('deliveryAllocationNote'))+'</small>':'')+'<a href="/modules/planning-ppic/demand-planning/delivery-workbench?deliveryTargetId='+encodeURIComponent(row.deliveryTargetId||row.id)+'">'+esc(t('detail'))+'</a>';}
  const pageSizeControl=document.createElement("select");pageSizeControl.setAttribute("data-searchable-disabled", "true");pageSizeControl.setAttribute("aria-label", "Baris induk per halaman");pageSizeControl.innerHTML=[25,50,100].map(value=>'<option value="'+value+'">'+value+'</option>').join("");$("pd-next").after(pageSizeControl);const pageLimit=()=>Number(pageSizeControl.value)||25;pageSizeControl.addEventListener("change",()=>{page=1;render();});

  function render(){
    const filtered=rows(),groups=new Map(),weekly=$('pd-period').value==='week',cols=m.columns($('pd-month').value,{weekly});
    for(const row of filtered){if(!groups.has(row.customerCode))groups.set(row.customerCode,[]);groups.get(row.customerCode).push(row);}
    const all=[...groups],pages=Math.max(1,Math.ceil(all.length/pageLimit()));page=Math.min(page,pages);
    $('pd-page').textContent=t('page')+' '+page+'/'+pages+' · '+all.length+' customer';$('pd-prev').disabled=page===1;$('pd-next').disabled=page===pages;
    $('pd-totals').innerHTML=[['quantity','qty'],['delivered','deliveredQty'],['remaining','remainingQty']].map(([label,field])=>'<article><span>'+esc(t(label))+'</span><strong>'+(total(filtered,field)||'—')+'</strong></article>').join('');
    const head='<thead><tr><th rowspan="2">Customer / Part</th><th rowspan="2">Part Number</th>'+['quantity','delivered','remaining'].map(key=>'<th rowspan="2">'+esc(t(key))+'</th>').join('')+m.headingGroups(cols,weekly).map(group=>'<th colspan="'+group.span+'">'+esc(group.label)+'</th>').join('')+'</tr><tr>'+cols.map(c=>'<th>'+esc(c.label)+'</th>').join('')+'</tr></thead>';
    const body=all.slice((page-1)*pageLimit(),page*pageLimit()).map(([customer,items])=>{
      const parts=new Map();for(const item of items){const key=JSON.stringify([item.partCode,item.unit]);if(!parts.has(key))parts.set(key,[]);parts.get(key).push(item);}
      const parent='<tr class="ppic-group"><td><button data-customer="'+esc(customer)+'" aria-expanded="'+opened.has(customer)+'">'+(opened.has(customer)?'▾':'▸')+' '+esc(customer)+'</button></td><td>—</td>'+progress(items)+cols.map(c=>'<td>'+(total(items.filter(r=>c.days.includes(r.date)))||'—')+'</td>').join('')+'</tr>';
      if(!opened.has(customer))return parent;
      return parent+[...parts.values()].map(items=>'<tr><td>'+esc(items[0].partCode)+'<small>'+esc(items[0].unit)+'</small><small>'+esc(items[0].partName||'')+'</small></td><td>'+esc(items[0].partNumber||'—')+'</td>'+progress(items)+cols.map(c=>{const cell=items.filter(r=>c.days.includes(r.date));return '<td>'+(cell.length?'<details><summary>'+total(cell)+'</summary>'+cell.map(detail).join('')+'</details>':'—')+'</td>';}).join('')+'</tr>').join('');
    }).join('');
    $('pd-table').innerHTML='<table data-enterprise-table="off">'+head+'<tbody>'+(body||'<tr><td class="ppic-calendar-empty" colspan="'+(cols.length+5)+'">'+esc(t('empty'))+'</td></tr>')+'</tbody></table>';
  }
  async function load(){const id=++sequence;$('pd-status').textContent=t('loading');try{const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'',res=await fetch('/modules/api/planning-ppic/demand-planning/delivery-calendar',{headers:{Authorization:'Bearer '+token}}),payload=await res.json();if(!res.ok)throw Error(payload.message);if(id!==sequence)return;data=payload.items;$('pd-status').textContent='';render();}catch(error){if(id===sequence)$('pd-status').textContent=error.message;}}
  $('pd-table').addEventListener('click',event=>{const button=event.target.closest('[data-customer]');if(button){const key=button.dataset.customer;opened.has(key)?opened.delete(key):opened.add(key);render();}});
  $('pd-month').addEventListener('change',()=>{page=1;render();});$('pd-period').addEventListener('change',render);$('pd-search').addEventListener('input',()=>{page=1;render();});$('pd-refresh').addEventListener('click',load);$('pd-prev').addEventListener('click',()=>{page--;render();});$('pd-next').addEventListener('click',()=>{page++;render();});
  $('pd-export').addEventListener('click',()=>{const values=[['Customer','Part','Part Number',t('unit'),t('deliveryDate'),t('quantity'),t('delivered'),t('remaining'),t('fgReadyBy'),t('source'),t('document')],...rows().map(r=>[r.customerCode,r.partCode,r.partNumber,r.unit,r.date,r.qty,r.deliveredQty,r.remainingQty,m.dateKey(r.fgRequiredDate),r.sourceType,r.sourceNumber])],url=URL.createObjectURL(new Blob(['\ufeff',values.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='delivery-'+$('pd-month').value+'.csv';link.click();URL.revokeObjectURL(url);});
  window.addEventListener('ui:languagechange',render);window.addEventListener('ppic:demand-changed',load);load();
})();
