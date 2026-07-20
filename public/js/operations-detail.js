(function () {
  const config = JSON.parse(document.getElementById("ops-detail-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 3) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const label = (key) => String(key || "").replace(/Id$/, " ID").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
  const slug = (value) => String(value || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const isDateKey = (key) => /(date|at|month|start|end|expiry)$/i.test(key);
  const format = (value, key = "") => {
    if (value == null || value === "") return "-";
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (isDateKey(key)) { const parsed = new Date(value); if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", ...(String(value).includes("T") ? { timeStyle: "short" } : {}) }).format(parsed); }
    if (typeof value === "number") return num(value);
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const badge = (value) => `<span class="ops-badge ${esc(slug(value))}">${esc(value || "-")}</span>`;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload.data || payload.item || payload;
  }
  function showAlert(message, kind = "danger") { const box = $("ops-detail-alert"); box.textContent = message; box.className = `alert alert-${kind}`; }
  function scalarEntries(object) { return Object.entries(object || {}).filter(([, value]) => value == null || ["string", "number", "boolean"].includes(typeof value)); }
  function renderFields(record) {
    $("ops-detail-fields").innerHTML = scalarEntries(record).map(([key, value]) => `<div><small>${esc(label(key))}</small><strong>${esc(format(value, key))}</strong></div>`).join("") || '<div><small>Informasi</small><strong>Tidak ada field ringkas.</strong></div>';
  }
  function cell(value, key) {
    if (value == null || value === "") return '<span class="ops-muted">-</span>';
    if (typeof value === "object") {
      const summary = scalarEntries(value).slice(0, 2).map(([, nested]) => format(nested)).join(" · ");
      return esc(summary || JSON.stringify(value));
    }
    if (/status|decision|direction/i.test(key)) return badge(value);
    return esc(format(value, key));
  }
  function renderArray(key, rows) {
    const columnKeys = [...new Set(rows.slice(0, 8).flatMap((row) => row && typeof row === "object" ? Object.keys(row).filter((name) => {
      const value = row[name]; return value == null || ["string", "number", "boolean"].includes(typeof value) || (typeof value === "object" && !Array.isArray(value));
    }) : []))].slice(0, 9);
    if (!rows.length) return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>0 baris</span></div><p class="ops-help" style="padding-bottom:16px">Belum ada data terkait.</p></section>`;
    if (!columnKeys.length) return "";
    return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>${num(rows.length, 0)} baris</span></div><div class="table-responsive"><table class="table ops-collection-table"><thead><tr>${columnKeys.map((name) => `<th>${esc(label(name))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columnKeys.map((name) => `<td>${cell(row?.[name], name)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }
  function renderObject(key, object) {
    const entries = scalarEntries(object);
    if (!entries.length) return "";
    return `<section class="ops-detail-card"><div class="ops-collection-head"><h2>${esc(label(key))}</h2><span>Referensi</span></div><div class="ops-detail-fields">${entries.slice(0, 12).map(([name, value]) => `<div><small>${esc(label(name))}</small><strong>${esc(format(value, name))}</strong></div>`).join("")}</div></section>`;
  }
  function renderCollections(record) {
    const html = Object.entries(record || {}).filter(([, value]) => value && typeof value === "object").map(([key, value]) => Array.isArray(value) ? renderArray(key, value) : renderObject(key, value)).join("");
    $("ops-detail-collections").innerHTML = html;
  }
  function renderMeta(record) {
    const keys = ["createdAt", "createdBy", "updatedAt", "updatedBy", "approvedAt", "approvedBy", "releasedAt", "releasedBy"].filter((key) => record[key] != null);
    $("ops-document-meta").innerHTML = (keys.length ? keys : [config.page.detailKey]).map((key) => `<div><span>${esc(label(key))}</span><strong>${esc(format(record[key] ?? config.recordKey, key))}</strong></div>`).join("");
  }
  function actionButton(action, text, style = "outline-primary", note = "") {
    return `<button type="button" class="btn btn-${style}" data-workflow-action="${esc(action)}">${esc(text)}</button>${note ? `<small>${esc(note)}</small>` : ""}`;
  }
  function workflowActions(record) {
    const status = String(record.status || "Draft").toLowerCase();
    let html = "";
    if (config.module === "purchasing" && config.page.slug === "purchase-order") {
      if (/draft|revising/.test(status)) html += actionButton("submit-checking", "Submit Checking PO", "primary", "Masuk ke alur approval Purchase Order.");
      if (status.startsWith("checking by")) html += actionButton("approve", "Approve Tahap Ini", "primary", "Tahap approval mengikuti permission user.");
      if (status === "approved") html += actionButton("send", "Tandai PO Terkirim", "primary");
      if (status === "sent") html += actionButton("confirm", "Konfirmasi Supplier", "primary");
      return html || '<small>Tidak ada transisi Purchase Order yang tersedia pada status ini.</small>';
    }
    if (config.module !== "production") {
      if (config.module === "inventory") return '<small>Inventory menggunakan transaksi sumber untuk menjaga audit trail stok.</small>';
      if (config.module === "incoming") return '<small>Receipt, inspection, dan putaway ditampilkan dari transaksi nyata. Perubahan stok harus melalui proses penerimaan/QC agar audit trail tetap konsisten.</small>';
      if (config.module === "outgoing") return '<small>Delivery dan shipment ditampilkan dari Sales Order serta Delivery Schedule. Penyelesaian pengiriman harus memproses qty delivered dan stock movement.</small>';
      return '<small>Detail dokumen tersedia untuk monitoring.</small>';
    }
    if (config.page.slug === "manufacturing-orders") {
      html += actionButton("availability-check", "Cek Ketersediaan Material", "outline-secondary");
      if (/draft|planned/.test(status)) html += actionButton("release", "Release Manufacturing Order", "primary", "Validasi material dijalankan oleh backend.");
      if (status === "released") {
        html += actionButton("generate-work-orders", "Generate Work Orders", "outline-primary");
        html += actionButton("start", "Mulai Produksi", "primary");
      }
    } else if (config.page.slug === "work-orders" && /planned|released/.test(status)) {
      html += actionButton("start", "Mulai Work Order", "primary");
    } else if (config.page.slug === "daily-production-schedules") {
      if (/draft|planned/.test(status)) html += actionButton("release", "Release Jadwal", "primary");
      if (status === "released") html += actionButton("start", "Mulai Jadwal", "primary");
    } else if (config.page.slug === "production-logs" && /draft|open/.test(status)) {
      html += actionButton("submit", "Submit Production Log", "primary");
    }
    return html || '<small>Tidak ada transisi status yang aman pada kondisi dokumen ini. Detail tetap aktif untuk monitoring.</small>';
  }
  function render(record) {
    const title = record[config.page.detailKey] || config.recordKey;
    const status = record.status || record.decision || (record.isActive == null ? "Active" : record.isActive ? "Active" : "Inactive");
    $("ops-detail-title").textContent = title;
    $("ops-detail-subtitle").textContent = `${config.page.label} · ${config.moduleLabel}`;
    $("ops-detail-status").innerHTML = badge(status);
    renderFields(record); renderCollections(record); renderMeta(record);
    $("ops-workflow-actions").innerHTML = workflowActions(record);
    $("ops-detail-loading").classList.add("d-none"); $("ops-detail-shell").classList.remove("d-none");
  }
  async function load() {
    try {
      const record = await api(`/modules/api/${config.module}/${config.page.slug}/${encodeURIComponent(config.recordKey)}`);
      render(record);
    } catch (error) { $("ops-detail-loading").classList.add("d-none"); showAlert(error.message); }
  }
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-workflow-action]"); if (!button) return;
    const action = button.dataset.workflowAction;
    const isCheck = action === "availability-check";
    if (!isCheck && !confirm(`${button.textContent.trim()} untuk ${config.recordKey}?`)) return;
    button.disabled = true;
    try {
      const workflow = config.module === "purchasing" ? "purchasing-workflow" : "production-workflow";
      const result = await api(`/modules/api/${workflow}/${config.page.slug}/${encodeURIComponent(config.recordKey)}/${action}`, { method: "POST", body: "{}" });
      if (isCheck) {
        let resultBox = document.querySelector(".ops-action-result");
        if (!resultBox) { resultBox = document.createElement("pre"); resultBox.className = "ops-action-result"; $("ops-workflow-actions").appendChild(resultBox); }
        resultBox.textContent = JSON.stringify(result, null, 2);
        showAlert("Pengecekan ketersediaan material selesai.", "success");
      } else { showAlert("Workflow berhasil diproses.", "success"); setTimeout(() => location.reload(), 450); }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  load();
})();
