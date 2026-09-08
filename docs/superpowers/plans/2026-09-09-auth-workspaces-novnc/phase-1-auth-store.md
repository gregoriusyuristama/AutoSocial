# Phase 1 — Auth Store + Middleware

**Goal:** Persist a single-admin credential in `data/auth.json` and gate all non-auth Express routes.

---

### Task 1.1: `src/auth-store.js` — CRUD for admin credential

**Files:**
- Create: `src/auth-store.js`
- Test: `test/auth-store.test.js`

- [ ] **Step 1:** Write failing test

Create `test/auth-store.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  createStore,
} = require("../src/auth-store");

async function withTmp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autosocial-auth-"));
  try { await fn(path.join(dir, "auth.json")); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("hasAdmin false when file missing", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    assert.equal(await store.hasAdmin(), false);
  });
});

test("createAdmin writes hashed credential and hasAdmin true", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await store.createAdmin("gregorius", "secret123");
    assert.equal(await store.hasAdmin(), true);
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(raw.admin.username, "gregorius");
    assert.match(raw.admin.passwordHash, /^\$2[aby]\$12\$/);
    assert.ok(raw.admin.createdAt);
  });
});

test("verifyCredentials returns true on match", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await store.createAdmin("gregorius", "secret123");
    assert.equal(await store.verifyCredentials("gregorius", "secret123"), true);
    assert.equal(await store.verifyCredentials("gregorius", "wrong"), false);
    assert.equal(await store.verifyCredentials("other", "secret123"), false);
  });
});

test("createAdmin refuses when admin exists", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await store.createAdmin("a", "b1234567");
    await assert.rejects(() => store.createAdmin("c", "d1234567"), /ADMIN_EXISTS/);
  });
});

test("issueResetToken sets token + expiry, consumeResetToken validates and resets password", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await store.createAdmin("gregorius", "old12345");
    const token = await store.issueResetToken("gregorius");
    assert.match(token, /^[a-f0-9]{64}$/);
    await store.consumeResetToken(token, "new12345");
    assert.equal(await store.verifyCredentials("gregorius", "new12345"), true);
    assert.equal(await store.verifyCredentials("gregorius", "old12345"), false);
    await assert.rejects(() => store.consumeResetToken(token, "again"), /INVALID_TOKEN/);
  });
});

test("issueResetToken rejects unknown username", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await store.createAdmin("gregorius", "old12345");
    await assert.rejects(() => store.issueResetToken("nope"), /INVALID_CREDENTIALS/);
  });
});
```

- [ ] **Step 2:** Run test to verify it fails

Run: `npm test -- test/auth-store.test.js`
Expected: FAIL — `Cannot find module '../src/auth-store'`.

- [ ] **Step 3:** Implement `src/auth-store.js`

Create:
```js
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const RESET_TTL_MS = 30 * 60 * 1000;

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeJsonAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

function createStore(filePath) {
  async function load() {
    const data = (await readJson(filePath)) || {};
    return data;
  }

  return {
    async hasAdmin() {
      const data = await load();
      return Boolean(data && data.admin && data.admin.username);
    },

    async createAdmin(username, password) {
      const data = await load();
      if (data.admin && data.admin.username) {
        throw new Error("ADMIN_EXISTS");
      }
      if (!username || !password || password.length < 8) {
        throw new Error("INVALID_INPUT");
      }
      data.admin = {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        createdAt: new Date().toISOString(),
        resetToken: null,
        resetTokenExpiresAt: null,
      };
      await writeJsonAtomic(filePath, data);
    },

    async verifyCredentials(username, password) {
      const data = await load();
      if (!data.admin || data.admin.username !== username) return false;
      try {
        return await bcrypt.compare(password, data.admin.passwordHash);
      } catch { return false; }
    },

    async issueResetToken(username) {
      const data = await load();
      if (!data.admin || data.admin.username !== username) {
        throw new Error("INVALID_CREDENTIALS");
      }
      const token = crypto.randomBytes(32).toString("hex");
      data.admin.resetToken = token;
      data.admin.resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      await writeJsonAtomic(filePath, data);
      return token;
    },

    async consumeResetToken(token, newPassword) {
      const data = await load();
      if (!data.admin || !data.admin.resetToken || data.admin.resetToken !== token) {
        throw new Error("INVALID_TOKEN");
      }
      if (new Date(data.admin.resetTokenExpiresAt).getTime() < Date.now()) {
        throw new Error("INVALID_TOKEN");
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error("INVALID_INPUT");
      }
      data.admin.passwordHash = await bcrypt.hash(newPassword, 12);
      data.admin.resetToken = null;
      data.admin.resetTokenExpiresAt = null;
      await writeJsonAtomic(filePath, data);
    },
  };
}

module.exports = { createStore };
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/auth-store.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/auth-store.js test/auth-store.test.js
git commit -m "feat(auth): add auth-store with bcrypt admin + reset token"
```

---

### Task 1.2: `src/auth-middleware.js` — cookie-session guard

