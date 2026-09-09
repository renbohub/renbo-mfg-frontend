(function (root) {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const columns = [
    ["kind", "#", 50], ["item", "Part / Material", 290], ["code", "Part Code", 140],
    ["drawing", "Part Number / Drawing", 160], ["material", "Material Type", 160],
    ["qty", "Quantity", 120], ["uom", "UOM", 130], ["form", "C/S/P", 115],
    ["partner", "Supplier / Vendor", 240], ["price", "Harga Est.", 130], ["total", "Total", 130],
    ["spec", "Spec", 160], ["thickness", "Thickness (mm)", 115], ["width", "Width (mm)", 115],
    ["notes", "Notes", 240], ["ordered", "Ordered Qty", 115], ["planned", "Planned Order Number", 180], ["action", "Aksi", 60],
  ];
  function dialog(title) {
    const node = document.createElement("dialog");
    node.className = "pr-tools-dialog";
    node.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" class="btn btn-outline-secondary" data-close aria-label="Tutup ${esc(title)}">Tutup</button></header><div class="pr-dialog-body"></div>`;
    document.body.appendChild(node);
    node.setAttribute("aria-label", title);
    node.querySelector("[data-close]").addEventListener("click", () => node.close());
    node.addEventListener("close", () => node.remove(), { once: true });
    return node;
  }
  function lookup({ api, source, title, query = {}, onSelect }) {
    const node = dialog(title);
    const material = source === "pr-materials";
    const part = source === "pr-parts";
    const headings = ["Kode", "Nama", ...(part ? ["Drawing / Part Number", "UOM"] : material ? ["Spec", "Thickness", "Width"] : []), "Aksi"];
    const body = node.querySelector(".pr-dialog-body");
    body.innerHTML = `<label class="pr-lookup-search">Cari ${esc(title.toLowerCase())}<input type="search" class="form-control" aria-label="Cari ${esc(title)}" placeholder="Ketik kode atau nama" autocomplete="off"></label><p class="pr-lookup-status" role="status"></p><div class="pr-lookup-results"><table data-enterprise-table="off"><thead><tr>${headings.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody></tbody></table></div><footer><span data-count></span><button type="button" class="btn btn-outline-primary" data-more>Muat lebih banyak</button></footer>`;
    const search = body.querySelector("input");
    const status = body.querySelector("[role=status]");
    const more = body.querySelector("[data-more]");
    const tbody = body.querySelector("tbody");
    let rows = [], page = 0, generation = 0, timer;
    async function load(reset) {
      const turn = ++generation;
      const nextPage = reset ? 1 : page + 1;
      if (reset) { page = 0; rows = []; tbody.innerHTML = ""; body.querySelector("[data-count]").textContent = ""; }
      more.disabled = true;
      status.textContent = "Memuat data…";
      try {
        const params = new URLSearchParams({ ...query, q: search.value.trim(), page: nextPage, pageSize: 50 });
        const result = await api(`/lookups/api/${encodeURIComponent(source)}?${params}`);
        if (!node.isConnected || turn !== generation) return;
        rows = reset ? result.results || [] : [...rows, ...(result.results || [])];
        page = nextPage;
        tbody.innerHTML = rows.map((item, i) => {
          const data = item.data || {};
          const values = [item.code, item.name, ...(part ? [data.partNumber || "—", data.purchaseUomCode || data.baseUomCode || data.uomCode || "—"] : material ? [data.spec || "—", data.thickness ?? "—", data.width ?? "—"] : [])];
          return `<tr>${values.map((v) => `<td>${esc(v)}</td>`).join("")}<td><button type="button" class="btn btn-sm btn-primary" data-pick="${i}" ${item.active === false ? "disabled" : ""} aria-label="Pilih ${esc(item.code)}">Pilih</button></td></tr>`;
        }).join("");
        status.textContent = rows.length ? "" : "Tidak ada data yang cocok. Coba kata kunci lain.";
        body.querySelector("[data-count]").textContent = `${rows.length} data ditampilkan${result.pagination?.more ? "" : " · semua hasil dimuat"}`;
        more.hidden = !result.pagination?.more;
        more.textContent = "Muat lebih banyak";
      } catch (error) {
        if (!node.isConnected || turn !== generation) return;
        status.textContent = error.message || "Data gagal dimuat.";
        more.hidden = false;
        more.textContent = "Coba lagi";
      } finally { if (turn === generation) more.disabled = false; }
    }
    search.addEventListener("input", () => {
      ++generation; clearTimeout(timer); more.disabled = true;
      tbody.innerHTML = ""; status.textContent = "Mencari…";
      timer = setTimeout(() => load(true), 250);
    });
    more.addEventListener("click", () => load(page === 0));
    tbody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pick]");
      if (!button || button.disabled) return;
      onSelect(rows[Number(button.dataset.pick)]);
      node.close();
    });
    node.addEventListener("close", () => { clearTimeout(timer); ++generation; });
    node.showModal(); search.focus(); load(true);
  }
  function columnLayout(table, trigger) {
    const key = "erp.pr.form.columns.v2";
    const defaultOrder = ["kind", "code", "drawing", "item", "spec", "thickness", "width", "form", "qty", "uom", "ordered", "price", "total", "partner", "planned", "notes", "action", "material"];
    let category = "PURCHASE_PART";
    const visible = (id) => id !== "material"
      && (category === "MATERIAL" || !["spec", "thickness", "width", "form"].includes(id))
      && (category !== "NON_PRODUCTION" || !["code", "drawing"].includes(id));
    const labelFor = (id) => ({
      item: category === "NON_PRODUCTION" ? "Description" : category === "MATERIAL" ? "Material Name" : "Part Name",
      code: category === "MATERIAL" ? "Material Code" : "Part Code",
      drawing: "Part Number", partner: category === "VENDOR_PROCESS" ? "Preferred Vendor" : "Preferred Supplier",
      price: "Estimated Price", total: "Total Amount",
    })[id] || columns.find(([columnId]) => columnId === id)[1];
    let order = [...defaultOrder], pinned = [];
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) {
        order = [...new Set([...(Array.isArray(saved.order) ? saved.order : []), ...defaultOrder])].filter((id) => defaultOrder.includes(id));
        pinned = [...new Set(Array.isArray(saved.pinned) ? saved.pinned : [])].filter((id) => defaultOrder.includes(id));
      }
    } catch {}
    function apply(nextCategory) {
      if (typeof nextCategory === "string") category = nextCategory;
      const displayed = [...order.filter((id) => pinned.includes(id)), ...order.filter((id) => !pinned.includes(id))];
      const rows = [table.tHead.rows[0], ...table.querySelectorAll(".pr-item-row")];
      rows.forEach((row) => {
        const cells = [...row.cells];
        cells.forEach((cell, index) => { cell.dataset.prColumn ||= columns[index][0]; });
        let left = 0;
        displayed.forEach((id) => {
          const cell = cells.find((item) => item.dataset.prColumn === id);
          if (!cell) return;
          const width = columns.find(([columnId]) => columnId === id)[2];
          cell.hidden = !visible(id);
          if (cell.tagName === "TH") cell.textContent = labelFor(id);
          cell.style.setProperty("width", `${width}px`, "important");
          cell.style.setProperty("min-width", `${width}px`, "important");
          cell.classList.toggle("pr-column-pinned", pinned.includes(id));
          cell.style.setProperty("--pr-pin-left", `${left}px`);
          if (pinned.includes(id) && visible(id)) left += width;
          row.appendChild(cell);
        });
      });
      table.style.width = `${columns.filter(([id]) => visible(id)).reduce((sum, c) => sum + c[2], 0)}px`;
      const pinnedWidth = columns.filter(([id]) => pinned.includes(id) && visible(id)).reduce((sum, column) => sum + column[2], 0);
      table.querySelectorAll(".pr-supplier-row > td").forEach((cell) => { cell.colSpan = columns.filter(([id]) => visible(id)).length; });
      table.parentElement.style.scrollPaddingInlineStart = `${pinnedWidth + 8}px`;
    }
    trigger.addEventListener("click", () => {
      const node = dialog("Atur kolom PR");
      let draftOrder = [...order], draftPinned = [...pinned];
      const body = node.querySelector(".pr-dialog-body");
      function render() {
        const visibleOrder = draftOrder.filter(visible);
        body.innerHTML = `<p>Pin menjaga kolom terlihat saat tabel digeser. Kolom yang dipin ditempatkan di kiri.</p><div class="pr-column-list">${visibleOrder.map((id, index) => {
          const label = labelFor(id);
          return `<div><label><input type="checkbox" data-pin="${id}" ${draftPinned.includes(id) ? "checked" : ""}> Pin ${esc(label)}</label><button type="button" class="btn btn-sm btn-outline-secondary" data-up="${id}" ${index === 0 ? "disabled" : ""} aria-label="Naik ${esc(label)}">↑</button><button type="button" class="btn btn-sm btn-outline-secondary" data-down="${id}" ${index === visibleOrder.length - 1 ? "disabled" : ""} aria-label="Turun ${esc(label)}">↓</button></div>`;
        }).join("")}</div><footer><button type="button" class="btn btn-outline-secondary" data-reset>Reset</button><button type="button" class="btn btn-primary" data-apply>Terapkan</button></footer>`;
      }
      body.addEventListener("change", (event) => {
        const id = event.target.dataset.pin;
        if (id) draftPinned = event.target.checked ? [...draftPinned, id] : draftPinned.filter((item) => item !== id);
      });
      body.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        if (button.hasAttribute("data-reset")) { draftOrder = [...defaultOrder]; draftPinned = []; render(); return; }
        if (button.hasAttribute("data-apply")) {
          order = draftOrder; pinned = draftPinned;
          try { localStorage.setItem(key, JSON.stringify({ order, pinned })); } catch {}
          apply(); node.close(); return;
        }
        const id = button.dataset.up || button.dataset.down;
        const visibleOrder = draftOrder.filter(visible);
        const index = draftOrder.indexOf(id), target = draftOrder.indexOf(visibleOrder[visibleOrder.indexOf(id) + (button.dataset.up ? -1 : 1)]);
        if (index >= 0 && target >= 0 && target < draftOrder.length) {
          [draftOrder[index], draftOrder[target]] = [draftOrder[target], draftOrder[index]];
          render();
          body.querySelector(`[data-${button.dataset.up ? "up" : "down"}="${id}"]`)?.focus();
        }
      });
      render(); node.showModal();
    });
    apply();
    return { apply };
  }
  root.PRFormTools = { lookup, columnLayout, columns };
})(window);
