(() => {
  "use strict";
  const { recordKey } = JSON.parse(document.getElementById("wh-config")?.textContent || "{}");
  const { effectiveMinutes, normalizeSchedule } = window.WorkingHourProfileModel;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const number = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(value) || 0);
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "Tanpa batas";
  const api = async (url) => { const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Detail Working Hours gagal dimuat."); return payload; };
  const profileField = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value || "–")}</dd></div>`;
  async function initialize() {
    try {
      const [record, shiftPayload] = await Promise.all([api(`/master-data/api/working-hour-profiles/${encodeURIComponent(recordKey)}`), api("/master-data/api/shifts?start=0&length=100&isDeleted=false")]);
      const schedule = normalizeSchedule(record.rules || [], shiftPayload.data || [],record);
      const active = schedule.filter(day=>!day.isHoliday).flatMap((day) => day.shifts).filter((rule) => rule.isEnabled);
      const totalMinutes = active.reduce((sum, rule) => sum + effectiveMinutes(rule), 0);
      document.getElementById("wh-detail-code").textContent = record.profileCode;
      document.getElementById("wh-detail-name").textContent = record.profileName;
      const status = document.getElementById("wh-detail-status"); status.textContent = record.isActive ? "ACTIVE" : "INACTIVE"; status.className = `wh-status ${record.isActive ? "active" : "inactive"}`;
      document.getElementById("wh-detail-edit").href = `/master-data/working-hour-profiles/${encodeURIComponent(record.id)}/edit?key=${encodeURIComponent(record.profileCode)}`;
      document.getElementById("wh-kpi-days").textContent = number(schedule.filter((day) => !day.isHoliday && day.shifts.some((rule) => rule.isEnabled)).length, 0);
      document.getElementById("wh-kpi-shifts").textContent = number(active.length, 0);
      document.getElementById("wh-kpi-hours").textContent = number(totalMinutes / 60);
      document.getElementById("wh-kpi-assignment").textContent = number(record.assignmentCount, 0);
      document.getElementById("wh-type-chip").textContent = record.profileType;
      document.getElementById("wh-profile-fields").innerHTML = [profileField("Nama Profile", record.profileName), profileField("Tipe", record.profileType), profileField("Berlaku Mulai", date(record.effectiveFrom)), profileField("Berlaku Sampai", date(record.effectiveUntil)), profileField("Prioritas", String(record.priority || 0)), profileField("Status", record.isActive ? "Aktif" : "Nonaktif")].join("");
      document.getElementById("wh-detail-notes").textContent = record.notes || "Tidak ada catatan khusus.";
      document.getElementById('wh-profile-fields').insertAdjacentHTML('beforeend',profileField('Default Sabtu',record.saturdayIsHoliday?'Libur':'Masuk')+profileField('Default Minggu',record.sundayIsHoliday?'Libur':'Masuk'));
      document.getElementById("wh-detail-schedule").innerHTML = schedule.map((day) => {
        const rules = day.shifts.filter((rule) => rule.isEnabled); const dayMinutes = rules.reduce((sum, rule) => sum + effectiveMinutes(rule), 0);
        if(day.isHoliday)return `<tr class="off"><td><b>${esc(day.dayName)}</b><small>Default LIBUR</small></td><td>${rules.length?'Template jika masuk: '+rules.map(rule=>esc(rule.shiftCode)+' '+esc(rule.startTime)+'–'+esc(rule.endTime)).join(' · '):'Atur template shift untuk opsi masuk di PPIC Lab'}</td><td>–</td><td>–</td><td><strong>0 jam</strong></td></tr>`;
        return `<tr class="${rules.length ? "working" : "off"}"><td><b>${esc(day.dayName)}</b><small>${rules.length ? `${rules.length} shift aktif` : "Hari nonaktif"}</small></td><td>${rules.length ? rules.map((rule) => `<span class="wh-shift-chip"><b>${esc(rule.shiftCode)}</b><small>${esc(rule.startTime)}–${esc(rule.endTime)}</small></span>`).join("") : "–"}</td><td>${rules.length ? `${number(rules.reduce((sum, rule) => sum + Number(rule.breakMinutes || 0), 0), 0)} menit` : "–"}</td><td>${rules.length ? `${number(rules.reduce((sum, rule) => sum + Number(rule.overtimeMinutes || 0), 0), 0)} menit` : "–"}</td><td><strong>${number(dayMinutes / 60)} jam</strong></td></tr>`;
      }).join("");
    } catch (error) { const alert = document.getElementById("wh-detail-alert"); alert.textContent = error.message; alert.hidden = false; }
  }
  initialize();
})();
