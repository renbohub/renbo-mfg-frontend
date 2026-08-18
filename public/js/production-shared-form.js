(function () {
  const config = JSON.parse(document.getElementById("production-shared-config").textContent);
  const page = config.page.slug;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const get = (object, path) => String(path || "").split(".").reduce((value, key) => value?.[key], object);
  const today = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const lookup = (url, valueKey, labelKeys) => ({ type: "lookup", url, valueKey, labelKeys });
  const fields = {
    "manufacturing-orders": [
      { name: "partId", label: "Part yang Diproduksi", required: true, ...lookup("/master-data/api/parts?start=0&length=500", "id", ["partCode", "partName"]) },
      { name: "qtyPlanned", label: "Qty Planned", type: "number", required: true, min: 0.0001 },
      { name: "uomCode", label: "UOM", required: true },
      { name: "plannedStartDate", label: "Planned Start", type: "date", required: true, default: today() },
      { name: "plannedEndDate", label: "Planned End", type: "date", required: true, default: today() },
      { name: "referenceType", label: "Reference Type", type: "select", options: ["Internal", "MRPPlannedOrder"], default: "Internal" },
      { name: "inputSourceType", label: "Input Source", type: "select", options: ["MBOM", "WIP_STOCK"], default: "MBOM" },
      { name: "notes", label: "Catatan", type: "textarea", span: 2 },
    ],
    "work-orders": [
      { name: "moId", label: "Manufacturing Order", required: true, ...lookup("/modules/api/production/manufacturing-orders?start=0&length=500", "id", ["moNumber", "part.partCode"]) },
      { name: "outputPartCode", label: "Output Part Code" },
      { name: "processId", label: "Proses", ...lookup("/master-data/api/processes?start=0&length=500", "id", ["processCode", "processName"]) },
      { name: "machineId", label: "Mesin", ...lookup("/master-data/api/machines?start=0&length=500", "id", ["machineCode", "machineName"]) },
      { name: "diesId", label: "Dies / QD", ...lookup("/master-data/api/dies?start=0&length=500", "id", ["diesCode", "diesName"]) },
      { name: "plannedDate", label: "Planned Date", type: "date", required: true, default: today() },
      { name: "plannedQty", label: "Qty Planned", type: "number", required: true, min: 0.0001 },
      { name: "uomCode", label: "UOM" },
      { name: "cycleTime", label: "Cycle Time (detik)", type: "number", min: 0 },
      { name: "shift", label: "Shift", type: "select", options: ["", "1A", "1B", "2A", "2B", "3A", "3C"] },
      { name: "operatorName", label: "Operator" },
      { name: "status", label: "Status", type: "select", options: ["Draft", "Planned", "Released", "In Production", "Completed", "Cancelled"], editOnly: true },
      { name: "notes", label: "Catatan", type: "textarea", span: 2 },
    ],
    "vendor-process-orders": [
      { name: "moNumber", label: "Manufacturing Order", required: true, ...lookup("/modules/api/production/manufacturing-orders?start=0&length=500", "moNumber", ["moNumber", "part.partCode"]), createOnly: true },
      { name: "vendorCode", label: "Vendor Code", editOnly: true },
      { name: "vendorName", label: "Vendor Name", editOnly: true },
      { name: "dueDate", label: "Due Date", type: "date", editOnly: true },
      { name: "qtyPlanned", label: "Qty Planned", type: "number", min: 0, editOnly: true },
      { name: "uomCode", label: "UOM", editOnly: true },
      { name: "notes", label: "Catatan", type: "textarea", span: 2, editOnly: true },
    ],
    "material-issues": [
      { name: "woId", label: "Work Order Released", required: true, ...lookup("/modules/api/production/work-orders?start=0&length=500", "id", ["woNumber", "outputPartCode", "status"]) },
      { name: "warehouseCode", label: "Warehouse", required: true, ...lookup("/master-data/api/warehouses?start=0&length=500", "warehouseCode", ["warehouseCode", "warehouseName"]) },
      { name: "issuedBy", label: "Issued By" },
      { name: "receivedBy", label: "Received By" },
      { name: "details", label: "Detail Material (JSON)", type: "json", span: 2, default: "[]", help: "qtyRequired, qtyIssued, uomCode, stockBalanceId/rackCode/lotNumber" },
      { name: "notes", label: "Catatan", type: "textarea", span: 2 },
    ],
    "quality-inspections": [
      { name: "productionLogId", label: "Production Entry", ...lookup("/modules/api/production/production-logs?start=0&length=500", "id", ["logNumber", "woNumber", "status"]) },
      { name: "woId", label: "Work Order (fallback)", ...lookup("/modules/api/production/work-orders?start=0&length=500", "id", ["woNumber", "outputPartCode"]) },
      { name: "inspectionDate", label: "Tanggal Inspection", type: "date", required: true, default: today() },
      { name: "inspectedBy", label: "Inspector", required: true },
      { name: "batchNumber", label: "Batch / Lot" },
      { name: "sampleSize", label: "Sample Size", type: "number", min: 1, default: 1 },
      { name: "qtyInspected", label: "Qty Inspected", type: "number", min: 0 },
      { name: "qtyPassed", label: "Qty Passed", type: "number", min: 0 },
      { name: "qtyFailed", label: "Qty Failed", type: "number", min: 0 },
      { name: "qtyRework", label: "Qty Rework", type: "number", min: 0 },
      { name: "decision", label: "Decision", type: "select", options: ["Pending", "Accepted", "Rejected", "Conditional Accept", "Rework"], default: "Pending" },
      { name: "details", label: "Parameter Inspection (JSON)", type: "json", span: 2, default: "[]" },
      { name: "notes", label: "Catatan", type: "textarea", span: 2 },
    ],
    wip: [
      { name: "moId", label: "Manufacturing Order", required: true, ...lookup("/modules/api/production/manufacturing-orders?start=0&length=500", "id", ["moNumber", "part.partCode"]) },
      { name: "woId", label: "Work Order", ...lookup("/modules/api/production/work-orders?start=0&length=500", "id", ["woNumber", "outputPartCode"]) },
      { name: "entryDate", label: "Tanggal Entry", type: "date", required: true, default: today() },
      { name: "costType", label: "Cost Type", type: "select", options: ["Material", "Labor", "Overhead", "Scrap"], required: true, default: "Material" },
      { name: "sourceType", label: "Source Type", type: "select", options: ["Manual", "MaterialIssue", "WorkOrder", "ProductionLog", "QualityInspection"], required: true, default: "Manual" },
      { name: "sourceRef", label: "Source Reference" },
      { name: "partCode", label: "Part Code" },
      { name: "partNumber", label: "Part Number" },
      { name: "partName", label: "Part Name" },
      { name: "warehouseCode", label: "Warehouse" },
      { name: "rackCode", label: "Rack" },
      { name: "lotNumber", label: "Lot" },
      { name: "stockType", label: "Stock Type", default: "WIP" },
      { name: "qty", label: "Qty", type: "number", required: true, min: 0 },
      { name: "uomCode", label: "UOM" },
      { name: "rate", label: "Rate", type: "number", min: 0 },
      { name: "amount", label: "Amount", type: "number", min: 0 },
      { name: "direction", label: "Direction", type: "select", options: ["IN", "OUT"], default: "IN" },
      { name: "notes", label: "Catatan", type: "textarea", span: 2 },
    ],
    "downtime-logs": [
      { name: "moId", label: "Manufacturing Order", required: true, ...lookup("/modules/api/production/manufacturing-orders?start=0&length=500", "id", ["moNumber", "part.partCode"]) },
      { name: "woId", label: "Work Order", ...lookup("/modules/api/production/work-orders?start=0&length=500", "id", ["woNumber", "outputPartCode"]) },
      { name: "downtimeDate", label: "Tanggal", type: "date", required: true, default: today() },
      { name: "shift", label: "Shift", type: "select", options: ["", "1A", "1B", "2A", "2B", "3A", "3C"] },
      { name: "machineCode", label: "Mesin" },
      { name: "operatorName", label: "Operator" },
      { name: "startTime", label: "Mulai", type: "datetime-local" },
      { name: "endTime", label: "Selesai", type: "datetime-local" },
      { name: "durationMinutes", label: "Durasi (menit)", type: "number", min: 0 },
      { name: "category", label: "Kategori", type: "select", options: ["Machine", "Material", "Quality", "Manpower", "Utility", "Other"] },
      { name: "reason", label: "Alasan", required: true },
      { name: "notes", label: "Catatan", type: "textarea", span: 2 },
    ],
  };
  const activeFields = (fields[page] || []).filter((field) => !(field.createOnly && config.mode !== "create") && !(field.editOnly && config.mode !== "edit"));
  const shell = document.getElementById("production-shared-fields");
  const alertBox = document.getElementById("production-shared-alert");
  const submit = document.getElementById("production-shared-submit");
  const show = (message, type = "danger") => { alertBox.textContent = message; alertBox.className = `alert alert-${type}`; };
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(payload.message || "Permintaan Production gagal.");
    return payload.data || payload.item || payload;
  }
  function control(field) {
    const attrs = `${field.required ? " required" : ""}${field.min != null ? ` min="${field.min}"` : ""}`;
    if (field.type === "textarea" || field.type === "json") return `<textarea id="field-${field.name}" rows="${field.type === "json" ? 6 : 3}"${attrs}></textarea>`;
    if (field.type === "select" || field.type === "lookup") {
      const initial = field.type === "lookup" ? '<option value="">Memuat pilihan...</option>' : field.options.map((option) => `<option value="${esc(option)}">${esc(option || "Pilih")}</option>`).join("");
      return `<select id="field-${field.name}"${attrs}>${initial}</select>`;
    }
    return `<input id="field-${field.name}" type="${esc(field.type || "text")}" step="${field.type === "number" ? "any" : ""}"${attrs}>`;
  }
  shell.innerHTML = activeFields.map((field) => `<label class="${field.span === 2 ? "span-2" : ""}"><span>${esc(field.label)}${field.required ? " *" : ""}</span>${control(field)}</label>`).join("");
  activeFields.forEach((field) => {
    if (field.default == null) return;
    const element = document.getElementById(`field-${field.name}`);
    if (element) element.value = field.default;
  });
  async function loadLookup(field) {
    const select = document.getElementById(`field-${field.name}`);
    try {
      const payload = await api(field.url);
      const rows = Array.isArray(payload) ? payload : (payload.data || payload.items || payload.results || []);
      select.innerHTML = '<option value="">Pilih</option>' + rows.map((row) => {
        const value = get(row, field.valueKey);
        const label = field.labelKeys.map((key) => get(row, key)).filter((item) => item != null && item !== "").join(" · ");
        return value == null ? "" : `<option value="${esc(value)}">${esc(label || value)}</option>`;
      }).join("");
    } catch (error) {
      select.innerHTML = '<option value="">Lookup gagal dimuat</option>';
      show(error.message);
    }
  }
  function normalizeDateInput(value, type) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString();
    return type === "date" ? local.slice(0, 10) : local.slice(0, 16);
  }
  async function initialize() {
    await Promise.all(activeFields.filter((field) => field.type === "lookup").map(loadLookup));
    if (config.mode !== "edit") return;
    try {
      const record = await api(`/modules/api/production/${encodeURIComponent(page)}/${encodeURIComponent(config.recordKey)}`);
      activeFields.forEach((field) => {
        const element = document.getElementById(`field-${field.name}`);
        const value = get(record, field.name);
        if (element && value != null) element.value = field.type === "json"
          ? JSON.stringify(value, null, 2)
          : ["date", "datetime-local"].includes(field.type) ? normalizeDateInput(value, field.type) : value;
      });
    } catch (error) { show(error.message); submit.disabled = true; }
  }
  document.getElementById("production-shared-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {};
    for (const field of activeFields) {
      const raw = document.getElementById(`field-${field.name}`)?.value?.trim() || "";
      if (field.required && !raw) { show(`${field.label} wajib diisi.`); return; }
      if (field.type === "json") {
        try { body[field.name] = raw ? JSON.parse(raw) : []; }
        catch (_) { show(`${field.label} harus berupa JSON yang valid.`); return; }
      } else {
        body[field.name] = field.type === "number" ? (raw === "" ? null : Number(raw)) : (raw || null);
      }
    }
    submit.disabled = true;
    try {
      const endpoint = config.mode === "edit"
        ? `/modules/api/production-documents/${encodeURIComponent(page)}/${encodeURIComponent(config.recordKey)}`
        : `/modules/api/production-documents/${encodeURIComponent(page)}`;
      const result = await api(endpoint, { method: config.mode === "edit" ? "PATCH" : "POST", body: JSON.stringify(body) });
      const record = Array.isArray(result) ? result[0] : (result.items?.[0] || result);
      const key = record?.[config.page.detailKey];
      show(`${config.page.label} berhasil disimpan.`, "success");
      setTimeout(() => location.assign(key ? `/modules/production/${page}/${encodeURIComponent(key)}` : `/modules/production/${page}`), 400);
    } catch (error) { show(error.message); submit.disabled = false; }
  });
  initialize();
})();
