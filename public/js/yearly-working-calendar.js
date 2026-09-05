(() => {
  "use strict";
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const weekdayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const typeLabels = { NATIONAL_HOLIDAY: "Libur Nasional", COLLECTIVE_LEAVE: "Cuti Bersama", RAMADAN_SHIFT: "Shift Ramadan", COMPANY_EVENT: "Event Perusahaan", MAINTENANCE: "Maintenance", OTHER: "Lainnya" };
  const state = { year: Number(new URLSearchParams(location.search).get("year")) || new Date().getFullYear(), events: [], profiles: [], machineCount: 0, editingId: null };
  const $ = (selector) => document.querySelector(selector);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const niceDate = (value) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

  async function api(url, options = {}) {
    const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(token() ? { authorization: `Bearer ${token()}` } : {}) };
    const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan kalender kerja gagal.");
    return payload;
  }

  function alertMessage(message, type = "success") {
    const node = $("#ywc-alert");
    node.textContent = message; node.className = `app-container ywc-alert ${type}`; node.hidden = false;
    clearTimeout(alertMessage.timer); alertMessage.timer = setTimeout(() => { node.hidden = true; }, 7000);
  }

  function eventClass(type) {
    if (["NATIONAL_HOLIDAY", "COLLECTIVE_LEAVE"].includes(type)) return "holiday";
    if (type === "RAMADAN_SHIFT") return "ramadan";
    if (type === "MAINTENANCE") return "maintenance";
    return "event";
  }

  function renderCalendar() {
    $("#ywc-calendar-title").textContent = `Kalender ${state.year}`;
    const byDate = new Map();
    state.events.forEach((event) => (event.dates || []).forEach((date) => {
      if (!byDate.has(date)) byDate.set(date, []); byDate.get(date).push(event);
    }));
    $("#ywc-months").innerHTML = monthNames.map((month, monthIndex) => {
      const first = new Date(state.year, monthIndex, 1);
      const days = new Date(state.year, monthIndex + 1, 0).getDate();
      const offset = (first.getDay() + 6) % 7;
      const cells = Array.from({ length: offset }, () => '<button class="ywc-day empty" tabindex="-1"></button>');
      for (let day = 1; day <= days; day += 1) {
        const current = new Date(state.year, monthIndex, day);
        const key = dateKey(current);
        const events = byDate.get(key) || [];
        const weekend = [0, 6].includes(current.getDay());
        const classes = ["ywc-day", weekend ? "weekend" : "", events.length ? "has-event" : "", events.length ? eventClass(events[0].eventType) : "", events.length > 1 ? "multiple" : ""].filter(Boolean).join(" ");
        const title = events.map((event) => event.eventName).join(" · ");
        cells.push(`<button class="${classes}" type="button" data-event-id="${events[0]?.eventId || ""}" title="${escapeHtml(title)}">${day}</button>`);
      }
      return `<article class="ywc-month"><h3>${month}</h3><div class="ywc-week-row">${weekdayNames.map((name) => `<span>${name}</span>`).join("")}</div><div class="ywc-days">${cells.join("")}</div></article>`;
    }).join("");
  }

  function renderEvents() {
    $("#ywc-event-count").textContent = `${state.events.length} event`;
    if (!state.events.length) {
      $("#ywc-event-list").innerHTML = '<div class="ywc-empty">Belum ada event pada tahun ini.<br>Tambahkan libur atau jadwal kerja khusus.</div>';
    } else {
      $("#ywc-event-list").innerHTML = state.events.map((event) => `<button class="ywc-event-card" type="button" data-edit-id="${escapeHtml(event.eventId)}"><span class="ywc-event-card-top"><strong>${escapeHtml(event.eventName)}</strong><time>${niceDate(event.dateFrom)}</time></span><p>${escapeHtml(typeLabels[event.eventType] || event.eventType)}${event.dateTo !== event.dateFrom ? ` · s.d. ${niceDate(event.dateTo)}` : ""}</p><span class="ywc-event-meta"><span>${event.dayStatus === "HOLIDAY" ? "Kapasitas 0" : escapeHtml(event.workingHourProfileCode || "Hari kerja")}</span><span class="${event.coverageStatus === "COMPLETE" ? "complete" : ""}">${event.appliedMachineCount}/${event.machineCount} mesin</span></span></button>`).join("");
    }
    const holidayDates = new Set(state.events.filter((event) => event.dayStatus === "HOLIDAY").flatMap((event) => event.dates || []));
    const workingDates = new Set(state.events.filter((event) => event.dayStatus === "WORKING").flatMap((event) => event.dates || []));
    $("#ywc-kpi-events").textContent = state.events.length;
    $("#ywc-kpi-holidays").textContent = holidayDates.size;
    $("#ywc-kpi-special").textContent = workingDates.size;
    $("#ywc-kpi-machines").textContent = state.machineCount || "—";
    $("#ywc-kpi-coverage").textContent = state.machineCount ? "mesin aktif tercakup" : "belum ada mesin aktif";
  }

  function populateProfiles() {
    const select = $("[name=workingHourProfileId]");
    const value = select.value;
    select.innerHTML = '<option value="">Pilih profile shift...</option>' + state.profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.profileCode)} · ${escapeHtml(profile.profileName)}</option>`).join("");
    select.value = value;
  }

  function selectedProfile() {
    return state.profiles.find((profile) => profile.id === $("[name=workingHourProfileId]").value) || null;
  }

  function shiftMinutes(rule) {
    const toMinutes = (value) => {
      const [hour, minute] = String(value || "00:00").split(":").map(Number);
      return (hour * 60) + minute;
    };
    const start = toMinutes(rule.startTime);
    let end = toMinutes(rule.endTime);
    if (end <= start) end += 1440;
    return Math.max(end - start - Number(rule.breakMinutes || 0) + Number(rule.overtimeMinutes || 0), 0);
  }

  function syncProfileConnection(adoptProfileDays = false) {
    const working = $("[name=dayStatus]").value === "WORKING";
    const profile = selectedProfile();
    const activeRules = (profile?.rules || []).filter((rule) => rule.isEnabled !== false);
    const workingDays = new Set(activeRules.map((rule) => Number(rule.dayOfWeek)));
    document.querySelectorAll("[name=applicableDays]").forEach((input) => {
      const hasShift = workingDays.has(Number(input.value));
      input.disabled = working && Boolean(profile) && !hasShift;
      if (input.disabled) input.checked = false;
      else if (working && profile && adoptProfileDays) input.checked = hasShift;
    });

    const preview = $("#ywc-profile-preview");
    if (!profile) {
      preview.innerHTML = "<p>Pilih Working Hour Profile untuk melihat hubungan working day dan Shift Master.</p>";
      return;
    }
    preview.innerHTML = weekdayNames.map((dayName, index) => {
      const rules = activeRules.filter((rule) => Number(rule.dayOfWeek) === index + 1);
      if (!rules.length) return `<div class="ywc-shift-preview-row off"><strong>${dayName}</strong><span>Tidak ada shift</span><em>LIBUR</em></div>`;
      const totalMinutes = rules.reduce((sum, rule) => sum + shiftMinutes(rule), 0);
      const descriptions = rules.map((rule) => `${rule.shift?.shiftCode || "SHIFT"} ${rule.startTime}–${rule.endTime}`).join(" · ");
      return `<div class="ywc-shift-preview-row"><strong>${dayName}</strong><span>${escapeHtml(descriptions)}</span><em>${(totalMinutes / 60).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jam</em></div>`;
    }).join("");
  }

  async function load() {
    $("#ywc-year").value = state.year;
    $("#ywc-months").innerHTML = '<div class="ywc-loading">Memuat kalender kerja...</div>';
    try {
      const [calendar, profiles, machines] = await Promise.all([
        api(`/master-data/api/yearly-working-calendars?year=${state.year}&start=0&length=500`),
        api("/master-data/api/working-hour-profiles?start=0&length=500&isDeleted=false"),
        api("/master-data/api/machines?start=0&length=500&isDeleted=false"),
      ]);
      state.events = calendar.data || [];
      state.profiles = (profiles.data || []).filter((profile) => profile.isActive !== false);
      state.machineCount = (machines.data || []).filter((machine) => !["INACTIVE", "RETIRED"].includes(String(machine.status || "").toUpperCase())).length;
      populateProfiles(); renderCalendar(); renderEvents();
      history.replaceState({}, "", `${location.pathname}?year=${state.year}`);
    } catch (error) {
      $("#ywc-months").innerHTML = `<div class="ywc-empty">${escapeHtml(error.message)}</div>`; alertMessage(error.message, "error");
    }
  }

  function renderWeekdays(selected = [1, 2, 3, 4, 5, 6, 7]) {
    $("#ywc-weekdays").innerHTML = weekdayNames.map((name, index) => `<label><input type="checkbox" name="applicableDays" value="${index + 1}" ${selected.includes(index + 1) ? "checked" : ""}><span>${name}</span></label>`).join("");
  }

  function syncTypeDefaults(force = false) {
    const type = $("[name=eventType]").value;
    const status = $("[name=dayStatus]");
    if (force || ["NATIONAL_HOLIDAY", "COLLECTIVE_LEAVE"].includes(type)) status.value = ["NATIONAL_HOLIDAY", "COLLECTIVE_LEAVE"].includes(type) ? "HOLIDAY" : "WORKING";
    status.disabled = ["NATIONAL_HOLIDAY", "COLLECTIVE_LEAVE"].includes(type);
    const working = status.value === "WORKING";
    $("#ywc-profile-field").hidden = !working;
    $("[name=workingHourProfileId]").required = working;
    if (working && type === "RAMADAN_SHIFT" && !$("[name=workingHourProfileId]").value) {
      const ramadan = state.profiles.find((profile) => profile.profileType === "RAMADAN");
      if (ramadan) $("[name=workingHourProfileId]").value = ramadan.id;
    }
    syncProfileConnection(force && working);
  }

  function openDialog(event = null) {
    state.editingId = event?.eventId || null;
    $("#ywc-form").reset();
    $("#ywc-dialog-title").textContent = event ? "Edit Event Kalender" : "Tambah Event Kalender";
    $("#ywc-delete").hidden = !event;
    $("[name=eventName]").value = event?.eventName || "";
    $("[name=eventType]").value = event?.eventType || "NATIONAL_HOLIDAY";
    $("[name=dayStatus]").value = event?.dayStatus === "WORKING" ? "WORKING" : "HOLIDAY";
    $("[name=dateFrom]").value = event?.dateFrom || `${state.year}-01-01`;
    $("[name=dateTo]").value = event?.dateTo || `${state.year}-01-01`;
    const profile = state.profiles.find((item) => item.profileCode === event?.workingHourProfileCode);
    $("[name=workingHourProfileId]").value = profile?.id || "";
    renderWeekdays(event?.applicableDays || [1, 2, 3, 4, 5, 6, 7]);
    syncTypeDefaults(false);
    $("#ywc-dialog").showModal();
  }

  async function save(event) {
    event.preventDefault();
    const form = $("#ywc-form");
    if (!form.reportValidity()) return;
    const button = $("#ywc-save"); button.disabled = true; button.textContent = "Menerapkan...";
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.applicableDays = [...form.querySelectorAll("[name=applicableDays]:checked")].map((input) => Number(input.value));
    payload.overwriteExisting = form.elements.overwriteExisting.checked;
    if (form.elements.dayStatus.disabled) payload.dayStatus = "HOLIDAY";
    try {
      const url = state.editingId ? `/master-data/api/yearly-working-calendars/${encodeURIComponent(state.editingId)}` : "/master-data/api/yearly-working-calendars";
      const result = await api(url, { method: state.editingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      $("#ywc-dialog").close();
      const notes = [];
      if (result.conflicts?.length) notes.push(`${result.conflicts.length} bentrok tidak ditimpa`);
      if (result.skippedNoShift?.length) notes.push(`${result.skippedNoShift.length} tanggal tanpa shift profile dilewati`);
      alertMessage(`${result.message}${notes.length ? ` (${notes.join(", ")})` : ""}`, notes.length ? "warning" : "success");
      await load();
    } catch (error) { alertMessage(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Terapkan Kalender"; }
  }

  async function removeEvent() {
    const current = state.events.find((event) => event.eventId === state.editingId);
    if (!current || !confirm(`Hapus event “${current.eventName}” dari seluruh kalender mesin?`)) return;
    try {
      const result = await api(`/master-data/api/yearly-working-calendars/${encodeURIComponent(current.eventId)}`, { method: "DELETE" });
      $("#ywc-dialog").close(); alertMessage(`${current.eventName} dihapus dari ${result.removedOverrideCount} kalender mesin.`); await load();
    } catch (error) { alertMessage(error.message, "error"); }
  }

  $("#ywc-new-event").addEventListener("click", () => openDialog());
  $("#ywc-prev-year").addEventListener("click", () => { state.year -= 1; load(); });
  $("#ywc-next-year").addEventListener("click", () => { state.year += 1; load(); });
  $("#ywc-year").addEventListener("change", (event) => { const value = Number(event.target.value); if (value >= 2000 && value <= 2100) { state.year = value; load(); } });
  $("#ywc-months").addEventListener("click", (event) => { const id = event.target.closest("[data-event-id]")?.dataset.eventId; if (id) openDialog(state.events.find((item) => item.eventId === id)); });
  $("#ywc-event-list").addEventListener("click", (event) => { const id = event.target.closest("[data-edit-id]")?.dataset.editId; if (id) openDialog(state.events.find((item) => item.eventId === id)); });
  $("[name=eventType]").addEventListener("change", () => syncTypeDefaults(true));
  $("[name=dayStatus]").addEventListener("change", () => syncTypeDefaults(false));
  $("[name=workingHourProfileId]").addEventListener("change", () => syncProfileConnection(true));
  $("#ywc-close").addEventListener("click", () => $("#ywc-dialog").close());
  $("#ywc-cancel").addEventListener("click", () => $("#ywc-dialog").close());
  $("#ywc-delete").addEventListener("click", removeEvent);
  $("#ywc-form").addEventListener("submit", save);
  renderWeekdays(); load();
})();
