#!/usr/bin/env bash

set -euo pipefail

APP_NAME="songbird"
INSTALL_DIR="/opt/songbird"
REPO_URL="${REPO_URL:-https://github.com/bllackbull/Songbird.git}"
SERVICE_USER="songbird"
SERVICE_GROUP="songbird"
SERVICE_FILE="/etc/systemd/system/songbird.service"
NGINX_SITE_FILE="/etc/nginx/sites-available/songbird"
NGINX_ENABLED_FILE="/etc/nginx/sites-enabled/songbird"
DEFAULT_PORT="5174"
DEFAULT_FILE_UPLOAD="true"
DEFAULT_RETENTION_DAYS="7"
NODE_MAJOR="24"

SUDO=""
OS_ID=""
OS_ID_LIKE=""
DEPLOY_MODE="ip"
DOMAIN_NAME=""
INCLUDE_WWW="yes"
CERTBOT_EMAIL=""
APP_PORT="$DEFAULT_PORT"
FILE_UPLOAD="$DEFAULT_FILE_UPLOAD"
RETENTION_DAYS="$DEFAULT_RETENTION_DAYS"
NGINX_SERVER_NAME="_"
CURRENT_ENV_FILE=""
PROMPT_FD=0

log() {
  printf "[%s] %s\n" "$APP_NAME-deploy" "$*"
}

warn() {
  printf "[%s] WARNING: %s\n" "$APP_NAME-deploy" "$*" >&2
}

fail() {
  printf "[%s] ERROR: %s\n" "$APP_NAME-deploy" "$*" >&2
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

run_as_root() {
  if [[ -n "$SUDO" ]]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

run_in_install_dir() {
  run_as_root bash -lc "cd '$INSTALL_DIR' && $*"
}

init_prompt_io() {
  if [[ -t 0 ]]; then
    PROMPT_FD=0
    return 0
  fi
  if [[ -r /dev/tty ]]; then
    exec 3</dev/tty
    PROMPT_FD=3
    return 0
  fi
  fail "No interactive TTY detected. Run this script in an interactive shell."
}

prompt_read() {
  local prompt="$1"
  local __result_var="$2"
  local input=""
  printf "%s" "$prompt" >/dev/tty
  IFS= read -r -u "$PROMPT_FD" input
  printf -v "$__result_var" "%s" "$input"
}

prompt_non_empty() {
  local prompt="$1"
  local value=""
  while true; do
    prompt_read "$prompt: " value
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ -n "$value" ]]; then
      printf "%s" "$value"
      return 0
    fi
    printf "Please provide a value.\n"
  done
}

prompt_yes_no() {
  local prompt="$1"
  local default="$2"
  local value=""
  while true; do
    prompt_read "$prompt [y/n] (default: $default): " value
    value="$(printf "%s" "$value" | tr '[:upper:]' '[:lower:]')"
    if [[ -z "$value" ]]; then
      value="$default"
    fi
    case "$value" in
      y|yes) printf "yes"; return 0 ;;
      n|no) printf "no"; return 0 ;;
      *) printf "Please answer y or n.\n" ;;
    esac
  done
}

prompt_port() {
  local value=""
  while true; do
    prompt_read "Enter application port (default: $DEFAULT_PORT): " value
    if [[ -z "$value" ]]; then
      value="$DEFAULT_PORT"
    fi
    if [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 65535 )); then
      printf "%s" "$value"
      return 0
    fi
    printf "Port must be an integer between 1 and 65535.\n"
  done
}

prompt_retention_days() {
  local value=""
  while true; do
    prompt_read "Enter MESSAGE_FILE_RETENTION in days (0 disables, default: $DEFAULT_RETENTION_DAYS): " value
    if [[ -z "$value" ]]; then
      value="$DEFAULT_RETENTION_DAYS"
    fi
    if [[ "$value" =~ ^[0-9]+$ ]]; then
      printf "%s" "$value"
      return 0
    fi
    printf "Please enter a non-negative integer.\n"
  done
}

detect_os() {
  [[ -f /etc/os-release ]] || fail "Cannot detect OS (/etc/os-release missing)."
  # shellcheck disable=SC1091
  source /etc/os-release
  OS_ID="${ID:-}"
  OS_ID_LIKE="${ID_LIKE:-}"

  if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" || "$OS_ID_LIKE" == *"debian"* ]]; then
    return 0
  fi
  fail "Unsupported OS: ${PRETTY_NAME:-unknown}. This script supports Debian/Ubuntu only."
}

