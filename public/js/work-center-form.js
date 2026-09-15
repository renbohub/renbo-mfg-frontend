(() => {
  "use strict";
  const state = JSON.parse(document.getElementById("wc-config")?.textContent || "{}");
  const { mode, recordId, recordKey } = state;
  const form = document.getElementById("wc-form");
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const selected = new Set();
  const assignedTo = new Map();
  let machines = [];
  let primaryId = null;
  let machineFilter = "all";
  let loadedRecord = null;
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const number = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(value) || 0);

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, Accept: "application/json", ...(options.headers || {}) } });
    if (response.status === 401) {
      localStorage.removeItem("token"); sessionStorage.removeItem("token");
      location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return null;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Data Work Center gagal diproses.");
    return payload;
  }

  function showError(message) {
    const node = document.getElementById("wc-form-alert");
    node.textContent = message; node.hidden = false; node.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function syncCapacity() {
    const nominal = Number(form.elements.capacityMinutesPerDay.value) || 0;
    const efficiency = Number(form.elements.efficiencyPercent.value) || 0;
    const effective = nominal * efficiency / 100;
    document.getElementById("wc-effective-capacity").textContent = `${number(effective, 2)} menit/hari`;
    document.getElementById("wc-capacity-hours").textContent = `${number(effective / 60, 2)} jam tersedia setelah efisiensi`;
  }

  function syncAssignmentSummary() {
    const primary = machines.find((machine) => machine.id === primaryId);
    document.getElementById("wc-selected-count").textContent = `${selected.size} dipilih`;
    document.getElementById("wc-primary-label").textContent = primary ? `${primary.machineCode} · ${primary.machineName}` : "Belum dipilih";
  }

  function machineMatches(machine) {
    const term = document.getElementById("wc-machine-search").value.trim().toLowerCase();
    const matchesTerm = !term || `${machine.machineCode} ${machine.machineName} ${machine.machineSpecificationCode || ""} ${machine.machineSpecificationName || ""} ${machine.lineCode || ""}`.toLowerCase().includes(term);
    if (!matchesTerm) return false;
    if (machineFilter === "selected") return selected.has(machine.id);
    if (machineFilter === "available") return !assignedTo.has(machine.id);
    return true;
  }

  function renderMachines() {
    const rows = machines.filter(machineMatches);
    document.getElementById("wc-machine-body").innerHTML = rows.map((machine) => {
      const owner = assignedTo.get(machine.id);
      const checked = selected.has(machine.id);
      const unavailable = Boolean(owner) && !checked;
      const status = String(machine.status || "-").toLowerCase();
      return `<tr class="${checked ? "selected" : ""} ${unavailable ? "unavailable" : ""}">
        <td><input class="wc-machine-check" type="checkbox" value="${esc(machine.id)}" ${checked ? "checked" : ""} ${unavailable ? "disabled" : ""} aria-label="Pilih ${esc(machine.machineCode)}"></td>
        <td><div class="wc-machine-identity"><b>${esc(machine.machineCode)}</b><span>${esc(machine.machineName || "Mesin tanpa nama")}</span><small>${esc(machine.machineSpecificationCode || machine.machineFamily || "Specification belum diisi")}</small>${owner ? `<em>Terhubung ke ${esc(owner)}</em>` : ""}</div></td>
        <td><b class="wc-line-code">${esc(machine.lineCode || "–")}</b></td>
        <td><span class="wc-machine-status ${status === "active" ? "active" : "inactive"}">${esc(machine.status || "-")}</span></td>
        <td><label class="wc-primary-radio"><input type="radio" name="primaryMachine" value="${esc(machine.id)}" ${primaryId === machine.id ? "checked" : ""} ${checked ? "" : "disabled"}><i></i><span>${primaryId === machine.id ? "Primary" : "Set"}</span></label></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5" class="wc-machine-empty">Tidak ada mesin yang sesuai filter.</td></tr>';
    syncAssignmentSummary();
  }

  function populate(record) {
    loadedRecord = record;
    ["workCenterCode", "workCenterName", "plantCode", "lineCode", "capacityMinutesPerDay", "efficiencyPercent", "notes"].forEach((name) => {
      if (form.elements[name]) form.elements[name].value = record[name] ?? "";
    });
    form.elements.isActive.checked = record.isActive !== false;
    (record.machineIds || []).forEach((id) => selected.add(String(id)));
    primaryId = record.primaryMachineId || record.machineIds?.[0] || null;
    if (record.isVirtual) {
      const notice = document.getElementById("wc-virtual-notice");
      notice.hidden = false;
    }
    syncCapacity();
  }

  async function initialize() {
    try {
      const requests = [
        api("/master-data/api/machines?start=0&length=500&isDeleted=false"),
        api("/master-data/api/work-centers?start=0&length=500&isDeleted=false"),
      ];
      if (mode === "edit") requests.push(api(`/master-data/api/work-centers/${encodeURIComponent(recordKey)}`));
      const [machinePayload, centerPayload, record] = await Promise.all(requests);
      machines = machinePayload?.data || [];
      if (record) populate(record);
      (centerPayload?.data || []).filter((center) => !center.isVirtual && center.id !== loadedRecord?.id).forEach((center) => {
        (center.machineIds || []).forEach((machineId) => assignedTo.set(String(machineId), center.workCenterCode));
      });
      renderMachines();
      syncCapacity();
      window.dispatchEvent(new CustomEvent('ppic-recovery:ready'));
    } catch (error) { showError(error.message); }
  }

  document.getElementById("wc-machine-body").addEventListener("change", (event) => {
    if (event.target.matches(".wc-machine-check")) {
      const id = event.target.value;
      if (event.target.checked) { selected.add(id); if (!primaryId) primaryId = id; }
      else { selected.delete(id); if (primaryId === id) primaryId = [...selected][0] || null; }
      renderMachines();
    }
    if (event.target.matches('input[name="primaryMachine"]')) { primaryId = event.target.value; renderMachines(); }
    document.getElementById("wc-save-state").textContent = "Ada perubahan yang belum disimpan";
  });
  document.getElementById("wc-machine-search").addEventListener("input", renderMachines);
  document.querySelectorAll("[data-machine-filter]").forEach((button) => button.addEventListener("click", () => {
    machineFilter = button.dataset.machineFilter;
    document.querySelectorAll("[data-machine-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderMachines();
  }));
  [form.elements.capacityMinutesPerDay, form.elements.efficiencyPercent].forEach((input) => input.addEventListener("input", syncCapacity));
  form.addEventListener("input", () => { document.getElementById("wc-save-state").textContent = "Ada perubahan yang belum disimpan"; });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!selected.size) return showError("Pilih minimal satu mesin untuk Work Center.");
    if (!primaryId || !selected.has(primaryId)) return showError("Tentukan satu mesin primary dari mesin yang dipilih.");
    const button = document.getElementById("wc-save");
    button.disabled = true; button.querySelector("i").hidden = false; document.getElementById("wc-form-alert").hidden = true;
    const payload = {
      workCenterCode: form.elements.workCenterCode.value.trim(),
      workCenterName: form.elements.workCenterName.value.trim(),
      plantCode: form.elements.plantCode.value.trim() || null,
      lineCode: form.elements.lineCode.value.trim() || null,
      capacityMinutesPerDay: Number(form.elements.capacityMinutesPerDay.value),
      efficiencyPercent: Number(form.elements.efficiencyPercent.value),
      isActive: form.elements.isActive.checked,
      notes: form.elements.notes.value.trim() || null,
      machineIds: [...selected],
      primaryMachineId: primaryId,
    };
    try {
      const target = mode === "create" ? "/master-data/api/work-centers" : `/master-data/api/work-centers/${encodeURIComponent(recordId)}`;
      const saved = await api(target, { method: mode === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      location.replace(`/master-data/work-centers/${encodeURIComponent(saved.workCenterCode || payload.workCenterCode)}`);
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; button.querySelector("i").hidden = true; }
  });

  initialize();
})();