**Files:**
- Create: `src/auth-middleware.js`
- Test: `test/auth-middleware.test.js`

- [ ] **Step 1:** Write failing test

Create `test/auth-middleware.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAuth, isAuthPath, isPublicAsset } = require("../src/auth-middleware");

function mockReq({ path, method = "GET", session = null }) {
  return {
    path,
    method,
    session,
    accepts: (t) => t === "html",
    originalUrl: path,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    redirected: null,
  };
  res.status = (n) => (res.statusCode = n, res);
  res.json = (o) => (res.body = o, res);
  res.redirect = (loc) => (res.redirected = loc, res);
  return res;
}

test("isAuthPath detects /auth prefixes", () => {
  assert.equal(isAuthPath("/auth/login"), true);
  assert.equal(isAuthPath("/auth/setup"), true);
  assert.equal(isAuthPath("/api/status"), false);
});

test("isPublicAsset covers static assets", () => {
  assert.equal(isPublicAsset("/style.css"), true);
  assert.equal(isPublicAsset("/app.js"), true);
  assert.equal(isPublicAsset("/auth/login.js"), true);
  assert.equal(isPublicAsset("/api/accounts"), false);
});

test("requireAuth allows auth paths without session", (t, done) => {
  const req = mockReq({ path: "/auth/login" });
  const res = mockRes();
  requireAuth(req, res, () => { done(); });
});

test("requireAuth returns 401 JSON for unauth /api", () => {
  const req = mockReq({ path: "/api/status" });
  const res = mockRes();
  requireAuth(req, res, () => { throw new Error("next called"); });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "AUTH_REQUIRED");
});

test("requireAuth redirects unauth page loads to /auth/login with return", () => {
  const req = mockReq({ path: "/settings" });
  const res = mockRes();
  requireAuth(req, res, () => { throw new Error("next called"); });
  assert.equal(res.redirected, "/auth/login?return=%2Fsettings");
});

test("requireAuth allows authed request", (t, done) => {
  const req = mockReq({ path: "/api/status", session: { userId: "admin" } });
  const res = mockRes();
  requireAuth(req, res, () => { done(); });
});
```

- [ ] **Step 2:** Run test to verify it fails

Run: `npm test -- test/auth-middleware.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3:** Implement `src/auth-middleware.js`

Create:
```js
const AUTH_PREFIX = "/auth/";
const PUBLIC_STATIC = new Set([
  "/style.css",
  "/app.js",
  "/favicon.ico",
]);
const PUBLIC_STATIC_PREFIXES = ["/auth/"];

function isAuthPath(p) {
  return p === "/auth" || p.startsWith(AUTH_PREFIX);
}

function isPublicAsset(p) {
  if (PUBLIC_STATIC.has(p)) return true;
  return PUBLIC_STATIC_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function requireAuth(req, res, next) {
  if (isAuthPath(req.path) || isPublicAsset(req.path)) {
    return next();
  }
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  }
  const back = encodeURIComponent(req.originalUrl || req.path);
  return res.redirect(`/auth/login?return=${back}`);
}

module.exports = { requireAuth, isAuthPath, isPublicAsset };
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/auth-middleware.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/auth-middleware.js test/auth-middleware.test.js
git commit -m "feat(auth): add cookie-session-aware requireAuth middleware"
```

---

### Task 1.3: Auth route handlers in dashboard-server

**Files:**
- Modify: `src/dashboard-server.js`
- Test: `test/auth-routes.test.js`

- [ ] **Step 1:** Write failing test (supertest-like, using node http)

Create `test/auth-routes.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildAuthRouter } = require("../src/dashboard-server");

async function withServer(store, fn) {
  const express = require("express");
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  const cookieSession = require("cookie-session");
  app.use(cookieSession({ name: "s", keys: ["testkey"], maxAge: 3600e3 }));
  app.use(buildAuthRouter(store));
  const server = app.listen(0);
  try { await fn(server.address().port); }
  finally { server.close(); }
}