ensure_sudo() {
  if [[ "$EUID" -ne 0 ]]; then
    have_cmd sudo || fail "This script needs root privileges. Install sudo or run as root."
    SUDO="sudo"
    $SUDO -v
  fi
}

install_required_packages() {
  local required_pkgs=(
    git
    curl
    ca-certificates
    gnupg
    lsb-release
    build-essential
    nginx
    python3-certbot-nginx
    ffmpeg
    nano
  )
  local missing_pkgs=()
  local pkg=""

  for pkg in "${required_pkgs[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing_pkgs+=("$pkg")
    fi
  done

  log "Refreshing apt package index..."
  run_as_root apt-get update

  if (( ${#missing_pkgs[@]} > 0 )); then
    log "Installing missing packages: ${missing_pkgs[*]}"
    run_as_root apt-get install -y "${missing_pkgs[@]}"
  else
    log "All required base packages are already installed."
  fi
}

ensure_nodejs_from_nodesource() {
  local install_node="no"
  if ! have_cmd node; then
    install_node="yes"
  else
    local current_major
    current_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || printf "0")"
    if ! [[ "$current_major" =~ ^[0-9]+$ ]] || (( current_major < NODE_MAJOR )); then
      install_node="yes"
    fi
  fi

  if [[ "$install_node" == "yes" ]]; then
    log "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
    if [[ -n "$SUDO" ]]; then
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO -E bash -
    else
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    fi
    run_as_root apt-get install -y nodejs
  else
    log "Node.js is already installed and meets requirement (>=${NODE_MAJOR})."
  fi

  have_cmd npm || fail "npm is not available after Node.js installation."
}

ensure_service_user_exists() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating dedicated system user: ${SERVICE_USER}"
    run_as_root useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
}

clone_or_update_repo() {
  run_as_root mkdir -p "$INSTALL_DIR"

  if run_as_root test -d "$INSTALL_DIR/.git"; then
    log "Repository exists at ${INSTALL_DIR}. Updating source..."
    run_in_install_dir "git fetch --all --prune"
    run_in_install_dir "git checkout main"
    run_in_install_dir "git pull --ff-only origin main"
    return 0
  fi

  if run_as_root test -n "$(run_as_root find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit)"; then
    fail "${INSTALL_DIR} is not empty and not a git checkout. Clear it or use another install path."
  fi

  log "Cloning Songbird repository..."
  run_as_root git clone "$REPO_URL" "$INSTALL_DIR"
}

install_songbird_dependencies() {
  log "Installing server dependencies..."
  run_in_install_dir "npm --prefix server install"

  log "Installing client dependencies..."
  run_in_install_dir "npm --prefix client install"

  log "Building client..."
  run_in_install_dir "npm --prefix client run build"
}

get_existing_env_value() {
  local key="$1"
  local default="$2"
  local env_file="$INSTALL_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    printf "%s" "$default"
    return 0
  fi
  local existing
  existing="$(grep -E "^${key}=" "$env_file" | tail -n 1 | cut -d "=" -f 2- || true)"
  if [[ -z "$existing" ]]; then
    printf "%s" "$default"
  else
    printf "%s" "$existing"
  fi
}

render_full_env_file() {
  local env_file="$1"
  run_as_root tee "$env_file" >/dev/null <<EOF
PORT=${APP_PORT}
APP_ENV=production
APP_DEBUG=false
FILE_UPLOAD=${FILE_UPLOAD}
FILE_UPLOAD_MAX_SIZE=$(get_existing_env_value "FILE_UPLOAD_MAX_SIZE" "26214400")
FILE_UPLOAD_MAX_TOTAL_SIZE=$(get_existing_env_value "FILE_UPLOAD_MAX_TOTAL_SIZE" "78643200")
FILE_UPLOAD_MAX_FILES=$(get_existing_env_value "FILE_UPLOAD_MAX_FILES" "10")
FILE_UPLOAD_TRANSCODE_VIDEOS=$(get_existing_env_value "FILE_UPLOAD_TRANSCODE_VIDEOS" "true")
MESSAGE_FILE_RETENTION=${RETENTION_DAYS}
CHAT_PENDING_TEXT_TIMEOUT=$(get_existing_env_value "CHAT_PENDING_TEXT_TIMEOUT" "300000")
CHAT_PENDING_FILE_TIMEOUT=$(get_existing_env_value "CHAT_PENDING_FILE_TIMEOUT" "1200000")
CHAT_PENDING_RETRY_INTERVAL=$(get_existing_env_value "CHAT_PENDING_RETRY_INTERVAL" "4000")
CHAT_PENDING_STATUS_CHECK_INTERVAL=$(get_existing_env_value "CHAT_PENDING_STATUS_CHECK_INTERVAL" "1000")
CHAT_MESSAGE_FETCH_LIMIT=$(get_existing_env_value "CHAT_MESSAGE_FETCH_LIMIT" "300")
CHAT_MESSAGE_PAGE_SIZE=$(get_existing_env_value "CHAT_MESSAGE_PAGE_SIZE" "60")
CHAT_LIST_REFRESH_INTERVAL=$(get_existing_env_value "CHAT_LIST_REFRESH_INTERVAL" "20000")
CHAT_PRESENCE_PING_INTERVAL=$(get_existing_env_value "CHAT_PRESENCE_PING_INTERVAL" "5000")
CHAT_PEER_PRESENCE_POLL_INTERVAL=$(get_existing_env_value "CHAT_PEER_PRESENCE_POLL_INTERVAL" "3000")
CHAT_HEALTH_CHECK_INTERVAL=$(get_existing_env_value "CHAT_HEALTH_CHECK_INTERVAL" "10000")
CHAT_SSE_RECONNECT_DELAY=$(get_existing_env_value "CHAT_SSE_RECONNECT_DELAY" "2000")
CHAT_SEARCH_MAX_RESULTS=$(get_existing_env_value "CHAT_SEARCH_MAX_RESULTS" "5")
EOF
}

open_env_editor() {
  local env_file="$1"
  local editor_cmd="${EDITOR:-nano}"
  if ! have_cmd "$editor_cmd"; then
    editor_cmd="vi"
  fi

  log "Opening ${env_file} with ${editor_cmd}. Save and close to continue."
  if [[ -n "$SUDO" ]]; then
    $SUDO "$editor_cmd" "$env_file"
  else
    "$editor_cmd" "$env_file"
  fi
}

sync_values_from_env() {
  local env_file="$INSTALL_DIR/.env"
  APP_PORT="$(get_existing_env_value "PORT" "$DEFAULT_PORT")"
  FILE_UPLOAD="$(get_existing_env_value "FILE_UPLOAD" "$DEFAULT_FILE_UPLOAD")"
  RETENTION_DAYS="$(get_existing_env_value "MESSAGE_FILE_RETENTION" "$DEFAULT_RETENTION_DAYS")"
  CURRENT_ENV_FILE="$env_file"
}

collect_install_options() {
  local mode=""
  while true; do
    prompt_read "Deploy behind a domain or server IP? [domain/ip] (default: domain): " mode
    mode="$(printf "%s" "$mode" | tr '[:upper:]' '[:lower:]')"
    [[ -z "$mode" ]] && mode="domain"
    case "$mode" in
      domain|ip)
        DEPLOY_MODE="$mode"
        break
        ;;
      *)
        printf "Choose either 'domain' or 'ip'.\n"
        ;;
    esac
  done

  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    DOMAIN_NAME="$(prompt_non_empty "Enter your domain name (example.com)")"
    DOMAIN_NAME="${DOMAIN_NAME#http://}"
    DOMAIN_NAME="${DOMAIN_NAME#https://}"
    DOMAIN_NAME="${DOMAIN_NAME%%/*}"
    INCLUDE_WWW="$(prompt_yes_no "Also include www.${DOMAIN_NAME} for SSL" "yes")"
    CERTBOT_EMAIL="$(prompt_non_empty "Enter email for Let's Encrypt renewal notices")"
    if [[ "$INCLUDE_WWW" == "yes" ]]; then
      NGINX_SERVER_NAME="${DOMAIN_NAME} www.${DOMAIN_NAME}"
    else
      NGINX_SERVER_NAME="${DOMAIN_NAME}"
    fi
  else
    NGINX_SERVER_NAME="_"
  fi

  if [[ "$(prompt_yes_no "Use default app port (${DEFAULT_PORT})" "yes")" == "yes" ]]; then
    APP_PORT="$DEFAULT_PORT"
  else
    APP_PORT="$(prompt_port)"
  fi

  if [[ "$(prompt_yes_no "Enable FILE_UPLOAD" "yes")" == "yes" ]]; then
    FILE_UPLOAD="true"
  else
    FILE_UPLOAD="false"
  fi

  RETENTION_DAYS="$(prompt_retention_days)"
}

