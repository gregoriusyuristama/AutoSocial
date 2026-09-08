# Phase 0 — Prep: Worktree, Dependencies, Env, Doctor

**Goal:** Set up isolated development environment, install runtime dependencies, seed configuration variables, and extend doctor script for VNC stack detection.

**Prereqs:** Working on `/home/ichhoo/Documents/AutoSocial`, current branch `main`, tree clean.

---

### Task 0.1: Create feature worktree

**Files:** None modified in current tree; new worktree under `/home/ichhoo/Documents/AutoSocial.worktrees/auth-workspaces-novnc`.

- [ ] **Step 1:** Verify main tree clean

Run: `cd /home/ichhoo/Documents/AutoSocial && git status --porcelain`
Expected: empty output.

- [ ] **Step 2:** Create worktree on new branch

Run:
```bash
cd /home/ichhoo/Documents/AutoSocial
git worktree add ../AutoSocial.worktrees/auth-workspaces-novnc -b feat/auth-workspaces-novnc main
```
Expected: `Preparing worktree ...` followed by branch created.

- [ ] **Step 3:** Confirm worktree ready

Run: `cd /home/ichhoo/Documents/AutoSocial.worktrees/auth-workspaces-novnc && git branch --show-current`
Expected: `feat/auth-workspaces-novnc`

All subsequent tasks run inside this worktree.

---

### Task 0.2: Install runtime npm dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto by npm)

- [ ] **Step 1:** Add dependencies

Run:
```bash
cd /home/ichhoo/Documents/AutoSocial.worktrees/auth-workspaces-novnc
npm install bcryptjs@^2.4.3 cookie-session@^2.1.0
```
Expected: added 2 packages, lockfile updated.

- [ ] **Step 2:** Verify installed

Run: `node -e "console.log(require('bcryptjs').hashSync('x', 12).length, typeof require('cookie-session'))"`
Expected: `60 function`

- [ ] **Step 3:** Commit

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add bcryptjs and cookie-session for dashboard auth"
```

---

### Task 0.3: Extend `.env.example` and `src/config.js`

**Files:**
- Modify: `.env.example` (append)
- Modify: `src/config.js`

- [ ] **Step 1:** Read existing config

Use `read_file(path="src/config.js")` to confirm the `module.exports = { ... }` structure and the `getBoolean`/env-parse helpers.

- [ ] **Step 2:** Append env vars to `.env.example`

Append these lines (leave trailing newline):
```
# Dashboard auth
SESSION_SECRET=

# noVNC connect flow
VNC_PORT_RANGE_START=5901
VNC_PORT_RANGE_END=5920
NOVNC_PORT_RANGE_START=6080
NOVNC_PORT_RANGE_END=6099
VNC_SESSION_TTL_SECONDS=900
VNC_MAX_CONCURRENT=3
```

- [ ] **Step 3:** Add keys to `src/config.js` `module.exports = {...}` block

Add inside the exported object (place near other numeric env parses):
```js
sessionSecret: process.env.SESSION_SECRET || "",
vncPortRangeStart: Number(process.env.VNC_PORT_RANGE_START || 5901),
vncPortRangeEnd: Number(process.env.VNC_PORT_RANGE_END || 5920),
novncPortRangeStart: Number(process.env.NOVNC_PORT_RANGE_START || 6080),
novncPortRangeEnd: Number(process.env.NOVNC_PORT_RANGE_END || 6099),
vncSessionTtlSeconds: Number(process.env.VNC_SESSION_TTL_SECONDS || 900),
vncMaxConcurrent: Number(process.env.VNC_MAX_CONCURRENT || 3),
```

- [ ] **Step 4:** Add test — extend `test/config-example.test.js` if it exists, else add new asserts:

Write test file `test/config-vnc.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert/strict");

test("config exposes vnc port ranges with defaults", () => {
  delete process.env.VNC_PORT_RANGE_START;
  delete process.env.VNC_PORT_RANGE_END;
  delete require.cache[require.resolve("../src/config")];
  const config = require("../src/config");
  assert.equal(config.vncPortRangeStart, 5901);
  assert.equal(config.vncPortRangeEnd, 5920);
  assert.equal(config.novncPortRangeStart, 6080);
  assert.equal(config.novncPortRangeEnd, 6099);
  assert.equal(config.vncSessionTtlSeconds, 900);
  assert.equal(config.vncMaxConcurrent, 3);
});

