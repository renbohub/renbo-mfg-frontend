(function () {
  const cfg = JSON.parse(document.getElementById("ppic-detail-config").textContent);
  const tab = cfg.activeTab;
  const key = cfg.recordKey;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
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
  function setInfo(title, fields) {
    $("ppic-info-title").textContent = title;
    $("ppic-info-grid").innerHTML = fields.map(([label, value, raw]) => `<div><small>${esc(label)}</small>${raw ? value : `<strong>${esc(value)}</strong>`}</div>`).join("");
  }
  function setTable(title, heads, rows) {
    $("ppic-table-title").textContent = title;
    $("ppic-detail-head").innerHTML = `<tr>${heads.map((head) => `<th>${esc(head)}</th>`).join("")}</tr>`;
    $("ppic-detail-rows").innerHTML = rows.join("") || `<tr><td colspan="${heads.length}" class="ppic-empty">Belum ada detail pada dokumen ini.</td></tr>`;
    refreshGroupedRows();
  }
  function preparePlanningView(items, options) {
    const root = $("ppic-table-filters");
    if (!root) return items;
    const storageKey = `ppic-filter:${tab}`;
    const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const values = (resolver) => [...new Set(items.map(resolver).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const select = (name, label, itemsForSelect) => `<select data-ppic-filter="${name}" aria-label="Filter ${label}"><option value="">Semua ${label}</option>${itemsForSelect.map((value) => `<option value="${esc(value)}" ${state[name] === String(value) ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>`;
    root.innerHTML = `${select("customer", "Customer", values(options.customer))}${select("month", "Bulan", values((row) => month(options.month(row))))}${select("part", "Part", values(options.part))}<button type="button" class="ppic-filter-reset" data-action="reset-ppic-filter">Reset filter</button><select data-ppic-group="1"><option value="customer">Group 1: Customer</option><option value="month">Group 1: Bulan</option><option value="part">Group 1: FG/Part</option></select><select data-ppic-group="2"><option value="customer">Group 2: Customer</option><option value="month">Group 2: Bulan</option><option value="part">Group 2: FG/Part</option></select><select data-ppic-group="3"><option value="customer">Group 3: Customer</option><option value="month">Group 3: Bulan</option><option value="part">Group 3: FG/Part</option></select>`;
    const grouping = JSON.parse(localStorage.getItem(`ppic-grouping:${tab}`) || "[\"customer\",\"month\",\"part\"]");
    root.querySelectorAll("[data-ppic-group]").forEach((input, index) => { input.value = grouping[index] || ["customer", "month", "part"][index]; input.addEventListener("change", () => { const next = [...root.querySelectorAll("[data-ppic-group]")].map((field) => field.value); if (new Set(next).size !== 3) return showAlert("Setiap level grouping harus berbeda.", "warning"); localStorage.setItem(`ppic-grouping:${tab}`, JSON.stringify(next)); render(currentDoc); }); });
    root.querySelectorAll("[data-ppic-filter]").forEach((input) => input.addEventListener("change", () => { const next = Object.fromEntries([...root.querySelectorAll("[data-ppic-filter]")].map((field) => [field.dataset.ppicFilter, field.value])); localStorage.setItem(storageKey, JSON.stringify(next)); render(currentDoc); }));
    return items.filter((row) => (!state.customer || String(options.customer(row) || "") === state.customer) && (!state.month || month(options.month(row)) === state.month) && (!state.part || String(options.part(row) || "") === state.part));
  }
  function monthKey(value) {
    if (!validDate(value)) return "9999-99";
    const parsed = new Date(value);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  function customGroupedPlanningRows(items, options, grouping) {
    const labels = { customer: "Customer", month: "Bulan", part: options.planPartLabel || "Finished Good" };
    const valueFor = (item, group) => group === "customer" ? (options.customer(item) || "Tanpa Customer") : group === "month" ? month(options.month(item)) : (options.planPart(item) || "Tanpa Part");
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
          }
          rows.push(...options.renderItems(leafItems, nextContext));
        } else visit(child, level + 1, nextContext);
      }
    };
    visit(root, 0); return rows;
  }
  function groupedPlanningRows(items, options) {
    const savedGrouping = JSON.parse(localStorage.getItem(`ppic-grouping:${tab}`) || "[\"customer\",\"month\",\"part\"]");
    const grouping = Array.isArray(savedGrouping) ? savedGrouping.filter((item) => ["customer", "month", "part"].includes(item)) : [];
    if (grouping.length === 3 && grouping.join("|") !== "customer|month|part") return customGroupedPlanningRows(items, options, grouping);
    const customerGroups = new Map();
    for (const item of items) {
      const customer = options.customer(item) || "Tanpa Customer";
      const bucketDate = options.month(item);
      const bucketKey = monthKey(bucketDate);
      const planPart = options.planPart(item) || "Tanpa Part";
      if (!customerGroups.has(customer)) customerGroups.set(customer, new Map());
      const monthGroups = customerGroups.get(customer);
      if (!monthGroups.has(bucketKey)) monthGroups.set(bucketKey, { date: bucketDate, parts: new Map() });
      const partGroups = monthGroups.get(bucketKey).parts;
      if (!partGroups.has(planPart)) partGroups.set(planPart, []);
      partGroups.get(planPart).push(item);
    }

    const rows = [];
    for (const [customer, months] of [...customerGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const customerCount = [...months.values()].reduce((sum, entry) => sum + [...entry.parts.values()].reduce((partSum, group) => partSum + group.length, 0), 0);
      rows.push(`<tr class="ppic-group-row customer" data-group-level="1"><td colspan="${options.colSpan}"><div class="ppic-group-static"><span class="ppic-group-label">Customer</span><b>${esc(customer)}</b><em>${num(customerCount)} baris</em></div></td></tr>`);
      for (const [, monthGroup] of [...months.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const monthCount = [...monthGroup.parts.values()].reduce((sum, group) => sum + group.length, 0);
        rows.push(`<tr class="ppic-group-row month" data-group-level="2"><td colspan="${options.colSpan}"><div class="ppic-group-static"><span class="ppic-group-label">Bulan</span><b>${esc(month(monthGroup.date))}</b><em>${num(monthCount)} baris</em></div></td></tr>`);
        for (const [planPart, group] of [...monthGroup.parts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          if (options.renderPlanPartRow) {
            rows.push(options.renderPlanPartRow(planPart, group));
          } else if (!options.planPartInItems) {
            const label = typeof options.planPartLabelFor === "function" ? options.planPartLabelFor(planPart, group) : (options.planPartLabel || "Finished Good");
            const display = typeof options.planPartDisplay === "function" ? options.planPartDisplay(planPart, group) : { code: planPart, name: "" };
            rows.push(`<tr class="ppic-group-row part" data-group-level="3"><td colspan="${options.colSpan}"><button type="button" class="ppic-group-toggle" data-action="toggle-ppic-group" aria-expanded="true"><i class="ppic-group-caret">⌄</i><span class="ppic-group-label">${esc(label)}</span><b>${esc(display.code)}</b>${display.name ? `<small class="ppic-cell-sub">${esc(display.name)}</small>` : ""}<em>${num(group.length)} baris</em></button></td></tr>`);
          }
          rows.push(...options.renderItems(group, { planPart }));
        }
      }
    }
    return rows;
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
  function renderWorkflow(doc, steps, path) {
    $("ppic-workflow").innerHTML = steps.map((step) => `<div class="ppic-workflow-step ${step.done ? "done" : "pending"}"><span class="ppic-workflow-mark">${step.done ? "✓" : "◷"}</span><div><b>${esc(step.title)}</b><small>${esc(step.actor || "Menunggu proses")}</small><time>${esc(step.at ? date(step.at) : "")}</time>${step.note ? `<p>${esc(step.note)}</p>` : ""}</div></div>`).join("");
    $("ppic-status-path").innerHTML = path.map((item, index) => `${index ? '<span>›</span>' : ''}<b class="${index === path.length - 1 ? "current" : ""}">${esc(item)}</b>`).join("");
  }
  function progressBar(value) {
    const safe = Math.max(0, Math.min(number(value), 100));
    return `<div class="ppic-progress"><span style="width:${safe}%"></span></div>`;
  }
  function baseWorkflow(doc, finalLabel) {
    const approved = Boolean(doc.approvedDate || doc.confirmedAt || doc.releasedAt || ["Confirmed", "Released", "Completed", "Active", "Closed", "Consumed"].includes(doc.status));
    return [
      { done: true, title: `Submitted by ${doc.createdBy || doc.runBy || "Planner"}`, actor: "PPIC Planner", at: doc.createdAt, note: doc.notes },
      { done: approved, title: approved ? `Reviewed by ${doc.approvedBy || doc.confirmedBy || doc.releasedBy || "PPIC"}` : "PPIC Review", actor: approved ? "Review selesai" : "Menunggu pemeriksaan", at: doc.approvedDate || doc.confirmedAt || doc.releasedAt },
      { done: ["Released", "Completed", "Active", "Closed", "Consumed"].includes(doc.status), title: finalLabel, actor: doc.status || "Draft", at: doc.updatedAt },
    ];
  }
  function headerActions(doc) {
    const back = `<a class="btn btn-outline-secondary" href="/modules/planning-ppic/${tab}">← Kembali</a>`;
    let action = "";
    if (tab === "consume-forecast") action += `<a class="btn btn-outline-secondary" href="/modules/sales/forecasts/${encodeURIComponent(key)}/edit">Edit Data</a>`;
    if (tab === "mrp" && doc.status === "Completed") action += `<button class="btn btn-outline-primary" data-action="make-purchase-request">Buat Purchase Request</button><button class="btn btn-primary ppic-action-primary" data-action="make-mrp-production-plan">Buat Production Planning</button>`;
    if (tab === "mps" && doc.status === "Draft") action += `<button class="btn btn-primary ppic-action-primary" data-action="confirm-mps">Confirm MPS</button>`;
    if (tab === "mps" && doc.status === "Confirmed") action += `<button class="btn btn-outline-primary" data-action="run-mrp">Run MRP</button><button class="btn btn-primary ppic-action-primary" data-action="make-production-plan">Buat Production Plan</button>`;
    if (tab === "consume-forecast" && doc.status === "Confirmed") action += `<button class="btn btn-primary ppic-action-primary" data-action="make-mps">Buat MPS</button>`;
    if (tab === "monthly-plan" && doc.status === "Draft") action += `<button class="btn btn-primary ppic-action-primary" data-action="confirm-production-plan">Confirm Plan</button>`;
    if (tab === "monthly-plan" && doc.status === "Confirmed") action += `<a class="btn btn-outline-primary" href="/modules/planning-ppic/capacity-planning?planNumber=${encodeURIComponent(doc.planNumber)}">Lihat Capacity</a><button class="btn btn-primary ppic-action-primary" data-action="release-production-plan">Capacity Check & Release</button>`;
    if (tab === "monthly-plan" && ["Released", "In Progress"].includes(doc.status) && (doc.details || []).some((row) => number(row.qtyPlanned) > number(row.qtyReleased))) action += `<button class="btn btn-primary ppic-action-primary" data-action="release-plan-to-mo">Release ke MO</button>`;
    $("ppic-detail-actions").innerHTML = back + action;
    $("ppic-workflow-actions").innerHTML = action;
  }
  function renderMrp(doc) {
    const allRequirements = Array.isArray(doc.requirements) ? doc.requirements : [];
    const requirements = preparePlanningView(allRequirements, { customer: (row) => row.planningCustomerCode, month: (row) => row.planningMonth || row.requiredDate, part: (row) => row.planningPartCode || row.partCode });
    const rawMaterialCount = allRequirements.filter((row) => row.part?.itemType === "RAW" && row.part?.rawType === "MATERIAL").length;
    const purchasePartCount = allRequirements.filter((row) => row.part?.itemType === "RAW" && row.part?.rawType === "PURCHASE_PART").length;
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
        const tooltip = lines.length
          ? lines.map((line) => `${[line.warehouseCode, line.rackCode, line.lotNumber].filter(Boolean).join(" / ") || "Tanpa lokasi"}: ${num(line.qtyAvailable, 3)} ${line.uomCode || uom}`).join("\n")
          : emptyLabel;
        return `<td class="ppic-supply-cell ${kind}" title="${esc(tooltip)}"><div class="ppic-supply-value"><b>${num(stock.qtyAvailable, 3)}</b><small>${esc(uom)}</small></div><span>OH ${num(stock.qtyOnHand, 3)} · RSV ${num(stock.qtyReserved, 3)} · QC ${num(stock.qtyQC, 3)}</span><em>${lines.length ? `${num(lines.length)} lokasi` : emptyLabel}</em></td>`;
      };
      const supplierTooltip = supplierLines.length
        ? supplierLines.map((line) => `${line.poNumber || "PO"} · ${line.supplierName || line.supplierCode || "Supplier"} · ${validDate(line.deliveryDate) ? date(line.deliveryDate) : "Tanpa ETA"} · Sisa ${num(line.outstandingQty, 3)}`).join("\n")
        : "Belum ada outstanding PO supplier";
      return [
        stockCell("warehouse", warehouse, warehouseLines, "Belum ada stock"),
        stockCell("wip", wip, wipLines, "Belum ada stock"),
        `<td class="ppic-supply-cell supplier" title="${esc(supplierTooltip)}"><div class="ppic-supply-value"><b>${num(supplier.qtyOutstanding, 3)}</b><small>${esc(uom)}</small></div><span>Eligible ${num(supplier.qtyEligible, 3)}</span><em>${supplierLines.length ? `${num(supplierLines.length)} PO` : "Belum ada PO"}</em></td>`,
      ].join("");
    };
    const groupedRows = groupedPlanningRows(requirements, {
      colSpan: 19,
      customer: (row) => row.planningCustomerCode,
      month: (row) => row.planningMonth || row.requiredDate,
      planPart: (row) => row.planningPartCode,
      planPartLabelFor: (value, rows) => String(rows[0]?.planningPartItemType || "").toUpperCase() === "FG" ? "Finished Good" : "Part",
      planPartDisplay: (value, rows) => ({ code: value, name: rows[0]?.planningPartName || rows[0]?.planningPartNumber || "" }),
      planPartInItems: false,
      renderItems: (group) => {
        const aggregate = new Map();
        for (const row of group) {
          const rawMaterial = row.part?.itemType === "RAW" && row.part?.rawType === "MATERIAL";
          const displayUom = rawMaterial && row.plannedOrderQtyKg != null ? "kg" : row.uomCode || row.mbomDetail?.uomCode || "-";
          const key = `${row.partCode}|${row.orderType || "-"}|${displayUom}`;
          if (!aggregate.has(key)) aggregate.set(key, { ...row, _ids: [], _base: 0, _forecast: 0, _actualSalesOrder: 0, _soSources: [], _bufferBase: 0, _bufferQty: 0, _bufferPercents: new Set(), _bufferScopes: new Set(), _orderPercents: new Set(), _overridden: false, _gross: 0, _net: 0, _planned: 0, _adjusted: 0, _onHand: 0, _leadTime: 0, _displayUom: displayUom, _rawMaterial: rawMaterial, _supply: row.supplyBreakdown || null });
          const target = aggregate.get(key);
          target._ids.push(row.id);
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
          target._planned += rawMaterial && row.plannedOrderQtyKg != null ? number(row.plannedOrderQtyKg) : number(row.plannedOrderQty);
          target._adjusted += number(row.adjustedOrderQty || row.plannedOrderQty);
          target._onHand = Math.max(target._onHand, number(row.onHandQty));
          target._leadTime = Math.max(target._leadTime, number(row.leadTime));
        }
        return [...aggregate.values()].sort((a, b) => number(a.levelMBOM) - number(b.levelMBOM) || String(a.partCode).localeCompare(String(b.partCode))).map((row) => {
          const type = row._rawMaterial ? "Raw Material" : row.part?.rawType === "PURCHASE_PART" ? "Purchase Part" : row.orderType || row.part?.itemType || "Part";
          const material = row.part?.material?.materialCode || row.part?.material?.materialName;
          const conversionWarning = row._rawMaterial && row._displayUom !== "kg" ? '<small class="ppic-conversion-warning">Gross weight MBOM belum lengkap</small>' : "";
          const bufferPercent = row._bufferPercents.size === 1 ? [...row._bufferPercents][0] : number(row.bufferPercent);
          const orderPercent = row._orderPercents.size === 1 ? [...row._orderPercents][0] : 100;
          const soReferences = [...new Set(row._soSources.map((source) => String(source).split(":")[0]).filter((source) => source && !source.startsWith("MPS")))];
          const soCell = row._actualSalesOrder > 0 ? `<div class="ppic-so-reference"><b>${num(row._actualSalesOrder, 3)}</b>${soReferences.map((so) => `<a href="/modules/sales/sales-orders/${encodeURIComponent(so)}">${esc(so)}</a>`).join("")}</div>` : "0";
          const bufferScope = row._bufferScopes.has("LINE") ? "line" : "parent";
          return `<tr class="ppic-requirement-row ${row._rawMaterial ? "ppic-raw-material-row" : ""}"><td>${badge(type)}</td><td><b>${esc(row.partCode)}</b><small class="ppic-cell-sub">Level ${num(row.levelMBOM)}</small></td><td>${esc(row.part?.partName || row.part?.partNumber || "-")}${material ? `<small class="ppic-cell-sub">Material: ${esc(material)}</small>` : ""}${conversionWarning}</td><td class="ppic-number">${num(row._forecast, 3)}</td><td class="ppic-number">${num(row._base, 3)}</td><td class="ppic-number ppic-actual-so">${soCell}</td><td class="ppic-number ppic-next-forecast">${num(row._bufferBase, 3)}</td><td><div class="ppic-buffer-editor"><div class="ppic-buffer-control"><input data-mrp-buffer type="number" min="0" max="100" step="0.01" value="${esc(bufferPercent)}" aria-label="Buffer stock ${esc(row.partCode)}"><span>%</span><select data-mrp-buffer-scope aria-label="Scope buffer"><option value="parent" ${bufferScope === "parent" ? "selected" : ""}>Parent FG</option><option value="line" ${bufferScope === "line" ? "selected" : ""}>Per baris</option></select><button type="button" data-action="save-mrp-buffer" data-run-number="${esc(doc.runNumber)}" data-requirement-ids="${esc(row._ids.join(","))}">Simpan</button></div><small class="ppic-buffer-source">${row._overridden ? (bufferScope === "parent" ? "Override Parent FG" : "Override per Part") : "Master Parent / FG"}</small></div></td><td class="ppic-number ppic-buffer-qty">${num(row._bufferQty, 3)}</td><td class="ppic-number">${num(row._gross, 3)}</td>${supplySummaryCells(row)}<td class="ppic-number">${num(row._onHand, 3)}</td><td class="ppic-number ppic-net-qty">${num(row._net, 3)}</td><td><div class="ppic-buffer-editor"><div class="ppic-buffer-control"><input type="number" min="0" max="100" step="0.01" value="${esc(orderPercent)}" aria-label="Order forecast ${esc(row.partCode)}"><span>%</span><button type="button" data-action="save-mrp-order-percent" data-run-number="${esc(doc.runNumber)}" data-requirement-ids="${esc(row._ids.join(","))}">Simpan</button></div><small class="ppic-buffer-source">Minimum: SO aktual</small></div></td><td class="ppic-number ppic-plan-qty">${num(row._adjusted, 3)}</td><td><b>${esc(row._displayUom)}</b></td><td class="ppic-number">${num(row._leadTime)} hari</td></tr>`;
        });
      },
    });
    const prOutputs = (doc.plannedOrders || []).filter((row) => row.purchaseRequest?.prNumber);
    const prNumbers = [...new Set(prOutputs.map((row) => row.purchaseRequest.prNumber))];
    const prLinks = prNumbers.length ? prNumbers.map((prNumber) => `<a href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(prNumber)}">${esc(prNumber)}</a>`).join("<br>") : "<strong>-</strong>";
    setInfo("Informasi MRP", [["MRP ID", doc.runNumber], ["Periode", month(doc.runDate)], ["Tipe Perhitungan", "Net Requirements"], ["PIC Planner", doc.runBy || "-"], ["Output Purchase Request", prLinks, true], ["Status Dokumen", badge(doc.status), true]]);
    setTable("Purchase Requirement - Customer / Bulan", ["Tipe", "Kode Part", "Nama / Material", "Forecast A", "Need Bulan A", "Actual Sales Order", "Forecast A+1", "Buffer %", "Buffer Qty", "Gross Req", "Stock Warehouse", "Stock WIP", "Outstanding Supplier", "On Hand", "Net Req", "Order %", "Purchase Plan", "UOM", "Lead Time"], groupedRows);
    setSummary("Parameter Perencanaan", [["Planning Horizon", `${num(doc.planHorizon)} hari`], ["Cut-off Date", date(doc.cutoffDate)], ["Sumber MPS", doc.mpsNumber || "-"], ["Raw Material", `${num(rawMaterialCount)} baris`], ["Purchase Part", `${num(purchasePartCount)} baris`], ["Purchase Request", `${num(new Set(prOutputs.map((row) => row.purchaseRequest.prNumber)).size)} PR / ${num(prOutputs.length)} line`], ["Planned Orders", num(doc.totalPlannedOrders)]], doc.errorMessage || "MRP hanya berisi item purchase. PPIC dapat mengatur Order % terhadap forecast, tetapi kebutuhan tidak pernah turun di bawah SO aktual. Output MRP dapat diterbitkan menjadi Purchase Request; output proses produksi diterbitkan sebagai Production Planning dari MPS yang sama.");
    renderWorkflow(doc, baseWorkflow(doc, "MRP Released"), ["DRAFT", "CALCULATION", String(doc.status || "RUNNING").toUpperCase()]);
  }
  function renderMps(doc) {
    const details = Array.isArray(doc.details) ? doc.details : [];
    const isGeneratedProcess = (row) => String(row.notes || "").startsWith("[MRP-PRODUCTION]");
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
    const processDetails = details.filter((row) => isGeneratedProcess(row) && String(row.part?.itemType || "").toUpperCase() !== "FG").map((row) => {
      const sourceId = String(row.notes || "").match(/\[MPS-SOURCE:([^\]]+)\]/)?.[1];
      const sourcePart = String(row.notes || "").match(/;\s*source\s+(.+?)(?:;|$)/i)?.[1]?.trim();
      const source = receiptById.get(sourceId) || nearestParent(row.customerCode, sourcePart, row) || receiptByMonth.get(`${row.customerCode || ""}|${sourcePart || ""}|${scheduleMonthKey(row)}`) || receiptByLegacyKey.get(`${row.customerCode || ""}|${sourcePart || ""}|${number(row.forecastPeriodOffset)}`) || receiptByCustomerOffset.get(`${row.customerCode || ""}|${number(row.forecastPeriodOffset)}`);
      // Existing child rows predate the explicit source marker.  Fall back to
      // their parent FG so buffer remains visible without altering history.
      return source ? { ...row, forecastQty: number(row.forecastQty) || number(source.forecastQty), actualSalesOrderQty: number(row.actualSalesOrderQty) || number(source.actualSalesOrderQty), bufferBaseQty: number(row.bufferBaseQty) || number(source.bufferBaseQty), bufferPercent: number(row.bufferPercent) || number(source.bufferPercent), bufferQty: number(row.bufferQty) || number(source.bufferQty), effectiveDemandQty: number(row.effectiveDemandQty) || number(source.effectiveDemandQty), productionPercent: number(row.productionPercent || 100) } : row;
    });
    // FG bukan proses, tetapi tetap ditampilkan sebagai receipt agar PPIC dapat
    // melihat Forecast, SO, Buffer, dan target MPS pada satu schedule.
    const allVisibleDetails = [...receiptDetails, ...processDetails];
    const qty = receiptDetails.reduce((sum, row) => sum + number(row.qtyPlanned), 0);
    const partCount = new Set(details.map((row) => row.partCode)).size;
    const primaryPart = receiptDetails[0]?.part?.partName || receiptDetails[0]?.partCode || "-";
    const mbomCount = processDetails.filter((row) => row.mbomHeaderId || row.mbom).length;
    const customerCount = new Set(details.map((row) => row.customerCode || "Tanpa Customer")).size;
    const monthCount = new Set(receiptDetails.map(scheduleMonthKey)).size;
    const childCount = processDetails.length;
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
    const visibleDetails = preparePlanningView(allVisibleDetails, { customer: (row) => row.customerCode, month: (row) => finishedGoodMonth(row), part: (row) => finishedGoodCode(row) });
    const groupedRows = groupedPlanningRows(visibleDetails, {
      colSpan: 13,
      customer: (row) => row.customerCode,
      month: finishedGoodMonth,
      planPart: finishedGoodCode,
      planPartLabel: "Finished Good",
      planPartLabelFor: (value, rows) => planPartRow(rows[0] || {}).label,
      planPartDisplay: (value, rows) => ({ code: value, name: finishedGoodName(rows[0] || {}) }),
      planPartInItems: true,
      renderItems: (group) => {
        const partGroups = new Map();
        for (const item of group) {
          const productionLevel = isGeneratedProcess(item) ? "Child / SFG Process" : "FG Receipt";
          const partKey = `${productionLevel}|${item.partCode}`;
          if (!partGroups.has(partKey)) partGroups.set(partKey, { first: item, productionLevel, items: [] });
          partGroups.get(partKey).items.push(item);
        }
        return [...partGroups.values()].sort((a, b) => String(a.first.partCode).localeCompare(String(b.first.partCode))).map(({ first, productionLevel, items }) => {
          const detailIds = items.map((row) => row.id).filter(Boolean);
          const parent = productionLevel === "Child / SFG Process" ? sourceFinishedGood(first) : null;
          const sourcePartForBuffer = String(first.notes || "").match(/;\s*source\s+(.+?)(?:;|$)/i)?.[1]?.trim();
          const bufferParent = parent || (productionLevel === "Child / SFG Process" ? nearestParent(first.customerCode, sourcePartForBuffer, first) : null);
          const totalQty = items.reduce((sum, row) => sum + number(row.qtyPlanned), 0);
          const forecastQty = items.reduce((sum, row) => sum + number(row.forecastQty), 0);
          const salesOrderQty = items.reduce((sum, row) => sum + number(row.actualSalesOrderQty), 0);
          const bufferQty = items.reduce((sum, row) => sum + number(row.bufferQty), 0) || number(bufferParent?.bufferQty);
          const bufferPercent = [...new Set(items.map((row) => number(row.bufferPercent)).concat(bufferParent ? [number(bufferParent.bufferPercent)] : []))];
          const productionPercent = [...new Set(items.map((row) => number(row.productionPercent ?? 100)).concat(bufferParent ? [number(bufferParent.productionPercent ?? 100)] : []))];
          const start = items.reduce((value, row) => !value || new Date(scheduleDate(row)) < new Date(value) ? scheduleDate(row) : value, null);
          const end = items.reduce((value, row) => !value || new Date(scheduleEndDate(row)) > new Date(value) ? scheduleEndDate(row) : value, null);
          const statuses = [...new Set(items.map((row) => row.status || "Planned"))];
          const partCodeCell = `<b>${esc(first.partCode || "-")}</b>`;
          const partNameCell = esc(first.part?.partName || first.part?.partNumber || "-");
          const processPath = Array.isArray(first.processPath) ? first.processPath : [];
          const processCell = processPath.length
            ? processPath.map((item, index) => `${index + 1}. ${esc(item.name || "Process")}${item.occurrenceCode ? ` (${esc(item.occurrenceCode)})` : ""}`).join(" → ")
            : "-";
          const bufferLabel = productionLevel === "FG Receipt" ? `${num(bufferPercent.length === 1 ? bufferPercent[0] : 0, 2)}%` : "-";
          const soReferences = [...new Set(items.flatMap((row) => String(row.soNumber || "").split(",")).map((value) => value.trim()).filter(Boolean))];
          const soCell = salesOrderQty > 0 ? `<div class="ppic-so-reference"><b>${num(salesOrderQty, 2)}</b>${soReferences.map((so) => `<a href="/modules/sales/sales-orders/${encodeURIComponent(so)}">${esc(so)}</a>`).join("")}</div>` : "0";
          const editable = productionLevel === "FG Receipt";
          const bufferScope = first.bufferReferenceScope === "LINE" ? "line" : "parent";
          const bufferCell = editable ? `<div class="ppic-buffer-editor"><div class="ppic-buffer-control"><input data-mps-buffer type="number" min="0" max="100" step="0.01" value="${esc(bufferPercent.length === 1 ? bufferPercent[0] : 0)}" aria-label="Buffer stock ${esc(first.partCode)}"><span>%</span><select data-mps-buffer-scope aria-label="Scope buffer"><option value="parent" ${bufferScope === "parent" ? "selected" : ""}>Parent FG</option><option value="line" ${bufferScope === "line" ? "selected" : ""}>Per baris</option></select></div><small class="ppic-buffer-source">${items.some((row) => row.bufferOverridden) ? (bufferScope === "parent" ? "Override Parent FG" : "Override per baris") : "Master FG"}</small></div>` : `<span>${num(bufferPercent.length === 1 ? bufferPercent[0] : 0, 2)}%</span><small class="ppic-buffer-source">Ikut parent FG</small>`;
          const productionCell = editable ? `<div class="ppic-buffer-editor"><div class="ppic-buffer-control"><input data-mps-production type="number" min="0" max="100" step="0.01" value="${esc(productionPercent.length === 1 ? productionPercent[0] : 100)}" aria-label="Persentase produksi ${esc(first.partCode)}"><span>%</span><button type="button" data-action="save-mps-adjustment" data-mps-number="${esc(doc.mpsNumber)}" data-detail-ids="${esc(detailIds.join(","))}">Simpan</button></div><small class="ppic-buffer-source">Minimum: SO aktual</small></div>` : `<span>${num(productionPercent.length === 1 ? productionPercent[0] : 100, 2)}%</span><small class="ppic-buffer-source">Ikut parent FG</small>`;
          return `<tr class="ppic-mps-process-row"><td>${badge(productionLevel)}</td><td>${partCodeCell}</td><td>${partNameCell}</td><td>${processCell}</td><td>${esc(period(start, end))}</td><td class="ppic-number">${num(forecastQty, 2)}</td><td class="ppic-number ppic-actual-so">${soCell}</td><td>${bufferCell}</td><td class="ppic-number ppic-buffer-qty">${num(bufferQty, 2)}</td><td>${productionCell}</td><td class="ppic-number ppic-plan-qty">${num(totalQty, 2)}</td><td>${esc(first.customerCode)}</td><td class="ppic-number">${num(Math.min(...items.map((row) => number(row.priority) || 1)))}</td><td>${badge(statuses.length === 1 ? statuses[0] : "Mixed")}</td></tr>`;
        });
      },
    });
    const productionPlans = doc.productionPlans || [];
    const productionLinks = productionPlans.length ? productionPlans.map((plan) => `<a href="/modules/planning-ppic/monthly-plan/${encodeURIComponent(plan.planNumber)}">${esc(plan.planNumber)} (${num(plan._count?.details)} baris)</a>`).join("<br>") : "<strong>-</strong>";
    const horizonRows = [...receiptDetails, ...processDetails];
    const horizonStart = horizonRows.reduce((value, row) => !value || new Date(scheduleDate(row)) < new Date(value) ? scheduleDate(row) : value, null) || doc.periodStart;
    const horizonEnd = horizonRows.reduce((value, row) => !value || new Date(scheduleEndDate(row)) > new Date(value) ? scheduleEndDate(row) : value, null) || doc.periodEnd;
    setInfo("Informasi MPS", [["MPS ID", doc.mpsNumber], ["Produk Utama", primaryPart], ["Sumber Forecast", doc.forecastNumber || "-"], ["Horizon Perencanaan", period(horizonStart, horizonEnd)], ["Output Production Planning", productionLinks, true], ["Status Dokumen", badge(doc.status), true]]);
    const totalBufferQty = receiptDetails.reduce((sum, row) => sum + number(row.bufferQty), 0);
    setTable("FG Receipt & Child / SFG Process Schedule", ["Tipe", "Part Code", "Part Name", "Proses", "Periode / Schedule", "Forecast", "Actual SO", "Buffer %", "Buffer Qty", "Produksi %", "Target MPS", "Customer", "Prioritas", "Status"], groupedRows);
    setSummary("Kalkulasi Rencana Produksi", [["Target FG Receipt", num(qty, 2)], ["Buffer Stock MPS", num(totalBufferQty, 2)], ["Production Planning", `${num((doc.productionPlans || []).length)} plan`], ["Jumlah Customer", num(customerCount)], ["Jumlah Bulan", num(monthCount)], ["Child / SFG Process", `${num(childCount)} baris`], ["Jumlah Part", `${num(partCount)} part`], ["MBOM Process", `${num(mbomCount)} baris`]], "FG hanya menjadi target receipt, bukan proses. Buffer MPS bulan A = Buffer % master FG × forecast bulan A+1. Demand MRP tetap memakai nilai terbesar antara Forecast + Buffer dan SO aktual.");
    renderWorkflow(doc, baseWorkflow(doc, "Production Release"), ["DRAFT", "PLANNER", "PPIC", String(doc.status || "DRAFT").toUpperCase()]);
  }
  function renderMonthly(doc) {
    const details = Array.isArray(doc.details) ? doc.details : [];
    const isProcess = (row) => String(row.notes || "").includes("[MRP-PRODUCTION]");
    const receiptDetails = details.filter((row) => !isProcess(row));
    const target = receiptDetails.reduce((sum, row) => sum + number(row.qtyPlanned), 0);
    const actual = receiptDetails.reduce((sum, row) => sum + number(row.qtyReleased), 0);
    const bufferQty = receiptDetails.reduce((sum, row) => sum + number(row.bufferQty), 0);
    const forecastQty = receiptDetails.reduce((sum, row) => sum + number(row.forecastQty), 0);
    const actualSalesOrderQty = receiptDetails.reduce((sum, row) => sum + number(row.actualSalesOrderQty), 0);
    setInfo("Informasi Rencana Produksi Bulanan", [["Rencana ID", doc.planNumber], ["Bulan Target", month(doc.planMonth)], ["Periode", period(doc.periodStart, doc.periodEnd)], ["Sumber Data", doc.sourceType || "Planned Order"], ["Jumlah Baris", num(details.length)], ["Status Plan", badge(doc.status), true]]);
    setTable("Target Receipt & Proses Produksi", ["Tipe", "ID Produk", "Referensi", "Forecast", "Actual SO", "Buffer %", "Buffer Qty", "Produksi %", "Target Plan", "Realisasi", "Achievement", "Progress Visual"], details.map((row) => { const achievement = number(row.qtyPlanned) ? Math.round(number(row.qtyReleased) / number(row.qtyPlanned) * 100) : 0; const receipt = !isProcess(row); return `<tr><td>${badge(isProcess(row) ? "Child / SFG Process" : "FG Receipt")}</td><td><b>${esc(row.partCode)}</b></td><td>${esc(row.manufacturingOrderNumber || row.plannedOrderNumber || row.mpsDetailId || "-")}</td><td class="ppic-number">${receipt ? num(row.forecastQty, 2) : "-"}</td><td class="ppic-number ppic-actual-so">${receipt ? num(row.actualSalesOrderQty, 2) : "-"}</td><td class="ppic-number">${receipt ? `${num(row.bufferPercent, 2)}%` : "-"}</td><td class="ppic-number ppic-buffer-qty">${receipt ? num(row.bufferQty, 2) : "-"}</td><td class="ppic-number">${receipt ? `${num(row.productionPercent ?? 100, 2)}%` : "-"}</td><td class="ppic-number">${num(row.qtyPlanned, 2)} ${esc(row.uomCode || "")}</td><td class="ppic-number">${num(row.qtyReleased, 2)} ${esc(row.uomCode || "")}</td><td class="ppic-number ppic-achievement ${achievement >= 100 ? "over" : achievement >= 90 ? "good" : "warn"}">${num(achievement)}%</td><td>${progressBar(achievement)}</td></tr>`; }));
    setSummary("Resource Summary & Utilisation", [["Forecast FG", num(forecastQty, 2)], ["Actual SO", num(actualSalesOrderQty, 2)], ["Buffer Stock", num(bufferQty, 2)], ["Total Target", num(target, 2)], ["Total Realisasi", num(actual, 2)], ["Outstanding", num(Math.max(target - actual, 0), 2)], ["Achievement", `${target ? num(actual / target * 100, 1) : 0}%`], ["Confirmed By", doc.confirmedBy || "-"], ["Released By", doc.releasedBy || "-"]], doc.notes);
    renderWorkflow(doc, baseWorkflow(doc, "Factory Release"), ["DRAFT", "PPIC", "FACTORY", String(doc.status || "DRAFT").toUpperCase()]);
  }
  function renderConsume(doc) {
    const details = Array.isArray(doc.details) ? doc.details : [];
    const qty = details.reduce((sum, row) => sum + number(row.forecastQty), 0);
    const partCount = new Set(details.map((row) => row.partCode)).size;
    setInfo("Informasi Forecast", [["Forecast ID", doc.forecastNumber], ["Periode", period(doc.periodStart, doc.periodEnd)], ["Customer", doc.customerCode || "-"], ["Source Data", "Sales Forecast"], ["Jumlah Part", num(partCount)], ["Status", badge(doc.status), true]]);
    setTable("Forecast Consumption Detail", ["Kode Part", "Nama Part", "Bulan Forecast", "Forecast Qty", "UOM", "Catatan"], details.map((row) => `<tr><td><b>${esc(row.partCode)}</b></td><td>${esc(row.part?.partName || row.part?.partNumber || "-")}</td><td>${esc(month(row.forecastMonth))}</td><td class="ppic-number ppic-plan-qty">${num(row.forecastQty, 2)}</td><td>${esc(row.uomCode)}</td><td>${esc(row.notes)}</td></tr>`));
    setSummary("Assumptions & Planning Notes", [["Total Forecast", num(qty, 2)], ["Jumlah Part", `${num(partCount)} part`], ["Nama Forecast", doc.forecastName || "-"], ["Dibuat Oleh", doc.createdBy || "-"], ["Disetujui Oleh", doc.approvedBy || "-"], ["Tanggal Approval", date(doc.approvedDate)]], doc.notes);
    renderWorkflow(doc, baseWorkflow(doc, "Forecast Consumed"), ["DRAFT", "ANALYST", "PPIC", String(doc.status || "DRAFT").toUpperCase()]);
  }
  function render(doc) {
    currentDoc = doc;
    $("ppic-detail-title").textContent = config.title;
    $("ppic-detail-key").textContent = key;
    headerActions(doc);
    if (tab === "mrp") renderMrp(doc);
    else if (tab === "mps") renderMps(doc);
    else if (tab === "monthly-plan") renderMonthly(doc);
    else renderConsume(doc);
    $("ppic-detail-loading").classList.add("d-none");
    $("ppic-detail-shell").classList.remove("d-none");
  }
  async function load() {
    try {
      const doc = await api(`/modules/api/planning-ppic/${config.endpoint}/${encodeURIComponent(key)}`);
      render(doc);
    } catch (error) {
      $("ppic-detail-loading").classList.add("d-none");
      showAlert(error.message);
    }
  }
  document.addEventListener("click", async (event) => {
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
    button.disabled = true;
    try {
      if (button.dataset.action === "save-mps-adjustment") {
        const row = button.closest("tr");
        const bufferPercent = number(row?.querySelector("[data-mps-buffer]")?.value);
        const productionPercent = number(row?.querySelector("[data-mps-production]")?.value);
        const scope = row?.querySelector("[data-mps-buffer-scope]")?.value || "parent";
        const detailIds = String(button.dataset.detailIds || "").split(",").filter(Boolean);
        await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(button.dataset.mpsNumber || key)}/adjustments`, {
          method: "PATCH", body: JSON.stringify({ detailIds, bufferPercent, productionPercent, scope }),
        });
        showAlert("Buffer FG dan persentase produksi berhasil diperbarui; target tidak dapat lebih kecil dari SO aktual.", "success");
        setTimeout(() => location.reload(), 500);
      } else if (button.dataset.action === "save-mrp-buffer") {
        const editor = button.closest(".ppic-buffer-editor");
        const bufferPercent = number(editor?.querySelector("[data-mrp-buffer]")?.value);
        const scope = editor?.querySelector("[data-mrp-buffer-scope]")?.value || "parent";
        const requirementIds = String(button.dataset.requirementIds || "").split(",").filter(Boolean);
        await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(button.dataset.runNumber || key)}/requirements/buffer`, {
          method: "PATCH",
          body: JSON.stringify({ requirementIds, bufferPercent, scope }),
        });
        showAlert("Buffer stock dan purchase plan berhasil dihitung ulang.", "success");
        setTimeout(() => location.reload(), 500);
      } else if (button.dataset.action === "save-mrp-order-percent") {
        const editor = button.closest(".ppic-buffer-editor");
        const orderPercent = number(editor?.querySelector("input")?.value);
        const requirementIds = String(button.dataset.requirementIds || "").split(",").filter(Boolean);
        await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(button.dataset.runNumber || key)}/requirements/order-percent`, {
          method: "PATCH",
          body: JSON.stringify({ requirementIds, orderPercent }),
        });
        showAlert("Order % dan purchase plan berhasil dihitung ulang; SO aktual tetap menjadi minimum.", "success");
        setTimeout(() => location.reload(), 500);
      } else if (button.dataset.action === "make-purchase-request") {
        if (!confirm(`Buat Purchase Request dari planned purchase order MRP ${key}?`)) return;
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/purchase-request`, { method: "POST", body: "{}" });
        showAlert(result.message || `Purchase Request ${result.purchaseRequest?.prNumber || result.prNumbers?.[0] || ""} berhasil dibuat.`, "success");
      } else if (button.dataset.action === "make-mrp-production-plan") {
        if (!confirm(`Buat Production Planning dari MRP ${key}?`)) return;
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/production-plan`, { method: "POST", body: "{}" });
        const firstPlan = result.items?.[0]?.planNumber;
        location.href = firstPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(firstPlan)}` : "/modules/planning-ppic/monthly-plan";
      } else if (button.dataset.action === "confirm-mps") {
        if (!confirm(`Konfirmasi MPS ${key}?`)) return;
        await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(key)}/confirm`, { method: "PATCH", body: "{}" });
        location.reload();
      } else if (button.dataset.action === "run-mrp") {
        if (!confirm(`Jalankan MRP untuk ${key}?`)) return;
        const generated = await api("/modules/api/planning-ppic/mrp/generate-number");
        const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: key }) });
        location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`;
      } else if (button.dataset.action === "make-production-plan") {
        if (!confirm(`Buat Production Plan dari ${key}? MRP harus sudah Completed.`)) return;
        const input = window.prompt("Persentase forecast untuk Production Plan (0-100). SO aktual tetap menjadi minimum.", "100");
        if (input === null) return;
        const productionPercent = Number(input);
        if (!Number.isFinite(productionPercent) || productionPercent < 0 || productionPercent > 100) return showAlert("Persentase Production Plan harus antara 0 sampai 100.", "warning");
        const result = await api("/modules/api/planning-ppic/monthly-plan/from-mps", { method: "POST", body: JSON.stringify({ mpsNumber: key, productionPercent }) });
        const firstPlan = result.items?.[0]?.planNumber;
        location.href = firstPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(firstPlan)}` : "/modules/planning-ppic/monthly-plan";
      } else if (button.dataset.action === "confirm-production-plan") {
        if (!confirm(`Konfirmasi Production Plan ${key}?`)) return;
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/confirm`, { method: "POST", body: "{}" });
        location.reload();
      } else if (button.dataset.action === "release-production-plan") {
        if (!confirm(`Jalankan capacity check dan release ${key}?`)) return;
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/release`, { method: "POST", body: JSON.stringify({ shiftHours: 8, shiftsPerDay: 1, efficiencyPercent: 85 }) });
        location.reload();
      } else if (button.dataset.action === "release-plan-to-mo") {
        const details = (currentDoc?.details || []).filter((row) => number(row.qtyPlanned) > number(row.qtyReleased) && !["Cancelled", "Converted"].includes(row.status));
        if (!details.length) return showAlert("Seluruh line Production Plan sudah direlease ke MO.", "info");
        if (!confirm(`Release ${details.length} line ${key} menjadi Manufacturing Order?`)) return;
        await api(`/modules/api/planning-ppic/monthly-plan/${encodeURIComponent(key)}/release-mos`, { method: "POST", body: JSON.stringify({ items: details.map((row) => ({ referenceType: "MonthlyProductionPlan", monthlyProductionPlanNumber: key, monthlyProductionPlanLineNumber: row.lineNumber, qtyPlanned: number(row.qtyPlanned) - number(row.qtyReleased), plannedStartDate: currentDoc.periodStart, plannedEndDate: row.requiredDate || currentDoc.periodEnd, status: "Planned" })) }) });
        location.href = "/modules/production/manufacturing-orders";
      } else if (button.dataset.action === "make-mps") {
        if (!confirm(`Buat Draft MPS dari ${key}?`)) return;
        const result = await api("/modules/api/planning-ppic/mps/from-forecast", { method: "POST", body: JSON.stringify({ forecastNumber: key }) });
        location.href = result.items?.length > 1 ? "/modules/planning-ppic/mps" : `/modules/planning-ppic/mps/${encodeURIComponent(result.mpsNumber)}`;
      }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  load();
})();
