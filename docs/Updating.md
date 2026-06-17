# Updating the deployed app

How you update depends on how you installed Songbird.

| Install method | Update path |
|---|---|
| Deployment script | Run `songbird-deploy` and choose **Update Songbird** (handles backup, pull, rebuild, restart). |
| Docker | `git pull` + `docker compose up -d --build`. |
| Manual (systemd) | `git pull` + rebuild client/server + restart service. |

:::warning

Backup your database before updating:

```bash
cd /opt/songbird/server
npm run db:backup
# Or use this for Docker:
docker compose exec songbird npm --prefix /app/server run db:backup
```

:::

:::tip

The [Deployment Script](./Deployment-Script.md) can update your app for you and will offer to back up your database first.

:::

## Docker + Compose

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

## Manual (systemd)

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

:::info

For zero-downtime deployments on larger projects, consider blue-green deployment or PM2, but for most updates the restart approach above is simple and sufficient.

:::
