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

  const sessions = new Map();

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
