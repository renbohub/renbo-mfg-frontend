const assert = require("assert");
const fs = require("fs");
const path = require("path");
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
const timeSorted = model.groupByMachine([
  { id: "late", machineId: "m1", machineCode: "M-001", plannedStartTime: "08:43", sequence: 1 },
  { id: "early", machineId: "m1", machineCode: "M-001", plannedStartTime: "08:14", sequence: 9 },
  { id: "next-day", machineId: "m1", machineCode: "M-001", plannedStartTime: "01:00", sequence: 0 },
]);
assert.deepStrictEqual(timeSorted[0].items.map((row) => row.id), ["early", "late", "next-day"]);

assert.deepStrictEqual(model.matrixHourWindow("07-10").hours, [
  { minute: 420, label: "07" },
  { minute: 480, label: "08" },
  { minute: 540, label: "09" },
]);
const scheduled = { plannedStartTime: "07:00", plannedEndTime: "10:00" };
assert.strictEqual(model.scheduleHourState(scheduled, 420, 420), "start");
assert.strictEqual(model.scheduleHourState(scheduled, 480, 420), "occupied");
assert.strictEqual(model.scheduleHourState(scheduled, 540, 420), "occupied");
assert.strictEqual(model.scheduleHourState(scheduled, 600, 420), "empty");
assert.strictEqual(model.scheduleHourState(scheduled, 660, 420), "empty");
assert.strictEqual(model.scheduleHourState({ plannedStartTime: "01:00", plannedEndTime: "03:00" }, 1500, 420, 1860), "start");
assert.strictEqual(model.scheduleHourState({ plannedStartTime: "01:00", plannedEndTime: "03:00" }, 1560, 420, 1860), "occupied");
assert.strictEqual(model.scheduleHourState({ plannedStartTime: "08:14", plannedEndTime: "08:34" }, 480, 420, 1380), "start");
assert.strictEqual(model.scheduleHourState({ plannedStartTime: "08:14", plannedEndTime: "08:34" }, 540, 420, 1380), "empty");
assert.strictEqual(model.shortageQty(100, 60), 40);
assert.strictEqual(model.shortageQty(100, 120), 0);
assert.strictEqual(model.shortageQty(0, 0), null);
assert.deepStrictEqual(model.shiftScheduleTime(scheduled, 20 * 60), { plannedStartTime: "20:00", plannedEndTime: "23:00", durationMinutes: 180 });
assert.deepStrictEqual(model.shiftScheduleTime(scheduled, 25 * 60), { plannedStartTime: "01:00", plannedEndTime: "04:00", durationMinutes: 180 });
assert.strictEqual(model.formatOperationalRange({ plannedStartTime: "26:36", plannedEndTime: "30:08" }), "02:36 +1–06:08 +1");
assert.strictEqual(model.formatOperationalRange({ plannedStartTime: "02:36", plannedEndTime: "06:08" }), "02:36 +1–06:08 +1");

assert.strictEqual(model.workspaceMode({ date: "2026-08-24", today: "2026-08-24", status: "Released" }).label, "TODAY · RELEASED");
assert.strictEqual(model.workspaceMode({ date: "2026-08-25", today: "2026-08-24", status: "Draft" }).label, "TOMORROW · DRAFT REVIEW");
assert.strictEqual(model.canEditRevision("Released"), false);
assert.strictEqual(model.canEditRevision("Draft"), true);
assert.strictEqual(model.canEditRevision("Ready"), true);
assert.strictEqual(model.canEditRevision("Partially Released"), true);
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

const dailyPlanUi = fs.readFileSync(path.join(__dirname, "../public/js/ppic-daily-production-plan.js"), "utf8");
const dailyPlanView = fs.readFileSync(path.join(__dirname, "../views/ppic/daily-production-plan.ejs"), "utf8");
assert(!dailyPlanUi.includes("window.confirm("), "Daily Plan tidak boleh memakai confirm native browser");
assert(!dailyPlanUi.includes("window.prompt("), "Daily Plan tidak boleh memakai prompt native browser");
assert(dailyPlanUi.includes("window.confirmAction("), "Daily Plan harus memakai modal konfirmasi aplikasi");
assert(dailyPlanUi.includes("window.formPrompt("), "Daily Plan harus memakai modal input aplikasi");
assert(dailyPlanUi.includes("async function releaseAll()"), "Daily Plan harus menyediakan release semua dalam satu proses");
assert(!dailyPlanUi.includes("data-release-schedule"), "Daily Plan tidak boleh menawarkan release per operation");
assert(dailyPlanView.includes('id="dpp-release-all"'), "Daily Plan harus menampilkan tombol Release Semua");
assert(!dailyPlanView.includes('id="dpp-release-item"'), "Dialog operation tidak boleh menampilkan tombol release individual");

console.log("Daily plan timeline model contracts passed.");
