(() => {
  "use strict";
  const { recordKey } = JSON.parse(document.getElementById("wc-config")?.textContent || "{}");
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const number = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(value) || 0);

  function profileField(label, value) { return `<div><dt>${esc(label)}</dt><dd>${esc(value || "–")}</dd></div>`; }
  function render(record) {
    document.getElementById("wc-detail-code").textContent = record.workCenterCode;
    document.getElementById("wc-detail-name").textContent = record.workCenterName;
    const status = document.getElementById("wc-detail-status");
    status.textContent = record.isActive ? "ACTIVE" : "INACTIVE";
    status.className = `wc-status-chip ${record.isActive ? "active" : "inactive"}`;
    const edit = document.getElementById("wc-detail-edit");
    edit.href = `/master-data/work-centers/${encodeURIComponent(record.id)}/edit?key=${encodeURIComponent(record.workCenterCode)}`;
    edit.textContent = record.isVirtual ? "Jadikan Master & Edit" : "Edit Work Center";
    document.getElementById("wc-kpi-machines").textContent = number(record.machineCount);
    document.getElementById("wc-kpi-primary").textContent = record.primaryMachineCode ? `Primary · ${record.primaryMachineCode}` : "Primary belum ditentukan";
    document.getElementById("wc-kpi-capacity").textContent = number(record.capacityMinutesPerDay, 2);
    document.getElementById("wc-kpi-efficiency").textContent = `${number(record.efficiencyPercent, 2)}%`;
    document.getElementById("wc-kpi-effective").textContent = number(record.effectiveCapacityMinutes, 2);
    document.getElementById("wc-source-chip").textContent = record.isVirtual ? "AUTO" : "MASTER";
    document.getElementById("wc-profile-fields").innerHTML = [
      profileField("Plant", record.plantCode), profileField("Line", record.lineCode),
      profileField("Kode Work Center", record.workCenterCode), profileField("Status", record.isActive ? "Aktif" : "Nonaktif"),
    ].join("");
    document.getElementById("wc-source-note").innerHTML = record.isVirtual
      ? '<b>Dibentuk otomatis dari Machine Specification.</b><span>Klik “Jadikan Master & Edit” untuk mengunci nama, kapasitas, dan assignment mesin.</span>'
      : '<b>Controlled master resource.</b><span>Perubahan assignment akan langsung digunakan pada pengelompokan Monthly Production Plan berikutnya.</span>';
    const machines = [...(record.machines || [])].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || String(left.machine?.machineCode).localeCompare(String(right.machine?.machineCode)));
    document.getElementById("wc-machine-total").textContent = `${machines.length} resource`;
    document.getElementById("wc-detail-machines").innerHTML = machines.map((link) => {
      const machine = link.machine || {};
      return `<tr><td><b>${esc(machine.machineCode || "–")}</b><small>${esc(machine.machineName || "Mesin tanpa nama")}</small></td><td><b>${esc(machine.machineSpecificationCode || machine.machineFamily || "–")}</b><small>${esc(machine.machineSpecificationName || "")}</small></td><td>${esc(machine.lineCode || "–")}</td><td><span class="wc-machine-status ${String(machine.status).toLowerCase() === "active" ? "active" : "inactive"}">${esc(machine.status || "–")}</span></td><td>${link.isPrimary ? '<span class="wc-primary-badge">PRIMARY</span>' : '<span class="wc-member-badge">MEMBER</span>'}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="wc-machine-empty">Belum ada mesin yang terhubung.</td></tr>';
    document.getElementById("wc-detail-notes").textContent = record.notes || "Tidak ada catatan tambahan untuk Work Center ini.";
  }

  fetch(`/master-data/api/work-centers/${encodeURIComponent(recordKey)}`, { headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" } })
    .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Detail Work Center gagal dimuat."); return payload; })
    .then(render)
    .catch((error) => { const alert = document.getElementById("wc-detail-alert"); alert.textContent = error.message; alert.hidden = false; });
})();
