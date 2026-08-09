(function () {
  const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  const escapeHtml = (value) => $("<div>").text(value ?? "").html();
  const typeClass = (type = "") => {
    const key = type.toLowerCase();
    if (key.includes("raw")) return "type-blue";
    if (key.includes("manufactured")) return "type-green";
    if (key.includes("finished")) return "type-red";
    if (key.includes("sfg")) return "type-yellow";
    return "type-gray";
  };
  const gallery = window.ListGallery?.init({ root: "#items-list-root", storageKey: "items-view", card: (row) => `<article class="list-gallery-card"><div class="list-gallery-card-head"><div><h3>${escapeHtml(row.name || row.code || "Item")}</h3><small>${escapeHtml(row.code || "-")}</small></div><span class="type-badge ${typeClass(row.type)}">${escapeHtml(row.type || "-")}</span></div><div class="list-gallery-meta"><div><span>Harga</span><strong>${rupiah.format(Number(row.price || 0))}</strong></div><div><span>Stok</span><strong>${escapeHtml(row.stock ?? "-")}</strong></div><div><span>UOM</span><strong>${escapeHtml(row.uom || "-")}</strong></div><div><span>Status</span><strong>${row.active ? "Aktif" : "Non-Aktif"}</strong></div></div><div class="list-gallery-actions"><button type="button">Edit</button></div></article>` });

  const table = new DataTable("#items-table", {
    processing: true,
    serverSide: true,
    searching: true,
    lengthChange: false,
    pageLength: 10,
    ordering: true,
    columnDefs: [{ targets: [0, 8], orderable: false, searchable: false }],
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: "paging" },
    language: { processing: "Memuat data...", emptyTable: "Belum ada data", zeroRecords: "Data tidak ditemukan", info: "Menampilkan _START_-_END_ dari _TOTAL_ data", infoEmpty: "Menampilkan 0 data", paginate: { previous: "‹", next: "›" } },
    ajax: function (data, callback) {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
      $.ajax({
        url: "/master-data/api/items",
        data,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        success: function (payload) { $("#connection-alert").addClass("d-none"); gallery?.setRows(payload.data); callback(payload); },
        error: function (xhr) {
          if (xhr.status === 401) {
            localStorage.removeItem("token"); sessionStorage.removeItem("token");
            localStorage.removeItem("user"); sessionStorage.removeItem("user");
            window.location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
            return;
          }
          const message = xhr.responseJSON?.message || "Tidak dapat mengambil data dari backend.";
          $("#connection-alert").removeClass("d-none").text(message);
          callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
        }
      });
    },
    columns: [
      { data: null, width: "42px", render: () => '<input class="form-check-input" type="checkbox" aria-label="Pilih item">' },
      { data: "code", render: escapeHtml }, { data: "name", render: (v) => `<strong class="item-name">${escapeHtml(v)}</strong>` },
      { data: "type", render: (v) => `<span class="type-badge ${typeClass(v)}">${escapeHtml(v)}</span>` },
      { data: "uom", render: escapeHtml }, { data: "price", className: "text-end", render: (v) => rupiah.format(Number(v || 0)).replace("Rp", "Rp ") },
      { data: "stock", className: "text-center", render: (v) => v == null ? "-" : escapeHtml(v) },
      { data: "active", render: (v) => `<span class="status-badge ${v ? "active" : "inactive"}">${v ? "Aktif" : "Non-Aktif"}</span>` },
      { data: null, width: "82px", render: () => '<div class="row-actions"><button aria-label="Edit"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button><button aria-label="Hapus"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"></path></svg></button></div>' }
    ]
  });

  let timer;
  $("#item-search").on("input", function () { clearTimeout(timer); timer = setTimeout(() => table.search(this.value).draw(), 300); });
  window.addEventListener("master-data:changed", () => table.ajax.reload(null, false));
})();
