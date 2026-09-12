# Phase 5 — Dashboard UI: Workspace Switcher + Connections View

**Goal:** Add workspace switcher header, connections list view (grouped by platform), and hook create/rename/delete flows.

Existing `web/index.html` and `web/app.js` hold the current single-account UI. Refactor incrementally to preserve existing daemon controls.

---

### Task 5.1: Static partials — `web/partials/workspace-switcher.html` + `connect-modal.html`

**Files:**
- Create: `web/partials/workspace-switcher.html`
- Create: `web/partials/connect-modal.html`

- [ ] **Step 1:** Write `web/partials/workspace-switcher.html`:

```html
<div id="workspace-switcher" class="relative inline-block text-left">
  <button id="ws-switcher-btn" type="button"
          class="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm hover:bg-white/10 transition-all duration-300">
    <span id="ws-switcher-label" class="font-medium">Loading…</span>
    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 7.5l4.5 4.5 4.5-4.5z"/></svg>
  </button>
  <div id="ws-switcher-menu"
       class="hidden absolute right-0 mt-2 w-64 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/10 shadow-xl z-40 transition-all duration-300">
    <ul id="ws-switcher-list" class="py-2 max-h-72 overflow-y-auto"></ul>
    <div class="border-t border-white/10 py-2">
      <button id="ws-switcher-new" class="w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors">+ New workspace</button>
      <button id="ws-switcher-manage" class="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-white/5 transition-colors">Manage workspaces…</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2:** Write `web/partials/connect-modal.html`:

```html
<div id="connect-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
  <div class="relative w-full max-w-3xl rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl overflow-hidden transition-all duration-300">
    <header class="flex items-center justify-between px-6 py-4 border-b border-white/10">
      <h2 id="connect-modal-title" class="text-lg font-semibold">Connect account</h2>
      <button id="connect-modal-close" class="text-slate-400 hover:text-white transition-colors">✕</button>
    </header>
    <div class="p-6 space-y-4">
      <div>
        <label class="block text-sm mb-1" for="connect-label">Label</label>
        <input id="connect-label" type="text" placeholder="e.g. @fitbrand_id"
               class="w-full rounded-xl bg-slate-800/60 border border-white/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300" />
      </div>
      <div id="connect-status" class="text-sm text-slate-400">Waiting to start…</div>
      <div id="connect-vnc-wrap" class="hidden">
        <div class="aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
          <iframe id="connect-vnc-iframe" class="w-full h-full" allow="clipboard-read; clipboard-write" title="Virtual browser"></iframe>
        </div>
        <div id="connect-countdown" class="mt-2 text-xs text-slate-400">Session expires in ...</div>
      </div>
    </div>
    <footer class="flex justify-end gap-2 px-6 py-4 border-t border-white/10">
      <button id="connect-cancel-btn"
              class="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm hover:bg-white/10 transition-all duration-300">Cancel</button>
      <button id="connect-save-btn"
              class="rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2 transition-all duration-300 shadow-lg disabled:opacity-50"
              disabled>Save Session</button>
    </footer>
  </div>
</div>
```

- [ ] **Step 3:** Commit

```bash
git add web/partials/workspace-switcher.html web/partials/connect-modal.html
git commit -m "feat(ui): workspace switcher and connect modal partials"
```

---

### Task 5.2: Serve partials from Express

**Files:**
- Modify: `src/dashboard-server.js`

- [ ] **Step 1:** After `express.static(webDir)`, add:

```js
app.use("/partials", express.static(path.join(webDir, "partials")));
```

- [ ] **Step 2:** Manual smoke

Run: `PORT=3031 SESSION_SECRET=$(openssl rand -hex 32) npm start &` then `sleep 2`.
Run: `curl -s http://127.0.0.1:3031/partials/workspace-switcher.html | head -1`
Expected: `<div id="workspace-switcher"...`
Kill: `kill %1`

- [ ] **Step 3:** Commit

```bash
git add src/dashboard-server.js
git commit -m "feat(server): expose /partials static route"
```

---

### Task 5.3: Inject workspace switcher into `web/index.html` header

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`

- [ ] **Step 1:** In `web/index.html`, add a placeholder `<div id="workspace-switcher-slot"></div>` in the top-right of the existing header. Add a top-right avatar + logout button:

```html
<div class="flex items-center gap-3">
  <div id="workspace-switcher-slot"></div>
  <button id="logout-btn" class="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm hover:bg-white/10 transition-all duration-300">Logout</button>
</div>
```

- [ ] **Step 2:** In `web/app.js`, add near the top-level bootstrap:

```js
async function loadWorkspaceSwitcher() {
  const html = await (await fetch("/partials/workspace-switcher.html")).text();
  const slot = document.getElementById("workspace-switcher-slot");
  if (slot) slot.innerHTML = html;

  const btn = document.getElementById("ws-switcher-btn");
  const menu = document.getElementById("ws-switcher-menu");
  const label = document.getElementById("ws-switcher-label");
  const list = document.getElementById("ws-switcher-list");
  const newBtn = document.getElementById("ws-switcher-new");

  async function refresh() {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    const active = data.workspaces.find((w) => w.id === data.activeWorkspaceId) || data.workspaces[0];
    label.textContent = active ? active.label : "No workspace";
    list.innerHTML = "";
    for (const ws of data.workspaces) {
      const li = document.createElement("li");
      li.className = "px-4 py-2 text-sm hover:bg-white/5 cursor-pointer flex items-center justify-between transition-colors";
      li.textContent = ws.label;
      if (ws.id === (data.activeWorkspaceId || active?.id)) {
        const check = document.createElement("span");
        check.textContent = "✓";
        check.className = "text-indigo-400";
        li.appendChild(check);
      }
      li.addEventListener("click", async () => {
        await fetch(`/api/workspaces/${ws.id}/activate`, { method: "POST" });
        window.location.reload();
      });
      list.appendChild(li);
    }
  }

  btn.addEventListener("click", () => menu.classList.toggle("hidden"));
  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add("hidden");
  });
  newBtn.addEventListener("click", async () => {
    const name = prompt("Workspace name?");
    if (!name) return;
    await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: name }) });
    await refresh();
  });
  await refresh();
}

