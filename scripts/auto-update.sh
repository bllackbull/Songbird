#!/usr/bin/env bash
# Songbird auto-update script
# Pulls the latest release from GitHub and redeploys via Docker Compose.
# Designed to be triggered by the webhook server or run manually.
#
# Usage:
#   ./scripts/auto-update.sh [--tag v1.2.3]
#
# Environment variables:
#   INSTALL_DIR   - Path to the Songbird installation (default: /opt/songbird)
#   LOG_FILE      - Path to the log file (default: /opt/songbird/logs/auto-update.log)

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/songbird}"
LOG_FILE="${LOG_FILE:-/opt/songbird/logs/auto-update.log}"
REPO_URL="${REPO_URL:-https://github.com/bllackbull/Songbird.git}"
TARGET_TAG="${1:-}"

# Parse --tag argument
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TARGET_TAG="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  printf "[%s] [auto-update] %s\n" "$ts" "$1" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $1"
  exit 1
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

[[ -d "$INSTALL_DIR" ]] || fail "Install directory not found: $INSTALL_DIR"
[[ -f "$INSTALL_DIR/docker-compose.yaml" ]] || fail "docker-compose.yaml not found in $INSTALL_DIR"

command -v git >/dev/null 2>&1 || fail "git is not installed"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"

# ---------------------------------------------------------------------------
# Fetch latest release tag if not specified
# ---------------------------------------------------------------------------

cd "$INSTALL_DIR"

log "Fetching tags from remote..."
git fetch --tags --force 2>>"$LOG_FILE" || fail "git fetch failed"

if [[ -z "$TARGET_TAG" ]]; then
  TARGET_TAG="$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)"
  [[ -n "$TARGET_TAG" ]] || fail "No release tags found in repository"
  log "Latest release tag: $TARGET_TAG"
fi

# ---------------------------------------------------------------------------
# Check if already on this version
# ---------------------------------------------------------------------------

CURRENT_TAG="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
if [[ "$CURRENT_TAG" == "$TARGET_TAG" ]]; then
  log "Already on $TARGET_TAG — nothing to do."
  exit 0
fi

log "Updating from ${CURRENT_TAG:-<unknown>} → $TARGET_TAG"

# ---------------------------------------------------------------------------
# Backup .env before touching anything
# ---------------------------------------------------------------------------

if [[ -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.bak"
  log "Backed up .env to .env.bak"
fi

# ---------------------------------------------------------------------------
# Checkout the target tag
# ---------------------------------------------------------------------------

log "Checking out $TARGET_TAG..."
git checkout "$TARGET_TAG" 2>>"$LOG_FILE" || fail "git checkout $TARGET_TAG failed"

# Restore .env (git checkout may have overwritten it if it was tracked)
if [[ -f "$INSTALL_DIR/.env.bak" ]]; then
  cp "$INSTALL_DIR/.env.bak" "$INSTALL_DIR/.env"
  log "Restored .env from backup"
fi

# ---------------------------------------------------------------------------
# Rebuild and restart containers
# ---------------------------------------------------------------------------

log "Rebuilding Docker image for $TARGET_TAG..."
docker compose -f "$INSTALL_DIR/docker-compose.yaml" build --no-cache 2>>"$LOG_FILE" \
  || fail "docker compose build failed"

log "Restarting containers..."
docker compose -f "$INSTALL_DIR/docker-compose.yaml" up -d 2>>"$LOG_FILE" \
  || fail "docker compose up failed"

# ---------------------------------------------------------------------------
# Reload nginx (if running on the host, not inside Docker)
# ---------------------------------------------------------------------------

if systemctl is-active --quiet nginx 2>/dev/null; then
  log "Reloading nginx..."
  systemctl reload nginx 2>>"$LOG_FILE" || log "WARNING: nginx reload failed (non-fatal)"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "Update to $TARGET_TAG completed successfully."
