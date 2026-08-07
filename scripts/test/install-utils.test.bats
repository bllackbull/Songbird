#!/usr/bin/env bats
# Tests for pure utility functions in scripts/install.sh
#
# Strategy: source install.sh with all traps and the interactive main()
# disabled, then call individual functions directly. System-level commands
# (apt-get, systemctl, nginx, git, etc.) are stubbed as no-ops so the
# functions can run in any environment without side effects.

INSTALL_SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/install.sh"

# ---------------------------------------------------------------------------
# Source the script once with dangerous commands stubbed out.
# We use a subshell wrapper per-test (via run) for functions that call exit,
# and direct calls for pure functions.
# ---------------------------------------------------------------------------

setup() {
  TEST_DIR="$(mktemp -d)"

  # Stub system commands that would require root or external services.
  # NOTE: dpkg is intentionally NOT stubbed — offline_source_is_newer relies on
  # the real `dpkg --compare-versions` for semantic version comparison.
  apt-get()    { return 0; }
  systemctl()  { return 0; }
  nginx()      { return 0; }
  git()        { return 0; }
  useradd()    { return 0; }
  usermod()    { return 0; }
  certbot()    { return 0; }
  lsb_release(){ printf "jammy"; }
  tput()       { return 1; }  # force terminal_columns to fall back to $COLUMNS
  visudo()     { return 0; }
  export -f apt-get systemctl nginx git useradd usermod certbot lsb_release tput visudo

  # Disable traps and the interactive menu entry point before sourcing
  # shellcheck disable=SC1090
  source <(
    # Strip the trap registrations and the show_menu / main call at end of file
    # so sourcing doesn't block or call exit
    sed \
      -e "s/trap '[^']*' INT TERM/:/g" \
      -e "s/trap '[^']*' EXIT/:/g" \
      -e '/^show_menu$/d' \
      -e '/^main$/d' \
      -e '/^main[[:space:]"]/d' \
      "$INSTALL_SCRIPT"
  )

  # IMPORTANT: sourcing install.sh resets INSTALL_DIR and LOG_FILE to their
  # hardcoded /opt/songbird values. Override them AFTER sourcing so the
  # file-based helpers read/write inside our temp dir instead.
  INSTALL_DIR="$TEST_DIR/install"
  LOG_FILE="$TEST_DIR/install.log"
  mkdir -p "$INSTALL_DIR"
  touch "$LOG_FILE"

  # Override clear to a no-op so handle_exit doesn't wipe test output
  clear() { return 0; }

  # Point COLUMNS to a known value for wrap_success_line tests
  export COLUMNS=80
}

teardown() {
  rm -rf "$TEST_DIR"
}

# ===========================================================================
# strip_surrounding_quotes
# ===========================================================================

@test "strip_surrounding_quotes: removes double quotes" {
  result="$(strip_surrounding_quotes '"hello"')"
  [ "$result" = "hello" ]
}

@test "strip_surrounding_quotes: removes single quotes" {
  result="$(strip_surrounding_quotes "'hello'")"
  [ "$result" = "hello" ]
}

@test "strip_surrounding_quotes: leaves unquoted string unchanged" {
  result="$(strip_surrounding_quotes "hello")"
  [ "$result" = "hello" ]
}

@test "strip_surrounding_quotes: leaves mismatched quotes unchanged" {
  result="$(strip_surrounding_quotes '"hello'"'")"
  [ "$result" = '"hello'"'" ]
}

@test "strip_surrounding_quotes: handles empty string" {
  result="$(strip_surrounding_quotes "")"
  [ "$result" = "" ]
}

@test "strip_surrounding_quotes: leaves string with only one quote unchanged" {
  result="$(strip_surrounding_quotes '"')"
  [ "$result" = '"' ]
}

# ===========================================================================
# normalize_path_input
# ===========================================================================

@test "normalize_path_input: expands ~ to HOME" {
  result="$(normalize_path_input "~/foo/bar")"
  [ "$result" = "$HOME/foo/bar" ]
}

@test "normalize_path_input: leaves absolute path unchanged" {
  result="$(normalize_path_input "/etc/hosts")"
  [ "$result" = "/etc/hosts" ]
}

