(function () {
  const state = JSON.parse(document.getElementById("entity-config").textContent);
  const { config, mode, recordId, recordKey } = state;
  const form = document.getElementById("entity-form");
  const alertBox = document.getElementById("form-alert");
  const saveButton = document.getElementById("save-button");
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  let loadedRecord = null;
  const monthly = config.monthlyPricing ? window.MonthlyPricing : null;
  let monthlyEditor = null;
  let monthlyRecord = null;
  let priceEditBlocked = false;
  const vendorDetailState = { rows: [], processes: [], uoms: [] };

  function authHeaders(extra = {}) { return { Authorization: `Bearer ${token()}`, ...extra }; }
  function redirectLogin() { localStorage.removeItem("token"); sessionStorage.removeItem("token"); location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search)); }
  function valueAt(object, path) { return path.split(".").reduce((value, key) => value == null ? undefined : value[key], object); }
  function html(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function toInputDate(value, includeTime) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString(); return includeTime ? local.slice(0, 16) : local.slice(0, 10); }
  function hasStructuredValue(value) { return Array.isArray(value) ? value.length > 0 : value && typeof value === "object" ? Object.keys(value).length > 0 : value != null && value !== ""; }

  async function resolveLookupOption(field, input, value) {
    const resolved = typeof value === "object" ? value[field.sourceValueKey || field.lookup?.valueKey || "id"] : value;
    if (resolved === undefined || resolved === null || resolved === "") return;
    try {
      const response = await fetch(`/lookups/api/${encodeURIComponent(field.lookup.entity)}/resolve/${encodeURIComponent(resolved)}`, { headers: authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.result?.id) throw new Error(payload.message || "Referensi tidak ditemukan.");
      window.EnterpriseLookup?.setSelected(input, payload.result);
    } catch (_error) {
      window.EnterpriseLookup?.setSelected(input, { id: resolved, text: `${field.label} tersimpan`, active: true });
    }
  }

  async function loadLookup(select) {
    const field = config.fields.find((item) => item.name === select.name) || {};
    const params = new URLSearchParams({ start: "0", length: "500" });
    Object.entries(field.lookupQuery || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    });
    const response = await fetch(`/master-data/api/${select.dataset.lookup}?${params.toString()}`, { headers: authHeaders() });
    if (response.status === 401) return redirectLogin();
    const payload = await response.json().catch(() => ({ data: [] }));
    select._lookupItems = payload.data || [];
    const current = select.value; select.innerHTML = `<option value="">Pilih ${select.closest('.form-field').querySelector('.form-label').textContent.replace('*','').trim().toLowerCase()}</option>`;
    (payload.data || []).forEach((item) => { const option = document.createElement("option"); option.value = valueAt(item, select.dataset.valueKey) ?? ""; const label = valueAt(item, select.dataset.labelKey) || option.value; option.textContent = select.dataset.showValue === "true" && String(label) !== String(option.value) ? `${option.value} — ${label}` : label; select.appendChild(option); });
    if (Array.isArray(field.labelKeys)) {
      (payload.data || []).forEach((item, index) => {
        const label = field.labelKeys
          .map((key) => valueAt(item, key))
          .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
          .join(" \u2014 ");
        if (label && select.options[index + 1]) select.options[index + 1].textContent = label;
      });
    }
    select.value = current;
  }

  async function masterRows(slug) {
    const response = await fetch(`/master-data/api/${encodeURIComponent(slug)}?start=0&length=500&isDeleted=false`, { headers: authHeaders() });
    if (response.status === 401) return redirectLogin();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Master ${slug} gagal dimuat.`);
    return payload.data || payload.items || [];
  }

  function vendorDetailNumber(value) { return value === "" || value == null ? null : Number(value); }
  function syncVendorPriceDetails() {
    const editor = document.getElementById("vendor-price-details-editor");
    const hidden = form.elements.details;
    if (!editor || !hidden) return;
    vendorDetailState.rows = [...editor.querySelectorAll("[data-vendor-price-row]")].map((row, index) => ({
      ...(vendorDetailState.rows[index] || {}),
      ...(monthly ? monthly.read(row) : {}),
      vendorProcessId: row.querySelector("[data-detail-process]").value,
      sequence: index + 1,
      unitPrice: monthly ? null : vendorDetailNumber(row.querySelector("[data-detail-price]").value),
      uomCode: row.querySelector("[data-detail-uom]").value || null,
      minimumOrderQty: vendorDetailNumber(row.querySelector("[data-detail-moq]").value),
      orderMultipleQty: vendorDetailNumber(row.querySelector("[data-detail-multiple]").value),
      minimumCharge: vendorDetailNumber(row.querySelector("[data-detail-minimum]").value),
      notes: row.querySelector("[data-detail-notes]").value || null,
    }));
    // Keep empty editing rows in state so adding/removing rows does not move
    // another process's month overrides. Only selected processes are submitted.
    hidden.value = JSON.stringify(vendorDetailState.rows.filter((row) => row.vendorProcessId).map(({ monthlyOverrides, monthlyResolved, ...row }) => row));
  }

  function renderVendorPriceDetails() {
    const editor = document.getElementById("vendor-price-details-editor");
    if (!editor) return;
    const rows = vendorDetailState.rows.length ? vendorDetailState.rows : [{}];
    if (monthly) {
      const vendorId = form.elements.vendorId?.value;
      editor.innerHTML = rows.map((row,index) => {
        const eligible = vendorDetailState.processes.filter((p) => !vendorId || (p.vendorIds || (p.vendors || []).map((v) => v.id)).includes(vendorId) || p.id === row.vendorProcessId);
        const options = (items,key,label,value) => '<option value="">Pilih</option>' + items.map((item) => `<option value="${html(item[key])}" ${String(item[key]) === String(value || "") ? "selected" : ""}>${html(label(item))}</option>`).join("");
        return `<section class="monthly-vendor-card" data-vendor-price-row><div class="vendor-process-heading"><strong>Proses ${index+1}</strong><button class="btn btn-outline-danger btn-sm" type="button" data-detail-remove="${index}" aria-label="Hapus proses ${index+1}">Hapus</button></div><div class="monthly-vendor-meta"><label>Proses Vendor<select class="form-select" data-searchable-disabled="true" data-detail-process required>${options(eligible,"id",p=>[p.vendorProcessCode,p.vendorProcessName].join(" · "),row.vendorProcessId)}</select></label><label>UOM Harga<select class="form-select" data-searchable-disabled="true" data-detail-uom required>${options(vendorDetailState.uoms,"uomCode",u=>[u.uomCode,u.uomName].join(" · "),row.uomCode)}</select></label><label>MOQ<input class="form-control" data-detail-moq type="number" min="0" step="0.01" value="${html(row.minimumOrderQty ?? "")}"></label><label>Kelipatan Order<input class="form-control" data-detail-multiple type="number" min="0" step="0.01" value="${html(row.orderMultipleQty ?? "")}"></label><label>Minimum Charge<input class="form-control" data-detail-minimum type="number" min="0" step="0.01" value="${html(row.minimumCharge ?? "")}"></label><label class="detail-note">Catatan proses<input class="form-control" data-detail-notes value="${html(row.notes || "")}"></label></div>${monthly.toolbar()}${monthly.grid(row)}</section>`;
      }).join("");
      editor.querySelectorAll("[data-vendor-price-row]").forEach((card, index) => monthly.bind(card, rows[index]));
      syncVendorPriceDetails(); return;
    }
    editor.innerHTML = rows.map((row, index) => `<div class="master-detail-editor-row" data-vendor-price-row>
      <label><span>Proses Vendor</span><select class="form-select" data-detail-process required><option value="">Pilih proses</option>${vendorDetailState.processes.map((item) => `<option value="${html(item.id)}" ${String(item.id) === String(row.vendorProcessId || row.vendorProcess?.id || "") ? "selected" : ""}>${html([item.vendorProcessCode, item.vendorProcessName].filter(Boolean).join(" — "))}</option>`).join("")}</select></label>
      <label><span>Harga Satuan</span><input class="form-control" data-detail-price type="number" min="0" step="0.01" value="${html(row.unitPrice ?? "")}"></label>
      <label><span>UOM</span><select class="form-select" data-detail-uom><option value="">Pilih UOM</option>${vendorDetailState.uoms.map((item) => `<option value="${html(item.uomCode)}" ${String(item.uomCode) === String(row.uomCode || "") ? "selected" : ""}>${html([item.uomCode, item.uomName].filter(Boolean).join(" — "))}</option>`).join("")}</select></label>
      <label><span>MOQ</span><input class="form-control" data-detail-moq type="number" min="0" step="0.01" value="${html(row.minimumOrderQty ?? "")}"></label>
      <label><span>Kelipatan Order</span><input class="form-control" data-detail-multiple type="number" min="0" step="0.01" value="${html(row.orderMultipleQty ?? "")}"></label>
      <label><span>Minimum Charge</span><input class="form-control" data-detail-minimum type="number" min="0" step="0.01" value="${html(row.minimumCharge ?? "")}"></label>
      <label class="detail-note"><span>Catatan</span><input class="form-control" data-detail-notes value="${html(row.notes || "")}"></label>
      <button class="btn btn-outline-danger btn-sm" type="button" data-detail-remove="${index}" aria-label="Hapus proses">Hapus</button>
    </div>`).join("");
    syncVendorPriceDetails();
  }

  async function initializeVendorPriceDetails() {
    if (config.slug !== "vendor-price-lists" || !document.getElementById("vendor-price-details-editor")) return;
    [vendorDetailState.processes, vendorDetailState.uoms] = await Promise.all([masterRows("vendor-processes"), masterRows("uom")]);
    renderVendorPriceDetails();
    document.getElementById("vendor-price-detail-add")?.addEventListener("click", () => { syncVendorPriceDetails(); vendorDetailState.rows.push({}); renderVendorPriceDetails(); });
    document.getElementById("vendor-price-details-editor")?.addEventListener("input", syncVendorPriceDetails);
    document.getElementById("vendor-price-details-editor")?.addEventListener("change", syncVendorPriceDetails);
    document.getElementById("vendor-price-details-editor")?.addEventListener("click", (event) => {
      if (monthly && event.target.closest("[data-fill-months]")) { monthly.fillEmpty(event.target.closest("[data-vendor-price-row]")); syncVendorPriceDetails(); return; }
      const remove = event.target.closest("[data-detail-remove]"); if (!remove) return;
      syncVendorPriceDetails(); vendorDetailState.rows.splice(Number(remove.dataset.detailRemove), 1); renderVendorPriceDetails();
    });
  }

  function applyPriceMasterDefaults(sourceName) {
    if (mode !== "create") return;
    const source = form.elements[sourceName];
    const item = window.EnterpriseLookup?.getSelected(source)
      || source?._lookupItems?.find((row) => String(valueAt(row, source.dataset.valueKey)) === String(source.value));
    if (!item) return;
    const setIfEmpty = (name, value) => { const input = form.elements[name]; if (input && !input.value && value != null) input.value = value; };
    if (config.slug === "material-price-lists") {
      const formValue = String(item.materialFormRef?.defaultPurchaseUomCode || item.materialFormRef?.formCode || item.materialForm || item.materialFormRef?.symbol || "").trim().toUpperCase();
      setIfEmpty("purchasePackageUomCode", ({ C: "COIL", S: "SHEET", P: "PCS", PIECES: "PCS" })[formValue] || formValue);
      setIfEmpty("uomCode", item.defaultPurchaseUomCode || item.materialFormRef?.defaultPurchaseUomCode);
    } else if (config.slug === "part-price-lists") {
      setIfEmpty("uomCode", item.purchaseUomCode || item.baseUomCode || item.stockUomCode);
    } else if (config.slug === "product-price-lists") {
      setIfEmpty("uomCode", item.uomCode || item.uom?.uomCode);
    }
  }

  async function applyQueryPrefill() {
    if (mode !== "create") return;
    const params = new URLSearchParams(location.search);
    if (monthly && params.get("effectiveFrom")) form.elements.pricingYear.value = params.get("effectiveFrom").slice(0,4);
    const tasks = [];
    config.fields.forEach((field) => {
      if (!params.has(field.name)) return;
      const input = form.elements[field.name];
      if (!input || field.type === "file") return;
      const value = params.get(field.name);
      if (field.type === "checkbox") input.checked = value === "true" || value === "1";
      else if (field.type === "lookup" && window.EnterpriseLookup) tasks.push(resolveLookupOption(field, input, value));
      else if (config.slug === "material-price-lists" && field.name === "purchasePackageUomCode") {
        const normalized = String(value || "").trim().toUpperCase();
        input.value = ({ C: "COIL", S: "SHEET", P: "PCS", PIECES: "PCS" })[normalized] || normalized;
      }
      else input.value = value;
    });
    await Promise.all(tasks);
  }

  async function populate(record) {
    loadedRecord = record;
    if (monthly) record = record.monthlyPlan ? { ...record, ...record.monthlyPlan } : monthly.project(record);
    monthlyRecord = record;
    if (["part-price-lists", "vendor-price-lists"].includes(config.slug) && record.priceEligibility?.eligible === false) {
      priceEditBlocked = true;
      alertBox.textContent = record.priceEligibility.reason || "Harga lama ini tidak dapat diubah karena part belum memenuhi routing BOM yang berlaku.";
      alertBox.classList.remove("d-none");
      saveButton.disabled = true;
      saveButton.title = alertBox.textContent;
    }
    const lookupTasks = [];
    config.fields.forEach((field) => {
      const input = form.elements[field.name]; if (!input || field.type === "file") return;
      let value = record[field.name];
      if (field.type === "checkbox") input.checked = Boolean(value);
      else if (field.type === "vendor-price-details") { vendorDetailState.rows = Array.isArray(value) ? value : []; renderVendorPriceDetails(); }
      else if (field.type === "lookup") {
        const values = field.multiple ? (Array.isArray(value) ? value : []) : [value];
        values.filter((item) => item !== undefined && item !== null && item !== "").forEach((item) => lookupTasks.push(resolveLookupOption(field, input, item)));
      }
      else if (field.multiple) {
        const values = (Array.isArray(value) ? value : []).map((item) => typeof item === "object" ? item[field.sourceValueKey || field.lookup?.valueKey || "id"] : item).map(String);
        [...input.options].forEach((option) => option.selected = values.includes(String(option.value)));
      }
      else if (field.type === "json") input.value = hasStructuredValue(value) ? JSON.stringify(value, null, 2) : "";
      else if (field.type === "date") input.value = toInputDate(value, false);
      else if (field.type === "datetime-local") input.value = toInputDate(value, true);
      else if (((config.slug === "parts" && field.name === "category") || (config.slug === "dies" && field.name === "diesType")) && field.type === "select" && value != null && value !== "") {
        if (![...input.options].some((option) => option.value === String(value))) {
          const option = document.createElement("option"); option.value = String(value); option.textContent = `${value} (nilai tersimpan)`; input.appendChild(option);
        }
        input.value = value;
      }
      else input.value = value ?? "";
    });
    await Promise.all(lookupTasks);
    const routingLink = document.getElementById("purchase-part-routing-link");
    if (routingLink) routingLink.classList.toggle("d-none", record.itemType !== "RAW" || record.rawType !== "PURCHASE_PART");
    form.querySelectorAll("select.searchable-select-native").forEach(select=>select.dispatchEvent(new Event("change", { bubbles: true })));
  }
  function focusRequestedField() {
    const focus = new URLSearchParams(location.search).get("focus");
    const names = focus === "uom"
      ? ["productionUomCode", "baseUomCode", "purchaseUomCode", "stockUomCode"]
      : focus === "supplier" ? ["supplierId"] : [];
    const input = names.map((name) => form.elements[name]).find(Boolean);
    if (!input) return;
    input.closest(".form-field")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => input.focus(), 250);
  }

  async function initialize() {
    try {
      await initializeVendorPriceDetails();
      await Promise.all([...document.querySelectorAll(".lookup-select:not([data-enterprise-lookup])")].map(loadLookup));
      [["material-price-lists", "materialId"], ["part-price-lists", "partId"], ["product-price-lists", "productId"]]
        .filter(([slug]) => config.slug === slug)
        .forEach(([, name]) => form.elements[name]?.addEventListener("change", () => applyPriceMasterDefaults(name)));
      if (mode === "edit") {
        const response = await fetch(`/master-data/api/${config.slug}/${encodeURIComponent(recordKey)}${monthly ? "?monthlyForm=true" : ""}`, { headers: authHeaders() });
        if (response.status === 401) return redirectLogin();
        const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "Data gagal dibuka."); await populate(payload); focusRequestedField();
      } else {
        const today = toInputDate((globalThis.erpBusinessNow?.() || new Date()), false);
        config.fields.forEach((field) => {
          const input = form.elements[field.name];
          if (!input || input.value) return;
          if (field.defaultValue === "currentYear") input.value = Number(today.slice(0,4));
          else if (field.defaultValue === "today") input.value = today;
          else if (field.defaultValue !== undefined) input.value = field.defaultValue;
        });
        await applyQueryPrefill();
        if (config.slug === "material-price-lists") applyPriceMasterDefaults("materialId");
        if (config.slug === "part-price-lists") applyPriceMasterDefaults("partId");
        if (config.slug === "product-price-lists") applyPriceMasterDefaults("productId");
      }
      if (monthly) {
        if (mode === "edit" && form.elements.pricingYear) {
          form.elements.pricingYear.readOnly = true;
          form.elements.pricingYear.title = "Tahun harga tersimpan tidak dapat diubah. Buat daftar harga baru untuk tahun lain.";
        }
        const monthSection = document.getElementById("form-section-harga-bulanan");
        monthlyEditor = monthly.bind(monthSection, monthlyRecord || Object.fromEntries(monthly.months.map((m) => [m, form.elements[m]?.value ?? null])));
        const heading = document.getElementById("document-shell-title");
        if (heading) heading.textContent = `${config.label} · ${form.elements.pricingYear.value}`;
        const toolbar = document.getElementById("monthly-price-toolbar");
        if (toolbar) { toolbar.innerHTML = monthly.toolbar(); toolbar.addEventListener("click", (event) => { if (event.target.closest("[data-fill-months]")) monthly.fillEmpty(toolbar.closest("section")); }); }
        const info = document.createElement("div"); info.className = "monthly-price-info";
        info.textContent = "Pilih tahun, lalu isi harga Januari–Desember. Harga otomatis diteruskan hingga perubahan berikutnya. Biru menandai harga yang berubah atau mengikuti harga sebelumnya; keterangan tiap bulan menunjukkan sumbernya. Panah menunjukkan selisih terhadap harga sebelum perubahan. Kosongkan harga khusus untuk kembali mengikuti. Perubahan diterapkan setelah Simpan.";
        if (loadedRecord?.monthlyPlan?.sourceCount > 1) info.textContent += ` ${loadedRecord.monthlyPlan.sourceCount} periode harga tahun ini ditampilkan bersama. Saat Simpan, periode tersebut digabung menjadi satu daftar tahunan; record periode lainnya dipindahkan ke arsip.`;
        form.prepend(info);
        if (window.jQuery) {
          window.jQuery(form).on("select2:select.monthlyPrice select2:clear.monthlyPrice", "select[data-enterprise-lookup]", function () { this.dispatchEvent(new Event("change", { bubbles: true })); });
        }
        form.elements.vendorId?.addEventListener("change", () => { syncVendorPriceDetails(); renderVendorPriceDetails(); });
        form.elements.partId?.addEventListener("change", async () => {
          if (config.slug !== "vendor-price-lists") return;
          const selected = window.EnterpriseLookup?.getSelected(form.elements.partId); const code = selected?.customerCode;
          if (code) await resolveLookupOption(config.fields.find(f=>f.name==='customerId'), form.elements.customerId, code);
        });
      }
      if (mode === "create" && config.generateCode) {
        const response = await fetch(`/master-data/api/${config.slug}/generate-code`, { headers: authHeaders() });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload[config.generateCode] && form.elements[config.generateCode]) form.elements[config.generateCode].value = payload[config.generateCode];
      }
      form.dispatchEvent(new CustomEvent("document-form:loaded"));
    } catch (error) { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); }
  }

  form.addEventListener("submit", async (event) => {
    if (priceEditBlocked) { event.preventDefault(); form.dispatchEvent(new CustomEvent("document-form:error", { detail: { message: alertBox.textContent } })); return; }
    event.preventDefault(); if (!form.reportValidity()) { form.dispatchEvent(new CustomEvent("document-form:error", { detail: { message: "Lengkapi field wajib sebelum menyimpan." } })); return; }
    if (monthly) {
      syncVendorPriceDetails();
      const rows = config.slug === "vendor-price-lists" ? vendorDetailState.rows.filter(row=>row.vendorProcessId) : [monthlyEditor?.read() || {}];
      if (!rows.length || rows.some(row=>!monthly.months.some(m=>row[m] !== "" && row[m] != null))) { alertBox.textContent = "Isi minimal satu bulan harga pada setiap item/proses."; alertBox.classList.remove("d-none"); form.dispatchEvent(new CustomEvent("document-form:error", { detail: { message: alertBox.textContent } })); return; }
      if (config.slug === "vendor-price-lists" && new Set(rows.map(row=>row.vendorProcessId)).size !== rows.length) { alertBox.textContent = "Proses vendor tidak boleh duplikat."; alertBox.classList.remove("d-none"); form.dispatchEvent(new CustomEvent("document-form:error", { detail: { message: alertBox.textContent } })); return; }
    }
    alertBox.classList.add("d-none"); saveButton.disabled = true; saveButton.querySelector("i").classList.remove("d-none");
    try {
      let body; const headers = authHeaders();
      if (config.multipart) {
        body = new FormData();
        if (monthly) { body.append("pricingMode", "MONTHLY"); if (loadedRecord?.monthlyPlan) body.append("monthlySourceVersions", JSON.stringify(loadedRecord.monthlyPlan.sourceVersions)); }
        config.fields.forEach((field) => {
          const input = form.elements[field.name]; if (!input) return;
          if (field.type === "file") [...input.files].forEach((file) => body.append(field.name, file));
          else if (field.type === "checkbox") body.append(field.name, input.checked ? "true" : "false");
          else if (field.multiple) body.append(field.name, JSON.stringify([...input.selectedOptions].map((option) => option.value).filter(Boolean)));
          else if (monthly && monthly.months.includes(field.name)) body.append(field.name, monthlyEditor?.read()[field.name] ?? "");
          else if (monthly && ["lookup", "textarea"].includes(field.type)) body.append(field.name, input.value);
          else if (input.value !== "") body.append(field.name, input.value);
        });
      } else {
        const data = monthly ? { pricingMode: "MONTHLY", ...(loadedRecord?.monthlyPlan ? { monthlySourceVersions: loadedRecord.monthlyPlan.sourceVersions } : {}) } : {};
        config.fields.forEach((field) => {
          const input = form.elements[field.name]; if (!input || field.type === "file") return;
          if (field.type === "checkbox") data[field.name] = input.checked;
          else if (field.multiple) data[field.name] = [...input.selectedOptions].map((option) => option.value).filter(Boolean);
          else if (monthly && monthly.months.includes(field.name)) data[field.name] = monthlyEditor?.read()[field.name] ?? null;
          else if (monthly && input.value === "" && (monthly.months.includes(field.name) || ["lookup", "textarea", "number"].includes(field.type))) data[field.name] = null;
          else if (input.value !== "") {
            if (field.type === "number") data[field.name] = Number(input.value);
            else if (field.type === "json") { try { data[field.name] = JSON.parse(input.value); } catch { throw new Error(`${field.label} harus berupa JSON yang valid.`); } }
            else data[field.name] = input.value;
          }
        });
        body = JSON.stringify(data); headers["content-type"] = "application/json";
      }
      const mutationId = loadedRecord?.[config.mutationKey] || recordId;
      const url = mode === "create" ? `/master-data/api/${config.slug}` : `/master-data/api/${config.slug}/${encodeURIComponent(mutationId)}`;
      const response = await fetch(url, { method: mode === "create" ? "POST" : "PATCH", headers, body });
      if (response.status === 401) return redirectLogin();
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "Data gagal disimpan.");
      const returnTo = new URLSearchParams(location.search).get("returnTo");
      location.replace(returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : `/master-data/${config.slug}`);
    } catch (error) { alertBox.textContent = error.message; alertBox.classList.remove("d-none"); form.dispatchEvent(new CustomEvent("document-form:error", { detail: { message: error.message } })); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { saveButton.disabled = priceEditBlocked; saveButton.querySelector("i").classList.add("d-none"); }
  });

  initialize();
})();
