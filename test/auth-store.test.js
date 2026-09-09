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
