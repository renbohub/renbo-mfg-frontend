(function () {
  function esc(value) { return window.jQuery ? $("<div>").text(value ?? "").html() : String(value ?? ""); }
  function init(options) {
    const root = document.querySelector(options.root || ""); if (!root) return null;
    const tableView = root.querySelector(options.tableView || ".list-table-view");
    const gallery = root.querySelector(options.gallery || ".list-gallery");
    const buttons = [...document.querySelectorAll(options.buttons || "[data-list-view]")];
    if (!tableView || !gallery || !buttons.length) return null;
    const key = options.storageKey || `list-view:${location.pathname}`;
    let mode = localStorage.getItem(key) || "table";
    let rows = [];
    const toolbar = buttons[0].closest(".list-view-toolbar");
    ["kanban", "heatmap", "timeline"].forEach((view) => {
      if (!toolbar || toolbar.querySelector(`[data-list-view="${view}"]`)) return;
      const button = document.createElement("button"); button.type = "button"; button.dataset.listView = view; button.title = view[0].toUpperCase() + view.slice(1); button.textContent = button.title; toolbar.append(button); buttons.push(button);
    });
    const field = (row, index) => Object.values(row || {}).filter((value) => value !== null && typeof value !== "object")[index] ?? "-";
    const status = (row) => String(row?.status || row?.state || row?.approvalStatus || "Unscheduled");
    function host(className) { let element = root.querySelector(`.${className}`); if (!element) { element = document.createElement("div"); element.className = `${className} is-hidden`; element.setAttribute("aria-live", "polite"); root.append(element); } return element; }
    const kanban = host("list-kanban"); const heatmap = host("list-heatmap"); const timeline = host("list-timeline");
    function renderKanban() { const groups = rows.reduce((all, row) => { const name = status(row); (all[name] ||= []).push(row); return all; }, {}); kanban.innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([name, items]) => `<section class="kanban-column"><header><strong>${esc(name)}</strong><span>${items.length}</span></header>${items.map((row) => `<article class="kanban-card"><b>${esc(field(row, 0))}</b><small>${esc(field(row, 1))}</small></article>`).join("")}</section>`).join("") : '<div class="list-gallery-empty">Belum ada data</div>'; }
    function renderHeatmap() { const buckets = rows.reduce((all, row) => { const name = status(row); all[name] = (all[name] || 0) + 1; return all; }, {}); const max = Math.max(1, ...Object.values(buckets)); heatmap.innerHTML = Object.keys(buckets).length ? Object.entries(buckets).map(([name, count]) => `<div class="heatmap-cell" style="--heat:${count / max}"><strong>${count}</strong><span>${esc(name)}</span></div>`).join("") : '<div class="list-gallery-empty">Belum ada data</div>'; }
    function renderTimeline() { timeline.innerHTML = rows.length ? rows.map((row) => `<article class="timeline-event"><i></i><div><b>${esc(field(row, 0))}</b><small>${esc(status(row))} · ${esc(field(row, 1))}</small></div></article>`).join("") : '<div class="list-gallery-empty">Belum ada data</div>'; }
    function render() {
      if (!buttons.some((button) => button.dataset.listView === mode)) mode = "table";
      tableView.classList.toggle("is-hidden", mode !== "table"); gallery.classList.toggle("is-hidden", mode !== "gallery"); kanban.classList.toggle("is-hidden", mode !== "kanban"); heatmap.classList.toggle("is-hidden", mode !== "heatmap"); timeline.classList.toggle("is-hidden", mode !== "timeline");
      buttons.forEach((button) => button.classList.toggle("active", button.dataset.listView === mode));
      if (mode === "gallery") gallery.innerHTML = rows.length ? rows.map(options.card).join("") : '<div class="list-gallery-empty">Belum ada data</div>';
      if (mode === "kanban") renderKanban(); if (mode === "heatmap") renderHeatmap(); if (mode === "timeline") renderTimeline();
    }
    buttons.forEach((button) => button.addEventListener("click", () => { mode = button.dataset.listView; localStorage.setItem(key, mode); render(); }));
    return { setRows(next) { rows = Array.isArray(next) ? next : []; render(); }, render, esc };
  }
  window.ListGallery = { init, esc };
})();