document.getElementById("logout-btn")?.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  window.location.href = "/auth/login";
});

loadWorkspaceSwitcher();
```

- [ ] **Step 3:** Manual smoke — start server, log in, verify switcher renders with the default workspace.

- [ ] **Step 4:** Commit

```bash
git add web/index.html web/app.js
git commit -m "feat(ui): mount workspace switcher and logout in dashboard header"
```

---

### Task 5.4: Connections view — replaces existing single-account panel

**Files:**
- Modify: `web/index.html` (add connections section)
- Modify: `web/app.js` (add renderer + handlers)

- [ ] **Step 1:** Add to `web/index.html` where the old accounts panel lives:

```html
<section id="connections-section" class="rounded-2xl bg-white/5 border border-white/10 p-6 mt-6 backdrop-blur-md">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold">Connections</h2>
    <button id="connect-btn" class="rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2 transition-all duration-300 shadow-lg">+ Connect Account</button>
  </div>
  <div id="connections-list" class="space-y-4">Loading…</div>
</section>

<div id="connect-modal-slot"></div>
```

- [ ] **Step 2:** In `web/app.js` add:

```js
const PLATFORM_LABEL = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
const PLATFORM_ICON = { tiktok: "🎵", instagram: "📷", youtube: "▶" };

async function renderConnections() {
  const listEl = document.getElementById("connections-list");
  const res = await fetch("/api/connections");
  const data = await res.json();
  const grouped = { tiktok: [], instagram: [], youtube: [] };
  for (const c of data.connections) grouped[c.platform]?.push(c);

  listEl.innerHTML = "";
  for (const platform of ["tiktok", "instagram", "youtube"]) {
    const wrap = document.createElement("div");
    wrap.className = "rounded-xl bg-white/5 border border-white/10 p-4 transition-all duration-300";
    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-2";
    header.innerHTML = `<h3 class="font-semibold">${PLATFORM_ICON[platform]} ${PLATFORM_LABEL[platform]}</h3>`;
    const addBtn = document.createElement("button");
    addBtn.className = "text-sm text-indigo-300 hover:text-indigo-200 transition-colors";
    addBtn.textContent = "+ Add";
    addBtn.dataset.platform = platform;
    addBtn.addEventListener("click", () => openConnectModal(platform));
    header.appendChild(addBtn);
    wrap.appendChild(header);

    if (grouped[platform].length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-sm text-slate-400";
      empty.textContent = "No connections yet.";
      wrap.appendChild(empty);
    } else {
      const ul = document.createElement("ul");
      ul.className = "space-y-1";
      for (const conn of grouped[platform]) {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/10";
        li.innerHTML = `<span>${conn.label} ${conn.sessionSaved ? '<span class="text-emerald-400">✓</span>' : '<span class="text-amber-400">⚠</span>'}</span>`;
        const actions = document.createElement("div");
        actions.className = "flex gap-2";
        const reconnect = document.createElement("button");
        reconnect.className = "text-xs text-indigo-300 hover:text-indigo-200 transition-colors";
        reconnect.textContent = conn.sessionSaved ? "Reconnect" : "Connect";
        reconnect.addEventListener("click", () => openConnectModal(platform, conn.id, conn.label));
        actions.appendChild(reconnect);
        const del = document.createElement("button");
        del.className = "text-xs text-rose-300 hover:text-rose-200 transition-colors";
        del.textContent = "Delete";
        del.addEventListener("click", async () => {
          if (!confirm(`Delete ${conn.label}?`)) return;
          await fetch(`/api/connections/${conn.id}`, { method: "DELETE" });
          await renderConnections();
        });
        actions.appendChild(del);
        li.appendChild(actions);
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    }
    listEl.appendChild(wrap);
  }
}

document.getElementById("connect-btn")?.addEventListener("click", () => {
  const platform = prompt("Platform? (tiktok/instagram/youtube)", "tiktok");
  if (platform) openConnectModal(platform);
});

renderConnections();
```

*(`openConnectModal` implemented in Phase 6.)*

- [ ] **Step 3:** Add a stub `function openConnectModal(){ alert('coming in phase 6'); }` for now to avoid a runtime error.

- [ ] **Step 4:** Manual smoke — dashboard shows 3 platform sections with empty state.

- [ ] **Step 5:** Commit

```bash
git add web/index.html web/app.js
git commit -m "feat(ui): connections view grouped by platform"
```

---

Phase 5 done. Proceed to `phase-6-vnc-and-connect-modal.md`.
