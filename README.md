<div align="center">

# <img src="./client/public/songbird-logo.svg"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

</div>

**Lightweight self-hosted chat app (React + Vite frontend, Node/Express + sql.js backend)**

This repository contains the Songbird chat application. The server uses a file-backed SQLite database via sql.js and the client is built with React + Vite.

## Repo layout

- `client/` — React/Vite frontend
- `server/` — Express API and `sql.js` database bootstrap
- `data/` — application data directory (created automatically at runtime; `songbird.db` will be stored here)

## Deployment Guide

This guide walks through deploying Songbird to an Ubuntu server, serving the built frontend with Nginx, running the Node server as a systemd service, and provisioning TLS with Certbot.

**Prerequisites (tested on Ubuntu 22.04+):**

- A domain name pointing to your server's public IP
- An Ubuntu server with sudo access
- Node.js (v18+ recommended) and `npm`
- `nginx` and `certbot` (with `python3-certbot-nginx`)
- `git`

### 1. System setup

Update and install required packages:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx

# Install Node.js (example uses NodeSource for Node 24)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Clone repository

Choose a deployment directory (example: `/opt/songbird`):

```bash
sudo mkdir -p /opt/songbird
sudo chown $USER:$USER /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

**Important:** The `.` at the end clones the repository contents directly into `/opt/songbird` without creating a nested `Songbird/` directory. This keeps your paths clean.

### 3. Install dependencies and build the client

```bash
# Install server deps
cd /opt/songbird/server
npm install

# Install client deps and build static assets
cd ../client
npm install
npm run build
```

The build will produce a `client/dist` folder which will be served by Nginx.

### 4. Configure environment and app

- The server reads `PORT` (default 5174) and `NODE_ENV` (use `production`) from environment variables. The server sets the session cookie `Secure` flag when `NODE_ENV=production`.
- If you need to set environment variables for the app, you can create a systemd drop-in (see below) or an `.env` and a small wrapper script.

### 5. Create systemd service for the Node server

Create `/etc/systemd/system/songbird.service` with the following (use `sudo`):

```ini
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/songbird/server
Environment=NODE_ENV=production
Environment=PORT=5174
ExecStart=/usr/bin/node index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

