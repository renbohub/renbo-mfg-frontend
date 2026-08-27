(function () {
  const forms = new WeakMap();

  function ensureLiveRegion(form) {
    let region = form.querySelector("[data-document-form-status]");
    if (!region) {
      region = document.createElement("p");
      region.className = "document-form-status visually-hidden";
      region.dataset.documentFormStatus = "";
      region.setAttribute("aria-live", "polite");
      form.appendChild(region);
    }
    return region;
  }

  function state(form) {
    if (!forms.has(form)) forms.set(form, { dirty: false, submitting: false });
    return forms.get(form);
  }

  function setSubmitLock(form, locked) {
    const current = state(form);
    current.submitting = locked;
    form.setAttribute("data-document-submit-lock", locked ? "true" : "false");
    form.querySelectorAll("button[type='submit'], input[type='submit']").forEach((button) => { button.disabled = locked; });
  }

  function announce(form, message) {
    ensureLiveRegion(form).textContent = message;
  }

  function enhance(form) {
    if (form.dataset.documentFormStateReady === "true") return;
    form.dataset.documentFormStateReady = "true";
    ensureLiveRegion(form);
    const markDirty = () => { if (!state(form).submitting) state(form).dirty = true; };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", (event) => {
      if (state(form).submitting) { event.preventDefault(); return; }
      setSubmitLock(form, true);
      announce(form, "Menyimpan dokumen…");
    });
    form.addEventListener("document-form:error", (event) => {
      setSubmitLock(form, false);
      announce(form, event.detail?.message || "Dokumen gagal disimpan.");
    });
    form.addEventListener("document-form:success", (event) => {
      state(form).dirty = false;
      setSubmitLock(form, false);
      announce(form, event.detail?.message || "Dokumen tersimpan.");
    });
  }

  document.querySelectorAll("form[data-document-form]").forEach(enhance);
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType !== 1) return;
    if (node.matches?.("form[data-document-form]")) enhance(node);
    node.querySelectorAll?.("form[data-document-form]").forEach(enhance);
  }))).observe(document.body, { childList: true, subtree: true });

  window.addEventListener("beforeunload", (event) => {
    const dirty = Array.from(document.querySelectorAll("form[data-document-form]")).some((form) => state(form).dirty && !state(form).submitting);
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.DocumentFormState = { enhance, setSubmitLock };
})();
