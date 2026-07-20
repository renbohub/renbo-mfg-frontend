(function () {
  const form = document.getElementById("login-form");
  const alertBox = document.getElementById("login-alert");
  const button = document.getElementById("login-button");
  const spinner = button.querySelector(".spinner-border");
  const buttonText = button.querySelector(".login-button-text");
  const password = document.getElementById("password");

  if (localStorage.getItem("token") || sessionStorage.getItem("token")) window.location.replace(form.dataset.next || "/modules");

  document.getElementById("toggle-password").addEventListener("click", function () {
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    this.textContent = visible ? "Lihat" : "Sembunyi";
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    alertBox.classList.add("d-none"); button.disabled = true; spinner.classList.remove("d-none"); buttonText.textContent = "Memeriksa...";
    try {
      const response = await fetch("/auth/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: form.identifier.value.trim(), password: form.password.value })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Login gagal.");
      const storage = document.getElementById("remember").checked ? localStorage : sessionStorage;
      localStorage.removeItem("token"); localStorage.removeItem("user");
      sessionStorage.removeItem("token"); sessionStorage.removeItem("user");
      storage.setItem("token", payload.token); storage.setItem("user", JSON.stringify(payload.user || {}));
      window.location.replace(form.dataset.next || "/modules");
    } catch (error) {
      alertBox.textContent = error.message; alertBox.classList.remove("d-none");
    } finally {
      button.disabled = false; spinner.classList.add("d-none"); buttonText.textContent = "Masuk";
    }
  });
})();
