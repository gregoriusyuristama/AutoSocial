# Phase 6 — VNC Session Manager + Connect Modal

**Goal:** Spawn isolated per-connection Xvfb + fluxbox + x11vnc + websockify + Chromium stack, expose noVNC websocket, embed in the dashboard connect modal, verify session cookies on save.

**Prereqs:** Phase 0 confirmed VNC stack packages installed via `npm run doctor`. If missing, install first:

```bash
sudo apt install -y xvfb x11vnc fluxbox websockify novnc
```

---

### Task 6.1: `src/vnc-session-manager.js` — process lifecycle

**Files:**
- Create: `src/vnc-session-manager.js`
- Test: `test/vnc-session-manager.test.js`

- [ ] **Step 1:** Write failing test (real Xvfb spawn; skip if binaries missing)

Create `test/vnc-session-manager.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function has(bin) { try { execSync(`command -v ${bin}`, { stdio: "pipe" }); return true; } catch { return false; } }
const missing = ["Xvfb", "x11vnc", "fluxbox", "websockify"].filter((b) => !has(b));

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
    launchBrowser: false, // test doesn't need Chromium
  });
  const session = await manager.spawn({ connectionId: "conn_test", profileDir: tmp, platform: "tiktok" });
  assert.match(session.vncUrl, /ws:\/\/[^:]+:\d+\/websockify$/);
  assert.ok(session.sessionId);
  await new Promise((r) => setTimeout(r, 500));
  await manager.tearDown("conn_test");
  await fs.rm(tmp, { recursive: true, force: true });
});

test("max concurrent enforced", { skip: missing.length ? `missing: ${missing.join(",")}` : false }, async () => {
  const { createManager } = require("../src/vnc-session-manager");
  const manager = createManager({
    vncPortRangeStart: 5961, vncPortRangeEnd: 5963,
    novncPortRangeStart: 6190, novncPortRangeEnd: 6192,
    ttlSeconds: 5, maxConcurrent: 1, launchBrowser: false,
  });
  await manager.spawn({ connectionId: "c1", profileDir: os.tmpdir(), platform: "tiktok" });
  await assert.rejects(
    () => manager.spawn({ connectionId: "c2", profileDir: os.tmpdir(), platform: "tiktok" }),
    /MAX_CONCURRENT/,
  );
  await manager.tearDown("c1");
});
```

- [ ] **Step 2:** Run — expect FAIL (or SKIP if VNC missing)

Run: `npm test -- test/vnc-session-manager.test.js`

- [ ] **Step 3:** Implement `src/vnc-session-manager.js`

Create:
```js
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

function portAvailable(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function firstFreePort(start, end) {
  for (let p = start; p <= end; p++) {
    if (await portAvailable(p)) return p;
  }
  throw new Error("NO_FREE_PORT");
}

function firstFreeDisplay() {
  return new Promise(async (resolve, reject) => {
    for (let n = 99; n <= 199; n++) {
      const lock = `/tmp/.X${n}-lock`;
      try { await fs.access(lock); continue; } catch { return resolve(n); }
    }
    reject(new Error("NO_FREE_DISPLAY"));
  });
}

function createManager(opts) {
  const {
    vncPortRangeStart, vncPortRangeEnd,
    novncPortRangeStart, novncPortRangeEnd,
    ttlSeconds, maxConcurrent,
    launchBrowser = true,
    novncStatic = "/usr/share/novnc",
    hostName = "localhost",
  } = opts;

  const sessions = new Map(); // connectionId -> session obj

  async function spawnOne({ connectionId, profileDir, platform }) {
    if (sessions.size >= maxConcurrent) throw new Error("MAX_CONCURRENT");
    if (sessions.has(connectionId)) return sessions.get(connectionId).public();

    const display = await firstFreeDisplay();
    const vncPort = await firstFreePort(vncPortRangeStart, vncPortRangeEnd);
    const novncPort = await firstFreePort(novncPortRangeStart, novncPortRangeEnd);
    const sessionId = crypto.randomBytes(8).toString("hex");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const children = {};

    children.xvfb = spawn("Xvfb", [`:${display}`, "-screen", "0", "1400x1000x24"], { stdio: "ignore" });
    children.fluxbox = spawn("fluxbox", ["-display", `:${display}`], { stdio: "ignore" });
    children.x11vnc = spawn("x11vnc", [
      "-display", `:${display}`,
      "-rfbport", String(vncPort),
      "-localhost", "-nopw", "-forever", "-shared", "-noxdamage", "-quiet",
    ], { stdio: "ignore" });
    children.websockify = spawn("websockify", [
      "--web", novncStatic,
      String(novncPort),
      `localhost:${vncPort}`,
    ], { stdio: "ignore" });

    let browserContext = null;
    if (launchBrowser) {
      const { chromium } = require("playwright");
      await fs.mkdir(profileDir, { recursive: true });
      browserContext = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1400, height: 1000 },
        env: { ...process.env, DISPLAY: `:${display}` },
        args: ["--disable-blink-features=AutomationControlled"],
      });
      const page = browserContext.pages()[0] || await browserContext.newPage();
      const startUrl = {
        tiktok: "https://www.tiktok.com/login",
        instagram: "https://www.instagram.com/accounts/login/",
        youtube: "https://accounts.google.com/",
      }[platform] || "about:blank";
      page.goto(startUrl).catch(() => {});
    }

    const expiryTimer = setTimeout(() => tearDown(connectionId), ttlSeconds * 1000);

    const session = {
      connectionId, sessionId, display, vncPort, novncPort, expiresAt,
      children, browserContext,
      public() {
        return {
          sessionId,
          vncUrl: `ws://${hostName}:${novncPort}/websockify`,
          novncHttpUrl: `http://${hostName}:${novncPort}/vnc.html?autoconnect=1&resize=scale`,
          ttlSeconds,
          expiresAt,
        };
      },
      timer: expiryTimer,
    };
    sessions.set(connectionId, session);
    return session.public();
  }

  async function tearDown(connectionId) {
    const s = sessions.get(connectionId);
    if (!s) return;
    clearTimeout(s.timer);
    sessions.delete(connectionId);
    if (s.browserContext) await s.browserContext.close().catch(() => {});
    for (const [name, proc] of Object.entries(s.children)) {
      try { proc.kill("SIGTERM"); } catch {}
    }
    await new Promise((r) => setTimeout(r, 200));
    for (const proc of Object.values(s.children)) {
      try { proc.kill("SIGKILL"); } catch {}
    }
  }

  function status(connectionId) {
    const s = sessions.get(connectionId);
    if (!s) return { active: false };
    return { active: true, expiresAt: s.expiresAt };
  }

  async function shutdownAll() {
    for (const id of Array.from(sessions.keys())) await tearDown(id);
  }

  return { spawn: spawnOne, tearDown, status, shutdownAll };
}

