#!/usr/bin/env bash

set -uo pipefail

trap 'clear; exit 130' INT TERM
trap 'clear' EXIT

APP_NAME="songbird"
INSTALL_DIR="/opt/songbird"
LOG_FILE="/opt/songbird/logs/install.log"
REPO_URL="${REPO_URL:-https://github.com/bllackbull/Songbird.git}"
SERVICE_USER="songbird"
SERVICE_GROUP="songbird"
SERVICE_FILE="/etc/systemd/system/songbird.service"
NGINX_SITE_FILE="/etc/nginx/sites-available/songbird"
NGINX_ENABLED_FILE="/etc/nginx/sites-enabled/songbird"
DEFAULT_SERVER_PORT="5174"
DEFAULT_CLIENT_PORT="80"
DEFAULT_FILE_UPLOAD="true"
DEFAULT_MAX_UPLOAD="78643200"
DEFAULT_RETENTION_DAYS="7"
DEFAULT_ACCOUNT_CREATION="true"
NODE_MAJOR="24"
SCRIPT_REMOTE_URL="${SCRIPT_REMOTE_URL:-https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh}"
LOG_LINES="${LOG_LINES:-100}"

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
SERVER_PORT="$DEFAULT_SERVER_PORT"
CLIENT_PORT="$DEFAULT_CLIENT_PORT"
FILE_UPLOAD="$DEFAULT_FILE_UPLOAD"
MAX_UPLOAD="$DEFAULT_MAX_UPLOAD"
RETENTION_DAYS="$DEFAULT_RETENTION_DAYS"
ACCOUNT_CREATION="$DEFAULT_ACCOUNT_CREATION"
NGINX_SERVER_NAME="_"
CURRENT_ENV_FILE=""
PROMPT_FD=0
DB_BACKUP_PATH=""
SOURCE_MODE="github"
SOURCE_ZIP_PATH=""
MIRROR_CONFIG_FILE="/etc/songbird-deploy.conf"

log() {
  local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  local log_dir="$(dirname "$LOG_FILE")"

  printf "[SONGBIRD] %s\n" "$1"

  if [[ -d "$log_dir" ]]; then
    printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$1" >> "$LOG_FILE" 2>/dev/null || true
  fi
}


ensure_log_dir() {
  local log_dir="$(dirname "$LOG_FILE")"
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

press_enter_to_continue() {
  printf "\nPress Enter to return to the main menu..."
  read -r _
}

run_silent() {
  local output
  # Append command being run to log file
  printf "[%s] Running: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE" 2>/dev/null || true
  
  if ! output="$("$@" 2>&1)"; then
    # Log the failure
    printf "[%s] FAILED: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOG_FILE" 2>/dev/null || true
    # Show error to user
    printf "\n[ERROR] Command failed: %s\n" "$*"
    printf "%s\n" "$output"
    return 1
  else
    # Log success + output
    printf "[%s] SUCCESS: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOG_FILE" 2>/dev/null || true
  fi
}


run_as_root() {
  if [[ -n "$SUDO" ]]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

run_as_root_output() {
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
    prompt_read "Enter server port (default: $DEFAULT_SERVER_PORT): " value
    if [[ -z "$value" ]]; then
      printf "%s" "$DEFAULT_SERVER_PORT"
      return 0
    fi
    if [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 65535 )); then
      printf "%s" "$value"
      return 0
    fi
    printf "Port must be an integer between 1 and 65535.\n"
  done
}

prompt_client_port() {
  local value=""
  while true; do
    prompt_read "Enter client (nginx) port (default: $DEFAULT_CLIENT_PORT): " value
    if [[ -z "$value" ]]; then
      printf "%s" "$DEFAULT_CLIENT_PORT"
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

normalize_path_input() {
  local value="$1"
  if [[ "$value" == "~"* ]]; then
    printf "%s" "${value/#\~/$HOME}"
    return 0
  fi
  printf "%s" "$value"
}

load_mirrors_from_config() {
  if [[ ! -f "$MIRROR_CONFIG_FILE" ]]; then
    return 0
  fi
  local line key value
  local content
  content="$(run_as_root_output cat "$MIRROR_CONFIG_FILE" 2>/dev/null || true)"
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      MIRROR_NODESOURCE) [[ -z "$MIRROR_NODESOURCE" ]] && MIRROR_NODESOURCE="$value" ;;
      MIRROR_APT_EXTRA) [[ -z "$MIRROR_APT_EXTRA" ]] && MIRROR_APT_EXTRA="$value" ;;
      MIRROR_NPM) [[ -z "$MIRROR_NPM" ]] && MIRROR_NPM="$value" ;;
    esac
  done <<< "$content"
}

save_mirrors_to_config() {
  run_silent run_as_root tee "$MIRROR_CONFIG_FILE" >/dev/null <<EOF
# Songbird deploy mirrors
MIRROR_NODESOURCE=${MIRROR_NODESOURCE}
MIRROR_APT_EXTRA=${MIRROR_APT_EXTRA}
MIRROR_NPM=${MIRROR_NPM}
EOF
  run_silent run_as_root chmod 644 "$MIRROR_CONFIG_FILE"
}

clear_mirror_values() {
  MIRROR_NODESOURCE=""
  MIRROR_APT_EXTRA=""
  MIRROR_NPM=""
}

