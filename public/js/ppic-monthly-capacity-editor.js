(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MppCapacityEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function createEditorState(initial) {
    const snapshot = copy(initial || {});
    return { ...snapshot, snapshot, mode: "READONLY", sessionId: null, changes: [], dirty: false };
  }

  function reduceEditorState(state, action) {
    switch (action.type) {
      case "START": return { ...state, mode: "EDIT", sessionId: action.sessionId, dirty: false };
      case "QUEUE": return { ...state, queue: [...(state.queue || []), copy(action.item)], changes: [...state.changes, action], dirty: true };
      case "STAGE": return { ...state, changes: [...state.changes, copy(action.change)], dirty: true };
      case "UNDO": return { ...state, changes: state.changes.slice(0, -1), dirty: state.changes.length > 1 };
      case "COMMITTED": return createEditorState(action.data || state);
      case "CANCEL": return createEditorState(state.snapshot);
      default: return state;
    }
  }

  function getQueueSummary(state) {
    const queue = state.queue || [];
    const today = state.currentDate || new Date().toISOString().slice(0, 10);
    return {
      lines: queue.length,
      qty: queue.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      urgent: queue.filter((item) => item.latestFinishDate && item.latestFinishDate <= today).length,
    };
  }

  function getUnallocatedNotice(summary = {}) {
    const count = Number(summary.unallocatedCount || 0);
    if (count <= 0) return null;
    const quantity = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(summary.unallocatedQty || 0));
    const crossMonthCount = Math.min(Math.max(Number(summary.crossMonthCount || 0), 0), count);
    const currentMonthCount = count - crossMonthCount;
    const crossMonthCopy = crossMonthCount
      ? ` ${crossMonthCount} operasi harus dimulai di bulan sebelumnya dan tetap terlihat di ringkasan lintas bulan.`
      : "";
    return {
      count,
      message: `${count} operasi · ${quantity} qty belum menjadi allocation tersimpan (${currentMonthCount} bulan ini).${crossMonthCopy} Jalankan Auto Allocation atau atur melalui Mode Editor.`,
    };
  }

  function formatMaterialWarnings(warnings = []) {
    const rows = (warnings || []).filter((warning) => String(warning?.severity || "").toUpperCase() === "WARNING"
      || String(warning?.code || "").toUpperCase().includes("WARNING"));
    if (!rows.length) return "";
    const format = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value) || 0);
    return `Material Warning — ${rows.map((warning) => {
      const target = [warning.targetPartCode, warning.processCode, warning.targetDate].filter(Boolean).join(" · ") || "Allocation";
      const unit = String(warning.uomCode || "PCS").toUpperCase();
      return `${target}: kebutuhan ${format(warning.requestedQty)} ${unit}, tersedia ${format(warning.inputAvailableQty)} ${unit}, shortage ${format(warning.shortageQty)} ${unit}`;
    }).join("; ")}. Planning tetap tersimpan; stok aktual divalidasi sebelum material issue/produksi.`;
  }

  function replaceStagedChange(changes = [], stagedChangeId, replacement = {}) {
    return (changes || []).map((change) => change._changeId === stagedChangeId
      ? { ...copy(replacement), _changeId: stagedChangeId }
      : change);
  }

  function hydrateStagedChanges(rows = []) {
    return (rows || []).map((row) => ({
      ...copy(row.afterValue || row),
      _changeId: row.id || row._changeId || null,
    }));
  }

  function validateVendorDates(vendorSendDate, vendorReturnDate) {
    const send = String(vendorSendDate || "").slice(0, 10);
    const returned = String(vendorReturnDate || "").slice(0, 10);
    if (!send || !returned || returned >= send) return true;
    throw new Error(`Tanggal kembali vendor tidak boleh sebelum tanggal kirim. Tanggal kirim/allocation ${send}; tanggal kembali ${returned}.`);
  }

  function getAuthoritativeCapacity(summary = {}, capacity = {}) {
    const availableMinutes = Number(capacity.availableMinutes || 0);
    const loadMinutes = Math.max(Number(capacity.loadMinutes || 0) - Number(summary.unallocatedMinutes || 0), 0);
    const utilizationPercent = availableMinutes > 0 ? Math.round((loadMinutes / availableMinutes * 100) * 10) / 10 : (loadMinutes > 0 ? 999 : 0);
    return {
      loadMinutes,
      availableMinutes,
      utilizationPercent,
      overloadedCells: Number(summary.overloadedCells || 0),
    };
  }

  function getChildPlanningSummary(child = {}) {
    const planning = child.planning;
    if (!planning || planning.totalRequirementQty == null) return { available: false };
    const format = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value) || 0);
    const uomCode = String(planning.uomCode || "PCS").toUpperCase();
    const stockSources = Array.isArray(planning.stockCoverageSources) ? planning.stockCoverageSources : [];
    const warehouseSources = stockSources.filter((source) => source.kind === "CURRENT");
    const wipSources = stockSources.filter((source) => ["WIP", "FG"].includes(source.kind));
    const warehouseStockQty = Number(planning.currentStockQty || 0);
    const wipStockQty = Number(planning.wipCoverageQty || 0) + Number(planning.fgCoverageQty || 0);
    const requirementQty = Number(planning.totalRequirementQty || 0);
    const productionQty = Number(child.monthlyProductionQty || 0);
    return {
      available: true,
      warehouseStock: format(warehouseStockQty),
      wipStock: format(wipStockQty),
      requirement: format(requirementQty),
      production: format(productionQty),
      remaining: format(Math.max(requirementQty - warehouseStockQty - wipStockQty - productionQty, 0)),
      uomCode,
      warehouseStockBreakdown: warehouseSources.length
        ? warehouseSources.map((source) => `${source.partCode} ${format(source.equivalentQty)}`).join(" + ")
        : `${child.partCode || "Stock part"} ${format(warehouseStockQty)}`,
      wipStockBreakdown: wipSources.length
        ? wipSources.map((source) => `${source.partCode} ${format(source.equivalentQty)}`).join(" + ")
        : `Belum ada coverage WIP / FG`,
      requirementBreakdown: `EFD ${format(planning.efdQty)} + Buffer ${format(planning.bufferQty)} + M-1 ${format(planning.shortageM1Qty)}`,
    };
  }

  function getRemainingCandidates(candidates = [], row = {}, child = {}) {
    const rowMode = row.type === "OUTSOURCE" ? "VENDOR" : "INHOUSE";
    const processCodes = new Set((child.processCodes || []).map((value) => String(value || "").toUpperCase()));
    return (candidates || []).filter((candidate) =>
      Number(candidate.remainingQty || 0) > 0
      && candidate.partCode === child.partCode
      && String(candidate.routingMode || "INHOUSE").toUpperCase() === rowMode
      && (!processCodes.size || processCodes.has(String(candidate.processCode || "").toUpperCase())));
  }

  function temporalInputAvailable(candidate = {}, targetDate = null) {
    const opening = Math.max(Number(candidate.inputAvailableQty || 0), 0);
    if (!targetDate) return opening;
    if ((candidate.inputStockGroups || []).length && (candidate.inputStockSources || []).length) {
      const rows = calculatePreviousStockRows([candidate], targetDate);
      const availableByGroup = new Map();
      for (const row of rows) {
        const outputQty = Number(row._qtyPerParent || 0) > 0 ? Number(row.availableAtTargetQty || 0) / Number(row._qtyPerParent) : 0;
        availableByGroup.set(row._inputGroupKey, (availableByGroup.get(row._inputGroupKey) || 0) + outputQty);
      }
      return availableByGroup.size ? Math.max(Math.min(...availableByGroup.values()), 0) : opening;
    }
    return Math.max((candidate.inputAvailabilityEvents || []).reduce((balance, event) => {
      if (!event?.date || String(event.date).slice(0, 10) > String(targetDate).slice(0, 10)) return balance;
      const quantity = Math.max(Number(event.qty || 0), 0);
      return balance + (String(event.type).toUpperCase() === "SUPPLY" ? quantity : -quantity);
    }, opening), 0);
  }

  function getRemainingAllocationLimit(candidates = [], options = {}) {
    const demandRemainingQty = (candidates || []).reduce((sum, candidate) => sum + Number(candidate.remainingQty || 0), 0);
    const inputLimits = (candidates || [])
      .filter((candidate) => candidate.inputAvailableQty !== null && candidate.inputAvailableQty !== undefined)
      .map((candidate) => temporalInputAvailable(candidate, options.targetDate));
    const inputAvailableQty = inputLimits.length ? Math.max(...inputLimits) : demandRemainingQty;
    return {
      maxQty: Math.max(demandRemainingQty, 0),
      demandRemainingQty,
      inputAvailableQty,
    };
  }

  function calculatePreviousStockRows(candidates = [], targetDateValue = null) {
    const targetDate = String(targetDateValue || "").slice(0, 10);
    const sources = new Map();
    const events = new Map();
    for (const candidate of candidates || []) {
      for (const source of candidate.inputStockSources || []) {
        if (!source?.partCode) continue;
        const sourceKey = `${source.inputGroupKey || source.requiredPartCode || source.partCode}|${source.partCode}`;
        const current = sources.get(sourceKey);
        if (!current || Number(source.availableQty || 0) > Number(current.availableQty || 0)) sources.set(sourceKey, source);
      }
      for (const event of candidate.inputAvailabilityEvents || []) {
        if (!event?.date) continue;
        const normalized = {
          type: String(event.type || "").toUpperCase(),
          date: String(event.date).slice(0, 10),
          qty: Math.max(Number(event.qty || 0), 0),
          partCode: event.partCode || null,
          sourceId: event.sourceId || null,
        };
        const identity = normalized.sourceId
          ? `${normalized.type}|${normalized.sourceId}`
          : `${normalized.type}|${normalized.partCode || "*"}|${normalized.date}|${normalized.qty}`;
        if (!events.has(identity)) events.set(identity, normalized);
      }
    }
    const states = [...sources.values()].map((source, index) => ({
      source,
      index,
      groupKey: source.inputGroupKey || source.requiredPartCode || source.partCode,
      ratio: Math.max(Number(source.qtyPerParent || 1), 0.000001),
      balanceQty: Math.max(Number(source.availableQty || 0), 0),
      scheduledSupplyQty: 0,
      allocatedBeforeTargetQty: 0,
    }));
    const groupStates = new Map();
    for (const state of states) {
      const group = groupStates.get(state.groupKey) || [];
      group.push(state);
      groupStates.set(state.groupKey, group);
    }
    for (const group of groupStates.values()) group.sort((left, right) => {
      const roleOrder = { DIRECT_INPUT: 0, PREVIOUS_WIP: 1 };
      return (roleOrder[left.source.sourceRole] ?? 2) - (roleOrder[right.source.sourceRole] ?? 2) || left.index - right.index;
    });
    const orderedEvents = [...events.values()]
      .filter((event) => !targetDate || event.date <= targetDate)
      .sort((left, right) => left.date.localeCompare(right.date)
        || Number(right.type === "SUPPLY") - Number(left.type === "SUPPLY"));
    for (const event of orderedEvents) {
      if (event.type === "SUPPLY") {
        for (const state of states.filter((item) => !event.partCode || item.source.partCode === event.partCode)) {
          const suppliedQty = event.qty * state.ratio;
          state.balanceQty += suppliedQty;
          state.scheduledSupplyQty += suppliedQty;
        }
        continue;
      }
      if (event.type !== "CONSUMPTION") continue;
      for (const group of groupStates.values()) {
        let outputRemaining = event.qty;
        for (const state of group) {
          if (outputRemaining <= 0.000001) break;
          const availableOutputQty = state.balanceQty / state.ratio;
          const consumedOutputQty = Math.min(availableOutputQty, outputRemaining);
          const consumedSourceQty = consumedOutputQty * state.ratio;
          state.balanceQty = Math.max(state.balanceQty - consumedSourceQty, 0);
          if (!targetDate || event.date <= targetDate) state.allocatedBeforeTargetQty += consumedSourceQty;
          outputRemaining -= consumedOutputQty;
        }
      }
    }
    return states.map((state) => {
      const { source } = state;
      const availableQty = Math.max(Number(source.availableQty || 0), 0);
      return {
        partNumber: source.partNumber || null,
        partCode: source.partCode,
        partName: source.partName || null,
        itemType: source.itemType || null,
        sourceRole: source.sourceRole || "DIRECT_INPUT",
        stockWhQty: Math.max(Number(source.stockWhQty ?? (availableQty + Number(source.stockReservedQty || 0))), 0),
        stockReservedQty: Math.max(Number(source.stockReservedQty || 0), 0),
        allocatedBeforeTargetQty: state.allocatedBeforeTargetQty,
        scheduledSupplyQty: state.scheduledSupplyQty,
        availableAtTargetQty: Math.max(state.balanceQty, 0),
        uomCode: source.uomCode || "PCS",
        _inputGroupKey: state.groupKey,
        _qtyPerParent: state.ratio,
        _order: state.index,
      };
    }).sort((left, right) => left._order - right._order);
  }

  function getPreviousStockRows(candidates = [], options = {}) {
    return calculatePreviousStockRows(candidates, options.targetDate).map(({ _inputGroupKey, _qtyPerParent, _order, ...row }) => row);
  }

  function isSameAllocationRow(clipboard = {}, rowKey = null, childKey = null) {
    return Boolean(clipboard.rowKey && clipboard.childKey
      && clipboard.rowKey === rowKey
      && clipboard.childKey === childKey);
  }

  function evaluateTargetAvailability(candidate = {}, requestedQty = 0, options = {}) {
    const quantity = Math.max(Number(requestedQty || 0), 0);
    const targetDate = String(options.targetDate || "").slice(0, 10);
    const ignoredSourceIds = new Set((options.ignoreSourceIds || []).filter(Boolean).map(String));
    const prepared = {
      ...copy(candidate),
      inputAvailabilityEvents: (candidate.inputAvailabilityEvents || [])
        .filter((event) => !ignoredSourceIds.has(String(event?.sourceId || ""))),
    };
    const internalRows = calculatePreviousStockRows([prepared], targetDate);
    const availableByGroup = new Map();
    for (const row of internalRows) {
      const outputQty = Number(row._qtyPerParent || 0) > 0
        ? Number(row.availableAtTargetQty || 0) / Number(row._qtyPerParent)
        : 0;
      availableByGroup.set(row._inputGroupKey, (availableByGroup.get(row._inputGroupKey) || 0) + outputQty);
    }
    const known = availableByGroup.size > 0 || candidate.inputAvailableQty != null;
    const availableQty = availableByGroup.size
      ? Math.max(Math.min(...availableByGroup.values()), 0)
      : Math.max(Number(candidate.inputAvailableQty || 0), 0);
    return {
      known,
      sufficient: known && quantity <= availableQty + 0.000001,
      requestedQty: quantity,
      availableQty,
      targetDate,
      rows: internalRows.map(({ _inputGroupKey, _qtyPerParent, _order, ...row }) => row),
    };
  }

  function shiftDateBySourceDuration(sourceDateValue, endDateValue, targetDateValue) {
    const sourceDate = String(sourceDateValue || "").slice(0, 10);
    const endDate = String(endDateValue || "").slice(0, 10);
    const targetDate = String(targetDateValue || "").slice(0, 10);
    if (!sourceDate || !endDate || !targetDate) return endDate || targetDate || null;
    const duration = Math.max(Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000), 0);
    const shifted = new Date(`${targetDate}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + duration);
    return shifted.toISOString().slice(0, 10);
  }

  function buildCutPasteChange(clipboard = {}, targetDateValue = null) {
    const allocation = clipboard.allocation || {};
    const targetDate = String(targetDateValue || "").slice(0, 10);
    const vendor = String(allocation.routingMode || clipboard.routingMode || "").toUpperCase() === "VENDOR";
    const reason = `Cut & Paste manual ${clipboard.sourceDate || allocation.scheduleDate || "-"} ke ${targetDate}`;
    if (allocation.stagedChangeId && allocation.draftChange) {
      const draft = copy(allocation.draftChange);
      return {
        ...draft,
        replaceChangeId: allocation.stagedChangeId,
        targetDate,
        vendorReturnDate: vendor
          ? shiftDateBySourceDuration(allocation.vendorSendDate || allocation.scheduleDate || clipboard.sourceDate, allocation.vendorReturnDate, targetDate)
          : draft.vendorReturnDate || null,
        reason,
      };
    }
    return {
      type: vendor ? "VENDOR_BATCH" : "MOVE_ALLOCATION",
      allocationId: allocation.allocationId,
      qty: Number(allocation.qty || clipboard.qty || 0),
      targetDate,
      targetMachineId: allocation.machineId || null,
      vendorSendDate: vendor ? targetDate : null,
      vendorReturnDate: vendor
        ? shiftDateBySourceDuration(allocation.vendorSendDate || allocation.scheduleDate || clipboard.sourceDate, allocation.vendorReturnDate, targetDate)
        : null,
      routingMode: vendor ? "VENDOR" : allocation.routingMode || undefined,
      partCode: allocation.partCode || clipboard.partCode || null,
      processCode: allocation.processCode || clipboard.processCode || null,
      targetRowKey: clipboard.rowKey || null,
      targetChildKey: clipboard.childKey || null,
      force: false,
      reason,
    };
  }

  function distributeRemainingQty(candidates = [], requestedQty = 0, options = {}) {
    let remaining = Number(requestedQty || 0);
    const limit = getRemainingAllocationLimit(candidates, options);
    if (remaining <= 0 || remaining > limit.maxQty + 0.000001) throw new Error(`Qty tidak boleh melebihi maksimum ${limit.maxQty}.`);
    const ordered = [...candidates].sort((left, right) => String(left.requiredDate || left.fgRequiredDate || "9999-12-31").localeCompare(String(right.requiredDate || right.fgRequiredDate || "9999-12-31"))
      || Number(left.lineNumber || 0) - Number(right.lineNumber || 0));
    const result = [];
    for (const candidate of ordered) {
      if (remaining <= 0.000001) break;
      const qty = Math.min(Number(candidate.remainingQty || 0), remaining);
      if (qty > 0) result.push({ lineNumber: Number(candidate.lineNumber), qty });
      remaining -= qty;
    }
    return result;
  }

  function projectStagedMatrix(rows = [], changes = []) {
    const projected = copy(rows || []);
    for (const [changeIndex, change] of (changes || []).entries()) {
      if (["MOVE_ALLOCATION", "SPLIT_ALLOCATION"].includes(change.type) && change.allocationId && change.targetDate && Number(change.qty || 0) > 0) {
        let source = null;
        for (const row of projected) {
          for (const child of row.children || []) {
            for (const [date, day] of Object.entries(child.days || {})) {
              const allocation = (day.allocations || []).find((entry) => entry.allocationId === change.allocationId);
              if (allocation) source = { row, child, date, day, allocation };
              if (source) break;
            }
            if (source) break;
          }
          if (source) break;
        }
        if (!source) continue;
        const movedQty = Number(change.qty || 0);
        const allocationQty = Math.max(Number(source.allocation.qty || 0), Number(source.day.qty || 0), movedQty);
        const minuteRatio = allocationQty > 0 ? Math.min(movedQty / allocationQty, 1) : 0;
        const movedMinutes = Number(source.day.minutes || 0) * minuteRatio;
        source.day.qty = Math.max(Number(source.day.qty || 0) - movedQty, 0);
        source.day.minutes = Math.max(Number(source.day.minutes || 0) - movedMinutes, 0);
        const sourceParentDay = source.row.days?.[source.date];
        if (sourceParentDay) {
          sourceParentDay.qty = Math.max(Number(sourceParentDay.qty || 0) - movedQty, 0);
          sourceParentDay.minutes = Math.max(Number(sourceParentDay.minutes || 0) - movedMinutes, 0);
        }
        if (Number(source.allocation.qty || 0) > movedQty) source.allocation.qty = Number(source.allocation.qty) - movedQty;
        else source.day.allocations = (source.day.allocations || []).filter((entry) => entry !== source.allocation);

        const targetRow = projected.find((row) => row.key === change.targetRowKey) || source.row;
        const targetChild = targetRow?.children?.find((child) => child.key === change.targetChildKey)
          || targetRow?.children?.find((child) => child.partCode === (change.partCode || source.child.partCode)
            && (!(child.processCodes || []).length || !change.processCode || (child.processCodes || []).some((code) => String(code).toUpperCase() === String(change.processCode).toUpperCase())))
          || source.child;
        if (!targetRow || !targetChild) continue;
        const makeDay = () => ({ qty: 0, minutes: 0, availableMinutes: 0, loadMinutes: 0, loadPercent: 0, uomCodes: [], planNumbers: [], fgRequiredDates: [], allocations: [], machines: [], itemCount: 0, blocker: null });
        const childDay = targetChild.days[change.targetDate] ||= makeDay();
        const parentDay = targetRow.days[change.targetDate] ||= makeDay();
        for (const day of [childDay, parentDay]) {
          day.qty = Number(day.qty || 0) + movedQty;
          day.minutes = Number(day.minutes || 0) + movedMinutes;
          day.staged = true;
        }
        childDay.allocations ||= [];
        childDay.allocations.push({
          ...copy(source.allocation),
          allocationId: `staged-${change._changeId || changeIndex}`,
          sourceAllocationId: change.allocationId,
          stagedChangeId: change._changeId || null,
          draftChange: copy(change),
          qty: movedQty,
          scheduleDate: change.targetDate,
          machineId: change.targetMachineId || source.allocation.machineId || null,
          vendorId: change.targetVendorId || change.vendorId || source.allocation.vendorId || null,
          editable: Boolean(change._changeId),
          staged: true,
        });
        continue;
      }
      if (change.type !== "ALLOCATE_REMAINING" || !change.targetDate || Number(change.qty || 0) <= 0) continue;
      const routingMode = String(change.routingMode || "INHOUSE").toUpperCase();
      const row = projected.find((candidate) => {
        if ((candidate.type === "OUTSOURCE") !== (routingMode === "VENDOR")) return false;
        return (candidate.children || []).some((child) => child.partCode === change.partCode
          && (!(child.processCodes || []).length || (child.processCodes || []).some((code) => String(code).toUpperCase() === String(change.processCode || "").toUpperCase())));
      });
      const child = row?.children?.find((candidate) => candidate.partCode === change.partCode
        && (!(candidate.processCodes || []).length || (candidate.processCodes || []).some((code) => String(code).toUpperCase() === String(change.processCode || "").toUpperCase())));
      if (!row || !child) continue;
      const makeDay = () => ({ qty: 0, minutes: 0, availableMinutes: 0, loadMinutes: 0, loadPercent: 0, uomCodes: [], planNumbers: [], fgRequiredDates: [], allocations: [], machines: [], itemCount: 0, blocker: null });
      const childDay = child.days[change.targetDate] ||= makeDay();
      const parentDay = row.days[change.targetDate] ||= makeDay();
      const quantity = Number(change.qty || 0);
      const uomCode = change.uomCode || "PCS";
      const previewAllocation = {
        allocationId: `staged-${change._changeId || changeIndex}`,
        stagedChangeId: change._changeId || null,
        draftChange: copy(change),
        planNumber: change.planNumber || null,
        lineNumber: change.lineNumber ?? null,
        mbomProcessId: change.mbomProcessId || null,
        routingMode,
        scheduleDate: change.targetDate,
        vendorReturnDate: change.vendorReturnDate || null,
        qty: quantity,
        uomCode,
        processCode: change.processCode || null,
        partCode: change.partCode || null,
        editable: Boolean(change._changeId),
        staged: true,
      };
      for (const day of [childDay, parentDay]) {
        day.qty = Number(day.qty || 0) + quantity;
        day.staged = true;
        day.allocations ||= [];
        day.allocations.push(previewAllocation);
        day.uomCodes ||= [];
        if (!day.uomCodes.includes(uomCode)) day.uomCodes.push(uomCode);
        day.planNumbers ||= [];
        if (change.planNumber && !day.planNumbers.includes(change.planNumber)) day.planNumbers.push(change.planNumber);
      }
      child.monthlyProductionQty = Number(child.monthlyProductionQty || 0) + quantity;
    }
    return projected;
  }

  return { createEditorState, reduceEditorState, getQueueSummary, getUnallocatedNotice, formatMaterialWarnings, hydrateStagedChanges, replaceStagedChange, validateVendorDates, getAuthoritativeCapacity, getChildPlanningSummary, getRemainingCandidates, getRemainingAllocationLimit, getPreviousStockRows, isSameAllocationRow, evaluateTargetAvailability, buildCutPasteChange, distributeRemainingQty, projectStagedMatrix };
});
