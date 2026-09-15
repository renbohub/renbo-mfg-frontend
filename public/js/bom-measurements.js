(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BomMeasurements = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const materialFields = ["quotationMaterialThickness", "quotationMaterialWidth", "quotationMaterialPitch", "quotationMaterialCavity"];
  const labels = ["T / Thickness (mm)", "W / Width (mm)", "P / Pitch (mm)", "Cavity"];
  const display = (value) => value == null || value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : "";
  const parse = (value) => value === "" || value == null ? null : Number(value);
  const detailFields = (detail) => Object.fromEntries(materialFields.map((field) => [field, detail?.[field] ?? null]));
  function materialInputs(detail, gridClass = "bom-material-spec-grid") {
    return `<h3>Based on Quotation</h3><p class="small text-muted">Ukuran sesuai quotation. Kosongkan jika belum tersedia.</p><div class="${gridClass}">${materialFields.map((field, index) => `<label>${labels[index]}<input class="form-control" data-quotation-material="${field}" aria-label="${labels[index]} Quotation" type="number" min="${index === 3 ? 1 : 0.001}" step="${index === 3 ? 1 : "any"}" value="${display(detail?.[field])}" placeholder="Belum diisi"></label>`).join("")}</div>`;
  }
  function cycleInputs(process, disabled = false) {
    return `<label>Quotation<input class="form-control" data-process-field="quotationCycleTime" aria-label="Cycle time Quotation (detik / pcs)" type="number" min="0" step="any" value="${display(process.quotationCycleTime)}" placeholder="Belum diisi" ${disabled ? "disabled" : ""}></label><label>Actual<input class="form-control" data-process-field="cycleTime" aria-label="Cycle time Actual (detik / pcs)" type="number" min="0" step="any" value="${display(process.cycleTime ?? 0)}" ${disabled ? "disabled" : ""}></label>`;
  }
  function materialSummary(detail, quotation = false) {
    const fields = quotation ? materialFields : ["materialThickness", "materialWidth", "materialPitch", "materialCavity"];
    const values = fields.map((field) => detail[field] == null || detail[field] === "" ? "—" : Number(detail[field]).toLocaleString("id-ID", { maximumFractionDigits: 6 }));
    return `${values.slice(0, 3).join(" × ")} mm / CAV ${values[3]}`;
  }
  return { materialFields, detailFields, materialInputs, cycleInputs, materialSummary, parse };
});