configure_mirrors_menu() {
  while true; do
    clear
    show_banner
    printf "\n"
    printf "Configure Mirrors\n"
    printf "1) Set NodeSource mirror (current: %s)\n" "${MIRROR_NODESOURCE:-<default>}"
    printf "2) Set apt mirror source (current: %s)\n" "${MIRROR_APT_EXTRA:-<none>}"
    printf "3) Set npm registry mirror (current: %s)\n" "${MIRROR_NPM:-<default>}"
    printf "4) Restore defaults (clear mirrors)\n"
    printf "5) Go back\n\n"

    prompt_read "Choose an option [1-5]: " choice
    case "$choice" in
      1)
        local val=""
        prompt_read "NodeSource mirror base URL (blank to clear): " val
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        MIRROR_NODESOURCE="$val"
        save_mirrors_to_config
        ;;
      2)
        local val=""
        prompt_read "Extra apt source line for packages (blank to clear): " val
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        MIRROR_APT_EXTRA="$val"
        save_mirrors_to_config
        ;;
      3)
        local val=""
        prompt_read "npm registry mirror URL (blank to clear): " val
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        MIRROR_NPM="$val"
        save_mirrors_to_config
        ;;
      4)
        clear_mirror_values
        save_mirrors_to_config
        ;;
      5) return ;;
      *) printf "Invalid choice. Select a number from 1 to 5.\n" ;;
    esac
  done
}

prompt_source_mode() {
  local mode=""
  while true; do
    prompt_read "Choose source mode [github/offline] (default: github): " mode
    mode="$(printf "%s" "$mode" | tr '[:upper:]' '[:lower:]')"
    [[ -z "$mode" ]] && mode="github"
    case "$mode" in
      github|offline)
        SOURCE_MODE="$mode"
        break
        ;;
      *) printf "Choose either 'github' or 'offline'.\n" ;;
    esac
  done

  if [[ "$SOURCE_MODE" == "offline" ]]; then
    local input=""
    while true; do
      prompt_read "Enter the full path to the Songbird source .zip file: " input
      input="$(normalize_path_input "$input")"
      input="${input#"${input%%[![:space:]]*}"}"
      input="${input%"${input##*[![:space:]]}"}"
      if [[ -z "$input" ]]; then
        printf "Please provide a file path.\n"
        continue
      fi
      if [[ ! -f "$input" ]]; then
        printf "File not found: %s\n" "$input"
        continue
      fi
      if [[ "${input,,}" != *.zip ]]; then
        printf "Source file must be a .zip archive.\n"
        continue
      fi
      SOURCE_ZIP_PATH="$input"
      break
    done
  else
    SOURCE_ZIP_PATH=""
  fi
}

validate_backup_zip() {
  local zip_path="$1"
  local listing
  listing="$(run_as_root_output unzip -Z1 "$zip_path" 2>/dev/null || true)"
  if [[ -z "$listing" ]]; then
    printf "Backup zip appears empty or unreadable.\n"
    return 1
  fi
  if ! echo "$listing" | grep -qE '(^|/)(songbird\.db)$'; then
    printf "Backup zip missing songbird.db.\n"
    return 1
  fi
  if ! echo "$listing" | grep -qE '(^|/)uploads(/|$)'; then
    printf "Backup zip missing uploads/ directory.\n"
    return 1
  fi
  return 0
}

zip_contains_data_dir() {
  local zip_path="$1"
  local listing
  listing="$(run_as_root_output unzip -Z1 "$zip_path" 2>/dev/null || true)"
  if [[ -z "$listing" ]]; then
    return 1
  fi
  echo "$listing" | grep -qE '(^|/)data(/|$)'
}

prepare_source_root_for_data_copy() {
  local zip_path="$1"
  local source_root="$2"
  local action_label="$3"

  if ! zip_contains_data_dir "$zip_path"; then
    return 0
  fi

  if [[ "$(prompt_yes_no "Source zip includes data/. Replace ${INSTALL_DIR}/data during ${action_label}?" "no")" != "yes" ]]; then
    log "Keeping existing data/. Skipping data/ from source zip."
    if [[ -d "$source_root/data" ]]; then
      run_silent run_as_root rm -rf "$source_root/data"
    fi
  fi
}

