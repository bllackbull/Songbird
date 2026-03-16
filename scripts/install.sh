#!/usr/bin/env bash

set -euo pipefail

APP_NAME="songbird"
INSTALL_DIR="/opt/songbird"
LOG_FILE="/opt/songbird/logs/install.log"
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
SCRIPT_REMOTE_URL="${SCRIPT_REMOTE_URL:-https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh}"

# Mirror URLs
MIRROR_NODESOURCE="${MIRROR_NODESOURCE:-}"
MIRROR_APT_EXTRA="${MIRROR_APT_EXTRA:-}"
MIRROR_NPM="${MIRROR_NPM:-}"

SUDO=""
OS_ID=""
OS_ID_LIKE=""
DEPLOY_MODE="ip"
DOMAIN_NAMES=()
CERTBOT_EMAIL=""
APP_PORT="$DEFAULT_PORT"
FILE_UPLOAD="$DEFAULT_FILE_UPLOAD"
RETENTION_DAYS="$DEFAULT_RETENTION_DAYS"
NGINX_SERVER_NAME="_"
CURRENT_ENV_FILE=""
PROMPT_FD=0

log() {
  local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  printf "[SONGBIRD] %s\n" "$1"
  printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$1" >> "$LOGFILE" 2>/dev/null || true
}


