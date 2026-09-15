(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qty = (v) => v == null ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(v) || 0);
  const date = (v) => v ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(v)) : "—";
  const groups = { ppic: [["ppic", "Permintaan PPIC Lab"]], mps: [["mps", "Checksheet MPS · semua partner"]], supplier: [["suggestions", "Purchase Suggestion"], ["orders", "Purchase Order"]], vendor: [["vendor-plans", "Rencana proses · Monthly Plan"], ["vendor-orders", "Order proses vendor"]], customer: [["customer", "Permintaan & kiriman customer"]] };
  const labels = { BOM: "Perkiraan By BOM", MISSING: "Belum ada ETA", LATE: "Lewat target", ON_TRACK: "Dalam target", UNKNOWN: "Kesiapan belum lengkap", RECEIVED: "Sudah diterima", PLANNED: "Belum konfirmasi", CONFIRMED: "Konfirmasi manual" };
  let tab = "mps", rows = [], documents = [], page = 1, version = 0, asOf = "", currentRow = null, saving = false, requestId = "", selectedMpsNumber = new URLSearchParams(location.search).get("mpsNumber") || "", partnerFilter = "";
  const partnerCategory = (r) => r.category === "VENDOR" ? "vendor" : r.category === "CUSTOMER" ? "customer" : r.checkOnly || r.category === "CHECKSHEET" ? "checksheet" : "supplier";
  const partnerLabels = { supplier: "Supplier", vendor: "Vendor", customer: "Customer", checksheet: "Checksheet" };
  const canEdit = (r) => r.canConfirm === true && Boolean(r.partnerCode) && !r.blockedLink && !r.blockedHref && !r.masterMissing;
  const inputDate = (v) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toISOString().slice(0, 10) : "";
  const inputQty = (v) => v != null && String(v).trim() !== "" && Number.isFinite(Number(v)) ? String(Number(Number(v).toFixed(6))) : "";
  const evaluated = new Set();
  let permissions = { canConfirm: false, canEvaluate: false };
  let loading = false;
  let selectedReleaseId = new URLSearchParams(location.search).get("releaseId") || "";
  const required = (r) => Number(r.requiredQty ?? r.qty);
  const unresolved = (r) => r.etaBasis === "BOM" ? r.readiness?.ready !== true : r.timing !== "RECEIVED" && (!r.confirmed || r.stale || r.checkOnly || r.readiness?.ready === false || ["LATE", "UNKNOWN"].includes(r.timing) || Number(r.confirmedQty ?? r.qty) + .000001 < required(r) || (r.requiresQc && !r.readyDate));
  const newId = () => window.crypto?.randomUUID?.() || `eta-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const sheet = window.EtaRequestSheet?.mount({api,reload:()=>load(),openDetail:row=>openDetail(row),notify:(text,error=false)=>{const node=$(error?'eta-error':'eta-success');node.textContent=text;node.hidden=false;}});
  async function api(url, body, timeout = 190000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { method: body ? "POST" : "GET", signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem("token") || sessionStorage.getItem("token") || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Permintaan gagal (${response.status}).`);
      return payload;
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError) throw new Error(body ? "Status penyimpanan belum terkonfirmasi. Tutup form dan Refresh status sebelum mencoba ulang." : "Koneksi terputus. Refresh status untuk memuat ulang.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  function chooseTab(value, source, partner='') {
    tab = value; page = 1; partnerFilter = ['supplier','vendor','customer'].includes(partner)?partner:""; $("eta-category").value = ""; $("eta-status").value = "";
    if ($("eta-heading-copy")) $("eta-heading-copy").textContent = ({ppic:"Permintaan PPIC Lab · konfirmasi supplier, vendor, dan material customer langsung pada tabel.",mps:"Pilih MPS hasil perhitungan, lalu catat komitmen Supplier, Vendor, dan Customer.",supplier:"Purchase Plan Recommendation Confirm · catat komitmen supplier sebelum pembelian.",vendor:"Vendor Process Plan Recommendation Confirm · konfirmasi qty, lead time, dan tanggal kembali.",customer:"Material Supply from Customer Confirm · konfirmasi material milik customer dan tanggal siap dipakai."})[tab];
    $("eta-mode").value = tab;
    $("eta-mps-wrap").hidden = tab !== "mps";
    $("eta-source-wrap").hidden = ["mps","ppic"].includes(tab);
    $("eta-partners").hidden = !["mps","ppic"].includes(tab);
    $("eta-source").innerHTML = groups[tab].map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
    if (groups[tab].some(([v]) => v === source)) $("eta-source").value = source;
    $("eta-source").disabled = groups[tab].length === 1;
    $("eta-category-wrap").hidden = !["ppic", "mps", "supplier"].includes(tab);
    load();
  }
  function filteredRows() {
    const q = $("eta-search").value.trim().toLowerCase(), category = $("eta-category").value, status = $("eta-status").value;
    return rows.filter((r) => (!partnerFilter || partnerCategory(r) === partnerFilter) && (!$("eta-unresolved").checked || unresolved(r)) && (!category || r.category === category) && (!q || [r.code, r.name, r.partNumber, r.partner, r.source, r.process].join(" ").toLowerCase().includes(q)) && (!status || (["BOM", "PLANNED", "CONFIRMED"].includes(status) ? r.confirmation === status && r.timing !== "RECEIVED" : r.timing === status)));
  }
  function renderDocuments() {
    const selected = documents.find((d) => d.mpsNumber === selectedMpsNumber);
    $("eta-method-panel").hidden = tab !== "mps" || !selected || loading;
    if (selected && !loading) {
      $("eta-method-panel").innerHTML = `<div><b>Sumber ETA ${esc(selected.mpsNumber)}: ${selected.etaMode === "BOM" ? "Explode lead time BOM" : "Konfirmasi ETA"}</b><p>${selected.etaMode === "BOM" ? "MPS memakai perkiraan hasil explode BOM. Konfirmasi yang dicatat di sini tetap tersimpan dan digunakan jika PPIC memilih Konfirmasi ETA di MPS." : "MPS memakai qty, lead time, dan tanggal kesiapan yang dikonfirmasi di halaman ini."}</p></div><a class="eta-button" href="/modules/planning-ppic/mps/workbench?month=${encodeURIComponent($("eta-month").value)}#mwb-eta-source">Atur sumber ETA di MPS</a>`;
    }
    $("eta-documents").hidden = tab !== "mps";
    $("eta-documents").setAttribute("aria-busy", String(loading));
    if (loading) {
      $("eta-mps").innerHTML = `<option value="${esc(selectedMpsNumber)}">${selectedMpsNumber ? esc(selectedMpsNumber) + " · memuat…" : "Memuat pilihan MPS…"}</option>`;
      $("eta-mps").value = selectedMpsNumber;
      $("eta-documents").innerHTML = `<p class="eta-note">Memuat ${selectedMpsNumber ? esc(selectedMpsNumber) : "MPS"} dan kebutuhan konfirmasi…</p>`;
      return;
    }
    $("eta-mps").innerHTML = `<option value="">Pilih MPS hasil perhitungan</option>` + documents.map((d) => `<option value="${esc(d.mpsNumber)}">${esc(d.mpsNumber)} · R${esc(d.revision)} · ${esc(d.status)}</option>`).join("");
    $("eta-mps").value = selectedMpsNumber;
    const d = documents.find((item) => item.mpsNumber === selectedMpsNumber);
    $("eta-documents").innerHTML = d ? `<article class="eta-document"><div><small>MPS TERPILIH · KONFIRMASI OLEH PURCHASING</small><b>${esc(d.mpsNumber)}</b><small>Revisi ${esc(d.revision)} · ${esc(d.status)}</small></div><p><span class="eta-badge ${d.eta?.ready ? "received" : "missing"}">ETA ${qty(d.eta?.confirmed)}/${qty(d.eta?.total)} selesai</span> <span class="eta-badge">Kapasitas ${esc(d.capacityStatus)}</span> <span class="eta-badge">Delivery ${esc(d.deliveryStatus)}</span></p><div class="eta-actions"><a class="eta-button" href="${esc(d.href)}">Buka checksheet</a>${permissions.canEvaluate ? `<button class="eta-button" data-evaluate="${esc(d.mpsNumber)}" ${evaluated.has(d.mpsNumber) || ["Released", "Completed"].includes(d.status) ? "disabled" : ""}>${evaluated.has(d.mpsNumber) ? "Checksheet sedang diperiksa…" : "Periksa checksheet"}</button>` : ""}</div></article>` : `<p class="eta-note">${selectedMpsNumber ? `MPS ${esc(selectedMpsNumber)} tidak tersedia pada bulan ini. Pilih MPS yang sesuai.` : "Pilih MPS hasil perhitungan untuk memuat kebutuhan konfirmasi."}</p>`;
  }
  function render() {
    renderDocuments();
    if ($('eta-customer-operations')) $('eta-customer-operations').hidden = !(tab === 'customer' || tab === 'ppic' && partnerFilter === 'customer');
    document.querySelectorAll("[data-eta-partner]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.etaPartner === partnerFilter));
      b.hidden=tab==='ppic'&&b.dataset.etaPartner==='checksheet';
      const count = rows.filter((r) => !b.dataset.etaPartner || partnerCategory(r) === b.dataset.etaPartner).length;
      b.textContent = `${partnerLabels[b.dataset.etaPartner] || "Semua"} (${qty(count)})`;
    });
    const filtered = filteredRows();
    $("eta-count").textContent = qty(rows.length);
    $("eta-missing").textContent = qty(rows.filter((r) => r.timing === "MISSING" || r.checkOnly).length);
    $("eta-late").textContent = qty(rows.filter((r) => r.timing === "LATE").length);
    $("eta-pending").textContent = qty(rows.filter(unresolved).length);
    if($('eta-legacy-table'))$('eta-legacy-table').hidden=tab==='ppic';
    if($('eta-legacy-pagination'))$('eta-legacy-pagination').hidden=tab==='ppic';
    $('eta-start').hidden=tab==='ppic';
    sheet?.update({active:tab==='ppic',rows,filtered,period:$('eta-month').value,loading});
    if(tab==='ppic'){$('eta-note').textContent='Dikelompokkan seperti Purchase Suggestion. Konfirmasi memperbarui review PPIC Lab; stok dan transaksi pembelian mengikuti proses berikutnya.';return;}
    const pages = Math.max(1, Math.ceil(filtered.length / 25)); page = Math.min(Math.max(page, 1), pages);
    $("eta-body").innerHTML = filtered.slice((page - 1) * 25, page * 25).map((r) => `<tr><td class="eta-identity" data-label="Material / Part"><b>${esc(r.code)}</b><small>${esc(r.name)}${r.process ? ` · ${esc(r.process)}` : ""}</small></td><td data-label="Part No">${esc(r.partNumber)}</td><td class="eta-partner" data-label="Partner">${esc(r.partner || "Lengkapi partner di sumber")}</td><td data-label="Kebutuhan"><b>${date(r.needDate)}</b><small>Target tiba ${date(r.targetArrivalDate)}</small></td><td data-label="Lead time">${r.etaBasis !== "BOM" && (r.confirmedLeadTimeDays != null || r.confirmationRecord?.valid && r.confirmationRecord.leadTimeDays != null) ? `<b>Konfirmasi ${qty(r.confirmedLeadTimeDays ?? r.confirmationRecord.leadTimeDays)} hari</b>` : r.effectiveLeadTimeDays != null ? `<b>Acuan ${qty(r.effectiveLeadTimeDays)} hari</b>` : ""}<small>Master ${r.leadTime == null ? "—" : `${qty(r.leadTime)} hari`}</small></td><td data-label="ETA"><b>${date(r.eta)}</b><small>${esc(labels[r.confirmation])}</small></td><td data-label="Siap setelah QC">${date(r.readyDate)}</td><td class="qty" data-label="Qty kebutuhan">${qty(required(r))} ${esc(r.uom)}<small>${r.etaBasis === "BOM" ? "Qty rencana BOM" : `Konfirmasi ${qty(r.confirmedQty)}`}</small></td><td class="qty" data-label="Diterima">${qty(r.receivedQty)}<small>${r.qcHold ? `QC hold ${qty(r.qcHold)}` : r.rejectedQty ? `Reject ${qty(r.rejectedQty)}` : ""}</small></td><td data-label="Status"><span class="eta-badge ${r.checkOnly || r.stale ? "missing" : r.timing.toLowerCase()}">${r.checkOnly ? "Periksa checksheet" : r.etaBasis === "BOM" ? "Perkiraan By BOM" : r.confirmationRecord?.valid === false ? "Konfirmasi ulang" : labels[r.timing]}</span><small>${esc(r.readiness?.ready === false ? r.readiness.reason : "")}</small></td><td data-label="Dokumen"><a href="${esc(r.href)}">${esc(r.source)}</a><small>${esc(r.stage)}</small></td><td data-label="Aksi"><button class="eta-button ${canEdit(r) && unresolved(r) ? "primary" : ""}" type="button" data-detail="${esc(r.id)}">${canEdit(r) && unresolved(r) ? `Konfirmasi ${partnerLabels[partnerCategory(r)] || "Partner"}` : "Lihat detail"}</button></td></tr>`).join("") || `<tr><td class="eta-empty" colspan="12">${rows.length ? "Tidak ada item pada filter ini. Matikan fokus tindak lanjut untuk melihat konfirmasi yang selesai." : tab === "mps" ? "Belum ada kebutuhan konfirmasi MPS pada periode ini. Buat MPS atau periksa checksheet untuk memuat kebutuhannya." : "Tidak ada jadwal pada sumber dan periode ini."}</td></tr>`;
    $("eta-range").textContent = `${filtered.length ? (page - 1) * 25 + 1 : 0}–${Math.min(page * 25, filtered.length)} dari ${filtered.length} item`;
    $("eta-page").textContent = `${page} / ${pages}`;
    $("eta-prev").disabled = page <= 1; $("eta-next").disabled = page >= pages;
    $("eta-start").disabled = !filtered.some((r) => canEdit(r) && unresolved(r));
    $("eta-start").textContent = partnerFilter && partnerFilter !== "checksheet" ? `Konfirmasi ${partnerLabels[partnerFilter]}` : "Mulai konfirmasi";
    $("eta-note").textContent = tab === "mps" ? "ETA Supplier, Vendor, dan Customer mengikuti metode MPS terpilih. Lengkapi checksheet sebelum approve MPS / MRP resmi. Estimasi BOM dan qty konfirmasi tidak menambah stok." : `Konfirmasi tersimpan pada dokumen terkait. Target kebutuhan tetap menjadi acuan. ${asOf ? `Acuan ${date(asOf)}. ` : ""}Qty tidak dijumlahkan lintas dokumen.`;
  }
  async function load() {
    const current = ++version; loading = true; rows = []; documents = []; permissions = { canConfirm: false, canEvaluate: false }; page = 1; render();
    $("eta-error").hidden = true; $("eta-body").innerHTML = '<tr><td colspan="12" class="eta-empty">Memuat kebutuhan dan konfirmasi…</td></tr>'; $("eta-refresh").disabled = true;
    try {
      const month = $("eta-month").value, source = $("eta-source").value;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Pilih periode yang valid.");
      const requestedMpsNumber = source === "mps" ? selectedMpsNumber : "";
      const url = new URL(location.href); url.searchParams.set("month", month); url.searchParams.set("tab", tab); url.searchParams.set("source", source);
      if(tab==='ppic'&&partnerFilter)url.searchParams.set('partner',partnerFilter);else url.searchParams.delete('partner');
      if (requestedMpsNumber) url.searchParams.set("mpsNumber", requestedMpsNumber); else url.searchParams.delete("mpsNumber");
      history.replaceState(null, "", url);
      const query = new URLSearchParams({ month });
      if (selectedReleaseId && source !== "mps") query.set("releaseId", selectedReleaseId);
      if (requestedMpsNumber) query.set("mpsNumber", requestedMpsNumber);
      const payload = await api(`/modules/api/purchasing/eta-monitor/${source}?${query}`);
      if (current !== version) return false;
      documents = payload.documents || [];
      permissions = payload.permissions || { canConfirm: false, canEvaluate: false };
      if (source === "mps") {
        // An explicit deep link must never silently select another MPS.
        selectedMpsNumber = requestedMpsNumber || payload.selectedMpsNumber || "";
        if (requestedMpsNumber && payload.selectedMpsNumber && payload.selectedMpsNumber !== requestedMpsNumber) throw new Error("MPS respons berbeda dari pilihan. Refresh status atau pilih ulang MPS.");
        if (selectedMpsNumber) url.searchParams.set("mpsNumber", selectedMpsNumber);
        history.replaceState(null, "", url);
      }
      rows = (payload.items || []).filter((r) => source !== "mps" || (selectedMpsNumber && (r.mpsNumber || r.source) === selectedMpsNumber)).sort((a, b) => Number(unresolved(b)) - Number(unresolved(a)) || String(a.needDate || "9999").localeCompare(String(b.needDate || "9999")));
      asOf = payload.asOf; loading = false; render(); return true;
    } catch (error) {
      if (current !== version) return false;
      loading = false; permissions = { canConfirm: false, canEvaluate: false }; renderDocuments();
      $("eta-error").textContent = error.message; $("eta-error").hidden = false;
      if(tab==='ppic')sheet?.error(error.message);
      $("eta-body").innerHTML = '<tr><td colspan="12" class="eta-empty">Data belum tersedia. Periksa akses atau Refresh status.</td></tr>'; return false;
    } finally { if (current === version) $("eta-refresh").disabled = false; }
  }
  function openDetail(r) {
    currentRow = { ...r, sourceType: $("eta-source").value==='ppic'?r.sourceType:$("eta-source").value, month: $("eta-month").value, mpsNumber: selectedMpsNumber };
    requestId = newId();
    const editable = canEdit(r), partnerLabel = partnerLabels[partnerCategory(r)] || "Partner";
    $("eta-dialog-title").textContent = editable ? `Konfirmasi ${partnerLabel} · ${r.code}` : `Rincian · ${r.code}`;
    const record = r.confirmationRecord;
    const confirmedLead = record?.valid ? record.leadTimeDays ?? r.confirmedLeadTimeDays : !record ? r.confirmedLeadTimeDays : null;
    const lead = confirmedLead ?? r.leadTime ?? "";
    const fields = [["MPS / Dokumen", `${r.source}${r.mpsRevision != null ? ` · revisi ${r.mpsRevision}` : ""}`], ["Material / proses", `${r.code}${r.process ? ` · ${r.process}` : ""}`], ["Kebutuhan", `${qty(required(r))} ${r.uom || ""}`], ["Siap produksi", date(r.needDate)]];
    $("eta-detail").innerHTML = `<div class="ps-compact-confirmation">${r.etaBasis === "BOM" ? `<p class="eta-warning">Acuan saat ini: By BOM · tiba ${date(r.eta)}, siap ${date(r.readyDate)}. Form ini menyimpan konfirmasi partner. Untuk memakai konfirmasi ini, pilih sumber Konfirmasi ETA di MPS.</p>` : ""}
      <div class="ps-confirmation-summary">${fields.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
      ${record ? `<p class="eta-note">Konfirmasi ${record.valid ? "terakhir" : "sebelumnya · sumber berubah"}: ${qty(record.qty)} · ${date(record.eta)} · Lead time ${qty(record.leadTimeDays)} hari<br>${esc(record.reference)} · ${esc(record.by)}</p>` : ""}
      ${r.earliestReturnDate ? `<p class="eta-note">Tanggal kembali paling awal dari lead time vendor: <b>${date(r.earliestReturnDate)}</b>${r.leadTimeFits === false ? " · Lead time tidak muat dalam jendela proses." : ""}</p>` : ""}
      ${r.readiness?.ready === false && r.readiness.reason ? `<p class="eta-warning">${esc(r.readiness.reason)}</p>` : ""}
      <div id="eta-form-error" class="eta-error" role="alert" hidden></div>
      ${editable ? `<form id="eta-form" class="ps-confirmation-panel">
        <div class="ps-compact-section-head"><div><span>DETAIL HASIL KONFIRMASI</span><b>Komitmen ${esc(partnerLabel)} · dicatat Purchasing</b></div></div>
        <div class="eta-form-grid ps-form-grid">
          <label>${esc(partnerLabel)}<input class="form-control" readonly value="${esc([r.partnerCode, r.partner && r.partner !== r.partnerCode ? r.partner : ""].filter(Boolean).join(" · "))}"><small>Partner tetap mengikuti dokumen sumber.</small></label>
          <label>Confirmed Qty (${esc(r.uom || "unit")})<input class="form-control" name="qty" type="number" step="any" min="0.000001" required value="${inputQty(r.confirmedQty ?? required(r))}" ${r.id.startsWith("CS:") ? "readonly" : ""}></label>
          ${r.category!=='CUSTOMER'?`<label>MOQ (${esc(r.uom||'unit')})<input class="form-control" name="moq" type="number" step="any" min="0" value="${inputQty(r.confirmedMoq??r.moq??0)}" required><small>Minimum qty untuk satu konfirmasi / jadwal gabungan.</small></label>`:''}
          <label>${r.category === "VENDOR" ? "Confirmed Delivery · kembali vendor" : "Confirmed Delivery · tiba"}<input class="form-control" name="eta" type="date" required value="${inputDate(r.eta || r.targetArrivalDate || r.needDate)}"><small>${r.targetArrivalDate ? `Target tiba ${date(r.targetArrivalDate)}` : `Siap produksi ${date(r.needDate)}; target tiba belum ditetapkan.`}</small></label>
          <label>Lead Time Aktual (hari)<input class="form-control" name="leadTimeDays" type="number" min="0" max="3650" step="any" ${currentRow.sourceType === "mps" ? "required" : ""} value="${esc(lead)}"><small>Master / baseline: ${r.leadTime == null ? "belum tersedia" : `${qty(r.leadTime)} hari`}. Isi komitmen aktual partner.</small></label>
          ${r.requiresQc ? `<label>Siap setelah QC<input class="form-control" name="readyDate" type="date" required value="${inputDate(r.readyDate || r.eta || r.needDate)}"></label>` : ""}
        </div>
        ${r.id.startsWith("PS:") && r.materialCode ? `<details class="ps-additional-details eta-material-form" ${!r.purchasePackageUomCode || !r.materialWidth ? "open" : ""}><summary>Qty & spesifikasi material supplier</summary><div class="eta-form-grid">
          <label>Bentuk Material<select class="form-select" name="purchasePackageUomCode" required><option value="">Pilih bentuk</option>${["SHEET", "COIL", "PCS"].map((v) => `<option ${v === r.purchasePackageUomCode ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>Lebar Tersedia (mm)<input class="form-control" name="materialWidth" type="number" min="0.000001" step="any" required value="${esc(r.materialWidth || "")}"></label>
          <label>Panjang Sheet (mm)<input class="form-control" name="materialLength" type="number" min="0" step="any" value="${esc(r.materialLength || "")}"></label>
        </div></details>` : ""}
        <div class="ps-compact-section-head"><div><span>CATATAN AUDIT</span><b>Referensi komitmen partner</b></div></div>
        <div class="eta-form-grid">
          <label>Referensi konfirmasi<input class="form-control" name="reference" required maxlength="500" placeholder="Nama PIC · WA/email · tanggal konfirmasi"></label>
          <label>Catatan tambahan (opsional)<textarea class="form-control" name="notes" maxlength="2000" rows="2"></textarea></label>
        </div>
        <p id="eta-form-warning" class="eta-warning" role="status"></p>
        <div class="ps-compact-modal-actions eta-actions"><a class="eta-button" href="${esc(r.href)}">Buka dokumen</a><button class="eta-button" type="submit" name="save">Simpan Konfirmasi</button><button class="eta-button primary" type="submit" name="next">Simpan & berikutnya</button></div>
      </form>` : `<p class="eta-warning">${esc(r.blockReason || (r.timing === "RECEIVED" ? "Penerimaan sudah selesai." : !r.partnerCode || r.masterMissing ? "Lengkapi master partner pada sumber sebelum konfirmasi." : "Konfirmasi belum tersedia untuk akses atau dokumen ini."))}</p><a class="eta-button primary" href="${esc(r.blockedLink?.href || r.blockedLink || r.blockedHref || r.href)}">${esc(r.blockedLink?.label || r.action || "Lengkapi dokumen / master sumber")}</a>`}
    </div>`;
    const form = $("eta-form");
    if (form) { form.addEventListener("input", () => { requestId = newId(); formWarning(); }); form.addEventListener("submit", save); formWarning(); }
    if (!$("eta-dialog").open) $("eta-dialog").showModal();
  }
  function formWarning() {
    const form = $("eta-form"), r = currentRow; if (!form) return;
    const data = new FormData(form), warnings = [];
    if (Number(data.get("qty")) + .000001 < required(r)) warnings.push(`Masih kurang ${qty(required(r) - Number(data.get("qty")))} ${r.uom || ""}.`);
    if ((data.get("readyDate") || data.get("eta")) > r.needDate) warnings.push("Tanggal melewati kebutuhan. Konfirmasi dapat disimpan, tetapi perlu recovery sebelum release.");
    if (data.get("readyDate") && data.get("readyDate") < data.get("eta")) warnings.push("Tanggal siap setelah QC harus sama atau sesudah tanggal tiba.");
    $("eta-form-warning").textContent = warnings.join(" ") || "Pastikan qty dan tanggal ini sudah disepakati partner.";
  }
  async function save(event) {
    event.preventDefault(); if (saving) return;
    const form = event.currentTarget, data = Object.fromEntries(new FormData(form)), next = event.submitter?.name === "next", r = currentRow;
    const hasLead = String(data.leadTimeDays ?? "").trim() !== "";
    if (!canEdit(r) || (r.sourceType === "mps" && !r.mpsNumber)) return;
    if ((r.sourceType === "mps" && !hasLead) || (hasLead && (!Number.isFinite(Number(data.leadTimeDays)) || Number(data.leadTimeDays) < 0 || Number(data.leadTimeDays) > 3650))) {
      $("eta-form-error").textContent = "Isi lead time aktual antara 0 dan 3650 hari."; $("eta-form-error").hidden = false; return;
    }
    if (!form.reportValidity()) return;
    if (hasLead) data.leadTimeDays = Number(data.leadTimeDays); else delete data.leadTimeDays;
    saving = true; $("eta-close").disabled = true; form.querySelectorAll("button,input,select,textarea").forEach((b) => b.disabled = true); $("eta-form-error").hidden = true;
    try {
      const payload = await api(`/modules/api/purchasing/eta-monitor/${r.sourceType}/confirm`, { ...data, id: r.id, month: r.month, ...(r.sourceType === "mps" ? { mpsNumber: r.mpsNumber } : {}), qty: Number(data.qty), sourceFingerprint: r.sourceFingerprint, confirmationId: r.confirmationRecord?.id || null, requestId });
      window.PpicConfirmationFeedback?.notify({month:r.month,source:r.sourceType});
      $("eta-dialog").close(); $("eta-success").textContent = `${r.code}: konfirmasi tersimpan.${payload.item?.readiness?.ready === false ? ` ${payload.item.readiness.reason}` : ""}`; $("eta-success").hidden = false;
      const loaded = await load();
      if (next && loaded) { const candidate = filteredRows().find((x) => x.id !== r.id && x.id !== payload.sourceKey && canEdit(x) && unresolved(x)); if (candidate) openDetail(candidate); }
    } catch (error) { $("eta-form-error").textContent = error.message; $("eta-form-error").hidden = false; }
    finally { saving = false; $("eta-close").disabled = false; form.querySelectorAll("button,input,select,textarea").forEach((b) => b.disabled = false); }
  }
  $("eta-documents").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-evaluate]"); if (!button || !permissions.canEvaluate) return; const number = button.dataset.evaluate;
    if (evaluated.has(number)) return; evaluated.add(number); renderDocuments();
    $("eta-success").textContent = `${number}: memeriksa material, kapasitas, dan proses vendor…`; $("eta-success").hidden = false;
    try { await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(number)}/checksheet/evaluate`, {}, 310000); $("eta-success").textContent = `${number}: pemeriksaan selesai. Lengkapi item yang masih membutuhkan tindakan.`; await load(); }
    catch (error) { $("eta-error").textContent = error.message; $("eta-error").hidden = false; }
    finally { evaluated.delete(number); renderDocuments(); }
  });
  $("eta-mode").addEventListener("change", () => chooseTab($("eta-mode").value));
  $("eta-month").addEventListener("change", () => { selectedMpsNumber = ""; selectedReleaseId = ""; const url = new URL(location.href); url.searchParams.delete("releaseId"); history.replaceState(null,"",url); $("eta-success").hidden = true; load(); });
  $("eta-mps").addEventListener("change", () => { selectedMpsNumber = $("eta-mps").value; $("eta-success").hidden = true; load(); });
  $("eta-source").addEventListener("change", load);
  document.querySelectorAll("[data-eta-partner]").forEach((b) => b.addEventListener("click", () => { partnerFilter = b.dataset.etaPartner; page = 1;if(tab==='ppic'){const url=new URL(location.href);if(partnerFilter)url.searchParams.set('partner',partnerFilter);else url.searchParams.delete('partner');history.replaceState(null,'',url);}render(); }));
  for (const id of ["eta-category", "eta-status", "eta-search", "eta-unresolved"]) $(id).addEventListener(id === "eta-search" ? "input" : "change", () => { page = 1; render(); });
  $("eta-refresh").addEventListener("click", load);
  $("eta-prev").addEventListener("click", () => { page--; render(); }); $("eta-next").addEventListener("click", () => { page++; render(); });
  $("eta-close").addEventListener("click", () => { if (!saving) $("eta-dialog").close(); });
  $("eta-dialog").addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });
  $("eta-body").addEventListener("click", (event) => { const button = event.target.closest("[data-detail]"); if (button) { const row = rows.find((r) => r.id === button.dataset.detail); if (row) openDetail(row); } });
  $("eta-start").addEventListener("click", () => { const row = filteredRows().find((r) => canEdit(r) && unresolved(r)); if (row) openDetail(row); });
  const params = new URLSearchParams(location.search);
  const initialTab=selectedReleaseId&&['vendor','supplier','customer'].includes(params.get('tab'))?'ppic':groups[params.get('tab')]?params.get('tab'):selectedMpsNumber?'mps':'ppic';
  chooseTab(initialTab,params.get('source'),params.get('partner')||(selectedReleaseId?params.get('tab'):''));
  if (params.get('customer_ops') === '1' && $('eta-customer-operations')) $('eta-customer-operations').open = true;
  window.addEventListener?.('customer-supply:changed', () => load());
})();
