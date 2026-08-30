#!/usr/bin/env bats

ENTRYPOINT_SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/docker-entrypoint.sh"

setup() {
  TEST_DIR="$(mktemp -d)"
  mkdir -p "$TEST_DIR/bin"
  cat << 'EOF' > "$TEST_DIR/bin/node"
#!/bin/sh
echo "node_started: $@"
EOF
  chmod +x "$TEST_DIR/bin/node"
}

teardown() {
  rm -rf "$TEST_DIR"
}

@test "docker-entrypoint starts local worker when STORAGE_PROCESSING_MODE is 'auto'" {
  export PATH="$TEST_DIR/bin:$PATH"
  export STORAGE_PROCESSING_MODE=auto
  export WORKER_PORT=9090
  export START_LOCAL_WORKER=auto

  run "$ENTRYPOINT_SCRIPT" echo "app_started"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Starting local Songbird Media Worker on port 9090" ]]
  [[ "$output" =~ "app_started" ]]
}

@test "docker-entrypoint starts local worker when STORAGE_PROCESSING_MODE is 'local'" {
  export PATH="$TEST_DIR/bin:$PATH"
  export STORAGE_PROCESSING_MODE=local
  export WORKER_PORT=9090
  export START_LOCAL_WORKER=auto

  run "$ENTRYPOINT_SCRIPT" echo "app_started"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Starting local Songbird Media Worker on port 9090" ]]
  [[ "$output" =~ "app_started" ]]
}

@test "docker-entrypoint does NOT start local worker when STORAGE_PROCESSING_MODE is 'remote'" {
  export PATH="$TEST_DIR/bin:$PATH"
  export STORAGE_PROCESSING_MODE=remote
  export WORKER_PORT=9090
  export START_LOCAL_WORKER=auto

  run "$ENTRYPOINT_SCRIPT" echo "app_started"
  [ "$status" -eq 0 ]
  [[ ! "$output" =~ "Starting local Songbird Media Worker" ]]
  [[ "$output" =~ "app_started" ]]
}

@test "docker-entrypoint starts local worker by default when STORAGE_PROCESSING_MODE is unset" {
  export PATH="$TEST_DIR/bin:$PATH"
  unset STORAGE_PROCESSING_MODE
  export WORKER_PORT=8080
  export START_LOCAL_WORKER=auto

  run "$ENTRYPOINT_SCRIPT" echo "app_started"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Starting local Songbird Media Worker on port 8080" ]]
  [[ "$output" =~ "app_started" ]]
}

@test "docker-entrypoint respects START_LOCAL_WORKER=false even when STORAGE_PROCESSING_MODE is 'local'" {
  export PATH="$TEST_DIR/bin:$PATH"
  export STORAGE_PROCESSING_MODE=local
  export START_LOCAL_WORKER=false

  run "$ENTRYPOINT_SCRIPT" echo "app_started"
  [ "$status" -eq 0 ]
  [[ ! "$output" =~ "Starting local Songbird Media Worker" ]]
  [[ "$output" =~ "app_started" ]]
}
