#!/usr/bin/env bash
# songbird-deploy-version: 0.11.0

set -uo pipefail

COLOR_RESET=""
COLOR_LOG=""
COLOR_WARN=""
COLOR_ERROR=""
COLOR_SUCCESS=""

if [[ -z "${NO_COLOR:-}" && ( "${FORCE_COLOR:-0}" != "0" || ( "${TERM:-}" != "dumb" && ( -t 1 || -t 2 ) ) ) ]]; then
  COLOR_RESET=$'\033[0m'
  COLOR_LOG=$'\033[1;38;2;42;186;130m'
  COLOR_WARN=$'\033[1;33m'
  COLOR_ERROR=$'\033[1;31m'
  COLOR_SUCCESS=$'\033[1;32m'
fi

handle_exit() {
  local exit_code=$?
  if [[ "$exit_code" -eq 0 ]]; then
    if [[ "${SKIP_CLEAR_ON_EXIT:-0}" != "1" ]]; then
      clear
    fi
    return 0
  fi

  printf "\n%b[SONGBIRD] Script exited with code %s.%b\n" "$COLOR_ERROR" "$exit_code" "$COLOR_RESET" >&2
  if [[ -f "$LOG_FILE" ]]; then
    printf "%b[SONGBIRD] Review the log at %s for the last recorded step.%b\n" "$COLOR_ERROR" "$LOG_FILE" "$COLOR_RESET" >&2
  fi
}

handle_interrupt() {
  handle_exit
  exit 130
}

trap 'handle_interrupt' INT TERM
trap 'handle_exit' EXIT

APP_NAME="songbird"
INSTALL_DIR="/opt/songbird"
LOG_FILE="/opt/songbird/logs/install.log"
REPO_URL="${REPO_URL:-https://github.com/bllackbull/Songbird.git}"
SERVICE_USER="songbird"
SERVICE_GROUP="songbird"
SERVICE_FILE="/etc/systemd/system/songbird.service"
LEGO_RENEW_SERVICE_FILE="/etc/systemd/system/songbird-lego-renew.service"
LEGO_RENEW_TIMER_FILE="/etc/systemd/system/songbird-lego-renew.timer"
NGINX_SITE_FILE="/etc/nginx/sites-available/songbird"
NGINX_ENABLED_FILE="/etc/nginx/sites-enabled/songbird"
DEFAULT_SERVER_PORT="5174"
DEFAULT_CLIENT_PORT="80"
DEFAULT_FILE_UPLOAD="true"
DEFAULT_FILE_UPLOAD_MAX_SIZE_MB="25"
DEFAULT_MAX_UPLOAD_MB="75"
DEFAULT_RETENTION_DAYS="7"
DEFAULT_TEXT_RETENTION_DAYS="0"
DEFAULT_SIGN_UP="true"
DEFAULT_CHAT_VOICE_WAVEFORM_MAX_DECODE_MB="5"
DEFAULT_CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS="480"
NODE_MAJOR="24"
SCRIPT_REMOTE_URL="${SCRIPT_REMOTE_URL:-https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh}"
LOG_LINES="${LOG_LINES:-100}"
CERT_INSTALL_DIR="/etc/ssl/songbird"
ACME_WEBROOT="/var/lib/songbird/certbot"
LEGO_STATE_DIR="/var/lib/songbird/lego"
LEGO_BIN="/usr/local/bin/lego"
GLOBAL_COMMAND_PATH="/usr/local/bin/songbird-deploy"
SONGBIRD_SOCIAL_GITHUB="https://github.com/bllackbull/Songbird"
SONGBIRD_SOCIAL_TELEGRAM="https://t.me/songbirdapp"
SONGBIRD_SOCIAL_WEBSITE="https://chat.songbird.website/invite/songbird"
SONGBIRD_NOWPAYMENTS="https://nowpayments.io/donation/blackbull"

# Mirror URLs
MIRROR_NODESOURCE="${MIRROR_NODESOURCE:-}"
MIRROR_APT_EXTRA="${MIRROR_APT_EXTRA:-}"
MIRROR_NPM="${MIRROR_NPM:-}"

SUDO=""
OS_ID=""
OS_ID_LIKE=""
DEPLOY_MODE="ip"
DOMAIN_NAMES=()
DOMAIN_GROUPS=()
MANUAL_CERT_GROUP_FULLCHAIN_PATHS=()
MANUAL_CERT_GROUP_PRIVKEY_PATHS=()
CERTBOT_EMAIL=""
SERVER_PORT="$DEFAULT_SERVER_PORT"
CLIENT_PORT="$DEFAULT_CLIENT_PORT"
FILE_UPLOAD="$DEFAULT_FILE_UPLOAD"
MAX_UPLOAD_MB="$DEFAULT_MAX_UPLOAD_MB"
RETENTION_DAYS="$DEFAULT_RETENTION_DAYS"
TEXT_RETENTION_DAYS="$DEFAULT_TEXT_RETENTION_DAYS"
ACCOUNT_CREATION="$DEFAULT_SIGN_UP"
NGINX_SERVER_NAME="_"
CURRENT_ENV_FILE=""
PROMPT_FD=0
PROMPT_FD_OUT=1
DB_BACKUP_PATH=""
DB_BACKUP_PASSWORD=""
RESTORE_BACKUP_QUIET="no"
LAST_UNZIP_OUTPUT=""
LAST_UNZIP_STATUS=0
EXTRACT_SOURCE_DIR=""
EXTRACT_ENV_SRC=""
SOURCE_MODE=""
SOURCE_ZIP_PATH=""
CERT_MODE="http"
CERTBOT_IP_ADDRESS=""
MANUAL_CERT_FULLCHAIN_PATH=""
MANUAL_CERT_PRIVKEY_PATH=""
NODE_EXEC_PATH=""
NPM_EXEC_PATH=""
SKIP_CLEAR_ON_EXIT="0"
MENU_ACTION_PAUSED="0"

