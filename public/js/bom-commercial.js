(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BomCommercial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const normalized = (value) => String(value || "").trim().toLowerCase();
  const isVendor = (process) => String(process?.routingMode || "INHOUSE").toUpperCase() === "VENDOR";

  function create({ getState = () => ({}), getDate } = {}) {
    const state = () => getState() || {};
    const list = (key) => Array.isArray(state()[key]) ? state()[key] : [];
    const resolveMaster = (records, id, embedded) => id === null || id === "" ? {}
      : (id !== undefined && records.find((item) => item.id === id))
        || (embedded && (id === undefined || !embedded.id || embedded.id === id) ? embedded : {}) || {};
    const partFor = (row) => resolveMaster(list("parts"), row?.partId, row?.part);
    const materialFor = (part) => resolveMaster(list("materials"), part.materialId, part.material);
    const processMaster = (process) => resolveMaster(state().processMaster || state().processes || [], process?.processId, process?.process);

    function costingDate() {
      const value = getDate ? getDate() : state().record?.effectiveDate;
      const fallback = () => typeof globalThis.erpBusinessNow === "function" ? globalThis.erpBusinessNow() : new Date();
      const date = value ? new Date(value) : new Date(fallback());
      return Number.isNaN(date.getTime()) ? new Date(fallback()) : date;
    }

    function priceValue(record) {
      if (!record) return 0;
      const direct = Number(record.unitPrice);
      if (record.unitPrice != null && record.unitPrice !== "" && Number.isFinite(direct) && direct >= 0) return direct;
      for (let index = costingDate().getMonth(); index >= 0; index -= 1) {
        if (numeric(record[MONTHS[index]]) > 0) return numeric(record[MONTHS[index]]);
      }
      return 0;
    }

    function latest(records) {
      const at = costingDate();
      const active = records.filter((row) => row.isActive !== false && row.isDeleted !== true);
      const temporal = active.filter((row) => row.effectiveFrom && new Date(row.effectiveFrom) <= at
        && (!row.effectiveUntil || new Date(row.effectiveUntil) >= at))
        .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      if (temporal.length) return temporal[0];
      return active.filter((row) => !row.effectiveFrom && numeric(row.pricingYear) <= at.getFullYear())
        .sort((a, b) => numeric(b.pricingYear) - numeric(a.pricingYear) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        .find((row) => priceValue(row) > 0 || (row.details || []).some((detail) => priceValue(detail) > 0));
    }

    function toIdr(value, currencyCode) {
      if (!value) return 0;
      if (!currencyCode || currencyCode === "IDR") return numeric(value);
      const currency = list("currencies").find((item) => item.currencyCode === currencyCode);
      return numeric(value) * numeric(currency?.exchangeRate || 1);
    }

    function selectedMaterialForm(row) {
      const formId = row.materialScheme === "ALTERNATIVE" ? row.alternateMaterialFormId : row.materialFormId;
      return list("materialForms").find((form) => form.id === formId) || null;
    }

    function isRawMaterial(row) {
      const part = partFor(row);
      return part.itemType === "RAW" && part.rawType === "MATERIAL";
    }

    function isCustomerSupplied(row) {
      return row.category === "Purchase" && isRawMaterial(row) && row.materialSupplyType === "CUSTOMER_SUPPLIED";
    }

    function purchasePackageCode(form) {
      if (!form) return "";
      if (form.defaultPurchaseUomCode) return String(form.defaultPurchaseUomCode).toUpperCase();
      const value = String(form.formCode || form.symbol || "").trim().toUpperCase();
      return ({ C: "COIL", S: "SHEET", P: "PCS", PIECES: "PCS" })[value] || value;
    }

    function directPrice(row) {
      if (isCustomerSupplied(row)) return { value: 0, found: true, kind: "material", source: null, customerSupplied: true };
      const part = partFor(row);
      const supplierId = row.supplierId || part.supplierId || null;
      const partPrice = latest(list("partPrices").filter((item) => item.partId === (row.partId || part.id)
        && (!supplierId || item.supplierId === supplierId)));
      const partValue = priceValue(partPrice);
      if (partValue > 0) return { value: toIdr(partValue, partPrice.currencyCode), found: true, kind: "purchase", source: partPrice };

      const material = materialFor(part);
      const formSymbol = selectedMaterialForm(row)?.symbol || null;
      const hasMaterialMaster = Boolean(part.materialId || material.materialGradeId || material.materialSubstanceId);
      const materialCandidates = hasMaterialMaster ? list("materialPrices").filter((item) => {
        if (supplierId && item.supplierId !== supplierId) return false;
        if (item.materialId) return item.materialId === part.materialId;
        return item.materialGradeId === material.materialGradeId && item.materialSubstanceId === material.materialSubstanceId
          && numeric(item.thickness) === numeric(material.thickness) && (!item.CSP || item.CSP === formSymbol);
      }).sort((a, b) => Number(Boolean(b.materialId)) - Number(Boolean(a.materialId))) : [];
      const materialPrice = latest(materialCandidates);
      const materialValue = priceValue(materialPrice);
      if (materialValue > 0) return { value: toIdr(materialValue, materialPrice.currencyCode), found: true, kind: "material", source: materialPrice };
      return { value: 0, found: false, kind: hasMaterialMaster ? "material" : "purchase", source: null };
    }

    function purchaseInfo(row) {
      const part = partFor(row);
      if (row.category !== "Purchase" && part.itemType !== "RAW") return null;
      const material = materialFor(part);
      const price = directPrice(row);
      const bomQty = Math.max(0, numeric(row.qty));
      const weightQty = price.kind === "material" && numeric(row.grossWeight) > 0;
      const form = selectedMaterialForm(row);
      return {
        ...price,
        customerSupplied: Boolean(price.customerSupplied),
        priceQty: weightQty ? bomQty * numeric(row.grossWeight) : bomQty,
        qtyUnit: weightQty ? "kg" : row.uomCode || "unit",
        sourceSlug: price.kind === "material" ? "material-price-lists" : "part-price-lists",
        prefill: price.kind === "material" ? {
          materialId: part.materialId || "", materialSubstanceId: material.materialSubstanceId || "", materialGradeId: material.materialGradeId || "",
          supplierId: row.supplierId || part.supplierId || "", thickness: material.thickness ?? "", CSP: form?.symbol || material.CSP || "",
          purchasePackageUomCode: purchasePackageCode(form) || material.defaultPurchaseUomCode || material.materialForm || "",
          uomCode: material.defaultPurchaseUomCode || (weightQty ? "KG" : row.uomCode || ""),
        } : { partId: row.partId || part.id || "", supplierId: row.supplierId || part.supplierId || "", uomCode: part.purchaseUomCode || row.uomCode || "" },
      };
    }

    function representativeMachine(process) {
      const machines = list("machines");
      const code = process.machineSpecificationCode || process.machine?.machineSpecificationCode;
      return machines.find((item) => item.id === process.machinePlanningPolicy?.primaryMachineId)
        || (code && machines.find((item) => item.machineSpecificationCode === code && item.status === "Active"))
        || (code && machines.find((item) => item.machineSpecificationCode === code))
        || machines.find((item) => item.id === process.machineId) || process.machine || {};
    }

    function machineRate(process) {
      const machine = representativeMachine(process);
      const rate = latest(list("machineCostRates").filter((item) => item.machineId === machine.id));
      return { value: toIdr(numeric(rate?.unitPrice ?? machine.costingRate), rate?.currencyCode || machine.currencyCode),
        type: String(rate?.costingRateType || machine.costingRateType || "PER_HOUR").toUpperCase() };
    }

    function machineRateDisplay(process) {
      const rate = machineRate(process);
      return { value: rate.value, unit: ({ PER_SECOND: "/ detik", PER_MINUTE: "/ menit", PER_HOUR: "/ jam", PER_CYCLE: "/ cycle" })[rate.type] || "/ jam", found: rate.value > 0 };
    }

    function machineCostPerSecond(process) {
      if (isVendor(process)) return { value: 0, found: false };
      const rate = machineRate(process);
      if (!(rate.value > 0)) return { value: 0, found: false };
      const seconds = numeric(process.cycleTime);
      if (rate.type === "PER_CYCLE") return { value: seconds > 0 ? rate.value / seconds : 0, found: seconds > 0 };
      const divisor = rate.type === "PER_SECOND" ? 1 : rate.type === "PER_MINUTE" ? 60 : 3600;
      return { value: rate.value / divisor, found: true };
    }

    function vendorProcessMatches(detail, process) {
      const master = processMaster(process);
      const vendorProcess = detail?.vendorProcess || list("vendorProcesses").find((item) => item.id === detail?.vendorProcessId) || {};
      const code = normalized(vendorProcess.vendorProcessCode);
      const processCode = normalized(master.processCode);
      if (code && processCode) return code === processCode;
      const name = normalized(vendorProcess.vendorProcessName);
      return Boolean(name && normalized(master.processName) && name === normalized(master.processName));
    }

    function vendorProcessPrice(process, row) {
      const missing = { value: 0, found: false, kind: "vendor-process", source: null, detail: null };
      if (!isVendor(process) || !process.vendorId) return missing;
      const eligible = list("vendorPrices").filter((item) => item.vendorId === process.vendorId
        && (!item.partId || item.partId === row?.partId) && (item.details || []).some((detail) => vendorProcessMatches(detail, process)));
      const exact = latest(eligible.filter((item) => item.partId && item.partId === row?.partId)) || latest(eligible);
      const detail = (exact?.details || []).find((item) => vendorProcessMatches(item, process)) || null;
      const value = priceValue(detail);
      return { value: toIdr(value, exact?.currencyCode), found: value > 0, kind: "vendor-process", source: exact || null, detail };
    }

    function vendorProcessMaster(process) {
      const code = normalized(processMaster(process).processCode);
      return code ? list("vendorProcesses").find((item) => normalized(item.vendorProcessCode) === code && item.isDeleted !== true) || null : null;
    }

    function eligibleVendors(process, row) {
      const master = vendorProcessMaster(process);
      const allowed = new Set(master?.vendorIds || (master?.vendors || []).map((vendor) => vendor.id));
      return list("vendors").filter((vendor) => allowed.has(vendor.id) && vendor.isDeleted !== true && vendor.status !== "Inactive")
        .map((vendor) => ({ vendor, rate: vendorProcessPrice({ ...process, vendorId: vendor.id }, row) }))
        .sort((left, right) => Number(right.rate.found) - Number(left.rate.found) || String(left.vendor.vendorCode || "").localeCompare(String(right.vendor.vendorCode || "")));
    }

    function autoSelectEligibleVendor(process, row) {
      if (!isVendor(process)) return null;
      const candidates = eligibleVendors(process, row);
      if (process.vendorId && candidates.some(({ vendor }) => vendor.id === process.vendorId)) return candidates.find(({ vendor }) => vendor.id === process.vendorId).vendor;
      const selected = candidates.length === 1 ? candidates[0].vendor : null;
      process.vendorId = selected?.id || null;
      process.vendor = selected;
      return selected;
    }

    function processCost(process, row) {
      if (isVendor(process)) return vendorProcessPrice(process, row);
      const seconds = numeric(process.cycleTime);
      const perSecond = machineCostPerSecond(process);
      return seconds > 0 && perSecond.found ? { value: perSecond.value * seconds, found: true } : { value: 0, found: false };
    }

    function processEstimate(row) {
      return (row.processes || row.mbomProcesses || []).filter((process) => process.isDeleted !== true).reduce((result, process) => {
        const cost = processCost(process, row);
        result.value += cost.value;
        if (isVendor(process)) result.vendor += cost.value;
        else result.seconds += numeric(process.cycleTime);
        result.perSecond += machineCostPerSecond(process).value;
        result.lines += 1;
        if (cost.found) result.covered += 1;
        return result;
      }, { value: 0, vendor: 0, perSecond: 0, seconds: 0, lines: 0, covered: 0 });
    }

    // Preserve explicit nulls when a canvas node or draft round-trips a detail.
    function detailFields(row = {}) {
      const existing = (key, fallback) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined ? row[key] : fallback;
      return { supplierId: existing("supplierId", partFor(row).supplierId || null), materialSupplyType: existing("materialSupplyType", "SUPPLIER_PURCHASE"),
        supplyCustomerId: existing("supplyCustomerId", null), vendorId: existing("vendorId", null) };
    }

    return { purchaseInfo, representativeMachine, machineRateDisplay, machineCostPerSecond, processCost, vendorProcessMaster,
      eligibleVendors, autoSelectEligibleVendor, processEstimate, detailFields, isRawMaterial, isCustomerSupplied };
  }

  return { create };
});
