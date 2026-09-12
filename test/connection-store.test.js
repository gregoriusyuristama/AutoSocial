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
    assert.equal(conn.profileDir, `.profiles/ws_a/${conn.id}/tiktok`);
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
