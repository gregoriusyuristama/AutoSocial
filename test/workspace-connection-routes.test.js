const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildWorkspaceRouter, buildConnectionRouter } = require("../src/dashboard-server");

async function withApp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-routes-"));
  const express = require("express");
  const app = express();
  app.use(express.json());
  const workspaceStore = require("../src/workspace-store").createStore(path.join(dir, "workspaces.json"));
  const connectionStore = require("../src/connection-store").createStore(path.join(dir, "connections.json"));
  // Fake session middleware
  const session = { userId: "admin", activeWorkspaceId: null };
  app.use((req, _res, next) => { req.session = session; next(); });
  app.locals.connectionStoreForCheck = connectionStore;
  app.use(buildWorkspaceRouter(workspaceStore));
  app.use(buildConnectionRouter(connectionStore, workspaceStore));
  const server = app.listen(0);
  try { await fn(server.address().port, { workspaceStore, connectionStore, session }); }
  finally {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json" } }, (res) => {
      let data = ""; res.on("data", (c) => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

test("workspace CRUD lifecycle", async () => {
  await withApp(async (port) => {
    const create = await req(port, "POST", "/api/workspaces", { label: "Fitness" });
    assert.equal(create.status, 200);
    const wsId = create.body.workspace.id;
    const list = await req(port, "GET", "/api/workspaces");
    assert.equal(list.body.workspaces.length, 1);
    const rename = await req(port, "PATCH", `/api/workspaces/${wsId}`, { label: "Fitness Brand" });
    assert.equal(rename.body.workspace.label, "Fitness Brand");
    const del = await req(port, "DELETE", `/api/workspaces/${wsId}`);
    assert.equal(del.status, 200);
  });
});

test("cannot delete workspace with connections", async () => {
  await withApp(async (port, { session }) => {
    const c = await req(port, "POST", "/api/workspaces", { label: "W" });
    const wsId = c.body.workspace.id;
    session.activeWorkspaceId = wsId;
    await req(port, "POST", "/api/connections", { platform: "tiktok", label: "A" });
    const del = await req(port, "DELETE", `/api/workspaces/${wsId}`);
    assert.equal(del.status, 409);
    assert.equal(del.body.error, "WORKSPACE_NOT_EMPTY");
  });
});

test("connection create/list/rename/delete scoped to active workspace", async () => {
  await withApp(async (port, { session }) => {
    const c = await req(port, "POST", "/api/workspaces", { label: "W" });
    session.activeWorkspaceId = c.body.workspace.id;
    const created = await req(port, "POST", "/api/connections", { platform: "tiktok", label: "A" });
    assert.equal(created.status, 200);
    const list = await req(port, "GET", "/api/connections");
    assert.equal(list.body.connections.length, 1);
    const connId = created.body.connection.id;
    const renamed = await req(port, "PATCH", `/api/connections/${connId}`, { label: "AA" });
    assert.equal(renamed.body.connection.label, "AA");
    const del = await req(port, "DELETE", `/api/connections/${connId}`);
    assert.equal(del.status, 200);
  });
});
