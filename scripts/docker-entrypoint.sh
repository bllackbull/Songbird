#!/bin/sh
set -e

WORKER_PORT="${WORKER_PORT:-8080}"
STORAGE_PROCESSING_MODE="${STORAGE_PROCESSING_MODE:-auto}"
START_LOCAL_WORKER="${START_LOCAL_WORKER:-auto}"
FILE_UPLOAD_TRANSCODE_VIDEOS="${FILE_UPLOAD_TRANSCODE_VIDEOS:-true}"
WORKER_URL="${WORKER_URL:-${MEDIA_WORKER_URL:-}}"

should_start_local_worker() {
  if [ "$START_LOCAL_WORKER" = "false" ]; then
    return 1
  fi
  if [ "$START_LOCAL_WORKER" = "true" ]; then
    return 0
  fi
  if [ "$FILE_UPLOAD_TRANSCODE_VIDEOS" = "false" ] || [ "$FILE_UPLOAD_TRANSCODE_VIDEOS" = "0" ] || [ "$FILE_UPLOAD_TRANSCODE_VIDEOS" = "no" ] || [ "$FILE_UPLOAD_TRANSCODE_VIDEOS" = "off" ]; then
    return 1
  fi
  if [ "$STORAGE_PROCESSING_MODE" = "remote" ]; then
    return 1
  fi
  if [ "$STORAGE_PROCESSING_MODE" = "local" ] || [ "$STORAGE_PROCESSING_MODE" = "auto" ]; then
    return 0
  fi
  case "$WORKER_URL" in
    *127.0.0.1*|*localhost*)
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
