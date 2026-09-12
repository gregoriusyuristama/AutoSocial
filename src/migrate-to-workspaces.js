const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PLATFORMS = ["tiktok", "instagram", "youtube"];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function runMigration({ projectRoot }) {
  const legacyState = path.join(projectRoot, "accounts-state.json");
  const legacyProfiles = path.join(projectRoot, ".profiles", "default");
  const dataDir = path.join(projectRoot, "data");
  const wsFile = path.join(dataDir, "workspaces.json");
  const connFile = path.join(dataDir, "connections.json");

  if (await exists(wsFile) || !(await exists(legacyState))) {
    return { migrated: false };
  }

  await fs.mkdir(dataDir, { recursive: true });

  // Backup
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(dataDir, ".migration-backup", stamp);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(legacyState, path.join(backupDir, "accounts-state.json")).catch(() => {});

  // Workspace
  const workspaceId = "ws_default";
  await fs.writeFile(wsFile, JSON.stringify({
    activeWorkspaceId: workspaceId,
    workspaces: [{ id: workspaceId, label: "My Brand", createdAt: new Date().toISOString() }],
  }, null, 2));

  // Connections
  const connections = [];
  for (const platform of PLATFORMS) {
    const src = path.join(legacyProfiles, platform);
    if (!(await exists(src))) continue;
    const connId = "conn_" + crypto.randomBytes(6).toString("hex");
    const destRel = path.posix.join(".profiles", workspaceId, connId, platform);
    const destAbs = path.join(projectRoot, destRel);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.rename(src, destAbs);
    connections.push({
      id: connId,
      workspaceId,
      platform,
      label: `${platform} (migrated)`,
      profileDir: path.posix.join(".profiles", workspaceId, connId, platform),
      connectedAt: new Date().toISOString(),
      sessionSaved: true,
      lastVerifiedAt: null,
    });
  }
  await fs.writeFile(connFile, JSON.stringify({ connections }, null, 2));

  return { migrated: true, workspaceId, connectionCount: connections.length };
}

module.exports = { runMigration };
