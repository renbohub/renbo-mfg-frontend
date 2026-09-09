(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MppRecommendation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const matrixEditor = typeof module === "object" && module.exports
    ? require("./ppic-monthly-capacity-editor") : globalThis.MppCapacityEditor;

  const copy = (value) => JSON.parse(JSON.stringify(value));
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );

  function unwrapScenario(payload) {
    return payload?.data && typeof payload.data === "object" ? payload.data : payload;
  }

  function normalizeScenario(payload) {
    const scenario = unwrapScenario(payload);
    if (!scenario || typeof scenario !== "object") return null;
    return {
      ...copy(scenario),
      items: [...(scenario.items || [])]
        .map((item) => copy(item))
        .sort(
          (left, right) =>
            number(left.sequence) - number(right.sequence) ||
            String(left.id || "").localeCompare(String(right.id || "")),
        ),
    };
  }

  function selectable(item) {
    return Boolean(item?.changeType) && String(item.applyStatus || "PENDING") === "PENDING";
  }

  function selectRecommendationItems(scenario, selection = { mode: "ALL" }) {
    const items = (scenario?.items || []).filter(selectable);
    if (selection.mode === "ALL") return items;
    if (selection.mode === "EXISTING_TASKS") {
      return items.filter((item) => Boolean(item.sourceAllocationId));
    }
    if (selection.mode === "WORK_CENTER") {
      const workCenterIds = new Set(selection.workCenterIds || []);
      return items.filter((item) => workCenterIds.has(item.workCenterId));
    }
    if (selection.mode === "ITEMS") {
      const itemIds = new Set(selection.itemIds || []);
      return items.filter((item) => itemIds.has(item.id));
    }
    return [];
  }

  function getScenarioSummary(scenario) {
    const summary = scenario?.summary || {};
    const fallbackRemainingQty = Math.max(
      number(summary.materialQueueQty),
      number(summary.carryOverQty),
    );
    const remainingAllocationQty = Object.prototype.hasOwnProperty.call(
      summary,
      "remainingAllocationQty",
    )
      ? number(summary.remainingAllocationQty)
      : fallbackRemainingQty;
    const fgUncoveredCount = Object.prototype.hasOwnProperty.call(
      summary,
      "fgUncoveredCount",
    )
      ? number(summary.fgUncoveredCount)
      : remainingAllocationQty > 0
        ? 1
        : number(summary.fgLateCount);
    const fgCoverageReady = Object.prototype.hasOwnProperty.call(
      summary,
      "fgCoverageReady",
    )
      ? Boolean(summary.fgCoverageReady)
      : fgUncoveredCount === 0 && remainingAllocationQty <= 0.000001;
    return {
      fgOnTimeCount: number(summary.fgOnTimeCount),
      fgLateCount: number(summary.fgLateCount),
      newAllocationCount: number(summary.newAllocationCount),
      movedOrSplitCount: number(summary.movedOrSplitCount),
      overloadCellCount: number(summary.overloadCellCount),
      materialQueueQty: number(summary.materialQueueQty),
      carryOverQty: number(summary.carryOverQty),
      selectableCount: (scenario?.items || []).filter(selectable).length,
      fgCoverageReady,
      fgUncoveredCount,
      remainingAllocationQty,
    };
  }

  function getAutoAllocationOptions(scenario) {
    const summary = getScenarioSummary(scenario);
    return ["ALL", "EXISTING_TASKS"].map((mode) => {
      const selected = selectRecommendationItems(scenario, { mode });
      const selectedIds = new Set(selected.map((item) => item.id));
      const excludedNewQty = (scenario?.items || [])
        .filter(
          (item) =>
            selectable(item) &&
            item.changeType === "ALLOCATE_REMAINING" &&
            !selectedIds.has(item.id),
        )
        .reduce((sum, item) => sum + number(item.proposedValue?.qty), 0);
      const projectedRemainingQty = Math.max(
        summary.remainingAllocationQty + excludedNewQty,
        0,
      );
      const fgCovered = summary.fgCoverageReady && excludedNewQty <= 0.000001;
      return {
        mode,
        existingTaskCount: selected.filter((item) => item.sourceAllocationId).length,
        newTaskCount: selected.filter((item) => !item.sourceAllocationId).length,
        projectedRemainingQty,
        fgCovered,
        ready: fgCovered && projectedRemainingQty <= 0.000001,
      };
    });
  }

  function makeDay() {
    return {
      qty: 0,
      minutes: 0,
      availableMinutes: 0,
      loadMinutes: 0,
      loadPercent: 0,
      uomCodes: [],
      planNumbers: [],
      fgRequiredDates: [],
      allocations: [],
      machines: [],
      itemCount: 0,
      blocker: null,
    };
  }

  function findAllocationCell(rows, allocationId) {
    for (const row of rows || []) {
      for (const child of row.children || []) {
        for (const [date, day] of Object.entries(child.days || {})) {
          const allocation = (day.allocations || []).find(
            (entry) => entry.allocationId === allocationId,
          );
          if (allocation) return { row, child, date, day, allocation };
        }
      }
    }
    return null;
  }

  function adjustDay(day, qtyDelta, minutesDelta) {
    if (!day) return;
    day.qty = Math.max(number(day.qty) + qtyDelta, 0);
    day.minutes = Math.max(number(day.minutes) + minutesDelta, 0);
    day.loadMinutes = Math.max(number(day.loadMinutes) + minutesDelta, 0);
  }

  function removeFromOrigin(source, movedQty) {
    const sourceQty = number(source.allocation.qty);
    const ratio = sourceQty > 0 ? Math.min(movedQty / sourceQty, 1) : 0;
    const minutesDelta = -number(source.allocation.minutes ?? source.day.minutes) * ratio;
    adjustDay(source.day, -movedQty, minutesDelta);
    adjustDay(source.row.days?.[source.date], -movedQty, minutesDelta);
    source.day.recommendationMoved = true;
    if (source.row.days?.[source.date]) {
      source.row.days[source.date].recommendationMoved = true;
    }
    const remainingAllocationQty = Math.max(number(source.allocation.qty) - movedQty, 0);
    if (remainingAllocationQty > 0) {
      source.allocation.qty = remainingAllocationQty;
      source.allocation.minutes = Math.max(number(source.allocation.minutes ?? (-minutesDelta / ratio)) + minutesDelta, 0);
    }
    else {
      source.day.allocations = (source.day.allocations || []).filter(
        (entry) => entry !== source.allocation,
      );
    }
    source.child.monthlyProductionQty = Math.max(
      number(source.child.monthlyProductionQty) - movedQty,
      0,
    );
  }

  function addToTarget(rows, item, movedQty) {
    const value = item.proposedValue || {};
    const { row, child } = matrixEditor.resolveMatrixTarget(rows, value, item.partCode, item.processCode) || {};
    if (!row || !child || !value.targetDate) return false;
    const targetDay = (child.days[value.targetDate] ||= makeDay());
    const parentDay = (row.days[value.targetDate] ||= makeDay());
    const proposalQty = Math.max(number(value.qty), movedQty);
    const minutes = proposalQty > 0
      ? number(value.minutes ?? value.batchDurationMinutes) * Math.min(movedQty / proposalQty, 1)
      : 0;
    adjustDay(targetDay, movedQty, minutes);
    adjustDay(parentDay, movedQty, minutes);
    const recommendationAllocation = {
      allocationId: item.sourceAllocationId || `recommendation:${item.id}`,
      sourceAllocationId: item.sourceAllocationId || null,
      recommendationItemId: item.id,
      qty: movedQty,
      minutes,
      machineId: value.targetMachineId || null,
      vendorId: value.vendorId || null,
      scheduleDate: value.targetDate,
      partCode: item.partCode || null,
      processCode: item.processCode || null,
      editable: false,
      recommended: true,
    };
    targetDay.allocations ||= [];
    targetDay.allocations.push(recommendationAllocation);
    targetDay.recommendationItemIds ||= [];
    if (!targetDay.recommendationItemIds.includes(item.id)) {
      targetDay.recommendationItemIds.push(item.id);
    }
    parentDay.recommendationItemIds ||= [];
    if (!parentDay.recommendationItemIds.includes(item.id)) {
      parentDay.recommendationItemIds.push(item.id);
    }
    targetDay.recommended = true;
    parentDay.recommended = true;
    if (value.overload) {
      targetDay.recommendationOverload = true;
      parentDay.recommendationOverload = true;
    }
    child.monthlyProductionQty = number(child.monthlyProductionQty) + movedQty;
    return true;
  }

  function applyProposalToRows(rows, item) {
    if (!selectable(item)) return;
    const value = item.proposedValue || {};
    let movedQty = Math.max(number(value.qty), 0);
    if (movedQty <= 0) return;
    // Resolve the destination before touching the origin, including previously idle machines.
    if (!value.targetDate || !matrixEditor.resolveMatrixTarget(rows, value, item.partCode, item.processCode)) return;
    if (
      item.sourceAllocationId &&
      ["MOVE_ALLOCATION", "SPLIT_ALLOCATION"].includes(item.changeType)
    ) {
      const source = findAllocationCell(rows, item.sourceAllocationId);
      if (!source) return;
      movedQty = Math.min(movedQty, Math.max(number(source.allocation.qty), 0));
      if (movedQty <= 0) return;
      removeFromOrigin(source, movedQty);
    }
    addToTarget(rows, item, movedQty);
  }

  function projectRecommendationRows(rows, scenario) {
    const projected = copy(rows || []);
    for (const item of scenario?.items || []) applyProposalToRows(projected, item);
    return matrixEditor.refreshProjectedTotals(projected);
  }

  function renderScenarioBadge(scenario) {
    const status = String(scenario?.status || "").toUpperCase();
    if (status === "READY_WITH_OVERLOAD") return "READY · OVERLOAD";
    if (status === "MATERIAL_QUEUE") return "READY · MATERIAL QUEUE";
    if (status === "PARTIALLY_APPLIED") return "PARTIAL · EDITOR DRAFT";
    if (status === "APPLIED") return "APPLIED · EDITOR DRAFT";
    return status.replaceAll("_", " ") || "BELUM DIHITUNG";
  }

  function renderScenarioSource(scenario) {
    const source = String(scenario?.generationSource || "").toUpperCase();
    if (source === "OR_TOOLS_CP_SAT") {
      const solver = scenario?.aiValidationSummary?.solver || {};
      return `OR-TOOLS WASM CP-SAT · ${String(solver.status || "SOLVED").replaceAll("_", " ")}`;
    }
    if (source === "RULE_BASED_FALLBACK") return "RULE-BASED FALLBACK";
    if (["AI", "AI_CORRECTED"].includes(source)) {
      const model = String(scenario?.modelProfileCode || "OFFLINE MODEL").replace(/[_-]?CPU$/i, "").replaceAll("_", "-");
      return `${source === "AI_CORRECTED" ? "AI CORRECTED" : "AI RECOMMENDATION"} · ${model} · OFFLINE`;
    }
    return "RULE-BASED";
  }

  function formatDate(value) {
    if (!value) return "Belum diketahui";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`));
  }

  function formatQty(value) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(
      number(value),
    );
  }

  function renderMaterialQueue(items = []) {
    const queue = (items || []).filter((item) =>
      ["MATERIAL_QUEUE", "CARRY_OVER"].includes(item.itemType),
    );
    if (!queue.length) {
      return '<div class="mpp-material-queue-empty">Tidak ada material queue pada scenario ini.</div>';
    }
    return queue
      .map((item) => {
        const value = item.proposedValue || {};
        const uomCode = value.uomCode || item.uomCode || "PCS";
        return `<article class="mpp-material-queue-item"><div><b>${escapeHtml(item.partCode || "Part")}</b><small>${escapeHtml(item.processCode || "Proses belum ditentukan")}</small></div><span><small>Input</small><b>${escapeHtml(value.inputPartCode || "-")}</b></span><span><small>Qty queue</small><b>${escapeHtml(formatQty(value.qty))} ${escapeHtml(uomCode)}</b></span><span><small>Tersedia paling awal</small><b>${escapeHtml(formatDate(value.earliestAvailableDate))}</b></span></article>`;
      })
      .join("");
  }

  return {
    applyProposalToRows,
    findAllocationCell,
    getAutoAllocationOptions,
    getScenarioSummary,
    normalizeScenario,
    projectRecommendationRows,
    renderMaterialQueue,
    renderScenarioBadge,
    renderScenarioSource,
    selectRecommendationItems,
  };
});
