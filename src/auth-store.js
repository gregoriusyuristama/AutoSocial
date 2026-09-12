const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const RESET_TTL_MS = 30 * 60 * 1000;

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeJsonAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

function createStore(filePath) {
  async function load() {
    const data = (await readJson(filePath)) || {};
    return data;
  }

  return {
    async hasAdmin() {
      const data = await load();
      return Boolean(data && data.admin && data.admin.username);
    },

    async createAdmin(username, password) {
      const data = await load();
      if (data.admin && data.admin.username) {
        throw new Error("ADMIN_EXISTS");
      }
      if (!username || !password || password.length < 8) {
        throw new Error("INVALID_INPUT");
      }
      data.admin = {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        createdAt: new Date().toISOString(),
        resetToken: null,
        resetTokenExpiresAt: null,
      };
      await writeJsonAtomic(filePath, data);
    },

    async verifyCredentials(username, password) {
      const data = await load();
      if (!data.admin || data.admin.username !== username) return false;
      try {
        return await bcrypt.compare(password, data.admin.passwordHash);
      } catch { return false; }
    },

    async issueResetToken(username) {
      const data = await load();
      if (!data.admin || data.admin.username !== username) {
        throw new Error("INVALID_CREDENTIALS");
      }
      const token = crypto.randomBytes(32).toString("hex");
      data.admin.resetToken = token;
      data.admin.resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      await writeJsonAtomic(filePath, data);
      return token;
    },

    async consumeResetToken(token, newPassword) {
      const data = await load();
      if (!data.admin || !data.admin.resetToken || data.admin.resetToken !== token) {
        throw new Error("INVALID_TOKEN");
      }
      if (new Date(data.admin.resetTokenExpiresAt).getTime() < Date.now()) {
        throw new Error("INVALID_TOKEN");
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error("INVALID_INPUT");
      }
      data.admin.passwordHash = await bcrypt.hash(newPassword, 12);
      data.admin.resetToken = null;
      data.admin.resetTokenExpiresAt = null;
      await writeJsonAtomic(filePath, data);
    },
  };
}

module.exports = { createStore };
