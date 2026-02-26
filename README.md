<div align="center">

# <img src="./client/public/songbird-logo.svg"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

</div>

**Songbird is a secure and lightweight self-hosted chat platform designed to empower digital freedom worldwide.**

This repository contains the Songbird chat application. The server uses a file-backed SQLite database via sql.js and the client is built with React + Vite.

## Repo layout

- `client/` — React/Vite frontend
- `server/` — Express API and `sql.js` database bootstrap
- `data/` — application data directory (created automatically at runtime; `songbird.db` will be stored here)

## Installation and Deployment

Docker support is included and is a good default for most deployments because it standardizes runtime dependencies and process restarts.

If you use Docker/Compose, you do not need a `systemd` unit for the Songbird Node process. The container runtime handles process lifecycle (`restart: unless-stopped` in Compose). You can still use `systemd` for non-Docker deployments.

**Prerequisites (tested on Ubuntu 22.04+):**

- A domain name pointing to your server's public IP
- An Ubuntu server with sudo access

Update and install required packages:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

## Option A: Docker + Compose (recommended)

### 1. System Setup

Install these packages:

```bash
sudo apt install -y ca-certificates gnupg
```

Add Docker official GPG key:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

Add Docker apt repository:

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
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

### 2. Clone repository

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

### 3. Start

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f
```

## Option B: Manual Installation

### 1. System setup

Install Node.js and npm (pick one):

**NodeSource**:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**nvm**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash
cd /opt/songbird
nvm install
nvm use
```

**Volta**:

```bash
curl https://get.volta.sh | bash
cd /opt/songbird
```

Volta will auto-install the versions when you enter the project. If you want to manually install the same versions globally, you can do:

```bash
volta install node@24.11.1 npm@11.6.4
```

### 2. Clone repository

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

### 3. Install dependencies

```bash
cd /opt/songbird/server
npm install

cd /opt/songbird/client
npm install
npm run build
```

### 4. Create systemd service for the Node server

Create `/etc/systemd/system/songbird.service` with the following:

```ini
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/songbird/server
ExecStart=/usr/bin/node index.js
User=songbird
Group=songbird
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Create a dedicated system user and change ownership of the project directory:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin songbird
sudo chown -R songbird:songbird /opt/songbird
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird.service
```

## Configure Nginx

### 1. Configure Nginx file

Create an Nginx site file at `/etc/nginx/sites-available/songbird`:

```nginx
server {
  listen 80;
  server_name example.com www.example.com;

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

> **NOTE:**
> If you set `PORT` to a different value, update `proxy_pass` accordingly.

Enable the site and test Nginx config:

```bash
sudo ln -s /etc/nginx/sites-available/songbird /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2. Obtain SSL certificate via Certbot

```bash
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot renew --dry-run
```

### 3. Firewall (optional)

```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Common troubleshooting

- Docker logs: `docker compose -f docker-compose.yaml logs -f`
- systemd service logs: `sudo journalctl -u songbird -f`
- Check Nginx error logs: `/var/log/nginx/error.log`

## Environment Variables Configuration

You can configure environment variables to customize app behavior.

```bash
cd /opt/songbird
nano .env
```

### Configurable values:

| Variable | Type | Default | Description |
|---|---|---:|---|
| `PORT` | `integer` | `5174` | API server port. Use the same value in Nginx `proxy_pass`. |
| `APP_ENV` | `string` | `production` | Server runtime mode (`production` recommended/default). |
| `APP_DEBUG` | `boolean` | `false` | Enable verbose server debug logs in terminal/stdout (`[app-debug]` lines for message send/upload/transcode/metadata events). |
| `FILE_UPLOAD` | `boolean` | `true` | Enable/disable all uploads globally (chat files + avatars). |
| `FILE_UPLOAD_MAX_SIZE` | `integer` | `26214400` | Per-file upload max size (bytes). |
| `FILE_UPLOAD_MAX_TOTAL_SIZE` | `integer` | `78643200` | Per-message total upload size cap (bytes). |
| `FILE_UPLOAD_MAX_FILES` | `integer` | `10` | Max uploaded files in one message. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `boolean` | `true` | Convert uploaded videos to H.264/AAC MP4 and keep only the converted file. Requires `ffmpeg`. |
| `MESSAGE_FILE_RETENTION` | `integer` | `7` | Auto-delete uploaded message files after N days (`0` disables). |
| `CHAT_PENDING_TEXT_TIMEOUT` | `integer` | `300000` | Mark pending text message as failed after this timeout (milliseconds). |
| `CHAT_PENDING_FILE_TIMEOUT` | `integer` | `1200000` | Mark pending file message as failed / XHR timeout for uploads (milliseconds). |
| `CHAT_PENDING_RETRY_INTERVAL` | `integer` | `4000` | Retry cadence for pending sends while connected (milliseconds). |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL` | `integer` | `1000` | How often pending messages are checked for timeout (milliseconds). |
| `CHAT_MESSAGE_FETCH_LIMIT` | `integer` | `300` | Max messages requested per chat fetch (initial/latest window). |
| `CHAT_MESSAGE_PAGE_SIZE` | `integer` | `60` | Page size for loading older messages when scrolling to top. |
| `CHAT_LIST_REFRESH_INTERVAL` | `integer` | `20000` | Chats list background refresh interval (milliseconds). |
| `CHAT_PRESENCE_PING_INTERVAL` | `integer` | `5000` | Presence heartbeat interval (milliseconds). |
| `CHAT_PEER_PRESENCE_POLL_INTERVAL` | `integer` | `3000` | Active peer presence poll interval (milliseconds). |
| `CHAT_HEALTH_CHECK_INTERVAL` | `integer` | `10000` | Connection health check interval (milliseconds). |
| `CHAT_SSE_RECONNECT_DELAY` | `integer` | `2000` | Delay before reconnecting SSE after error (milliseconds). |
| `CHAT_SEARCH_MAX_RESULTS` | `integer` | `5` | Max users shown in New Chat search results. |

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

