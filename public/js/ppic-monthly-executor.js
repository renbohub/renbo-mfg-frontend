(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) root.MppExecutor = exported;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const qty = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(number(value));
  const dateKey = (value) => String(value || "").slice(0, 10);
  const modeLabel = (value) => value === "VENDOR" ? "Vendor" : "In-house";
  const sourceKey = (source) => source.allocationId || `${source.planNumber}|${source.lineNumber}|${source.mbomProcessId}`;
  const resourceLabel = (item) => [item.machineName || item.vendorName || item.machineCode || item.vendorCode, item.machineName ? item.machineCode : item.vendorName ? item.vendorCode : ""].filter(Boolean).join(" · ");

  function collectSources(child, remaining = [], date = null) {
    const rows = new Map();
    for (const [key, day] of Object.entries(child?.days || {})) {
      if (date && key !== date) continue;
      for (const allocation of day.allocations || []) {
        if (!allocation.allocationId || !allocation.planNumber || allocation.stagedChangeId) continue;
        rows.set(sourceKey(allocation), { ...allocation, qty: number(allocation.qty), scheduleDate: allocation.scheduleDate || key });
      }
    }
    if (!date) for (const candidate of remaining) {
      if (candidate.partCode !== child?.partCode || !candidate.mbomProcessId || !candidate.planNumber || !(number(candidate.remainingQty) > 0)) continue;
      if (child.processCodes?.length && !child.processCodes.includes(candidate.processCode)) continue;
      rows.set(sourceKey(candidate), { ...candidate, allocationId: null, qty: number(candidate.remainingQty), remaining: true });
    }
    return [...rows.values()];
  }

  function validationErrors(context, allocations, reason) {
    const errors = [];
    const total = allocations.reduce((sum, item) => sum + number(item.plannedQty), 0);
    if (!allocations.length) errors.push("Tambahkan minimal satu alokasi pelaksana.");
    if (Math.abs(total - number(context.scope?.qty)) > 0.00001) errors.push(`Total pembagian harus ${qty(context.scope?.qty)} ${context.scope?.uomCode || "PCS"}.`);
    if (context.policy?.allowSplit === false && allocations.length > 1) errors.push("Pembagian qty belum diizinkan pada BOM proses ini.");
    if (!String(reason || "").trim()) errors.push("Isi alasan perubahan untuk riwayat plan.");
    allocations.forEach((item, index) => {
      const label = `Pembagian ${index + 1}`;
      if (!(number(item.plannedQty) > 0)) errors.push(`${label}: qty harus lebih dari 0.`);
      if (!(context.policy?.allowedModes || []).includes(item.routingMode)) errors.push(`${label}: pelaksana belum diizinkan pada BOM.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.scheduleDate || "")) errors.push(`${label}: pilih tanggal produksi atau kirim.`);
      if (item.routingMode === "VENDOR") {
        if (!item.vendorId) errors.push(`${label}: pilih vendor.`);
        if (!item.vendorReturnDate || item.vendorReturnDate < item.scheduleDate) errors.push(`${label}: ETA kembali harus sama atau setelah tanggal kirim.`);
      } else {
        if (!item.machineId) errors.push(`${label}: pilih mesin.`);
        if (!item.shift) errors.push(`${label}: pilih shift.`);
      }
    });
    return errors;
  }

  function makePayload(context, allocations, reason) {
    return {
      ...(context.scope.allocationId ? { allocationId: context.scope.allocationId } : {}),
      lineNumber: context.scope.lineNumber,
      mbomProcessId: context.scope.mbomProcessId,
      reason: String(reason || "").trim(),
      allocations: allocations.map((item) => ({
        routingMode: item.routingMode,
        plannedQty: number(item.plannedQty),
        scheduleDate: item.scheduleDate,
        ...(item.routingMode === "VENDOR"
          ? { vendorId: item.vendorId, vendorSendDate: item.scheduleDate, vendorReturnDate: item.vendorReturnDate }
          : { machineId: item.machineId, diesId: item.diesId || null, shift: item.shift }),
      })),
    };
  }

  function checkStatus(key, check) {
    if (!check) return "";
    if (typeof check === "string") return check;
    if (check.status) return check.status;
    if (key === "sequence" && Array.isArray(check.issues)) return check.issues.some((item) => ["blocking", "overridable"].includes(String(item.severity).toLowerCase())) ? "BLOCKED" : check.issues.length ? "WARNING" : "PASS";
    const ok = check.ok ?? check.ready ?? check.readiness?.ok;
    if (ok === false) return "BLOCKED";
    if (ok === true) return number(check.summary?.warning || check.readiness?.warningCount || check.readiness?.overridableCount) > 0 ? "WARNING" : "PASS";
    return "";
  }

  function qualifiedDies(context, machineId) {
    if (!machineId) return [];
    const ids = new Set((context.machineResources || []).filter((resource) => resource.machineId === machineId).map((resource) => resource.diesId).filter(Boolean));
    return (context.dies || []).filter((dies) => ids.has(dies.id));
  }

  function changeAllocationField(context, allocation, field, value) {
    allocation[field] = value;
    if (field === "machineId") allocation.diesId = "";
    if (allocation.diesId && !qualifiedDies(context, allocation.machineId).some((dies) => dies.id === allocation.diesId)) allocation.diesId = "";
    return allocation;
  }

  function replanPresentation(preview, changeId = null) {
    const pending = Boolean(preview.requiresReplan && (preview.affectedDocuments || []).some((document) => document.blocking));
    const replan = Boolean(preview.requiresReplan || changeId);
    return {
      pending,
      label: pending ? "Simpan Usulan Replan" : replan ? "Terapkan Replan" : "Simpan Perubahan",
      caption: !preview.canApply ? "Selesaikan hambatan di bawah sebelum menyimpan perubahan."
        : pending ? "Usulan Replan akan dicatat. Alokasi resmi tetap sampai dokumen terkait diselesaikan, kemudian lanjutkan Replan melalui riwayat."
          : replan ? "Replan siap diterapkan. Alokasi akan diperbarui dan dokumen draft terkait disinkronkan. Sistem akan menginformasikan dokumen yang perlu diterbitkan ulang."
            : "Pembagian siap disimpan. Alokasi resmi diperiksa kembali saat Simpan.",
    };
  }

  function create({ api, onApplied }) {
    const dialog = document.getElementById("mpp-executor-dialog");
    if (!dialog) return null;
    const $ = (id) => document.getElementById(`mpp-executor-${id}`);
    const state = { sources: [], context: null, allocations: [], preview: null, previewBody: null, request: 0, busy: false, submitted: false, history: [], changeId: null };
    const base = () => `/modules/api/planning-ppic/monthly-production-plans/${encodeURIComponent(state.context?.planNumber || state.sources[Number($("source").value)]?.planNumber || "")}`;
    const message = (text, type = "error") => {
      $("message").textContent = text || "";
      $("message").className = `mpp-executor-message ${type}`;
      $("message").hidden = !text;
    };

    function setBusy(busy) {
      state.busy = busy;
      for (const element of dialog.querySelectorAll("button, input, select, textarea")) element.disabled = busy;
      if (!busy) {
        $("apply").disabled = !state.preview?.canApply || state.submitted;
        $("preview").disabled = !state.context || state.submitted;
        $("add").disabled = !state.context || state.context.policy?.allowSplit === false || state.allocations.length >= 10 || state.submitted;
        $("source").disabled = state.sources.length <= 1 || state.submitted;
        if (state.submitted) for (const field of $("form").querySelectorAll("input, select, textarea, [data-executor-remove]")) field.disabled = true;
        if (state.allocations.length <= 1) $("allocations").querySelector("[data-executor-remove]")?.setAttribute("disabled", "");
      }
      $("preview").textContent = busy ? "Memeriksa…" : "Periksa Perubahan";
    }

    function invalidate() {
      state.request += 1;
      state.preview = null;
      state.previewBody = null;
      $("review").hidden = true;
      $("apply").disabled = true;
      $("apply").textContent = state.changeId ? "Terapkan Replan" : "Simpan Perubahan";
      $("replan-confirm-row").hidden = true;
      $("replan-confirm").checked = false;
      message("");
      updateTotal();
    }

    function updateTotal() {
      const total = state.allocations.reduce((sum, item) => sum + number(item.plannedQty), 0);
      const target = number(state.context?.scope?.qty);
      $("total").innerHTML = `<span>Total pembagian</span><strong>${qty(total)} / ${qty(target)} ${esc(state.context?.scope?.uomCode || "PCS")}</strong>`;
      $("total").classList.toggle("invalid", Math.abs(total - target) > 0.00001);
    }

    function newAllocation(mode, quantity = 0) {
      const context = state.context;
      const source = context.currentAllocations?.[0] || state.sources[Number($("source").value)] || {};
      const scheduleDate = dateKey(source.scheduleDate || source.vendorSendDate || context.periodStart);
      return { routingMode: mode || source.routingMode || context.policy?.defaultMode || "INHOUSE", plannedQty: quantity, machineId: source.machineId || "", diesId: source.diesId || "", vendorId: source.vendorId || "", scheduleDate, shift: String(source.shift || context.shifts?.[0] || "1"), vendorReturnDate: dateKey(source.vendorReturnDate || source.returnDate) || scheduleDate };
    }

    function optionList(rows, value, placeholder, label = resourceLabel) {
      return `<option value="">${esc(placeholder)}</option>${rows.map((item) => `<option value="${esc(item.id)}" ${String(item.id) === String(value) ? "selected" : ""}>${esc(label(item))}</option>`).join("")}`;
    }

    function toolingField(context, item) {
      const tools = qualifiedDies(context, item.machineId);
      if (item.diesId && !tools.some((dies) => dies.id === item.diesId)) item.diesId = "";
      const toolLabel = (dies) => [dies.diesCode || dies.code, dies.diesName || dies.name].filter(Boolean).join(" · ");
      if (!tools.length) return `<label>Dies / tooling<input type="text" readonly value="${item.machineId ? "Mengikuti pengaturan BOM mesin" : "Pilih mesin terlebih dahulu"}"></label>`;
      return `<label>Dies / tooling<select data-executor-field="diesId" data-searchable-disabled>${optionList(tools, item.diesId, `Otomatis sesuai BOM${tools.length === 1 ? ` · ${toolLabel(tools[0])}` : ""}`, toolLabel)}</select><small>Hanya tooling yang diizinkan untuk mesin ini.</small></label>`;
    }

    function renderAllocations() {
      const context = state.context;
      $("allocations").innerHTML = state.allocations.map((item, index) => {
        const vendor = item.routingMode === "VENDOR";
        const resourceRows = vendor ? context.vendors || [] : context.machines || [];
        return `<fieldset class="mpp-executor-allocation" data-executor-index="${index}"><legend>Pembagian ${index + 1}</legend><div class="mpp-executor-allocation-top"><label>Pelaksana<select data-executor-field="routingMode" data-searchable-disabled>${(context.policy?.allowedModes || []).map((mode) => `<option value="${esc(mode)}" ${mode === item.routingMode ? "selected" : ""}>${modeLabel(mode)}</option>`).join("")}</select></label><label>Qty <span>${esc(context.scope.uomCode || "PCS")}</span><input data-executor-field="plannedQty" type="number" min="0.001" step="any" value="${esc(item.plannedQty)}" required></label><button class="mpp-executor-remove" data-executor-remove="${index}" type="button" aria-label="Hapus pembagian ${index + 1}" ${state.allocations.length <= 1 ? "disabled" : ""}>×</button></div><div class="mpp-executor-fields"><label class="resource">${vendor ? "Vendor" : "Mesin"}<select data-executor-field="${vendor ? "vendorId" : "machineId"}" required data-searchable-disabled>${optionList(resourceRows, vendor ? item.vendorId : item.machineId, vendor ? "Pilih vendor" : "Pilih mesin")}</select>${!resourceRows.length ? `<small class="mpp-executor-field-warning">${vendor ? "Vendor proses" : "Mesin yang sesuai"} belum tersedia. Lengkapi master dan BOM.</small>` : ""}</label><label>${vendor ? "Tanggal kirim" : "Tanggal produksi"}<input data-executor-field="scheduleDate" type="date" value="${esc(item.scheduleDate)}" required></label>${vendor ? `<label>ETA kembali<input data-executor-field="vendorReturnDate" type="date" min="${esc(item.scheduleDate)}" value="${esc(item.vendorReturnDate)}" required></label>` : `<label>Shift<select data-executor-field="shift" required data-searchable-disabled>${(context.shifts || ["1", "2", "3"]).map((shift) => `<option value="${esc(shift)}" ${String(shift) === String(item.shift) ? "selected" : ""}>Shift ${esc(shift)}</option>`).join("")}</select></label>${toolingField(context, item)}`}</div></fieldset>`;
      }).join("");
      $("add").disabled = context.policy?.allowSplit === false || state.allocations.length >= 10;
      updateTotal();
    }

    function documentList(rows) {
      return `<ul class="mpp-executor-documents">${rows.map((item) => `<li><b>${item.url && /^\/(?!\/)/.test(item.url) ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.documentNumber || item.number || item.reference || item.id || item.type || "Dokumen terkait")} ↗</a>` : esc(item.documentNumber || item.number || item.reference || item.id || item.type || "Dokumen terkait")}</b><span>${esc([item.documentType || item.type, item.status].filter(Boolean).join(" · "))}</span>${item.message ? `<small>${esc(item.message)}</small>` : ""}</li>`).join("")}</ul>`;
    }

    function renderHistory(rows) {
      state.history = rows;
      $("history-body").innerHTML = rows.length ? `<ol class="mpp-executor-history-list">${rows.map((item) => {
        const proposal = item.newValue?.proposal || {};
        const allocations = item.allocations || proposal.allocations || [];
        return `<li><div><b>${esc(item.status === "PENDING_REPLAN" ? "Menunggu penyelesaian dokumen" : item.status === "APPLIED" ? "Diterapkan" : item.status === "CANCELLED" ? "Usulan dibatalkan" : item.status || "Perubahan pelaksana")}</b><time>${esc(String(item.changedAt || item.createdAt || "").replace("T", " ").slice(0, 16))}</time></div><p>${esc(item.reason || proposal.reason || item.message || "—")}</p>${allocations.length ? `<small>${allocations.map((allocation) => `${modeLabel(allocation.routingMode)} ${qty(allocation.plannedQty ?? allocation.qty)} ${esc(allocation.scheduleDate ? `· ${dateKey(allocation.scheduleDate)}` : "")}`).join(" / ")}</small>` : ""}${item.changedBy || item.createdBy || item.performedBy ? `<small>Oleh ${esc(item.changedBy || item.createdBy || item.performedBy)}</small>` : ""}${item.resolutionNotes ? `<small>${esc(item.resolutionNotes)}</small>` : ""}${item.status === "PENDING_REPLAN" && proposal.allocations?.length ? `<button type="button" class="mpp-outline-button" data-executor-resume="${esc(item.id)}">Lanjutkan Replan</button> <button type="button" class="mpp-outline-button danger" data-executor-cancel-change="${esc(item.id)}">Batalkan Usulan</button>` : ""}</li>`;
      }).join("")}</ol>` : '<p class="mpp-executor-muted">Belum ada perubahan pelaksana pada plan ini.</p>';
    }

    async function loadSource() {
      const request = ++state.request;
      state.context = null;
      state.preview = null;
      state.submitted = false;
      state.changeId = null;
      $("review").hidden = true;
      $("editor").hidden = true;
      $("replan-confirm-row").hidden = true;
      message("Memuat pelaksana dan alternatif BOM…", "info");
      setBusy(true);
      const source = state.sources[Number($("source").value)];
      const query = new URLSearchParams(source.allocationId ? { allocationId: source.allocationId } : { lineNumber: String(source.lineNumber), mbomProcessId: source.mbomProcessId });
      try {
        const context = await api(`${base()}/executor-options?${query}`);
        if (request !== state.request) return;
        state.context = context;
        state.allocations = [newAllocation(context.currentAllocations?.[0]?.routingMode || source.routingMode || context.policy?.defaultMode, number(context.scope.qty))];
        $("identity").innerHTML = `<strong>${esc(context.scope.partCode)} · ${esc(context.scope.partName || "Child part")}</strong><span>${esc(context.scope.processCode)} ${esc(context.scope.processName || "")} · ${esc(context.planNumber)}</span>`;
        $("policy").innerHTML = `<span>Default BOM <b>${modeLabel(context.policy?.defaultMode)}</b></span><span>Diizinkan <b>${(context.policy?.allowedModes || []).map(modeLabel).join(" / ") || "Belum ditentukan"}</b></span><span>Bagi qty <b>${context.policy?.allowSplit === false ? "Belum diizinkan" : "Diizinkan"}</b></span><a href="/modules/manufacturing-bom/bill-of-materials${context.policy?.bomNoReg ? `/${encodeURIComponent(context.policy.bomNoReg)}/edit-table` : ""}" target="_blank" rel="noopener">Pengaturan BOM ↗</a>`;
        $("reason").value = "";
        $("protected").hidden = !context.requiresReplan;
        $("protected").innerHTML = `<strong>Perubahan memerlukan Replan</strong><p>Plan atau dokumen terkait memerlukan Replan. Periksa dampak dan status dokumen sebelum menerapkan perubahan.</p>${documentList(context.affectedDocuments || [])}`;
        $("editor").hidden = false;
        renderAllocations();
        renderHistory(context.history || []);
        const policyMessages = (context.policy?.errors || []).map((item) => typeof item === "string" ? item : item.message || item.code);
        if (context.policy?.allowedModes?.length === 1) policyMessages.push(`Peralihan ke ${context.policy.allowedModes[0] === "VENDOR" ? "in-house" : "vendor"} belum diizinkan. Atur alternatif pelaksana pada BOM proses ini.`);
        message(policyMessages.join("\n"), "warning");
      } catch (error) {
        if (request === state.request) message(error.message);
      } finally {
        if (request === state.request) setBusy(false);
      }
    }

    function renderPreview(preview) {
      const presentation = replanPresentation(preview, state.changeId);
      const statusNames = { PASS: "Siap", OK: "Siap", READY: "Siap", WARNING: "Perlu diperiksa", WARN: "Perlu diperiksa", BLOCKED: "Belum siap", FAIL: "Belum siap", FAILED: "Belum siap" };
      $("review").hidden = false;
      $("checks").innerHTML = [["capacity", "Kapasitas"], ["material", "Material"], ["sequence", "Proses berikutnya"]].map(([key, label]) => {
        const check = preview.checks?.[key];
        const status = checkStatus(key, check);
        const normalized = String(status).toUpperCase();
        return `<article class="${["PASS", "OK", "READY"].includes(normalized) ? "ready" : ["BLOCKED", "FAIL", "FAILED"].includes(normalized) ? "blocked" : "warning"}"><span>${label}</span><strong>${esc(statusNames[normalized] || status || "Lihat hasil pemeriksaan")}</strong>${check?.message ? `<small>${esc(check.message)}</small>` : ""}</article>`;
      }).join("");
      const issues = [...(preview.blockers || []).map((item) => ({ ...item, blocked: true })), ...(preview.warnings || []), ...(preview.checks?.material?.issues || [])];
      const uniqueIssues = [...new Map(issues.map((item) => [`${item.code}|${item.message}`, item])).values()];
      $("issues").innerHTML = uniqueIssues.map((item) => `<li class="${item.blocked ? "blocked" : "warning"}">${esc(item.message || item.code)}</li>`).join("");
      $("review-documents").innerHTML = preview.affectedDocuments?.length ? `<h4>Dokumen terdampak</h4>${documentList(preview.affectedDocuments)}` : "";
      $("replan-confirm-row").hidden = !preview.requiresReplan;
      $("replan-confirm").checked = false;
      $("apply").textContent = presentation.label;
      $("apply").disabled = !preview.canApply;
      $("review-caption").textContent = presentation.caption;
    }

    async function preview() {
      if (!state.context || state.busy || state.submitted) return;
      const errors = validationErrors(state.context, state.allocations, $("reason").value);
      if (errors.length) return message(errors.join("\n"));
      const body = makePayload(state.context, state.allocations, $("reason").value);
      const request = ++state.request;
      state.preview = null;
      state.previewBody = null;
      $("review").hidden = true;
      setBusy(true);
      message("");
      try {
        const result = await api(`${base()}/executor-changes/preview`, { method: "POST", body });
        if (request !== state.request) return;
        state.preview = result;
        state.previewBody = body;
        renderPreview(result);
        $("review").scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (error) {
        if (request === state.request) message(error.message);
      } finally {
        if (request === state.request) setBusy(false);
      }
    }

    async function apply() {
      if (state.busy || state.submitted || !state.preview?.canApply || !state.previewBody) return;
      if (state.preview.requiresReplan && !$("replan-confirm").checked) return message("Centang konfirmasi Replan setelah memeriksa dokumen terdampak.");
      setBusy(true);
      message("");
      try {
        const result = await api(`${base()}/executor-changes`, { method: "POST", body: { ...state.previewBody, previewToken: state.preview.previewToken, replan: Boolean(state.preview.requiresReplan || state.changeId), ...(state.changeId ? { changeId: state.changeId } : {}) } });
        state.submitted = true;
        state.preview = null;
        $("apply").textContent = "Tersimpan";
        $("replan-confirm-row").hidden = true;
        $("review").hidden = true;
        const pending = result.requiresResolution || result.status === "PENDING_REPLAN";
        message(result.message || (pending ? "Usulan Replan tercatat. Selesaikan dokumen terkait lalu Lanjutkan Replan melalui riwayat. Alokasi resmi belum berubah." : "Perubahan pelaksana tersimpan."), pending ? "warning" : "success");
        $("result").hidden = false;
        $("result").innerHTML = `<strong>Status: ${esc(result.status || result.change?.status || "Tersimpan")}</strong>${result.affectedDocuments?.length ? documentList(result.affectedDocuments) : ""}${result.nextActions?.length ? `<ul>${result.nextActions.map((item) => `<li>${esc(typeof item === "string" ? item : item.message || item.action || item.label)}</li>`).join("")}</ul>` : ""}`;
        try { await onApplied?.(state.context.planNumber, result); } catch (refreshError) { message(`${result.message || "Perubahan tersimpan."} Refresh matrix belum berhasil: ${refreshError.message}`, "warning"); }
        await loadHistory();
        if (pending) $("history").open = true;
      } catch (error) {
        state.preview = null;
        state.previewBody = null;
        $("review").hidden = true;
        message(error.message);
      } finally { setBusy(false); }
    }

    async function loadHistory() {
      if (!state.context) return;
      const planNumber = state.context.planNumber;
      try {
        const result = await api(`${base()}/executor-changes`);
        if (state.context?.planNumber !== planNumber) return;
        renderHistory(Array.isArray(result) ? result : result.items || result.data || result.history || []);
      } catch (error) { $("history-body").textContent = error.message; }
    }

    async function cancelChange(id) {
      if (state.busy || !window.confirm("Batalkan usulan Replan ini? Alokasi produksi yang berlaku tetap sama.")) return;
      setBusy(true);
      try {
        const result = await api(`${base()}/executor-changes/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason: "Usulan Replan dibatalkan oleh PPIC." } });
        message(result.message || "Usulan Replan dibatalkan.", "success");
        if (state.changeId === id) {
          state.changeId = null;
          state.submitted = true;
          state.preview = null;
          $("review").hidden = true;
        }
        await loadHistory();
        await onApplied?.(state.context.planNumber, result);
      } catch (error) { message(error.message); }
      finally { setBusy(false); }
    }

    async function resumeChange(id) {
      if (state.busy) return;
      const change = state.history.find((row) => row.id === id);
      const proposal = change?.newValue?.proposal;
      if (!proposal?.allocations?.length) return;
      const planNumber = state.context.planNumber;
      const source = { planNumber, allocationId: proposal.allocationId || null, lineNumber: proposal.lineNumber, mbomProcessId: proposal.mbomProcessId };
      let index = state.sources.findIndex((row) => sourceKey(row) === sourceKey(source));
      if (index < 0) {
        index = state.sources.push(source) - 1;
        $("source").add(new Option(`${planNumber} · Usulan Replan`, String(index)));
      }
      $("source").value = String(index);
      $("result").hidden = true;
      await loadSource();
      if (!state.context) return;
      state.changeId = change.id;
      state.allocations = proposal.allocations.map((item) => ({ ...item, plannedQty: number(item.plannedQty), scheduleDate: dateKey(item.scheduleDate || item.vendorSendDate), vendorReturnDate: dateKey(item.vendorReturnDate), shift: String(item.shift || "1") }));
      $("reason").value = proposal.reason || change.reason || "";
      invalidate();
      renderAllocations();
      setBusy(false);
      message("Usulan Replan dimuat. Periksa kembali kapasitas, material, jadwal, dan status dokumen sebelum menerapkan.", "info");
      $("editor").scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function close() { if (!state.busy) dialog.close(); }
    $("close").addEventListener("click", close);
    $("cancel").addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => { if (state.busy) event.preventDefault(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    $("source").addEventListener("change", loadSource);
    $("preview").addEventListener("click", preview);
    $("apply").addEventListener("click", apply);
    $("form").addEventListener("submit", (event) => { event.preventDefault(); preview(); });
    $("reason").addEventListener("input", invalidate);
    $("add").addEventListener("click", () => {
      if (state.busy || state.context?.policy?.allowSplit === false || state.allocations.length >= 10) return;
      const other = state.context.policy.allowedModes.find((mode) => mode !== state.allocations[0]?.routingMode) || state.context.policy.defaultMode;
      state.allocations.push(newAllocation(other));
      invalidate();
      renderAllocations();
      $("allocations").lastElementChild?.querySelector("input")?.focus();
    });
    $("allocations").addEventListener("input", (event) => {
      const field = event.target.dataset.executorField;
      const index = Number(event.target.closest("[data-executor-index]")?.dataset.executorIndex);
      if (!field || !state.allocations[index]) return;
      changeAllocationField(state.context, state.allocations[index], field, event.target.value);
      invalidate();
      if (field === "routingMode" || field === "machineId") renderAllocations();
      if (field === "scheduleDate") {
        const eta = event.target.closest("fieldset").querySelector('[data-executor-field="vendorReturnDate"]');
        if (eta) eta.min = event.target.value;
      }
    });
    $("allocations").addEventListener("click", (event) => {
      const button = event.target.closest("[data-executor-remove]");
      if (!button || state.allocations.length <= 1 || state.busy) return;
      state.allocations.splice(Number(button.dataset.executorRemove), 1);
      invalidate();
      renderAllocations();
    });
    $("history").addEventListener("toggle", () => { if ($("history").open) loadHistory(); });
    $("history-body").addEventListener("click", (event) => {
      const button = event.target.closest("[data-executor-resume]");
      if (button) resumeChange(button.dataset.executorResume);
      const cancelButton = event.target.closest("[data-executor-cancel-change]");
      if (cancelButton) cancelChange(cancelButton.dataset.executorCancelChange);
    });

    return {
      async open(sources) {
        if (!sources?.length) return;
        state.sources = sources;
        state.submitted = false;
        $("source").innerHTML = sources.map((source, index) => `<option value="${index}">${esc(source.planNumber)} · Batch ${index + 1} · ${esc(source.processCode || "Proses")} · ${source.remaining ? "Sisa belum dialokasikan" : esc(dateKey(source.scheduleDate))} · ${qty(source.qty)} ${esc(source.uomCode || "PCS")}</option>`).join("");
        $("source").value = "0";
        $("identity").textContent = "Pilih pembagian pelaksana per batch dan proses.";
        $("result").hidden = true;
        $("history").open = false;
        $("apply").textContent = "Simpan Perubahan";
        dialog.showModal();
        await loadSource();
      },
    };
  }
  return { collectSources, validationErrors, makePayload, checkStatus, qualifiedDies, changeAllocationField, replanPresentation, create };
});
