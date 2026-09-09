(function () {
  const form = document.getElementById("confirm-form");
  const errorBox = document.getElementById("error");
  const pw = document.getElementById("password");
  const confirm = document.getElementById("confirm");
  const strengthLabel = document.getElementById("strength-label");
  const bars = document.querySelectorAll("#strength-meter [data-bar]");

  const params = new URLSearchParams(window.location.search);
  if (params.get("token")) form.token.value = params.get("token");

  const STRENGTH_TIERS = [
    { label: "Weak password", color: "bg-rose-500", filled: 1 },
    { label: "Medium password", color: "bg-amber-500", filled: 2 },
    { label: "Strong password", color: "bg-emerald-500", filled: 3 },
  ];

  function scoreStrength(value) {
    if (!value) return -1;
    if (value.length < 8) return -1;
    let classes = 0;
    if (/[a-z]/.test(value)) classes++;
    if (/[A-Z]/.test(value)) classes++;
    if (/\d/.test(value)) classes++;
    if (/[^A-Za-z0-9]/.test(value)) classes++;
    if (value.length >= 12 && classes >= 3) return 2;
    if (value.length >= 10 && classes >= 2) return 1;
    return 0;
  }

  function paintStrength() {
    const score = scoreStrength(pw.value);
    bars.forEach((bar) => {
      bar.className = bar.className.replace(/bg-\S+/g, "bg-slate-200");
      bar.classList.remove("bg-rose-500", "bg-amber-500", "bg-emerald-500");
      if (!bar.classList.contains("bg-slate-200")) bar.classList.add("bg-slate-200");
    });
    if (score < 0) {
      strengthLabel.textContent = pw.value ? "Too short — minimum 8 characters." : "Minimum 8 characters.";
      strengthLabel.className = "mt-1.5 text-xs text-slate-500";
      return;
    }
    const tier = STRENGTH_TIERS[score];
    for (let i = 0; i < tier.filled; i++) {
      bars[i].classList.remove("bg-slate-200");
      bars[i].classList.add(tier.color);
    }
    const textColor = score === 0 ? "text-rose-600" : score === 1 ? "text-amber-600" : "text-emerald-600";
    strengthLabel.textContent = tier.label;
    strengthLabel.className = "mt-1.5 text-xs " + textColor;
  }

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

  pw.addEventListener("input", paintStrength);
  bindToggle("toggle-password", pw);
  bindToggle("toggle-confirm", confirm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    const token = form.token.value.trim();
    const password = form.password.value;
    const confirmValue = form.confirm.value;
    if (!token) return showError("Reset token is required.");
    if (password.length < 8) return showError("Password must be at least 8 characters.");
    if (password !== confirmValue) return showError("Passwords do not match.");

    try {
      const res = await fetch("/auth/reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.ok) {
        window.location.href = "/auth/login";
        return;
      }
      const data = await res.json().catch(() => ({}));
      showError(data.error === "INVALID_TOKEN" ? "Token invalid or expired." : `Failed (${res.status})`);
    } catch (err) {
      showError(err.message);
    }
  });
})();
