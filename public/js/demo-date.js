(() => {
  const form = document.getElementById("demo-date-form");
  if (!form) return;
  const input = document.getElementById("demo-date-input");
  const error = document.getElementById("demo-date-error");
  async function save(demoDate) {
    error.textContent = "";
    const buttons = form.querySelectorAll("button");
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const response = await fetch("/demo-date", {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
        body: JSON.stringify({ demoDate }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 403 ? "Anda tidak memiliki izin mengubah pengaturan sistem." : payload.message || "Tanggal gagal disimpan.");
      location.reload();
    } catch (err) {
      error.textContent = err.message || "Tanggal gagal disimpan.";
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); if (form.reportValidity()) save(input.value); });
  document.getElementById("demo-date-reset").addEventListener("click", () => save(null));
})();
