# Deployment Script

The deployment script (`songbird-deploy`) is the recommended way to install and manage Songbird. It is an interactive, menu-driven tool that handles dependencies, builds, Nginx, SSL certificates, environment configuration, database management, and updates, so you do not have to run those steps by hand.

:::info

The script targets Ubuntu (22.04+) and needs root privileges (it uses `sudo` automatically when not run as root). For Docker-based or fully manual setups, see [Install via Docker](./Installation-Docker.md) and [Manual Installation](./Manual-Installation.md).

:::

## First run

Run the one-liner on your server:

```bash
curl -fsSL https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh | bash
```

This downloads the script, opens the menu, and installs a global `songbird-deploy` command. From then on, launch it anytime with:

```bash
songbird-deploy
```

## Main menu

| Option | Action | Description |
|---|---|---|
| 1 | 📥 Install Songbird | Full guided install: dependencies, build, Nginx, SSL, and `.env`. |
| 2 | 🔄 Update Songbird | Pull the latest version, rebuild, and restart (optional pre-update backup). |
| 3 | ♻️ Restart Songbird | Restart the `songbird.service`. |
| 4 | ⚙️ Edit Settings (.env) | Change ports, uploads, retention, sign-up, and other env values, then rebuild/apply. |
| 5 | 🗃️ Manage Database | Open the database submenu (see below). |
| 6 | 🗑️ Remove Songbird | Uninstall Songbird, optionally removing the global command. |
| 7 | 🔄 Reinstall songbird-deploy | Refresh the global command to the latest script version. |
| 8 | 🌐 Configure mirrors | Set NodeSource, apt, and npm registry mirrors for restricted networks. |
| 9 | 📋 View Logs | Open the logs submenu (script, service, Nginx access/error). |
| 0 | 🚪 Exit | Leave the menu. |

## Installation flow

When you choose **Install**, the script walks you through a series of prompts:

### 1. Source mode

| Mode | Description |
|---|---|
| GitHub | Clone the project from the official GitHub repository. |
| Offline | Install from a local source zip (useful for air-gapped servers). |

### 2. Deploy mode

| Mode | Description |
|---|---|
| Domain | Serve Songbird on a domain name (e.g. `example.com`). |
| IP | Serve Songbird directly on the server's public IP. |

### 3. Certificate mode

| Mode | Description |
|---|---|
| Obtain certificate | Automatically request a certificate. For domains this uses Certbot (Let's Encrypt); for IPs it requests a short-lived 6-day certificate via `lego`. |
| TLS certificate files | Use your own existing `fullchain.pem` and `privkey.pem`. |
| HTTP only | Skip TLS and serve over plain HTTP. |

:::info

HTTPS is required for push notifications (except on `localhost`). Choose a certificate mode other than HTTP only if you want push to work.

:::

### 4. Environment prompts

During install the script asks for the core settings and writes them into `.env`:

| Prompt | Env variable | Default |
|---|---|---|
| Server port | `SERVER_PORT` | `5174` |
| Client port | `CLIENT_PORT` | `80` |
| Allow account creation via website | `SIGN_UP` | `true` |
| Enable file uploads | `FILE_UPLOAD` | `true` |
| Max total upload size (MB) | `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` | `75` |
| File auto-deletion interval (days) | `MESSAGE_FILE_RETENTION` | `7` |
| Text-only message auto-deletion (days) | `MESSAGE_TEXT_RETENTION` | `0` |
| Email for Let's Encrypt notices (certbot mode) | — | — |

Encryption and push keys (`STORAGE_ENCRYPTION_KEY`, `VAPID_*`) are generated automatically. The full list of variables you can tune later lives in [Environment Variables](./Environment-Variables.md).

## Database submenu

Option **5** opens a full database manager that wraps the [database commands](./Database-Commands.md) with guided prompts, so you do not need to remember flags:

| Group | Actions |
|---|---|
| Inspect | Database summary, chats, users, files |
| Backup & Repair | Backup, restore, vacuum, reset, delete |
| User & Chat Management | Create user, generate users, edit user, ban/unban, create group/channel, add members, edit chat |
| Remote Channels | Configure Remote Channel |
| Destructive Actions | Delete chats, delete users, delete files |
| Help & Navigation | Show help, go back, exit |

## Updating

Choose **Update Songbird** from the menu. The script can create a database backup first, then pulls the latest version, rebuilds the client, and restarts the service. See [Updating](./Updating.md) for the manual equivalent.

## Mirrors for restricted networks

If your server has limited access to default package sources, use **Configure mirrors** to set:

| Mirror | Purpose |
|---|---|
| NodeSource mirror | Alternate source for the Node.js apt setup. |
| apt mirror source | Extra apt mirror for base packages. |
| npm registry mirror | Alternate npm registry for installing dependencies. |

You can also restore defaults (clear all mirrors) from the same menu.

:::tip

You can use these mirrors in Iran's restricted environment:
- NodeSource:
```
https://mirror-nodejs.runflare.com/dist/v24.0.0/node-v24.0.0-linux-x64.tar.gz
```
- APT:
```
http://repo.iut.ac.ir/ubuntu/
```
- NPM:
```
https://npm.devneeds.ir/
```

:::

## Logs

The **View Logs** submenu surfaces the most useful logs without remembering paths:

| Option | Source |
|---|---|
| Script logs | The installer's own log at `/opt/songbird/logs/install.log`. |
| Service logs | `journalctl` output for `songbird.service`. |
| Nginx access logs | Nginx access log. |
| Nginx error logs | Nginx error log. |

For more on diagnosing problems, see [Troubleshooting](./Troubleshooting.md).
