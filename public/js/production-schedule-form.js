(function () {
  const config = JSON.parse(document.getElementById("production-schedule-config")?.textContent || "{}");
  const editing = config.mode === "edit";
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const value = (id) => $(id)?.value?.trim() || "";
  const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });
  const show = (message, type = "danger") => { const box = $("production-schedule-alert"); box.textContent = message; box.className = `alert alert-${type}`; };
  const dateValue = (input) => String(input || "").slice(0, 10);

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Daily Production Schedule gagal diproses.");
    return payload.data || payload.item || payload;
  }

  async function loadWorkOrders() {
    if (editing) return;
    try {
      const payload = await request("/modules/api/production/work-orders?start=0&length=500");
      const rows = Array.isArray(payload) ? payload : (payload.items || payload.data || []);
      $("schedule-work-orders").innerHTML = rows.map((row) => row.woNumber ? `<option value="${String(row.woNumber).replace(/"/g, "&quot;")}">${String(row.outputPartCode || row.manufacturingOrder?.part?.partCode || "")}</option>` : "").join("");
    } catch (_) { /* Manual WO input remains available. */ }
  }

  async function loadMachines(selectedId = "") {
    try {
      const payload = await request("/modules/api/production/daily-production-schedules/filter-options");
      const rows = payload.allMachines || payload.machines || [];
      $("machineId").innerHTML = '<option value="">Otomatis dari WO / allocation</option>' + rows.map((row) => `<option value="${row.id}">${row.machineCode} — ${row.machineName || row.machineCode}</option>`).join("");
      $("machineId").value = selectedId || "";
    } catch (_) { /* Existing machine remains unchanged if the list is unavailable. */ }
  }

  async function loadExisting() {
    const doc = await request(`/modules/api/production/daily-production-schedules/${encodeURIComponent(config.recordKey)}`);
    if (!["Draft", "Released", "In Progress"].includes(doc.status)) throw new Error(`DPP status ${doc.status} tidak dapat direvisi.`);
    $("scheduleDate").value = dateValue(doc.scheduleDate);
    $("shift").value = doc.shift || "1A";
    $("woNumber").value = doc.woNumber || "";
    $("woNumber").readOnly = true;
    $("plannedQty").value = Number(doc.plannedQty || 0);
    $("plannedQty").min = String(Math.max(Number(doc.actualQty || 0), 0.0001));
    $("uomCode").value = doc.uomCode || "";
    $("uomCode").readOnly = true;
    $("operatorName").value = doc.operatorName || "";
    $("sequence").value = Number(doc.sequence || 0);
    $("notes").value = doc.notes || "";
    await loadMachines(doc.machineId || "");
    show(`Revisi DPP ${doc.scheduleNumber} · status ${doc.status}. Qty tidak boleh lebih kecil dari aktual ${Number(doc.actualQty || 0)} ${doc.uomCode || ""}.`, "warning");
  }

  const today = (globalThis.erpBusinessNow?.() || new Date());
  $("scheduleDate").value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $("production-schedule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      scheduleDate: value("scheduleDate"), shift: value("shift"), plannedQty: Number(value("plannedQty")),
      machineId: value("machineId") || null, operatorName: value("operatorName") || null,
      sequence: Number(value("sequence")), notes: value("notes") || null,
      ...(!editing ? { woNumber: value("woNumber") || null, uomCode: value("uomCode") || null } : {}),
    };
    try {
      const url = editing
        ? `/modules/api/production/daily-production-schedules/${encodeURIComponent(config.recordKey)}`
        : "/modules/api/production/daily-production-schedules";
      const doc = await request(url, { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      show(editing ? "Revisi Daily Production Schedule berhasil disimpan." : "Daily Production Schedule berhasil dibuat.", "success");
      setTimeout(() => location.assign(`/modules/production/daily-production-schedules/${encodeURIComponent(doc.scheduleNumber)}`), 350);
    } catch (error) { show(error.message); }
  });

  Promise.all([loadWorkOrders(), editing ? loadExisting() : loadMachines()]).catch((error) => show(error.message));
})();
