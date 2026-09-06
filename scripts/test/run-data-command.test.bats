#!/usr/bin/env bats
# Tests for the privileged data-command launcher runtime-account policy.

LAUNCHER="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/run-data-command.sh"

setup() {
  TEST_DIR="$(mktemp -d)"
  export TEST_DIR
}

teardown() {
  rm -rf "$TEST_DIR"
}

make_target() {
  local target="$1"
  local marker="$2"

  printf '%s\n' \
    '#!/bin/bash' \
    'touch "$1"' > "$target"
  chmod 755 "$target"
  "$target" "$marker"
  rm -f "$marker"
}

make_data_target() {
  local target="$1"

  printf '%s\n' \
    '#!/bin/bash' \
    'touch "$DATA_DIR/target-ran"' > "$target"
  chmod 755 "$target"
}

@test "runtime Docker image packages an executable data-command launcher for every database script" {
  local repo_root
  repo_root="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

  run grep -Fx 'COPY scripts/run-data-command.sh ./scripts/run-data-command.sh' "$repo_root/Dockerfile"
  [ "$status" -eq 0 ]

  run grep -Fx 'RUN chmod 755 /app/scripts/run-data-command.sh' "$repo_root/Dockerfile"
  [ "$status" -eq 0 ]

  run node -e '
    const pkg = require(process.argv[1]);
    const dbScripts = Object.entries(pkg.scripts).filter(([name]) => name.startsWith("db:"));
    if (dbScripts.length === 0) process.exit(1);
    for (const [name, command] of dbScripts) {
      if (!command.startsWith("/bin/bash -p ../scripts/run-data-command.sh ")) {
        console.error(`${name} does not use the privileged data-command launcher`);
        process.exit(1);
      }
    }
  ' "$repo_root/server/package.json"
  [ "$status" -eq 0 ]
}

@test "runtime mode prefers container over a loaded systemd unit" {
  source "$LAUNCHER"

  run select_runtime_mode yes loaded

  [ "$status" -eq 0 ]
  [ "$output" = "container" ]
}

@test "runtime mode selects systemd only for a loaded unit" {
  source "$LAUNCHER"

  run select_runtime_mode no loaded
  [ "$status" -eq 0 ]
  [ "$output" = "systemd" ]

  run select_runtime_mode no not-found
  [ "$status" -eq 0 ]
  [ "$output" = "manual" ]
}

@test "systemd account honors a custom User and Group" {
  source "$LAUNCHER"

  run parse_systemd_account loaded appuser appgroup ignored

  [ "$status" -eq 0 ]
  [ "$output" = "appuser:appgroup" ]
}

@test "systemd account uses the service user's primary group when Group is empty" {
  source "$LAUNCHER"

  run parse_systemd_account loaded appuser '' appgroup

  [ "$status" -eq 0 ]
  [ "$output" = "appuser:appgroup" ]
}

@test "systemd root account preserves an explicit Group" {
  source "$LAUNCHER"

  run parse_systemd_account loaded '' '' ignored
  [ "$status" -eq 0 ]
  [ "$output" = "root:root" ]

  run parse_systemd_account loaded root appgroup ignored
  [ "$status" -eq 0 ]
  [ "$output" = "root:appgroup" ]
}

@test "systemd property reader parses named properties regardless of output order" {
  local systemctl_stub="$TEST_DIR/systemctl"
  printf '%s\n' \
    '#!/bin/bash' \
    'printf "User=appuser\\nGroup=appgroup\\nLoadState=loaded\\n"' > "$systemctl_stub"
  chmod 755 "$systemctl_stub"
  source "$LAUNCHER"
  SYSTEMCTL_BIN="$systemctl_stub"

  run read_systemd_properties

  [ "$status" -eq 0 ]
  [ "$output" = $'loaded\nappuser\nappgroup' ]
}

@test "systemd property reader treats an unavailable unit lookup as manual mode" {
  local systemctl_stub="$TEST_DIR/systemctl"
  printf '%s\n' '#!/bin/bash' 'exit 1' > "$systemctl_stub"
  chmod 755 "$systemctl_stub"
  source "$LAUNCHER"
  SYSTEMCTL_BIN="$systemctl_stub"

  run read_systemd_properties

  [ "$status" -eq 0 ]
  [ "$output" = "not-found" ]
}

