(function () {
  const cfg = JSON.parse(document.getElementById("ppic-detail-config").textContent);
  const tab = cfg.activeTab;
  const key = cfg.recordKey;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: Math.min(Math.max(Number(digits) || 0, 0), 2) }).format(number(value));
  const qty = (value, uomCode = "") => window.SharedDataTable.formatQuantity(value, uomCode, { maximumFractionDigits: 2 });
  const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());
  const date = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "-";
  const month = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(value)) : "-";
  const period = (start, end) => `${date(start)} — ${date(end)}`;
  const slugStatus = (value) => String(value || "Draft").toLowerCase().replaceAll(" ", "-");
  const configs = {
    mrp: { label: "MRP", title: "Material Requirement Planning Detail", endpoint: "material-requirements-planning" },
    mps: { label: "MPS", title: "Master Production Schedule Detail", endpoint: "master-production-schedule" },
    "monthly-plan": { label: "Monthly Plan", title: "Monthly Production Plan Detail", endpoint: "monthly-plan" },
    "consume-forecast": { label: "Consume Forecast", title: "Consume Forecast Detail", endpoint: "consume-forecast" },
  };
  const config = configs[tab];
  let currentDoc = null;
  let supplierCatalog = [];
  let partCatalog = [];
  let supplierItemCatalog = [];
  const formulaReferenceStore = new Map();
  const plannerBucketStore = new Map();
  let activePlannerView = "matrix";

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses");
    return payload.data || payload;
  }
  function showAlert(message, kind = "danger") {
    const box = $("ppic-detail-alert");
    box.textContent = message;
    box.className = `alert alert-${kind}`;
  }
  function badge(status) { return `<span class="ppic-badge ${esc(slugStatus(status))}">${esc(status || "Draft")}</span>`; }
  function dateKey(value) { return validDate(value) ? new Date(value).toISOString().slice(0, 10) : null; }
  function halfMonthBucket(value) {
    if (!validDate(value)) return { key: "9999-99-X", label: "Tanpa Tanggal", sort: "9999-99-9", month: "Tanpa Tanggal", half: "-" };
    const parsed = new Date(value); const year = parsed.getFullYear(); const monthNumber = parsed.getMonth() + 1; const half = parsed.getDate() <= 15 ? "B1" : "B2"; const key = `${year}-${String(monthNumber).padStart(2, "0")}-${half}`;
    return { key, sort: `${year}-${String(monthNumber).padStart(2, "0")}-${half === "B1" ? "1" : "2"}`, label: `${new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(parsed)} ${half}`, month: month(parsed), half };
  }
  function renderPlanningFlow(doc) {
    const root = $("ppic-planning-flow"); if (!root || !["mps", "mrp", "monthly-plan"].includes(tab)) return;
    root.classList.remove("d-none");
    const suggestionNumber = doc.purchaseSuggestion?.suggestionNumber || null;
    const productionPlanNumber = doc.planNumber || doc.productionPlans?.[0]?.planNumber || null;
    const active = tab === "monthly-plan" ? "monthly" : tab === "mrp" ? "mrp" : "mps";
    const steps = [
      ["demand", "Forecast + SO", "Demand consumption", "/modules/planning-ppic/demand-planning"],
      ["mps", "Net MPS FG", "Rolling stock & buffer", tab === "mps" ? "#ppic-planner-matrix-card" : "/modules/planning-ppic/mps"],
      ["mrp", "MRP BOM", "Explosion & netting", tab === "mrp" ? "#ppic-planner-matrix-card" : "/modules/planning-ppic/mrp"],
      ["purchase-plan", "Purchase Plan", "Planned order material", tab === "mrp" ? "#ppic-procurement-card" : "/modules/planning-ppic/mrp"],
      ["suggestion", "Purchase Suggestion", "MOQ & supplier review", suggestionNumber ? `/modules/purchasing/purchase-suggestions/${encodeURIComponent(suggestionNumber)}` : "/modules/purchasing/purchase-suggestions"],
      ["prpo", "PR / PO", "Firm receipt", "/modules/purchasing/purchase-requisitions"],
      ["monthly", "Monthly Plan", "Production planned order", productionPlanNumber ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(productionPlanNumber)}` : "/modules/planning-ppic/monthly-plan"],
      ["daily", "Daily Capacity", "Machine, manpower, vendor", "/modules/planning-ppic/daily-production-plans"],
      ["dispatch", "MO / Vendor", "Execution schedule", "/modules/manufacturing/manufacturing-orders"],
      ["stock", "Stock Transaction", "FG, WIP, RM, purchase part", "/modules/inventory/stock-transactions"],
    ];
    const activeIndex = Math.max(steps.findIndex(([step]) => step === active), 0);
    root.innerHTML = steps.map(([step, title, subtitle, href], index) => {
      const done = index < activeIndex || (suggestionNumber && index <= steps.findIndex(([item]) => item === "suggestion"));
      return `<a href="${href}" data-flow-step="${step}" class="${done ? "done" : ""} ${active === step ? "active" : ""}"><span>${index + 1}</span><b>${title}</b><small>${subtitle}</small></a>`;
    }).join("");
  }
  function setInfo(title, fields) {
    $("ppic-info-title").textContent = title;
    $("ppic-info-grid").innerHTML = fields.map(([label, value, raw]) => `<div><small>${esc(label)}</small>${raw ? value : `<strong>${esc(value)}</strong>`}</div>`).join("");
  }
  function setTable(title, heads, rows, options = {}) {
    const table = $("ppic-detail-table");
    table?.style.setProperty("--ppic-excel-min-width", `${options.minWidth || Math.max(1100, heads.length * 124)}px`);
    $("ppic-table-title").textContent = title;
    $("ppic-detail-head").innerHTML = `<tr>${heads.map((head) => `<th>${esc(head)}</th>`).join("")}</tr>`;
    $("ppic-detail-rows").innerHTML = rows.join("") || `<tr><td colspan="${heads.length}" class="ppic-empty">Belum ada detail pada dokumen ini.</td></tr>`;
    refreshGroupedRows();
  }
  function setExcelTable(enabled) {
    $("ppic-detail-table")?.classList.toggle("ppic-excel-table", enabled);
    $("ppic-detail-table")?.classList.toggle("ppic-mps-excel-table", enabled && tab === "mps");
    $("ppic-detail-table-wrap")?.classList.toggle("ppic-excel-sheet", enabled);
  }
  function openMpsAdjustmentDialog(button) {
    const wrap = document.createElement("div");
    const partCode = button.dataset.partCode || "FG";
    wrap.className = "ops-modal-backdrop";
    wrap.innerHTML = `<form class="ops-modal ppic-adjustment-modal" role="dialog" aria-modal="true" aria-labelledby="ppic-adjustment-title">
      <header><div><p class="ops-eyebrow">MPS Adjustment</p><h2 id="ppic-adjustment-title">Edit ${esc(partCode)}</h2></div><button type="button" class="btn-close" data-cancel aria-label="Tutup"></button></header>
      <div class="ops-modal-body">
        <div class="alert alert-danger d-none" data-adjustment-error></div>
        <div class="ppic-adjustment-grid">
          <label><span>Buffer</span><div class="input-group"><input class="form-control" data-adjustment-buffer type="number" min="0" max="100" step="0.01" value="${esc(button.dataset.bufferPercent || 0)}" required><span class="input-group-text">%</span></div><small>Tambahan demand untuk menjaga buffer stock.</small></label>
          <label><span>Production</span><div class="input-group"><input class="form-control" data-adjustment-production type="number" min="0" max="100" step="0.01" value="${esc(button.dataset.productionPercent || 100)}" required><span class="input-group-text">%</span></div><small>SO aktual tetap menjadi batas minimum target produksi.</small></label>
          <label class="ppic-adjustment-scope"><span>Scope Buffer</span><select class="form-select" data-adjustment-scope><option value="parent" ${button.dataset.scope !== "line" ? "selected" : ""}>Parent FG</option><option value="line" ${button.dataset.scope === "line" ? "selected" : ""}>Per baris</option></select><small>Tentukan apakah perubahan mengikuti seluruh parent FG atau baris ini saja.</small></label>
        </div>
      </div>
      <footer><button type="button" class="btn btn-outline-secondary" data-cancel>Batal</button><button type="submit" class="btn btn-primary">Simpan Perubahan</button></footer>
    </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector("form");
    const focusField = button.dataset.focus === "production" ? "[data-adjustment-production]" : "[data-adjustment-buffer]";
    const close = () => wrap.remove();
    wrap.querySelectorAll("[data-cancel]").forEach((element) => element.addEventListener("click", close));
    wrap.addEventListener("click", (event) => { if (event.target === wrap) close(); });
    form.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const bufferPercent = number(form.querySelector("[data-adjustment-buffer]").value);
      const productionPercent = number(form.querySelector("[data-adjustment-production]").value);
      const scope = form.querySelector("[data-adjustment-scope]").value || "parent";
      const errorBox = form.querySelector("[data-adjustment-error]");
      if (bufferPercent < 0 || bufferPercent > 100 || productionPercent < 0 || productionPercent > 100) {
        errorBox.textContent = "Buffer dan Production harus antara 0 sampai 100%.";
        errorBox.classList.remove("d-none");
        return;
      }
      const submit = event.submitter;
      if (submit) submit.disabled = true;
      try {
        const detailIds = String(button.dataset.detailIds || "").split(",").filter(Boolean);
        await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(button.dataset.mpsNumber || key)}/adjustments`, {
          method: "PATCH", body: JSON.stringify({ detailIds, bufferPercent, productionPercent, scope }),
        });
        close();
        showAlert("Buffer FG dan persentase produksi berhasil diperbarui; target tidak dapat lebih kecil dari SO aktual.", "success");
        await load();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("d-none");
        if (submit) submit.disabled = false;
      }
    });
    requestAnimationFrame(() => form.querySelector(focusField)?.focus());
  }
  function openMrpPercentageDialog(button) {
    const kind = button.dataset.adjustmentKind === "order" ? "order" : "buffer";
    const isBuffer = kind === "buffer";
    const label = isBuffer ? "Buffer" : "Order";
    const wrap = document.createElement("div");
    wrap.className = "ops-modal-backdrop";
    wrap.innerHTML = `<form class="ops-modal ppic-adjustment-modal" role="dialog" aria-modal="true" aria-labelledby="ppic-mrp-adjustment-title">
      <header><div><p class="ops-eyebrow">MRP Adjustment</p><h2 id="ppic-mrp-adjustment-title">Edit ${label} % · ${esc(button.dataset.partCode || "Part")}</h2></div><button type="button" class="btn-close" data-cancel aria-label="Tutup"></button></header>
      <div class="ops-modal-body">
        <div class="alert alert-danger d-none" data-adjustment-error></div>
        <div class="ppic-adjustment-grid ppic-adjustment-grid-single">
          <label><span>${label} %</span><div class="input-group"><input class="form-control" data-mrp-percentage type="number" min="0" max="100" step="0.01" value="${esc(button.dataset.percentage || (isBuffer ? 0 : 100))}" required><span class="input-group-text">%</span></div><small>${isBuffer ? "Tambahan kebutuhan untuk menjaga buffer stock." : "Persentase kebutuhan yang akan dimasukkan ke purchase plan; SO aktual tetap menjadi minimum."}</small></label>
          ${isBuffer ? `<label><span>Scope Buffer</span><select class="form-select" data-mrp-scope><option value="parent" ${button.dataset.scope !== "line" ? "selected" : ""}>Parent FG</option><option value="line" ${button.dataset.scope === "line" ? "selected" : ""}>Per baris</option></select><small>Tentukan apakah perubahan mengikuti parent FG atau kebutuhan part pada baris ini.</small></label>` : ""}
        </div>
      </div>
      <footer><button type="button" class="btn btn-outline-secondary" data-cancel>Batal</button><button type="submit" class="btn btn-primary">Simpan Perubahan</button></footer>
    </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector("form");
    const close = () => wrap.remove();
    wrap.querySelectorAll("[data-cancel]").forEach((element) => element.addEventListener("click", close));
    wrap.addEventListener("click", (event) => { if (event.target === wrap) close(); });
    form.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const percentage = number(form.querySelector("[data-mrp-percentage]").value);
      const errorBox = form.querySelector("[data-adjustment-error]");
      if (percentage < 0 || percentage > 100) {
        errorBox.textContent = `${label} harus antara 0 sampai 100%.`;
        errorBox.classList.remove("d-none");
        return;
      }
      const submit = event.submitter;
      if (submit) submit.disabled = true;
      try {
        const requirementIds = String(button.dataset.requirementIds || "").split(",").filter(Boolean);
        const runNumber = encodeURIComponent(button.dataset.runNumber || key);
        if (isBuffer) {
          const scope = form.querySelector("[data-mrp-scope]").value || "parent";
          await api(`/modules/api/planning-ppic/mrp/${runNumber}/requirements/buffer`, {
            method: "PATCH", body: JSON.stringify({ requirementIds, bufferPercent: percentage, scope }),
          });
        } else {
          await api(`/modules/api/planning-ppic/mrp/${runNumber}/requirements/order-percent`, {
            method: "PATCH", body: JSON.stringify({ requirementIds, orderPercent: percentage }),
          });
        }
        close();
        showAlert(isBuffer ? "Buffer stock dan purchase plan berhasil dihitung ulang." : "Order % dan purchase plan berhasil dihitung ulang; SO aktual tetap menjadi minimum.", "success");
        await load();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("d-none");
        if (submit) submit.disabled = false;
      }
    });
    requestAnimationFrame(() => form.querySelector("[data-mrp-percentage]")?.focus());
  }
  function openFormulaReference(button) {
    const scope = button.dataset.formulaScope === "mps" ? "mps" : "mrp";
    const isProcessRow = button.dataset.generatedProcess === "true";
    const partCode = button.dataset.partCode || "Part";
    const uom = button.dataset.uom || "-";
    const reference = formulaReferenceStore.get(button.dataset.formulaReferenceId) || {};
    const traceSteps = Array.isArray(reference.calculationSteps) ? reference.calculationSteps : [];
    const value = (name) => number(button.dataset[name]);
    const referenceSection = (title, items, emptyText) => `<section class="ppic-formula-source-section"><h3>${esc(title)}</h3><div class="ppic-formula-source-list">${items?.length ? items.map((item) => `<article><div>${item.href ? `<a href="${esc(item.href)}"><b>${esc(item.title)}</b></a>` : `<b>${esc(item.title)}</b>`}<small>${esc(item.meta || "-")}</small></div>${item.qty ? `<strong>${esc(item.qty)}</strong>` : ""}</article>`).join("") : `<p>${esc(emptyText)}</p>`}</div></section>`;
    const formulaRows = scope === "mps" && traceSteps.length
      ? traceSteps.map((step) => [`${step.order}. ${step.label}`, step.formula || step.key, `${num(step.value, 3)} ${uom}`]) : scope === "mps"
      ? (isProcessRow ? [
        ["Effective Demand Parent", "forecastQty + bufferQty", `${num(value("forecast"), 3)} + ${num(value("bufferQty"), 3)} = ${num(value("effectiveDemand"), 3)} ${uom}`],
        ["Target Proses", "parent demand × rasio kebutuhan BOM / yield", `hasil BOM explosion = ${num(value("target"), 3)} ${uom}`],
      ] : [
        ["Buffer Qty", "round(bufferBaseQty × bufferPercent / 100, 6)", `${num(value("bufferBase"), 3)} × ${num(value("bufferPercent"), 2)}% = ${num(value("bufferQty"), 3)} ${uom}`],
        ["Effective Demand", "forecastQty + bufferQty", `${num(value("forecast"), 3)} + ${num(value("bufferQty"), 3)} = ${num(value("effectiveDemand"), 3)} ${uom}`],
        ["Target MPS", "max(effectiveDemandQty × productionPercent / 100, actualSalesOrderQty)", `max(${num(value("effectiveDemand"), 3)} × ${num(value("productionPercent"), 2)}%, ${num(value("actualSalesOrder"), 3)}) = ${num(value("target"), 3)} ${uom}`],
      ])
      : [
        ["Net Requirement", "max(grossRequirement − projectedAvailable, 0)", `max(${num(value("gross"), 3)} − ${num(value("projectedAvailable"), 3)}, 0) = ${num(value("net"), 3)} ${uom}`],
        ["Purchase Plan", "max(netRequirement × orderPercent / 100, soConsumedQty)", `max(${num(value("net"), 3)} × ${num(value("orderPercent"), 2)}%, ${num(value("actualSalesOrder"), 3)}) = ${num(value("purchasePlan"), 3)} ${uom}`],
      ];
    const formulaNote = scope === "mps"
      ? isProcessRow
        ? "Baris proses merupakan hasil BOM explosion dari parent FG, sehingga target proses memakai rasio kebutuhan BOM dan yield."
        : traceSteps.length ? "MPS menyimpan net planned production. Stok FG dan firm receipt dipakai satu kali secara rolling sebelum BOM explosion MRP." : "Dokumen legacy masih menyimpan gross MPS dan tetap dibaca dengan kontrak lama agar histori tidak berubah. Jalankan MPS bulanan baru untuk memakai netting rolling v2."
      : "Purchase Plan tidak boleh lebih kecil dari kebutuhan SO aktual.";
    const wrap = document.createElement("div");
    wrap.className = "ops-modal-backdrop";
    wrap.innerHTML = `<section class="ops-modal ppic-formula-modal" role="dialog" aria-modal="true" aria-labelledby="ppic-formula-title">
      <header><div><p class="ops-eyebrow">${scope.toUpperCase()} Formula Reference</p><h2 id="ppic-formula-title">${esc(partCode)}</h2></div><button type="button" class="btn-close" data-cancel aria-label="Tutup"></button></header>
      <div class="ops-modal-body"><p class="ppic-formula-intro">Rumus mengikuti Master Formula aktif. Angka di bawah diambil dari baris tabel ini dan ditampilkan dalam <b>${esc(uom)}</b>.</p><div class="ppic-formula-list">${formulaRows.map(([label, formula, result]) => `<div class="ppic-formula-row"><div><b>${esc(label)}</b><code>${esc(formula)}</code></div><strong>${esc(result)}</strong></div>`).join("")}</div><p class="ppic-formula-note">${formulaNote}</p><div class="ppic-formula-provenance"><h2>Sumber Angka</h2>${referenceSection("Jejak FG → Child → Material", reference.nettingFactors, "Belum ada jejak netting antar-level untuk baris ini.")}${referenceSection("Kebutuhan Barang", reference.demands, "Tidak ada detail sumber kebutuhan.")}${referenceSection("Forecast / Sales Order", reference.demandDocuments, "Tidak ada Forecast atau SO yang terhubung.")}${referenceSection("Stock Warehouse / Lot", reference.warehouseStock, "Tidak ada stock warehouse yang tersedia.")}${referenceSection("WIP / FG Ekuivalen", reference.wipStock, "Tidak ada WIP/FG ekuivalen yang digunakan.")}${referenceSection("Outstanding Purchase Order", reference.purchaseOrders, "Tidak ada outstanding PO yang eligible.")}</div></div>
      <footer><button type="button" class="btn btn-primary" data-cancel>Tutup</button></footer>
    </section>`;
    if (traceSteps.length) {
      const provenance = wrap.querySelector(".ppic-formula-provenance");
      const lineage = document.createElement("section");
      lineage.innerHTML = `<h2>Runtutan Pengambilan Data</h2><div class="ppic-formula-lineage">${traceSteps.map((step) => `<article><span>${esc(step.order)}</span><div><b>${esc(step.label)}</b><code>${esc(step.formula || step.key)}</code></div><strong>${num(step.value, 3)} ${esc(uom)}</strong></article>`).join("")}</div>`;
      provenance?.parentNode?.insertBefore(lineage, provenance);
    }
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll("[data-cancel]").forEach((element) => element.addEventListener("click", close));
    wrap.addEventListener("click", (event) => { if (event.target === wrap) close(); });
    wrap.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    requestAnimationFrame(() => wrap.querySelector("[data-cancel]")?.focus());
  }
  function preparePlanningView(items, options) {
    const root = $("ppic-table-filters");
    if (!root) return items;
    const storageKey = `ppic-filter:${tab}`;
    const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const values = (resolver) => [...new Set(items.map(resolver).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const select = (name, label, itemsForSelect) => `<select data-ppic-filter="${name}" aria-label="Filter ${label}"><option value="">Semua ${label}</option>${itemsForSelect.map((value) => `<option value="${esc(value)}" ${state[name] === String(value) ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>`;
    const groupOptions = (level) => `${level === 3 ? '<option value="">Group 3: Tidak digunakan</option>' : ''}<option value="customer">Group ${level}: Customer</option><option value="month">Group ${level}: Bulan</option><option value="part">Group ${level}: Part</option><option value="parentFg">Group ${level}: Parent FG Forecast</option>`;
    const groupingControls = options.fixedGrouping
      ? '<span class="ppic-fixed-grouping">Urutan: Hirarki BOM</span>'
      : `<select data-ppic-group="1">${groupOptions(1)}</select><select data-ppic-group="2">${groupOptions(2)}</select><select data-ppic-group="3">${groupOptions(3)}</select>`;
    root.innerHTML = `${select("customer", "Customer", values(options.customer))}${select("month", "Bulan", values((row) => month(options.month(row))))}${select("part", "Part", values(options.part))}<button type="button" class="ppic-filter-reset" data-action="reset-ppic-filter">Reset filter</button>${groupingControls}`;
    const savedGrouping = JSON.parse(localStorage.getItem(`ppic-grouping:${tab}`) || "[\"customer\",\"month\",\"part\"]");
    const grouping = [savedGrouping[0] || "customer", savedGrouping[1] || "month", savedGrouping.length > 2 ? (savedGrouping[2] || "") : "part"];
    localStorage.setItem(`ppic-grouping:${tab}`, JSON.stringify(grouping));
    root.querySelectorAll("[data-ppic-group]").forEach((input, index) => { input.value = grouping[index]; input.addEventListener("change", () => { const next = [...root.querySelectorAll("[data-ppic-group]")].map((field) => field.value); const selected = next.filter(Boolean); if (!next[0] || !next[1] || new Set(selected).size !== selected.length) return showAlert("Group 1 dan Group 2 wajib dipilih berbeda. Group 3 boleh dikosongkan.", "warning"); localStorage.setItem(`ppic-grouping:${tab}`, JSON.stringify(next)); render(currentDoc); }); });
    root.querySelectorAll("[data-ppic-filter]").forEach((input) => input.addEventListener("change", () => { const next = Object.fromEntries([...root.querySelectorAll("[data-ppic-filter]")].map((field) => [field.dataset.ppicFilter, field.value])); localStorage.setItem(storageKey, JSON.stringify(next)); render(currentDoc); }));
    return items.filter((row) => (!state.customer || String(options.customer(row) || "") === state.customer) && (!state.month || month(options.month(row)) === state.month) && (!state.part || String(options.part(row) || "") === state.part));
  }
  function monthKey(value) {
    if (!validDate(value)) return "9999-99";
    const parsed = new Date(value);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  function customGroupedPlanningRows(items, options, grouping) {
    const labels = { customer: "Customer", month: "Bulan", part: "Part", parentFg: "Parent FG Forecast" };
    const valueFor = (item, group) => group === "customer"
      ? (options.customer(item) || "Tanpa Customer")
      : group === "month"
        ? month(options.month(item))
        : group === "parentFg"
          ? (options.parentFg?.(item) || options.planPart(item) || "Tanpa Parent FG")
          : (options.planPart(item) || "Tanpa Part");
    const root = new Map();
    for (const item of items) {
      let branch = root;
      for (const group of grouping) {
        const value = valueFor(item, group);
        if (!branch.has(value)) branch.set(value, new Map());
        branch = branch.get(value);
      }
      if (!branch.has("__items")) branch.set("__items", []);
      branch.get("__items").push(item);
    }
    const countItems = (branch) => [...branch.entries()].reduce((total, [key, value]) => key === "__items" ? total + value.length : total + countItems(value), 0);
    const rows = [];
    const visit = (branch, level, context = {}) => {
      for (const [value, child] of [...branch.entries()].filter(([key]) => key !== "__items").sort(([a], [b]) => String(a).localeCompare(String(b)))) {
        const group = grouping[level]; const isLast = level === grouping.length - 1; const count = countItems(child); const nextContext = { ...context, [group]: value };
        rows.push(`<tr class="ppic-group-row ${esc(group)}" data-group-level="${level + 1}"><td colspan="${options.colSpan}">${isLast ? `<button type="button" class="ppic-group-toggle" data-action="toggle-ppic-group"><i class="ppic-group-caret">⌄</i><span class="ppic-group-label">${esc(labels[group])}</span><b>${esc(value)}</b><em>${num(count)} baris</em></button>` : `<div class="ppic-group-static"><span class="ppic-group-label">${esc(labels[group])}</span><b>${esc(value)}</b><em>${num(count)} baris</em></div>`}</td></tr>`);
        if (isLast) {
          const leafItems = child.get("__items") || [];
          if (group === "part" && typeof options.planPartLabelFor === "function") {
            const label = options.planPartLabelFor(value, leafItems);
            const display = typeof options.planPartDisplay === "function" ? options.planPartDisplay(value, leafItems) : { code: value, name: "" };
            const lastRow = rows.at(-1);
            if (lastRow && label) rows[rows.length - 1] = lastRow.replace('class="ppic-group-label">Finished Good', `class="ppic-group-label">${esc(label)}`).replace("</b><em>", `${display.name ? `<small class="ppic-cell-sub">${esc(display.name)}</small>` : ""}</b><em>`);
          } else if (group === "parentFg" && typeof options.parentFgDisplay === "function") {
            const display = options.parentFgDisplay(value, leafItems) || { code: value, name: "" };
            const lastRow = rows.at(-1);
            if (lastRow) rows[rows.length - 1] = lastRow.replace(`<b>${esc(value)}</b>`, `<b>${esc(display.code || value)}</b>${display.name ? `<small class="ppic-cell-sub">${esc(display.name)}</small>` : ""}`);
          }
          rows.push(...options.renderItems(leafItems, nextContext));
        } else visit(child, level + 1, nextContext);
      }
    };
    visit(root, 0); return rows;
  }
  function groupedPlanningRows(items, options) {
    const savedGrouping = JSON.parse(localStorage.getItem(`ppic-grouping:${tab}`) || "[\"customer\",\"month\",\"part\"]");
    const grouping = [savedGrouping[0] || "customer", savedGrouping[1] || "month", savedGrouping.length > 2 ? (savedGrouping[2] || "") : "part"].filter(Boolean);
    return customGroupedPlanningRows(items, options, grouping);
  }
  function refreshGroupedRows() {
    const body = $("ppic-detail-rows");
    if (!body) return;
    const collapsedLevels = [];
    [...body.querySelectorAll("tr")].forEach((row) => {
      const level = Number(row.dataset.groupLevel || 0);
      if (level) {
        while (collapsedLevels.length && collapsedLevels.at(-1) >= level) collapsedLevels.pop();
        row.classList.toggle("ppic-group-hidden", collapsedLevels.length > 0);
        const toggle = row.querySelector("[data-action='toggle-ppic-group']");
        if (toggle) toggle.setAttribute("aria-expanded", String(!row.classList.contains("collapsed")));
        if (row.classList.contains("collapsed")) collapsedLevels.push(level);
      } else {
        row.classList.toggle("ppic-group-hidden", collapsedLevels.length > 0);
      }
    });
  }
  function setSummary(title, fields, notes) {
    $("ppic-summary-title").textContent = title;
    $("ppic-summary-grid").innerHTML = fields.map(([label, value]) => `<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("");
    const note = $("ppic-detail-notes");
    note.textContent = notes || "";
    note.classList.toggle("d-none", !notes);
  }
  function refreshDeliveryFormOptions() {
    const type = "CUSTOMER";
    const detailSelect = $("ppic-delivery-detail");
    const targetSelect = $("ppic-delivery-target");
    if (!detailSelect || !targetSelect || !currentDoc) return;
    const generated = (row) => String(row.notes || "").startsWith("[MRP-PRODUCTION]");
    const candidates = (currentDoc.details || []).filter((row) =>
      number(row.qtyPlanned) > 0 && !generated(row));
    const previousDetail = detailSelect.value;
    detailSelect.innerHTML = candidates.map((row) => {
      const allocated = (currentDoc.deliveryPlans || [])
        .filter((phase) => phase.mpsDetailId === row.id && phase.targetType === type && phase.status !== "Cancelled")
        .reduce((sum, phase) => sum + number(phase.qtyPlanned), 0);
      const remaining = Math.max(number(row.qtyPlanned) - allocated, 0);
      return `<option value="${esc(row.id)}" data-remaining="${esc(remaining)}" data-date="${esc(String(row.endDate || currentDoc.periodEnd || "").slice(0, 10))}">${esc(row.partCode)} · sisa ${num(remaining, 3)}</option>`;
    }).join("") || `<option value="">Tidak ada part yang sesuai</option>`;
    if ([...detailSelect.options].some((option) => option.value === previousDetail)) detailSelect.value = previousDetail;
    const catalog = currentDoc.deliveryCatalogs?.customers;
    const codeKey = "customerCode";
    const nameKey = "customerName";
    const targetHelp = $("ppic-delivery-target-help");
    const targetMasterLink = $("ppic-delivery-target-master-link");
    const preferredCode = candidates.find((row) => row.id === detailSelect.value)?.customerCode;
    targetSelect.innerHTML = (catalog || []).map((row) => `<option value="${esc(row[codeKey])}" ${row[codeKey] === preferredCode ? "selected" : ""}>${esc(row[codeKey])} · ${esc(row[nameKey] || "")}</option>`).join("") || `<option value="">Partner aktif tidak tersedia</option>`;
    if (targetHelp) targetHelp.textContent = (catalog || []).length
      ? `${num(catalog.length)} customer tersedia.`
      : "Belum ada master Customer aktif.";
    if (targetMasterLink) {
      targetMasterLink.href = "/master-data/customers";
      targetMasterLink.textContent = "Tambah di Master Customer →";
      targetMasterLink.classList.toggle("d-none", (catalog || []).length > 0);
    }
    const selected = detailSelect.selectedOptions[0];
    if (selected) {
      $("ppic-delivery-qty").value = selected.dataset.remaining || "";
      $("ppic-delivery-date").value = selected.dataset.date || String(currentDoc.periodEnd || "").slice(0, 10);
    }
  }
  function closeInlineDeliveryForm() {
    const form = $("ppic-delivery-plan-form");
    const parking = $("ppic-delivery-form-parking");
    if (form && parking) {
      form.classList.add("d-none");
      parking.appendChild(form);
    }
    $("ppic-inline-delivery-form-row")?.remove();
  }
  function openInlineDeliveryForm(button) {
    closeInlineDeliveryForm();
    const form = $("ppic-delivery-plan-form");
    const sourceRow = button.closest("tr");
    if (!form || !sourceRow) return;
    refreshDeliveryFormOptions();
    const detailSelect = $("ppic-delivery-detail");
    const requestedDetailId = button.dataset.deliveryDetailId;
    if (requestedDetailId && [...detailSelect.options].some((option) => option.value === requestedDetailId)) {
      detailSelect.value = requestedDetailId;
      refreshDeliveryFormOptions();
    }
    const formRow = document.createElement("tr");
    formRow.id = "ppic-inline-delivery-form-row";
    formRow.className = "ppic-inline-form-row";
    const cell = document.createElement("td");
    cell.colSpan = 20;
    cell.innerHTML = `<div class="ppic-inline-form-title"><b>Tambah Customer Delivery Phase</b><small>Jadwal ini mengikuti forecast part pada baris di atas. Vendor send–return tetap di Capacity Planning.</small></div>`;
    form.classList.remove("d-none");
    cell.appendChild(form);
    formRow.appendChild(cell);
    sourceRow.after(formRow);
    formRow.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function readinessFix(issue) {
    const code = String(issue.code || "").toUpperCase();
    const partCode = issue.partCode || issue.parentPartCode || "";
    if (code.includes("UOM") || code === "PURCHASE_SUPPLIER_MISSING") {
      return {
        href: `/master-data/parts/${encodeURIComponent(partCode)}/edit?key=${encodeURIComponent(partCode)}&focus=${code.includes("UOM") ? "uom" : "supplier"}`,
        label: code.includes("UOM") ? "Perbaiki UOM Part" : "Atur Supplier Part",
      };
    }
    if (issue.bomNumber) {
      return {
        href: `/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(issue.bomNumber)}/edit?focusPart=${encodeURIComponent(partCode)}&focusIssue=${encodeURIComponent(code)}`,
        label: "Buka Editor BOM",
      };
    }
    return {
      href: `/modules/manufacturing-bom/bill-of-materials/new?partCode=${encodeURIComponent(partCode)}&source=MPS_READINESS`,
      label: "Buat mBOM",
    };
  }
  function renderReadinessLinks(readiness) {
    const root = $("ppic-readiness-list");
    if (!root) return;
    const issues = Array.isArray(readiness?.issues) ? readiness.issues : [];
    root.classList.toggle("d-none", issues.length === 0);
    root.innerHTML = issues.length ? `<div class="ppic-readiness-head"><div><b>Readiness Blocking</b><small>Klik tindakan untuk memperbaiki sumber blocker.</small></div><span>${num(readiness.blockingCount)} blocker · ${num(readiness.warningCount)} warning</span></div><div class="ppic-readiness-items">${issues.map((issue) => {
      const fix = readinessFix(issue);
      return `<article class="${String(issue.severity).toUpperCase() === "BLOCKING" ? "blocking" : "warning"}"><span class="ppic-readiness-severity">${esc(issue.severity || "INFO")}</span><div><b>${esc(issue.code || "READINESS")}</b><p>${esc(issue.message || "-")}</p><small>${esc([issue.partCode, issue.processCode, issue.bomNumber].filter(Boolean).join(" · "))}</small></div><a href="${fix.href}">${esc(fix.label)} <span aria-hidden="true">→</span></a></article>`;
    }).join("")}</div>` : "";
  }
  function renderWorkflow(doc, steps, path) {
    $("ppic-workflow").innerHTML = steps.map((step) => `<div class="ppic-workflow-step ${step.done ? "done" : "pending"}"><span class="ppic-workflow-mark">${step.done ? "✓" : "◷"}</span><div><b>${esc(step.title)}</b><small>${esc(step.actor || "Menunggu proses")}</small><time>${esc(step.at ? date(step.at) : "")}</time>${step.note ? `<p>${esc(step.note)}</p>` : ""}</div></div>`).join("");
    $("ppic-status-path").innerHTML = path.map((item, index) => `${index ? '<span>›</span>' : ''}<b class="${index === path.length - 1 ? "current" : ""}">${esc(item)}</b>`).join("");
  }
  function progressBar(value) {
    const safe = Math.max(0, Math.min(number(value), 100));
    return `<div class="ppic-progress"><span style="width:${safe}%"></span></div>`;
  }
  function baseWorkflow(doc, finalLabel) {
    const approved = Boolean(doc.approvedDate || doc.confirmedAt || doc.releasedAt || ["Confirmed", "Partial Product", "Released", "Completed", "Active", "Closed", "Consumed"].includes(doc.status));
    return [
      { done: true, title: `Submitted by ${doc.createdBy || doc.runBy || "Planner"}`, actor: "PPIC Planner", at: doc.createdAt, note: doc.notes },
      { done: approved, title: approved ? `Reviewed by ${doc.approvedBy || doc.confirmedBy || doc.releasedBy || "PPIC"}` : "PPIC Review", actor: approved ? "Review selesai" : "Menunggu pemeriksaan", at: doc.approvedDate || doc.confirmedAt || doc.releasedAt },
      { done: ["Released", "Completed", "Active", "Closed", "Consumed"].includes(doc.status), title: finalLabel, actor: doc.status || "Draft", at: doc.updatedAt },
    ];
  }
  const reportNumber = (value) => Number(number(value).toFixed(2));
  const reportDateTime = (value) => validDate(value)
    ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date(value))
    : "-";
  const reportText = (...values) => values.map((value) => String(value || "").trim()).filter(Boolean).join(" - ") || "-";
  function mpsManagementReport(doc) {
    const generated = (row) => String(row.notes || "").startsWith("[MRP-PRODUCTION]");
    const cycleDocuments = doc.planningCycle?.documents?.length ? doc.planningCycle.documents : [doc];
    const receipts = cycleDocuments.flatMap((document) => (document.details || [])
      .filter((row) => !generated(row))
      .map((row) => ({ ...row, _sourceMpsNumber: document.mpsNumber })));
    const phases = cycleDocuments.flatMap((document) => (document.deliveryPlans || []))
      .filter((row) => String(row.targetType || "").toUpperCase() === "CUSTOMER" && row.status !== "Cancelled");
    const demandRows = [];
    const sourceRows = [];
    receipts.forEach((receipt) => {
      const receiptPhases = phases.filter((phase) => phase.mpsDetailId === receipt.id);
      const allocatedQty = receiptPhases.reduce((sum, phase) => sum + number(phase.qtyPlanned), 0);
      const remainingQty = Math.max(number(receipt.qtyPlanned) - allocatedQty, 0);
      const effectivePhases = receiptPhases.length
        ? [...receiptPhases, ...(remainingQty > 0.000001 ? [{ phaseNumber: "-", plannedDate: receipt.endDate, fgRequiredDate: receipt.endDate, qtyPlanned: remainingQty, targetCode: receipt.customerCode, sourceNumber: "BUFFER_STOCK", status: "Planned", _bufferOnly: true }] : [])]
        : [{ phaseNumber: "-", plannedDate: receipt.customerTargetDate || receipt.endDate, fgRequiredDate: receipt.fgRequiredDate || receipt.endDate, qtyPlanned: receipt.qtyPlanned, targetCode: receipt.customerCode, sourceNumber: receipt.forecastDetail?.forecastNumber || doc.forecastNumber, status: receipt.status }];
      const sources = Array.isArray(receipt.demandSources) ? receipt.demandSources : [];
      effectivePhases.forEach((phase) => {
        const share = number(receipt.qtyPlanned) > 0 ? number(phase.qtyPlanned) / number(receipt.qtyPlanned) : 1;
        const matchedSources = sources.filter((source) => !source.deliveryTargetId || source.deliveryTargetId === phase.sourceDeliveryTargetId);
        const sourceNumbers = [...new Set([
          ...matchedSources.map((source) => source.sourceNumber), phase.sourceNumber,
          receipt.forecastDetail?.forecastNumber, receipt.soNumber,
        ].filter(Boolean))];
        const priority = matchedSources.find((source) => source.priorityClass)?.priorityClass
          || receipt.priorityClass || (receipt.priority ? `P${receipt.priority}` : "-");
        const risk = matchedSources.find((source) => source.feasibilityStatus || source.criticalConstraint);
        demandRows.push({
          mpsNumber: receipt._sourceMpsNumber || doc.mpsNumber,
          planningMonth: month(phase.plannedDate || receipt.startDate || doc.periodStart),
          customerCode: phase.targetCode || receipt.customerCode || "-",
          partCode: receipt.partCode || "-",
          partNumber: receipt.part?.partNumber || "-",
          partName: receipt.part?.partName || "-",
          deliveryPhase: phase._bufferOnly ? "Buffer Stock" : `Phase ${phase.phaseNumber || "-"}`,
          targetDelivery: reportDateTime(phase.plannedDate || receipt.customerTargetDate),
          fgRequired: reportDateTime(phase.fgRequiredDate || receipt.fgRequiredDate || phase.plannedDate),
          forecastQty: reportNumber(number(receipt.forecastQty) * share),
          actualSoQty: reportNumber(number(receipt.actualSalesOrderQty) * share),
          bufferQty: reportNumber(number(receipt.bufferQty) * share),
          targetMpsQty: reportNumber(phase.qtyPlanned),
          uomCode: receipt.uomCode || receipt.part?.uomCode || "-",
          priority,
          sourceNumbers: sourceNumbers.join(", ") || "-",
          risk: risk?.feasibilityStatus || risk?.criticalConstraint || receipt.feasibilityStatus || receipt.criticalConstraint || receipt.status || "Planned",
        });
      });
      sources.forEach((source) => sourceRows.push([
        receipt._sourceMpsNumber || doc.mpsNumber, source.sourceType || "-", source.sourceNumber || "-",
        source.customerCode || receipt.customerCode || "-", receipt.partCode || "-", reportDateTime(source.targetDeliveryDate),
        reportDateTime(source.fgRequiredDate), reportNumber(source.qty), source.uomCode || receipt.uomCode || "-",
        source.priorityClass || "-", source.feasibilityStatus || "-", source.criticalConstraint || "-",
      ]));
    });
    const details = cycleDocuments.flatMap((document) => (document.details || []).map((row) => ({ ...row, _sourceMpsNumber: document.mpsNumber })));
    const processRows = details.map((row) => {
      const processPath = Array.isArray(row.processPath) ? row.processPath : [];
      const process = processPath.length
        ? processPath.map((item) => `${item.routingNumber || item.sequence || "-"}. ${item.name || "Process"}`).join(" > ")
        : (generated(row) ? "BOM-derived process" : "FG Receipt");
      return [
        generated(row) ? (String(row.part?.itemType || row.itemType || "").toUpperCase() === "FG" ? "Child FG Receipt" : "Child / SFG Process") : "FG Receipt",
        row._sourceMpsNumber || doc.mpsNumber, row.customerCode || "-", row.parentFgPartCode || row.planningPartCode || row.partCode || "-",
        row.partCode || "-", row.part?.partNumber || "-", row.part?.partName || "-", process,
        reportDateTime(row.startDate), reportDateTime(row.endDate), row.mbomNoRegSnapshot || row.mbom?.noReg || "-",
        row.mbomRevisionSnapshot ?? row.mbom?.revision ?? "-", reportNumber(row.qtyPlanned), row.uomCode || row.part?.uomCode || "-", row.status || "Planned",
      ];
    });
    const readiness = doc.readiness || {};
    const totalBy = (field) => reportNumber(receipts.reduce((sum, row) => sum + number(row[field]), 0));
    const totalByUom = (field) => {
      const totals = new Map();
      receipts.forEach((row) => {
        const uom = String(row.uomCode || row.part?.uomCode || "UNIT").toUpperCase();
        totals.set(uom, number(totals.get(uom)) + number(row[field]));
      });
      return [...totals.entries()].map(([uom, value]) => `${reportNumber(value)} ${uom}`).join(" | ") || "0";
    };
    const horizonStart = doc.planningCycle?.periodStart || doc.periodStart;
    const horizonEnd = doc.planningCycle?.periodEnd || doc.periodEnd;
    const summary = [
      ["Planning Cycle", (doc.planningCycle?.mpsNumbers || [doc.mpsNumber]).join(" + "), "Demand yang dikunci dalam satu horizon"],
      ["Horizon", `${reportDateTime(horizonStart)} s.d. ${reportDateTime(horizonEnd)}`, "Tanggal target delivery customer"],
      ["Forecast", totalBy("forecastQty"), "Demand forecast yang disetujui"],
      ["Actual SO", totalBy("actualSalesOrderQty"), "Sales Order aktual pada demand"],
      ["Buffer Stock", totalBy("bufferQty"), "Target ending buffer dari master/override PPIC"],
      ["Target MPS", totalBy("qtyPlanned"), "Gross target produksi; stock dinetting di MRP"],
      ["Delivery Phase", phases.length, "Target delivery customer yang terlindungi"],
      ["Readiness", readiness.ok === false ? "BLOCKED" : "READY", `${number(readiness.blockingCount)} blocker; ${number(readiness.warningCount)} warning`],
      ["Cycle Status", doc.planningCycle?.status || doc.status || "-", "Status review dan lock PPIC"],
    ];
    const managementHeaders = ["MPS", "Bulan", "Customer", "FG Code", "Part Number", "Part Name", "Delivery Phase", "Target Delivery", "FG Required", "Forecast", "Actual SO", "Buffer", "Target MPS", "UOM", "Priority", "Source", "Risk / Status"];
    const managementRows = demandRows.map((row) => [row.mpsNumber, row.planningMonth, row.customerCode, row.partCode, row.partNumber, row.partName, row.deliveryPhase, row.targetDelivery, row.fgRequired, row.forecastQty, row.actualSoQty, row.bufferQty, row.targetMpsQty, row.uomCode, row.priority, row.sourceNumbers, row.risk]);
    const title = `MPS Management Report - ${doc.mpsNumber}`;
    return {
      title,
      subtitle: `Demand-driven schedule | ${reportDateTime(horizonStart)} s.d. ${reportDateTime(horizonEnd)} | Status ${doc.planningCycle?.status || doc.status || "-"}`,
      fileName: `mps-management-${doc.mpsNumber}`,
      documentLabel: "RENBO ERP - MPS MANAGEMENT REPORT",
      pageSize: "A4", keepColumnsTogether: true, bodyFontSize: 6.8,
      headers: ["Bulan", "Customer", "Finished Good", "Delivery Phase", "Target Delivery", "FG Required", "Forecast", "Actual SO", "Buffer", "Target MPS", "Status / Risk"],
      rows: demandRows.map((row) => [row.planningMonth, row.customerCode, reportText(row.partCode, row.partNumber, row.partName), row.deliveryPhase, row.targetDelivery, row.fgRequired, `${row.forecastQty} ${row.uomCode}`, `${row.actualSoQty} ${row.uomCode}`, `${row.bufferQty} ${row.uomCode}`, `${row.targetMpsQty} ${row.uomCode}`, reportText(row.priority, row.risk)]),
      summary: [
        { label: "Target MPS", value: totalByUom("qtyPlanned") }, { label: "Actual SO", value: totalByUom("actualSalesOrderQty") },
        { label: "Buffer", value: totalByUom("bufferQty") }, { label: "Delivery Phase", value: String(phases.length) },
        { label: "Readiness", value: readiness.ok === false ? "BLOCKED" : "READY" }, { label: "Blocker", value: String(number(readiness.blockingCount)) },
      ],
      columnWidths: [0.8, 0.65, 1.55, 0.75, 1.05, 1.05, 0.75, 0.75, 0.7, 0.8, 1.1],
      alignments: ["left", "left", "left", "center", "center", "center", "right", "right", "right", "right", "left"],
      sheets: [
        { name: "Management Summary", title, subtitle: "Angka utama dan arti keputusan planning", headers: ["Metric", "Value", "Management Meaning"], rows: summary },
        { name: "Demand Matrix", title: `Demand Matrix ${doc.mpsNumber}`, subtitle: "Satu baris per delivery phase; buffer stock dipisahkan", headers: managementHeaders, rows: managementRows },
        { name: "Demand Source Pegging", title: `Demand Source Pegging ${doc.mpsNumber}`, subtitle: "Trace Forecast/SO sampai target delivery dan FG required", headers: ["MPS", "Source Type", "Source Number", "Customer", "FG Code", "Target Delivery", "FG Required", "Qty", "UOM", "Priority", "Feasibility", "Critical Constraint"], rows: sourceRows },
        { name: "BOM Process Schedule", title: `BOM & Process Schedule ${doc.mpsNumber}`, subtitle: "Detail teknis untuk audit PPIC; management dapat tetap memakai Demand Matrix", headers: ["Type", "MPS", "Customer", "Parent FG", "Part Code", "Part Number", "Part Name", "Process", "Start", "Finish", "BOM Number", "BOM Revision", "Qty", "UOM", "Status"], rows: processRows },
        { name: "Readiness", title: `Readiness ${doc.mpsNumber}`, subtitle: "Blocker dan warning sebelum downstream release", headers: ["Severity", "Code", "Part", "Process", "Message"], rows: (readiness.issues || []).map((issue) => [issue.severity || "-", issue.code || "-", issue.partCode || issue.parentPartCode || "-", issue.processCode || "-", issue.message || "-"]) },
      ],
    };
  }
  function buildMrpManagementMatrix(doc) {
    const trace = Array.isArray(doc.requirementTrace) ? doc.requirementTrace : [];
    const roots = trace.filter((row) => row.orderType === "Production" && number(row.levelMBOM) === 0);
    const byId = new Map(trace.map((row) => [row.id, row]));
    const rootOf = (row) => byId.get(row.rootRequirementId) || (row.orderType === "Production" && number(row.levelMBOM) === 0 ? row : null);
    const uomOf = (row) => String(row.uomCode || row.mbomDetail?.uomCode || row.part?.stockUomCode || row.part?.productionUomCode || "UNIT").toUpperCase();
    const materialByRoot = new Map();
    const wipByRoot = new Map();
    trace.forEach((row) => {
      const root = rootOf(row);
      const rootKey = root?.id || row.rootRequirementId || `${row.mpsDetailId || "-"}|${row.fgPartCode || "-"}`;
      if (row.orderType === "Production" && number(row.levelMBOM) > 0) {
        if (!wipByRoot.has(rootKey)) wipByRoot.set(rootKey, []);
        wipByRoot.get(rootKey).push(row);
      }
      if (row.orderType === "Purchase") {
        if (!materialByRoot.has(rootKey)) materialByRoot.set(rootKey, []);
        materialByRoot.get(rootKey).push(row);
      }
    });
    const fgRows = roots.map((root) => {
      const wip = wipByRoot.get(root.id) || [];
      const materials = materialByRoot.get(root.id) || [];
      const wipSummary = wip.map((row) => `${row.partCode}: ${reportNumber(row.onHandQty)} stock / ${reportNumber(row.netRequirement)} plan`).join(" | ") || "Tidak ada WIP intermediate";
      const shortageByUom = new Map();
      materials.forEach((row) => shortageByUom.set(uomOf(row), number(shortageByUom.get(uomOf(row))) + number(row.netRequirement)));
      const materialShortageSummary = [...shortageByUom.entries()].map(([uom, qty]) => `${reportNumber(qty)} ${uom}`).join(" | ") || "Covered";
      return {
        customerCode: root.customerCode || "-",
        partCode: root.fgPartCode || root.partCode,
        partNumber: root.part?.partNumber || "-",
        partName: root.part?.partName || "-",
        targetDeliveryDate: root.targetDeliveryDate,
        demandQty: number(root.grossRequirement),
        onHandQty: number(root.onHandQty),
        netQty: number(root.netRequirement),
        uomCode: uomOf(root),
        wipSummary,
        materialShortageSummary,
        status: number(root.netRequirement) > 0 || materials.some((row) => number(row.netRequirement) > 0) ? "ACTION REQUIRED" : "COVERED",
      };
    });
    const materialMap = new Map();
    const purchaseRequirements = Array.isArray(doc.requirements) ? doc.requirements : trace.filter((row) => row.orderType === "Purchase");
    purchaseRequirements.forEach((row) => {
      const uomCode = uomOf(row);
      const key = `${row.partCode}|${uomCode}`;
      const current = materialMap.get(key) || { partCode: row.partCode, partNumber: row.part?.partNumber || "-", partName: row.part?.partName || "-", uomCode, grossQty: 0, onHandQty: 0, firmSupplyQty: 0, netQty: 0, plannedBuyQty: 0, prNumbers: new Set(), poDetails: new Map() };
      current.grossQty += number(row.grossRequirement);
      // Saldo snapshot yang sama tidak boleh dijumlah berulang antar due date.
      current.onHandQty = Math.max(current.onHandQty, number(row.onHandQty));
      current.firmSupplyQty = Math.max(current.firmSupplyQty, number(row.firmSupplyQty));
      current.netQty += number(row.netRequirement);
      materialMap.set(key, current);
    });
    (doc.plannedOrders || []).forEach((order) => {
      const key = `${order.partCode}|${String(order.uomCode || order.part?.stockUomCode || "UNIT").toUpperCase()}`;
      const current = materialMap.get(key) || { partCode: order.partCode, partNumber: order.part?.partNumber || "-", partName: order.part?.partName || "-", uomCode: String(order.uomCode || "UNIT").toUpperCase(), grossQty: 0, onHandQty: 0, firmSupplyQty: 0, netQty: 0, plannedBuyQty: 0, prNumbers: new Set(), poDetails: new Map() };
      current.plannedBuyQty += number(order.qty);
      (order.purchaseRequests || (order.purchaseRequest ? [order.purchaseRequest] : [])).forEach((request) => {
        if (request.prNumber) current.prNumbers.add(request.prNumber);
        (request.purchaseOrders || []).forEach((po) => current.poDetails.set(po.poDetailId || `${po.poNumber}|${po.orderedQty}`, po));
      });
      materialMap.set(key, current);
    });
    const materialRows = [...materialMap.values()].map((row) => {
      const pos = [...row.poDetails.values()];
      const poOrderedQty = pos.reduce((sum, po) => sum + number(po.orderedQty), 0);
      const poReceivedQty = pos.reduce((sum, po) => sum + number(po.receivedQty), 0);
      const poOutstandingQty = pos.reduce((sum, po) => sum + number(po.outstandingQty), 0);
      return { ...row, prNumbers: [...row.prNumbers].join(", ") || "Belum PR", poOrderedQty, poReceivedQty, poOutstandingQty, status: row.netQty <= 0 ? "COVERED" : poOutstandingQty > 0 ? "PO INBOUND" : row.prNumbers.size ? "PR IN PROCESS" : "BUY REQUIRED" };
    }).sort((left, right) => left.partCode.localeCompare(right.partCode));
    return { fgRows, materialRows };
  }

  function mrpManagementReport(doc) {
    const procurementItems = mrpPresentation.procurement?.items || [];
    const peggingItems = mrpPresentation.pegging?.items || [];
    const procurementRows = procurementItems.map((row) => {
      const identity = procurementPresentationIdentity(row);
      const arrival = row.supplierRequiredArrivalDate || row.materialRequiredDate || row.exactRequiredDate;
      return [
        halfMonthBucket(arrival).label, reportText(identity.materialCode || row.materialCode || row.partCode, row.partCode && row.partCode !== identity.materialCode ? `Source ${row.partCode}` : "", identity.partNumber, identity.partName),
        identity.supplierName, reportDateTime(row.customerDeliveryDate), reportDateTime(row.productionStartDate), reportDateTime(row.materialRequiredDate),
        reportDateTime(arrival), `PR ${reportDateTime(row.latestPrDate)} | PO ${reportDateTime(row.latestPoDate)}`,
        reportNumber(row.requirementQty), reportNumber(row.suggestedOrderQty), row.uomCode || "-", row.risk || "-",
      ];
    });
    const peggingRows = peggingItems.map((row) => [
      row.customerCode || "-", reportDateTime(row.targetDeliveryDate), row.fgPartCode || "-", reportText(row.sourceType, row.sourceNumber),
      row.materialOrComponent || "-", reportDateTime(row.requiredDate), reportNumber(row.requirementQty), reportNumber(row.supplyCoverageQty),
      reportNumber(Math.max(number(row.requirementQty) - number(row.supplyCoverageQty), 0)), row.uomCode || "-", row.risk || "-",
    ]);
    const byUom = new Map();
    procurementItems.forEach((row) => byUom.set(String(row.uomCode || "UNIT").toUpperCase(), number(byUom.get(String(row.uomCode || "UNIT").toUpperCase())) + number(row.suggestedOrderQty)));
    const buySummary = [...byUom.entries()].map(([uom, value]) => `${reportNumber(value)} ${uom}`).join(" | ") || "0";
    const identities = procurementItems.map((row) => procurementPresentationIdentity(row));
    const supplierCount = new Set(identities.map((identity) => identity.supplierCode).filter(Boolean)).size;
    const bucketCount = new Set(procurementItems.map((row) => halfMonthBucket(row.supplierRequiredArrivalDate || row.materialRequiredDate || row.exactRequiredDate).key)).size;
    const expediteCount = procurementItems.filter((row) => String(row.risk || "").toUpperCase().includes("EXPEDITE")).length;
    const atRiskCount = procurementItems.filter((row) => !["", "SAFE", "COVERED", "ON_TIME"].includes(String(row.risk || "").toUpperCase())).length;
    const noSupplierCount = identities.filter((identity) => !identity.supplierCode).length;
    const sourceMps = doc.scenarioAssumptions?.sourceMpsNumbers || [doc.mpsNumber].filter(Boolean);
    const managementMatrix = buildMrpManagementMatrix(doc);
    const fgMatrixHeaders = ["Customer", "FG", "Target Delivery", "Demand", "FG Stock @ MRP", "FG Net Production", "WIP Position", "Material Shortage", "Status"];
    const fgMatrixRows = managementMatrix.fgRows.map((row) => [row.customerCode, reportText(row.partCode, row.partNumber, row.partName), reportDateTime(row.targetDeliveryDate), `${reportNumber(row.demandQty)} ${row.uomCode}`, `${reportNumber(row.onHandQty)} ${row.uomCode}`, `${reportNumber(row.netQty)} ${row.uomCode}`, row.wipSummary, row.materialShortageSummary, row.status]);
    const materialMatrixHeaders = ["Material / Part", "Need", "Stock @ MRP", "Firm Supply", "Shortage", "Planned Buy", "PR", "PO Ordered", "PO Received", "PO Outstanding", "UOM", "Status"];
    const materialMatrixRows = managementMatrix.materialRows.map((row) => [reportText(row.partCode, row.partNumber, row.partName), reportNumber(row.grossQty), reportNumber(row.onHandQty), reportNumber(row.firmSupplyQty), reportNumber(row.netQty), reportNumber(row.plannedBuyQty), row.prNumbers, reportNumber(row.poOrderedQty), reportNumber(row.poReceivedQty), reportNumber(row.poOutstandingQty), row.uomCode, row.status]);
    return {
      title: `MRP Management Report - ${doc.runNumber}`,
      subtitle: `Purchase due-date plan | Source ${sourceMps.join(" + ") || "-"} | Snapshot ${reportDateTime(doc.planningSnapshotAt || doc.runDate)}`,
      fileName: `mrp-management-${doc.runNumber}`,
      documentLabel: "RENBO ERP - MRP MANAGEMENT REPORT",
      pageSize: "A3", keepColumnsTogether: true, bodyFontSize: 6.6,
      headers: ["Purchase Bucket", "Material / Part", "Supplier", "Customer Delivery", "Production Start", "Material Ready", "Supplier Arrival", "Latest PR / PO", "Need", "Suggested Buy", "UOM", "Risk"],
      rows: procurementRows,
      summary: [
        { label: "Purchase Lines", value: String(procurementItems.length) }, { label: "Suggested Buy", value: buySummary },
        { label: "Suppliers", value: String(supplierCount) }, { label: "Arrival Buckets", value: String(bucketCount) },
        { label: "Expedite", value: String(expediteCount) }, { label: "At Risk", value: String(atRiskCount) },
        { label: "Supplier Missing", value: String(noSupplierCount) }, { label: "Customer Pegging", value: String(peggingItems.length) },
      ],
      columnWidths: [0.8, 1.65, 1.05, 0.95, 0.95, 0.95, 0.95, 1.35, 0.65, 0.75, 0.45, 0.7],
      alignments: ["center", "left", "left", "center", "center", "center", "center", "left", "right", "right", "center", "center"],
      sections: [{
        title: `MRP Coverage Matrix - ${doc.runNumber}`,
        subtitle: "Demand FG, posisi WIP, shortage material, serta progress PR/PO dalam satu snapshot",
        headers: fgMatrixHeaders,
        rows: fgMatrixRows,
        keepColumnsTogether: true,
      }, {
        title: `Material & PO Matrix - ${doc.runNumber}`,
        subtitle: "PO Ordered/Received/Outstanding tidak dihitung sebagai stock sampai Goods Receipt dan Quality Release",
        headers: materialMatrixHeaders,
        rows: materialMatrixRows,
        keepColumnsTogether: true,
      }, ...(peggingRows.length ? [{
        title: `Customer Pegging - ${doc.runNumber}`,
        subtitle: "Demand tetap traceable walaupun netting material dikonsolidasikan lintas customer",
        headers: ["Customer", "Target Delivery", "Finished Good", "Demand Source", "Material / Component", "Required Date", "Requirement", "Supply Coverage", "Shortage", "UOM", "Risk"],
        rows: peggingRows,
        keepColumnsTogether: true,
        columnWidths: [0.7, 1, 0.9, 1.25, 1.4, 1, 0.7, 0.75, 0.7, 0.45, 0.65],
        alignments: ["left", "center", "left", "left", "left", "center", "right", "right", "right", "center", "center"],
      }] : [])],
      sheets: [
        { name: "FG-WIP Coverage", title: `MRP Coverage Matrix ${doc.runNumber}`, subtitle: "Demand, FG stock, WIP dan shortage", headers: fgMatrixHeaders, rows: fgMatrixRows },
        { name: "Material-PO Coverage", title: `Material & PO Matrix ${doc.runNumber}`, subtitle: "Need, stock, planned buy, PR dan realisasi PO", headers: materialMatrixHeaders, rows: materialMatrixRows },
        { name: "Procurement Schedule", title: `Procurement Schedule ${doc.runNumber}`, subtitle: "Backward purchase schedule", headers: ["Purchase Bucket", "Material / Part", "Supplier", "Customer Delivery", "Production Start", "Material Ready", "Supplier Arrival", "Latest PR / PO", "Need", "Suggested Buy", "UOM", "Risk"], rows: procurementRows },
        { name: "Customer Pegging", title: `Customer Pegging ${doc.runNumber}`, subtitle: "Trace demand customer", headers: ["Customer", "Target Delivery", "Finished Good", "Demand Source", "Material / Component", "Required Date", "Requirement", "Supply Coverage", "Shortage", "UOM", "Risk"], rows: peggingRows },
      ],
    };
  }
  function headerActions(doc) {
    const back = `<a class="btn btn-outline-secondary" href="/modules/planning-ppic/${tab}">← Kembali</a>`;
    let action = "";
    if (tab === "consume-forecast" && doc.viewType === "MONTHLY_CONSUMPTION") {
      action += '<a class="btn btn-outline-secondary" href="/modules/sales/forecasts/new">Buat Forecast</a>';
      if (doc.mpsNumber) action += `<a class="btn btn-outline-primary" href="/modules/planning-ppic/mps/${encodeURIComponent(doc.mpsNumber)}">Buka MPS</a>`;
      if (doc.mrpRunNumber) action += `<a class="btn btn-primary ppic-action-primary" href="/modules/planning-ppic/mrp/${encodeURIComponent(doc.mrpRunNumber)}">Buka MRP</a>`;
      $("ppic-detail-actions").innerHTML = back + action;
      $("ppic-workflow-actions").innerHTML = action;
      return;
    }
    if (tab === "consume-forecast") action += `<a class="btn btn-outline-secondary" href="/modules/sales/forecasts/${encodeURIComponent(key)}/edit">Edit Data</a>`;
    if (tab === "mrp") action += `<button class="btn btn-outline-success" data-action="export-mrp-management-xlsx">Excel Management</button><button class="btn btn-outline-danger" data-action="export-mrp-management-pdf">PDF Management</button>`;
    if (tab === "mps") action += `<button class="btn btn-outline-success" data-action="export-mps-management-xlsx">Excel Management</button><button class="btn btn-outline-danger" data-action="export-mps-management-pdf">PDF Management</button>`;
    if (tab === "mrp" && doc.status === "Completed" && doc.scenarioStatus !== "SIMULATION") action += doc.purchaseSuggestion?.suggestionNumber
      ? `<a class="btn btn-outline-primary" href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(doc.purchaseSuggestion.suggestionNumber)}">Review Purchase Suggestion</a><button class="btn btn-primary ppic-action-primary" data-action="make-mrp-production-plan">Buat Production Planning</button>`
      : `<button class="btn btn-outline-primary" data-action="make-purchase-suggestion">Buat Purchase Suggestion</button><button class="btn btn-primary ppic-action-primary" data-action="make-mrp-production-plan">Buat Production Planning</button>`;
    const cycleLocked = doc.planningCycle?.status === "LOCKED";
    if (tab === "mps" && !cycleLocked) action += `<button class="btn btn-primary ppic-action-primary" data-action="confirm-mps">Review & Lock Planning Cycle</button>`;
    if (tab === "mps" && cycleLocked) action += `<button class="btn btn-outline-secondary" data-action="run-mrp-simulation">Simulasi MRP Cycle</button><button class="btn btn-outline-primary" data-action="run-mrp">Run MRP Cycle</button><button class="btn btn-primary ppic-action-primary" data-action="make-production-plan">Buat Production Plan</button>`;
    if (tab === "consume-forecast" && ["Confirmed", "Partial Product"].includes(doc.status) && (doc.consumption?.remainingMonths || []).length) action += `<button class="btn btn-primary ppic-action-primary" data-action="make-mps">Buat MPS ${(doc.consumption.remainingMonths || []).join(", ")}</button>`;
    if (tab === "consume-forecast" && ["Partial Product", "Consumed"].includes(doc.status)) action += `<button class="btn btn-outline-warning" data-action="close-forecast">Close Forecast</button>`;
    if (tab === "monthly-plan" && doc.status === "Draft") action += `<button class="btn btn-primary ppic-action-primary" data-action="confirm-production-plan">Confirm Plan</button>`;
    if (tab === "monthly-plan" && doc.status === "Confirmed") action += `<a class="btn btn-outline-primary" href="/modules/planning-ppic/capacity-planning?planNumber=${encodeURIComponent(doc.planNumber)}">Lihat Capacity</a><button class="btn btn-primary ppic-action-primary" data-action="release-production-plan">Capacity Check & Release</button>`;
    if (tab === "monthly-plan" && ["Released", "In Progress"].includes(doc.status) && (doc.details || []).some((row) => number(row.qtyPlanned) > number(row.qtyReleased))) action += `<button class="btn btn-outline-primary" data-action="release-plan-to-mo">Buat MO Reference</button>`;
    if (tab === "monthly-plan" && ["Released", "In Progress"].includes(doc.status) && (doc.manufacturingOrders || []).length) action += `<button class="btn btn-primary ppic-action-primary" data-action="convert-daily-plans">Publish Allocation ke Daily Plan</button>`;
    $("ppic-detail-actions").innerHTML = back + action;
    $("ppic-workflow-actions").innerHTML = action;
  }
  function normalizeAllocations(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Array.isArray(value.items) ? value.items : [];
    if (typeof value === "string" && value.trim()) {
      try { return normalizeAllocations(JSON.parse(value)); } catch { return []; }
    }
    return [];
  }
  function supplierOptions(selectedCode) {
    const selected = String(selectedCode || "");
    const options = supplierCatalog.map((supplier) => {
      const code = supplier.supplierCode || supplier.code || supplier.id;
      const label = [code, supplier.supplierName || supplier.name].filter(Boolean).join(" - ");
      return `<option value="${esc(code)}" ${String(code) === selected ? "selected" : ""}>${esc(label)}</option>`;
    });
    if (selected && !supplierCatalog.some((supplier) => String(supplier.supplierCode || supplier.code || supplier.id) === selected)) options.unshift(`<option value="${esc(selected)}" selected>${esc(selected)} (tersimpan)</option>`);
    return `<option value="">Pilih supplier</option>${options.join("")}`;
  }
  function supplierDisplayName(supplierCode, suppliedName) {
    if (suppliedName) return suppliedName;
    const supplier = supplierCatalog.find((item) => String(item.supplierCode || item.code || item.id) === String(supplierCode || ""));
    return supplier?.supplierName || supplier?.name || (supplierCode ? "Nama supplier belum ditemukan" : "Supplier belum dipilih");
  }
  function partMasterData(partCode) {
    return partCatalog.find((item) => String(item.partCode || item.code || item.id) === String(partCode || "")) || null;
  }
  function preferredSupplierItem(partCode) {
    return supplierItemCatalog.find((item) => String(item.part?.partCode || item.partCode || "") === String(partCode || "")) || null;
  }
  function procurementPresentationIdentity(item = {}) {
    const partMaster = partMasterData(item.partCode || item.materialCode);
    const supplierItem = preferredSupplierItem(item.partCode || partMaster?.partCode);
    const isRawMaterial = item.isRawMaterial || (partMaster?.itemType === "RAW" && partMaster?.rawType === "MATERIAL");
    const supplierCode = item.supplierCode || supplierItem?.supplier?.supplierCode || null;
    return {
      materialCode: isRawMaterial ? (partMaster?.material?.materialCode || item.materialCode || item.partCode) : (item.materialCode || item.partCode),
      materialName: item.materialName || partMaster?.material?.materialName || partMaster?.material?.spec || null,
      partNumber: item.partNumber || partMaster?.partNumber || null,
      partName: item.partName || partMaster?.partName || null,
      supplierCode,
      supplierName: supplierDisplayName(supplierCode, item.supplierName || supplierItem?.supplier?.supplierName),
      supplierSource: item.supplierSource || (supplierItem ? "SUPPLIER_ITEM_PREFERRED" : null),
      isRawMaterial,
    };
  }
  function allocationCandidates(order, requirements) {
    const saved = normalizeAllocations(order.lotAllocations ?? order.materialAllocations ?? order.allocations ?? order.allocation);
    const orderRequirement = requirements.find((row) => String(row.partCode || "") === String(order.partCode || ""));
    const materialCode = order.part?.material?.materialCode || orderRequirement?.part?.material?.materialCode || "";
    const matching = requirements.filter((row) => materialCode
      ? row.part?.rawType === "MATERIAL" && String(row.part?.material?.materialCode || "") === String(materialCode)
      : String(row.partCode || "") === String(order.partCode || ""));
    const candidates = new Map();
    matching.forEach((row, index) => {
      const sourceNumber = row.sourceNumber || row.planningSourceNumber || row.mpsDetailId || `${order.orderNumber}-${index + 1}`;
      const fgPartCode = row.planningPartCode || row.parentPartCode || row.rootPartCode || "";
      const candidateKey = `${sourceNumber}|${fgPartCode}`;
      if (!candidates.has(candidateKey)) candidates.set(candidateKey, { partCode: row.partCode, fgPartCode, sourceType: row.sourceType || "MRP", sourceNumber, qty: 0, label: [fgPartCode, row.planningPartName, row.planningCustomerCode, month(row.planningMonth || row.requiredDate)].filter(Boolean).join(" · ") });
      const candidate = candidates.get(candidateKey);
      candidate.qty += number(row.plannedOrderQtyKg ?? row.adjustedOrderQty ?? row.plannedOrderQty ?? row.netRequirement);
    });
    saved.forEach((allocation, index) => {
      const candidateKey = `${allocation.sourceNumber || `saved-${index}`}|${allocation.fgPartCode || ""}`;
      const existing = candidates.get(candidateKey) || {};
      candidates.set(candidateKey, { ...existing, ...allocation, partCode: allocation.partCode || order.partCode, qty: number(allocation.qty ?? allocation.qtyKg), saved: true, label: existing.label || [allocation.fgPartCode, allocation.sourceNumber].filter(Boolean).join(" · ") || `Alokasi ${index + 1}` });
    });
    return [...candidates.values()].map((candidate, index) => ({ ...candidate, enabled: candidate.saved || (saved.length === 0 && candidates.size === 1) || (saved.length === 0 && String(candidate.sourceNumber || "") === String(order.referenceNumber || "")), index }));
  }
  function renderProcurementSetup(doc, requirements) {
    const card = $("ppic-procurement-card");
    const body = $("ppic-procurement-rows");
    if (!card || !body) return;
    if (tab !== "mrp") { card.classList.add("d-none"); return; }
    card.classList.remove("d-none");
    const orders = (Array.isArray(doc.plannedOrders) ? doc.plannedOrders : []).filter((row) => String(row.orderType || "Purchase").toLowerCase() === "purchase" && !["Cancelled", "Superseded"].includes(row.status));
    body.innerHTML = orders.map((order) => {
      const related = requirements.filter((row) => String(row.partCode || "") === String(order.partCode || ""));
      const material = related.find((row) => row.part?.material)?.part?.material || order.part?.material || null;
      const rawMaterial = related.some((row) => row.part?.itemType === "RAW" && row.part?.rawType === "MATERIAL")
        || (order.part?.itemType === "RAW" && order.part?.rawType === "MATERIAL");
      const remainingQty = Math.max(number(order.qty) - number(order.qtyReleased), 0);
      const identityCode = rawMaterial ? (material?.materialCode || order.partCode) : order.partCode;
      const identityName = rawMaterial ? (material?.materialName || material?.spec || order.partName || order.part?.partName) : (order.partName || order.part?.partName);
      const locked = !["Planned", "Draft", "Partially Released"].includes(order.status || "Planned") || remainingQty <= 0;
      const pr = order.purchaseRequest;
      const requestUom = rawMaterial ? "KG" : (order.uomCode || "-");
      const referencePcs = order.qtyPcs != null ? `<small class="ppic-cell-sub">Ref kebutuhan: ${num(order.qtyPcs)} PCS</small>` : "";
      return `<tr class="ppic-procurement-row" data-procurement-row data-order-number="${esc(order.orderNumber)}" data-raw-material="${rawMaterial ? "true" : "false"}" data-procurement-locked="${locked ? "true" : "false"}"><td><input type="checkbox" data-procurement-selected ${locked ? "disabled" : "checked"} aria-label="Pilih ${esc(order.orderNumber)}"></td><td><b>${esc(order.orderNumber)}</b><small class="ppic-cell-sub">${badge(order.status || "Planned")}</small></td><td><b>${esc(identityCode)}</b><small class="ppic-cell-sub">${esc(identityName || "-")}${rawMaterial && identityCode !== order.partCode ? ` · source ${esc(order.partCode)}` : ""}</small><span class="ppic-procurement-kind ${rawMaterial ? "material" : "part"}">${rawMaterial ? "Raw Material" : `Purchase Part · drawing ${esc(order.part?.partNumber || "-")}`}</span></td><td class="ppic-number"><b>${num(order.qty, 3)}</b>${referencePcs}<small class="ppic-cell-sub">Released ${num(order.qtyReleased, 3)} · Sisa ${num(remainingQty, 3)} ${esc(requestUom)}</small></td><td><input data-procurement-release-qty type="number" min="0.001" max="${esc(remainingQty)}" step="0.001" value="${esc(remainingQty)}" ${locked ? "disabled" : ""}><small class="ppic-cell-sub">Boleh request partial</small></td><td><b>${esc(requestUom)}</b><small class="ppic-cell-sub">${rawMaterial ? "Wajib KG dari PPIC" : "Sesuai kebutuhan part"}</small></td><td><span class="ppic-pr-pending">Supplier & bentuk beli di PR/PO</span></td><td>${pr?.prNumber ? `<a class="ppic-pr-crosscheck" href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(pr.prNumber)}"><b>${esc(pr.prNumber)}</b><small>${esc(pr.status || "-")} · lihat PR</small></a>` : `<span class="ppic-pr-pending">Belum dibuat</span>`}</td></tr>`;
    }).join("") || `<tr><td colspan="8" class="ppic-empty">Belum ada Planned Order pembelian pada MRP ini.</td></tr>`;
    const suggestion = doc.purchaseSuggestion;
    if (suggestion?.suggestionNumber) {
      body.querySelectorAll("[data-procurement-row] td:last-child").forEach((cell) => {
        cell.innerHTML = `<a class="ppic-pr-crosscheck" href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(suggestion.suggestionNumber)}"><b>${esc(suggestion.suggestionNumber)}</b><small>${esc(suggestion.status || "-")} · buka suggestion</small></a>`;
      });
    } else {
      body.querySelectorAll("[data-procurement-row] td:last-child").forEach((cell) => { cell.innerHTML = '<span class="ppic-pr-pending">Belum dibuat</span>'; });
    }
    const linked = suggestion?.suggestionNumber ? orders.length : 0;
    const materialOrders = orders.filter((order) => requirements.some((row) => String(row.partCode) === String(order.partCode) && row.part?.rawType === "MATERIAL")).length;
    $("ppic-procurement-summary").innerHTML = `<span><b>${num(orders.length)}</b> planned order</span><span><b>${num(materialOrders)}</b> raw material</span><span><b>${num(orders.length - materialOrders)}</b> purchase part</span><span><b>${num(linked)}</b> masuk suggestion</span><p>MRP berhenti di Purchase Suggestion. PR baru dibuat Purchasing setelah konfirmasi supplier selesai.</p>`;
  }
  function collectProcurementOrders(onlySelected = false) {
    return [...document.querySelectorAll("[data-procurement-row]")]
      .filter((row) => row.dataset.procurementLocked !== "true" && (!onlySelected || row.querySelector("[data-procurement-selected]")?.checked))
      .map((row) => ({ orderNumber: row.dataset.orderNumber, releaseQty: number(row.querySelector("[data-procurement-release-qty]")?.value) }));
  }
  function plannerTabs(items, active) {
    return items.map(([keyName, label]) => `<button type="button" class="${active === keyName ? "active" : ""}" data-planner-view="${keyName}">${label}</button>`).join("");
  }
  function openPlannerBucket(storeId) {
    const detail = plannerBucketStore.get(storeId); if (!detail) return;
    const drawer = $("ppic-bucket-drawer"); drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    $("ppic-bucket-title").textContent = `${detail.materialCode || detail.partCode || "Demand"} · ${detail.bucketLabel}`;
    $("ppic-bucket-meta").textContent = detail.kind === "MPS" ? "Target Delivery dan FG finish pada bucket ini" : "Tanggal kedatangan supplier menentukan bucket; exact date tetap menjadi source of truth";
    if (detail.kind === "MPS") {
      $("ppic-bucket-body").innerHTML = `<div class="bucket-summary"><div><small>Forecast</small><b>${qty(detail.forecastQty,detail.uomCode)}</b></div><div><small>Actual SO</small><b>${qty(detail.actualSalesOrderQty,detail.uomCode)}</b></div><div><small>Target MPS</small><b>${qty(detail.qtyPlanned,detail.uomCode)}</b></div></div>${detail.lines.map((line) => `<article class="bucket-detail-line"><header><div><b>${esc(line.sourceNumber || line.partCode)}</b><span>${esc(line.customerCode || "-")} · ${qty(line.qty,line.uomCode)} ${esc(line.uomCode || "")}</span></div>${badge(line.priorityClass || line.status || "Planned")}</header><div class="bucket-date-chain"><div><small>Customer Delivery</small><b>${date(line.targetDeliveryDate)}</b></div><div><small>FG Wajib Selesai</small><b>${date(line.fgRequiredDate)}</b></div><div><small>Target MPS</small><b>${qty(line.qty,line.uomCode)}</b></div></div></article>`).join("")}`;
      return;
    }
    const lines = detail.lines || [];
    $("ppic-bucket-body").innerHTML = `<div class="bucket-summary"><div><small>Gross Need</small><b>${num(detail.needQty)}</b></div><div><small>Suggested Buy</small><b>${num(detail.buyQty)}</b></div><div><small>Projected after Buy</small><b>${num(detail.projectedAfterBuy)}</b></div></div>${lines.map((line) => {
      const pegging = Array.isArray(line.pegging) ? line.pegging : [];
      const identity = procurementPresentationIdentity(line);
      return `<article class="bucket-detail-line"><header><div><b>${esc(identity.materialCode || detail.materialCode)}</b>${identity.materialCode !== line.partCode ? `<span>Source Part ${esc(line.partCode || "-")}</span>` : ""}<span>Part No. ${esc(identity.partNumber || "belum diisi")}${identity.partName ? ` · ${esc(identity.partName)}` : ""}</span><span title="Kode supplier: ${esc(identity.supplierCode || "-")}">${esc(identity.supplierName)}</span></div><div><strong>${qty(line.suggestedOrderQty,line.uomCode)} ${esc(line.uomCode || "")}</strong>${badge(line.risk)}</div></header><div class="bucket-date-chain"><div><small>Delivery Customer</small><b>${date(line.customerDeliveryDate)}</b></div><div><small>Mulai Produksi</small><b>${date(line.productionStartDate)}</b></div><div><small>Material Wajib Ada</small><b>${date(line.materialRequiredDate)}</b></div><div><small>Supplier Harus Datang</small><b>${date(line.supplierRequiredArrivalDate)}</b></div><div><small>PO Maksimal</small><b>${date(line.latestPoDate)}</b></div><div><small>PR Maksimal</small><b>${date(line.latestPrDate)}</b></div></div><div class="bucket-pegging">${pegging.length ? pegging.map((peg) => `<span><b>${esc(peg.customerCode || peg.sourceNumber || "Demand")}</b><em>${esc(peg.fgPartCode || "FG")} · ${date(peg.targetDeliveryDate)} · ${qty(peg.qty,peg.uomCode||line.uomCode)}</em></span>`).join("") : `<span><b>Demand source</b><em>${date(line.customerDeliveryDate)} · ${qty(line.requirementQty,line.uomCode)}</em></span>`}</div></article>`;
    }).join("")}`;
  }
  function closePlannerBucket() { const drawer = $("ppic-bucket-drawer"); drawer?.classList.remove("open"); drawer?.setAttribute("aria-hidden", "true"); }
  function renderMpsPlanner(doc, view = activePlannerView) {
    activePlannerView = view;
    const card = $("ppic-planner-matrix-card"); if (!card) return; card.classList.remove("d-none");
    $("ppic-planner-eyebrow").textContent = "MPS PLANNER VIEW"; $("ppic-planner-title").textContent = "MPS Demand Matrix"; $("ppic-planner-description").textContent = "Demand dibaca per Target Delivery. BOM dan proses disediakan sebagai detail, bukan sebagai tampilan awal.";
    $("ppic-planner-tabs").innerHTML = plannerTabs([["matrix", "Demand Matrix"], ["delivery", "Delivery Phase"], ["process", "BOM & Process"], ["feasibility", "Feasibility"]], view);
    $("ppic-planner-toolbar").innerHTML = view === "matrix" ? '<span class="planner-legend"><span class="buy">Target MPS</span><span class="safe">Delivery terlindungi</span><span class="short">Perlu review</span></span>' : "";
    const technical = $("ppic-technical-detail-card"); technical?.classList.toggle("d-none", view !== "process");
    if (view === "process") { $("ppic-planner-content").innerHTML = '<div class="planner-empty">Tabel BOM dan proses ditampilkan di bawah. Gunakan view ini hanya saat menelusuri routing atau child/SFG.</div>'; $("ppic-planner-footer").textContent = "MPS utama tetap demand/FG; child process adalah hasil turunan."; return; }
    const generated = (row) => String(row.notes || "").startsWith("[MRP-PRODUCTION]");
    const cycleDocuments = doc.planningCycle?.documents?.length ? doc.planningCycle.documents : [doc];
    const receipts = cycleDocuments.flatMap((document) => (document.details || [])
      .filter((row) => !generated(row))
      .map((row) => ({ ...row, _sourceMpsNumber: document.mpsNumber })));
    const phases = cycleDocuments.flatMap((document) => (document.deliveryPlans || []))
      .filter((row) => String(row.targetType || "").toUpperCase() === "CUSTOMER" && row.status !== "Cancelled");
    if (view === "delivery") {
      $("ppic-planner-content").innerHTML = `<div class="planner-grid-scroll"><table class="mps-demand-matrix-table"><thead><tr><th>Phase</th><th>Customer</th><th>FG</th><th>Target Delivery</th><th>FG Wajib Selesai</th><th>Qty</th><th>Source</th><th>Status</th></tr></thead><tbody>${phases.map((phase) => `<tr><td><b>#${num(phase.phaseNumber)}</b></td><td>${esc(phase.targetCode)}</td><td>${esc(phase.partCode)}<small class="d-block text-muted">Part Number: ${esc(phase.partNumber || receipts.find((receipt) => receipt.partCode === phase.partCode)?.part?.partNumber || "—")}</small></td><td>${date(phase.plannedDate)}</td><td>${date(phase.fgRequiredDate)}</td><td class="ppic-number">${num(phase.qtyPlanned)}</td><td>${esc(phase.sourceNumber || "-")}</td><td>${badge(phase.status)}</td></tr>`).join("") || '<tr><td colspan="8" class="ppic-empty">Belum ada delivery phase.</td></tr>'}</tbody></table></div>`;
      $("ppic-planner-footer").textContent = `${phases.length} delivery phase; target Marketing tidak diubah oleh PPIC.`; return;
    }
    if (view === "feasibility") {
      const readiness = doc.readiness || {}; const issues = readiness.issues || [];
      $("ppic-planner-content").innerHTML = `<div class="bucket-summary"><div><small>Status</small><b>${readiness.ok ? "READY" : "BLOCKED"}</b></div><div><small>Blocking</small><b>${num(readiness.blockingCount)}</b></div><div><small>Warning</small><b>${num(readiness.warningCount)}</b></div></div><div class="ppic-readiness-items">${issues.map((issue) => `<article class="${String(issue.severity).toLowerCase()}"><span class="ppic-readiness-severity">${esc(issue.severity)}</span><div><b>${esc(issue.code)}</b><p>${esc(issue.message)}</p></div></article>`).join("") || '<div class="planner-empty">Tidak ada blocker aktif.</div>'}</div>`;
      $("ppic-planner-footer").textContent = "Review & Lock hanya mengunci demand setelah readiness diperiksa."; return;
    }
    plannerBucketStore.clear();
    const bucketMap = new Map(); const rowMap = new Map();
    for (const receipt of receipts) {
      const receiptPhases = phases.filter((phase) => phase.mpsDetailId === receipt.id);
      const sources = Array.isArray(receipt.demandSources) ? receipt.demandSources : [];
      const customerPhaseQty = receiptPhases.reduce((sum, phase) => sum + number(phase.qtyPlanned), 0);
      const bufferReceiptQty = Math.max(number(receipt.qtyPlanned) - customerPhaseQty, 0);
      const effectivePhases = receiptPhases.length
        ? [...receiptPhases, ...(bufferReceiptQty > 0.000001 ? [{ id: `buffer-${receipt.id}`, plannedDate: receipt.endDate, fgRequiredDate: receipt.endDate, qtyPlanned: bufferReceiptQty, targetCode: receipt.customerCode, sourceNumber: "BUFFER_STOCK", _bufferOnly: true }] : [])]
        : [{ id: `receipt-${receipt.id}`, plannedDate: receipt.customerTargetDate || receipt.endDate, fgRequiredDate: receipt.fgRequiredDate, qtyPlanned: receipt.qtyPlanned, targetCode: receipt.customerCode, sourceNumber: receipt.forecastDetail?.forecastNumber || doc.forecastNumber }];
      const rowKey = `${receipt.customerCode || "Tanpa Customer"}|${receipt.partCode}`; const row = rowMap.get(rowKey) || { customerCode: receipt.customerCode || "Tanpa Customer", partCode: receipt.partCode, partNumber:receipt.part?.partNumber || null, partName: receipt.part?.partName || receipt.part?.partNumber || "-", cells: new Map(), total: 0 };
      for (const phase of effectivePhases) {
        const bucket = halfMonthBucket(phase.plannedDate); bucketMap.set(bucket.key, bucket);
        const share = number(receipt.qtyPlanned) > 0 ? number(phase.qtyPlanned) / number(receipt.qtyPlanned) : 1;
        const cell = row.cells.get(bucket.key) || { forecastQty: 0, actualSalesOrderQty: 0, bufferQty: 0, qtyPlanned: 0, lines: [] };
        cell.forecastQty += number(receipt.forecastQty) * share; cell.actualSalesOrderQty += number(receipt.actualSalesOrderQty) * share; cell.bufferQty += number(receipt.bufferQty) * share; cell.qtyPlanned += number(phase.qtyPlanned);
        const sourceLines = sources.filter((source) => !source.deliveryTargetId || source.deliveryTargetId === phase.sourceDeliveryTargetId);
        cell.lines.push(...(sourceLines.length ? sourceLines.map((source) => ({ ...source, qty: number(source.qty) || number(phase.qtyPlanned), targetDeliveryDate: source.targetDeliveryDate || phase.plannedDate, fgRequiredDate: source.fgRequiredDate || phase.fgRequiredDate, partCode: receipt.partCode, customerCode: source.customerCode || receipt.customerCode })) : [{ sourceNumber: phase.sourceNumber || doc.forecastNumber, qty: phase.qtyPlanned, targetDeliveryDate: phase.plannedDate, fgRequiredDate: phase.fgRequiredDate, partCode: receipt.partCode, customerCode: phase.targetCode || receipt.customerCode, status: phase.status }]));
        row.cells.set(bucket.key, cell); row.total += number(phase.qtyPlanned);
      }
      rowMap.set(rowKey, row);
    }
    const buckets = [...bucketMap.values()].sort((a, b) => a.sort.localeCompare(b.sort));
    const rowsHtml = [...rowMap.values()].sort((a, b) => `${a.customerCode}|${a.partCode}`.localeCompare(`${b.customerCode}|${b.partCode}`)).map((row) => `<tr><td class="identity"><b>${esc(row.customerCode)}</b></td><td class="part"><b>${esc(row.partCode)}</b><small class="d-block text-muted">Part Number: ${esc(row.partNumber || "—")}</small><small class="d-block text-muted">${esc(row.partName)}</small></td>${buckets.map((bucket) => { const cell = row.cells.get(bucket.key); if (!cell) return "<td>-</td>"; const storeId = `mps-${plannerBucketStore.size}`; plannerBucketStore.set(storeId, { kind: "MPS", partCode: row.partCode, bucketLabel: bucket.label, ...cell }); return `<td><button type="button" class="mps-matrix-cell" data-open-planner-bucket="${storeId}"><span class="forecast"><em>Forecast</em><b>${num(cell.forecastQty)}</b></span><span class="so"><em>Actual SO</em><b>${num(cell.actualSalesOrderQty)}</b></span><span class="buffer"><em>Buffer</em><b>${num(cell.bufferQty)}</b></span><span class="target"><em>Target MPS</em><b>${num(cell.qtyPlanned)}</b></span><small>Klik untuk exact delivery</small></button></td>`; }).join("")}<td class="ppic-number"><b>${num(row.total)}</b></td></tr>`).join("");
    $("ppic-planner-content").innerHTML = `<div class="mps-demand-matrix-scroll"><table class="mps-demand-matrix-table"><thead><tr><th class="identity">Customer</th><th class="part">Finished Good</th>${buckets.map((bucket) => `<th>${esc(bucket.label)}<small class="d-block text-muted">Customer Delivery</small></th>`).join("")}<th>Total MPS</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="${buckets.length + 3}" class="ppic-empty">Belum ada demand receipt.</td></tr>`}</tbody></table></div>`;
    $("ppic-planner-footer").textContent = `${cycleDocuments.length} bulan dalam satu planning cycle · ${rowMap.size} customer/FG · ${buckets.length} bucket delivery. Angka ditampilkan 2 digit; exact date tersedia saat cell diklik.`;
  }

  let mrpPresentation = { procurement: null, pegging: null, active: "procurement" };
  function renderMrpPresentationContent() {
    const content = $("ppic-mrp-view-content"), data = mrpPresentation[mrpPresentation.active];
    if (!content) return;
    if (!data) { content.innerHTML = `<p class="ppic-empty">Memuat ${mrpPresentation.active === "procurement" ? "Procurement View" : "Customer Pegging"}…</p>`; return; }
    const procurement = mrpPresentation.active === "procurement";
    const heads = procurement ? ["Material / Supplier","Delivery Customer","Mulai Produksi","Material Wajib Tersedia","Supplier Harus Datang","Batas Pembelian","Qty","Risk"] : ["Customer","Target Delivery","FG","Demand Source","Material / Component","Required Date","Requirement","Supply Coverage","Risk"];
    const items = data.items || [];
    let previousArrivalMonth = null;
    const rows = items.map((row) => {
      if (!procurement) return `<tr><td><b>${esc(row.customerCode || "-")}</b></td><td>${date(row.targetDeliveryDate)}</td><td>${esc(row.fgPartCode || "-")}<small class="d-block text-muted">Part Number: ${esc(row.fgPartNumber || partMasterData(row.fgPartCode)?.partNumber || "—")}</small></td><td><b>${esc(row.sourceNumber || "-")}</b><small>${esc(row.sourceType || "-")}</small></td><td>${esc(row.materialOrComponent)}<small class="d-block text-muted">Part Number: ${esc(row.partNumber || partMasterData(row.materialOrComponent)?.partNumber || "—")}</small></td><td>${date(row.requiredDate)}</td><td class="ppic-number">${num(row.requirementQty,2)}</td><td class="ppic-number">${num(row.supplyCoverageQty,2)}</td><td>${badge(row.risk)}</td></tr>`;
      const arrival = row.supplierRequiredArrivalDate || row.materialRequiredDate || row.exactRequiredDate;
      const parsedArrival = new Date(arrival);
      const arrivalMonth = Number.isNaN(parsedArrival.getTime()) ? "tanpa-tanggal" : `${parsedArrival.getFullYear()}-${String(parsedArrival.getMonth()+1).padStart(2,"0")}`;
      const arrivalLabel = Number.isNaN(parsedArrival.getTime()) ? "Tanggal kedatangan belum tersedia" : `Material datang ${parsedArrival.toLocaleDateString("id-ID",{month:"long",year:"numeric"})}`;
      const monthCount = items.filter((item) => { const value = new Date(item.supplierRequiredArrivalDate || item.materialRequiredDate || item.exactRequiredDate); return !Number.isNaN(value.getTime()) && `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}` === arrivalMonth; }).length;
      const monthHeader = arrivalMonth !== previousArrivalMonth ? `<tr class="ppic-procurement-month-row"><td colspan="${heads.length}"><b>${esc(arrivalLabel)}</b><span>${monthCount} kebutuhan</span></td></tr>` : "";
      previousArrivalMonth = arrivalMonth;
      const suggestionLink = row.purchaseSuggestionNumber ? `<a href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(row.purchaseSuggestionNumber)}">${esc(row.purchaseSuggestionNumber)}</a>` : "";
      return `${monthHeader}<tr class="ppic-procurement-timeline-row"><td><b>${esc(row.materialCode || row.partCode || "-")}</b><small>${esc(row.partCode && row.partCode !== row.materialCode ? `Part ${row.partCode} · ` : "")}${esc(row.supplierCode ? `Supplier ${row.supplierCode}` : "Supplier belum dipilih")}${suggestionLink ? ` · ${suggestionLink}` : ""}</small></td><td><b>${date(row.customerDeliveryDate)}</b><small>Target customer</small></td><td><b>${date(row.productionStartDate)}</b><small>${num(row.productionLeadTimeHours,2)} jam proses</small></td><td><b>${date(row.materialRequiredDate)}</b><small>Siap dipakai produksi</small></td><td><b>${date(row.supplierRequiredArrivalDate)}</b><small>${badge(row.requiredArrivalWindow)}</small></td><td><b>PR ${date(row.latestPrDate)}</b><small>PO maksimal ${date(row.latestPoDate)} · lead time ${num(row.supplierLeadTimeDays,2)} hari</small></td><td class="ppic-number"><b>Order ${num(row.suggestedOrderQty,2)}</b><small>Need ${num(row.requirementQty,2)} · Covered ${num(row.coveredQty,2)} · Short ${num(row.shortageQty,2)}</small></td><td>${badge(row.risk)}</td></tr>`;
    });
    content.innerHTML = `<table class="table ppic-detail-table ppic-excel-table"><thead><tr>${heads.map((head)=>`<th>${esc(head)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}" class="ppic-empty">Belum ada data.</td></tr>`}</tbody></table>`;
  }
  function uniqueSupplyQty(requirements, sectionName, fieldNames) {
    const unique = new Map();
    for (const row of requirements) {
      const section = row.supplyBreakdown?.[sectionName] || {};
      for (const line of section.lines || []) {
        const identity = line.stockBalanceId || line.id || line.poDetailId || line.poNumber || [line.sourcePartCode, line.warehouseCode, line.rackCode, line.lotNumber].join("|");
        if (unique.has(identity)) continue;
        const field = fieldNames.find((name) => line[name] != null); unique.set(identity, field ? number(line[field]) : 0);
      }
    }
    return [...unique.values()].reduce((sum, value) => sum + value, 0);
  }
  function renderMrpPlannerGrid(doc) {
    const procurement = mrpPresentation.procurement; const items = procurement?.items || [];
    if (!procurement) { $("ppic-planner-content").innerHTML = '<div class="planner-empty">Memuat Planner Grid…</div>'; return; }
    const requirements = (doc.requirements || []).filter((row) => String(row.orderType || "").toLowerCase() === "purchase");
    plannerBucketStore.clear();
    const bucketMap = new Map(); const groups = new Map();
    for (const item of items) {
      const bucket = halfMonthBucket(item.supplierRequiredArrivalDate || item.materialRequiredDate || item.exactRequiredDate); bucketMap.set(bucket.key, bucket);
      const identity = procurementPresentationIdentity(item);
      const materialCode = identity.materialCode || item.partCode || "Tanpa Material"; const groupKey = materialCode;
      const group = groups.get(groupKey) || { materialCode, partCodes: new Set(), partNumbers: new Set(), partNames: new Set(), supplierNames: new Set(), supplierCodes: new Set(), requirements: [], buckets: new Map(), needQty: 0, buyQty: 0 };
      if (item.partCode) group.partCodes.add(item.partCode);
      if (identity.partNumber) group.partNumbers.add(identity.partNumber);
      if (identity.partName) group.partNames.add(identity.partName);
      if (identity.supplierCode) group.supplierCodes.add(identity.supplierCode);
      group.supplierNames.add(identity.supplierName);
      group.needQty += number(item.requirementQty); group.buyQty += number(item.suggestedOrderQty);
      const bucketCell = group.buckets.get(bucket.key) || { lines: [], needQty: 0, buyQty: 0, coveredQty: 0, shortageQty: 0, risks: new Set() };
      bucketCell.lines.push({ ...item, ...identity }); bucketCell.needQty += number(item.requirementQty); bucketCell.buyQty += number(item.suggestedOrderQty); bucketCell.coveredQty += number(item.coveredQty); bucketCell.shortageQty += number(item.shortageQty); bucketCell.risks.add(item.risk || "-"); group.buckets.set(bucket.key, bucketCell); groups.set(groupKey, group);
    }
    for (const group of groups.values()) {
      group.requirements = requirements.filter((row) => group.partCodes.has(row.partCode) || row.part?.material?.materialCode === group.materialCode);
      group.warehouseQty = uniqueSupplyQty(group.requirements, "warehouseStock", ["planningSupplyQty", "qtyAvailable", "qtyOnHand"]);
      group.wipFgQty = uniqueSupplyQty(group.requirements, "wipStock", ["planningSupplyQty", "qtyOnHand"]);
      group.openPoQty = uniqueSupplyQty(group.requirements, "supplierOutstanding", ["planningSupplyQty", "outstandingQty", "qty"]);
      if (!group.warehouseQty && !group.wipFgQty) group.warehouseQty = Math.max(0, ...group.requirements.map((row) => number(row.onHandQty)));
      for (const [bucketKey, cell] of group.buckets) {
        const requirementCandidates = group.requirements.filter((row) => cell.lines.some((line) => line.partCode === row.partCode && (!line.materialRequiredDate || dateKey(row.requiredDate) === dateKey(line.materialRequiredDate))));
        const projectedRow = requirementCandidates.sort((left, right) => new Date(left.requiredDate) - new Date(right.requiredDate)).at(-1);
        cell.projectedFirm = projectedRow ? number(projectedRow.firmProjectedAvailableQty ?? projectedRow.projectedAvailableQty) : -number(cell.shortageQty);
        cell.projectedAfterBuy = cell.projectedFirm + number(cell.buyQty);
        cell.covered = cell.shortageQty <= 0.000001 && !cell.risks.has("EXPEDITE");
        const bucket = bucketMap.get(bucketKey); const storeId = `mrp-${plannerBucketStore.size}`;
        plannerBucketStore.set(storeId, { kind: "MRP", materialCode: group.materialCode, bucketLabel: bucket?.label || bucketKey, ...cell }); cell.storeId = storeId;
      }
    }
    const buckets = [...bucketMap.values()].sort((left, right) => left.sort.localeCompare(right.sort));
    const groupRows = [...groups.values()].sort((left, right) => left.materialCode.localeCompare(right.materialCode));
    const body = groupRows.map((group) => {
      const covered = [...group.buckets.values()].every((cell) => cell.covered); const searchValue = [group.materialCode, ...group.partCodes, ...group.partNumbers, ...group.partNames, ...group.supplierNames, ...group.supplierCodes].join(" ").toLowerCase();
      const partCodes = [...group.partCodes].filter((partCode) => partCode !== group.materialCode);
      const partNumberLabel = [...group.partNumbers].join(", ") || "belum diisi";
      const partNameLabel = [...group.partNames].join(", ");
      const identity = `<td class="sticky-material" rowspan="2"><div class="mrp-material-name"><b>${esc(group.materialCode)}</b>${partCodes.length ? `<small>Part Code ${esc(partCodes.join(", "))}</small>` : ""}<small>Part No. ${esc(partNumberLabel)}${partNameLabel ? ` · ${esc(partNameLabel)}` : ""}</small><small>${esc([...group.supplierNames].join(", ") || "Supplier belum dipilih")}</small></div></td>`;
      const buyCells = buckets.map((bucket) => { const cell = group.buckets.get(bucket.key); return cell ? `<td><button type="button" class="mrp-bucket-button" data-open-planner-bucket="${cell.storeId}"><span><em>Need</em><b>${num(cell.needQty)}</b></span><span><em>Buy / PR</em><b>${num(cell.buyQty)}</b></span><small>${esc([...cell.risks].join(", "))} · exact date ›</small></button></td>` : "<td>-</td>"; }).join("");
      const stockCells = buckets.map((bucket) => { const cell = group.buckets.get(bucket.key); if (!cell) return "<td>-</td>"; const state = cell.projectedAfterBuy < -0.000001 ? "short" : "safe"; return `<td><div class="mrp-projected-cell"><span><em>Firm</em><strong class="${cell.projectedFirm < 0 ? "short" : "safe"}">${num(cell.projectedFirm)}</strong></span><span><em>After Buy</em><strong class="${state}">${num(cell.projectedAfterBuy)}</strong></span><small>${cell.covered ? "Supply covered" : "Perlu tindak lanjut"}</small></div></td>`; }).join("");
      return `<tr class="${covered ? "is-covered" : ""}" data-planner-material="${esc(searchValue)}">${identity}<td class="sticky-line"><span class="mrp-line-label buy">BUY / PR</span></td><td rowspan="2"><div class="mrp-stock-stack"><span><em>WH/RM</em><b>${num(group.warehouseQty)}</b></span><span><em>WIP/FG</em><b>${num(group.wipFgQty)}</b></span><span><em>Open PO</em><b>${num(group.openPoQty)}</b></span></div></td><td rowspan="2" class="ppic-number"><b>${num(group.needQty)}</b><small class="d-block text-muted">Buy ${num(group.buyQty)}</small></td>${buyCells}</tr><tr class="projected-row ${covered ? "is-covered" : ""}" data-planner-material="${esc(searchValue)}"><td class="sticky-line"><span class="mrp-line-label stock">PROJECTED STOCK</span></td>${stockCells}</tr>`;
    }).join("");
    $("ppic-planner-toolbar").innerHTML = `<label>Cari material<input id="mrp-planner-search" type="search" placeholder="Material, part, supplier"></label><label><input id="mrp-show-covered" type="checkbox"> Tampilkan item covered</label><span class="spacer"></span><span class="planner-legend"><span class="buy">Buy / PR</span><span class="safe">Stock aman</span><span class="short">Shortage</span></span>`;
    $("ppic-planner-content").innerHTML = `<div class="planner-grid-scroll"><table id="mrp-planner-grid-table" class="mrp-planner-grid"><thead><tr><th class="identity-group sticky-material" rowspan="2">Material / Part</th><th class="identity-group sticky-line" rowspan="2">Planner Line</th><th class="stock-group" rowspan="2">Posisi Stock</th><th class="demand-group" rowspan="2">Total Need</th><th class="bucket-group" colspan="${Math.max(buckets.length, 1)}">Supplier Arrival / Purchase Bucket</th></tr><tr>${buckets.map((bucket) => `<th class="bucket-group">${esc(bucket.label)}<small class="d-block">${bucket.half === "B1" ? "1–15" : bucket.half === "B2" ? "16–EOM" : ""}</small></th>`).join("") || '<th class="bucket-group">Tanpa bucket</th>'}</tr></thead><tbody>${body || `<tr><td colspan="${buckets.length + 4}" class="ppic-empty">Belum ada kebutuhan pembelian pada run ini.</td></tr>`}</tbody></table></div>`;
    $("ppic-planner-footer").innerHTML = `<b>${groupRows.length}</b> material/part · <b>${buckets.length}</b> bucket B1/B2 · netting tetap consolidated, customer pegging tersedia pada detail angka.`;
  }
  function renderMrpPlannerView(doc, view = activePlannerView) {
    activePlannerView = view; const card = $("ppic-planner-matrix-card"); if (!card) return; card.classList.remove("d-none");
    $("ppic-planner-eyebrow").textContent = "MRP PLANNER VIEW"; $("ppic-planner-title").textContent = "MRP Planner Grid"; $("ppic-planner-description").textContent = "Format familiar BUY/PR dan PROJECTED STOCK per B1/B2, dengan exact due date dan customer pegging di setiap cell.";
    $("ppic-planner-tabs").innerHTML = plannerTabs([["matrix", "Planner Grid"], ["management", "Management Matrix"], ["dates", "Jadwal Tanggal"], ["pegging", "Customer Pegging"], ["bom", "BOM Trace"]], view);
    const technical = $("ppic-technical-detail-card"); technical?.classList.toggle("d-none", view !== "bom");
    if (view === "bom") { $("ppic-planner-toolbar").innerHTML = ""; $("ppic-planner-content").innerHTML = '<div class="planner-empty">Tabel requirement dan BOM trace ditampilkan di bawah.</div>'; $("ppic-planner-footer").textContent = "Gunakan BOM Trace untuk audit explosion; keputusan harian pembelian tetap dilakukan dari Planner Grid."; return; }
    if (view === "management") {
      const matrix = buildMrpManagementMatrix(doc);
      $("ppic-planner-toolbar").innerHTML = '<span class="planner-legend"><span class="safe">Stock fisik / firm</span><span class="buy">PR / PO inbound</span><span class="short">Shortage</span></span>';
      const fgRows = matrix.fgRows.map((row) => `<tr><td><b>${esc(row.customerCode)}</b></td><td><b>${esc(row.partCode)}</b><small class="d-block">${esc([row.partNumber, row.partName].filter(Boolean).join(" · "))}</small></td><td>${date(row.targetDeliveryDate)}</td><td class="ppic-number">${num(row.demandQty)} ${esc(row.uomCode)}</td><td class="ppic-number">${num(row.onHandQty)}</td><td class="ppic-number">${num(row.netQty)}</td><td><small>${esc(row.wipSummary)}</small></td><td><small>${esc(row.materialShortageSummary)}</small></td><td>${badge(row.status)}</td></tr>`).join("");
      const materialRows = matrix.materialRows.map((row) => `<tr><td><b>${esc(row.partCode)}</b><small class="d-block">${esc([row.partNumber, row.partName].filter((value) => value && value !== "-").join(" · "))}</small></td><td class="ppic-number">${num(row.grossQty)}</td><td class="ppic-number">${num(row.onHandQty)}</td><td class="ppic-number">${num(row.firmSupplyQty)}</td><td class="ppic-number">${num(row.netQty)}</td><td class="ppic-number">${num(row.plannedBuyQty)}</td><td><small>${esc(row.prNumbers)}</small></td><td class="ppic-number">${num(row.poOrderedQty)}</td><td class="ppic-number">${num(row.poReceivedQty)}</td><td class="ppic-number">${num(row.poOutstandingQty)}</td><td>${esc(row.uomCode)}</td><td>${badge(row.status)}</td></tr>`).join("");
      $("ppic-planner-content").innerHTML = `<div class="planner-grid-scroll"><table class="mps-demand-matrix-table"><thead><tr><th>Customer</th><th>FG / Order</th><th>Target Delivery</th><th>Demand</th><th>FG Stock @ MRP</th><th>FG Net Production</th><th>Posisi WIP</th><th>Material Shortage</th><th>Status</th></tr></thead><tbody>${fgRows || '<tr><td colspan="9" class="ppic-empty">Belum ada demand FG.</td></tr>'}</tbody></table></div><div class="planner-grid-scroll mt-3"><table class="mps-demand-matrix-table"><thead><tr><th>Material / Part</th><th>Need</th><th>Stock @ MRP</th><th>Firm Supply</th><th>Shortage</th><th>Planned Buy</th><th>PR</th><th>PO Ordered</th><th>PO Received</th><th>PO Outstanding</th><th>UOM</th><th>Status</th></tr></thead><tbody>${materialRows || '<tr><td colspan="12" class="ppic-empty">Belum ada kebutuhan material.</td></tr>'}</tbody></table></div>`;
      $("ppic-planner-footer").innerHTML = `<b>${matrix.fgRows.length}</b> demand FG · <b>${matrix.materialRows.length}</b> material/part. PO belum menjadi stock sampai GR dan Quality Release.`;
      return;
    }
    if (!mrpPresentation.procurement || !mrpPresentation.pegging) { $("ppic-planner-toolbar").innerHTML = ""; $("ppic-planner-content").innerHTML = '<div class="planner-empty">Memuat jadwal dan pegging MRP…</div>'; return; }
    if (view === "matrix") return renderMrpPlannerGrid(doc);
    $("ppic-planner-toolbar").innerHTML = "";
    if (view === "dates") {
      const items = mrpPresentation.procurement.items || [];
      $("ppic-planner-content").innerHTML = `<div class="planner-grid-scroll"><table class="mps-demand-matrix-table"><thead><tr><th>Material / Supplier</th><th>Delivery Customer</th><th>Mulai Produksi</th><th>Material Wajib Ada</th><th>Supplier Datang</th><th>PO Maksimal</th><th>PR Maksimal</th><th>Buy Qty</th><th>Risk</th></tr></thead><tbody>${items.map((row) => { const identity = procurementPresentationIdentity(row); return `<tr><td><b>${esc(identity.materialCode || row.partCode)}</b>${identity.materialCode !== row.partCode ? `<small class="d-block">Source Part ${esc(row.partCode)}</small>` : ""}<small class="d-block">Part No. ${esc(identity.partNumber || "belum diisi")}${identity.partName ? ` · ${esc(identity.partName)}` : ""}</small><small class="d-block" title="Kode supplier: ${esc(identity.supplierCode || "-")}">${esc(identity.supplierName)}</small></td><td>${date(row.customerDeliveryDate)}</td><td>${date(row.productionStartDate)}</td><td>${date(row.materialRequiredDate)}</td><td><b>${date(row.supplierRequiredArrivalDate)}</b><small class="d-block">${esc(halfMonthBucket(row.supplierRequiredArrivalDate).label)}</small></td><td>${date(row.latestPoDate)}</td><td>${date(row.latestPrDate)}</td><td class="ppic-number">${num(row.suggestedOrderQty)}</td><td>${badge(row.risk)}</td></tr>`; }).join("") || '<tr><td colspan="9" class="ppic-empty">Belum ada jadwal pembelian.</td></tr>'}</tbody></table></div>`;
      $("ppic-planner-footer").textContent = "Exact date dihitung mundur dari delivery customer, lead time proses, dan lead time supplier."; return;
    }
    const items = mrpPresentation.pegging.items || [];
    $("ppic-planner-content").innerHTML = `<div class="planner-grid-scroll"><table class="mps-demand-matrix-table"><thead><tr><th>Customer</th><th>Target Delivery</th><th>FG</th><th>Demand Source</th><th>Material / Component</th><th>Required Date</th><th>Requirement</th><th>Supply Coverage</th><th>Risk</th></tr></thead><tbody>${items.map((row) => `<tr><td><b>${esc(row.customerCode || "-")}</b></td><td>${date(row.targetDeliveryDate)}</td><td>${esc(row.fgPartCode || "-")}<small class="d-block text-muted">Part Number: ${esc(row.fgPartNumber || partMasterData(row.fgPartCode)?.partNumber || "—")}</small></td><td><b>${esc(row.sourceNumber || "-")}</b><small class="d-block">${esc(row.sourceType || "-")}</small></td><td>${esc(row.materialOrComponent)}<small class="d-block text-muted">Part Number: ${esc(row.partNumber || partMasterData(row.materialOrComponent)?.partNumber || "—")}</small></td><td>${date(row.requiredDate)}</td><td class="ppic-number">${num(row.requirementQty)}</td><td class="ppic-number">${num(row.supplyCoverageQty)}</td><td>${badge(row.risk)}</td></tr>`).join("") || '<tr><td colspan="9" class="ppic-empty">Belum ada customer pegging.</td></tr>'}</tbody></table></div>`;
    $("ppic-planner-footer").textContent = "Netting material tetap consolidated; view ini hanya memecah kembali sumber customer untuk traceability.";
  }
  async function renderMrpPresentationViews(doc) {
    const section = $("ppic-mrp-views"); if (!section) return; section.classList.add("d-none");
    mrpPresentation = { procurement: null, pegging: null, active: "procurement" }; renderMrpPresentationContent();
    renderMrpPlannerView(doc, activePlannerView === "process" ? "matrix" : activePlannerView);
    try {
      const [procurement,pegging] = await Promise.all([api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(doc.runNumber)}/procurement-view`),api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(doc.runNumber)}/customer-pegging-view`)]);
      if (currentDoc?.runNumber !== doc.runNumber) return; mrpPresentation.procurement=procurement;mrpPresentation.pegging=pegging;renderMrpPresentationContent();renderMrpPlannerView(doc, activePlannerView);
    } catch(error) { $("ppic-mrp-view-content").innerHTML=`<div class="alert alert-warning">${esc(error.message)}</div>`; }
  }
  function renderMrp(doc) {
    renderMrpPresentationViews(doc);
    const allRequirements = Array.isArray(doc.requirements) ? doc.requirements : [];
    const requirementTrace = Array.isArray(doc.requirementTrace) ? doc.requirementTrace : allRequirements;
    const productionScheduleTrace = Array.isArray(doc.productionScheduleTrace) ? doc.productionScheduleTrace : [];
    const completeTrace = [...requirementTrace, ...productionScheduleTrace];
    const traceById = new Map(completeTrace.map((row) => [row.id, row]));
    const productionBySourceAndPart = new Map(completeTrace
      .filter((row) => String(row.orderType).toLowerCase() === "production")
      .map((row) => [`${row.mpsDetailId}|${row.partCode}`, row]));
    const resolveTraceParent = (node) => {
      if (node.parentRequirementId && traceById.has(node.parentRequirementId)) return traceById.get(node.parentRequirementId);
      const structuralParentCode = node.parentPartCode
        || node.mbomDetail?.parentDetail?.part?.partCode
        || node.mbomDetail?.mbomHeader?.part?.partCode;
      return structuralParentCode ? productionBySourceAndPart.get(`${node.mpsDetailId}|${structuralParentCode}`) || null : null;
    };
    const buildNettingFactors = (sourceRows, fallbackUom) => {
      const factors = [];
      const seen = new Set();
      for (const sourceRow of sourceRows) {
        const chain = [];
        let current = traceById.get(sourceRow.id) || sourceRow;
        while (current && !chain.some((item) => item.id === current.id)) {
          chain.push(current);
          current = resolveTraceParent(current);
        }
        for (const node of chain.reverse()) {
          if (seen.has(node.id)) continue;
          seen.add(node.id);
          const parent = resolveTraceParent(node);
          const gross = number(node.grossRequirement);
          const net = number(node.netRequirement);
          const covered = Math.max(gross - net, 0);
          const ratio = number(node.mbomDetail?.qty);
          const grossWeight = number(node.mbomDetail?.grossWeight);
          const rawMaterial = String(node.part?.rawType || "").toUpperCase() === "MATERIAL" && grossWeight > 0;
          const conversionFactor = rawMaterial ? grossWeight : ratio;
          const parentDriver = parent && conversionFactor > 0 ? gross / conversionFactor : number(parent?.netRequirement);
          const parentReduction = parent ? Math.max(number(parent.grossRequirement) - number(parent.netRequirement), 0) : 0;
          const structuralParent = !parent ? (node.mbomDetail?.parentDetail?.part || node.mbomDetail?.mbomHeader?.part) : null;
          const structuralParentDriver = structuralParent && conversionFactor > 0 ? gross / conversionFactor : 0;
          const decisionQty = String(node.orderType).toLowerCase() === "purchase" ? number(node.adjustedOrderQty ?? node.plannedOrderQty ?? net) : net;
          const decision = String(node.orderType).toLowerCase() === "purchase" ? "Beli" : "Produksi";
          const productionNode = String(node.orderType).toLowerCase() === "production";
          const rowUom = rawMaterial
            ? "kg"
            : productionNode
              ? (node.part?.productionUomCode || node.part?.baseUomCode || node.mbomDetail?.uomCode || "pcs")
              : (node.part?.stockUomCode || node.part?.baseUomCode || node.mbomDetail?.uomCode || fallbackUom || "pcs");
          const conversionText = rawMaterial
            ? `${num(parentDriver, 3)} PCS × GW ${num(grossWeight, 7)} KG/PCS = gross ${node.partCode} ${num(gross, 6)} KG.`
            : `× rasio BOM ${num(ratio || 1, 6)} = gross ${node.partCode} ${num(gross, 3)} ${rowUom}.`;
          const parentText = parent
            ? `Driver ${parent.partCode}: gross ${num(parent.grossRequirement, 3)} PCS${parentReduction > 0 ? ` − stock/WIP/supply ${num(parentReduction, 3)} PCS` : ""} = produksi ${num(parent.netRequirement, 3)} PCS. ${conversionText}`
            : structuralParent
              ? `Driver produksi ${structuralParent.partCode}: ${num(structuralParentDriver, 3)} PCS setelah netting stock/WIP parent. ${rawMaterial ? `${num(structuralParentDriver, 3)} PCS × GW ${num(grossWeight, 7)} KG/PCS = ${num(gross, 6)} KG.` : `× rasio BOM ${num(ratio || 1, 6)} = gross ${node.partCode} ${num(gross, 3)} ${rowUom}.`}`
              : `Demand FG sebelum netting ${num(gross, 3)} ${rowUom}.`;
          if (structuralParent) {
            factors.push({
              title: `Reference parent · ${structuralParent.partCode}`,
              meta: `Part ${node.partCode} berada di MBOM ${node.mbomDetail?.mbomHeader?.noReg || "-"}. Qty driver ${num(structuralParentDriver, 3)} PCS adalah kebutuhan produksi parent setelah pengurang stock/WIP. Run lama yang belum menyimpan intermediate trace tidak mempunyai rincian angka pengurang parent per baris.`,
              qty: `${num(structuralParentDriver, 3)} PCS`,
              href: doc.mpsNumber ? `/modules/planning-ppic/mps/${encodeURIComponent(doc.mpsNumber)}` : null,
            });
          }
          factors.push({
            title: `Level ${num(node.levelMBOM)} · ${node.partCode} · ${decision}`,
            meta: `${parentText} Stock/supply ${node.partCode} menutup ${num(covered, 3)}; net ${num(net, 3)}.`,
            qty: `${decision} ${num(decisionQty, 3)} ${rowUom}`,
            href: `/modules/inventory/stock-balances?q=${encodeURIComponent(node.partCode)}`,
          });
        }
      }
      return factors;
    };
    const requirements = preparePlanningView(allRequirements, {
      customer: (row) => row.planningCustomerCode,
      month: (row) => row.planningMonth || row.requiredDate,
      part: (row) => row.partCode,
      parentFg: (row) => row.planningPartCode || row.partCode,
    });
    const rawMaterialCount = allRequirements.filter((row) => row.part?.itemType === "RAW" && row.part?.rawType === "MATERIAL").length;
    const purchasePartCount = allRequirements.filter((row) => row.part?.itemType === "RAW" && row.part?.rawType === "PURCHASE_PART").length;
    const expediteCount = allRequirements.filter((row) => row.orderType === "Purchase" && row.procurementWindow === "EXPEDITE" && number(row.netRequirement) > 0).length;
    const atRiskSupplyQty = allRequirements.filter((row) => row.orderType === "Purchase").reduce((sum, row) => sum + number(row.atRiskSupplyQty), 0);
    const scenarioComparison = Array.isArray(doc.scenarioComparison) ? doc.scenarioComparison : [];
    const currentScenario = scenarioComparison.find((row) => row.runNumber === doc.runNumber);
    const baselineScenario = scenarioComparison.find((row) => row.isCurrentPlan && row.scenarioStatus !== "SIMULATION");
    const scenarioNetDelta = currentScenario && baselineScenario ? number(currentScenario.netRequirement) - number(baselineScenario.netRequirement) : 0;
    const supplySummaryCells = (row) => {
      const supply = row._supply || {};
      const warehouse = supply.warehouseStock || {};
      const wip = supply.wipStock || {};
      const supplier = supply.supplierOutstanding || {};
      const uom = row._displayUom || row.uomCode || "-";
      const warehouseLines = Array.isArray(warehouse.lines) ? warehouse.lines : [];
      const wipLines = Array.isArray(wip.lines) ? wip.lines : [];
      const supplierLines = Array.isArray(supplier.lines) ? supplier.lines : [];
      const stockCell = (kind, stock, lines, emptyLabel) => {
        const planningSupplyQty = kind === "wip"
          ? number(stock.planningSupplyQty ?? stock.qtyOnHand)
          : number(stock.planningSupplyQty ?? stock.qtyAvailable);
        const tooltip = lines.length
          ? lines.map((line) => kind === "wip"
            ? `${line.sourcePartCode || "WIP/FG"}${line.sourcePartName ? ` - ${line.sourcePartName}` : ""}: ${num(line.sourceQtyOnHand, 3)} ${line.sourceUomCode || "pcs"} x GW ${num(line.conversionFactorKgPerPcs, 6)} = ${num(line.qtyOnHand, 3)} ${line.uomCode || uom}`
            : `${[line.warehouseCode, line.rackCode, line.lotNumber].filter(Boolean).join(" / ") || "Tanpa lokasi"}: ${num(line.qtyAvailable, 3)} ${line.uomCode || uom}`).join("\n")
          : emptyLabel;
        return `<td class="ppic-supply-cell ${kind}" title="${esc(tooltip)}"><div class="ppic-supply-value"><b>${num(planningSupplyQty, 3)}</b><small>${esc(uom)}</small></div><span>OH ${num(stock.qtyOnHand, 3)} · RSV ${num(stock.qtyReserved, 3)} · QC ${num(stock.qtyQC, 3)}</span><em>${lines.length ? `${num(lines.length)} lokasi` : emptyLabel}</em></td>`;
      };
      const supplierTooltip = supplierLines.length
        ? supplierLines.map((line) => `${line.poNumber || "PO"} · ${line.supplierName || line.supplierCode || "Supplier"} · ${validDate(line.deliveryDate) ? date(line.deliveryDate) : "Tanpa ETA"} · Sisa ${num(line.outstandingQty, 3)}`).join("\n")
        : "Belum ada outstanding PO supplier";
      const visibleSupply = number(warehouse.planningSupplyQty ?? warehouse.qtyAvailable)
        + number(wip.planningSupplyQty ?? wip.qtyOnHand)
        + number(supplier.qtyEligible);
      const coveredDemand = Math.min(number(row._gross), visibleSupply);
      const uncoveredDemand = Math.max(number(row._gross) - visibleSupply, 0);
      const coveragePercent = number(row._gross) > 0 ? (coveredDemand / number(row._gross)) * 100 : 100;
      return [
        stockCell("warehouse", warehouse, warehouseLines, "Belum ada stock"),
        stockCell("wip", wip, wipLines, "Belum ada stock"),
        `<td class="ppic-supply-cell coverage" title="Covered = min(Gross, material warehouse + ekuivalen WIP/FG (pcs x GW) + outstanding PO eligible)"><div class="ppic-supply-value"><b>${num(coveredDemand, 3)}</b><small>${esc(uom)}</small></div><span>${num(coveragePercent, 1)}% covered</span><em>Uncovered ${num(uncoveredDemand, 3)}</em></td>`,
        `<td class="ppic-supply-cell supplier" title="${esc(supplierTooltip)}"><div class="ppic-supply-value"><b>${num(supplier.qtyOutstanding, 3)}</b><small>${esc(uom)}</small></div><span>Eligible ${num(supplier.qtyEligible, 3)}</span><em>${supplierLines.length ? `${num(supplierLines.length)} PO` : "Belum ada PO"}</em></td>`,
      ].join("");
    };
    const groupedRows = groupedPlanningRows(requirements, {
      colSpan: 21,
      customer: (row) => row.planningCustomerCode,
      month: (row) => row.planningMonth || row.requiredDate,
      planPart: (row) => row.partCode,
      parentFg: (row) => row.planningPartCode || row.partCode,
      planPartLabelFor: () => "Part",
      planPartDisplay: (value, rows) => ({ code: value, name: rows[0]?.part?.partName || rows[0]?.part?.partNumber || "" }),
      parentFgDisplay: (value, rows) => ({ code: value, name: rows[0]?.planningPartName || rows[0]?.planningPartNumber || "" }),
      planPartInItems: false,
      renderItems: (group) => {
        const aggregate = new Map();
        for (const row of group) {
          const rawMaterial = row.part?.itemType === "RAW" && row.part?.rawType === "MATERIAL";
          const displayUom = rawMaterial && row.plannedOrderQtyKg != null ? "kg" : row.uomCode || row.mbomDetail?.uomCode || "-";
          const key = `${row.partCode}|${row.orderType || "-"}|${displayUom}`;
          if (!aggregate.has(key)) aggregate.set(key, { ...row, _ids: [], _sourceRows: [], _base: 0, _forecast: 0, _actualSalesOrder: 0, _soSources: [], _bufferBase: 0, _bufferQty: 0, _bufferPercents: new Set(), _bufferScopes: new Set(), _orderPercents: new Set(), _procurementWindows: new Set(), _overridden: false, _gross: 0, _net: 0, _atRisk: 0, _planned: 0, _adjusted: 0, _onHand: 0, _leadTime: 0, _referencePcs: 0, _displayUom: displayUom, _rawMaterial: rawMaterial, _supply: row.supplyBreakdown || null });
          const target = aggregate.get(key);
          target._ids.push(row.id);
          target._sourceRows.push(row);
          target._base += number(row.effectiveDemandQty);
          target._forecast += number(row.forecastQty);
          target._actualSalesOrder += number(row.soConsumedQty);
          target._soSources.push(...(Array.isArray(row.consumptionSources) ? row.consumptionSources : []));
          target._bufferBase += number(row.bufferBaseQty);
          target._bufferQty += number(row.bufferQty);
          target._bufferPercents.add(number(row.bufferPercent));
          target._bufferScopes.add(row.bufferReferenceScope || "PARENT_FG");
          target._orderPercents.add(number(row.orderPercent || 100));
          target._overridden = target._overridden || Boolean(row.bufferOverridden);
          target._gross += number(row.grossRequirement);
          target._net += number(row.netRequirement);
          target._atRisk += number(row.atRiskSupplyQty);
          if (row.procurementWindow) target._procurementWindows.add(row.procurementWindow);
          const referencePcs = row.referenceDemandQtyPcs != null
            ? number(row.referenceDemandQtyPcs)
            : number(row.mbomDetail?.grossWeight) > 0
              ? Math.ceil(number(row.effectiveDemandQty) / number(row.mbomDetail.grossWeight) - 0.0001)
              : 0;
          target._referencePcs += rawMaterial ? referencePcs : 0;
          target._planned += rawMaterial && row.plannedOrderQtyKg != null ? number(row.plannedOrderQtyKg) : number(row.plannedOrderQty);
          target._adjusted += number(row.adjustedOrderQty || row.plannedOrderQty);
          target._onHand = Math.max(target._onHand, number(row.onHandQty));
          target._leadTime = Math.max(target._leadTime, number(row.leadTime));
        }
        return [...aggregate.values()].sort((a, b) => number(a.levelMBOM) - number(b.levelMBOM) || String(a.partCode).localeCompare(String(b.partCode))).map((row) => {
          const type = row._rawMaterial ? "Raw Material" : row.part?.rawType === "PURCHASE_PART" ? "Purchase Part" : row.orderType || row.part?.itemType || "Part";
          const materialCode = row.part?.material?.materialCode || null;
          const materialName = row.part?.material?.materialName || null;
          const conversionWarning = row._rawMaterial && row._displayUom !== "kg" ? '<small class="ppic-conversion-warning">Gross weight MBOM belum lengkap</small>' : "";
          const bufferPercent = row._bufferPercents.size === 1 ? [...row._bufferPercents][0] : number(row.bufferPercent);
          const orderPercent = row._orderPercents.size === 1 ? [...row._orderPercents][0] : 100;
          const soReferences = [...new Set(row._soSources.map((source) => String(source).split(":")[0]).filter((source) => source && !source.startsWith("MPS")))];
          const soCell = row._actualSalesOrder > 0 ? `<div class="ppic-so-reference"><b>${num(row._actualSalesOrder, 3)}</b>${soReferences.map((so) => `<a href="/modules/sales/sales-orders/${encodeURIComponent(so)}">${esc(so)}</a>`).join("")}</div>` : "0";
          const bufferScope = row._bufferScopes.has("LINE") ? "line" : "parent";
          const partNumberCell = row.part?.partNumber ? `<small class="ppic-cell-sub">Part Number: ${esc(row.part.partNumber)}</small>` : "";
          const rawMaterialNameCell = row._rawMaterial && materialName ? `<small class="ppic-cell-sub">Raw Material: ${esc(materialName)}</small>` : "";
          const materialCodeCell = materialCode ? `<small class="ppic-cell-sub">Material Code: ${esc(materialCode)}</small>` : "";
          const materialRefPcs = row._rawMaterial ? `<small class="ppic-cell-sub">Ref kebutuhan: ${num(row._referencePcs)} PCS</small>` : "";
          const mrpAdjustmentData = `data-action="edit-mrp-percentage" data-run-number="${esc(doc.runNumber)}" data-requirement-ids="${esc(row._ids.join(","))}" data-part-code="${esc(row.partCode)}"`;
          const bufferCell = `<div class="ppic-percent-cell"><b>${num(bufferPercent, 2)}%</b><small class="ppic-buffer-source">${row._overridden ? (bufferScope === "parent" ? "Override Parent FG" : "Override per Part") : "Master Parent / FG"}</small><button type="button" class="ppic-percent-edit" ${mrpAdjustmentData} data-adjustment-kind="buffer" data-percentage="${esc(bufferPercent)}" data-scope="${esc(bufferScope)}">Edit</button></div>`;
          const orderCell = `<div class="ppic-percent-cell"><b>${num(orderPercent, 2)}%</b><small class="ppic-buffer-source">Minimum SO</small><button type="button" class="ppic-percent-edit" ${mrpAdjustmentData} data-adjustment-kind="order" data-percentage="${esc(orderPercent)}">Edit</button></div>`;
          const projectedAvailable = Math.max(number(row._gross) - number(row._net), 0);
          const supply = row._supply || {};
          const formulaReferenceId = `mrp:${doc.runNumber}:${row.partCode}:${formulaReferenceStore.size}`;
          const demandDocuments = [...new Set(row._soSources.map((source) => String(source).split(":")[0]).filter(Boolean))].map((source) => {
            const sourceNumber = source.split("#")[0];
            const isSo = /^SO/i.test(sourceNumber);
            return { title: sourceNumber, meta: isSo ? "Sales Order yang dikonsumsi MRP" : "Referensi demand MRP", href: isSo ? `/modules/sales/sales-orders/${encodeURIComponent(sourceNumber)}` : null };
          });
          const stockReference = (line, qtyField = "qtyAvailable") => ({
            title: [line.warehouseCode || "Warehouse", line.rackCode, line.lotNumber ? `Lot ${line.lotNumber}` : "Tanpa lot"].filter(Boolean).join(" / "),
            meta: `${line.stockType || "Stock"} · OH ${num(line.qtyOnHand, 3)} · RSV ${num(line.qtyReserved, 3)} · QC ${num(line.qtyQC, 3)}`,
            qty: `${num(line[qtyField], 3)} ${line.uomCode || row._displayUom}`,
            href: `/modules/inventory/stock-balances?q=${encodeURIComponent(line.lotNumber || line.sourcePartCode || row.partCode)}`,
          });
          formulaReferenceStore.set(formulaReferenceId, {
            nettingFactors: buildNettingFactors(row._sourceRows, row._displayUom),
            demands: row._sourceRows.map((source) => ({
              title: `${source.planningPartCode || source.partCode} → ${source.partCode}`,
              meta: `Level BOM ${num(source.levelMBOM)} · perlu ${date(source.requiredDate)} · Forecast ${num(source.forecastQty, 3)} · Buffer ${num(source.bufferQty, 3)}`,
              qty: `${num(source.grossRequirement, 3)} ${source.uomCode || row._displayUom}`,
              href: source.planningPartCode ? `/modules/planning-ppic/mps/${encodeURIComponent(doc.mpsNumber)}` : null,
            })),
            demandDocuments,
            warehouseStock: (supply.warehouseStock?.lines || []).map((line) => stockReference(line, "qtyAvailable")),
            wipStock: (supply.wipStock?.lines || []).map((line) => ({
              ...stockReference(line, "qtyOnHand"),
              title: `${line.sourcePartCode || "WIP/FG"}${line.sourcePartName ? ` · ${line.sourcePartName}` : ""}`,
              meta: `${line.warehouseCode || "Warehouse"} / ${line.rackCode || "Tanpa rack"} / ${line.lotNumber ? `Lot ${line.lotNumber}` : "Tanpa lot"} · ${num(line.sourceQtyOnHand, 3)} ${line.sourceUomCode || "pcs"} × GW ${num(line.conversionFactorKgPerPcs, 6)}`,
            })),
            purchaseOrders: (supply.supplierOutstanding?.lines || []).filter((line) => line.eligibleForRequirement).map((line) => ({
              title: line.poNumber || "Purchase Order",
              meta: `${line.supplierName || line.supplierCode || "Supplier"} · ETA ${date(line.deliveryDate)} · status ${line.poStatus || "-"}`,
              qty: `${num(line.outstandingQty, 3)} ${line.uomCode || row._displayUom}`,
              href: line.poNumber ? `/modules/purchasing/purchase-orders/${encodeURIComponent(line.poNumber)}` : null,
            })),
          });
          const formulaData = `data-action="show-formula-reference" data-formula-reference-id="${esc(formulaReferenceId)}" data-formula-scope="mrp" data-part-code="${esc(row.partCode)}" data-uom="${esc(row._displayUom)}" data-forecast="${esc(row._forecast)}" data-need="${esc(row._base)}" data-actual-sales-order="${esc(row._actualSalesOrder)}" data-buffer-base="${esc(row._bufferBase)}" data-buffer-percent="${esc(bufferPercent)}" data-buffer-qty="${esc(row._bufferQty)}" data-gross="${esc(row._gross)}" data-projected-available="${esc(projectedAvailable)}" data-net="${esc(row._net)}" data-order-percent="${esc(orderPercent)}" data-purchase-plan="${esc(row._adjusted)}"`;
          const procurementWindow = row._procurementWindows.has("EXPEDITE") ? "EXPEDITE" : [...row._procurementWindows][0];
          const procurementMeta = procurementWindow ? `<small class="ppic-cell-sub">${esc(procurementWindow)}${row._atRisk > 0 ? ` · risk ${num(row._atRisk, 3)}` : ""}</small>` : "";
          return `<tr class="ppic-requirement-row ${row._rawMaterial ? "ppic-raw-material-row" : ""}"><td>${badge(type)}</td><td><b>${esc(row.partCode)}</b>${rawMaterialNameCell}<small class="ppic-cell-sub">Level ${num(row.levelMBOM)}</small></td><td>${esc(row.part?.partName || row.part?.partNumber || "-")}${partNumberCell}${materialCodeCell}${conversionWarning}</td><td class="ppic-number">${num(row._forecast, 3)}</td><td class="ppic-number">${num(row._base, 3)}${materialRefPcs}</td><td class="ppic-number ppic-actual-so">${soCell}</td><td class="ppic-number ppic-next-forecast">${num(row._bufferBase, 3)}</td><td>${bufferCell}</td><td class="ppic-number ppic-buffer-qty">${num(row._bufferQty, 3)}</td><td class="ppic-number">${num(row._gross, 3)}</td>${supplySummaryCells(row)}<td class="ppic-number">${num(row._onHand, 3)}</td><td class="ppic-number ppic-net-qty">${num(row._net, 3)}${procurementMeta}</td><td>${orderCell}</td><td class="ppic-number ppic-plan-qty">${num(row._adjusted, 3)}</td><td><b>${esc(row._displayUom)}</b></td><td class="ppic-number">${num(row._leadTime)} hari</td><td class="ppic-formula-help-cell"><button type="button" class="ppic-formula-help" ${formulaData} aria-label="Lihat rumus MRP ${esc(row.partCode)}">?</button></td></tr>`;
        });
      },
    });
    const suggestionLink = doc.purchaseSuggestion?.suggestionNumber ? `<a href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(doc.purchaseSuggestion.suggestionNumber)}">${esc(doc.purchaseSuggestion.suggestionNumber)}</a><br>${badge(doc.purchaseSuggestion.status)}` : "<strong>-</strong>";
    setInfo("Informasi MRP", [["MRP ID", doc.runNumber], ["Periode", month(doc.planningMonth || doc.runDate)], ["Tipe Perhitungan", doc.scenarioStatus === "SIMULATION" ? `Simulation · ${doc.scenarioName || doc.scenarioKey || "Scenario"}` : "Time-phased Net Requirements"], ["PIC Planner", doc.runBy || "-"], ["Purchase Suggestion", suggestionLink, true], ["Status Dokumen", badge(doc.status), true]]);
    setTable("Purchase Requirement - Customer / Bulan", ["Tipe", "Kode Part", "Nama / Material", "Forecast A", "Need Bulan A", "Actual Sales Order", "Forecast A+1", "Buffer %", "Buffer Qty", "Gross Req", "Material Warehouse", "WIP/FG × GW", "Covered Demand", "Outstanding PO (Belum Datang)", "Total Stock WH+WIP", "Net Req", "Order %", "Purchase Plan", "UOM", "Lead Time", "?"], groupedRows);
    const sourceMpsNumbers = doc.scenarioAssumptions?.sourceMpsNumbers || [doc.mpsNumber].filter(Boolean);
    setSummary("Parameter Perencanaan", [["Planning Horizon", `${num(doc.planHorizon)} hari`], ["Cut-off Date", date(doc.cutoffDate)], ["Snapshot", date(doc.planningSnapshotAt)], ["Sumber MPS", sourceMpsNumbers.join(" + ") || "-"], ["Raw Material", `${num(rawMaterialCount)} baris`], ["Purchase Part", `${num(purchasePartCount)} baris`], ["Expedite", `${num(expediteCount)} item`], ["Supply At Risk", num(atRiskSupplyQty, 3)], ["Skenario Tersimpan", num(scenarioComparison.length)], ["Delta vs Baseline", scenarioNetDelta >= 0 ? `+${num(scenarioNetDelta, 3)}` : num(scenarioNetDelta, 3)], ["Purchase Suggestion", doc.purchaseSuggestion?.suggestionNumber || "Belum dibuat"], ["Planned Orders", num(doc.totalPlannedOrders)]], doc.errorMessage || "MRP memakai demand dan receipt per tanggal. Supply planned/probable tetap ditampilkan sebagai risiko sampai supplier mengonfirmasi delivery.");
    renderProcurementSetup(doc, allRequirements);
    renderWorkflow(doc, baseWorkflow(doc, "MRP Released"), ["DRAFT", "CALCULATION", String(doc.status || "RUNNING").toUpperCase()]);
  }
  function renderMps(doc) {
    const details = Array.isArray(doc.details) ? doc.details : [];
    const isGeneratedProcess = (row) => String(row.notes || "").startsWith("[MRP-PRODUCTION]");
    const isChildFgReceipt = (row) => isGeneratedProcess(row)
      && String(row.part?.itemType || row.itemType || "").trim().toUpperCase() === "FG";
    const receiptDetails = details.filter((row) => !isGeneratedProcess(row));
    // Legacy MPS headers may contain multiple forecast periods while all rows
    // retain the header's periodStart. Use the stored forecast offset to keep
    // the month grouping accurate without rewriting historical data.
    const scheduleDate = (row) => {
      const base = new Date(row.startDate || doc.periodStart);
      const offset = number(row.forecastPeriodOffset);
      if (!Number.isFinite(base.getTime()) || offset <= 1) return row.startDate || doc.periodStart;
      return new Date(base.getFullYear(), base.getMonth() + offset - 1, 1).toISOString();
    };
    const scheduleMonthKey = (row) => monthKey(scheduleDate(row));
    const scheduleEndDate = (row) => {
      const start = new Date(scheduleDate(row));
      return new Date(start.getFullYear(), start.getMonth() + 1, 0).toISOString();
    };
    const receiptById = new Map(receiptDetails.map((row) => [row.id, row]));
    const receiptByLegacyKey = new Map(receiptDetails.map((row) => [`${row.customerCode || ""}|${row.partCode}|${number(row.forecastPeriodOffset)}`, row]));
    const receiptByMonth = new Map(receiptDetails.map((row) => [`${row.customerCode || ""}|${row.partCode}|${scheduleMonthKey(row)}`, row]));
    const receiptByCustomerOffset = new Map();
    receiptDetails.forEach((row) => receiptByCustomerOffset.set(`${row.customerCode || ""}|${number(row.forecastPeriodOffset)}`, row));
    const receiptByCustomerPart = new Map();
    receiptDetails.forEach((row) => {
      const key = `${row.customerCode || ""}|${row.partCode}`;
      const list = receiptByCustomerPart.get(key) || [];
      list.push(row);
      receiptByCustomerPart.set(key, list);
    });
    const nearestParent = (customerCode, partCode, row) => {
      const candidates = receiptByCustomerPart.get(`${customerCode || ""}|${partCode}`) || [];
      return candidates.slice().sort((left, right) => Math.abs(new Date(left.startDate).getTime() - new Date(row.startDate).getTime()) - Math.abs(new Date(right.startDate).getTime() - new Date(row.startDate).getTime()))[0];
    };
    const generatedDetails = details.filter(isGeneratedProcess).map((row) => {
      const sourceId = String(row.notes || "").match(/\[MPS-SOURCE:([^\]]+)\]/)?.[1];
      const sourcePart = String(row.notes || "").match(/;\s*source\s+(.+?)(?:;|$)/i)?.[1]?.trim();
      const source = receiptById.get(sourceId) || nearestParent(row.customerCode, sourcePart, row) || receiptByMonth.get(`${row.customerCode || ""}|${sourcePart || ""}|${scheduleMonthKey(row)}`) || receiptByLegacyKey.get(`${row.customerCode || ""}|${sourcePart || ""}|${number(row.forecastPeriodOffset)}`) || receiptByCustomerOffset.get(`${row.customerCode || ""}|${number(row.forecastPeriodOffset)}`);
      // Existing child rows predate the explicit source marker.  Fall back to
      // their parent FG so buffer remains visible without altering history.
      return source ? { ...row, forecastQty: number(row.forecastQty) || number(source.forecastQty), actualSalesOrderQty: number(row.actualSalesOrderQty) || number(source.actualSalesOrderQty), bufferBaseQty: number(row.bufferBaseQty) || number(source.bufferBaseQty), bufferPercent: number(row.bufferPercent) || number(source.bufferPercent), bufferQty: number(row.bufferQty) || number(source.bufferQty), effectiveDemandQty: number(row.effectiveDemandQty) || number(source.effectiveDemandQty), productionPercent: number(row.productionPercent || 100) } : row;
    });
    const childReceiptDetails = generatedDetails.filter(isChildFgReceipt);
    const processDetails = generatedDetails.filter((row) => !isChildFgReceipt(row));
    // Main FG is the demand receipt. A dependent FG is shown as an intermediate
    // receipt between its nested BOM operations and the parent BOM chain.
    const allVisibleDetails = [...receiptDetails, ...childReceiptDetails, ...processDetails];
    const qty = receiptDetails.reduce((sum, row) => sum + number(row.qtyPlanned), 0);
    const partCount = new Set(details.map((row) => row.partCode)).size;
    const primaryPart = receiptDetails[0]?.part?.partName || receiptDetails[0]?.partCode || "-";
    const mbomCount = processDetails.filter((row) => row.mbomHeaderId || row.mbom).length;
    const customerCount = new Set(details.map((row) => row.customerCode || "Tanpa Customer")).size;
    const monthCount = new Set(receiptDetails.map(scheduleMonthKey)).size;
    const childCount = processDetails.length;
    const childReceiptCount = childReceiptDetails.length;
    const isFinishedGood = (row) => String(row?.part?.itemType || row?.itemType || "").trim().toUpperCase() === "FG";
    const sourceFinishedGood = (row) => {
      const sourceId = String(row.notes || "").match(/\[MPS-SOURCE:([^\]]+)\]/)?.[1];
      const generatedSource = String(row.notes || "").match(/;\s*source\s+(.+?)(?:;|$)/i)?.[1]?.trim();
      const direct = sourceId && receiptById.get(sourceId);
      const candidates = generatedSource ? receiptDetails.filter((item) => String(item.partCode || "").trim() === generatedSource && (!row.customerCode || !item.customerCode || String(item.customerCode) === String(row.customerCode))) : [];
      const source = direct || candidates.sort((left, right) => Math.abs(new Date(left.startDate).getTime() - new Date(row.startDate).getTime()) - Math.abs(new Date(right.startDate).getTime() - new Date(row.startDate).getTime()))[0];
      return source && isFinishedGood(source) ? source : null;
    };
    const planPartRow = (row) => {
      const source = sourceFinishedGood(row);
      const part = source || row;
      return { code: part.partCode || "Tanpa Part", name: part.part?.partName || part.part?.partNumber || "", label: isFinishedGood(part) ? "Finished Good" : "Part" };
    };
    const finishedGoodCode = (row) => planPartRow(row).code;
    const finishedGoodName = (row) => planPartRow(row).name;
    // Offset is not unique in legacy documents (both rows may have offset=1),
    // therefore include the actual schedule month in the parent lookup key.
    const sourceFinishedGoods = new Map(receiptDetails.map((row) => [
      `${row.customerCode || "Tanpa Customer"}|${row.partCode}|${scheduleMonthKey(row)}`,
      row,
    ]));
    const finishedGoodMonth = (row) => {
      const source = sourceFinishedGoods.get(`${row.customerCode || "Tanpa Customer"}|${finishedGoodCode(row)}|${scheduleMonthKey(row)}`);
      return source ? scheduleDate(source) : scheduleDate(row);
    };
    const visibleDetails = preparePlanningView(allVisibleDetails, {
      customer: (row) => row.customerCode,
      month: (row) => finishedGoodMonth(row),
      part: (row) => row.partCode,
      parentFg: (row) => finishedGoodCode(row),
      fixedGrouping: true,
    });
    const groupedRows = customGroupedPlanningRows(visibleDetails, {
      colSpan: 21,
      customer: (row) => row.customerCode,
      month: finishedGoodMonth,
      planPart: (row) => row.partCode,
      parentFg: finishedGoodCode,
      planPartLabel: "Part",
      planPartLabelFor: () => "Part",
      planPartDisplay: (value, rows) => ({ code: value, name: rows[0]?.part?.partName || rows[0]?.part?.partNumber || "" }),
      parentFgDisplay: (value, rows) => ({ code: value, name: finishedGoodName(rows[0] || {}) }),
      planPartInItems: true,
      renderItems: (group) => {
        const partGroups = new Map();
        const hierarchyFor = (item) => {
          if (!isGeneratedProcess(item)) return { level: 0, treePath: `0000|${item.partCode}`, parentPartCode: null, parentPartName: null };
          const trace = item.bomHierarchy || (item.mrpNettingTrace || [])[0] || {};
          const level = Math.max(number(trace.level ?? trace.levelMBOM ?? item.part?.bomLevel ?? item.part?.componentLevel), 1);
          return {
            level,
            treePath: trace.treePath || `9999|${String(level).padStart(4, "0")}|${item.partCode}`,
            parentPartCode: trace.parentPartCode || trace.parentRequirement?.partCode || null,
            parentPartName: trace.parentPartName || trace.parentRequirement?.part?.partName || null,
          };
        };
        for (const item of group) {
          const productionLevel = !isGeneratedProcess(item)
            ? "FG Receipt"
            : isChildFgReceipt(item)
              ? "Child FG Receipt"
              : "Child / SFG Process";
          const hierarchy = hierarchyFor(item);
          const partKey = `${productionLevel}|${item.partCode}|${hierarchy.treePath}`;
          if (!partGroups.has(partKey)) partGroups.set(partKey, { first: item, productionLevel, hierarchy, items: [] });
          partGroups.get(partKey).items.push(item);
        }
        // Display the BOM hierarchy from its parent receipt down to the deepest
        // nested component. This is a structural view, not execution order.
        // Nested BOM execution is bottom-up. processSequence (10/20/30) is
        // local to one BOM and must not outrank the global BOM/component level;
        // otherwise SPOT/WELD incorrectly move above the nested PRG receipt.
        const processDepth = (row) => Math.max(
          number(row?.part?.bomLevel),
          number(row?.part?.componentLevel),
        );
        return [...partGroups.values()].sort((a, b) => {
          const aMainReceipt = a.productionLevel === "FG Receipt";
          const bMainReceipt = b.productionLevel === "FG Receipt";
          // Present the parent BOM receipt as the header row, followed by its
          // nested bottom-up execution chain.
          if (aMainReceipt !== bMainReceipt) return aMainReceipt ? -1 : 1;
          return String(a.hierarchy.treePath).localeCompare(String(b.hierarchy.treePath))
            || a.hierarchy.level - b.hierarchy.level
            || processDepth(a.first) - processDepth(b.first)
            || number(a.first?.part?.processSequence) - number(b.first?.part?.processSequence)
            || String(a.first.partCode).localeCompare(String(b.first.partCode));
        }).map(({ first, productionLevel, hierarchy, items }) => {
          const detailIds = items.map((row) => row.id).filter(Boolean);
          const generatedLine = productionLevel !== "FG Receipt";
          const parent = generatedLine ? sourceFinishedGood(first) : null;
          const sourcePartForBuffer = String(first.notes || "").match(/;\s*source\s+(.+?)(?:;|$)/i)?.[1]?.trim();
          const bufferParent = parent || (generatedLine ? nearestParent(first.customerCode, sourcePartForBuffer, first) : null);
          const totalQty = items.reduce((sum, row) => sum + number(row.qtyPlanned), 0);
          const forecastQty = items.reduce((sum, row) => sum + number(row.forecastQty), 0);
          const salesOrderQty = items.reduce((sum, row) => sum + number(row.actualSalesOrderQty), 0);
          const bufferQty = items.reduce((sum, row) => sum + number(row.bufferQty), 0) || number(bufferParent?.bufferQty);
          const bufferPercent = [...new Set(items.map((row) => number(row.bufferPercent)).concat(bufferParent ? [number(bufferParent.bufferPercent)] : []))];
          const productionPercent = [...new Set(items.map((row) => number(row.productionPercent ?? 100)).concat(bufferParent ? [number(bufferParent.productionPercent ?? 100)] : []))];
          const start = items.reduce((value, row) => !value || new Date(scheduleDate(row)) < new Date(value) ? scheduleDate(row) : value, null);
          const end = items.reduce((value, row) => !value || new Date(scheduleEndDate(row)) > new Date(value) ? scheduleEndDate(row) : value, null);
          const statuses = [...new Set(items.map((row) => row.status || "Planned"))];
          const treeLevel = Math.min(Math.max(number(hierarchy.level), 0), 14);
          const parentLabel = hierarchy.parentPartCode
            ? `<small class="ppic-tree-parent">Parent: ${esc(hierarchy.parentPartCode)}${hierarchy.parentPartName ? ` · ${esc(hierarchy.parentPartName)}` : ""}</small>`
            : '<small class="ppic-tree-parent">Root FG</small>';
          const partCodeCell = `<div class="ppic-mps-tree-code" style="--bom-level:${treeLevel}" data-bom-level="${treeLevel}"><span class="ppic-tree-connector" aria-hidden="true">${treeLevel ? "└─" : "●"}</span><span><b>${esc(first.partCode || "-")}</b>${parentLabel}</span></div>`;
          const partNameCell = `${esc(first.part?.partName || first.part?.partNumber || "-")}${first.part?.partNumber ? `<small class="ppic-cell-sub">Part Number: ${esc(first.part.partNumber)}</small>` : ""}`;
          const processPath = Array.isArray(first.processPath) ? first.processPath : [];
          const processCell = productionLevel === "Child FG Receipt"
            ? `Receipt ${esc(first.mbom?.noReg || first.partCode || "nested BOM")}`
            : processPath.length
            ? processPath.map((item, index) => `${esc(item.routingNumber || item.sequence || (index + 1))}. ${esc(item.name || "Process")}${item.occurrenceCode ? ` (${esc(item.occurrenceCode)})` : ""}`).join(" → ")
            : "-";
          const bufferLabel = productionLevel === "FG Receipt" ? `${num(bufferPercent.length === 1 ? bufferPercent[0] : 0, 2)}%` : "-";
          const soReferences = [...new Set(items.flatMap((row) => String(row.soNumber || "").split(",")).map((value) => value.trim()).filter(Boolean))];
          const editable = productionLevel === "FG Receipt";
          const forecastNumber = editable ? (first.forecastDetail?.forecastNumber || doc.forecastNumber) : null;
          const forecastReferenceCell = forecastNumber
            ? `<a href="/modules/sales/forecasts/${encodeURIComponent(forecastNumber)}">${esc(forecastNumber)}</a>`
            : "-";
          const soReferenceCell = editable && soReferences.length
            ? `<div class="ppic-so-reference">${soReferences.map((so) => `<a href="/modules/sales/sales-orders/${encodeURIComponent(so)}">${esc(so)}</a>`).join("")}</div>`
            : "-";
          const customerPhases = (doc.deliveryPlans || []).filter((phase) =>
            String(phase.targetType || "").toUpperCase() === "CUSTOMER"
            && phase.status !== "Cancelled"
            && detailIds.includes(phase.mpsDetailId));
          const allocatedByDetailId = new Map();
          customerPhases.forEach((phase) => allocatedByDetailId.set(
            phase.mpsDetailId,
            number(allocatedByDetailId.get(phase.mpsDetailId)) + number(phase.qtyPlanned),
          ));
          const deliveryTarget = items.find((row) =>
            number(row.qtyPlanned) - number(allocatedByDetailId.get(row.id)) > 0.000001);
          const allocatedDeliveryQty = customerPhases.reduce((sum, phase) => sum + number(phase.qtyPlanned), 0);
          const remainingDeliveryQty = Math.max(totalQty - allocatedDeliveryQty, 0);
          const canEditDelivery = false;
          const phaseRows = customerPhases.map((phase) => `<div class="ppic-delivery-inline-phase"><span><b>Phase ${num(phase.phaseNumber)}</b> · ${date(phase.plannedDate)} · ${num(phase.qtyPlanned, 3)} ${esc(phase.uomCode || "")}</span>${canEditDelivery ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-delivery-phase" data-phase-id="${esc(phase.id)}" title="Batalkan phase">×</button>` : ""}</div>`).join("");
          const deliveryCell = editable
            ? `<div class="ppic-delivery-inline">${phaseRows || `<small class="ppic-cell-sub">Belum ada target Marketing</small>`}<small class="ppic-cell-sub">Terjadwal ${num(allocatedDeliveryQty, 3)} / ${num(totalQty, 3)} · sumber Forecast/SO</small></div>`
            : "-";
          const bufferScope = first.bufferReferenceScope === "LINE" ? "line" : "parent";
          const bufferValue = bufferPercent.length === 1 ? bufferPercent[0] : 0;
          const productionValue = productionPercent.length === 1 ? productionPercent[0] : 100;
          const adjustmentData = `data-action="edit-mps-adjustment" data-mps-number="${esc(doc.mpsNumber)}" data-detail-ids="${esc(detailIds.join(","))}" data-part-code="${esc(first.partCode)}" data-buffer-percent="${esc(bufferValue)}" data-production-percent="${esc(productionValue)}" data-scope="${esc(bufferScope)}"`;
          const bufferCell = editable ? `<div class="ppic-percent-cell"><b>${num(bufferValue, 2)}%</b><small class="ppic-buffer-source">${items.some((row) => row.bufferOverridden) ? (bufferScope === "parent" ? "Override Parent FG" : "Override per baris") : "Master FG"}</small><button type="button" class="ppic-percent-edit" ${adjustmentData} data-focus="buffer">Edit</button></div>` : `<span>${num(bufferValue, 2)}%</span><small class="ppic-buffer-source">Ikut parent FG</small>`;
          const productionCell = editable ? `<div class="ppic-percent-cell"><b>${num(productionValue, 2)}%</b><small class="ppic-buffer-source">Minimum SO</small><button type="button" class="ppic-percent-edit" ${adjustmentData} data-focus="production">Edit</button></div>` : `<span>${num(productionValue, 2)}%</span><small class="ppic-buffer-source">Ikut parent FG</small>`;
          // Inventory position is repeated on each MPS detail for the same
          // part. Use one snapshot instead of summing it per process line.
          const mpsNettingV2 = items.some((row) => number(row.calculationTrace?.version) >= 2);
          const stockAvailable = mpsNettingV2 ? Math.max(0, ...items.map((row) => number(row.openingAvailableQty))) : Math.max(0, ...items.map((row) => number(row.stockAvailableQty)));
          const stockOnHand = Math.max(0, ...items.map((row) => number(row.stockOnHandQty)));
          const stockReserved = Math.max(0, ...items.map((row) => number(row.stockReservedQty)));
          const effectiveDemand = forecastQty + bufferQty;
          const formulaUom = first.uomCode || first.part?.uomCode || "pcs";
          const formulaReferenceId = `mps:${doc.mpsNumber}:${first.partCode}:${formulaReferenceStore.size}`;
          const stockLines = [...new Map(items.flatMap((item) => item.stockBreakdown?.lines || []).map((line) => [line.stockBalanceId || `${line.warehouseCode}|${line.rackCode}|${line.lotNumber}`, line])).values()];
          const openingAvailable = stockAvailable;
          const firmScheduledReceipt = Math.max(0, ...items.map((row) => number(row.firmScheduledReceiptQty)));
          const targetEndingStock = Math.max(0, ...items.map((row) => number(row.targetEndingStockQty)));
          const projectedEndingStock = Math.max(0, ...items.map((row) => number(row.projectedEndingStockQty)));
          const forecastNumbers = [...new Set(items.map((item) => item.forecastDetail?.forecastNumber || doc.forecastNumber).filter(Boolean))];
          const mrpTraceRows = [...new Map(items.flatMap((item) => item.mrpNettingTrace || []).map((trace) => [trace.id, trace])).values()];
          const nettingFactors = generatedLine && mrpTraceRows.length
            ? mrpTraceRows.map((trace) => {
              const gross = number(trace.grossRequirement);
              const net = number(trace.netRequirement);
              const covered = Math.max(gross - net, 0);
              const ratio = number(trace.mbomDetail?.qty) || 1;
              const parentDriver = trace.parentRequirement ? gross / ratio : 0;
              const parentReduction = trace.parentRequirement ? Math.max(number(trace.parentRequirement.grossRequirement) - parentDriver, 0) : 0;
              return {
                title: `Level ${num(trace.levelMBOM)} · ${trace.partCode} · Produksi`,
                meta: `${trace.parentRequirement ? `Driver ${trace.parentRequirement.partCode} ${num(parentDriver, 3)} dari gross ${num(trace.parentRequirement.grossRequirement, 3)}${parentReduction > 0 ? `; berkurang ${num(parentReduction, 3)} karena stock/supply parent` : ""}. × rasio BOM ${num(ratio, 6)} = gross ${num(gross, 3)}.` : `Gross kebutuhan ${num(gross, 3)}.`} Stock ${trace.partCode} menutup ${num(covered, 3)} sehingga net proses ${num(net, 3)}.`,
                qty: `Jadwal MPS ${num(totalQty, 3)} ${formulaUom}`,
                href: trace.runNumber ? `/modules/planning-ppic/mrp/${encodeURIComponent(trace.runNumber)}` : `/modules/inventory/stock-balances?q=${encodeURIComponent(trace.partCode)}`,
              };
            })
            : generatedLine
              ? [{
                title: `${productionLevel} · ${first.partCode} · Produksi`,
                meta: `Jadwal child ${num(totalQty, 3)} ${formulaUom} adalah hasil BOM explosion dan netting stock/WIP pada MRP ${first.mrpRunNumber || "terkait"}. Run lama yang belum menyimpan intermediate requirement tidak mempunyai rincian angka gross dan pengurang per level; run berikutnya menyimpan jejak lengkapnya.`,
                qty: `Jadwal MPS ${num(totalQty, 3)} ${formulaUom}`,
                href: first.mrpRunNumber ? `/modules/planning-ppic/mrp/${encodeURIComponent(first.mrpRunNumber)}` : `/modules/inventory/stock-balances?q=${encodeURIComponent(first.partCode)}`,
              }]
              : [{
                title: `Level 0 · ${first.partCode} · Target FG`,
                meta: `MPS menetapkan gross target ${num(totalQty, 3)} dari forecast, buffer, dan minimum SO. Stock FG ${num(stockAvailable, 3)} tidak dikurangkan di MPS; stock dinetting satu kali pada MRP.`,
                qty: `Target ${num(totalQty, 3)} ${formulaUom}`,
                href: `/modules/inventory/stock-balances?q=${encodeURIComponent(first.partCode)}`,
              }];
          const resolvedNettingFactors = generatedLine || !mpsNettingV2 ? nettingFactors : [{
            title: `Level 0 · ${first.partCode} · Net MPS`,
            meta: `Opening ${num(openingAvailable, 3)} + firm receipt ${num(firmScheduledReceipt, 3)} + net produksi ${num(totalQty, 3)} - gross demand ${num(forecastQty, 3)} = projected akhir ${num(projectedEndingStock, 3)}. Target stok akhir ${num(targetEndingStock, 3)}.`,
            qty: `Net produksi ${num(totalQty, 3)} ${formulaUom}`,
            href: `/modules/inventory/stock-balances?q=${encodeURIComponent(first.partCode)}`,
          }];
          formulaReferenceStore.set(formulaReferenceId, {
            nettingFactors: resolvedNettingFactors,
            calculationSteps: first.calculationTrace?.steps || [],
            demands: items.map((item) => ({
              title: generatedLine ? `${finishedGoodCode(item)} → ${item.partCode}` : item.partCode,
              meta: generatedLine ? `${productionLevel} · hasil BOM explosion · ${processCell === "-" ? "tanpa routing" : "mengikuti routing part"}` : `Demand FG periode ${month(scheduleDate(item))} · Buffer base dari forecast bulan berikutnya`,
              qty: `${num(item.qtyPlanned, 3)} ${item.uomCode || formulaUom}`,
              href: generatedLine ? `/modules/manufacturing-bom/bill-of-materials?q=${encodeURIComponent(finishedGoodCode(item))}` : null,
            })),
            demandDocuments: [
              ...forecastNumbers.map((forecastNumber) => ({ title: forecastNumber, meta: `Forecast ${month(scheduleDate(first))} · qty ${num(forecastQty, 3)} ${formulaUom}`, qty: `${num(forecastQty, 3)} ${formulaUom}`, href: `/modules/sales/forecasts/${encodeURIComponent(forecastNumber)}` })),
              ...soReferences.map((so) => ({ title: so, meta: "Actual Sales Order sebagai target minimum", qty: `${num(salesOrderQty, 3)} ${formulaUom}`, href: `/modules/sales/sales-orders/${encodeURIComponent(so)}` })),
            ],
            warehouseStock: stockLines.map((line) => ({
              title: [line.warehouseCode || "Warehouse", line.rackCode, line.lotNumber ? `Lot ${line.lotNumber}` : "Tanpa lot"].filter(Boolean).join(" / "),
              meta: `${line.stockType || "Stock"} · OH ${num(line.qtyOnHand, 3)} · RSV ${num(line.qtyReserved, 3)} · QC ${num(line.qtyQC, 3)}`,
              qty: `${num(line.qtyAvailable, 3)} ${line.uomCode || formulaUom}`,
              href: `/modules/inventory/stock-balances?q=${encodeURIComponent(line.lotNumber || first.partCode)}`,
            })),
            wipStock: [],
            purchaseOrders: [],
          });
          const formulaData = `data-action="show-formula-reference" data-formula-reference-id="${esc(formulaReferenceId)}" data-formula-scope="mps" data-generated-process="${generatedLine ? "true" : "false"}" data-part-code="${esc(first.partCode)}" data-uom="${esc(formulaUom)}" data-forecast="${esc(forecastQty)}" data-buffer-base="${esc(bufferParent?.bufferBaseQty || forecastQty)}" data-buffer-percent="${esc(bufferValue)}" data-stock-available="${esc(stockAvailable)}" data-opening-available="${esc(openingAvailable)}" data-firm-receipt="${esc(firmScheduledReceipt)}" data-target-ending="${esc(targetEndingStock)}" data-projected-ending="${esc(projectedEndingStock)}" data-buffer-qty="${esc(bufferQty)}" data-effective-demand="${esc(effectiveDemand)}" data-production-percent="${esc(productionValue)}" data-actual-sales-order="${esc(salesOrderQty)}" data-target="${esc(totalQty)}"`;
          const mbom = first.mbom || null;
          const bomRevisionCell = mbom
            ? `<a href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(mbom.noReg)}"><b>Rev ${esc(first.mbomRevisionSnapshot ?? mbom.revision ?? "-")}</b><small>${esc(first.mbomNoRegSnapshot || mbom.noReg)}</small><small>${esc(first.mbomSelectionMode === "MANUAL_OVERRIDE" ? "Manual override" : `Auto · acuan ${date(first.mbomSelectionDate || first.fgRequiredDate || first.startDate)}`)}</small></a>${first.mbomSelectionWarning ? `<small class="ppic-conversion-warning">${esc(first.mbomSelectionWarning)}</small>` : ""}`
            : `<span class="ppic-conversion-warning">BOM belum terpilih</span>`;
          return `<tr class="ppic-mps-process-row"><td>${badge(productionLevel)}</td><td>${partCodeCell}</td><td>${partNameCell}</td><td>${processCell}</td><td>${esc(period(start, end))}</td><td>${bomRevisionCell}</td><td>${forecastReferenceCell}</td><td class="ppic-number">${num(forecastQty, 2)}</td><td>${soReferenceCell}</td><td class="ppic-number ppic-actual-so">${num(salesOrderQty, 2)}</td><td class="ppic-number ppic-stock-available"><b>${num(stockAvailable, 3)}</b></td><td class="ppic-number ppic-stock-on-hand">${num(stockOnHand, 3)}</td><td class="ppic-number ppic-stock-reserved">${num(stockReserved, 3)}</td><td>${bufferCell}</td><td class="ppic-number ppic-buffer-qty">${num(bufferQty, 2)}</td><td>${productionCell}</td><td class="ppic-number ppic-plan-qty">${num(totalQty, 2)}</td><td>${esc(first.customerCode)}</td><td>${deliveryCell}</td><td class="ppic-number">${num(Math.min(...items.map((row) => number(row.priority) || 1)))}</td><td>${badge(statuses.length === 1 ? statuses[0] : "Mixed")}</td><td class="ppic-formula-help-cell"><button type="button" class="ppic-formula-help" ${formulaData} aria-label="Lihat rumus MPS ${esc(first.partCode)}">?</button></td></tr>`;
        });
      },
    }, ["customer", "month"]);
    const productionPlans = doc.productionPlans || [];
    const productionLinks = productionPlans.length ? productionPlans.map((plan) => `<a href="/modules/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}">${esc(plan.planNumber)} (${num(plan._count?.details)} baris)</a>`).join("<br>") : "<strong>-</strong>";
    const horizonRows = allVisibleDetails;
    const horizonStart = horizonRows.reduce((value, row) => !value || new Date(scheduleDate(row)) < new Date(value) ? scheduleDate(row) : value, null) || doc.periodStart;
    const horizonEnd = horizonRows.reduce((value, row) => !value || new Date(scheduleEndDate(row)) > new Date(value) ? scheduleEndDate(row) : value, null) || doc.periodEnd;
    const cycleNumbers = doc.planningCycle?.mpsNumbers || [doc.mpsNumber];
    setInfo("Informasi MPS", [["Planning Cycle", cycleNumbers.join(" + ")], ["Produk Utama", primaryPart], ["Sumber Forecast", doc.forecastNumber || "-"], ["Horizon Perencanaan", period(doc.planningCycle?.periodStart || horizonStart, doc.planningCycle?.periodEnd || horizonEnd)], ["Output Production Planning", productionLinks, true], ["Status Cycle", badge(doc.planningCycle?.status || doc.status), true]]);
    const totalBufferQty = receiptDetails.reduce((sum, row) => sum + number(row.bufferQty), 0);
    setTable("FG Receipt & Child / SFG Process Schedule", ["Tipe", "Part Code", "Part Name", "Proses", "Periode / Schedule", "BOM Revision", "Forecast Ref", "Forecast Qty", "SO Ref", "Actual SO", "Opening Available", "On Hand", "Reserved", "Buffer %", "Target Akhir", "Produksi %", "Net Produksi MPS", "Customer", "Delivery Customer", "Prioritas", "Status", "Formula"], groupedRows, { minWidth: 2020 });
    const readiness = doc.readiness || { ok: true, blockingCount: 0, warningCount: 0, issues: [] };
    const phases = (Array.isArray(doc.deliveryPlans) ? doc.deliveryPlans : [])
      .filter((item) => String(item.targetType || "").toUpperCase() === "CUSTOMER");
    const phaseText = phases.length ? phases.map((item) => `#${item.phaseNumber} ke Customer ${item.targetCode} · ${item.partCode} · ${num(item.qtyPlanned, 2)} ${item.uomCode || ""} · ${date(item.plannedDate)}`).join("\n") : "Belum ada phase delivery customer.";
    setSummary("Kalkulasi Rencana Produksi", [["Target FG Receipt", num(qty, 2)], ["Buffer Stock MPS", num(totalBufferQty, 2)], ["Production Planning", `${num((doc.productionPlans || []).length)} plan`], ["Jumlah Customer", num(customerCount)], ["Jumlah Bulan", num(monthCount)], ["Child FG Receipt", `${num(childReceiptCount)} baris`], ["Child / SFG Process", `${num(childCount)} baris`], ["Phase Delivery", `${num(phases.length)} phase`], ["Readiness", readiness.ok ? "Ready" : `${num(readiness.blockingCount)} blocker`], ["Warning Supplier", num(readiness.warningCount)]], `${phaseText}\n\nFG utama menjadi target demand. FG dari nested BOM ditampilkan sebagai receipt antara, bukan demand tambahan. Readiness memeriksa UOM, routing, mesin, cycle time, dan supplier sebelum MPS dikonfirmasi.`);
    renderMpsPlanner(doc, activePlannerView === "matrix" ? "matrix" : activePlannerView);
    renderReadinessLinks(readiness);
    renderWorkflow(doc, baseWorkflow(doc, "Production Release"), ["DRAFT", "PLANNER", "PPIC", String(doc.status || "DRAFT").toUpperCase()]);
  }
  function renderMonthly(doc) {
    const details = Array.isArray(doc.details) ? doc.details : [];
    const isProcess = (row) => String(row.notes || "").includes("[MRP-PRODUCTION]");
    const isChildReceipt = (row) => isProcess(row)
      && String(row.part?.itemType || row.itemType || "").trim().toUpperCase() === "FG";
    const receiptDetails = details.filter((row) => !isProcess(row));
    const target = receiptDetails.reduce((sum, row) => sum + number(row.qtyPlanned), 0);
    const actual = receiptDetails.reduce((sum, row) => sum + number(row.qtyReleased), 0);
    const bufferQty = receiptDetails.reduce((sum, row) => sum + number(row.bufferQty), 0);
    const forecastQty = receiptDetails.reduce((sum, row) => sum + number(row.forecastQty), 0);
    const actualSalesOrderQty = receiptDetails.reduce((sum, row) => sum + number(row.actualSalesOrderQty), 0);
    const visibleDetails = preparePlanningView(details, {
      customer: (row) => row.planningCustomerCode,
      month: (row) => row.planningMonth || doc.planMonth,
      part: (row) => row.partCode,
      parentFg: (row) => row.parentFgPartCode || row.partCode,
    });
    const renderPlanRow = (row) => {
      const achievement = number(row.qtyPlanned) ? Math.round(number(row.qtyReleased) / number(row.qtyPlanned) * 100) : 0;
      const receipt = !isProcess(row);
      const type = receipt ? "FG Receipt" : isChildReceipt(row) ? "Child FG Receipt" : "Child / SFG Process";
      const remaining = Math.max(number(row.qtyPlanned) - number(row.qtyReleased), 0);
      const traces = (row.manufacturingOrders || []).map((mo) => {
        const dpp = mo.dailyProductionPlans || [];
        const dppLabel = dpp.length
          ? `<small class="d-block text-muted">DPP ${dpp.length} hari · ${dpp.map((item) => esc(item.scheduleNumber)).join(", ")}</small>`
          : `<small class="d-block text-warning">DPP belum dibuat</small>`;
        return `<a href="/modules/production/manufacturing-orders/${encodeURIComponent(mo.moNumber)}">${esc(mo.moNumber)} · ${num(mo.qtyPlanned, 2)} · ${esc(mo.status)}</a>${dppLabel}`;
      }).join("<br>");
      const releaseInput = ["Released", "In Progress"].includes(doc.status) && remaining > 0
        ? `<div class="ppic-buffer-editor"><input data-mpp-release-qty data-line-number="${esc(row.lineNumber)}" type="number" min="0" max="${esc(remaining)}" step="0.001" value="${esc(remaining)}"><small class="ppic-cell-sub">Release MO · sisa ${num(remaining, 2)} ${esc(row.uomCode || "")}</small></div>`
        : "";
      const reference = `${traces || esc(row.manufacturingOrderNumber || row.plannedOrderNumber || row.mpsDetailId || "-")}${releaseInput}`;
      return `<tr><td>${badge(type)}</td><td><b>${esc(row.partCode)}</b><small class="ppic-cell-sub">Part Number: ${esc(row.partNumber || row.part?.partNumber || "—")}</small></td><td>${reference}</td><td class="ppic-number">${receipt ? num(row.forecastQty, 2) : "-"}</td><td class="ppic-number ppic-actual-so">${receipt ? num(row.actualSalesOrderQty, 2) : "-"}</td><td class="ppic-number">${receipt ? `${num(row.bufferPercent, 2)}%` : "-"}</td><td class="ppic-number ppic-buffer-qty">${receipt ? num(row.bufferQty, 2) : "-"}</td><td class="ppic-number">${receipt ? `${num(row.productionPercent ?? 100, 2)}%` : "-"}</td><td class="ppic-number">${num(row.qtyPlanned, 2)} ${esc(row.uomCode || "")}</td><td class="ppic-number">${num(row.qtyReleased, 2)} ${esc(row.uomCode || "")}</td><td class="ppic-number ppic-achievement ${achievement >= 100 ? "over" : achievement >= 90 ? "good" : "warn"}">${num(achievement)}%</td><td>${progressBar(achievement)}</td></tr>`;
    };
    const groupedRows = groupedPlanningRows(visibleDetails, {
      colSpan: 12,
      customer: (row) => row.planningCustomerCode,
      month: (row) => row.planningMonth || doc.planMonth,
      planPart: (row) => row.partCode,
      parentFg: (row) => row.parentFgPartCode || row.partCode,
      planPartLabel: "Part",
      planPartLabelFor: () => "Part",
      planPartDisplay: (value, rows) => ({ code: value, name: rows[0]?.part?.partName || rows[0]?.part?.partNumber || "" }),
      parentFgDisplay: (value, rows) => ({ code: value, name: rows[0]?.parentFgPartName || "" }),
      planPartInItems: true,
      renderItems: (group) => group.map(renderPlanRow),
    });
    setInfo("Informasi Rencana Produksi Bulanan", [["Rencana ID", doc.planNumber], ["Bulan Target", month(doc.planMonth)], ["Periode", period(doc.periodStart, doc.periodEnd)], ["Sumber Data", doc.sourceType || "Planned Order"], ["Jumlah Baris", num(details.length)], ["Status Plan", badge(doc.status), true]]);
    setTable("Target Receipt & Proses Produksi", ["Tipe", "ID Produk", "MO / Referensi & Partial Release", "Forecast", "Actual SO", "Buffer %", "Buffer Qty", "Produksi %", "Target Plan", "Realisasi", "Achievement", "Progress Visual"], groupedRows);
    const readiness = doc.materialReadiness || { ready: false, summary: { blocking: 0, warning: 0 } };
    setSummary("Resource Summary & Utilisation", [["Forecast FG", num(forecastQty, 2)], ["Actual SO", num(actualSalesOrderQty, 2)], ["Buffer Stock", num(bufferQty, 2)], ["Total Target", num(target, 2)], ["Total Realisasi", num(actual, 2)], ["Outstanding", num(Math.max(target - actual, 0), 2)], ["Stock Covered", num(readiness.summary?.stockCoveredQty)], ["Stock Shortage", num(readiness.summary?.stockShortageQty)], ["Material Blocking", num(readiness.summary?.blocking)], ["Material Warning", num(readiness.summary?.warning)], ["Achievement", `${target ? num(actual / target * 100, 1) : 0}%`], ["Confirmed By", doc.confirmedBy || "-"], ["Released By", doc.releasedBy || "-"]], doc.notes);
    renderWorkflow(doc, baseWorkflow(doc, "Factory Release"), ["DRAFT", "PPIC", "FACTORY", String(doc.status || "DRAFT").toUpperCase()]);
  }
  function renderConsume(doc) {
    const details = Array.isArray(doc.details) ? doc.details : [];
    const qty = details.reduce((sum, row) => sum + number(row.forecastQty), 0);
    const partCount = new Set(details.map((row) => row.partCode)).size;
    setInfo("Informasi Forecast", [["Forecast ID", doc.forecastNumber], ["Periode", period(doc.periodStart, doc.periodEnd)], ["Customer", doc.customerCode || "-"], ["Source Data", "Sales Forecast"], ["Jumlah Part", num(partCount)], ["Status", badge(doc.status), true]]);
    setTable("Forecast Consumption Detail", ["Kode Part", "Part Number", "Nama Part", "Bulan Forecast", "Forecast Qty", "UOM", "Catatan"], details.map((row) => `<tr><td><b>${esc(row.partCode)}</b></td><td>${esc(row.part?.partNumber || "—")}</td><td>${esc(row.part?.partName || row.part?.partNumber || "-")}</td><td>${esc(month(row.forecastMonth))}</td><td class="ppic-number ppic-plan-qty">${num(row.forecastQty, 2)}</td><td>${esc(row.uomCode)}</td><td>${esc(row.notes)}</td></tr>`));
    setSummary("Assumptions & Planning Notes", [["Total Forecast", num(qty, 2)], ["Jumlah Part", `${num(partCount)} part`], ["Nama Forecast", doc.forecastName || "-"], ["Dibuat Oleh", doc.createdBy || "-"], ["Disetujui Oleh", doc.approvedBy || "-"], ["Tanggal Approval", date(doc.approvedDate)]], doc.notes);
    renderWorkflow(doc, baseWorkflow(doc, "Forecast Consumed"), ["DRAFT", "ANALYST", "PPIC", String(doc.status || "DRAFT").toUpperCase()]);
  }

  function renderMonthlyConsumption(doc) {
    const summary = doc.summary || {};
    const lines = Array.isArray(doc.lines) ? doc.lines : [];
    $("ppic-detail-title").textContent = `Detail Consume Forecast ${month(doc.month)}`;
    $("ppic-detail-key").textContent = String(doc.month || key).slice(0, 7);
    const workflowTitle = document.querySelector(".ppic-workflow-card > h2");
    if (workflowTitle) workflowTitle.textContent = "Alur Planning Bulanan";
    const eventLabels = {
      FORECAST: "Forecast Customer",
      SALES_ORDER: "SO / Delivery",
      PRODUCTION: "Target Produksi",
      CUSTOMER_DELIVERY: "Delivery Customer",
      MATERIAL_PURCHASE: "Pembelian Material",
    };
    const eventBadges = {
      FORECAST: "info",
      SALES_ORDER: "confirmed",
      PRODUCTION: "in-production",
      CUSTOMER_DELIVERY: "ready-to-deliver",
      MATERIAL_PURCHASE: "planned",
    };
    const sourceLink = (line) => {
      const sourceNumber = encodeURIComponent(line.sourceNumber || "");
      if (line.eventType === "FORECAST") return `/modules/sales/forecasts/${sourceNumber}`;
      if (line.eventType === "SALES_ORDER") return `/modules/sales/sales-orders/${sourceNumber}`;
      if (["PRODUCTION", "CUSTOMER_DELIVERY"].includes(line.eventType)) return `/modules/planning-ppic/mps/${sourceNumber}`;
      if (line.eventType === "MATERIAL_PURCHASE") return `/modules/planning-ppic/planned-orders/${sourceNumber}`;
      return "#";
    };
    const actualValue = (line) => {
      if (line.eventType === "FORECAST") return `Consumed ${num(line.consumedQty, 2)}`;
      if (line.eventType === "SALES_ORDER") return `Delivered ${num(line.completedQty, 2)}`;
      if (line.eventType === "CUSTOMER_DELIVERY") return `Phase ${num(line.phaseNumber)}`;
      if (line.eventType === "MATERIAL_PURCHASE") return line.mrpRunNumber ? `<a class="ppic-id" href="/modules/planning-ppic/mrp/${encodeURIComponent(line.mrpRunNumber)}">${esc(line.mrpRunNumber)}</a>` : "MRP -";
      return "Target MPS";
    };
    const balanceValue = (line) => {
      if (line.eventType === "FORECAST") return `Sisa ${num(line.remainingQty, 2)}`;
      if (line.eventType === "SALES_ORDER") return `Open ${num(Math.max(number(line.qty) - number(line.completedQty), 0), 2)}`;
      if (line.eventType === "MATERIAL_PURCHASE") return `Material need ${date(line.requiredDate)}`;
      return "-";
    };
    setInfo("Scope Consume Forecast Bulanan", [
      ["Bulan Kebutuhan", month(doc.month)],
      ["Forecast Released", num(summary.forecastQty, 2)],
      ["Delivery Customer / SO", num(summary.actualSalesOrderQty, 2)],
      ["Target Produksi", num(summary.productionTargetQty, 2)],
      ["Pembelian Material", `${num(summary.materialPartCount)} material / ${num(summary.materialPurchaseOrderCount)} order`],
      ["Status Planning", badge(doc.status), true],
    ]);
    setTable("Timeline Forecast → Produksi → Delivery → Pembelian", ["Jenis Kebutuhan", "Referensi", "Customer", "Part / Material", "Tanggal Bulan Ini", "Qty", "Realisasi / Trace", "Sisa / Required", "Status"], lines.map((line) => `<tr>
      <td><span class="ppic-badge ${eventBadges[line.eventType] || "draft"}">${esc(eventLabels[line.eventType] || line.eventType)}</span></td>
      <td><a class="ppic-id" href="${sourceLink(line)}"><b>${esc(line.sourceNumber)}</b></a>${line.mpsNumber ? `<small class="ppic-cell-sub">MPS ${esc(line.mpsNumber)}</small>` : ""}</td>
      <td>${esc(line.customerCode || "-")}</td>
      <td><b>${esc(line.partCode)}</b><small class="ppic-cell-sub">${esc(line.partName || "-")}</small><small class="ppic-cell-sub">Part Number: ${esc(line.partNumber || line.part?.partNumber || "—")}</small></td>
      <td>${date(line.eventDate)}</td>
      <td class="ppic-number ppic-plan-qty">${num(line.qty, 2)} ${esc(line.uomCode || "")}</td>
      <td>${actualValue(line)}</td>
      <td>${balanceValue(line)}</td>
      <td>${badge(line.status)}</td>
    </tr>`), { minWidth: 1320 });
    setSummary("Ringkasan Consume Forecast Bulanan", [
      ["Total Forecast", num(summary.forecastQty, 2)],
      ["Consumed oleh SO", num(summary.consumedForecastQty, 2)],
      ["Sisa Forecast", num(summary.remainingForecastQty, 2)],
      ["SO Delivery", num(summary.actualSalesOrderQty, 2)],
      ["Customer Delivery Plan", num(summary.customerDeliveryQty, 2)],
      ["Target Produksi", num(summary.productionTargetQty, 2)],
      ["Material Purchase", `${num(summary.materialPurchaseOrderCount)} order`],
      ["Forecast", `${num(summary.forecastCount)} dokumen`],
      ["FG", `${num(summary.fgPartCount)} part`],
      ["Material", `${num(summary.materialPartCount)} part / ${num(summary.materialPurchaseOrderCount)} order`],
      ["MPS", doc.mpsNumber || "Belum dibuat"],
      ["MRP", doc.mrpRunNumber || "Belum dijalankan"],
    ], "Detail hanya menampilkan event yang jatuh pada bulan terpilih. Pembelian material menggunakan planned order date; deadline kebutuhan material tetap tampil pada kolom Required.");
    renderWorkflow(doc, [
      { done: number(summary.forecastQty) > 0 || number(summary.actualSalesOrderQty) > 0, title: "Demand bulan ini", actor: `${num(summary.forecastCount)} forecast · ${num(summary.actualSalesOrderQty, 2)} SO`, at: doc.periodStart },
      { done: Boolean(doc.mpsNumber), title: doc.mpsNumber ? `Produksi ${doc.mpsNumber}` : "MPS belum dibuat", actor: `${num(summary.productionTargetQty, 2)} target produksi`, at: doc.periodStart },
      { done: Boolean(doc.mrpRunNumber), title: doc.mrpRunNumber ? `Pembelian ${doc.mrpRunNumber}` : "MRP belum dijalankan", actor: `${num(summary.materialPurchaseOrderCount)} planned purchase`, at: doc.periodEnd },
    ], ["FORECAST / SO", "MPS PRODUKSI", "MRP MATERIAL", String(doc.status || "OPEN").toUpperCase()]);
  }
  function render(doc) {
    currentDoc = doc;
    formulaReferenceStore.clear();
    setExcelTable(true);
    $("ppic-detail-title").textContent = config.title;
    $("ppic-detail-key").textContent = key;
    headerActions(doc);
    renderPlanningFlow(doc);
    if (tab === "mrp") renderMrp(doc);
    else if (tab === "mps") renderMps(doc);
    else if (tab === "monthly-plan") renderMonthly(doc);
    else if (doc.viewType === "MONTHLY_CONSUMPTION") renderMonthlyConsumption(doc);
    else renderConsume(doc);
    $("ppic-detail-loading").classList.add("d-none");
    $("ppic-detail-shell").classList.remove("d-none");
  }
  async function load() {
    try {
      const [doc, suppliers, parts, supplierItems] = await Promise.all([
        api(tab === "consume-forecast" ? `/modules/api/planning-ppic/consume-forecast/monthly/${encodeURIComponent(key)}` : `/modules/api/planning-ppic/${config.endpoint}/${encodeURIComponent(key)}`),
        tab === "mrp" ? api("/master-data/api/suppliers?start=0&length=500&isDeleted=false") : Promise.resolve([]),
        tab === "mrp" ? api("/master-data/api/parts?start=0&length=1000&isDeleted=false") : Promise.resolve([]),
        tab === "mrp" ? api("/master-data/api/foundation/supplier-items?isActive=true") : Promise.resolve([]),
      ]);
      supplierCatalog = Array.isArray(suppliers) ? suppliers : (suppliers.data || suppliers.items || []);
      partCatalog = Array.isArray(parts) ? parts : (parts.data || parts.items || []);
      supplierItemCatalog = Array.isArray(supplierItems) ? supplierItems : (supplierItems.data || supplierItems.items || []);
      render(doc);
    } catch (error) {
      $("ppic-detail-loading").classList.add("d-none");
      showAlert(error.message);
    }
  }
  document.addEventListener("input", (event) => {
    if (event.target.id === "mrp-planner-search") {
      const query = String(event.target.value || "").trim().toLowerCase();
      document.querySelectorAll("[data-planner-material]").forEach((row) => { row.style.display = !query || row.dataset.plannerMaterial.includes(query) ? "" : "none"; });
      return;
    }
    const row = event.target.closest("[data-procurement-row]");
    if (!row) return;
    if (!event.target.matches("[data-procurement-package-qty], [data-procurement-conversion-factor], [data-allocation-qty]")) return;
    if (row.dataset.rawMaterial !== "true") return;
    const packageQty = number(row.querySelector("[data-procurement-package-qty]")?.value);
    const conversionFactor = number(row.querySelector("[data-procurement-conversion-factor]")?.value);
    const conversionUom = row.querySelector("[data-procurement-conversion-uom]")?.value || "";
    const purchaseQty = packageQty * conversionFactor;
    const total = row.querySelector("[data-procurement-total]");
    if (total) total.textContent = `${num(purchaseQty, 3)} ${conversionUom}`;
    row.querySelectorAll(".ppic-allocation-line em").forEach((node) => { node.textContent = conversionUom; });
    const allocationQty = [...row.querySelectorAll(".ppic-allocation-line")].filter((line) => line.querySelector("[data-allocation-enabled]")?.checked).reduce((sum, line) => sum + number(line.querySelector("[data-allocation-qty]")?.value), 0);
    const allocationStatus = row.querySelector("[data-allocation-total]");
    if (allocationStatus) {
      allocationStatus.textContent = `Alokasi ${num(allocationQty, 3)} / ${num(purchaseQty, 3)} ${conversionUom}`;
      allocationStatus.classList.toggle("match", Math.abs(allocationQty - purchaseQty) < 0.001);
      allocationStatus.classList.toggle("warning", Math.abs(allocationQty - purchaseQty) >= 0.001);
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "mrp-show-covered") {
      $("mrp-planner-grid-table")?.classList.toggle("show-covered", event.target.checked);
      return;
    }
    if (event.target.id === "ppic-delivery-target-type" || event.target.id === "ppic-delivery-detail") {
      refreshDeliveryFormOptions();
      return;
    }
    if (event.target.id === "ppic-procurement-check-all") {
      document.querySelectorAll("[data-procurement-selected]:not(:disabled)").forEach((field) => { field.checked = event.target.checked; });
      return;
    }
    if (event.target.matches("[data-procurement-conversion-uom]")) {
      event.target.closest("[data-procurement-row]")?.querySelector("[data-procurement-conversion-factor]")?.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (event.target.matches("[data-allocation-enabled]")) {
      const details = event.target.closest(".ppic-allocation-details");
      const summary = details?.querySelector("summary");
      if (summary) summary.firstChild.textContent = `${details.querySelectorAll("[data-allocation-enabled]:checked").length} alokasi `;
      event.target.closest("[data-procurement-row]")?.querySelector("[data-allocation-qty]")?.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-bucket-drawer]")) { closePlannerBucket(); return; }
    const bucketButton = event.target.closest("[data-open-planner-bucket]"); if (bucketButton) { openPlannerBucket(bucketButton.dataset.openPlannerBucket); return; }
    const plannerView = event.target.closest("[data-planner-view]");
    if (plannerView) { if (tab === "mps") renderMpsPlanner(currentDoc, plannerView.dataset.plannerView); else if (tab === "mrp") renderMrpPlannerView(currentDoc, plannerView.dataset.plannerView); return; }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "reset-ppic-filter") {
      localStorage.removeItem(`ppic-filter:${tab}`);
      render(currentDoc);
      return;
    }
    if (button.dataset.action === "toggle-ppic-group") {
      button.closest("[data-group-level]")?.classList.toggle("collapsed");
      refreshGroupedRows();
      return;
    }
    if (button.dataset.action === "focus-mrp-procurement") {
      $("ppic-procurement-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (button.dataset.action === "edit-mps-adjustment") {
      openMpsAdjustmentDialog(button);
      return;
    }
    if (button.dataset.action === "edit-mrp-percentage") {
      openMrpPercentageDialog(button);
      return;
    }
    if (button.dataset.action === "show-formula-reference") {
      openFormulaReference(button);
      return;
    }
    if (button.dataset.action === "export-mps-management-xlsx" || button.dataset.action === "export-mps-management-pdf") {
      const format = button.dataset.action.endsWith("xlsx") ? "xlsx" : "pdf";
      await window.SharedDataTable.exportTablePayload(mpsManagementReport(currentDoc), format, button);
      return;
    }
    if (button.dataset.action === "export-mrp-management-pdf" || button.dataset.action === "export-mrp-management-xlsx") {
      try {
        if (!mrpPresentation.procurement || !mrpPresentation.pegging) {
          const [procurement, pegging] = await Promise.all([
            api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(currentDoc.runNumber)}/procurement-view`),
            api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(currentDoc.runNumber)}/customer-pegging-view`),
          ]);
          mrpPresentation.procurement = procurement;
          mrpPresentation.pegging = pegging;
        }
        const format = button.dataset.action.endsWith("xlsx") ? "xlsx" : "pdf";
        await window.SharedDataTable.exportTablePayload(mrpManagementReport(currentDoc), format, button);
      } catch (error) {
        showAlert(`Report MRP gagal dibuat: ${error.message}`);
      }
      return;
    }
    button.disabled = true;
    try {
      if (button.dataset.action === "save-mrp-procurement") {
        const orders = collectProcurementOrders(false);
        if (!orders.length) return showAlert("Belum ada Planned Order yang dapat disiapkan.", "warning");
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/planned-orders/procurement`, { method: "PATCH", body: JSON.stringify({ orders }) });
        showAlert(result.message || "Supplier, lot pembelian, dan alokasi PPIC berhasil disimpan.", "success");
        await load();
      } else if (button.dataset.action === "make-purchase-suggestion") {
        if (!confirm(`Buat Purchase Suggestion dari kebutuhan MRP ${key}? Purchasing akan mengonfirmasi supplier sebelum PR dibuat.`)) return;
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/purchase-suggestions`, { method: "POST", body: "{}" });
        showAlert(`Purchase Suggestion ${result.suggestionNumber} berhasil disiapkan.`, "success");
        setTimeout(() => { location.href = `/modules/purchasing/purchase-suggestions/${encodeURIComponent(result.suggestionNumber)}`; }, 450);
      } else if (button.dataset.action === "make-mrp-production-plan") {
        if (!confirm(`Buat Production Planning dari MRP ${key}?`)) return;
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/production-plan`, { method: "POST", body: "{}" });
        const firstPlan = result.items?.[0]?.planNumber;
        location.href = firstPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(firstPlan)}` : "/modules/planning-ppic/monthly-plan";
      } else if (button.dataset.action === "confirm-mps") {
        const cycleNumbers = currentDoc?.planningCycle?.mpsNumbers || [key];
        if (!confirm(`Review dan lock planning cycle ${cycleNumbers.join(" + ")}? Setelah seluruh bulan dikunci, MRP dapat dijalankan sekali untuk horizon ini.`)) return;
        for (const cycleMpsNumber of cycleNumbers) {
          const cycleDocument = currentDoc?.planningCycle?.documents?.find((row) => row.mpsNumber === cycleMpsNumber);
          if (!["Confirmed", "Released"].includes(cycleDocument?.status)) {
            await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(cycleMpsNumber)}/confirm`, { method: "PATCH", body: "{}" });
          }
        }
        await load();
      } else if (button.dataset.action === "add-delivery-phase") {
        openInlineDeliveryForm(button);
      } else if (button.dataset.action === "cancel-delivery-phase") {
        closeInlineDeliveryForm();
      } else if (button.dataset.action === "remove-delivery-phase") {
        if (!confirm("Batalkan phase delivery ini?")) return;
        await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(key)}/delivery-phases/${encodeURIComponent(button.dataset.phaseId)}/remove`, { method: "PATCH", body: "{}" });
        showAlert("Phase delivery dibatalkan.", "success");
        await load();
      } else if (button.dataset.action === "run-mrp") {
        const cycleNumbers = currentDoc?.planningCycle?.mpsNumbers || [key];
        if (!confirm(`Jalankan satu MRP untuk planning cycle ${cycleNumbers.join(" + ")}? Stock dan open supply akan dinetting FIFO terhadap seluruh horizon.`)) return;
        const generated = await api("/modules/api/planning-ppic/mrp/generate-number");
        const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: key, mpsNumbers: cycleNumbers }) });
        location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`;
      } else if (button.dataset.action === "run-mrp-simulation") {
        const scenarioName = await window.formPrompt("Nama simulasi, misalnya PO terlambat 7 hari atau Forecast +15%.", "Simulation 1", { title: "Simulasi MRP" });
        if (scenarioName === null) return;
        const demandPercentInput = await window.formPrompt("Persentase demand forecast untuk simulasi (100 = normal, 115 = naik 15%). SO aktual tetap menjadi minimum.", "100", { title: "Asumsi Demand" });
        if (demandPercentInput === null) return;
        const poDelayInput = await window.formPrompt("Asumsi keterlambatan seluruh open PO dalam hari kalender.", "0", { title: "Asumsi Open PO" });
        if (poDelayInput === null) return;
        const demandPercent = Number(demandPercentInput);
        const poDelayDays = Number(poDelayInput);
        if (!Number.isFinite(demandPercent) || demandPercent < 0 || demandPercent > 500 || !Number.isFinite(poDelayDays) || poDelayDays < 0 || poDelayDays > 365) return showAlert("Asumsi simulasi tidak valid.", "warning");
        const generated = await api("/modules/api/planning-ppic/mrp/generate-number");
        const scenarioKey = `${String(scenarioName || "simulation").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
        const cycleNumbers = currentDoc?.planningCycle?.mpsNumbers || [key];
        const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: key, mpsNumbers: cycleNumbers, scenarioKey, scenarioName, scenarioAssumptions: { demandMultiplier: demandPercent / 100, poDelayDays } }) });
        location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`;
      } else if (button.dataset.action === "make-production-plan") {
        if (!confirm(`Buat Production Plan dari ${key}? MRP harus sudah Completed.`)) return;
        const input = await window.formPrompt("Persentase forecast untuk Production Plan (0-100). SO aktual tetap menjadi minimum.", "100", { title: "Production Plan" });
        if (input === null) return;
        const productionPercent = Number(input);
        if (!Number.isFinite(productionPercent) || productionPercent < 0 || productionPercent > 100) return showAlert("Persentase Production Plan harus antara 0 sampai 100.", "warning");
        const result = await api("/modules/api/planning-ppic/monthly-plan/from-mps", { method: "POST", body: JSON.stringify({ mpsNumber: key, productionPercent }) });
        const primaryPlan = result.primaryPlanNumber || result.items?.find((item) => number(item.receiptLineCount) > 0)?.planNumber || result.items?.[0]?.planNumber;
        location.href = primaryPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(primaryPlan)}` : "/modules/planning-ppic/monthly-plan";
      } else if (button.dataset.action === "confirm-production-plan") {
        if (!confirm(`Konfirmasi Production Plan ${key}?`)) return;
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/confirm`, { method: "POST", body: "{}" });
        await load();
      } else if (button.dataset.action === "release-production-plan") {
        if (!confirm(`Jalankan capacity check dan release ${key}?`)) return;
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/release`, { method: "POST", body: JSON.stringify({ shiftHours: 8, shiftsPerDay: 1, efficiencyPercent: 85 }) });
        await load();
      } else if (button.dataset.action === "release-plan-to-mo") {
        const releaseByLine = new Map([...document.querySelectorAll("[data-mpp-release-qty]")].map((input) => [number(input.dataset.lineNumber), number(input.value)]));
        const details = (currentDoc?.details || []).filter((row) => number(row.qtyPlanned) > number(row.qtyReleased) && !["Cancelled", "Converted"].includes(row.status) && number(releaseByLine.get(number(row.lineNumber))) > 0);
        if (!details.length) return showAlert("Seluruh line Production Plan sudah direlease ke MO.", "info");
        if (!confirm(`Release partial/full ${details.length} line ${key} menjadi Manufacturing Order?`)) return;
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/release-mos`, { method: "POST", body: JSON.stringify({ items: details.map((row) => ({ referenceType: "MonthlyProductionPlan", monthlyProductionPlanNumber: key, monthlyProductionPlanLineNumber: row.lineNumber, qtyPlanned: Math.min(number(releaseByLine.get(number(row.lineNumber))), number(row.qtyPlanned) - number(row.qtyReleased)), plannedStartDate: currentDoc.periodStart, plannedEndDate: row.requiredDate || currentDoc.periodEnd, status: "Planned" })) }) });
        await load();
      } else if (button.dataset.action === "convert-daily-plans") {
        if (!confirm(`Publish draft allocation ${key} menjadi Daily Production Plan?`)) return;
        const result = await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/daily-plans`, { method: "POST", body: JSON.stringify({ allowPartial: Boolean(currentDoc?.capacityOverrideApproved) }) });
        showAlert(`Daily Production Plan: ${number(result?.summary?.createdCount)} baru, ${number(result?.summary?.updatedCount)} diperbarui.`, result?.summary?.skippedCapacityCount ? "warning" : "success");
        setTimeout(() => { location.href = "/modules/planning-ppic/daily-production-plans"; }, 450);
      } else if (button.dataset.action === "make-mps") {
        const months = currentDoc?.consumption?.remainingMonths || [];
        if (!confirm(`Buat Draft MPS ${months.length ? `untuk ${months.join(", ")}` : ""} dari ${key}?`)) return;
        const result = await api("/modules/api/planning-ppic/mps/from-forecast", { method: "POST", body: JSON.stringify({ forecastNumber: key, months: months.length ? months : undefined }) });
        location.href = result.items?.length > 1 ? "/modules/planning-ppic/mps" : `/modules/planning-ppic/mps/${encodeURIComponent(result.mpsNumber)}`;
      } else if (button.dataset.action === "close-forecast") {
        if (!confirm(`Tutup forecast ${key}? Pastikan seluruh outstanding SO sudah tercakup.`)) return;
        await api(`/modules/api/planning-ppic/forecasts/${encodeURIComponent(key)}/close`, { method: "POST", body: "{}" });
        await load();
      }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  $("ppic-delivery-plan-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      const body = {
        mpsDetailId: $("ppic-delivery-detail").value,
        targetType: "CUSTOMER",
        targetCode: $("ppic-delivery-target").value,
        plannedDate: $("ppic-delivery-date").value,
        qtyPlanned: number($("ppic-delivery-qty").value),
        notes: $("ppic-delivery-notes").value.trim() || null,
      };
      if (!body.mpsDetailId || !body.targetCode || !body.plannedDate || body.qtyPlanned <= 0) {
        return showAlert("Part, tujuan, tanggal, dan qty phase wajib diisi.", "warning");
      }
      await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(key)}/delivery-phases`, { method: "POST", body: JSON.stringify(body) });
      showAlert("Phase delivery berhasil ditambahkan.", "success");
      await load();
    } catch (error) {
      showAlert(error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  $("ppic-mrp-views")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mrp-view]"); if (!button) return;
    mrpPresentation.active = button.dataset.mrpView;
    $("ppic-mrp-views").querySelectorAll("[data-mrp-view]").forEach((item) => item.classList.toggle("active", item === button));
    renderMrpPresentationContent();
  });
  load();
})();
