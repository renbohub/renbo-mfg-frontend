(function () {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  let user = {};
  try { user = raw ? JSON.parse(raw) : {}; } catch { user = {}; }
  if (user.partnerAccess) { location.replace('/partner-portal'); return; }
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9*]/g, "");
  const pageAliases = {
    "outgoing/scan": "delivery-schedules",
    "incoming/documents": "goods-receipts",
    "incoming/inspections": "incoming-inspections",
    "incoming/partner-administration": "goods-receipts",
    "inventory/stock-policy": "stock-balances",
    "production/oee-monitoring": "production-report",
    "planning-ppic/mps": "master-production-schedule",
    "planning-ppic/mrp": "material-requirements-planning",
    "planning-ppic/consume-forecast": "consume-forecast",
    "planning-ppic/monthly-plan": "monthly-plan"
  };

  function hasPermission(moduleCode, pageCode, action = "read", resourceCode = "") {
    if (user.partnerAccess) return false;
    if (user.isSuperAdmin) return true;
    const permissions = Array.isArray(user.effectivePermissions) ? user.effectivePermissions : [];
    if (Array.isArray(user.roles) && user.roles.length > 0) {
      return permissions.some((permission) => {
        const moduleMatch = permission.moduleCode === "*" || normalize(permission.moduleCode) === normalize(moduleCode);
        const pageMatch = permission.pageCode === "*" || [pageCode, resourceCode].some((value) => normalize(permission.pageCode) === normalize(value) || normalize(permission.resourceCode) === normalize(value));
        const actions = Array.isArray(permission.actions) ? permission.actions.map((item) => String(item).toLowerCase()) : [];
        const actionMatch = actions.includes("*") || actions.includes(action) || (action === "read" && actions.length > 0);
        return moduleMatch && pageMatch && actionMatch;
      });
    }
    const legacy = Array.isArray(user.listMenu) ? user.listMenu : [];
    return legacy.some((entry) => normalize(entry?.resource) === normalize(resourceCode || pageCode) && (entry.actions || []).some((item) => item === "*" || item === action || action === "read"));
  }

  function updateIdentity() {
    const name = user.employee?.fullName || user.fullName || user.username || "Pengguna";
    const role = user.isSuperAdmin ? "System Admin" : user.roles?.map((item) => item.roleName).join(", ") || user.employee?.position || "ERP User";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
    document.querySelectorAll("[data-user-name]").forEach((node) => node.textContent = name);
    document.querySelectorAll("[data-user-role]").forEach((node) => node.textContent = role);
    document.querySelectorAll("[data-user-avatar]").forEach((node) => node.textContent = initials);
  }

  function routePermission(pathname) {
    if (/^\/modules\/planning-ppic\/(labs|execution|analytics)\//.test(pathname)) return { moduleCode:'planning-ppic', pageCode:'master-production-schedule', action:'read' };
    // Department inbox: the API limits records and feedback to assigned accounts.
    // Opening it does not grant access to MPS workbench or approval actions.
    if (pathname === "/modules/planning-ppic/mps/recovery-kanban") return null;
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "master-data" && parts[1] && parts[1] !== "api") {
      const action = parts[2] === "new" ? "create" : parts[3] === "edit" ? "update" : "read";
      return { moduleCode: "master-data", pageCode: parts[1], action };
    }
    if (parts[0] === "modules" && parts[1] && parts[2]) {
      const pageCode = pageAliases[`${parts[1]}/${parts[2]}`] || parts[2];
      const action = parts[3] === "new" ? "create" : parts[4] === "edit" ? "update" : "read";
      return { moduleCode: parts[1], pageCode, action };
    }
    return null;
  }

  function enforceCurrentPage() {
    const target = routePermission(location.pathname);
    if (!target || hasPermission(target.moduleCode, target.pageCode, target.action || "read")) return;
    document.body.innerHTML = `<main class="container py-5"><div class="alert alert-danger"><h1 class="h4">Akses halaman ditolak</h1><p>Role Anda tidak mempunyai permission untuk halaman ini.</p><a class="btn btn-outline-danger" href="/modules">Kembali ke daftar module</a></div></main>`;
  }

  function hideRestrictedLinks() {
    document.querySelectorAll("a[href]").forEach((link) => {
      const url = new URL(link.href, location.origin);
      if (url.origin !== location.origin) return;
      const target = routePermission(url.pathname);
      if (target && !hasPermission(target.moduleCode, target.pageCode, target.action || "read")) link.classList.add("d-none");
    });
  }

  function hideRestrictedActions() {
    const target = routePermission(location.pathname);
    if (!target) return;
    document.querySelectorAll("[data-action]").forEach((element) => {
      const value = String(element.dataset.action || "").toLowerCase();
      const action = /approve|confirm/.test(value) ? "approve"
        : /release/.test(value) ? "release"
          : /submit/.test(value) ? "submit"
            : /delete|remove|cancel/.test(value) ? "delete"
              : /create|make|generate|add/.test(value) ? "create"
                : /save|edit|update|revise/.test(value) ? "update"
                  : null;
      if (action && !hasPermission(target.moduleCode, target.pageCode, action)) element.classList.add("d-none");
    });
  }

  window.ERP_PERMISSIONS = { has: hasPermission, user: () => user };
  updateIdentity();
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => {
    localStorage.removeItem("token"); localStorage.removeItem("user"); sessionStorage.removeItem("token"); sessionStorage.removeItem("user"); location.replace("/login");
  }));
  const activeToken = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (activeToken) fetch("/auth/api/profile", { headers: { Authorization: `Bearer ${activeToken}` } })
    .then((response) => response.ok ? response.json() : null)
    .then((profile) => {
      if (profile) {
        user = profile;
        const storage = localStorage.getItem("token") ? localStorage : sessionStorage;
        storage.setItem("user", JSON.stringify(user));
        if (user.partnerAccess) { location.replace('/partner-portal'); return; }
        window.ERP_PERMISSIONS = { has: hasPermission, user: () => user };
        updateIdentity();
        hideRestrictedLinks();
        hideRestrictedActions();
        enforceCurrentPage();
        window.dispatchEvent(new CustomEvent("erp:permissions-ready", { detail: user }));
      }
    })
    .catch(() => {});
})();
