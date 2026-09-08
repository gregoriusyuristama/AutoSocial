# Phase 3 — Workspace + Connection Stores + Migration

**Goal:** Persist workspaces and connections in JSON stores, migrate legacy `.profiles/default/` layout, and expose CRUD endpoints.

---

### Task 3.1: `src/workspace-store.js`

**Files:**
- Create: `src/workspace-store.js`
- Test: `test/workspace-store.test.js`

- [ ] **Step 1:** Write failing test

Create `test/workspace-store.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createStore } = require("../src/workspace-store");

async function withTmp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-store-"));
  try { await fn(path.join(dir, "workspaces.json")); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("list is empty when file missing", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    assert.deepEqual(await store.list(), []);
    assert.equal(await store.getActiveId(), null);
  });
});

test("create returns id, list includes it, first create sets active", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    const ws = await store.create("Fitness Brand");
    assert.match(ws.id, /^ws_[a-f0-9]{12}$/);
    assert.equal(ws.label, "Fitness Brand");
    assert.equal((await store.list()).length, 1);
    assert.equal(await store.getActiveId(), ws.id);
  });
});

test("rename and delete", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    const ws = await store.create("Old");
    await store.rename(ws.id, "New");
    assert.equal((await store.list())[0].label, "New");
    await store.remove(ws.id);
    assert.equal((await store.list()).length, 0);
    assert.equal(await store.getActiveId(), null);
  });
});

test("setActive rejects unknown id", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await assert.rejects(() => store.setActive("ws_missing"), /NOT_FOUND/);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL

Run: `npm test -- test/workspace-store.test.js`

- [ ] **Step 3:** Implement `src/workspace-store.js`

Create:
```js
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function id() {
  return "ws_" + crypto.randomBytes(6).toString("hex");
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (err) { if (err.code === "ENOENT") return null; throw err; }
}

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

function createStore(filePath) {
  async function load() {
    return (await readJson(filePath)) || { activeWorkspaceId: null, workspaces: [] };
  }

  return {
    async list() { return (await load()).workspaces; },
    async getActiveId() { return (await load()).activeWorkspaceId; },
    async get(id) { return (await load()).workspaces.find((w) => w.id === id) || null; },

    async create(label) {
      const data = await load();
      const ws = { id: id(), label: String(label || "Untitled").slice(0, 80), createdAt: new Date().toISOString() };
      data.workspaces.push(ws);
      if (!data.activeWorkspaceId) data.activeWorkspaceId = ws.id;
      await writeAtomic(filePath, data);
      return ws;
    },

    async rename(id, label) {
      const data = await load();
      const ws = data.workspaces.find((w) => w.id === id);
      if (!ws) throw new Error("NOT_FOUND");
      ws.label = String(label).slice(0, 80);
      await writeAtomic(filePath, data);
      return ws;
    },

    async remove(id) {
      const data = await load();
      data.workspaces = data.workspaces.filter((w) => w.id !== id);
      if (data.activeWorkspaceId === id) {
        data.activeWorkspaceId = data.workspaces[0]?.id || null;
      }
      await writeAtomic(filePath, data);
    },

    async setActive(id) {
      const data = await load();
      if (!data.workspaces.find((w) => w.id === id)) throw new Error("NOT_FOUND");
      data.activeWorkspaceId = id;
      await writeAtomic(filePath, data);
    },
  };
}

module.exports = { createStore };
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/workspace-store.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/workspace-store.js test/workspace-store.test.js
git commit -m "feat(workspace): JSON store for workspaces (create/rename/remove/setActive)"
```

---

### Task 3.2: `src/connection-store.js`

**Files:**
- Create: `src/connection-store.js`
- Test: `test/connection-store.test.js`

- [ ] **Step 1:** Write failing test

Create `test/connection-store.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createStore } = require("../src/connection-store");

const PLATFORMS = ["tiktok", "instagram", "youtube"];

async function withTmp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "conn-store-"));
  try { await fn(path.join(dir, "connections.json"), dir); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("create emits id + profileDir keyed by workspace", async () => {
  await withTmp(async (file) => {
    const store = createStore(file, { profileRoot: ".profiles" });
    const conn = await store.create({ workspaceId: "ws_a", platform: "tiktok", label: "@fit" });
    assert.match(conn.id, /^conn_[a-f0-9]{12}$/);
    assert.equal(conn.platform, "tiktok");
    assert.equal(conn.profileDir, `.profiles/ws_a/${conn.id}`);
    assert.equal(conn.sessionSaved, false);
  });
});

test("listByWorkspace filters by workspaceId", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await store.create({ workspaceId: "ws_a", platform: "tiktok", label: "A" });
    await store.create({ workspaceId: "ws_b", platform: "tiktok", label: "B" });
    assert.equal((await store.listByWorkspace("ws_a")).length, 1);
    assert.equal((await store.listByWorkspace("ws_b")).length, 1);
  });
});

