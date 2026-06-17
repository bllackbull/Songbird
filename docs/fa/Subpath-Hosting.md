# اجرا پشت یک دامنه + زیرمسیر

به‌صورت پیش‌فرض Songbird از ریشه یک دامنه ارائه می‌شود (برای مثال `https://chat.example.com/`). اگر به‌جای آن می‌خواهید آن را زیر یک زیرمسیر میزبانی کنید (برای مثال `https://example.com/songbird/`)، باید سه چیز را هماهنگ کنید: مقدار `base` در بیلد Vite، ارجاع‌های دارایی‌های کلاینت، و بلوک location در Nginx.

:::info

میزبانی روی ریشه دامنه، حالت پیش‌فرض پشتیبانی‌شده است و به هیچ‌کدام از مراحل زیر نیاز ندارد. تنها در صورتی این صفحه را دنبال کنید که به‌طور خاص به یک زیرمسیر نیاز دارید.

:::

## مرور کلی

| لایه | چه چیزی تغییر می‌کند | چرا |
|---|---|---|
| بیلد Vite | تنظیم `base` روی زیرمسیر | تا نشانی‌های دارایی‌های ساخته‌شده با زیرمسیر پیشوند بگیرند. |
| `client/index.html` | اطمینان از اینکه پیوندهای آیکون/manifest زیر زیرمسیر درست تفسیر می‌شوند | مسیرهای مطلق `/...` هنگام ارائه از یک زیرمسیر می‌شکنند. |
| Nginx | افزودن یک بلوک `location` برای زیرمسیر که به سرور Node پراکسی می‌کند | تا درخواست‌های زیر زیرمسیر به Songbird برسند. |
| `.env` | همسو نگه‌داشتن `SERVER_PORT` / `CLIENT_PORT` با پراکسی | همانند یک نصب معمولی. |

## ۱. تنظیم `base` در Vite

در `client/vite.config.js`، یک گزینه `base` متناسب با زیرمسیر خود اضافه کنید (به اسلش‌های ابتدایی و انتهایی توجه کنید):

```js
export default defineConfig(({ mode }) => {
  // ...
  return {
    base: "/songbird/",
    // ...plugins, build, server config unchanged
  };
});
```

سپس کلاینت را دوباره بسازید:

```bash
cd /opt/songbird/client
npm run build
```

## ۲. بررسی ارجاع‌های دارایی در `index.html`

`client/index.html` آیکون‌ها و manifest را با مسیرهای مطلق مانند `/favicon.ico` و `/manifest.webmanifest` ارجاع می‌دهد. با تنظیم‌شدن `base` در Vite، نشانی‌های دارایی که توسط باندلر تولید می‌شوند به‌طور خودکار بازنویسی می‌شوند، اما مسیرهای مطلق ثابت‌نوشته‌شده در `index.html` این‌گونه نیستند. مطمئن شوید که این‌ها زیر زیرمسیر شما درست تفسیر می‌شوند، و اگر آیکون‌ها یا manifest پس از نصب خطای 404 دادند، آن‌ها را به‌صورت نسبی یا با پیشوند زیرمسیر تنظیم کنید.

## ۳. افزودن بلوک location در Nginx

زیرمسیر را به سرور Node پراکسی کنید. نقطه پایانی SSE همچنان به بلوک مخصوص خود با بافرینگ غیرفعال نیاز دارد. [پیکربندی پایه Nginx](./Nginx-Configuration.md) را به این شکل تطبیق دهید:

```nginx
location /songbird/api/events {
  proxy_pass http://127.0.0.1:5174;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 1h;
  proxy_send_timeout 1h;
  proxy_buffering off;
  proxy_cache off;
  add_header X-Accel-Buffering no;
}

location /songbird/ {
  proxy_pass http://127.0.0.1:5174/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_cache_bypass $http_upgrade;
}
```

پس از ویرایش، Nginx را دوباره بارگذاری کنید:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

:::info

اسلش انتهایی در `proxy_pass http://127.0.0.1:5174/;` پیشوند `/songbird/` را پیش از ارسال به سرور Node حذف می‌کند. مقدار `base` در Vite و پیشوند `location` در Nginx را همسو نگه دارید؛ ناهماهنگی رایج‌ترین دلیل شکستن دارایی‌ها یا صفحات خالی در راه‌اندازی‌های زیرمسیر است.

:::
