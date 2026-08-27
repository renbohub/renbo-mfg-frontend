(function () {
  "use strict";

  const state = { profiles: [], files: [], runtime: null, busy: new Set(), query: "" };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const headers = (json = false) => ({ Authorization: `Bearer ${token()}`, "X-Page-Module": "master-data", "X-Page-Code": "ai-model-profiles", ...(json ? { "Content-Type": "application/json" } : {}) });
  const user = () => window.ERP_PERMISSIONS?.user?.() || {};
  const isSuperAdmin = () => user().isSuperAdmin === true;
  const statusClass = (status) => String(status || "DRAFT").toLowerCase();
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum pernah";

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.message || `Request gagal (${response.status})`), { code: payload.code });
    return payload;
  }

  function alert(message, tone = "info") {
    const node = $("ai-model-alert");
    node.textContent = message;
    node.className = `ai-model-notice ${tone}`;
  }

  function benchmark(profile) {
    const result = profile.benchmarkResult || {};
    const keys = ["modelLoadPass", "schemaPass", "goldenPass", "permissionPass", "resourcePass", "latencyPass"];
    const passed = keys.filter((key) => result[key] === true).length;
    return `<div class="ai-benchmark" title="${passed}/6 gate lulus">${keys.map((key) => `<i class="${result[key] === true ? "pass" : result[key] === false ? "fail" : ""}"></i>`).join("")}</div><small>${passed}/6 gate</small>`;
  }

  function render() {
    const query = state.query.toLowerCase();
    const rows = state.profiles.filter((profile) => [profile.profileCode, profile.displayName, profile.ggufFileName, profile.modelFamily].join(" ").toLowerCase().includes(query));
    $("ai-active-count").textContent = state.profiles.filter((profile) => profile.status === "ACTIVE").length;
    $("ai-ready-count").textContent = state.profiles.filter((profile) => profile.status === "INACTIVE" && profile.benchmarkResult?.modelLoadPass === true).length;
    $("ai-file-count").textContent = state.files.length;
    $("ai-profile-body").innerHTML = rows.length ? rows.map((profile) => {
      const config = profile.runtimeConfig || {};
      const busy = state.busy.has(profile.id);
      const ready = profile.benchmarkResult?.modelLoadPass === true;
      return `<tr>
        <td><div class="ai-model-identity"><b>${esc(profile.profileCode)}</b><small>${esc(profile.displayName)}</small></div></td>
        <td><div class="ai-model-identity"><b>${esc(profile.modelFamily)} · ${esc(profile.quantization)}</b><small>${esc(profile.ggufFileName)}</small></div></td>
        <td><div class="ai-model-runtime"><b>${esc(String(config.gpuMode || "cpu").toUpperCase())} · ${esc(config.cpuThreads || "—")} thread</b><small>Ctx ${esc(config.contextSize || "—")} · ${esc(config.maxMemoryMb || "—")} MB max</small></div></td>
        <td>${benchmark(profile)}</td>
        <td><span class="ai-model-badge ${statusClass(profile.status)} ${ready ? "ready" : ""}">${esc(profile.status || "DRAFT")}</span></td>
        <td><div class="ai-model-runtime"><b>${profile.status === "ACTIVE" ? esc(profile.activatedBy || "System") : "—"}</b><small>${profile.status === "ACTIVE" ? esc(fmtDate(profile.activatedAt)) : esc(fmtDate(profile.benchmarkResult?.testedAt))}</small></div></td>
        <td><div class="ai-model-actions">
          <button type="button" data-model-action="test" data-id="${esc(profile.id)}" ${busy || profile.status === "ACTIVE" ? "disabled" : ""}>Uji</button>
          <button class="primary" type="button" data-model-action="activate" data-id="${esc(profile.id)}" ${busy || !ready || profile.status === "ACTIVE" ? "disabled" : ""}>Aktifkan</button>
          ${profile.status === "ACTIVE" ? `<button type="button" data-model-action="rollback" data-id="${esc(profile.id)}" ${busy || !profile.rollbackProfileId ? "disabled" : ""}>Rollback</button>` : ""}
        </div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="ai-model-empty">Tidak ada profile yang sesuai.</td></tr>`;
  }

  async function load() {
    try {
      const [profiles, files, runtime] = await Promise.all([
        api("/ai/api/admin/model-profiles"),
        api("/ai/api/admin/model-files"),
        api("/ai/api/status").catch(() => ({ status: "OFFLINE" })),
      ]);
      state.profiles = Array.isArray(profiles) ? profiles : profiles.items || profiles.data || [];
      state.files = Array.isArray(files) ? files : files.items || files.files || files.data || [];
      state.runtime = runtime;
      $("ai-runtime-state").textContent = runtime.status || runtime.runtimeStatus || (state.profiles.some((profile) => profile.status === "ACTIVE") ? "READY" : "BELUM AKTIF");
      $("ai-runtime-detail").textContent = runtime.modelProfile?.displayName || "node-llama-cpp · lokal";
      render();
    } catch (error) {
      alert(error.message, "");
      $("ai-profile-body").innerHTML = `<tr><td colspan="7" class="ai-model-empty">${esc(error.message)}</td></tr>`;
    }
  }

  function openDialog() {
    const select = $("ai-model-file");
    select.innerHTML = `<option value="">Pilih file GGUF</option>${state.files.map((file) => `<option value="${esc(file)}">${esc(file)}</option>`).join("")}`;
    $("ai-profile-form").reset();
    $("ai-model-family").value = "Qwen3"; $("ai-quantization").value = "Q4_K_M"; $("ai-prompt-version").value = "ERP_ASSISTANT_V1";
    $("ai-context-size").value = 4096; $("ai-max-tokens").value = 800; $("ai-cpu-threads").value = 6; $("ai-batch-size").value = 128; $("ai-gpu-mode").value = "cpu"; $("ai-max-memory").value = 5120;
    bootstrap.Modal.getOrCreateInstance($("ai-profile-dialog")).show();
  }

  async function save(event) {
    event.preventDefault();
    const button = $("ai-save-profile"); button.disabled = true; button.textContent = "Menyimpan...";
    const number = (id) => Number($(id).value);
    try {
      await api("/ai/api/admin/model-profiles", { method: "POST", body: JSON.stringify({
        profileCode: $("ai-profile-code").value, displayName: $("ai-display-name").value, modelFamily: $("ai-model-family").value,
        ggufFileName: $("ai-model-file").value, quantization: $("ai-quantization").value, promptCompatibilityVersion: $("ai-prompt-version").value,
        runtimeConfig: { contextSize: number("ai-context-size"), maxTokens: number("ai-max-tokens"), cpuThreads: number("ai-cpu-threads"), batchSize: number("ai-batch-size"), gpuMode: $("ai-gpu-mode").value, maxMemoryMb: number("ai-max-memory") },
      }) });
      bootstrap.Modal.getInstance($("ai-profile-dialog"))?.hide(); alert("Profile tersimpan sebagai DRAFT. Jalankan Uji sebelum aktivasi.", "info"); await load();
    } catch (error) { $("ai-profile-form-state").textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Simpan Draft"; }
  }

  async function action(type, profileId) {
    const labels = { test: "menjalankan benchmark", activate: "mengaktifkan model", rollback: "melakukan rollback" };
    if (["activate", "rollback"].includes(type) && !window.confirm(`Yakin ${labels[type]}? Runtime AI akan dimuat ulang.`)) return;
    state.busy.add(profileId); render();
    try { await api(`/ai/api/admin/model-profiles/${encodeURIComponent(profileId)}/${type}`, { method: "POST", body: "{}" }); alert(`Berhasil ${labels[type]}.`, "info"); await load(); }
    catch (error) { alert(error.message, ""); }
    finally { state.busy.delete(profileId); render(); }
  }

  function enforceSuperAdmin() {
    const allowed = isSuperAdmin();
    $("ai-model-access-warning").classList.toggle("is-hidden", allowed);
    $("ai-add-profile").disabled = !allowed;
    if (!allowed) $("ai-profile-body").innerHTML = `<tr><td colspan="7" class="ai-model-empty">Akses hanya untuk Super Administrator.</td></tr>`;
    return allowed;
  }

  $("ai-add-profile")?.addEventListener("click", openDialog);
  $("ai-profile-form")?.addEventListener("submit", save);
  $("ai-profile-search")?.addEventListener("input", (event) => { state.query = event.target.value; render(); });
  $("ai-profile-body")?.addEventListener("click", (event) => { const button = event.target.closest("[data-model-action]"); if (button) void action(button.dataset.modelAction, button.dataset.id); });
  window.addEventListener("erp:permissions-ready", () => { if (enforceSuperAdmin()) void load(); });
  if (enforceSuperAdmin()) void load();
})();
