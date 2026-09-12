# Manual Test Checklist — Auth + Workspaces + noVNC (SCRUM-19)

Run every check on a clean project checkout with `.env` filled.

## Auth

- [ ] Fresh install with no `data/auth.json` → visiting `/` redirects to `/auth/setup`.
- [ ] Submit setup with weak password → client-side warning shown; server rejects `< 8` chars.
- [ ] Submit valid setup → redirected to `/`, dashboard visible.
- [ ] Second setup request rejected with 409.
- [ ] Logout button clears cookie → next `/` visit redirects to `/auth/login`.
- [ ] Wrong credentials on login → inline error shown.
- [ ] Correct credentials → redirect to `/`, respects `?return=` query.
- [ ] Reset flow: request → token printed to terminal → confirm → new password works.
- [ ] Reset with expired/invalid token → error shown.

## Workspaces

- [ ] Fresh install creates `My Brand` workspace automatically after auth setup.
- [ ] Create second workspace via header dropdown → appears in list.
- [ ] Switch active workspace → connections view refreshes.
- [ ] Delete empty workspace → succeeds.
- [ ] Delete workspace with connections → 409, UI shows blocking message.

## Connections

- [ ] Add TikTok connection → row appears with ⚠ (not saved).
- [ ] Rename connection → new label persists.
- [ ] Delete connection → row disappears + `.profiles/{ws}/{conn}/` removed.
- [ ] Multiple connections per platform → API endpoints without `?connectionId=` reject with 400.

## noVNC connect flow

- [ ] Click Connect → modal opens, iframe loads noVNC after ~2s.
- [ ] Log in inside iframe → click Save Session → verification passes, ✓ shown on row.
- [ ] Save Session without logging in → 422 with "login not detected"; iframe stays open.
- [ ] Countdown reaches 0 → button disabled, message shows expiry.
- [ ] Cancel → VNC teardown observable (`ps` shows Xvfb/x11vnc gone).
- [ ] Max concurrent (3) sessions active → 4th connect → 503 with `MAX_CONCURRENT`.
- [ ] Kill server (Ctrl-C) → no orphan Xvfb/x11vnc/websockify processes remain.
- [ ] Restart server → orphan cleanup on start removes any stale `/tmp/.X{N}-lock` from crashed runs.

## Migration

- [ ] Start server on a checkout with legacy `accounts-state.json` and `.profiles/default/` → migration runs, `data/workspaces.json` + `data/connections.json` created, `.profiles/ws_default/conn_*/` populated, backup under `data/.migration-backup/`.
- [ ] Second start on same tree → migration reports noop.

## Cross-browser + accessibility

- [ ] Firefox: auth forms + noVNC iframe render and function.
- [ ] Chrome: same.
- [ ] Safari: auth forms render. (noVNC on Safari — verify keyboard events reach iframe.)
- [ ] Lighthouse audit on each auth form → accessibility score ≥ 90.

## Doctor

- [ ] `npm run doctor` prints ✓ for all 4 binaries + noVNC asset path.
- [ ] Temporarily remove xvfb (`sudo apt remove --dry-run xvfb`) → simulate by renaming `/usr/bin/Xvfb` → doctor reports missing with install hint.

## Autoamted tests

- [ ] `npm test` → all suites pass (auth-store, auth-middleware, auth-routes, workspace-store, connection-store, migrate-to-workspaces, workspace-connection-routes, connection-resolver, tiktok-uploader, vnc-session-manager (or skip)).
