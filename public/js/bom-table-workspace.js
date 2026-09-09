(function (root, factory) {
  const workspace = factory();
  if (typeof module === "object" && module.exports) module.exports = workspace;
  else {
    root.BomTableWorkspace = workspace;
    const boot = () => workspace.initialize(root.document, root);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const views = Object.freeze({
    structure: [0, 1, 2, 3, 4, 5, 6, 9, 17],
    material: [0, 1, 2, 3, 4, 6, 10, 11, 16, 17],
    cost: [0, 1, 2, 3, 7, 8, 9, 12, 13, 14, 15, 17],
    all: Array.from({ length: 18 }, (_, index) => index),
  });
  const instances = new WeakMap();

  function hiddenColumns(view, count = 18) {
    const visible = new Set(views[view] || views.all);
    return Array.from({ length: count }, (_, index) => index).filter((index) => !visible.has(index));
  }

  function normalizeSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("id").trim().replace(/\s+/g, " ");
  }

  function matchesRow(row, query) {
    const part = row.querySelector('[data-field="partId"]');
    // A newly added component stays editable even while a search is active.
    if (!part?.value) return true;
    const selected = part.selectedOptions?.[0] || part.options?.[part.selectedIndex];
    const partNumber = row.querySelector(".bom-part-number");
    const text = normalizeSearch(`${selected?.textContent || ""} ${partNumber?.textContent || ""}`);
    return normalizeSearch(query).split(" ").filter(Boolean).every((word) => text.includes(word));
  }

  function initialize(document, window) {
    const table = document.getElementById("bom-detail-edit-table");
    const body = document.getElementById("bom-table-edit-rows");
    if (!table || !body) return null;
    if (instances.has(table)) return instances.get(table);
    const controller = window.SharedDataTable?.enhance(table);
    if (!controller) return null;
    const buttons = [...document.querySelectorAll("[data-bom-column-view]")];
    const search = document.getElementById("bom-table-search");
    const count = document.getElementById("bom-table-row-count");
    const empty = document.getElementById("bom-table-search-empty");

    function signalView(view) {
      table.dataset.bomView = view;
      buttons.forEach((button) => {
        const active = button.dataset.bomColumnView === view;
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("active", active);
      });
      table.dispatchEvent(new window.CustomEvent("bom-table:view-change", { bubbles: true, detail: { view } }));
    }

    function filterRows() {
      const rows = [...body.querySelectorAll("tr[data-row-key]")];
      let visible = 0;
      rows.forEach((row) => {
        row.hidden = !matchesRow(row, search?.value || "");
        if (!row.hidden) visible += 1;
      });
      if (count) count.textContent = `${visible} dari ${rows.length} komponen`;
      if (empty) empty.hidden = !rows.length || visible > 0 || !normalizeSearch(search?.value);
      controller.renderPinnedOverlay?.();
      return { visible, total: rows.length };
    }

    function setView(view) {
      if (!Object.prototype.hasOwnProperty.call(views, view)) return;
      table.dataset.bomView = view;
      controller.state.hidden = hiddenColumns(view, controller.headers.length);
      controller.persistAndApply();
      controller.renderSettingsRows();
      filterRows();
      signalView(view);
    }

    function syncCustomView() {
      const active = table.dataset.bomView;
      if (!views[active]) {
        signalView("custom");
        return;
      }
      const expected = hiddenColumns(active, controller.headers.length);
      const actual = controller.state.hidden;
      if (actual.length !== expected.length || expected.some((index) => !actual.includes(index))) signalView("custom");
    }

    buttons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.bomColumnView)));
    search?.addEventListener("input", filterRows);
    table.addEventListener("bom-table:rows-rendered", () => {
      controller.applyColumnVisibility();
      filterRows();
    });
    // The shared settings handlers run first and update the same visibility state.
    controller.commandbar?.addEventListener("change", (event) => {
      if (event.target.closest("[data-column-visible]")) syncCustomView();
    });
    controller.commandbar?.addEventListener("click", (event) => {
      if (event.target.closest("[data-table-reset]")) {
        syncCustomView();
        filterRows();
      }
    });

    const instance = { setView, filterRows };
    instances.set(table, instance);
    setView("structure");
    return instance;
  }

  return { views, hiddenColumns, normalizeSearch, matchesRow, initialize };
});
