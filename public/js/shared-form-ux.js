(function () {
  const FORM_SELECTOR = [
    "[data-enterprise-form]",
    "#sales-form",
    "#pr-form",
    "#po-form",
    "#invoice-form",
    "#inventory-form",
    "#production-shared-form",
    "#production-log-form",
    "#production-schedule-form",
    "#supply-form"
  ].join(",");

  const textOf = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

  function sectionsOf(form) {
    return [...form.querySelectorAll(":scope > .form-section, :scope > .ops-detail-card, :scope > .sales-card")]
      .filter((section) => !section.hidden && !section.classList.contains("d-none"));
  }

  function sectionLabel(section, index) {
    return textOf(section.querySelector("h1, h2, .module-form-section-title")) || `Bagian ${index + 1}`;
  }

  function addSectionNavigation(form) {
    if (form.dataset.disableSectionNav === "true") return;
    const sections = sectionsOf(form);
    if (sections.length < 2 || form.closest(".entity-form-workspace")?.querySelector(".form-section-nav")) return;
    const nav = document.createElement("nav");
    nav.className = "erp-form-jump";
    nav.setAttribute("aria-label", "Navigasi bagian form");
    nav.innerHTML = `<span>LOMPAT KE</span><div>${sections.map((section, index) => {
      section.id ||= `${form.id || "enterprise-form"}-section-${index + 1}`;
      return `<a href="#${section.id}">${index + 1}. ${sectionLabel(section, index)}</a>`;
    }).join("")}</div>`;
    form.insertBefore(nav, sections[0]);
  }

  function requiredControls(form) {
    return [...form.querySelectorAll("[required]")].filter((control) => !control.disabled && control.type !== "hidden");
  }

  function isComplete(control) {
    if (control.type === "checkbox" || control.type === "radio") return control.checked;
    if (control.type === "file") return control.files?.length > 0;
    return String(control.value || "").trim() !== "" && control.validity.valid;
  }

  function createProgress(form) {
    const progress = document.createElement("div");
    progress.className = "erp-form-progress";
    progress.setAttribute("aria-live", "polite");
    const update = () => {
      const required = requiredControls(form);
      const completed = required.filter(isComplete).length;
      const percentage = required.length ? Math.round((completed / required.length) * 100) : 100;
      progress.innerHTML = `<span><b>${completed}/${required.length}</b> field wajib terisi</span><i><u style="width:${percentage}%"></u></i>`;
      progress.classList.toggle("is-complete", percentage === 100);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    requestAnimationFrame(update);
    return { progress, update };
  }

  function findSubmit(form) {
    return form.querySelector('[type="submit"]')
      || (form.id ? document.querySelector(`[type="submit"][form="${form.id}"]`) : null);
  }

  function enhanceActions(form, progress) {
    const directActions = form.querySelector(":scope > .form-actions, :scope > .module-form-actions");
    if (directActions) {
      directActions.prepend(progress);
      return;
    }

    const originalSubmit = findSubmit(form);
    if (!originalSubmit) return;
    const originalActions = originalSubmit.closest(".ops-title-actions, .form-actions, .module-form-actions");

    const cancel = originalActions?.querySelector('a[href]:not([href="#"])');
    const dock = document.createElement("div");
    dock.className = "erp-form-dock";
    const controls = document.createElement("div");
    controls.className = "erp-form-dock-actions";
    if (cancel) {
      const cancelLink = document.createElement("a");
      cancelLink.className = "btn btn-light";
      cancelLink.href = cancel.href;
      cancelLink.textContent = "Batal";
      controls.appendChild(cancelLink);
    }
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "btn btn-primary brand-button";
    submit.textContent = textOf(originalSubmit) || "Simpan Perubahan";
    submit.addEventListener("click", () => form.requestSubmit(originalSubmit));
    controls.appendChild(submit);
    dock.append(progress, controls);
    form.appendChild(dock);
  }

  function focusInvalidField(form) {
    form.addEventListener("invalid", (event) => {
      const control = event.target;
      control.setAttribute("aria-invalid", "true");
      control.closest("details")?.setAttribute("open", "");
      if (form.dataset.invalidFocusPending) return;
      form.dataset.invalidFocusPending = "true";
      requestAnimationFrame(() => {
        control.scrollIntoView({ behavior: "smooth", block: "center" });
        control.focus({ preventScroll: true });
        delete form.dataset.invalidFocusPending;
      });
    }, true);
    form.addEventListener("input", (event) => {
      if (event.target.validity?.valid) event.target.removeAttribute("aria-invalid");
    });
  }

  function enhance(form) {
    if (form.dataset.enterpriseFormReady === "true") return;
    form.dataset.enterpriseFormReady = "true";
    addSectionNavigation(form);
    const { progress } = createProgress(form);
    enhanceActions(form, progress);
    focusInvalidField(form);
  }

  document.querySelectorAll(FORM_SELECTOR).forEach(enhance);
})();
