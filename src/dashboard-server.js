const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const express = require("express");
const { config } = require("./config");
const { ensureDirectories } = require("./fs-utils");
const { UniquifierController } = require("./uniquifier-controller");
const { AutoDownloadController } = require("./autodownload-controller");
const { ProfileDownloadController } = require("./profile-download-controller");
const { getDaemons, getAllStatus } = require("./daemon-registry");
const { migrateQueueIfNeeded } = require("./migrate-queue");
const { createStore: createWorkspaceStore } = require("./workspace-store");
const { createStore: createConnectionStore } = require("./connection-store");
const { createManager: createVncManager } = require("./vnc-session-manager");
const { resolveConnection } = require("./connection-resolver");
const { runMigration } = require("./migrate-to-workspaces");
const { createDashboardRequestGuard } = require("./request-guard");
const { buildSetupHealth, getAllowedSetupFolderPath } = require("./setup-health");
const {
  startDashboardLoginSession: startTikTokLoginSession,
  startLoginSessionForConnection: startTikTokLoginSessionForConnection,
  getLoginSessionStatus: getTikTokLoginSessionStatus,
  closeLoginSession: closeTikTokLoginSession,
} = require("./tiktok-uploader");
const {
  startLoginSession: startInstagramLoginSession,
  startLoginSessionForConnection: startInstagramLoginSessionForConnection,
  getLoginSessionStatus: getInstagramLoginSessionStatus,
  closeLoginSession: closeInstagramLoginSession,
} = require("./instagram-uploader");
const {
  startLoginSession: startYouTubeLoginSession,
  startLoginSessionForConnection: startYouTubeLoginSessionForConnection,
  getLoginSessionStatus: getYouTubeLoginSessionStatus,
  closeLoginSession: closeYouTubeLoginSession,
} = require("./youtube-uploader");
const {
  getState,
  addAccount,
  selectAccount,
  getActiveAccount,
  getAllAccounts,
  ensureAccountDirs,
} = require("./account-manager");

