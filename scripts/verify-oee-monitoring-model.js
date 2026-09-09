const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../public/js/oee-monitoring-model");

for (const value of [null, undefined, "", "  ", "invalid", NaN, Infinity, -Infinity, false, {}, Symbol("unknown")]) {
  assert.equal(model.number(value), "—");
  assert.equal(model.percent(value), "—");
  assert.equal(model.duration(value), "—");
}
assert.equal(model.number(0), "0");
assert.equal(model.number("12345.6", 1), "12.345,6");
assert.equal(model.percent(0), "0,0%");
assert.equal(model.percent(87.65, 1), "87,7%");
assert.equal(model.number(5, Infinity), "5");
assert.equal(model.number(5, -3), "5");
assert.equal(model.duration(134), "2j 14m");
assert.equal(model.duration(120), "2j");
assert.equal(model.duration(8), "8m");
assert.equal(model.duration(0), "0m");
assert.equal(model.duration(0.1), "6 dtk");
assert.equal(model.duration(0.001), "<1 dtk");
assert.equal(model.duration(-1), "—");
assert.equal(model.clock("2026-09-08T00:00:00.000Z"), "07:00");
assert.equal(model.clock("2026-09-08T00:00:00+07:00"), "00:00");
assert.equal(model.clock("2026-09-08T23:30:00+07:00"), "23:30");
for (const value of [null, "", "invalid", "2026-09-08T07:00:00", "2026-99-08T00:00:00Z"]) assert.equal(model.clock(value), "—");

const fixture = [
  { id: "a", machineCode: "P1", machineName: "Press Alpha", status: "recorded", production: { partNumber: "PN-012", partCode: "BRK-01", partName: "Bracket LH" } },
  { id: "b", machineCode: "P2", name: "Press Beta", status: "no_data" },
];
assert.equal(model.selectMachines(fixture, { query: "  ALPHA " })[0].id, "a");
assert.equal(model.selectMachines(fixture, { query: "pn-012" })[0].id, "a");
assert.equal(model.selectMachines(fixture, { query: "brk-01" })[0].id, "a");
assert.equal(model.selectMachines(fixture, { query: "bracket" })[0].id, "a");
assert.equal(model.selectMachines(fixture, { query: "Beta" })[0].id, "b");
assert.deepEqual(model.selectMachines(fixture, { filter: "recorded" }).map(row => row.id), ["a"]);
assert.deepEqual(model.selectMachines(fixture, { filter: "no-data" }).map(row => row.id), ["b"]);
assert.deepEqual(model.selectMachines(fixture, { query: "P2", filter: "recorded" }), []);
assert.equal(model.selectMachines(fixture, { filter: "all" }).length, 2);
assert.deepEqual(model.selectMachines(null), []);
assert.equal(model.selectMachines([{ production: { moNumber: "MO-020" } }], { query: "mo-020" }).length, 1);

const history = [
  { reason: "Dandori dies", durationMinutes: 10 },
  { reason: " dandori dies ", durationMinutes: "20" },
  { reason: "Sensor feeder", durationMinutes: 30 },
  { reason: "Ignored", durationMinutes: null },
  { reason: "Ignored", durationMinutes: -4 },
  { reason: "Ignored", durationMinutes: Infinity },
  { reason: "Ignored", durationMinutes: "" },
];
const grouped = model.pareto(history);
assert.deepEqual(grouped, [
  { reason: "Dandori dies", durationMinutes: 30, count: 2, share: 50, cumulativePercent: 50 },
  { reason: "Sensor feeder", durationMinutes: 30, count: 1, share: 50, cumulativePercent: 100 },
]);
assert.deepEqual(model.pareto(null), []);
assert.equal(model.pareto([{ reason: "Zero", durationMinutes: 0 }])[0].share, 0);
assert.equal(model.pareto([{ reason: "Zero", durationMinutes: 0 }])[0].cumulativePercent, null);
assert.equal(model.pareto([{ reason: "__proto__", durationMinutes: 5 }])[0].durationMinutes, 5);
const ranked = model.pareto([
  { reason: "Sensor", durationMinutes: 10 },
  { reason: "Material", durationMinutes: 30 },
  { reason: "Dies", durationMinutes: 60 },
]);
assert.deepEqual(ranked.map(row => row.reason), ["Dies", "Material", "Sensor"]);
assert.deepEqual(ranked.map(row => row.cumulativePercent), [60, 90, 100]);
assert.equal(model.pareto(Array.from({ length: 8 }, (_, i) => ({ reason: "Cause " + i, durationMinutes: i + 1 }))).at(-1).cumulativePercent, 100);

