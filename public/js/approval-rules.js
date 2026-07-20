(function () {
  const config = JSON.parse(document.getElementById("approval-rule-config").textContent);
  const catalog = Array.isArray(config.permissionCatalog) ? config.permissionCatalog : [];
  const state = { rules: [], roles: [], currentId: null, steps: [] };
  const $ = (id) => document.getElementById(id);
  const token = () => localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) throw new Error(payload.message || "Permintaan gagal diproses.");
    return payload;
  }

  function alert(message, kind = "success") {
    const box = $("approval-alert");
    box.textContent = message;
    box.className = `alert alert-${kind} app-container system-alert`;
    if (kind === "success") setTimeout(() => box.classList.add("d-none"), 3500);
  }

  function modules() {
    const map = new Map();
    for (const page of catalog) {
      if (!map.has(page.moduleCode)) map.set(page.moduleCode, page.moduleLabel);
    }
    return map;
  }

  function fillModuleOptions() {
    $("rule-module").innerHTML = '<option value="*">* · Semua Module</option>' + [...modules()].map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
  }

  function fillPageOptions(selected) {
    const moduleCode = $("rule-module").value;
    const pages = moduleCode === "*" ? [] : catalog.filter((page) => page.moduleCode === moduleCode);
    $("rule-page").innerHTML = '<option value="*">* · Semua Halaman</option>' + pages.map((page) => `<option value="${esc(page.pageCode)}">${esc(page.pageLabel)}</option>`).join("");
    if (selected && [...$("rule-page").options].some((option) => option.value === selected)) $("rule-page").value = selected;
  }

  function localDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function renderRules() {
    const query = $("rule-search").value.trim().toLowerCase();
    const visible = state.rules.filter((rule) => !query || `${rule.ruleCode} ${rule.ruleName} ${rule.moduleCode} ${rule.pageCode}`.toLowerCase().includes(query));
    $("rule-count").textContent = `${state.rules.length} rule`;
    $("rule-list").innerHTML = visible.map((rule) => `<button type="button" class="system-record-item ${rule.id === state.currentId ? "active" : ""}" data-rule-id="${esc(rule.id)}"><strong>${esc(rule.ruleName)}</strong><span><em>${esc(rule.moduleCode)} / ${esc(rule.pageCode)}</em><i class="${rule.isActive ? "active-dot" : "inactive-dot"}">${rule.isActive ? "Aktif" : "Nonaktif"} · ${rule.steps?.length || 0} step</i></span></button>`).join("") || '<div class="system-empty">Rule tidak ditemukan.</div>';
  }

  function emptyStep(order = 1) {
    return { stepOrder: order, stepName: `Approval Level ${order}`, approverRoleId: "", requiredApprovals: 1, pendingStatus: "", approvedStatus: "", rejectedStatus: "Rejected", slaHours: "", isActive: true };
  }

  function renderSteps() {
    const roleOptions = '<option value="">Permission action (tanpa role khusus)</option>' + state.roles.map((role) => `<option value="${esc(role.id)}">${esc(role.roleName)} (${esc(role.roleCode)})</option>`).join("");
    $("approval-steps").innerHTML = state.steps.map((step, index) => `<tr data-step-index="${index}"><td><b>${index + 1}</b></td><td><input data-field="stepName" value="${esc(step.stepName || `Approval Level ${index + 1}`)}"></td><td><select data-field="approverRoleId">${roleOptions}</select></td><td><input data-field="requiredApprovals" type="number" min="1" value="${esc(step.requiredApprovals || 1)}"></td><td><input data-field="pendingStatus" value="${esc(step.pendingStatus || "")}" placeholder="Checking..."></td><td><input data-field="approvedStatus" value="${esc(step.approvedStatus || "")}" placeholder="Approved"></td><td><input data-field="rejectedStatus" value="${esc(step.rejectedStatus || "Rejected")}"></td><td><input data-field="slaHours" type="number" min="0" value="${esc(step.slaHours ?? "")}"></td><td><button class="approval-step-remove" type="button" title="Hapus step">×</button></td></tr>`).join("") || '<tr><td colspan="9" class="system-empty">Belum ada approval step.</td></tr>';
    state.steps.forEach((step, index) => {
      const select = $(`approval-steps`).querySelector(`tr[data-step-index="${index}"] [data-field="approverRoleId"]`);
      if (select) select.value = step.approverRoleId || "";
    });
  }

  function syncStepsFromDom() {
    state.steps = [...$("approval-steps").querySelectorAll("tr[data-step-index]")].map((row, index) => {
      const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value ?? "";
      return {
        stepOrder: index + 1,
        stepName: value("stepName"),
        approverRoleId: value("approverRoleId") || null,
        permissionAction: "approve",
        requiredApprovals: Math.max(Number(value("requiredApprovals") || 1), 1),
        pendingStatus: value("pendingStatus") || null,
        approvedStatus: value("approvedStatus") || null,
        rejectedStatus: value("rejectedStatus") || null,
        slaHours: value("slaHours") === "" ? null : Number(value("slaHours")),
        isActive: true,
      };
    });
  }

  function applyRule(rule) {
    state.currentId = rule?.id || null;
    $("rule-code").value = rule?.ruleCode || "";
    $("rule-name").value = rule?.ruleName || "";
    $("rule-module").value = rule?.moduleCode || [...modules().keys()][0] || "*";
    fillPageOptions(rule?.pageCode || "*");
    $("rule-action").value = rule?.actionCode || "approve";
    $("rule-document-type").value = rule?.documentType || "";
    $("rule-priority").value = rule?.priority || 100;
    $("rule-currency").value = rule?.currencyCode || "";
    $("rule-min-amount").value = rule?.minAmount ?? "";
    $("rule-max-amount").value = rule?.maxAmount ?? "";
    $("rule-effective-from").value = localDate(rule?.effectiveFrom);
    $("rule-effective-until").value = localDate(rule?.effectiveUntil);
    $("rule-description").value = rule?.description || "";
    $("rule-conditions").value = rule?.conditions ? JSON.stringify(rule.conditions, null, 2) : "";
    $("rule-sequential").checked = rule ? rule.requireSequential !== false : true;
    $("rule-self-approval").checked = rule?.allowSelfApproval === true;
    $("rule-active").checked = rule ? rule.isActive !== false : true;
    $("delete-rule").classList.toggle("d-none", !rule);
    state.steps = (rule?.steps || [emptyStep()]).map((step, index) => ({ ...step, stepOrder: index + 1 }));
    renderSteps();
    renderRules();
  }

  function payload() {
    syncStepsFromDom();
    const conditionText = $("rule-conditions").value.trim();
    let conditions = null;
    if (conditionText) {
      try { conditions = JSON.parse(conditionText); }
      catch { throw new Error("Conditions JSON tidak valid."); }
    }
    return {
      ruleCode: $("rule-code").value,
      ruleName: $("rule-name").value,
      moduleCode: $("rule-module").value,
      pageCode: $("rule-page").value,
      actionCode: $("rule-action").value,
      documentType: $("rule-document-type").value || null,
      priority: Number($("rule-priority").value || 100),
      currencyCode: $("rule-currency").value || null,
      minAmount: $("rule-min-amount").value === "" ? null : Number($("rule-min-amount").value),
      maxAmount: $("rule-max-amount").value === "" ? null : Number($("rule-max-amount").value),
      effectiveFrom: $("rule-effective-from").value || null,
      effectiveUntil: $("rule-effective-until").value || null,
      description: $("rule-description").value || null,
      conditions,
      requireSequential: $("rule-sequential").checked,
      allowSelfApproval: $("rule-self-approval").checked,
      isActive: $("rule-active").checked,
      steps: state.steps,
    };
  }

  async function load() {
    try {
      fillModuleOptions();
      fillPageOptions("*");
      const [rulesPayload, rolesPayload] = await Promise.all([
        api("/master-data/api/approval-rules?start=0&length=500"),
        api("/master-data/api/approval-rules/roles"),
      ]);
      state.rules = rulesPayload.data || rulesPayload.items || [];
      state.roles = rolesPayload.items || rolesPayload.data || [];
      applyRule(state.rules[0] || null);
    } catch (error) { alert(error.message, "danger"); }
  }

  $("rule-module").addEventListener("change", () => fillPageOptions("*"));
  $("rule-search").addEventListener("input", renderRules);
  $("rule-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-rule-id]");
    if (button) applyRule(state.rules.find((rule) => rule.id === button.dataset.ruleId));
  });
  $("new-rule").addEventListener("click", () => applyRule(null));
  $("add-step").addEventListener("click", () => { syncStepsFromDom(); state.steps.push(emptyStep(state.steps.length + 1)); renderSteps(); });
  $("approval-steps").addEventListener("click", (event) => {
    if (!event.target.closest(".approval-step-remove")) return;
    const row = event.target.closest("tr[data-step-index]");
    syncStepsFromDom();
    state.steps.splice(Number(row.dataset.stepIndex), 1);
    renderSteps();
  });
  $("save-rule").addEventListener("click", async () => {
    const button = $("save-rule");
    button.disabled = true;
    try {
      const body = payload();
      if (!body.ruleCode.trim() || !body.ruleName.trim()) throw new Error("Kode dan nama rule wajib diisi.");
      if (body.isActive && body.steps.length === 0) throw new Error("Rule aktif wajib memiliki minimal satu step.");
      const saved = await api(state.currentId ? `/master-data/api/approval-rules/${encodeURIComponent(state.currentId)}` : "/master-data/api/approval-rules", { method: state.currentId ? "PATCH" : "POST", body: JSON.stringify(body) });
      const index = state.rules.findIndex((rule) => rule.id === saved.id);
      if (index >= 0) state.rules[index] = saved; else state.rules.push(saved);
      state.rules.sort((a, b) => a.moduleCode.localeCompare(b.moduleCode) || a.pageCode.localeCompare(b.pageCode) || a.priority - b.priority);
      applyRule(saved);
      alert("Approval rule berhasil disimpan.");
    } catch (error) { alert(error.message, "danger"); }
    finally { button.disabled = false; }
  });
  $("delete-rule").addEventListener("click", async () => {
    if (!state.currentId || !confirm("Hapus approval rule ini?")) return;
    try {
      await api(`/master-data/api/approval-rules/${encodeURIComponent(state.currentId)}`, { method: "DELETE" });
      state.rules = state.rules.filter((rule) => rule.id !== state.currentId);
      applyRule(state.rules[0] || null);
      alert("Approval rule berhasil dihapus.");
    } catch (error) { alert(error.message, "danger"); }
  });

  load();
})();
