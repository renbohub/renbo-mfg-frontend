(function () {
  const form = document.getElementById("login-form");
  const alertBox = document.getElementById("login-alert");
  const button = document.getElementById("login-button");
  const spinner = button.querySelector(".spinner-border");
  const buttonText = button.querySelector(".login-button-text");
  const password = document.getElementById("password");

  const destination = (user) => user?.partnerAccess ? '/partner-portal' : form.dataset.next || '/home';
  let busy = false;
  function setBusy(value) {
    busy = value;
    button.disabled = value;
    spinner.classList.toggle("d-none", !value);
    buttonText.textContent = value ? "Memeriksa..." : "Masuk";
  }
  function clearSession() {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem("token"); storage.removeItem("user");
    }
  }
  function showError(message) {
    alertBox.textContent = message; alertBox.classList.remove("d-none");
  }
  async function restoreSession() {
    const storage = localStorage.getItem("token") ? localStorage : sessionStorage;
    const savedToken = storage.getItem("token");
    if (!savedToken) return;
    setBusy(true);
    try {
      const response = await fetch("/auth/api/profile", {
        headers: { Authorization: `Bearer ${savedToken}` },
        cache: "no-store", signal: AbortSignal.timeout(15000)
      });
      // Do not overwrite a session changed in another tab while checking.
      if (storage.getItem("token") !== savedToken) return;
      if (response.status === 401) {
        clearSession();
        showError("Sesi berakhir. Silakan masuk kembali.");
        return;
      }
      if (!response.ok) throw new Error("Sesi belum dapat diperiksa. Silakan coba kembali sebentar lagi.");
      const user = await response.json();
      if (!user || typeof user !== "object" || Array.isArray(user)) throw new Error("Profil akun tidak valid.");
      if (storage.getItem("token") !== savedToken) return;
      storage.setItem("user", JSON.stringify(user));
      window.location.replace(destination(user));
    } catch (_) {
      showError("Sesi belum dapat diperiksa. Pastikan server aktif, lalu coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  document.getElementById("toggle-password").addEventListener("click", function () {
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    this.textContent = visible ? "Lihat" : "Sembunyi";
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    alertBox.classList.add("d-none"); setBusy(true);
    try {
      const response = await fetch("/auth/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: form.identifier.value.trim(), password: form.password.value }),
        signal: AbortSignal.timeout(15000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Login gagal.");
      if (typeof payload.token !== "string" || !payload.token.trim()) throw new Error("Server tidak mengembalikan sesi login yang valid.");
      const storage = document.getElementById("remember").checked ? localStorage : sessionStorage;
      clearSession();
      storage.setItem("token", payload.token); storage.setItem("user", JSON.stringify(payload.user || {}));
      window.location.replace(destination(payload.user));
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  });
  restoreSession();
})();
