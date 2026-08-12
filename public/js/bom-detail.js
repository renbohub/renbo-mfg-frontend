(function () {
  const config = JSON.parse(document.getElementById("bom-record-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
  const date = (value, withTime = false) => value ? new Intl.DateTimeFormat("id-ID", withTime ? { dateStyle: "medium", timeStyle: "short" } : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const partLabel = (part) => [part?.partCode || part?.partNumber, part?.partName].filter(Boolean).join(" ") || "—";
  const field = (name, value) => { const node = document.querySelector(`[data-field="${name}"]`); if (node) node.textContent = value; };
  const processName = (item) => item.process?.processName || item.process?.processCode || "Proses belum dinamai";
  const processOccurrence = (item) => item.occurrenceCode || item.notes || item.process?.processCode || "—";
  const compareRouting = (a, b) => {
    const left = String(a.routingNumber || "").split(".").map(Number); const right = String(b.routingNumber || "").split(".").map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) { const difference = (left[index] ?? -1) - (right[index] ?? -1); if (difference) return difference; }
    return Number(a.sequence || 0) - Number(b.sequence || 0);
  };
  const durationUnitLabel = (unit) => ({ SECOND: "Detik", MINUTE: "Menit", HOUR: "Jam", DAY: "Hari" }[unit] || "Jam");
  async function load() {
    try {
      const response = await fetch(`/modules/api/manufacturing-bom/bill-of-materials/${encodeURIComponent(config.recordKey)}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (response.status === 401) return location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
      const record = await response.json().catch(() => ({})); if (!response.ok) throw new Error(record.message || "Detail BOM gagal dimuat.");
      if (config.view === "detail") renderDetail(record); else renderProcesses(record);
    } catch (error) { const alert = document.getElementById("bom-record-alert"); alert.textContent = error.message; alert.classList.remove("d-none"); }
  }
  function renderDetail(record) {
    const details = (record.details || []).filter((item) => !item.isDeleted);
    field("noReg", record.noReg || "—"); field("parentItem", partLabel(record.part)); field("bomType", details.some((item) => item.category === "inHouse") ? "Production" : "Standard");
    field("revision", `Rev.${String(record.revision || 1).padStart(2, "0")}`); field("effectiveDate", date(record.effectiveDate)); field("status", record.expiryDate && new Date(record.expiryDate) < new Date() ? "EXPIRED" : "RELEASED");
    field("revisionNote", record.revisionNote || (record.revisionOfMbomId ? "Catatan revisi belum diisi" : "Revisi awal")); field("notes", record.notes || `Bill of Materials untuk ${partLabel(record.part)}.`); field("componentCount", `${details.length} Item${details.length === 1 ? "" : "s"}`); field("updatedAt", date(record.updatedAt, true));
    document.getElementById("bom-detail-rows").innerHTML = details.length ? details.map((item) => {
      const firstProcess = (item.mbomProcesses || []).find((process) => !process.isDeleted); const part = item.part || {};
      const materialText = part.itemType === "RAW" && part.rawType === "MATERIAL" ? `${part.material?.materialCode || "Material belum link"} · ${item.materialThickness || 0}×${item.materialWidth || 0}×${item.materialPitch || 0} / CAV ${item.materialCavity || 1} · ${Number(item.grossWeight || 0).toFixed(2)} kg/pcs` : "—";
      const uomCode = item.uomCode || item.uom?.uomCode || "";
      return `<tr><td>${Number(item.levelComponent || 1)}</td><td><b class="bom-code-text">${esc(part.partCode || part.partNumber || "—")}</b></td><td>${esc(part.partName || "—")}</td><td class="text-end">${window.SharedDataTable.formatQuantity(item.qty, uomCode, { maximumFractionDigits: 2 })}</td><td>${esc(uomCode || "—")}</td><td>${esc(item.parentDetail?.part?.partName || item.notes || "—")}</td><td>${esc(firstProcess ? processOccurrence(firstProcess) : "—")}</td><td>${esc(materialText)}</td><td class="text-danger">${Number(item.scrapFactor || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</td><td>${Number(item.leadTime || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${durationUnitLabel(item.leadTimeUnit)}</td></tr>`;
    }).join("") : '<tr><td colspan="10" class="text-center py-4">Belum ada komponen.</td></tr>';
  }
  function renderProcesses(record) {
    const processes = (record.details || []).flatMap((detail) => (detail.mbomProcesses || []).filter((item) => !item.isDeleted).map((item) => ({ ...item, detail }))).sort(compareRouting);
    document.getElementById("bom-process-rows").innerHTML = processes.length ? processes.map((item, index) => `<tr><td>${esc(item.routingNumber || item.sequence || (index + 1) * 10)}</td><td><b>${esc(processName(item))}</b></td><td>${esc(processOccurrence(item))}</td><td class="bom-muted">${esc(item.machine?.machineName || item.machine?.machineCode || "—")}</td><td>0</td><td>${Number(item.cycleTime || 0)}</td><td>0</td><td>0</td><td><span class="bom-release-badge">Aktif</span></td></tr>`).join("") : '<tr><td colspan="9" class="text-center py-4">Belum ada routing proses pada detail BOM.</td></tr>';
    document.getElementById("bom-process-flow").innerHTML = processes.length ? processes.map((item, index) => `${index ? '<i>›</i>' : ""}<span>${esc(processOccurrence(item))} (${esc(item.routingNumber || item.sequence || (index + 1) * 10)})</span>`).join("") : '<span class="empty">Belum ada alur proses.</span>';
    const run = processes.reduce((sum, item) => sum + Number(item.cycleTime || 0), 0); document.getElementById("bom-time-caption").textContent = `Total Waktu Produksi (Run): ${run.toLocaleString("id-ID", { maximumFractionDigits: 2 })} Detik`;
    document.getElementById("bom-total-hours").textContent = `${(run / 3600).toFixed(2)} Hours`;
  }
  load();
})();
