(() => {
  "use strict";
  const weeklyDeltaModel = window.PpicMrpWeeklyDeltaModel;
  const supplyModel = window.PpicMrpSupplyModel;
  const materialGroups = window.PpicMrpMaterialGroups;
  const nettingSummary = window.PpicMrpNettingSummary;
  const expandedMaterials = new Set();
  let selectedMaterialCategory = "MATERIAL";
  const cfg = JSON.parse(document.getElementById("mrps-config")?.textContent || "{}");
  let key = cfg.recordKey;
  const $ = (id) => document.getElementById(id);
  $("mrps-customer-supply")?.addEventListener("click", () => { location.href = `/modules/purchasing/customer-supplies${key ? `?run=${encodeURIComponent(key)}` : ""}`; });
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const savedMPlusOneDisplayMode = localStorage.getItem("mrps-mplus-display-mode");
  const shouldHideZeroMatrixRow = window.PpicMrpZeroFilter?.shouldHideZeroMatrixRow || (() => false);
  const summarizeCurrentStock = window.PpicMrpStockSummary?.summarizeCurrentStock || (() => ({ warehouseQty: 0, wipQty: 0, totalQty: 0, warehouseLines: [], wipLines: [] }));
  const state = { doc: null, view: "matrix", query: "", filter: "ALL", page: 1, pageSize: 25, requirementGrouping: localStorage.getItem("mrps-requirement-grouping") !== "FLAT" ? "GROUPED" : "FLAT", mPlusOneDisplayMode: savedMPlusOneDisplayMode === "FULL_EFD" ? "FULL_EFD" : "NET_CURRENT_STOCK", showCovered: localStorage.getItem("mrps-show-covered") === "1", expandedGroups: new Set(), defaultGroupInitialized: false, rows: new Map(), bucketCells: new Map(), action: null, recovery: null, autoLookaheadAttempted: false };
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const discreteUoms = new Set(["PCS", "PC", "PIECE", "PIECES", "EA", "UNIT", "UNITS", "SHEET", "SHEETS", "COIL", "COILS"]);
  const normalizedUom = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
  const isDiscreteUom = (value) => discreteUoms.has(normalizedUom(value));
  // A purchasing bucket must cover the full physical requirement. Fractional
  // pieces are therefore rounded upward, while weight/length UOMs keep their
  // planning precision.
  const planningQty = (value, uomCode) => {
    const qty = number(value);
    if (!isDiscreteUom(uomCode) || qty <= 0 || Number.isInteger(qty)) return qty;
    return Math.ceil(qty - 1e-9);
  };
  const qty = (value, uomCode, digits = 2) => num(planningQty(value, uomCode), isDiscreteUom(uomCode) ? 0 : digits);
  const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());
  const date = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const shortDate = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(value)) : "-";
  const dateKey = (value) => validDate(value) ? new Date(value).toISOString().slice(0, 10) : "";
  const startUtcDay = (value = (globalThis.erpBusinessNow?.() || new Date())) => { const result = new Date(value); result.setUTCHours(0, 0, 0, 0); return result; };
  const addUtcDays = (value, days) => { const result = startUtcDay(value); result.setUTCDate(result.getUTCDate() + days); return result; };
  const addUtcMonths = (value, months) => { const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1)); return result; };
  const mondayAnchor = (value) => { const result = startUtcDay(value); const distance = (result.getUTCDay() + 6) % 7; result.setUTCDate(result.getUTCDate() - distance); return result; };
  const month = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(value)) : "-";
  const slug = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const mrpLifecycle = (doc = {}) => {
    const authoritative = String(doc.lifecycleStatus || "").toUpperCase();
    if (["DRAFT", "SIMULATED", "APPROVED", "SUPERSEDED", "FAILED", "UNKNOWN"].includes(authoritative)) return authoritative;
    const scenario = String(doc.scenarioStatus || "").toUpperCase();
    const status = String(doc.status || "").toUpperCase();
    if (scenario === "SUPERSEDED" || status === "SUPERSEDED") return "SUPERSEDED";
    if (doc.isCurrentPlan || scenario === "APPROVED") return "APPROVED";
    if (status === "FAILED") return "FAILED";
    if (scenario === "DRAFT" || status === "RUNNING") return "DRAFT";
    if (["SIMULATION", "SIMULATED"].includes(scenario) && status === "COMPLETED") return "SIMULATED";
    return "UNKNOWN";
  };
  const help = (copy) => `<button class="mrps-help" type="button" title="${esc(copy)}" data-tip="${esc(copy)}" aria-label="${esc(copy)}">?</button>`;
  const badge = (label, tone = label) => `<span class="mrps-badge ${esc(slug(tone))}">${esc(label)}</span>`;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request gagal (${response.status}).`);
    return payload.data || payload;
  }
  function alert(message, success = false, raw = false) {
    const node = $("mrps-alert"); node.hidden = !message; node.classList.toggle("success", success);
    if (raw) node.innerHTML = message || ""; else node.textContent = message || "";
  }
  function uom(row) {
    if (String(row?.part?.rawType || "").toUpperCase() === "MATERIAL") return "KG";
    return String(row?.uomCode || row?.mbomDetail?.uomCode || row?.part?.stockUomCode || row?.part?.baseUomCode || "PCS").toUpperCase();
  }
  function bomUsage(row) {
    const detail = row?.mbomDetail || {};
    const parent = detail.parentDetail?.part || detail.mbomHeader?.part || null;
    const output = detail.mbomHeader?.part || parent;
    const routes = (detail.parentDetail?.mbomProcesses?.length ? detail.parentDetail.mbomProcesses : detail.mbomProcesses || [])
      .map((route) => ({
        code: route.process?.processCode || route.occurrenceCode || "",
        name: route.process?.processName || route.occurrenceCode || "",
        sequence: number(route.sequence),
        mode: route.routingMode || "",
      }))
      .filter((route) => route.code || route.name);
    return {
      parent,
      output,
      routes,
      bomNumber: detail.noReg || detail.mbomHeader?.noReg || row?.sourceNumber || "-",
      qtyPerParent: number(detail.qty),
      usageUom: String(detail.uomCode || uom(row)).toUpperCase(),
    };
  }
  function routeLabel(usage) {
    return usage.routes.length ? usage.routes.map((route) => route.code || route.name).join(", ") : "Proses belum dipetakan";
  }
  function supplyAudit(row) {
    const breakdown = row?.supplyBreakdown || {};
    const warehouseAvailable = breakdown.warehouseStock?.qtyAvailable == null
      ? Math.max(number(row?.onHandQty) - number(row?.allocatedQty), 0)
      : number(breakdown.warehouseStock.qtyAvailable);
    const embeddedWip = number(breakdown.wipStock?.planningSupplyQty);
    const firmSupply = breakdown.supplierOutstanding?.qtyEligible == null
      ? number(row?.firmSupplyQty)
      : number(breakdown.supplierOutstanding.qtyEligible);
    const gross = number(row?.grossRequirement);
    const currentUncovered = breakdown.coverage?.uncoveredDemandQty == null
      ? Math.max(gross - warehouseAvailable - embeddedWip - firmSupply, 0)
      : number(breakdown.coverage.uncoveredDemandQty);
    return { warehouseAvailable, embeddedWip, firmSupply, currentUncovered };
  }
  function sourceTypeLabel(value) {
    const type = String(value || "").toUpperCase();
    if (["SO", "SALES_ORDER", "SALES ORDER"].includes(type)) return "SO";
    if (type === "FORECAST") return "Forecast";
    if (type === "BUFFER") return "Buffer";
    return value || "Demand";
  }
  function sourceHref(type, sourceNumber) {
    if (!sourceNumber) return "";
    const normalized = String(type || "").toUpperCase();
    if (normalized === "FORECAST") return `/modules/sales/forecasts/${encodeURIComponent(sourceNumber)}`;
    return "";
  }
  function sourceReferenceLink(source) {
    const href = sourceHref(source.sourceType, source.sourceNumber);
    return href
      ? `<a class="mrps-source-link" href="${href}">${esc(source.sourceNumber)}</a>`
      : `<span>${esc(source.sourceNumber || "-")}</span>`;
  }
  function demandSources(row) {
    const pegging = Array.isArray(row?.customerPegging) && row.customerPegging.length
      ? row.customerPegging
      : (row?.rootDemandSourceNumber || row?.sourceNumber ? [{
          sourceType: row.rootDemandSourceType || row.sourceType,
          sourceNumber: row.rootDemandSourceNumber || row.sourceNumber,
          customerCode: row.customerCode,
          fgPartCode: row.fgPartCode,
          qty: row.grossRequirement,
          targetDeliveryDate: row.targetDeliveryDate,
          deliveryTargetId: row.deliveryTargetId,
        }] : []);
    return pegging.flatMap((source) => {
      const splits = Array.isArray(source.fgFinishSplits) && source.fgFinishSplits.length
        ? source.fgFinishSplits
        : [{
            qty: source.qty,
            phaseNumber: source.fgFinishSplitNumber,
            targetFinishDate: source.targetDeliveryDate || source.fgRequiredDate || row.targetDeliveryDate,
          }];
      return splits.map((split) => ({
        type: sourceTypeLabel(source.sourceType || row.rootDemandSourceType),
        typeKey: slug(source.sourceType || row.rootDemandSourceType || "demand"),
        sourceNumber: source.sourceNumber || row.rootDemandSourceNumber || "-",
        customerCode: source.customerCode || row.customerCode || "-",
        fgPartCode: source.fgPartCode || row.fgPartCode || row.planningPartCode || "-",
        qty: number(split.qty ?? source.qty),
        demandUom: source.uomCode || "PCS",
        phaseNumber: number(split.phaseNumber ?? source.deliveryPhaseNumber ?? source.fgFinishSplitNumber),
        phaseLabel: source.phaseLabel || null,
        deliveryDate: split.targetFinishDate || source.targetDeliveryDate || source.fgRequiredDate || row.targetDeliveryDate,
        deliveryTargetId: source.deliveryTargetId || row.deliveryTargetId || "",
        mpsNumber: source.mpsNumber || row.sourceNumber || "",
        mpsRevision: source.mpsRevision ?? null,
        referenceSources: Array.isArray(source.referenceSources) ? source.referenceSources : [],
      }));
    });
  }
  function firstDate(values) {
    const dates = values.filter(validDate).map((value) => new Date(value)).sort((left, right) => left - right);
    return dates[0]?.toISOString() || null;
  }
  function dateLineage(row) {
    const sources = row?._demandSources || demandSources(row);
    return {
      customerDelivery: firstDate(sources.map((source) => source.deliveryDate)) || row.targetDeliveryDate,
      fgRequired: row.mpsDetail?.fgRequiredDate || row.productionRequiredDate || row.parentRequiredDate || row.mpsDetail?.endDate,
      productionStart: row.mpsDetail?.startDate || null,
      materialRequired: row.materialRequiredDate || row.requiredDate,
      orderRelease: row.orderDate || null,
    };
  }
  function lineageHtml(row) {
    const timeline = dateLineage(row);
    const steps = [["Customer Delivery", timeline.customerDelivery], ["FG Required", timeline.fgRequired], ["Production Start", timeline.productionStart], ["Material Required", timeline.materialRequired], ["Order Release", timeline.orderRelease]];
    const timestamps = steps.map(([, value]) => validDate(value) ? new Date(value).getTime() : null);
    const conflict = timestamps.some((value, index) => index > 0 && value != null && timestamps[index - 1] != null && value > timestamps[index - 1]);
    return `<section class="mrps-date-lineage ${conflict ? "risk" : ""}"><header><b>Lineage tanggal ${conflict ? "· TIMELINE CONFLICT" : ""}</b><small>${conflict ? "Tanggal sumber tidak berurutan; perlu replan" : "Ditarik mundur dari delivery customer"}</small></header><div>${steps.map(([label, value], index) => `${index ? "<i>←</i>" : ""}<span><small>${esc(label)}</small><b>${date(value)}</b></span>`).join("")}</div></section>`;
  }
  function requirementState(row) {
    if (number(row.netRequirement) <= .000001) return { key: "COVERED", label: "Covered", tone: "covered" };
    if (supplyModel.isCustomerSupplied(row)) return { key: "OPEN", label: "Menunggu suplai customer", tone: "warning" };
    if (String(row.procurementWindow || "").toUpperCase() === "EXPEDITE") return { key: "URGENT", label: "Urgent", tone: "urgent" };
    return { key: "OPEN", label: "Perlu dibeli", tone: "buy" };
  }
  function makeState(row) {
    if (number(row.netRequirement ?? row.plannedOrderQty) <= .000001) return { key: "COVERED", label: "Covered", tone: "covered" };
    const required = row.productionRequiredDate || row.requiredDate;
    if (validDate(required) && new Date(required).getTime() < Date.now() - 86400000) return { key: "URGENT", label: "Terlambat", tone: "urgent" };
    return { key: "OPEN", label: "Perlu dibuat", tone: "make" };
  }
  function orderState(row) {
    const remaining = Math.max(number(row.qty) - number(row.qtyReleased), 0);
    if (remaining <= .000001 || ["Released", "Converted", "Completed", "Closed"].includes(row.status)) return { key: "COVERED", label: row.status || "Released", tone: "covered" };
    const orderDateKey = validDate(row.orderDate) ? new Date(row.orderDate).toISOString().slice(0, 10) : "";
    const relatedUrgent = (state.doc?.requirements || []).some((item) => item.partCode === row.partCode && requirementState(item).key === "URGENT" && (!orderDateKey || (validDate(item.orderDate) && new Date(item.orderDate).toISOString().slice(0, 10) === orderDateKey)));
    return relatedUrgent ? { key: "URGENT", label: "Urgent", tone: "urgent" } : { key: "OPEN", label: row.status || "Planned", tone: "buy" };
  }
  function peggingState(row) {
    const risk = String(row.risk || "").toUpperCase();
    if (risk.includes("EXPEDITE") || risk.includes("SHORT") || risk.includes("LATE")) return { key: "URGENT", label: row.risk || "Urgent", tone: "urgent" };
    if (number(row.shortageQty) > .000001 || number(row.requirementQty) > number(row.supplyCoverageQty)) return { key: "BUY", label: row.risk || "Shortage", tone: "buy" };
    return { key: "COVERED", label: row.risk || "Covered", tone: "covered" };
  }
  function searchText(row) { return Object.values(row).filter((value) => ["string", "number"].includes(typeof value)).join(" ").toLowerCase(); }
  function mapBuyRows(rows, prefix = "req") {
    return (rows || []).map((row, index) => {
      const identity = row.part?.material?.materialCode || row.partCode;
      const partName = row.part?.material?.materialName || row.part?.partName || row.part?.partNumber || "";
      const usage = bomUsage(row);
      const sources = demandSources(row);
      const usageSearch = `${usage.parent?.partCode || ""} ${usage.parent?.partNumber || ""} ${usage.parent?.partName || ""} ${usage.output?.partCode || ""} ${usage.output?.partNumber || ""} ${usage.routes.map((route) => `${route.code} ${route.name}`).join(" ")} ${usage.bomNumber}`;
      const sourceSearch = sources.map((source) => `${source.type} ${source.sourceNumber} ${source.customerCode} ${source.fgPartCode} phase ${source.phaseNumber}`).join(" ");
      return { ...row, _usage: usage, _demandSources: sources, _id: `${prefix}:${row.id || index}`, _state: requirementState(row), _search: `${identity} ${row.partCode} ${partName} ${row.planningPartCode || ""} ${row.planningCustomerCode || ""} ${usageSearch} ${sourceSearch} ${supplyModel.supplyLabel(row)}`.toLowerCase() };
    });
  }
  function buyRows() { return mapBuyRows(state.doc?.requirements || [], "req"); }
  function lookaheadBuyRows() { return mapBuyRows(state.doc?.mPlusOnePreview?.requirements || [], "preview").map((row) => ({ ...row, _lookaheadOnly: true })); }
  function lookaheadDisplayQty(item) {
    return state.mPlusOneDisplayMode === "FULL_EFD"
      ? number(item?.mPlusOneFullEfdGrossQty ?? item?.forecastQty ?? item?.grossRequirement)
      : number(item?.mPlusOneNetRequirementQty ?? item?.mPlusOneActualNetPurchaseQty ?? item?.netRequirement);
  }
  function lookaheadDisplayLabel() {
    return state.mPlusOneDisplayMode === "FULL_EFD" ? "Full EFD" : "Net setelah stock saat ini";
  }
  function isLookaheadRequirement(item) {
    if (item?._lookaheadOnly) return true;
    const planning = validDate(state.doc?.planningMonth) ? new Date(state.doc.planningMonth) : null;
    const demandPeriod = item?.mpsDetail?.endDate || item?.mpsDetail?.startDate;
    return Boolean(planning && validDate(demandPeriod)
      && new Date(demandPeriod) >= addUtcMonths(planning, 1));
  }
  function recoveryPlanByTarget() {
    return new Map((state.doc?.recoveryPlans || []).map((plan) => [plan.deliveryTargetId, plan]));
  }
  function planAcceptsLate(plan) {
    return plan?.status === "APPROVED"
      && plan?.decisionType === "ACCEPT_LATE"
      && Boolean(plan?.acceptedDeliveryDate)
      && String(plan?.acceptLateReason || "").trim().length >= 10
      && Boolean(plan?.approvedBy && plan?.approvedAt);
  }
  function bulkLateTargets() {
    const plans = recoveryPlanByTarget();
    const targets = new Map();
    for (const row of weeklyMatrixRows()) {
      for (const phase of recoveryTargetOptions(row)) {
        if (phase.deliveryTargetId && !planAcceptsLate(plans.get(phase.deliveryTargetId))) targets.set(phase.deliveryTargetId, phase);
      }
    }
    return [...targets.values()];
  }
  function weeklyBuckets() {
    const dates = [...(state.doc?.requirements || []), ...(state.doc?.mPlusOnePreview?.requirements || [])].map((row) => row.materialRequiredDate || row.requiredDate);
    return weeklyDeltaModel.buildWeeklyBuckets(validDate(state.doc?.planningMonth) ? state.doc.planningMonth : (globalThis.erpBusinessNow?.() || new Date()), dates);
  }
  function weeklyStatus(items, bucket) {
    const today = startUtcDay((globalThis.erpBusinessNow?.() || new Date()));
    const warningLimit = addUtcDays(today, 7);
    const targetIds = [...new Set(items.flatMap((item) => (item._demandSources || []).map((source) => source.deliveryTargetId).filter(Boolean)))];
    const plans = recoveryPlanByTarget();
    const acceptLate = targetIds.length > 0 && targetIds.every((id) => planAcceptsLate(plans.get(id)));
    if (bucket.start < today) return acceptLate
      ? { key: "ACCEPT_LATE", label: "Accept Late", tone: "accept-late" }
      : { key: "LATE", label: "Terlambat – Belum Ditangani", tone: "late-unhandled" };
    if (bucket.start <= warningLimit) return { key: "WARNING", label: "Warning / Dekat Due Date", tone: "warning" };
    return { key: "GREEN", label: "Due Date > 1 Minggu", tone: "on-track" };
  }
  function weeklyMatrixRows() {
    const buckets = weeklyBuckets();
    const grouped = new Map();
    const includePreviewOverlay = String(state.doc?.scenarioAssumptions?.planningMode || "").toUpperCase() !== "M_PLUS_ONE_PREVIEW";
    const matrixItems = [...buyRows(), ...(includePreviewOverlay ? lookaheadBuyRows() : [])];
    for (const item of matrixItems) {
      const targetAvailableDate = item.materialRequiredDate || item.requiredDate;
      const lookaheadRequirement = isLookaheadRequirement(item);
      const matrixRequirementQty = lookaheadRequirement
        ? lookaheadDisplayQty(item)
        : number(item.netRequirement);
      if (!validDate(targetAvailableDate) || !nettingSummary.includeRequirement(matrixRequirementQty, item.grossRequirement, state.showCovered)) continue;
      const anchor = mondayAnchor(targetAvailableDate);
      const bucket = buckets.byKey.get(dateKey(anchor));
      if (!bucket) continue;
      const sources = item._demandSources || demandSources(item);
      const fgCodes = [...new Set(sources.map((source) => source.fgPartCode).filter(Boolean))];
      const fgPart = item.mpsDetail?.part || null;
      const usage = item._usage || bomUsage(item);
      const materialCode = item.part?.material?.materialCode || item.partCode;
      const parentCode = usage.parent?.partCode || usage.output?.partCode || item.planningPartCode || "-";
      const process = routeLabel(usage);
      const category = supplyModel.materialCategory(item);
      const key = `${fgCodes.join("+") || item.fgPartCode || "NO-FG"}|${materialCode}|${parentCode}|${process}|${uom(item)}|${supplyModel.supplyKey(item)}|${category}`;
      if (!grouped.has(key)) grouped.set(key, {
        _id: `matrix:${grouped.size}`,
        _search: "",
        fgLabel: fgPart?.partNumber || fgCodes.join(", ") || item.fgPartCode || item.planningPartCode || "-",
        fgName: fgPart?.partName || item._groupLabel || "Demand MRP",
        fgCode: fgPart?.partCode || fgCodes.join(", ") || item.fgPartCode || item.planningPartCode || "-",
        materialCode,
        _materialCategory: category,
        materialPartNumbers: [],
        materialSupplyType: item.materialSupplyType,
        supplyCustomerCode: item.supplyCustomerCode,
        materialName: item.part?.material?.materialName || item.part?.partName || item.part?.partNumber || "-",
        identificationNumber: usage.parent?.partNumber || usage.output?.partNumber || "-",
        identificationCode: parentCode,
        process,
        uom: uom(item),
        cells: new Map(),
      });
      const row = grouped.get(key);
      const materialPartNumber = String(item.part?.partNumber || "").trim();
      if (materialPartNumber && !row.materialPartNumbers.includes(materialPartNumber)) row.materialPartNumbers.push(materialPartNumber);
      if (!row.cells.has(bucket.key)) row.cells.set(bucket.key, { bucket, qty: 0, rawQty: 0, officialQty: 0, baselineQty: 0, additionalQty: 0, lookaheadQty: 0, hasLookahead: false, items: [] });
      const cell = row.cells.get(bucket.key);
      const itemRawQty = matrixRequirementQty;
      const itemDisplayQty = matrixRequirementQty <= .000001 ? 0 : supplyModel.matrixQty(item, { netQty: matrixRequirementQty, discrete: isDiscreteUom(row.uom), lookahead: lookaheadRequirement });
      cell.rawQty += itemRawQty;
      cell.qty += itemDisplayQty;
      if (lookaheadRequirement) { cell.lookaheadQty += itemDisplayQty; cell.hasLookahead = true; }
      else {
        cell.officialQty += itemDisplayQty;
        const split = weeklyDeltaModel.splitRequirementQty(itemDisplayQty, state.doc?.planKind || state.doc?.scenarioAssumptions?.planKind);
        cell.baselineQty += split.baselineQty;
        cell.additionalQty += split.additionalQty;
      }
      cell.items.push(item);
    }
    return [...grouped.values()].map((row) => {
      let officialTotal = 0;
      let lookaheadTotal = 0;
      const states = [];
      for (const cell of row.cells.values()) {
        cell.qty = planningQty(cell.qty, row.uom);
        cell.officialQty = planningQty(cell.officialQty, row.uom);
        cell.baselineQty = planningQty(cell.baselineQty, row.uom);
        cell.additionalQty = planningQty(cell.additionalQty, row.uom);
        cell.lookaheadQty = planningQty(cell.lookaheadQty, row.uom);
        cell.status = cell.qty <= .000001 ? { key: "COVERED", label: "Tercover", tone: "covered" } : weeklyStatus(cell.items, cell.bucket);
        officialTotal += cell.officialQty;
        lookaheadTotal += cell.lookaheadQty;
        states.push(cell.status);
      }
      const priority = { LATE: 0, ACCEPT_LATE: 1, WARNING: 2, GREEN: 3, COVERED: 4 };
      const status = states.sort((left, right) => priority[left.key] - priority[right.key])[0] || { key: "GREEN", label: "Due Date > 1 Minggu", tone: "on-track" };
      row.total = officialTotal;
      row.officialTotal = officialTotal;
      row.lookaheadTotal = lookaheadTotal;
      row.hasLookahead = [...row.cells.values()].some((cell) => cell.hasLookahead);
      row.currentStock = summarizeCurrentStock([...row.cells.values()].flatMap((cell) => cell.items));
      row._state = status;
      row._search = `${row.fgLabel} ${row.fgName} ${row.fgCode} ${row.materialCode} ${row.materialPartNumbers.join(" ")} ${row.materialName} ${row.identificationNumber} ${row.identificationCode} ${row.process} ${supplyModel.supplyLabel(row)} ${status.label}`.toLowerCase();
      return row;
    }).sort((left, right) => left._state.key.localeCompare(right._state.key) || left.fgLabel.localeCompare(right.fgLabel) || left.materialCode.localeCompare(right.materialCode));
  }
  function makeRows() {
    const trace = Array.isArray(state.doc?.requirementTrace) ? state.doc.requirementTrace.filter((row) => row.orderType === "Production") : [];
    const hasPersistedChildren = trace.some((row) => number(row.levelMBOM) > 0);
    const synthetic = hasPersistedChildren ? [] : (state.doc?.productionScheduleTrace || []);
    const rows = [...trace, ...synthetic];
    const byId = new Map(rows.map((row) => [row.id, row]));
    return rows.map((row, index) => {
      const parent = byId.get(row.parentRequirementId) || null;
      const root = byId.get(row.rootRequirementId) || (number(row.levelMBOM) === 0 ? row : null);
      const usage = bomUsage(row);
      const identity = row.part?.partCode || row.partCode;
      const name = row.part?.partName || row.part?.partNumber || row.parentPartName || "";
      const sourceId = row.mpsDetailId || root?.mpsDetailId || row.deliveryTargetId || row.sourceNumber || "NO-PHASE";
      const due = row.targetDeliveryDate || row.mpsDetail?.fgRequiredDate || root?.targetDeliveryDate || root?.mpsDetail?.fgRequiredDate || row.requiredDate;
      const groupKey = `${sourceId}|${String(due || "").slice(0, 10)}|${root?.partCode || row.fgPartCode || row.partCode}`;
      const groupLabel = `${row.customerCode || root?.customerCode || row.mpsDetail?.customerCode || "Demand"} ${row.sourceNumber || root?.sourceNumber || ""}`.trim();
      return { ...row, _parent: parent, _root: root || row, _usage: usage, _groupKey: groupKey, _groupLabel: groupLabel, _id: `make:${row.id || index}`, _state: makeState(row), _search: `${identity} ${name} ${row.partCode || ""} ${parent?.partCode || row.parentPartCode || ""} ${root?.partCode || row.fgPartCode || ""} ${groupLabel} ${routeLabel(usage)}`.toLowerCase() };
    });
  }
  function exceptionRows() {
    const rows = [];
    buyRows().forEach((row) => {
      if (row._state.key === "URGENT") rows.push({ ...row, _id: `exception:buy:${row.id}`, _exceptionType: "PURCHASE", _exceptionTitle: "Material harus dipercepat", _exceptionMessage: `${row.partCode} harus tersedia ${date(row.materialRequiredDate || row.requiredDate)}.` });
      if (!row._usage?.routes?.length) rows.push({ ...row, _id: `exception:route:${row.id}`, _state: { key: "OPEN", label: "Master data", tone: "urgent" }, _exceptionType: "MASTER DATA", _exceptionTitle: "Proses pemakaian belum dipetakan", _exceptionMessage: `${row.partCode} belum memiliki relasi proses mBOM yang dapat diaudit.` });
    });
    makeRows().forEach((row) => {
      if (row._state.key === "URGENT") rows.push({ ...row, _id: `exception:make:${row.id}`, _exceptionType: "SCHEDULE", _exceptionTitle: "Start produksi sudah lewat", _exceptionMessage: `${row.partCode} dibutuhkan ${date(row.productionRequiredDate || row.requiredDate)}.` });
      if (number(row.levelMBOM) > 0 && !row.part && !row.parentPartName) rows.push({ ...row, _id: `exception:part:${row.id}`, _state: { key: "OPEN", label: "Master data", tone: "urgent" }, _exceptionType: "MASTER DATA", _exceptionTitle: "Identitas child part tidak lengkap", _exceptionMessage: `${row.partCode || "Child part"} tidak memiliki Part master yang lengkap.` });
    });
    if (state.doc && mrpLifecycle(state.doc) === "SUPERSEDED") rows.unshift({ _id: "exception:revision", _state: { key: "URGENT", label: "Superseded", tone: "urgent" }, _exceptionType: "REVISION", _exceptionTitle: "MRP bukan revision aktif", _exceptionMessage: "Revision ini hanya tersimpan sebagai history audit.", _search: "revision superseded history mrp" });
    return rows.map((row) => ({ ...row, _search: row._search || `${row._exceptionType} ${row._exceptionTitle} ${row._exceptionMessage}`.toLowerCase() }));
  }
  function orderRows() {
    return (state.doc?.plannedOrders || []).map((row, index) => ({ ...row, _id: `order:${row.id || row.orderNumber || index}`, _state: orderState(row), _search: `${row.orderNumber || ""} ${row.partCode || ""} ${row.partName || row.part?.partName || ""} ${row.supplierName || row.supplierCode || ""} ${row.status || ""}`.toLowerCase() }));
  }
  function peggingRows() {
    return (state.pegging?.items || []).map((row, index) => ({ ...row, _id: `peg:${index}`, _state: peggingState(row), _search: `${row.customerCode || ""} ${row.fgPartCode || ""} ${row.sourceNumber || ""} ${row.materialOrComponent || row.partCode || ""}`.toLowerCase() }));
  }
  function currentRows() {
    if (state.view === "matrix") return materialGroups.groupMaterials(weeklyMatrixRows(), { supplyKey: supplyModel.supplyKey, summarizeCurrentStock });
    const rows = state.view === "buy" ? buyRows() : state.view === "exception" ? exceptionRows() : makeRows();
    const priority = { URGENT: 0, OPEN: 1, COVERED: 2 };
    return rows.sort((left, right) => (priority[left._state.key] ?? 9) - (priority[right._state.key] ?? 9) || String(left.requiredDate || left.targetDeliveryDate || left.orderDate || "").localeCompare(String(right.requiredDate || right.targetDeliveryDate || right.orderDate || "")));
  }
  function eligibleRows() {
    return currentRows().filter((row) => (
      (state.view !== "matrix" || !shouldHideZeroMatrixRow(row, !state.showCovered))
      && (!state.query || row._search.includes(state.query))
      && (state.filter === "ALL" || (state.filter === "ACTION" ? !["COVERED", "GREEN"].includes(row._state.key) : row._state.key === state.filter))
    ));
  }
  function renderMaterialCategories(rows) {
    const wrap = $("mrps-material-categories");
    const relevant = ["matrix", "buy"].includes(state.view);
    wrap.hidden = !relevant;
    if (!relevant) return;
    const counts = rows.reduce((result, row) => {
      const category = supplyModel.materialCategory(row);
      result[category] = (result[category] || 0) + 1;
      return result;
    }, {});
    const categories = [...supplyModel.materialCategories.filter((category) => category.key !== "UNCLASSIFIED" || counts.UNCLASSIFIED || selectedMaterialCategory === "UNCLASSIFIED"), { key: "ALL", label: "Semua", help: "Semua kategori material" }];
    wrap.innerHTML = categories.map((category) => `<button type="button" data-mrps-category="${category.key}" aria-pressed="${selectedMaterialCategory === category.key}" title="${esc(category.help)}"><span>${esc(category.label)}</span><b>${num(category.key === "ALL" ? rows.length : counts[category.key] || 0, 0)}</b></button>`).join("");
  }
  function renderHeader() {
    const doc = state.doc; if (!doc) return;
    const lifecycle = mrpLifecycle(doc);
    const breadcrumb = document.querySelector(".mrps-breadcrumb a");
    if (breadcrumb) {
      breadcrumb.href = `/modules/planning-ppic/mrp?month=${encodeURIComponent(cfg.initialMonth || String(doc.planningMonth || "").slice(0, 7))}`;
      breadcrumb.textContent = "Tabel MRP";
    }
    if (cfg.monthlyMode) {
      const option = $("mrps-run").selectedOptions[0];
      if (option?.value === key) option.textContent = `${key} · ${lifecycle}${option.textContent.includes("sumber lintas bulan") ? " · sumber lintas bulan" : ""}`;
    }
    $("mrps-title").textContent = doc.runNumber || key;
    $("mrps-status").textContent = lifecycle;
    $("mrps-status").className = `mrps-badge ${slug(lifecycle)}`;
    const sourceMpsNumbers = Array.isArray(doc.scenarioAssumptions?.sourceMpsNumbers) ? doc.scenarioAssumptions.sourceMpsNumbers : [doc.mpsNumber].filter(Boolean);
    const horizonDates = (doc.requirements || []).flatMap((row) => [row.orderDate, row.materialRequiredDate, row.requiredDate, row.targetDeliveryDate]).filter(validDate).map((value) => new Date(value)).sort((left, right) => left - right);
    const horizonStart = horizonDates[0] || (validDate(doc.planningSnapshotAt) ? new Date(doc.planningSnapshotAt) : null);
    const horizonEnd = horizonDates.at(-1) || (validDate(doc.cutoffDate) ? new Date(doc.cutoffDate) : null);
    const residualReplan = doc.scenarioAssumptions?.residualReplan;
    const residualLabel = residualReplan?.mode === "RESIDUAL_REPLAN_PRESERVE_EXECUTION"
      ? ` · Residual Replan (${number(residualReplan.protectedExecutionCount)} histori firm dipertahankan)`
      : "";
    $("mrps-meta").textContent = `MRP Planning Run · Revision ${num(doc.planRevision || 1, 0)} · Horizon ${date(horizonStart)} – ${date(horizonEnd)} · Source ${sourceMpsNumbers.join(" + ") || "-"} · ${lifecycle}${residualLabel}`;
    const actions = [];
    if (doc.mpsNumber) actions.push(`<a class="btn btn-outline-primary" href="/modules/planning-ppic/mps/workbench?month=${encodeURIComponent(String(doc.planningMonth || "").slice(0, 7))}">Buka MPS</a>`);
    if (doc.mPlusOneOption?.available) actions.push(`<button class="btn btn-outline-primary" type="button" data-mrps-mplus>Opsi M+1${doc.mPlusOnePreview?.requirements?.length ? ` · ${num(doc.mPlusOnePreview.requirements.length, 0)} material` : ""}</button>`);
    if (lifecycle === "APPROVED") actions.push('<button class="btn btn-outline-primary" type="button" data-mrps-rerun>Hitung Revision MRP</button>');
    if (lifecycle === "SIMULATED" && doc.approvalEligibility?.allowed !== false && String(doc.scenarioAssumptions?.planningMode || "OFFICIAL").toUpperCase() !== "M_PLUS_ONE_PREVIEW") actions.push('<button class="btn btn-primary" type="button" data-mrps-approve>Approve MRP</button>');
    const lateTargets = bulkLateTargets();
    if (lateTargets.length) actions.push(`<button class="btn btn-danger" type="button" data-mrps-auto-accept-late>Accept Late Semua · ${num(lateTargets.length, 0)}</button>`);
    if (doc.purchaseSuggestion?.suggestionNumber) actions.push(`<a class="btn btn-outline-primary" href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(doc.purchaseSuggestion.suggestionNumber)}">Buka ${esc(doc.purchaseSuggestion.suggestionNumber)}</a>`);
    else if (lifecycle === "APPROVED") actions.push('<button class="btn btn-outline-primary" type="button" data-mrps-action="suggestion">Buat Purchase Suggestion</button>');
    if (lifecycle === "APPROVED") actions.push('<button class="btn btn-primary" type="button" data-mrps-action="production">Buat Monthly Planning</button>');
    $("mrps-actions").innerHTML = actions.join("");
  }
  function renderKpis() {
    const make = makeRows(); const buy = buyRows(); const exceptions = exceptionRows();
    const matrix = materialGroups.groupMaterials(weeklyMatrixRows(), { supplyKey: supplyModel.supplyKey, summarizeCurrentStock });
    const activeMake = make.filter((row) => row._state.key !== "COVERED");
    const activeBuy = buy.filter((row) => row._state.key !== "COVERED" && !supplyModel.isCustomerSupplied(row));
    $("mrps-kpi-make").textContent = num(activeMake.length, 0);
    $("mrps-kpi-buy").textContent = num(activeBuy.length, 0);
    $("mrps-kpi-covered").textContent = num([...make, ...buy].filter((row) => row._state.key === "COVERED").length, 0);
    $("mrps-kpi-urgent").textContent = num(exceptions.filter((row) => row._state.key === "URGENT").length, 0);
    $("mrps-tab-make").textContent = num(activeMake.length, 0);
    $("mrps-tab-matrix").textContent = num(matrix.length, 0);
    $("mrps-tab-buy").textContent = num(activeBuy.length, 0);
    $("mrps-tab-exception").textContent = num(exceptions.length, 0);
  }
  function renderMatrix(rows) {
    const bucketModel = weeklyBuckets();
    const fixedColumns = `<th rowspan="2" scope="col" class="mrps-material-heading">Material / Part</th><th rowspan="2" scope="col">FG Pemakai</th><th rowspan="2" scope="col">Part / Proses Pemakai</th><th rowspan="2" scope="col">Status</th><th colspan="2" class="mrps-current-stock-group">Current Stock</th>`;
    const table = $("mrps-head").closest("table");
    const widths = [220, 170, 180, 150, 72, 72, ...bucketModel.flat.map(() => 92), 130, 85];
    table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
    table.querySelector("colgroup")?.remove();
    table.insertAdjacentHTML("afterbegin", `<colgroup>${widths.map((width) => `<col style="width:${width}px">`).join("")}</colgroup>`);
    const lookaheadTotals = state.doc?.mPlusOneOption?.totals || {};
    const selectedBasis = state.mPlusOneDisplayMode === "FULL_EFD" ? lookaheadTotals.efdMPlusOne : lookaheadTotals.netDemandOnly;
    const monthColumns = bucketModel.groups.map((group) => `<th colspan="${group.buckets.length}" class="mrps-month-group ${group.offset === 1 ? "lookahead" : ""}">${esc(group.label)}<small>${month(group.monthStart)}${group.offset === 1 ? ` · Look-ahead · ${esc(lookaheadDisplayLabel())} ${num(selectedBasis)}` : ""}</small></th>`).join("");
    const totalColumns = `<th rowspan="2" class="mrps-number">Total</th><th rowspan="2">Action</th>`;
    const weekColumns = bucketModel.groups.flatMap((group) => group.buckets.map((bucket) => `<th class="mrps-week-head ${group.offset === 1 ? "lookahead" : ""}" title="Target material tersedia ${date(bucket.start)}–${date(bucket.end)}"><b>W${bucket.week}</b><i>${shortDate(bucket.start)}–${shortDate(bucket.end)}</i></th>`)).join("");
    $("mrps-head").innerHTML = `<tr>${fixedColumns}${monthColumns}${totalColumns}</tr><tr><th class="mrps-stock-subhead">WH</th><th class="mrps-stock-subhead">WIP</th>${weekColumns}</tr>`;
    state.bucketCells = new Map();
    const displayRows = rows.flatMap((group) => expandedMaterials.has(group._id) ? [group, ...group.children] : [group]);
    $("mrps-body").innerHTML = displayRows.map((row) => {
      state.rows.set(row._id, row);
      const bucketCells = bucketModel.groups.flatMap((group) => group.buckets).map((bucket) => {
        const cell = row.cells.get(bucket.key);
        if (!cell) return `<td class="mrps-week-cell empty">—</td>`;
        const cellId = `${row._id}|${bucket.key}`;
        state.bucketCells.set(cellId, { ...cell, row });
        const previewLabel = cell.hasLookahead
          ? cell.officialQty > 0
            ? ` · official ${qty(cell.officialQty, row.uom)} + preview ${qty(cell.lookaheadQty, row.uom)}`
            : cell.lookaheadQty > 0 ? " · preview" : " · preview covered"
          : "";
        const ownership = cell.status.key === "COVERED" ? "Tercover" : cell.hasLookahead ? (cell.officialQty > 0 ? "Official + M+1" : "Preview M+1") : cell.additionalQty > 0 ? `ADD ${qty(cell.additionalQty, row.uom)}` : "BASE";
        return `<td class="mrps-week-cell ${esc(cell.status.tone)} ${cell.hasLookahead ? "lookahead" : ""} ${cell.additionalQty > 0 ? "is-additional" : "is-baseline"}"><button type="button" data-mrps-week-cell="${esc(cellId)}" title="${esc(`${cell.status.label}${previewLabel} · BASE ${qty(cell.baselineQty, row.uom)} · ADD ${qty(cell.additionalQty, row.uom)} · Klik untuk netting`)}"><b>${qty(cell.qty, row.uom)} ${esc(row.uom)}</b><small>${esc(ownership)}</small></button></td>`;
      }).join("");
      const recoveryButton = row._state.key === "LATE"
        ? `<button type="button" class="mrps-status-button ${esc(row._state.tone)}" data-mrps-recovery="${esc(row._id)}">${esc(row._state.label)}</button>`
        : `<span class="mrps-status-label ${esc(row._state.tone)}">${esc(row._state.label)}</span>`;
      const previewNote = row.hasLookahead ? `<small title="Preview M+1 tidak masuk total official">M+1: ${qty(row.lookaheadTotal, row.uom)} ${esc(row.uom)} · preview</small>` : `<small>Official M-1 + M</small>`;
      const stock = row.currentStock || { warehouseQty: 0, wipQty: 0, totalQty: 0 };
      const isGroup = Boolean(row.children);
      const material = isGroup
        ? `<button type="button" class="mrps-material-toggle" data-mrps-material-group="${esc(row._id)}" aria-expanded="${expandedMaterials.has(row._id)}" aria-label="${expandedMaterials.has(row._id) ? "Tutup" : "Buka"} pemakaian ${esc(row.materialCode)}" title="${esc(`${row.materialCode} · ${row.materialName} · Part No: ${row.materialPartNumbers.join(", ") || "—"}`)}"><span class="mrps-material-chevron" aria-hidden="true">${expandedMaterials.has(row._id) ? "▾" : "▸"}</span><span><b>${esc(row.materialCode)} · ${esc(row.materialName)}</b><small>Part No: ${esc(row.materialPartNumbers.join(", ") || "—")}${supplyModel.isCustomerSupplied(row) ? ` · Suplai customer ${esc(row.supplyCustomerCode || "")}` : ""}</small></span></button>`
        : `<span class="mrps-material-child-label"><b>↳ ${esc(row.identificationNumber)}</b><small>${esc(row.fgLabel)} · ${esc(row.process)}</small></span>`;
      const fg = isGroup ? `<b>${esc(row.fgLabel)}</b><small>${num(row.children.length, 0)} pemakaian BOM</small>` : `<b>${esc(row.fgLabel)}</b><small>${esc(row.fgName)} · ${esc(row.fgCode)}</small>`;
      const part = isGroup ? `<span class="mrps-material-hint">${expandedMaterials.has(row._id) ? "Detail di bawah" : "Buka untuk lihat part"}</span>` : `<b>${esc(row.identificationNumber)}</b><small>${esc(row.identificationCode)} · ${esc(row.process)}</small>`;
      return `<tr class="mrps-matrix-row ${isGroup ? "mrps-material-parent" : "mrps-material-child"}"><td>${material}</td><td>${fg}</td><td>${part}</td><td>${recoveryButton}</td><td class="mrps-number mrps-current-stock-cell warehouse"><button type="button" data-mrps-stock="${esc(row._id)}" data-stock-kind="warehouse" title="Lihat sumber stock warehouse"><b>${qty(stock.warehouseQty, row.uom)}</b><small>${esc(row.uom)}</small></button></td><td class="mrps-number mrps-current-stock-cell wip"><button type="button" data-mrps-stock="${esc(row._id)}" data-stock-kind="wip" title="Lihat sumber stock WIP"><b>${qty(stock.wipQty, row.uom)}</b><small>${esc(row.uom)}</small></button></td>${bucketCells}<td class="mrps-number mrps-matrix-total"><b>${qty(row.officialTotal, row.uom)} ${esc(row.uom)}</b>${previewNote}</td><td><button class="mrps-row-action" type="button" data-mrps-matrix-detail="${esc(row._id)}">Rincian</button></td></tr>`;
    }).join("");
  }
  function renderBuy(rows) {
    $("mrps-head").innerHTML = `<tr><th>Material / Part</th><th>Untuk Part ${help("Menunjukkan part parent tempat material ini digunakan.")}</th><th>Proses ${help("Proses mBOM tempat material atau purchase part digunakan.")}</th><th class="mrps-number">Gross ${help("Kebutuhan kotor hasil BOM explosion sebelum stock dan firm supply dikurangkan.")}</th><th class="mrps-number">Stock</th><th class="mrps-number">Firm Supply ${help("Supply yang sudah memiliki referensi tegas, misalnya open PO yang eligible.")}</th><th class="mrps-number">Net / Buy ${help("Net requirement adalah hasil time-phased netting. MOQ supplier diterapkan pada Purchase Suggestion, bukan mengubah kebutuhan asli MRP.")}</th><th>Material Required ${help("Tanggal material harus sudah tersedia untuk produksi; bukan tanggal delivery customer.")}</th><th>Customer Delivery ${help("Tanggal delivery customer paling awal yang men-drive kebutuhan material ini.")}</th><th>Status</th><th></th></tr>`;
    const hierarchy = (row) => {
      const sources = row._demandSources || demandSources(row);
      const customers = [...new Set(sources.map((source) => source.customerCode).filter(Boolean))].sort();
      const parentFgs = [...new Set(sources.map((source) => source.fgPartCode).filter(Boolean))].sort();
      const sourceNumbers = [...new Set(sources.map((source) => source.sourceNumber).filter(Boolean))].sort();
      return { key: `${customers.join("+") || "NO-CUSTOMER"}|${parentFgs.join("+") || row.fgPartCode || "NO-FG"}`, customer: customers.join(", ") || row.customerCode || "Tanpa customer", parentFg: parentFgs.join(", ") || row.fgPartCode || "Tanpa Parent FG", sourceNumbers };
    };
    const displayRows = state.requirementGrouping === "GROUPED"
      ? [...rows].sort((left, right) => hierarchy(left).key.localeCompare(hierarchy(right).key) || String(left.requiredDate || "").localeCompare(String(right.requiredDate || "")) || String(left.partCode || "").localeCompare(String(right.partCode || "")))
      : rows;
    const groupCounts = displayRows.reduce((result, row) => result.set(hierarchy(row).key, number(result.get(hierarchy(row).key)) + 1), new Map());
    let previousGroup = null;
    $("mrps-body").innerHTML = displayRows.map((row) => {
      const group = hierarchy(row);
      const groupHeader = state.requirementGrouping === "GROUPED" && group.key !== previousGroup
        ? `<tr class="mrps-group-row"><td colspan="11"><div><span>Customer <b>${esc(group.customer)}</b></span><i>→</i><span>Parent FG <b>${esc(group.parentFg)}</b></span><small>${num(groupCounts.get(group.key), 0)} material line${group.sourceNumbers.length ? ` · ${esc(group.sourceNumbers.join(", "))}` : ""}</small></div></td></tr>`
        : "";
      previousGroup = group.key;
      const code = row.part?.material?.materialCode || row.partCode;
      const name = row.part?.material?.materialName || row.part?.partName || row.part?.partNumber || "-";
      const buy = number(row.adjustedOrderQty ?? row.plannedOrderQtyKg ?? row.plannedOrderQty ?? row.netRequirement);
      const usage = row._usage || bomUsage(row);
      const audit = supplyAudit(row);
      const timeline = dateLineage(row);
      const partNumber = usage.parent?.partNumber || usage.output?.partNumber || "-";
      const partCode = usage.parent?.partCode || usage.output?.partCode || "-";
       const plannedOrder = (state.doc?.plannedOrders || []).find((order) => order.partCode === row.partCode && String(order.requiredDate || "").slice(0,10) === String(row.requiredDate || "").slice(0,10));
       return `${groupHeader}<tr><td><b>${esc(code)}</b><small>${esc(name)}${code !== row.partCode ? ` · source ${esc(row.partCode)}` : ""}</small><small>${esc(supplyModel.supplyLabel(row))}</small></td><td class="mrps-usage-cell"><b>${esc(partNumber)}</b><small>${esc(partCode)}</small></td><td class="mrps-process-cell"><span>${esc(routeLabel(usage))}</span></td><td class="mrps-number"><b>${num(row.grossRequirement)}</b><small>${esc(uom(row))}</small></td><td class="mrps-number"><b>${num(audit.warehouseAvailable + audit.embeddedWip)}</b><small>Available ${num(audit.warehouseAvailable)} · WIP ${num(audit.embeddedWip)}</small></td><td class="mrps-number"><b>${num(audit.firmSupply)}</b><small>${esc(uom(row))}</small></td><td class="mrps-number mrps-net-buy"><b>${num(row.netRequirement)}</b><small>${supplyModel.isCustomerSupplied(row) ? "Suplai customer · tidak dibeli" : plannedOrder ? esc(plannedOrder.orderNumber) : `Buy ${num(buy)} ${esc(uom(row))}`}</small></td><td><b>${date(timeline.materialRequired)}</b><small>${esc(row.procurementWindow || "Normal")}</small></td><td><b>${date(timeline.customerDelivery)}</b><small>${esc(row.customerCode || row.planningCustomerCode || "Demand source")}</small></td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`;
    }).join("");
  }
  function renderMake(rows) {
    $("mrps-head").innerHTML = `<tr><th>Delivery Phase / Part</th><th>Level</th><th>Part Number / Code</th><th>Proses</th><th class="mrps-number">Gross</th><th class="mrps-number">Stock Used</th><th class="mrps-number">Firm Supply</th><th class="mrps-number">Net Make</th><th>Start By</th><th>FG Due</th><th>Status</th><th></th></tr>`;
    const grouped = new Map();
    rows.forEach((row) => { if (!grouped.has(row._groupKey)) grouped.set(row._groupKey, []); grouped.get(row._groupKey).push(row); });
    $("mrps-body").innerHTML = [...grouped.entries()].map(([groupKey, groupRows], groupIndex) => {
      const ordered = [...groupRows].sort((a,b) => number(a.levelMBOM)-number(b.levelMBOM) || String(a.partCode).localeCompare(String(b.partCode)));
      const root = ordered.find((row) => number(row.levelMBOM) === 0) || ordered[0];
      if (groupIndex === 0 && !state.defaultGroupInitialized && state.requirementGrouping === "GROUPED") { state.expandedGroups.add(groupKey); state.defaultGroupInitialized = true; }
      const expanded = state.requirementGrouping === "FLAT" || state.expandedGroups.has(groupKey);
      const due = root.targetDeliveryDate || root.mpsDetail?.fgRequiredDate || root.requiredDate;
      const header = state.requirementGrouping === "GROUPED" ? `<tr class="mrps-make-group ${expanded ? "is-expanded" : ""}"><td colspan="12"><button type="button" data-mrps-group="${esc(groupKey)}" aria-expanded="${expanded}"><span>${expanded ? "▼" : "▶"}</span><b>${esc(root._groupLabel || "Demand phase")}</b><small>FG ${esc(root.partCode || root.fgPartCode || "-")} · Due ${date(due)} · Net ${num(root.netRequirement ?? root.plannedOrderQty)} ${esc(uom(root))}</small></button></td></tr>` : "";
      const body = ordered.map((row) => {
        const isChild = number(row.levelMBOM) > 0;
        if (state.requirementGrouping === "GROUPED" && !expanded && isChild) return "";
        const part = row.part || {};
        const parent = row._parent || {};
        const usage = row._usage || bomUsage(row);
        const net = number(row.netRequirement ?? row.plannedOrderQty);
        const stock = Math.max(number(row.grossRequirement) - number(row.firmSupplyQty) - net, 0);
        const start = row.orderDate || row.materialRequiredDate || row.productionRequiredDate || row.requiredDate;
        const fgDue = row.targetDeliveryDate || row.mpsDetail?.fgRequiredDate || row._root?.targetDeliveryDate || row.requiredDate;
        return `<tr class="${isChild ? "mrps-make-child" : "mrps-make-root"}"><td><b>${esc(part.partName || part.partNumber || row.partCode)}</b><small>${isChild ? `Dipakai untuk ${esc(parent.partCode || row.parentPartCode || "parent")}` : esc(row._groupLabel)}</small></td><td><span class="mrps-level">L${num(row.levelMBOM,0)} · ${esc(part.rawType || part.itemType || (isChild ? "WIP" : "FG"))}</span></td><td><b>${esc(part.partNumber || "-")}</b><small>${esc(row.partCode || part.partCode || "-")}</small></td><td class="mrps-process-cell"><span>${esc(routeLabel(usage))}</span></td><td class="mrps-number"><b>${num(row.grossRequirement)}</b><small>${esc(uom(row))}</small></td><td class="mrps-number"><b>${num(stock)}</b><small>${stock >= number(row.grossRequirement) ? "Stop explode" : "Consumed FIFO"}</small></td><td class="mrps-number"><b>${num(row.firmSupplyQty)}</b></td><td class="mrps-number mrps-net-make"><b>${num(net)}</b><small>${net > 0 ? "Ke Production Plan" : "Tidak dijadwalkan"}</small></td><td><b>${date(start)}</b></td><td><b>${date(fgDue)}</b></td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`;
      }).join("");
      return header + body;
    }).join("");
  }
  function renderException(rows) {
    $("mrps-head").innerHTML = `<tr><th>Exception</th><th>Area</th><th>Part / Reference</th><th>Required Date</th><th>Dampak</th><th>Status</th><th></th></tr>`;
    $("mrps-body").innerHTML = rows.map((row) => `<tr><td><b>${esc(row._exceptionTitle)}</b><small>${esc(row._exceptionMessage)}</small></td><td><span class="mrps-exception-type">${esc(row._exceptionType)}</span></td><td><b>${esc(row.partCode || row.orderNumber || state.doc?.runNumber || "-")}</b><small>${esc(row.part?.partName || row.part?.partNumber || "")}</small></td><td>${date(row.materialRequiredDate || row.productionRequiredDate || row.requiredDate)}</td><td>${esc(row._exceptionType === "REVISION" ? "Production Plan diblokir" : row._exceptionType === "PURCHASE" ? "Material readiness" : "Schedule / traceability")}</td><td>${badge(row._state.label,row._state.tone)}</td><td>${row.id ? `<button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button>` : "-"}</td></tr>`).join("");
  }
  function renderOrders(rows) {
    $("mrps-head").innerHTML = `<tr><th>Planned Order</th><th>Material / Part</th><th class="mrps-number">Qty ${help("Qty hasil lot sizing MRP. Qty remaining belum direlease ke proses berikutnya.")}</th><th>Order Release</th><th>Material Ready By</th><th>Reference</th><th>Status</th><th></th></tr>`;
    $("mrps-body").innerHTML = rows.map((row) => {
      const remaining = Math.max(number(row.qty) - number(row.qtyReleased), 0);
      const request = row.purchaseRequest || row.purchaseRequests?.[0];
      return `<tr><td><b>${esc(row.orderNumber)}</b><small>${esc(row.orderType || "Purchase")}</small></td><td><b>${esc(row.partCode)}</b><small>${esc(row.partName || row.part?.partName || "-")}</small></td><td class="mrps-number"><b>${num(row.qty)}</b><small>Sisa ${num(remaining)} ${esc(row.uomCode || "")}</small></td><td>${date(row.orderDate)}</td><td>${date(row.requiredDate)}</td><td>${request?.prNumber ? `<a href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(request.prNumber)}">${esc(request.prNumber)}</a>` : "-"}</td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`;
    }).join("");
  }
  function renderPegging(rows) {
    $("mrps-head").innerHTML = `<tr><th>Customer / Demand</th><th>FG</th><th>Material</th><th>Customer Delivery</th><th>Material Required</th><th class="mrps-number">Need</th><th class="mrps-number">Covered ${help("Customer pegging hanya menunjukkan asal demand. Netting material tetap dikonsolidasikan.")}</th><th>Status</th><th></th></tr>`;
    $("mrps-body").innerHTML = rows.map((row) => `<tr><td><b>${esc(row.customerCode || "-")}</b><small>${esc(row.sourceNumber || row.sourceType || "-")}</small></td><td><b>${esc(row.fgPartCode || "-")}</b></td><td><b>${esc(row.materialOrComponent || row.partCode || "-")}</b></td><td>${date(row.targetDeliveryDate)}</td><td>${date(row.requiredDate)}</td><td class="mrps-number"><b>${num(row.requirementQty)}</b></td><td class="mrps-number"><b>${num(row.supplyCoverageQty)}</b></td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`).join("");
  }
  function renderTable() {
    const eligible = eligibleRows();
    renderMaterialCategories(eligible);
    const all = eligible.filter((row) => !["matrix", "buy"].includes(state.view) || selectedMaterialCategory === "ALL" || supplyModel.materialCategory(row) === selectedMaterialCategory);
    const pages = Math.max(Math.ceil(all.length / state.pageSize), 1); state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize; const rows = all.slice(start, start + state.pageSize);
    state.rows = new Map(rows.map((row) => [row._id, row]));
    document.querySelector(".mrps-table")?.classList.toggle("mrps-weekly-table", state.view === "matrix");
    const table = $("mrps-head").closest("table");
    table.classList.toggle("mrps-material-table", state.view === "matrix");
    if (state.view !== "matrix") { table.querySelector("colgroup")?.remove(); table.style.width = ""; }
    $("mrps-grouping-wrap").hidden = state.view !== "make";
    $("mrps-mplus-display-wrap").hidden = state.view !== "matrix" || !(state.doc?.mPlusOnePreview?.requirements || []).length;
    $("mrps-show-covered-wrap").hidden = state.view !== "matrix";
    if (state.view === "matrix") renderMatrix(rows); else if (state.view === "buy") renderBuy(rows); else if (state.view === "exception") renderException(rows); else renderMake(rows);
    if (!rows.length) $("mrps-body").innerHTML = `<tr><td colspan="${state.view === "matrix" ? weeklyBuckets().flat.length + 8 : state.view === "make" ? 12 : state.view === "buy" ? 11 : 7}" class="mrps-empty">Tidak ada data yang cocok${["matrix", "buy"].includes(state.view) && selectedMaterialCategory !== "ALL" ? ` untuk kategori ${esc(supplyModel.materialCategories.find((c) => c.key === selectedMaterialCategory)?.label || "terpilih")}` : ""}.</td></tr>`;
    $("mrps-range").textContent = all.length ? `${start + 1}–${Math.min(start + state.pageSize, all.length)} dari ${all.length}${state.view === "matrix" ? " material" : ""}` : "0 data";
    $("mrps-page").textContent = `Halaman ${state.page} / ${pages}`; $("mrps-prev").disabled = state.page <= 1; $("mrps-next").disabled = state.page >= pages;
    $("mrps-loading").hidden = true; $("mrps-table-wrap").hidden = false;
  }
  function openMake(row) {
    const parent = row._parent || {};
    const root = row._root || row;
    const usage = row._usage || bomUsage(row);
    const firm = number(row.firmSupplyQty);
    const net = number(row.netRequirement ?? row.plannedOrderQty);
    const stock = Math.max(number(row.grossRequirement) - firm - net, 0);
    $("mrps-drawer-title").textContent = row.partCode || "Make requirement";
    $("mrps-drawer-meta").textContent = `${row.part?.partNumber || "-"} · Level ${num(row.levelMBOM,0)} · ${row.part?.rawType || row.part?.itemType || "Production"}`;
    $("mrps-drawer-body").innerHTML = `${lineageHtml(row)}<section class="mrps-trace-section"><header><b>Trace MPS → MRP → Production Plan</b><small>Authoritative requirement ${esc(row.id || "legacy trace")}</small></header><div class="mrps-detail-grid"><div><span>Root FG</span><b>${esc(root.partCode || row.fgPartCode || "-")}</b></div><div><span>Parent Output</span><b>${esc(parent.partCode || row.parentPartCode || "-")}</b></div><div><span>Part Number</span><b>${esc(row.part?.partNumber || "-")}</b></div><div><span>Part Code</span><b>${esc(row.partCode || "-")}</b></div><div><span>Process BOM</span><b>${esc(routeLabel(usage))}</b></div><div><span>FG Due</span><b>${date(row.targetDeliveryDate || row.mpsDetail?.fgRequiredDate || root.targetDeliveryDate || row.requiredDate)}</b></div></div></section><section class="mrps-trace-section"><header><b>Netting produksi</b><small>Stock dikonsumsi kronologis dan tidak digunakan ulang</small></header><div class="mrps-equation"><span>Gross<b>${num(row.grossRequirement)}</b></span><i>−</i><span>Stock Used<b>${num(stock)}</b></span><i>−</i><span>Firm Supply<b>${num(firm)}</b></span><i>=</i><span class="result">Net Make<b>${num(net)} ${esc(uom(row))}</b></span></div><p class="mrps-reconcile-note ${net <= .000001 ? "success" : ""}">${net <= .000001 ? "Stock/supply pada level ini mencukupi. Explosion ke level bawah dihentikan dan proses tidak masuk Production Plan." : "Qty ini menjadi input Production Plan. Production Plan hanya menentukan resource dan tanggal eksekusi; qty tidak dihitung ulang."}</p></section>`;
  }
  function openRequirement(row) {
    const buy = number(row.adjustedOrderQty ?? row.plannedOrderQtyKg ?? row.plannedOrderQty ?? row.netRequirement);
    const usage = row._usage || bomUsage(row);
    const audit = supplyAudit(row);
    const parentTrace = (state.doc?.requirementTrace || []).find((item) => item.id === row.parentRequirementId);
    const parentDriverQty = number(parentTrace?.netRequirement ?? parentTrace?.plannedOrderQty ?? parentTrace?.grossRequirement);
    const parentPart = usage.parent || usage.output || {};
    const outputPart = usage.output || parentPart;
    const routeCards = usage.routes.length
      ? usage.routes.map((route) => `<span class="mrps-process-pill">${esc(route.code || route.name)}${route.name && route.name !== route.code ? ` · ${esc(route.name)}` : ""}</span>`).join("")
      : `<span class="mrps-process-pill muted">Proses belum dipetakan</span>`;
    const sources = row._demandSources || demandSources(row);
    const demandCards = sources.length ? sources.map((source) => `<article class="mrps-demand-card"><header><span class="mrps-demand-type ${esc(source.typeKey)}">${esc(source.type)}</span><b>${esc(source.sourceNumber)}</b></header><div><span>Customer<b>${esc(source.customerCode)}</b></span><span>FG<b>${esc(source.fgPartCode)}</b></span><span>Delivery Phase<b>${source.phaseNumber ? `Phase ${num(source.phaseNumber, 0)}` : source.type === "Buffer" ? "Buffer" : "-"}</b></span><span>Delivery Date<b>${date(source.deliveryDate)}</b></span><span>Demand Qty<b>${num(source.qty)} ${esc(uom(row))}</b></span></div></article>`).join("") : `<div class="mrps-demand-empty">Sumber Forecast/SO belum tersimpan pada requirement ini.</div>`;
    const demandSection = `<section class="mrps-trace-section"><header><b>Sumber Forecast / SO</b><small>Customer pegging &amp; delivery phase</small></header><div class="mrps-demand-list">${demandCards}</div></section>`;
    const changedSupply = Math.abs(audit.currentUncovered - number(row.netRequirement)) > .000001;
    $("mrps-drawer-title").textContent = row.part?.material?.materialCode || row.partCode;
    $("mrps-drawer-meta").textContent = row.part?.material?.materialName || row.part?.partName || row.part?.partNumber || "MRP requirement";
    $("mrps-drawer-body").innerHTML = `<section class="mrps-trace-section"><header><b>Dipakai untuk</b><small>Relasi langsung dari mBOM</small></header><div class="mrps-detail-grid"><div><span>Part Number</span><b>${esc(parentPart.partNumber || "-")}</b></div><div><span>Part Code</span><b>${esc(parentPart.partCode || "-")}</b></div><div><span>Output BOM</span><b>${esc(outputPart.partNumber || "-")}<small>${esc(outputPart.partCode || "-")}</small></b></div><div><span>mBOM</span><b>${esc(usage.bomNumber)}</b></div></div><div class="mrps-process-list"><span>Proses pemakaian</span><div>${routeCards}</div></div></section>${demandSection}<section class="mrps-trace-section"><header><b>Hasil BOM explode &amp; netting stock</b><small>Runtutan angka yang dipakai sistem</small></header><ol class="mrps-trace-steps"><li><span>1</span><div><b>Driver kebutuhan parent</b><small>${parentDriverQty ? `${num(parentDriverQty)} ${esc(parentTrace?.part?.productionUomCode || parentTrace?.part?.baseUomCode || "PCS")}` : "Mengikuti demand parent pada mBOM"}</small></div></li><li><span>2</span><div><b>Pemakaian BOM</b><small>${num(usage.qtyPerParent)} ${esc(usage.usageUom)} per parent</small></div></li><li><span>3</span><div><b>Hasil explode BOM</b><small>${num(row.grossRequirement)} ${esc(uom(row))}</small></div></li></ol><div class="mrps-equation"><span>Gross BOM<b>${num(row.grossRequirement)}</b></span><i>−</i><span>Stock available<b>${num(audit.warehouseAvailable)}</b></span><i>−</i><span>Dalam WIP / FG<b>${num(audit.embeddedWip)}</b></span><i>−</i><span>Open PO eligible<b>${num(audit.firmSupply)}</b></span><i>=</i><span class="result">Uncovered saat ini<b>${num(audit.currentUncovered)} ${esc(uom(row))}</b></span></div>${changedSupply ? `<p class="mrps-reconcile-note">Net MRP saat run: <b>${num(row.netRequirement)} ${esc(uom(row))}</b>. Angka uncovered saat ini berbeda karena saldo stock atau open PO dapat berubah setelah MRP dijalankan.</p>` : `<p class="mrps-reconcile-note success">Sesuai dengan net MRP saat run: <b>${num(row.netRequirement)} ${esc(uom(row))}</b>.</p>`}<div class="mrps-formula"><b>${supplyModel.isCustomerSupplied(row) ? "Kebutuhan suplai customer" : "Rekomendasi order"}</b><span>Net MRP ${num(row.netRequirement)} ${esc(uom(row))} · ${esc(supplyModel.supplyLabel(row))}</span><span>${supplyModel.isCustomerSupplied(row) ? "Kebutuhan tetap ditampilkan dan dinetting. Tidak dibuat Purchase Suggestion / PR / PO." : `Planned order ${num(buy)} ${esc(uom(row))}. MOQ diterapkan pada Purchase Suggestion; net requirement MRP tetap asli.`}</span></div></section><div class="mrps-source"><b>Sumber demand</b>MPS ${esc(state.doc?.mpsNumber || "-")} · FG utama ${esc(row.fgPartCode || row.planningPartCode || "-")} · Customer ${esc(row.planningCustomerCode || row.customerCode || "-")}</div>`;
    $("mrps-drawer-body").insertAdjacentHTML("afterbegin", lineageHtml(row));
    const auditMarkup = $("mrps-drawer-body").innerHTML;
    $("mrps-drawer-body").innerHTML = `${compactNettingMarkup({ items: [row], row: { uom: uom(row) } })}<details class="mrps-netting-audit"><summary>Detail BOM &amp; sumber perhitungan</summary>${auditMarkup}</details>`;
  }
  function openOrder(row) {
    const remaining = Math.max(number(row.qty) - number(row.qtyReleased), 0);
    $("mrps-drawer-title").textContent = row.orderNumber || "Planned Order"; $("mrps-drawer-meta").textContent = row.partCode || "-";
    $("mrps-drawer-body").innerHTML = `<div class="mrps-detail-grid"><div><span>Qty order</span><b>${num(row.qty)} ${esc(row.uomCode || "")}</b></div><div><span>Remaining</span><b>${num(remaining)} ${esc(row.uomCode || "")}</b></div><div><span>Order date</span><b>${date(row.orderDate)}</b></div><div><span>Required date</span><b>${date(row.requiredDate)}</b></div><div><span>Status</span><b>${esc(row.status || "Planned")}</b></div><div><span>Reference</span><b>${esc(row.referenceNumber || state.doc?.runNumber || "-")}</b></div></div><div class="mrps-source"><b>Arti planned order</b>Rekomendasi supply dari MRP. Purchase planned order diteruskan ke Purchase Suggestion sebelum PR/PO.</div>`;
    const orderLabels = $("mrps-drawer-body").querySelectorAll(".mrps-detail-grid span");
    if (orderLabels[2]) orderLabels[2].textContent = "Order release";
    if (orderLabels[3]) orderLabels[3].textContent = "Material ready by";
  }
  function openPegging(row) {
    $("mrps-drawer-title").textContent = row.sourceNumber || row.customerCode || "Demand"; $("mrps-drawer-meta").textContent = `${row.customerCode || "-"} · ${row.fgPartCode || "-"}`;
    $("mrps-drawer-body").innerHTML = `<div class="mrps-detail-grid"><div><span>Target delivery</span><b>${date(row.targetDeliveryDate)}</b></div><div><span>Material required</span><b>${date(row.requiredDate)}</b></div><div><span>Requirement</span><b>${num(row.requirementQty)}</b></div><div><span>Supply coverage</span><b>${num(row.supplyCoverageQty)}</b></div><div><span>Material</span><b>${esc(row.materialOrComponent || row.partCode || "-")}</b></div><div><span>Risk</span><b>${esc(row.risk || "-")}</b></div></div><div class="mrps-source"><b>Customer pegging</b>Menjaga trace demand customer. Perhitungan stock material tetap consolidated agar supply tidak dihitung berulang.</div>`;
  }
  function weeklyPhaseRows(items) {
    const result = [];
    items.forEach((item) => {
      const sources = item._demandSources?.length ? item._demandSources : [{
        sourceNumber: item.rootDemandSourceNumber || item.sourceNumber,
        customerCode: item.customerCode,
        fgPartCode: item.fgPartCode,
        qty: item.netRequirement,
        deliveryDate: item.targetDeliveryDate,
        deliveryTargetId: item.deliveryTargetId,
      }];
      sources.forEach((source) => result.push({
        ...source,
        materialCode: item.part?.material?.materialCode || item.partCode,
        materialArrival: item.materialRequiredDate || item.requiredDate,
        latestPurchase: item.orderDate || item.latestPrDate,
        netRequirement: number(item.netRequirement),
      }));
    });
    return result.sort((left, right) => String(left.deliveryDate || "").localeCompare(String(right.deliveryDate || "")) || String(left.sourceNumber || "").localeCompare(String(right.sourceNumber || "")));
  }
  function compactNettingMarkup(cell) {
    const totals = nettingSummary.summarize(cell.items, isLookaheadRequirement);
    const unit = cell.row.uom;
    const cards = [["official", "Netting MRP"], ["preview", "Preview M+1 · terpisah dari official"]].map(([key, title]) => {
      const total = totals[key];
      if (!total.count) return "";
      const covered = total.complete && total.net <= .000001;
      return `<section class="mrps-netting-compact"><header><b>${title}</b><span class="mrps-badge ${covered ? "covered" : "buy"}">${!total.complete ? "Data belum lengkap" : covered ? "Tercover" : "Perlu supply"}</span></header><div class="mrps-netting-numbers"><div><span>Kebutuhan</span><b>${total.complete ? qty(total.gross, unit) : "—"}</b><small>${esc(unit)}</small></div><div><span>Tercover</span><b>${total.complete ? qty(total.covered, unit) : "—"}</b><small>Stok + firm supply</small></div><div class="${covered ? "covered" : "shortage"}"><span>Kekurangan</span><b>${total.complete ? qty(total.net, unit) : "—"}</b><small>${esc(unit)}</small></div></div><p>${!total.complete ? "Lengkapi data kebutuhan dan netting pada snapshot MRP." : covered ? "Kebutuhan sudah terpenuhi. Tidak perlu supply tambahan." : "Kekurangan harus tersedia sebelum tanggal pemakaian."}</p></section>`;
    }).join("");
    const arrivals = cell.items.map((item) => item.materialRequiredDate || item.requiredDate).filter(validDate).sort((a, b) => new Date(a) - new Date(b));
    const purchaseDates = cell.items.filter((item) => !supplyModel.isCustomerSupplied(item) && number(item.netRequirement) > .000001).map((item) => item.orderDate || item.latestPrDate).filter(validDate).sort((a, b) => new Date(a) - new Date(b));
    const customerSupply = cell.items.some((item) => supplyModel.isCustomerSupplied(item));
    const consumption = cell.items.map((item) => {
      const usage = item._usage || bomUsage(item);
      return `<tr><td><b>${esc(usage.parent?.partNumber || usage.output?.partNumber || item.planningPartCode || "—")}</b><small>${esc(routeLabel(usage))}</small></td><td>${date(item.materialRequiredDate || item.requiredDate)}</td><td class="mrps-number">${qty(isLookaheadRequirement(item) ? item.mPlusOneActualNetPurchaseQty ?? item.netRequirement : item.netRequirement, unit)} ${esc(unit)}${isLookaheadRequirement(item) ? " · M+1" : ""}</td></tr>`;
    }).join("");
    return `${cards}<div class="mrps-netting-dates"><span>Material tersedia<b>${arrivals.length ? date(arrivals[0]) + (dateKey(arrivals[0]) !== dateKey(arrivals.at(-1)) ? ` – ${date(arrivals.at(-1))}` : "") : "Belum tersedia"}</b></span>${purchaseDates.length ? `<span>Mulai pembelian paling lambat<b>${date(purchaseDates[0])}</b></span>` : ""}${customerSupply ? '<span>Sumber supply<b>Disuplai customer · tidak dibeli</b></span>' : ""}</div><details class="mrps-netting-audit"><summary>Part pemakai · ${num(cell.items.length, 0)} kebutuhan</summary><div class="mrps-netting-consumption"><table><thead><tr><th>Part / proses</th><th>Material tersedia</th><th>Kekurangan</th></tr></thead><tbody>${consumption}</tbody></table></div></details>`;
  }
  function bucketDetailMarkup(cell, includeRecovery = true) {
    const phases = weeklyPhaseRows(cell.items);
    const phaseCards = phases.map((phase) => {
      const references = [...new Map([
        ...(phase.typeKey === "forecast" ? [{ sourceType: "FORECAST", sourceNumber: phase.sourceNumber }] : []),
        ...(phase.referenceSources || []),
      ].filter((source) => source.sourceNumber).map((source) => [`${source.sourceType}|${source.sourceNumber}`, source])).values()];
      const sourceTitle = sourceHref(phase.type, phase.sourceNumber)
        ? `<a class="mrps-source-link" href="${sourceHref(phase.type, phase.sourceNumber)}">${esc(phase.sourceNumber)}</a>`
        : `<b>${esc(phase.sourceNumber || "Demand phase")}</b>`;
      const referenceMarkup = references.length
        ? references.map((source) => sourceReferenceLink(source)).join(" · ")
        : "Forecast belum terhubung";
      const phaseLabel = phase.phaseLabel || (phase.phaseNumber ? `Phase ${num(phase.phaseNumber, 0)}` : "Delivery phase belum dipetakan");
      return `<article class="mrps-week-phase"><header>${sourceTitle}<span>${esc(phase.customerCode || "-")}</span></header><div><span>FG<b>${esc(phase.fgPartCode || "-")}</b></span><span>Delivery phase<b>${esc(phaseLabel)}</b><small>${phase.deliveryTargetId ? `Target ${esc(phase.deliveryTargetId)}` : "Tanpa target customer"}</small></span><span>Customer delivery<b>${date(phase.deliveryDate)}</b></span><span>Material harus datang<b>${date(phase.materialArrival)}</b></span><span>Latest purchase (audit)<b>${date(phase.latestPurchase)}</b></span><span>FG phase qty<b>${qty(phase.qty, phase.demandUom || "PCS")} ${esc(phase.demandUom || "PCS")}</b></span><span class="mrps-phase-forecast">Forecast source<b>${referenceMarkup}</b></span><span>Snapshot MPS<b>${esc(phase.mpsNumber || state.doc?.mpsNumber || "-")}${phase.mpsRevision != null ? ` · rev ${num(phase.mpsRevision, 0)}` : ""}</b></span></div></article>`;
    }).join("");
    const nettingRows = cell.items.map((item) => {
      const lookahead = isLookaheadRequirement(item);
      const effective = number(item.effectiveDemandQty);
      const buffer = number(item.bufferQty);
      const gross = number(item.grossRequirement);
      const net = number(item.netRequirement);
      const covered = Math.max(gross - net, 0);
      if (lookahead) {
        const fullBasis = number(item.mPlusOneFullEfdBasisQty);
        const coveredBasis = number(item.mPlusOneCoveredBasisQty);
        const fullGross = number(item.mPlusOneFullEfdGrossQty ?? item.forecastQty);
        const selectedGross = lookaheadDisplayQty(item);
        const actualNet = number(item.mPlusOneActualNetPurchaseQty ?? item.netRequirement);
        const deliveryRequirement = number(item.mPlusOneDeliveryRequirementQty ?? item.grossRequirement);
        const inventoryStock = number(item.mPlusOneInventoryStockQty ?? item.onHandQty);
        const reservedStock = number(item.mPlusOneReservedStockQty ?? item.allocatedQty);
        const freeStock = number(item.mPlusOneFreeStockQty ?? Math.max(inventoryStock - reservedStock, 0));
        const stockUsed = number(item.mPlusOneStockUsedQty ?? Math.max(deliveryRequirement - actualNet, 0));
        return `<article class="mrps-netting-line lookahead"><header><b>${esc(item.partCode)} · ${esc(lookaheadDisplayLabel())}</b><span>${date(item.requiredDate)}</span></header><div><span>Kebutuhan delivery<b>${qty(deliveryRequirement, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Stock inventory<b>${qty(inventoryStock, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Reserved stock<b>${qty(reservedStock, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Free stock<b>${qty(freeStock, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Stock terpakai<b>${qty(stockUsed, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Net requirement M+1<b>${qty(actualNet, cell.row.uom)} ${esc(cell.row.uom)}</b></span>${state.mPlusOneDisplayMode === "FULL_EFD" ? `<span>Gross BOM full<b>${qty(fullGross, cell.row.uom)} ${esc(cell.row.uom)}</b></span>` : ""}</div><small>Net M+1 dihitung per delivery phase dari snapshot stock saat ini. Stock dipakai berurutan antar phase M+1, tidak dikurangi pemakaian bulan M, dan tidak masuk Total official.</small></article>`;
      }
      return `<article class="mrps-netting-line"><header><b>${esc(item.partCode)}</b><span>${date(item.requiredDate)}</span></header><div><span>Base demand<b>${qty(effective, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Buffer child MRP<b>${qty(buffer, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Gross requirement<b>${qty(gross, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Stock / firm supply terpakai<b>${qty(covered, cell.row.uom)} ${esc(cell.row.uom)}</b></span><span>Net material<b>${qty(net, cell.row.uom)} ${esc(cell.row.uom)}</b></span></div><small>${esc(item.notes || (buffer > 0 ? "Buffer tersimpan pada snapshot requirement." : "Buffer dimiliki MPS; child MRP tidak menambah buffer ulang."))}</small></article>`;
    }).join("");
    const history = (state.doc?.revisionHistory || []).slice(0, 8);
    const historyMarkup = history.length ? `<section class="mrps-revision-history"><header><b>History netting</b><small>Snapshot tidak ditulis ulang</small></header><div>${history.map((run) => `<a href="/modules/planning-ppic/mrp/${encodeURIComponent(run.runNumber)}" class="${run.runNumber === state.doc.runNumber ? "current" : ""}"><b>${esc(run.runNumber)} · Rev ${num(run.planRevision || 1, 0)}</b><span>${esc(mrpLifecycle(run))} · ${date(run.runDate)} · ${esc(run.runBy || "system")}</span></a>`).join("")}</div></section>` : "";
    const recovery = includeRecovery && cell.status.key === "LATE" ? `<button class="btn btn-danger" type="button" data-mrps-recovery="${esc(cell.row._id)}">Atur Recovery</button>` : "";
    const discreteAudit = isDiscreteUom(cell.row.uom) && Math.abs(number(cell.rawQty) - number(cell.qty)) > 1e-9
      ? `<small class="mrps-discrete-audit">Kebutuhan kalkulasi ${num(cell.rawQty)} dibulatkan naik menjadi ${qty(cell.qty, cell.row.uom)} karena ${esc(cell.row.uom)} adalah unit discrete.</small>`
      : "";
    const ownershipCopy = cell.hasLookahead
      ? cell.officialQty > 0
        ? `Official ${qty(cell.officialQty, cell.row.uom)} + Preview M+1 ${qty(cell.lookaheadQty, cell.row.uom)} · preview tidak masuk total`
        : cell.lookaheadQty > 0 ? `Preview M+1 · ${lookaheadDisplayLabel()} · tidak masuk total official` : "Preview M+1 covered oleh WIP/stock · tidak masuk total official"
      : esc(cell.status.label);
    return `<header class="mrps-netting-week"><b>W${cell.bucket.week} · ${date(cell.bucket.start)}–${date(cell.bucket.end)}</b><small>Snapshot ${esc(state.doc?.runNumber || "MRP")}</small></header>${compactNettingMarkup(cell)}<div class="mrps-week-recovery-action">${recovery}</div><details class="mrps-netting-audit"><summary>Detail perhitungan &amp; delivery phase</summary><section class="mrps-week-summary"><div><span>Qty tabel</span><b>${qty(cell.qty, cell.row.uom)} ${esc(cell.row.uom)}</b><small>${ownershipCopy}</small>${discreteAudit}</div></section><section class="mrps-trace-section"><header><b>Delivery phase yang dicakup</b></header><div class="mrps-week-phase-list">${phaseCards || '<div class="mrps-demand-empty">Delivery phase belum memiliki pegging.</div>'}</div></section><section class="mrps-trace-section"><header><b>Audit formula netting</b><small>Kebutuhan − stok / firm supply terpakai = kekurangan</small></header><div class="mrps-netting-list">${nettingRows}</div></section>${historyMarkup}</details>`;
  }
  function openWeeklyBucket(cellId) {
    const cell = state.bucketCells.get(cellId); if (!cell) return;
    $("mrps-drawer-title").textContent = `${cell.row.materialCode} · W${cell.bucket.week}`;
    $("mrps-drawer-meta").textContent = `${cell.row.materialName} · Part No: ${(cell.row.materialPartNumbers || []).join(", ") || "—"}`;
    $("mrps-drawer-body").innerHTML = bucketDetailMarkup(cell);
    $("mrps-drawer").setAttribute("aria-hidden", "false");
  }
  function openMatrixDetail(rowId) {
    const row = state.rows.get(rowId); if (!row) return;
    const cells = [...row.cells.values()].sort((left, right) => left.bucket.start - right.bucket.start);
    $("mrps-drawer-title").textContent = row.materialCode;
    $("mrps-drawer-meta").textContent = `${row.materialName} · Part No: ${(row.materialPartNumbers || []).join(", ") || "—"}`;
    $("mrps-drawer-body").innerHTML = cells.map((cell) => bucketDetailMarkup({ ...cell, row }, false)).join('<hr class="mrps-week-separator">');
    $("mrps-drawer").setAttribute("aria-hidden", "false");
  }
  function stockLocation(line) {
    return [line.warehouseCode || line.warehouseName, line.rackCode && `Rack ${line.rackCode}`, line.lotNumber && `Lot ${line.lotNumber}`].filter(Boolean).join(" · ") || "Lokasi belum dipetakan";
  }
  function stockLineMarkup(lines, kind, row) {
    const activeLines = lines.filter((line) => number(line.qtyOnHand) > .000001);
    if (!activeLines.length) return `<div class="mrps-stock-empty">Tidak ada stock ${kind === "wip" ? "WIP-equivalent" : "warehouse"} pada snapshot saat ini.</div>`;
    return activeLines.map((line) => {
      const isWip = kind === "wip";
      const physicalQty = number(line.qtyOnHand);
      const processes = (line.sourceProcesses || []).map((process) => process.code || process.name).filter(Boolean).join(" → ");
      return `<article class="mrps-stock-line ${isWip ? "wip" : "warehouse"}"><header><div><span>${isWip ? "WIP EQUIVALENT" : "WAREHOUSE STOCK"}</span><b>${esc(isWip ? line.sourcePartCode || "WIP part" : line.warehouseCode || line.warehouseName || "Warehouse")}</b>${isWip ? `<small>${esc(line.sourcePartName || line.sourceItemType || "Output proses")}${processes ? ` · ${esc(processes)}` : ""}</small>` : ""}</div><strong>${qty(physicalQty, row.uom)} ${esc(row.uom)}</strong></header><div><span>Lokasi<b>${esc(stockLocation(line))}</b></span><span>On hand<b>${qty(line.qtyOnHand, row.uom)}</b></span><span>Reserved<b>${qty(line.qtyReserved, row.uom)}</b></span><span>QC<b>${qty(line.qtyQC, row.uom)}</b></span><span>Available<b>${qty(line.qtyAvailable, row.uom)}</b></span></div>${isWip ? `<p>Material ${esc(row.materialCode)} sudah tertanam pada output WIP ini dan dihitung sebagai coverage sesuai jalur BOM terkait.</p>` : ""}</article>`;
    }).join("");
  }
  function openStockPopup(rowId) {
    const row = state.rows.get(rowId); if (!row) return;
    const stock = row.currentStock || summarizeCurrentStock([...row.cells.values()].flatMap((cell) => cell.items));
    $("mrps-stock-title").textContent = `${row.materialCode} · Current Stock`;
    $("mrps-stock-meta").textContent = `${row.identificationCode} · saldo live saat popup dibuka`;
    $("mrps-stock-body").innerHTML = `<section class="mrps-stock-kpis"><article><span>Total physical stock</span><b>${qty(stock.totalQty, row.uom)} ${esc(row.uom)}</b></article><article><span>Warehouse on hand</span><b>${qty(stock.warehouseQty, row.uom)} ${esc(row.uom)}</b><small>Free ${qty(stock.warehouseAvailableQty, row.uom)} · Reserved ${qty(stock.warehouseReservedQty, row.uom)}</small></article><article><span>WIP equivalent</span><b>${qty(stock.wipQty, row.uom)} ${esc(row.uom)}</b></article></section><section class="mrps-stock-section"><header><b>Stock warehouse</b><small>Physical on-hand; available dipakai untuk netting setelah reserve dan QC</small></header><div>${stockLineMarkup(stock.warehouseLines, "warehouse", row)}</div></section><section class="mrps-stock-section"><header><b>Stock WIP yang meng-cover material</b><small>Sumber part dan lokasi hanya ditampilkan di popup ini</small></header><div>${stockLineMarkup(stock.wipLines, "wip", row)}</div></section><p class="mrps-stock-note">Kolom WH menampilkan physical on-hand inventory. Netting hanya memakai free/available stock setelah reserved dan QC; snapshot resmi ${esc(state.doc?.runNumber || "MRP")} tidak ditulis ulang.</p>`;
    $("mrps-stock-modal").setAttribute("aria-hidden", "false");
    $("mrps-stock-modal").querySelector(".mrps-modal-panel").scrollTop = 0;
  }
  function closeStockPopup() { $("mrps-stock-modal").setAttribute("aria-hidden", "true"); }
  function recoveryTargetOptions(row) {
    const lateCells = [...row.cells.values()].filter((cell) => cell.status.key === "LATE");
    const phases = weeklyPhaseRows(lateCells.flatMap((cell) => cell.items));
    const unique = new Map();
    phases.filter((phase) => phase.deliveryTargetId).forEach((phase) => {
      if (!unique.has(phase.deliveryTargetId)) unique.set(phase.deliveryTargetId, phase);
    });
    return [...unique.values()];
  }
  async function loadRecoveryTarget(targetId) {
    const recovery = state.recovery; if (!recovery || !targetId) return;
    $("mrps-recovery-status").textContent = "Mengambil feasibility dan recovery plan…";
    $("mrps-recovery-submit").disabled = true;
    try {
      const context = await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(targetId)}/recovery-plan`);
      if (!state.recovery || state.recovery.targetId !== targetId) return;
      recovery.context = context;
      const optionalIds = new Set(["REDUCE_SUPPLIER_LEAD_TIME", "RUN_TRIAL_RECOVERY", "SHIFT_PRODUCTION_START", "REDUCE_VENDOR_LEAD_TIME", "FORCE_WITH_REASON", "ACCEPT_LATE"]);
      const options = (context.recommendation?.actions || []).filter((item) => optionalIds.has(item.id));
      $("mrps-recovery-action").innerHTML = options.map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join("");
      const selected = (Array.isArray(context.plan?.checklist) ? context.plan.checklist : []).find((item) => optionalIds.has(item.id) && item.selected) || options[0];
      if (selected?.id) $("mrps-recovery-action").value = selected.id;
      $("mrps-recovery-owner").value = selected?.owner || selected?.ownerRole || "PPIC";
      $("mrps-recovery-date").value = dateKey(selected?.targetDate || context.feasibility?.earliestFeasibleDeliveryDate || context.target?.targetDeliveryDate);
      $("mrps-recovery-reason").value = selected?.notes || context.plan?.notes || "";
      $("mrps-recovery-evidence").value = selected?.evidenceReference || "";
      const status = context.plan?.status || "BELUM ADA";
      $("mrps-recovery-status").innerHTML = `<b>${esc(status)}</b><span>Recovery revision ${num(context.plan?.revision || 0, 0)} · customer due ${date(context.target?.targetDeliveryDate)}</span>`;
      $("mrps-recovery-submit").textContent = status === "PENDING_APPROVAL" ? "Approve Recovery" : status === "APPROVED" ? "Buat Revisi & Ajukan" : "Simpan & Ajukan Approval";
      $("mrps-recovery-submit").disabled = false;
    } catch (error) { $("mrps-recovery-status").textContent = error.message; }
  }
  async function openRecovery(rowId) {
    const row = state.rows.get(rowId); if (!row) return;
    const phases = recoveryTargetOptions(row);
    if (!phases.length) return alert("Delivery phase pada kebutuhan ini belum memiliki deliveryTargetId; recovery belum dapat disimpan.");
    state.recovery = { row, phases, targetId: phases[0].deliveryTargetId, context: null };
    $("mrps-recovery-meta").textContent = `${row.materialCode} · ${row.fgLabel} · recovery disimpan per delivery phase`;
    $("mrps-recovery-phase").innerHTML = phases.map((phase) => `<option value="${esc(phase.deliveryTargetId)}">${esc(phase.sourceNumber || "Demand")} · ${date(phase.deliveryDate)} · ${esc(phase.fgPartCode || "-")}</option>`).join("");
    $("mrps-recovery-ack").checked = false;
    $("mrps-recovery-modal").setAttribute("aria-hidden", "false");
    await loadRecoveryTarget(state.recovery.targetId);
  }
  function closeRecovery() { $("mrps-recovery-modal").setAttribute("aria-hidden", "true"); state.recovery = null; }
  function openDrawer(id) { const row = state.rows.get(id); if (!row) return; if (id.startsWith("make:") || id.startsWith("exception:make:") || id.startsWith("exception:part:")) openMake(row); else if (id.startsWith("order:")) openOrder(row); else if (id.startsWith("peg:")) openPegging(row); else openRequirement(row); $("mrps-drawer").setAttribute("aria-hidden", "false"); }
  function closeDrawer() { $("mrps-drawer").setAttribute("aria-hidden", "true"); }
  async function switchView(view) {
    state.view = view; state.page = 1; state.query = ""; state.filter = view === "exception" ? "ACTION" : "ALL"; $("mrps-search").value = ""; $("mrps-filter").value = state.filter;
    $("mrps-grouping-wrap").hidden = view !== "make";
    document.querySelectorAll("[data-mrps-view]").forEach((button) => { const active = button.dataset.mrpsView === view; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    renderTable();
  }
  function renderPlanPreview(preview) {
    const items = preview.items || [];
    $("mrps-plan-preview").innerHTML = `<header><b>${esc(preview.sourceMpsNumber)} · ${esc(preview.demandFreezeLabel)}</b><small>${esc(preview.mrpRunNumber)} · Revision ${num(preview.mrpRevision || 1, 0)} · eksekusi dibatasi owner month</small></header><div class="mrps-preview-list">${items.map((item) => `<article class="mrps-preview-item ${item.scheduleRisk === "START_PASSED" ? "risk" : ""}"><header><b>Production Window ${date(item.horizonStart || item.estimatedStart)} – ${date(item.horizonEnd || item.requiredEnd)}</b><span>${esc(item.planNumber || item.action.replaceAll("_", " "))} · ${esc(item.planStatus)}${item.crossMonth ? " · MRP LOOKBACK" : ""}</span></header><div><span><small>FG / Qty</small><strong>${num(item.receiptCount, 0)} phase · ${num(item.fgPlannedQty)} PCS</strong></span><span><small>First Allocation</small><strong>${date(item.estimatedStart)}</strong><small>MRP lookback ${date(item.mrpLookbackStart)}</small></span><span><small>Delivery Coverage</small><strong>${date(item.requiredStart)} – ${date(item.requiredEnd)}</strong></span><span><small>Process Lines</small><strong>${num(item.processCount, 0)}</strong></span><span><small>Ownership</small><strong>Owner Month Execution</strong></span><span><small>Action</small><strong>${esc(item.action.replaceAll("_", " "))}</strong></span></div></article>`).join("")}</div>`;
  }
  async function openModal(action) {
    state.action = action; $("mrps-modal-confirm").checked = false;
    $("mrps-plan-preview").hidden = true; $("mrps-modal-submit").disabled = false;
    if (action === "suggestion") { $("mrps-modal-title").textContent = "Buat Purchase Suggestion"; $("mrps-modal-copy").textContent = "Teruskan purchase planned order untuk direview Purchasing."; $("mrps-modal-confirm-copy").textContent = "Saya sudah meninjau shortage, qty rekomendasi, dan Material Ready By."; $("mrps-modal-submit").textContent = "Buat Purchase Suggestion"; }
    else { $("mrps-modal-title").textContent = "Preview Monthly Planning"; $("mrps-modal-copy").textContent = "Periksa owner month, delivery coverage, qty FG, dan operasi INHOUSE/VENDOR sebelum membuat atau menyinkronkan Monthly Planning."; $("mrps-modal-confirm-copy").textContent = "Saya sudah meninjau source MPS/MRP, owner month, qty, dan risiko kapasitas."; $("mrps-modal-submit").textContent = "Buat / Sinkronkan Monthly Planning"; $("mrps-plan-preview").hidden = false; $("mrps-plan-preview").innerHTML = "<small>Menyiapkan preview dari current MRP…</small>"; $("mrps-modal-submit").disabled = true; }
    $("mrps-modal").setAttribute("aria-hidden", "false");
    if (action === "production") {
      try {
        const preview = await api(`/modules/api/planning-ppic/monthly-plan/from-mps/preview?mpsNumber=${encodeURIComponent(state.doc?.mpsNumber || "")}`);
        if (state.action !== "production") return;
        renderPlanPreview(preview); $("mrps-modal-submit").disabled = !(preview.items || []).length;
      } catch (error) {
        $("mrps-plan-preview").innerHTML = `<div class="mrps-preview-error">${esc(error.message)}</div>`;
        $("mrps-modal-submit").disabled = true;
      }
    }
  }
  function closeModal() { $("mrps-modal").setAttribute("aria-hidden", "true"); state.action = null; }
  function renderMPlusOneOption() {
    const option = state.doc?.mPlusOneOption;
    if (!option?.available) {
      $("mrps-mplus-content").innerHTML = `<div class="mrps-preview-error">${esc(option?.message || "Source M+1 belum tersedia.")}</div>`;
      $("mrps-mplus-submit").disabled = true;
      return;
    }
    const totals = option.totals || {};
    const forecasts = (option.forecastSources || []).map((source) => `<a href="/modules/sales/forecasts/${encodeURIComponent(source.forecastNumber)}">${esc(source.forecastNumber)}</a><small>v${num(source.version || 1, 0)} · rev ${num(source.revisionNumber || 0, 0)} · ${esc(source.status || "-")}</small>`).join("");
    $("mrps-mplus-content").innerHTML = `<section class="mrps-mplus-source"><div><span>Source EFD / revision snapshot</span><b>${forecasts || "Forecast belum terhubung"}</b></div><div><span>Periode M+1</span><b>${month(option.periodStart)}</b><small>${date(option.periodStart)} – ${date(option.periodEnd)}</small></div><div><span>MPS look-ahead</span><b>${esc(option.sourceMpsNumber)} · rev ${num(option.sourceMpsRevision || 0, 0)}</b><small>${esc(option.sourceMpsStatus)}</small></div></section><section class="mrps-mplus-metrics"><article><span>Kebutuhan delivery / EFD M+1</span><b>${num(totals.efdMPlusOne)}</b></article><article><span>Stock inventory saat ini</span><b>${num(totals.inventoryStockQty)}</b></article><article><span>Reserved stock</span><b>${num(totals.reservedStockQty)}</b></article><article><span>Free stock</span><b>${num(totals.freeStockQty)}</b></article><article><span>Stock coverage M+1</span><b>${num(totals.stockCoverageQty)}</b></article><article><span>Net requirement · demand only</span><b>${num(totals.netDemandOnly)}</b></article><article><span>Net requirement · + buffer M+2</span><b>${num(totals.netWithMPlusTwoBuffer)}</b></article></section><p class="mrps-mplus-formula">Net M+1 = max(kebutuhan delivery M+1 − stock inventory saat ini, 0).<br>Snapshot stock tidak dikurangi oleh pemakaian bulan M; di dalam M+1 stock tetap dikonsumsi kronologis agar tidak dipakai dua kali antar delivery phase.</p><p class="mrps-mplus-impact">Dampak make akan dihitung untuk ${num(option.itemCount, 0)} FG. Dampak buy baru final setelah simulasi BOM dan netting stock selesai.</p>`;
    $("mrps-mplus-submit").disabled = false;
  }
  function openMPlusOne() {
    $("mrps-mplus-confirm").checked = false;
    document.querySelector('input[name="mrps-mplus-mode"][value="DEMAND_ONLY"]').checked = true;
    renderMPlusOneOption();
    $("mrps-mplus-modal").setAttribute("aria-hidden", "false");
  }
  function closeMPlusOne() { $("mrps-mplus-modal").setAttribute("aria-hidden", "true"); }
  async function rerunOfficial() {
    const cycleNumbers = state.doc?.scenarioAssumptions?.planningCycleMpsNumbers || state.doc?.scenarioAssumptions?.sourceMpsNumbers || [state.doc?.mpsNumber].filter(Boolean);
    if (!window.confirm(`Hitung working revision baru dari ${state.doc?.mpsNumber}? ${state.doc?.runNumber} tetap tersimpan sebagai history.`)) return;
    const trigger = document.querySelector("[data-mrps-rerun]");
    if (trigger) { trigger.disabled = true; trigger.textContent = "Menghitung…"; }
    try {
      const generated = await api("/modules/api/planning-ppic/mrp/generate-number");
      const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: state.doc.mpsNumber, mpsNumbers: cycleNumbers, planningMode: "OFFICIAL" }) });
      location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`;
    } catch (error) {
      alert(error.message);
      if (trigger) { trigger.disabled = false; trigger.textContent = "Hitung Revision MRP"; }
    }
  }
  async function approveMrp() {
    const doc = state.doc;
    if (!doc || mrpLifecycle(doc) !== "SIMULATED") return;
    if (!window.confirm(`Approve ${doc.runNumber}? Snapshot netting ini akan menjadi MRP current tanpa dihitung ulang.`)) return;
    const trigger = document.querySelector("[data-mrps-approve]");
    if (trigger) { trigger.disabled = true; trigger.textContent = "Memproses…"; }
    try {
      const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(doc.runNumber)}/approve`, { method: "PATCH", body: "{}" });
      const residual = result.residualReplan;
      const residualNote = residual?.mode === "RESIDUAL_REPLAN_PRESERVE_EXECUTION"
        ? ` ${number(residual.protectedExecutionCount)} histori eksekusi dipertahankan; revision ini hanya menangani sisa kebutuhan.`
        : "";
      alert(`${doc.runNumber} berhasil Approved dan menjadi MRP current.${residualNote}`, true);
      await load();
    } catch (error) {
      alert(error.message);
      if (trigger) { trigger.disabled = false; trigger.textContent = "Approve MRP"; }
    }
  }
  async function autoAcceptLate() {
    const targets = bulkLateTargets();
    if (!targets.length) return alert("Tidak ada delivery phase terlambat yang belum ditangani.");
    const defaultReason = `Accept late massal sesuai earliest feasible delivery ${state.doc?.runNumber || "MRP"}.`;
    const reason = window.prompt("Catatan audit Auto Accept Late (minimal 10 karakter):", defaultReason);
    if (reason == null) return;
    if (reason.trim().length < 10) return alert("Catatan audit minimal 10 karakter.");
    if (!window.confirm(`Accept Late ${targets.length} delivery phase? Tanggal baru akan memakai earliest feasible delivery dan langsung berstatus Approved.`)) return;
    const button = document.querySelector("[data-mrps-auto-accept-late]");
    if (button) { button.disabled = true; button.textContent = `Memproses ${targets.length} phase…`; }
    try {
      const result = await api("/modules/api/planning-ppic/demand-planning/recovery-plans/bulk-accept-late", {
        method: "POST",
        body: JSON.stringify({
          runNumber: state.doc.runNumber,
          deliveryTargetIds: targets.map((target) => target.deliveryTargetId),
          reason: reason.trim(),
          acknowledgedRisk: true,
        }),
      });
      const processed = result.processed?.length || 0;
      const skipped = result.skipped?.length || 0;
      const failed = result.failed?.length || 0;
      await load();
      alert(`Auto Accept Late selesai: ${processed} approved, ${skipped} dilewati, ${failed} gagal.${failed ? " Buka recovery per baris untuk item yang perlu tindakan manual." : ""}`, failed === 0);
    } catch (error) {
      alert(error.message);
      if (button) { button.disabled = false; button.textContent = `Accept Late Semua · ${targets.length}`; }
    }
  }
  async function load() {
    if (!key) return;
    try {
      state.doc = await api(`/modules/api/planning-ppic/material-requirements-planning/${encodeURIComponent(key)}`);
      renderHeader(); renderKpis(); renderTable(); alert("");
      // Opening the monthly table is read-only; preview creation remains an explicit option here.
      if (!cfg.monthlyMode) await ensureAutomaticMPlusOnePreview();
    } catch (error) { $("mrps-loading").textContent = error.message; alert(error.message); }
  }

  async function ensureAutomaticMPlusOnePreview() {
    const doc = state.doc;
    const preview = doc?.mPlusOnePreview;
    const previewSourceRun = preview?.scenarioAssumptions?.sourceOfficialRunNumber;
    const previewIsFresh = Boolean(preview && (
      previewSourceRun === doc?.runNumber
      || (!previewSourceRun && validDate(preview.runDate) && validDate(doc?.runDate) && new Date(preview.runDate) >= new Date(doc.runDate))
    ));
    if (state.autoLookaheadAttempted
      || !doc?.mPlusOneOption?.available
      || previewIsFresh
      || doc.status !== "Completed"
      || doc.isCurrentPlan === false) return;
    state.autoLookaheadAttempted = true;
    const cycleNumbers = doc.scenarioAssumptions?.planningCycleMpsNumbers
      || doc.scenarioAssumptions?.sourceMpsNumbers
      || [doc.mpsNumber].filter(Boolean);
    alert("Memuat kebutuhan M+1 sebagai preview look-ahead…");
    try {
      await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({
        mpsNumber: doc.mpsNumber,
        mpsNumbers: cycleNumbers,
        planningMode: "M_PLUS_ONE_PREVIEW",
        includeMPlusTwoBuffer: false,
        scenarioKey: `AUTO_M_PLUS_ONE_${Date.now()}`,
        scenarioName: "Preview Demand M+1 (Auto)",
        scenarioAssumptions: {
          planningMode: "M_PLUS_ONE_PREVIEW",
          includeMPlusTwoBuffer: false,
          autoGenerated: true,
          sourceOfficialRunNumber: doc.runNumber,
        },
      }) });
      state.doc = await api(`/modules/api/planning-ppic/material-requirements-planning/${encodeURIComponent(key)}`);
      renderHeader(); renderKpis(); renderTable();
      alert("Kebutuhan M+1 ditampilkan sebagai preview abu-abu dan tidak masuk Total official.", true);
    } catch (error) {
      alert(`Preview M+1 belum dapat dimuat otomatis: ${error.message}`);
    }
  }

  document.addEventListener("click", (event) => {
    const view = event.target.closest("[data-mrps-view]"); if (view) return void switchView(view.dataset.mrpsView);
    const materialGroup = event.target.closest("[data-mrps-material-group]");
    if (materialGroup) {
      const groupKey = materialGroup.dataset.mrpsMaterialGroup;
      if (expandedMaterials.has(groupKey)) expandedMaterials.delete(groupKey); else expandedMaterials.add(groupKey);
      renderTable();
      [...document.querySelectorAll("[data-mrps-material-group]")].find((button) => button.dataset.mrpsMaterialGroup === groupKey)?.focus({ preventScroll: true });
      return;
    }
    const group = event.target.closest("[data-mrps-group]"); if (group) { const groupKey = group.dataset.mrpsGroup; if (state.expandedGroups.has(groupKey)) state.expandedGroups.delete(groupKey); else state.expandedGroups.add(groupKey); return renderTable(); }
    const detail = event.target.closest("[data-mrps-detail]"); if (detail) return openDrawer(detail.dataset.mrpsDetail);
    const weekCell = event.target.closest("[data-mrps-week-cell]"); if (weekCell) return openWeeklyBucket(weekCell.dataset.mrpsWeekCell);
    const stock = event.target.closest("[data-mrps-stock]"); if (stock) return openStockPopup(stock.dataset.mrpsStock);
    const matrixDetail = event.target.closest("[data-mrps-matrix-detail]"); if (matrixDetail) return openMatrixDetail(matrixDetail.dataset.mrpsMatrixDetail);
    const recovery = event.target.closest("[data-mrps-recovery]"); if (recovery) return void openRecovery(recovery.dataset.mrpsRecovery);
    if (event.target.closest("[data-mrps-mplus]")) return openMPlusOne();
    if (event.target.closest("[data-mrps-rerun]")) return void rerunOfficial();
    if (event.target.closest("[data-mrps-approve]")) return void approveMrp();
    if (event.target.closest("[data-mrps-auto-accept-late]")) return void autoAcceptLate();
    const action = event.target.closest("[data-mrps-action]"); if (action) return openModal(action.dataset.mrpsAction);
    if (event.target.closest("[data-close-mrps-drawer]")) return closeDrawer();
    if (event.target.closest("[data-close-mrps-modal]")) return closeModal();
    if (event.target.closest("[data-close-mrps-mplus]")) return closeMPlusOne();
    if (event.target.closest("[data-close-mrps-recovery]")) return closeRecovery();
    if (event.target.closest("[data-close-mrps-stock]")) return closeStockPopup();
  });
  $("mrps-recovery-phase").addEventListener("change", async (event) => { if (!state.recovery) return; state.recovery.targetId = event.target.value; state.recovery.context = null; await loadRecoveryTarget(state.recovery.targetId); });
  $("mrps-recovery-action").addEventListener("change", (event) => {
    const context = state.recovery?.context; if (!context) return;
    const item = (context.recommendation?.actions || []).find((action) => action.id === event.target.value);
    if (item?.ownerRole) $("mrps-recovery-owner").value = item.ownerRole;
    if (item?.targetDate) $("mrps-recovery-date").value = dateKey(item.targetDate);
  });
  $("mrps-recovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const recovery = state.recovery; const context = recovery?.context;
    if (!recovery || !context || !$("mrps-recovery-ack").checked) return;
    const selectedId = $("mrps-recovery-action").value;
    const reason = $("mrps-recovery-reason").value.trim();
    const targetDate = $("mrps-recovery-date").value;
    const owner = $("mrps-recovery-owner").value.trim();
    const evidenceReference = $("mrps-recovery-evidence").value.trim();
    if (reason.length < 10) return alert("Alasan recovery minimal 10 karakter.");
    if (!targetDate || !owner) return alert("PIC dan tanggal recovery wajib diisi.");
    if (selectedId === "ACCEPT_LATE" && targetDate <= dateKey(context.target?.targetDeliveryDate)) return alert("Accept Late wajib memakai tanggal komitmen baru setelah due date semula.");
    const button = $("mrps-recovery-submit"); const original = button.textContent; button.disabled = true; button.textContent = "Memproses…";
    try {
      if (context.plan?.status === "PENDING_APPROVAL") {
        await api(`/modules/api/planning-ppic/demand-planning/recovery-plans/${encodeURIComponent(context.plan.id)}/approve`, { method: "PATCH", body: JSON.stringify({ reason, acknowledgedRisk: true }) });
        closeRecovery(); alert("Recovery berhasil di-approve. Status matrix telah diperbarui.", true); await load(); return;
      }
      const checklist = (context.recommendation?.actions || []).map((item) => ({
        id: item.id,
        selected: Boolean(item.required || item.id === selectedId),
        owner: item.id === selectedId ? owner : item.ownerRole || owner,
        targetDate: item.id === selectedId ? targetDate : item.targetDate || targetDate,
        notes: item.id === selectedId ? reason : "Checklist feasibility otomatis dari MRP weekly recovery.",
        evidenceReference: item.id === selectedId ? evidenceReference : "MRP weekly recovery",
      }));
      const plan = await api(`/modules/api/planning-ppic/demand-planning/${encodeURIComponent(recovery.targetId)}/recovery-plan`, { method: "PUT", body: JSON.stringify({ checklist, notes: reason }) });
      await api(`/modules/api/planning-ppic/demand-planning/recovery-plans/${encodeURIComponent(plan.id)}/submit`, { method: "POST", body: "{}" });
      closeRecovery(); alert("Recovery tersimpan dan diajukan untuk approval.", true); await load();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = original; }
  });
  $("mrps-search").addEventListener("input", (event) => { state.query = String(event.target.value || "").trim().toLowerCase(); state.page = 1; renderTable(); });
  $("mrps-filter").addEventListener("change", (event) => { state.filter = event.target.value; state.page = 1; renderTable(); });
  $("mrps-material-categories").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mrps-category]");
    if (!button) return;
    selectedMaterialCategory = button.dataset.mrpsCategory;
    state.page = 1;
    renderTable();
    $("mrps-material-categories").querySelector(`[data-mrps-category="${selectedMaterialCategory}"]`)?.focus();
  });
  $("mrps-page-size").addEventListener("change", (event) => { state.pageSize = number(event.target.value) || 25; state.page = 1; renderTable(); });
  $("mrps-grouping").value = state.requirementGrouping;
  $("mrps-grouping").addEventListener("change", (event) => { state.requirementGrouping = event.target.value === "FLAT" ? "FLAT" : "GROUPED"; localStorage.setItem("mrps-requirement-grouping", state.requirementGrouping); renderTable(); });
  $("mrps-mplus-display").value = state.mPlusOneDisplayMode;
  $("mrps-mplus-display").addEventListener("change", (event) => { state.mPlusOneDisplayMode = event.target.value === "FULL_EFD" ? "FULL_EFD" : "NET_CURRENT_STOCK"; localStorage.setItem("mrps-mplus-display-mode", state.mPlusOneDisplayMode); state.page = 1; renderTable(); });
  $("mrps-show-covered").checked = state.showCovered;
  $("mrps-show-covered").addEventListener("change", (event) => { state.showCovered = event.target.checked; localStorage.setItem("mrps-show-covered", state.showCovered ? "1" : "0"); state.page = 1; renderKpis(); renderTable(); });
  $("mrps-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderTable(); } });
  $("mrps-next").addEventListener("click", () => { state.page += 1; renderTable(); });
  $("mrps-modal-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!$("mrps-modal-confirm").checked || !state.action) return;
    const action = state.action; const button = $("mrps-modal-submit"); const original = button.textContent; button.disabled = true; button.textContent = "Memproses…";
    try {
      if (action === "suggestion") {
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/purchase-suggestions`, { method: "POST", body: "{}" });
        closeModal(); alert(`Purchase Suggestion <a href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(result.suggestionNumber)}">${esc(result.suggestionNumber)}</a> berhasil dibuat.`, true, true); await load();
      } else {
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/production-plan`, { method: "POST", body: "{}" });
        const plans = (result.items || []).map((item) => item.planNumber).filter(Boolean);
        closeModal(); alert(plans.length ? `Monthly Planning ${plans.map((plan) => `<a href="/modules/planning-ppic/monthly-production-plans?planNumber=${encodeURIComponent(plan)}">${esc(plan)}</a>`).join(", ")} berhasil disiapkan.` : (result.message || "Monthly Planning berhasil disiapkan."), true, true);
      }
    } catch (error) { alert(error.message); } finally { button.disabled = false; button.textContent = original; }
  });
  $("mrps-mplus-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!$("mrps-mplus-confirm").checked || !state.doc?.mPlusOneOption?.available) return;
    const includeMPlusTwoBuffer = document.querySelector('input[name="mrps-mplus-mode"]:checked')?.value === "WITH_M2_BUFFER";
    const cycleNumbers = state.doc?.scenarioAssumptions?.planningCycleMpsNumbers || state.doc?.scenarioAssumptions?.sourceMpsNumbers || [state.doc?.mpsNumber].filter(Boolean);
    const button = $("mrps-mplus-submit"); button.disabled = true; button.textContent = "Menjalankan simulasi…";
    try {
      const generated = await api("/modules/api/planning-ppic/mrp/generate-number");
      const scenarioKey = `M_PLUS_ONE_${Date.now()}`;
      const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({
        runNumber: generated.runNumber,
        mpsNumber: state.doc.mpsNumber,
        mpsNumbers: cycleNumbers,
        planningMode: "M_PLUS_ONE_PREVIEW",
        includeMPlusTwoBuffer,
        scenarioKey,
        scenarioName: includeMPlusTwoBuffer ? "Preview M+1 + Buffer M+2" : "Preview Demand M+1",
        scenarioAssumptions: { planningMode: "M_PLUS_ONE_PREVIEW", includeMPlusTwoBuffer },
      }) });
      location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`;
    } catch (error) {
      alert(error.message); button.disabled = false; button.textContent = "Jalankan Simulasi";
    }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeDrawer(); closeModal(); closeMPlusOne(); closeRecovery(); closeStockPopup(); } });
  async function openMonthlyTable() {
    const month = cfg.initialMonth;
    const picker = $("mrps-run");
    const go = (nextMonth, run = "") => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
      location.assign(`/modules/planning-ppic/mrp?month=${encodeURIComponent(nextMonth)}${run ? `&run=${encodeURIComponent(run)}` : ""}`);
    };
    $("mrps-month").addEventListener("change", (event) => go(event.target.value));
    picker.addEventListener("change", (event) => go(month, event.target.value));
    const empty = (message, failed = false) => {
      document.querySelector(".mrps-kpis").hidden = true;
      document.querySelector(".mrps-workbench").hidden = true;
      $("mrps-search").disabled = true;
      $("mrps-filter").disabled = true;
      $("mrps-title").textContent = `MRP · ${month}`;
      $("mrps-status").textContent = failed ? "Gagal dimuat" : "Belum ada run";
      $("mrps-meta").textContent = message;
      $("mrps-actions").innerHTML = `<a class="btn btn-outline-primary" href="/modules/planning-ppic/mps/workbench?month=${encodeURIComponent(month)}">Buka Rolling MPS</a>`;
      if (failed) alert(message);
    };
    try {
      const data = await api(`/modules/api/planning-ppic/execution-cockpit?month=${encodeURIComponent(month)}`);
      const rows = window.PpicMrpMonthlyModel.availableRuns(data.mrpRuns || []);
      picker.innerHTML = rows.length ? rows.map((row) => `<option value="${esc(row.runNumber)}">${esc(row.runNumber)} · ${esc(row.presentationStatus || row.status)}${row.executionScope === "LINKED_SOURCE" ? " · sumber lintas bulan" : ""}</option>`).join("") : '<option value="">Belum ada MRP</option>';
      picker.disabled = !rows.length;
      const selected = window.PpicMrpMonthlyModel.selectRun(rows, cfg.selectedRun);
      if (!selected) {
        if (cfg.selectedRun) { picker.value = ""; empty("Run yang dipilih tidak tersedia pada periode ini. Pilih run yang tersedia atau buka Daftar Run.", true); }
        else empty(`Belum ada MRP untuk ${month}. Pilih periode lain atau hitung MRP dari Rolling MPS.`);
        return;
      }
      key = selected.runNumber;
      picker.value = key;
      const documentLink = $("mrps-run-document");
      documentLink.href = `/modules/planning-ppic/mrp/${encodeURIComponent(key)}`;
      documentLink.hidden = false;
      await load();
    } catch (error) {
      picker.innerHTML = '<option value="">Run gagal dimuat</option>';
      empty(error.message, true);
    }
  }
  if (cfg.monthlyMode) openMonthlyTable(); else load();
})();
