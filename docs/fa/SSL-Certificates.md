# گواهی‌نامه‌های SSL

استفاده از HTTPS برای Push notifications الزامی و برای تمام استقرارهای تولیدی به‌شدت توصیه می‌شود.

## گزینه A: Certbot برای یک دامنه

برای نصب‌های مبتنی بر دامنه، Certbot ساده‌ترین گزینه است:

```bash
sudo certbot certonly --nginx --https-port 443 -d example.com -d www.example.com
sudo certbot install --nginx --https-port 443 --cert-name example.com -d example.com -d www.example.com
sudo certbot renew --dry-run
```

اگر از پورت HTTPS متفاوتی استفاده می‌کنید، `443` را با مقدار `CLIENT_PORT` خود جایگزین کنید.

برای استقرارهای Docker، گواهی‌نامه‌های صادرشده را در پوشه `certs/` کپی کنید:

```bash
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/example.com/privkey.pem certs/key.pem
docker compose restart nginx
```

## گزینه B: استفاده از فایل‌های گواهی‌نامه موجود

اگر از قبل `fullchain.pem` و `privkey.pem` را دارید، آن‌ها را در پوشه `certs/` کپی کنید (برای Docker) یا مستقیماً Nginx را به آن‌ها اشاره دهید (برای نصب دستی):

```bash
# Docker
cp /path/to/fullchain.pem certs/cert.pem
cp /path/to/privkey.pem certs/key.pem
docker compose restart nginx
```

```nginx
# نصب دستی — nginx.conf
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/privkey.pem;
```

این روش هم برای راه‌اندازی مبتنی بر دامنه و هم مبتنی بر IP کار می‌کند، تا زمانی که گواهی‌نامه شما آنچه را که ارائه می‌دهید پوشش دهد.

## گزینه C: استفاده از اسکریپت نصب

[اسکریپت نصب](./Deployment-Script.md) (`songbird-deploy`) می‌تواند Nginx را برای شما پیکربندی کند و همچنین راه‌اندازی SSL را انجام دهد. اگر نمی‌خواهید مراحل Nginx و گواهی‌نامه را به‌صورت دستی مدیریت کنید، این ساده‌ترین مسیر برای نصب‌های bare-metal است.

## گزینه D: گواهی‌نامه self-signed (توصیه‌نشده برای محیط تولید)

Songbird یک اسکریپت کمکی برای تولید گواهی‌نامه self-signed دارد:

```bash
bash scripts/gen-certs.sh
# یا با یک دامنه / IP مشخص:
bash scripts/gen-certs.sh example.com
```

[اسکریپت نصب](./Deployment-Script.md) (`songbird-deploy`) نیز این گزینه را به‌عنوان **Certificate Mode → Self-signed** در هنگام نصب ارائه می‌دهد، بنابراین برای نصب‌های bare-metal نیازی به اجرای دستی اسکریپت ندارید.

:::danger محدودیت‌های گواهی‌نامه خودامضا

- **هشدارهای امنیتی مرورگر**: هر بازدیدکننده‌ای با خطای «اتصال شما امن نیست» مواجه می‌شود. بدون نصب دستی گواهی‌نامه در store اعتماد هر کلاینت، راهی برای جلوگیری از این خطا وجود ندارد.
- **Push notifications کار نمی‌کنند**: Web Push API به یک گواهی‌نامه معتبر صادرشده توسط CA نیاز دارد. گواهی‌نامه‌های self-signed باعث می‌شوند تحویل push بی‌سروصدا شکست بخورد.
- **نصب PWA مسدود می‌شود**: مرورگرها از نصب PWA روی اتصالی که ناامن می‌دانند خودداری می‌کنند.
- **مناسب سرورهای عمومی نیست**: فقط برای شبکه‌های داخلی ایزوله یا تست سریع در محیط‌هایی که همه کلاینت‌ها را کنترل می‌کنید از این روش استفاده کنید.

:::
