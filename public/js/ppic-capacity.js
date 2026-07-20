(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const hours = (minutes) => `${num(number(minutes) / 60, 1)} jam`;
  const monthLabel = (value) => new Intl.DateTimeFormat("id-ID", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
  const weekday = (value) => new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(new Date(`${value}T00:00:00`));
  let snapshot = null;
  let plans = [];

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Capacity Planning gagal diproses.");
    return payload.data || payload.items || payload;
  }
  function alert(message, kind = "danger") { const box = $("capacity-alert"); box.textContent = message; box.className = `alert alert-${kind}`; }
  function setDefaultRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const local = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    $("capacity-start").value = local(start); $("capacity-end").value = local(end);
  }
  async function loadPlans() {
    try {
      plans = await api("/modules/api/planning-ppic/monthly-plan?start=0&length=200");
      $("capacity-plan").innerHTML = '<option value="">Semua production plan aktif</option>' + plans.map((plan) => `<option value="${esc(plan.planNumber)}">${esc(plan.planNumber)} · ${esc(plan.status)} · ${esc(plan.sourceMpsNumber || plan.sourceType || "Manual")}</option>`).join("");
      const requestedPlan = new URLSearchParams(location.search).get("planNumber");
      const selected = plans.find((plan) => plan.planNumber === requestedPlan);
      if (selected) { $("capacity-plan").value = selected.planNumber; $("capacity-start").value = String(selected.periodStart).slice(0, 10); $("capacity-end").value = String(selected.periodEnd).slice(0, 10); }
    } catch (_) { plans = []; }
  }
  function renderStats() {
    const summary = snapshot.summary;
    $("capacity-stat-machines").textContent = `${num(summary.activeMachineCount)} / ${num(summary.machineCount)}`;
    $("capacity-stat-machines-note").textContent = `${num(summary.processCount)} process · ${num(summary.routeCount)} routing · ${num(summary.fgReceiptLineCount)} FG receipt`;
    $("capacity-stat-available").textContent = hours(summary.totalAvailableMinutes);
    $("capacity-stat-load").textContent = hours(summary.totalLoadMinutes);
    $("capacity-stat-utilization").textContent = `Utilization ${num(summary.utilizationPercent, 1)}% · Firm ${hours(summary.totalFirmMinutes)} · Proposed ${hours(summary.totalProposedMinutes)}`;
    $("capacity-stat-overload").textContent = `${num(summary.overloadedCells)} / ${num(summary.unscheduledCount)}`;
    $("capacity-stat-readiness").textContent = `${num(snapshot.readiness.blockingCount)} blocker · ${num(snapshot.readiness.warningCount)} warning`;
  }
  function renderHeatmap() {
    $("capacity-heatmap-head").innerHTML = `<tr><th>Machine / Line</th>${snapshot.dates.map((date) => `<th>${esc(weekday(date))}<br><b>${esc(monthLabel(date))}</b></th>`).join("")}</tr>`;
    $("capacity-heatmap-body").innerHTML = snapshot.machines.map((machine) => `<tr><td><div class="capacity-machine"><b>${esc(machine.machineCode)} · ${esc(machine.machineName || "-")}</b><span>${esc(machine.lineCode || machine.machineType || "Tanpa line")}</span><small>${esc(machine.status)} · ${num(machine.defaultAvailableMinutes)} menit/hari</small></div></td>${snapshot.dates.map((date) => { const cell = machine.cells[date]; return `<td><button class="capacity-cell ${esc(cell.status)}" type="button" data-machine="${esc(machine.id)}" data-date="${esc(date)}"><b>${num(cell.loadPercent, 1)}%</b><span>${num(cell.loadMinutes)} / ${num(cell.availableMinutes)} min</span><small>F ${num(cell.firmMinutes)} · P ${num(cell.proposedMinutes)}</small></button></td>`; }).join("")}</tr>`).join("") || '<tr><td class="capacity-empty">Master machine belum tersedia.</td></tr>';
    $("capacity-loading").classList.add("d-none"); $("capacity-heatmap-wrap").classList.remove("d-none");
  }
  function renderCell(machineId, date) {
    document.querySelectorAll(".capacity-cell.selected").forEach((element) => element.classList.remove("selected"));
    const button = document.querySelector(`[data-machine="${CSS.escape(machineId)}"][data-date="${CSS.escape(date)}"]`); button?.classList.add("selected");
    const machine = snapshot.machines.find((row) => row.id === machineId); const cell = machine?.cells?.[date];
    if (!machine || !cell) return;
    $("capacity-detail-title").textContent = `${machine.machineCode} · ${monthLabel(date)}`;
    $("capacity-detail-subtitle").textContent = `Available ${num(cell.availableMinutes)} min · Firm ${num(cell.firmMinutes)} min · Proposed ${num(cell.proposedMinutes)} min · Downtime ${num(cell.downtimeMinutes)} min`;
    $("capacity-detail-body").innerHTML = cell.items.map((item) => `<tr><td><span class="capacity-source ${esc(String(item.source || "").toLowerCase())}">${esc(item.source)}</span></td><td><b>${esc(item.reference)}</b>${item.moNumber ? `<small class="d-block">${esc(item.moNumber)} / ${esc(item.woNumber)}</small>` : ""}</td><td>${esc(item.partCode)}</td><td>${esc(item.processCode || item.label)}</td><td>${esc(item.shift)}</td><td>${num(item.qty, 3)} ${esc(item.uomCode || "")}</td><td>${num(item.minutes, 1)} min</td><td>${esc(item.status)}</td></tr>`).join("") || '<tr><td colspan="8" class="capacity-empty">Belum ada load pada machine dan tanggal ini.</td></tr>';
  }
  function masterLink(issue) {
    if (issue.machineCode) return `<a href="/master-data/machines/${encodeURIComponent(issue.machineCode)}/edit?key=${encodeURIComponent(issue.machineCode)}">Perbaiki master machine →</a>`;
    if (/ROUTING|CYCLE|MACHINE/.test(issue.code)) return '<a href="/modules/manufacturing-bom/bill-of-materials">Buka routing MBOM →</a>';
    if (/PROCESS/.test(issue.code)) return '<a href="/master-data/processes">Buka master process →</a>';
    return "";
  }
  function renderReadiness() {
    const readiness = snapshot.readiness;
    const badge = $("capacity-readiness-badge");
    badge.className = `capacity-readiness-badge ${readiness.ok ? "ready" : "blocked"}`; badge.textContent = readiness.ok ? "Ready" : `${num(readiness.blockingCount)} Blocker`;
    const ranked = [...readiness.issues].sort((a, b) => ({ blocking: 0, warning: 1, info: 2 }[a.severity] - { blocking: 0, warning: 1, info: 2 }[b.severity]));
    $("capacity-readiness-list").innerHTML = ranked.slice(0, 80).map((issue) => `<div class="capacity-issue ${esc(issue.severity)}"><i></i><div><b>${esc(issue.code)}</b><span>${esc(issue.message)}</span>${masterLink(issue)}</div></div>`).join("") || '<div class="capacity-empty">Master process dan machine siap digunakan.</div>';
  }
  function renderUnscheduled() {
    $("capacity-unscheduled-count").textContent = `${num(snapshot.unscheduled.length)} item`;
    $("capacity-unscheduled-body").innerHTML = snapshot.unscheduled.map((item) => `<tr><td><span class="capacity-source ${esc(String(item.source || "").toLowerCase())}">${esc(item.source)}</span></td><td><b>${esc(item.reference)}</b>${item.lineNumber ? `<small class="d-block">Line ${num(item.lineNumber)}</small>` : ""}</td><td>${esc(item.partCode)}</td><td>${esc(item.processCode)}</td><td>${esc(item.machineCode)}</td><td>${num(item.qty, 3)} ${esc(item.uomCode || "")}</td><td>${num(item.minutes, 1)}</td><td>${esc(item.reason)}</td></tr>`).join("") || '<tr><td colspan="8" class="capacity-empty">Tidak ada load yang tertinggal di luar schedule.</td></tr>';
  }
  async function load() {
    $("capacity-loading").classList.remove("d-none"); $("capacity-heatmap-wrap").classList.add("d-none"); $("capacity-alert").classList.add("d-none");
    const params = new URLSearchParams({ startDate: $("capacity-start").value, endDate: $("capacity-end").value, shiftsPerDay: $("capacity-shifts").value, shiftHours: $("capacity-hours").value, efficiencyPercent: $("capacity-efficiency").value });
    if ($("capacity-plan").value) params.set("planNumber", $("capacity-plan").value);
    try {
      snapshot = await api(`/modules/api/planning-ppic/capacity-planning?${params}`);
      renderStats(); renderHeatmap(); renderReadiness(); renderUnscheduled();
      const firstLoaded = snapshot.machines.flatMap((machine) => snapshot.dates.map((date) => ({ machine, date, cell: machine.cells[date] }))).find((entry) => entry.cell.items.length) || (snapshot.machines[0] ? { machine: snapshot.machines[0], date: snapshot.dates[0] } : null);
      if (firstLoaded) renderCell(firstLoaded.machine.id, firstLoaded.date);
    } catch (error) { $("capacity-loading").classList.add("d-none"); alert(error.message); }
  }
  $("capacity-refresh").addEventListener("click", load);
  $("capacity-plan").addEventListener("change", function () { const plan = plans.find((row) => row.planNumber === this.value); if (plan) { $("capacity-start").value = String(plan.periodStart).slice(0, 10); $("capacity-end").value = String(plan.periodEnd).slice(0, 10); } load(); });
  document.addEventListener("click", (event) => { const cell = event.target.closest("[data-machine][data-date]"); if (cell) renderCell(cell.dataset.machine, cell.dataset.date); });
  setDefaultRange(); loadPlans().finally(load);
})();
