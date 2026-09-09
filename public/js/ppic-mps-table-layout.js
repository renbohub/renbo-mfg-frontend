(function (root) {
  "use strict";

  // Measure cells, not col declarations: browser zoom, table expansion and saved
  // column widths can all change the rendered size (including fractional pixels).
  function offsets(widths, groupHeight) {
    return {
      "--mwb-left-pn": widths[0],
      "--mwb-left-name": widths[0] + widths[1],
      "--mwb-right-action": widths[19] + widths[20],
      "--mwb-right-checklist": widths[20],
      "--mwb-group-height": groupHeight,
    };
  }

  if (typeof module === "object" && module.exports) module.exports = { offsets };
  if (!root.document) return;

  function boot() {
    const table = root.document.querySelector(".mwb-demand-table");
    const headers = table?.querySelector(".mwb-sub-head");
    const groups = table?.querySelector(".mwb-group-head");
    if (!headers || !groups || headers.cells.length !== 21) return;
    let frame;
    function measure() {
      frame = null;
      const widths = [...headers.cells].map((cell) => cell.getBoundingClientRect().width);
      if (!widths[0]) return;
      const values = offsets(widths, groups.getBoundingClientRect().height);
      for (const [name, value] of Object.entries(values)) {
        const pixels = `${value}px`;
        if (table.style.getPropertyValue(name) !== pixels) table.style.setProperty(name, pixels);
      }
    }
    function schedule() {
      if (frame == null) frame = root.requestAnimationFrame(measure);
    }
    if (root.ResizeObserver) {
      const observer = new root.ResizeObserver(schedule);
      [table, groups, ...headers.cells].forEach((element) => observer.observe(element));
    }
    root.addEventListener("resize", schedule, { passive: true });
    root.document.fonts?.ready.then(schedule);
    measure();
  }
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(typeof window === "object" ? window : globalThis);