resolve_current_script_path() {
  local source_hint="${BASH_SOURCE[0]:-$0}"
  if [[ -z "$source_hint" ]]; then
    return 1
  fi
  if [[ "$source_hint" != /* ]]; then
    source_hint="$(pwd)/$source_hint"
  fi
  if [[ -f "$source_hint" ]]; then
    printf "%s" "$source_hint"
    return 0
  fi
  return 1
}

read_first_line() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    return 1
  fi
  head -n 1 "$file_path" | tr -d '\r\n'
}

read_version_file_value() {
  local version_file="$1"
  local version=""
  version="$(read_first_line "$version_file" 2>/dev/null || true)"
  version="$(printf "%s" "$version" | xargs)"
  if [[ -z "$version" ]]; then
    return 1
  fi
  printf "%s" "$version"
}

read_script_version_header() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    return 1
  fi
  local header=""
  header="$(grep -E '^# songbird-deploy-version:' "$file_path" | head -n 1 | cut -d ':' -f 2- | xargs || true)"
  if [[ -z "$header" || "$header" == "auto" ]]; then
    return 1
  fi
  printf "%s" "$header"
}

resolve_script_version_for_path() {
  local script_path="$1"
  local header_version=""
  header_version="$(read_script_version_header "$script_path" 2>/dev/null || true)"
  if [[ -n "$header_version" ]]; then
    printf "%s" "$header_version"
    return 0
  fi

  local script_dir=""
  script_dir="$(cd -- "$(dirname -- "$script_path")" && pwd -P 2>/dev/null || true)"
  local repo_root=""
  if [[ -n "$script_dir" ]]; then
    repo_root="$(cd -- "$script_dir/.." && pwd -P 2>/dev/null || true)"
  fi
  if [[ -n "$repo_root" && -f "$repo_root/VERSION" ]]; then
    read_version_file_value "$repo_root/VERSION"
    return $?
  fi

  if [[ -f "$INSTALL_DIR/VERSION" ]]; then
    read_version_file_value "$INSTALL_DIR/VERSION"
    return $?
  fi

  return 1
}

CURRENT_SCRIPT_PATH="$(resolve_current_script_path 2>/dev/null || true)"
SCRIPT_VERSION="$(resolve_script_version_for_path "$CURRENT_SCRIPT_PATH" 2>/dev/null || printf "0.0.0")"
LAST_GLOBAL_COMMAND_VERSION=""

log() {
  local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  local log_dir="$(dirname "$LOG_FILE")"

  printf "%b[SONGBIRD] %s%b\n" "$COLOR_LOG" "$1" "$COLOR_RESET"

  if [[ -d "$log_dir" ]]; then
    printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$1" >> "$LOG_FILE" 2>/dev/null || true
  fi
}


ensure_log_dir() {
  local log_dir="$(dirname "$LOG_FILE")"
  if [[ ! -d "$log_dir" ]]; then
    run_as_root mkdir -p "$log_dir" || return 1
    log "Created log directory: $log_dir"
  fi
}

warn() {
  local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  printf "%b[%s] WARNING: %s%b\n" "$COLOR_WARN" "SONGBIRD" "$*" "$COLOR_RESET" >&2
  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] [SONGBIRD] WARNING: %s\n" "$timestamp" "$*" >> "$LOG_FILE" 2>/dev/null || true
  fi
}

fail() {
  local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  printf "%b[%s] ERROR: %s%b\n" "$COLOR_ERROR" "SONGBIRD" "$*" "$COLOR_RESET" >&2
  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] [SONGBIRD] ERROR: %s\n" "$timestamp" "$*" >> "$LOG_FILE" 2>/dev/null || true
  fi
  exit 1
}

terminal_columns() {
  local cols=""
  if cols="$(tput cols 2>/dev/null)" && [[ "$cols" =~ ^[0-9]+$ ]] && (( cols > 0 )); then
    printf "%s" "$cols"
    return 0
  fi
  if [[ "${COLUMNS:-}" =~ ^[0-9]+$ ]] && (( COLUMNS > 0 )); then
    printf "%s" "$COLUMNS"
    return 0
  fi
  printf "80"
}

wrap_success_line() {
  local text="$1"
  local width="$2"
  if (( width < 1 )); then
    printf "%s\n" "$text"
    return 0
  fi
  if [[ -z "$text" ]]; then
    printf "\n"
    return 0
  fi

  local remaining="$text"
  while (( ${#remaining} > width )); do
    local chunk="${remaining:0:width}"
    local break_pos=-1
    local idx=0
    for (( idx=${#chunk}-1; idx>=0; idx-- )); do
      if [[ "${chunk:idx:1}" == " " ]]; then
        break_pos="$idx"
        break
      fi
    done

    if (( break_pos > 0 )); then
      printf "%s\n" "${remaining:0:break_pos}"
      remaining="${remaining:break_pos+1}"
      while [[ "$remaining" == " "* ]]; do
        remaining="${remaining:1}"
      done
    else
      printf "%s\n" "$chunk"
      remaining="${remaining:width}"
    fi
  done

  printf "%s\n" "$remaining"
}

print_plain_success_block() {
  local title="$1"
  shift || true
  local lines=("$@")
  local line=""

  printf "\n%b[SONGBIRD] %s%b\n" "$COLOR_SUCCESS" "$title" "$COLOR_RESET"
  for line in "${lines[@]}"; do
    if [[ -z "$line" ]]; then
      printf "\n"
    else
      printf "%b%s%b\n" "$COLOR_SUCCESS" "$line" "$COLOR_RESET"
    fi
  done
  printf "\n"
}

print_success_frame() {
  local title="$1"
  shift || true

  local lines=("$@")
  local terminal_width=""
  terminal_width="$(terminal_columns)"
  local frame_width=$((terminal_width - 4))

  if (( frame_width < 40 )); then
    print_plain_success_block "$title" "${lines[@]}"
    if [[ -f "$LOG_FILE" ]]; then
      local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
      printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$title" >> "$LOG_FILE" 2>/dev/null || true
      local line=""
      for line in "${lines[@]}"; do
        printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$line" >> "$LOG_FILE" 2>/dev/null || true
      done
    fi
    return 0
  fi
  if (( frame_width > 100 )); then
    frame_width=100
  fi

  local content_width=$((frame_width - 4))
  local wrapped_lines=()
  local line=""
  local segment=""
  for line in "${lines[@]}"; do
    while IFS= read -r segment; do
      wrapped_lines+=("$segment")
    done < <(wrap_success_line "$line" "$content_width")
  done

  local border=""
  printf -v border '%*s' "$((content_width + 2))" ""
  border="${border// /-}"

  printf "\n%b+%s+%b\n" "$COLOR_SUCCESS" "$border" "$COLOR_RESET"
  while IFS= read -r segment; do
    printf "%b| %-*s |%b\n" "$COLOR_SUCCESS" "$content_width" "$segment" "$COLOR_RESET"
  done < <(wrap_success_line "$title" "$content_width")
  printf "%b+%s+%b\n" "$COLOR_SUCCESS" "$border" "$COLOR_RESET"
  for line in "${wrapped_lines[@]}"; do
    printf "%b| %-*s |%b\n" "$COLOR_SUCCESS" "$content_width" "$line" "$COLOR_RESET"
  done
  printf "%b+%s+%b\n\n" "$COLOR_SUCCESS" "$border" "$COLOR_RESET"

  if [[ -f "$LOG_FILE" ]]; then
    local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$title" >> "$LOG_FILE" 2>/dev/null || true
    for line in "${lines[@]}"; do
      printf "[%s] [SONGBIRD] %s\n" "$timestamp" "$line" >> "$LOG_FILE" 2>/dev/null || true
    done
  fi
}

show_deployment_success_frame() {
  local action="$1"
  local title=""
  local lines=()

  case "$action" in
    install)
      title="Songbird Installation Complete"
      lines+=("Songbird has been installed successfully.")
      lines+=("")
      lines+=("App:")
      if [[ "$CERT_MODE" == "http" ]]; then
        if [[ "$DEPLOY_MODE" == "domain" ]]; then
          local d=""
          for d in "${DOMAIN_NAMES[@]}"; do
            lines+=("Visit: http://${d}:${CLIENT_PORT}")
          done
        else
          lines+=("Visit: http://<your-server-ip>:${CLIENT_PORT}")
        fi
      elif [[ "$DEPLOY_MODE" == "domain" ]]; then
        local d=""
        for d in "${DOMAIN_NAMES[@]}"; do
          if [[ "$CLIENT_PORT" == "443" ]]; then
            lines+=("Visit: https://${d}")
          else
            lines+=("Visit: https://${d}:${CLIENT_PORT}")
          fi
        done
      else
        local visit_ip="${CERTBOT_IP_ADDRESS:-<your-server-ip>}"
        if [[ "$CERT_MODE" == "files" ]]; then
          visit_ip="<your-server-ip>"
        fi
        if [[ "$CLIENT_PORT" == "443" ]]; then
          lines+=("Visit: https://${visit_ip}")
        else
          lines+=("Visit: https://${visit_ip}:${CLIENT_PORT}")
        fi
      fi
      ;;
    update)
      title="Songbird Update Complete"
      lines+=("Songbird has been updated successfully.")
      lines+=("Service restarted and nginx reloaded.")
      ;;
    *)
      title="Songbird Success"
      lines+=("Operation completed successfully.")
      ;;
  esac

  lines+=("")
  lines+=("Links:")
  lines+=("GitHub: ${SONGBIRD_SOCIAL_GITHUB}")
  lines+=("Telegram: ${SONGBIRD_SOCIAL_TELEGRAM}")
  lines+=("Main Server Channel: ${SONGBIRD_SOCIAL_WEBSITE}")
  lines+=("Support: ${SONGBIRD_NOWPAYMENTS}")

  print_success_frame "$title" "${lines[@]}"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

press_enter_to_continue() {
  MENU_ACTION_PAUSED="1"
  printf "\nPress Enter to return to the main menu..." >&$PROMPT_FD_OUT
  if ! IFS= read -r -u "$PROMPT_FD" _; then
    _=""
  fi
}

run_menu_action() {
  local action="$1"
  shift || true
  MENU_ACTION_PAUSED="0"

  "$action" "$@"
  local status=$?
  if [[ "$status" -eq 0 ]]; then
    return 0
  fi

  if [[ "${MENU_ACTION_PAUSED:-0}" != "1" ]]; then
    warn "Action failed. Review ${LOG_FILE} for details, then retry from the menu."
    press_enter_to_continue
  fi
  return "$status"
}

run_silent() {
  local output
  # Append command being run to log file
  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] Running: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE" 2>/dev/null || true
  fi

  if ! output="$("$@" 2>&1)"; then
    # Log the failure
    if [[ -f "$LOG_FILE" ]]; then
      printf "[%s] FAILED: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOG_FILE" 2>/dev/null || true
    fi
    # Show error to user
    printf "\n%b[ERROR] Command failed: %s%b\n" "$COLOR_ERROR" "$*" "$COLOR_RESET"
    printf "%s\n" "$output"
    return 1
  else
    # Log success + output
    if [[ -f "$LOG_FILE" ]]; then
      printf "[%s] SUCCESS: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOG_FILE" 2>/dev/null || true
    fi
  fi
}

run_logged_quiet() {
  local output
  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] Running: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE" 2>/dev/null || true
  fi

  if ! output="$("$@" 2>&1)"; then
    if [[ -f "$LOG_FILE" ]]; then
      printf "[%s] FAILED: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOG_FILE" 2>/dev/null || true
    fi
    return 1
  fi

  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] SUCCESS: %s\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" "$output" >> "$LOG_FILE" 2>/dev/null || true
  fi
}

run_unzip_capture() {
  local output=""
  local status=0
  if output="$(run_as_root "$@" </dev/null 2>&1)"; then
    status=0
  else
    status=$?
  fi
  LAST_UNZIP_OUTPUT="$output"
  LAST_UNZIP_STATUS="$status"
  [[ "$status" -eq 0 ]]
}

output_looks_password_related() {
  local text=""
  text="$(printf "%s" "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "$text" == *password* || "$text" == *encrypted* || "$text" == *"unable to get password"* || "$text" == *"incorrect password"* || "$text" == *"skipping:"* ]]
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
  local path_prefix=""
  local path_export=""
  path_prefix="$(node_tools_path_prefix)"
  if [[ -n "$path_prefix" ]]; then
    path_export="export PATH=$(printf '%q' "$path_prefix"):\$PATH; "
  fi
  run_silent run_as_root bash -lc "cd '$INSTALL_DIR' && ${path_export}$*"
}

run_in_install_dir_output() {
  local path_prefix=""
  local path_export=""
  path_prefix="$(node_tools_path_prefix)"
  if [[ -n "$path_prefix" ]]; then
    path_export="export PATH=$(printf '%q' "$path_prefix"):\$PATH; "
  fi
  if [[ -n "$SUDO" ]]; then
    $SUDO bash -lc "cd '$INSTALL_DIR' && ${path_export}$*"
  else
    bash -lc "cd '$INSTALL_DIR' && ${path_export}$*"
  fi
}

dir_has_entries() {
  local target_dir="$1"
  local first_entry=""
  first_entry="$(run_as_root_output find "$target_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)"
  [[ -n "$first_entry" ]]
}

init_prompt_io() {
  if [[ -r /dev/tty && -w /dev/tty ]]; then
    exec 3</dev/tty
    exec 4>/dev/tty
    PROMPT_FD=3
    PROMPT_FD_OUT=4
    return 0
  fi
  if [[ -t 0 ]]; then
    PROMPT_FD=0
    PROMPT_FD_OUT=1
    return 0
  fi
  fail "No interactive TTY detected. Run this script in an interactive shell."
}

prompt_read() {
  local __prompt_text="$1"
  local __prompt_result_var="$2"
  local __prompt_value=""
  printf "%s" "$__prompt_text" >&$PROMPT_FD_OUT
  if ! IFS= read -r -u "$PROMPT_FD" __prompt_value; then
    __prompt_value=""
  fi
  printf -v "$__prompt_result_var" "%s" "$__prompt_value"
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

prompt_secret() {
  local prompt="$1"
  local value=""
  while true; do
    printf "%s: " "$prompt" >&$PROMPT_FD_OUT
    if ! IFS= read -ers -u "$PROMPT_FD" value; then
      value=""
    fi
    printf "\n" >&$PROMPT_FD_OUT
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ -n "$value" ]]; then
      printf "%s" "$value"
      return 0
    fi
    printf "Please provide a value.\n"
  done
}

prompt_secret_optional() {
  local prompt="$1"
  local value=""
  printf "%s: " "$prompt" >&$PROMPT_FD_OUT
  if ! IFS= read -ers -u "$PROMPT_FD" value; then
    value=""
  fi
  printf "\n" >&$PROMPT_FD_OUT
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf "%s" "$value"
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
  local default_port="${1:-$DEFAULT_CLIENT_PORT}"
  local value=""
  while true; do
    prompt_read "Enter client (nginx) port (default: $default_port): " value
    if [[ -z "$value" ]]; then
      printf "%s" "$default_port"
      return 0
    fi
    if [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 65535 )); then
      printf "%s" "$value"
      return 0
    fi
    printf "Port must be an integer between 1 and 65535.\n"
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

strip_surrounding_quotes() {
  local value="$1"
  local first="${value:0:1}"
  local last="${value: -1}"
  if [[ ( "$first" == "\"" && "$last" == "\"" ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
    printf "%s" "${value:1:${#value}-2}"
    return 0
  fi
  printf "%s" "$value"
}

strip_carriage_returns() {
  local value="$1"
  printf "%s" "$value" | tr -d '\r'
}

file_exists_path() {
  local path="$1"
  if [[ -f "$path" ]]; then
    return 0
  fi
  if [[ -n "$SUDO" ]]; then
    $SUDO test -f "$path"
    return $?
  fi
  return 1
}

resolve_file_path() {
  local raw="$1"
  local value=""
  value="$(normalize_path_input "$raw")"
  value="$(strip_surrounding_quotes "$value")"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="$(strip_carriage_returns "$value")"
  if [[ -z "$value" ]]; then
    return 1
  fi

  if [[ "$value" == /* ]]; then
    if file_exists_path "$value"; then
      printf "%s" "$value"
      return 0
    fi
    return 1
  fi

  local candidates=(
    "$PWD/$value"
    "$HOME/$value"
    "/root/$value"
    "/$value"
  )
  local candidate=""
  for candidate in "${candidates[@]}"; do
    if file_exists_path "$candidate"; then
      printf "%s" "$candidate"
      return 0
    fi
  done
  return 1
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
    printf $'1) 🔗  Set NodeSource mirror (current: %s)\n' "${MIRROR_NODESOURCE:-<default>}"
    printf $'2) 🔗  Set apt mirror source (current: %s)\n' "${MIRROR_APT_EXTRA:-<none>}"
    printf $'3) 🔗  Set npm registry mirror (current: %s)\n' "${MIRROR_NPM:-<default>}"
    printf $'4) 🔄️  Restore defaults (clear mirrors)\n'
    printf $'5) ↩️  Go back\n'
    printf $'0) 🚪  Exit\n\n'

    prompt_read "Choose an option [0-5]: " choice
    case "$choice" in
      1)
        local val=""
        prompt_read "NodeSource mirror base URL (blank to clear): " val
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        MIRROR_NODESOURCE="$val"
        ;;
      2)
        local val=""
        prompt_read "Extra apt source line for packages (blank to clear): " val
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        MIRROR_APT_EXTRA="$val"
        ;;
      3)
        local val=""
        prompt_read "npm registry mirror URL (blank to clear): " val
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        MIRROR_NPM="$val"
        ;;
      4)
        clear_mirror_values
        ;;
      5) return ;;
      0) exit 0 ;;
      *) printf "Invalid choice. Select a number from 0 to 5.\n" ;;
    esac
  done
}

prompt_source_mode() {
  local mode=""
  while true; do
    printf "\nSource Mode\n"
    printf "1) GitHub\n"
    printf "2) Offline\n"
    prompt_read "Choose an option [1-2]: " mode
    mode="${mode#"${mode%%[![:space:]]*}"}"
    mode="${mode%"${mode##*[![:space:]]}"}"
    case "$mode" in
      1)
        SOURCE_MODE="github"
        break
        ;;
      2)
        SOURCE_MODE="offline"
        break
        ;;
      *) printf "Choose 1 or 2.\n" ;;
    esac
  done
}

prompt_deploy_mode() {
  local mode=""
  while true; do
    printf "\nDeploy Mode\n"
    printf "1) Domain\n"
    printf "2) IP\n"
    prompt_read "Choose an option [1-2]: " mode
    mode="${mode#"${mode%%[![:space:]]*}"}"
    mode="${mode%"${mode##*[![:space:]]}"}"
    case "$mode" in
      1)
        DEPLOY_MODE="domain"
        break
        ;;
      2)
        DEPLOY_MODE="ip"
        break
        ;;
      *) printf "Choose 1 or 2.\n" ;;
    esac
  done
}

prompt_cert_mode() {
  local mode=""
  while true; do
    local option_one_label="Obtain certificate"
    if [[ "$DEPLOY_MODE" == "domain" ]]; then
      option_one_label="Obtain cert for domain"
    else
      option_one_label="Obtain 6-day cert for IP"
    fi
    printf "\nCertificate Mode\n"
    printf "1) %s\n" "$option_one_label"
    printf "2) TLS certificate files\n"
    printf "3) HTTP only\n"
    prompt_read "Choose an option [1-3]: " mode
    mode="${mode#"${mode%%[![:space:]]*}"}"
    mode="${mode%"${mode##*[![:space:]]}"}"
    case "$mode" in
      1)
        CERT_MODE="certbot"
        break
        ;;
      2)
        CERT_MODE="files"
        break
        ;;
      3)
        CERT_MODE="http"
        break
        ;;
      *) printf "Choose 1, 2, or 3.\n" ;;
    esac
  done
}

prompt_backup_db_path() {
  local backup_input=""
  while true; do
    prompt_read "Enter the full path to the backup .db file: " backup_input
    if [[ -z "$backup_input" ]]; then
      printf "Please provide a file path.\n"
      continue
    fi
    local resolved=""
    resolved="$(resolve_file_path "$backup_input")" || resolved=""
    if [[ -z "$resolved" ]]; then
      printf "File not found. Tried: %s\n" "$backup_input"
      continue
    fi
    if [[ "${resolved,,}" != *.db ]]; then
      printf "Backup file must be a .db file.\n"
      continue
    fi
    printf "%s" "$resolved"
    return 0
  done
}

select_backup_db_path() {
  local use_detected=""
  local detected=""
  detected="$(find_restore_backup_db)" || detected=""
  if [[ -n "$detected" ]]; then
    use_detected="$(prompt_yes_no "Use detected backup ${detected}?" "yes")"
    if [[ "$use_detected" == "yes" ]]; then
      printf "%s" "$detected"
      return 0
    fi
  fi

  prompt_backup_db_path
}

prompt_install_backup_restore() {
  DB_BACKUP_PATH=""
  if [[ "$(prompt_yes_no "Restore database from a backup .db file during installation?" "no")" != "yes" ]]; then
    return 0
  fi

  DB_BACKUP_PATH="$(select_backup_db_path)"
  return 0
}

validate_backup_zip() {
  local zip_path="$1"
  local listing
  listing="$(run_as_root_output unzip -Z1 "$zip_path" 2>/dev/null || true)"
  if [[ -z "$listing" ]]; then
    printf "Backup zip appears empty or unreadable.\n"
    return 1
  fi
  if ! echo "$listing" | grep -qE '(^|/)data/songbird\.db$|(^|/)(songbird\.db)$'; then
    printf "Backup zip missing songbird.db.\n"
    return 1
  fi
  if ! echo "$listing" | grep -qE '(^|/)data/uploads(/|$)|(^|/)uploads(/|$)'; then
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
  local password="${3:-}"
  EXTRACT_SOURCE_DIR=""
  EXTRACT_ENV_SRC=""

  if [[ -n "$password" ]]; then
    run_unzip_capture unzip -P "$password" -q "$zip_path" -d "$tmp_dir" || return 1
  else
    run_unzip_capture unzip -q "$zip_path" -d "$tmp_dir" || return 1
  fi

  local source_dir="$tmp_dir"
  local env_src="$tmp_dir/.env"
  if [[ -d "$tmp_dir/data" ]]; then
    source_dir="$tmp_dir/data"
  fi

  local db_src="$source_dir/songbird.db"
  local uploads_src="$source_dir/uploads"

  if [[ ! -f "$db_src" || ! -d "$uploads_src" ]]; then
    return 1
  fi

  if [[ ! -f "$env_src" && -f "$source_dir/.env" ]]; then
    env_src="$source_dir/.env"
  fi

  EXTRACT_SOURCE_DIR="$source_dir"
  EXTRACT_ENV_SRC="$env_src"
  return 0
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
    ffmpeg
    nano
    zip
    unzip
  )
  if [[ "$CERT_MODE" == "certbot" && "$DEPLOY_MODE" == "domain" ]]; then
    required_pkgs+=(python3-certbot-nginx)
  fi
  local missing_pkgs=()
  local pkg=""

  for pkg in "${required_pkgs[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing_pkgs+=("$pkg")
    fi
  done

  local codename=""
  codename="$(lsb_release -sc)" || return 1
  if [[ -n "$MIRROR_APT_EXTRA" ]]; then
    log "Refreshing apt package index (temporary mirror: ${MIRROR_APT_EXTRA})..."
    if ! run_silent run_as_root apt-get update \
      -o Dir::Etc::sourcelist=/dev/null \
      -o Dir::Etc::sourceparts=/dev/null \
      -o Dir::Etc::sourcelist=- \
      -o Dir::Etc::sourceparts=- <<EOF
deb ${MIRROR_APT_EXTRA} ${codename} main restricted universe multiverse
EOF
    then
      return 1
    fi
  else
    log "Refreshing apt package index..."
    run_silent run_as_root apt-get update || return 1
  fi

  if (( ${#missing_pkgs[@]} > 0 )); then
    log "Installing missing packages: ${missing_pkgs[*]}"
    run_silent run_as_root apt-get install -y --allow-downgrades "${missing_pkgs[@]}" || return 1
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

      curl -fsSL "$MIRROR_NODESOURCE" -o "$tarball" || {
        rm -rf "$tmp_dir"
        return 1
      }

      local install_dir="/usr/local"
      run_silent run_as_root tar -xzf "$tarball" -C "$install_dir" --strip-components=1 || {
        rm -rf "$tmp_dir"
        return 1
      }

      rm -rf "$tmp_dir"

      log "Node.js installed from tarball to ${install_dir}."
      return 0
    else
      # NodeSource-compatible mirror: mirror base URL + /setup_XX.x
      local setup_url="${MIRROR_NODESOURCE%/}/setup_${NODE_MAJOR}.x"
      log "Installing Node.js ${NODE_MAJOR}.x via NodeSource-style mirror: ${setup_url}"
      if [[ -n "$SUDO" ]]; then
        curl -fsSL "$setup_url" | $SUDO -E bash - || return 1
      else
        curl -fsSL "$setup_url" | bash - || return 1
      fi
      run_silent run_as_root apt-get install -y nodejs || return 1
      return 0
    fi
  fi

  # Default: official NodeSource
  local setup_url="https://deb.nodesource.com/setup_${NODE_MAJOR}.x"
  log "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
  if [[ -n "$SUDO" ]]; then
    curl -fsSL "$setup_url" | $SUDO -E bash - || return 1
  else
    curl -fsSL "$setup_url" | bash - || return 1
  fi
  run_silent run_as_root apt-get install -y nodejs || return 1
}

resolve_node_exec_path() {
  local node_path=""
  if have_cmd node; then
    node_path="$(command -v node)"
  elif have_cmd nodejs; then
    node_path="$(command -v nodejs)"
  elif [[ -f "$SERVICE_FILE" ]]; then
    node_path="$(grep -E '^ExecStart=' "$SERVICE_FILE" | head -n 1 | sed -E 's/^ExecStart=([^[:space:]]+).*/\1/' || true)"
    if [[ ! -x "$node_path" ]]; then
      node_path=""
    fi
  fi

  if [[ -z "$node_path" ]]; then
    warn "Node.js executable not found in PATH after installation."
    return 1
  fi

  NODE_EXEC_PATH="$node_path"
  log "Using Node.js executable for systemd service: ${NODE_EXEC_PATH}"
}

resolve_npm_exec_path() {
  local npm_path=""
  if have_cmd npm; then
    npm_path="$(command -v npm)"
  fi

  if [[ -z "$npm_path" && -z "$NODE_EXEC_PATH" ]]; then
    resolve_node_exec_path >/dev/null 2>&1 || true
  fi

  if [[ -z "$npm_path" && -n "$NODE_EXEC_PATH" && -x "$(dirname "$NODE_EXEC_PATH")/npm" ]]; then
    npm_path="$(dirname "$NODE_EXEC_PATH")/npm"
  elif [[ -z "$npm_path" && -x /usr/bin/npm ]]; then
    npm_path="/usr/bin/npm"
  elif [[ -z "$npm_path" && -x /usr/local/bin/npm ]]; then
    npm_path="/usr/local/bin/npm"
  fi

  if [[ -z "$npm_path" ]]; then
    warn "npm executable not found. Install Node.js/npm or rerun the install/update flow."
    return 1
  fi

  NPM_EXEC_PATH="$npm_path"
}

node_tools_path_prefix() {
  local dirs=()
  local dir=""
  local existing=""

  if [[ -z "$NODE_EXEC_PATH" ]]; then
    resolve_node_exec_path >/dev/null 2>&1 || true
  fi
  if [[ -z "$NPM_EXEC_PATH" ]]; then
    resolve_npm_exec_path >/dev/null 2>&1 || true
  fi

  if [[ -n "$NODE_EXEC_PATH" ]]; then
    dir="$(dirname "$NODE_EXEC_PATH")"
    [[ -d "$dir" ]] && dirs+=("$dir")
  fi
  if [[ -n "$NPM_EXEC_PATH" ]]; then
    dir="$(dirname "$NPM_EXEC_PATH")"
    [[ -d "$dir" ]] && dirs+=("$dir")
  fi

  local unique=()
  for dir in "${dirs[@]}"; do
    local seen="no"
    for existing in "${unique[@]}"; do
      if [[ "$existing" == "$dir" ]]; then
        seen="yes"
        break
      fi
    done
    [[ "$seen" == "no" ]] && unique+=("$dir")
  done

  local prefix=""
  for dir in "${unique[@]}"; do
    if [[ -z "$prefix" ]]; then
      prefix="$dir"
    else
      prefix="${prefix}:${dir}"
    fi
  done
  printf "%s" "$prefix"
}


ensure_service_user_exists() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating dedicated system user: ${SERVICE_USER}"
    run_silent run_as_root useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" || return 1
  fi
}

map_lego_arch() {
  local machine=""
  machine="$(uname -m)"
  case "$machine" in
    x86_64|amd64) printf "amd64" ;;
    aarch64|arm64) printf "arm64" ;;
    armv7l|armv7) printf "armv7" ;;
    armv6l|armv6) printf "armv6" ;;
    i386|i686) printf "386" ;;
    *)
      warn "Unsupported architecture for lego binary install: ${machine}"
      return 1
      ;;
  esac
}

