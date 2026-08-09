(function () {
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const alertBox = document.getElementById("bom-list-alert");
  const tableView = document.getElementById("bom-table-view");
  const kanbanView = document.getElementById("bom-kanban-view");
  const galleryView = document.getElementById("bom-gallery-view");
  const heatmapView = document.getElementById("bom-heatmap-view");
  const esc = (value) => $("<div>").text(value ?? "").html();
  const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const detailsOf = (row) => Array.isArray(row.details) ? row.details.filter((item) => !item.isDeleted) : [];
  const isExpired = (row) => Boolean(row.expiryDate && new Date(row.expiryDate) < new Date());
  const status = (row) => isExpired(row) ? "Expired" : "Approved";
  let activeView = localStorage.getItem("bom-list-view") || "table";
  let alternateRows = [];

  function actions(row) {
    const key = encodeURIComponent(row.noReg);
    return `<div class="bom-icon-actions"><a title="Detail" href="/modules/manufacturing-bom/bill-of-materials/${key}">⌕</a><a title="Edit via Table" href="/modules/manufacturing-bom/bill-of-materials/${key}/edit-table">☷</a><a title="Edit Canvas" href="/modules/manufacturing-bom/bill-of-materials/${key}/edit">✎</a><button title="Hapus" type="button" data-delete-bom="${esc(row.noReg)}">♲</button></div>`;
  }

  const table = new DataTable("#bom-table", {
    processing: true, serverSide: true, searching: true, pageLength: 10, order: [],
    layout: { topStart: null, topEnd: null, bottomStart: "info", bottomEnd: "paging" },
    language: { processing: "Memuat BOM...", emptyTable: "Belum ada BOM", zeroRecords: "BOM tidak ditemukan", info: "Menampilkan _START_-_END_ dari _TOTAL_ data", infoEmpty: "Menampilkan 0 data", paginate: { previous: "Sebelumnya", next: "Berikutnya" } },
    columnDefs: [{ targets: [0, 4, 8, 9], orderable: false }],
    columns: [
      { data: null, width: "38px", render: () => '<input class="bom-row-check" type="checkbox" aria-label="Pilih BOM">' },
      { data: "noReg", render: (value) => `<a class="bom-code-link" href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(value)}">${esc(value || "—")}</a>` },
      { data: null, name: "part.partCode", render: (_value, renderType, row) => renderType === "display" ? `<span class="bom-parent-item">${esc(row.part?.partCode || "—")} <small>${row.part?.partName ? `(${esc(row.part.partName)})` : ""}</small></span>` : row.part?.partCode || "" },
      { data: null, name: "part.partNumber", render: (_value, renderType, row) => renderType === "display" ? `<span class="bom-muted">${esc(row.part?.partNumber || "—")}</span>` : row.part?.partNumber || "" },
      { data: null, render: (_value, _type, row) => `<span class="bom-type-badge ${detailsOf(row).some((item) => item.category === "inHouse") ? "production" : "standard"}">${detailsOf(row).some((item) => item.category === "inHouse") ? "Production" : "Standard"}</span>` },
      { data: "revision", render: (value, renderType) => renderType === "display" ? `<span class="bom-muted">Rev.${String(value ?? 1).padStart(2, "0")}</span>` : value ?? 0 },
      { data: null, name: "details.length", render: (_value, renderType, row) => renderType === "display" ? `<b>${detailsOf(row).length} Items</b>` : detailsOf(row).length },
      { data: "effectiveDate", render: (value, renderType) => renderType === "display" ? `<span class="bom-muted">${formatDate(value)}</span>` : value || "" },
      { data: null, render: (_value, _type, row) => `<span class="bom-list-status ${isExpired(row) ? "draft" : "active"}">${status(row)}</span>` },
      { data: null, render: (_value, _type, row) => actions(row) }
    ],
    ajax: function (data, callback) {
      $.ajax({ url: "/modules/api/manufacturing-bom/bill-of-materials", data, headers: { Authorization: `Bearer ${token()}` }, success: (payload) => { alertBox.classList.add("d-none"); callback(payload); }, error: (xhr) => { if (xhr.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); alertBox.textContent = xhr.responseJSON?.message || "BOM gagal dimuat."; alertBox.classList.remove("d-none"); callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] }); } });
    }
  });

  function card(row, gallery = false) {
    const detailCount = detailsOf(row).length; const key = encodeURIComponent(row.noReg);
    return `<article class="bom-list-card ${gallery ? "gallery" : ""}"><div class="bom-list-card-top"><span class="bom-type-badge ${detailsOf(row).some((item) => item.category === "inHouse") ? "production" : "standard"}">${detailsOf(row).some((item) => item.category === "inHouse") ? "Production" : "Standard"}</span><span class="bom-list-status ${isExpired(row) ? "draft" : "active"}">${status(row)}</span></div><a class="bom-list-card-code" href="/modules/manufacturing-bom/bill-of-materials/${key}">${esc(row.noReg)}</a><h3>${esc(row.part?.partName || "BOM tanpa nama")}</h3><p>${esc(row.part?.partCode || "—")}</p><div class="bom-list-card-meta"><span>Part No: ${esc(row.part?.partNumber || "—")}</span><span>Rev.${String(row.revision || 1).padStart(2, "0")}</span><span>${detailCount} komponen</span><span>${formatDate(row.effectiveDate)}</span></div>${actions(row)}</article>`;
  }

  function renderAlternate() {
    if (activeView === "kanban") {
      const approved = alternateRows.filter((row) => !isExpired(row)); const expired = alternateRows.filter(isExpired);
      kanbanView.innerHTML = `<div class="bom-kanban-board"><section><header><b>Approved</b><span>${approved.length}</span></header><div>${approved.map((row) => card(row)).join("") || '<p class="bom-empty-column">Belum ada BOM.</p>'}</div></section><section><header><b>Expired</b><span>${expired.length}</span></header><div>${expired.map((row) => card(row)).join("") || '<p class="bom-empty-column">Belum ada BOM.</p>'}</div></section></div>`;
    } else if (activeView === "gallery") {
      galleryView.innerHTML = `<div class="bom-gallery-grid">${alternateRows.map((row) => card(row, true)).join("") || '<p class="bom-empty-column">BOM tidak ditemukan.</p>'}</div>`;
    } else if (activeView === "heatmap") {
      const groups = alternateRows.reduce((result, row) => {
        const key = `${status(row)} · ${detailsOf(row).some((item) => item.category === "inHouse") ? "Production" : "Standard"}`;
        result[key] = (result[key] || 0) + 1;
        return result;
      }, {});
      const max = Math.max(1, ...Object.values(groups));
      heatmapView.innerHTML = `<div class="list-heatmap">${Object.entries(groups).map(([label, count]) => `<article class="heatmap-cell" style="--heat:${count / max}"><div><strong>${count}</strong><small>BOM</small></div><span>${esc(label)}</span><i><b style="width:${Math.round(count / Math.max(alternateRows.length, 1) * 100)}%"></b></i></article>`).join("") || '<div class="list-gallery-empty">BOM tidak ditemukan.</div>'}</div>`;
    }
  }

  async function loadAlternate() {
    const query = document.getElementById("bom-search").value.trim(); const params = new URLSearchParams({ start: "0", length: "500" });
    if (query) params.set("search[value]", query);
    const response = await fetch(`/modules/api/manufacturing-bom/bill-of-materials?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(payload.message || "BOM gagal dimuat.");
    alternateRows = payload.data || []; renderAlternate();
  }

  async function setView(view) {
    activeView = ["table", "kanban", "gallery", "heatmap"].includes(view) ? view : "table"; localStorage.setItem("bom-list-view", activeView);
    document.querySelectorAll("[data-list-view]").forEach((button) => { const active = button.dataset.listView === activeView; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    tableView.classList.toggle("d-none", activeView !== "table"); kanbanView.classList.toggle("d-none", activeView !== "kanban"); galleryView.classList.toggle("d-none", activeView !== "gallery"); heatmapView.classList.toggle("d-none", activeView !== "heatmap");
    if (activeView !== "table") try { await loadAlternate(); } catch (error) { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); }
  }

  let timer; document.getElementById("bom-search").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(() => activeView === "table" ? table.search(this.value).draw() : loadAlternate().catch((error) => { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); }), 250); });
  document.querySelectorAll("[data-list-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.listView)));
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-bom]"); if (!button) return;
    const noReg = button.dataset.deleteBom; if (!confirm(`Hapus ${noReg}?`)) return;
    button.disabled = true;
    try {
      const response = await fetch(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(noReg)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      const payload = await response.json().catch(() => ({})); if (response.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); if (!response.ok) throw new Error(payload.message || "BOM gagal dihapus.");
      table.ajax.reload(null, false); if (activeView !== "table") await loadAlternate();
    } catch (error) { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); button.disabled = false; }
  });
  setView(activeView);
})();
