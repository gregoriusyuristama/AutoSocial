# AutoSocial — Dashboard Auth + Workspaces + Multi-Account Connection Design

**Date:** 2026-09-09
**Jira:** SCRUM-19
**Author:** Hermes Corp Lead PM (brainstorming with @gregoriusyuristama)
**Status:** Approved for planning

---

## Summary

Add three subsystems to AutoSocial:

1. **Dashboard Auth Gate** — single-admin login protecting dashboard access, with first-run setup, login, and password reset forms per `CLAUDE.md` conventions.
2. **Workspaces + Multi-Account Data Layer** — flat workspaces (e.g., "Fitness Brand", "Tech Channel") each holding multiple platform connections (TikTok, Instagram, YouTube), replacing the current single-account model.
3. **noVNC Platform Connect Flow** — per-connection isolated Xvfb + Chromium + noVNC session embedded in dashboard iframe, letting the user log in to TikTok/IG/YT from any browser on the local network. Solves the current 400 error caused by headed browser launch on a headless Linux host without `$DISPLAY`.

---

## Goals

- Protect AutoSocial dashboard behind admin credentials (local-network safe).
- Support multiple TikTok, Instagram, and YouTube accounts per workspace, organised into brand-scoped workspaces.
- Allow the user to connect (log in to) any platform account from a browser on the local network, without needing X forwarding or SSH tunnels.
- Preserve existing scheduling, posting, and daemon features; make them workspace/connection-aware.
- Match `CLAUDE.md` conventions (Tailwind, vanilla JS, `src/auth/` layout).

## Non-goals

- Multi-user roles or team collaboration (single admin only — future enhancement).
- Cloud-hosted deployment (design targets local-network usage; VNC security assumes trusted LAN).
- OAuth-based platform login (VNC captures the browser session directly; no OAuth API integration).
- Automatic session refresh after cookies expire (user re-runs connect flow).

---

## Architecture

Three new subsystems added to the Express dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (any device on LAN)                                │
│  ┌──────────────┐  ┌──────────────────────────────────┐    │
│  │ Auth forms   │  │ Dashboard (workspace switcher,   │    │
│  │ (src/auth/)  │  │  connections view, connect modal │    │
│  │              │  │  with noVNC iframe)              │    │
│  └──────┬───────┘  └──────────┬───────────────────────┘    │
└─────────┼─────────────────────┼─────────────────────────────┘
          │ HTTPS/HTTP          │ noVNC websocket
          ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Express Server (src/dashboard-server.js)                   │
