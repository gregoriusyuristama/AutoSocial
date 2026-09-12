const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveConnection } = require("../src/connection-resolver");

function fakeStore(conns) {
  return {
    async listByWorkspace(wsId) { return conns.filter((c) => c.workspaceId === wsId); },
    async get(id) { return conns.find((c) => c.id === id) || null; },
  };
}
function fakeWorkspaceStore(activeId) {
  return { getActiveId: async () => activeId };
}

test("returns connection when connectionId supplied", async () => {
  const conns = [{ id: "conn_a", workspaceId: "ws_1", platform: "tiktok", profileDir: "p1" }];
  const conn = await resolveConnection({
    connectionStore: fakeStore(conns),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    connectionId: "conn_a",
    platform: "tiktok",
    session: {},
  });
  assert.equal(conn.id, "conn_a");
});

test("auto-selects when workspace has exactly one connection of that platform", async () => {
  const conns = [
    { id: "conn_a", workspaceId: "ws_1", platform: "tiktok", profileDir: "p1" },
    { id: "conn_b", workspaceId: "ws_1", platform: "instagram", profileDir: "p2" },
  ];
  const conn = await resolveConnection({
    connectionStore: fakeStore(conns),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    platform: "tiktok",
    session: {},
  });
  assert.equal(conn.id, "conn_a");
});

test("throws CONNECTION_ID_REQUIRED when multiple exist for platform", async () => {
  const conns = [
    { id: "conn_a", workspaceId: "ws_1", platform: "tiktok", profileDir: "p1" },
    { id: "conn_c", workspaceId: "ws_1", platform: "tiktok", profileDir: "p3" },
  ];
  await assert.rejects(() => resolveConnection({
    connectionStore: fakeStore(conns),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    platform: "tiktok",
    session: {},
  }), /CONNECTION_ID_REQUIRED/);
});

test("throws NO_CONNECTION when none for platform", async () => {
  await assert.rejects(() => resolveConnection({
    connectionStore: fakeStore([]),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    platform: "tiktok",
    session: {},
  }), /NO_CONNECTION/);
});

test("throws NOT_FOUND when connectionId doesn't exist", async () => {
  await assert.rejects(() => resolveConnection({
    connectionStore: fakeStore([]),
    workspaceStore: fakeWorkspaceStore("ws_1"),
    connectionId: "conn_missing",
    platform: "tiktok",
    session: {},
  }), /NOT_FOUND/);
});
