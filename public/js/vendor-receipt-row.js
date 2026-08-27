"use strict";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function renderReceiptLine(order, formatQuantity) {
  const formatQty = typeof formatQuantity === "function" ? formatQuantity : (value) => String(value);
  const sent = toNumber(order?.qtySent);
  const received = toNumber(order?.qtyReceived);
  const outstanding = Math.max(sent - received, 0);
  const uom = String(order?.uomCode || "—").toUpperCase();
  const quantity = (value, id = "") => `<span${id ? ` id="${id}"` : ""} class="vendor-receipt-quantity"><b>${escapeHtml(formatQty(value, order?.uomCode))}</b><em>${escapeHtml(uom)}</em></span>`;
  const gripDots = Array.from({ length: 6 }, () => "<i></i>").join("");

  return `<tr>
    <td class="vendor-receipt-sheet-index is-locked" aria-readonly="true"><span class="vendor-receipt-row-grip" role="img" aria-label="Pegangan baris" title="Pegangan baris">${gripDots}</span></td>
    <td class="vendor-receipt-sheet-part-code is-locked" aria-readonly="true"><b>${escapeHtml(order?.outputPartCode || "—")}</b></td>
    <td class="vendor-receipt-sheet-part-no is-locked" aria-readonly="true"><b>${escapeHtml(order?.outputPartNumber || "—")}</b></td>
    <td class="vendor-receipt-sheet-part-name is-locked" aria-readonly="true" title="${escapeHtml(order?.outputPartName || "—")}"><span>${escapeHtml(order?.outputPartName || "—")}</span></td>
    <td class="ops-number is-locked" aria-readonly="true">${quantity(sent)}</td>
    <td class="ops-number is-locked" aria-readonly="true">${quantity(received)}</td>
    <td class="is-editable" title="Maksimum ${escapeHtml(formatQty(outstanding, order?.uomCode))} ${escapeHtml(uom)}"><label class="vendor-receipt-qty-input"><input id="qtyReceived" type="number" min="0" max="${escapeHtml(outstanding)}" step="any" value="${escapeHtml(outstanding)}" aria-label="Receipt quantity, maksimum ${escapeHtml(formatQty(outstanding, order?.uomCode))} ${escapeHtml(uom)}" required><em>${escapeHtml(uom)}</em></label></td>
    <td class="ops-number is-locked" aria-readonly="true">${quantity(sent, "line-after")}</td>
    <td class="is-locked" aria-readonly="true"><span class="vendor-receipt-hold-badge" title="Available 0 ${escapeHtml(uom)} sampai QC release">QC HOLD</span></td>
  </tr>`;
}

if (typeof module !== "undefined" && module.exports) module.exports = { renderReceiptLine };
if (typeof window !== "undefined") window.VendorReceiptRow = { renderReceiptLine };
