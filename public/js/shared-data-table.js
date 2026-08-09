(function () {
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const get = (object, path) =>
    String(path || "").split(".").reduce(
      (value, key) => (value == null ? undefined : value[key]),
      object,
    );
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
    );
  const slug = (value) =>
    String(value || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const badge = (value, className = "ops-badge") =>
    `<span class="${className} ${escapeHtml(slug(value))}">${escapeHtml(value || "-")}</span>`;
  const format = (value, type) => {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
    if (type === "date") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? escapeHtml(value)
        : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed);
    }
    if (type === "number") return `<span class="ops-number">${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(number(value))}</span>`;
    if (type === "currency") return `<span class="ops-number">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number(value))}</span>`;
    if (type === "status") return badge(value);
    if (type === "active") return badge(value ? "Active" : "Inactive");
    if (typeof value === "object") return escapeHtml(JSON.stringify(value));
    return escapeHtml(value);
  };
  const defaults = ({ processing = "Memuat data...", empty = "Belum ada data" } = {}) => ({
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: ["pageLength", "paging"] },
    language: {
      processing,
      emptyTable: empty,
      zeroRecords: "Data tidak ditemukan",
      info: "Menampilkan _START_-_END_ dari _TOTAL_ data",
      infoEmpty: "Menampilkan 0 data",
      lengthMenu: "_MENU_ / halaman",
      paginate: { previous: "‹", next: "›" },
    },
  });
  const downloadCsv = (fileName, headers, rows) => {
    const csv = [headers, ...rows].map((row) =>
      row.map((value) => `"${String(typeof value === "object" ? JSON.stringify(value) : value ?? "").replaceAll('"', '""')}"`).join(","),
    ).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const managedTables = new WeakMap();
  const excludedTables = ".erp-pinned-table, .ps-suggestion-table, .production-excel-table, .daily-machine-table table, .daily-gantt-grid table";

  function safeStorageGet(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" ? { ...fallback, ...value } : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { /* Storage is optional. */ }
  }

  function cleanLabel(value, index) {
    const label = String(value || "").replace(/\s+/g, " ").trim();
    return label || `Kolom ${index + 1}`;
  }

  function getHeaderCells(table) {
    const rows = [...(table.tHead?.rows || [])];
    return rows.length ? [...rows[rows.length - 1].cells] : [];
  }

  function getScrollHost(table) {
    return table.closest(".dt-layout-cell")
      || table.closest(".list-table-view")
      || table.closest(".table-responsive")
      || table.parentElement;
  }

  function referenceRoute(value, label = "") {
    const reference = String(value || "").trim();
    const heading = String(label || "").toLowerCase();
    const encoded = encodeURIComponent(reference);
    const referenceLike = reference.length > 3 && /[-/0-9]/.test(reference);
    if (!reference || reference === "-" || reference.length > 80) return "";
    if (/^(MPS[-/]|MPS\d)/i.test(reference) || (referenceLike && /\bmps\b/.test(heading))) return `/modules/planning-ppic/master-production-schedule/${encoded}`;
    if (/^(MRP[-/]|MRP\d|RUN-MRP)/i.test(reference) || (referenceLike && /\bmrp\b|no\. run|run number/.test(heading))) return `/modules/planning-ppic/material-requirements-planning/${encoded}`;
    if (/^(MPP[-/]|MPP\d)/i.test(reference) || (referenceLike && /\bmpp\b|monthly (production )?plan/.test(heading))) return `/modules/planning-ppic/monthly-production-plans/${encoded}`;
    if (/^(PR[-/]|PR\d)/i.test(reference) || (referenceLike && /\bpr\b|purchase requisition/.test(heading))) return `/modules/purchasing/purchase-requisitions/${encoded}`;
    if (/^(PO[-/]|PO\d)/i.test(reference) || (referenceLike && /\bpo\b|purchase order/.test(heading))) return `/modules/purchasing/purchase-order/${encoded}`;
    if (/^(MO[-/]|MO\d|MFG[-/])/i.test(reference) || (referenceLike && /\bmo\b|manufacturing order/.test(heading))) return `/modules/production/manufacturing-orders/${encoded}`;
    if (/^(WO[-/]|WO\d)/i.test(reference) || (referenceLike && /\bwo\b|work order/.test(heading))) return `/modules/production/work-orders/${encoded}`;
    if (/^(DPS[-/]|DPP[-/]|SCH[-/])/i.test(reference) && /schedule|dps|dpp/.test(heading)) return `/modules/production/daily-production-schedules/${encoded}`;
    if (/^(GR[-/]|GR\d)/i.test(reference) || (referenceLike && /\bgr\b|goods receipt/.test(heading))) return `/modules/incoming/goods-receipts/${encoded}`;
    if (/^(SO[-/]|SO\d)/i.test(reference) || (referenceLike && /\bso\b|sales order/.test(heading))) return `/modules/sales/sales-orders/${encoded}`;
    if (/^(FC[-/]|FCT[-/]|FORECAST[-/])/i.test(reference) || (referenceLike && /forecast/.test(heading))) return `/modules/sales/forecasts/${encoded}`;
    if (/^(STO[-/]|STO\d)/i.test(reference) || (referenceLike && /stock opname/.test(heading))) return `/modules/inventory/stock-opname/${encoded}`;
    if (/^(SUG[-/]|PS[-/])/i.test(reference) && /suggestion/.test(heading)) return `/modules/purchasing/purchase-suggestions/${encoded}`;
    if (referenceLike && /part code|kode part|output part|input part/.test(heading)) return `/master-data/parts/${encoded}`;
    if (referenceLike && /material code|kode material|material master/.test(heading)) return `/master-data/materials/${encoded}`;
    if (/^(CUS|CUST)[-/]/i.test(reference) && /customer|pelanggan/.test(heading)) return `/master-data/customers/${encoded}`;
    if (/^(SUP|SPL)[-/]/i.test(reference) && /supplier/.test(heading)) return `/master-data/suppliers/${encoded}`;
    if (referenceLike && /lot|batch/.test(heading)) return `/modules/inventory/lots/${encoded}`;
    return "";
  }

  function isEligible(table) {
    if (!table || table.matches(excludedTables) || table.dataset.enterpriseTable === "off") return false;
    if (getHeaderCells(table).length < 2) return false;
    return Boolean(table.closest(".table-shell, .entity-table-shell, .module-table-shell, .ops-table-card, .sales-card, .ppic-table-card, .report-detail-card, .bom-figma-table, [data-enterprise-table-shell]"));
  }

  class EnterpriseTableController {
    constructor(table) {
      this.table = table;
      this.headers = getHeaderCells(table);
      this.labels = this.headers.map((cell, index) => cleanLabel(cell.textContent, index));
      this.shell = table.closest(".table-shell, .entity-table-shell, .module-table-shell, .ops-table-card, .sales-card, .ppic-table-card, .report-detail-card, .bom-figma-table, [data-enterprise-table-shell]") || table.parentElement;
      this.scrollHost = getScrollHost(table);
      this.key = `erp-table:${location.pathname}:${table.id || this.labels.join("-").slice(0, 80)}`;
      this.state = safeStorageGet(this.key, { density: "compact", hidden: [], frozen: [], widths: {}, manualSort: null });
      this.state.hidden = (Array.isArray(this.state.hidden) ? this.state.hidden : []).filter((index) => index >= 0 && index < this.headers.length);
      this.state.frozen = (Array.isArray(this.state.frozen) ? this.state.frozen : []).filter((index) => index >= 0 && index < this.headers.length);
      this.state.widths = this.state.widths && typeof this.state.widths === "object" ? this.state.widths : {};
      this.state.manualSort = this.state.manualSort && Number.isInteger(this.state.manualSort.index) ? this.state.manualSort : null;
      this.onScroll = () => this.positionPinnedOverlay();
      this.onResize = () => this.scheduleApply();
      this.createTools();
      this.bind();
      this.apply();
    }

    createTools() {
      if (this.shell.querySelector(":scope > .erp-table-commandbar")) {
        this.commandbar = this.shell.querySelector(":scope > .erp-table-commandbar");
        return;
      }
      const commandbar = document.createElement("div");
      commandbar.className = "erp-table-commandbar";
      commandbar.innerHTML = `
        <div class="erp-table-commandbar-copy"><strong>Data view</strong><span>Atur kolom sesuai pekerjaan Anda</span></div>
        <div class="erp-table-commandbar-actions">
          <span class="erp-table-density-label">Compact</span>
          <div class="erp-table-settings">
            <button class="erp-table-settings-toggle" type="button" aria-expanded="false" aria-haspopup="dialog">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"></path></svg>
              Columns <span class="erp-pin-count"></span>
            </button>
            <div class="erp-table-settings-panel" role="dialog" aria-label="Table Settings" hidden>
              <div class="erp-settings-head"><div><strong>Table Settings</strong><span>Show, hide, atau freeze kolom</span></div><button type="button" data-table-close aria-label="Tutup">×</button></div>
              <label class="erp-column-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><input type="search" placeholder="Cari kolom..."></label>
              <div class="erp-density-picker" aria-label="Table density"><button type="button" data-density="compact">Compact</button><button type="button" data-density="comfortable">Comfortable</button></div>
              <div class="erp-column-list"></div>
              <div class="erp-settings-foot"><button type="button" data-table-reset>Reset default</button><span>Preferensi tersimpan otomatis</span></div>
            </div>
          </div>
        </div>`;
      const listView = [...this.shell.children].find((element) => element.matches?.(".list-table-view, .dt-container, .table-responsive"));
      if (listView) this.shell.insertBefore(commandbar, listView);
      else {
        const nestedView = this.table.closest(".list-table-view, .dt-container, .table-responsive");
        if (nestedView && this.shell.contains(nestedView)) nestedView.parentElement.insertBefore(commandbar, nestedView);
        else this.shell.prepend(commandbar);
      }
      this.commandbar = commandbar;
      this.panel = commandbar.querySelector(".erp-table-settings-panel");
      this.renderSettingsRows();
    }

    renderSettingsRows(query = "") {
      const list = this.commandbar.querySelector(".erp-column-list");
      const needle = query.trim().toLocaleLowerCase("id");
      list.innerHTML = this.labels.map((label, index) => {
        if (needle && !label.toLocaleLowerCase("id").includes(needle)) return "";
        const hidden = this.state.hidden.includes(index);
        const frozen = this.state.frozen.includes(index);
        return `<div class="erp-column-option" data-column-option="${index}">
          <label><input type="checkbox" data-column-visible="${index}" ${hidden ? "" : "checked"}><span>${escapeHtml(label)}</span></label>
          <button class="erp-column-pin ${frozen ? "active" : ""}" type="button" data-column-pin="${index}" aria-pressed="${frozen}" ${hidden ? "disabled" : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6-3 1-4 4-1 5-3-3-3-3 5-1 4-4 1-3 2-2Z"></path></svg><span>${frozen ? "Frozen" : "Freeze"}</span>
          </button>
        </div>`;
      }).join("") || '<p class="erp-column-empty">Kolom tidak ditemukan.</p>';
      this.commandbar.querySelectorAll("[data-density]").forEach((button) => button.classList.toggle("active", button.dataset.density === this.state.density));
      this.updateCommandbarState();
    }

    bind() {
      const toggle = this.commandbar.querySelector(".erp-table-settings-toggle");
      const search = this.commandbar.querySelector(".erp-column-search input");
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = this.panel.hidden;
        this.panel.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        if (open) requestAnimationFrame(() => search.focus());
      });
      this.panel.addEventListener("click", (event) => event.stopPropagation());
      this.commandbar.querySelector("[data-table-close]").addEventListener("click", () => this.closePanel());
      search.addEventListener("input", () => this.renderSettingsRows(search.value));
      this.commandbar.addEventListener("change", (event) => {
        const input = event.target.closest("[data-column-visible]");
        if (!input) return;
        const index = Number(input.dataset.columnVisible);
        this.state.hidden = input.checked ? this.state.hidden.filter((item) => item !== index) : [...new Set([...this.state.hidden, index])];
        if (!input.checked) this.state.frozen = this.state.frozen.filter((item) => item !== index);
        this.persistAndApply();
        this.renderSettingsRows(search.value);
      });
      this.commandbar.addEventListener("click", (event) => {
        const density = event.target.closest("[data-density]");
        const pin = event.target.closest("[data-column-pin]");
        const reset = event.target.closest("[data-table-reset]");
        if (density) {
          this.state.density = density.dataset.density;
          this.persistAndApply();
          this.renderSettingsRows(search.value);
        }
        if (pin) {
          const index = Number(pin.dataset.columnPin);
          this.state.frozen = this.state.frozen.includes(index)
            ? this.state.frozen.filter((item) => item !== index)
            : [...new Set([...this.state.frozen, index])].sort((left, right) => left - right);
          this.persistAndApply();
          this.renderSettingsRows(search.value);
        }
        if (reset) {
          this.state = { density: "compact", hidden: [], frozen: [], widths: {}, manualSort: null };
          search.value = "";
          this.persistAndApply();
          this.renderSettingsRows();
        }
      });
      document.addEventListener("click", (event) => { if (!this.commandbar.contains(event.target)) this.closePanel(); });
      this.scrollHost.addEventListener("scroll", this.onScroll, { passive: true });
      window.addEventListener("resize", this.onResize, { passive: true });
      this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(this.onResize) : null;
      this.resizeObserver?.observe(this.table);
      this.mutationObserver = new MutationObserver(() => this.scheduleApply());
      this.mutationObserver.observe(this.table, { childList: true, subtree: true });
      if (window.jQuery) window.jQuery(this.table).on("draw.dt column-visibility.dt", () => this.scheduleApply());
    }

    closePanel() {
      if (!this.panel || this.panel.hidden) return;
      this.panel.hidden = true;
      this.commandbar.querySelector(".erp-table-settings-toggle").setAttribute("aria-expanded", "false");
    }

    persistAndApply() {
      safeStorageSet(this.key, this.state);
      this.apply();
    }

    scheduleApply() {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.apply());
    }

    apply() {
      this.headers = getHeaderCells(this.table);
      this.shell.classList.toggle("erp-density-comfortable", this.state.density === "comfortable");
      this.shell.classList.toggle("erp-density-compact", this.state.density !== "comfortable");
      this.installResizeHandles();
      this.installManualSorting();
      this.applyColumnWidths();
      this.applyColumnVisibility();
      this.applyReferenceLinks();
      this.applyManualSort();
      this.renderPinnedOverlay();
      this.updateCommandbarState();
      this.scheduleTextTooltips();
    }

    installResizeHandles() {
      this.headers.forEach((header, index) => {
        header.classList.add("erp-resizable-column");
        if (header.querySelector(":scope > .erp-column-resizer")) return;
        const handle = document.createElement("span");
        handle.className = "erp-column-resizer";
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.setAttribute("aria-label", `Ubah lebar ${this.labels[index]}`);
        handle.title = "Tarik untuk mengubah lebar · klik ganda untuk reset";
        handle.addEventListener("click", (event) => event.stopPropagation());
        handle.addEventListener("dblclick", (event) => {
          event.preventDefault();
          event.stopPropagation();
          delete this.state.widths[index];
          this.clearManagedColumnWidth(index);
          this.persistAndApply();
        });
        handle.addEventListener("pointerdown", (event) => this.startColumnResize(event, index));
        header.appendChild(handle);
      });
    }

    isDataTable() {
      try { return Boolean(window.DataTable?.isDataTable?.(this.table)); } catch (_error) { return false; }
    }

    installManualSorting() {
      if (this.isDataTable() || this.table.dataset.enterpriseSort === "off") return;
      this.headers.forEach((header, index) => {
        const label = this.labels[index] || "";
        const disabled = !label || /^(aksi|action|pilih|select|no\.?|#)$/i.test(label);
        header.classList.toggle("erp-sortable", !disabled);
        if (disabled || header.dataset.erpSortBound) return;
        header.dataset.erpSortBound = "true";
        header.tabIndex = 0;
        header.setAttribute("role", "button");
        header.addEventListener("click", (event) => {
          if (event.target.closest(".erp-column-resizer")) return;
          this.toggleManualSort(index);
        });
        header.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          this.toggleManualSort(index);
        });
      });
    }

    toggleManualSort(index) {
      const direction = this.state.manualSort?.index === index && this.state.manualSort.direction === "asc" ? "desc" : "asc";
      this.state.manualSort = { index, direction };
      safeStorageSet(this.key, this.state);
      this.applyManualSort();
      this.updateSortIndicators();
      this.renderPinnedOverlay();
    }

    comparableCellValue(cell) {
      const explicit = cell?.dataset.sortValue;
      const text = String(explicit ?? cell?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text || text === "-") return { empty: true, value: "" };
      const numericText = text.replace(/Rp\.?/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".").replace(/[%a-z]/gi, "");
      const numeric = Number(numericText);
      if (Number.isFinite(numeric) && /\d/.test(text)) return { empty: false, value: numeric };
      const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5, jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11 };
      const localizedDate = text.toLowerCase().match(/(?:(\d{1,2})\s+)?(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)[a-z]*\s+(\d{4})/);
      const timestamp = localizedDate
        ? Date.UTC(Number(localizedDate[3]), monthNames[localizedDate[2]], Number(localizedDate[1] || 1))
        : (/\d{4}[-/]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,}/.test(text) ? Date.parse(text) : NaN);
      return { empty: false, value: Number.isNaN(timestamp) ? text : timestamp };
    }

    applyManualSort() {
      if (this.isDataTable() || !this.state.manualSort || this.table.dataset.enterpriseSort === "off") {
        this.updateSortIndicators();
        return;
      }
      const { index, direction } = this.state.manualSort;
      const body = this.table.tBodies[0];
      if (!body || index >= this.headers.length) return;
      const rows = [...body.rows].filter((row) => row.cells.length === this.headers.length);
      const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
      const sorted = [...rows].sort((left, right) => {
        const a = this.comparableCellValue(left.cells[index]);
        const b = this.comparableCellValue(right.cells[index]);
        if (a.empty !== b.empty) return a.empty ? 1 : -1;
        const result = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : collator.compare(String(a.value), String(b.value));
        return direction === "desc" ? -result : result;
      });
      if (rows.some((row, rowIndex) => row !== sorted[rowIndex])) sorted.forEach((row) => body.appendChild(row));
      this.updateSortIndicators();
    }

    updateSortIndicators() {
      this.headers.forEach((header, index) => {
        const active = !this.isDataTable() && this.state.manualSort?.index === index;
        header.classList.toggle("erp-sorted", active);
        header.dataset.sortDirection = active ? this.state.manualSort.direction : "";
        if (!this.isDataTable() && header.classList.contains("erp-sortable")) header.setAttribute("aria-sort", active ? (this.state.manualSort.direction === "desc" ? "descending" : "ascending") : "none");
      });
    }

    startColumnResize(event, index) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = Math.ceil(this.headers[index]?.getBoundingClientRect().width || 120);
      document.body.classList.add("erp-is-resizing-column");
      this.headers[index]?.classList.add("is-resizing");
      const move = (moveEvent) => {
        const width = Math.max(72, Math.min(480, Math.round(startWidth + moveEvent.clientX - startX)));
        this.state.widths[index] = width;
        this.applyColumnWidths();
      };
      const stop = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
        document.body.classList.remove("erp-is-resizing-column");
        this.headers[index]?.classList.remove("is-resizing");
        this.persistAndApply();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", stop, { once: true });
      document.addEventListener("pointercancel", stop, { once: true });
    }

    clearManagedColumnWidth(index) {
      [...this.table.rows].forEach((row) => {
        const cell = row.cells[index];
        if (!cell?.dataset.erpManagedWidth) return;
        cell.style.removeProperty("width");
        cell.style.removeProperty("min-width");
        cell.style.removeProperty("max-width");
        delete cell.dataset.erpManagedWidth;
      });
    }

    applyColumnWidths() {
      [...this.table.rows].forEach((row) => [...row.cells].forEach((cell, index) => {
        if (!cell.dataset.erpManagedWidth || Object.prototype.hasOwnProperty.call(this.state.widths, index)) return;
        cell.style.removeProperty("width");
        cell.style.removeProperty("min-width");
        cell.style.removeProperty("max-width");
        delete cell.dataset.erpManagedWidth;
      }));
      Object.entries(this.state.widths).forEach(([rawIndex, rawWidth]) => {
        const index = Number(rawIndex);
        const width = Math.max(72, Math.min(480, Number(rawWidth) || 0));
        if (!width || index < 0 || index >= this.headers.length) return;
        [...this.table.rows].forEach((row) => {
          const cell = row.cells[index];
          if (!cell || row.cells.length !== this.headers.length) return;
          cell.style.width = `${width}px`;
          cell.style.minWidth = `${width}px`;
          cell.style.maxWidth = `${width}px`;
          cell.dataset.erpManagedWidth = "true";
        });
      });
    }

    applyColumnVisibility() {
      [...this.table.rows].filter((row) => row.cells.length === this.headers.length).forEach((row) => [...row.cells].forEach((cell, index) => {
        const hidden = this.state.hidden.includes(index);
        cell.classList.toggle("erp-column-hidden", hidden);
        cell.setAttribute("aria-hidden", String(hidden));
      }));
    }

    applyReferenceLinks() {
      const rows = [...(this.table.tBodies[0]?.rows || [])].filter((row) => row.cells.length === this.headers.length);
      rows.forEach((row) => [...row.cells].forEach((cell, index) => {
        if (cell.querySelector("a, button, input, select, textarea, .ops-badge, .status-badge, .sales-badge")) return;
        const value = cell.textContent.trim();
        const href = referenceRoute(value, this.labels[index]);
        if (!href) return;
        cell.textContent = "";
        const link = document.createElement("a");
        link.className = "erp-record-link";
        link.href = href;
        link.textContent = value;
        link.title = `Buka detail ${value}`;
        cell.appendChild(link);
      }));
    }

    scheduleTextTooltips() {
      cancelAnimationFrame(this.tooltipFrame);
      this.tooltipFrame = requestAnimationFrame(() => {
        const rows = [...(this.table.tBodies[0]?.rows || [])].filter((row) => row.cells.length === this.headers.length);
        rows.forEach((row) => [...row.cells].forEach((cell) => {
          if (cell.querySelector("button, input, select, textarea") || cell.hasAttribute("title") && !cell.dataset.erpTooltip) return;
          const text = cell.textContent.replace(/\s+/g, " ").trim();
          const truncated = text.length > 12 && cell.scrollWidth > cell.clientWidth + 2;
          if (truncated) {
            cell.title = text;
            cell.dataset.erpTooltip = "true";
          } else if (cell.dataset.erpTooltip) {
            cell.removeAttribute("title");
            delete cell.dataset.erpTooltip;
          }
        }));
      });
    }

    updateCommandbarState() {
      const count = this.state.frozen.length;
      const badgeNode = this.commandbar.querySelector(".erp-pin-count");
      badgeNode.textContent = count ? String(count) : "";
      badgeNode.classList.toggle("is-empty", !count);
      this.commandbar.querySelector(".erp-table-density-label").textContent = this.state.density === "comfortable" ? "Comfortable" : "Compact";
    }

    removePinnedOverlay() {
      this.overlay?.remove();
      this.overlay = null;
      this.shell.classList.remove("has-frozen-columns");
    }

    renderPinnedOverlay() {
      this.removePinnedOverlay();
      const indexes = this.state.frozen.filter((index) => !this.state.hidden.includes(index));
      const bodyRows = [...(this.table.tBodies[0]?.rows || [])];
      const headerRow = this.table.tHead?.rows?.[this.table.tHead.rows.length - 1];
      if (!indexes.length || !headerRow || !this.scrollHost?.isConnected) return;

      const overlay = document.createElement("div");
      overlay.className = "erp-pinned-overlay";
      overlay.setAttribute("aria-label", "Frozen columns");
      const pinnedTable = document.createElement("table");
      pinnedTable.className = `${this.table.className} erp-pinned-table`;
      pinnedTable.removeAttribute("id");
      const head = document.createElement("thead");
      const clonedHeaderRow = document.createElement("tr");
      indexes.forEach((index) => {
        const source = headerRow.cells[index];
        if (!source) return;
        const cell = source.cloneNode(true);
        const width = Math.max(76, Math.min(280, Math.ceil(source.getBoundingClientRect().width || source.offsetWidth || 120)));
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;
        cell.dataset.sourceColumn = String(index);
        clonedHeaderRow.appendChild(cell);
      });
      clonedHeaderRow.style.height = `${Math.ceil(headerRow.getBoundingClientRect().height)}px`;
      head.appendChild(clonedHeaderRow);
      pinnedTable.appendChild(head);
      const body = document.createElement("tbody");
      bodyRows.forEach((row, rowIndex) => {
        const clonedRow = document.createElement("tr");
        clonedRow.dataset.sourceRow = String(rowIndex);
        indexes.forEach((index) => {
          const source = row.cells[index];
          if (!source) return;
          const cell = source.cloneNode(true);
          const header = clonedHeaderRow.querySelector(`[data-source-column="${index}"]`);
          const width = header?.style.width || `${Math.ceil(source.getBoundingClientRect().width)}px`;
          cell.style.width = width;
          cell.style.minWidth = width;
          cell.dataset.sourceColumn = String(index);
          clonedRow.appendChild(cell);
        });
        clonedRow.style.height = `${Math.ceil(row.getBoundingClientRect().height)}px`;
        body.appendChild(clonedRow);
      });
      pinnedTable.appendChild(body);
      overlay.appendChild(pinnedTable);
      this.scrollHost.classList.add("erp-table-scroll-host");
      this.scrollHost.appendChild(overlay);
      this.overlay = overlay;
      this.shell.classList.add("has-frozen-columns");
      overlay.addEventListener("click", (event) => this.forwardPinnedInteraction(event));
      this.positionPinnedOverlay();
    }

    positionPinnedOverlay() {
      if (!this.overlay) return;
      this.overlay.style.transform = `translate3d(${this.scrollHost.scrollLeft}px, 0, 0)`;
    }

    forwardPinnedInteraction(event) {
      const header = event.target.closest("th[data-source-column]");
      if (header) {
        event.preventDefault();
        this.headers[Number(header.dataset.sourceColumn)]?.click();
        return;
      }
      const cell = event.target.closest("td[data-source-column]");
      const clonedRow = event.target.closest("tr[data-source-row]");
      if (!cell || !clonedRow) return;
      const original = this.table.tBodies[0]?.rows[Number(clonedRow.dataset.sourceRow)]?.cells[Number(cell.dataset.sourceColumn)];
      if (!original) return;
      const anchor = event.target.closest("a[href]");
      if (anchor) return;
      const actionable = event.target.closest("button, input, select, [role='button']");
      if (!actionable) return;
      event.preventDefault();
      const peers = [...cell.querySelectorAll("button, input, select, [role='button']")];
      const sourcePeers = [...original.querySelectorAll("button, input, select, [role='button']")];
      sourcePeers[peers.indexOf(actionable)]?.click();
    }
  }

  function enhance(table) {
    if (!isEligible(table) || managedTables.has(table)) return managedTables.get(table);
    const controller = new EnterpriseTableController(table);
    managedTables.set(table, controller);
    table.dataset.enterpriseTableReady = "true";
    return controller;
  }

  function enhanceAll(root = document) {
    if (root.matches?.("table")) enhance(root);
    root.querySelectorAll?.("table").forEach(enhance);
  }

  function compactSecondaryToolbarActions() {
    document.querySelectorAll(".operations-master-toolbar").forEach((toolbar) => {
      if (toolbar.querySelector(":scope > .enterprise-more-actions")) return;
      const actions = [toolbar.querySelector("#ops-refresh"), toolbar.querySelector("#ops-export")].filter(Boolean);
      if (actions.length < 2 || actions.some((action) => action.parentElement !== toolbar)) return;
      const dropdown = document.createElement("div");
      dropdown.className = "dropdown enterprise-more-actions";
      dropdown.innerHTML = '<button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">More Actions</button><div class="dropdown-menu dropdown-menu-end"></div>';
      const menu = dropdown.querySelector(".dropdown-menu");
      actions.forEach((action) => {
        const hidden = action.classList.contains("d-none");
        action.className = `dropdown-item${hidden ? " d-none" : ""}`;
        menu.appendChild(action);
      });
      const primary = toolbar.querySelector(".brand-button");
      if (primary) toolbar.insertBefore(dropdown, primary);
      else toolbar.appendChild(dropdown);
    });
  }

  function createAdvancedFilterDropdown(container, fields, beforeNode) {
    if (!container || fields.length < 1 || container.querySelector(":scope > .erp-more-filters")) return;
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown erp-more-filters";
    dropdown.innerHTML = '<button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">More Filters <span class="erp-filter-count"></span></button><div class="dropdown-menu dropdown-menu-end erp-advanced-filter-menu"><header><strong>Advanced Filters</strong><small>Persempit data operasional</small></header><div class="erp-advanced-filter-fields"></div></div>';
    const host = dropdown.querySelector(".erp-advanced-filter-fields");
    fields.forEach((field) => host.appendChild(field));
    container.insertBefore(dropdown, beforeNode || null);
    const sync = () => {
      const count = [...host.querySelectorAll("select, input")].filter((control) => control.value).length;
      const badgeNode = dropdown.querySelector(".erp-filter-count");
      badgeNode.textContent = count ? String(count) : "";
      badgeNode.classList.toggle("is-empty", !count);
      dropdown.querySelector("button").classList.toggle("active", count > 0);
    };
    host.addEventListener("change", sync);
    sync();
  }

  function compactAdvancedFilters() {
    document.querySelectorAll(".daily-work-filters").forEach((bar) => {
      const fields = ["#ops-filter-shift", "#ops-filter-machine", "#ops-filter-line"]
        .map((selector) => bar.querySelector(selector)?.closest("label"))
        .filter(Boolean);
      createAdvancedFilterDropdown(bar, fields, bar.querySelector("#ops-filter-reset"));
    });
    document.querySelectorAll('[aria-label="Warehouse operational filters"]').forEach((bar) => {
      const controls = [...bar.querySelectorAll(":scope > select")];
      if (controls.length > 2) createAdvancedFilterDropdown(bar, controls.slice(2), bar.querySelector("#ops-filter-reset"));
    });
  }

  function boot() {
    compactSecondaryToolbarActions();
    compactAdvancedFilters();
    requestAnimationFrame(() => enhanceAll());
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      enhanceAll(node);
      const parentTable = node.closest?.("table");
      if (parentTable) enhance(parentTable);
    })));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.SharedDataTable = { number, get, escapeHtml, badge, format, defaults, downloadCsv, referenceRoute, enhance, enhanceAll };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