test("rename, markSessionSaved, remove", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    const c = await store.create({ workspaceId: "ws_a", platform: "tiktok", label: "A" });
    await store.rename(c.id, "AA");
    assert.equal((await store.get(c.id)).label, "AA");
    await store.markSessionSaved(c.id);
    const saved = await store.get(c.id);
    assert.equal(saved.sessionSaved, true);
    assert.ok(saved.lastVerifiedAt);
    await store.remove(c.id);
    assert.equal(await store.get(c.id), null);
  });
});

test("create rejects unsupported platform", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    await assert.rejects(() => store.create({ workspaceId: "ws_a", platform: "twitter", label: "x" }), /INVALID_PLATFORM/);
  });
});

test("workspaceHasConnections true/false", async () => {
  await withTmp(async (file) => {
    const store = createStore(file);
    assert.equal(await store.workspaceHasConnections("ws_a"), false);
    await store.create({ workspaceId: "ws_a", platform: "tiktok", label: "A" });
    assert.equal(await store.workspaceHasConnections("ws_a"), true);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL

Run: `npm test -- test/connection-store.test.js`

- [ ] **Step 3:** Implement `src/connection-store.js`

Create:
```js
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PLATFORMS = new Set(["tiktok", "instagram", "youtube"]);

function id() { return "conn_" + crypto.randomBytes(6).toString("hex"); }

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (err) { if (err.code === "ENOENT") return null; throw err; }
}

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

function createStore(filePath, opts = {}) {
  const profileRoot = opts.profileRoot || ".profiles";

  async function load() {
    return (await readJson(filePath)) || { connections: [] };
  }

  return {
    async listAll() { return (await load()).connections; },
    async listByWorkspace(workspaceId) {
      return (await load()).connections.filter((c) => c.workspaceId === workspaceId);
    },
    async get(id) { return (await load()).connections.find((c) => c.id === id) || null; },
    async workspaceHasConnections(workspaceId) {
      return (await load()).connections.some((c) => c.workspaceId === workspaceId);
    },

    async create({ workspaceId, platform, label }) {
      if (!PLATFORMS.has(platform)) throw new Error("INVALID_PLATFORM");
      if (!workspaceId) throw new Error("INVALID_INPUT");
      const data = await load();
      const conn = {
        id: id(),
        workspaceId,
        platform,
        label: String(label || `${platform} account`).slice(0, 80),
        profileDir: path.posix.join(profileRoot, workspaceId, ""),
        connectedAt: null,
        sessionSaved: false,
        lastVerifiedAt: null,
      };
      conn.profileDir = path.posix.join(profileRoot, workspaceId, conn.id);
      data.connections.push(conn);
      await writeAtomic(filePath, data);
      return conn;
    },

    async rename(id, label) {
      const data = await load();
      const conn = data.connections.find((c) => c.id === id);
      if (!conn) throw new Error("NOT_FOUND");
      conn.label = String(label).slice(0, 80);
      await writeAtomic(filePath, data);
      return conn;
    },

    async markSessionSaved(id) {
      const data = await load();
      const conn = data.connections.find((c) => c.id === id);
      if (!conn) throw new Error("NOT_FOUND");
      conn.sessionSaved = true;
      conn.connectedAt = conn.connectedAt || new Date().toISOString();
      conn.lastVerifiedAt = new Date().toISOString();
      await writeAtomic(filePath, data);
      return conn;
    },

    async remove(id) {
      const data = await load();
      data.connections = data.connections.filter((c) => c.id !== id);
      await writeAtomic(filePath, data);
    },
  };
}

module.exports = { createStore, PLATFORMS: Array.from(PLATFORMS) };
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/connection-store.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/connection-store.js test/connection-store.test.js
git commit -m "feat(connection): JSON store for platform connections"
```

---

### Task 3.3: Migration from `accounts-state.json` + `.profiles/default/`

**Files:**
- Create: `src/migrate-to-workspaces.js`
- Test: `test/migrate-to-workspaces.test.js`

- [ ] **Step 1:** Write failing test

Create `test/migrate-to-workspaces.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { runMigration } = require("../src/migrate-to-workspaces");

async function withProjectRoot(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "as-migrate-"));
  try { await fn(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function seedLegacy(root, platforms) {
  await fs.writeFile(path.join(root, "accounts-state.json"), JSON.stringify({
    activeAccountId: "default",
    accounts: [{ id: "default", label: "Default" }],
  }, null, 2));
  for (const p of platforms) {
    const dir = path.join(root, ".profiles", "default", p);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "Cookies"), "fake-cookie-blob");
  }
}

test("noop when no legacy state", async () => {
  await withProjectRoot(async (root) => {
    const result = await runMigration({ projectRoot: root });
    assert.equal(result.migrated, false);
  });
});

test("migrates legacy default profiles into ws_default", async () => {
  await withProjectRoot(async (root) => {
    await seedLegacy(root, ["tiktok", "instagram"]);
    const result = await runMigration({ projectRoot: root });
    assert.equal(result.migrated, true);
    assert.equal(result.workspaceId, "ws_default");
    assert.equal(result.connectionCount, 2);

    const workspaces = JSON.parse(await fs.readFile(path.join(root, "data", "workspaces.json"), "utf8"));
    assert.equal(workspaces.workspaces[0].id, "ws_default");
    assert.equal(workspaces.activeWorkspaceId, "ws_default");

    const conns = JSON.parse(await fs.readFile(path.join(root, "data", "connections.json"), "utf8"));
    assert.equal(conns.connections.length, 2);
    for (const c of conns.connections) {
      assert.match(c.profileDir, /\.profiles\/ws_default\/conn_[a-f0-9]{12}\/(tiktok|instagram)$/);
      const stat = await fs.stat(path.join(root, c.profileDir));
      assert.ok(stat.isDirectory());
    }

    // Backup exists
    const backupDir = path.join(root, "data", ".migration-backup");
    const backups = await fs.readdir(backupDir);
    assert.ok(backups.length >= 1);
  });
});

test("second run is a noop", async () => {
  await withProjectRoot(async (root) => {
    await seedLegacy(root, ["tiktok"]);
    await runMigration({ projectRoot: root });
    const r2 = await runMigration({ projectRoot: root });
    assert.equal(r2.migrated, false);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL

Run: `npm test -- test/migrate-to-workspaces.test.js`

- [ ] **Step 3:** Implement `src/migrate-to-workspaces.js`

Create:
```js
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PLATFORMS = ["tiktok", "instagram", "youtube"];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function runMigration({ projectRoot }) {
  const legacyState = path.join(projectRoot, "accounts-state.json");
  const legacyProfiles = path.join(projectRoot, ".profiles", "default");
  const dataDir = path.join(projectRoot, "data");
  const wsFile = path.join(dataDir, "workspaces.json");
  const connFile = path.join(dataDir, "connections.json");

  if (await exists(wsFile) || !(await exists(legacyState))) {
    return { migrated: false };
  }

  await fs.mkdir(dataDir, { recursive: true });

  // Backup
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(dataDir, ".migration-backup", stamp);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(legacyState, path.join(backupDir, "accounts-state.json")).catch(() => {});

  // Workspace
  const workspaceId = "ws_default";
  await fs.writeFile(wsFile, JSON.stringify({
    activeWorkspaceId: workspaceId,
    workspaces: [{ id: workspaceId, label: "My Brand", createdAt: new Date().toISOString() }],
  }, null, 2));

  // Connections
  const connections = [];
  for (const platform of PLATFORMS) {
    const src = path.join(legacyProfiles, platform);
    if (!(await exists(src))) continue;
    const connId = "conn_" + crypto.randomBytes(6).toString("hex");
    const destRel = path.posix.join(".profiles", workspaceId, connId, platform);
    const destAbs = path.join(projectRoot, destRel);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.rename(src, destAbs);
    connections.push({
      id: connId,
      workspaceId,
      platform,
      label: `${platform} (migrated)`,
      profileDir: path.posix.join(".profiles", workspaceId, connId, platform),
      connectedAt: new Date().toISOString(),
      sessionSaved: true,
      lastVerifiedAt: null,
    });
  }
  await fs.writeFile(connFile, JSON.stringify({ connections }, null, 2));

  return { migrated: true, workspaceId, connectionCount: connections.length };
}

module.exports = { runMigration };
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/migrate-to-workspaces.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/migrate-to-workspaces.js test/migrate-to-workspaces.test.js
git commit -m "feat(migration): migrate legacy .profiles/default to ws_default"
```

---

### Task 3.4: Wire stores + migration into server bootstrap

**Files:**
- Modify: `src/dashboard-server.js`

- [ ] **Step 1:** Add near top imports:

```js
const { createStore: createWorkspaceStore } = require("./workspace-store");
const { createStore: createConnectionStore } = require("./connection-store");
const { runMigration } = require("./migrate-to-workspaces");
```

- [ ] **Step 2:** In the async startup path (before `app.listen`), add:

```js
const migrationResult = await runMigration({ projectRoot: process.cwd() });
if (migrationResult.migrated) {
  console.log(`[migration] ${migrationResult.connectionCount} connections migrated into ${migrationResult.workspaceId}`);
}

const workspaceStore = createWorkspaceStore(path.join(process.cwd(), "data", "workspaces.json"));
const connectionStore = createConnectionStore(path.join(process.cwd(), "data", "connections.json"));

// Seed first workspace if none exist (fresh install after auth setup)
if ((await workspaceStore.list()).length === 0) {
  await workspaceStore.create("My Brand");
}
```

- [ ] **Step 3:** Also propagate active workspace to session on login. In `POST /auth/login` handler (in `buildAuthRouter`), take `workspaceStore` as an argument — refactor `buildAuthRouter(authStore)` → `buildAuthRouter(authStore, workspaceStore)` and set:

```js
req.session.userId = "admin";
req.session.activeWorkspaceId = await workspaceStore.getActiveId();
```

Update the mounting call in bootstrap to pass both stores.
Also update `test/auth-routes.test.js` — wrap workspace store with a no-op mock:
```js
const workspaceStore = { getActiveId: async () => null };
app.use(buildAuthRouter(store, workspaceStore));
```

- [ ] **Step 4:** Run all auth+store tests

Run: `npm test -- test/auth-routes.test.js test/workspace-store.test.js test/connection-store.test.js test/migrate-to-workspaces.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/dashboard-server.js test/auth-routes.test.js
git commit -m "feat(server): run migration + create default workspace on startup"
```

---

### Task 3.5: Workspace + connection HTTP endpoints

**Files:**
- Modify: `src/dashboard-server.js`
- Test: `test/workspace-connection-routes.test.js`

- [ ] **Step 1:** Write failing integration test

Create `test/workspace-connection-routes.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildWorkspaceRouter, buildConnectionRouter } = require("../src/dashboard-server");

async function withApp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-routes-"));
  const express = require("express");
  const app = express();
  app.use(express.json());
  const workspaceStore = require("../src/workspace-store").createStore(path.join(dir, "workspaces.json"));
  const connectionStore = require("../src/connection-store").createStore(path.join(dir, "connections.json"));
  // Fake session middleware
  const session = { userId: "admin", activeWorkspaceId: null };
  app.use((req, _res, next) => { req.session = session; next(); });
  app.use(buildWorkspaceRouter(workspaceStore));
  app.use(buildConnectionRouter(connectionStore, workspaceStore));
  const server = app.listen(0);
  try { await fn(server.address().port, { workspaceStore, connectionStore, session }); }
  finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json" } }, (res) => {
      let data = ""; res.on("data", (c) => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

test("workspace CRUD lifecycle", async () => {
  await withApp(async (port) => {
    const create = await req(port, "POST", "/api/workspaces", { label: "Fitness" });
    assert.equal(create.status, 200);
    const wsId = create.body.workspace.id;
    const list = await req(port, "GET", "/api/workspaces");
    assert.equal(list.body.workspaces.length, 1);
    const rename = await req(port, "PATCH", `/api/workspaces/${wsId}`, { label: "Fitness Brand" });
    assert.equal(rename.body.workspace.label, "Fitness Brand");
    const del = await req(port, "DELETE", `/api/workspaces/${wsId}`);
    assert.equal(del.status, 200);
  });
});

test("cannot delete workspace with connections", async () => {
  await withApp(async (port, { session }) => {
    const c = await req(port, "POST", "/api/workspaces", { label: "W" });
    const wsId = c.body.workspace.id;
    session.activeWorkspaceId = wsId;
    await req(port, "POST", "/api/connections", { platform: "tiktok", label: "A" });
    const del = await req(port, "DELETE", `/api/workspaces/${wsId}`);
    assert.equal(del.status, 409);
    assert.equal(del.body.error, "WORKSPACE_NOT_EMPTY");
  });
});

test("connection create/list/rename/delete scoped to active workspace", async () => {
  await withApp(async (port, { session }) => {
    const c = await req(port, "POST", "/api/workspaces", { label: "W" });
    session.activeWorkspaceId = c.body.workspace.id;
    const created = await req(port, "POST", "/api/connections", { platform: "tiktok", label: "A" });
    assert.equal(created.status, 200);
    const list = await req(port, "GET", "/api/connections");
    assert.equal(list.body.connections.length, 1);
    const connId = created.body.connection.id;
    const renamed = await req(port, "PATCH", `/api/connections/${connId}`, { label: "AA" });
    assert.equal(renamed.body.connection.label, "AA");
    const del = await req(port, "DELETE", `/api/connections/${connId}`);
    assert.equal(del.status, 200);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL

Run: `npm test -- test/workspace-connection-routes.test.js`

- [ ] **Step 3:** Implement routers in `src/dashboard-server.js`

Add:
```js
function buildWorkspaceRouter(workspaceStore) {
  const router = express.Router();

  router.get("/api/workspaces", async (req, res) => {
    res.json({ ok: true, workspaces: await workspaceStore.list(), activeWorkspaceId: req.session.activeWorkspaceId || await workspaceStore.getActiveId() });
  });

  router.post("/api/workspaces", async (req, res) => {
    try {
      const ws = await workspaceStore.create(req.body.label);
      req.session.activeWorkspaceId = req.session.activeWorkspaceId || ws.id;
      res.json({ ok: true, workspace: ws });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.patch("/api/workspaces/:id", async (req, res) => {
    try { res.json({ ok: true, workspace: await workspaceStore.rename(req.params.id, req.body.label) }); }
    catch (err) { res.status(err.message === "NOT_FOUND" ? 404 : 400).json({ ok: false, error: err.message }); }
  });

  router.delete("/api/workspaces/:id", async (req, res) => {
    // 409 if has connections — checked by injected callback
    const has = req.app.locals.connectionStoreForCheck
      ? await req.app.locals.connectionStoreForCheck.workspaceHasConnections(req.params.id)
      : false;
    if (has) return res.status(409).json({ ok: false, error: "WORKSPACE_NOT_EMPTY" });
    await workspaceStore.remove(req.params.id);
    if (req.session.activeWorkspaceId === req.params.id) req.session.activeWorkspaceId = null;
    res.json({ ok: true });
  });

  router.post("/api/workspaces/:id/activate", async (req, res) => {
    try {
      await workspaceStore.setActive(req.params.id);
      req.session.activeWorkspaceId = req.params.id;
      res.json({ ok: true });
    } catch (err) { res.status(404).json({ ok: false, error: err.message }); }
  });

  return router;
}

function buildConnectionRouter(connectionStore, workspaceStore) {
  const router = express.Router();

  async function activeWorkspaceId(req) {
    return req.session.activeWorkspaceId || await workspaceStore.getActiveId();
  }

  router.get("/api/connections", async (req, res) => {
    const wsId = await activeWorkspaceId(req);
    if (!wsId) return res.json({ ok: true, connections: [] });
    res.json({ ok: true, connections: await connectionStore.listByWorkspace(wsId) });
  });

  router.post("/api/connections", async (req, res) => {
    try {
      const wsId = await activeWorkspaceId(req);
      if (!wsId) return res.status(400).json({ ok: false, error: "NO_ACTIVE_WORKSPACE" });
      const conn = await connectionStore.create({
        workspaceId: wsId,
        platform: req.body.platform,
        label: req.body.label,
      });
      res.json({ ok: true, connection: conn });
    } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  });

  router.patch("/api/connections/:id", async (req, res) => {
    try { res.json({ ok: true, connection: await connectionStore.rename(req.params.id, req.body.label) }); }
    catch (err) { res.status(err.message === "NOT_FOUND" ? 404 : 400).json({ ok: false, error: err.message }); }
  });

  router.delete("/api/connections/:id", async (req, res) => {
    await connectionStore.remove(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports.buildWorkspaceRouter = buildWorkspaceRouter;
module.exports.buildConnectionRouter = buildConnectionRouter;
```

Also in the server bootstrap, after stores are created, expose the connection store for the workspace delete check:

```js
app.locals.connectionStoreForCheck = connectionStore;
app.use(buildWorkspaceRouter(workspaceStore));
app.use(buildConnectionRouter(connectionStore, workspaceStore));
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/workspace-connection-routes.test.js`
Expected: all pass.

- [ ] **Step 5:** Commit

```bash
git add src/dashboard-server.js test/workspace-connection-routes.test.js
git commit -m "feat(server): expose workspace and connection CRUD endpoints"
```

---

Phase 3 done. Proceed to `phase-4-uploader-refactor.md`.