> **Notes:**
> - Add `User=` if you prefer an specific user (e.g., create a dedicated `songbird` user for separation).
> - If you decided to create a dedicated user, make sure to create system user and change ownership:
> ```bash
> sudo useradd --system --no-create-home --shell /usr/sbin/nologin songbird
> sudo chown -R songbird:songbird /opt/songbird
> git config --global --add safe.directory /opt/songbird
> ```
> - If Node is installed somewhere else, update `ExecStart` accordingly (use full path to `node`).

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird.service
sudo journalctl -u songbird -f
```

### 6. Configure Nginx to serve the frontend and proxy API

Create an Nginx site file at `/etc/nginx/sites-available/songbird`:

```nginx
server {
  listen 80;
  server_name example.com www.example.com;

  root /opt/songbird/client/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }

  location /uploads/messages/ {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Enable the site and test Nginx config:

```bash
sudo ln -s /etc/nginx/sites-available/songbird /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Obtain SSL certificate via Certbot

Install Certbot plugin (already included in step 1 for `python3-certbot-nginx`) and run:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot will detect the Nginx configuration and can automatically update it to use HTTPS. Test auto-renewal:

```bash
sudo certbot renew --dry-run
```

### 8. Firewall (optional)

```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Common troubleshooting

- Check the Node server logs: `sudo journalctl -u songbird -f`
- Check Nginx error logs: `/var/log/nginx/error.log`
- Ensure `client/dist` exists (the Nginx root) and `songbird.service` is running.

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
- If server is running on `127.0.0.1:${PORT:-5174}`, scripts execute through server admin API.
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
5. Run migrations
6. Restart services

## Updating the deployed app

```bash
cd /opt/songbird
git pull origin main
cd client
npm install
npm run build
cd ../server
npm install
npm run db:backup
npm run db:migrate
sudo systemctl restart songbird
sudo systemctl reload nginx
```

**What each step does:**

- git pull - Fetch and merge latest changes from GitHub
- npm install (client & server) - Install any new dependencies
- npm run build - Rebuild the React frontend into client/dist
- npm run db:backup - Create a timestamped backup of data/songbird.db
- npm run db:migrate - Apply versioned schema migrations without dropping data
- npm run db:backfill - Fill missing media dimensions for existing uploaded files
- systemctl restart songbird - Restart the Node server to pick up changes
- systemctl reload nginx - Reload Nginx to serve the new build

If only the frontend code has changed (no `package.json` changes), you can skip the `npm install` steps.

> **Note:** <br>
For zero-downtime deployments on larger projects, consider blue-green deployment or PM2, but for most updates the restart approach above is simple and sufficient.

## Chat page tuning (client env)

You can customize some key values of the app based on your on preferences.

> **Important**:
> - These are **client build-time** variables.
> - After changing them, rebuild the frontend: `cd client && npm run build`.
> - You can set them in `client/.env`, `client/.env.production`, CI/CD env, or any build service config that exports env vars before `npm run build`.

Available keys:

| Variable | Default | Description |
|---|---:|---|
| `CHAT_PENDING_TEXT_TIMEOUT_MS` | `300000` | Mark pending text message as failed after this timeout. |
| `CHAT_PENDING_FILE_TIMEOUT_MS` | `1200000` | Mark pending file message as failed / XHR timeout for uploads. |
| `CHAT_PENDING_RETRY_INTERVAL_MS` | `4000` | Retry cadence for pending sends while connected. |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL_MS` | `1000` | How often pending messages are checked for timeout. |
| `CHAT_MESSAGE_FETCH_LIMIT` | `300` | Max messages requested per chat fetch (initial/latest window). |
| `CHAT_MESSAGE_PAGE_SIZE` | `60` | Page size for loading older messages when scrolling to top. |
| `CHAT_UPLOAD_MAX_FILES` | `10` | Max files per single message. |
| `CHAT_UPLOAD_MAX_FILE_SIZE_BYTES` | `26214400` | Per-file max size. |
| `CHAT_UPLOAD_MAX_TOTAL_BYTES` | `78643200` | Total size cap for all files in one message. |
| `CHAT_LIST_REFRESH_INTERVAL_MS` | `20000` | Chats list background refresh interval. |
| `CHAT_PRESENCE_PING_INTERVAL_MS` | `5000` | Presence heartbeat interval (`/api/presence` POST). |
| `CHAT_PEER_PRESENCE_POLL_INTERVAL_MS` | `3000` | Active peer presence poll interval. |
| `CHAT_HEALTH_CHECK_INTERVAL_MS` | `10000` | Connection health check interval. |
| `CHAT_SSE_RECONNECT_DELAY_MS` | `2000` | Delay before reconnecting SSE after error. |
| `CHAT_NEW_CHAT_SEARCH_MAX_RESULTS` | `5` | Max users shown in New Chat search results. |

Example (`client/.env.production`):

```bash
CHAT_PENDING_TEXT_TIMEOUT_MS=180000
CHAT_PENDING_FILE_TIMEOUT_MS=900000
CHAT_PENDING_RETRY_INTERVAL_MS=2500
CHAT_MESSAGE_PAGE_SIZE=80
CHAT_UPLOAD_MAX_FILES=8
CHAT_UPLOAD_MAX_FILE_SIZE_BYTES=15728640
CHAT_UPLOAD_MAX_TOTAL_BYTES=52428800
```

Example (build service / CI env):

```bash
export CHAT_PENDING_TEXT_TIMEOUT_MS=180000
export CHAT_LIST_REFRESH_INTERVAL_MS=15000
export CHAT_MESSAGE_PAGE_SIZE=80
cd /opt/songbird/client
npm run build
```

## Running behind a domain + subpath

If you plan to host the app at a subpath (e.g., `example.com/songbird/`) you will need to adjust Nginx configuration and set `base` in `client/index.html` or Vite build options accordingly.

## License

This project is licensed under the MIT License. See the see [LICENSE](LICENSE) file for details.

