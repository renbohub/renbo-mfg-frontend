(function () {
  const panel = document.getElementById("page-context-panel");
  if (!panel) return;

  function normalize(value) {
    return decodeURIComponent(String(value || "")).trim().slice(0, 160);
  }

  function detectContext() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "master-data") {
      const page = parts[1] || "index";
      const tail = parts.slice(2);
      const record = tail[0] && !["new", "edit"].includes(tail[0]) ? tail[0] : null;
      return { module: "master-data", page, record: normalize(record) || null };
    }
    if (parts[0] === "modules") {
      const module = parts[1] || "all-modules";
      const page = parts[2] || "dashboard";
      const tail = parts.slice(3);
      const ignored = new Set(["new", "edit", "general", "summary", "dashboard"]);
      const record = tail.find((part) => !ignored.has(part.toLowerCase())) || null;
      return { module: normalize(module), page: normalize(page), record: normalize(record) || null };
    }
    if (parts[0] === "logs") return { module: "system", page: "log-center", record: null };
    return { module: "system", page: normalize(parts[0] || "home"), record: null };
  }

  const context = detectContext();
  window.ERP_PAGE_CONTEXT = Object.freeze({ ...context });
  const contextHeaders = {
    "X-Page-Module": context.module,
    "X-Page-Code": context.page,
    ...(context.record ? { "X-Page-Record": context.record } : {}),
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? new URL(input, location.origin) : new URL(input.url, location.origin);
    if (url.origin !== location.origin) return nativeFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    Object.entries(contextHeaders).forEach(([key, value]) => headers.set(key, value));
    const request = input instanceof Request
      ? nativeFetch(new Request(input, { ...init, headers }))
      : nativeFetch(input, { ...init, headers });
    return request.then((response) => {
      if (!response.ok && !url.pathname.startsWith("/page-context/api")) {
        setTimeout(() => load(true), 350);
      }
      return response;
    });
  };

  if (window.jQuery) {
    window.jQuery(document).ajaxSend((_event, xhr) => {
      Object.entries(contextHeaders).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    });
    window.jQuery(document).ajaxError((_event, _xhr, settings) => {
      if (!String(settings?.url || "").includes("/page-context/api")) setTimeout(() => load(true), 350);
    });
  }

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const authHeaders = (json = false) => ({
    Authorization: `Bearer ${token()}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  });
  const qs = () => new URLSearchParams({
    module: context.module,
    page: context.page,
    ...(context.record ? { record: context.record } : {}),
  });
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
  const formatTime = (value) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  };
  const titleCase = (value) => String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  let data = { activities: [], errors: [], comments: [], counts: {} };
  let loaded = false;
  const activityLabels = {
    CREATE: "Membuat data",
    UPDATE: "Memperbarui data",
    DELETE: "Menghapus data",
    SUBMIT: "Submit data",
    NEED_APPROVAL: "Menunggu approval",
    APPROVED: "Data disetujui",
    REJECTED: "Data ditolak",
  };

  function issueRows(item) {
    const details = item.details || {};
    const source = details.readiness?.issues || details.issues || details.blockers || details.errors || [];
    const rows = Array.isArray(source) ? source : [source];
    return rows.filter(Boolean).slice(0, 50).map((issue) => {
      if (typeof issue === "string") return `<li>${escapeHtml(issue)}</li>`;
      const code = issue.code || issue.severity || "BLOCKER";
      const message = issue.message || issue.detail || JSON.stringify(issue);
      return `<li><b>${escapeHtml(code)}</b>${escapeHtml(message)}</li>`;
    }).join("");
  }

  function entry(item, type) {
    const isError = type === "errors";
    const isComment = type === "comments";
    const message = isComment
      ? item.message
      : isError
        ? (item.message || `Request gagal (${item.statusCode || "error"})`)
        : (activityLabels[item.action] || titleCase(item.action || "Log"));
    const issues = isError ? issueRows(item) : "";
    const meta = [
      item.record ? `<span>${escapeHtml(item.record)}</span>` : "",
      item.statusCode ? `<span>HTTP ${escapeHtml(item.statusCode)}</span>` : "",
      item.responseTime != null ? `<span>${escapeHtml(item.responseTime)} ms</span>` : "",
    ].filter(Boolean).join("");
    return `<article class="page-context-entry ${isError ? "page-context-entry--error" : ""} ${isComment ? "page-context-entry--comment" : ""}">
      <div class="page-context-entry-head"><strong>${escapeHtml(item.username || "System")}</strong><time>${escapeHtml(formatTime(item.createdAt))}</time></div>
      ${isError ? `<div class="page-context-alarm-title"><span class="page-context-alarm-kind">${escapeHtml(item.type === "ALARM" ? "BLOCKER" : "ERROR")}</span><p>${escapeHtml(message)}</p></div>` : `<p>${escapeHtml(message)}</p>`}
      ${issues ? `<ul class="page-context-issues">${issues}</ul>` : ""}
      ${meta ? `<div class="page-context-entry-meta">${meta}</div>` : ""}
    </article>`;
  }

  function render() {
    ["activities", "errors", "comments"].forEach((type) => {
      const count = Number(data.counts?.[type] ?? data[type]?.length ?? 0);
      document.querySelectorAll(`[data-context-count="${type}"]`).forEach((node) => { node.textContent = count; });
    });
    ["activities", "errors", "comments"].forEach((type) => {
      const count = Number(data.counts?.[type] || 0);
      document.querySelectorAll(`[data-context-nav-count="${type}"]`).forEach((badge) => {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.toggle("d-none", count === 0);
        badge.closest(".context-nav-button")?.classList.toggle("has-count", count > 0);
      });
    });
    const state = panel.querySelector("[data-context-state]");
    state?.classList.add("d-none");
    ["activities", "errors"].forEach((type) => {
      const root = panel.querySelector(`[data-context-list="${type}"]`);
      if (root) root.innerHTML = data[type]?.length ? data[type].map((item) => entry(item, type)).join("") : `<div class="page-context-empty">Belum ada ${type === "errors" ? "alarm atau error" : "log transaksi/workflow"} untuk halaman ini.</div>`;
    });
    const commentRoot = panel.querySelector("[data-context-comment-list]");
    if (commentRoot) commentRoot.innerHTML = data.comments?.length ? data.comments.map((item) => entry(item, "comments")).join("") : '<div class="page-context-empty">Belum ada komentar untuk konteks ini.</div>';
  }

  async function load(force = false) {
    if (loaded && !force) return;
    const state = panel.querySelector("[data-context-state]");
    if (state) { state.textContent = "Memuat data halaman..."; state.classList.remove("d-none"); }
    try {
      const response = await fetch(`/page-context/api?${qs()}`, { headers: authHeaders() });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Log halaman gagal dimuat.");
      data = payload;
      loaded = true;
      render();
    } catch (error) {
      if (state) state.textContent = error.message;
    }
  }

  panel.querySelector("[data-context-label]").textContent =
    `${titleCase(context.module)} / ${titleCase(context.page)}${context.record ? ` / ${context.record}` : ""}`;
  function activateTab(type) {
    const button = panel.querySelector(`[data-context-tab="${type}"]`);
    if (!button) return;
    panel.querySelectorAll("[data-context-tab]").forEach((item) => item.classList.toggle("active", item === button));
    panel.querySelectorAll("[data-context-list]").forEach((list) => list.classList.toggle("d-none", list.dataset.contextList !== button.dataset.contextTab));
  }
  panel.addEventListener("show.bs.offcanvas", () => load(true));
  panel.querySelectorAll("[data-context-tab]").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.contextTab)));
  document.querySelectorAll("[data-context-open]").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.contextOpen)));
  panel.querySelector("[data-context-comment-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = event.currentTarget.querySelector("textarea");
    const submit = event.currentTarget.querySelector("button[type=submit]");
    const message = textarea.value.trim();
    if (!message) return;
    submit.disabled = true;
    try {
      const response = await fetch("/page-context/api/comments", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ ...context, message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Komentar gagal disimpan.");
      textarea.value = "";
      await load(true);
    } catch (error) {
      alert(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  const reported = new Set();
  function reportClientError(message, stack) {
    const key = String(message || "").slice(0, 300);
    if (!key || reported.has(key) || location.pathname.startsWith("/login")) return;
    reported.add(key);
    nativeFetch("/page-context/api/errors", {
      method: "POST",
      headers: { ...authHeaders(true), ...contextHeaders },
      body: JSON.stringify({ ...context, message: key, stack: String(stack || "").slice(0, 6000), url: location.href }),
    }).catch(() => {});
  }
  window.addEventListener("error", (event) => reportClientError(event.message, event.error?.stack));
  window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason?.message || String(event.reason), event.reason?.stack));
  load();
})();
