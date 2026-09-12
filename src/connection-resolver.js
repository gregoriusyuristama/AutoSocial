async function resolveConnection({ connectionStore, workspaceStore, connectionId, platform, session }) {
  if (connectionId) {
    const conn = await connectionStore.get(connectionId);
    if (!conn) throw new Error("NOT_FOUND");
    if (conn.platform !== platform) throw new Error("INVALID_PLATFORM");
    return conn;
  }
  const wsId = (session && session.activeWorkspaceId) || (await workspaceStore.getActiveId());
  if (!wsId) throw new Error("NO_ACTIVE_WORKSPACE");
  const matches = (await connectionStore.listByWorkspace(wsId)).filter((c) => c.platform === platform);
  if (matches.length === 0) throw new Error("NO_CONNECTION");
  if (matches.length > 1) throw new Error("CONNECTION_ID_REQUIRED");
  return matches[0];
}

module.exports = { resolveConnection };
