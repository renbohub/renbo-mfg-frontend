(function () {
  function esc(value) { return window.jQuery ? $("<div>").text(value ?? "").html() : String(value ?? ""); }
  function init(options) {
    const root = document.querySelector(options.root || ""); if (!root) return null;
    const tableView = root.querySelector(options.tableView || ".list-table-view");
    const gallery = root.querySelector(options.gallery || ".list-gallery");
    const buttons = [...root.querySelectorAll(options.buttons || "[data-list-view]")];
    if (!tableView || !gallery || !buttons.length) return null;
    const key = options.storageKey || `list-view:${location.pathname}`;
    let mode = localStorage.getItem(key) || "table";
    let rows = [];
    function render() {
      tableView.classList.toggle("is-hidden", mode !== "table"); gallery.classList.toggle("is-hidden", mode !== "gallery");
      buttons.forEach((button) => button.classList.toggle("active", button.dataset.listView === mode));
      if (mode === "gallery") gallery.innerHTML = rows.length ? rows.map(options.card).join("") : '<div class="list-gallery-empty">Belum ada data</div>';
    }
    buttons.forEach((button) => button.addEventListener("click", () => { mode = button.dataset.listView; localStorage.setItem(key, mode); render(); }));
    return { setRows(next) { rows = Array.isArray(next) ? next : []; render(); }, render, esc };
  }
  window.ListGallery = { init, esc };
})();