│  ┌───────────────────┐  ┌──────────────────────┐            │
│  │ Auth middleware   │  │ Request guard (CSRF) │            │
│  │ (cookie-session)  │  │ existing              │            │
│  └────────┬──────────┘  └──────────┬───────────┘            │
│           ▼                        ▼                         │
│  ┌────────────────────────────────────────────────┐         │
│  │ /auth/*   /api/workspaces   /api/connections   │         │
│  │ /api/{platform}/*?connectionId=...             │         │
│  └────┬─────────┬─────────────────┬───────────────┘         │
│       ▼         ▼                 ▼                          │
│  ┌────────┐ ┌────────┐ ┌───────────────────────┐            │
│  │ auth-  │ │ work-  │ │ vnc-session-manager   │            │
│  │ store  │ │ space- │ │ (Xvfb + x11vnc +      │            │
│  │        │ │ store  │ │  websockify + Chromium│            │
│  └────────┘ └────────┘ │  per connection)      │            │
│                        └───────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

**Files** (all in `data/`):

### `data/auth.json` — single admin credential

```json
{
  "admin": {
    "username": "gregorius",
    "passwordHash": "$2b$12$...",
    "createdAt": "2026-09-09T01:30:00Z",
    "resetToken": null,
    "resetTokenExpiresAt": null
  }
}
```

Created on first-run `/auth/setup` flow. Absent file → server routes all traffic to setup form.

### `data/workspaces.json` — flat workspace list

```json
{
  "activeWorkspaceId": "ws_abc123",
  "workspaces": [
    { "id": "ws_abc123", "label": "Fitness Brand", "createdAt": "2026-09-09T01:31:00Z" }
  ]
}
```

`activeWorkspaceId` mirrors the value stored in the session cookie so a fresh browser has a sensible default.

### `data/connections.json` — platform connections

```json
{
  "connections": [
    {
      "id": "conn_xyz789",
      "workspaceId": "ws_abc123",
      "platform": "tiktok",
      "label": "@fitbrand_id",
      "profileDir": ".profiles/ws_abc123/conn_xyz789",
      "connectedAt": "2026-09-09T01:32:00Z",
      "sessionSaved": true,
      "lastVerifiedAt": "2026-09-09T01:32:15Z"
    }
  ]
}
```

`profileDir` is relative to project root and passed to `chromium.launchPersistentContext`.

### Session cookie payload (cookie-session)

```json
{ "userId": "admin", "activeWorkspaceId": "ws_abc123", "iat": 1725849600 }
```

httpOnly, signed with `SESSION_SECRET`, `maxAge: 7 days`.

### Migration

`src/migrate-to-workspaces.js` runs on server start when legacy `accounts-state.json` + `.profiles/default/` exist:

1. Create default workspace `{ id: "ws_default", label: "My Brand" }`.
2. For each subdirectory under `.profiles/default/{tiktok,instagram,youtube}/` with saved cookies, create a connection entry.
3. Move each profile dir to `.profiles/ws_default/conn_{id}/{platform}/`.
4. Backup legacy files to `data/.migration-backup/{timestamp}/`.
5. Refuse to start on migration failure; log the exact restore command.

### New / modified files

**New**
- `data/auth.json`, `data/workspaces.json`, `data/connections.json`
- `src/auth-store.js`, `src/workspace-store.js`, `src/connection-store.js`
- `src/auth-middleware.js`
- `src/vnc-session-manager.js`
- `src/migrate-to-workspaces.js`
- `src/auth/setup.html` + `setup.js`
- `src/auth/login.html` + `login.js`
- `src/auth/reset-request.html` + `reset-request.js`
- `src/auth/reset-confirm.html` + `reset-confirm.js`
- `web/partials/workspace-switcher.html`
- `web/partials/connect-modal.html`

**Modified**
- `src/dashboard-server.js` — wires auth middleware, workspace/connection endpoints, platform endpoints accept `?connectionId=`.
- `src/account-manager.js` — compatibility shim delegating to `connection-store.js` so existing daemon code keeps working during rollout.
- `src/tiktok-uploader.js`, `src/instagram-uploader.js`, `src/youtube-uploader.js` — accept `connectionId`, read `profileDir` from `connection-store`.
- `src/config.js` — new env vars for session secret, VNC/noVNC port ranges, session TTL.
- `scripts/doctor.js` — verify `xvfb`, `x11vnc`, `fluxbox`, `websockify`, `novnc` presence.
- `SETUP.md` — install instructions for the VNC stack packages.
- `.env.example` — new variables.

---

## HTTP API

### Auth endpoints (no auth required)

```
GET  /auth/setup             → setup form (302 /auth/login if admin exists)
POST /auth/setup             → { username, password } → create admin, set cookie, 302 /
GET  /auth/login             → login form (302 /auth/setup if no admin)
POST /auth/login             → { username, password } → set cookie, 302 /
POST /auth/logout            → clear cookie, 302 /auth/login
GET  /auth/reset             → reset request form
POST /auth/reset/request     → { username } → generate token (30-min expiry), print to server console, always return 200
GET  /auth/reset/confirm     → ?token=... → confirm form
POST /auth/reset/confirm     → { token, newPassword } → validate + update hash + clear token
```

### Workspace endpoints (auth required)

```
GET    /api/workspaces                → list workspaces
POST   /api/workspaces                → { label } → create
PATCH  /api/workspaces/:id            → { label } → rename
DELETE /api/workspaces/:id            → delete (409 if has connections)
POST   /api/workspaces/:id/activate   → set active workspace on session
```

### Connection endpoints (auth required, scoped to active workspace)

```
GET    /api/connections                        → list connections for active workspace
POST   /api/connections                        → { platform, label } → create empty connection, return { connectionId }
PATCH  /api/connections/:id                    → { label } → rename
DELETE /api/connections/:id                    → delete connection + profile dir
POST   /api/connections/:id/connect            → spawn VNC session → { vncUrl, sessionId, ttlSeconds }
POST   /api/connections/:id/save-session       → verify cookies, mark sessionSaved:true, tear down VNC
POST   /api/connections/:id/cancel             → tear down VNC without saving
GET    /api/connections/:id/vnc-status         → { active, expiresAt }
POST   /api/connections/:id/verify             → run headless check, update lastVerifiedAt
```

### Modified platform endpoints

All existing `/api/{tiktok,instagram,youtube}/*` endpoints accept `?connectionId=conn_xyz789` and dispatch to that connection's profile dir. Requests without `connectionId` for platforms that have multiple connections return `400 { error: "CONNECTION_ID_REQUIRED" }`. For platforms with exactly one connection in the active workspace, `connectionId` may be omitted (auto-selected) for backward compatibility.

### Auth middleware behavior

- Static assets (`/`, `/style.css`, `/app.js`, `/auth/*` static files): unauthenticated.
- Unauthenticated `/api/*` → `401 { ok:false, error:"AUTH_REQUIRED" }`.
- Other unauthenticated page loads → `302 /auth/login?return=<original-path>`.
- Existing `request-guard.js` runs after auth middleware.

---

## UI

### File structure (per `CLAUDE.md`)

```
src/auth/
├── setup.html          # first-run admin creation
├── setup.js
├── login.html
├── login.js
├── reset-request.html
├── reset-request.js
├── reset-confirm.html
└── reset-confirm.js

web/
├── index.html          # existing dashboard, gated behind auth
├── app.js              # updated with workspace switcher + connect modal
├── style.css           # existing
└── partials/
    ├── workspace-switcher.html
    └── connect-modal.html
```

### Styling

Tailwind CSS via CDN (`CLAUDE.md` §2). Apple-design motion: `transition-all duration-300`, `shadow-lg`, `rounded-2xl`, `backdrop-blur-md` on modals.

### Auth screens (shared layout: centered card, brand logo top, form middle, secondary action bottom)

1. **`setup.html`** — one-time, when no admin exists
   - Fields: username, password, confirm password
   - Client-side password strength meter
   - Submit → create admin + auto-login → redirect `/`

2. **`login.html`** — default landing when unauth
   - Fields: username, password
   - "Forgot password?" link → `/auth/reset`
   - Submit → set cookie → redirect `/` (or `return` param)

3. **`reset-request.html`** — request reset token
   - Field: username
   - Info banner: "Token printed to server console (local-only reset)"
   - Submit → 200 → shows "Check server terminal"

4. **`reset-confirm.html`** — apply new password
   - Fields: token (prefilled from `?token=`), new password, confirm
   - Submit → validates → redirect `/auth/login`

### Dashboard enhancements

**Workspace switcher** — header dropdown top-right:

```
┌─────────────────────────────────┐
│ AutoSocial  [Fitness Brand ▼] 👤│
└─────────────────────────────────┘
   ├─ Fitness Brand ✓
   ├─ Tech Channel
   ├─ ─────────
   ├─ + New workspace
   └─ Manage workspaces
```

**Connections view** — replaces the current single-account UI:

```
┌────────────────────────────────────────┐
│ Fitness Brand › Connections            │
│ [+ Connect Account]                    │
│                                        │
│ 🎵 TikTok                              │
│  ├─ @fitbrand_id      ✓  [Post][⋮]   │
│  └─ @fitbrand_en      ⚠  [Reconnect] │
│                                        │
│ 📷 Instagram                           │
│  └─ @fitbrand         ✓  [Post][⋮]   │
│                                        │
│ ▶ YouTube                              │
│  └─ (none)  [+ Connect]               │
└────────────────────────────────────────┘
```

**Connect modal** — noVNC iframe:

```
┌──────────────────────────────────────┐
│ Connect TikTok account            [×]│
│ ────────────────────────────────────│
│ Label: [_______________]             │
│ ┌──────────────────────────────────┐ │
│ │  [noVNC iframe: chromium in      │ │
│ │   virtual display, log in to     │ │
│ │   TikTok here]                   │ │
│ └──────────────────────────────────┘ │
│ Session expires in 14:32              │
│              [Cancel] [Save Session] │
└──────────────────────────────────────┘
```

Modal states: **Spawning** ("Starting virtual browser..." spinner), **Active** (iframe live, countdown timer, save/cancel enabled), **Expired** (dim iframe, restart button), **Saved** (success toast, modal closes, connection row updates).

---

## noVNC Session Lifecycle

Per-connection isolated session, spawned by `src/vnc-session-manager.js`:

1. **Spawn** on `POST /api/connections/:id/connect`:
   - Allocate free display number `:99+N` from `Xvfb-lock` file scan.
   - Allocate free VNC port from `VNC_PORT_RANGE_START..END`.
   - Allocate free noVNC websocket port from `NOVNC_PORT_RANGE_START..END`.
   - Spawn `Xvfb :99+N -screen 0 1400x1000x24`.
   - Spawn `fluxbox -display :99+N` (minimal window manager).
   - Spawn `x11vnc -display :99+N -rfbport {vncPort} -localhost -nopw -forever -shared -noxdamage`.
   - Spawn `websockify {novncPort} localhost:{vncPort}`.
   - Launch Chromium via Playwright: `DISPLAY=:99+N chromium.launchPersistentContext(profileDir, { headless: false, viewport: {1400,1000} })`.
   - Navigate to platform's login/upload page.
   - Record session in in-memory `Map<connectionId, VncSession>`.
   - Return `{ vncUrl: "ws://{host}:{novncPort}/websockify", sessionId, ttlSeconds }`.

2. **Idle detection**: heartbeat from noVNC websocket. No websocket messages for 60s while modal closed → tear down. Idle timeout `VNC_SESSION_TTL_SECONDS` (default 900s / 15 min) resets on any user activity.

3. **Save**: `POST /api/connections/:id/save-session` runs a headless probe on the same profile dir:
   - TikTok: navigate `/upload`, check creator UI (not login page).
   - Instagram: navigate `/`, check for feed (not login page).
   - YouTube: navigate `studio.youtube.com`, check for dashboard.
   - On success: mark `sessionSaved:true`, `lastVerifiedAt`, tear down VNC stack.
   - On failure: keep VNC open, return `422 { error:"NO_SESSION_COOKIES" }`, UI shows "Login not detected, please complete login and retry".

4. **Cancel**: `POST /api/connections/:id/cancel` tears down VNC without saving.

5. **Server shutdown**: kill all child processes (Xvfb, x11vnc, websockify, chromium) via `process.on("SIGINT"|"SIGTERM")`.

6. **Orphan cleanup on start**: scan `/tmp/.X{99+N}-lock`, kill stale processes matching AutoSocial patterns.

7. **Concurrency limit**: max 3 simultaneous VNC sessions (config: `VNC_MAX_CONCURRENT`).

---

## Configuration

`.env` additions:

```
SESSION_SECRET=<64-char hex>              # generated on first-run setup
VNC_PORT_RANGE_START=5901
VNC_PORT_RANGE_END=5920
NOVNC_PORT_RANGE_START=6080
NOVNC_PORT_RANGE_END=6099
VNC_SESSION_TTL_SECONDS=900               # 15 min idle timeout
VNC_MAX_CONCURRENT=3
```

System packages (documented in `SETUP.md`):

```bash
sudo apt install -y xvfb x11vnc fluxbox websockify novnc
```

Doctor script (`scripts/doctor.js`) verifies all five binaries present and prints the exact install command on any missing.

Dependencies added to `package.json`:

```json
"bcryptjs": "^2.4.3",
"cookie-session": "^2.1.0"
```

Existing `express@5`, `dotenv`, `playwright`, `node-cron` reused.

---

## Error Handling

| Failure | HTTP | Payload | User feedback |
|---|---|---|---|
| Missing xvfb/x11vnc/websockify | 503 | `{error:"VNC_STACK_MISSING", missing:[...]}` | Modal: "Server missing packages. Run: `sudo apt install ...`" |
| No free port in range | 503 | `{error:"NO_FREE_PORT"}` | "Too many active sessions. Close one and retry." |
| Chromium launch failure | 500 | `{error:"BROWSER_LAUNCH_FAILED"}` | "Browser failed to start. Check server logs." |
| VNC session timed out | 410 | `{error:"SESSION_EXPIRED"}` | Modal shows expired state + restart button |
| Session save without cookies | 422 | `{error:"NO_SESSION_COOKIES"}` | "Please complete login inside the browser before saving." |
| Auth: bad credentials | 401 | `{error:"INVALID_CREDENTIALS"}` | Form shows inline error |
| Auth: session expired | 401 | `{error:"AUTH_REQUIRED"}` | Redirect to login, preserve return URL |
| Reset token invalid/expired | 400 | `{error:"INVALID_TOKEN"}` | Confirm form shows error, request new |
| Workspace delete with connections | 409 | `{error:"WORKSPACE_NOT_EMPTY"}` | "Move or delete connections first" |
| Missing `connectionId` for multi-conn platform | 400 | `{error:"CONNECTION_ID_REQUIRED"}` | UI selects connection before dispatch |
| Migration failure | Server refuses to start | Log line with restore command | User sees terminal error |

---

## Testing (per `CLAUDE.md` §5 — manual only)

Manual test checklist committed to `docs/superpowers/testing/2026-09-09-auth-vnc-checklist.md`. Covers:

- First-run setup (no `auth.json` → setup form → admin created → dashboard visible).
- Login / logout / reset flow (token printed to console, confirm form works).
- Workspace CRUD (create, rename, delete rejects when has connections, activate switches session).
- Connection CRUD per platform (create empty, rename, delete removes profile dir).
- VNC lifecycle: spawn (all 5 processes running), save (verification probe passes), timeout (session torn down after TTL), cancel (torn down without save), orphan cleanup on server restart.
- Migration from legacy `accounts-state.json` (backup created, connections migrated, dashboard shows migrated accounts).
- Concurrent session limit (4th connect attempt gets 503).
- Missing package handling (uninstall `xvfb`, doctor reports missing, connect returns 503).
- Lighthouse accessibility check on all four auth forms (target: score ≥ 90).
- Cross-browser: Firefox, Chrome, Safari for auth forms and noVNC iframe.

Automated tests deferred (per `CLAUDE.md` §5). `npm test` continues to work but has no coverage on new code paths.

---

## Open Questions / Follow-Ups

None for v1. Future enhancements to consider later:

- Multi-user roles (admin, editor, viewer) with per-workspace permissions.
- Automatic session refresh detection (periodic verify probe, alert when expired).
- Move workspace switcher into a dedicated sidebar layout.
- OAuth-based platform integration where APIs exist (YouTube Data API, Instagram Graph API), reducing reliance on VNC.

---

## Rollout Order

Implementation plan (produced by `superpowers-writing-plans` skill next) will sequence:

1. Auth store + middleware + forms (no functional dependency on rest).
2. Workspace + connection stores + migration from legacy state.
3. Refactor platform uploaders to accept `connectionId`.
4. Dashboard UI: workspace switcher + connections view.
5. VNC session manager + connect modal (final piece, depends on all above).
6. Doctor script updates + SETUP.md.
