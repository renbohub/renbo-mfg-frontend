(function () {
  const configNode = document.getElementById("sales-page-config");
  const tableNode = document.getElementById("sales-table");
  if (!configNode || !tableNode) return;

  const config = JSON.parse(configNode.textContent);
  const shared = window.SharedDataTable || {};
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const get = shared.get || ((object, path) => String(path || "").split(".").reduce(
    (value, key) => (value == null ? undefined : value[key]),
    object,
  ));
  const escapeHtml = shared.escapeHtml || ((value) => String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  ));
  const slug = (value) => String(value || "draft")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const search = document.getElementById("sales-search");
  const statusFilter = document.getElementById("sales-status-filter");
  const alertBox = document.getElementById("sales-alert");

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.classList.remove("d-none");
  }

  function clearAlert() {
    alertBox.textContent = "";
    alertBox.classList.add("d-none");
  }

  function format(value, type) {
    if (value == null || value === "") return '<span class="sales-muted-value">-</span>';
    if (type === "date") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? escapeHtml(value)
        : escapeHtml(new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed));
    }
    if (type === "number") {
      return `<span class="sales-number">${escapeHtml(new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value) || 0))}</span>`;
    }
    if (type === "currency") {
      return `<span class="sales-number">${escapeHtml(new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(value) || 0))}</span>`;
    }
    if (type === "status") {
      return `<span class="sales-badge ${escapeHtml(slug(value))}">${escapeHtml(value)}</span>`;
    }
    return escapeHtml(value);
  }

  function detailUrl(row, suffix = "") {
    const key = row?.[config.detailKey];
    return `/modules/sales/${config.slug}/${encodeURIComponent(key)}${suffix}`;
  }

  function icon(name) {
    const paths = {
      edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"></path>',
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
  }

  const gallery = window.ListGallery?.init({
    root: "#sales-list-root",
    storageKey: `sales-view:${config.slug}`,
    title: (row) => get(row, config.columns[0]?.data) || row[config.detailKey],
    subtitle: (row) => row.customerName || row.customerCode || config.description || "-",
    status: (row) => row.status || "Tanpa Status",
    card: (row) => {
      const key = row[config.detailKey];
      const metadata = config.columns.slice(1, 5).map((column) => (
        `<div><span>${escapeHtml(column.label)}</span><strong>${format(get(row, column.data), column.type)}</strong></div>`
      )).join("");
      return `<article class="list-gallery-card">
        <div class="list-gallery-card-head">
          <div><h3>${format(get(row, config.columns[0]?.data), config.columns[0]?.type)}</h3><small>${escapeHtml(row.customerName || row.customerCode || key)}</small></div>
          <span class="view-status-badge">${escapeHtml(row.status || "-")}</span>
        </div>
        <div class="list-gallery-meta">${metadata}</div>
        <div class="list-gallery-actions">
          <a href="${detailUrl(row)}">Lihat detail</a>
          <a href="${detailUrl(row, "/edit")}">Edit</a>
        </div>
      </article>`;
    },
  });

  const columns = config.columns.map((column, index) => ({
    data: null,
    name: column.data,
    render: (_value, renderType, row) => {
      const value = get(row, column.data);
      if (renderType !== "display") return value ?? "";
      if (index === 0) {
        return `<a class="sales-key" href="${detailUrl(row)}">${format(value, column.type)}</a>`;
      }
      return format(value, column.type);
    },
  }));

  columns.push({
    data: null,
    orderable: false,
    searchable: false,
    render: (_value, renderType, row) => {
      if (renderType !== "display") return "";
      return `<div class="row-actions sales-row-actions">
        <a href="${detailUrl(row)}">Lihat</a>
        <a class="sales-icon-action" href="${detailUrl(row, "/edit")}" title="Edit" aria-label="Edit ${escapeHtml(row[config.detailKey])}">${icon("edit")}</a>
        <button class="sales-icon-action" type="button" data-delete="${escapeHtml(row[config.detailKey])}" title="Hapus" aria-label="Hapus ${escapeHtml(row[config.detailKey])}">${icon("trash")}</button>
      </div>`;
    },
  });

  const dataTableDefaults = shared.defaults
    ? shared.defaults({ processing: "Memuat data Sales...", empty: "Belum ada data Sales" })
    : {};
  const table = new DataTable(tableNode, {
    ...dataTableDefaults,
    processing: true,
    serverSide: true,
    searching: true,
    lengthChange: true,
    pageLength: 20,
    lengthMenu: [10, 20, 50, 100],
    order: [],
    columns,
    ajax(data, callback) {
      clearAlert();
      data.status = statusFilter.value;
      $.ajax({
        url: `/modules/api/sales/${config.slug}`,
        data,
        headers: { Authorization: `Bearer ${token()}` },
        success(payload) {
          gallery?.setRows(payload.data);
          callback(payload);
        },
        error(xhr) {
          showAlert(xhr.responseJSON?.message || "Data Sales gagal dimuat.");
          gallery?.setRows([]);
          callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
        },
      });
    },
  });

  let searchTimer;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => table.search(search.value.trim()).draw(), 250);
  });

  statusFilter.addEventListener("change", () => table.ajax.reload());

  tableNode.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button || !confirm(`Hapus ${button.dataset.delete}?`)) return;
    button.disabled = true;
    try {
      const response = await fetch(`/modules/api/sales/${config.slug}/${encodeURIComponent(button.dataset.delete)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Data gagal dihapus.");
      table.ajax.reload(null, false);
    } catch (error) {
      showAlert(error.message);
      button.disabled = false;
    }
  });

  document.getElementById("sales-export").addEventListener("click", async () => {
    const button = document.getElementById("sales-export");
    const params = new URLSearchParams({
      start: "0",
      length: "500",
      q: search.value.trim(),
      status: statusFilter.value,
    });
    button.disabled = true;
    try {
      const response = await fetch(`/modules/api/sales/${config.slug}?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Export gagal.");
      const rows = (payload.data || []).map((row) => config.columns.map((column) => get(row, column.data) ?? ""));
      if (shared.downloadCsv) {
        shared.downloadCsv(`${config.slug}-${new Date().toISOString().slice(0, 10)}.csv`, config.columns.map((column) => column.label), rows);
      }
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });
})();
