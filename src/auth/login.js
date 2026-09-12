(function () {
  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("error");
  const pw = document.getElementById("password");
  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get("return") || "/";

  function bindToggle(buttonId, inputEl) {
    const btn = document.getElementById(buttonId);
    btn.addEventListener("click", () => {
      const showing = inputEl.type === "text";
      inputEl.type = showing ? "password" : "text";
      btn.setAttribute("aria-pressed", showing ? "false" : "true");
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      const eye = btn.querySelector('[data-icon="eye"]');
      const eyeOff = btn.querySelector('[data-icon="eye-off"]');
      if (showing) {
        eye.classList.remove("hidden");
        eyeOff.classList.add("hidden");
      } else {
        eye.classList.add("hidden");
        eyeOff.classList.remove("hidden");
      }
    });
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  bindToggle("toggle-password", pw);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username) return showError("Username is required.");
    if (!password) return showError("Password is required.");

    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, return: returnTo }),
        redirect: "manual",
      });
      if (res.type === "opaqueredirect" || res.status === 302 || res.status === 0) {
        window.location.href = returnTo;
        return;
      }
      if (res.status === 401) {
        showError("Invalid username or password.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      showError(data.error || `Login failed (${res.status})`);
    } catch (err) {
      showError(err.message);
    }
  });
})();
