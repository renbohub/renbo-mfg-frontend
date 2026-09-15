(function(global,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.PPICReleasedTables=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))?Number(value):null;
  const fmt=value=>number(value)===null?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(value));
  const sum=values=>values.some(value=>number(value)===null)?null:values.reduce((total,value)=>total+Number(value),0);
  const minutes=hours=>number(hours)===null?null:Number(hours)*60;
  const datesFor=month=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'')?Array.from({length:new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate()},(_,index)=>month+'-'+String(index+1).padStart(2,'0')):[];
  const capacity=payload=>payload?.snapshot?.derived?.capacity||payload?.capacity||{};
  const monthlyRows=payload=>payload?.views?.monthly||(payload?.view==='monthly'?payload.items:[])||[];
  function encodedMachine(row){try{const parts=JSON.parse(row.id);return Array.isArray(parts)&&parts.length===3?parts[1]:null;}catch{return null;}}
  function machineKey(row,payload){
    if(row.machineKey||row.machineId)return String(row.machineKey||row.machineId);
    const encoded=encodedMachine(row);if(encoded)return String(encoded);
    const matches=(capacity(payload).machineChildren||[]).filter(child=>child.sourceRowId===row.sourceRowId);
    const keys=[...new Set(matches.map(child=>child.machineKey||child.machineId).filter(Boolean))];
    return keys.length===1?String(keys[0]):'code:'+String(row.machineCode||'unresolved');
  }
  function displayMachine(row){
    const explicit=row.machineNumber||row.machineNo||row.displayNumber||row.label;
    if(explicit)return String(explicit);
    const name=String(row.machineName||row.name||'').trim();
    // A number is used only when it is present in master metadata; never infer
    // P/S/W numbers from the tab index, family, tonnage, or serial number.
    const short=name.match(/(?:^|\s|\()([A-Z]{1,3}-\d+)(?=$|\s|\))/i);
    return short?short[1]:String(name||row.machineCode||row.code||'Mesin belum terverifikasi');
  }
  function machineOptions(payload){
    const result=new Map(),cap=capacity(payload);
    const add=(row,key)=>{
      key=String(key||row.machineKey||row.machineId||row.id||('code:'+(row.machineCode||row.code||'unresolved')));
      const previous=result.get(key)||{key,code:'',name:'',rowCount:0};
      const merged={...previous,...row,key,code:row.machineCode||row.code||previous.code,name:row.machineName||row.name||previous.name,rowCount:previous.rowCount};
      merged.explicitLabel=row.label||previous.explicitLabel;
      merged.label=displayMachine({...merged,label:merged.explicitLabel,machineCode:merged.code,machineName:merged.name});result.set(key,merged);
    };
    for(const row of cap.rows||[])add(row,row.machineKey||row.machineId);
    for(const row of cap.machineChildren||[])add(row,row.machineKey||row.machineId);
    for(const row of payload?.snapshot?.derived?.daily?.machines||[])add(row,row.id);
    for(const row of monthlyRows(payload)){
      const key=machineKey(row,payload);if(!result.has(key))add(row,key);
      result.get(key).rowCount++;
    }
    const labels=payload?.machineLabels||payload?.machines||[];
    for(const row of Array.isArray(labels)?labels:Object.entries(labels).map(([id,value])=>typeof value==='string'?{id,label:value}:{id,...value})){
      const key=String(row.machineKey||row.machineId||row.id||'');
      if(result.has(key))add(row,key);
      else for(const option of result.values())if(option.code&&(row.machineCode||row.code)===option.code)add(row,option.key);
    }
    const namedStation=option=>/^[A-Z]{1,3}-?\d+$/i.test(option.label)?0:1;
    return [...result.values()].map(option=>({key:option.key,code:option.code,name:option.name,label:option.label,rowCount:option.rowCount})).sort((a,b)=>namedStation(a)-namedStation(b)||a.label.localeCompare(b.label,'id',{numeric:true})||a.key.localeCompare(b.key));
  }
  function uniqueEvidence(rows,key){
    const found=new Map();
    for(const row of rows){const id=key(row);if(!found.has(id))found.set(id,row);else if(JSON.stringify(found.get(id))!==JSON.stringify(row))found.set(id,null);}
    return [...found.values()];
  }
  function monthlyModel(payload,selected){
    const options=machineOptions(payload),machine=options.find(option=>option.key===selected)||options[0]||null;
    const dates=datesFor(payload?.month),cap=capacity(payload),key=machine?.key;
    const rows=monthlyRows(payload).filter(row=>machineKey(row,payload)===key);
    const children=uniqueEvidence((cap.machineChildren||[]).filter(row=>String(row.machineKey||row.machineId)===key),row=>row.sourceRowId||row.id);
    const daily=dates.map(date=>{
      const matches=uniqueEvidence((cap.rows||[]).filter(row=>String(row.machineKey||row.machineId)===key&&row.date===date),row=>row.id||date);
      const day=matches.length===1?matches[0]:null;
      const idle=number(day?.loadHours)===0;
      const coilChanges=children.length?sum(children.map(child=>child?.days?.[date]?.coilChanges)):(idle?0:null);
      const dieChanges=children.length?sum(children.map(child=>child?.days?.[date]?.dieChanges)):(idle?0:null);
      const setupTime=(count,seconds)=>count===0?0:count!==null&&number(seconds)!==null?count*Number(seconds)/60:null;
      const coilMinutes=setupTime(coilChanges,cap.coilSeconds),dieMinutes=setupTime(dieChanges,cap.dieSeconds);
      const productionMinutes=children.length?sum(children.map(child=>minutes(child?.days?.[date]?.productionHours))):(idle?0:null);
      return {date,coilChanges,dieChanges,coilMinutes,dieMinutes,setupMinutes:sum([coilMinutes,dieMinutes]),productionMinutes,
        loadMinutes:minutes(day?.loadHours),availableMinutes:minutes(day?.availableHours),remainingMinutes:minutes(day?.remainingHours),
        loadingRatio:number(day?.utilizationPct),status:day?.status||'UNKNOWN',isHoliday:day?.isHoliday===true,issues:day?.issues||[]};
    });
    return {month:payload?.month,machine,options,dates,rows,daily,hasCapacity:(cap.rows||[]).some(row=>String(row.machineKey||row.machineId)===key)};
  }
  function machineTabs(options,selected){
    return '<nav class="release-detail-tabs" role="tablist" aria-label="Mesin produksi">'+options.map(option=>'<button type="button" role="tab" aria-selected="'+(option.key===selected)+'" tabindex="'+(option.key===selected?'0':'-1')+'" data-release-machine="'+esc(option.key)+'" title="'+esc([option.name,option.code].filter(Boolean).join(' · '))+'"><strong>'+esc(option.label)+'</strong><span>'+fmt(option.rowCount)+' part/proses</span></button>').join('')+'</nav>';
  }
  function categoryTabs(category){
    return '<nav class="release-detail-tabs" role="tablist" aria-label="Jenis kebutuhan pembelian">'+[['MATERIAL','Material'],['PURCHASE_PART','Purchase part']].map(([key,label])=>'<button type="button" role="tab" aria-selected="'+(category===key)+'" tabindex="'+(category===key?'0':'-1')+'" data-release-material="'+key+'">'+label+'</button>').join('')+'</nav>';
  }
  const monthlyColumns=[['partCode','Part'],['partNumber','Part Number'],['partName','Nama part'],['parentPartCode','FG sumber'],['processCode','Proses'],['quantity','Qty bulan','qty'],['uomCode','UOM']];
  function monthlyTable(model,rows=model.rows,marker=()=> ''){
    const head='<tr>'+monthlyColumns.map(([,label])=>'<th scope="col">'+label+'</th>').join('')+model.dates.map(date=>'<th scope="col" class="release-day-col"><span>'+date.slice(-2)+'</span><small>'+esc(new Intl.DateTimeFormat('id-ID',{weekday:'short',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')))+'</small></th>').join('')+'</tr>';
    const body=rows.map(row=>'<tr>'+monthlyColumns.map(([key,,kind])=>'<td'+(kind==='qty'?' class="is-numeric"':'')+'>'+esc(kind==='qty'?fmt(row[key]):row[key]??'—')+(key==='partCode'?marker(row):'')+'</td>').join('')+model.dates.map(date=>'<td class="is-numeric release-day-col'+(number(row.days?.[date])>0?' has-plan':'')+'">'+fmt(Object.prototype.hasOwnProperty.call(row.days||{},date)?row.days[date]:0)+'</td>').join('')+'</tr>').join('');
    return {head,body:body||'<tr><td class="lab-release-empty-cell" colspan="'+(monthlyColumns.length+model.dates.length)+'">Tidak ada data produksi sesuai pilihan mesin / pencarian.</td></tr>',columnCount:monthlyColumns.length+model.dates.length};
  }
  function monthlySummary(model){
    if(!model.machine)return '';
    const measures=[
      ['C/T Coil','coilMinutes','minute','coilChanges'],['C/T Dies','dieMinutes','minute','dieChanges'],['Total Time · Dandory','setupMinutes','minute'],
      ['OPERATION TIME (LOADING)','loadMinutes','minute'],['Available Time','availableMinutes','minute'],['REMAINING AVAILABLE TIME','remainingMinutes','minute'],['LOADING RATIO','loadingRatio','%']
    ];
    return '<section class="release-monthly-resume"><header><h3>Resume harian · '+esc(model.machine.label)+'</h3><p>Loading = produksi + dandory · Available = kapasitas efektif release · Rasio dalam %, waktu dalam menit</p></header><div class="release-summary-scroll" tabindex="0" role="region" aria-label="Resume harian mesin '+esc(model.machine.label)+'"><table data-enterprise-table="off"><thead><tr><th scope="col">Dandory / kapasitas</th>'+model.dates.map(date=>'<th class="release-day-col" scope="col">'+date.slice(-2)+'</th>').join('')+'</tr></thead><tbody>'+measures.map(([label,key,unit,count])=>'<tr><th scope="row">'+label+' <span class="release-measure-unit">('+unit+')</span></th>'+model.daily.map(day=>'<td class="is-numeric release-day-col'+(key==='remainingMinutes'&&day[key]!==null&&day[key]<0||key==='loadingRatio'&&day[key]>100?' is-overload':'')+(day.isHoliday?' is-holiday':'')+'" title="'+esc(day.date+(day.issues.length?' · '+day.issues.join(' · '):''))+'">'+(count?'<span class="release-setup-count">'+fmt(day[count])+' kali</span>':'')+fmt(day[key])+(unit==='%'&&day[key]!==null?'%':'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(!model.hasCapacity?'<p class="release-source-note">Resume kapasitas belum tersedia pada snapshot release ini; angka yang belum diketahui ditampilkan —.</p>':'')+'</section>';
  }
  function partner(row,view){
    const kind=view==='delivery'?'customer':view==='vendor'?'vendor':'supplier';
    const code=row[kind+'Code']||row.partnerCode||'',name=row[kind+'Name']||'';
    return {key:kind+':'+String(code||row[kind+'Id']||name||'unassigned'),label:[code,name].filter((value,index,all)=>value&&all.indexOf(value)===index).join(' · ')||({customer:'Customer',vendor:'Vendor',supplier:'Supplier'}[kind]+' belum ditentukan')};
  }
  function grouped(rows,view){
    const groups=new Map();for(const row of rows){const identity=partner(row,view);if(!groups.has(identity.key))groups.set(identity.key,{...identity,rows:[]});groups.get(identity.key).rows.push(row);}
    return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'id',{numeric:true}));
  }
  function sortGrouped(rows,view){return grouped(rows,view).flatMap(group=>group.rows);}
  function groupRows(rows,view,columns,renderCell){
    return grouped(rows,view).map(group=>'<tr class="release-partner-group"><th scope="rowgroup" colspan="'+columns.length+'"><span>'+esc(group.label)+'</span><small>'+group.rows.length+' baris</small></th></tr>'+group.rows.map(row=>'<tr>'+columns.map(([key,,kind])=>'<td class="'+(['qty','number','percent','day'].includes(kind)?'is-numeric':kind==='note'?'is-note':'')+'">'+renderCell(row,key,kind)+'</td>').join('')+'</tr>').join('')).join('');
  }
  function fulfillmentRows(rows,control){
    const byId=new Map(),duplicates=new Set();
    for(const row of control?.items||[]){if(row.id===null||row.id===undefined)continue;const key=String(row.id);if(byId.has(key))duplicates.add(key);else byId.set(key,row);}
    return rows.map(row=>{
      const evidence=duplicates.has(String(row.id))?null:byId.get(String(row.id));
      const actual=number(evidence?.actualQty),planned=number(row.quantity??row.requiredQty),remaining=actual!==null&&planned!==null?Math.max(0,planned-actual):null;
      return {...row,plannedQty:planned,actualQty:actual,remainingQty:remaining,fulfillmentPct:actual!==null&&planned>0?actual/planned*100:null,
        fulfillmentStatus:evidence?.status||(control?'UNLINKED':'AWAITING_ACTUAL'),fulfillmentIssue:evidence?.issue||(control?'Belum ada bukti aktual yang terhubung.':'Aktual sedang dimuat / belum tersedia.'),references:evidence?.references||[],actualAsOf:control?.asOf||null};
    });
  }
  const statusLabels={FULFILLED:'Terpenuhi',PARTIAL:'Sebagian',RECOVERY_REQUIRED:'Perlu tindak lanjut',UNLINKED:'Belum terhubung',AWAITING_ACTUAL:'Aktual belum tersedia',ATTENTION:'Perlu diperiksa',PLANNED:'Terencana',LATE:'Terlambat'};
  function fulfillmentStatus(row){
    const status=row.fulfillmentStatus||row.status||'UNLINKED',value=number(row.fulfillmentPct),known=value!==null;
    const tone=status==='ATTENTION'||status==='RECOVERY_REQUIRED'||status==='LATE'?'attention':known&&value>=100?'complete':known?'partial':'unknown';
    return '<div class="release-fulfillment is-'+tone+'" title="'+esc(row.fulfillmentIssue||row.issue||'')+'"><span>'+esc(statusLabels[status]||status)+'</span><span class="release-progress"'+(known?' role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,Math.max(0,value))+'" aria-label="Pemenuhan '+esc(fmt(value))+'%"':' aria-label="Pemenuhan belum diketahui"')+'><i style="width:'+(known?Math.min(100,Math.max(0,value)):0)+'%"></i></span><small>'+(known?fmt(value)+'%':'—')+'</small></div>';
  }
  return {machineOptions,machineKey,monthlyModel,machineTabs,categoryTabs,monthlyTable,monthlySummary,partner,grouped,sortGrouped,groupRows,fulfillmentRows,fulfillmentStatus,fmt};
});
