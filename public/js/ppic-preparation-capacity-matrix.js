(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepCapacityMatrix=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
  const format=value=>numeric(value)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value)):'—';
  const sum=values=>values.every(numeric)?values.reduce((total,value)=>total+Number(value),0):null;
  function columnLetter(index){let value=index+1,result='';while(value>0){result=String.fromCharCode(65+(value-1)%26)+result;value=Math.floor((value-1)/26);}return result;}
  const columnLabel=(label,index)=>'<span class="prep-col-letter" aria-hidden="true">'+columnLetter(index)+'</span><span class="prep-col-name">'+escape(label)+'</span>';
  function dates(month){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||''))return [];
    return Array.from({length:new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate()},(_,index)=>month+'-'+String(index+1).padStart(2,'0'));
  }
  const keyOf=row=>row.machineKey||row.machineId||String(row.id||'unknown').replace(/:\d{4}-\d{2}-\d{2}$/,'');
  function build(result,month){
    const calendar=dates(month),allowed=new Set(calendar),groups=new Map();
    const group=row=>{
      const key=keyOf(row);
      if(!groups.has(key))groups.set(key,{key,machineCode:row.machineCode||'Mesin belum ditentukan',days:{},children:[]});
      return groups.get(key);
    };
    for(const row of result?.rows||[])if(allowed.has(row.date))group(row).days[row.date]=row;
    for(const child of result?.machineChildren||[]){
      const relevant=calendar.some(date=>Number(child.days?.[date]?.quantity)>0||Number(child.days?.[date]?.setupHours)>0||child.days?.[date]?.quantity===null)||Number(child.unallocatedQty)>0;
      if(relevant)group(child).children.push(child);
    }
    return [...groups.values()].sort((a,b)=>a.machineCode.localeCompare(b.machineCode)||a.key.localeCompare(b.key));
  }
  function filter(groups,term){
    const query=String(term||'').trim().toLowerCase();if(!query)return groups;
    const includes=value=>String(value??'').toLowerCase().includes(query);
    return groups.flatMap(machine=>{
      if(includes(machine.machineCode)||Object.values(machine.days).some(day=>[day.date,day.status,...(day.issues||[])].some(includes)))return [machine];
      const children=machine.children.filter(child=>[child.partCode,child.partNumber,child.partName,child.processCode,child.parentPartCode,child.bomNumber,...(child.issues||[])].some(includes));
      return children.length?[{...machine,children,filtered:true}]:[];
    });
  }
  function head(month){
    const calendar=dates(month);
    return '<tr><th scope="col" class="prep-capacity-identity">'+columnLabel('Mesin / Child Part',0)+'</th><th scope="col" class="prep-capacity-context">'+columnLabel('Proses / FG sumber',1)+'</th><th scope="col" class="prep-capacity-cycle">'+columnLabel('CT Actual BOM (detik/unit)',2)+'</th>'+calendar.map((date,index)=>{const day=new Date(date+'T00:00:00Z').getUTCDay(),weekend=day===0||day===6;return '<th scope="col" class="prep-capacity-day'+(weekend?' is-weekend':'')+'" title="'+date+'">'+columnLabel(date.slice(-2),index+3)+'<small class="prep-capacity-weekday">'+['Min','Sen','Sel','Rab','Kam','Jum','Sab'][day]+'</small></th>';}).join('')+'<th scope="col" class="prep-capacity-day">'+columnLabel('Total bulan',calendar.length+3)+'</th></tr>';
  }
  function optionIcons(options={}){
    const shifts=options.overtimeShift1&&options.overtimeShift2?'1+2':options.overtimeShift1?'1':options.overtimeShift2?'2':'';
    return (shifts?'<span class="prep-capacity-marker overtime" title="Lembur shift '+shifts+'" aria-label="Lembur shift '+shifts+'">◷ '+shifts+'</span>':'')+(options.overlap?'<span class="prep-capacity-marker overlap" title="Overlap: istirahat dipakai kerja" aria-label="Overlap shift">↔</span>':'');
  }
  function machineCell(day={},edit){
    const issues=day.issues||[],hoursKnown=numeric(day.availableHours)&&Number(day.availableHours)>=0&&numeric(day.loadHours)&&Number(day.loadHours)>=0;
    const noCapacity=hoursKnown&&Number(day.availableHours)===0&&Number(day.loadHours)>0;
    const known=hoursKnown&&numeric(day.utilizationPct)&&Number(day.utilizationPct)>=0,pct=known?Number(day.utilizationPct):null;
    const className=noCapacity||known&&pct>=100?'utilization-high':known&&pct>=80?'utilization-medium':known?'utilization-low':'utilization-unknown';
    let display=pct;
    // Do not let display rounding make a green 79.9999% look like yellow 80%, or yellow look red.
    if(known&&((pct<80&&Math.round(pct*1000)>=80000)||(pct<100&&Math.round(pct*1000)>=100000)))display=Math.floor(pct*1000)/1000;
    const label=day.isHoliday?'LIBUR':noCapacity?'>100%':known?format(display)+'%':'—';
    const detail=['Kapasitas terpakai: '+label,'Beban: '+format(day.loadHours)+' jam','Tersedia: '+format(day.availableHours)+' jam','Sisa: '+format(day.remainingHours)+' jam',Number(day.overloadHours)>0?'Over capacity: '+format(day.overloadHours)+' jam':'',noCapacity?'Ada beban tanpa jam tersedia':!known?'Persentase belum dapat diverifikasi':'',...issues].filter(Boolean).join(' · ');
    const icons=day.isHoliday?'':optionIcons(day.options),content='<strong>'+escape(label)+'</strong>'+(day.isHoliday&&Number(day.loadHours)>0?'<small class="prep-capacity-holiday-warning">⚠ '+format(day.loadHours)+' jam teralokasi</small>':'')+(icons?'<span class="prep-capacity-markers">'+icons+'</span>':'')+(!day.isHoliday&&day.options?.dayStatus==='WORKING'?'<span class="prep-capacity-marker working">Masuk</span>':'');
    const button=edit?.id?'<button type="button" class="prep-capacity-cell-edit" data-capacity-edit="machine" data-capacity-id="'+escape(edit.id)+'" data-capacity-date="'+escape(edit.date)+'" aria-label="Atur jam kerja '+escape(edit.label)+' '+escape(edit.date)+'">'+content+'</button>':content;
    return '<td class="prep-capacity-machine-value '+className+(day.isHoliday?' is-holiday':'')+(day.isHoliday&&Number(day.loadHours)>0?' holiday-load':'')+'" title="'+escape(detail)+'" aria-label="'+escape(detail)+'">'+button+'</td>';
  }
  function childCell(day={},uom='',edit){
    const issues=day.issues||[],unknown=!numeric(day.quantity)||!numeric(day.loadHours);
    const content='<strong>'+format(day.quantity)+' <small>'+escape(uom)+'</small></strong><small>'+format(day.loadHours)+' jam'+(issues.length?' · ⚠':'')+'</small>'+((day.coilChanges||day.dieChanges)?'<small class="prep-capacity-setup">Coil '+format(day.coilChanges||0)+' · Dies '+format(day.dieChanges||0)+'</small>':'');
    const button=edit?'<button type="button" class="prep-capacity-cell-edit" data-capacity-edit="quantity" data-capacity-id="'+escape(edit.id)+'" data-capacity-date="'+escape(edit.date)+'" aria-label="Edit qty '+escape(edit.label)+' '+escape(edit.date)+'">'+content+'</button>':content;
    return '<td class="prep-capacity-child-value'+(issues.length||unknown?' attention':'')+(Number(day.quantity)===0?' is-zero':'')+(day.isHoliday?' is-holiday':'')+(day.isHoliday&&Number(day.loadHours)>0?' holiday-load':'')+'" title="'+escape([day.isHoliday?'LIBUR':'','Qty: '+format(day.quantity)+' '+uom,'Beban: '+format(day.loadHours)+' jam','Coil: '+format(day.coilChanges||0)+' × 1.800 detik','Dies: '+format(day.dieChanges||0)+' × 3.600 detik',...issues].filter(Boolean).join(' · '))+'">'+button+'</td>';
  }
  function cycleCell(child){
    if(!child)return '<td class="prep-capacity-cycle" title="Cycle time mengikuti masing-masing child part, bukan total mesin.">—</td>';
    const valid=numeric(child.cycleTimeSeconds)&&Number(child.cycleTimeSeconds)>0;
    return '<td class="prep-capacity-cycle'+(valid?'':' attention')+'" title="'+escape(valid?'CT Actual BOM: '+format(child.cycleTimeSeconds)+' detik/'+(child.uomCode||'unit')+' · sumber yang sama dengan perhitungan beban mesin':'CT Actual pada routing BOM belum tersedia atau tidak valid')+'">'+(valid?format(child.cycleTimeSeconds):'—')+'</td>';
  }
  function rows(machines,month,expanded=new Set(),autoExpand=false){
    const calendar=dates(month);
    return machines.map(machine=>{
      const open=expanded.has(machine.key)||autoExpand,children=machine.children;
      const loads=calendar.map(date=>machine.days[date]?.loadHours),available=calendar.map(date=>machine.days[date]?.availableHours),load=sum(loads),hours=sum(available);
      const total={loadHours:load,availableHours:hours,remainingHours:load==null||hours==null?null:hours-load,utilizationPct:hours>0&&load!=null?load/hours*100:hours===0&&load===0?0:null,overloadHours:sum(calendar.map(date=>machine.days[date]?.overloadHours)),issues:[]};
      const button=children.length?'<button type="button" data-capacity-toggle="'+escape(machine.key)+'" aria-expanded="'+open+'" aria-label="'+(open?'Tutup':'Buka')+' child mesin '+escape(machine.machineCode)+'">'+(open?'−':'+')+'</button>':'<span class="prep-capacity-no-toggle">·</span>';
      const parent='<tr class="prep-capacity-machine" data-capacity-machine="'+escape(machine.key)+'"><th scope="row" class="prep-capacity-identity">'+button+'<span><strong>'+escape(machine.machineCode)+'</strong><small>'+children.length+' child part'+(machine.filtered?' sesuai filter':'')+'</small></span></th><td class="prep-capacity-context">Utilisasi mesin<small>kapasitas terpakai</small></td>'+cycleCell()+calendar.map(date=>machineCell(machine.days[date],{id:machine.days[date]?.machineId,date,label:machine.machineCode})).join('')+machineCell(total)+'</tr>';
      if(!open)return parent;
      return parent+children.map(child=>{
        const childDays=calendar.map(date=>child.days?.[date]),qty=sum(childDays.map(day=>day?.quantity)),childLoad=sum(childDays.map(day=>day?.loadHours));
        const pending=Number(child.unallocatedQty)>0?'<small class="prep-capacity-pending">'+format(child.unallocatedQty)+' '+escape(child.uomCode)+' belum teralokasi</small>':'';
        const issues=child.issues||[];
        return '<tr class="prep-capacity-child" data-capacity-child="'+escape(child.sourceRowId)+'"><th scope="row" class="prep-capacity-identity" title="'+escape([child.partName,...issues].filter(Boolean).join(' · '))+'"><span class="prep-capacity-branch">↳</span><span><strong>'+escape(child.partCode||'—')+'</strong><small>'+escape(child.partNumber||'—')+'</small>'+pending+'</span></th><td class="prep-capacity-context" title="'+escape([child.partName,child.processCode,child.parentPartCode,child.bomNumber].filter(Boolean).join(' · '))+'">'+escape(child.processCode||'—')+'<small>'+escape(child.parentPartCode||'—')+'</small></td>'+cycleCell(child)+calendar.map(date=>childCell(child.days?.[date],child.uomCode,{id:child.sourceRowId,date,label:child.partCode+' / '+child.processCode})).join('')+childCell({quantity:qty,loadHours:childLoad,issues},child.uomCode)+'</tr>';
      }).join('');
    }).join('');
  }
  return {dates,build,filter,head,rows,machineCell,childCell,columnLabel,cycleCell};
});