extract_backup_zip() {
  local zip_path="$1"
  local tmp_dir="$2"

  run_silent run_as_root unzip -q "$zip_path" -d "$tmp_dir"

  local source_dir="$tmp_dir"
  if [[ -d "$tmp_dir/data" ]]; then
    source_dir="$tmp_dir/data"
  fi

  local db_src="$source_dir/songbird.db"
  local uploads_src="$source_dir/uploads"

  if [[ ! -f "$db_src" || ! -d "$uploads_src" ]]; then
    return 1
  fi

  printf "%s" "$source_dir"
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
    zip
    unzip
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
    local pref_file="/etc/apt/preferences.d/songbird-mirror"
    local codename=$(lsb_release -sc)

    log "Adding mirror apt source: ${MIRROR_APT_EXTRA}"

    printf "deb %s %s main restricted universe multiverse\n" "$MIRROR_APT_EXTRA" "$codename" \
      | run_silent run_as_root tee "$mirror_list" >/dev/null

    printf "Package: *\nPin: origin %s\nPin-Priority: 1001\n" \
      "$(echo "$MIRROR_APT_EXTRA" | sed 's|https\?://||;s|/.*||')" \
      | run_silent run_as_root tee "$pref_file" >/dev/null
  fi


  log "Refreshing apt package index..."
  run_silent run_as_root apt-get update

  if (( ${#missing_pkgs[@]} > 0 )); then
    log "Installing missing packages: ${missing_pkgs[*]}"
    run_silent run_as_root apt-get install -y --allow-downgrades "${missing_pkgs[@]}"
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

clone_repo() {
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

prepare_install_dir_for_offline() {
  run_silent run_as_root mkdir -p "$INSTALL_DIR"
  if run_silent run_as_root test -n "$(run_silent run_as_root find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit)"; then
    fail "${INSTALL_DIR} is not empty. Clear it or use another install path for offline mode."
  fi
}

resolve_offline_source_root() {
  local tmp_dir="$1"
  if [[ -f "$tmp_dir/package.json" && -d "$tmp_dir/server" && -d "$tmp_dir/client" ]]; then
    printf "%s" "$tmp_dir"
    return 0
  fi
  local entry_count
  entry_count="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d '[:space:]')"
  if [[ "$entry_count" -eq 1 ]]; then
    local only_dir
    only_dir="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    if [[ -f "$only_dir/package.json" && -d "$only_dir/server" && -d "$only_dir/client" ]]; then
      printf "%s" "$only_dir"
      return 0
    fi
  fi
  return 1
}

install_source_from_zip() {
  local zip_path="$1"
  have_cmd unzip || fail "unzip is required for offline installs. Install it first and retry."

  prepare_install_dir_for_offline

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  run_silent run_as_root unzip -q "$zip_path" -d "$tmp_dir"

  local source_root
  source_root="$(resolve_offline_source_root "$tmp_dir")" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    fail "Source zip does not appear to contain Songbird (missing server/client/package.json)."
  }

  prepare_source_root_for_data_copy "$zip_path" "$source_root" "install"

  run_silent run_as_root cp -a "$source_root"/. "$INSTALL_DIR"/
  run_silent run_as_root rm -rf "$tmp_dir"
}

update_source_from_zip() {
  local zip_path="$1"
  have_cmd unzip || fail "unzip is required for offline updates. Install it first and retry."

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  run_silent run_as_root unzip -q "$zip_path" -d "$tmp_dir"

  local source_root
  source_root="$(resolve_offline_source_root "$tmp_dir")" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    fail "Source zip does not appear to contain Songbird (missing server/client/package.json)."
  }

  prepare_source_root_for_data_copy "$zip_path" "$source_root" "update"

  run_silent run_as_root cp -a "$source_root"/. "$INSTALL_DIR"/
  run_silent run_as_root rm -rf "$tmp_dir"
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

get_existing_env_value_with_fallback() {
  local primary="$1"
  local fallback="$2"
  local default="$3"
  local env_file="$INSTALL_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    printf "%s" "$default"
    return 0
  fi
  local existing
  existing="$(grep -E "^${primary}=" "$env_file" | tail -n 1 | cut -d "=" -f 2- || true)"
  if [[ -n "$existing" ]]; then
    printf "%s" "$existing"
    return 0
  fi
  if [[ -n "$fallback" ]]; then
    existing="$(grep -E "^${fallback}=" "$env_file" | tail -n 1 | cut -d "=" -f 2- || true)"
    if [[ -n "$existing" ]]; then
      printf "%s" "$existing"
      return 0
    fi
  fi
  printf "%s" "$default"
}

replace_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[&/]/\\&/g')"
  if grep -qE "^${key}=" "$env_file"; then
    run_silent run_as_root sed -i "s|^${key}=.*|${key}=${escaped}|" "$env_file"
  else
    run_silent run_as_root bash -lc "printf '%s\n' '${key}=${escaped}' >> '$env_file'"
  fi
}

write_env_from_example() {
  local env_file="${INSTALL_DIR}/.env"
  local example_file="${INSTALL_DIR}/.env.example"
  [[ -f "$example_file" ]] || fail "Missing ${example_file}. Cannot initialize .env."
  local existing_public_key
  local existing_private_key
  local existing_subject
  local existing_server_port
  local existing_client_port
  existing_public_key="$(get_existing_env_value "VAPID_PUBLIC_KEY" "")"
  existing_private_key="$(get_existing_env_value "VAPID_PRIVATE_KEY" "")"
  existing_subject="$(get_existing_env_value "VAPID_SUBJECT" "mailto:admin@example.com")"
  existing_server_port="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "$DEFAULT_SERVER_PORT")"
  existing_client_port="$(get_existing_env_value "CLIENT_PORT" "$DEFAULT_CLIENT_PORT")"

  run_silent run_as_root cp "$example_file" "$env_file"
  replace_env_value "$env_file" "SERVER_PORT" "$existing_server_port"
  replace_env_value "$env_file" "CLIENT_PORT" "$existing_client_port"
  replace_env_value "$env_file" "SERVER_PORT" "$SERVER_PORT"
  replace_env_value "$env_file" "CLIENT_PORT" "$CLIENT_PORT"
  replace_env_value "$env_file" "ACCOUNT_CREATION" "$ACCOUNT_CREATION"
  replace_env_value "$env_file" "FILE_UPLOAD" "$FILE_UPLOAD"
  replace_env_value "$env_file" "FILE_UPLOAD_MAX_TOTAL_SIZE" "$MAX_UPLOAD"
  replace_env_value "$env_file" "MESSAGE_FILE_RETENTION" "$RETENTION_DAYS"
  replace_env_value "$env_file" "VAPID_PUBLIC_KEY" "$existing_public_key"
  replace_env_value "$env_file" "VAPID_PRIVATE_KEY" "$existing_private_key"
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    replace_env_value "$env_file" "VAPID_SUBJECT" "mailto:${CERTBOT_EMAIL}"
  else
    replace_env_value "$env_file" "VAPID_SUBJECT" "$existing_subject"
  fi
  CURRENT_ENV_FILE="$env_file"
  log "Wrote environment config from ${example_file}."
}

ensure_vapid_keys() {
  local env_file="${INSTALL_DIR}/.env"
  local public_key
  local private_key
  public_key="$(get_existing_env_value "VAPID_PUBLIC_KEY" "")"
  private_key="$(get_existing_env_value "VAPID_PRIVATE_KEY" "")"
  if [[ -n "$public_key" && -n "$private_key" ]]; then
    log "VAPID keys already present. Skipping generation."
    return 0
  fi
  log "Generating VAPID keys..."
  local keys
  keys="$(run_as_root_output bash -lc "cd '$INSTALL_DIR/server' && node --input-type=module -e \"import { generateVAPIDKeys } from 'web-push'; const k = generateVAPIDKeys(); console.log(k.publicKey); console.log(k.privateKey);\"")" || {
    warn "Failed to generate VAPID keys. Make sure server dependencies are installed."
    return 1
  }
  local new_public=""
  local new_private=""
  IFS=$'\n' read -r new_public new_private _ <<< "$keys"
  if [[ -z "$new_public" || -z "$new_private" ]]; then
    warn "VAPID key generation returned empty values."
    return 1
  fi
  replace_env_value "$env_file" "VAPID_PUBLIC_KEY" "$new_public"
  replace_env_value "$env_file" "VAPID_PRIVATE_KEY" "$new_private"
  log "VAPID keys generated and saved to ${env_file}."
}

open_env_editor() {
  local env_file="$1"
  local editor_cmd="${EDITOR:-nano}"
  if ! have_cmd "$editor_cmd"; then
    editor_cmd="vi"
  fi

  log "Opening ${env_file} with ${editor_cmd}. Save and close to continue."
  tput rmcup
  trap 'tput rmcup' EXIT INT TERM  

  if [[ -n "$SUDO" ]]; then
    $SUDO "$editor_cmd" "$env_file"
  else
    "$editor_cmd" "$env_file"
  fi

  tput smcup
  clear
  trap 'tput rmcup' EXIT INT TERM
}

sync_values_from_env() {
  local env_file="$INSTALL_DIR/.env"
  SERVER_PORT="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "$DEFAULT_SERVER_PORT")"
  CLIENT_PORT="$(get_existing_env_value "CLIENT_PORT" "$DEFAULT_CLIENT_PORT")"
  FILE_UPLOAD="$(get_existing_env_value "FILE_UPLOAD" "$DEFAULT_FILE_UPLOAD")"
  MAX_UPLOAD="$(get_existing_env_value "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_MAX_UPLOAD")"
  RETENTION_DAYS="$(get_existing_env_value "MESSAGE_FILE_RETENTION" "$DEFAULT_RETENTION_DAYS")"
  ACCOUNT_CREATION="$(get_existing_env_value "ACCOUNT_CREATION" "$DEFAULT_ACCOUNT_CREATION")"
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


  SERVER_PORT="$(prompt_port)"
  if [[ "$DEPLOY_MODE" == "ip" ]]; then
    CLIENT_PORT="$(prompt_client_port)"
  else
    CLIENT_PORT="$DEFAULT_CLIENT_PORT"
  fi

  if [[ "$(prompt_yes_no "Allow account creation via website?" "yes")" == "yes" ]]; then
    ACCOUNT_CREATION="true"
  else
    ACCOUNT_CREATION="false"
  fi

  if [[ "$(prompt_yes_no "Enable file uploads?" "yes")" == "yes" ]]; then
    FILE_UPLOAD="true"
  else
    FILE_UPLOAD="false"
  fi

  if [[ "$FILE_UPLOAD" == "true" ]]; then
    RETENTION_DAYS="$(prompt_retention_days)"
  else
    RETENTION_DAYS="0"
  fi

  if [[ "$(prompt_yes_no "Do you have a Songbird backup zip to restore?" "no")" == "yes" ]]; then
    local backup_input=""
    while true; do
      prompt_read "Enter the full path to the backup .zip file: " backup_input
      backup_input="$(normalize_path_input "$backup_input")"
      backup_input="${backup_input#"${backup_input%%[![:space:]]*}"}"
      backup_input="${backup_input%"${backup_input##*[![:space:]]}"}"
      if [[ -z "$backup_input" ]]; then
        printf "Please provide a file path.\n"
        continue
      fi
      if [[ ! -f "$backup_input" ]]; then
        printf "File not found: %s\n" "$backup_input"
        continue
      fi
      if [[ "${backup_input,,}" != *.zip ]]; then
        printf "Backup file must be a .zip archive.\n"
        continue
      fi
      if have_cmd unzip; then
        if ! validate_backup_zip "$backup_input"; then
          continue
        fi
      fi
      DB_BACKUP_PATH="$backup_input"
      break
    done
  fi
}

write_full_env_with_defaults() {
  run_silent run_as_root mkdir -p "$INSTALL_DIR"
  write_env_from_example
}

apply_ownership() {
  ensure_service_user_exists
  run_silent run_as_root chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$INSTALL_DIR"
  run_silent run_as_root git config --global --add safe.directory "$INSTALL_DIR"
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
  run_as_root systemctl restart songbird.service
}

configure_nginx() {
  local server_name_line="server_name ${NGINX_SERVER_NAME};"

  log "Creating Nginx config at ${NGINX_SITE_FILE}..."
  run_silent run_as_root tee "$NGINX_SITE_FILE" >/dev/null <<EOF
server {
  listen ${CLIENT_PORT} default_server;
  ${server_name_line}
  client_max_body_size ${MAX_UPLOAD};

  location /api/events {
    proxy_pass http://127.0.0.1:${SERVER_PORT};
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
    proxy_pass http://127.0.0.1:${SERVER_PORT};
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

  local existing_certs
  existing_certs="$(run_as_root certbot certificates 2>/dev/null)"

  local uncovered=()
  local d
  for d in "${DOMAIN_NAMES[@]}"; do
    local escaped
    escaped="$(printf '%s' "$d" | sed 's/[.[\*^$]/\\&/g')"

    if echo "$existing_certs" | grep -qP "^\s+Domains:.*\b${escaped}\b"; then
      log "Domain ${d} already has a certificate. Will reconfigure nginx."
    else
      uncovered+=("$d")
    fi
  done

  if (( ${#uncovered[@]} > 0 )); then
    local certbot_d_args=()
    for d in "${uncovered[@]}"; do
      certbot_d_args+=(-d "$d")
    done

    log "Requesting SSL certificate for: ${uncovered[*]}"
    run_as_root certbot certonly \
      --nginx \
      --non-interactive \
      --agree-tos \
      --email "$CERTBOT_EMAIL" \
      "${certbot_d_args[@]}" || { log "ERROR: Certbot failed for: ${uncovered[*]}"; return 1; }

    log "SSL certificate obtained for: ${uncovered[*]}"
  else
    log "All domains already have certificates. Skipping certificate request."
  fi

  log "Configuring nginx SSL for: ${DOMAIN_NAMES[*]}"
  local all_d_args=()
  for d in "${DOMAIN_NAMES[@]}"; do
    all_d_args+=(-d "$d")
  done

  run_as_root certbot install \
    --nginx \
    --non-interactive \
    --cert-name "${DOMAIN_NAMES[0]}" \
    "${all_d_args[@]}" || { log "ERROR: Failed to configure nginx SSL"; return 1; }

  log "Nginx SSL configured for: ${DOMAIN_NAMES[*]}"
}

restore_backup_if_provided() {
  if [[ -z "$DB_BACKUP_PATH" ]]; then
    return 0
  fi
  if [[ ! -f "$DB_BACKUP_PATH" ]]; then
    warn "Backup file not found: $DB_BACKUP_PATH"
    return 1
  fi
  if ! have_cmd unzip; then
    fail "unzip is required to restore backups. Install it first and retry."
  fi
  if ! validate_backup_zip "$DB_BACKUP_PATH"; then
    fail "Backup validation failed."
  fi

  log "Restoring data from backup: $DB_BACKUP_PATH"
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  local source_dir
  source_dir="$(extract_backup_zip "$DB_BACKUP_PATH" "$tmp_dir")" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    fail "Backup zip does not contain expected songbird.db and uploads/ directory."
  }

  local db_src="$source_dir/songbird.db"
  local uploads_src="$source_dir/uploads"

  run_silent run_as_root rm -rf "$INSTALL_DIR/data"
  run_silent run_as_root mkdir -p "$INSTALL_DIR/data"

  if [[ -f "$db_src" ]]; then
    run_silent run_as_root cp -a "$db_src" "$INSTALL_DIR/data/"
  fi
  if [[ -d "$uploads_src" ]]; then
    run_silent run_as_root cp -a "$uploads_src" "$INSTALL_DIR/data/"
  fi

  run_silent run_as_root rm -rf "$tmp_dir"
  log "Backup restored into ${INSTALL_DIR}/data."
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

update_nginx_runtime_values() {
  if [[ ! -f "$NGINX_SITE_FILE" ]]; then
    warn "Nginx site config not found at ${NGINX_SITE_FILE}. Skipping nginx update."
    return 1
  fi

  local backup_file="${NGINX_SITE_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  run_silent run_as_root cp "$NGINX_SITE_FILE" "$backup_file"

  run_silent run_as_root sed -i -E \
    "s|proxy_pass http://127\\.0\\.0\\.1:[0-9]+;|proxy_pass http://127.0.0.1:${SERVER_PORT};|g" \
    "$NGINX_SITE_FILE"

  run_silent run_as_root sed -i -E \
    "s|listen [0-9]+ default_server;|listen ${CLIENT_PORT} default_server;|g" \
    "$NGINX_SITE_FILE"

  run_silent run_as_root sed -i -E \
    "s|client_max_body_size [^;]+;|client_max_body_size ${MAX_UPLOAD};|g" \
    "$NGINX_SITE_FILE"

  if run_as_root nginx -t; then
    run_as_root systemctl reload nginx
    log "Nginx updated with SERVER_PORT=${SERVER_PORT}, CLIENT_PORT=${CLIENT_PORT}, MAX_UPLOAD=${MAX_UPLOAD}."
    log "Backup saved at ${backup_file}."
    return 0
  fi

  warn "Nginx config test failed. Restoring previous config."
  run_silent run_as_root cp "$backup_file" "$NGINX_SITE_FILE"
  run_as_root nginx -t || true
  return 1
}

rebuild_and_restart_after_settings_change() {
  local needs_nginx="${1:-no}"
  sync_values_from_env
  log "Rebuilding client after settings change..."
  run_in_install_dir "npm --prefix client run build"

  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service

  if [[ "$needs_nginx" == "yes" ]]; then
    log "Updating Nginx config for SERVER_PORT/CLIENT_PORT/MAX_UPLOAD changes..."
    update_nginx_runtime_values || warn "Nginx update failed. Review ${NGINX_SITE_FILE}."
  else
    log "Nginx update not required (SERVER_PORT/CLIENT_PORT/MAX_UPLOAD unchanged)."
  fi
}

update_songbird() {
  [[ -d "$INSTALL_DIR" ]] || fail "No Songbird install found at ${INSTALL_DIR}."

  prompt_source_mode
  backup_database

  local before after
  before=""
  after=""

  if [[ "$SOURCE_MODE" == "offline" ]]; then
    log "Updating from offline zip..."
    update_source_from_zip "$SOURCE_ZIP_PATH"
  else
    [[ -d "$INSTALL_DIR/.git" ]] || fail "No git checkout found at ${INSTALL_DIR}. Use offline mode."
    before="$(run_in_install_dir "git rev-parse HEAD" | tr -d '\r\n')"

    run_in_install_dir "git fetch --all --prune"
    run_in_install_dir "git checkout main"
    run_in_install_dir "git pull --ff-only origin main"

    after="$(run_in_install_dir "git rev-parse HEAD" | tr -d '\r\n')"

    if [[ "$before" == "$after" ]]; then
      log "Songbird is already up to date. No rebuild needed."
      return 0
    fi
  fi

  log "New version detected. Installing dependencies..."
  install_songbird_dependencies
  ensure_vapid_keys
  run_migrations
  apply_ownership

  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service
  run_as_root systemctl reload nginx

  log "Update completed."
  press_enter_to_continue
}

restart_songbird() {
  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service
  run_as_root systemctl reload nginx

  log "Songbird restarted successfully."
  press_enter_to_continue
}

edit_settings() {
  local env_file="${INSTALL_DIR}/.env"
  [[ -f "$env_file" ]] || fail "No .env found at ${env_file}. Run install first."

  local legacy_port existing_server existing_client
  legacy_port="$(get_existing_env_value "PORT" "")"
  existing_server="$(get_existing_env_value "SERVER_PORT" "")"
  existing_client="$(get_existing_env_value "CLIENT_PORT" "")"
  if [[ -n "$legacy_port" && -z "$existing_server" ]]; then
    replace_env_value "$env_file" "SERVER_PORT" "$legacy_port"
  fi
  if [[ -z "$existing_client" ]]; then
    replace_env_value "$env_file" "CLIENT_PORT" "$DEFAULT_CLIENT_PORT"
  fi

  local before_server before_client before_max
  before_server="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "$DEFAULT_SERVER_PORT")"
  before_client="$(get_existing_env_value "CLIENT_PORT" "$DEFAULT_CLIENT_PORT")"
  before_max="$(get_existing_env_value "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_MAX_UPLOAD")"

  local before after
  before="$(sha256sum "$env_file" | awk '{print $1}')"

  open_env_editor "$env_file"

  after="$(sha256sum "$env_file" | awk '{print $1}')"

  if [[ "$before" == "$after" ]]; then
    log "No changes detected in .env. Skipping rebuild."
    return 0
  fi

  local after_server after_client after_max
  after_server="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "$DEFAULT_SERVER_PORT")"
  after_client="$(get_existing_env_value "CLIENT_PORT" "$DEFAULT_CLIENT_PORT")"
  after_max="$(get_existing_env_value "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_MAX_UPLOAD")"

  local needs_nginx="no"
  if [[ "$before_server" != "$after_server" || "$before_client" != "$after_client" || "$before_max" != "$after_max" ]]; then
    needs_nginx="yes"
  fi

  log "Changes detected. Applying updates..."
  rebuild_and_restart_after_settings_change "$needs_nginx"
  log "Settings applied."
  press_enter_to_continue
}

remove_songbird() {
  [[ -d "$INSTALL_DIR" ]] || fail "No install found at ${INSTALL_DIR}."
  if [[ "$(prompt_yes_no "This will remove Songbird from this server. Continue?" "no")" != "yes" ]]; then
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

  if [[ -f "/usr/local/bin/songbird-deploy" ]]; then
    if [[ "$(prompt_yes_no "Remove global command (songbird-deploy) as well?" "no")" == "yes" ]]; then
      run_as_root rm -f "/usr/local/bin/songbird-deploy"
      log "Global command removed."
    fi
  fi

  press_enter_to_continue
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
  ensure_log_dir
  prompt_source_mode
  collect_install_options
  install_required_packages
  ensure_nodejs_from_nodesource
  ensure_service_user_exists
  if [[ "$SOURCE_MODE" == "offline" ]]; then
    install_source_from_zip "$SOURCE_ZIP_PATH"
  else
    clone_repo
  fi
  restore_backup_if_provided
  write_full_env_with_defaults
  install_songbird_dependencies
  ensure_vapid_keys
  apply_ownership
  configure_systemd_service
  configure_nginx
  configure_ssl_if_needed

  log "Installation complete."
  log "Songbird has been installed successfully."
  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    for d in "${DOMAIN_NAMES[@]}"; do
      log "Visit: https://${d}"
    done
  else
    log "Visit: http://<your-server-ip>:${CLIENT_PORT}"
  fi

  press_enter_to_continue
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
    log "Script source path is not a regular file. Installing global command..."
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
  press_enter_to_continue
}

ensure_global_command_on_first_run() {
  local target="/usr/local/bin/songbird-deploy"
  if run_as_root test -x "$target"; then
    return 0
  fi
  log "Global command not found. Installing it automatically..."
  if ! install_global_command; then
    warn "Automatic global command installation failed. You can retry from the menu."
  fi
}

show_logs() {
  if [[ -f "$LOG_FILE" ]]; then
    clear
    printf "\n  Last %s lines of script log:\n\n" "$LOG_LINES"
    tail -n "$LOG_LINES" "$LOG_FILE"
  else
    printf "\n  No script log found at: %s\n" "$LOG_FILE"
  fi
  press_enter_to_continue
}

show_service_logs() {
  if systemctl list-units --type=service --all | grep songbird; then
    clear
    printf "\n  Last %s lines of songbird service log:\n\n" "$LOG_LINES"
    run_as_root journalctl -u songbird --no-pager -n "$LOG_LINES"
  else
    printf "\n  Songbird service not found.\n"
  fi
  press_enter_to_continue
}

show_nginx_access_logs() {
  local log_file="/var/log/nginx/access.log"

  if [[ -f "$log_file" ]]; then
    clear
    printf "\n  Last %s lines of nginx access log:\n\n" "$LOG_LINES"
    run_as_root tail -n "$LOG_LINES" "$log_file"
  else
    printf "\n  Nginx access log not found: %s\n" "$log_file"
  fi
  press_enter_to_continue
}

show_nginx_error_logs() {
  local log_file="/var/log/nginx/error.log"

  if [[ -f "$log_file" ]]; then
    clear
    printf "\n  Last %s lines of nginx error log:\n\n" "$LOG_LINES"
    run_as_root tail -n "$LOG_LINES" "$log_file"
  else
    printf "\n  Nginx error log not found: %s\n" "$log_file"
  fi
  press_enter_to_continue
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
  printf "3) Restart Songbird\n"
  printf "4) Edit Settings (.env)\n"
  printf "5) Manage Database\n"
  printf "6) Remove Songbird\n"
  printf "7) Reinstall global command (songbird-deploy)\n"
  printf "8) Configure mirrors\n"
  printf "9) View Logs\n"
  printf "10) Exit\n\n"
}

show_logs_menu() {
  while true; do
    clear
    show_banner
    printf "\n"
    printf "Logs Menu\n"
    printf "1) View script logs\n"
    printf "2) View service logs\n"
    printf "3) View nginx access logs\n"
    printf "4) View nginx error logs\n"
    printf "5) Go back\n\n"

    prompt_read "Choose an option [1-5]: " choice
    case "$choice" in
      1) show_logs ;;
      2) show_service_logs ;;
      3) show_nginx_access_logs ;;
      4) show_nginx_error_logs ;;
      5) return ;;
      *) printf "Invalid choice. Select a number from 1 to 5.\n" ;;
    esac
  done
}

run_db_command() {
  local args=("$@")
  local escaped=""
  local part=""
  for part in "${args[@]}"; do
    escaped+=" $(printf '%q' "$part")"
  done
  run_in_install_dir "${escaped:1}"
}

db_backup() {
  log "Creating backup (db + uploads)..."
  run_db_command npm --prefix server run db:backup
  press_enter_to_continue
}

db_inspect() {
  local kind="$1"
  local limit=""
  prompt_read "Enter row limit (default: 25): " limit
  limit="${limit#"${limit%%[![:space:]]*}"}"
  limit="${limit%"${limit##*[![:space:]]}"}"
  [[ -z "$limit" ]] && limit="25"

  case "$kind" in
    all) run_db_command npm --prefix server run db:inspect -- --limit "$limit" ;;
    chat) run_db_command npm --prefix server run db:chat:inspect -- --limit "$limit" ;;
    user) run_db_command npm --prefix server run db:user:inspect -- --limit "$limit" ;;
    file) run_db_command npm --prefix server run db:file:inspect -- --limit "$limit" ;;
  esac
  press_enter_to_continue
}

