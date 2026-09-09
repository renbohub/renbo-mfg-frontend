(function dailyProductionPlanPage() {
  const configNode = document.getElementById("dpp-config");
  if (!configNode || !window.PpicDailyPlanModel) return;
  const config = JSON.parse(configNode.textContent || "{}");
  const model = window.PpicDailyPlanModel;
  const productionMode = config.role === "PRODUCTION";
  const state = { date: config.initialDate, workspace: null, machines: [], selected: null, selectedException: null, selectedMachine: "ALL", hourRange: "07-07", scheduleClipboard: null, moving: false, autoSelectNearest: productionMode && !new URLSearchParams(window.location.search).has("date") };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const fmt = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0));
  const todayKey = () => { const date = (globalThis.erpBusinessNow?.() || new Date()); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
  const addDays = (key, days) => { const date = new Date(`${key}T00:00:00`); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

  async function request(url, options = {}) {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const response = await fetch(url, { credentials: "same-origin", ...options, headers: { ...model.requestHeaders(token), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.message || `Request gagal (${response.status})`), { payload });
    return payload;
  }

  function notify(message, tone = "warning") {
    const node = $("dpp-alert");
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || "";
    node.style.background = tone === "error" ? "#ffe1e1" : tone === "success" ? "#dcf8e9" : "#fff0c7";
    node.style.color = tone === "error" ? "#9d2020" : tone === "success" ? "#087643" : "#7d4c00";
  }

  function actualSummary(item) {
    return (item.productionLogs || []).reduce((sum, log) => ({
      produced: sum.produced + Number(log.qtyProduced || 0),
      good: sum.good + Number(log.qtyGood || 0),
      ng: sum.ng + Number(log.qtyReject || 0) + Number(log.qtyRework || 0),
      downtime: sum.downtime + Number(log.downtime || 0),
    }), { produced: 0, good: 0, ng: 0, downtime: 0 });
  }

  function renderRuler(startTime, endTime) {
    const ticks = model.buildHourTicks(startTime, endTime, 60);
    return `<div class="dpp-ruler"><div class="dpp-ruler-label">MACHINE / OPERATION</div><div class="dpp-hours" style="grid-template-columns:repeat(${Math.max(1, ticks.length - 1)},var(--dpp-hour))">${ticks.slice(0, -1).map((tick, index) => `<div class="dpp-hour">${esc(tick)}<small>${index === ticks.length - 2 ? esc(ticks[index + 1]) : ""}</small></div>`).join("")}</div></div>`;
  }

  function renderEmptyState(machineLabel = "Semua Mesin") {
    if (!productionMode) return '<div class="dpp-empty">Belum ada allocation Daily Plan. Buat allocation dari Monthly Plan atau pilih tanggal lain.</div>';
    const handoff = state.workspace?.handoff;
    if (!handoff) return `<div class="dpp-empty">Belum ada Daily Plan Released untuk ${esc(machineLabel)} pada tanggal ini.</div>`;
    const meta = [
      handoff.planNumber ? `${esc(handoff.planNumber)} · ${esc(handoff.planStatus || handoff.revisionStatus || handoff.scheduleStatus || "")}` : "",
      Number.isFinite(Number(handoff.allocationCount)) ? `${fmt(handoff.allocationCount)} allocation` : "",
      Number.isFinite(Number(handoff.moCount)) ? `${fmt(handoff.moCount)} MO` : "",
    ].filter(Boolean).join(" · ");
    return `<div class="dpp-empty-handoff" role="status">
      <div class="dpp-empty-handoff-mark" aria-hidden="true"><span>PPIC</span><b>→</b><span>PROD</span></div>
      <div class="dpp-empty-handoff-copy"><small>MENUNGGU HANDOFF</small><strong>${esc(handoff.title || "Daily Plan belum Released")}</strong><p>${esc(handoff.message || "Production hanya menampilkan jadwal yang sudah Released.")}</p>${meta ? `<span>${meta}</span>` : ""}</div>
      ${handoff.actionUrl ? `<a class="dpp-button primary" href="${esc(handoff.actionUrl)}">${esc(handoff.actionLabel || "Buka PPIC")}&nbsp; →</a>` : ""}
    </div>`;
  }

  function fallbackTime(item, index) {
    if (item.plannedStartTime && item.plannedEndTime) return item;
    const start = 7 * 60 + index * 60;
    return { ...item, plannedStartTime: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`, plannedEndTime: `${String(Math.floor((start + 50) / 60)).padStart(2, "0")}:${String((start + 50) % 60).padStart(2, "0")}`, displayOnlyPlacement: true };
  }

  function displayMergeKey(item = {}) {
    return [
      String(item.scheduleDate || "").slice(0, 10),
      item.machineId || "UNASSIGNED",
      item.partCode || item.partId || "PART",
      item.processId || item.mbomProcessId || "PROCESS",
      item.moId || item.moNumber || "MO",
      item.woId || item.woNumber || "WO",
      item.uomCode || "UOM",
      item.status || "Draft",
    ].map(String).join("|");
  }

  function mergeDisplaySchedules(schedules = []) {
    // Production execution keeps every DPS record individually actionable.
    // The aggregation is a PPIC planning view only; release/audit lineage is
    // never hidden from the operator who records actual output.
    if (productionMode) return schedules;
    const byMachine = new Map();
    schedules.forEach((item) => {
      const key = String(item.machineId || item.machineCode || "UNASSIGNED");
      const rows = byMachine.get(key) || [];
      rows.push(item);
      byMachine.set(key, rows);
    });
    const result = [];
    byMachine.forEach((rows) => {
      const ordered = [...rows].sort((left, right) =>
        String(left.scheduleDate || "").localeCompare(String(right.scheduleDate || ""))
        || Number(model.toMinute(left.plannedStartTime) || 0) - Number(model.toMinute(right.plannedStartTime) || 0)
        || Number(left.sequence || 0) - Number(right.sequence || 0));
      ordered.forEach((item) => {
        const previous = result[result.length - 1];
        const previousEnd = model.toMinute(previous?.plannedEndTime);
        const currentStart = model.toMinute(item.plannedStartTime);
        const mergeable = previous
          && displayMergeKey(previous) === displayMergeKey(item)
          && previousEnd != null && currentStart != null
          && currentStart >= previousEnd && currentStart - previousEnd <= 15;
        if (!mergeable) {
          result.push({ ...item, _sourceItems: [item], _sourceIds: [item.id] });
          return;
        }
        const sourceItems = [...(previous._sourceItems || [previous]), item];
        previous._displayMerged = true;
        previous._sourceItems = sourceItems;
        previous._sourceIds = sourceItems.map((row) => row.id);
        previous.plannedQty = sourceItems.reduce((sum, row) => sum + Number(row.plannedQty || 0), 0);
        previous.actualQty = sourceItems.reduce((sum, row) => sum + Number(row.actualQty || 0), 0);
        previous.productionLogs = sourceItems.flatMap((row) => row.productionLogs || []);
        previous.plannedEndTime = item.plannedEndTime;
        previous.scheduleNumber = `${sourceItems[0].scheduleNumber} + ${sourceItems.length - 1}`;
      });
    });
    return result;
  }

  function renderMatrix() {
    const workspace = state.workspace || {};
    const schedules = mergeDisplaySchedules(workspace.schedules || []);
    const groups = model.groupByMachine(schedules);
    const timeline = model.timelineWindow(schedules, { dayStart: "07:00", dayEnd: "07:00" });
    const { startTime, endTime, hourCount } = timeline;
    const matrix = $("dpp-matrix");
    matrix.style.minWidth = `calc(var(--dpp-label) + var(--dpp-hour) * ${hourCount})`;
    if (!groups.length) { matrix.innerHTML = `${renderRuler(startTime, endTime)}${renderEmptyState()}`; return; }
    const rows = groups.map((group) => {
      const blocks = group.items.map((raw, index) => {
        const item = fallbackTime(raw, index);
        const placement = model.blockPlacement(item, { startTime, endTime });
        const actual = actualSummary(item);
        const progress = Math.min(100, Number(item.plannedQty) > 0 ? actual.good / Number(item.plannedQty) * 100 : 0);
        const risk = actual.ng > 0 || actual.downtime > 0 || item.lateRisk === "LATE";
        const css = item.status === "Completed" ? "completed" : item.status === "In Progress" ? "running" : risk ? "risk" : "";
        const displayRange = model.formatOperationalRange(item);
        return `<button class="dpp-block ${css}" data-schedule-id="${esc(item.id)}" style="left:${placement.leftPercent}%;width:${placement.widthPercent}%" title="${esc(item.scheduleNumber)} · ${esc(displayRange)}"><strong>${esc(item.partCode || item.partNumber || "Part")}</strong><span>${fmt(item.plannedQty)} ${esc(item.uomCode || "")}</span><small>${esc(item.processCode || item.processName || "Process")} · ${esc(displayRange)}${item.displayOnlyPlacement ? " · waktu belum disimpan" : ""}</small><i class="dpp-progress" style="width:${progress}%"></i></button>`;
      }).join("");
      const event = (workspace.machineEvents || []).find((row) => row.machineId === group.machineId && row.status === "OPEN");
      return `<div class="dpp-machine-row"><div class="dpp-machine-label"><strong>${esc(group.machineCode)}</strong><span>${esc(group.machineName)} · ${esc(group.lineCode)}</span><small>${event ? "● DOWN / EVENT" : "● AVAILABLE"}</small></div><div class="dpp-track">${blocks}</div></div>`;
    }).join("");
    matrix.innerHTML = renderRuler(startTime, endTime) + rows;
    matrix.querySelectorAll("[data-schedule-id]").forEach((node) => node.addEventListener("click", () => openItem(schedules.find((item) => item.id === node.dataset.scheduleId))));
  }

  function matrixHourWindow() {
    return model.matrixHourWindow(state.hourRange || "07-07");
  }

  function scheduleHourRange(item, windowStart, windowEnd) {
    return model.scheduleHourRange(item, windowStart, windowEnd);
  }

  function canEditPreviewAllocation(item) {
    return !productionMode
      && Boolean(state.workspace?.revision?.allocationPreview)
      && Boolean(item?.sourceAllocationPreview)
      && item.sourceAllocationEditable !== false
      && String(item.sourceAllocationStatus || "Draft") === "Draft";
  }

  function canDirectEdit(item) {
    if (item?._displayMerged) return false;
    const revisionEditable = !productionMode
      && model.canEditRevision(state.workspace?.revision?.status)
      && Boolean(state.workspace?.revision?.id)
      && !state.workspace?.revision?.allocationPreview
      && String(item?.status || "Draft") === "Draft";
    return revisionEditable || canEditPreviewAllocation(item);
  }

  function renderMachineTabs(groups) {
    const tabs = $("dpp-machine-tabs");
    if (!tabs) return;
    const valid = new Set(groups.map((group) => String(group.machineId || group.machineCode)));
    if (state.selectedMachine !== "ALL" && !valid.has(state.selectedMachine)) state.selectedMachine = "ALL";
    tabs.innerHTML = `<button type="button" data-machine="ALL" class="${state.selectedMachine === "ALL" ? "active" : ""}">Semua Mesin <b>${groups.length}</b></button>${groups.map((group) => {
      const key = String(group.machineId || group.machineCode);
      return `<button type="button" data-machine="${esc(key)}" class="${state.selectedMachine === key ? "active" : ""}">${esc(group.machineCode)} <b>${group.items.length}</b></button>`;
    }).join("")}`;
    tabs.querySelectorAll("[data-machine]").forEach((button) => button.addEventListener("click", () => {
      state.selectedMachine = button.dataset.machine;
      renderMachineMatrix();
    }));
  }

  function partIdentity(item, editable) {
    const number = item.partNumber || item.partCode || "Part belum tersedia";
    const name = item.partName || "-";
    const code = item.partCode || "-";
    const exactTime = model.formatOperationalRange(item);
    const meta = [exactTime, code, item.processCode || item.processName || "Process", item._displayMerged ? `${item._sourceItems.length} alokasi · digabung` : null, productionMode ? item.status || "Draft" : null].filter(Boolean).join(" · ");
    const content = `<strong>${esc(number)}</strong><span>${esc(name)}</span><small title="${esc(meta)}">${esc(meta)}</small>`;
    const identity = productionMode
      ? `<a class="dpp-part-link" href="/modules/production/daily-production-schedules/${encodeURIComponent(item.scheduleNumber || item.id)}">${content}</a>`
      : `<button type="button" class="dpp-part-link" data-open-schedule="${esc(item.id)}">${content}</button>`;
    const releaseAction = !productionMode && ["Released", "In Progress", "Completed"].includes(item.status)
      ? `<span class="dpp-item-release-status">${esc(item.status)}</span>`
      : "";
    return `<div class="dpp-part-actions">${identity}${editable ? `<button type="button" class="dpp-copy-schedule" data-copy-schedule="${esc(item.id)}" title="Salin jadwal untuk dipindahkan">COPY</button>` : ""}${releaseAction}</div>`;
  }

  function parentIdentity(item) {
    const number = item.fgParentNumber || item.fgParentCode || "-";
    const name = item.fgParentName || "";
    const code = item.fgParentCode || "-";
    return `<strong>${esc(number)}</strong>${name ? `<span>${esc(name)}</span>` : ""}<small>${esc(code)}${item.moNumber ? ` · ${esc(item.moNumber)}` : ""}</small>`;
  }

  function qtyStack(item, editable) {
    const summary = actualSummary(item);
    const plan = Number(item.plannedQty || 0);
    const actual = Math.max(Number(item.actualQty || 0), Number(summary.good || 0));
    const shortage = model.shortageQty(plan, actual);
    return `<button type="button" class="dpp-qty-stack" data-open-schedule="${esc(item.id)}" ${editable ? `draggable="true" data-drag-schedule="${esc(item.id)}"` : ""} title="${esc(item.plannedStartTime || "-")}–${esc(item.plannedEndTime || "-")}${editable ? " · drag untuk geser" : ""}"><span class="plan"><b>PLAN</b><strong>${fmt(plan)}</strong></span><span class="actual"><b>ACT</b><strong>${fmt(actual)}</strong></span><span class="shortage"><b>SHT</b><strong>${shortage == null ? "" : fmt(shortage)}</strong></span></button>`;
  }

  function renderScheduleRow(item, window, targetMachineId) {
    const editable = canDirectEdit(item);
    const scheduled = scheduleHourRange(item, window.start, window.end);
    const dropAttrs = (hour) => editable ? ` data-drop-minute="${hour.minute}" data-drop-machine="${esc(targetMachineId || item.machineId || "")}"` : "";
    const hourCells = window.hours.map((hour) => {
      if (!scheduled) return `<td class="dpp-hour-cell${editable ? " drop-ready" : ""}"${dropAttrs(hour)}></td>`;
      const hourState = model.scheduleHourState(item, hour.minute, window.start, window.end);
      if (hourState === "start") return `<td class="dpp-hour-cell start${editable ? " drop-ready" : ""}"${dropAttrs(hour)}>${qtyStack(item, editable)}</td>`;
      if (hourState === "occupied") return `<td class="dpp-hour-cell occupied${editable ? " drop-ready" : ""}"${dropAttrs(hour)} title="Mesin teralokasi ${esc(model.formatOperationalRange(item))}"><span></span></td>`;
      return `<td class="dpp-hour-cell${editable ? " drop-ready" : ""}"${dropAttrs(hour)}></td>`;
    }).join("");
    const riskClass = Number(item.plannedQty || 0) > 0 && Math.max(Number(item.actualQty || 0), actualSummary(item).good) < Number(item.plannedQty || 0) ? " has-shortage" : "";
    const copiedClass = state.scheduleClipboard?.id === item.id ? " is-copied" : "";
    return `<tr class="dpp-schedule-row status-${esc(String(item.status || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-"))}${riskClass}${copiedClass}" data-row-schedule="${esc(item.id)}"><td class="dpp-part-cell">${partIdentity(item, editable)}</td><td class="dpp-parent-cell">${parentIdentity(item)}</td>${hourCells}</tr>`;
  }

  function copySchedule(item) {
    if (!item || !canDirectEdit(item)) return;
    state.scheduleClipboard = item;
    document.querySelectorAll(".dpp-schedule-row").forEach((row) => row.classList.toggle("is-copied", row.dataset.rowSchedule === item.id));
    notify(`${item.scheduleNumber} disalin. Klik cell jam tujuan atau drag qty ke jam baru; planned qty tidak diduplikasi.`, "success");
  }

  async function releaseAll() {
    const revision = state.workspace?.revision;
    const draftSchedules = (state.workspace?.schedules || []).filter((item) => String(item.status || "Draft") === "Draft");
    if (productionMode || state.moving || !revision?.id || !["Ready", "Partially Released"].includes(String(revision.status || "")) || !draftSchedules.length) return;
    if (!await window.confirmAction(`Release ${draftSchedules.length} operation Draft pada ${state.date} ke Production sekaligus?`, { title: "Release Semua Daily Plan", confirmLabel: `Release ${draftSchedules.length} Operation` })) return;
    const warnings = state.workspace?.validation?.warnings || [];
    const warningReason = warnings.length
      ? await window.formPrompt(`Daily Plan memiliki ${warnings.length} warning. Isi satu acknowledgement untuk seluruh operation yang akan direlease:`, "PPIC menyetujui release; kesiapan material akan divalidasi sebelum material issue dan produksi.", { title: "Acknowledgement Warning" })
      : "";
    if (warnings.length && !String(warningReason || "").trim()) return;
    state.moving = true;
    try {
      const result = await request(model.apiPath(`planning-ppic/daily-plan/revisions/${encodeURIComponent(revision.id)}/release`), {
        method: "POST",
        body: JSON.stringify({ expectedVersion: revision.version, warningReason }),
      });
      await load();
      notify(`${Number(result.releasedCount || draftSchedules.length)} operation sudah Released ke Production dalam satu proses.`, "success");
      window.PpicWorkflow?.refresh(state.date.slice(0, 7));
    } catch (error) { notify(error.message, "error"); }
    finally { state.moving = false; }
  }

  async function rescheduleItem(item, targetMinute, targetMachineId) {
    if (!item || !canDirectEdit(item) || state.moving) return;
    const shifted = model.shiftScheduleTime(item, Number(targetMinute));
    if (!shifted) { notify("Jadwal belum memiliki jam mulai dan selesai yang valid.", "error"); return; }
    state.moving = true;
    try {
      if (canEditPreviewAllocation(item)) {
        await updatePreviewAllocation(item, {
          plannedStartTime: shifted.plannedStartTime,
          plannedEndTime: shifted.plannedEndTime,
        });
      } else {
        const changes = { plannedStartTime: shifted.plannedStartTime, plannedEndTime: shifted.plannedEndTime };
        if (targetMachineId && targetMachineId !== item.machineId) changes.machineId = targetMachineId;
        await request(model.apiPath(`planning-ppic/daily-plan/revisions/${encodeURIComponent(state.workspace.revision.id)}/items/${encodeURIComponent(item.id)}`), { method: "PATCH", body: JSON.stringify({ expectedVersion: state.workspace.revision.version, changes }) });
      }
      state.scheduleClipboard = null;
      notify(`${item.scheduleNumber} digeser ke ${model.formatOperationalRange(shifted)}.`, "success");
      await load();
    } catch (error) { notify(error.message, "error"); }
    finally { state.moving = false; }
  }

  function bindDirectScheduling(schedules, matrix) {
    matrix.querySelectorAll("[data-open-schedule]").forEach((node) => node.addEventListener("click", () => openItem(schedules.find((item) => item.id === node.dataset.openSchedule))));
    matrix.querySelectorAll("[data-copy-schedule]").forEach((node) => node.addEventListener("click", (event) => { event.stopPropagation(); copySchedule(schedules.find((item) => item.id === node.dataset.copySchedule)); }));
    matrix.querySelectorAll("[data-drag-schedule]").forEach((node) => {
      node.addEventListener("dragstart", (event) => { const item = schedules.find((row) => row.id === node.dataset.dragSchedule); if (!item) return; state.scheduleClipboard = item; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); node.closest("tr")?.classList.add("is-dragging"); });
      node.addEventListener("dragend", () => node.closest("tr")?.classList.remove("is-dragging"));
    });
    matrix.querySelectorAll("[data-drop-minute]").forEach((cell) => {
      cell.addEventListener("dragover", (event) => { if (!canDirectEdit(state.scheduleClipboard)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; cell.classList.add("drag-over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
      cell.addEventListener("drop", (event) => { event.preventDefault(); cell.classList.remove("drag-over"); const id = event.dataTransfer.getData("text/plain") || state.scheduleClipboard?.id; const item = schedules.find((row) => row.id === id); rescheduleItem(item, cell.dataset.dropMinute, cell.dataset.dropMachine); });
      cell.addEventListener("click", (event) => { if (!state.scheduleClipboard || event.target.closest("button")) return; rescheduleItem(state.scheduleClipboard, cell.dataset.dropMinute, cell.dataset.dropMachine); });
    });
  }

  function renderMachineMatrix() {
    const workspace = state.workspace || {};
    const schedules = mergeDisplaySchedules(workspace.schedules || []);
    const groups = model.groupByMachine(schedules);
    state.machines = groups;
    renderMachineTabs(groups);
    const window = matrixHourWindow();
    const selectedGroups = state.selectedMachine === "ALL" ? groups : groups.filter((group) => String(group.machineId || group.machineCode) === state.selectedMachine);
    const machineLabel = state.selectedMachine === "ALL" ? "Semua Mesin" : selectedGroups[0]?.machineCode || "Mesin";
    const matrix = $("dpp-matrix");
    const columns = 2 + window.hours.length;
    const header = `<thead><tr><th class="dpp-part-head">Part FG</th><th class="dpp-parent-head">FG Parent</th>${window.hours.map((hour) => `<th class="dpp-hour-head${hour.minute >= 1440 ? " next-day" : ""}"><strong>${esc(hour.label)}</strong><small>00</small>${hour.minute >= 1440 ? "<em>+1</em>" : ""}</th>`).join("")}</tr></thead>`;
    const body = selectedGroups.map((group) => {
      const event = (workspace.machineEvents || []).find((row) => row.machineId === group.machineId && row.status === "OPEN");
      const machineHeader = state.selectedMachine === "ALL" ? `<tr class="dpp-machine-section"><th colspan="${columns}"><div><strong>${esc(group.machineCode)}</strong><span>${esc(group.machineName)} · ${esc(group.lineCode || "-")}</span><small class="${event ? "down" : "ready"}">${event ? "● DOWN / EVENT" : "● AVAILABLE"}</small></div></th></tr>` : "";
      return machineHeader + group.items.map((item) => renderScheduleRow(item, window, group.machineId)).join("");
    }).join("");
    matrix.style.width = `${440 + window.hours.length * 88}px`;
    matrix.style.minWidth = "100%";
    matrix.innerHTML = `<table class="dpp-production-matrix" data-enterprise-table="off">${header}<tbody>${body || `<tr><td colspan="${columns}" class="dpp-empty-cell">${renderEmptyState(machineLabel)}</td></tr>`}</tbody></table>`;
    bindDirectScheduling(schedules, matrix);
    $("dpp-caption").textContent = `${new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${state.date}T00:00:00`))} · ${machineLabel}`;
  }

  function renderQueues() {
    const schedules = state.workspace?.schedules || [];
    const unscheduled = schedules.filter((item) => !item.plannedStartTime || !item.plannedEndTime);
    $("dpp-unscheduled-count").textContent = String(unscheduled.length);
    $("dpp-unscheduled").innerHTML = unscheduled.length ? unscheduled.map((item) => `<div class="dpp-list-item"><div><strong>${esc(item.partCode || "Part")} · ${fmt(item.plannedQty)} ${esc(item.uomCode || "")}</strong><span>${esc(item.machineCode || "Mesin belum dipilih")} · ${esc(item.processCode || "Process")}</span></div>${!productionMode ? `<button data-open-id="${esc(item.id)}" type="button">Tempatkan</button>` : ""}</div>`).join("") : `<p class="dpp-muted">Semua allocation sudah memiliki jam mulai dan selesai.</p>`;
    $("dpp-unscheduled").querySelectorAll("[data-open-id]").forEach((node) => node.addEventListener("click", () => openItem(schedules.find((item) => item.id === node.dataset.openId))));
    const exceptions = state.workspace?.exceptions || [];
    $("dpp-exception-count").textContent = String(exceptions.length);
    $("dpp-exceptions").innerHTML = exceptions.length ? exceptions.map((item, index) => `<div class="dpp-list-item"><div><strong>${esc(item.exceptionType)} · ${esc(item.partCode || item.machineId || "-")}</strong><span>${esc(item.severity)} · ${fmt(item.qty)} ${esc(item.uomCode || "")} · ${esc(item.state)}</span></div>${!productionMode && item.action === "ALLOCATE_NEXT_DRAFT" ? `<button data-allocate-exception="${index}" type="button">Alokasikan Selanjutnya</button>` : ""}</div>`).join("") : `<p class="dpp-muted">Belum ada exception aktual untuk Planning Selanjutnya.</p>`;
    $("dpp-exceptions").querySelectorAll("[data-allocate-exception]").forEach((node) => node.addEventListener("click", () => {
      state.selectedException = exceptions[Number(node.dataset.allocateException)];
      const minimum = addDays(String(state.selectedException.planDate || state.date).slice(0, 10), 1);
      $("dpp-shortfall-date").min = minimum;
      $("dpp-shortfall-date").value = minimum;
      $("dpp-shortfall-summary").textContent = `${state.selectedException.partCode || "Part"} · ${fmt(state.selectedException.qty)} ${state.selectedException.uomCode || ""}`;
      $("dpp-shortfall-dialog").showModal();
    }));
  }

  function renderSummary() {
    const workspace = state.workspace || { schedules: [], validation: {}, revision: {} };
    const schedules = workspace.schedules || [];
    const groups = model.groupByMachine(schedules);
    const actual = schedules.reduce((sum, item) => {
      const row = actualSummary(item);
      const good = Math.max(Number(item.actualQty || 0), Number(row.good || 0));
      return { good: sum.good + good, shortage: sum.shortage + Number(model.shortageQty(item.plannedQty, good) || 0) };
    }, { good: 0, shortage: 0 });
    $("dpp-kpi-machines").textContent = String(groups.length);
    $("dpp-kpi-qty").textContent = fmt(schedules.reduce((sum, item) => sum + Number(item.plannedQty || 0), 0));
    $("dpp-kpi-items").textContent = `${schedules.length} operation · ${Number(workspace.revision?.releasedCount || 0)} released`;
    if ($("dpp-kpi-blockers")) $("dpp-kpi-blockers").textContent = String(workspace.validation?.blockers?.length || 0);
    if ($("dpp-kpi-exceptions")) $("dpp-kpi-exceptions").textContent = String(workspace.exceptions?.length || 0);
    if ($("dpp-kpi-good")) $("dpp-kpi-good").textContent = fmt(actual.good);
    if ($("dpp-kpi-ng")) $("dpp-kpi-ng").textContent = fmt(actual.shortage);
    const badge = $("dpp-revision-badge");
    const mode = model.workspaceMode({ date: state.date, today: todayKey(), status: workspace.revision?.status });
    const allocationPreview = Boolean(workspace.revision?.allocationPreview);
    const previewPlan = schedules.find((item) => item.monthlyProductionPlanNumber)?.monthlyProductionPlanNumber || null;
    const previewPlanStatus = schedules.find((item) => item.monthlyProductionPlanStatus)?.monthlyProductionPlanStatus || null;
    badge.textContent = productionMode
      ? `${mode.scope} · EXECUTION QUEUE`
      : allocationPreview
        ? `${previewPlan || "MONTHLY PLAN"} · ${String(previewPlanStatus || "Draft").toUpperCase()} · PREVIEW`
        : `${workspace.revision?.revisionNumber || "DAILY PLAN"} · ${String(workspace.revision?.status || "Draft").toUpperCase()} · ${Number(workspace.revision?.releasedCount || 0)}/${Number(workspace.revision?.itemCount || schedules.length)} RELEASED`;
    badge.className = `dpp-revision-badge ${String(allocationPreview ? (previewPlanStatus === "Confirmed" ? "ready" : previewPlanStatus || "draft") : workspace.revision?.status || "draft").toLowerCase()}`;
    $("dpp-caption").textContent = `${new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${state.date}T00:00:00`))} · ${mode.label}`;
    if ($("dpp-day-label")) $("dpp-day-label").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(new Date(`${state.date}T00:00:00`));
    const editable = !productionMode && model.canEditRevision(workspace.revision?.status) && Boolean(workspace.revision?.id);
    const sourcePlanNumber = schedules.find((item) => item.monthlyProductionPlanNumber)?.monthlyProductionPlanNumber || null;
    const editorUrl = model.monthlyEditorUrl({ date: state.date, planNumber: sourcePlanNumber });
    const timeline = model.timelineWindow(schedules, { dayStart: "07:00", dayEnd: "23:00" });
    const firstTimedItem = schedules.filter((item) => item.plannedStartTime).sort((left, right) => model.toMinute(left.plannedStartTime) - model.toMinute(right.plannedStartTime))[0];
    const scheduleNote = $("dpp-schedule-note");
    if (scheduleNote) {
      scheduleNote.hidden = !timeline.startsAfterFirstShift;
      scheduleNote.textContent = timeline.startsAfterFirstShift ? `Alokasi mulai ${firstTimedItem?.plannedStartTime || "malam"} mengikuti netting JIT OR-Tools. Untuk allocation Draft, copy lalu klik jam tujuan, drag jadwal di matrix, atau ubah jam melalui popup.` : "";
    }
    if (allocationPreview) {
      const nextAction = previewPlanStatus === "Confirmed"
        ? "Release Monthly Plan, buat MO reference, bentuk Daily Plan, lalu Cek Kesiapan dan Release ke Production."
        : previewPlanStatus === "Released"
          ? "Pastikan MO reference sudah dibuat, bentuk Daily Plan, lalu Cek Kesiapan dan Release ke Production."
          : "Confirm dan Release Monthly Plan sebelum membentuk Daily Plan.";
      $("dpp-subtitle").textContent = schedules.some(canEditPreviewAllocation) ? "Preview Monthly Plan Draft · jam ditampilkan sesuai menit aktual dan dapat digeser dari matrix." : "Preview allocation sumber; belum menjadi Daily Production Schedule.";
      notify(`Status saat ini: ${previewPlan || "Monthly Plan"} ${String(previewPlanStatus || "Draft").toUpperCase()} · allocation DRAFT · Daily Plan BELUM DIBUAT. ${nextAction}`);
    }
    else if (productionMode) $("dpp-subtitle").textContent = "Draft tampil untuk persiapan; eksekusi hanya dapat dimulai setelah Released. Klik part untuk membuka detail DPS.";
    else if (!workspace.revision?.id && schedules.length) $("dpp-subtitle").textContent = "Schedule Draft legacy · rapikan placement bila perlu, lalu klik Buat Draft untuk membentuk revision PPIC.";
    else $("dpp-subtitle").textContent = editable ? "Draft aktif · drag qty ke jam baru, atau tekan COPY lalu klik cell jam tujuan. Rentang hari 07:00 sampai 07:00 besok." : "Klik alokasi untuk melihat detail. Revision Released tetap read-only.";
    const editAction = $("dpp-edit-allocation");
    if (editAction) {
      editAction.hidden = productionMode;
      editAction.href = allocationPreview && schedules.some(canEditPreviewAllocation) ? "#dpp-matrix" : allocationPreview ? editorUrl : "#dpp-matrix";
      editAction.textContent = allocationPreview && schedules.some(canEditPreviewAllocation) ? "↔ Geser Jam Alokasi" : allocationPreview ? "✎ Buka Monthly Plan" : editable ? "↔ Drag / Copy Jadwal" : "Lihat Alokasi";
    }
    if ($("dpp-direct-edit-badge")) $("dpp-direct-edit-badge").hidden = !(editable || schedules.some(canEditPreviewAllocation));
    if ($("dpp-auto-correct")) $("dpp-auto-correct").disabled = productionMode || !schedules.length || !(allocationPreview || ["Draft", "Ready", "Partially Released"].includes(workspace.revision?.status));
    if ($("dpp-validate")) {
      $("dpp-validate").disabled = !editable;
      $("dpp-validate").textContent = ["Ready", "Partially Released"].includes(workspace.revision?.status) ? "↻ Cek Ulang Kesiapan" : "Cek Kesiapan";
    }
    if ($("dpp-release-all")) {
      const draftCount = schedules.filter((item) => String(item.status || "Draft") === "Draft").length;
      const releaseReady = !productionMode && Boolean(workspace.revision?.id) && ["Ready", "Partially Released"].includes(workspace.revision?.status) && draftCount > 0;
      $("dpp-release-all").hidden = allocationPreview || !workspace.revision?.id || workspace.revision?.status === "Released";
      $("dpp-release-all").disabled = !releaseReady || state.moving;
      $("dpp-release-all").textContent = draftCount ? `Release Semua (${draftCount})` : "Release Semua";
    }
    if ($("dpp-draft")) { $("dpp-draft").hidden = allocationPreview || (Boolean(workspace.revision?.id) && ["Draft", "Ready", "Partially Released"].includes(workspace.revision?.status)); $("dpp-draft").textContent = workspace.revision?.status === "Released" ? "Buat Revisi" : "Buat Draft"; }
    document.querySelectorAll("[data-scope]").forEach((node) => node.classList.toggle("active", node.dataset.scope === mode.scope.toLowerCase()));
  }

  function openItem(item) {
    if (!item) return;
    state.selected = item;
    const editable = !item._displayMerged && !productionMode && model.canEditRevision(state.workspace?.revision?.status) && Boolean(state.workspace?.revision?.id) && String(item.status || "Draft") === "Draft";
    $("dpp-dialog-title").textContent = `${item.partCode || item.partNumber || "Part"} · ${item.scheduleNumber}`;
    const actual = actualSummary(item);
    const preview = Boolean(state.workspace?.revision?.allocationPreview || item.sourceAllocationPreview);
    const sourceEdit = $("dpp-dialog-source-edit");
    if (sourceEdit) {
      sourceEdit.hidden = productionMode || !preview;
      sourceEdit.href = model.monthlyEditorUrl({ date: state.date, planNumber: item.monthlyProductionPlanNumber });
    }
    if (productionMode) {
      $("dpp-dialog-body").innerHTML = `<label>Mesin<input value="${esc(item.machineCode || "-")}" readonly></label><label>Waktu Plan<input value="${esc(model.formatOperationalRange(item))}" readonly></label><label>Target<input value="${fmt(item.plannedQty)} ${esc(item.uomCode || "")}" readonly></label><label>Good / NG<input value="${fmt(actual.good)} / ${fmt(actual.ng)}" readonly></label><label class="span-2">Process<input value="${esc(item.processCode || "-")} · ${esc(item.processName || "-")}" readonly></label>`;
      const logLink = $("dpp-production-log");
      if (logLink) {
        const productionEntryReady = ["In Progress", "Completed"].includes(item.status) && state.date === todayKey();
        logLink.href = productionEntryReady
          ? `/modules/production/production-logs/new?dpsId=${encodeURIComponent(item.id)}&scheduleNumber=${encodeURIComponent(item.scheduleNumber)}`
          : `/modules/production/daily-production-schedules/${encodeURIComponent(item.scheduleNumber)}`;
        logLink.textContent = productionEntryReady ? "Buka Production Entry" : "Buka Detail DPS";
        logLink.hidden = false;
      }
      if ($("dpp-prepare")) $("dpp-prepare").hidden = item.status !== "Released" || state.date !== todayKey();
      if ($("dpp-start")) $("dpp-start").hidden = item.status !== "Released" || state.date !== todayKey();
      if ($("dpp-breakdown")) $("dpp-breakdown").hidden = state.date !== todayKey();
    } else {
      const previewEditable = !item._displayMerged && preview && canEditPreviewAllocation(item);
      const timeEditable = editable || previewEditable;
      const mergedMessage = item._displayMerged
        ? `<div class="span-2 dpp-alert dpp-alert-editable"><b>${item._sourceItems.length} alokasi identik digabung untuk operator</b><span>Total ${fmt(item.plannedQty)} ${esc(item.uomCode || "")} · ${esc(model.formatOperationalRange(item))}. Lineage allocation asli tetap tersimpan untuk audit.</span></div>`
        : "";
      const previewMessage = previewEditable
        ? '<div class="span-2 dpp-alert dpp-alert-editable"><b>Allocation Monthly Plan Draft</b><span>Ubah jam di sini lalu Simpan. Qty, sequence, mesin, dan catatan tetap mengikuti allocation sumber.</span></div>'
        : preview ? '<div class="span-2 dpp-alert">Allocation Monthly Plan ini sudah terkunci. Buka Monthly Plan untuk melihat sumbernya.</div>' : "";
      $("dpp-dialog-body").innerHTML = `${mergedMessage}${previewMessage}<label>Jam mulai<input id="dpp-edit-start" type="time" value="${esc(model.toTime(model.toMinute(item.plannedStartTime || "07:00")))}" ${timeEditable ? "" : "disabled"}></label><label>Jam selesai<input id="dpp-edit-end" type="time" value="${esc(model.toTime(model.toMinute(item.plannedEndTime || "08:00")))}" ${timeEditable ? "" : "disabled"}></label><label>Planned Qty<input id="dpp-edit-qty" type="number" min="0.01" step="0.01" value="${esc(item.plannedQty)}" ${editable ? "" : "disabled"}></label><label>Sequence<input id="dpp-edit-sequence" type="number" min="0" step="1" value="${esc(item.sequence || 0)}" ${editable ? "" : "disabled"}></label><label class="span-2">Catatan<textarea id="dpp-edit-notes" rows="3" ${editable ? "" : "disabled"}>${esc(item.notes || "")}</textarea></label>`;
      $("dpp-dialog-save").hidden = !timeEditable;
      $("dpp-dialog-save").textContent = previewEditable ? "Simpan Jam Alokasi" : "Simpan Perubahan";
    }
    $("dpp-dialog").showModal();
  }

  async function updatePreviewAllocation(item, timeChanges = {}) {
    const planNumber = item?.monthlyProductionPlanNumber;
    if (!planNumber || !item?.id) throw new Error("Referensi Monthly Plan allocation tidak lengkap.");
    return request(model.apiPath(`planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/manual-allocations/${encodeURIComponent(item.id)}`), {
      method: "PATCH",
      body: JSON.stringify({
        scheduleDate: state.date,
        shift: String(item.shift || "1"),
        plannedStartTime: timeChanges.plannedStartTime ?? item.plannedStartTime ?? null,
        plannedEndTime: timeChanges.plannedEndTime ?? item.plannedEndTime ?? null,
        plannedQty: Number(item.plannedQty || 0),
        routingMode: "INHOUSE",
        machineId: item.machineId,
        diesId: item.diesId || null,
        notes: item.notes || null,
        planningMode: item.planningMode || "PRODUCTION",
      }),
    });
  }

  async function load() {
    notify("");
    $("dpp-date").value = state.date;
    try {
      state.workspace = await request(`${model.apiPath("planning-ppic/daily-plan/workspace")}?date=${encodeURIComponent(state.date)}&mode=${productionMode ? "PRODUCTION" : "PPIC"}`);
      if (state.autoSelectNearest && !(state.workspace.schedules || []).length && state.workspace.handoff?.code === "DAILY_SCHEDULE_AVAILABLE" && state.workspace.handoff.nextDate) {
        state.autoSelectNearest = false;
        state.date = state.workspace.handoff.nextDate;
        window.history.replaceState({}, "", `${window.location.pathname}?date=${encodeURIComponent(state.date)}`);
        return load();
      }
      state.autoSelectNearest = false;
      window.history.replaceState({}, "", `${window.location.pathname}?date=${encodeURIComponent(state.date)}`);
      renderSummary(); renderMachineMatrix(); renderQueues();
    } catch (error) {
      notify(error.message, "error");
      $("dpp-matrix").innerHTML = `<div class="dpp-empty">${esc(error.message)}</div>`;
    }
  }

  $("dpp-prev")?.addEventListener("click", () => { state.date = addDays(state.date, -1); load(); });
  $("dpp-next")?.addEventListener("click", () => { state.date = addDays(state.date, 1); load(); });
  $("dpp-date")?.addEventListener("change", (event) => { state.date = event.target.value; load(); });
  $("dpp-hour-range")?.addEventListener("change", (event) => { state.hourRange = event.target.value; renderMachineMatrix(); });
  $("dpp-refresh")?.addEventListener("click", load);
  document.querySelectorAll("[data-scope]").forEach((node) => node.addEventListener("click", () => { state.date = node.dataset.scope === "tomorrow" ? addDays(todayKey(), 1) : todayKey(); load(); }));
  $("dpp-dialog-close")?.addEventListener("click", () => $("dpp-dialog").close());
  $("dpp-dialog-cancel")?.addEventListener("click", () => $("dpp-dialog").close());
  $("dpp-shortfall-close")?.addEventListener("click", () => $("dpp-shortfall-dialog").close());
  $("dpp-shortfall-cancel")?.addEventListener("click", () => $("dpp-shortfall-dialog").close());
  $("dpp-shortfall-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedException?.sourceLogId) return;
    try {
      const targetDate = $("dpp-shortfall-date").value;
      await request(model.apiPath("planning-ppic/daily-plan/execution-shortfalls/allocate"), { method: "POST", body: JSON.stringify({ sourceLogId: state.selectedException.sourceLogId, targetDate }) });
      $("dpp-shortfall-dialog").close();
      notify(`Shortfall ${fmt(state.selectedException.qty)} ${state.selectedException.uomCode || ""} dialokasikan ke Draft ${targetDate}.`, "success");
      state.selectedException = null;
      await load();
    } catch (error) { notify(error.message, "error"); }
  });
  $("dpp-release-all")?.addEventListener("click", releaseAll);
  $("dpp-breakdown")?.addEventListener("click", async () => {
    if (!productionMode || !state.selected?.machineId) return;
    if (state.date !== todayKey()) { notify("Event mesin hanya dapat dicatat pada eksekusi hari ini.", "error"); return; }
    // The execution detail itself is a native dialog. Close it before opening
    // formPrompt so its focus trap cannot steal keyboard input from the
    // breakdown reason field.
    $("dpp-dialog").close();
    const reason = await window.formPrompt(`Alasan ${state.selected.machineCode || "mesin"} berhenti:`, "", { title: "Catat Machine Breakdown" });
    if (!String(reason || "").trim()) return;
    try {
      await request(model.apiPath("production/machine-availability-events"), { method: "POST", body: JSON.stringify({ machineId: state.selected.machineId, eventType: "BREAKDOWN", startedAt: new Date().toISOString(), reason }) });
      notify("Breakdown tercatat dan dikirim ke PPIC Planning Selanjutnya.", "success"); await load();
    } catch (error) { notify(error.message, "error"); }
  });
  $("dpp-prepare")?.addEventListener("click", async () => {
    if (!productionMode || !state.selected) return;
    try {
      const result = await request(model.apiPath(`production/daily-production-schedules/${encodeURIComponent(state.selected.scheduleNumber)}/consume`), { method: "POST", body: "{}" });
      notify(`Material Issue ${result.materialIssue?.issueNumber || "Draft"} sudah disiapkan. Inventory perlu melakukan issue sebelum start.`, "success");
      $("dpp-dialog").close(); await load();
    } catch (error) { notify(error.message, "error"); }
  });
  $("dpp-start")?.addEventListener("click", async () => {
    if (!productionMode || !state.selected) return;
    try {
      await request(model.apiPath(`production-workflow/daily-production-schedules/${encodeURIComponent(state.selected.scheduleNumber)}/start`), { method: "POST", body: "{}" });
      notify("Operation dimulai. Production Entry sekarang dapat dicatat.", "success");
      $("dpp-dialog").close(); await load();
    } catch (error) { notify(error.message, "error"); }
  });
  $("dpp-dialog-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (productionMode || !state.selected) return;
    try {
      const previewEditable = canEditPreviewAllocation(state.selected);
      if (previewEditable) {
        await updatePreviewAllocation(state.selected, { plannedStartTime: $("dpp-edit-start").value, plannedEndTime: $("dpp-edit-end").value });
      } else {
        await request(model.apiPath(`planning-ppic/daily-plan/revisions/${encodeURIComponent(state.workspace.revision.id)}/items/${encodeURIComponent(state.selected.id)}`), { method: "PATCH", body: JSON.stringify({ expectedVersion: state.workspace.revision.version, changes: { plannedStartTime: $("dpp-edit-start").value, plannedEndTime: $("dpp-edit-end").value, plannedQty: Number($("dpp-edit-qty").value), sequence: Number($("dpp-edit-sequence").value), notes: $("dpp-edit-notes").value } }) });
      }
      $("dpp-dialog").close(); notify(previewEditable ? "Jam allocation Monthly Plan berhasil digeser." : "Perubahan tersimpan pada revision Draft.", "success"); await load();
    } catch (error) { notify(error.message, "error"); }
  });
  $("dpp-draft")?.addEventListener("click", async () => { try { await request(model.apiPath("planning-ppic/daily-plan/revisions"), { method: "POST", body: JSON.stringify({ date: state.date }) }); notify("Revision Draft siap diedit.", "success"); await load(); window.PpicWorkflow?.refresh(state.date.slice(0, 7)); } catch (error) { notify(error.message, "error"); } });
  $("dpp-auto-correct")?.addEventListener("click", async () => {
    if (productionMode || state.moving || !state.workspace?.schedules?.length) return;
    if (!await window.confirmAction("Auto Correct akan merapikan jam kerja dan antrean per mesin. Part, proses, dan mesin yang sama pada hari yang sama akan ditempatkan berurutan dan ditampilkan sebagai satu total quantity.", { title: "Auto Correct Placement", confirmLabel: "Rapikan & Gabungkan" })) return;
    state.moving = true;
    try {
      const result = await request(model.apiPath("planning-ppic/daily-plan/auto-correct"), { method: "POST", body: JSON.stringify({ date: state.date, revisionId: state.workspace.revision?.allocationPreview ? null : state.workspace.revision?.id || null, expectedVersion: state.workspace.revision?.allocationPreview ? null : state.workspace.revision?.version }) });
      const warningCopy = result.warnings?.length ? ` · ${result.warnings.length} operation masih perlu review: ${result.warnings[0].message}` : "";
      const solverCopy = result.solver ? ` · OR-Tools ${result.solver.status} · ${Number(result.solver.taskCount ?? result.items?.length ?? 0)} task · ${Number(result.solver.wallTimeSeconds || 0).toFixed(3)} detik` : "";
      await load();
      notify(result.changedCount ? `${result.changedCount} placement berhasil dikoreksi${solverCopy}${warningCopy}.` : `Placement sudah sesuai jam kerja${solverCopy}; tidak ada perubahan${warningCopy}.`, result.warnings?.length ? "warning" : "success");
    } catch (error) { notify(error.message, "error"); }
    finally { state.moving = false; }
  });
  $("dpp-validate")?.addEventListener("click", async () => {
    try {
      const result = await request(model.apiPath(`planning-ppic/daily-plan/revisions/${encodeURIComponent(state.workspace.revision.id)}/validate`), { method: "POST", body: "{}" });
      await load();
      notify(result.blockers?.length ? `${result.blockers.length} blocker masih harus ditangani.` : `Validasi selesai${result.warnings?.length ? ` dengan ${result.warnings.length} warning` : " tanpa blocker"}.`, result.blockers?.length ? "error" : "success");
    } catch (error) { notify(error.message, "error"); }
  });

  load();
}());
