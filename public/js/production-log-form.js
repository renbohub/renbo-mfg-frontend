(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const form = document.getElementById("production-log-form");
  if (!form) return;

  const alertBox = document.getElementById("production-log-alert");
  const mode = form.dataset.mode || "create";
  const recordKey = form.dataset.recordKey || "";
  const machineSelect = document.getElementById("machineCode");
  const scheduleSelect = document.getElementById("scheduleNumber");
  const downtimeRows = document.getElementById("downtime-rows");
  const downtimeTemplate = document.getElementById("downtime-row-template");
  const coilPhaseRows = document.getElementById("coil-phase-rows");
  const coilPhaseTemplate = document.getElementById("coil-phase-template");
  const submitButton = document.getElementById("production-log-submit");
  const schedules = new Map();

  const element = (id) => document.getElementById(id);
  const value = (id) => element(id)?.value?.trim() || "";
  const numeric = (id) => {
    const raw = value(id);
    return raw === "" ? 0 : Number(raw);
  };
  const escapeHtml = (raw) => String(raw ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
  const formatNumber = (raw) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(raw || 0));
  const formatQuantity = (raw, uomCode = "") => window.SharedDataTable.formatQuantity(raw, uomCode, { maximumFractionDigits: 2 });
  const formatDate = (raw) => raw
    ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(raw))
    : "-";
  const localDate = (raw = new Date()) => {
    const date = new Date(raw);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const timeOnly = (raw) => {
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };
  const show = (message, type = "danger") => {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const setValue = (id, raw) => {
    if (element(id) && raw != null) element(id).value = raw;
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload;
  };

  function combineDateTime(dateValue, timeValue, nextDay = false) {
    if (!dateValue || !timeValue) return null;
    const date = new Date(`${dateValue}T${timeValue}:00`);
    if (nextDay) date.setDate(date.getDate() + 1);
    return date.toISOString();
  }

  function durationFromTimes(start, end) {
    if (!start || !end) return null;
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    let duration = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (duration < 0) duration += 24 * 60;
    return duration;
  }

  function refreshGoodQty() {
    const produced = numeric("qtyProduced");
    const reject = numeric("qtyReject");
    setValue("qtyGood", Math.max(0, produced - reject));
    const rejectReason = element("rejectReason");
    rejectReason.required = reject > 0;
    rejectReason.closest("label")?.classList.toggle("field-required", reject > 0);
  }

  function refreshCoilPhases() {
    const rows = [...coilPhaseRows.querySelectorAll(".production-coil-phase-row")];
    rows.forEach((row, index) => { row.querySelector("[data-coil-phase-number]").textContent = index + 1; });
    const qtyGood = rows.reduce((sum, row) => sum + Number(row.querySelector("[data-coil-good]")?.value || 0), 0);
    const qtyReject = rows.reduce((sum, row) => sum + Number(row.querySelector("[data-coil-reject]")?.value || 0), 0);
    setValue("qtyGood", qtyGood);
    setValue("qtyReject", qtyReject);
    setValue("qtyProduced", qtyGood + qtyReject);
    const rejectReason = element("rejectReason");
    rejectReason.required = qtyReject > 0;
    rejectReason.closest("label")?.classList.toggle("field-required", qtyReject > 0);
  }

  function addCoilPhase(data = {}) {
    const fragment = coilPhaseTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".production-coil-phase-row");
    row.querySelector("[data-coil-number]").value = data.coilNumber || "";
    row.querySelector("[data-input-lot]").value = data.inputLotNumber || "";
    row.querySelector("[data-coil-input]").value = data.qtyInput ?? "";
    row.querySelector("[data-coil-good]").value = data.qtyGood ?? 0;
    row.querySelector("[data-coil-reject]").value = data.qtyReject ?? 0;
    row.querySelector("[data-coil-start]").value = timeOnly(data.startedAt) || "";
    row.querySelector("[data-coil-end]").value = timeOnly(data.endedAt) || "";
    row.querySelector("[data-coil-notes]").value = data.notes || "";
    coilPhaseRows.appendChild(fragment);
    refreshCoilPhases();
  }

  function collectCoilPhases() {
    const date = value("logDate");
    return [...coilPhaseRows.querySelectorAll(".production-coil-phase-row")].map((row) => {
      const start = row.querySelector("[data-coil-start]")?.value || "";
      const end = row.querySelector("[data-coil-end]")?.value || "";
      return {
        coilNumber: row.querySelector("[data-coil-number]")?.value?.trim() || null,
        inputLotNumber: row.querySelector("[data-input-lot]")?.value?.trim() || "",
        qtyInput: Number(row.querySelector("[data-coil-input]")?.value || 0),
        qtyGood: Number(row.querySelector("[data-coil-good]")?.value || 0),
        qtyReject: Number(row.querySelector("[data-coil-reject]")?.value || 0),
        startedAt: start ? combineDateTime(date, start) : null,
        endedAt: end ? combineDateTime(date, end, Boolean(start && end && end < start)) : null,
        notes: row.querySelector("[data-coil-notes]")?.value?.trim() || null,
      };
    });
  }

  function refreshDowntimeRows() {
    const rows = [...downtimeRows.querySelectorAll(".production-downtime-row")];
    rows.forEach((row, index) => {
      row.querySelector("[data-downtime-number]").textContent = index + 1;
    });
    const total = rows.reduce(
      (sum, row) => sum + Number(row.querySelector("[data-downtime-duration]")?.value || 0),
      0,
    );
    element("downtime-total").textContent = formatNumber(total);
  }

  function addDowntimeRow(data = {}) {
    const fragment = downtimeTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".production-downtime-row");
    row.querySelector("[data-downtime-category]").value = data.category || "SETUP_DANDORI";
    row.querySelector("[data-downtime-start]").value = timeOnly(data.startTime) || data.startTime || "";
    row.querySelector("[data-downtime-end]").value = timeOnly(data.endTime) || data.endTime || "";
    row.querySelector("[data-downtime-duration]").value = data.durationMinutes ?? data.duration ?? "";
    row.querySelector("[data-downtime-reason]").value = data.reason || "";
    row.querySelector("[data-downtime-notes]").value = data.notes || "";
    downtimeRows.appendChild(fragment);
    refreshDowntimeRows();
  }

  function collectDowntimes() {
    const date = value("logDate");
    return [...downtimeRows.querySelectorAll(".production-downtime-row")].map((row) => {
      const start = row.querySelector("[data-downtime-start]")?.value || "";
      const end = row.querySelector("[data-downtime-end]")?.value || "";
      const crossesMidnight = Boolean(start && end && end < start);
      return {
        category: row.querySelector("[data-downtime-category]")?.value || "OTHER",
        startTime: start ? combineDateTime(date, start) : null,
        endTime: end ? combineDateTime(date, end, crossesMidnight) : null,
        durationMinutes: Number(row.querySelector("[data-downtime-duration]")?.value || 0),
        reason: row.querySelector("[data-downtime-reason]")?.value?.trim() || "",
        notes: row.querySelector("[data-downtime-notes]")?.value?.trim() || null,
      };
    });
  }

  function renderScheduleSummary(schedule) {
    const summary = element("production-log-plan-summary");
    if (!schedule) {
      summary.className = "production-log-plan-summary is-empty";
      summary.innerHTML = "<span>Pilih mesin, lalu pilih Daily Production Schedule yang siap diproduksi.</span>";
      return;
    }
    const remaining = Math.max(0, Number(schedule.plannedQty || 0) - Number(schedule.actualQty || 0));
    summary.className = "production-log-plan-summary";
    summary.innerHTML = `
      <div><small>Monthly Production Plan</small><strong>${escapeHtml(schedule.monthlyProductionPlanNumber || "-")} · Line ${escapeHtml(schedule.monthlyProductionPlanLineNumber || "-")}</strong></div>
      <div><small>Part</small><strong>${escapeHtml(schedule.partCode || "-")}</strong></div>
      <div><small>Mesin / Proses</small><strong>${escapeHtml(schedule.machineCode || "-")} · ${escapeHtml(schedule.processCode || "-")}</strong></div>
      <div><small>Plan / Actual</small><strong>${formatQuantity(schedule.plannedQty,schedule.uomCode)} / ${formatQuantity(schedule.actualQty,schedule.uomCode)}</strong></div>
      <div><small>Sisa Target</small><strong>${formatQuantity(remaining,schedule.uomCode)} ${escapeHtml(schedule.uomCode || "")}</strong></div>
      <div><small>Status</small><strong>${escapeHtml(schedule.status || "-")}</strong></div>`;
  }

  function applySchedule(schedule, preserveActual = false) {
    if (!schedule) {
      setValue("moNumber", "");
      setValue("woNumber", "");
      setValue("processCode", "");
      setValue("qtyPlanned", "");
      if (!preserveActual) {
        setValue("qtyProduced", "");
        refreshGoodQty();
      }
      renderScheduleSummary(null);
      return;
    }
    const remaining = Math.max(0, Number(schedule.plannedQty || 0) - Number(schedule.actualQty || 0));
    setValue("logDate", localDate(schedule.scheduleDate));
    setValue("shift", schedule.shift || "1A");
    setValue("moNumber", schedule.moNumber || "");
    setValue("woNumber", schedule.woNumber || "");
    setValue("machineCode", schedule.machineCode || "");
    setValue("processCode", schedule.processCode || "");
    setValue("operatorName", value("operatorName") || schedule.operatorName || "");
    setValue("qtyPlanned", remaining);
    if (!preserveActual) {
      setValue("startTime", schedule.plannedStartTime || value("startTime"));
      setValue("endTime", schedule.plannedEndTime || value("endTime"));
    }
    if (!preserveActual && !value("qtyProduced")) {
      setValue("qtyProduced", remaining);
      refreshGoodQty();
    }
    if (!preserveActual) {
      const firstPhase = coilPhaseRows.querySelector(".production-coil-phase-row");
      if (firstPhase && !firstPhase.querySelector("[data-coil-input]").value) {
        firstPhase.querySelector("[data-coil-input]").value = remaining;
        firstPhase.querySelector("[data-coil-good]").value = remaining;
        refreshCoilPhases();
      }
    }
    renderScheduleSummary(schedule);
  }

  function ensureMachineOption(machineCode, machineName = "") {
    if (!machineCode || [...machineSelect.options].some((option) => option.value === machineCode)) return;
    machineSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(machineCode)}">${escapeHtml(machineCode)}${machineName ? ` · ${escapeHtml(machineName)}` : ""}</option>`,
    );
  }

  function renderScheduleOptions(selectedScheduleNumber = "") {
    const machineCode = machineSelect.value;
    const rows = [...schedules.values()].filter((row) => row.machineCode === machineCode).sort((left, right) => Number(left.schedulePriority || 100) - Number(right.schedulePriority || 100) || String(left.plannedStartTime || "99:99").localeCompare(String(right.plannedStartTime || "99:99")));
    const options = rows.map((row) => {
      const remaining = Math.max(0, Number(row.plannedQty || 0) - Number(row.actualQty || 0));
      const label = [
        `${Number(row.schedulePriority || 100) <= 1 ? "PRIORITAS SHORTFALL · " : ""}${row.scheduleNumber}`,
        formatDate(row.scheduleDate),
        `Shift ${row.shift}`,
        row.partCode || "Tanpa part",
        row.processName || row.processCode || "Tanpa proses",
        `Sisa ${formatNumber(remaining)}`,
      ].join(" · ");
      return `<option value="${escapeHtml(row.scheduleNumber)}">${escapeHtml(label)}</option>`;
    }).join("");
    scheduleSelect.disabled = !machineCode || !rows.length;
    scheduleSelect.innerHTML = !machineCode
      ? '<option value="">Pilih mesin terlebih dahulu</option>'
      : rows.length
        ? `<option value="">Pilih Daily Production Schedule siap produksi</option>${options}`
        : '<option value="">Belum ada Daily Production Schedule siap produksi</option>';
    if (selectedScheduleNumber && rows.some((row) => row.scheduleNumber === selectedScheduleNumber)) {
      scheduleSelect.value = selectedScheduleNumber;
    }
  }

  async function loadSchedules() {
    const payload = await api("/modules/api/production/daily-production-schedules?start=0&length=500&sourceModule=PPIC&status=In%20Progress");
    const rows = Array.isArray(payload.data) ? payload.data : [];
    rows
      .filter((row) => row.status === "In Progress" && row.machineCode)
      .forEach((row) => schedules.set(row.scheduleNumber, row));
    const machines = [...new Map(
      [...schedules.values()].map((row) => [row.machineCode, { code: row.machineCode, name: row.machineName || "" }]),
    ).values()].sort((left, right) => left.code.localeCompare(right.code));
    machineSelect.innerHTML = `<option value="">Pilih mesin</option>${machines.map((machine) => (
      `<option value="${escapeHtml(machine.code)}">${escapeHtml(machine.code)}${machine.name ? ` · ${escapeHtml(machine.name)}` : ""}</option>`
    )).join("")}`;
    renderScheduleOptions();
  }

  function ensureScheduleOption(scheduleNumber, record) {
    if (!scheduleNumber || schedules.has(scheduleNumber)) return;
    const schedule = {
      scheduleNumber,
      scheduleDate: record.logDate,
      shift: record.shift,
      moNumber: record.manufacturingOrder?.moNumber || record.moNumber,
      woNumber: record.workOrder?.woNumber || record.woNumber,
      machineCode: record.machineCode,
      processCode: record.processCode,
      partCode: record.manufacturingOrder?.part?.partCode,
      plannedQty: record.qtyPlanned,
      actualQty: record.qtyProduced,
      status: record.status,
    };
    schedules.set(scheduleNumber, schedule);
    ensureMachineOption(schedule.machineCode);
  }

  async function loadEditRecord() {
    if (mode !== "edit" || !recordKey) return;
    const payload = await api(`/modules/api/production/production-logs/${encodeURIComponent(recordKey)}`);
    const record = payload.data || payload.item || payload;
    const scheduleNumber = record.dailyProductionSchedule?.scheduleNumber || "";
    ensureScheduleOption(scheduleNumber, record);
    const schedule = schedules.get(scheduleNumber);
    ensureMachineOption(schedule?.machineCode);
    machineSelect.value = schedule?.machineCode || record.machineCode || "";
    renderScheduleOptions(scheduleNumber);
    machineSelect.disabled = true;
    scheduleSelect.disabled = true;
    applySchedule(schedule, true);
    setValue("logDate", localDate(record.logDate));
    setValue("shift", record.shift);
    setValue("moNumber", record.manufacturingOrder?.moNumber || record.moNumber || "");
    setValue("woNumber", record.workOrder?.woNumber || record.woNumber || "");
    setValue("machineCode", record.machineCode || "");
    setValue("processCode", record.processCode || "");
    setValue("operatorName", record.operatorName || "");
    setValue("qtyPlanned", record.qtyPlanned || 0);
    setValue("qtyProduced", record.qtyProduced || 0);
    setValue("qtyReject", record.qtyReject || 0);
    setValue("qtyGood", record.qtyGood || 0);
    setValue("rejectReason", record.rejectReason || "");
    setValue("startTime", timeOnly(record.startTime));
    setValue("endTime", timeOnly(record.endTime));
    setValue("attachmentUrl", record.attachmentUrl || "");
    setValue("notes", record.notes || "");
    downtimeRows.innerHTML = "";
    (record.downtimeLogs || []).forEach(addDowntimeRow);
    coilPhaseRows.innerHTML = "";
    (record.coilPhases || []).forEach(addCoilPhase);
    if (!record.coilPhases?.length) addCoilPhase({ qtyGood: record.qtyGood || 0, qtyReject: record.qtyReject || 0 });
    refreshGoodQty();
    refreshDowntimeRows();
  }

  machineSelect.addEventListener("change", () => {
    renderScheduleOptions();
    applySchedule(null);
  });
  scheduleSelect.addEventListener("change", () => applySchedule(schedules.get(scheduleSelect.value)));
  element("add-coil-phase").addEventListener("click", () => addCoilPhase());
  coilPhaseRows.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-coil-phase]");
    if (!remove) return;
    remove.closest(".production-coil-phase-row")?.remove();
    if (!coilPhaseRows.children.length) addCoilPhase();
    refreshCoilPhases();
  });
  coilPhaseRows.addEventListener("input", refreshCoilPhases);
  element("add-downtime").addEventListener("click", () => addDowntimeRow());
  downtimeRows.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-downtime]");
    if (!remove) return;
    remove.closest(".production-downtime-row")?.remove();
    refreshDowntimeRows();
  });
  downtimeRows.addEventListener("input", (event) => {
    const row = event.target.closest(".production-downtime-row");
    if (row && (event.target.matches("[data-downtime-start]") || event.target.matches("[data-downtime-end]"))) {
      const duration = durationFromTimes(
        row.querySelector("[data-downtime-start]").value,
        row.querySelector("[data-downtime-end]").value,
      );
      if (duration != null) row.querySelector("[data-downtime-duration]").value = duration;
    }
    refreshDowntimeRows();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    refreshGoodQty();
    refreshCoilPhases();
    const downtimes = collectDowntimes();
    const coilPhases = collectCoilPhases();
    if (!coilPhases.length || coilPhases.some((row) => !row.inputLotNumber || row.qtyGood + row.qtyReject <= 0 || (row.qtyInput > 0 && row.qtyGood + row.qtyReject > row.qtyInput))) {
      show("Setiap phase wajib memiliki lot coil, hasil OK/reject, dan output tidak boleh melebihi qty input.");
      return;
    }
    if (numeric("qtyReject") > numeric("qtyProduced")) {
      show("Qty NG tidak boleh melebihi Qty Produced.");
      return;
    }
    if (downtimes.some((row) => !row.reason || row.durationMinutes <= 0)) {
      show("Setiap downtime harus memiliki alasan dan durasi lebih dari 0 menit.");
      return;
    }
    const startTimeValue = value("startTime");
    const endTimeValue = value("endTime");
    const crossesMidnight = Boolean(startTimeValue && endTimeValue && endTimeValue < startTimeValue);
    const body = {
      scheduleNumber: value("scheduleNumber"),
      logDate: value("logDate"),
      shift: value("shift"),
      moNumber: value("moNumber"),
      woNumber: value("woNumber") || null,
      machineCode: value("machineCode") || null,
      processCode: value("processCode") || null,
      operatorName: value("operatorName"),
      startTime: combineDateTime(value("logDate"), startTimeValue),
      endTime: combineDateTime(value("logDate"), endTimeValue, crossesMidnight),
      qtyPlanned: numeric("qtyPlanned"),
      qtyProduced: numeric("qtyProduced"),
      qtyGood: numeric("qtyGood"),
      qtyReject: numeric("qtyReject"),
      rejectReason: value("rejectReason") || null,
      coilPhases,
      downtimes,
      attachmentUrl: value("attachmentUrl") || null,
      notes: value("notes") || null,
    };

    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan...";
    try {
      const endpoint = mode === "edit"
        ? `/modules/api/production/production-logs/${encodeURIComponent(recordKey)}`
        : "/modules/api/production/production-logs";
      const payload = await api(endpoint, {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      const logNumber = payload.logNumber || recordKey;
      show(`Production Log ${logNumber} berhasil disimpan.`, "success");
      setTimeout(() => location.assign(`/modules/production/production-logs/${encodeURIComponent(logNumber)}`), 500);
    } catch (error) {
      show(error.message);
      submitButton.disabled = false;
      submitButton.textContent = "Simpan Production Log";
    }
  });

  setValue("logDate", localDate());
  if (mode !== "edit") addCoilPhase();
  Promise.resolve()
    .then(loadSchedules)
    .then(loadEditRecord)
    .catch((error) => show(error.message));
})();
