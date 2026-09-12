const AUTH_PREFIX = "/auth/";
const PUBLIC_STATIC = new Set([
  "/style.css",
  "/app.js",
  "/favicon.ico",
]);
const PUBLIC_STATIC_PREFIXES = ["/auth/"];

function isAuthPath(p) {
  return p === "/auth" || p.startsWith(AUTH_PREFIX);
}

function isPublicAsset(p) {
  if (PUBLIC_STATIC.has(p)) return true;
  return PUBLIC_STATIC_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function requireAuth(req, res, next) {
  if (isAuthPath(req.path) || isPublicAsset(req.path)) {
    return next();
  }
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  }
  const back = encodeURIComponent(req.originalUrl || req.path);
  return res.redirect(`/auth/login?return=${back}`);
}

module.exports = { requireAuth, isAuthPath, isPublicAsset };
