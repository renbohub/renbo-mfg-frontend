(function () {
  const body = document.getElementById("log-center-body");
  if (!body) return;
  const search = document.getElementById("log-center-search");
  const moduleFilter = document.getElementById("log-center-module");
  const typeFilter = document.getElementById("log-center-type");
  const refresh = document.getElementById("log-center-refresh");
  const summary = document.getElementById("log-center-summary");
  const alertBox = document.getElementById("log-center-alert");
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
  const titleCase = (value) => String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const time = (value) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  let timer;

  function typeBadge(type) {
    const classes = { ERROR: "danger", ALARM: "danger", COMMENT: "primary", LOG: "success" };
    return `<span class="log-type-badge log-type-badge--${classes[type] || "secondary"}">${escapeHtml(type)}</span>`;
  }

  function render(payload) {
    const items = payload.items || [];
    const groups = payload.groups || [];
    summary.innerHTML = groups.length
      ? groups.map((group) => `<article class="log-module-card">
          <div><strong>${escapeHtml(titleCase(group.module))}</strong><span>${escapeHtml(group.total)} log</span></div>
          <p><span>${escapeHtml(group.activities)} log</span><span>${escapeHtml(group.comments)} comment</span><span class="${Number(group.alarms || 0) + Number(group.errors || 0) ? "has-error" : ""}">${escapeHtml(Number(group.alarms || 0) + Number(group.errors || 0))} alarm/error</span></p>
        </article>`).join("")
      : '<div class="page-context-empty w-100">Belum ada log yang cocok dengan filter.</div>';
    body.innerHTML = items.length
      ? items.map((item) => {
          const labels = { CREATE: "Membuat data", UPDATE: "Memperbarui data", DELETE: "Menghapus data", SUBMIT: "Submit data", NEED_APPROVAL: "Menunggu approval", APPROVED: "Data disetujui", REJECTED: "Data ditolak" };
          const message = item.type === "COMMENT"
            ? item.message
            : item.type === "ERROR" || item.type === "ALARM"
              ? (item.message || `${item.method || ""} request gagal`)
              : (labels[item.action] || titleCase(item.action || "Log"));
          const status = item.type === "COMMENT" ? "-" : `HTTP ${item.statusCode || "-"}`;
          return `<tr>
            <td><time>${escapeHtml(time(item.createdAt))}</time></td>
            <td><strong>${escapeHtml(titleCase(item.module))}</strong></td>
            <td><span>${escapeHtml(titleCase(item.page))}</span>${item.record ? `<small>${escapeHtml(item.record)}</small>` : ""}</td>
            <td>${typeBadge(item.type)}</td>
            <td>${escapeHtml(item.username || "System")}</td>
            <td class="log-message-cell">${escapeHtml(message)}</td>
            <td><span class="status-badge ${item.statusCode >= 400 ? "status-badge--danger" : ""}">${escapeHtml(status)}</span></td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="7" class="text-center py-5 text-secondary">Tidak ada log yang cocok.</td></tr>';
    document.getElementById("log-center-total").textContent = `${items.length} log`;
  }

  async function load() {
    refresh.disabled = true;
    alertBox.classList.add("d-none");
    body.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-secondary">Memuat log...</td></tr>';
    const params = new URLSearchParams({ limit: "200" });
    if (moduleFilter.value) params.set("module", moduleFilter.value);
    if (typeFilter.value) params.set("type", typeFilter.value);
    if (search.value.trim()) params.set("q", search.value.trim());
    try {
      const response = await fetch(`/page-context/api/overview?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Log Center gagal dimuat.");
      render(payload);
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.classList.remove("d-none");
      body.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-danger">Data log gagal dimuat.</td></tr>';
    } finally {
      refresh.disabled = false;
    }
  }

  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 350); });
  moduleFilter.addEventListener("change", load);
  typeFilter.addEventListener("change", load);
  refresh.addEventListener("click", load);
  load();
})();
