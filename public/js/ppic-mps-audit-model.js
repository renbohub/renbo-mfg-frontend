(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PpicMpsAuditModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const number = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value));
  const units = { hour: "jam", minute: "menit", field: "data", resource: "resource" };
  const qty = (value, unit) => finite(value) ? `${number(value)}${unit ? ` ${units[unit] || unit}` : ""}` : "Belum tersedia";
  function measure(value) {
    if (value == null) return "Belum tersedia";
    const raw = typeof value === "object" ? value.value : value;
    const display = typeof value === "object" ? value.display : value;
    if (/^\d{4}-\d{2}-\d{2}T/.test(String(raw || display)) && Number.isFinite(new Date(raw || display).getTime())) return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(raw || display));
    if (finite(raw)) return qty(raw, value.unit);
    return display && display !== "—" ? String(display) : "Belum tersedia";
  }
  const expected = {
    MPS_MATERIAL: "Material cukup saat mulai proses; beli sebelum batas waktu",
    MPS_CAPACITY: "Beban produksi ≤ kapasitas tersedia",
    MPS_VENDOR: "Vendor kembali tepat waktu sesuai lead time BOM",
    MASTER_DATA_READY: "Data wajib lengkap", FG_COVERAGE_AT_DUE_DATE: "Saldo FG ≥ 0 saat dibutuhkan",
    MATERIAL_READY_BY_START: "Seluruh material siap saat dibutuhkan", FIRM_SUPPLY_ON_TIME: "Receipt cukup & ETA terkonfirmasi",
    CAPACITY_AVAILABLE: "Kebutuhan jam ≤ kapasitas tersedia", RESOURCE_CALENDAR_AVAILABLE: "Mesin, tool & shift tersedia",
    ROUTING_SEQUENCE_VALID: "Urutan valid, tanpa overlap", LOT_BATCH_YIELD_VALID: "Lot & yield sesuai kebijakan",
    LEAD_TIME_AND_FINISH_FIT: "Selesai sebelum target", QUALITY_RELEASE_READY: "QC released sebelum dispatch",
    DELIVERY_SLOT_AVAILABLE: "Slot kirim tersedia & tiba tepat waktu", BUFFER_POLICY_MET: "Stok akhir ≥ target buffer",
  };
  function facts(check = {}) {
    const actual = check.actual || {}; const requirement = check.requirement || {};
    const unit = actual.unit || requirement.unit || check.unit || "";
    const data = { label: check.label || check.code, actual: measure(actual), expected: measure(requirement), gap: measure(check.gap), reason: check.reason || "Hasil evaluasi belum tersedia.", action: check.recommendation || "Lengkapi data lalu hitung ulang MPS." };
    if (data.expected === "Belum tersedia") data.expected = expected[check.code] || "Sesuai rule planning";
    if (data.gap === "Belum tersedia") data.gap = "Belum dihitung";
    if (check.status === "NOT_CHECKED") {
      data.reason = check.reason || "Data penilaian belum lengkap.";
      data.action = "Lengkapi data yang belum tersedia, lalu klik Periksa Checksheet.";
    }
    if (check.code === "BUFFER_POLICY_MET") {
      data.label = "Stok akhir setelah demand";
      data.actual = qty(actual.projectedEndingQty ?? actual.value, unit);
      data.expected = finite(actual.targetBufferQty ?? requirement.value) ? `≥ ${qty(actual.targetBufferQty ?? requirement.value, unit)}` : expected.BUFFER_POLICY_MET;
      const gap = check.gap?.value;
      if (finite(gap)) {
        data.gap = Number(gap) < 0 ? `Kurang ${qty(-Number(gap), unit)}` : Number(gap) > 0 ? `Lebih ${qty(gap, unit)}` : "Sesuai target";
        data.reason = Number(gap) < 0 ? "Stok akhir belum mencapai target buffer." : "Stok akhir sudah menutup target buffer.";
      }
      if (["FAIL", "WARNING"].includes(check.status)) data.action = "Tinjau tambahan produksi buffer sesuai kapasitas dan material.";
    }
    if (check.code === "MASTER_DATA_READY") {
      data.actual = check.status === "PASS" ? "Lengkap" : "Data belum lengkap";
      data.expected = expected.MASTER_DATA_READY;
      data.gap = (check.missingFields || []).length ? `${check.missingFields.length} data belum tersedia` : check.status === "PASS" ? "Sesuai" : "Belum diperiksa";
    }
    if (check.code === "CAPACITY_AVAILABLE") {
      data.actual = finite(actual.requiredCapacityHours) ? `${qty(actual.requiredCapacityHours, "hour")} dibutuhkan` : measure(actual);
      data.expected = finite(actual.netAvailableCapacityHours) ? `≤ ${qty(actual.netAvailableCapacityHours, "hour")} tersedia` : expected.CAPACITY_AVAILABLE;
      if (finite(actual.capacityGapHours)) data.gap = Number(actual.capacityGapHours) < 0 ? `Kurang ${qty(-actual.capacityGapHours, "hour")}` : `Sisa ${qty(actual.capacityGapHours, "hour")}`;
    }
    if (check.code === "FG_COVERAGE_AT_DUE_DATE") {
      data.label = "Saldo FG saat dibutuhkan"; data.expected = "≥ 0 setelah demand";
      if (finite(actual.projectedFgAtDue)) data.actual = qty(actual.projectedFgAtDue, unit);
    }
    if (check.code === "MATERIAL_READY_BY_START") {
      // Never present the sum of different component units as one material qty.
      data.actual = finite(actual.shortageComponentCount) ? `${number(actual.shortageComponentCount)} komponen kurang` : "Coverage belum lengkap";
      data.expected = "0 komponen kurang / terlambat";
      data.gap = finite(actual.maxMaterialLateDays) && Number(actual.maxMaterialLateDays) > 0 ? `${number(actual.maxMaterialLateDays)} hari terlambat` : finite(actual.shortageComponentCount) && Number(actual.shortageComponentCount) > 0 ? "Perlu tambahan supply" : "Lihat per material";
    }
    if (["LEAD_TIME_AND_FINISH_FIT", "QUALITY_RELEASE_READY", "DELIVERY_SLOT_AVAILABLE"].includes(check.code) && data.expected !== expected[check.code]) data.expected = `≤ ${data.expected}`;
    if (check.code === "LEAD_TIME_AND_FINISH_FIT" && finite(check.gap?.value)) {
      const minutes = Number(check.gap.value);
      data.gap = minutes < 0 ? `Terlambat ${qty(-minutes / 60, "hour")}` : `Sisa ${qty(minutes / 60, "hour")}`;
    }
    if (check.status === "NOT_CHECKED" && check.code === "FIRM_SUPPLY_ON_TIME") data.gap = "Belum dihitung";
    // A known material shortage must remain visible even when its supply ETA is missing.
    data.reason = data.reason.replace(/(\d+) child batch berstatus NOT_CHECKED\. /, "$1 batch belum dievaluasi. ").replace(/(\d+) child batch berstatus FAIL\. /, "$1 batch gagal. ").replace(/(\d+) child batch berstatus WARNING\. /, "$1 batch berisiko. ");
    return data;
  }
  function groupedStatus(checks = []) {
    const applicable = checks.filter((check) => check.status !== "NA");
    if (!checks.length) return "NOT_CHECKED";
    if (!applicable.length) return "NA";
    return ["FAIL", "NOT_CHECKED", "WARNING", "PASS"].find((status) => applicable.some((check) => check.status === status)) || "NOT_CHECKED";
  }
  return { facts, measure, groupedStatus };
}));
