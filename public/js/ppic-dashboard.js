(function () {
  const cfg = JSON.parse(document.getElementById("ppic-page-config").textContent);
  const tab = cfg.activeTab;
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date(value)) : "-";
  const num = (value) => new Intl.NumberFormat("id-ID").format(Number(value || 0));
  let rows = [];
  const config = {
    mrp: { title: "Material Requirements Planning", subtitle: "Perhitungan kebutuhan material dan planned order dari MPS yang sudah dikonfirmasi.", url: "/modules/api/planning-ppic/material-requirements-planning?start=0&length=100", primary: "Run MRP", head: ["No", "MRP ID", "MPS", "Periode", "Requirements", "Planned Order", "Status", "Aksi"] },
    mps: { title: "Master Production Schedule", subtitle: "Jadwal induk produksi yang dihasilkan dari forecast bulanan customer.", url: "/modules/api/planning-ppic/master-production-schedule?start=0&length=100", primary: "Create MPS", head: ["No", "MPS ID", "Periode", "Forecast", "Produk / Part", "Qty Plan", "Status", "Aksi"] },
    "monthly-plan": { title: "Monthly Production Plans", subtitle: "Target produksi, kapasitas, dan realisasi per bulan.", url: "/modules/api/planning-ppic/monthly-plan?start=0&length=100", primary: "Create New Plan", head: ["No", "Plan ID", "Bulan", "Target Qty", "Actual Qty", "Progress", "Status", "Aksi"] },
    "consume-forecast": { title: "Material Consume Forecast", subtitle: "Monitor forecast customer yang telah digunakan sebagai demand planning.", url: "/modules/api/planning-ppic/consume-forecast?start=0&length=100", primary: "Create Forecast", head: ["No", "Forecast ID", "Periode", "Customer", "Forecast Qty", "Status", "Aksi"] },
  }[tab];
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal");
    return payload.data || payload.items || payload;
  }
  function showAlert(message, kind = "danger") {
    const box = $("ppic-alert");
    box.textContent = message;
    box.className = `alert alert-${kind}`;
  }
  function badge(status) { return `<span class="ppic-badge ${esc(String(status || "Draft").toLowerCase().replaceAll(" ", "-"))}">${esc(status || "Draft")}</span>`; }
  function detailLink(key) { return `/modules/planning-ppic/${tab}/${encodeURIComponent(key)}`; }
  function action(row) {
    if (tab === "consume-forecast") return row.status === "Confirmed" ? `<button class="ppic-link-btn" data-make-mps="${esc(row.forecastNumber)}">Buat MPS</button>` : `<a class="ppic-link-btn" href="/modules/sales/forecasts/${encodeURIComponent(row.forecastNumber)}">Lihat</a>`;
    if (tab === "mps") return row.status === "Draft" ? `<button class="ppic-link-btn" data-confirm-mps="${esc(row.mpsNumber)}">Confirm</button>` : row.status === "Confirmed" ? `<button class="ppic-link-btn" data-run-mrp="${esc(row.mpsNumber)}">Run MRP</button> <button class="ppic-link-btn" data-make-plan="${esc(row.mpsNumber)}">Production Plan</button>` : "-";
    return "-";
  }
  function render() {
    const query = $("ppic-search").value.toLowerCase();
    const visible = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
    $("ppic-head").innerHTML = `<tr>${config.head.map((head) => `<th>${head}</th>`).join("")}</tr>`;
    $("ppic-rows").innerHTML = visible.map((row, index) => {
      if (tab === "mrp") return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.runNumber)}">${esc(row.runNumber)}</a></td><td>${esc(row.mpsNumber)}</td><td>${date(row.runDate)}</td><td class="ppic-number">${num(row.totalRequirements)}</td><td class="ppic-number">${num(row.totalPlannedOrders)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
      if (tab === "mps") return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.mpsNumber)}">${esc(row.mpsNumber)}</a></td><td>${date(row.periodStart)} — ${date(row.periodEnd)}</td><td>${esc(row.forecastNumber)}</td><td>${num(row.partCount)} part</td><td class="ppic-number">${num(row.totalPlannedQty)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
      if (tab === "monthly-plan") { const target = Number(row.targetQty || 0); const actual = Number(row.actualQty || 0); const progress = target ? Math.round(actual / target * 100) : 0; return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.planNumber)}">${esc(row.planNumber)}</a></td><td>${date(row.planMonth)}</td><td class="ppic-number">${num(target)}</td><td class="ppic-number">${num(actual)}</td><td class="ppic-number">${progress}%</td><td>${badge(row.status)}</td><td>-</td></tr>`; }
      return `<tr><td>${index + 1}</td><td><a class="ppic-id" href="${detailLink(row.forecastNumber)}">${esc(row.forecastNumber)}</a></td><td>${date(row.periodStart)} — ${date(row.periodEnd)}</td><td>${esc(row.customerCode)}</td><td class="ppic-number">${num(row.totalForecastQty)}</td><td>${badge(row.status)}</td><td>${action(row)}</td></tr>`;
    }).join("") || `<tr><td colspan="${config.head.length}" class="ppic-empty">Belum ada data ${esc(config.title)}</td></tr>`;
    $("ppic-footer").innerHTML = `Menampilkan <b>${visible.length}</b> dari <b>${rows.length}</b> data`;
  }
  async function load() {
    try { rows = await api(config.url); $("ppic-title").textContent = config.title; $("ppic-subtitle").textContent = config.subtitle; $("ppic-primary").textContent = config.primary; render(); $("ppic-alert").classList.add("d-none"); }
    catch (error) { showAlert(error.message); }
  }
  $("ppic-search").addEventListener("input", render);
  $("ppic-filter").addEventListener("click", () => showAlert("Filter lanjutan akan mengikuti periode, customer, dan status dokumen.", "info"));
  $("ppic-primary").addEventListener("click", () => { if (tab === "consume-forecast") location.href = "/modules/sales/forecasts/new"; else if (tab === "mps") showAlert("Buat MPS dari baris Forecast Confirmed pada tab Consume Forecast.", "info"); else if (tab === "mrp") showAlert("Jalankan MRP dari baris MPS yang berstatus Confirmed pada tab MPS.", "info"); else showAlert("Production Plan dibuat dari MPS Confirmed setelah MRP Completed.", "info"); });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-make-mps],[data-confirm-mps],[data-run-mrp],[data-make-plan]");
    if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.makeMps) { if (!confirm(`Buat Draft MPS dari ${button.dataset.makeMps}?`)) return; const result = await api("/modules/api/planning-ppic/mps/from-forecast", { method: "POST", body: JSON.stringify({ forecastNumber: button.dataset.makeMps }) }); location.href = `/modules/planning-ppic/mps/${encodeURIComponent(result.mpsNumber)}`; }
      else if (button.dataset.confirmMps) { if (!confirm(`Konfirmasi MPS ${button.dataset.confirmMps}?`)) return; await api(`/modules/api/planning-ppic/mps/${encodeURIComponent(button.dataset.confirmMps)}/confirm`, { method: "PATCH", body: "{}" }); await load(); }
      else if (button.dataset.makePlan) { if (!confirm(`Buat Production Plan dari ${button.dataset.makePlan}?`)) return; const result = await api("/modules/api/planning-ppic/monthly-plan/from-mps", { method: "POST", body: JSON.stringify({ mpsNumber: button.dataset.makePlan }) }); const firstPlan = result.items?.[0]?.planNumber; location.href = firstPlan ? `/modules/planning-ppic/monthly-plan/${encodeURIComponent(firstPlan)}` : "/modules/planning-ppic/monthly-plan"; }
      else { if (!confirm(`Jalankan MRP untuk ${button.dataset.runMrp}?`)) return; const generated = await api("/modules/api/planning-ppic/mrp/generate-number"); const result = await api("/modules/api/planning-ppic/mrp/run", { method: "POST", body: JSON.stringify({ runNumber: generated.runNumber, mpsNumber: button.dataset.runMrp }) }); location.href = `/modules/planning-ppic/mrp/${encodeURIComponent(result.runNumber || generated.runNumber)}`; }
    } catch (error) { showAlert(error.message); }
    finally { button.disabled = false; }
  });
  load();
})();
