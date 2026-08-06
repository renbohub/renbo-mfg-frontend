(function () {
  const config = JSON.parse(document.getElementById("role-permission-config").textContent);
  const catalog = Array.isArray(config.permissionCatalog) ? config.permissionCatalog : [];
  const actions = ["read", "create", "update", "delete", "approve", "submit", "release", "export"];
  const state = { roles: [], users: [], currentId: null };
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
    const box = $("role-alert");
    box.textContent = message;
    box.className = `alert alert-${kind} app-container system-alert`;
    if (kind === "success") setTimeout(() => box.classList.add("d-none"), 3500);
  }

  function groupedCatalog() {
    const modules = new Map();
    for (const page of catalog) {
      if (!modules.has(page.moduleCode)) modules.set(page.moduleCode, { label: page.moduleLabel, pages: [] });
      modules.get(page.moduleCode).pages.push(page);
    }
    return modules;
  }

  function renderPermissions() {
    const rows = [];
    for (const [moduleCode, module] of groupedCatalog()) {
      rows.push(`<tr class="permission-module-row"><td colspan="9">${esc(module.label)}</td></tr>`);
      for (const page of module.pages) {
        rows.push(`<tr><td><span class="permission-page-label"><b>${esc(page.pageLabel)}</b><small>${esc(moduleCode)} / ${esc(page.pageCode)}${page.apiReady ? "" : " · placeholder"}</small></span></td>${actions.map((action) => `<td><input type="checkbox" class="permission-check" data-module="${esc(moduleCode)}" data-page="${esc(page.pageCode)}" data-resource="${esc(page.resourceCode || page.pageCode)}" data-action="${action}" aria-label="${action} ${esc(page.pageLabel)}"></td>`).join("")}</tr>`);
      }
    }
    $("permission-rows").innerHTML = rows.join("");
  }

  function renderRoles() {
    const query = $("role-search").value.trim().toLowerCase();
    const visible = state.roles.filter((role) => !query || `${role.roleCode} ${role.roleName} ${role.description || ""}`.toLowerCase().includes(query));
    $("role-count").textContent = `${state.roles.length} role`;
    $("role-list").innerHTML = visible.map((role) => `<button type="button" class="system-record-item ${role.id === state.currentId ? "active" : ""}" data-role-id="${esc(role.id)}"><strong>${esc(role.roleName)}</strong><span><em>${esc(role.roleCode)}</em><i class="${role.isActive ? "active-dot" : "inactive-dot"}">${role.isActive ? "Aktif" : "Nonaktif"} · ${role.userIds?.length || 0} user</i></span></button>`).join("") || '<div class="system-empty">Role tidak ditemukan.</div>';
  }

  function renderUsers(selectedIds = []) {
    const selected = new Set(selectedIds);
    const query = $("user-search").value.trim().toLowerCase();
    const visible = state.users.filter((user) => !query || `${user.username} ${user.fullName || ""} ${user.employee?.fullName || ""} ${user.employee?.position || ""}`.toLowerCase().includes(query));
    $("role-users").innerHTML = visible.map((user) => {
      const name = user.employee?.fullName || user.fullName || user.username;
      const position = user.employee?.position || (user.isSuperAdmin ? "System Admin" : user.username);
      return `<label class="system-user-option"><input type="checkbox" class="role-user-check" value="${esc(user.id)}" ${selected.has(user.id) ? "checked" : ""}><span><b>${esc(name)}</b><small>${esc(position)} · ${esc(user.username)}</small></span></label>`;
    }).join("") || '<div class="system-empty">User tidak ditemukan.</div>';
  }

  function clearPermissionChecks() {
    document.querySelectorAll(".permission-check").forEach((checkbox) => { checkbox.checked = false; });
  }

  function applyRole(role) {
    state.currentId = role?.id || null;
    $("role-code").value = role?.roleCode || "";
    $("role-code").disabled = Boolean(role?.isSystem);
    $("role-name").value = role?.roleName || "";
    $("role-description").value = role?.description || "";
    $("role-active").checked = role ? role.isActive !== false : true;
    $("delete-role").classList.toggle("d-none", !role || role.isSystem);
    clearPermissionChecks();
    for (const permission of role?.permissions || []) {
      const permissionActions = Array.isArray(permission.actions) && permission.actions.includes("*") ? actions : (Array.isArray(permission.actions) ? permission.actions : []);
      for (const action of permissionActions) {
        document.querySelectorAll(".permission-check").forEach((input) => {
          const moduleMatch = permission.moduleCode === "*" || input.dataset.module === permission.moduleCode;
          const pageMatch = permission.pageCode === "*" || input.dataset.page === permission.pageCode || permission.resourceCode === input.dataset.resource;
          if (moduleMatch && pageMatch && input.dataset.action === action) input.checked = true;
        });
      }
    }
    renderUsers(role?.userIds || []);
    renderRoles();
  }

  function collectPermissions() {
    const rows = new Map();
    document.querySelectorAll(".permission-check").forEach((checkbox) => {
      const key = `${checkbox.dataset.module}|${checkbox.dataset.page}`;
      if (!rows.has(key)) rows.set(key, { moduleCode: checkbox.dataset.module, pageCode: checkbox.dataset.page, resourceCode: checkbox.dataset.resource, actions: [] });
      if (checkbox.checked) rows.get(key).actions.push(checkbox.dataset.action);
    });
    return [...rows.values()].filter((row) => row.actions.length > 0);
  }

  function payload() {
    return {
      roleCode: $("role-code").value,
      roleName: $("role-name").value,
      description: $("role-description").value,
      isActive: $("role-active").checked,
      permissions: collectPermissions(),
      userIds: [...document.querySelectorAll(".role-user-check:checked")].map((input) => input.value),
    };
  }

  async function load() {
    try {
      renderPermissions();
      const [rolesPayload, usersPayload] = await Promise.all([
        api("/master-data/api/roles-permissions?start=0&length=500"),
        api("/master-data/api/roles-permissions/users"),
      ]);
      state.roles = rolesPayload.data || rolesPayload.items || [];
      state.users = usersPayload.items || usersPayload.data || [];
      applyRole(state.roles[0] || null);
    } catch (error) {
      alert(error.message, "danger");
    }
  }

  $("role-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-role-id]");
    if (button) applyRole(state.roles.find((role) => role.id === button.dataset.roleId));
  });
  $("role-search").addEventListener("input", renderRoles);
  $("user-search").addEventListener("input", () => {
    const selected = [...document.querySelectorAll(".role-user-check:checked")].map((input) => input.value);
    renderUsers(selected);
  });
  $("new-role").addEventListener("click", () => applyRole(null));
  document.querySelector(".permission-presets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (!button) return;
    document.querySelectorAll(".permission-check").forEach((checkbox) => {
      checkbox.checked = button.dataset.preset === "full" || (button.dataset.preset === "read" && checkbox.dataset.action === "read");
    });
  });
  $("save-role").addEventListener("click", async () => {
    const button = $("save-role");
    button.disabled = true;
    try {
      const body = payload();
      if (!body.roleCode.trim() || !body.roleName.trim()) throw new Error("Kode dan nama role wajib diisi.");
      const saved = await api(state.currentId ? `/master-data/api/roles-permissions/${encodeURIComponent(state.currentId)}` : "/master-data/api/roles-permissions", { method: state.currentId ? "PATCH" : "POST", body: JSON.stringify(body) });
      const index = state.roles.findIndex((role) => role.id === saved.id);
      if (index >= 0) state.roles[index] = saved; else state.roles.push(saved);
      state.roles.sort((a, b) => a.roleName.localeCompare(b.roleName));
      applyRole(saved);
      alert("Role dan permission berhasil disimpan.");
    } catch (error) { alert(error.message, "danger"); }
    finally { button.disabled = false; }
  });
  $("delete-role").addEventListener("click", async () => {
    if (!state.currentId || !confirm("Hapus role ini? Assignment user akan dinonaktifkan.")) return;
    try {
      await api(`/master-data/api/roles-permissions/${encodeURIComponent(state.currentId)}`, { method: "DELETE" });
      state.roles = state.roles.filter((role) => role.id !== state.currentId);
      applyRole(state.roles[0] || null);
      alert("Role berhasil dihapus.");
    } catch (error) { alert(error.message, "danger"); }
  });

  load();
})();
