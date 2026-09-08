# Phase 2 — Auth HTML/JS Forms

**Goal:** Build 4 auth screens per `CLAUDE.md` file layout, using Tailwind CDN and vanilla JS.

**Shared layout:** centered card, brand header, form middle, secondary action footer. Apple-design motion: `transition-all duration-300`, `rounded-2xl`, `shadow-xl`, `backdrop-blur-md`.

Each form's `<script>` is external `<file>.js` per `CLAUDE.md` §4.

---

### Task 2.1: `src/auth/setup.html` + `setup.js`

**Files:**
- Create: `src/auth/setup.html`
- Create: `src/auth/setup.js`

- [ ] **Step 1:** Write `src/auth/setup.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AutoSocial — Set up admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center p-4">
  <main class="w-full max-w-md">
    <div class="rounded-2xl bg-white/5 backdrop-blur-md shadow-xl p-8 border border-white/10 transition-all duration-300">
      <header class="mb-6 text-center">
        <h1 class="text-2xl font-semibold">AutoSocial Studio</h1>
        <p class="text-sm text-slate-400 mt-1">Create your admin account</p>
      </header>

      <form id="setup-form" class="space-y-4">
        <div>
          <label class="block text-sm mb-1" for="username">Username</label>
          <input id="username" name="username" type="text" required autocomplete="username"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div>
          <label class="block text-sm mb-1" for="password">Password (min 8 chars)</label>
          <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
          <div id="strength" class="text-xs mt-1 text-slate-400"></div>
        </div>
        <div>
          <label class="block text-sm mb-1" for="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required minlength="8" autocomplete="new-password"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div id="error" class="hidden text-sm text-rose-400"></div>
        <button type="submit"
                class="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-2 transition-all duration-300 shadow-lg">
          Create admin
        </button>
      </form>
    </div>
  </main>
  <script src="/auth/setup.js"></script>
</body>
</html>
```

- [ ] **Step 2:** Write `src/auth/setup.js`:

```js
(function () {
  const form = document.getElementById("setup-form");
  const errorBox = document.getElementById("error");
  const strength = document.getElementById("strength");
  const pw = document.getElementById("password");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  pw.addEventListener("input", () => {
    const v = pw.value;
    if (v.length < 8) strength.textContent = "Too short";
    else if (/^[a-z]+$/i.test(v) || /^\d+$/.test(v)) strength.textContent = "Weak — mix letters and numbers";
    else strength.textContent = "Looks good";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    const username = form.username.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;
    if (password !== confirm) return showError("Passwords do not match.");
    if (password.length < 8) return showError("Password must be at least 8 characters.");

    try {
      const res = await fetch("/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
        redirect: "manual",
      });
      if (res.type === "opaqueredirect" || res.status === 302 || res.status === 0) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      showError(data.error || `Setup failed (${res.status})`);
    } catch (err) {
      showError(err.message);
    }
  });
})();
```

- [ ] **Step 3:** Manual smoke

Run: `rm -f data/auth.json && PORT=3031 SESSION_SECRET=$(openssl rand -hex 32) npm start &`
Wait 2s.
Run: `curl -s http://127.0.0.1:3031/auth/setup | head -3`
Expected: HTML starting `<!doctype html>`.
Kill: `kill %1`

- [ ] **Step 4:** Commit

```bash
git add src/auth/setup.html src/auth/setup.js
git commit -m "feat(auth): first-run setup form"
```

---

### Task 2.2: `src/auth/login.html` + `login.js`

**Files:**
- Create: `src/auth/login.html`
- Create: `src/auth/login.js`

- [ ] **Step 1:** Write `src/auth/login.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AutoSocial — Sign in</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center p-4">
  <main class="w-full max-w-md">
    <div class="rounded-2xl bg-white/5 backdrop-blur-md shadow-xl p-8 border border-white/10 transition-all duration-300">
      <header class="mb-6 text-center">
        <h1 class="text-2xl font-semibold">AutoSocial Studio</h1>
        <p class="text-sm text-slate-400 mt-1">Sign in to continue</p>
      </header>

      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-sm mb-1" for="username">Username</label>
          <input id="username" name="username" type="text" required autocomplete="username"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div>
          <label class="block text-sm mb-1" for="password">Password</label>
          <input id="password" name="password" type="password" required autocomplete="current-password"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div id="error" class="hidden text-sm text-rose-400"></div>
        <button type="submit"
                class="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-2 transition-all duration-300 shadow-lg">
          Sign in
        </button>
      </form>

      <footer class="mt-4 text-center">
        <a href="/auth/reset" class="text-sm text-slate-400 hover:text-indigo-300 transition-colors">Forgot password?</a>
      </footer>
    </div>
  </main>
  <script src="/auth/login.js"></script>
</body>
</html>
```

- [ ] **Step 2:** Write `src/auth/login.js`:

```js
(function () {
  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("error");
  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get("return") || "/";

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: form.username.value.trim(),
          password: form.password.value,
          return: returnTo,
        }),
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
      showError(`Login failed (${res.status})`);
    } catch (err) {
      showError(err.message);
    }
  });
})();
```

