const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function id() {
  return "ws_" + crypto.randomBytes(6).toString("hex");
}

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

function createStore(filePath) {
  async function load() {
    return (await readJson(filePath)) || { activeWorkspaceId: null, workspaces: [] };
  }

  return {
    async list() { return (await load()).workspaces; },
    async getActiveId() { return (await load()).activeWorkspaceId; },
    async get(id) { return (await load()).workspaces.find((w) => w.id === id) || null; },

    async create(label) {
      const data = await load();
      const ws = { id: id(), label: String(label || "Untitled").slice(0, 80), createdAt: new Date().toISOString() };
      data.workspaces.push(ws);
      if (!data.activeWorkspaceId) data.activeWorkspaceId = ws.id;
      await writeAtomic(filePath, data);
      return ws;
    },

    async rename(id, label) {
      const data = await load();
      const ws = data.workspaces.find((w) => w.id === id);
      if (!ws) throw new Error("NOT_FOUND");
      ws.label = String(label).slice(0, 80);
      await writeAtomic(filePath, data);
      return ws;
    },

    async remove(id) {
      const data = await load();
      data.workspaces = data.workspaces.filter((w) => w.id !== id);
      if (data.activeWorkspaceId === id) {
        data.activeWorkspaceId = data.workspaces[0]?.id || null;
      }
      await writeAtomic(filePath, data);
    },

    async setActive(id) {
      const data = await load();
      if (!data.workspaces.find((w) => w.id === id)) throw new Error("NOT_FOUND");
      data.activeWorkspaceId = id;
      await writeAtomic(filePath, data);
    },
  };
}

module.exports = { createStore };