@test "normalize_path_input: leaves relative path unchanged" {
  result="$(normalize_path_input "relative/path")"
  [ "$result" = "relative/path" ]
}

@test "normalize_path_input: handles tilde-only input" {
  result="$(normalize_path_input "~")"
  [ "$result" = "$HOME" ]
}

# ===========================================================================
# strip_carriage_returns
# ===========================================================================

@test "strip_carriage_returns: removes carriage returns" {
  result="$(strip_carriage_returns $'hello\r\nworld\r')"
  [ "$result" = $'hello\nworld' ]
}

@test "strip_carriage_returns: leaves string without CR unchanged" {
  result="$(strip_carriage_returns "hello world")"
  [ "$result" = "hello world" ]
}

# ===========================================================================
# resolve_file_path
# ===========================================================================

@test "resolve_file_path: resolves an existing absolute path" {
  tmp_file="$(mktemp)"
  result="$(resolve_file_path "$tmp_file")"
  [ "$result" = "$tmp_file" ]
  rm -f "$tmp_file"
}

@test "resolve_file_path: returns non-zero for a non-existent absolute path" {
  run resolve_file_path "/this/path/definitely/does/not/exist/ever"
  [ "$status" -ne 0 ]
}

@test "resolve_file_path: strips surrounding double quotes before resolving" {
  tmp_file="$(mktemp)"
  result="$(resolve_file_path "\"${tmp_file}\"")"
  [ "$result" = "$tmp_file" ]
  rm -f "$tmp_file"
}

@test "resolve_file_path: strips surrounding single quotes before resolving" {
  tmp_file="$(mktemp)"
  result="$(resolve_file_path "'${tmp_file}'")"
  [ "$result" = "$tmp_file" ]
  rm -f "$tmp_file"
}

@test "resolve_file_path: expands tilde before resolving" {
  # Create a file in HOME and reference it with ~
  tmp_file="$(mktemp "$HOME/sb_test_XXXXXX")"
  rel="${tmp_file#"$HOME/"}"
  result="$(resolve_file_path "~/$rel")"
  [ "$result" = "$tmp_file" ]
  rm -f "$tmp_file"
}

@test "resolve_file_path: returns non-zero for empty input" {
  run resolve_file_path ""
  [ "$status" -ne 0 ]
}

@test "resolve_file_path: strips leading and trailing whitespace" {
  tmp_file="$(mktemp)"
  result="$(resolve_file_path "  ${tmp_file}  ")"
  [ "$result" = "$tmp_file" ]
  rm -f "$tmp_file"
}

# ===========================================================================
# bytes_to_mb_rounded_up
# ===========================================================================

@test "bytes_to_mb_rounded_up: exact megabyte" {
  result="$(bytes_to_mb_rounded_up 1048576)"
  [ "$result" = "1" ]
}

@test "bytes_to_mb_rounded_up: rounds up one byte over a megabyte" {
  result="$(bytes_to_mb_rounded_up 1048577)"
  [ "$result" = "2" ]
}

@test "bytes_to_mb_rounded_up: zero bytes returns 0" {
  result="$(bytes_to_mb_rounded_up 0)"
  [ "$result" = "0" ]
}

@test "bytes_to_mb_rounded_up: one byte rounds up to 1 MB" {
  result="$(bytes_to_mb_rounded_up 1)"
  [ "$result" = "1" ]
}

@test "bytes_to_mb_rounded_up: 75 MB in bytes" {
  result="$(bytes_to_mb_rounded_up $((75 * 1048576)))"
  [ "$result" = "75" ]
}

@test "bytes_to_mb_rounded_up: returns non-zero for non-numeric input" {
  run bytes_to_mb_rounded_up "notanumber"
  [ "$status" -ne 0 ]
}

@test "bytes_to_mb_rounded_up: returns non-zero for empty input" {
  run bytes_to_mb_rounded_up ""
  [ "$status" -ne 0 ]
}

@test "bytes_to_mb_rounded_up: strips whitespace before converting" {
  result="$(bytes_to_mb_rounded_up " 1048576 ")"
  [ "$result" = "1" ]
}

# ===========================================================================
# parse_domain_input / build_domain_groups
# ===========================================================================

