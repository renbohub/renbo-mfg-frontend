(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ppic-preparation-model'):root.PrepWorkbook);if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepCapacityEdit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const COIL_SECONDS=1800,DIE_SECONDS=3600;
  const format=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(n);
  const integer=value=>{const n=M.quantity(value);if(!Number.isInteger(n)||n>1000)throw Error('Jumlah pergantian harus bilangan bulat 0–1.000.');return n;};
  function apply(workbook,snapshot,change){
    if(!M.dates(workbook.month).includes(change.date))throw Error('Tanggal di luar periode draft.');
    const capacity=snapshot?.derived?.capacity;if(!capacity)throw Error('Perbarui kapasitas sebelum mengedit.');
    if(change.kind==='machine'){
      const row=capacity.rows.find(row=>row.machineId===change.id&&row.date===change.date);
      if(!row)throw Error('Mesin tidak ditemukan dalam hasil terbaru.');
      if(change.reset){if(workbook.machineDayOverrides?.[change.id])delete workbook.machineDayOverrides[change.id][change.date];return;}
      const options={overlap:!!change.overlap};
      const choice=change.dayStatus||'MASTER';
      if(!['MASTER','WORKING','HOLIDAY'].includes(choice))throw Error('Pilih status hari yang valid.');
      if(change.dayStatus!==undefined)options.dayStatus=choice;
      const closed=choice==='HOLIDAY'||choice==='MASTER'&&row.defaultIsHoliday===true;
      if(choice==='WORKING'&&!row.shifts?.length)throw Error('Belum ada template shift aktif untuk hari ini. Atur jam saat masuk di Master Working Hours terlebih dahulu.');
      for(const shift of [1,2]){
        const on=!!change['overtimeShift'+shift],hours=M.quantity(change['overtimeHoursShift'+shift]);
        if(hours>24||(!closed&&on&&hours<=0))throw Error('Isi jam lembur lebih dari 0 sampai 24 jam untuk shift yang dipilih.');
        if(!closed&&on&&!row.shifts?.some(item=>item.sequence===shift))throw Error('Shift '+shift+' tidak tersedia pada tanggal ini.');
        options['overtimeShift'+shift]=on;options['overtimeHoursShift'+shift]=hours;
      }
      workbook.machineDayOverrides||={};workbook.machineDayOverrides[change.id]||={};
      if(change.reset)delete workbook.machineDayOverrides[change.id][change.date];
      else workbook.machineDayOverrides[change.id][change.date]=options;
    }else if(change.kind==='quantity'){
      const row=capacity.machineChildren.find(row=>row.sourceRowId===change.id);
      if(!row)throw Error('Child part tidak ditemukan dalam hasil terbaru.');
      const quantity=M.quantity(change.quantity),coilChanges=integer(change.coilChanges),dieChanges=integer(change.dieChanges);
      if(['PCS','PC','EA','UNIT','SET'].includes(String(row.uomCode).toUpperCase())&&!Number.isInteger(quantity))throw Error('Qty '+row.uomCode+' harus bilangan bulat.');
      workbook.processAllocations||={};workbook.processSetupCounts||={};
      // Match tab 02: editing a cell keeps the other displayed dates on this row.
      workbook.processAllocations[change.id]={...Object.fromEntries(M.dates(workbook.month).map(date=>[date,row.days?.[date]?.quantity||0])),[change.date]:quantity};
      workbook.processSetupCounts[change.id]||={};
      workbook.processSetupCounts[change.id][change.date]={coilChanges,dieChanges};
    }else throw Error('Jenis perubahan kapasitas tidak dikenali.');
  }
  const known=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const minutes=value=>known(value)?format(Number(value))+' menit':'— menit';
  function mount(doc,commit,previewMachine){
    const dialog=doc.getElementById('prep-capacity-dialog');if(!dialog)return null;
    const $=key=>doc.getElementById('prep-capacity-edit-'+key);let selection=null,submitting=false,opener=null,autoSetupPreview=false,previewRequest=0,previewTimer=null,openingOptions='';
    function invalidatePreview(){clearTimeout(previewTimer);previewTimer=null;previewRequest++;}
    function close(){if(submitting)return;invalidatePreview();dialog.close();opener?.focus({preventScroll:true});}
    $('cancel').addEventListener('click',close);$('close').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();else invalidatePreview();});
    function preview(){
      if(!selection||selection.kind!=='quantity')return;
      try{const qty=M.quantity($('quantity').value),coil=integer($('coil').value),dies=integer($('dies').value),ct=selection.row.cycleTimeSeconds;
        const production=ct>0?qty*ct/60:null,coilTime=coil*COIL_SECONDS/60,dieTime=dies*DIE_SECONDS/60;
        $('preview').textContent=minutes(production)+' + '+minutes(coilTime)+' + '+minutes(dieTime)+' = '+minutes(production===null?null:production+coilTime+dieTime);
      }catch(_){$('preview').textContent='— menit + — menit + — menit = — menit';}
    }
    $('quantity').addEventListener('input',()=>{if(autoSetupPreview&&selection?.kind==='quantity'){try{const qty=M.quantity($('quantity').value);$('dies').value=qty>0?1:0;if(selection.row.coilSetupApplicable===false)$('coil').value=0;else if(selection.row.grossWeightKg>0)$('coil').value=qty>0?Math.ceil(qty*selection.row.grossWeightKg/200-1e-9):0;}catch(_){}}preview();});
    for(const key of ['coil','dies'])$(key).addEventListener('input',()=>{autoSetupPreview=false;preview();});
    function dayState(){
      if(selection?.kind!=='machine')return;
      const row=selection.row,choice=$('dayStatus').value,closed=choice==='HOLIDAY'||choice==='MASTER'&&row.defaultIsHoliday===true;
      for(const shift of [1,2]){const missing=!row.shifts?.some(s=>s.sequence===shift);$('overtimeShift'+shift).disabled=closed||missing;$('overtimeHoursShift'+shift).disabled=closed||missing;}
      $('overlap').disabled=closed;
      $('day-info').textContent='Default master: '+(row.defaultIsHoliday?'Libur':'Masuk')+'. '+(closed?'Hari ini libur: kapasitas 0 jam.':'Hari ini masuk: memakai template jam pada master.')+' Berlaku untuk mesin dan tanggal ini.';
    }
    function machineChange(){
      const change={kind:'machine',id:selection.id,date:selection.date,dayStatus:$('dayStatus').value};
      for(const key of ['overtimeShift1','overtimeShift2','overlap','overtimeHoursShift1','overtimeHoursShift2'])change[key]=key.startsWith('overtimeHours')?$(key).value:$(key).checked;
      return change;
    }
    function machineMetrics(available){
      const row=selection.row,base=known(row.availableHours)?Number(row.availableHours)*60:null,used=known(row.loadHours)?Number(row.loadHours)*60:null;
      $('available').textContent=minutes(available);$('used').textContent=minutes(used);
      $('additional').textContent=minutes(available===null||base===null?null:available-base);
      $('remaining').textContent=minutes(available===null||used===null?null:available-used);
    }
    function queueMachinePreview(){
      if(selection?.kind!=='machine')return;
      invalidatePreview();dayState();const request=previewRequest,change=machineChange(),row=selection.row;
      $('machine-summary').title='';
      if(JSON.stringify(change)===openingOptions){machineMetrics(known(row.availableHours)?Number(row.availableHours)*60:null);return;}
      if(change.dayStatus==='HOLIDAY'||change.dayStatus==='MASTER'&&row.defaultIsHoliday===true){machineMetrics(0);return;}
      machineMetrics(null);
      if(!previewMachine)return;
      previewTimer=setTimeout(async()=>{
        try{const result=await previewMachine(change);if(request!==previewRequest)return;machineMetrics(known(result?.availableHours)?Number(result.availableHours)*60:null);}
        catch(error){if(request!==previewRequest)return;machineMetrics(null);$('machine-summary').title=error.message;}
      },250);
    }
    $('dayStatus').addEventListener('change',queueMachinePreview);
    for(const key of ['overtimeShift1','overtimeShift2','overlap'])$(key).addEventListener('change',queueMachinePreview);
    for(const key of ['overtimeHoursShift1','overtimeHoursShift2'])$(key).addEventListener('input',queueMachinePreview);
    async function submit(reset=false){
      if(submitting||!selection)return;
      const change={kind:selection.kind,id:selection.id,date:selection.date,reset};
      if(change.kind==='machine')change.dayStatus=$('dayStatus').value;
      if(change.kind==='machine')for(const key of ['overtimeShift1','overtimeShift2','overlap','overtimeHoursShift1','overtimeHoursShift2'])change[key]=key.startsWith('overtimeHours')?$(key).value:$(key).checked;
      else Object.assign(change,{quantity:$('quantity').value,coilChanges:$('coil').value,dieChanges:$('dies').value});
      submitting=true;$('apply').disabled=true;$('reset').disabled=true;$('error').textContent='';
      try{await commit(change);submitting=false;close();}catch(error){$('error').textContent=error.message;}finally{submitting=false;$('apply').disabled=false;$('reset').disabled=false;}
    }
    $('form').addEventListener('submit',event=>{event.preventDefault();submit();});$('reset').addEventListener('click',()=>submit(true));
    return {open(detail){
      invalidatePreview();selection=detail;autoSetupPreview=detail.row.days?.[detail.date]?.setupSource==='AUTO';opener=detail.opener||doc.activeElement;$('error').textContent='';
      const machine=detail.kind==='machine',row=detail.row;
      $('title').textContent=machine?'Jam kerja mesin':'Qty & pergantian coil/dies';
      $('context').textContent=[row.machineCode,detail.date,...(machine?[]:[row.partCode,row.partNumber,row.processCode])].filter(Boolean).join(' · ');
      $('machine').hidden=!machine;$('child').hidden=machine;$('reset').hidden=!machine;
      for(const key of ['quantity','coil','dies'])$(key).disabled=machine;
      if(machine){
        const options=row.options||{};
        $('dayStatus').value=options.dayStatus||'MASTER';
        for(const shift of [1,2]){const master=row.shifts?.find(item=>item.sequence===shift),toggle=$('overtimeShift'+shift);toggle.checked=!!options['overtimeShift'+shift];toggle.disabled=!master;
          $('overtimeHoursShift'+shift).value=String(options['overtimeHoursShift'+shift]??(master?.overtimeMinutes||0)/60).replace('.',',');
          $('shift'+shift+'-info').textContent=master?master.startTime+'–'+master.endTime+' · istirahat '+master.breakMinutes+' menit':'Tidak ada shift pada master tanggal ini';}
        $('overlap').checked=!!options.overlap;
        dayState();openingOptions=JSON.stringify(machineChange());$('machine-summary').title='';machineMetrics(known(row.availableHours)?Number(row.availableHours)*60:null);
      }else{const day=row.days?.[detail.date]||{};$('quantity').value=String(day.quantity??0).replace('.',',');$('coil').value=day.coilChanges||0;$('dies').value=day.dieChanges||0;$('ct').textContent=(row.cycleTimeSeconds>0?format(row.cycleTimeSeconds):'—')+' detik/'+row.uomCode+' · '+(row.coilSetupApplicable===false?'GW tidak diperlukan · coil otomatis 0':(row.grossWeightKg>0?format(row.grossWeightKg)+' kg/unit':'GW material RAW belum tersedia'));preview();}
      dialog.showModal();(machine?$('dayStatus'):$('quantity')).focus();
    }};
  }
  return {apply,mount,COIL_SECONDS,DIE_SECONDS};
});
