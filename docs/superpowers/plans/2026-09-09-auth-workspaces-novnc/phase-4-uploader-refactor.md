# Phase 4 — Refactor Platform Uploaders for `connectionId`

**Goal:** Make TikTok/Instagram/YouTube uploaders read their profile dir from `connection-store`, dispatched by `?connectionId=` query param on all platform endpoints. Keep backward compatibility: when a workspace has exactly one connection for a platform, `connectionId` may be omitted.

**Files touched per uploader:**
- `src/tiktok-uploader.js` — replace `getActiveAccount` calls with `getConnection(connectionId)`.
- `src/instagram-uploader.js` — same.
- `src/youtube-uploader.js` — same.
- `src/dashboard-server.js` — extract connection resolver, thread `?connectionId=` through daemon controllers.
- Tests: `test/tiktok-uploader.test.js` extended, new `test/connection-resolver.test.js`.

---

### Task 4.1: `src/connection-resolver.js` — request → connection helper

**Files:**
- Create: `src/connection-resolver.js`
- Test: `test/connection-resolver.test.js`

- [ ] **Step 1:** Write failing test

Create `test/connection-resolver.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveConnection } = require("../src/connection-resolver");

function fakeStore(conns) {
  return {
    async listByWorkspace(wsId) { return conns.filter((c) => c.workspaceId === wsId); },
    async get(id) { return conns.find((c) => c.id === id) || null; },
  };
}
function fakeWorkspaceStore(activeId) {
  return { getActiveId: async () => activeId };
}

test("returns connection when connectionId supplied", async () => {
  const conns = [{ id: "conn_a", workspaceId: "ws_1", platform: "tiktok", profileDir: "p1" }];
  const conn = await resolveConnection({
    connectionStore: fakeStore(conns),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    connectionId: "conn_a",
    platform: "tiktok",
    session: {},
  });
  assert.equal(conn.id, "conn_a");
});

test("auto-selects when workspace has exactly one connection of that platform", async () => {
  const conns = [
    { id: "conn_a", workspaceId: "ws_1", platform: "tiktok", profileDir: "p1" },
    { id: "conn_b", workspaceId: "ws_1", platform: "instagram", profileDir: "p2" },
  ];
  const conn = await resolveConnection({
    connectionStore: fakeStore(conns),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    platform: "tiktok",
    session: {},
  });
  assert.equal(conn.id, "conn_a");
});

test("throws CONNECTION_ID_REQUIRED when multiple exist for platform", async () => {
  const conns = [
    { id: "conn_a", workspaceId: "ws_1", platform: "tiktok", profileDir: "p1" },
    { id: "conn_c", workspaceId: "ws_1", platform: "tiktok", profileDir: "p3" },
  ];
  await assert.rejects(() => resolveConnection({
    connectionStore: fakeStore(conns),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    platform: "tiktok",
    session: {},
  }), /CONNECTION_ID_REQUIRED/);
});

test("throws NO_CONNECTION when none for platform", async () => {
  await assert.rejects(() => resolveConnection({
    connectionStore: fakeStore([]),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    platform: "tiktok",
    session: {},
  }), /NO_CONNECTION/);
});

test("throws NOT_FOUND when connectionId doesn't exist", async () => {
  await assert.rejects(() => resolveConnection({
    connectionStore: fakeStore([]),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    connectionId: "conn_missing",
    platform: "tiktok",
    session: {},
  }), /NOT_FOUND/);
});
```

- [ ] **Step 2:** Run — expect FAIL

Run: `npm test -- test/connection-resolver.test.js`

- [ ] **Step 3:** Implement `src/connection-resolver.js`

