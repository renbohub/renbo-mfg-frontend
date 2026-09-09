(async function(){
  const id=JSON.parse(document.getElementById('policy-config').textContent).stockBalanceId;
  const token=localStorage.getItem('token')||sessionStorage.getItem('token');
  if(!token){location.replace('/login?next='+encodeURIComponent(location.pathname));return;}
  const $=id=>document.getElementById(id);
  const show=text=>{const box=$('policy-message');box.hidden=false;box.textContent=text;box.className='portal-card';};
  const url='/inventory-policy/api/'+encodeURIComponent(id);
  async function api(options={}){const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||'Permintaan gagal.');return result.item||result.data||result;}
  function display(row){$('policy-item').textContent=[row.materialCode||row.partCode||row.productId,row.materialName||row.partName||row.description].filter(Boolean).join(' · ');$('policy-identity').textContent=`Warehouse ${row.warehouseCode} · Rack ${row.rackCode||'-'} · Lot ${row.lotNumber||'-'} · UOM ${row.uomCode||'-'}`;$('policy-quantities').textContent=`On hand: ${row.qtyOnHand} | Reserved: ${row.qtyReserved} | QC: ${row.qtyQC} | Available: ${row.qtyAvailable}`;$('policy-min').value=row.minStock??0;$('policy-max').value=row.maxStock??'';$('policy-reorder').value=row.reorderPoint??'';}
  $('policy-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{const body={minStock:Number($('policy-min').value),maxStock:$('policy-max').value===''?null:Number($('policy-max').value),reorderPoint:$('policy-reorder').value===''?null:Number($('policy-reorder').value)};display(await api({method:'PATCH',body:JSON.stringify(body)}));show('Pengaturan batas stok tersimpan. Saldo quantity tetap.');}catch(error){show(error.message);}finally{button.disabled=false;}};
  try{display(await api());}catch(error){show(error.message);$('policy-form').querySelector('button').disabled=true;}
})();
