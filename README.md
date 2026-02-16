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
- Mail-related variables:
  - `MAIL_DOMAIN` (optional): mailbox domain used for user addresses (example: `example.com` -> `username@example.com`). If omitted, the server derives it from request host (for `chat.example.com` it resolves to `example.com`).
  - `MAIL_INBOUND_TOKEN` (optional, required for external inbound): enables `/api/mail/inbound` webhook for your SMTP/email provider and secures it via `x-inbound-token`.

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

Notes:

- Add `User=` if you prefer an specific user (e.g., create a dedicated `songbird` user for separation).
- If you decided to create a dedicated user, make sure to create system user and change ownership:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin songbird
sudo chown -R songbird:songbird /opt/songbird
git config --global --add safe.directory /opt/songbird
```

- If Node is installed somewhere else, update `ExecStart` accordingly (use full path to `node`).

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

> `data/` is created automatically by the server from the `server` working directory. When running the server from `/opt/songbird/server` the DB will be at `/opt/songbird/data/songbird.db`.

## Common troubleshooting

- Check the Node server logs: `sudo journalctl -u songbird -f`
- Check Nginx error logs: `/var/log/nginx/error.log`
- Ensure `client/dist` exists (the Nginx root) and `songbird.service` is running.

## Database backups and versioned migrations

Songbird now uses schema versioning.

- Backup command (from `server/`): `npm run backup:db`
- Migration command (from `server/`): `npm run migrate`
- Backup location: `data/backups/`

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
npm run backup:db
npm run migrate
sudo systemctl restart songbird
sudo systemctl reload nginx
```

**What each step does:**

- git pull - Fetch and merge latest changes from GitHub
- npm install (client & server) - Install any new dependencies
- npm run build - Rebuild the React frontend into client/dist
- npm run backup:db - Create a timestamped backup of data/songbird.db
- npm run migrate - Apply versioned schema migrations without dropping data
- systemctl restart songbird - Restart the Node server to pick up changes
- systemctl reload nginx - Reload Nginx to serve the new build

If only the frontend code has changed (no `package.json` changes), you can skip the `npm install` steps.

> For zero-downtime deployments on larger projects, consider blue-green deployment or PM2, but for most updates the restart approach above is simple and sufficient.

## Running behind a domain + subpath

If you plan to host the app at a subpath (e.g., `example.com/songbird/`) you will need to adjust Nginx configuration and set `base` in `client/index.html` or Vite build options accordingly.

## License

This project is licensed under the MIT License. See the see [LICENSE](LICENSE) file for details.