@test "container mode leaves ownership handling to the current container identity" {
  source "$LAUNCHER"
  local target="$TEST_DIR/target"

  make_target "$target" "$TEST_DIR/target-ran"
  CHOWN_BIN="$TEST_DIR/chown"
  RUNUSER_BIN="$TEST_DIR/runuser"
  printf '%s\n' '#!/bin/bash' 'touch "$TEST_DIR/chown-ran"; exit 99' > "$CHOWN_BIN"
  printf '%s\n' '#!/bin/bash' 'touch "$TEST_DIR/runuser-ran"; exit 99' > "$RUNUSER_BIN"
  chmod 755 "$CHOWN_BIN" "$RUNUSER_BIN"

  run execute_data_command container root root "$target" "$TEST_DIR/target-ran"

  [ "$status" -eq 0 ]
  [ -e "$TEST_DIR/target-ran" ]
  [ ! -e "$TEST_DIR/chown-ran" ]
  [ ! -e "$TEST_DIR/runuser-ran" ]
}

@test "manual root mode runs directly without ownership repair" {
  source "$LAUNCHER"
  local target="$TEST_DIR/target"

  make_target "$target" "$TEST_DIR/target-ran"
  CHOWN_BIN="$TEST_DIR/chown"
  RUNUSER_BIN="$TEST_DIR/runuser"
  printf '%s\n' '#!/bin/bash' 'exit 99' > "$CHOWN_BIN"
  printf '%s\n' '#!/bin/bash' 'exit 99' > "$RUNUSER_BIN"
  chmod 755 "$CHOWN_BIN" "$RUNUSER_BIN"

  run execute_data_command manual root root "$target" "$TEST_DIR/target-ran"

  [ "$status" -eq 0 ]
  [ -e "$TEST_DIR/target-ran" ]
}

@test "systemd root mode runs directly without ownership repair" {
  source "$LAUNCHER"
  local target="$TEST_DIR/target"

  make_target "$target" "$TEST_DIR/target-ran"
  CHOWN_BIN="$TEST_DIR/chown"
  RUNUSER_BIN="$TEST_DIR/runuser"
  printf '%s\n' '#!/bin/bash' 'exit 99' > "$CHOWN_BIN"
  printf '%s\n' '#!/bin/bash' 'exit 99' > "$RUNUSER_BIN"
  chmod 755 "$CHOWN_BIN" "$RUNUSER_BIN"

  run execute_data_command systemd root root "$target" "$TEST_DIR/target-ran"

  [ "$status" -eq 0 ]
  [ -e "$TEST_DIR/target-ran" ]
}

@test "systemd root mode preserves an explicit group without ownership repair" {
  source "$LAUNCHER"
  local target="$TEST_DIR/target"

  make_target "$target" "$TEST_DIR/target-ran"
  CHOWN_BIN="$TEST_DIR/chown"
  RUNUSER_BIN="$TEST_DIR/runuser"
  printf '%s\n' '#!/bin/bash' 'touch "$TEST_DIR/chown-ran"; exit 99' > "$CHOWN_BIN"
  printf '%s\n' \
    '#!/bin/bash' \
    'printf "%s\n" "$*" > "$TEST_DIR/runuser-args"' \
    'while [[ "$1" != "--" ]]; do shift; done' \
    'shift' \
    'exec "$@"' > "$RUNUSER_BIN"
  chmod 755 "$CHOWN_BIN" "$RUNUSER_BIN"

  run execute_data_command systemd root appgroup "$target" "$TEST_DIR/target-ran"

  [ "$status" -eq 0 ]
  [ -e "$TEST_DIR/target-ran" ]
  [ ! -e "$TEST_DIR/chown-ran" ]
  [[ "$(cat "$TEST_DIR/runuser-args")" == "-u root -g appgroup -- /usr/bin/env -i "* ]]
}

