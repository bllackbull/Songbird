# به‌روزرسانی اپلیکیشن مستقرشده

نحوه به‌روزرسانی به این بستگی دارد که Songbird را چگونه نصب کرده‌اید.

| روش نصب | مسیر به‌روزرسانی |
|---|---|
| اسکریپت نصب | `songbird-deploy` را اجرا کنید و **Update Songbird** را انتخاب کنید (پشتیبان‌گیری، pull، بازسازی و راه‌اندازی مجدد را انجام می‌دهد). |
| Docker | `git pull` + `docker compose up -d --build`. |
| دستی (systemd) | `git pull` + بازسازی کلاینت/سرور + راه‌اندازی مجدد سرویس. |

:::warning

پیش از به‌روزرسانی از پایگاه داده خود پشتیبان بگیرید:

```bash
cd /opt/songbird/server
npm run db:backup
# Or use this for Docker:
docker compose exec songbird npm --prefix /app/server run db:backup
```

:::

:::tip

[اسکریپت نصب](./Deployment-Script.md) می‌تواند اپلیکیشن شما را به‌روزرسانی کند و پیش از آن پیشنهاد پشتیبان‌گیری از پایگاه داده‌تان را می‌دهد.

:::

## Docker + Compose

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

## دستی (systemd)

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

برای نصبهای بدون زمان توقف (zero-downtime) در پروژه‌های بزرگ‌تر، نصب blue-green یا PM2 را در نظر بگیرید، اما برای بیشتر به‌روزرسانی‌ها روش راه‌اندازی مجدد بالا ساده و کافی است.

:::
