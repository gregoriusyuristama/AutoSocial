const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PLATFORMS = new Set(["tiktok", "instagram", "youtube"]);

function id() { return "conn_" + crypto.randomBytes(6).toString("hex"); }

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (err) { if (err.code === "ENOENT") return null; throw err; }
}

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

function createStore(filePath, opts = {}) {
  const profileRoot = opts.profileRoot || ".profiles";

  async function load() {
    return (await readJson(filePath)) || { connections: [] };
  }

  return {
    async listAll() { return (await load()).connections; },
    async listByWorkspace(workspaceId) {
      return (await load()).connections.filter((c) => c.workspaceId === workspaceId);
    },
    async get(id) { return (await load()).connections.find((c) => c.id === id) || null; },
    async workspaceHasConnections(workspaceId) {
      return (await load()).connections.some((c) => c.workspaceId === workspaceId);
    },

    async create({ workspaceId, platform, label }) {
      if (!PLATFORMS.has(platform)) throw new Error("INVALID_PLATFORM");
      if (!workspaceId) throw new Error("INVALID_INPUT");
      const data = await load();
      const conn = {
        id: id(),
        workspaceId,
        platform,
        label: String(label || `${platform} account`).slice(0, 80),
        profileDir: null,
        connectedAt: null,
        sessionSaved: false,
        lastVerifiedAt: null,
      };
      conn.profileDir = path.posix.join(profileRoot, workspaceId, conn.id, platform);
      data.connections.push(conn);
      await writeAtomic(filePath, data);
      return conn;
    },

    async rename(id, label) {
      const data = await load();
      const conn = data.connections.find((c) => c.id === id);
      if (!conn) throw new Error("NOT_FOUND");
      conn.label = String(label).slice(0, 80);
      await writeAtomic(filePath, data);
      return conn;
    },

    async markSessionSaved(id) {
      const data = await load();
      const conn = data.connections.find((c) => c.id === id);
      if (!conn) throw new Error("NOT_FOUND");
      conn.sessionSaved = true;
      conn.connectedAt = conn.connectedAt || new Date().toISOString();
      conn.lastVerifiedAt = new Date().toISOString();
      await writeAtomic(filePath, data);
      return conn;
    },

    async remove(id) {
      const data = await load();
      data.connections = data.connections.filter((c) => c.id !== id);
      await writeAtomic(filePath, data);
    },
  };
}

module.exports = { createStore, PLATFORMS: Array.from(PLATFORMS) };
