/* Execution permissions shared by both BOM editors. Actual batches are assigned in Monthly Plan. */
(() => {
  const expanded = new WeakSet();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (value) => JSON.parse(JSON.stringify(value || {}));
  const defaultMode = (route) => route.routingMode === "VENDOR" ? "VENDOR" : "INHOUSE";
  function ensure(route) {
    route.machinePlanningPolicy ||= {};
    return route.machinePlanningPolicy.execution ||= { allowedModes: [defaultMode(route)], allowSplit: false, vendorIds: [] };
  }
  function inhouseRoute(route) {
    const execution = ensure(route);
    execution.inhouse ||= { machineSpecificationCode: "", cycleTime: 0, diesId: null, machinePlanningPolicy: {} };
    execution.inhouse.machinePlanningPolicy ||= {};
    return { ...execution.inhouse, routingMode: "INHOUSE" };
  }
  function render(route, machines, dies, vendorCandidates = [], partId = route.mbomDetail?.partId) {
    const mode = defaultMode(route);
    const alternate = mode === "INHOUSE" ? "VENDOR" : "INHOUSE";
    const execution = route.machinePlanningPolicy?.execution || {};
    const enabled = (execution.allowedModes || []).includes(alternate);
    const selected = new Set(execution.vendorIds || []);
    const vendors = vendorCandidates.map(item => item.vendor || item);
    if (mode === "VENDOR" && route.vendorId) selected.add(route.vendorId);
    const missingVendors = [...selected].filter(id => !vendors.some(vendor => vendor.id === id) && id !== route.vendorId);
    const showVendor = mode === "VENDOR" || enabled;
    let internal = "";
    if (mode === "VENDOR" && enabled) {
      const alternateRoute = { ...(execution.inhouse || {}), routingMode: "INHOUSE" };
      const specs = [...new Map(machines.filter(item => item.status === "Active" && !item.isDeleted && item.machineSpecificationCode).map(item => [item.machineSpecificationCode, item.machineSpecificationName || item.machineSpecificationCode])).entries()];
      internal = `<div class="bom-executor-inhouse" data-executor-inhouse><strong>Mesin dan tooling alternatif</strong><div class="bom-policy-resource-fields"><label>Spesifikasi mesin<select class="form-select" data-execution-field="machineSpecificationCode"><option value="">Pilih spesifikasi mesin</option>${specs.map(([code, name]) => `<option value="${esc(code)}" ${code === alternateRoute.machineSpecificationCode ? "selected" : ""}>${esc(code)} · ${esc(name)}</option>`).join("")}</select></label><label>Cycle time dasar (detik / pcs)<input class="form-control" type="number" min="0.001" step="any" data-execution-field="cycleTime" value="${Number(alternateRoute.cycleTime || 0)}"></label></div>${window.BomMachinePolicy.render(alternateRoute, machines, dies, partId)}</div>`;
    }
    return `<details class="bom-machine-policy bom-executor-policy" ${enabled || expanded.has(route) ? "open" : ""}><summary>Pelaksana Monthly Plan · Default ${mode === "VENDOR" ? "vendor" : "in-house"}${enabled ? " · Alternatif diizinkan" : ""}</summary><div class="bom-executor-content"><label class="bom-executor-choice"><input type="checkbox" data-execution-field="allowAlternative" ${enabled ? "checked" : ""}> Izinkan ${alternate === "VENDOR" ? "vendor" : "in-house"} sebagai alternatif</label>${enabled ? `<label class="bom-executor-choice"><input type="checkbox" data-execution-field="allowSplit" ${execution.allowSplit === true ? "checked" : ""}> Izinkan sebagian qty in-house dan sebagian vendor</label>` : ""}<small>Pelaksana aktual, qty, mesin, dan tanggal ditetapkan melalui “Ubah Pelaksana” di Monthly Plan.</small>${showVendor ? `<fieldset class="bom-executor-vendors"><legend>Vendor yang diizinkan untuk proses ini</legend>${vendors.length ? vendors.map(vendor => `<label class="bom-executor-choice"><input type="checkbox" data-execution-field="vendorId" data-execution-vendor="${esc(vendor.id)}" ${selected.has(vendor.id) ? "checked" : ""} ${mode === "VENDOR" && vendor.id === route.vendorId ? "disabled" : ""}> ${esc(vendor.vendorCode)} · ${esc(vendor.vendorName || "")}${mode === "VENDOR" && vendor.id === route.vendorId ? " (default)" : ""}</label>`).join("") : '<small class="text-danger">Belum ada vendor aktif yang terdaftar untuk proses ini.</small>'}${missingVendors.map(id => `<label class="bom-executor-choice text-danger"><input type="checkbox" checked data-execution-field="vendorId" data-execution-vendor="${esc(id)}"> Vendor tidak lagi eligible · hapus pilihan ini</label>`).join("")}<a href="/master-data/vendor-processes" target="_blank" rel="noopener">Atur kualifikasi vendor per proses</a></fieldset>` : ""}${internal}</div></details>`;
  }
  function update(route, target) {
    if (target.dataset.policyField && target.closest?.("[data-executor-inhouse]")) {
      const alternative = inhouseRoute(route);
      window.BomMachinePolicy.update(alternative, target);
      ensure(route).inhouse = { ...alternative };
      delete ensure(route).inhouse.routingMode;
      expanded.add(route);
      return true;
    }
    const field = target.dataset.executionField;
    if (!field) return false;
    const execution = ensure(route);
    expanded.add(route);
    if (field === "allowAlternative") {
      execution.allowedModes = target.checked ? [defaultMode(route), defaultMode(route) === "VENDOR" ? "INHOUSE" : "VENDOR"] : [defaultMode(route)];
      if (!target.checked) execution.allowSplit = false;
    } else if (field === "allowSplit") execution.allowSplit = target.checked;
    else if (field === "vendorId") {
      execution.vendorIds = (execution.vendorIds || []).filter(id => id !== target.dataset.executionVendor);
      if (target.checked) execution.vendorIds.push(target.dataset.executionVendor);
    } else if (["machineSpecificationCode", "cycleTime"].includes(field)) {
      const alternate = inhouseRoute(route);
      alternate[field] = field === "cycleTime" ? Number(target.value || 0) : target.value || "";
      if (field === "machineSpecificationCode") { alternate.machinePlanningPolicy = {}; alternate.diesId = null; }
      execution.inhouse = { ...alternate }; delete execution.inhouse.routingMode;
    }
    return true;
  }
  function changeDefault(route, mode) {
    const previous = defaultMode(route);
    if (previous === mode) return;
    const hadExecution = Boolean(route.machinePlanningPolicy?.execution);
    const execution = clone(route.machinePlanningPolicy?.execution || { allowedModes: [mode], allowSplit: false, vendorIds: [] });
    if (previous === "INHOUSE") {
      const policy = clone(route.machinePlanningPolicy); delete policy.execution;
      execution.inhouse = { machineSpecificationCode: route.machineSpecificationCode || "", cycleTime: Number(route.cycleTime || 0), diesId: route.diesId || null, machinePlanningPolicy: policy };
    } else if (route.vendorId && hadExecution) execution.vendorIds = [...new Set([...(execution.vendorIds || []), route.vendorId])];
    execution.allowedModes = hadExecution && execution.allowedModes?.includes("INHOUSE") && execution.allowedModes?.includes("VENDOR") ? [mode, mode === "INHOUSE" ? "VENDOR" : "INHOUSE"] : [mode];
    route.routingMode = mode;
    if (mode === "VENDOR") {
      Object.assign(route, { machineId: null, machine: null, machineSpecificationCode: "", diesId: null, cycleTime: 0, alternativeMachineIds: [], machinePlanningPolicy: { execution } });
    } else {
      const internal = execution.inhouse || {};
      Object.assign(route, { vendorId: null, vendor: null, machine: null, machineId: internal.machinePlanningPolicy?.primaryMachineId || null, machineSpecificationCode: internal.machineSpecificationCode || "", cycleTime: Number(internal.cycleTime || 0), diesId: internal.diesId || null, alternativeMachineIds: [], machinePlanningPolicy: { ...(internal.machinePlanningPolicy || {}), execution } });
    }
  }
  function resetMachines(route) {
    const execution = route.machinePlanningPolicy?.execution;
    route.machinePlanningPolicy = execution ? { execution } : {};
  }
  window.BomExecutorPolicy = { render, update, changeDefault, resetMachines };
})();
