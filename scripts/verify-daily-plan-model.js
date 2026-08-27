const assert = require("assert");
const model = require("../public/js/ppic-daily-plan-model");

assert.deepStrictEqual(model.buildHourTicks("07:00", "10:00", 60), ["07:00", "08:00", "09:00", "10:00"]);
assert.deepStrictEqual(model.buildHourTicks("22:00", "02:00", 120), ["22:00", "00:00", "02:00"]);

assert.deepStrictEqual(
  model.blockPlacement({ plannedStartTime: "08:00", plannedEndTime: "09:30" }, { startTime: "07:00", endTime: "14:00" }),
  { leftPercent: 14.2857, widthPercent: 21.4286 },
);

const grouped = model.groupByMachine([
  { id: "1", machineId: "m2", machineCode: "M-002", sequence: 2 },
  { id: "2", machineId: "m1", machineCode: "M-001", sequence: 1 },
  { id: "3", machineId: "m1", machineCode: "M-001", sequence: 3 },
]);
assert.deepStrictEqual(grouped.map((row) => row.machineCode), ["M-001", "M-002"]);
assert.deepStrictEqual(grouped[0].items.map((row) => row.id), ["2", "3"]);

assert.deepStrictEqual(model.matrixHourWindow("07-10").hours, [
  { minute: 420, label: "07" },
  { minute: 480, label: "08" },
  { minute: 540, label: "09" },
  { minute: 600, label: "10" },
]);
const scheduled = { plannedStartTime: "07:00", plannedEndTime: "10:00" };
assert.strictEqual(model.scheduleHourState(scheduled, 420, 420), "start");
assert.strictEqual(model.scheduleHourState(scheduled, 480, 420), "occupied");
assert.strictEqual(model.scheduleHourState(scheduled, 540, 420), "occupied");
assert.strictEqual(model.scheduleHourState(scheduled, 600, 420), "occupied");
assert.strictEqual(model.scheduleHourState(scheduled, 660, 420), "empty");
assert.strictEqual(model.scheduleHourState({ plannedStartTime: "01:00", plannedEndTime: "03:00" }, 1500, 420, 1860), "start");
assert.strictEqual(model.scheduleHourState({ plannedStartTime: "01:00", plannedEndTime: "03:00" }, 1560, 420, 1860), "occupied");
assert.strictEqual(model.shortageQty(100, 60), 40);
assert.strictEqual(model.shortageQty(100, 120), 0);
assert.strictEqual(model.shortageQty(0, 0), null);
assert.deepStrictEqual(model.shiftScheduleTime(scheduled, 20 * 60), { plannedStartTime: "20:00", plannedEndTime: "23:00", durationMinutes: 180 });
assert.deepStrictEqual(model.shiftScheduleTime(scheduled, 25 * 60), { plannedStartTime: "01:00", plannedEndTime: "04:00", durationMinutes: 180 });

assert.strictEqual(model.workspaceMode({ date: "2026-08-24", today: "2026-08-24", status: "Released" }).label, "TODAY · RELEASED");
assert.strictEqual(model.workspaceMode({ date: "2026-08-25", today: "2026-08-24", status: "Draft" }).label, "TOMORROW · DRAFT REVIEW");
assert.strictEqual(model.canEditRevision("Released"), false);
assert.strictEqual(model.canEditRevision("Draft"), true);
assert.strictEqual(model.apiPath("/planning-ppic/daily-plan/workspace"), "/modules/api/planning-ppic/daily-plan/workspace");
assert.strictEqual(model.apiPath("production/machine-availability-events"), "/modules/api/production/machine-availability-events");
assert.deepStrictEqual(model.requestHeaders("token-123"), { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer token-123" });

assert.deepStrictEqual(
  model.timelineWindow([
    { plannedStartTime: "20:37", plannedEndTime: "20:47" },
    { plannedStartTime: "23:04", plannedEndTime: "23:58" },
  ]),
  { startTime: "07:00", endTime: "00:00", hourCount: 17, startsAfterFirstShift: true },
);
assert.deepStrictEqual(
  model.timelineWindow([{ plannedStartTime: "06:30", plannedEndTime: "08:00" }]),
  { startTime: "06:00", endTime: "23:00", hourCount: 17, startsAfterFirstShift: false },
);
assert.strictEqual(
  model.monthlyEditorUrl({ date: "2026-09-07", planNumber: "MPP-202608-001" }),
  "/modules/planning-ppic/monthly-production-plans?month=2026-09&planNumber=MPP-202608-001&date=2026-09-07&editor=1",
);

console.log("Daily plan timeline model contracts passed.");
