(function () {
  const config = JSON.parse(document.getElementById("po-form-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const date = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
  let recordId = null;
  let linkedToPr = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload.data || payload.item || payload;
  }
  function show(message, kind = "danger") {
    $("po-form-alert").textContent = message;
    $("po-form-alert").className = `alert alert-${kind}`;
  }
  function addLine(row = {}) {
    const type = row.materialCode ? "RAW_MATERIAL" : row.partCode ? "PURCHASE_PART" : "OTHER";
    const tr = document.createElement("tr");
    tr.dataset.poLine = "true";
    tr.innerHTML = `
      <td><select class="form-select form-select-sm" data-line-type><option value="PURCHASE_PART" ${type === "PURCHASE_PART" ? "selected" : ""}>Purchase Part</option><option value="RAW_MATERIAL" ${type === "RAW_MATERIAL" ? "selected" : ""}>Raw Material</option><option value="OTHER" ${type === "OTHER" ? "selected" : ""}>Lainnya</option></select></td>
      <td><input class="form-control form-control-sm" data-line-code value="${esc(row.materialCode || row.partCode || "")}"></td>
      <td><input class="form-control form-control-sm" data-line-number value="${esc(row.partNumber || "")}"></td>
      <td><input class="form-control form-control-sm" data-line-description value="${esc(row.description || row.partName || "")}" required></td>
      <td><input class="form-control form-control-sm" data-line-qty type="number" min="0.000001" step="0.001" value="${esc(row.purchasePackageQty || row.qty || 1)}" required></td>
      <td><select class="form-select form-select-sm d-none" data-line-form><option>SHEET</option><option>COIL</option><option>PCS</option></select><input class="form-control form-control-sm" data-line-uom value="${esc(row.uomCode || "PCS")}"></td>
      <td><input class="form-control form-control-sm" data-line-factor type="number" min="0" step="0.001" value="${esc(row.conversionFactor || "")}"></td>
      <td><input class="form-control form-control-sm" data-line-price type="number" min="0" step="0.01" value="${esc(row.unitPrice || 0)}"></td>
      <td data-line-total>${esc(number(row.totalAmount || number(row.qty) * number(row.unitPrice)))}</td>
      <td><button class="btn btn-sm btn-outline-danger" type="button" data-remove-line>×</button></td>`;
    $("po-lines").appendChild(tr);
    if (row.purchasePackageUomCode) tr.querySelector("[data-line-form]").value = row.purchasePackageUomCode;
    syncLine(tr);
  }
  function syncLine(row) {
    const raw = row.querySelector("[data-line-type]").value === "RAW_MATERIAL";
    row.querySelector("[data-line-form]").classList.toggle("d-none", !raw);
    row.querySelector("[data-line-uom]").classList.toggle("d-none", raw);
    row.querySelector("[data-line-factor]").disabled = !raw;
    row.querySelector("[data-line-total]").textContent = String(number(row.querySelector("[data-line-qty]").value) * number(row.querySelector("[data-line-price]").value));
  }
  function linePayload(row, index) {
    const type = row.querySelector("[data-line-type]").value;
    const code = row.querySelector("[data-line-code]").value.trim();
    const qty = number(row.querySelector("[data-line-qty]").value);
    const unitPrice = number(row.querySelector("[data-line-price]").value);
    const raw = type === "RAW_MATERIAL";
    const form = row.querySelector("[data-line-form]").value;
    const conversionFactor = number(row.querySelector("[data-line-factor]").value);
    return {
      lineNumber: index + 1,
      partCode: type === "PURCHASE_PART" ? code || null : null,
      partNumber: row.querySelector("[data-line-number]").value.trim() || null,
      materialCode: raw ? code || null : null,
      description: row.querySelector("[data-line-description]").value.trim(),
      qty,
      uomCode: raw ? form : row.querySelector("[data-line-uom]").value.trim(),
      purchasePackageQty: raw ? qty : null,
      purchasePackageUomCode: raw ? form : null,
      conversionUomCode: raw ? "KG" : null,
      conversionFactor: raw ? conversionFactor : null,
      convertedPurchaseQty: raw ? qty * conversionFactor : null,
      unitPrice,
      totalAmount: qty * unitPrice,
    };
  }
  async function init() {
    const today = (globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10);
    $("po-date").value = today;
    $("po-delivery-date").value = today;
    const suppliers = await api("/master-data/api/suppliers?start=0&length=500&isDeleted=false");
    $("po-supplier").insertAdjacentHTML("beforeend", (Array.isArray(suppliers) ? suppliers : []).map((supplier) => `<option value="${esc(supplier.supplierCode)}">${esc(supplier.supplierCode)} — ${esc(supplier.supplierName || "")}</option>`).join(""));
    if (config.mode === "edit") {
      const po = await api(`/modules/api/purchasing/purchase-order/${encodeURIComponent(config.recordKey)}`);
      recordId = po.id;
      linkedToPr = Array.isArray(po.purchaseRequisitions) && po.purchaseRequisitions.length > 0;
      $("po-supplier").value = po.supplierCode || "";
      $("po-date").value = date(po.poDate);
      $("po-delivery-date").value = date(po.deliveryDate);
      $("po-type").value = po.poType || "Other";
      $("po-currency").value = po.currencyCode || "IDR";
      $("po-payment-terms").value = po.paymentTerms || "";
      $("po-notes").value = po.notes || "";
      (po.details || []).forEach(addLine);
      if (linkedToPr) {
        $("po-add-line").classList.add("d-none");
        $("po-line-help").textContent = "Detail PO berasal dari PR dan dikunci. Gunakan PR consolidation untuk perubahan kuantitas/supplier.";
        $("po-lines").querySelectorAll("input,select,button").forEach((control) => { control.disabled = true; });
      }
    } else {
      addLine();
    }
  }
  $("po-add-line").addEventListener("click", () => addLine());
  $("po-lines").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-line]");
    if (button) button.closest("[data-po-line]").remove();
  });
  $("po-lines").addEventListener("input", (event) => {
    const row = event.target.closest("[data-po-line]");
    if (row) syncLine(row);
  });
  $("po-lines").addEventListener("change", (event) => {
    const row = event.target.closest("[data-po-line]");
    if (row) syncLine(row);
  });
  $("po-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const rows = [...document.querySelectorAll("[data-po-line]")];
    const details = rows.map(linePayload);
    if (!linkedToPr && !details.length) return show("Minimal satu detail PO wajib diisi.");
    const invalidRaw = details.find((line) => line.materialCode && (!["SHEET", "COIL", "PCS"].includes(line.purchasePackageUomCode) || line.conversionFactor <= 0 || !Number.isInteger(line.purchasePackageQty)));
    if (invalidRaw) return show("Raw material wajib memiliki bentuk SHEET/COIL/PCS, qty bentuk bulat, dan KG per bentuk.");
    const header = {
      supplierCode: $("po-supplier").value,
      poDate: $("po-date").value,
      deliveryDate: $("po-delivery-date").value,
      poType: $("po-type").value,
      currencyCode: $("po-currency").value.trim(),
      paymentTerms: $("po-payment-terms").value.trim() || null,
      notes: $("po-notes").value.trim() || null,
    };
    try {
      const endpoint = config.mode === "edit"
        ? `/modules/api/purchasing-po/${encodeURIComponent(recordId)}`
        : "/modules/api/purchasing-po";
      const po = await api(endpoint, {
        method: config.mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(linkedToPr ? { header } : { header, details }),
      });
      show("Purchase Order Draft tersimpan.", "success");
      setTimeout(() => location.assign(`/modules/purchasing/purchase-order/${encodeURIComponent(po.poNumber)}`), 350);
    } catch (error) {
      show(error.message);
    }
  });
  init().catch((error) => show(error.message));
})();
