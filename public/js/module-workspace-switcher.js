(() => {
  "use strict";

  const initWorkspaceSwitcher = (root) => {
    const trigger = root.querySelector("[data-workspace-trigger]");
    const menu = root.querySelector("[data-workspace-menu]");
    if (!trigger || !menu) return;

    let isOpen = false;

    const placeMenu = () => {
      if (!isOpen) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 16;
      const menuWidth = Math.min(780, window.innerWidth - (viewportPadding * 2));
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );

      menu.style.width = `${menuWidth}px`;
      menu.style.left = `${left}px`;
      menu.style.top = `${rect.bottom}px`;
    };

    const closeMenu = ({ restoreFocus = false } = {}) => {
      if (!isOpen) return;
      isOpen = false;
      menu.classList.remove("show");
      trigger.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
      root.appendChild(menu);
      menu.removeAttribute("style");
      if (restoreFocus) trigger.focus();
    };

    const openMenu = ({ focusFirst = false } = {}) => {
      if (isOpen) return;
      isOpen = true;
      document.body.appendChild(menu);
      menu.classList.add("show");
      trigger.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
      placeMenu();
      if (focusFirst) menu.querySelector("[role='menuitem']")?.focus();
    };

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen) closeMenu();
      else openMenu();
    });

    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openMenu({ focusFirst: true });
    });

    document.addEventListener("click", (event) => {
      if (isOpen && !root.contains(event.target) && !menu.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (isOpen && event.key === "Escape") closeMenu({ restoreFocus: true });
    });

    window.addEventListener("resize", placeMenu, { passive: true });
    window.addEventListener("scroll", placeMenu, { passive: true, capture: true });
  };

  const boot = () => document.querySelectorAll("[data-workspace-switcher]").forEach(initWorkspaceSwitcher);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
