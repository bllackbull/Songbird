# Environment Variables

:::tip

You can easily edit your .env file via the [Deployment Script](./Deployment-Script.md) and it would automatically apply and rebuild the app for you!

:::

You can configure environment variables to customize app behavior.

```bash
cd /opt/songbird
cp .env.example .env
nano .env
```

## Configurable values

| Variable | Type | Default | Description |
|---|---|---:|---|
| `SERVER_PORT` | `integer` | `5174` | API server port. (`PORT` is supported as a legacy fallback.) |
| `CLIENT_PORT` | `integer` | `80` | Nginx listen port (what users connect to). |
| `APP_ENV` | `string` | `production` | Server runtime mode (`production` recommended/default). |
| `APP_DEBUG` | `boolean` | `false` | Enable verbose server debug logs in terminal/stdout (`[app-debug]` lines for message send/upload/transcode/metadata events). |
| `SIGN_UP` | `boolean` | `true` | Allow new accounts to be created via the website (`/signup`). (`ACCOUNT_CREATION` is supported as a legacy fallback.) |
| `FILE_UPLOAD` | `boolean` | `true` | Enable/disable all uploads globally (chat files + avatars). |
| `FILE_UPLOAD_MAX_SIZE_MB` | `integer` | `25` | Per-file upload max size (MB). (`FILE_UPLOAD_MAX_SIZE` is supported as a legacy fallback in bytes.) |
| `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` | `integer` | `75` | Per-message total upload size cap (MB). (`FILE_UPLOAD_MAX_TOTAL_SIZE` is supported as a legacy fallback in bytes.) |
| `FILE_UPLOAD_MAX_FILES` | `integer` | `10` | Max uploaded files in one message. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `boolean` | `true` | Convert uploaded videos to H.264/AAC MP4 and keep only the converted file. Requires `ffmpeg`. |
| `MESSAGE_FILE_RETENTION` | `integer` | `7` | Auto-delete uploaded message files after N days (`0` disables). |
| `MESSAGE_TEXT_RETENTION` | `integer` | `0` | Auto-delete text-only messages after N days (`0` disables). |
| `MESSAGE_MAX_CHARS` | `integer` | `4000` | Max message length. |
| `REMOTE_CHANNEL` | `boolean` | `false` | Enable the server-side Remote Channel worker. |
| `REMOTE_CHANNEL_UI` | `boolean` | `true` | Allow channel owners to enable Remote Channel in the UI. When `false`, the Remote Channel toggle is disabled and locked for all channels, and existing channels with it enabled will see it turn off automatically in the UI. |
| `REMOTE_CHANNEL_MEDIA_STREAM` | `boolean` | `true` | Allow channel owners to enable the "Stream Media Files" option in the UI. When `false`, the option is disabled and locked for all channels. |
| `REMOTE_CHANNEL_TELEGRAM_API_ID` | `integer` | `0` | Telegram API ID. |
| `REMOTE_CHANNEL_TELEGRAM_API_HASH` | `string` | `""` | Telegram API hash. |
| `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` | `string` | `""` | Telegram StringSession. Treat it like a password. |
| `REMOTE_CHANNEL_TELEGRAM_PROXY_URL` | `string` | `""` | Telegram MTProto proxy URL. (`REMOTE_CHANNEL_PROXY_URL` is supported as a legacy fallback.) |
| `REMOTE_CHANNEL_SONGBIRD_PROXY_URL` | `string` | `""` | HTTP/HTTPS proxy for outbound requests from this server to remote Songbird servers. |
| `REMOTE_CHANNEL_POLL_INTERVAL_MS` | `integer` | `5000` | How often the poller checks enabled Remote Channel sources. |
| `REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT` | `integer` | `50` | Max Telegram posts fetched per poll for each source (`1`-`100`). |
| `REMOTE_CHANNEL_QUEUE_INTERVAL_MS` | `integer` | `1000` | How often the mirror queue worker processes pending remote posts. |
| `REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS` | `integer` | `10` | Max retry attempts before a queued remote post is marked failed. |
| `REMOTE_CHANNEL_QUEUE_BATCH_SIZE` | `integer` | `10` | Max queued remote posts processed per worker tick (`1`-`50`). |
| `REMOTE_CHANNEL_QUEUE_CONCURRENCY` | `integer` | `3` | How many queued items are processed concurrently per worker tick. Also controls how many sources are polled in parallel. |
| `REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS` | `integer` | `300000` | Age after which an in-progress queue lock is considered stale and can be retried. |
| `CHAT_PENDING_TEXT_TIMEOUT` | `integer` | `300000` | Mark pending text message as failed after this timeout (milliseconds). |
| `CHAT_PENDING_FILE_TIMEOUT` | `integer` | `1200000` | Mark pending file message as failed / XHR timeout for uploads (milliseconds). |
| `CHAT_PENDING_RETRY_INTERVAL` | `integer` | `4000` | Retry cadence for pending sends while connected (milliseconds). |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL` | `integer` | `1000` | How often pending messages are checked for timeout (milliseconds). |
| `CHAT_CACHE_TTL` | `integer` | `24` | Local cache time-to-live for chat lists and message caches (hours). |
| `CHAT_MESSAGE_FETCH_LIMIT` | `integer` | `60` | Max messages requested per chat fetch (initial/latest window). |
| `CHAT_MESSAGE_PAGE_SIZE` | `integer` | `60` | Page size for loading older messages when scrolling to top. |
| `CHAT_LIST_REFRESH_INTERVAL` | `integer` | `20000` | Chats list background refresh interval (milliseconds). |
| `CHAT_PRESENCE_PING_INTERVAL` | `integer` | `5000` | Presence heartbeat interval (milliseconds). |
| `CHAT_PEER_PRESENCE_POLL_INTERVAL` | `integer` | `3000` | Active peer presence poll interval (milliseconds). |
| `CHAT_HEALTH_CHECK_INTERVAL` | `integer` | `10000` | Connection health check interval (milliseconds). |
| `CHAT_SSE_RECONNECT_DELAY` | `integer` | `2000` | Delay before reconnecting SSE after error (milliseconds). |
| `CHAT_SEARCH_MAX_RESULTS` | `integer` | `5` | Max users shown in search results. |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_MB` | `integer` | `5` | Max audio file size (MB) allowed for client-side waveform decode. (`CHAT_VOICE_WAVEFORM_MAX_DECODE_BYTES` is supported as a legacy fallback in bytes.) |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS` | `integer` | `480` | Max audio duration (seconds) allowed for client-side waveform decode. |
| `NICKNAME_MAX_CHARS` | `integer` | `24` | Max nickname length for users and groups. (`NICKNAME_MAX` is supported as a legacy fallback.) |
| `USERNAME_MAX_CHARS` | `integer` | `16` | Max username length for users and groups. (`USERNAME_MAX` is supported as a legacy fallback.) |
| `STORAGE_ENCRYPTION_KEY` | `string` | auto-generated | Persistent encryption-at-rest key. Changing this value without first decrypting old data will make previously encrypted content unreadable. |
| `VAPID_PUBLIC_KEY` | `string` | auto-generated | Web Push public key (required for push notifications). |
| `VAPID_PRIVATE_KEY` | `string` | auto-generated | Web Push private key (required for push notifications). |
| `VAPID_SUBJECT` | `string` | auto-generated | Contact for VAPID (email or URL). Used by push providers. |
| `PUSH_PROXY_URL` | `string` | `""` | Proxy URL for push notification delivery. Use when your server cannot directly reach push service endpoints. |

:::info

**Push notifications require HTTPS** (except `localhost` for development). iOS requires an installed PWA (iOS 16.4+).

:::

:::info

**Encryption at rest:** Songbird auto-generates `STORAGE_ENCRYPTION_KEY` on first run and saves it into `.env`. Keep that value stable. On startup, the server backfills existing stored messages, message-upload files, and avatar files into encrypted form when needed.

:::

## Apply Changes

**1. Docker deployment:**

```bash
cd /opt/songbird
# Apply updated runtime env vars from .env
docker compose -f docker-compose.yaml up -d --force-recreate songbird
```

If your change affects build-time client values, rebuild the image too:

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build --force-recreate songbird
```

**2. Manual (systemd) deployment:**

Rebuild client:

```bash
cd /opt/songbird/client
npm run build
```

Restart systemd service:

```bash
sudo systemctl restart songbird
```

**3. Reload Nginx:**

```bash
sudo systemctl reload nginx
```