@test "parse_domain_input: single domain produces one DOMAIN_NAME" {
  parse_domain_input "example.com"
  [ "${#DOMAIN_NAMES[@]}" -eq 1 ]
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
}

@test "parse_domain_input: two unrelated domains produce two DOMAIN_NAMES" {
  parse_domain_input "example.com,other.org"
  [ "${#DOMAIN_NAMES[@]}" -eq 2 ]
}

@test "parse_domain_input: strips whitespace around domains" {
  parse_domain_input " example.com , other.org "
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
  [ "${DOMAIN_NAMES[1]}" = "other.org" ]
}

@test "parse_domain_input: lowercases domain names" {
  parse_domain_input "Example.COM"
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
}

@test "parse_domain_input: strips http:// prefix" {
  parse_domain_input "http://example.com"
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
}

@test "parse_domain_input: strips https:// prefix" {
  parse_domain_input "https://example.com"
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
}

@test "parse_domain_input: strips trailing dot" {
  parse_domain_input "example.com."
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
}

@test "parse_domain_input: strips path from domain URL" {
  parse_domain_input "https://example.com/some/path"
  [ "${DOMAIN_NAMES[0]}" = "example.com" ]
}

@test "parse_domain_input: deduplicates identical domains" {
  parse_domain_input "example.com,example.com"
  [ "${#DOMAIN_NAMES[@]}" -eq 1 ]
}

@test "parse_domain_input: sets NGINX_SERVER_NAME to the domain" {
  parse_domain_input "example.com"
  [ "$NGINX_SERVER_NAME" = "example.com" ]
}

@test "build_domain_groups: www and apex paired into one group" {
  parse_domain_input "example.com,www.example.com"
  [ "${#DOMAIN_GROUPS[@]}" -eq 1 ]
  [[ "${DOMAIN_GROUPS[0]}" == *"example.com"* ]]
  [[ "${DOMAIN_GROUPS[0]}" == *"www.example.com"* ]]
}

@test "build_domain_groups: apex is primary in a www+apex pair" {
  parse_domain_input "example.com,www.example.com"
  primary="$(group_primary_domain "${DOMAIN_GROUPS[0]}")"
  [ "$primary" = "example.com" ]
}

@test "build_domain_groups: www-first input still pairs correctly" {
  parse_domain_input "www.example.com,example.com"
  [ "${#DOMAIN_GROUPS[@]}" -eq 1 ]
}

@test "build_domain_groups: two unrelated domains produce two groups" {
  parse_domain_input "alpha.com,beta.com"
  [ "${#DOMAIN_GROUPS[@]}" -eq 2 ]
}

@test "build_domain_groups: single domain produces one group" {
  parse_domain_input "example.com"
  [ "${#DOMAIN_GROUPS[@]}" -eq 1 ]
}

@test "build_domain_groups: empty input produces no groups" {
  parse_domain_input ""
  [ "${#DOMAIN_GROUPS[@]}" -eq 0 ]
}

@test "build_domain_groups: three domains where two pair, one standalone" {
  parse_domain_input "example.com,www.example.com,other.org"
  [ "${#DOMAIN_GROUPS[@]}" -eq 2 ]
}

# ===========================================================================
# group_csv_to_space_list
# ===========================================================================

@test "group_csv_to_space_list: converts comma to space" {
  result="$(group_csv_to_space_list "example.com,www.example.com")"
  [ "$result" = "example.com www.example.com" ]
}

@test "group_csv_to_space_list: single entry unchanged" {
  result="$(group_csv_to_space_list "example.com")"
  [ "$result" = "example.com" ]
}

@test "group_csv_to_space_list: empty string returns empty" {
  result="$(group_csv_to_space_list "")"
  [ "$result" = "" ]
}

# ===========================================================================
# group_primary_domain
# ===========================================================================

@test "group_primary_domain: returns first domain in csv" {
  result="$(group_primary_domain "example.com,www.example.com")"
  [ "$result" = "example.com" ]
}

@test "group_primary_domain: single entry returns itself" {
  result="$(group_primary_domain "example.com")"
  [ "$result" = "example.com" ]
}

# ===========================================================================
# wrap_success_line
# ===========================================================================

@test "wrap_success_line: short text fits on one line" {
  result="$(wrap_success_line "hello" 20)"
  [ "$result" = "hello" ]
}

