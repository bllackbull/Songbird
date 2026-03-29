const readEnvNumber = (key, fallback, options = {}) => {
  const keys = Array.isArray(key) ? key : [key];
  const raw = keys
    .map((name) => import.meta.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && integer < options.min) return fallback;
  if (options.max !== undefined && integer > options.max) return fallback;
  return integer;
};

const readEnvBool = (key, fallback) => {
  const raw = import.meta.env[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

export const CHAT_PAGE_CONFIG = {
  pendingTextTimeoutMs: readEnvNumber("CHAT_PENDING_TEXT_TIMEOUT", 5 * 60 * 1000, {
    integer: true,
    min: 1000,
  }),
  pendingFileTimeoutMs: readEnvNumber("CHAT_PENDING_FILE_TIMEOUT", 20 * 60 * 1000, {
    integer: true,
    min: 1000,
  }),
  pendingRetryIntervalMs: readEnvNumber("CHAT_PENDING_RETRY_INTERVAL", 4000, {
    integer: true,
    min: 250,
  }),
  pendingStatusCheckIntervalMs: readEnvNumber("CHAT_PENDING_STATUS_CHECK_INTERVAL", 1000, {
    integer: true,
    min: 250,
  }),
  messageFetchLimit: readEnvNumber("CHAT_MESSAGE_FETCH_LIMIT", 300, {
    integer: true,
    min: 1,
  }),
  messagePageSize: readEnvNumber("CHAT_MESSAGE_PAGE_SIZE", 60, {
    integer: true,
    min: 10,
    max: 500,
  }),
  maxFilesPerMessage: readEnvNumber("FILE_UPLOAD_MAX_FILES", 10, {
    integer: true,
    min: 1,
  }),
  maxFileSizeBytes: readEnvNumber("FILE_UPLOAD_MAX_SIZE", 25 * 1024 * 1024, {
    integer: true,
    min: 1024,
  }),
  maxTotalUploadBytes: readEnvNumber("FILE_UPLOAD_MAX_TOTAL_SIZE", 75 * 1024 * 1024, {
    integer: true,
    min: 1024,
  }),
  chatsRefreshIntervalMs: readEnvNumber("CHAT_LIST_REFRESH_INTERVAL", 20000, {
    integer: true,
    min: 1000,
  }),
  presencePingIntervalMs: readEnvNumber("CHAT_PRESENCE_PING_INTERVAL", 5000, {
    integer: true,
    min: 1000,
  }),
  newChatSearchMaxResults: readEnvNumber("CHAT_SEARCH_MAX_RESULTS", 5, {
    integer: true,
    min: 1,
  }),
  healthCheckIntervalMs: readEnvNumber("CHAT_HEALTH_CHECK_INTERVAL", 10000, {
    integer: true,
    min: 1000,
  }),
  peerPresencePollIntervalMs: readEnvNumber("CHAT_PEER_PRESENCE_POLL_INTERVAL", 3000, {
    integer: true,
    min: 500,
  }),
  sseReconnectDelayMs: readEnvNumber("CHAT_SSE_RECONNECT_DELAY", 2000, {
    integer: true,
    min: 250,
  }),
  cacheTtlMs:
    readEnvNumber("CHAT_CACHE_TTL", 24, {
      integer: true,
      min: 1,
    }) *
    60 *
    60 *
    1000,
  fileUploadEnabled: readEnvBool("FILE_UPLOAD", true),
};
