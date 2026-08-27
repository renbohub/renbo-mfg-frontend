(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WorkingHourProfileModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const minutesOfDay = (value) => {
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  };

  function effectiveMinutes(rule = {}) {
    if (rule.isEnabled === false) return 0;
    const start = minutesOfDay(rule.startTime);
    let end = minutesOfDay(rule.endTime);
    if (end <= start) end += 1440;
    return Math.max(end - start - Number(rule.breakMinutes || 0) + Number(rule.overtimeMinutes || 0), 0);
  }

  function normalizeSchedule(rules = [], shifts = []) {
    const orderedShifts = [...shifts].sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    return DAY_NAMES.map((dayName, index) => {
      const dayOfWeek = index + 1;
      const dayShifts = orderedShifts.map((shift) => {
        const existing = rules.find((rule) => Number(rule.dayOfWeek) === dayOfWeek && String(rule.shiftId) === String(shift.id));
        return {
          shiftId: shift.id,
          shiftCode: shift.shiftCode,
          shiftName: shift.shiftName,
          sequence: shift.sequence,
          dayOfWeek,
          startTime: existing?.startTime || "07:00",
          endTime: existing?.endTime || "15:00",
          breakMinutes: Number(existing?.breakMinutes || 0),
          overtimeMinutes: Number(existing?.overtimeMinutes || 0),
          isEnabled: existing?.isEnabled === true,
        };
      });
      return { dayOfWeek, dayName, shifts: dayShifts, totalMinutes: dayShifts.reduce((sum, rule) => sum + effectiveMinutes(rule), 0) };
    });
  }

  function buildRulesPayload(schedule = []) {
    return schedule.flatMap((day) => day.shifts.map((rule) => ({
      shiftId: rule.shiftId,
      dayOfWeek: Number(day.dayOfWeek),
      startTime: String(rule.startTime || "07:00"),
      endTime: String(rule.endTime || "15:00"),
      breakMinutes: Number(rule.breakMinutes || 0),
      overtimeMinutes: Number(rule.overtimeMinutes || 0),
      isEnabled: Boolean(rule.isEnabled),
    })));
  }

  return { DAY_NAMES, effectiveMinutes, normalizeSchedule, buildRulesPayload };
});
