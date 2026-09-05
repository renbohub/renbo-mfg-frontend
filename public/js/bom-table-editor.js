(function () {
  const config = JSON.parse(document.getElementById("bom-table-editor-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const headers = (json = false) => ({ Authorization: `Bearer ${token()}`, ...(json ? { "content-type": "application/json" } : {}) });
  const rowsTarget = document.getElementById("bom-table-edit-rows");
  const alertBox = document.getElementById("bom-table-edit-alert");
  const processDialog = document.getElementById("bom-process-dialog");
  const processRows = document.getElementById("bom-process-edit-rows");
  const materialDialog = document.getElementById("bom-material-dialog");
  const detailTable = document.getElementById("bom-detail-edit-table");
  const freezeCountInput = document.getElementById("bom-table-freeze-count");
  const freezeStorageKey = "bom.tableEditor.freezeColumns";
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const state = { record: null, graphValidation: null, parts: [], uoms: [], processes: [], machines: [], machineCostRates: [], materialForms: [], partPrices: [], materialPrices: [], vendorPrices: [], vendorProcesses: [], suppliers: [], customers: [], vendors: [], currencies: [], rows: [], omittedRows: [], editingProcessKey: null, editingMaterialKey: null, bomByNoReg: new Map() };
  const keyOf = (row) => row.id || row.clientKey;
  const escapeHtml = (value) => { const element = document.createElement("div"); element.textContent = value ?? ""; return element.innerHTML; };
  const escapeAttr = (value) => escapeHtml(value).replaceAll('"', "&quot;");
  const dateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
  const todayInput = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const newKey = () => `table_${window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now() + "_" + Math.random().toString(16).slice(2)}`;
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const moneyPerSecond = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const leadTimeUnitOptions = (selected) => [["SECOND", "Detik"], ["MINUTE", "Menit"], ["HOUR", "Jam"], ["DAY", "Hari (8 jam)"]].map(([value, label]) => option(value, label, selected || "HOUR")).join("");

  async function fetchJson(url) {
    const response = await fetch(url, { headers: headers() }); const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Data gagal dimuat."); return payload;
  }
  const optionalList = (url) => fetchJson(url).catch(() => ({ data: [] }));
  function option(value, label, selected) { return `<option value="${escapeAttr(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`; }
  function materialFormOptions(selected, optional = false) { return `${optional ? '<option value="">Tidak digunakan</option>' : '<option value="">Pilih form</option>'}${state.materialForms.map((form) => option(form.id, `${form.formName} (${form.symbol})`, selected)).join("")}`; }
  function partOptions(selected) { return `<option value="">Pilih part</option>${state.parts.map((part) => option(part.id, `${part.partCode || part.partNumber || "—"} — ${part.partName || ""}`, selected)).join("")}`; }
  function uomOptions(selected) { return `<option value="">Pilih UOM</option>${state.uoms.map((uom) => option(uom.uomCode, `${uom.uomCode} — ${uom.uomName || uom.uomCode}`, selected)).join("")}`; }
  function processOptions(selected) { return `<option value="">Pilih proses</option>${state.processes.map((item) => option(item.id, `${item.processCode} — ${item.processName || item.processCode}`, selected)).join("")}`; }
  function supplierOptions(selected) { return `<option value="">Pilih supplier</option>${state.suppliers.map((item) => option(item.id, `${item.supplierCode} — ${item.supplierName || item.supplierCode}`, selected)).join("")}`; }
  function vendorOptions(selected) { return `<option value="">Pilih vendor</option>${state.vendors.map((item) => option(item.id, `${item.vendorCode} — ${item.vendorName || item.vendorCode}`, selected)).join("")}`; }
  function categoryOptions(selected) { return [["inHouse", "Buat internal"], ["Purchase", "Beli material / part"], ["Vendor", "Proses outsource"]].map(([value, label]) => option(value, label, selected)).join(""); }
  function machineSpecifications() { const specs = new Map(); state.machines.forEach((machine) => { const code = machine.machineSpecificationCode; if (!code || specs.has(code)) return; const assets = state.machines.filter((item) => item.machineSpecificationCode === code); specs.set(code, { code, name: machine.machineSpecificationName || code, assets }); }); return [...specs.values()].sort((a, b) => a.code.localeCompare(b.code)); }
  function machineSpecificationOptions(selected) { return `<option value="">Pilih specification</option>${machineSpecifications().map((spec) => option(spec.code, `${spec.code} — ${spec.name} (${spec.assets.length} mesin)`, selected)).join("")}`; }
  function representativeMachine(process) { const code = process.machineSpecificationCode || process.machine?.machineSpecificationCode; return state.machines.find((item) => item.machineSpecificationCode === code && item.status === "Active") || state.machines.find((item) => item.machineSpecificationCode === code) || state.machines.find((item) => item.id === process.machineId) || process.machine || {}; }
  function descendantsOf(parentKey) { const found = new Set(); let changed = true; while (changed) { changed = false; state.rows.forEach((row) => { if (!found.has(keyOf(row)) && (row.parentDetailId === parentKey || found.has(row.parentDetailId))) { found.add(keyOf(row)); changed = true; } }); } return found; }
  function parentOptions(row) { const forbidden = descendantsOf(keyOf(row)); return `<option value="">Produk Utama (Root)</option>${state.rows.filter((candidate) => keyOf(candidate) !== keyOf(row) && !forbidden.has(keyOf(candidate))).map((candidate) => { const part = state.parts.find((item) => item.id === candidate.partId) || candidate.part || {}; return option(keyOf(candidate), `${part.partCode || "—"} — ${part.partName || ""}`, row.parentDetailId); }).join("")}`; }
  function levelOf(row) { let level = 1; let parent = state.rows.find((item) => keyOf(item) === row.parentDetailId); const visited = new Set([keyOf(row)]); while (parent && !visited.has(keyOf(parent))) { visited.add(keyOf(parent)); level += 1; parent = state.rows.find((item) => keyOf(item) === parent.parentDetailId); } return level; }
  function linkedBom(row, recordNoReg = state.record?.noReg) { return (row.part?.mbomHeaders || []).find((bom) => bom.noReg !== recordNoReg && !bom.isDeleted) || null; }
  function costingDate() { const value = document.getElementById("bom-table-effective")?.value || state.record?.effectiveDate; const parsed = value ? new Date(value) : new Date(); return Number.isNaN(parsed.getTime()) ? new Date() : parsed; }
  function priceValue(record) { const direct = Number(record?.unitPrice); if (Number.isFinite(direct) && direct >= 0 && record?.unitPrice !== null) return direct; const at = costingDate(); for (let index = at.getMonth(); index >= 0; index -= 1) { const value = Number(record?.[MONTHS[index]]); if (value > 0) return value; } return 0; }
  function toIdr(value, currencyCode) { if (!value) return 0; if (!currencyCode || currencyCode === "IDR") return Number(value); const currency = state.currencies.find((item) => item.currencyCode === currencyCode); return Number(value) * Number(currency?.exchangeRate || 1); }
  function latest(records) { const at = costingDate(); const temporal = records.filter((row) => row.effectiveFrom && row.isActive !== false && new Date(row.effectiveFrom) <= at && (!row.effectiveUntil || new Date(row.effectiveUntil) >= at)).sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)); if (temporal.length) return temporal[0]; return records.filter((row) => row.isActive !== false && !row.effectiveFrom && Number(row.pricingYear || 0) <= at.getFullYear()).sort((a, b) => Number(b.pricingYear || 0) - Number(a.pricingYear || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).find((row) => priceValue(row) > 0 || (row.details || []).some((detail) => priceValue(detail) > 0)); }
  function selectedMaterialForm(row) {
    const formId = row.materialScheme === "ALTERNATIVE" ? row.alternateMaterialFormId : row.materialFormId;
    return state.materialForms.find((form) => form.id === formId) || null;
  }
  function customerOptions(selected) {
    return `<option value="">Pilih customer pemilik material</option>${state.customers.map((item) => option(item.id, `${item.customerCode} - ${item.customerName || item.customerCode}`, selected)).join("")}`;
  }
  function isRawMaterial(row) {
    const part = row.part || state.parts.find((item) => item.id === row.partId) || {};
    return part.itemType === "RAW" && part.rawType === "MATERIAL";
  }
  function canChooseMaterialSource(row) { return isRawMaterial(row) && row.category === "Purchase"; }
  function isCustomerSupplied(row) { return canChooseMaterialSource(row) && row.materialSupplyType === "CUSTOMER_SUPPLIED"; }
  function defaultSupplyCustomerId() {
    const customerCode = state.record?.part?.customerCode || state.record?.part?.customerCodes?.[0];
    return state.customers.find((item) => item.customerCode === customerCode)?.id || null;
  }
  function purchasePackageCode(form) {
    if (!form) return "";
    if (form.defaultPurchaseUomCode) return String(form.defaultPurchaseUomCode).toUpperCase();
    const value = String(form.formCode || form.symbol || "").trim().toUpperCase();
    return ({ C: "COIL", S: "SHEET", P: "PCS", PIECES: "PCS" })[value] || value;
  }
  function directPrice(row) {
    if (isCustomerSupplied(row)) return { value: 0, found: true, kind: "material", source: null, customerSupplied: true };
    const part = row.part || state.parts.find((item) => item.id === row.partId) || {};
    const supplierId = row.supplierId || part.supplierId || null;
    const partPrice = latest(state.partPrices.filter((item) => item.partId === row.partId && (!supplierId || item.supplierId === supplierId))); const partValue = priceValue(partPrice);
    if (partValue > 0) return { value: toIdr(partValue, partPrice.currencyCode), found: true, kind: "purchase", source: partPrice };
    const material = part.material || {}; const formSymbol = selectedMaterialForm(row)?.symbol || null;
    const materialCandidates = state.materialPrices.filter((item) => {
      if (supplierId && item.supplierId !== supplierId) return false;
      if (item.materialId) return item.materialId === part.materialId;
      return item.materialGradeId === material.materialGradeId
        && item.materialSubstanceId === material.materialSubstanceId
        && Number(item.thickness || 0) === Number(material.thickness || 0)
        && (!item.CSP || item.CSP === formSymbol);
    }).sort((a, b) => Number(Boolean(b.materialId)) - Number(Boolean(a.materialId)));
    const materialPrice = latest(materialCandidates); const materialValue = priceValue(materialPrice);
    if (materialValue > 0) return { value: toIdr(materialValue, materialPrice.currencyCode), found: true, kind: "material", source: materialPrice };
    const hasMaterialMaster = Boolean(part.materialId || material.materialGradeId || material.materialSubstanceId);
    return { value: 0, found: false, kind: hasMaterialMaster ? "material" : "purchase", source: null };
  }
  function purchaseMaterialInfo(row) {
    const part = row.part || state.parts.find((item) => item.id === row.partId) || {};
    if (row.category !== "Purchase" && part.itemType !== "RAW") return null;
    const price = directPrice(row); const bomQty = Math.max(0, Number(row.qty || 0));
    const weightQty = price.kind === "material" && Number(row.grossWeight || 0) > 0;
    return {
      ...price,
      priceQty: weightQty ? bomQty * Number(row.grossWeight) : bomQty,
      qtyUnit: weightQty ? "kg" : row.uomCode || "unit",
      sourceSlug: price.kind === "material" ? "material-price-lists" : "part-price-lists",
      prefill: price.kind === "material" ? {
        materialId: part.materialId || "",
        materialSubstanceId: part.material?.materialSubstanceId || "",
        materialGradeId: part.material?.materialGradeId || "",
        supplierId: row.supplierId || part.supplierId || "",
        thickness: part.material?.thickness ?? "",
        CSP: selectedMaterialForm(row)?.symbol || part.material?.CSP || "",
        purchasePackageUomCode: purchasePackageCode(selectedMaterialForm(row)) || part.material?.defaultPurchaseUomCode || part.material?.materialForm || "",
        uomCode: part.material?.defaultPurchaseUomCode || (weightQty ? "KG" : row.uomCode || ""),
      } : {
        partId: row.partId || part.id || "",
        supplierId: row.supplierId || part.supplierId || "",
        uomCode: part.purchaseUomCode || row.uomCode || "",
      },
    };
  }
  function priceListLink(info) {
    if (!info) return "";
    if (info.customerSupplied) return "";
    if (info.source?.id) {
      const href = `/master-data/${info.sourceSlug}/${encodeURIComponent(info.source.id)}/edit?key=${encodeURIComponent(info.source.id)}`;
      return `<a class="bom-cost-source-link" href="${href}" target="_blank" rel="noopener">Buka Price List</a>`;
    }
    const params = new URLSearchParams({
      ...Object.fromEntries(Object.entries(info.prefill || {}).filter(([, value]) => value !== "" && value != null)),
      effectiveFrom: document.getElementById("bom-table-effective")?.value || new Date().toISOString().slice(0, 10),
      returnTo: location.pathname,
      source: "BOM",
    });
    return `<a class="bom-cost-source-link" href="/master-data/${info.sourceSlug}/new?${params.toString()}">+ Tambah Harga</a>`;
  }
  function purchaseMaterialCells(row) {
    if (row.category === "Vendor") {
      const vendorRoutes = (row.mbomProcesses || []).filter((process) => String(process.routingMode || "INHOUSE").toUpperCase() === "VENDOR");
      const summary = vendorRoutes.length
        ? vendorRoutes.map((process) => {
          const master = processMaster(process); const vendor = state.vendors.find((item) => item.id === process.vendorId) || process.vendor || {};
          return `${master.processCode || "Proses"}: ${vendor.vendorCode || "pilih vendor"}`;
        }).join(" · ")
        : "Belum ada vendor routing";
      return `<td><button class="bom-vendor-routing-card" type="button" data-edit-process><small>Vendor dipilih per proses</small><strong>${escapeHtml(summary)}</strong><span>Buka Routing untuk memilih vendor code dan harga</span></button></td><td class="bom-not-applicable">Per proses</td>`;
    }
    const info = purchaseMaterialInfo(row);
    if (!info) return '<td class="bom-not-applicable">—</td><td class="bom-not-applicable">—</td>';
    const customerSupplied = isCustomerSupplied(row);
    const price = info.found ? money(info.value) : "—";
    const quantity = Number(info.priceQty || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
    const qtyCaption = info.kind === "material" ? "BOM Qty × Gross Weight" : "Mengikuti Qty BOM";
    const supplySelect = canChooseMaterialSource(row) ? `<label class="bom-price-partner"><small>Sumber material</small><select class="form-select" data-field="materialSupplyType">${option("SUPPLIER_PURCHASE", "Beli ke supplier", row.materialSupplyType || "SUPPLIER_PURCHASE")}${option("CUSTOMER_SUPPLIED", "Disuplai customer", row.materialSupplyType)}</select></label>` : "";
    const partnerSelect = customerSupplied
      ? `<label class="bom-price-partner"><small>Customer pemilik material</small><select class="form-select" data-field="supplyCustomerId">${customerOptions(row.supplyCustomerId || defaultSupplyCustomerId())}</select></label>`
      : `<label class="bom-price-partner"><small>Supplier harga default</small><select class="form-select" data-field="supplierId">${supplierOptions(row.supplierId || row.part?.supplierId)}</select></label>`;
    const priceCaption = customerSupplied ? "Nilai Rp0 valid · tidak dibuat Purchase Suggestion / PR / PO" : (info.found ? "Harga default partner terpilih" : "Price list partner belum tersedia");
    return `<td>${supplySelect}${partnerSelect}<strong class="bom-purchase-price">${price}</strong><small class="bom-hour-unit">${priceCaption}</small>${priceListLink(info)}</td><td><strong class="bom-price-qty">${quantity}</strong><small class="bom-hour-unit">${escapeHtml(info.qtyUnit)} · ${qtyCaption}</small></td>`;
  }
  function machineCostPerSecond(process) {
    if (String(process.routingMode || "INHOUSE").toUpperCase() === "VENDOR") return { value: 0, found: false };
    const machine = representativeMachine(process);
    const effectiveRate = latest(state.machineCostRates.filter((item) => item.machineId === machine.id));
    const seconds = Number(process.cycleTime || 0); const rate = toIdr(Number(effectiveRate?.unitPrice ?? machine.costingRate ?? 0), effectiveRate?.currencyCode || machine.currencyCode);
    if (!(rate > 0)) return { value: 0, found: false };
    const type = String(effectiveRate?.costingRateType || machine.costingRateType || "PER_HOUR").toUpperCase();
    if (type === "PER_SECOND") return { value: rate, found: true };
    if (type === "PER_MINUTE") return { value: rate / 60, found: true };
    if (type === "PER_CYCLE") return { value: seconds > 0 ? rate / seconds : 0, found: seconds > 0 };
    return { value: rate / 3600, found: true };
  }
  function processMaster(process) { return process.process || state.processes.find((item) => item.id === process.processId) || {}; }
  function vendorProcessMatches(detail, process) {
    const master = processMaster(process);
    const detailCode = String(detail?.vendorProcess?.vendorProcessCode || "").trim().toLowerCase();
    const processCode = String(master.processCode || "").trim().toLowerCase();
    if (detailCode && processCode) return detailCode === processCode;
    const detailName = String(detail?.vendorProcess?.vendorProcessName || "").trim().toLowerCase();
    const processName = String(master.processName || "").trim().toLowerCase();
    return Boolean(detailName && processName && detailName === processName);
  }
  function vendorProcessPrice(process, row) {
    if (String(process.routingMode || "INHOUSE").toUpperCase() !== "VENDOR" || !process.vendorId) return { value: 0, found: false, kind: "vendor-process", source: null, detail: null };
    const eligible = state.vendorPrices.filter((item) => item.vendorId === process.vendorId
      && (!item.partId || !row?.partId || item.partId === row.partId)
      && (item.details || []).some((detail) => vendorProcessMatches(detail, process)));
    const exact = latest(eligible.filter((item) => item.partId === row?.partId)) || latest(eligible);
    const detail = (exact?.details || []).find((item) => vendorProcessMatches(item, process)) || null;
    const value = priceValue(detail);
    return { value: toIdr(value, exact?.currencyCode), found: value > 0, kind: "vendor-process", source: exact || null, detail };
  }
  function vendorProcessMaster(process) {
    const code = String(processMaster(process).processCode || "").trim().toLowerCase();
    return state.vendorProcesses.find((item) => String(item.vendorProcessCode || "").trim().toLowerCase() === code) || null;
  }
  function eligibleVendors(process, row) {
    const master = vendorProcessMaster(process);
    const allowedIds = new Set(master?.vendorIds || (master?.vendors || []).map((vendor) => vendor.id));
    return state.vendors
      .filter((vendor) => allowedIds.has(vendor.id) && vendor.isDeleted !== true && vendor.status !== "Inactive")
      .map((vendor) => ({ vendor, rate: vendorProcessPrice({ ...process, vendorId: vendor.id }, row) }))
      .sort((left, right) => Number(right.rate.found) - Number(left.rate.found) || String(left.vendor.vendorCode || "").localeCompare(String(right.vendor.vendorCode || "")));
  }
  function eligibleVendorOptions(process, row) {
    const candidates = eligibleVendors(process, row);
    const placeholder = vendorProcessMaster(process) ? "Pilih vendor code" : "Master proses vendor belum tersedia";
    return `<option value="">${placeholder}</option>${candidates.map(({ vendor, rate }) => option(vendor.id, `${vendor.vendorCode} — ${vendor.vendorName || vendor.vendorCode} | ${rate.found ? `${money(rate.value)} / pcs` : "harga belum ada"}`, process.vendorId)).join("")}`;
  }
  function autoSelectEligibleVendor(process, row) {
    if (String(process.routingMode || "INHOUSE").toUpperCase() !== "VENDOR") return;
    const candidates = eligibleVendors(process, row);
    if (process.vendorId && candidates.some(({ vendor }) => vendor.id === process.vendorId)) return;
    process.vendorId = candidates.length === 1 ? candidates[0].vendor.id : null;
    process.vendor = candidates.length === 1 ? candidates[0].vendor : null;
  }
  function machineProcessCost(process, row = null) {
    if (String(process.routingMode || "INHOUSE").toUpperCase() === "VENDOR") return vendorProcessPrice(process, row || editingRow());
    const seconds = Number(process.cycleTime || 0); const perSecond = machineCostPerSecond(process);
    if (!(seconds > 0) || !perSecond.found) return { value: 0, found: false };
    return { value: perSecond.value * seconds, found: true };
  }
  function machineRateDisplay(process) {
    const machine = representativeMachine(process);
    const effectiveRate = latest(state.machineCostRates.filter((item) => item.machineId === machine.id));
    const rate = Number(effectiveRate?.unitPrice ?? machine.costingRate ?? 0); const type = String(effectiveRate?.costingRateType || machine.costingRateType || "PER_HOUR").toUpperCase();
    const unit = { PER_SECOND: "/ detik", PER_MINUTE: "/ menit", PER_HOUR: "/ jam", PER_CYCLE: "/ cycle" }[type] || "/ jam";
    return { value: toIdr(rate, effectiveRate?.currencyCode || machine.currencyCode), unit, found: rate > 0 };
  }
  function machineMasterLink(machine, label = "") {
    if (!machine?.id) return "";
    const text = label || machine.machineCode || machine.machineName || "Master Machine";
    return `<a class="bom-cost-source-link" href="/master-data/machines/${encodeURIComponent(machine.id)}/edit?key=${encodeURIComponent(machine.machineCode || machine.id)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
  }
  function rowMachineLinks(processes) {
    const machines = new Map();
    (processes || []).forEach((process) => {
      const machine = representativeMachine(process);
      if (machine?.id) machines.set(machine.id, machine);
    });
    return machines.size
      ? `<small class="bom-cost-source-list">Rate: ${[...machines.values()].map((machine) => machineMasterLink(machine, machine.machineCode || machine.machineName)).join(", ")}</small>`
      : '<small class="bom-hour-unit">Machine specification belum dipilih</small>';
  }
  function processEstimate(row) { return (row.mbomProcesses || []).reduce((result, process) => { const cost = machineProcessCost(process, row); const perSecond = machineCostPerSecond(process); const vendorMode = String(process.routingMode || "INHOUSE").toUpperCase() === "VENDOR"; result.value += cost.value; if (vendorMode) result.vendor += cost.value; result.perSecond += perSecond.value; if (!vendorMode) result.seconds += Number(process.cycleTime || 0); result.lines += 1; if (cost.found) result.covered += 1; return result; }, { value: 0, vendor: 0, perSecond: 0, seconds: 0, lines: 0, covered: 0 }); }
  function assignOccurrenceCodes() { const groups = new Map(); state.rows.forEach((row, rowIndex) => (row.mbomProcesses || []).forEach((process, processIndex) => { if (!process.processId || process.isDeleted === true) return; const items = groups.get(process.processId) || []; items.push({ process, rowIndex, processIndex }); groups.set(process.processId, items); })); groups.forEach((items, processId) => { items.sort((a, b) => b.rowIndex - a.rowIndex || Number(a.process.sequence || 0) - Number(b.process.sequence || 0) || a.processIndex - b.processIndex); const code = state.processes.find((process) => process.id === processId)?.processCode || "PROCESS"; items.forEach((item, index) => { item.process.occurrenceCode = items.length === 1 ? code : `${code}-${index + 1}`; }); }); }
  function assignRoutingNumbers() {
    const rowByKey = new Map(state.rows.map((row) => [keyOf(row), row])); const operationsByRow = new Map(); const roots = [];
    state.rows.forEach((row, rowIndex) => {
      const operations = (row.mbomProcesses || []).map((process, processIndex) => ({ process, processIndex }))
        .filter((item) => item.process.processId && item.process.isDeleted !== true)
        .sort((a, b) => Number(a.process.sequence || 0) - Number(b.process.sequence || 0) || a.processIndex - b.processIndex)
        .map((item) => ({ ...item, rowIndex, rowKey: keyOf(row), children: [] }));
      operationsByRow.set(keyOf(row), operations);
    });
    const ancestorOperation = (row) => { const visited = new Set(); let parentKey = row.parentDetailId || null; while (parentKey && !visited.has(parentKey)) { visited.add(parentKey); const operations = operationsByRow.get(parentKey) || []; if (operations.length) return operations[operations.length - 1]; parentKey = rowByKey.get(parentKey)?.parentDetailId || null; } return null; };
    state.rows.forEach((row) => { const operations = operationsByRow.get(keyOf(row)) || []; if (!operations.length) return; for (let index = 1; index < operations.length; index += 1) operations[index - 1].children.push(operations[index]); const ancestor = ancestorOperation(row); if (ancestor) ancestor.children.push(operations[0]); else roots.push(operations[0]); });
    const compare = (a, b) => a.rowIndex - b.rowIndex || Number(a.process.sequence || 0) - Number(b.process.sequence || 0) || a.processIndex - b.processIndex; const visited = new Set();
    const numberOperation = (operation, major, branches = []) => { if (!operation || visited.has(operation)) return; visited.add(operation); operation.process.routingNumber = [major, ...branches].join("."); operation.children.sort(compare); if (operation.children.length === 1) numberOperation(operation.children[0], major + 1, branches); else operation.children.forEach((child, index) => numberOperation(child, major + 1, [...branches, index + 1])); };
    roots.sort(compare); if (roots.length === 1) numberOperation(roots[0], 1); else roots.forEach((root, index) => numberOperation(root, 1, [index + 1]));
  }
  const emptyEstimate = () => ({ total: 0, material: 0, process: 0, vendor: 0, lines: 0, covered: 0, rowCosts: new Map() });
  function addScaled(target, source, factor) { target.total += source.total * factor; target.material += source.material * factor; target.process += source.process * factor; target.vendor += source.vendor * factor; target.lines += source.lines; target.covered += source.covered; }
  function rowsForRecord(record) { return record.noReg === state.record?.noReg ? state.rows : (record.details || []).filter((row) => !row.isDeleted); }
  function estimateRecord(record, stack = new Set()) {
    if (!record || stack.has(record.noReg)) return emptyEstimate(); const nextStack = new Set(stack).add(record.noReg); const rows = rowsForRecord(record); const byParent = new Map(); rows.forEach((row) => { const list = byParent.get(row.parentDetailId || null) || []; list.push(row); byParent.set(row.parentDetailId || null, list); });
    const estimateNode = (row) => {
      const result = emptyEstimate(); const qty = Math.max(0, Number(row.qty || 0)); const routing = processEstimate(row); result.process += routing.value * qty; result.vendor += routing.vendor * qty; result.total += routing.value * qty; result.lines += routing.lines; result.covered += routing.covered;
      const childHeader = linkedBom(row, record.noReg); const childRecord = childHeader ? state.bomByNoReg.get(childHeader.noReg) : null;
      if (childRecord) { const child = estimateRecord(childRecord, nextStack); addScaled(result, child, qty); }
      else if (row.category === "Purchase" || row.part?.itemType === "RAW") { const price = directPrice(row); const pricedQty = price.kind === "material" && Number(row.grossWeight || 0) > 0 ? qty * Number(row.grossWeight) : qty; const amount = price.value * pricedQty; result.total += amount; result.material += amount; result.lines += 1; if (price.found) result.covered += 1; }
      (byParent.get(keyOf(row)) || []).forEach((childRow) => { const child = estimateNode(childRow); result.total += child.total * qty; result.material += child.material * qty; result.process += child.process * qty; result.vendor += child.vendor * qty; result.lines += child.lines; result.covered += child.covered; child.rowCosts.forEach((value, key) => result.rowCosts.set(key, value)); }); result.rowCosts.set(keyOf(row), result.total); return result;
    };
    const total = emptyEstimate(); (byParent.get(null) || []).forEach((rootRow) => { const result = estimateNode(rootRow); total.total += result.total; total.material += result.material; total.process += result.process; total.vendor += result.vendor; total.lines += result.lines; total.covered += result.covered; result.rowCosts.forEach((value, key) => total.rowCosts.set(key, value)); }); return total;
  }
  function updateEstimateSummary(estimate) { document.getElementById("bom-estimate-lead").textContent = "OR-TOOLS CP-SAT"; document.getElementById("bom-estimate-total").textContent = money(estimate.total); document.getElementById("bom-estimate-material").textContent = money(estimate.material); document.getElementById("bom-estimate-process").textContent = money(estimate.process); document.getElementById("bom-estimate-coverage").textContent = `${estimate.covered} / ${estimate.lines}`; const warning = document.getElementById("bom-estimate-warning"); warning.textContent = estimate.lines > estimate.covered ? `${estimate.lines - estimate.covered} harga/rate belum tersedia di master data` : "Seluruh harga dan machine rate tersedia"; warning.classList.toggle("complete", estimate.lines === estimate.covered); }

  function localGraphValidation() {
    const errors = []; const warnings = []; const byKey = new Map(state.rows.map((row) => [String(keyOf(row)), row])); const edges = new Set();
    for (const row of state.rows) {
      const id = String(keyOf(row)); const parentId = row.parentDetailId ? String(row.parentDetailId) : null; const part = row.part || state.parts.find((item) => item.id === row.partId) || {};
      if (parentId === id) errors.push({ code: "BOM_SELF_PARENT", message: `${part.partCode || id} tidak boleh menjadi parent dirinya sendiri.` });
      if (parentId && !byKey.has(parentId)) errors.push({ code: "BOM_PARENT_NOT_FOUND", message: `Parent ${parentId} untuk ${part.partCode || id} tidak ditemukan.` });
      const edge = `${parentId || "ROOT"}|${row.partId}|${String(row.category || "").toUpperCase()}|${row.uomCode || ""}`;
      if (edges.has(edge)) warnings.push({ code: "BOM_DUPLICATE_EDGE", message: `${part.partCode || id} muncul dua kali pada parent/kategori yang sama.` }); else edges.add(edge);
      const sequences = new Set();
      for (const process of row.mbomProcesses || []) { const sequence = Number(process.sequence); if (sequences.has(sequence)) errors.push({ code: "BOM_PROCESS_SEQUENCE_AMBIGUOUS", message: `Sequence ${sequence} pada ${part.partCode || id} dipakai lebih dari sekali.` }); sequences.add(sequence); }
      const visiting = new Set([id]); let cursor = parentId;
      while (cursor && byKey.has(cursor)) { if (visiting.has(cursor)) { errors.push({ code: "BOM_CYCLE", message: `Cycle parent-child terdeteksi pada ${part.partCode || id}.` }); break; } visiting.add(cursor); cursor = byKey.get(cursor)?.parentDetailId ? String(byKey.get(cursor).parentDetailId) : null; }
    }
    return { valid: errors.length === 0, errors, warnings, issueCount: errors.length + warnings.length };
  }

  function renderGraphValidation(validation = localGraphValidation()) {
    const node = document.getElementById("bom-graph-validation"); if (!node) return; const issues = [...(validation.errors || []), ...(validation.warnings || [])];
    node.classList.remove("d-none", "alert-danger", "alert-warning", "alert-success");
    node.classList.add(validation.valid ? (issues.length ? "alert-warning" : "alert-success") : "alert-danger");
    node.innerHTML = `<strong>${validation.valid ? "Struktur BOM dapat di-explode" : "Explode BOM diblokir"}</strong> · ${issues.length ? `${issues.length} temuan` : "tidak ada struktur ambigu"}${issues.length ? `<ul class="mb-0 mt-2">${issues.slice(0, 8).map((issue) => `<li><b>${escapeHtml(issue.code)}</b> · ${escapeHtml(issue.message)}</li>`).join("")}</ul>` : ""}`;
  }

  function childBomCostCell(row, estimateCache) {
    const childHeader = linkedBom(row); const childRecord = childHeader ? state.bomByNoReg.get(childHeader.noReg) : null;
    if (!childHeader) return '<td class="bom-not-applicable">—</td>';
    if (!childRecord) return `<td><strong class="bom-cost-missing">Cost belum dimuat</strong><a class="bom-cost-source-link" href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(childHeader.noReg)}/edit-table">Buka MBOM turunan</a></td>`;
    const estimate = estimateCache.get(childRecord.noReg) || estimateRecord(childRecord, new Set(state.record?.noReg ? [state.record.noReg] : [])); estimateCache.set(childRecord.noReg, estimate); const qty = Math.max(0, Number(row.qty || 0)); const extendedCost = estimate.total * qty;
    const coverage = estimate.lines > estimate.covered ? `<small class="bom-cost-missing">${estimate.lines - estimate.covered} harga/rate belum lengkap</small>` : '<small class="bom-cost-complete">Cost master lengkap</small>';
    return `<td><strong class="bom-child-cost">${money(extendedCost)}</strong><small class="bom-hour-unit">${money(estimate.total)} / unit × ${qty.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</small>${coverage}<a class="bom-cost-source-link" href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(childHeader.noReg)}/edit-table">Sumber: ${escapeHtml(childHeader.noReg)}</a></td>`;
  }

  function applyFrozenColumns() {
    if (!detailTable || !freezeCountInput) return;
    const count = Math.max(0, Math.min(Number(freezeCountInput.value || 0), 6)); const headerCells = [...detailTable.tHead?.rows?.[0]?.cells || []];
    detailTable.querySelectorAll(".bom-frozen-column, .bom-frozen-edge").forEach((cell) => { cell.classList.remove("bom-frozen-column", "bom-frozen-edge"); cell.style.removeProperty("--bom-frozen-left"); });
    let left = 0;
    headerCells.slice(0, count).forEach((headerCell, index) => {
      const cells = [headerCell, ...[...detailTable.tBodies].flatMap((body) => [...body.rows].map((row) => row.cells[index]).filter(Boolean))];
      cells.forEach((cell) => { cell.classList.add("bom-frozen-column"); cell.style.setProperty("--bom-frozen-left", `${left}px`); });
      left += headerCell.getBoundingClientRect().width;
      if (index === count - 1) cells.forEach((cell) => cell.classList.add("bom-frozen-edge"));
    });
  }
  function scheduleFrozenColumns() { window.requestAnimationFrame(applyFrozenColumns); }

  function materialConsumptionSummary(row) {
    const part = row.part || state.parts.find((item) => item.id === row.partId) || {};
    if (part.itemType !== "RAW" || part.rawType !== "MATERIAL") return "";
    const material = part.material || {}; const spec = material.spec || material.materialGrade || material.materialCode || "Material belum terhubung";
    const thickness = row.materialThickness ?? material.thickness; const width = row.materialWidth ?? material.width; const pitch = row.materialPitch; const csp = selectedMaterialForm(row)?.symbol || "";
    const thicknessText = thickness !== null && thickness !== undefined ? Number(thickness).toLocaleString("id-ID", { maximumFractionDigits: 2 }) : null;
    const dimensions = [thicknessText ? `t${thicknessText}` : null, width !== null && width !== undefined ? Number(width) : null, pitch !== null && pitch !== undefined ? Number(pitch) : null, csp || null].filter((value) => value !== null && value !== "").join(" × ");
    const detail = part.materialId ? `${spec}${dimensions ? ` ${dimensions}` : ""}` : "Material belum terhubung ke Master Material";
    const activeScheme = row.materialScheme === "ALTERNATIVE" ? "Alternatif" : "Default"; const activeCavity = row.materialScheme === "ALTERNATIVE" ? row.alternateMaterialCavity : row.materialCavity;
    return `<button class="bom-table-material-consumption" type="button" data-edit-material><b>${escapeHtml(detail)}</b><small>${activeScheme} · Cavity ${Number(activeCavity || 1)} · Gross ${Number(row.grossWeight || 0).toFixed(2)} kg/pcs</small><em>Edit konsumsi</em></button>`;
  }

  function renderRows() {
    assignRoutingNumbers();
    assignOccurrenceCodes();
    queueMicrotask(() => { rowsTarget.querySelectorAll("tr[data-row-key]").forEach((rowElement) => { const row = state.rows.find((item) => String(keyOf(item)) === rowElement.dataset.rowKey); const summary = row ? materialConsumptionSummary(row) : ""; if (summary) rowElement.children[1]?.insertAdjacentHTML("beforeend", summary); }); scheduleFrozenColumns(); });
    const estimate = estimateRecord(state.record); const childEstimateCache = new Map(); updateEstimateSummary(estimate); renderGraphValidation();
    rowsTarget.innerHTML = state.rows.length ? state.rows.map((row) => {
      const childBom = linkedBom(row); const processes = row.mbomProcesses || []; const routing = processEstimate(row); const part = row.part || state.parts.find((item) => item.id === row.partId) || {};
      return `<tr data-row-key="${escapeAttr(keyOf(row))}"><td><span class="bom-level-pill">${levelOf(row)}</span></td><td><select class="form-select" data-field="partId">${partOptions(row.partId)}</select>${childBom ? `<a class="bom-owned-bom-link" href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(childBom.noReg)}/edit-table">Edit MBOM turunan · ${escapeHtml(childBom.noReg)}</a>` : ""}</td><td><strong class="bom-part-number">${escapeHtml(part.partNumber || "—")}</strong><small class="bom-hour-unit">${part.partCode ? `Code: ${escapeHtml(part.partCode)}` : "Part Number belum diisi"}</small></td><td><input class="form-control" data-field="qty" type="number" min="0.0001" step="0.0001" value="${Number(row.qty || 0)}"></td><td><select class="form-select" data-field="uomCode">${uomOptions(row.uomCode)}</select></td><td><select class="form-select" data-field="parentDetailId">${parentOptions(row)}</select></td><td><select class="form-select" data-field="category">${categoryOptions(row.category)}</select></td><td><select class="form-select" data-field="assemblyPolicyOverride">${["DEFAULT", "INLINE", "SUB_ASSEMBLY"].map((value) => option(value, value, row.assemblyPolicyOverride)).join("")}</select></td><td><div class="bom-lead-time-input"><input class="form-control" data-field="leadTime" type="number" min="0" step="0.01" value="${Number(row.leadTime || 0)}"><select class="form-select" data-field="leadTimeUnit">${leadTimeUnitOptions(row.leadTimeUnit)}</select></div></td><td><button class="bom-process-button" type="button" data-edit-process>${processes.length ? `${processes.length} proses` : "＋ Proses"}</button>${processes.slice(0, 2).map((item) => { const cost = machineProcessCost(item, row); const vendorMode = String(item.routingMode || "INHOUSE").toUpperCase() === "VENDOR"; const vendor = state.vendors.find((entry) => entry.id === item.vendorId) || item.vendor || {}; return `<small class="bom-process-mini">${escapeHtml(item.routingNumber || "-")} · ${escapeHtml(item.occurrenceCode || item.process?.processCode || state.processes.find((process) => process.id === item.processId)?.processCode || "Process")} · ${vendorMode ? `${escapeHtml(vendor.vendorCode || "vendor belum dipilih")} · ${money(cost.value)} / pcs` : `${Number(item.cycleTime || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} dtk · ${money(cost.value)}`}</small>`; }).join("")}</td>${purchaseMaterialCells(row)}${childBomCostCell(row, childEstimateCache)}<td><button class="bom-source-metric" type="button" data-edit-process title="Buka Routing MBOM"><strong class="bom-cycle-time">${routing.seconds.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</strong><small>detik in-house / unit · Edit routing</small></button></td><td><strong class="bom-machine-rate">${moneyPerSecond(routing.perSecond)}</strong><small class="bom-hour-unit">rate mesin / detik; vendor per pcs</small>${rowMachineLinks(processes.filter((item) => String(item.routingMode || "INHOUSE").toUpperCase() !== "VENDOR"))}</td><td><strong class="bom-machine-cost">${money(routing.value)}</strong><small class="bom-hour-unit">Mesin / unit + vendor / pcs</small></td><td><input class="form-control" data-field="notes" type="text" value="${escapeAttr(row.notes || "")}"></td><td><button class="bom-table-row-delete" type="button" data-delete-row title="Hapus baris">×</button></td></tr>`;
    }).join("") : '<tr><td colspan="18" class="text-center py-4">Belum ada komponen. Klik Tambah Baris.</td></tr>';
  }
  async function loadLinkedBoms(record, visited = new Set()) { if (!record || visited.has(record.noReg)) return; visited.add(record.noReg); state.bomByNoReg.set(record.noReg, record); for (const row of (record.details || []).filter((item) => !item.isDeleted)) { const child = linkedBom(row, record.noReg); if (!child || state.bomByNoReg.has(child.noReg)) continue; const childRecord = await fetchJson(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(child.noReg)}`); state.bomByNoReg.set(child.noReg, childRecord); await loadLinkedBoms(childRecord, visited); } }

  function normalizeLegacyVendorRows(rows) {
    let migrated = 0;
    rows.forEach((row) => {
      if (row.category !== "Vendor" || !row.vendorId) return;
      const processes = (row.mbomProcesses || []).filter((process) => process.isDeleted !== true);
      const hasExplicitVendorRoute = processes.some((process) => String(process.routingMode || "INHOUSE").toUpperCase() === "VENDOR");
      processes.forEach((process) => {
        const vendorRoute = String(process.routingMode || "INHOUSE").toUpperCase() === "VENDOR";
        if (!hasExplicitVendorRoute || vendorRoute) {
          process.routingMode = "VENDOR";
          process.vendorId = process.vendorId || row.vendorId;
          process.machineId = null;
          process.machine = null;
          process.machineSpecificationCode = "";
          process.alternativeMachineIds = [];
          process.cycleTime = 0;
        }
      });
      row.vendorId = null;
      migrated += 1;
    });
    return migrated;
  }

  async function initialize() {
    try {
      const urls = ["parts", "uom", "processes", "machines", "machine-cost-rates", "material-forms", "part-price-lists", "material-price-lists", "vendor-price-lists", "vendor-processes", "suppliers", "customers", "vendors", "currencies"];
      const [record, ...payloads] = await Promise.all([fetchJson(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(config.recordKey)}`), ...urls.map((slug, index) => index < 4 ? fetchJson(`/master-data/api/${slug}?start=0&length=500&isDeleted=false`) : optionalList(`/master-data/api/${slug}?start=0&length=500&isDeleted=false`))]);
      [state.parts, state.uoms, state.processes, state.machines, state.machineCostRates, state.materialForms, state.partPrices, state.materialPrices, state.vendorPrices, state.vendorProcesses, state.suppliers, state.customers, state.vendors, state.currencies] = payloads.map((payload) => payload.data || payload.items || []); state.parts = state.parts.filter((part) => part.canUseInBom !== false); state.customers = state.customers.filter((customer) => customer.status !== "Inactive" && customer.isDeleted !== true); state.record = record; state.graphValidation = record.graphValidation || null;
      const sourceRows = (record.details || []).filter((detail) => !detail.isDeleted).map((detail) => ({ ...detail, materialSupplyType: detail.materialSupplyType || "SUPPLIER_PURCHASE", supplierId: detail.supplierId || detail.part?.supplierId || null, clientKey: detail.id || newKey(), mbomProcesses: detail.mbomProcesses || [] })); const migratedVendorRows = normalizeLegacyVendorRows(sourceRows); const sourceByKey = new Map(sourceRows.map((row) => [keyOf(row), row])); const boundaryKeys = new Set(sourceRows.filter((row) => row.part?.itemType === "FG" || (row.part?.mbomHeaders || []).some((bom) => bom.noReg !== record.noReg && !bom.isDeleted)).map(keyOf)); const ownedByChildBom = (row) => { let parent = sourceByKey.get(row.parentDetailId); const visited = new Set(); while (parent && !visited.has(keyOf(parent))) { visited.add(keyOf(parent)); if (boundaryKeys.has(keyOf(parent))) return true; parent = sourceByKey.get(parent.parentDetailId); } return false; };
      state.rows = sourceRows.filter((row) => !ownedByChildBom(row)); state.omittedRows = sourceRows.filter(ownedByChildBom); const ownedNote = document.getElementById("bom-table-owned-note"); if (state.omittedRows.length) { ownedNote.textContent = `${state.omittedRows.length} detail turunan dikelola oleh MBOM FG/sub-assembly masing-masing dan tidak diedit dari parent.`; ownedNote.classList.remove("d-none"); } const vendorNote = document.getElementById("bom-table-vendor-note"); if (migratedVendorRows) { vendorNote.textContent = `${migratedVendorRows} baris vendor format lama sudah dipindahkan ke Routing Process pada draft revisi ini. Periksa vendor code dan harga sebelum simpan.`; vendorNote.classList.remove("d-none"); }
      document.getElementById("bom-table-title").textContent = record.noReg; document.getElementById("bom-table-root").textContent = `${record.part?.partCode || "—"} — ${record.part?.partName || ""}`; document.getElementById("bom-table-uom").innerHTML = uomOptions(record.uomCode); document.getElementById("bom-table-revision").value = record.revision || 1; document.getElementById("bom-table-effective").value = todayInput(); document.getElementById("bom-table-expiry").value = ""; document.getElementById("bom-table-notes").value = record.notes || ""; document.getElementById("bom-table-revision-note").value = ""; syncRevisionMode();
      await loadLinkedBoms(record); renderRows(); if (state.graphValidation?.issueCount) renderGraphValidation(state.graphValidation);
    } catch (error) { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); }
  }

  document.getElementById("bom-table-add").addEventListener("click", () => { state.rows.push({ clientKey: newKey(), parentDetailId: null, partId: "", part: {}, qty: 1, uomCode: state.record?.uomCode || "", category: "Purchase", materialSupplyType: "SUPPLIER_PURCHASE", supplyCustomerId: null, assemblyPolicyOverride: "DEFAULT", leadTime: 0, leadTimeUnit: "HOUR", notes: "", mbomProcesses: [] }); renderRows(); });
  document.getElementById("bom-table-effective")?.addEventListener("change", renderRows);
  function syncRevisionMode() {
    const isNewRevision = document.getElementById("bom-table-revision-mode")?.value !== "correction";
    const effective = document.getElementById("bom-table-effective");
    const expiry = document.getElementById("bom-table-expiry");
    const note = document.getElementById("bom-table-revision-note");
    const currentRevision = Number(state.record?.revision || 1);
    document.getElementById("bom-table-effective-label").textContent = isNewRevision ? `Mulai Berlaku Rev ${currentRevision + 1}` : "Mulai Berlaku Rev Ini";
    document.getElementById("bom-table-revision-hint").textContent = isNewRevision
      ? `Rev ${currentRevision + 1} dibuat sebagai record baru; Rev ${currentRevision} otomatis berakhir sesaat sebelum tanggal ini.`
      : "Koreksi hanya untuk metadata/typo. Struktur yang sudah dipakai MPS wajib dibuat sebagai revisi baru.";
    note.required = isNewRevision;
    if (isNewRevision && !effective.value) effective.value = todayInput();
    if (!isNewRevision) {
      effective.value = dateInput(state.record?.effectiveDate);
      expiry.value = dateInput(state.record?.expiryDate);
    }
  }
  document.getElementById("bom-table-revision-mode")?.addEventListener("change", syncRevisionMode);
  if (freezeCountInput) {
    const savedFreezeCount = Number(localStorage.getItem(freezeStorageKey)); freezeCountInput.value = String(Number.isInteger(savedFreezeCount) && savedFreezeCount >= 0 && savedFreezeCount <= 6 ? savedFreezeCount : 3);
    freezeCountInput.addEventListener("change", () => { localStorage.setItem(freezeStorageKey, freezeCountInput.value); applyFrozenColumns(); });
    window.addEventListener("resize", scheduleFrozenColumns);
  }
  function updateRow(event) {
    const field = event.target.dataset.field;
    if (!field) return;
    const row = state.rows.find((item) => keyOf(item) === event.target.closest("tr")?.dataset.rowKey);
    if (!row) return;
    const nullableFields = ["parentDetailId", "supplierId", "supplyCustomerId", "vendorId"];
    row[field] = ["qty", "leadTime"].includes(field) ? Number(event.target.value) : event.target.value || (nullableFields.includes(field) ? null : "");
    if (field === "partId") {
      row.part = state.parts.find((part) => part.id === row.partId) || {};
      row.supplierId = row.part.supplierId || null;
      row.supplyCustomerId = null;
      row.materialSupplyType = "SUPPLIER_PURCHASE";
      row.vendorId = null;
    }
    if (field === "materialSupplyType") {
      if (row.materialSupplyType === "CUSTOMER_SUPPLIED") {
        row.supplierId = null;
        row.supplyCustomerId = row.supplyCustomerId || defaultSupplyCustomerId();
      } else {
        row.supplyCustomerId = null;
        row.supplierId = row.supplierId || row.part?.supplierId || null;
      }
    }
    if (field === "category") {
      if (row.category === "Vendor") row.supplierId = null;
      else row.vendorId = null;
      if (row.category !== "Purchase") {
        row.materialSupplyType = "SUPPLIER_PURCHASE";
        row.supplyCustomerId = null;
      }
    }
    renderRows();
  }
  rowsTarget.addEventListener("change", updateRow);
  rowsTarget.addEventListener("click", (event) => { const row = state.rows.find((item) => keyOf(item) === event.target.closest("tr")?.dataset.rowKey); if (!row) return; if (event.target.closest("[data-edit-material]")) return openMaterialDialog(row); if (event.target.closest("[data-edit-process]")) return openProcessDialog(row); const button = event.target.closest("[data-delete-row]"); if (!button) return; const remove = descendantsOf(keyOf(row)); remove.add(keyOf(row)); if (remove.size > 1 && !confirm(`Hapus baris ini beserta ${remove.size - 1} turunannya?`)) return; state.rows = state.rows.filter((item) => !remove.has(keyOf(item))); renderRows(); });
  function editingMaterialRow() { return state.rows.find((row) => keyOf(row) === state.editingMaterialKey); }
  function materialDialogGross(alternative = false) {
    const thickness = Number(document.getElementById("bom-material-thickness").value || 0); const width = Number(document.getElementById("bom-material-width").value || 0); const pitch = Number(document.getElementById(alternative ? "bom-material-alt-pitch" : "bom-material-pitch").value || 0); const cavity = Math.max(1, Number(document.getElementById(alternative ? "bom-material-alt-cavity" : "bom-material-cavity").value || 1)); const density = Number(document.getElementById("bom-material-density").value || 0);
    const gross = thickness > 0 && width > 0 && pitch > 0 && density > 0 ? thickness * width * pitch * density / cavity : 0; document.getElementById(alternative ? "bom-material-alt-gross" : "bom-material-gross").value = gross.toFixed(6); return gross;
  }
  function openMaterialDialog(row) {
    state.editingMaterialKey = keyOf(row); const part = row.part || state.parts.find((item) => item.id === row.partId) || {}; const material = part.material || {};
    document.getElementById("bom-material-dialog-title").textContent = `${part.partCode || "—"} — ${part.partName || "Raw Material"}`;
    document.getElementById("bom-material-master-name").textContent = material.materialCode ? `${material.materialCode} — ${material.materialName || material.spec || ""}` : "Material belum terhubung";
    const masterLink = document.getElementById("bom-material-master-link"); masterLink.href = material.materialCode ? `/master-data/materials/${encodeURIComponent(material.materialCode)}` : `/master-data/parts/${encodeURIComponent(part.partCode || part.id)}/edit?key=${encodeURIComponent(part.partCode || part.id)}`; masterLink.textContent = material.materialCode ? "Lihat Master" : "Hubungkan Part";
    document.getElementById("bom-material-spec").value = material.spec || material.materialGrade || ""; document.getElementById("bom-material-scheme").value = row.materialScheme || "DEFAULT"; document.getElementById("bom-material-form").innerHTML = materialFormOptions(row.materialFormId); document.getElementById("bom-material-alt-form").innerHTML = materialFormOptions(row.alternateMaterialFormId, true); document.getElementById("bom-material-csp").value = state.materialForms.find((form) => form.id === row.materialFormId)?.symbol || ""; document.getElementById("bom-material-thickness").value = row.materialThickness ?? material.thickness ?? ""; document.getElementById("bom-material-width").value = row.materialWidth ?? material.width ?? ""; document.getElementById("bom-material-pitch").value = row.materialPitch ?? ""; document.getElementById("bom-material-cavity").value = row.materialCavity || 1; document.getElementById("bom-material-density").value = row.materialDensity ?? material.density ?? ""; document.getElementById("bom-material-alt-pitch").value = row.alternateMaterialPitch ?? ""; document.getElementById("bom-material-alt-cavity").value = row.alternateMaterialCavity || 1; materialDialogGross(); materialDialogGross(true); materialDialog.showModal();
  }
  document.getElementById("bom-material-form").addEventListener("change", (event) => {
    document.getElementById("bom-material-csp").value = state.materialForms.find((form) => form.id === event.target.value)?.symbol || "";
  });
  ["bom-material-pitch", "bom-material-cavity"].forEach((id) => document.getElementById(id).addEventListener("input", () => materialDialogGross(false)));
  ["bom-material-alt-pitch", "bom-material-alt-cavity"].forEach((id) => document.getElementById(id).addEventListener("input", () => materialDialogGross(true)));
  document.getElementById("bom-material-save").addEventListener("click", () => { const row = editingMaterialRow(); const pitchInput = document.getElementById("bom-material-pitch"); const cavityInput = document.getElementById("bom-material-cavity"); const scheme = document.getElementById("bom-material-scheme").value; const defaultFormId = document.getElementById("bom-material-form").value || null; const altFormId = document.getElementById("bom-material-alt-form").value || null; const altPitch = Number(document.getElementById("bom-material-alt-pitch").value) || null; const altCavity = Math.max(1, Math.round(Number(document.getElementById("bom-material-alt-cavity").value || 1))); if (!row || !pitchInput.reportValidity() || !cavityInput.reportValidity()) return; if (!defaultFormId) return alert("Pilih Material Form default."); if (altFormId && altFormId === defaultFormId) return alert("Material Form alternatif harus berbeda dari default."); if (scheme === "ALTERNATIVE" && (!altFormId || !altPitch)) return alert("Lengkapi Material Form dan Pitch pada skema alternatif."); row.materialThickness = Number(document.getElementById("bom-material-thickness").value) || null; row.materialWidth = Number(document.getElementById("bom-material-width").value) || null; row.materialPitch = Number(pitchInput.value) || null; row.materialCavity = Math.max(1, Math.round(Number(cavityInput.value || 1))); row.materialDensity = Number(document.getElementById("bom-material-density").value) || null; row.materialFormId = defaultFormId; row.materialScheme = scheme; row.defaultGrossWeight = materialDialogGross(false); row.alternateMaterialFormId = altFormId; row.alternateMaterialPitch = altPitch; row.alternateMaterialCavity = altFormId ? altCavity : null; row.alternateGrossWeight = altFormId && altPitch ? materialDialogGross(true) : null; row.grossWeight = scheme === "ALTERNATIVE" ? Number(row.alternateGrossWeight || 0) : row.defaultGrossWeight; materialDialog.close(); renderRows(); });
  function openProcessDialog(row) { state.editingProcessKey = keyOf(row); const part = row.part || state.parts.find((item) => item.id === row.partId) || {}; document.getElementById("bom-process-title").textContent = `${part.partCode || "—"} — ${part.partName || ""}`; renderProcessRows(); processDialog.showModal(); }
  function editingRow() { return state.rows.find((row) => keyOf(row) === state.editingProcessKey); }
  function renderProcessRows() { assignRoutingNumbers(); assignOccurrenceCodes(); const row = editingRow(); const items = row?.mbomProcesses || []; processRows.innerHTML = items.length ? items.map((item, index) => { const estimate = machineProcessCost(item); const perSecond = machineCostPerSecond(item); const rate = machineRateDisplay(item); const machine = state.machines.find((entry) => entry.id === item.machineId) || item.machine || {}; return `<tr data-process-index="${index}"><td><strong class="bom-routing-number">${escapeHtml(item.routingNumber || "-")}</strong></td><td><input class="form-control" data-process-field="sequence" type="number" min="1" value="${Number(item.sequence || (index + 1) * 10)}"></td><td><select class="form-select" data-process-field="processId">${processOptions(item.processId)}</select><small class="bom-process-occurrence-inline">${escapeHtml(item.occurrenceCode || "")}</small></td><td><select class="form-select" data-process-field="machineId">${machineOptions(item.machineId)}</select></td><td><strong class="bom-machine-rate">${rate.found ? money(rate.value) : "—"}</strong><small class="bom-hour-unit">${rate.found ? rate.unit : "Rate belum ada"}</small>${machineMasterLink(machine, "Buka Master Machine")}</td><td><select class="form-select" data-process-field="alternativeMachineIds" multiple title="Mesin yang boleh dipilih PPIC jika mesin utama penuh">${state.machines.filter((entry) => entry.id !== item.machineId).map((entry) => option(entry.id, `${entry.machineCode} — ${entry.machineName || entry.machineCode}`, (item.alternativeMachineIds || []).includes(entry.id) ? entry.id : "")).join("")}</select></td><td><input class="form-control" data-process-field="cycleTime" type="number" min="0" step="0.01" value="${Number(item.cycleTime || 0)}"><small class="bom-hour-unit">Sumber: Routing MBOM ini</small></td><td><strong class="bom-machine-rate">${moneyPerSecond(perSecond.value)}</strong>${perSecond.found ? '<small class="bom-hour-unit">Rate dikonversi ke detik</small>' : '<small class="bom-cost-missing">Rate belum lengkap</small>'}</td><td><strong class="bom-machine-cost">${money(estimate.value)}</strong>${estimate.found ? '<small class="bom-hour-unit">Cycle Time × Cost / Second</small>' : '<small class="bom-cost-missing">Cycle time / rate belum lengkap</small>'}</td><td><input class="form-control" data-process-field="notes" value="${escapeAttr(item.notes || "")}"></td><td><button class="bom-table-row-delete" type="button" data-delete-process>×</button></td></tr>`; }).join("") : '<tr><td colspan="11" class="text-center py-4">Belum ada routing process.</td></tr>'; }
  function renderSpecificationProcessRows() {
    assignRoutingNumbers(); assignOccurrenceCodes();
    const row = editingRow(); const items = row?.mbomProcesses || [];
    processRows.innerHTML = items.length ? items.map((item, index) => {
      const vendorMode = String(item.routingMode || "INHOUSE").toUpperCase() === "VENDOR";
      if (!vendorMode && !item.machineSpecificationCode) item.machineSpecificationCode = item.machine?.machineSpecificationCode || state.machines.find((entry) => entry.id === item.machineId)?.machineSpecificationCode || "";
      const machine = representativeMachine(item); const estimate = machineProcessCost(item, row); const perSecond = machineCostPerSecond(item); const rate = machineRateDisplay(item); const vendorRate = vendorProcessPrice(item, row);
      const eligibleCount = state.machines.filter((entry) => entry.machineSpecificationCode === item.machineSpecificationCode && entry.status === "Active").length;
      const vendorMaster = vendorProcessMaster(item); const vendorCandidates = eligibleVendors(item, row);
      const resource = vendorMode
        ? `<select class="form-select" data-process-field="vendorId">${eligibleVendorOptions(item, row)}</select><small class="${vendorCandidates.length ? "bom-hour-unit" : "bom-cost-missing"}">${vendorMaster ? `${vendorCandidates.length} vendor aktif eligible untuk ${escapeHtml(vendorMaster.vendorProcessCode)}` : "Kode proses ini belum dibuat di Master Kode Proses Vendor"}</small>${vendorMaster ? '<a class="bom-cost-source-link" href="/master-data/vendor-processes" target="_blank" rel="noopener">Atur vendor eligible</a>' : '<a class="bom-cost-source-link" href="/master-data/vendor-processes/new" target="_blank" rel="noopener">+ Buat Kode Proses Vendor</a>'}`
        : `<select class="form-select" data-process-field="machineSpecificationCode">${machineSpecificationOptions(item.machineSpecificationCode)}</select><small class="bom-hour-unit">${eligibleCount} mesin aktif eligible</small>`;
      const standardRate = vendorMode
        ? `<strong class="bom-machine-rate">${vendorRate.found ? money(vendorRate.value) : "—"}</strong><small class="bom-hour-unit">harga proses / pcs</small>${vendorRate.source?.id ? `<a class="bom-cost-source-link" href="/master-data/vendor-price-lists/${encodeURIComponent(vendorRate.source.id)}/edit?key=${encodeURIComponent(vendorRate.source.id)}" target="_blank" rel="noopener">Buka Vendor Price List</a>` : `<small class="bom-cost-missing">Harga untuk kombinasi part + vendor + proses belum ada</small>${item.vendorId ? `<a class="bom-cost-source-link" href="/master-data/vendor-price-lists/new?vendorId=${encodeURIComponent(item.vendorId)}&partId=${encodeURIComponent(row?.partId || "")}&effectiveFrom=${encodeURIComponent(document.getElementById("bom-table-effective")?.value || todayInput())}" target="_blank" rel="noopener">+ Tambah harga vendor</a>` : ""}`}`
        : `<strong class="bom-machine-rate">${rate.found ? money(rate.value) : "—"}</strong><small class="bom-hour-unit">${rate.found ? `${rate.unit} · referensi ${machine.machineCode || "-"}` : "Rate belum ada"}</small>${machineMasterLink(machine, "Buka Master Machine")}`;
      const basis = vendorMode
        ? `<strong class="bom-machine-rate">PER PCS</strong><small class="bom-hour-unit">Tidak dikali cycle time</small>`
        : `<strong class="bom-machine-rate">${moneyPerSecond(perSecond.value)}</strong>${perSecond.found ? '<small class="bom-hour-unit">Rate dikonversi ke detik</small>' : '<small class="bom-cost-missing">Rate belum lengkap</small>'}`;
      return `<tr data-process-index="${index}"><td><strong class="bom-routing-number">${escapeHtml(item.routingNumber || "-")}</strong></td><td><input class="form-control" data-process-field="sequence" type="number" min="1" value="${Number(item.sequence || (index + 1) * 10)}"></td><td><select class="form-select" data-process-field="processId">${processOptions(item.processId)}</select><small class="bom-process-occurrence-inline">${escapeHtml(item.occurrenceCode || "")}</small></td><td><select class="form-select" data-process-field="routingMode">${option("INHOUSE", "In-house", item.routingMode || "INHOUSE")}${option("VENDOR", "Vendor process", item.routingMode)}</select></td><td>${resource}</td><td>${standardRate}</td><td><input class="form-control" data-process-field="cycleTime" type="number" min="0" step="0.01" value="${Number(item.cycleTime || 0)}" ${vendorMode ? "disabled" : ""}><small class="bom-hour-unit">${vendorMode ? "Tidak digunakan untuk harga vendor" : "Sumber: Routing MBOM ini"}</small></td><td>${basis}</td><td><strong class="bom-machine-cost">${money(estimate.value)}</strong>${estimate.found ? `<small class="bom-hour-unit">${vendorMode ? "Harga vendor / pcs" : "Cycle Time × Cost / Second"}</small>` : '<small class="bom-cost-missing">Harga / rate belum lengkap</small>'}</td><td><input class="form-control" data-process-field="notes" value="${escapeAttr(item.notes || "")}"></td><td><button class="bom-table-row-delete" type="button" data-delete-process>×</button></td></tr>`;
    }).join("") : '<tr><td colspan="11" class="text-center py-4">Belum ada routing process.</td></tr>';
  }
  renderProcessRows = renderSpecificationProcessRows;
  document.getElementById("bom-process-add").addEventListener("click", () => { const row = editingRow(); if (!row) return; const max = Math.max(0, ...(row.mbomProcesses || []).map((item) => Number(item.sequence || 0))); row.mbomProcesses.push({ sequence: Math.floor(max / 10) * 10 + 10, processId: "", routingMode: "INHOUSE", vendorId: null, machineId: null, machineSpecificationCode: "", alternativeMachineIds: [], cycleTime: 0, notes: "" }); renderProcessRows(); });
  processRows.addEventListener("change", (event) => { const row = editingRow(); const index = Number(event.target.closest("tr")?.dataset.processIndex); const item = row?.mbomProcesses?.[index]; const field = event.target.dataset.processField; if (!item || !field) return; item[field] = field === "alternativeMachineIds" ? [...event.target.selectedOptions].map((option) => option.value).filter((machineId) => machineId && machineId !== item.machineId) : ["sequence", "cycleTime"].includes(field) ? Number(event.target.value) : event.target.value || null; if (field === "processId") { item.process = state.processes.find((process) => process.id === item.processId) || null; autoSelectEligibleVendor(item, row); } if (field === "machineId") { item.machine = state.machines.find((machine) => machine.id === item.machineId) || null; item.alternativeMachineIds = (item.alternativeMachineIds || []).filter((machineId) => machineId !== item.machineId); } if (field === "vendorId") item.vendor = state.vendors.find((vendor) => vendor.id === item.vendorId) || null; if (field === "routingMode") { if (item.routingMode === "VENDOR") { item.machineId = null; item.machine = null; item.machineSpecificationCode = ""; item.cycleTime = 0; autoSelectEligibleVendor(item, row); } else { item.vendorId = null; item.vendor = null; } } renderProcessRows(); });
  processRows.addEventListener("change", (event) => { if (event.target.dataset.processField !== "machineSpecificationCode") return; const item = editingRow()?.mbomProcesses?.[Number(event.target.closest("tr")?.dataset.processIndex)]; if (!item) return; const representative = representativeMachine(item); item.machineId = representative?.id || null; item.machine = representative || null; item.alternativeMachineIds = []; renderProcessRows(); });
  processRows.addEventListener("click", (event) => { const button = event.target.closest("[data-delete-process]"); if (!button) return; const row = editingRow(); const index = Number(button.closest("tr").dataset.processIndex); row.mbomProcesses.splice(index, 1); renderProcessRows(); });
  processDialog.addEventListener("close", renderRows);
  document.getElementById("bom-table-save").addEventListener("click", async function () {
    alertBox.classList.add("d-none"); const invalid = state.rows.find((row) => !row.partId || !(Number(row.qty) > 0)); if (invalid) { alertBox.textContent = "Semua baris wajib memiliki Part dan Qty lebih dari 0."; alertBox.classList.remove("d-none"); return; } const invalidProcess = state.rows.find((row) => (row.mbomProcesses || []).some((item) => !item.processId || !(Number(item.sequence) > 0))); if (invalidProcess) { alertBox.textContent = "Setiap routing wajib memiliki Process dan Sequence lebih dari 0."; alertBox.classList.remove("d-none"); return; } const vendorCategoryWithoutRoute = state.rows.find((row) => row.category === "Vendor" && !(row.mbomProcesses || []).some((item) => String(item.routingMode || "INHOUSE").toUpperCase() === "VENDOR")); if (vendorCategoryWithoutRoute) { alertBox.textContent = "Kategori Proses outsource wajib memiliki minimal satu routing mode Vendor."; alertBox.classList.remove("d-none"); return; } const invalidVendorRoute = state.rows.flatMap((row) => (row.mbomProcesses || []).map((item) => ({ row, item }))).find(({ row, item }) => { if (String(item.routingMode || "INHOUSE").toUpperCase() !== "VENDOR") return false; return !item.vendorId || !eligibleVendors(item, row).some(({ vendor }) => vendor.id === item.vendorId); }); if (invalidVendorRoute) { const code = processMaster(invalidVendorRoute.item).processCode || "terpilih"; alertBox.textContent = `Vendor routing ${code} belum dipilih atau tidak terdaftar di Master Kode Proses Vendor.`; alertBox.classList.remove("d-none"); return; }
    this.disabled = true; this.textContent = "Menyimpan...";
    try {
      const missingCustomer = state.rows.find((row) => isCustomerSupplied(row) && !row.supplyCustomerId);
      if (missingCustomer) throw new Error(`Customer pemilik material wajib dipilih untuk ${missingCustomer.part?.partCode || "raw material"}.`);
      const details = state.rows.map((row) => ({ id: row.id || undefined, clientKey: keyOf(row), parentDetailId: row.parentDetailId || null, levelComponent: levelOf(row), partId: row.partId, materialSupplyType: canChooseMaterialSource(row) ? row.materialSupplyType || "SUPPLIER_PURCHASE" : "SUPPLIER_PURCHASE", supplyCustomerId: isCustomerSupplied(row) ? row.supplyCustomerId || null : null, supplierId: row.category === "Purchase" && !isCustomerSupplied(row) ? row.supplierId || null : null, vendorId: null, qty: Number(row.qty), uomCode: row.uomCode || null, category: row.category || "Purchase", assemblyPolicyOverride: row.assemblyPolicyOverride || "DEFAULT", leadTime: Math.max(0, Number(row.leadTime || 0)), leadTimeUnit: row.leadTimeUnit || "HOUR", materialThickness: row.materialThickness ?? null, materialWidth: row.materialWidth ?? null, materialPitch: row.materialPitch ?? null, materialCavity: row.materialCavity ?? null, materialDensity: row.materialDensity ?? null, materialFormId: row.materialFormId || null, materialScheme: row.materialScheme || "DEFAULT", defaultGrossWeight: Number(row.defaultGrossWeight ?? row.grossWeight ?? 0), alternateMaterialFormId: row.alternateMaterialFormId || null, alternateMaterialPitch: row.alternateMaterialPitch ?? null, alternateMaterialCavity: row.alternateMaterialCavity ?? null, alternateGrossWeight: row.alternateGrossWeight ?? null, grossWeight: Number(row.grossWeight || 0), notes: row.notes || null, mbomProcesses: row.mbomProcesses || [] })); const revisionMode = document.getElementById("bom-table-revision-mode").value; const revisionNote = document.getElementById("bom-table-revision-note").value.trim(); if (revisionMode === "newRevision" && !revisionNote) throw new Error("Catatan revisi wajib diisi agar perubahan dapat diaudit."); const header = { partId: state.record.partId, uomCode: document.getElementById("bom-table-uom").value || null, effectiveDate: document.getElementById("bom-table-effective").value || null, expiryDate: document.getElementById("bom-table-expiry").value || null, notes: document.getElementById("bom-table-notes").value || null, revisionNote, revisionMode, expirePreviousRevision: true }; const response = await fetch(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(state.record.id)}`, { method: "PATCH", headers: headers(true), body: JSON.stringify({ revisionMode, header, details }) }); const payload = await response.json().catch(() => ({})); if (response.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); if (!response.ok) throw new Error(payload.message || payload.detail || "BOM gagal disimpan."); location.replace(`/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(payload.noReg || state.record.noReg)}`); } catch (error) { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); this.disabled = false; this.textContent = "Simpan Perubahan"; }
  });
  initialize();
})();
