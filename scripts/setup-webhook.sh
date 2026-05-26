#!/usr/bin/env bash
# Songbird Webhook Setup Script
#
# Installs and configures the GitHub webhook listener as a systemd service
# on your Ubuntu VPS. Run this once after deploying Songbird.
#
# Usage (run as root or with sudo):
#   sudo bash scripts/setup-webhook.sh
#
# What this does:
#   1. Generates a webhook secret (or uses WEBHOOK_SECRET env var)
#   2. Writes /etc/songbird-webhook.env with the secret and config
#   3. Installs the webhook server as a systemd service
#   4. Optionally adds an nginx proxy_pass block for the webhook endpoint
#   5. Prints the GitHub webhook URL and secret to configure in your repo

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/songbird}"
WEBHOOK_PORT="${WEBHOOK_PORT:-9000}"
SERVICE_NAME="songbird-webhook"
ENV_FILE="/etc/songbird-webhook.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_BIN="$(command -v node 2>/dev/null || echo "")"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------

C_RESET=$'\033[0m'
C_GREEN=$'\033[1;32m'
C_YELLOW=$'\033[1;33m'
C_RED=$'\033[1;31m'
C_CYAN=$'\033[1;36m'

log()  { printf "%b[setup-webhook] %s%b\n" "$C_GREEN"  "$1" "$C_RESET"; }
warn() { printf "%b[setup-webhook] WARNING: %s%b\n" "$C_YELLOW" "$1" "$C_RESET"; }
fail() { printf "%b[setup-webhook] ERROR: %s%b\n" "$C_RED" "$1" "$C_RESET"; exit 1; }

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

[[ "$EUID" -eq 0 ]] || fail "Run this script as root: sudo bash scripts/setup-webhook.sh"
[[ -d "$INSTALL_DIR" ]] || fail "Songbird install directory not found: $INSTALL_DIR"
[[ -f "$INSTALL_DIR/scripts/webhook-server.js" ]] || fail "webhook-server.js not found in $INSTALL_DIR/scripts/"
[[ -f "$INSTALL_DIR/scripts/auto-update.sh" ]] || fail "auto-update.sh not found in $INSTALL_DIR/scripts/"
[[ -n "$NODE_BIN" ]] || fail "Node.js is not installed or not in PATH"

chmod +x "$INSTALL_DIR/scripts/auto-update.sh"
log "Node.js found at: $NODE_BIN"

# ---------------------------------------------------------------------------
# Generate or use existing webhook secret
# ---------------------------------------------------------------------------

if [[ -f "$ENV_FILE" ]]; then
  log "Existing env file found at $ENV_FILE — preserving secret."
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
fi

if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  WEBHOOK_SECRET="$(openssl rand -hex 32)"
  log "Generated new webhook secret."
fi

# ---------------------------------------------------------------------------
# Write env file
# ---------------------------------------------------------------------------

cat > "$ENV_FILE" <<EOF
WEBHOOK_SECRET=${WEBHOOK_SECRET}
WEBHOOK_PORT=${WEBHOOK_PORT}
INSTALL_DIR=${INSTALL_DIR}
LOG_FILE=${INSTALL_DIR}/logs/webhook.log
UPDATE_SCRIPT=${INSTALL_DIR}/scripts/auto-update.sh
EOF

chmod 600 "$ENV_FILE"
log "Wrote env file: $ENV_FILE"

# ---------------------------------------------------------------------------
# Write systemd service
# ---------------------------------------------------------------------------

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Songbird GitHub Webhook Server
After=network.target

[Service]
Type=simple
User=root
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${INSTALL_DIR}/scripts/webhook-server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

log "Wrote systemd service: $SERVICE_FILE"

# ---------------------------------------------------------------------------
# Enable and start service
# ---------------------------------------------------------------------------

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  log "Service $SERVICE_NAME is running."
else
  warn "Service did not start cleanly. Check: journalctl -u $SERVICE_NAME -n 50"
fi

# ---------------------------------------------------------------------------
# Optional: nginx proxy block
# ---------------------------------------------------------------------------

NGINX_CONF=""
if [[ -f /etc/nginx/sites-available/songbird ]]; then
  NGINX_CONF="/etc/nginx/sites-available/songbird"
elif [[ -f /etc/nginx/conf.d/default.conf ]]; then
  NGINX_CONF="/etc/nginx/conf.d/default.conf"
fi

if [[ -n "$NGINX_CONF" ]]; then
  if grep -q "location /webhook" "$NGINX_CONF" 2>/dev/null; then
    log "nginx already has a /webhook location block — skipping."
  else
    log "Adding /webhook proxy block to $NGINX_CONF"
    # Insert before the last closing brace of the server block
    WEBHOOK_BLOCK="
    # Songbird GitHub webhook
    location /webhook {
        proxy_pass http://127.0.0.1:${WEBHOOK_PORT}/webhook;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 10s;
    }"

    # Use a temp file to safely insert the block
    TMP_CONF="$(mktemp)"
    awk -v block="$WEBHOOK_BLOCK" '
      /^\}[[:space:]]*$/ && !inserted { print block; inserted=1 }
      { print }
    ' "$NGINX_CONF" > "$TMP_CONF"
    mv "$TMP_CONF" "$NGINX_CONF"

    nginx -t 2>/dev/null && systemctl reload nginx && log "nginx reloaded." \
      || warn "nginx config test failed — review $NGINX_CONF manually."
  fi
else
  warn "Could not find nginx config. Add this location block to your server block manually:"
  printf "\n%b    location /webhook {\n        proxy_pass http://127.0.0.1:%s/webhook;\n        proxy_set_header Host \$host;\n        proxy_read_timeout 10s;\n    }%b\n\n" "$C_CYAN" "$WEBHOOK_PORT" "$C_RESET"
fi

# ---------------------------------------------------------------------------
# Print summary
# ---------------------------------------------------------------------------

printf "\n%b" "$C_GREEN"
printf "╔══════════════════════════════════════════════════════════╗\n"
printf "║         Songbird Webhook Setup Complete                  ║\n"
printf "╚══════════════════════════════════════════════════════════╝\n"
printf "%b\n" "$C_RESET"

printf "%bNext steps — configure this webhook in your GitHub repo:%b\n\n" "$C_CYAN" "$C_RESET"
printf "  1. Go to: https://github.com/<your-org>/Songbird/settings/hooks/new\n"
printf "  2. Payload URL:   %bhttps://<your-domain>/webhook%b\n" "$C_YELLOW" "$C_RESET"
printf "  3. Content type:  %bapplication/json%b\n" "$C_YELLOW" "$C_RESET"
printf "  4. Secret:        %b%s%b\n" "$C_YELLOW" "$WEBHOOK_SECRET" "$C_RESET"
printf "  5. Events:        %bLet me select individual events → Releases%b\n" "$C_YELLOW" "$C_RESET"
printf "  6. Click:         %bAdd webhook%b\n\n" "$C_YELLOW" "$C_RESET"

printf "%bUseful commands:%b\n" "$C_CYAN" "$C_RESET"
printf "  View webhook logs:  journalctl -u %s -f\n" "$SERVICE_NAME"
printf "  View update logs:   tail -f %s/logs/auto-update.log\n" "$INSTALL_DIR"
printf "  Restart service:    systemctl restart %s\n" "$SERVICE_NAME"
printf "  Manual update:      bash %s/scripts/auto-update.sh\n\n" "$INSTALL_DIR"
