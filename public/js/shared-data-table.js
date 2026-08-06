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

  window.SharedDataTable = { number, get, escapeHtml, badge, format, defaults, downloadCsv };
})();
