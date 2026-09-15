(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: Math.min(Math.max(Number(digits) || 0, 0), 2) }).format(number(value));
  const qty = (value, uomCode) => window.SharedDataTable.formatQuantity(value, uomCode, { maximumFractionDigits: 2 });
  const hours = (minutes) => `${num(number(minutes) / 60, 1)} jam`;
  const monthLabel = (value) => new Intl.DateTimeFormat("id-ID", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
  const weekday = (value) => new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(new Date(`${value}T00:00:00`));
  const todayKey = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts((globalThis.erpBusinessNow?.() || new Date()));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  const isPastDate = (value) => Boolean(value) && String(value).slice(0, 10) < todayKey();
  const addDays = (value, days) => {
    const parsed = new Date(`${String(value || "").slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return "";
    parsed.setUTCDate(parsed.getUTCDate() + number(days));
    return parsed.toISOString().slice(0, 10);
  };
  let snapshot = null;
  let plans = [];
  let selectedCell = null;
  let editingAllocation = null;
  let draggedAllocationId = null;
  let currentCapacityFlowRule = null;
  let pendingRecommendationButton = null;
  let pendingRecommendationRequiresPreset = false;
  let readinessIssuesByKey = new Map();
  let activeReadinessTrigger = null;
  // Capacity Planning is a read-only projection of Monthly Production Plan
  // allocations. The only editable data on this page is machine-day capacity.
  let capacityPlanningMode = "PRODUCTION";
  localStorage.setItem("capacity-planning-mode", "PRODUCTION");
  let activeCapacityView = localStorage.getItem("capacity-main-view") || "heatmap";
  const capacityUiDefaults = { search: "", status: "ALL", exceptionsOnly: false, density: "comfortable", page: 1, pageSize: 25, attention: "all", workbench: "schedule", detailSearch: "", detailPage: 1, detailPageSize: 25, advanced: false };
  let capacityUiState = { ...capacityUiDefaults };
  try {
    const storedCapacityUi = JSON.parse(localStorage.getItem("capacity-workspace-ui") || "{}");
    capacityUiState = { ...capacityUiDefaults, ...storedCapacityUi };
  } catch (_) { capacityUiState = { ...capacityUiDefaults }; }
  const builtInScenarios = {
    normal: { name: "Default 2 Shift", shifts: "2", hours: "8", overtime: "0", saturday: "false", sunday: "false", efficiency: "85" },
    max: { name: "Maximum", shifts: "3", hours: "8", overtime: "4", saturday: "true", sunday: "false", efficiency: "85" },
  };
  const defaultShiftWindows = [{ start: "08:00", end: "16:00" }, { start: "16:00", end: "00:00" }, { start: "00:00", end: "08:00" }];
  const addMinutesToClock = (value, minutesToAdd) => {
    const [hour, minute] = String(value || "00:00").split(":").map(Number);
    const total = ((number(hour) * 60) + number(minute) + number(minutesToAdd)) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  let simulationPresets = [];
  let currentUsePresetId = null;
  const selectedPresetKey = () => $("capacity-scenario").value.startsWith("preset-") ? $("capacity-scenario").value : null;
  const activeScenarioKey = () => capacityPlanningMode === "SIMULATION" ? selectedPresetKey() : null;
  const activePreset = () => simulationPresets.find((preset) => preset.id === selectedPresetKey()) || null;
  const monthlyPlanHref = (planNumber = $("capacity-plan")?.value) => {
    const month = $("capacity-month")?.value || "";
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (planNumber) params.set("planNumber", planNumber);
    return `/modules/planning-ppic/monthly-production-plans${params.size ? `?${params}` : ""}`;
  };
  const shiftMinutes = (shift) => { const minutes = (value) => Number(String(value || "00:00").slice(0, 2)) * 60 + Number(String(value || "00:00").slice(3, 5)); const start = minutes(shift.start); const end = minutes(shift.end); return end > start ? end - start : end + 1440 - start; };
  const overtimeHours = (preset) => preset?.overtimeStart && preset?.overtimeEnd ? shiftMinutes({ start: preset.overtimeStart, end: preset.overtimeEnd }) / 60 : 0;
  function scenarioConfig(key) {
    const preset = simulationPresets.find((item) => item.id === key);
    if (preset) {
      const activeShifts = (preset.shifts || defaultShiftWindows).slice(0, preset.shiftCount || 2);
      return { name: preset.name, shifts: String(preset.shiftCount || 2), hours: String(activeShifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0) / Math.max(activeShifts.length, 1) / 60), overtime: String(overtimeHours(preset)), saturday: String(Boolean(preset.includeSaturday)), sunday: String(Boolean(preset.includeSunday)), efficiency: String(preset.efficiency || 85), granularity: "DAY", lookbackWeeks: "0", freezeDays: "0" };
    }
    return builtInScenarios[key] || { name: "Custom Aktif", shifts: $("capacity-shifts").value, hours: $("capacity-hours").value, overtime: $("capacity-overtime").value, saturday: $("capacity-saturday").value, sunday: $("capacity-sunday").value, efficiency: $("capacity-efficiency").value, granularity: "DAY", lookbackWeeks: "0", freezeDays: "0" };
  }
  function resetPresetForm() {
    $("capacity-preset-form").reset(); $("capacity-preset-id").value = ""; $("capacity-preset-month").value = $("capacity-month").value; $("capacity-preset-efficiency").value = "85"; $("capacity-preset-shift-count").value = "2";
    defaultShiftWindows.forEach((shift, index) => { $(`capacity-preset-shift-${index + 1}-start`).value = shift.start; $(`capacity-preset-shift-${index + 1}-end`).value = shift.end; });
    ["capacity-preset-parallel", "capacity-preset-extra-shift", "capacity-preset-auto-ot"].forEach((id) => { $(id).checked = true; });
    $("capacity-preset-form-title").textContent = "Buat Preset Baru"; $("capacity-preset-state").textContent = "Belum disimpan"; $("capacity-preset-daily-count").textContent = "0 daily override"; $("capacity-preset-update").classList.add("d-none"); $("capacity-preset-save-new").classList.remove("d-none"); togglePresetShiftWindows();
  }
  function readPresetForm(existing = null) {
    return {
      name: $("capacity-preset-name").value.trim(), month: $("capacity-preset-month").value, planNumber: $("capacity-plan").value || null,
      shiftCount: Number($("capacity-preset-shift-count").value), efficiency: Number($("capacity-preset-efficiency").value), includeSaturday: $("capacity-preset-saturday").value === "true", includeSunday: $("capacity-preset-sunday").value === "true",
      shifts: defaultShiftWindows.map((_, index) => ({ start: $(`capacity-preset-shift-${index + 1}-start`).value, end: $(`capacity-preset-shift-${index + 1}-end`).value })),
      overtimeStart: $("capacity-preset-ot-start").value || null, overtimeEnd: $("capacity-preset-ot-end").value || null,
      algorithm: { method: "DELIVERY_BACKWARD", allowParallel: $("capacity-preset-parallel").checked, allowExtraShift: $("capacity-preset-extra-shift").checked, allowOvertime: $("capacity-preset-auto-ot").checked },
      dailyOverrides: existing?.dailyOverrides || {},
    };
  }
  function fillPresetForm(preset) {
    if (!preset) return resetPresetForm();
    $("capacity-preset-id").value = preset.id; $("capacity-preset-name").value = preset.name; $("capacity-preset-month").value = preset.month; $("capacity-preset-shift-count").value = preset.shiftCount; $("capacity-preset-efficiency").value = preset.efficiency; $("capacity-preset-saturday").value = String(Boolean(preset.includeSaturday)); $("capacity-preset-sunday").value = String(Boolean(preset.includeSunday)); $("capacity-preset-ot-start").value = preset.overtimeStart || ""; $("capacity-preset-ot-end").value = preset.overtimeEnd || "";
    defaultShiftWindows.forEach((fallback, index) => { const shift = preset.shifts?.[index] || fallback; $(`capacity-preset-shift-${index + 1}-start`).value = shift.start; $(`capacity-preset-shift-${index + 1}-end`).value = shift.end; });
    $("capacity-preset-parallel").checked = preset.algorithm?.allowParallel !== false; $("capacity-preset-extra-shift").checked = preset.algorithm?.allowExtraShift !== false; $("capacity-preset-auto-ot").checked = preset.algorithm?.allowOvertime !== false;
    $("capacity-preset-form-title").textContent = preset.name; $("capacity-preset-state").textContent = `Tersimpan · ${preset.updatedBy || "PPIC"}`; $("capacity-preset-daily-count").textContent = `${Object.keys(preset.dailyOverrides || {}).length} daily override`; $("capacity-preset-update").classList.remove("d-none"); $("capacity-preset-save-new").classList.add("d-none"); togglePresetShiftWindows();
  }
  function togglePresetShiftWindows() { const count = Number($("capacity-preset-shift-count").value || 1); document.querySelectorAll("[data-preset-shift]").forEach((row) => row.classList.toggle("d-none", Number(row.dataset.presetShift) > count)); }
  function renderPresetLibrary() {
    $("capacity-preset-count").textContent = `${simulationPresets.length} preset`; $("capacity-preset-library-title").textContent = `Preset ${$("capacity-month").value || "Bulan Aktif"}`;
    $("capacity-preset-list").innerHTML = simulationPresets.map((preset) => { const locked = Object.keys(preset.dailyOverrides || {}).filter(isPastDate).length; const current = preset.id === currentUsePresetId; return `<article class="${preset.id === selectedPresetKey() ? "active" : ""}"><div><b>${esc(preset.name)}${current ? ' <span class="capacity-source firm">CURRENT USE</span>' : ""}</b><small>${esc(preset.month)} · ${num(preset.shiftCount)} shift · ${num(preset.efficiency)}% · ${Object.keys(preset.dailyOverrides || {}).length} override${locked ? ` · ${locked} hari terkunci` : ""}</small></div><div><button class="btn btn-sm btn-outline-secondary" type="button" data-edit-preset="${esc(preset.id)}">Edit</button><button class="btn btn-sm btn-primary" type="button" data-use-preset="${esc(preset.id)}">Gunakan</button></div></article>`; }).join("") || '<div class="capacity-empty">Belum ada preset pada bulan ini.</div>';
  }
  function syncScenarioOptions(preferredId = selectedPresetKey()) {
    if (capacityPlanningMode === "SIMULATION") {
      $("capacity-scenario").innerHTML = '<option value="">Pilih preset bulanan</option>' + simulationPresets.map((preset) => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join("");
      const selected = simulationPresets.some((preset) => preset.id === preferredId) ? preferredId : simulationPresets[0]?.id || ""; $("capacity-scenario").value = selected;
    } else {
      const currentPreset = simulationPresets.find((preset) => preset.id === currentUsePresetId);
      $("capacity-scenario").innerHTML = currentPreset
        ? `<option value="${esc(currentPreset.id)}">${esc(currentPreset.name)} · Current Use</option>`
        : '<option value="normal">Default 2 Shift · Belum ada preset go-live</option>';
      $("capacity-scenario").value = currentPreset?.id || "normal";
    }
    renderPresetLibrary();
    const comparisonOptions = simulationPresets.map((preset) => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join("");
    if ($("capacity-compare-a")) $("capacity-compare-a").innerHTML = comparisonOptions || '<option value="">Belum ada preset</option>';
    if ($("capacity-compare-b")) {
      $("capacity-compare-b").innerHTML = comparisonOptions || '<option value="">Belum ada preset</option>';
      if (simulationPresets[1]) $("capacity-compare-b").value = simulationPresets[1].id;
    }
  }
  async function loadSimulationPresets(preferredId = selectedPresetKey()) {
    const month = $("capacity-month").value; if (!month) return;
    const payload = await api(`/modules/api/planning-ppic/capacity-planning/presets?month=${encodeURIComponent(month)}`); simulationPresets = payload.presets || []; currentUsePresetId = payload.currentPresetId || null; syncScenarioOptions(preferredId); const selected = activePreset(); if (selected) fillPresetForm(selected); else resetPresetForm();
  }
  function updateCapacityModeUi() {
    capacityPlanningMode = "PRODUCTION";
    localStorage.setItem("capacity-planning-mode", "PRODUCTION");
    const simulation = false;
    const selectedPlan = plans.find((plan) => plan.planNumber === $("capacity-plan").value);
    const canAdoptPlan = selectedPlan && ["Draft", "Confirmed", "Released", "In Progress"].includes(selectedPlan.status);
    document.querySelectorAll("[data-capacity-mode]").forEach((button) => {
      const active = button.dataset.capacityMode === capacityPlanningMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("capacity-open-scenario").classList.add("d-none");
    $("capacity-adopt-simulation").classList.add("d-none");
    $("capacity-sync-dpp").classList.toggle("d-none", !selectedPlan || !["Released", "In Progress"].includes(selectedPlan.status));
    $("capacity-recommend").classList.toggle("d-none", !canAdoptPlan);
    $("capacity-override").classList.add("d-none");
    const title = $("capacity-main-view-title");
    if (title) title.textContent = "Capacity Check dari Monthly Production Plan";
    const help = $("capacity-main-view-help");
    if (help) help.textContent = selectedPlan
      ? `${selectedPlan.planNumber} menjadi sumber tunggal qty, tanggal, mesin, dan vendor. Klik cell hanya untuk review load atau menyesuaikan jam capacity.`
      : "Pilih Monthly Production Plan agar jadwal dan load capacity langsung mengikuti allocation plan tersebut.";
    $("capacity-production-guide-steps").textContent = "Qty, tanggal, mesin, proses vendor, dan urutan mengikuti allocation tersimpan pada Monthly Production Plan.";
    $("capacity-production-guide-lock").textContent = "Di halaman ini PPIC hanya mengubah jam kerja, jumlah shift, dan overtime per mesin–tanggal.";
  }
  function applyScenario(key, refresh = true) {
    const scenario = scenarioConfig(key);
    $("capacity-scenario").value = key;
    $("capacity-shifts").value = scenario.shifts;
    $("capacity-hours").value = scenario.hours;
    $("capacity-overtime").value = scenario.overtime;
    $("capacity-saturday").value = scenario.saturday;
    $("capacity-sunday").value = scenario.sunday;
    $("capacity-efficiency").value = scenario.efficiency;
    const preset = simulationPresets.find((item) => item.id === key); if (preset && preset.month !== $("capacity-month").value) setMonthRange(preset.month);
    if (preset) fillPresetForm(preset);
    if (refresh) load();
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Capacity Planning gagal diproses.");
    return payload.data || payload.items || payload;
  }
  function comparisonSnapshotSummary(value) {
    const machines = value?.machines || [];
    const cells = machines.flatMap((machine) => Object.values(machine.cells || {}));
    const availableMinutes = cells.reduce((sum, cell) => sum + number(cell.availableMinutes), 0);
    const loadMinutes = cells.reduce((sum, cell) => sum + number(cell.totalLoadMinutes ?? cell.loadMinutes), 0);
    const overloadCells = cells.filter((cell) => number(cell.totalLoadMinutes ?? cell.loadMinutes) > number(cell.availableMinutes)).length;
    return {
      machineCount: machines.length,
      availableMinutes,
      loadMinutes,
      utilization: availableMinutes > 0 ? loadMinutes / availableMinutes * 100 : 0,
      overloadCells,
      unscheduledCount: (value?.unscheduled || []).length,
      blockerCount: (value?.issues || []).filter((issue) => issue.severity === "blocking").length,
    };
  }
  function renderCustomScenarioComparison(left, right) {
    const target = $("capacity-scenario-comparison");
    if (!target) return;
    const metric = (label, a, b, formatter = (value) => num(value)) => `<tr><th>${esc(label)}</th><td>${formatter(a)}</td><td>${formatter(b)}</td><td>${formatter(number(b) - number(a))}</td></tr>`;
    target.innerHTML = `<div class="table-responsive"><table class="table capacity-detail-table mb-0"><thead><tr><th>Metric</th><th>${esc(left.name)}</th><th>${esc(right.name)}</th><th>Delta B − A</th></tr></thead><tbody>
      ${metric("Machine", left.summary.machineCount, right.summary.machineCount)}
      ${metric("Available Capacity", left.summary.availableMinutes, right.summary.availableMinutes, hours)}
      ${metric("Planned Load", left.summary.loadMinutes, right.summary.loadMinutes, hours)}
      ${metric("Utilization", left.summary.utilization, right.summary.utilization, (value) => `${num(value, 1)}%`)}
      ${metric("Overload Cell", left.summary.overloadCells, right.summary.overloadCells)}
      ${metric("Unscheduled", left.summary.unscheduledCount, right.summary.unscheduledCount)}
      ${metric("Blocking Issue", left.summary.blockerCount, right.summary.blockerCount)}
    </tbody></table></div><p class="text-muted small mt-2 mb-0">Gantt dan Calendar utama tetap mengikuti preset aktif. Comparison hanya membaca snapshot kedua skenario dan tidak mempromosikan salah satunya menjadi Current Use.</p>`;
  }
  async function loadSharedScenarios() {
    const leftPreset = simulationPresets.find((preset) => preset.id === $("capacity-compare-a")?.value);
    const rightPreset = simulationPresets.find((preset) => preset.id === $("capacity-compare-b")?.value);
    if (!leftPreset || !rightPreset || leftPreset.id === rightPreset.id) return alert("Pilih dua preset berbeda untuk dibandingkan.", "warning");
    const snapshotFor = async (preset) => {
      const scenario = scenarioConfig(preset.id);
      const params = new URLSearchParams({ startDate: $("capacity-start").value, endDate: $("capacity-end").value, shiftsPerDay: scenario.shifts, shiftHours: scenario.hours, efficiencyPercent: scenario.efficiency, scenarioName: scenario.name, overtimeHours: scenario.overtime, includeSaturday: scenario.saturday, includeSunday: scenario.sunday, planningGranularity: "DAY", rollingLookbackWeeks: "0", freezeFenceDays: "0", manualAllocation: "true", planningMode: "SIMULATION", scenarioKey: preset.id, presetId: preset.id });
      if ($("capacity-plan").value) params.set("planNumber", $("capacity-plan").value);
      const value = await api(`/modules/api/planning-ppic/capacity-planning?${params}`);
      return { name: preset.name, summary: comparisonSnapshotSummary(value) };
    };
    const target = $("capacity-scenario-comparison");
    target.innerHTML = '<div class="capacity-loading">Membandingkan dua snapshot capacity...</div>';
    try {
      const [left, right] = await Promise.all([snapshotFor(leftPreset), snapshotFor(rightPreset)]);
      renderCustomScenarioComparison(left, right);
    } catch (error) { target.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message)}</div>`; }
  }
  function alert(message, kind = "danger") { const box = $("capacity-alert"); box.textContent = message; box.className = `alert alert-${kind}`; }
  const inputNumber = (id) => number($(id)?.value);
  function defaultCapacityFlowRule() {
    const planNumber = $("capacity-plan")?.value || "MPP";
    return {
      version: 1, name: `Aturan Aliran ${planNumber}`, algorithmProfile: "SHIFT_CAPACITY_TRANSFER", flowMethod: "FULL_SEQUENTIAL",
      flow: { nextProcessStart: "IMMEDIATE", phaseCount: 2, phaseDistribution: "EQUAL", phasePercentages: [], transferBatchQuantity: 0, minimumReleaseBatchQuantity: 0, minimumWip: 0, maximumWip: 0 },
      interProcessDelay: { mode: "FIXED", value: 120, unit: "MINUTE" }, releaseConditions: [],
      wip: { minimum: 0, maximum: 0, onMaximum: "WARNING" },
      shift: { allowCrossShift: false, allowOvernightWip: false, nextProcessStart: "IMMEDIATE" },
      machine: { placement: "FASTEST_AVAILABLE", allowSplitMachines: false, maximumMachines: 1 },
      lot: { policy: "KEEP_TOGETHER", minimumSplitQuantity: 0, preserveMaterialLotTraceability: true },
      setup: { trigger: "PRODUCTION_START", skipWhenSameTooling: false }, quality: { gate: "NONE" },
      delivery: { fgCompletionDaysBefore: 0 },
      ngOutput: { goodQuantityAction: "CONTINUE", outputPriority: "NEAREST_DELIVERY" },
    };
  }
  function readCapacityFlowRule() {
    return {
      version: 1,
      name: $("capacity-flow-name").value.trim(),
      algorithmProfile: $("capacity-flow-profile").value,
      flowMethod: $("capacity-flow-method").value,
      flow: {
        nextProcessStart: $("capacity-flow-sequential-start").value,
        phaseCount: inputNumber("capacity-flow-phase-count"),
        phaseDistribution: $("capacity-flow-phase-distribution").value,
        phasePercentages: $("capacity-flow-phase-percentages").value.split(",").map((value) => Number(value.trim())).filter(Number.isFinite),
        transferBatchQuantity: inputNumber("capacity-flow-transfer-batch"),
        minimumReleaseBatchQuantity: inputNumber("capacity-flow-min-release-batch"),
        minimumWip: inputNumber("capacity-flow-continuous-min-wip"),
        maximumWip: inputNumber("capacity-flow-continuous-max-wip"),
      },
      interProcessDelay: { mode: $("capacity-flow-delay-mode").value, value: inputNumber("capacity-flow-delay-value"), unit: $("capacity-flow-delay-unit").value },
      releaseConditions: [...document.querySelectorAll('input[name="capacity-release"]:checked')].map((input) => input.value),
      wip: { minimum: inputNumber("capacity-flow-wip-min"), maximum: inputNumber("capacity-flow-wip-max"), onMaximum: $("capacity-flow-wip-maximum-action").value },
      shift: { allowCrossShift: $("capacity-flow-cross-shift").checked, allowOvernightWip: $("capacity-flow-overnight-wip").checked, nextProcessStart: $("capacity-flow-shift-next-start").value },
      machine: { placement: $("capacity-flow-machine-placement").value, allowSplitMachines: $("capacity-flow-split-machines").checked, maximumMachines: inputNumber("capacity-flow-max-machines") || 1 },
      lot: { policy: $("capacity-flow-lot-policy").value, minimumSplitQuantity: inputNumber("capacity-flow-min-split"), preserveMaterialLotTraceability: $("capacity-flow-traceability").checked },
      setup: { trigger: $("capacity-flow-setup-trigger").value, skipWhenSameTooling: $("capacity-flow-skip-same-tooling").checked },
      quality: { gate: $("capacity-flow-quality-gate").value },
      delivery: { fgCompletionDaysBefore: inputNumber("capacity-flow-fg-days-before") },
      ngOutput: { goodQuantityAction: $("capacity-flow-good-action").value, outputPriority: $("capacity-flow-output-priority").value },
    };
  }
  function fillCapacityFlowRule(rule = defaultCapacityFlowRule()) {
    currentCapacityFlowRule = rule;
    $("capacity-flow-name").value = rule.name || ""; $("capacity-flow-profile").value = rule.algorithmProfile || "CUSTOM"; $("capacity-flow-method").value = rule.flowMethod || "FULL_SEQUENTIAL";
    $("capacity-flow-sequential-start").value = rule.flow?.nextProcessStart || "IMMEDIATE"; $("capacity-flow-phase-count").value = number(rule.flow?.phaseCount) || 2; $("capacity-flow-phase-distribution").value = rule.flow?.phaseDistribution || "EQUAL"; $("capacity-flow-phase-percentages").value = (rule.flow?.phasePercentages || []).join(", ");
    $("capacity-flow-transfer-batch").value = number(rule.flow?.transferBatchQuantity) || ""; $("capacity-flow-min-release-batch").value = number(rule.flow?.minimumReleaseBatchQuantity) || ""; $("capacity-flow-continuous-min-wip").value = number(rule.flow?.minimumWip) || ""; $("capacity-flow-continuous-max-wip").value = number(rule.flow?.maximumWip) || "";
    $("capacity-flow-delay-mode").value = rule.interProcessDelay?.mode || "FIXED"; $("capacity-flow-delay-value").value = rule.interProcessDelay?.value == null ? 120 : number(rule.interProcessDelay.value); $("capacity-flow-delay-unit").value = rule.interProcessDelay?.unit || "MINUTE";
    document.querySelectorAll('input[name="capacity-release"]').forEach((input) => { input.checked = (rule.releaseConditions || []).includes(input.value); });
    $("capacity-flow-wip-min").value = number(rule.wip?.minimum) || ""; $("capacity-flow-wip-max").value = number(rule.wip?.maximum) || ""; $("capacity-flow-wip-maximum-action").value = rule.wip?.onMaximum || "WARNING";
    $("capacity-flow-cross-shift").checked = Boolean(rule.shift?.allowCrossShift); $("capacity-flow-overnight-wip").checked = Boolean(rule.shift?.allowOvernightWip); $("capacity-flow-shift-next-start").value = rule.shift?.nextProcessStart || "IMMEDIATE";
    $("capacity-flow-machine-placement").value = rule.machine?.placement || "FASTEST_AVAILABLE"; $("capacity-flow-split-machines").checked = Boolean(rule.machine?.allowSplitMachines); $("capacity-flow-max-machines").value = number(rule.machine?.maximumMachines) || 1;
    $("capacity-flow-lot-policy").value = rule.lot?.policy || "KEEP_TOGETHER"; $("capacity-flow-min-split").value = number(rule.lot?.minimumSplitQuantity) || ""; $("capacity-flow-traceability").checked = rule.lot?.preserveMaterialLotTraceability !== false;
    $("capacity-flow-setup-trigger").value = rule.setup?.trigger || "PRODUCTION_START"; $("capacity-flow-skip-same-tooling").checked = Boolean(rule.setup?.skipWhenSameTooling); $("capacity-flow-quality-gate").value = rule.quality?.gate || "NONE"; $("capacity-flow-good-action").value = rule.ngOutput?.goodQuantityAction || "CONTINUE"; $("capacity-flow-output-priority").value = rule.ngOutput?.outputPriority || "NEAREST_DELIVERY";
    $("capacity-flow-fg-days-before").value = number(rule.delivery?.fgCompletionDaysBefore);
    updateCapacityFlowConditionalFields(); renderCapacityFlowSummary();
  }
  function updateCapacityFlowConditionalFields() {
    const method = $("capacity-flow-method").value;
    const custom = $("capacity-flow-profile").value === "CUSTOM";
    $("capacity-flow-method-wrap").classList.toggle("d-none", !custom);
    document.querySelectorAll("[data-flow-fields]").forEach((element) => element.classList.toggle("d-none", !custom || element.dataset.flowFields !== method));
    $("capacity-flow-phase-percentages-wrap").classList.toggle("d-none", method !== "SPLIT_PHASE" || $("capacity-flow-phase-distribution").value !== "PERCENTAGE");
    const fixedDelay = $("capacity-flow-delay-mode").value === "FIXED";
    $("capacity-flow-delay-value-wrap").classList.toggle("d-none", !fixedDelay); $("capacity-flow-delay-unit-wrap").classList.toggle("d-none", !fixedDelay);
    $("capacity-flow-min-split-wrap").classList.toggle("d-none", $("capacity-flow-lot-policy").value !== "ALLOW_SPLIT");
    $("capacity-flow-max-machines").disabled = !$("capacity-flow-split-machines").checked;
  }
  function capacityFlowDescription(rule) {
    const unit = { MINUTE: "menit", HOUR: "jam", DAY: "hari" }[rule.interProcessDelay.unit] || "menit";
    const releaseLabels = { QUANTITY_REACHED: "quantity tercapai", QC_RELEASE: "QC release", MATERIAL_MOVED: "material dipindahkan", PREVIOUS_PROCESS_CLOSED: "proses sebelumnya closed" };
    const lotLabels = { KEEP_TOGETHER: "lot tidak boleh dipecah", ALLOW_SPLIT: "lot boleh dipecah", ALLOW_MERGE: "lot boleh digabung" };
    let opening = rule.algorithmProfile === "SHIFT_CAPACITY_TRANSFER"
      ? "Sistem mencoba seluruh kebutuhan sebagai satu lot; transfer per kapasitas shift hanya dipakai bila lot penuh tidak muat"
      : rule.algorithmProfile === "FULL_COMPLETION_SEQUENCE"
        ? "Setiap child menunggu seluruh proses sebelumnya selesai"
        : "Proses berikutnya berjalan secara berurutan";
    if (rule.algorithmProfile === "CUSTOM" && rule.flowMethod === "SPLIT_PHASE") opening = `Produksi dibagi menjadi ${num(rule.flow.phaseCount)} phase ${rule.flow.phaseDistribution === "EQUAL" ? "sama rata" : "berdasarkan persentase"}`;
    if (rule.algorithmProfile === "CUSTOM" && rule.flowMethod === "SPLIT_BATCH") opening = `Proses berikutnya dimulai setelah ${num(rule.flow.minimumReleaseBatchQuantity || rule.flow.transferBatchQuantity)} pcs selesai, dengan transfer batch ${num(rule.flow.transferBatchQuantity)} pcs`;
    if (rule.algorithmProfile === "CUSTOM" && rule.flowMethod === "CONTINUOUS_FLOW") opening = `Produksi mengalir kontinu dengan WIP ${num(rule.flow.minimumWip)} sampai ${num(rule.flow.maximumWip)} pcs`;
    const parts = [opening];
    if (rule.interProcessDelay.mode === "FIXED") parts.push(`jeda ${num(rule.interProcessDelay.value)} ${unit}`);
    else if (rule.interProcessDelay.mode === "ROUTING_PROCESS") parts.push("jeda mengikuti routing process");
    if (rule.releaseConditions.length) parts.push(`menunggu ${rule.releaseConditions.map((item) => releaseLabels[item]).join(", ")}`);
    if (rule.wip.maximum > 0) parts.push(`maksimal WIP ${num(rule.wip.maximum)} pcs`);
    if (number(rule.delivery?.fgCompletionDaysBefore) > 0) parts.push(`FG selesai ${num(rule.delivery.fgCompletionDaysBefore)} hari sebelum delivery`);
    parts.push(lotLabels[rule.lot.policy]);
    return `${parts.join(", ")}.`;
  }
  function renderCapacityFlowSummary(preview = false) {
    const rule = readCapacityFlowRule();
    const methodLabels = { FULL_SEQUENTIAL: "Full Sequential", SPLIT_PHASE: "Split Phase", SPLIT_BATCH: "Split Batch", CONTINUOUS_FLOW: "Continuous Flow" };
    const machineLabels = { PRIMARY: "Mesin utama", ALTERNATIVE: "Mesin alternatif", FASTEST_AVAILABLE: "Mesin paling cepat tersedia" };
    const qualityLabels = { NONE: "Tanpa quality gate", SAMPLE: "QC sample", FULL_BATCH: "QC full batch", APPROVAL: "QC approval" };
    $("capacity-flow-summary-name").textContent = rule.name || "Aturan belum diberi nama"; $("capacity-flow-summary-text").textContent = capacityFlowDescription(rule);
    const profileLabel = { SHIFT_CAPACITY_TRANSFER: "Transfer kapasitas/shift", FULL_COMPLETION_SEQUENCE: "Selesai penuh berurutan", CUSTOM: `Custom · ${methodLabels[rule.flowMethod]}` }[rule.algorithmProfile] || methodLabels[rule.flowMethod];
    $("capacity-flow-summary-points").innerHTML = [`Algoritma ${profileLabel}`, number(rule.delivery?.fgCompletionDaysBefore) > 0 ? `Target FG H-${num(rule.delivery.fgCompletionDaysBefore)}` : "Target FG pada hari delivery", machineLabels[rule.machine.placement], qualityLabels[rule.quality.gate], rule.shift.allowCrossShift ? "Boleh lintas shift" : "Selesai dalam shift", rule.lot.preserveMaterialLotTraceability ? "Traceability lot dipertahankan" : "Traceability lot opsional"].map((item) => `<span>${esc(item)}</span>`).join("");
    const connector = rule.flowMethod === "SPLIT_BATCH" ? `Batch ${num(rule.flow.transferBatchQuantity)}` : rule.flowMethod === "SPLIT_PHASE" ? `${num(rule.flow.phaseCount)} phase` : rule.flowMethod === "CONTINUOUS_FLOW" ? "WIP flow" : "Sequential";
    $("capacity-flow-preview-canvas").innerHTML = `<span>Proses 10</span><i>→</i><span>${esc(connector)}</span><i>→</i><span>Proses 20</span>`;
    if (preview) { $("capacity-flow-save-state").textContent = "Preview diperbarui dari nilai form saat ini; belum disimpan."; $("capacity-flow-save-state").className = "capacity-flow-save-state warning"; }
  }
  function validateCapacityFlowRule(rule) {
    if (!rule.name) throw new Error("Nama Aturan wajib diisi.");
    if (rule.algorithmProfile !== "CUSTOM") return rule;
    if (rule.flowMethod === "SPLIT_BATCH" && rule.flow.transferBatchQuantity <= 0) throw new Error("Transfer batch quantity wajib lebih dari nol.");
    if (rule.flowMethod === "SPLIT_PHASE" && rule.flow.phaseDistribution === "PERCENTAGE") {
      const total = rule.flow.phasePercentages.reduce((sum, value) => sum + value, 0);
      if (rule.flow.phasePercentages.length !== rule.flow.phaseCount || Math.abs(total - 100) > 0.01) throw new Error("Isi persentase sesuai jumlah phase dengan total 100%.");
    }
    if (rule.wip.maximum > 0 && rule.wip.minimum > rule.wip.maximum) throw new Error("Minimum WIP tidak boleh melebihi Maximum WIP.");
    return rule;
  }
  async function loadCapacityFlowRule(planNumber) {
    const stored = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/capacity-flow-rule`);
    const rule = stored.draft || stored.active || defaultCapacityFlowRule(); fillCapacityFlowRule(rule);
    $("capacity-flow-save-state").textContent = stored.draft || stored.active ? `Aturan terakhir disimpan oleh ${stored.updatedBy || "PPIC"}.` : "Belum ada aturan tersimpan untuk MPP ini.";
    $("capacity-flow-save-state").className = `capacity-flow-save-state${stored.draft || stored.active ? " success" : ""}`;
  }
  async function saveCapacityFlowRule(saveMode) {
    const planNumber = $("capacity-plan").value;
    const rule = readCapacityFlowRule();
    if (saveMode === "ACTIVE") validateCapacityFlowRule(rule);
    const saved = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/capacity-flow-rule`, { method: "PUT", body: JSON.stringify({ saveMode, rule }) });
    currentCapacityFlowRule = saved.rule; $("capacity-flow-save-state").textContent = saved.message; $("capacity-flow-save-state").className = "capacity-flow-save-state success";
    return saved.rule;
  }
  async function openCapacityFlowDialog(button, requirePreset = false) {
    const planNumber = $("capacity-plan").value;
    if (!planNumber) return alert("Pilih satu MPP terlebih dahulu.", "warning");
    if (requirePreset && !activePreset()) { $("capacity-scenario").focus(); return alert("Pilih preset pada Capacity Setup / Preset terlebih dahulu.", "warning"); }
    pendingRecommendationButton = button; pendingRecommendationRequiresPreset = requirePreset;
    $("capacity-flow-plan-badge").textContent = planNumber; $("capacity-flow-save-state").textContent = "Memuat aturan MPP..."; $("capacity-flow-dialog").showModal();
    try { await loadCapacityFlowRule(planNumber); } catch (error) { fillCapacityFlowRule(); $("capacity-flow-save-state").textContent = error.message; $("capacity-flow-save-state").className = "capacity-flow-save-state warning"; }
  }
  function setDefaultRange() {
    const now = (globalThis.erpBusinessNow?.() || new Date());
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const local = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    $("capacity-start").value = local(start); $("capacity-end").value = local(end); $("capacity-month").value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  }
  function setMonthRange(value) { if (!value) return; const [year, month] = value.split("-").map(Number); const start = new Date(year, month - 1, 1); const end = new Date(year, month, 0); const local = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; $("capacity-month").value = value; $("capacity-start").value = local(start); $("capacity-end").value = local(end); }
  async function loadPlans() {
    try {
      plans = await api("/modules/api/planning-ppic/monthly-plan?start=0&length=200");
      $("capacity-plan").innerHTML = '<option value="">Pilih Monthly Production Plan</option>' + plans.map((plan) => `<option value="${esc(plan.planNumber)}">${esc(plan.planNumber)} · ${esc(plan.status)} · ${esc(plan.sourceMpsNumber || plan.sourceType || "Manual")}</option>`).join("");
      const requestedPlan = new URLSearchParams(location.search).get("planNumber");
      const activeStatuses = new Set(["Draft", "Confirmed", "Released", "In Progress"]);
      const selected = plans.find((plan) => plan.planNumber === requestedPlan)
        || plans.find((plan) => String(plan.periodStart).slice(0, 7) === $("capacity-month").value && activeStatuses.has(plan.status))
        || plans.filter((plan) => activeStatuses.has(plan.status)).sort((left, right) => String(right.periodStart).localeCompare(String(left.periodStart)))[0];
      if (selected) { $("capacity-plan").value = selected.planNumber; $("capacity-start").value = String(selected.periodStart).slice(0, 10); $("capacity-end").value = String(selected.schedulingHorizonEnd || selected.periodEnd).slice(0, 10); $("capacity-month").value = String(selected.periodStart).slice(0, 7); }
      window.PpicWorkflow?.refresh($("capacity-month").value);
    } catch (_) { plans = []; }
  }
  function renderHorizonInsight() {
    const target = $("capacity-horizon-insight");
    if (!target || !snapshot) return;
    const machineLoad = number(snapshot.summary?.totalLoadMinutes);
    const vendors = snapshot.vendorAssignments || [];
    const receiptCount = number(snapshot.summary?.fgReceiptLineCount);
    const selectedPlan = plans.find((plan) => plan.planNumber === $("capacity-plan").value);
    if (machineLoad > 0) {
      target.classList.add("d-none");
      target.innerHTML = "";
      return;
    }
    const periodEnd = String(selectedPlan?.periodEnd || $("capacity-end").value || "").slice(0, 10);
    const nextPlan = plans
      .filter((plan) => plan.planNumber !== selectedPlan?.planNumber && String(plan.periodStart).slice(0, 10) > periodEnd && ["Draft", "Confirmed", "Released", "In Progress"].includes(plan.status))
      .sort((left, right) => String(left.periodStart).localeCompare(String(right.periodStart)))[0];
    const processNames = [...new Set(vendors.map((item) => item.processName || item.processCode).filter(Boolean))].join(", ");
    const context = [vendors.length ? `${num(vendors.length)} allocation vendor${processNames ? ` (${esc(processNames)})` : ""}` : "", receiptCount ? `${num(receiptCount)} target FG receipt` : ""].filter(Boolean);
    const hasNonMachineWork = context.length > 0;
    target.classList.remove("d-none");
    target.innerHTML = `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2"><div><b>${hasNonMachineWork ? "Horizon ini tidak kosong; tidak ada beban mesin internal." : "Belum ada beban mesin pada horizon ini."}</b><div>${hasNonMachineWork ? `${context.join(" dan ")} tidak memakai menit kapasitas mesin.` : "Pilih MPP yang benar atau jalankan Buat Rekomendasi untuk membentuk schedule."}</div></div>${nextPlan ? `<button class="btn btn-sm btn-outline-primary" type="button" data-capacity-open-plan="${esc(nextPlan.planNumber)}">Buka ${esc(nextPlan.planNumber)}</button>` : ""}</div>`;
    const vendorTimeline = document.querySelector(".capacity-vendor-heatmap-section");
    if (vendorTimeline && vendors.length) vendorTimeline.open = true;
    if (vendors.length && capacityUiState.workbench === "schedule") activateCapacityWorkbench("vendor");
  }
  function renderStats() {
    const summary = snapshot.summary;
    $("capacity-stat-machines").textContent = `${num(summary.activeMachineCount)} / ${num(summary.machineCount)}`;
    $("capacity-stat-machines-note").textContent = `${num(summary.processCount)} process · ${num(summary.routeCount)} routing · ${num(summary.fgReceiptLineCount)} FG receipt`;
    $("capacity-stat-available").textContent = hours(summary.totalAvailableMinutes);
    if (snapshot.scenario) $("capacity-stat-machines-note").textContent = `${snapshot.scenario.scenarioName} · ${snapshot.parameters.planningGranularity === "WEEK" ? "mingguan" : "harian"} · P-${snapshot.parameters.rollingLookbackWeeks} · freeze s/d ${snapshot.parameters.freezeFenceDate} · ${snapshot.scenario.workingDayCount} hari kerja`;
    $("capacity-stat-load").textContent = hours(summary.totalLoadMinutes);
    $("capacity-stat-utilization").textContent = `Utilization ${num(summary.utilizationPercent, 1)}% · Firm ${hours(summary.totalFirmMinutes)} · Proposed ${hours(summary.totalProposedMinutes)} · Actual ${hours(summary.totalActualMinutes || 0)}`;
    $("capacity-stat-overload").textContent = `${num(summary.overloadedCells)} / ${num(summary.unscheduledCount)}`;
    const selectedPlan = plans.find((plan) => plan.planNumber === $("capacity-plan").value);
    $("capacity-override").classList.toggle("d-none", !selectedPlan || !snapshot.readiness.overridableCount || selectedPlan.capacityOverrideApproved === true);
    $("capacity-stat-readiness").textContent = `${num(snapshot.readiness.blockingCount)} blocker · ${num(snapshot.readiness.warningCount)} warning`;
  }
  function renderMaterialGate() {
    const container = $("capacity-material-gate");
    if (!container) return;
    const gate = snapshot?.materialGate;
    if (!gate || !gate.readyDate) {
      container.classList.add("d-none");
      container.innerHTML = "";
      return;
    }
    const readyDate = String(gate.readyDate).slice(0, 10);
    const confirmed = gate.confirmed === true;
    const status = confirmed ? "Supplier confirmed" : "System fallback";
    const explanation = confirmed
      ? "Proses produksi pertama menunggu tanggal delivery supplier yang sudah dikonfirmasi."
      : "Supplier belum mengonfirmasi seluruh kebutuhan; proses pertama memakai due date material hasil Purchase Suggestion.";
    const critical = (gate.criticalItems || []).map((item) => item.materialCode || item.partCode).filter(Boolean).slice(0, 4);
    container.classList.remove("d-none");
    container.classList.toggle("confirmed", confirmed);
    container.innerHTML = `<div><small>MATERIAL START GATE</small><strong>${esc(monthLabel(readyDate))}</strong><span class="${confirmed ? "confirmed" : "fallback"}">${esc(status)}</span></div><p>${esc(explanation)}${critical.length ? `<small>Critical: ${esc(critical.join(", "))}</small>` : ""}</p>${gate.suggestionNumber ? `<a href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(gate.suggestionNumber)}">Buka ${esc(gate.suggestionNumber)} →</a>` : ""}`;
  }
  function persistCapacityUiState() {
    localStorage.setItem("capacity-workspace-ui", JSON.stringify(capacityUiState));
  }
  function capacityMachineHasRisk(machine, level = "RISK") {
    const cells = (snapshot?.dates || []).map((date) => machine.cells?.[date]).filter(Boolean);
    if (level === "OVERLOAD") return cells.some((cell) => number(cell.loadPercent) > 100 || String(cell.status).toLowerCase() === "overload");
    if (level === "HIGH") return cells.some((cell) => number(cell.loadPercent) >= 85 && number(cell.loadPercent) <= 100);
    return cells.some((cell) => number(cell.loadPercent) >= 85 || ["high", "overload"].includes(String(cell.status).toLowerCase()));
  }
  function filteredCapacityRows() {
    const search = String(capacityUiState.search || "").trim().toLowerCase();
    return (snapshot?.machines || []).map(machineSummary).filter((row) => {
      const haystack = [row.machineCode, row.machineName, row.lineCode, row.machineType, row.machineSpecificationCode, row.machineSpecificationName, row.machineFamily].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (capacityUiState.exceptionsOnly && !capacityMachineHasRisk(row)) return false;
      if (capacityUiState.status === "RISK" && !capacityMachineHasRisk(row)) return false;
      if (capacityUiState.status === "OVERLOAD" && !capacityMachineHasRisk(row, "OVERLOAD")) return false;
      if (capacityUiState.status === "HIGH" && !capacityMachineHasRisk(row, "HIGH")) return false;
      if (capacityUiState.status === "LOADED" && number(row.loadMinutes) <= 0) return false;
      if (capacityUiState.status === "EMPTY" && number(row.loadMinutes) > 0) return false;
      return true;
    });
  }
  function pagedCapacityRows() {
    const filtered = filteredCapacityRows();
    const size = [15, 25, 50, 100].includes(number(capacityUiState.pageSize)) ? number(capacityUiState.pageSize) : 25;
    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    capacityUiState.page = Math.min(Math.max(number(capacityUiState.page) || 1, 1), totalPages);
    const start = (capacityUiState.page - 1) * size;
    const result = $("capacity-resource-result");
    if (result) result.textContent = filtered.length ? `${num(start + 1)}–${num(Math.min(start + size, filtered.length))} dari ${num(filtered.length)} mesin` : "0 mesin";
    if ($("capacity-resource-page")) $("capacity-resource-page").textContent = `${num(capacityUiState.page)} / ${num(totalPages)}`;
    if ($("capacity-resource-prev")) $("capacity-resource-prev").disabled = capacityUiState.page <= 1;
    if ($("capacity-resource-next")) $("capacity-resource-next").disabled = capacityUiState.page >= totalPages;
    persistCapacityUiState();
    return filtered.slice(start, start + size);
  }
  function rerenderCapacityResources({ resetPage = false } = {}) {
    if (resetPage) capacityUiState.page = 1;
    persistCapacityUiState();
    if (snapshot) renderHeatmap(false);
  }
  function applyCapacityWorkbenchFilter() {
    const toolbar = $("capacity-workbench-toolbar");
    if (!toolbar) return;
    toolbar.hidden = capacityUiState.workbench === "schedule";
    if (toolbar.hidden) return;
    const panel = document.querySelector(`[data-capacity-workbench-panel="${CSS.escape(capacityUiState.workbench)}"]`);
    if (!panel) return;
    const emptyNodes = [...panel.querySelectorAll(".capacity-empty")];
    const nodes = capacityUiState.workbench === "readiness"
      ? [...panel.querySelectorAll(".capacity-issue")]
      : [...panel.querySelectorAll("tbody > tr:not(.capacity-allocation-audit-row)")].filter((row) => !row.querySelector(".capacity-empty") && !row.classList.contains("capacity-empty"));
    const query = String(capacityUiState.detailSearch || "").trim().toLowerCase();
    const filtered = nodes.filter((node) => !query || node.textContent.toLowerCase().includes(query));
    const size = [25, 50, 100].includes(number(capacityUiState.detailPageSize)) ? number(capacityUiState.detailPageSize) : 25;
    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    capacityUiState.detailPage = Math.min(Math.max(number(capacityUiState.detailPage) || 1, 1), totalPages);
    const start = (capacityUiState.detailPage - 1) * size;
    nodes.forEach((node) => { node.hidden = true; if (node.nextElementSibling?.classList.contains("capacity-allocation-audit-row")) node.nextElementSibling.hidden = true; });
    emptyNodes.forEach((node) => { const row = node.closest("tr") || node; row.hidden = nodes.length > 0; });
    filtered.slice(start, start + size).forEach((node) => { node.hidden = false; if (node.nextElementSibling?.classList.contains("capacity-allocation-audit-row")) node.nextElementSibling.hidden = false; });
    $("capacity-workbench-result").textContent = filtered.length ? `${num(start + 1)}–${num(Math.min(start + size, filtered.length))} dari ${num(filtered.length)} data` : query && nodes.length ? "0 data cocok" : "0 data";
    $("capacity-workbench-page").textContent = `${num(capacityUiState.detailPage)} / ${num(totalPages)}`;
    $("capacity-workbench-prev").disabled = capacityUiState.detailPage <= 1;
    $("capacity-workbench-next").disabled = capacityUiState.detailPage >= totalPages;
    persistCapacityUiState();
  }
  function activateCapacityWorkbench(name, { scroll = false } = {}) {
    const allowed = ["schedule", "delivery", "vendor", "unscheduled", "readiness", "process"];
    const next = allowed.includes(name) ? name : "schedule";
    if (next !== capacityUiState.workbench) {
      capacityUiState.detailPage = 1;
      capacityUiState.detailSearch = "";
      if ($("capacity-workbench-search")) $("capacity-workbench-search").value = "";
    }
    capacityUiState.workbench = next;
    document.querySelectorAll("[data-capacity-workbench-panel]").forEach((panel) => { panel.hidden = panel.dataset.capacityWorkbenchPanel !== capacityUiState.workbench; });
    document.querySelectorAll("[data-capacity-workbench]").forEach((button) => { const active = button.dataset.capacityWorkbench === capacityUiState.workbench; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    applyCapacityWorkbenchFilter();
    persistCapacityUiState();
    if (scroll) document.querySelector(".capacity-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function capacityAttentionBuckets() {
    const overload = [];
    for (const machine of (snapshot?.machines || [])) for (const date of (snapshot?.dates || [])) {
      const cell = machine.cells?.[date];
      if (cell && (number(cell.loadPercent) > 100 || String(cell.status).toLowerCase() === "overload")) overload.push({ kind: "overload", title: `${machine.machineCode} · ${num(cell.loadPercent, 1)}%`, detail: `${date} · ${hours(cell.loadMinutes)} load / ${hours(cell.availableMinutes)} available`, machineId: machine.id, date });
    }
    const delivery = (snapshot?.deliveryCoverage?.phases || []).filter((phase) => phase.status !== "COVERED").map((phase) => ({ kind: "blocking", title: `${phase.partCode} · Delivery ${phase.plannedDate}`, detail: `Phase ${phase.phaseNumber || "-"} shortage ${qty(phase.shortageQty, phase.uomCode)} ${phase.uomCode || ""}`, workbench: "delivery" }));
    const unscheduled = (snapshot?.unscheduled || []).map((item) => ({ kind: "warning", title: `${item.partCode || item.reference} · ${item.processCode || "Process"}`, detail: `${item.reason || "Belum terjadwal"} · warning tindak lanjut · ${num(item.minutes, 1)} menit`, workbench: "unscheduled" }));
    const vendor = (snapshot?.vendorAssignments || []).filter((item) => item.status === "AT_RISK" || !item.vendorId || (item.riskReasons || []).length).map((item) => ({ kind: "vendor", title: `${item.partCode || item.planNumber} · ${item.processCode || item.processName || "Vendor"}`, detail: `${item.sendDate || item.scheduleDate || "-"} → ${item.returnDate || "-"} · ${(item.riskReasons || []).join(", ") || "Vendor belum ditentukan"}`, workbench: "vendor" }));
    const readiness = (snapshot?.readiness?.issues || []).filter((issue) => ["blocking", "warning", "overridable"].includes(issue.severity)).map((issue) => ({ kind: issue.severity === "blocking" ? "blocking" : "warning", title: issue.code || issue.category || "Master data", detail: compactIssueMessage(issue), workbench: "readiness" }));
    return { all: [...delivery, ...overload, ...unscheduled, ...vendor, ...readiness], overload, unscheduled, vendor, readiness };
  }
  function renderCapacityAttention() {
    const buckets = capacityAttentionBuckets();
    ["all", "overload", "unscheduled", "vendor", "readiness"].forEach((key) => { const node = $(`capacity-attention-count-${key}`); if (node) node.textContent = num(buckets[key].length); });
    const active = buckets[capacityUiState.attention] ? capacityUiState.attention : "all";
    document.querySelectorAll("[data-capacity-attention]").forEach((button) => button.classList.toggle("active", button.dataset.capacityAttention === active));
    const items = buckets[active].slice(0, 8);
    $("capacity-attention-list").innerHTML = items.map((item) => `<article class="capacity-attention-item ${esc(item.kind)}"><i aria-hidden="true"></i><div><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></div><button class="btn btn-sm btn-outline-primary" type="button" ${item.machineId ? `data-capacity-attention-machine="${esc(item.machineId)}" data-capacity-attention-date="${esc(item.date)}"` : `data-capacity-attention-workbench="${esc(item.workbench)}"`}>Buka</button></article>`).join("") || '<div class="capacity-empty">Tidak ada masalah pada kategori ini.</div>';
  }
  function renderCapacityWorkbenchCounts() {
    const values = { delivery: (snapshot?.deliveryCoverage?.phases || []).filter((phase) => phase.status !== "COVERED").length, vendor: (snapshot?.vendorAssignments || []).length, unscheduled: (snapshot?.unscheduled || []).length, readiness: (snapshot?.readiness?.issues || []).length, process: (snapshot?.processLoad || []).length };
    Object.entries(values).forEach(([key, value]) => { const node = $(`capacity-workbench-count-${key}`); if (node) node.textContent = num(value); });
    if ($("capacity-vendor-timeline-count")) $("capacity-vendor-timeline-count").textContent = `${num(values.vendor)} allocation`;
  }
  function renderHeatmap(includeVendor = true) {
    const machines = pagedCapacityRows();
    const columnMarkup = `<col class="capacity-resource-col">${snapshot.dates.map(() => '<col class="capacity-day-col">').join("")}`;
    const heatmapWidth = 248 + snapshot.dates.length * 108;
    ["capacity-heatmap-cols", "capacity-vendor-heatmap-cols"].forEach((id) => { const node = $(id); if (node) node.innerHTML = columnMarkup; });
    ["capacity-machine-heatmap", "capacity-vendor-heatmap"].forEach((id) => {
      const table = $(id);
      if (table) table.style.width = `${heatmapWidth}px`;
    });
    $("capacity-heatmap-head").innerHTML = `<tr><th>Machine / Line</th>${snapshot.dates.map((date) => `<th>${esc(weekday(date))}<br><b>${esc(monthLabel(date))}</b></th>`).join("")}</tr>`;
    $("capacity-heatmap-body").innerHTML = machines.map((machine) => `<tr><td><div class="capacity-machine"><b>${esc(machine.machineCode)} · ${esc(machine.machineName || "-")}</b><span>${esc(machine.machineSpecificationCode || "SPEC BELUM DIISI")}</span><small>${esc(machine.machineSpecificationName || machine.machineFamily || machine.lineCode || machine.machineType || "-")} · ${esc(machine.status)} · ${num(machine.defaultAvailableMinutes)} menit/hari</small></div></td>${snapshot.dates.map((date) => { const cell = machine.cells[date]; return `<td><button class="capacity-cell ${esc(cell.status)}" type="button" data-machine="${esc(machine.id)}" data-date="${esc(date)}"><b>${num(cell.loadPercent, 1)}%</b><span>${num(cell.loadMinutes)} / ${num(cell.availableMinutes)} min</span><small>F ${num(cell.firmMinutes)} · P ${num(cell.proposedMinutes)}</small></button></td>`; }).join("")}</tr>`).join("") || `<tr><td colspan="${snapshot.dates.length + 1}" class="capacity-empty">Tidak ada mesin yang cocok dengan filter.</td></tr>`;
    machines.forEach((machine) => snapshot.dates.forEach((date) => {
      const cell = machine.cells[date];
      const rule = cell.capacityRule || {};
      const ruleLabel = `${cell.dayOverride ? "Harian" : "Default"} S${number(rule.shiftsPerDay)}${number(rule.overtimeMinutes) ? ` +OT ${num(rule.overtimeMinutes)}m` : ""}`;
      const button = document.querySelector(`[data-machine="${CSS.escape(machine.id)}"][data-date="${CSS.escape(date)}"]`);
      if (!button) return;
      button.classList.toggle("daily-rule", Boolean(cell.dayOverride));
      button.title = ruleLabel;
      const note = button.querySelector("small");
      if (note) note.textContent = ruleLabel;
    }));
    if (includeVendor) renderVendorHeatmap();
    $("capacity-loading").classList.add("d-none");
    renderCapacityViews();
  }
  function renderVendorHeatmap() {
    const assignments = snapshot?.vendorAssignments || [];
    if ($("capacity-vendor-timeline-count")) $("capacity-vendor-timeline-count").textContent = `${num(assignments.length)} allocation`;
    const vendorCatalog = new Map((snapshot?.catalogs?.vendors || []).map((vendor) => [vendor.id, vendor]));
    const vendorIds = [...new Set(assignments.map((item) => item.vendorId || "UNASSIGNED"))];
    $("capacity-vendor-heatmap-head").innerHTML = `<tr><th>Vendor / Lead Time</th>${snapshot.dates.map((date) => `<th>${esc(weekday(date))}<br><b>${esc(monthLabel(date))}</b></th>`).join("")}</tr>`;
    $("capacity-vendor-heatmap-body").innerHTML = vendorIds.map((vendorId) => {
      const vendor = vendorCatalog.get(vendorId) || {};
      const vendorAssignments = assignments.filter((item) => (item.vendorId || "UNASSIGNED") === vendorId);
      const cells = snapshot.dates.map((date) => {
        const items = vendorAssignments.filter((item) => date >= (item.sendDate || item.scheduleDate) && date <= (item.returnDate || item.sendDate || item.scheduleDate));
        if (!items.length) return '<td><div class="capacity-cell capacity-vendor-cell empty" aria-label="Tidak ada proses vendor"><b>—</b><small>Tidak ada proses</small></div></td>';
        const sends = items.filter((item) => date === (item.sendDate || item.scheduleDate));
        const returns = items.filter((item) => date === (item.returnDate || item.sendDate || item.scheduleDate));
        const atRisk = items.some((item) => item.status === "AT_RISK" || (item.riskReasons || []).length);
        const state = sends.length && returns.length ? "turnaround" : returns.length ? "return" : sends.length ? "send" : "active";
        const label = state === "turnaround" ? "KELUAR + MASUK" : state === "return" ? "MASUK" : state === "send" ? "KELUAR" : "DI VENDOR";
        const sendQty = sends.reduce((sum, item) => sum + number(item.qty), 0);
        const returnQty = returns.reduce((sum, item) => sum + number(item.expectedReturnQty ?? item.qty), 0);
        const activeQty = items.reduce((sum, item) => sum + number(item.qty), 0);
        const qtyLabel = state === "turnaround"
          ? `K ${num(sendQty, 3)} · M ${num(returnQty, 3)}`
          : `${num(state === "send" ? sendQty : state === "return" ? returnQty : activeQty, 3)} ${esc(items[0].uomCode || "")}`;
        const references = [...new Set(items.map((item) => `${item.partCode || "Part"} · ${item.processCode || item.processName || "Process"}`))];
        const sendDates = [...new Set(items.map((item) => item.sendDate || item.scheduleDate).filter(Boolean))];
        const returnDates = [...new Set(items.map((item) => item.returnDate || item.sendDate || item.scheduleDate).filter(Boolean))];
        return `<td><button type="button" class="capacity-cell capacity-vendor-cell ${state} ${atRisk ? "risk" : ""}" data-vendor-heatmap-allocation="${esc(items.find((item) => ["MANUAL", "RECOMMENDED"].includes(item.source))?.allocationId || "")}" title="${esc(references.join(" | "))}"><b>${label}</b><span>${qtyLabel}</span><small>S ${esc(sendDates[0]?.slice(5) || "-")} · R ${esc(returnDates.at(-1)?.slice(5) || "-")}${atRisk ? " · RISK" : ""}</small></button></td>`;
      }).join("");
      const confirmedPlanningDays = [...new Set(vendorAssignments.filter((item) => item.leadTimeSource === "DEMAND_PLANNING_CONFIRMED").map((item) => number(item.planningLeadTimeDays)).filter((value) => value > 0))];
      const masterDays = number(vendorAssignments.find((item) => number(item.masterLeadTimeDays) > 0)?.masterLeadTimeDays ?? vendor.leadTimeDays);
      const confirmedPlanning = vendorAssignments.some((item) => item.leadTimeSource === "DEMAND_PLANNING_CONFIRMED");
      const leadLabel = confirmedPlanning && confirmedPlanningDays.length
        ? `Customer ${num(confirmedPlanningDays[0])} hari · Master / buffer ${num(masterDays)} hari`
        : `Master ${num(masterDays)} hari`;
      return `<tr><td><div class="capacity-machine capacity-vendor-identity"><b>${esc(vendor.vendorCode || "Belum dipilih")}</b><span>${esc(vendor.vendorName || "Vendor belum ditentukan")}</span><small>${leadLabel} · ${vendorAssignments.length} allocation</small>${confirmedPlanning ? '<em>Confirmed Demand Planning / SO</em>' : ""}</div></td>${cells}</tr>`;
    }).join("") || `<tr><td colspan="${snapshot.dates.length + 1}" class="capacity-empty">Belum ada allocation vendor pada horizon ini.</td></tr>`;
  }
  function ganttRows(machineIds = null) {
    const rows = new Map();
    for (const machine of snapshot.machines.filter((row) => !machineIds || machineIds.has(row.id))) {
      for (const date of snapshot.dates) {
        const cell = machine.cells[date];
        for (const item of (cell?.items || []).filter((entry) => ["FIRM", "PROPOSED", "MANUAL", "RECOMMENDED"].includes(entry.source))) {
          const key = [machine.id, item.reference || item.planNumber, item.lineNumber, item.partCode, item.processCode].join("|");
          const row = rows.get(key) || { machine, reference: item.reference || item.planNumber || "-", lineNumber: item.lineNumber, partCode: item.partCode || "-", processCode: item.processCode || "-", cells: new Map() };
          const entry = row.cells.get(date) || { qty: 0, minutes: 0, sources: new Set(), status: cell.status };
          entry.qty += number(item.qty);
          entry.minutes += number(item.minutes);
          entry.sources.add(item.source);
          row.cells.set(date, entry);
          rows.set(key, row);
        }
      }
    }
    return [...rows.values()].sort((a, b) => a.machine.machineCode.localeCompare(b.machine.machineCode) || a.reference.localeCompare(b.reference) || number(a.lineNumber) - number(b.lineNumber));
  }
  function renderGantt(machineIds = null) {
    const target = $("capacity-gantt-view");
    const rows = ganttRows(machineIds);
    const dateHeaders = snapshot.dates.map((date) => `<div class="capacity-gantt-date"><small>${esc(weekday(date))}</small><b>${esc(monthLabel(date))}</b></div>`).join("");
    const body = rows.slice(0, 150).map((row) => `<div class="capacity-gantt-label"><b>${esc(row.partCode)} · ${esc(row.processCode)}</b><span>${esc(row.reference)}${row.lineNumber ? ` · L${num(row.lineNumber)}` : ""}</span><small>${esc(row.machine.machineCode)} · ${esc(row.machine.machineName || "-")}</small></div>${snapshot.dates.map((date) => {
      const entry = row.cells.get(date);
      if (!entry) return '<div class="capacity-gantt-slot"></div>';
      const source = entry.sources.has("FIRM") ? "firm" : entry.sources.has("MANUAL") ? "manual" : "proposed";
      const dies = (snapshot?.catalogs?.dies || []).find((item) => item.id === entry.diesId);
      return `<div class="capacity-gantt-slot"><button type="button" class="capacity-gantt-bar ${source} ${esc(entry.status)}" data-machine="${esc(row.machine.id)}" data-date="${esc(date)}" title="${esc(entry.reference)} · ${qty(entry.qty, entry.uomCode)} ${esc(entry.uomCode || "")} · ${num(entry.minutes, 1)} menit${dies ? ` · Dies ${esc(dies.diesCode)}` : ""}"><b>${qty(entry.qty, entry.uomCode)}</b><span>${num(entry.minutes)}m</span></button></div>`;
    }).join("")}`).join("");
    target.innerHTML = rows.length
      ? `<div class="capacity-gantt-scroll"><div class="capacity-gantt-grid" style="--gantt-days:${snapshot.dates.length}"><div class="capacity-gantt-corner"><small>Routing Load</small><b>Part / Process / Machine</b></div>${dateHeaders}${body}</div></div>${rows.length > 150 ? `<p class="capacity-view-note">Menampilkan 150 dari ${num(rows.length)} routing load. Persempit horizon atau Production Plan untuk detail lengkap.</p>` : ""}`
      : '<div class="capacity-empty">Belum ada firm/manual allocation untuk ditampilkan pada Gantt.</div>';
  }
  function renderCalendar(machines = snapshot.machines) {
    const target = $("capacity-calendar-view");
    if (!snapshot.dates.length) {
      target.innerHTML = '<div class="capacity-empty">Horizon kalender belum tersedia.</div>';
      return;
    }
    const first = new Date(`${snapshot.dates[0]}T00:00:00`);
    const mondayOffset = (first.getDay() + 6) % 7;
    const blanks = Array.from({ length: mondayOffset }, () => '<div class="capacity-calendar-day is-blank"></div>').join("");
    const phases = snapshot.deliveryCoverage?.phases || [];
    const cards = snapshot.dates.map((date) => {
      const machineCells = machines.map((machine) => ({ machine, cell: machine.cells[date] })).filter((entry) => entry.cell);
      const available = machineCells.reduce((sum, entry) => sum + number(entry.cell.availableMinutes), 0);
      const loadMinutes = machineCells.reduce((sum, entry) => sum + number(entry.cell.loadMinutes), 0);
      const utilization = available ? loadMinutes / available * 100 : 0;
      const loaded = machineCells.filter((entry) => number(entry.cell.loadMinutes) > 0);
      const hottest = [...machineCells].sort((a, b) => number(b.cell.loadPercent) - number(a.cell.loadPercent))[0];
      const taskLabels = [...new Set(loaded.flatMap((entry) => (entry.cell.items || []).map((item) => `${item.partCode || item.reference || "-"} · ${item.processCode || "-"}`)))].slice(0, 3);
      const duePhases = phases.filter((phase) => String(phase.plannedDate).slice(0, 10) === date);
      const status = !available ? "unavailable" : utilization > 100 ? "overload" : utilization >= 85 ? "high" : utilization > 0 ? "loaded" : "available";
      return `<button type="button" class="capacity-calendar-day ${status}" ${hottest ? `data-machine="${esc(hottest.machine.id)}" data-date="${esc(date)}"` : "disabled"}><div class="capacity-calendar-day-head"><span>${esc(weekday(date))}</span><b>${new Date(`${date}T00:00:00`).getDate()}</b></div><div class="capacity-calendar-util"><strong>${num(utilization, 1)}%</strong><small>${hours(loadMinutes)} / ${hours(available)}</small></div><div class="capacity-calendar-tasks">${taskLabels.map((label) => `<span>${esc(label)}</span>`).join("") || "<span>Belum ada load</span>"}</div>${duePhases.length ? `<div class="capacity-calendar-phases">${duePhases.slice(0, 2).map((phase) => `<em class="${phase.status === "COVERED" ? "covered" : "blocked"}">${esc(phase.phaseNumber)} · ${esc(phase.partCode)}</em>`).join("")}</div>` : ""}</button>`;
    }).join("");
    target.innerHTML = `<div class="capacity-calendar-weekdays"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div><div class="capacity-calendar-grid">${blanks}${cards}</div>`;
  }
  function machineSummary(machine) {
    const cells = snapshot.dates.map((date) => machine.cells[date]).filter(Boolean);
    const availableMinutes = cells.reduce((sum, cell) => sum + number(cell.availableMinutes), 0);
    const firmMinutes = cells.reduce((sum, cell) => sum + number(cell.firmMinutes), 0);
    const proposedMinutes = cells.reduce((sum, cell) => sum + number(cell.proposedMinutes), 0);
    const loadMinutes = cells.reduce((sum, cell) => sum + number(cell.loadMinutes), 0);
    const loadPercent = availableMinutes ? loadMinutes / availableMinutes * 100 : 0;
    const status = !availableMinutes ? "Unavailable" : loadPercent > 100 ? "Overload" : loadPercent >= 85 ? "High" : loadPercent > 0 ? "Loaded" : "Available";
    return { ...machine, availableMinutes, firmMinutes, proposedMinutes, loadMinutes, loadPercent, status };
  }
  function renderCapacityViews() {
    if (!snapshot) return;
    const allowed = ["table", "heatmap", "gantt", "calendar"];
    if (!allowed.includes(activeCapacityView)) activeCapacityView = "heatmap";
    const rows = pagedCapacityRows();
    const machineIds = new Set(rows.map((row) => row.id));
    renderGantt(machineIds);
    renderCalendar(rows);
    const views = {
      table: $("capacity-table-view"),
      heatmap: $("capacity-heatmap-wrap"),
      gantt: $("capacity-gantt-view"),
      calendar: $("capacity-calendar-view"),
    };
    Object.entries(views).forEach(([name, element]) => element.classList.toggle("d-none", name !== activeCapacityView));
    document.querySelectorAll("[data-list-view]").forEach((button) => { const active = button.dataset.listView === activeCapacityView; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    const viewCopy = {
      heatmap: ["Daily Machine Capacity", "Cari atau tampilkan exception saja. Klik mesin–tanggal untuk membuka detail schedule."],
      gantt: ["Production Routing Gantt", "Gantt mengikuti filter dan halaman resource aktif agar tetap ringan pada data besar."],
      calendar: ["Capacity Calendar", "Kalender merangkum resource pada hasil filter dan halaman aktif."],
      table: ["Machine Capacity Table", "Tabel mengikuti pencarian, status, dan jumlah baris per halaman."],
    };
    $("capacity-main-view-title").textContent = viewCopy[activeCapacityView][0];
    $("capacity-main-view-help").textContent = viewCopy[activeCapacityView][1];
    $("capacity-machine-summary-body").innerHTML = rows.map((row) => `<tr><td><b>${esc(row.machineCode)}</b><small class="d-block">${esc(row.machineName || "-")}</small></td><td>${esc(row.lineCode || row.machineType || "-")}</td><td>${hours(row.availableMinutes)}</td><td>${hours(row.firmMinutes)}</td><td>${hours(row.proposedMinutes)}</td><td><b>${hours(row.loadMinutes)}</b></td><td>${num(row.loadPercent, 1)}%</td><td><span class="capacity-source ${esc(row.status.toLowerCase())}">${esc(row.status)}</span></td></tr>`).join("") || '<tr><td colspan="8" class="capacity-empty">Tidak ada mesin yang cocok dengan filter.</td></tr>';
  }
  function manualTasksForMachine(machineId) {
    return (snapshot?.manualAllocationCatalog || []).map((task) => {
      const isEditedTask = editingAllocation
        && task.planNumber === editingAllocation.planNumber
        && number(task.lineNumber) === number(editingAllocation.lineNumber)
        && task.mbomProcessId === editingAllocation.mbomProcessId;
      return isEditedTask ? { ...task, remainingQty: number(task.remainingQty) + number(editingAllocation.qty) } : task;
    }).filter((task) =>
      ["Draft", "Confirmed", "Released", "In Progress"].includes(task.planStatus)
      && (task.routingMode === "VENDOR" || (task.allowedMachineIds || []).includes(machineId))
      && number(task.remainingQty) > 0);
  }
  function resetAllocationEditor() {
    editingAllocation = null;
    $("capacity-manual-allocation-id").value = "";
    $("capacity-manual-submit").textContent = "Alokasikan";
    $("capacity-manual-cancel-edit").classList.add("d-none");
    $("capacity-manual-plan").disabled = false;
    $("capacity-manual-task").disabled = false;
    $("capacity-manual-start").value = "";
    $("capacity-manual-end").value = "";
    $("capacity-manual-dies").value = "";
  }
  function allocationById(allocationId) {
    for (const machine of snapshot?.machines || []) for (const date of snapshot?.dates || []) {
      const found = (machine.cells?.[date]?.items || []).find((item) => item.allocationId === allocationId);
      if (found) return found;
    }
    return (snapshot?.vendorAssignments || []).find((item) => item.allocationId === allocationId)
      || (snapshot?.unscheduled || []).find((item) => item.allocationId === allocationId)
      || null;
  }
  function populateManualMachines(selectedMachineId = "") {
    $("capacity-manual-machine").innerHTML = (snapshot?.machines || []).filter((machine) => machine.status === "Active").map((machine) => `<option value="${esc(machine.id)}">${esc(machine.machineCode)} · ${esc(machine.machineName || "")} · ${esc(machine.machineSpecificationCode || "Tanpa spec")}</option>`).join("");
    if ([...$("capacity-manual-machine").options].some((option) => option.value === selectedMachineId)) $("capacity-manual-machine").value = selectedMachineId;
  }
  function refreshManualDies(selectedDiesId = null) {
    const task = selectedManualTask();
    const allowedIds = new Set(task?.allowedDiesIds || []);
    const required = Boolean(task?.requiresDies);
    const dies = (snapshot?.catalogs?.dies || []).filter((row) => !required || allowedIds.has(row.id));
    $("capacity-manual-dies").innerHTML = `${required ? '<option value="">Pilih Dies Press</option>' : '<option value="">Tidak diperlukan</option>'}${dies.map((row) => `<option value="${esc(row.id)}">${esc(row.diesCode)} · ${esc(row.diesType || row.diesName || "")} · ${num(row.tonnage)}T</option>`).join("")}`;
    const preferred = selectedDiesId || task?.diesId || "";
    if ([...$("capacity-manual-dies").options].some((option) => option.value === preferred)) $("capacity-manual-dies").value = preferred;
    $("capacity-manual-dies").required = required && $("capacity-manual-mode").value === "INHOUSE";
  }
  function startAllocationEdit(allocationId) {
    const allocation = allocationById(allocationId);
    if (!allocation) return alert("Allocation tidak ditemukan pada mode/skenario aktif.", "warning");
    editingAllocation = allocation;
    const machineId = allocation.machineId || selectedCell?.machineId || snapshot.machines?.[0]?.id || "";
    populateManualMachines(machineId);
    $("capacity-manual-date").value = allocation.scheduleDate || allocation.sendDate || selectedCell?.date || "";
    $("capacity-manual-allocation-id").value = allocation.allocationId;
    const tasks = manualTasksForMachine(machineId).filter((task) => task.planNumber === allocation.planNumber);
    $("capacity-manual-plan").innerHTML = `<option value="${esc(allocation.planNumber)}">${esc(allocation.planNumber)}</option>`;
    $("capacity-manual-plan").value = allocation.planNumber;
    $("capacity-manual-task").innerHTML = tasks.map((task) => `<option value="${esc(`${task.planNumber}|${task.lineNumber}|${task.mbomProcessId}`)}">${esc(task.partCode)} · ${esc(task.processCode || task.processName || `Seq ${task.sequence}`)}</option>`).join("") || `<option value="${esc(`${allocation.planNumber}|${allocation.lineNumber}|${allocation.mbomProcessId}`)}">${esc(allocation.partCode || "Part")} · ${esc(allocation.processCode || "Process")}</option>`;
    $("capacity-manual-task").value = `${allocation.planNumber}|${allocation.lineNumber}|${allocation.mbomProcessId}`;
    $("capacity-manual-mode").value = allocation.routingMode || "INHOUSE";
    $("capacity-manual-shift").value = allocation.shift === "VENDOR" ? "1" : String(allocation.shift || "1");
    $("capacity-manual-start").value = allocation.plannedStartTime || "";
    $("capacity-manual-end").value = allocation.plannedEndTime || "";
    refreshManualDies(allocation.diesId || null);
    $("capacity-manual-qty").value = number(allocation.qty);
    $("capacity-manual-vendor").innerHTML = '<option value="">Pilih vendor</option>' + (snapshot?.catalogs?.vendors || []).map((vendor) => `<option value="${esc(vendor.id)}">${esc(vendor.vendorCode)} · ${esc(vendor.vendorName || "")}</option>`).join("");
    $("capacity-manual-vendor").value = allocation.vendorId || "";
    $("capacity-manual-vendor-send").value = allocation.sendDate || allocation.scheduleDate || "";
    $("capacity-manual-vendor-return").value = allocation.returnDate || "";
    $("capacity-manual-vendor-return-qty").value = number(allocation.expectedReturnQty ?? allocation.qty);
    $("capacity-manual-notes").value = allocation.notes || allocation.reason || "";
    $("capacity-manual-freeze-reason").value = "";
    $("capacity-manual-submit").textContent = "Simpan Perubahan";
    $("capacity-manual-cancel-edit").classList.remove("d-none");
    $("capacity-manual-plan").disabled = true;
    $("capacity-manual-task").disabled = true;
    $("capacity-manual-allocation-form").classList.remove("d-none");
    $("capacity-manual-allocation-form").classList.remove("capacity-dialog-section-collapsed");
    document.querySelector('[data-capacity-dialog-section="capacity-manual-allocation-form"]')?.classList.add("active");
    toggleManualAllocationMode();
    renderManualRecommendation(false);
    const allocationDialog = $("capacity-allocation-dialog");
    if (allocationDialog && !allocationDialog.open) allocationDialog.showModal();
  }
  function toggleManualAllocationMode() {
    const vendorMode = $("capacity-manual-mode").value === "VENDOR";
    $("capacity-manual-machine").closest(".col-md-2").classList.toggle("d-none", vendorMode);
    $("capacity-manual-shift").closest(".col-md-2").classList.toggle("d-none", vendorMode);
    $("capacity-manual-start").closest(".col-md-2").classList.toggle("d-none", vendorMode);
    $("capacity-manual-end").closest(".col-md-2").classList.toggle("d-none", vendorMode);
    $("capacity-manual-dies").closest(".col-md-2").classList.toggle("d-none", vendorMode);
    $("capacity-manual-vendor-wrap").classList.toggle("d-none", !vendorMode);
    $("capacity-manual-vendor-schedule").classList.toggle("d-none", !vendorMode);
    $("capacity-manual-vendor").required = vendorMode;
    $("capacity-manual-vendor-send").required = vendorMode;
    $("capacity-manual-vendor-return").required = vendorMode;
    $("capacity-manual-vendor-return-qty").required = vendorMode;
    $("capacity-manual-dies").required = !vendorMode && Boolean(selectedManualTask()?.requiresDies);
  }
  function refreshVendorScheduleDefaults(forceReturnDate = false) {
    const task = selectedManualTask();
    const vendor = (snapshot?.catalogs?.vendors || []).find((item) => item.id === $("capacity-manual-vendor").value);
    const sendDate = $("capacity-manual-vendor-send").value || $("capacity-manual-date").value;
    const leadTimeDays = number(vendor?.leadTimeDays || task?.vendorLeadTimeDays);
    $("capacity-manual-vendor-send").value = sendDate;
    if (forceReturnDate || !$("capacity-manual-vendor-return").value) {
      $("capacity-manual-vendor-return").value = addDays(sendDate, leadTimeDays);
    }
    $("capacity-manual-vendor-return-qty").value = $("capacity-manual-qty").value || task?.remainingQty || "";
    $("capacity-manual-vendor-leadtime").textContent = vendor
      ? `${leadTimeDays} hari · ${vendor.vendorCode}`
      : "Pilih vendor; lead time diambil dari Vendor Master";
  }
  function selectedManualTask() {
    const taskKey = $("capacity-manual-task").value;
    const task = (snapshot?.manualAllocationCatalog || []).find((item) =>
      `${item.planNumber}|${item.lineNumber}|${item.mbomProcessId}` === taskKey);
    return task && editingAllocation ? { ...task, remainingQty: number(task.remainingQty) + number(editingAllocation.qty) } : task;
  }
  function renderManualRecommendation(setSuggestedQty = false) {
    const box = $("capacity-manual-recommendation");
    const task = selectedManualTask();
    if (!box || !task) {
      if (box) box.textContent = "Pilih MPP dan process untuk melihat rekomendasi kapasitas harian.";
      return;
    }
    const remainingQty = number(task.remainingQty);
    if ($("capacity-manual-mode").value === "VENDOR") {
      if (setSuggestedQty) $("capacity-manual-qty").value = remainingQty;
      box.className = "alert alert-info mb-0 py-2";
      box.innerHTML = `<b>Proses vendor:</b> tidak memakai kapasitas mesin internal. Maksimum berdasarkan sisa MPP: <b>${num(remainingQty, 3)} ${esc(task.uomCode || "")}</b>.`;
      return;
    }
    const machineId = $("capacity-manual-machine").value;
    const date = $("capacity-manual-date").value;
    const machine = snapshot?.machines?.find((item) => item.id === machineId);
    const cell = machine?.cells?.[date];
    const cycleMinutes = number(task.cycleMinutesByMachine?.[machineId]);
    const availableMinutes = number(cell?.availableMinutes);
    const editedLoadMinutes = editingAllocation
      && editingAllocation.routingMode !== "VENDOR"
      && editingAllocation.machineId === machineId
      && editingAllocation.scheduleDate === date
      ? number(editingAllocation.minutes)
      : 0;
    const existingLoadMinutes = Math.max(number(cell?.firmMinutes) + number(cell?.proposedMinutes) - editedLoadMinutes, 0);
    const freeMinutes = Math.max(availableMinutes - existingLoadMinutes, 0);
    if (!cell || cycleMinutes <= 0 || availableMinutes <= 0) {
      if (setSuggestedQty) $("capacity-manual-qty").value = "";
      box.className = "alert alert-warning mb-0 py-2";
      box.textContent = !cell ? "Cell mesin–tanggal tidak tersedia." : cycleMinutes <= 0 ? "Cycle time belum tersedia; rekomendasi qty belum dapat dihitung." : "Kapasitas tersedia hari ini 0 menit.";
      return;
    }
    const discreteUom = /^(PCS|PC|EA|UNIT|SET|PAIR)$/i.test(String(task.uomCode || "").trim());
    const rawCapacityQty = freeMinutes / cycleMinutes;
    const capacityQty = discreteUom ? Math.floor(rawCapacityQty) : Math.floor(rawCapacityQty * 1000) / 1000;
    const recommendedQty = Math.max(Math.min(remainingQty, capacityQty), 0);
    if (setSuggestedQty) $("capacity-manual-qty").value = recommendedQty || "";
    const inputQty = number($("capacity-manual-qty").value);
    const inputMinutes = inputQty * cycleMinutes;
    const addedPercent = availableMinutes > 0 ? inputMinutes / availableMinutes * 100 : 0;
    const totalPercent = availableMinutes > 0 ? (existingLoadMinutes + inputMinutes) / availableMinutes * 100 : 0;
    const overload = totalPercent > 100.0001;
    box.className = `alert ${overload ? "alert-warning" : "alert-info"} mb-0 py-2`;
    box.innerHTML = `<b>Rekomendasi maksimum: ${num(recommendedQty, 3)} ${esc(task.uomCode || "")}</b> · sisa ${num(freeMinutes, 1)} menit · cycle ${num(cycleMinutes, 4)} menit/unit.<br>Qty input memakai <b>${num(inputMinutes, 1)} menit (${num(addedPercent, 1)}%)</b>; total kapasitas harian menjadi <b>${num(totalPercent, 1)}%</b>${overload ? " — melebihi kapasitas harian." : "."}`;
  }
  function refreshManualTaskOptions() {
    const machineId = $("capacity-manual-machine").value;
    const planNumber = $("capacity-manual-plan").value;
    const tasks = manualTasksForMachine(machineId).filter((task) => task.planNumber === planNumber);
    const retainedTaskKey = $("capacity-manual-task").value;
    $("capacity-manual-task").innerHTML = tasks.map((task) => `<option value="${esc(`${task.planNumber}|${task.lineNumber}|${task.mbomProcessId}`)}">${esc(task.partCode)} · ${esc(task.processCode || task.processName || `Seq ${task.sequence}`)} · sisa ${num(task.remainingQty, 3)} ${esc(task.uomCode || "")}</option>`).join("") || '<option value="">Tidak ada proses tersisa pada mesin ini</option>';
    if (tasks.some((task) => `${task.planNumber}|${task.lineNumber}|${task.mbomProcessId}` === retainedTaskKey)) $("capacity-manual-task").value = retainedTaskKey;
    const selected = tasks.find((task) => `${task.planNumber}|${task.lineNumber}|${task.mbomProcessId}` === $("capacity-manual-task").value) || tasks[0];
    $("capacity-manual-qty").value = selected ? selected.remainingQty : "";
    $("capacity-manual-qty").max = selected ? selected.remainingQty : "";
    $("capacity-manual-vendor").innerHTML = '<option value="">Pilih vendor</option>' + (snapshot?.catalogs?.vendors || []).map((vendor) => `<option value="${esc(vendor.id)}">${esc(vendor.vendorCode)} · ${esc(vendor.vendorName || "")} · LT ${num(vendor.leadTimeDays)} hari</option>`).join("");
    $("capacity-manual-mode").value = selected?.routingMode === "VENDOR" ? "VENDOR" : "INHOUSE";
    if (selected?.vendorId) $("capacity-manual-vendor").value = selected.vendorId;
    refreshManualDies(editingAllocation?.diesId || selected?.diesId || null);
    $("capacity-manual-vendor-send").value = $("capacity-manual-date").value || selected?.recommendedSendDate || "";
    $("capacity-manual-vendor-return").value = selected?.recommendedReturnDate || "";
    $("capacity-manual-vendor-return-qty").value = selected ? selected.remainingQty : "";
    toggleManualAllocationMode();
    refreshVendorScheduleDefaults(false);
    $("capacity-manual-help").textContent = selected
      ? `${selected.partCode} · ${selected.processCode || selected.processName || "Process"} · sisa ${num(selected.remainingQty, 3)} ${selected.uomCode || ""}. Boleh dialokasikan parsial.`
      : "Tidak ada outstanding MPP/routing yang dapat dialokasikan pada mesin ini.";
    renderManualRecommendation(true);
  }
  function renderDeliveryCoverage() {
    const coverage = snapshot?.deliveryCoverage || { ready: true, blockingCount: 0, phases: [] };
    const badge = $("capacity-delivery-coverage-badge");
    badge.className = `capacity-readiness-badge ${coverage.ready ? "ready" : "blocked"}`;
    badge.textContent = coverage.ready ? "Delivery Covered" : `${num(coverage.blockingCount)} Phase Blocked`;
    $("capacity-delivery-coverage-body").innerHTML = (coverage.phases || []).map((phase) => `<tr><td><b>${phase.phaseNumber ? `Phase ${num(phase.phaseNumber)}` : "Belum dibuat"}</b></td><td>${esc(phase.planNumber)}</td><td><b>${esc(phase.partCode)}</b><small class="d-block">Part Number: ${esc(phase.partNumber || '—')}</small></td><td>${esc(phase.targetType)} · ${esc(phase.targetCode)}</td><td>${esc(phase.plannedDate)}</td><td><b>${esc(phase.targetFgDate || phase.plannedDate)}</b><small class="d-block">FG harus selesai</small></td><td class="ppic-number">${qty(phase.cumulativeRequiredQty, phase.uomCode)} ${esc(phase.uomCode || "")}</td><td class="ppic-number">${qty(phase.plannedQtyByDueDate, phase.uomCode)}</td><td class="ppic-number">${qty(phase.shortageQty, phase.uomCode)}</td><td><span class="capacity-readiness-badge ${phase.status === "COVERED" ? "ready" : "blocked"}">${esc(phase.status)}</span></td></tr>`).join("") || '<tr><td colspan="10" class="capacity-empty">Belum ada delivery phase pada MPS sumber.</td></tr>';
  }
  function renderVendorAllocations() {
    const vendors = new Map((snapshot?.catalogs?.vendors || []).map((vendor) => [vendor.id, vendor]));
    $("capacity-vendor-allocation-body").innerHTML = (snapshot?.vendorAssignments || []).map((item) => {
      const vendor = vendors.get(item.vendorId);
      const action = item.planNumber
        ? `<a class="btn btn-sm btn-outline-primary" href="${esc(monthlyPlanHref(item.planNumber))}">Ubah di Monthly Plan</a>`
        : "-";
      const risk = Array.isArray(item.riskReasons) && item.riskReasons.length
        ? `<small class="d-block text-danger">${esc(item.riskReasons.join(", "))}</small>`
        : "";
      const allocationRow = `<tr><td>${esc(item.sendDate || item.scheduleDate)}</td><td>${esc(item.returnDate || "-")}<small class="d-block">Need ${esc(item.requiredDate || "-")}</small></td><td><b>${esc(item.planNumber)}</b><small class="d-block">Line ${num(item.lineNumber)}</small></td><td><b>${esc(item.partCode)}</b><small class="d-block">Part Number: ${esc(item.partNumber || '—')}</small><small class="d-block">${esc(item.processCode || item.processName)}</small></td><td>${esc(vendor?.vendorCode || item.vendorId)}<small class="d-block">${esc(vendor?.vendorName || "")}</small></td><td>${num(item.qty, 3)} ${esc(item.uomCode || "")}</td><td>${num(item.expectedReturnQty ?? item.qty, 3)} ${esc(item.uomCode || "")}</td><td>${num(item.plannedLeadTimeDays)} hari<small class="d-block">Master ${num(item.masterLeadTimeDays)} hari</small></td><td><span class="capacity-source ${esc(String(item.status || "").toLowerCase())}">${esc(item.status || item.source)}</span>${risk}</td><td>${action}</td></tr>`;
      const auditRow = item.source === "RECOMMENDED" ? `<tr class="capacity-allocation-audit-row"><td colspan="10">${allocationScoreDetail(item)}</td></tr>` : "";
      return `${allocationRow}${auditRow}`;
    }).join("") || '<tr><td colspan="10" class="capacity-empty">Belum ada proses yang dialokasikan ke vendor.</td></tr>';
  }
  function renderCell(machineId, date, openDialog = false) {
    if (openDialog) resetAllocationEditor();
    selectedCell = { machineId, date };
    document.querySelectorAll(".capacity-cell.selected").forEach((element) => element.classList.remove("selected"));
    const button = document.querySelector(`[data-machine="${CSS.escape(machineId)}"][data-date="${CSS.escape(date)}"]`); button?.classList.add("selected");
    const machine = snapshot.machines.find((row) => row.id === machineId); const cell = machine?.cells?.[date];
    if (!machine || !cell) return;
    $("capacity-detail-title").textContent = `${machine.machineCode} · ${machine.machineSpecificationCode || "SPEC BELUM DIISI"} · ${monthLabel(date)}`;
    $("capacity-detail-subtitle").textContent = `Available ${num(cell.availableMinutes)} min · Firm ${num(cell.firmMinutes)} min · Proposed ${num(cell.proposedMinutes)} min · Downtime ${num(cell.downtimeMinutes)} min`;
    const setting = cell.dayOverride || {};
    const rule = cell.capacityRule || {};
    const ruleSource = cell.dayOverride ? "aturan harian" : "default header";
    const historical = isPastDate(date);
    $("capacity-detail-subtitle").textContent = historical
      ? `${date} sudah lewat dan dikunci sebagai histori Production. Data tetap dapat dilihat, tetapi preset, kalender, dan allocation tidak dapat diubah.`
      : `Available ${num(cell.availableMinutes)} min · ${ruleSource}: ${num(rule.shiftsPerDay)} shift, OT ${num(rule.overtimeMinutes)} min · Firm ${num(cell.firmMinutes)} min · Proposed ${num(cell.proposedMinutes)} min`;
    $("capacity-cell-form").classList.toggle("d-none", historical);
    $("capacity-cell-machine").value = machineId;
    $("capacity-cell-date").value = date;
    $("capacity-cell-status").value = setting.dayStatus || "WORKING";
    $("capacity-cell-shifts").value = setting.shiftsPerDay || rule.shiftsPerDay || $("capacity-shifts").value;
    $("capacity-cell-reason").value = setting.reason || "";
    const preset = activePreset(); const shifts = setting.shiftOverrides || setting.shifts || rule.shifts || preset?.shifts || defaultShiftWindows;
    const activeShiftCount = number(setting.shiftsPerDay || rule.shiftsPerDay || $("capacity-shifts").value);
    defaultShiftWindows.forEach((fallback, index) => {
      const shift = shifts[index] || fallback;
      const startInput = $(`capacity-cell-shift-${index + 1}-start`);
      const endInput = $(`capacity-cell-shift-${index + 1}-end`);
      startInput.value = shift.startTime || shift.start || fallback.start;
      endInput.value = shift.endTime || shift.end || fallback.end;
      startInput.dataset.breakMinutes = String(number(shift.breakMinutes));
      const hasStructuredOvertime = ["overtimeBeforeStart", "overtimeBeforeEnd", "overtimeAfterStart", "overtimeAfterEnd"].some((field) => Boolean(shift[field]));
      let beforeStart = shift.overtimeBeforeStart || "";
      let beforeEnd = shift.overtimeBeforeEnd || "";
      let afterStart = shift.overtimeAfterStart || "";
      let afterEnd = shift.overtimeAfterEnd || "";
      if (!hasStructuredOvertime && index === activeShiftCount - 1 && setting.overtimeStart && setting.overtimeEnd) {
        afterStart = setting.overtimeStart;
        afterEnd = setting.overtimeEnd;
      } else if (!hasStructuredOvertime && number(shift.overtimeMinutes) > 0) {
        afterStart = endInput.value;
        afterEnd = addMinutesToClock(endInput.value, shift.overtimeMinutes);
      }
      $(`capacity-cell-shift-${index + 1}-ot-before-start`).value = beforeStart;
      $(`capacity-cell-shift-${index + 1}-ot-before-end`).value = beforeEnd;
      $(`capacity-cell-shift-${index + 1}-ot-after-start`).value = afterStart;
      $(`capacity-cell-shift-${index + 1}-ot-after-end`).value = afterEnd;
    });
    $("capacity-cell-scope-note").textContent = historical
      ? `${date} sudah lewat dan dikunci sebagai histori Production.`
      : `Hanya jam capacity ${machine.machineCode} pada ${date} yang berubah. Qty, part, proses, tanggal, dan mesin allocation tetap mengikuti ${$("capacity-plan").value || "Monthly Production Plan"}.`;
    toggleDailyFields();
    const manualTasks = manualTasksForMachine(machineId);
    $("capacity-manual-allocation-form").classList.add("d-none");
    const dailyToggle = document.querySelector('[data-capacity-dialog-section="capacity-cell-form"]');
    const manualToggle = document.querySelector('[data-capacity-dialog-section="capacity-manual-allocation-form"]');
    dailyToggle?.classList.toggle("d-none", historical);
    manualToggle?.classList.add("d-none");
    if (openDialog) {
      $("capacity-cell-form").classList.add("capacity-dialog-section-collapsed");
      $("capacity-manual-allocation-form").classList.add("capacity-dialog-section-collapsed");
      dailyToggle?.classList.remove("active");
      manualToggle?.classList.remove("active");
    }
    populateManualMachines(machineId);
    $("capacity-manual-date").value = date;
    const manualPlanNumbers = [...new Set(manualTasks.map((task) => task.planNumber))];
    $("capacity-manual-plan").innerHTML = manualPlanNumbers.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
    if (manualPlanNumbers.includes($("capacity-plan").value)) $("capacity-manual-plan").value = $("capacity-plan").value;
    refreshManualTaskOptions();
    const manualAssignment = (item) => {
      if (historical) return '<span class="capacity-history-lock">Terkunci · histori</span>';
      if (["MANUAL", "RECOMMENDED"].includes(item.source) && item.allocationId) {
        const schedule = item.plannedStartTime && item.plannedEndTime
          ? `<small class="d-block">${esc(item.plannedStartTime)}–${esc(item.plannedEndTime)} · ${esc(item.capacityMode || "NORMAL")}${item.diesId ? ` · Dies ${esc((snapshot?.catalogs?.dies || []).find((row) => row.id === item.diesId)?.diesCode || item.diesId)}` : ""}${item.deliveryPhaseNumber ? ` · Delivery Phase ${num(item.deliveryPhaseNumber)}` : ""}${item.transferBatchNumber ? ` · Transfer Batch ${num(item.transferBatchNumber)}` : ""}</small>`
          : "";
        return `<div class="capacity-allocation-actions"><small class="text-primary fw-semibold">Allocation Monthly Plan</small>${schedule}<a class="btn btn-sm btn-outline-primary" href="${esc(monthlyPlanHref(item.planNumber || item.reference))}">Ubah di Monthly Plan</a></div>`;
      }
      return `<div class="capacity-allocation-actions"><small>${esc(item.status || "Mengikuti Monthly Plan")}</small><a class="btn btn-sm btn-outline-primary" href="${esc(monthlyPlanHref(item.planNumber || item.reference))}">Buka Monthly Plan</a></div>`;
    };
    $("capacity-detail-body").innerHTML = cell.items.map((item) => {
      const allocationRow = `<tr class="capacity-allocation-data-row"><td><span class="capacity-source ${esc(String(item.source || "").toLowerCase())}">${esc(item.source)}</span>${item.capacityLate?'<small class="d-block text-danger">CAPACITY_LATE</small>':''}</td><td><b>${esc(item.reference)}</b>${item.moNumber ? `<small class="d-block">${esc(item.moNumber)} / ${esc(item.woNumber)}</small>` : ""}${item.demandSourceNumber?`<small class="d-block">${esc(item.demandSourceType||'DEMAND')} · ${esc(item.demandSourceNumber)}</small>`:''}</td><td>${esc(item.partCode)}<small class="d-block">Part Number: ${esc(item.partNumber || '—')}</small>${item.customerCode?`<small class="d-block">${esc(item.customerCode)}</small>`:''}</td><td>${esc(item.processCode || item.label)}${item.fgRequiredDate?`<small class="d-block">FG ready ${esc(String(item.fgRequiredDate).slice(0,10))}</small>`:''}</td><td>${esc(item.shift)}${item.priorityClass?`<small class="d-block">${esc(item.priorityClass)} · ${num(item.priorityScore,1)}</small>`:''}</td><td>${qty(item.qty, item.uomCode)} ${esc(item.uomCode || "")}</td><td>${num(item.minutes, 1)} min${item.customerTargetDate?`<small class="d-block">Delivery ${esc(String(item.customerTargetDate).slice(0,10))}</small>`:''}</td><td>${manualAssignment(item)}</td></tr>`;
      const auditRow = item.source === "RECOMMENDED" ? `<tr class="capacity-allocation-audit-row"><td colspan="8">${allocationScoreDetail(item)}</td></tr>` : "";
      return `${allocationRow}${auditRow}`;
    }).join("") || '<tr><td colspan="8" class="capacity-empty">Belum ada load pada machine dan tanggal ini.</td></tr>';
    if (openDialog) $("capacity-allocation-dialog")?.showModal();
  }
  function issueActions(issue) {
    const actions = [];
    if (issue.allocationId || issue.relatedAllocationId || issue.planNumber) actions.push(`<a href="${esc(monthlyPlanHref(issue.planNumber))}">Perbaiki allocation di Monthly Plan →</a>`);
    if (!issue.allocationId && issue.machineCode) actions.push(`<a href="/master-data/machines/${encodeURIComponent(issue.machineCode)}/edit?key=${encodeURIComponent(issue.machineCode)}">Perbaiki master machine →</a>`);
    if (!issue.allocationId && /ROUTING|CYCLE|MACHINE/.test(issue.code)) actions.push('<a href="/modules/manufacturing-bom/bill-of-materials">Buka routing MBOM →</a>');
    if (/PROCESS/.test(issue.code)) actions.push('<a href="/master-data/processes">Buka master process →</a>');
    return actions.length ? `<div class="capacity-issue-actions">${actions.join("")}</div>` : "";
  }
  function allocationScoreDetail(item) {
    const scoring = item.recommendationScoreBreakdown || {};
    const breakdown = scoring.breakdown || {};
    const context = scoring.context || {};
    const audit = scoring.audit || {};
    const demandTrace = audit.demandTrace || {};
    const material = audit.materialReadiness || {};
    const quantityAudit = audit.quantityCalculation || {};
    const scheduleAudit = audit.scheduleDecision || {};
    const lineage = audit.lineage || {};
    const labels = { dueProtection: "Proteksi due date", machineEfficiency: "Efisiensi mesin", loadBalance: "Load balance", queueWait: "Waktu antre", dependencySync: "Sinkronisasi proses", setupContinuity: "Minim setup", regularShift: "Shift reguler", laneFragmentation: "Konsistensi lane", sequenceContinuity: "Kontinuitas sequence" };
    const explanations = {
      dueProtection: `Sisa waktu ke target FG ${num(context.slackMinutes / 60, 2)} jam.`,
      machineEfficiency: "Membandingkan cycle mesin terpilih dengan mesin kompatibel tercepat.",
      loadBalance: `Load resource setelah allocation ${num(context.limitingResourceLoadPercent, 2)}%.`,
      queueWait: `Menunggu slot ${num(context.waitMinutes / 60, 2)} jam dari waktu paling awal yang diizinkan.`,
      dependencySync: `Jarak dari material/predecessor siap ${num(context.dependencyLagMinutes / 60, 2)} jam.`,
      setupContinuity: `Urutan setup: ${context.setupContinuity || "belum tersedia"}.`,
      regularShift: scheduleAudit.capacityMode === "OVERTIME" ? "Slot memakai overtime." : "Slot berada pada shift reguler.",
      laneFragmentation: context.introducesAdditionalLane ? "Membuka lane mesin tambahan." : "Menjaga route pada lane yang sama.",
      sequenceContinuity: "Menjaga urutan proses dan transfer batch.",
    };
    const maximum = { dueProtection: 23, machineEfficiency: 15, loadBalance: 13, queueWait: 11, dependencySync: 12, setupContinuity: 10, regularShift: 7, laneFragmentation: 9, sequenceContinuity: 15 };
    const hasScore = item.recommendationScore !== null && item.recommendationScore !== undefined && item.recommendationScore !== "" && Number.isFinite(Number(item.recommendationScore));
    const knownKeys = Object.keys(labels).filter((key) => Object.prototype.hasOwnProperty.call(breakdown, key));
    const unknownKeys = Object.keys(breakdown).filter((key) => !Object.prototype.hasOwnProperty.call(labels, key));
    const scoreRows = [...knownKeys, ...unknownKeys].map((key) => {
      const value = number(breakdown[key]);
      const max = number(maximum[key] ?? scoring.weights?.[key]) || Math.max(value, 1);
      const label = labels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase());
      return `<span title="${esc(explanations[key] || "Kontribusi factor terhadap score akhir.")}"><i style="--score:${Math.max(0, Math.min(value / max * 100, 100))}%"></i><small>${esc(label)}</small><b>${num(value, 2)}/${num(max, 2)}</b><em>${esc(explanations[key] || "Kontribusi weighted scoring.")}</em></span>`;
    }).join("");
    const dateLabel = (value) => {
      const key = String(value || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "-";
      return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${key}T00:00:00`));
    };
    const sourceType = demandTrace.sourceType || item.demandSourceType || "DEMAND";
    const sourceNumber = demandTrace.sourceNumber || item.demandSourceNumber || item.reference || "-";
    const deliveryDate = demandTrace.customerTargetDate || item.customerTargetDate;
    const fgDate = demandTrace.fgRequiredDate || item.fgRequiredDate;
    const materialReadyDate = material.readyDate || item.materialReadyDate;
    const predecessorKeys = lineage.predecessorKeys || item.predecessorAllocationIds || [];
    const machine = (snapshot?.machines || []).find((row) => row.id === item.machineId);
    const transferBatchQty = quantityAudit.transferBatchReceiptQty;
    const formulaBasis = quantityAudit.priorityCappedRouteNetting
      ? `min(batch ${qty(transferBatchQty, quantityAudit.fgReceiptUomCode)}, sisa kebutuhan proses ${qty(quantityAudit.routeQtyRemainingBeforeBatch, quantityAudit.uomCode)})`
      : quantityAudit.discreteRoundingApplied
        ? `[round((${qty(quantityAudit.receiptQtyBeforeBatch, quantityAudit.fgReceiptUomCode)} + ${qty(transferBatchQty, quantityAudit.fgReceiptUomCode)}) × BOM ${num(quantityAudit.routeFactor, 2)}) − round(${qty(quantityAudit.receiptQtyBeforeBatch, quantityAudit.fgReceiptUomCode)} × BOM ${num(quantityAudit.routeFactor, 2)})]`
        : `${qty(transferBatchQty, quantityAudit.fgReceiptUomCode)} × BOM ${num(quantityAudit.routeFactor, 2)}`;
    const manualDeduction = number(quantityAudit.manualAllocationConsumedQty) > 0
      ? ` − ${qty(quantityAudit.manualAllocationConsumedQty, quantityAudit.uomCode)} manual allocation`
      : "";
    const formula = quantityAudit.calculatedAllocationQty != null
      ? `${formulaBasis}${manualDeduction} = ${qty(quantityAudit.calculatedAllocationQty, quantityAudit.uomCode)} ${esc(quantityAudit.uomCode || item.uomCode || "")}`
      : `${qty(item.qty, item.uomCode)} ${esc(item.uomCode || "")} dialokasikan ke Transfer Batch ${num(item.transferBatchNumber || 1)}. Formula rinci akan direkam saat Auto Allocation dijalankan ulang.`;
    const candidateText = audit.candidatesEvaluated
      ? `Peringkat ${num(audit.selectedRank || 1)} dari ${num(audit.candidatesEvaluated)} kandidat pada ${num(audit.resourceWindowsEvaluated)} resource window.`
      : "Slot dipilih dari kalender, mesin, dies, shift, dan constraint yang tersedia saat rekomendasi dibuat.";
    const alternatives = (audit.alternatives || []).slice(0, 3).map((alternative) => `${alternative.machineCode || "-"} / S${alternative.shift || "-"} (${num(alternative.score, 2)})`).join("; ");
    const stockHistory = quantityAudit.fgStockCoverageHistory || [];
    const stockHistoryHtml = stockHistory.length || number(quantityAudit.fgStockCoverageHistoryUntracedQty) > 0
      ? `<details class="capacity-stock-history"><summary>Riwayat stock yang dipakai · ${qty(quantityAudit.fgStockCoverageQty, quantityAudit.fgReceiptUomCode)} ${esc(quantityAudit.fgReceiptUomCode || item.uomCode || "")}</summary>${stockHistory.map((line) => `<div><b>${esc(line.warehouseCode || "-")} / ${esc(line.rackCode || "Tanpa rack")} / Lot ${esc(line.lotNumber || "Tanpa lot")}</b><span>${line.coverageSource === "RESERVED_TO_DEMAND" ? `Reserved ${esc(line.reservationReferenceNumber || "SO")} dipakai ${qty(line.usedQty, line.uomCode)}` : `Available dipakai ${qty(line.usedQty, line.uomCode)}`} ${esc(line.uomCode || "")}</span><small>On hand ${qty(line.qtyOnHand, line.uomCode)} · Available ${qty(line.qtyAvailable, line.uomCode)} · Reserved ${qty(line.qtyReserved, line.uomCode)} · QC ${qty(line.qtyQC, line.uomCode)} · Movement ${esc(String(line.lastMovement || "-").slice(0, 10))}${line.reservationNumber ? ` · ${esc(line.reservationNumber)}` : ""}</small></div>`).join("")}${number(quantityAudit.fgStockCoverageHistoryUntracedQty) > 0 ? `<p>⚠ ${qty(quantityAudit.fgStockCoverageHistoryUntracedQty, quantityAudit.fgReceiptUomCode)} ${esc(quantityAudit.fgReceiptUomCode || "")} berasal dari baseline netting MRP, tetapi tidak lagi tersedia pada snapshot stock saat recommendation dibuat.</p>` : ""}</details>`
      : "";
    const campaignSegments = demandTrace.campaignSegments || [];
    const customerCampaign = campaignSegments.find((segment) => !segment.isBufferStock);
    const bufferCampaign = campaignSegments.find((segment) => segment.isBufferStock);
    const demandQuantityText = campaignSegments.length
      ? `Satu campaign produksi ${qty(quantityAudit.phaseDemandQty, quantityAudit.fgReceiptUomCode)} = customer ${qty(customerCampaign?.productionQty, quantityAudit.fgReceiptUomCode)} + buffer ${qty(bufferCampaign?.productionQty, quantityAudit.fgReceiptUomCode)} ${esc(quantityAudit.fgReceiptUomCode || "")}. Pegging tetap terpisah; mesin tidak perlu berhenti atau pindah shift.`
      : quantityAudit.isBufferStock
      ? `Buffer ${qty(quantityAudit.requestedBufferQty, quantityAudit.fgReceiptUomCode)} → produksi buffer ${qty(quantityAudit.phaseDemandQty, quantityAudit.fgReceiptUomCode)} ${esc(quantityAudit.fgReceiptUomCode || "")}. Dikerjakan setelah demand customer berprioritas.`
      : quantityAudit.grossDemandQty != null
        ? `Gross ${qty(quantityAudit.grossDemandQty, quantityAudit.fgReceiptUomCode)} − stock FG ${qty(quantityAudit.fgStockCoverageQty, quantityAudit.fgReceiptUomCode)} = produksi priority ${qty(quantityAudit.phaseDemandQty, quantityAudit.fgReceiptUomCode)} ${esc(quantityAudit.fgReceiptUomCode || "")}.`
        : `${esc(sourceType)} ${esc(sourceNumber)} melayani ${qty(item.qty, item.uomCode)} ${esc(item.uomCode || "")}.`;
    const fullLotPreserved = scheduleAudit.fullLotPreserved === true;
    const batchingLabel = scheduleAudit.batchingPolicy
      ? (fullLotPreserved ? "Batch utuh karena masih muat" : "Split karena kapasitas slot")
      : "Aturan batch";
    const batchingReason = scheduleAudit.batchingReason
      || "Sistem mencoba batch utuh lebih dulu; split hanya menjadi fallback ketika qty tidak muat dalam slot sebelum due date.";
    const steps = [
      `<li><i>1</i><div><b>Demand priority ${esc(demandTrace.prioritySequence || quantityAudit.prioritySequence || "-")}</b><p>${esc(sourceType)} <strong>${esc(sourceNumber)}</strong>${(demandTrace.customerCode || item.customerCode) ? ` · Customer ${esc(demandTrace.customerCode || item.customerCode)}` : ""}. Delivery ${esc(dateLabel(deliveryDate))}; FG wajib siap ${esc(dateLabel(fgDate))}.${(demandTrace.priorityClass || item.priorityClass) ? ` Priority ${esc(demandTrace.priorityClass || item.priorityClass)} (${num(demandTrace.priorityScore ?? item.priorityScore, 2)}).` : ""}</p><p class="capacity-trace-equation">${demandQuantityText}</p>${stockHistoryHtml}</div></li>`,
      `<li><i>2</i><div><b>Material boleh mulai</b><p>${materialReadyDate ? `Mulai paling awal ${esc(dateLabel(materialReadyDate))}` : "Tidak ada purchase requirement yang menahan start"} · ${esc(material.source || item.materialReadySource || "NO_PURCHASE_REQUIREMENT")}${material.supplierScheduleConfirmed ? " · supplier confirmed" : " · fallback due date sistem"}${material.suggestionNumber ? ` · ${esc(material.suggestionNumber)}` : ""}.</p></div></li>`,
      `<li><i>3</i><div><b>Urutan predecessor</b><p>${predecessorKeys.length ? `${num(predecessorKeys.length)} allocation predecessor wajib selesai lebih dulu.` : "Proses pertama / tidak mempunyai predecessor allocation."} Dependency wait ${num(context.dependencyLagMinutes / 60, 2)} jam.</p></div></li>`,
      `<li><i>4</i><div><b>${esc(batchingLabel)}</b><p>${esc(batchingReason)}</p><p class="capacity-trace-formula">${formula}</p>${quantityAudit.phaseDemandQty != null ? `<small>Produksi demand/buffer ${qty(quantityAudit.phaseDemandQty, quantityAudit.fgReceiptUomCode)} · batch shift ${qty(quantityAudit.transferBatchReceiptQty, quantityAudit.fgReceiptUomCode)} · kebutuhan proses tersisa ${qty(quantityAudit.routeQtyRemainingBeforeBatch, quantityAudit.uomCode)}. Buffer baru mengisi slot setelah sisa priority sebelumnya.</small>` : ""}</div></li>`,
      `<li><i>5</i><div><b>Pemilihan slot</b><p>${esc(scheduleAudit.machineCode || machine?.machineCode || item.machineId || "Vendor")} · ${esc(dateLabel(scheduleAudit.scheduleDate || item.scheduleDate))} · ${esc(scheduleAudit.plannedStartTime || item.plannedStartTime || "-")}–${esc(scheduleAudit.plannedEndTime || item.plannedEndTime || "-")} · Shift ${esc(scheduleAudit.shift || item.shift || "-")} · ${esc(scheduleAudit.capacityMode || item.capacityMode || "NORMAL")}.</p><small>${esc(candidateText)}${alternatives ? ` Alternatif terdekat: ${esc(alternatives)}.` : ""}</small></div></li>`,
    ].join("");
    return `<details class="capacity-allocation-trace"><summary><span><b>Mengapa qty ${qty(item.qty, item.uomCode)} ${esc(item.uomCode || "")} dialokasikan di sini?</b><small>Demand → material → dependency → batch → slot → score</small></span>${hasScore ? `<strong>${num(item.recommendationScore, 2)}/100</strong>` : '<strong class="rule-based">Rule</strong>'}</summary><div class="capacity-allocation-trace-body"><p class="capacity-trace-verdict">${esc(item.recommendationReason || "Dibuat otomatis dari constraint planning yang tersedia.")}</p><ol class="capacity-trace-steps">${steps}</ol><section class="capacity-trace-score"><header><b>6. Pembentuk score</b><small>${hasScore ? `Total ${num(item.recommendationScore, 2)} dari 100` : "Allocation rule-based; tidak memakai weighted score."}</small></header>${hasScore ? `<div class="capacity-score-grid">${scoreRows || '<small>Breakdown scoring belum tersedia.</small>'}</div>` : ""}</section></div></details>`;
  }
  function issueDetail(issue) {
    const detail = issue.blockerDetail;
    if (!detail) return issue.resolution ? `<em class="capacity-issue-resolution">Tindakan: ${esc(issue.resolution)}</em>` : "";
    const predecessor = detail.predecessor || {};
    const successor = detail.successor || {};
    const moment = (value) => {
      const parsed = value ? new Date(value) : null;
      return parsed && !Number.isNaN(parsed.getTime())
        ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(parsed)
        : "-";
    };
    if (Array.isArray(detail.batches) && detail.batches.length) {
      const batchRows = detail.batches.map((batch) => {
        const originalQty = batch.originalOutputQty ?? batch.outputQty;
        const reservedQty = number(batch.reservedOutputQty);
        const state = batch.finishedBeforeSuccessor ? "Ready" : batch.requiredToUnblock ? "Dibutuhkan untuk unblock" : "Selesai terlambat";
        const reservationText = reservedQty > 0 ? `${qty(reservedQty, batch.uomCode)} ${batch.uomCode || ""} sudah dipakai; ` : "";
        return `<div class="${batch.finishedBeforeSuccessor ? "ready" : "late"}"><span>Batch ${esc(batch.transferBatchNumber || "-")}</span><b>${qty(batch.outputQty, batch.uomCode)} / ${qty(originalQty, batch.uomCode)} ${esc(batch.uomCode || "")}</b><small>${esc(reservationText)}${esc(state)} &middot; ${esc(moment(batch.finishAt))}</small></div>`;
      }).join("");
      const shortage = detail.shortageQty ?? detail.shortageQtyAtStart;
      const uomCode = detail.shortageUomCode || detail.uomCode || predecessor.uomCode || "";
      const timing = issue.code === "PLAN_PREDECESSOR_FINISH_AFTER_SUCCESSOR";
      const reservedSummary = number(detail.previouslyReservedOutputQty) > 0
        ? `<span>${qty(detail.previouslyReservedOutputQty, uomCode)} ${esc(uomCode)} sudah dipakai successor sebelumnya</span>`
        : `<span>${num(detail.readyBatchCount)} ready &middot; ${num(detail.lateBatchCount)} terlambat</span>`;
      return `<div class="capacity-blocker-detail">
        <p><b>Akar masalah</b>${esc(detail.cause || issue.message)}</p>
        <div class="capacity-blocker-batches"><header><b>Split batch predecessor &middot; tersedia / awal</b>${reservedSummary}</header>${batchRows}</div>
        <div class="capacity-blocker-gap ${timing ? "timing" : ""}"><b>${timing ? "WIP kurang saat mulai" : "Shortage"} ${qty(shortage, uomCode)} ${esc(uomCode)}</b><span>${timing ? `Unblock ${esc(moment(successor.unblockAt))}` : detail.coverageGapPercent == null ? "WIP belum cukup" : `Gap coverage ${num(detail.coverageGapPercent, 2)}%`}</span></div>
        <p class="impact"><b>Dampak jika diabaikan</b>${esc(detail.impact || "Sequence produksi tidak executable.")}</p>
        ${issue.resolution ? `<em class="capacity-issue-resolution">Rekomendasi sistem: ${esc(issue.resolution)}</em>` : ""}
      </div>`;
    }
    return `<div class="capacity-blocker-detail">
      <p><b>Akar masalah</b>${esc(detail.cause || issue.message)}</p>
      <div class="capacity-blocker-flow">
        <article><small>PREDECESSOR · harus tersedia dulu</small><strong>${esc(predecessor.processCode || "-")}</strong><span>${esc(predecessor.partCode || issue.partCode || "-")}</span><dl><div><dt>Allocation</dt><dd>${qty(predecessor.outputQty, predecessor.uomCode)} / ${qty(predecessor.targetQty, predecessor.uomCode)} ${esc(predecessor.uomCode || "")}</dd></div><div><dt>Coverage</dt><dd>${num(predecessor.coveragePercent, 2)}%</dd></div><div><dt>Selesai</dt><dd>${esc(moment(predecessor.finishAt))}</dd></div></dl></article>
        <i aria-hidden="true">→</i>
        <article><small>SUCCESSOR · menunggu output</small><strong>${esc(successor.processCode || "-")}</strong><span>${esc(successor.partCode || issue.partCode || "-")}</span><dl><div><dt>Allocation</dt><dd>${qty(successor.plannedQty, successor.uomCode)} / ${qty(successor.targetQty, successor.uomCode)} ${esc(successor.uomCode || "")}</dd></div><div><dt>Coverage</dt><dd>${num(successor.coveragePercent, 2)}%</dd></div><div><dt>Mulai</dt><dd>${esc(moment(successor.startAt))}</dd></div></dl></article>
      </div>
      <div class="capacity-blocker-gap"><b>Shortage ${qty(detail.shortageQty, detail.shortageUomCode)} ${esc(detail.shortageUomCode || "")}</b><span>Gap coverage ${num(detail.coverageGapPercent, 2)}%</span></div>
      <p class="impact"><b>Dampak jika diabaikan</b>${esc(detail.impact || "Sequence produksi tidak executable.")}</p>
      <em class="capacity-issue-resolution">Rekomendasi sistem: ${esc(issue.resolution)}</em>
    </div>`;
  }
  function compactIssueMessage(issue) {
    const detail = issue.blockerDetail;
    const predecessor = detail?.predecessor || {};
    const successor = detail?.successor || {};
    const shortage = detail?.shortageQty ?? detail?.shortageQtyAtStart;
    if (detail && number(shortage) > 0) {
      const predecessorLabel = predecessor.processCode || "Predecessor";
      const successorLabel = successor.processCode || "successor";
      const uomCode = detail.shortageUomCode || detail.uomCode || predecessor.uomCode || "";
      if (issue.code === "PLAN_PREDECESSOR_FINISH_AFTER_SUCCESSOR") {
        return `${qty(shortage, uomCode)} ${uomCode} WIP belum ready saat ${successorLabel} mulai.`;
      }
      return `${predecessorLabel} kurang ${qty(shortage, uomCode)} ${uomCode} untuk ${successorLabel}.`;
    }
    return issue.message || issue.resolution || "Perlu diperiksa sebelum allocation dapat dijalankan.";
  }
  function ensureReadinessPopover() {
    let popover = $("capacity-readiness-popover");
    if (popover) return popover;
    popover = document.createElement("section");
    popover.id = "capacity-readiness-popover";
    popover.className = "capacity-readiness-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "false");
    popover.setAttribute("aria-labelledby", "capacity-readiness-popover-title");
    popover.setAttribute("aria-describedby", "capacity-readiness-popover-summary");
    popover.hidden = true;
    document.body.appendChild(popover);
    return popover;
  }
  function positionReadinessPopover(trigger, popover) {
    if (!trigger?.isConnected || popover.hidden || window.matchMedia("(max-width: 650px)").matches) return;
    const gap = 9;
    const triggerRect = trigger.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.max(gap, Math.min(triggerRect.right - width, window.innerWidth - width - gap));
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - height - gap;
    const top = below + height <= window.innerHeight - gap
      ? below
      : Math.max(gap, above >= gap ? above : window.innerHeight - height - gap);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }
  function closeReadinessPopover({ restoreFocus = false } = {}) {
    const popover = $("capacity-readiness-popover");
    const trigger = activeReadinessTrigger;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    activeReadinessTrigger = null;
    if (popover) {
      popover.hidden = true;
      popover.style.left = "";
      popover.style.top = "";
    }
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  function openReadinessPopover(trigger, { moveFocus = false } = {}) {
    const issue = readinessIssuesByKey.get(trigger?.dataset.readinessDetail);
    if (!issue) return;
    const popover = ensureReadinessPopover();
    if (activeReadinessTrigger && activeReadinessTrigger !== trigger) activeReadinessTrigger.setAttribute("aria-expanded", "false");
    activeReadinessTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    const severityLabel = issue.canOverride ? "Perlu approval override" : issue.severity === "blocking" ? "Wajib diperbaiki" : "Perlu diperiksa";
    popover.className = `capacity-readiness-popover ${esc(issue.severity || "info")}`;
    popover.innerHTML = `<header class="capacity-readiness-popover-head"><div><small>${esc(issue.category || "CAPACITY")} &middot; ${esc(severityLabel)}</small><h3 id="capacity-readiness-popover-title">${esc(issue.code || "Detail blocker")}</h3></div><button type="button" class="capacity-readiness-popover-close" data-close-readiness-detail aria-label="Tutup detail blocker">&times;</button></header>
      <div class="capacity-readiness-popover-body"><p id="capacity-readiness-popover-summary" class="capacity-readiness-popover-summary">${esc(issue.message || compactIssueMessage(issue))}</p>${issueDetail(issue)}${issueActions(issue)}</div>`;
    popover.hidden = false;
    positionReadinessPopover(trigger, popover);
    if (moveFocus) requestAnimationFrame(() => popover.querySelector("[data-close-readiness-detail]")?.focus());
  }
  function renderReadiness() {
    const readiness = snapshot.readiness;
    const badge = $("capacity-readiness-badge");
    badge.className = `capacity-readiness-badge ${readiness.ok ? "ready" : "blocked"}`; badge.textContent = readiness.ok ? "Ready" : `${num(readiness.blockingCount)} Blocker`;
    const usePreset = $("capacity-use-preset");
    const selectedPlan = plans.find((plan) => plan.planNumber === $("capacity-plan").value);
    const canRecommendProduction = selectedPlan && ["Draft", "Confirmed", "Released", "In Progress"].includes(selectedPlan.status);
    usePreset.classList.toggle("d-none", capacityPlanningMode !== "PRODUCTION" || !readiness.blockingCount || !canRecommendProduction);
    usePreset.textContent = activePreset() ? `Pakai Preset ${activePreset().name}` : "Pakai Preset";
    const severityRank = { blocking: 0, warning: 1, overridable: 2, info: 3 };
    const ranked = [...readiness.issues].sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
    closeReadinessPopover();
    readinessIssuesByKey = new Map();
    $("capacity-readiness-list").innerHTML = ranked.slice(0, 80).map((issue, index) => {
      const key = `readiness-${index}`;
      readinessIssuesByKey.set(key, issue);
      const severityLabel = issue.canOverride ? "Perlu approval override" : issue.severity === "blocking" ? "Wajib diperbaiki" : "Perlu diperiksa";
      return `<div class="capacity-issue ${esc(issue.severity)}"><i class="capacity-issue-dot" aria-hidden="true"></i><div class="capacity-issue-main"><small>${esc(issue.category || "CAPACITY")} &middot; ${esc(severityLabel)}</small><b>${esc(issue.code)}</b><span>${esc(compactIssueMessage(issue))}</span></div><button type="button" class="capacity-issue-help" data-readiness-detail="${key}" aria-label="Lihat penjelasan ${esc(issue.code || "blocker")}" aria-haspopup="dialog" aria-expanded="false" aria-controls="capacity-readiness-popover"><span aria-hidden="true">?</span></button></div>`;
    }).join("") || '<div class="capacity-empty">Routing, urutan proses, vendor, mesin, qty, dan delivery phase siap digunakan.</div>';
  }
  document.addEventListener("focusin", (event) => {
    const trigger = event.target.closest?.("[data-readiness-detail]");
    if (trigger) openReadinessPopover(trigger);
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-readiness-detail]");
    if (trigger) {
      openReadinessPopover(trigger, { moveFocus: true });
      return;
    }
    const popover = $("capacity-readiness-popover");
    if (!popover || popover.hidden) return;
    if (event.target.closest("[data-close-readiness-detail]")) {
      closeReadinessPopover({ restoreFocus: true });
      return;
    }
    if (!popover.contains(event.target)) {
      closeReadinessPopover();
      return;
    }
    if (event.target.closest(".capacity-issue-actions a, .capacity-issue-actions button")) {
      requestAnimationFrame(() => closeReadinessPopover());
    }
  });
  document.addEventListener("keydown", (event) => {
    const popover = $("capacity-readiness-popover");
    if (event.key !== "Escape" || !popover || popover.hidden) return;
    event.preventDefault();
    closeReadinessPopover({ restoreFocus: true });
  });
  window.addEventListener("resize", () => {
    const popover = $("capacity-readiness-popover");
    if (activeReadinessTrigger && popover && !popover.hidden) positionReadinessPopover(activeReadinessTrigger, popover);
  });
  document.addEventListener("scroll", () => {
    const popover = $("capacity-readiness-popover");
    if (activeReadinessTrigger && popover && !popover.hidden) positionReadinessPopover(activeReadinessTrigger, popover);
  }, true);
  function renderUnscheduled() {
    $("capacity-unscheduled-count").textContent = `${num(snapshot.unscheduled.length)} item`;
    $("capacity-unscheduled-body").innerHTML = snapshot.unscheduled.map((item) => `<tr><td><span class="capacity-source ${esc(String(item.source || "").toLowerCase())}">${esc(item.source)}</span></td><td><b>${esc(item.reference)}</b>${item.lineNumber ? `<small class="d-block">Line ${num(item.lineNumber)}</small>` : ""}</td><td>${esc(item.partCode)}<small class="d-block">Part Number: ${esc(item.partNumber || '—')}</small></td><td>${esc(item.processCode)}</td><td>${esc(item.machineCode)}</td><td>${qty(item.qty, item.uomCode)} ${esc(item.uomCode || "")}</td><td>${num(item.minutes, 1)}</td><td>${esc(item.reason)}<a class="btn btn-sm btn-outline-primary d-block mt-2" href="${esc(monthlyPlanHref(item.planNumber || item.reference))}">Tangani di Monthly Plan</a></td></tr>`).join("") || '<tr><td colspan="8" class="capacity-empty">Tidak ada load yang tertinggal di luar schedule.</td></tr>';
  }
  function renderProcessLoad() {
    const body = $("capacity-process-load-body");
    if (!body) return;
    body.innerHTML = (snapshot.processLoad || []).map((item) => `<tr><td><b>${esc(item.processCode)}</b><small class="d-block">${esc(item.processName || "")}</small></td><td>${esc((item.machineCodes || []).join(", ") || "-")}</td><td>${hours(item.firmMinutes)}</td><td>${hours(item.proposedMinutes)}</td><td><b>${hours(item.loadMinutes)}</b></td><td>${num(item.qty, 3)}</td></tr>`).join("") || '<tr><td colspan="6" class="capacity-empty">Belum ada beban routing pada horizon ini.</td></tr>';
  }
  function toggleDailyFields() {
    const holiday = $("capacity-cell-status").value === "HOLIDAY";
    $("capacity-cell-shifts").disabled = holiday;
    $("capacity-cell-shift-windows").classList.toggle("d-none", holiday);
    document.querySelectorAll("[data-daily-shift-window]").forEach((row) => {
      const inactive = holiday || Number(row.dataset.dailyShiftWindow) > Number($("capacity-cell-shifts").value || 1);
      row.classList.toggle("d-none", inactive);
      row.querySelectorAll("input").forEach((input) => { input.disabled = inactive; });
    });
  }
  async function load() {
    $("capacity-loading").classList.remove("d-none");
    ["capacity-table-view", "capacity-heatmap-wrap", "capacity-gallery-view", "capacity-kanban-view", "capacity-gantt-view", "capacity-calendar-view"].forEach((id) => $(id).classList.add("d-none"));
    $("capacity-alert").classList.add("d-none");
    if (!$("capacity-plan").value) {
      $("capacity-loading").classList.add("d-none");
      $("capacity-alert").className = "alert alert-info";
      $("capacity-alert").innerHTML = `Belum ada Monthly Production Plan aktif untuk periode ini. Capacity tidak membuat allocation sendiri. <a href="${esc(monthlyPlanHref())}">Buka Monthly Production Plan</a>.`;
      updateCapacityModeUi();
      return;
    }
    if (capacityPlanningMode === "SIMULATION" && !activeScenarioKey()) { $("capacity-loading").classList.add("d-none"); updateCapacityModeUi(); return alert("Belum ada preset simulasi aktif. Buat preset untuk bulan ini melalui Kelola Preset.", "warning"); }
    const activeScenario = scenarioConfig($("capacity-scenario").value);
    const params = new URLSearchParams({ startDate: $("capacity-start").value, endDate: $("capacity-end").value, shiftsPerDay: $("capacity-shifts").value, shiftHours: $("capacity-hours").value, efficiencyPercent: $("capacity-efficiency").value, scenarioName: activeScenario.name, overtimeHours: $("capacity-overtime").value, includeSaturday: $("capacity-saturday").value, includeSunday: $("capacity-sunday").value, planningGranularity: activeScenario.granularity || "DAY", rollingLookbackWeeks: activeScenario.lookbackWeeks || "0", freezeFenceDays: activeScenario.freezeDays || "0", manualAllocation: "true", planningMode: capacityPlanningMode });
    if (activeScenarioKey()) params.set("scenarioKey", activeScenarioKey());
    if (selectedPresetKey()) params.set("presetId", selectedPresetKey());
    if ($("capacity-plan").value) params.set("planNumber", $("capacity-plan").value);
    try {
      const retainedCell = selectedCell;
      snapshot = await api(`/modules/api/planning-ppic/capacity-planning?${params}`);
      renderStats(); renderMaterialGate(); renderHeatmap(); renderReadiness(); renderUnscheduled(); renderProcessLoad(); renderDeliveryCoverage(); renderVendorAllocations(); renderCapacityAttention(); renderCapacityWorkbenchCounts(); renderHorizonInsight(); applyCapacityWorkbenchFilter(); updateCapacityModeUi();
      if ((snapshot.unscheduled || []).length) alert(`${num(snapshot.unscheduled.length)} item belum terjadwal. Plan tetap dapat dilanjutkan, tetapi item ini wajib ditindaklanjuti pada review berikutnya.`, "warning");
      const firstLoaded = snapshot.machines.flatMap((machine) => snapshot.dates.map((date) => ({ machine, date, cell: machine.cells[date] }))).find((entry) => entry.cell.items.length) || (snapshot.machines[0] ? { machine: snapshot.machines[0], date: snapshot.dates[0] } : null);
      const canRetain = retainedCell && snapshot.dates.includes(retainedCell.date) && snapshot.machines.some((machine) => machine.id === retainedCell.machineId);
      if (canRetain) renderCell(retainedCell.machineId, retainedCell.date);
      else if (firstLoaded) renderCell(firstLoaded.machine.id, firstLoaded.date);
    } catch (error) { $("capacity-loading").classList.add("d-none"); alert(error.message); }
  }
  function setupCapacityWorkspaceEvents() {
    let capacityResourceSearchTimer = null;
    $("capacity-resource-search").value = capacityUiState.search;
    $("capacity-resource-status").value = capacityUiState.status;
    $("capacity-resource-exceptions").checked = capacityUiState.exceptionsOnly;
    $("capacity-resource-density").value = capacityUiState.density;
    $("capacity-resource-page-size").value = String(capacityUiState.pageSize);
    $("capacity-workbench-search").value = capacityUiState.detailSearch;
    $("capacity-workbench-page-size").value = String(capacityUiState.detailPageSize);
    document.querySelector(".capacity-page").dataset.capacityDensity = capacityUiState.density;
    $("capacity-advanced-filters").open = capacityUiState.advanced;
    activateCapacityWorkbench(capacityUiState.workbench);
    $("capacity-resource-search").addEventListener("input", (event) => { capacityUiState.search = event.target.value; clearTimeout(capacityResourceSearchTimer); capacityResourceSearchTimer = setTimeout(() => rerenderCapacityResources({ resetPage: true }), 140); });
    $("capacity-resource-status").addEventListener("change", (event) => { capacityUiState.status = event.target.value; rerenderCapacityResources({ resetPage: true }); });
    $("capacity-resource-exceptions").addEventListener("change", (event) => { capacityUiState.exceptionsOnly = event.target.checked; rerenderCapacityResources({ resetPage: true }); });
    $("capacity-resource-page-size").addEventListener("change", (event) => { capacityUiState.pageSize = number(event.target.value); rerenderCapacityResources({ resetPage: true }); });
    $("capacity-resource-density").addEventListener("change", (event) => { capacityUiState.density = event.target.value; document.querySelector(".capacity-page").dataset.capacityDensity = capacityUiState.density; persistCapacityUiState(); });
    $("capacity-resource-prev").addEventListener("click", () => { capacityUiState.page = Math.max(1, capacityUiState.page - 1); rerenderCapacityResources(); });
    $("capacity-resource-next").addEventListener("click", () => { capacityUiState.page += 1; rerenderCapacityResources(); });
    $("capacity-workbench-search").addEventListener("input", (event) => { capacityUiState.detailSearch = event.target.value; capacityUiState.detailPage = 1; applyCapacityWorkbenchFilter(); });
    $("capacity-workbench-page-size").addEventListener("change", (event) => { capacityUiState.detailPageSize = number(event.target.value); capacityUiState.detailPage = 1; applyCapacityWorkbenchFilter(); });
    $("capacity-workbench-prev").addEventListener("click", () => { capacityUiState.detailPage = Math.max(1, capacityUiState.detailPage - 1); applyCapacityWorkbenchFilter(); });
    $("capacity-workbench-next").addEventListener("click", () => { capacityUiState.detailPage += 1; applyCapacityWorkbenchFilter(); });
    $("capacity-advanced-filters").addEventListener("toggle", (event) => { capacityUiState.advanced = event.target.open; persistCapacityUiState(); });
    document.querySelectorAll("[data-capacity-attention]").forEach((button) => button.addEventListener("click", () => { capacityUiState.attention = button.dataset.capacityAttention; persistCapacityUiState(); if (snapshot) renderCapacityAttention(); }));
    document.querySelectorAll("[data-capacity-workbench]").forEach((button) => button.addEventListener("click", () => activateCapacityWorkbench(button.dataset.capacityWorkbench)));
    document.addEventListener("click", (event) => {
      const workbenchButton = event.target.closest("[data-capacity-attention-workbench], [data-capacity-stat-target]");
      const planShortcut = event.target.closest("[data-capacity-open-plan]");
      if (planShortcut) {
        $("capacity-plan").value = planShortcut.dataset.capacityOpenPlan;
        $("capacity-plan").dispatchEvent(new Event("change"));
        return;
      }
      if (workbenchButton) return activateCapacityWorkbench(workbenchButton.dataset.capacityAttentionWorkbench || workbenchButton.dataset.capacityStatTarget, { scroll: true });
      const attentionOpen = event.target.closest("[data-capacity-attention-open]");
      if (attentionOpen) { capacityUiState.attention = attentionOpen.dataset.capacityAttentionOpen || "all"; renderCapacityAttention(); return document.querySelector(".capacity-attention-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
      const machineButton = event.target.closest("[data-capacity-attention-machine]");
      if (!machineButton || !snapshot) return;
      const machine = snapshot.machines.find((row) => row.id === machineButton.dataset.capacityAttentionMachine);
      capacityUiState.search = machine?.machineCode || "";
      capacityUiState.status = "ALL";
      capacityUiState.exceptionsOnly = false;
      capacityUiState.page = 1;
      $("capacity-resource-search").value = capacityUiState.search;
      $("capacity-resource-status").value = "ALL";
      $("capacity-resource-exceptions").checked = false;
      activeCapacityView = "heatmap";
      localStorage.setItem("capacity-main-view", activeCapacityView);
      renderHeatmap(false);
      renderCell(machineButton.dataset.capacityAttentionMachine, machineButton.dataset.capacityAttentionDate);
      document.querySelector(".capacity-heatmap-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  $("capacity-refresh").addEventListener("click", load);
  $("capacity-open-monthly-plan")?.addEventListener("click", () => { location.href = monthlyPlanHref(); });
  $("capacity-compare-run")?.addEventListener("click", loadSharedScenarios);
  async function runCapacityRecommendation(button, requirePreset = false, flowRule = null) {
    const planNumber = $("capacity-plan").value;
    if (!planNumber) return alert("Pilih satu MPP terlebih dahulu.", "warning");
    const preset = activePreset();
    if (requirePreset && !preset) { $("capacity-scenario").focus(); return alert("Pilih preset pada Capacity Setup / Preset terlebih dahulu, lalu klik Pakai Preset lagi.", "warning"); }
    try {
      button.disabled = true;
      const scenario = scenarioConfig($("capacity-scenario").value);
      const result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/capacity-recommendation`, { method: "POST", body: JSON.stringify({ planningMode: capacityPlanningMode, scenarioKey: activeScenarioKey(), presetId: selectedPresetKey(), planningGranularity: scenario.granularity || "DAY", rollingLookbackWeeks: Number(scenario.lookbackWeeks || 0), freezeFenceDays: Number(scenario.freezeDays || 0), flowRule }) });
      const targetFgText = (result.phaseResults || []).filter((phase) => phase.targetType === "CUSTOMER" && phase.targetFgDate).map((phase) => `Phase ${phase.phaseNumber || "-"}: ${phase.targetFgDate}`).join(", ");
      const scoredPhases = (result.phaseResults || []).filter((phase) => Number.isFinite(Number(phase.averageAllocationScore)));
      const averageScore = scoredPhases.length
        ? scoredPhases.reduce((sum, phase) => sum + Number(phase.averageAllocationScore), 0) / scoredPhases.length
        : null;
      const scoreText = averageScore == null ? "" : ` Skor rekomendasi rata-rata ${num(averageScore, 1)}/100.`;
      const message = result.ready
        ? `${requirePreset ? `Preset ${preset.name} diterapkan. ` : ""}${num(result.allocationCount)} slot sisa dibuat; ${num(result.firmAllocationCount)} allocation berjalan/selesai dipertahankan.${scoreText}${targetFgText ? ` Target FG ${targetFgText}.` : ""}`
        : `${requirePreset ? `Preset ${preset.name} diterapkan, tetapi ` : ""}${num(result.allocationCount)} slot dibuat; ${num(result.blockers?.length)} blocker masih perlu ditangani.${scoreText}`;
      alert(message, result.ready ? "success" : "warning");
      await load();
      await window.PpicWorkflow?.refresh?.($("capacity-month").value);
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }
  $("capacity-recommend").addEventListener("click", () => openCapacityFlowDialog($("capacity-recommend")));
  $("capacity-use-preset").addEventListener("click", () => openCapacityFlowDialog($("capacity-use-preset"), true));
  ["capacity-flow-profile", "capacity-flow-method", "capacity-flow-phase-distribution", "capacity-flow-delay-mode", "capacity-flow-lot-policy", "capacity-flow-split-machines"].forEach((id) => $(id)?.addEventListener("change", () => { updateCapacityFlowConditionalFields(); renderCapacityFlowSummary(); }));
  $("capacity-flow-form")?.addEventListener("input", () => { renderCapacityFlowSummary(); $("capacity-flow-save-state").textContent = "Ada perubahan yang belum disimpan."; $("capacity-flow-save-state").className = "capacity-flow-save-state warning"; });
  $("capacity-flow-preview")?.addEventListener("click", () => renderCapacityFlowSummary(true));
  $("capacity-flow-save-draft")?.addEventListener("click", async () => {
    const button = $("capacity-flow-save-draft");
    try { button.disabled = true; await saveCapacityFlowRule("DRAFT"); alert("Draft aturan aliran tersimpan.", "success"); } catch (error) { $("capacity-flow-save-state").textContent = error.message; $("capacity-flow-save-state").className = "capacity-flow-save-state warning"; } finally { button.disabled = false; }
  });
  $("capacity-flow-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = $("capacity-flow-save-active");
    try {
      button.disabled = true; const rule = await saveCapacityFlowRule("ACTIVE"); $("capacity-flow-dialog").close();
      await runCapacityRecommendation(pendingRecommendationButton || $("capacity-recommend"), pendingRecommendationRequiresPreset, rule);
    } catch (error) { $("capacity-flow-save-state").textContent = error.message; $("capacity-flow-save-state").className = "capacity-flow-save-state warning"; }
    finally { button.disabled = false; }
  });
  document.querySelectorAll("[data-list-view]").forEach((button) => button.addEventListener("click", () => {
    activeCapacityView = button.dataset.listView;
    localStorage.setItem("capacity-main-view", activeCapacityView);
    renderCapacityViews();
  }));
  $("capacity-override").addEventListener("click", async () => { const planNumber = $("capacity-plan").value; if (!planNumber) return; const reason = await window.formPrompt("Jelaskan alasan override capacity (minimal 10 karakter):", "Urgent customer demand; overload akan dijadwalkan ulang oleh PPIC.", { title: "Override Capacity" }); if (!reason || reason.trim().length < 10) return; try { await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/capacity-override`, { method: "POST", body: JSON.stringify({ reason }) }); alert("Override diproses melalui Approval Master.", "success"); await loadPlans(); await load(); } catch (error) { alert(error.message); } });
  $("capacity-plan").addEventListener("change", async function () { const plan = plans.find((row) => row.planNumber === this.value); $("capacity-recommend").classList.toggle("d-none", !this.value); if (plan) { $("capacity-start").value = String(plan.periodStart).slice(0, 10); $("capacity-end").value = String(plan.schedulingHorizonEnd || plan.periodEnd).slice(0, 10); const nextMonth = String(plan.periodStart).slice(0, 7); if (nextMonth !== $("capacity-month").value) { $("capacity-month").value = nextMonth; await loadSimulationPresets(); } } updateCapacityModeUi(); load(); });
  $("capacity-month").addEventListener("change", async function () {
    if (!this.value) return;
    const month = this.value;
    setMonthRange(month);
    const activeStatuses = new Set(["Draft", "Confirmed", "Released", "In Progress"]);
    const matchingPlan = plans.find((plan) => String(plan.periodStart).slice(0, 7) === month && activeStatuses.has(plan.status));
    $("capacity-plan").value = matchingPlan?.planNumber || "";
    if (matchingPlan) {
      $("capacity-start").value = String(matchingPlan.periodStart).slice(0, 10);
      $("capacity-end").value = String(matchingPlan.schedulingHorizonEnd || matchingPlan.periodEnd).slice(0, 10);
    }
    await loadSimulationPresets();
    load();
  });
  $("capacity-scenario").addEventListener("change", function () {
    applyScenario(this.value);
  });
  document.addEventListener("input", (event) => {
    if (event.target.closest("#capacity-preset-form")) $("capacity-preset-state").textContent = "Belum disimpan";
  });
  document.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-preset]"); const useButton = event.target.closest("[data-use-preset]");
    if (editButton) return fillPresetForm(simulationPresets.find((preset) => preset.id === editButton.dataset.editPreset));
    if (useButton) { const preset = simulationPresets.find((item) => item.id === useButton.dataset.usePreset); if (!preset) return; $("capacity-scenario").value = preset.id; fillPresetForm(preset); renderPresetLibrary(); updateCapacityModeUi(); $("capacity-scenario-dialog")?.close(); return load(); }
  });
  document.addEventListener("dragstart", (event) => {
    const allocation = event.target.closest("[data-drag-allocation]");
    if (!allocation) return;
    draggedAllocationId = allocation.dataset.dragAllocation;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedAllocationId);
  });
  document.addEventListener("dragover", (event) => {
    if (draggedAllocationId && event.target.closest("[data-machine][data-date]")) event.preventDefault();
  });
  document.addEventListener("drop", async (event) => {
    const cell = event.target.closest("[data-machine][data-date]");
    if (!cell || !draggedAllocationId) return;
    event.preventDefault();
    const allocation = allocationById(draggedAllocationId);
    const allocationId = draggedAllocationId;
    draggedAllocationId = null;
    if (!allocation || String(allocation.routingMode || "INHOUSE").toUpperCase() !== "INHOUSE") return alert("Hanya allocation in-house yang dapat digeser ke cell mesin.", "warning");
    if (isPastDate(cell.dataset.date)) return alert("Allocation tidak dapat digeser ke tanggal histori.", "warning");
    let freezeOverrideReason = null;
    if (capacityPlanningMode === "PRODUCTION" && snapshot?.parameters?.freezeFenceDate && cell.dataset.date <= snapshot.parameters.freezeFenceDate) {
      freezeOverrideReason = await window.formPrompt("Tanggal tujuan berada dalam freeze fence. Masukkan alasan override minimal 10 karakter.", "", { title: "Geser Allocation" });
      if (freezeOverrideReason === null) return;
    }
    try {
      await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(allocation.planNumber || allocation.reference)}/manual-allocations/${encodeURIComponent(allocationId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleDate: cell.dataset.date,
          shift: allocation.shift === "VENDOR" ? "1" : String(allocation.shift || "1"),
          plannedStartTime: allocation.plannedStartTime || null,
          plannedEndTime: allocation.plannedEndTime || null,
          plannedQty: number(allocation.qty),
          routingMode: "INHOUSE",
          machineId: cell.dataset.machine,
          notes: allocation.notes || allocation.reason || null,
          freezeOverrideReason,
        }),
      });
      alert("Allocation berhasil digeser; urutan dan jam tetap dipertahankan.", "success");
      await load();
    } catch (error) { alert(error.message); }
  });
  $("capacity-preset-shift-count").addEventListener("change", togglePresetShiftWindows);
  $("capacity-cell-shifts").addEventListener("change", toggleDailyFields);
  $("capacity-preset-new").addEventListener("click", resetPresetForm);
  $("capacity-preset-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    try { const payload = readPresetForm(); const result = await api("/modules/api/planning-ppic/capacity-planning/presets", { method: "POST", body: JSON.stringify(payload) }); setMonthRange(result.preset.month); await loadSimulationPresets(result.preset.id); alert(`${result.preset.name} tersimpan dan menjadi preset aktif.`, "success"); updateCapacityModeUi(); await load(); } catch (error) { alert(error.message); }
  });
  $("capacity-preset-update").addEventListener("click", async () => {
    const preset = simulationPresets.find((item) => item.id === $("capacity-preset-id").value); if (!preset) return;
    try { const result = await api(`/modules/api/planning-ppic/capacity-planning/presets/${encodeURIComponent(preset.id)}`, { method: "PUT", body: JSON.stringify(readPresetForm(preset)) }); setMonthRange(result.preset.month); await loadSimulationPresets(result.preset.id); alert(`${result.preset.name} diperbarui.`, "success"); await load(); } catch (error) { alert(error.message); }
  });
  ["capacity-shifts", "capacity-hours", "capacity-efficiency", "capacity-overtime", "capacity-saturday", "capacity-sunday"].forEach((id) => $(id).addEventListener("change", () => {
    $("capacity-scenario").value = "custom";
    load();
  }));
  $("capacity-cell-status").addEventListener("change", toggleDailyFields);
  $("capacity-cell-form").addEventListener("submit", async (event) => { event.preventDefault(); const planNumber = $("capacity-plan").value;
    try {
      if (isPastDate($("capacity-cell-date").value)) return alert("Hari yang sudah lewat dikunci dan tidak dapat mengubah preset/capacity.", "warning");
      if (!planNumber) return alert("Pilih Monthly Production Plan terlebih dahulu.", "warning");
      const shiftCount = Number($("capacity-cell-shifts").value);
      const shiftOverrides = defaultShiftWindows.slice(0, shiftCount).map((_, index) => ({
        startTime: $(`capacity-cell-shift-${index + 1}-start`).value,
        endTime: $(`capacity-cell-shift-${index + 1}-end`).value,
        breakMinutes: number($(`capacity-cell-shift-${index + 1}-start`).dataset.breakMinutes),
        overtimeBeforeStart: $(`capacity-cell-shift-${index + 1}-ot-before-start`).value || null,
        overtimeBeforeEnd: $(`capacity-cell-shift-${index + 1}-ot-before-end`).value || null,
        overtimeAfterStart: $(`capacity-cell-shift-${index + 1}-ot-after-start`).value || null,
        overtimeAfterEnd: $(`capacity-cell-shift-${index + 1}-ot-after-end`).value || null,
      }));
      await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/capacity-day`, { method: "POST", body: JSON.stringify({ machineId: $("capacity-cell-machine").value, scheduleDate: $("capacity-cell-date").value, dayStatus: $("capacity-cell-status").value, shiftsPerDay: shiftCount, shiftOverrides, overtimeStart: null, overtimeEnd: null, reason: $("capacity-cell-reason").value }) }); alert("Jam shift dan rentang lembur per shift tersimpan; allocation Monthly Plan tidak berubah.", "success"); await load();
    } catch (error) { alert(error.message); }
  });
  document.addEventListener("change", (event) => { const mode = event.target.closest("[data-routing-mode]"); if (!mode) return; const wrap = mode.closest("[data-routing-assignment]"); wrap.querySelector("[data-routing-machine]").classList.toggle("d-none", mode.value === "VENDOR"); wrap.querySelector("[data-routing-vendor]").classList.toggle("d-none", mode.value !== "VENDOR"); });
  document.addEventListener("click", async (event) => { const cell = event.target.closest("[data-machine][data-date]"); if (cell) { activateCapacityWorkbench("schedule"); return renderCell(cell.dataset.machine, cell.dataset.date, true); } const button = event.target.closest("[data-save-routing]"); if (!button) return; const wrap = button.closest("[data-routing-assignment]"); const routingMode = wrap.querySelector("[data-routing-mode]").value; const reason = wrap.querySelector("[data-routing-reason]").value; if (reason.trim().length < 10) return alert("Alasan assignment minimal 10 karakter.", "warning"); try { button.disabled = true; await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(wrap.dataset.plan)}/capacity-machine-override`, { method: "POST", body: JSON.stringify({ lineNumber: Number(wrap.dataset.line), mbomProcessId: wrap.dataset.route, scheduleDate: $("capacity-cell-date").value, routingMode, machineId: routingMode === "INHOUSE" ? wrap.querySelector("[data-routing-machine]").value : null, diesId: wrap.querySelector("[data-routing-dies]").value || null, vendorId: routingMode === "VENDOR" ? wrap.querySelector("[data-routing-vendor]").value : null, reason }) }); alert("Assignment QD/vendor tersimpan; BOM default tidak berubah.", "success"); await load(); } catch (error) { button.disabled = false; alert(error.message); } });
  document.addEventListener("change", (event) => {
    const mode = event.target.closest("[data-daily-mode]");
    if (!mode) return;
    const wrap = mode.closest("[data-manual-daily]");
    wrap.querySelector("[data-daily-machine]").classList.toggle("d-none", mode.value === "VENDOR");
    wrap.querySelector("[data-daily-shift]").classList.toggle("d-none", mode.value === "VENDOR");
    wrap.querySelector("[data-daily-vendor]").classList.toggle("d-none", mode.value !== "VENDOR");
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-save-manual-daily]");
    if (!button) return;
    const wrap = button.closest("[data-manual-daily]");
    const routingMode = wrap.querySelector("[data-daily-mode]").value;
    const plannedQty = number(wrap.querySelector("[data-daily-qty]").value);
    if (plannedQty <= 0) return alert("Qty Daily Plan harus lebih dari nol.", "warning");
    try {
      button.disabled = true;
      const result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(wrap.dataset.plan)}/manual-daily-plans`, {
        method: "POST",
        body: JSON.stringify({
          lineNumber: Number(wrap.dataset.line),
          mbomProcessId: wrap.dataset.route,
          scheduleDate: wrap.dataset.date,
          shift: wrap.querySelector("[data-daily-shift]").value,
          plannedQty,
          routingMode,
          machineId: routingMode === "INHOUSE" ? wrap.querySelector("[data-daily-machine]").value : null,
          vendorId: routingMode === "VENDOR" ? wrap.querySelector("[data-daily-vendor]").value : null,
          notes: wrap.querySelector("[data-daily-notes]").value.trim() || null,
        }),
      });
      alert(`${num(result.summary?.createdCount || 1)} Daily Plan berhasil dibuat.`, "success");
      await load();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  });
  $("capacity-manual-plan").addEventListener("change", refreshManualTaskOptions);
  $("capacity-manual-task").addEventListener("change", refreshManualTaskOptions);
  $("capacity-manual-machine").addEventListener("change", () => {
    if (!editingAllocation) refreshManualTaskOptions();
    else renderManualRecommendation(false);
    refreshManualDies(editingAllocation?.diesId || null);
  });
  $("capacity-manual-mode").addEventListener("change", () => {
    toggleManualAllocationMode();
    if ($("capacity-manual-mode").value === "VENDOR") refreshVendorScheduleDefaults(false);
    renderManualRecommendation(true);
  });
  $("capacity-manual-vendor").addEventListener("change", () => refreshVendorScheduleDefaults(true));
  $("capacity-manual-vendor-send").addEventListener("change", () => refreshVendorScheduleDefaults(true));
  $("capacity-manual-date").addEventListener("change", () => {
    if ($("capacity-manual-mode").value === "VENDOR") $("capacity-manual-vendor-send").value = $("capacity-manual-date").value;
    renderManualRecommendation(false);
  });
  $("capacity-manual-qty").addEventListener("input", () => {
    renderManualRecommendation(false);
    if ($("capacity-manual-mode").value === "VENDOR") {
      $("capacity-manual-vendor-return-qty").value = $("capacity-manual-qty").value;
    }
  });
  $("capacity-manual-allocation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isPastDate($("capacity-manual-date").value)) return alert("Allocation hari yang sudah lewat dikunci sebagai histori Production.", "warning");
    const taskKey = $("capacity-manual-task").value;
    const task = (snapshot.manualAllocationCatalog || []).find((item) => `${item.planNumber}|${item.lineNumber}|${item.mbomProcessId}` === taskKey);
    const plannedQty = number($("capacity-manual-qty").value);
    const maximumQty = number(task?.remainingQty) + (editingAllocation ? number(editingAllocation.qty) : 0);
    if (!task) return alert("Pilih MPP dan proses yang akan dialokasikan.", "warning");
    if (plannedQty <= 0 || plannedQty > maximumQty + 0.000001) return alert(`Qty harus lebih dari 0 dan tidak melebihi sisa ${num(maximumQty, 3)}.`, "warning");
    const submit = event.submitter;
    try {
      if (submit) submit.disabled = true;
      const routingMode = $("capacity-manual-mode").value;
      const allocationId = $("capacity-manual-allocation-id").value;
      await api(allocationId
        ? `/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(task.planNumber)}/manual-allocations/${encodeURIComponent(allocationId)}`
        : `/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(task.planNumber)}/manual-allocations`, {
        method: allocationId ? "PATCH" : "POST",
        body: JSON.stringify({
          lineNumber: task.lineNumber,
          mbomProcessId: task.mbomProcessId,
          scheduleDate: $("capacity-manual-date").value,
          shift: $("capacity-manual-shift").value,
          plannedStartTime: routingMode === "INHOUSE" ? $("capacity-manual-start").value || null : null,
          plannedEndTime: routingMode === "INHOUSE" ? $("capacity-manual-end").value || null : null,
          plannedQty,
          routingMode,
          machineId: routingMode === "INHOUSE" ? $("capacity-manual-machine").value : null,
          diesId: routingMode === "INHOUSE" ? $("capacity-manual-dies").value || null : null,
          vendorId: routingMode === "VENDOR" ? $("capacity-manual-vendor").value : null,
          vendorSendDate: routingMode === "VENDOR" ? $("capacity-manual-vendor-send").value : null,
          vendorReturnDate: routingMode === "VENDOR" ? $("capacity-manual-vendor-return").value : null,
          expectedReturnQty: routingMode === "VENDOR" ? number($("capacity-manual-vendor-return-qty").value) : null,
          notes: $("capacity-manual-notes").value.trim() || null,
          freezeOverrideReason: $("capacity-manual-freeze-reason").value.trim() || null,
          planningMode: capacityPlanningMode,
          scenarioKey: activeScenarioKey(),
        }),
      });
      alert(`${task.planNumber} · ${task.partCode} berhasil ${allocationId ? "diperbarui" : "dialokasikan"} ${num(plannedQty, 3)} pada ${$("capacity-manual-date").value}.`, "success");
      $("capacity-manual-notes").value = "";
      $("capacity-manual-freeze-reason").value = "";
      resetAllocationEditor();
      await load();
    } catch (error) {
      alert(error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  document.addEventListener("click", async (event) => {
    const vendorHeatmapCell = event.target.closest("[data-vendor-heatmap-allocation]");
    if (vendorHeatmapCell?.dataset.vendorHeatmapAllocation) return startAllocationEdit(vendorHeatmapCell.dataset.vendorHeatmapAllocation);
    const editButton = event.target.closest("[data-edit-manual-allocation]");
    if (editButton) { const allocation = allocationById(editButton.dataset.editManualAllocation); if (isPastDate(allocation?.scheduleDate || allocation?.sendDate)) return alert("Allocation hari yang sudah lewat tidak dapat diedit.", "warning"); return startAllocationEdit(editButton.dataset.editManualAllocation); }
    const button = event.target.closest("[data-remove-manual-allocation]");
    if (!button) return;
    if (!confirm("Hapus draft allocation ini? Qty akan kembali menjadi sisa MPP yang dapat dialokasikan.")) return;
    const allocation = allocationById(button.dataset.removeManualAllocation);
    if (isPastDate(allocation?.scheduleDate || allocation?.sendDate)) return alert("Allocation hari yang sudah lewat tidak dapat dihapus.", "warning");
    let freezeOverrideReason = null;
    if (capacityPlanningMode === "PRODUCTION" && allocation?.scheduleDate && snapshot?.parameters?.freezeFenceDate && allocation.scheduleDate <= snapshot.parameters.freezeFenceDate) {
      freezeOverrideReason = await window.formPrompt("Tanggal allocation berada dalam freeze fence. Masukkan alasan override minimal 10 karakter.", "", { title: "Override Freeze Fence" });
      if (freezeOverrideReason === null) return;
    }
    try {
      button.disabled = true;
      await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(button.dataset.plan)}/manual-allocations/${encodeURIComponent(button.dataset.removeManualAllocation)}/remove`, {
        method: "PATCH",
        body: JSON.stringify({ freezeOverrideReason }),
      });
      alert("Draft allocation dihapus.", "success");
      await load();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  });
  $("capacity-manual-cancel-edit").addEventListener("click", () => {
    resetAllocationEditor();
    if (selectedCell) renderCell(selectedCell.machineId, selectedCell.date, false);
  });
  function setupCapacityDialogs() {
    const allocationPanel = $("capacity-allocation-panel");
    if (allocationPanel && !$("capacity-allocation-dialog")) {
      const dialog = document.createElement("dialog");
      dialog.id = "capacity-allocation-dialog";
      dialog.className = "capacity-dialog capacity-allocation-dialog";
      const shell = document.createElement("div");
      shell.className = "capacity-dialog-shell";
      shell.innerHTML = '<header class="capacity-dialog-head"><div><small>MACHINE–DAY CAPACITY</small><b>Review Load & Jam Capacity</b><p>Jadwal mengikuti Monthly Production Plan. Di sini hanya jam kerja, shift, dan overtime yang dapat disesuaikan.</p></div><button class="capacity-dialog-close" type="button" data-close-dialog="capacity-allocation-dialog" aria-label="Tutup">&times;</button></header>';
      shell.append(allocationPanel);
      dialog.append(shell);
      document.body.append(dialog);
    }
    const scenarioDialog = $("capacity-scenario-dialog");
    const flowDialog = $("capacity-flow-dialog");
    $("capacity-open-scenario")?.addEventListener("click", () => scenarioDialog?.showModal());
    document.addEventListener("click", (event) => {
      const close = event.target.closest("[data-close-dialog]");
      if (close) $(close.dataset.closeDialog)?.close();
      const sectionToggle = event.target.closest("[data-capacity-dialog-section]");
      if (sectionToggle) {
        const section = $(sectionToggle.dataset.capacityDialogSection);
        if (!section) return;
        const collapsed = section.classList.toggle("capacity-dialog-section-collapsed");
        sectionToggle.classList.toggle("active", !collapsed);
        sectionToggle.setAttribute("aria-expanded", String(!collapsed));
      }
    });
    [$("capacity-allocation-dialog"), scenarioDialog, flowDialog].filter(Boolean).forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
    document.querySelectorAll("[data-capacity-mode]").forEach((button) => button.addEventListener("click", async () => {
      if (button.dataset.capacityMode === capacityPlanningMode) return;
      capacityPlanningMode = button.dataset.capacityMode;
      localStorage.setItem("capacity-planning-mode", capacityPlanningMode);
      await loadSimulationPresets(selectedPresetKey());
      updateCapacityModeUi();
      await load();
    }));
    $("capacity-adopt-simulation")?.addEventListener("click", async () => {
      const planNumber = $("capacity-plan").value;
      const scenarioKey = activeScenarioKey();
      if (!planNumber || !scenarioKey) return alert("Pilih Production Plan dan Simulation yang akan diterapkan.", "warning");
      if (!confirm(`Tetapkan preset ${activePreset()?.name || scenarioKey} sebagai satu-satunya Current Use Capacity? Auto recommendation MPP berikutnya akan memakai preset ini. Hanya hari ini dan hari mendatang yang diganti; histori tetap terkunci.`)) return;
      try {
        const scenario = scenarioConfig(scenarioKey);
        const result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/capacity-adopt-simulation`, { method: "POST", body: JSON.stringify({ scenarioKey, planningGranularity: scenario.granularity || "DAY", rollingLookbackWeeks: Number(scenario.lookbackWeeks || 0), freezeFenceDays: Number(scenario.freezeDays || 0) }) });
        alert(`${num(result.adoptedCount)} allocation dan ${num(result.appliedCalendarDays)} hari kalender ditetapkan sebagai Production. ${num(result.lockedPastAllocationCount)} allocation lampau tetap dikunci; ${num(result.cancelledDppCount)} DPP Draft hari ini/mendatang dibatalkan.`, "success");
        capacityPlanningMode = "PRODUCTION";
        localStorage.setItem("capacity-planning-mode", capacityPlanningMode);
        await loadSimulationPresets(scenarioKey);
        applyScenario(scenarioKey, false);
        updateCapacityModeUi();
        await load();
      } catch (error) { alert(error.message); }
    });
    $("capacity-sync-dpp")?.addEventListener("click", async () => {
      const planNumber = $("capacity-plan").value;
      if (!planNumber) return alert("Pilih Production Plan terlebih dahulu.", "warning");
      try {
        const result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(planNumber)}/daily-plans`, { method: "POST", body: JSON.stringify({ source: "PRODUCTION_CAPACITY" }) });
        const summary = result.summary || {};
        alert(`DPP tersinkron: ${num(summary.createdCount)} dibuat, ${num(summary.updatedCount)} direvisi, ${num(summary.cancelledDraftCount)} dibatalkan.`, "success");
        await load();
        window.PpicWorkflow?.refresh($("capacity-month").value);
      } catch (error) { alert(error.message); }
    });
  }
  async function initializeCapacityPlanning() {
    setupCapacityDialogs();
    setupCapacityWorkspaceEvents();
    setDefaultRange();
    resetPresetForm();
    await loadPlans();
    await loadSimulationPresets();
    if ($("capacity-scenario").value) applyScenario($("capacity-scenario").value, false);
    updateCapacityModeUi();
    await load();
  }
  initializeCapacityPlanning().catch((error) => alert(error.message));
})();
