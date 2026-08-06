(function () {
  const config = JSON.parse(document.getElementById("invoice-form-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const date = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
  let currentPo = null;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload.data || payload.item || payload;
  }
  function show(message, kind = "danger") {
    $("invoice-alert").textContent = message;
    $("invoice-alert").className = `alert alert-${kind}`;
  }
  function renderLines(details, invoiceDetails = []) {
    const invoiceByPoDetail = new Map(invoiceDetails.map((line) => [line.poDetailId, line]));
    $("invoice-lines").innerHTML = details.map((detail) => {
      const invoice = invoiceByPoDetail.get(detail.id) || {};
      const qty = invoice.qtyInvoiced ?? Math.max(number(detail.qtyReceived) || number(detail.qty), 0);
      const unitPrice = invoice.unitPrice ?? detail.unitPrice;
      return `<tr data-invoice-line data-po-detail-id="${esc(detail.id)}">
        <td><b>${esc(detail.partCode || detail.description || "-")}</b><small class="d-block">${esc(detail.partName || detail.partNumber || "")}</small></td>
        <td>${esc(detail.qty)}</td><td>${esc(detail.qtyReceived || 0)}</td>
        <td><input class="form-control form-control-sm" data-invoice-qty type="number" min="0.000001" step="0.001" value="${esc(qty)}"></td>
        <td>${esc(detail.uomCode || "-")}</td><td data-po-price>${esc(detail.unitPrice || 0)}</td>
        <td><input class="form-control form-control-sm" data-invoice-price type="number" min="0" step="0.01" value="${esc(unitPrice)}"></td>
        <td data-variance>${esc((number(unitPrice) - number(detail.unitPrice)) * number(qty))}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="8" class="text-center text-muted p-4">PO tidak memiliki detail aktif.</td></tr>';
  }
  async function selectPo(poNumber, invoiceDetails = []) {
    if (!poNumber) return;
    currentPo = await api(`/modules/api/purchasing/purchase-order/${encodeURIComponent(poNumber)}`);
    $("invoice-partner").value = currentPo.supplierName || currentPo.vendorName || currentPo.supplier?.supplierName || currentPo.vendor?.vendorName || "";
    $("invoice-currency").value = currentPo.currencyCode || "IDR";
    renderLines(currentPo.details || [], invoiceDetails);
  }
  async function init() {
    $("invoice-date").value = new Date().toISOString().slice(0, 10);
    const response = await api("/modules/api/purchasing/purchase-order?start=0&length=500");
    const purchaseOrders = Array.isArray(response) ? response : [];
    $("invoice-po").insertAdjacentHTML("beforeend", purchaseOrders
      .filter((po) => ["Approved", "Sent", "Confirmed", "Partial Receipt", "Completed"].includes(po.status))
      .map((po) => `<option value="${esc(po.poNumber)}">${esc(po.poNumber)} — ${esc(po.supplierName || po.vendorName || po.supplier?.supplierName || po.vendor?.vendorName || "")}</option>`).join(""));
    if (config.mode === "edit") {
      const invoice = await api(`/modules/api/purchasing/purchase-invoices/${encodeURIComponent(config.recordKey)}`);
      $("invoice-po").value = invoice.poNumber;
      $("invoice-po").disabled = true;
      $("supplier-invoice-number").value = invoice.supplierInvoiceNumber || "";
      $("invoice-date").value = date(invoice.invoiceDate);
      $("due-date").value = date(invoice.dueDate);
      $("invoice-notes").value = invoice.notes || "";
      await selectPo(invoice.poNumber, invoice.details || []);
    }
  }
  $("invoice-po").addEventListener("change", (event) => selectPo(event.target.value).catch((error) => show(error.message)));
  $("invoice-lines").addEventListener("input", (event) => {
    const row = event.target.closest("[data-invoice-line]");
    if (!row) return;
    const qty = number(row.querySelector("[data-invoice-qty]").value);
    const price = number(row.querySelector("[data-invoice-price]").value);
    const poPrice = number(row.querySelector("[data-po-price]").textContent);
    row.querySelector("[data-variance]").textContent = String((price - poPrice) * qty);
  });
  $("invoice-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentPo) return show("Pilih Purchase Order.");
    const details = [...document.querySelectorAll("[data-invoice-line]")].map((row) => ({
      poDetailId: row.dataset.poDetailId,
      qtyInvoiced: number(row.querySelector("[data-invoice-qty]").value),
      unitPrice: number(row.querySelector("[data-invoice-price]").value),
    })).filter((line) => line.qtyInvoiced > 0);
    if (!details.length) return show("Minimal satu detail invoice wajib diisi.");
    const body = {
      header: {
        poNumber: currentPo.poNumber,
        supplierInvoiceNumber: $("supplier-invoice-number").value.trim(),
        invoiceDate: $("invoice-date").value,
        dueDate: $("due-date").value || null,
        notes: $("invoice-notes").value.trim() || null,
      },
      details,
    };
    try {
      const endpoint = config.mode === "edit"
        ? `/modules/api/purchasing-invoice/${encodeURIComponent(config.recordKey)}`
        : "/modules/api/purchasing-invoice";
      const invoice = await api(endpoint, { method: config.mode === "edit" ? "PATCH" : "POST", body: JSON.stringify(body) });
      show("Purchase Invoice tersimpan.", "success");
      setTimeout(() => location.assign(`/modules/purchasing/purchase-invoices/${encodeURIComponent(invoice.invoiceNumber)}`), 350);
    } catch (error) {
      show(error.message);
    }
  });
  init().catch((error) => show(error.message));
})();
