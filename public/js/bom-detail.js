(function () {
  const config = JSON.parse(document.getElementById("bom-record-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
  const date = (value, withTime = false) => value ? new Intl.DateTimeFormat("id-ID", withTime ? { dateStyle: "medium", timeStyle: "short" } : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const partLabel = (part) => [part?.partCode || part?.partNumber, part?.partName].filter(Boolean).join(" ") || "—";
  const field = (name, value) => { const node = document.querySelector(`[data-field="${name}"]`); if (node) node.textContent = value; };
  const processName = (item) => item.process?.processName || item.process?.processCode || "Proses belum dinamai";
  const processOccurrence = (item) => item.occurrenceCode || item.notes || item.process?.processCode || "—";
  const compareRouting = (a, b) => {
    const left = String(a.routingNumber || "").split(".").map(Number); const right = String(b.routingNumber || "").split(".").map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) { const difference = (left[index] ?? -1) - (right[index] ?? -1); if (difference) return difference; }
    return Number(a.sequence || 0) - Number(b.sequence || 0);
  };
  const durationUnitLabel = (unit) => ({ SECOND: "Detik", MINUTE: "Menit", HOUR: "Jam", DAY: "Hari" }[unit] || "Jam");
  async function load() {
    try {
      const response = await fetch(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(config.recordKey)}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (response.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
      const record = await response.json().catch(() => ({})); if (!response.ok) throw new Error(record.message || "Detail BOM gagal dimuat.");
      if (config.view === "detail") renderDetail(record); else renderProcesses(record);
    } catch (error) { const alert = document.getElementById("bom-record-alert"); alert.textContent = error.message; alert.classList.remove("d-none"); }
  }
  function renderDetail(record) {
    const details = (record.details || []).filter((item) => !item.isDeleted);
    field("noReg", record.noReg || "—"); field("parentItem", partLabel(record.part)); field("bomType", details.some((item) => item.category === "inHouse") ? "Production" : "Standard");
    field("revision", `Rev.${String(record.revision || 1).padStart(2, "0")}`); field("effectiveDate", date(record.effectiveDate)); field("status", record.expiryDate && new Date(record.expiryDate) < (globalThis.erpBusinessNow?.() || new Date()) ? "EXPIRED" : "RELEASED");
    field("revisionNote", record.revisionNote || (record.revisionOfMbomId ? "Catatan revisi belum diisi" : "Revisi awal")); field("notes", record.notes || `Bill of Materials untuk ${partLabel(record.part)}.`); field("componentCount", `${details.length} Item${details.length === 1 ? "" : "s"}`); field("updatedAt", date(record.updatedAt, true));
    document.getElementById("bom-detail-rows").innerHTML = details.length ? details.map((item) => {
      const firstProcess = (item.mbomProcesses || []).find((process) => !process.isDeleted); const part = item.part || {};
      const materialText = part.itemType === "RAW" && part.rawType === "MATERIAL" ? `${part.material?.materialCode || "Material belum link"} · ${item.materialThickness || 0}×${item.materialWidth || 0}×${item.materialPitch || 0} / CAV ${item.materialCavity || 1} · ${Number(item.grossWeight || 0).toFixed(2)} kg/pcs` : "—";
      const uomCode = item.uomCode || item.uom?.uomCode || "";
      return `<tr><td>${Number(item.levelComponent || 1)}</td><td><b class="bom-code-text">${esc(part.partCode || part.partNumber || "—")}</b></td><td>${esc(part.partName || "—")}</td><td class="text-end">${window.SharedDataTable.formatQuantity(item.qty, uomCode, { maximumFractionDigits: 2 })}</td><td>${esc(uomCode || "—")}</td><td>${esc(item.parentDetail?.part?.partName || item.notes || "—")}</td><td>${esc(firstProcess ? processOccurrence(firstProcess) : "—")}</td><td>${esc(materialText)}${part.itemType === "RAW" && part.rawType === "MATERIAL" ? '<small class="d-block">Quotation: ' + window.BomMeasurements.materialSummary(item, true) + '</small><small class="d-block">Actual: ' + window.BomMeasurements.materialSummary(item) + '</small>' : ""}</td><td class="text-danger">${Number(item.scrapFactor || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</td><td>${Number(item.leadTime || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${durationUnitLabel(item.leadTimeUnit)}</td></tr>`;
    }).join("") : '<tr><td colspan="10" class="text-center py-4">Belum ada komponen.</td></tr>';
  }
  function renderProcesses(record) {
    const processes = (record.details || []).flatMap((detail) => (detail.mbomProcesses || []).filter((item) => !item.isDeleted).map((item) => ({ ...item, detail }))).sort(compareRouting);
    document.getElementById("bom-process-rows").innerHTML = processes.length ? processes.map((item, index) => `<tr><td>${esc(item.routingNumber || item.sequence || (index + 1) * 10)}</td><td><b>${esc(processName(item))}</b></td><td>${esc(processOccurrence(item))}</td><td class="bom-muted">${esc(item.machine?.machineName || item.machine?.machineCode || "—")}</td><td>0</td><td>${item.quotationCycleTime == null ? "—" : Number(item.quotationCycleTime)}</td><td>${Number(item.cycleTime || 0)}</td><td>0</td><td>0</td><td><span class="bom-release-badge">Aktif</span></td></tr>`).join("") : '<tr><td colspan="10" class="text-center py-4">Belum ada routing proses pada detail BOM.</td></tr>';
    document.getElementById("bom-process-flow").innerHTML = processes.length ? processes.map((item, index) => `${index ? '<i>›</i>' : ""}<span>${esc(processOccurrence(item))} (${esc(item.routingNumber || item.sequence || (index + 1) * 10)})</span>`).join("") : '<span class="empty">Belum ada alur proses.</span>';
    renderYieldLinks(processes);
    const run = processes.reduce((sum, item) => sum + Number(item.cycleTime || 0), 0); document.getElementById("bom-time-caption").textContent = `Total Cycle Time Actual: ${run.toLocaleString("id-ID", { maximumFractionDigits: 2 })} Detik`;
    document.getElementById("bom-total-hours").textContent = `${(run / 3600).toFixed(2)} Hours`;
  }
  async function routingApi(path, options={}) {
    const response=await fetch('/routing-tools/api/'+path,{...options,headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'}});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'Standar routing gagal diproses.');return data;
  }
  async function renderYieldLinks(processes) {
    const container=document.getElementById('bom-yield-link-rows'),status=document.getElementById('bom-yield-link-status');if(!container)return;
    try {
      const data=await routingApi('routings');const masters=(data.items||[]).filter(row=>row.source==='ROUTING_MASTER'&&row.status==='ACTIVE'&&!row.isDeleted);
      container.innerHTML=processes.map((process,index)=>{
        const candidates=masters.filter(row=>row.partId===process.detail.partId).flatMap(row=>(row.operations||[]).filter(op=>op.isActive&&op.processId===process.processId&&Boolean(op.isSubcontract)===(process.routingMode==='VENDOR')).map(op=>({...op,master:row})));
        process.yieldCandidates=candidates;
        return '<div class="border rounded p-3 mb-3"><strong>'+esc(process.detail.part?.partCode)+' · '+esc(processName(process))+'</strong><label class="d-block mt-2">Operasi master / yield<select class="form-select" data-yield-select="'+index+'"><option value="">Belum ditautkan</option>'+candidates.map(op=>'<option value="'+esc(op.id)+'"'+(op.id===process.routingOperationId?' selected':'')+'>'+esc(op.master.routingCode+' · OP '+op.sequence+' · yield '+op.yieldPercent+'%')+'</option>').join('')+'</select></label><button class="btn btn-primary mt-2" type="button" data-yield-save="'+index+'"'+(!candidates.length?' disabled':'')+'>Simpan tautan</button>'+(candidates.length?'':'<p>Belum ada operasi master aktif yang sesuai part, proses, dan pelaksana ini. Buat master routing terlebih dahulu.</p>')+'</div>';
      }).join('');
      container.onclick=async event=>{
        const button=event.target.closest('[data-yield-save]');if(!button)return;const index=Number(button.dataset.yieldSave),process=processes[index],selected=container.querySelector('[data-yield-select="'+index+'"]').value;
        if(!selected){status.textContent='Pilih operasi master sebelum menyimpan.';return;}button.disabled=true;status.textContent='Menyimpan tautan operasi…';
        try{const saved=await routingApi('mbom-processes/'+encodeURIComponent(process.id)+'/link',{method:'PATCH',body:JSON.stringify({routingOperationId:selected,expectedUpdatedAt:process.updatedAt})});if(saved.routingOperationId!==selected)throw new Error('Tautan belum terkonfirmasi; muat ulang data.');status.textContent='Tautan tersimpan. Hitung ulang rencana MPS/MRP dan validasi kembali Data Readiness.';await load();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
      };
    }catch(error){container.textContent=error.message;}
  }
  load();
})();
