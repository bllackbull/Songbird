[English](/README.md) | [فارسی](/README.fa_IR.md)

<div align="center">

# <img src="./client/public/songbird-logo.svg"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

</div>

**Songbird is a secure and lightweight self-hosted chat platform designed to empower digital freedom worldwide.**

This repository contains the Songbird chat application. The server uses a file-backed SQLite database via sql.js and the client is built with React + Vite. 

Songbird supports DMs, groups, channels, file uploads, voice messages, push notifications, and optional Remote Channels that mirror Telegram posts into Songbird channels.

## Repo layout

- `client/` — React/Vite frontend
- `server/` — Express API and `sql.js` database bootstrap
- `data/` — application data directory (created automatically at runtime; `songbird.db` will be stored here)

## Installation and Deployment

There are three ways available to install the app:
- [Easy to install Script](#deployment-script) (Recommended)
- [Docker](#install-via-docker)
- [Manual Installation](#manual-installation)

**Prerequisites (tested on Ubuntu 22.04+):**

- An Ubuntu server with sudo access
- A domain name pointing to your server's public IP (Recommended)

## Deployment Script

If you want to use the easy to install script, use:

```bash
curl -fsSL https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh | bash
```

Later access the script globally with:

```bash
songbird-deploy
```

## Install via Docker

### 1. System Setup

Install these packages:

```bash
sudo apt install -y ca-certificates gnupg lsb-release
```

Add Docker official GPG key:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

Add Docker apt repository:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker Engine + Compose plugin:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Optional: run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Optional: Verify Installation:

```bash
docker --version
docker compose version
docker run hello-world
```

### 2. Clone repository

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

Create a self-signed cert in `certs/` directory if running the app on SSL:

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

### 3. Build container

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build
```

Optional: Verify container is built successfully:

```bash
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f
```
> [!IMPORTANT]
> Docker automatically configures the nginx config to run on port 443 using the self-signed cert you previously generated.  
>To change and customize the nginx config, refer to the [Configure Nginx](#configure-nginx) section.

## Manual Installation

### 1. System setup

Update and install required packages:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

Install Node.js and npm (pick one):

**NodeSource (Recommended)**:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**nvm**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash
```

**Volta**:

```bash
curl https://get.volta.sh | bash
volta install node@24.11.1 npm@11.6.4
```

### 2. Clone repository

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

> [!NOTE]
> If you installed Node.js using nvm:
> 
> ```bash
> nvm install
> nvm use
> ```



### 3. Install dependencies

```bash
cd /opt/songbird/server
npm install

cd /opt/songbird/client
npm install
npm run build
```

### 4. Create systemd service

Create `/etc/systemd/system/songbird.service` with the following:

```ini
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/songbird/server
ExecStart=/usr/bin/env node /opt/songbird/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> [!IMPORTANT]
> - If you installed Node.js using nvm, set this as Node path in `ExectStart`:
>
>```ini
>ExecStart=/root/.nvm/versions/node/v24.11.1/bin/node index.js
>```
>
> - If you installed Node.js using volta, set this as Node path in `ExectStart`:
>
>```ini
>ExecStart=/root/.volta/bin/node index.js
>```
>

**Recommended: Create a dedicated user:**

> [!WARNING]
> Skip this step if you installed Node.js using nvm or volta.

Due to security conserns, it is recommended to create a dedicated system user and change ownership of the project directory:

1. Add these lines to systemd service file:

```ini
User=songbird
Group=songbird
```

2. Create a dedicated system user:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin songbird
```

3. Change ownership of the project directory:

```bash
sudo chown -R songbird:songbird /opt/songbird
git config --global --add safe.directory /opt/songbird
```

**Enable and start the service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird.service
```

## Configure Nginx

Songbird serves both the built frontend and the API from the Node server, so Nginx only needs to proxy one upstream: `http://127.0.0.1:SERVER_PORT`.

Create `/etc/nginx/sites-available/songbird`:

> [!IMPORTANT]
> - Keep `proxy_pass` aligned with `SERVER_PORT`.
> - Keep the Nginx `listen` port aligned with `CLIENT_PORT`.
> - Keep `client_max_body_size` aligned with `FILE_UPLOAD_MAX_TOTAL_SIZE_MB`.

### HTTP only

Use this if you are not enabling SSL yet:

```nginx
server {
  listen 80 default_server;
  server_name example.com www.example.com;
  client_max_body_size 75m;

  location /api/events {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
  }

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}
```

If you are using the server IP directly, replace `server_name example.com www.example.com;` with:

```nginx
server_name _;
```

### HTTPS

After you have certificate files, switch to this:

```nginx
server {
  listen 443 ssl default_server;
  server_name example.com www.example.com;
  client_max_body_size 75m;

  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;

  location /api/events {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
  }

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}

server {
  listen 80;
  server_name example.com www.example.com;
  return 301 https://$host$request_uri;
}
```

Enable the site:

```bash
sudo ln -sf /etc/nginx/sites-available/songbird /etc/nginx/sites-enabled/songbird
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## SSL certificates

HTTPS is recommended, especially if you want push notifications.

### Option A: Certbot for a domain

For domain-based installs, Certbot is the simplest option:

```bash
sudo certbot certonly --nginx --https-port 443 -d example.com -d www.example.com
sudo certbot install --nginx --https-port 443 --cert-name example.com -d example.com -d www.example.com
sudo certbot renew --dry-run
```

If you use a different HTTPS port, replace `443` with your `CLIENT_PORT`.

### Option B: Use existing certificate files

If you already have `fullchain.pem` and `privkey.pem`, point Nginx to them:

```nginx
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/privkey.pem;
```

This works for both domain and IP setups as long as your certificate covers what you are serving.

### Option C: Use the deploy script

[`songbird-deploy`](#deployment-script) can configure Nginx for you and also handle SSL setup. That is the easiest path if you do not want to manage the Nginx and certificate steps manually.

## Common troubleshooting

Docker logs: 

```bash
docker compose -f docker-compose.yaml logs -f
```

systemd service logs:

```bash
sudo journalctl -u songbird -f
```

Check Nginx error logs:

```bash
nano /var/log/nginx/error.log
```

If Docker build looks stuck at `RUN npm ci`, it is usually downloading dependencies. Use plain progress for visibility:

```bash
docker compose -f docker-compose.yaml build --no-cache --progress=plain
```

## Environment Variables Configuration

You can configure environment variables to customize app behavior.

```bash
cd /opt/songbird
cp .env.example .env
nano .env
```

### Configurable values:

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
| `REMOTE_CHANNEL_TELEGRAM_API_ID` | `integer` | `0` | Telegram API ID. |
| `REMOTE_CHANNEL_TELEGRAM_API_HASH` | `string` | `""` | Telegram API hash. |
| `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` | `string` | `""` | Telegram StringSession. Treat it like a password. |
| `REMOTE_CHANNEL_PROXY_URL` | `string` | `""` | Telegram MTProto proxy URL. |
| `REMOTE_CHANNEL_POLL_INTERVAL_MS` | `integer` | `5000` | How often the Telegram poller checks enabled Remote Channel sources. |
| `REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT` | `integer` | `50` | Max Telegram posts fetched per poll for each source (`1`-`100`). |
| `REMOTE_CHANNEL_QUEUE_INTERVAL_MS` | `integer` | `1000` | How often the mirror queue worker processes pending Telegram posts. |
| `REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS` | `integer` | `10` | Max retry attempts before a queued remote post is marked failed. |
| `REMOTE_CHANNEL_QUEUE_BATCH_SIZE` | `integer` | `10` | Max queued remote posts processed per worker tick (`1`-`50`). |
| `REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS` | `integer` | `300000` | Age after which an in-progress queue lock is considered stale and can be retried. |
| `CHAT_PENDING_TEXT_TIMEOUT` | `integer` | `300000` | Mark pending text message as failed after this timeout (milliseconds). |
| `CHAT_PENDING_FILE_TIMEOUT` | `integer` | `1200000` | Mark pending file message as failed / XHR timeout for uploads (milliseconds). |
| `CHAT_PENDING_RETRY_INTERVAL` | `integer` | `4000` | Retry cadence for pending sends while connected (milliseconds). |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL` | `integer` | `1000` | How often pending messages are checked for timeout (milliseconds). |
| `CHAT_CACHE_TTL` | `integer` | `24` | Local cache time-to-live for chat lists and message caches (hours). |
| `CHAT_MESSAGE_FETCH_LIMIT` | `integer` | `300` | Max messages requested per chat fetch (initial/latest window). |
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

> [!NOTE]
> **Push notifications require HTTPS** (except `localhost` for development). iOS requires an installed PWA (iOS 16.4+).

> [!IMPORTANT]
> **Encryption at rest:** Songbird auto-generates `STORAGE_ENCRYPTION_KEY` on first run and saves it into `.env`. Keep that value stable. On startup, the server backfills existing stored messages, message-upload files, and avatar files into encrypted form when needed.

### Apply Changes:

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

> [!TIP]
> You can easily edit your .env file via [songbird-deploy](#deployment-script) script and it would automatically apply and rebuild the app for you!


## Remote Channel Setup

Remote Channel lets a public Songbird channel mirror posts from a Telegram channel. The server polls Telegram, queues new posts, creates Songbird messages as the channel owner, and keeps retry state in the database. Only channel owners can configure a channel source.

On first enable, Songbird initializes the source at the latest Telegram post and does not import channel history. Posts published after that point are mirrored.

### 1. Create Telegram credentials

Create a [Telegram app](https://my.telegram.org/apps) so you have an API ID and API hash ready. If your server needs a proxy to reach Telegram, have that URL ready too. Supported schemes are `http://`, `https://`, `socks4://`, `socks5://`, and `mtproxy://`.

> [!WARNING]
> I strongly suggest to not use your main personal Telegram account for this.

### 2. Configure Remote Channel

Run the configuration helper and follow the prompts. It asks for the Telegram API ID, API hash, optional proxy URL, and Telegram login code, then writes the Remote Channel settings into `.env`. For systemd installs, it restarts `songbird.service` after saving.

```bash
cd /opt/songbird
npm run remote:configure
```

For Docker:

```bash
cd /opt/songbird
touch .env
docker compose run --rm -v "$PWD/.env:/app/.env" songbird npm --prefix /app/server run remote:configure
```

Keep the generated session value private. It authorizes Songbird to read Telegram channels that the logged-in Telegram account can access.

### 3. Connect a Songbird channel

In Songbird, create or edit a **public channel**, enable **Remote Channel**, choose **Telegram**, and enter a source such as `@channelname` or `https://t.me/channelname`. Remote Channel is locked for private channels.

Optional channel settings:

- **Sync Channel Metadata** copies the Telegram channel title/avatar into the Songbird channel.
- **Stream Media Files** downloads Telegram media into Songbird uploads when `FILE_UPLOAD=true`. It follows the upload size/count limits, file retention, encryption-at-rest, and video transcoding settings. Text-only mirrored posts follow `MESSAGE_TEXT_RETENTION`.
- Posts with no text/caption are mirrored only when media streaming is enabled and at least one supported media file can be stored.

## Updating the deployed app

> [!WARNING]
>Backup your database before updating:
>
> ```bash
> cd /opt/songbird/server
> npm run db:backup
> # Or use this for Docker:
> docker compose exec songbird npm --prefix /app/server run db:backup
> ```
>

> [!TIP]
> You can easily update your app via [songbird-deploy](#deployment-script) script and it would automatically backup your database and rebuild the app for you!

### Docker + Compose

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

### Manual (systemd)

```bash
cd /opt/songbird
git pull origin main
cd client
npm install
npm run build
cd ../server
npm install
sudo systemctl restart songbird
sudo systemctl reload nginx
```

> [!NOTE]
For zero-downtime deployments on larger projects, consider blue-green deployment or PM2, but for most updates the restart approach above is simple and sufficient.

## Database commands

You can use these commands while in `/opt/songbird/server` directory to manage your database:

> [!TIP]
> You can easily use database commands via [songbird-deploy](#deployment-script) script!

- Backup DB: `npm run db:backup`
- Restore DB backup: `npm run db:restore`
- Vacuum DB: `npm run db:vacuum`
- DB command guide: `npm run db:help`
- Run migrations: `npm run db:migrate`
- Reset DB: `npm run db:reset`
- Delete DB: `npm run db:delete`
- Create a group or channel: `npm run db:chat:create`
- Add users to a group/channel: `npm run db:chat:add`
- Edit a group/channel profile or transfer ownership: `npm run db:chat:edit`
- Delete chats (all or selected ids/usernames): `npm run db:chat:delete` (requires `--all` to delete everything)
- Delete files (all or selected ids/filenames): `npm run db:file:delete` (requires `--all` to delete everything)
- Edit a user profile: `npm run db:user:edit`
- Toggle user ban/unban: `npm run db:user:ban`
- Delete users (all or selected ids/usernames): `npm run db:user:delete` (requires `--all` to delete everything)
- Create one user: `npm run db:user:create`
- Generate random users: `npm run db:user:generate`
- Generate random chat messages for a chat between two users: `npm run db:message:generate`
- Inspect all summary: `npm run db:inspect`
- Inspect chats only: `npm run db:chat:inspect`
- Inspect users only: `npm run db:user:inspect`
- Inspect files only: `npm run db:file:inspect`
- Backup location: `data/backups/`

### Safety confirmation and `-y`

Destructive commands ask for safety confirmation by default.

- Interactive mode: type `y/yes` or `n/no`.
- Non-interactive mode: pass force flag.
- Supported force flags: `-y` and `--yes`.

Examples:

```bash
cd server
npm run db:help
npm run db:backup
npm run db:restore -- -y
npm run db:vacuum -- -y
npm run db:reset -y
npm run db:delete --yes
npm run db:chat:delete 12 -y
npm run db:chat:delete -- --all -y
npm run db:file:delete -- --all -y
npm run db:file:delete 42 -y
npm run db:file:delete FILE_NAME -y
npm run db:user:delete songbird.sage -y
npm run db:user:delete -- --all -y
```

### Admin script usage examples

Create a user:

```bash
cd server
npm run db:user:create -- --nickname "Songbird Sage" --username songbird.sage --password "12345678"

# positional alternative:
npm run db:user:create -- "Songbird Sage" songbird.sage "12345678"
```

Generate random users:

```bash
cd server
# npm may warn about unknown cli config if you omit "--".
# This works reliably:
npm run db:user:generate -- --count=50 --password="12345678"

# (legacy form still supported if npm allows it):
npm run db:user:generate -- --count 50 --password "12345678"
```

Create a group or channel:

```bash
cd server
npm run db:chat:create -- --type group --name "Core Team" --owner songbird.sage --username core.team --visibility private --users songbird.sage2,songbird.sage3

npm run db:chat:create -- --type channel --name "Announcements" --owner songbird.sage --username announcements
```

Add users to a group or channel:

```bash
cd server
npm run db:chat:add -- core.team songbird.sage2 songbird.sage3

# You can also use chat Id:
npm run db:chat:add -- 1 --all
```

Edit a group or channel profile:

```bash
cd server
npm run db:chat:edit -- core.team --name "Core Team HQ" --visibility public --color "#14b8a6"

# You can also use chat Id:
npm run db:chat:edit -- 1 --owner songbird.sage2
```

Edit a user profile:

```bash
cd server
npm run db:user:edit -- songbird.sage --nickname "Songbird Sage" --color "#ff6b6b"

# You can also use user Id:
npm run db:user:edit -- 1 --username songbird.admin --status invisible
```

Ban or unban a user:

```bash
cd server
npm run db:user:ban -- songbird.sage

# Running it again toggles the state back:
npm run db:user:ban -- songbird.sage
```

Restore a backup:

```bash
cd server
npm run db:restore -- -y
```

Backup format:

```text
songbird-backup-YYYY-MM-DDTHH-MM-SS-sssZ.zip
|- .env
`- data/
   |- songbird.db
   `- uploads/
```

Generate random messages in one chat between two users:

```bash
cd server
npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7

# You can also use user Id:
npm run db:message:generate -- 1 2 5 300 7

# named-arg alternative:
npm run db:message:generate -- --chatId 1 --userA songbird.sage --userB songbird.sage2 --count 300 --days 7
```

Inspect database summary:

```bash
cd server
npm run db:inspect
npm run db:inspect -- 50
npm run db:chat:inspect
npm run db:user:inspect
npm run db:file:inspect
```

### Use commands via Docker

Use npm scripts inside the runnig container:

```bash
docker compose exec songbird npm --prefix /app/server run db:backup
docker compose exec songbird npm --prefix /app/server run db:migrate
docker compose exec songbird npm --prefix /app/server run db:inspect
```

## Running behind a domain + subpath

If you plan to host the app at a subpath (e.g., `example.com/songbird/`) you will need to adjust Nginx configuration and set `base` in `client/index.html` or Vite build options accordingly.

## Author

- Maintainer: [@bllackbull](https://github.com/bllackbull)
- Contributors: [@nkhalili](https://github.com/nkhalili)

## Contributing

- Contributions are welcome.
- If you want to contribute, contact the maintainer first by opening an issue at: `https://github.com/bllackbull/Songbird/issues`
- For direct coordination, reach out to [@bllackbull](https://github.com/bllackbull) on GitHub before opening a PR.
- Checkout [Contributing](/CONTRIBUTING.md) guideline for more information.

## Support

If you like this project which I hope you do, consider supporting your favorite project:

<a href="https://nowpayments.io/donation?api_key=0b61dd3e-6508-4849-ad92-1dde65442937" target="_blank" rel="noreferrer noopener">
    <img src="https://nowpayments.io/images/embeds/donation-button-black.svg" alt="Crypto donation button by NOWPayments">
</a>

### TRX:

```
TPf1bEhipKpGkjo5N2Scj9nufNNh5TNrwX
```

### USDT (TRC20):

```
0x63313383611BbE11f4fEc139c14ad0b70281b822
```

### BTC:

```
bc1q9hupvcc39juhf0k7rgzn6phn8s8jez365kzmuj
```

### TON:

```
UQDzQ3xbWzKQvw8X8sWU82dksBeYqTHrT9sLzhBOyaESPjVy
```

## License

This project is licensed under the MIT License. See the see [LICENSE](LICENSE) file for details.
