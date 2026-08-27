"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const expectedFiles = [
  "public/js/working-hour-profile-model.js",
  "public/js/working-hour-profile-form.js",
  "public/js/working-hour-profile-detail.js",
  "public/css/working-hour-profile-master.css",
  "views/master-data/working-hour-profile-form.ejs",
  "views/master-data/working-hour-profile-detail.ejs",
];
expectedFiles.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `${file} wajib tersedia`));

const { effectiveMinutes, buildRulesPayload, normalizeSchedule } = require("../public/js/working-hour-profile-model");
assert.strictEqual(effectiveMinutes({ startTime: "07:00", endTime: "15:00", breakMinutes: 60, overtimeMinutes: 0 }), 420);
assert.strictEqual(effectiveMinutes({ startTime: "15:00", endTime: "23:00", breakMinutes: 60, overtimeMinutes: 30 }), 450);
assert.strictEqual(effectiveMinutes({ startTime: "22:00", endTime: "06:00", breakMinutes: 60, overtimeMinutes: 0 }), 420,
  "Shift lintas tengah malam harus dihitung benar");

const shifts = [{ id: "s1", shiftCode: "SHIFT-1", shiftName: "Shift 1", sequence: 1 }, { id: "s2", shiftCode: "SHIFT-2", shiftName: "Shift 2", sequence: 2 }];
const schedule = normalizeSchedule([
  { shiftId: "s1", dayOfWeek: 1, startTime: "07:00", endTime: "15:00", breakMinutes: 60, overtimeMinutes: 0, isEnabled: true },
  { shiftId: "s2", dayOfWeek: 1, startTime: "15:00", endTime: "23:00", breakMinutes: 60, overtimeMinutes: 0, isEnabled: true },
], shifts);
assert.strictEqual(schedule.length, 7, "Editor harus menampilkan Senin sampai Minggu");
assert.strictEqual(schedule[0].shifts.length, 2);
assert.strictEqual(schedule[0].totalMinutes, 840);
assert.strictEqual(schedule[1].shifts[0].isEnabled, false, "Rule yang belum ada harus terlihat sebagai shift nonaktif");

schedule[1].shifts[0] = { ...schedule[1].shifts[0], isEnabled: true, startTime: "07:00", endTime: "15:00", breakMinutes: 60 };
const payload = buildRulesPayload(schedule);
assert.ok(payload.every((rule) => ["shiftId", "dayOfWeek", "startTime", "endTime", "breakMinutes", "overtimeMinutes", "isEnabled"].every((key) => Object.hasOwn(rule, key))));
assert.ok(payload.some((rule) => rule.dayOfWeek === 2 && rule.shiftId === "s1"));
assert.ok(!JSON.stringify(payload).includes("createdAt"), "Payload form tidak boleh membawa metadata database");

const registry = fs.readFileSync(path.join(root, "src/masterDataRegistry.js"), "utf8");
assert.match(registry, /working-hour-profile-form/);
assert.match(registry, /working-hour-profile-detail/);
assert.doesNotMatch(registry, /field\("rules",\s*"Aturan Hari & Shift",\s*"json"/,
  "Admin tidak boleh lagi menerima textarea JSON untuk jam kerja");

const formView = fs.readFileSync(path.join(root, "views/master-data/working-hour-profile-form.ejs"), "utf8");
assert.match(formView, /id="wh-weekly-schedule"/);
assert.match(formView, /Jadwal Mingguan/);
const formScript = fs.readFileSync(path.join(root, "public/js/working-hour-profile-form.js"), "utf8");
assert.match(formScript, /mutationId\s*=\s*record\.id/,
  "Edit yang dibuka lewat profileCode harus tetap submit menggunakan UUID record");
const masterCss = fs.readFileSync(path.join(root, "public/css/working-hour-profile-master.css"), "utf8");
assert.match(masterCss, /\.wh-rule-toggle>input[^}]*width:1px/,
  "Checkbox switch tersembunyi tidak boleh mewarisi width global dan membuat halaman overflow");

console.log("Working Hour Profile master contract passed.");
