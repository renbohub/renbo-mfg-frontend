(function () {
  const config = JSON.parse(document.getElementById("ops-page-config").textContent);
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const get = (object, path) => String(path || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const slug = (value) => String(value || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const statusBadge = (value) => `<span class="ops-badge ${esc(slug(value))}">${esc(value || "-")}</span>`;
  const format = (value, type) => {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
    if (type === "mrpLink") return `<a class="ops-link" href="/modules/planning-ppic/material-requirements-planning/${encodeURIComponent(value)}">${esc(value)} ↗</a>`;
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
    if (type === "number") return `<span class="ops-number">${num(value, 3)}</span>`;
    if (type === "currency") return `<span class="ops-number">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number(value))}</span>`;
    if (type === "status") return statusBadge(value);
    if (type === "active") return statusBadge(value ? "Active" : "Inactive");
    if (typeof value === "object") return esc(JSON.stringify(value));
    return esc(value);
  };
  const columns = [
    ...config.page.columns.map((column) => ({ data: null, render: (_value, _type, row) => format(get(row, column.data), column.type) })),
    { data: null, orderable: false, searchable: false, render: (_value, _type, row) => { const key = row[config.page.detailKey] ?? row.id; const categoryQuery = config.purchaseCategory ? `?category=${encodeURIComponent(config.purchaseCategory)}` : ""; if (key == null) return '<span class="ops-muted">—</span>'; const detail = `<a class="ops-link" href="/modules/${encodeURIComponent(config.module)}/${encodeURIComponent(config.page.slug)}/${encodeURIComponent(key)}${categoryQuery}">Lihat detail →</a>`; const cancel = config.page.slug === "stock-reservations" && String(row.status).toLowerCase() === "active" ? ` <button type="button" class="btn btn-sm btn-outline-danger ms-1" data-cancel-reservation="${esc(key)}">Cancel Reserve</button>` : ""; return detail + cancel; } },
  ];
  const alertBox = document.getElementById("ops-alert");
  let visibleRows = [];
  const gallery = window.ListGallery?.init({
    root: "#ops-list-root",
    storageKey: `operations-view:${config.module}:${config.page.slug}`,
    title: (row) => get(row, config.page.columns[0]?.data) || config.page.label,
    subtitle: (row) => get(row, config.page.columns[1]?.data) || config.moduleLabel,
    status: (row) => row.status || row.decision || row.matchStatus || row.qualityBucket || "Tanpa Status",
    card: (row) => {
      const key = row[config.page.detailKey] ?? row.id;
      const title = get(row, config.page.columns[0]?.data) || config.page.label;
      const fields = config.page.columns.slice(1, 5).map((column) => `<div><span>${esc(column.label)}</span><strong>${format(get(row, column.data), column.type)}</strong></div>`).join("");
      const categoryQuery = config.purchaseCategory ? `?category=${encodeURIComponent(config.purchaseCategory)}` : "";
      const action = key == null ? "" : `<div class="list-gallery-actions"><a href="/modules/${encodeURIComponent(config.module)}/${encodeURIComponent(config.page.slug)}/${encodeURIComponent(key)}${categoryQuery}">Lihat detail</a></div>`;
      return `<article class="list-gallery-card"><div class="list-gallery-card-head"><div><h3>${esc(title)}</h3><small>${esc(get(row, config.page.columns[1]?.data) || config.moduleLabel)}</small></div>${statusBadge(row.status || row.decision || "Tanpa Status")}</div><div class="list-gallery-meta">${fields}</div>${action}</article>`;
    },
  });

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
    const amount = rows.reduce((sum, row) => sum + number(row.totalAmount), 0);
    const categoryLabels = {
      material: "Total Material",
      "purchase-part": "Total Purchase Part",
      "universal-purchase-part": "Total Universal Part",
      "non-production": "Total Non Produksi",
    };
    setStat(0, categoryLabels[config.purchaseCategory] || "Total Purchase Requisition", num(total), "PR pada kelompok aktif");
    setStat(1, "Menunggu Approval", num(waiting), "Submitted ke Approval Master");
    setStat(2, "Siap ke PO", num(approved), "Approved atau partially ordered");
    setStat(3, "Estimasi Nilai", new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount), "Akumulasi halaman saat ini");
  }
  function updateStats(rows, total) {
    if (config.module === "production") productionStats(rows, total);
    else if (config.module === "inventory") inventoryStats(rows, total);
    else if (config.module === "purchasing" && config.page.slug === "purchase-requisitions") purchaseRequisitionStats(rows, total);
    else supplyChainStats(rows, total);
  }

  const table = new DataTable("#ops-table", {
    processing: true, serverSide: true, searching: true, pageLength: 20, order: [], columns,
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
        success(payload) { visibleRows = payload.data || []; alertBox.classList.add("d-none"); updateStats(visibleRows, payload.recordsTotal || 0); gallery?.setRows(visibleRows); callback(payload); },
        error(xhr) {
          if (xhr.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
          alertBox.textContent = xhr.responseJSON?.message || "Data gagal dimuat."; alertBox.classList.remove("d-none"); updateStats([], 0); gallery?.setRows([]); callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
        },
      });
    },
  });
  let searchTimer;
  document.getElementById("ops-search").addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(() => table.search(this.value).draw(), 250); });
  document.getElementById("ops-refresh").addEventListener("click", () => table.ajax.reload(null, false));
  document.querySelectorAll("select[id^='ops-filter-']").forEach((filter) => filter.addEventListener("change", () => table.draw()));
  document.getElementById("ops-filter-reset")?.addEventListener("click", () => {
    document.querySelectorAll("select[id^='ops-filter-']").forEach((filter) => { filter.value = ""; });
    table.search("").draw();
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
    shared.downloadCsv(`${config.module}-${config.page.slug}-${new Date().toISOString().slice(0, 10)}.csv`, header, values);
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
  loadWarehouseFilter();
})();
