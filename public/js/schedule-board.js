(function () {
  if (window.ScheduleBoardLoaded) return;
  window.ScheduleBoardLoaded = true;

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(number(value));
  const pad = (value) => String(value).padStart(2, "0");
  const localKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const atStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
  const parseDate = (value) => {
    if (!value) return null;
    const text = String(value);
    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (dayMatch) return new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const hasExplicitTime = (value) => {
    const match = /T(\d{2}):(\d{2})/.exec(String(value || ""));
    return Boolean(match && (match[1] !== "00" || match[2] !== "00"));
  };
  const monday = (date) => {
    const day = date.getDay() || 7;
    return addDays(atStart(date), 1 - day);
  };
  const dateLabel = (date, options) => new Intl.DateTimeFormat("id-ID", options).format(date);

  function createBoard(root) {
    const kind = root.dataset.kind || "incoming";
    const state = { mode: "date", scope: "purchase", anchor: atStart(new Date()), rows: [], query: "", requestId: 0 };
    const node = (selector) => root.querySelector(selector);

    function period() {
      if (state.mode === "hour") {
        const start = atStart(state.anchor);
        return { start, end: start, label: dateLabel(start, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), kicker: "HOUR VIEW" };
      }
      if (state.mode === "week") {
        const start = monday(state.anchor);
        const end = addDays(start, 6);
        return { start, end, label: `${dateLabel(start, { day: "numeric", month: "short" })} — ${dateLabel(end, { day: "numeric", month: "short", year: "numeric" })}`, kicker: "WEEK VIEW" };
      }
      const start = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1);
      const end = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + 1, 0);
      return { start, end, label: dateLabel(start, { month: "long", year: "numeric" }), kicker: "DATE VIEW" };
    }

    function columns() {
      const current = period();
      if (state.mode === "hour") {
        return [
          ...Array.from({ length: 24 }, (_value, hour) => ({ key: `hour-${pad(hour)}`, label: `${pad(hour)}:00`, sublabel: "" })),
          { key: "no-time", label: "Tanpa", sublabel: "Jam" },
        ];
      }
      const days = [];
      for (let cursor = current.start; cursor <= current.end; cursor = addDays(cursor, 1)) {
        days.push({
          key: localKey(cursor),
          label: state.mode === "week" ? dateLabel(cursor, { weekday: "short" }) : String(cursor.getDate()),
          sublabel: state.mode === "week" ? dateLabel(cursor, { day: "numeric", month: "short" }) : dateLabel(cursor, { weekday: "short" }),
          today: localKey(cursor) === localKey(new Date()),
        });
      }
      return days;
    }

    function endpoint() {
      const current = period();
      const query = new URLSearchParams({ from: localKey(current.start), to: localKey(current.end) });
      return kind === "outgoing" ? `/modules/api/outgoing/delivery-board?${query}` : `/modules/api/incoming/dashboard?${query}`;
    }

    function normalizeIncoming(payload) {
      if (state.scope === "vendor") return window.ScheduleBoardModel.expandOutgoingEvents((payload.vendorRows || []).map((row) => ({
        itemType: "VENDOR PROCESS",
        itemCode: row.partCode,
        itemName: row.partName || row.processName || row.processCode,
        partnerCode: row.vendorCode,
        partnerName: row.vendorName,
        eventAt: row.plannedAt,
        actualAt: row.actualAt,
        qty: row.plannedQty,
        completedQty: row.receivedQty,
        outstandingQty: row.outstandingQty,
        uomCode: row.uomCode,
        status: row.status,
        reference: row.orderNumber,
        secondaryReference: row.moNumber,
        href: `/modules/production/vendor-process-orders/${encodeURIComponent(row.orderNumber)}`,
      })));
      const plans = (payload.planRows || []).filter((row) => ["MATERIAL", "PURCHASE_PART"].includes(row.itemType)).map((row) => ({
        itemType: row.itemType === "MATERIAL" ? "MATERIAL" : "PURCHASE PART",
        itemCode: row.materialCode,
        itemName: row.materialName,
        partnerName: row.supplierName,
        eventAt: row.plannedAt || row.dueDate,
        qty: row.orderedQty,
        completedQty: row.receivedQty,
        outstandingQty: row.outstandingQty,
        uomCode: row.uomCode,
        status: row.status,
        reference: row.poNumber,
        matchKey: [row.poNumber, row.materialCode, row.uomCode].join("|"),
        href: `/modules/purchasing/purchase-order/${encodeURIComponent(row.poNumber)}`,
      }));
      const actuals = (payload.actualRows || []).map((row) => ({
        itemType: "PURCHASE RECEIPT",
        itemCode: row.materialCode,
        itemName: row.materialName,
        partnerName: row.supplierName,
        eventAt: row.dueDate,
        actualAt: row.receivedDate,
        completedQty: row.qtyReceived,
        uomCode: row.uomCode,
        status: row.status,
        reference: row.grNumber,
        secondaryReference: row.poNumber,
        matchKey: [row.poNumber, row.materialCode, row.uomCode].join("|"),
        href: `/modules/incoming/goods-receipts/${encodeURIComponent(row.grNumber)}`,
      }));
      return window.ScheduleBoardModel.expandIncomingEvents(plans, actuals);
    }

    function normalizeOutgoing(payload) {
      const rows = (payload.rows || []).filter((row) => row.itemType === "FINISHED_GOOD").map((row) => ({
        itemType: "FINISHED GOODS",
        itemCode: row.partCode,
        itemName: row.partName || row.partNumber,
        partnerCode: row.customerCode,
        partnerName: row.customerName,
        eventAt: row.plannedAt,
        actualAt: row.actualAt,
        qty: row.plannedQty,
        completedQty: row.deliveredQty,
        outstandingQty: row.outstandingQty,
        uomCode: row.uomCode,
        status: row.status,
        reference: row.scheduleNumber,
        secondaryReference: row.soNumber,
        href: `/modules/outgoing/delivery-schedules/${encodeURIComponent(row.scheduleNumber)}`,
      }));
      return window.ScheduleBoardModel ? window.ScheduleBoardModel.expandOutgoingEvents(rows) : rows;
    }

    function eventColumnKey(row) {
      const value = row.displayAt || row.eventAt;
      const date = parseDate(value);
      if (!date) return "";
      if (state.mode === "hour") return hasExplicitTime(value) ? `hour-${pad(date.getHours())}` : "no-time";
      return localKey(date);
    }

    function rowStatus(events) {
      const today = localKey(new Date());
      const complete = (event) => /received|completed|closed|delivered/i.test(event.status || "") || number(event.outstandingQty) <= .000001;
      if (events.some((event) => {
        const eventDate = parseDate(event.eventAt);
        return /overdue/i.test(event.status || "") || (eventDate && localKey(eventDate) < today && !complete(event));
      })) return "is-overdue";
      if (events.every(complete)) return "is-complete";
      if (events.some((event) => number(event.completedQty) > 0 || /partial|process|transit|sent/i.test(event.status || ""))) return "is-progress";
      return "is-planned";
    }

    function groupedRows() {
      const search = state.query.trim().toLowerCase();
      const visible = state.rows.filter((row) => !search || [row.itemCode, row.itemName, row.partnerCode, row.partnerName, row.reference, row.secondaryReference, row.status].some((value) => String(value || "").toLowerCase().includes(search)));
      const groups = new Map();
      visible.forEach((row) => {
        const key = [row.itemType, row.itemCode, row.partnerCode || row.partnerName, row.uomCode].join("|");
        if (!groups.has(key)) groups.set(key, { itemType: row.itemType, itemCode: row.itemCode || "-", itemName: row.itemName || "", partnerCode: row.partnerCode || "", partnerName: row.partnerName || "-", uomCode: row.uomCode || "", cells: new Map() });
        const group = groups.get(key);
        const columnKey = eventColumnKey(row);
        if (!columnKey) return;
        if (!group.cells.has(columnKey)) group.cells.set(columnKey, []);
        group.cells.get(columnKey).push(row);
      });
      return [...groups.values()].sort((left, right) => `${left.partnerName}|${left.itemCode}`.localeCompare(`${right.partnerName}|${right.itemCode}`, "id", { numeric: true }));
    }

    function render() {
      const current = period();
      const periodColumns = columns();
      const groups = groupedRows();
      const visibleKeys = new Set(periodColumns.map((column) => column.key));
      const periodRows = state.rows.filter((row) => visibleKeys.has(eventColumnKey(row)));
      const total = periodRows.reduce((sum, row) => sum + number(row.qty), 0);
      node("[data-board-period-label]").textContent = current.label;
      node("[data-board-period-kicker]").textContent = current.kicker;
      node("[data-board-row-count]").textContent = String(groups.length);
      node("[data-board-total-plan]").textContent = fmt(periodRows.reduce((sum, row) => sum + number(row.planQty), 0));
      node("[data-board-total-actual]").textContent = fmt(periodRows.reduce((sum, row) => sum + number(row.actualQty), 0));
      node("[data-board-total-balance]").textContent = fmt(periodRows.reduce((sum, row) => sum + number(row.balanceQty), 0));
      const header = periodColumns.map((column) => `<th data-period-key="${esc(column.key)}" class="${column.today ? "is-today" : ""}"><b>${esc(column.label)}</b>${column.sublabel ? `<small class="d-block">${esc(column.sublabel)}</small>` : ""}</th>`).join("");
      const incomingBody = groups.map((group) => `<tr>
        <td><div class="schedule-board__item"><b>${esc(group.itemCode)}</b><small>${esc(group.itemName || "-")}</small><span class="schedule-board__type">${esc(group.itemType)}</span></div></td>
        <td><div class="schedule-board__partner"><b>${esc(group.partnerCode || group.partnerName)}</b><small>${esc(group.partnerName)}</small></div></td>
        ${periodColumns.map((column) => {
          const events = group.cells.get(column.key) || [];
          if (!events.length) return `<td data-period-key="${esc(column.key)}"><span class="schedule-board__empty-cell">·</span></td>`;
          const quantity = events.reduce((sum, event) => sum + number(event.qty), 0);
          const refs = events.map((event) => [event.reference, event.secondaryReference, event.status].filter(Boolean).join(" · ")).join("\n");
          const first = events[0];
          const status = rowStatus(events);
          return `<td data-period-key="${esc(column.key)}"><a href="${esc(first.href)}" class="schedule-board__cell ${status} ${events.length > 1 ? "has-multiple" : ""}" data-count="${events.length}" title="${esc(refs)}"><strong>${fmt(quantity)}</strong><small>${esc(group.uomCode || first.reference || "")}</small></a></td>`;
        }).join("")}
      </tr>`).join("");
      const matrixBody = groups.map((group) => {
        const rows = [
          { label: "Planned", field: "plan" },
          { label: "Actual", field: "actual" },
          { label: "Balance", field: "balance" },
          { label: "Status", field: "status" },
        ];
        return rows.map((metric, index) => `<tr class="schedule-board__metric-row metric-${metric.field}">
          ${index === 0 ? `<td rowspan="4" class="schedule-board__fixed-part"><div class="schedule-board__item"><b>${esc(group.itemCode)}</b><small>${esc(group.itemName || "-")}</small><span class="schedule-board__type">${esc(group.itemType)}</span></div></td><td rowspan="4" class="schedule-board__fixed-customer"><div class="schedule-board__partner"><b>${esc(group.partnerCode || group.partnerName)}</b><small>${esc(group.partnerName)}</small></div></td>` : ""}
          <td class="schedule-board__metric-label schedule-board__fixed-metric">${metric.label}</td>
          ${periodColumns.map((column) => {
            const events = group.cells.get(column.key) || [];
            const summary = window.ScheduleBoardModel.summarizeOutgoingCell(events);
            if (!events.length) return `<td data-period-key="${esc(column.key)}"></td>`;
            const first = events[0];
            const refs = events.map((event) => [event.reference, event.secondaryReference, event.status].filter(Boolean).join(" · ")).join("\n");
            const value = metric.field === "status" ? summary.status : fmt(summary[metric.field]);
            const timingClass = metric.field === "status" && summary.status ? ` timing-${summary.status.toLowerCase().replace(/\s+/g, "-")}` : "";
            return `<td data-period-key="${esc(column.key)}"><a href="${esc(first.href)}" class="schedule-board__matrix-value${timingClass}" title="${esc(refs)}">${esc(value)}</a></td>`;
          }).join("")}
        </tr>`).join("");
      }).join("");
      const partnerHeading = kind === "outgoing" ? "Customer" : state.scope === "vendor" ? "Vendor" : "Supplier";
      const tableHead = `<th class="schedule-board__fixed-part">Part</th><th class="schedule-board__fixed-customer">${partnerHeading}</th><th class="schedule-board__fixed-metric">Date</th>${header}`;
      node("[data-board-matrix]").innerHTML = groups.length ? `<table class="schedule-board__table schedule-board__table--outgoing"><thead><tr>${tableHead}</tr></thead><tbody>${matrixBody}</tbody></table>` : `<div class="schedule-board__empty">Tidak ada jadwal pada periode dan filter ini.</div>`;
    }

    async function load() {
      const requestId = ++state.requestId;
      const error = node("[data-board-error]");
      error.classList.add("d-none");
      node("[data-board-matrix]").innerHTML = '<div class="schedule-board__loading">Memuat jadwal...</div>';
      try {
        const response = await fetch(endpoint(), { headers: { Authorization: `Bearer ${token()}` } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "Jadwal gagal dimuat.");
        if (requestId !== state.requestId) return;
        const data = payload.data || payload;
        state.rows = kind === "outgoing" ? normalizeOutgoing(data) : normalizeIncoming(data);
        render();
      } catch (loadError) {
        if (requestId !== state.requestId) return;
        state.rows = [];
        render();
        error.textContent = loadError.message;
        error.classList.remove("d-none");
      }
    }

    root.addEventListener("click", (event) => {
      const mode = event.target.closest("[data-board-mode]");
      if (mode) {
        state.mode = mode.dataset.boardMode;
        root.querySelectorAll("[data-board-mode]").forEach((button) => button.classList.toggle("active", button === mode));
        load();
        return;
      }
      const scope = event.target.closest("[data-board-scope]");
      if (scope) {
        state.scope = scope.dataset.boardScope;
        root.querySelectorAll("[data-board-scope]").forEach((button) => button.classList.toggle("active", button === scope));
        load();
        return;
      }
      const shift = event.target.closest("[data-board-shift]");
      if (shift) {
        const direction = Number(shift.dataset.boardShift || 0);
        if (state.mode === "hour") state.anchor = addDays(state.anchor, direction);
        else if (state.mode === "week") state.anchor = addDays(state.anchor, direction * 7);
        else state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + direction, 1);
        load();
        return;
      }
      if (event.target.closest("[data-board-today]")) {
        state.anchor = atStart(new Date());
        load();
      }
    });
    node("[data-board-search]").addEventListener("input", (event) => { state.query = event.target.value || ""; render(); });
    load();
  }

  document.querySelectorAll("[data-schedule-board]").forEach(createBoard);
})();
