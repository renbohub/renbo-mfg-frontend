(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepAdditionalPo=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const key=r=>JSON.stringify([String(r.partCode||'').trim(),String(r.uomCode||'').toUpperCase(),String(r.customerCode||'').trim()]);
 function merge(workbook,snapshot,context){
  const w=clone(workbook),s=clone(snapshot);s.poContext=context;
  for(const plan of context.revisions||[]){
   const parent=s.rows.find(r=>r.id===plan.rowId),demand=w.delivery.find(r=>r.id===plan.rowId);if(!parent||!demand)continue;
   demand.days[plan.deliveryDate]=(demand.days[plan.deliveryDate]||0)+plan.quantity;parent.days={...demand.days};
   parent.additionalDays||={};parent.additionalDays[plan.deliveryDate]=(parent.additionalDays[plan.deliveryDate]||0)+plan.quantity;
   if(plan.mode==='BUFFER'){
    const buffer=parent.demandContext?.buffer;if(buffer){let left=plan.quantity;for(const date of Object.keys(buffer.days).sort()){const n=Math.min(left,buffer.days[date]);buffer.days[date]-=n;left-=n;}buffer.quantity=Math.max(0,buffer.quantity-plan.quantity);}
   }else if(plan.snapshot){
    const extra=plan.snapshot.rows[0];parent.children.push(...(extra.children||[]).map(r=>({...r,additionalAllocation:true,additionalRevision:plan.revision,sourceNote:'Additional PO '+plan.sourceNumber+' · revisi tambahan '+plan.revision})));
    parent.additionalProductionDays||={};parent.additionalProductionDays[plan.deliveryDate]=(parent.additionalProductionDays[plan.deliveryDate]||0)+plan.quantity;
    parent.deliveryLots=[...(parent.deliveryLots||[]),...(extra.deliveryLots||[])];
    mergeDerived(s.derived,plan.snapshot.derived);
   }
   // A changed demand must not retain the old green coverage badge.
   delete parent.demandCoverage?.[plan.deliveryDate];
  }
  for(const parent of s.rows.filter(r=>r.additionalDays&&r.deliveryLots)){
   const requirements={...parent.days};for(const kind of ['shortage','buffer'])for(const [date,qty]of Object.entries(parent.demandContext?.[kind]?.days||{}))requirements[date]=(requirements[date]||0)+qty;
   parent.demandCoverage=coverage(parent.deliveryLots,requirements);parent.requiredQty=Object.values(requirements).reduce((n,q)=>n+q,0);parent.unallocatedQty=Object.values(parent.demandCoverage).reduce((n,c)=>n+c.shortageQty,0);
  }
  return {workbook:w,snapshot:s};
 }
 function coverage(lots,requirements){
  const supplies=lots.flatMap(l=>[...(l.stockQty>0?[{qty:l.stockQty,at:-Infinity}]:[]),...(l.producedQty>0&&l.readyAt?[{qty:l.producedQty,at:Date.parse(l.readyAt)}]:[])]).sort((a,b)=>a.at-b.at);let index=0;
  return Object.fromEntries(Object.entries(requirements).sort(([a],[b])=>a.localeCompare(b)).map(([date,quantity])=>{let need=quantity,onTimeQty=0,finish=-Infinity;const start=Date.parse(date+'T00:00:00Z');while(need>1e-7&&index<supplies.length){const source=supplies[index],take=Math.min(need,source.qty);if(source.at<start+86400000)onTimeQty+=take;finish=Math.max(finish,source.at);need-=take;source.qty-=take;if(source.qty<1e-7)index++;}const shortageQty=Math.max(0,quantity-onTimeQty);return [date,{quantity,onTimeQty,shortageQty,status:shortageQty>1e-7?'SHORTAGE':finish>=start?'TIGHT':'READY',readyAt:finish===-Infinity?null:new Date(finish).toISOString(),stockOnly:finish===-Infinity&&need<1e-7}];}));
 }
 function mergeDerived(base,extra){
  if(!base||!extra)return;
  for(const name of ['purchase','vendor'])if(extra[name]){base[name]||={rows:[],warnings:[]};base[name].rows.push(...clone(extra[name].rows||[]));base[name].warnings=[...(base[name].warnings||[]),...(extra[name].warnings||[])];}
  if(extra.daily){base.daily||={jobs:[],machines:[],unscheduled:[]};base.daily.jobs.push(...clone(extra.daily.jobs).map(j=>({...j,additionalAllocation:true})));for(const machine of extra.daily.machines)if(!base.daily.machines.some(m=>m.id===machine.id))base.daily.machines.push(clone(machine));base.daily.unscheduled.push(...clone(extra.daily.unscheduled||[]));}
  if(extra.capacity){base.capacity||={rows:[],machineChildren:[],unallocatedRows:[],warnings:[]};base.capacity.machineChildren.push(...clone(extra.capacity.machineChildren||[]));for(const row of extra.capacity.rows){const current=base.capacity.rows.find(r=>r.machineKey===row.machineKey&&r.date===row.date);if(!current){base.capacity.rows.push(clone(row));continue;}current.loadHours=current.loadHours==null||row.loadHours==null?null:current.loadHours+row.loadHours;current.allocatedQty=(current.allocatedQty||0)+(row.allocatedQty||0);current.remainingHours=current.loadHours==null?null:current.availableHours-current.loadHours;current.utilizationPct=current.availableHours>0&&current.loadHours!=null?current.loadHours/current.availableHours*100:current.loadHours===0?0:null;current.overloadHours=current.remainingHours==null?null:Math.max(0,-current.remainingHours);for(const k of ['partCodes','sourceRowIds','invalidSourceRowIds','issues'])current[k]=[...new Set([...(current[k]||[]),...(row[k]||[])])];}}
 }
 function mount({api,getContext,reload,message}){
  const dialog=document.getElementById('prep-additional-dialog'),select=document.getElementById('prep-additional-target'),mode=document.getElementById('prep-additional-mode'),date=document.getElementById('prep-additional-date'),output=document.getElementById('prep-additional-result'),save=document.getElementById('prep-additional-save'),preview=document.getElementById('prep-additional-preview');
  let data,review=null,pending=false,focus;
  const invalidate=()=>{review=null;save.disabled=true;output.textContent='';};
  const change=()=>{invalidate();const target=Object.values(data.groups).flatMap(g=>g.additional).find(t=>t.id===select.value);date.value=target?.date>=data.today?target.date:'';date.min=data.today;date.max=data.month+'-'+new Date(+data.month.slice(0,4),+data.month.slice(5),0).getDate();};
  for(const node of [mode,date])node.addEventListener('change',invalidate);select.addEventListener('change',change);
  dialog.querySelector('[data-additional-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>focus?.focus());
  const body=()=>({month:data.month,lockId:data.lockId,revision:data.revision,targetId:select.value,mode:mode.value,deliveryDate:date.value});
  const busy=value=>{pending=value;for(const node of [select,mode,date,preview])node.disabled=value;save.disabled=value||!review;};
  preview.onclick=async()=>{if(pending)return;busy(true);review=null;try{const result=await api('/additional-po/preview','POST',body());review=result;output.textContent=new Intl.NumberFormat('id-ID').format(result.plan.quantity)+' '+result.plan.uomCode+' → '+result.plan.deliveryDate+' · '+(result.plan.mode==='BUFFER'?'Alokasi dari buffer':'Produksi tambahan; slot tersedia')+' · Revisi tambahan '+(result.revision+1);}catch(error){output.textContent=error.message;}finally{busy(false);}};
  save.onclick=async()=>{if(pending||!review)return;busy(true);try{const result=await api('/additional-po/commit','POST',{...body(),reviewHash:review.reviewHash});dialog.close();await reload();message('Revisi tambahan '+result.revision+' tersimpan. Jadwal release lama tidak berubah; tambahan ini belum menerbitkan DPS/PR baru.');}catch(error){review=null;output.textContent=error.message;}finally{busy(false);}};
  return {open:partCode=>{data=getContext();if(!data?.lockId){message('Additional PO tersedia setelah PPIC Lab lock.',true);return;}const targets=Object.values(data.groups).flatMap(g=>g.additional).filter(t=>!t.processed&&(!partCode||t.partCode===partCode));if(!targets.length){message('Tidak ada Additional PO yang belum diproses untuk pilihan ini.');return;}select.replaceChildren(...targets.map(t=>{const option=document.createElement('option');option.value=t.id;option.textContent=[t.sourceNumber,t.partCode,t.date,new Intl.NumberFormat('id-ID').format(t.quantity)+' '+t.uomCode].join(' · ');return option;}));mode.value='BUFFER';change();focus=document.activeElement;dialog.showModal();select.focus();}};
 }
 return {merge,mergeDerived,mount,key,coverage};
});