write_full_env_with_defaults() {
  local env_file="${INSTALL_DIR}/.env"
  run_as_root touch "$env_file"
  render_full_env_file "$env_file"
  CURRENT_ENV_FILE="$env_file"
  log "Wrote full environment config to ${env_file}."
}

apply_ownership() {
  ensure_service_user_exists
  run_as_root chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$INSTALL_DIR"
}

configure_systemd_service() {
  log "Creating systemd service at ${SERVICE_FILE}..."
  run_as_root tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${INSTALL_DIR}/server
ExecStart=/usr/bin/env node index.js
Restart=on-failure
Environment=APP_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  run_as_root systemctl daemon-reload
  run_as_root systemctl enable --now songbird.service
}

configure_nginx() {
  local server_name_line="server_name ${NGINX_SERVER_NAME};"
  log "Creating Nginx config at ${NGINX_SITE_FILE}..."
  run_as_root tee "$NGINX_SITE_FILE" >/dev/null <<EOF
server {
  listen 80 default_server;
  ${server_name_line}
  client_max_body_size 78643200;

  location /api/events {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
  }

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_cache_bypass \$http_upgrade;
  }
}
EOF

  run_as_root ln -sfn "$NGINX_SITE_FILE" "$NGINX_ENABLED_FILE"
  if run_as_root test -f /etc/nginx/sites-enabled/default; then
    run_as_root rm -f /etc/nginx/sites-enabled/default
  fi

  run_as_root nginx -t
  run_as_root systemctl reload nginx
}

