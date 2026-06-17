# SSL Certificates

HTTPS is recommended, especially if you want push notifications.

## Option A: Certbot for a domain

For domain-based installs, Certbot is the simplest option:

```bash
sudo certbot certonly --nginx --https-port 443 -d example.com -d www.example.com
sudo certbot install --nginx --https-port 443 --cert-name example.com -d example.com -d www.example.com
sudo certbot renew --dry-run
```

If you use a different HTTPS port, replace `443` with your `CLIENT_PORT`.

## Option B: Use existing certificate files

If you already have `fullchain.pem` and `privkey.pem`, point Nginx to them:

```nginx
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/privkey.pem;
```

This works for both domain and IP setups as long as your certificate covers what you are serving.

## Option C: Use the deploy script

The [Deployment Script](./Deployment-Script.md) (`songbird-deploy`) can configure Nginx for you and also handle SSL setup. That is the easiest path if you do not want to manage the Nginx and certificate steps manually.
