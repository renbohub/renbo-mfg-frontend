(() => {
  "use strict";
  const config = JSON.parse(document.getElementById("wh-config")?.textContent || "{}");
  const { effectiveMinutes, normalizeSchedule, buildRulesPayload } = window.WorkingHourProfileModel;
  const form = document.getElementById("wh-form");
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const number = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(value) || 0);
  let schedule = [];
  let mutationId = config.recordId;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Working Hours gagal diproses.");
    return payload;
  }
  function showError(message) { const alert = document.getElementById("wh-form-alert"); alert.textContent = message; alert.hidden = false; alert.scrollIntoView({ behavior: "smooth", block: "center" }); }
  function refreshTotals() {
    schedule.forEach((day) => { day.totalMinutes = day.shifts.reduce((sum, rule) => sum + effectiveMinutes(rule), 0); });
    document.querySelectorAll("[data-day-total]").forEach((node) => { const day = schedule.find((item) => item.dayOfWeek === Number(node.dataset.dayTotal)); node.textContent = `${number(day?.totalMinutes / 60)} jam`; });
    const total = schedule.reduce((sum, day) => sum + day.totalMinutes, 0);
    document.getElementById("wh-week-total").textContent = `${number(total / 60)} jam / minggu`;
    document.querySelectorAll("[data-rule-effective]").forEach((node) => { const [day, shiftId] = node.dataset.ruleEffective.split("|"); const rule = schedule.find((item) => item.dayOfWeek === Number(day))?.shifts.find((item) => String(item.shiftId) === shiftId); node.textContent = `${number(effectiveMinutes(rule) / 60)} jam`; });
  }
  function renderSchedule() {
    document.getElementById("wh-weekly-schedule").innerHTML = schedule.map((day) => `<article class="wh-day-card" data-day="${day.dayOfWeek}"><header><div><span>${String(day.dayOfWeek).padStart(2, "0")}</span><h3>${esc(day.dayName)}</h3></div><strong data-day-total="${day.dayOfWeek}">0 jam</strong></header><div class="wh-shift-list">${day.shifts.map((rule) => `<div class="wh-shift-row ${rule.isEnabled ? "enabled" : ""}" data-rule="${day.dayOfWeek}|${esc(rule.shiftId)}"><label class="wh-rule-toggle"><input type="checkbox" data-rule-field="isEnabled" ${rule.isEnabled ? "checked" : ""}><i></i></label><div class="wh-shift-identity"><b>${esc(rule.shiftCode)}</b><small>${esc(rule.shiftName)}</small></div><label><span>Mulai</span><input type="time" data-rule-field="startTime" value="${esc(rule.startTime)}" ${rule.isEnabled ? "" : "disabled"}></label><label><span>Selesai</span><input type="time" data-rule-field="endTime" value="${esc(rule.endTime)}" ${rule.isEnabled ? "" : "disabled"}></label><label><span>Break</span><div><input type="number" data-rule-field="breakMinutes" min="0" step="5" value="${rule.breakMinutes}" ${rule.isEnabled ? "" : "disabled"}><em>mnt</em></div></label><label><span>Overtime</span><div><input type="number" data-rule-field="overtimeMinutes" min="0" step="15" value="${rule.overtimeMinutes}" ${rule.isEnabled ? "" : "disabled"}><em>mnt</em></div></label><strong class="wh-rule-effective" data-rule-effective="${day.dayOfWeek}|${esc(rule.shiftId)}">0 jam</strong></div>`).join("") || '<div class="wh-no-shift">Belum ada Master Shift aktif.</div>'}</div></article>`).join("");
    refreshTotals();
  }
  function populate(record) {
    ["profileCode", "profileName", "profileType", "effectiveFrom", "effectiveUntil", "priority", "notes"].forEach((name) => { if (!form.elements[name]) return; const value = record[name]; form.elements[name].value = value == null ? "" : name.startsWith("effective") ? String(value).slice(0, 10) : value; });
    form.elements.isActive.checked = record.isActive !== false;
  }
  function updateRule(target) {
    const row = target.closest("[data-rule]"); if (!row) return;
    const [dayOfWeek, shiftId] = row.dataset.rule.split("|");
    const rule = schedule.find((day) => day.dayOfWeek === Number(dayOfWeek))?.shifts.find((item) => String(item.shiftId) === shiftId); if (!rule) return;
    const field = target.dataset.ruleField; rule[field] = field === "isEnabled" ? target.checked : ["breakMinutes", "overtimeMinutes"].includes(field) ? Number(target.value || 0) : target.value;
    if (field === "isEnabled") row.querySelectorAll('input:not([type="checkbox"])').forEach((input) => { input.disabled = !rule.isEnabled; });
    row.classList.toggle("enabled", rule.isEnabled); refreshTotals(); document.getElementById("wh-save-state").textContent = "Ada perubahan yang belum disimpan";
  }
  async function initialize() {
    try {
      const requests = [api("/master-data/api/shifts?start=0&length=100&isDeleted=false")];
      if (config.mode === "edit") requests.push(api(`/master-data/api/working-hour-profiles/${encodeURIComponent(config.recordKey)}`));
      const [shiftPayload, record] = await Promise.all(requests);
      const shifts = (shiftPayload?.data || []).filter((shift) => shift.isActive !== false);
      if (record) {
        mutationId = record.id;
        populate(record);
      }
      schedule = normalizeSchedule(record?.rules || [], shifts);
      renderSchedule();
    } catch (error) { showError(error.message); }
  }
  document.getElementById("wh-weekly-schedule").addEventListener("input", (event) => { if (event.target.dataset.ruleField) updateRule(event.target); });
  document.getElementById("wh-weekly-schedule").addEventListener("change", (event) => { if (event.target.dataset.ruleField) updateRule(event.target); });
  document.getElementById("wh-copy-monday").addEventListener("click", () => {
    const monday = schedule.find((day) => day.dayOfWeek === 1); if (!monday) return;
    schedule.filter((day) => [2, 3, 4].includes(day.dayOfWeek)).forEach((day) => { day.shifts = monday.shifts.map((rule) => ({ ...rule, dayOfWeek: day.dayOfWeek })); });
    renderSchedule(); document.getElementById("wh-save-state").textContent = "Jadwal Senin disalin ke Selasa–Kamis";
  });
  form.addEventListener("input", () => { document.getElementById("wh-save-state").textContent = "Ada perubahan yang belum disimpan"; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const activeRules = buildRulesPayload(schedule).filter((rule) => rule.isEnabled);
    if (!activeRules.length) return showError("Aktifkan minimal satu shift pada jadwal mingguan.");
    if (activeRules.some((rule) => effectiveMinutes(rule) <= 0)) return showError("Jam efektif setiap shift aktif harus lebih dari 0 menit.");
    if (form.elements.effectiveFrom.value && form.elements.effectiveUntil.value && form.elements.effectiveUntil.value < form.elements.effectiveFrom.value) return showError("Tanggal berlaku sampai tidak boleh sebelum tanggal mulai.");
    const payload = { profileCode: form.elements.profileCode.value.trim(), profileName: form.elements.profileName.value.trim(), profileType: form.elements.profileType.value, effectiveFrom: form.elements.effectiveFrom.value || null, effectiveUntil: form.elements.effectiveUntil.value || null, priority: Number(form.elements.priority.value || 0), isActive: form.elements.isActive.checked, notes: form.elements.notes.value.trim() || null, rules: buildRulesPayload(schedule) };
    const button = document.getElementById("wh-save"); button.disabled = true; button.querySelector("i").hidden = false; document.getElementById("wh-form-alert").hidden = true;
    try {
      const target = config.mode === "create" ? "/master-data/api/working-hour-profiles" : `/master-data/api/working-hour-profiles/${encodeURIComponent(mutationId)}`;
      const saved = await api(target, { method: config.mode === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      location.replace(`/master-data/working-hour-profiles/${encodeURIComponent(saved.profileCode || payload.profileCode)}`);
    } catch (error) { showError(error.message); } finally { button.disabled = false; button.querySelector("i").hidden = true; }
  });
  initialize();
})();
