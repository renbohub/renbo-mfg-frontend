(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BomCanvasPanels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const qty = (value) => Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 6 });
  const option = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${esc(label)}</option>`;

  function create({ getState, partById, commercial, getRootPartId }) {
    const state = () => getState();
    const key = (node) => node.id || node.clientKey;
    const row = (node) => ({ ...node, part: partById(node.partId) });
    const processMaster = (p) => state().processMaster.find((m) => m.id === p.processId) || p.process || {};
    const vendorMode = (p) => String(p.routingMode || "INHOUSE").toUpperCase() === "VENDOR";
    function priceLink(info) {
      if (!info || info.customerSupplied) return "";
      if (info.source?.id) return `<a href="/master-data/${info.sourceSlug}/${encodeURIComponent(info.source.id)}/edit?key=${encodeURIComponent(info.source.id)}" target="_blank" rel="noopener">Buka Price List</a>`;
      const params = new URLSearchParams(Object.entries({ ...info.prefill, effectiveFrom: document.getElementById("bom-effective")?.value, source: "BOM" }).filter(([, v]) => v != null && v !== "")).toString();
      return `<a href="/master-data/${info.sourceSlug}/new?${esc(params)}" target="_blank" rel="noopener">Lengkapi price list</a>`;
    }
    function purchase(node) { return node.linkedBom ? null : commercial.purchaseInfo(row(node)); }
    function renderSourcing(node) {
      const info = purchase(node);
      const target = document.getElementById("node-sourcing");
      if (node.linkedBom) { target.innerHTML = `<p class="bom-sourcing-note">Material dan biaya komponen ini mengikuti <a href="/modules/manufacturing-bom/bill-of-materials/${encodeURIComponent(node.linkedBom.noReg)}/edit" target="_blank" rel="noopener">BOM ${esc(node.linkedBom.noReg)}</a>.</p>`; return; }
      if (node.category === "Vendor") {
        target.innerHTML = '<p class="bom-sourcing-note">Pelaksana vendor dan harga per pcs diatur pada setiap proses di tab Routing.</p>'; return;
      }
      if (!info) { target.innerHTML = '<p class="bom-sourcing-note">Komponen ini dibuat internal. Material dan part yang dibeli dikelola pada node turunannya.</p>'; return; }
      const customerSupplied = commercial.isCustomerSupplied(row(node));
      const raw = node.category === "Purchase" && commercial.isRawMaterial(row(node));
      const suppliers = state().suppliers || [];
      const customers = state().customers || [];
      const supplierId = node.supplierId || partById(node.partId).supplierId || "";
      const source = raw ? `<label>Sumber material<select class="form-select" data-node-field="materialSupplyType">${option("SUPPLIER_PURCHASE", "Beli ke supplier", node.materialSupplyType || "SUPPLIER_PURCHASE")}${option("CUSTOMER_SUPPLIED", "Disuplai customer", node.materialSupplyType)}</select></label>` : "";
      const partner = customerSupplied
        ? `<label>Customer pemilik material<select class="form-select" data-node-field="supplyCustomerId">${option("", "Pilih customer", node.supplyCustomerId)}${customers.map((c) => option(c.id, `${c.customerCode} · ${c.customerName}`, node.supplyCustomerId)).join("")}</select></label>`
        : `<label>Supplier default<select class="form-select" data-node-field="supplierId">${option("", "Pilih supplier", supplierId)}${suppliers.map((s) => option(s.id, `${s.supplierCode} · ${s.supplierName}`, supplierId)).join("")}</select></label>`;
      target.innerHTML = `<div class="bom-sourcing-fields">${source}${partner}</div><div class="bom-cost-card"><h3>${customerSupplied ? "Material milik customer" : "Harga pembelian"}</h3><dl><dt>Harga / ${info.kind === "material" ? "kg" : "unit"}</dt><dd>${info.found ? money(info.value) : "Belum tersedia"}</dd><dt>Qty harga</dt><dd>${qty(info.priceQty)} ${esc(info.qtyUnit)}</dd></dl><p>${customerSupplied ? "Nilai Rp0 valid. Material ini tidak dibuatkan Purchase Suggestion, PR, atau PO." : "Harga mengikuti supplier, material/part, dan tanggal efektif BOM."}</p>${priceLink(info)}</div>`;
    }

    function renderRouting(node, readOnly = false) {
      const target = document.getElementById("node-process-list");
      const specs = [...new Map(state().machines.filter((m) => m.machineSpecificationCode).map((m) => [m.machineSpecificationCode, m])).values()];
      target.innerHTML = (node.processes || []).map((p, index) => {
        const vendor = vendorMode(p);
        const selectedSpec = p.machineSpecificationCode || p.machine?.machineSpecificationCode || state().machines.find((m) => m.id === p.machineId)?.machineSpecificationCode || "";
        if (!vendor && !p.machineSpecificationCode) p.machineSpecificationCode = selectedSpec;
        const machine = commercial.representativeMachine(p);
        const rate = commercial.machineRateDisplay(p);
        const cost = commercial.processCost(p, row(node));
        const candidates = commercial.eligibleVendors(p, row(node));
        const vendorMaster = commercial.vendorProcessMaster(p);
        const currentVendor = state().vendors.find((v) => v.id === p.vendorId) || p.vendor;
        const staleVendor = p.vendorId && !candidates.some((c) => c.vendor.id === p.vendorId);
        const vendorOptions = option("", vendorMaster ? "Pilih vendor proses" : "Master proses vendor belum tersedia", p.vendorId)
          + (staleVendor ? option(p.vendorId, `${currentVendor?.vendorCode || p.vendorId} · periksa kelayakan vendor`, p.vendorId) : "")
          + candidates.map(({ vendor: v, rate: r }) => option(v.id, `${v.vendorCode} · ${v.vendorName} · ${r.found ? `${money(r.value)}/pcs` : "harga belum tersedia"}`, p.vendorId)).join("");
        const resource = vendor
          ? `<label class="wide">Vendor proses<select class="form-select" data-process-field="vendorId">${vendorOptions}</select><small>${candidates.length} vendor sesuai master kode proses. <a href="/master-data/vendor-processes" target="_blank" rel="noopener">Atur vendor eligible</a></small></label>`
          : `<label class="wide">Spesifikasi mesin<select class="form-select" data-process-field="machineSpecificationCode">${option("", "Pilih spesifikasi", selectedSpec)}${specs.map((m) => option(m.machineSpecificationCode, `${m.machineSpecificationCode} · ${m.machineSpecificationName || ""}`, selectedSpec)).join("")}</select></label>`;
        const costLink = vendor
          ? cost.source?.id ? `<a href="/master-data/vendor-price-lists/${encodeURIComponent(cost.source.id)}/edit?key=${encodeURIComponent(cost.source.id)}" target="_blank" rel="noopener">Buka harga vendor</a>` : `<a href="/master-data/vendor-price-lists/new?vendorId=${encodeURIComponent(p.vendorId || "")}&partId=${encodeURIComponent(node.partId || "")}&effectiveFrom=${encodeURIComponent(document.getElementById("bom-effective")?.value || "")}&source=BOM" target="_blank" rel="noopener">Lengkapi harga vendor</a>`
          : machine?.id ? `<a href="/master-data/machines/${encodeURIComponent(machine.id)}/edit?key=${encodeURIComponent(machine.machineCode || machine.id)}" target="_blank" rel="noopener">Master ${esc(machine.machineName || machine.machineCode)}</a>` : "";
        return `<article class="bom-canvas-route" data-process-index="${index}"><header><div><strong>Routing ${esc(p.routingNumber || index + 1)} · ${esc(p.occurrenceCode || processMaster(p).processCode || "Proses baru")}</strong><small>${vendor ? "Vendor process · harga per pcs" : "In-house · cycle time per pcs"}</small></div><button type="button" data-remove-process aria-label="Hapus proses ${index + 1}">×</button></header><div class="bom-route-fields"><label>Urutan<input class="form-control" data-process-field="sequence" type="number" min="1" step="1" value="${Number(p.sequence || 0)}"></label><label>Pelaksana default<select class="form-select" data-process-field="routingMode">${option("INHOUSE", "In-house", p.routingMode || "INHOUSE")}${option("VENDOR", "Vendor process", p.routingMode)}</select></label><label class="wide">Proses<select class="form-select" data-process-field="processId">${option("", "Pilih proses", p.processId)}${state().processMaster.map((m) => option(m.id, `${m.processCode} · ${m.processName}`, p.processId)).join("")}</select></label>${resource}<label class="wide">Cycle time (detik / pcs)<input class="form-control" data-process-field="cycleTime" type="number" min="0" step="any" value="${Number(p.cycleTime || 0)}" ${vendor ? "disabled" : ""}><small>${vendor ? "Harga vendor per pcs; tidak dikali cycle time." : "Estimasi biaya memakai cycle time dasar ini. Waktu per mesin untuk planning diatur di bawah."}</small></label></div>${vendor ? "" : window.BomMachinePolicy.render(p, state().machines, state().dies, node.partId)}${window.BomExecutorPolicy.render(p, state().machines, state().dies, candidates, node.partId)}<label>Catatan proses<textarea class="form-control" data-process-field="notes" rows="2">${esc(p.notes || "")}</textarea></label><div class="bom-canvas-cost ${cost.found ? "" : "missing"}"><div>${vendor ? "Biaya vendor / unit" : `Rate ${rate.found ? `${money(rate.value)} ${esc(rate.unit)}` : "belum tersedia"}`}<small>${costLink}</small></div><strong>${cost.found ? money(cost.value) : "Belum lengkap"}</strong></div></article>`;
      }).join("") || '<div class="bom-process-empty">Belum ada proses. Tambahkan routing in-house atau vendor.</div>';
      if (readOnly) target.querySelectorAll("input,select,textarea,button").forEach((c) => c.disabled = true);
    }

    function validate() {
      const nodes = state().nodes;
      const byKey = new Map(nodes.map((n) => [key(n), n]));
      const errors = []; const warnings = []; const edges = new Set();
      for (const n of nodes) {
        const label = partById(n.partId).partCode || key(n);
        if (!n.partId || !(Number(n.qty) > 0)) errors.push(`${label}: part dan qty harus valid.`);
        if (n.parentDetailId && !byKey.has(n.parentDetailId)) errors.push(`${label}: parent tidak ditemukan.`);
        const seen = new Set([key(n)]); let parent = n.parentDetailId;
        while (parent && byKey.has(parent)) { if (seen.has(parent)) { errors.push(`${label}: hubungan parent-child membentuk siklus.`); break; } seen.add(parent); parent = byKey.get(parent).parentDetailId; }
        if (n.external) continue;
        if (n.category === "Vendor" && !(n.processes || []).some(vendorMode)) errors.push(`${label}: kategori Proses outsource wajib memiliki routing Vendor.`);
        const edge = [n.parentDetailId, n.partId, n.category, n.uomCode].join("|");
        if (edges.has(edge)) warnings.push(`${label}: komponen muncul lebih dari sekali pada parent yang sama.`); edges.add(edge);
        const sequences = new Set();
        for (const p of n.processes || []) {
          if (!p.processId || !Number.isInteger(Number(p.sequence)) || Number(p.sequence) < 1 || sequences.has(Number(p.sequence))) errors.push(`${label}: proses dan urutan harus valid serta tidak duplikat.`);
          sequences.add(Number(p.sequence));
          if (vendorMode(p) && !commercial.eligibleVendors(p, row(n)).some(({ vendor }) => vendor.id === p.vendorId)) errors.push(`${label}: pilih vendor yang sesuai master kode proses.`);
        }
        if (commercial.isCustomerSupplied(row(n)) && !n.supplyCustomerId) errors.push(`${label}: pilih customer pemilik material.`);
      }
      return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
    }

    function estimate(node, ancestors = new Set()) {
      if (ancestors.has(key(node))) return { material: 0, process: 0, total: 0, covered: 0, lines: 0 };
      const seen = new Set(ancestors).add(key(node)); const factor = Math.max(Number(node.qty || 0), 0);
      const p = purchase(node); const process = commercial.processEstimate(row(node));
      const result = { material: p ? p.value * p.priceQty : 0, process: process.value * factor, covered: process.covered + Number(Boolean(p?.found)), lines: process.lines + Number(Boolean(p)) };
      if (node.linkedBom && !node.linkedBomLoaded && !state().nodes.some((n) => n.parentDetailId === key(node))) result.lines += 1;
      for (const child of state().nodes.filter((n) => n.parentDetailId === key(node))) {
        const subtotal = estimate(child, seen); result.material += subtotal.material * factor; result.process += subtotal.process * factor; result.covered += subtotal.covered; result.lines += subtotal.lines;
      }
      return { ...result, total: result.material + result.process };
    }
    function renderCosts(node) {
      const own = commercial.processEstimate(row(node)); const info = purchase(node); const total = estimate(node);
      const rows = (node.processes || []).map((p) => { const cost = commercial.processCost(p, row(node)); return `<div class="bom-canvas-cost ${cost.found ? "" : "missing"}"><span>${esc(p.occurrenceCode || processMaster(p).processCode || "Proses")} · ${vendorMode(p) ? "Vendor" : "In-house"}</span><strong>${cost.found ? money(cost.value) : "Rate belum ada"}</strong></div>`; }).join("");
      document.getElementById("node-cost-breakdown").innerHTML = `<div class="bom-cost-card"><h3>Biaya komponen dan turunannya</h3><dl><dt>Qty pada parent</dt><dd>${qty(node.qty)} ${esc(node.uomCode)}</dd><dt>Material / pembelian</dt><dd>${money(total.material)}</dd><dt>Proses in-house &amp; vendor</dt><dd>${money(total.process)}</dd><dt>Estimasi subtotal</dt><dd>${money(total.total)}</dd><dt>Harga / rate tersedia</dt><dd>${total.covered} / ${total.lines}</dd></dl><p>${total.covered < total.lines ? "Estimasi belum lengkap; harga/rate yang belum tersedia belum termasuk subtotal." : "Estimasi mengikuti qty struktur dan tanggal efektif BOM."}</p></div>${info ? `<div class="bom-cost-card"><h3>${info.customerSupplied ? "Material customer · Rp0" : "Harga pembelian"}</h3><p>${info.found ? `${money(info.value)} × ${qty(info.priceQty)} ${esc(info.qtyUnit)}` : "Lengkapi price list untuk supplier dan part/material terpilih."}</p>${priceLink(info)}</div>` : ""}<div class="bom-cost-card"><h3>Proses per unit komponen</h3>${rows || '<p>Belum ada routing proses.</p>'}<div class="bom-canvas-cost"><span>Total ${qty(own.seconds)} detik in-house</span><strong>${money(own.value)}</strong></div></div>`;
    }
    function renderOverview() {
      const total = state().nodes.filter((n) => !n.parentDetailId).reduce((sum, n) => { const cost = estimate(n); for (const k of ["total", "material", "process", "covered", "lines"]) sum[k] += cost[k]; return sum; }, { total: 0, material: 0, process: 0, covered: 0, lines: 0 });
      const fields = { "canvas-summary-parts": state().nodes.filter((n) => !n.external).length, "canvas-summary-material": money(total.material), "canvas-summary-process": money(total.process), "canvas-summary-total": money(total.total), "canvas-summary-coverage": `${total.covered} / ${total.lines}` };
      Object.entries(fields).forEach(([id, value]) => document.getElementById(id).textContent = value);
      const validation = validate(); const issues = [...validation.errors, ...validation.warnings];
      if (total.covered < total.lines) issues.push(`${total.lines - total.covered} harga/rate belum tersedia. Estimasi belum lengkap.`);
      if (state().omittedNodes?.length) issues.push(`${state().omittedNodes.length} detail turunan dikelola pada BOM asal dan ditampilkan sebagai referensi.`);
      document.getElementById("canvas-graph-validation").innerHTML = issues.length ? `<details class="${validation.errors.length ? "invalid" : ""}"><summary>${validation.errors.length ? `${validation.errors.length} hal perlu diperbaiki sebelum simpan` : "Periksa kelengkapan BOM"} · ${issues.length} catatan</summary><ul>${issues.map((message) => `<li>${esc(message)}</li>`).join("")}</ul></details>` : "Struktur BOM siap diperiksa. Pilih komponen untuk melihat material, routing, dan biaya.";
      return validation;
    }
    return { renderSourcing, renderRouting, renderCosts, renderOverview, validate, estimate };
  }
  return { create };
});
