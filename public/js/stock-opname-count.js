(function () {
  const config = JSON.parse(document.getElementById("sto-count-config").textContent);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const normalize = (value) => String(value || "").trim().toUpperCase();
  const sessionKey = `sto-member:${config.stoNo}`;
  const state = {
    record: null,
    dirty: new Set(),
    drafts: new Map(),
    search: "",
    filter: "UNCOUNTED",
    activeMember: sessionStorage.getItem(sessionKey) || "",
    refreshing: false,
  };

  function show(message, type = "danger") {
    const box = $("sto-count-alert");
    if (!message) {
      box.textContent = "";
      box.className = "soc-alert d-none";
      return;
    }
    box.textContent = message;
    box.className = `soc-alert alert-${type}`;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error(payload.message || "Stock Opname gagal diproses.");
    return payload.data || payload;
  }

  const details = () => Array.isArray(state.record?.details) ? state.record.details : [];
  const isCounting = () => normalize(state.record?.status) === "COUNTING";
  const memberName = () => state.activeMember;
  const itemIdentity = (row) => {
    if (normalize(row.stockType) === "MATERIAL") {
      return {
        main: row.materialName || row.materialCode || row.description || "-",
        sub: [row.materialCode, row.spec, row.thickness != null && row.width != null ? `${row.thickness} × ${row.width}` : ""].filter(Boolean).join(" · "),
      };
    }
    return {
      main: row.partNumber || row.partCode || row.description || "-",
      sub: row.partCode && row.partCode !== row.partNumber ? row.partCode : "",
    };
  };

  function summary() {
    const rows = details().filter((row) => !row.isDeleted);
    const counted = rows.filter((row) => row.actualQty != null).length;
    const mine = rows.filter((row) => row.actualQty != null
      && normalize(row.countedBy) === normalize(memberName())).length;
    const members = [...new Set(rows.map((row) => row.countedBy).filter(Boolean))];
    return { total: rows.length, counted, remaining: rows.length - counted, mine, members };
  }

  function matchesSearch(row) {
    if (state.filter === "UNCOUNTED" && row.actualQty != null) return false;
    if (state.filter === "MINE" && normalize(row.countedBy) !== normalize(memberName())) return false;
    if (!state.search) return true;
    return [
      row.partCode, row.partNumber, row.partName, row.materialCode, row.materialName,
      row.materialType, row.stockType, row.rackCode, row.lotNumber,
    ].some((value) => normalize(value).includes(state.search));
  }

  function updateActions() {
    const info = summary();
    const hasMember = Boolean(state.activeMember);
    $("sto-save-counts").disabled = !isCounting() || !hasMember || state.dirty.size === 0;
    $("sto-finish-counting").disabled = !isCounting() || info.remaining > 0 || state.dirty.size > 0;
    $("sto-action-note").innerHTML = hasMember
      ? `<b>${esc(state.activeMember)}</b> · isi sebagian item lalu simpan. Member lain dapat melanjutkan sisanya.`
      : "<b>Aktifkan sesi member</b> untuk mulai mengisi item yang belum dihitung.";
    $("sto-finish-counting").title = info.remaining > 0
      ? `${info.remaining} item belum dihitung`
      : state.dirty.size ? "Simpan perubahan qty terlebih dahulu" : "Kirim hasil ke checker";
  }

  function renderRows() {
    const rows = details().filter((row) => !row.isDeleted && matchesSearch(row));
    $("sto-count-rows").innerHTML = rows.map((row, index) => {
      const identity = itemIdentity(row);
      const draftValue = state.drafts.has(row.id) ? state.drafts.get(row.id) : (row.actualQty == null ? "" : String(row.actualQty));
      const dirty = state.dirty.has(row.id);
      const counted = row.actualQty != null;
      const ownedByOther = counted && normalize(row.countedBy) !== normalize(memberName());
      const inputDisabled = !state.activeMember || ownedByOther || !isCounting();
      const status = dirty
        ? '<span class="soc-status dirty">Belum disimpan</span>'
        : counted ? `<span class="soc-status done">${esc(row.countedBy || "Tersimpan")}</span>` : '<span class="soc-status">Belum dihitung</span>';
      return `<tr data-count-row="${esc(row.id)}" class="${counted ? "is-counted" : ""} ${dirty ? "is-dirty" : ""} ${ownedByOther ? "is-locked" : ""}">
        <td class="soc-row-number">${index + 1}</td>
        <td class="soc-item"><b title="${esc(identity.main)}">${esc(identity.main)}</b><small>${esc(identity.sub || row.materialType || "")}</small></td>
        <td class="soc-part-name">${esc(row.partName || row.materialName || "-")}<small>${row.isUnexpected ? "FOUND STOCK" : ""}</small></td>
        <td class="soc-type">${esc(row.stockType || "-")}</td>
        <td class="soc-location">${esc(row.rackCode || "Tanpa rack")}</td>
        <td class="soc-location">${esc(row.lotNumber || "Tanpa lot")}</td>
        <td><div class="soc-qty-wrap"><input class="soc-qty-input" data-count-qty="${esc(row.id)}" type="number" min="0" step="any" inputmode="decimal" value="${esc(draftValue)}" aria-label="Qty fisik ${esc(identity.main)}" ${inputDisabled ? "disabled" : ""}><span class="soc-uom">${esc(row.uomCode || "")}</span></div></td>
        <td data-count-status>${status}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="8" class="soc-empty">Item tidak ditemukan pada pencarian ini.</td></tr>';
  }

  function fillFoundStockTypes() {
    const allowed = Array.isArray(state.record?.scopeJson?.stockTypes) && state.record.scopeJson.stockTypes.length
      ? state.record.scopeJson.stockTypes
      : state.record?.stoType === "WIP" ? ["WIP", "WP", "Semi-Finished"]
        : state.record?.stoType === "FG" ? ["Finished Goods", "FG"]
          : ["Material", "Purchase Part"];
    const select = $("sto-found-stock-type");
    const current = select.value;
    select.innerHTML = `<option value="">Pilih jenis stock</option>${allowed.map((type) => `<option value="${esc(type)}">${esc(type)}</option>`).join("")}`;
    if (allowed.includes(current)) select.value = current;
  }

  function refreshFoundFields() {
    const material = $("sto-found-identity-kind").value === "MATERIAL";
    document.querySelectorAll("[data-found-material]").forEach((field) => field.classList.toggle("d-none", !material));
    document.querySelectorAll("[data-found-part]").forEach((field) => field.classList.toggle("d-none", material));
    $("sto-found-material-code").required = material;
    $("sto-found-part-code").required = !material;
    $("sto-found-part-name").required = !material;
  }

  function render() {
    const info = summary();
    const percent = info.total ? Math.round((info.counted / info.total) * 100) : 0;
    $("sto-count-number").textContent = state.record.stoNo || config.stoNo;
    $("sto-count-scope").textContent = `${state.record.stoType || "-"} · ${state.record.warehouseCode || "-"}`;
    $("sto-round-label").textContent = `ROUND ${state.record.currentRoundNo || 1} · ${state.record.status || "-"}`;
    $("sto-total-lines").textContent = info.total;
    $("sto-counted-lines").textContent = info.counted;
    $("sto-remaining-lines").textContent = info.remaining;
    $("sto-my-lines").textContent = info.mine;
    $("sto-filter-uncounted").textContent = info.remaining;
    $("sto-filter-mine").textContent = info.mine;
    $("sto-filter-all").textContent = info.total;
    $("sto-count-progress").textContent = `${info.counted} / ${info.total} dihitung · ${percent}%`;
    $("sto-progress-bar").style.width = `${percent}%`;
    $("sto-member-roster").innerHTML = info.members.length
      ? `<span>Member:</span>${info.members.map((member) => `<i class="${normalize(member) === normalize(memberName()) ? "is-me" : ""}">${esc(member)}</i>`).join("")}`
      : "<span>Belum ada member yang menyimpan hitungan</span>";
    document.querySelectorAll("[data-count-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.countFilter === state.filter);
      button.disabled = button.dataset.countFilter === "MINE" && !state.activeMember;
    });
    $("sto-member-name").value = state.activeMember || $("sto-member-name").value;
    $("sto-member-name").disabled = Boolean(state.activeMember);
    $("sto-start-session").textContent = state.activeMember ? "Ganti Member" : "Aktifkan";
    fillFoundStockTypes();
    refreshFoundFields();
    renderRows();

    const reviewing = !isCounting();
    $("sto-count-form").classList.toggle("d-none", reviewing);
    $("sto-found-panel").classList.toggle("d-none", reviewing);
    $("sto-completed-state").classList.toggle("d-none", !reviewing);
    updateActions();
  }

  async function refreshRecord({ quiet = false } = {}) {
    if (state.refreshing || state.dirty.size) return false;
    state.refreshing = true;
    try {
      state.record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}`);
      render();
      if (!quiet) show("Progress terbaru dari seluruh member sudah dimuat.", "success");
      return true;
    } finally {
      state.refreshing = false;
    }
  }

  async function load() {
    try {
      state.record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}`);
      $("sto-count-loading").classList.add("d-none");
      $("sto-count-page").classList.remove("d-none");
      if (!["COUNTING", "WAITING_CHECK", "WAITING_APPROVAL", "APPROVED", "ADJUSTED", "CLOSED"].includes(normalize(state.record.status))) {
        show(`Form member count tidak tersedia untuk status ${state.record.status || "-"}.`, "warning");
      }
      render();
    } catch (error) {
      $("sto-count-loading").classList.add("d-none");
      show(error.message);
    }
  }

  $("sto-start-session").addEventListener("click", () => {
    if (state.activeMember) {
      if (state.dirty.size) return show("Simpan atau batalkan perubahan qty sebelum mengganti member.", "warning");
      state.activeMember = "";
      sessionStorage.removeItem(sessionKey);
      $("sto-member-name").disabled = false;
      $("sto-member-name").value = "";
      $("sto-member-name").focus();
      state.filter = "UNCOUNTED";
      return render();
    }
    const name = $("sto-member-name").value.trim();
    if (!name) {
      $("sto-member-name").focus();
      return show("Masukkan nama member untuk memulai sesi.");
    }
    state.activeMember = name;
    sessionStorage.setItem(sessionKey, name);
    state.filter = "UNCOUNTED";
    show(`Sesi ${name} aktif. Pilih item yang belum dihitung.`, "success");
    render();
  });
  $("sto-member-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !state.activeMember) {
      event.preventDefault();
      $("sto-start-session").click();
    }
  });
  $("sto-item-search").addEventListener("input", (event) => {
    state.search = normalize(event.target.value);
    renderRows();
  });
  $("sto-count-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-count-filter]");
    if (!button || button.disabled) return;
    state.filter = button.dataset.countFilter;
    render();
  });
  $("sto-refresh-progress").addEventListener("click", async () => {
    if (state.dirty.size) return show("Simpan perubahan qty sebelum refresh progress.", "warning");
    try { await refreshRecord(); } catch (error) { show(error.message); }
  });
  $("sto-count-rows").addEventListener("input", (event) => {
    const input = event.target.closest("[data-count-qty]");
    if (!input) return;
    const id = input.dataset.countQty;
    state.dirty.add(id);
    state.drafts.set(id, input.value);
    const row = input.closest("tr");
    row.classList.add("is-dirty");
    row.querySelector("[data-count-status]").innerHTML = '<span class="soc-status dirty">Belum disimpan</span>';
    updateActions();
  });
  $("sto-count-rows").addEventListener("click", (event) => {
    if (event.target.closest("input")) return;
    event.target.closest("tr")?.querySelector(".soc-qty-input")?.focus();
  });

  $("sto-count-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!memberName()) {
      $("sto-member-name").focus();
      return show("Aktifkan sesi member sebelum menyimpan hitungan.");
    }
    const counts = [];
    for (const detailId of state.dirty) {
      const raw = state.drafts.get(detailId);
      const actualQty = Number(raw);
      if (raw === "" || !Number.isFinite(actualQty) || actualQty < 0) {
        return show("Semua qty yang diubah harus berupa angka minimal 0.");
      }
      counts.push({ detailId, actualQty, countedBy: memberName() });
    }
    if (!counts.length) return;
    const button = $("sto-save-counts");
    button.disabled = true;
    try {
      state.record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/bulk-count`, {
        method: "PATCH",
        body: JSON.stringify({ counts }),
      });
      state.dirty.clear();
      state.drafts.clear();
      show(`${counts.length} hitungan berhasil disimpan.`, "success");
      render();
    } catch (error) {
      show(error.message);
      updateActions();
    }
  });

  $("sto-finish-counting").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/submit`, { method: "PATCH", body: "{}" });
      state.record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}`);
      show("Counting selesai dan sudah dikirim ke checker.", "success");
      render();
    } catch (error) {
      show(error.message);
      updateActions();
    }
  });

  $("sto-found-identity-kind").addEventListener("change", refreshFoundFields);
  $("sto-found-stock-type").addEventListener("change", () => {
    $("sto-found-identity-kind").value = normalize($("sto-found-stock-type").value) === "MATERIAL" ? "MATERIAL" : "PART";
    refreshFoundFields();
  });
  $("sto-found-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!memberName()) {
      $("sto-member-name").focus();
      return show("Isi nama member sebelum menambahkan Found Stock.");
    }
    if (!event.currentTarget.reportValidity()) return;
    const material = $("sto-found-identity-kind").value === "MATERIAL";
    const body = {
      stockType: $("sto-found-stock-type").value,
      materialCode: material ? $("sto-found-material-code").value.trim() : null,
      materialName: material ? $("sto-found-material-name").value.trim() : null,
      materialType: material ? $("sto-found-material-type").value.trim() : null,
      partCode: material ? null : $("sto-found-part-code").value.trim(),
      partName: material ? null : $("sto-found-part-name").value.trim(),
      rackCode: $("sto-found-rack").value.trim() || null,
      lotNumber: $("sto-found-lot").value.trim() || null,
      uomCode: $("sto-found-uom").value.trim(),
      actualQty: Number($("sto-found-actual").value),
      countedBy: memberName(),
      reason: $("sto-found-reason").value.trim(),
    };
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      state.record = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/found-stock`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      event.currentTarget.reset();
      $("sto-found-panel").open = false;
      show("Found Stock berhasil ditambahkan ke daftar hitung.", "success");
      render();
    } catch (error) {
      show(error.message);
    } finally {
      button.disabled = false;
    }
  });

  let scanBusy = false; let scanStream = null; let scanTimer = null; let scanGeneration = 0;
  function stopScanCamera() {
    scanGeneration += 1; clearTimeout(scanTimer); scanStream?.getTracks().forEach((track) => track.stop()); scanStream = null;
    $("sto-scan-video").srcObject = null; $("sto-scan-video").hidden = true; $("sto-scan-stop").hidden = true; $("sto-scan-camera").disabled = false;
  }
  function chooseScannedItem(match) {
    const row = details().find((item) => item.id === match.id);
    if (!row) { $("sto-scan-message").textContent = "Daftar item sudah berubah. Simpan perubahan lalu refresh progress."; return; }
    state.filter = "ALL"; state.search = normalize(row.partCode || row.materialCode || row.partNumber);
    $("sto-item-search").value = row.partCode || row.materialCode || row.partNumber || "";
    render();
    const rowElement = [...document.querySelectorAll("[data-count-row]")].find((element) => element.dataset.countRow === match.id);
    rowElement?.classList.add("is-scan-focus"); rowElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = rowElement?.querySelector("[data-count-qty]");
    if (input && !input.disabled) { input.focus({ preventScroll: true }); input.select(); }
    $("sto-scan-matches").replaceChildren();
    $("sto-scan-message").textContent = input?.disabled ? "Item ditemukan. Aktifkan sesi member; item yang dihitung member lain tetap terkunci." : "Item dipilih. Isi qty fisik sesuai hitungan lalu Simpan Hitungan.";
  }
  async function scanLookup() {
    if (scanBusy) return;
    const value = $("sto-scan-reference").value.trim(); if (!value) return;
    scanBusy = true; $("sto-scan-form").querySelector('[type="submit"]').disabled = true; $("sto-scan-matches").replaceChildren();
    try {
      const result = await api(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/scan?reference=${encodeURIComponent(value)}`);
      if (result.matches.length === 1) chooseScannedItem(result.matches[0]);
      else {
        $("sto-scan-message").textContent = `${result.matches.length} lokasi / lot cocok. Pilih item yang sedang dihitung.`;
        result.matches.forEach((match) => {
          const button = document.createElement("button"); button.type = "button"; button.className = "soc-scan-match";
          button.textContent = `${match.partNumber || match.partCode || match.materialCode} | ${match.warehouseCode} | Rack ${match.rackCode || "-"} | Lot ${match.lotNumber || "-"} | ${match.uomCode || "-"}`;
          button.addEventListener("click", () => chooseScannedItem(match)); $("sto-scan-matches").append(button);
        });
      }
    } catch (error) { $("sto-scan-message").textContent = error.message; }
    finally { scanBusy = false; $("sto-scan-form").querySelector('[type="submit"]').disabled = false; }
  }
  $("sto-scan-form").addEventListener("submit", (event) => { event.preventDefault(); stopScanCamera(); scanLookup(); });
  $("sto-scan-stop").addEventListener("click", stopScanCamera);
  $("sto-scan-camera").addEventListener("click", async () => {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) { $("sto-scan-message").textContent = "Kamera barcode tidak didukung browser. Gunakan scanner USB/Bluetooth atau ketik kode item."; return; }
    const generation = ++scanGeneration; $("sto-scan-camera").disabled = true;
    try {
      const formats = (await BarcodeDetector.getSupportedFormats()).filter((format) => ["qr_code", "code_128", "code_39", "ean_13", "ean_8"].includes(format));
      if (!formats.length) throw new Error("Format barcode belum didukung; gunakan scanner atau ketik kode item.");
      const detector = new BarcodeDetector({ formats });
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (generation !== scanGeneration || document.hidden) { acquired.getTracks().forEach((track) => track.stop()); return; }
      scanStream = acquired; const video = $("sto-scan-video"); video.srcObject = acquired; video.hidden = false; $("sto-scan-stop").hidden = false; await video.play();
      $("sto-scan-message").textContent = "Arahkan kamera ke label QR opname / barcode item.";
      const detect = async () => {
        if (generation !== scanGeneration || !scanStream) return;
        try { const codes = await detector.detect(video); if (codes[0]?.rawValue) { $("sto-scan-reference").value = codes[0].rawValue; stopScanCamera(); await scanLookup(); return; } } catch { /* Wait until the camera frame is ready. */ }
        if (generation === scanGeneration) scanTimer = setTimeout(detect, 300);
      }; detect();
    } catch (error) { if (generation === scanGeneration) { stopScanCamera(); $("sto-scan-message").textContent = error.name === "NotAllowedError" ? "Izin kamera ditolak. Gunakan scanner atau masukkan kode item." : error.message; } }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopScanCamera(); });
  window.addEventListener("pagehide", stopScanCamera);
  document.querySelectorAll("[data-sto-document]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const suffix = button.dataset.stoDocument;
      if (!["labels.pdf", "report.pdf", "report.xlsx"].includes(suffix)) return;
      const response = await fetch(`/modules/api/inventory/stock-opname/${encodeURIComponent(config.stoNo)}/${suffix}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
      if (response.status === 401) { location.replace(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || "Dokumen opname gagal diunduh."); }
      const href = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = href;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || `${config.stoNo}-${suffix}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) { show(error.message); } finally { button.disabled = false; }
  }));

  load();
  const refreshTimer = window.setInterval(() => {
    if (state.activeMember && !state.dirty.size && !document.hidden && !scanBusy && !scanStream && !document.activeElement?.matches("[data-count-qty]") && isCounting()) {
      refreshRecord({ quiet: true }).catch(() => {});
    }
  }, 15000);
  window.addEventListener("pagehide", () => clearInterval(refreshTimer));
})();