## Updating the deployed app

> **Tip:** <br>
>Backup your database before updating:
> ```bash
> cd /opt/songbird/server
> npm run db:backup
> ```
> The backup file will be saved under `/data/backups` directory.


### Docker + Compose

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
docker compose -f docker-compose.yaml logs -f --tail=100
cd ./server
npm run db:migrate
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
npm run db:migrate
sudo systemctl restart songbird
sudo systemctl reload nginx
```

**What each step does:**

- git pull - Fetch and merge latest changes from GitHub
- npm install (client & server) - Install any new dependencies
- npm run build - Rebuild the React frontend into client/dist
- npm run db:migrate - Apply versioned schema migrations without dropping data
- systemctl restart songbird - Restart the Node server to pick up changes
- systemctl reload nginx - Reload Nginx to serve the new build

If only the frontend code has changed (no `package.json` changes), you can skip the `npm install` steps.

> **Note:** <br>
For zero-downtime deployments on larger projects, consider blue-green deployment or PM2, but for most updates the restart approach above is simple and sufficient.

## Database commands

- Backup DB: `npm run db:backup`
- Run migrations: `npm run db:migrate`
- Reset DB: `npm run db:reset`
- Delete DB: `npm run db:delete`
- Delete chats (all or selected ids): `npm run db:chat:delete`
- Delete files (all or selected ids/filenames): `npm run db:file:delete`
- Delete users (all or selected ids/usernames): `npm run db:user:delete`
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
npm run db:reset -y
npm run db:delete --yes
npm run db:chat:delete 12 -y
npm run db:file:delete -y
npm run db:file:delete 42 -y
npm run db:file:delete FILE_NAME -y
npm run db:user:delete songbird.sage -y
```

DB admin scripts now support both modes:
- If server is running on `127.0.0.1:5174`, scripts execute through server admin API.
- If server is not running, scripts operate directly on the DB file.

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
npm run db:user:generate -- --count 50 --password "12345678"
```

Generate random messages in one chat between two users:

```bash
cd server
npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7
# users can also be ids:
npm run db:message:generate -- 1 2 5 300 7
# named-arg alternative (avoid --user-a/--user-b because npm may rewrite them):
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

Recommended production flow:

1. Backup DB
2. Pull latest code
3. Install dependencies
4. Build frontend
5. Run migrations (manual/systemd flow); Docker runs migrations automatically on startup
6. Restart services

## Running behind a domain + subpath

If you plan to host the app at a subpath (e.g., `example.com/songbird/`) you will need to adjust Nginx configuration and set `base` in `client/index.html` or Vite build options accordingly.

## Author

- Maintainer: @bllackbull

## Contributing

- Contributions are welcome.
- If you want to contribute, contact the maintainer first by opening an issue at: `https://github.com/bllackbull/Songbird/issues`
- For direct coordination, reach out to @bllackbull on GitHub before opening a PR.

## License

This project is licensed under the MIT License. See the see [LICENSE](LICENSE) file for details.