configure_ssl_if_needed() {
  if [[ "$DEPLOY_MODE" != "domain" ]]; then
    log "IP mode selected. Skipping Certbot SSL setup."
    return 0
  fi

  local certbot_args=(
    --nginx
    --non-interactive
    --agree-tos
    --email "$CERTBOT_EMAIL"
    --redirect
    -d "$DOMAIN_NAME"
  )

  if [[ "$INCLUDE_WWW" == "yes" ]]; then
    certbot_args+=(-d "www.${DOMAIN_NAME}")
  fi

  log "Requesting SSL certificate from Let's Encrypt..."
  run_as_root certbot "${certbot_args[@]}"
  run_as_root certbot renew --dry-run
}

backup_database() {
  if [[ ! -d "$INSTALL_DIR/server" ]]; then
    warn "Server directory not found; skipping DB backup."
    return 0
  fi
  log "Backing up database before update/removal..."
  if ! run_in_install_dir "npm --prefix server run db:backup"; then
    warn "DB backup command failed. Continuing, but verify backups manually."
  fi
}

run_migrations() {
  if [[ ! -d "$INSTALL_DIR/server" ]]; then
    warn "Server directory not found; skipping DB migrations."
    return 0
  fi
  log "Running database migrations..."
  run_in_install_dir "npm --prefix server run db:migrate"
}

rebuild_and_restart_after_settings_change() {
  sync_values_from_env
  log "Rebuilding client after settings change..."
  run_in_install_dir "npm --prefix client run build"

  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service

  log "Regenerating Nginx config to align with current PORT (${APP_PORT})..."
  if [[ -f "$NGINX_SITE_FILE" ]]; then
    # Preserve currently deployed server_name from existing config when possible.
    local existing_server_name
    existing_server_name="$(run_as_root awk '/^[[:space:]]*server_name[[:space:]]+/ { gsub(/;/, \"\", \$0); sub(/^[[:space:]]*server_name[[:space:]]+/, \"\", \$0); print; exit }' "$NGINX_SITE_FILE" || true)"
    if [[ -n "$existing_server_name" ]]; then
      NGINX_SERVER_NAME="$existing_server_name"
    fi
  fi
  configure_nginx
}

