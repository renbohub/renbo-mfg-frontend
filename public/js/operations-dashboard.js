(function () {
  const config = JSON.parse(document.getElementById("ops-page-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const get = (object, path) => String(path || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const slug = (value) => String(value || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const statusBadge = (value) => `<span class="ops-badge ${esc(slug(value))}">${esc(value || "-")}</span>`;
  const format = (value, type) => {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
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
    { data: null, orderable: false, searchable: false, render: (_value, _type, row) => { const key = row[config.page.detailKey] ?? row.id; return key == null ? '<span class="ops-muted">—</span>' : `<a class="ops-link" href="/modules/${encodeURIComponent(config.module)}/${encodeURIComponent(config.page.slug)}/${encodeURIComponent(key)}">Lihat detail →</a>`; } },
  ];
  const alertBox = document.getElementById("ops-alert");
  let visibleRows = [];

  function setStat(index, label, value, note) {
    document.getElementById(`ops-stat-label-${index}`).textContent = label;
    document.getElementById(`ops-stat-value-${index}`).textContent = value;
    document.getElementById(`ops-stat-note-${index}`).textContent = note;
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
    const onHand = rows.reduce((sum, row) => sum + number(row.qtyOnHand ?? row.qty ?? row.capacity), 0);
    const available = rows.reduce((sum, row) => sum + number(row.qtyAvailable ?? (row.isActive ? 1 : 0)), 0);
    const reserved = rows.reduce((sum, row) => sum + number(row.qtyReserved ?? Math.max(number(row.qtyOnHand) - number(row.qtyAvailable), 0)), 0);
    const locations = new Set(rows.map((row) => row.warehouseCode || row.rackCode || row.lotNumber).filter(Boolean)).size;
    setStat(0, "Total Record", num(total), "Data inventory terdaftar");
    setStat(1, config.page.slug === "stock-balances" ? "Qty On Hand" : "Kapasitas / Aktif", num(onHand, 3), "Akumulasi halaman saat ini");
    setStat(2, config.page.slug === "stock-balances" ? "Qty Available" : "Record Aktif", num(available, 3), "Siap digunakan");
    setStat(3, config.page.slug === "stock-balances" ? "Qty Reserved" : "Lokasi Unik", num(config.page.slug === "stock-balances" ? reserved : locations, 3), "Ringkasan halaman saat ini");
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
  function updateStats(rows, total) {
    if (config.module === "production") productionStats(rows, total);
    else if (config.module === "inventory") inventoryStats(rows, total);
    else supplyChainStats(rows, total);
  }

  const table = new DataTable("#ops-table", {
    processing: true, serverSide: true, searching: true, pageLength: 20, order: [], columns,
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: ["pageLength", "paging"] },
    language: { processing: "Memuat data operasional...", emptyTable: "Belum ada data", zeroRecords: "Data tidak ditemukan", info: "Menampilkan _START_-_END_ dari _TOTAL_ data", infoEmpty: "Menampilkan 0 data", lengthMenu: "_MENU_ / halaman", paginate: { previous: "‹", next: "›" } },
    ajax(data, callback) {
      $.ajax({
        url: `/modules/api/${config.module}/${config.page.slug}`, data, headers: { Authorization: `Bearer ${token()}` },
        success(payload) { visibleRows = payload.data || []; alertBox.classList.add("d-none"); updateStats(visibleRows, payload.recordsTotal || 0); callback(payload); },
        error(xhr) {
          if (xhr.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
          alertBox.textContent = xhr.responseJSON?.message || "Data gagal dimuat."; alertBox.classList.remove("d-none"); updateStats([], 0); callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
        },
      });
    },
  });
  let searchTimer;
  document.getElementById("ops-search").addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(() => table.search(this.value).draw(), 250); });
  document.getElementById("ops-refresh").addEventListener("click", () => table.ajax.reload(null, false));
  document.getElementById("ops-export").addEventListener("click", () => {
    const header = config.page.columns.map((column) => column.label);
    const values = visibleRows.map((row) => config.page.columns.map((column) => get(row, column.data) ?? ""));
    const csv = [header, ...values].map((row) => row.map((value) => `"${String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${config.module}-${config.page.slug}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  });
})();
