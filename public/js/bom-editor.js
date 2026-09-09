(function () {
  const config = JSON.parse(document.getElementById("bom-editor-config").textContent);
  const editable = config.mode !== "view";
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const state = { inspectorTab: "part", suppliers: [], vendors: [], vendorProcesses: [], vendorPrices: [], machineCostRates: [], partPrices: [], materialPrices: [], currencies: [], omittedNodes: [], parts: [], materials: [], materialForms: [], customers: [], uoms: [], processMaster: [], machines: [], dies: [], numberingRules: new Map(), boms: [], drafts: [], bomByPartId: new Map(), expandedBoms: new Set(), nodes: [], selectedId: null, scale: 1, rootX: 990, rootY: 42, canvasWidth: 2200, canvasHeight: 1400, recordId: "", noReg: config.recordKey || "", quickPartKind: "child", quickInsertBefore: null, pendingSequenceShift: null, sequenceInsertionPolicy: { locked: false, strategy: "SHIFT_MAIN_SEQUENCE", usage: {} }, pendingPartCounter: 0, draftId: config.mode === "draft" ? config.recordKey : "", draftUpdatedAt: "", draftAutosaveTimer: null, draftSaving: false, draftDirty: false, approving: false };
  const canvas = document.getElementById("bom-canvas");
  const viewport = document.getElementById("bom-canvas-viewport");
  const alertBox = document.getElementById("bom-alert");
  const inspectorForm = document.getElementById("bom-inspector-form");
  const rootPart = document.getElementById("bom-root-part");
  const rootUom = document.getElementById("bom-root-uom");
  const partById = (id) => state.parts.find((part) => part.id === id) || state.nodes.find((node) => node.partId === id && node.part?.id === id)?.part || {};
  const nodeKey = (node) => node?.id || node?.clientKey;
  const selectedNode = () => state.nodes.find((node) => nodeKey(node) === state.selectedId);
  const createKey = () => `node_${window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now() + "_" + Math.random().toString(16).slice(2)}`;
  const authHeaders = (json = false) => ({ Authorization: `Bearer ${token()}`, ...(json ? { "content-type": "application/json" } : {}) });
  const escapeHtml = (value) => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
  const isNewBomMode = () => config.mode === "create" || config.mode === "draft";
  const partMasterCache = new Map();
  const partDetailReads = new Map();
  let nextPartPageStart = 500; let partMasterTotal = 500; let partPageRead = null;

  const commercial = window.BomCommercial.create({ getState: () => state, getDate: () => document.getElementById("bom-effective")?.value || (globalThis.erpBusinessNow?.() || new Date()) });
  const panels = window.BomCanvasPanels.create({ getState: () => state, partById, commercial, getRootPartId: () => rootPart.value });
  if (!editable) document.querySelector(".bom-editor-page").classList.add("bom-view-mode");

  function showError(message) { alertBox.textContent = message; alertBox.classList.remove("d-none"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function clearError() { alertBox.classList.add("d-none"); }
  function optionLabel(part) { return [part.partCode || part.partNumber, part.partName].filter(Boolean).join(" — ") || "Part tanpa nama"; }
  function refreshLookupLabels(scope = document) {
    if (!window.jQuery) return;
    scope.querySelectorAll("select.select2-hidden-accessible").forEach((select) => window.jQuery(select).trigger("change.select2"));
  }
  function setOptions(select, items, valueKey, label, placeholder) {
    const current = select.value; const selected = Array.from(select.options || []).find((option) => option.value === current);
    select.innerHTML = `<option value="">${placeholder}</option>`;
    items.forEach((item) => { const option = document.createElement("option"); option.value = item[valueKey] ?? ""; option.textContent = label(item); select.appendChild(option); });
    if (current && !items.some((item) => String(item[valueKey]) === current) && selected) select.appendChild(selected);
    select.value = current;
  }

  function rememberReferencedPart(part) {
    if (!part?.id) return null;
    const existing = state.parts.find((item) => item.id === part.id);
    const resolved = existing?.isPending ? existing : Object.assign(existing || {}, partMasterCache.get(part.id) || {}, part);
    if (!existing) state.parts.push(resolved);
    partMasterCache.set(part.id, resolved);
    return resolved;
  }

  function refreshPartOptions() {
    setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama");
    setOptions(document.getElementById("node-part"), state.parts, "id", optionLabel, "Pilih part");
    refreshLookupLabels();
  }

  async function hydratePartReferences(ids, embeddedParts = []) {
    embeddedParts.filter(Boolean).forEach(rememberReferencedPart);
    const required = [...new Set(ids.filter(Boolean))];
    const unresolved = () => required.filter((id) => !state.parts.some((part) => part.id === id));
    unresolved().forEach((id) => { if (partMasterCache.has(id)) rememberReferencedPart(partMasterCache.get(id)); });
    // Legacy drafts store UUIDs only; the part detail endpoint resolves codes, so
    // read additional pages only until these saved references have been found.
    while (unresolved().length && nextPartPageStart < partMasterTotal) {
      if (!partPageRead) {
        const start = nextPartPageStart;
        partPageRead = fetchJson(`/master-data/api/parts?start=${start}&length=500&isDeleted=false`).then((payload) => {
          const parts = payload.data || payload.items || [];
          parts.forEach((part) => partMasterCache.set(part.id, part));
          partMasterTotal = Number(payload.recordsTotal ?? payload.total ?? partMasterTotal);
          nextPartPageStart = parts.length ? start + 500 : partMasterTotal;
        }).finally(() => { partPageRead = null; });
      }
      await partPageRead;
      unresolved().forEach((id) => { if (partMasterCache.has(id)) rememberReferencedPart(partMasterCache.get(id)); });
    }
    if (unresolved().length) throw new Error(`Master part referensi belum ditemukan: ${unresolved().join(", ")}. Periksa master sebelum menyimpan BOM.`);
    refreshPartOptions();
  }

  async function hydrateRecordParts(record) {
    const details = (record.details || []).filter((detail) => detail.isDeleted !== true);
    await hydratePartReferences([record.partId, ...details.map((detail) => detail.partId)], [record.part, ...details.map((detail) => detail.part)]);
  }

  async function hydrateLookupPart(select, item) {
    const id = String(item?.id || select.value || "");
    if (!id) return null;
    let part = state.parts.find((entry) => entry.id === id);
    if (!part) {
      const code = item?.code || item?.partCode || item?.data?.partCode;
      if (code) {
        if (!partDetailReads.has(id)) partDetailReads.set(id, fetchJson(`/master-data/api/parts/${encodeURIComponent(code)}`).finally(() => partDetailReads.delete(id)));
        const loaded = await partDetailReads.get(id);
        if (String(loaded.id) !== id) throw new Error("Part terpilih berubah. Pilih ulang part dari master.");
        part = rememberReferencedPart(loaded);
      } else {
        await hydratePartReferences([id]);
        part = state.parts.find((entry) => entry.id === id);
      }
    }
    if (String(select.value) !== id) return null;
    refreshPartOptions();
    const option = Array.from(select.options || []).find((entry) => entry.value === id);
    if (option) { option.textContent = optionLabel(part); option._enterpriseLookupData = part; }
    return part;
  }

  function bindPartLookupHydration() {
    if (!window.jQuery) return;
    window.jQuery(document).on("select2:select.bomPartHydration", "#bom-root-part, #node-part, #quick-existing-part", async function (event) {
      try {
        if (await hydrateLookupPart(this, event.params?.data)) this.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (error) { showError(`Master part gagal dimuat: ${error.message}`); }
    });
  }
  function dateInput(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
  function partVisualClass(part = {}) {
    if (part.itemType === "FG") return "bom-part-fg";
    if (part.itemType === "WIP") return "bom-part-wip";
    if (part.itemType === "RAW" && part.rawType === "PURCHASE_PART") return "bom-part-purchase";
    if (part.itemType === "RAW" && part.rawType === "MATERIAL") return "bom-part-material";
    return "bom-part-default";
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: authHeaders() });
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Data gagal dimuat."); return payload;
  }

  async function initialize() {
    try {
      const [partsPayload, materialPayload, materialFormPayload, customerPayload, uomPayload, bomPayload, processPayload, machinePayload, numberingPayload, draftPayload, diesPayload] = await Promise.all([
        fetchJson("/master-data/api/parts?start=0&length=500&isDeleted=false"),
        fetchJson("/master-data/api/materials?start=0&length=500&isDeleted=false"),
        fetchJson("/master-data/api/material-forms?start=0&length=100&isDeleted=false"),
        fetchJson("/master-data/api/customers?start=0&length=500&isDeleted=false"),
        fetchJson("/master-data/api/uom?start=0&length=500&isDeleted=false"),
        fetchJson("/modules/api/manufacturing-bom/bill-of-materials?start=0&length=500&includeDetails=false"),
        fetchJson("/master-data/api/processes?start=0&length=500&isDeleted=false"),
        fetchJson("/master-data/api/machines?start=0&length=500&isDeleted=false"),
        fetchJson("/master-data/api/numbering-rules?start=0&length=500&isDeleted=false"),
        editable ? fetchJson("/modules/api/manufacturing-bom/bill-of-materials/drafts") : Promise.resolve({ data: [] }),
        fetchJson("/master-data/api/dies?start=0&length=500&isDeleted=false").catch(() => ({ data: [] }))
      ]);
      const commercialKeys = ["suppliers", "vendors", "vendorProcesses", "vendorPrices", "machineCostRates", "partPrices", "materialPrices", "currencies"];
      const commercialSlugs = ["suppliers", "vendors", "vendor-processes", "vendor-price-lists", "machine-cost-rates", "part-price-lists", "material-price-lists", "currencies"];
      const masterResults = await Promise.all(commercialSlugs.map((slug) => fetchJson(`/master-data/api/${slug}?start=0&length=500&isDeleted=false`).catch(() => ({ data: [] }))));
      commercialKeys.forEach((key, index) => state[key] = masterResults[index].data || masterResults[index].items || []);
      state.parts = (partsPayload.data || []).filter((part) => part.canUseInBom !== false);
      (partsPayload.data || []).forEach((part) => partMasterCache.set(part.id, part));
      partMasterTotal = Number(partsPayload.recordsTotal ?? partsPayload.total ?? (partsPayload.data || []).length);
      state.materials = materialPayload.data || [];
      state.materialForms = materialFormPayload.data || [];
      state.customers = customerPayload.data || [];
      state.uoms = uomPayload.data || [];
      state.processMaster = processPayload.data || [];
      state.machines = machinePayload.data || [];
      state.dies = diesPayload.data || [];
      state.numberingRules = new Map((numberingPayload.data || []).map((rule) => [rule.ruleKey, rule]));
      state.boms = bomPayload.data || [];
      state.drafts = draftPayload.data || [];
      state.bomByPartId = new Map(state.boms.filter((bom) => bom.partId).map((bom) => [bom.partId, bom]));
      setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama");
      setOptions(document.getElementById("node-part"), state.parts, "id", optionLabel, "Pilih part");
      setOptions(rootUom, state.uoms, "uomCode", (item) => `${item.uomCode} — ${item.uomName || item.uomCode}`, "Pilih UOM");
      setOptions(document.getElementById("node-uom"), state.uoms, "uomCode", (item) => `${item.uomCode} — ${item.uomName || item.uomCode}`, "Pilih UOM");
      setOptions(document.getElementById("quick-part-uom"), state.uoms, "uomCode", (item) => `${item.uomCode} — ${item.uomName || item.uomCode}`, "Pilih UOM");
      setOptions(document.getElementById("quick-customer-code"), state.customers, "customerCode", (item) => `${item.customerCode} — ${item.customerName || item.customerCode}`, "Pilih customer");
      setOptions(document.getElementById("quick-material-id"), state.materials, "id", (item) => `${item.materialCode} — ${item.materialName || item.spec || item.materialCode}`, "Pilih master material");
      setOptions(document.getElementById("node-material-form"), state.materialForms, "id", (item) => `${item.symbol} · ${item.formName}`, "Pilih form");
      setOptions(document.getElementById("node-material-alt-form"), state.materialForms, "id", (item) => `${item.symbol} · ${item.formName}`, "Tidak digunakan");
      renderRecentBoms(state.boms.slice(0, 10));
      renderRecentDrafts(state.drafts.slice(0, 10));
      renderPalette();
      bindPartLookupHydration();
      if (config.mode === "draft") await loadDraft(); else if (config.mode !== "create") await loadRecord(); else {
        const requestedPartCode = new URLSearchParams(location.search).get("partCode");
        let requestedPart = state.parts.find((part) => String(part.partCode) === String(requestedPartCode));
        if (requestedPartCode && !requestedPart) { requestedPart = rememberReferencedPart(await fetchJson(`/master-data/api/parts/${encodeURIComponent(requestedPartCode)}`)); refreshPartOptions(); }
        if (requestedPart) {
          rootPart.value = requestedPart.id;
          rootUom.value = requestedPart.productionUomCode || requestedPart.baseUomCode || "";
          document.getElementById("bom-page-title").textContent = `BOM Baru · ${requestedPart.partCode}`;
        }
        renderRoot(); autoLayout(); fitCanvas();
      }
    } catch (error) { showError(error.message); }
  }

  function renderRecentBoms(items) {
    const target = document.getElementById("bom-recent-list");
    target.innerHTML = items.length ? items.map((item) => { const expired = item.expiryDate && new Date(item.expiryDate) < (globalThis.erpBusinessNow?.() || new Date()); return `<a href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(item.noReg)}/edit"><b>${escapeHtml(item.noReg || "—")}</b><small>${escapeHtml(item.part?.partName || item.part?.partCode || "BOM")}</small><span class="${expired ? "draft" : "active"}">${expired ? "Expired" : "Approved"}</span></a>`; }).join("") : '<div class="bom-panel-empty">Belum ada BOM.</div>';
  }

  function renderRecentDrafts(items) {
    const target = document.getElementById("bom-draft-list"); if (!target) return;
    target.innerHTML = items.length ? items.map((item) => { const root = item.payload?.pendingParts?.find((part) => part.id === item.payload?.header?.rootPartId); return `<a href="/modules/manufacturing-bom/bill-of-materials/drafts/${encodeURIComponent(item.id)}/edit"><b>${escapeHtml(item.draftNumber)}</b><small>${escapeHtml(root?.partName || "Draft canvas")}</small><span class="draft">Draft</span></a>`; }).join("") : '<div class="bom-panel-empty">Belum ada draft.</div>';
  }

  async function loadRecord() {
    const record = await fetchJson(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(config.recordKey)}`);
    await hydrateRecordParts(record);
    state.recordId = record.id; state.noReg = record.noReg;
    state.sequenceInsertionPolicy = record.sequenceInsertionPolicy || state.sequenceInsertionPolicy;
    rootPart.value = record.partId || ""; rootUom.value = record.uomCode || "";
    document.getElementById("bom-revision").value = record.revision || 1;
    document.getElementById("bom-effective").value = dateInput(record.effectiveDate);
    document.getElementById("bom-expiry").value = dateInput(record.expiryDate);
    document.getElementById("bom-notes").value = record.notes || "";
    state.revisionPolicy = record.revisionPolicy;
    if (config.mode === "edit") {
      const policy = state.revisionPolicy;
      document.getElementById("bom-save").disabled = !policy || !policy.isLatest;
      if (!policy) throw new Error("Status pemakaian produksi belum tersedia. Muat ulang sebelum menyimpan.");
      rootPart.disabled = true;
      const mode = document.getElementById("bom-revision-mode");
      mode.replaceChildren(new Option(policy.mode === "newRevision" ? `Otomatis: revisi baru ${policy.nextRevision}` : `Otomatis: tetap revisi ${record.revision || 1}`, policy.mode));
      mode.disabled = true;
      document.getElementById("bom-revision-policy-note").textContent = policy.isLatest ? policy.reason : `Revisi historis hanya untuk dilihat. Buka ${policy.latestNoReg} untuk mengedit.`;
      document.getElementById("bom-revision-note").required = policy.mode === "newRevision";
      if (policy.mode === "newRevision") {
        document.getElementById("bom-effective").value = policy.nextEffectiveDate;
        document.getElementById("bom-expiry").value = "";
      }
    }
    document.getElementById("bom-page-title").textContent = record.noReg || config.recordKey;
    state.nodes = (record.details || []).filter((item) => !item.isDeleted).map((item, index) => ({
      id: item.id, sourceDetail: item, part: item.part || null, ...commercial.detailFields(item), clientKey: item.id || createKey(), parentDetailId: item.parentDetailId || null, partId: item.partId || "", linkedBom: (item.part?.mbomHeaders || []).find((bom) => bom.noReg !== record.noReg) || null, qty: Number(item.qty || 0), uomCode: item.uomCode || "", category: item.category || "Purchase", assemblyPolicyOverride: item.assemblyPolicyOverride || "DEFAULT", leadTime: Number(item.leadTime || 0), leadTimeUnit: item.leadTimeUnit || "HOUR", materialThickness: item.materialThickness, materialWidth: item.materialWidth, materialPitch: item.materialPitch, materialCavity: item.materialCavity, materialDensity: item.materialDensity, materialFormId: item.materialFormId, materialScheme: item.materialScheme || "DEFAULT", defaultGrossWeight: item.defaultGrossWeight, alternateMaterialFormId: item.alternateMaterialFormId, alternateMaterialPitch: item.alternateMaterialPitch, alternateMaterialCavity: item.alternateMaterialCavity, alternateGrossWeight: item.alternateGrossWeight, grossWeight: Number(item.grossWeight || 0), notes: item.notes || "", processes: item.mbomProcesses || [], x: 860 + (index % 4) * 260, y: 230 + Math.floor(index / 4) * 180
    }));
    state.omittedNodes = state.nodes.filter((node) => {
      let parent = state.nodes.find((p) => nodeKey(p) === node.parentDetailId); const seen = new Set();
      while (parent && !seen.has(nodeKey(parent))) { seen.add(nodeKey(parent)); if (parent.linkedBom) return true; parent = state.nodes.find((p) => nodeKey(p) === parent.parentDetailId); }
      return false;
    });
    const omittedKeys = new Set(state.omittedNodes.map(nodeKey)); state.nodes = state.nodes.filter((node) => !omittedKeys.has(nodeKey(node)));
    for (const node of [...state.nodes]) {
      if (node.linkedBom) await expandLinkedBom(node, node.linkedBom, new Set([record.noReg]));
    }
    renderRoot(); autoLayout(); fitCanvas();
    const focusPartCode = new URLSearchParams(location.search).get("focusPart");
    const focusNode = focusPartCode
      ? state.nodes.find((node) => String(partById(node.partId).partCode) === String(focusPartCode))
      : null;
    if (focusNode) {
      state.selectedId = nodeKey(focusNode);
      renderAll();
      renderInspector();
    }
  }

  function draftSnapshot() {
    recalculatePendingPreviewCodes();
    const pendingParts = state.parts.filter((part) => part.isPending).map((part) => {
      const clean = { ...part }; delete clean._createdThisSave; return clean;
    });
    const nodes = state.nodes.filter((node) => !node.external).map((node) => ({
      ...commercial.detailFields(node), clientKey: node.clientKey || node.id || createKey(), parentDetailId: node.parentDetailId || null, partId: node.partId, qty: Number(node.qty || 0), uomCode: node.uomCode || "", category: node.category || "Purchase", assemblyPolicyOverride: node.assemblyPolicyOverride || "DEFAULT", leadTime: Number(node.leadTime || 0), leadTimeUnit: node.leadTimeUnit || "HOUR", materialThickness: node.materialThickness, materialWidth: node.materialWidth, materialPitch: node.materialPitch, materialCavity: node.materialCavity, materialDensity: node.materialDensity, materialFormId: node.materialFormId, materialScheme: node.materialScheme || "DEFAULT", defaultGrossWeight: node.defaultGrossWeight, alternateMaterialFormId: node.alternateMaterialFormId, alternateMaterialPitch: node.alternateMaterialPitch, alternateMaterialCavity: node.alternateMaterialCavity, alternateGrossWeight: node.alternateGrossWeight, grossWeight: Number(node.grossWeight || 0), notes: node.notes || "", processes: node.processes || [], x: Number(node.x || 0), y: Number(node.y || 0), linkedBom: node.linkedBom || null,
    }));
    return {
      version: 1,
      header: { rootPartId: rootPart.value || "", uomCode: rootUom.value || "", revision: Number(document.getElementById("bom-revision").value || 1), effectiveDate: document.getElementById("bom-effective").value || "", expiryDate: document.getElementById("bom-expiry").value || "", notes: document.getElementById("bom-notes").value || "" },
      pendingParts, nodes, pendingPartCounter: state.pendingPartCounter,
    };
  }

  function setDraftStatus(message, kind = "") {
    const target = document.getElementById("bom-draft-status"); if (!target) return;
    target.textContent = message; target.classList.remove("d-none", "saving", "error"); if (kind) target.classList.add(kind);
  }

  async function draftApi(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...authHeaders(Boolean(options.body)), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Draft BOM gagal disimpan.");
    return payload;
  }

  async function loadDraft() {
    const draft = await draftApi(`/modules/api/manufacturing-bom/bill-of-materials/drafts/${encodeURIComponent(state.draftId)}`);
    if (draft.status !== "DRAFT") throw new Error(`Draft sudah berstatus ${draft.status}.`);
    const saved = draft.payload || {}; const header = saved.header || {};
    state.draftId = draft.id; state.draftUpdatedAt = draft.updatedAt; state.noReg = draft.draftNumber; state.pendingPartCounter = Number(saved.pendingPartCounter || 0);
    (saved.pendingParts || []).forEach((part) => { if (!state.parts.some((item) => item.id === part.id)) state.parts.push({ ...part, isPending: true }); });
    await hydratePartReferences([header.rootPartId, ...(saved.nodes || []).map((node) => node.partId)], [header.part, ...(saved.nodes || []).map((node) => node.part)]);
    setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama"); setOptions(document.getElementById("node-part"), state.parts, "id", optionLabel, "Pilih part"); renderPalette();
    rootPart.value = header.rootPartId || ""; rootUom.value = header.uomCode || ""; document.getElementById("bom-revision").value = header.revision || 1; document.getElementById("bom-effective").value = header.effectiveDate || ""; document.getElementById("bom-expiry").value = header.expiryDate || ""; document.getElementById("bom-notes").value = header.notes || "";
    state.nodes = (saved.nodes || []).map((node) => ({ ...node, id: null, clientKey: node.clientKey || createKey(), processes: node.processes || [] }));
    state.expandedBoms.clear();
    for (const node of [...state.nodes]) if (node.linkedBom) await expandLinkedBom(node, node.linkedBom, new Set());
    document.getElementById("bom-page-title").textContent = draft.draftNumber; setDraftStatus("Draft tersimpan"); renderRoot(); renderAll(); fitCanvas();
  }

  function scheduleDraftAutosave() {
    if (!state.draftId || state.approving) return;
    state.draftDirty = true; setDraftStatus("Perubahan belum disimpan", "saving"); clearTimeout(state.draftAutosaveTimer);
    state.draftAutosaveTimer = setTimeout(() => persistDraft().catch(() => {}), 700);
  }

  async function persistDraft() {
    if (!state.draftId || state.approving || state.draftSaving) return;
    state.draftDirty = false; state.draftSaving = true; setDraftStatus("Menyimpan draft…", "saving");
    try {
      const saved = await draftApi(`/modules/api/manufacturing-bom/bill-of-materials/drafts/${encodeURIComponent(state.draftId)}`, { method: "PATCH", body: JSON.stringify({ payload: draftSnapshot(), expectedUpdatedAt: state.draftUpdatedAt }) }); state.draftUpdatedAt = saved.updatedAt;
      setDraftStatus(`Draft tersimpan · ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
    } catch (error) { setDraftStatus(error.message, "error"); throw error; }
    finally { state.draftSaving = false; if (state.draftDirty) scheduleDraftAutosave(); }
  }

  async function flushDraftAutosave() {
    clearTimeout(state.draftAutosaveTimer);
    while (state.draftSaving) await new Promise((resolve) => setTimeout(resolve, 50));
    if (state.draftDirty) await persistDraft();
  }

  async function makeDraft() {
    clearError(); const button = document.getElementById("bom-make-draft");
    if (!rootPart.value) return showError("Produk utama wajib dipilih sebelum membuat draft.");
    if (!state.nodes.some((node) => !node.external)) return showError("Tambahkan minimal satu komponen sebelum membuat draft.");
    button.disabled = true; button.querySelector("i").classList.remove("d-none");
    try {
      const draft = await draftApi("/modules/api/manufacturing-bom/bill-of-materials/drafts", { method: "POST", body: JSON.stringify({ payload: draftSnapshot() }) });
      state.draftId = draft.id; state.draftUpdatedAt = draft.updatedAt; state.noReg = draft.draftNumber; config.mode = "draft"; history.replaceState({}, "", `/modules/manufacturing-bom/bill-of-materials/drafts/${encodeURIComponent(draft.id)}/edit`);
      document.getElementById("bom-page-title").textContent = draft.draftNumber; button.classList.add("d-none"); document.getElementById("bom-save").classList.remove("d-none"); setDraftStatus("Draft tersimpan"); renderAll();
    } catch (error) { showError(error.message); button.disabled = false; button.querySelector("i").classList.add("d-none"); }
  }

  function renderRoot() {
    refreshLookupLabels(document.querySelector(".bom-header-form"));
    const part = partById(rootPart.value); const root = document.getElementById("bom-root-node");
    root.classList.remove("bom-part-fg", "bom-part-wip", "bom-part-purchase", "bom-part-material", "bom-part-default"); root.classList.add(partVisualClass(part));
    root.innerHTML = `<small>PRODUK UTAMA</small><b>${escapeHtml(part.partCode || part.partNumber || "Pilih produk utama")}</b><span class="bom-node-part-number">Part No: ${escapeHtml(part.partNumber || "—")}</span><span>${escapeHtml(part.partName || "Root BOM")}</span>${editable ? '<div class="bom-node-footer"><span>Root BOM</span><button type="button" data-root-add title="Tambah part ke root">＋</button></div>' : ""}`;
    root.querySelector("[data-root-add]")?.addEventListener("click", (event) => { event.stopPropagation(); state.selectedId = null; openAddKindMenu(); });
  }

  function renderPalette() {
    const query = document.getElementById("bom-part-search").value.trim().toLowerCase();
    const items = state.parts.filter((part) => optionLabel(part).toLowerCase().includes(query)).slice(0, 100);
    document.getElementById("bom-part-palette").innerHTML = items.length ? items.map((part) => `<button class="bom-palette-item" type="button" disabled title="Tambahkan part melalui Inspector atau tombol + pada card"><span class="bom-palette-code">${escapeHtml((part.itemType || "P").slice(0, 3))}</span><span><b>${escapeHtml(part.partCode || part.partNumber || "—")}</b><small>${escapeHtml(part.partName || part.material?.materialType || "Part")}</small></span></button>`).join("") : '<div class="bom-panel-empty">Part tidak ditemukan.</div>';
  }

  function linkedBomForPart(partId) {
    const linked = state.bomByPartId.get(partId);
    return linked && linked.noReg !== state.noReg ? linked : null;
  }

  function ownedByLinkedBom(node, nodes) {
    const byKey = new Map(nodes.map((n) => [nodeKey(n), n]));
    let parent = byKey.get(node.parentDetailId); const seen = new Set();
    while (parent && !seen.has(nodeKey(parent))) {
      seen.add(nodeKey(parent)); if (parent.linkedBom) return true;
      parent = byKey.get(parent.parentDetailId);
    }
    return false;
  }

  async function expandLinkedBom(hostNode, linkedBom, ancestorBoms = new Set()) {
    if (!linkedBom?.noReg || ancestorBoms.has(linkedBom.noReg)) return;
    const hostKey = nodeKey(hostNode); const expansionKey = `${hostKey}:${linkedBom.noReg}`;
    if (state.expandedBoms.has(expansionKey)) return;
    state.expandedBoms.add(expansionKey);
    try {
      const record = await fetchJson(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(linkedBom.noReg)}`);
      await hydrateRecordParts(record);
      if (record.partId) state.bomByPartId.set(record.partId, record);
      const details = (record.details || []).filter((item) => !item.isDeleted);
      const keyBySourceId = new Map(details.map((item) => [item.id, `ext_${hostKey}_${item.id}`]));
      const externalNodes = details.map((item, index) => ({
        id: null,
        sourceDetailId: item.id,
        part: item.part || null,
        ...commercial.detailFields(item),
        clientKey: keyBySourceId.get(item.id),
        parentDetailId: keyBySourceId.get(item.parentDetailId) || hostKey,
        partId: item.partId || "",
        linkedBom: (item.part?.mbomHeaders || []).find((bom) => bom.noReg !== record.noReg) || null,
        qty: Number(item.qty || 0),
        uomCode: item.uomCode || "",
        category: item.category || "Purchase",
        assemblyPolicyOverride: item.assemblyPolicyOverride || "DEFAULT",
        leadTime: Number(item.leadTime || 0), leadTimeUnit: item.leadTimeUnit || "HOUR", materialThickness: item.materialThickness, materialWidth: item.materialWidth, materialPitch: item.materialPitch, materialCavity: item.materialCavity, materialDensity: item.materialDensity, materialFormId: item.materialFormId, materialScheme: item.materialScheme || "DEFAULT", defaultGrossWeight: item.defaultGrossWeight, alternateMaterialFormId: item.alternateMaterialFormId, alternateMaterialPitch: item.alternateMaterialPitch, alternateMaterialCavity: item.alternateMaterialCavity, alternateGrossWeight: item.alternateGrossWeight, grossWeight: Number(item.grossWeight || 0),
        notes: item.notes || "",
        processes: item.mbomProcesses || [],
        external: true,
        sourceBomNoReg: record.noReg,
        x: hostNode.x + (index % 3 - 1) * 250,
        y: hostNode.y + 185 + Math.floor(index / 3) * 185,
      }));
      const visibleExternalNodes = externalNodes.filter((node) => !ownedByLinkedBom(node, externalNodes));
      state.nodes.push(...visibleExternalNodes);
      hostNode.linkedBomLoaded = true;
      const nextAncestors = new Set(ancestorBoms); nextAncestors.add(linkedBom.noReg);
      for (const node of visibleExternalNodes) {
        if (node.linkedBom) await expandLinkedBom(node, node.linkedBom, nextAncestors);
      }
    } catch (error) {
      state.expandedBoms.delete(expansionKey);
      throw error;
    }
  }

  function addNode(partId, parentId = state.selectedId) {
    if (!editable) return;
    const parent = state.nodes.find((node) => nodeKey(node) === parentId);
    const siblings = state.nodes.filter((node) => (node.parentDetailId || null) === (parentId || null));
    const node = { clientKey: createKey(), parentDetailId: parentId || null, partId, qty: 1, uomCode: rootUom.value || "", category: "Purchase", assemblyPolicyOverride: "DEFAULT", leadTime: 0, leadTimeUnit: "HOUR", notes: "", processes: [], x: parent ? parent.x + (siblings.length % 3 - 1) * 250 : 720 + siblings.length * 250, y: parent ? parent.y + 185 : 230 };
    node.linkedBom = linkedBomForPart(partId); state.nodes.push(node); state.selectedId = node.clientKey; autoLayout(); renderInspector();
    if (node.linkedBom) expandLinkedBom(node, node.linkedBom).then(() => { autoLayout(); fitCanvas(); }).catch((error) => showError(`BOM turunan gagal dimuat: ${error.message}`));
  }

  function assignProcessOccurrenceCodes() {
    assignProcessRoutingNumbers();
    const groups = new Map();
    state.nodes.filter((node) => !node.external).forEach((node, nodeIndex) => (node.processes || []).forEach((process, processIndex) => {
      if (!process.processId || process.isDeleted === true) return;
      const scopeKey = processBomScopeKey(node); const groupKey = `${scopeKey}:${process.processId}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { processId: process.processId, items: [] });
      groups.get(groupKey).items.push({ nodeIndex, processIndex, process });
    }));
    groups.forEach(({ items, processId }) => {
      // Proses pertama adalah kartu paling bawah (alur produksi dibaca dari bawah ke atas).
      items.sort((a, b) => b.nodeIndex - a.nodeIndex || Number(a.process.sequence || 0) - Number(b.process.sequence || 0) || a.processIndex - b.processIndex);
      const master = state.processMaster.find((item) => item.id === processId); const code = master?.processCode || "PROCESS";
      items.forEach((item, index) => { item.process.occurrenceCode = items.length === 1 ? code : `${code}-${index + 1}`; });
    });
  }

  function assignProcessRoutingNumbers() {
    const localNodes = state.nodes.filter((node) => !node.external);
    const nodeByKey = new Map(localNodes.map((node) => [nodeKey(node), node]));
    const scopes = new Map();
    localNodes.forEach((node, nodeIndex) => {
      const scopeKey = processBomScopeKey(node);
      if (!scopes.has(scopeKey)) scopes.set(scopeKey, []);
      scopes.get(scopeKey).push({ node, nodeIndex, key: nodeKey(node) });
    });

    scopes.forEach((entries, scopeKey) => {
      const operationsByNode = new Map(); const roots = [];
      entries.forEach(({ node, nodeIndex, key }) => {
        const operations = (node.processes || []).map((process, processIndex) => ({ process, processIndex }))
          .filter((item) => item.process.processId && item.process.isDeleted !== true)
          .sort((a, b) => Number(a.process.sequence || 0) - Number(b.process.sequence || 0) || a.processIndex - b.processIndex)
          .map((item) => ({ ...item, nodeIndex, key, children: [] }));
        operationsByNode.set(key, operations);
      });
      const ancestorOperation = (node) => {
        const visited = new Set(); let parentKey = node.parentDetailId || null;
        while (parentKey && !visited.has(parentKey)) {
          visited.add(parentKey); const parent = nodeByKey.get(parentKey);
          if (!parent || processBomScopeKey(parent) !== scopeKey) return null;
          const operations = operationsByNode.get(parentKey) || [];
          if (operations.length) return operations[operations.length - 1];
          parentKey = parent.parentDetailId || null;
        }
        return null;
      };
      entries.forEach(({ node, key }) => {
        const operations = operationsByNode.get(key) || []; if (!operations.length) return;
        for (let index = 1; index < operations.length; index += 1) operations[index - 1].children.push(operations[index]);
        const ancestor = ancestorOperation(node); if (ancestor) ancestor.children.push(operations[0]); else roots.push(operations[0]);
      });
      const compare = (a, b) => a.nodeIndex - b.nodeIndex || Number(a.process.sequence || 0) - Number(b.process.sequence || 0) || a.processIndex - b.processIndex;
      const visited = new Set();
      const numberOperation = (operation, major, branches = []) => {
        if (!operation || visited.has(operation)) return; visited.add(operation);
        operation.process.routingNumber = [major, ...branches].join("."); operation.children.sort(compare);
        if (operation.children.length === 1) numberOperation(operation.children[0], major + 1, branches);
        else operation.children.forEach((child, index) => numberOperation(child, major + 1, [...branches, index + 1]));
      };
      roots.sort(compare);
      if (roots.length === 1) numberOperation(roots[0], 1);
      else roots.forEach((root, index) => numberOperation(root, 1, [index + 1]));
    });
  }

  function processBomScopeKey(node) {
    let parent = state.nodes.find((item) => !item.external && nodeKey(item) === node.parentDetailId); const visited = new Set();
    while (parent && !visited.has(nodeKey(parent))) {
      visited.add(nodeKey(parent)); const part = partById(parent.partId);
      if (part.itemType === "FG") return `fg:${part.id}`;
      parent = state.nodes.find((item) => !item.external && nodeKey(item) === parent.parentDetailId);
    }
    return `root:${rootPart.value || "unselected"}`;
  }

  function materialConsumption(node) {
    const part = partById(node?.partId); if (!node || part.itemType !== "RAW" || part.rawType !== "MATERIAL") return null;
    const material = part.material || state.materials.find((item) => item.id === part.materialId) || null;
    const parentNode = state.nodes.find((item) => nodeKey(item) === node.parentDetailId); const parentPart = partById(parentNode?.partId || rootPart.value);
    const bases = parentPart.partBases || []; const base = bases.find((item) => String(item.baseOn || "").toLowerCase() === "actual") || bases[0] || {};
    node.materialThickness = node.materialThickness ?? material?.thickness ?? null;
    node.materialWidth = node.materialWidth ?? material?.width ?? null;
    node.materialDensity = node.materialDensity ?? material?.density ?? null;
    node.materialPitch = node.materialPitch ?? base.length ?? null;
    node.materialCavity = node.materialCavity ?? base.cavity ?? 1;
    const thickness = Number(node.materialThickness || 0); const width = Number(node.materialWidth || 0); const pitch = Number(node.materialPitch || 0); const cavity = Math.max(1, Math.round(Number(node.materialCavity || 1))); const density = Number(node.materialDensity || 0);
    node.materialFormId = node.materialFormId || null;
    node.defaultGrossWeight = thickness > 0 && width > 0 && pitch > 0 && density > 0 ? thickness * width * pitch * density / cavity : 0;
    const altPitch = Number(node.alternateMaterialPitch || 0); const altCavity = Math.max(1, Math.round(Number(node.alternateMaterialCavity || 1)));
    node.alternateGrossWeight = thickness > 0 && width > 0 && altPitch > 0 && density > 0 ? thickness * width * altPitch * density / altCavity : null;
    node.grossWeight = node.materialScheme === "ALTERNATIVE" ? Number(node.alternateGrossWeight || 0) : node.defaultGrossWeight;
    return { part, material, parentPart, base, grossWeight: node.grossWeight };
  }

  function renderAll() {
    recalculatePendingPreviewCodes();
    assignProcessOccurrenceCodes();
    canvas.querySelectorAll(".bom-node:not(.bom-root-node)").forEach((node) => node.remove());
    state.nodes.forEach((item) => {
      const part = partById(item.partId); const key = nodeKey(item); const element = document.createElement("article");
      element.className = `bom-node ${partVisualClass(part)}${key === state.selectedId ? " selected" : ""}${item.external ? " bom-node-external" : ""}`; element.dataset.key = key; element.style.left = `${item.x}px`; element.style.top = `${item.y}px`;
      const processBadges = (item.processes || []).slice().sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)).slice(0, 3).map((process) => `<span>${escapeHtml(process.routingNumber || process.sequence || 0)} · ${escapeHtml(process.occurrenceCode || processLabel(process.processId))}</span>`).join("");
      const linkedBom = item.linkedBom || linkedBomForPart(item.partId); const materialInfo = materialConsumption(item);
      const createsChildBom = part.itemType === "FG";
      const bomAction = linkedBom ? `<a class="bom-node-linked" href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(linkedBom.noReg)}/edit">Edit BOM · ${escapeHtml(linkedBom.noReg)}</a>` : item.external ? `<a class="bom-node-linked external" href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(item.sourceBomNoReg)}/edit">Referensi · ${escapeHtml(item.sourceBomNoReg)}</a>` : editable && createsChildBom ? '<span class="bom-node-linked new">BOM Turunan Baru</span>' : "";
      element.innerHTML = `<small>${item.external ? "BOM REFERENSI" : `LEVEL ${computeLevel(item) + 1}`} · ${escapeHtml(item.category)}</small><b>${escapeHtml(part.partCode || part.partNumber || "Pilih Part")}</b><span class="bom-node-part-number">Part No: ${escapeHtml(part.partNumber || "—")}</span><span class="bom-node-meta">${escapeHtml(part.partName || "Komponen BOM")}</span>${bomAction}${materialInfo ? `<span class="bom-node-material-weight">${materialInfo.material ? escapeHtml(materialInfo.material.materialCode) : "Material belum terhubung"} · Gross ${Number(item.grossWeight || 0).toFixed(2)} kg/pcs</span>` : ""}${processBadges ? `<div class="bom-node-process-badges">${processBadges}</div>` : ""}<div class="bom-node-footer"><span>${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(item.qty || 0)} ${escapeHtml(item.uomCode || "")}</span>${editable && !item.external ? '<button type="button" data-card-add title="Tambah part di bawah card ini">＋</button>' : ""}</div>`;
      element.querySelector(".bom-node-linked[href]")?.addEventListener("click", (event) => event.stopPropagation());
      element.addEventListener("click", (event) => { event.stopPropagation(); const addButton = event.target.closest("[data-card-add]"); state.selectedId = key; renderAll(); renderInspector(); if (addButton) openAddKindMenu(); });
      if (editable && !item.external) attachDrag(element, item);
      canvas.appendChild(element);
    });
    document.getElementById("bom-empty-canvas").classList.toggle("d-none", state.nodes.length > 0);
    if (editable) {
      const childBomCount = state.nodes.filter((node) => { const part = partById(node.partId); return !node.external && part.itemType === "FG" && node.partId !== rootPart.value && !linkedBomForPart(node.partId); }).length;
      const label = document.querySelector("#bom-save span"); if (label) label.textContent = isNewBomMode() ? `Approve ${childBomCount + 1} BOM` : childBomCount ? `Simpan + ${childBomCount} BOM Turunan` : "Simpan BOM";
    }
    panels.renderOverview();
    drawConnections();
    scheduleDraftAutosave();
  }

  function computeLevel(node) {
    let level = 0; let parentId = node.parentDetailId; const visited = new Set([nodeKey(node)]);
    while (parentId) { if (visited.has(parentId)) break; visited.add(parentId); const parent = state.nodes.find((item) => nodeKey(item) === parentId); if (!parent) break; level++; parentId = parent.parentDetailId; }
    return level;
  }

  function drawConnections() {
    const svg = document.getElementById("bom-connectors"); svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${state.canvasWidth} ${state.canvasHeight}`);
    svg.setAttribute("width", state.canvasWidth); svg.setAttribute("height", state.canvasHeight); svg.style.width = `${state.canvasWidth}px`; svg.style.height = `${state.canvasHeight}px`;
    const elements = new Map([...canvas.querySelectorAll(".bom-node")].map((element) => [element.dataset.key || "__root__", element]));
    const groups = new Map();
    state.nodes.forEach((node) => {
      const parentKey = node.parentDetailId || "__root__";
      if (!groups.has(parentKey)) groups.set(parentKey, []);
      groups.get(parentKey).push(node);
    });
    const addPath = (d, className = "") => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", d); if (className) path.setAttribute("class", className); svg.appendChild(path);
    };
    groups.forEach((children, parentKey) => {
      const parent = parentKey === "__root__" ? null : state.nodes.find((node) => nodeKey(node) === parentKey);
      const parentElement = parentKey === "__root__" ? document.getElementById("bom-root-node") : elements.get(parentKey);
      if (!parentElement) return;
      const parentX = (parent ? parent.x : state.rootX) + parentElement.offsetWidth / 2;
      const parentBottom = (parent ? parent.y : state.rootY) + parentElement.offsetHeight;
      const childPoints = children.map((child) => ({ node: child, element: elements.get(nodeKey(child)) })).filter((item) => item.element).map((item) => ({ x: item.node.x + item.element.offsetWidth / 2, y: item.node.y }));
      if (!childPoints.length) return;
      const firstChildY = Math.min(...childPoints.map((point) => point.y));
      const busY = parentBottom + Math.max(30, (firstChildY - parentBottom) * .46);
      addPath(`M ${parentX} ${parentBottom} V ${busY}`, "bom-connector-trunk");
      const minX = Math.min(...childPoints.map((point) => point.x)); const maxX = Math.max(...childPoints.map((point) => point.x));
      if (maxX > minX) addPath(`M ${minX} ${busY} H ${maxX}`, "bom-connector-bus");
      childPoints.forEach((point) => {
        addPath(`M ${point.x} ${busY} V ${point.y}`, "bom-connector-branch");
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle"); dot.setAttribute("cx", point.x); dot.setAttribute("cy", point.y); dot.setAttribute("r", "3"); svg.appendChild(dot);
      });
    });
  }

  function attachDrag(element, item) {
    element.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button,select,input,textarea")) return; event.preventDefault(); element.setPointerCapture(event.pointerId); element.classList.add("dragging");
      const startX = event.clientX; const startY = event.clientY; const originX = item.x; const originY = item.y;
      const move = (moveEvent) => { item.x = Math.max(20, originX + (moveEvent.clientX - startX) / state.scale); item.y = Math.max(175, originY + (moveEvent.clientY - startY) / state.scale); element.style.left = `${item.x}px`; element.style.top = `${item.y}px`; drawConnections(); };
      const up = () => { element.classList.remove("dragging"); element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", up); scheduleDraftAutosave(); };
      element.addEventListener("pointermove", move); element.addEventListener("pointerup", up);
    });
  }

  function attachCanvasPan() {
    let pan = null;
    let suppressCanvasClick = false;

    const finishPan = () => {
      if (!pan) return;
      const moved = pan.moved;
      pan = null;
      viewport.classList.remove("is-panning");
      if (moved) {
        suppressCanvasClick = true;
        setTimeout(() => { suppressCanvasClick = false; }, 0);
      }
    };

    viewport.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target.closest(".bom-node,button,a,input,select,textarea,label")) return;
      event.preventDefault();
      pan = {
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        moved: false,
      };
      viewport.classList.add("is-panning");
    });

    document.addEventListener("mousemove", (event) => {
      if (!pan) return;
      event.preventDefault();
      const deltaX = event.clientX - pan.startX;
      const deltaY = event.clientY - pan.startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) pan.moved = true;
      viewport.scrollLeft = pan.scrollLeft - deltaX;
      viewport.scrollTop = pan.scrollTop - deltaY;
    });

    document.addEventListener("mouseup", finishPan);
    window.addEventListener("blur", finishPan);
    viewport.addEventListener("click", (event) => {
      if (!suppressCanvasClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressCanvasClick = false;
    }, true);
  }

  function descendantsOf(key) {
    const result = new Set(); let changed = true;
    while (changed) { changed = false; state.nodes.forEach((node) => { const nodeId = nodeKey(node); if (!result.has(nodeId) && (node.parentDetailId === key || result.has(node.parentDetailId))) { result.add(nodeId); changed = true; } }); }
    return result;
  }

  function renderInspector() {
    const node = selectedNode(); const empty = document.getElementById("bom-inspector-empty");
    document.getElementById("bom-inspector").classList.toggle("open", Boolean(node));
    document.querySelector(".bom-workspace").classList.toggle("has-inspector", Boolean(node));
    empty.classList.toggle("d-none", Boolean(node)); inspectorForm.classList.toggle("d-none", !node); if (!node) return;
    const part = partById(node.partId); document.getElementById("bom-inspector-caption").textContent = node.external ? `Referensi dari ${node.sourceBomNoReg}. Klik label node untuk edit BOM asal.` : optionLabel(part);
    document.getElementById("node-part").value = node.partId || ""; document.getElementById("node-qty").value = node.qty ?? 0; document.getElementById("node-uom").value = node.uomCode || "";
    const parentSelect = document.getElementById("node-parent"); const excluded = descendantsOf(nodeKey(node)); excluded.add(nodeKey(node)); parentSelect.innerHTML = '<option value="">Produk Utama (Root)</option>' + state.nodes.filter((item) => !item.external && !excluded.has(nodeKey(item))).map((item) => `<option value="${nodeKey(item)}">${escapeHtml(optionLabel(partById(item.partId)))}</option>`).join(""); parentSelect.value = node.parentDetailId || "";
    document.getElementById("node-category").value = node.category; document.getElementById("node-policy").value = node.assemblyPolicyOverride; document.getElementById("node-lead-time").value = node.leadTime || 0; document.getElementById("node-lead-time-unit").value = node.leadTimeUnit || "HOUR"; document.getElementById("node-notes").value = node.notes || "";
    const materialInfo = materialConsumption(node); const materialSection = document.getElementById("node-material-consumption"); materialSection.classList.toggle("d-none", !materialInfo);
    if (materialInfo) { document.getElementById("node-material-name").textContent = materialInfo.material ? `${materialInfo.material.materialCode} — ${materialInfo.material.materialName || materialInfo.material.spec || ""}` : "Part raw material belum terhubung ke Master Material"; const materialLink = document.getElementById("node-material-link"); materialLink.href = materialInfo.material ? `/master-data/materials/${encodeURIComponent(materialInfo.material.materialCode)}` : `/master-data/parts/${encodeURIComponent(materialInfo.part.partCode || materialInfo.part.id)}/edit?key=${encodeURIComponent(materialInfo.part.partCode || materialInfo.part.id)}`; materialLink.textContent = materialInfo.material ? "Lihat Material" : "Hubungkan Part"; document.getElementById("node-material-thickness").value = node.materialThickness ?? ""; document.getElementById("node-material-width").value = node.materialWidth ?? ""; document.getElementById("node-material-pitch").value = node.materialPitch ?? ""; document.getElementById("node-material-cavity").value = node.materialCavity ?? 1; document.getElementById("node-material-density").value = node.materialDensity ?? ""; document.getElementById("node-gross-weight").value = Number(node.grossWeight || 0).toFixed(6); document.getElementById("node-material-formula").textContent = materialInfo.material ? "Gross kg/pcs = T × W × P × Density (kg/mm³) ÷ Cavity" : "Hubungkan Part ini ke Master Material agar T, W, density dan gross weight dapat dihitung."; }
    if (materialInfo) {
      document.getElementById("node-material-form").value = node.materialFormId || "";
      document.getElementById("node-material-scheme").value = node.materialScheme || "DEFAULT";
      document.getElementById("node-material-alt-form").value = node.alternateMaterialFormId || "";
      document.getElementById("node-material-alt-pitch").value = node.alternateMaterialPitch ?? "";
      document.getElementById("node-material-alt-cavity").value = node.alternateMaterialCavity ?? 1;
      document.getElementById("node-material-alt-gross").value = Number(node.alternateGrossWeight || 0).toFixed(6);
    }
    panels.renderSourcing(node);
    panels.renderCosts(node);
    renderNodeProcesses(node);
    setInspectorTab(state.inspectorTab);
    refreshLookupLabels(inspectorForm);
    inspectorForm.querySelectorAll("input,select,textarea,button").forEach((input) => {
      if (input.closest(".bom-inspector-tabs")) return;
      if (input.closest("#node-process-list")) { if (!editable || node.external) input.disabled = true; return; }
      input.disabled = !editable || Boolean(node.external);
    });
    const insertButton = document.getElementById("node-insert-before");
    if (insertButton) {
      const canInsert = editable && !node.external && !part.isPending
        && (part.itemType === "WIP" || (part.itemType === "RAW" && part.rawType === "MATERIAL"))
        && Number(part.processSequence || 0) > 0;
      insertButton.disabled = !canInsert;
      insertButton.title = canInsert
        ? (state.sequenceInsertionPolicy.locked ? "Sisipkan dengan slot sequence tanpa mengubah kode lama" : "Sisipkan dan geser sequence utama setelahnya")
        : "Pilih child process yang sudah memiliki sequence.";
    }
  }

  function processLabel(processId) { const item = state.processMaster.find((process) => process.id === processId); return item?.processName || item?.processCode || "Pilih proses"; }
  function renderNodeProcesses(node) {
    assignProcessOccurrenceCodes();
    node.processes = (node.processes || []).sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    panels.renderRouting(node, !editable || Boolean(node.external));
  }

  function setInspectorTab(tab) {
    state.inspectorTab = ["part", "material", "routing", "cost"].includes(tab) ? tab : "part";
    document.querySelectorAll("[data-canvas-tab]").forEach((button) => {
      const active = button.dataset.canvasTab === state.inspectorTab;
      button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-canvas-panel]").forEach((panel) => panel.hidden = panel.dataset.canvasPanel !== state.inspectorTab);
  }

  function autoLayout() {
    const NODE_WIDTH = 220; const HORIZONTAL_GAP = 78; const LEVEL_GAP = 220; const TOP_Y = 230; const PADDING = 90;
    const byKey = new Map(state.nodes.map((node) => [nodeKey(node), node])); const childrenByParent = new Map();
    state.nodes.forEach((node) => {
      const parentKey = node.parentDetailId && byKey.has(node.parentDetailId) ? node.parentDetailId : "__root__";
      if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
      childrenByParent.get(parentKey).push(node);
    });
    childrenByParent.forEach((items) => items.sort((a, b) => String(partById(a.partId).partCode || "").localeCompare(String(partById(b.partId).partCode || ""), "id", { numeric: true })));
    let leafCursor = 0; let maxDepth = 0;
    const place = (node, depth, ancestors = new Set()) => {
      const key = nodeKey(node); if (ancestors.has(key)) return;
      maxDepth = Math.max(maxDepth, depth); const nextAncestors = new Set(ancestors); nextAncestors.add(key);
      const children = (childrenByParent.get(key) || []).filter((child) => !nextAncestors.has(nodeKey(child)));
      if (!children.length) {
        node.x = PADDING + leafCursor * (NODE_WIDTH + HORIZONTAL_GAP); leafCursor += 1;
      } else {
        children.forEach((child) => place(child, depth + 1, nextAncestors));
        node.x = (children[0].x + children[children.length - 1].x) / 2;
      }
      node.y = TOP_Y + depth * LEVEL_GAP;
    };
    const roots = childrenByParent.get("__root__") || []; roots.forEach((node) => place(node, 0));
    const positioned = state.nodes.filter((node) => Number.isFinite(node.x));
    const minX = positioned.length ? Math.min(...positioned.map((node) => node.x)) : PADDING;
    const maxX = positioned.length ? Math.max(...positioned.map((node) => node.x + NODE_WIDTH)) : PADDING + NODE_WIDTH;
    const contentWidth = maxX - minX; const minimumWidth = Math.max(1400, viewport.clientWidth / .85);
    state.canvasWidth = Math.max(minimumWidth, contentWidth + PADDING * 2);
    const shiftX = Math.max(PADDING - minX, (state.canvasWidth - contentWidth) / 2 - minX);
    positioned.forEach((node) => { node.x += shiftX; });
    state.rootX = roots.length ? (roots[0].x + roots[roots.length - 1].x) / 2 : state.canvasWidth / 2 - NODE_WIDTH / 2;
    state.rootY = 42; state.canvasHeight = Math.max(900, TOP_Y + (maxDepth + 1) * LEVEL_GAP + 220);
    canvas.style.width = `${state.canvasWidth}px`; canvas.style.height = `${state.canvasHeight}px`;
    const rootElement = document.getElementById("bom-root-node"); rootElement.style.left = `${state.rootX}px`; rootElement.style.top = `${state.rootY}px`;
    renderAll();
    const elements = new Map([...canvas.querySelectorAll(".bom-node:not(.bom-root-node)")].map((element) => [element.dataset.key, element]));
    const levels = new Map(); state.nodes.forEach((node) => { const level = computeLevel(node); if (!levels.has(level)) levels.set(level, []); levels.get(level).push(node); });
    let nextY = state.rootY + rootElement.offsetHeight + 86;
    [...levels.keys()].sort((a, b) => a - b).forEach((level) => {
      const items = levels.get(level); items.forEach((node) => { node.y = nextY; const element = elements.get(nodeKey(node)); if (element) element.style.top = `${nextY}px`; });
      const tallest = Math.max(108, ...items.map((node) => elements.get(nodeKey(node))?.offsetHeight || 108)); nextY += tallest + 76;
    });
    state.canvasHeight = Math.max(900, nextY + 120); canvas.style.height = `${state.canvasHeight}px`; drawConnections(); renderInspector();
  }

  function setScale(value) { state.scale = Math.min(1.4, Math.max(.1, value)); canvas.style.transform = `scale(${state.scale})`; document.getElementById("bom-zoom-label").textContent = `${Math.round(state.scale * 100)}%`; }
  function centerCanvas() { requestAnimationFrame(() => { viewport.scrollLeft = Math.max(0, (state.rootX + 110) * state.scale - viewport.clientWidth / 2); viewport.scrollTop = 0; }); }
  function fitCanvas() {
    requestAnimationFrame(() => {
      const all = [{ x: state.rootX, y: state.rootY, width: 220, height: 120 }, ...state.nodes.map((node) => ({ x: node.x, y: node.y, width: 220, height: 210 }))];
      const minX = Math.min(...all.map((item) => item.x)); const maxX = Math.max(...all.map((item) => item.x + item.width)); const minY = Math.min(...all.map((item) => item.y)); const maxY = Math.max(...all.map((item) => item.y + item.height));
      const scale = Math.min(.95, (viewport.clientWidth - 80) / Math.max(1, maxX - minX), (viewport.clientHeight - 70) / Math.max(1, maxY - minY));
      setScale(scale); viewport.scrollLeft = Math.max(0, minX * state.scale - 36); viewport.scrollTop = Math.max(0, minY * state.scale - 24);
      drawConnections();
    });
  }

  function inheritedCustomerCode() {
    const parentPart = partById(selectedNode()?.partId || rootPart.value);
    return parentPart.customerCode || parentPart.customerCodes?.[0] || "";
  }
  function insertionAncestorParts() {
    const parts = []; let node = selectedNode(); const visited = new Set();
    while (node && !visited.has(nodeKey(node))) {
      visited.add(nodeKey(node)); const part = partById(node.partId); if (part.id) parts.push(part);
      node = state.nodes.find((item) => nodeKey(item) === node.parentDetailId);
    }
    const root = partById(rootPart.value); if (root.id && !parts.some((part) => part.id === root.id)) parts.push(root);
    return parts;
  }
  function sequenceSourcePart(kind = state.quickPartKind) {
    if (kind === "fg" || kind === "purchase") return {};
    return insertionAncestorParts().find((part) => part.itemType === "FG") || {};
  }
  function renderSequenceSourceHint() {
    const source = sequenceSourcePart();
    document.getElementById("quick-sequence-source").textContent = source.id ? `SEQ mengikuti FG parent terdekat: ${source.partCode}.` : "Belum ada FG parent pada jalur ini sebagai sumber SEQ.";
  }
  function openAddKindMenu() {
    document.getElementById("bom-add-kind-dialog").showModal();
  }
  function quickNumberingRule() {
    const partType = document.getElementById("quick-part-type")?.value || "STANDARD";
    const key = partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT";
    return state.numberingRules.get(key) || { processStep: 10, insertionStart: 11, siblingAlphaMode: "SAME_PROCESS", inheritBranchAlpha: true };
  }
  function nextSiblingProcessOrder() {
    const parentKey = state.selectedId || null;
    const step = Math.max(1, Number(quickNumberingRule().processStep || 10));
    const candidates = state.nodes.filter((node) => !node.external && (isNewBomMode() || (node.parentDetailId || null) === parentKey));
    const used = candidates.map((node) => {
      const part = partById(node.partId); if (Number(part.processSequence) > 0) return Math.floor(Number(part.processSequence) / step);
      if (Number(part.componentLevel) > 0) return Number(part.componentLevel);
      const match = String(part.partCode || "").match(/-(\d{3})$/); return match ? Math.max(0, Math.floor(Number(match[1]) / step)) : 0;
    }).filter((value) => Number.isFinite(value));
    return Math.max(0, ...used) + 1;
  }
  function alphaSequence(index) {
    let value = Math.max(0, Number(index) || 0); let result = "";
    do { result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26) - 1; } while (value >= 0);
    return result;
  }
  function familySequenceFromCode(partCode) {
    const match = String(partCode || "").trim().toUpperCase().match(/^[^-]+-(?:C)?(\d{3,4})(?:-|$)/);
    return match ? Number(match[1]) : null;
  }
  function formatPreviewNumber(rule, sequence, context = {}) {
    const now = (globalThis.erpBusinessNow?.() || new Date()); const pad = (value, size = 2) => String(value).padStart(size, "0");
    const values = {
      PREFIX: context.prefix ?? rule?.prefix ?? "", YYYY: String(now.getFullYear()), YY: String(now.getFullYear()).slice(-2), MM: pad(now.getMonth() + 1), DD: pad(now.getDate()),
      SEQ: pad(sequence, Number(rule?.sequenceLength || 4)), CUSTOMER: context.customer || "", TYPE: context.type || "", REV: context.rev || "00", CODE: context.code || "", LEVEL: context.process || "000", PROCESS: context.process || "000", BRANCH: context.branch || "",
    };
    return String(rule?.pattern || "{PREFIX}-{SEQ}").replace(/\{([A-Z_]+)\}/g, (_match, tokenName) => String(values[tokenName] ?? "").toUpperCase()).replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  }
  function nextPreviewRuleSequence(ruleKey) {
    const rule = state.numberingRules.get(ruleKey) || {}; const start = Math.max(1, Number(rule.nextNumber || 1)); const increment = Math.max(1, Number(rule.incrementBy || 1));
    const reserved = state.parts.filter((part) => part.isPending && part.pendingRuleKey === ruleKey).length;
    return start + reserved * increment;
  }
  function previewChildCode(payload, processSequence, branchCode) {
    const ruleKey = payload.partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT"; const rule = state.numberingRules.get(ruleKey) || {};
    const sourceSequence = familySequenceFromCode(payload.sequenceSourcePartCode); const sequence = sourceSequence || nextPreviewRuleSequence(ruleKey);
    const fallbackFamily = payload.partType === "COMP" ? `C${String(sequence).padStart(3, "0")}` : String(sequence).padStart(4, "0");
    if (!rule.isActive && rule.isActive !== undefined) return `${payload.customerCode ? `${payload.customerCode}-` : ""}${fallbackFamily}${branchCode ? `-${branchCode}` : ""}-${String(processSequence).padStart(3, "0")}`;
    return formatPreviewNumber(rule, sequence, { customer: payload.customerCode || "", branch: branchCode || "", process: String(processSequence).padStart(3, "0") });
  }
  function provisionalBranchForNewPart(siblings, parentBranchCode, rule) {
    const inherited = rule?.inheritBranchAlpha === false ? "" : String(parentBranchCode || "").toUpperCase();
    const numberedSiblings = siblings.filter((part) => part.itemType === "WIP");
    if (!numberedSiblings.length || (rule?.siblingAlphaMode || "SAME_PROCESS") === "NONE") return inherited;
    const used = new Set();
    numberedSiblings.forEach((part) => {
      let branch = String(part.branchCode || "").toUpperCase();
      if (branch === inherited && part.isPending) {
        branch = `${inherited}A`; part.branchCode = branch;
        part.partCode = previewChildCode(part.pendingPayload || part, Number(part.processSequence || 0), branch);
      }
      if (branch.startsWith(inherited) && branch.slice(inherited.length)) used.add(branch.slice(inherited.length));
    });
    let index = 0; while (used.has(alphaSequence(index))) index += 1;
    return `${inherited}${alphaSequence(index)}`;
  }
  function provisionalPartIdentity(payload, siblings, parentPart, expectedSequence) {
    const isChildNumbered = payload.itemType === "WIP" || (payload.itemType === "RAW" && payload.rawType === "MATERIAL");
    if (isChildNumbered) {
      const ruleKey = payload.partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT"; const rule = state.numberingRules.get(ruleKey) || {};
      const branchCode = payload.itemType === "WIP" ? provisionalBranchForNewPart(siblings, parentPart.branchCode || "", rule) : "";
      return { partCode: previewChildCode(payload, expectedSequence, branchCode), branchCode, processSequence: expectedSequence, pendingRuleKey: ruleKey };
    }
    const rawGeneral = payload.itemType === "RAW" && payload.rawType === "PURCHASE_PART" && !payload.hasDrawing;
    const ruleKey = rawGeneral ? "PART_RAW" : payload.partType === "COMP" ? "PART_FG_COMPONENT" : "PART_FG_NON_COMPONENT"; const rule = state.numberingRules.get(ruleKey) || {};
    const sequence = nextPreviewRuleSequence(ruleKey); const fallback = rawGeneral ? `${String(sequence).padStart(Number(rule.sequenceLength || 4), "0")}-${payload.noRevisi || "00"}` : `${payload.customerCode ? `${payload.customerCode}-` : ""}${payload.partType === "COMP" ? `C${String(sequence).padStart(3, "0")}` : String(sequence).padStart(4, "0")}-000`;
    const partCode = rule.isActive === false ? fallback : formatPreviewNumber(rule, sequence, { customer: payload.customerCode || "", rev: payload.noRevisi || "00" });
    return { partCode, branchCode: "", processSequence: 0, pendingRuleKey: ruleKey };
  }
  function recalculatePendingPreviewCodes() {
    const localNodes = state.nodes.filter((node) => !node.external); const order = new Map(localNodes.map((node, index) => [nodeKey(node), index]));
    const entries = localNodes.map((node) => ({ node, part: partById(node.partId), level: computeLevel(node) + 1 })).filter((entry) => entry.part.isPending).sort((a, b) => a.level - b.level || order.get(nodeKey(a.node)) - order.get(nodeKey(b.node)));
    const sequenceCursorByScope = new Map();
    localNodes.forEach((node) => {
      const part = partById(node.partId); const sequence = Number(part.processSequence || 0);
      if (part.isPending || sequence <= 0) return;
      const scopeKey = processSequenceScopeKey(node);
      sequenceCursorByScope.set(scopeKey, Math.max(sequenceCursorByScope.get(scopeKey) || 0, sequence));
    });
    const ruleReservations = new Map();
    const reserveSequence = (ruleKey) => { const rule = state.numberingRules.get(ruleKey) || {}; const used = ruleReservations.get(ruleKey) || 0; ruleReservations.set(ruleKey, used + 1); return Math.max(1, Number(rule.nextNumber || 1)) + used * Math.max(1, Number(rule.incrementBy || 1)); };
    entries.forEach(({ node, part, level }) => {
      const parentNode = localNodes.find((item) => nodeKey(item) === node.parentDetailId); const parentPart = partById(parentNode?.partId || rootPart.value);
      const isChildNumbered = part.itemType === "WIP" || (part.itemType === "RAW" && part.rawType === "MATERIAL");
      if (!isChildNumbered) {
        const rawGeneral = part.itemType === "RAW" && part.rawType === "PURCHASE_PART" && !part.hasDrawing; const ruleKey = rawGeneral ? "PART_RAW" : part.partType === "COMP" ? "PART_FG_COMPONENT" : "PART_FG_NON_COMPONENT"; const rule = state.numberingRules.get(ruleKey) || {}; const sequence = reserveSequence(ruleKey);
        part.partCode = rule.isActive === false ? part.partCode : formatPreviewNumber(rule, sequence, { customer: part.customerCode || inheritedCustomerCode(), rev: part.noRevisi || "00" }); part.pendingRuleKey = ruleKey; part.branchCode = ""; part.processSequence = 0; part.bomLevel = level; part.pendingPayload = { ...(part.pendingPayload || {}), partType: part.partType, parentBranchCode: "", reserveBranchAlpha: false };
        return;
      }
      if (part.itemType === "WIP" && parentPart.id && parentPart.partType !== "COMP") part.partType = "STANDARD";
      const ruleKey = part.partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT"; const rule = state.numberingRules.get(ruleKey) || {}; const step = Math.max(1, Number(rule.processStep || 10)); const scopeKey = processSequenceScopeKey(node); let sequenceCursor = sequenceCursorByScope.get(scopeKey) || 0;
      const fixedSequence = Number(part.pendingPayload?.fixedProcessSequence || 0);
      sequenceCursor = fixedSequence > 0 ? fixedSequence : Math.floor(sequenceCursor / step) * step + step;
      sequenceCursorByScope.set(scopeKey, Math.max(sequenceCursorByScope.get(scopeKey) || 0, sequenceCursor));
      let branchCode = "";
      if (part.itemType === "WIP") {
        const siblings = localNodes.filter((item) => (item.parentDetailId || null) === (node.parentDetailId || null) && partById(item.partId).itemType === "WIP"); const siblingIndex = siblings.findIndex((item) => nodeKey(item) === nodeKey(node));
        const inheritedBranch = parentPart.itemType === "WIP" ? String(parentPart.branchCode || "") : ""; branchCode = siblings.length > 1 ? `${inheritedBranch}${alphaSequence(Math.max(0, siblingIndex))}` : inheritedBranch;
      }
      const source = sequenceSourceForNode(node); const pendingPayload = { ...(part.pendingPayload || {}), partType: part.partType, componentLevel: Math.max(1, Math.floor(sequenceCursor / step)), processOrder: Math.max(1, Math.floor(sequenceCursor / step)), fixedProcessSequence: fixedSequence > 0 ? fixedSequence : undefined, sequenceSourcePartCode: source.partCode || "", parentBranchCode: parentPart.itemType === "WIP" ? parentPart.branchCode || "" : "", reserveBranchAlpha: part.itemType === "WIP" };
      part.partCode = previewChildCode(pendingPayload, sequenceCursor, branchCode); part.branchCode = branchCode; part.processSequence = sequenceCursor; part.componentLevel = pendingPayload.componentLevel; part.bomLevel = level; part.pendingRuleKey = ruleKey; part.pendingPayload = pendingPayload;
    });
  }
  function partMatchesQuickKind(part, kind) {
    if (kind === "fg") return part.itemType === "FG";
    if (kind === "child") return part.itemType === "WIP";
    if (kind === "purchase") return part.itemType === "RAW" && part.rawType === "PURCHASE_PART";
    return part.itemType === "RAW" && part.rawType === "MATERIAL";
  }
  function openQuickPartDialog(kind, options = {}) {
    state.quickPartKind = kind;
    state.quickInsertBefore = options.insertBefore || null;
    const inserting = Boolean(state.quickInsertBefore); const fg = kind === "fg"; const material = kind === "material"; const purchase = kind === "purchase";
    const labels = inserting ? ["SISIP PROSES", "Tambah Child di Atas"] : fg ? ["FINISHED GOOD", "Tambah FG"] : material ? ["RAW MATERIAL", "Tambah Raw Material"] : purchase ? ["PURCHASE PART", "Tambah Purchase Part"] : ["CHILD PART", "Tambah Child Part"];
    document.getElementById("bom-part-kind-label").textContent = labels[0];
    document.getElementById("bom-part-dialog-title").textContent = labels[1];
    document.getElementById("quick-part-type-wrap").classList.toggle("bom-field-disabled", purchase);
    document.getElementById("quick-part-type").disabled = purchase;
    document.getElementById("quick-part-type").value = material || purchase || fg ? "STANDARD" : "COMP";
    document.getElementById("quick-part-level-wrap").classList.toggle("d-none", inserting || purchase || fg || isNewBomMode());
    document.getElementById("quick-position-mode-wrap").classList.toggle("d-none", inserting || purchase || fg || isNewBomMode());
    document.getElementById("quick-position-mode").classList.toggle("d-none", inserting || purchase || fg || isNewBomMode());
    document.getElementById("quick-has-drawing-wrap").classList.toggle("d-none", !purchase);
    document.getElementById("quick-material-wrap").classList.toggle("d-none", !material);
    if (!material) document.getElementById("quick-material-id").value = "";
    document.getElementById("quick-has-drawing").checked = false;
    document.getElementById("quick-part-level").value = inserting ? Math.max(1, Math.floor(state.quickInsertBefore.fixedSequence / state.quickInsertBefore.step)) : nextSiblingProcessOrder();
    document.getElementById("quick-position-mode").value = inserting && state.sequenceInsertionPolicy.locked ? "INSERT" : "MAIN";
    if (inserting) {
      document.getElementById("quick-sequence-source").textContent = state.quickInsertBefore.shiftExisting
        ? `Sequence ${String(state.quickInsertBefore.targetSequence).padStart(3, "0")} dipakai part baru; part lama dan setelahnya digeser +${state.quickInsertBefore.step}.`
        : `Kode lama tetap. Part baru memakai slot ${String(state.quickInsertBefore.fixedSequence).padStart(3, "0")} sebelum ${String(state.quickInsertBefore.targetSequence).padStart(3, "0")}.`;
    } else renderSequenceSourceHint();
    const customerCode = inheritedCustomerCode(); document.getElementById("quick-customer-code").value = customerCode;
    const existing = state.parts.filter((part) => partMatchesQuickKind(part, kind) && (purchase || !customerCode || part.customerCode === customerCode || part.customerCodes?.includes(customerCode)));
    setOptions(document.getElementById("quick-existing-part"), existing, "id", optionLabel, "Pilih part existing");
    document.querySelector(".bom-existing-part")?.classList.toggle("d-none", inserting);
    document.querySelector(".bom-dialog-divider")?.classList.toggle("d-none", inserting);
    document.getElementById("quick-existing-hint").textContent = customerCode && !purchase ? `Difilter mengikuti customer parent: ${customerCode}.` : "Daftar difilter mengikuti tipe part.";
    document.getElementById("bom-part-create-error").classList.add("d-none"); document.getElementById("bom-part-dialog").showModal();
  }

  function openInsertBeforeDialog() {
    clearError();
    const target = selectedNode(); const targetPart = partById(target?.partId);
    if (!target || target.external || targetPart.isPending) return showError("Pilih child process existing yang akan diberi proses sebelumnya.");
    if (state.pendingSequenceShift) return showError("Simpan perubahan sisipan yang sedang aktif sebelum membuat sisipan berikutnya.");
    const targetSequence = Number(targetPart.processSequence || 0);
    if (!(targetSequence > 0) || !(targetPart.itemType === "WIP" || (targetPart.itemType === "RAW" && targetPart.rawType === "MATERIAL"))) {
      return showError("Child terpilih belum memiliki process sequence yang dapat disisipi.");
    }
    const ruleKey = targetPart.partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT";
    const step = Math.max(1, Number(state.numberingRules.get(ruleKey)?.processStep || 10));
    let fixedSequence = targetSequence;
    const shiftExisting = !state.sequenceInsertionPolicy.locked;
    if (!shiftExisting) {
      const previousMain = Math.max(0, Math.floor((targetSequence - 1) / step) * step);
      const used = new Set(state.nodes.filter((node) => !node.external && processSequenceScopeKey(node) === processSequenceScopeKey(target)).map((node) => Number(partById(node.partId).processSequence || 0)));
      fixedSequence = previousMain + 1;
      while (fixedSequence < targetSequence && used.has(fixedSequence)) fixedSequence += 1;
      if (fixedSequence >= targetSequence) return showError(`Slot sisipan sebelum ${String(targetSequence).padStart(3, "0")} sudah penuh.`);
    }
    openQuickPartDialog("child", {
      insertBefore: {
        targetKey: nodeKey(target),
        originalParentId: target.parentDetailId || null,
        targetSequence,
        fixedSequence,
        shiftExisting,
        step,
        scopeKey: processSequenceScopeKey(target),
      },
    });
  }

  function replacePartProcessSequence(partCode, processSequence) {
    const suffix = `-${String(processSequence).padStart(3, "0")}`;
    return /-\d{2,3}$/.test(String(partCode || "")) ? String(partCode).replace(/-\d{2,3}$/, suffix) : `${partCode}${suffix}`;
  }

  function previewSequenceShift(context) {
    if (!context?.shiftExisting) return null;
    const affected = new Map();
    state.nodes.filter((node) => !node.external && processSequenceScopeKey(node) === context.scopeKey).forEach((node) => {
      const part = partById(node.partId); const sequence = Number(part.processSequence || 0);
      if (!part.isPending && part.id && sequence >= context.targetSequence) affected.set(part.id, part);
    });
    if (!affected.size) throw new Error("Part sequence yang akan digeser tidak ditemukan.");
    const originals = [...affected.values()].map((part) => ({ id: part.id, partCode: part.partCode, processSequence: Number(part.processSequence), componentLevel: Number(part.componentLevel || 0) }));
    originals.forEach((original) => {
      const part = partById(original.id); const nextSequence = original.processSequence + context.step;
      part.partCode = replacePartProcessSequence(original.partCode, nextSequence);
      part.processSequence = nextSequence;
      part.componentLevel = Math.max(1, Math.floor(nextSequence / context.step));
    });
    state.pendingSequenceShift = { mbomHeaderId: state.recordId, partIds: originals.map((item) => item.id), fromSequence: context.targetSequence, shiftBy: context.step, originals, applied: false };
    return state.pendingSequenceShift;
  }

  function restoreSequenceShiftPreview(shift = state.pendingSequenceShift) {
    (shift?.originals || []).forEach((original) => {
      const part = partById(original.id);
      if (part.id) Object.assign(part, { partCode: original.partCode, processSequence: original.processSequence, componentLevel: original.componentLevel });
    });
    if (state.pendingSequenceShift === shift) state.pendingSequenceShift = null;
  }
  function addExistingQuickPart() {
    const partId = document.getElementById("quick-existing-part").value; const errorBox = document.getElementById("bom-part-create-error");
    if (!partId) { errorBox.textContent = "Pilih part existing terlebih dahulu."; errorBox.classList.remove("d-none"); return; }
    addNode(partId); const node = selectedNode(); if (node && !node.uomCode) node.uomCode = document.getElementById("quick-part-uom").value || rootUom.value || "";
    document.getElementById("bom-part-dialog").close(); autoLayout(); renderInspector();
  }
  async function createQuickPart(event) {
    event.preventDefault(); const fg = state.quickPartKind === "fg"; const material = state.quickPartKind === "material"; const purchase = state.quickPartKind === "purchase"; const raw = material || purchase; const errorBox = document.getElementById("bom-part-create-error"); const submit = document.getElementById("bom-part-create-submit");
    const insertContext = state.quickInsertBefore; const insertTarget = insertContext ? state.nodes.find((node) => nodeKey(node) === insertContext.targetKey) : null;
    const customerCode = document.getElementById("quick-customer-code").value || null; const hasDrawing = purchase && document.getElementById("quick-has-drawing").checked;
    const processOrder = insertContext ? Math.max(1, Math.floor(insertContext.fixedSequence / insertContext.step)) : Number(document.getElementById("quick-part-level").value || 1); const isInsertion = insertContext ? !insertContext.shiftExisting : document.getElementById("quick-position-mode").value === "INSERT";
    const parentKey = insertContext ? insertContext.originalParentId : state.selectedId || null; const parentNode = state.nodes.find((node) => nodeKey(node) === parentKey); const parentPart = partById(parentNode?.partId || rootPart.value); const siblings = state.nodes.filter((node) => !node.external && (node.parentDetailId || null) === (parentKey || null)).map((node) => partById(node.partId)); const numberingSiblings = insertTarget ? siblings.filter((part) => part.id !== insertTarget.partId) : siblings;
    const rule = quickNumberingRule(); const step = Math.max(1, Number(rule.processStep || 10)); const insertionOffset = Math.max(1, Number(rule.insertionStart || step + 1) - step); const expectedSequence = insertContext ? insertContext.fixedSequence : processOrder * step + (isInsertion ? insertionOffset : 0);
    const sameProcessSiblings = isInsertion ? [] : numberingSiblings.filter((part) => part.itemType !== "FG" && Number(part.processSequence) === expectedSequence);
    const partType = purchase ? "STANDARD" : document.getElementById("quick-part-type").value; const sequenceSource = sequenceSourcePart(state.quickPartKind);
    const uom = document.getElementById("quick-part-uom").value || rootUom.value || "";
    const payload = { partName: document.getElementById("quick-part-name").value.trim(), partNumber: document.getElementById("quick-part-number").value.trim() || null, customerCode, noRevisi: document.getElementById("quick-part-revision").value.trim() || "00", itemType: fg ? "FG" : raw ? "RAW" : "WIP", rawType: material ? "MATERIAL" : purchase ? "PURCHASE_PART" : null, materialId: material ? document.getElementById("quick-material-id").value || null : null, partType, hasDrawing, componentLevel: purchase || fg ? 0 : processOrder, processOrder: purchase || fg ? undefined : processOrder, isInsertion: purchase || fg ? false : isInsertion, fixedProcessSequence: insertContext ? expectedSequence : undefined, sequenceSourcePartCode: sequenceSource.partCode || "", parentBranchCode: raw ? "" : parentPart.branchCode || "", siblingBranchCodes: raw ? [] : sameProcessSiblings.map((part) => part.branchCode || ""), siblingPartIds: raw ? [] : sameProcessSiblings.map((part) => part.id).filter(Boolean), reserveBranchAlpha: !fg && !raw, usedProcessSequences: numberingSiblings.map((part) => Number(part.processSequence)).filter((value) => value > 0), status: "Active", canPurchase: raw, canManufacture: fg || !raw, canSell: fg, canStore: true, canUseInBom: true, canSubcontract: false, canTrackLot: raw, canTrackSerial: false, baseUomCode: uom || null, stockUomCode: uom || null, productionUomCode: fg || !raw ? uom || null : null, purchaseUomCode: raw ? uom || null : null, salesUomCode: fg ? uom || null : null };
    if (!payload.partName) { errorBox.textContent = "Nama part wajib diisi."; errorBox.classList.remove("d-none"); return; }
    if (material && !payload.materialId) { errorBox.textContent = "Raw material wajib dihubungkan ke Master Material."; errorBox.classList.remove("d-none"); return; }
    if (!(purchase && !hasDrawing) && !customerCode) { errorBox.textContent = "Customer Code wajib untuk pola penomoran part ini."; errorBox.classList.remove("d-none"); return; }
    submit.disabled = true;
    try {
      if (insertContext?.shiftExisting) previewSequenceShift(insertContext);
      state.pendingPartCounter += 1; const tempId = `temp_part_${createKey()}`;
      const provisional = provisionalPartIdentity(payload, numberingSiblings, parentPart, expectedSequence);
      const pending = { ...payload, ...provisional, material: state.materials.find((item) => item.id === payload.materialId) || null, id: tempId, bomLevel: parentNode ? computeLevel(parentNode) + 2 : 1, isPending: true, pendingPayload: payload };
      state.parts.push(pending); setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama"); setOptions(document.getElementById("node-part"), state.parts, "id", optionLabel, "Pilih part"); renderPalette();
      addNode(pending.id, parentKey); const node = selectedNode(); if (node) node.uomCode = uom;
      if (insertTarget && node) insertTarget.parentDetailId = nodeKey(node);
      state.quickInsertBefore = null;
      document.getElementById("bom-part-dialog").close(); event.target.reset(); document.getElementById("quick-part-revision").value = "00"; autoLayout(); renderAll(); renderInspector();
    } catch (error) { restoreSequenceShiftPreview(); errorBox.textContent = error.message; errorBox.classList.remove("d-none"); } finally { submit.disabled = false; }
  }

  function sequenceSourceForNode(node) {
    let parent = node ? state.nodes.find((item) => nodeKey(item) === node.parentDetailId) : null; const visited = new Set();
    while (parent && !visited.has(nodeKey(parent))) {
      visited.add(nodeKey(parent)); const part = partById(parent.partId);
      if (part.itemType === "FG") return part;
      parent = state.nodes.find((item) => nodeKey(item) === parent.parentDetailId);
    }
    const root = partById(rootPart.value);
    return root.itemType === "FG" ? root : {};
  }

  function processSequenceScopeKey(node) {
    let parent = node ? state.nodes.find((item) => nodeKey(item) === node.parentDetailId) : null; const visited = new Set();
    while (parent && !visited.has(nodeKey(parent))) {
      visited.add(nodeKey(parent)); const part = partById(parent.partId);
      if (part.itemType === "FG") return `fg:${part.id}`;
      parent = state.nodes.find((item) => nodeKey(item) === parent.parentDetailId);
    }
    const root = partById(rootPart.value);
    return root.itemType === "FG" ? `fg:${root.id}` : `root:${root.id || rootPart.value || "unselected"}`;
  }

  function pendingMaterializationOrder() {
    const entries = []; const seen = new Set(); const root = partById(rootPart.value);
    if (root.isPending) { entries.push({ part: root, node: null, level: 0, order: -1 }); seen.add(root.id); }
    state.nodes.filter((node) => !node.external).forEach((node, order) => {
      const part = partById(node.partId); if (!part.isPending || seen.has(part.id)) return;
      entries.push({ part, node, level: computeLevel(node) + 1, order }); seen.add(part.id);
    });
    return entries.sort((a, b) => a.level - b.level || a.order - b.order);
  }

  async function materializePendingParts() {
    const entries = pendingMaterializationOrder();
    const context = { created: [], pending: entries.map((entry) => entry.part), nodePartIds: new Map(state.nodes.map((node) => [nodeKey(node), node.partId])), rootPartId: rootPart.value };
    if (!entries.length) return context;
    const sequenceCursorByScope = new Map(); const usedSequencesByScope = new Map();
    state.nodes.filter((node) => !node.external).forEach((node) => {
      const part = partById(node.partId); const sequence = Number(part.processSequence || 0);
      if (part.isPending || sequence <= 0) return;
      const scopeKey = processSequenceScopeKey(node); const used = usedSequencesByScope.get(scopeKey) || new Set(); used.add(sequence); usedSequencesByScope.set(scopeKey, used);
      sequenceCursorByScope.set(scopeKey, Math.max(sequenceCursorByScope.get(scopeKey) || 0, sequence));
    });

    try { for (const entry of entries) {
      const tempId = entry.part.id; const base = { ...(entry.part.pendingPayload || {}) }; const parentNode = entry.node ? state.nodes.find((item) => nodeKey(item) === entry.node.parentDetailId) : null; const parentPart = partById(parentNode?.partId || rootPart.value);
      if (base.itemType === "WIP" && parentPart.id && parentPart.partType !== "COMP") base.partType = "STANDARD";
      const isChildNumbered = base.itemType === "WIP" || (base.itemType === "RAW" && base.rawType === "MATERIAL");
      const ruleKey = base.partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT"; const step = Math.max(1, Number(state.numberingRules.get(ruleKey)?.processStep || 10));
      const scopeKey = processSequenceScopeKey(entry.node); const usedSequences = usedSequencesByScope.get(scopeKey) || new Set(); let sequenceCursor = sequenceCursorByScope.get(scopeKey) || 0;
      const fixedSequence = Number(base.fixedProcessSequence || 0);
      if (isChildNumbered && fixedSequence > 0) sequenceCursor = fixedSequence;
      else if (isChildNumbered && isNewBomMode()) sequenceCursor = Math.floor(sequenceCursor / step) * step + step;
      else if (isChildNumbered && !isNewBomMode()) {
        const baseOrder = Math.max(1, Number(base.processOrder || base.componentLevel || 1)); const insertionOffset = Math.max(1, Number(state.numberingRules.get(ruleKey)?.insertionStart || step + 1) - step);
        sequenceCursor = baseOrder * step + (base.isInsertion ? insertionOffset : 0); while (usedSequences.has(sequenceCursor)) sequenceCursor += 1;
      }
      if (isChildNumbered) { usedSequences.add(sequenceCursor); usedSequencesByScope.set(scopeKey, usedSequences); sequenceCursorByScope.set(scopeKey, sequenceCursor); }
      const source = isChildNumbered ? sequenceSourceForNode(entry.node) : {};
      if (isChildNumbered && !source.partCode) throw new Error("FG parent belum memiliki kode final sebagai sumber SEQ.");
      const sameLevelParts = entry.node && base.itemType === "WIP" ? state.nodes.filter((node) => !node.external && nodeKey(node) !== nodeKey(entry.node) && (node.parentDetailId || null) === (entry.node.parentDetailId || null) && computeLevel(node) + 1 === entry.level).map((node) => partById(node.partId)).filter((part) => part.id && !part.isPending && part.itemType === "WIP") : [];
      const payload = { ...base, bomLevel: entry.level, processSequence: isChildNumbered ? sequenceCursor : 0, processOrder: isChildNumbered ? Math.max(1, Math.floor(sequenceCursor / step)) : undefined, componentLevel: isChildNumbered ? Math.max(1, Math.floor(sequenceCursor / step)) : 0, isInsertion: false, sequenceSourcePartCode: source.partCode || "", parentBranchCode: base.itemType === "WIP" && parentPart.itemType === "WIP" ? parentPart.branchCode || "" : "", siblingBranchCodes: sameLevelParts.map((part) => part.branchCode || ""), siblingPartIds: sameLevelParts.map((part) => part.id), reserveBranchAlpha: base.itemType === "WIP", usedProcessSequences: [] };
      const response = await fetch("/master-data/api/parts", { method: "POST", headers: authHeaders(true), body: JSON.stringify(payload) }); const created = await response.json().catch(() => ({}));
      if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
      if (!response.ok) throw new Error(created.message || `Part sementara ${entry.part.partName || entry.part.partCode} gagal disimpan.`);
      (created.renamedSiblings || []).forEach((renamed) => { const sibling = partById(renamed.id); if (sibling.id) { sibling.partCode = renamed.partCode; sibling.branchCode = renamed.branchCode; } });
      created._createdThisSave = true; context.created.push({ tempId, created });
      state.parts = state.parts.filter((part) => part.id !== tempId); state.parts.push(created);
      state.nodes.forEach((node) => { if (node.partId === tempId) node.partId = created.id; });
      if (context.rootPartId === tempId) { setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama"); rootPart.value = created.id; }
    } } catch (error) { error.materializationContext = context; throw error; }
    setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama"); setOptions(document.getElementById("node-part"), state.parts, "id", optionLabel, "Pilih part"); renderPalette(); renderRoot(); renderAll();
    return context;
  }

  async function rollbackMaterializedParts(context) {
    if (!context?.created?.length) return;
    await Promise.allSettled([...context.created].reverse().map(({ created }) => fetch(`/master-data/api/parts/${encodeURIComponent(created.id)}`, { method: "DELETE", headers: authHeaders() })));
    const createdIds = new Set(context.created.map((item) => item.created.id)); state.parts = state.parts.filter((part) => !createdIds.has(part.id));
    context.pending.forEach((part) => { if (!state.parts.some((item) => item.id === part.id)) state.parts.push(part); });
    state.nodes.forEach((node) => { const original = context.nodePartIds.get(nodeKey(node)); if (original) node.partId = original; });
    setOptions(rootPart, state.parts, "id", optionLabel, "Pilih produk utama"); rootPart.value = context.rootPartId; setOptions(document.getElementById("node-part"), state.parts, "id", optionLabel, "Pilih part"); renderPalette(); renderRoot(); renderAll();
  }

  async function applyPendingSequenceShift(shift) {
    if (!shift) return null;
    const response = await fetch("/master-data/api/parts/shift-process-sequences", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ mbomHeaderId: shift.mbomHeaderId, partIds: shift.partIds, fromSequence: shift.fromSequence, shiftBy: shift.shiftBy }) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Sequence part lama gagal digeser.");
    (payload.items || []).forEach((item) => {
      const part = partById(item.id);
      if (part.id) Object.assign(part, { partCode: item.partCode, processSequence: item.processSequence, componentLevel: item.componentLevel });
    });
    shift.applied = true;
    return shift;
  }

  async function rollbackPendingSequenceShift(shift) {
    if (!shift) return;
    let rollbackError = null;
    if (shift.applied) {
      try {
        const response = await fetch("/master-data/api/parts/shift-process-sequences", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ mbomHeaderId: shift.mbomHeaderId, partIds: shift.partIds, fromSequence: shift.fromSequence + shift.shiftBy, shiftBy: -shift.shiftBy }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) rollbackError = new Error(payload.message || "Rollback sequence part gagal.");
      } catch (error) { rollbackError = error; }
    }
    restoreSequenceShiftPreview(shift);
    if (!rollbackError) {
      (shift.originals || []).forEach((original) => {
        const part = partById(original.id); const processSequence = original.processSequence + shift.shiftBy;
        if (part.id) Object.assign(part, { partCode: replacePartProcessSequence(original.partCode, processSequence), processSequence, componentLevel: Math.max(1, Math.floor(processSequence / shift.shiftBy)) });
      });
      shift.applied = false;
      state.pendingSequenceShift = shift;
    }
    if (rollbackError) throw rollbackError;
  }

  function serializeBomNode(node, parentDetailId = node.parentDetailId || null, levelComponent = computeLevel(node) + 1) {
    materialConsumption(node); return { ...commercial.detailFields(node), id: node.id, clientKey: node.clientKey, parentDetailId, levelComponent, partId: node.partId, qty: Number(node.qty), uomCode: node.uomCode || null, category: node.category, assemblyPolicyOverride: node.assemblyPolicyOverride, leadTime: Number(node.leadTime || 0), leadTimeUnit: node.leadTimeUnit || "HOUR", materialThickness: node.materialThickness ?? null, materialWidth: node.materialWidth ?? null, materialPitch: node.materialPitch ?? null, materialCavity: node.materialCavity ?? null, materialDensity: node.materialDensity ?? null, materialFormId: node.materialFormId || null, materialScheme: node.materialScheme || "DEFAULT", defaultGrossWeight: node.defaultGrossWeight ?? null, alternateMaterialFormId: node.alternateMaterialFormId || null, alternateMaterialPitch: node.alternateMaterialPitch ?? null, alternateMaterialCavity: node.alternateMaterialCavity ?? null, alternateGrossWeight: node.alternateGrossWeight ?? null, grossWeight: Number(node.grossWeight || 0), notes: node.notes || null, mbomProcesses: node.processes || [] };
  }

  function belongsToChildAssembly(node) {
    let parent = state.nodes.find((item) => !item.external && nodeKey(item) === node.parentDetailId); const visited = new Set();
    while (parent && !visited.has(nodeKey(parent))) {
      visited.add(nodeKey(parent)); if (partById(parent.partId).itemType === "FG" || parent.linkedBom) return true;
      parent = state.nodes.find((item) => !item.external && nodeKey(item) === parent.parentDetailId);
    }
    return false;
  }

  async function createBomDocument(header, details) {
    const response = await fetch("/modules/api/manufacturing-bom/bill-of-materials", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ header, details }) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || payload.detail || "BOM turunan gagal disimpan.");
    return payload;
  }

  async function saveGeneratedChildBoms(created = []) {
    const seenPartIds = new Set();
    const assemblies = state.nodes.filter((node) => {
      const part = partById(node.partId); const mustHaveBom = part.itemType === "FG";
      const eligible = !node.external && node.partId && node.partId !== rootPart.value && !seenPartIds.has(node.partId) && mustHaveBom && !linkedBomForPart(node.partId) && !node.linkedBom;
      if (eligible) seenPartIds.add(node.partId);
      return eligible;
    });
    for (const assembly of assemblies) {
      const subtree = []; const queue = state.nodes
        .filter((node) => !node.external && node.parentDetailId === nodeKey(assembly))
        .map((node) => ({ node, parentRef: null, level: 1 }));
      while (queue.length) {
        const current = queue.shift(); subtree.push(current);
        const currentPart = partById(current.node.partId);
        // FG turunan mempunyai MBOM sendiri. Di MBOM parent cukup menjadi satu detail sub-assembly.
        if (currentPart.itemType === "FG") continue;
        state.nodes
          .filter((node) => !node.external && node.parentDetailId === nodeKey(current.node))
          .forEach((node) => queue.push({ node, parentRef: nodeKey(current.node), level: current.level + 1 }));
      }
      const payload = await createBomDocument({
        partId: assembly.partId,
        uomCode: assembly.uomCode || rootUom.value || null,
        revision: 1,
        effectiveDate: document.getElementById("bom-effective").value || null,
        expiryDate: document.getElementById("bom-expiry").value || null,
        notes: `BOM turunan dibuat dari canvas ${partById(rootPart.value).partCode || "BOM utama"}`,
      }, subtree.map(({ node, parentRef, level }) => {
        const { id: _sourceDetailId, ...detail } = serializeBomNode(node, parentRef, level);
        return detail;
      }));
      state.bomByPartId.set(assembly.partId, payload);
      assembly.linkedBom = payload;
      created.push(payload);
    }
    return created;
  }

  async function saveBom() {
    if (!isNewBomMode() && !state.revisionPolicy?.isLatest) return showError("Buka revisi terbaru dan muat ulang status produksi sebelum menyimpan.");
    clearError(); const localNodes = state.nodes.filter((node) => !node.external); if (!rootPart.value) return showError("Produk utama wajib dipilih."); if (!localNodes.length) return showError("Tambahkan minimal satu komponen ke canvas BOM.");
    const invalid = localNodes.find((node) => !node.partId || !(Number(node.qty) > 0)); if (invalid) { state.selectedId = nodeKey(invalid); renderAll(); renderInspector(); return showError("Semua node wajib memiliki Part dan Qty lebih dari 0."); }
    const validation = panels.validate();
    if (validation.errors.length) return showError(validation.errors.join("\n"));
    const invalidMaterial = localNodes.find((node) => { const part = partById(node.partId); if (part.itemType !== "RAW" || part.rawType !== "MATERIAL") return false; return !node.materialFormId || (node.alternateMaterialFormId && node.alternateMaterialFormId === node.materialFormId) || (node.materialScheme === "ALTERNATIVE" && (!node.alternateMaterialFormId || !(Number(node.alternateMaterialPitch) > 0))); });
    if (invalidMaterial) { state.selectedId = nodeKey(invalidMaterial); renderAll(); renderInspector(); return showError("Raw material wajib memiliki Form default. Form alternatif harus berbeda dan dilengkapi pitch bila dipakai."); }
    const invalidProcessNode = localNodes.find((node) => { const sequences = (node.processes || []).map((item) => Number(item.sequence)); return (node.processes || []).some((item) => !item.processId || !(Number(item.sequence) > 0)) || new Set(sequences).size !== sequences.length; });
    if (invalidProcessNode) { state.selectedId = nodeKey(invalidProcessNode); renderAll(); renderInspector(); return showError("Setiap proses wajib dipilih, sequence harus lebih dari 0 dan tidak boleh duplikat dalam satu node."); }
    if (config.mode === "draft") {
      if (!confirm("Approve draft BOM? Seluruh kode provisional akan dihitung ulang dan part/BOM baru akan masuk ke sistem.")) return;
      try { await flushDraftAutosave(); } catch (error) { return showError(`Draft belum berhasil disimpan: ${error.message}`); }
      state.approving = true; setDraftStatus("Memproses approval…", "saving");
    }
    const button = document.getElementById("bom-save"); button.disabled = true; button.querySelector("i").classList.remove("d-none");
    let materialization = null; let sequenceShift = state.pendingSequenceShift; let createdMainBom = null; const createdChildBoms = [];
    try {
      await applyPendingSequenceShift(sequenceShift);
      materialization = await materializePendingParts();
      const revisionMode = !isNewBomMode() ? state.revisionPolicy.mode : null;
      const revisionNote = document.getElementById("bom-revision-note")?.value?.trim() || null;
      if (revisionMode === "newRevision" && !revisionNote) throw new Error("Catatan revisi wajib diisi agar perubahan struktur dapat diaudit.");
      const header = { partId: rootPart.value, uomCode: rootUom.value || null, revision: Number(document.getElementById("bom-revision").value || 1), effectiveDate: document.getElementById("bom-effective").value || null, expiryDate: document.getElementById("bom-expiry").value || null, notes: document.getElementById("bom-notes").value || null, revisionMode, revisionNote, expirePreviousRevision: true };
      // Parent MBOM hanya menyimpan FG/sub-assembly sebagai referensi. Isi turunannya
      // disimpan pada MBOM milik FG tersebut agar tidak ada dua titik pemeliharaan.
      const details = localNodes.filter((node) => !belongsToChildAssembly(node)).map((node) => serializeBomNode(node));
      if (revisionMode === "correction") details.push(...state.omittedNodes.map((node) => node.sourceDetail || serializeBomNode(node)));
      await saveGeneratedChildBoms(createdChildBoms);
      const url = isNewBomMode() ? "/modules/api/manufacturing-bom/bill-of-materials" : `/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(state.recordId)}`;
      const response = await fetch(url, { method: isNewBomMode() ? "POST" : "PATCH", headers: authHeaders(true), body: JSON.stringify({ revisionMode, header, details }) });
      const payload = await response.json().catch(() => ({})); if (response.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); if (!response.ok) throw new Error(payload.message || payload.detail || "BOM gagal disimpan.");
      if (isNewBomMode()) createdMainBom = payload;
      if (state.draftId) await draftApi(`/modules/api/manufacturing-bom/bill-of-materials/drafts/${encodeURIComponent(state.draftId)}/complete`, { method: "POST", body: JSON.stringify({ approvedNoReg: payload.noReg }) });
      location.replace(`/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(payload.noReg || state.noReg)}`);
    } catch (error) {
      if (createdMainBom?.noReg) await fetch(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(createdMainBom.noReg)}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
      await Promise.allSettled(createdChildBoms.map((bom) => fetch(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(bom.noReg)}`, { method: "DELETE", headers: authHeaders() })));
      await rollbackMaterializedParts(materialization || error.materializationContext);
      let rollbackMessage = "";
      try { await rollbackPendingSequenceShift(sequenceShift); } catch (rollbackError) { rollbackMessage = ` Rollback sequence perlu diperiksa: ${rollbackError.message}`; }
      state.approving = false; showError(`${error.message}${rollbackMessage}`); button.disabled = false; button.querySelector("i").classList.add("d-none"); renderInspector(); scheduleDraftAutosave();
    }
  }

  document.querySelectorAll("[data-canvas-tab]").forEach((button) => {
    button.addEventListener("click", () => setInspectorTab(button.dataset.canvasTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const tabs = [...document.querySelectorAll("[data-canvas-tab]")]; const index = tabs.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setInspectorTab(tabs[next].dataset.canvasTab); tabs[next].focus();
    });
  });
  document.getElementById("bom-inspector-close").addEventListener("click", () => { state.selectedId = null; renderAll(); renderInspector(); });
  document.getElementById("bom-toggle-library").addEventListener("click", (event) => {
    const collapsed = document.querySelector(".bom-workspace").classList.toggle("library-collapsed");
    event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  });
  if (window.innerWidth < 900) { document.querySelector(".bom-workspace").classList.add("library-collapsed"); document.getElementById("bom-toggle-library").setAttribute("aria-expanded", "false"); }
  document.getElementById("bom-effective").addEventListener("change", () => { renderAll(); renderInspector(); });
  rootPart.addEventListener("change", () => { renderRoot(); renderAll(); });
  document.getElementById("bom-toggle-notes").addEventListener("click", () => document.getElementById("bom-notes").classList.toggle("d-none"));
  document.getElementById("bom-part-search").addEventListener("input", renderPalette);
  attachCanvasPan();
  canvas.addEventListener("click", (event) => { if (event.target === canvas || event.target.id === "bom-connectors") { state.selectedId = null; renderAll(); renderInspector(); } });
  document.getElementById("bom-zoom-in").addEventListener("click", () => setScale(state.scale + .1)); document.getElementById("bom-zoom-out").addEventListener("click", () => setScale(state.scale - .1));
  document.getElementById("bom-fit").addEventListener("click", fitCanvas);
  if (editable) {
    document.getElementById("bom-auto-layout").addEventListener("click", () => { autoLayout(); fitCanvas(); }); document.getElementById("bom-save").addEventListener("click", saveBom); document.getElementById("bom-make-draft")?.addEventListener("click", makeDraft);
    const bindings = { "node-part": ["partId", String], "node-qty": ["qty", Number], "node-uom": ["uomCode", String], "node-parent": ["parentDetailId", String], "node-category": ["category", String], "node-policy": ["assemblyPolicyOverride", String], "node-lead-time": ["leadTime", Number], "node-lead-time-unit": ["leadTimeUnit", String], "node-notes": ["notes", String] };
    Object.entries(bindings).forEach(([id, [field, cast]]) => document.getElementById(id).addEventListener("change", async function () {
      const node = selectedNode(); if (!node || node.external) return;
      if (field === "partId") {
        const descendantKeys = descendantsOf(nodeKey(node));
        state.nodes = state.nodes.filter((item) => !(item.external && descendantKeys.has(nodeKey(item))));
        descendantKeys.add(nodeKey(node));
        [...state.expandedBoms].filter((key) => [...descendantKeys].some((id) => key.startsWith(`${id}:`))).forEach((key) => state.expandedBoms.delete(key));
        node.linkedBomLoaded = false;
      }
      node[field] = this.value === "" && field === "parentDetailId" ? null : cast(this.value);
      if (field === "category" && node.category !== "Purchase") { node.materialSupplyType = "SUPPLIER_PURCHASE"; node.supplyCustomerId = null; }
      if (field === "partId") {
        node.part = partById(node.partId);
        (node.processes || []).forEach((route) => window.BomMachinePolicy.clearUnrelatedDies(route, state.dies, node.partId));
        Object.assign(node, { supplierId: node.part.supplierId || null, supplyCustomerId: null, materialSupplyType: "SUPPLIER_PURCHASE" });
        for (const key of ["materialThickness", "materialWidth", "materialDensity", "materialPitch", "materialCavity", "materialFormId", "alternateMaterialFormId", "alternateMaterialPitch", "alternateMaterialCavity", "defaultGrossWeight", "alternateGrossWeight", "grossWeight"]) node[key] = null;
        node.materialScheme = "DEFAULT";
        node.linkedBom = linkedBomForPart(node.partId);
        if (node.linkedBom) await expandLinkedBom(node, node.linkedBom).catch((error) => showError(`BOM turunan gagal dimuat: ${error.message}`));
        autoLayout();
      } else if (field === "parentDetailId") autoLayout();
      else { renderAll(); renderInspector(); }
    }));
    document.getElementById("node-add-child").addEventListener("click", () => openQuickPartDialog("child"));
    document.getElementById("node-insert-before").addEventListener("click", openInsertBeforeDialog);
    document.getElementById("node-delete").addEventListener("click", () => { const node = selectedNode(); if (!node) return; if (state.pendingSequenceShift) return showError("Selesaikan Simpan BOM terlebih dahulu sebelum menghapus node pada sisipan sequence."); if (!confirm("Hapus node ini beserta seluruh child-nya?")) return; const remove = descendantsOf(nodeKey(node)); remove.add(nodeKey(node)); state.nodes = state.nodes.filter((item) => !remove.has(nodeKey(item))); state.selectedId = null; autoLayout(); });
    [["node-material-pitch", "materialPitch"], ["node-material-cavity", "materialCavity"]].forEach(([id, field]) => document.getElementById(id).addEventListener("change", function () { const node = selectedNode(); if (!node || node.external) return; node[field] = this.value === "" ? null : Number(this.value); materialConsumption(node); renderAll(); renderInspector(); }));
    [["node-material-form", "materialFormId"], ["node-material-scheme", "materialScheme"], ["node-material-alt-form", "alternateMaterialFormId"]].forEach(([id, field]) => document.getElementById(id).addEventListener("change", function () { const node = selectedNode(); if (!node || node.external) return; node[field] = this.value || null; materialConsumption(node); renderAll(); renderInspector(); }));
    [["node-material-alt-pitch", "alternateMaterialPitch"], ["node-material-alt-cavity", "alternateMaterialCavity"]].forEach(([id, field]) => document.getElementById(id).addEventListener("change", function () { const node = selectedNode(); if (!node || node.external) return; node[field] = this.value === "" ? null : Number(this.value); materialConsumption(node); renderAll(); renderInspector(); }));
    document.getElementById("node-add-process").addEventListener("click", () => { const node = selectedNode(); if (!node || node.external) return; const part = partById(node.partId); const ruleKey = part.partType === "COMP" ? "PART_CHILD_COMPONENT" : "PART_CHILD_NON_COMPONENT"; const step = Math.max(1, Number(state.numberingRules.get(ruleKey)?.processStep || 10)); const nextSequence = Math.max(0, ...(node.processes || []).map((item) => Number(item.sequence || 0))) + step; node.processes.push({ processId: "", routingMode: node.category === "Vendor" ? "VENDOR" : "INHOUSE", vendorId: null, machineId: null, machineSpecificationCode: "", alternativeMachineIds: [], sequence: nextSequence, cycleTime: 0, notes: null }); renderNodeProcesses(node); renderAll(); });
    document.getElementById("node-process-list").addEventListener("input", (event) => {
      const node = selectedNode(); const field = event.target.dataset.processField;
      if (!node || node.external || !["cycleTime", "notes"].includes(field)) return;
      const row = event.target.closest("[data-process-index]"); const process = node.processes?.[Number(row?.dataset.processIndex)];
      if (!process) return;
      process[field] = field === "cycleTime" ? Number(event.target.value || 0) : event.target.value || null;
      if (field === "cycleTime") {
        const cost = commercial.processCost(process, node); const amount = row.querySelector(".bom-canvas-cost strong");
        if (amount) amount.textContent = cost.found ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(cost.value) : "Belum lengkap";
        panels.renderOverview(); panels.renderCosts(node);
      }
      scheduleDraftAutosave();
    });
    document.getElementById("node-process-list").addEventListener("change", (event) => {
      const node = selectedNode(); if (!node || node.external) return;
      const process = node.processes?.[Number(event.target.closest("[data-process-index]")?.dataset.processIndex)];
      if (!process) return;
      if (window.BomExecutorPolicy.update(process, event.target) || window.BomMachinePolicy.update(process, event.target)) { renderAll(); renderInspector(); return; }
      const field = event.target.dataset.processField; if (!field) return;
      if (field === "routingMode") window.BomExecutorPolicy.changeDefault(process, event.target.value);
      else process[field] = ["sequence", "cycleTime"].includes(field) ? Number(event.target.value || 0) : event.target.value || null;
      if (field === "routingMode") {
        if (process.routingMode === "VENDOR") {
          commercial.autoSelectEligibleVendor(process, node);
        }
      }
      if (field === "processId") { process.process = state.processMaster.find((m) => m.id === process.processId) || null; commercial.autoSelectEligibleVendor(process, node); }
      if (field === "vendorId") process.vendor = state.vendors.find((v) => v.id === process.vendorId) || null;
      if (field === "machineSpecificationCode") {
        const representative = state.machines.find((m) => m.machineSpecificationCode === process.machineSpecificationCode && m.status === "Active");
        process.machineId = representative?.id || null; process.machine = representative || null;
        process.alternativeMachineIds = []; window.BomExecutorPolicy.resetMachines(process); process.diesId = null;
      }
      renderAll(); renderInspector();
    });
    document.getElementById("node-sourcing").addEventListener("change", (event) => {
      const node = selectedNode(); const field = event.target.dataset.nodeField;
      if (!node || node.external || !["supplierId", "materialSupplyType", "supplyCustomerId"].includes(field)) return;
      node[field] = event.target.value || null;
      if (field === "materialSupplyType" && node.materialSupplyType === "CUSTOMER_SUPPLIED" && !node.supplyCustomerId) {
        const customerCode = partById(rootPart.value).customerCode;
        node.supplyCustomerId = state.customers.find((c) => c.customerCode === customerCode)?.id || null;
      }
      renderAll(); renderInspector();
    });
    document.getElementById("node-process-list").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-process]"); const row = event.target.closest("[data-process-index]"); const node = selectedNode(); if (!button || !row || !node || node.external) return; node.processes.splice(Number(row.dataset.processIndex), 1); renderNodeProcesses(node); renderAll(); });
    document.querySelectorAll("[data-create-part]").forEach((button) => button.addEventListener("click", () => openQuickPartDialog(button.dataset.createPart)));
    document.querySelectorAll("[data-inspector-add]").forEach((button) => button.addEventListener("click", () => openQuickPartDialog(button.dataset.inspectorAdd)));
    document.querySelectorAll("[data-add-kind]").forEach((button) => button.addEventListener("click", () => { document.getElementById("bom-add-kind-dialog").close(); openQuickPartDialog(button.dataset.addKind); }));
    document.getElementById("quick-part-type").addEventListener("change", renderSequenceSourceHint);
    document.querySelectorAll("[data-close-add-menu]").forEach((button) => button.addEventListener("click", () => document.getElementById("bom-add-kind-dialog").close()));
    document.getElementById("quick-add-existing").addEventListener("click", addExistingQuickPart);
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById("bom-part-dialog").close()));
    document.getElementById("bom-part-create-form").addEventListener("submit", createQuickPart);
    [rootPart, rootUom, document.getElementById("bom-revision"), document.getElementById("bom-effective"), document.getElementById("bom-expiry"), document.getElementById("bom-notes")].forEach((field) => field?.addEventListener("input", scheduleDraftAutosave));
  }
  initialize();
})();
