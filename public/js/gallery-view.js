(function () {
  const shared = window.SharedDataTable;
  const escapeHtml = (value) => shared?.escapeHtml
    ? shared.escapeHtml(value)
    : String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);

  function scalarEntries(row) {
    return Object.entries(row || {}).filter(([, value]) =>
      value == null || ["string", "number", "boolean"].includes(typeof value));
  }

  function valueFor(row, keys, fallback = "-") {
    for (const key of keys) {
      if (row?.[key] != null && row[key] !== "") return row[key];
    }
    return fallback;
  }

  function defaultTitle(row) {
    return valueFor(row, [
      "documentNumber", "planNumber", "runNumber", "mpsNumber", "forecastNumber",
      "moNumber", "woNumber", "prNumber", "poNumber", "code", "partCode", "name", "id",
    ], scalarEntries(row)[0]?.[1] || "Data");
  }

  function defaultSubtitle(row) {
    return valueFor(row, [
      "partName", "customerName", "supplierName", "description", "warehouseName",
      "processName", "notes",
    ], scalarEntries(row)[1]?.[1] || "-");
  }

  function defaultStatus(row) {
    return String(valueFor(row, [
      "status", "state", "approvalStatus", "decision", "qualityBucket", "matchStatus",
    ], "Tanpa Status"));
  }

  function host(root, className) {
    let element = root.querySelector(`.${className}`);
    if (!element) {
      element = document.createElement("div");
      element.className = `${className} is-hidden`;
      element.setAttribute("aria-live", "polite");
      root.append(element);
    }
    return element;
  }

  function init(options = {}) {
    const root = document.querySelector(options.root || "");
    if (!root) return null;

    const tableView = root.querySelector(options.tableView || ".list-table-view");
    const gallery = host(root, "list-gallery");
    const heatmap = host(root, "list-heatmap");
    const kanban = host(root, "list-kanban");
    const toolbar = options.toolbar
      ? document.querySelector(options.toolbar)
      : root.closest("main")?.querySelector(".list-view-toolbar") || document.querySelector(".list-view-toolbar");
    const buttons = [...(toolbar?.querySelectorAll("[data-list-view]") || [])];
    if (!tableView || !buttons.length) return null;

    const storageKey = options.storageKey || `list-view:${location.pathname}`;
    const allowedModes = new Set(["table", "gallery", "heatmap", "kanban"]);
    let mode = localStorage.getItem(storageKey) || "table";
    let rows = [];

    const titleOf = options.title || defaultTitle;
    const subtitleOf = options.subtitle || defaultSubtitle;
    const statusOf = options.status || defaultStatus;
    const empty = options.empty || "Belum ada data";

    function emptyState(label = empty) {
      return `<div class="list-gallery-empty"><span class="view-empty-icon">□</span><strong>${escapeHtml(label)}</strong><small>Ubah filter atau tambahkan data baru.</small></div>`;
    }

    function defaultCard(row) {
      const metadata = scalarEntries(row).slice(1, 5).map(([key, value]) =>
        `<div><span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</span><strong>${escapeHtml(value ?? "-")}</strong></div>`
      ).join("");
      return `<article class="list-gallery-card">
        <div class="list-gallery-card-head"><div><h3>${escapeHtml(titleOf(row))}</h3><small>${escapeHtml(subtitleOf(row))}</small></div><span class="view-status-badge">${escapeHtml(statusOf(row))}</span></div>
        <div class="list-gallery-meta">${metadata}</div>
      </article>`;
    }

    function renderGallery() {
      gallery.innerHTML = rows.length
        ? rows.map(options.card || defaultCard).join("")
        : emptyState();
    }

    function renderKanban() {
      const groups = rows.reduce((result, row) => {
        const status = statusOf(row) || "Tanpa Status";
        (result[status] ||= []).push(row);
        return result;
      }, {});
      kanban.innerHTML = Object.keys(groups).length
        ? Object.entries(groups).map(([status, items]) => `<section class="kanban-column">
            <header><strong>${escapeHtml(status)}</strong><span>${items.length}</span></header>
            <div class="kanban-column-body">${items.map((row) => `<article class="kanban-card"><b>${escapeHtml(titleOf(row))}</b><small>${escapeHtml(subtitleOf(row))}</small></article>`).join("")}</div>
          </section>`).join("")
        : emptyState();
    }

    function renderHeatmap() {
      const buckets = rows.reduce((result, row) => {
        const status = statusOf(row) || "Tanpa Status";
        result[status] = (result[status] || 0) + 1;
        return result;
      }, {});
      const total = Math.max(rows.length, 1);
      const max = Math.max(1, ...Object.values(buckets));
      heatmap.innerHTML = Object.keys(buckets).length
        ? Object.entries(buckets).map(([status, count]) => `<article class="heatmap-cell" style="--heat:${count / max}">
            <div><strong>${count}</strong><small>${Math.round(count / total * 100)}%</small></div>
            <span>${escapeHtml(status)}</span>
            <i aria-hidden="true"><b style="width:${Math.round(count / total * 100)}%"></b></i>
          </article>`).join("")
        : emptyState();
    }

    function render() {
      if (!allowedModes.has(mode) || !buttons.some((button) => button.dataset.listView === mode)) mode = "table";
      tableView.classList.toggle("is-hidden", mode !== "table");
      gallery.classList.toggle("is-hidden", mode !== "gallery");
      heatmap.classList.toggle("is-hidden", mode !== "heatmap");
      kanban.classList.toggle("is-hidden", mode !== "kanban");
      buttons.forEach((button) => {
        const active = button.dataset.listView === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      if (mode === "gallery") renderGallery();
      if (mode === "heatmap") renderHeatmap();
      if (mode === "kanban") renderKanban();
      root.dataset.activeView = mode;
    }

    buttons.forEach((button) => button.addEventListener("click", () => {
      mode = button.dataset.listView;
      localStorage.setItem(storageKey, mode);
      render();
    }));

    render();
    return {
      setRows(nextRows) {
        rows = Array.isArray(nextRows) ? nextRows : [];
        render();
      },
      setMode(nextMode) {
        mode = allowedModes.has(nextMode) ? nextMode : "table";
        localStorage.setItem(storageKey, mode);
        render();
      },
      render,
      escapeHtml,
    };
  }

  window.ListGallery = { init, escapeHtml };
})();
