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
    && (typeof value !== "string" || value.trim() !== "");

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
    const value = record[field.name];
    if (field.detailLink?.entity && hasValue(value)) {
      return `<a href="/master-data/${encodeURIComponent(field.detailLink.entity)}/${encodeURIComponent(value)}">${esc(String(value))}</a>`;
    }
    return display(value, field.type);
  };

  const labelSection = (name) => name === "Informasi Utama" && config.slug === "parts" ? "Informasi Umum" : name;
  const isPermissionSection = (section) => section === "Transaction Permissions" || section === "Lot Tracking";
  const visibleFields = () => config.fields.filter((field) => !field.hidden && field.type !== "file");

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
      if (field && !selected.includes(field) && hasValue(record[field.name])) selected.push(field);
    });
    fields.forEach((field) => {
      if (selected.length >= 4 || selected.includes(field)) return;
      if (hasValue(record[field.name]) && !isPermissionSection(labelSection(field.section || "Informasi Utama"))) selected.push(field);
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
      if (!isPermissionSection(section) && (!hasValue(record[field.name]) || overviewNames.has(field.name))) return;
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
    .then((record) => {
      if (!record) return;
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
