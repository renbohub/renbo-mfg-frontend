(() => {
  "use strict";

  const PAGE_SELECTOR = '[data-operations-page="purchase-suggestions"]';
  let scanQueued = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const textOf = (element, fallback = "-") => {
    const value = String(element?.textContent || "").replace(/\s+/g, " ").trim();
    return value || fallback;
  };

  const htmlOf = (element, fallback = "-") => element?.outerHTML || fallback;

  function matchText(value, expression, fallback = "-") {
    const match = String(value || "").match(expression);
    return String(match?.[1] || "").trim() || fallback;
  }

  function compactDateLabel(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    const match = normalized.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+\d{4})?/);
    return match ? `${match[1]}-${match[2]}` : normalized || "-";
  }

  function compactMainTable(table) {
    if (!table || table.classList.contains("ps-compact-table")) return;

    const rows = [...table.querySelectorAll("tbody tr[data-ps-row]")];
    if (!rows.length) return;
    const needLabel = textOf(table.querySelectorAll("thead th")[3], "Target Tiba");

    table.classList.add("ps-compact-table");
    table.querySelector("thead").innerHTML = `
      <tr>
        <th class="ps-check-col"><input type="checkbox" data-ps-select-all aria-label="Pilih semua suggestion"></th>
        <th>Material/Part</th>
        <th>Part No</th>
        <th>Status</th>
        <th title="Tanggal kebutuhan material / komponen dari sumber planning">${esc(needLabel)}</th>
        <th>Lead Time</th>
        <th title="Tanggal kebutuhan dikurangi lead time supplier dalam hari kalender">Purchase Max</th>
        <th class="text-end">Current Stock</th>
        <th class="text-end">Demand</th>
        <th>Supplier</th>
        <th class="text-end">PR QTY</th>
        <th>Action</th>
      </tr>`;

    rows.forEach((row) => {
      const cells = [...row.cells];
      if (cells.length < 11) return;

      const checkbox = cells[0].querySelector("[data-ps-select]");
      const itemLink = cells[1].querySelector(".ps-item-link");
      const identity = textOf(itemLink?.querySelector("b"), textOf(itemLink));
      const description = textOf(itemLink?.querySelector("span"), "");
      const itemHref = itemLink?.getAttribute("href") || "#";
      const partMeta = textOf(itemLink?.querySelector("small"), "");
      const partNo = matchText(partMeta, /PN\s+(.+?)(?:\s*[·|]|$)/i);
      const sourceStatus = String(row.dataset.psStatus || "").toLowerCase();
      const statusLabel = /converted/.test(sourceStatus)
        ? "Converted"
        : /covered/.test(sourceStatus)
          ? "Coverage"
        : /ready/.test(sourceStatus)
          ? "Ready"
          : "Wait Confirm";
      const statusTone = /converted/.test(sourceStatus) ? "converted" : /covered/.test(sourceStatus) ? "covered" : /ready/.test(sourceStatus) ? "ready" : "waiting";
      const purchaseMaxLabel = compactDateLabel(textOf(cells[4].querySelector(".ps-due-primary b"), textOf(cells[4].querySelector("b"))));
      const dueHelp = cells[4].querySelector("[data-due-calculation]");
      const leadTime = matchText(textOf(cells[4], ""), /Supplier LT\s+([\d.,]+\s*hari)/i);
      const stock = matchText(textOf(cells[7], ""), /(?:^|\s)A\s*([\d.,-]+)/i, textOf(cells[7].querySelector("b")));
      const demand = cells[6].querySelector("b");
      const supplierName = textOf(cells[8].querySelector("a span"), "-");
      const prQty = cells[9].querySelector("[data-ps-custom-qty]");
      const action = cells[10].querySelector("[data-open-suggestion-editor]");
      const actionText = textOf(action, "Confirm");
      const isMaterial = String(row.dataset.psCategory || "").toLowerCase() === "material";

      // UI contract markers: data-ps-kind="material" and data-ps-kind="purchase-part".
      row.setAttribute("data-ps-kind", isMaterial ? "material" : "purchase-part");
      row.innerHTML = `
        <td class="ps-check-col"><input type="checkbox" data-ps-select data-item-id="${esc(row.dataset.itemId || checkbox?.dataset.itemId || "")}"${checkbox?.checked ? " checked" : ""}${checkbox?.disabled ? " disabled" : ""}></td>
        <td class="ps-compact-identity"><a href="${esc(itemHref)}"><b>${esc(identity)}</b><span>${esc(description)}</span></a></td>
        <td><span class="ps-part-number">${esc(partNo)}</span></td>
        <td><span class="ps-simple-status ${statusTone}">${esc(statusLabel)}</span></td>
        <td title="${esc(cells[3].getAttribute("title") || "")}"><b>${esc(compactDateLabel(textOf(cells[3].querySelector("b"), textOf(cells[3]))))}</b><small class="ps-ready-date">${esc(textOf(cells[3].querySelector("small"), needLabel))}</small></td>
        <td><span class="ps-lead-time">${esc(leadTime)}</span></td>
        <td><div class="ps-due-primary"><b>${esc(purchaseMaxLabel)}</b>${htmlOf(dueHelp, "")}</div></td>
        <td class="text-end"><b>${esc(stock)}</b></td>
        <td class="text-end">${htmlOf(demand)}</td>
        <td><span class="ps-supplier-name">${esc(supplierName)}</span></td>
        <td class="text-end">${htmlOf(prQty)}</td>
        <td class="ps-action-cell">${htmlOf(action, "-")}</td>`;

      const actionButton = row.querySelector("[data-open-suggestion-editor]");
      if (actionButton) {
        actionButton.classList.add("ps-confirm-action");
        actionButton.textContent = /lihat/i.test(actionText) ? "Detail" : "Confirm";
      }
    });

    table.querySelectorAll("tbody tr:not([data-ps-row]) td[colspan]").forEach((cell) => cell.setAttribute("colspan", "12"));
  }

  function scan() {
    scanQueued = false;
    if (!document.querySelector(PAGE_SELECTOR) && !document.querySelector(".ps-suggestion-table")) return;
    document.querySelectorAll(".ps-suggestion-table").forEach(compactMainTable);
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  const observer = new MutationObserver(queueScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueScan, { once: true });
  else queueScan();
})();
