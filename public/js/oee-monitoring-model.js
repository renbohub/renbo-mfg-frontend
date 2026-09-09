(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OeeMonitoringModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EMPTY = "—";
  const TIME_ZONE = "Asia/Jakarta";
  const SHIFTS = ["1", "2"];
  const METRIC_NAMES = ["availability", "performance", "quality", "oee", "totalProduced", "goodOutput", "rejectOutput", "reworkOutput", "targetOutput", "plannedMinutes", "runtimeMinutes", "downtimeMinutes", "idealCycleTimeSeconds", "rejectRate", "achievementRate"];

  function finite(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function number(value, digits = 0) {
    const parsed = finite(value);
    if (parsed === null) return EMPTY;
    const precision = finite(digits);
    const places = precision === null ? 0 : Math.min(20, Math.max(0, Math.trunc(precision)));
    return new Intl.NumberFormat("id-ID", { minimumFractionDigits: places, maximumFractionDigits: places }).format(parsed);
  }

  function percent(value, digits = 1) {
    const formatted = number(value, digits);
    return formatted === EMPTY ? EMPTY : `${formatted}%`;
  }

  function duration(minutes) {
    const parsed = finite(minutes);
    if (parsed === null || parsed < 0) return EMPTY;
    if (parsed > 0 && parsed < 1) return parsed * 60 < 1 ? "<1 dtk" : `${Math.round(parsed * 60)} dtk`;
    const rounded = Math.round(parsed);
    const hours = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    return hours ? `${number(hours)}j${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
  }

  function clock(iso) {
    // Require an explicit zone so the displayed time never depends on the browser's locale.
    if (typeof iso !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(iso)) return EMPTY;
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return EMPTY;
    return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  }

  function selectMachines(machines, options = {}) {
    const query = String(options.query ?? "").trim().toLocaleLowerCase("id-ID");
    return (Array.isArray(machines) ? machines : []).filter(machine => {
      if (!machine || typeof machine !== "object") return false;
      if (options.filter === "recorded" && machine.status !== "recorded") return false;
      if (options.filter === "no-data" && machine.status !== "no_data") return false;
      const production = machine.production || {};
      const searchable = [machine.machineCode, machine.machineName, machine.name, machine.partCode, machine.partNumber, machine.partName, production.partCode, production.partNumber, production.partName, production.moNumber];
      return !query || searchable.filter(value => value != null).join(" ").toLocaleLowerCase("id-ID").includes(query);
    });
  }

  function pareto(history) {
    const groups = new Map();
    for (const event of Array.isArray(history) ? history : []) {
      if (!event || typeof event !== "object") continue;
      const minutes = finite(event.durationMinutes);
      if (minutes === null || minutes < 0) continue;
      const reason = String(event.reason || event.category || "Alasan belum dicatat").trim().replace(/\s+/g, " ") || "Alasan belum dicatat";
      const key = reason.toLocaleLowerCase("id-ID");
      const group = groups.get(key) || { reason, durationMinutes: 0, count: 0, share: 0 };
      group.durationMinutes += minutes;
      group.count += 1;
      groups.set(key, group);
    }
    const rows = [...groups.values()];
    const total = rows.reduce((sum, row) => sum + row.durationMinutes, 0);
    rows.sort((left, right) => right.durationMinutes - left.durationMinutes || left.reason.localeCompare(right.reason, "id-ID"));
    let cumulative = 0;
    return rows.map((row, index) => {
      cumulative += row.durationMinutes;
      return {
        ...row,
        share: total > 0 ? row.durationMinutes / total * 100 : 0,
        cumulativePercent: total > 0 ? (index === rows.length - 1 ? 100 : cumulative / total * 100) : null,
      };
    });
  }

  function validatedDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Tanggal contoh harus berformat YYYY-MM-DD.");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError("Tanggal contoh tidak valid.");
    return value;
  }

  function atMinute(date, minute) {
    return new Date(new Date(`${date}T00:00:00+07:00`).getTime() + minute * 60000).toISOString();
  }

  function ratio(numerator, denominator) {
    return denominator > 0 ? numerator / denominator * 100 : null;
  }

  function emptyMachine(index) {
    const machineCode = `P${index + 1}`;
    return {
      id: `sample-${machineCode.toLowerCase()}`, machineCode, machineName: `Press ${machineCode}`,
      machineType: "Stamping", lineCode: index < 3 ? "LINE 01" : "LINE 02", location: "Plant 01 · Stamping",
      masterStatus: "Active", status: "no_data", lastUpdatedAt: null, logCount: 0,
      metrics: Object.fromEntries(METRIC_NAMES.map(key => [key, null])),
      production: { moNumber: null, woNumber: null, partCode: null, partNumber: null, partName: null, operatorName: null, shift: null, startTime: null, endTime: null, logNumber: null, status: null },
      downtimeHistory: [], dataQuality: [],
    };
  }

  // These records are only returned after an explicit sample() call. They never replace API data.
  const SAMPLE_PRODUCTION = [
    { shift: "1", cycle: 1.2, produced: 21600, good: 21470, partCode: "BRK-0075", partNumber: "11054-0075", partName: "Bracket mounting LH", operator: "Acep", events: [
      [55, 12, "Dandori dies", "Setup"], [208, 8, "Material menunggu", "Material"], [355, 10, "Sensor feeder", "Machine"],
    ] },
    { shift: "1", cycle: 2, produced: 8040, good: 7930, partCode: "BRK-0195", partNumber: "MK019N5", partName: "Bracket reinforcement", operator: "Dedi", events: [
      [30, 48, "Dandori dies", "Setup"], [140, 42, "Material menunggu", "Material"], [280, 35, "Sensor feeder", "Machine"], [395, 20, "Dandori dies", "Setup"],
    ] },
    { shift: "1", plannedMinutes: 450, cycle: 3, produced: 6900, good: 6840, partCode: "PLT-0210", partNumber: "53271-0210", partName: "Plate support assembly", operator: "Rizal", events: [
      [85, 30, "Dandori dies", "Setup"], [220, 26, "Pengecekan dimensi", "Quality"], [375, 22, "Material menunggu", "Material"],
    ] },
    { shift: "2", cycle: 1.5, produced: 16500, good: 16390, partCode: "CLP-0418", partNumber: "90467-0418", partName: "Clip panel retainer", operator: "Agus", events: [
      [45, 20, "Dandori dies", "Setup"], [190, 16, "Sensor feeder", "Machine"], [320, 12, "Pelumasan tooling", "Maintenance"],
    ] },
  ];

  function sample(date, shift = "") {
    const selectedDate = validatedDate(date);
    const selectedShift = String(shift ?? "").trim();
    const machines = Array.from({ length: 6 }, (_, index) => {
      const machine = emptyMachine(index);
      const record = SAMPLE_PRODUCTION[index];
      if (!record || (selectedShift && selectedShift !== record.shift)) return machine;
      const startMinute = record.shift === "1" ? 420 : 900;
      const plannedMinutes = record.plannedMinutes || 480;
      const downtimeMinutes = record.events.reduce((sum, event) => sum + event[1], 0);
      const runtimeMinutes = plannedMinutes - downtimeMinutes;
      const availability = ratio(runtimeMinutes, plannedMinutes);
      const performance = ratio(record.cycle * record.produced, runtimeMinutes * 60);
      const quality = ratio(record.good, record.produced);
      const targetOutput = Math.floor(plannedMinutes * 60 / record.cycle);
      const production = {
        moNumber: `MO/${selectedDate.replace(/-/g, "")}/STP/${machine.machineCode}/001`,
        woNumber: `WO/${selectedDate.replace(/-/g, "")}/${machine.machineCode}/001`,
        partCode: record.partCode, partNumber: record.partNumber, partName: record.partName,
        operatorName: record.operator, shift: record.shift, startTime: atMinute(selectedDate, startMinute),
        endTime: atMinute(selectedDate, startMinute + plannedMinutes),
        logNumber: `PRD/${selectedDate.replace(/-/g, "")}/${machine.machineCode}/001`, status: "Completed",
      };
      return {
        ...machine, status: "recorded", logCount: 1, production, lastUpdatedAt: production.endTime,
        metrics: {
          availability, performance, quality, oee: availability * performance * quality / 10000,
          totalProduced: record.produced, goodOutput: record.good, rejectOutput: record.produced - record.good,
          reworkOutput: 0, targetOutput, plannedMinutes, runtimeMinutes, downtimeMinutes,
          idealCycleTimeSeconds: record.cycle, rejectRate: ratio(record.produced - record.good, record.produced),
          achievementRate: ratio(record.good, targetOutput),
        },
        downtimeHistory: record.events.map(([offset, minutes, reason, category], eventIndex) => ({
          id: `${machine.id}-dt-${eventIndex + 1}`, reason, category,
          startTime: atMinute(selectedDate, startMinute + offset), endTime: atMinute(selectedDate, startMinute + offset + minutes),
          durationMinutes: minutes, status: "Completed", shift: record.shift,
          operatorName: record.operator, moNumber: production.moNumber, logNumber: production.logNumber,
        })).sort((left, right) => right.startTime.localeCompare(left.startTime)),
      };
    });
    const recorded = machines.filter(machine => machine.status === "recorded");
    const sum = key => recorded.reduce((total, machine) => total + machine.metrics[key], 0);
    const totalProduced = sum("totalProduced");
    const runtimeMinutes = sum("runtimeMinutes");
    const plannedMinutes = sum("plannedMinutes");
    const idealSeconds = recorded.reduce((total, machine) => total + machine.metrics.idealCycleTimeSeconds * machine.metrics.totalProduced, 0);
    const availability = ratio(runtimeMinutes, plannedMinutes);
    const performance = ratio(idealSeconds, runtimeMinutes * 60);
    const quality = ratio(sum("goodOutput"), totalProduced);
    // Match the backend: each machine's OEE is weighted by its logged duration.
    // Multiplying fleet A/P/Q can distort contributions when ideal cycle times differ.
    const weightedOee = plannedMinutes > 0
      ? recorded.reduce((total, machine) => total + machine.metrics.oee * machine.metrics.plannedMinutes, 0) / plannedMinutes
      : null;
    return {
      generatedAt: new Date().toISOString(),
      period: { date: selectedDate, timeZone: TIME_ZONE, startAt: atMinute(selectedDate, 0), endAt: atMinute(selectedDate, 1440), shift: selectedShift },
      dataSource: "sample", isRealtime: false,
      summary: {
        machineCount: machines.length, machinesWithData: recorded.length,
        machinesWithOee: recorded.filter(machine => machine.metrics.oee !== null).length,
        totalProduced, goodOutput: sum("goodOutput"), rejectOutput: sum("rejectOutput"), targetOutput: sum("targetOutput"),
        plannedMinutes, runtimeMinutes, downtimeMinutes: sum("downtimeMinutes"), availability, performance, quality,
        oee: weightedOee, oeeBasis: "logged_duration_weighted_machine_oee",
      },
      machines, shifts: [...SHIFTS],
    };
  }

  return { number, percent, duration, clock, selectMachines, pareto, sample };
});
