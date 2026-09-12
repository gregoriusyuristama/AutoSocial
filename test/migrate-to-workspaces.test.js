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
