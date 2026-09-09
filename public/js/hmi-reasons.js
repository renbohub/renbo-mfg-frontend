(function () {
  "use strict";
  const root=document.querySelector("[data-hmi-master]"); if(!root)return;
  const kind=root.dataset.kind, slug=root.dataset.slug, $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const token=()=>localStorage.getItem("token")||sessionStorage.getItem("token")||"";
  const state={rows:[],areas:[],selected:null,child:null,page:1,childPage:1,children:[],request:0,childRequest:0,busy:false};
  const can=action=>window.ERP_PERMISSIONS?.has?.("master-data",slug,action,"hmiReasonMasters")!==false;
  function message(text,type="danger"){$("hmi-alert").textContent=text;$("hmi-alert").className=`alert alert-${type}`;}
  async function api(path,options={}){
    const response=await fetch(`/master-data/hmi-api/${path}`,{...options,headers:{Authorization:`Bearer ${token()}`,"x-page-module":"master-data","x-page-code":slug,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.message||`Permintaan gagal (${response.status}).`);return body;
  }
  const status=r=>`<span class="hmi-status ${r.isActive&&!r.isDeleted?"":"off"}">${r.isDeleted?"Arsip":r.isActive?"Aktif":"Nonaktif"}</span>`;
  const areaName=id=>{const a=state.areas.find(a=>a.id===Number(id));return a?`${a.areaCode} · ${a.description}`:`Area #${id}`;};
  function drawList(){
    $("hmi-list").innerHTML=state.rows.length?state.rows.map(r=>`<button type="button" class="hmi-list-item" data-select="${r.id}" aria-pressed="${state.selected?.id===r.id}"><span><strong>${esc(r.description)}</strong><small>${esc(kind==="areas"?r.areaCode:areaName(r.parentId))} · Urutan ${r.sortOrder} · #${r.id}</small></span>${status(r)}</button>`).join(""): '<div class="hmi-empty"><p>Belum ada data yang sesuai filter.</p></div>';
  }
  async function loadAreas(){
    if(kind==="areas")return;
    let page=1,rows=[],total;
    do{const data=await api(`areas?isDeleted=all&limit=500&page=${page++}`);rows.push(...data.items);total=data.total;}while(rows.length<total);
    state.areas=rows;
    const previous=$("hmi-area-filter").value;
    $("hmi-area-filter").innerHTML='<option value="">Semua area</option>'+rows.map(a=>`<option value="${a.id}">${esc(a.areaCode)} · ${esc(a.description)}${!a.isActive||a.isDeleted?" (nonaktif)":""}</option>`).join("");
    $("hmi-area-filter").value=previous;
    if(!rows.some(a=>a.isActive&&!a.isDeleted))message("Belum ada area aktif. Buka Area HMI dan tambahkan area yang digunakan mesin terlebih dahulu.","info");
  }
  async function load(){
    const request=++state.request;const params=new URLSearchParams({page:state.page,limit:50,q:$("hmi-search").value,isDeleted:$("hmi-archive-filter").value});
    if(kind!=="areas"&&$("hmi-area-filter").value)params.set("parentId",$("hmi-area-filter").value);
    const data=await api(`${kind}?${params}`);if(request!==state.request)return;
    if(state.page>1&&!data.items.length){state.page--;return load();}
    state.rows=data.items;drawList();$("hmi-count").textContent=`${data.total} data`;$("hmi-page").textContent=`Halaman ${state.page}`;
    $("hmi-prev").disabled=state.page<=1;$("hmi-next").disabled=state.page*50>=data.total;
    $("hmi-new").hidden=!can("create");
  }
  function edit(row=null){
    state.selected=row;state.child=null;state.childPage=1;state.childRequest++;
    $("hmi-detail-empty").hidden=true;$("hmi-detail").hidden=false;$("hmi-detail-title").textContent=row?"Edit data":`Tambah ${kind==="areas"?"area":"reason"}`;
    $("hmi-detail-id").textContent=row?`ID ${row.id}`:"ID dibuat otomatis";
    $("hmi-description").value=row?.description||"";$("hmi-sort").value=row?.sortOrder??0;$("hmi-notes").value=row?.notes||"";$("hmi-active").checked=row?.isActive??true;
    if(kind==="areas"){$("hmi-code").value=row?.areaCode||"";$("hmi-code").readOnly=!!row;}
    else{
      const areas=state.areas.filter(a=>(a.isActive&&!a.isDeleted)||a.id===row?.parentId);
      $("hmi-parent").innerHTML='<option value="">Pilih area</option>'+areas.map(a=>`<option value="${a.id}">${esc(a.areaCode)} · ${esc(a.description)}</option>`).join("");
      $("hmi-parent").value=row?.parentId||$("hmi-area-filter").value||"";$("hmi-parent").disabled=!!row;
      $("hmi-child-form").hidden=true;$("hmi-child-archive-filter").checked=false;$("hmi-children").hidden=!row;
      if(row)loadChildren().catch(e=>message(e.message));
    }
    if(kind==="downtime"){$("hmi-stop-class").value=row?.stopClass||"UNPLANNED";$("hmi-loss").checked=row?.countsAsLoss??true;}
    const writable=!row?.isDeleted&&can(row?"update":"create");
    for(const el of $("hmi-form").querySelectorAll("input,textarea,select"))el.disabled=!writable||(el.id==="hmi-parent"&&!!row);
    $("hmi-save").hidden=!writable;$("hmi-archive").hidden=!row||row.isDeleted||!can("delete");$("hmi-restore").hidden=!row?.isDeleted||!can("update");
    $("hmi-edit-hint").textContent=row?.isDeleted?"Pulihkan data terlebih dahulu. Data yang dipulihkan berstatus nonaktif hingga diaktifkan kembali.":"Data nonaktif tidak muncul pada pilihan baru; histori produksi tetap tersimpan.";
    drawList();
  }
  async function loadChildren(){
    const parent=state.selected;if(!parent)return;const request=++state.childRequest;
    const data=await api(`${kind}-sub?parentId=${parent.id}&limit=50&page=${state.childPage}&isDeleted=${$("hmi-child-archive-filter").checked}`);
    if(request!==state.childRequest||state.selected?.id!==parent.id)return;
    if(state.childPage>1&&!data.items.length){state.childPage--;return loadChildren();}
    state.children=data.items;$("hmi-child-count").textContent=`${data.total} subreason`;
    $("hmi-child-new").hidden=parent.isDeleted||!parent.isActive||!can("create");
    $("hmi-child-list").innerHTML=data.items.length?data.items.map(r=>`<div class="hmi-child-row"><div><strong>${esc(r.description)}</strong><small>#${r.id} · Urutan ${r.sortOrder} · ${r.isDeleted?"Arsip":r.isActive?"Aktif":"Nonaktif"}</small></div><div class="hmi-child-actions">${!r.isDeleted&&can("update")?`<button class="btn btn-sm btn-outline-primary" type="button" data-child-edit="${r.id}">Edit</button>`:""}${r.isDeleted&&can("update")?`<button class="btn btn-sm btn-outline-secondary" type="button" data-child-restore="${r.id}">Pulihkan</button>`:!r.isDeleted&&can("delete")?`<button class="btn btn-sm btn-outline-secondary" type="button" data-child-archive="${r.id}">Arsipkan</button>`:""}</div></div>`).join(""):'<div class="hmi-empty"><p>Belum ada subreason.</p></div>';
    $("hmi-child-page").textContent=`Halaman ${state.childPage}`;$("hmi-child-prev").disabled=state.childPage<=1;$("hmi-child-next").disabled=state.childPage*50>=data.total;
  }
  function editChild(row=null){state.child=row;$("hmi-child-form").hidden=false;$("hmi-child-title").textContent=row?`Edit subreason #${row.id}`:"Tambah subreason";$("hmi-child-description").value=row?.description||"";$("hmi-child-sort").value=row?.sortOrder??0;$("hmi-child-active").checked=row?.isActive??true;$("hmi-child-description").focus();}
  async function mutate(fn){if(state.busy)return;state.busy=true;root.setAttribute("aria-busy","true");for(const b of root.querySelectorAll('button[type="submit"]'))b.disabled=true;try{await fn();}catch(e){message(e.message);}finally{state.busy=false;root.removeAttribute("aria-busy");for(const b of root.querySelectorAll('button[type="submit"]'))b.disabled=false;}}
  $("hmi-form").addEventListener("submit",e=>{e.preventDefault();mutate(async()=>{
    const before=state.selected;const body={description:$("hmi-description").value,sortOrder:Number($("hmi-sort").value),isActive:$("hmi-active").checked,notes:$("hmi-notes").value,...(before?{expectedUpdatedAt:before.updatedAt}:{})};
    if(kind==="areas")body.areaCode=$("hmi-code").value;else body.parentId=Number($("hmi-parent").value);
    if(kind==="downtime"){body.stopClass=$("hmi-stop-class").value;body.countsAsLoss=$("hmi-loss").checked;}
    const saved=await api(`${kind}${before?`/${before.id}`:""}`,{method:before?"PATCH":"POST",body:JSON.stringify(body)});
    await load();edit(saved);message("Master tersimpan. Pilihan operator mengikuti data aktif ini.","success");
  });});
  $("hmi-list").addEventListener("click",e=>{const button=e.target.closest("[data-select]");if(button&&!state.busy)edit(state.rows.find(r=>r.id===Number(button.dataset.select)));});
  $("hmi-new").addEventListener("click",()=>{if(!state.busy)edit();});
  for(const action of ["archive","restore"])$("hmi-"+action).addEventListener("click",()=>mutate(async()=>{const selected=state.selected;if(!selected)return;const saved=await api(`${kind}/${selected.id}/${action}`,{method:"POST"});await load();edit(saved);message(action==="archive"?"Data diarsipkan. Histori tetap tersimpan.":"Data dipulihkan dalam status nonaktif.","success");}));
  let timer;$("hmi-search").addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;load().catch(e=>message(e.message));},250);});
  for(const id of ["hmi-area-filter","hmi-archive-filter"])$(id)?.addEventListener("change",()=>{state.page=1;load().catch(e=>message(e.message));});
  $("hmi-refresh").addEventListener("click",()=>loadAreas().then(load).catch(e=>message(e.message)));
  for(const [id,delta] of [["hmi-prev",-1],["hmi-next",1]])$(id).addEventListener("click",()=>{state.page+=delta;load().catch(e=>message(e.message));});
  if(kind!=="areas"){
    $("hmi-child-new").addEventListener("click",()=>editChild());$("hmi-child-cancel").addEventListener("click",()=>{$("hmi-child-form").hidden=true;});
    $("hmi-child-archive-filter").addEventListener("change",()=>{state.childPage=1;loadChildren().catch(e=>message(e.message));});
    for(const [id,delta] of [["hmi-child-prev",-1],["hmi-child-next",1]])$(id).addEventListener("click",()=>{state.childPage+=delta;loadChildren().catch(e=>message(e.message));});
    $("hmi-child-list").addEventListener("click",e=>{
      const editButton=e.target.closest("[data-child-edit]");if(editButton&&!state.busy)return editChild(state.children.find(r=>r.id===Number(editButton.dataset.childEdit)));
      for(const action of ["archive","restore"]){const b=e.target.closest(`[data-child-${action}]`);if(b)mutate(async()=>{await api(`${kind}-sub/${b.getAttribute(`data-child-${action}`)}/${action}`,{method:"POST"});$("hmi-child-form").hidden=true;await loadChildren();message("Subreason diperbarui.","success");});}
    });
    $("hmi-child-form").addEventListener("submit",e=>{e.preventDefault();mutate(async()=>{const before=state.child;const body={parentId:state.selected.id,description:$("hmi-child-description").value,sortOrder:Number($("hmi-child-sort").value),isActive:$("hmi-child-active").checked,...(before?{expectedUpdatedAt:before.updatedAt}:{})};await api(`${kind}-sub${before?`/${before.id}`:""}`,{method:before?"PATCH":"POST",body:JSON.stringify(body)});$("hmi-child-form").hidden=true;await loadChildren();message("Subreason tersimpan.","success");});});
  }
  loadAreas().then(load).catch(e=>{message(e.message);$("hmi-count").textContent="Data tidak tersedia";$("hmi-list").innerHTML='<div class="hmi-empty"><p>Data gagal dimuat. Gunakan Muat ulang setelah koneksi tersedia.</p></div>';});
})();
