# Phase 7 — Docs, Manual Test Checklist, Release

**Goal:** Finalize docs, run manual verification, promote branch through dual-branch release flow.

---

### Task 7.1: Update `SETUP.md` with VNC prereqs

**Files:**
- Modify: `SETUP.md`

- [ ] **Step 1:** Read current `SETUP.md`.

- [ ] **Step 2:** Append a new section:

```markdown
## noVNC platform connect flow (Linux server)

The dashboard uses a per-connection virtual browser so you can log in to
TikTok/Instagram/YouTube from any browser on your local network.

Install the required packages once:

```bash
sudo apt install -y xvfb x11vnc fluxbox websockify novnc
```

Verify with:

```bash
npm run doctor
```

The doctor reports each binary and the `noVNC` static assets location.

Environment variables (in `.env`, defaults shown):

```
SESSION_SECRET=<64 hex chars>   # required — generate with `openssl rand -hex 32`
VNC_PORT_RANGE_START=5901
VNC_PORT_RANGE_END=5920
NOVNC_PORT_RANGE_START=6080
NOVNC_PORT_RANGE_END=6099
VNC_SESSION_TTL_SECONDS=900
VNC_MAX_CONCURRENT=3
PUBLIC_HOSTNAME=localhost       # override when accessed over LAN, e.g. 192.168.1.42
```

### First-run auth setup

On first start with no `data/auth.json`, the dashboard redirects to
`/auth/setup` where you create the admin account. All subsequent traffic
requires login. Forgot the password? Use `/auth/reset` — the reset token
is printed to the server terminal (never sent by email).
```

- [ ] **Step 3:** Commit

```bash
git add SETUP.md
git commit -m "docs(setup): install instructions for VNC stack and auth"
```

---

### Task 7.2: Manual test checklist

**Files:**
- Create: `docs/superpowers/testing/2026-09-09-auth-vnc-checklist.md`

- [ ] **Step 1:** Write file:

```markdown
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
```

- [ ] **Step 2:** Commit

```bash
git add docs/superpowers/testing/2026-09-09-auth-vnc-checklist.md
git commit -m "docs(testing): manual verification checklist for SCRUM-19"
```

---

### Task 7.3: Run full test suite

- [ ] **Step 1:** From worktree root:

```bash
cd /home/ichhoo/Documents/AutoSocial.worktrees/auth-workspaces-novnc
npm run check
```
Expected: syntax check passes, `node --test` all-green (VNC test may skip if binaries missing on dev host).

- [ ] **Step 2:** If any failures — fix in place and commit with `fix(<area>): ...` prefix. Re-run.

---

### Task 7.4: Manual verification session

Walk the full checklist from Task 7.2 on the target host. Record findings in the checklist file (check the box).

Any bug found → open follow-up task via `mcp jira_create_issue` linked to SCRUM-19.

---

### Task 7.5: Promote to `main` via PR review

- [ ] **Step 1:** Mark draft PR ready:

```bash
gh pr ready
```

- [ ] **Step 2:** Request review from the Coder / QA subagents (per skill `superpowers-requesting-code-review`).

- [ ] **Step 3:** After approval, merge the PR into `main` (squash or merge — respect project convention). NEVER push directly to `main`.

```bash
gh pr merge --squash
```

- [ ] **Step 4:** Follow `dual-branch-release-flow` skill:

Merge `main` → `release`:

```bash
git fetch origin
git checkout release
git pull
git merge --no-ff origin/main -m "release: auth + workspaces + noVNC (SCRUM-19)"
git push origin release
```

Tag release:

```bash
version=$(node -p "require('./package.json').version")
git tag -a "v${version}" -m "Auth + workspaces + noVNC connect (SCRUM-19)"
git push origin "v${version}"
```

- [ ] **Step 5:** Update Jira SCRUM-19 with merge + release commit SHA + tag via `mcp_jira_add_comment`, transition status to Done via `mcp_jira_transition_issue`.

- [ ] **Step 6:** Remove the worktree:

```bash
cd /home/ichhoo/Documents/AutoSocial
git worktree remove ../AutoSocial.worktrees/auth-workspaces-novnc
```

- [ ] **Step 7:** Update the user via Discord: "SCRUM-19 shipped — dashboard auth, workspaces, and noVNC connect available on `release` tag `v<version>`."

---

## Definition of Done

- All 7 phases complete and committed.
- All existing tests still pass; new tests all green.
- Manual checklist has every box ticked.
- PR merged to `main`; `release` fast-forwarded from `main`; release tag pushed.
- Jira SCRUM-19 marked Done with merge + tag references.
- User notified.

## Rollback

If a critical bug surfaces post-release:

1. Revert the release merge on `release` branch:

   ```bash
   git checkout release
   git revert -m 1 <merge-sha> --no-edit
   git push origin release
   ```

2. Restore legacy state from `data/.migration-backup/{timestamp}/` if migration is at fault:

   ```bash
   cp data/.migration-backup/*/accounts-state.json .
   rm -rf data/workspaces.json data/connections.json
   ```

3. Notify user + reopen SCRUM-19 (transition to In Progress) with root-cause note.