@test "wrap_success_line: empty text produces a blank line" {
  result="$(wrap_success_line "" 20)"
  [ "$result" = "" ]
}

@test "wrap_success_line: long text wraps at a word boundary" {
  result="$(wrap_success_line "one two three four five" 10)"
  # First line should be at most 10 chars and end at a word boundary
  first_line="$(printf "%s" "$result" | head -n 1)"
  [ "${#first_line}" -le 10 ]
}

@test "wrap_success_line: width of 0 returns text as-is" {
  result="$(wrap_success_line "hello world" 0)"
  [ "$result" = "hello world" ]
}

@test "wrap_success_line: text with no spaces wraps by hard cut" {
  result="$(wrap_success_line "abcdefghij" 5)"
  first_line="$(printf "%s" "$result" | head -n 1)"
  [ "${#first_line}" -eq 5 ]
}

# ===========================================================================
# read_version_file_value
# ===========================================================================

@test "read_version_file_value: reads version from a file" {
  echo "1.2.3" > "$TEST_DIR/VERSION"
  result="$(read_version_file_value "$TEST_DIR/VERSION")"
  [ "$result" = "1.2.3" ]
}

@test "read_version_file_value: strips whitespace around version" {
  printf "  1.2.3  \n" > "$TEST_DIR/VERSION"
  result="$(read_version_file_value "$TEST_DIR/VERSION")"
  [ "$result" = "1.2.3" ]
}

@test "read_version_file_value: returns non-zero for missing file" {
  run read_version_file_value "$TEST_DIR/NO_SUCH_FILE"
  [ "$status" -ne 0 ]
}

@test "read_version_file_value: returns non-zero for empty file" {
  touch "$TEST_DIR/EMPTY"
  run read_version_file_value "$TEST_DIR/EMPTY"
  [ "$status" -ne 0 ]
}

# ===========================================================================
# read_script_version_header
# ===========================================================================

@test "read_script_version_header: reads version from script header comment" {
  printf '#!/usr/bin/env bash\n# songbird-deploy-version: 1.5.0\necho hi\n' > "$TEST_DIR/fake.sh"
  result="$(read_script_version_header "$TEST_DIR/fake.sh")"
  [ "$result" = "1.5.0" ]
}

@test "read_script_version_header: returns non-zero when header is missing" {
  printf '#!/usr/bin/env bash\necho hi\n' > "$TEST_DIR/fake.sh"
  run read_script_version_header "$TEST_DIR/fake.sh"
  [ "$status" -ne 0 ]
}

@test "read_script_version_header: returns non-zero when version is 'auto'" {
  printf '#!/usr/bin/env bash\n# songbird-deploy-version: auto\necho hi\n' > "$TEST_DIR/fake.sh"
  run read_script_version_header "$TEST_DIR/fake.sh"
  [ "$status" -ne 0 ]
}

@test "read_script_version_header: returns non-zero for missing file" {
  run read_script_version_header "$TEST_DIR/NO_SUCH_FILE"
  [ "$status" -ne 0 ]
}

# ===========================================================================
# offline_source_is_newer  (uses dpkg --compare-versions)
# ===========================================================================

setup_version_dirs() {
  local source_ver="$1"
  local install_ver="$2"
  SOURCE_ROOT="$TEST_DIR/source"
  INSTALL_ROOT="$TEST_DIR/installed"
  mkdir -p "$SOURCE_ROOT" "$INSTALL_ROOT"
  mkdir -p "$SOURCE_ROOT/server" "$SOURCE_ROOT/client"
  printf "%s\n" "$source_ver" > "$SOURCE_ROOT/VERSION"
  printf "%s\n" "$install_ver" > "$INSTALL_ROOT/VERSION"
  # Provide a minimal package.json so the structure is valid
  echo '{}' > "$SOURCE_ROOT/package.json"
}

@test "offline_source_is_newer: returns 0 when source version is higher" {
  setup_version_dirs "0.12.0" "0.11.1"
  run offline_source_is_newer "$SOURCE_ROOT" "$INSTALL_ROOT"
  [ "$status" -eq 0 ]
}

@test "offline_source_is_newer: returns non-zero when source version is equal" {
  setup_version_dirs "0.11.1" "0.11.1"
  run offline_source_is_newer "$SOURCE_ROOT" "$INSTALL_ROOT"
  [ "$status" -ne 0 ]
}