ensure_log_dir() {
  local log_dir="$(dirname "$LOGFILE")"
  if [[ ! -d "$log_dir" ]]; then
    run_as_root mkdir -p "$log_dir"
    log "Created log directory: $log_dir"
  fi
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

run_silent() {
  local output
  # Append command being run to log file
  printf "[%s] Running: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOGFILE" 2>/dev/null || true
  
  if ! output="$("$@" 2>&1)"; then
    # Log the failure
    printf "[%s] FAILED: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOGFILE" 2>/dev/null || true
    # Show error to user
    printf "\n[ERROR] Command failed: %s\n" "$*"
    printf "%s\n" "$output"
    return 1
  else
    # Log success + output
    printf "[%s] SUCCESS: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOGFILE" 2>/dev/null || true
  fi
}


run_as_root() {
  if [[ -n "$SUDO" ]]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

run_in_install_dir() {
  run_silent run_as_root bash -lc "cd '$INSTALL_DIR' && $*"
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
      printf "%s" "$DEFAULT_PORT"
      return 0
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
    prompt_read "Enter files auto deletion interval in days (0 disables, default: $DEFAULT_RETENTION_DAYS): " value
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

  if [[ -n "$MIRROR_APT_EXTRA" ]]; then
    local mirror_list="/etc/apt/sources.list.d/songbird-mirror.list"
    log "Adding mirror apt source: ${MIRROR_APT_EXTRA}"
    printf "%s\n" "$MIRROR_APT_EXTRA" | run_silent run_as_root tee "$mirror_list" >/dev/null
  fi


  log "Refreshing apt package index..."
  run_silent run_as_root apt-get update

  if (( ${#missing_pkgs[@]} > 0 )); then
    log "Installing missing packages: ${missing_pkgs[*]}"
    run_silent run_as_root apt-get install -y "${missing_pkgs[@]}"
  else
    log "All required base packages are already installed."
  fi
}

ensure_nodejs_from_nodesource() {
  if command -v node &>/dev/null; then
    local current_major
    current_major="$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
    if (( current_major >= NODE_MAJOR )); then
      log "Node.js ${current_major}.x already installed. Skipping."
      return 0
    fi
  fi

  if [[ -n "$MIRROR_NODESOURCE" ]]; then
    # Detect tarball vs setup-script mirror by checking for .tar.gz suffix
    if [[ "$MIRROR_NODESOURCE" == *.tar.gz ]]; then
      log "Installing Node.js from tarball mirror: ${MIRROR_NODESOURCE}"

      local tmp_dir
      tmp_dir="$(mktemp -d)"
      local tarball="${tmp_dir}/node.tar.gz"

      curl -fsSL "$MIRROR_NODESOURCE" -o "$tarball"

      local install_dir="/usr/local"
      run_silent run_as_root tar -xzf "$tarball" -C "$install_dir" --strip-components=1

      rm -rf "$tmp_dir"

      log "Node.js installed from tarball to ${install_dir}."
      return 0
    else
      # NodeSource-compatible mirror: mirror base URL + /setup_XX.x
      local setup_url="${MIRROR_NODESOURCE%/}/setup_${NODE_MAJOR}.x"
      log "Installing Node.js ${NODE_MAJOR}.x via NodeSource-style mirror: ${setup_url}"
      if [[ -n "$SUDO" ]]; then
        curl -fsSL "$setup_url" | $SUDO -E bash -
      else
        curl -fsSL "$setup_url" | bash -
      fi
      run_silent run_as_root apt-get install -y nodejs
      return 0
    fi
  fi

  # Default: official NodeSource
  local setup_url="https://deb.nodesource.com/setup_${NODE_MAJOR}.x"
  log "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
  if [[ -n "$SUDO" ]]; then
    curl -fsSL "$setup_url" | $SUDO -E bash -
  else
    curl -fsSL "$setup_url" | bash -
  fi
  run_silent run_as_root apt-get install -y nodejs
}


ensure_service_user_exists() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating dedicated system user: ${SERVICE_USER}"
    run_silent run_as_root useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
}

clone_or_update_repo() {
  run_silent run_as_root mkdir -p "$INSTALL_DIR"

  if run_silent run_as_root test -d "$INSTALL_DIR/.git"; then
    log "Repository exists at ${INSTALL_DIR}. Updating source..."
    run_in_install_dir "git fetch --all --prune"
    run_in_install_dir "git checkout main"
    run_in_install_dir "git pull --ff-only origin main"
    return 0
  fi

  if run_silent run_as_root test -n "$(run_silent run_as_root find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit)"; then
    fail "${INSTALL_DIR} is not empty and not a git checkout. Clear it or use another install path."
  fi

  log "Cloning Songbird repository..."
  run_silent run_as_root git clone "$REPO_URL" "$INSTALL_DIR"
}

install_songbird_dependencies() {
  log "Installing server dependencies..."
  if [[ -n "$MIRROR_NPM" ]]; then
    run_in_install_dir "npm --registry "$MIRROR_NPM" --prefix server install"
  else
    run_in_install_dir "npm --prefix server install"
  fi

  log "Installing client dependencies..."
  if [[ -n "$MIRROR_NPM" ]]; then
    run_in_install_dir "npm --registry "$MIRROR_NPM" --prefix client install"
  else
    run_in_install_dir "npm --prefix client install"
  fi

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
  run_silent run_as_root tee "$env_file" >/dev/null <<EOF
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

parse_domain_input() {
  local raw="$1"
  DOMAIN_NAMES=()
  local IFS=','
  local d
  for d in $raw; do
    d="${d#"${d%%[![:space:]]*}"}"
    d="${d%"${d##*[![:space:]]}"}"
    d="${d#http://}"
    d="${d#https://}"
    d="${d%%/*}"
    [[ -n "$d" ]] && DOMAIN_NAMES+=("$d")
  done
  NGINX_SERVER_NAME="${DOMAIN_NAMES[*]}"
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
    local raw_domains=""
    while true; do
      prompt_read "Enter your domain(s), comma-separated (e.g. example.com, www.example.com): " raw_domains
      raw_domains="${raw_domains#"${raw_domains%%[![:space:]]*}"}"
      raw_domains="${raw_domains%"${raw_domains##*[![:space:]]}"}"
      if [[ -n "$raw_domains" ]]; then
        parse_domain_input "$raw_domains"
        if (( ${#DOMAIN_NAMES[@]} > 0 )); then
          break
        fi
      fi
      printf "Please enter at least one domain.\n"
    done
    CERTBOT_EMAIL="$(prompt_non_empty "Enter email for Let's Encrypt renewal notices")"
  else
    NGINX_SERVER_NAME="_"
  fi


  APP_PORT="$(prompt_port)"

  if [[ "$(prompt_yes_no "Enable file uploads" "yes")" == "yes" ]]; then
    FILE_UPLOAD="true"
  else
    FILE_UPLOAD="false"
  fi

  if [[ "$FILE_UPLOAD" == "true" ]]; then
    RETENTION_DAYS="$(prompt_retention_days)"
  else
    RETENTION_DAYS="0"
  fi
}

write_full_env_with_defaults() {
  local env_file="${INSTALL_DIR}/.env"
  run_silent run_as_root touch "$env_file"
  render_full_env_file "$env_file"
  CURRENT_ENV_FILE="$env_file"
  log "Wrote full environment config to ${env_file}."
}

apply_ownership() {
  ensure_service_user_exists
  run_silent run_as_root chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$INSTALL_DIR"
  run_slient run_as_root git config --global --add safe.directory "$INSTALL_DIR"
}

configure_systemd_service() {
  log "Creating systemd service at ${SERVICE_FILE}..."
  run_silent run_as_root tee "$SERVICE_FILE" >/dev/null <<EOF
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

[Install]
WantedBy=multi-user.target
EOF

  run_as_root systemctl daemon-reload
  run_as_root systemctl enable --now songbird.service
}

configure_nginx() {
  local server_name_line="server_name ${NGINX_SERVER_NAME};"
  log "Creating Nginx config at ${NGINX_SITE_FILE}..."
  run_silent run_as_root tee "$NGINX_SITE_FILE" >/dev/null <<EOF
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

  # Build the list of domains NOT already covered by any existing certificate.
  # "certbot certificates" lists domains per cert; we grep for exact domain matches.
  local uncovered=()
  local d
  for d in "${DOMAIN_NAMES[@]}"; do
    if run_silent run_as_root certbot certificates 2>/dev/null \
        | grep -qP "^\s+Domains:.*\b$(printf '%s' "$d" | sed 's/[.[\*^$]/\\&/g')\b"; then
      log "Domain ${d} is already covered by an existing certificate. Skipping."
    else
      uncovered+=("$d")
    fi
  done

  if (( ${#uncovered[@]} == 0 )); then
    log "All specified domains already have SSL certificates. Nothing to do."
    return 0
  fi

  local certbot_d_args=()
  for d in "${uncovered[@]}"; do
    certbot_d_args+=(-d "$d")
  done

  log "Requesting SSL certificate for: ${uncovered[*]}"
  run_as_root certbot \
    --nginx \
    --non-interactive \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --redirect \
    "${certbot_d_args[@]}"

  log "SSL certificate obtained for: ${uncovered[*]}."
}

backup_database() {
  if [[ ! -d "$INSTALL_DIR/server" ]]; then
    warn "Server directory not found; skipping DB backup."
    return 0
  fi
  log "Backing up database before update..."
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

  local before after
  before="$(run_in_install_dir "git rev-parse HEAD" | tr -d '\r\n')"

  run_in_install_dir "git fetch --all --prune"
  run_in_install_dir "git checkout main"
  run_in_install_dir "git pull --ff-only origin main"

  after="$(run_in_install_dir "git rev-parse HEAD" | tr -d '\r\n')"

  if [[ "$before" == "$after" ]]; then
    log "Songbird is already up to date. No rebuild needed."
    return 0
  fi

  log "New version detected. Installing dependencies..."
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

  local before after
  before="$(sha256sum "$env_file" | awk '{print $1}')"

  open_env_editor "$env_file"

  after="$(sha256sum "$env_file" | awk '{print $1}')"

  if [[ "$before" == "$after" ]]; then
    log "No changes detected in .env. Skipping rebuild."
    return 0
  fi

  log "Changes detected. Applying updates..."
  rebuild_and_restart_after_settings_change
  log "Settings applied."
}

remove_songbird() {
  [[ -d "$INSTALL_DIR" ]] || fail "No install found at ${INSTALL_DIR}."
  if [[ "$(prompt_yes_no "This will remove Songbird from this server. Continue" "no")" != "yes" ]]; then
    log "Removal canceled."
    return 0
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

  log "Checking for update..."

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
  log "Songbird has been installed successfully."
  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    log "Visit: https://${DOMAIN_NAME}"
  else
    log "Visit: http://<your-server-ip>"
  fi
}

install_global_command() {
  local target="/usr/local/bin/songbird-deploy"
  local source_hint="${BASH_SOURCE[0]:-}"
  local source_path=""

  if [[ -n "$source_hint" ]]; then
    if [[ "$source_hint" != /* ]]; then
      source_hint="$(pwd)/$source_hint"
    fi
    if [[ -f "$source_hint" ]]; then
      source_path="$source_hint"
    fi
  fi

  if [[ -n "$source_path" ]]; then
    run_silent run_as_root install -m 755 "$source_path" "$target"
  else
    log "Script source path is not a regular file. Installing global command from ${SCRIPT_REMOTE_URL}..."
    if [[ -n "$SUDO" ]]; then
      curl -fsSL "$SCRIPT_REMOTE_URL" | $SUDO tee "$target" >/dev/null
      $SUDO chmod 755 "$target"
    else
      curl -fsSL "$SCRIPT_REMOTE_URL" > "$target"
      chmod 755 "$target"
    fi
  fi

  log "Global command installed: songbird-deploy"
  log "Run it from anywhere with: songbird-deploy"
}

ensure_global_command_on_first_run() {
  local target="/usr/local/bin/songbird-deploy"
  if run_silent run_as_root test -x "$target"; then
    return 0
  fi
  log "Global command not found. Installing it automatically..."
  if ! install_global_command; then
    warn "Automatic global command installation failed. You can retry from the menu."
  fi
}

configure_mirrors() {
  printf "\nMirror Configuration\n"
  printf "Leave blank to keep current value.\n\n"

  local val=""

  prompt_read "NodeSource mirror base URL (current: ${MIRROR_NODESOURCE:-<default NodeSource>}): " val
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ -n "$val" ]]; then
    MIRROR_NODESOURCE="$val"
    log "NodeSource mirror set to: ${MIRROR_NODESOURCE}"
  fi

  prompt_read "Extra apt source line for packages (current: ${MIRROR_APT_EXTRA:-<none>}): " val
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ -n "$val" ]]; then
    MIRROR_APT_EXTRA="$val"
    log "Apt mirror source set to: ${MIRROR_APT_EXTRA}"
  fi

  prompt_read "npm mirror registry URL (current: ${MIRROR_NPM:-<default registry.npmjs.org>}): " val
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ -n "$val" ]]; then
    MIRROR_NPM="$val"
    log "npm mirror set to: ${MIRROR_NPM}"
  fi

  printf "\nMirror settings updated (active for this session).\n"
  printf "To persist them, export MIRROR_NODESOURCE and MIRROR_APT_EXTRA before launching.\n"
}

show_logs() {
  if [[ -f "$LOGFILE" ]]; then
    less "$LOGFILE"
  else
    printf "\n  No script log found at: %s\n" "$LOGFILE"
    printf "  Press Enter to continue..."
    read -r
  fi
}

show_service_logs() {
  if systemctl list-units --type=service --all | grep -q "songbird"; then
    journalctl -u songbird --no-pager | less
  else
    printf "\n  Songbird service not found.\n"
    printf "  Press Enter to continue..."
    read -r
  fi
}

show_nginx_logs() {
  local nginx_log_dir="/var/log/nginx"
  if [[ -d "$nginx_log_dir" ]]; then
    # Show both access and error logs if they exist
    local log_files=()
    [[ -f "$nginx_log_dir/access.log" ]] && log_files+=("$nginx_log_dir/access.log")
    [[ -f "$nginx_log_dir/error.log" ]]  && log_files+=("$nginx_log_dir/error.log")

    if [[ ${#log_files[@]} -gt 0 ]]; then
      less "${log_files[@]}"
    else
      printf "\n  No nginx log files found in: %s\n" "$nginx_log_dir"
      printf "  Press Enter to continue..."
      read -r
    fi
  else
    printf "\n  Nginx log directory not found: %s\n" "$nginx_log_dir"
    printf "  Press Enter to continue..."
    read -r
  fi
}


show_banner() {
  printf '\033[1;36m'   # bold cyan
  cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║      ███████╗ ██████╗ ███╗   ██╗ ██████╗ ██████╗ ██╗██████╗ ██████╗       ║
║      ██╔════╝██╔═══██╗████╗  ██║██╔════╝ ██╔══██╗██║██╔══██╗██╔══██╗      ║
║      ███████╗██║   ██║██╔██╗ ██║██║  ███╗██████╔╝██║██████╔╝██║  ██║      ║
║      ╚════██║██║   ██║██║╚██╗██║██║   ██║██╔══██╗██║██╔══██╗██║  ██║      ║
║      ███████║╚██████╔╝██║ ╚████║╚██████╔╝██████╔╝██║██║  ██║██████╔╝      ║
║      ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═╝╚═════╝       ║
║                                                                           ║
║                           D E P L O Y   T O O L                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
EOF
  printf '\033[0m'      # reset
}


show_menu() {
  clear
  show_banner
  printf "\n"
  printf "Songbird Deploy Menu\n"
  printf "1) Install Songbird\n"
  printf "2) Update Songbird\n"
  printf "3) Edit Settings (.env)\n"
  printf "4) Remove Songbird\n"
  printf "5) Reinstall global command (songbird-deploy)\n"
  printf "6) Configure mirrors\n"
  printf "7) View Logs\n"
  printf "8) Exit\n"
}

show_logs_menu() {
  while true; do
    clear
    show_banner
    printf "\n"
    printf "Logs Menu\n"
    printf "1) View script logs\n"
    printf "2) View service logs\n"
    printf "3) View nginx logs\n"
    printf "4) Go back\n"

    prompt_read "Choose an option [1-4]: " choice
    case "$choice" in
      1) show_logs ;;
      2) show_service_logs ;;
      3) show_nginx_logs ;;
      4) return ;;
      *) printf "Invalid choice. Select a number from 1 to 4.\n" ;;
    esac
  done
}

main() {
  # Save the current terminal screen and cursor position
  tput smcup

  # Ensure we restore the terminal on any exit
  trap 'tput rmcup' EXIT INT TERM

  ensure_log_dir
  init_prompt_io
  detect_os
  ensure_sudo
  ensure_global_command_on_first_run

  local choice=""
  while true; do
    check_for_updates_notice
    show_menu
    prompt_read "Choose an option [1-8]: " choice
    case "$choice" in
      1) install_songbird ;;
      2) update_songbird ;;
      3) edit_settings ;;
      4) remove_songbird ;;
      5) install_global_command ;;
      6) configure_mirrors ;;
      7) view_logs ;;
      8) break ;;
      *) printf "Invalid choice. Select a number from 1 to 8.\n" ;;
    esac
  done
}

main "$@"
