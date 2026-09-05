(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ScheduleBoardModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const dateKey = (value) => value ? String(value).slice(0, 10) : "";

  function timingStatus(plannedAt, actualAt) {
    const plan = dateKey(plannedAt);
    const actual = dateKey(actualAt);
    if (!actual) return "PLANNED";
    if (actual < plan) return "ADVANCE";
    if (actual > plan) return "LATE";
    return "ON TIME";
  }

  function expandOutgoingEvents(rows = []) {
    return rows.flatMap((row) => {
      const planDate = dateKey(row.eventAt);
      const actualDate = dateKey(row.actualAt);
      const planQty = number(row.qty);
      const actualQty = number(row.completedQty);
      const status = timingStatus(planDate, actualDate);
      const planned = { ...row, displayAt: planDate, planQty, actualQty: actualDate === planDate ? actualQty : 0, balanceQty: actualDate === planDate ? Math.max(planQty - actualQty, 0) : planQty, timingStatus: status };
      if (!actualDate || actualDate === planDate || actualQty <= 0) return [planned];
      return [planned, { ...row, displayAt: actualDate, planQty: 0, actualQty, balanceQty: 0, timingStatus: status }];
    });
  }

  function summarizeOutgoingCell(events = []) {
    if (!events.length) return { plan: 0, actual: 0, balance: 0, status: "" };
    const statuses = events.map((row) => row.timingStatus);
    const status = statuses.includes("LATE") ? "LATE" : statuses.includes("ADVANCE") ? "ADVANCE" : statuses.includes("ON TIME") ? "ON TIME" : "PLANNED";
    return {
      plan: events.reduce((sum, row) => sum + number(row.planQty), 0),
      actual: events.reduce((sum, row) => sum + number(row.actualQty), 0),
      balance: events.reduce((sum, row) => sum + number(row.balanceQty), 0),
      status,
    };
  }

  function strongestStatus(statuses = []) {
    return statuses.includes("LATE") ? "LATE" : statuses.includes("ADVANCE") ? "ADVANCE" : statuses.includes("ON TIME") ? "ON TIME" : "PLANNED";
  }

  function expandIncomingEvents(plans = [], actuals = []) {
    const used = new Set();
    const planEvents = [];
    const actualEvents = [];
    plans.forEach((plan) => {
      const matches = actuals.map((row, index) => ({ row, index })).filter(({ row }) => row.matchKey === plan.matchKey);
      matches.forEach(({ index }) => used.add(index));
      const statuses = matches.map(({ row }) => timingStatus(plan.eventAt, row.actualAt));
      const status = strongestStatus(statuses);
      const sameDateActual = matches.filter(({ row }) => dateKey(row.actualAt) === dateKey(plan.eventAt)).reduce((sum, { row }) => sum + number(row.completedQty), 0);
      planEvents.push({ ...plan, displayAt: dateKey(plan.eventAt), planQty: number(plan.qty), actualQty: sameDateActual, balanceQty: Math.max(number(plan.qty) - sameDateActual, 0), timingStatus: status });
      matches.filter(({ row }) => dateKey(row.actualAt) !== dateKey(plan.eventAt)).forEach(({ row }) => actualEvents.push({ ...plan, ...row, itemType: plan.itemType, itemCode: plan.itemCode, itemName: plan.itemName, partnerCode: plan.partnerCode, partnerName: plan.partnerName, displayAt: dateKey(row.actualAt), planQty: 0, actualQty: number(row.completedQty), balanceQty: 0, timingStatus: timingStatus(plan.eventAt, row.actualAt) }));
    });
    actuals.forEach((row, index) => {
      if (used.has(index)) return;
      actualEvents.push({ ...row, displayAt: dateKey(row.actualAt), planQty: 0, actualQty: number(row.completedQty), balanceQty: 0, timingStatus: timingStatus(row.eventAt, row.actualAt) });
    });
    return [...planEvents, ...actualEvents];
  }

  return { timingStatus, expandOutgoingEvents, expandIncomingEvents, summarizeOutgoingCell };
}));
