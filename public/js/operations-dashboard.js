(function () {
  const config = JSON.parse(document.getElementById("ops-page-config").textContent);
  const isDailyWorkQueue = config.module === "production" && config.page.slug === "daily-production-schedules";
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const get = (object, path) => String(path || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: Math.min(Math.max(Number(digits) || 0, 0), 2) }).format(number(value));
  const qty = (value, uomCode = "") => shared.formatQuantity(value, uomCode, { maximumFractionDigits: 2 });
  const slug = (value) => String(value || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const statusBadge = (value) => `<span class="ops-badge ${esc(slug(value))}">${esc(value || "-")}</span>`;
  const localDateKey = (value = (globalThis.erpBusinessNow?.() || new Date())) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const workDateLabel = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(date);
  };
  const format = (value, type) => {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
    if (type === "mrpLink") return `<a class="ops-link" href="/modules/planning-ppic/mrp/${encodeURIComponent(value)}">${esc(value)} ↗</a>`;
    if (type === "reservationSource") {
      const source = String(value);
      const href = /^SO-/i.test(source)
        ? `/modules/sales/sales-orders/${encodeURIComponent(source)}`
        : /^MPS-/i.test(source)
          ? `/modules/planning-ppic/mps/${encodeURIComponent(source)}`
          : /^(MO-|MFG-)/i.test(source)
            ? `/modules/production/manufacturing-orders/${encodeURIComponent(source)}`
            : "";
      return href ? `<a class="ops-link" href="${href}">${esc(source)} ↗</a>` : esc(source);
    }
    if (type === "date") { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? esc(value) : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed); }
    if (type === "number") return `<span class="ops-number">${num(value, 2)}</span>`;
    if (type === "currency") return `<span class="ops-number">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number(value))}</span>`;
    if (type === "status") return statusBadge(value);
    if (type === "active") return statusBadge(value ? "Active" : "Inactive");
    if (typeof value === "object") return esc(JSON.stringify(value));
    return esc(value);
  };
  const columns = [
    ...config.page.columns.map((column) => ({ data: null, name: column.data, render: (_value, renderType, row) => { const value = get(row, column.data); return renderType === "display" ? format(value, column.type) : value ?? ""; } })),
    { data: null, orderable: false, searchable: false, render: (_value, _type, row) => { const key = row[config.page.detailKey] ?? row.id; const categoryQuery = config.purchaseCategory ? `?category=${encodeURIComponent(config.purchaseCategory)}` : ""; if (key == null) return '<span class="ops-muted">—</span>'; const detail = `<a class="ops-link" href="/modules/${encodeURIComponent(config.module)}/${encodeURIComponent(config.page.slug)}/${encodeURIComponent(key)}${categoryQuery}">Lihat detail →</a>`; const cancel = config.page.slug === "stock-reservations" && String(row.status).toLowerCase() === "active" ? ` <button type="button" class="btn btn-sm btn-outline-danger ms-1" data-cancel-reservation="${esc(key)}">Cancel Reserve</button>` : ""; return detail + cancel; } },
  ];
  const alertBox = document.getElementById("ops-alert");
  let visibleRows = [];
  const workViewStorageKey = `operations-view:${config.module}:${config.page.slug}`;
  if (isDailyWorkQueue && !localStorage.getItem(workViewStorageKey)) localStorage.setItem(workViewStorageKey, "gallery");
  function renderDailyMachineTables(rows) {
    const host = document.getElementById("daily-machine-tables");
    if (!host) return;
    const groups = new Map();
    rows.forEach((row) => {
      const key = row.machineCode || "Tanpa Mesin";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    host.innerHTML = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([machineCode, items]) => {
      const ordered = [...items].sort((left, right) => number(left.schedulePriority || 100) - number(right.schedulePriority || 100) || String(left.plannedStartTime || "99:99").localeCompare(String(right.plannedStartTime || "99:99")) || number(left.sequence) - number(right.sequence));
      const body = ordered.map((row) => `<tr class="${number(row.schedulePriority || 100) <= 1 ? "is-carryover" : ""}"><td><b>${esc(row.plannedStartTime || "-")}–${esc(row.plannedEndTime || "-")}</b><small>Shift ${esc(row.shift || "-")}</small></td><td><b>${esc(row.scheduleNumber || "-")}</b><small>${number(row.schedulePriority || 100) <= 1 ? "PRIORITAS SHORTFALL · " : ""}${esc(row.moNumber || "-")} · ${esc(row.woNumber || "-")}</small></td><td><b>${esc(row.partCode || "-")}</b><small>${esc(row.processName || row.processCode || "-")} · Seq ${num(row.sequence)}</small></td><td>${qty(row.plannedQty, row.uomCode)} ${esc(row.uomCode || "")}</td><td>${statusBadge(row.status)}</td><td><a class="btn btn-sm btn-outline-primary" href="/modules/production/daily-production-schedules/${encodeURIComponent(row.scheduleNumber)}">Buka</a></td></tr>`).join("");
      return `<article class="daily-machine-table"><header><div><span>MESIN</span><h2>${esc(machineCode)}</h2><small>${esc(items[0]?.machineName || "")} · ${num(items.length)} DPP</small></div><strong>${num(items.reduce((sum, row) => sum + number(row.plannedQty), 0), 3)}</strong></header><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Jam / Shift</th><th>DPS / Reference</th><th>Part / Proses</th><th>Plan Qty</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
    }).join("") || '<div class="daily-machine-empty">Tidak ada Daily Production Schedule untuk filter aktif.</div>';
  }
  const dailyCard = (row, compact = false) => {
    const key = row[config.page.detailKey] ?? row.id;
    const planned = number(row.plannedQty);
    const actual = number(row.actualQty);
    const progress = planned > 0 ? Math.min(Math.round(actual / planned * 100), 100) : 0;
    const dateKey = localDateKey(row.scheduleDate);
    const today = localDateKey();
    const urgency = dateKey < today && !/completed|cancelled/i.test(row.status || "") ? "Terlambat" : dateKey === today ? "Hari ini" : workDateLabel(row.scheduleDate);
    const href = `/modules/production/daily-production-schedules/${encodeURIComponent(key)}`;
    if (compact) return `<article class="kanban-card daily-kanban-card"><div><b>${esc(row.machineCode || "Tanpa Mesin")}</b>${statusBadge(row.status)}</div><strong>${esc(row.partCode || "-")}</strong><small>${esc(row.processName || row.processCode || "Proses belum ditentukan")} · Shift ${esc(row.shift || "-")}</small><span>${num(actual, 3)} / ${num(planned, 3)}</span><a href="${href}">Buka schedule</a></article>`;
    return `<article class="list-gallery-card daily-work-card ${dateKey < today ? "is-overdue" : ""}">
      <div class="daily-work-card-top"><span>${esc(urgency)} · Shift ${esc(row.shift || "-")}</span>${statusBadge(row.status)}</div>
      <div class="daily-work-machine"><small>MESIN / LINE</small><h3>${esc(row.machineCode || "Belum ada mesin")}</h3><p>${esc(row.machineName || row.machineLocation || "-")} ${row.lineCode ? `· ${esc(row.lineCode)}` : ""}</p></div>
      <div class="daily-work-part"><small>PART & PROSES</small><strong>${esc(row.partCode || "-")}</strong><span>${esc(row.processName || row.processCode || "Proses belum ditentukan")}</span></div>
      <div class="daily-work-qty"><div><small>TARGET</small><b>${qty(planned, row.uomCode)}</b></div><div><small>AKTUAL</small><b>${qty(actual, row.uomCode)}</b></div><div><small>PROGRESS</small><b>${progress}%</b></div></div>
      <div class="daily-work-progress"><i style="width:${progress}%"></i></div>
      <footer><small>${esc(row.scheduleNumber || "-")} · ${esc(row.moNumber || "-")}</small><a href="${href}">Buka Daily Production Schedule →</a></footer>
    </article>`;
  };
  let ganttWeekAnchor = localDateKey();
  let ganttMeta = { weekStart: null, weekEnd: null, total: 0 };
  const mondayOf = (value) => {
    const date = value ? new Date(`${value}T12:00:00`) : (globalThis.erpBusinessNow?.() || new Date());
    const day = date.getDay();
    date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
    return date;
  };
  const renderDailyGantt = (rows) => {
    const weekStart = ganttMeta.weekStart ? new Date(ganttMeta.weekStart) : mondayOf(ganttWeekAnchor);
    const days = Array.from({ length: 7 }, (_unused, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date; });
    const dayKeys = days.map(localDateKey);
    const groups = new Map();
    rows.forEach((row) => {
      const key = row.machineId || row.machineCode || "UNASSIGNED";
      if (!groups.has(key)) groups.set(key, { machineCode: row.machineCode || "Belum ada mesin", machineName: row.machineName || "-", lineCode: row.lineCode || "-", items: [] });
      groups.get(key).items.push(row);
    });
    const dayHeader = days.map((date) => `<div class="daily-gantt-day ${localDateKey(date) === localDateKey() ? "is-today" : ""}"><small>${esc(new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date))}</small><strong>${esc(new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date))}</strong></div>`).join("");
    const machineRows = [...groups.values()].sort((a, b) => String(a.machineCode).localeCompare(String(b.machineCode), undefined, { numeric: true })).map((group) => {
      const cells = dayKeys.map((dayKey) => {
        const tasks = group.items.filter((row) => localDateKey(row.scheduleDate) === dayKey);
        return `<div class="daily-gantt-cell ${dayKey === localDateKey() ? "is-today" : ""}">${tasks.map((row) => {
          const href = `/modules/production/daily-production-schedules/${encodeURIComponent(row.scheduleNumber)}`;
          return `<a class="daily-gantt-task status-${esc(slug(row.status))}" href="${href}" title="${esc(`${row.scheduleNumber} · ${row.partCode || "-"} · ${row.processName || "-"}`)}"><span>Shift ${esc(row.shift || "-")} · ${esc(row.status || "-")}</span><b>${esc(row.partCode || "-")}</b><small>${esc(row.processName || row.processCode || "-")}</small><em>${qty(row.plannedQty, row.uomCode)} ${esc(row.uomCode || "")}</em></a>`;
        }).join("") || '<i class="daily-gantt-empty">-</i>'}</div>`;
      }).join("");
      return `<div class="daily-gantt-machine"><strong>${esc(group.machineCode)}</strong><span>${esc(group.machineName)}</span><small>Line ${esc(group.lineCode)}</small></div>${cells}`;
    }).join("");
    const rangeLabel = `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(days[0])} – ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(days[6])}`;
    return `<section class="daily-gantt-shell">
      <header><div><span>WEEKLY MACHINE SCHEDULE</span><h2>${esc(rangeLabel)}</h2><p>Semua ${num(ganttMeta.total)} Daily Production Schedule pada minggu dan filter aktif.</p></div><div class="daily-gantt-nav"><button type="button" data-gantt-nav="-7">← Minggu Lalu</button><button type="button" data-gantt-nav="today">Minggu Ini</button><button type="button" data-gantt-nav="7">Minggu Depan →</button></div></header>
      <div class="daily-gantt-scroll"><div class="daily-gantt-grid"><div class="daily-gantt-corner"><strong>MESIN</strong><small>Machine axis</small></div>${dayHeader}${machineRows || `<div class="daily-gantt-no-data">Tidak ada Daily Production Schedule pada minggu ini.</div>`}</div></div>
    </section>`;
  };
  const gallery = window.ListGallery?.init({
    root: "#ops-list-root",
    storageKey: workViewStorageKey,
    title: (row) => get(row, config.page.columns[0]?.data) || config.page.label,
    subtitle: (row) => get(row, config.page.columns[1]?.data) || config.moduleLabel,
    status: (row) => row.status || row.decision || row.matchStatus || row.qualityBucket || "Tanpa Status",
    kanbanGroup: isDailyWorkQueue ? (row) => row.status || "Tanpa Status" : undefined,
    kanbanCard: isDailyWorkQueue ? (row) => dailyCard(row, true) : undefined,
    gantt: isDailyWorkQueue ? renderDailyGantt : undefined,
    card: (row) => {
      if (isDailyWorkQueue) return dailyCard(row);
      const key = row[config.page.detailKey] ?? row.id;
      const title = get(row, config.page.columns[0]?.data) || config.page.label;
      const fields = config.page.columns.slice(1, 5).map((column) => `<div><span>${esc(column.label)}</span><strong>${format(get(row, column.data), column.type)}</strong></div>`).join("");
      const categoryQuery = config.purchaseCategory ? `?category=${encodeURIComponent(config.purchaseCategory)}` : "";
      const action = key == null ? "" : `<div class="list-gallery-actions"><a href="/modules/${encodeURIComponent(config.module)}/${encodeURIComponent(config.page.slug)}/${encodeURIComponent(key)}${categoryQuery}">Lihat detail</a></div>`;
      return `<article class="list-gallery-card"><div class="list-gallery-card-head"><div><h3>${esc(title)}</h3><small>${esc(get(row, config.page.columns[1]?.data) || config.moduleLabel)}</small></div>${statusBadge(row.status || row.decision || "Tanpa Status")}</div><div class="list-gallery-meta">${fields}</div>${action}</article>`;
    },
  });

  async function loadWeeklyGantt(anchor = null) {
    if (!isDailyWorkQueue || gallery?.getMode() !== "gantt") return;
    ganttWeekAnchor = anchor || document.getElementById("ops-filter-schedule-date")?.value || ganttWeekAnchor || localDateKey();
    const host = document.querySelector("#ops-list-root .list-gantt");
    if (host) host.innerHTML = '<div class="list-gallery-empty"><strong>Memuat seluruh jadwal mingguan...</strong><small>Menyiapkan sumbu mesin dan waktu.</small></div>';
    const params = new URLSearchParams({ weekStart: ganttWeekAnchor });
    const filterMap = {
      shift: document.getElementById("ops-filter-shift")?.value,
      machineCode: document.getElementById("ops-filter-machine")?.value,
      lineCode: document.getElementById("ops-filter-line")?.value,
      status: document.getElementById("ops-filter-status")?.value,
      q: document.getElementById("ops-search")?.value?.trim(),
    };
    Object.entries(filterMap).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const response = await fetch(`/modules/api/production/daily-production-schedules/gantt?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Weekly Gantt gagal dimuat.");
      ganttMeta = { weekStart: payload.weekStart, weekEnd: payload.weekEnd, total: number(payload.total) };
      gallery.setGanttRows(payload.items || []);
    } catch (error) {
      if (host) host.innerHTML = `<div class="list-gallery-empty"><strong>Weekly Gantt gagal dimuat</strong><small>${esc(error.message)}</small></div>`;
    }
  }

  function setStat(index, label, value, note) {
    const labelNode = document.getElementById(`ops-stat-label-${index}`);
    const valueNode = document.getElementById(`ops-stat-value-${index}`);
    const noteNode = document.getElementById(`ops-stat-note-${index}`);
    if (!labelNode || !valueNode || !noteNode) return;
    labelNode.textContent = label;
    valueNode.textContent = value;
    noteNode.textContent = note;
  }
  function productionStats(rows, total) {
    const statuses = rows.map((row) => String(row.status || row.decision || "").toLowerCase());
    const planned = statuses.filter((value) => /draft|planned|pending/.test(value)).length;
    const active = statuses.filter((value) => /released|progress|production|running|open|submitted/.test(value)).length;
    const completed = statuses.filter((value) => /completed|approved|passed|closed|received/.test(value)).length;
    setStat(0, "Total Dokumen", num(total), "Seluruh data pada modul ini");
    setStat(1, "Menunggu Proses", num(planned), "Draft, planned, atau pending");
    setStat(2, "Sedang Berjalan", num(active), "Released dan in progress");
    setStat(3, "Selesai", num(completed), "Completed atau approved");
  }
  function dailyWorkStats(rows, total) {
    const waiting = rows.filter((row) => /draft/i.test(row.status || "")).length;
    const running = rows.filter((row) => /released|in progress/i.test(row.status || "")).length;
    const plannedQty = rows.reduce((sum, row) => sum + number(row.plannedQty), 0);
    const actualQty = rows.reduce((sum, row) => sum + number(row.actualQty), 0);
    const attainment = plannedQty > 0 ? Math.round(actualQty / plannedQty * 100) : 0;
    setStat(0, "Total Schedule", num(total), "Sesuai filter aktif");
    setStat(1, "Belum Dipersiapkan", num(waiting), "Status Draft");
    setStat(2, "Siap / Berjalan", num(running), "Released dan In Progress");
    setStat(3, "Pencapaian Qty", `${num(attainment)}%`, `${num(actualQty, 3)} dari ${num(plannedQty, 3)}`);
  }
  function inventoryStats(rows, total) {
    if (config.page.slug === "stock-reservations") {
      const reserved = rows.reduce((sum, row) => sum + number(row.qtyReserved), 0);
      const released = rows.reduce((sum, row) => sum + number(row.qtyReleased), 0);
      const open = rows.reduce((sum, row) => sum + number(row.qtyOpen), 0);
      const active = rows.filter((row) => String(row.status).toLowerCase() === "active").length;
      setStat(0, "Total Reservation", num(total), "Dokumen sesuai filter aktif");
      setStat(1, "Reservation Aktif", num(active), "Baris aktif pada halaman ini");
      setStat(2, "Qty Open Reserved", num(open, 3), `Reserved ${num(reserved, 3)}`);
      setStat(3, "Qty Released", num(released, 3), "Sudah dikonsumsi atau dilepas");
      return;
    }
    if (config.page.slug === "stock-opname") {
      const active = rows.filter((row) => !["CLOSED", "CANCELLED"].includes(String(row.status || "").toUpperCase())).length;
      const frozen = rows.filter((row) => row.inventoryFrozen).length;
      const counted = rows.reduce((sum, row) => sum + number(row.countedCount), 0);
      const variances = rows.reduce((sum, row) => sum + number(row.varianceCount), 0);
      setStat(0, "Total Stock Opname", num(total), "Dokumen sesuai filter aktif");
      setStat(1, "Opname Aktif", num(active), `${num(frozen)} scope sedang frozen`);
      setStat(2, "Lines Counted", num(counted), "Akumulasi halaman saat ini");
      setStat(3, "Variance Lines", num(variances), "Shortage dan excess perlu review");
      return;
    }
    const onHand = rows.reduce((sum, row) => sum + number(row.qtyOnHand ?? row.qty ?? row.capacity), 0);
    const available = rows.reduce((sum, row) => sum + number(row.qtyAvailable ?? (row.isActive ? 1 : 0)), 0);
    const reserved = rows.reduce((sum, row) => sum + number(row.qtyReserved ?? Math.max(number(row.qtyOnHand) - number(row.qtyAvailable), 0)), 0);
    const locations = new Set(rows.map((row) => row.warehouseCode || row.rackCode || row.lotNumber).filter(Boolean)).size;
    const isWarehouse = config.page.slug === "warehouses";
    setStat(0, isWarehouse ? "Total Warehouse" : "Total Record", num(total), "Data inventory terdaftar");
    setStat(1, config.page.slug === "stock-balances" || isWarehouse ? "Qty On Hand" : "Kapasitas / Aktif", num(onHand, 3), "Akumulasi halaman saat ini");
    setStat(2, config.page.slug === "stock-balances" || isWarehouse ? "Qty Available" : "Record Aktif", num(available, 3), "Siap digunakan");
    setStat(3, config.page.slug === "stock-balances" ? "Qty Reserved" : isWarehouse ? "STO Aktif" : "Lokasi Unik", num(config.page.slug === "stock-balances" ? reserved : isWarehouse ? rows.reduce((sum, row) => sum + number(row.activeStoCount), 0) : locations, 3), "Ringkasan halaman saat ini");
  }
  function supplyChainStats(rows, total) {
    const statuses = rows.map((row) => String(row.status || row.decision || row.matchStatus || row.qualityBucket || "").toLowerCase());
    const waiting = statuses.filter((value) => /draft|pending|scheduled|open|unchecked|need review/.test(value)).length;
    const process = statuses.filter((value) => /submitted|checking|approved|sent|confirmed|partial|process|transit|progress|inspection|matched/.test(value)).length;
    const completed = statuses.filter((value) => /completed|delivered|received|accepted|posted|paid|closed/.test(value)).length;
    const qty = rows.reduce((sum, row) => sum + number(row.qtyReceived ?? row.receivedQty ?? row.deliveredQty ?? row.qtyAccepted ?? row.plannedQty ?? 0), 0);
    const waitingLabel = config.module === "outgoing" ? "Menunggu Picking" : config.module === "incoming" ? "Menunggu Receipt / QC" : "Menunggu Approval";
    const processLabel = config.module === "outgoing" ? "Dalam Pengiriman" : config.module === "incoming" ? "Sedang Diproses" : "Proses Purchasing";
    setStat(0, "Total Dokumen", num(total), `Data ${config.moduleLabel} terdaftar`);
    setStat(1, waitingLabel, num(waiting), "Draft, pending, scheduled, atau open");
    setStat(2, processLabel, num(process), "Status aktif pada halaman ini");
    setStat(3, completed ? "Selesai" : "Qty Terealisasi", completed ? num(completed) : num(qty, 3), completed ? `Qty terealisasi ${num(qty, 3)}` : "Akumulasi halaman saat ini");
  }
  function purchaseRequisitionStats(rows, total) {
    const statuses = rows.map((row) => String(row.status || "").toLowerCase());
    const waiting = statuses.filter((value) => /submitted|pending|checking|waiting/.test(value)).length;
    const approved = statuses.filter((value) => /approved|partially ordered/.test(value)).length;
    const vendorProcess = rows.filter((row) => String(row.procurementCategory || row.procurementGroup || "").toUpperCase() === "VENDOR_PROCESS").length;
    const amount = rows.reduce((sum, row) => sum + number(row.totalAmount), 0);
    const categoryLabels = {
      material: "Total Material",
      "purchase-part": "Total Purchase Part",
      "universal-purchase-part": "Total Universal Part",
      "vendor-process": "Total Vendor Process",
      "non-production": "Total Non Produksi",
    };
    setStat(0, categoryLabels[config.purchaseCategory] || "Total Purchase Requisition", num(total), `${num(vendorProcess)} PR Vendor Process pada halaman ini`);
    setStat(1, "Menunggu Approval", num(waiting), "PR yang memerlukan keputusan approver");
    setStat(2, "Siap Dibuat PO", num(approved), "Approved atau partially ordered");
    setStat(3, "Estimasi Nilai", new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount), "Akumulasi halaman saat ini");
  }
  function updateStats(rows, total) {
    if (isDailyWorkQueue) dailyWorkStats(rows, total);
    else if (config.module === "production") productionStats(rows, total);
    else if (config.module === "inventory") inventoryStats(rows, total);
    else if (config.module === "purchasing" && config.page.slug === "purchase-requisitions") purchaseRequisitionStats(rows, total);
    else supplyChainStats(rows, total);
  }

  if (isDailyWorkQueue) {
    const initialDate = document.getElementById("ops-filter-schedule-date");
    if (initialDate) initialDate.value = localDateKey();
    const dateLabel = document.getElementById("daily-work-date-label");
    if (dateLabel) dateLabel.textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format((globalThis.erpBusinessNow?.() || new Date()));
  }

  const table = new DataTable("#ops-table", {
    processing: true, serverSide: true, searching: true, pageLength: isDailyWorkQueue ? 500 : 20, order: [], columns,
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: ["pageLength", "paging"] },
    language: { processing: "Memuat data operasional...", emptyTable: "Belum ada data", zeroRecords: "Data tidak ditemukan", info: "Menampilkan _START_-_END_ dari _TOTAL_ data", infoEmpty: "Menampilkan 0 data", lengthMenu: "_MENU_ / halaman", paginate: { previous: "‹", next: "›" } },
    ajax(data, callback) {
      const operationalFilters = {
        warehouseCode: document.getElementById("ops-filter-warehouse")?.value || undefined,
        stockType: document.getElementById("ops-filter-stock-type")?.value || undefined,
        lowStock: document.getElementById("ops-filter-low-stock")?.value || undefined,
        status: document.getElementById("ops-filter-status")?.value || undefined,
        type: document.getElementById("ops-filter-type")?.value || undefined,
        isActive: document.getElementById("ops-filter-active")?.value || undefined,
        scheduleDate: document.getElementById("ops-filter-schedule-date")?.value || undefined,
        shift: document.getElementById("ops-filter-shift")?.value || undefined,
        machineCode: document.getElementById("ops-filter-machine")?.value || undefined,
        lineCode: document.getElementById("ops-filter-line")?.value || undefined,
        dateScope: document.querySelector("[data-work-scope].active")?.dataset.workScope === "overdue" ? "overdue" : undefined,
        month: document.getElementById("ops-filter-horizon-month")?.value || undefined,
      };
      $.ajax({
        url: `/modules/api/${config.module}/${config.page.slug}`,
        cache: false,
        data: {
          ...data,
          ...operationalFilters,
          ...(config.purchaseCategory ? { category: config.purchaseCategory, prCategory: config.purchaseCategory } : {}),
        },
        headers: { Authorization: `Bearer ${token()}` },
        success(payload) { visibleRows = payload.data || []; alertBox.classList.add("d-none"); updateStats(visibleRows, payload.recordsTotal || 0); renderDailyMachineTables(visibleRows); gallery?.setRows(visibleRows); callback(payload); },
        error(xhr) {
          if (xhr.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
          alertBox.textContent = xhr.responseJSON?.message || "Data gagal dimuat."; alertBox.classList.remove("d-none"); updateStats([], 0); renderDailyMachineTables([]); gallery?.setRows([]); callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
        },
      });
    },
  });
  let searchTimer;
  document.getElementById("ops-search").addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(() => { table.search(this.value).draw(); loadWeeklyGantt(); }, 250); });
  document.getElementById("ops-refresh").addEventListener("click", () => { table.ajax.reload(null, false); loadWeeklyGantt(); });
  document.querySelectorAll("select[id^='ops-filter-']").forEach((filter) => filter.addEventListener("change", () => { table.draw(); loadWeeklyGantt(); }));
  document.getElementById("ops-filter-horizon-month")?.addEventListener("change", (event) => {
    const url = new URL(window.location.href);
    if (event.target.value) url.searchParams.set("month", event.target.value); else url.searchParams.delete("month");
    window.history.replaceState({}, "", url);
    table.draw();
  });
  document.getElementById("ops-filter-schedule-date")?.addEventListener("change", (event) => {
    document.querySelectorAll("[data-work-scope]").forEach((button) => button.classList.remove("active"));
    const todayButton = document.querySelector('[data-work-scope="today"]');
    if (event.target.value === localDateKey()) todayButton?.classList.add("active");
    const activeLabel = document.getElementById("daily-work-active-filter");
    if (activeLabel) activeLabel.textContent = event.target.value ? workDateLabel(event.target.value) : "Semua tanggal";
    table.draw(); loadWeeklyGantt(event.target.value || ganttWeekAnchor);
  });
  document.querySelectorAll("[data-work-scope]").forEach((button) => button.addEventListener("click", () => {
    const scope = button.dataset.workScope;
    const dateInput = document.getElementById("ops-filter-schedule-date");
    const tomorrow = (globalThis.erpBusinessNow?.() || new Date()); tomorrow.setDate(tomorrow.getDate() + 1);
    document.querySelectorAll("[data-work-scope]").forEach((item) => item.classList.toggle("active", item === button));
    if (dateInput) dateInput.value = scope === "today" ? localDateKey() : scope === "tomorrow" ? localDateKey(tomorrow) : "";
    const labels = { today: "Hari ini", tomorrow: "Besok", overdue: "Pekerjaan terlambat", all: "Semua tanggal" };
    const activeLabel = document.getElementById("daily-work-active-filter");
    if (activeLabel) activeLabel.textContent = labels[scope] || "Semua tanggal";
    table.draw(); loadWeeklyGantt(dateInput?.value || ganttWeekAnchor);
  }));
  document.querySelector('[data-list-view="gantt"]')?.addEventListener("click", () => loadWeeklyGantt(document.getElementById("ops-filter-schedule-date")?.value || ganttWeekAnchor));
  document.getElementById("ops-list-root")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gantt-nav]");
    if (!button) return;
    const action = button.dataset.ganttNav;
    const anchor = action === "today" ? (globalThis.erpBusinessNow?.() || new Date()) : mondayOf(ganttWeekAnchor);
    if (action !== "today") anchor.setDate(anchor.getDate() + number(action));
    ganttWeekAnchor = localDateKey(anchor);
    const dateInput = document.getElementById("ops-filter-schedule-date");
    if (dateInput) dateInput.value = ganttWeekAnchor;
    document.querySelectorAll("[data-work-scope]").forEach((item) => item.classList.remove("active"));
    const activeLabel = document.getElementById("daily-work-active-filter");
    if (activeLabel) activeLabel.textContent = "Weekly Gantt";
    loadWeeklyGantt(ganttWeekAnchor);
  });
  document.getElementById("ops-filter-reset")?.addEventListener("click", () => {
    document.querySelectorAll("select[id^='ops-filter-']").forEach((filter) => { filter.value = ""; });
    const horizonMonth = document.getElementById("ops-filter-horizon-month");
    if (horizonMonth) {
      horizonMonth.value = "";
      const url = new URL(window.location.href); url.searchParams.delete("month"); window.history.replaceState({}, "", url);
    }
    if (isDailyWorkQueue) {
      const dateInput = document.getElementById("ops-filter-schedule-date");
      if (dateInput) dateInput.value = localDateKey();
      document.querySelectorAll("[data-work-scope]").forEach((button) => button.classList.toggle("active", button.dataset.workScope === "today"));
      const activeLabel = document.getElementById("daily-work-active-filter");
      if (activeLabel) activeLabel.textContent = "Hari ini";
    }
    table.search("").draw(); loadWeeklyGantt(localDateKey());
    document.getElementById("ops-search").value = "";
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel-reservation]");
    if (!button || config.page.slug !== "stock-reservations") return;
    const reservationNumber = button.dataset.cancelReservation;
    const reason = window.prompt(`Alasan cancel reservation ${reservationNumber}:`, "Stok FG berasal dari data sistem sebelumnya; unreserve manual untuk simulasi.");
    if (!reason?.trim()) return;
    button.disabled = true;
    try {
      const response = await fetch(`/modules/api/inventory/stock-reservations/${encodeURIComponent(reservationNumber)}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Reservation gagal dibatalkan.");
      alertBox.textContent = payload.message || "Reservation dibatalkan.";
      alertBox.className = "alert alert-success mx-4 mt-3";
      table.ajax.reload(null, false);
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.className = "alert alert-danger mx-4 mt-3";
    } finally { button.disabled = false; }
  });
  document.getElementById("ops-export").addEventListener("click", () => {
    const header = config.page.columns.map((column) => column.label);
    const values = visibleRows.map((row) => config.page.columns.map((column) => get(row, column.data) ?? ""));
    shared.downloadCsv(`${config.module}-${config.page.slug}-${(globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10)}.csv`, header, values);
  });

  async function loadWarehouseFilter() {
    const select = document.getElementById("ops-filter-warehouse");
    if (!select) return;
    try {
      const response = await fetch("/modules/api/inventory/warehouses?limit=500&isActive=true", { headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Warehouse filter gagal dimuat.");
      const items = payload.data || payload.items || [];
      select.innerHTML = `<option value="">Semua Warehouse</option>${items.map((item) => `<option value="${esc(item.warehouseCode)}">${esc(item.warehouseCode)} — ${esc(item.warehouseName || "")}</option>`).join("")}`;
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.classList.remove("d-none");
    }
  }
  async function loadDailyWorkFilters() {
    if (!isDailyWorkQueue) return;
    try {
      const response = await fetch("/modules/api/production/daily-production-schedules/filter-options", { headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Filter mesin gagal dimuat.");
      const machines = Array.isArray(payload.machines) ? payload.machines : [];
      const machineSelect = document.getElementById("ops-filter-machine");
      const lineSelect = document.getElementById("ops-filter-line");
      if (machineSelect) machineSelect.innerHTML = `<option value="">Semua Mesin</option>${machines.map((item) => `<option value="${esc(item.machineCode)}">${esc(item.machineCode)} · ${esc(item.machineName || "")}</option>`).join("")}`;
      const lines = [...new Set(machines.map((item) => item.lineCode).filter(Boolean))].sort();
      if (lineSelect) lineSelect.innerHTML = `<option value="">Semua Line</option>${lines.map((line) => `<option value="${esc(line)}">${esc(line)}</option>`).join("")}`;
    } catch (error) {
      alertBox.textContent = error.message; alertBox.classList.remove("d-none");
    }
  }
  loadWarehouseFilter();
  loadDailyWorkFilters();
})();
