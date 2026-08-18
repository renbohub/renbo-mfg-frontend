(() => {
  "use strict";

  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const config = JSON.parse(document.getElementById("dex-page-config")?.textContent || "{}");
  const $ = (id) => document.getElementById(id);
  const els = {
    month: $("dex-month"), snapshot: $("dex-snapshot"), status: $("dex-status"), severity: $("dex-severity"), type: $("dex-type"), owner: $("dex-owner"), sourceState: $("dex-source-state"), search: $("dex-search"), pageSize: $("dex-page-size"),
    sync: $("dex-sync"), export: $("dex-export"), body: $("dex-body"), alert: $("dex-alert"), title: $("dex-title"), meta: $("dex-result-meta"), range: $("dex-range"), prev: $("dex-prev"), next: $("dex-next"), pageLabel: $("dex-page-label"),
    sourceTitle: $("dex-source-title"), sourceMeta: $("dex-source-meta"), reviewLink: $("dex-review-link"), density: $("dex-density"), queue: document.querySelector(".dex-queue"),
    drawer: $("dex-drawer"), drawerTitle: $("dex-drawer-title"), drawerMeta: $("dex-drawer-meta"), drawerBody: $("dex-drawer-body"), drawerActions: $("dex-drawer-actions"),
    modal: $("dex-modal"), modalForm: $("dex-modal-form"), modalTitle: $("dex-modal-title"), modalDescription: $("dex-modal-description"), modalFields: $("dex-modal-fields"), modalSubmit: $("dex-modal-submit"),
  };
  const state = { page: 1, pageSize: 25, data: null, detail: null, modalHandler: null, loading: false, onlyOverdue: false };
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const num = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const dateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  const label = (value) => String(value || "—").replaceAll("_", " ");
  const apiBase = "/modules/api/planning-ppic/demand-planning/exception-workbench";

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request gagal (${response.status}).`);
    return payload;
  }

  function showAlert(message, success = false) {
    els.alert.hidden = !message;
    els.alert.textContent = message || "";
    els.alert.classList.toggle("success", success);
  }

  function query() {
    const params = new URLSearchParams({ month: els.month.value || config.initialMonth, page: state.page, pageSize: state.pageSize, sourceState: els.sourceState.value });
    if (els.status.value) params.set("status", els.status.value);
    if (els.severity.value) params.set("severity", els.severity.value);
    if (els.type.value) params.set("type", els.type.value);
    if (els.owner.value) params.set("owner", els.owner.value);
    if (els.search.value.trim()) params.set("q", els.search.value.trim());
    if (state.onlyOverdue) params.set("overdue", "true");
    return params;
  }

  function setOptions(select, values, current, placeholder, mapper = (row) => ({ value: row, text: label(row) })) {
    const options = [`<option value="">${esc(placeholder)}</option>`];
    for (const value of values) { const item = mapper(value); options.push(`<option value="${esc(item.value)}">${esc(item.text)}</option>`); }
    select.innerHTML = options.join("");
    select.value = values.some((row) => String(mapper(row).value) === String(current)) ? current : "";
  }

  function syncFilters(data) {
    const currentSnapshot = els.snapshot.value;
    els.snapshot.innerHTML = `<option value="">Current snapshot / live</option>${data.snapshots.map((row) => `<option value="${esc(row.id)}">${esc(row.snapshotNumber)} · ${esc(row.status)}${row.isCurrentRevision ? " · Current" : ""}</option>`).join("")}`;
    els.snapshot.value = data.snapshots.some((row) => row.id === currentSnapshot) ? currentSnapshot : "";
    const currentStatus = els.status.value;
    els.status.innerHTML = `<option value="OPEN_QUEUE">Open queue</option><option value="">Semua status</option>${data.options.statuses.map((row) => `<option value="${row}">${label(row)}</option>`).join("")}`;
    els.status.value = currentStatus === "" || currentStatus === "OPEN_QUEUE" || data.options.statuses.includes(currentStatus) ? currentStatus : "OPEN_QUEUE";
    const currentSeverity = els.severity.value;
    setOptions(els.severity, data.options.severities, currentSeverity, "Semua severity");
    const currentType = els.type.value;
    setOptions(els.type, data.options.types, currentType, "Semua jenis");
    const currentOwner = els.owner.value;
    els.owner.innerHTML = `<option value="">Semua owner</option><option value="UNASSIGNED">Belum ditugaskan</option>${data.users.map((row) => `<option value="${esc(row.id)}">${esc(row.fullName || row.username)} · ${esc(row.username)}</option>`).join("")}`;
    els.owner.value = currentOwner === "UNASSIGNED" || data.users.some((row) => row.id === currentOwner) ? currentOwner : "";
  }

  function rowActions(item) {
    const actions = [`<button type="button" data-detail="${item.id}">Detail</button>`];
    if (["OPEN", "ACKNOWLEDGED"].includes(item.status)) actions.push(`<button class="primary" type="button" data-assign="${item.id}">${item.ownerUserId ? "Edit PIC" : "Assign"}</button>`);
    if (item.status === "IN_PROGRESS") actions.push(`<button class="primary" type="button" data-resolve="${item.id}">Resolve</button>`);
    return actions.join("");
  }

  function renderRows(data) {
    if (!data.items.length) {
      els.body.innerHTML = `<tr><td colspan="7" class="dex-empty"><b>Tidak ada exception pada filter ini.</b><br><small>${data.summary.total ? "Ubah filter untuk melihat kasus lain." : "Klik Sinkronkan Exception untuk membentuk action queue dari Monthly Review."}</small></td></tr>`;
      return;
    }
    els.body.innerHTML = data.items.map((item) => `
      <tr class="${item.sourceActive ? "" : "dex-cleared"}">
        <td><div class="dex-priority"><b>${esc(item.priority)}</b><span class="dex-severity ${esc(item.severity)}">${esc(item.severity)}</span></div></td>
        <td class="dex-case"><a href="#" data-detail="${item.id}">${esc(item.exceptionNumber)}</a><b>${esc(item.title)}</b><small>${esc(label(item.exceptionType))}</small><small class="description">${esc(item.description)}</small><div class="dex-tags">${item.sourceActive ? "" : '<span class="dex-tag">SOURCE CLEARED</span>'}${item.sourceMode ? `<span class="dex-tag">${esc(item.sourceMode)}</span>` : ""}</div></td>
        <td class="dex-demand"><b>${esc(item.partNumber || item.partCode)}</b><small>${esc(item.partName || item.partCode)}</small><small>${esc(item.customerCode || "Customer —")} · ${num(item.demandQty)} ${esc(item.uomCode || "")}</small><small>${esc(item.sourceNumber || "Source —")}${item.phaseNumber ? ` · Phase ${item.phaseNumber}` : ""}</small></td>
        <td class="dex-date"><b>${date(item.targetDeliveryDate)}</b><small>Start: ${date(item.productionLatestStartDate)}</small></td>
        <td class="dex-owner-cell"><b>${esc(item.ownerName || "Belum ditugaskan")}</b><small class="${item.overdue ? "dex-overdue" : ""}">${item.targetResolutionDate ? `SLA ${date(item.targetResolutionDate)}${item.overdue ? " · OVERDUE" : ""}` : "SLA belum ditentukan"}</small></td>
        <td><span class="dex-status ${esc(item.status)}">${esc(label(item.status))}</span></td>
        <td><div class="dex-row-actions">${rowActions(item)}</div></td>
      </tr>`).join("");
  }

  function render(data) {
    state.data = data;
    syncFilters(data);
    renderRows(data);
    const s = data.summary;
    $("dex-kpi-open").textContent = num(s.open); $("dex-kpi-critical").textContent = num(s.critical); $("dex-kpi-overdue").textContent = num(s.overdue); $("dex-kpi-unassigned").textContent = num(s.unassigned); $("dex-kpi-resolved").textContent = num(s.resolved); $("dex-kpi-cleared").textContent = num(s.cleared);
    els.title.textContent = `Antrean ${data.period}`;
    els.meta.textContent = `${num(data.pagination.filtered)} hasil · ${num(s.total)} exception aktif · formula bersumber dari Monthly Review`;
    const start = data.pagination.filtered ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0;
    const end = Math.min(data.pagination.filtered, data.pagination.page * data.pagination.pageSize);
    els.range.textContent = `${start}–${end} dari ${num(data.pagination.filtered)}`;
    els.pageLabel.textContent = `Halaman ${data.pagination.page} / ${data.pagination.pages}`;
    els.prev.disabled = data.pagination.page <= 1; els.next.disabled = data.pagination.page >= data.pagination.pages;
    const current = data.snapshots.find((row) => row.isCurrentRevision);
    els.sourceTitle.textContent = current ? `${current.snapshotNumber} · ${current.status}` : "Live Monthly Review · belum ada snapshot";
    els.sourceMeta.textContent = current ? "Sinkronisasi default memakai current revision; pilih revision lain bila perlu audit historis." : "Belum ada snapshot periode ini. Sinkronisasi tetap dapat memakai formula live Monthly Review.";
    els.reviewLink.href = `/modules/planning-ppic/demand-planning/monthly-review?month=${encodeURIComponent(data.period)}`;
  }

  async function load({ resetPage = false, quiet = false } = {}) {
    if (state.loading) return;
    if (resetPage) state.page = 1;
    state.loading = true;
    if (!quiet) els.body.innerHTML = '<tr><td colspan="7" class="dex-empty">Memuat action queue…</td></tr>';
    try { render(await request(`${apiBase}?${query()}`)); showAlert(""); }
    catch (err) { showAlert(err.message); els.body.innerHTML = `<tr><td colspan="7" class="dex-empty">${esc(err.message)}</td></tr>`; }
    finally { state.loading = false; }
  }

  async function syncExceptions() {
    els.sync.disabled = true; els.sync.textContent = "Menghitung…"; showAlert("");
    try {
      const result = await request(`${apiBase}/sync`, { method: "POST", body: JSON.stringify({ month: els.month.value, snapshotId: els.snapshot.value || null }) });
      showAlert(`${result.detected} exception terdeteksi: ${result.created} baru, ${result.refreshed} diperbarui, ${result.cleared} sudah hilang dari sumber.`, true);
      await load({ resetPage: true, quiet: true });
    } catch (err) { showAlert(err.message); }
    finally { els.sync.disabled = false; els.sync.textContent = "Sinkronkan Exception"; }
  }

  function closeDrawer() { els.drawer.setAttribute("aria-hidden", "true"); state.detail = null; }
  function closeModal() { els.modal.setAttribute("aria-hidden", "true"); state.modalHandler = null; els.modalFields.innerHTML = ""; }
  function openModal({ title, description, submit = "Simpan", fields, handler }) {
    els.modalTitle.textContent = title; els.modalDescription.textContent = description || ""; els.modalSubmit.textContent = submit; els.modalFields.innerHTML = fields; state.modalHandler = handler; els.modal.setAttribute("aria-hidden", "false");
  }
  const field = (name, title, control) => `<label class="dex-field"><span>${esc(title)}</span>${control.replace("{name}", name)}</label>`;

  function assignmentModal(item) {
    const users = state.data?.users || [];
    const optionRows = users.map((row) => ({ ...row, label: `${row.fullName || row.username} · ${row.username}` }));
    const options = `<option value="">Belum ditugaskan</option>${optionRows.map((row) => `<option value="${esc(row.id)}"${row.id === item.ownerUserId ? " selected" : ""}>${esc(row.label)}</option>`).join("")}`;
    openModal({
      title: `Assign ${item.exceptionNumber}`, description: "Cari owner, tentukan target penyelesaian dan priority. Perubahan tersimpan tanpa reload halaman.", submit: "Simpan assignment",
      fields: `${field("ownerSearch", "Cari owner", '<input name="{name}" type="search" placeholder="Ketik nama atau username…" autocomplete="off">')}${field("ownerUserId", "Owner", `<select name="{name}" id="dex-owner-assignment">${options}</select>`)}${field("targetResolutionDate", "Target penyelesaian", `<input name="{name}" type="date" value="${esc(item.targetResolutionDate?.slice(0, 10) || "")}">`)}${field("priority", "Priority", `<select name="{name}">${["P0", "P1", "P2", "P3"].map((p) => `<option${p === item.priority ? " selected" : ""}>${p}</option>`).join("")}</select>`)}${field("note", "Catatan assignment", '<textarea name="{name}" placeholder="Konteks assignment (opsional)"></textarea>')}`,
      handler: async (form) => {
        await request(`${apiBase}/${item.id}/assignment`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        closeModal(); await load({ quiet: true }); if (state.detail?.id === item.id) await openDetail(item.id);
      },
    });
    const search = els.modalForm.elements.ownerSearch, select = $("dex-owner-assignment");
    search.addEventListener("input", () => { const q = search.value.trim().toLowerCase(); select.innerHTML = `<option value="">Belum ditugaskan</option>${optionRows.filter((row) => row.label.toLowerCase().includes(q)).map((row) => `<option value="${esc(row.id)}"${row.id === item.ownerUserId ? " selected" : ""}>${esc(row.label)}</option>`).join("")}`; });
  }

  function resolutionModal(item) {
    openModal({ title: `Resolve ${item.exceptionNumber}`, description: "Resolution harus disertai bukti. Case masih perlu di-close setelah diverifikasi.", submit: "Simpan resolution",
      fields: `${field("resolutionSummary", "Ringkasan penyelesaian", '<textarea name="{name}" required minlength="10" placeholder="Apa yang diperbaiki dan bagaimana dampaknya?"></textarea>')}${field("evidenceNote", "Bukti penyelesaian", '<textarea name="{name}" required minlength="5" placeholder="Nomor dokumen, hasil verifikasi, atau bukti lainnya"></textarea>')}${field("referenceUrl", "Link referensi (opsional)", '<input name="{name}" type="url" placeholder="https://…">')}`,
      handler: async (form) => { await action(item.id, "resolve", Object.fromEntries(new FormData(form))); closeModal(); await openDetail(item.id); },
    });
  }

  function noteModal(item) {
    openModal({ title: `Tambah catatan ${item.exceptionNumber}`, description: "Catatan masuk ke audit trail dan tidak mengubah status.", submit: "Tambah catatan", fields: field("note", "Catatan", '<textarea name="{name}" required minlength="3" placeholder="Tulis update atau keputusan…"></textarea>'), handler: async (form) => { await request(`${apiBase}/${item.id}/notes`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); closeModal(); await openDetail(item.id); } });
  }

  function reopenModal(item) {
    openModal({ title: `Buka kembali ${item.exceptionNumber}`, description: "Status kembali Open dan resolution sebelumnya dikosongkan. Alasan wajib untuk audit.", submit: "Buka kembali", fields: field("reason", "Alasan buka kembali", '<textarea name="{name}" required minlength="10"></textarea>'), handler: async (form) => { await action(item.id, "reopen", Object.fromEntries(new FormData(form))); closeModal(); await openDetail(item.id); } });
  }

  async function action(id, name, payload = {}) {
    await request(`${apiBase}/${id}/${name}`, { method: "POST", body: JSON.stringify(payload) });
    await load({ quiet: true });
  }

  function detailActions(item) {
    const buttons = [`<button type="button" data-drawer-action="assign">Assign / SLA</button>`, `<button type="button" data-drawer-action="note">Tambah catatan</button>`];
    if (item.status === "OPEN") buttons.push('<button class="primary" type="button" data-drawer-action="acknowledge">Acknowledge</button>');
    if (["OPEN", "ACKNOWLEDGED"].includes(item.status)) buttons.push('<button class="primary" type="button" data-drawer-action="start">Mulai kerjakan</button>');
    if (item.status === "IN_PROGRESS") buttons.push('<button class="primary" type="button" data-drawer-action="resolve">Resolve + bukti</button>');
    if (item.status === "RESOLVED") buttons.push('<button class="primary" type="button" data-drawer-action="close">Close case</button>');
    if (["RESOLVED", "CLOSED"].includes(item.status)) buttons.push('<button type="button" data-drawer-action="reopen">Reopen</button>');
    return buttons.join("");
  }

  function renderDetail(item) {
    els.drawerTitle.textContent = item.exceptionNumber; els.drawerMeta.textContent = `${label(item.exceptionType)} · ${item.partNumber || item.partCode}`; els.drawerActions.innerHTML = detailActions(item);
    const recovery = item.recoveryPlan ? `${item.recoveryPlan.status} · Revision ${item.recoveryPlan.revision}` : "Belum ada recovery plan";
    const evidence = item.resolutionEvidence ? JSON.stringify(item.resolutionEvidence, null, 2) : "Belum ada bukti resolution.";
    els.drawerBody.innerHTML = `
      <div class="dex-detail-grid">
        <article><span>Severity / Priority</span><b>${esc(item.severity)} · ${esc(item.priority)}</b></article><article><span>Status</span><b>${esc(label(item.status))}${item.sourceActive ? "" : " · SOURCE CLEARED"}</b></article>
        <article><span>Demand</span><b>${esc(item.partNumber || item.partCode)} · ${num(item.demandQty)} ${esc(item.uomCode || "")}</b></article><article><span>Customer / Source</span><b>${esc(item.customerCode || "—")} · ${esc(item.sourceNumber || "—")}</b></article>
        <article><span>Target delivery</span><b>${date(item.targetDeliveryDate)}</b></article><article><span>Latest production start</span><b>${date(item.productionLatestStartDate)}</b></article>
        <article><span>Owner</span><b>${esc(item.ownerName || "Belum ditugaskan")}</b></article><article><span>Target resolution</span><b class="${item.overdue ? "dex-overdue" : ""}">${date(item.targetResolutionDate)}${item.overdue ? " · OVERDUE" : ""}</b></article>
        <article><span>Snapshot source</span><b>${esc(item.sourceSnapshotNumber || "Live source")}</b></article><article><span>Due-date recovery</span><b>${esc(recovery)}</b></article>
      </div>
      <section class="dex-detail-section"><h3>Masalah yang terdeteksi</h3><p>${esc(item.description)}</p></section>
      <section class="dex-detail-section"><h3>Resolution evidence</h3><pre class="dex-trace">${esc(evidence)}</pre></section>
      <section class="dex-detail-section"><h3>Runtutan formula &amp; data sumber</h3><pre class="dex-trace">${esc(JSON.stringify(item.sourceTrace, null, 2))}</pre></section>
      <section class="dex-detail-section"><h3>Audit trail</h3><ol class="dex-timeline">${item.actions.map((row) => `<li><small>${dateTime(row.createdAt)}</small><div><b>${esc(label(row.action))}</b> · ${esc(row.actor || "system")}<br><small>${esc(row.note || `${label(row.fromStatus)} → ${label(row.toStatus)}`)}</small></div></li>`).join("") || "<li>Belum ada aktivitas.</li>"}</ol></section>`;
  }

  async function openDetail(id) {
    els.drawer.setAttribute("aria-hidden", "false"); els.drawerBody.innerHTML = '<div class="dex-empty">Memuat detail…</div>';
    try { state.detail = await request(`${apiBase}/${encodeURIComponent(id)}`); renderDetail(state.detail); }
    catch (err) { els.drawerBody.innerHTML = `<div class="dex-alert">${esc(err.message)}</div>`; }
  }

  els.body.addEventListener("click", (event) => {
    const detail = event.target.closest("[data-detail]"); if (detail) { event.preventDefault(); openDetail(detail.dataset.detail); return; }
    const assign = event.target.closest("[data-assign]"); if (assign) { const item = state.data.items.find((row) => row.id === assign.dataset.assign); if (item) assignmentModal(item); return; }
    const resolve = event.target.closest("[data-resolve]"); if (resolve) { const item = state.data.items.find((row) => row.id === resolve.dataset.resolve); if (item) resolutionModal(item); }
  });
  els.drawerActions.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-drawer-action]"); const item = state.detail; if (!button || !item) return;
    const name = button.dataset.drawerAction;
    try {
      if (name === "assign") return assignmentModal(item); if (name === "note") return noteModal(item); if (name === "resolve") return resolutionModal(item); if (name === "reopen") return reopenModal(item);
      if (name === "close" && !window.confirm(`Close ${item.exceptionNumber}? Pastikan bukti resolution sudah diverifikasi.`)) return;
      await action(item.id, name); await openDetail(item.id);
    } catch (err) { showAlert(err.message); }
  });
  els.modalForm.addEventListener("submit", async (event) => { event.preventDefault(); if (!state.modalHandler) return; els.modalSubmit.disabled = true; try { await state.modalHandler(els.modalForm); showAlert("Perubahan tersimpan.", true); } catch (err) { showAlert(err.message); } finally { els.modalSubmit.disabled = false; } });
  document.querySelectorAll("[data-close-drawer]").forEach((node) => node.addEventListener("click", closeDrawer)); document.querySelectorAll("[data-close-modal]").forEach((node) => node.addEventListener("click", closeModal));
  els.sync.addEventListener("click", syncExceptions); els.month.addEventListener("change", () => { els.reviewLink.href = `/modules/planning-ppic/demand-planning/monthly-review?month=${encodeURIComponent(els.month.value)}`; load({ resetPage: true }); });
  [els.status, els.severity, els.type, els.owner, els.sourceState, els.pageSize].forEach((node) => node.addEventListener("change", () => { state.pageSize = Number(els.pageSize.value) || 25; state.onlyOverdue = false; document.querySelectorAll("[data-kpi],[data-kpi-severity],[data-kpi-owner],[data-kpi-source]").forEach((x) => x.classList.remove("active")); load({ resetPage: true }); }));
  let searchTimer; els.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => load({ resetPage: true }), 320); });
  els.prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } }); els.next.addEventListener("click", () => { if (state.data && state.page < state.data.pagination.pages) { state.page += 1; load(); } });
  els.density.addEventListener("click", () => { const comfortable = els.queue.classList.toggle("comfortable"); els.density.textContent = comfortable ? "Compact view" : "Comfortable view"; });
  document.querySelectorAll("[data-kpi],[data-kpi-severity],[data-kpi-owner],[data-kpi-source]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-kpi],[data-kpi-severity],[data-kpi-owner],[data-kpi-source]").forEach((x) => x.classList.remove("active")); button.classList.add("active"); state.onlyOverdue = false;
    if (button.dataset.kpi === "OPEN_QUEUE") { els.status.value = "OPEN_QUEUE"; els.sourceState.value = "ACTIVE"; }
    if (button.dataset.kpi === "OVERDUE") { els.status.value = "OPEN_QUEUE"; els.sourceState.value = "ACTIVE"; state.onlyOverdue = true; }
    if (button.dataset.kpi === "RESOLVED") { els.status.value = "RESOLVED"; els.sourceState.value = "ACTIVE"; }
    if (button.dataset.kpiSeverity) els.severity.value = button.dataset.kpiSeverity;
    if (button.dataset.kpiOwner) els.owner.value = button.dataset.kpiOwner;
    if (button.dataset.kpiSource) els.sourceState.value = button.dataset.kpiSource;
    load({ resetPage: true });
  }));
  els.export.addEventListener("click", () => {
    const rows = state.data?.items || []; if (!rows.length) return showAlert("Tidak ada data pada halaman ini untuk diexport.");
    const columns = ["Exception", "Priority", "Severity", "Type", "Part", "Customer", "Qty", "UOM", "Delivery", "Production Start", "Owner", "SLA", "Status", "Source Active"];
    const csv = [columns, ...rows.map((r) => [r.exceptionNumber, r.priority, r.severity, r.exceptionType, r.partNumber || r.partCode, r.customerCode, r.demandQty, r.uomCode, r.targetDeliveryDate, r.productionLatestStartDate, r.ownerName, r.targetResolutionDate, r.status, r.sourceActive])].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `demand-exceptions-${els.month.value}.csv`; link.click(); URL.revokeObjectURL(link.href);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeModal(); closeDrawer(); } });
  load();
})();
