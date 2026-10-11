# SSL Certificates

HTTPS is required for push notifications and strongly recommended for all production deployments.

## Option A: Certbot for a domain

For domain-based installs, Certbot is the simplest option:

```bash
sudo certbot certonly --nginx --https-port 443 -d example.com -d www.example.com
sudo certbot install --nginx --https-port 443 --cert-name example.com -d example.com -d www.example.com
sudo certbot renew --dry-run
```

If you use a different HTTPS port, replace `443` with your `CLIENT_PORT`.

For Docker deployments, copy the issued certificates into the `certs/` directory:

```bash
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/example.com/privkey.pem certs/key.pem
docker compose restart nginx
```

## Option B: Use existing certificate files

If you already have `fullchain.pem` and `privkey.pem`, copy them into the `certs/` directory (for Docker) or point Nginx to them directly (for manual installs):

```bash
# Docker
cp /path/to/fullchain.pem certs/cert.pem
cp /path/to/privkey.pem certs/key.pem
docker compose restart nginx
```

```nginx
# Manual install — nginx.conf
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/privkey.pem;
```

This works for both domain and IP setups as long as your certificate covers what you are serving.

## Option C: Use the deploy script

The [Deployment Script](./Deployment-Script.md) (`songbird-deploy`) can configure Nginx for you and also handle SSL setup. That is the easiest path for bare-metal installs if you do not want to manage Nginx and certificates manually.

## Option D: Self-signed certificate (not recommended for production)

Songbird ships a helper script that generates a self-signed certificate:

```bash
bash scripts/gen-certs.sh
# or with a specific domain / IP:
bash scripts/gen-certs.sh example.com
```

The [Deployment Script](./Deployment-Script.md) (`songbird-deploy`) also offers this as **Certificate Mode → Self-signed** during installation, so you do not need to run the script manually for bare-metal installs.

:::danger Limitations of self-signed certificates

- **Browser security warnings**: Every visitor sees a "Your connection is not private" error. There is no way to suppress this without manually installing the certificate into each client's trust store.
- **Push notifications will not work**: The Web Push API requires a valid, CA-signed certificate. Self-signed certs will cause push delivery to fail silently.
- **PWA install is blocked**: Browsers refuse to install a PWA over a connection they consider insecure.
- **Not suitable for public-facing servers**: Use this only for isolated internal networks or quick testing where you control all clients.

:::
