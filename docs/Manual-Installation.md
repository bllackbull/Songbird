# Manual Installation

**Prerequisites (tested on Ubuntu 22.04+):**

- An Ubuntu server with sudo access
- A domain name pointing to your server's public IP (recommended)

## 1. System setup

Update and install required packages:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

Install Node.js and npm (pick one):

| Method | Best for | Note |
|---|---|---|
| NodeSource | Most installs (recommended) | System-wide install via apt. |
| nvm | Per-user Node version management | Requires `nvm install` / `nvm use` after cloning. |
| Volta | Pinned toolchain per project | Installs a specific Node/npm version. |

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

## 2. Clone repository

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

:::info

If you installed Node.js using nvm:

```bash
nvm install
nvm use
```

:::

## 3. Install dependencies

```bash
cd /opt/songbird/server
npm install

cd /opt/songbird/client
npm install
npm run build
```

## 4. Create systemd service

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

:::info

- If you installed Node.js using nvm, set this as Node path in `ExecStart`:

```ini
ExecStart=/root/.nvm/versions/node/v24.11.1/bin/node index.js
```

- If you installed Node.js using volta, set this as Node path in `ExecStart`:

```ini
ExecStart=/root/.volta/bin/node index.js
```

:::

**Recommended: Create a dedicated user:**

:::warning

Skip this step if you installed Node.js using nvm or volta.

:::

Due to security concerns, it is recommended to create a dedicated system user and change ownership of the project directory:

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
