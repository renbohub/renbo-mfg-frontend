(function () {
  const config = JSON.parse(document.getElementById("purchasing-pr-config").textContent);
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let normalized = String(value ?? "").trim().replace(/\s+/g, "");
    if (!normalized) return 0;
    if (normalized.includes(",") && normalized.includes(".")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const date = (value) => value ? String(value).slice(0, 10) : "";
  const today = () => (globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10);
  const currency = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number(value));
  const state = { parts: [], materials: [], suppliers: [], record: null, currentCategory: null, ready: false };
  const tableLayout = window.PRFormTools.columnLayout(document.querySelector(".pr-lines-table"), $("pr-columns"));
  const categoryFromQuery = {
    material: "MATERIAL",
    "purchase-part": "PURCHASE_PART",
    "universal-purchase-part": "UNIVERSAL_PURCHASE_PART",
    "non-production": "NON_PRODUCTION",
    "vendor-process": "VENDOR_PROCESS",
  };
  const initialCategory = categoryFromQuery[config.purchaseCategory] || "PURCHASE_PART";
  document.querySelector(".pr-form-page")?.classList.add("pr-friendly-editor");
  state.currentCategory = initialCategory;
  const categoryMeta = {
    MATERIAL: {
      slug: "material",
      label: "Material",
      poType: "Material",
      description: "PR material mengambil item dari Material Master. Isi quantity, UOM, spesifikasi, dan pilihan C/S/P sesuai kebutuhan.",
      detail: "Pilih Material Master; periksa Spec, Thickness, Width, C/S/P, quantity, UOM, harga estimasi, dan preferred supplier.",
    },
    PURCHASE_PART: {
      slug: "purchase-part",
      label: "Purchase Part (Drawing)",
      poType: "Part",
      description: "PR Purchase Part hanya menampilkan purchased part yang memiliki drawing atau part number.",
      detail: "Pilih part berdrawing dari Part Master, lalu isi qty, UOM, supplier proposal, dan harga estimasi.",
    },
    UNIVERSAL_PURCHASE_PART: {
      slug: "universal-purchase-part",
      label: "Universal Purchase Part",
      poType: "Part",
      description: "PR Universal Purchase Part digunakan untuk purchased part tanpa drawing atau item universal.",
      detail: "Pilih item universal dari Part Master, lalu isi qty, UOM, supplier proposal, dan harga estimasi.",
    },
    VENDOR_PROCESS: {
      slug: "vendor-process", label: "Out Process / Vendor Process", poType: "Out Process",
      description: "Permintaan proses eksternal khusus part dengan penanda atau routing vendor.",
      detail: "Pilih part vendor, quantity, UOM, harga estimasi, dan preferred vendor. Jelaskan proses pada Notes.",
    },
    NON_PRODUCTION: {
      slug: "non-production",
      label: "Non Produksi",
      poType: "Other",
      description: "PR Non Produksi digunakan untuk consumable, service, asset, maintenance, dan kebutuhan umum.",
      detail: "Tuliskan deskripsi kebutuhan secara jelas karena item Non Produksi tidak wajib terhubung ke Part Master.",
    },
  };

  function normalizeCategory(value) {
    const normalized = String(value || "").trim();
    return categoryMeta[normalized.toUpperCase()] ? normalized.toUpperCase() : (categoryFromQuery[normalized.toLowerCase()] || initialCategory);
  }

  function applyDocumentCategory(value, { resetLines = false, updateUrl = false, announce = false } = {}) {
    const category = normalizeCategory(value);
    const meta = categoryMeta[category];
    state.currentCategory = category;
    if ($("pr-category")) $("pr-category").value = category;
    $("po-type").value = meta.poType;
    [...$("po-type").options].forEach((option) => { option.disabled = category === "NON_PRODUCTION" ? !["Other", "Service", "Consumable", "Maintenance", "Asset"].includes(option.value) : option.value !== meta.poType; });
    $("header-material-wrap").classList.toggle("d-none", category !== "MATERIAL");
    if (category !== "MATERIAL") $("header-material").value = "-";
    $("pr-category-eyebrow").textContent = `Purchasing · ${meta.label}`;
    $("pr-category-description").textContent = meta.description;
    $("pr-detail-description").textContent = meta.detail;

    if (resetLines) {
      $("pr-lines").innerHTML = "";
      addLine({ procurementCategory: category });
    }
    if (updateUrl && config.mode !== "edit") {
      const url = new URL(window.location.href);
      url.searchParams.set("category", meta.slug);
      window.history.replaceState({}, "", url);
      config.purchaseCategory = meta.slug;
      const listUrl = `/modules/purchasing/purchase-requisitions?category=${encodeURIComponent(meta.slug)}`;
      document.querySelectorAll("#pr-cancel, .pr-form-page .module-breadcrumb a, #pr-form .erp-form-dock-actions a").forEach((link) => { link.href = listUrl; });
    }
    tableLayout.apply(category);
    if (announce) show(`Kategori diubah ke ${meta.label}. Detail item disesuaikan otomatis.`, "info");
  }

  function auth(json = false) { return { Authorization: `Bearer ${token()}`, ...(json ? { "Content-Type": "application/json" } : {}) }; }
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...auth(Boolean(options.body)), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload;
  }
  function setUom(tr, code) {
    const select = tr.querySelector(".line-uom");
    window.EnterpriseLookup.setSelected(select, { id: code, text: code });
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function cacheItem(source, item) {
    const rows = source === "pr-materials" ? state.materials : state.parts;
    const codeKey = source === "pr-materials" ? "materialCode" : "partCode";
    const data = { ...(item.data || {}), [codeKey]: item.id };
    const index = rows.findIndex((row) => row[codeKey] === item.id);
    if (index >= 0) rows[index] = { ...rows[index], ...data };
    else rows.push(data);
    return data;
  }
  function openItemLookup(tr) {
    const category = tr.querySelector(".line-category").value;
    const source = category === "MATERIAL" ? "pr-materials" : "pr-parts";
    const query = ["PURCHASE_PART", "UNIVERSAL_PURCHASE_PART"].includes(category)
      ? { prCategory: category, rawType: "PURCHASE_PART", hasDrawing: String(category === "PURCHASE_PART") } : category === "VENDOR_PROCESS" ? { prCategory: category } : {};
    window.PRFormTools.lookup({ api, source, query, title: category === "MATERIAL" ? "Material" : "Part", onSelect(item) {
      cacheItem(source, item);
      const select = tr.querySelector(".line-part");
      select.innerHTML = `<option value="${esc(item.id)}" selected>${esc(item.text)}</option>`;
      syncPart(tr, false, true);
      recalculate();
    } });
  }
  async function loadRecordItems(record) {
    const requested = new Map();
    for (const row of record.details || []) {
      if (row.materialCode && row.procurementCategory === "MATERIAL") {
        state.materials.push({ id: row.materialId, materialCode: row.materialCode, materialName: row.materialName, materialType: row.materialType, spec: row.spec, thickness: row.thickness, width: row.width });
        requested.set(`pr-materials/${row.materialCode}`, ["pr-materials", row.materialCode]);
      } else if (row.partCode) {
        state.parts.push({ partCode: row.partCode, partNumber: row.partNumber, partName: row.partName, rawType: "PURCHASE_PART", hasDrawing: Boolean(row.partNumber), purchaseUomCode: row.uomCode });
        requested.set(`pr-parts/${row.partCode}`, ["pr-parts", row.partCode]);
      }
    }
    const results = await Promise.allSettled([...requested.values()].map(async ([source, code]) => {
      const payload = await api(`/lookups/api/${source}/resolve/${encodeURIComponent(code)}`);
      cacheItem(source, payload.result);
    }));
    if (results.some((result) => result.status === "rejected")) show("Sebagian master belum dapat dimuat. Data item tersimpan tetap ditampilkan.", "warning");
  }
  function categoryOf(part) {
    const rawType = String(part?.rawType || "").toUpperCase();
    if (rawType === "MATERIAL") return "MATERIAL";
    if (rawType === "PURCHASE_PART") return String(part?.partNumber || "").trim() ? "PURCHASE_PART" : "UNIVERSAL_PURCHASE_PART";
    return "NON_PRODUCTION";
  }
  function materialIdentity(part) {
    const material = part?.material || {};
    const code = material.materialCode || part?.materialCode || "";
    const name = material.materialName || material.spec || part?.materialName || "";
    return [code, name].filter(Boolean).join(" — ") || "Material belum terhubung";
  }
  function isPieceMaterial(material) { return String(material?.materialForm || "").trim().toUpperCase() === "PIECES"; }
  function partUom(part, category) {
    if (category === "MATERIAL") return part?.purchaseUomCode || "LOT";
    return part?.purchaseUomCode || part?.baseUomCode || part?.uomCode || part?.uom?.uomCode || "PCS";
  }
  function partLabel(part, category) {
    if (category === "MATERIAL") return `${materialIdentity(part)} · ${part.partCode || "-"}`;
    return `${part.partCode || "-"} · ${part.partNumber || "tanpa drawing"} · ${part.partName || ""}`;
  }
  function partOptions(category, selectedCode = "") {
    if (category === "MATERIAL") return `<option value="">Pilih Material Type</option>${state.materials.map((material) => `<option value="${esc(material.materialCode)}" ${material.materialCode === selectedCode ? "selected" : ""}>${esc(material.materialType || material.materialGrade || "Material")} · ${esc(material.materialCode)} — ${esc(material.materialName || material.spec || "")}</option>`).join("")}`;
    if (category === "NON_PRODUCTION") return `<option value="">Item manual / deskripsi non produksi</option>`;
    const rows = state.parts.filter((part) => category === "VENDOR_PROCESS" || categoryOf(part) === category);
    return `<option value="">Pilih dari Master Part</option>${rows.map((part) => `<option value="${esc(part.partCode)}" ${part.partCode === selectedCode ? "selected" : ""}>${esc(partLabel(part, category))}</option>`).join("")}`;
  }
  function supplierOptions(selected = "") {
    return `<option value="">Opsional — ditentukan ulang di PR</option>${(selected && !state.suppliers.some((s) => s.supplierCode === selected) ? [{ supplierCode: selected, supplierName: "" }, ...state.suppliers] : state.suppliers).map((supplier) => `<option value="${esc(supplier.supplierCode)}" ${supplier.supplierCode === selected ? "selected" : ""}>${esc(supplier.supplierCode)} — ${esc(supplier.supplierName || "")}</option>`).join("")}`;
  }
  function initialSupplierAllocations(row) {
    return Array.isArray(row.sourcingAllocations)
      ? row.sourcingAllocations.filter((allocation) => !allocation.isDeleted && allocation.status !== "Cancelled").map((allocation) => ({ ...allocation }))
      : [];
  }
  function supplierPanelOf(tr) {
    if (!tr) return null;
    if (tr._supplierPanel?.isConnected) return tr._supplierPanel;
    const candidate = tr.nextElementSibling;
    return candidate?.classList.contains("pr-supplier-row") ? candidate : null;
  }
  function itemRowFromTarget(target) {
    const itemRow = target?.closest?.(".pr-item-row");
    if (itemRow) return itemRow;
    const supplierRow = target?.closest?.(".pr-supplier-row");
    const previous = supplierRow?.previousElementSibling;
    return previous?.classList.contains("pr-item-row") ? previous : null;
  }
  function sourceTrace(row) {
    const links = (row.sources || []).map((source) => {
      const mrp = source.mrpRunNumber
        ? `<a href="/modules/planning-ppic/mrp/${encodeURIComponent(source.mrpRunNumber)}" target="_blank" rel="noopener">${esc(source.mrpRunNumber)}</a>`
        : null;
      const mps = source.mpsNumber
        ? `<a href="/modules/planning-ppic/mps/${encodeURIComponent(source.mpsNumber)}" target="_blank" rel="noopener">MPS ${esc(source.mpsNumber)}</a>`
        : null;
      const forecastNumbers = [...new Set([
        source.forecastNumber,
        ...(Array.isArray(source.metadata?.forecastNumbers) ? source.metadata.forecastNumbers : []),
      ].filter(Boolean))];
      const forecasts = forecastNumbers.map((forecastNumber) =>
        `<a href="/modules/sales/forecasts/${encodeURIComponent(forecastNumber)}" target="_blank" rel="noopener">Forecast ${esc(forecastNumber)}</a>`);
      const salesOrders = String(source.soNumber || "").split(",").map((value) => value.trim()).filter(Boolean).map((soNumber) =>
        `<a href="/modules/sales/sales-orders/${encodeURIComponent(soNumber)}" target="_blank" rel="noopener">SO ${esc(soNumber)}</a>`);
      return [mrp, mps, ...forecasts, ...salesOrders].filter(Boolean).join(" / ");
    }).filter(Boolean);
    return links.length ? [...new Set(links)].join("<br>") : "Manual / tanpa trace MRP";
  }
  function renderSupplierAllocations(tr) {
    const panel = supplierPanelOf(tr);
    const target = panel?.querySelector(".line-supplier-rows");
    if (!target) return;
    const allocations = tr._supplierAllocations || [];
    const trace = sourceTrace(tr._sourceRecord || {});
    target.innerHTML = allocations.length ? allocations.map((allocation, index) => {
      const form = String(allocation.purchasePackageUomCode || "").toUpperCase();
      const conversionUom = String(allocation.conversionUomCode || allocation.demandUomCode || tr.querySelector(".line-uom")?.value || "KG").toUpperCase();
      return `<tr data-supplier-allocation-index="${index}">
        <td><select class="form-select supplier-allocation-code" data-enterprise-lookup="supplier-codes">${supplierOptions(allocation.supplierCode || "")}</select></td>
        <td class="supplier-allocation-trace">${trace}</td>
        <td><input class="form-control supplier-allocation-qty" type="number" min="0.000001" step="any" value="${number(allocation.demandCoveredQty)}"></td>
        <td><select class="form-select supplier-allocation-form"><option value="">Tanpa konversi</option><option value="COIL" ${form === "COIL" ? "selected" : ""}>C · Coil</option><option value="SHEET" ${form === "SHEET" ? "selected" : ""}>S · Sheet</option><option value="PCS" ${form === "PCS" ? "selected" : ""}>P · Pcs</option></select></td>
        <td><input class="form-control supplier-allocation-package-qty" type="number" min="1" step="1" value="${allocation.purchasePackageQty ?? ""}" placeholder="Qty form"></td>
        <td><input class="form-control supplier-allocation-factor" type="number" min="0" step="any" value="${allocation.conversionFactor ?? ""}" placeholder="Isi/form"><select class="form-select supplier-allocation-conversion-uom"><option value="KG" ${conversionUom === "KG" ? "selected" : ""}>KG</option><option value="PCS" ${conversionUom === "PCS" ? "selected" : ""}>PCS</option></select></td>
        <td><input class="form-control supplier-allocation-date" type="date" value="${date(allocation.deliveryDate)}"></td>
        <td><input class="form-control supplier-allocation-price" type="number" min="0" step="any" value="${allocation.unitPrice ?? ""}" placeholder="Harga"></td>
        <td><button class="supplier-allocation-remove" type="button" title="Hapus split supplier">×</button></td>
      </tr>`;
    }).join("") : '<tr><td colspan="9" class="supplier-allocation-empty">Belum ada split supplier. Klik “+ Split Supplier” untuk mengalokasikan.</td></tr>';
    recalculateSupplierAllocation(tr);
  }
  function recalculateSupplierAllocation(tr) {
    const panel = supplierPanelOf(tr);
    const required = number(tr.querySelector(".line-qty")?.value);
    const allocated = [...(panel?.querySelectorAll(".supplier-allocation-qty") || [])].reduce((sum, input) => sum + number(input.value), 0);
    const variance = allocated - required;
    const status = Math.abs(variance) <= 0.000001 ? "EXACT" : variance < 0 ? "UNDER" : "OVER";
    const badge = panel?.querySelector(".supplier-allocation-status");
    if (badge) {
      badge.textContent = `${status} - ${allocated.toLocaleString("id-ID", { maximumFractionDigits: 2 })} / ${required.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
      badge.dataset.status = status;
    }
  }
  function supplierAllocationPayload(tr, uomCode) {
    const panel = supplierPanelOf(tr);
    return [...(panel?.querySelectorAll(".line-supplier-rows tr[data-supplier-allocation-index]") || [])].map((rowElement) => {
      const source = tr._supplierAllocations[Number(rowElement.dataset.supplierAllocationIndex)] || {};
      const form = rowElement.querySelector(".supplier-allocation-form").value || null;
      const packageQty = number(rowElement.querySelector(".supplier-allocation-package-qty").value);
      const factor = number(rowElement.querySelector(".supplier-allocation-factor").value);
      return {
        id: source.id || null,
        supplierCode: rowElement.querySelector(".supplier-allocation-code").value || null,
        demandCoveredQty: number(rowElement.querySelector(".supplier-allocation-qty").value),
        demandUomCode: uomCode,
        purchasePackageUomCode: form,
        purchasePackageQty: form ? packageQty : null,
        conversionFactor: form ? factor : null,
        conversionUomCode: form ? rowElement.querySelector(".supplier-allocation-conversion-uom").value : null,
        convertedPurchaseQty: form ? packageQty * factor : null,
        deliveryDate: rowElement.querySelector(".supplier-allocation-date").value || null,
        unitPrice: rowElement.querySelector(".supplier-allocation-price").value === "" ? null : number(rowElement.querySelector(".supplier-allocation-price").value),
        currencyCode: source.currencyCode || "IDR",
        notes: source.notes || null,
      };
    });
  }
  function lineCategory(row) {
    if (row.procurementCategory) return String(row.procurementCategory).toUpperCase();
    if (row.partCode) return categoryOf(state.parts.find((part) => part.partCode === row.partCode));
    return state.currentCategory;
  }
  function addLine(row = {}) {
    const category = ["MATERIAL", "PURCHASE_PART", "UNIVERSAL_PURCHASE_PART", "VENDOR_PROCESS", "NON_PRODUCTION"].includes(lineCategory(row)) ? lineCategory(row) : state.currentCategory;
    const sourceForm = String(row.purchasePackageUomCode || "").trim().toUpperCase();
    const purchaseForm = ["COIL", "SHEET", "PCS"].includes(sourceForm) ? sourceForm : "";
    const packageQty = row.purchasePackageQty ?? row.lotCount ?? "";
    const conversionUom = ["KG", "PCS"].includes(String(row.conversionUomCode || row.uomCode || "").trim().toUpperCase())
      ? String(row.conversionUomCode || row.uomCode).trim().toUpperCase()
      : "KG";
    const conversionFactor = row.conversionFactor ?? row.kgPerLot ?? "";
    const recommendedForms = Array.isArray(row.recommendedPurchaseForms)
      ? row.recommendedPurchaseForms.map((form) => form.formCode || form.symbol).filter(Boolean).join(" / ")
      : "";
    const tr = document.createElement("tr");
    tr.className = "pr-item-row";
    tr.innerHTML = `
      <td><span class="line-index"></span><select class="form-select line-category" hidden disabled><option value="MATERIAL" ${category === "MATERIAL" ? "selected" : ""}>Material</option><option value="PURCHASE_PART" ${category === "PURCHASE_PART" ? "selected" : ""}>Purchase Part (Drawing)</option><option value="UNIVERSAL_PURCHASE_PART" ${category === "UNIVERSAL_PURCHASE_PART" ? "selected" : ""}>Universal Part (No Drawing)</option><option value="VENDOR_PROCESS" ${category === "VENDOR_PROCESS" ? "selected" : ""}>Out Process</option><option value="NON_PRODUCTION" ${category === "NON_PRODUCTION" ? "selected" : ""}>Non Produksi</option></select></td>
      <td><select class="form-select line-part" hidden data-searchable-disabled="true">${partOptions(category, category === "MATERIAL" ? (row.materialCode || "") : (row.partCode || ""))}</select><div class="line-item-picker"><input class="form-control line-description" aria-label="Deskripsi item" placeholder="${category === "NON_PRODUCTION" ? "Deskripsi wajib" : category === "MATERIAL" ? "Pilih material" : "Pilih part"}" value="${esc(row.description || "")}"><button type="button" class="btn btn-outline-primary line-lookup" aria-label="${category === "MATERIAL" ? "Cari Material" : "Cari Part"}" title="${category === "MATERIAL" ? "Cari atau ganti Material" : "Cari atau ganti Part"}" ${category === "NON_PRODUCTION" ? "hidden" : ""}>Cari</button></div></td>
      <td><strong class="line-part-code">${esc(row.partCode || "-")}</strong></td>
      <td><span class="line-part-number">${esc(row.partNumber || "-")}</span></td>
      <td><span class="line-material">-</span></td>
      <td><input class="form-control line-qty" type="number" min="0.000001" step="any" value="${number(row.qty || 1)}"><div class="line-lot-fields" hidden><small>Raw material direquest dalam KG. Bentuk Sheet/Coil/Pcs ditentukan setelah supplier dipilih.</small></div></td>
      <td><select class="form-select line-uom" required data-enterprise-lookup="uom" data-lookup-placeholder="Cari UOM"><option value=""></option>${row.uomCode ? `<option value="${esc(row.uomCode)}" selected>${esc(row.uomCode)}</option>` : ""}</select></td>
      <td><select class="form-select line-csp" aria-label="C/S/P"><option value="">-</option><option value="C">C · Coil</option><option value="S">S · Sheet</option><option value="P">P · Pcs</option></select><div class="line-conversion-fields" hidden>
        <small>Rekomendasi BOM: ${esc(recommendedForms || "-")} (tidak mengunci pembelian)</small>
        <select class="form-select line-purchase-form"><option value="">Pilih C/S/P</option><option value="COIL" ${purchaseForm === "COIL" ? "selected" : ""}>C · Coil</option><option value="SHEET" ${purchaseForm === "SHEET" ? "selected" : ""}>S · Sheet</option><option value="PCS" ${purchaseForm === "PCS" ? "selected" : ""}>P · Pcs</option></select>
        <div class="line-conversion-grid"><input class="form-control line-package-qty" type="text" inputmode="numeric" value="${esc(packageQty)}" placeholder="Jumlah C/S/P"><input class="form-control line-conversion-factor" type="text" inputmode="decimal" value="${esc(conversionFactor)}" placeholder="Isi per C/S/P"><select class="form-select line-conversion-uom"><option value="KG" ${conversionUom === "KG" ? "selected" : ""}>KG</option><option value="PCS" ${conversionUom === "PCS" ? "selected" : ""}>PCS</option></select></div>
        <small class="line-converted-qty">Hasil konversi: -</small>
      </div><span class="line-no-conversion">-</span></td>
      <td><div ${category === "VENDOR_PROCESS" ? "hidden" : ""}><select class="form-select line-supplier" data-enterprise-lookup="supplier-codes" ${category === "VENDOR_PROCESS" ? "disabled" : ""}>${supplierOptions(row.proposedSupplierCode || row.preferredSupplier || "")}</select></div><div ${category === "VENDOR_PROCESS" ? "" : "hidden"}><select class="form-select line-vendor" data-enterprise-lookup="vendor-codes" data-lookup-placeholder="Cari vendor" ${category === "VENDOR_PROCESS" ? "required" : "disabled"}><option value=""></option>${row.preferredVendor ? `<option value="${esc(row.preferredVendor)}" selected>${esc(row.preferredVendor)}</option>` : ""}</select></div></td>
      <td><input class="form-control line-price" type="number" min="0" step="0.01" value="${number(row.estimatedPrice)}"></td>
      <td><strong class="line-total">${currency(number(row.qty) * number(row.estimatedPrice))}</strong></td>
      <td><input class="form-control line-spec" readonly aria-label="Spec dari master" value="${esc(row.spec || "")}"></td>
      <td><input class="form-control line-thickness" readonly aria-label="Thickness dari master" value="${esc(row.thickness ?? "")}"></td>
      <td><input class="form-control line-width" readonly aria-label="Width dari master" value="${esc(row.width ?? "")}"></td>
      <td><textarea class="form-control line-notes" rows="1" aria-label="Catatan item" placeholder="Spesifikasi tambahan / proses yang dibutuhkan">${esc(row.notes || "")}</textarea></td>
      <td><span class="line-ordered-qty">${number(row.orderedQty)}</span></td>
      <td><span class="line-planned-order">${esc(row.plannedOrderNumber || (Array.isArray(row.sourcePlannedOrderNumbers) ? row.sourcePlannedOrderNumbers.join(", ") : "") || "-")}</span></td>
      <td><button class="pr-remove-line" type="button" aria-label="Hapus baris">×</button></td>`;
    const editorLabels = ["Jenis kebutuhan", "Material / item dan alokasi supplier", "Part code internal", "Part number / drawing", "Material type", "Qty kebutuhan", "UOM", "Draft bentuk pembelian", "Supplier utama", "Harga estimasi", "Total", "Spec", "Thickness (mm)", "Width (mm)", "Catatan item", "Ordered Qty", "Planned Order Number", "Aksi"];
    [...tr.children].forEach((cell, index) => { cell.dataset.label = editorLabels[index] || "Field"; });
    $("pr-lines").appendChild(tr);
    const supplierTr = document.createElement("tr");
    supplierTr.className = "pr-supplier-row";
    supplierTr.hidden = category === "VENDOR_PROCESS" || !(row.sources?.length || row.sourcingAllocations?.length || row.plannedOrderNumber || row.sourcePlannedOrderNumbers?.length);
    supplierTr.innerHTML = `<td colspan="18"><details class="line-supplier-control"><summary><span class="pr-supplier-summary-title">Trace &amp; Split Supplier</span><span class="supplier-allocation-status" data-status="UNDER"></span><small>Buka rincian sumber MRP/MPS dan alokasi vendor</small></summary><div class="supplier-allocation-scroll"><table data-enterprise-table="off"><thead><tr><th>Supplier</th><th>Trace MRP / MPS / SO</th><th>Qty Alokasi</th><th>Form</th><th>Qty Form</th><th>Isi/Form</th><th>Delivery</th><th>Harga</th><th></th></tr></thead><tbody class="line-supplier-rows"></tbody></table></div><div class="pr-supplier-actions"><button class="supplier-allocation-add" type="button">+ Split Supplier</button><small>Total alokasi dibandingkan dengan qty kebutuhan dan ditandai UNDER, EXACT, atau OVER.</small></div></details></td>`;
    $("pr-lines").appendChild(supplierTr);
    tr._sourceRecord = row;
    tr.querySelector(".line-csp").value = row.CSP || ({ COIL: "C", SHEET: "S", PCS: "P" }[purchaseForm]) || "";
    tr._supplierAllocations = initialSupplierAllocations(row);
    tr._supplierPanel = supplierTr;
    renderSupplierAllocations(tr);
    syncPart(tr, false);
    tableLayout.apply();
    recalculate();
  }
  function syncPart(tr, reset = true, changed = false) {
    const category = tr.querySelector(".line-category").value;
    const select = tr.querySelector(".line-part");
    if (reset) select.innerHTML = partOptions(category);
    const material = category === "MATERIAL" ? state.materials.find((item) => item.materialCode === select.value) : null;
    const part = state.parts.find((item) => item.partCode === select.value);
    tr.querySelector(".line-part-code").textContent = category === "MATERIAL" ? (material?.materialCode || "-") : (part?.partCode || "-");
    tr.querySelector(".line-part-number").textContent = category === "MATERIAL" ? "-" : (part?.partNumber || "-");
    tr.querySelector(".line-description").title = material ? `${material.materialCode} — ${material.materialName || ""}` : part ? `${part.partCode} — ${part.partName || ""}` : "";
    if (category === "MATERIAL" && material && (changed || !tr.querySelector(".line-csp").value)) {
      tr.querySelector(".line-csp").value = material.CSP || ({ COIL: "C", SHEET: "S", PIECES: "P", PCS: "P" }[material.materialForm]) || "";
    }
    const dimensions = material || part?.material || {};
    for (const key of ["spec", "thickness", "width"]) {
      const input = tr.querySelector(`.line-${key}`);
      if (changed || !input.value) input.value = dimensions[key] ?? "";
    }
    tr.querySelector(".line-material").textContent = category === "MATERIAL" ? ([material?.materialType || material?.materialGrade, material?.materialCode, material?.materialName].filter(Boolean).join(" · ") || "-") : (part?.rawType || category.replaceAll("_", " "));
    tr.querySelector(".line-lot-fields").classList.toggle("d-none", category !== "MATERIAL");
    tr.querySelector(".line-conversion-fields").classList.toggle("d-none", category !== "MATERIAL");
    tr.querySelector(".line-no-conversion").classList.toggle("d-none", category === "MATERIAL");
    if (category === "MATERIAL" && reset) {
      tr.querySelector(".line-purchase-form").value = "";
      tr.querySelector(".line-package-qty").value = "";
      tr.querySelector(".line-conversion-factor").value = "";
      tr.querySelector(".line-conversion-uom").value = "KG";
    }
    if (category === "MATERIAL" && material && (reset || changed || !tr.querySelector(".line-uom").value)) setUom(tr, "KG");
    else if (part && (reset || changed || !tr.querySelector(".line-uom").value)) setUom(tr, partUom(part, category));
    if (category === "MATERIAL" && material && (changed || !tr.querySelector(".line-description").value)) tr.querySelector(".line-description").value = material.materialName || material.spec || material.materialCode;
    else if (part && (changed || !tr.querySelector(".line-description").value)) tr.querySelector(".line-description").value = part.partName || materialIdentity(part);
    if (category === "MATERIAL" && material) {
      $("header-material").value = `${material.materialCode} — ${material.materialName || material.spec || ""}`.trim();
    }
  }
  function recalculate() {
    let total = 0;
    $("pr-lines").querySelectorAll(".pr-item-row").forEach((tr, index) => {
      tr.querySelector(".line-index").textContent = index + 1;
      const rawMaterial = tr.querySelector(".line-category").value === "MATERIAL";
      const material = rawMaterial ? state.materials.find((item) => item.materialCode === tr.querySelector(".line-part").value) : null;
      const sourceQty = number(tr.querySelector(".line-qty").value);
      const effectiveQty = sourceQty;
      const lineTotal = effectiveQty * number(tr.querySelector(".line-price").value);
      total += lineTotal;
      tr.querySelector(".line-total").textContent = currency(lineTotal);
      const conversionLabel = tr.querySelector(".line-converted-qty");
      if (conversionLabel) {
        const packageQty = number(tr.querySelector(".line-package-qty")?.value);
        const factor = number(tr.querySelector(".line-conversion-factor")?.value);
        const result = packageQty * factor;
        const conversionUom = tr.querySelector(".line-conversion-uom")?.value || "KG";
        conversionLabel.textContent = result > 0
          ? `Hasil konversi: ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(result)} ${conversionUom}`
          : "Hasil konversi: -";
      }
    });
    $("pr-total").textContent = currency(total);
  }
  function linePayload(tr) {
    const source = tr._sourceRecord || {};
    const category = tr.querySelector(".line-category").value;
    const material = category === "MATERIAL" ? state.materials.find((item) => item.materialCode === tr.querySelector(".line-part").value) : null;
    const part = state.parts.find((item) => item.partCode === tr.querySelector(".line-part").value);
    const sourceQty = number(tr.querySelector(".line-qty").value);
    const qty = sourceQty;
    const purchasePackageUomCode = category === "MATERIAL" ? tr.querySelector(".line-purchase-form").value : null;
    const purchasePackageQty = category === "MATERIAL" ? number(tr.querySelector(".line-package-qty").value) : null;
    const conversionUomCode = category === "MATERIAL" ? tr.querySelector(".line-conversion-uom").value : null;
    const conversionFactor = category === "MATERIAL" ? number(tr.querySelector(".line-conversion-factor").value) : null;
    const convertedPurchaseQty = category === "MATERIAL" ? purchasePackageQty * conversionFactor : null;
    const hasPurchaseDraft = category === "MATERIAL" && (
      Boolean(purchasePackageUomCode)
      || purchasePackageQty > 0
      || conversionFactor > 0
    );
    return {
      id: source.id || null,
      procurementCategory: category,
      partId: ["PURCHASE_PART", "UNIVERSAL_PURCHASE_PART", "VENDOR_PROCESS"].includes(category) ? (part?.id || null) : null,
      partCode: category === "MATERIAL" ? (source.partCode || null) : (part?.partCode || null),
      partNumber: category === "MATERIAL" ? (source.partNumber || null) : (part?.partNumber || null),
      partName: category === "MATERIAL" ? (source.partName || null) : (part?.partName || null),
      productId: null,
      materialId: category === "MATERIAL" ? (material?.id || null) : null,
      materialCode: category === "MATERIAL" ? (material?.materialCode || null) : null,
      materialName: category === "MATERIAL" ? (material?.materialName || material?.spec || null) : null,
      materialType: category === "MATERIAL" ? (material?.materialType || material?.materialGrade || null) : null,
      description: tr.querySelector(".line-description").value.trim() || material?.materialName || part?.partName || null,
      qty,
      uomCode: tr.querySelector(".line-uom").value.trim().toUpperCase(),
      estimatedPrice: number(tr.querySelector(".line-price").value),
      preferredSupplier: category === "VENDOR_PROCESS" ? null : source.preferredSupplier || null,
      proposedSupplierCode: category === "VENDOR_PROCESS" ? null : tr.querySelector(".line-supplier").value || null,
      supplierProposalSource: tr.querySelector(".line-supplier").value
        ? (["MRP", "SYSTEM"].includes(state.record?.sourceType) ? "PURCHASING_PR_EDIT" : "PURCHASING_MANUAL_PR")
        : null,
      lotCount: hasPurchaseDraft && conversionUomCode === "KG" ? purchasePackageQty : null,
      kgPerLot: hasPurchaseDraft && conversionUomCode === "KG" ? conversionFactor : null,
      purchaseQtyKg: hasPurchaseDraft && conversionUomCode === "KG" ? convertedPurchaseQty : null,
      purchasePackageQty: hasPurchaseDraft ? purchasePackageQty : null,
      purchasePackageUomCode: hasPurchaseDraft ? purchasePackageUomCode : null,
      conversionUomCode: hasPurchaseDraft ? conversionUomCode : null,
      conversionFactor: hasPurchaseDraft ? conversionFactor : null,
      convertedPurchaseQty: hasPurchaseDraft ? convertedPurchaseQty : null,
      recommendedPurchaseForms: source.recommendedPurchaseForms || null,
      lotAllocations: source.lotAllocations ?? null,
      plannedOrderNumber: source.plannedOrderNumber || null,
      sourcePlannedOrderNumbers: source.sourcePlannedOrderNumbers || null,
      sources: source.sources || null,
      sourcingAllocations: category === "VENDOR_PROCESS" ? initialSupplierAllocations(source) : supplierAllocationPayload(tr, tr.querySelector(".line-uom").value.trim().toUpperCase()),
      preferredVendor: category === "VENDOR_PROCESS" ? tr.querySelector(".line-vendor").value || null : null,
      CSP: category === "MATERIAL" ? tr.querySelector(".line-csp").value || null : source.CSP || null,
      spec: tr.querySelector(".line-spec").value || null,
      thickness: tr.querySelector(".line-thickness").value === "" ? null : number(tr.querySelector(".line-thickness").value),
      width: tr.querySelector(".line-width").value === "" ? null : number(tr.querySelector(".line-width").value),
      notes: tr.querySelector(".line-notes").value.trim() || null,
    };
  }
  function show(message, kind = "danger") {
    const alert = $("pr-alert"); alert.textContent = message; alert.className = `alert alert-${kind}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function populate(record) {
    state.record = record;
    $("pr-date").value = date(record.prDate) || today();
    $("required-date").value = date(record.requiredDate);
    $("requested-by").value = record.requestedBy || "";
    if (record.departmentId || record.department?.id) window.EnterpriseLookup.setSelected($("department-id"), { id: record.departmentId || record.department.id, text: record.department?.departmentName || record.departmentId });
    $("priority").value = record.priority || "Normal";
    $("po-type").value = record.poType || "Other";
    $("source-type").value = record.sourceType || "MANUAL";
    $("header-material").value = record.headerMaterialCode
      ? `${record.headerMaterialCode} — ${record.headerMaterialName || ""}`.trim()
      : "-";
    $("demand-bucket").value = record.demandBucket || date(record.requiredDate)?.slice(0, 7) || "-";
    $("pr-notes").value = record.notes || "";
    $("pr-status").textContent = record.status || "Draft";
    $("pr-number").value = record.prNumber;
    $("pr-number-hint").textContent = "Nomor dokumen tersimpan.";
    $("pr-lines").innerHTML = "";
    (record.details || []).forEach(addLine);
    if (!record.details?.length) addLine();
  }
  async function init() {
    $("pr-save").disabled = true;
    if (config.mode === "edit") {
      const record = await api(`/modules/api/purchasing/purchase-requisitions/${encodeURIComponent(config.recordKey)}`);
      await loadRecordItems(record);
      applyDocumentCategory(record.procurementGroup || record.details?.[0]?.procurementCategory || state.currentCategory);
      populate(record);
    } else {
      applyDocumentCategory(state.currentCategory, { updateUrl: true });
      $("pr-date").value = today();
      $("required-date").value = today();
      $("source-type").value = "MANUAL";
      $("header-material").value = "-";
      $("demand-bucket").value = $("required-date").value.slice(0, 7) || "-";
      addLine({ procurementCategory: state.currentCategory });
      const profile = await api("/auth/api/profile");
      $("requested-by").value = profile.username || profile.email || profile.fullName || "";
      if (!$("requested-by").value) throw new Error("Identitas pemohon belum tersedia. Silakan login kembali.");
      try {
        const preview = await api("/modules/api/purchasing/purchase-requisitions/number-preview");
        $("pr-number").value = preview.prNumber;
        $("pr-number-hint").textContent = "Perkiraan nomor; nomor final ditetapkan saat disimpan.";
      } catch {
        $("pr-number").value = "Otomatis saat disimpan";
        $("pr-number-hint").textContent = "Preview belum tersedia. Penomoran otomatis tetap aktif.";
      }
    }
    $("pr-save").disabled = false;
    state.ready = true;
  }

  window.jQuery($("pr-form")).on("select2:select select2:clear", "select[data-enterprise-lookup]", (event) => {
    event.target.dispatchEvent(new Event("change", { bubbles: true }));
  });
  $("pr-category").addEventListener("change", (event) => {
    if (config.mode === "edit" || event.target.value === state.currentCategory) return;
    applyDocumentCategory(event.target.value, { resetLines: true, updateUrl: true, announce: true });
  });
  $("pr-add-line").addEventListener("click", () => addLine({ procurementCategory: state.currentCategory }));
  $("pr-lines").addEventListener("click", (event) => {
    const tr = itemRowFromTarget(event.target);
    if (event.target.closest(".line-lookup") && tr) { openItemLookup(tr); return; }
    if (event.target.closest(".supplier-allocation-add") && tr) {
      tr._supplierAllocations = supplierAllocationPayload(tr, tr.querySelector(".line-uom").value.trim().toUpperCase());
      tr._supplierAllocations.push({
        supplierCode: null,
        demandCoveredQty: 0,
        demandUomCode: tr.querySelector(".line-uom").value.trim().toUpperCase(),
        deliveryDate: $("required-date").value || null,
      });
      renderSupplierAllocations(tr);
      return;
    }
    const allocationRemove = event.target.closest(".supplier-allocation-remove");
    if (allocationRemove && tr) {
      const index = Number(allocationRemove.closest("[data-supplier-allocation-index]").dataset.supplierAllocationIndex);
      tr._supplierAllocations.splice(index, 1);
      renderSupplierAllocations(tr);
      return;
    }
    const button = event.target.closest(".pr-remove-line"); if (!button || !tr) return;
    if (!window.confirm("Hapus baris item ini? Rincian trace dan split supplier pada baris ini ikut dihapus dari draft.")) return;
    supplierPanelOf(tr)?.remove();
    tr.remove();
    if (!$("pr-lines").querySelector(".pr-item-row")) addLine();
    recalculate();
  });
  $("pr-lines").addEventListener("change", (event) => {
    const tr = itemRowFromTarget(event.target); if (!tr) return;
    if (event.target.matches(".line-category")) syncPart(tr, true);
    if (event.target.matches(".line-part")) syncPart(tr, false);
    recalculate();
  });
  $("pr-lines").addEventListener("input", (event) => {
    recalculate();
    const tr = itemRowFromTarget(event.target);
    if (tr) recalculateSupplierAllocation(tr);
  });
  $("required-date").addEventListener("change", () => {
    $("demand-bucket").value = $("required-date").value.slice(0, 7) || "-";
  });
  $("pr-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.ready) return show("Form belum siap. Tunggu data selesai dimuat atau muat ulang halaman.");
    if (!event.currentTarget.reportValidity()) return;
    const details = [...$("pr-lines").querySelectorAll(".pr-item-row")].map(linePayload);
    const invalid = details.find((line) => (!line.partCode && !line.description) || line.qty <= 0 || !line.uomCode);
    if (invalid) return show("Setiap baris wajib memiliki part/deskripsi, qty lebih dari 0, dan UOM.");
    for (let index = 0; index < details.length; index += 1) {
      const line = details[index];
      const lineNumber = index + 1;
      if (line.procurementCategory === "VENDOR_PROCESS" && (!line.partCode || !line.preferredVendor)) return show(`Baris ${lineNumber}: part dan vendor wajib dipilih.`);
      if (line.procurementCategory === "VENDOR_PROCESS") continue;
      for (let allocationIndex = 0; allocationIndex < line.sourcingAllocations.length; allocationIndex += 1) {
        const allocation = line.sourcingAllocations[allocationIndex];
        const allocationLabel = `Baris ${lineNumber}, split supplier ${allocationIndex + 1}`;
        if (!allocation.supplierCode) return show(`${allocationLabel}: supplier wajib dipilih.`);
        if (!(allocation.demandCoveredQty > 0)) return show(`${allocationLabel}: qty alokasi harus lebih dari 0.`);
        if (allocation.purchasePackageUomCode) {
          if (!Number.isInteger(allocation.purchasePackageQty) || allocation.purchasePackageQty <= 0) {
            return show(`${allocationLabel}: qty form harus bilangan bulat positif.`);
          }
          if (!(allocation.conversionFactor > 0)) return show(`${allocationLabel}: isi per form harus lebih dari 0.`);
          if (allocation.conversionUomCode !== line.uomCode) {
            return show(`${allocationLabel}: UOM hasil konversi harus sama dengan UOM kebutuhan ${line.uomCode}.`);
          }
        }
      }
      if (line.procurementCategory !== "MATERIAL") continue;
      const hasPurchaseDraft = Boolean(line.purchasePackageUomCode)
        || line.purchasePackageQty > 0
        || line.conversionFactor > 0;
      if (!hasPurchaseDraft) continue;
      if (!["COIL", "SHEET", "PCS"].includes(line.purchasePackageUomCode)) {
        return show(`Baris ${lineNumber}: pilih bentuk pembelian C · Coil, S · Sheet, atau P · Pcs.`);
      }
      if (!Number.isInteger(line.purchasePackageQty) || line.purchasePackageQty <= 0) {
        return show(`Baris ${lineNumber}: jumlah ${line.purchasePackageUomCode} harus angka bulat positif, contoh 4 (tanpa koma).`);
      }
      if (!(line.conversionFactor > 0)) {
        return show(`Baris ${lineNumber}: isi per ${line.purchasePackageUomCode} wajib lebih dari 0. Boleh angka bulat seperti 200 atau desimal 200,5.`);
      }
      if (!["KG", "PCS"].includes(line.conversionUomCode)) {
        return show(`Baris ${lineNumber}: satuan hasil konversi harus KG atau PCS.`);
      }
      if (line.uomCode !== line.conversionUomCode) {
        return show(`Baris ${lineNumber}: UOM kebutuhan ${line.uomCode} harus sama dengan hasil konversi ${line.conversionUomCode}.`);
      }
    }
    const payload = { header: { prDate: $("pr-date").value, requiredDate: $("required-date").value, requestedBy: $("requested-by").value.trim(), departmentId: $("department-id").value || null, priority: $("priority").value, poType: $("po-type").value, procurementGroup: state.record?.procurementGroup || state.currentCategory, sourceType: state.record?.sourceType || "MANUAL", notes: $("pr-notes").value.trim() || null }, details };
    const save = $("pr-save"); save.disabled = true; save.textContent = "Menyimpan...";
    try {
      const record = await api(config.mode === "edit" ? `/modules/api/purchasing-pr/${encodeURIComponent(config.recordKey)}` : "/modules/api/purchasing-pr", { method: config.mode === "edit" ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const categoryQuery = `?category=${encodeURIComponent(categoryMeta[state.currentCategory].slug)}`;
      window.location.href = `/modules/purchasing/purchase-requisitions/${encodeURIComponent(record.prNumber || config.recordKey)}${categoryQuery}`;
    } catch (error) { show(error.message); save.disabled = false; save.textContent = "Simpan Draft"; }
  });
  init().catch((error) => show(error.message));
})();
