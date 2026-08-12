(function () {
  const config = JSON.parse(document.getElementById("entity-config").textContent);
  const selected = new Set();
  const alertBox = document.getElementById("entity-alert");
  const bulkButton = document.getElementById("bulk-delete");
  const importableFields = (config.fields || []).filter((field) => !["file", "json"].includes(field.type) && !field.readOnly && !field.generated);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const can = (action) => window.ERP_PERMISSIONS?.has?.("master-data", config.slug, action, config.permission || config.slug) !== false;
  const get = (object, path) => path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const esc = (value) => $("<div>").text(value ?? "").html();
  const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "-";
  const formatNumber = (value) => value == null ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value));
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
    document.getElementById("export-data-xlsx")?.classList.toggle("d-none", !can("export"));
    document.getElementById("export-data-pdf")?.classList.toggle("d-none", !can("export"));
    document.getElementById("download-import-template")?.classList.toggle("d-none", !can("create") || !importableFields.length);
    document.getElementById("open-import-master")?.classList.toggle("d-none", !can("create") || !importableFields.length);
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

  async function fetchExportRows() {
    const query = new URLSearchParams({ start: "0", length: "500", q: document.getElementById("entity-search").value, isDeleted: document.getElementById("deleted-filter").value });
    const response = await fetch(`/master-data/api/${config.slug}?${query}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Data export gagal dimuat.");
    return payload.data || [];
  }
  async function exportMaster(format, button) {
    try {
      const rows = await fetchExportRows();
      const payload = {
        title: config.label,
        subtitle: `Master Data · ${rows.length} baris · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date())}`,
        fileName: `${config.slug}-${new Date().toISOString().slice(0, 10)}`,
        headers: config.columns.map((column) => column.label),
        rows: rows.map((row) => config.columns.map((column) => { const value = get(row, column.data); return value && typeof value === "object" ? "" : value ?? ""; })),
      };
      await window.SharedDataTable.exportTablePayload?.(payload, format, button);
    } catch (error) { window.alert(error.message || "Export gagal."); }
  }
  document.getElementById("export-data-xlsx")?.addEventListener("click", (event) => exportMaster("xlsx", event.currentTarget));
  document.getElementById("export-data-pdf")?.addEventListener("click", (event) => exportMaster("pdf", event.currentTarget));

  function templateField(field) {
    const options = Array.isArray(field.options) ? field.options.map((option) => option.label || option.value).join(" | ") : "";
    const lookupLabel = field.lookup ? `${field.label}: gunakan code/name/number dari Master ${field.lookup.entity}` : "";
    const example = field.defaultValue === "today" ? new Date().toISOString().slice(0, 10)
      : field.type === "checkbox" ? "Ya"
      : field.type === "date" ? "2026-08-12"
      : field.type === "number" ? "0"
      : field.options?.[0]?.value ?? "";
    return { name: field.name, label: field.label, type: field.type || "text", required: Boolean(field.required || field.requiredOnCreate), help: field.help || "", options, lookupLabel, example };
  }
  document.getElementById("download-import-template")?.addEventListener("click", async (event) => {
    await window.SharedDataTable.downloadDocument?.("template", { title: `Template Import ${config.label}`, fileName: `template-import-${config.slug}`, fields: importableFields.map(templateField) }, event.currentTarget);
  });

  const importModalNode = document.getElementById("master-import-modal");
  const importModal = importModalNode ? bootstrap.Modal.getOrCreateInstance(importModalNode) : null;
  let preparedRows = [];
  document.getElementById("open-import-master")?.addEventListener("click", () => importModal?.show());

  const normalized = (value) => String(value ?? "").trim().toLocaleLowerCase("id").replace(/\s+/g, " ");
  async function lookupResolver(field) {
    if (!field.lookup) return null;
    const response = await fetch(`/master-data/api/${field.lookup.entity}?start=0&length=500`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Lookup ${field.label} gagal dimuat.`);
    const candidates = payload.data || [];
    const keys = [...new Set([field.lookup.valueKey, field.lookup.labelKey, ...(field.labelKeys || [])].filter(Boolean))];
    const map = new Map();
    candidates.forEach((row) => [...new Set([...keys, ...Object.keys(row).filter((key) => /(Code|Name|Number|No)$/i.test(key))])].forEach((key) => {
      const value = get(row, key);
      if (value != null && String(value).trim()) map.set(normalized(value), row[field.lookup.valueKey] ?? get(row, field.lookup.valueKey));
    }));
    return map;
  }
  function typedImportValue(value, field) {
    const text = String(value ?? "").trim();
    if (!text) return field.type === "checkbox" ? false : undefined;
    if (field.type === "number") { const result = Number(text.replace(/\./g, "").replace(",", ".")); return Number.isFinite(result) ? result : NaN; }
    if (field.type === "checkbox") return /^(1|true|ya|yes|aktif|active)$/i.test(text);
    if (field.type === "date") { const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10); }
    return text;
  }
  document.getElementById("master-import-preview")?.addEventListener("click", async (event) => {
    const file = document.getElementById("master-import-file")?.files?.[0];
    if (!file) return window.alert("Pilih file Excel terlebih dahulu.");
    const button = event.currentTarget; button.disabled = true; button.textContent = "Membaca...";
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/table-documents/import-preview", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form });
      const preview = await response.json(); if (!response.ok) throw new Error(preview.message || "Preview gagal.");
      const headerMap = new Map(preview.headers.map((header, index) => [normalized(header), index]));
      const fieldColumns = importableFields.map((field) => ({ field, index: headerMap.has(normalized(field.label)) ? headerMap.get(normalized(field.label)) : headerMap.get(normalized(field.name)) }));
      const missingColumns = fieldColumns.filter(({ field, index }) => (field.required || field.requiredOnCreate) && index == null).map(({ field }) => field.label);
      if (missingColumns.length) throw new Error(`Kolom wajib tidak ditemukan: ${missingColumns.join(", ")}`);
      const lookupMaps = new Map();
      for (const { field } of fieldColumns.filter(({ field, index }) => field.lookup && index != null)) lookupMaps.set(field.name, await lookupResolver(field));
      preparedRows = preview.rows.map((source) => {
        const data = {}; const errors = [];
        fieldColumns.forEach(({ field, index }) => {
          if (index == null) return;
          const raw = source.values[index];
          let value = typedImportValue(raw, field);
          if (field.lookup && String(raw ?? "").trim()) {
            value = lookupMaps.get(field.name)?.get(normalized(raw));
            if (value == null) errors.push(`${field.label}: '${raw}' tidak ditemukan`);
          }
          if (field.type === "number" && Number.isNaN(value)) errors.push(`${field.label}: bukan angka`);
          if (field.type === "date" && raw && !value) errors.push(`${field.label}: tanggal tidak valid`);
          if ((field.required || field.requiredOnCreate) && (value == null || value === "")) errors.push(`${field.label}: wajib diisi`);
          if (value !== undefined && !Number.isNaN(value)) data[field.name] = value;
        });
        return { rowNumber: source.rowNumber, data, errors };
      });
      const valid = preparedRows.filter((row) => !row.errors.length).length;
      document.getElementById("master-import-summary").innerHTML = `<div class="alert ${valid === preparedRows.length ? "alert-success" : "alert-warning"}"><strong>${valid} valid</strong> dari ${preparedRows.length} baris · ${preparedRows.length - valid} perlu diperbaiki.</div>`;
      document.getElementById("master-import-head").innerHTML = `<tr><th>Baris</th><th>Status</th><th>Identitas</th><th>Catatan Validasi</th></tr>`;
      document.getElementById("master-import-body").innerHTML = preparedRows.slice(0, 200).map((row) => `<tr><td>${row.rowNumber}</td><td><span class="status-badge ${row.errors.length ? "inactive" : "active"}">${row.errors.length ? "Error" : "Valid"}</span></td><td>${esc(Object.values(row.data).filter((value) => value != null).slice(0, 3).join(" · "))}</td><td>${esc(row.errors.join("; ") || "Siap diimpor")}</td></tr>`).join("");
      document.getElementById("master-import-submit").disabled = valid === 0;
    } catch (error) { window.alert(error.message || "Preview gagal."); }
    finally { button.disabled = false; button.textContent = "Preview & Validasi"; }
  });
  document.getElementById("master-import-submit")?.addEventListener("click", async (event) => {
    const validRows = preparedRows.filter((row) => !row.errors.length);
    if (!validRows.length || !confirm(`Import ${validRows.length} baris valid ke ${config.label}?`)) return;
    const button = event.currentTarget; button.disabled = true;
    let success = 0; const failures = [];
    for (const [index, row] of validRows.entries()) {
      button.textContent = `Import ${index + 1}/${validRows.length}`;
      const response = await fetch(`/master-data/api/${config.slug}`, { method: "POST", headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json" }, body: JSON.stringify(row.data) });
      if (response.ok) success += 1;
      else { const payload = await response.json().catch(() => ({})); failures.push(`Baris ${row.rowNumber}: ${payload.message || "gagal"}`); }
    }
    button.textContent = "Import Baris Valid"; button.disabled = false;
    window.alert(`${success} baris berhasil.${failures.length ? `\n${failures.length} gagal:\n${failures.slice(0, 10).join("\n")}` : ""}`);
    if (success) { importModal?.hide(); table.ajax.reload(); }
  });

  window.addEventListener("master-data:changed", () => table.ajax.reload(null, false));
})();