db_reset() {
  if [[ "$(prompt_yes_no "This will reset database and delete uploads. Continue?" "no")" != "yes" ]]; then
    log "Reset canceled."
    return 0
  fi
  local recreate="yes"
  if [[ "$(prompt_yes_no "Recreate a fresh database after reset?" "yes")" != "yes" ]]; then
    recreate="no"
  fi

  if [[ "$recreate" == "yes" ]]; then
    run_db_command npm --prefix server run db:reset -- -y --recreate
  else
    run_db_command npm --prefix server run db:reset -- -y --no-recreate
  fi
  press_enter_to_continue
}

db_delete() {
  if [[ "$(prompt_yes_no "This will permanently delete database and uploads. Continue?" "no")" != "yes" ]]; then
    log "Delete canceled."
    return 0
  fi
  run_db_command npm --prefix server run db:delete -- -y
  press_enter_to_continue
}

db_chat_delete() {
  local input=""
  prompt_read "Enter chat IDs (comma/space separated) or type 'all': " input
  input="$(printf "%s" "$input" | tr ',' ' ')"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"

  if [[ -z "$input" ]]; then
    printf "No input provided.\n"
    return 0
  fi

  if [[ "${input,,}" == "all" ]]; then
    run_db_command npm --prefix server run db:chat:delete -- --all -y
  else
    run_db_command npm --prefix server run db:chat:delete -- -y $input
  fi
  press_enter_to_continue
}

