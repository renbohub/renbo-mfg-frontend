(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PpicCalendar=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function dateKey(value){if(!value)return null;const d=value instanceof Date?value:new Date(String(value).slice(0,10)+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return null;const key=d.toISOString().slice(0,10);return value instanceof Date||key===String(value).slice(0,10)?key:null;}
  function columns(month,{weekly=false,horizon=0,dates=[]}={}){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
    const [year,m]=month.split('-').map(Number),start=new Date(Date.UTC(year,m-1-horizon,1)),end=new Date(Date.UTC(year,m+horizon,0));
    for(const raw of dates){const key=dateKey(raw);if(key){const d=new Date(key+'T00:00:00Z');if(d<start)start.setTime(d.getTime());if(d>end)end.setTime(d.getTime());}}
    const map=new Map();for(const d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){const key=dateKey(d),bucket=new Date(d);if(weekly)bucket.setUTCDate(bucket.getUTCDate()-(bucket.getUTCDay()+6)%7);const id=dateKey(bucket);if(!map.has(id))map.set(id,{key:id,days:[]});map.get(id).days.push(key);}
    return [...map.values()].map(column=>{const end=new Date(column.key+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+(weekly?6:0));return {...column,groupMonth:column.days[0].slice(0,7),end:dateKey(end),label:weekly?`${column.key.slice(5)}–${dateKey(end).slice(5)}`:column.key.slice(5)};});
  }
  function deliveryRows(inputs,month){return inputs.flatMap(row=>(row.effectiveDeliverySplits?.length?row.effectiveDeliverySplits:[{targetDate:row.effectiveTargetDate||row.targetDate,qty:row.demandQty,sourceNumber:row.sourceNumber}]).map(split=>({...row,...split,date:dateKey(split.targetDate),unit:String(row.uomCode||'PCS').toUpperCase(),customerCode:row.customerCode||'—'}))).filter(row=>row.date?.startsWith(month)&&Number(row.qty)>0);}
  function totalsByUnit(rows,value=row=>row.qty){const totals={};for(const row of rows){const unit=String(row.unit||row.uomCode||'—').toUpperCase();totals[unit]=(totals[unit]||0)+(Number(value(row))||0);}return totals;}
  function headingGroups(cols,weekly=false){const groups=[];for(const column of cols){const date=new Date(column.key+'T00:00:00Z');if(!weekly)date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);const key=weekly?(column.groupMonth||column.key.slice(0,7)):dateKey(date);let group=groups.at(-1);if(!group||group.key!==key){const end=new Date(date);end.setUTCDate(end.getUTCDate()+6);group={key,label:weekly?key:`${key.slice(5)}–${dateKey(end).slice(5)}`,span:0};groups.push(group);}group.span++;}return groups;}
  return {dateKey,columns,headingGroups,deliveryRows,totalsByUnit};
}));