- [ ] **Step 3:** Commit

```bash
git add src/auth/login.html src/auth/login.js
git commit -m "feat(auth): login form"
```

---

### Task 2.3: Reset-request + reset-confirm forms

**Files:**
- Create: `src/auth/reset-request.html`
- Create: `src/auth/reset-request.js`
- Create: `src/auth/reset-confirm.html`
- Create: `src/auth/reset-confirm.js`

- [ ] **Step 1:** Write `src/auth/reset-request.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AutoSocial — Reset password</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center p-4">
  <main class="w-full max-w-md">
    <div class="rounded-2xl bg-white/5 backdrop-blur-md shadow-xl p-8 border border-white/10 transition-all duration-300">
      <header class="mb-6 text-center">
        <h1 class="text-2xl font-semibold">Reset password</h1>
        <p class="text-sm text-slate-400 mt-1">A reset token will be printed to your server terminal.</p>
      </header>

      <form id="reset-form" class="space-y-4">
        <div>
          <label class="block text-sm mb-1" for="username">Username</label>
          <input id="username" name="username" type="text" required autocomplete="username"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div id="notice" class="hidden text-sm text-emerald-300"></div>
        <button type="submit"
                class="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-2 transition-all duration-300 shadow-lg">
          Send reset token
        </button>
      </form>

      <footer class="mt-4 text-center">
        <a href="/auth/login" class="text-sm text-slate-400 hover:text-indigo-300 transition-colors">Back to sign in</a>
        <span class="mx-2 text-slate-600">·</span>
        <a href="/auth/reset/confirm" class="text-sm text-slate-400 hover:text-indigo-300 transition-colors">I have a token</a>
      </footer>
    </div>
  </main>
  <script src="/auth/reset-request.js"></script>
</body>
</html>
```

- [ ] **Step 2:** Write `src/auth/reset-request.js`:

```js
(function () {
  const form = document.getElementById("reset-form");
  const notice = document.getElementById("notice");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    notice.classList.add("hidden");
    try {
      await fetch("/auth/reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: form.username.value.trim() }),
      });
      notice.textContent = "If the username exists, a token was printed to the server terminal.";
      notice.classList.remove("hidden");
    } catch (err) {
      notice.textContent = err.message;
      notice.classList.remove("hidden");
    }
  });
})();
```

- [ ] **Step 3:** Write `src/auth/reset-confirm.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AutoSocial — Confirm reset</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center p-4">
  <main class="w-full max-w-md">
    <div class="rounded-2xl bg-white/5 backdrop-blur-md shadow-xl p-8 border border-white/10 transition-all duration-300">
      <header class="mb-6 text-center">
        <h1 class="text-2xl font-semibold">Set a new password</h1>
      </header>

      <form id="confirm-form" class="space-y-4">
        <div>
          <label class="block text-sm mb-1" for="token">Token</label>
          <input id="token" name="token" type="text" required
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300 font-mono text-sm" />
        </div>
        <div>
          <label class="block text-sm mb-1" for="password">New password (min 8 chars)</label>
          <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div>
          <label class="block text-sm mb-1" for="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required minlength="8" autocomplete="new-password"
                 class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
        </div>
        <div id="error" class="hidden text-sm text-rose-400"></div>
        <button type="submit"
                class="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-2 transition-all duration-300 shadow-lg">
          Update password
        </button>
      </form>
    </div>
  </main>
  <script src="/auth/reset-confirm.js"></script>
</body>
</html>
```

- [ ] **Step 4:** Write `src/auth/reset-confirm.js`:

```js
(function () {
  const form = document.getElementById("confirm-form");
  const errorBox = document.getElementById("error");
  const params = new URLSearchParams(window.location.search);
  if (params.get("token")) form.token.value = params.get("token");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    if (form.password.value !== form.confirm.value) return showError("Passwords do not match.");
    try {
      const res = await fetch("/auth/reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: form.token.value.trim(),
          newPassword: form.password.value,
        }),
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
```

- [ ] **Step 5:** Ensure static-serve covers `src/auth/*.js` under `/auth/`

In `src/dashboard-server.js` — after `buildAuthRouter`, add:
```js
app.use("/auth", express.static(require("node:path").join(__dirname, "auth"), { extensions: ["html"] }));
```
(Place BEFORE `requireAuth` so unauth users can fetch these assets.)

- [ ] **Step 6:** Manual smoke

Run: `PORT=3031 SESSION_SECRET=$(openssl rand -hex 32) npm start &` then `sleep 2`.
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3031/auth/login`
Expected: `200` (either login or setup form based on state).
Kill: `kill %1`

- [ ] **Step 7:** Commit

```bash
git add src/auth/reset-request.html src/auth/reset-request.js \
        src/auth/reset-confirm.html src/auth/reset-confirm.js \
        src/dashboard-server.js
git commit -m "feat(auth): reset request/confirm forms + static mount"
```

---

Phase 2 done. Proceed to `phase-3-workspaces-migration.md`.