db_file_delete() {
  local input=""
  prompt_read "Enter file IDs or stored names (comma/space separated) or type 'all': " input
  input="$(printf "%s" "$input" | tr ',' ' ')"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"

  if [[ -z "$input" ]]; then
    printf "No input provided.\n"
    return 0
  fi

  if [[ "${input,,}" == "all" ]]; then
    run_db_command npm --prefix server run db:file:delete -- -y
  else
    run_db_command npm --prefix server run db:file:delete -- -y $input
  fi
  press_enter_to_continue
}

db_user_delete() {
  local input=""
  prompt_read "Enter user IDs or usernames (comma/space separated) or type 'all': " input
  input="$(printf "%s" "$input" | tr ',' ' ')"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"

  if [[ -z "$input" ]]; then
    printf "No input provided.\n"
    return 0
  fi

  if [[ "${input,,}" == "all" ]]; then
    run_db_command npm --prefix server run db:user:delete -- --all -y
  else
    run_db_command npm --prefix server run db:user:delete -- -y $input
  fi
  press_enter_to_continue
}

db_user_create() {
  local nickname=""
  local username=""
  local password=""

  prompt_read "Display name (optional): " nickname
  username="$(prompt_non_empty "Username (lowercase letters, numbers, ., _)")"
  password="$(prompt_non_empty "Password")"

  run_db_command npm --prefix server run db:user:create -- \
    --nickname "$nickname" \
    --username "$username" \
    --password "$password"
  press_enter_to_continue
}

