(() => {
  "use strict";
  const cfg = JSON.parse(document.getElementById("mrps-config")?.textContent || "{}");
  const key = cfg.recordKey;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const state = { doc: null, view: "requirements", query: "", filter: "ACTION", page: 1, pageSize: 25, pegging: null, loadingPegging: false, rows: new Map(), action: null };
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const num = (value, digits = 3) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(number(value));
  const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());
  const date = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const month = (value) => validDate(value) ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(value)) : "-";
  const slug = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const help = (copy) => `<button class="mrps-help" type="button" title="${esc(copy)}" data-tip="${esc(copy)}" aria-label="${esc(copy)}">?</button>`;
  const badge = (label, tone = label) => `<span class="mrps-badge ${esc(slug(tone))}">${esc(label)}</span>`;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request gagal (${response.status}).`);
    return payload.data || payload;
  }
  function alert(message, success = false, raw = false) {
    const node = $("mrps-alert"); node.hidden = !message; node.classList.toggle("success", success);
    if (raw) node.innerHTML = message || ""; else node.textContent = message || "";
  }
  function uom(row) {
    if (String(row?.part?.rawType || "").toUpperCase() === "MATERIAL") return "KG";
    return String(row?.uomCode || row?.mbomDetail?.uomCode || row?.part?.stockUomCode || row?.part?.baseUomCode || "PCS").toUpperCase();
  }
  function bomUsage(row) {
    const detail = row?.mbomDetail || {};
    const parent = detail.parentDetail?.part || detail.mbomHeader?.part || null;
    const output = detail.mbomHeader?.part || parent;
    const routes = (detail.parentDetail?.mbomProcesses?.length ? detail.parentDetail.mbomProcesses : detail.mbomProcesses || [])
      .map((route) => ({
        code: route.process?.processCode || route.occurrenceCode || "",
        name: route.process?.processName || route.occurrenceCode || "",
        sequence: number(route.sequence),
        mode: route.routingMode || "",
      }))
      .filter((route) => route.code || route.name);
    return {
      parent,
      output,
      routes,
      bomNumber: detail.noReg || detail.mbomHeader?.noReg || row?.sourceNumber || "-",
      qtyPerParent: number(detail.qty),
      usageUom: String(detail.uomCode || uom(row)).toUpperCase(),
    };
  }
  function routeLabel(usage) {
    return usage.routes.length ? usage.routes.map((route) => route.code || route.name).join(", ") : "Proses belum dipetakan";
  }
  function supplyAudit(row) {
    const breakdown = row?.supplyBreakdown || {};
    const warehouseAvailable = breakdown.warehouseStock?.qtyAvailable == null
      ? Math.max(number(row?.onHandQty) - number(row?.allocatedQty), 0)
      : number(breakdown.warehouseStock.qtyAvailable);
    const embeddedWip = number(breakdown.wipStock?.planningSupplyQty);
    const firmSupply = breakdown.supplierOutstanding?.qtyEligible == null
      ? number(row?.firmSupplyQty)
      : number(breakdown.supplierOutstanding.qtyEligible);
    const gross = number(row?.grossRequirement);
    const currentUncovered = breakdown.coverage?.uncoveredDemandQty == null
      ? Math.max(gross - warehouseAvailable - embeddedWip - firmSupply, 0)
      : number(breakdown.coverage.uncoveredDemandQty);
    return { warehouseAvailable, embeddedWip, firmSupply, currentUncovered };
  }
  function sourceTypeLabel(value) {
    const type = String(value || "").toUpperCase();
    if (["SO", "SALES_ORDER", "SALES ORDER"].includes(type)) return "SO";
    if (type === "FORECAST") return "Forecast";
    if (type === "BUFFER") return "Buffer";
    return value || "Demand";
  }
  function demandSources(row) {
    const pegging = Array.isArray(row?.customerPegging) && row.customerPegging.length
      ? row.customerPegging
      : (row?.rootDemandSourceNumber || row?.sourceNumber ? [{
          sourceType: row.rootDemandSourceType || row.sourceType,
          sourceNumber: row.rootDemandSourceNumber || row.sourceNumber,
          customerCode: row.customerCode,
          fgPartCode: row.fgPartCode,
          qty: row.grossRequirement,
          targetDeliveryDate: row.targetDeliveryDate,
          deliveryTargetId: row.deliveryTargetId,
        }] : []);
    return pegging.flatMap((source) => {
      const splits = Array.isArray(source.fgFinishSplits) && source.fgFinishSplits.length
        ? source.fgFinishSplits
        : [{
            qty: source.qty,
            phaseNumber: source.fgFinishSplitNumber,
            targetFinishDate: source.targetDeliveryDate || source.fgRequiredDate || row.targetDeliveryDate,
          }];
      return splits.map((split) => ({
        type: sourceTypeLabel(source.sourceType || row.rootDemandSourceType),
        typeKey: slug(source.sourceType || row.rootDemandSourceType || "demand"),
        sourceNumber: source.sourceNumber || row.rootDemandSourceNumber || "-",
        customerCode: source.customerCode || row.customerCode || "-",
        fgPartCode: source.fgPartCode || row.fgPartCode || row.planningPartCode || "-",
        qty: number(split.qty ?? source.qty),
        phaseNumber: number(split.phaseNumber ?? source.fgFinishSplitNumber),
        deliveryDate: split.targetFinishDate || source.targetDeliveryDate || source.fgRequiredDate || row.targetDeliveryDate,
        deliveryTargetId: source.deliveryTargetId || row.deliveryTargetId || "",
      }));
    });
  }
  function requirementState(row) {
    if (number(row.netRequirement) <= .000001) return { key: "COVERED", label: "Covered", tone: "covered" };
    if (String(row.procurementWindow || "").toUpperCase() === "EXPEDITE") return { key: "URGENT", label: "Urgent", tone: "urgent" };
    return { key: "BUY", label: "Perlu order", tone: "buy" };
  }
  function orderState(row) {
    const remaining = Math.max(number(row.qty) - number(row.qtyReleased), 0);
    if (remaining <= .000001 || ["Released", "Converted", "Completed", "Closed"].includes(row.status)) return { key: "COVERED", label: row.status || "Released", tone: "covered" };
    const orderDateKey = validDate(row.orderDate) ? new Date(row.orderDate).toISOString().slice(0, 10) : "";
    const relatedUrgent = (state.doc?.requirements || []).some((item) => item.partCode === row.partCode && requirementState(item).key === "URGENT" && (!orderDateKey || (validDate(item.orderDate) && new Date(item.orderDate).toISOString().slice(0, 10) === orderDateKey)));
    return relatedUrgent ? { key: "URGENT", label: "Urgent", tone: "urgent" } : { key: "BUY", label: row.status || "Planned", tone: "buy" };
  }
  function peggingState(row) {
    const risk = String(row.risk || "").toUpperCase();
    if (risk.includes("EXPEDITE") || risk.includes("SHORT") || risk.includes("LATE")) return { key: "URGENT", label: row.risk || "Urgent", tone: "urgent" };
    if (number(row.shortageQty) > .000001 || number(row.requirementQty) > number(row.supplyCoverageQty)) return { key: "BUY", label: row.risk || "Shortage", tone: "buy" };
    return { key: "COVERED", label: row.risk || "Covered", tone: "covered" };
  }
  function searchText(row) { return Object.values(row).filter((value) => ["string", "number"].includes(typeof value)).join(" ").toLowerCase(); }
  function requirementRows() {
    return (state.doc?.requirements || []).map((row, index) => {
      const identity = row.part?.material?.materialCode || row.partCode;
      const partName = row.part?.material?.materialName || row.part?.partName || row.part?.partNumber || "";
      const usage = bomUsage(row);
      const sources = demandSources(row);
      const usageSearch = `${usage.parent?.partCode || ""} ${usage.parent?.partNumber || ""} ${usage.parent?.partName || ""} ${usage.output?.partCode || ""} ${usage.output?.partNumber || ""} ${usage.routes.map((route) => `${route.code} ${route.name}`).join(" ")} ${usage.bomNumber}`;
      const sourceSearch = sources.map((source) => `${source.type} ${source.sourceNumber} ${source.customerCode} ${source.fgPartCode} phase ${source.phaseNumber}`).join(" ");
      return { ...row, _usage: usage, _demandSources: sources, _id: `req:${row.id || index}`, _state: requirementState(row), _search: `${identity} ${row.partCode} ${partName} ${row.planningPartCode || ""} ${row.planningCustomerCode || ""} ${usageSearch} ${sourceSearch}`.toLowerCase() };
    });
  }
  function orderRows() {
    return (state.doc?.plannedOrders || []).map((row, index) => ({ ...row, _id: `order:${row.id || row.orderNumber || index}`, _state: orderState(row), _search: `${row.orderNumber || ""} ${row.partCode || ""} ${row.partName || row.part?.partName || ""} ${row.supplierName || row.supplierCode || ""} ${row.status || ""}`.toLowerCase() }));
  }
  function peggingRows() {
    return (state.pegging?.items || []).map((row, index) => ({ ...row, _id: `peg:${index}`, _state: peggingState(row), _search: `${row.customerCode || ""} ${row.fgPartCode || ""} ${row.sourceNumber || ""} ${row.materialOrComponent || row.partCode || ""}`.toLowerCase() }));
  }
  function currentRows() {
    const rows = state.view === "orders" ? orderRows() : state.view === "pegging" ? peggingRows() : requirementRows();
    const priority = { URGENT: 0, BUY: 1, COVERED: 2 };
    return rows.sort((left, right) => (priority[left._state.key] ?? 9) - (priority[right._state.key] ?? 9) || String(left.requiredDate || left.targetDeliveryDate || left.orderDate || "").localeCompare(String(right.requiredDate || right.targetDeliveryDate || right.orderDate || "")));
  }
  function visibleRows() {
    return currentRows().filter((row) => (!state.query || row._search.includes(state.query)) && (state.filter === "ALL" || (state.filter === "ACTION" ? row._state.key !== "COVERED" : row._state.key === state.filter)));
  }
  function renderHeader() {
    const doc = state.doc; if (!doc) return;
    $("mrps-title").textContent = doc.runNumber || key;
    $("mrps-status").textContent = doc.status || "-";
    $("mrps-status").className = `mrps-badge ${slug(doc.status)}`;
    $("mrps-meta").textContent = `${month(doc.planningMonth || doc.runDate)} · MPS ${doc.mpsNumber || "-"} · Revision ${num(doc.planRevision || 1, 0)}${doc.isCurrentPlan ? " · Current plan" : ""}`;
    const actions = [];
    if (doc.mpsNumber) actions.push(`<a class="btn btn-outline-primary" href="/modules/planning-ppic/mps/workbench?month=${encodeURIComponent(String(doc.planningMonth || "").slice(0, 7))}">Buka MPS</a>`);
    if (doc.purchaseSuggestion?.suggestionNumber) actions.push(`<a class="btn btn-outline-primary" href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(doc.purchaseSuggestion.suggestionNumber)}">Buka ${esc(doc.purchaseSuggestion.suggestionNumber)}</a>`);
    else if (doc.status === "Completed" && doc.scenarioStatus !== "SIMULATION") actions.push('<button class="btn btn-outline-primary" type="button" data-mrps-action="suggestion">Buat Purchase Suggestion</button>');
    if (doc.status === "Completed" && doc.scenarioStatus !== "SIMULATION") actions.push('<button class="btn btn-primary" type="button" data-mrps-action="production">Buat Monthly Plan</button>');
    $("mrps-actions").innerHTML = actions.join("");
  }
  function renderKpis() {
    const requirements = requirementRows();
    $("mrps-kpi-material").textContent = num(requirements.length, 0);
    $("mrps-kpi-buy").textContent = num(requirements.filter((row) => row._state.key !== "COVERED").length, 0);
    $("mrps-kpi-urgent").textContent = num(requirements.filter((row) => row._state.key === "URGENT").length, 0);
    $("mrps-kpi-orders").textContent = num((state.doc?.plannedOrders || []).length, 0);
  }
  function renderRequirements(rows) {
    $("mrps-head").innerHTML = `<tr><th>Material / Part</th><th>Untuk Part ${help("Menunjukkan part parent tempat material ini digunakan.")}</th><th>Proses ${help("Proses mBOM tempat material atau purchase part digunakan.")}</th><th class="mrps-number">Gross ${help("Kebutuhan kotor hasil BOM explosion sebelum stock dan firm supply dikurangkan.")}</th><th class="mrps-number">Stock</th><th class="mrps-number">Firm Supply ${help("Supply yang sudah memiliki referensi tegas, misalnya open PO yang eligible.")}</th><th class="mrps-number">Net / Buy ${help("Net requirement adalah hasil time-phased netting. MOQ supplier diterapkan pada Purchase Suggestion, bukan mengubah kebutuhan asli MRP.")}</th><th>Required</th><th>Status</th><th></th></tr>`;
    $("mrps-body").innerHTML = rows.map((row) => {
      const code = row.part?.material?.materialCode || row.partCode;
      const name = row.part?.material?.materialName || row.part?.partName || row.part?.partNumber || "-";
      const buy = number(row.adjustedOrderQty ?? row.plannedOrderQtyKg ?? row.plannedOrderQty ?? row.netRequirement);
      const usage = row._usage || bomUsage(row);
      const audit = supplyAudit(row);
      const partNumber = usage.parent?.partNumber || usage.output?.partNumber || "-";
      const partCode = usage.parent?.partCode || usage.output?.partCode || "-";
      return `<tr><td><b>${esc(code)}</b><small>${esc(name)}${code !== row.partCode ? ` · source ${esc(row.partCode)}` : ""}</small></td><td class="mrps-usage-cell"><b>${esc(partNumber)}</b><small>${esc(partCode)}</small></td><td class="mrps-process-cell"><span>${esc(routeLabel(usage))}</span></td><td class="mrps-number"><b>${num(row.grossRequirement)}</b><small>${esc(uom(row))}</small></td><td class="mrps-number"><b>${num(audit.warehouseAvailable + audit.embeddedWip)}</b><small>Available ${num(audit.warehouseAvailable)} · WIP ${num(audit.embeddedWip)}</small></td><td class="mrps-number"><b>${num(audit.firmSupply)}</b><small>${esc(uom(row))}</small></td><td class="mrps-number"><b>${num(row.netRequirement)}</b><small>Buy ${num(buy)} ${esc(uom(row))}</small></td><td><b>${date(row.requiredDate)}</b><small>${esc(row.procurementWindow || "Normal")}</small></td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`;
    }).join("");
  }
  function renderOrders(rows) {
    $("mrps-head").innerHTML = `<tr><th>Planned Order</th><th>Material / Part</th><th class="mrps-number">Qty ${help("Qty hasil lot sizing MRP. Qty remaining belum direlease ke proses berikutnya.")}</th><th>Order Date</th><th>Required</th><th>Reference</th><th>Status</th><th></th></tr>`;
    $("mrps-body").innerHTML = rows.map((row) => {
      const remaining = Math.max(number(row.qty) - number(row.qtyReleased), 0);
      const request = row.purchaseRequest || row.purchaseRequests?.[0];
      return `<tr><td><b>${esc(row.orderNumber)}</b><small>${esc(row.orderType || "Purchase")}</small></td><td><b>${esc(row.partCode)}</b><small>${esc(row.partName || row.part?.partName || "-")}</small></td><td class="mrps-number"><b>${num(row.qty)}</b><small>Sisa ${num(remaining)} ${esc(row.uomCode || "")}</small></td><td>${date(row.orderDate)}</td><td>${date(row.requiredDate)}</td><td>${request?.prNumber ? `<a href="/modules/purchasing/purchase-requisitions/${encodeURIComponent(request.prNumber)}">${esc(request.prNumber)}</a>` : "-"}</td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`;
    }).join("");
  }
  function renderPegging(rows) {
    $("mrps-head").innerHTML = `<tr><th>Customer / Demand</th><th>FG</th><th>Material</th><th>Target Delivery</th><th>Required</th><th class="mrps-number">Need</th><th class="mrps-number">Covered ${help("Customer pegging hanya menunjukkan asal demand. Netting material tetap dikonsolidasikan.")}</th><th>Status</th><th></th></tr>`;
    $("mrps-body").innerHTML = rows.map((row) => `<tr><td><b>${esc(row.customerCode || "-")}</b><small>${esc(row.sourceNumber || row.sourceType || "-")}</small></td><td><b>${esc(row.fgPartCode || "-")}</b></td><td><b>${esc(row.materialOrComponent || row.partCode || "-")}</b></td><td>${date(row.targetDeliveryDate)}</td><td>${date(row.requiredDate)}</td><td class="mrps-number"><b>${num(row.requirementQty)}</b></td><td class="mrps-number"><b>${num(row.supplyCoverageQty)}</b></td><td>${badge(row._state.label,row._state.tone)}</td><td><button class="mrps-row-action" type="button" data-mrps-detail="${esc(row._id)}">Rincian</button></td></tr>`).join("");
  }
  function renderTable() {
    const all = visibleRows();
    const pages = Math.max(Math.ceil(all.length / state.pageSize), 1); state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize; const rows = all.slice(start, start + state.pageSize);
    state.rows = new Map(rows.map((row) => [row._id, row]));
    if (state.view === "orders") renderOrders(rows); else if (state.view === "pegging") renderPegging(rows); else renderRequirements(rows);
    if (!rows.length) $("mrps-body").innerHTML = `<tr><td colspan="${state.view === "requirements" ? 10 : state.view === "orders" ? 8 : 9}" class="mrps-empty">Tidak ada data yang cocok.</td></tr>`;
    $("mrps-range").textContent = all.length ? `${start + 1}–${Math.min(start + state.pageSize, all.length)} dari ${all.length}` : "0 data";
    $("mrps-page").textContent = `${state.page} / ${pages}`; $("mrps-prev").disabled = state.page <= 1; $("mrps-next").disabled = state.page >= pages;
    $("mrps-loading").hidden = true; $("mrps-table-wrap").hidden = false;
  }
  function openRequirement(row) {
    const buy = number(row.adjustedOrderQty ?? row.plannedOrderQtyKg ?? row.plannedOrderQty ?? row.netRequirement);
    const usage = row._usage || bomUsage(row);
    const audit = supplyAudit(row);
    const parentTrace = (state.doc?.requirementTrace || []).find((item) => item.id === row.parentRequirementId);
    const parentDriverQty = number(parentTrace?.netRequirement ?? parentTrace?.plannedOrderQty ?? parentTrace?.grossRequirement);
    const parentPart = usage.parent || usage.output || {};
    const outputPart = usage.output || parentPart;
    const routeCards = usage.routes.length
      ? usage.routes.map((route) => `<span class="mrps-process-pill">${esc(route.code || route.name)}${route.name && route.name !== route.code ? ` · ${esc(route.name)}` : ""}</span>`).join("")
      : `<span class="mrps-process-pill muted">Proses belum dipetakan</span>`;
    const sources = row._demandSources || demandSources(row);
    const demandCards = sources.length ? sources.map((source) => `<article class="mrps-demand-card"><header><span class="mrps-demand-type ${esc(source.typeKey)}">${esc(source.type)}</span><b>${esc(source.sourceNumber)}</b></header><div><span>Customer<b>${esc(source.customerCode)}</b></span><span>FG<b>${esc(source.fgPartCode)}</b></span><span>Delivery Phase<b>${source.phaseNumber ? `Phase ${num(source.phaseNumber, 0)}` : source.type === "Buffer" ? "Buffer" : "-"}</b></span><span>Delivery Date<b>${date(source.deliveryDate)}</b></span><span>Demand Qty<b>${num(source.qty)} ${esc(uom(row))}</b></span></div></article>`).join("") : `<div class="mrps-demand-empty">Sumber Forecast/SO belum tersimpan pada requirement ini.</div>`;
    const demandSection = `<section class="mrps-trace-section"><header><b>Sumber Forecast / SO</b><small>Customer pegging &amp; delivery phase</small></header><div class="mrps-demand-list">${demandCards}</div></section>`;
    const changedSupply = Math.abs(audit.currentUncovered - number(row.netRequirement)) > .000001;
    $("mrps-drawer-title").textContent = row.part?.material?.materialCode || row.partCode;
    $("mrps-drawer-meta").textContent = row.part?.material?.materialName || row.part?.partName || row.part?.partNumber || "MRP requirement";
    $("mrps-drawer-body").innerHTML = `<section class="mrps-trace-section"><header><b>Dipakai untuk</b><small>Relasi langsung dari mBOM</small></header><div class="mrps-detail-grid"><div><span>Part Number</span><b>${esc(parentPart.partNumber || "-")}</b></div><div><span>Part Code</span><b>${esc(parentPart.partCode || "-")}</b></div><div><span>Output BOM</span><b>${esc(outputPart.partNumber || "-")}<small>${esc(outputPart.partCode || "-")}</small></b></div><div><span>mBOM</span><b>${esc(usage.bomNumber)}</b></div></div><div class="mrps-process-list"><span>Proses pemakaian</span><div>${routeCards}</div></div></section>${demandSection}<section class="mrps-trace-section"><header><b>Hasil BOM explode &amp; netting stock</b><small>Runtutan angka yang dipakai sistem</small></header><ol class="mrps-trace-steps"><li><span>1</span><div><b>Driver kebutuhan parent</b><small>${parentDriverQty ? `${num(parentDriverQty)} ${esc(parentTrace?.part?.productionUomCode || parentTrace?.part?.baseUomCode || "PCS")}` : "Mengikuti demand parent pada mBOM"}</small></div></li><li><span>2</span><div><b>Pemakaian BOM</b><small>${num(usage.qtyPerParent)} ${esc(usage.usageUom)} per parent</small></div></li><li><span>3</span><div><b>Hasil explode BOM</b><small>${num(row.grossRequirement)} ${esc(uom(row))}</small></div></li></ol><div class="mrps-equation"><span>Gross BOM<b>${num(row.grossRequirement)}</b></span><i>−</i><span>Stock available<b>${num(audit.warehouseAvailable)}</b></span><i>−</i><span>Dalam WIP / FG<b>${num(audit.embeddedWip)}</b></span><i>−</i><span>Open PO eligible<b>${num(audit.firmSupply)}</b></span><i>=</i><span class="result">Uncovered saat ini<b>${num(audit.currentUncovered)} ${esc(uom(row))}</b></span></div>${changedSupply ? `<p class="mrps-reconcile-note">Net MRP saat run: <b>${num(row.netRequirement)} ${esc(uom(row))}</b>. Angka uncovered saat ini berbeda karena saldo stock atau open PO dapat berubah setelah MRP dijalankan.</p>` : `<p class="mrps-reconcile-note success">Sesuai dengan net MRP saat run: <b>${num(row.netRequirement)} ${esc(uom(row))}</b>.</p>`}<div class="mrps-formula"><b>Rekomendasi order</b><span>Net MRP ${num(row.netRequirement)} → planned order ${num(buy)} ${esc(uom(row))}</span><span>MOQ diterapkan pada Purchase Suggestion, sehingga hasil explode dan net requirement tetap asli.</span></div></section><div class="mrps-source"><b>Sumber demand</b>MPS ${esc(state.doc?.mpsNumber || "-")} · FG utama ${esc(row.fgPartCode || row.planningPartCode || "-")} · Customer ${esc(row.planningCustomerCode || row.customerCode || "-")}</div>`;
  }
  function openOrder(row) {
    const remaining = Math.max(number(row.qty) - number(row.qtyReleased), 0);
    $("mrps-drawer-title").textContent = row.orderNumber || "Planned Order"; $("mrps-drawer-meta").textContent = row.partCode || "-";
    $("mrps-drawer-body").innerHTML = `<div class="mrps-detail-grid"><div><span>Qty order</span><b>${num(row.qty)} ${esc(row.uomCode || "")}</b></div><div><span>Remaining</span><b>${num(remaining)} ${esc(row.uomCode || "")}</b></div><div><span>Order date</span><b>${date(row.orderDate)}</b></div><div><span>Required date</span><b>${date(row.requiredDate)}</b></div><div><span>Status</span><b>${esc(row.status || "Planned")}</b></div><div><span>Reference</span><b>${esc(row.referenceNumber || state.doc?.runNumber || "-")}</b></div></div><div class="mrps-source"><b>Arti planned order</b>Rekomendasi supply dari MRP. Purchase planned order diteruskan ke Purchase Suggestion sebelum PR/PO.</div>`;
  }
  function openPegging(row) {
    $("mrps-drawer-title").textContent = row.sourceNumber || row.customerCode || "Demand"; $("mrps-drawer-meta").textContent = `${row.customerCode || "-"} · ${row.fgPartCode || "-"}`;
    $("mrps-drawer-body").innerHTML = `<div class="mrps-detail-grid"><div><span>Target delivery</span><b>${date(row.targetDeliveryDate)}</b></div><div><span>Material required</span><b>${date(row.requiredDate)}</b></div><div><span>Requirement</span><b>${num(row.requirementQty)}</b></div><div><span>Supply coverage</span><b>${num(row.supplyCoverageQty)}</b></div><div><span>Material</span><b>${esc(row.materialOrComponent || row.partCode || "-")}</b></div><div><span>Risk</span><b>${esc(row.risk || "-")}</b></div></div><div class="mrps-source"><b>Customer pegging</b>Menjaga trace demand customer. Perhitungan stock material tetap consolidated agar supply tidak dihitung berulang.</div>`;
  }
  function openDrawer(id) { const row = state.rows.get(id); if (!row) return; if (id.startsWith("order:")) openOrder(row); else if (id.startsWith("peg:")) openPegging(row); else openRequirement(row); $("mrps-drawer").setAttribute("aria-hidden", "false"); }
  function closeDrawer() { $("mrps-drawer").setAttribute("aria-hidden", "true"); }
  async function switchView(view) {
    state.view = view; state.page = 1; state.query = ""; state.filter = "ACTION"; $("mrps-search").value = ""; $("mrps-filter").value = "ACTION";
    document.querySelectorAll("[data-mrps-view]").forEach((button) => { const active = button.dataset.mrpsView === view; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    if (view === "pegging" && !state.pegging && !state.loadingPegging) {
      state.loadingPegging = true; $("mrps-table-wrap").hidden = true; $("mrps-loading").hidden = false; $("mrps-loading").textContent = "Memuat customer pegging…";
      try { state.pegging = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/customer-pegging-view`); } catch (error) { alert(error.message); state.pegging = { items: [] }; } finally { state.loadingPegging = false; }
    }
    renderTable();
  }
  function openModal(action) {
    state.action = action; $("mrps-modal-confirm").checked = false;
    if (action === "suggestion") { $("mrps-modal-title").textContent = "Buat Purchase Suggestion"; $("mrps-modal-copy").textContent = "Teruskan purchase planned order untuk direview Purchasing."; $("mrps-modal-confirm-copy").textContent = "Saya sudah meninjau shortage, qty rekomendasi, dan required date."; $("mrps-modal-submit").textContent = "Buat Purchase Suggestion"; }
    else { $("mrps-modal-title").textContent = "Buat Monthly Production Plan"; $("mrps-modal-copy").textContent = "Teruskan production planned order ke Monthly Production Plan."; $("mrps-modal-confirm-copy").textContent = "Saya sudah meninjau hasil MRP dan siap melanjutkan ke perencanaan produksi."; $("mrps-modal-submit").textContent = "Buat Monthly Plan"; }
    $("mrps-modal").setAttribute("aria-hidden", "false");
  }
  function closeModal() { $("mrps-modal").setAttribute("aria-hidden", "true"); state.action = null; }
  async function load() {
    try {
      state.doc = await api(`/modules/api/planning-ppic/material-requirements-planning/${encodeURIComponent(key)}`);
      renderHeader(); renderKpis(); renderTable(); alert("");
    } catch (error) { $("mrps-loading").textContent = error.message; alert(error.message); }
  }

  document.addEventListener("click", (event) => {
    const view = event.target.closest("[data-mrps-view]"); if (view) return void switchView(view.dataset.mrpsView);
    const detail = event.target.closest("[data-mrps-detail]"); if (detail) return openDrawer(detail.dataset.mrpsDetail);
    const action = event.target.closest("[data-mrps-action]"); if (action) return openModal(action.dataset.mrpsAction);
    if (event.target.closest("[data-close-mrps-drawer]")) return closeDrawer();
    if (event.target.closest("[data-close-mrps-modal]")) return closeModal();
  });
  $("mrps-search").addEventListener("input", (event) => { state.query = String(event.target.value || "").trim().toLowerCase(); state.page = 1; renderTable(); });
  $("mrps-filter").addEventListener("change", (event) => { state.filter = event.target.value; state.page = 1; renderTable(); });
  $("mrps-page-size").addEventListener("change", (event) => { state.pageSize = number(event.target.value) || 25; state.page = 1; renderTable(); });
  $("mrps-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderTable(); } });
  $("mrps-next").addEventListener("click", () => { state.page += 1; renderTable(); });
  $("mrps-modal-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!$("mrps-modal-confirm").checked || !state.action) return;
    const action = state.action; const button = $("mrps-modal-submit"); const original = button.textContent; button.disabled = true; button.textContent = "Memproses…";
    try {
      if (action === "suggestion") {
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/purchase-suggestions`, { method: "POST", body: "{}" });
        closeModal(); alert(`Purchase Suggestion <a href="/modules/purchasing/purchase-suggestions/${encodeURIComponent(result.suggestionNumber)}">${esc(result.suggestionNumber)}</a> berhasil dibuat.`, true, true); await load();
      } else {
        const result = await api(`/modules/api/planning-ppic/mrp/${encodeURIComponent(key)}/output/production-plan`, { method: "POST", body: "{}" });
        const plans = (result.items || []).map((item) => item.planNumber).filter(Boolean);
        closeModal(); alert(plans.length ? `Monthly Plan ${plans.map((plan) => `<a href="/modules/planning-ppic/monthly-production-plans/${encodeURIComponent(plan)}">${esc(plan)}</a>`).join(", ")} berhasil disiapkan.` : (result.message || "Monthly Production Plan berhasil disiapkan."), true, true);
      }
    } catch (error) { alert(error.message); } finally { button.disabled = false; button.textContent = original; }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeDrawer(); closeModal(); } });
  load();
})();