update_songbird() {
  [[ -d "$INSTALL_DIR/.git" ]] || fail "No Songbird install found at ${INSTALL_DIR}."

  backup_database
  run_in_install_dir "git fetch --all --prune"
  run_in_install_dir "git checkout main"
  run_in_install_dir "git pull --ff-only origin main"
  install_songbird_dependencies
  run_migrations
  apply_ownership

  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service
  run_as_root systemctl reload nginx
  log "Update completed."
}

edit_settings() {
  local env_file="${INSTALL_DIR}/.env"
  [[ -f "$env_file" ]] || fail "No .env found at ${env_file}. Run install first."
  open_env_editor "$env_file"
  rebuild_and_restart_after_settings_change
  log "Settings applied."
}

remove_songbird() {
  [[ -d "$INSTALL_DIR" ]] || fail "No install found at ${INSTALL_DIR}."
  if [[ "$(prompt_yes_no "This will remove Songbird from this server. Continue" "no")" != "yes" ]]; then
    log "Removal canceled."
    return 0
  fi

  if [[ "$(prompt_yes_no "Create database backup before removal" "yes")" == "yes" ]]; then
    backup_database
  fi

  if run_as_root systemctl list-unit-files | grep -q "^songbird.service"; then
    run_as_root systemctl disable --now songbird.service || true
  fi
  run_as_root rm -f "$SERVICE_FILE"
  run_as_root systemctl daemon-reload

  run_as_root rm -f "$NGINX_ENABLED_FILE"
  run_as_root rm -f "$NGINX_SITE_FILE"
  if run_as_root nginx -t >/dev/null 2>&1; then
    run_as_root systemctl reload nginx
  fi

  run_as_root rm -rf "$INSTALL_DIR"
  if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    run_as_root userdel "$SERVICE_USER" || true
  fi

  log "Songbird removed."
}

check_for_updates_notice() {
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    return 0
  fi

  local local_head=""
  local remote_head=""
  run_in_install_dir "git fetch origin main --quiet" || return 0
  local_head="$(run_in_install_dir "git rev-parse HEAD" | tr -d '\r\n' || true)"
  remote_head="$(run_in_install_dir "git rev-parse origin/main" | tr -d '\r\n' || true)"

  if [[ -n "$local_head" && -n "$remote_head" && "$local_head" != "$remote_head" ]]; then
    warn "Update available. Choose '2) Update Songbird' from the menu."
  fi
}

install_songbird() {
  collect_install_options
  install_required_packages
  ensure_nodejs_from_nodesource
  ensure_service_user_exists
  clone_or_update_repo
  install_songbird_dependencies
  write_full_env_with_defaults

  if [[ "$(prompt_yes_no "Configure advanced settings now (open .env)" "no")" == "yes" ]]; then
    open_env_editor "$CURRENT_ENV_FILE"
    sync_values_from_env
  fi

  apply_ownership
  configure_systemd_service
  configure_nginx
  configure_ssl_if_needed

  log "Installation complete."
  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    log "Visit: https://${DOMAIN_NAME}"
  else
    log "Visit: http://<your-server-ip>"
  fi
}

install_global_command() {
  local target="/usr/local/bin/songbird-deploy"
  local source_path=""
  source_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

  run_as_root install -m 755 "$source_path" "$target"
  log "Global command installed: songbird-deploy"
  log "Run it from anywhere with: songbird-deploy"
}

show_menu() {
  printf "\n"
  printf "Songbird Deploy Menu\n"
  printf "1) Install Songbird\n"
  printf "2) Update Songbird\n"
  printf "3) Edit Settings (.env)\n"
  printf "4) Remove Songbird\n"
  printf "5) Install global command (songbird-deploy)\n"
  printf "6) Exit\n"
}

main() {
  init_prompt_io
  detect_os
  ensure_sudo

  local choice=""
  while true; do
    check_for_updates_notice
    show_menu
    prompt_read "Choose an option [1-6]: " choice
    case "$choice" in
      1) install_songbird ;;
      2) update_songbird ;;
      3) edit_settings ;;
      4) remove_songbird ;;
      5) install_global_command ;;
      6) break ;;
      *) printf "Invalid choice. Select a number from 1 to 6.\n" ;;
    esac
  done
}

main "$@"