@test "systemd custom-user mode repairs only the installation data directory then switches user" {
  if [[ "$EUID" -ne 0 ]]; then
    skip "requires a root caller to exercise the ownership-repair branch"
  fi

  local install_dir="$TEST_DIR/install"
  local isolated_launcher="$install_dir/scripts/run-data-command.sh"
  local target="$TEST_DIR/target"
  mkdir -p "$install_dir/scripts"
  cp "$LAUNCHER" "$isolated_launcher"
  chmod 755 "$isolated_launcher"
  source "$isolated_launcher"

  DATA_DIR="$install_dir/data"
  make_data_target "$target"
  CHOWN_BIN="$TEST_DIR/chown"
  RUNUSER_BIN="$TEST_DIR/runuser"
  printf '%s\n' \
    '#!/bin/bash' \
    'printf "%s\n" "$*" > "$TEST_DIR/chown-args"' > "$CHOWN_BIN"
  printf '%s\n' \
    '#!/bin/bash' \
    'printf "%s\n" "$*" > "$TEST_DIR/runuser-args"' \
    'while [[ "$1" != "--" ]]; do shift; done' \
    'shift' \
    'exec "$@"' > "$RUNUSER_BIN"
  chmod 755 "$CHOWN_BIN" "$RUNUSER_BIN"

  run execute_data_command systemd appuser appgroup "$target"

  [ "$status" -eq 0 ]
  [ "$output" = "" ]
  [ -e "$DATA_DIR/target-ran" ]
  [ "$(<"$TEST_DIR/chown-args")" = "-R appuser:appgroup $DATA_DIR" ]
  [[ "$(<"$TEST_DIR/runuser-args")" == "-u appuser -g appgroup -- /usr/bin/env -i "* ]]
  [[ "$(<"$TEST_DIR/runuser-args")" == *" DATA_DIR=$DATA_DIR $target" ]]
}

@test "systemd custom-user mode rejects a root DATA_DIR outside its installation" {
  if [[ "$EUID" -ne 0 ]]; then
    skip "requires a root caller to exercise the ownership-repair branch"
  fi

  local install_dir="$TEST_DIR/install"
  local isolated_launcher="$install_dir/scripts/run-data-command.sh"
  mkdir -p "$install_dir/scripts"
  cp "$LAUNCHER" "$isolated_launcher"
  chmod 755 "$isolated_launcher"
  source "$isolated_launcher"

  DATA_DIR="$TEST_DIR/untrusted-data"
  CHOWN_BIN="$TEST_DIR/chown"
  RUNUSER_BIN="$TEST_DIR/runuser"
  printf '%s\n' '#!/bin/bash' 'touch "$TEST_DIR/chown-ran"' > "$CHOWN_BIN"
  printf '%s\n' '#!/bin/bash' 'touch "$TEST_DIR/runuser-ran"' > "$RUNUSER_BIN"
  chmod 755 "$CHOWN_BIN" "$RUNUSER_BIN"

  run execute_data_command systemd appuser appgroup /usr/bin/true

  [ "$status" -eq 78 ]
  [[ "$output" == *"only support DATA_DIR=$install_dir/data"* ]]
  [ ! -e "$DATA_DIR" ]
  [ ! -e "$TEST_DIR/chown-ran" ]
  [ ! -e "$TEST_DIR/runuser-ran" ]
}

@test "non-root caller mismatching the systemd account fails before data creation" {
  local data_dir="$TEST_DIR/data"
  local target="$TEST_DIR/target"
  local identity_stub="$TEST_DIR/id"
  source "$LAUNCHER"

  make_target "$target" "$TEST_DIR/target-ran"
  printf '%s\n' \
    '#!/bin/bash' \
    'case "$1" in' \
    '  -un) printf "operator\\n" ;;' \
    '  -gn) printf "operator\\n" ;;' \
    'esac' > "$identity_stub"
  chmod 755 "$identity_stub"
  ID_BIN="$identity_stub"
  DATA_DIR="$data_dir"

  run validate_current_account appuser appgroup

  [ "$status" -eq 77 ]
  [[ "$output" == *"must be run as appuser:appgroup"* ]]
  [ ! -e "$data_dir" ]
  [ ! -e "$TEST_DIR/target-ran" ]
}

@test "production main ignores PATH and exported id functions" {
  local stub_bin="$TEST_DIR/bin"
  local target="$TEST_DIR/target"
  mkdir -p "$stub_bin"
  make_target "$target" "$TEST_DIR/target-ran"
  printf '%s\n' '#!/bin/bash' 'touch "$TEST_DIR/path-id-ran"; printf "spoofed\\n"' > "$stub_bin/id"
  chmod 755 "$stub_bin/id"

  run env TEST_DIR="$TEST_DIR" PATH="$stub_bin:$PATH" LAUNCHER="$LAUNCHER" TARGET="$target" /bin/bash -c \
    'id() { touch "$TEST_DIR/function-id-ran"; printf "spoofed\\n"; }; export -f id; exec /bin/bash -p "$LAUNCHER" "$TARGET" "$TEST_DIR/target-ran"'

  [ "$status" -eq 0 ]
  [ -e "$TEST_DIR/target-ran" ]
  [ ! -e "$TEST_DIR/path-id-ran" ]
  [ ! -e "$TEST_DIR/function-id-ran" ]
}
