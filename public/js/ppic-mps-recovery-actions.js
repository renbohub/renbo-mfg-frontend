(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MpsRecoveryActions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const buttonByKind = {
    root: { label: "Atur", icon: "⚙", compact: true },
    phase: { label: "Tangani", icon: "!", compact: true },
    buffer: { label: "Detail", icon: "?", compact: true },
  };

  function actionButton(kind) {
    return { ...(buttonByKind[kind] || buttonByKind.phase) };
  }

  function endpoints(deliveryTargetId, planId = "") {
    const target = encodeURIComponent(String(deliveryTargetId || ""));
    const plan = encodeURIComponent(String(planId || ""));
    const targetBase = `/modules/api/planning-ppic/demand-planning/${target}/recovery-plan`;
    const planBase = `/modules/api/planning-ppic/demand-planning/recovery-plans/${plan}`;
    return {
      load: targetBase,
      save: targetBase,
      submit: `${planBase}/submit`,
      approve: `${planBase}/approve`,
      reject: `${planBase}/reject`,
    };
  }

  function preparePlan(payload = {}, requestedAction = "recovery") {
    const plan = payload.plan || null;
    const status = plan?.status || "SYSTEM_RECOMMENDATION";
    const locked = ["PENDING_APPROVAL", "APPROVED"].includes(status);
    const source = Array.isArray(plan?.checklist) ? plan.checklist : (payload.recommendation?.actions || []);
    const checklist = source.map((item) => ({
      ...item,
      selected: !locked && requestedAction === "accept-late" && item.id === "ACCEPT_LATE" ? true : item.selected,
    }));
    return { ...payload, plan, status, locked, pending: status === "PENDING_APPROVAL", checklist };
  }

  function simpleFormModel(payload = {}, requestedAction = "recovery") {
    const prepared = preparePlan(payload, requestedAction);
    const mode = requestedAction === "accept-late" ? "accept-late" : "recovery";
    const requiredChecks = prepared.checklist.filter((item) => item.required);
    const acceptLate = prepared.checklist.find((item) => item.id === "ACCEPT_LATE") || null;
    const methods = prepared.checklist.filter((item) => !item.required && item.id !== "ACCEPT_LATE");
    const selectedAction = mode === "accept-late"
      ? acceptLate
      : methods.find((item) => item.selected) || methods[0] || null;
    return { ...prepared, mode, requiredChecks, methods, selectedAction };
  }

  function mergeSimpleForm(checklist = [], fields = {}) {
    const mode = fields.mode === "accept-late" ? "accept-late" : "recovery";
    const selectedId = mode === "accept-late" ? "ACCEPT_LATE" : fields.methodId;
    return checklist.map((item) => {
      const selected = item.required || item.id === selectedId;
      if (item.id !== selectedId) {
        return {
          ...item,
          selected,
          owner: selected ? (item.owner || fields.owner || null) : item.owner,
        };
      }
      return {
        ...item,
        selected: true,
        owner: fields.owner || item.owner || item.ownerRole || null,
        targetDate: fields.targetDate || item.targetDate || null,
        notes: fields.notes || null,
        evidenceReference: fields.evidenceReference || null,
      };
    });
  }

  function shouldRefreshDeliveryAfterCommand(command) {
    return ["save", "submit", "revise", "approve", "reject"].includes(String(command || "").toLowerCase());
  }

  return { actionButton, endpoints, preparePlan, simpleFormModel, mergeSimpleForm, shouldRefreshDeliveryAfterCommand };
});
