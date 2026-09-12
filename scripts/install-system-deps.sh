#!/usr/bin/env bash
# AutoSocial -- install system dependencies for headless browser + noVNC session flow.
#
# Called by:
#   - Developer/operator on first deploy
#   - CI/CD as a preflight step (Debian/Ubuntu VPS)
#
# Idempotent: skips packages already installed.
#
# Usage:
#   sudo bash scripts/install-system-deps.sh

set -euo pipefail

PACKAGES=(
  xvfb          # virtual X server for headless browser rendering
  x11vnc        # VNC server exporting the Xvfb display
  fluxbox       # minimal window manager (keeps browser windowed)
  websockify    # websocket-to-tcp bridge for noVNC
  novnc         # HTML5 VNC client (static assets under /usr/share/novnc)
)

log() { printf '[install-system-deps] %s\n' "$*"; }

if [[ ${EUID} -ne 0 ]]; then
  log "ERROR: run as root (use sudo)."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  log "ERROR: apt-get not found. This script targets Debian/Ubuntu."
  log "       On other systems install the equivalents of: ${PACKAGES[*]}"
  exit 1
fi

log "Refreshing apt index..."
apt-get update -qq

log "Installing packages: ${PACKAGES[*]}"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${PACKAGES[@]}"

log "Verifying binaries on PATH..."
FAIL=0
for bin in Xvfb x11vnc fluxbox websockify; do
  if command -v "${bin}" >/dev/null 2>&1; then
    log "  [OK] ${bin}"
  else
    log "  [FAIL] ${bin} NOT on PATH"
    FAIL=1
  fi
done

if [[ -f /usr/share/novnc/vnc.html ]]; then
  log "  [OK] noVNC assets at /usr/share/novnc"
else
  log "  [FAIL] noVNC assets missing (expected /usr/share/novnc/vnc.html)"
  FAIL=1
fi

if [[ ${FAIL} -ne 0 ]]; then
  log "One or more dependencies failed verification."
  exit 1
fi

log "All system dependencies installed."
log "Run 'npm run doctor' to verify the AutoSocial stack."
