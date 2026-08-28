(function () {
  const state = { rows: [], report: null, selectedKey: "", chart: null };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const num = (value, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(value || 0));
  const money = (value) => new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(Number(value || 0));
  const duration = (seconds) => {
    const total = Number(seconds || 0);
    if (total < 60) return `${num(total, 0)} dtk`;
    const hours = Math.floor(total / 3600); const minutes = Math.round((total % 3600) / 60);
    return hours ? `${num(hours)}j ${num(minutes)}m` : `${num(minutes)} menit`;
  };
  const sourceLabel = (type) => type === "SALES_ORDER" ? "Sales Order" : type === "FORECAST" ? "Forecast" : "Belum terhubung";
  const priceSourceLabel = (value) => ({ PURCHASE_INVOICE:"Purchase Invoice", GOODS_RECEIPT:"Goods Receipt", PART_PRICE_FALLBACK:"Master Part Price (fallback)", MATERIAL_PRICE_FALLBACK:"Master Material Price (fallback)", PRICE_MISSING:"Harga belum tersedia" }[value] || value || "—");

  function showAlert(message = "") {
    $("production-cost-alert").textContent = message;
    $("production-cost-alert").classList.toggle("d-none", !message);
  }

  function renderSummary() {
    const summary = state.report?.summary || {};
    $("cost-summary-plan").textContent = money(summary.plannedCost);
    $("cost-summary-actual").textContent = money(summary.actualCost);
    $("cost-summary-variance").textContent = `${Number(summary.varianceCost || 0) > 0 ? "+" : ""}${money(summary.varianceCost)}`;
    $("cost-summary-variance-percent").textContent = `${Number(summary.variancePercent || 0) > 0 ? "+" : ""}${num(summary.variancePercent, 1)}% terhadap plan`;
    $("cost-summary-runtime").textContent = duration(summary.runtimeSeconds);
    $("cost-summary-output").textContent = num(summary.actualGoodQty, 2);
    $("cost-summary-coverage").textContent = `${num(summary.materialPriceCoveragePercent, 1)}%`;
    const varianceCard = $("cost-summary-variance-card");
    varianceCard.classList.toggle("positive", Number(summary.varianceCost || 0) > 0);
    varianceCard.classList.toggle("negative", Number(summary.varianceCost || 0) < 0);
  }

  function renderChart() {
    state.chart?.destroy();
    const root = $("production-cost-chart"); root.innerHTML = "";
    const summary = state.report?.summary || {};
    const methodology = state.report?.methodology || {};
    $("production-cost-method").innerHTML = `<strong>Formula:</strong> ${esc(methodology.machine || "Runtime aktual dikalikan machine rate.")}<br>${esc(methodology.purchased || "Qty issue dinilai dari transaksi pembelian aktual.")}`;
    if (!window.ApexCharts) { root.textContent = "Grafik tidak tersedia."; return; }
    state.chart = new ApexCharts(root, {
      chart: { type:"bar", height:280, toolbar:{show:false} },
      series: [
        { name:"Plan", data:[summary.plannedCost ? state.rows.reduce((sum,row)=>sum+Number(row.plannedMaterialCost||0),0) : 0, state.rows.reduce((sum,row)=>sum+Number(row.plannedPurchasePartCost||0),0), state.rows.reduce((sum,row)=>sum+Number(row.plannedMachineCost||0),0), state.rows.reduce((sum,row)=>sum+Number(row.plannedVendorCost||0),0)] },
        { name:"Actual", data:[summary.materialCost||0, summary.purchasePartCost||0, summary.machineCost||0, summary.vendorCost||0] },
      ],
      xaxis: { categories:["Raw Material","Purchase Part","Mesin","Vendor"] },
      plotOptions: { bar:{horizontal:false,columnWidth:"54%",borderRadius:3} },
      colors:["#7aa5d3","#e8872c"], dataLabels:{enabled:false}, legend:{position:"top",horizontalAlign:"left"},
      yaxis:{labels:{formatter:(value)=>num(value)}}, tooltip:{shared:true,intersect:false,y:{formatter:(value)=>money(value)}},
    });
    state.chart.render();
  }

  function renderRows() {
    $("production-cost-count").textContent = `${num(state.report?.total || state.rows.length)} sumber demand`;
    $("production-cost-rows").innerHTML = state.rows.map((row) => {
      const selected = row.key === state.selectedKey;
      const over = Number(row.varianceCost || 0) > 0;
      const complete = Number(row.materialPriceCoveragePercent || 0) >= 100;
      return `<tr class="${selected ? "is-selected" : ""}">
        <td><button class="btn btn-sm btn-outline-primary" type="button" data-cost-detail="${esc(row.key)}">Detail</button></td>
        <td><span class="production-cost-source"><span class="production-cost-pill ${row.sourceType === "FORECAST" ? "forecast" : ""}">${esc(sourceLabel(row.sourceType))}</span><strong>${esc(row.sourceNumber)}</strong><small>${esc(row.mpsNumber || "—")}</small></span></td>
        <td>${esc(row.customerCode || "—")}</td><td><span class="production-cost-part"><strong>${esc(row.partCode)}</strong><small>${esc(row.partName)} · ${esc(row.partNumber)}</small></span></td>
        <td>${num(row.plannedQty,2)}</td><td>${num(row.actualGoodQty,2)}</td><td>${esc(duration(row.runtimeSeconds))}</td>
        <td>${money(row.plannedMaterialCost)}</td><td>${money(row.plannedPurchasePartCost)}</td><td>${money(row.plannedMachineCost)}</td><td>${money(row.plannedVendorCost)}</td><td><strong>${money(row.plannedTotalCost)}</strong></td>
        <td>${money(row.actualMaterialCost)}</td><td>${money(row.actualPurchasePartCost)}</td><td>${money(row.actualMachineCost)}</td><td>${money(row.actualVendorCost)}</td><td><strong>${money(row.actualTotalCost)}</strong></td>
        <td><span class="production-cost-variance ${over ? "over" : "under"}">${Number(row.varianceCost||0)>0?"+":""}${money(row.varianceCost)}<small> (${num(row.variancePercent,1)}%)</small></span></td>
        <td>${money(row.actualCostPerGoodUnit)}</td><td><span class="production-cost-coverage ${complete ? "complete" : ""}">${num(row.materialPriceCoveragePercent,1)}%</span></td>
      </tr>`;
    }).join("") || '<tr><td colspan="20" class="text-center p-4 text-muted">Belum ada schedule atau transaksi produksi pada filter ini.</td></tr>';
  }

  function emptyRow(colspan, label) { return `<tr><td colspan="${colspan}" class="empty">${esc(label)}</td></tr>`; }
  function renderDetail(row) {
    const panel = $("production-cost-detail");
    if (!row) { panel.classList.add("d-none"); return; }
    $("production-cost-detail-title").textContent = `${sourceLabel(row.sourceType)} ${row.sourceNumber} · ${row.partCode}`;
    $("production-cost-detail-subtitle").textContent = `${row.partName} · runtime ${duration(row.runtimeSeconds)} · actual ${money(row.actualTotalCost)}`;
    $("production-cost-machine-detail").innerHTML = (row.machineDetails || []).map((item) => `<tr><td><strong>${esc(item.machineCode)}</strong><small>${esc(item.machineName)}</small></td><td>${num(item.logCount)}</td><td>${esc(duration(item.runtimeSeconds))}</td><td>${money(item.amount)}</td></tr>`).join("") || emptyRow(4,"Belum ada production log dengan runtime.");
    $("production-cost-material-detail").innerHTML = (row.materialDetails || []).map((item) => `<tr><td><strong>${esc(item.type === "MATERIAL" ? "Raw Material" : "Purchase Part")} · ${esc(item.itemCode)}</strong><small>${esc(item.itemName)}</small></td><td>${num(item.qty,4)} ${esc(item.uomCode)}</td><td>${money(item.rate)}</td><td>${money(item.amount)}</td><td>${esc(priceSourceLabel(item.priceSource))}</td></tr>`).join("") || emptyRow(5,"Belum ada Material Issue pada periode ini.");
    $("production-cost-vendor-detail").innerHTML = (row.vendorDetails || []).map((item) => `<tr><td><strong>${esc(item.orderNumber)}</strong><small>${esc(item.processCode)} · ${esc(item.processName)}</small></td><td>${esc(item.vendorCode)}<small>${esc(item.vendorName)}</small></td><td>${num(item.qtyReceived,4)}</td><td>${money(item.amount)}</td></tr>`).join("") || emptyRow(4,"Belum ada actual vendor process pada periode ini.");
    panel.classList.remove("d-none");
  }

  async function load({ resetSelection = false } = {}) {
    showAlert("");
    if (resetSelection) state.selectedKey = "";
    const query = new URLSearchParams({ month:$("production-cost-month").value, sourceType:$("production-cost-source").value, q:$("production-cost-search").value, start:"0", length:"500" });
    try {
      const response = await fetch(`/modules/api/production/production-cost-report?${query}`, { headers:{Authorization:`Bearer ${token()}`} });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Production cost report gagal dimuat.");
      state.rows = payload.data || []; state.report = payload.report || {};
      if (!state.rows.some((row) => row.key === state.selectedKey)) state.selectedKey = "";
      renderSummary(); renderChart(); renderRows(); renderDetail(state.rows.find((row) => row.key === state.selectedKey));
    } catch (error) {
      state.rows=[]; state.report={summary:{},methodology:{}}; renderSummary(); renderChart(); renderRows(); renderDetail(null); showAlert(error.message);
    }
  }

  let timer;
  $("production-cost-rows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cost-detail]"); if (!button) return;
    state.selectedKey = button.dataset.costDetail; renderRows(); renderDetail(state.rows.find((row) => row.key === state.selectedKey));
    $("production-cost-detail").scrollIntoView({ behavior:"smooth", block:"start" });
  });
  $("production-cost-detail-close").addEventListener("click", () => { state.selectedKey=""; renderRows(); renderDetail(null); });
  $("production-cost-month").addEventListener("change", () => load({resetSelection:true}));
  $("production-cost-source").addEventListener("change", () => load({resetSelection:true}));
  $("production-cost-refresh").addEventListener("click", () => load());
  $("production-cost-search").addEventListener("input", () => { clearTimeout(timer); timer=setTimeout(()=>load({resetSelection:true}),300); });
  $("production-cost-export").addEventListener("click", function () {
    window.SharedDataTable?.exportTablePayload?.({ title:"Production Cost Report", subtitle:`Periode ${$("production-cost-month").value} · ${$("production-cost-source").selectedOptions[0].text}`, fileName:`production-cost-${$("production-cost-month").value}`, headers:["Source Type","Source Number","Customer","Part Code","Part Name","Plan Qty","Good Qty","Runtime Seconds","Plan Material","Plan Purchase","Plan Machine","Plan Vendor","Total Plan","Actual Material","Actual Purchase","Actual Machine","Actual Vendor","Total Actual","Variance","Variance %","Actual Cost / Good","Price Coverage %"], rows:state.rows.map((row)=>[sourceLabel(row.sourceType),row.sourceNumber,row.customerCode,row.partCode,row.partName,row.plannedQty,row.actualGoodQty,row.runtimeSeconds,row.plannedMaterialCost,row.plannedPurchasePartCost,row.plannedMachineCost,row.plannedVendorCost,row.plannedTotalCost,row.actualMaterialCost,row.actualPurchasePartCost,row.actualMachineCost,row.actualVendorCost,row.actualTotalCost,row.varianceCost,row.variancePercent,row.actualCostPerGoodUnit,row.materialPriceCoveragePercent]) }, "xlsx", this);
  });
  load();
}());
