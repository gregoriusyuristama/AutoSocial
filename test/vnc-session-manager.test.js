const test = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function has(bin) { try { execSync(`command -v ${bin}`, { stdio: "pipe" }); return true; } catch { return false; } }
const missing = ["Xvfb", "x11vnc", "fluxbox", "websockify"].filter((b) => !has(b));

const activeManagers = new Set();
process.on("beforeExit", async () => {
  for (const m of activeManagers) {
    try { await m.shutdownAll(); } catch {}
  }
});

test("spawn + tearDown cycle", { skip: missing.length ? `missing: ${missing.join(",")}` : false }, async () => {
  const { createManager } = require("../src/vnc-session-manager");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vnc-mgr-"));
  const manager = createManager({
    vncPortRangeStart: 5951,
    vncPortRangeEnd: 5960,
    novncPortRangeStart: 6180,
    novncPortRangeEnd: 6189,
    ttlSeconds: 10,
    maxConcurrent: 2,
    launchBrowser: false,
  });
  activeManagers.add(manager);
  try {
    const session = await manager.spawn({ connectionId: "conn_test", profileDir: tmp, platform: "tiktok" });
    assert.match(session.vncUrl, /ws:\/\/[^:]+:\d+\/websockify$/);
    assert.ok(session.sessionId);
    await new Promise((r) => setTimeout(r, 500));
    await manager.tearDown("conn_test");
  } finally {
    await manager.shutdownAll();
    activeManagers.delete(manager);
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("max concurrent enforced", { skip: missing.length ? `missing: ${missing.join(",")}` : false }, async () => {
  const { createManager } = require("../src/vnc-session-manager");
  const manager = createManager({
    vncPortRangeStart: 5961, vncPortRangeEnd: 5963,
    novncPortRangeStart: 6190, novncPortRangeEnd: 6192,
    ttlSeconds: 5, maxConcurrent: 1, launchBrowser: false,
  });
  activeManagers.add(manager);
  try {
    await manager.spawn({ connectionId: "c1", profileDir: os.tmpdir(), platform: "tiktok" });
    await assert.rejects(
      () => manager.spawn({ connectionId: "c2", profileDir: os.tmpdir(), platform: "tiktok" }),
      /MAX_CONCURRENT/,
    );
    await manager.tearDown("c1");
  } finally {
    await manager.shutdownAll();
    activeManagers.delete(manager);
  }
});