function openFolder(folderPath) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    if (platform === "win32") {
      const child = spawn("explorer", [folderPath], { detached: true, stdio: "ignore" });
      child.on("error", reject);
      child.unref();
      resolve();
      return;
    }
    if (platform === "darwin") {
      const child = spawn("open", [folderPath], { detached: true, stdio: "ignore" });
      child.on("error", reject);
      child.unref();
      resolve();
      return;
    }
    const child = spawn("xdg-open", [folderPath], { detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}

/**
 * Helper: resolve the active account and get its daemons from the registry.
 */
async function getActiveDaemons() {
  const active = await getActiveAccount();
  return getDaemons(active.id);
}

const SETTINGS_ENV_KEYS = new Set([
  "AUTO_ADD_SOUND",
  "DEFAULT_CAPTION",
  "DEFAULT_SOUND_QUERY",
  "RANDOM_QUEUE_ORDER",
]);

function serializeEnvValue(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function applyRuntimeSetting(envKey, value) {
  if (envKey === "AUTO_ADD_SOUND") {
    config.autoAddSound = String(value).toLowerCase() === "true";
  } else if (envKey === "DEFAULT_CAPTION") {
    config.defaultCaption = String(value ?? "");
  } else if (envKey === "DEFAULT_SOUND_QUERY") {
    config.defaultSoundQuery = String(value ?? "");
  } else if (envKey === "RANDOM_QUEUE_ORDER") {
    config.randomQueueOrder = String(value).toLowerCase() === "true";
  }
}

function isLoopbackHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function ensureDashboardBindAllowed() {
  if (config.dashboardAllowRemote || isLoopbackHost(config.dashboardHost)) {
    return;
  }

  throw new Error(
    `Refusing to bind dashboard to "${config.dashboardHost}". ` +
    "Use DASHBOARD_HOST=127.0.0.1 or set DASHBOARD_ALLOW_REMOTE=true if you understand the risk."
  );
}

async function createServer() {
  // Run migration from old flat queue layout to per-profile structure
  await migrateQueueIfNeeded();

  // Migrate legacy .profiles/default to workspace layout, then wire stores
  const migrationResult = await runMigration({ projectRoot: process.cwd() });
  if (migrationResult.migrated) {
    console.log(`[migration] ${migrationResult.connectionCount} connections migrated into ${migrationResult.workspaceId}`);
  }

  const workspaceStore = createWorkspaceStore(path.join(process.cwd(), "data", "workspaces.json"));
  const connectionStore = createConnectionStore(path.join(process.cwd(), "data", "connections.json"));

  const vncManager = createVncManager({
    vncPortRangeStart: config.vncPortRangeStart,
    vncPortRangeEnd: config.vncPortRangeEnd,
    novncPortRangeStart: config.novncPortRangeStart,
    novncPortRangeEnd: config.novncPortRangeEnd,
    ttlSeconds: config.vncSessionTtlSeconds,
    maxConcurrent: config.vncMaxConcurrent,
    hostName: process.env.PUBLIC_HOSTNAME || "localhost",
  });

  const shutdownVnc = async (signal) => {
    try { await vncManager.shutdownAll(); } catch (err) { console.error("[vnc] shutdown error", err); }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdownVnc("SIGINT"));
  process.on("SIGTERM", () => shutdownVnc("SIGTERM"));

  // Seed first workspace if none exist (fresh install after auth setup)
  if ((await workspaceStore.list()).length === 0) {
    await workspaceStore.create("My Brand");
  }

  // Ensure dirs for all existing accounts
  const allAccounts = await getAllAccounts();
  for (const acct of allAccounts) {
    await ensureAccountDirs(acct.id);
  }

  // Ensure uniquifier dirs
  await ensureDirectories([
    config.uniquifyInputDir,
    config.uniquifyOutputDir,
  ]);

  // Pre-initialize daemons for all existing accounts
  for (const acct of allAccounts) {
    await getDaemons(acct.id);
  }

  const app = express();
  const uniquifier = new UniquifierController();
  const autoDownloader = new AutoDownloadController();
  const profileDownloader = new ProfileDownloadController();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const cookieSession = require("cookie-session");
  const { createStore: createAuthStore } = require("./auth-store");
  const { requireAuth } = require("./auth-middleware");

  const authStore = createAuthStore(path.join(process.cwd(), "data", "auth.json"));

  if (!config.sessionSecret) {
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

  app.use(buildAuthRouter(authStore, workspaceStore));
  app.use("/auth", express.static(path.join(__dirname, "auth"), { extensions: ["html"] }));
  app.use(requireAuth);

  app.locals.connectionStoreForCheck = connectionStore;
  app.use(buildWorkspaceRouter(workspaceStore));
  app.use(buildConnectionRouter(connectionStore, workspaceStore));
  app.use(buildVncRouter(connectionStore, vncManager));

  app.use(createDashboardRequestGuard());
  app.use(express.static(path.join(__dirname, "..", "web")));
  app.use("/partials", express.static(path.join(__dirname, "..", "web", "partials")));

  // TikTok endpoints (profile-aware)

  app.get("/api/status", async (req, res) => {
    const daemons = await getActiveDaemons();
    const status = await daemons.tiktok.getStatus();
    res.json(status);
  });

  app.post("/api/start", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = daemons.tiktok.start();
    res.json(result);
  });

  app.post("/api/stop", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = daemons.tiktok.stop();
    res.json(result);
  });

  app.post("/api/run-once", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = await daemons.tiktok.runOnce("dashboard");
    res.json(result);
  });

  app.post("/api/schedule", async (req, res) => {
    try {
      const { expression } = req.body;
      if (!expression) {
        return res.status(400).json({ ok: false, error: "Missing expression" });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.tiktok.setSchedule(expression);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/instant-post", async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ ok: false, error: "Missing 'enabled' (boolean)" });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.tiktok.setInstantPost(enabled);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/schedule-plan", async (req, res) => {
    try {
      const { type, times } = req.body || {};
      if (type !== "daily-times") {
        return res.status(400).json({ ok: false, error: "Unsupported schedule plan type." });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.tiktok.setDailyTimes(times);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Settings

  app.post("/api/settings/save", async (req, res) => {
    try {
      const { payload } = req.body || {};
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ ok: false, error: "Invalid payload." });
      }

      const envPath = path.resolve(config.projectRoot, ".env");
      let envContent = "";
      try {
        envContent = await fs.readFile(envPath, "utf-8");
      } catch (err) {
        // file might not exist
      }

      const lines = envContent.split("\n");
      for (const [key, value] of Object.entries(payload)) {
        const envKey = key.toUpperCase();
        if (!SETTINGS_ENV_KEYS.has(envKey)) {
          return res.status(400).json({ ok: false, error: `Unsupported setting: ${envKey}` });
        }

        const serializedValue = serializeEnvValue(value);
        let found = false;

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith(`${envKey}=`)) {
            lines[i] = `${envKey}=${serializedValue}`;
            found = true;
            break;
          }
        }

        if (!found) {
          lines.push(`${envKey}=${serializedValue}`);
        }

        applyRuntimeSetting(envKey, value);
      }

      await fs.writeFile(envPath, lines.join("\n").replace(/\n{2,}/g, "\n"));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Account endpoints

  app.get("/api/accounts", async (req, res) => {
    const state = await getState();
    const active = await getActiveAccount();
    res.json({ ...state, activeAccount: active });
  });

  app.post("/api/accounts/add", async (req, res) => {
    try {
      const account = await addAccount(req.body?.name);
      // Pre-initialize daemons for the new account
      await getDaemons(account.id);
      const state = await getState();
      res.json({ ok: true, account, state });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/accounts/select", async (req, res) => {
    try {
      const account = await selectAccount(req.body?.accountId);
      const state = await getState();
      res.json({ ok: true, account, state });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Login endpoints (TikTok)

  app.post("/api/tiktok/login", async (req, res) => {
    try {
      const conn = await resolveConnection({
        connectionStore,
        workspaceStore,
        connectionId: req.query.connectionId,
        platform: "tiktok",
        session: req.session,
      });
      const result = await startTikTokLoginSessionForConnection(conn);
      res.json({ ...result, connectionId: conn.id });
    } catch (err) {
      const map = { NOT_FOUND: 404, CONNECTION_ID_REQUIRED: 400, NO_CONNECTION: 400, NO_ACTIVE_WORKSPACE: 400, INVALID_PLATFORM: 400 };
      res.status(map[err.message] || 500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/tiktok/login/status", async (req, res) => {
    res.json(await getTikTokLoginSessionStatus());
  });

  app.post("/api/tiktok/login/close", async (req, res) => {
    try {
      const result = await closeTikTokLoginSession();
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Instagram endpoints (profile-aware)

  app.get("/api/instagram/status", async (req, res) => {
    const daemons = await getActiveDaemons();
    const status = await daemons.instagram.getStatus();
    res.json(status);
  });

  app.post("/api/instagram/start", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = daemons.instagram.start();
    res.json(result);
  });

  app.post("/api/instagram/stop", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = daemons.instagram.stop();
    res.json(result);
  });

  app.post("/api/instagram/run-once", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = await daemons.instagram.runOnce("dashboard");
    res.json(result);
  });

  app.post("/api/instagram/schedule", async (req, res) => {
    try {
      const { expression } = req.body;
      if (!expression) {
        return res.status(400).json({ ok: false, error: "Missing expression" });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.instagram.setSchedule(expression);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/instagram/schedule-plan", async (req, res) => {
    try {
      const { type, times } = req.body || {};
      if (type !== "daily-times") {
        return res.status(400).json({ ok: false, error: "Unsupported schedule plan type." });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.instagram.setDailyTimes(times);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/instagram/instant-post", async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ ok: false, error: "Missing 'enabled' (boolean)" });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.instagram.setInstantPost(enabled);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Login endpoints (Instagram)

  app.post("/api/instagram/login", async (req, res) => {
    try {
      const conn = await resolveConnection({
        connectionStore,
        workspaceStore,
        connectionId: req.query.connectionId,
        platform: "instagram",
        session: req.session,
      });
      const result = await startInstagramLoginSessionForConnection(conn);
      res.json({ ...result, connectionId: conn.id });
    } catch (err) {
      const map = { NOT_FOUND: 404, CONNECTION_ID_REQUIRED: 400, NO_CONNECTION: 400, NO_ACTIVE_WORKSPACE: 400, INVALID_PLATFORM: 400 };
      res.status(map[err.message] || 500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/instagram/login/status", async (req, res) => {
    res.json(await getInstagramLoginSessionStatus());
  });

  app.post("/api/instagram/login/close", async (req, res) => {
    try {
      const result = await closeInstagramLoginSession();
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // YouTube endpoints (profile-aware)

  app.get("/api/youtube/status", async (req, res) => {
    const daemons = await getActiveDaemons();
    const status = await daemons.youtube.getStatus();
    res.json(status);
  });

  app.post("/api/youtube/start", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = daemons.youtube.start();
    res.json(result);
  });

  app.post("/api/youtube/stop", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = daemons.youtube.stop();
    res.json(result);
  });

  app.post("/api/youtube/run-once", async (req, res) => {
    const daemons = await getActiveDaemons();
    const result = await daemons.youtube.runOnce("dashboard");
    res.json(result);
  });

  app.post("/api/youtube/schedule", async (req, res) => {
    try {
      const { expression } = req.body;
      if (!expression) {
        return res.status(400).json({ ok: false, error: "Missing expression" });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.youtube.setSchedule(expression);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/youtube/schedule-plan", async (req, res) => {
    try {
      const { type, times } = req.body || {};
      if (type !== "daily-times") {
        return res.status(400).json({ ok: false, error: "Unsupported schedule plan type." });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.youtube.setDailyTimes(times);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/youtube/instant-post", async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ ok: false, error: "Missing 'enabled' (boolean)" });
      }
      const daemons = await getActiveDaemons();
      const result = await daemons.youtube.setInstantPost(enabled);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Login endpoints (YouTube)

  app.post("/api/youtube/login", async (req, res) => {
    try {
      const conn = await resolveConnection({
        connectionStore,
        workspaceStore,
        connectionId: req.query.connectionId,
        platform: "youtube",
        session: req.session,
      });
      const result = await startYouTubeLoginSessionForConnection(conn);
      res.json({ ...result, connectionId: conn.id });
    } catch (err) {
      const map = { NOT_FOUND: 404, CONNECTION_ID_REQUIRED: 400, NO_CONNECTION: 400, NO_ACTIVE_WORKSPACE: 400, INVALID_PLATFORM: 400 };
      res.status(map[err.message] || 500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/youtube/login/status", async (req, res) => {
    res.json(await getYouTubeLoginSessionStatus());
  });

  app.post("/api/youtube/login/close", async (req, res) => {
    try {
      const result = await closeYouTubeLoginSession();
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Overview endpoint (aggregates all profiles)

  app.get("/api/overview", async (req, res) => {
    try {
      const allStatus = await getAllStatus();
      res.json(allStatus);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // First-run setup and health endpoints

  app.get("/api/setup/health", async (req, res) => {
    try {
      res.json(await buildSetupHealth());
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/setup/open-folder", async (req, res) => {
    try {
      const active = await getActiveAccount();
      const folderPath = getAllowedSetupFolderPath(req.body?.key, active.id);
      if (!folderPath) {
        return res.status(400).json({ ok: false, error: "Unsupported setup folder key." });
      }

      await fs.mkdir(folderPath, { recursive: true });
      await openFolder(folderPath);
      res.json({ ok: true, path: folderPath });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Uniquifier endpoints

  app.get("/api/uniquifier/status", async (req, res) => {
    const status = await uniquifier.getStatus();
    res.json(status);
  });

  app.post("/api/uniquifier/start", async (req, res) => {
    try {
      const { inputDir, outputDir, logoImage } = req.body || {};
      const result = await uniquifier.start({ inputDir, outputDir, logoImage });
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/uniquifier/stop", (req, res) => {
    const result = uniquifier.stop();
    res.json(result);
  });

  app.post("/api/uniquifier/open-folder", async (req, res) => {
    try {
      const { kind, folderPath } = req.body || {};
      const status = await uniquifier.getStatus();
      const targetPath =
        folderPath ||
        (kind === "output" ? status.outputDir : kind === "input" ? status.inputDir : null);
      if (!targetPath) {
        return res.status(400).json({ ok: false, error: "Missing folder path or kind." });
      }
      await openFolder(targetPath);
      res.json({ ok: true, path: targetPath });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Auto-download endpoints
  app.get("/api/autodownload/status", (req, res) => {
    res.json(autoDownloader.getStatus());
  });

  app.post("/api/autodownload/start", async (req, res) => {
    try {
      const active = await getActiveAccount();
      const result = await autoDownloader.start({ accountId: req.body?.accountId || active.id });
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/autodownload/stop", (req, res) => {
    const result = autoDownloader.stop();
    res.json(result);
  });

  app.post("/api/autodownload/configure", async (req, res) => {
    try {
      const active = await getActiveAccount();
      const payload = { ...(req.body || {}) };
      if (!payload.accountId) {
        payload.accountId = active.id;
      }
      const result = await autoDownloader.configure(payload);
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  // Profile download endpoints
  app.get("/api/profile-download/status", (req, res) => {
    res.json(profileDownloader.getStatus());
  });

  app.post("/api/profile-download/start", async (req, res) => {
    try {
      const { channel, minViews, maxVideos, scanOnly } = req.body || {};
      const result = await profileDownloader.start({ channel, minViews, maxVideos, scanOnly });
      res.json(result);
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/profile-download/open-folder", async (req, res) => {
    try {
      const status = profileDownloader.getStatus();
      await openFolder(status.downloadsDir);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  });

  ensureDashboardBindAllowed();
  app.listen(config.dashboardPort, config.dashboardHost, () => {
    console.log(
      `Dashboard running at http://${config.dashboardHost}:${config.dashboardPort}`
    );
  });
}

function buildAuthRouter(authStore, workspaceStore) {
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
    req.session.activeWorkspaceId = await workspaceStore.getActiveId();
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

function buildWorkspaceRouter(workspaceStore) {
  const router = express.Router();

  router.get("/api/workspaces", async (req, res) => {
    res.json({
      ok: true,
      workspaces: await workspaceStore.list(),
      activeWorkspaceId: req.session.activeWorkspaceId || await workspaceStore.getActiveId(),
    });
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
    try {
      res.json({ ok: true, workspace: await workspaceStore.rename(req.params.id, req.body.label) });
    } catch (err) {
      res.status(err.message === "NOT_FOUND" ? 404 : 400).json({ ok: false, error: err.message });
    }
  });

  router.delete("/api/workspaces/:id", async (req, res) => {
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
    } catch (err) {
      res.status(404).json({ ok: false, error: err.message });
    }
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
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.patch("/api/connections/:id", async (req, res) => {
    try {
      res.json({ ok: true, connection: await connectionStore.rename(req.params.id, req.body.label) });
    } catch (err) {
      res.status(err.message === "NOT_FOUND" ? 404 : 400).json({ ok: false, error: err.message });
    }
  });

  router.delete("/api/connections/:id", async (req, res) => {
    await connectionStore.remove(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function buildVncRouter(connectionStore, vncManager) {
  const router = express.Router();

  function resolveProfileDir(conn) {
    return path.isAbsolute(conn.profileDir)
      ? conn.profileDir
      : path.join(process.cwd(), conn.profileDir);
  }

  router.post("/api/connections/:id/connect", async (req, res) => {
    try {
      const conn = await connectionStore.get(req.params.id);
      if (!conn) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      const info = await vncManager.spawn({
        connectionId: conn.id,
        profileDir: resolveProfileDir(conn),
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
    try {
      const conn = await connectionStore.get(req.params.id);
      if (!conn) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      await vncManager.tearDown(req.params.id);
      const { chromium } = require("playwright");
      const profileDirAbs = resolveProfileDir(conn);
      const ctx = await chromium.launchPersistentContext(profileDirAbs, { headless: true });
      try {
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
      } catch (probeErr) {
        await ctx.close().catch(() => {});
        throw probeErr;
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

if (require.main === module) {
  createServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports.buildAuthRouter = buildAuthRouter;
module.exports.buildWorkspaceRouter = buildWorkspaceRouter;
module.exports.buildConnectionRouter = buildConnectionRouter;
module.exports.buildVncRouter = buildVncRouter;
