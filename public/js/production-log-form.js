(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const form = document.getElementById("production-log-form");
  if (!form) return;

  const alertBox = document.getElementById("production-log-alert");
  const mode = form.dataset.mode || "create";
  const recordKey = form.dataset.recordKey || "";
  const machineSelect = document.getElementById("machineCode");
  const scheduleSelect = document.getElementById("scheduleNumber");
  const scheduleGate = document.getElementById("production-log-schedule-gate");
  const downtimeRows = document.getElementById("downtime-rows");
  const downtimeTemplate = document.getElementById("downtime-row-template");
  const coilPhaseRows = document.getElementById("coil-phase-rows");
  const coilPhaseTemplate = document.getElementById("coil-phase-template");
  const ngReasonTemplate = document.getElementById("ng-reason-row-template");
  const submitButton = document.getElementById("production-log-submit");
  const schedules = new Map();
  const ACTIVE_SCHEDULE_STATUSES = ["Draft", "Released", "In Progress"];
  const hmiMaster = { rejections: [], downtimes: [] };

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
  const localDate = (raw = (globalThis.erpBusinessNow?.() || new Date())) => {
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
  }

  function masterOptions(rows, selectedId = null) {
    return `<option value="">Pilih master ERP</option>${rows.map((item) => `<option value="${item.id}" data-description="${escapeHtml(item.description)}" ${String(item.id) === String(selectedId || "") ? "selected" : ""}>${escapeHtml([item.areaCode, item.description].filter(Boolean).join(" · "))}</option>`).join("")}<option value="MANUAL" ${selectedId === "MANUAL" ? "selected" : ""}>Input manual</option>`;
  }

  function childOptions(parent, selectedId = null) {
    return `<option value="">Pilih sub reason</option>${(parent?.children || []).map((item) => `<option value="${item.id}" data-description="${escapeHtml(item.description)}" ${String(item.id) === String(selectedId || "") ? "selected" : ""}>${escapeHtml(item.description)}</option>`).join("")}`;
  }

  function syncNgReasonRow(row, data = {}) {
    const main = row.querySelector("[data-ng-reason-main]");
    const sub = row.querySelector("[data-ng-reason-sub]");
    const manual = row.querySelector("[data-ng-reason-manual]");
    const matched = hmiMaster.rejections.find((item) => Number(item.id) === Number(data.hmiRejectionId));
    const selectedMain = matched ? matched.id : "MANUAL";
    main.innerHTML = masterOptions(hmiMaster.rejections, selectedMain);
    sub.innerHTML = childOptions(matched, data.hmiRejectionSubId);
    sub.disabled = !matched || !(matched.children || []).length;
    manual.value = matched ? "" : (data.reason || "");
    manual.required = !matched;
    row.querySelector("[data-ng-manual-wrap]").classList.toggle("d-none", Boolean(matched));
  }

  function addNgReasonRow(phaseRow, data = {}) {
    const fragment = ngReasonTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".production-ng-reason-row");
    syncNgReasonRow(row, data);
    row.querySelector("[data-ng-reason-qty]").value = data.qtyNg ?? "";
    phaseRow.querySelector("[data-ng-reason-rows]").appendChild(fragment);
  }

  function collectNgReasons(phaseRow) {
    return [...phaseRow.querySelectorAll(".production-ng-reason-row")].map((row) => {
      const main = row.querySelector("[data-ng-reason-main]");
      const sub = row.querySelector("[data-ng-reason-sub]");
      const manual = row.querySelector("[data-ng-reason-manual]").value.trim();
      const mainDescription = main.selectedOptions[0]?.dataset.description || "";
      const subDescription = sub.selectedOptions[0]?.dataset.description || "";
      return {
        hmiRejectionId: main.value && main.value !== "MANUAL" ? Number(main.value) : null,
        hmiRejectionSubId: sub.value ? Number(sub.value) : null,
        reason: main.value === "MANUAL" ? manual : mainDescription,
        subReason: subDescription || null,
        qtyNg: Number(row.querySelector("[data-ng-reason-qty]").value || 0),
      };
    });
  }

  function refreshCoilPhases() {
    const rows = [...coilPhaseRows.querySelectorAll(".production-coil-phase-row")];
    rows.forEach((row, index) => { row.querySelector("[data-coil-phase-number]").textContent = index + 1; });
    const qtyGood = rows.reduce((sum, row) => sum + Number(row.querySelector("[data-coil-good]")?.value || 0), 0);
    const qtyReject = rows.reduce((sum, row) => sum + Number(row.querySelector("[data-coil-reject]")?.value || 0), 0);
    setValue("qtyGood", qtyGood);
    setValue("qtyReject", qtyReject);
    setValue("qtyProduced", qtyGood + qtyReject);
    setValue("rejectReason", rows.flatMap((row) => collectNgReasons(row).map((reason) => `${reason.reason}${reason.subReason ? ` / ${reason.subReason}` : ""}: ${formatNumber(reason.qtyNg)}`)).filter(Boolean).join("; "));
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
    (data.ngReasons || []).forEach((reason) => addNgReasonRow(row, reason));
    if (Number(data.qtyReject || 0) > 0 && !data.ngReasons?.length) addNgReasonRow(row, { qtyNg: data.qtyReject, reason: data.rejectReason || "" });
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
        ngReasons: collectNgReasons(row),
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
    const main = row.querySelector("[data-downtime-category]");
    const sub = row.querySelector("[data-downtime-sub]");
    const matched = hmiMaster.downtimes.find((item) => Number(item.id) === Number(data.hmiDowntimeId));
    main.innerHTML = masterOptions(hmiMaster.downtimes, matched ? matched.id : "MANUAL");
    sub.innerHTML = childOptions(matched, data.hmiDowntimeSubId);
    sub.disabled = !matched || !(matched.children || []).length;
    row.querySelector("[data-downtime-start]").value = timeOnly(data.startTime) || data.startTime || "";
    row.querySelector("[data-downtime-end]").value = timeOnly(data.endTime) || data.endTime || "";
    row.querySelector("[data-downtime-duration]").value = data.durationMinutes ?? data.duration ?? "";
    row.querySelector("[data-downtime-reason]").value = matched ? "" : (data.reason || data.category || "");
    row.querySelector("[data-downtime-reason]").required = !matched;
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
        category: row.querySelector("[data-downtime-category]")?.selectedOptions[0]?.dataset.description || "MANUAL",
        hmiDowntimeId: row.querySelector("[data-downtime-category]")?.value !== "MANUAL" ? Number(row.querySelector("[data-downtime-category]")?.value || 0) || null : null,
        hmiDowntimeSubId: Number(row.querySelector("[data-downtime-sub]")?.value || 0) || null,
        startTime: start ? combineDateTime(date, start) : null,
        endTime: end ? combineDateTime(date, end, crossesMidnight) : null,
        durationMinutes: Number(row.querySelector("[data-downtime-duration]")?.value || 0),
        reason: row.querySelector("[data-downtime-sub]")?.selectedOptions[0]?.dataset.description || row.querySelector("[data-downtime-reason]")?.value?.trim() || row.querySelector("[data-downtime-category]")?.selectedOptions[0]?.dataset.description || "",
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
      <div><small>Part Code</small><strong>${escapeHtml(schedule.partCode || "-")}</strong></div>
      <div><small>Part Number</small><strong>${escapeHtml(schedule.partNumber || "-")}</strong></div>
      <div><small>Part Name</small><strong>${escapeHtml(schedule.partName || "-")}</strong></div>
      <div><small>Mesin / Proses</small><strong>${escapeHtml(schedule.machineCode || "-")} · ${escapeHtml(schedule.processCode || "-")}</strong></div>
      <div><small>Plan / Actual</small><strong>${formatQuantity(schedule.plannedQty,schedule.uomCode)} / ${formatQuantity(schedule.actualQty,schedule.uomCode)}</strong></div>
      <div><small>Sisa Target</small><strong>${formatQuantity(remaining,schedule.uomCode)} ${escapeHtml(schedule.uomCode || "")}</strong></div>
      <div><small>Status</small><strong>${escapeHtml(schedule.status || "-")}</strong></div>`;
  }

  function applySchedule(schedule, preserveActual = false) {
    if (!schedule) {
      setValue("moNumber", "");
      setValue("woNumber", "");
      setValue("partCode", "");
      setValue("partNumber", "");
      setValue("partName", "");
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
    setValue("partCode", schedule.partCode || "");
    setValue("partNumber", schedule.partNumber || "");
    setValue("partName", schedule.partName || "");
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

  function renderScheduleGate(machineCode, machineRows = [], readyRows = []) {
    if (!scheduleGate) return;
    if (!machineCode || readyRows.length || mode === "edit") {
      scheduleGate.className = "production-log-schedule-gate d-none";
      scheduleGate.innerHTML = "";
      return;
    }

    const waitingRows = machineRows
      .filter((row) => row.status !== "In Progress")
      .sort((left, right) => {
        const rank = (status) => status === "Released" ? 0 : 1;
        return rank(left.status) - rank(right.status)
          || new Date(left.scheduleDate || 0) - new Date(right.scheduleDate || 0)
          || String(left.scheduleNumber || "").localeCompare(String(right.scheduleNumber || ""));
      });
    const primary = waitingRows[0];
    const releasedCount = waitingRows.filter((row) => row.status === "Released").length;
    const draftCount = waitingRows.filter((row) => row.status === "Draft").length;
    const nextAction = releasedCount
      ? "Daily Plan sudah Released. Buka dokumennya lalu jalankan Start Daily Plan."
      : "Daily Plan masih Draft. Selesaikan Consume Material, lalu Start Daily Plan.";

    scheduleGate.className = "production-log-schedule-gate";
    scheduleGate.innerHTML = `
      <span class="production-log-gate-mark" aria-hidden="true">!</span>
      <div class="production-log-gate-copy">
        <strong>Mesin ${escapeHtml(machineCode)} belum memiliki pekerjaan In Progress</strong>
        <p>${escapeHtml(nextAction)} Production Entry baru dapat dicatat setelah proses tersebut.</p>
        <span class="production-log-gate-status">${releasedCount} Released · ${draftCount} Draft</span>
      </div>
      ${primary ? `<a class="btn btn-outline-primary btn-sm" href="/modules/production/daily-production-schedules/${encodeURIComponent(primary.scheduleNumber)}">Buka Daily Plan</a>` : ""}`;
  }

  function renderScheduleOptions(selectedScheduleNumber = "") {
    const machineCode = machineSelect.value;
    const machineRows = [...schedules.values()]
      .filter((row) => row.machineCode === machineCode)
      .sort((left, right) => Number(left.schedulePriority || 100) - Number(right.schedulePriority || 100) || String(left.plannedStartTime || "99:99").localeCompare(String(right.plannedStartTime || "99:99")));
    const readyRows = machineRows.filter((row) => row.status === "In Progress");
    const options = readyRows.map((row) => {
      const remaining = Math.max(0, Number(row.plannedQty || 0) - Number(row.actualQty || 0));
      const label = [
        `${Number(row.schedulePriority || 100) <= 1 ? "PRIORITAS SHORTFALL · " : ""}${row.scheduleNumber}`,
        formatDate(row.scheduleDate),
        `Shift ${row.shift}`,
        [row.partCode, row.partNumber, row.partName].filter(Boolean).join(" / ") || "Tanpa part",
        row.processName || row.processCode || "Tanpa proses",
        `Sisa ${formatNumber(remaining)}`,
      ].join(" · ");
      return `<option value="${escapeHtml(row.scheduleNumber)}">${escapeHtml(label)}</option>`;
    }).join("");
    scheduleSelect.disabled = !machineCode || !readyRows.length;
    scheduleSelect.innerHTML = !machineCode
      ? '<option value="">Pilih mesin terlebih dahulu</option>'
      : readyRows.length
        ? `<option value="">Pilih Daily Production Schedule siap produksi</option>${options}`
        : '<option value="">Belum ada DPS berstatus In Progress</option>';
    renderScheduleGate(machineCode, machineRows, readyRows);
    if (selectedScheduleNumber && readyRows.some((row) => row.scheduleNumber === selectedScheduleNumber)) {
      scheduleSelect.value = selectedScheduleNumber;
    }
  }

  async function loadSchedules() {
    const payload = await api("/modules/api/production/daily-production-schedules?start=0&length=500&sourceModule=PPIC");
    const rows = Array.isArray(payload.data) ? payload.data : [];
    rows
      .filter((row) => ACTIVE_SCHEDULE_STATUSES.includes(row.status) && row.machineCode)
      .forEach((row) => schedules.set(row.scheduleNumber, row));
    const machines = [...new Map(
      [...schedules.values()].map((row) => [row.machineCode, { code: row.machineCode, name: row.machineName || "" }]),
    ).values()].sort((left, right) => left.code.localeCompare(right.code));
    machineSelect.disabled = machines.length === 0;
    machineSelect.innerHTML = `<option value="">${machines.length ? "Pilih mesin" : "Belum ada mesin pada Daily Plan aktif"}</option>${machines.map((machine) => {
      const assigned = [...schedules.values()].filter((row) => row.machineCode === machine.code);
      const readyCount = assigned.filter((row) => row.status === "In Progress").length;
      const releasedCount = assigned.filter((row) => row.status === "Released").length;
      const state = readyCount ? `${readyCount} siap entry` : releasedCount ? `${releasedCount} menunggu Start` : `${assigned.length} masih Draft`;
      return `<option value="${escapeHtml(machine.code)}">${escapeHtml(machine.code)}${machine.name ? ` · ${escapeHtml(machine.name)}` : ""} — ${escapeHtml(state)}</option>`;
    }).join("")}`;
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
      partNumber: record.outputPart?.partNumber || record.workOrder?.outputPartNumber || record.manufacturingOrder?.part?.partNumber,
      partName: record.outputPart?.partName || record.workOrder?.outputPartName || record.manufacturingOrder?.part?.partName,
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
    setValue("partCode", record.outputPart?.partCode || schedule?.partCode || record.manufacturingOrder?.part?.partCode || "");
    setValue("partNumber", record.outputPart?.partNumber || schedule?.partNumber || record.workOrder?.outputPartNumber || record.manufacturingOrder?.part?.partNumber || "");
    setValue("partName", record.outputPart?.partName || schedule?.partName || record.workOrder?.outputPartName || record.manufacturingOrder?.part?.partName || "");
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
    element("operatorSelfCheck").checked = record.qualityCheckMode === "OPERATOR_SELF_CHECK";
    setValue("selfCheckNotes", record.selfCheckNotes || "");
    element("selfCheckNotesWrap").classList.toggle("d-none", !element("operatorSelfCheck").checked);
    element("selfCheckNotes").required = element("operatorSelfCheck").checked;
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
    const addReason = event.target.closest("[data-add-ng-reason]");
    if (addReason) {
      addNgReasonRow(addReason.closest(".production-coil-phase-row"));
      refreshCoilPhases();
      return;
    }
    const removeReason = event.target.closest("[data-remove-ng-reason]");
    if (removeReason) {
      removeReason.closest(".production-ng-reason-row")?.remove();
      refreshCoilPhases();
      return;
    }
    const remove = event.target.closest("[data-remove-coil-phase]");
    if (!remove) return;
    remove.closest(".production-coil-phase-row")?.remove();
    if (!coilPhaseRows.children.length) addCoilPhase();
    refreshCoilPhases();
  });
  coilPhaseRows.addEventListener("change", (event) => {
    if (!event.target.matches("[data-ng-reason-main]")) return;
    const reasonRow = event.target.closest(".production-ng-reason-row");
    const selected = hmiMaster.rejections.find((item) => Number(item.id) === Number(event.target.value));
    const sub = reasonRow.querySelector("[data-ng-reason-sub]");
    sub.innerHTML = childOptions(selected);
    sub.disabled = !selected || !(selected.children || []).length;
    reasonRow.querySelector("[data-ng-manual-wrap]").classList.toggle("d-none", Boolean(selected));
    reasonRow.querySelector("[data-ng-reason-manual]").required = !selected;
    refreshCoilPhases();
  });
  coilPhaseRows.addEventListener("input", (event) => {
    const phase = event.target.closest(".production-coil-phase-row");
    if (phase && event.target.matches("[data-coil-reject]") && Number(event.target.value || 0) > 0 && !phase.querySelector(".production-ng-reason-row")) {
      addNgReasonRow(phase, { qtyNg: Number(event.target.value || 0) });
    }
    refreshCoilPhases();
  });
  element("add-downtime").addEventListener("click", () => addDowntimeRow());
  element("operatorSelfCheck").addEventListener("change", () => {
    const enabled = element("operatorSelfCheck").checked;
    element("selfCheckNotesWrap").classList.toggle("d-none", !enabled);
    element("selfCheckNotes").required = enabled;
    if (!enabled) setValue("selfCheckNotes", "");
  });
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
  downtimeRows.addEventListener("change", (event) => {
    if (!event.target.matches("[data-downtime-category]")) return;
    const row = event.target.closest(".production-downtime-row");
    const selected = hmiMaster.downtimes.find((item) => Number(item.id) === Number(event.target.value));
    const sub = row.querySelector("[data-downtime-sub]");
    sub.innerHTML = childOptions(selected);
    sub.disabled = !selected || !(selected.children || []).length;
    row.querySelector("[data-downtime-reason]").required = !selected || !(selected.children || []).length;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    refreshGoodQty();
    refreshCoilPhases();
    const downtimes = collectDowntimes();
    const coilPhases = collectCoilPhases();
    if (!coilPhases.length || coilPhases.some((row) => !row.inputLotNumber || row.qtyGood + row.qtyReject <= 0 || (row.qtyInput > 0 && row.qtyGood + row.qtyReject > row.qtyInput))) {
      show("Setiap phase wajib memiliki lot coil, hasil OK/NG, dan output tidak boleh melebihi qty input.");
      return;
    }
    const invalidNgPhase = coilPhases.find((row) => {
      const allocated = row.ngReasons.reduce((sum, reason) => sum + Number(reason.qtyNg || 0), 0);
      return row.qtyReject > 0
        ? !row.ngReasons.length || row.ngReasons.some((reason) => !reason.reason || reason.qtyNg <= 0) || Math.abs(allocated - row.qtyReject) > 0.000001
        : row.ngReasons.length > 0;
    });
    if (invalidNgPhase) {
      show("Setiap Qty NG wajib dibagi ke satu atau beberapa reason pada phase yang sama; total qty reason harus sama dengan Qty NG.");
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
    if (element("operatorSelfCheck").checked && !value("selfCheckNotes")) {
      show("Catatan pemeriksaan operator wajib diisi ketika antrean QC hasil OK dilewati.");
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
      qualityCheckMode: element("operatorSelfCheck").checked ? "OPERATOR_SELF_CHECK" : "SEPARATE_QC",
      selfCheckNotes: element("operatorSelfCheck").checked ? value("selfCheckNotes") : null,
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
      show(`Production Entry ${logNumber} berhasil disimpan.`, "success");
      setTimeout(() => location.assign(`/modules/production/production-logs/${encodeURIComponent(logNumber)}`), 500);
    } catch (error) {
      show(error.message);
      submitButton.disabled = false;
      submitButton.textContent = "Simpan Production Entry";
    }
  });

  async function loadHmiReasons() {
    try {
      const payload = await api("/modules/api/production/production-logs/hmi-reasons");
      hmiMaster.rejections = Array.isArray(payload.rejections) ? payload.rejections : [];
      hmiMaster.downtimes = Array.isArray(payload.downtimes) ? payload.downtimes : [];
      const notice = element("hmi-master-status");
      if (notice && !hmiMaster.rejections.length && !hmiMaster.downtimes.length) {
        notice.textContent = "Master NG dan downtime aktif belum tersedia. Kelola master sebelum memilih reason; input manual tetap tersedia.";
        notice.classList.remove("d-none");
      }
    } catch (error) {
      hmiMaster.rejections = [];
      hmiMaster.downtimes = [];
      const notice = element("hmi-master-status");
      if (notice) {
        notice.textContent = `Master reason ERP gagal dimuat: ${error.message}. Muat ulang halaman sebelum memilih master.`;
        notice.classList.remove("d-none");
      }
    }
  }

  setValue("logDate", localDate());
  Promise.resolve()
    .then(loadHmiReasons)
    .then(() => { if (mode !== "edit") addCoilPhase(); })
    .then(loadSchedules)
    .then(loadEditRecord)
    .catch((error) => show(error.message));
})();
