# AutoSocial Auth + Workspaces + noVNC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dashboard auth gate, flat workspaces with multi-account platform connections, and per-connection noVNC session so any browser on the LAN can log in to TikTok/IG/YT (fixes headed-browser 400 on headless Linux host).

**Architecture:** Express middleware protects routes with cookie-session + bcrypt admin credential. `data/{workspaces,connections}.json` JSON stores replace single-account state via migration. `src/vnc-session-manager.js` spawns per-connection Xvfb + x11vnc + websockify + Chromium; dashboard embeds noVNC iframe until user saves cookies.

**Tech Stack:** Node 18+, Express 5, Playwright, Tailwind (CDN), bcryptjs, cookie-session, Xvfb, x11vnc, fluxbox, websockify, noVNC.

**Spec:** `docs/superpowers/specs/2026-09-09-auth-and-workspaces-design.md`
**Jira:** SCRUM-19

---

## Phase Breakdown

Plan split across phase files for context safety. Execute in order:

1. **Phase 0** — Prep: dependencies, env, doctor, worktree. See `phase-0-prep.md`.
2. **Phase 1** — Auth store + middleware. See `phase-1-auth-store.md`.
3. **Phase 2** — Auth HTML/JS forms. See `phase-2-auth-forms.md`.
4. **Phase 3** — Workspace + connection stores + migration. See `phase-3-workspaces-migration.md`.
5. **Phase 4** — Refactor platform uploaders to accept `connectionId`. See `phase-4-uploader-refactor.md`.
6. **Phase 5** — Dashboard UI: workspace switcher + connections view. See `phase-5-dashboard-ui.md`.
7. **Phase 6** — VNC session manager + connect modal (final piece). See `phase-6-vnc-and-connect-modal.md`.
8. **Phase 7** — Doctor, SETUP.md, manual test checklist, release. See `phase-7-release.md`.

Each phase file follows the same task template: TDD (write test → verify fail → implement → verify pass → commit), exact file paths, exact commands, complete code — no placeholders.

## Global Conventions

- Every task ends with a git commit. Commit messages: `feat(<area>): ...`, `test(<area>): ...`, `refactor(<area>): ...`, `docs(<area>): ...`.
- Branch: dedicated feature branch `feat/auth-workspaces-novnc` off `main` (dual-branch release flow will merge to `release` when Phase 7 done).
- Never push to `main` or `release` directly — PRs only.
- Every JSON store module uses async fs, JSON.parse, atomic write (write to `.tmp` then rename).
- All auth-related passwords hashed via `bcryptjs` with cost factor 12.
- All test files: `test/<module>.test.js`, use `node:test` + `node:assert/strict` (matches existing convention).

## Self-Review Checklist (fill after all phases written)

- [ ] Spec coverage: every requirement in `2026-09-09-auth-and-workspaces-design.md` maps to a task.
- [ ] No placeholder text (TBD, TODO, "add error handling", etc.).
- [ ] Type/method names consistent across phases.
- [ ] All file paths absolute or clearly relative to project root `/home/ichhoo/Documents/AutoSocial/`.
- [ ] Every code step shows full code, not a diff summary.
- [ ] Every test step shows the expected pass/fail state.
