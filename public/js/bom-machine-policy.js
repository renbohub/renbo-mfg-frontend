/* Shared by the table and canvas BOM editors. */
(() => {
  const expanded = new WeakSet();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const option = (id, label, selected) => `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(label)}</option>`;
  function eligibleDies(dies, partId) {
    if (!partId) return [];
    return (dies || []).filter((d) => !d.isDeleted && d.status === "Active" &&
      (d.diesParts || []).some((link) => link.partId === partId && link.isActive === true));
  }
  function clearUnrelatedDies(route, dies, partId) {
    const allowed = new Set(eligibleDies(dies, partId).map((d) => d.id));
    for (const internal of [route, route.machinePlanningPolicy?.execution?.inhouse].filter(Boolean)) {
      if (internal.diesId && !allowed.has(internal.diesId)) internal.diesId = null;
      for (const resource of internal.machinePlanningPolicy?.resources || []) {
        if (resource.diesId && !allowed.has(resource.diesId)) resource.diesId = null;
      }
    }
  }
  function render(route, machines, dies, partId = route.mbomDetail?.partId) {
    if (route.routingMode === "VENDOR") return "";
    const p = route.machinePlanningPolicy || {};
    const eligible = machines.filter((m) => m.status === "Active" && m.machineSpecificationCode === route.machineSpecificationCode).sort((a, b) => (a.machineName || a.machineCode).localeCompare(b.machineName || b.machineCode, undefined, { numeric: true }));
    const primary = p.primaryMachineId || "";
    const relatedDies = eligibleDies(dies, partId);
    const label = (m) => `${m.machineName || m.machineCode} (${m.machineCode})`;
    return `<details class="bom-machine-policy" ${!primary || expanded.has(route) ? "open" : ""}><summary>${primary ? "Aturan alokasi mesin" : "Lengkapi mesin utama"} · ${p.mode === "PARALLEL" ? "Mode paralel" : "Satu mesin"}</summary><div class="bom-policy-content">
      <label>Mesin utama<select class="form-select" data-policy-field="primaryMachineId">${option("", "Pilih mesin utama", primary)}${eligible.map((m) => option(m.id, label(m), primary)).join("")}</select></label>
      <label>Alokasi otomatis<select class="form-select" data-policy-field="mode">${option("SINGLE", "Mesin utama saja", p.mode || "SINGLE")}${option("PARALLEL", "Izinkan paralel", p.mode)}</select></label>
      <label><input type="checkbox" data-policy-field="requiresTooling" ${p.requiresTooling || p.mode === "PARALLEL" || /PRESS/i.test(route.machineSpecificationCode || "") ? "checked" : ""} ${p.mode === "PARALLEL" || /PRESS/i.test(route.machineSpecificationCode || "") ? "disabled" : ""}> Memerlukan dies / jig</label>
      ${p.mode === "PARALLEL" ? `<label>Batas mesin paralel<input class="form-control" type="number" min="2" step="1" data-policy-field="maxParallelMachines" value="${esc(p.maxParallelMachines || 2)}"></label><label>Referensi persetujuan engineering / PPIC<input class="form-control" data-policy-field="approvalReference" placeholder="Nomor trial / approval" value="${esc(p.approvalReference || "")}"></label>` : ""}
      <small>Mesin cadangan dipakai melalui keputusan PPIC. Paralel memerlukan dies/jig fisik berbeda pada setiap mesin.</small>
      ${eligible.map((m) => {
        const r = (p.resources || []).find((x) => x.machineId === m.id);
        const selected = m.id === primary || !!r;
        const selectedDies = r?.diesId || (m.id === primary ? route.diesId : "") || "";
        const invalidDies = selectedDies && !relatedDies.some((d) => d.id === selectedDies);
        const staleOption = invalidDies ? `<option value="${esc(selectedDies)}" selected disabled>Dies tersimpan tidak sesuai — pilih ulang</option>` : "";
        const diesHelp = !partId ? "Pilih child part terlebih dahulu." : !relatedDies.length ? "Belum ada relasi dies aktif untuk child part ini. Lengkapi Relasi Dies-Part." : `${relatedDies.length} dies berelasi aktif dengan child part ini.`;
        return `<div class="bom-policy-resource"><label><input type="checkbox" data-policy-machine="${esc(m.id)}" data-policy-field="enabled" ${selected ? "checked" : ""} ${m.id === primary ? "disabled" : ""}> ${esc(label(m))}${m.id === primary ? " · Utama" : " · Cadangan / paralel"}</label>${selected ? `<div class="bom-policy-resource-fields"><label>Dies / jig fisik<select class="form-select" data-policy-machine="${esc(m.id)}" data-policy-field="diesId">${option("", relatedDies.length ? "Pilih dies / jig yang berelasi" : "Belum ada dies berelasi", selectedDies)}${staleOption}${relatedDies.map((d) => option(d.id, `${d.diesCode} · ${d.diesName || ""}`, selectedDies)).join("")}</select><small>${esc(diesHelp)}</small>${invalidDies ? '<small class="text-danger">Dies tersimpan tidak aktif atau tidak berelasi dengan child part ini. Pilih ulang atau kosongkan pilihan.</small>' : ""}</label><label>Cycle time (detik / pcs)<input class="form-control" type="number" min="0.001" step="any" data-policy-machine="${esc(m.id)}" data-policy-field="cycleTimeSeconds" value="${esc(r?.cycleTimeSeconds || route.cycleTime || "")}"></label><label>Setup per batch (menit)<input class="form-control" type="number" min="0" step="any" data-policy-machine="${esc(m.id)}" data-policy-field="setupMinutes" value="${esc(r?.setupMinutes || 0)}"></label></div>` : ""}</div>`;
      }).join("")}
      <small>Cycle time diisi sebagai detik per pcs baik. Konversikan jumlah cavity terlebih dahulu. <a href="/master-data/dies-parts" target="_blank" rel="noopener">Atur Relasi Dies-Part</a></small></div></details>`;
  }
  function update(route, target) {
    const field = target.dataset.policyField;
    if (!field) return false;
    expanded.add(route);
    const p = route.machinePlanningPolicy ||= { mode: "SINGLE", maxParallelMachines: 1, resources: [] };
    p.resources ||= [];
    const machineId = target.dataset.policyMachine;
    if (machineId) {
      if (field === "enabled") {
        p.resources = p.resources.filter((r) => r.machineId !== machineId);
        if (target.checked) p.resources.push({ machineId, cycleTimeSeconds: Number(route.cycleTime || 0), setupMinutes: 0, diesId: null });
      } else {
        let r = p.resources.find((r) => r.machineId === machineId);
        if (!r) { r = { machineId, cycleTimeSeconds: Number(route.cycleTime || 0), setupMinutes: 0, diesId: machineId === p.primaryMachineId ? route.diesId || null : null }; p.resources.push(r); }
        r[field] = ["cycleTimeSeconds", "setupMinutes"].includes(field) ? Number(target.value) : target.value || null;
        if (field === "diesId" && machineId === p.primaryMachineId) route.diesId = r.diesId;
      }
    } else {
      p[field] = field === "requiresTooling" ? target.checked : field === "maxParallelMachines" ? Number(target.value) : target.value;
      if (field === "mode") p.maxParallelMachines = p.mode === "PARALLEL" ? Math.max(2, p.resources.length) : 1;
      if (field === "primaryMachineId" && p.primaryMachineId && !p.resources.some((r) => r.machineId === p.primaryMachineId)) p.resources.push({ machineId: p.primaryMachineId, cycleTimeSeconds: Number(route.cycleTime || 0), setupMinutes: 0, diesId: route.diesId || null });
      if (field === "primaryMachineId") route.diesId = p.resources.find((r) => r.machineId === p.primaryMachineId)?.diesId || null;
    }
    return true;
  }
  window.BomMachinePolicy = { render, update, eligibleDies, clearUnrelatedDies };
})();
