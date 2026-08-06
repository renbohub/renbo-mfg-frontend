(function () {
  const buttons = [...document.querySelectorAll("[data-dashboard-target]")];
  const panels = [...document.querySelectorAll("[data-dashboard-panel]")];
  if (!buttons.length || !panels.length) return;

  function activate(target) {
    buttons.forEach((button) => {
      const active = button.dataset.dashboardTarget === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    panels.forEach((panel) => {
      const active = panel.dataset.dashboardPanel === target;
      panel.hidden = !active;
      if (active) panel.querySelector("[data-executive-dashboard]")?.dispatchEvent(new CustomEvent("executive-dashboard:activate"));
    });
  }

  buttons.forEach((button) => button.addEventListener("click", () => activate(button.dataset.dashboardTarget)));
})();
