(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MonthlyPricing = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const labels = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const number = (v) => v == null || v === "" ? null : Number(v);
  const money = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
  const editors = new WeakMap();
  let editorSequence = 0;

  function yearOf(record, fallback = new Date().getFullYear()) { return Number(record.pricingYear || String(record.effectiveFrom || "").slice(0, 4) || fallback); }
  function values(record, header = record) {
    const result = Object.fromEntries(months.map((m) => [m, record[m] ?? null]));
    if (record.unitPrice != null && record.unitPrice !== "") {
      const year = yearOf(header); const from = String(header.effectiveFrom || `${year}-01-01`).slice(0, 10); const until = String(header.effectiveUntil || `${year}-12-31`).slice(0, 10);
      months.forEach((m, i) => { const month = `${year}-${String(i + 1).padStart(2, "0")}`; result[m] = month >= from.slice(0, 7) && month <= until.slice(0, 7) ? Number(record.unitPrice) : null; });
    }
    return result;
  }
  function project(record) {
    const pricingYear = yearOf(record);
    function series(row, header) {
      const raw = values(row, header);
      const anchors = overrides({ ...row, ...raw });
      // Flat legacy periods retain their end boundary. Monthly plans carry
      // each anchor forward; flags keep the form from saving derived values.
      const effective = row.unitPrice != null && row.unitPrice !== "" ? raw : Object.fromEntries(resolve(anchors).map((entry) => [entry.month, entry.value]));
      return { ...row, ...effective, monthlyResolved: effective, monthlyOverrides: Object.fromEntries(months.map((m) => [m, anchors[m] != null])) };
    }
    if (Array.isArray(record.details)) {
      const details = record.details.map((d) => series(d, { ...record, pricingYear }));
      const effective = Object.fromEntries(months.map((m) => [m, details.some((d) => d[m] != null) ? details.reduce((sum, d) => sum + Number(d[m] ?? 0), 0) : null]));
      return { ...record, pricingYear, details, ...effective, monthlyResolved: effective, monthlyOverrides: Object.fromEntries(months.map((m) => [m, details.some((d) => d.monthlyOverrides[m])])) };
    }
    return { ...series(record, { ...record, pricingYear }), pricingYear };
  }

  // Old annual records stored every effective value. Recover their change points;
  // new sparse records and the API's explicit flags preserve deliberate anchors.
  function overrides(record = {}) {
    const flags = record.monthlyOverrides;
    const denseLegacy = !flags && (record.unitPrice != null || months.every((m) => number(record[m]) != null));
    let previous = null;
    return Object.fromEntries(months.map((m) => {
      const current = number(record[m]);
      const explicit = flags ? flags[m] === true : current != null && (!denseLegacy || current !== previous);
      if (current != null) previous = current;
      return [m, explicit ? current : null];
    }));
  }
  function resolve(anchors = {}) {
    let effective = null, source = null, change = null;
    return months.map((month, index) => {
      const value = number(anchors[month]);
      const explicit = value != null;
      if (explicit) {
        const previous = effective;
        effective = value; source = index;
        change = previous == null ? null : { delta: value - previous, percent: previous === 0 ? null : (value - previous) / Math.abs(previous) * 100, previous, source: index };
      }
      return { month, index, value: effective, explicit, source, change };
    });
  }
  function changeText(entry) {
    if (!entry.change || entry.change.delta === 0) return "";
    const { delta, percent } = entry.change;
    return `${delta > 0 ? "↑" : "↓"} ${money.format(Math.abs(delta))}${percent == null ? " (dari 0)" : ` (${money.format(Math.abs(percent))}%)`}${entry.explicit ? "" : ` · sejak ${labels[entry.source]}`}`;
  }
  function cell(record, month) {
    const index = months.indexOf(month); if (index < 0) return "";
    const entry = resolve(overrides(record))[index];
    // A flat legacy period may have ended, even though an earlier anchor exists.
    const value = record[month]; if (value == null) return '<span class="monthly-table-price">–</span>';
    const tone = !entry.explicit || entry.change?.delta ? " monthly-table-price-blue" : "";
    const source = entry.explicit ? (index === 0 ? "Harga awal" : "Harga khusus") : `Mengikuti ${labels[entry.source]}`;
    return `<span class="monthly-table-price${tone}"><strong>${esc(money.format(value))}</strong><small>${esc(source)}</small><small class="monthly-price-delta" data-direction="${entry.change?.delta > 0 ? "up" : entry.change?.delta < 0 ? "down" : "same"}">${esc(changeText(entry))}</small></span>`;
  }
  function grid(row = {}) {
    const resolved = resolve(overrides(row));
    return `<div class="monthly-price-grid">${resolved.map((entry, i) => `<label class="monthly-price-cell"><span>${labels[i]}</span><input class="form-control" type="number" min="0" step="0.01" data-detail-month="${entry.month}" aria-label="Harga ${labels[i]}" value="${esc(entry.value ?? "")}" placeholder="Belum diisi"></label>`).join("")}</div>`;
  }
  function toolbar() {
    return '<div class="monthly-fill-toolbar"><label>Harga awal tahun<input class="form-control" type="number" min="0" step="0.01" data-fill-price placeholder="Masukkan harga Januari"></label><button type="button" class="btn btn-outline-primary" data-fill-months>Terapkan dari Januari</button><small>Harga diteruskan sampai bulan dengan harga khusus berikutnya. Biru = harga berubah atau mengikuti harga sebelumnya. Kosongkan harga khusus untuk kembali mengikuti; nilai 0 tetap berlaku.</small></div>';
  }

  function bind(container, record = {}) {
    if (!container) return null;
    const old = editors.get(container);
    if (old) { old.set(record); return old; }
    const inputs = [...container.querySelectorAll('[data-detail-month], [data-month-price]')];
    if (!inputs.length) return null;
    let anchors = overrides(record);
    const editorId = ++editorSequence;
    const fields = inputs.map((input) => {
      const month = input.dataset.detailMonth || input.name;
      const cell = input.closest(".monthly-price-cell") || input.closest(".form-field") || input.closest("label");
      cell.classList.add("monthly-price-cell");
      const status = input.ownerDocument.createElement("small");
      status.className = "monthly-price-status"; status.id = `monthly-status-${editorId}-${month}`;
      const delta = input.ownerDocument.createElement("small"); delta.className = "monthly-price-delta";
      delta.id = `monthly-delta-${editorId}-${month}`;
      const reset = input.ownerDocument.createElement("button");
      reset.type = "button"; reset.className = "monthly-price-reset"; reset.dataset.resetMonth = month;
      reset.textContent = month === "january" ? "Hapus harga awal" : "Ikuti sebelumnya";
      reset.setAttribute("aria-label", `${reset.textContent} ${labels[months.indexOf(month)]}`);
      reset.addEventListener("click", (event) => { event.preventDefault(); anchors[month] = null; render(); container.dispatchEvent(new Event("change", { bubbles: true })); });
      input.setAttribute("aria-describedby", `${status.id} ${delta.id}`);
      input.placeholder = "Belum diisi";
      cell.append(status, delta, reset);
      return { input, cell, month, status, delta, reset };
    });
    function render(preserveInput) {
      const entries = resolve(anchors);
      fields.forEach(({ input, cell, month, status, delta, reset }) => {
        const entry = entries[months.indexOf(month)]; if (!entry) return;
        if (input !== preserveInput) input.value = entry.value ?? "";
        input.dataset.priceOverride = String(entry.explicit);
        reset.disabled = !entry.explicit;
        cell.classList.toggle("monthly-price-inherited", !entry.explicit && entry.value != null);
        cell.classList.toggle("monthly-price-explicit", entry.explicit);
        cell.classList.toggle("monthly-price-changed", Boolean(entry.change?.delta));
        status.textContent = entry.value == null ? "Belum ada harga sebelumnya" : entry.explicit ? (entry.index === 0 ? "Harga awal tahun" : "Harga khusus bulan ini") : `Mengikuti ${labels[entry.source]}`;
        delta.textContent = changeText(entry);
        delta.dataset.direction = entry.change?.delta > 0 ? "up" : entry.change?.delta < 0 ? "down" : "same";
        delta.title = entry.change ? `Perubahan harga ${labels[entry.source]} dari ${money.format(entry.change.previous)} menjadi ${money.format(entry.value)}` : "";
      });
    }
    const edit = (event) => {
      const field = fields.find((item) => item.input === event.target);
      if (!field || event.target.validity?.badInput) return;
      anchors[field.month] = number(event.target.value);
      // Keep the active input untouched while typing (including an empty value).
      render(event.target);
    };
    // Change/blur may fire after the displayed inherited price has been restored.
    // Only input events represent an explicit override, never a display refresh.
    inputs.forEach((input) => {
      const finish = () => {
        // Some integrations emit change/blur without input when clearing.
        // Capture only an empty value here; a displayed inherited number is
        // never promoted to an explicit anchor by these events.
        if (input.value === "" && !input.validity?.badInput) anchors[input.dataset.detailMonth || input.name] = null;
        render();
      };
      input.addEventListener("input", edit); input.addEventListener("change", finish); input.addEventListener("blur", finish);
    });
    const api = {
      read: () => ({ ...anchors, monthlyOverrides: Object.fromEntries(months.map((m) => [m, anchors[m] != null])) }),
      set: (next) => { anchors = overrides(next); render(); },
      setMonth: (month, value) => { if (months.includes(month)) { anchors[month] = number(value); render(); } },
    };
    editors.set(container, api); render(); return api;
  }
  function read(container) { return editors.get(container)?.read() || {}; }
  function fillEmpty(container) {
    const source = container.querySelector('[data-fill-price]');
    if (!source || source.value === "" || !source.reportValidity()) return false;
    const editor = editors.get(container); if (!editor) return false;
    editor.setMonth("january", source.value);
    source.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return { months, labels, yearOf, values, project, overrides, resolve, changeText, cell, grid, toolbar, bind, read, fillEmpty };
});
