(function () {
  const ELIGIBLE = "select:not([data-searchable-disabled]):not([data-enterprise-lookup])";
  const SELECTOR = `select[data-searchable]:not([data-enterprise-lookup]), .ppic-page ${ELIGIBLE}, .ops-modal ${ELIGIBLE}, [data-enterprise-form] ${ELIGIBLE}`;
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  function enhance(select) {
    if (!select || select.dataset.searchableReady === "true" || select.hasAttribute("data-enterprise-lookup") || select.classList.contains("select2-hidden-accessible") || select.multiple || select.size > 1) return;
    select.dataset.searchableReady = "true";
    const wrap = document.createElement("div");
    wrap.className = "searchable-select";
    const input = document.createElement("input");
    input.type = "search";
    input.className = select.classList.contains("form-select") ? "form-control searchable-select-input" : "searchable-select-input";
    input.placeholder = select.dataset.searchPlaceholder || "Cari dan pilih…";
    input.autocomplete = "off";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "searchable-select-menu";
    menu.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    wrap.append(select, input, menu);
    select.classList.add("searchable-select-native");

    const options = () => [...select.options].filter((option) => !option.disabled);
    const sync = () => {
      const selected = select.selectedOptions[0];
      input.value = selected && selected.value ? selected.textContent.trim() : "";
      input.disabled = select.disabled;
      input.required = select.required;
    };
    const render = (query = "") => {
      const normalized = query.trim().toLowerCase();
      const visible = options().filter((option) => !normalized || option.textContent.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized)).slice(0, 100);
      menu.innerHTML = visible.length ? visible.map((option) => `<button type="button" role="option" data-value="${esc(option.value)}" class="${option.selected ? "is-selected" : ""}"><span>${esc(option.textContent.trim())}</span>${option.value && option.value !== option.textContent.trim() ? `<small>${esc(option.value)}</small>` : ""}</button>`).join("") : '<p>Tidak ada pilihan yang cocok.</p>';
    };
    const open = () => { render(input.value); wrap.classList.add("is-open"); input.setAttribute("aria-expanded", "true"); };
    const close = () => { wrap.classList.remove("is-open"); input.setAttribute("aria-expanded", "false"); sync(); };
    input.addEventListener("focus", () => { input.select(); open(); });
    input.addEventListener("input", () => { render(input.value); wrap.classList.add("is-open"); });
    input.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-value]");
      if (!option) return;
      select.value = option.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    });
    select.addEventListener("change", sync);
    document.addEventListener("click", (event) => { if (!wrap.contains(event.target)) close(); });
    new MutationObserver(() => sync()).observe(select, { childList: true, subtree: true, attributes: true });
    sync();
  }

  const scan = (root = document) => root.querySelectorAll?.(SELECTOR).forEach(enhance);
  scan();
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => { if (node.nodeType === 1) { if (node.matches?.(SELECTOR)) enhance(node); scan(node); } }))).observe(document.body, { childList: true, subtree: true });
})();