Create:
```js
async function resolveConnection({ connectionStore, workspaceStore, connectionId, platform, session }) {
  if (connectionId) {
    const conn = await connectionStore.get(connectionId);
    if (!conn) throw new Error("NOT_FOUND");
    if (conn.platform !== platform) throw new Error("INVALID_PLATFORM");
    return conn;
  }
  const wsId = (session && session.activeWorkspaceId) || (await workspaceStore.getActiveId());
  if (!wsId) throw new Error("NO_ACTIVE_WORKSPACE");
  const matches = (await connectionStore.listByWorkspace(wsId)).filter((c) => c.platform === platform);
  if (matches.length === 0) throw new Error("NO_CONNECTION");
  if (matches.length > 1) throw new Error("CONNECTION_ID_REQUIRED");
  return matches[0];
}

module.exports = { resolveConnection };
```

- [ ] **Step 4:** Run

Run: `npm test -- test/connection-resolver.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/connection-resolver.js test/connection-resolver.test.js
git commit -m "feat(connection): resolveConnection helper for platform dispatch"
```

---

### Task 4.2: Refactor `tiktok-uploader.js` to take `profileDir` instead of `accountId`

**Files:**
- Modify: `src/tiktok-uploader.js`
- Modify: `test/tiktok-uploader.test.js` (extend, don't break)

- [ ] **Step 1:** Read the current `openPersistentContext(accountId)`, `getActiveAccount`, `startLoginSession`, `startDashboardLoginSession` from `src/tiktok-uploader.js`.

- [ ] **Step 2:** Add a new function `openPersistentContextForProfile(profileDir)`:

```js
async function openPersistentContextForProfile(profileDir) {
  const absolute = path.isAbsolute(profileDir) ? profileDir : path.join(process.cwd(), profileDir);
  await fs.mkdir(absolute, { recursive: true });
  return chromium.launchPersistentContext(absolute, {
    headless: config.headless,
    viewport: { width: 1400, height: 1000 },
    locale: config.browserLocale,
    timezoneId: config.timezone,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}
```

Keep the original `openPersistentContext(accountId)` for backward-compat but have it delegate:
```js
async function openPersistentContext(accountId) {
  const profileDir = await getPlatformProfileDir("tiktok", accountId);
  return openPersistentContextForProfile(profileDir);
}
```

- [ ] **Step 3:** Add `startLoginSessionForConnection(connection)` that reuses the session-tracking state but keys by `connection.id`:

```js
async function startLoginSessionForConnection(connection) {
  if (loginSessionContext && loginSessionAccountId !== connection.id) {
    const previous = loginSessionContext;
    loginSessionContext = null;
    loginSessionAccountId = null;
    await previous.close().catch(() => {});
  }
  if (loginSessionContext) return { ok: true, alreadyOpen: true };

  const context = await openPersistentContextForProfile(connection.profileDir);
  const page = context.pages()[0] || (await context.newPage());
  loginSessionContext = context;
  loginSessionAccountId = connection.id;
  context.on("close", () => {
    if (loginSessionContext === context) { loginSessionContext = null; loginSessionAccountId = null; }
  });
  await gotoUploadPage(page);
  return { ok: true, alreadyOpen: false, url: page.url() };
}
```

- [ ] **Step 4:** Add `postForConnection(connection, spec)` mirroring the existing `postOnce` but reading the profile dir from `connection.profileDir`. Extract shared logic so `postOnce(accountId, spec)` and `postForConnection(connection, spec)` share a `postWithContext(context, spec)` internal.

- [ ] **Step 5:** Export the new functions:

```js
module.exports = {
  ...module.exports,
  openPersistentContextForProfile,
  startLoginSessionForConnection,
  postForConnection,
};
```

- [ ] **Step 6:** Extend `test/tiktok-uploader.test.js` — add a unit test that mocks `chromium.launchPersistentContext` and verifies `startLoginSessionForConnection` uses `connection.profileDir`:

```js
test("startLoginSessionForConnection uses connection.profileDir", async () => {
  const original = chromium.launchPersistentContext;
  let calledWith = null;
  chromium.launchPersistentContext = async (dir) => {
    calledWith = dir;
    return { pages: () => [], newPage: async () => ({ goto: async () => {}, url: () => "https://example" }), on: () => {}, close: async () => {} };
  };
  try {
    const uploader = require("../src/tiktok-uploader");
    await uploader.startLoginSessionForConnection({ id: "conn_z", profileDir: ".profiles/ws/conn_z/tiktok" });
    assert.match(calledWith, /\.profiles\/ws\/conn_z\/tiktok$/);
  } finally {
    chromium.launchPersistentContext = original;
  }
});
```

- [ ] **Step 7:** Run

Run: `npm test -- test/tiktok-uploader.test.js`
Expected: existing tests still pass, new one passes.

- [ ] **Step 8:** Commit

```bash
git add src/tiktok-uploader.js test/tiktok-uploader.test.js
git commit -m "feat(tiktok): add connection-scoped login + post entry points"
```

---

### Task 4.3: Repeat for Instagram + YouTube uploaders

**Files:**
- Modify: `src/instagram-uploader.js`
- Modify: `src/youtube-uploader.js`

For each uploader:

- [ ] **Step 1:** Add `openPersistentContextForProfile(profileDir)`.
- [ ] **Step 2:** Add `startLoginSessionForConnection(connection)` and `postForConnection(connection, spec)`.
- [ ] **Step 3:** Delegate the existing account-based functions through the new profile-based ones.
- [ ] **Step 4:** Export new functions.
- [ ] **Step 5:** Commit each uploader independently:

```bash
git add src/instagram-uploader.js
git commit -m "feat(instagram): add connection-scoped login + post entry points"

git add src/youtube-uploader.js
git commit -m "feat(youtube): add connection-scoped login + post entry points"
```

*(No new tests required unless the existing uploader tests break — if they do, add coverage mirroring the TikTok test.)*

---

### Task 4.4: Update dashboard platform endpoints to use resolver

**Files:**
- Modify: `src/dashboard-server.js`

- [ ] **Step 1:** In the server bootstrap, wire the resolver:

```js
const { resolveConnection } = require("./connection-resolver");
```

- [ ] **Step 2:** Replace each `/api/{tiktok,instagram,youtube}/login` handler:

```js
app.post("/api/tiktok/login", async (req, res) => {
  try {
    const conn = await resolveConnection({
      connectionStore, workspaceStore,
      connectionId: req.query.connectionId,
      platform: "tiktok",
      session: req.session,
    });
    const uploader = require("./tiktok-uploader");
    const result = await uploader.startLoginSessionForConnection(conn);
    res.json({ ...result, connectionId: conn.id });
  } catch (err) {
    const map = { NOT_FOUND: 404, CONNECTION_ID_REQUIRED: 400, NO_CONNECTION: 400, NO_ACTIVE_WORKSPACE: 400 };
    res.status(map[err.message] || 500).json({ ok: false, error: err.message });
  }
});
```

Repeat for `/api/instagram/login` and `/api/youtube/login`.

- [ ] **Step 3:** For `/api/{platform}/instant-post` and `/api/{platform}/run-once`, thread `?connectionId=` through by resolving the connection first, then passing `conn.profileDir` (or the connection object) down to the daemon controller. This may require the daemon controllers to expose a `runOnceForConnection(conn)` variant — add if missing, mirroring the login refactor.

- [ ] **Step 4:** Manual smoke

Run: `PORT=3031 SESSION_SECRET=$(openssl rand -hex 32) npm start &` then `sleep 2`.
Run: `curl -s -X POST -H "cookie: <valid session cookie>" http://127.0.0.1:3031/api/tiktok/login`
Expected: `400 NO_CONNECTION` (empty workspace) — proves the resolver runs.
Kill: `kill %1`

- [ ] **Step 5:** Commit

```bash
git add src/dashboard-server.js
git commit -m "refactor(server): platform endpoints dispatch through connection resolver"
```

---

Phase 4 done. Proceed to `phase-5-dashboard-ui.md`.
