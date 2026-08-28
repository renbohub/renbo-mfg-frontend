(() => {
  "use strict";
  const roots = [...document.querySelectorAll("[data-ppic-workflow]")];
  if (!roots.length) return;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const monthFromRoot = (root) => {
    const monthControl = root.dataset.monthControl && document.getElementById(root.dataset.monthControl);
    const dateControl = root.dataset.dateControl && document.getElementById(root.dataset.dateControl);
    const query = new URLSearchParams(location.search);
    // URL is the navigation contract. Page controls may still contain their
    // server-rendered default when this deferred strip initializes.
    const candidate = query.get("month") || query.get("date")?.slice(0, 7) || monthControl?.value || dateControl?.value?.slice(0, 7);
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(candidate || "")) ? candidate : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  };
  const stageState = (ready, exists = true) => ready ? "ready" : exists ? "action" : "blocked";
  const buildStages = (data) => {
    const mps = data.mps || [];
    const mrp = data.mrpRuns || [];
    const plans = data.plans || [];
    const allocations = data.scheduleRows || [];
    const dailyTotal = plans.reduce((sum, row) => sum + Number(row.dailyPlanCount || 0), 0);
    const dailyReleased = plans.reduce((sum, row) => sum + Number(row.dailyPlanReleasedCount || 0), 0);
    const firstDailyDate = plans.map((row) => row.firstDailyPlanDate).filter(Boolean).sort()[0] || `${data.month}-01`;
    const mpsReady = mps.length > 0 && mps.every((row) => ["Confirmed", "Released", "Completed"].includes(row.status));
    const mrpReady = mrp.some((row) => row.presentationStatus === "APPROVED" || row.status === "Completed");
    const planReady = plans.length > 0 && plans.every((row) => ["Released", "In Progress", "Closed"].includes(row.status) && !row.replanRequired);
    const capacityReady = allocations.length > 0 && !allocations.some((row) => row.capacityLate);
    return [
      { code: "MPS", label: "MPS", count: mps.length, state: stageState(mpsReady, mps.length > 0), copy: mpsReady ? "Demand sudah dikunci" : "Review & lock demand", href: `/modules/planning-ppic/mps/workbench?month=${encodeURIComponent(data.month)}` },
      { code: "MRP", label: "MRP", count: mrp.length, state: stageState(mrpReady, mrp.length > 0), copy: mrpReady ? "Current run tersedia" : "Run atau approve MRP", href: `/modules/planning-ppic/mrp?month=${encodeURIComponent(data.month)}` },
      { code: "MPP", label: "Monthly Plan", count: plans.length, state: stageState(planReady, plans.length > 0), copy: planReady ? "Plan sudah Released" : "Confirm & release plan", href: `/modules/planning-ppic/monthly-production-plans?month=${encodeURIComponent(data.month)}` },
      { code: "CAPACITY", label: "Capacity & MO", count: allocations.length, state: stageState(capacityReady, allocations.length > 0), copy: capacityReady ? "Allocation executable" : "Lengkapi slot dan MO", href: `/modules/planning-ppic/capacity-planning?month=${encodeURIComponent(data.month)}` },
      { code: "DAILY", label: "Daily Plan", count: dailyTotal, state: stageState(dailyReleased > 0, dailyTotal > 0), copy: dailyReleased > 0 ? `${dailyReleased} schedule released` : dailyTotal ? "Draft perlu direlease" : "Belum dipublish", href: `/modules/planning-ppic/daily-production-plans?date=${encodeURIComponent(firstDailyDate)}` },
    ];
  };
  async function loadRoot(root, forcedMonth) {
    const month = forcedMonth || monthFromRoot(root);
    const target = root.querySelector("[data-pwf-stages]");
    root.querySelector("[data-pwf-month]").textContent = month;
    target.innerHTML = '<span class="ppic-workflow-loading">Memperbarui status planning…</span>';
    try {
      const response = await fetch(`/modules/api/planning-ppic/execution-cockpit?month=${encodeURIComponent(month)}`, { credentials: "same-origin", headers: { Accept: "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Status planning gagal dimuat (${response.status}).`);
      const stages = buildStages(payload);
      target.innerHTML = stages.map((stage, index) => `<a class="ppic-workflow-step ${esc(stage.state)} ${stage.code === root.dataset.currentStage ? "current" : ""}" href="${esc(stage.href)}" title="${esc(stage.copy)}"><i>${index + 1}</i><span><b>${esc(stage.label)} · ${stage.count}</b><small>${esc(stage.copy)}</small></span></a>`).join("");
    } catch (error) { target.innerHTML = `<span class="ppic-workflow-error">${esc(error.message)}</span>`; }
  }
  roots.forEach((root) => {
    const control = document.getElementById(root.dataset.monthControl) || document.getElementById(root.dataset.dateControl);
    control?.addEventListener("change", () => loadRoot(root));
    loadRoot(root);
  });
  window.PpicWorkflow = { refresh(month) { roots.forEach((root) => loadRoot(root, month)); } };
})();
