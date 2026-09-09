(function () {
  const config = JSON.parse(document.getElementById("module-page-config").textContent);
  const shared = window.SharedDataTable;
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const get = (object, path) => path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const escapeHtml = (value) => $("<div>").text(value ?? "").html();
  const alertBox = document.getElementById("module-alert");
  const gallery = window.ListGallery?.init({ root: "#module-list-root", storageKey: `module-view:${config.module}:${config.slug}`, card: (row) => { const title = get(row, config.columns[0]?.data) || config.label; const fields = config.columns.slice(1, 4).map((column) => `<div><span>${escapeHtml(column.label)}</span><strong>${format(get(row, column.data), column.type)}</strong></div>`).join(""); return `<article class="list-gallery-card"><div class="list-gallery-card-head"><div><h3>${escapeHtml(title)}</h3><small>${escapeHtml(row[config.detailKey] ?? row.id ?? "")}</small></div></div><div class="list-gallery-meta">${fields}</div><div class="list-gallery-actions"><button type="button" class="module-detail-button" data-key="${escapeHtml(row[config.detailKey] ?? row.id)}">Lihat detail</button></div></article>`; }});
  const format = (value, type) => {
    if (value == null || value === "") return "-";
    if (type === "date") { const date = new Date(value); return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date); }
    if (type === "number") return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value));
    if (type === "currency") return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
    if (type === "active") return `<span class="status-badge ${value ? "active" : "inactive"}">${value ? "Aktif" : "Nonaktif"}</span>`;
    if (type === "status") { const good = /active|approved|completed|done|passed|closed|released/i.test(String(value)); return `<span class="status-badge ${good ? "active" : "inactive"}">${escapeHtml(value)}</span>`; }
    if (typeof value === "object") return escapeHtml(JSON.stringify(value));
    return escapeHtml(value);
  };
  const columns = [
    ...config.columns.map((column) => ({ data: null, name: column.data, render: (_value, renderType, row) => { const value = get(row, column.data); return renderType === "display" ? format(value, column.type) : value ?? ""; } })),
    { data: null, orderable: false, searchable: false, render: (_value, _type, row) => config.apiReady ? `<button class="module-detail-button" data-key="${escapeHtml(row[config.detailKey] ?? row.id)}">Lihat</button>` : "—" }
  ];
  const table = new DataTable("#module-table", {
    processing: config.apiReady, serverSide: config.apiReady, searching: true, pageLength: 20, order: [], columns,
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: ["pageLength", "paging"] },
    language: { processing: "Memuat data...", emptyTable: config.apiReady ? "Belum ada data" : "Menunggu API backend", zeroRecords: "Data tidak ditemukan", info: "Menampilkan _START_-_END_ dari _TOTAL_ data", infoEmpty: "Menampilkan 0 data", lengthMenu: "_MENU_ / halaman", paginate: { previous: "‹", next: "›" } },
    ajax: config.apiReady ? function (data, callback) {
      $.ajax({ url: `/modules/api/${config.module}/${config.slug}`, data, headers: { Authorization: `Bearer ${token()}` }, success: (payload) => { alertBox.classList.add("d-none"); gallery?.setRows(payload.data); callback(payload); }, error: (xhr) => {
        if (xhr.status === 401) { localStorage.clear(); sessionStorage.clear(); return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); }
        alertBox.textContent = xhr.responseJSON?.message || "Data gagal dimuat."; alertBox.classList.remove("d-none"); callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
      } });
    } : undefined,
    data: config.apiReady ? undefined : []
  });
  let timer;
  document.getElementById("module-search").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(() => table.search(this.value).draw(), 250); });
  document.getElementById("module-table").addEventListener("click", async (event) => {
    const button = event.target.closest(".module-detail-button"); if (!button) return;
    const body = document.getElementById("module-detail-body"); body.innerHTML = '<div class="text-center p-4">Memuat...</div>';
    bootstrap.Modal.getOrCreateInstance(document.getElementById("module-detail-modal")).show();
    const response = await fetch(`/modules/api/${config.module}/${config.slug}/${encodeURIComponent(button.dataset.key)}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { body.innerHTML = `<div class="alert alert-warning">${escapeHtml(payload.message || "Detail gagal dimuat.")}</div>`; return; }
    const record = payload.data || payload.item || payload;
    body.innerHTML = `<div class="module-detail-grid">${Object.entries(record).filter(([, value]) => typeof value !== "object" || value == null).map(([key, value]) => `<div><small>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</small><strong>${format(value, key.toLowerCase().includes("date") ? "date" : "text")}</strong></div>`).join("")}</div>`;
  });
  document.getElementById("module-export").addEventListener("click", async () => {
    if (!config.apiReady) return window.alert("Export tersedia setelah API backend diaktifkan.");
    const query = new URLSearchParams({ start: "0", length: "500", q: document.getElementById("module-search").value });
    const response = await fetch(`/modules/api/${config.module}/${config.slug}?${query}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json(); if (!response.ok) return window.alert(payload.message || "Export gagal.");
    shared.downloadCsv(`${config.slug}-${(globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10)}.csv`, config.columns.map((column) => column.label), payload.data.map((row) => config.columns.map((column) => get(row, column.data) ?? "")));
  });
})();
