(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.PrepLabOutlook=api;api.mount(root.document);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EPS=1e-7,valid=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))&&Number(value)>=0;
  const num=value=>valid(value)?Number(value):null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>num(value)===null?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(value));
  const pct=value=>num(value)===null?'—':number(value)+'%';
  const labels={READY:'Siap sebelum delivery',TIGHT:'Siap hari delivery',SHORTAGE:'Shortage',UNKNOWN:'Belum terverifikasi'};
  const basis={delivery:'Qty customer adalah isian Worksheet Schedule. Kebutuhan plan dan coverage mengikuti demandCoverage sistem, termasuk buffer / penyesuaian shortage. Qty tepat waktu = output valid yang tersedia sebelum akhir hari delivery; shortage = kebutuhan plan yang belum tertutup tepat waktu. Waktu siap memakai hasil urutan proses dan stok usable yang sama dengan tab 02. Angka tidak dihitung ulang dari total semua child.',kpi:'Coverage dihitung per satuan dari qty tepat waktu ÷ kebutuhan plan (termasuk buffer / penyesuaian shortage). Satuan tidak digabung. Loading ratio = total beban jam ÷ total kapasitas efektif jam dari baris mesin/tanggal dengan angka terverifikasi; tiap mesin dihitung satu kali per tanggal, termasuk hari idle. Sumber yang gagal atau belum tersedia ditampilkan sebagai —. Semua angka adalah simulasi draft, bukan KPI aktual.'};
  const columns=[['date','Tanggal delivery'],['customerCode','Customer'],['partCode','Part Code'],['partNumber','Part Number'],['partName','Nama FG'],['uomCode','Satuan'],['customerQty','Qty customer','number'],['quantity','Kebutuhan plan','number'],['onTimeQty','Qty tepat waktu','number'],['shortageQty','Shortage','number'],['readyAt','Siap FG'],['status','Kondisi plan']];
  function deliveryRows(snapshot){
    if(!Array.isArray(snapshot?.rows))return null;
    return snapshot.rows.flatMap(parent=>Object.entries(parent.days||{}).filter(([,qty])=>num(qty)>0).map(([date,qty])=>{
      const coverage=parent.demandCoverage?.[date],verified=coverage&&[coverage.quantity,coverage.onTimeQty,coverage.shortageQty].every(valid);
      return {id:JSON.stringify([parent.id,date]),sourceRowId:parent.id,date,customerCode:parent.customerCode||'',partCode:parent.partCode||'',partNumber:parent.partNumber||'',partName:parent.partName||'',uomCode:parent.uomCode||'',customerQty:Number(qty),quantity:verified?Number(coverage.quantity):null,onTimeQty:verified?Number(coverage.onTimeQty):null,shortageQty:verified?Number(coverage.shortageQty):null,readyAt:verified?(coverage.stockOnly?'Stok usable':coverage.readyAt||null):null,status:verified&&Object.hasOwn(labels,coverage.status)?coverage.status:'UNKNOWN',verified,lotCount:(parent.deliveryLots||[]).filter(lot=>lot.demandDate===date).length};
    })).sort((a,b)=>a.date.localeCompare(b.date)||a.customerCode.localeCompare(b.customerCode)||a.partCode.localeCompare(b.partCode));
  }
  function metrics(snapshot){
    const delivery=deliveryRows(snapshot),groups=new Map();
    for(const row of delivery||[]){
      // Unknown units are kept per source row; they cannot be aggregated safely.
      const key=row.uomCode||'unknown:'+row.sourceRowId;
      if(!groups.has(key))groups.set(key,{unit:row.uomCode||'Belum ada satuan · '+row.partCode,rows:0,unknown:0,customerQty:0,quantity:0,onTimeQty:0,shortageQty:0});
      const group=groups.get(key);group.rows++;group.customerQty+=row.customerQty;
      if(!row.verified){group.unknown++;continue;}
      group.quantity+=row.quantity;group.onTimeQty+=row.onTimeQty;group.shortageQty+=row.shortageQty;
    }
    for(const group of groups.values()){
      group.coveragePct=!group.unknown&&group.quantity>0?group.onTimeQty/group.quantity*100:null;
      if(group.unknown)for(const key of ['quantity','onTimeQty','shortageQty'])group[key]=null;
    }
    const capacity=snapshot?.derived?.capacity,capacityRows=!capacity?.sourceError&&capacity?.status!=='ERROR'&&Array.isArray(capacity?.rows)?capacity.rows:null;
    const known=capacityRows?.filter(row=>valid(row.loadHours)&&valid(row.availableHours))||[];
    const loadHours=known.length?known.reduce((sum,row)=>sum+Number(row.loadHours),0):null;
    const availableHours=known.length?known.reduce((sum,row)=>sum+Number(row.availableHours),0):null;
    const daily=snapshot?.derived?.daily,purchase=snapshot?.derived?.purchase,vendor=snapshot?.derived?.vendor;
    const sourceRows=(source,key)=>!source?.sourceError&&source?.status!=='ERROR'&&Array.isArray(source?.[key])?source[key]:null;
    const dailyJobs=sourceRows(daily,'jobs'),unscheduled=sourceRows(daily,'unscheduled'),purchaseRows=sourceRows(purchase,'rows')?.filter(row=>row.status!=='SKIPPED')??null,vendorRows=sourceRows(vendor,'rows');
    return {delivery,units:[...groups.values()],loading:{loadHours,availableHours,ratio:availableHours>0?loadHours/availableHours*100:null,known:known.length,total:capacityRows?.length??null,unknown:capacityRows?capacityRows.length-known.length:null,over:capacityRows?.filter(row=>row.status==='OVER_CAPACITY').length??null},dailyJobs:dailyJobs?.length??null,unscheduled:unscheduled?.length??null,purchaseRows:purchaseRows?.length??null,purchaseIncomplete:purchaseRows?.filter(row=>row.status==='INCOMPLETE'||!row.needDate||row.unscheduled).length??null,vendorRows:vendorRows?.length??null,vendorValid:vendorRows?.filter(row=>row.valid===true).length??null};
  }
  function head(){return '<tr>'+columns.map(([,label],i)=>'<th scope="col"><span class="prep-col-letter" aria-hidden="true">'+String.fromCharCode(65+i)+'</span><span class="prep-col-name">'+escape(label)+'</span></th>').join('')+'</tr>';}
  function tableRows(rows){return rows.map(row=>'<tr>'+columns.map(([key,,type])=>{
    if(type==='number')return '<td class="prep-derived-number">'+number(row[key])+'</td>';
    if(key==='status')return '<td><span class="prep-outlook-status '+row.status+'">'+escape(labels[row.status])+'</span></td>';
    let value=row[key];if(key==='readyAt'&&value&&value!=='Stok usable')value=String(value).replace('T',' ').slice(0,16);
    return '<td title="'+escape(value||'—')+'"><span class="prep-derived-cell">'+escape(value||'—')+(key==='partCode'?(globalThis.PpicConfirmationFeedback?.marker(row,state.feedback,'delivery')||''):'')+'</span></td>';
  }).join('')+'</tr>').join('');}
  function kpiHtml(data){
    const card=(name,value,note)=>'<article><span>'+escape(name)+'</span><strong>'+escape(value)+'</strong><small>'+escape(note)+'</small></article>';
    const table=(headers,rows)=>'<div class="prep-kpi-table-wrap"><table class="prep-kpi-table" data-enterprise-table="off"><thead><tr>'+headers.map(h=>'<th scope="col">'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
    const cards=card('Loading ratio simulasi',pct(data.loading.ratio),number(data.loading.known)+' / '+number(data.loading.total)+' mesin/tanggal terverifikasi')+card('Blok produksi terjadwal',number(data.dailyJobs),number(data.unscheduled)+' baris belum terjadwal')+card('Kebutuhan purchase',number(data.purchaseRows),number(data.purchaseIncomplete)+' baris perlu dilengkapi')+card('Pergerakan vendor valid',number(data.vendorValid)+' / '+number(data.vendorRows),'Validasi jadwal dan identitas vendor');
    const unitRows=data.units.map(row=>'<tr><th scope="row">'+escape(row.unit)+'</th><td class="prep-derived-number">'+number(row.customerQty)+'</td><td class="prep-derived-number">'+number(row.quantity)+'</td><td class="prep-derived-number">'+number(row.onTimeQty)+'</td><td class="prep-derived-number">'+number(row.shortageQty)+'</td><td class="prep-derived-number">'+pct(row.coveragePct)+'</td><td>'+escape(row.unknown?row.unknown+' / '+row.rows+' baris belum terverifikasi':row.rows+' baris terverifikasi')+'</td></tr>').join('')||'<tr><td colspan="7">Belum ada qty delivery pada bulan ini.</td></tr>';
    const hours='<tr><td class="prep-derived-number">'+number(data.loading.loadHours)+'</td><td class="prep-derived-number">'+number(data.loading.availableHours)+'</td><td class="prep-derived-number">'+number(data.loading.over)+'</td><td class="prep-derived-number">'+number(data.loading.unknown)+'</td></tr>';
    return '<div class="prep-kpi-cards">'+cards+'</div><h3 class="prep-kpi-caption">Coverage delivery per satuan</h3>'+table(['Satuan','Qty customer','Kebutuhan plan','Qty tepat waktu','Shortage','Coverage','Cakupan'],unitRows)+'<h3 class="prep-kpi-caption">Kapasitas mesin pada periode aktif</h3>'+table(['Beban terverifikasi (jam)','Kapasitas terverifikasi (jam)','Mesin/tanggal over capacity','Mesin/tanggal belum terverifikasi'],hours)+'<p class="prep-kpi-limit">Coverage plan mencakup buffer dan penyesuaian shortage. Angka dengan sumber belum lengkap ditandai —. Baris tanpa jam terverifikasi dikecualikan dari loading ratio; lihat Detail Capacity Production untuk rinciannya.</p>';
  }
  let doc=null,state={},page=1;
  const $=id=>doc?.getElementById(id);
  function render(){
    if(!$('prep-delivery-panel')||!$('prep-kpi-panel'))return;
    const sourceMonth=state.snapshot?.month||state.snapshot?.derived?.month,monthMatches=!sourceMonth||sourceMonth===state.month;
    const data=!state.loading&&!state.error&&monthMatches?metrics(state.snapshot):null,available=!!data?.delivery;
    const message=state.error?'Hasil belum tersedia: '+state.error:state.loading?'Menghitung ulang dari perubahan draft…':!available?'Buka Worksheet Schedule untuk memuat sumber.':state.locked?'Snapshot PPIC Released · hanya baca':state.dirty?'Otomatis · termasuk perubahan belum disimpan':'Otomatis dari Worksheet Schedule';
    for(const view of ['delivery','kpi']){
      $('prep-'+view+'-panel').setAttribute('aria-busy',String(!!state.loading));
      $('prep-'+view+'-scenario').textContent=[state.month,state.name,state.locked?'LOCKED':state.dirty?'Draft belum disimpan':'Draft aktif'].filter(Boolean).join(' · ');
      $('prep-'+view+'-status').textContent=message;$('prep-'+view+'-basis').textContent=available?basis[view]:'';
    }
    const term=$('prep-delivery-search').value.trim().toLowerCase(),condition=$('prep-delivery-condition').value;
    const rows=available?data.delivery.filter(row=>(!condition||row.status===condition)&&(!term||[row.date,row.customerCode,row.partCode,row.partNumber,row.partName,labels[row.status]].join(' ').toLowerCase().includes(term))):[];
    const maxPage=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,maxPage);
    $('prep-delivery-head').innerHTML=head();
    $('prep-delivery-body').innerHTML=available&&rows.length?tableRows(rows.slice((page-1)*50,page*50)):'<tr><td colspan="'+columns.length+'" class="prep-derived-empty">'+escape(available?'Tidak ada delivery sesuai jadwal / filter.':message)+'</td></tr>';
    $('prep-delivery-count').textContent=available?rows.length+' baris · halaman '+page+' / '+maxPage:'';
    $('prep-delivery-prev').disabled=!available||page<=1;$('prep-delivery-next').disabled=!available||page>=maxPage;
    $('prep-delivery-search').disabled=!available;$('prep-delivery-condition').disabled=!available;
    $('prep-kpi-content').innerHTML=available?kpiHtml(data):'<p class="prep-derived-empty">'+escape(message)+'</p>';
  }
  function update(next){if(state.month!==next.month)page=1;state=next;render();}
  function mount(document){
    doc=document;if(!$('prep-delivery-search'))return;
    for(const id of ['prep-delivery-search','prep-delivery-condition'])$(id).addEventListener(id.endsWith('search')?'input':'change',()=>{page=1;render();});
    for(const [action,direction] of [['prev',-1],['next',1]])$('prep-delivery-'+action).addEventListener('click',()=>{page+=direction;render();});
    for(const view of ['delivery','kpi'])$('prep-'+view+'-back').addEventListener('click',()=>$('prep-page-workbook').click());
    render();
  }
  return {deliveryRows,metrics,tableRows,head,kpiHtml,mount,update,basis};
});
