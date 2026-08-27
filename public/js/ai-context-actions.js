(function () {
  "use strict";
  const allowedCapabilities = new Set(["inventory.get_stock_summary", "inventory.trace_stock_usage", "inventory.get_stock_risk", "purchasing.get_material_shortage", "purchasing.find_late_po", "purchasing.create_recovery_draft", "production.get_daily_progress", "production.analyze_ng_and_downtime", "production.create_recovery_draft", "ppic.explain_mps", "ppic.explain_mrp_netting", "ppic.get_delivery_blockers", "ppic.get_capacity_risk", "ppic.compare_capacity_presets", "ppic.explain_capacity_blocker", "ppic.create_capacity_simulation_draft"]);
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-ai-capability]");
    if (!trigger || !window.ERP_AI_ASSISTANT) return;
    if (!allowedCapabilities.has(trigger.dataset.aiCapability)) return;
    let context = {};
    try { context = JSON.parse(trigger.dataset.aiContext || "{}"); } catch { return; }
    const safeQuery = Object.fromEntries([...new URLSearchParams(location.search).entries()].filter(([key]) => /^(month|planNumber|presetId|machineId|date|riskCode|runNumber|mpsNumber)$/i.test(key)));
    window.ERP_AI_ASSISTANT.open({ capabilityCode: trigger.dataset.aiCapability, prompt: trigger.dataset.aiPrompt || "", context: { ...context, ...safeQuery } });
  });
})();
