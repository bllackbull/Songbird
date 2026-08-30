#!/bin/sh
set -e

WORKER_PORT="${WORKER_PORT:-8080}"
MEDIA_WORKER_URL="${MEDIA_WORKER_URL:-http://127.0.0.1:${WORKER_PORT}}"
START_LOCAL_WORKER="${START_LOCAL_WORKER:-auto}"

should_start_local_worker() {
  if [ "$START_LOCAL_WORKER" = "true" ]; then
    return 0
  fi
  if [ "$START_LOCAL_WORKER" = "false" ]; then
    return 1
  fi
  case "$MEDIA_WORKER_URL" in
    *127.0.0.1*|*localhost*|"")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if should_start_local_worker; then
  echo "[entrypoint] Starting local Songbird Media Worker on port ${WORKER_PORT}..."
  WORKER_PORT="${WORKER_PORT}" DATA_DIR="${DATA_DIR:-/app/data}" node /app/worker/index.js &
fi

exec "$@"