lego_supports_shortlived_profile() {
  [[ -x "$LEGO_BIN" ]] || return 1
  local help_text=""
  help_text="$("$LEGO_BIN" run --help 2>&1 || true)"
  [[ "$help_text" == *"--profile"* ]]
}

ensure_lego_installed() {
  if [[ -x "$LEGO_BIN" ]]; then
    if lego_supports_shortlived_profile; then
      log "lego binary already installed at ${LEGO_BIN}."
      return 0
    fi
    warn "Existing lego binary at ${LEGO_BIN} does not support --profile; upgrading."
  fi

  local latest_url=""
  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/go-acme/lego/releases/latest)" || {
    warn "Unable to resolve latest lego release URL."
    return 1
  }
  local latest_tag="${latest_url##*/}"
  if [[ -z "$latest_tag" ]]; then
    warn "Unable to determine latest lego release tag."
    return 1
  fi

  local arch=""
  arch="$(map_lego_arch)" || return 1
  local asset="lego_${latest_tag}_linux_${arch}.tar.gz"
  local download_url="https://github.com/go-acme/lego/releases/download/${latest_tag}/${asset}"
  local tmp_dir=""
  tmp_dir="$(mktemp -d)"

  log "Downloading lego ${latest_tag} for linux/${arch}..."
  curl -fsSL "$download_url" -o "${tmp_dir}/${asset}" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    warn "Unable to download lego binary from ${download_url}"
    return 1
  }

  run_silent run_as_root tar -xzf "${tmp_dir}/${asset}" -C "$tmp_dir" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  }
  run_silent run_as_root install -m 755 "${tmp_dir}/lego" "$LEGO_BIN" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  }
  run_silent run_as_root rm -rf "$tmp_dir" || return 1
  log "Installed lego at ${LEGO_BIN}."

  if ! lego_supports_shortlived_profile; then
    warn "Installed lego at ${LEGO_BIN} does not support --profile. Please verify the binary and try again."
    return 1
  fi
}

clone_repo() {
  run_silent run_as_root mkdir -p "$INSTALL_DIR" || return 1

  if run_as_root test -d "$INSTALL_DIR/.git"; then
    log "Repository exists at ${INSTALL_DIR}. Updating source..."
    run_in_install_dir "git fetch --all --prune" || return 1
    run_in_install_dir "git checkout main" || return 1
    run_in_install_dir "git pull --ff-only origin main" || return 1
    return 0
  fi

  if dir_has_entries "$INSTALL_DIR"; then
    if [[ "$(prompt_yes_no "${INSTALL_DIR} exists and is not empty. Delete it and re-clone from GitHub?" "no")" != "yes" ]]; then
      warn "Installation canceled. Clear ${INSTALL_DIR} or use offline mode."
      return 1
    fi
    run_as_root rm -rf "$INSTALL_DIR" || return 1
    run_silent run_as_root mkdir -p "$INSTALL_DIR" || return 1
  fi

  log "Cloning Songbird repository..."
  run_silent run_as_root git clone "$REPO_URL" "$INSTALL_DIR" || return 1
}

prepare_install_dir_for_offline() {
  run_silent run_as_root mkdir -p "$INSTALL_DIR"
  if dir_has_entries "$INSTALL_DIR"; then
    warn "${INSTALL_DIR} is not empty. Clear it before installation."
    press_enter_to_continue
    return 1
  fi
  return 0
}

find_offline_source_zip() {
  local zip_name="songbird.zip"
  local candidates=(
    "$HOME/${zip_name}"
    "/root/${zip_name}"
    "/${zip_name}"
  )
  local candidate=""
  for candidate in "${candidates[@]}"; do
    if file_exists_path "$candidate"; then
      printf "%s" "$candidate"
      return 0
    fi
  done
  return 1
}

