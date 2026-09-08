# Updating

How you update or downgrade depends on how you installed Songbird.

| Install method | Update / Downgrade path |
|---|---|
| Deployment script | Run `songbird-deploy` and choose **Update Songbird** (handles database backup, git pull or checkout, rebuild, migrations, and service restart). |
| Docker | Git pull/checkout target tag or commit + `docker compose up -d --build`. |
| Manual (systemd) | Git pull/checkout target tag or commit + rebuild client/server + restart service. |

:::warning

Always backup your database before updating or downgrading:

```bash
cd /opt/songbird/server
npm run db:backup
# Or use this for Docker:
docker compose exec songbird npm --prefix /app/server run db:backup
```

:::

:::tip

The [Deployment Script](./Deployment-Script.md) handles both updates and downgrades automatically, and will prompt to back up your database first.

:::

## Deployment script (songbird-deploy)

The interactive deployment script is the easiest way to update or downgrade your Songbird instance.

Run the tool:

```bash
songbird-deploy
```

Choose option **2** (**Update Songbird**).

### 1. Pre-update database backup

The script prompts:

```txt
Create a database backup before updating? [y/N]
```

Choosing `yes` creates a timestamped database backup before any code changes occur.

### 2. Updating (GitHub mode)

When newer commits are available on the `main` branch, the script automatically:

1. Pulls the latest commits with `git pull --ff-only origin main`.
2. Updates client and server dependencies.
3. Ensures VAPID keys and security credentials remain configured.
4. Executes database schema migrations (`npm run db:migrate`).
5. Fixes file permissions and systemd service files.
6. Restarts `songbird.service` (and `songbird-worker.service` if present) and reloads Nginx.

### 3. Downgrading (GitHub mode)

If your local instance is already up to date with `origin/main`, the script informs you:

```txt
Songbird is already up to date.
Do you want to downgrade? [y/N]
```

If you select `yes`:

1. The script prompts: `Enter version number to install: `.
2. You can enter:
   - A semantic version tag (e.g. `0.11.4` or `v0.11.4`).
   - A custom git tag (e.g. `plain-0.10.0`).
   - A git branch name or specific commit hash.
3. The script validates the reference, checks out the specified version (`git checkout <ref>`), reinstalls dependencies, executes migrations, and restarts the services.

### 4. Offline mode updates & downgrades

When choosing **Offline** mode with a local source zip archive:

- **Update**: If the `VERSION` in the archive is higher than `/opt/songbird/VERSION`, the script updates the instance.
- **Downgrade**: If the `VERSION` in the archive is lower than the installed version, the script asks:

  ```txt
  Local zip version (<source_ver>) is lower than installed version (<install_ver>). Do you want to downgrade to version <source_ver>? [y/N]
  ```

  If confirmed, it extracts the archive, preserves your data/backups, updates dependencies, runs migrations, and restarts the services.

### 5. Updating the deployment menu

To update the `songbird-deploy` CLI command itself:

1. Run `songbird-deploy`.
2. Choose option **7** (**Update menu**).
3. The script checks GitHub for newer installer releases and updates the global command automatically (or offers to reinstall if already current).

## Docker + Compose

### Updating to latest

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

### Downgrading to a specific version

```bash
cd /opt/songbird
git fetch --all --tags
git checkout v0.11.4 # Replace with your target tag or commit hash
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

## Manual (systemd)

### Updating to latest

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

### Downgrading to a specific version

```bash
cd /opt/songbird
git fetch --all --tags
git checkout v0.11.4 # Replace with your target tag or commit hash
cd client
npm install
npm run build
cd ../server
npm install
npm run db:migrate
sudo systemctl restart songbird
sudo systemctl reload nginx
```

:::info

For zero-downtime deployments on larger projects, consider blue-green deployment or PM2, but for most updates and downgrades the restart approach above is simple and sufficient.

:::
