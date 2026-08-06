(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const value = (id) => $(id)?.value?.trim() || "";
  const show = (message, type = "danger") => { const box = $("production-schedule-alert"); box.textContent = message; box.className = `alert alert-${type}`; };
  async function loadWorkOrders() {
    try {
      const response = await fetch("/modules/api/production/work-orders?start=0&length=500", { headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json().catch(() => ({})); if (!response.ok) return;
      const rows = Array.isArray(payload) ? payload : (payload.items || payload.data || []);
      $("schedule-work-orders").innerHTML = rows.map((row) => row.woNumber ? `<option value="${String(row.woNumber).replace(/"/g, "&quot;")}">${String(row.outputPartCode || row.manufacturingOrder?.part?.partCode || "")}</option>` : "").join("");
    } catch (_) { /* Manual WO input remains available. */ }
  }
  const today = new Date(); $("scheduleDate").value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $("production-schedule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { scheduleDate: value("scheduleDate"), shift: value("shift"), woNumber: value("woNumber") || null, plannedQty: Number(value("plannedQty")), uomCode: value("uomCode") || null, operatorName: value("operatorName") || null, sequence: Number(value("sequence")), notes: value("notes") || null };
    try {
      const response = await fetch("/modules/api/production/daily-production-schedules", { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Jadwal gagal disimpan.");
      const doc = payload.data || payload.item || payload;
      show("Daily Production Schedule berhasil dibuat.", "success");
      setTimeout(() => location.assign(`/modules/production/daily-production-schedules/${encodeURIComponent(doc.scheduleNumber)}`), 350);
    } catch (error) { show(error.message); }
  });
  loadWorkOrders();
})();
