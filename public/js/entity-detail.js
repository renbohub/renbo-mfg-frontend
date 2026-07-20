(function () {
  const { config, recordKey } = JSON.parse(document.getElementById("entity-config").textContent);
  const content = document.getElementById("detail-content");
  const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => { const node = document.createElement("div"); node.textContent = value; return node.innerHTML; };
  const display = (value, type) => {
    if (value == null || value === "") return "-";
    if (type === "date" || type === "datetime-local") return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", ...(type === "datetime-local" ? { timeStyle: "short" } : {}) }).format(new Date(value));
    if (type === "checkbox") return value ? "Ya" : "Tidak";
    if (type === "number") return new Intl.NumberFormat("id-ID").format(value);
    if (typeof value === "object") return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
    return esc(String(value));
  };
  const displayField = (record, field) => {
    const value = record[field.name];
    if (field.detailLink?.entity && value != null && value !== "") {
      return `<a href="/master-data/${encodeURIComponent(field.detailLink.entity)}/${encodeURIComponent(value)}">${esc(String(value))}</a>`;
    }
    return display(value, field.type);
  };
  const labelSection = (name) => name === "Informasi Utama" && config.slug === "parts" ? "Informasi Umum" : name;
  const renderSections = (record) => {
    const sections = new Map();
    config.fields.filter((field) => field.type !== "file").forEach((field) => {
      const section = labelSection(field.section || "Informasi Utama");
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section).push(field);
    });
    return [...sections.entries()].map(([section, fields]) => {
      const permissionSection = section === "Transaction Permissions" || section === "Lot Tracking";
      const body = permissionSection
        ? `<div class="permission-grid">${fields.map((field) => { const enabled = Boolean(record[field.name]); return `<span class="permission-badge ${enabled ? "enabled" : "disabled"}"><i>${enabled ? "✓" : "×"}</i>${esc(field.label)}</span>`; }).join("")}</div>`
        : `<div class="detail-grid">${fields.map((field) => `<div class="detail-field"><span>${esc(field.label)}</span><strong>${displayField(record, field)}</strong></div>`).join("")}</div>`;
      return `<section class="detail-card"><div class="detail-card-title"><span></span><h2>${esc(section)}</h2></div>${body}</section>`;
    }).join("");
  };
  fetch(`/master-data/api/${config.slug}/${encodeURIComponent(recordKey)}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(async (response) => { const payload = await response.json(); if (response.status === 401) { location.replace("/login?next=" + encodeURIComponent(location.pathname)); return null; } if (!response.ok) throw new Error(payload.message || "Detail gagal dimuat."); return payload; })
    .then((record) => { if (!record) return; document.getElementById("edit-record").href = `/master-data/${config.slug}/${encodeURIComponent(record[config.mutationKey] || record.id)}/edit?key=${encodeURIComponent(record[config.detailKey] || record.id)}`; content.innerHTML = renderSections(record); })
    .catch((error) => { content.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`; });
})();
