(function () {
  const config = JSON.parse(document.getElementById("ops-detail-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let normalized = String(value ?? "").trim().replace(/\s+/g, "");
    if (!normalized) return 0;
    if (normalized.includes(",") && normalized.includes(".")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const num = (value, digits = 3) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const discreteUoms = new Set(["PCS", "PC", "PIECE", "PIECES", "SHEET", "SHEETS", "COIL", "COILS"]);
  const isDiscreteUom = (value) => discreteUoms.has(String(value || "").trim().toUpperCase());
  const label = (key) => String(key || "").replace(/Id$/, " ID").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
  const slug = (value) => String(value || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const isDateKey = (key) => /(date|at|month|start|end|expiry)$/i.test(key);
  const format = (value, key = "") => {
    if (value == null || value === "") return "-";
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (isDateKey(key)) { const parsed = new Date(value); if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", ...(String(value).includes("T") ? { timeStyle: "short" } : {}) }).format(parsed); }
    if (typeof value === "number") return num(value);
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const badge = (value) => `<span class="ops-badge ${esc(slug(value))}">${esc(value || "-")}</span>`;
  const isProductionDetail = () => config.module === "production";
  let currentRecord = null;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload.data || payload.item || payload;
  }
  function showAlert(message, kind = "danger") { const box = $("ops-detail-alert"); box.textContent = message; box.className = `alert alert-${kind}`; }
  function isInternalKey(key) {
    return /^(id|createdAt|updatedAt|deletedAt|isDeleted)$/i.test(String(key || ""))
      || /(^|[_-])id$/i.test(String(key || ""))
      || /Id$/.test(String(key || ""));
  }
  function scalarEntries(object) { return Object.entries(object || {}).filter(([key, value]) => !isInternalKey(key) && (value == null || ["string", "number", "boolean"].includes(typeof value))); }
  const referenceRules = [
    { test: /^(source)?monthlyProductionPlanNumber$|^planNumber$/i, type: "MPP", href: (value) => `/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(value)}` },
    { test: /^mpsNumber$|^sourceMpsNumbers?$/i, type: "MPS", href: (value) => `/modules/planning-ppic/mps/${encodeURIComponent(value)}` },
    { test: /^mrpNumber$|^runNumber$|^sourceMrpNumbers?$/i, type: "MRP", href: (value) => `/modules/planning-ppic/mrp/${encodeURIComponent(value)}` },
    { test: /^forecastNumber$|^sourceForecastNumbers?$/i, type: "Forecast", href: (value) => `/modules/sales/forecasts/${encodeURIComponent(value)}` },
    { test: /^soNumber$|^sourceSONumbers?$/i, type: "SO", href: (value) => `/modules/sales/sales-orders/${encodeURIComponent(value)}` },
    { test: /^moNumber$|^manufacturingOrderNumber$/i, type: "MO", href: (value) => `/modules/production/manufacturing-orders/${encodeURIComponent(value)}` },
    { test: /^woNumber$|^workOrderNumber$/i, type: "WO", href: (value) => `/modules/production/work-orders/${encodeURIComponent(value)}` },
    { test: /^issueNumber$|^materialIssueNumber$/i, type: "MI", href: (value) => `/modules/inventory/material-issues/${encodeURIComponent(value)}` },
    { test: /^logNumber$|^productionLogNumber$/i, type: "Log Produksi", href: (value) => `/modules/production/production-logs/${encodeURIComponent(value)}` },
    { test: /^movementNumber$|^stockMovementNumber$/i, type: "Stock Movement", href: (value) => `/modules/inventory/stock-movements/${encodeURIComponent(value)}` },
    { test: /^downtimeNumber$/i, type: "Downtime", href: (value) => `/modules/production/downtime-logs/${encodeURIComponent(value)}` },
    { test: /^prNumber$|^sourcePrNumbers?$/i, type: "PR", href: (value) => `/modules/purchasing/purchase-requisitions/${encodeURIComponent(value)}` },
    { test: /^poNumber$|^sourcePoNumbers?$/i, type: "PO", href: (value) => `/modules/purchasing/purchase-order/${encodeURIComponent(value)}` },
    { test: /^grNumber$/i, type: "GR", href: (value) => `/modules/incoming/goods-receipts/${encodeURIComponent(value)}` },
    { test: /^partCode$|^outputPartCode$|^parentPartCode$/i, type: "Part", href: (value) => `/master-data/parts/${encodeURIComponent(value)}` },
    { test: /^materialCode$/i, type: "Material", href: (value) => `/master-data/materials/${encodeURIComponent(value)}` },
  ];
  function splitReferenceValues(value) {
    if (Array.isArray(value)) return value.flatMap(splitReferenceValues);
    if (value == null || value === "") return [];
    return String(value).split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  }
  function resolveReference(key, value) {
    const normalizedKey = String(key || "").split(".").pop();
    if (/^scheduleNumber$/i.test(normalizedKey)) {
      const outgoing = config.module === "outgoing";
      return {
        type: outgoing ? "Delivery Schedule" : "Daily Plan",
        label: String(value),
        href: outgoing
          ? `/modules/outgoing/delivery-schedules/${encodeURIComponent(value)}`
          : `/modules/production/daily-production-schedules/${encodeURIComponent(value)}`,
      };
    }
    if (/^inspectionNumber$/i.test(normalizedKey)) {
      const incoming = config.module === "incoming" || config.page.slug === "incoming-inspections";
      return {
        type: incoming ? "Incoming QC" : "Production QC",
        label: String(value),
        href: incoming
          ? `/modules/incoming/incoming-inspections/${encodeURIComponent(value)}`
          : `/modules/production/quality-inspections/${encodeURIComponent(value)}`,
      };
    }
    const rule = referenceRules.find((candidate) => candidate.test.test(normalizedKey));
    return rule ? { type: rule.type, label: String(value), href: rule.href(value) } : null;
  }
  function linkedValue(value, key, row = {}) {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
    const references = splitReferenceValues(value).map((item) => resolveReference(key, item)).filter(Boolean);
    if (references.length) return referenceLinks(references);
    return esc(typeof value === "number" && isDiscreteUom(row.uomCode) ? num(value, 0) : format(value, key));
  }
  function renderFields(record) {
    const entries = scalarEntries(record);
    if (isProductionDetail() && entries.length) {
      $("ops-detail-fields").className = "production-excel-wrap";
      $("ops-detail-fields").innerHTML = `<table class="table ops-collection-table production-excel-table"><thead><tr>${entries.map(([key]) => `<th>${esc(label(key))}</th>`).join("")}</tr></thead><tbody><tr>${entries.map(([key, value]) => `<td>${linkedValue(value, key, record)}</td>`).join("")}</tr></tbody></table>`;
      return;
    }
    $("ops-detail-fields").className = "ops-detail-fields";
    $("ops-detail-fields").innerHTML = entries.map(([key, value]) => `<div><small>${esc(label(key))}</small><strong>${linkedValue(value, key, record)}</strong></div>`).join("") || '<div><small>Informasi</small><strong>Tidak ada field ringkas.</strong></div>';
  }
  function cell(value, key, row = {}) {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
    if (Array.isArray(value)) return value.length ? value.map((entry) => linkedValue(entry, key, row)).join("<br>") : '<span class="ops-muted">-</span>';
    if (typeof value === "object") {
      const references = collectDocumentReferences(value);
      if (references.length) return referenceLinks(references);
      const summary = scalarEntries(value).slice(0, 2).map(([, nested]) => format(nested)).join(" · ");
      return esc(summary || JSON.stringify(value));
    }
    if (/status|decision|direction/i.test(key)) return badge(value);
    return linkedValue(value, key, row);
  }
  const suggestionStatuses = ["Not Confirmed", "Waiting Supplier Confirmation", "Available", "Partially Available", "Not Available", "Alternative Quantity Offered", "Alternative Delivery Date", "Confirmed"];
  const dateInputValue = (value) => value ? String(value).slice(0, 10) : "";
  function suggestionSplitRow(row, allocation = {}) {
    return `<div class="ps-split-row" data-supplier-split>
      <div class="ps-split-head"><b>Supplier / Delivery Split</b><button class="btn btn-sm btn-outline-danger" type="button" data-remove-supplier-split>Hapus</button></div>
      <div class="ps-form-grid">
        <label>Supplier Code<input class="form-control form-control-sm" data-split-supplier value="${esc(allocation.supplierCode || "")}" placeholder="Contoh: SUP-001"></label>
        <label>Status<select class="form-select form-select-sm" data-split-status>${suggestionStatuses.map((value) => `<option ${value === allocation.confirmationStatus ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label>
        <label>Confirmed Qty<input class="form-control form-control-sm" data-split-qty type="number" min="0" step="0.001" value="${esc(allocation.confirmedQty ?? 0)}"></label>
        <label>Delivery Date<input class="form-control form-control-sm" data-split-date type="date" value="${esc(dateInputValue(allocation.deliveryDate))}"></label>
        <label>MOQ<input class="form-control form-control-sm" data-split-moq type="number" min="0" step="0.001" value="${esc(allocation.moq ?? "")}"></label>
        <label>Order Multiple<input class="form-control form-control-sm" data-split-multiple type="number" min="0" step="0.001" value="${esc(allocation.orderMultiple ?? "")}"></label>
        <label>Lead Time (hari)<input class="form-control form-control-sm" data-split-lead type="number" min="0" value="${esc(allocation.leadTimeDays ?? "")}"></label>
        <label>Harga<input class="form-control form-control-sm" data-split-price type="number" min="0" step="0.0001" value="${esc(allocation.unitPrice ?? "")}"></label>
        <label>Currency<input class="form-control form-control-sm" data-split-currency value="${esc(allocation.currencyCode || row.currencyCode || "")}" placeholder="IDR"></label>
        <label>Alternative Material<input class="form-control form-control-sm" data-split-material value="${esc(allocation.alternativeMaterialCode || "")}" placeholder="Jika diizinkan"></label>
        <label class="ps-span-2">Supplier Remark<input class="form-control form-control-sm" data-split-remark value="${esc(allocation.supplierRemark || "")}"></label>
      </div>
    </div>`;
  }
  function suggestionEditor(row) {
    return `<div class="ps-confirmation-panel d-none" data-suggestion-editor>
      <div class="ps-panel-head"><div><b>Konfirmasi Supplier</b><small>Isi hasil komunikasi aktual dengan supplier.</small></div><button type="button" class="btn btn-sm btn-outline-secondary" data-close-suggestion-editor>Tutup</button></div>
      <div class="ps-form-grid" data-suggestion-confirmation data-item-id="${esc(row.id || "")}">
        <label>Status Konfirmasi<select class="form-select" data-confirm-status>${suggestionStatuses.map((value) => `<option ${value === row.confirmationStatus ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label>
        <label>Supplier Code<input class="form-control" data-confirm-supplier value="${esc(row.alternativeSupplierCode || row.suggestedSupplierCode || "")}" placeholder="Supplier yang dikonfirmasi"></label>
        <label>Confirmed Qty<input class="form-control" data-confirm-qty type="number" min="0" step="0.001" value="${esc(row.confirmedQty ?? row.recommendedPurchaseQty ?? 0)}"></label>
        <label>Confirmed Delivery<input class="form-control" data-confirm-date type="date" value="${esc(dateInputValue(row.confirmedDeliveryDate || row.materialRequiredDate))}"></label>
        <label>Confirmed MOQ<input class="form-control" data-confirm-moq type="number" min="0" step="0.001" value="${esc(row.confirmedMoq ?? row.moq ?? 0)}"></label>
        <label>Lead Time Aktual<input class="form-control" data-confirm-lead type="number" min="0" value="${esc(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays ?? 0)}"></label>
        <label>Harga<input class="form-control" data-confirm-price type="number" min="0" step="0.0001" value="${esc(row.estimatedUnitPrice ?? "")}"></label>
        <label>Currency<input class="form-control" data-confirm-currency value="${esc(row.currencyCode || "")}" placeholder="IDR"></label>
        <label>Alternative Material<input class="form-control" data-confirm-material value="${esc(row.alternativeMaterialCode || "")}" placeholder="Opsional, jika diizinkan"></label>
        <label class="ps-span-2">Supplier Remark<input class="form-control" data-confirm-remark value="${esc(row.supplierRemark || "")}" placeholder="Catatan ketersediaan, harga, atau jadwal"></label>
        <label class="ps-span-2">Alasan Tanpa Konfirmasi<input class="form-control" data-confirm-bypass value="${esc(row.bypassConfirmationReason || "")}" placeholder="Wajib jika PR tetap dibuat tanpa konfirmasi supplier"></label>
        <div class="ps-span-2 ps-splits" data-supplier-splits>${(row.supplierAllocations || []).map((allocation) => suggestionSplitRow(row, allocation)).join("")}</div>
        <div class="ps-span-2 ps-panel-actions"><button class="btn btn-outline-primary" type="button" data-add-supplier-split>+ Split Supplier / Delivery</button><button class="btn btn-primary" type="button" data-save-suggestion-confirmation>Simpan Konfirmasi</button></div>
      </div>
    </div>`;
  }
  function renderPurchaseSuggestionCardsLegacy(rows, record = {}) {
    const totals = rows.reduce((result, row) => ({ net: result.net + number(row.netRequirement), recommended: result.recommended + number(row.recommendedPurchaseQty), excess: result.excess + number(row.excessQty), ready: result.ready + (/ready|converted/i.test(row.status || "") ? 1 : 0) }), { net: 0, recommended: 0, excess: 0, ready: 0 });
    const statusOptions = [...new Set(rows.map((row) => row.status).filter(Boolean))];
    const cards = rows.map((row) => {
      const identity = row.materialCode || row.partCode || "Tanpa kode";
      const description = row.materialDescription || row.partName || "Material / part pembelian";
      const sources = [...new Set([...(row.salesOrderNumbers || []), ...(row.forecastNumbers || []), ...(row.productionOrderNumbers || [])].filter(Boolean))];
      const search = [identity, description, row.partNumber, row.suggestedSupplierCode, row.status, ...sources].filter(Boolean).join(" ").toLowerCase();
      const shortage = Math.max(number(row.shortageQty), 0);
      return `<article class="ps-item-card" data-ps-card data-ps-status="${esc(row.status || "Draft")}" data-ps-search="${esc(search)}">
        <header class="ps-item-head"><div class="ps-item-identity"><span class="ps-kind">${row.materialCode ? "MATERIAL" : "PURCHASE PART"}</span><h3>${esc(identity)}</h3><p>${esc(description)}${row.partNumber ? ` · PN ${esc(row.partNumber)}` : ""}</p></div><div class="ps-item-status">${badge(row.status)}<small>${badge(row.confirmationStatus)}</small></div></header>
        <div class="ps-source-strip"><span>Demand</span>${sources.length ? sources.map((source) => `<b>${esc(source)}</b>`).join("") : "<b>MRP</b>"}${(row.customerCodes || []).map((customer) => `<b>Customer ${esc(customer)}</b>`).join("")}</div>
        <div class="ps-timeline"><div><small>Delivery Customer</small><b>${esc(format(row.customerDeliveryDate, "date"))}</b></div><span>←</span><div><small>Mulai Produksi</small><b>${esc(format(row.plannedProductionStart, "date"))}</b></div><span>←</span><div><small>Material Dibutuhkan</small><b>${esc(format(row.materialRequiredDate, "date"))}</b></div><span>←</span><div><small>Order Maksimal</small><b>${esc(format(row.recommendedOrderDate, "date"))}</b></div></div>
        <div class="ps-metric-grid"><div><small>Gross Requirement</small><b>${num(row.grossRequirement)} ${esc(row.uomCode || "")}</b></div><div><small>Available + Open PO</small><b>${num(number(row.availableStock) + number(row.openPoQty))}</b><em>OH ${num(row.onHandStock)} · RSV ${num(row.reservedStock)}</em></div><div><small>Net Requirement</small><b>${num(row.netRequirement)}</b></div><div class="ps-recommended"><small>Recommended Purchase</small><b>${num(row.recommendedPurchaseQty)} ${esc(row.uomCode || "")}</b><em>MOQ ${num(row.moq)} · Multiple ${num(row.orderMultiple)}</em></div><div><small>Excess / Projected</small><b>${num(row.excessQty)} / ${num(row.projectedStockAfterOrder)}</b></div><div><small>Shortage</small><b class="${shortage > 0 ? "text-danger" : "text-success"}">${num(shortage)}</b></div></div>
        <footer class="ps-item-footer"><div><small>Suggested Supplier</small><b>${esc(row.suggestedSupplierCode || "Belum ditentukan")}</b><span>${num(row.purchasingLeadTimeDays, 0)} hari lead time</span></div><button class="btn ${/ready|converted/i.test(row.status || "") ? "btn-outline-primary" : "btn-primary"}" type="button" data-open-suggestion-editor>${/ready|converted/i.test(row.status || "") ? "Lihat / Ubah Konfirmasi" : "Konfirmasi Supplier"}</button></footer>
        ${suggestionEditor(row)}
      </article>`;
    }).join("");
    const replanBanner = record.status === "Replan Required" ? `<div class="alert alert-warning mb-0"><b>Demand berubah.</b> Purchase Suggestion ini tidak dapat dibuat menjadi PR. Hitung ulang MPS lalu jalankan MRP kembali untuk memperoleh rekomendasi terbaru.</div>` : "";
    return `<section class="ps-workspace">${replanBanner}<div class="ps-summary-grid"><div><small>Total Item</small><b>${num(rows.length, 0)}</b></div><div><small>Net Requirement</small><b>${num(totals.net)}</b></div><div><small>Recommended Qty</small><b>${num(totals.recommended)}</b></div><div><small>Excess Qty</small><b>${num(totals.excess)}</b></div><div><small>Siap PR</small><b>${num(totals.ready, 0)} / ${num(rows.length, 0)}</b></div></div><div class="ps-toolbar"><input class="form-control" data-ps-search-input placeholder="Cari material, part, supplier, SO, atau forecast"><select class="form-select" data-ps-status-filter><option value="">Semua status</option>${statusOptions.map((status) => `<option>${esc(status)}</option>`).join("")}</select><span data-ps-result>${num(rows.length, 0)} item</span></div><div class="ps-card-list">${cards}</div></section>`;
  }
  function renderPurchaseSuggestionItems(rows, record = {}) {
    const totals = rows.reduce((result, row) => ({ net: result.net + number(row.netRequirement), recommended: result.recommended + number(row.recommendedPurchaseQty), excess: result.excess + number(row.excessQty), ready: result.ready + (/ready|converted/i.test(row.status || "") ? 1 : 0) }), { net: 0, recommended: 0, excess: 0, ready: 0 });
    const statusOptions = [...new Set(rows.map((row) => row.status).filter(Boolean))];
    const categories = [...new Set(rows.map((row) => row.materialCode ? "Material" : "Purchase Part"))];
    const dueParts = (value) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return { day: "Tanpa due date", week: "Tanpa due date", month: "Tanpa due date" };
      const dayValue = parsed.toISOString().slice(0, 10);
      const weekDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
      const weekday = weekDate.getUTCDay() || 7;
      weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekday);
      const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
      const weekNumber = Math.ceil((((weekDate - yearStart) / 86400000) + 1) / 7);
      return { day: dayValue, week: `${weekDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`, month: dayValue.slice(0, 7) };
    };
    const referencePills = (row) => {
      const references = [];
      const add = (type, value, href) => {
        if (!value || references.some((entry) => entry.href === href)) return;
        references.push({ type, value, href });
      };
      (row.salesOrderNumbers || []).forEach((value) => add("SO", value, `/modules/sales/sales-orders/${encodeURIComponent(value)}`));
      (row.forecastNumbers || []).forEach((value) => add("Forecast", value, `/modules/sales/forecasts/${encodeURIComponent(value)}`));
      (row.productionOrderNumbers || []).forEach((value) => add("MO", value, `/modules/production/manufacturing-orders/${encodeURIComponent(value)}`));
      (row.sourceRequirements || []).forEach((source) => {
        (source.plannedOrderNumbers || [source.plannedOrderNumber]).filter(Boolean).forEach((value) => add("Planned Order", value, `/modules/planning-ppic/planned-orders/${encodeURIComponent(value)}`));
        add("MPS", source.mpsNumber, `/modules/planning-ppic/mps/${encodeURIComponent(source.mpsNumber)}`);
        if (source.sourceType === "SALES_ORDER") add("SO", source.sourceNumber, `/modules/sales/sales-orders/${encodeURIComponent(source.sourceNumber)}`);
        if (source.sourceType === "FORECAST") add("Forecast", source.sourceNumber, `/modules/sales/forecasts/${encodeURIComponent(source.sourceNumber)}`);
      });
      add("MRP", record.runNumber, `/modules/planning-ppic/mrp/${encodeURIComponent(record.runNumber)}`);
      add("PR", row.prNumber, `/modules/purchasing/purchase-requisitions/${encodeURIComponent(row.prNumber)}`);
      return references.map((reference) => `<a class="ps-reference-link" href="${esc(reference.href)}" title="Buka ${esc(reference.type)} ${esc(reference.value)}"><span>${esc(reference.type)}</span><b>${esc(reference.value)}</b><i aria-hidden="true">↗</i></a>`).join("");
    };
    const tableRows = [...rows].sort((left, right) => new Date(left.materialRequiredDate || 0) - new Date(right.materialRequiredDate || 0)).map((row) => {
      const identity = row.materialCode || row.partCode || "Tanpa kode";
      const description = row.materialDescription || row.partName || "Material / part pembelian";
      const category = row.materialCode ? "Material" : "Purchase Part";
      const sources = [...new Set([...(row.salesOrderNumbers || []), ...(row.forecastNumbers || []), ...(row.productionOrderNumbers || []), row.plannedOrderNumber].filter(Boolean))];
      const search = [identity, description, row.partNumber, row.suggestedSupplierCode, row.suggestedSupplierName, row.status, ...sources].filter(Boolean).join(" ").toLowerCase();
      const due = dueParts(row.materialRequiredDate);
      const confirmedAllocations = (row.supplierAllocations || []).filter((allocation) => allocation.status === "Confirmed");
      const supplierAvailability = confirmedAllocations.length ? confirmedAllocations.reduce((sum, allocation) => sum + number(allocation.confirmedQty), 0) : number(row.confirmedQty || row.recommendedPurchaseQty);
      const selectedQty = Math.min(number(row.confirmedQty || row.recommendedPurchaseQty), supplierAvailability || number(row.recommendedPurchaseQty));
      const eligible = /ready/i.test(row.status || "") && !/converted/i.test(row.status || "");
      const materialHref = row.materialCode ? `/master-data/materials/${encodeURIComponent(row.materialCode)}` : `/master-data/parts/${encodeURIComponent(row.partCode || identity)}`;
      const supplierCode = row.alternativeSupplierCode || row.suggestedSupplierCode;
      const supplierHref = supplierCode ? `/master-data/suppliers/${encodeURIComponent(supplierCode)}` : "";
      const step = isDiscreteUom(row.uomCode) ? "1" : "0.001";
      return `<tr class="ps-data-row" data-ps-row data-item-id="${esc(row.id || "")}" data-ps-status="${esc(row.status || "Draft")}" data-ps-category="${esc(category)}" data-ps-search="${esc(search)}" data-due-day="${esc(due.day)}" data-due-week="${esc(due.week)}" data-due-month="${esc(due.month)}">
        <td class="ps-freeze-select"><input class="form-check-input" type="checkbox" data-ps-select ${eligible ? "" : "disabled"} aria-label="Pilih ${esc(identity)} untuk PR" title="${eligible ? "Pilih untuk satu Draft PR" : "Konfirmasi supplier lebih dahulu"}"></td>
        <td class="ps-freeze-item"><a class="ps-item-link" href="${esc(materialHref)}"><b>${esc(identity)}</b><span>${esc(description)}</span><small>${row.partNumber ? `PN ${esc(row.partNumber)} · ` : ""}${esc(row.uomCode || "-")}</small></a></td>
        <td><span class="ps-category ${slug(category)}">${esc(category)}</span></td>
        <td class="ps-date-cell" title="Material due / order maksimal / customer due"><b>${esc(format(row.materialRequiredDate, "date"))}</b><span>Order ${esc(format(row.recommendedOrderDate, "date"))}</span><small>Cust. ${esc(format(row.customerDeliveryDate, "date"))}</small></td>
        <td><div class="ps-reference-list">${referencePills(row) || '<span class="ops-muted">Tidak ada referensi</span>'}</div></td>
        <td class="ps-qty-cell" title="Net / Gross / Rekomendasi"><b>${num(row.netRequirement)} ${esc(row.uomCode || "")}</b><span>G ${num(row.grossRequirement)}</span><small>R ${num(row.recommendedPurchaseQty)}</small></td>
        <td class="ps-qty-cell" title="Total supply / Available / Open PO"><b>${num(number(row.availableStock) + number(row.openPoQty))}</b><span>A ${num(row.availableStock)}</span><small>PO ${num(row.openPoQty)}</small></td>
        <td class="ps-supplier-cell">${supplierHref ? `<a href="${esc(supplierHref)}"><b>${esc(supplierCode)}</b><span>${esc(row.suggestedSupplierName || "Supplier")}</span></a>` : '<b class="text-danger">Belum ditentukan</b>'}<small>Tersedia ${num(supplierAvailability)} · LT ${num(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays, 0)} hari</small></td>
        <td class="ps-custom-qty"><input class="form-control form-control-sm" data-ps-custom-qty type="number" min="${step}" max="${esc(supplierAvailability)}" step="${step}" value="${esc(selectedQty)}" disabled><small>Maks. supplier: ${num(supplierAvailability)} ${esc(row.uomCode || "")}</small></td>
        <td class="ps-status-cell">${badge(row.status)}<span>${badge(row.confirmationStatus)}</span><button class="btn btn-sm btn-outline-primary" type="button" data-open-suggestion-editor>Detail / Konfirmasi</button></td>
      </tr><tr class="ps-editor-row d-none" data-ps-editor-row><td colspan="10">${suggestionEditor(row)}</td></tr>`;
    }).join("");
    const replanBanner = record.status === "Replan Required" ? `<div class="alert alert-warning mb-0"><b>Demand berubah.</b> Purchase Suggestion ini tidak dapat dibuat menjadi PR. Hitung ulang MPS lalu jalankan MRP kembali untuk memperoleh rekomendasi terbaru.</div>` : "";
    return `<section class="ps-workspace">${replanBanner}<div class="ps-summary-grid"><div><small>Total Item</small><b>${num(rows.length, 0)}</b></div><div><small>Net Requirement</small><b>${num(totals.net)}</b></div><div><small>Recommended Qty</small><b>${num(totals.recommended)}</b></div><div><small>Excess Qty</small><b>${num(totals.excess)}</b></div><div><small>Siap PR</small><b>${num(totals.ready, 0)} / ${num(rows.length, 0)}</b></div></div>
      <div class="ps-toolbar"><label class="ps-search-field"><span>Cari</span><input class="form-control" data-ps-search-input placeholder="Material, supplier, SO, forecast..."></label><label><span>Category</span><select class="form-select" data-ps-category-filter><option value="">Semua category</option>${categories.map((category) => `<option>${esc(category)}</option>`).join("")}</select></label><label><span>Status</span><select class="form-select" data-ps-status-filter><option value="">Semua status</option>${statusOptions.map((status) => `<option>${esc(status)}</option>`).join("")}</select></label><label><span>Group by due date</span><select class="form-select" data-ps-due-group><option value="day">Per tanggal</option><option value="week">Per minggu</option><option value="month">Per bulan</option><option value="">Tanpa grouping</option></select></label><b data-ps-result>${num(rows.length, 0)} item</b></div>
      <div class="ps-table-shell"><table class="table ps-suggestion-table"><thead><tr><th class="ps-freeze-select"><input class="form-check-input" type="checkbox" data-ps-select-all aria-label="Pilih semua item yang siap"></th><th class="ps-freeze-item">Material / Part</th><th>Category</th><th>Due Date</th><th>Full Reference</th><th>Demand</th><th>Stock Supply</th><th>Supplier & Availability</th><th>Qty untuk PR</th><th>Status / Action</th></tr></thead><tbody>${tableRows || '<tr><td colspan="10" class="text-center text-muted p-4">Tidak ada item suggestion.</td></tr>'}</tbody></table></div>
      <div class="ps-selection-bar"><div><b data-ps-selected-count>0 item dipilih</b><span data-ps-selected-qty>Total qty 0</span></div><small>Qty dapat disesuaikan sampai batas supplier. Material dan Purchase Part otomatis dibuatkan PR terpisah.</small><button class="btn btn-primary" type="button" data-workflow-action="convert-suggestion-to-pr" disabled data-ps-create-pr>Buat Draft PR</button></div></section>`;
  }

  function renderArray(key, rows, record = {}) {
    const isPrDetails = config.module === "purchasing" && config.page.slug === "purchase-requisitions" && key === "details";
    const isPurchaseSuggestionItems = config.module === "purchasing" && config.page.slug === "purchase-suggestions" && key === "items";
    const isStoDetails = config.module === "inventory" && config.page.slug === "stock-opname" && key === "details";
    const isIqcDetails = ["incoming", "purchasing"].includes(config.module) && config.page.slug === "incoming-inspections" && key === "details";
    const isStockMovementHistory = config.module === "inventory" && config.page.slug === "stock-balances" && key === "stockMovements";
    const isStockReservationHistory = config.module === "inventory" && config.page.slug === "stock-balances" && key === "stockReservations";
    const canCountSto = isStoDetails && String(record.status || "").toUpperCase() === "COUNTING";
    const canCompleteIqc = isIqcDetails && String(record.status || "").toUpperCase() === "OPEN";
    if (isPurchaseSuggestionItems) return renderPurchaseSuggestionItems(rows, record);
    const preferredKeys = ["lineNumber", "procurementCategory", "materialCode", "materialType", "materialName", "partCode", "partNumber", "partName", "description", "qty", "orderedQty", "uomCode", "sourceCount", "sourceMrpNumbers", "sourceMpsNumbers", "sourceForecastNumbers", "sourceSONumbers", "sourceDemandMonths", "sourcingAllocationCount", "sourcingSuppliers", "allocatedDemandQty", "supplierAllocationVariance", "supplierAllocationStatus", "orderVariance", "orderControlStatus", "sourcingForms", "sourcingDeliveryDates", "proposedSupplierCode", "confirmedSupplierCode", "notes"];
    const discoveredKeys = [...new Set(rows.slice(0, 8).flatMap((row) => row && typeof row === "object" ? Object.keys(row).filter((name) => {
      const value = row[name]; return !isInternalKey(name) && (value == null || ["string", "number", "boolean"].includes(typeof value) || (typeof value === "object" && !Array.isArray(value)) || (isPurchaseSuggestionItems && Array.isArray(value)));
    }) : []))];
    const stoPreferredKeys = [
      "partCode", "partNumber", "partName", "description", "spec", "stockType",
      "warehouseCode", "rackCode", "lotNumber", "uomCode",
      ...(canCountSto ? [] : ["systemQty"]),
      "actualQty", "varianceQty", "varianceStatus", "countedBy", "countedAt", "adjustmentNumber",
    ];
    const movementHistoryPreferredKeys = [
      "movementNumber", "movementDate", "movementType", "direction", "qty", "uomCode",
      "qtyBefore", "qtyAfter", "warehouseCode", "rackCode", "lotNumber", "referenceNumber",
    ];
    const reservationHistoryPreferredKeys = [
      "reservationNumber", "reservationDate", "partCode", "warehouseCode", "rackCode", "lotNumber",
      "referenceType", "soNumber", "moNumber", "mpsNumber", "sourceLineNumber",
      "qtyReserved", "qtyReleased", "qtyOpen", "status", "notes",
    ];
    const suggestionPreferredKeys = [
      "materialCode", "materialDescription", "partCode", "partNumber", "customerCodes", "salesOrderNumbers",
      "customerDeliveryDate", "plannedProductionStart", "materialRequiredDate", "recommendedOrderDate",
      "grossRequirement", "onHandStock", "reservedStock", "availableStock", "openPoQty", "netRequirement",
      "recommendedPurchaseQty", "moq", "orderMultiple", "excessQty", "projectedStockAfterOrder",
      "suggestedSupplierCode", "purchasingLeadTimeDays", "confirmationStatus", "shortageQty", "status",
    ];
    const columnKeys = (
      isPurchaseSuggestionItems
        ? suggestionPreferredKeys.filter((name) => discoveredKeys.includes(name))
      : isPrDetails
        ? preferredKeys.filter((name) => discoveredKeys.includes(name))
        : isStoDetails
          ? stoPreferredKeys.filter((name) => discoveredKeys.includes(name))
          : isStockMovementHistory
            ? movementHistoryPreferredKeys.filter((name) => discoveredKeys.includes(name))
          : isStockReservationHistory
            ? reservationHistoryPreferredKeys.filter((name) => discoveredKeys.includes(name))
          : discoveredKeys
    ).slice(0, isPurchaseSuggestionItems ? 28 : isPrDetails ? 28 : isStoDetails ? 18 : isStockReservationHistory ? 18 : isStockMovementHistory ? 14 : isProductionDetail() ? 24 : 9);
    if (!rows.length) return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>0 baris</span></div><p class="ops-help" style="padding-bottom:16px">Belum ada data terkait.</p></section>`;
    if (!columnKeys.length) return "";
    const selectionHead = isPrDetails ? '<th class="text-center">Pilih PO</th>' : "";
    const countHead = isStoDetails ? '<th>Physical Count</th>' : "";
    const inspectionHead = isIqcDetails ? '<th>Keputusan IQC</th>' : "";
    const suggestionConfirmationHead = isPurchaseSuggestionItems ? '<th>Konfirmasi Supplier</th>' : "";
    const selectionCell = (row) => {
      if (!isPrDetails) return "";
      const outstanding = Math.max(number(row?.qty) - number(row?.orderedQty), 0);
      const proposed = row?.confirmedSupplierCode || row?.proposedSupplierCode || row?.preferredSupplier || "";
      return `<td class="text-center"><input type="checkbox" class="form-check-input pr-po-line" data-pr-detail-id="${esc(row?.id || "")}" data-line-number="${esc(row?.lineNumber || "")}" data-supplier-code="${esc(proposed)}" data-outstanding="${esc(outstanding)}" data-required-date="${esc(String(record.requiredDate || "").slice(0, 10))}" data-request-uom="${esc(String(row?.uomCode || "KG").toUpperCase())}" data-raw-material="${row?.materialCode ? "true" : "false"}" data-package-uom="${esc(row?.purchasePackageUomCode || "")}" data-package-qty="${esc(row?.purchasePackageQty || "")}" data-conversion-uom="${esc(String(row?.conversionUomCode || row?.uomCode || "KG").toUpperCase())}" data-conversion-factor="${esc(row?.conversionFactor || "")}" ${outstanding > 0 ? "checked" : "disabled"}></td>`;
    };
    const countCell = (row) => {
      if (!isStoDetails) return "";
      if (!canCountSto) return `<td>${row?.actualQty == null ? '<span class="ops-muted">Belum dihitung</span>' : `<b>${esc(format(row.actualQty))}</b>`}${row?.reason ? `<small class="d-block">${esc(row.reason)}</small>` : ""}</td>`;
      return `<td><div class="d-flex gap-1"><input class="form-control form-control-sm" data-sto-actual type="number" min="0" step="${isDiscreteUom(row?.uomCode) ? "1" : "0.0001"}" value="${row?.actualQty == null ? "" : esc(row.actualQty)}" placeholder="Qty"><button class="btn btn-sm btn-outline-primary" type="button" data-sto-count data-sto-detail="${esc(row?.id || "")}">Simpan</button></div><input class="form-control form-control-sm mt-1" data-sto-reason value="${esc(row?.reason || "")}" placeholder="Alasan selisih"></td>`;
    };
    const inspectionCell = (row) => {
      if (!isIqcDetails) return "";
      const dispositionOptions = ["HOLD", "RETURN_TO_SUPPLIER", "SCRAP"];
      const dispositionFields = (detailId, selected = "HOLD") => `<div class="d-flex gap-1 mt-1" data-iqc-disposition-detail="${esc(detailId || "")}"><select class="form-select form-select-sm" data-iqc-disposition>${dispositionOptions.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("")}</select><input class="form-control form-control-sm" data-iqc-disposition-reference value="${esc(row?.dispositionReference || "")}" placeholder="Referensi retur/disposition"></div>`;
      if (!canCompleteIqc) {
        const pendingReject = number(row?.qtyRejected) > number(row?.qtyRejectedDisposed) + 1e-9;
        return `<td><b>${num(row?.qtyAccepted, 3)}</b> accepted<br><b>${num(row?.qtyRejected, 3)}</b> rejected${pendingReject ? dispositionFields(row?.id, "RETURN_TO_SUPPLIER") : `<br><small>${esc(row?.rejectedDisposition || row?.disposition || "-")}</small>`}</td>`;
      }
      return `<td data-iqc-detail data-iqc-gr-detail="${esc(row?.grDetailId || "")}"><div class="d-flex gap-1"><input class="form-control form-control-sm" data-iqc-accepted type="number" min="0" step="${isDiscreteUom(row?.uomCode) ? "1" : "0.0001"}" value="${esc(row?.qtyAccepted || 0)}" placeholder="Accept"><input class="form-control form-control-sm" data-iqc-rejected type="number" min="0" step="${isDiscreteUom(row?.uomCode) ? "1" : "0.0001"}" value="${esc(row?.qtyRejected || 0)}" placeholder="Reject"></div>${dispositionFields(row?.id, row?.rejectedDisposition || "HOLD")}</td>`;
    };
    const suggestionConfirmationCell = (row) => {
      if (!isPurchaseSuggestionItems) return "";
      const statuses = ["Not Confirmed", "Waiting Supplier Confirmation", "Available", "Partially Available", "Not Available", "Alternative Quantity Offered", "Alternative Delivery Date", "Confirmed"];
      const splitRow = (allocation = {}) => `<div class="border rounded p-1 d-grid gap-1" data-supplier-split>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-supplier value="${esc(allocation.supplierCode || "")}" placeholder="Supplier code"><select class="form-select form-select-sm" data-split-status>${statuses.map((value) => `<option ${value === allocation.confirmationStatus ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-qty type="number" min="0" step="0.001" value="${esc(allocation.confirmedQty ?? 0)}" placeholder="Qty"><input class="form-control form-control-sm" data-split-date type="date" value="${esc(String(allocation.deliveryDate || "").slice(0, 10))}"></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-moq type="number" min="0" step="0.001" value="${esc(allocation.moq ?? "")}" placeholder="MOQ"><input class="form-control form-control-sm" data-split-multiple type="number" min="0" step="0.001" value="${esc(allocation.orderMultiple ?? "")}" placeholder="Multiple"><input class="form-control form-control-sm" data-split-lead type="number" min="0" value="${esc(allocation.leadTimeDays ?? "")}" placeholder="Lead day"></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-price type="number" min="0" step="0.0001" value="${esc(allocation.unitPrice ?? "")}" placeholder="Harga"><input class="form-control form-control-sm" data-split-currency value="${esc(allocation.currencyCode || row.currencyCode || "")}" placeholder="Currency"></div>
        <input class="form-control form-control-sm" data-split-material value="${esc(allocation.alternativeMaterialCode || "")}" placeholder="Alternative material (jika diizinkan)">
        <input class="form-control form-control-sm" data-split-remark value="${esc(allocation.supplierRemark || "")}" placeholder="Supplier remark">
        <button class="btn btn-sm btn-outline-danger" type="button" data-remove-supplier-split>Hapus Split</button>
      </div>`;
      return `<td><div class="d-grid gap-1" data-suggestion-confirmation data-item-id="${esc(row.id || "")}">
        <select class="form-select form-select-sm" data-confirm-status>${statuses.map((value) => `<option ${value === row.confirmationStatus ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>
        <input class="form-control form-control-sm" data-confirm-supplier value="${esc(row.alternativeSupplierCode || row.suggestedSupplierCode || "")}" placeholder="Supplier code">
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-confirm-qty type="number" min="0" step="0.001" value="${esc(row.confirmedQty ?? row.recommendedPurchaseQty ?? 0)}" placeholder="Confirmed qty"><input class="form-control form-control-sm" data-confirm-date type="date" value="${esc(String(row.confirmedDeliveryDate || row.materialRequiredDate || "").slice(0, 10))}"></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-confirm-moq type="number" min="0" step="0.001" value="${esc(row.confirmedMoq ?? row.moq ?? 0)}" placeholder="MOQ"><input class="form-control form-control-sm" data-confirm-lead type="number" min="0" value="${esc(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays ?? 0)}" placeholder="Lead days"></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-confirm-price type="number" min="0" step="0.0001" value="${esc(row.estimatedUnitPrice ?? "")}" placeholder="Harga"><input class="form-control form-control-sm" data-confirm-currency value="${esc(row.currencyCode || "")}" placeholder="Currency"></div>
        <input class="form-control form-control-sm" data-confirm-material value="${esc(row.alternativeMaterialCode || "")}" placeholder="Alternative material (jika diizinkan)">
        <input class="form-control form-control-sm" data-confirm-remark value="${esc(row.supplierRemark || "")}" placeholder="Supplier remark">
        <input class="form-control form-control-sm" data-confirm-bypass value="${esc(row.bypassConfirmationReason || "")}" placeholder="Alasan bypass (jika tanpa konfirmasi)">
        <div class="d-grid gap-1" data-supplier-splits>${(row.supplierAllocations || []).map((allocation) => splitRow(allocation)).join("")}</div>
        <button class="btn btn-sm btn-outline-primary" type="button" data-add-supplier-split>+ Split Supplier / Delivery</button>
        <button class="btn btn-sm btn-primary" type="button" data-save-suggestion-confirmation>Simpan Konfirmasi</button>
      </div></td>`;
    };
    const collectionAction = canCountSto
      ? '<button class="btn btn-sm btn-primary" type="button" data-sto-bulk-count>Simpan Semua Input</button>'
      : `<span>${num(rows.length, 0)} baris</span>`;
    return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2>${collectionAction}</div>${canCountSto ? '<p class="ops-help px-3">Blind count aktif: qty sistem disembunyikan selama counting. Isi beberapa atau semua physical count, lalu simpan sekaligus.</p>' : ""}<div class="table-responsive ${isProductionDetail() ? "production-excel-wrap" : ""}"><table class="table ops-collection-table ${isProductionDetail() ? "production-excel-table" : ""}"><thead><tr>${selectionHead}${columnKeys.map((name) => `<th>${esc(label(name))}</th>`).join("")}${countHead}${inspectionHead}${suggestionConfirmationHead}</tr></thead><tbody>${rows.map((row) => `<tr>${selectionCell(row)}${columnKeys.map((name) => `<td>${cell(row?.[name], name, row)}</td>`).join("")}${countCell(row)}${inspectionCell(row)}${suggestionConfirmationCell(row)}</tr>`).join("")}</tbody></table></div></section>`;
  }
  function renderObject(key, object) {
    const entries = scalarEntries(object);
    if (!entries.length) return "";
    if (isProductionDetail()) return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>Referensi</span></div><div class="production-excel-wrap"><table class="table ops-collection-table production-excel-table"><thead><tr>${entries.slice(0, 24).map(([name]) => `<th>${esc(label(name))}</th>`).join("")}</tr></thead><tbody><tr>${entries.slice(0, 24).map(([name, value]) => `<td>${linkedValue(value, name, object)}</td>`).join("")}</tr></tbody></table></div></section>`;
    return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>Referensi</span></div><div class="ops-detail-fields">${entries.slice(0, 12).map(([name, value]) => `<div><small>${esc(label(name))}</small><strong>${linkedValue(value, name, object)}</strong></div>`).join("")}</div></section>`;
  }
  const isMonthlyPlanPage = () => config.module === "planning-ppic" && config.page.slug === "monthly-production-plans";
  function referenceLink(reference, className = "mpp-reference-link") {
    if (!reference?.href || !reference?.label) return "";
    return `<a class="${esc(className)}" href="${esc(reference.href)}"><span>${esc(reference.type || "REF")}</span><b>${esc(reference.label)}</b><i aria-hidden="true">→</i></a>`;
  }
  function referenceLinks(references, emptyText = "Belum ada referensi") {
    const rows = (Array.isArray(references) ? references : []).filter((reference) => reference?.href && reference?.label);
    return rows.length
      ? `<div class="mpp-reference-list">${rows.map((reference) => referenceLink(reference)).join("")}</div>`
      : `<span class="ops-muted">${esc(emptyText)}</span>`;
  }
  function monthlyPlanSummaryFields(record) {
    const planned = number(record.targetQty);
    const released = number(record.actualQty);
    const outstanding = Math.max(planned - released, 0);
    const references = (record.documentReferences || []).map((reference) => referenceLink(reference, "mpp-inline-link")).join("");
    $("ops-detail-fields").innerHTML = [
      ["Periode Produksi", `${esc(format(record.periodStart, "date"))}<small class="mpp-field-sub">sampai ${esc(format(record.periodEnd, "date"))}</small>`],
      ["Sumber Perencanaan", references || '<span class="ops-muted">Manual / belum terhubung</span>'],
      ["Target Produksi", `${esc(num(planned))} <small class="mpp-uom">pcs</small>`],
      ["Sudah Direlease", `${esc(num(released))} <small class="mpp-uom">pcs</small>`],
      ["Outstanding Plan", `${esc(num(outstanding))} <small class="mpp-uom">pcs</small>`],
      ["Komposisi Baris", `${esc(num(record.receiptLineCount, 0))} FG receipt · ${esc(num(record.childReceiptLineCount, 0))} child receipt · ${esc(num(record.processLineCount, 0))} process`],
      ["Forecast", esc(num(record.forecastQty))],
      ["Actual Sales Order", esc(num(record.actualSalesOrderQty))],
      ["Buffer Stock", esc(num(record.bufferQty))],
    ].map(([name, value]) => `<div><small>${esc(name)}</small><strong>${value}</strong></div>`).join("");
  }
  function monthlyPlanReadinessCard(record) {
    const readiness = record.planReadiness || { ready: false, summary: {}, issues: [] };
    const summary = readiness.summary || {};
    const issues = Array.isArray(readiness.issues) ? readiness.issues : [];
    const state = readiness.releaseReady ? "ready" : "blocked";
    const stateLabel = readiness.releaseReady
      ? "Siap Release"
      : `${num(summary.blocking, 0)} blocker · ${num(summary.overridable, 0)} override`;
    const issueRows = issues.length
      ? issues.map((issue) => {
        const severity = String(issue.severity || "WARNING").toUpperCase();
        const references = (issue.references || []).filter((reference, index, rows) =>
          rows.findIndex((candidate) => candidate.href === reference.href && candidate.label === reference.label) === index);
        return `<article class="mpp-blocker mpp-blocker--${esc(severity.toLowerCase())}">
          <div class="mpp-blocker-mark">${severity === "BLOCKING" ? "!" : severity === "OVERRIDABLE" ? "↗" : "i"}</div>
          <div class="mpp-blocker-copy">
            <div><span>${esc(severity)}</span><b>${esc(issue.code || "PLAN_CHECK")}</b></div>
            <h3>${esc(issue.title || issue.partName || issue.partCode || "Pemeriksaan Production Plan")}</h3>
            <p>${esc(issue.message || "-")}</p>
            ${references.length ? `<div class="mpp-blocker-links">${references.map((reference) => referenceLink(reference, "mpp-fix-link")).join("")}</div>` : ""}
          </div>
        </article>`;
      }).join("")
      : `<div class="mpp-ready-empty"><b>Tidak ada blocker aktif</b><span>Routing, kapasitas, material, supplier, dan lead time memenuhi rule release.</span></div>`;
    return `<section class="ops-detail-card mpp-readiness-card">
      <div class="ops-collection-head">
        <div><h2>Plan Readiness & Blocker</h2><p>Gabungan pemeriksaan Capacity Planning dan Material Readiness untuk plan ini.</p></div>
        <span class="mpp-readiness-state ${state}">${esc(stateLabel)}</span>
      </div>
      <div class="mpp-readiness-stats">
        <div><small>Blocking</small><strong>${num(summary.blocking, 0)}</strong></div>
        <div><small>Overridable</small><strong>${num(summary.overridable, 0)}</strong></div>
        <div><small>Warning</small><strong>${num(summary.warning, 0)}</strong></div>
        <div><small>FG Receipt (tanpa routing)</small><strong>${num(summary.receiptOnlyFg, 0)}</strong></div>
      </div>
      <div class="mpp-blocker-list">${issueRows}</div>
    </section>`;
  }
  function monthlyPlanDetailsCard(record) {
    const rows = Array.isArray(record.details) ? record.details : [];
    const body = rows.map((row) => {
      const part = row.part || {};
      const partReference = (row.referenceLinks || []).find((reference) => reference.type === "PART");
      const otherReferences = (row.referenceLinks || []).filter((reference) => reference.type !== "PART");
      const outstanding = Math.max(number(row.qtyPlanned) - number(row.qtyReleased), 0);
      const isParentFg = row.lineType === "FG Receipt";
      return `<tr>
        <td class="text-center"><b>${esc(row.lineNumber)}</b></td>
        <td><span class="mpp-line-type ${esc(slug(row.lineType))}">${esc(row.lineType || "Plan Line")}</span></td>
        <td class="mpp-part-cell">
          ${partReference ? `<a href="${esc(partReference.href)}"><b>${esc(part.partCode || row.partCode)}</b><span>${esc(part.partName || row.displayName || "-")}</span>${part.partNumber ? `<small>Drawing: ${esc(part.partNumber)}</small>` : ""}</a>` : `<b>${esc(row.partCode)}</b><span>${esc(row.displayName || "-")}</span>`}
        </td>
        <td><div class="mpp-qty-stack"><span>Forecast <b>${num(row.forecastQty)}</b></span><span>SO <b>${num(row.actualSalesOrderQty)}</b></span><span>Buffer <b>${num(row.bufferQty)}</b></span><span>Effective <b>${num(row.effectiveDemandQty)}</b></span></div></td>
        <td class="ops-number"><b>${num(row.qtyPlanned)}</b><small>${esc(row.uomCode || "")}</small></td>
        <td class="ops-number">${isParentFg ? `<b>${num(row.qtyReleased)}</b><small>released ke MO</small>` : '<span class="mpp-parent-execution">Via FG parent</span>'}</td>
        <td class="ops-number">${isParentFg ? `<b>${num(outstanding)}</b><small>remaining MO</small>` : '<span class="mpp-parent-execution">Routing / Daily Plan</span>'}</td>
        <td><b>${num(row.productionPercent, 1)}%</b></td>
        <td>${esc(format(row.requiredDate, "date"))}</td>
        <td>${badge(row.status)}</td>
        <td>${referenceLinks(otherReferences, "Referensi mengikuti MPS")}</td>
      </tr>`;
    }).join("");
    return `<section class="ops-detail-card mpp-lines-card">
      <div class="ops-collection-head"><div><h2>Detail Monthly Production Plan</h2><p>FG receipt ditampilkan sebagai milestone. Routing hanya diwajibkan untuk baris proses produksi.</p></div><span>${num(rows.length, 0)} baris</span></div>
      <div class="table-responsive"><table class="table ops-collection-table mpp-lines-table">
        <thead><tr><th>No.</th><th>Tipe</th><th>Part</th><th>Demand</th><th>Planned</th><th>Released</th><th>Outstanding</th><th>Produksi</th><th>Required</th><th>Status</th><th>Referensi</th></tr></thead>
        <tbody>${body || '<tr><td colspan="11" class="text-center py-4">Belum ada detail Production Plan.</td></tr>'}</tbody>
      </table></div>
    </section>`;
  }
  function monthlyPlanMaterialCard(record) {
    const readiness = record.materialReadiness || {};
    const rows = Array.isArray(readiness.items) ? readiness.items : [];
    const body = rows.map((row) => {
      const orderHref = row.orderNumber ? `/modules/planning-ppic/planned-orders/${encodeURIComponent(row.orderNumber)}` : null;
      const partHref = row.partCode ? `/master-data/parts/${encodeURIComponent(row.partCode)}/edit?key=${encodeURIComponent(row.partCode)}` : null;
      const purchaseReferences = [
        ...(row.prNumbers || []).map((numberValue) => ({ label: `PR ${numberValue}`, href: `/modules/purchasing/purchase-requisitions/${encodeURIComponent(numberValue)}` })),
        ...(row.poNumbers || []).map((numberValue) => ({ label: `PO ${numberValue}`, href: `/modules/purchasing/purchase-order/${encodeURIComponent(numberValue)}` })),
      ];
      return `<tr>
        <td>${orderHref ? `<a class="ops-link" href="${esc(orderHref)}">${esc(row.orderNumber)}</a>` : "-"}</td>
        <td class="mpp-part-cell">${partHref ? `<a href="${esc(partHref)}"><b>${esc(row.partCode)}</b><span>${esc(row.partName || row.partNumber || "-")}</span></a>` : esc(row.partName || row.partCode || "-")}</td>
        <td class="ops-number">${num(row.requiredQty)} <small>${esc(row.uomCode || "")}</small></td>
        <td class="ops-number">${num(row.stockAvailable)}</td>
        <td><b>${esc(row.supplierName || row.supplierCode || "Belum dipilih")}</b><small class="d-block">${row.leadTimeDays ? `${num(row.leadTimeDays, 0)} hari lead time` : "Lead time belum tersedia"}</small></td>
        <td>${purchaseReferences.length ? purchaseReferences.map((reference) => `<a class="ops-link d-block" href="${esc(reference.href)}">${esc(reference.label)}</a>`).join("") : '<span class="ops-muted">Belum ada PR/PO</span>'}</td>
        <td>${badge(row.ready ? "Ready" : "Blocked")}</td>
      </tr>`;
    }).join("");
    return `<section class="ops-detail-card mpp-material-card">
      <div class="ops-collection-head"><div><h2>Material & Purchasing Readiness</h2><p>Stock, supplier, lead time, PR, dan PO berdasarkan MRP current.</p></div><span>${num(readiness.summary?.blocking, 0)} blocker</span></div>
      <div class="table-responsive"><table class="table ops-collection-table mpp-material-table">
        <thead><tr><th>Planned Order</th><th>Material / Purchase Part</th><th>Required</th><th>Stock</th><th>Supplier & Lead Time</th><th>Purchasing</th><th>Status</th></tr></thead>
        <tbody>${body || '<tr><td colspan="7" class="text-center py-4">Tidak ada kebutuhan purchase aktif untuk plan ini.</td></tr>'}</tbody>
      </table></div>
    </section>`;
  }
  function renderMonthlyPlanCollections(record) {
    $("ops-detail-collections").innerHTML = [
      monthlyPlanReadinessCard(record),
      monthlyPlanDetailsCard(record),
      monthlyPlanMaterialCard(record),
    ].join("");
  }
  function collectDocumentReferences(record) {
    const references = [];
    const visit = (value, path = "", depth = 0) => {
      if (depth > 4 || value == null) return;
      if (Array.isArray(value)) {
        value.slice(0, 100).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
        return;
      }
      if (typeof value !== "object") {
        const key = path.split(".").pop()?.replace(/\[\d+\]$/, "") || path;
        splitReferenceValues(value).forEach((item) => {
          const reference = resolveReference(key, item);
          if (reference) references.push({ ...reference, relation: label(key) });
        });
        return;
      }
      if (value.href && value.label) {
        references.push({ type: value.type || "Reference", label: value.label, href: value.href, relation: value.relation || label(path.split(".").pop()) });
      }
      Object.entries(value).forEach(([key, nested]) => {
        if (!isInternalKey(key) || /Number$|Code$/i.test(key)) visit(nested, path ? `${path}.${key}` : key, depth + 1);
      });
    };
    visit(record);
    return references.filter((reference, index, rows) =>
      reference.href
      && reference.label
      && rows.findIndex((candidate) => candidate.href === reference.href && candidate.label === reference.label) === index
      && !(reference.label === config.recordKey && reference.href === location.pathname));
  }
  function relatedDocumentsCard(record) {
    const references = collectDocumentReferences(record);
    const body = references.map((reference, index) => `<tr>
      <td class="text-center">${num(index + 1, 0)}</td>
      <td><span class="mpp-line-type">${esc(reference.type)}</span></td>
      <td><a class="ops-reference-name" href="${esc(reference.href)}"><b>${esc(reference.label)}</b><small>Buka detail reference</small></a></td>
      <td>${esc(reference.relation || "Relasi dokumen")}</td>
      <td><a class="mpp-fix-link" href="${esc(reference.href)}">Lihat detail <i aria-hidden="true">→</i></a></td>
    </tr>`).join("");
    return `<section class="ops-detail-card ops-reference-card">
      <details class="ops-related-disclosure">
        <summary class="ops-collection-head"><div><h2>Dokumen & Master Terkait</h2><p>Klik untuk melihat seluruh link referensi.</p></div><div class="ops-related-summary-meta"><span>${num(references.length, 0)} relasi</span><b aria-hidden="true">⌄</b></div></summary>
        <div class="table-responsive"><table class="table ops-collection-table ops-reference-table">
          <thead><tr><th>No.</th><th>Tipe</th><th>Reference</th><th>Relasi</th><th>Aksi</th></tr></thead>
          <tbody>${body || '<tr><td colspan="5" class="text-center py-4">Belum ada dokumen terkait yang dapat dibuka.</td></tr>'}</tbody>
        </table></div>
      </details>
    </section>`;
  }
  function collectBlockers(record) {
    const candidates = [
      ...(Array.isArray(record.blockers) ? record.blockers : []),
      ...(Array.isArray(record.validationIssues) ? record.validationIssues : []),
      ...(Array.isArray(record.readiness?.issues) ? record.readiness.issues : []),
      ...(Array.isArray(record.planReadiness?.issues) ? record.planReadiness.issues : []),
      ...(Array.isArray(record.materialReadiness?.issues) ? record.materialReadiness.issues : []),
      ...(Array.isArray(record.materialReadiness?.items)
        ? record.materialReadiness.items.filter((item) => item.ready === false).map((item) => ({
          severity: "BLOCKING",
          code: item.code || "MATERIAL_NOT_READY",
          title: item.partName || item.partCode || item.orderNumber,
          message: item.message || `Kebutuhan ${item.requiredQty ?? "-"} belum tertutup stock/PO.`,
          references: [
            item.partCode ? resolveReference("partCode", item.partCode) : null,
            item.orderNumber ? { type: "Planned Order", label: item.orderNumber, href: `/modules/planning-ppic/planned-orders/${encodeURIComponent(item.orderNumber)}` } : null,
          ].filter(Boolean),
        })) : []),
    ];
    if (record.unscheduledReason) candidates.push({ severity: "BLOCKING", code: "UNSCHEDULED", title: "Belum terjadwal", message: record.unscheduledReason });
    return candidates.filter((issue, index, rows) => {
      const key = `${issue.code || ""}|${issue.message || ""}|${issue.partCode || ""}`;
      return rows.findIndex((candidate) => `${candidate.code || ""}|${candidate.message || ""}|${candidate.partCode || ""}` === key) === index;
    });
  }
  function blockerCard(record) {
    const issues = collectBlockers(record);
    const blockerReferences = (issue) => {
      const code = String(issue.code || "").toUpperCase();
      const references = [
        ...(Array.isArray(issue.references) ? issue.references : []),
        issue.partCode ? resolveReference("partCode", issue.partCode) : null,
        issue.moNumber ? resolveReference("moNumber", issue.moNumber) : null,
        issue.woNumber ? resolveReference("woNumber", issue.woNumber) : null,
        issue.productionLogNumber ? resolveReference("productionLogNumber", issue.productionLogNumber) : null,
      ].filter(Boolean);
      if (/ROUTING|BOM|PROCESS|PREDECESSOR|SUCCESSOR/.test(code)) references.push({ type: "Capacity", label: "Ubah capacity / routing", href: "/modules/planning-ppic/capacity-planning" });
      if (/CAPACITY|MACHINE|SHIFT|SCHEDULE|PRESET/.test(code)) references.push({ type: "Capacity", label: "Buka capacity planning", href: "/modules/planning-ppic/capacity-planning" });
      if (/MATERIAL|STOCK|INVENTORY|SHORTAGE/.test(code)) references.push({ type: "Stock", label: "Periksa stock balance", href: `/modules/inventory/stock-balances${issue.partCode ? `?q=${encodeURIComponent(issue.partCode)}` : ""}` });
      if (/QC|QUALITY|INSPECTION/.test(code)) references.push({ type: "QC", label: "Buka quality inspection", href: "/modules/production/quality-inspections" });
      if (/LOG|OUTPUT|PRODUCTION/.test(code)) references.push({ type: "Produksi", label: "Buka production log", href: "/modules/production/production-logs" });
      if (!references.length) references.push({ type: "Produksi", label: "Buka daftar terkait", href: `/modules/production/${encodeURIComponent(config.page.slug)}` });
      return references.filter((reference, index, rows) => reference?.href && rows.findIndex((candidate) => candidate?.href === reference.href && candidate?.label === reference.label) === index);
    };
    if (isProductionDetail()) {
      const body = issues.map((issue) => {
        const severity = String(issue.severity || "WARNING").toUpperCase();
        const references = blockerReferences(issue);
        return `<tr><td>${badge(severity)}</td><td><b>${esc(issue.code || "DOCUMENT_CHECK")}</b></td><td>${esc(issue.title || issue.partName || issue.partCode || "Pemeriksaan dokumen")}</td><td>${esc(issue.message || issue.reason || "-")}</td><td>${referenceLinks(references, "Tidak ada link")}</td></tr>`;
      }).join("");
      return `<section class="ops-detail-card mpp-readiness-card"><div class="ops-collection-head"><div><h2>Readiness & Blocker</h2><p>Gunakan link resolusi untuk membuka data atau setting yang perlu diperbaiki.</p></div><span class="mpp-readiness-state ${issues.length ? "blocked" : "ready"}">${issues.length ? `${num(issues.length, 0)} blocker` : "Ready"}</span></div><div class="production-excel-wrap"><table class="table ops-collection-table production-excel-table production-blocker-table"><thead><tr><th>Severity</th><th>Code</th><th>Item</th><th>Pesan</th><th>Link Resolusi</th></tr></thead><tbody>${body || '<tr><td colspan="5"><div class="mpp-ready-empty"><b>Tidak ada blocker aktif</b><span>Dokumen dapat mengikuti workflow sesuai statusnya.</span></div></td></tr>'}</tbody></table></div></section>`;
    }
    const rows = issues.map((issue) => {
      const severity = String(issue.severity || "WARNING").toUpperCase();
      const references = blockerReferences(issue);
      return `<article class="mpp-blocker mpp-blocker--${esc(severity.toLowerCase())}">
        <div class="mpp-blocker-mark">${severity === "BLOCKING" ? "!" : severity === "OVERRIDABLE" ? "↗" : "i"}</div>
        <div class="mpp-blocker-copy"><div><span>${esc(severity)}</span><b>${esc(issue.code || "DOCUMENT_CHECK")}</b></div>
          <h3>${esc(issue.title || issue.partName || issue.partCode || "Pemeriksaan dokumen")}</h3>
          <p>${esc(issue.message || issue.reason || "-")}</p>
          ${references.length ? `<div class="mpp-blocker-links">${references.map((reference) => referenceLink(reference, "mpp-fix-link")).join("")}</div>` : ""}
        </div>
      </article>`;
    }).join("");
    return `<section class="ops-detail-card mpp-readiness-card">
      <div class="ops-collection-head"><div><h2>Readiness & Blocker</h2><p>Blocker aktif yang berkaitan langsung dengan dokumen ini.</p></div><span class="mpp-readiness-state ${issues.length ? "blocked" : "ready"}">${issues.length ? `${num(issues.length, 0)} blocker` : "Ready"}</span></div>
      <div class="mpp-blocker-list">${rows || '<div class="mpp-ready-empty"><b>Tidak ada blocker aktif</b><span>Dokumen dapat mengikuti workflow sesuai statusnya.</span></div>'}</div>
    </section>`;
  }
  function renderCollections(record) {
    const handled = new Set(["blockers", "validationIssues", "readiness", "planReadiness", "materialReadiness", "documentReferences", "referenceLinks"]);
    const html = Object.entries(record || {}).filter(([key, value]) => !handled.has(key) && value && typeof value === "object").map(([key, value]) => Array.isArray(value) ? renderArray(key, value, record) : renderObject(key, value)).join("");
    if (config.module === "purchasing" && config.page.slug === "purchase-suggestions") {
      // Each material card already exposes its MRP, demand, SO/forecast, and supplier
      // references. Keep the primary purchasing task above the fold instead of
      // repeating those links in the generic relationship table.
      $("ops-detail-collections").innerHTML = html;
      return;
    }
    $("ops-detail-collections").innerHTML = [blockerCard(record), relatedDocumentsCard(record), html].join("");
  }
  function renderMeta(record) {
    const keys = ["createdAt", "createdBy", "updatedAt", "updatedBy", "approvedAt", "approvedBy", "releasedAt", "releasedBy"].filter((key) => record[key] != null);
    $("ops-document-meta").innerHTML = (keys.length ? keys : [config.page.detailKey]).map((key) => `<div><span>${esc(label(key))}</span><strong>${esc(format(record[key] ?? config.recordKey, key))}</strong></div>`).join("");
  }
  function actionButton(action, text, style = "outline-primary", note = "") {
    return `<button type="button" class="btn btn-${style}" data-workflow-action="${esc(action)}">${esc(text)}</button>${note ? `<small>${esc(note)}</small>` : ""}`;
  }
  async function collectPurchaseOrderLines(selected) {
    const supplierRows = await api("/master-data/api/suppliers?start=0&length=500&isDeleted=false");
    const suppliers = Array.isArray(supplierRows) ? supplierRows : [];
    const supplierOptions = (selectedCode = "") => [
      '<option value="">Pilih supplier</option>',
      ...suppliers.map((supplier) => `<option value="${esc(supplier.supplierCode)}" ${supplier.supplierCode === selectedCode ? "selected" : ""}>${esc(supplier.supplierCode)} — ${esc(supplier.supplierName || "")}</option>`),
    ].join("");
    const modalLines = selected.flatMap((checkbox) => {
      const detail = (currentRecord?.details || []).find((row) => String(row.id) === String(checkbox.dataset.prDetailId));
      const saved = (detail?.sourcingAllocations || []).filter((allocation) =>
        !allocation.isDeleted && !["Ordered", "Cancelled"].includes(allocation.status));
      return (saved.length ? saved : [null]).map((allocation) => ({ checkbox, allocation }));
    });
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop";
    overlay.innerHTML = `
      <form class="ops-modal ops-purchase-conversion-form">
        <header><div><p class="ops-eyebrow">Purchasing Decision</p><h2>Supplier & Bentuk Pembelian</h2><p>Qty kebutuhan tetap mengikuti PR. Purchasing menentukan supplier, COIL/SHEET/PCS, serta isi KG atau PCS per bentuk.</p></div><button type="button" class="btn-close" data-modal-cancel aria-label="Tutup"></button></header>
        <div class="ops-modal-body">
          <div class="alert alert-info">Satu kebutuhan boleh dipecah ke beberapa supplier, bentuk material, dan delivery phase. Total boleh UNDER, EXACT, atau OVER; selisih ditampilkan sebagai kontrol dan tidak memblokir pembuatan PO.</div>
          <div class="table-responsive"><table class="table ops-collection-table"><thead><tr><th>Baris</th><th>Outstanding</th><th>Alokasi Demand</th><th>Supplier</th><th>Bentuk</th><th>Isi / Bentuk</th><th>UOM Hasil</th><th>Qty Bentuk</th><th>Coverage</th><th>Delivery</th><th>Harga / Bentuk</th></tr></thead><tbody>
            ${modalLines.map(({ checkbox, allocation }) => {
              const rawMaterial = checkbox.dataset.rawMaterial === "true";
              const outstanding = number(checkbox.dataset.outstanding);
              const sourceQty = allocation ? number(allocation.demandCoveredQty) : outstanding;
              const requestUom = checkbox.dataset.requestUom || "KG";
              const savedConversionUom = allocation?.conversionUomCode || checkbox.dataset.conversionUom;
              const conversionUom = ["KG", "PCS"].includes(savedConversionUom) ? savedConversionUom : requestUom;
              const initialFactor = number(allocation?.conversionFactor ?? checkbox.dataset.conversionFactor);
              const initialPackageQty = number(allocation?.purchasePackageQty ?? checkbox.dataset.packageQty) || (initialFactor > 0 ? Math.ceil(sourceQty / initialFactor) : 0);
              const initialForm = allocation?.purchasePackageUomCode || checkbox.dataset.packageUom;
              return `<tr data-po-modal-line data-pr-detail-id="${esc(checkbox.dataset.prDetailId)}" data-sourcing-allocation-id="${esc(allocation?.id || "")}" data-outstanding="${esc(outstanding)}" data-request-uom="${esc(requestUom)}" data-raw-material="${rawMaterial ? "true" : "false"}">
                <td><b>${esc(checkbox.dataset.lineNumber)}</b><div class="d-flex gap-1 mt-1"><button class="btn btn-sm btn-outline-primary" type="button" data-po-add-allocation>+ Phase</button><button class="btn btn-sm btn-outline-danger invisible" type="button" data-po-remove-allocation>x</button></div></td>
                <td>${esc(num(sourceQty))} ${rawMaterial ? esc(requestUom) : ""}</td>
                <td><input class="form-control form-control-sm" data-po-source-qty type="number" min="0.000001" step="any" value="${esc(sourceQty)}" required></td>
                <td><select class="form-select form-select-sm" data-po-supplier required>${supplierOptions(allocation?.supplierCode || checkbox.dataset.supplierCode || "")}</select></td>
                <td>${rawMaterial ? `<select class="form-select form-select-sm" data-po-form><option value="SHEET" ${initialForm === "SHEET" ? "selected" : ""}>SHEET</option><option value="COIL" ${initialForm === "COIL" ? "selected" : ""}>COIL</option><option value="PCS" ${initialForm === "PCS" ? "selected" : ""}>PCS</option></select>` : '<span class="ops-muted">Sesuai PR</span>'}</td>
                <td>${rawMaterial ? `<input class="form-control form-control-sm" data-po-factor type="text" inputmode="decimal" value="${esc(initialFactor || "")}" required>` : "-"}</td>
                <td>${rawMaterial ? `<select class="form-select form-select-sm" data-po-conversion-uom><option value="KG" ${conversionUom === "KG" ? "selected" : ""}>KG</option><option value="PCS" ${conversionUom === "PCS" ? "selected" : ""}>PCS</option></select>` : "-"}</td>
                <td>${rawMaterial ? `<input class="form-control form-control-sm" data-po-package-qty type="number" min="1" step="1" value="${esc(initialPackageQty || "")}" required>` : "-"}</td>
                <td data-po-coverage>${rawMaterial && initialFactor && initialPackageQty ? `${esc(num(initialFactor * initialPackageQty))} ${esc(conversionUom)}` : rawMaterial ? `0 ${esc(conversionUom)}` : "Sesuai request"}</td>
                <td><input class="form-control form-control-sm" data-po-delivery-date type="date" value="${esc(String(allocation?.deliveryDate || checkbox.dataset.requiredDate || new Date().toISOString().slice(0, 10)).slice(0, 10))}" required></td>
                <td><input class="form-control form-control-sm" data-po-unit-price type="number" min="0" step="any" value="${allocation?.unitPrice ?? ""}" placeholder="Opsional"></td>
              </tr>`;
            }).join("")}
          </tbody></table></div>
          <div class="alert alert-secondary" data-po-allocation-summary></div>
          <div class="ops-modal-grid"><label><span>Draft PO tujuan</span><input class="form-control" data-po-target placeholder="Opsional, mis. P-PO/S001/07/2026/01"><small>Kosongkan untuk membuat Draft PO baru per supplier/currency/delivery.</small></label></div>
          <div class="alert alert-danger d-none" data-modal-alert></div>
        </div>
        <footer><button type="button" class="btn btn-outline-secondary" data-modal-cancel>Batal</button><button type="submit" class="btn btn-primary">Konfirmasi & Buat Draft PO</button></footer>
      </form>`;
    document.body.appendChild(overlay);
    const refreshCoverage = (row) => {
      if (row.dataset.rawMaterial !== "true") return;
      const factor = number(row.querySelector("[data-po-factor]")?.value);
      const packageQty = number(row.querySelector("[data-po-package-qty]")?.value);
      const conversionUom = row.querySelector("[data-po-conversion-uom]")?.value || row.dataset.requestUom || "KG";
      row.querySelector("[data-po-coverage]").textContent = `${num(factor * packageQty)} ${conversionUom}`;
    };
    const refreshAllocationStatus = () => {
      const controls = new Map();
      overlay.querySelectorAll("[data-po-modal-line]").forEach((row) => {
        const current = controls.get(row.dataset.prDetailId) || { required: number(row.dataset.outstanding), allocated: 0 };
        current.allocated += number(row.querySelector("[data-po-source-qty]")?.value);
        controls.set(row.dataset.prDetailId, current);
      });
      overlay.querySelector("[data-po-allocation-summary]").innerHTML = [...controls].map(([detailId, control]) => {
        const variance = control.allocated - control.required;
        const status = Math.abs(variance) <= 0.000001 ? "EXACT" : variance < 0 ? "UNDER" : "OVER";
        return `<b>${esc(detailId)}: ${status}</b> ${esc(num(control.allocated))} / ${esc(num(control.required))} (${variance >= 0 ? "+" : ""}${esc(num(variance))})`;
      }).join("<br>");
    };
    overlay.addEventListener("input", (event) => {
      const row = event.target.closest("[data-po-modal-line]");
      if (row) refreshCoverage(row);
      refreshAllocationStatus();
    });
    overlay.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-po-add-allocation]");
      if (addButton) {
        const sourceRow = addButton.closest("[data-po-modal-line]");
        const clone = sourceRow.cloneNode(true);
        clone.dataset.sourcingAllocationId = "";
        clone.querySelector("[data-po-source-qty]").value = "";
        clone.querySelector("[data-po-package-qty]")?.setAttribute("value", "");
        if (clone.querySelector("[data-po-package-qty]")) clone.querySelector("[data-po-package-qty]").value = "";
        clone.querySelector("[data-po-unit-price]").value = "";
        clone.querySelector("[data-po-coverage]").textContent = `0 ${clone.dataset.requestUom || "KG"}`;
        clone.querySelector("[data-po-remove-allocation]").classList.remove("invisible");
        sourceRow.after(clone);
        refreshAllocationStatus();
        return;
      }
      const removeButton = event.target.closest("[data-po-remove-allocation]");
      if (removeButton) {
        removeButton.closest("[data-po-modal-line]").remove();
        refreshAllocationStatus();
      }
    });
    refreshAllocationStatus();
    return new Promise((resolve) => {
      const close = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelectorAll("[data-modal-cancel]").forEach((button) => button.addEventListener("click", () => close(null)));
      overlay.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const alertBox = overlay.querySelector("[data-modal-alert]");
        const lines = [];
        for (const row of overlay.querySelectorAll("[data-po-modal-line]")) {
          const sourceQty = number(row.querySelector("[data-po-source-qty]").value);
          if (sourceQty <= 0) {
            alertBox.textContent = "Qty alokasi demand setiap supplier/phase harus lebih dari 0.";
            alertBox.classList.remove("d-none");
            return;
          }
          const supplierCode = row.querySelector("[data-po-supplier]").value;
          if (!supplierCode) {
            alertBox.textContent = `Supplier baris ${row.dataset.prDetailId} wajib dipilih.`;
            alertBox.classList.remove("d-none");
            return;
          }
          const line = {
            prDetailId: row.dataset.prDetailId,
            sourcingAllocationId: row.dataset.sourcingAllocationId || null,
            supplierCode,
            sourceQty,
            deliveryDate: row.querySelector("[data-po-delivery-date]").value,
            unitPrice: row.querySelector("[data-po-unit-price]").value === ""
              ? null
              : number(row.querySelector("[data-po-unit-price]").value),
          };
          if (row.dataset.rawMaterial === "true") {
            const purchasePackageUomCode = row.querySelector("[data-po-form]").value;
            const conversionFactor = number(row.querySelector("[data-po-factor]").value);
            const purchasePackageQty = number(row.querySelector("[data-po-package-qty]").value);
            const conversionUomCode = row.querySelector("[data-po-conversion-uom]").value;
            const requestUomCode = row.dataset.requestUom || "KG";
            if (conversionFactor <= 0 || !Number.isInteger(purchasePackageQty) || purchasePackageQty <= 0) {
              alertBox.textContent = "Isi KG/PCS per bentuk harus lebih dari 0 dan qty bentuk harus bilangan bulat positif.";
              alertBox.classList.remove("d-none");
              return;
            }
            if (conversionUomCode !== requestUomCode) {
              alertBox.textContent = `UOM hasil ${conversionUomCode} harus sama dengan UOM kebutuhan ${requestUomCode}.`;
              alertBox.classList.remove("d-none");
              return;
            }
            Object.assign(line, {
              orderUomCode: purchasePackageUomCode,
              orderQty: purchasePackageQty,
              purchasePackageUomCode,
              purchasePackageQty,
              conversionUomCode,
              conversionFactor,
            });
          }
          lines.push(line);
        }
        close({ lines, targetPoNumber: overlay.querySelector("[data-po-target]").value.trim() || null });
      });
    });
  }
  async function collectManualCompleteLocation() {
    const [warehouseRows, rackRows] = await Promise.all([
      api("/modules/api/inventory/warehouses?limit=500&isActive=true"),
      api("/modules/api/inventory/racks?limit=1000&isActive=true"),
    ]);
    const warehouses = (Array.isArray(warehouseRows) ? warehouseRows : [])
      .filter((row) => row.warehouseCode && row.isActive !== false);
    const racks = (Array.isArray(rackRows) ? rackRows : [])
      .filter((row) => row.rackCode && row.isActive !== false);
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop";
    overlay.innerHTML = `
      <form class="ops-modal" data-manual-complete-form>
        <header>
          <div>
            <p class="ops-eyebrow">Manual Complete PO</p>
            <h2>Lokasi Penerimaan Sisa PO</h2>
            <p>Sisa qty PO akan diposting langsung ke stok pada warehouse dan rack yang dipilih.</p>
          </div>
          <button type="button" class="btn-close" data-modal-cancel aria-label="Tutup"></button>
        </header>
        <div class="ops-modal-body">
          <div class="ops-modal-grid">
            <label>
              <span>Warehouse *</span>
              <select class="form-select" data-manual-warehouse required>
                <option value="">${warehouses.length ? "Pilih warehouse" : "Warehouse aktif belum tersedia"}</option>
                ${warehouses.map((row) => `<option value="${esc(row.warehouseCode)}">${esc(row.warehouseCode)} — ${esc(row.warehouseName || "")}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Rack</span>
              <select class="form-select" data-manual-rack>
                <option value="">Pilih warehouse terlebih dahulu</option>
              </select>
            </label>
          </div>
          <div class="alert alert-warning">${warehouses.length ? "Gunakan Goods Receipt jika penerimaan harus melalui Incoming Inspection/QC. Complete Manual langsung menyelesaikan sisa PO dan membuat stock movement." : "Warehouse aktif belum tersedia. Tambahkan dahulu melalui Master Data → Gudang."}</div>
        </div>
        <footer>
          <button type="button" class="btn btn-outline-secondary" data-modal-cancel>Batal</button>
          <button type="submit" class="btn btn-primary" ${warehouses.length ? "" : "disabled"}>Selesaikan PO</button>
        </footer>
      </form>`;
    document.body.appendChild(overlay);
    const warehouseSelect = overlay.querySelector("[data-manual-warehouse]");
    const rackSelect = overlay.querySelector("[data-manual-rack]");
    const refreshRacks = () => {
      const warehouseCode = warehouseSelect.value;
      const matchingRacks = racks.filter((row) => row.warehouseCode === warehouseCode);
      rackSelect.innerHTML = `<option value="">${warehouseCode ? "Tanpa rack" : "Pilih warehouse terlebih dahulu"}</option>${matchingRacks.map((row) => `<option value="${esc(row.rackCode)}">${esc(row.rackCode)} — ${esc(row.rackName || row.zone || "")}</option>`).join("")}`;
    };
    warehouseSelect.addEventListener("change", refreshRacks);
    return new Promise((resolve) => {
      const close = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelectorAll("[data-modal-cancel]").forEach((button) => button.addEventListener("click", () => close(null)));
      overlay.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        close({
          warehouseCode: overlay.querySelector("[data-manual-warehouse]").value,
          rackCode: overlay.querySelector("[data-manual-rack]").value || null,
        });
      });
    });
  }
  function workflowActions(record) {
    const status = String(record.status || "Draft").toLowerCase();
    let html = "";
    if (config.module === "planning-ppic" && config.page.slug === "monthly-production-plans") {
      if (status === "draft") html += actionButton("confirm-monthly-plan", "Confirm Monthly Plan", "primary");
      if (status === "confirmed") {
        html += `<a class="btn btn-outline-primary" href="/modules/planning-ppic/capacity-planning?planNumber=${encodeURIComponent(record.planNumber || config.recordKey)}">Buka Capacity Check</a>`;
        html += actionButton("release-monthly-plan", "Capacity Check & Release", "primary");
      }
      if (/released|in progress/.test(status)) {
        const remainingLines = (record.details || []).filter((row) =>
          row.lineType === "FG Receipt"
          && number(row.qtyPlanned) > number(row.qtyReleased)
          && !/cancelled|converted/i.test(row.status || ""));
        if (remainingLines.length) html += actionButton("create-mo-references", "Buat MO Reference", "outline-primary", "MO tetap direferensikan dari Monthly Plan; schedule harian dibuat PPIC.");
        if ((record.manufacturingOrders || []).length) html += actionButton("convert-daily-plans", "Publish Allocation ke Daily Plan", "primary", "Publikasikan draft allocation mesin-tanggal menjadi Daily Production Plan.");
      }
      return html || '<small>Monthly Production Plan tersedia untuk monitoring.</small>';
    }
    if (config.module === "planning-ppic" && config.page.slug === "daily-production-plans") {
      return '<small>Daily Plan dibuat PPIC dari Capacity Check. Eksekusi/consume dilakukan pada modul Production.</small>';
    }
    if (config.module === "purchasing" && config.page.slug === "purchase-suggestions") {
      if (!/converted|cancelled|replan required/.test(status)) return '<small>Pilih item langsung dari tabel dan sesuaikan qty supplier. Material serta Purchase Part otomatis dipisahkan menjadi Draft PR berbeda.</small>';
      if (/replan required/.test(status)) return '<small>Forecast/SO berubah. Hitung ulang MPS dan MRP untuk membuat Purchase Suggestion terbaru.</small>';
      return html || '<small>Purchase Suggestion sudah selesai diproses.</small>';
    }
    if (config.module === "purchasing" && config.page.slug === "purchase-requisitions") {
      // PR lifecycle is intentionally explicit: only approved requisitions may be
      // converted to a PO. The backend remains the source of truth for permission,
      // central approval rules, and duplicate conversion protection.
      if (/draft|revising|rejected/.test(status)) html += actionButton("submit", "Submit PR", "primary", "Kirim PR ke alur approval.");
      if (/submitted|pending|checking|waiting/.test(status)) html += actionButton("approve", "Approve PR", "primary", "Approval mengikuti Approval Master.");
      if (/approved|partially-ordered/.test(slug(status))) html += actionButton("make-po", "Move to PO Supplier", "outline-primary", "Buat PO baru atau gabungkan ke Draft PO supplier yang sudah ada.");
      if (/submitted|pending|checking/.test(status)) html += actionButton("reject", "Reject PR", "outline-danger", "Tolak PR dengan alasan.");
      if (record.convertedToPO) {
        html += `<a class="btn btn-outline-primary" href="/modules/purchasing/purchase-order/${encodeURIComponent(record.convertedToPO)}">Lihat PO ${esc(record.convertedToPO)}</a><small>PO sudah dibuat dari PR ini.</small>`;
      }
      return html || '<small>PR sudah diproses atau belum memiliki transisi yang tersedia.</small>';
    }
    if (config.module === "purchasing" && config.page.slug === "purchase-order") {
      const hasOutstanding = (Array.isArray(record.details) ? record.details : [])
        .some((line) => number(line.qty) - number(line.qtyReceived) > 1e-9);
      if (/draft|revising/.test(status)) html += actionButton("submit-checking", "Submit Approval PO", "primary", "Masuk ke alur Approval Master.");
      if (/submitted|checking by/.test(status)) {
        html += actionButton("approve", "Approve PO", "primary", "Approval mengikuti Approval Master.");
        html += actionButton("revise", "Minta Revisi", "outline-primary");
        html += actionButton("reject", "Reject PO", "outline-danger");
      }
      if (status === "approved") html += actionButton("send", "Tandai PO Terkirim", "primary");
      if (status === "sent") html += actionButton("confirm", "Konfirmasi Supplier", "primary");
      if (/sent|confirmed|partial receipt/.test(status) && hasOutstanding) {
        html += `<a class="btn btn-primary" data-create-goods-receipt href="/modules/incoming/goods-receipts/new?poNumber=${encodeURIComponent(record.poNumber || config.recordKey)}">Buat Goods Receipt</a><small>PO dipilih otomatis; penerimaan dilanjutkan melalui Incoming Inspection/QC.</small>`;
      }
      if (/approved|sent|confirmed|partial receipt/.test(status)) html += actionButton("manual-complete", "Complete Manual", "outline-primary");
      if (!/completed|cancelled|rejected/.test(status)) html += actionButton("cancel", "Batalkan PO", "outline-danger");
      html += '<button type="button" class="btn btn-outline-secondary" data-po-history>Revision History</button>';
      return html || '<small>Tidak ada transisi Purchase Order yang tersedia pada status ini.</small>';
    }
    if (config.module === "purchasing" && config.page.slug === "purchase-invoices") {
      if (/draft|need review/.test(status)) html += actionButton("submit", "Submit Invoice", "primary", "Kirim hasil matching ke Approval Master.");
      if (status === "submitted") html += actionButton("approve", "Approve Invoice", "primary", "Approval mengikuti Approval Master.");
      if (status === "approved") html += actionButton("post", "Post Invoice", "outline-primary");
      if (/approved|posted/.test(status)) html += actionButton("pay", "Catat Payment", "primary");
      return html || '<small>Invoice sudah selesai atau tidak memiliki transisi aktif.</small>';
    }
    if (config.module !== "production") {
      if (config.module === "incoming" || (config.module === "purchasing" && ["goods-receipts", "incoming-inspections"].includes(config.page.slug))) {
        if (config.page.slug === "goods-receipts" && /received pending inspection/.test(status)) return actionButton("create-inspection", "Buat Incoming Inspection", "primary", "Buat IQC dari seluruh baris Goods Receipt.");
        if (config.page.slug === "incoming-inspections" && status === "open") return actionButton("complete-inspection", "Selesaikan IQC", "primary", "Isi accepted/rejected setiap baris terlebih dahulu.");
        if (config.page.slug === "incoming-inspections" && status === "completed") {
          const details = Array.isArray(record.details) ? record.details : [];
          if (details.some((row) => number(row.qtyAccepted) > number(row.qtyAcceptedPutaway) + 1e-9)) html += actionButton("putaway", "Putaway Accepted Qty", "outline-primary", "Posting hanya qty accepted yang belum pernah diposting.");
          if (details.some((row) => number(row.qtyRejected) > number(row.qtyRejectedDisposed) + 1e-9)) html += actionButton("dispose-rejected", "Finalisasi Reject", "outline-danger", "Wajib tentukan retur supplier, scrap, atau rework.");
          return html || '<small>Putaway dan disposition IQC sudah selesai.</small>';
        }
      }
      if (config.module === "outgoing" && ["delivery-schedules", "delivery-schedule"].includes(config.page.slug)) {
        if (status === "scheduled") return actionButton("pick", "Mulai Picking", "primary");
        if (["on-process", "on process"].includes(status)) { html += actionButton("pack", "Tandai Packing", "outline-primary"); html += actionButton("ship", "Kirim Shipment", "primary"); return html; }
        if (["in-transit", "in transit"].includes(status)) { html += actionButton("pod", "Konfirmasi POD", "primary"); html += actionButton("fail", "Tandai Gagal Kirim", "outline-danger"); return html; }
      }
      if (config.module === "inventory" && config.page.slug === "stock-opname") {
        if (status === "draft") { html += actionButton("start-counting", "Mulai Counting", "primary", "Ambil snapshot terbaru dan freeze saldo."); html += actionButton("cancel", "Batalkan STO", "outline-danger"); }
        if (status === "counting") { html += actionButton("submit", "Submit Counting", "primary", "Ajukan hasil hitung ke approval."); html += actionButton("cancel", "Batalkan & Unfreeze", "outline-danger"); }
        if (status === "waiting-approval") { html += actionButton("approve", "Approve Opname", "primary", "Maker/checker tidak boleh melakukan approval."); html += actionButton("request-recount", "Minta Recount", "outline-primary"); html += actionButton("cancel", "Batalkan & Unfreeze", "outline-danger"); }
        if (status === "approved") { html += actionButton("adjust", "Post Adjustment", "outline-primary", "Posting selisih ke stock movement."); html += actionButton("request-recount", "Minta Recount", "outline-primary", "Gunakan jika saldo berubah atau hasil perlu dihitung ulang."); }
        if (status === "adjusted") html += actionButton("close", "Close STO", "primary");
        return html || '<small>Stock opname sudah selesai atau belum memiliki transisi yang tersedia.</small>';
      }
      if (config.module === "inventory" && config.page.slug === "material-issues") {
        if (status === "draft") html += actionButton("issue", "Consume / Issue Material", "primary", "Warehouse memvalidasi rack, lot, dan qty sebelum posting stock movement.");
        if (/issued|partially-returned/.test(slug(status))) html += actionButton("close", "Close Material Issue", "outline-primary");
        return html || '<small>Material Issue sudah selesai atau belum memiliki transisi aktif.</small>';
      }
      if (config.module === "inventory") return '<small>Inventory menggunakan transaksi sumber untuk menjaga audit trail stok.</small>';
      if (config.module === "incoming" || (config.module === "purchasing" && ["goods-receipts", "incoming-inspections"].includes(config.page.slug))) return '<small>Receipt, inspection, dan putaway dijaga sebagai alur audit yang berurutan.</small>';
      if (config.module === "outgoing") return '<small>Gunakan Delivery Schedule untuk menjalankan picking sampai POD.</small>';
      return '<small>Detail dokumen tersedia untuk monitoring.</small>';
    }
    if (config.page.slug === "manufacturing-orders") {
      return '<small>MO ditampilkan sebagai reference dari PPIC. Eksekusi Production dimulai dari Daily Production Plan.</small>';
    } else if (config.page.slug === "work-orders" && /planned|released/.test(status)) {
      html += actionButton("start", "Mulai Work Order", "primary");
    } else if (config.page.slug === "work-orders" && /in-progress|in-production/.test(slug(status))) {
      html += actionButton("complete", "Complete Work Order", "primary");
    } else if (config.page.slug === "daily-production-schedules") {
      if (/draft|planned/.test(status)) html += actionButton("consume", "Consume Daily Plan", "primary", "Buat Draft Material Issue untuk persiapan Warehouse.");
      if (status === "released") html += actionButton("start", "Mulai Jadwal", "primary");
      if (/in-progress/.test(slug(status))) html += actionButton("complete", "Complete Jadwal", "primary");
    } else if (config.page.slug === "vendor-process-orders") {
      if (/planned|ready-to-send/.test(slug(status))) html += actionButton("send", "Kirim ke Vendor", "primary");
      if (/sent|partial-received/.test(slug(status))) html += actionButton("receive", "Terima dari Vendor", "primary");
      if (!/closed|cancelled/.test(status)) html += actionButton("reprice", "Hitung Ulang Harga", "outline-primary");
    } else if (config.page.slug === "material-issues") {
      return '<small>Material Issue hanya reference di Production. Consume/issue stok dilakukan pada modul Inventory.</small>';
    } else if (config.page.slug === "quality-inspections") {
      if (status === "draft") html += actionButton("complete", "Complete QC", "primary");
      if (status === "completed" && /accepted|conditional-accept/.test(slug(record.decision))) html += actionButton("receive-fg", "FG Receipt", "outline-primary");
    } else if (config.page.slug === "production-logs" && /draft|open/.test(status)) {
      html += actionButton("submit", "Submit Production Log", "primary");
    } else if (config.page.slug === "production-logs" && /submitted/.test(status)) {
      html += actionButton("approve", "Approve Production Log", "primary", "Approval mengikuti Approval Master.");
    }
    return html || '<small>Tidak ada transisi status yang aman pada kondisi dokumen ini. Detail tetap aktif untuk monitoring.</small>';
  }
  function render(record) {
    currentRecord = record;
    const title = record[config.page.detailKey]
      || record.moNumber || record.woNumber || record.scheduleNumber || record.planNumber
      || record.runNumber || record.soNumber || record.prNumber || record.poNumber
      || record.grNumber || record.inspectionNumber || record.logNumber
      || record.partCode || record.materialCode || record.warehouseCode || config.recordKey;
    const status = record.status || record.decision || (record.isActive == null ? "Active" : record.isActive ? "Active" : "Inactive");
    $("ops-detail-title").textContent = title;
    const referencePart = record.partName || record.part?.partName || record.partCode || record.part?.partCode || record.customerName || record.customer?.customerName || record.machineName || record.machine?.machineName;
    $("ops-detail-subtitle").textContent = [config.page.label, config.moduleLabel, referencePart].filter(Boolean).join(" · ");
    $("ops-detail-subtitle").textContent = `${config.page.label} · ${config.moduleLabel}`;
    $("ops-detail-status").innerHTML = badge(status);
    $("ops-detail-subtitle").textContent = [config.page.label, config.moduleLabel, referencePart].filter(Boolean).join(" · ");
    const prEditLink = $("pr-edit-link");
    if (prEditLink) {
      const editableStatus = ["draft", "revision-required", "rejected"].includes(slug(record.status));
      prEditLink.classList.toggle("d-none", !editableStatus);
    }
    const productionLogEditLink = $("production-log-edit-link");
    if (productionLogEditLink) {
      productionLogEditLink.classList.toggle("d-none", slug(record.status) === "approved");
    }
    if (isMonthlyPlanPage()) {
      monthlyPlanSummaryFields(record);
      renderMonthlyPlanCollections(record);
    } else {
      renderFields(record);
      renderCollections(record);
    }
    renderMeta(record);
    $("ops-workflow-actions").innerHTML = workflowActions(record);
    $("ops-detail-loading").classList.add("d-none"); $("ops-detail-shell").classList.remove("d-none");
    if (config.module === "purchasing" && config.page.slug === "purchase-suggestions") filterPurchaseSuggestionCards();
  }
  async function load() {
    try {
      const record = await api(`/modules/api/${config.module}/${config.page.slug}/${encodeURIComponent(config.recordKey)}`);
      render(record);
    } catch (error) { $("ops-detail-loading").classList.add("d-none"); showAlert(error.message); }
  }
  function updatePurchaseSuggestionSelection() {
    const selected = [...document.querySelectorAll("[data-ps-row] [data-ps-select]:checked")];
    selected.forEach((checkbox) => {
      const row = checkbox.closest("[data-ps-row]");
      const qtyInput = row?.querySelector("[data-ps-custom-qty]");
      if (qtyInput) qtyInput.disabled = false;
      row?.classList.add("is-selected");
    });
    document.querySelectorAll("[data-ps-row] [data-ps-select]:not(:checked)").forEach((checkbox) => {
      const row = checkbox.closest("[data-ps-row]");
      const qtyInput = row?.querySelector("[data-ps-custom-qty]");
      if (qtyInput) qtyInput.disabled = true;
      row?.classList.remove("is-selected");
    });
    const totalQty = selected.reduce((sum, checkbox) => sum + number(checkbox.closest("[data-ps-row]")?.querySelector("[data-ps-custom-qty]")?.value), 0);
    const countLabel = document.querySelector("[data-ps-selected-count]");
    const qtyLabel = document.querySelector("[data-ps-selected-qty]");
    const createButton = document.querySelector("[data-ps-create-pr]");
    const categories = new Set(selected.map((checkbox) => checkbox.closest("[data-ps-row]")?.dataset.psCategory).filter(Boolean));
    if (countLabel) countLabel.textContent = `${selected.length} item dipilih`;
    if (qtyLabel) qtyLabel.textContent = `Total qty ${num(totalQty)}`;
    if (createButton) {
      createButton.disabled = !selected.length;
      createButton.textContent = categories.size > 1 ? `Buat ${categories.size} Draft PR Terpisah` : "Buat 1 Draft PR";
    }
  }
  function filterPurchaseSuggestionCards() {
    const search = String(document.querySelector("[data-ps-search-input]")?.value || "").trim().toLowerCase();
    const status = String(document.querySelector("[data-ps-status-filter]")?.value || "");
    const category = String(document.querySelector("[data-ps-category-filter]")?.value || "");
    const grouping = String(document.querySelector("[data-ps-due-group]")?.value || "");
    document.querySelectorAll("[data-ps-group-row]").forEach((row) => row.remove());
    let visible = 0;
    let lastGroup = null;
    document.querySelectorAll("[data-ps-row]").forEach((row) => {
      const show = (!search || row.dataset.psSearch.includes(search)) && (!status || row.dataset.psStatus === status) && (!category || row.dataset.psCategory === category);
      row.classList.toggle("d-none", !show);
      const editorRow = row.nextElementSibling?.matches("[data-ps-editor-row]") ? row.nextElementSibling : null;
      if (!show) editorRow?.classList.add("d-none");
      if (show && grouping) {
        const groupKey = row.dataset[`due${grouping[0].toUpperCase()}${grouping.slice(1)}`] || "Tanpa due date";
        if (groupKey !== lastGroup) {
          const groupRow = document.createElement("tr");
          groupRow.dataset.psGroupRow = "";
          groupRow.className = "ps-group-row";
          groupRow.innerHTML = `<td colspan="10"><b>Due ${esc(groupKey)}</b></td>`;
          row.parentNode.insertBefore(groupRow, row);
          lastGroup = groupKey;
        }
      }
      if (show) visible += 1;
    });
    const result = document.querySelector("[data-ps-result]");
    if (result) result.textContent = `${visible} item`;
    const visibleEligible = [...document.querySelectorAll("[data-ps-row]:not(.d-none) [data-ps-select]:not(:disabled)")];
    const selectAll = document.querySelector("[data-ps-select-all]");
    if (selectAll) {
      selectAll.checked = Boolean(visibleEligible.length) && visibleEligible.every((checkbox) => checkbox.checked);
      selectAll.indeterminate = visibleEligible.some((checkbox) => checkbox.checked) && !selectAll.checked;
    }
    updatePurchaseSuggestionSelection();
  }
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-ps-search-input]")) filterPurchaseSuggestionCards();
    if (event.target.matches("[data-ps-custom-qty]")) updatePurchaseSuggestionSelection();
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-ps-status-filter], [data-ps-category-filter], [data-ps-due-group]")) filterPurchaseSuggestionCards();
    if (event.target.matches("[data-ps-select]")) {
      filterPurchaseSuggestionCards();
    }
    if (event.target.matches("[data-ps-select-all]")) {
      document.querySelectorAll("[data-ps-row]:not(.d-none) [data-ps-select]:not(:disabled)").forEach((checkbox) => { checkbox.checked = event.target.checked; });
      filterPurchaseSuggestionCards();
    }
  });
  document.addEventListener("click", async (event) => {
    const openSuggestionEditor = event.target.closest("[data-open-suggestion-editor]");
    if (openSuggestionEditor) {
      const row = openSuggestionEditor.closest("[data-ps-row]");
      const editorRow = row?.nextElementSibling;
      document.querySelectorAll("[data-ps-editor-row]").forEach((candidate) => { if (candidate !== editorRow) candidate.classList.add("d-none"); });
      editorRow?.classList.toggle("d-none");
      editorRow?.querySelector("[data-suggestion-editor]")?.classList.remove("d-none");
      return;
    }
    const closeSuggestionEditor = event.target.closest("[data-close-suggestion-editor]");
    if (closeSuggestionEditor) {
      closeSuggestionEditor.closest("[data-ps-editor-row]")?.classList.add("d-none");
      return;
    }
    const bulkCountButton = event.target.closest("[data-sto-bulk-count]");
    if (bulkCountButton) {
      const counts = [...document.querySelectorAll("[data-sto-count]")].map((button) => {
        const countCell = button.closest("td");
        return {
          detailId: button.dataset.stoDetail,
          actualQty: countCell?.querySelector("[data-sto-actual]")?.value ?? "",
          reason: countCell?.querySelector("[data-sto-reason]")?.value?.trim() || null,
        };
      }).filter((row) => row.actualQty !== "");
      if (!counts.length) { showAlert("Isi minimal satu Physical Count sebelum menyimpan."); return; }
      if (counts.some((row) => Number(row.actualQty) < 0 || !Number.isFinite(Number(row.actualQty)))) { showAlert("Physical count harus berupa angka nol atau lebih."); return; }
      bulkCountButton.disabled = true;
      try {
        await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/bulk-count`, {
          method: "PATCH",
          body: JSON.stringify({ counts: counts.map((row) => ({ ...row, actualQty: Number(row.actualQty) })) }),
        });
        showAlert(`${counts.length} physical count tersimpan.`, "success");
        await load();
      } catch (error) { showAlert(error.message); }
      finally { bulkCountButton.disabled = false; }
      return;
    }
    const countButton = event.target.closest("[data-sto-count]");
    if (countButton) {
      const cell = countButton.closest("td");
      const actualValue = cell?.querySelector("[data-sto-actual]")?.value;
      if (actualValue == null || actualValue === "" || Number(actualValue) < 0) { showAlert("Physical count harus berupa angka nol atau lebih."); return; }
      countButton.disabled = true;
      try {
        await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/details/${encodeURIComponent(countButton.dataset.stoDetail)}/count`, { method: "PATCH", body: JSON.stringify({ actualQty: Number(actualValue), reason: cell?.querySelector("[data-sto-reason]")?.value?.trim() || null }) });
        showAlert("Physical count tersimpan.", "success");
        await load();
      } catch (error) { showAlert(error.message); }
      finally { countButton.disabled = false; }
      return;
    }
    const removeSupplierSplitButton = event.target.closest("[data-remove-supplier-split]");
    if (removeSupplierSplitButton) {
      removeSupplierSplitButton.closest("[data-supplier-split]")?.remove();
      return;
    }
    const addSupplierSplitButton = event.target.closest("[data-add-supplier-split]");
    if (addSupplierSplitButton) {
      const editor = addSupplierSplitButton.closest("[data-suggestion-confirmation]");
      const statuses = ["Not Confirmed", "Waiting Supplier Confirmation", "Available", "Partially Available", "Not Available", "Alternative Quantity Offered", "Alternative Delivery Date", "Confirmed"];
      editor.querySelector("[data-supplier-splits]").insertAdjacentHTML("beforeend", `<div class="border rounded p-1 d-grid gap-1" data-supplier-split>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-supplier placeholder="Supplier code"><select class="form-select form-select-sm" data-split-status>${statuses.map((value) => `<option>${esc(value)}</option>`).join("")}</select></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-qty type="number" min="0" step="0.001" placeholder="Qty"><input class="form-control form-control-sm" data-split-date type="date"></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-moq type="number" min="0" step="0.001" placeholder="MOQ"><input class="form-control form-control-sm" data-split-multiple type="number" min="0" step="0.001" placeholder="Multiple"><input class="form-control form-control-sm" data-split-lead type="number" min="0" placeholder="Lead day"></div>
        <div class="d-flex gap-1"><input class="form-control form-control-sm" data-split-price type="number" min="0" step="0.0001" placeholder="Harga"><input class="form-control form-control-sm" data-split-currency placeholder="Currency"></div>
        <input class="form-control form-control-sm" data-split-material placeholder="Alternative material (jika diizinkan)"><input class="form-control form-control-sm" data-split-remark placeholder="Supplier remark">
        <button class="btn btn-sm btn-outline-danger" type="button" data-remove-supplier-split>Hapus Split</button></div>`);
      return;
    }
    const saveSuggestionButton = event.target.closest("[data-save-suggestion-confirmation]");
    if (saveSuggestionButton) {
      const editor = saveSuggestionButton.closest("[data-suggestion-confirmation]");
      const confirmationStatus = editor.querySelector("[data-confirm-status]").value;
      const confirmedQty = number(editor.querySelector("[data-confirm-qty]").value);
      const supplierCode = editor.querySelector("[data-confirm-supplier]").value.trim();
      const confirmedDeliveryDate = editor.querySelector("[data-confirm-date]").value || null;
      const bypassConfirmationReason = editor.querySelector("[data-confirm-bypass]").value.trim() || null;
      const supplierAllocations = [...editor.querySelectorAll("[data-supplier-split]")].map((split) => ({
        supplierCode: split.querySelector("[data-split-supplier]").value.trim() || null,
        confirmationStatus: split.querySelector("[data-split-status]").value,
        confirmedQty: number(split.querySelector("[data-split-qty]").value),
        deliveryDate: split.querySelector("[data-split-date]").value || null,
        moq: number(split.querySelector("[data-split-moq]").value),
        orderMultiple: number(split.querySelector("[data-split-multiple]").value),
        leadTimeDays: number(split.querySelector("[data-split-lead]").value),
        unitPrice: number(split.querySelector("[data-split-price]").value),
        currencyCode: split.querySelector("[data-split-currency]").value.trim() || null,
        alternativeMaterialCode: split.querySelector("[data-split-material]").value.trim() || null,
        supplierRemark: split.querySelector("[data-split-remark]").value.trim() || null,
      })).filter((allocation) => allocation.supplierCode || allocation.confirmedQty > 0);
      if (!["Not Confirmed", "Waiting Supplier Confirmation", "Not Available"].includes(confirmationStatus) && confirmedQty <= 0) { showAlert("Confirmed quantity harus lebih dari 0."); return; }
      saveSuggestionButton.disabled = true;
      try {
        await api(`/modules/api/purchasing-suggestions/${encodeURIComponent(config.recordKey)}/items/${encodeURIComponent(editor.dataset.itemId)}`, { method: "PATCH", body: JSON.stringify({
          confirmationStatus, confirmedQty, confirmedDeliveryDate,
          confirmedMoq: number(editor.querySelector("[data-confirm-moq]").value),
          confirmedLeadTimeDays: number(editor.querySelector("[data-confirm-lead]").value),
          confirmedUnitPrice: number(editor.querySelector("[data-confirm-price]").value),
          currencyCode: editor.querySelector("[data-confirm-currency]").value.trim() || null,
          supplierRemark: editor.querySelector("[data-confirm-remark]").value.trim() || null,
          alternativeSupplierCode: supplierCode || null,
          alternativeMaterialCode: editor.querySelector("[data-confirm-material]").value.trim() || null,
          bypassConfirmationReason,
          supplierAllocations,
        }) });
        showAlert("Konfirmasi supplier tersimpan.", "success");
        await load();
      } catch (error) { showAlert(error.message); }
      finally { saveSuggestionButton.disabled = false; }
      return;
    }
    const historyButton = event.target.closest("[data-po-history]");
    if (historyButton) {
      historyButton.disabled = true;
      try {
        const history = await api(`/modules/api/purchasing-po/${encodeURIComponent(config.recordKey)}/revisions`);
        let resultBox = document.querySelector(".ops-action-result");
        if (!resultBox) {
          resultBox = document.createElement("pre");
          resultBox.className = "ops-action-result";
          $("ops-workflow-actions").appendChild(resultBox);
        }
        resultBox.textContent = JSON.stringify(history, null, 2);
      } catch (error) {
        showAlert(error.message);
      } finally {
        historyButton.disabled = false;
      }
      return;
    }
    const button = event.target.closest("[data-workflow-action]"); if (!button) return;
    const action = button.dataset.workflowAction;
    if (action === "receive-fg" && config.page.slug === "quality-inspections") {
      location.assign(`/modules/production/fg-receipt?inspection=${encodeURIComponent(config.recordKey)}`);
      return;
    }
    const isCheck = action === "availability-check";
    const confirmationHandledByForm = action === "manual-complete";
    if (!isCheck && !confirmationHandledByForm && !confirm(`${button.textContent.trim()} untuk ${config.recordKey}?`)) return;
    let requestBody = {};
    if (action === "reject" || action === "revise") {
      const documentLabel = config.page.slug === "purchase-order" ? "PO" : "PR";
      const reason = await window.formPrompt(action === "revise" ? `Alasan revisi ${documentLabel} (wajib):` : `Alasan penolakan ${documentLabel} (wajib):`, "", { title: "Alasan workflow" });
      if (!reason || !reason.trim()) return;
      requestBody = action === "revise"
        ? { revisionReason: reason.trim(), message: reason.trim() }
        : { reason: reason.trim(), rejectionReason: reason.trim() };
    } else if (action === "request-recount" || (action === "cancel" && config.module === "inventory" && config.page.slug === "stock-opname")) {
      const reason = await window.formPrompt(
        action === "request-recount" ? "Alasan recount (wajib):" : "Alasan pembatalan STO (wajib):",
        "",
        { title: action === "request-recount" ? "Request Recount" : "Batalkan Stock Opname" },
      );
      if (!reason || !reason.trim()) return;
      requestBody = { reason: reason.trim() };
    } else if (action === "make-po") {
      const selected = [...document.querySelectorAll(".pr-po-line:checked")];
      if (!selected.length) { showAlert("Pilih minimal satu detail PR yang akan dipindahkan ke PO."); return; }
      const decision = await collectPurchaseOrderLines(selected);
      if (!decision) return;
      requestBody = decision;
    } else if (action === "convert-suggestion-to-pr") {
      const selected = [...document.querySelectorAll("[data-ps-row] [data-ps-select]:checked")].map((checkbox) => {
        const row = checkbox.closest("[data-ps-row]");
        const qtyInput = row.querySelector("[data-ps-custom-qty]");
        return { itemId: row.dataset.itemId, qty: number(qtyInput.value), maxQty: number(qtyInput.max) };
      });
      if (!selected.length) { showAlert("Pilih minimal satu item suggestion yang akan dijadikan PR."); return; }
      const invalid = selected.find((item) => !item.itemId || item.qty <= 0 || item.qty > item.maxQty + 0.000001);
      if (invalid) { showAlert("Qty PR harus lebih dari 0 dan tidak boleh melebihi ketersediaan supplier."); return; }
      requestBody = { items: selected.map(({ itemId, qty }) => ({ itemId, qty })) };
    } else if (action === "manual-complete") {
      try {
        const locationDecision = await collectManualCompleteLocation();
        if (!locationDecision) return;
        requestBody = locationDecision;
      } catch (error) {
        showAlert(error.message);
        return;
      }
    } else if (action === "pay" && config.page.slug === "purchase-invoices") {
      const amount = await window.formPrompt("Jumlah payment:", "", { title: "Payment" });
      if (!amount || number(amount) <= 0) return;
      const paymentDate = await window.formPrompt("Tanggal payment (YYYY-MM-DD):", new Date().toISOString().slice(0, 10), { title: "Payment" });
      if (!paymentDate) return;
      requestBody = { amount: number(amount), paymentDate };
    } else if (action === "dispatch-daily") {
      const date = await window.formPrompt("Tanggal Daily Plan (YYYY-MM-DD):", new Date().toISOString().slice(0, 10), { title: "Dispatch Daily Plan" });
      if (!date) return;
      const shift = await window.formPrompt("Shift:", "1", { title: "Dispatch Daily Plan" });
      if (!shift) return;
      requestBody = { date, shift, workOrderNumbers: [config.recordKey] };
    } else if (action === "release-monthly-plan") {
      requestBody = { shiftHours: 8, shiftsPerDay: 1, efficiencyPercent: 85 };
    } else if (action === "create-mo-references") {
      const details = (currentRecord?.details || []).filter((row) =>
        row.lineType === "FG Receipt"
        && number(row.qtyPlanned) > number(row.qtyReleased)
        && !/cancelled|converted/i.test(row.status || ""));
      if (!details.length) { showAlert("Seluruh FG parent pada Monthly Plan sudah mempunyai MO reference.", "info"); return; }
      requestBody = {
        items: details.map((row) => ({
          referenceType: "MonthlyProductionPlan",
          monthlyProductionPlanNumber: currentRecord.planNumber || config.recordKey,
          monthlyProductionPlanLineNumber: row.lineNumber,
          qtyPlanned: number(row.qtyPlanned) - number(row.qtyReleased),
          plannedStartDate: currentRecord.periodStart,
          plannedEndDate: row.requiredDate || currentRecord.periodEnd,
          status: "Planned",
        })),
      };
    } else if (action === "convert-daily-plans") {
      requestBody = { allowPartial: Boolean(currentRecord?.capacityOverrideApproved) };
    } else if (action === "complete-inspection") {
      const rows = [...document.querySelectorAll("[data-iqc-detail]")];
      if (!rows.length) { showAlert("Detail IQC belum tersedia."); return; }
      requestBody.decisions = rows.map((row) => ({ grDetailId: row.dataset.iqcGrDetail, qtyAccepted: number(row.querySelector("[data-iqc-accepted]")?.value), qtyRejected: number(row.querySelector("[data-iqc-rejected]")?.value), rejectedDisposition: row.querySelector("[data-iqc-disposition]")?.value, dispositionReference: row.querySelector("[data-iqc-disposition-reference]")?.value?.trim() || null }));
      if (requestBody.decisions.some((row) => !row.grDetailId || row.qtyAccepted < 0 || row.qtyRejected < 0 || row.qtyAccepted + row.qtyRejected <= 0)) { showAlert("Setiap baris IQC harus memiliki qty accepted atau rejected."); return; }
      if (requestBody.decisions.some((row) => row.qtyRejected > 0 && !row.rejectedDisposition)) { showAlert("Disposition wajib diisi untuk setiap qty reject."); return; }
    } else if (action === "dispose-rejected") {
      requestBody.decisions = [...document.querySelectorAll("[data-iqc-disposition-detail]")].map((row) => ({ inspectionDetailId: row.dataset.iqcDispositionDetail, rejectedDisposition: row.querySelector("[data-iqc-disposition]")?.value, dispositionReference: row.querySelector("[data-iqc-disposition-reference]")?.value?.trim() || null }));
      if (!requestBody.decisions.length) { showAlert("Tidak ada reject yang menunggu disposition."); return; }
      if (requestBody.decisions.some((row) => row.rejectedDisposition === "HOLD")) { showAlert("Pilih disposition final: Return to Supplier atau Scrap."); return; }
    } else if (action === "ship") {
      requestBody = { trackingNumber: "E2E-TRK-20260801", vehicle: "Truck-E2E" };
    } else if (action === "pod") {
      requestBody = { receivedBy: "E2E Receiver", podUrl: "E2E-POD-20260801" };
    } else if (action === "fail") {
      const failureReason = await window.formPrompt("Alasan gagal kirim:", "", { title: "Shipment gagal" }); if (!failureReason || !failureReason.trim()) return;
      requestBody = { failureReason: failureReason.trim() };
    } else if (action === "send" && config.page.slug === "vendor-process-orders") {
      const qtySent = await window.formPrompt("Qty yang dikirim ke vendor:", "", { title: "Vendor Process" }); if (!qtySent || number(qtySent) <= 0) return;
      const sourceWarehouseCode = await window.formPrompt("Source Warehouse:", "", { title: "Vendor Process" }); if (!sourceWarehouseCode?.trim()) return;
      requestBody = { qtySent: number(qtySent), sourceWarehouseCode: sourceWarehouseCode.trim() };
    } else if (action === "receive" && config.page.slug === "vendor-process-orders") {
      const qty = await window.formPrompt("Qty diterima dari vendor:", "", { title: "Vendor Receipt" }); if (!qty || number(qty) <= 0) return;
      const warehouseCode = await window.formPrompt("Warehouse QC Hold:", "", { title: "Vendor Receipt" }); if (!warehouseCode?.trim()) return;
      const lotNumber = await window.formPrompt("Lot penerimaan:", "", { title: "Vendor Receipt" }); if (lotNumber === null) return;
      requestBody = { qty: number(qty), warehouseCode: warehouseCode.trim(), lotNumber: lotNumber.trim() || null };
    } else if (action === "reprice" && config.page.slug === "vendor-process-orders") {
      const vendorRate = await window.formPrompt("Vendor rate manual (kosong = price list):", "", { title: "Vendor Rate" }); if (vendorRate === null) return;
      requestBody = vendorRate.trim() ? { vendorRate: number(vendorRate) } : {};
    } else if (action === "complete" && config.page.slug === "quality-inspections") {
      requestBody = { decision: "Accepted" };
    } else if (action === "approve" && config.page.slug === "production-logs") {
      // Production log approval posts the destination warehouse to the workflow
      // endpoint. The warehouse is operational context for the produced WIP and
      // is not persisted as a column on ProductionLog itself.
      requestBody = { warehouseCode: "WH-001" };
    }
    button.disabled = true;
    try {
      const workflow = config.module === "purchasing" ? "purchasing-workflow" : "production-workflow";
      let result;
      if (action === "confirm-monthly-plan") {
        result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(config.recordKey)}/confirm`, { method: "POST", body: "{}" });
      } else if (action === "release-monthly-plan") {
        result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(config.recordKey)}/release`, { method: "POST", body: JSON.stringify(requestBody) });
      } else if (action === "create-mo-references") {
        result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(config.recordKey)}/release-mos`, { method: "POST", body: JSON.stringify(requestBody) });
      } else if (action === "convert-daily-plans") {
        result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(config.recordKey)}/daily-plans`, { method: "POST", body: JSON.stringify(requestBody) });
      } else if (action === "make-po") {
        result = await api("/modules/api/purchasing-pr/consolidate-to-po", { method: "POST", body: JSON.stringify(requestBody) });
      } else if (action === "convert-suggestion-to-pr") {
        result = await api(`/modules/api/purchasing-suggestions/${encodeURIComponent(config.recordKey)}/convert-to-pr`, { method: "POST", body: JSON.stringify(requestBody) });
      } else if (action === "convert-daily-plans") {
        const created = number(result?.summary?.createdCount);
        const updated = number(result?.summary?.updatedCount);
        showAlert(`Daily Production Plan tersinkron: ${created} baru, ${updated} diperbarui.`, result?.summary?.skippedCapacityCount ? "warning" : "success");
        setTimeout(() => location.assign("/modules/planning-ppic/daily-production-plans"), 500);
      } else if (action === "dispatch-daily") {
        result = await api("/modules/api/production/daily-production-schedules/dispatch-from-work-orders", { method: "POST", body: JSON.stringify(requestBody) });
      } else if (action === "consume" && config.page.slug === "daily-production-schedules") {
        result = await api(`/modules/api/production/daily-production-schedules/${encodeURIComponent(config.recordKey)}/consume`, { method: "POST", body: JSON.stringify(requestBody) });
      } else if (config.module === "inventory" && config.page.slug === "stock-opname") {
        result = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/${encodeURIComponent(action)}`, { method: "PATCH", body: JSON.stringify(requestBody) });
      } else if (config.module === "incoming" || (config.module === "purchasing" && ["goods-receipts", "incoming-inspections"].includes(config.page.slug))) {
        const endpoint = action === "create-inspection"
          ? `/modules/api/incoming/goods-receipts/${encodeURIComponent(config.recordKey)}/create-inspection`
          : `/modules/api/incoming/incoming-inspections/${encodeURIComponent(config.recordKey)}/${action === "complete-inspection" ? "complete" : action === "dispose-rejected" ? "dispose-rejected" : "putaway"}`;
        result = await api(endpoint, { method: "POST", body: JSON.stringify(action === "create-inspection" ? { grNumber: config.recordKey } : requestBody) });
      } else if (config.module === "outgoing" && ["delivery-schedules", "delivery-schedule"].includes(config.page.slug)) {
        result = await api(`/modules/api/outgoing/delivery-schedules/${encodeURIComponent(config.recordKey)}/${encodeURIComponent(action)}`, { method: "POST", body: JSON.stringify(requestBody) });
      } else {
        result = await api(`/modules/api/${workflow}/${config.page.slug}/${encodeURIComponent(config.recordKey)}/${action}`, { method: "POST", body: JSON.stringify(requestBody) });
      }
      if (isCheck) {
        let resultBox = document.querySelector(".ops-action-result");
        if (!resultBox) { resultBox = document.createElement("pre"); resultBox.className = "ops-action-result"; $("ops-workflow-actions").appendChild(resultBox); }
        resultBox.textContent = JSON.stringify(result, null, 2);
        showAlert("Pengecekan ketersediaan material selesai.", "success");
      } else if (action === "make-po" && (result?.poNumber || result?.purchaseOrder?.poNumber || result?.purchaseOrders?.[0]?.poNumber)) {
        const poNumber = result.poNumber || result.purchaseOrder?.poNumber || result.purchaseOrders[0].poNumber;
        const count = result.poCount || result.purchaseOrders?.length || 1;
        showAlert(`PR berhasil dikonsolidasikan menjadi ${count} PO. Membuka ${poNumber}.`, "success");
        setTimeout(() => location.assign(`/modules/purchasing/purchase-order/${encodeURIComponent(poNumber)}`), 450);
      } else if (action === "convert-suggestion-to-pr") {
        const documents = Array.isArray(result.purchaseRequisitions) ? result.purchaseRequisitions : (result.prNumbers || []).map((prNumber) => ({ prNumber }));
        if (documents.length > 1) {
          await load();
          const box = $("ops-detail-alert");
          box.className = "alert alert-success";
          box.innerHTML = `<b>${esc(result.message || `${documents.length} Draft PR berhasil dibuat.`)}</b><div class="ps-created-pr-links">${documents.map((document) => `<a href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(document.prNumber)}"><span>${esc(document.procurementCategory === "PURCHASE_PART" ? "Purchase Part" : document.procurementCategory === "MATERIAL" ? "Material" : "PR")}</span><b>${esc(document.prNumber)}</b><small>${esc(document.itemCount || 0)} item · ${esc(document.poType || "-")}</small></a>`).join("")}</div>`;
        } else {
          showAlert(result.message || "Draft PR berhasil dibuat dari Purchase Suggestion.", "success");
          const document = documents[0];
          setTimeout(() => location.assign(document?.prNumber ? `/modules/purchasing/purchase-requisitions/${encodeURIComponent(document.prNumber)}` : "/modules/purchasing/purchase-requisitions"), 500);
        }
      } else if (action === "dispatch-daily") {
        if (number(result?.summary?.blockedCount) > 0) {
          showAlert(`${number(result.summary.createdCount)} jadwal dibuat; ${number(result.summary.blockedCount)} blocker belum dapat dijadwalkan.`, "warning");
        } else {
          showAlert(`${number(result?.summary?.createdCount)} Daily Plan berhasil dibuat.`, "success");
          setTimeout(() => location.assign("/modules/production/daily-production-schedules"), 450);
        }
      } else if (["submit", "submit-checking"].includes(action)) {
        const requestNumber = result?.approvalRequest?.requestNumber;
        showAlert(`Dokumen masuk ke alur approval${requestNumber ? ` (${requestNumber})` : ""}.`, "success");
        setTimeout(() => location.reload(), 650);
      } else { showAlert("Workflow berhasil diproses.", "success"); setTimeout(() => location.reload(), 450); }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  load();
})();