function request(port, method, path, body, cookies) {
  return new Promise((resolve, reject) => {
    const headers = { "content-type": "application/json" };
    if (cookies) headers.cookie = cookies;
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("POST /auth/setup creates admin then rejects second call", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auth-routes-"));
  const store = require("../src/auth-store").createStore(path.join(tmp, "auth.json"));
  await withServer(store, async (port) => {
    const r1 = await request(port, "POST", "/auth/setup", { username: "g", password: "secret12" });
    assert.equal(r1.status, 302);
    const r2 = await request(port, "POST", "/auth/setup", { username: "g", password: "secret12" });
    assert.equal(r2.status, 409);
  });
  await fs.rm(tmp, { recursive: true, force: true });
});

test("POST /auth/login sets session cookie on valid credentials", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auth-routes-"));
  const store = require("../src/auth-store").createStore(path.join(tmp, "auth.json"));
  await store.createAdmin("g", "secret12");
  await withServer(store, async (port) => {
    const bad = await request(port, "POST", "/auth/login", { username: "g", password: "wrong" });
    assert.equal(bad.status, 401);
    const good = await request(port, "POST", "/auth/login", { username: "g", password: "secret12" });
    assert.equal(good.status, 302);
    assert.match(good.headers["set-cookie"].join(","), /s=/);
  });
  await fs.rm(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 2:** Run — expect FAIL (buildAuthRouter export missing)

Run: `npm test -- test/auth-routes.test.js`

- [ ] **Step 3:** Implement `buildAuthRouter` in `src/dashboard-server.js`

Read the current `dashboard-server.js` first. Add near the top after existing requires:
```js
const express = require("express");
```

Add exported function (place before `module.exports = ...`):
```js
function buildAuthRouter(authStore) {
  const router = express.Router();

  router.get("/auth/setup", async (req, res) => {
    if (await authStore.hasAdmin()) return res.redirect("/auth/login");
    return res.sendFile(require("node:path").join(__dirname, "auth", "setup.html"));
  });

  router.post("/auth/setup", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      await authStore.createAdmin(username, password);
      req.session.userId = "admin";
      return res.redirect("/");
    } catch (err) {
      const map = { ADMIN_EXISTS: 409, INVALID_INPUT: 400 };
      return res.status(map[err.message] || 500).json({ ok: false, error: err.message });
    }
  });

  router.get("/auth/login", async (req, res) => {
    if (!(await authStore.hasAdmin())) return res.redirect("/auth/setup");
    return res.sendFile(require("node:path").join(__dirname, "auth", "login.html"));
  });

  router.post("/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    const ok = await authStore.verifyCredentials(username, password);
    if (!ok) return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    req.session.userId = "admin";
    const back = typeof req.body.return === "string" ? req.body.return : "/";
    return res.redirect(back);
  });

  router.post("/auth/logout", (req, res) => {
    req.session = null;
    return res.redirect("/auth/login");
  });

  router.get("/auth/reset", (_req, res) =>
    res.sendFile(require("node:path").join(__dirname, "auth", "reset-request.html"))
  );

  router.post("/auth/reset/request", async (req, res) => {
    const { username } = req.body || {};
    try {
      const token = await authStore.issueResetToken(username);
      console.log(`\n[auth] Password reset token for ${username}: ${token}\n`);
    } catch { /* never leak */ }
    return res.status(200).json({ ok: true });
  });

  router.get("/auth/reset/confirm", (_req, res) =>
    res.sendFile(require("node:path").join(__dirname, "auth", "reset-confirm.html"))
  );

  router.post("/auth/reset/confirm", async (req, res) => {
    try {
      const { token, newPassword } = req.body || {};
      await authStore.consumeResetToken(token, newPassword);
      return res.status(200).json({ ok: true });
    } catch (err) {
      const map = { INVALID_TOKEN: 400, INVALID_INPUT: 400 };
      return res.status(map[err.message] || 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports.buildAuthRouter = buildAuthRouter;
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/auth-routes.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/dashboard-server.js test/auth-routes.test.js
git commit -m "feat(auth): add /auth/setup, /auth/login, /auth/reset routes"
```

---

### Task 1.4: Wire auth middleware + cookie-session into main server

**Files:**
- Modify: `src/dashboard-server.js` (server bootstrap section)

- [ ] **Step 1:** Read current bootstrap block (around `const app = express()` and middleware chain).

- [ ] **Step 2:** Insert BEFORE existing `request-guard` middleware and route registrations:

```js
const cookieSession = require("cookie-session");
const { createStore: createAuthStore } = require("./auth-store");
const { requireAuth } = require("./auth-middleware");

const authStore = createAuthStore(require("node:path").join(process.cwd(), "data", "auth.json"));

if (!config.sessionSecret) {
  // Auto-generate one and print WARNING; do NOT persist here — user must add to .env
  const generated = require("node:crypto").randomBytes(32).toString("hex");
  console.warn(`[auth] SESSION_SECRET missing; using ephemeral secret (sessions reset on restart). Add SESSION_SECRET=${generated} to .env`);
  config.sessionSecret = generated;
}

app.use(cookieSession({
  name: "autosocial_session",
  keys: [config.sessionSecret],
  maxAge: 7 * 24 * 3600e3,
  httpOnly: true,
  sameSite: "lax",
}));

app.use(buildAuthRouter(authStore));
app.use(requireAuth);
```

Ensure the ordering: `express.json()` and `express.urlencoded()` middleware run BEFORE `buildAuthRouter` (so form posts parse). The existing `createDashboardRequestGuard()` middleware runs AFTER `requireAuth`.

- [ ] **Step 3:** Manual boot test

Run: `PORT=3031 SESSION_SECRET=$(openssl rand -hex 32) npm start &`
Wait: `sleep 2`
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3031/`
Expected: `302` (redirect to /auth/setup or /auth/login).
Kill: `kill %1`

- [ ] **Step 4:** Commit

```bash
git add src/dashboard-server.js
git commit -m "feat(server): mount cookie-session, auth router, requireAuth guard"
```

---

Phase 1 done. Proceed to `phase-2-auth-forms.md`.
