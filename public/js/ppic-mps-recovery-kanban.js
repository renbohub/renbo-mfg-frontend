(() => {
  "use strict";
  const config = JSON.parse(document.getElementById("mrk-page-config")?.textContent || "{}");
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const labels = { OPEN: "Open", IN_PROGRESS: "In Progress", WAITING: "Waiting", DONE: "Done" };
  const state = { items: [], draggedId: null, loading: false };
  let searchTimer;

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, credentials: "same-origin", headers: { Accept: "application/json", Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request gagal (${response.status}).`);
    return payload;
  }
  function showAlert(message, success = false) { const node = $("mrk-alert"); node.hidden = !message; node.textContent = message || ""; node.classList.toggle("success", success); }
  function visibleItems() {
    const query = $("mrk-search").value.trim().toLowerCase(); const dept = $("mrk-dept").value;
    return state.items.filter((item) => (!dept || item.dept === dept) && (!query || [item.mpsNumber, item.sourceNumber, item.partCode, item.customerCode, item.recovery, item.dept].some((value) => String(value || "").toLowerCase().includes(query))));
  }
  function card(item) {
    const options = Object.entries(labels).map(([value, label]) => `<option value="${value}" ${value === item.feedbackStatus ? "selected" : ""}>${label}</option>`).join("");
    const reference = item.mpsNumber || item.sourceNumber || "Recovery MPS";
    return `<article class="mrk-card" draggable="true" data-card-id="${esc(item.id)}" data-status="${esc(item.feedbackStatus)}">
      <div class="mrk-card-top"><small>${esc(reference)}</small><em>${esc(item.planStatus || "DRAFT")}</em></div>
      <h3>${esc(item.recovery)}</h3><p class="mrk-card-part"><b>${esc(item.partCode || "—")}</b> · ${esc(item.customerCode || "Tanpa customer")}</p>
      <div class="mrk-card-meta"><div><span>Dept / PIC</span><b>${esc(item.dept || "PPIC")}${item.owner && item.owner !== item.dept ? ` · ${esc(item.owner)}` : ""}</b></div><div><span>Target</span><b>${fmtDate(item.targetDate)}</b></div><div><span>Gap</span><b>${Number(item.recoveryGapDays || 0)} hari</b></div></div>
      ${item.notes ? `<p class="mrk-card-notes">${esc(item.notes)}</p>` : ""}
      <div class="mrk-card-footer"><select data-card-status aria-label="Feedback Status ${esc(item.recovery)}">${options}</select><a href="/modules/planning-ppic/mps/workbench?month=${encodeURIComponent($("mrk-month").value)}${item.partCode ? `&q=${encodeURIComponent(item.partCode)}` : ""}">Lihat MPS →</a></div>
    </article>`;
  }
  function render() {
    const rows = visibleItems();
    for (const status of Object.keys(labels)) {
      const items = rows.filter((item) => item.feedbackStatus === status);
      document.querySelector(`[data-card-list="${status}"]`).innerHTML = items.length ? items.map(card).join("") : '<div class="mrk-column-empty">Belum ada recovery</div>';
      document.querySelector(`[data-column-count="${status}"]`).textContent = items.length;
    }
    $("mrk-total").textContent = rows.length;
    $("mrk-open").textContent = rows.filter((item) => item.feedbackStatus === "OPEN").length;
    $("mrk-progress").textContent = rows.filter((item) => item.feedbackStatus === "IN_PROGRESS").length;
    $("mrk-waiting").textContent = rows.filter((item) => item.feedbackStatus === "WAITING").length;
    $("mrk-done").textContent = rows.filter((item) => item.feedbackStatus === "DONE").length;
  }
  function renderDepartments() {
    const current = $("mrk-dept").value;
    const departments = [...new Set(state.items.map((item) => item.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
    $("mrk-dept").innerHTML = '<option value="">Semua Dept</option>' + departments.map((dept) => `<option value="${esc(dept)}">${esc(dept)}</option>`).join("");
    if (departments.includes(current)) $("mrk-dept").value = current;
  }
  async function load() {
    if (state.loading) return; state.loading = true; showAlert(""); $("mrk-sync-state").textContent = "Memuat recovery…";
    try {
      const params = new URLSearchParams({ month: $("mrk-month").value || config.initialMonth });
      const payload = await request(`/modules/api/planning-ppic/demand-planning/recovery-plans?${params}`);
      state.items = payload.items || []; renderDepartments(); render();
      $("mrk-sync-state").textContent = `${state.items.length} recovery · diperbarui ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    } catch (error) { showAlert(error.message); $("mrk-sync-state").textContent = "Gagal diperbarui"; }
    finally { state.loading = false; }
  }
  async function moveCard(id, feedbackStatus) {
    const item = state.items.find((row) => row.id === id); if (!item || item.feedbackStatus === feedbackStatus) return;
    const previous = item.feedbackStatus; item.feedbackStatus = feedbackStatus; render();
    document.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.classList.add("is-saving"); $("mrk-sync-state").textContent = `Menyimpan ${labels[feedbackStatus]}…`;
    try {
      await request(`/modules/api/planning-ppic/demand-planning/recovery-plans/${encodeURIComponent(id)}/feedback-status`, { method: "PATCH", body: JSON.stringify({ feedbackStatus }) });
      showAlert(`Feedback Status diubah menjadi ${labels[feedbackStatus]}.`, true); $("mrk-sync-state").textContent = "Perubahan tersimpan";
    } catch (error) { item.feedbackStatus = previous; render(); showAlert(error.message); $("mrk-sync-state").textContent = "Perubahan gagal"; }
  }
  $("mrk-board").addEventListener("change", (event) => { const select = event.target.closest("[data-card-status]"); if (select) moveCard(select.closest("[data-card-id]").dataset.cardId, select.value); });
  $("mrk-board").addEventListener("dragstart", (event) => { const cardNode = event.target.closest("[data-card-id]"); if (!cardNode) return; state.draggedId = cardNode.dataset.cardId; cardNode.classList.add("is-dragging"); event.dataTransfer.effectAllowed = "move"; });
  $("mrk-board").addEventListener("dragend", (event) => { event.target.closest("[data-card-id]")?.classList.remove("is-dragging"); document.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over")); state.draggedId = null; });
  $("mrk-board").addEventListener("dragover", (event) => { const list = event.target.closest("[data-card-list]"); if (!list) return; event.preventDefault(); document.querySelectorAll(".drag-over").forEach((node) => node.classList.toggle("drag-over", node === list)); });
  $("mrk-board").addEventListener("drop", (event) => { const list = event.target.closest("[data-card-list]"); if (!list || !state.draggedId) return; event.preventDefault(); moveCard(state.draggedId, list.dataset.cardList); });
  $("mrk-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(render, 180); });
  $("mrk-dept").addEventListener("change", render);
  $("mrk-month").addEventListener("change", () => { const url = new URL(location.href); url.searchParams.set("month", $("mrk-month").value); history.replaceState({}, "", url); document.querySelector(".mrk-primary-action").href = `/modules/planning-ppic/mps/workbench?month=${encodeURIComponent($("mrk-month").value)}`; load(); });
  $("mrk-refresh").addEventListener("click", load);
  load();
})();