find_restore_backup_db() {
  local candidates=(
    "/opt/songbird/data/backups"
    "/root"
  )
  local dir=""
  for dir in "${candidates[@]}"; do
    local found=""
    found="$(run_as_root_output bash -lc "find '$dir' -maxdepth 1 -type f -name 'songbird-backup-*.db' -printf '%T@\t%p\n' 2>/dev/null | sort -nr | head -1 | cut -f2-" | tr -d '\r\n')" || found=""
    if [[ -n "$found" && -f "$found" ]]; then
      printf "%s" "$found"
      return 0
    fi
  done
  return 1
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

ensure_offline_source_ready() {
  local mode_label="$1"
  local zip_path=""
  zip_path="$(find_offline_source_zip)" || zip_path=""
  if [[ -z "$zip_path" ]]; then
    warn "Offline ${mode_label} requires /songbird.zip to be available at the filesystem root."
    press_enter_to_continue
    return 1
  fi
  SOURCE_ZIP_PATH="$zip_path"
  return 0
}

extract_offline_source_zip() {
  local zip_path="$1"
  local mode_label="$2"
  if ! have_cmd unzip; then
    warn "unzip is required for offline ${mode_label}s. Install it first and retry."
    return 1
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  if ! run_silent run_as_root unzip -q "$zip_path" -d "$tmp_dir"; then
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  fi

  local source_root
  source_root="$(resolve_offline_source_root "$tmp_dir")" || {
    run_silent run_as_root rm -rf "$tmp_dir"
    warn "Source zip does not appear to contain Songbird (missing server/client/package.json)."
    return 1
  }

  printf "%s|%s" "$tmp_dir" "$source_root"
}

read_version_value() {
  local version_file="$1"
  if [[ ! -f "$version_file" ]]; then
    return 1
  fi
  local version=""
  version="$(head -n 1 "$version_file" | tr -d '\r\n' | xargs)"
  if [[ -z "$version" ]]; then
    return 1
  fi
  printf "%s" "$version"
}

offline_source_is_newer() {
  local source_root="$1"
  local install_root="$2"

  local source_version_file="$source_root/VERSION"
  local install_version_file="$install_root/VERSION"
  local source_version=""
  local install_version=""

  source_version="$(read_version_value "$source_version_file")" || {
    warn "Offline source is missing VERSION. Skipping update."
    return 1
  }

  install_version="$(read_version_value "$install_version_file")" || install_version=""
  if [[ -z "$install_version" ]]; then
    log "Installed app is missing VERSION. Treating offline source ${source_version} as newer."
    return 0
  fi

  if dpkg --compare-versions "$source_version" gt "$install_version"; then
    log "Offline source version ${source_version} is newer than installed version ${install_version}."
    return 0
  fi

  log "Offline source version ${source_version} is not newer than installed version ${install_version}."
  return 1
}

install_source_from_zip() {
  local zip_path="$1"
  prepare_install_dir_for_offline || return 1
  local extract_result=""
  extract_result="$(extract_offline_source_zip "$zip_path" "install")" || return 1
  local tmp_dir="${extract_result%%|*}"
  local source_root="${extract_result#*|}"

  prepare_source_root_for_data_copy "$zip_path" "$source_root" "install"

  run_silent run_as_root cp -a "$source_root"/. "$INSTALL_DIR"/ || {
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  }
  if [[ -f "$source_root/.env.example" ]]; then
    run_silent run_as_root cp -a "$source_root/.env.example" "$INSTALL_DIR/.env.example" || {
      run_silent run_as_root rm -rf "$tmp_dir"
      return 1
    }
  fi
  apply_ownership || {
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  }
  run_silent run_as_root rm -rf "$tmp_dir" || return 1
  return 0
}

update_source_from_zip() {
  local zip_path="$1"
  local extract_result=""
  extract_result="$(extract_offline_source_zip "$zip_path" "update")" || return 1
  local tmp_dir="${extract_result%%|*}"
  local source_root="${extract_result#*|}"

  prepare_source_root_for_data_copy "$zip_path" "$source_root" "update"

  run_silent run_as_root cp -a "$source_root"/. "$INSTALL_DIR"/ || {
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  }
  if [[ -f "$source_root/.env.example" ]]; then
    run_silent run_as_root cp -a "$source_root/.env.example" "$INSTALL_DIR/.env.example" || {
      run_silent run_as_root rm -rf "$tmp_dir"
      return 1
    }
  fi
  apply_ownership || {
    run_silent run_as_root rm -rf "$tmp_dir"
    return 1
  }
  run_silent run_as_root rm -rf "$tmp_dir" || return 1
}

install_songbird_dependencies() {
  local npm_registry_arg=""
  if [[ -n "$MIRROR_NPM" ]]; then
    npm_registry_arg="--registry $(printf '%q' "$MIRROR_NPM")"
  fi

  log "Installing server dependencies..."
  run_in_install_dir "npm ${npm_registry_arg} --prefix server install" || return 1

  log "Installing client dependencies..."
  run_in_install_dir "npm ${npm_registry_arg} --prefix client install" || return 1

  log "Building client..."
  run_in_install_dir "npm --prefix client run build" || return 1
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

bytes_to_mb_rounded_up() {
  local bytes="$(printf "%s" "$1" | tr -d '[:space:]')"
  if [[ -z "$bytes" || ! "$bytes" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  printf "%s" "$(((bytes + 1048576 - 1) / 1048576))"
}

get_existing_env_mb_value_with_fallback() {
  local primary="$1"
  local legacy_bytes_key="$2"
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

  local legacy_bytes
  legacy_bytes="$(grep -E "^${legacy_bytes_key}=" "$env_file" | tail -n 1 | cut -d "=" -f 2- || true)"
  if [[ -n "$legacy_bytes" ]]; then
    local converted=""
    converted="$(bytes_to_mb_rounded_up "$legacy_bytes")" || converted=""
    if [[ -n "$converted" ]]; then
      printf "%s" "$converted"
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
  write_env_fallback "$env_file" || return 1
  CURRENT_ENV_FILE="$env_file"
}

write_env_fallback() {
  local env_file="$1"
  local existing_storage_encryption_key
  local existing_admin_api_token
  local existing_public_key
  local existing_private_key
  local existing_subject
  existing_storage_encryption_key="$(get_existing_env_value "STORAGE_ENCRYPTION_KEY" "")"
  existing_admin_api_token="$(get_existing_env_value "ADMIN_API_TOKEN" "")"
  existing_public_key="$(get_existing_env_value "VAPID_PUBLIC_KEY" "")"
  existing_private_key="$(get_existing_env_value "VAPID_PRIVATE_KEY" "")"
  existing_subject="$(get_existing_env_value "VAPID_SUBJECT" "mailto:admin@example.com")"
  run_silent run_as_root bash -lc "cat > '$env_file' <<'EOF'
# Server Configuration
SERVER_PORT=${SERVER_PORT}
CLIENT_PORT=${CLIENT_PORT}

# Application Settings
APP_ENV=production

# Security & Encryption
# Auto-generated by the server on first boot if left empty.
STORAGE_ENCRYPTION_KEY=${existing_storage_encryption_key}
# Token gating the local-only admin endpoint. Auto-generated if left empty.
ADMIN_API_TOKEN=${existing_admin_api_token}

# Push Notifications
VAPID_PUBLIC_KEY=${existing_public_key}
VAPID_PRIVATE_KEY=${existing_private_key}
VAPID_SUBJECT=${existing_subject}

# NOTE: All other application settings (sign-up, file uploads, retention,
# limits, remote channel, client tuning, push proxy, etc.) are configured from
# the in-app Admin Panel after installation.
EOF" || return 1
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    replace_env_value "$env_file" "VAPID_SUBJECT" "mailto:${CERTBOT_EMAIL}" || return 1
  fi
  log "Wrote environment config to ${env_file}."
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
  local path_prefix=""
  local path_export=""
  path_prefix="$(node_tools_path_prefix)"
  if [[ -n "$path_prefix" ]]; then
    path_export="export PATH=$(printf '%q' "$path_prefix"):\$PATH; "
  fi
  local stdout_file=""
  local stderr_file=""
  local generate_command=""
  stdout_file="$(mktemp)" || return 1
  stderr_file="$(mktemp)" || {
    rm -f "$stdout_file"
    return 1
  }
  generate_command="cd '$INSTALL_DIR/server' && ${path_export}node --input-type=module -e \"import pkg from 'web-push'; const { generateVAPIDKeys } = pkg; const k = generateVAPIDKeys(); console.log(k.publicKey); console.log(k.privateKey);\""
  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] Running: generate VAPID keys\n" "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE" 2>/dev/null || true
  fi
  if ! run_as_root bash -lc "$generate_command" >"$stdout_file" 2>"$stderr_file"; then
    local vapid_error=""
    vapid_error="$(cat "$stderr_file" "$stdout_file" 2>/dev/null || true)"
    if [[ -f "$LOG_FILE" ]]; then
      printf "[%s] FAILED: generate VAPID keys\n%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$vapid_error" >> "$LOG_FILE" 2>/dev/null || true
    fi
    [[ -n "$vapid_error" ]] && printf "%s\n" "$vapid_error"
    rm -f "$stdout_file" "$stderr_file"
    warn "Failed to generate VAPID keys. Make sure server dependencies are installed."
    return 1
  fi
  keys="$(cat "$stdout_file" 2>/dev/null || true)"
  rm -f "$stdout_file" "$stderr_file"
  local new_public=""
  local new_private=""
  new_public="$(printf "%s\n" "$keys" | sed -n '1p' | tr -d '\r')"
  new_private="$(printf "%s\n" "$keys" | sed -n '2p' | tr -d '\r')"
  if [[ -z "$new_public" || -z "$new_private" ]]; then
    if [[ -f "$LOG_FILE" ]]; then
      printf "[%s] FAILED: generate VAPID keys\nExpected public/private key output, but received incomplete output. Raw key output redacted.\n" "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE" 2>/dev/null || true
    fi
    warn "VAPID key generation returned incomplete output."
    return 1
  fi
  if [[ -f "$LOG_FILE" ]]; then
    printf "[%s] SUCCESS: generate VAPID keys\n(output redacted)\n" "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE" 2>/dev/null || true
  fi
  replace_env_value "$env_file" "VAPID_PUBLIC_KEY" "$new_public" || return 1
  replace_env_value "$env_file" "VAPID_PRIVATE_KEY" "$new_private" || return 1
  log "VAPID keys generated and saved to ${env_file}."
}

open_env_editor() {
  local env_file="$1"
  local editor_cmd="${EDITOR:-nano}"
  if ! have_cmd "$editor_cmd"; then
    editor_cmd="vi"
  fi

  log "Opening ${env_file} with ${editor_cmd}. Save and close to continue."

  if [[ -n "$SUDO" ]]; then
    $SUDO -t "$editor_cmd" "$env_file"
  else
    "$editor_cmd" "$env_file"
  fi

  clear
}

sync_values_from_env() {
  local env_file="$INSTALL_DIR/.env"
  SERVER_PORT="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "$DEFAULT_SERVER_PORT")"
  CLIENT_PORT="$(get_existing_env_value "CLIENT_PORT" "$DEFAULT_CLIENT_PORT")"
  FILE_UPLOAD="$(get_existing_env_value "FILE_UPLOAD" "$DEFAULT_FILE_UPLOAD")"
  MAX_UPLOAD_MB="$(get_existing_env_mb_value_with_fallback "FILE_UPLOAD_MAX_TOTAL_SIZE_MB" "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_MAX_UPLOAD_MB")"
  RETENTION_DAYS="$(get_existing_env_value "MESSAGE_FILE_RETENTION" "$DEFAULT_RETENTION_DAYS")"
  TEXT_RETENTION_DAYS="$(get_existing_env_value "MESSAGE_TEXT_RETENTION" "$DEFAULT_TEXT_RETENTION_DAYS")"
  ACCOUNT_CREATION="$(get_existing_env_value_with_fallback "SIGN_UP" "ACCOUNT_CREATION" "$DEFAULT_SIGN_UP")"
  CURRENT_ENV_FILE="$env_file"
}

parse_domain_input() {
  local raw="$1"
  DOMAIN_NAMES=()
  DOMAIN_GROUPS=()
  local seen_names=""
  local IFS=','
  local d
  for d in $raw; do
    d="${d#"${d%%[![:space:]]*}"}"
    d="${d%"${d##*[![:space:]]}"}"
    d="${d#http://}"
    d="${d#https://}"
    d="${d%%/*}"
    d="${d%.}"
    d="$(printf '%s' "$d" | tr '[:upper:]' '[:lower:]')"
    if [[ -n "$d" && "$seen_names" != *"|${d}|"* ]]; then
      DOMAIN_NAMES+=("$d")
      seen_names="${seen_names}|${d}|"
    fi
  done
  build_domain_groups
  NGINX_SERVER_NAME="${DOMAIN_NAMES[*]}"
}

build_domain_groups() {
  DOMAIN_GROUPS=()

  if (( ${#DOMAIN_NAMES[@]} == 0 )); then
    return 0
  fi

  local grouped_names="|"
  local domain=""
  for domain in "${DOMAIN_NAMES[@]}"; do
    if [[ "$grouped_names" == *"|${domain}|"* ]]; then
      continue
    fi

    local partner=""
    if [[ "$domain" == www.* ]]; then
      partner="${domain#www.}"
      if [[ -n "$partner" && "$grouped_names" != *"|${partner}|"* && " ${DOMAIN_NAMES[*]} " == *" ${partner} "* ]]; then
        DOMAIN_GROUPS+=("${partner},${domain}")
        grouped_names="${grouped_names}${partner}|${domain}|"
        continue
      fi
    else
      partner="www.${domain}"
      if [[ "$grouped_names" != *"|${partner}|"* && " ${DOMAIN_NAMES[*]} " == *" ${partner} "* ]]; then
        DOMAIN_GROUPS+=("${domain},${partner}")
        grouped_names="${grouped_names}${domain}|${partner}|"
        continue
      fi
    fi

    DOMAIN_GROUPS+=("${domain}")
    grouped_names="${grouped_names}${domain}|"
  done
}

group_csv_to_space_list() {
  local csv="${1:-}"
  printf '%s' "${csv//,/ }"
}

group_primary_domain() {
  local csv="${1:-}"
  printf '%s' "${csv%%,*}"
}

manual_cert_group_install_dir() {
  local group_csv="${1:-}"
  local primary_domain=""
  primary_domain="$(group_primary_domain "$group_csv")"
  printf '%s/%s' "$CERT_INSTALL_DIR" "$primary_domain"
}

manual_group_fullchain_path() {
  local group_csv="${1:-}"
  printf '%s/fullchain.pem' "$(manual_cert_group_install_dir "$group_csv")"
}

manual_group_privkey_path() {
  local group_csv="${1:-}"
  printf '%s/privkey.pem' "$(manual_cert_group_install_dir "$group_csv")"
}

log_domain_groups() {
  if (( ${#DOMAIN_GROUPS[@]} == 0 )); then
    return 0
  fi

  local idx=1
  local group_csv=""
  for group_csv in "${DOMAIN_GROUPS[@]}"; do
    log "Detected domain group ${idx}: $(group_csv_to_space_list "$group_csv")"
    idx=$((idx + 1))
  done
}

build_domain_cert_groups() {
  local __result_var="$1"
  local serialized=""

  if [[ ! "$__result_var" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    return 1
  fi

  eval "$__result_var=()"

  if [[ "$DEPLOY_MODE" != "domain" ]]; then
    return 0
  fi

  serialized="$(declare -p DOMAIN_GROUPS)"
  serialized="${serialized#declare -a DOMAIN_GROUPS=}"
  eval "$__result_var=$serialized"
}


collect_install_options() {
  prompt_deploy_mode

  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    local raw_domains=""
    while true; do
      prompt_read "Enter your domain(s), comma-separated (e.g. example.com, www.example.com): " raw_domains
      raw_domains="${raw_domains#"${raw_domains%%[![:space:]]*}"}"
      raw_domains="${raw_domains%"${raw_domains##*[![:space:]]}"}"
      if [[ -n "$raw_domains" ]]; then
        parse_domain_input "$raw_domains"
        if (( ${#DOMAIN_NAMES[@]} > 0 )); then
          log_domain_groups
          break
        fi
      fi
      printf "Please enter at least one domain.\n"
    done
  else
    NGINX_SERVER_NAME="_"
  fi

  prompt_cert_mode

  case "$CERT_MODE" in
    certbot)
      CERTBOT_EMAIL="$(prompt_non_empty "Enter email for Let's Encrypt renewal notices")"
      if [[ "$DEPLOY_MODE" == "ip" ]]; then
        CERTBOT_IP_ADDRESS="$(prompt_non_empty "Enter the public IP address for the TLS certificate")"
        NGINX_SERVER_NAME="$CERTBOT_IP_ADDRESS"
      fi
      ;;
    files)
      MANUAL_CERT_GROUP_FULLCHAIN_PATHS=()
      MANUAL_CERT_GROUP_PRIVKEY_PATHS=()
      if [[ "$DEPLOY_MODE" == "domain" ]]; then
        local group_csv=""
        for group_csv in "${DOMAIN_GROUPS[@]}"; do
          while true; do
            MANUAL_CERT_FULLCHAIN_PATH="$(prompt_non_empty "Enter path to fullchain.pem for $(group_csv_to_space_list "$group_csv")")"
            MANUAL_CERT_FULLCHAIN_PATH="$(resolve_file_path "$MANUAL_CERT_FULLCHAIN_PATH")" || MANUAL_CERT_FULLCHAIN_PATH=""
            if [[ -n "$MANUAL_CERT_FULLCHAIN_PATH" ]]; then
              MANUAL_CERT_GROUP_FULLCHAIN_PATHS+=("$MANUAL_CERT_FULLCHAIN_PATH")
              break
            fi
            printf "Could not find that fullchain.pem file.\n"
          done
          while true; do
            MANUAL_CERT_PRIVKEY_PATH="$(prompt_non_empty "Enter path to privkey.pem for $(group_csv_to_space_list "$group_csv")")"
            MANUAL_CERT_PRIVKEY_PATH="$(resolve_file_path "$MANUAL_CERT_PRIVKEY_PATH")" || MANUAL_CERT_PRIVKEY_PATH=""
            if [[ -n "$MANUAL_CERT_PRIVKEY_PATH" ]]; then
              MANUAL_CERT_GROUP_PRIVKEY_PATHS+=("$MANUAL_CERT_PRIVKEY_PATH")
              break
            fi
            printf "Could not find that privkey.pem file.\n"
          done
        done
      else
        while true; do
          MANUAL_CERT_FULLCHAIN_PATH="$(prompt_non_empty "Enter path to fullchain.pem")"
          MANUAL_CERT_FULLCHAIN_PATH="$(resolve_file_path "$MANUAL_CERT_FULLCHAIN_PATH")" || MANUAL_CERT_FULLCHAIN_PATH=""
          if [[ -n "$MANUAL_CERT_FULLCHAIN_PATH" ]]; then
            break
          fi
          printf "Could not find that fullchain.pem file.\n"
        done
        while true; do
          MANUAL_CERT_PRIVKEY_PATH="$(prompt_non_empty "Enter path to privkey.pem")"
          MANUAL_CERT_PRIVKEY_PATH="$(resolve_file_path "$MANUAL_CERT_PRIVKEY_PATH")" || MANUAL_CERT_PRIVKEY_PATH=""
          if [[ -n "$MANUAL_CERT_PRIVKEY_PATH" ]]; then
            break
          fi
          printf "Could not find that privkey.pem file.\n"
        done
      fi
      ;;
  esac


  SERVER_PORT="$(prompt_port)"
  if [[ "$CERT_MODE" == "http" ]]; then
    CLIENT_PORT="$(prompt_client_port "$DEFAULT_CLIENT_PORT")"
  else
    CLIENT_PORT="$(prompt_client_port "443")"
  fi
  if [[ "$CERT_MODE" != "http" ]]; then
    log "Using HTTP redirect on port 80 and HTTPS on port ${CLIENT_PORT}."
  fi

}

write_full_env_with_defaults() {
  run_silent run_as_root mkdir -p "$INSTALL_DIR" || return 1
  write_env_from_example || return 1
}

apply_ownership() {
  ensure_service_user_exists || return 1
  run_silent run_as_root chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$INSTALL_DIR" || return 1
  run_silent run_as_root git config --global --add safe.directory "$INSTALL_DIR" || return 1
}

configure_systemd_service() {
  log "Creating systemd service at ${SERVICE_FILE}..."
  if [[ -z "$NODE_EXEC_PATH" ]]; then
    resolve_node_exec_path || return 1
  fi
  if ! run_silent run_as_root tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${INSTALL_DIR}/server
ExecStart=${NODE_EXEC_PATH} ${INSTALL_DIR}/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  then
    return 1
  fi

  run_as_root systemctl daemon-reload || return 1
  run_as_root systemctl enable --now songbird.service || return 1
  run_as_root systemctl restart songbird.service || return 1
}

write_nginx_site_config() {
  local mode="${1:-http}"
  local cert_path="${2:-}"
  local key_path="${3:-}"
  local ssl_block=""
  local acme_block=""
  local redirect_server_block=""
  local config_body=""
  local listen_line="listen ${CLIENT_PORT} default_server;"
  local alternate_listen_line="listen ${CLIENT_PORT};"
  local domain_group_csv=""
  local domain_group_names=""
  local primary_domain=""
  local cert_line_path="$cert_path"
  local key_line_path="$key_path"
  local current_listen_line=""

  if [[ "$mode" == "http" && "$DEPLOY_MODE" == "domain" && "$CERT_MODE" == "certbot" ]]; then
    listen_line="listen 80 default_server;"
    alternate_listen_line="listen 80;"
  fi

  if [[ "$mode" == "ssl" ]]; then
    listen_line="listen ${CLIENT_PORT} ssl default_server;"
    alternate_listen_line="listen ${CLIENT_PORT} ssl;"
    ssl_block=$(cat <<EOF
  ssl_certificate ${cert_path};
  ssl_certificate_key ${key_path};
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;
EOF
)

    if [[ "$DEPLOY_MODE" == "ip" && "$CERT_MODE" == "certbot" ]]; then
      redirect_server_block=$(cat <<EOF

server {
  listen 80;
  ${server_name_line}
  location /.well-known/acme-challenge/ {
    root ${ACME_WEBROOT};
    default_type "text/plain";
  }
  if (\$request_uri !~ "^/\\.well-known/acme-challenge/") {
    return 301 https://\$host$( [[ "$CLIENT_PORT" == "443" ]] && printf "" || printf ":%s" "$CLIENT_PORT" )\$request_uri;
  }
}
EOF
)
    elif [[ "$CLIENT_PORT" == "443" ]]; then
      redirect_server_block=$(cat <<EOF

server {
  listen 80;
  ${server_name_line}
  return 301 https://\$host\$request_uri;
}
EOF
)
    elif [[ "$CLIENT_PORT" != "80" ]]; then
      redirect_server_block=$(cat <<EOF

server {
  listen 80;
  ${server_name_line}
  return 301 https://\$host:${CLIENT_PORT}\$request_uri;
}
EOF
)
    fi
  fi

  if [[ "$mode" == "http" && "$DEPLOY_MODE" == "ip" && "$CERT_MODE" == "certbot" ]]; then
    run_silent run_as_root mkdir -p "$ACME_WEBROOT"
    acme_block=$(cat <<EOF

  location /.well-known/acme-challenge/ {
    root ${ACME_WEBROOT};
    default_type "text/plain";
  }
EOF
)
  fi

  log "Creating Nginx config at ${NGINX_SITE_FILE}..."
  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    local domain_cert_groups=()
    build_domain_cert_groups domain_cert_groups

    for domain_group_csv in "${domain_cert_groups[@]}"; do
      if [[ -z "$config_body" ]]; then
        current_listen_line="$listen_line"
      else
        current_listen_line="$alternate_listen_line"
      fi

      domain_group_names="$(group_csv_to_space_list "$domain_group_csv")"
      primary_domain="$(group_primary_domain "$domain_group_csv")"

      if [[ "$mode" == "ssl" && "$CERT_MODE" == "certbot" ]]; then
        cert_line_path="/etc/letsencrypt/live/${primary_domain}/fullchain.pem"
        key_line_path="/etc/letsencrypt/live/${primary_domain}/privkey.pem"
        ssl_block=$(cat <<EOF
  ssl_certificate ${cert_line_path};
  ssl_certificate_key ${key_line_path};
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;
EOF
)
      elif [[ "$mode" == "ssl" && "$CERT_MODE" == "files" ]]; then
        cert_line_path="$(manual_group_fullchain_path "$domain_group_csv")"
        key_line_path="$(manual_group_privkey_path "$domain_group_csv")"
        ssl_block=$(cat <<EOF
  ssl_certificate ${cert_line_path};
  ssl_certificate_key ${key_line_path};
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;
EOF
)
      fi

      config_body+=$(cat <<EOF
server {
  ${current_listen_line}
  server_name ${domain_group_names};
  client_max_body_size ${MAX_UPLOAD_MB}m;
${ssl_block}

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
)
    done
  else
    config_body=$(cat <<EOF
server {
  ${listen_line}
  server_name ${NGINX_SERVER_NAME};
  client_max_body_size ${MAX_UPLOAD_MB}m;
${ssl_block}
${acme_block}

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
)
  fi

  run_silent run_as_root tee "$NGINX_SITE_FILE" >/dev/null <<EOF
${config_body}${redirect_server_block}
EOF
}

configure_nginx() {
  log "Preparing initial HTTP nginx configuration..."
  write_nginx_site_config "http" || return 1

  run_as_root ln -sfn "$NGINX_SITE_FILE" "$NGINX_ENABLED_FILE" || return 1
  if run_as_root test -f /etc/nginx/sites-enabled/default; then
    run_as_root rm -f /etc/nginx/sites-enabled/default || return 1
  fi

  log "Testing nginx configuration..."
  run_as_root nginx -t || return 1
  log "Reloading nginx..."
  run_as_root systemctl reload nginx || return 1
  log "Initial nginx configuration is active."
}

install_ssl_files_into_nginx() {
  local cert_path="$1"
  local key_path="$2"

  write_nginx_site_config "ssl" "$cert_path" "$key_path" || return 1
  run_as_root nginx -t || return 1
  run_as_root systemctl reload nginx || return 1
  log "Nginx SSL configured."
}

configure_manual_ssl_files() {
  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    local idx=0
    local group_csv=""
    run_silent run_as_root mkdir -p "$CERT_INSTALL_DIR" || return 1
    for group_csv in "${DOMAIN_GROUPS[@]}"; do
      local source_fullchain="${MANUAL_CERT_GROUP_FULLCHAIN_PATHS[$idx]:-}"
      local source_privkey="${MANUAL_CERT_GROUP_PRIVKEY_PATHS[$idx]:-}"
      local install_dir=""
      install_dir="$(manual_cert_group_install_dir "$group_csv")"
      local installed_fullchain=""
      installed_fullchain="$(manual_group_fullchain_path "$group_csv")"
      local installed_privkey=""
      installed_privkey="$(manual_group_privkey_path "$group_csv")"

      if [[ ! -f "$source_fullchain" || ! -f "$source_privkey" ]]; then
        warn "Manual certificate files were not found for group: $(group_csv_to_space_list "$group_csv")"
        return 1
      fi

      run_silent run_as_root mkdir -p "$install_dir" || return 1
      run_silent run_as_root rm -f "$installed_fullchain" "$installed_privkey" || return 1
      run_silent run_as_root cp -Lf "$source_fullchain" "$installed_fullchain" || return 1
      run_silent run_as_root cp -Lf "$source_privkey" "$installed_privkey" || return 1
      run_silent run_as_root chmod 644 "$installed_fullchain" || return 1
      run_silent run_as_root chmod 600 "$installed_privkey" || return 1
      idx=$((idx + 1))
    done

    write_nginx_site_config "ssl" || return 1
    run_as_root nginx -t || return 1
    run_as_root systemctl reload nginx || return 1
    log "Nginx SSL configured."
    return 0
  fi

  if [[ ! -f "$MANUAL_CERT_FULLCHAIN_PATH" || ! -f "$MANUAL_CERT_PRIVKEY_PATH" ]]; then
    warn "Manual certificate files were not found."
    return 1
  fi

  run_silent run_as_root mkdir -p "$CERT_INSTALL_DIR" || return 1
  run_silent run_as_root rm -f "$CERT_INSTALL_DIR/fullchain.pem" "$CERT_INSTALL_DIR/privkey.pem" || return 1
  run_silent run_as_root cp -Lf "$MANUAL_CERT_FULLCHAIN_PATH" "$CERT_INSTALL_DIR/fullchain.pem" || return 1
  run_silent run_as_root cp -Lf "$MANUAL_CERT_PRIVKEY_PATH" "$CERT_INSTALL_DIR/privkey.pem" || return 1
  run_silent run_as_root chmod 644 "$CERT_INSTALL_DIR/fullchain.pem" || return 1
  run_silent run_as_root chmod 600 "$CERT_INSTALL_DIR/privkey.pem" || return 1

  install_ssl_files_into_nginx "$CERT_INSTALL_DIR/fullchain.pem" "$CERT_INSTALL_DIR/privkey.pem" || return 1
}

install_lego_certificate_files() {
  local cert_name="$1"
  local cert_file="${LEGO_STATE_DIR}/certificates/${cert_name}.crt"
  local issuer_file="${LEGO_STATE_DIR}/certificates/${cert_name}.issuer.crt"
  local key_file="${LEGO_STATE_DIR}/certificates/${cert_name}.key"

  if [[ ! -f "$cert_file" ]]; then
    warn "lego certificate file not found: ${cert_file}"
    return 1
  fi
  if [[ ! -f "$key_file" ]]; then
    warn "lego private key file not found: ${key_file}"
    return 1
  fi

  run_silent run_as_root mkdir -p "$CERT_INSTALL_DIR" || return 1
  run_silent run_as_root env CERT_FILE="$cert_file" ISSUER_FILE="$issuer_file" FULLCHAIN_FILE="$CERT_INSTALL_DIR/fullchain.pem" bash -lc '
    cat "$CERT_FILE" > "$FULLCHAIN_FILE"
    if [[ -f "$ISSUER_FILE" ]]; then
      cat "$ISSUER_FILE" >> "$FULLCHAIN_FILE"
    fi
  ' || {
    warn "Unable to assemble fullchain.pem from lego certificate files."
    return 1
  }
  run_silent run_as_root cp -Lf "$key_file" "$CERT_INSTALL_DIR/privkey.pem" || return 1
  run_silent run_as_root chmod 644 "$CERT_INSTALL_DIR/fullchain.pem" || return 1
  run_silent run_as_root chmod 600 "$CERT_INSTALL_DIR/privkey.pem" || return 1

  install_ssl_files_into_nginx "$CERT_INSTALL_DIR/fullchain.pem" "$CERT_INSTALL_DIR/privkey.pem" || return 1
}

configure_lego_ip_ssl() {
  if [[ -z "$CERTBOT_IP_ADDRESS" ]]; then
    warn "Missing public IP address for Certbot IP certificate setup."
    return 1
  fi

  ensure_lego_installed || return 1
  run_silent run_as_root mkdir -p "$ACME_WEBROOT/.well-known/acme-challenge" || return 1
  run_silent run_as_root mkdir -p "$LEGO_STATE_DIR" || return 1

  log "Requesting 6-day IP certificate for ${CERTBOT_IP_ADDRESS} with lego..."
  run_logged_quiet run_as_root "$LEGO_BIN" \
    --accept-tos \
    --email "$CERTBOT_EMAIL" \
    --path "$LEGO_STATE_DIR" \
    --disable-cn \
    --http \
    --http.webroot "$ACME_WEBROOT" \
    --domains "$CERTBOT_IP_ADDRESS" \
    run \
    --profile shortlived || {
      warn "ERROR: lego failed for IP ${CERTBOT_IP_ADDRESS}"
      return 1
    }

  install_lego_certificate_files "$CERTBOT_IP_ADDRESS" || return 1
  configure_lego_renewal_timer || return 1
  log "Nginx SSL configured for IP ${CERTBOT_IP_ADDRESS}."
}

configure_lego_renewal_timer() {
  if [[ ! -x "$LEGO_BIN" ]]; then
    warn "lego binary not found at ${LEGO_BIN}."
    return 1
  fi
  log "Creating lego renewal service at ${LEGO_RENEW_SERVICE_FILE}..."
  if ! run_silent run_as_root tee "$LEGO_RENEW_SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Renew Songbird IP certificate with lego
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=oneshot
User=root
Group=root
ExecStart=${LEGO_BIN} --accept-tos --email ${CERTBOT_EMAIL} --path ${LEGO_STATE_DIR} --disable-cn --http --http.webroot ${ACME_WEBROOT} --domains ${CERTBOT_IP_ADDRESS} renew --dynamic --profile shortlived
ExecStartPost=/bin/bash -lc 'cat "${LEGO_STATE_DIR}/certificates/${CERTBOT_IP_ADDRESS}.crt" > "${CERT_INSTALL_DIR}/fullchain.pem" && if [[ -f "${LEGO_STATE_DIR}/certificates/${CERTBOT_IP_ADDRESS}.issuer.crt" ]]; then cat "${LEGO_STATE_DIR}/certificates/${CERTBOT_IP_ADDRESS}.issuer.crt" >> "${CERT_INSTALL_DIR}/fullchain.pem"; fi && cp -Lf "${LEGO_STATE_DIR}/certificates/${CERTBOT_IP_ADDRESS}.key" "${CERT_INSTALL_DIR}/privkey.pem" && chmod 644 "${CERT_INSTALL_DIR}/fullchain.pem" && chmod 600 "${CERT_INSTALL_DIR}/privkey.pem" && systemctl reload nginx'

[Install]
WantedBy=multi-user.target
EOF
  then
    return 1
  fi

  log "Creating lego renewal timer at ${LEGO_RENEW_TIMER_FILE}..."
  if ! run_silent run_as_root tee "$LEGO_RENEW_TIMER_FILE" >/dev/null <<EOF
[Unit]
Description=Run Songbird lego renewal twice daily

[Timer]
OnBootSec=10m
OnUnitActiveSec=12h
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  then
    return 1
  fi

  run_as_root systemctl daemon-reload || return 1
  run_as_root systemctl enable --now songbird-lego-renew.timer || return 1
}

configure_ssl_if_needed() {
  case "$CERT_MODE" in
    http)
      log "HTTP-only mode selected. Skipping TLS setup."
      return 0
      ;;
    files)
      log "Installing TLS certificate files into nginx..."
      configure_manual_ssl_files || return 1
      return 0
      ;;
  esac

  if [[ "$DEPLOY_MODE" == "ip" ]]; then
    configure_lego_ip_ssl || return 1
    return 0
  fi

  local domain_group_csv=""
  for domain_group_csv in "${DOMAIN_GROUPS[@]}"; do
    local cert_name
    cert_name="$(group_primary_domain "$domain_group_csv")"
    local group_names=()
    local domain_entry=""
    IFS=',' read -r -a group_names <<< "$domain_group_csv"

    local group_covered="yes"
    local cert_details=""
    cert_details="$(run_as_root certbot certificates --cert-name "$cert_name" 2>/dev/null || true)"
    if [[ -z "$cert_details" ]]; then
      group_covered="no"
    fi

    for domain_entry in "${group_names[@]}"; do
      local escaped
      escaped="$(printf '%s' "$domain_entry" | sed 's/[.[\*^$]/\\&/g')"
      if [[ "$group_covered" == "yes" ]] && ! echo "$cert_details" | grep -qP "^\s+Domains:.*\b${escaped}\b"; then
        group_covered="no"
        break
      fi
    done

    if [[ "$group_covered" == "yes" ]]; then
      log "Certificate ${cert_name} already covers: $(group_csv_to_space_list "$domain_group_csv")"
      continue
    fi

    local certbot_d_args=()
    for domain_entry in "${group_names[@]}"; do
      certbot_d_args+=(-d "$domain_entry")
    done

    log "Requesting SSL certificate for group: $(group_csv_to_space_list "$domain_group_csv")"
    run_as_root certbot certonly \
      --nginx \
      --cert-name "$cert_name" \
      --https-port "$CLIENT_PORT" \
      --non-interactive \
      --agree-tos \
      --email "$CERTBOT_EMAIL" \
      "${certbot_d_args[@]}" || { log "ERROR: Certbot failed for group: $(group_csv_to_space_list "$domain_group_csv")"; return 1; }
  done

  write_nginx_site_config "ssl" || return 1
  run_as_root nginx -t || return 1
  run_as_root systemctl reload nginx || return 1
  log "Nginx SSL configured for domain groups: ${DOMAIN_GROUPS[*]}"
}

restore_backup_if_provided() {
  if [[ -z "$DB_BACKUP_PATH" ]]; then
    return 0
  fi
  if [[ ! -f "$DB_BACKUP_PATH" ]]; then
    warn "Backup file not found: $DB_BACKUP_PATH"
    return 1
  fi
  if [[ ! -d "$INSTALL_DIR/server" ]]; then
    warn "Server directory not found at ${INSTALL_DIR}/server. Cannot restore backup."
    return 1
  fi

  log "Restoring database from backup: $DB_BACKUP_PATH"
  local cmd=(npm --prefix server run db:restore -- -y --file "$DB_BACKUP_PATH")

  if [[ "${RESTORE_BACKUP_QUIET:-no}" == "yes" ]]; then
    if ! run_db_command_logged_quiet "${cmd[@]}"; then
      return 1
    fi
    return 0
  fi

  if ! run_db_command "${cmd[@]}"; then
    return 1
  fi
}

backup_database() {
  if [[ ! -d "$INSTALL_DIR/server" ]]; then
    warn "Server directory not found; skipping DB backup."
    return 0
  fi
  local backup_password=""
  backup_password="$(prompt_secret "Backup password")"
  log "Backing up database before update..."
  if ! run_in_install_dir "npm --prefix server run db:backup -- --password $(printf '%q' "$backup_password")"; then
    warn "DB backup command failed. Update aborted."
    return 1
  fi
}

preserve_backup_and_restore_data() {
  log "Preserving data directory during update..."
  # Since /data/ is in .gitignore, it will remain untouched during git operations
  # However, we locate the backup for recovery purposes if needed
  if [[ -d "$INSTALL_DIR/data/backups" ]]; then
    local latest_backup="$(ls -t "$INSTALL_DIR/data/backups"/songbird-backup-*.db 2>/dev/null | head -1)"
    if [[ -n "$latest_backup" ]]; then
      # Copy backup to root directory for easy access and recovery
      local backup_filename="$(basename "$latest_backup")"
      log "Found database backup: $latest_backup"
      
      if run_silent run_as_root cp "$latest_backup" "/$backup_filename"; then
        log "✓ Backup copied to /$backup_filename for recovery purposes."
      else
        warn "Failed to copy backup to /. Backup remains in $INSTALL_DIR/data/backups/"
      fi
    fi
  fi
  log "Data directory (/data/) will remain untouched during git update."
}

run_migrations() {
  if [[ ! -d "$INSTALL_DIR/server" ]]; then
    warn "Server directory not found; skipping DB migrations."
    return 0
  fi
  log "Running database migrations..."
  run_in_install_dir "npm --prefix server run db:migrate" || return 1
}

songbird_service_is_running() {
  if have_cmd systemctl && systemctl is-active --quiet songbird.service 2>/dev/null; then
    return 0
  fi
  return 1
}

songbird_healthcheck_responds() {
  local port="$1"

  if have_cmd curl; then
    curl --fail --silent --show-error --max-time 1 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1
    return $?
  fi

  if have_cmd wget; then
    wget -q -T 1 -O /dev/null "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1
    return $?
  fi

  if have_cmd node; then
    node -e '
const http = require("node:http");
const port = Number(process.argv[1]);
if (!Number.isFinite(port) || port <= 0) process.exit(1);
const req = http.request(
  {
    hostname: "127.0.0.1",
    port,
    path: "/api/health",
    method: "GET",
    timeout: 600,
  },
  (res) => {
    res.resume();
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
  },
);
req.on("timeout", () => req.destroy());
req.on("error", () => process.exit(1));
req.end();
setTimeout(() => process.exit(1), 800).unref();
' "$port" >/dev/null 2>&1
    return $?
  fi

  return 1
}

ensure_songbird_stopped_for_update() {
  local port=""
  port="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "$DEFAULT_SERVER_PORT")"
  port="$(strip_surrounding_quotes "$port")"
  port="${port#"${port%%[![:space:]]*}"}"
  port="${port%"${port##*[![:space:]]}"}"
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    port="$DEFAULT_SERVER_PORT"
  fi

  log "Checking whether Songbird is running before update..."

  if songbird_service_is_running; then
    log "Songbird service is running. Stopping it before update..."
    if ! run_as_root systemctl stop songbird.service; then
      warn "Failed to stop Songbird service. Stop it manually before updating."
      press_enter_to_continue
      return 1
    fi
    log "Songbird service stopped."
  fi

  if songbird_healthcheck_responds "$port"; then
    warn "Songbird is still running on port ${port}. Stop it before updating."
    press_enter_to_continue
    return 1
  fi

  return 0
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

  local existing_cert=""
  local existing_key=""
  existing_cert="$(run_as_root_output grep -E '^\s*ssl_certificate ' "$NGINX_SITE_FILE" | head -n 1 | sed -E 's/^\s*ssl_certificate\s+([^;]+);/\1/' | tr -d '\r\n')" || existing_cert=""
  existing_key="$(run_as_root_output grep -E '^\s*ssl_certificate_key ' "$NGINX_SITE_FILE" | head -n 1 | sed -E 's/^\s*ssl_certificate_key\s+([^;]+);/\1/' | tr -d '\r\n')" || existing_key=""

  if [[ -n "$existing_cert" && -n "$existing_key" ]]; then
    write_nginx_site_config "ssl" "$existing_cert" "$existing_key"
  else
    write_nginx_site_config "http"
  fi

  if run_as_root nginx -t; then
    run_as_root systemctl reload nginx
    log "Nginx updated with SERVER_PORT=${SERVER_PORT}, CLIENT_PORT=${CLIENT_PORT}, MAX_UPLOAD_MB=${MAX_UPLOAD_MB}."
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
  run_in_install_dir "npm --prefix client run build" || return 1

  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service || return 1

  if [[ "$needs_nginx" == "yes" ]]; then
    log "Updating Nginx config for SERVER_PORT/CLIENT_PORT/MAX_UPLOAD_MB changes..."
    update_nginx_runtime_values || return 1
  else
    log "Nginx update not required (SERVER_PORT/CLIENT_PORT/MAX_UPLOAD_MB unchanged)."
  fi
}

update_songbird() {
  if [[ ! -d "$INSTALL_DIR" ]]; then
    warn "No Songbird install found at ${INSTALL_DIR}."
    press_enter_to_continue
    return 0
  fi

  ensure_songbird_stopped_for_update || return 1

  if [[ "$(prompt_yes_no "Create a database backup before updating?" "no")" == "yes" ]]; then
    backup_database || return 1
  else
    log "Skipping pre-update backup."
  fi

  prompt_source_mode

  if [[ "$SOURCE_MODE" == "offline" ]]; then
    ensure_offline_source_ready "update" || return 0

    local offline_zip_path="$SOURCE_ZIP_PATH"
    local extract_result=""
    extract_result="$(extract_offline_source_zip "$offline_zip_path" "update")" || return 1
    local tmp_dir="${extract_result%%|*}"
    local source_root="${extract_result#*|}"

    if ! offline_source_is_newer "$source_root" "$INSTALL_DIR"; then
      run_silent run_as_root rm -rf "$tmp_dir"
      log "Songbird is already up to date. No rebuild needed."
      press_enter_to_continue
      return 0
    fi

    run_silent run_as_root rm -rf "$tmp_dir"

    log "Offline update available. Preparing to update Songbird..."
    preserve_backup_and_restore_data
    update_source_from_zip "$offline_zip_path" || return 1

    log "Installing dependencies..."
    install_songbird_dependencies || return 1
    ensure_vapid_keys || return 1

    log "Synchronizing database schema with latest version..."
    run_migrations || return 1

    apply_ownership || return 1
    if install_global_command_from_path "$INSTALL_DIR/scripts/install.sh"; then
      log "Global command synchronized from updated install script."
    else
      warn "Failed to synchronize global command after update."
    fi

    log "Restarting Songbird service..."
    run_as_root systemctl restart songbird.service || return 1
    run_as_root systemctl reload nginx || return 1

    show_deployment_success_frame "update"
    press_enter_to_continue
    return 0
  fi

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    :
  else
    warn "No git checkout found at ${INSTALL_DIR}. Update requires GitHub mode."
    press_enter_to_continue
    return 0
  fi

  # Fetch latest from remote
  log "Checking for updates..."
  if ! run_in_install_dir "git fetch --all --prune"; then
    warn "Failed to fetch from remote. Check your network and credentials."
    press_enter_to_continue
    return 1
  fi

  # Get local and remote commit hashes
  local local_commit remote_commit
  local_commit="$(run_in_install_dir_output "git rev-parse HEAD" | tr -d '\r\n')"
  remote_commit="$(run_in_install_dir_output "git rev-parse origin/main" | tr -d '\r\n')"

  if [[ -z "$local_commit" || -z "$remote_commit" ]]; then
    warn "Failed to determine current version. Check git repository status."
    press_enter_to_continue
    return 1
  fi

  # Check if update is available
  if [[ "$local_commit" == "$remote_commit" ]]; then
    log "Songbird is already up to date. No rebuild needed."
    press_enter_to_continue
    return 0
  fi

  # Update is available - proceed with safe update
  log "Update available. Preparing to update Songbird..."
  preserve_backup_and_restore_data

  # Ensure we're on main branch and pull latest
  if ! run_in_install_dir "git checkout main"; then
    warn "Failed to checkout main branch."
    press_enter_to_continue
    return 1
  fi

  if ! run_in_install_dir "git pull --ff-only origin main"; then
    warn "Failed to pull updates. Repository may have non-fast-forward changes."
    press_enter_to_continue
    return 1
  fi

  log "Installing dependencies..."
  install_songbird_dependencies || return 1
  ensure_vapid_keys || return 1
  
  log "Synchronizing database schema with latest version..."
  run_migrations || return 1

  apply_ownership || return 1
  if install_global_command_from_path "$INSTALL_DIR/scripts/install.sh"; then
    log "Global command synchronized from updated install script."
  else
    warn "Failed to synchronize global command after update."
  fi

  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service || return 1
  run_as_root systemctl reload nginx || return 1

  show_deployment_success_frame "update"
  press_enter_to_continue
}

restart_songbird() {
  log "Restarting Songbird service..."
  run_as_root systemctl restart songbird.service || return 1
  run_as_root systemctl reload nginx || return 1

  log "Songbird restarted successfully."
  press_enter_to_continue
}

edit_settings() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ ! -f "$env_file" ]]; then
    warn "No .env found at ${env_file}. Run install first."
    press_enter_to_continue
    return 0
  fi

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
  before_max="$(get_existing_env_mb_value_with_fallback "FILE_UPLOAD_MAX_TOTAL_SIZE_MB" "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_MAX_UPLOAD_MB")"

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
  after_max="$(get_existing_env_mb_value_with_fallback "FILE_UPLOAD_MAX_TOTAL_SIZE_MB" "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_MAX_UPLOAD_MB")"

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
  if [[ ! -d "$INSTALL_DIR" ]]; then
    warn "No install found at ${INSTALL_DIR}."
    press_enter_to_continue
    return 0
  fi
  
  if [[ "$(prompt_yes_no "This will remove Songbird from this server. Continue?" "no")" != "yes" ]]; then
    log "Removal canceled."
    return 0
  fi

  if run_as_root systemctl list-unit-files | grep -q "^songbird.service"; then
    run_as_root systemctl disable --now songbird.service || true
  fi
  if run_as_root systemctl list-unit-files | grep -q "^songbird-lego-renew.timer"; then
    run_as_root systemctl disable --now songbird-lego-renew.timer || true
  fi
  run_as_root rm -f "$SERVICE_FILE"
  run_as_root rm -f "$LEGO_RENEW_SERVICE_FILE" "$LEGO_RENEW_TIMER_FILE"
  run_as_root systemctl daemon-reload

  run_as_root rm -f "$NGINX_ENABLED_FILE"
  run_as_root rm -f "$NGINX_SITE_FILE"
  if run_as_root nginx -t >/dev/null 2>&1; then
    run_as_root systemctl reload nginx
  fi

  if [[ -d "$INSTALL_DIR" ]]; then
    run_as_root rm -rf "$INSTALL_DIR"
  fi
  if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    run_as_root userdel "$SERVICE_USER" || true
  fi

  log "Songbird removed."

  if [[ -f "$GLOBAL_COMMAND_PATH" ]]; then
    if [[ "$(prompt_yes_no "Remove global command (songbird-deploy) as well?" "no")" == "yes" ]]; then
      run_as_root rm -f "$GLOBAL_COMMAND_PATH"
      log "Global command removed."
    fi
  fi

  press_enter_to_continue
}

configure_push_proxy() {
  local env_file="$INSTALL_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    warn ".env file not found. Install Songbird first."
    press_enter_to_continue
    return 1
  fi

  clear
  show_banner
  printf "\n"
  printf "Configure Push Notification Proxy\n"
  printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
  
  local current_proxy=""
  current_proxy="$(get_existing_env_value "PUSH_PROXY_URL" "")"
  
  if [[ -n "$current_proxy" ]]; then
    printf "Current proxy: %s\n\n" "$current_proxy"
  else
    printf "No proxy currently configured.\n\n"
  fi
  
  printf "Use a proxy when your server cannot directly reach push service endpoints:\n"
  printf "  • fcm.googleapis.com (Chrome/Edge)\n"
  printf "  • *.push.services.mozilla.com (Firefox)\n"
  printf "  • web.push.apple.com (Safari)\n\n"
  
  printf "Proxy URL formats:\n"
  printf "  • HTTP: http://proxy.example.com:3128\n"
  printf "  • With auth: http://user:pass@proxy.example.com:8080\n"
  printf "  • SOCKS5: socks5://proxy.example.com:1080\n\n"
  
  local proxy_url=""
  prompt_read "Enter proxy URL (leave blank to disable proxy): " proxy_url
  proxy_url="${proxy_url#"${proxy_url%%[![:space:]]*}"}"
  proxy_url="${proxy_url%"${proxy_url##*[![:space:]]}"}"
  
  if [[ -z "$proxy_url" ]]; then
    log "Clearing proxy configuration..."
    replace_env_value "$env_file" "PUSH_PROXY_URL" ""
  else
    # Test proxy connectivity if curl is available
    if have_cmd curl; then
      printf "\nTesting proxy connectivity...\n"
      if curl -x "$proxy_url" -s -o /dev/null -w "%{http_code}" --connect-timeout 5 https://fcm.googleapis.com 2>/dev/null | grep -q "200\|301\|302"; then
        printf "✓ Proxy is reachable!\n"
      else
        warn "Could not verify proxy connectivity. Proceeding anyway..."
      fi
    fi
    
    log "Setting proxy to: $proxy_url"
    replace_env_value "$env_file" "PUSH_PROXY_URL" "$proxy_url"
  fi
  
  log "Installing dependencies..."
  if ! run_in_install_dir "cd server && npm install"; then
    warn "Failed to install dependencies."
    press_enter_to_continue
    return 1
  fi
  
  log "Restarting Songbird service..."
  if ! run_logged_quiet run_as_root systemctl restart songbird; then
    warn "Failed to restart service."
    press_enter_to_continue
    return 1
  fi
  
  printf "\n"
  log "Proxy configuration applied successfully!"
  
  press_enter_to_continue
}

install_songbird() {
  prompt_source_mode
  collect_install_options
  prompt_install_backup_restore
  install_required_packages || return 1
  ensure_nodejs_from_nodesource || return 1
  ensure_service_user_exists || return 1
  if [[ "$SOURCE_MODE" == "offline" ]]; then
    ensure_offline_source_ready "install" || return 0
    install_source_from_zip "$SOURCE_ZIP_PATH" || return 1
  else
    clone_repo || {
      warn "Failed to clone repository. Installation canceled."
      press_enter_to_continue
      return 1
    }
  fi
  ensure_log_dir || return 1
  write_full_env_with_defaults || return 1
  RESTORE_BACKUP_QUIET="yes"
  if ! restore_backup_if_provided; then
    RESTORE_BACKUP_QUIET="no"
    warn "Backup restore failed. Installation aborted. Review ${LOG_FILE} for details."
    press_enter_to_continue
    return 1
  fi
  RESTORE_BACKUP_QUIET="no"
  install_songbird_dependencies || return 1
  ensure_vapid_keys || return 1
  apply_ownership || return 1
  configure_systemd_service || return 1
  log "Starting nginx setup..."
  configure_nginx || return 1
  log "Starting TLS setup..."
  configure_ssl_if_needed || return 1

  if install_global_command_from_path "$INSTALL_DIR/scripts/install.sh"; then
    log "Global command synchronized to script version ${LAST_GLOBAL_COMMAND_VERSION:-$SCRIPT_VERSION}."
  else
    warn "Failed to synchronize global command after install. You can retry from the menu."
  fi
  show_deployment_success_frame "install"

  create_owner_user

  press_enter_to_continue
}

install_global_command_from_path() {
  local source_path="$1"
  [[ -n "$source_path" && -f "$source_path" ]] || return 1
  local install_version=""
  install_version="$(resolve_script_version_for_path "$source_path" 2>/dev/null || printf "%s" "$SCRIPT_VERSION")"

  local temp_target=""
  temp_target="$(mktemp)"
  cp "$source_path" "$temp_target" || {
    rm -f "$temp_target"
    return 1
  }

  if ! sed -i "1s|^# songbird-deploy-version:.*$|# songbird-deploy-version: ${install_version}|" "$temp_target"; then
    rm -f "$temp_target"
    return 1
  fi

  if ! run_silent run_as_root install -m 755 "$temp_target" "$GLOBAL_COMMAND_PATH"; then
    rm -f "$temp_target"
    return 1
  fi

  rm -f "$temp_target"
  LAST_GLOBAL_COMMAND_VERSION="$install_version"
  return 0
}

install_global_command_from_remote() {
  local install_version="$SCRIPT_VERSION"
  local temp_target=""
  temp_target="$(mktemp)"
  if ! curl -fsSL "$SCRIPT_REMOTE_URL" > "$temp_target"; then
    rm -f "$temp_target"
    return 1
  fi
  if ! sed -i "1s|^# songbird-deploy-version:.*$|# songbird-deploy-version: ${install_version}|" "$temp_target"; then
    rm -f "$temp_target"
    return 1
  fi
  if ! run_silent run_as_root install -m 755 "$temp_target" "$GLOBAL_COMMAND_PATH"; then
    rm -f "$temp_target"
    return 1
  fi
  rm -f "$temp_target"
  LAST_GLOBAL_COMMAND_VERSION="$install_version"
  return 0
}

install_global_command_core() {
  local source_path="${1:-$CURRENT_SCRIPT_PATH}"
  if [[ -n "$source_path" && -f "$source_path" ]]; then
    install_global_command_from_path "$source_path"
    return $?
  fi

  log "Script source path is not a regular file. Installing global command from remote..."
  install_global_command_from_remote
}

install_global_command() {
  if ! install_global_command_core "${1:-$CURRENT_SCRIPT_PATH}"; then
    warn "Failed to install global command."
    press_enter_to_continue
    return 1
  fi

  log "Global command installed: songbird-deploy (version ${LAST_GLOBAL_COMMAND_VERSION:-$SCRIPT_VERSION})"
  log "Run it from anywhere with: songbird-deploy"
  press_enter_to_continue
}

installed_global_command_version() {
  local version=""
  version="$(run_as_root bash -lc "if [[ -f '$GLOBAL_COMMAND_PATH' ]]; then grep -E '^# songbird-deploy-version:' '$GLOBAL_COMMAND_PATH' | head -n 1 | cut -d ':' -f 2- | xargs; fi" 2>/dev/null || true)"
  if [[ -z "$version" || "$version" == "auto" ]]; then
    return 1
  fi
  printf "%s" "$version"
}

ensure_global_command_on_first_run() {
  local installed_version=""
  if ! run_as_root test -x "$GLOBAL_COMMAND_PATH"; then
    log "Global command not found. Installing it automatically..."
    if ! install_global_command_core "$CURRENT_SCRIPT_PATH"; then
      warn "Automatic global command installation failed. You can retry from the menu."
    fi
    return 0
  fi

  installed_version="$(installed_global_command_version 2>/dev/null || true)"
  if [[ -z "$installed_version" ]]; then
    log "Global command version could not be determined. Reinstalling it automatically..."
    if ! install_global_command_core "$CURRENT_SCRIPT_PATH"; then
      warn "Automatic global command reinstall failed. You can retry from the menu."
    fi
    return 0
  fi

  if dpkg --compare-versions "$installed_version" lt "$SCRIPT_VERSION"; then
    log "Global command version ${installed_version} is older than script version ${SCRIPT_VERSION}. Updating it automatically..."
    if ! install_global_command_core "$CURRENT_SCRIPT_PATH"; then
      warn "Automatic global command update failed. You can retry from the menu."
    fi
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
  printf '\033[1;38;2;42;186;130m'   # bold Songbird green (#2ABA82)
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
  printf 'Script Version: %s\n' "$SCRIPT_VERSION"
  printf '\033[0m'      # reset
}


show_menu() {
  clear
  show_banner
  printf "\n"
  printf "Songbird Deploy Menu\n"
  printf $'1) 📥  Install Songbird\n'
  printf $'2) 🔄️  Update Songbird\n'
  printf $'3) ♻️  Restart Songbird\n'
  printf $'4) ⚙️  Edit Settings (.env)\n'
  printf $'5) 🗃️  Manage Database\n'
  printf $'6) 🗑️  Remove Songbird\n'
  printf $'7) 🔄️  Reinstall songbird-deploy\n'
  printf $'8) 🌐  Configure mirrors\n'
  printf $'9) 📋  View Logs\n'
  printf $'0) 🚪  Exit\n\n'
}

show_logs_menu() {
  while true; do
    clear
    show_banner
    printf "\n"
    printf "Logs Menu\n"
    printf $'1) 📋  View script logs\n'
    printf $'2) 📋  View service logs\n'
    printf $'3) 📋 View nginx access logs\n'
    printf $'4) 📋  View nginx error logs\n'
    printf $'5) ↩️  Go back\n'
    printf $'0) 🚪  Exit\n\n'

    prompt_read "Choose an option [0-5]: " choice
    case "$choice" in
      1) show_logs ;;
      2) show_service_logs ;;
      3) show_nginx_access_logs ;;
      4) show_nginx_error_logs ;;
      5) return ;;
      0) exit 0 ;;
      *) printf "Invalid choice. Select a number from 0 to 5.\n" ;;
    esac
  done
}

run_db_command() {
  local args=("$@")
  local escaped=""
  local part=""
  local path_prefix=""
  local path_export=""
  if [[ "${args[0]:-}" == "npm" ]]; then
    resolve_npm_exec_path || return 1
    args[0]="$NPM_EXEC_PATH"
  elif [[ "${args[0]:-}" == "node" ]]; then
    resolve_node_exec_path || return 1
    args[0]="$NODE_EXEC_PATH"
  fi
  path_prefix="$(node_tools_path_prefix)"
  if [[ -n "$path_prefix" ]]; then
    path_export="export PATH=$(printf '%q' "$path_prefix"):\$PATH; "
  fi
  for part in "${args[@]}"; do
    escaped+=" $(printf '%q' "$part")"
  done
  run_as_root bash -lc "cd '$INSTALL_DIR' && ${path_export}${escaped:1} </dev/null"
}

run_db_command_interactive() {
  local args=("$@")
  local escaped=""
  local part=""
  local path_prefix=""
  local path_export=""
  if [[ "${args[0]:-}" == "npm" ]]; then
    resolve_npm_exec_path || return 1
    args[0]="$NPM_EXEC_PATH"
  elif [[ "${args[0]:-}" == "node" ]]; then
    resolve_node_exec_path || return 1
    args[0]="$NODE_EXEC_PATH"
  fi
  path_prefix="$(node_tools_path_prefix)"
  if [[ -n "$path_prefix" ]]; then
    path_export="export PATH=$(printf '%q' "$path_prefix"):\$PATH; "
  fi
  for part in "${args[@]}"; do
    escaped+=" $(printf '%q' "$part")"
  done
  run_as_root bash -lc "cd '$INSTALL_DIR' && ${path_export}${escaped:1} </dev/tty >/dev/tty 2>&1"
}

run_db_command_logged_quiet() {
  local args=("$@")
  local escaped=""
  local part=""
  local path_prefix=""
  local path_export=""
  if [[ "${args[0]:-}" == "npm" ]]; then
    resolve_npm_exec_path || return 1
    args[0]="$NPM_EXEC_PATH"
  elif [[ "${args[0]:-}" == "node" ]]; then
    resolve_node_exec_path || return 1
    args[0]="$NODE_EXEC_PATH"
  fi
  path_prefix="$(node_tools_path_prefix)"
  if [[ -n "$path_prefix" ]]; then
    path_export="export PATH=$(printf '%q' "$path_prefix"):\$PATH; "
  fi
  for part in "${args[@]}"; do
    escaped+=" $(printf '%q' "$part")"
  done
  run_logged_quiet run_as_root bash -lc "cd '$INSTALL_DIR' && ${path_export}${escaped:1} </dev/null"
}

split_db_selector_input() {
  local input="$1"
  local __result_var="$2"

  if [[ ! "$__result_var" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    return 1
  fi

  input="$(printf "%s" "$input" | tr ',' ' ')"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"
  read -r -a "$__result_var" <<< "$input"
}

resolve_chat_visibility_for_script() {
  local chat_selector="$1"
  [[ -n "$chat_selector" ]] || return 1
  local path_prefix=""
  path_prefix="$(node_tools_path_prefix)"

  run_as_root env INSTALL_DIR="$INSTALL_DIR" CHAT_SELECTOR="$chat_selector" NODE_TOOLS_PATH_PREFIX="$path_prefix" bash -lc '
    if [[ -n "$NODE_TOOLS_PATH_PREFIX" ]]; then
      export PATH="$NODE_TOOLS_PATH_PREFIX:$PATH"
    fi
    cd "$INSTALL_DIR" || exit 1
    node --input-type=module -e "
      import { pathToFileURL } from \"node:url\";
      const rootUrl = pathToFileURL(process.cwd() + \"/\");
      const { openDatabase } = await import(new URL(\"./server/scripts/_db-admin.js\", rootUrl));
      const { resolveChatRow } = await import(new URL(\"./server/lib/dbToolHelpers.js\", rootUrl));
      const dbApi = await openDatabase();
      try {
        const chat = resolveChatRow(dbApi, String(process.env.CHAT_SELECTOR || \"\").trim());
        if (!chat?.id) {
          process.exit(2);
        }
        process.stdout.write(String(chat.group_visibility || \"public\").trim().toLowerCase() || \"public\");
      } finally {
        dbApi.close();
      }
    "
  '
}

# Check whether any user with role='owner' exists in the database.
# Exits 0 if owner exists, 1 if not (or if check fails).
check_owner_exists() {
  local path_prefix=""
  path_prefix="$(node_tools_path_prefix)"
  run_as_root env INSTALL_DIR="$INSTALL_DIR" NODE_TOOLS_PATH_PREFIX="$path_prefix" bash -lc '
    if [[ -n "$NODE_TOOLS_PATH_PREFIX" ]]; then
      export PATH="$NODE_TOOLS_PATH_PREFIX:$PATH"
    fi
    cd "$INSTALL_DIR" || exit 1
    node --input-type=module -e "
      import { pathToFileURL } from \"node:url\";
      const rootUrl = pathToFileURL(process.cwd() + \"/\");
      const { openDatabase } = await import(new URL(\"./server/scripts/_db-admin.js\", rootUrl));
      const dbApi = await openDatabase();
      try {
        const sql = \"SELECT id FROM users WHERE role = \" + \"'owner'\" + \" LIMIT 1\";
        const row = dbApi.getRow(sql);
        process.exit(row && row.id ? 0 : 1);
      } finally {
        dbApi.close();
      }
    "
  ' 2>/dev/null
}

# After installation, offer to create an owner user if none exists.
create_owner_user() {
  if check_owner_exists; then
    return 0
  fi

  printf "\n"
  log "No owner user found in the database."
  if [[ "$(prompt_yes_no "Would you like to create an owner user now?" "yes")" != "yes" ]]; then
    return 0
  fi

  local nickname=""
  local username=""
  local password=""

  nickname="$(prompt_non_empty "Nickname")"
  username="$(prompt_non_empty "Username (lowercase letters, numbers, ., _)")"
  password="$(prompt_secret "Password")"

  run_db_command npm --prefix server run db:user:create -- \
    --nickname "$nickname" \
    --username "$username" \
    --password "$password" \
    --role owner
}

print_db_script_help() {
  cat <<'EOF'
Songbird Script Database Menu

The installer collects every required value before running DB commands, then
passes those values as CLI flags/arguments with stdin closed so the nested
command cannot ask hidden follow-up questions.

Inspect:
  1-4   Inspect database/chats/users/files
        Prompts: row limit
        Passes: --limit

Backup & repair:
  5     Backup database
        Prompts: none
        Passes: (no arguments)
  6     Restore backup
        Prompts: backup .db path, restore confirmation
        Passes: -y --file
  7     Vacuum database
        Prompts: confirmation
        Passes: -y
  8     Reset database
        Prompts: confirmation, recreate yes/no
        Passes: -y --recreate or -y --no-recreate
  9     Delete database
        Prompts: confirmation
        Passes: -y

User and chat management:
  10    Create user
        Prompts: nickname, username, password, role (user/admin/owner, default: user)
        Passes: --nickname --username --password --role
  11    Generate users in bulk
        Prompts: count, password, nickname prefix, username prefix
        Passes: --count --password --nickname-prefix --username-prefix
  12    Edit user
        Prompts: user selector and optional profile fields and role
        Passes: selector plus any changed --username/--nickname/--avatar-url/--status/--color/--role
  13    Ban/unban user
        Prompts: user selector, confirmation
        Passes: -y selector
  14    Create group/channel
        Prompts: type, name, username, visibility, owner, optional members
        For channels: optional remote channel configuration (Telegram source, sync metadata, stream media)
        Passes: --type --name --owner --username --visibility --users [--remote-channel --sync-metadata --stream-media]
  15    Add members to chat
        Prompts: chat selector, all-users yes/no, or user selectors
        Passes: chat selector plus --all or user selectors
  16    Edit chat
        Prompts: chat selector and optional profile/settings fields
        For channels with remote channel: menu with 9 actions (update source, toggle settings, enable/disable, pause/resume queue, skip queue items)
        Passes: selector plus any changed --name/--username/--visibility/--color/--owner/invite flag
        Or: --remote-channel --sync-metadata/--no-sync-metadata --stream-media/--no-stream-media
        Or: --enable-remote/--disable-remote --pause-queue/--resume-queue --skip-queue/--skip-all-queue

Remote channel configuration:
  17    Configure Remote Channel
        Prompts: Telegram API ID/hash, proxy URL, phone number, optional 2FA password
        Passes: --api-id --api-hash --proxy-url/--no-proxy --phone-number [--password]

Destructive actions:
  18    Delete chats
        Prompts: chat ids/usernames or "all"
        Passes: -y selectors or --all -y
  19    Delete users
        Prompts: user ids/usernames or "all"
        Passes: -y selectors or --all -y
  20    Delete files
        Prompts: file ids/stored names or "all"
        Passes: -y selectors or --all -y

Notes:
  - "all" is explicit for chat/user/file delete actions.
  - "Ban/unban user" is a toggle and expires that user's sessions.
  - Public chats always allow member invites. Invite settings only apply to private chats.
  - Backups are plain .db copies saved to data/backups/ with a timestamp filename.
  - Restore replaces the live database with the selected .db file.
EOF
}

db_backup() {
  log "Creating database backup..."
  run_db_command npm --prefix server run db:backup
  press_enter_to_continue
}

db_help() {
  clear
  show_banner
  printf "\n"
  print_db_script_help
  press_enter_to_continue
}

db_vacuum() {
  if [[ "$(prompt_yes_no "This will run VACUUM and rewrite the database file. Continue?" "no")" != "yes" ]]; then
    log "VACUUM canceled."
    press_enter_to_continue
    return 0
  fi
  run_db_command npm --prefix server run db:vacuum -- -y
  press_enter_to_continue
}

db_restore() {
  local backup_path=""

  backup_path="$(select_backup_db_path)"
  if [[ "$(prompt_yes_no "This will replace the current database with ${backup_path}. Continue?" "yes")" != "yes" ]]; then
    log "Restore canceled."
    press_enter_to_continue
    return 0
  fi
  run_db_command npm --prefix server run db:restore -- -y --file "$backup_path"
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
    press_enter_to_continue
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
    press_enter_to_continue
    return 0
  fi
  run_db_command npm --prefix server run db:delete -- -y
  press_enter_to_continue
}

db_chat_delete() {
  local input=""
  local selectors=()
  prompt_read "Enter chat IDs or group/channel usernames (comma/space separated), or type 'all': " input
  split_db_selector_input "$input" selectors

  if [[ "${#selectors[@]}" -eq 0 ]]; then
    printf "No input provided.\n"
    press_enter_to_continue
    return 0
  fi

  if [[ "${#selectors[@]}" -eq 1 && "${selectors[0],,}" == "all" ]]; then
    run_db_command npm --prefix server run db:chat:delete -- --all -y
  else
    run_db_command npm --prefix server run db:chat:delete -- -y "${selectors[@]}"
  fi
  press_enter_to_continue
}

db_file_delete() {
  local input=""
  local selectors=()
  prompt_read "Enter file IDs or stored names (comma/space separated) or type 'all': " input
  split_db_selector_input "$input" selectors

  if [[ "${#selectors[@]}" -eq 0 ]]; then
    printf "No input provided.\n"
    press_enter_to_continue
    return 0
  fi

  if [[ "${#selectors[@]}" -eq 1 && "${selectors[0],,}" == "all" ]]; then
    run_db_command npm --prefix server run db:file:delete -- --all -y
  else
    run_db_command npm --prefix server run db:file:delete -- -y "${selectors[@]}"
  fi
  press_enter_to_continue
}

db_user_delete() {
  local input=""
  local selectors=()
  prompt_read "Enter user IDs or usernames (comma/space separated) or type 'all': " input
  split_db_selector_input "$input" selectors

  if [[ "${#selectors[@]}" -eq 0 ]]; then
    printf "No input provided.\n"
    press_enter_to_continue
    return 0
  fi

  if [[ "${#selectors[@]}" -eq 1 && "${selectors[0],,}" == "all" ]]; then
    run_db_command npm --prefix server run db:user:delete -- --all -y
  else
    run_db_command npm --prefix server run db:user:delete -- -y "${selectors[@]}"
  fi
  press_enter_to_continue
}

db_user_create() {
  local nickname=""
  local username=""
  local password=""
  local role=""

  nickname="$(prompt_non_empty "Nickname")"
  username="$(prompt_non_empty "Username (lowercase letters, numbers, ., _)")"
  password="$(prompt_secret "Password")"

  while true; do
    prompt_read "Role (user/admin/owner, default: user): " role
    role="${role#"${role%%[![:space:]]*}"}"
    role="${role%"${role##*[![:space:]]}"}"
    [[ -z "$role" ]] && role="user"
    case "$role" in
      user|admin|owner) break ;;
      *) printf "Invalid role. Choose: user, admin, or owner.\n" ;;
    esac
  done

  run_db_command npm --prefix server run db:user:create -- \
    --nickname "$nickname" \
    --username "$username" \
    --password "$password" \
    --role "$role"
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

  password="$(prompt_secret_optional "Password for generated users? (default: Passw0rd!)")"
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

db_chat_create() {
  local type=""
  local name=""
  local username=""
  local visibility=""
  local owner=""
  local members=""
  local configure_remote="no"
  local remote_source=""
  local sync_metadata="no"
  local stream_media="no"

  prompt_read "Type (group/channel, default: group): " type
  type="${type#"${type%%[![:space:]]*}"}"
  type="${type%"${type##*[![:space:]]}"}"
  [[ -z "$type" ]] && type="group"

  name="$(prompt_non_empty "Chat name")"
  username="$(prompt_non_empty "Chat username/handle (without @)")"
  prompt_read "Visibility (public/private, default: public): " visibility
  visibility="${visibility#"${visibility%%[![:space:]]*}"}"
  visibility="${visibility%"${visibility##*[![:space:]]}"}"
  [[ -z "$visibility" ]] && visibility="public"
  owner="$(prompt_non_empty "Owner username or id")"
  prompt_read "Add members (comma separated usernames/ids, optional): " members

  local args=(
    --type "$type"
    --name "$name"
    --owner "$owner"
    --username "$username"
    --visibility "$visibility"
    --users "$members"
  )

  # Only offer remote channel configuration for channels
  if [[ "${type,,}" == "channel" ]]; then
    configure_remote="$(prompt_yes_no "Configure remote channel for this channel?" "no")"
    
    if [[ "$configure_remote" == "yes" ]]; then
      local remote_enabled="$(get_existing_env_value "REMOTE_CHANNEL" "false")"
      remote_enabled="${remote_enabled,,}"
      if [[ "$remote_enabled" != "true" ]]; then
        warn "Remote channel feature is disabled. Configure it first."
        press_enter_to_continue
        return 1
      fi
      
      remote_source="$(prompt_non_empty "Telegram source (username, t.me link, or chat ID)")"
      sync_metadata="$(prompt_yes_no "Sync metadata (name/avatar) from Telegram?" "yes")"
      stream_media="$(prompt_yes_no "Stream media files from Telegram?" "yes")"
      
      args+=(--remote-channel "$remote_source")
      [[ "$sync_metadata" == "yes" ]] && args+=(--sync-metadata)
      [[ "$stream_media" == "yes" ]] && args+=(--stream-media)
    fi
  fi

  run_db_command npm --prefix server run db:chat:create -- "${args[@]}"
  press_enter_to_continue
}

db_chat_add() {
  local chat=""
  local users=""
  local user_selectors=()
  local add_all="no"

  chat="$(prompt_non_empty "Chat id or username")"
  add_all="$(prompt_yes_no "Add all users in the database to this chat?" "no")"

  if [[ "$add_all" == "yes" ]]; then
    run_db_command npm --prefix server run db:chat:add -- "$chat" --all
    press_enter_to_continue
    return 0
  fi

  users="$(prompt_non_empty "Usernames or ids (comma separated)")"
  split_db_selector_input "$users" user_selectors
  if [[ "${#user_selectors[@]}" -eq 0 ]]; then
    printf "No users provided.\n"
    press_enter_to_continue
    return 0
  fi
  run_db_command npm --prefix server run db:chat:add -- "$chat" "${user_selectors[@]}"
  press_enter_to_continue
}

db_chat_edit() {
  local chat=""
  local name=""
  local username=""
  local visibility=""
  local color=""
  local owner=""
  local invites=""
  local effective_visibility=""
  local configure_remote="no"
  local remote_action=""
  local remote_source=""
  local sync_metadata=""
  local stream_media=""
  local args=()

  chat="$(prompt_non_empty "Chat id or username")"
  
  configure_remote="$(prompt_yes_no "Update remote channel configuration?" "no")"
  
  if [[ "$configure_remote" == "yes" ]]; then
    local remote_enabled="$(get_existing_env_value "REMOTE_CHANNEL" "false")"
    remote_enabled="${remote_enabled,,}"
    if [[ "$remote_enabled" != "true" ]]; then
      warn "Remote channel feature is disabled. Configure it first."
      press_enter_to_continue
      return 1
    fi
    
    args+=("$chat")
    
    printf "\n Remote channel Actions:\n"
    printf "  1. Update Telegram source\n"
    printf "  2. Toggle sync metadata\n"
    printf "  3. Toggle stream media\n"
    printf "  4. Enable remote channel\n"
    printf "  5. Disable remote channel\n"
    printf "  6. Pause queue\n"
    printf "  7. Resume queue\n"
    printf "  8. Skip current queue item\n"
    printf "  9. Skip all queue items\n"
    printf "\n"
    
    prompt_read "Select action (1-9, or leave blank to cancel): " remote_action
    
    case "$remote_action" in
      1)
        remote_source="$(prompt_non_empty "New Telegram source (username, t.me link, or chat ID)")"
        args+=(--remote-channel "$remote_source")
        ;;
      2)
        prompt_read "Sync metadata? (yes/no): " sync_metadata
        if [[ "${sync_metadata,,}" == "yes" ]]; then
          args+=(--sync-metadata)
        elif [[ "${sync_metadata,,}" == "no" ]]; then
          args+=(--no-sync-metadata)
        fi
        ;;
      3)
        prompt_read "Stream media? (yes/no): " stream_media
        if [[ "${stream_media,,}" == "yes" ]]; then
          args+=(--stream-media)
        elif [[ "${stream_media,,}" == "no" ]]; then
          args+=(--no-stream-media)
        fi
        ;;
      4)
        args+=(--enable-remote)
        ;;
      5)
        args+=(--disable-remote)
        ;;
      6)
        args+=(--pause-queue)
        ;;
      7)
        args+=(--resume-queue)
        ;;
      8)
        args+=(--skip-queue)
        ;;
      9)
        args+=(--skip-all-queue)
        ;;
      *)
        log "No action selected. Canceled."
        press_enter_to_continue
        return 0
        ;;
    esac
    
    run_db_command npm --prefix server run db:chat:edit -- "${args[@]}"
    press_enter_to_continue
    return 0
  fi

  prompt_read "New chat name (optional): " name
  prompt_read "New chat username/handle (optional, without @): " username
  prompt_read "Visibility (public/private, optional): " visibility
  prompt_read "Color hex (optional, example: #10b981): " color
  prompt_read "New owner username or id (optional): " owner

  args+=("$chat")
  [[ -n "$name" ]] && args+=(--name "$name")
  [[ -n "$username" ]] && args+=(--username "$username")
  [[ -n "$visibility" ]] && args+=(--visibility "$visibility")
  [[ -n "$color" ]] && args+=(--color "$color")
  [[ -n "$owner" ]] && args+=(--owner "$owner")

  if [[ -n "$visibility" ]]; then
    effective_visibility="${visibility,,}"
  else
    effective_visibility="$(resolve_chat_visibility_for_script "$chat" 2>/dev/null || true)"
  fi

  if [[ "$effective_visibility" == "private" ]]; then
    prompt_read "Member invites setting for this private chat (allow/deny, default: allow): " invites
    invites="${invites#"${invites%%[![:space:]]*}"}"
    invites="${invites%"${invites##*[![:space:]]}"}"
    [[ -z "$invites" ]] && invites="allow"
  else
    log "Skipping member invites prompt because public chats always allow invites."
  fi

  if [[ "${invites,,}" == "allow" ]]; then
    args+=(--allow-member-invites)
  elif [[ "${invites,,}" == "deny" || "${invites,,}" == "disallow" ]]; then
    args+=(--disallow-member-invites)
  fi

  run_db_command npm --prefix server run db:chat:edit -- "${args[@]}"
  press_enter_to_continue
}

db_user_edit() {
  local user=""
  local username=""
  local nickname=""
  local avatar_url=""
  local status=""
  local color=""
  local role=""
  local args=()

  user="$(prompt_non_empty "User id or username")"
  prompt_read "New username (optional): " username
  prompt_read "New display name (optional): " nickname
  prompt_read "Avatar URL (optional): " avatar_url
  prompt_read "Status (online/invisible, optional): " status
  prompt_read "Color hex (optional, example: #10b981): " color

  while true; do
    prompt_read "Role (user/admin/owner, optional — leave blank to keep current): " role
    role="${role#"${role%%[![:space:]]*}"}"
    role="${role%"${role##*[![:space:]]}"}"
    if [[ -z "$role" ]]; then
      break
    fi
    case "$role" in
      user|admin|owner) break ;;
      *) printf "Invalid role. Choose: user, admin, owner, or leave blank.\n" ;;
    esac
  done

  args+=("$user")
  [[ -n "$username" ]] && args+=(--username "$username")
  [[ -n "$nickname" ]] && args+=(--nickname "$nickname")
  [[ -n "$avatar_url" ]] && args+=(--avatar-url "$avatar_url")
  [[ -n "$status" ]] && args+=(--status "$status")
  [[ -n "$color" ]] && args+=(--color "$color")
  [[ -n "$role" ]] && args+=(--role "$role")

  run_db_command npm --prefix server run db:user:edit -- "${args[@]}"
  press_enter_to_continue
}

db_user_ban() {
  local user=""
  user="$(prompt_non_empty "User id or username")"
  if [[ "$(prompt_yes_no "Toggle ban state for ${user} ?" "no")" != "yes" ]]; then
    log "Ban/unban canceled."
    press_enter_to_continue
    return 0
  fi
  run_db_command npm --prefix server run db:user:ban -- -y "$user"
  press_enter_to_continue
}

db_remote_configure() {
  local current_api_id=""
  local current_api_hash=""
  local current_proxy_url=""
  local api_id=""
  local api_hash=""
  local proxy_url=""
  local phone_number=""
  local two_step_password=""
  local force_sms="no"
  local args=()

  if [[ ! -d "${INSTALL_DIR}/server" ]]; then
    warn "Songbird server directory not found at ${INSTALL_DIR}/server."
    press_enter_to_continue
    return 1
  fi

  current_api_id="$(strip_surrounding_quotes "$(get_existing_env_value "REMOTE_CHANNEL_TELEGRAM_API_ID" "")")"
  current_api_hash="$(strip_surrounding_quotes "$(get_existing_env_value "REMOTE_CHANNEL_TELEGRAM_API_HASH" "")")"
  current_proxy_url="$(strip_surrounding_quotes "$(get_existing_env_value "REMOTE_CHANNEL_TELEGRAM_PROXY_URL" "$(get_existing_env_value "REMOTE_CHANNEL_PROXY_URL" "")")")"
  [[ "$current_api_id" == "0" ]] && current_api_id=""

  while true; do
    if [[ -n "$current_api_id" ]]; then
      prompt_read "Telegram API ID (default: ${current_api_id}): " api_id
      [[ -z "$api_id" ]] && api_id="$current_api_id"
    else
      prompt_read "Telegram API ID: " api_id
    fi
    api_id="${api_id#"${api_id%%[![:space:]]*}"}"
    api_id="${api_id%"${api_id##*[![:space:]]}"}"
    if [[ "$api_id" =~ ^[0-9]+$ && "$api_id" -gt 0 ]]; then
      break
    fi
    printf "Please enter a positive numeric Telegram API ID.\n"
  done

  if [[ -n "$current_api_hash" ]]; then
    api_hash="$(prompt_secret_optional "Telegram API hash (leave blank to keep existing)")"
    [[ -z "$api_hash" ]] && api_hash="$current_api_hash"
  else
    api_hash="$(prompt_secret "Telegram API hash")"
  fi

  if [[ -n "$current_proxy_url" ]]; then
    prompt_read "Telegram proxy URL (optional; default: ${current_proxy_url}; type none to clear): " proxy_url
    [[ -z "$proxy_url" ]] && proxy_url="$current_proxy_url"
  else
    prompt_read "Telegram proxy URL (optional): " proxy_url
  fi
  proxy_url="${proxy_url#"${proxy_url%%[![:space:]]*}"}"
  proxy_url="${proxy_url%"${proxy_url##*[![:space:]]}"}"
  if [[ "${proxy_url,,}" == "none" || "${proxy_url,,}" == "no" || "${proxy_url,,}" == "direct" ]]; then
    proxy_url=""
  fi

  phone_number="$(prompt_non_empty "Telegram phone number (with country code)")"
  two_step_password="$(prompt_secret_optional "Telegram two-step password (leave blank if disabled)")"
  force_sms="$(prompt_yes_no "Force SMS delivery for the login code?" "no")"

  printf "\nTelegram will send a login code now. Enter that code when the helper asks for it.\n"
  args=(
    node server/scripts/configure-remote-channel.js
    --env-file "${INSTALL_DIR}/.env"
    --api-id "$api_id"
    --api-hash "$api_hash"
    --phone-number "$phone_number"
  )
  if [[ -n "$proxy_url" ]]; then
    args+=(--proxy-url "$proxy_url")
  else
    args+=(--no-proxy)
  fi
  if [[ -n "$two_step_password" ]]; then
    args+=(--password "$two_step_password")
  fi
  if [[ "$force_sms" == "yes" ]]; then
    args+=(--force-sms)
  fi

  if ! run_db_command_interactive "${args[@]}"; then
    press_enter_to_continue
    return 1
  fi

  press_enter_to_continue
}

db_restore_backup() {
  local resolved=""
  resolved="$(select_backup_db_path)"

  if [[ "$(prompt_yes_no "This will replace the current database with ${resolved}. Continue?" "no")" != "yes" ]]; then
    log "Restore canceled."
    return 0
  fi

  DB_BACKUP_PATH="$resolved"
  restore_backup_if_provided
  press_enter_to_continue
}

show_db_menu() {
  while true; do
    clear
    show_banner
    printf "\n"

    printf "Manage Database\n"
    printf "┌──── Inspect ────────────────────────────────┐\n"
    printf "│                                             │\n"
    printf "│  1) 👁️  Inspect database (summary)           │\n"
    printf "│  2) 👁️  Inspect chats metadata               │\n"
    printf "│  3) 👁️  Inspect users                        │\n"
    printf "│  4) 👁️  Inspect files                        │\n"
    printf "│                                             │\n"
    printf "├──── Backup & Repair ────────────────────────┤\n"
    printf "│                                             │\n"
    printf "│  5) 📤  Backup database                     │\n"
    printf "│  6) ♻️  Restore backup                       │\n"
    printf "│  7) 🧹  Vacuum database                     │\n"
    printf "│  8) 🔄️  Reset database                      │\n"
    printf "│  9) 🗑️  Delete database                      │\n"
    printf "│                                             │\n"
    printf "├──── User & Chat Management ─────────────────┤\n"
    printf "│                                             │\n"
    printf "│  10) 👤  Create user                        │\n"
    printf "│  11) 👥  Generate users (bulk)              │\n"
    printf "│  12) ✏️  Edit user                           │\n"
    printf "│  13) 🚫  Ban/unban user                     │\n"
    printf "│  14) 💬  Create group/channel               │\n"
    printf "│  15) ➕  Add members to chat                │\n"
    printf "│  16) ✏️  Edit chat                           │\n"
    printf "│                                             │\n"
    printf "├──── Remote Channels ────────────────────────┤\n"
    printf "│                                             │\n"
    printf "│  17) 📡  Configure Remote Channel           │\n"
    printf "│                                             │\n"
    printf "├──── Destructive Actions ────────────────────┤\n"
    printf "│                                             │\n"
    printf "│  18) 🗑️  Delete chats                        │\n"
    printf "│  19) 🗑️  Delete users                        │\n"
    printf "│  20) 🗑️  Delete files                        │\n"
    printf "│                                             │\n"
    printf "├──── Help & Navigation ──────────────────────┤\n"
    printf "│                                             │\n"
    printf "│  21) ❔  Show help                          │\n"
    printf "│  22) ↩️  Go back                             │\n"
    printf "│  0) 🚪  Exit                                │\n"
    printf "│                                             │\n"
    printf "└─────────────────────────────────────────────┘\n\n"

    prompt_read "Choose an option [0-22]: " choice
    case "$choice" in
      1) db_inspect "all" ;;
      2) db_inspect "chat" ;;
      3) db_inspect "user" ;;
      4) db_inspect "file" ;;
      5) db_backup ;;
      6) db_restore ;;
      7) db_vacuum ;;
      8) db_reset ;;
      9) db_delete ;;
      10) db_user_create ;;
      11) db_user_generate ;;
      12) db_user_edit ;;
      13) db_user_ban ;;
      14) db_chat_create ;;
      15) db_chat_add ;;
      16) db_chat_edit ;;
      17) db_remote_configure ;;
      18) db_chat_delete ;;
      19) db_user_delete ;;
      20) db_file_delete ;;
      21) db_help ;;
      22) return ;;
      0) exit 0 ;;
      *) printf "Invalid choice. Select a number from 0 to 22.\n" ;;
    esac
  done
}

main() {
  if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
    SKIP_CLEAR_ON_EXIT="1"
    printf "%s\n" "$SCRIPT_VERSION"
    return 0
  fi

  init_prompt_io
  detect_os
  ensure_sudo
  ensure_global_command_on_first_run

  trap 'handle_exit' EXIT
  trap 'handle_interrupt' INT TERM

  local choice=""
  while true; do
    show_menu
    prompt_read "Choose an option [0-9]: " choice
    case "$choice" in
      1) run_menu_action install_songbird ;;
      2) run_menu_action update_songbird ;;
      3) run_menu_action restart_songbird ;;
      4) run_menu_action edit_settings ;;
      5) run_menu_action show_db_menu ;;
      6) run_menu_action remove_songbird ;;
      7) run_menu_action install_global_command ;;
      8) run_menu_action configure_mirrors_menu ;;
      9) run_menu_action show_logs_menu ;;
      0) break ;;
      *) printf "Invalid choice. Select a number from 0 to 9.\n" ;;
    esac
  done
}

main "$@"
