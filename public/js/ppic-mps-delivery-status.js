(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MpsDeliveryStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const text = (value) => String(value || "").trim().toUpperCase();
  const dateKey = (value) => value ? String(value).slice(0, 10) : "";
  const normalizedFeasibility = (value) => {
    const status = text(value);
    if (["FEASIBLE", "ON_TIME", "SAFE"].includes(status)) return "FEASIBLE";
    if (["AT_RISK", "WARNING"].includes(status)) return "AT_RISK";
    if (["NOT_FEASIBLE", "INFEASIBLE", "LATE", "BLOCKER", "CAPACITY_LATE", "MATERIAL_LATE"].includes(status)) return "INFEASIBLE";
    return "STALE";
  };

  function phaseStatus(snapshot = {}) {
    const feasibility = normalizedFeasibility(snapshot.feasibilityStatus);
    if (snapshot.sourceCurrent === false || feasibility === "STALE") return {
      code: "STALE",
      label: "Belum Diperiksa",
      tone: "warning",
      canRecovery: true,
      canAcceptLate: true,
    };
    const disposition = text(snapshot.dispositionStatus);
    if (disposition === "ACCEPT_LATE_APPROVED") return {
      code: "ACCEPT_LATE_APPROVED",
      label: "Accept Late",
      tone: "accept-late",
      canRecovery: false,
      canAcceptLate: false,
    };
    if (disposition === "ACCEPT_LATE_PENDING") return {
      code: "ACCEPT_LATE_PENDING",
      label: "Accept Late · Waiting Approval",
      tone: "warning",
      canRecovery: true,
      canAcceptLate: true,
    };
    if (["RECOVERY_PENDING", "RECOVERY_APPROVED"].includes(disposition)) return {
      code: disposition,
      label: disposition === "RECOVERY_APPROVED" ? "Recovery · Recheck" : "Recovery Proposed",
      tone: "warning",
      canRecovery: true,
      canAcceptLate: true,
    };
    if (feasibility === "AT_RISK") return {
      code: "AT_RISK",
      label: "Delivery At Risk",
      tone: "warning",
      canRecovery: false,
      canAcceptLate: false,
    };
    if (feasibility === "INFEASIBLE") return {
      code: "INFEASIBLE",
      label: "Delivery Infeasible",
      tone: "danger",
      canRecovery: true,
      canAcceptLate: true,
    };
    return {
      code: "FEASIBLE",
      label: "Delivery Feasible",
      tone: "success",
      canRecovery: false,
      canAcceptLate: false,
    };
  }

  function decoratePhases(phases = [], snapshots = []) {
    const byTarget = new Map(snapshots.filter((row) => row.deliveryTargetId).map((row) => [row.deliveryTargetId, row]));
    const bySourceDate = new Map(snapshots.map((row) => [`${row.sourceNumber || ""}|${dateKey(row.originalTargetDate)}`, row]));
    return phases.map((phase) => {
      const snapshot = byTarget.get(phase.deliveryTargetId)
        || bySourceDate.get(`${phase.sourceNumber || ""}|${dateKey(phase.targetDeliveryDate || phase.fgRequiredDate)}`)
        || null;
      return { ...phase, feasibilitySnapshot: snapshot, feasibility: phaseStatus(snapshot || {}) };
    });
  }

  function summarizePhases(phases = []) {
    const statuses = phases.map((phase) => phase.feasibility || phaseStatus(phase.feasibilitySnapshot || {}));
    if (!statuses.length) return phaseStatus({ feasibilityStatus: "STALE" });
    return statuses.find((row) => row.code === "INFEASIBLE")
      || statuses.find((row) => row.code === "STALE")
      || statuses.find((row) => row.code === "ACCEPT_LATE_PENDING")
      || statuses.find((row) => row.code.startsWith("RECOVERY_"))
      || statuses.find((row) => row.code === "ACCEPT_LATE_APPROVED")
      || statuses.find((row) => row.code === "AT_RISK")
      || statuses[0];
  }

  function actionLinks(deliveryTargetId) {
    const id = String(deliveryTargetId || "");
    return {
      detail: id,
      recovery: "recovery",
      acceptLate: "accept-late",
    };
  }

  function phaseAction(status = {}) {
    if (status.code === "STALE") return { mode: "recheck", icon: "↻", label: "Hitung ulang feasibility" };
    if (status.canRecovery || status.canAcceptLate) return { mode: "handle", icon: "!", label: "Tangani delivery" };
    return { mode: "detail", icon: "i", label: "Detail feasibility" };
  }

  function inspectionAction(gate = {}) {
    const status = text(gate.feasibilityStatus);
    const blockers = Math.max(Number(gate.blockerCount) || 0, 0);
    if (status === "STALE" || status === "UNKNOWN" || !status) return {
      label: `Periksa${blockers ? ` ${blockers}` : ""} Delivery`,
      tone: "warning",
    };
    if (status === "INFEASIBLE") return {
      label: "Periksa Ulang Delivery",
      tone: "danger",
    };
    return { label: "Periksa Ulang Delivery", tone: "success" };
  }

  function reviewRequest(mpsNumber, deliveryTargetId = "") {
    return {
      url: `/modules/api/planning-ppic/mps/${encodeURIComponent(String(mpsNumber || ""))}/delivery-feasibility/review`,
      options: {
        method: "POST",
        body: JSON.stringify({ deliveryTargetIds: deliveryTargetId ? [String(deliveryTargetId)] : [] }),
      },
    };
  }

  function blockedGateTitle(gate = {}) {
    return text(gate.feasibilityStatus) === "INFEASIBLE"
      ? "Delivery Infeasible"
      : "Delivery Belum Diperiksa";
  }

  function inspectionSuccessMessage(result = {}) {
    const fallback = `${Math.max(Number(result.reviewedCount) || 0, 0)} delivery phase selesai diperiksa.`;
    return `${String(result.message || fallback).trim()} Delivery aman dikonfirmasi otomatis; blocker tetap memerlukan tindakan.`;
  }

  return { phaseStatus, decoratePhases, summarizePhases, actionLinks, phaseAction, inspectionAction, reviewRequest, blockedGateTitle, inspectionSuccessMessage };
});
