(function () {
  const cfg = JSON.parse(document.getElementById("sales-page-config").textContent);
  const type = cfg.salesType;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  let doc;
  const $id = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(value)) : "-";
  const month = (value) => value ? new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(new Date(value)) : "-";
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: doc?.currencyCode || "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
  const qty = (value, uomCode = "") => window.SharedDataTable.formatQuantity(value, uomCode, { maximumFractionDigits: 2 });

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal");
    return payload.data || payload;
  }
  function show(message, kind = "danger") {
    const alert = $id("sales-alert"); alert.textContent = message; alert.className = `alert alert-${kind}`;
    if (type === 'sales-order' && String(message).includes('Konfigurasikan approval SO')) {
      alert.append(document.createTextNode(' '));
      const link = document.createElement('a'); link.href = '/master-data/approval-rules'; link.textContent = 'Buka Approval Rules'; link.className = 'alert-link'; alert.append(link);
    }
  }
  function info(label, value) { return `<div><small>${esc(label)}</small><strong>${esc(value ?? "-")}</strong></div>`; }
  function initDetailTabs() {
    const tabs = [...document.querySelectorAll("[data-sales-tab]")];
    const panels = [...document.querySelectorAll("[data-sales-panel]")];
    if (!tabs.length) return;
    const activate = (tab) => {
      const target = tab.dataset.salesTab;
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.dataset.salesPanel !== target; });
      const activePanel = panels.find((panel) => panel.dataset.salesPanel === target);
      if (activePanel && window.SharedDataTable) window.SharedDataTable.enhanceAll(activePanel);
      window.dispatchEvent(new Event("resize"));
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        activate(tabs[nextIndex]);
      });
    });
    activate(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0]);
  }
  function renderStatus() { const value = String(doc.status || "Draft").toLowerCase(); $id("document-status").textContent = doc.status || "Draft"; $id("document-status").className = `document-shell__status sales-badge ${value.replaceAll(" ", "-")}`; }
  function renderForecastActions() {
    const submit = $id("submit-forecast");
    if (submit) submit.classList.toggle("d-none", type !== "forecast" || doc.status !== "Draft");
    const approve = $id("approve-forecast");
    if (approve) approve.classList.toggle("d-none", type !== "forecast" || doc.status !== "Submitted");
    const revise = $id("revise-forecast");
    if (revise) revise.classList.toggle("d-none", type !== "forecast" || !["Draft", "Confirmed", "Partial Product", "Consumed"].includes(doc.status));
    const edit = $id("edit-document");
    if (edit && type === "forecast") edit.classList.toggle("d-none", doc.status !== "Draft");
  }
  function renderSalesOrderActions() {
    if (type === 'sales-order') {
      $id('confirm-sales-order')?.classList.toggle('d-none', doc.status !== 'In Approval');
      $id('submit-sales-order')?.classList.toggle('d-none', doc.status !== 'Draft');
      $id('reject-sales-order')?.classList.toggle('d-none', doc.status !== 'In Approval');
      $id('withdraw-sales-order')?.classList.toggle('d-none', doc.status !== 'In Approval');
      $id('delete-document')?.classList.toggle('d-none', !['Draft', 'Cancelled'].includes(doc.status));
    }
    const revise = $id("revise-sales-order");
    if (revise) revise.classList.toggle("d-none", type !== "sales-order" || !["Confirmed", "In Progress", "Ready to Deliver"].includes(doc.status));
    const edit = $id("edit-document");
    if (edit && type === "sales-order") edit.classList.toggle("d-none", doc.status !== "Draft");
  }
  function renderInfo() {
    let fields;
    if (type === "quotation") fields = [["Customer", `${doc.customerCode || ""} — ${doc.customerName || ""}`], ["Tanggal Quotation", date(doc.quotationDate)], ["Valid Sampai", date(doc.validUntil)], ["Contact", doc.contact], ["Payment Terms", doc.paymentTerms], ["Currency", doc.currencyCode], ["Email", doc.email], ["Phone", doc.phone], ["Shipping Address", doc.shippingAddress]];
    else if (type === "sales-order") fields = [["Customer", `${doc.customerCode || ""} — ${doc.customerName || ""}`], ["Tanggal Order", date(doc.soDate)], ["Quotation", doc.quotationNumber], ["Payment Terms", doc.paymentTerms], ["Currency", doc.currencyCode], ["Contact", doc.contact], ["Phone", doc.phone], ["Shipping Address", doc.shippingAddress]];
    else fields = [["Nama Forecast", doc.forecastName], ["Customer", doc.customerCode], ["Periode Mulai", date(doc.periodStart)], ["Periode Selesai", date(doc.periodEnd)], ["Jumlah Part", doc.details?.length || 0], ["Tujuan", "Acuan MRP & buffer stock (FG only)"]];
    if (type === 'sales-order') fields.unshift(['Referensi PO Pelanggan', doc.customerPoNumber], ['Tracking ERP', doc.soNumber]);
    $id("detail-info").innerHTML = fields.map((item) => info(...item)).join("");
  }
  function renderItems() {
    if (type === "forecast") {
      $id("detail-head").innerHTML = "<tr><th>Part</th><th>UOM</th><th>Bulan Forecast</th><th>Delivery Schedule</th><th>Qty Forecast</th></tr>";
      let total = 0;
      $id("detail-body").innerHTML = (doc.details || []).map((row) => {
        const quantity = Number(row.forecastQty ?? row.M1Qty ?? 0);
        const schedules = Array.isArray(row.deliveryTargets) ? row.deliveryTargets : [];
        const scheduleMarkup = schedules.length
          ? `<div class="sales-delivery-dates">${schedules.map((target) => `<time datetime="${esc(target.targetDate)}">${date(target.targetDate)}</time>`).join("")}</div>`
          : '<span class="text-muted">Belum dijadwalkan</span>';
        total += quantity;
        return `<tr><td><b>${esc(row.partCode)}</b><br><small>${esc(row.part?.partName || "")}</small></td><td>${esc(row.uomCode)}</td><td>${month(row.forecastMonth || row.M1Forecast)}</td><td>${scheduleMarkup}</td><td><b>${qty(quantity, row.uomCode)}</b></td></tr>`;
      }).join("");
      $id("detail-summary").innerHTML = `<span>Total forecast</span><strong>${qty(total, doc.details?.[0]?.uomCode)}</strong>`;
    } else {
      const salesOrder = type === "sales-order";
      $id("detail-head").innerHTML = salesOrder ? "<tr><th>Part</th><th>UOM</th><th>Qty</th><th>Delivery Phase / Feasibility</th><th>Harga / Source</th><th>Est. BOM / Unit</th><th>Gross Contribution</th><th>Margin</th><th>Diskon</th><th>Pajak</th><th>Total</th></tr>" : "<tr><th>Part</th><th>UOM</th><th>Qty</th><th>Harga</th><th>Diskon</th><th>Pajak</th><th>Total</th></tr>";
      $id("detail-body").innerHTML = (doc.details || []).map((row) => salesOrder ? `<tr><td><b>${esc(row.partCode || row.partNumber)}</b><br><small>${esc(row.partName || row.part?.partName || "")}</small></td><td>${esc(row.uomCode)}</td><td>${qty(row.qty,row.uomCode)}</td><td><div class="sales-phase-statuses">${(row.deliveryTargets||[]).map((target)=>{const decision=target.planningDecision||{};const targetUom=target.uomCode||row.uomCode||"";return `<span><b>Phase ${esc(target.phaseNumber)} · ${date(target.targetDate)}</b><small>${qty(target.qty,targetUom)} ${esc(targetUom)} · ${esc(decision.feasibilityStatus||"NOT_SIMULATED")}${decision.criticalConstraint?` · ${esc(decision.criticalConstraint)}`:""}</small></span>`}).join("")||"-"}</div></td><td>${money(row.unitPrice)}<small class="d-block">${esc(row.priceSource || "PRICE_NOT_FOUND")}${row.priceOverrideReason?` · ${esc(row.priceOverrideReason)}`:""}</small></td><td>${money(row.estimatedBomCostPerUnit)}<small class="d-block">${esc(row.costingStatus || "NOT COSTED")}</small></td><td class="${Number(row.estimatedGrossContribution)<0?"text-danger":"text-success"}">${money(row.estimatedGrossContribution)}</td><td><b>${num(row.estimatedMarginPercent)}%</b></td><td>${num(row.discount)}%</td><td>${num(row.tax)}%</td><td><b>${money(row.totalAmount)}</b></td></tr>` : `<tr><td><b>${esc(row.partCode || row.partNumber)}</b><br><small>${esc(row.partName || row.part?.partName || "")}</small></td><td>${esc(row.uomCode)}</td><td>${qty(row.qty,row.uomCode)}</td><td>${money(row.unitPrice)}</td><td>${num(row.discount)}%</td><td>${num(row.tax)}%</td><td><b>${money(row.totalAmount)}</b></td></tr>`).join("");
      $id("detail-summary").innerHTML = `<span>Total dokumen</span><strong>${money(doc.totalAmount)}</strong>`;
    }
  }
  function renderWorkflow() { const maps = { quotation: ["Draft", "Submitted", "Approved", "Converted"], "sales-order": ["Draft", "In Approval", "Confirmed", "In Progress", "Completed"], forecast: ["Draft", "Submitted", "Confirmed", "Partial Product", "Consumed", "Closed", "Obsolete"] }; const steps = maps[type]; const current = steps.indexOf(doc.status); const converted = type === "quotation" && doc.convertedToSO; $id("workflow").innerHTML = steps.map((step, index) => `<div class="workflow-step ${(index <= current || converted && step === "Converted") ? "done" : ""}"><b>${step}</b><span>${index === 0 ? "Dokumen dibuat" : step === "Submitted" && type === "forecast" ? "Menunggu approval" : step === "Partial Product" ? "Sebagian demand sudah diproduksi; sisa bulan masih bisa dikonsumsi" : step === "Consumed" ? "Forecast sudah diturunkan ke planning" : "Tahap proses dokumen"}</span></div>`).join(""); }
  function relatedTable(rows, emptyMessage) {
    if (!rows.length) return `<p class="sales-related-empty">${esc(emptyMessage)}</p>`;
    return `<div class="table-responsive"><table class="table sales-related-table"><thead><tr><th>Dokumen</th><th>Referensi</th><th>Konteks</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.type)}</td><td><a class="erp-record-link" href="${row.href}">${esc(row.reference)}</a></td><td>${esc(row.context || "Related record")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderRelationships() {
    let rows = [];
    let empty = "Belum ada dokumen terkait.";
    if (type === "quotation") {
      if (doc.convertedToSO) rows = [{ type: "Sales Order", reference: doc.convertedToSO, href: `/modules/sales/sales-orders/${encodeURIComponent(doc.convertedToSO)}`, context: "Hasil konversi quotation" }];
      else empty = "Belum dikonversi ke Sales Order.";
    } else if (type === "sales-order") {
      if (doc.quotationNumber) rows = [{ type: "Quotation", reference: doc.quotationNumber, href: `/modules/sales/quotations/${encodeURIComponent(doc.quotationNumber)}`, context: "Dokumen sumber" }];
      else empty = "Sales Order dibuat tanpa quotation.";
    } else empty = "Related MPS, MRP, production plan, dan PR akan tampil setelah planning disinkronkan.";
    $id("relationships").innerHTML = relatedTable(rows, empty);
  }
  function referenceValues(value, keys) {
    return (Array.isArray(value) ? value : []).map((entry) => {
      if (typeof entry === "string" || typeof entry === "number") return String(entry);
      return keys.map((key) => entry?.[key]).find(Boolean) || "";
    }).filter(Boolean);
  }
  function renderPlanning(snapshot) {
    const box = $id("forecast-planning-tool-status");
    if (!box) return;
    const item = snapshot.items?.[0];
    if (!item) { box.textContent = "Forecast tidak ditemukan."; return; }
    const specs = [
      ["MPS", item.mps, ["mpsNumber", "number"], "/modules/planning-ppic/master-production-schedule/"],
      ["MRP", item.mrp, ["runNumber", "mrpNumber", "number"], "/modules/planning-ppic/material-requirements-planning/"],
      ["Production Plan", item.productionPlans, ["planNumber", "number"], "/modules/planning-ppic/monthly-production-plans/"],
      ["Purchase Requisition", item.purchaseRequests, ["prNumber", "number"], "/modules/purchasing/purchase-requisitions/"],
      ["Manufacturing Order", item.manufacturingOrders, ["moNumber", "number"], "/modules/production/manufacturing-orders/"],
      ["Production Entry", item.productionLogs, ["logNumber", "number"], "/modules/production/production-logs/"],
    ];
    const rows = specs.flatMap(([recordType, records, keys, base]) => referenceValues(records, keys).map((reference) => ({ type: recordType, reference, href: `${base}${encodeURIComponent(reference)}`, context: cfg.recordKey })));
    const counts = specs.map(([recordType, records]) => `${recordType}: ${Array.isArray(records) ? records.length : 0}`).join(" · ");
    const actions = (item.nextActions || []).map((action) => `<span class="sales-badge">${esc(action)}</span>`).join(" ") || '<span class="text-success">Rantai planning sudah tersambung.</span>';
    box.innerHTML = `${relatedTable(rows, "Belum ada related record dari planning chain.")}<div class="sales-related-summary"><span>${esc(counts)}</span><div><b>Next action:</b> ${actions}</div></div>`;
  }
  async function loadPlanning() { if (type !== "forecast") return; try { renderPlanning(await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/planning-tool`)); } catch (error) { const box = $id("forecast-planning-tool-status"); if (box) box.textContent = error.message; } }
  async function loadDemandSummary() {
    if (type !== "forecast") return;
    const body = $id("forecast-demand-summary");
    if (!body) return;
    try {
      const result = await api(`/modules/api/sales/forecasts/demand-summary?forecastNumber=${encodeURIComponent(cfg.recordKey)}`);
      body.innerHTML = (result.items || []).map((row) => `<tr><td>${date(row.month)}</td><td><b>${esc(row.partCode)}</b><br><small>${esc(row.partName || row.partNumber || "")}</small></td><td>${esc((row.buckets || []).join(", "))}</td><td>${qty(row.forecastQty,row.uomCode)}</td><td>${qty(row.actualSalesOrderQty,row.uomCode)}</td><td class="${Number(row.qtyVariance) < 0 ? "text-danger" : "text-success"}">${qty(row.qtyVariance,row.uomCode)}</td><td>${money(row.forecastRevenue)}</td><td>${money(row.actualRevenue)}</td></tr>`).join("") || '<tr><td colspan="8" class="text-muted text-center">Belum ada demand forecast.</td></tr>';
    } catch (error) { body.innerHTML = `<tr><td colspan="8" class="text-danger text-center">${esc(error.message)}</td></tr>`; }
  }
  async function load() { doc = await api(`/modules/api/sales/${cfg.slug}/${encodeURIComponent(cfg.recordKey)}`); const key = doc[cfg.detailKey]; $id("document-number").textContent = key; $id("document-breadcrumb").textContent = key; $id("document-caption").textContent = type === "forecast" ? `${doc.forecastName || ""} • ${doc.customerCode || "-"}` : `${doc.customerName || "-"} • ${date(doc[type === "quotation" ? "quotationDate" : "soDate"])}`; renderStatus(); renderInfo(); renderItems(); renderWorkflow(); renderRelationships(); $id("detail-notes").textContent = doc.notes || "-"; if (type === "quotation" && !doc.convertedToSO && ["Approved", "Accepted"].includes(doc.status)) $id("make-to-so").classList.remove("d-none"); if (type === "sales-order" && doc.status === "Draft") $id("confirm-sales-order")?.classList.remove("d-none"); await loadPlanning(); }
  const soBase = () => `/modules/api/sales/sales-orders/${encodeURIComponent(cfg.recordKey)}`;
  async function downloadFile(url, filename) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'File gagal diunduh.');
    const blob = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = blob; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(blob), 1000);
  }
  async function loadSalesEvidence() {
    if (type === 'forecast') {
      const box = $id('forecast-version-history');
      try {
        const result = await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/history`);
        box.innerHTML = (result.items || []).map(version => `<details ${version.forecastNumber === cfg.recordKey ? 'open' : ''}><summary>${esc(version.forecastNumber)} · Versi ${esc(version.version)} · ${esc(version.status)}${version.isCurrentVersion ? ' · Terkini' : ''}</summary><p>${esc(version.revisionReason || version.notes || '')}</p><div class="table-responsive"><table class="table"><thead><tr><th>Part</th><th>Bulan</th><th>UOM</th><th>Qty sebelumnya</th><th>Qty versi ini</th><th>Perubahan</th></tr></thead><tbody>${version.rows.map(row => `<tr><td>${esc(row.partCode)}</td><td>${esc(row.month)}</td><td>${esc(row.uomCode || '-')}</td><td>${num(row.previousQty)}</td><td>${num(row.qty)}</td><td>${num(row.deltaQty)}</td></tr>`).join('')}</tbody></table></div></details>`).join('') || '<p>Belum ada histori.</p>';
      } catch(error) { box.textContent = error.message; }
      return;
    }
    if (type !== 'sales-order') return;
    const form = $id('so-attachment-form'); form.hidden = doc.status !== 'Draft'; form.classList.toggle('d-none', doc.status !== 'Draft');
    $id('so-attachments').innerHTML = (doc.attachments || []).map(attachment => `<div class="d-flex flex-wrap gap-2 align-items-center mb-2">${attachment.files.map(file => `<button class="btn btn-sm btn-outline-secondary" type="button" data-attachment-download="${esc(file.downloadUrl)}" data-file-name="${esc(file.fileName)}">${esc(file.fileName)} (${num(file.fileSize / 1024)} KB)</button>`).join('')}<small>${esc(attachment.uploadedBy || '')}</small>${doc.status === 'Draft' ? `<button type="button" class="btn btn-sm btn-outline-danger" data-attachment-delete="${esc(attachment.id)}">Hapus</button>` : ''}</div>`).join('') || '<p>Belum ada lampiran.</p>';
    const box = $id('so-approval-history');
    try {
      const result = await api(`${soBase()}/approvals`);
      box.innerHTML = (result.items || []).map(request => `<details open><summary>${esc(request.requestNumber)} · ${esc(request.status)} · Tahap ${esc(request.currentStep)}</summary><ol>${request.rule.steps.map(step => `<li>${esc(step.stepName || step.stepOrder)} — ${esc(step.role?.roleName || step.permissionAction || 'Approver')} (${esc(step.requiredApprovals)} persetujuan)</li>`).join('')}</ol><div class="table-responsive"><table class="table"><thead><tr><th>Tahap</th><th>Keputusan</th><th>Oleh</th><th>Waktu</th><th>Catatan</th></tr></thead><tbody>${request.actions.map(action => `<tr><td>${esc(action.stepOrder)}</td><td>${esc(action.action)}</td><td>${esc(action.actedBy)}</td><td>${esc(new Date(action.actedAt).toLocaleString('id-ID'))}</td><td>${esc(action.notes || '-')}</td></tr>`).join('') || '<tr><td colspan="5">Menunggu persetujuan.</td></tr>'}</tbody></table></div></details>`).join('') || '<p>Draft belum diajukan. Ajukan untuk memulai approval bertingkat.</p>';
    } catch(error) { box.textContent = error.message; }
  }
  for (const [id, action] of [['submit-sales-order','submit'], ['reject-sales-order','reject'], ['withdraw-sales-order','withdraw']]) {
    $id(id)?.addEventListener('click', async () => {
      const notes = action === 'submit' ? '' : prompt(action === 'reject' ? 'Alasan dikembalikan untuk revisi:' : 'Alasan menarik pengajuan:');
      if (notes === null || (action !== 'submit' && !notes.trim())) return;
      const button = $id(id); button.disabled = true;
      try { await api(`${soBase()}/${action}`, { method:'POST', body:JSON.stringify({notes}) }); await load(); show('Workflow SO berhasil diperbarui.', 'success'); } catch(error) { show(error.message); } finally { button.disabled = false; }
    });
  }
  $id('so-attachment-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const file = $id('so-attachment-file').files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) return show('Maksimal ukuran lampiran 10 MB.');
    const button = event.target.querySelector('button'); button.disabled = true;
    try { const form = new FormData(); form.append('file',file); const response = await fetch(`${soBase()}/attachments`, { method:'POST', headers:{ Authorization:`Bearer ${token()}` }, body:form }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message || 'Upload gagal.'); $id('so-attachment-file').value=''; await load(); } catch(error) { show(error.message); } finally { button.disabled=false; }
  });
  $id('so-attachments')?.addEventListener('click', async event => {
    const download = event.target.closest('[data-attachment-download]'), remove = event.target.closest('[data-attachment-delete]');
    try { if (download) await downloadFile(download.dataset.attachmentDownload, download.dataset.fileName); if (remove && confirm('Hapus lampiran dari SO?')) { await api(`${soBase()}/attachments/${encodeURIComponent(remove.dataset.attachmentDelete)}`, {method:'DELETE'}); await load(); } } catch(error) { show(error.message); }
  });
  const originalLoad = load;
  load = async () => { await originalLoad(); renderForecastActions(); renderSalesOrderActions(); await Promise.all([loadDemandSummary(), loadSalesEvidence()]); const pending = sessionStorage.getItem(`so-upload-warning:${cfg.recordKey}`); if (pending) { show(pending, 'warning'); sessionStorage.removeItem(`so-upload-warning:${cfg.recordKey}`); } };
  $id("submit-forecast")?.addEventListener("click", async () => {
    if (!confirm("Submit Forecast ini ke alur approval? Forecast belum dapat dikonsumsi PPIC sampai disetujui.")) return;
    const button = $id("submit-forecast"); button.disabled = true; button.textContent = "Submitting...";
    try {
      const result = await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/submit`, { method: "POST", body: "{}" });
      await load();
      show(`Forecast masuk ke approval${result.approvalRequest?.requestNumber ? ` (${result.approvalRequest.requestNumber})` : ""}.`, "success");
    } catch (error) { show(error.message); button.disabled = false; button.textContent = "Submit Forecast"; }
  });
  $id("approve-forecast")?.addEventListener("click", async () => {
    if (!confirm("Approve Forecast ini? Setelah approval final, Forecast menjadi Confirmed dan dapat dikonsumsi PPIC.")) return;
    const button = $id("approve-forecast"); button.disabled = true; button.textContent = "Approving...";
    try {
      await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/approve`, { method: "POST", body: "{}" });
      await load();
      show(doc.status === "Confirmed" ? "Forecast berhasil di-approve dan berstatus Confirmed." : "Approval level ini selesai; Forecast masih menunggu level berikutnya.", "success");
    } catch (error) { show(error.message); button.disabled = false; button.textContent = "Approve Forecast"; }
  });
  $id("revise-forecast")?.addEventListener("click", async () => {
    const reason = await window.formPrompt("Alasan revisi Forecast (wajib):", "", { title: "Buat Revisi Forecast" });
    if (reason === null || !String(reason).trim()) return;
    const button = $id("revise-forecast"); button.disabled = true; button.textContent = "Membuat revisi...";
    try {
      const revised = await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/revise`, { method: "POST", body: JSON.stringify({ reason: String(reason).trim() }) });
      location.href = `/modules/sales/forecasts/${encodeURIComponent(revised.forecastNumber)}`;
    } catch (error) { show(error.message); button.disabled = false; button.textContent = "Buat Revisi"; }
  });
  $id("make-to-so").addEventListener("click", async () => { if (!confirm("Buat Sales Order dari quotation ini?")) return; const button = $id("make-to-so"); button.disabled = true; button.textContent = "Membuat SO..."; try { const so = await api(`/modules/api/sales/quotations/${encodeURIComponent(cfg.recordKey)}/make-to-so`, { method: "POST", body: "{}" }); location.href = `/modules/sales/sales-orders/${encodeURIComponent(so.soNumber)}`; } catch (error) { show(error.message); button.disabled = false; button.textContent = "Make to SO"; } });
  $id("confirm-sales-order")?.addEventListener("click", async () => { if (!confirm("Setujui tahap aktif SO? Konfirmasi dan reservation stok dilakukan setelah seluruh tahap selesai.")) return; const button = $id("confirm-sales-order"); button.disabled = true; try { await api(`/modules/api/sales/sales-orders/${encodeURIComponent(cfg.recordKey)}/confirm`, { method: "PATCH", body: "{}" }); await load(); } catch (error) { show(error.message); } finally { button.disabled = false; } });
  $id("revise-sales-order")?.addEventListener("click", async () => {
    const reason = await window.formPrompt("Alasan revisi Sales Order (wajib):", "", { title: "Buat Revisi Sales Order" });
    if (reason === null || !String(reason).trim()) return;
    const button = $id("revise-sales-order"); button.disabled = true; button.textContent = "Membuat revisi...";
    try {
      const revised = await api(`/modules/api/sales/sales-orders/${encodeURIComponent(cfg.recordKey)}/revise`, { method: "POST", body: JSON.stringify({ reason: String(reason).trim() }) });
      location.href = `/modules/sales/sales-orders/${encodeURIComponent(revised.soNumber)}`;
    } catch (error) { show(error.message); button.disabled = false; button.textContent = "Buat Revisi"; }
  });
  $id("delete-document").addEventListener("click", async () => { if (!confirm(`Hapus ${cfg.recordKey}?`)) return; try { await api(`/modules/api/sales/${cfg.slug}/${encodeURIComponent(cfg.recordKey)}`, { method: "DELETE" }); location.href = `/modules/sales/${cfg.slug}`; } catch (error) { show(error.message); } });
  const planningButton = $id("forecast-planning-tool"); if (planningButton) planningButton.addEventListener("click", async () => { planningButton.disabled = true; planningButton.textContent = "Sinkronisasi..."; try { const result = await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/planning-tool`, { method: "POST", body: JSON.stringify({ execute: true }) }); renderPlanning(result); show("Planning chain berhasil ditarik dan disinkronkan sejauh yang tidak membutuhkan approval.", "success"); } catch (error) { show(error.message); } finally { planningButton.disabled = false; planningButton.textContent = "Tarik Planning"; } });
  initDetailTabs();
  load().catch((error) => show(error.message));
})();
