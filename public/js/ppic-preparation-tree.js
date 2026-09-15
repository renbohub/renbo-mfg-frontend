(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ppic-preparation-model'):root.PrepWorkbook);if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepProcessTree=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const signature=w=>M.stable({month:w.month,delivery:w.delivery,demandAdjustments:w.demandAdjustments||{},allocationSettings:w.allocationSettings||{},processAllocations:w.processAllocations||{},vendorDispatchAllocations:w.vendorDispatchAllocations||{},vendorLeadTimeOverrides:w.vendorLeadTimeOverrides||{},machineDayOverrides:w.machineDayOverrides||{},processSetupCounts:w.processSetupCounts||{},dailyScheduleOverrides:w.dailyScheduleOverrides||{}});
  function columns(month){
    const base=M.columns('delivery',month);
    const label=offset=>{const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'UTC'}).format(d);};
    const days=base.filter(c=>c.date).map(column=>({...column,movement:'allocation',width:144}));
    return [{field:'explodeNo',title:'No. explode',width:130,readonly:true,frozen:true},{...base[0],title:'Part Code / Part Number',width:205,frozen:true},{field:'rowType',title:'Kebutuhan / pelaksana',width:120,readonly:true},{field:'processCode',title:'Proses',width:135,readonly:true},{...base[2],width:180},{field:'poQty',title:'PO '+label(0),width:115,numeric:true,readonly:true},{field:'forecastQty',title:'Forecast '+label(1),width:125,numeric:true,readonly:true},{field:'additionalPoQty',title:'Additional PO '+label(0),width:155,numeric:true,readonly:true},{field:'currentStock',title:'Current Stock',width:110,numeric:true,readonly:true},{field:'unallocatedQty',title:'Unallocated Qty',width:125,numeric:true,readonly:true},...days,{field:'_total',title:'Total',width:144,numeric:true,readonly:true}];
  }
  function vendorLeadLabel(row){
    if(row.allocationKind!=='VENDOR_LEAD_TIME')return '';
    const source=row.vendorLeadTimeSource==='DEPARTMENT_CONFIRMATION'?'Konfirmasi':row.vendorLeadTimeSource==='WORKBOOK_OVERRIDE'?'Workbook':'BOM';
    if(row.vendorLeadTimeMinutes==null||!Number.isFinite(Number(row.vendorLeadTimeMinutes))||Number(row.vendorLeadTimeMinutes)<0)return 'LT '+source+' belum valid';
    const validValue=row.vendorLeadTimeValue!=null&&Number.isFinite(Number(row.vendorLeadTimeValue))&&Number(row.vendorLeadTimeValue)>=0;
    const unit=validValue?({SECOND:'detik',MINUTE:'menit',HOUR:'jam',DAY:'hari'}[row.vendorLeadTimeUnit]||row.vendorLeadTimeUnit||'menit'):'menit';
    const qty=validValue?row.vendorLeadTimeValue:row.vendorLeadTimeMinutes;
    return 'LT '+new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(qty)+' '+unit+' · '+source;
  }
  function vendorFlow(row,month,workbook){
    const vendor=row.allocationKind==='VENDOR_LEAD_TIME',dates=M.dates(month);
    if(!vendor)return {...Object.fromEntries(dates.flatMap(date=>[['out'+date.slice(-2),null],['in'+date.slice(-2),null]])),_vendorOutTotal:null,_vendorInTotal:null};
    const manual=workbook?.vendorDispatchAllocations?.[row.id];
    const dispatchBasis=!!manual||row.vendorAllocationBasis==='DISPATCH';
    const knownLead=row.vendorLeadTimeMinutes!=null&&Number.isFinite(Number(row.vendorLeadTimeMinutes))&&Number(row.vendorLeadTimeMinutes)>=0;
    const dispatchKnown=!!manual||row.vendorDispatchDays!=null&&(dispatchBasis||knownLead),receiptKnown=!dispatchBasis||knownLead&&row.vendorReceiptDays!=null;
    const number=value=>value==null?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
    const values={},outgoing=[],incoming=[];
    for(const date of dates){
      const day=date.slice(-2),dispatch=manual||row.vendorDispatchDays||{};
      const out=dispatchKnown?number(Object.hasOwn(dispatch,date)?dispatch[date]:0):null;
      const receipts=row.vendorReceiptDays;
      const into=receiptKnown?number(receipts?Object.hasOwn(receipts,date)?receipts[date]:0:row['d'+day]):null;
      values['d'+day]=out;values['out'+day]=out;values['in'+day]=into;
      outgoing.push(out);incoming.push(into);
    }
    const total=values=>values.some(value=>value==null)?null:values.reduce((sum,value)=>sum+value,0);
    return {...values,_total:total(outgoing),_vendorOutTotal:total(outgoing),_vendorInTotal:total(incoming)};
  }
  function rows(workbook,snapshot,status='Belum dihitung'){
    const byId=new Map((snapshot?.rows || []).map(r=>[r.id,r]));
    return M.flatten(workbook.delivery,workbook.month).map((parent,parentIndex)=>{
      const source=byId.get(parent.id),fg='FG '+String(parentIndex+1).padStart(3,'0'),ref=n=>n;
      const children=M.flatten(source?.children || [],workbook.month).map(child=>{
        const known=child.dependencyStatus==='KNOWN',parallel=known&&child.parallelNumbers?.length>0,serial=known&&child.predecessorNumbers?.length>0;
        return {...child,...vendorFlow(child,workbook.month,workbook),_kind:'PROCESS',customerCode:parent.customerCode,explodeNo:child.explodeNo?ref(child.explodeNo):'—',productionFlow:!known?'Belum terverifikasi':parallel?(serial?'Concurrent + Precedence':'Concurrent Operations'):serial?'Precedence Constraint':'Start Operation',flowTone:!known?'unknown':parallel?'parallel':'serial',dependsOn:known?(child.predecessorNumbers?.map(ref).join(', ')||'—'):'Belum terverifikasi',parallelWith:known?child.parallelNumbers?.map(ref).join(', '):''};
      });
      if(source?.demandContext){
        const context=source.demandContext;
        const values=Object.fromEntries(M.dates(workbook.month).map(date=>['d'+date.slice(-2),Object.fromEntries(['shortage','buffer'].map(kind=>[kind,context[kind].verified?context[kind].days?.[date]||0:null]))]));
        children.unshift({...values,id:'ADJ-'+parent.id,parentId:parent.id,_kind:'ADJUSTMENT',partCode:parent.partCode,partNumber:source.partNumber||parent.partNumber,partName:'Shortage '+context.previousMonth+' / Buffer '+context.nextMonth,rowType:'Shortage / Buffer',processCode:['shortage','buffer'].some(k=>context[k].source==='WORKBOOK')?'Koreksi workbook':'Otomatis',productionFlow:context.note,sourceNote:context.note,adjustmentContext:context,allocationMode:['shortage','buffer'].some(k=>context[k].source==='WORKBOOK')?'MANUAL':'AUTO',_total:{shortage:context.shortage.quantity,buffer:context.buffer.quantity},currentStock:null,unallocatedQty:null,explodeNo:'—',dependsOn:'—'});
      }
      const warnings=[...(source?.warnings || [status])];
      warnings.forEach((warning,index)=>children.push({id:JSON.stringify([parent.id,'notice',index]),_kind:'NOTICE',partCode:'Periksa BOM',partName:warning,rowType:'Perlu ditinjau',_total:null}));
      parent.additionalProductionDays=source?.additionalProductionDays||{};
      const summary=snapshot?.poContext?.groups?.[JSON.stringify([parent.partCode,parent.uomCode,parent.customerCode||''])];
      return {...parent,...vendorFlow({},workbook.month),poQty:summary?.poQty??(snapshot?.poContext?0:null),forecastQty:summary?.forecastQty??(snapshot?.poContext?0:null),additionalPoQty:summary?.additionalPoQty??(snapshot?.poContext?0:null),additionalDays:source?.additionalDays||{},currentStock:source?.currentStock??null,unallocatedQty:source?.unallocatedQty??null,requiredQty:source?.requiredQty,stockAssigned:source?.stockAssigned,allocationIssues:source?.allocationIssues||[],demandCoverage:source?.demandCoverage||{},explodeNo:fg,productionFlow:'Delivery Need',dependsOn:source?.dependencyStatus==='KNOWN'?(source.deliveryPredecessors?.map(ref).join(', ')||'—'):'Belum terverifikasi',partNumber:source?.partNumber || parent.partNumber,partName:parent.partName || source?.partName || '',_kind:'FG',rowType:'Delivery Need',processCode:'',_children:children};
    });
  }
  function editable(row,column){return !!column&&!column.readonly&&(row._kind==='FG'||['PROCESS','ADJUSTMENT'].includes(row._kind)&&!!column.date);}
  function dayValues(row,month){return Object.fromEntries(M.dates(month).map(date=>{const value=row['d'+date.slice(-2)];return [date,row._kind==='ADJUSTMENT'?M.quantity(value?.shortage??0)+M.quantity(value?.buffer??0):M.quantity(value??0)];}));}
  function adjustmentTotals(row,month){return Object.fromEntries(['shortage','buffer'].map(kind=>[kind,M.dates(month).reduce((sum,date)=>sum+M.quantity(row['d'+date.slice(-2)]?.[kind]??0),0)]));}
  function parseAdjustment(text,current){const parts=String(text).split('|');if(parts.length>2)throw Error('Isi shortage | buffer.');return {shortage:M.quantity(parts[0]),buffer:parts.length===2?M.quantity(parts[1]):current?.buffer??0};}
  function captureProcess(workbook,row){
    if(row._kind==='ADJUSTMENT'){workbook.demandAdjustments||={};workbook.demandAdjustments[row.parentId]||={};for(const kind of ['shortage','buffer']){
      const days=Object.fromEntries(M.dates(workbook.month).map(date=>[date,M.quantity(row['d'+date.slice(-2)]?.[kind]??0)]));
      const original=row.adjustmentContext?.[kind];
      // Editing one half must not freeze the untouched automatic source.
      const changed=M.dates(workbook.month).some(date=>days[date]!==Number(original?.days?.[date]||0));
      if(changed||original?.source==='WORKBOOK'||!original?.verified&&M.dates(workbook.month).some(date=>row['d'+date.slice(-2)]?.[kind]!=null))workbook.demandAdjustments[row.parentId][kind]=days;
    }return;}
    if(row._kind!=='PROCESS')return;
    const days=dayValues(row,workbook.month);
    if(row.allocationKind==='VENDOR_LEAD_TIME'){
      const legacy=workbook.processAllocations?.[row.id]&&!workbook.vendorDispatchAllocations?.[row.id];
      const knownLead=row.vendorLeadTimeMinutes!=null&&Number.isFinite(Number(row.vendorLeadTimeMinutes))&&Number(row.vendorLeadTimeMinutes)>=0;
      if(legacy&&!knownLead&&Object.values(workbook.processAllocations[row.id]).some(qty=>Number(qty)>0))throw Error('Isi lead time vendor terlebih dahulu agar jadwal masuk draft lama dapat dikonversi menjadi jadwal keluar tanpa kehilangan qty.');
      if(workbook.processAllocations?.[row.id]&&!workbook.vendorDispatchAllocations?.[row.id]&&Object.entries(row.vendorDispatchDays||{}).some(([date,qty])=>!date.startsWith(workbook.month+'-')&&Number(qty)>0))throw Error('Alokasi vendor lama memiliki qty keluar di luar periode workbook. Pilih periode yang sesuai atau reset alokasi manual sebelum mengubah qty keluar.');
      workbook.vendorDispatchAllocations ||= {};
      workbook.vendorDispatchAllocations[row.id]=days;
      if(workbook.processAllocations)delete workbook.processAllocations[row.id];
    }else{
      workbook.processAllocations ||= {};
      workbook.processAllocations[row.id]=days;
    }
  }
  function pasteVisible(rows,cols,startRow,startColumn,text){
    const matrix=String(text).replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
    if(startRow<0||startRow+matrix.length>rows.length)throw Error('Rentang melebihi baris terlihat. Tambah FG dahulu jika diperlukan.');
    return matrix.map((values,index)=>{
      const row=M.clone(rows[startRow+index]);
      values.forEach((value,offset)=>{
        const col=cols[startColumn+offset];
        if(!editable(row,col))throw Error('Rentang mencakup kolom hanya baca. Pilih kolom tanggal untuk edit qty; pada vendor hanya qty keluar yang diubah.');
        row[col.field]=row._kind==='ADJUSTMENT'?parseAdjustment(value,row[col.field]):M.parse(value,col);
        if(col.field==='partCode')row.partNumber='';
      });
      return row;
    });
  }
  function exportRows(workbook,snapshot){return rows(workbook,snapshot).flatMap(row=>[row,...row._children]);}
  function exportValue(row,column){
    if(row._kind==='ADJUSTMENT'&&(column.date||column.field==='_total')){const value=row[column.field];return (value?.shortage??'—')+' | '+(value?.buffer??'—');}
    if(row.allocationKind==='VENDOR_LEAD_TIME'&&(column.date||column.field==='_total')){
      const format=value=>value==null?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(value);
      const incoming=row[column.date?'in'+column.date.slice(-2):'_vendorInTotal'];
      return '▼ '+format(incoming)+' | ▲ '+format(row[column.field]);
    }
    return row[column.field]??'';
  }
  return {signature,columns,rows,editable,exportRows,exportValue,dayValues,captureProcess,pasteVisible,vendorLeadLabel,parseAdjustment,adjustmentTotals};
});
