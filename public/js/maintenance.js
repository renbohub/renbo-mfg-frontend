(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const alertBox = $("maintenance-alert");
  const show = (message, kind = "danger") => { alertBox.textContent = message; alertBox.className = `alert alert-${kind}`; };
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan maintenance gagal.");
    return payload;
  }
  function renderCounts(counts = {}) {
    ["salesOrderHeader", "forecast", "mPS", "mRPRun"].forEach((key) => { const node = $(`count-${key}`); if (node) node.textContent = Number(counts[key] || 0).toLocaleString("id-ID"); });
  }
  async function loadStatus() {
    try { const result = await api("/maintenance/api/demand-flow/status"); renderCounts(result.counts); show("Status data berhasil diperbarui.", "secondary"); }
    catch (error) { show(error.message); }
  }
  $("refresh-maintenance")?.addEventListener("click", loadStatus);
  $("reset-demand-flow")?.addEventListener("click", async () => {
    const first = await window.formPrompt("Ketik RESET_SO_MPS_MRP_FORECAST untuk melanjutkan:", "", { title: "Konfirmasi Reset Permanen" });
    if (first !== "RESET_SO_MPS_MRP_FORECAST") { if (first !== null) show("Konfirmasi tidak cocok. Tidak ada data yang dihapus.", "warning"); return; }
    const second = await window.formPrompt("Tulis alasan reset (wajib):", "Persiapan test flow baru", { title: "Alasan Reset" });
    if (second === null || !String(second).trim()) return;
    const button = $("reset-demand-flow"); button.disabled = true; button.textContent = "Resetting...";
    try {
      const result = await api("/maintenance/api/demand-flow/reset", { method: "POST", body: JSON.stringify({ confirmation: first, reason: String(second).trim() }) });
      renderCounts(result.after); show("Reset SO, Forecast, MPS, dan MRP selesai.", "success");
    } catch (error) { show(error.message); }
    finally { button.disabled = false; button.textContent = "Reset SO + Forecast + MPS + MRP"; }
  });
  $("reset-planning-flow")?.addEventListener("click", async () => {
    const first = await window.formPrompt("Ketik RESET_MPS_TO_DELIVERY untuk melanjutkan:", "", { title: "Reset MRP sampai Delivery" });
    if (first !== "RESET_MPS_TO_DELIVERY") { if (first !== null) show("Konfirmasi tidak cocok. Tidak ada data planning yang dihapus.", "warning"); return; }
    const second = await window.formPrompt("Tulis alasan reset (wajib):", "Persiapan test flow baru", { title: "Alasan Reset" });
    if (second === null || !String(second).trim()) return;
    const button = $("reset-planning-flow"); button.disabled = true; button.textContent = "Resetting...";
    try {
      const result = await api("/maintenance/api/planning-flow/reset", { method: "POST", body: JSON.stringify({ confirmation: first, reason: String(second).trim() }) });
      renderCounts(result.after); show("Reset MRP sampai Delivery selesai. Forecast dan SO dipertahankan.", "success");
    } catch (error) { show(error.message); }
    finally { button.disabled = false; button.textContent = "Reset MRP sampai Delivery"; }
  });
  loadStatus();
})();
