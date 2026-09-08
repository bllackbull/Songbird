#!/bin/bash -p
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/songbird/data}"
SYSTEMCTL_BIN="/bin/systemctl"
ID_BIN="/usr/bin/id"
MKDIR_BIN="/usr/bin/mkdir"
CHOWN_BIN="/usr/bin/chown"
RUNUSER_BIN="/usr/sbin/runuser"
ENV_BIN="/usr/bin/env"
REALPATH_BIN="/usr/bin/realpath"
DIRNAME_BIN="/usr/bin/dirname"

is_container_cgroup() {
  local cgroup_content="$1"
  [[ "$cgroup_content" == *"/docker/"* || "$cgroup_content" == *"/docker-"* || \
    "$cgroup_content" == *"/libpod-"* || "$cgroup_content" == *"/kubepods"* ]]
}

is_container() {
  local cgroup_content=""

  [[ -e "/.dockerenv" || -e "/run/.containerenv" || -n "${container:-}" ]] && return 0
  if [[ -r "/proc/1/cgroup" ]]; then
    cgroup_content="$(< /proc/1/cgroup)"
    is_container_cgroup "$cgroup_content"
  fi
}

select_runtime_mode() {
  local in_container="$1"
  local load_state="$2"

  if [[ "$in_container" == "yes" ]]; then
    printf 'container'
  elif [[ "$load_state" == "loaded" ]]; then
    printf 'systemd'
  else
    printf 'manual'
  fi
}

parse_systemd_account() {
  local load_state="$1" user="$2" group="$3" primary_group="$4"

  if [[ "$load_state" != "loaded" || -z "$user" ]]; then
    printf 'root:%s' "${group:-root}"
  elif [[ "$user" == "root" ]]; then
    printf 'root:%s' "${group:-root}"
  elif [[ -n "$group" ]]; then
    printf '%s:%s' "$user" "$group"
  else
    printf '%s:%s' "$user" "$primary_group"
  fi
}

read_systemd_properties() {
  local output line load_state="not-found" user="" group=""

  if [[ ! -x "$SYSTEMCTL_BIN" ]] || ! output="$("$SYSTEMCTL_BIN" show songbird.service \
    --property=LoadState --property=User --property=Group 2>/dev/null)"; then
    printf 'not-found\n\n\n'
    return 0
  fi

  while IFS= read -r line; do
    case "$line" in
      LoadState=*) load_state="${line#LoadState=}" ;;
      User=*) user="${line#User=}" ;;
      Group=*) group="${line#Group=}" ;;
    esac
  done <<< "$output"

  printf '%s\n%s\n%s\n' "$load_state" "$user" "$group"
}

resolve_runtime_account() {
  local in_container="no" load_state="not-found" unit_user="" unit_group="" primary_group=""
  local mode account
  local -a properties

  if is_container; then
    in_container="yes"
  else
    mapfile -t properties < <(read_systemd_properties)
    load_state="${properties[0]:-not-found}"
    unit_user="${properties[1]:-}"
    unit_group="${properties[2]:-}"
  fi

  mode="$(select_runtime_mode "$in_container" "$load_state")"
  if [[ "$mode" == "systemd" && -n "$unit_user" && "$unit_user" != "root" ]]; then
    if ! primary_group="$("$ID_BIN" -gn "$unit_user")"; then
      printf 'Configured systemd account %s has no resolvable local primary group.\n' "$unit_user" >&2
      return 70
    fi
    account="$(parse_systemd_account "$load_state" "$unit_user" "$unit_group" "$primary_group")"
  elif [[ "$mode" == "systemd" ]]; then
    account="$(parse_systemd_account "$load_state" "$unit_user" "$unit_group" "root")"
  else
    account="$("$ID_BIN" -un):$("$ID_BIN" -gn)"
  fi

  printf '%s|%s|%s' "$mode" "${account%%:*}" "${account#*:}"
}

validate_instance_data_dir() {
  local launcher_dir install_dir expected_data_dir canonical_data_dir

  launcher_dir="$(builtin cd -- "$("$DIRNAME_BIN" -- "${BASH_SOURCE[0]}")" && builtin pwd -P)"
  install_dir="$("$REALPATH_BIN" -e -- "$launcher_dir/..")"
  expected_data_dir="$install_dir/data"
  canonical_data_dir="$("$REALPATH_BIN" -m -- "$DATA_DIR")"
  if [[ "$canonical_data_dir" != "$expected_data_dir" ]]; then
    printf 'Root-run Songbird data commands only support DATA_DIR=%s.\n' "$expected_data_dir" >&2
    return 78
  fi
  DATA_DIR="$expected_data_dir"
}

validate_current_account() {
  local runtime_user="$1" runtime_group="$2"

  if [[ "$("$ID_BIN" -un)" != "$runtime_user" || "$("$ID_BIN" -gn)" != "$runtime_group" ]]; then
    printf 'Songbird data commands must be run as %s:%s.\n' "$runtime_user" "$runtime_group" >&2
    return 77
  fi
}

execute_data_command() {
  local mode="$1" runtime_user="$2" runtime_group="$3"
  shift 3

  case "$mode" in
    container|manual)
      exec "$@"
      ;;
    systemd)
      if [[ "$runtime_user" == "root" ]]; then
        if [[ "$runtime_group" != "root" ]]; then
          exec "$RUNUSER_BIN" -u root -g "$runtime_group" -- "$ENV_BIN" -i \
            PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
            DATA_DIR="$DATA_DIR" \
            "$@"
        fi
        exec "$@"
      fi
      if [[ "$EUID" -eq 0 ]]; then
        validate_instance_data_dir
        "$MKDIR_BIN" -p "$DATA_DIR"
        "$CHOWN_BIN" -R "${runtime_user}:${runtime_group}" "$DATA_DIR"
        exec "$RUNUSER_BIN" -u "$runtime_user" -g "$runtime_group" -- "$ENV_BIN" -i \
          PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
          DATA_DIR="$DATA_DIR" \
          "$@"
      fi
      validate_current_account "$runtime_user" "$runtime_group"
      "$MKDIR_BIN" -p "$DATA_DIR"
      exec "$@"
      ;;
    *)
      printf 'Unknown Songbird runtime mode: %s.\n' "$mode" >&2
      return 70
      ;;
  esac
}

require_utilities() {
  local utility

  for utility in "$ID_BIN" "$MKDIR_BIN"; do
    if [[ ! -x "$utility" ]]; then
      printf 'Songbird data command launcher requires standard Debian/Ubuntu system utilities.\n' >&2
      return 69
    fi
  done
}

main() {
  local runtime mode runtime_user runtime_group

  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  if [[ "$#" -eq 0 ]]; then
    printf 'Usage: %s <command> [args...]\n' "$0" >&2
    return 64
  fi

  require_utilities
  runtime="$(resolve_runtime_account)"
  IFS='|' read -r mode runtime_user runtime_group <<< "$runtime"

  if [[ "$mode" == "systemd" && "$runtime_user" != "root" && "$EUID" -eq 0 ]]; then
    for utility in "$CHOWN_BIN" "$RUNUSER_BIN" "$ENV_BIN" "$REALPATH_BIN" "$DIRNAME_BIN"; do
      if [[ ! -x "$utility" ]]; then
        printf 'Songbird data command launcher requires standard Debian/Ubuntu system utilities.\n' >&2
        return 69
      fi
    done
  fi

  execute_data_command "$mode" "$runtime_user" "$runtime_group" "$@"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
