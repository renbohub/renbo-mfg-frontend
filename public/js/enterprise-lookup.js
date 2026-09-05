(function (root) {
  const model = root.EnterpriseLookupModel;
  const $ = root.jQuery;
  const SELECTOR = "select[data-enterprise-lookup]";

  function authHeaders() {
    const token = root.localStorage?.getItem("token") || root.sessionStorage?.getItem("token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function emit(select, name, detail = {}) {
    select.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }

  function optionValues(select) {
    return Array.from(select.options).map((option) => option.value);
  }

  function currentValue(select) {
    return select.multiple ? Array.from(select.selectedOptions).map((option) => option.value) : select.value;
  }

  function errorNode(select) {
    let node = select.parentElement?.querySelector(":scope > .enterprise-lookup-error");
    if (!node) {
      node = document.createElement("span");
      node.className = "enterprise-lookup-error";
      node.setAttribute("role", "alert");
      select.parentElement?.appendChild(node);
    }
    return node;
  }

  function setInvalid(select, message = "Pilih data yang tersedia.") {
    select.setAttribute("aria-invalid", "true");
    const node = errorNode(select);
    node.textContent = message;
    node.hidden = false;
    emit(select, "enterprise-lookup:invalid", { message });
  }

  function clearInvalid(select) {
    select.removeAttribute("aria-invalid");
    const node = select.parentElement?.querySelector(":scope > .enterprise-lookup-error");
    if (node) { node.textContent = ""; node.hidden = true; }
  }

  function resolveParent(select) {
    const selector = select.dataset.lookupParent;
    if (!selector) return null;
    return select.closest("form, [data-document-shell]")?.querySelector(selector) || document.querySelector(selector);
  }

  function dropdownParent(select) {
    const host = model.dropdownHost(select);
    if (host && host !== model.closestDialog(select)) host.classList.add("enterprise-lookup-dropdown-host");
    return host && $ ? $(host) : ($ ? $(document.body) : undefined);
  }

  function parentData(select) {
    const parent = resolveParent(select);
    const parameter = select.dataset.lookupParentParam;
    return parent && parameter && model.isDependencyReady(parent.value) ? { [parameter]: parent.value } : {};
  }

  function setSelected(select, item) {
    if (!select || !item?.id) return;
    const id = String(item.id);
    let option = Array.from(select.options).find((candidate) => candidate.value === id);
    if (!option) {
      option = new Option(item.text || id, id, true, true);
      option.dataset.lookupResolved = "true";
      option.dataset.lookupActive = item.active === false ? "false" : "true";
      select.add(option);
    }
    option.selected = true;
    option._enterpriseLookupData = item.data || item;
    clearInvalid(select);
    if ($) $(select).trigger("change");
    else select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getSelected(select) {
    if (!select) return select?.multiple ? [] : null;
    const values = Array.from(select.selectedOptions).map((option) => option._enterpriseLookupData).filter(Boolean);
    return select.multiple ? values : (values[0] || null);
  }

  function clear(select, { emitEvent = true } = {}) {
    if (!select) return;
    Array.from(select.options).forEach((option) => { option.selected = false; });
    select.value = "";
    clearInvalid(select);
    if ($ && select.classList.contains("select2-hidden-accessible")) $(select).val(null).trigger("change");
    else select.dispatchEvent(new Event("change", { bubbles: true }));
    if (emitEvent) emit(select, "enterprise-lookup:cleared");
  }

  function syncDependency(select) {
    const parent = resolveParent(select);
    if (!parent) return;
    const ready = model.isDependencyReady(parent.value);
    select.disabled = !ready;
    if (!ready && currentValue(select)) clear(select);
  }

  function select2Options(select) {
    const source = select.dataset.enterpriseLookup;
    const minimumInputLength = Math.max(0, Number.parseInt(select.dataset.lookupMinimumInputLength, 10) || 0);
    return {
      width: "100%",
      tags: false,
      minimumInputLength,
      allowClear: !select.required,
      placeholder: select.dataset.lookupPlaceholder || "Cari dan pilih",
      dropdownParent: dropdownParent(select),
      ajax: {
        url: `/lookups/api/${encodeURIComponent(source)}`,
        dataType: "json",
        headers: authHeaders(),
        delay: 250,
        cache: true,
        data(params) {
          select.dataset.lookupLoading = "true";
          return { q: model.normalizeQuery(params.term), page: params.page || 1, pageSize: 25, ...parentData(select) };
        },
        processResults(payload) {
          select.dataset.lookupLoading = "false";
          delete select.dataset.lookupErrorStatus;
          return model.normalizeResponse(payload);
        },
        transport(params, success, failure) {
          params.headers = { ...(params.headers || {}), ...authHeaders() };
          const request = $.ajax(params);
          request.then(success);
          request.fail((xhr) => {
            select.dataset.lookupLoading = "false";
            select.dataset.lookupErrorStatus = String(xhr?.status || "NETWORK");
            failure(xhr);
          });
          return request;
        }
      },
      templateResult(item) {
        if (item.loading) return item.text;
        const content = document.createElement("span");
        content.className = "enterprise-lookup-option";
        content.textContent = model.composeLabel(item, { includeMeta: true });
        return $(content);
      },
      templateSelection(item) {
        return model.composeLabel(item) || select.dataset.lookupPlaceholder || "Cari dan pilih";
      }
    };
  }

  function enhance(select) {
    if (!select || select.dataset.enterpriseLookupReady === "true" || select.classList.contains("select2-hidden-accessible")) return select;
    select.dataset.enterpriseLookupReady = "true";
    select.setAttribute("data-searchable-disabled", "true");
    const current = model.currentOption(select.dataset);
    if (current) setSelected(select, current);

    const parent = resolveParent(select);
    if (parent) {
      parent.addEventListener("change", () => {
        clear(select);
        syncDependency(select);
      });
      syncDependency(select);
    }

    if ($?.fn?.select2) {
      $(select).select2(select2Options(select));
      $(select).on("select2:select", (event) => {
        const option = Array.from(select.options).find((candidate) => candidate.value === String(event.params?.data?.id ?? ""));
        if (option) option._enterpriseLookupData = event.params.data?.data || event.params.data;
        clearInvalid(select);
      });
      $(select).on("select2:clear", () => clearInvalid(select));
    }
    return select;
  }

  function scan(rootNode = document) {
    if (rootNode.matches?.(SELECTOR)) enhance(rootNode);
    rootNode.querySelectorAll?.(SELECTOR).forEach(enhance);
  }

  function validate(rootNode = document) {
    const fields = rootNode.matches?.(SELECTOR) ? [rootNode] : Array.from(rootNode.querySelectorAll?.(SELECTOR) || []);
    let firstInvalid = null;
    fields.forEach((select) => {
      const value = currentValue(select);
      const emptyRequired = select.required && (Array.isArray(value) ? !value.length : !String(value || "").trim());
      const unresolved = !emptyRequired && !model.isResolvedValue(value, optionValues(select));
      const loading = select.dataset.lookupLoading === "true";
      if (emptyRequired || unresolved || loading) {
        setInvalid(select, loading ? "Data pilihan masih dimuat." : "Pilih data yang tersedia.");
        firstInvalid ||= select;
      } else clearInvalid(select);
    });
    firstInvalid?.focus();
    return !firstInvalid;
  }

  document.addEventListener("submit", (event) => {
    if (!event.target.querySelector?.(SELECTOR)) return;
    if (!validate(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  scan();
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType === 1) scan(node);
  }))).observe(document.body, { childList: true, subtree: true });

  root.EnterpriseLookup = { scan, enhance, setSelected, getSelected, clear, validate };
})(window);