@test "offline_source_is_newer: returns non-zero when source version is lower" {
  setup_version_dirs "0.10.0" "0.11.1"
  run offline_source_is_newer "$SOURCE_ROOT" "$INSTALL_ROOT"
  [ "$status" -ne 0 ]
}

@test "offline_source_is_newer: returns 0 when installed VERSION is missing" {
  setup_version_dirs "0.12.0" "0.11.1"
  rm "$INSTALL_ROOT/VERSION"
  run offline_source_is_newer "$SOURCE_ROOT" "$INSTALL_ROOT"
  [ "$status" -eq 0 ]
}

@test "offline_source_is_newer: returns non-zero when source VERSION is missing" {
  setup_version_dirs "0.12.0" "0.11.1"
  rm "$SOURCE_ROOT/VERSION"
  run offline_source_is_newer "$SOURCE_ROOT" "$INSTALL_ROOT"
  [ "$status" -ne 0 ]
}

# ===========================================================================
# resolve_offline_source_root
# ===========================================================================

make_valid_source_dir() {
  local dir="$1"
  mkdir -p "$dir/server" "$dir/client"
  echo '{}' > "$dir/package.json"
}

@test "resolve_offline_source_root: returns dir when it directly contains source" {
  src="$TEST_DIR/src"
  make_valid_source_dir "$src"
  result="$(resolve_offline_source_root "$src")"
  [ "$result" = "$src" ]
}

@test "resolve_offline_source_root: detects source one level deep in zip" {
  wrapper="$TEST_DIR/wrapper"
  inner="$wrapper/Songbird-main"
  make_valid_source_dir "$inner"
  result="$(resolve_offline_source_root "$wrapper")"
  [ "$result" = "$inner" ]
}

@test "resolve_offline_source_root: returns non-zero when no valid source found" {
  empty="$TEST_DIR/empty_dir"
  mkdir -p "$empty"
  run resolve_offline_source_root "$empty"
  [ "$status" -ne 0 ]
}

@test "resolve_offline_source_root: returns non-zero when multiple subdirs exist without valid structure" {
  multi="$TEST_DIR/multi"
  mkdir -p "$multi/a" "$multi/b"
  run resolve_offline_source_root "$multi"
  [ "$status" -ne 0 ]
}

# ===========================================================================
# get_existing_env_value
# ===========================================================================

@test "get_existing_env_value: reads an existing key from .env" {
  printf "SERVER_PORT=9000\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value "SERVER_PORT" "5174")"
  [ "$result" = "9000" ]
}

@test "get_existing_env_value: returns default when key is absent" {
  printf "OTHER_KEY=foo\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value "SERVER_PORT" "5174")"
  [ "$result" = "5174" ]
}

@test "get_existing_env_value: returns default when .env file is missing" {
  rm -f "$INSTALL_DIR/.env"
  result="$(get_existing_env_value "SERVER_PORT" "5174")"
  [ "$result" = "5174" ]
}

@test "get_existing_env_value: returns last occurrence when key appears twice" {
  printf "SERVER_PORT=8000\nSERVER_PORT=9000\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value "SERVER_PORT" "5174")"
  [ "$result" = "9000" ]
}

@test "get_existing_env_value: handles values containing equals signs" {
  printf 'STORAGE_ENCRYPTION_KEY=abc=def==\n' > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value "STORAGE_ENCRYPTION_KEY" "")"
  [ "$result" = "abc=def==" ]
}

# ===========================================================================
# get_existing_env_value_with_fallback
# ===========================================================================

@test "get_existing_env_value_with_fallback: reads primary key" {
  printf "SERVER_PORT=9000\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "5174")"
  [ "$result" = "9000" ]
}

@test "get_existing_env_value_with_fallback: falls back to legacy key" {
  printf "PORT=8080\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "5174")"
  [ "$result" = "8080" ]
}

@test "get_existing_env_value_with_fallback: returns default when both keys absent" {
  printf "UNRELATED=foo\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "5174")"
  [ "$result" = "5174" ]
}