db_user_generate() {
  local count=""
  local password=""
  local nickname_prefix=""
  local username_prefix=""

  prompt_read "How many users to create? (default: 10): " count
  count="${count#"${count%%[![:space:]]*}"}"
  count="${count%"${count##*[![:space:]]}"}"
  [[ -z "$count" ]] && count="10"

  prompt_read "Password for generated users? (default: Passw0rd!): " password
  password="${password#"${password%%[![:space:]]*}"}"
  password="${password%"${password##*[![:space:]]}"}"
  [[ -z "$password" ]] && password="Passw0rd!"

  prompt_read "Nickname prefix (default: User): " nickname_prefix
  nickname_prefix="${nickname_prefix#"${nickname_prefix%%[![:space:]]*}"}"
  nickname_prefix="${nickname_prefix%"${nickname_prefix##*[![:space:]]}"}"
  [[ -z "$nickname_prefix" ]] && nickname_prefix="User"

  prompt_read "Username prefix (default: user): " username_prefix
  username_prefix="${username_prefix#"${username_prefix%%[![:space:]]*}"}"
  username_prefix="${username_prefix%"${username_prefix##*[![:space:]]}"}"
  [[ -z "$username_prefix" ]] && username_prefix="user"

  run_db_command npm --prefix server run db:user:generate -- \
    --count "$count" \
    --password "$password" \
    --nickname-prefix "$nickname_prefix" \
    --username-prefix "$username_prefix"
  press_enter_to_continue
}

db_restore_backup() {
  local backup_input=""
  while true; do
    prompt_read "Enter the full path to the backup .zip file: " backup_input
    backup_input="$(normalize_path_input "$backup_input")"
    backup_input="${backup_input#"${backup_input%%[![:space:]]*}"}"
    backup_input="${backup_input%"${backup_input##*[![:space:]]}"}"
    if [[ -z "$backup_input" ]]; then
      printf "Please provide a file path.\n"
      continue
    fi
    if [[ ! -f "$backup_input" ]]; then
      printf "File not found: %s\n" "$backup_input"
      continue
    fi
    if [[ "${backup_input,,}" != *.zip ]]; then
      printf "Backup file must be a .zip archive.\n"
      continue
    fi
    if ! validate_backup_zip "$backup_input"; then
      continue
    fi
    break
  done

  if [[ "$(prompt_yes_no "This will replace ${INSTALL_DIR}/data. Continue?" "no")" != "yes" ]]; then
    log "Restore canceled."
    return 0
  fi

  DB_BACKUP_PATH="$backup_input"
  restore_backup_if_provided
  press_enter_to_continue
}

show_db_menu() {
  while true; do
    clear
    show_banner
    printf "\n"
    printf "Manage Database\n"
    printf "1) Inspect database (summary)\n"
    printf "2) Inspect chats\n"
    printf "3) Inspect users\n"
    printf "4) Inspect files\n"
    printf "5) Backup database\n"
    printf "6) Restore from backup\n"
    printf "7) Reset database\n"
    printf "8) Delete database\n"
    printf "9) Delete chats\n"
    printf "10) Delete users\n"
    printf "11) Delete files\n"
    printf "12) Create user\n"
    printf "13) Generate users (bulk)\n"
    printf "14) Go back\n\n"

    prompt_read "Choose an option [1-14]: " choice
    case "$choice" in
      1) db_inspect "all" ;;
      2) db_inspect "chat" ;;
      3) db_inspect "user" ;;
      4) db_inspect "file" ;;
      5) db_backup ;;
      6) db_restore_backup ;;
      7) db_reset ;;
      8) db_delete ;;
      9) db_chat_delete ;;
      10) db_user_delete ;;
      11) db_file_delete ;;
      12) db_user_create ;;
      13) db_user_generate ;;
      14) return ;;
      *) printf "Invalid choice. Select a number from 1 to 14.\n" ;;
    esac
  done
}

main() {
  ensure_log_dir
  init_prompt_io
  detect_os
  ensure_sudo
  load_mirrors_from_config
  ensure_global_command_on_first_run

  tput smcup
  trap 'tput rmcup' EXIT INT TERM

  local choice=""
  while true; do
    check_for_updates_notice
    tput smcup
    show_menu
    prompt_read "Choose an option [1-10]: " choice
    case "$choice" in
      1) install_songbird ;;
      2) update_songbird ;;
      3) restart_songbird ;;
      4) edit_settings ;;
      5) show_db_menu ;;
      6) remove_songbird ;;
      7) install_global_command ;;
      8) configure_mirrors_menu ;;
      9) show_logs_menu ;;
      10) break ;;
      *) printf "Invalid choice. Select a number from 1 to 10.\n" ;;
    esac
  done
}

main "$@"
