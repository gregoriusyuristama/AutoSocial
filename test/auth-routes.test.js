const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildAuthRouter } = require("../src/dashboard-server");

async function withServer(store, fn) {
  const express = require("express");
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  const cookieSession = require("cookie-session");
  app.use(cookieSession({ name: "s", keys: ["testkey"], maxAge: 3600e3 }));
  app.use(buildAuthRouter(store));
  const server = app.listen(0);
  try { await fn(server.address().port); }
  finally { server.close(); }
}

function request(port, method, path, body, cookies) {
  return new Promise((resolve, reject) => {
    const headers = { "content-type": "application/json" };
    if (cookies) headers.cookie = cookies;
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("POST /auth/setup creates admin then rejects second call", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auth-routes-"));
  const store = require("../src/auth-store").createStore(path.join(tmp, "auth.json"));
  await withServer(store, async (port) => {
    const r1 = await request(port, "POST", "/auth/setup", { username: "g", password: "secret12" });
    assert.equal(r1.status, 302);
    const r2 = await request(port, "POST", "/auth/setup", { username: "g", password: "secret12" });
    assert.equal(r2.status, 409);
  });
  await fs.rm(tmp, { recursive: true, force: true });
});

test("POST /auth/login sets session cookie on valid credentials", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auth-routes-"));
  const store = require("../src/auth-store").createStore(path.join(tmp, "auth.json"));
  await store.createAdmin("g", "secret12");
  await withServer(store, async (port) => {
    const bad = await request(port, "POST", "/auth/login", { username: "g", password: "wrong" });
    assert.equal(bad.status, 401);
    const good = await request(port, "POST", "/auth/login", { username: "g", password: "secret12" });
    assert.equal(good.status, 302);
    assert.match(good.headers["set-cookie"].join(","), /s=/);
  });
  await fs.rm(tmp, { recursive: true, force: true });
});
