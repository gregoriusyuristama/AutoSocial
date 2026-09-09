const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAuth, isAuthPath, isPublicAsset } = require("../src/auth-middleware");

function mockReq({ path, method = "GET", session = null }) {
  return {
    path,
    method,
    session,
    accepts: (t) => t === "html",
    originalUrl: path,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    redirected: null,
  };
  res.status = (n) => (res.statusCode = n, res);
  res.json = (o) => (res.body = o, res);
  res.redirect = (loc) => (res.redirected = loc, res);
  return res;
}

test("isAuthPath detects /auth prefixes", () => {
  assert.equal(isAuthPath("/auth/login"), true);
  assert.equal(isAuthPath("/auth/setup"), true);
  assert.equal(isAuthPath("/api/status"), false);
});

test("isPublicAsset covers static assets", () => {
  assert.equal(isPublicAsset("/style.css"), true);
  assert.equal(isPublicAsset("/app.js"), true);
  assert.equal(isPublicAsset("/auth/login.js"), true);
  assert.equal(isPublicAsset("/api/accounts"), false);
});

test("requireAuth allows auth paths without session", (t, done) => {
  const req = mockReq({ path: "/auth/login" });
  const res = mockRes();
  requireAuth(req, res, () => { done(); });
});

test("requireAuth returns 401 JSON for unauth /api", () => {
  const req = mockReq({ path: "/api/status" });
  const res = mockRes();
  requireAuth(req, res, () => { throw new Error("next called"); });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "AUTH_REQUIRED");
});

test("requireAuth redirects unauth page loads to /auth/login with return", () => {
  const req = mockReq({ path: "/settings" });
  const res = mockRes();
  requireAuth(req, res, () => { throw new Error("next called"); });
  assert.equal(res.redirected, "/auth/login?return=%2Fsettings");
});

test("requireAuth allows authed request", (t, done) => {
  const req = mockReq({ path: "/api/status", session: { userId: "admin" } });
  const res = mockRes();
  requireAuth(req, res, () => { done(); });
});
