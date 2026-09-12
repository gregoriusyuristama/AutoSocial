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
