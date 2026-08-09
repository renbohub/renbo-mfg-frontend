(function () {
  const config = JSON.parse(document.getElementById("sto-count-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const NONE = "__NONE__";
  let record = null;

  function show(message, type = "danger") {
    const box = $("sto-count-alert");
    box.textContent = message;
    box.className = `alert alert-${type}`;
  }
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Stock Opname gagal diproses.");
    return payload.data || payload;
  }
  const details = () => Array.isArray(record?.details) ? record.details : [];
  const normalize = (value) => String(value || "").trim().toUpperCase();
  const physicalValue = (value) => value == null || String(value).trim() === "" ? NONE : String(value);
  const payloadValue = (value) => value === NONE ? null : value;
  const unique = (values) => [...new Set(values.filter((value) => value != null && String(value).trim()).map(String))].sort((a, b) => a.localeCompare(b));
  const materialSize = (row) => [row.thickness, row.width].every((value) => value != null && String(value) !== "")
    ? `${row.thickness} × ${row.width}`
    : row.thickness != null ? `t ${row.thickness}` : row.width != null ? `w ${row.width}` : "";
  const materialLabel = (row) => [row.materialName, materialSize(row), row.materialCode].filter(Boolean).join(" — ");

  function fill(id, values, placeholder, includeNone = false, noneLabel = "Tanpa data") {
    const select = $(id);
    const current = select.value;
    const options = unique(values);
    select.innerHTML = `<option value="">${esc(placeholder)}</option>${includeNone ? `<option value="${NONE}">${esc(noneLabel)}</option>` : ""}${options.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }
  function fillLabeled(id, items, placeholder) {
    const select = $(id);
    const current = select.value;
    const uniqueItems = items.filter((item, index, rows) => item.value && rows.findIndex((candidate) => candidate.value === item.value) === index)
      .sort((left, right) => left.label.localeCompare(right.label));
    select.innerHTML = `<option value="">${esc(placeholder)}</option>${uniqueItems.map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }
  const isMaterial = () => normalize($("sto-stock-type").value) === "MATERIAL";
  const stockRows = () => details().filter((row) => row.stockType === $("sto-stock-type").value);
  function identityRows() {
    let rows = stockRows();
    if (isMaterial()) {
      const materialType = $("sto-material-type").value;
      const materialIdentity = $("sto-material-identity").value;
      if (materialType) rows = rows.filter((row) => row.materialType === materialType);
      if (materialIdentity) rows = rows.filter((row) => [row.materialCode, row.materialName].includes(materialIdentity));
    } else {
      const partIdentity = $("sto-part-identity").value;
      const partName = $("sto-part-name").value;
      if (partIdentity) rows = rows.filter((row) => [row.partNumber, row.partCode].includes(partIdentity));
      if (partName) rows = rows.filter((row) => row.partName === partName);
    }
    return rows;
  }
  function refreshLots() {
    let rows = identityRows();
    const rack = $("sto-rack").value;
    if (rack) rows = rows.filter((row) => physicalValue(row.rackCode) === rack);
    fill("sto-lot", rows.map((row) => row.lotNumber), "Pilih lot", rows.some((row) => !row.lotNumber), "Tanpa lot");
  }
  function refreshLocations() {
    const rows = identityRows();
    fill("sto-rack", rows.map((row) => row.rackCode), "Pilih rack", rows.some((row) => !row.rackCode), "Tanpa rack");
    refreshLots();
  }
  function refreshPartNames() {
    let rows = stockRows();
    const identity = $("sto-part-identity").value;
    if (identity) rows = rows.filter((row) => [row.partNumber, row.partCode].includes(identity));
    fill("sto-part-name", rows.map((row) => row.partName), "Pilih part name");
    refreshLocations();
  }
  function refreshMaterialIdentities() {
    let rows = stockRows();
    const type = $("sto-material-type").value;
    if (type) rows = rows.filter((row) => row.materialType === type);
    fillLabeled("sto-material-identity", rows.map((row) => ({
      value: row.materialCode || row.materialName,
      label: materialLabel(row),
    })), "Pilih material name / code");
    refreshLocations();
  }
  function refreshStockFields() {
    const hasStockType = Boolean($("sto-stock-type").value);
    const material = isMaterial();
    document.querySelectorAll("[data-material-field]").forEach((field) => field.classList.toggle("d-none", !hasStockType || !material));
    document.querySelectorAll("[data-part-field]").forEach((field) => field.classList.toggle("d-none", !hasStockType || material));
    $("sto-material-type").required = hasStockType && material;
    $("sto-material-identity").required = hasStockType && material;
    $("sto-part-identity").required = hasStockType && !material;
    $("sto-part-name").required = hasStockType && !material;
    if (!hasStockType) {
      fill("sto-rack", [], "Pilih jenis stock terlebih dahulu");
      fill("sto-lot", [], "Pilih identitas barang terlebih dahulu");
      return;
    }
    if (material) {
      fill("sto-material-type", stockRows().map((row) => row.materialType), "Pilih jenis material");
      refreshMaterialIdentities();
    } else {
      fill("sto-part-identity", stockRows().map((row) => row.partNumber || row.partCode), "Pilih Part No / Part Code");
      refreshPartNames();
    }
  }
  function render() {
    $("sto-count-number").textContent = record.stoNo || config.stoNo;
    $("sto-count-scope").textContent = `${record.stoType || "-"} · ${record.warehouseCode || "-"}`;
    $("sto-count-progress").textContent = `${record.countSummary?.countedLines || 0} / ${record.countSummary?.totalLines || 0} dihitung`;
    fill("sto-stock-type", details().map((row) => row.stockType), "Pilih jenis stock");
    refreshStockFields();
    const counted = details().filter((row) => row.actualQty != null);
    $("sto-counted-body").innerHTML = counted.map((row) => `<tr><td>${esc(row.stockType || "-")}</td><td>${esc(normalize(row.stockType) === "MATERIAL" ? materialLabel(row) : row.partNumber || row.partCode || "-")}</td><td>${esc(row.partName || "-")}</td><td>${esc(row.rackCode || "Tanpa rack")}</td><td>${esc(row.lotNumber || "Tanpa lot")}</td><td><b>${esc(row.actualQty)} ${esc(row.uomCode || "")}</b></td><td>${esc(row.countedBy || "-")}</td></tr>`).join("") || '<tr><td colspan="7" class="text-center text-muted p-4">Belum ada hasil hitung yang disimpan.</td></tr>';
  }
  async function load() {
    try {
      record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}`);
      $("sto-count-loading").classList.add("d-none");
      if (normalize(record.status) !== "COUNTING") {
        show(`Form input hanya tersedia setelah Stock Opname dimulai. Status saat ini: ${record.status || "-"}.`, "warning");
        return;
      }
      $("sto-count-page").classList.remove("d-none");
      render();
    } catch (error) { $("sto-count-loading").classList.add("d-none"); show(error.message); }
  }

  $("sto-stock-type").addEventListener("change", refreshStockFields);
  $("sto-material-type").addEventListener("change", refreshMaterialIdentities);
  $("sto-material-identity").addEventListener("change", refreshLocations);
  $("sto-part-identity").addEventListener("change", refreshPartNames);
  $("sto-part-name").addEventListener("change", refreshLocations);
  $("sto-rack").addEventListener("change", refreshLots);
  $("sto-count-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const body = {
      stockType: $("sto-stock-type").value,
      materialType: isMaterial() ? $("sto-material-type").value : null,
      materialIdentity: isMaterial() ? $("sto-material-identity").value : null,
      partIdentity: isMaterial() ? null : $("sto-part-identity").value,
      partName: isMaterial() ? null : $("sto-part-name").value,
      rackCode: payloadValue($("sto-rack").value),
      lotNumber: payloadValue($("sto-lot").value),
      actualQty: Number($("sto-actual-qty").value),
    };
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/blind-count`, { method: "PATCH", body: JSON.stringify(body) });
      $("sto-actual-qty").value = "";
      show("Hasil hitung berhasil disimpan.", "success");
      render();
    } catch (error) { show(error.message); }
    finally { button.disabled = false; }
  });
  $("sto-finish-counting").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/submit`, { method: "PATCH", body: "{}" });
      show("Counting selesai dan sudah dikirim ke reviewer.", "success");
      setTimeout(() => location.assign(`/modules/inventory/stock-opname/${encodeURIComponent(config.stoNo)}`), 500);
    } catch (error) { show(error.message); event.currentTarget.disabled = false; }
  });
  load();
})();
