(function expose(root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  root.PpicDailyPlanModel = model;
}(typeof globalThis !== "undefined" ? globalThis : window, function buildModel() {
  function toMinute(value) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function toTime(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  }

  function normalizedRange(startTime, endTime) {
    const start = toMinute(startTime);
    let end = toMinute(endTime);
    if (start == null || end == null) return null;
    if (end <= start) end += 1440;
    return { start, end };
  }

  function buildHourTicks(startTime, endTime, stepMinutes = 60) {
    const range = normalizedRange(startTime, endTime);
    if (!range || stepMinutes <= 0) return [];
    const ticks = [];
    for (let minute = range.start; minute <= range.end; minute += stepMinutes) ticks.push(toTime(minute));
    if (ticks[ticks.length - 1] !== toTime(range.end)) ticks.push(toTime(range.end));
    return ticks;
  }

  function blockPlacement(item, window) {
    const view = normalizedRange(window.startTime, window.endTime);
    const block = normalizedRange(item.plannedStartTime, item.plannedEndTime);
    if (!view || !block) return { leftPercent: 0, widthPercent: 0 };
    let start = block.start;
    let end = block.end;
    if (view.end > 1440 && start < view.start) { start += 1440; end += 1440; }
    const left = Math.max(view.start, start);
    const right = Math.min(view.end, end);
    const duration = view.end - view.start;
    return {
      leftPercent: Number((((left - view.start) / duration) * 100).toFixed(4)),
      widthPercent: Number(((Math.max(0, right - left) / duration) * 100).toFixed(4)),
    };
  }

  function timelineWindow(items = [], options = {}) {
    const configuredStart = toMinute(options.dayStart || "07:00");
    const configuredEnd = toMinute(options.dayEnd || "23:00");
    const ranges = items.map((item) => normalizedRange(item.plannedStartTime, item.plannedEndTime)).filter(Boolean);
    const earliest = ranges.length ? Math.min(...ranges.map((range) => range.start)) : configuredStart;
    const latest = ranges.length ? Math.max(...ranges.map((range) => range.end)) : configuredEnd;
    const start = Math.min(configuredStart, Math.floor(earliest / 60) * 60);
    const end = Math.max(configuredEnd, Math.ceil(latest / 60) * 60, start + 8 * 60);
    return {
      startTime: toTime(start),
      endTime: toTime(end),
      hourCount: Math.max(1, Math.ceil((end - start) / 60)),
      startsAfterFirstShift: ranges.length > 0 && earliest >= toMinute(options.lateStartThreshold || "15:00"),
    };
  }

  function monthlyEditorUrl({ date, planNumber } = {}) {
    const key = String(date || "").slice(0, 10);
    const params = new URLSearchParams({ month: key.slice(0, 7) });
    if (planNumber) params.set("planNumber", planNumber);
    if (key) params.set("date", key);
    params.set("editor", "1");
    return `/modules/planning-ppic/monthly-production-plans?${params.toString()}`;
  }

  function groupByMachine(items = []) {
    const groups = new Map();
    items.forEach((item) => {
      const key = item.machineId || `unassigned:${item.lineCode || "-"}`;
      if (!groups.has(key)) groups.set(key, {
        machineId: item.machineId || null,
        machineCode: item.machineCode || "UNASSIGNED",
        machineName: item.machineName || "Mesin belum dipilih",
        lineCode: item.lineCode || "-",
        items: [],
      });
      groups.get(key).items.push(item);
    });
    return [...groups.values()]
      .sort((a, b) => a.machineCode.localeCompare(b.machineCode))
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => {
          const aMinute = toMinute(a.plannedStartTime);
          const bMinute = toMinute(b.plannedStartTime);
          const aOperationalMinute = aMinute == null ? Number.MAX_SAFE_INTEGER : aMinute < 7 * 60 ? aMinute + 1440 : aMinute;
          const bOperationalMinute = bMinute == null ? Number.MAX_SAFE_INTEGER : bMinute < 7 * 60 ? bMinute + 1440 : bMinute;
          return aOperationalMinute - bOperationalMinute || Number(a.sequence || 0) - Number(b.sequence || 0);
        }),
      }));
  }

  function matrixHourWindow(value = "07-23") {
    const [rawStart, rawEnd] = String(value).split("-").map(Number);
    const start = Number.isFinite(rawStart) ? rawStart * 60 : 7 * 60;
    let end = Number.isFinite(rawEnd) ? rawEnd * 60 : 23 * 60;
    if (end <= start) end += 1440;
    const hours = [];
    for (let minute = start; minute < end; minute += 60) hours.push({ minute, label: String(Math.floor((minute % 1440) / 60)).padStart(2, "0") });
    return { start, end, hours };
  }

  function formatOperationalTime(value, dayStart = "07:00") {
    const minute = toMinute(value);
    const start = toMinute(dayStart);
    if (minute == null) return "-";
    const explicitDayOffset = Math.floor(minute / 1440);
    const inferredDayOffset = explicitDayOffset === 0 && start != null && minute < start ? 1 : explicitDayOffset;
    return `${toTime(minute)}${inferredDayOffset > 0 ? ` +${inferredDayOffset}` : ""}`;
  }

  function formatOperationalRange(item = {}, dayStart = "07:00") {
    if (!item.plannedStartTime || !item.plannedEndTime) return "WAKTU BELUM DIATUR";
    return `${formatOperationalTime(item.plannedStartTime, dayStart)}–${formatOperationalTime(item.plannedEndTime, dayStart)}`;
  }

  function scheduleHourRange(item = {}, windowStart = 7 * 60, windowEnd = 23 * 60) {
    let start = toMinute(item.plannedStartTime);
    let end = toMinute(item.plannedEndTime);
    if (start == null || end == null) return null;
    if (windowEnd > 1440 && start < windowStart) start += 1440;
    if (end <= start) end += 1440;
    return { start, end };
  }

  function scheduleHourState(item, hourMinute, windowStart, windowEnd) {
    const range = scheduleHourRange(item, windowStart, windowEnd);
    if (!range) return "empty";
    const bucketEnd = hourMinute + 60;
    if (range.start >= hourMinute && range.start < bucketEnd) return "start";
    if (range.start < bucketEnd && range.end > hourMinute) return "occupied";
    return "empty";
  }

  function shortageQty(planQty, actualQty) {
    const plan = Number(planQty || 0);
    if (plan <= 0) return null;
    return Math.max(0, plan - Number(actualQty || 0));
  }

  function shiftScheduleTime(item = {}, targetMinute) {
    const start = toMinute(item.plannedStartTime);
    let end = toMinute(item.plannedEndTime);
    const target = Number(targetMinute);
    if (start == null || end == null || !Number.isFinite(target)) return null;
    if (end <= start) end += 1440;
    const duration = Math.max(1, end - start);
    return { plannedStartTime: toTime(target), plannedEndTime: toTime(target + duration), durationMinutes: duration };
  }

  function workspaceMode({ date, today, status }) {
    const next = new Date(`${today}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    if (date === today) return { scope: "TODAY", label: `TODAY · ${String(status || "Draft").toUpperCase()}`, readOnly: status === "Released" };
    if (date === tomorrow) return { scope: "TOMORROW", label: `TOMORROW · ${status === "Draft" ? "DRAFT REVIEW" : String(status || "Planned").toUpperCase()}`, readOnly: false };
    return { scope: "PLANNED", label: `PLANNED · ${String(status || "Draft").toUpperCase()}`, readOnly: status === "Released" };
  }

  const canEditRevision = (status) => ["Draft", "Ready", "Partially Released"].includes(String(status || "Draft"));
  const apiPath = (path) => `/modules/api/${String(path || "").replace(/^\/+/, "")}`;
  const requestHeaders = (token = "") => ({ Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

  return { toMinute, toTime, formatOperationalTime, formatOperationalRange, buildHourTicks, blockPlacement, timelineWindow, monthlyEditorUrl, groupByMachine, matrixHourWindow, scheduleHourRange, scheduleHourState, shortageQty, shiftScheduleTime, workspaceMode, canEditRevision, apiPath, requestHeaders };
}));