@test "get_existing_env_value_with_fallback: primary takes precedence over fallback" {
  printf "SERVER_PORT=9000\nPORT=8080\n" > "$INSTALL_DIR/.env"
  result="$(get_existing_env_value_with_fallback "SERVER_PORT" "PORT" "5174")"
  [ "$result" = "9000" ]
}

# ===========================================================================
# output_looks_password_related
# ===========================================================================

@test "output_looks_password_related: detects 'password'" {
  run output_looks_password_related "Enter password"
  [ "$status" -eq 0 ]
}

@test "output_looks_password_related: detects 'encrypted'" {
  run output_looks_password_related "File is encrypted"
  [ "$status" -eq 0 ]
}

@test "output_looks_password_related: detects 'incorrect password' (case-insensitive)" {
  run output_looks_password_related "Incorrect Password supplied"
  [ "$status" -eq 0 ]
}

@test "output_looks_password_related: detects 'skipping:'" {
  run output_looks_password_related "skipping: file.txt"
  [ "$status" -eq 0 ]
}

@test "output_looks_password_related: returns non-zero for unrelated text" {
  run output_looks_password_related "Extraction complete"
  [ "$status" -ne 0 ]
}

@test "output_looks_password_related: returns non-zero for empty string" {
  run output_looks_password_related ""
  [ "$status" -ne 0 ]
}

# ===========================================================================
# map_lego_arch
# ===========================================================================

@test "map_lego_arch: maps x86_64 to amd64" {
  # Stub uname to return x86_64
  uname() { printf "x86_64"; }
  export -f uname
  result="$(map_lego_arch)"
  [ "$result" = "amd64" ]
}

@test "map_lego_arch: maps aarch64 to arm64" {
  uname() { printf "aarch64"; }
  export -f uname
  result="$(map_lego_arch)"
  [ "$result" = "arm64" ]
}

@test "map_lego_arch: maps armv7l to armv7" {
  uname() { printf "armv7l"; }
  export -f uname
  result="$(map_lego_arch)"
  [ "$result" = "armv7" ]
}

@test "map_lego_arch: maps i386 to 386" {
  uname() { printf "i386"; }
  export -f uname
  result="$(map_lego_arch)"
  [ "$result" = "386" ]
}

@test "map_lego_arch: returns non-zero for unknown architecture" {
  uname() { printf "mips64"; }
  export -f uname
  run map_lego_arch
  [ "$status" -ne 0 ]
}

# ===========================================================================
# have_cmd
# ===========================================================================

@test "have_cmd: returns 0 for a command that exists (bash)" {
  run have_cmd bash
  [ "$status" -eq 0 ]
}

@test "have_cmd: returns non-zero for a command that does not exist" {
  run have_cmd totally_fake_command_xyz_123
  [ "$status" -ne 0 ]
}

# ===========================================================================
# ensure_local_postgres_setup & systemd env configuration
# ===========================================================================

@test "ensure_local_postgres_setup: returns 0 when DB_CLIENT is sqlite3" {
  DB_CLIENT="sqlite3"
  run ensure_local_postgres_setup
  [ "$status" -eq 0 ]
}

@test "ensure_local_postgres_setup: returns 0 when POSTGRES_HOST is remote" {
  DB_CLIENT="postgres"
  POSTGRES_HOST="remote.db.example.com"
  run ensure_local_postgres_setup
  [ "$status" -eq 0 ]
}

@test "ensure_local_postgres_setup: treats 0.0.0.0 as local PostgreSQL" {
  DB_CLIENT="postgres"
  POSTGRES_HOST="0.0.0.0"
  sudo() { return 0; }
  psql() { return 0; }
  export -f sudo psql
  run ensure_local_postgres_setup
  [ "$status" -eq 0 ]
}

@test "configure_systemd_service: writes EnvironmentFile to systemd unit" {
  INSTALL_DIR="$TEST_DIR"
  SERVICE_FILE="$TEST_DIR/songbird.service"
  NODE_EXEC_PATH="/usr/bin/node"
  SERVICE_USER="songbird"
  SERVICE_GROUP="songbird"
  run configure_systemd_service
  [ "$status" -eq 0 ]
  [ -f "$SERVICE_FILE" ]
  grep -q "EnvironmentFile=$TEST_DIR/\.env" "$SERVICE_FILE"
}
