(function () {
  const configNode = document.getElementById("entity-config");
  const content = document.getElementById("detail-content");
  if (!configNode || !content) return;

  const { config, recordKey } = JSON.parse(configNode.textContent);
  const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const titleNode = document.getElementById("master-detail-title");
  const subtitleNode = document.getElementById("master-detail-subtitle");
  const esc = (value) => {
    const node = document.createElement("div");
    node.textContent = value;
    return node.innerHTML;
  };
  const hasValue = (value) => value !== null
    && value !== undefined
    && (typeof value !== "string" || value.trim() !== "")
    && (!Array.isArray(value) || value.length > 0)
    && (Array.isArray(value) || typeof value !== "object" || Object.keys(value).length > 0);
  const valueAt = (object, path) => String(path || "").split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const safeFileUrl = (value) => String(value || "").startsWith("/uploads/") ? String(value) : "";
  const flattenFiles = (value) => (Array.isArray(value) ? value : []).flatMap((entry) => {
    if (Array.isArray(entry?.files)) return entry.files.map((file) => ({ ...file, groupTitle: entry.title || "Lampiran" }));
    return entry && typeof entry === "object" ? [entry] : [];
  });
  const displayFiles = (value, field, record) => {
    const files = flattenFiles(value);
    if (!files.length) {
      const drawingRequired = config.slug === "parts" && field.name === "files" && record?.hasDrawing === true;
      return `<div class="master-file-empty ${drawingRequired ? "is-warning" : ""}"><span aria-hidden="true">${drawingRequired ? "!" : "+"}</span><div><strong>${drawingRequired ? "Drawing wajib, tetapi file belum diunggah" : `Belum ada ${esc(field.label.toLowerCase())}`}</strong><small>Buka Edit Data untuk mengunggah file.</small></div></div>`;
    }
    return `<div class="master-file-list">${files.map((file) => {
      const url = safeFileUrl(file.fileUrl || file.url);
      const name = file.fileName || file.originalName || field.label;
      const image = /^image\//i.test(file.fileType || "") || /\.(png|jpe?g|gif|webp)$/i.test(name);
      const preview = image && url
        ? `<a class="master-file-preview" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Lihat ${esc(name)}"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy"></a>`
        : '<span class="master-file-preview master-file-icon" aria-hidden="true">📎</span>';
      if (!url) return `<article>${preview}<div class="master-file-copy"><strong>${esc(name)}</strong><small>${esc(file.groupTitle || field.label)}</small></div></article>`;
      const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(name)}`;
      return `<article>${preview}<div class="master-file-copy"><strong title="${esc(name)}">${esc(name)}</strong><small>${esc(file.groupTitle || field.label)}</small><div class="master-file-actions"><a href="${esc(url)}" target="_blank" rel="noopener">Lihat</a><a href="${esc(downloadUrl)}" download>Download</a></div></div></article>`;
    }).join("")}</div>`;
  };
  const displayVendorPriceDetails = (value) => {
    if (!Array.isArray(value) || !value.length) return "-";
    return `<div class="master-nested-price-list">${value.map((row) => `<article><div><strong>${esc([row.vendorProcess?.vendorProcessCode, row.vendorProcess?.vendorProcessName].filter(Boolean).join(" · ") || "Proses vendor")}</strong><small>${esc(row.uomCode || "UOM belum dipilih")}</small></div><b>${Number(row.unitPrice || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })}</b><span>MOQ ${Number(row.minimumOrderQty || 0).toLocaleString("id-ID")} · Kelipatan ${Number(row.orderMultipleQty || 0).toLocaleString("id-ID")}</span></article>`).join("")}</div>`;
  };

  const display = (value, type) => {
    if (!hasValue(value)) return "-";
    if (type === "date" || type === "datetime-local") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat("id-ID", {
          dateStyle: "long",
          ...(type === "datetime-local" ? { timeStyle: "short" } : {})
        }).format(parsed);
      }
    }
    if (type === "checkbox") return value ? "Ya" : "Tidak";
    if (type === "number" && Number.isFinite(Number(value))) return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
    if (typeof value === "object") {
      return `<details class="master-json-disclosure"><summary>Lihat data terstruktur</summary><pre>${esc(JSON.stringify(value, null, 2))}</pre></details>`;
    }
    return esc(String(value));
  };

  const displayField = (record, field) => {
    const value = valueAt(record, field.sourcePath || field.name);
    if (field.type === "file") return displayFiles(value, field, record);
    if (field.type === "vendor-price-details") return displayVendorPriceDetails(value);
    if (field.type === "lookup") {
      const labels = record.__lookupLabels?.[field.name];
      if (Array.isArray(labels) && labels.length) return esc(labels.join(", "));
      if (typeof labels === "string" && labels) return esc(labels);
      return hasValue(value) ? esc(`${field.label} tersimpan`) : "-";
    }
    if (field.detailLink?.entity && hasValue(value)) {
      return `<a href="/master-data/${encodeURIComponent(field.detailLink.entity)}/${encodeURIComponent(value)}">${esc(String(value))}</a>`;
    }
    return display(value, field.type);
  };

  const labelSection = (name) => name === "Informasi Utama" && config.slug === "parts" ? "Informasi Umum" : name;
  const isPermissionSection = (section) => section === "Transaction Permissions" || section === "Lot Tracking";
  const visibleFields = () => config.fields.filter((field) => !field.hidden && !field.detailHidden);

  async function resolveLookupLabels(record) {
    const lookups = visibleFields().filter((field) => field.type === "lookup" && hasValue(record[field.name]));
    record.__lookupLabels = {};
    await Promise.all(lookups.map(async (field) => {
      const values = field.multiple ? (Array.isArray(record[field.name]) ? record[field.name] : []) : [record[field.name]];
      const labels = await Promise.all(values.map(async (entry) => {
        const value = typeof entry === "object" ? entry[field.sourceValueKey || field.lookup.valueKey || "id"] : entry;
        if (!hasValue(value)) return "";
        try {
          const response = await fetch(`/lookups/api/${encodeURIComponent(field.lookup.entity)}/resolve/${encodeURIComponent(value)}`, { headers: { Authorization: `Bearer ${token}` } });
          const payload = await response.json();
          return response.ok ? payload.result?.text || "" : "";
        } catch (_error) { return ""; }
      }));
      record.__lookupLabels[field.name] = field.multiple ? labels.filter(Boolean) : labels.find(Boolean) || "";
    }));
  }

  const summaryFields = (record) => {
    const fields = visibleFields();
    const preferredNames = [
      ...(config.columns || []).slice(0, 5).map((column) => column.data),
      config.detailKey,
      "status",
      "isActive"
    ].filter(Boolean);
    const selected = [];
    preferredNames.forEach((name) => {
      const field = fields.find((candidate) => candidate.name === name);
      if (field && !selected.includes(field) && hasValue(valueAt(record, field.sourcePath || field.name))) selected.push(field);
    });
    fields.forEach((field) => {
      if (selected.length >= 4 || selected.includes(field) || field.type === "file") return;
      if (hasValue(valueAt(record, field.sourcePath || field.name)) && !isPermissionSection(labelSection(field.section || "Informasi Utama"))) selected.push(field);
    });
    return selected.slice(0, 4);
  };

  const renderOverview = (record, fields) => {
    if (!fields.length) return "";
    return `<section class="master-detail-overview">${fields.map((field) => `
      <div class="master-overview-item">
        <span>${esc(field.label)}</span>
        <strong>${displayField(record, field)}</strong>
      </div>`).join("")}</section>`;
  };

  const renderSections = (record, overviewFields) => {
    const overviewNames = new Set(overviewFields.map((field) => field.name));
    const sections = new Map();
    visibleFields().forEach((field) => {
      const section = labelSection(field.section || "Informasi Utama");
      const emptyPartFile = config.slug === "parts" && field.type === "file";
      if (!isPermissionSection(section) && ((!hasValue(valueAt(record, field.sourcePath || field.name)) && !emptyPartFile) || overviewNames.has(field.name))) return;
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section).push(field);
    });

    return [...sections.entries()].map(([section, fields], index) => {
      const permissionSection = isPermissionSection(section);
      const body = permissionSection
        ? `<div class="permission-grid">${fields.map((field) => {
          const enabled = Boolean(record[field.name]);
          return `<span class="permission-badge ${enabled ? "enabled" : "disabled"}"><i>${enabled ? "✓" : "×"}</i>${esc(field.label)}</span>`;
        }).join("")}</div>`
        : `<div class="detail-grid">${fields.map((field) => `<div class="detail-field"><span>${esc(field.label)}</span><strong>${displayField(record, field)}</strong></div>`).join("")}</div>`;
      return `<details class="detail-card detail-card-disclosure" ${index === 0 ? "open" : ""}>
        <summary class="detail-card-title"><span></span><h2>${esc(section)}</h2><small>${fields.length} field</small></summary>
        ${body}
      </details>`;
    }).join("");
  };

  const updateHeading = (record) => {
    const fields = visibleFields();
    const identityField = fields.find((field) => field.name === config.detailKey)
      || fields.find((field) => /name|code|number/i.test(field.name) && hasValue(record[field.name]));
    const secondaryField = fields.find((field) => field !== identityField && /name|description/i.test(field.name) && hasValue(record[field.name]));
    const identity = identityField && hasValue(record[identityField.name]) ? String(record[identityField.name]) : String(recordKey);
    titleNode.textContent = identity;
    subtitleNode.textContent = secondaryField ? String(record[secondaryField.name]) : `Detail ${config.singular}`;
  };

  fetch(`/master-data/api/${config.slug}/${encodeURIComponent(recordKey)}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(async (response) => {
      const payload = await response.json();
      if (response.status === 401) {
        location.replace("/login?next=" + encodeURIComponent(location.pathname));
        return null;
      }
      if (!response.ok) throw new Error(payload.message || "Detail gagal dimuat.");
      return payload;
    })
    .then(async (record) => {
      if (!record) return;
      await resolveLookupLabels(record);
      updateHeading(record);
      document.getElementById("edit-record").href = `/master-data/${config.slug}/${encodeURIComponent(record[config.mutationKey] || record.id)}/edit?key=${encodeURIComponent(record[config.detailKey] || record.id)}`;
      const overviewFields = summaryFields(record);
      const sections = renderSections(record, overviewFields);
      content.innerHTML = `${renderOverview(record, overviewFields)}${sections}`;
    })
    .catch((error) => {
      content.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
      subtitleNode.textContent = "Data tidak dapat dimuat";
    });
})();
