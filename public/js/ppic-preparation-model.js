(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepWorkbook=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  function dates(month){const count=new Date(+month.slice(0,4),+month.slice(5),0).getDate();return Array.from({length:count},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));}
  function quantity(value){
    if(typeof value==='number'){if(Number.isFinite(value)&&value>=0&&value<=1e12)return value;throw Error('Jumlah harus 0 sampai 1 triliun.');}
    let input=String(value??'').trim().replace(/\u00a0/g,'');if(!input)return 0;
    if(input.includes(',')){if(!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(input))throw Error('Format angka tidak valid. Gunakan koma untuk desimal.');input=input.replace(/\./g,'').replace(',','.');}
    else if(/^\d{1,3}(\.\d{3})+$/.test(input))input=input.replace(/\./g,'');
    if(!/^\d+(\.\d+)?$/.test(input))throw Error('Masukkan angka positif; rumus Excel tidak diproses.');
    return quantity(Number(input));
  }
  function columns(sheet,month){
    const common=[{field:'partCode',title:sheet==='material'?'Kode material / part':'Kode part',width:180},{field:'partNumber',title:'Part Number',width:170,readonly:true},{field:'partName',title:'Nama part / material',width:230},{field:'uomCode',title:'Satuan',width:88}];
    if(sheet==='delivery')common.push({field:'customerCode',title:'Customer',width:130});
    if(sheet==='production')common.push({field:'resource',title:'Mesin / pelaksana',width:155},{field:'shift',title:'Shift',width:80},{field:'materialOffsetDays',title:'Offset material (hari)',width:150,numeric:true,integer:true});
    if(sheet==='material')common.push({field:'supplyType',title:'Jenis pasokan',width:170,options:['SUPPLIER_PURCHASE','CUSTOMER_SUPPLIED']},{field:'customerCode',title:'Pemilik customer',width:145},{field:'openingStock',title:'Stok awal simulasi',width:150,numeric:true});
    return [...common,...dates(month).map((date,i)=>({field:'d'+date.slice(-2),date,title:String(i+1).padStart(2,'0'),numeric:true,width:90,weekend:[0,6].includes(new Date(date+'T12:00:00').getDay())})),{field:'_total',title:'Total',width:125,numeric:true,readonly:true}];
  }
  function parse(value,column){if(column.readonly)throw Error(column.field==='partNumber'?'Part Number berasal dari master part.':'Kolom total dihitung otomatis.');if(column.numeric){const n=quantity(value);if(column.integer&&(!Number.isInteger(n)||n>90))throw Error('Offset material harus 0–90 hari bulat.');return n;}const str=String(value??'').trim();if(str.length>180)throw Error('Teks maksimal 180 karakter.');if(column.options&&!column.options.includes(str))throw Error('Jenis pasokan: SUPPLIER_PURCHASE atau CUSTOMER_SUPPLIED.');return column.field==='uomCode'?str.toUpperCase():str;}
  function flatten(rows,month){return rows.map(row=>{const flat={...row};delete flat.days;let total=0;for(const date of dates(month)){const n=Number(row.days?.[date])||0;flat['d'+date.slice(-2)]=n;total+=n;}flat._total=total;return flat;});}
  function inflate(rows,sheet,month){const fields=columns(sheet,month).filter(c=>!c.date&&(!c.readonly||c.field==='partNumber'));return rows.map(flat=>{const row={id:flat.id,days:{}};for(const c of fields)row[c.field]=flat[c.field]??(c.numeric?0:'');for(const date of dates(month)){const n=Number(flat['d'+date.slice(-2)])||0;if(n)row.days[date]=n;}return row;});}
  function blank(sheet,id){return {id,partCode:'',partNumber:'',partName:'',uomCode:'PCS',customerCode:'',resource:'',shift:'1',materialOffsetDays:0,supplyType:'SUPPLIER_PURCHASE',openingStock:0,days:{}};}
  function paste(rows,columns,startRow,startColumn,tsv,newRow){
    const matrix=String(tsv).replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
    if(matrix.length+startRow>2000)throw Error('Maksimal 2.000 baris per sheet.');
    const result=clone(rows);
    matrix.forEach((values,ri)=>{if(startColumn+values.length>columns.length)throw Error('Data melewati kolom terakhir.');while(result.length<=startRow+ri)result.push(newRow());values.forEach((value,ci)=>{const column=columns[startColumn+ci];result[startRow+ri][column.field]=parse(value,column);});});
    return result;
  }
  function totals(rows){const result={};for(const row of rows){const unit=row.uomCode||'—';result[unit]=(result[unit]||0)+Object.values(row.days||{}).reduce((a,n)=>a+(Number(n)||0),0);}return result;}
  function letter(index){let value='';for(index++;index;index=Math.floor((index-1)/26))value=String.fromCharCode(65+(index-1)%26)+value;return value;}
  return {clone,stable,dates,quantity,columns,parse,flatten,inflate,blank,paste,totals,letter};
});
