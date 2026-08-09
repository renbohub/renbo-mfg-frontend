(function () {
  const config = JSON.parse(document.getElementById("entity-config").textContent);
  const selected = new Set();
  const alertBox = document.getElementById("entity-alert");
  const bulkButton = document.getElementById("bulk-delete");
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const can = (action) => window.ERP_PERMISSIONS?.has?.("master-data", config.slug, action, config.permission || config.slug) !== false;
  const get = (object, path) => path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const esc = (value) => $("<div>").text(value ?? "").html();
  const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "-";
  const formatNumber = (value) => value == null ? "-" : new Intl.NumberFormat("id-ID").format(Number(value));
  const formatCurrency = (value) => value == null ? "-" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
  function isMissing(value) { return value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0); }
  function missingRequired(row) { return (config.fields || []).filter((field) => (field.required || field.requiredOnCreate) && isMissing(get(row, field.name))); }
  function completeness(row) {
    const missing = missingRequired(row);
    if (!missing.length) return '<span class="status-badge active">Lengkap</span>';
    const labels = missing.map((field) => field.label).join(", ");
    return `<span class="status-badge inactive" title="Wajib dilengkapi: ${esc(labels)}">Belum lengkap (${missing.length})</span>`;
  }
  const gallery = window.ListGallery?.init({ root: "#entity-list-root", storageKey: `entity-view:${config.slug}`, card: (row) => { const key = row[config.detailKey] || row.id; const title = get(row, config.columns[0]?.data) || config.singular; const fields = config.columns.slice(1, 4).map((col) => `<div><span>${esc(col.label)}</span><strong>${renderColumn(get(row, col.data), col)}</strong></div>`).join(""); return `<article class="list-gallery-card"><div class="list-gallery-card-head"><div><h3>${esc(title)}</h3><small>${esc(row[config.detailKey] || row.id)}</small></div>${completeness(row)}</div><div class="list-gallery-meta">${fields}</div><div class="list-gallery-actions"><a href="/master-data/${config.slug}/${encodeURIComponent(key)}">Lihat detail</a>${can("update") ? `<a href="/master-data/${config.slug}/${encodeURIComponent(row[config.mutationKey] || row.id)}/edit?key=${encodeURIComponent(key)}">Edit</a>` : ""}</div></article>`; }});

  function handleUnauthorized(xhr) {
    if (xhr.status !== 401) return false;
    localStorage.removeItem("token"); localStorage.removeItem("user"); sessionStorage.removeItem("token"); sessionStorage.removeItem("user");
    location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
    return true;
  }

  function renderValue(value, type) {
    if (type === "status" || type === "active") {
      const active = type === "status" ? value !== true : value === true;
      return `<span class="status-badge ${active ? "active" : "inactive"}">${active ? "Aktif" : "Non-Aktif"}</span>`;
    }
    if (type === "statusText") {
      const active = String(value || "").toLowerCase() === "active";
      return `<span class="status-badge ${active ? "active" : "inactive"}">${esc(value || "-")}</span>`;
    }
    if (type === "boolean") return value ? "Ya" : "Tidak";
    if (type === "date") return formatDate(value);
    if (type === "number") return formatNumber(value);
    if (type === "currency") return formatCurrency(value);
    if (Array.isArray(value)) return esc(value.join(", "));
    if (value && typeof value === "object") return esc(JSON.stringify(value));
    return esc(value == null || value === "" ? "-" : value);
  }

  function renderColumn(value, col) {
    if (col.type === "entityLink") {
      if (value == null || value === "") return "-";
      return `<a href="/master-data/${encodeURIComponent(col.entity)}/${encodeURIComponent(value)}">${esc(value)}</a>`;
    }
    return renderValue(value, col.type);
  }

  const columns = [
    { data: null, orderable: false, searchable: false, width: "42px", render: (_v, _t, row) => `<input class="form-check-input row-select" type="checkbox" value="${esc(row.id)}" ${selected.has(row.id) ? "checked" : ""}>` },
    ...config.columns.map((col) => ({ data: null, name: col.data, render: (_v, renderType, row) => { const value = get(row, col.data); return renderType === "display" ? renderColumn(value, col) : value ?? ""; } })),
    { data: null, orderable: false, searchable: false, width: "142px", render: (_v, _t, row) => completeness(row) },
    { data: null, orderable: false, searchable: false, width: "118px", render: (_v, _t, row) => {
      const key = row[config.detailKey] || row.id;
      const mutationKey = row[config.mutationKey] || row.id;
      return `<div class="row-actions"><a href="/master-data/${config.slug}/${encodeURIComponent(key)}" title="Detail">Lihat</a>${can("update") ? `<a href="/master-data/${config.slug}/${encodeURIComponent(mutationKey)}/edit?key=${encodeURIComponent(key)}" title="Edit"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></a>` : ""}${can("delete") ? `<button class="delete-row" data-id="${esc(mutationKey)}" title="Hapus"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"></path></svg></button>` : ""}</div>`;
    }}
  ];

  const table = new DataTable("#entity-table", {
    processing: true, serverSide: true, searching: true, lengthChange: true, pageLength: 20,
    lengthMenu: [10, 20, 50, 100], order: [], columns,
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: ["pageLength", "paging"] },
    language: { processing: "Memuat data...", emptyTable: "Belum ada data", zeroRecords: "Data tidak ditemukan", info: "Menampilkan _START_-_END_ dari _TOTAL_ data", infoEmpty: "Menampilkan 0 data", lengthMenu: "_MENU_ / halaman", paginate: { previous: "‹", next: "›" } },
    ajax: function (data, callback) {
      data.isDeleted = document.getElementById("deleted-filter").value;
      $.ajax({ url: `/master-data/api/${config.slug}`, data, headers: { Authorization: `Bearer ${token()}` },
        success: (payload) => { alertBox.classList.add("d-none"); gallery?.setRows(payload.data); callback(payload); },
        error: (xhr) => { if (handleUnauthorized(xhr)) return; alertBox.textContent = xhr.responseJSON?.message || "Data gagal dimuat."; alertBox.classList.remove("d-none"); callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] }); }
      });
    },
    drawCallback: () => document.querySelectorAll(".row-select").forEach((box) => box.checked = selected.has(box.value))
  });

  function applyActionPermissions() {
    document.querySelector(`a[href="/master-data/${config.slug}/new"]`)?.classList.toggle("d-none", !can("create"));
    document.getElementById("export-data")?.classList.toggle("d-none", !can("export"));
    document.getElementById("select-all")?.classList.toggle("d-none", !can("delete"));
    if (!can("delete")) bulkButton.classList.add("d-none");
    table.rows().invalidate().draw(false);
  }
  window.addEventListener("erp:permissions-ready", applyActionPermissions);
  applyActionPermissions();

  let searchTimer;
  document.getElementById("entity-search").addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(() => table.search(this.value).draw(), 300); });
  document.getElementById("deleted-filter").addEventListener("change", () => { selected.clear(); syncSelection(); table.ajax.reload(); });
  document.getElementById("select-all").addEventListener("change", function () { document.querySelectorAll(".row-select").forEach((box) => { box.checked = this.checked; this.checked ? selected.add(box.value) : selected.delete(box.value); }); syncSelection(); });
  document.getElementById("entity-table").addEventListener("change", (event) => { if (!event.target.classList.contains("row-select")) return; event.target.checked ? selected.add(event.target.value) : selected.delete(event.target.value); syncSelection(); });
  document.getElementById("entity-table").addEventListener("click", async (event) => { const button = event.target.closest(".delete-row"); if (!button || !confirm(`Hapus ${config.singular.toLowerCase()} ini?`)) return; await removeIds([button.dataset.id], false); });
  bulkButton.addEventListener("click", () => { if (selected.size && confirm(`Hapus ${selected.size} data terpilih?`)) removeIds([...selected], true); });

  function syncSelection() { bulkButton.classList.toggle("d-none", selected.size === 0); }
  async function removeIds(ids, bulk) {
    const url = bulk ? `/master-data/api/${config.slug}/bulk-remove` : `/master-data/api/${config.slug}/${encodeURIComponent(ids[0])}`;
    const response = await fetch(url, { method: bulk ? "POST" : "DELETE", headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json" }, body: bulk ? JSON.stringify({ ids }) : undefined });
    if (response.status === 401) return handleUnauthorized({ status: 401 });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return window.alert(payload.message || "Data gagal dihapus.");
    ids.forEach((id) => selected.delete(id)); syncSelection(); table.ajax.reload(null, false);
  }

  document.getElementById("export-data").addEventListener("click", async () => {
    const query = new URLSearchParams({ start: "0", length: "500", q: document.getElementById("entity-search").value, isDeleted: document.getElementById("deleted-filter").value });
    const response = await fetch(`/master-data/api/${config.slug}?${query}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json(); if (!response.ok) return window.alert(payload.message || "Export gagal.");
    const header = config.columns.map((col) => col.label);
    const lines = [header, ...payload.data.map((row) => config.columns.map((col) => { const value = get(row, col.data); return typeof value === "object" ? JSON.stringify(value) : value ?? ""; }))];
    const csv = lines.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `${config.slug}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  });

  window.addEventListener("master-data:changed", () => table.ajax.reload(null, false));
})();