module.exports = { createManager };
```

- [ ] **Step 4:** Run test

Run: `npm test -- test/vnc-session-manager.test.js`
Expected: pass (or skip if VNC binaries missing).

- [ ] **Step 5:** Commit

```bash
git add src/vnc-session-manager.js test/vnc-session-manager.test.js
git commit -m "feat(vnc): per-connection Xvfb+x11vnc+websockify session manager"
```

---

### Task 6.2: `/api/connections/:id/connect|save-session|cancel|vnc-status` endpoints

**Files:**
- Modify: `src/dashboard-server.js`

- [ ] **Step 1:** Add near bootstrap:

```js
const { createManager: createVncManager } = require("./vnc-session-manager");
const vncManager = createVncManager({
  vncPortRangeStart: config.vncPortRangeStart,
  vncPortRangeEnd: config.vncPortRangeEnd,
  novncPortRangeStart: config.novncPortRangeStart,
  novncPortRangeEnd: config.novncPortRangeEnd,
  ttlSeconds: config.vncSessionTtlSeconds,
  maxConcurrent: config.vncMaxConcurrent,
  hostName: process.env.PUBLIC_HOSTNAME || "localhost",
});

process.on("SIGINT", async () => { await vncManager.shutdownAll(); process.exit(0); });
process.on("SIGTERM", async () => { await vncManager.shutdownAll(); process.exit(0); });
```

- [ ] **Step 2:** Add routes (inside a `buildVncRouter(...)` factory to mirror the pattern):

```js
function buildVncRouter(connectionStore, vncManager) {
  const router = express.Router();

  router.post("/api/connections/:id/connect", async (req, res) => {
    try {
      const conn = await connectionStore.get(req.params.id);
      if (!conn) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      const profileDirAbs = require("node:path").isAbsolute(conn.profileDir)
        ? conn.profileDir
        : require("node:path").join(process.cwd(), conn.profileDir);
      const info = await vncManager.spawn({
        connectionId: conn.id,
        profileDir: profileDirAbs,
        platform: conn.platform,
      });
      res.json({ ok: true, ...info, connection: conn });
    } catch (err) {
      const map = { NO_FREE_PORT: 503, NO_FREE_DISPLAY: 503, MAX_CONCURRENT: 503 };
      res.status(map[err.message] || 500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/connections/:id/vnc-status", async (req, res) => {
    res.json({ ok: true, ...vncManager.status(req.params.id) });
  });

  router.post("/api/connections/:id/cancel", async (req, res) => {
    await vncManager.tearDown(req.params.id);
    res.json({ ok: true });
  });

  router.post("/api/connections/:id/save-session", async (req, res) => {
    // Verification probe — tries the platform's authenticated URL headlessly
    try {
      const conn = await connectionStore.get(req.params.id);
      if (!conn) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      await vncManager.tearDown(req.params.id); // close visible browser first
      const { chromium } = require("playwright");
      const profileDirAbs = require("node:path").isAbsolute(conn.profileDir)
        ? conn.profileDir
        : require("node:path").join(process.cwd(), conn.profileDir);
      const ctx = await chromium.launchPersistentContext(profileDirAbs, { headless: true });
      const page = ctx.pages()[0] || await ctx.newPage();
      const probeUrl = {
        tiktok: "https://www.tiktok.com/tiktokstudio/upload",
        instagram: "https://www.instagram.com/",
        youtube: "https://studio.youtube.com/",
      }[conn.platform];
      await page.goto(probeUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      const finalUrl = page.url();
      const loggedIn = !/login|signin|accounts\.google\.com/i.test(finalUrl);
      await ctx.close();
      if (!loggedIn) return res.status(422).json({ ok: false, error: "NO_SESSION_COOKIES" });
      const updated = await connectionStore.markSessionSaved(conn.id);
      res.json({ ok: true, connection: updated });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports.buildVncRouter = buildVncRouter;
```

Mount in bootstrap:

```js
app.use(buildVncRouter(connectionStore, vncManager));
```

- [ ] **Step 3:** Manual smoke (requires VNC stack)

```bash
PORT=3031 SESSION_SECRET=$(openssl rand -hex 32) npm start &
sleep 2
# Log in via curl or browser, get cookie, then:
curl -s -X POST -H "cookie: <session>" http://127.0.0.1:3031/api/connections/<connId>/connect
# Expect JSON with vncUrl + novncHttpUrl
kill %1
```

- [ ] **Step 4:** Commit

```bash
git add src/dashboard-server.js
git commit -m "feat(server): VNC connect / save-session / cancel / status endpoints"
```

---

### Task 6.3: Connect modal — client-side JS (`web/app.js`)

**Files:**
- Modify: `web/app.js`

- [ ] **Step 1:** Replace the Phase 5 stub `openConnectModal` with:

```js
async function openConnectModal(platform, existingConnId, existingLabel) {
  // Lazy-load partial into slot
  const slot = document.getElementById("connect-modal-slot");
  if (!slot.dataset.loaded) {
    slot.innerHTML = await (await fetch("/partials/connect-modal.html")).text();
    slot.dataset.loaded = "1";
  }
  const modal = document.getElementById("connect-modal");
  const title = document.getElementById("connect-modal-title");
  const labelInput = document.getElementById("connect-label");
  const statusEl = document.getElementById("connect-status");
  const vncWrap = document.getElementById("connect-vnc-wrap");
  const iframe = document.getElementById("connect-vnc-iframe");
  const countdown = document.getElementById("connect-countdown");
  const saveBtn = document.getElementById("connect-save-btn");
  const cancelBtn = document.getElementById("connect-cancel-btn");
  const closeBtn = document.getElementById("connect-modal-close");

  title.textContent = `Connect ${platform} account`;
  labelInput.value = existingLabel || "";
  vncWrap.classList.add("hidden");
  saveBtn.disabled = true;
  statusEl.textContent = "Starting virtual browser…";
  modal.classList.remove("hidden");

  let connId = existingConnId;
  if (!connId) {
    const label = labelInput.value.trim() || `${platform} account`;
    const created = await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, label }),
    }).then((r) => r.json());
    if (!created.ok) { statusEl.textContent = created.error; return; }
    connId = created.connection.id;
  }

  const spawn = await fetch(`/api/connections/${connId}/connect`, { method: "POST" }).then((r) => r.json());
  if (!spawn.ok) { statusEl.textContent = spawn.error; return; }
  statusEl.textContent = "Log in inside the virtual browser, then click Save Session.";
  iframe.src = spawn.novncHttpUrl;
  vncWrap.classList.remove("hidden");
  saveBtn.disabled = false;

  let expiresAt = new Date(spawn.expiresAt).getTime();
  const tick = setInterval(() => {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      countdown.textContent = "Session expired.";
      clearInterval(tick);
      saveBtn.disabled = true;
      return;
    }
    const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");
    countdown.textContent = `Session expires in ${mm}:${ss}`;
  }, 1000);

  function cleanup() {
    clearInterval(tick);
    modal.classList.add("hidden");
    iframe.src = "about:blank";
  }

  cancelBtn.onclick = async () => { await fetch(`/api/connections/${connId}/cancel`, { method: "POST" }); cleanup(); await renderConnections(); };
  closeBtn.onclick = cancelBtn.onclick;
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Verifying…";
    const res = await fetch(`/api/connections/${connId}/save-session`, { method: "POST" }).then((r) => r.json());
    saveBtn.textContent = "Save Session";
    if (res.ok) {
      cleanup();
      await renderConnections();
      alert("Session saved.");
    } else if (res.error === "NO_SESSION_COOKIES") {
      statusEl.textContent = "Login not detected inside the virtual browser. Complete login and try again.";
      saveBtn.disabled = false;
    } else {
      statusEl.textContent = res.error || "Save failed.";
      saveBtn.disabled = false;
    }
  };
}
```

- [ ] **Step 2:** Manual smoke — click "+ Connect Account", modal opens with iframe pointing at noVNC. Log in inside iframe, click Save Session → verifies + updates row.

- [ ] **Step 3:** Commit

```bash
git add web/app.js
git commit -m "feat(ui): connect modal with noVNC iframe + save session flow"
```

---

Phase 6 done. Proceed to `phase-7-release.md`.
