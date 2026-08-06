(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "-").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  let stagedRows = null;
  let uploadedRows = [];
  let sourceChecksum = null;
  let sourceMetadata = null;
  let currentBatch = null;
  const importType = () => $("excel-import-type").value || "FORECAST";

  async function api(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = { Authorization: `Bearer ${token()}`, ...(options.headers || {}) };
    if (!isFormData && options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Excel Import gagal diproses.");
    return payload.data || payload.items || payload;
  }

  function notify(message, kind = "danger") {
    const element = $("excel-import-alert");
    element.textContent = message;
    element.className = `alert mx-4 mt-3 alert-${kind}`;
  }

  function inputRows() {
    const parsed = JSON.parse($("excel-import-rows").value);
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("Rows JSON harus berupa array dan tidak boleh kosong.");
    return parsed.map((row, index) => ({ sheetName: row.sheetName || "Sheet1", rowNumber: Number(row.rowNumber || index + 1), sourceJson: row.sourceJson || row.data || row }));
  }

  function selectedSheetNames() {
    return [...$("excel-import-sheets").selectedOptions].map((option) => option.value);
  }

  function rowsForPreview() {
    if (!uploadedRows.length) return stagedRows || inputRows();
    const sheets = selectedSheetNames();
    if (!sheets.length) throw new Error("Pilih minimal satu sheet untuk diproses.");
    return uploadedRows.filter((row) => sheets.includes(row.sheetName));
  }

  function payload(rows) {
    return {
      fileName: $("excel-import-file-name").value.trim(),
      fileType: $("excel-import-file-type").value,
      importType: importType(),
      sourcePeriod: $("excel-import-period").value.trim(),
      sourceChecksum,
      metadata: sourceMetadata,
      rows,
    };
  }

  function renderPreview(preview) {
    const errors = preview.errors || [];
    const lines = preview.lines || [];
    const summary = preview.summary || preview.reconciliation || {};
    const historical = importType() !== "FORECAST";
    const body = lines.slice(0, 100).map((line) => historical
      ? `<tr><td>${escape(line.customerCode || line.materialCode)}</td><td><b>${escape(line.partCode || line.materialSpec)}</b><small class="d-block text-muted">${escape(line.partName)}</small></td><td>${escape(line.periodMonth || line.actualDate)}</td><td class="text-end">${escape(line.qty ?? line.demandQtyPcs)}</td><td class="text-end">${escape(line.amountIdr ?? line.demandQtyKg)}</td></tr>`
      : `<tr><td>${escape(line.customerCode)}</td><td><b>${escape(line.partCode)}</b><small class="d-block text-muted">${escape(line.partName)}</small></td><td>${escape(line.forecastMonth)}</td><td class="text-end">${escape(line.forecastQty)}</td><td>${escape(line.uomCode)}</td></tr>`).join("");
    $("excel-import-preview-result").innerHTML = `<div class="row g-3 mb-3"><div class="col"><div class="border rounded p-2"><small>Valid line</small><b class="d-block">${escape(summary.validLineCount ?? summary.mappedRows ?? lines.length)}</b></div></div><div class="col"><div class="border rounded p-2"><small>Total Qty</small><b class="d-block">${escape(summary.totalForecastQty ?? summary.totalQty ?? summary.totalPcs ?? 0)}</b></div></div><div class="col"><div class="border rounded p-2"><small>Error</small><b class="d-block">${escape(summary.errorCount ?? errors.length)}</b></div></div></div>${errors.length ? `<div class="alert alert-warning py-2">${errors.slice(0, 12).map((error) => `${escape(error.sheetName || "Sheet")} row ${escape(error.rowNumber)}: ${escape(error.message)}`).join("<br>")}</div>` : ""}<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Customer / Material</th><th>Part / Spec</th><th>Periode</th><th class="text-end">Qty PCS</th><th class="text-end">Nilai / KG</th></tr></thead><tbody>${body || '<tr><td colspan="5" class="text-center text-muted">Tidak ada line valid.</td></tr>'}</tbody></table></div>`;
    $("excel-import-preview-result").classList.remove("d-none");
    $("excel-import-save").disabled = !lines.length || errors.length > 0;
  }

  async function forecastPreview(rows) {
    const endpoint = importType() === "FORECAST" ? "forecast-preview" : "historical-preview";
    const result = await api(`/master-data/api/excel-imports/${endpoint}`, { method: "POST", body: JSON.stringify({ ...payload(rows), rows }) });
    renderPreview(result);
    return result;
  }

  async function previewManual() {
    try {
      uploadedRows = [];
      sourceChecksum = null;
      sourceMetadata = null;
      stagedRows = inputRows();
      await forecastPreview(stagedRows);
      notify("Preview JSON selesai. Periksa mapping, periode, dan rekonsiliasi sebelum menyimpan.", "info");
    } catch (error) { notify(error.message); }
  }

  async function uploadPreview() {
    const file = $("excel-import-file").files?.[0];
    if (!file) return notify("Pilih file .xlsx, .xls, atau .csv terlebih dahulu.", "warning");
    const button = $("excel-import-upload");
    try {
      button.disabled = true;
      const form = new FormData();
      form.append("file", file);
      const result = await api("/master-data/api/excel-imports/upload-preview", { method: "POST", body: form });
      uploadedRows = result.rows || [];
      stagedRows = null;
      sourceChecksum = result.sourceChecksum || null;
      sourceMetadata = result.metadata || null;
      $("excel-import-file-name").value = result.fileName || file.name;
      $("excel-import-file-type").value = result.fileType || file.name.split(".").pop().toLowerCase();
      const selector = $("excel-import-sheets");
      const sheets = result.metadata?.sheets || [];
      selector.innerHTML = sheets.map((sheet) => `<option value="${escape(sheet.sheetName)}">${escape(sheet.sheetName)} (${escape(sheet.rowCount)} rows${sheet.hidden ? ", hidden" : ""})</option>`).join("");
      selector.disabled = !sheets.length;
      const pattern = importType() === "SALES_HISTORY" ? /detail|sales|customer/i : importType() === "MATERIAL_DEMAND_HISTORY" ? /material|all|demand/i : /forecast|fc|demand|sales/i;
      const recommended = sheets.filter((sheet) => pattern.test(sheet.sheetName)).map((sheet) => sheet.sheetName);
      [...selector.options].forEach((option, index) => { option.selected = recommended.length ? recommended.includes(option.value) : index === 0; });
      const rows = rowsForPreview();
      await forecastPreview(rows);
      notify(`${result.fileName} dibaca: ${result.metadata?.sheetCount || 0} sheet, ${result.rowCount || 0} row. Periksa sheet terpilih sebelum menyimpan batch.`, "info");
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  }

  async function refreshSelectedSheets() {
    try {
      if (!uploadedRows.length) return;
      await forecastPreview(rowsForPreview());
      notify("Preview diperbarui sesuai sheet yang dipilih.", "info");
    } catch (error) { notify(error.message); }
  }

  async function save() {
    try {
      const rows = rowsForPreview();
      if (!$("excel-import-save").disabled) {
        // The latest preview was valid; retain its selected sheet rows exactly.
      } else {
        await forecastPreview(rows);
        if ($("excel-import-save").disabled) return;
      }
      const batch = await api("/master-data/api/excel-imports", { method: "POST", body: JSON.stringify(payload(rows)) });
      currentBatch = batch;
      $("excel-import-approve").disabled = batch.status !== "VALIDATED";
      $("excel-import-apply").disabled = true;
      notify(batch.idempotent ? `Batch ${batch.batchNumber} sudah ada; tidak dibuat duplikat.` : `Batch ${batch.batchNumber} tersimpan dan menunggu persetujuan.`, "success");
      await loadBatches();
    } catch (error) { notify(error.message); }
  }

  async function approve(key = currentBatch?.batchNumber) {
    try {
      if (!key) throw new Error("Pilih atau buat batch terlebih dahulu.");
      currentBatch = await api(`/master-data/api/excel-imports/${encodeURIComponent(key)}/approve`, { method: "PATCH", body: "{}" });
      $("excel-import-approve").disabled = true;
      $("excel-import-apply").disabled = false;
      notify(`Batch ${currentBatch.batchNumber} disetujui.`, "success");
      await loadBatches();
    } catch (error) { notify(error.message); }
  }

  async function apply(key = currentBatch?.batchNumber) {
    try {
      if (!key) throw new Error("Pilih batch yang sudah disetujui.");
      const type = currentBatch?.importType || importType();
      const action = type === "FORECAST" ? "apply-forecast" : "apply-historical";
      const result = await api(`/master-data/api/excel-imports/${encodeURIComponent(key)}/${action}`, { method: "POST", body: "{}" });
      currentBatch = result.batch || currentBatch;
      $("excel-import-apply").disabled = true;
      notify(result.idempotent ? "Batch ini sudah pernah diterapkan; tidak ada data ganda." : (type === "FORECAST" ? `Forecast berhasil dibuat (${result.forecastCount || 0} header).` : `Data historis diterapkan: ${result.reconciliation?.appliedCount || 0} baris.`), "success");
      await loadBatches();
    } catch (error) { notify(error.message); }
  }

  async function loadBatches() {
    try {
      const result = await api("/master-data/api/excel-imports?page=1&limit=30");
      const items = result.items || [];
      $("excel-import-batches").innerHTML = items.map((item) => `<tr><td><b>${escape(item.batchNumber)}</b><small class="d-block text-muted">${escape(item.importType)}</small></td><td>${escape(item.fileName)}</td><td>${escape(item.sourcePeriod)}</td><td>${escape(item.rowCount)}</td><td>${escape(item.errorCount)}</td><td><span class="badge text-bg-${item.status === "APPLIED" ? "success" : item.status === "APPROVED" ? "primary" : item.status === "VALIDATED" ? "warning" : "secondary"}">${escape(item.status)}</span></td><td>${escape(String(item.createdAt || "").slice(0, 10))}</td><td><button class="btn btn-sm btn-outline-primary" data-select="${escape(item.batchNumber)}" data-type="${escape(item.importType)}">Pilih</button>${item.status === "VALIDATED" ? ` <button class="btn btn-sm btn-outline-success" data-approve="${escape(item.batchNumber)}" data-type="${escape(item.importType)}">Setujui</button>` : ""}${item.status === "APPROVED" ? ` <button class="btn btn-sm btn-success" data-apply="${escape(item.batchNumber)}" data-type="${escape(item.importType)}">Terapkan</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="8" class="text-center text-muted py-4">Belum ada batch import.</td></tr>';
    } catch (error) { notify(error.message); }
  }

  $("excel-import-upload").addEventListener("click", uploadPreview);
  $("excel-import-preview").addEventListener("click", previewManual);
  $("excel-import-save").addEventListener("click", save);
  $("excel-import-approve").addEventListener("click", () => approve());
  $("excel-import-apply").addEventListener("click", () => apply());
  $("excel-import-refresh").addEventListener("click", loadBatches);
  $("excel-import-sheets").addEventListener("change", refreshSelectedSheets);
  $("excel-import-batches").addEventListener("click", (event) => {
    const { select, approve: approveKey, apply: applyKey, type } = event.target.dataset;
    if (type) $("excel-import-type").value = type;
    if (select) {
      currentBatch = { batchNumber: select, status: "", importType: type || importType() };
      $("excel-import-approve").disabled = true;
      $("excel-import-apply").disabled = true;
      notify(`Batch ${select} dipilih. Gunakan aksi pada baris sesuai status batch.`, "info");
    }
    if (approveKey) approve(approveKey);
    if (applyKey) apply(applyKey);
  });
  $("excel-import-type").addEventListener("change", () => { currentBatch = null; $("excel-import-save").disabled = true; $("excel-import-apply").disabled = true; notify("Jenis import berubah. Jalankan preview ulang.", "info"); });
  loadBatches();
})();
