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
  const num = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: Math.min(Math.max(Number(digits) || 0, 0), 2) }).format(number(value));
  const roundedPurchaseQty = (qty, moq, orderMultiple) => {
    const requested = Math.max(number(qty), 0);
    if (requested <= 0) return 0;
    const minimum = Math.max(requested, number(moq));
    const multiple = number(orderMultiple);
    return multiple > 0 ? Math.ceil(minimum / multiple) * multiple : minimum;
  };
  const discreteUoms = new Set(["PCS", "PC", "PIECE", "PIECES", "SHEET", "SHEETS", "COIL", "COILS"]);
  const isDiscreteUom = (value) => discreteUoms.has(String(value || "").trim().toUpperCase());
  const qty = (value, uomCode = "") => window.SharedDataTable.formatQuantity(value, uomCode, { maximumFractionDigits: 2 });
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
  const isProductionDetail = () => ["production", "qc"].includes(config.module);
  const isGoodsReceiptPage = () => config.module === "incoming" && config.page.slug === "goods-receipts";
  const isStockBalancePage = () => config.module === "inventory" && config.page.slug === "stock-balances";
  const isDailySchedulePage = () => config.module === "production" && config.page.slug === "daily-production-schedules";
  const isNgDispositionPage = () => config.module === "qc" && config.page.slug === "ng-dispositions";
  const isQualityInspectionPage = () => config.module === "qc" && config.page.slug === "quality-inspections";
  const isDeliveryPage = () => config.module === "outgoing" && ["delivery-schedules", "delivery-schedule"].includes(config.page.slug);
  let deliveryToolsPromise = null;
  let deliveryActionPending = false;
  let detailLoading = false;
  let deliveryPolling = null;
  function deliveryTools() {
    if (!deliveryToolsPromise) deliveryToolsPromise = new Promise((resolve, reject) => {
      if (window.DeliveryWorkflow) { resolve(window.DeliveryWorkflow); return; }
      const script = document.createElement("script"); script.src = "/js/delivery-workflow.js?v=20260908-1";
      script.onload = () => resolve(window.DeliveryWorkflow); script.onerror = () => { deliveryToolsPromise = null; reject(new Error("Form pengiriman gagal dimuat. Coba kembali.")); };
      document.head.appendChild(script);
    });
    return deliveryToolsPromise;
  }
  let currentRecord = null;
  let supplierLookupRows = [];
  let supplierLookupPromise = null;
  let goodsReceiptTableRows = [];
  let goodsReceiptTable = null;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload.data || payload.item || payload;
  }
  function loadSupplierLookup() {
    if (!supplierLookupPromise) {
      supplierLookupPromise = api("/master-data/api/suppliers?start=0&length=500&isDeleted=false")
        .then((rows) => {
          supplierLookupRows = (Array.isArray(rows) ? rows : [])
            .filter((supplier) => supplier?.supplierCode)
            .sort((left, right) => String(left.supplierCode).localeCompare(String(right.supplierCode)));
          return supplierLookupRows;
        })
        .catch((error) => {
          supplierLookupPromise = null;
          throw error;
        });
    }
    return supplierLookupPromise;
  }
  const supplierLookupOptions = (selectedCode = "") => {
    const hasSelectedSupplier = supplierLookupRows.some((supplier) => supplier.supplierCode === selectedCode);
    return [
      '<option value="">Pilih supplier</option>',
      selectedCode && !hasSelectedSupplier ? `<option value="${esc(selectedCode)}" selected>${esc(selectedCode)} — Supplier tersimpan</option>` : "",
      ...supplierLookupRows.map((supplier) => `<option value="${esc(supplier.supplierCode)}" ${supplier.supplierCode === selectedCode ? "selected" : ""}>${esc(supplier.supplierCode)} — ${esc(supplier.supplierName || "")}</option>`),
    ].join("");
  };
  const supplierLookupSelect = (attribute, value = "", classes = "form-select") =>
    `<select class="${classes}" ${attribute}>${supplierLookupOptions(value)}</select>`;
  function showAlert(message, kind = "danger") { const box = $("ops-detail-alert"); box.textContent = message; box.className = `alert alert-${kind}`; }
  function isInternalKey(key) {
    if (isDeliveryPage() && ["receivedSignature", "podUrl"].includes(key)) return true;
    return /^(id|createdAt|updatedAt|deletedAt|isDeleted)$/i.test(String(key || ""))
      || /(^|[_-])id$/i.test(String(key || ""))
      || /Id$/.test(String(key || ""));
  }
  function scalarEntries(object) { return Object.entries(object || {}).filter(([key, value]) => !isInternalKey(key) && (value == null || ["string", "number", "boolean"].includes(typeof value))); }
  function hasDisplayValue(value) { return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== ""); }
  function meaningfulScalarEntries(object) { return scalarEntries(object).filter(([, value]) => hasDisplayValue(value)); }
  function fieldPriority(key) {
    if (/number$|code$|name$/i.test(key)) return 0;
    if (/date$|month$|start$|end$|status$/i.test(key)) return 1;
    if (/qty|quantity|amount|total|price|progress|percent/i.test(key)) return 2;
    return 3;
  }
  const referenceRules = [
    { test: /^(source)?monthlyProductionPlanNumber$|^planNumber$/i, type: "MPP", href: (value) => `/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(value)}` },
    { test: /^mpsNumber$|^sourceMpsNumbers?$/i, type: "MPS", href: (value) => `/modules/planning-ppic/mps/${encodeURIComponent(value)}` },
    { test: /^mrpNumber$|^mrpRunNumber$|^runNumber$|^sourceMrpNumbers?$/i, type: "MRP", href: (value) => `/modules/planning-ppic/mrp/${encodeURIComponent(value)}` },
    { test: /^forecastNumber$|^sourceForecastNumbers?$/i, type: "Forecast", href: (value) => `/modules/sales/forecasts/${encodeURIComponent(value)}` },
    { test: /^soNumber$|^sourceSONumbers?$/i, type: "SO", href: (value) => `/modules/sales/sales-orders/${encodeURIComponent(value)}` },
    { test: /^moNumber$|^manufacturingOrderNumber$/i, type: "MO", href: (value) => `/modules/production/manufacturing-orders/${encodeURIComponent(value)}` },
    { test: /^woNumber$|^workOrderNumber$/i, type: "WO", href: (value) => `/modules/production/work-orders/${encodeURIComponent(value)}` },
    { test: /^issueNumber$|^materialIssueNumber$/i, type: "MI", href: (value) => `/modules/inventory/material-issues/${encodeURIComponent(value)}` },
    { test: /^logNumber$|^productionLogNumber$/i, type: "Production Entry", href: (value) => `/modules/production/production-logs/${encodeURIComponent(value)}` },
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
          : `/modules/qc/quality-inspections/${encodeURIComponent(value)}`,
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
    const entries = meaningfulScalarEntries(record).sort(([left], [right]) => fieldPriority(left) - fieldPriority(right));
    if (isProductionDetail() && entries.length) {
      $("ops-detail-fields").className = "production-excel-wrap";
      $("ops-detail-fields").innerHTML = `<table class="table ops-collection-table production-excel-table"><thead><tr>${entries.map(([key]) => `<th>${esc(label(key))}</th>`).join("")}</tr></thead><tbody><tr>${entries.map(([key, value]) => `<td>${linkedValue(value, key, record)}</td>`).join("")}</tr></tbody></table>`;
      return;
    }
    const primary = entries.slice(0, 8);
    const secondary = entries.slice(8);
    const fields = (rows) => rows.map(([key, value]) => `<div><small>${esc(label(key))}</small><strong>${linkedValue(value, key, record)}</strong></div>`).join("");
    $("ops-detail-fields").className = "ops-detail-fields ops-detail-summary-fields";
    $("ops-detail-fields").innerHTML = `${fields(primary) || '<div><small>Informasi</small><strong>Tidak ada field ringkas.</strong></div>'}${secondary.length ? `<details class="ops-more-fields"><summary>Informasi tambahan <span>${num(secondary.length, 0)} field</span></summary><div>${fields(secondary)}</div></details>` : ""}`;
  }
  function ngDispositionStatus(record) {
    const value = slug(record.status);
    if (value === "pending-qc") return { label: "Menunggu QC", tone: "pending" };
    if (value === "rework") return { label: "Rework", tone: "rework" };
    if (value === "reject") return { label: "Final Reject", tone: "reject" };
    if (value === "mixed") return { label: "Rework + Reject", tone: "mixed" };
    return { label: record.status || "-", tone: value || "neutral" };
  }
  function ngDispositionReference(value, key) {
    const reference = resolveReference(key, value);
    if (!reference) return esc(value || "-");
    return `<a class="ngd-reference" href="${esc(reference.href)}"><span>${esc(reference.type)}</span><b>${esc(reference.label)}</b><i aria-hidden="true">→</i></a>`;
  }
  function renderNgDispositionFields(record) {
    const total = Math.max(number(record.qtyNg), 0);
    const rework = Math.max(number(record.qtyRework), 0);
    const reject = Math.max(number(record.qtyReject), 0);
    const remaining = Math.max(total - rework - reject, 0);
    const uom = record.uomCode || "pcs";
    const state = ngDispositionStatus(record);
    const pending = slug(record.status) === "pending-qc";
    const reason = String(record.reason || "").trim();
    const hasReason = reason && reason !== "-";
    const card = $("ops-detail-fields")?.closest(".ops-detail-card");
    card?.classList.add("ngd-decision-card");
    const heading = card?.querySelector("header h2");
    if (heading) heading.textContent = "Ringkasan Judgment NG";
    $("ops-detail-status").innerHTML = `<span class="ngd-status ${esc(state.tone)}"><i></i>${esc(state.label)}</span>`;
    $("ops-detail-fields").className = "ngd-decision-summary";
    $("ops-detail-fields").innerHTML = `
      <div class="ngd-quantity-strip">
        <article class="ngd-total"><span>Total NG</span><strong>${num(total, isDiscreteUom(uom) ? 0 : 2)} <small>${esc(uom)}</small></strong><p>Quantity yang wajib diputuskan QC</p></article>
        <div class="ngd-equation" aria-label="Alokasi quantity NG">
          <article class="ngd-rework"><span>Rework</span><strong>${num(rework, isDiscreteUom(uom) ? 0 : 2)}</strong><small>Dapat diperbaiki</small></article>
          <b aria-hidden="true">+</b>
          <article class="ngd-reject"><span>Final Reject</span><strong>${num(reject, isDiscreteUom(uom) ? 0 : 2)}</strong><small>Tidak dapat dipakai</small></article>
          <b aria-hidden="true">=</b>
          <article class="ngd-remaining ${remaining > 0 ? "has-balance" : "is-clear"}"><span>Belum dialokasikan</span><strong>${num(remaining, isDiscreteUom(uom) ? 0 : 2)}</strong><small>${pending ? "Harus menjadi rework atau reject" : "Seluruh quantity sudah diputuskan"}</small></article>
        </div>
      </div>
      <div class="ngd-case-grid">
        <article class="ngd-part-case">
          <span class="ngd-section-label">Part terdampak</span>
          <h3>${esc(record.partName || "Part produksi")}</h3>
          <div class="ngd-part-identifiers">${ngDispositionReference(record.partCode, "partCode")}${record.partNumber ? `<b>PN ${esc(record.partNumber)}</b>` : ""}</div>
          <small>Production entry ${ngDispositionReference(record.logNumber, "logNumber")} <span>· Phase ${esc(record.phaseNumber || "-")}</span></small>
        </article>
        <article class="ngd-reason-case ${hasReason ? "" : "is-empty"}">
          <span class="ngd-section-label">Temuan NG</span>
          <h3>${esc(hasReason ? reason : "Alasan NG belum dicatat")}</h3>
          <p>${esc(record.subReason && record.subReason !== "-" ? record.subReason : (hasReason ? "Tidak ada sub reason" : "Lengkapi catatan saat membuat judgment QC."))}</p>
          ${record.qcNotes ? `<small>Catatan QC: ${esc(record.qcNotes)}</small>` : ""}
        </article>
      </div>`;
  }
  function ngDispositionTraceItem(labelText, value, key = "", note = "") {
    return `<div><span>${esc(labelText)}</span><strong>${key ? ngDispositionReference(value, key) : esc(value || "-")}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
  }
  function renderNgDispositionCollections(record) {
    const trace = [
      ngDispositionTraceItem("Production Entry", record.logNumber, "logNumber", format(record.logDate, "date")),
      ngDispositionTraceItem("MO / WO", record.moNumber, "moNumber", record.woNumber || "-"),
      ngDispositionTraceItem("Mesin / Shift", record.machineCode, "", `Shift ${record.shift || "-"}`),
      ngDispositionTraceItem("Proses", record.processName || record.processCode, "", record.processCode && record.processName ? record.processCode : ""),
      ngDispositionTraceItem("Input Lot", record.inputLotNumber, "", "Material masuk"),
      ngDispositionTraceItem("Production Lot", record.productionLotNumber, "", `Coil ${record.coilPhase?.coilNumber || "-"}`),
    ].join("");
    const decided = slug(record.status) !== "pending-qc";
    $("ops-detail-collections").innerHTML = `
      <section class="ops-detail-card ngd-trace-card">
        <header><div><h2>Trace Produksi</h2><p>Referensi asal quantity NG untuk verifikasi QC.</p></div><span>Phase ${esc(record.phaseNumber || "-")}</span></header>
        <div class="ngd-trace-grid">${trace}</div>
        <div class="ngd-flow" aria-label="Alur disposition NG">
          <div class="is-done"><i>1</i><span><b>Production Entry</b><small>${esc(record.logNumber || "-")}</small></span></div>
          <em></em>
          <div class="is-done"><i>2</i><span><b>NG tercatat</b><small>${num(record.qtyNg, isDiscreteUom(record.uomCode) ? 0 : 2)} ${esc(record.uomCode || "pcs")}</small></span></div>
          <em></em>
          <div class="${decided ? "is-done" : "is-current"}"><i>3</i><span><b>QC Judgment</b><small>${decided ? "Selesai" : "Menunggu keputusan"}</small></span></div>
          <em></em>
          <div class="${decided ? "is-done" : ""}"><i>4</i><span><b>Disposition</b><small>${decided ? ngDispositionStatus(record).label : "Rework / Reject"}</small></span></div>
        </div>
      </section>
      <section class="ops-detail-card ngd-audit-card" data-transaction-tab-title="Data Audit">
        <details>
          <summary><span><b>Data audit lengkap</b><small>ID sistem, waktu judgment, dan relasi database</small></span><i>Buka detail</i></summary>
          <div class="ngd-audit-grid">
            ${ngDispositionTraceItem("Disposition ID", record.id || config.recordKey)}
            ${ngDispositionTraceItem("Dibuat", format(record.createdAt, "createdAt"))}
            ${ngDispositionTraceItem("Diperbarui", format(record.updatedAt, "updatedAt"))}
            ${ngDispositionTraceItem("Diputuskan oleh", record.judgedBy || "Belum diputuskan")}
            ${ngDispositionTraceItem("Waktu judgment", record.judgedAt ? format(record.judgedAt, "judgedAt") : "Belum diputuskan")}
            ${ngDispositionTraceItem("Catatan QC", record.qcNotes || "-")}
          </div>
        </details>
      </section>`;
  }
  function prepareNgDispositionChrome(record) {
    const pending = slug(record.status) === "pending-qc";
    const firstAside = document.querySelector(".ops-detail-aside .ops-detail-card:first-child");
    const metaAside = document.querySelector(".ops-detail-aside .ops-detail-card:last-child");
    firstAside?.classList.add("ngd-action-panel");
    metaAside?.classList.add("ngd-meta-panel");
    const actionHeading = firstAside?.querySelector("h2");
    const actionHelp = firstAside?.querySelector(".ops-help");
    const metaHeading = metaAside?.querySelector("h2");
    if (actionHeading) actionHeading.textContent = pending ? "Keputusan QC" : "Hasil Judgment";
    if (actionHelp) actionHelp.textContent = pending
      ? `Alokasikan seluruh ${num(record.qtyNg, isDiscreteUom(record.uomCode) ? 0 : 2)} ${record.uomCode || "pcs"} NG. Rework + Final Reject harus sama dengan Total NG.`
      : "Judgment sudah tersimpan dan menjadi dasar alur rework atau final reject.";
    if (metaHeading) metaHeading.textContent = "Kontrol Audit";
    const breadcrumbKey = document.querySelector(".module-breadcrumb b");
    if (breadcrumbKey) breadcrumbKey.textContent = `${record.logNumber || "NG"} · Phase ${record.phaseNumber || "-"}`;
  }

  function qualityInspectionState(record) {
    const documentStatus = slug(record.status);
    const decision = slug(record.decision);
    const releaseStatus = slug(record.outputReleaseStatus);
    if (documentStatus === "completed" && /accepted|conditional-accept/.test(decision)) return { label: "QC Accepted", tone: "accepted" };
    if (documentStatus === "completed" && /reject/.test(decision)) return { label: "QC Rejected", tone: "rejected" };
    if (documentStatus === "completed") return { label: "QC Selesai", tone: "completed" };
    if (/released|received/.test(releaseStatus)) return { label: "Stock Released", tone: "accepted" };
    return { label: "Menunggu QC", tone: "pending" };
  }

  function qualityInspectionReference(type, value, href, note = "") {
    const labelValue = value || "-";
    const content = href
      ? `<a href="${esc(href)}"><b>${esc(labelValue)}</b><i aria-hidden="true">→</i></a>`
      : `<b>${esc(labelValue)}</b>`;
    return `<div class="qci-reference"><span>${esc(type)}</span>${content}${note ? `<small>${esc(note)}</small>` : ""}</div>`;
  }

  function prepareQualityInspectionChrome(record) {
    document.querySelector(".ops-page")?.classList.add("qc-inspection-workbench");
    const state = qualityInspectionState(record);
    const firstAside = document.querySelector(".ops-detail-aside .ops-detail-card:first-child");
    const metaAside = document.querySelector(".ops-detail-aside .ops-detail-card:last-child");
    firstAside?.classList.add("qci-action-panel");
    metaAside?.classList.add("qci-meta-panel");
    const actionHeading = firstAside?.querySelector("h2");
    const actionHelp = firstAside?.querySelector(".ops-help");
    if (actionHeading) actionHeading.textContent = slug(record.status) === "draft" ? "Keputusan QC" : "Hasil Release";
    if (actionHelp) actionHelp.textContent = slug(record.status) === "draft"
      ? "Periksa hasil quantity dan trace produksi sebelum melepas stock dari QC Hold."
      : `Dokumen selesai dengan keputusan ${record.decision || state.label}. Status stock: ${record.outputReleaseStatus || "-"}.`;
    metaAside?.querySelector("h2")?.replaceChildren(document.createTextNode("Kontrol Audit"));
    const breadcrumbKey = document.querySelector(".module-breadcrumb b");
    if (breadcrumbKey) breadcrumbKey.textContent = record.inspectionNumber || config.recordKey;
  }

  function renderQualityInspectionFields(record) {
    const part = record.part || {};
    const workOrder = record.workOrder || {};
    const uom = workOrder.uomCode || record.manufacturingOrder?.uomCode || record.uomCode || "pcs";
    const digits = isDiscreteUom(uom) ? 0 : 2;
    const inspected = Math.max(number(record.qtyInspected), 0);
    const passed = Math.max(number(record.qtyPassed), 0);
    const failed = Math.max(number(record.qtyFailed), 0);
    const rework = Math.max(number(record.qtyRework), 0);
    const passRate = inspected > 0 ? Math.min(100, passed / inspected * 100) : 0;
    const state = qualityInspectionState(record);
    const releaseLabel = String(record.outputReleaseStatus || "WAITING_QC").replace(/_/g, " ");
    const card = $("ops-detail-fields")?.closest(".ops-detail-card");
    card?.classList.add("qci-summary-card");
    const heading = card?.querySelector("header h2");
    if (heading) heading.textContent = "Ringkasan Quality Inspection";
    $("ops-detail-status").innerHTML = `<span class="qci-status is-${esc(state.tone)}"><i></i>${esc(state.label)}</span>`;
    $("ops-detail-fields").className = "qci-overview";
    const partCode = part.partCode || record.partCode || "-";
    const partName = part.partName || record.partName || "Part produksi";
    const partNumber = part.partNumber || record.partNumber || "-";
    const inspectedBy = record.inspectedBy || "Belum ditentukan";
    const approval = record.approvedBy ? `${record.approvedBy} · ${format(record.approvedAt, "approvedAt")}` : "Belum disetujui";
    $("ops-detail-fields").innerHTML = `
      <div class="qci-kpi-grid">
        <article class="is-total"><span>Qty Check</span><strong>${num(inspected, digits)}</strong><small>${esc(uom)} diperiksa</small></article>
        <article class="is-pass"><span>Qty OK</span><strong>${num(passed, digits)}</strong><small>Lolos pemeriksaan</small></article>
        <article class="is-fail"><span>Qty NG</span><strong>${num(failed, digits)}</strong><small>Tidak lolos</small></article>
        <article class="is-rework"><span>Qty Rework</span><strong>${num(rework, digits)}</strong><small>Perlu proses ulang</small></article>
      </div>
      <div class="qci-progress-panel">
        <div class="qci-progress-copy"><span>Pass rate</span><strong>${num(passRate, 1)}%</strong><small>Sample ${num(record.sampleSize || 0, 0)} ${esc(uom)} · Decision ${esc(record.decision || "Pending")}</small></div>
        <div class="qci-progress-track" role="progressbar" aria-label="Pass rate" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${passRate.toFixed(1)}"><i style="width:${passRate}%"></i></div>
        <div class="qci-release-state"><span>Output release</span><b>${esc(releaseLabel)}</b><small>${record.fgReceiptEligible ? `${num(record.fgReceiptPendingQty || 0, digits)} ${esc(uom)} menunggu FG Receipt` : "WIP mengikuti alur stock proses berikutnya"}</small></div>
      </div>
      <div class="qci-context-grid">
        <article><span>Part</span><a href="/master-data/parts/${encodeURIComponent(partCode)}"><b>${esc(partCode)}</b><i aria-hidden="true">→</i></a><small>${esc(partName)} · PN ${esc(partNumber)}</small></article>
        <article><span>Batch / Lot</span><a href="/modules/inventory/lots/${encodeURIComponent(record.batchNumber || "")}"><b>${esc(record.batchNumber || "-")}</b><i aria-hidden="true">→</i></a><small>${esc(record.sourceStockType || "Stock produksi")}</small></article>
        <article><span>Inspection</span><b>${esc(format(record.inspectionDate, "inspectionDate"))}</b><small>${esc(inspectedBy)}</small></article>
        <article><span>Approval</span><b>${esc(approval)}</b><small>${esc(state.label)}</small></article>
      </div>
      ${record.notes ? `<div class="qci-notes"><span>Catatan QC</span><p>${esc(record.notes)}</p></div>` : ""}`;
  }

  function renderQualityInspectionCollections(record) {
    const mo = record.manufacturingOrder || {};
    const wo = record.workOrder || {};
    const log = record.productionLog || {};
    const part = record.part || {};
    const source = record.qcSourceLocation || {};
    const reject = record.qcRejectSourceLocation || {};
    const completed = slug(record.status) === "completed";
    const released = /released|received/.test(slug(record.outputReleaseStatus));
    const finalOutput = record.fgReceiptEligible === true;
    const stockStepLabel = finalOutput ? "FG Receipt" : "Stock WIP";
    const stockStepNote = released ? "Stock sudah tersedia" : finalOutput ? "Menunggu penerimaan FG" : "Menunggu release QC";
    const logNumber = log.logNumber || record.logNumber;
    const moNumber = mo.moNumber || record.moNumber;
    const woNumber = wo.woNumber || record.woNumber;
    const partCode = part.partCode || record.partCode;
    const lotNumber = record.batchNumber || source.lotNumber || reject.lotNumber;
    $("ops-detail-collections").innerHTML = `
      <section class="ops-detail-card qci-trace-card">
        <header><div><h2>Trace & Alur Release</h2><p>Satu jalur dari perintah produksi sampai stock keluar dari QC Hold.</p></div><span>${esc(record.sourceStockType || "Production QC")}</span></header>
        <div class="qci-flow" aria-label="Alur quality inspection">
          <div class="is-done"><i>1</i><span><b>Production Entry</b><small>${esc(logNumber || "-")}</small></span></div><em></em>
          <div class="is-done"><i>2</i><span><b>QC Hold</b><small>${esc(lotNumber || "-")}</small></span></div><em></em>
          <div class="${completed ? "is-done" : "is-current"}"><i>3</i><span><b>Inspection</b><small>${esc(completed ? record.decision || "Selesai" : "Menunggu keputusan")}</small></span></div><em></em>
          <div class="${released ? "is-done" : completed ? "is-current" : ""}"><i>4</i><span><b>${esc(stockStepLabel)}</b><small>${esc(stockStepNote)}</small></span></div>
        </div>
        <div class="qci-reference-grid">
          <article><h3>Sumber produksi</h3>${qualityInspectionReference("Manufacturing Order", moNumber, moNumber ? `/modules/production/manufacturing-orders/${encodeURIComponent(moNumber)}` : "", mo.status || "")}${qualityInspectionReference("Work Order", woNumber, woNumber ? `/modules/production/work-orders/${encodeURIComponent(woNumber)}` : "", wo.sequence ? `Sequence ${wo.sequence}` : "")}${qualityInspectionReference("Production Entry", logNumber, logNumber ? `/modules/production/production-logs/${encodeURIComponent(logNumber)}` : "", log.machineCode || log.operatorName || "")}</article>
          <article><h3>Identitas output</h3>${qualityInspectionReference("Part", partCode, partCode ? `/master-data/parts/${encodeURIComponent(partCode)}` : "", part.partName || record.partName || "")}${qualityInspectionReference("Batch / Lot", lotNumber, lotNumber ? `/modules/inventory/lots/${encodeURIComponent(lotNumber)}` : "", part.partNumber ? `PN ${part.partNumber}` : "")}${qualityInspectionReference("Stock type", record.sourceStockType || "-", "", finalOutput ? "Final output" : "WIP proses")}</article>
          <article><h3>Lokasi QC</h3>${qualityInspectionReference("QC Hold", source.warehouseCode || "-", "", source.lotNumber || lotNumber || "")}${qualityInspectionReference("Reject rack", reject.rackCode || reject.warehouseCode || "-", "", reject.lotNumber || lotNumber || "")}${qualityInspectionReference("Release status", String(record.outputReleaseStatus || "WAITING_QC").replace(/_/g, " "), "", released ? "Sudah diposting" : "Belum diposting")}</article>
        </div>
      </section>`;
  }
  const isPurchaseOrderPage = () => config.module === "purchasing" && config.page.slug === "purchase-order";
  const isPurchaseRequisitionPage = () => config.module === "purchasing" && config.page.slug === "purchase-requisitions";
  function purchaseOrderMoney(value, record) {
    const code = String(record.currencyCode || "IDR").toUpperCase();
    try { return new Intl.NumberFormat("id-ID", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(number(value)); }
    catch (_error) { return `${esc(record.currency?.symbol || code)} ${num(value, 2)}`; }
  }
  function renderPurchaseOrderFields(record) {
    const details = Array.isArray(record.details) ? record.details : [];
    const completeLines = details.filter((row) => number(row.qty) > 0 && number(row.qtyReceived) >= number(row.qty) - 1e-9).length;
    const partialLines = details.filter((row) => number(row.qtyReceived) > 0 && number(row.qtyReceived) < number(row.qty) - 1e-9).length;
    const supplierCode = record.supplierCode || record.vendorCode || "";
    const supplierName = record.supplierName || record.vendorName || record.supplier?.supplierName || record.vendor?.vendorName || "Supplier belum dipilih";
    const supplierHref = record.supplierCode
      ? `/master-data/suppliers/${encodeURIComponent(record.supplierCode)}`
      : record.vendorCode ? `/master-data/vendors/${encodeURIComponent(record.vendorCode)}` : "";
    const card = $("ops-detail-fields").closest(".ops-detail-card");
    const heading = card?.querySelector("header h2");
    if (heading) heading.textContent = "Ringkasan Purchase Order";
    $("ops-detail-subtitle").textContent = `${supplierName} · ${record.poType || "Purchase Order"}`;
    $("ops-detail-fields").className = "po-overview";
    const supplierValue = supplierHref
      ? `<a href="${esc(supplierHref)}">${esc(supplierName)}</a><small>${esc(supplierCode)}</small>`
      : `<span>${esc(supplierName)}</span><small>${esc(supplierCode || "Tanpa kode")}</small>`;
    const receiptState = !details.length ? "Belum ada item" : completeLines === details.length ? "Semua diterima" : partialLines ? `${partialLines} line parsial` : "Belum ada penerimaan";
    const meta = [
      ["Tanggal PO", format(record.poDate, "date")],
      ["Tipe PO", record.poType || "Other"],
      ["Payment Terms", record.paymentTerms || "Belum ditentukan"],
      ["Quotation", record.quotationNumber || "Tidak ada"],
      ["Kontak", record.contact || record.supplier?.contact || record.vendor?.contact || "-"],
      ["Telepon / Email", [record.phone || record.supplier?.phone || record.vendor?.phone, record.email || record.supplier?.email || record.vendor?.email].filter(Boolean).join(" · ") || "-"],
      ["Alamat Kirim", record.shippingAddress || record.supplier?.shippingAddress || record.vendor?.shippingAddress || "-"],
      ["Alamat Tagihan", record.billingAddress || record.supplier?.billingAddress || record.vendor?.billingAddress || "-"],
    ];
    $("ops-detail-fields").innerHTML = `<div class="po-overview-kpis">
      <article class="amount"><span>Total PO</span><strong>${esc(purchaseOrderMoney(record.totalAmount, record))}</strong><small>${esc(record.currencyCode || "IDR")}</small></article>
      <article class="supplier"><span>Supplier</span><strong>${supplierValue}</strong></article>
      <article><span>Target Delivery</span><strong>${esc(format(record.deliveryDate, "date"))}</strong><small>${record.deliveryDate && new Date(record.deliveryDate) < (globalThis.erpBusinessNow?.() || new Date()) && !/completed|cancelled/i.test(record.status || "") ? "Lewat target" : "Tanggal penerimaan"}</small></article>
      <article><span>Progress Receipt</span><strong>${completeLines} / ${details.length} line</strong><small>${esc(receiptState)}</small></article>
    </div><div class="po-overview-meta">${meta.map(([name, value]) => `<div><span>${esc(name)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>${record.notes ? `<div class="po-overview-notes"><span>Catatan PO</span><p>${esc(record.notes)}</p></div>` : ""}`;
  }
  function purchaseOrderItem(row = {}) {
    const code = row.materialCode || row.partCode || row.product?.productCode || row.partNumber || "-";
    const name = row.materialName || row.partName || row.product?.productName || row.description || "Item Purchase Order";
    const specs = [row.materialType, row.spec, row.thickness ? `T ${num(row.thickness)} mm` : null, row.width ? `W ${num(row.width)} mm` : null, row.materialLength ? `L ${num(row.materialLength)} mm` : null, row.CSP].filter(Boolean).join(" · ");
    return { code, name, specs };
  }
  function purchaseOrderAllocation(row = {}) {
    const sources = Array.isArray(row.prDetail?.sources) ? row.prDetail.sources : [];
    const demandQty = sources.reduce((sum, source) => {
      const metadata = source?.metadata && typeof source.metadata === "object" ? source.metadata : {};
      const reserve = Math.max(number(metadata.reservedAllocationQty), 0);
      return sum + Math.max(number(metadata.demandCoveredQty ?? (number(source?.qty) - reserve)), 0);
    }, 0);
    const reserveQty = sources.reduce((sum, source) => {
      const metadata = source?.metadata && typeof source.metadata === "object" ? source.metadata : {};
      return sum + Math.max(number(metadata.reservedAllocationQty), 0);
    }, 0);
    return { demandQty, reserveQty, moqBufferQty: Math.max(number(row.qty) - demandQty - reserveQty, 0) };
  }
  function purchaseRequisitionMoney(value, record) {
    const code = String(record.currencyCode || "IDR").toUpperCase();
    try { return new Intl.NumberFormat("id-ID", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(number(value)); }
    catch (_error) { return `${esc(code)} ${num(value, 2)}`; }
  }
  function purchaseRequisitionCategory(value) {
    return ({
      MATERIAL: "PR-Raw Material",
      PURCHASE_PART: "PR-Purchase Part",
      UNIVERSAL_PURCHASE_PART: "PR-Universal Part",
      VENDOR_PROCESS: "PR-Vendor Process",
      ASSET: "PR-Asset",
      CONSUMABLE: "PR-Consumable",
      MAINTENANCE: "PR-Maintenance",
      SERVICE: "PR-Services",
      SERVICES: "PR-Services",
      NON_PRODUCTION: "PR-Other",
    })[String(value || "").trim().toUpperCase()] || value || "PR-Other";
  }
  function purchaseRequisitionPartner(record) {
    const details = Array.isArray(record.details) ? record.details : [];
    const vendorCodes = [...new Set(details.flatMap((row) => [row.preferredVendor, row.sourcingVendors, ...(row.sourcingAllocations || []).map((allocation) => allocation.vendorCode)]).filter(Boolean).flatMap(splitReferenceValues))];
    const supplierCodes = [...new Set(details.flatMap((row) => [row.confirmedSupplierCode, row.proposedSupplierCode, row.preferredSupplier, row.sourcingSuppliers, ...(row.sourcingAllocations || []).map((allocation) => allocation.supplierCode)]).filter(Boolean).flatMap(splitReferenceValues))];
    const codes = vendorCodes.length ? vendorCodes : supplierCodes;
    return { type: vendorCodes.length ? "Vendor" : "Supplier", codes, label: record.partnerLabel || codes.join(", ") || "Belum dipilih" };
  }
  function renderPurchaseRequisitionFields(record) {
    document.querySelector(".ops-page")?.classList.add("purchase-requisition-detail-page");
    const details = Array.isArray(record.details) ? record.details : [];
    const requested = details.reduce((sum, row) => sum + number(row.qty), 0);
    const ordered = details.reduce((sum, row) => sum + number(row.orderedQty), 0);
    const outstanding = Math.max(requested - ordered, 0);
    const progress = requested > 0 ? Math.min(ordered / requested * 100, 100) : 0;
    const uoms = [...new Set(details.map((row) => row.uomCode).filter(Boolean))];
    const uom = uoms.length === 1 ? uoms[0] : uoms.length ? "mixed UOM" : "unit";
    const partner = purchaseRequisitionPartner(record);
    const category = purchaseRequisitionCategory(record.procurementCategory || record.procurementGroup);
    const isVendorProcess = String(record.procurementCategory || record.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS";
    const card = $("ops-detail-fields").closest(".ops-detail-card");
    const heading = card?.querySelector("header h2");
    if (heading) heading.textContent = "Ringkasan Purchase Requisition";
    $("ops-detail-subtitle").textContent = `${category} · ${partner.label}`;
    $("ops-detail-fields").className = "pr-overview";
    $("ops-detail-fields").innerHTML = `<div class="pr-overview-kpis">
      <article class="type"><span>JENIS PERMINTAAN</span><strong>${esc(category)}</strong><small>${esc(record.sourceType || "MANUAL")} · ${num(details.length, 0)} item</small></article>
      <article class="partner"><span>${esc(partner.type.toUpperCase())}</span><strong>${esc(partner.label)}</strong><small>${partner.codes.length ? `${num(partner.codes.length, 0)} partner aktif` : "Lengkapi sebelum PO"}</small></article>
      <article class="due"><span>DIBUTUHKAN</span><strong>${esc(format(record.requiredDate, "date"))}</strong><small>${esc(record.priority || "Normal")} priority</small></article>
      <article class="amount"><span>ESTIMASI NILAI</span><strong>${esc(purchaseRequisitionMoney(record.totalAmount, record))}</strong><small>${isVendorProcess ? "Lookup Vendor Price List" : "Sebelum negosiasi final"}</small></article>
    </div>
    <div class="pr-progress-panel"><div><span>Progress ke Purchase Order</span><b>${num(progress)}%</b></div><i><em style="width:${progress}%"></em></i><div class="pr-progress-qty"><span>Requested <b>${qty(requested,uom)} ${esc(uom)}</b></span><span>Ordered <b>${qty(ordered,uom)} ${esc(uom)}</b></span><span>Outstanding <b>${qty(outstanding,uom)} ${esc(uom)}</b></span></div></div>
    <div class="pr-document-context">
      <div><span>Requester</span><b>${esc(record.requestedBy || "Belum ditentukan")}</b><small>${esc(record.department?.departmentName || "Tanpa departemen")}</small></div>
      <div><span>Tanggal PR</span><b>${esc(format(record.prDate, "date"))}</b><small>${esc(record.poType || "Other")}</small></div>
      <div><span>Status Dokumen</span><b>${badge(record.status || "Draft")}</b><small>${record.convertedToPO ? `PO ${esc(record.convertedToPO)}` : "Belum menjadi PO"}</small></div>
      <div><span>Aturan Berikutnya</span><b>${/draft|revising|rejected/i.test(record.status || "") ? "Lengkapi lalu submit" : /approved|partially/i.test(record.status || "") ? "Buat Purchase Order" : "Ikuti approval"}</b><small>${isVendorProcess ? "Vendor & jadwal berasal dari Capacity Planning" : "Supplier & bentuk beli dikunci di PR"}</small></div>
    </div>${record.notes ? `<details class="pr-system-note"><summary>Catatan & audit sistem</summary><p>${esc(record.notes)}</p></details>` : ""}`;
  }
  function purchaseRequisitionTrace(row) {
    const references = [
      ...splitReferenceValues(row.sourceMrpNumbers).map((value) => ({ type: "MRP", label: value, href: `/modules/planning-ppic/mrp/${encodeURIComponent(value)}` })),
      ...splitReferenceValues(row.sourceMpsNumbers).map((value) => ({ type: "MPS", label: value, href: `/modules/planning-ppic/mps/${encodeURIComponent(value)}` })),
      ...splitReferenceValues(row.sourcePlanNumbers).map((value) => ({ type: "MPP", label: value, href: `/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(value)}` })),
      ...splitReferenceValues(row.sourceSONumbers).map((value) => ({ type: "SO", label: value, href: `/modules/sales/sales-orders/${encodeURIComponent(value)}` })),
      ...splitReferenceValues(row.sourceForecastNumbers).map((value) => ({ type: "Forecast", label: value, href: `/modules/sales/forecasts/${encodeURIComponent(value)}` })),
    ];
    return referenceLinks(references.filter((reference, index, rows) => rows.findIndex((candidate) => candidate.type === reference.type && candidate.label === reference.label) === index), "Manual / tanpa trace Planning");
  }
  function renderPurchaseRequisitionDetails(rows, record) {
    const isVendorProcess = String(record.procurementCategory || record.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS";
    const body = rows.map((row) => {
      const outstanding = Math.max(number(row.qty) - number(row.orderedQty), 0);
      const progress = number(row.qty) > 0 ? Math.min(number(row.orderedQty) / number(row.qty) * 100, 100) : 0;
      const proposed = isVendorProcess ? (row.preferredVendor || row.sourcingVendors || "") : (row.confirmedSupplierCode || row.proposedSupplierCode || row.preferredSupplier || "");
      const identity = row.materialCode || row.partCode || row.partNumber || `Line ${row.lineNumber}`;
      const name = row.materialName || row.partName || row.description || "Item PR";
      const process = [row.vendorProcessCode, row.vendorProcessName].filter(Boolean).join(" · ");
      const dateRows = isVendorProcess
        ? `<div class="pr-vendor-dates"><span><small>Kirim ke vendor</small><b>${esc(format(row.vendorSendDates, "date"))}</b></span><i>→</i><span><small>Target kembali</small><b>${esc(format(row.vendorReturnDates || row.sourcingDeliveryDates || record.requiredDate, "date"))}</b></span></div>`
        : `<span class="pr-line-due">Due ${esc(format(row.sourcingDeliveryDates || record.requiredDate, "date"))}</span>`;
      return `<tr class="${isVendorProcess ? "is-vendor-process" : ""}">
        <td class="pr-select-cell"><input type="checkbox" class="form-check-input pr-po-line" data-pr-detail-id="${esc(row.id || "")}" data-line-number="${esc(row.lineNumber || "")}" data-supplier-code="${esc(proposed)}" data-partner-type="${isVendorProcess ? "vendor" : "supplier"}" data-outstanding="${esc(outstanding)}" data-required-date="${esc(String(record.requiredDate || "").slice(0, 10))}" data-request-uom="${esc(String(row.uomCode || "PCS").toUpperCase())}" data-raw-material="${row.materialCode ? "true" : "false"}" data-package-uom="${esc(row.purchasePackageUomCode || "")}" ${outstanding > 0 ? "checked" : "disabled"}></td>
        <td class="pr-line-item"><span class="pr-line-no">${num(row.lineNumber, 0)}</span><div><b>${esc(identity)}</b><strong>${esc(name)}</strong><small>${esc([row.partNumber && `Part No. ${row.partNumber}`, row.materialType, process, row.spec, row.thickness != null && `T ${row.thickness} mm`, row.width != null && `W ${row.width} mm`].filter(Boolean).join(" · ") || "Tanpa spesifikasi tambahan")}</small>${row.notes ? `<small class="pr-line-notes" style="white-space:pre-wrap">Catatan: ${esc(row.notes)}</small>` : ""}</div></td>
        <td><span class="pr-category-pill ${isVendorProcess ? "vendor" : ""}">${esc(purchaseRequisitionCategory(row.procurementCategory))}</span><small class="pr-partner-line">${esc(isVendorProcess ? `Vendor ${proposed || "belum dipilih"}` : `Supplier ${proposed || "belum dipilih"}`)}</small></td>
        <td class="pr-line-quantity"><b>${qty(row.qty,row.uomCode)} ${esc(row.uomCode || "")}</b><small>Ordered ${qty(row.orderedQty,row.uomCode)} · Sisa ${qty(outstanding,row.uomCode)}</small><i><em style="width:${progress}%"></em></i></td>
        <td>${dateRows}</td>
        <td class="pr-line-money"><b>${esc(purchaseRequisitionMoney(row.estimatedPrice, record))}</b><small>Total ${esc(purchaseRequisitionMoney(row.totalAmount, record))}${row.vendorPriceSource === "PRICE_NOT_FOUND" ? " · harga belum ada" : ""}</small></td>
        <td class="pr-line-trace">${purchaseRequisitionTrace(row)}${row.sourceCapacityAllocationIds ? `<small>Allocation ${esc(row.sourceCapacityAllocationIds)}</small>` : ""}</td>
      </tr>`;
    }).join("");
    return `<section class="ops-detail-card pr-lines-workspace"><div class="ops-collection-head"><div><h2>Item yang Diminta</h2><p>${isVendorProcess ? (record.sourceType === "MANUAL" ? "Permintaan proses vendor manual. Periksa part, proses, vendor, harga estimasi, dan tanggal kebutuhan." : "Qty, vendor, dan tanggal berasal dari Production Capacity. Harga membaca Vendor Price List.") : "Pilih item yang akan diputuskan suppliernya atau dibuat ke PO."}</p></div><span>${num(rows.length, 0)} item</span></div>
      <div class="pr-lines-help"><b>Urutan kerja:</b><span>1. Periksa qty & due date</span><i>→</i><span>2. Konfirmasi ${isVendorProcess ? "vendor" : "supplier"}</span><i>→</i><span>3. Submit approval</span><i>→</i><span>4. Move to PO</span></div>
      <div class="table-responsive"><table class="table ops-collection-table pr-friendly-table"><thead><tr><th><span class="visually-hidden">Pilih</span></th><th>Item / Proses</th><th>Jenis / Partner</th><th>Quantity</th><th>${isVendorProcess ? "Jadwal Vendor" : "Required Date"}</th><th>Estimasi</th><th>Planning Trace</th></tr></thead><tbody>${body || '<tr><td colspan="7" class="text-center py-4">Belum ada item Purchase Requisition.</td></tr>'}</tbody></table></div></section>`;
  }
  function purchaseOrderLinesCard(record) {
    const rows = Array.isArray(record.details) ? record.details : [];
    const body = rows.map((row) => {
      const item = purchaseOrderItem(row);
      const allocation = purchaseOrderAllocation(row);
      const ordered = number(row.qty);
      const received = number(row.qtyReceived);
      const outstanding = Math.max(ordered - received, 0);
      const state = outstanding <= 1e-9 ? "received" : received > 0 ? "partial" : "open";
      const stateLabel = state === "received" ? "Received" : state === "partial" ? "Partial" : "Open";
      const packageInfo = [row.purchasePackageQty ? `${num(row.purchasePackageQty)} ${row.purchasePackageUomCode || "pack"}` : null, row.conversionFactor ? `× ${num(row.conversionFactor)} ${row.conversionUomCode || row.uomCode || ""}` : null].filter(Boolean).join(" ");
      return `<tr>
        <td class="po-line-number">${num(row.lineNumber, 0)}</td>
        <td class="po-line-item"><b>${esc(item.code)}</b><span>${esc(item.name)}</span><small>${esc(item.specs || row.description || "Tanpa spesifikasi tambahan")}</small></td>
        <td><b>${esc(row.category || row.prDetail?.procurementCategory || "-")}</b><small class="d-block">${esc(packageInfo || row.uomCode || "-")}</small></td>
        <td class="po-line-qty"><b>${qty(ordered,row.uomCode)} ${esc(row.uomCode || "")}</b><small>Diterima ${qty(received,row.uomCode)} · Sisa ${qty(outstanding,row.uomCode)}</small>${row.prDetail?.sources?.length ? `<small class="po-line-allocation">Demand ${qty(allocation.demandQty,row.uomCode)} + reserve ${qty(allocation.reserveQty,row.uomCode)} + buffer MOQ ${qty(allocation.moqBufferQty,row.uomCode)}</small>` : ""}</td>
        <td class="po-line-money"><b>${esc(purchaseOrderMoney(row.unitPrice, record))}</b><small>Disc ${num(row.discount, 2)} · Tax ${num(row.tax, 2)}</small></td>
        <td class="po-line-money"><b>${esc(purchaseOrderMoney(row.totalAmount, record))}</b><small>${esc(format(row.deliveryDate || record.deliveryDate, "date"))}</small></td>
        <td><span class="po-line-state ${state}">${stateLabel}</span></td>
      </tr>`;
    }).join("");
    return `<section class="ops-detail-card po-lines-card"><div class="ops-collection-head"><div><h2>Item Purchase Order</h2><p>Quantity, harga, penerimaan, dan outstanding setiap line.</p></div><span>${num(rows.length, 0)} line</span></div><div class="table-responsive"><table class="table ops-collection-table po-lines-table"><thead><tr><th>No.</th><th>Item / Spesifikasi</th><th>Kategori / Packaging</th><th>Qty & Receipt</th><th>Harga Satuan</th><th>Total / Delivery</th><th>Status</th></tr></thead><tbody>${body || '<tr><td colspan="7" class="text-center py-4">Belum ada item Purchase Order.</td></tr>'}</tbody></table></div></section>`;
  }
  function purchaseOrderRelationsCard(record) {
    const prs = Array.isArray(record.purchaseRequisitions) ? record.purchaseRequisitions : [];
    const receipts = Array.isArray(record.goodsReceipts) ? record.goodsReceipts : [];
    const files = Array.isArray(record.quotationFiles) ? record.quotationFiles : [];
    const prRows = prs.map((row) => { const value = row.prNumber || row.pr?.prNumber; return value ? `<a href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(value)}"><span>Purchase Requisition</span><b>${esc(value)}</b><small>${esc([row.pr?.department, row.pr?.requestedBy].filter(Boolean).join(" · ") || "Buka detail PR")}</small><i>→</i></a>` : ""; }).join("");
    const receiptRows = receipts.map((row) => `<a href="/modules/incoming/goods-receipts/${encodeURIComponent(row.grNumber)}"><span>Goods Receipt</span><b>${esc(row.grNumber)}</b><small>${esc(format(row.grDate, "date"))} · ${esc(row.status || "-")}</small><i>→</i></a>`).join("");
    const fileRows = files.map((file) => file?.fileUrl ? `<a href="${esc(file.fileUrl)}" target="_blank" rel="noopener"><span>Lampiran Quotation</span><b>${esc(file.fileName || "Buka file")}</b><small>${esc(file.fileType || "Dokumen")}</small><i>↗</i></a>` : "").join("");
    return `<div class="po-support-grid"><section class="ops-detail-card"><div class="ops-collection-head"><div><h2>Dokumen Terkait</h2><p>PR, penerimaan, dan quotation yang terhubung.</p></div><span>${num(prs.length + receipts.length + files.length, 0)} relasi</span></div><div class="po-related-list">${prRows}${receiptRows}${fileRows || ""}${!prRows && !receiptRows && !fileRows ? '<div class="po-related-empty">Belum ada dokumen terkait.</div>' : ""}</div></section>${purchaseOrderSignatoryCard(record)}</div>`;
  }
  function purchaseOrderSignatoryCard(record) {
    const roles = [["Issued", record.issued, record.createdBy, record.createdAt], ["Checked", record.checked, record.checkedBy, record.checkedDate], ["Approved", record.approved, record.approvedBy, record.approvedDate]];
    const rows = roles.filter(([, user, username]) => user || username).map(([role, user, username, dateValue]) => `<div><span>${esc(role)}</span><strong>${esc(user?.fullName || user?.username || username || "-")}</strong><small>${esc(user?.email || (dateValue ? format(dateValue, "date") : "Belum diproses"))}</small></div>`).join("");
    return `<section class="ops-detail-card po-signatory-card"><div class="ops-collection-head"><div><h2>Approval Trail</h2><p>Penanggung jawab dokumen.</p></div><span>${rows ? "Audit" : "-"}</span></div><div class="po-signatory-list">${rows || '<div><span>Status</span><strong>Belum ada approval</strong><small>Dokumen masih dalam persiapan.</small></div>'}</div></section>`;
  }
  function renderPurchaseOrderCollections(record) {
    const blockers = collectBlockers(record);
    $("ops-detail-collections").innerHTML = [
      blockers.length ? blockerCard(record) : "",
      purchaseOrderLinesCard(record),
      purchaseOrderRelationsCard(record),
    ].join("");
  }
  const isIncomingInspectionPage = () => config.module === "incoming" && config.page.slug === "incoming-inspections";
  const isMaterialIssuePage = () => config.page.slug === "material-issues" && ["inventory", "production"].includes(config.module);
  function renderIncomingInspectionFields(record) {
    const gr = record.gr || {};
    const po = gr.po || {};
    const documentCard = $("ops-detail-fields").closest(".ops-detail-card");
    const heading = documentCard?.querySelector("header h2");
    if (heading) heading.textContent = "Ringkasan Penerimaan";
    $("ops-detail-fields").className = "ops-detail-fields iqc-header-fields";
    const fields = [
      ["Supplier", po.supplierName || po.vendorName || po.supplierCode || po.vendorCode || "-"],
      ["Purchase Order", linkedValue(gr.poNumber, "poNumber", gr)],
      ["Goods Receipt", linkedValue(record.grNumber, "grNumber", record)],
      ["Gudang Tujuan", `${esc(gr.warehouseCode || "-")}<small class="iqc-field-note">${esc(gr.warehouse?.warehouseName || "")}</small>`],
      ["Petugas", esc(record.inspectedBy || "-")],
      ["Tanggal", esc(format(record.inspectionDate, "date"))],
    ];
    $("ops-detail-fields").innerHTML = fields.map(([name, value]) => `<div><small>${esc(name)}</small><strong>${value}</strong></div>`).join("");
  }
  function incomingInspectionItem(row = {}) {
    const receipt = row.grDetail || {};
    const item = receipt.poDetail || {};
    const code = item.materialCode || item.partCode || item.partNumber || item.description || `Baris ${row.lineNumber || "-"}`;
    const name = item.materialName || item.partName || item.description || "Material incoming";
    const specs = [
      item.purchasePackageUomCode,
      item.thickness ? `T ${num(item.thickness)} mm` : null,
      item.width ? `W ${num(item.width)} mm` : null,
      item.materialLength ? `L ${num(item.materialLength)} mm` : null,
      item.spec,
    ].filter(Boolean).join(" · ");
    return { receipt, item, code, name, specs };
  }
  function renderIncomingInspectionCollections(record) {
    const rows = Array.isArray(record.details) ? record.details : [];
    const canComplete = String(record.status || "").toUpperCase() === "OPEN";
    const totalReceived = rows.reduce((sum, row) => sum + number(row.grDetail?.qtyReceived), 0);
    const totalAccepted = rows.reduce((sum, row) => sum + number(row.qtyInspected ? row.qtyAccepted : row.grDetail?.qtyReceived), 0);
    const totalRejected = rows.reduce((sum, row) => sum + number(row.qtyRejected), 0);
    const rowHtml = rows.map((row) => {
      const { receipt, code, name, specs } = incomingInspectionItem(row);
      const received = number(receipt.qtyReceived);
      const rejected = number(row.qtyRejected);
      const accepted = number(row.qtyInspected) > 0 ? number(row.qtyAccepted) : Math.max(received - rejected, 0);
      const uom = receipt.uomCode || "";
      const step = isDiscreteUom(uom) ? "1" : "0.0001";
      const disposition = row.rejectedDisposition || "HOLD";
      if (!canComplete) {
        const pendingReject = rejected > number(row.qtyRejectedDisposed) + 1e-9;
        const finalDisposition = pendingReject ? `<div class="iqc-final-disposition" data-iqc-disposition-detail="${esc(row.id || "")}"><select class="form-select form-select-sm" data-iqc-disposition><option value="RETURN_TO_SUPPLIER">Kembalikan ke supplier</option><option value="SCRAP">Scrap</option></select><input class="form-control form-control-sm" data-iqc-disposition-reference value="${esc(row.dispositionReference || "")}" placeholder="Referensi / alasan"></div>` : `<div class="iqc-result-status">${badge(row.disposition || (rejected > 0 ? "REJECT" : "ACCEPT"))}<small>${esc(row.rejectedDisposition || "")}</small></div>`;
        return `<article class="iqc-result-row">
        <div class="iqc-line-number">${num(row.lineNumber, 0)}</div>
        <div class="iqc-item"><b>${esc(code)}</b><span>${esc(name)}</span><small>${esc(specs || "Tanpa spesifikasi tambahan")}</small></div>
        <div class="iqc-trace"><small>Internal / Supplier Lot</small><b>${esc(receipt.lotNumber || "-")}</b><span>${esc(receipt.supplierLotNumber || "-")} · ${esc(receipt.rackCode || "Tanpa rack")}</span></div>
        <div class="iqc-result-numbers"><span><small>Diterima</small><b>${qty(received,uom)} ${esc(uom)}</b></span><span class="is-good"><small>Accepted</small><b>${qty(accepted,uom)} ${esc(uom)}</b></span><span class="${rejected > 0 ? "is-reject" : ""}"><small>Rejected</small><b>${qty(rejected,uom)} ${esc(uom)}</b></span></div>
        ${finalDisposition}
      </article>`;
      }
      return `<article class="iqc-input-row" data-iqc-detail data-iqc-gr-detail="${esc(row.grDetailId || "")}" data-iqc-received="${esc(received)}">
        <div class="iqc-line-number">${num(row.lineNumber, 0)}</div>
        <div class="iqc-item"><b>${esc(code)}</b><span>${esc(name)}</span><small>${esc(specs || "Tanpa spesifikasi tambahan")}</small></div>
        <div class="iqc-trace"><small>Internal Lot</small><b>${esc(receipt.lotNumber || "-")}</b><span>Supplier: ${esc(receipt.supplierLotNumber || "-")} · ${esc(receipt.rackCode || "Tanpa rack")}</span></div>
        <div class="iqc-received"><small>Qty Datang</small><b>${qty(received,uom)} ${esc(uom)}</b></div>
        <div class="iqc-entry">
          <div class="iqc-qty-fields"><label><span>Qty Diterima Baik</span><input class="form-control" data-iqc-accepted type="number" value="${esc(accepted)}" readonly></label><label><span>Qty Reject</span><input class="form-control" data-iqc-rejected type="number" min="0" max="${esc(received)}" step="${step}" value="${esc(rejected)}"></label></div>
          <div class="iqc-row-tools"><button class="btn btn-sm btn-outline-success" type="button" data-iqc-accept-row>✓ Terima Semua</button><span class="iqc-row-state ${rejected > 0 ? "has-reject" : "is-accepted"}" data-iqc-row-state>${rejected > 0 ? `${qty(rejected,uom)} ${esc(uom)} reject` : "Semua diterima"}</span></div>
          <div class="iqc-reject-panel ${rejected > 0 ? "" : "d-none"}" data-iqc-reject-panel data-iqc-disposition-detail="${esc(row.id || "")}">
            <label><span>Tindakan untuk Reject *</span><select class="form-select" data-iqc-disposition><option value="HOLD" ${disposition === "HOLD" ? "selected" : ""}>Tahan untuk keputusan</option><option value="RETURN_TO_SUPPLIER" ${disposition === "RETURN_TO_SUPPLIER" ? "selected" : ""}>Kembalikan ke supplier</option><option value="SCRAP" ${disposition === "SCRAP" ? "selected" : ""}>Scrap</option></select></label>
            <label><span>Referensi / Alasan</span><input class="form-control" data-iqc-disposition-reference value="${esc(row.dispositionReference || "")}" placeholder="Wajib untuk retur supplier"></label>
            <label class="iqc-reject-note"><span>Catatan Temuan</span><input class="form-control" data-iqc-notes value="${esc(row.notes || "")}" placeholder="Contoh: penyok, karat, ukuran tidak sesuai"></label>
          </div>
        </div>
      </article>`;
    }).join("");
    $("ops-detail-collections").innerHTML = `<section class="ops-detail-card iqc-workbench">
      <div class="iqc-workbench-head"><div><span class="iqc-step">LANGKAH 1</span><h2>Periksa dan Isi Hasil</h2><p>Jika barang baik, cukup klik <b>Terima Semua</b>. Isi Qty Reject hanya bila ada barang bermasalah.</p></div>${canComplete ? '<button class="btn btn-outline-success" type="button" data-iqc-accept-all>✓ Terima Semua Item</button>' : badge(record.decision || record.status)}</div>
      <div class="iqc-live-summary"><div><small>Total Datang</small><b data-iqc-total-received>${num(totalReceived)}</b></div><div class="is-good"><small>Accepted</small><b data-iqc-total-accepted>${num(totalAccepted)}</b></div><div class="is-reject"><small>Rejected</small><b data-iqc-total-rejected>${num(totalRejected)}</b></div><div><small>Baris Material</small><b>${num(rows.length, 0)}</b></div></div>
      <div class="iqc-column-guide"><span>No.</span><span>Material</span><span>Lot & Lokasi</span><span>Qty Datang</span><span>Hasil Inspeksi</span></div>
      <div class="iqc-input-list">${rowHtml || '<div class="iqc-empty">Tidak ada material yang perlu diperiksa.</div>'}</div>
      ${canComplete ? `<div class="iqc-submit-bar"><div><span class="iqc-step">LANGKAH 2</span><b>Pastikan total accepted + rejected sama dengan qty datang.</b></div><button class="btn btn-primary" type="button" data-workflow-action="complete-inspection">Simpan & Selesaikan IQC</button></div>` : ""}
    </section>`;
  }
  function updateIncomingInspectionSummary() {
    const rows = [...document.querySelectorAll("[data-iqc-detail]")];
    let receivedTotal = 0; let acceptedTotal = 0; let rejectedTotal = 0;
    rows.forEach((row) => {
      const received = number(row.dataset.iqcReceived);
      const rejectedInput = row.querySelector("[data-iqc-rejected]");
      const rejected = Math.min(Math.max(number(rejectedInput?.value), 0), received);
      const accepted = Math.max(received - rejected, 0);
      if (rejectedInput && number(rejectedInput.value) !== rejected) rejectedInput.value = rejected;
      const acceptedInput = row.querySelector("[data-iqc-accepted]");
      if (acceptedInput) acceptedInput.value = accepted;
      const rejectPanel = row.querySelector("[data-iqc-reject-panel]");
      rejectPanel?.classList.toggle("d-none", rejected <= 0);
      const state = row.querySelector("[data-iqc-row-state]");
      if (state) { state.textContent = rejected > 0 ? `${num(rejected)} reject` : "Semua diterima"; state.className = `iqc-row-state ${rejected > 0 ? "has-reject" : "is-accepted"}`; }
      receivedTotal += received; acceptedTotal += accepted; rejectedTotal += rejected;
    });
    const receivedNode = document.querySelector("[data-iqc-total-received]");
    const acceptedNode = document.querySelector("[data-iqc-total-accepted]");
    const rejectedNode = document.querySelector("[data-iqc-total-rejected]");
    if (receivedNode) receivedNode.textContent = num(receivedTotal);
    if (acceptedNode) acceptedNode.textContent = num(acceptedTotal);
    if (rejectedNode) rejectedNode.textContent = num(rejectedTotal);
  }
  const isPlannedOrderPage = () => config.module === "planning-ppic" && config.page.slug === "planned-orders";
  function renderPlannedOrderSheet(record) {
    const plannedQty = number(record.qty);
    const releasedQty = number(record.qtyReleased);
    const remainingQty = Math.max(plannedQty - releasedQty, 0);
    const uom = record.uomCode || "-";
    const supplier = record.supplierReadiness || {};
    const orderDate = new Date(record.orderDate);
    const requiredDate = new Date(record.requiredDate);
    const leadDays = !Number.isNaN(orderDate.getTime()) && !Number.isNaN(requiredDate.getTime())
      ? Math.max(Math.ceil((requiredDate - orderDate) / 86400000), 0)
      : null;
    const fieldRows = [
      ["Order", "Nomor Planned Order", linkedValue(record.orderNumber, "orderNumber", record), "Nomor unik hasil perhitungan MRP"],
      ["Order", "Jenis Order", esc(record.orderType || "-"), record.orderType === "Purchase" ? "Diteruskan ke proses Purchasing" : "Diteruskan ke proses produksi"],
      ["Order", "Status", badge(record.status), `Priority ${num(record.priority || 0, 0)}`],
      ["Item", "Part", linkedValue(record.partCode, "partCode", record), esc(record.part?.partName || record.partName || "-")],
      ["Item", "Part Number / Drawing", esc(record.part?.partNumber || record.partNumber || "-"), esc(record.part?.itemType || record.part?.rawType || "-")],
      ["Quantity", "Planned Qty", `<b class="po-sheet-number">${num(plannedQty)} ${esc(uom)}</b>`, "Kebutuhan yang dihitung MRP"],
      ["Quantity", "Released Qty", `<b class="po-sheet-number">${num(releasedQty)} ${esc(uom)}</b>`, "Qty yang sudah diteruskan"],
      ["Quantity", "Remaining Qty", `<b class="po-sheet-number ${remainingQty > 0 ? "is-open" : "is-complete"}">${num(remainingQty)} ${esc(uom)}</b>`, remainingQty > 0 ? "Masih menunggu tindak lanjut" : "Sudah seluruhnya direlease"],
      ["Schedule", "Order Date", esc(format(record.orderDate, "date")), "Tanggal order sebaiknya mulai diproses"],
      ["Schedule", "Required Date", esc(format(record.requiredDate, "date")), "Tanggal kebutuhan material / part"],
      ["Schedule", "Available Window", leadDays == null ? "-" : `<b>${num(leadDays, 0)} hari</b>`, "Selisih Order Date sampai Required Date"],
      ["Supplier", "Supplier Readiness", badge(supplier.ready ? "Ready" : "Pending"), esc(supplier.status || "PURCHASING")],
      ["Supplier", "Supplier", esc(supplier.supplierName || supplier.supplierCode || record.supplierCode || "Dipilih oleh Purchasing"), esc(supplier.message || "Supplier belum ditentukan")],
      ["Planning Trace", "MRP Run", linkedValue(record.runNumber, "runNumber", record), esc(record.mrpRun?.status || "-")],
      ["Planning Trace", "MPS", linkedValue(record.mrpRun?.mpsNumber, "mpsNumber", record.mrpRun || record), "Sumber jadwal produksi"],
      ["Planning Trace", "Production Plan", linkedValue(record.mrpRun?.planNumber, "planNumber", record.mrpRun || record), `Revision ${num(record.mrpRun?.planRevision || 0, 0)}`],
    ];
    const rows = fieldRows.map((row, index) => `<tr><td class="po-row-number">${index + 1}</td><td><span class="po-area ${esc(slug(row[0]))}">${esc(row[0])}</span></td><td>${esc(row[1])}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`).join("");
    const documentCard = $("ops-detail-fields").closest(".ops-detail-card");
    documentCard?.classList.add("planned-order-sheet-card");
    const heading = documentCard?.querySelector("header h2");
    if (heading) heading.textContent = "Planned Order Worksheet";
    $("ops-detail-fields").className = "planned-order-sheet";
    $("ops-detail-fields").innerHTML = `
      <div class="po-sheet-summary">
        <div><small>Item</small><b>${esc(record.partCode || "-")}</b><span>${esc(record.part?.partName || record.partName || "-")}</span></div>
        <div><small>Planned</small><b>${num(plannedQty)} ${esc(uom)}</b><span>Kebutuhan MRP</span></div>
        <div><small>Released</small><b>${num(releasedQty)} ${esc(uom)}</b><span>Sudah diproses</span></div>
        <div class="is-accent"><small>Remaining</small><b>${num(remainingQty)} ${esc(uom)}</b><span>Perlu ditindaklanjuti</span></div>
      </div>
      <div class="po-sheet-table-wrap"><table class="po-sheet-table"><thead><tr><th>No.</th><th>Area</th><th>Field</th><th>Nilai</th><th>Keterangan</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderPlannedOrderCollections(record) {
    const technicalRows = [
      ["Requirement Type", record.mrpRequirementType],
      ["Requirement Source", record.mrpRequirementSourceType],
      ["MRP Requirement Level", record.mrpRequirementLevelMBOM],
      ["MBOM Component Level", record.mbomLevelComponent],
      ["Reference Type", record.referenceType],
      ["Reference Number", record.referenceNumber],
      ["MRP Tree Path", record.mrpRequirementTreePath],
    ].filter(([, value]) => value != null && value !== "");
    const technicalTable = technicalRows.map(([name, value], index) => `<tr><td>${index + 1}</td><td>${esc(name)}</td><td>${esc(format(value, name))}</td></tr>`).join("");
    $("ops-detail-collections").innerHTML = [
      blockerCard(record),
      `<details class="ops-detail-card po-technical-card"><summary><div><h2>Technical Planning Trace</h2><p>Detail hirarki MRP untuk kebutuhan audit atau troubleshooting.</p></div><span>${num(technicalRows.length, 0)} field</span></summary><div class="po-sheet-table-wrap"><table class="po-sheet-table"><thead><tr><th>No.</th><th>Field Teknis</th><th>Nilai</th></tr></thead><tbody>${technicalTable || '<tr><td colspan="3">Tidak ada trace teknis.</td></tr>'}</tbody></table></div></details>`,
    ].join("");
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
  function suggestionStatusHint(status) {
    const hints = {
      "Not Confirmed": "Belum ada jawaban supplier. Simpan sebagai draft bila proses follow-up baru dimulai.",
      "Waiting Supplier Confirmation": "Supplier sudah dihubungi, tetapi qty atau tanggal delivery belum disepakati.",
      Available: "Barang tersedia. Pastikan qty dan tanggal delivery sudah sesuai kebutuhan produksi.",
      "Partially Available": "Supplier hanya memenuhi sebagian. Isi qty aktual dan gunakan split bila perlu.",
      "Not Available": "Barang tidak tersedia. Tambahkan remark agar risiko dan tindak lanjut dapat dilacak.",
      "Alternative Quantity Offered": "Supplier menawarkan qty berbeda. Periksa MOQ, excess, dan alokasi demand berikutnya.",
      "Alternative Delivery Date": "Supplier menawarkan tanggal lain. Pastikan tanggal baru tidak melewati kebutuhan material.",
      Confirmed: "Komitmen supplier lengkap dan item dapat disiapkan untuk Draft PR.",
    };
    return hints[status] || "Lengkapi hasil komunikasi dengan supplier.";
  }
  const isConfirmedSuggestionStatus = (status) => [
    "Available", "Partially Available", "Alternative Quantity Offered",
    "Alternative Delivery Date", "Confirmed",
  ].includes(status);
  const dateInputValue = (value) => value ? String(value).slice(0, 10) : "";
  // Purchasing milestones are calendar dates, never browser-local timestamps.
  const purchaseDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
  const optionalInputNumber = (input) => {
    const value = String(input?.value ?? "").trim();
    return value === "" ? null : number(value);
  };
  const supplierMasterSourceLabel = (source) => ({
    MATERIAL_PRICE_LIST: "Material Price List",
    PART_PRICE_LIST: "Part Price List",
    SUPPLIER_ITEM: "Supplier Item",
    SUPPLIER_MASTER: "Supplier Master",
    MBOM_DEFAULT: "default BOM",
    MBOM_ALTERNATIVE: "alternative BOM",
    MATERIAL_MASTER: "Material Master",
    PRICE_NOT_FOUND: "harga master belum tersedia",
    NOT_FOUND: "master belum tersedia",
  })[source] || source || "master belum tersedia";
  function setSupplierMasterCaption(container, selector, prefix, source, valueAvailable = true) {
    const caption = container.querySelector(selector);
    if (!caption) return;
    caption.textContent = valueAvailable
      ? `${prefix}: ${supplierMasterSourceLabel(source)}`
      : `${prefix}: belum ditemukan untuk supplier ini`;
    caption.classList.toggle("text-danger", !valueAvailable);
  }
  function applySupplierMasterValues(container, master, options = {}) {
    const split = container.matches("[data-supplier-split]");
    const prefix = split ? "split" : "confirm";
    const force = options.force !== false;
    const setValue = (selector, value, allowZero = true) => {
      const input = container.querySelector(selector);
      const available = value !== null && value !== undefined && (allowZero || number(value) > 0);
      if (input && available && (force || String(input.value || "").trim() === "" || Number(input.value) === 0)) input.value = value;
      if (input && !available && force && options.clearMissing) input.value = "";
      return available;
    };
    const moqAvailable = setValue(`[data-${prefix}-moq]`, master.moq);
    setValue(`[data-${prefix}-multiple]`, master.orderMultiple);
    const leadAvailable = setValue(`[data-${prefix}-lead]`, master.leadTimeDays);
    const priceAvailable = setValue(`[data-${prefix}-price]`, master.unitPrice);
    const currencyAvailable = setValue(`[data-${prefix}-currency]`, master.currencyCode);
    const formAvailable = setValue(`[data-${prefix}-form]`, master.purchasePackageUomCode);
    setValue(`[data-${prefix}-width]`, master.materialWidth);
    if (!split && master.orderMultiple != null) container.dataset.orderMultiple = master.orderMultiple;
    const formSelect = container.querySelector(`[data-${prefix}-form]`);
    if (formSelect) {
      const sheet = formSelect.value === "SHEET";
      const field = container.querySelector("[data-sheet-length-field]");
      field?.classList.toggle("d-none", !sheet);
      const lengthInput = field?.querySelector(`[data-${prefix}-length]`);
      if (lengthInput) lengthInput.required = sheet;
    }
    setSupplierMasterCaption(container, `[data-${prefix}-moq-source]`, "MOQ master", master.sources?.moq, moqAvailable);
    setSupplierMasterCaption(container, `[data-${prefix}-price-source]`, "Harga aktif", master.sources?.price, priceAvailable);
    setSupplierMasterCaption(container, `[data-${prefix}-lead-source]`, "Lead time", master.sources?.leadTime, leadAvailable);
    setSupplierMasterCaption(container, `[data-${prefix}-form-source]`, "Bentuk", master.sources?.form, formAvailable);
    const state = container.querySelector(`[data-${prefix}-master-state]`);
    if (state) {
      const lookupDate = master.lookupDate ? format(master.lookupDate, "date") : "hari ini";
      state.textContent = `Master ${master.supplierCode} diterapkan (${lookupDate}). Field tetap dapat diedit sesuai konfirmasi aktual.`;
      state.classList.remove("text-danger");
    }
    refreshMoqAllocationPlanner(container);
  }
  async function lookupSuggestionSupplierMaster(container, options = {}) {
    if (!container) return;
    const split = container.matches("[data-supplier-split]");
    const editor = container.closest("[data-suggestion-confirmation]") || container;
    const supplier = container.querySelector(split ? "[data-split-supplier]" : "[data-confirm-supplier]");
    const supplierCode = supplier?.value?.trim();
    if (!supplierCode || !editor.dataset.itemId) return;
    const prefix = split ? "split" : "confirm";
    const requestToken = `${supplierCode}:${Date.now()}:${Math.random()}`;
    container.dataset.supplierMasterRequest = requestToken;
    const state = container.querySelector(split ? "[data-split-master-state]" : "[data-confirm-master-state]");
    if (state) { state.textContent = `Mengambil MOQ, harga, dan lead time ${supplierCode}...`; state.classList.remove("text-danger"); }
    if (options.clearMissing !== false) {
      ["moq", "multiple", "lead", "price", "currency"].forEach((field) => {
        const input = container.querySelector(`[data-${prefix}-${field}]`);
        if (input) input.value = "";
      });
      setSupplierMasterCaption(container, `[data-${prefix}-price-source]`, "Harga aktif", null, false);
      setSupplierMasterCaption(container, `[data-${prefix}-moq-source]`, "MOQ master", null, false);
    }
    try {
      const query = new URLSearchParams({ supplierCode, asOf: (globalThis.erpBusinessNow?.() || new Date()).toISOString() });
      const master = await api(`/modules/api/purchasing-suggestions/${encodeURIComponent(config.recordKey)}/items/${encodeURIComponent(editor.dataset.itemId)}/supplier-master?${query}`);
      if (container.dataset.supplierMasterRequest !== requestToken || supplier?.value?.trim() !== supplierCode) return;
      applySupplierMasterValues(container, master, { force: options.force, clearMissing: options.clearMissing !== false });
    } catch (error) {
      if (container.dataset.supplierMasterRequest !== requestToken) return;
      if (state) { state.textContent = `Lookup master gagal: ${error.message}`; state.classList.add("text-danger"); }
      else showAlert(`Lookup master supplier gagal: ${error.message}`, "warning");
    }
  }
  function suggestionSplitRow(row, allocation = {}) {
    const form = allocation.purchasePackageUomCode || row.purchasePackageUomCode || row.bomDefaultPurchaseForm || row.masterMaterialForm || "";
    const primarySupplier = row.alternativeSupplierCode || row.suggestedSupplierCode || "";
    const splitMode = allocation.splitMode || (allocation.supplierCode && String(allocation.supplierCode).toUpperCase() === String(primarySupplier).toUpperCase() ? "delivery" : "supplier");
    const splitTitle = splitMode === "delivery" ? "Split Delivery" : "Supplier Tambahan";
    const splitHint = splitMode === "delivery" ? "Supplier sama, tanggal kedatangan berbeda" : "Alokasi qty ke supplier lain";
    return `<div class="ps-split-row" data-supplier-split data-split-mode="${esc(splitMode)}">
      <div class="ps-split-head"><div><span data-split-sequence>${esc(splitTitle)}</span><b>${esc(splitHint)}</b></div><button class="btn btn-sm btn-outline-danger" type="button" data-remove-supplier-split aria-label="Hapus ${esc(splitTitle)}">Hapus</button></div>
      <div class="ps-form-grid">
        <label>Supplier${supplierLookupSelect("data-split-supplier", allocation.supplierCode || "", "form-select form-select-sm")}<small data-split-master-state>${splitMode === "delivery" ? "Mengikuti supplier utama." : "Pilih supplier tambahan untuk lookup master."}</small></label>
        <label>Status<select class="form-select form-select-sm" data-split-status>${suggestionStatuses.map((value) => `<option ${value === allocation.confirmationStatus ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label>
        <label>Confirmed Qty<input class="form-control form-control-sm" data-split-qty type="number" min="0" step="0.001" value="${esc(allocation.confirmedQty ?? 0)}"></label>
        <label>Delivery Date<input class="form-control form-control-sm" data-split-date type="date" value="${esc(dateInputValue(allocation.deliveryDate))}"></label>
        <label>MOQ<input class="form-control form-control-sm" data-split-moq type="number" min="0" step="0.001" value="${esc(allocation.moq ?? "")}"><small data-split-moq-source>Otomatis dari master supplier.</small></label>
        <label>Order Multiple<input class="form-control form-control-sm" data-split-multiple type="number" min="0" step="0.001" value="${esc(allocation.orderMultiple ?? "")}"></label>
        <label>Lead Time (hari)<input class="form-control form-control-sm" data-split-lead type="number" min="0" value="${esc(allocation.leadTimeDays ?? "")}"><small data-split-lead-source>Otomatis dari master supplier.</small></label>
        <label>Harga<input class="form-control form-control-sm" data-split-price type="number" min="0" step="0.0001" value="${esc(allocation.unitPrice ?? "")}"><small data-split-price-source>Harga aktif pada tanggal konfirmasi.</small></label>
        <label>Currency<input class="form-control form-control-sm" data-split-currency value="${esc(allocation.currencyCode || row.currencyCode || "")}" placeholder="IDR"></label>
        ${row.materialCode ? `<label>Bentuk Tersedia<select class="form-select form-select-sm" data-split-form><option value="">Pilih</option><option value="SHEET" ${form === "SHEET" ? "selected" : ""}>SHEET</option><option value="COIL" ${form === "COIL" ? "selected" : ""}>COIL</option><option value="PCS" ${form === "PCS" ? "selected" : ""}>PCS</option></select><small data-split-form-source>Default dari BOM.</small></label>
        <label>Lebar Tersedia (mm)<input class="form-control form-control-sm" data-split-width type="number" min="0.001" step="0.001" value="${esc(allocation.materialWidth ?? row.confirmedMaterialWidth ?? row.bomDefaultMaterialWidth ?? row.masterMaterialWidth ?? "")}"></label>
        <label data-sheet-length-field class="${form === "SHEET" ? "" : "d-none"}">Panjang Sheet (mm)<input class="form-control form-control-sm" data-split-length type="number" min="0.001" step="0.001" value="${esc(allocation.materialLength ?? row.confirmedMaterialLength ?? "")}" ${form === "SHEET" ? "required" : ""}><small>Diisi manual sesuai ukuran sheet supplier.</small></label>` : ""}
        <label>Alternative Material<input class="form-control form-control-sm" data-split-material value="${esc(allocation.alternativeMaterialCode || "")}" placeholder="Jika diizinkan"></label>
        <label class="ps-span-2">Supplier Remark<input class="form-control form-control-sm" data-split-remark value="${esc(allocation.supplierRemark || "")}"></label>
      </div>
    </div>`;
  }

  function refreshSupplierAllocationSummary(source) {
    const editor = source?.closest?.("[data-suggestion-confirmation]") || source?.querySelector?.("[data-suggestion-confirmation]") || source;
    if (!editor?.matches?.("[data-suggestion-confirmation]")) return;
    const primaryStatus = editor.querySelector("[data-confirm-status]")?.value;
    const primarySupplier = editor.querySelector("[data-confirm-supplier]")?.value?.trim();
    const primaryQty = isConfirmedSuggestionStatus(primaryStatus)
      ? roundedPurchaseQty(editor.querySelector("[data-confirm-qty]")?.value, editor.querySelector("[data-confirm-moq]")?.value, editor.dataset.orderMultiple)
      : 0;
    const splitRows = [...editor.querySelectorAll("[data-supplier-split]")];
    const splitQty = splitRows.reduce((sum, split) => {
      if (!isConfirmedSuggestionStatus(split.querySelector("[data-split-status]")?.value) || !split.querySelector("[data-split-supplier]")?.value?.trim()) return sum;
      return sum + roundedPurchaseQty(split.querySelector("[data-split-qty]")?.value, split.querySelector("[data-split-moq]")?.value, split.querySelector("[data-split-multiple]")?.value);
    }, 0);
    const totalQty = primaryQty + splitQty;
    const targetQty = number(editor.dataset.recommendedQty);
    const variance = totalQty - targetQty;
    const totalElement = editor.querySelector("[data-allocation-total]");
    const primaryElement = editor.querySelector("[data-allocation-primary]");
    const splitElement = editor.querySelector("[data-allocation-split]");
    const stateElement = editor.querySelector("[data-allocation-state]");
    if (primaryElement) primaryElement.textContent = `${primarySupplier || "Belum dipilih"} · ${num(primaryQty)} ${editor.dataset.uom || ""}`;
    if (splitElement) splitElement.textContent = `${splitRows.length} baris · ${num(splitQty)} ${editor.dataset.uom || ""}`;
    if (totalElement) totalElement.textContent = `${num(totalQty)} ${editor.dataset.uom || ""}`;
    if (stateElement) {
      stateElement.classList.toggle("is-short", variance < -0.000001);
      stateElement.classList.toggle("is-excess", variance > 0.000001);
      stateElement.classList.toggle("is-balanced", Math.abs(variance) <= 0.000001);
      stateElement.innerHTML = variance < -0.000001
        ? `<b>Kurang ${num(Math.abs(variance))} ${esc(editor.dataset.uom || "")}</b><span>dari recommended ${num(targetQty)}</span>`
        : variance > 0.000001
          ? `<b>Lebih ${num(variance)} ${esc(editor.dataset.uom || "")}</b><span>MOQ / buffer di atas recommended</span>`
          : `<b>Allocation seimbang</b><span>sama dengan recommended ${num(targetQty)}</span>`;
    }
    splitRows.forEach((split, index) => {
      const sequence = split.querySelector("[data-split-sequence]");
      const mode = split.dataset.splitMode === "delivery" ? "Split Delivery" : "Supplier Tambahan";
      if (sequence) sequence.textContent = `${mode} ${index + 1}`;
    });
  }
  function suggestionMoqAllocationPlanner(row) {
    const candidates = Array.isArray(row.moqAllocationCandidates) ? row.moqAllocationCandidates : [];
    const search = row.moqAllocationSearch || {};
    const existingCoveredDemandQty = candidates.filter((candidate) => candidate.isExistingAllocation && !candidate.isCurrentDemand).reduce((sum, candidate) => sum + number(candidate.coveredDemandQty ?? Math.min(number(candidate.allocatedQty), number(candidate.availableQty))), 0);
    const directDemandQty = Math.max(number(row.netRequirement) - existingCoveredDemandQty, 0);
    let renderedCurrentDemandGroup = false;
    let renderedFutureDemandGroup = false;
    const candidateRows = candidates.length ? candidates.map((candidate) => {
      const isCurrentDemand = Boolean(candidate.isCurrentDemand);
      const isAllocated = isCurrentDemand || number(candidate.allocatedQty) > 0;
      const initialCoverageQty = isCurrentDemand
        ? number(candidate.currentDemandQty ?? candidate.availableQty)
        : isAllocated
        ? number(candidate.coveredDemandQty ?? Math.min(number(candidate.allocatedQty), number(candidate.availableQty)))
        : number(candidate.availableQty);
      const initialReserveQty = isCurrentDemand
        ? number(candidate.reservedAllocationQty)
        : isAllocated
        ? number(candidate.reservedAllocationQty ?? Math.max(number(candidate.allocatedQty) - initialCoverageQty, 0))
        : 0;
      let groupHeading = "";
      if (isCurrentDemand && !renderedCurrentDemandGroup) {
        renderedCurrentDemandGroup = true;
        groupHeading = `<div class="ps-moq-group-heading"><b>Kebutuhan pengiriman ini</b><span>Coverage sudah termasuk demand item ini; Custom Reserve dapat ditambah per part.</span></div>`;
      } else if (!isCurrentDemand && !renderedFutureDemandGroup) {
        renderedFutureDemandGroup = true;
        groupHeading = `<div class="ps-moq-group-heading is-future"><b>Kebutuhan pengiriman berikutnya</b><span>Tarik demand selanjutnya secara FIFO atau edit manual.</span></div>`;
      }
      return `${groupHeading}<div class="ps-moq-candidate ${isCurrentDemand ? "is-current-demand" : ""}" data-moq-candidate data-current-demand="${isCurrentDemand ? "true" : "false"}">
      <input class="form-check-input" type="checkbox" data-moq-candidate-check ${isAllocated ? "checked" : ""} ${isCurrentDemand ? "disabled" : ""}>
      <span><b>${esc(candidate.partCode || candidate.sourceNumber || "Kebutuhan berikutnya")} <i>${candidate.partNumber ? `Part No. ${esc(candidate.partNumber)}` : "Part No. belum tersedia"}</i></b><small>Delivery Request ${esc(candidate.deliveryTargetId || candidate.sourceNumber || "-")} · ${esc(candidate.customerCode || "Tanpa customer")} · ${esc(candidate.sourceType || "Demand")} ${esc(candidate.sourceNumber || "")}${candidate.sourceKind === "MRP_REQUIREMENT" ? " · lintas MRP aktif" : ""}</small><small>Target delivery ${esc(format(candidate.targetDeliveryDate, "date"))} · material diperlukan ${esc(format(candidate.materialRequiredDate || candidate.requiredDate, "date"))}</small></span>
      <div class="ps-moq-inputs">
        <label>Coverage Demand<input class="form-control form-control-sm" type="number" min="0" max="${esc(candidate.availableQty)}" step="0.001" value="${esc(initialCoverageQty)}" data-moq-coverage-qty data-demand-qty="${esc(candidate.availableQty)}" data-source-item-id="${esc(candidate.sourceItemId)}" data-source-requirement-id="${esc(candidate.sourceRequirementId)}" ${isCurrentDemand ? "readonly" : isAllocated ? "" : "disabled"}></label>
        <label>Custom Reserve<input class="form-control form-control-sm" type="number" min="0" step="0.001" value="${esc(initialReserveQty)}" data-moq-reserve-qty ${isAllocated ? "" : "disabled"}></label>
      </div>
      <em>Total ke part <b data-moq-row-total>${num(initialCoverageQty + initialReserveQty)} ${esc(candidate.uomCode || row.uomCode || "")}</b><small>${isCurrentDemand ? "Coverage terkunci" : `Demand maksimal ${num(candidate.availableQty)}`}</small></em>
    </div>`;
    }).join("") : `<div class="ps-moq-empty"><b>${search.reason === "NO_LATER_DELIVERY_REQUEST" ? "Item ini sudah berada pada Delivery Request terakhir." : "Belum ada kebutuhan berikutnya untuk material yang sama."}</b><span>Pencarian dimulai setelah ${esc(format(search.searchedAfterDate || row.customerDeliveryDate, "date"))}. Horizon Demand Planning terakhir ${esc(format(search.planningHorizonDate || row.customerDeliveryDate, "date"))}.</span><span>Confirmed Qty dan Confirmed MOQ tetap dapat diedit di atas. Opsi alokasi muncul setelah Delivery Request berikutnya direview dan masuk MPS/MRP.</span><a class="btn btn-sm btn-outline-primary" href="/modules/planning-ppic/demand-planning">Buka Demand Planning</a></div>`;
    return `<section class="ps-moq-planner ps-span-all" data-moq-allocation-planner data-base-demand="${esc(directDemandQty)}">
      <header><div><span>ALOKASI KELEBIHAN MOQ</span><b>Tarik kebutuhan periode berikutnya</b><small>Kelebihan qty dapat dialokasikan ke demand terdekat sebelum sisanya menjadi buffer stock.</small></div><button class="btn btn-sm btn-outline-primary" type="button" data-moq-auto-allocation ${candidates.length ? "" : "disabled"}>Pilih otomatis FIFO</button></header>
      <div class="ps-moq-summary"><div><small>Qty beli setelah MOQ</small><b data-moq-purchase-qty>0</b></div><div><small>Demand item ini</small><b>${num(directDemandQty)} ${esc(row.uomCode || "")}</b></div><div><small>Total alokasi tambahan</small><b data-moq-selected-qty>0</b></div><div><small>Coverage demand berikutnya</small><b data-moq-covered-qty>0</b></div><div><small>Custom reserve per part</small><b data-moq-reserve-qty>0</b></div><div><small>Buffer bebas</small><b data-moq-buffer-qty>0</b></div></div>
      <div class="ps-moq-candidates">${candidateRows}</div>
      <p data-moq-allocation-state>Masukkan Confirmed Qty / MOQ untuk melihat kapasitas alokasi.</p>
    </section>`;
  }
  function refreshMoqAllocationPlanner(container) {
    const editor = container?.matches?.("[data-suggestion-confirmation]") ? container : container?.closest?.("[data-suggestion-confirmation]");
    const planner = editor?.querySelector("[data-moq-allocation-planner]");
    if (!editor || !planner) return;
    const confirmedQty = roundedPurchaseQty(editor.querySelector("[data-confirm-qty]")?.value, editor.querySelector("[data-confirm-moq]")?.value, editor.dataset.orderMultiple);
    const baseDemand = number(planner.dataset.baseDemand);
    const allocationCapacity = Math.max(confirmedQty - baseDemand, 0);
    let selectedQty = 0;
    let coveredDemandQty = 0;
    let reservedAllocationQty = 0;
    let invalidCoverageQty = 0;
    planner.querySelectorAll("[data-moq-candidate]").forEach((candidate) => {
      const checkbox = candidate.querySelector("[data-moq-candidate-check]");
      const coverageInput = candidate.querySelector("[data-moq-coverage-qty]");
      const reserveInput = candidate.querySelector("[data-moq-reserve-qty]");
      const isCurrentDemand = candidate.dataset.currentDemand === "true";
      coverageInput.disabled = isCurrentDemand || !checkbox.checked;
      reserveInput.disabled = !checkbox.checked;
      candidate.classList.toggle("is-selected", checkbox.checked);
      candidate.querySelector("[data-moq-row-total]").textContent = `${num(checkbox.checked ? number(coverageInput.value) + number(reserveInput.value) : 0)} ${editor.dataset.uom || ""}`;
      if (checkbox.checked) {
        const coverageQty = Math.max(number(coverageInput.value), 0);
        const reserveQty = Math.max(number(reserveInput.value), 0);
        const demandQty = number(coverageInput.dataset.demandQty);
        selectedQty += isCurrentDemand ? reserveQty : coverageQty + reserveQty;
        coveredDemandQty += isCurrentDemand ? 0 : Math.min(coverageQty, demandQty);
        reservedAllocationQty += reserveQty;
        invalidCoverageQty += isCurrentDemand ? 0 : Math.max(coverageQty - demandQty, 0);
      }
    });
    const bufferQty = Math.max(allocationCapacity - selectedQty, 0);
    planner.querySelector("[data-moq-purchase-qty]").textContent = `${num(confirmedQty)} ${editor.dataset.uom || ""}`;
    planner.querySelector("[data-moq-selected-qty]").textContent = `${num(selectedQty)} ${editor.dataset.uom || ""}`;
    planner.querySelector("[data-moq-covered-qty]").textContent = `${num(coveredDemandQty)} ${editor.dataset.uom || ""}`;
    planner.querySelector("[data-moq-reserve-qty]").textContent = `${num(reservedAllocationQty)} ${editor.dataset.uom || ""}`;
    planner.querySelector("[data-moq-buffer-qty]").textContent = `${num(bufferQty)} ${editor.dataset.uom || ""}`;
    const state = planner.querySelector("[data-moq-allocation-state]");
    const over = selectedQty > allocationCapacity + 0.000001;
    state.classList.toggle("is-error", over || invalidCoverageQty > 0.000001);
    state.textContent = invalidCoverageQty > 0.000001
      ? `Coverage Demand melebihi kebutuhan asli sebesar ${num(invalidCoverageQty)} ${editor.dataset.uom || ""}. Tambahan qty harus dimasukkan ke Custom Reserve.`
      : over
      ? `Alokasi melebihi kelebihan MOQ sebesar ${num(selectedQty - allocationCapacity)} ${editor.dataset.uom || ""}.`
      : allocationCapacity > 0
        ? `${num(allocationCapacity)} ${editor.dataset.uom || ""} tersedia; coverage demand ${num(coveredDemandQty)}, custom reserve ${num(reservedAllocationQty)}, buffer bebas ${num(bufferQty)}.`
        : "Tidak ada kelebihan qty untuk dialokasikan setelah demand item ini.";
  }
  function suggestionEditor(row) {
    const form = row.purchasePackageUomCode || row.bomDefaultPurchaseForm || row.masterMaterialForm || "";
    const recommendedForms = (row.recommendedPurchaseForms || []).map((entry) => entry.formCode || entry.symbol).filter(Boolean).join(" / ");
    const confirmationComplete = ["Available", "Partially Available", "Alternative Quantity Offered", "Alternative Delivery Date", "Confirmed"].includes(row.confirmationStatus);
    return `<div class="ps-confirmation-panel" data-suggestion-editor>
      <div class="ps-panel-head"><div><b>Detail Hasil Konfirmasi</b><small>Ikuti urutan di bawah agar item siap dipilih saat membuat Draft PR.</small></div><span class="ps-live-indicator" data-confirm-live-state><i></i> Data aktual</span></div>
      <div class="ps-confirmation-progress" aria-label="Alur konfirmasi supplier">
        <div class="is-current"><i>1</i><span><b>Komitmen supplier</b><small>Status, supplier, dan delivery</small></span></div>
        <div class="${confirmationComplete ? "is-complete" : ""}"><i>2</i><span><b>Qty & spesifikasi</b><small>MOQ, bentuk, ukuran, harga</small></span></div>
        <div><i>3</i><span><b>Alokasi kelebihan</b><small>Demand berikutnya atau buffer</small></span></div>
        <div><i>4</i><span><b>Simpan & pilih PR</b><small>Tabel diperbarui otomatis</small></span></div>
      </div>
      <div class="ps-inline-save-state d-none" data-confirm-save-state role="status"><b>Konfirmasi tersimpan.</b><span>Data tabel dan kesiapan PR sudah diperbarui tanpa memuat ulang halaman.</span></div>
      <div class="ps-form-grid" data-suggestion-confirmation data-item-id="${esc(row.id || "")}" data-order-multiple="${esc(row.orderMultiple || 0)}" data-uom="${esc(row.uomCode || "")}" data-recommended-qty="${esc(row.recommendedPurchaseQty || 0)}">
        <div class="ps-form-step ps-span-all"><i>1</i><div><b>Komitmen supplier</b><small>Isi status, supplier, qty, dan delivery aktual.</small></div></div>
        <label>Status Konfirmasi<select class="form-select" data-confirm-status>${suggestionStatuses.map((value) => `<option ${value === row.confirmationStatus ? "selected" : ""}>${esc(value)}</option>`).join("")}</select><small data-confirm-status-hint>${esc(suggestionStatusHint(row.confirmationStatus))}</small></label>
        <label>Supplier${supplierLookupSelect("data-confirm-supplier", row.alternativeSupplierCode || row.suggestedSupplierCode || "")}<small data-confirm-master-state>MOQ dan harga akan dilookup dari master supplier.</small></label>
        <label>Confirmed Qty<input class="form-control" data-confirm-qty type="number" min="0" step="0.001" value="${esc(row.confirmedQty ?? row.recommendedPurchaseQty ?? 0)}"></label>
        ${row.materialCode ? `<label>Bentuk Material<select class="form-select" data-confirm-form><option value="">Pilih bentuk</option><option value="SHEET" ${form === "SHEET" ? "selected" : ""}>SHEET</option><option value="COIL" ${form === "COIL" ? "selected" : ""}>COIL</option><option value="PCS" ${form === "PCS" ? "selected" : ""}>PCS</option></select><small data-confirm-form-source>Default BOM: ${esc(row.bomDefaultPurchaseForm || recommendedForms || "-")}${row.bomMaterialScheme ? ` (${esc(row.bomMaterialScheme)})` : ""}</small></label>
        <label>Lebar Tersedia (mm)<input class="form-control" data-confirm-width type="number" min="0.001" step="0.001" value="${esc(row.confirmedMaterialWidth ?? row.bomDefaultMaterialWidth ?? row.masterMaterialWidth ?? "")}"><small>Lebar BOM/master: ${esc(row.bomDefaultMaterialWidth ?? row.masterMaterialWidth ?? "-")} mm; lebar berbeda diperbolehkan.</small></label>
        <label data-sheet-length-field class="${form === "SHEET" ? "" : "d-none"}">Panjang Sheet (mm)<input class="form-control" data-confirm-length type="number" min="0.001" step="0.001" value="${esc(row.confirmedMaterialLength ?? "")}" ${form === "SHEET" ? "required" : ""}><small>Wajib untuk SHEET; contoh ukuran PO: T × W × panjang.</small></label>` : ""}
        <label>Confirmed Delivery<input class="form-control" data-confirm-date type="date" value="${esc(dateInputValue(row.confirmedDeliveryDate || row.materialRequiredDate))}"></label>
        <label>Confirmed MOQ<input class="form-control" data-confirm-moq type="number" min="0" step="0.001" value="${esc(row.confirmedMoq ?? row.moq ?? 0)}"><small data-confirm-moq-source>Otomatis dari Material Price List / Supplier Item.</small></label>
        <div class="ps-form-step ps-span-all"><i>2</i><div><b>Alokasi kelebihan MOQ</b><small>Coverage demand berikutnya hanya diperlukan bila confirmed qty melebihi kebutuhan item ini.</small></div></div>
        ${suggestionMoqAllocationPlanner(row)}
        <div class="ps-form-step ps-span-all"><i>3</i><div><b>Komersial & catatan audit</b><small>Lengkapi harga, lead time aktual, serta alasan bila hasil berbeda dari rekomendasi.</small></div></div>
        <label>Lead Time Aktual<input class="form-control" data-confirm-lead type="number" min="0" value="${esc(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays ?? 0)}"><small data-confirm-lead-source>Otomatis dari Supplier Item / Supplier Master.</small></label>
        <label>Harga<input class="form-control" data-confirm-price type="number" min="0" step="0.0001" value="${esc(row.estimatedUnitPrice ?? "")}"><small data-confirm-price-source>Harga aktif pada tanggal konfirmasi.</small></label>
        <label>Currency<input class="form-control" data-confirm-currency value="${esc(row.currencyCode || "")}" placeholder="IDR"></label>
        <label>Alternative Material<input class="form-control" data-confirm-material value="${esc(row.alternativeMaterialCode || "")}" placeholder="Opsional, jika diizinkan"></label>
        <label class="ps-span-2">Supplier Remark<input class="form-control" data-confirm-remark value="${esc(row.supplierRemark || "")}" placeholder="Catatan ketersediaan, harga, atau jadwal"></label>
        <label class="ps-span-2">Alasan Tanpa Konfirmasi<input class="form-control" data-confirm-bypass value="${esc(row.bypassConfirmationReason || "")}" placeholder="Wajib jika PR tetap dibuat tanpa konfirmasi supplier"></label>
        <section class="ps-span-2 ps-allocation-section">
          <header class="ps-allocation-head"><div><span>ALLOCATION PLAN</span><b>Supplier & jadwal kedatangan</b><small>Pakai “Tambah Supplier” untuk vendor berbeda, atau “Split Delivery” untuk supplier yang sama dengan tanggal berbeda.</small></div><div class="ps-allocation-actions"><button class="btn btn-outline-primary" type="button" data-add-supplier-split>+ Tambah Supplier</button><button class="btn btn-outline-secondary" type="button" data-add-delivery-split>+ Split Delivery</button></div></header>
          <div class="ps-allocation-summary" aria-live="polite"><div><span>Supplier utama</span><b data-allocation-primary>-</b></div><div><span>Allocation tambahan</span><b data-allocation-split>-</b></div><div class="is-total"><span>Total confirmed</span><strong data-allocation-total>0 ${esc(row.uomCode || "")}</strong></div><div data-allocation-state><b>Belum seimbang</b><span>Periksa total allocation</span></div></div>
          <div class="ps-splits" data-supplier-splits>${(row.supplierAllocations || []).map((allocation) => suggestionSplitRow(row, allocation)).join("")}</div>
        </section>
        <div class="ps-span-2 ps-panel-actions"><div class="ps-action-help"><b>Simpan tanpa menutup dialog</b><small>Status baris dan kesiapan PR akan diperbarui langsung.</small></div><button class="btn btn-light" type="button" data-close-suggestion-editor>Selesai</button><button class="btn btn-primary" type="button" data-save-suggestion-confirmation>Simpan Konfirmasi</button></div>
      </div>
    </div>`;
  }
  async function openSuggestionConfirmationModal(row) {
    try {
      await loadSupplierLookup();
    } catch (error) {
      showAlert(`Lookup supplier gagal dimuat: ${error.message}`, "warning");
    }
    const identity = row.materialCode || row.partCode || "Material / Part";
    const customerCodes = Array.isArray(row.customerCodes) && row.customerCodes.length ? row.customerCodes.join(", ") : "Tanpa customer";
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop ps-confirmation-backdrop";
    overlay.innerHTML = `<section class="ops-modal ps-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="ps-confirmation-title">
      <header class="ps-confirmation-hero">
        <div><p class="ops-eyebrow">Supplier Confirmation</p><h2 id="ps-confirmation-title">${esc(identity)}</h2><p>${esc(row.materialDescription || row.partName || "Konfirmasi kesiapan pembelian")}</p></div>
        <button type="button" class="btn-close btn-close-white" data-close-suggestion-editor aria-label="Tutup"></button>
      </header>
      <div class="ps-modal-context">
        <div><small>Customer</small><b>${esc(customerCodes)}</b></div>
        <div><small>Customer Delivery</small><b>${esc(purchaseDate(row.customerDeliveryDate))}</b></div>
        <div><small>Material Required</small><b>${esc(purchaseDate(row.materialRequiredDate))}</b></div>
        <div><small>Order Paling Lambat</small><b>${esc(format(row.calculatedPurchaseDueDate || row.recommendedOrderDate, "date"))}</b></div>
        <div><small>Net Requirement</small><b>${num(row.netRequirement)} ${esc(row.uomCode || "")}</b></div>
        <div><small>Recommended Purchase</small><b>${num(row.recommendedPurchaseQty)} ${esc(row.uomCode || "")}</b></div>
      </div>
      <div class="ops-modal-body">${suggestionEditor(row)}</div>
    </section>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const editor = overlay.querySelector("[data-suggestion-confirmation]");
    editor.querySelectorAll('[data-supplier-split][data-split-mode="delivery"] [data-split-supplier]').forEach((select) => { select.disabled = true; });
    refreshMoqAllocationPlanner(editor);
    refreshSupplierAllocationSummary(editor);
    const close = () => {
      overlay.remove();
      if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open");
    };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    overlay.querySelector("select, input, button")?.focus();
    const draftConfirmation = ["Not Confirmed", "Waiting Supplier Confirmation"].includes(row.confirmationStatus);
    await lookupSuggestionSupplierMaster(editor, { force: draftConfirmation, clearMissing: draftConfirmation });
    await Promise.all([...editor.querySelectorAll("[data-supplier-split]")]
      .filter((split) => split.querySelector("[data-split-supplier]")?.value)
      .map((split) => lookupSuggestionSupplierMaster(split, { force: false, clearMissing: false })));
  }

  function openDueCalculationModal(row) {
    const identity = row.materialCode || row.partCode || "Material / Part";
    const needDate = row.calculatedProductionDueDate || row.materialRequiredDate;
    const purchaseMax = row.calculatedPurchaseDueDate || row.recommendedOrderDate;
    const leadDays = row.productionLeadTimeBreakdown?.procurementSchedule?.totalLeadTimeDays ?? Math.ceil(number(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays));
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop";
    overlay.innerHTML = `<section class="ops-modal ps-due-modal" role="dialog" aria-modal="true" aria-labelledby="ps-due-title">
      <header><div><p class="ops-eyebrow">MRP Delivery Need</p><h2 id="ps-due-title">Perhitungan Purchase Max</h2><p>${esc(identity)}</p></div><button type="button" class="btn-close" data-due-close aria-label="Tutup"></button></header>
      <div class="ops-modal-body">
        <div class="ps-due-source"><span>Sumber tanggal</span><b>Kebutuhan material / komponen dari hasil explode BOM di MRP</b><small>Jika satu item menggabungkan beberapa kebutuhan MRP, gunakan tanggal kebutuhan paling awal. Tambahan MOQ tidak mengubah tanggal kebutuhan asal.</small></div>
        <div class="ps-due-flow">
          <div><span>1</span><small>Delivery Need · MRP</small><b>${esc(purchaseDate(needDate))}</b></div><i>−</i>
          <div><span>2</span><small>Lead Time Supplier</small><b>${num(leadDays)} hari kalender</b><em>Lead time konfirmasi supplier, atau master jika belum dikonfirmasi</em></div><i>=</i>
          <div class="is-result"><span>3</span><small>Purchase Max · PO dikirim</small><b>${esc(purchaseDate(purchaseMax))}</b></div>
        </div>
        <div class="alert alert-info mb-0">Purchase Max = Delivery Need MRP − lead time supplier. Contoh: 20 September − 5 hari = 15 September.</div>
      </div><footer><button class="btn btn-primary" type="button" data-due-close>Mengerti</button></footer></section>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const close = () => { overlay.remove(); if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open"); };
    overlay.querySelectorAll("[data-due-close]").forEach(button => button.addEventListener("click", close));
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  }

  function purchaseSuggestionReferences(row, record = {}) {
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
    return references;
  }

  function purchaseSuggestionAllocationBreakdown(row) {
    const sources = Array.isArray(row.sourceRequirements) ? row.sourceRequirements : [];
    const allocation = row.productionLeadTimeBreakdown?.moqAllocation || {};
    const pulledQty = sources.filter((source) => source.allocationType === "MOQ_PULL_FORWARD").reduce((sum, source) => sum + number(source.qty), 0);
    const sourceRows = sources.length ? sources.map((source) => {
      const pulled = source.allocationType === "MOQ_PULL_FORWARD";
      const coveredQty = pulled ? number(source.demandCoveredQty ?? Math.min(number(source.qty), number(source.originalDemandQty || source.qty))) : number(source.qty);
      const reserveQty = pulled ? number(source.reservedAllocationQty ?? Math.max(number(source.qty) - coveredQty, 0)) : 0;
      return `<div class="ps-allocation-line ${pulled ? "is-pulled" : ""}"><span>${pulled ? "MOQ → kebutuhan berikutnya" : "Kebutuhan bucket ini"}</span><div><b>${esc(source.partCode || source.sourceNumber || "Demand")}</b><small>${esc(format(source.requiredDate, "date"))}${source.customerCode ? ` · ${esc(source.customerCode)}` : ""}${pulled ? ` · demand ${num(coveredQty)}${reserveQty > 0 ? ` + custom reserve ${num(reserveQty)}` : ""}` : ""}</small></div><strong>${num(source.qty)} ${esc(row.uomCode || "")}</strong></div>`;
    }).join("") : '<div class="ps-reference-empty">Allocation source belum tersedia.</div>';
    const residualBuffer = number(allocation.residualBufferQty ?? row.excessQty);
    return `<section class="ps-allocation-breakdown"><header><div><small>MOQ ALLOCATION</small><b>Pembagian rekomendasi ${num(row.recommendedPurchaseQty)} ${esc(row.uomCode || "")}</b></div><span>${pulledQty > 0 ? `${num(pulledQty)} ditarik dari kebutuhan berikutnya` : "Tanpa pull-forward"}</span></header><div>${sourceRows}${residualBuffer > 0 ? `<div class="ps-allocation-line is-buffer"><span>BUFFER MOQ</span><div><b>Sisa belum dialokasikan</b><small>Dapat menjadi stock coverage setelah receipt</small></div><strong>${num(residualBuffer)} ${esc(row.uomCode || "")}</strong></div>` : ""}</div></section>`;
  }

  function openReferenceModal(row, record = {}) {
    const identity = row.materialCode || row.partCode || "Material / Part";
    const references = purchaseSuggestionReferences(row, record);
    const referenceLinks = references.length
      ? references.map((reference) => `<a class="ps-reference-modal-link" href="${esc(reference.href)}"><span>${esc(reference.type)}</span><div><b>${esc(reference.value)}</b><small>Buka detail ${esc(reference.type)}</small></div><i aria-hidden="true">↗</i></a>`).join("")
      : '<div class="ps-reference-empty">Belum ada referensi yang terhubung.</div>';
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop";
    overlay.innerHTML = `<section class="ops-modal ps-reference-modal" role="dialog" aria-modal="true" aria-labelledby="ps-reference-title">
      <header><div><p class="ops-eyebrow">Linked Documents</p><h2 id="ps-reference-title">Full Reference</h2><p>${esc(identity)} · ${num(references.length, 0)} dokumen terhubung</p></div><button type="button" class="btn-close" data-reference-close aria-label="Tutup"></button></header>
      <div class="ops-modal-body">${purchaseSuggestionAllocationBreakdown(row)}<div class="ps-reference-modal-list">${referenceLinks}</div></div>
      <footer><button class="btn btn-primary" type="button" data-reference-close>Selesai</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const close = () => { overlay.remove(); if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open"); };
    overlay.querySelectorAll("[data-reference-close]").forEach((button) => button.addEventListener("click", close));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    overlay.querySelector("a, button")?.focus();
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
        <div class="ps-timeline"><div><small>Delivery Customer</small><b>${esc(purchaseDate(row.customerDeliveryDate))}</b></div><span>←</span><div><small>Delivery Need · MRP</small><b>${esc(purchaseDate(row.calculatedProductionDueDate || row.plannedProductionStart))}</b></div><span>←</span><div><small>Target Tiba</small><b>${esc(purchaseDate(row.supplierRequiredArrivalDate))}</b></div><span>←</span><div><small>Purchase Max</small><b>${esc(purchaseDate(row.calculatedPurchaseDueDate || row.recommendedOrderDate))}</b></div></div>
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
    const confirmationOptions = [...new Set(rows.map((row) => row.confirmationStatus).filter(Boolean))];
    const pendingConfirmationCount = rows.filter((row) => !/ready|converted|covered/i.test(row.status || "")).length;
    const convertedCount = rows.filter((row) => /converted/i.test(row.status || "")).length;
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
    const tableRows = [...rows].sort((left, right) => new Date(left.materialRequiredDate || 0) - new Date(right.materialRequiredDate || 0)).map((row) => {
      const identity = row.materialCode || row.partCode || "Tanpa kode";
      const description = row.materialDescription || row.partName || "Material / part pembelian";
      const category = row.materialCode ? "Material" : "Purchase Part";
      const prCategory = row.materialCode ? "PR-Raw_Material" : "PR-Purchase-Part";
      const sources = [...new Set([...(row.salesOrderNumbers || []), ...(row.forecastNumbers || []), ...(row.productionOrderNumbers || []), row.plannedOrderNumber].filter(Boolean))];
      const effectiveSupplierCode = row.effectiveSupplierCode || row.alternativeSupplierCode || row.suggestedSupplierCode || null;
      const effectiveSupplierName = row.effectiveSupplierName || (row.alternativeSupplierCode ? row.alternativeSupplierCode : row.suggestedSupplierName || row.suggestedSupplierCode);
      const search = [identity, description, row.partNumber, effectiveSupplierCode, effectiveSupplierName, row.status, ...sources].filter(Boolean).join(" ").toLowerCase();
      const productionDueDate = row.calculatedProductionDueDate || row.materialRequiredDate;
      const purchaseDueDate = row.calculatedPurchaseDueDate || row.recommendedOrderDate;
      const due = dueParts(purchaseDueDate);
      const targetArrivalDate = row.supplierRequiredArrivalDate || row.productionLeadTimeBreakdown?.procurementSchedule?.supplierRequiredArrivalDate;
      const confirmedAllocations = (row.supplierAllocations || []).filter((allocation) => allocation.status === "Confirmed");
      const confirmedMoq = number(row.confirmedMoq ?? row.moq);
      const orderMultiple = number(row.orderMultiple);
      const primarySupplierCode = effectiveSupplierCode;
      const primarySupplierConfirmed = ["Available", "Partially Available", "Alternative Quantity Offered", "Alternative Delivery Date", "Confirmed"].includes(row.confirmationStatus) || Boolean(row.bypassConfirmationReason);
      const primarySupplierAllocation = primarySupplierCode && primarySupplierConfirmed
        ? {
            supplierCode: primarySupplierCode,
            confirmedQty: roundedPurchaseQty(row.confirmedQty || row.recommendedPurchaseQty, confirmedMoq, orderMultiple),
            deliveryDate: dateInputValue(row.confirmedDeliveryDate || row.materialRequiredDate),
          }
        : null;
      const splitContainsPrimary = primarySupplierAllocation && confirmedAllocations.some((allocation) => (
        String(allocation.supplierCode || "").toUpperCase() === String(primarySupplierCode).toUpperCase()
        && Math.abs(roundedPurchaseQty(allocation.confirmedQty, allocation.moq, allocation.orderMultiple) - primarySupplierAllocation.confirmedQty) <= 0.000001
        && dateInputValue(allocation.deliveryDate) === primarySupplierAllocation.deliveryDate
      ));
      const allConfirmedSupplierAllocations = [
        ...(!primarySupplierAllocation || splitContainsPrimary ? [] : [primarySupplierAllocation]),
        ...confirmedAllocations,
      ];
      const prSupplierCodes = [...new Set(allConfirmedSupplierAllocations.map((allocation) => allocation.supplierCode).filter(Boolean))];
      const supplierAvailability = allConfirmedSupplierAllocations.reduce((sum, allocation) => sum + roundedPurchaseQty(allocation.confirmedQty, allocation.moq, allocation.orderMultiple), 0);
      const selectedQty = supplierAvailability;
      const eligible = /ready/i.test(row.status || "") && !/converted/i.test(row.status || "");
      const materialHref = row.materialCode ? `/master-data/materials/${encodeURIComponent(row.materialCode)}` : `/master-data/parts/${encodeURIComponent(row.partCode || identity)}`;
      const supplierCode = primarySupplierCode;
      const supplierHref = supplierCode ? `/master-data/suppliers/${encodeURIComponent(supplierCode)}` : "";
      const step = orderMultiple > 0 ? String(orderMultiple) : (isDiscreteUom(row.uomCode) ? "1" : "0.001");
      const minimumQty = Math.max(confirmedMoq, number(step));
      const pulledFutureQty = (row.sourceRequirements || []).filter((source) => source.allocationType === "MOQ_PULL_FORWARD").reduce((sum, source) => sum + number(source.qty), 0);
      const confirmationAction = /converted|covered/i.test(row.status || "") ? "Lihat Detail" : /ready/i.test(row.status || "") ? "Lihat / Ubah" : "Lengkapi Konfirmasi";
      const readinessHint = /converted/i.test(row.status || "")
        ? "Sudah dibuat menjadi PR"
        : /covered/i.test(row.status || "")
          ? "Kebutuhan sudah dicakup kelebihan MOQ item sebelumnya"
          : /ready/i.test(row.status || "")
            ? "Siap dipilih untuk PR"
            : "Supplier, qty, dan delivery belum lengkap";
      return `<tr class="ps-data-row" data-ps-row data-item-id="${esc(row.id || "")}" data-ps-status="${esc(row.status || "Draft")}" data-ps-confirmation="${esc(row.confirmationStatus || "Not Confirmed")}" data-ps-category="${esc(category)}" data-pr-category="${esc(prCategory)}" data-pr-suppliers="${esc(prSupplierCodes.join("|"))}" data-ps-search="${esc(search)}" data-due-day="${esc(due.day)}" data-due-week="${esc(due.week)}" data-due-month="${esc(due.month)}">
        <td class="ps-freeze-select"><input class="form-check-input" type="checkbox" data-ps-select ${eligible ? "" : "disabled"} aria-label="Pilih ${esc(identity)} untuk PR" title="${eligible ? "Pilih untuk satu Draft PR" : "Konfirmasi supplier lebih dahulu"}"></td>
        <td class="ps-freeze-item"><a class="ps-item-link" href="${esc(materialHref)}"><b>${esc(identity)}</b><span>${esc(description)}</span><small>${row.partNumber ? `PN ${esc(row.partNumber)} · ` : ""}${esc(row.uomCode || "-")}</small></a></td>
        <td><span class="ps-category ${slug(category)}">${esc(prCategory)}</span></td>
        <td class="ps-date-cell" title="Delivery customer ${esc(purchaseDate(row.customerDeliveryDate))}"><b>${esc(purchaseDate(targetArrivalDate))}</b><small>Kebutuhan hasil MRP</small></td>
        <td class="ps-date-cell"><div class="ps-due-primary"><b>${esc(purchaseDate(purchaseDueDate))}</b><button class="ps-due-help" type="button" data-due-calculation aria-label="Lihat perhitungan due date ${esc(identity)}" title="Lihat perhitungan maksimal due date">?</button></div><span>Produksi ${esc(purchaseDate(productionDueDate))}</span><small>${esc(row.procurementWindow || "UNCLASSIFIED")} · MRP − lead time supplier</small><small>Supplier LT ${num(row.productionLeadTimeBreakdown?.procurementSchedule?.totalLeadTimeDays ?? Math.ceil(number(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays)), 0)} hari kalender${number(row.atRiskSupplyQty) > 0 ? ` · At risk ${num(row.atRiskSupplyQty)}` : ""}</small></td>
        <td class="ps-reference-cell"><button class="ps-reference-trigger" type="button" data-reference-popup aria-label="Lihat full reference ${esc(identity)}" title="Lihat semua dokumen terhubung"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg><span>${num(purchaseSuggestionReferences(row, record).length, 0)}</span></button></td>
        <td class="ps-qty-cell" title="Net / Gross / Rekomendasi"><b>${num(row.netRequirement)} ${esc(row.uomCode || "")}</b><span>G ${num(row.grossRequirement)}</span><small>R ${num(row.recommendedPurchaseQty)}</small>${pulledFutureQty > 0 ? `<small class="ps-moq-pull">MOQ allocation ${num(pulledFutureQty)} ke kebutuhan berikutnya</small>` : ""}</td>
        <td class="ps-qty-cell" title="Total supply / Available / Open PO"><b>${num(number(row.availableStock) + number(row.openPoQty))}</b><span>A ${num(row.availableStock)}</span><small>PO ${num(row.openPoQty)}</small></td>
        <td class="ps-supplier-cell">${supplierHref ? `<a href="${esc(supplierHref)}"><b>${esc(supplierCode)}</b><span>${esc(effectiveSupplierName || supplierCode)}</span></a>` : '<b class="text-danger">Belum ditentukan</b>'}<small>Tersedia ${num(supplierAvailability)} · LT ${num(row.confirmedLeadTimeDays ?? row.purchasingLeadTimeDays, 0)} hari</small></td>
        <td class="ps-custom-qty"><input class="form-control form-control-sm" data-ps-custom-qty type="number" min="${esc(minimumQty)}" max="${esc(supplierAvailability)}" step="${esc(step)}" value="${esc(selectedQty)}" disabled><small>Maks. supplier: ${num(supplierAvailability)} ${esc(row.uomCode || "")}</small></td>
        <td class="ps-status-cell">${badge(row.status)}<span>${badge(row.confirmationStatus)}</span><small class="ps-readiness-hint">${esc(readinessHint)}</small><button class="btn btn-sm btn-outline-primary" type="button" data-open-suggestion-editor>${esc(confirmationAction)}</button></td>
      </tr>`;
    }).join("");
    const replanBanner = record.status === "Replan Required" ? `<div class="alert alert-warning mb-0"><b>Demand berubah.</b> Purchase Suggestion ini tidak dapat dibuat menjadi PR. Hitung ulang MPS lalu jalankan MRP kembali untuk memperoleh rekomendasi terbaru.</div>` : "";
    return `<section class="ps-workspace">${replanBanner}<div class="ps-review-flow"><header><div><span>ALUR KERJA PURCHASING</span><b>Dari suggestion sampai Draft PR</b></div><small>Mulai dari item yang perlu konfirmasi. Item baru dapat dipilih setelah komitmen supplier lengkap.</small></header><ol><li class="is-current"><i>1</i><div><b>Review kebutuhan</b><small>${num(pendingConfirmationCount, 0)} item perlu tindakan</small></div></li><li><i>2</i><div><b>Konfirmasi supplier</b><small>Qty, delivery, MOQ, harga</small></div></li><li class="${totals.ready ? "is-ready" : ""}"><i>3</i><div><b>Pilih item siap</b><small>${num(totals.ready, 0)} item siap PR</small></div></li><li class="${convertedCount ? "is-ready" : ""}"><i>4</i><div><b>Buat Draft PR</b><small>${num(convertedCount, 0)} item sudah diproses</small></div></li></ol></div><div class="ps-summary-grid"><div><small>Total Item</small><b>${num(rows.length, 0)}</b></div><div><small>Net Requirement</small><b>${num(totals.net)}</b></div><div><small>Recommended Qty</small><b>${num(totals.recommended)}</b></div><div><small>Excess Qty</small><b>${num(totals.excess)}</b></div><div><small>Siap PR</small><b>${num(totals.ready, 0)} / ${num(rows.length, 0)}</b></div></div>
      <div class="ps-toolbar"><label class="ps-search-field"><span>Cari item</span><input class="form-control" data-ps-search-input placeholder="Material, part, supplier, SO, forecast..."></label><label><span>Jenis item</span><select class="form-select" data-ps-category-filter><option value="">Semua jenis</option>${categories.map((category) => `<option>${esc(category)}</option>`).join("")}</select></label><label><span>Kesiapan PR</span><select class="form-select" data-ps-status-filter><option value="">Semua kesiapan</option>${statusOptions.map((status) => `<option>${esc(status)}</option>`).join("")}</select></label><label><span>Konfirmasi supplier</span><select class="form-select" data-ps-confirmation-filter><option value="">Semua konfirmasi</option>${confirmationOptions.map((status) => `<option>${esc(status)}</option>`).join("")}</select></label><label><span>Kelompok due date</span><select class="form-select" data-ps-due-group><option value="day">Per tanggal</option><option value="week">Per minggu</option><option value="month">Per bulan</option><option value="">Tanpa grouping</option></select></label><b data-ps-result>${num(rows.length, 0)} item</b><button class="btn btn-primary btn-sm ps-auto-confirm-button" type="button" data-auto-confirm-suppliers title="Cari supplier terkait yang mempunyai harga aktif, gunakan qty suggestion, dan isi lead time aktual 2 hari" ${record.status === "Replan Required" || pendingConfirmationCount === 0 ? "disabled" : ""}>Auto Konfirmasi Supplier</button></div>
      <div class="ps-table-shell"><table class="table ps-suggestion-table" data-enterprise-table="off"><thead><tr><th class="ps-freeze-select"><label title="Pilih semua item siap PR yang terlihat"><input class="form-check-input" type="checkbox" data-ps-select-all aria-label="Pilih semua item yang siap"><span>Select All</span></label></th><th class="ps-freeze-item">Material / Part</th><th>PR Category</th><th>Delivery Need · MRP</th><th>Purchase Max <span class="ps-head-help" title="Klik ikon ? pada setiap baris untuk melihat perhitungannya">?</span></th><th>Full Reference</th><th>Demand</th><th>Stock Supply</th><th>Supplier & Availability</th><th>Qty untuk PR</th><th>Status / Action</th></tr></thead><tbody>${tableRows || '<tr><td colspan="11" class="text-center text-muted p-4">Tidak ada item suggestion.</td></tr>'}</tbody></table></div>
      <div class="ps-selection-bar"><div><b data-ps-selected-count>0 item dipilih</b><span data-ps-selected-qty>Total qty 0</span></div><small>Draft PR otomatis dipisah berdasarkan <b>PR Category × Supplier</b>. Qty tetap dapat disesuaikan sampai batas supplier.</small><button class="btn btn-primary" type="button" data-workflow-action="convert-suggestion-to-pr" disabled data-ps-create-pr>Buat Draft PR</button></div></section>`;
  }

  function renderArray(key, rows, record = {}) {
    const isGoodsReceiptRows = isGoodsReceiptPage();
    const isPrDetails = config.module === "purchasing" && config.page.slug === "purchase-requisitions" && key === "details";
    const isPurchaseSuggestionItems = config.module === "purchasing" && config.page.slug === "purchase-suggestions" && key === "items";
    const isStoDetails = config.module === "inventory" && config.page.slug === "stock-opname" && key === "details";
    const isIqcDetails = ["incoming", "purchasing"].includes(config.module) && config.page.slug === "incoming-inspections" && key === "details";
    const isStockMovementHistory = config.module === "inventory" && config.page.slug === "stock-balances" && key === "stockMovements";
    const isStockReservationHistory = config.module === "inventory" && config.page.slug === "stock-balances" && key === "stockReservations";
    const canCountSto = isStoDetails && String(record.status || "").toUpperCase() === "COUNTING";
    const canCompleteIqc = isIqcDetails && String(record.status || "").toUpperCase() === "OPEN";
    if (isPurchaseSuggestionItems) return renderPurchaseSuggestionItems(rows, record);
    if (isPrDetails) return renderPurchaseRequisitionDetails(rows, record);
    if (isGoodsReceiptRows && key === "details") {
      goodsReceiptTableRows = rows;
      return `<section class="ops-detail-card gr-detail-receipt-card" data-gr-tab-title="Receipt Items"><div class="ops-collection-head"><div><p>RECEIPT ITEMS</p><h2>Item yang Diterima</h2></div><span>${num(rows.length, 0)} baris</span></div><div id="gr-detail-receipt-table" class="gr-detail-tabulator" aria-label="Receipt Items Goods Receipt"></div></section>`;
    }
    const preferredKeys = ["lineNumber", "procurementCategory", "materialCode", "materialType", "materialName", "partCode", "partNumber", "partName", "description", "qty", "orderedQty", "uomCode", "sourceCount", "sourceMrpNumbers", "sourceMpsNumbers", "sourceForecastNumbers", "sourceSONumbers", "sourceDemandMonths", "sourcingAllocationCount", "sourcingSuppliers", "sourcingForms", "sourcingWidths", "sourcingLengths", "allocatedDemandQty", "supplierAllocationVariance", "supplierAllocationStatus", "orderVariance", "orderControlStatus", "sourcingDeliveryDates", "proposedSupplierCode", "confirmedSupplierCode", "notes"];
    const discoveredKeys = [...new Set(rows.slice(0, 8).flatMap((row) => row && typeof row === "object" ? Object.keys(row).filter((name) => {
      const value = row[name]; return !isInternalKey(name) && (value == null || ["string", "number", "boolean"].includes(typeof value) || (typeof value === "object" && !Array.isArray(value)) || (isPurchaseSuggestionItems && Array.isArray(value)));
    }) : []))];
    const stoPreferredKeys = [
      "partCode", "partNumber", "partName", "description", "spec", "stockType",
      "warehouseCode", "rackCode", "lotNumber", "uomCode",
      ...(canCountSto ? [] : ["systemQty"]),
      "actualQty", ...(canCountSto ? [] : ["varianceQty", "varianceStatus"]), "countedBy", "countedAt", "adjustmentNumber",
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
    if (!rows.length) return "";
    if (!columnKeys.length) return "";
    const selectionHead = isPrDetails ? '<th class="text-center">Pilih PO</th>' : "";
    const countHead = isStoDetails ? `<th>${canCountSto ? "Status Hitung" : "Physical Count"}</th>` : "";
    const inspectionHead = isIqcDetails ? '<th>Keputusan IQC</th>' : "";
    const suggestionConfirmationHead = isPurchaseSuggestionItems ? '<th>Konfirmasi Supplier</th>' : "";
    const selectionCell = (row) => {
      if (!isPrDetails) return "";
      const outstanding = Math.max(number(row?.qty) - number(row?.orderedQty), 0);
      const proposed = row?.confirmedSupplierCode || row?.proposedSupplierCode || row?.preferredSupplier || "";
      return `<td class="text-center"><input type="checkbox" class="form-check-input pr-po-line" data-pr-detail-id="${esc(row?.id || "")}" data-line-number="${esc(row?.lineNumber || "")}" data-supplier-code="${esc(proposed)}" data-outstanding="${esc(outstanding)}" data-required-date="${esc(String(record.requiredDate || "").slice(0, 10))}" data-request-uom="${esc(String(row?.uomCode || "KG").toUpperCase())}" data-raw-material="${row?.materialCode ? "true" : "false"}" data-package-uom="${esc(row?.purchasePackageUomCode || "")}" ${outstanding > 0 ? "checked" : "disabled"}></td>`;
    };
    const countCell = (row) => {
      if (!isStoDetails) return "";
      if (!canCountSto) return `<td>${row?.actualQty == null ? '<span class="ops-muted">Belum dihitung</span>' : `<b>${esc(format(row.actualQty))}</b>`}${row?.reason ? `<small class="d-block">${esc(row.reason)}</small>` : ""}</td>`;
      return `<td>${row?.actualQty == null ? '<span class="badge text-bg-secondary">Belum dihitung</span>' : `<span class="badge text-bg-success">Sudah dihitung</span><small class="d-block mt-1">${esc(format(row.actualQty))} ${esc(row.uomCode || "")}</small>`}</td>`;
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
    const collectionAction = `<span>${num(rows.length, 0)} baris</span>`;
    const collectionTitle = isGoodsReceiptRows && key === "details" ? "Receipt Items" : label(key);
    const gripHead = isGoodsReceiptRows ? '<th class="gr-detail-grip-column" scope="col">#</th>' : "";
    const gripCell = isGoodsReceiptRows ? '<td class="gr-detail-grip-column"><span class="gr-detail-row-grip" aria-label="Pegangan baris"><i></i><i></i><i></i><i></i><i></i><i></i></span></td>' : "";
    const enterpriseOptOut = isGoodsReceiptRows || isStockBalancePage() ? ' data-enterprise-table="off"' : "";
    const isStockBalanceHistory = isStockMovementHistory || isStockReservationHistory;
    const collectionHead = isStockBalanceHistory
      ? `<div class="ops-collection-head"><div><p>${isStockMovementHistory ? "STOCK MOVEMENTS" : "STOCK RESERVATIONS"}</p><h2>${esc(collectionTitle)}</h2></div>${collectionAction}</div>`
      : `<div class="ops-collection-head"><h2>${esc(collectionTitle)}</h2>${collectionAction}</div>`;
    const tabTitleAttr = isStockBalanceHistory ? ` data-gr-tab-title="${esc(collectionTitle)}"` : "";
    return `<section class="ops-detail-card"${tabTitleAttr}>${collectionHead}${canCountSto ? '<p class="ops-help px-3">Daftar ini hanya menunjukkan identitas dan progres hitung. Saldo sistem serta selisih tetap disembunyikan sampai counting disubmit.</p>' : ""}<div class="table-responsive ${isProductionDetail() ? "production-excel-wrap" : ""}"><table class="table ops-collection-table ${isProductionDetail() ? "production-excel-table" : ""}"${enterpriseOptOut}><thead><tr>${gripHead}${selectionHead}${columnKeys.map((name) => `<th>${esc(label(name))}</th>`).join("")}${countHead}${inspectionHead}${suggestionConfirmationHead}</tr></thead><tbody>${rows.map((row) => `<tr>${gripCell}${selectionCell(row)}${columnKeys.map((name) => `<td>${cell(row?.[name], name, row)}</td>`).join("")}${countCell(row)}${inspectionCell(row)}${suggestionConfirmationCell(row)}</tr>`).join("")}</tbody></table></div></section>`;
  }
  function renderObject(key, object) {
    const entries = meaningfulScalarEntries(object);
    if (!entries.length) return "";
    if (isProductionDetail()) return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>Referensi</span></div><div class="production-excel-wrap"><table class="table ops-collection-table production-excel-table"><thead><tr>${entries.slice(0, 24).map(([name]) => `<th>${esc(label(name))}</th>`).join("")}</tr></thead><tbody><tr>${entries.slice(0, 24).map(([name, value]) => `<td>${linkedValue(value, name, object)}</td>`).join("")}</tr></tbody></table></div></section>`;
    return `<section class="ops-detail-card ops-secondary-card"><details class="ops-object-disclosure"><summary class="ops-collection-head"><div><h2>${esc(label(key))}</h2><p>${num(entries.length, 0)} informasi relasi</p></div><span>Buka detail</span></summary><div class="ops-detail-fields ops-object-fields">${entries.slice(0, 12).map(([name, value]) => `<div><small>${esc(label(name))}</small><strong>${linkedValue(value, name, object)}</strong></div>`).join("")}</div></details></section>`;
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
    const identity = record.planningIdentity || {};
    const horizonStart = identity.horizonStart || record.periodStart;
    const horizonEnd = identity.horizonEnd || record.schedulingHorizonEnd || record.periodEnd;
    const phases = record.deliveryPhaseTimeline?.phases || [];
    const starts = phases.map((phase) => phase.firstProcessDate || phase.recommendedStartDate).filter(Boolean).sort();
    const allocationStarts = phases.flatMap((phase) => (phase.events || []).flatMap((event) =>
      (event.allocations || []).map((allocation) => allocation.vendorSendDate || allocation.scheduleDate).filter(Boolean),
    )).sort();
    const mrpReleaseStart = starts[0] || horizonStart;
    const allocationStart = allocationStarts[0] || null;
    const blocking = number(record.planReadiness?.summary?.blocking);
    const readiness = record.sourceReconciliation?.current === false ? "Replan required" : blocking ? `${num(blocking, 0)} blocker` : record.planReadiness?.releaseReady ? "Siap release" : "Perlu capacity check";
    $("ops-detail-fields").innerHTML = [
      ["Plan Qty", `${esc(num(planned))} <small class="mpp-uom">pcs</small><small class="mpp-field-sub">Outstanding ${esc(num(outstanding))} · released ${esc(num(released))}</small>`],
      ["Delivery Phase", `${esc(num(phases.length, 0))}<small class="mpp-field-sub">${esc(format(identity.deliveryCoverageStart, "date"))} – ${esc(format(identity.deliveryCoverageEnd, "date"))}</small>`],
      ["Allocation Start", `${allocationStart ? esc(format(allocationStart, "date")) : "Belum dialokasikan"}<small class="mpp-field-sub">MRP earliest release ${esc(format(mrpReleaseStart, "date"))}${identity.crossMonth ? " · M-1 lookback" : ""}</small>`],
      ["Readiness", `<span class="mpp-summary-readiness ${blocking || record.sourceReconciliation?.current === false ? "blocked" : "ready"}">${esc(readiness)}</span><small class="mpp-field-sub">${esc(record.sourceMpsNumber || identity.sourceMpsNumber || "Manual")} · ${esc((record.sourceMrpRunNumbers || [])[0] || record.sourceReconciliation?.currentMrpRunNumber || "MRP belum terhubung")}</small>`],
    ].map(([name, value]) => `<div><small>${esc(name)}</small><strong>${value}</strong></div>`).join("");
  }

  function dailyScheduleReference(type, value, href) {
    return value ? `<a class="dps-trace-link" href="${esc(href)}"><span>${esc(type)}</span><b>${esc(value)}</b><i aria-hidden="true">→</i></a>` : "";
  }

  function dailyScheduleDate(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
  }

  function dailyScheduleGate(labelText, value) {
    const normalized = String(value || "NOT CHECKED").toUpperCase();
    const tone = /READY|ON_TIME|COMPLETED|NOT_REQUIRED/.test(normalized) ? "ready" : /LATE|BLOCK|SHORT|HOLD/.test(normalized) ? "risk" : "neutral";
    return `<div class="dps-gate ${tone}"><span>${esc(labelText)}</span><b>${esc(normalized.replaceAll("_", " "))}</b></div>`;
  }

  function renderDailyScheduleFields(record) {
    const planned = number(record.plannedQty);
    const actual = number(record.actualQty);
    const shortage = planned > 0 ? Math.max(planned - actual, 0) : 0;
    const achievement = planned > 0 ? Math.min(actual / planned * 100, 100) : 0;
    const card = $("ops-detail-fields")?.closest(".ops-detail-card");
    const heading = card?.querySelector("header h2");
    if (heading) heading.textContent = "Ringkasan Daily Production Schedule";
    $("ops-detail-subtitle").textContent = `${record.partNumber || record.partCode || "Part"} · ${record.processName || record.processCode || "Process"} · ${record.machineCode || "Mesin belum dipilih"}`;
    $("ops-detail-fields").className = "dps-overview";
    $("ops-detail-fields").innerHTML = `<section class="dps-dispatch-strip">
      <div><span>TANGGAL</span><strong>${esc(dailyScheduleDate(record.scheduleDate))}</strong></div>
      <div><span>SHIFT</span><strong>${esc(record.shift || "-")}</strong></div>
      <div><span>JAM</span><strong>${esc(record.plannedStartTime || "-")}–${esc(record.plannedEndTime || "-")}</strong></div>
      <div><span>MESIN</span><strong>${esc(record.machineCode || "UNASSIGNED")}</strong><small>${esc(record.machineName || "")}</small></div>
      <div><span>STATUS</span><strong>${badge(record.status || "Draft")}</strong></div>
    </section>
    <section class="dps-output-grid">
      <article class="plan"><span>PLAN</span><strong>${esc(qty(planned, record.uomCode))}</strong><small>${esc(record.uomCode || "")}</small></article>
      <article class="actual"><span>ACTUAL</span><strong>${esc(qty(actual, record.uomCode))}</strong><small>${esc(record.uomCode || "")}</small></article>
      <article class="shortage"><span>SHORTAGE</span><strong>${esc(qty(shortage, record.uomCode))}</strong><small>Plan − actual</small></article>
      <article class="achievement"><span>ACHIEVEMENT</span><strong>${esc(num(achievement, 1))}%</strong><div><i style="width:${achievement}%"></i></div></article>
    </section>
    <section class="dps-part-process">
      <div class="dps-identity"><small>PART YANG DIPRODUKSI</small><a href="/master-data/parts/${encodeURIComponent(record.partCode || "")}"><strong>${esc(record.partNumber || record.partCode || "-")}</strong><span>${esc(record.partName || "-")}</span><b>${esc(record.partCode || "-")}</b></a></div>
      <div class="dps-route"><small>OPERASI</small><strong>Seq ${esc(record.sequence ?? "-")} · ${esc(record.processName || record.processCode || "-")}</strong><span>${esc(record.processCode || "-")} · ${esc(record.baseProcessCode || "-")} · Prioritas ${esc(record.schedulePriority ?? "-")}</span></div>
    </section>`;
  }

  function renderDailyScheduleCollections(record) {
    const demandHref = String(record.demandSourceType || "").toUpperCase() === "SALES_ORDER"
      ? `/modules/sales/sales-orders/${encodeURIComponent(record.demandSourceNumber || "")}`
      : `/modules/sales/forecasts/${encodeURIComponent(record.demandSourceNumber || "")}`;
    const trace = [
      dailyScheduleReference(record.demandSourceType === "SALES_ORDER" ? "SO" : "FORECAST", record.demandSourceNumber, demandHref),
      dailyScheduleReference("MPS", record.mpsNumber, `/modules/planning-ppic/mps/${encodeURIComponent(record.mpsNumber || "")}`),
      dailyScheduleReference("MRP", record.mrpRunNumber, `/modules/planning-ppic/mrp/${encodeURIComponent(record.mrpRunNumber || "")}`),
      dailyScheduleReference("MPP", record.mppNumber || record.monthlyProductionPlanNumber, `/modules/planning-ppic/monthly-production-plans?month=${encodeURIComponent(String(record.scheduleDate || "").slice(0, 7))}&planNumber=${encodeURIComponent(record.mppNumber || record.monthlyProductionPlanNumber || "")}`),
      dailyScheduleReference("MO", record.moNumber, `/modules/production/manufacturing-orders/${encodeURIComponent(record.moNumber || "")}`),
      dailyScheduleReference("WO", record.woNumber, `/modules/production/work-orders/${encodeURIComponent(record.woNumber || "")}`),
    ].filter(Boolean).join('<i class="dps-trace-arrow" aria-hidden="true">›</i>');
    $("ops-detail-collections").innerHTML = `<section class="ops-detail-card dps-trace-card">
      <div class="ops-collection-head"><div><h2>Planning Trace</h2><p>Runtutan demand sampai order eksekusi.</p></div><span>Phase ${esc(record.deliveryPhaseNumber ?? "-")} · Batch ${esc(record.transferBatchNumber ?? "-")}</span></div>
      <div class="dps-trace-flow">${trace || '<span class="ops-muted">Referensi planning belum lengkap.</span>'}</div>
    </section>
    <section class="ops-detail-card dps-readiness-card">
      <div class="ops-collection-head"><div><h2>Execution Readiness</h2><p>Gate operasional sebelum produksi dimulai.</p></div><span>${esc(record.customerCode || "Customer -")}</span></div>
      <div class="dps-gate-grid">${dailyScheduleGate("Material", record.materialReadinessStatus)}${dailyScheduleGate("Predecessor", record.predecessorStatus)}${dailyScheduleGate("Vendor", record.vendorStatus)}${dailyScheduleGate("Delivery Risk", record.lateRisk)}</div>
      <div class="dps-date-commit"><div><span>Customer Target</span><strong>${esc(dailyScheduleDate(record.customerTargetDate))}</strong></div><div><span>FG Required</span><strong>${esc(dailyScheduleDate(record.fgRequiredDate))}</strong></div><div><span>Priority</span><strong>${esc(record.priorityClass || "-")} · ${esc(num(record.priorityScore, 0))}</strong></div></div>
    </section>
    ${record.notes ? `<section class="ops-detail-card dps-notes-card"><details><summary>Catatan teknis & lineage <span>Buka rincian</span></summary><p>${esc(record.notes)}</p></details></section>` : ""}`;
  }
  function monthlyPlanSourceIntegrityCard(record) {
    const reconciliation = record.sourceReconciliation;
    if (!reconciliation) return "";
    const current = reconciliation.current === true;
    const snapshotLabel = (reconciliation.storedMrpRunNumbers || []).join(", ") || "Tidak diketahui";
    const currentLabel = reconciliation.currentMrpRunNumber || "Belum tersedia";
    const currentHref = reconciliation.currentMrpRunNumber
      ? `/modules/planning-ppic/mrp/${encodeURIComponent(reconciliation.currentMrpRunNumber)}`
      : null;
    return `<section class="ops-detail-card mpp-integrity-card ${current ? "is-current" : "is-stale"}">
      <div class="ops-collection-head">
        <div><h2>Source Snapshot & Reconciliation</h2><p>Perbandingan snapshot Production Plan dengan revision MPS/MRP current sebelum dokumen boleh dikonfirmasi atau direlease.</p></div>
        <span class="mpp-integrity-state">${current ? "CURRENT" : "REPLAN REQUIRED"}</span>
      </div>
      <div class="mpp-integrity-grid">
        <div><small>MRP Snapshot Plan</small><b>${esc(snapshotLabel)}</b><span>Revision pembentuk detail tersimpan</span></div>
        <div><small>MRP Current</small><b>${currentHref ? `<a href="${esc(currentHref)}">${esc(currentLabel)} →</a>` : esc(currentLabel)}</b><span>${reconciliation.revisionCurrent ? "Revision sama" : "Revision sudah berubah"}</span></div>
        <div><small>FG Receipt</small><b>${num(reconciliation.actualReceiptCount, 0)} <em>Plan</em> / ${num(reconciliation.expectedReceiptCount, 0)} <em>current</em></b><span>${num((reconciliation.missingPhaseKeys || []).length, 0)} phase hilang · ${num((reconciliation.obsoletePhaseKeys || []).length, 0)} obsolete</span></div>
        <div><small>FG Planned Qty</small><b>${num(reconciliation.actualFgQty)} <em>Plan</em> / ${num(reconciliation.expectedFgQty)} <em>current</em></b><span>Variance ${num(reconciliation.quantityDelta)} pcs</span></div>
      </div>
      ${current ? "" : `<div class="mpp-integrity-action"><b>Confirm dan Release diblokir.</b><span>Buka MRP current lalu jalankan “Buat Production Plan” kembali, atau hitung ulang Capacity Recommendation untuk menyinkronkan Draft Plan.</span>${currentHref ? `<a class="btn btn-sm btn-primary" href="${esc(currentHref)}">Buka MRP Current</a>` : ""}</div>`}
    </section>`;
  }
  function monthlyPlanReadinessCard(record) {
    const readiness = record.planReadiness || { ready: false, summary: {}, issues: [] };
    const summary = readiness.summary || {};
    const issues = Array.isArray(readiness.issues) ? readiness.issues : [];
    const state = readiness.releaseReady ? "ready" : "blocked";
    const stateLabel = readiness.releaseReady
      ? "Siap Release"
      : `${num(summary.blocking, 0)} blocker · ${num(summary.overridable, 0)} override`;
    const renderIssue = (issue) => {
        const severity = String(issue.severity || "WARNING").toUpperCase();
        const references = (issue.references || []).filter((reference, index, rows) =>
          rows.findIndex((candidate) => candidate.href === reference.href && candidate.label === reference.label) === index);
        return `<article class="mpp-blocker mpp-blocker--${esc(severity.toLowerCase())}">
          <div class="mpp-blocker-mark">${severity === "BLOCKING" ? "!" : severity === "OVERRIDABLE" ? "↗" : "i"}</div>
          <div class="mpp-blocker-copy">
            <div><span>${esc(severity)}</span><b>${esc(issue.source || "PLAN")} &middot; ${esc(issue.code || "PLAN_CHECK")}</b></div>
            <h3>${esc(issue.title || issue.partName || issue.partCode || "Pemeriksaan Production Plan")}</h3>
            <p>${esc(issue.message || "-")}</p>
            ${references.length ? `<div class="mpp-blocker-links">${references.map((reference) => referenceLink(reference, "mpp-fix-link")).join("")}</div>` : ""}
          </div>
        </article>`;
      };
    const criticalIssues = issues.filter((issue) => ["BLOCKING", "OVERRIDABLE"].includes(String(issue.severity || "").toUpperCase()));
    const advisoryIssues = issues.filter((issue) => !["BLOCKING", "OVERRIDABLE"].includes(String(issue.severity || "").toUpperCase()));
    const issueRows = issues.length
      ? `${criticalIssues.map(renderIssue).join("")}${advisoryIssues.length ? `<details class="mpp-advisory-details"><summary><span><b>${num(advisoryIssues.length, 0)} warning non-blocking</b><small>Material, purchasing, dan rekomendasi untuk ditindaklanjuti</small></span><i>Lihat rincian</i></summary><div>${advisoryIssues.map(renderIssue).join("")}</div></details>` : ""}`
      : `<div class="mpp-ready-empty"><b>Tidak ada blocker aktif</b><span>Routing, kapasitas, material, supplier, dan lead time memenuhi rule release.</span></div>`;
    return `<section class="ops-detail-card mpp-readiness-card">
      <div class="ops-collection-head">
        <div><h2>Plan Readiness & Semua Blocker</h2><p>Gabungan hasil rekomendasi, delivery phase coverage, kapasitas, dan material untuk plan ini.</p></div>
        <span class="mpp-readiness-state ${state}">${esc(stateLabel)}</span>
      </div>
      <div class="mpp-readiness-stats">
        <div><small>Blocking</small><strong>${num(summary.blocking, 0)}</strong></div>
        <div><small>Overridable</small><strong>${num(summary.overridable, 0)}</strong></div>
        <div><small>Warning</small><strong>${num(summary.warning, 0)}</strong></div>
        <div><small>Recommendation</small><strong>${num(summary.recommendationBlockers, 0)}</strong></div>
        <div><small>Delivery Phase</small><strong>${num(summary.deliveryBlockers, 0)}</strong></div>
        <div><small>Capacity</small><strong>${num(summary.capacityBlockers, 0)}</strong></div>
        <div><small>Material</small><strong>${num(summary.materialBlockers, 0)}</strong></div>
        <div><small>Data Integrity</small><strong>${num(summary.dataIntegrityBlockers, 0)}</strong></div>
        <div><small>Timing Late</small><strong>${num(summary.timingBlockers, 0)}</strong></div>
      </div>
      <div class="mpp-blocker-list">${issueRows}</div>
    </section>`;
  }
  let mppGanttInstance = null;
  const mppGanttIsoDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] || null;
  };
  const mppGanttTaskId = (value) => `mppg_${String(value || "task").replace(/[^a-zA-Z0-9_-]+/g, "_")}`;

  function monthlyPlanGanttCard(record) {
    const timeline = record.deliveryPhaseTimeline || {};
    const phases = Array.isArray(timeline.phases) ? timeline.phases : [];
    const phaseOptions = phases.map((phase) => `<option value="${esc(phase.id)}">Phase ${num(phase.phaseNumber, 0)} · ${esc(phase.fgParent?.partCode || "FG")} · ${num(phase.qty)} ${esc(phase.uomCode || "PCS")}</option>`).join("");
    return `<section class="ops-detail-card mpp-gantt-card" data-mpp-gantt-plan="${esc(record.planNumber || config.recordKey)}">
      <div class="ops-collection-head mpp-gantt-head"><div><h2>Production Plan Gantt</h2><p>Timeline proses sampai delivery berbasis planning horizon. Geser atau resize bar allocation untuk mengusulkan perubahan tanggal; server tetap memvalidasi urutan proses, kapasitas, vendor, dan freeze fence.</p></div><span>Frappe Gantt · MIT Open Source</span></div>
      <div class="mpp-gantt-toolbar">
        <div class="mpp-gantt-row-switch" role="group" aria-label="Baris Gantt"><button type="button" data-mpp-gantt-row-mode="forecast">Per Forecast</button><button type="button" data-mpp-gantt-row-mode="process">Detail Proses</button></div>
        <div class="mpp-gantt-view-switch" role="group" aria-label="Skala Gantt"><button type="button" data-mpp-gantt-view="Day">Hari</button><button type="button" data-mpp-gantt-view="Week">Minggu</button><button type="button" data-mpp-gantt-view="Month">Bulan</button></div>
        <label><span>Delivery phase</span><select class="form-select form-select-sm" data-mpp-gantt-phase><option value="all">Semua phase</option>${phaseOptions}</select></label>
        <button type="button" class="mpp-gantt-calendar" data-mpp-gantt-calendar aria-pressed="false"><span>Kalender kerja</span><b>Lewati hari Minggu</b></button>
        <button type="button" class="mpp-gantt-today" data-mpp-gantt-today>Hari ini</button>
      </div>
      <div class="mpp-gantt-context"><div><span><i class="forecast"></i>Forecast phase</span><span><i class="process"></i>In-house</span><span><i class="vendor"></i>Vendor</span><span><i class="delivery"></i>Delivery</span><span><i class="nonwork"></i>Minggu / non-working</span></div><b data-mpp-gantt-summary>${num(phases.length, 0)} phase</b></div>
      <div class="mpp-gantt-frame" data-mpp-gantt-frame>
        <div class="mpp-gantt-list" aria-label="Daftar task Production Plan"><div class="mpp-gantt-list-head"><span>Task / Part</span><b>Qty & Resource</b></div><div class="mpp-gantt-list-viewport"><div class="mpp-gantt-list-body" data-mpp-gantt-list></div></div></div>
        <div class="mpp-gantt-canvas" data-mpp-gantt-canvas><div class="mpp-gantt-loading">Menyiapkan Gantt...</div></div>
      </div>
      <div class="mpp-gantt-foot"><span>Kalender kerja saat ini: Senin–Sabtu; hari Minggu ditandai abu-abu.</span><span>Drag tidak langsung menyimpan—dialog konfirmasi tetap dibuka sebelum perubahan dikirim.</span></div>
    </section>`;
  }

  function buildMppForecastGanttTasks(record, phaseFilter = "all") {
    const timeline = record.deliveryPhaseTimeline || {};
    return (Array.isArray(timeline.phases) ? timeline.phases : [])
      .filter((phase) => phaseFilter === "all" || String(phase.id) === String(phaseFilter))
      .sort((left, right) => number(left.phaseNumber) - number(right.phaseNumber))
      .map((phase, phaseIndex) => {
        const fg = phase.fgParent || {};
        const sourceType = String(phase.sourceType || "").toUpperCase();
        const sourceLabel = sourceType.includes("FORECAST") || sourceType === "FCT" ? "FCT" : sourceType.includes("SALES") || sourceType === "SO" ? "PO" : "MPS";
        const sourceNumber = phase.sourceNumber || timeline.sourceMpsNumber || "-";
        const processCodes = new Set();
        const starts = [];
        const finishes = [];
        let allocationCount = 0;
        (phase.events || [])
          .filter((event) => !["DELIVERY", "VENDOR_RETURN"].includes(String(event.type || "").toUpperCase()))
          .forEach((event) => {
            const processCode = String(event.processCode || "PROCESS").replace(/^RETURN\s+/i, "");
            processCodes.add(processCode);
            const allocations = Array.isArray(event.allocations) && event.allocations.length ? event.allocations : [null];
            allocations.forEach((allocation) => {
              if (allocation?.id) allocationCount += 1;
              const start = mppGanttIsoDate(allocation?.vendorSendDate || allocation?.scheduleDate || event.date);
              const finish = mppGanttIsoDate(allocation?.vendorReturnDate || event.completionDate || allocation?.scheduleDate || event.date);
              if (start) starts.push(start);
              if (finish) finishes.push(finish);
            });
          });
        const deliveryDate = mppGanttIsoDate(phase.deliveryDate || phase.fgRequiredDate);
        const sortedStarts = starts.sort();
        const sortedFinishes = finishes.sort();
        const start = sortedStarts[0] || deliveryDate || mppGanttIsoDate(record.periodStart);
        const endCandidate = deliveryDate || sortedFinishes.at(-1) || start;
        const end = start && endCandidate && endCandidate < start ? start : endCandidate;
        if (!start || !end) return null;
        const processSummary = [...processCodes].join(" → ") || "Belum ada proses terjadwal";
        return {
          id: mppGanttTaskId(`forecast_${phase.id || phaseIndex}`),
          name: `${sourceLabel} ${sourceNumber} · Phase ${num(phase.phaseNumber, 0)} · ${num(phase.qty)} ${phase.uomCode || "PCS"}`,
          start,
          end,
          progress: 0,
          dependencies: "",
          custom_class: `mpp-gantt-forecast-locked${phase.scheduleHealth === "LATE" ? "-late" : ""}`,
          editable: false,
          forecastSummary: true,
          phaseId: phase.id,
          phaseNumber: num(phase.phaseNumber, 0),
          sourceLabel,
          sourceNumber,
          processCode: "FORECAST PHASE",
          processName: `${sourceLabel} ${sourceNumber} · Delivery phase ${num(phase.phaseNumber, 0)}`,
          partCode: fg.partCode || "-",
          partNumber: fg.partNumber || "-",
          partName: fg.partName || "-",
          qty: number(phase.qty),
          uomCode: phase.uomCode || "PCS",
          resource: `${num(processCodes.size, 0)} proses · ${num(allocationCount, 0)} allocation`,
          processCount: processCodes.size,
          allocationCount,
          processSummary,
          taskType: "FORECAST",
          originalStart: start,
          originalEnd: end,
        };
      })
      .filter(Boolean);
  }

  function buildMppGanttTasks(record, phaseFilter = "all", rowMode = "forecast") {
    if (rowMode !== "process") return buildMppForecastGanttTasks(record, phaseFilter);
    const timeline = record.deliveryPhaseTimeline || {};
    const phases = (Array.isArray(timeline.phases) ? timeline.phases : [])
      .filter((phase) => phaseFilter === "all" || String(phase.id) === String(phaseFilter))
      .sort((left, right) => number(left.phaseNumber) - number(right.phaseNumber));
    const tasks = [];
    phases.forEach((phase, phaseIndex) => {
      const fg = phase.fgParent || {};
      const phaseNumber = num(phase.phaseNumber, 0);
      const processEvents = (phase.events || [])
        .filter((event) => !["DELIVERY", "VENDOR_RETURN"].includes(String(event.type || "").toUpperCase()))
        .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")) || String(left.processCode || "").localeCompare(String(right.processCode || "")));
      let previousTaskId = null;
      processEvents.forEach((event, eventIndex) => {
        const allocations = Array.isArray(event.allocations) && event.allocations.length ? event.allocations : [null];
        allocations.forEach((allocation, allocationIndex) => {
          const part = allocation?.part || event.part || fg;
          const routingMode = String(allocation?.routingMode || event.routingMode || "INHOUSE").toUpperCase();
          const vendor = routingMode === "VENDOR";
          const start = mppGanttIsoDate(allocation?.vendorSendDate || allocation?.scheduleDate || event.date);
          const end = mppGanttIsoDate(allocation?.vendorReturnDate || event.completionDate || allocation?.scheduleDate || event.date || start);
          if (!start || !end) return;
          const allocationId = allocation?.id || null;
          const editable = Boolean(timeline.editable && allocationId && allocation?.editable !== false);
          const rawId = allocationId || `${phase.id || phaseIndex}_${event.id || eventIndex}_${allocationIndex}`;
          const id = mppGanttTaskId(rawId);
          const processCode = String(allocation?.processCode || event.processCode || "PROCESS").replace(/^RETURN\s+/i, "");
          const qtyValue = number(allocation?.plannedQty ?? event.qty ?? phase.qty);
          const uomCode = allocation?.uomCode || event.uomCode || phase.uomCode || "PCS";
          const resource = vendor
            ? [allocation?.vendorCode || event.vendorCode, allocation?.vendorName || event.vendorName].filter(Boolean).join(" · ") || "Vendor belum dipilih"
            : [allocation?.machineCode || event.machineCode, allocation?.machineName || event.machineName].filter(Boolean).join(" · ") || "Resource belum dialokasikan";
          const healthClass = phase.scheduleHealth === "LATE" ? "-late" : "";
          tasks.push({
            id,
            name: `P${phaseNumber} · ${processCode} · ${part.partCode || fg.partCode || "FG"}`,
            start,
            end,
            progress: 0,
            dependencies: previousTaskId || "",
            custom_class: `${vendor ? "mpp-gantt-vendor" : "mpp-gantt-process"}-${editable ? "editable" : "locked"}${healthClass}`,
            allocationId,
            editable,
            routingMode,
            phaseId: phase.id,
            phaseNumber,
            processCode,
            processName: allocation?.processName || event.processName || processCode,
            partCode: part.partCode || fg.partCode || "-",
            partNumber: part.partNumber || fg.partNumber || "-",
            partName: part.partName || fg.partName || "-",
            qty: qtyValue,
            uomCode,
            resource,
            taskType: vendor ? "VENDOR" : "PROCESS",
            originalStart: start,
            originalEnd: end,
          });
          previousTaskId = id;
        });
      });
      const deliveryDate = mppGanttIsoDate(phase.deliveryDate || phase.fgRequiredDate);
      if (deliveryDate) {
        const sourceType = String(phase.sourceType || "").toUpperCase();
        const sourceLabel = sourceType.includes("FORECAST") || sourceType === "FCT" ? "FCT" : sourceType.includes("SALES") || sourceType === "SO" ? "PO" : "MPS";
        const id = mppGanttTaskId(`delivery_${phase.id || phaseIndex}`);
        tasks.push({
          id,
          name: `P${phaseNumber} · DELIVERY · ${fg.partCode || "FG"}`,
          start: deliveryDate,
          end: deliveryDate,
          progress: 0,
          dependencies: previousTaskId || "",
          custom_class: `mpp-gantt-delivery-locked${phase.scheduleHealth === "LATE" ? "-late" : ""}`,
          editable: false,
          phaseId: phase.id,
          phaseNumber,
          processCode: "DELIVERY",
          processName: `Delivery ${sourceLabel} ${phase.sourceNumber || timeline.sourceMpsNumber || ""}`.trim(),
          partCode: fg.partCode || "-",
          partNumber: fg.partNumber || "-",
          partName: fg.partName || "-",
          qty: number(phase.qty),
          uomCode: phase.uomCode || "PCS",
          resource: `${phase.customerCode || "Customer"} · ${sourceLabel} ${phase.sourceNumber || timeline.sourceMpsNumber || "-"}`,
          taskType: "DELIVERY",
          originalStart: deliveryDate,
          originalEnd: deliveryDate,
        });
      }
    });
    return tasks;
  }

  function renderMppGantt(record = currentRecord) {
    const card = document.querySelector(".mpp-gantt-card");
    const canvas = card?.querySelector("[data-mpp-gantt-canvas]");
    if (!card || !canvas || !record) return;
    const phaseFilter = card.querySelector("[data-mpp-gantt-phase]")?.value || "all";
    const rowMode = localStorage.getItem(`mpp-gantt-row-mode:${record.planNumber || config.recordKey}`) === "process" ? "process" : "forecast";
    const tasks = buildMppGanttTasks(record, phaseFilter, rowMode);
    const list = card.querySelector("[data-mpp-gantt-list]");
    const summary = card.querySelector("[data-mpp-gantt-summary]");
    const phaseCount = new Set(tasks.map((task) => task.phaseId).filter(Boolean)).size;
    if (summary) summary.textContent = rowMode === "forecast" ? `${num(tasks.length, 0)} baris Forecast` : `${num(tasks.length, 0)} task proses · ${num(phaseCount, 0)} phase`;
    if (!tasks.length) {
      canvas.innerHTML = '<div class="mpp-gantt-empty"><b>Belum ada task terjadwal</b><span>Jalankan Capacity Recommendation atau buat allocation manual agar bar proses muncul.</span></div>';
      if (list) list.innerHTML = "";
      mppGanttInstance = null;
      return;
    }
    if (typeof window.Gantt !== "function") {
      canvas.innerHTML = '<div class="mpp-gantt-empty"><b>Library Gantt belum termuat</b><span>Refresh halaman atau periksa asset Frappe Gantt lokal.</span></div>';
      return;
    }
    if (list) list.innerHTML = tasks.map((task) => task.forecastSummary
      ? `<div class="mpp-gantt-list-row forecast" data-mpp-gantt-task-row="${esc(task.id)}"><div><span>${esc(task.sourceLabel)} · ${esc(task.sourceNumber)}</span><b>Delivery phase ${esc(task.phaseNumber)}</b><small>${esc(task.partCode)} · ${esc(task.partNumber)} · ${esc(task.partName)}</small></div><div><b>${num(task.qty)} ${esc(task.uomCode)}</b><small>${esc(task.resource)}</small><em>Ringkas</em></div></div>`
      : `<div class="mpp-gantt-list-row ${esc(task.taskType.toLowerCase())}" data-mpp-gantt-task-row="${esc(task.id)}"><div><span>Phase ${esc(task.phaseNumber)} · ${esc(task.processCode)}</span><b>${esc(task.partCode)}</b><small>${esc(task.partNumber)} · ${esc(task.partName)}</small></div><div><b>${num(task.qty)} ${esc(task.uomCode)}</b><small>${esc(task.resource)}</small>${task.editable ? `<button type="button" data-mpp-gantt-edit="${esc(task.allocationId)}">Edit</button>` : '<em>Terkunci</em>'}</div></div>`).join("");
    const storedView = ["Day", "Week", "Month"].includes(localStorage.getItem(`mpp-gantt-view:${record.planNumber || config.recordKey}`)) ? localStorage.getItem(`mpp-gantt-view:${record.planNumber || config.recordKey}`) : "Week";
    const workingOnly = localStorage.getItem(`mpp-gantt-working:${record.planNumber || config.recordKey}`) === "1";
    const chartHeight = Math.min(760, 84 + tasks.length * 44);
    card.style.setProperty("--mpp-gantt-height", `${chartHeight}px`);
    card.querySelectorAll("[data-mpp-gantt-row-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mppGanttRowMode === rowMode));
    card.querySelectorAll("[data-mpp-gantt-view]").forEach((button) => button.classList.toggle("active", button.dataset.mppGanttView === storedView));
    const calendarButton = card.querySelector("[data-mpp-gantt-calendar]");
    calendarButton?.classList.toggle("active", workingOnly);
    calendarButton?.setAttribute("aria-pressed", String(workingOnly));
    canvas.innerHTML = "";
    const popup = (ctx) => {
      const task = ctx.task;
      ctx.set_title(esc(task.forecastSummary ? `${task.sourceLabel} ${task.sourceNumber} · Delivery phase ${task.phaseNumber}` : `${task.processCode} · ${task.partCode}`));
      ctx.set_subtitle(esc(`${task.partCode} · ${task.partNumber} · ${task.partName}`));
      ctx.set_details(`<div class="mpp-gantt-popup"><span><small>Qty</small><b>${num(task.qty)} ${esc(task.uomCode)}</b></span><span><small>${task.forecastSummary ? "Cakupan proses" : "Resource"}</small><b>${esc(task.forecastSummary ? task.processSummary : task.resource)}</b></span><span><small>${task.forecastSummary ? "Production start – Delivery" : "Jadwal"}</small><b>${esc(mppGanttIsoDate(task._start) || task.start)} – ${esc(mppGanttIsoDate(new Date(task._end.getTime() - 1000)) || task.end)}</b></span></div>`);
      if (task.editable && task.allocationId) ctx.add_action('<button type="button" class="mpp-gantt-popup-action">Edit posisi</button>', () => openMppPlacementEditor(task.allocationId));
    };
    try {
      mppGanttInstance = new window.Gantt(canvas, tasks, {
        view_mode: storedView,
        language: "id",
        bar_height: 28,
        padding: 16,
        upper_header_height: 36,
        lower_header_height: 28,
        container_height: chartHeight,
        infinite_padding: false,
        scroll_to: mppGanttIsoDate(record.periodStart) || "start",
        popup_on: "click",
        popup,
        readonly_progress: true,
        readonly_dates: rowMode === "forecast" || !record.deliveryPhaseTimeline?.editable,
        move_dependencies: false,
        snap_at: "1d",
        lines: "both",
        today_button: false,
        holidays: { "rgba(148, 163, 184, .16)": "weekend" },
        is_weekend: (date) => date.getDay() === 0,
        ignore: workingOnly ? (date) => date.getDay() === 0 : [],
        on_view_change: (mode) => {
          const name = mode?.name || String(mode || "Week");
          localStorage.setItem(`mpp-gantt-view:${record.planNumber || config.recordKey}`, name);
          card.querySelectorAll("[data-mpp-gantt-view]").forEach((button) => button.classList.toggle("active", button.dataset.mppGanttView === name));
        },
        on_date_change: (task, start, end) => {
          if (!task.editable || !task.allocationId) {
            showAlert("Bar delivery atau task tanpa allocation tidak dapat dipindahkan. Edit tanggal melalui sumber demand atau Capacity Planning.", "warning");
            setTimeout(() => renderMppGantt(record), 0);
            return;
          }
          const proposedStart = mppGanttIsoDate(start);
          const proposedEnd = mppGanttIsoDate(end);
          setTimeout(() => {
            renderMppGantt(record);
            openMppPlacementEditor(task.allocationId, proposedStart, proposedEnd);
          }, 0);
        },
      });
      const ganttContainer = canvas.querySelector(".gantt-container");
      const listBody = card.querySelector("[data-mpp-gantt-list]");
      ganttContainer?.addEventListener("scroll", () => {
        if (listBody) listBody.style.transform = `translateY(${-ganttContainer.scrollTop}px)`;
      }, { passive: true });
    } catch (error) {
      mppGanttInstance = null;
      canvas.innerHTML = `<div class="mpp-gantt-empty"><b>Gantt gagal dirender</b><span>${esc(error.message)}</span></div>`;
    }
  }

  function monthlyPlanWeeklyMatrixCard(record) {
    const timeline = record.deliveryPhaseTimeline || {};
    const phases = Array.isArray(timeline.phases) ? timeline.phases : [];
    const iso = (value) => String(value || "").slice(0, 10);
    const dateValue = (value) => {
      const parsed = new Date(`${iso(value)}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const addDays = (value, days) => {
      const parsed = value instanceof Date ? new Date(value.getTime()) : dateValue(value);
      if (!parsed) return null;
      parsed.setDate(parsed.getDate() + days);
      return parsed;
    };
    const dateIso = (value) => value instanceof Date && !Number.isNaN(value.getTime())
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : null;
    const shortDate = (value) => {
      const parsed = value instanceof Date ? value : dateValue(value);
      return parsed ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(parsed) : "-";
    };
    const eventDates = phases.flatMap((phase) => [phase.deliveryDate, phase.fgRequiredDate, ...(phase.events || []).flatMap((event) => [event.date, event.completionDate])]).filter(Boolean);
    const start = dateValue(record.periodStart) || dateValue(eventDates.sort()[0]);
    const horizonDates = [record.schedulingHorizonEnd, record.periodEnd, ...eventDates].map(dateValue).filter(Boolean);
    const end = horizonDates.length ? new Date(Math.max(...horizonDates.map((date) => date.getTime()))) : start;
    if (!start || !end) return "";
    const weekCount = Math.max(Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7), 1);
    const weeks = Array.from({ length: weekCount }, (_, index) => {
      const weekStart = addDays(start, index * 7);
      const naturalEnd = addDays(weekStart, 6);
      const weekEnd = naturalEnd > end ? end : naturalEnd;
      return { index, start: dateIso(weekStart), end: dateIso(weekEnd), label: `W${index + 1}` };
    });
    const weekIndex = (value) => {
      const parsed = dateValue(value);
      if (!parsed) return -1;
      return Math.min(Math.max(Math.floor((parsed.getTime() - start.getTime()) / 86400000 / 7), 0), weekCount - 1);
    };
    const sourceMeta = (phase) => {
      const sourceType = String(phase.sourceType || "").toUpperCase();
      const sourceLabel = sourceType.includes("SALES") || sourceType === "SO" ? "PO" : sourceType.includes("FORECAST") || sourceType === "FCT" ? "FCT" : "MPS";
      const sourceNumber = phase.sourceNumber || timeline.sourceMpsNumber || "-";
      const href = sourceLabel === "PO"
        ? `/modules/sales/sales-orders/${encodeURIComponent(sourceNumber)}`
        : sourceLabel === "FCT"
          ? `/modules/sales/forecasts/${encodeURIComponent(sourceNumber)}`
          : `/modules/planning-ppic/mps/${encodeURIComponent(timeline.sourceMpsNumber || sourceNumber)}`;
      return { label: sourceLabel, number: sourceNumber, href };
    };
    const receiptRows = (record.details || []).filter((row) => row.lineType === "FG Receipt");
    const stockByPart = new Map();
    receiptRows.forEach((row) => stockByPart.set(row.partCode, Math.max(number(row.stock?.qtyAvailable), number(stockByPart.get(row.partCode)))));
    const phaseMetrics = new Map();
    [...phases].sort((left, right) => iso(left.fgRequiredDate || left.deliveryDate).localeCompare(iso(right.fgRequiredDate || right.deliveryDate))).forEach((phase) => {
      if (phase.planRole === "CARRY_OVER") return;
      const partCode = phase.fgParent?.partCode;
      const demand = Math.max(number(phase.qty), 0);
      const available = Math.max(number(stockByPart.get(partCode)), 0);
      const stock = Math.min(available, demand);
      phaseMetrics.set(String(phase.id), { demand, stock, effective: Math.max(demand - stock, 0) });
      stockByPart.set(partCode, Math.max(available - stock, 0));
    });
    const partPopover = (part = {}) => `<span class="mpp-timeline-popover" role="tooltip"><small>Part Number</small><b>${esc(part.partNumber || "-")}</b><small>Part Code</small><b>${esc(part.partCode || "-")}</b><small>Part Name</small><b>${esc(part.partName || "-")}</b></span>`;
    const placementCard = (event, phase) => {
      const vendorReturn = event.type === "VENDOR_RETURN";
      const vendorSend = event.routingMode === "VENDOR";
      const allocations = Array.isArray(event.allocations) ? event.allocations : [];
      const cardClass = vendorReturn ? "vendor-return" : vendorSend ? "vendor-send" : event.type === "DELIVERY" ? "delivery" : "process";
      const labelValue = vendorReturn ? `RETURN ${String(event.processCode || "").replace(/^RETURN\s+/i, "")}` : vendorSend ? `SEND ${event.processCode}` : event.processCode;
      const resource = vendorSend || vendorReturn
        ? [event.vendorCode, event.vendorName].filter(Boolean).join(" · ")
        : [event.machineCode, event.machineName].filter(Boolean).join(" · ");
      return `<div class="mpp-week-event ${cardClass}">
        <button type="button" class="mpp-week-event-info" data-mpp-popover aria-expanded="false"><span><b>${esc(labelValue || event.processName || "PROCESS")}</b><strong>${num(event.qty)} ${esc(event.uomCode || phase.uomCode || "PCS")}</strong></span><small>${esc(shortDate(event.date))}${resource ? ` · ${esc(resource)}` : ""}</small>${vendorSend && event.completionDate ? `<em>Kembali ${esc(shortDate(event.completionDate))}</em>` : ""}${partPopover(event.part || phase.fgParent)}</button>
        ${!vendorReturn && event.type !== "DELIVERY" ? allocations.map((allocation) => `<button type="button" class="mpp-placement-edit" data-mpp-edit-placement="${esc(allocation.id)}" ${timeline.editable && allocation.editable ? "" : "disabled"}>Edit posisi</button>`).join("") : ""}
      </div>`;
    };
    const phaseRows = phases.map((phase) => {
      const source = sourceMeta(phase);
      const fg = phase.fgParent || {};
      const carryOver = phase.planRole === "CARRY_OVER";
      const metrics = phaseMetrics.get(String(phase.id)) || { demand: number(phase.qty), stock: 0, effective: number(phase.qty) };
      const deliveryWeek = weekIndex(phase.deliveryDate || phase.fgRequiredDate);
      const phaseCells = weeks.map((week) => `<td data-mpp-week-column="${week.index}">${week.index === deliveryWeek ? (carryOver ? `<div class="mpp-week-carry"><b>DELIVERY REFERENCE</b><span>${num(phase.qty)} ${esc(phase.uomCode || "PCS")} · ${esc(shortDate(phase.deliveryDate || phase.fgRequiredDate))}</span><a href="/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(phase.ownerPlanNumber || "")}">Owner ${esc(phase.ownerPlanNumber || "Production Plan")}</a><em>REQ, stock, dan EFF hanya dihitung di owner plan.</em></div>` : `<div class="mpp-week-demand"><b>DELIVERY ${num(phase.qty)} ${esc(phase.uomCode || "PCS")}</b><span><small>REQ</small><strong>${num(metrics.demand)}</strong></span><span class="stock"><small>STOCK</small><strong>${num(metrics.stock)}</strong></span><span class="effective"><small>EFF</small><strong>${num(metrics.effective)}</strong></span><em>${esc(shortDate(phase.deliveryDate || phase.fgRequiredDate))}</em></div>`) : '<span class="mpp-week-empty">–</span>'}</td>`).join("");
      const processGroups = new Map();
      (phase.events || []).filter((event) => event.type !== "DELIVERY").forEach((event) => {
        const baseCode = String(event.processCode || "PROCESS").replace(/^RETURN\s+/i, "");
        const key = [baseCode, event.part?.partCode || "", event.vendorCode || event.machineCode || ""].join("|");
        if (!processGroups.has(key)) processGroups.set(key, { code: baseCode, name: String(event.processName || baseCode).replace(/ selesai vendor$/i, ""), part: event.part || fg, events: [] });
        processGroups.get(key).events.push(event);
      });
      const processRows = [...processGroups.values()].sort((left, right) => String(left.code).localeCompare(String(right.code))).map((group) => {
        const byWeek = new Map();
        group.events.forEach((event) => {
          const index = weekIndex(event.date);
          if (!byWeek.has(index)) byWeek.set(index, []);
          byWeek.get(index).push(event);
        });
        return `<tr class="mpp-week-process-row"><td><span class="mpp-week-branch">└ proses</span></td><td><button type="button" class="mpp-week-part" data-mpp-popover aria-expanded="false"><b>${esc(group.code)}</b><span>${esc(group.name)}</span><small>${esc(group.part?.partCode || "-")} · ${esc(group.part?.partNumber || "-")}</small>${partPopover(group.part)}</button></td>${weeks.map((week) => `<td data-mpp-week-column="${week.index}"><div class="mpp-week-event-stack">${(byWeek.get(week.index) || []).map((event) => placementCard(event, phase)).join("")}</div></td>`).join("")}</tr>`;
      }).join("");
      return `<tr class="mpp-week-phase-row ${carryOver ? "is-carry-over" : "is-owner"} mpp-phase-health-${esc(String(phase.scheduleHealth || "unknown").toLowerCase())}"><td><b>Delivery phase ${num(phase.phaseNumber, 0)}</b><a href="${esc(source.href)}">${esc(source.label)} · ${esc(source.number)}</a><small>${carryOver ? `Carry-over · owner ${esc(phase.ownerPlanNumber || "-")}` : `${esc(phase.customerCode || "Customer")} · owner plan`}</small></td><td><button type="button" class="mpp-week-part" data-mpp-popover aria-expanded="false"><b>${esc(fg.partNumber || fg.partCode || "FG Parent")}</b><span>${esc(fg.partName || "FG Parent")}</span><small>${esc(fg.partCode || "-")} · ${num(phase.qty)} ${esc(phase.uomCode || "PCS")}</small>${partPopover(fg)}</button></td>${phaseCells}</tr>${processRows}`;
    }).join("");
    const storageKey = `mpp-week-span:${record.planNumber || config.recordKey}`;
    const savedSpan = ["all", "1", "2", "3"].includes(localStorage.getItem(storageKey)) ? localStorage.getItem(storageKey) : "all";
    return `<section class="ops-detail-card mpp-weekly-card" data-mpp-week-count="${weekCount}" data-mpp-week-span="${esc(savedSpan)}">
      <div class="ops-collection-head mpp-weekly-head"><div><h2>Matriks Production Plan Mingguan</h2><p>Tampilan utama berdasarkan planning horizon, bukan bulan. Delivery owner menampilkan REQ, stock cover, dan EFF; carry-over hanya menjadi referensi agar demand tidak dihitung dua kali.</p></div><span>${num(timeline.ownedPhaseCount ?? phases.filter((phase) => phase.planRole !== "CARRY_OVER").length, 0)} owner · ${num(timeline.carryOverPhaseCount, 0)} carry-over · ${weekCount} minggu</span></div>
      <div class="mpp-week-toolbar"><div class="mpp-week-span-switch" role="group" aria-label="Rentang minggu"><button type="button" data-mpp-week-span="all" class="${savedSpan === "all" ? "active" : ""}">Full Horizon</button><button type="button" data-mpp-week-span="1" class="${savedSpan === "1" ? "active" : ""}">1 Minggu</button><button type="button" data-mpp-week-span="2" class="${savedSpan === "2" ? "active" : ""}">2 Minggu</button><button type="button" data-mpp-week-span="3" class="${savedSpan === "3" ? "active" : ""}">3 Minggu</button></div><div class="mpp-week-navigation"><button type="button" data-mpp-week-nav="prev" aria-label="Minggu sebelumnya">‹</button><b data-mpp-week-range>Semua minggu</b><button type="button" data-mpp-week-nav="next" aria-label="Minggu berikutnya">›</button></div></div>
      <div class="table-responsive mpp-weekly-wrap"><table class="table mpp-weekly-table" data-enterprise-table="off"><thead><tr><th>PO / FCT</th><th>FG Parent / Proses</th>${weeks.map((week) => `<th data-mpp-week-column="${week.index}"><small>${esc(week.label)}</small><b>${esc(shortDate(week.start))} – ${esc(shortDate(week.end))}</b></th>`).join("")}</tr></thead><tbody>${phaseRows || `<tr><td colspan="${2 + weekCount}" class="text-center py-4">Delivery phase belum tersedia.</td></tr>`}</tbody></table></div>
    </section>`;
  }
  function monthlyPlanPhaseTimelineCard(record) {
    const timeline = record.deliveryPhaseTimeline || {};
    const phases = Array.isArray(timeline.phases) ? timeline.phases : [];
    const dates = Array.isArray(timeline.dates) ? timeline.dates : [];
    const earlyCount = phases.filter((phase) => phase.scheduleHealth === "EARLY").length;
    const unscheduledCount = phases.filter((phase) => phase.scheduleHealth === "UNSCHEDULED").length;
    const dateLabel = (value) => {
      const parsed = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return esc(value || "-");
      return `<small>${esc(new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(parsed))}</small><b>${esc(new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(parsed))}</b><span>${parsed.getFullYear()}</span>`;
    };
    const sourceMeta = (phase) => {
      const sourceType = String(phase.sourceType || "").toUpperCase();
      const labelValue = sourceType.includes("SALES") || sourceType === "SO" ? "PO" : sourceType.includes("FORECAST") || sourceType === "FCT" ? "FCT" : "MPS";
      const href = phase.sourceNumber
        ? labelValue === "PO"
          ? `/modules/sales/sales-orders/${encodeURIComponent(phase.sourceNumber)}`
          : labelValue === "FCT"
            ? `/modules/sales/forecasts/${encodeURIComponent(phase.sourceNumber)}`
            : `/modules/planning-ppic/mps/${encodeURIComponent(timeline.sourceMpsNumber || phase.sourceNumber)}`
        : null;
      return { label: labelValue, href };
    };
    const partDetail = (part = {}, fallback = "Belum ada master part") => `<span class="mpp-timeline-popover" role="tooltip">
      <small>Part Number</small><b>${esc(part.partNumber || "-")}</b>
      <small>Part Code</small><b>${esc(part.partCode || "-")}</b>
      <small>Part Name</small><b>${esc(part.partName || fallback)}</b>
    </span>`;
    const eventButton = (event, phase) => {
      const part = event.part || phase.fgParent || {};
      const vendorEvent = String(event.routingMode || "").startsWith("VENDOR");
      const resource = vendorEvent
        ? [event.vendorCode, event.vendorName].filter(Boolean).join(" · ")
        : [event.machineCode, event.machineName].filter(Boolean).join(" · ");
      const time = [event.startTime, event.endTime].filter(Boolean).join("–");
      const detail = [event.processName, event.planNumber ? `MPP ${event.planNumber}` : null, resource, vendorEvent && event.vendorLeadTimeDays != null ? `LT vendor ${num(event.vendorLeadTimeDays)} hari` : null, time, event.completionDate && event.completionDate !== event.date ? `Kembali ${event.completionDate}` : null]
        .filter(Boolean).join(" · ");
      const eventClass = event.type === "DELIVERY" ? "delivery" : event.type === "VENDOR_RETURN" ? "vendor-return" : event.routingMode === "VENDOR" ? "vendor-send" : "process";
      const eventLabel = event.routingMode === "VENDOR" ? `SEND ${event.processCode || "VENDOR"}` : event.processCode || event.type || "PROCESS";
      return `<button type="button" class="mpp-timeline-event ${eventClass}" data-mpp-popover aria-expanded="false">
        <span class="mpp-timeline-event-main"><b>${esc(eventLabel)}</b><strong>${num(event.qty)} ${esc(event.uomCode || phase.uomCode || "PCS")}</strong></span>
        <span class="mpp-timeline-popover" role="tooltip">
          <small>Aktivitas</small><b>${esc(detail || event.processName || event.processCode || "-")}</b>
          <small>Part Number</small><b>${esc(part.partNumber || "-")}</b>
          <small>Part Code</small><b>${esc(part.partCode || "-")}</b>
          <small>Part Name</small><b>${esc(part.partName || "-")}</b>
        </span>
      </button>`;
    };
    const body = phases.map((phase) => {
      const source = sourceMeta(phase);
      const fg = phase.fgParent || {};
      const eventsByDate = new Map();
      (phase.events || []).forEach((event) => {
        if (!event?.date) return;
        if (!eventsByDate.has(event.date)) eventsByDate.set(event.date, []);
        eventsByDate.get(event.date).push(event);
      });
      const processEventCount = (phase.events || []).filter((event) => event.type === "PROCESS").length;
      const deliveryJit = timeline.schedulePolicy === "DELIVERY_JIT";
      const healthLabel = phase.scheduleHealth === "EARLY"
        ? `${num(phase.startVarianceDays, 0)} hari terlalu awal`
        : phase.scheduleHealth === "LATE"
          ? `${num(Math.abs(number(phase.startVarianceDays)), 0)} hari terlambat mulai`
          : phase.scheduleHealth === "ON_TARGET"
            ? deliveryJit ? "JIT · dekat kebutuhan" : "Start sesuai MRP"
            : "Belum dijadwalkan";
      return `<tr class="mpp-phase-health-${esc(String(phase.scheduleHealth || "unknown").toLowerCase())}">
        <td class="mpp-phase-source">
          <b>Delivery phase ${num(phase.phaseNumber, 0)}</b>
          ${source.href ? `<a href="${esc(source.href)}">${esc(source.label)} · ${esc(phase.sourceNumber || timeline.sourceMpsNumber || "-")}</a>` : `<span>${esc(source.label)} · ${esc(phase.sourceNumber || timeline.sourceMpsNumber || "-")}</span>`}
          <small>${esc(phase.customerCode || "Customer belum ditentukan")} · ${processEventCount ? `${num(processEventCount, 0)} proses terjadwal` : "belum ada alokasi proses"}</small>
          <em class="mpp-phase-health-badge">${esc(healthLabel)}</em>
          ${phase.unscheduledReason ? `<small class="mpp-phase-unscheduled-reason">${esc(phase.unscheduledReason)}</small>` : ""}
        </td>
        <td class="mpp-phase-parent">
          <button type="button" class="mpp-timeline-part" data-mpp-popover aria-expanded="false">
            <b>${esc(fg.partNumber || fg.partCode || "FG Parent")}</b>
            <span>${num(phase.qty)} ${esc(phase.uomCode || "PCS")} · ${deliveryJit ? "acuan awal MRP" : "start MRP"} ${esc(phase.recommendedStartDate || "-")}</span>
            ${partDetail(fg, "Nama FG belum tersedia")}
          </button>
        </td>
        ${dates.map((date) => {
          const events = eventsByDate.get(date) || [];
          return `<td class="${events.length ? "mpp-phase-has-event" : "mpp-phase-empty"}">${events.length ? `<div class="mpp-timeline-event-stack">${events.map((event) => eventButton(event, phase)).join("")}</div>` : "<span>–</span>"}</td>`;
        }).join("")}
      </tr>`;
    }).join("");
    return `<section class="ops-detail-card mpp-phase-timeline-card">
      <div class="ops-collection-head"><div><h2>Timeline Delivery Phase & Proses · ${esc(timeline.planNumber || record.planNumber || "Production Plan ini")}</h2><p>Timeline mengikuti satu demand-phase horizon. Tanggal proses dan delivery boleh melintasi bulan; plan carry-over hanya menampilkan referensi ke owner agar kebutuhan tidak dihitung dua kali. ${timeline.schedulePolicy === "DELIVERY_JIT" ? `Jadwal ditarik mundur dari delivery atau proses penerus, dengan buffer dasar ${num(timeline.jitSafetyDays, 0)} hari.` : ""} Arahkan kursor atau klik FG/proses untuk melihat detail part.</p></div><span>${num(earlyCount, 0)} terlalu awal · ${num(unscheduledCount, 0)} belum terjadwal</span></div>
      <div class="mpp-phase-legend"><span><i class="process"></i>Proses produksi</span><span><i class="vendor-send"></i>Kirim vendor</span><span><i class="vendor-return"></i>Kembali vendor</span><span><i class="delivery"></i>Delivery customer</span><em>Tanggal mengikuti jadwal kapasitas aktif, bukan tanggal contoh Excel.</em></div>
      <div class="table-responsive mpp-phase-timeline-wrap"><table class="table mpp-phase-timeline-table" data-enterprise-table="off">
        <thead><tr><th>PO / FCT</th><th>FG Parent</th>${dates.map((date) => `<th>${dateLabel(date)}</th>`).join("")}</tr></thead>
        <tbody>${body || `<tr><td colspan="${2 + dates.length}" class="text-center py-4">Delivery phase belum tersedia. Bentuk phase di MPS lalu jalankan Capacity Recommendation.</td></tr>`}</tbody>
      </table></div>
    </section>`;
  }
  function monthlyPlanDetailsCard(record) {
    const rows = Array.isArray(record.details) ? record.details : [];
    const dateKey = (row) => String(row.fgRequiredDate || row.requiredDate || "").slice(0, 10);
    const dates = [...new Set(rows.map(dateKey).filter(Boolean))].sort();
    const dateValue = (value) => {
      const key = String(value || "").slice(0, 10);
      const parsed = new Date(`${key}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const shortDate = (value) => {
      const parsed = value instanceof Date ? value : dateValue(value);
      return parsed ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(parsed) : "-";
    };
    const fullDate = (value) => {
      const parsed = value instanceof Date ? value : dateValue(value);
      return parsed ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(parsed) : "-";
    };
    const dateMeta = new Map(dates.map((key) => {
      const dueDate = dateValue(key);
      const matchingRows = rows.filter((row) => dateKey(row) === key);
      const starts = matchingRows.map((row) => dateValue(row.latestStartDate || row.requiredDate || record.periodStart)).filter(Boolean);
      const estimatedStart = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : dateValue(record.periodStart);
      const leadTimeDays = dueDate && estimatedStart
        ? Math.max(Math.ceil((dueDate.getTime() - estimatedStart.getTime()) / 86400000), 0)
        : null;
      return [key, { dueDate, estimatedStart, leadTimeDays }];
    }));
    const estimatedStarts = [...dateMeta.values()].map((meta) => meta.estimatedStart).filter(Boolean);
    const leadTimes = [...dateMeta.values()].map((meta) => meta.leadTimeDays).filter((value) => value != null);
    const overallStart = estimatedStarts.length ? new Date(Math.min(...estimatedStarts.map((date) => date.getTime()))) : dateValue(record.periodStart);
    const requiredStart = dates.length ? dateMeta.get(dates[0])?.dueDate : null;
    const requiredEnd = dates.length ? dateMeta.get(dates[dates.length - 1])?.dueDate : null;
    const leadTimeLabel = leadTimes.length
      ? `${Math.min(...leadTimes)}${Math.min(...leadTimes) === Math.max(...leadTimes) ? "" : `–${Math.max(...leadTimes)}`} hari kalender`
      : "-";
    const groups = new Map();
    const matrixRows = [];
    const ensureCell = (cells, key) => {
      if (!cells.has(key)) cells.set(key, { date: key, mpsQty: 0, stockCover: 0, effectiveQty: 0 });
      return cells.get(key);
    };
    const addDemand = (target, row) => {
      const key = dateKey(row);
      if (!key) return;
      const cell = ensureCell(target.cells, key);
      cell.mpsQty += Math.max(number(row.phaseDemandQty ?? row.qtyPlanned), 0);
      target.stockAvailable = Math.max(target.stockAvailable, number(row.stock?.qtyAvailable));
      target.uomCode = target.uomCode || row.uomCode || "PCS";
    };
    rows.forEach((row) => {
      const parentCode = row.parentFgPartCode || (row.lineType === "FG Receipt" ? row.partCode : "TANPA-FG");
      if (!groups.has(parentCode)) {
        groups.set(parentCode, {
          parentCode,
          parentName: row.parentFgPartName || parentCode,
          parentPart: null,
          parentCells: new Map(),
          parentStockAvailable: 0,
          parentUomCode: "PCS",
          parts: new Map(),
        });
      }
      const group = groups.get(parentCode);
      const isParentReceipt = row.lineType === "FG Receipt" && row.partCode === parentCode;
      if (isParentReceipt) {
        group.parentPart = row.part || group.parentPart;
        addDemand({
          cells: group.parentCells,
          get stockAvailable() { return group.parentStockAvailable; },
          set stockAvailable(value) { group.parentStockAvailable = value; },
          get uomCode() { return group.parentUomCode; },
          set uomCode(value) { group.parentUomCode = value; },
        }, row);
        return;
      }
      const partCode = row.part?.partCode || row.partCode || "-";
      if (!group.parts.has(partCode)) {
        group.parts.set(partCode, {
          partCode,
          partNumber: row.part?.partNumber || "-",
          partName: row.part?.partName || row.displayName || "-",
          href: (row.referenceLinks || []).find((reference) => reference.type === "PART")?.href || null,
          lineType: row.lineType || "Plan Line",
          cells: new Map(),
          stockAvailable: 0,
          uomCode: row.uomCode || "PCS",
        });
      }
      addDemand(group.parts.get(partCode), row);
    });

    for (const group of groups.values()) {
      const parentRow = {
        kind: "parent",
        group,
        partCode: group.parentCode,
        partNumber: group.parentPart?.partNumber || "-",
        partName: group.parentPart?.partName || group.parentName || group.parentCode,
        cells: group.parentCells,
        stockAvailable: group.parentStockAvailable,
        uomCode: group.parentUomCode,
      };
      matrixRows.push(parentRow, ...[...group.parts.values()].sort((left, right) => {
        const typeRank = (value) => value === "Child FG Receipt" ? 0 : value === "Production Process" ? 1 : 2;
        return typeRank(left.lineType) - typeRank(right.lineType)
          || String(left.partNumber).localeCompare(String(right.partNumber), "id")
          || String(left.partCode).localeCompare(String(right.partCode), "id");
      }).map((part) => ({ ...part, kind: "part", group })));
    }

    const rowsByPart = new Map();
    matrixRows.forEach((row) => {
      if (!rowsByPart.has(row.partCode)) rowsByPart.set(row.partCode, []);
      rowsByPart.get(row.partCode).push(row);
    });
    for (const partRows of rowsByPart.values()) {
      let remainingStock = Math.max(...partRows.map((row) => number(row.stockAvailable)), 0);
      const datedCells = partRows.flatMap((row) => [...row.cells.values()].map((cell) => ({ row, cell })))
        .sort((left, right) => left.cell.date.localeCompare(right.cell.date));
      datedCells.forEach(({ cell }) => {
        cell.stockCover = Math.min(remainingStock, cell.mpsQty);
        cell.effectiveQty = Math.max(cell.mpsQty - cell.stockCover, 0);
        remainingStock = Math.max(remainingStock - cell.stockCover, 0);
      });
    }

    const dateHeading = (key) => {
      const parsed = new Date(`${key}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return esc(key);
      const meta = dateMeta.get(key) || {};
      return `<small>${esc(new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(parsed))}</small>
        <b>${esc(new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(parsed))}</b>
        <span>Start ${esc(shortDate(meta.estimatedStart))}</span>
        <em>LT ${meta.leadTimeDays == null ? "-" : `${num(meta.leadTimeDays, 0)} hari`}</em>`;
    };
    const metricCell = (cell, uomCode) => cell
      ? `<div class="mpp-matrix-cell">
          <span><small>Qty MPS</small><b>${num(cell.mpsQty)}</b></span>
          <span class="stock"><small>Stock</small><b>${num(cell.stockCover)}</b></span>
          <span class="effective"><small>EFF</small><b>${num(cell.effectiveQty)}</b></span>
          <em>${esc(uomCode || "PCS")}</em>
        </div>`
      : '<span class="mpp-matrix-empty">-</span>';
    const childRowCount = matrixRows.filter((row) => row.lineType === "Child FG Receipt").length;
    const processRowCount = matrixRows.filter((row) => row.kind !== "parent" && row.lineType !== "Child FG Receipt").length;
    const savedMatrixLevel = ["parent", "receipts", "full"].includes(localStorage.getItem(`mpp-matrix-level:${record.planNumber || config.recordKey}`))
      ? localStorage.getItem(`mpp-matrix-level:${record.planNumber || config.recordKey}`)
      : "receipts";
    const body = matrixRows.map((row) => {
      const isParent = row.kind === "parent";
      const rowLevel = isParent ? "parent" : row.lineType === "Child FG Receipt" ? "child" : "process";
      const parentLabel = isParent
        ? `<b>${esc(row.group.parentCode)}</b><span>${esc(row.partName)}</span>`
        : '<span class="mpp-tree-branch">└</span>';
      const codeContent = row.href
        ? `<a href="${esc(row.href)}"><b>${esc(row.partCode)}</b><span>${esc(row.partName)}</span></a>`
        : `<b>${esc(row.partCode)}</b><span>${esc(row.partName)}</span>`;
      return `<tr class="${isParent ? "mpp-matrix-parent" : "mpp-matrix-part"}" data-mpp-row-level="${rowLevel}" data-mpp-parent="${esc(row.group.parentCode)}">
        <td class="mpp-matrix-fg">${parentLabel}</td>
        <td class="mpp-matrix-number">${isParent ? `<b>${esc(row.partNumber || "-")}</b><small><span class="mpp-parent-label">FG Parent</span></small>` : `<b>${esc(row.partNumber || "-")}</b><small>${esc(row.lineType || "Part")}</small>`}</td>
        <td class="mpp-matrix-code">${codeContent}</td>
        ${dates.map((key) => `<td>${metricCell(row.cells.get(key), row.uomCode)}</td>`).join("")}
      </tr>`;
    }).join("");
    return `${monthlyPlanGanttCard(record)}<details class="mpp-gantt-audit"><summary><span><b>Tabel matriks mingguan</b><small>Buka tampilan tabel lama untuk audit REQ, stock, EFF, dan penempatan per minggu.</small></span><i>Lihat tabel</i></summary>${monthlyPlanWeeklyMatrixCard(record)}</details><details class="mpp-daily-detail"><summary><span><b>Detail timeline per tanggal</b><small>Buka untuk audit tanggal persis setiap proses, vendor return, dan delivery.</small></span><i>Lihat detail harian</i></summary>${monthlyPlanPhaseTimelineCard(record)}</details><section class="ops-detail-card mpp-lines-card">
      <div class="ops-collection-head"><div><h2>Detail Kalkulasi Required FG</h2><p>Matriks pendukung per tanggal Required FG. Stock dialokasikan FIFO ke kebutuhan terawal; EFF adalah Qty MPS setelah stock cover.</p></div><span>${num(groups.size, 0)} FG · ${num(dates.length, 0)} tanggal</span></div>
      <div class="mpp-timing-summary">
        <div><small>Production Horizon</small><b>${esc(fullDate(record.planningIdentity?.horizonStart || record.periodStart))} – ${esc(fullDate(record.planningIdentity?.horizonEnd || record.schedulingHorizonEnd || record.periodEnd))}</b><span>Rentang aktual lintas bulan</span></div>
        <div class="start"><small>Estimated Production Start</small><b>${esc(fullDate(overallStart))}</b><span>Start paling awal dari MRP</span></div>
        <div class="required"><small>Rentang Required FG</small><b>${esc(shortDate(requiredStart))} – ${esc(fullDate(requiredEnd))}</b><span>Target FG siap / delivery</span></div>
        <div class="lead"><small>Lead Time Produksi</small><b>${esc(leadTimeLabel)}</b><span>Dihitung per target Required FG</span></div>
      </div>
      <div class="mpp-matrix-legend"><div><span><i class="mps"></i>Qty MPS</span><span><i class="stock"></i>Stock cover</span><span><i class="effective"></i>EFF / kebutuhan bersih</span></div><div class="mpp-hierarchy-switch" role="group" aria-label="Level detail MPP"><button type="button" data-mpp-matrix-level="parent" class="${savedMatrixLevel === "parent" ? "active" : ""}">FG Parent</button><button type="button" data-mpp-matrix-level="receipts" class="${savedMatrixLevel === "receipts" ? "active" : ""}">+ ${num(childRowCount, 0)} Child FG</button><button type="button" data-mpp-matrix-level="full" class="${savedMatrixLevel === "full" ? "active" : ""}">Full + ${num(processRowCount, 0)} Process</button></div></div>
      <div class="table-responsive mpp-matrix-wrap"><table class="table ops-collection-table mpp-lines-table mpp-matrix-table" data-enterprise-table="off" data-mpp-visible-level="${savedMatrixLevel}">
        <thead><tr><th>FG Parent</th><th>Part No.</th><th>Part Code</th>${dates.map((key) => `<th class="mpp-matrix-date">${dateHeading(key)}</th>`).join("")}</tr></thead>
        <tbody>${body || `<tr><td colspan="${3 + dates.length}" class="text-center py-4">Belum ada detail Production Plan.</td></tr>`}</tbody>
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
  function monthlyPlanRoutingTablesCard(record) {
    const timeline = record.deliveryPhaseTimeline || {};
    const rows = [];
    const seen = new Set();
    const addRow = (row) => {
      const key = row.id || [row.routingMode, row.lineNumber, row.phaseNumber, row.partCode, row.processCode, row.start, row.finish, row.qty, row.queueState].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    };
    for (const phase of timeline.phases || []) {
      for (const event of phase.events || []) {
        if (String(event.type || "").toUpperCase() !== "PROCESS") continue;
        for (const allocation of event.allocations || []) {
          const routingMode = String(allocation.routingMode || event.routingMode || "INHOUSE").toUpperCase() === "VENDOR" ? "VENDOR" : "INHOUSE";
          const part = allocation.part || event.part || phase.fgParent || {};
          addRow({
            id: allocation.id || null,
            routingMode,
            phaseNumber: phase.phaseNumber,
            sourceNumber: phase.sourceNumber || timeline.sourceMpsNumber,
            lineNumber: allocation.lineNumber || event.lineNumber || null,
            partCode: part.partCode || "-",
            partNumber: part.partNumber || "-",
            partName: part.partName || "-",
            processCode: allocation.processCode || event.processCode || "PROCESS",
            processName: allocation.processName || event.processName || "-",
            resourceCode: routingMode === "VENDOR" ? allocation.vendorCode || event.vendorCode : allocation.machineCode || event.machineCode,
            resourceName: routingMode === "VENDOR" ? allocation.vendorName || event.vendorName : allocation.machineName || event.machineName,
            qty: number(allocation.plannedQty ?? event.qty),
            uomCode: allocation.uomCode || event.uomCode || phase.uomCode || "PCS",
            start: allocation.vendorSendDate || allocation.scheduleDate || event.date,
            finish: allocation.vendorReturnDate || event.completionDate || allocation.scheduleDate || event.date,
            capacityMode: allocation.capacityMode || "NORMAL",
            status: allocation.status || event.status || "Draft",
            queueState: "SCHEDULED",
          });
        }
      }
    }
    // Vendor suggestions are part of the same Monthly Planning owner even
    // before a vendor allocation has been manually confirmed.
    for (const assignment of record.capacityVendorAssignments || []) {
      const alreadyScheduled = rows.some((row) => (
        row.routingMode === "VENDOR"
        && row.partCode === assignment.partCode
        && row.processCode === assignment.processCode
        && String(row.start || "").slice(0, 10) === String(assignment.sendDate || assignment.scheduleDate || "").slice(0, 10)
        && String(row.finish || "").slice(0, 10) === String(assignment.returnDate || assignment.requiredDate || "").slice(0, 10)
        && Math.abs(number(row.qty) - number(assignment.qty)) < .000001
      ));
      if (alreadyScheduled) continue;
      addRow({
        routingMode: "VENDOR",
        lineNumber: assignment.lineNumber,
        partCode: assignment.partCode || "-",
        partNumber: "-",
        partName: "Vendor process",
        processCode: assignment.processCode || "VENDOR",
        processName: assignment.processName || "Outsource process",
        resourceCode: assignment.vendorCode || null,
        resourceName: assignment.vendorName || null,
        qty: number(assignment.qty),
        uomCode: assignment.uomCode || "PCS",
        start: assignment.sendDate || assignment.scheduleDate,
        finish: assignment.returnDate || assignment.requiredDate,
        capacityMode: "VENDOR_LEAD_TIME",
        status: assignment.status || "PROPOSED",
        queueState: assignment.vendorId ? "SCHEDULED" : "UNRESOLVED",
      });
    }
    const catalog = record.capacityManualAllocationCatalog || [];
    for (const item of record.capacityUnscheduled || []) {
      const route = catalog.find((candidate) => (
        number(candidate.lineNumber) === number(item.lineNumber)
        && (candidate.mbomProcessId === item.mbomProcessId || candidate.processCode === item.processCode)
      ));
      const routingMode = String(route?.routingMode || "INHOUSE").toUpperCase() === "VENDOR" ? "VENDOR" : "INHOUSE";
      const overload = String(item.reason || "").toLowerCase().includes("kapasitas horizon");
      addRow({
        routingMode,
        lineNumber: item.lineNumber,
        partCode: item.partCode || "-",
        partNumber: "-",
        partName: overload ? "Sisa beban bulan ini" : "Belum dialokasikan",
        processCode: item.processCode || route?.processCode || "PROCESS",
        processName: route?.processName || item.reason || "Belum dialokasikan",
        resourceCode: routingMode === "VENDOR" ? route?.vendorCode : item.machineCode,
        resourceName: routingMode === "VENDOR" ? "Vendor belum dipilih" : "Resource bulan owner",
        qty: number(item.qty || route?.remainingQty),
        uomCode: item.uomCode || route?.uomCode || "PCS",
        start: route?.recommendedSendDate || route?.requiredDate || null,
        finish: route?.recommendedReturnDate || route?.requiredDate || null,
        capacityMode: overload ? "OVERLOAD_STACK" : "UNRESOLVED",
        status: overload ? "Over capacity" : item.reason || "Belum dialokasikan",
        queueState: overload ? "OVERLOAD_QUEUED" : "UNRESOLVED",
        minutes: number(item.minutes),
      });
    }
    const ownerMonth = record.monthlyPlanningPolicy?.ownerMonth || String(record.planMonth || record.periodStart || "").slice(0, 7);
    const table = (routingMode, title, eyebrow) => {
      const modeRows = rows.filter((row) => row.routingMode === routingMode)
        .sort((left, right) => Number(left.queueState !== "OVERLOAD_QUEUED") - Number(right.queueState !== "OVERLOAD_QUEUED") || String(left.start || "9999").localeCompare(String(right.start || "9999")));
      const queued = modeRows.filter((row) => row.queueState !== "SCHEDULED").length;
      const body = modeRows.map((row, index) => {
        const queuedRow = row.queueState !== "SCHEDULED";
        const timing = routingMode === "VENDOR"
          ? `<b>${esc(format(row.start, "date"))}</b><small>Return ${esc(format(row.finish, "date"))}</small>`
          : `<b>${esc(format(row.start, "date"))}</b><small>${row.minutes ? `${num(row.minutes / 60)} jam belum tertampung` : esc(row.capacityMode || "NORMAL")}</small>`;
        const resourceFallback = routingMode === "VENDOR" ? "Vendor belum dipilih" : "Mesin belum dialokasikan";
        return `<tr class="${queuedRow ? "is-queued" : ""}"><td><span class="mpp-queue-number">${queuedRow ? `Q${index + 1}` : "✓"}</span></td><td><b>Phase ${num(row.phaseNumber || 0,0)} · ${esc(row.partNumber || row.partCode)}</b><small>${esc(row.partCode)} · ${esc(row.partName)}</small></td><td><span class="mpp-process-code">${esc(row.processCode)}</span><small>${esc(row.processName)}</small></td><td><b>${esc(row.resourceCode || resourceFallback)}</b><small>${esc(row.resourceName || (routingMode === "VENDOR" ? "Outsource" : "Internal"))}</small></td><td class="ops-number"><b>${num(row.qty)}</b><small>${esc(row.uomCode)}</small></td><td>${timing}</td><td><span class="mpp-route-state ${queuedRow ? "queued" : "scheduled"}">${esc(row.queueState === "OVERLOAD_QUEUED" ? "Overload · antrean bulan ini" : row.queueState === "UNRESOLVED" ? "Perlu alokasi" : row.status)}</span>${row.capacityMode === "OVERLOAD_STACK" ? `<small>Tidak dipindah otomatis ke M+1</small>` : ""}</td><td>${row.id && timeline.editable ? `<button type="button" class="mpp-routing-edit" data-mpp-edit-placement="${esc(row.id)}" title="Edit allocation" aria-label="Edit allocation">✎</button>` : "–"}</td></tr>`;
      }).join("");
      return `<article class="mpp-routing-card ${routingMode.toLowerCase()}" data-mpp-routing-table="${routingMode}"><header><div><span>${esc(eyebrow)}</span><h3>${esc(title)}</h3><p>${routingMode === "INHOUSE" ? "Mesin, shift, dan beban internal." : "Vendor send, target return, dan lead time outsource."}</p></div><div><b>${num(modeRows.length,0)}</b><small>operasi</small><em>${num(queued,0)} antrean</em></div></header><div class="table-responsive"><table class="table mpp-routing-table" data-enterprise-table="off"><thead><tr><th>Queue</th><th>Phase / Output</th><th>Process</th><th>${routingMode === "VENDOR" ? "Vendor" : "Resource"}</th><th>Qty</th><th>${routingMode === "VENDOR" ? "Send / Return" : "Target / Load"}</th><th>Status</th><th></th></tr></thead><tbody>${body || `<tr><td colspan="8" class="mpp-routing-empty">Belum ada operasi ${routingMode} pada Monthly Planning ini.</td></tr>`}</tbody></table></div></article>`;
    };
    return `<section class="mpp-routing-tables"><header><div><span>MONTHLY OPERATION ALLOCATION</span><h2>INHOUSE & Vendor Plan</h2><p>Satu owner month, dua tabel eksekusi. Overload tetap ditumpuk sebagai antrean untuk ditangani admin.</p></div><span class="mpp-owner-month">Owner ${esc(ownerMonth || "-")} · no auto offset</span></header><div>${table("INHOUSE", "Inhouse Production", "INTERNAL")}${table("VENDOR", "Vendor Production", "OUTSOURCE")}</div></section>`;
  }
  function monthlyPlanDeliveryBoardCard(record) {
    const timeline = record.deliveryPhaseTimeline || {};
    const phases = Array.isArray(timeline.phases) ? timeline.phases : [];
    const details = Array.isArray(record.details) ? record.details : [];
    const iso = (value) => String(value || "").slice(0, 10);
    const phaseRows = phases.map((phase, phaseIndex) => {
      const fg = phase.fgParent || {};
      const dueKey = iso(phase.fgRequiredDate || phase.deliveryDate);
      const receipt = details.find((row) => row.lineType === "FG Receipt" && row.partCode === fg.partCode && iso(row.fgRequiredDate || row.requiredDate) === dueKey)
        || details.find((row) => row.lineType === "FG Receipt" && row.partCode === fg.partCode);
      const netProduction = number(receipt?.qtyPlanned ?? phase.qty);
      const stockCover = Math.max(number(phase.qty) - netProduction, 0);
      const processEvents = (phase.events || []).filter((event) => event.type === "PROCESS");
      const childEvents = processEvents.filter((event) => {
        const type = String(event.part?.rawType || event.part?.itemType || "").toUpperCase();
        return !type || type === "WIP" || type === "FG" || type === "FINISHED_GOOD" || type === "SEMI_FINISHED";
      });
      const events = childEvents.length ? childEvents : processEvents;
      const statusTone = phase.scheduleHealth === "ON_TARGET" ? "ready" : phase.scheduleHealth === "UNSCHEDULED" || phase.scheduleHealth === "LATE" ? "blocked" : "warning";
      const statusLabel = phase.scheduleHealth === "ON_TARGET" ? "On target" : phase.scheduleHealth === "UNSCHEDULED" ? "Belum dijadwalkan" : phase.scheduleHealth === "LATE" ? "Terlambat" : phase.scheduleHealth === "EARLY" ? "Terlalu awal" : phase.scheduleHealth || "Review";
      const materialLabel = record.materialReadiness?.ready ? "Ready" : `${num(record.materialReadiness?.summary?.blocking, 0)} blocker`;
      const eventRows = events.map((event, index) => {
        const allocations = Array.isArray(event.allocations) && event.allocations.length ? event.allocations : [null];
        return allocations.map((allocation, allocationIndex) => {
          const part = allocation?.part || event.part || {};
          const vendor = String(allocation?.routingMode || event.routingMode || "").toUpperCase() === "VENDOR";
          const resourceCode = vendor ? allocation?.vendorCode || event.vendorCode : allocation?.machineCode || event.machineCode;
          const resourceName = vendor ? allocation?.vendorName || event.vendorName : allocation?.machineName || event.machineName;
          const start = allocation?.vendorSendDate || allocation?.scheduleDate || event.date;
          const finish = allocation?.vendorReturnDate || event.completionDate || allocation?.scheduleDate || event.date;
          const qty = number(allocation?.plannedQty ?? event.qty);
          return `<tr><td><span class="mpp-board-tree">${index === events.length - 1 && allocationIndex === allocations.length - 1 ? "└" : "├"}</span><b>${esc(part.partNumber || part.partCode || "WIP")}</b><small>${esc(part.partCode || "-")} · ${esc(part.partName || "")}</small></td><td><span class="mpp-process-code">${esc(allocation?.processCode || event.processCode || "PROCESS")}</span><small>${esc(allocation?.processName || event.processName || "")}</small></td><td><b>${esc(resourceCode || (vendor ? "Vendor belum dipilih" : "Mesin belum dipilih"))}</b><small>${esc(resourceName || (vendor ? "Outsource" : "Internal"))}</small></td><td class="ops-number"><b>${num(qty)}</b><small>${esc(allocation?.uomCode || event.uomCode || phase.uomCode || "PCS")}</small></td><td><b>${esc(format(start, "date"))}</b><small>${esc(allocation?.shift ? `Shift ${allocation.shift}` : vendor ? "Vendor send" : "Belum ada shift")}</small></td><td><b>${esc(format(finish, "date"))}</b><small>${vendor && event.vendorLeadTimeDays != null ? `${num(event.vendorLeadTimeDays,0)} hari vendor` : esc(allocation?.plannedStartTime && allocation?.plannedEndTime ? `${allocation.plannedStartTime}–${allocation.plannedEndTime}` : "")}</small></td><td>${badge(allocation?.status || event.status || "Draft")}</td></tr>`;
        }).join("");
      }).join("");
      return `<details class="mpp-phase-board-row" ${phaseIndex === 0 ? "open" : ""}>
        <summary><span class="mpp-phase-toggle" aria-hidden="true"></span><span><small>${esc(String(phase.sourceType || "MPS").toUpperCase())} · ${esc(phase.sourceNumber || timeline.sourceMpsNumber || "-")}</small><b>Phase ${num(phase.phaseNumber,0)} · ${esc(fg.partNumber || fg.partCode || "FG")}</b><em>${esc(fg.partCode || "-")} · ${esc(phase.customerCode || "Buffer / internal")}</em></span><span><small>FG Due</small><b>${esc(format(phase.fgRequiredDate || phase.deliveryDate, "date"))}</b><em>Delivery ${esc(format(phase.deliveryDate, "date"))}</em></span><span class="ops-number"><small>Demand / Stock</small><b>${num(phase.qty)} / ${num(stockCover)}</b><em>${esc(phase.uomCode || "PCS")}</em></span><span class="ops-number mpp-board-net"><small>Net Production</small><b>${num(netProduction)}</b><em>MRP authoritative</em></span><span><small>MRP Release</small><b>${esc(format(phase.recommendedStartDate, "date"))}</b><em>${num(events.length,0)} process line · backward schedule</em></span><span><small>Material</small><b>${esc(materialLabel)}</b><em>${record.materialReadiness?.ready ? "Supply tersedia" : "Buka tab Material"}</em></span><span>${badge(statusLabel, statusTone)}</span></summary>
        <div class="mpp-phase-board-detail"><div class="mpp-phase-trace"><span>MPP line <b>${esc(receipt?.lineNumber || "-")}</b></span><span>MRP requirement <b>${esc(receipt?.mrpRequirementId || "Legacy / belum ditautkan")}</b></span><span>Root trace <b>${esc(receipt?.mrpRootRequirementId || "-")}</b></span>${phase.unscheduledReason ? `<span class="risk">${esc(phase.unscheduledReason)}</span>` : ""}</div><div class="table-responsive"><table class="table mpp-phase-process-table" data-enterprise-table="off"><thead><tr><th>WIP / FG Output</th><th>Process</th><th>Resource / Vendor</th><th>Qty</th><th>Start</th><th>Finish</th><th>Status</th></tr></thead><tbody>${eventRows || '<tr><td colspan="7" class="text-center py-4">Belum ada capacity allocation. Jalankan Capacity Check untuk membentuk jadwal proses.</td></tr>'}</tbody></table></div></div>
      </details>`;
    }).join("");
    return `<section class="mpp-delivery-board"><header><div><span>DELIVERY PHASE BOARD</span><h2>Production Plan per delivery phase</h2><p>Qty berasal dari net production MRP. Buka phase untuk melihat WIP/FG, process code, resource, dan jadwalnya.</p></div><div class="mpp-board-legend"><span class="ready">On target</span><span class="warning">Review</span><span class="blocked">Blocked</span></div></header><div class="mpp-phase-board-head"><span>Demand / FG</span><span>FG Due</span><span>Demand / Stock</span><span>Net Production</span><span>MRP Release</span><span>Material</span><span>Status</span></div><div class="mpp-phase-board-list">${phaseRows || '<div class="mpp-board-empty">Delivery phase belum tersedia. Sinkronkan kembali dari MRP current.</div>'}</div></section>`;
  }
  function monthlyPlanAuditCard(record) {
    return `<details class="mpp-audit-disclosure"><summary><span><b>Matriks mingguan</b><small>Audit penempatan lintas minggu dan carry-over.</small></span><i>Buka</i></summary>${monthlyPlanWeeklyMatrixCard(record)}</details><details class="mpp-audit-disclosure"><summary><span><b>Timeline harian</b><small>Audit tanggal persis process, vendor return, dan delivery.</small></span><i>Buka</i></summary>${monthlyPlanPhaseTimelineCard(record)}</details>`;
  }
  function applyMppWorkbenchTab(tab) {
    const target = ["plan", "capacity", "material", "exception", "audit"].includes(tab) ? tab : "plan";
    document.querySelectorAll("[data-mpp-business-tab]").forEach((button) => { const active = button.dataset.mppBusinessTab === target; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-mpp-business-panel]").forEach((panel) => { panel.hidden = panel.dataset.mppBusinessPanel !== target; });
    localStorage.setItem(`mpp-business-tab:${currentRecord?.planNumber || config.recordKey}`, target);
    if (target === "capacity" && currentRecord) requestAnimationFrame(() => renderMppGantt(currentRecord));
    if (target === "audit") requestAnimationFrame(() => applyMppWeekView());
  }
  function renderMonthlyPlanCollections(record) {
    const savedTab = localStorage.getItem(`mpp-business-tab:${record.planNumber || config.recordKey}`) || "plan";
    $("ops-detail-collections").innerHTML = `<section class="mpp-business-workbench"><nav class="mpp-business-tabs" role="tablist" aria-label="Production Plan workbench"><button type="button" data-mpp-business-tab="plan">Plan</button><button type="button" data-mpp-business-tab="capacity">Capacity</button><button type="button" data-mpp-business-tab="material">Material Readiness</button><button type="button" data-mpp-business-tab="exception">Exception <span>${num(record.planReadiness?.issues?.length,0)}</span></button><button type="button" data-mpp-business-tab="audit">Audit</button></nav><div class="mpp-business-panel" data-mpp-business-panel="plan">${monthlyPlanSourceIntegrityCard(record)}${monthlyPlanRoutingTablesCard(record)}${monthlyPlanDeliveryBoardCard(record)}</div><div class="mpp-business-panel" data-mpp-business-panel="capacity">${monthlyPlanGanttCard(record)}</div><div class="mpp-business-panel" data-mpp-business-panel="material">${monthlyPlanMaterialCard(record)}</div><div class="mpp-business-panel" data-mpp-business-panel="exception">${monthlyPlanReadinessCard(record)}</div><div class="mpp-business-panel" data-mpp-business-panel="audit">${monthlyPlanAuditCard(record)}</div></section>`;
    applyMppWorkbenchTab(savedTab);
    document.querySelectorAll("[data-mpp-edit-placement]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) openMppPlacementEditor(button.dataset.mppEditPlacement);
    }));
  }
  function applyMppWeekView(spanValue, movement = 0) {
    const card = document.querySelector(".mpp-weekly-card");
    if (!card) return;
    const count = Math.max(number(card.dataset.mppWeekCount), 1);
    const span = ["all", "1", "2", "3"].includes(String(spanValue || "")) ? String(spanValue) : card.dataset.mppWeekSpan || "all";
    const visibleCount = span === "all" ? count : Math.min(number(span), count);
    let start = span === "all" ? 0 : Math.max(number(card.dataset.mppWeekStart), 0);
    start = Math.min(Math.max(start + movement * visibleCount, 0), Math.max(count - visibleCount, 0));
    card.dataset.mppWeekSpan = span;
    card.dataset.mppWeekStart = String(start);
    card.querySelectorAll("table [data-mpp-week-column]").forEach((cell) => {
      const index = number(cell.dataset.mppWeekColumn);
      cell.hidden = index < start || index >= start + visibleCount;
    });
    card.querySelectorAll("button[data-mpp-week-span]").forEach((button) => button.classList.toggle("active", button.dataset.mppWeekSpan === span));
    const labelElement = card.querySelector("[data-mpp-week-range]");
    if (labelElement) labelElement.textContent = span === "all" ? "Semua minggu" : `W${start + 1}${visibleCount > 1 ? `–W${start + visibleCount}` : ""}`;
    card.querySelectorAll("[data-mpp-week-nav]").forEach((button) => {
      button.disabled = span === "all" || (button.dataset.mppWeekNav === "prev" ? start === 0 : start + visibleCount >= count);
    });
    localStorage.setItem(`mpp-week-span:${currentRecord?.planNumber || config.recordKey}`, span);
  }
  let editingMppAllocation = null;
  function findMppAllocation(allocationId) {
    for (const phase of currentRecord?.deliveryPhaseTimeline?.phases || []) {
      for (const event of phase.events || []) {
        const allocation = (event.allocations || []).find((row) => String(row.id) === String(allocationId));
        if (allocation) return { allocation, phase, event };
      }
    }
    return null;
  }
  function ensureMppPlacementDialog() {
    let dialog = $("mpp-placement-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "mpp-placement-dialog";
    dialog.className = "mpp-placement-dialog";
    dialog.innerHTML = `<form data-mpp-placement-form>
      <div class="mpp-placement-head"><div><small>Edit allocation</small><h2 data-mpp-placement-title>Edit posisi proses</h2><p data-mpp-placement-subtitle></p></div><button type="button" data-mpp-placement-close aria-label="Tutup">×</button></div>
      <div class="mpp-placement-summary" data-mpp-placement-summary></div>
      <div class="mpp-placement-quick"><span>Geser cepat</span><button type="button" data-mpp-shift-days="-7">−1 minggu</button><button type="button" data-mpp-shift-days="7">+1 minggu</button></div>
      <div class="mpp-placement-fields">
        <label><span>Tanggal proses / kirim</span><input class="form-control" type="date" name="scheduleDate" required></label>
        <label data-mpp-inhouse-field><span>Shift</span><select class="form-select" name="shift"><option value="1">Shift 1</option><option value="2">Shift 2</option><option value="3">Shift 3</option></select></label>
        <label data-mpp-inhouse-field><span>Jam mulai</span><input class="form-control" type="time" name="plannedStartTime"></label>
        <label data-mpp-inhouse-field><span>Jam selesai</span><input class="form-control" type="time" name="plannedEndTime"></label>
        <label data-mpp-vendor-field><span>Tanggal kembali vendor</span><input class="form-control" type="date" name="vendorReturnDate"></label>
        <label class="mpp-placement-wide"><span>Alasan freeze override <em>diisi jika tanggal dekat hari ini</em></span><input class="form-control" name="freezeOverrideReason" maxlength="240" placeholder="Contoh: penyesuaian jadwal customer dan kapasitas aktual"></label>
      </div>
      <div class="mpp-placement-note"><b>Yang berubah hanya penempatan tanggal.</b><span>Qty, mesin/dies, vendor, dan routing tetap. Server tetap memeriksa horizon MPP, freeze fence, resource, serta urutan proses.</span></div>
      <div class="mpp-placement-error d-none" data-mpp-placement-error></div>
      <div class="mpp-placement-actions"><button type="button" class="btn btn-light" data-mpp-placement-close>Batal</button><button type="submit" class="btn btn-primary" data-mpp-placement-save>Simpan posisi</button></div>
    </form>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll("[data-mpp-placement-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelectorAll("[data-mpp-shift-days]").forEach((button) => button.addEventListener("click", () => {
      const days = number(button.dataset.mppShiftDays);
      ["scheduleDate", "vendorReturnDate"].forEach((name) => {
        const input = dialog.querySelector(`[name="${name}"]`);
        if (!input?.value || input.closest("label")?.hidden) return;
        const parsed = new Date(`${input.value}T00:00:00`);
        parsed.setDate(parsed.getDate() + days);
        input.value = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      });
    }));
    dialog.querySelector("[data-mpp-placement-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!editingMppAllocation) return;
      const form = event.currentTarget;
      const allocation = editingMppAllocation.allocation;
      const vendor = allocation.routingMode === "VENDOR";
      const scheduleDate = form.elements.scheduleDate.value;
      const saveButton = form.querySelector("[data-mpp-placement-save]");
      const errorBox = form.querySelector("[data-mpp-placement-error]");
      const body = {
        routingMode: allocation.routingMode,
        scheduleDate,
        plannedQty: allocation.plannedQty,
        notes: "Posisi disesuaikan dari matriks mingguan MPP",
        freezeOverrideReason: form.elements.freezeOverrideReason.value.trim(),
        ...(vendor ? {
          vendorId: allocation.vendorId,
          vendorSendDate: scheduleDate,
          vendorReturnDate: form.elements.vendorReturnDate.value,
          expectedReturnQty: allocation.expectedReturnQty ?? allocation.plannedQty,
        } : {
          machineId: allocation.machineId,
          diesId: allocation.diesId,
          shift: form.elements.shift.value,
          plannedStartTime: form.elements.plannedStartTime.value || null,
          plannedEndTime: form.elements.plannedEndTime.value || null,
        }),
      };
      saveButton.disabled = true;
      saveButton.textContent = "Menyimpan...";
      errorBox.classList.add("d-none");
      try {
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(allocation.planNumber || currentRecord.planNumber)}/manual-allocations/${encodeURIComponent(allocation.id)}`, { method: "PATCH", body: JSON.stringify(body) });
        dialog.close();
        showAlert("Posisi proses berhasil diperbarui dan divalidasi.", "success");
        await load();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("d-none");
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Simpan posisi";
      }
    });
    return dialog;
  }
  function openMppPlacementEditor(allocationId, proposedStart = null, proposedEnd = null) {
    const found = findMppAllocation(allocationId);
    if (!found) { showAlert("Allocation proses tidak ditemukan pada matriks aktif."); return; }
    editingMppAllocation = found;
    const { allocation, phase, event } = found;
    const dialog = ensureMppPlacementDialog();
    const form = dialog.querySelector("form");
    const vendor = allocation.routingMode === "VENDOR";
    dialog.querySelector("[data-mpp-placement-title]").textContent = `${vendor ? "Vendor" : "In-house"} · ${allocation.processCode || event.processCode}`;
    dialog.querySelector("[data-mpp-placement-subtitle]").textContent = `Delivery phase ${phase.phaseNumber} · ${phase.deliveryDate || phase.fgRequiredDate || "-"}`;
    dialog.querySelector("[data-mpp-placement-summary]").innerHTML = `<div><small>Part</small><b>${esc(allocation.part?.partCode || "-")}</b><span>${esc(allocation.part?.partName || allocation.part?.partNumber || "-")}</span></div><div><small>Qty</small><b>${num(allocation.plannedQty)} ${esc(allocation.uomCode || "PCS")}</b><span>Tidak diubah</span></div><div><small>Resource</small><b>${esc(vendor ? allocation.vendorCode || "Vendor" : allocation.machineCode || "Mesin")}</b><span>${esc(vendor ? allocation.vendorName || "-" : allocation.machineName || "-")}</span></div>`;
    form.elements.scheduleDate.value = proposedStart || allocation.vendorSendDate || allocation.scheduleDate || "";
    form.elements.shift.value = allocation.shift || "1";
    form.elements.plannedStartTime.value = allocation.plannedStartTime || "";
    form.elements.plannedEndTime.value = allocation.plannedEndTime || "";
    form.elements.vendorReturnDate.value = proposedEnd || allocation.vendorReturnDate || "";
    form.elements.freezeOverrideReason.value = "";
    form.querySelectorAll("[data-mpp-inhouse-field]").forEach((field) => { field.hidden = vendor; });
    form.querySelectorAll("[data-mpp-vendor-field]").forEach((field) => { field.hidden = !vendor; });
    form.elements.vendorReturnDate.required = vendor;
    form.querySelector("[data-mpp-placement-error]").classList.add("d-none");
    dialog.showModal();
  }
  function applyMppMatrixLevel(level) {
    if (!["parent", "receipts", "full"].includes(level)) return;
    const table = document.querySelector(".mpp-matrix-table");
    if (!table) return;
    table.dataset.mppVisibleLevel = level;
    document.querySelectorAll("[data-mpp-matrix-level]").forEach((button) => button.classList.toggle("active", button.dataset.mppMatrixLevel === level));
    localStorage.setItem(`mpp-matrix-level:${currentRecord?.planNumber || config.recordKey}`, level);
  }
  document.addEventListener("click", (event) => {
    const businessTab = event.target.closest("[data-mpp-business-tab]");
    if (businessTab) { applyMppWorkbenchTab(businessTab.dataset.mppBusinessTab); return; }
    const ganttEditButton = event.target.closest("[data-mpp-gantt-edit]");
    if (ganttEditButton) { openMppPlacementEditor(ganttEditButton.dataset.mppGanttEdit); return; }
    const ganttRowModeButton = event.target.closest("[data-mpp-gantt-row-mode]");
    if (ganttRowModeButton && currentRecord) {
      localStorage.setItem(`mpp-gantt-row-mode:${currentRecord.planNumber || config.recordKey}`, ganttRowModeButton.dataset.mppGanttRowMode);
      renderMppGantt(currentRecord);
      return;
    }
    const ganttViewButton = event.target.closest("[data-mpp-gantt-view]");
    if (ganttViewButton && mppGanttInstance) { mppGanttInstance.change_view_mode(ganttViewButton.dataset.mppGanttView, true); return; }
    const ganttCalendarButton = event.target.closest("[data-mpp-gantt-calendar]");
    if (ganttCalendarButton && currentRecord) {
      const storageKey = `mpp-gantt-working:${currentRecord.planNumber || config.recordKey}`;
      localStorage.setItem(storageKey, localStorage.getItem(storageKey) === "1" ? "0" : "1");
      renderMppGantt(currentRecord);
      return;
    }
    const ganttTodayButton = event.target.closest("[data-mpp-gantt-today]");
    if (ganttTodayButton && mppGanttInstance) { mppGanttInstance.scroll_current(); return; }
    const weekSpanButton = event.target.closest("button[data-mpp-week-span]");
    if (weekSpanButton) { applyMppWeekView(weekSpanButton.dataset.mppWeekSpan); return; }
    const weekNavigationButton = event.target.closest("[data-mpp-week-nav]");
    if (weekNavigationButton) { applyMppWeekView(null, weekNavigationButton.dataset.mppWeekNav === "prev" ? -1 : 1); return; }
    const placementButton = event.target.closest("[data-mpp-edit-placement]");
    if (placementButton && !placementButton.disabled) { openMppPlacementEditor(placementButton.dataset.mppEditPlacement); return; }
    const levelButton = event.target.closest("[data-mpp-matrix-level]");
    if (levelButton) applyMppMatrixLevel(levelButton.dataset.mppMatrixLevel);
    const popoverButton = event.target.closest("[data-mpp-popover]");
    document.querySelectorAll("[data-mpp-popover].is-open").forEach((button) => {
      if (button !== popoverButton) {
        button.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
      }
    });
    if (popoverButton) {
      const open = !popoverButton.classList.contains("is-open");
      popoverButton.classList.toggle("is-open", open);
      popoverButton.setAttribute("aria-expanded", String(open));
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-mpp-gantt-phase]") && currentRecord) renderMppGantt(currentRecord);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-mpp-popover].is-open").forEach((button) => {
      button.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    });
  });
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
        <div class="table-responsive"><table class="table ops-collection-table ops-reference-table"${isGoodsReceiptPage() || isStockBalancePage() ? ' data-enterprise-table="off"' : ""}>
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
      if (/QC|QUALITY|INSPECTION/.test(code)) references.push({ type: "QC", label: "Buka quality inspection", href: "/modules/qc/quality-inspections" });
      if (/LOG|OUTPUT|PRODUCTION/.test(code)) references.push({ type: "Produksi", label: "Buka Production Entry", href: "/modules/production/production-logs" });
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
    const handled = new Set(["blockers", "validationIssues", "readiness", "planReadiness", "materialReadiness", "documentReferences", "referenceLinks", "_count"]);
    const collections = Object.entries(record || {}).filter(([key, value]) => !handled.has(key) && value && typeof value === "object");
    collections.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const score = (key, value) => key === "details" || key === "items" ? 0 : Array.isArray(value) ? 1 : 2;
      return score(leftKey, leftValue) - score(rightKey, rightValue);
    });
    const html = collections.map(([key, value]) => Array.isArray(value) ? renderArray(key, value, record) : renderObject(key, value)).join("");
    if (isGoodsReceiptPage()) {
      const blockers = collectBlockers(record);
      const references = collectDocumentReferences(record);
      $("ops-detail-collections").innerHTML = [blockers.length ? blockerCard(record) : "", html, references.length ? relatedDocumentsCard(record) : ""].join("");
      initializeGoodsReceiptWorkspace();
      return;
    }
    if (config.module === "purchasing" && config.page.slug === "purchase-suggestions") {
      // Each material card already exposes its MRP, demand, SO/forecast, and supplier
      // references. Keep the primary purchasing task above the fold instead of
      // repeating those links in the generic relationship table.
      $("ops-detail-collections").innerHTML = html;
      return;
    }
    const blockers = collectBlockers(record);
    const references = collectDocumentReferences(record);
    $("ops-detail-collections").innerHTML = [blockers.length ? blockerCard(record) : "", references.length ? relatedDocumentsCard(record) : "", html].join("");
  }

  function materialIssueQty(value, uomCode) {
    return `${num(value, isDiscreteUom(uomCode) ? 0 : 3)} <small>${esc(uomCode || "UNIT")}</small>`;
  }
  function materialIssueRequirementKey(row = {}) {
    return row.calculationTrace?.requirementKey || [
      row.partCode || row.partNumber || row.productId || row.description || "ITEM",
      row.spec || "",
      row.thickness ?? "",
      row.width ?? "",
      row.CSP || "",
      String(row.uomCode || "UNIT").toUpperCase(),
      row.requirementSource || "MBOM",
    ].join("|").toUpperCase();
  }
  function renderMaterialIssueFields(record) {
    document.querySelector(".ops-page")?.classList.add("material-issue-workspace");
    const card = $("ops-detail-fields").closest(".ops-detail-card");
    const heading = card?.querySelector("header h2");
    if (heading) heading.textContent = "Material Issue Operasional";
    const summary = record.stockSummary || {};
    const totals = summary.uomTotals || [];
    const isPosted = String(record.status || "").toUpperCase() !== "DRAFT";
    const requested = totals.map((row) => `${num(row.requestedQty, isDiscreteUom(row.uomCode) ? 0 : 3)} ${esc(row.uomCode)}`).join(" + ") || "0";
    const available = totals.map((row) => `${num(row.availableQty, isDiscreteUom(row.uomCode) ? 0 : 3)} ${esc(row.uomCode)}`).join(" + ") || "0";
    const reserved = totals.map((row) => `${num(row.reservedQty, isDiscreteUom(row.uomCode) ? 0 : 3)} ${esc(row.uomCode)}`).join(" + ") || "0";
    const shortageCount = number(summary.shortageRequirementCount ?? summary.shortageLineCount);
    const readyCount = number(summary.readyRequirementCount ?? summary.readyLineCount);
    const readinessClass = isPosted ? "posted" : shortageCount ? "shortage" : "ready";
    const readinessLabel = isPosted ? "ISSUED" : shortageCount ? `${num(shortageCount, 0)} SHORT` : "READY";
    const readinessTitle = isPosted ? "STATUS ISSUE" : "STATUS KESIAPAN";
    const readinessHelp = isPosted
      ? `${num(summary.requirementCount ?? summary.lineCount, 0)} kebutuhan · ${num(summary.sourceLineCount ?? summary.lineCount, 0)} line sumber diposting`
      : `${num(readyCount, 0)} kebutuhan material stock cukup`;
    $("ops-detail-fields").className = "mi-operational-header";
    $("ops-detail-fields").innerHTML = `
      <div class="mi-kpi-strip">
        <article class="primary"><span>QUANTITY DIMINTA</span><strong>${requested}</strong><small>${num(summary.requirementCount ?? summary.lineCount, 0)} kebutuhan · ${num(summary.sourceLineCount ?? summary.lineCount, 0)} sumber stock</small></article>
        <article class="stock"><span>STOCK AVAILABLE</span><strong>${available}</strong><small>Saldo siap issue di ${esc(record.warehouseCode || "warehouse")}</small></article>
        <article class="reserved"><span>STOCK RESERVED</span><strong>${reserved}</strong><small>Reservation khusus MO / Material Issue ini</small></article>
        <article class="material"><span>ITEM UNIK</span><strong>${num(summary.requirementCount ?? summary.lineCount, 0)}</strong><small>Part dan material unik yang perlu disiapkan</small></article>
        <article class="${readinessClass}"><span>${readinessTitle}</span><strong>${readinessLabel}</strong><small>${readinessHelp}</small></article>
      </div>
      <div class="mi-command-context">
        <div><span>Manufacturing Order</span><b>${linkedValue(record.manufacturingOrder?.moNumber || record.moNumber, "moNumber", record)}</b></div>
        <div><span>Work Order / Proses</span><b>${linkedValue(record.workOrder?.woNumber || record.woNumber, "woNumber", record)}</b><small>${esc(record.workOrder?.process?.processName || record.workOrder?.process?.processCode || "-")}</small></div>
        <div><span>Warehouse Pengambilan</span><b>${esc(record.warehouseCode || "-")}</b><small>${esc(record.warehouse?.warehouseName || record.warehouse?.location || "")}</small></div>
        <div><span>Tanggal Permintaan</span><b>${esc(format(record.issueDate, "date"))}</b><small>${esc(record.issuedBy || "Belum ditentukan")}</small></div>
      </div>`;
  }
  function materialIssueLocations(row, editable = false) {
    const locations = row.stockAvailability?.locations || [];
    if (!locations.length) return '<span class="mi-no-stock">Belum ada stock balance</span>';
    if (editable) return `<div class="mi-lot-editor"><select class="form-select form-select-sm" data-mi-stock-source>${locations.map((location) => `<option value="${esc(location.stockBalanceId)}" ${location.stockBalanceId === row.stockBalanceId ? "selected" : ""}>${esc(location.lotNumber || "Tanpa lot")} · ${esc(location.rackCode || "Tanpa rack")} · siap ${num(location.qtyAvailable, isDiscreteUom(location.uomCode) ? 0 : 3)}${number(location.qtyReservedForIssue) > 0 ? ` · reserved MI ${num(location.qtyReservedForIssue, isDiscreteUom(location.uomCode) ? 0 : 3)}` : ""} ${esc(location.uomCode || row.uomCode || "")}</option>`).join("")}</select><button type="button" class="btn btn-sm btn-outline-primary" data-mi-add-lot>+ Lot</button></div>`;
    return `<details class="mi-locations"><summary>${num(locations.length, 0)} lokasi stock</summary><div>${locations.map((location) => `
      <a href="/modules/inventory/stock-balances/${encodeURIComponent(location.stockBalanceId)}">
        <span><b>${esc(location.rackCode || "Tanpa rack")}</b><small>${esc(location.lotNumber || "Tanpa lot")}</small></span>
        <strong>${num(location.qtyAvailable, isDiscreteUom(location.uomCode) ? 0 : 3)} ${esc(location.uomCode || row.uomCode || "")}${number(location.qtyReservedForIssue) > 0 ? `<small>Reserved MI ${num(location.qtyReservedForIssue, isDiscreteUom(location.uomCode) ? 0 : 3)}</small>` : ""}</strong>
      </a>`).join("")}</div></details>`;
  }
  function materialIssueTraceLink(type, value, href) {
    if (!value) return "";
    return `<a class="mi-trace-reference" href="${esc(href)}"><span>${esc(type)}</span><b>${esc(value)}</b><i>→</i></a>`;
  }
  function openMaterialIssueTraceModal(row) {
    const trace = row.calculationTrace || {};
    const siblings = (currentRecord?.details || []).filter((candidate) => {
      const candidateTrace = candidate.calculationTrace || {};
      return (trace.requirementKey && candidateTrace.requirementKey
        ? String(candidateTrace.requirementKey) === String(trace.requirementKey)
        : String(candidate.partCode || candidate.partNumber || "") === String(row.partCode || row.partNumber || "")
        && String(candidateTrace.parentPartCode || "") === String(trace.parentPartCode || "")
        && String(candidate.uomCode || "").toUpperCase() === String(row.uomCode || "").toUpperCase());
    });
    const requestedUom = trace.requestedUomCode || row.uomCode || "UNIT";
    const plannedUom = trace.plannedUomCode || "PCS";
    const qtyPerUom = trace.qtyPerUomCode || "PCS";
    const formulaSegments = [
      `<b>${num(trace.plannedQty, 3)}</b> ${esc(plannedUom)} DPP`,
      `<b>${num(trace.qtyPer, 6)}</b> ${esc(qtyPerUom)}/output`,
      `<b>(1 + ${num(trace.scrapPercent, 3)} / 100)</b> scrap`,
      number(trace.grossWeightKg) > 0 ? `<b>${num(trace.grossWeightKg, 6)}</b> KG/${esc(qtyPerUom)}` : null,
    ].filter(Boolean);
    const references = [
      materialIssueTraceLink("DPP", trace.scheduleNumber, `/modules/production/daily-production-schedules/${encodeURIComponent(trace.scheduleNumber || "")}`),
      materialIssueTraceLink("MO", trace.moNumber, `/modules/production/manufacturing-orders/${encodeURIComponent(trace.moNumber || "")}`),
      materialIssueTraceLink("WO", trace.woNumber, `/modules/production/work-orders/${encodeURIComponent(trace.woNumber || "")}`),
      materialIssueTraceLink("MBOM", trace.mbomNumber, `/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(trace.mbomNumber || "")}`),
    ].filter(Boolean).join("");
    const allocationRows = siblings.map((candidate) => {
      const candidateTrace = candidate.calculationTrace || {};
      const stockHref = candidate.stockBalanceId ? `/modules/inventory/stock-balances/${encodeURIComponent(candidate.stockBalanceId)}` : null;
      return `<div class="mi-trace-allocation">
        <span>LINE ${num(candidate.lineNumber, 0)}</span>
        <div><b>${num(candidate.qtyRequired, isDiscreteUom(candidate.uomCode) ? 0 : 3)} ${esc(candidate.uomCode || requestedUom)}</b><small>${esc(candidate.lotNumber || "Tanpa lot")} · ${esc(candidate.rackCode || "Tanpa rack")}</small></div>
        ${stockHref ? `<a href="${esc(stockHref)}">Stock balance →</a>` : '<em>Stock belum terpilih</em>'}
      </div>`;
    }).join("");
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop mi-trace-backdrop";
    overlay.innerHTML = `<section class="ops-modal mi-trace-modal" role="dialog" aria-modal="true" aria-labelledby="mi-trace-title">
      <header><div><p class="ops-eyebrow">Asal & Rumus Permintaan</p><h2 id="mi-trace-title">${esc(row.partCode || row.partNumber || "Material")}</h2><p>${esc(row.partName || row.description || "Material produksi")} · dari ${esc(trace.parentPartCode || "output DPP")}</p></div><button type="button" class="btn-close" data-mi-trace-close aria-label="Tutup"></button></header>
      <div class="ops-modal-body">
        <div class="mi-trace-explanation"><span>Kenapa menjadi ${num(trace.splitLineCount || siblings.length, 0)} line?</span><b>${esc(trace.splitReason || "Kebutuhan material dialokasikan mengikuti sumber stock yang dipilih.")}</b><p>Bukan dua kali permintaan. Total kebutuhan tetap <strong>${num(trace.totalRequestedQty, isDiscreteUom(requestedUom) ? 0 : 3)} ${esc(requestedUom)}</strong>; setiap line menunjukkan stock balance atau lot asal yang berbeda.</p></div>
        <div class="mi-trace-references">${references || '<span class="ops-muted">Reference otomatis belum tersedia.</span>'}</div>
        <section class="mi-trace-formula"><header><span>RUMUS KEBUTUHAN MATERIAL</span><b>${esc(trace.sourceType || "MBOM")}</b></header><div class="mi-trace-equation">${formulaSegments.join('<i>×</i>')}<i>=</i><strong>${num(trace.calculatedQty || trace.totalRequestedQty, 6)} ${esc(requestedUom)}</strong></div>
          <div class="mi-trace-formula-note"><span>DPP ${num(trace.plannedQty, 3)} ${esc(plannedUom)}</span><span>Qty/Output ${num(trace.qtyPer, 6)} ${esc(qtyPerUom)}</span><span>Gross weight ${number(trace.grossWeightKg) > 0 ? `${num(trace.grossWeightKg, 6)} KG` : "Tidak dipakai"}</span><span>Hasil MI ${num(trace.totalRequestedQty, 6)} ${esc(requestedUom)}</span></div>
        </section>
        <section class="mi-trace-split"><header><div><span>PEMBAGIAN SUMBER STOCK</span><h3>Total ${num(trace.totalRequestedQty, isDiscreteUom(requestedUom) ? 0 : 3)} ${esc(requestedUom)}</h3></div><small>${num(siblings.length, 0)} stock balance/lot</small></header><div>${allocationRows}</div></section>
      </div>
      <footer><button type="button" class="btn btn-primary" data-mi-trace-close>Mengerti</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const close = () => { overlay.remove(); if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open"); };
    overlay.querySelectorAll("[data-mi-trace-close]").forEach((button) => button.addEventListener("click", close));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  }
  function renderMaterialIssueCollections(record) {
    const rows = record.details || [];
    const issueStatus = String(record.status || "").toUpperCase();
    const isEditable = ["DRAFT", "PREPARING"].includes(issueStatus);
    const renderedRequirements = new Set();
    const body = rows.map((row) => {
      const stock = row.stockAvailability || {};
      const requirementStock = row.requirementAvailability || stock;
      const requirementKey = materialIssueRequirementKey(row);
      const isPrimaryRequirementRow = !renderedRequirements.has(requirementKey);
      renderedRequirements.add(requirementKey);
      const requestedQty = requirementStock.requestedQty ?? row.calculationTrace?.totalRequestedQty ?? row.requestedQty ?? row.qtyRequired;
      const shouldReallocate = isEditable && stock.status !== "READY" && requirementStock.status === "READY";
      const state = isEditable ? shouldReallocate ? "REALLOCATE" : stock.status || "OUT_OF_STOCK" : "POSTED";
      const code = row.partCode || row.partNumber || row.product?.productCode || `Line ${row.lineNumber || "-"}`;
      const description = row.partName || row.description || row.product?.productName || "Material produksi";
      const spec = [row.spec, row.thickness != null ? `T ${num(row.thickness)}` : null, row.width != null ? `W ${num(row.width)}` : null, row.CSP].filter(Boolean).join(" · ");
      return `<tr class="mi-row ${row.itemCategory === "MATERIAL" ? "is-material" : ""} ${slug(state)}" data-detail-id="${esc(row.id || "")}" data-source-detail-id="${esc(row.id || "")}" data-line-number="${esc(row.lineNumber || "")}">
        <td><span class="mi-line">${num(row.lineNumber, 0)}</span></td>
        <td><div class="mi-item"><div><span class="mi-kind ${slug(row.itemCategory)}">${esc(row.itemCategory || "PART")}</span><b>${esc(code)}</b><button type="button" class="mi-trace-button" data-mi-calculation title="Lihat asal dan rumus permintaan" aria-label="Lihat asal dan rumus permintaan ${esc(code)}">ƒx</button></div><strong>${esc(description)}</strong><small>${esc(spec || row.requirementSource || "-")}</small></div></td>
        <td class="mi-qty requested">${isPrimaryRequirementRow ? `<span>DIMINTA</span><strong>${materialIssueQty(requestedQty, row.uomCode)}</strong><small>${esc(row.requirementSource || "Kebutuhan produksi")}</small>` : '<span>LOT / COIL TAMBAHAN</span><strong>↳</strong><small>Quantity diminta tetap di line utama</small>'}</td>
        <td class="mi-qty"><span>${isEditable ? "AKAN DI-ISSUE" : "SUDAH DI-ISSUE"}</span>${isEditable ? `<input class="form-control form-control-sm" data-mi-qty-issued type="number" min="0" step="any" value="${esc(row.qtyIssued)}"><small>Qty dapat disesuaikan selama persiapan</small>` : `<strong>${materialIssueQty(row.qtyIssued, row.uomCode)}</strong><small>Return ${num(row.qtyReturned, isDiscreteUom(row.uomCode) ? 0 : 3)}</small>`}</td>
        <td class="mi-qty available"><span>SUMBER LINE INI</span><strong>${materialIssueQty(stock.qtyAvailable, row.uomCode)}</strong><small>${shouldReallocate ? `Total material ${num(requirementStock.qtyAvailable, isDiscreteUom(row.uomCode) ? 0 : 3)} ${esc(row.uomCode || "")}` : `${num(stock.coveragePercent, 1)}% coverage`}</small></td>
        <td><div class="mi-stock-breakdown"><span>On hand <b>${num(stock.qtyOnHand, isDiscreteUom(row.uomCode) ? 0 : 3)}</b></span><span>Reserved total <b>${num(stock.qtyReserved, isDiscreteUom(row.uomCode) ? 0 : 3)}</b></span><span class="is-reserved-mi">Reserved MI ini <b>${num(stock.qtyReservedForIssue, isDiscreteUom(row.uomCode) ? 0 : 3)}</b></span><span>QC <b>${num(stock.qtyQC, isDiscreteUom(row.uomCode) ? 0 : 3)}</b></span></div></td>
        <td><span class="mi-stock-state ${slug(state)}">${state === "READY" ? "STOCK CUKUP" : state === "REALLOCATE" ? "PINDAH SUMBER" : state === "PARTIAL" ? "STOCK KURANG" : state === "POSTED" ? "SUDAH ISSUE" : "STOCK KOSONG"}</span>${shouldReallocate ? '<small class="mi-reallocate-note">Otomatis ambil dari saldo material lain saat issue</small>' : isEditable && number(stock.shortageQty) > 0 ? `<small class="mi-shortage">Kurang ${num(stock.shortageQty, isDiscreteUom(row.uomCode) ? 0 : 3)} ${esc(row.uomCode || "")}</small>` : ""}</td>
        <td>${materialIssueLocations(row, isEditable)}</td>
      </tr>`;
    }).join("");
    $("ops-detail-collections").innerHTML = `<section class="ops-detail-card mi-stock-card">
      <div class="ops-collection-head"><div><h2>Permintaan Material & Ketersediaan Stock</h2><p>Siapkan quantity sesuai kolom Diminta. Satu material dapat memiliki beberapa line karena sumber stock/lot berbeda.</p></div>${isEditable ? '<button type="button" class="btn btn-primary btn-sm" data-mi-save-lots>Simpan Qty & Alokasi Lot</button>' : `<span>${num(rows.length, 0)} line sumber</span>`}</div>
      <div class="mi-table-wrap"><table class="table ops-collection-table mi-stock-table"><thead><tr><th>#</th><th>Material / Item</th><th>Quantity Diminta</th><th>Issue</th><th>Stock Available</th><th>Komposisi Stock</th><th>Status</th><th>Rack & Lot</th></tr></thead><tbody>${body || '<tr><td colspan="8"><div class="mi-empty">Belum ada detail material yang diminta.</div></td></tr>'}</tbody></table></div>
    </section>`;
  }
  document.addEventListener("click", async (event) => {
    const addLot = event.target.closest("[data-mi-add-lot]");
    if (addLot) {
      const sourceRow = addLot.closest("tr[data-source-detail-id]");
      if (!sourceRow) return;
      const clone = sourceRow.cloneNode(true);
      clone.dataset.miCloned = "true";
      clone.removeAttribute("data-detail-id");
      const qtyInput = clone.querySelector("[data-mi-qty-issued]");
      if (qtyInput) qtyInput.value = "0";
      const requestedCell = clone.querySelector(".mi-qty.requested");
      if (requestedCell) requestedCell.innerHTML = '<span>LOT / COIL TAMBAHAN</span><strong>↳</strong><small>Quantity diminta tetap di line utama</small>';
      const action = clone.querySelector("[data-mi-add-lot]");
      if (action) { action.dataset.miRemoveLot = "true"; delete action.dataset.miAddLot; action.className = "btn btn-sm btn-outline-danger"; action.textContent = "Hapus"; }
      sourceRow.insertAdjacentElement("afterend", clone);
      return;
    }
    const removeLot = event.target.closest("[data-mi-remove-lot]");
    if (removeLot) { removeLot.closest("tr[data-mi-cloned]")?.remove(); return; }
    const saveLots = event.target.closest("[data-mi-save-lots]");
    if (!saveLots || !currentRecord || String(currentRecord.status || "").toUpperCase() !== "DRAFT") return;
    const details = [...document.querySelectorAll(".mi-stock-table tbody tr[data-source-detail-id]")].map((row, index) => {
      const source = (currentRecord.details || []).find((detail) => String(detail.id) === String(row.dataset.sourceDetailId));
      const stockBalanceId = row.querySelector("[data-mi-stock-source]")?.value || null;
      const location = source?.stockAvailability?.locations?.find((item) => String(item.stockBalanceId) === String(stockBalanceId));
      const qtyIssued = number(row.querySelector("[data-mi-qty-issued]")?.value);
      const isClonedLot = row.dataset.miCloned === "true";
      const sourceRequiredQty = number(source?.qtyRequired ?? source?.requestedQty);
      return source && (qtyIssued > 0 || (!isClonedLot && sourceRequiredQty > 0)) ? {
        lineNumber: index + 1,
        partCode: source.partCode || null,
        partNumber: source.partNumber || null,
        partName: source.partName || null,
        spec: source.spec ?? null,
        thickness: source.thickness ?? null,
        width: source.width ?? null,
        CSP: source.CSP ?? null,
        productId: source.productId || null,
        description: source.description || null,
        stockBalanceId,
        requirementSource: source.requirementSource || null,
        isSubAssembly: Boolean(source.isSubAssembly),
        rackCode: location?.rackCode || null,
        lotNumber: location?.lotNumber || null,
        qtyRequired: isClonedLot ? 0 : sourceRequiredQty,
        qtyIssued,
        qtyReturned: 0,
        uomCode: location?.uomCode || source.uomCode || null,
        notes: source.notes || null,
      } : null;
    }).filter(Boolean);
    if (!details.length) return window.alert("Minimal satu lot dengan qty lebih dari 0 wajib dipilih.");
    try {
      saveLots.disabled = true;
      await api(`/modules/api/inventory/material-issues/${encodeURIComponent(currentRecord.issueNumber || config.recordKey)}`, {
        method: "PATCH",
        body: JSON.stringify({
          woId: currentRecord.woId || currentRecord.workOrder?.id,
          warehouseCode: currentRecord.warehouseCode,
          receivedBy: currentRecord.receivedBy || null,
          notes: currentRecord.notes || null,
          details,
        }),
      });
      await load();
      showAlert("Qty dan alokasi lot Material Issue berhasil disimpan.", "success");
    } catch (error) { saveLots.disabled = false; showAlert(error.message); }
  });
  function renderMeta(record) {
    const keys = ["createdAt", "createdBy", "updatedAt", "updatedBy", "approvedAt", "approvedBy", "releasedAt", "releasedBy"].filter((key) => record[key] != null);
    $("ops-document-meta").innerHTML = (keys.length ? keys : [config.page.detailKey]).map((key) => `<div><span>${esc(label(key))}</span><strong>${esc(format(record[key] ?? config.recordKey, key))}</strong></div>`).join("");
  }
  function actionButton(action, text, style = "outline-primary", note = "") {
    return `<button type="button" class="btn btn-${style}" data-workflow-action="${esc(action)}">${esc(text)}</button>${note ? `<small>${esc(note)}</small>` : ""}`;
  }
  function disabledActionButton(text, note, style = "secondary") {
    return `<button type="button" class="btn btn-${style}" disabled aria-disabled="true">${esc(text)}</button>${note ? `<small>${esc(note)}</small>` : ""}`;
  }

  function goodsReceiptGripFormatter() {
    return `<span class="gr-detail-row-grip" role="img" aria-label="Pegangan baris">${Array.from({ length: 6 }, () => "<i></i>").join("")}</span>`;
  }

  function goodsReceiptQtyFormatter(cell) {
    const row = cell.getRow().getData();
    return `<span class="gr-detail-quantity"><b>${esc(qty(cell.getValue(), row.uomCode))}</b><em>${esc(row.uomCode || "—")}</em></span>`;
  }

  function goodsReceiptRowData(row, index) {
    const poDetail = row?.poDetail || row?.purchaseOrderDetail || {};
    const part = row?.part || poDetail?.part || {};
    const code = row?.partCode || row?.materialCode || part?.partCode || poDetail?.partCode || poDetail?.materialCode || `Line ${row?.lineNumber || index + 1}`;
    return {
      id: row?.id || `gr-line-${index + 1}`,
      lineNumber: row?.lineNumber || index + 1,
      itemCode: code,
      partNumber: row?.partNumber || part?.partNumber || poDetail?.partNumber || "—",
      itemName: row?.partName || row?.materialName || row?.description || part?.partName || poDetail?.partName || poDetail?.description || "—",
      qtyOrdered: row?.qtyOrdered ?? poDetail?.qty ?? 0,
      qtyReceived: row?.qtyReceived ?? 0,
      qtyInspected: row?.qtyInspected ?? 0,
      deliveryNote: row?.deliveryNoteNumber || "—",
      lotNumber: row?.lotNumber || "—",
      supplierLot: row?.supplierLotNumber || "—",
      uomCode: row?.uomCode || poDetail?.uomCode || "UNIT",
    };
  }

  function initializeGoodsReceiptTable() {
    const mount = $("gr-detail-receipt-table");
    const TabulatorClass = window.Tabulator || window.TabulatorFull;
    if (!mount || !TabulatorClass) return;
    goodsReceiptTable?.destroy?.();
    goodsReceiptTable = new TabulatorClass(mount, {
      index: "id",
      data: goodsReceiptTableRows.map(goodsReceiptRowData),
      layout: "fitDataStretch",
      height: "auto",
      placeholder: "Belum ada receipt item.",
      columnDefaults: { headerSort: false, resizable: true, vertAlign: "middle" },
      columns: [
        { title: "", field: "handle", width: 42, minWidth: 42, maxWidth: 42, frozen: true, hozAlign: "center", formatter: goodsReceiptGripFormatter, resizable: false },
        { title: "Line", field: "lineNumber", width: 70, minWidth: 64, frozen: true, hozAlign: "center", headerHozAlign: "center" },
        { title: "Part / Material", field: "itemCode", width: 180, minWidth: 160, frozen: true, cssClass: "is-identity", formatter: (cell) => `<b>${esc(cell.getValue())}</b>` },
        { title: "Part No", field: "partNumber", width: 155, minWidth: 135, cssClass: "is-identity", formatter: (cell) => `<b>${esc(cell.getValue())}</b>` },
        { title: "Part Name", field: "itemName", width: 220, minWidth: 180, tooltip: true },
        { title: "Ordered", field: "qtyOrdered", width: 125, minWidth: 110, hozAlign: "right", headerHozAlign: "right", formatter: goodsReceiptQtyFormatter },
        { title: "Received", field: "qtyReceived", width: 125, minWidth: 110, hozAlign: "right", headerHozAlign: "right", formatter: goodsReceiptQtyFormatter },
        { title: "Inspected", field: "qtyInspected", width: 125, minWidth: 110, hozAlign: "right", headerHozAlign: "right", formatter: goodsReceiptQtyFormatter },
        { title: "Delivery Note", field: "deliveryNote", width: 145, minWidth: 125 },
        { title: "Internal Lot", field: "lotNumber", width: 185, minWidth: 150 },
        { title: "Supplier Lot", field: "supplierLot", width: 150, minWidth: 130 },
      ],
    });
  }

  function initializeGoodsReceiptWorkspace() {
    const root = $("ops-detail-collections");
    if (!root) return;
    initializeGoodsReceiptTable();
    const renderedCards = [...root.children].filter((node) => node.matches(".ops-detail-card"));
    const preferredCard = renderedCards.find((card) => card.dataset.grTabTitle);
    const cards = preferredCard ? [preferredCard, ...renderedCards.filter((card) => card !== preferredCard)] : renderedCards;
    if (!cards.length) return;
    const workspace = document.createElement("section");
    workspace.className = "gr-detail-tabs-workspace";
    const tabs = document.createElement("nav");
    tabs.className = "gr-detail-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Goods Receipt workspace");
    workspace.append(tabs);
    const activate = (index, focus = false) => {
      const buttons = [...tabs.querySelectorAll("[role=tab]")];
      cards.forEach((card, cardIndex) => {
        const active = cardIndex === index;
        card.hidden = !active;
        card.classList.toggle("is-active", active);
        buttons[cardIndex]?.classList.toggle("is-active", active);
        buttons[cardIndex]?.setAttribute("aria-selected", String(active));
        buttons[cardIndex].tabIndex = active ? 0 : -1;
      });
      if (focus) buttons[index]?.focus();
    };
    const friendlyTitle = (card, index) => transactionWorkspaceTitle(card, index);
    cards.forEach((card, index) => {
      const panelId = `gr-detail-panel-${index + 1}`;
      const tabId = `gr-detail-tab-${index + 1}`;
      card.id = panelId;
      card.classList.add("gr-detail-tab-panel");
      card.setAttribute("role", "tabpanel");
      card.setAttribute("aria-labelledby", tabId);
      const button = document.createElement("button");
      button.type = "button";
      button.id = tabId;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", panelId);
      button.textContent = friendlyTitle(card, index);
      button.addEventListener("click", () => activate(index));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const offset = event.key === "ArrowRight" ? 1 : -1;
        activate((index + offset + cards.length) % cards.length, true);
        event.preventDefault();
      });
      tabs.append(button);
      workspace.append(card);
    });
    root.replaceChildren(workspace);
    activate(0);
  }

  function transactionWorkspaceTitle(card, index = 0) {
    const raw = card?.dataset?.transactionTabTitle
      || card?.dataset?.grTabTitle
      || card?.querySelector("h2")?.textContent?.trim()
      || `Detail ${index + 1}`;
    const aliases = {
      "Incoming Inspections": "Incoming Inspection",
      "Dokumen & Master Terkait": "Related Documents",
      "Document References": "Related Documents",
      "Po": "Purchase Order",
      "Details": "Items",
    };
    return aliases[raw] || raw;
  }

  function initializeTransactionWorkspace() {
    if (isGoodsReceiptPage() || isNgDispositionPage() || isQualityInspectionPage()) return;
    const root = $("ops-detail-collections");
    if (!root || root.querySelector(":scope > .transaction-detail-tabs-workspace")) return;
    const cards = [...root.querySelectorAll(".ops-detail-card")].filter((card) => !card.parentElement?.closest(".ops-detail-card"));
    if (cards.length < 2) return;

    const titleOf = (card, index) => transactionWorkspaceTitle(card, index);
    const secondaryPattern = /related|reference|dokumen|audit|history|riwayat|inspection|warehouse|putaway|approval|workflow|posting|attachment/i;
    const primaryPattern = /item|detail|line|receipt|schedule|order|material|production|movement|reservation|opname|count|quality|disposition/i;
    const companionPattern = /reconciliation|rekonsiliasi|allocation|alokasi|variance|readiness|blocker|ringkasan|summary|status po|qty aktual/i;
    const primary = cards.find((card, index) => primaryPattern.test(titleOf(card, index)) && !secondaryPattern.test(titleOf(card, index))) || cards[0];
    const primaryCards = [primary, ...cards.filter((card, index) => card !== primary && companionPattern.test(titleOf(card, index)))];
    const secondaryCards = cards.filter((card) => !primaryCards.includes(card));
    if (!secondaryCards.length) return;

    const workspace = document.createElement("section");
    workspace.className = "transaction-detail-tabs-workspace";
    const tabs = document.createElement("nav");
    tabs.className = "transaction-detail-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", `${config.page.label} workspace`);
    workspace.append(tabs);

    const groups = [
      { title: titleOf(primary, cards.indexOf(primary)), cards: primaryCards },
      ...secondaryCards.map((card) => ({ title: titleOf(card, cards.indexOf(card)), cards: [card] })),
    ];
    const panels = [];
    const buttons = [];
    const activate = (index, focus = false) => {
      panels.forEach((panel, panelIndex) => {
        const active = panelIndex === index;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
        buttons[panelIndex]?.classList.toggle("is-active", active);
        buttons[panelIndex]?.setAttribute("aria-selected", String(active));
        if (buttons[panelIndex]) buttons[panelIndex].tabIndex = active ? 0 : -1;
      });
      if (focus) buttons[index]?.focus();
    };

    groups.forEach((group, index) => {
      const tabId = `transaction-detail-tab-${index + 1}`;
      const panelId = `transaction-detail-panel-${index + 1}`;
      const button = document.createElement("button");
      button.type = "button";
      button.id = tabId;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", panelId);
      button.textContent = group.title;
      button.addEventListener("click", () => activate(index));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        activate((index + (event.key === "ArrowRight" ? 1 : -1) + groups.length) % groups.length, true);
        event.preventDefault();
      });
      tabs.append(button);
      buttons.push(button);

      const panel = document.createElement("section");
      panel.id = panelId;
      panel.className = "transaction-detail-tab-panel";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tabId);
      if (group.cards.length > 1) panel.classList.add("transaction-detail-primary-stack");
      group.cards.forEach((card) => panel.append(card));
      workspace.append(panel);
      panels.push(panel);
    });
    root.replaceChildren(workspace);
    activate(0);
  }
  const vendorSendDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
  };
  async function openVendorSendModal() {
    const options = await api(`/modules/api/vendor-process-workflow/${encodeURIComponent(config.recordKey)}/send-options`);
    const primary = options.order || {};
    const stockOptions = Array.isArray(options.stockOptions) ? options.stockOptions : [];
    const nextSchedules = Array.isArray(options.nextSchedules) ? options.nextSchedules : [];
    if (!stockOptions.length) throw new Error("Belum ada stock WIP yang siap dikirim untuk part jadwal ini.");

    const warehouseRows = [...new Map(stockOptions.map((row) => [row.warehouseCode, row])).values()];
    const primaryQty = number(primary.qtyToSend);
    const defaultWarehouse = warehouseRows.find((row) => (
      stockOptions.filter((stock) => stock.warehouseCode === row.warehouseCode)
        .reduce((sum, stock) => sum + number(stock.qtyAvailable), 0) >= primaryQty
    )) || warehouseRows[0];
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop vendor-send-backdrop";
    overlay.innerHTML = `<form class="ops-modal vendor-send-modal" data-vendor-send-form>
      <header>
        <div><p class="ops-eyebrow">Vendor Dispatch</p><h2>Kirim sesuai jadwal</h2><p>${esc(primary.vendorName || primary.vendorCode || "Vendor")} · ${esc(primary.processName || primary.processCode || "Proses vendor")}</p></div>
        <button type="button" class="btn-close" data-vendor-send-cancel aria-label="Tutup"></button>
      </header>
      <div class="ops-modal-body">
        <section class="vendor-send-summary">
          <div><span>Part yang dikirim</span><b>${esc(primary.inputPartCode || "-")}</b><small>${esc(primary.inputPartNumber || "-")} · ${esc(primary.inputPartName || "-")}</small></div>
          <div><span>Qty jadwal utama</span><b>${esc(qty(primaryQty, primary.uomCode))} ${esc(primary.uomCode || "")}</b><small>${esc(primary.orderNumber || config.recordKey)}</small></div>
          <div><span>Target kembali</span><b>${esc(vendorSendDate(primary.dueDate))}</b><small>Kembali dari vendor</small></div>
        </section>

        <section class="vendor-send-section">
          <div class="vendor-send-section-title"><i>1</i><div><h3>Pilih lokasi stock WIP</h3><p>Dropdown hanya berisi lokasi yang mempunyai stock siap kirim.</p></div></div>
          <div class="vendor-send-location-grid">
            <label><span>Warehouse</span><select class="form-select" data-vendor-warehouse>${warehouseRows.map((row) => `<option value="${esc(row.warehouseCode)}" ${row.warehouseCode === defaultWarehouse.warehouseCode ? "selected" : ""}>${esc(row.warehouseCode)} — ${esc(row.warehouseName || row.warehouseCode)}</option>`).join("")}</select></label>
            <label><span>Rack</span><select class="form-select" data-vendor-rack></select></label>
            <div class="vendor-send-location-total"><span>Stock dipilih</span><b data-vendor-stock-total>0 ${esc(primary.uomCode || "")}</b><small>Dipakai berurutan per lot</small></div>
          </div>
          <div class="vendor-send-stock-list" data-vendor-stock-list></div>
        </section>

        <section class="vendor-send-section">
          <div class="vendor-send-section-title"><i>2</i><div><h3>Jadwal yang ikut dikirim</h3><p>Qty dikunci mengikuti sisa qty setiap jadwal.</p></div></div>
          <div class="table-responsive"><table class="table vendor-send-table"><thead><tr><th></th><th>Jadwal</th><th>Rencana kirim</th><th>Target kembali</th><th class="text-end">Qty kirim</th></tr></thead><tbody>
            <tr class="is-primary"><td><input type="checkbox" checked disabled aria-label="Jadwal utama"></td><td><b>${esc(primary.orderNumber || config.recordKey)}</b><small>${esc(primary.moNumber || "-")} · Jadwal utama</small></td><td>${esc(vendorSendDate(primary.sendDate))}</td><td>${esc(vendorSendDate(primary.dueDate))}</td><td class="text-end"><b>${esc(qty(primaryQty, primary.uomCode))} ${esc(primary.uomCode || "")}</b></td></tr>
            ${nextSchedules.map((schedule) => `<tr><td><input type="checkbox" data-vendor-schedule value="${esc(schedule.orderNumber)}" data-qty="${esc(schedule.qtyToSend)}"></td><td><b>${esc(schedule.orderNumber)}</b><small>${esc(schedule.moNumber || "-")} · ${esc(schedule.status || "Ready to Send")}</small></td><td>${esc(vendorSendDate(schedule.sendDate))}</td><td>${esc(vendorSendDate(schedule.dueDate))}</td><td class="text-end"><b>${esc(qty(schedule.qtyToSend, schedule.uomCode))} ${esc(schedule.uomCode || "")}</b></td></tr>`).join("") || `<tr><td colspan="5" class="vendor-send-empty">Tidak ada jadwal berikutnya yang sudah Ready to Send.</td></tr>`}
          </tbody></table></div>
        </section>

        <div class="vendor-send-validation" data-vendor-send-validation></div>
      </div>
      <footer><div class="vendor-send-footer-total"><span>Total pengiriman</span><b data-vendor-send-total>${esc(qty(primaryQty, primary.uomCode))} ${esc(primary.uomCode || "")}</b></div><button type="button" class="btn btn-outline-secondary" data-vendor-send-cancel>Batal</button><button type="submit" class="btn btn-primary" data-vendor-send-submit>Kirim ke Vendor</button></footer>
    </form>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");

    return new Promise((resolve) => {
      const warehouseSelect = overlay.querySelector("[data-vendor-warehouse]");
      const rackSelect = overlay.querySelector("[data-vendor-rack]");
      const stockList = overlay.querySelector("[data-vendor-stock-list]");
      const validation = overlay.querySelector("[data-vendor-send-validation]");
      const submit = overlay.querySelector("[data-vendor-send-submit]");
      const close = (value = null) => {
        overlay.remove();
        if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open");
        resolve(value);
      };
      const rackKey = (value) => value || "__NO_RACK__";
      const selectedScheduleRows = () => [...overlay.querySelectorAll("[data-vendor-schedule]:checked")];
      const shipmentTotal = () => primaryQty + selectedScheduleRows().reduce((sum, row) => sum + number(row.dataset.qty), 0);
      const selectedStockRows = () => [...overlay.querySelectorAll("[data-vendor-stock]:checked")];
      const stockTotal = () => selectedStockRows().reduce((sum, row) => sum + number(row.dataset.qty), 0);
      const refreshValidation = () => {
        const required = shipmentTotal();
        const available = stockTotal();
        const valid = selectedStockRows().length > 0 && available + 0.005 >= required;
        overlay.querySelector("[data-vendor-stock-total]").textContent = `${qty(available, primary.uomCode)} ${primary.uomCode || ""}`;
        overlay.querySelector("[data-vendor-send-total]").textContent = `${qty(required, primary.uomCode)} ${primary.uomCode || ""}`;
        validation.className = `vendor-send-validation ${valid ? "is-ready" : "is-short"}`;
        validation.innerHTML = valid
          ? `<b>Siap dikirim.</b><span>Stock terpilih ${esc(qty(available, primary.uomCode))}; kebutuhan ${esc(qty(required, primary.uomCode))} ${esc(primary.uomCode || "")}.</span>`
          : `<b>Stock terpilih belum cukup.</b><span>Tersedia ${esc(qty(available, primary.uomCode))}; kebutuhan ${esc(qty(required, primary.uomCode))} ${esc(primary.uomCode || "")}.</span>`;
        submit.disabled = !valid;
      };
      const renderStocks = () => {
        const warehouseCode = warehouseSelect.value;
        const selectedRack = rackSelect.value;
        const rows = stockOptions.filter((row) => row.warehouseCode === warehouseCode && rackKey(row.rackCode) === selectedRack);
        stockList.innerHTML = rows.map((row) => `<label class="vendor-send-stock-row"><input type="checkbox" data-vendor-stock value="${esc(row.stockBalanceId)}" data-qty="${esc(row.qtyAvailable)}" checked><span><b>${esc(row.lotNumber || "Tanpa lot")}</b><small>${esc(row.partCode || primary.inputPartCode || "-")} · ${esc(row.rackName || "Tanpa rack")}</small></span><strong>${esc(qty(row.qtyAvailable, row.uomCode))} ${esc(row.uomCode || "")}</strong></label>`).join("") || `<div class="vendor-send-empty">Tidak ada stock pada lokasi ini.</div>`;
        refreshValidation();
      };
      const renderRacks = () => {
        const warehouseCode = warehouseSelect.value;
        const racks = [...new Map(stockOptions.filter((row) => row.warehouseCode === warehouseCode).map((row) => [rackKey(row.rackCode), row])).values()];
        const enoughRack = racks.find((rack) => stockOptions
          .filter((row) => row.warehouseCode === warehouseCode && rackKey(row.rackCode) === rackKey(rack.rackCode))
          .reduce((sum, row) => sum + number(row.qtyAvailable), 0) >= shipmentTotal()) || racks[0];
        rackSelect.innerHTML = racks.map((row) => `<option value="${esc(rackKey(row.rackCode))}" ${rackKey(row.rackCode) === rackKey(enoughRack?.rackCode) ? "selected" : ""}>${esc(row.rackCode || "Tanpa rack")} — ${esc(row.rackName || "Tanpa rack")}</option>`).join("");
        renderStocks();
      };

      warehouseSelect.addEventListener("change", renderRacks);
      rackSelect.addEventListener("change", renderStocks);
      overlay.addEventListener("change", (event) => {
        if (event.target.matches("[data-vendor-stock], [data-vendor-schedule]")) refreshValidation();
      });
      overlay.querySelector("[data-vendor-send-form]").addEventListener("submit", (event) => {
        event.preventDefault();
        if (submit.disabled) return;
        const shipments = [
          { orderNumber: primary.orderNumber || config.recordKey, qtySent: primaryQty },
          ...selectedScheduleRows().map((row) => ({ orderNumber: row.value, qtySent: number(row.dataset.qty) })),
        ];
        close({
          sourceType: "PREVIOUS_WIP",
          sourceWarehouseCode: warehouseSelect.value,
          sourceRackCode: rackSelect.value === "__NO_RACK__" ? null : rackSelect.value,
          sourceStockBalanceIds: selectedStockRows().map((row) => row.value),
          shipments,
        });
      });
      overlay.querySelectorAll("[data-vendor-send-cancel]").forEach((button) => button.addEventListener("click", () => close()));
      overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
      overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
      renderRacks();
      warehouseSelect.focus();
    });
  }
  async function collectPurchaseOrderLines(selected) {
    const vendorProcessPr = String(currentRecord?.procurementCategory || currentRecord?.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS";
    const [supplierRows, vendorRows] = await Promise.all([
      vendorProcessPr ? Promise.resolve([]) : api("/master-data/api/suppliers?start=0&length=500&isDeleted=false"),
      vendorProcessPr ? api("/master-data/api/vendors?start=0&length=500&isDeleted=false") : Promise.resolve([]),
    ]);
    const suppliers = Array.isArray(supplierRows) ? supplierRows : [];
    const vendors = Array.isArray(vendorRows) ? vendorRows : [];
    const supplierOptions = (selectedCode = "") => [
      `<option value="">Pilih ${vendorProcessPr ? "vendor" : "supplier"}</option>`,
      ...vendors.map((vendor) => `<option value="${esc(vendor.vendorCode)}" ${vendor.vendorCode === selectedCode ? "selected" : ""}>${esc(vendor.vendorCode)} — ${esc(vendor.vendorName || "")}</option>`),
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
        <header><div><p class="ops-eyebrow">Edit Keputusan PR</p><h2>${vendorProcessPr ? "Vendor & Jadwal Proses" : "Supplier & Bentuk Material"}</h2><p>${vendorProcessPr ? "Vendor, qty kirim, dan target kembali berasal dari Capacity Planning serta tetap dapat direview sebelum PO." : "Ubah keputusan final sebelum PO dibuat. Perubahan tetap mempertahankan trace MPS/MRP asal."}</p></div><button type="button" class="btn-close" data-modal-cancel aria-label="Tutup"></button></header>
        <div class="ops-modal-body">
          <div class="alert alert-info">${vendorProcessPr ? "Jangan mengubah qty tanpa menyesuaikan Production Capacity. Delivery di PR Vendor Process adalah tanggal barang ditargetkan kembali dari vendor." : "Satu kebutuhan boleh dipecah ke beberapa supplier, bentuk material, lebar tersedia, dan delivery phase. Simpan di PR; saat Move to PO data ini langsung dipakai tanpa konfirmasi ulang."}</div>
          <div class="table-responsive"><table class="table ops-collection-table"><thead><tr><th>Baris</th><th>Outstanding</th><th>${vendorProcessPr ? "Qty Kirim" : "Order Qty"}</th><th>${vendorProcessPr ? "Vendor" : "Supplier"}</th>${vendorProcessPr ? "" : "<th>Bentuk</th><th>Lebar</th><th>Panjang Sheet</th>"}<th>${vendorProcessPr ? "Target Kembali" : "Delivery"}</th><th>Harga / ${vendorProcessPr ? "Unit" : "KG"}</th></tr></thead><tbody>
            ${modalLines.map(({ checkbox, allocation }) => {
              const rawMaterial = checkbox.dataset.rawMaterial === "true";
              const outstanding = number(checkbox.dataset.outstanding);
              const sourceQty = allocation
                ? number(allocation.commercialQty ?? (saved.length === 1 ? outstanding : allocation.demandCoveredQty))
                : outstanding;
              const demandCoveredQty = allocation ? number(allocation.demandCoveredQty) : Math.min(sourceQty, outstanding);
              const requestUom = checkbox.dataset.requestUom || "KG";
              const initialForm = allocation?.purchasePackageUomCode || checkbox.dataset.packageUom;
              return `<tr data-po-modal-line data-pr-detail-id="${esc(checkbox.dataset.prDetailId)}" data-sourcing-allocation-id="${esc(allocation?.id || "")}" data-outstanding="${esc(outstanding)}" data-demand-covered-qty="${esc(demandCoveredQty)}" data-request-uom="${esc(requestUom)}" data-raw-material="${rawMaterial ? "true" : "false"}">
                <td><b>${esc(checkbox.dataset.lineNumber)}</b><div class="d-flex gap-1 mt-1"><button class="btn btn-sm btn-outline-primary" type="button" data-po-add-allocation>+ Phase</button><button class="btn btn-sm btn-outline-danger invisible" type="button" data-po-remove-allocation>x</button></div></td>
                <td>${esc(num(sourceQty))} ${rawMaterial ? esc(requestUom) : ""}</td>
                <td><input class="form-control form-control-sm" data-po-source-qty type="number" min="0.000001" step="any" value="${esc(sourceQty)}" required></td>
                <td><select class="form-select form-select-sm" data-po-partner required>${supplierOptions(vendorProcessPr ? (allocation?.vendorCode || checkbox.dataset.supplierCode || "") : (allocation?.supplierCode || checkbox.dataset.supplierCode || ""))}</select></td>
                ${vendorProcessPr ? "" : `<td>${rawMaterial ? `<select class="form-select form-select-sm" data-po-form><option value="SHEET" ${initialForm === "SHEET" ? "selected" : ""}>SHEET</option><option value="COIL" ${initialForm === "COIL" ? "selected" : ""}>COIL</option><option value="PCS" ${initialForm === "PCS" ? "selected" : ""}>PCS</option></select>` : '<span class="ops-muted">Sesuai PR</span>'}</td>
                <td>${rawMaterial ? `<input class="form-control form-control-sm" data-po-width type="number" min="0.001" step="0.001" value="${esc(allocation?.materialWidth ?? detail?.width ?? "")}" required>` : "-"}</td>
                <td>${rawMaterial ? `<div data-sheet-length-field class="${initialForm === "SHEET" ? "" : "d-none"}"><input class="form-control form-control-sm" data-po-length type="number" min="0.001" step="0.001" value="${esc(allocation?.materialLength ?? detail?.materialLength ?? "")}" placeholder="mm" ${initialForm === "SHEET" ? "required" : ""}></div>` : "-"}</td>`}
                <td><input class="form-control form-control-sm" data-po-delivery-date type="date" value="${esc(String(allocation?.deliveryDate || checkbox.dataset.requiredDate || (globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10)).slice(0, 10))}" required></td>
                <td><input class="form-control form-control-sm" data-po-unit-price type="number" min="0" step="any" value="${allocation?.unitPrice ?? ""}" placeholder="Opsional"></td>
              </tr>`;
            }).join("")}
          </tbody></table></div>
          <div class="alert alert-secondary" data-po-allocation-summary></div>
          <div class="ops-modal-grid"><label><span>Draft PO tujuan</span><input class="form-control" data-po-target placeholder="Opsional, mis. P-PO/S001/07/2026/01"><small>Kosongkan untuk membuat Draft PO baru per ${vendorProcessPr ? "vendor" : "supplier"}/currency/delivery.</small></label></div>
          <div class="alert alert-danger d-none" data-modal-alert></div>
        </div>
        <footer><button type="button" class="btn btn-outline-secondary" data-modal-cancel>Batal</button><button type="submit" class="btn btn-primary">Simpan Keputusan PR</button></footer>
      </form>`;
    document.body.appendChild(overlay);
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
      refreshAllocationStatus();
    });
    overlay.addEventListener("change", (event) => {
      if (!event.target.matches("[data-po-form]")) return;
      const row = event.target.closest("[data-po-modal-line]");
      const sheet = event.target.value === "SHEET";
      row.querySelector("[data-sheet-length-field]")?.classList.toggle("d-none", !sheet);
      const lengthInput = row.querySelector("[data-po-length]");
      if (lengthInput) {
        lengthInput.required = sheet;
        if (!sheet) lengthInput.value = "";
      }
    });
    overlay.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-po-add-allocation]");
      if (addButton) {
        const sourceRow = addButton.closest("[data-po-modal-line]");
        const clone = sourceRow.cloneNode(true);
        clone.dataset.sourcingAllocationId = "";
        clone.dataset.demandCoveredQty = "";
        clone.querySelector("[data-po-source-qty]").value = "";
        clone.querySelector("[data-po-unit-price]").value = "";
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
          const partnerCode = row.querySelector("[data-po-partner]").value;
          if (!partnerCode) {
            alertBox.textContent = `${vendorProcessPr ? "Vendor" : "Supplier"} baris ${row.dataset.prDetailId} wajib dipilih.`;
            alertBox.classList.remove("d-none");
            return;
          }
          const line = {
            prDetailId: row.dataset.prDetailId,
            sourcingAllocationId: row.dataset.sourcingAllocationId || null,
            ...(vendorProcessPr ? { vendorCode: partnerCode } : { supplierCode: partnerCode }),
            sourceQty,
            commercialQty: sourceQty,
            demandCoveredQty: row.dataset.demandCoveredQty === "" ? sourceQty : Math.min(number(row.dataset.demandCoveredQty), sourceQty),
            deliveryDate: row.querySelector("[data-po-delivery-date]").value,
            unitPrice: row.querySelector("[data-po-unit-price]").value === ""
              ? null
              : number(row.querySelector("[data-po-unit-price]").value),
          };
          if (row.dataset.rawMaterial === "true") {
            const purchasePackageUomCode = row.querySelector("[data-po-form]").value;
            Object.assign(line, {
              purchasePackageUomCode,
              materialWidth: number(row.querySelector("[data-po-width]").value),
              materialLength: purchasePackageUomCode === "SHEET" ? number(row.querySelector("[data-po-length]").value) : null,
            });
          }
          lines.push(line);
        }
        close({ lines, targetPoNumber: overlay.querySelector("[data-po-target]").value.trim() || null });
      });
    });
  }
  function finalizedPurchaseOrderLines(selected) {
    const manualPr = String(currentRecord?.sourceType || "").toUpperCase() === "MANUAL";
    const lines = selected.flatMap((checkbox) => {
      const detail = (currentRecord?.details || []).find((row) => String(row.id) === String(checkbox.dataset.prDetailId));
      const confirmed = (detail?.sourcingAllocations || [])
        .filter((allocation) => !allocation.isDeleted && allocation.status === "Confirmed")
        .map((allocation) => ({ prDetailId: detail.id, sourcingAllocationId: allocation.id }));
      if (confirmed.length) return confirmed;
      if (!manualPr) return [];
      const supplierCode = detail?.confirmedSupplierCode || detail?.proposedSupplierCode || detail?.preferredSupplier || checkbox.dataset.supplierCode || null;
      const vendorCode = detail?.preferredVendor || null;
      return [{
        prDetailId: detail.id,
        supplierCode,
        vendorCode,
        sourceQty: Math.max(number(detail?.qty) - number(detail?.orderedQty), 0),
        purchasePackageUomCode: detail?.purchasePackageUomCode || checkbox.dataset.packageUom || null,
        purchasePackageQty: detail?.purchasePackageQty ?? null,
        conversionUomCode: detail?.conversionUomCode || null,
        conversionFactor: detail?.conversionFactor ?? null,
        convertedPurchaseQty: detail?.convertedPurchaseQty ?? null,
        materialWidth: detail?.width ?? null,
        materialLength: detail?.materialLength ?? null,
        deliveryDate: String(currentRecord?.requiredDate || "").slice(0, 10) || null,
        unitPrice: detail?.estimatedPrice ?? null,
      }];
    });
    if (!lines.length) throw new Error(String(currentRecord?.procurementCategory || currentRecord?.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS"
      ? "Keputusan vendor dan target kembali belum final. Gunakan Review Vendor & Jadwal terlebih dahulu."
      : "Keputusan supplier dan bentuk material belum final. Gunakan Edit Supplier & Material Form terlebih dahulu.");
    return { lines };
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
  async function collectQcReleaseLocation() {
    const sourceLocation = currentRecord?.qcSourceLocation || {};
    const [warehouseRows, rackRows] = await Promise.all([
      api("/modules/api/inventory/warehouses?limit=500&isActive=true"),
      api("/modules/api/inventory/racks?limit=1000&isActive=true"),
    ]);
    const warehouses = (Array.isArray(warehouseRows) ? warehouseRows : [])
      .filter((row) => row.warehouseCode && row.isActive !== false)
      .sort((left, right) => String(left.warehouseCode).localeCompare(String(right.warehouseCode)));
    const racks = (Array.isArray(rackRows) ? rackRows : [])
      .filter((row) => row.rackCode && row.isActive !== false)
      .sort((left, right) => String(left.rackCode).localeCompare(String(right.rackCode)));
    const preferredWarehouse = warehouses.some((row) => row.warehouseCode === sourceLocation.warehouseCode)
      ? sourceLocation.warehouseCode
      : warehouses.find((row) => row.warehouseCode === "WH-001")?.warehouseCode || warehouses[0]?.warehouseCode || "";
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop";
    overlay.innerHTML = `
      <form class="ops-modal qci-release-modal" data-qci-release-form>
        <header>
          <div>
            <p class="ops-eyebrow">QC Release Stock</p>
            <h2>Konfirmasi Lokasi Stok OK</h2>
            <p>Pilih lokasi aktif dari master Warehouse dan Rack. Rack hanya menampilkan pilihan milik warehouse terpilih.</p>
          </div>
          <button type="button" class="btn-close" data-modal-cancel aria-label="Tutup"></button>
        </header>
        <div class="ops-modal-body">
          <div class="ops-modal-grid">
            <label>
              <span>Warehouse tujuan *</span>
              <select class="form-select" data-qci-warehouse required>
                <option value="">${warehouses.length ? "Pilih warehouse" : "Warehouse aktif belum tersedia"}</option>
                ${warehouses.map((row) => `<option value="${esc(row.warehouseCode)}" ${row.warehouseCode === preferredWarehouse ? "selected" : ""}>${esc(row.warehouseCode)} — ${esc(row.warehouseName || "Tanpa nama")}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Rack tujuan</span>
              <select class="form-select" data-qci-rack></select>
              <small>Rack bersifat opsional jika warehouse mengizinkan stok tanpa rack.</small>
            </label>
            <label>
              <span>Lot / Batch</span>
              <input class="form-control" value="${esc(sourceLocation.lotNumber || currentRecord?.batchNumber || "-")}" readonly>
            </label>
            <label>
              <span>Qty Release</span>
              <input class="form-control" value="${esc(num(currentRecord?.qtyPassed, isDiscreteUom(currentRecord?.uomCode) ? 0 : 2))} ${esc(currentRecord?.uomCode || "PCS")}" readonly>
            </label>
          </div>
          <div class="alert ${warehouses.length ? "alert-info" : "alert-warning"}">${warehouses.length ? "Lokasi dipilih dari master aktif dan akan menjadi tujuan stock movement hasil QC." : "Warehouse aktif belum tersedia. Tambahkan dahulu melalui Master Data → Gudang."}</div>
        </div>
        <footer>
          <button type="button" class="btn btn-outline-secondary" data-modal-cancel>Batal</button>
          <button type="submit" class="btn btn-primary" ${warehouses.length ? "" : "disabled"}>QC OK & Release Stock</button>
        </footer>
      </form>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const warehouseSelect = overlay.querySelector("[data-qci-warehouse]");
    const rackSelect = overlay.querySelector("[data-qci-rack]");
    const refreshRacks = () => {
      const warehouseCode = warehouseSelect.value;
      const matchingRacks = racks.filter((row) => row.warehouseCode === warehouseCode);
      const selectedRack = matchingRacks.some((row) => row.rackCode === sourceLocation.rackCode) ? sourceLocation.rackCode : "";
      rackSelect.innerHTML = `<option value="">${warehouseCode ? "Tanpa rack" : "Pilih warehouse terlebih dahulu"}</option>${matchingRacks.map((row) => `<option value="${esc(row.rackCode)}" ${row.rackCode === selectedRack ? "selected" : ""}>${esc(row.rackCode)} — ${esc(row.rackName || row.zone || "Tanpa nama")}</option>`).join("")}`;
      rackSelect.disabled = !warehouseCode;
    };
    warehouseSelect.addEventListener("change", refreshRacks);
    refreshRacks();
    return new Promise((resolve) => {
      const close = (result) => {
        overlay.remove();
        if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open");
        resolve(result);
      };
      overlay.querySelectorAll("[data-modal-cancel]").forEach((button) => button.addEventListener("click", () => close(null)));
      overlay.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (!warehouseSelect.value) return;
        close({ warehouseCode: warehouseSelect.value, rackCode: rackSelect.value || null });
      });
    });
  }
  function collectNgJudgment() {
    const totalNg = number(currentRecord?.qtyNg);
    const overlay = document.createElement("div");
    overlay.className = "ops-modal-backdrop";
    overlay.innerHTML = `
      <form class="ops-modal ngd-judgment-modal" data-ngd-judgment-form>
        <header>
          <div>
            <p class="ops-eyebrow">QC Judgment NG</p>
            <h2>Tentukan Rework & Final Reject</h2>
            <p>Seluruh Qty NG harus dialokasikan. Total Rework + Final Reject wajib sama dengan ${esc(num(totalNg, isDiscreteUom(currentRecord?.uomCode) ? 0 : 2))} ${esc(currentRecord?.uomCode || "PCS")}.</p>
          </div>
          <button type="button" class="btn-close" data-modal-cancel aria-label="Tutup"></button>
        </header>
        <div class="ops-modal-body">
          <div class="ops-modal-grid">
            <label><span>Qty Rework *</span><input class="form-control" data-ngd-rework type="number" min="0" max="${esc(totalNg)}" step="${isDiscreteUom(currentRecord?.uomCode) ? "1" : "0.001"}" value="${esc(totalNg)}" required></label>
            <label><span>Qty Final Reject *</span><input class="form-control" data-ngd-reject type="number" min="0" max="${esc(totalNg)}" step="${isDiscreteUom(currentRecord?.uomCode) ? "1" : "0.001"}" value="0" required></label>
            <label style="grid-column:1/-1"><span>Catatan QC</span><textarea class="form-control" data-ngd-notes rows="3" placeholder="Temuan, alasan keputusan, atau instruksi rework"></textarea></label>
          </div>
          <div class="alert alert-info" data-ngd-balance></div>
        </div>
        <footer>
          <button type="button" class="btn btn-outline-secondary" data-modal-cancel>Batal</button>
          <button type="submit" class="btn btn-primary" data-ngd-submit>Simpan Judgment</button>
        </footer>
      </form>`;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    const reworkInput = overlay.querySelector("[data-ngd-rework]");
    const rejectInput = overlay.querySelector("[data-ngd-reject]");
    const balance = overlay.querySelector("[data-ngd-balance]");
    const submit = overlay.querySelector("[data-ngd-submit]");
    const refreshBalance = () => {
      const allocated = number(reworkInput.value) + number(rejectInput.value);
      const remaining = totalNg - allocated;
      const valid = Math.abs(remaining) <= 0.000001 && number(reworkInput.value) >= 0 && number(rejectInput.value) >= 0;
      balance.className = `alert ${valid ? "alert-success" : "alert-warning"}`;
      balance.textContent = valid ? `Alokasi sesuai: ${num(allocated)} dari ${num(totalNg)}.` : `Sisa yang belum sesuai: ${num(remaining)}. Sesuaikan Rework atau Final Reject.`;
      submit.disabled = !valid;
    };
    reworkInput.addEventListener("input", refreshBalance);
    rejectInput.addEventListener("input", refreshBalance);
    refreshBalance();
    return new Promise((resolve) => {
      const close = (result) => {
        overlay.remove();
        if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open");
        resolve(result);
      };
      overlay.querySelectorAll("[data-modal-cancel]").forEach((button) => button.addEventListener("click", () => close(null)));
      overlay.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const qtyRework = number(reworkInput.value);
        const qtyReject = number(rejectInput.value);
        if (Math.abs(qtyRework + qtyReject - totalNg) > 0.000001) return;
        close({ qtyRework, qtyReject, qcNotes: overlay.querySelector("[data-ngd-notes]").value.trim() || null });
      });
    });
  }
  function workflowActions(record) {
    const status = String(record.status || "Draft").toLowerCase();
    let html = "";
    if (config.module === "planning-ppic" && config.page.slug === "monthly-production-plans") {
      if (status === "draft") {
        const blockingCount = number(record.planReadiness?.summary?.blocking);
        const stale = record.replanRequired || record.sourceReconciliation?.current === false;
        if (stale) {
          const currentMrp = record.sourceReconciliation?.currentMrpRunNumber;
          if (currentMrp) html += `<a class="btn btn-primary" href="/modules/planning-ppic/mrp/${encodeURIComponent(currentMrp)}">Sinkronkan dari MRP Current</a>`;
          html += '<button class="btn btn-secondary" type="button" disabled>Confirm diblokir</button><small>Draft memakai revision lama. Buka MRP current lalu jalankan Buat Production Plan.</small>';
        } else if (blockingCount > 0) {
          html += `<a class="btn btn-primary" href="/modules/planning-ppic/capacity-planning?planNumber=${encodeURIComponent(record.planNumber || config.recordKey)}">Jalankan Capacity Check</a><button class="btn btn-secondary" type="button" disabled>Confirm diblokir</button><small>Selesaikan blocker capacity, material, dan data integrity.</small>`;
        } else html += actionButton("confirm-monthly-plan", "Confirm Production Plan", "primary", "Approval internal MPP; plan belum executable sebelum Release for Execution.");
      }
      if (status === "confirmed") {
        html += `<a class="btn btn-outline-primary" href="/modules/planning-ppic/capacity-planning?planNumber=${encodeURIComponent(record.planNumber || config.recordKey)}">Buka Capacity Check</a>`;
        html += actionButton("release-monthly-plan", "Release for Execution", "primary", "Membuat MPP executable setelah Capacity Check dan seluruh blocker selesai.");
      }
      if (/released|in progress/.test(status)) {
        const remainingLines = (record.details || []).filter((row) =>
          row.lineType === "FG Receipt"
          && number(row.qtyPlanned) > number(row.qtyReleased)
          && !/cancelled|converted/i.test(row.status || ""));
        if (remainingLines.length) html += actionButton("create-mo-references", "Buat MO Reference", "outline-primary", "MO direferensikan dari Production Plan; schedule harian dibuat PPIC.");
        if ((record.manufacturingOrders || []).length) html += actionButton("convert-daily-plans", "Publish Allocation ke Daily Plan", "primary", "Publikasikan draft allocation mesin-tanggal menjadi Daily Production Plan.");
      }
      return html || '<small>Production Plan tersedia untuk monitoring.</small>';
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
      const vendorProcessPr = String(record.procurementCategory || record.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS";
      if (/draft|revising|rejected|approved|partially-ordered/.test(status)) html += actionButton("edit-sourcing", vendorProcessPr ? "Review Vendor & Jadwal" : "Edit Supplier & Material Form", "outline-secondary", vendorProcessPr ? "Vendor dan qty berasal dari Capacity Planning; target kembali dapat direview sebelum PO." : "Keputusan ini disimpan di PR dan dipakai langsung saat membuat PO.");
      if (/draft|revising|rejected/.test(status)) html += actionButton("submit", "Submit PR", "primary", "Kirim PR ke alur approval.");
      if (/submitted|pending|checking|waiting/.test(status)) html += actionButton("approve", "Approve PR", "primary", "Approval mengikuti Approval Master.");
      if (/approved|partially-ordered/.test(slug(status))) html += actionButton("make-po", vendorProcessPr ? "Buat PO Vendor Process" : "Move to PO Supplier", "outline-primary", vendorProcessPr ? "Buat PO Out Process untuk vendor yang sudah dikonfirmasi." : "Buat PO baru atau gabungkan ke Draft PO supplier yang sudah ada.");
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
      html += '<button type="button" class="btn btn-outline-primary" data-po-pdf aria-label="Export Purchase Order ke PDF">Export PDF</button>';
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
    if (config.page.vendorProcessFlow) {
      if (["SEND", "ALL"].includes(config.page.vendorProcessFlow) && /planned|waiting-material|ready-to-send|partial-sent/.test(slug(status))) {
        html += record.materialReady === true
          ? actionButton("send", "Kirim ke Vendor", "primary", record.materialReadinessMessage || "Material input telah siap.")
          : disabledActionButton("Menunggu Material", record.materialReadinessMessage || "Selesaikan proses sebelumnya dan pastikan WIP input mencukupi.");
      }
      if (["RECEIVE", "ALL"].includes(config.page.vendorProcessFlow) && /sent|partial-received/.test(slug(status))) html += actionButton("receive", "Terima dari Vendor", "primary");
      if (["SEND", "ALL"].includes(config.page.vendorProcessFlow) && !/closed|cancelled/.test(status)) html += actionButton("reprice", "Hitung Ulang Harga", "outline-primary");
      return html || '<small>Vendor Process Order ini tidak memiliki transisi aktif pada queue ini.</small>';
    }
    if (!["production", "qc"].includes(config.module)) {
      if (config.module === "incoming" || (config.module === "purchasing" && ["goods-receipts", "incoming-inspections"].includes(config.page.slug))) {
        if (config.page.slug === "goods-receipts" && /received pending inspection/.test(status)) {
          html += actionButton("create-inspection", "Proses dengan QC", "primary", "Buat IQC dari seluruh baris Goods Receipt.");
          html += actionButton("direct-release", "Release Tanpa QC", "outline-primary", "Posting seluruh qty diterima langsung ke stock Available dengan audit alasan bypass.");
          return html;
        }
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
        if (["on-process", "on process"].includes(status)) {
          html += actionButton("pack", "Tandai Packing", "outline-primary");
          html += record.fgReady === true
            ? actionButton("ship", "Kirim Shipment", "primary", record.fgReadinessMessage || "FG siap dikirim.")
            : disabledActionButton("Menunggu FG Receipt", record.fgReadinessMessage || "FG Receipt/stock belum mencukupi untuk seluruh delivery line.");
          return html;
        }
        if (["in-transit", "in transit"].includes(status)) { html += actionButton("pod", "Konfirmasi POD", "primary"); html += actionButton("fail", "Tandai Gagal Kirim", "outline-danger"); return html; }
      }
      if (config.module === "inventory" && config.page.slug === "stock-opname") {
        if (status === "draft") { html += actionButton("start-counting", "Mulai Counting", "primary", "Ambil snapshot terbaru dan freeze saldo."); html += actionButton("cancel", "Batalkan STO", "outline-danger"); }
        if (status === "counting") { html += `<a class="btn btn-primary" href="/modules/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/count">Buka Form Counting</a>`; html += actionButton("submit", "Submit ke Checker", "outline-primary", "Buka hasil blind count untuk pemeriksaan checker."); html += actionButton("cancel", "Batalkan & Unfreeze", "outline-danger"); }
        if (status === "waiting-check") { html += actionButton("check", "Checker Terima Hasil", "primary", "Checker harus berbeda dari maker dan penghitung ronde aktif."); html += actionButton("request-recount", "Minta Recount", "outline-primary", "Wajib bila selisih ronde pertama melebihi toleransi."); html += actionButton("cancel", "Batalkan & Unfreeze", "outline-danger"); }
        if (status === "waiting-approval") { html += actionButton("approve", "Approve Opname", "primary", "Maker, checker, dan penghitung ronde aktif tidak boleh melakukan approval."); html += actionButton("request-recount", "Minta Recount", "outline-primary"); html += actionButton("cancel", "Batalkan & Unfreeze", "outline-danger"); }
        if (status === "approved") { html += actionButton("adjust", "Post Adjustment", "outline-primary", "Posting selisih ke stock movement."); html += actionButton("request-recount", "Minta Recount", "outline-primary", "Gunakan jika saldo berubah atau hasil perlu dihitung ulang."); }
        if (status === "adjusted") html += actionButton("close", "Close STO", "primary");
        return html || '<small>Stock opname sudah selesai atau belum memiliki transisi yang tersedia.</small>';
      }
      if (config.module === "inventory" && config.page.slug === "material-issues") {
        if (status === "draft") html += actionButton("prepare", "Mulai Persiapan", "primary", "Warehouse memilih rack, lot, dan quantity yang akan disiapkan.");
        if (status === "preparing") html += actionButton("issue", "Selesai Persiapan & Issue", "primary", "Konfirmasi persiapan selesai untuk memotong stok dan menyerahkan material ke Production.");
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
    } else if (config.page.slug === "material-issues") {
      return '<small>Material Issue hanya reference di Production. Consume/issue stok dilakukan pada modul Inventory.</small>';
    } else if (config.page.slug === "quality-inspections") {
      if (status === "draft") html += actionButton("complete", "QC OK & Release Stock", "primary", "Kurangi QC Hold dan jadikan stok tersedia untuk proses berikutnya. Jika ini proses final, lanjutkan melalui FG Receipt.");
      if (status === "completed" && /accepted|conditional-accept/.test(slug(record.decision))) {
        if (record.fgReceiptEligible === true) {
          html += actionButton("receive-fg", "Masukkan ke Gudang FG", "primary", `Final output sudah QC Accepted. Posting ${num(record.fgReceiptPendingQty || record.qtyPassed)} ke warehouse/rack FG melalui FG Receipt.`);
        } else {
          html += '<small>QC selesai. Hasil ini adalah WIP dan stoknya sudah tersedia untuk Material Issue proses berikutnya.</small>';
          const stockQuery = record.part?.partCode ? `?q=${encodeURIComponent(record.part.partCode)}` : "";
          html += `<a class="btn btn-outline-primary" href="/modules/inventory/stock-balances${stockQuery}">Lihat Stok Gudang</a>`;
        }
      }
    } else if (config.page.ngDispositionFlow) {
      if (status === "pending_qc" || status === "pending qc") html += actionButton("judge", "Tentukan Rework & Reject", "primary", "Rework + Final Reject harus sama dengan seluruh Qty NG.");
      else html += `<small>Judgment selesai: ${esc(record.qtyRework || 0)} rework, ${esc(record.qtyReject || 0)} reject.</small>`;
    } else if (config.page.slug === "production-logs" && /draft|open/.test(status)) {
      html += actionButton("submit", "Submit Production Entry", "primary");
    } else if (config.page.slug === "production-logs" && /submitted/.test(status)) {
      const ngReasons = (Array.isArray(record.coilPhases) ? record.coilPhases : [])
        .flatMap((phase) => Array.isArray(phase.ngReasons) ? phase.ngReasons : []);
      const pendingNg = ngReasons.filter((reason) => slug(reason.status) === "pending-qc");
      const recordedNgQty = ngReasons.reduce((sum, reason) => sum + number(reason.qtyNg), 0);
      const incompleteNgReasons = number(record.qtyReject) > 0
        && (!ngReasons.length || Math.abs(recordedNgQty - number(record.qtyReject)) > 0.000001);
      if (incompleteNgReasons) {
        html += disabledActionButton("Lengkapi Reason NG", "Total reason per phase harus sama dengan Qty NG sebelum Production Entry dapat disetujui.");
      } else {
        html += actionButton(
          "approve",
          pendingNg.length ? "Approve Qty OK" : "Approve Production Entry",
          "primary",
          pendingNg.length
            ? `Qty OK diproses ke stock WIP sekarang; ${pendingNg.length} NG tetap menunggu judgment QC.`
            : "Approval mengikuti Approval Master; disposition NG mengikuti judgment QC.",
        );
        if (pendingNg.length) html += '<a class="btn btn-outline-primary" href="/modules/qc/ng-dispositions">Buka QC Rework Station</a>';
      }
    } else if (config.page.slug === "production-logs" && status === "approved") {
      const pendingNg = (Array.isArray(record.coilPhases) ? record.coilPhases : [])
        .flatMap((phase) => Array.isArray(phase.ngReasons) ? phase.ngReasons : [])
        .filter((reason) => slug(reason.status) === "pending-qc");
      if (number(record.qcRemainingQty) > 0) {
        html += actionButton("ensure-qc", "Buka / Buat QC Release Stock", "primary", "Buat antrean pelepasan hasil OK dari QC Hold ke stock tersedia.");
      }
      if (pendingNg.length) {
        html += '<a class="btn btn-outline-primary" href="/modules/qc/ng-dispositions">Judgment Qty NG</a>';
        html += `<small>Qty OK sudah diproses terpisah; ${pendingNg.length} reason NG masih menunggu keputusan QC.</small>`;
      }
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
    $("ops-detail-title").textContent = isIncomingInspectionPage() ? "Pemeriksaan Barang Masuk" : title;
    const referencePart = record.partName || record.part?.partName || record.partCode || record.part?.partCode || record.customerName || record.customer?.customerName || record.machineName || record.machine?.machineName;
    $("ops-detail-subtitle").textContent = [config.page.label, config.moduleLabel, referencePart].filter(Boolean).join(" · ");
    $("ops-detail-subtitle").textContent = `${config.page.label} · ${config.moduleLabel}`;
    $("ops-detail-status").innerHTML = badge(status);
    $("ops-detail-subtitle").textContent = [config.page.label, config.moduleLabel, referencePart].filter(Boolean).join(" · ");
    const prEditLink = $("pr-edit-link");
    if (prEditLink) {
      const editableStatus = ["draft", "revision-required", "rejected"].includes(slug(record.status));
      const vendorProcessPr = String(record.procurementCategory || record.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS";
      prEditLink.classList.toggle("d-none", !editableStatus || (vendorProcessPr && record.sourceType !== "MANUAL"));
      const categorySlug = ({ MATERIAL: "material", PURCHASE_PART: "purchase-part", UNIVERSAL_PURCHASE_PART: "universal-purchase-part", VENDOR_PROCESS: "vendor-process", NON_PRODUCTION: "non-production" })[String(record.procurementCategory || record.procurementGroup || "").toUpperCase()];
      if (categorySlug) prEditLink.href = `/modules/purchasing/purchase-requisitions/${encodeURIComponent(record.prNumber || config.recordKey)}/edit?category=${encodeURIComponent(categorySlug)}`;
    }
    const productionLogEditLink = $("production-log-edit-link");
    if (productionLogEditLink) {
      productionLogEditLink.classList.toggle("d-none", slug(record.status) === "approved");
    }
    const dailyPlanEditLink = $("daily-plan-edit-link");
    if (dailyPlanEditLink) {
      dailyPlanEditLink.classList.toggle("d-none", !["draft", "released", "in-progress"].includes(slug(record.status)));
    }
    if (isNgDispositionPage()) {
      $("ops-detail-title").textContent = `NG · ${record.logNumber || "Production Entry"} · Phase ${record.phaseNumber || "-"}`;
      $("ops-detail-subtitle").textContent = [record.partName, record.partNumber ? `PN ${record.partNumber}` : null, record.processName || record.processCode].filter(Boolean).join(" · ");
      prepareNgDispositionChrome(record);
      renderNgDispositionFields(record);
      renderNgDispositionCollections(record);
    } else if (isQualityInspectionPage()) {
      const part = record.part || {};
      $("ops-detail-title").textContent = record.inspectionNumber || config.recordKey;
      $("ops-detail-subtitle").textContent = [part.partName || record.partName, part.partCode || record.partCode, record.batchNumber].filter(Boolean).join(" · ");
      prepareQualityInspectionChrome(record);
      renderQualityInspectionFields(record);
      renderQualityInspectionCollections(record);
    } else if (isDailySchedulePage()) {
      document.querySelector(".ops-page")?.classList.add("daily-schedule-workbench");
      renderDailyScheduleFields(record);
      renderDailyScheduleCollections(record);
      const backLink = $("ops-detail-back-link");
      if (backLink && record.scheduleDate) backLink.href = `/modules/production/daily-production-schedules?date=${encodeURIComponent(String(record.scheduleDate).slice(0, 10))}`;
    } else if (isMaterialIssuePage()) {
      $("ops-detail-subtitle").textContent = `Permintaan material operasional · ${record.workOrder?.process?.processName || record.workOrder?.process?.processCode || "Produksi"} · ${record.warehouseCode || "Warehouse"}`;
      renderMaterialIssueFields(record);
      renderMaterialIssueCollections(record);
    } else if (isIncomingInspectionPage()) {
      const supplier = record.gr?.po?.supplierName || record.gr?.po?.vendorName || "Supplier";
      $("ops-detail-subtitle").textContent = `${record.inspectionNumber} · ${supplier} · PO ${record.gr?.poNumber || "-"}`;
      renderIncomingInspectionFields(record);
      renderIncomingInspectionCollections(record);
      document.querySelector(".ops-detail-aside")?.classList.toggle("d-none", String(record.status || "").toUpperCase() === "OPEN");
    } else if (isPurchaseOrderPage()) {
      renderPurchaseOrderFields(record);
      renderPurchaseOrderCollections(record);
    } else if (isPurchaseRequisitionPage()) {
      renderPurchaseRequisitionFields(record);
      renderCollections(record);
    } else if (isPlannedOrderPage()) {
      document.querySelector(".ops-page")?.classList.add("planned-order-detail-page");
      renderPlannedOrderSheet(record);
      renderPlannedOrderCollections(record);
    } else if (isMonthlyPlanPage()) {
      document.querySelector(".ops-page")?.classList.add("mpp-workbench-page");
      $("ops-detail-title").textContent = record.planNumber || config.recordKey;
      $("ops-detail-subtitle").textContent = record.planningIdentity?.supersededByPlanNumber
        ? `Production Plan arsip · owner aktif ${record.planningIdentity.supersededByPlanNumber} · tidak dihitung ulang`
        : `Production Plan · ${record.planningIdentity?.crossMonth ? "Cross-month horizon" : "Single horizon"} · bulan hanya filter kalender`;
      monthlyPlanSummaryFields(record);
      renderMonthlyPlanCollections(record);
    } else {
      renderFields(record);
      renderCollections(record);
    }
    renderMeta(record);
    $("ops-workflow-actions").innerHTML = workflowActions(record);
    if (isDeliveryPage()) {
      $("ops-workflow-actions").insertAdjacentHTML("beforeend", `<button type="button" class="btn btn-outline-primary" data-delivery-download="note.pdf">Unduh Surat Jalan + QR</button><a class="btn btn-outline-secondary" href="/modules/outgoing/scan">Scan Surat Jalan</a>${String(record.podUrl || "").startsWith("private-delivery:") ? '<button type="button" class="btn btn-outline-secondary" data-delivery-download="evidence/pod">Unduh Bukti POD</button>' : ""}${String(record.receivedSignature || "").startsWith("private-delivery:") ? '<button type="button" class="btn btn-outline-secondary" data-delivery-download="evidence/signature">Unduh Tanda Tangan</button>' : ""}<small class="delivery-live" id="delivery-live-status">Diperbarui ${esc(new Date().toLocaleTimeString("id-ID"))} · otomatis setiap 15 detik</small>`);
    }
    if (config.module === "inventory" && config.page.slug === "stock-opname") {
      $("ops-workflow-actions").insertAdjacentHTML("beforeend", '<button type="button" class="btn btn-outline-primary" data-opname-download="report.pdf">Laporan Opname PDF</button><button type="button" class="btn btn-outline-primary" data-opname-download="report.xlsx">Laporan Opname Excel</button><button type="button" class="btn btn-outline-secondary" data-opname-download="labels.pdf">Cetak Label QR</button>');
    }
    if (isStockBalancePage()) $("ops-workflow-actions").insertAdjacentHTML("beforeend", `<a class="btn btn-outline-primary" href="/modules/inventory/stock-policy/${encodeURIComponent(record.id || config.recordKey)}">Atur Minimum Stok & Reorder</a>`);
    if (isIncomingInspectionPage()) $("ops-workflow-actions").insertAdjacentHTML("beforeend", `<a class="btn btn-outline-primary" href="/modules/incoming/inspections/${encodeURIComponent(record.inspectionNumber || config.recordKey)}/checklist">Checklist Pemeriksaan & Laporan</a>`);
    if ((config.module === "incoming" || config.module === "purchasing") && config.page.slug === "goods-receipts") $("ops-workflow-actions").insertAdjacentHTML("beforeend", `<a class="btn btn-outline-primary" href="/modules/incoming/documents/${encodeURIComponent(record.grNumber || config.recordKey)}">Dokumen Surat Jalan Supplier</a>`);
    $("ops-detail-loading").classList.add("d-none"); $("ops-detail-shell").classList.remove("d-none");
    requestAnimationFrame(() => { if (isStockBalancePage()) initializeGoodsReceiptWorkspace(); else initializeTransactionWorkspace(); });
    if (config.module === "purchasing" && config.page.slug === "purchase-suggestions") filterPurchaseSuggestionCards();
  }
  async function load({ quiet = false } = {}) {
    if (isDeliveryPage() && detailLoading) return;
    detailLoading = true;
    try {
      if (config.module === "purchasing" && config.page.slug === "purchase-suggestions") loadSupplierLookup().catch(() => {});
      const record = await api(`/modules/api/${config.module}/${config.page.slug}/${encodeURIComponent(config.recordKey)}`, isDeliveryPage() ? { signal: AbortSignal.timeout(12000) } : {});
      if (!quiet || (!deliveryActionPending && !document.querySelector("dialog[open]"))) render(record);
    } catch (error) {
      $("ops-detail-loading").classList.add("d-none");
      if (quiet && $("delivery-live-status")) $("delivery-live-status").textContent = "Pembaruan tertunda; mencoba lagi dalam 15 detik.";
      else showAlert(error.message);
    } finally { detailLoading = false; }
  }
  async function refreshPurchaseSuggestionAfterConfirmation() {
    const tableShell = document.querySelector(".ps-table-shell");
    const scrollState = { top: tableShell?.scrollTop || 0, left: tableShell?.scrollLeft || 0 };
    const record = await api(`/modules/api/${config.module}/${config.page.slug}/${encodeURIComponent(config.recordKey)}`);
    currentRecord = record;
    renderCollections(record);
    $("ops-detail-status").innerHTML = badge(record.status || "Draft");
    renderMeta(record);
    $("ops-workflow-actions").innerHTML = workflowActions(record);
    filterPurchaseSuggestionCards();
    const refreshedShell = document.querySelector(".ps-table-shell");
    if (refreshedShell) {
      refreshedShell.scrollTop = scrollState.top;
      refreshedShell.scrollLeft = scrollState.left;
    }
    return record;
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
    const prGroups = new Set(selected.flatMap((checkbox) => {
      const row = checkbox.closest("[data-ps-row]");
      const category = row?.dataset.prCategory;
      return String(row?.dataset.prSuppliers || "UNCONFIRMED").split("|").filter(Boolean).map((supplier) => `${category}|${supplier}`);
    }));
    if (countLabel) countLabel.textContent = `${selected.length} item dipilih`;
    if (qtyLabel) qtyLabel.textContent = `Total qty ${num(totalQty)}`;
    if (createButton) {
      createButton.disabled = !selected.length;
      createButton.textContent = prGroups.size > 1 ? `Buat ${prGroups.size} Draft PR Terpisah` : "Buat 1 Draft PR";
    }
  }
  function filterPurchaseSuggestionCards() {
    const search = String(document.querySelector("[data-ps-search-input]")?.value || "").trim().toLowerCase();
    const status = String(document.querySelector("[data-ps-status-filter]")?.value || "");
    const confirmation = String(document.querySelector("[data-ps-confirmation-filter]")?.value || "");
    const category = String(document.querySelector("[data-ps-category-filter]")?.value || "");
    const grouping = String(document.querySelector("[data-ps-due-group]")?.value || "");
    document.querySelectorAll("[data-ps-group-row]").forEach((row) => row.remove());
    let visible = 0;
    let lastGroup = null;
    document.querySelectorAll("[data-ps-row]").forEach((row) => {
      const show = (!search || row.dataset.psSearch.includes(search)) && (!status || row.dataset.psStatus === status) && (!confirmation || row.dataset.psConfirmation === confirmation) && (!category || row.dataset.psCategory === category);
      row.classList.toggle("d-none", !show);
      const editorRow = row.nextElementSibling?.matches("[data-ps-editor-row]") ? row.nextElementSibling : null;
      if (!show) editorRow?.classList.add("d-none");
      if (show && grouping) {
        const groupKey = row.dataset[`due${grouping[0].toUpperCase()}${grouping.slice(1)}`] || "Tanpa due date";
        if (groupKey !== lastGroup) {
          const groupRow = document.createElement("tr");
          groupRow.dataset.psGroupRow = "";
          groupRow.className = "ps-group-row";
          groupRow.innerHTML = `<td colspan="11"><b>Due ${esc(groupKey)}</b></td>`;
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
    if (event.target.matches("[data-iqc-rejected]")) updateIncomingInspectionSummary();
    if (event.target.matches("[data-ps-search-input]")) filterPurchaseSuggestionCards();
    if (event.target.matches("[data-ps-custom-qty]")) updatePurchaseSuggestionSelection();
    if (event.target.matches("[data-confirm-qty], [data-confirm-moq], [data-moq-coverage-qty], [data-moq-reserve-qty]")) refreshMoqAllocationPlanner(event.target);
    if (event.target.matches("[data-confirm-qty], [data-confirm-moq], [data-split-qty], [data-split-moq], [data-split-multiple]")) refreshSupplierAllocationSummary(event.target);
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-confirm-supplier], [data-split-supplier]")) {
      const container = event.target.closest("[data-supplier-split], [data-suggestion-confirmation]");
      lookupSuggestionSupplierMaster(container, { force: true, clearMissing: true });
    }
    if (event.target.matches("[data-confirm-form], [data-split-form]")) {
      const container = event.target.closest("[data-supplier-split], [data-suggestion-confirmation]");
      const sheet = event.target.value === "SHEET";
      const field = container?.querySelector("[data-sheet-length-field]");
      field?.classList.toggle("d-none", !sheet);
      const lengthInput = field?.querySelector("[data-confirm-length], [data-split-length]");
      if (lengthInput) {
        lengthInput.required = sheet;
        if (!sheet) lengthInput.value = "";
      }
    }
    if (event.target.matches("[data-ps-status-filter], [data-ps-confirmation-filter], [data-ps-category-filter], [data-ps-due-group]")) filterPurchaseSuggestionCards();
    if (event.target.matches("[data-confirm-status]")) {
      const hint = event.target.closest("[data-suggestion-confirmation]")?.querySelector("[data-confirm-status-hint]");
      if (hint) hint.textContent = suggestionStatusHint(event.target.value);
    }
    if (event.target.matches("[data-confirm-status], [data-confirm-supplier], [data-split-status], [data-split-supplier], [data-split-date]")) refreshSupplierAllocationSummary(event.target);
    if (event.target.matches("[data-ps-select]")) {
      filterPurchaseSuggestionCards();
    }
    if (event.target.matches("[data-ps-select-all]")) {
      document.querySelectorAll("[data-ps-row]:not(.d-none) [data-ps-select]:not(:disabled)").forEach((checkbox) => { checkbox.checked = event.target.checked; });
      filterPurchaseSuggestionCards();
    }
    if (event.target.matches("[data-moq-candidate-check]")) refreshMoqAllocationPlanner(event.target);
  });
  document.addEventListener("click", async (event) => {
    const autoConfirmSuppliersButton = event.target.closest("[data-auto-confirm-suppliers]");
    if (autoConfirmSuppliersButton) {
      const pendingCount = (currentRecord?.items || []).filter((item) => !/ready|converted|covered/i.test(item.status || "")).length;
      if (!confirm(`Auto konfirmasi ${pendingCount} item? Sistem mencari supplier dengan harga aktif, memakai qty Purchase Suggestion, dan mengisi lead time aktual 2 hari. Item tanpa harga tetap Not Confirmed.`)) return;
      const originalLabel = autoConfirmSuppliersButton.textContent;
      autoConfirmSuppliersButton.disabled = true;
      autoConfirmSuppliersButton.textContent = "Memproses...";
      try {
        const result = await api(`/modules/api/purchasing-suggestions/${encodeURIComponent(config.recordKey)}/auto-confirm-suppliers`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        await refreshPurchaseSuggestionAfterConfirmation();
        const otherSkipped = (result.results || []).filter((row) => row.status === "SKIPPED" && row.reasonCode !== "PRICE_NOT_FOUND");
        const details = [
          `${num(result.confirmedCount, 0)} item berhasil dikonfirmasi otomatis`,
          result.skippedWithoutPriceCount ? `${num(result.skippedWithoutPriceCount, 0)} item tanpa harga dilewati` : null,
          otherSkipped.length ? `${num(otherSkipped.length, 0)} item lain perlu dilengkapi manual` : null,
        ].filter(Boolean).join(". ");
        showAlert(`${details}.`, result.confirmedCount > 0 ? "success" : "warning");
      } catch (error) {
        showAlert(error.message);
        autoConfirmSuppliersButton.disabled = false;
        autoConfirmSuppliersButton.textContent = originalLabel;
      }
      return;
    }
    const autoMoqAllocationButton = event.target.closest("[data-moq-auto-allocation]");
    if (autoMoqAllocationButton) {
      const editor = autoMoqAllocationButton.closest("[data-suggestion-confirmation]");
      const planner = editor?.querySelector("[data-moq-allocation-planner]");
      const purchaseQty = roundedPurchaseQty(editor?.querySelector("[data-confirm-qty]")?.value, editor?.querySelector("[data-confirm-moq]")?.value, editor?.dataset.orderMultiple);
      let remaining = Math.max(purchaseQty - number(planner?.dataset.baseDemand), 0);
      planner?.querySelectorAll("[data-moq-candidate]").forEach((candidate) => {
        const checkbox = candidate.querySelector("[data-moq-candidate-check]");
        const coverageInput = candidate.querySelector("[data-moq-coverage-qty]");
        const reserveInput = candidate.querySelector("[data-moq-reserve-qty]");
        if (candidate.dataset.currentDemand === "true") {
          remaining = Math.max(remaining - number(reserveInput.value), 0);
          return;
        }
        const takeQty = Math.min(number(coverageInput.dataset.demandQty), remaining);
        checkbox.checked = takeQty > 0;
        coverageInput.value = takeQty > 0 ? takeQty : number(coverageInput.dataset.demandQty);
        reserveInput.value = 0;
        remaining = Math.max(remaining - takeQty, 0);
      });
      refreshMoqAllocationPlanner(editor);
      return;
    }
    const materialIssueCalculationButton = event.target.closest("[data-mi-calculation]");
    if (materialIssueCalculationButton) {
      const detailId = materialIssueCalculationButton.closest("tr")?.dataset.detailId;
      const lineNumber = materialIssueCalculationButton.closest("tr")?.dataset.lineNumber;
      const row = (currentRecord?.details || []).find((candidate) =>
        (detailId && String(candidate.id) === String(detailId))
        || (!detailId && String(candidate.lineNumber) === String(lineNumber)));
      if (!row) { showAlert("Asal dan rumus Material Issue tidak ditemukan."); return; }
      openMaterialIssueTraceModal(row);
      return;
    }
    const acceptIqcRowButton = event.target.closest("[data-iqc-accept-row]");
    if (acceptIqcRowButton) {
      const rejectedInput = acceptIqcRowButton.closest("[data-iqc-detail]")?.querySelector("[data-iqc-rejected]");
      if (rejectedInput) rejectedInput.value = 0;
      updateIncomingInspectionSummary();
      return;
    }
    const acceptAllIqcButton = event.target.closest("[data-iqc-accept-all]");
    if (acceptAllIqcButton) {
      document.querySelectorAll("[data-iqc-rejected]").forEach((input) => { input.value = 0; });
      updateIncomingInspectionSummary();
      return;
    }
    const referenceButton = event.target.closest("[data-reference-popup]");
    if (referenceButton) {
      const itemId = referenceButton.closest("[data-ps-row]")?.dataset.itemId;
      const row = (currentRecord?.items || []).find((candidate) => String(candidate.id) === String(itemId));
      if (!row) { showAlert("Data full reference tidak ditemukan."); return; }
      openReferenceModal(row, currentRecord);
      return;
    }
    const dueCalculationButton = event.target.closest("[data-due-calculation]");
    if (dueCalculationButton) {
      const itemId = dueCalculationButton.closest("[data-ps-row]")?.dataset.itemId;
      const row = (currentRecord?.items || []).find((candidate) => String(candidate.id) === String(itemId));
      if (!row) { showAlert("Data perhitungan due date tidak ditemukan."); return; }
      openDueCalculationModal(row);
      return;
    }
    const openSuggestionEditor = event.target.closest("[data-open-suggestion-editor]");
    if (openSuggestionEditor) {
      const rowElement = openSuggestionEditor.closest("[data-ps-row]");
      const item = (currentRecord?.items || []).find((candidate) => String(candidate.id) === String(rowElement?.dataset.itemId));
      if (!item) { showAlert("Detail item Purchase Suggestion tidak ditemukan."); return; }
      await openSuggestionConfirmationModal(item);
      return;
    }
    const closeSuggestionEditor = event.target.closest("[data-close-suggestion-editor]");
    if (closeSuggestionEditor) {
      closeSuggestionEditor.closest(".ps-confirmation-backdrop")?.remove();
      if (!document.querySelector(".ops-modal-backdrop")) document.body.classList.remove("modal-open");
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
      const editor = removeSupplierSplitButton.closest("[data-suggestion-confirmation]");
      removeSupplierSplitButton.closest("[data-supplier-split]")?.remove();
      refreshSupplierAllocationSummary(editor);
      return;
    }
    const addSupplierSplitButton = event.target.closest("[data-add-supplier-split]");
    if (addSupplierSplitButton) {
      const editor = addSupplierSplitButton.closest("[data-suggestion-confirmation]");
      const item = (currentRecord?.items || []).find((candidate) => String(candidate.id) === String(editor?.dataset.itemId)) || {};
      editor.querySelector("[data-supplier-splits]").insertAdjacentHTML("beforeend", suggestionSplitRow(item, { splitMode: "supplier", confirmationStatus: "Not Confirmed" }));
      const added = editor.querySelector("[data-supplier-splits] [data-supplier-split]:last-child");
      refreshSupplierAllocationSummary(editor);
      added?.querySelector("[data-split-supplier]")?.focus();
      return;
    }
    const addDeliverySplitButton = event.target.closest("[data-add-delivery-split]");
    if (addDeliverySplitButton) {
      const editor = addDeliverySplitButton.closest("[data-suggestion-confirmation]");
      const item = (currentRecord?.items || []).find((candidate) => String(candidate.id) === String(editor?.dataset.itemId)) || {};
      const supplierCode = editor.querySelector("[data-confirm-supplier]")?.value?.trim();
      if (!supplierCode) { showAlert("Pilih supplier utama sebelum menambah split delivery."); return; }
      const allocation = {
        splitMode: "delivery",
        supplierCode,
        confirmationStatus: editor.querySelector("[data-confirm-status]")?.value || "Confirmed",
        confirmedQty: 0,
        deliveryDate: "",
        moq: optionalInputNumber(editor.querySelector("[data-confirm-moq]")),
        orderMultiple: optionalInputNumber(editor.querySelector("[data-confirm-multiple]")) ?? number(editor.dataset.orderMultiple),
        leadTimeDays: optionalInputNumber(editor.querySelector("[data-confirm-lead]")),
        unitPrice: optionalInputNumber(editor.querySelector("[data-confirm-price]")),
        currencyCode: editor.querySelector("[data-confirm-currency]")?.value || null,
        materialWidth: optionalInputNumber(editor.querySelector("[data-confirm-width]")),
        materialLength: optionalInputNumber(editor.querySelector("[data-confirm-length]")),
        purchasePackageUomCode: editor.querySelector("[data-confirm-form]")?.value || null,
      };
      editor.querySelector("[data-supplier-splits]").insertAdjacentHTML("beforeend", suggestionSplitRow(item, allocation));
      const added = editor.querySelector("[data-supplier-splits] [data-supplier-split]:last-child");
      const supplierSelect = added?.querySelector("[data-split-supplier]");
      if (supplierSelect) supplierSelect.disabled = true;
      refreshSupplierAllocationSummary(editor);
      added?.querySelector("[data-split-qty]")?.focus();
      return;
    }
    const saveSuggestionButton = event.target.closest("[data-save-suggestion-confirmation]");
    if (saveSuggestionButton) {
      const editor = saveSuggestionButton.closest("[data-suggestion-confirmation]");
      const confirmationStatus = editor.querySelector("[data-confirm-status]").value;
      const confirmedMoq = optionalInputNumber(editor.querySelector("[data-confirm-moq]"));
      const confirmedQtyInput = editor.querySelector("[data-confirm-qty]");
      const confirmedQty = roundedPurchaseQty(confirmedQtyInput.value, confirmedMoq, editor.dataset.orderMultiple);
      confirmedQtyInput.value = confirmedQty || "";
      const supplierCode = editor.querySelector("[data-confirm-supplier]").value.trim();
      const confirmedDeliveryDate = editor.querySelector("[data-confirm-date]").value || null;
      const bypassConfirmationReason = editor.querySelector("[data-confirm-bypass]").value.trim() || null;
      const supplierAllocations = [...editor.querySelectorAll("[data-supplier-split]")].map((split) => ({
        splitMode: split.dataset.splitMode || "supplier",
        supplierCode: split.querySelector("[data-split-supplier]").value.trim() || null,
        confirmationStatus: split.querySelector("[data-split-status]").value,
        confirmedQty: roundedPurchaseQty(split.querySelector("[data-split-qty]").value, split.querySelector("[data-split-moq]").value, split.querySelector("[data-split-multiple]").value),
        deliveryDate: split.querySelector("[data-split-date]").value || null,
        moq: optionalInputNumber(split.querySelector("[data-split-moq]")),
        orderMultiple: optionalInputNumber(split.querySelector("[data-split-multiple]")),
        leadTimeDays: optionalInputNumber(split.querySelector("[data-split-lead]")),
        unitPrice: optionalInputNumber(split.querySelector("[data-split-price]")),
        currencyCode: split.querySelector("[data-split-currency]").value.trim() || null,
        materialWidth: optionalInputNumber(split.querySelector("[data-split-width]")),
        materialLength: split.querySelector("[data-split-form]")?.value === "SHEET" ? number(split.querySelector("[data-split-length]")?.value) : null,
        purchasePackageUomCode: split.querySelector("[data-split-form]")?.value || null,
        alternativeMaterialCode: split.querySelector("[data-split-material]").value.trim() || null,
        supplierRemark: split.querySelector("[data-split-remark]").value.trim() || null,
      })).filter((allocation) => allocation.supplierCode || allocation.confirmedQty > 0);
      const moqDemandAllocations = [...editor.querySelectorAll("[data-moq-candidate]")].filter((candidate) => candidate.querySelector("[data-moq-candidate-check]")?.checked).map((candidate) => {
        const coverageInput = candidate.querySelector("[data-moq-coverage-qty]");
        const reserveInput = candidate.querySelector("[data-moq-reserve-qty]");
        const isCurrentDemand = candidate.dataset.currentDemand === "true";
        const demandCoveredQty = isCurrentDemand ? 0 : Math.max(number(coverageInput.value), 0);
        const reservedAllocationQty = Math.max(number(reserveInput.value), 0);
        return {
          sourceItemId: coverageInput.dataset.sourceItemId,
          sourceRequirementId: coverageInput.dataset.sourceRequirementId,
          demandCoveredQty,
          reservedAllocationQty,
          qty: demandCoveredQty + reservedAllocationQty,
          demandQty: number(coverageInput.dataset.demandQty),
        };
      }).filter((allocation) => allocation.qty > 0);
      const allocationCapacity = Math.max(confirmedQty - number(editor.querySelector("[data-moq-allocation-planner]")?.dataset.baseDemand), 0);
      const allocatedFutureQty = moqDemandAllocations.reduce((sum, allocation) => sum + allocation.qty, 0);
      if (!["Not Confirmed", "Waiting Supplier Confirmation", "Not Available"].includes(confirmationStatus) && confirmedQty <= 0) { showAlert("Confirmed quantity harus lebih dari 0."); return; }
      const invalidSplit = supplierAllocations.find((allocation) => isConfirmedSuggestionStatus(allocation.confirmationStatus) && (!allocation.supplierCode || allocation.confirmedQty <= 0 || !allocation.deliveryDate));
      if (invalidSplit) { showAlert("Setiap allocation tambahan yang confirmed wajib memiliki supplier, qty lebih dari 0, dan delivery date."); return; }
      const invalidSupplierMode = supplierAllocations.find((allocation) => allocation.splitMode === "supplier" && String(allocation.supplierCode).toUpperCase() === supplierCode.toUpperCase());
      if (invalidSupplierMode) { showAlert("Supplier tambahan harus berbeda dari supplier utama. Untuk supplier yang sama, gunakan tombol Split Delivery."); return; }
      const invalidDeliveryMode = supplierAllocations.find((allocation) => allocation.splitMode === "delivery" && String(allocation.supplierCode).toUpperCase() !== supplierCode.toUpperCase());
      if (invalidDeliveryMode) { showAlert("Split Delivery harus memakai supplier yang sama dengan supplier utama."); return; }
      const primaryDeliveryKey = String(confirmedDeliveryDate || "").slice(0, 10);
      const duplicateDelivery = supplierAllocations.find((allocation) => allocation.splitMode === "delivery" && String(allocation.deliveryDate || "").slice(0, 10) === primaryDeliveryKey);
      if (duplicateDelivery) { showAlert("Tanggal Split Delivery harus berbeda dari delivery supplier utama."); return; }
      const excessiveCoverage = moqDemandAllocations.find((allocation) => allocation.demandCoveredQty > allocation.demandQty + 0.000001);
      if (excessiveCoverage) { showAlert("Coverage Demand tidak boleh melebihi demand asli. Masukkan kelebihan qty ke Custom Reserve."); return; }
      if (allocatedFutureQty > allocationCapacity + 0.000001) { showAlert(`Total alokasi tambahan melebihi kelebihan MOQ sebesar ${num(allocatedFutureQty - allocationCapacity)} ${editor.dataset.uom || ""}.`); return; }
      saveSuggestionButton.disabled = true;
      const originalSaveLabel = saveSuggestionButton.textContent;
      saveSuggestionButton.textContent = "Menyimpan...";
      try {
        const updatedItem = await api(`/modules/api/purchasing-suggestions/${encodeURIComponent(config.recordKey)}/items/${encodeURIComponent(editor.dataset.itemId)}`, { method: "PATCH", body: JSON.stringify({
          confirmationStatus, confirmedQty, confirmedDeliveryDate,
          confirmedMoq,
          confirmedLeadTimeDays: optionalInputNumber(editor.querySelector("[data-confirm-lead]")),
          confirmedUnitPrice: optionalInputNumber(editor.querySelector("[data-confirm-price]")),
          confirmedMaterialWidth: optionalInputNumber(editor.querySelector("[data-confirm-width]")),
          confirmedMaterialLength: editor.querySelector("[data-confirm-form]")?.value === "SHEET" ? number(editor.querySelector("[data-confirm-length]")?.value) : null,
          purchasePackageUomCode: editor.querySelector("[data-confirm-form]")?.value || null,
          currencyCode: editor.querySelector("[data-confirm-currency]").value.trim() || null,
          supplierRemark: editor.querySelector("[data-confirm-remark]").value.trim() || null,
          alternativeSupplierCode: supplierCode || null,
          alternativeMaterialCode: editor.querySelector("[data-confirm-material]").value.trim() || null,
          bypassConfirmationReason,
          supplierAllocations: supplierAllocations.map(({ splitMode: _splitMode, ...allocation }) => allocation),
          moqDemandAllocations,
          moqAllocationEdited: Boolean(editor.querySelector("[data-moq-allocation-planner]")),
        }) });
        await refreshPurchaseSuggestionAfterConfirmation();
        const panel = editor.closest("[data-suggestion-editor]");
        const saveState = panel?.querySelector("[data-confirm-save-state]");
        const liveState = panel?.querySelector("[data-confirm-live-state]");
        if (saveState) {
          saveState.classList.remove("d-none");
          saveState.querySelector("b").textContent = `${updatedItem.materialCode || updatedItem.partCode || "Item"} tersimpan.`;
        }
        if (liveState) liveState.innerHTML = `<i></i> Tersimpan ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format((globalThis.erpBusinessNow?.() || new Date()))}`;
        saveSuggestionButton.textContent = "Tersimpan";
        showAlert("Konfirmasi supplier tersimpan. Dialog tetap terbuka dan tabel sudah diperbarui.", "success");
      } catch (error) { showAlert(error.message); }
      finally {
        saveSuggestionButton.disabled = false;
        if (saveSuggestionButton.textContent === "Menyimpan...") saveSuggestionButton.textContent = originalSaveLabel;
      }
      return;
    }
    const deliveryDownload = event.target.closest("[data-delivery-download]");
    if (deliveryDownload && isDeliveryPage()) {
      deliveryDownload.disabled = true;
      try {
        const suffix = deliveryDownload.dataset.deliveryDownload;
        if (!["note.pdf", "evidence/pod", "evidence/signature"].includes(suffix)) return;
        const response = await fetch(`/modules/api/outgoing/delivery-schedules/${encodeURIComponent(config.recordKey)}/${suffix}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
        if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
        if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || "Dokumen pengiriman gagal diunduh."); }
        const href = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a"); anchor.href = href;
        anchor.download = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || `Surat-Jalan-${config.recordKey}.pdf`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      } catch (error) { showAlert(error.message); }
      finally { deliveryDownload.disabled = false; }
      return;
    }
    const opnameDownload = event.target.closest("[data-opname-download]");
    if (opnameDownload && config.module === "inventory" && config.page.slug === "stock-opname") {
      opnameDownload.disabled = true;
      try {
        const suffix = opnameDownload.dataset.opnameDownload;
        if (!["report.pdf", "report.xlsx", "labels.pdf"].includes(suffix)) return;
        const response = await fetch(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/${suffix}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
        if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
        if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || "Dokumen opname gagal diunduh."); }
        const href = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = href;
        anchor.download = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || `${config.recordKey}-${suffix}`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      } catch (error) { showAlert(error.message); } finally { opnameDownload.disabled = false; }
      return;
    }
    const pdfButton = event.target.closest("[data-po-pdf]");
    if (pdfButton) {
      pdfButton.disabled = true;
      const originalLabel = pdfButton.textContent;
      pdfButton.textContent = "Membuat PDF...";
      try {
        const response = await fetch(`/modules/api/purchasing-po/${encodeURIComponent(config.recordKey)}/pdf`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (response.status === 401) {
          location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || "PDF Purchase Order gagal dibuat.");
        }
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") || "";
        const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
        const filename = filenameMatch?.[1] || `${String(currentRecord?.poNumber || config.recordKey).replace(/[^a-z0-9._-]+/gi, "-")}.pdf`;
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
        showAlert("PDF Purchase Order berhasil diunduh. Part number dengan spesifikasi yang sama sudah digabung di kolom Reference.", "success");
      } catch (error) {
        showAlert(error.message);
      } finally {
        pdfButton.disabled = false;
        pdfButton.textContent = originalLabel;
      }
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
    if (action === "adjust" && config.module === "inventory" && config.page.slug === "stock-opname") {
      try {
        const preview = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/adjust-preview`);
        if (Array.isArray(preview.conflicts) && preview.conflicts.length) {
          showAlert(`Adjustment belum dapat diposting: ${preview.conflicts.map((conflict) => `${conflict.item || conflict.detailId}: ${conflict.message}`).join(" | ")}`);
          return;
        }
      } catch (error) {
        showAlert(error.message);
        return;
      }
    }    const isCheck = action === "availability-check";
    const confirmationHandledByForm = action === "manual-complete"
      || (action === "send" && config.page.vendorProcessFlow)
      || (action === "complete" && config.page.slug === "quality-inspections")
      || (action === "judge" && config.page.ngDispositionFlow);
    if (!isCheck && !confirmationHandledByForm && !confirm(`${button.textContent.trim()} untuk ${config.recordKey}?`)) return;
    let requestBody = {};
    if (action === "reject" || action === "revise") {
      const documentLabel = config.page.slug === "purchase-order" ? "PO" : "PR";
      const reason = await window.formPrompt(action === "revise" ? `Alasan revisi ${documentLabel} (wajib):` : `Alasan penolakan ${documentLabel} (wajib):`, "", { title: "Alasan workflow" });
      if (!reason || !reason.trim()) return;
      requestBody = action === "revise"
        ? { revisionReason: reason.trim(), message: reason.trim() }
        : { reason: reason.trim(), rejectionReason: reason.trim() };
    } else if (action === "check" && config.module === "inventory" && config.page.slug === "stock-opname") {
      const acceptanceReason = await window.formPrompt(
        "Alasan penerimaan (wajib hanya jika setelah recount masih melewati toleransi):",
        "",
        { title: "Pemeriksaan Stock Opname" },
      );
      if (acceptanceReason === null || acceptanceReason === undefined) return;
      requestBody = { acceptanceReason: String(acceptanceReason).trim() || null };    } else if (action === "request-recount" || (action === "cancel" && config.module === "inventory" && config.page.slug === "stock-opname")) {
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
      try { requestBody = finalizedPurchaseOrderLines(selected); }
      catch (error) { showAlert(error.message); return; }
    } else if (action === "edit-sourcing") {
      const selected = [...document.querySelectorAll(".pr-po-line:checked")];
      if (!selected.length) { showAlert("Pilih minimal satu detail PR yang akan diedit."); return; }
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
      const paymentDate = await window.formPrompt("Tanggal payment (YYYY-MM-DD):", (globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10), { title: "Payment" });
      if (!paymentDate) return;
      requestBody = { amount: number(amount), paymentDate };
    } else if (action === "dispatch-daily") {
      const date = await window.formPrompt("Tanggal Daily Plan (YYYY-MM-DD):", (globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10), { title: "Dispatch Daily Plan" });
      if (!date) return;
      const shift = await window.formPrompt("Shift:", "1", { title: "Dispatch Daily Plan" });
      if (!shift) return;
      requestBody = { date, shift, workOrderNumbers: [config.recordKey] };
    } else if (action === "release-monthly-plan") {
      // Release must validate the exact same Current Use/default capacity
      // configuration shown on the MPP detail and Capacity Planning pages.
      // Never override it with a legacy one-shift assumption from the UI.
      requestBody = {};
    } else if (action === "create-mo-references") {
      const details = (currentRecord?.details || []).filter((row) =>
        row.lineType === "FG Receipt"
        && number(row.qtyPlanned) > number(row.qtyReleased)
        && !/cancelled|converted/i.test(row.status || ""));
      if (!details.length) { showAlert("Seluruh FG parent pada Production Plan sudah mempunyai MO reference.", "info"); return; }
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
    } else if (action === "direct-release") {
      const bypassReason = await window.formPrompt("Alasan release langsung tanpa QC:", "Item tidak memerlukan inspeksi QC", { title: "Release Tanpa QC" });
      if (!bypassReason?.trim()) return;
      requestBody = { bypassReason: bypassReason.trim() };
    } else if (action === "complete-inspection") {
      const rows = [...document.querySelectorAll("[data-iqc-detail]")];
      if (!rows.length) { showAlert("Detail IQC belum tersedia."); return; }
      requestBody.decisions = rows.map((row) => {
        const qtyRejected = number(row.querySelector("[data-iqc-rejected]")?.value);
        return {
          grDetailId: row.dataset.iqcGrDetail,
          qtyAccepted: number(row.querySelector("[data-iqc-accepted]")?.value),
          qtyRejected,
          rejectedDisposition: qtyRejected > 0 ? row.querySelector("[data-iqc-disposition]")?.value : null,
          dispositionReference: qtyRejected > 0 ? row.querySelector("[data-iqc-disposition-reference]")?.value?.trim() || null : null,
          notes: qtyRejected > 0 ? row.querySelector("[data-iqc-notes]")?.value?.trim() || null : null,
        };
      });
      if (requestBody.decisions.some((row) => !row.grDetailId || row.qtyAccepted < 0 || row.qtyRejected < 0 || row.qtyAccepted + row.qtyRejected <= 0)) { showAlert("Setiap baris IQC harus memiliki qty accepted atau rejected."); return; }
      if (requestBody.decisions.some((row) => row.qtyRejected > 0 && !row.rejectedDisposition)) { showAlert("Disposition wajib diisi untuk setiap qty reject."); return; }
      if (requestBody.decisions.some((row) => row.qtyRejected > 0 && row.rejectedDisposition === "RETURN_TO_SUPPLIER" && !row.dispositionReference)) { showAlert("Referensi retur wajib diisi untuk barang yang dikembalikan ke supplier."); return; }
    } else if (action === "dispose-rejected") {
      requestBody.decisions = [...document.querySelectorAll("[data-iqc-disposition-detail]")].map((row) => ({ inspectionDetailId: row.dataset.iqcDispositionDetail, rejectedDisposition: row.querySelector("[data-iqc-disposition]")?.value, dispositionReference: row.querySelector("[data-iqc-disposition-reference]")?.value?.trim() || null }));
      if (!requestBody.decisions.length) { showAlert("Tidak ada reject yang menunggu disposition."); return; }
      if (requestBody.decisions.some((row) => row.rejectedDisposition === "HOLD")) { showAlert("Pilih disposition final: Return to Supplier atau Scrap."); return; }
    } else if (["ship", "pod"].includes(action) && isDeliveryPage()) {
      if (deliveryActionPending) return;
      deliveryActionPending = true; button.disabled = true;
      try {
        const workflow = await deliveryTools();
        requestBody = await workflow.collect(action, currentRecord);
        if (!requestBody) { deliveryActionPending = false; button.disabled = false; return; }
      } catch (error) { deliveryActionPending = false; button.disabled = false; showAlert(error.message); return; }
    } else if (action === "fail") {
      const failureReason = await window.formPrompt("Alasan gagal kirim:", "", { title: "Shipment gagal" }); if (!failureReason || !failureReason.trim()) return;
      requestBody = { failureReason: failureReason.trim() };
    } else if (action === "send" && config.page.vendorProcessFlow) {
      try {
        requestBody = await openVendorSendModal();
        if (!requestBody) return;
      } catch (error) {
        showAlert(error.message);
        return;
      }
    } else if (action === "receive" && config.page.vendorProcessFlow) {
      const qty = await window.formPrompt("Qty diterima dari vendor:", "", { title: "Vendor Receipt" }); if (!qty || number(qty) <= 0) return;
      const warehouseCode = await window.formPrompt("Warehouse QC Hold:", "", { title: "Vendor Receipt" }); if (!warehouseCode?.trim()) return;
      const lotNumber = await window.formPrompt("Lot penerimaan:", "", { title: "Vendor Receipt" }); if (lotNumber === null) return;
      requestBody = { qty: number(qty), warehouseCode: warehouseCode.trim(), lotNumber: lotNumber.trim() || null };
    } else if (action === "reprice" && config.page.vendorProcessFlow) {
      const vendorRate = await window.formPrompt("Vendor rate manual (kosong = price list):", "", { title: "Vendor Rate" }); if (vendorRate === null) return;
      requestBody = vendorRate.trim() ? { vendorRate: number(vendorRate) } : {};
    } else if (action === "complete" && config.page.slug === "quality-inspections") {
      const sourceLocation = currentRecord?.qcSourceLocation || {};
      let locationDecision;
      try {
        locationDecision = await collectQcReleaseLocation();
        if (!locationDecision) return;
      } catch (error) {
        showAlert(error.message);
        return;
      }
      requestBody = {
        decision: "Accepted",
        passedDestination: {
          warehouseCode: locationDecision.warehouseCode,
          rackCode: locationDecision.rackCode,
          lotNumber: sourceLocation.lotNumber || currentRecord?.batchNumber || null,
          qty: number(currentRecord?.qtyPassed),
        },
      };
    } else if (action === "judge" && config.page.ngDispositionFlow) {
      const judgment = await collectNgJudgment();
      if (!judgment) return;
      requestBody = judgment;
    } else if (action === "approve" && config.page.slug === "production-logs") {
      // Production log approval posts the destination warehouse to the workflow
      // endpoint. The warehouse is operational context for the produced WIP and
      // is not persisted as a column on ProductionLog itself.
      requestBody = { warehouseCode: "WH-001" };
    }
    button.disabled = true;
    try {
      const workflow = config.module === "purchasing" ? "purchasing-workflow" : config.module === "qc" ? "qc-workflow" : "production-workflow";
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
      } else if (action === "edit-sourcing") {
        result = await api(`/modules/api/purchasing-pr/${encodeURIComponent(config.recordKey)}/confirm-suppliers`, { method: "PATCH", body: JSON.stringify(requestBody) });
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
      } else if (config.page.vendorProcessFlow) {
        result = await api(`/modules/api/vendor-process-workflow/${encodeURIComponent(config.recordKey)}/${encodeURIComponent(action)}`, { method: "POST", body: JSON.stringify(requestBody) });
      } else if (config.module === "incoming" || (config.module === "purchasing" && ["goods-receipts", "incoming-inspections"].includes(config.page.slug))) {
        const endpoint = action === "create-inspection"
          ? `/modules/api/incoming/goods-receipts/${encodeURIComponent(config.recordKey)}/create-inspection`
          : action === "direct-release"
            ? `/modules/api/incoming/goods-receipts/${encodeURIComponent(config.recordKey)}/release-without-qc`
            : `/modules/api/incoming/incoming-inspections/${encodeURIComponent(config.recordKey)}/${action === "complete-inspection" ? "complete" : action === "dispose-rejected" ? "dispose-rejected" : "putaway"}`;
        result = await api(endpoint, { method: "POST", body: JSON.stringify(action === "create-inspection" ? { grNumber: config.recordKey } : requestBody) });
      } else if (config.module === "outgoing" && ["delivery-schedules", "delivery-schedule"].includes(config.page.slug)) {
        result = await api(`/modules/api/outgoing/delivery-schedules/${encodeURIComponent(config.recordKey)}/${encodeURIComponent(action)}`, { method: "POST", body: JSON.stringify(requestBody) });
      } else {
        result = await api(`/modules/api/${workflow}/${config.page.slug}/${encodeURIComponent(config.recordKey)}/${action}`, { method: "POST", body: JSON.stringify(requestBody) });
      }
      if (config.module === "inventory" && config.page.slug === "stock-opname" && action === "start-counting") {
        showAlert("Counting dimulai. Membuka form input member.", "success");
        setTimeout(() => location.assign(`/modules/inventory/stock-opname/${encodeURIComponent(config.recordKey)}/count`), 350);
      } else if (isCheck) {
        let resultBox = document.querySelector(".ops-action-result");
        if (!resultBox) { resultBox = document.createElement("pre"); resultBox.className = "ops-action-result"; $("ops-workflow-actions").appendChild(resultBox); }
        resultBox.textContent = JSON.stringify(result, null, 2);
        showAlert("Pengecekan ketersediaan material selesai.", "success");
      } else if (action === "make-po" && (result?.poNumber || result?.purchaseOrder?.poNumber || result?.purchaseOrders?.[0]?.poNumber)) {
        const poNumber = result.poNumber || result.purchaseOrder?.poNumber || result.purchaseOrders[0].poNumber;
        const count = result.poCount || result.purchaseOrders?.length || 1;
        showAlert(`PR berhasil dikonsolidasikan menjadi ${count} PO. Membuka ${poNumber}.`, "success");
        setTimeout(() => location.assign(`/modules/purchasing/purchase-order/${encodeURIComponent(poNumber)}`), 450);
      } else if (action === "edit-sourcing") {
        const vendorProcessPr = String(currentRecord?.procurementCategory || currentRecord?.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS";
        showAlert(vendorProcessPr ? "Keputusan vendor dan jadwal kembali berhasil diperbarui." : "Keputusan supplier dan bentuk material pada PR berhasil diperbarui.", "success");
        await load();
      } else if (action === "convert-suggestion-to-pr") {
        const documents = Array.isArray(result.purchaseRequisitions) ? result.purchaseRequisitions : (result.prNumbers || []).map((prNumber) => ({ prNumber }));
        if (documents.length > 1) {
          await load();
          const box = $("ops-detail-alert");
          box.className = "alert alert-success";
          box.innerHTML = `<b>${esc(result.message || `${documents.length} Draft PR berhasil dibuat.`)}</b><div class="ps-created-pr-links">${documents.map((document) => `<a href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(document.prNumber)}"><span>${esc(document.prCategoryLabel || (document.procurementCategory === "PURCHASE_PART" ? "PR-Purchase-Part" : document.procurementCategory === "MATERIAL" ? "PR-Raw_Material" : "PR-Other"))}</span><b>${esc(document.prNumber)}</b><small>${esc(document.itemCount || 0)} item · Supplier ${esc(document.supplierCode || "-")}</small></a>`).join("")}</div>`;
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
        await load();
      } else if (action === "ensure-qc" && config.page.slug === "production-logs") {
        showAlert(result?.message || "QC Release Stock siap diproses.", "success");
        setTimeout(() => location.assign(result?.href || "/modules/qc/quality-inspections"), 450);
      } else if (action === "approve" && config.page.slug === "production-logs" && result?.carryover) {
        const carryover = result.carryover;
        const allocationCount = Array.isArray(carryover.targetAllocations) ? carryover.targetAllocations.length : 0;
        const capacityNote = carryover.status === "OVER_CAPACITY"
          ? " DPP tambahan prioritas dibuat karena kapasitas hari berikutnya penuh."
          : "";
        showAlert(`Production Entry disetujui. Shortfall ${num(carryover.shortfallQty)} dialokasikan ke ${allocationCount} DPP tanggal ${format(carryover.targetDate, "targetDate")}.${capacityNote}`, carryover.status === "OVER_CAPACITY" ? "warning" : "success");
        await load();
      } else {
        showAlert("Workflow berhasil diproses.", "success");
        await load();
      }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; deliveryActionPending = false; }
  });
  load();
  if (isDeliveryPage()) {
    const refreshDelivery = () => {
      if (document.hidden || deliveryActionPending || detailLoading || document.querySelector("dialog[open]") || document.querySelector("[data-workflow-action]:disabled")) return;
      load({ quiet: true });
    };
    deliveryPolling = setInterval(refreshDelivery, 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDelivery(); });
    window.addEventListener("pagehide", () => clearInterval(deliveryPolling));
  }
})();
