(function () {
  const cfg = JSON.parse(document.getElementById("sales-page-config").textContent);
  const type = cfg.salesType;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  let doc;
  const $id = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(value)) : "-";
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: doc?.currencyCode || "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal");
    return payload.data || payload;
  }
  function show(message, kind = "danger") { const alert = $id("sales-alert"); alert.textContent = message; alert.className = `alert alert-${kind}`; }
  function info(label, value) { return `<div><small>${esc(label)}</small><strong>${esc(value ?? "-")}</strong></div>`; }
  function renderStatus() { const value = String(doc.status || "Draft").toLowerCase(); $id("document-status").textContent = doc.status || "Draft"; $id("document-status").className = `sales-badge ${value.replaceAll(" ", "-")}`; }
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
    const revise = $id("revise-sales-order");
    if (revise) revise.classList.toggle("d-none", type !== "sales-order" || !["Confirmed", "In Progress", "Ready to Deliver"].includes(doc.status));
    const edit = $id("edit-document");
    if (edit && type === "sales-order") edit.classList.toggle("d-none", doc.status !== "Draft");
  }
  function renderInfo() {
    let fields;
    if (type === "quotation") fields = [["Customer", `${doc.customerCode || ""} — ${doc.customerName || ""}`], ["Tanggal Quotation", date(doc.quotationDate)], ["Valid Sampai", date(doc.validUntil)], ["Contact", doc.contact], ["Payment Terms", doc.paymentTerms], ["Currency", doc.currencyCode], ["Email", doc.email], ["Phone", doc.phone], ["Shipping Address", doc.shippingAddress]];
    else if (type === "sales-order") fields = [["Customer", `${doc.customerCode || ""} — ${doc.customerName || ""}`], ["Tanggal Order", date(doc.soDate)], ["Delivery", date(doc.deliveryDate)], ["Quotation", doc.quotationNumber], ["Payment Terms", doc.paymentTerms], ["Currency", doc.currencyCode], ["Contact", doc.contact], ["Phone", doc.phone], ["Shipping Address", doc.shippingAddress]];
    else fields = [["Nama Forecast", doc.forecastName], ["Customer", doc.customerCode], ["Periode Mulai", date(doc.periodStart)], ["Periode Selesai", date(doc.periodEnd)], ["Jumlah Part", doc.details?.length || 0], ["Tujuan", "Acuan MRP & buffer stock (FG only)"]];
    $id("detail-info").innerHTML = fields.map((item) => info(...item)).join("");
  }
  function renderItems() {
    if (type === "forecast") {
      $id("detail-head").innerHTML = "<tr><th>Part</th><th>UOM</th><th>Bulan Forecast</th><th>Qty Forecast</th></tr>";
      let total = 0;
      $id("detail-body").innerHTML = (doc.details || []).map((row) => { const qty = Number(row.forecastQty ?? row.M1Qty ?? 0); total += qty; return `<tr><td><b>${esc(row.partCode)}</b><br><small>${esc(row.part?.partName || "")}</small></td><td>${esc(row.uomCode)}</td><td>${date(row.forecastMonth || row.M1Forecast)}</td><td><b>${esc(qty)}</b></td></tr>`; }).join("");
      $id("detail-summary").innerHTML = `<span>Total forecast</span><strong>${new Intl.NumberFormat("id-ID").format(total)}</strong>`;
    } else {
      $id("detail-head").innerHTML = "<tr><th>Part</th><th>UOM</th><th>Qty</th><th>Harga</th><th>Diskon</th><th>Pajak</th><th>Total</th></tr>";
      $id("detail-body").innerHTML = (doc.details || []).map((row) => `<tr><td><b>${esc(row.partCode || row.partNumber)}</b><br><small>${esc(row.partName || row.part?.partName || "")}</small></td><td>${esc(row.uomCode)}</td><td>${esc(row.qty)}</td><td>${money(row.unitPrice)}</td><td>${esc(row.discount || 0)}%</td><td>${esc(row.tax || 0)}%</td><td><b>${money(row.totalAmount)}</b></td></tr>`).join("");
      $id("detail-summary").innerHTML = `<span>Total dokumen</span><strong>${money(doc.totalAmount)}</strong>`;
    }
  }
  function renderWorkflow() { const maps = { quotation: ["Draft", "Submitted", "Approved", "Converted"], "sales-order": ["Draft", "Confirmed", "In Progress", "Completed"], forecast: ["Draft", "Submitted", "Confirmed", "Partial Product", "Consumed", "Closed", "Obsolete"] }; const steps = maps[type]; const current = steps.indexOf(doc.status); const converted = type === "quotation" && doc.convertedToSO; $id("workflow").innerHTML = steps.map((step, index) => `<div class="workflow-step ${(index <= current || converted && step === "Converted") ? "done" : ""}"><b>${step}</b><span>${index === 0 ? "Dokumen dibuat" : step === "Submitted" && type === "forecast" ? "Menunggu approval" : step === "Partial Product" ? "Sebagian demand sudah diproduksi; sisa bulan masih bisa dikonsumsi" : step === "Consumed" ? "Forecast sudah diturunkan ke planning" : "Tahap proses dokumen"}</span></div>`).join(""); }
  function renderRelationships() { let html = ""; if (type === "quotation") html = doc.convertedToSO ? `<a href="/modules/sales/sales-orders/${encodeURIComponent(doc.convertedToSO)}">Sales Order: ${esc(doc.convertedToSO)} →</a>` : "<p>Belum dikonversi ke Sales Order.</p>"; else if (type === "sales-order") html = doc.quotationNumber ? `<a href="/modules/sales/quotations/${encodeURIComponent(doc.quotationNumber)}">Quotation: ${esc(doc.quotationNumber)} →</a>` : "<p>Sales Order dibuat tanpa quotation.</p>"; else html = "<p>Forecast menjadi demand bulanan untuk MPS, MRP, production plan, dan PR.</p>"; $id("relationships").innerHTML = html; }
  function renderPlanning(snapshot) { const box = $id("forecast-planning-tool-status"); if (!box) return; const item = snapshot.items?.[0]; if (!item) { box.textContent = "Forecast tidak ditemukan."; return; } const count = (value) => Array.isArray(value) ? value.length : 0; const actions = (item.nextActions || []).map((action) => `<span class="sales-badge">${esc(action)}</span>`).join(" ") || '<span class="text-success">Rantai planning sudah tersambung.</span>'; box.innerHTML = `<div class="sales-info-grid">${info("MPS", count(item.mps))}${info("MRP Run", count(item.mrp))}${info("Production Plan", count(item.productionPlans))}${info("PR", count(item.purchaseRequests))}${info("MO", count(item.manufacturingOrders))}${info("Production Log", count(item.productionLogs))}</div><p class="mt-2 mb-0"><b>Next action:</b> ${actions}</p>`; }
  async function loadPlanning() { if (type !== "forecast") return; try { renderPlanning(await api(`/modules/api/sales/forecasts/${encodeURIComponent(cfg.recordKey)}/planning-tool`)); } catch (error) { const box = $id("forecast-planning-tool-status"); if (box) box.textContent = error.message; } }
  async function loadDemandSummary() {
    if (type !== "forecast") return;
    const body = $id("forecast-demand-summary");
    if (!body) return;
    try {
      const result = await api(`/modules/api/sales/forecasts/demand-summary?forecastNumber=${encodeURIComponent(cfg.recordKey)}`);
      body.innerHTML = (result.items || []).map((row) => `<tr><td>${date(row.month)}</td><td><b>${esc(row.partCode)}</b><br><small>${esc(row.partName || row.partNumber || "")}</small></td><td>${esc((row.buckets || []).join(", "))}</td><td>${esc(row.forecastQty)}</td><td>${esc(row.actualSalesOrderQty)}</td><td class="${Number(row.qtyVariance) < 0 ? "text-danger" : "text-success"}">${esc(row.qtyVariance)}</td><td>${money(row.forecastRevenue)}</td><td>${money(row.actualRevenue)}</td></tr>`).join("") || '<tr><td colspan="8" class="text-muted text-center">Belum ada demand forecast.</td></tr>';
    } catch (error) { body.innerHTML = `<tr><td colspan="8" class="text-danger text-center">${esc(error.message)}</td></tr>`; }
  }
  async function load() { doc = await api(`/modules/api/sales/${cfg.slug}/${encodeURIComponent(cfg.recordKey)}`); const key = doc[cfg.detailKey]; $id("document-number").textContent = key; $id("document-breadcrumb").textContent = key; $id("document-caption").textContent = type === "forecast" ? `${doc.forecastName || ""} • ${doc.customerCode || "-"}` : `${doc.customerName || "-"} • ${date(doc[type === "quotation" ? "quotationDate" : "soDate"])}`; renderStatus(); renderInfo(); renderItems(); renderWorkflow(); renderRelationships(); $id("detail-notes").textContent = doc.notes || "-"; if (type === "quotation" && !doc.convertedToSO && ["Approved", "Accepted"].includes(doc.status)) $id("make-to-so").classList.remove("d-none"); if (type === "sales-order" && doc.status === "Draft") $id("confirm-sales-order")?.classList.remove("d-none"); await loadPlanning(); }
  const originalLoad = load;
  load = async () => { await originalLoad(); renderForecastActions(); renderSalesOrderActions(); await loadDemandSummary(); };
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
  $id("confirm-sales-order")?.addEventListener("click", async () => { if (!confirm("Confirm SO dan sinkronkan reservation stok?")) return; const button = $id("confirm-sales-order"); button.disabled = true; try { await api(`/modules/api/sales/sales-orders/${encodeURIComponent(cfg.recordKey)}/confirm`, { method: "PATCH", body: "{}" }); await load(); } catch (error) { show(error.message); button.disabled = false; } });
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
  load().catch((error) => show(error.message));
})();