test("config sessionSecret empty by default", () => {
  delete process.env.SESSION_SECRET;
  delete require.cache[require.resolve("../src/config")];
  const config = require("../src/config");
  assert.equal(config.sessionSecret, "");
});
```

- [ ] **Step 5:** Run test — expect PASS after step 3 changes applied

Run: `npm test -- test/config-vnc.test.js`
Expected: 2 pass.

- [ ] **Step 6:** Commit

```bash
git add .env.example src/config.js test/config-vnc.test.js
git commit -m "feat(config): add session secret and VNC port range env vars"
```

---

### Task 0.4: Extend `scripts/doctor.js` for VNC stack

**Files:**
- Modify: `scripts/doctor.js`

- [ ] **Step 1:** Read existing doctor

Use `read_file(path="scripts/doctor.js")` and note how existing checks are structured (function names, output format).

- [ ] **Step 2:** Add helper (top-level) and check

Add near existing helpers:
```js
const { execSync } = require("node:child_process");

function hasBinary(name) {
  try {
    execSync(`command -v ${name}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function checkVncStack() {
  const required = ["Xvfb", "x11vnc", "fluxbox", "websockify"];
  const missing = required.filter((bin) => !hasBinary(bin));
  const noVncPath = ["/usr/share/novnc", "/usr/share/novnc-common"].find((p) => {
    try { require("node:fs").accessSync(p); return true; } catch { return false; }
  });
  return { missing, noVncPath: noVncPath || null };
}
```

- [ ] **Step 3:** Wire into the doctor's main flow

Find the section that prints checks. Add a block:
```js
const vnc = checkVncStack();
if (vnc.missing.length === 0 && vnc.noVncPath) {
  console.log("✓ VNC stack: Xvfb, x11vnc, fluxbox, websockify present; noVNC at", vnc.noVncPath);
} else {
  console.log("✗ VNC stack incomplete");
  if (vnc.missing.length) {
    console.log("  Missing binaries:", vnc.missing.join(", "));
    console.log("  Install: sudo apt install -y", ["xvfb", "x11vnc", "fluxbox", "websockify", "novnc"].join(" "));
  }
  if (!vnc.noVncPath) {
    console.log("  noVNC assets not found under /usr/share/novnc — install `novnc` package");
  }
}
```

- [ ] **Step 4:** Run doctor

Run: `npm run doctor`
Expected: prints VNC stack line (either ✓ or ✗ depending on system).

- [ ] **Step 5:** Commit

```bash
git add scripts/doctor.js
git commit -m "feat(doctor): report VNC stack binaries and noVNC asset presence"
```

---

### Task 0.5: Create `data/` directory placeholder

**Files:**
- Create: `data/.gitkeep`
- Modify: `.gitignore` (append)

- [ ] **Step 1:** Create dir + placeholder

```bash
mkdir -p data
touch data/.gitkeep
```

- [ ] **Step 2:** Append to `.gitignore`

Append lines (verify not already present):
```
# Local dashboard state (never commit)
data/auth.json
data/workspaces.json
data/connections.json
data/.migration-backup/
```

- [ ] **Step 3:** Commit

```bash
git add data/.gitkeep .gitignore
git commit -m "chore(data): reserve data/ dir and ignore local state files"
```

---

### Task 0.6: Push branch, open draft PR

- [ ] **Step 1:** Push

Run: `git push -u origin feat/auth-workspaces-novnc`

- [ ] **Step 2:** Open draft PR (body-file to avoid quoting issues per `gh-cli-body-quoting` skill)

Write body to `/tmp/pr-body.md`:
```
Refs SCRUM-19

Implements dashboard auth gate, flat workspaces with multi-account platform connections, and per-connection noVNC session (see design spec).

Spec: docs/superpowers/specs/2026-09-09-auth-and-workspaces-design.md
Plan: docs/superpowers/plans/2026-09-09-auth-workspaces-novnc/README.md

Draft — phases 0–7 land as separate commits.
```

Run:
```bash
gh pr create --draft --base main --head feat/auth-workspaces-novnc \
  --title "feat: dashboard auth + workspaces + noVNC connect (SCRUM-19)" \
  --body-file /tmp/pr-body.md
```
Expected: PR URL printed.

- [ ] **Step 3:** Copy PR URL, comment on Jira SCRUM-19 with the link (via mcp jira_add_comment).

---

Phase 0 done. Proceed to `phase-1-auth-store.md`.
