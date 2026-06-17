# گواهی‌نامه‌های SSL

استفاده از HTTPS توصیه می‌شود، به‌ویژه اگر می‌خواهید از Push notifications استفاده کنید.

## گزینه A: Certbot برای یک دامنه

برای نصب‌های مبتنی بر دامنه، Certbot ساده‌ترین گزینه است:

```bash
sudo certbot certonly --nginx --https-port 443 -d example.com -d www.example.com
sudo certbot install --nginx --https-port 443 --cert-name example.com -d example.com -d www.example.com
sudo certbot renew --dry-run
```

اگر از پورت HTTPS متفاوتی استفاده می‌کنید، `443` را با مقدار `CLIENT_PORT` خود جایگزین کنید.

## گزینه B: استفاده از فایل‌های گواهی‌نامه موجود

اگر از قبل `fullchain.pem` و `privkey.pem` را دارید، Nginx را به آن‌ها اشاره دهید:

```nginx
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/privkey.pem;
```

این روش هم برای راه‌اندازی مبتنی بر دامنه و هم مبتنی بر IP کار می‌کند، تا زمانی که گواهی‌نامه شما آنچه را که ارائه می‌دهید پوشش دهد.

## گزینه C: استفاده از اسکریپت نصب

[اسکریپت نصب](./Deployment-Script.md) (`songbird-deploy`) می‌تواند Nginx را برای شما پیکربندی کند و همچنین راه‌اندازی SSL را انجام دهد. اگر نمی‌خواهید مراحل Nginx و گواهی‌نامه را به‌صورت دستی مدیریت کنید، این ساده‌ترین مسیر است.