function nearly(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }
function checkSample(date, shift = "") {
  const result = model.sample(date, shift);
  assert.equal(result.dataSource, "sample");
  assert.equal(result.isRealtime, false);
  assert.equal(result.period.date, date);
  assert.equal(result.period.shift, shift);
  assert.equal(result.period.timeZone, "Asia/Jakarta");
  assert.equal(model.clock(result.period.startAt), "00:00");
  assert.equal(new Date(result.period.endAt) - new Date(result.period.startAt), 86400000);
  assert.equal(result.machines.length, 6);
  assert.equal(result.summary.oeeBasis, "logged_duration_weighted_machine_oee");
  const recorded = result.machines.filter(machine => machine.status === "recorded");
  assert.equal(result.summary.machinesWithData, recorded.length);
  assert.equal(result.summary.machinesWithOee, recorded.length);
  for (const machine of result.machines) {
    if (machine.status === "no_data") {
      assert.ok(Object.values(machine.metrics).every(value => value === null));
      assert.ok(Object.values(machine.production).every(value => value === null));
      assert.equal(machine.lastUpdatedAt, null);
      assert.deepEqual(machine.downtimeHistory, []);
      continue;
    }
    const m = machine.metrics;
    assert.equal(m.totalProduced, m.goodOutput + m.rejectOutput);
    assert.equal(m.plannedMinutes, m.runtimeMinutes + m.downtimeMinutes);
    nearly(m.availability, m.runtimeMinutes / m.plannedMinutes * 100);
    nearly(m.performance, m.idealCycleTimeSeconds * m.totalProduced / (m.runtimeMinutes * 60) * 100);
    nearly(m.quality, m.goodOutput / m.totalProduced * 100);
    nearly(m.oee, m.availability * m.performance * m.quality / 10000);
    assert.equal(m.downtimeMinutes, machine.downtimeHistory.reduce((sum, event) => sum + event.durationMinutes, 0));
    if (shift) assert.equal(machine.production.shift, shift);
    assert.ok(machine.production.moNumber.includes(date.replace(/-/g, "")));
    assert.ok(new Date(machine.production.startTime) >= new Date(result.period.startAt));
    assert.ok(new Date(machine.production.endTime) < new Date(result.period.endAt));
    const events = [...machine.downtimeHistory].reverse();
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      assert.equal(event.shift, machine.production.shift);
      assert.equal(new Date(event.endTime) - new Date(event.startTime), event.durationMinutes * 60000);
      assert.ok(new Date(event.startTime) >= new Date(machine.production.startTime));
      assert.ok(new Date(event.endTime) <= new Date(machine.production.endTime));
      if (i) assert.ok(new Date(events[i - 1].endTime) <= new Date(event.startTime));
    }
  }
  for (const key of ["totalProduced", "goodOutput", "rejectOutput", "targetOutput", "plannedMinutes", "runtimeMinutes", "downtimeMinutes"]) {
    assert.equal(result.summary[key], recorded.reduce((sum, machine) => sum + machine.metrics[key], 0));
  }
  if (recorded.length) {
    nearly(result.summary.availability, result.summary.runtimeMinutes / recorded.reduce((sum, machine) => sum + machine.metrics.plannedMinutes, 0) * 100);
    nearly(result.summary.performance, recorded.reduce((sum, machine) => sum + machine.metrics.idealCycleTimeSeconds * machine.metrics.totalProduced, 0) / (result.summary.runtimeMinutes * 60) * 100);
    nearly(result.summary.quality, result.summary.goodOutput / result.summary.totalProduced * 100);
    nearly(result.summary.oee, recorded.reduce((sum, machine) => sum + machine.metrics.oee * machine.metrics.plannedMinutes, 0) / result.summary.plannedMinutes);
    if (recorded.length === 1) nearly(result.summary.oee, result.summary.availability * result.summary.performance * result.summary.quality / 10000);
  } else for (const key of ["availability", "performance", "quality", "oee"]) assert.equal(result.summary[key], null);
  return result;
}
assert.equal(checkSample("2026-09-08").summary.machinesWithData, 4);
assert.equal(checkSample("2026-09-08", "1").summary.machinesWithData, 3);
assert.equal(checkSample("2026-09-08", "2").summary.machinesWithData, 1);
assert.equal(checkSample("2026-09-08", "unknown").summary.machinesWithData, 0);
const weightedFixture = model.sample("2026-09-08");
const recordedFixture = weightedFixture.machines.filter(machine => machine.logCount > 0);
assert.ok(new Set(recordedFixture.map(machine => machine.metrics.plannedMinutes)).size > 1, "Sample must exercise unequal duration weights");
const simpleAverage = recordedFixture.reduce((sum, machine) => sum + machine.metrics.oee, 0) / recordedFixture.length;
const fleetProduct = weightedFixture.summary.availability * weightedFixture.summary.performance * weightedFixture.summary.quality / 10000;
assert.ok(Math.abs(weightedFixture.summary.oee - simpleAverage) > 0.001, "Fleet OEE must weight durations instead of averaging machine percentages");
assert.ok(Math.abs(weightedFixture.summary.oee - fleetProduct) > 0.001, "Fleet OEE must not multiply fleet factors across different cycle times");
checkSample("2028-02-29");
checkSample("2026-12-31");
for (const date of [undefined, null, "", "invalid", "2026-02-29", "2026-04-31", "2026-13-01", "2026-9-8", "2026-09-08T00:00:00Z"]) {
  assert.throws(() => model.sample(date), RangeError);
}
const first = model.sample("2026-09-08");
first.machines[0].metrics.goodOutput = 0;
first.shifts.push("changed");
assert.equal(model.sample("2026-09-08").machines[0].metrics.goodOutput, 21470);
assert.deepEqual(model.sample("2026-09-08").shifts, ["1", "2"]);

const browser = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/oee-monitoring-model.js"), "utf8"), browser);
assert.equal(typeof browser.OeeMonitoringModel.sample, "function");
assert.equal(browser.OeeMonitoringModel.percent(null), "—");
console.log("OEE monitoring model verified: formatting, filtering, Pareto, sample math, date/shift isolation, and browser export.");
