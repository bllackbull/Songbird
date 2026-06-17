# عیب‌یابی

این صفحه مشکلات رایج و نحوه تشخیص آن‌ها را گردآوری می‌کند. ابتدا لاگ‌های مرتبط را بررسی کنید، سپس به بخشی بروید که با نشانه شما مطابقت دارد.

## ابتدا کجا را بررسی کنیم

| منبع | دستور | برای چه چیزی |
|---|---|---|
| لاگ‌های سرویس (systemd) | `sudo journalctl -u songbird -f` | کرش اپلیکیشن، خطاهای راه‌اندازی، استثناهای زمان اجرا. |
| لاگ‌های Docker | `docker compose -f docker-compose.yaml logs -f` | همانند بالا، برای نصب‌های Docker. |
| لاگ خطای Nginx | `sudo tail -f /var/log/nginx/error.log` | خطاهای 502/504، مشکلات پراکسی و TLS. |
| لاگ دسترسی Nginx | `sudo tail -f /var/log/nginx/access.log` | تأیید رسیدن درخواست‌ها به سرور و کدهای وضعیت آن‌ها. |
| لاگ اسکریپت نصب | `cat /opt/songbird/logs/install.log` | شکست‌ها در حین نصب/به‌روزرسانی از طریق `songbird-deploy`. |

:::tip

[اسکریپت نصب](./Deployment-Script.md) یک منوی داخلی **View Logs** دارد که همه این‌ها را بدون تایپ مسیرها باز می‌کند.

:::

## مرجع سریع نشانه‌ها

| نشانه | حوزه محتمل | پرش به |
|---|---|---|
| نصب هنگام دانلود بسته‌ها متوقف می‌شود | محدودیت‌های شبکه | [توقف نصب هنگام دانلود بسته‌ها](#installation-stuck-downloading-packages) |
| دامنه resolve نمی‌شود / گواهی‌نامه شکست می‌خورد | تفکیک DNS | [مشکلات تفکیک DNS](#dns-resolution-problems) |
| `502 Bad Gateway` | اپلیکیشن در حال اجرا نیست یا پورت پراکسی نادرست است | [اپلیکیشن راه‌اندازی نمی‌شود / 502](#app-wont-start--502-bad-gateway) |
| سایت بارگذاری می‌شود اما به‌روزرسانی‌های زنده متوقف می‌شوند | بافرینگ SSE/پراکسی | [به‌روزرسانی‌های بی‌درنگ نمی‌رسند](#real-time-updates-not-arriving) |
| Push notifications هرگز نمی‌رسند | HTTPS یا شبکه/پراکسی | [Push notifications](#push-notifications-not-arriving) |
| آپلودها رد می‌شوند یا شکست می‌خورند | محدودیت‌های اندازه یا دیسک | [شکست در آپلود فایل‌ها](#file-uploads-failing) |
| ویدیوها پخش نمی‌شوند | ffmpeg / ترنسکد | [ترنسکد ویدیو](#video-transcoding-issues) |
| بیلد Docker متوقف به‌نظر می‌رسد | دانلود وابستگی | [مشکلات بیلد Docker](#docker-build-issues) |
| خطاهای TLS/گواهی‌نامه | مسیرهای گواهی‌نامه یا تمدید | [مشکلات TLS / گواهی‌نامه](#tls--certificate-problems) |
| کانال راه دور بازتاب نمی‌دهد | اعتبارنامه‌های Telegram / صف | [کانال راه دور](#remote-channel-not-mirroring) |

---

## توقف نصب هنگام دانلود بسته‌ها {#installation-stuck-downloading-packages}

در حین نصب، Songbird باید بسته‌های سیستمی و وابستگی‌ها را دانلود کند: بسته‌های apt، Node.js (از طریق NodeSource)، بسته‌های npm، و برای نصب‌های Docker، تصاویر و بسته‌های Docker. روی سرورهایی در شبکه‌های به‌شدت محدودشده یا فیلترشده، این دانلودها می‌توانند متوقف شوند، تایم‌اوت کنند یا کاملاً شکست بخورند.

نشانه‌های معمول:

- نصاب یا `docker compose build` در یک مرحله دانلود/`npm ci`/`apt-get install` منجمد به‌نظر می‌رسد.
- خطاهایی که به تایم‌اوت اتصال، شکست در دست‌دادن TLS، یا میزبان‌های غیرقابل‌دسترس اشاره دارند.

برای دور زدن محدودیت، ابزارهای بسته را به mirrorهای قابل‌دسترس اشاره دهید یا ترافیک را از طریق یک پراکسی مسیریابی کنید.

| ابزار | راه‌حل موقت |
|---|---|
| apt | استفاده از یک mirror apt قابل‌دسترس. |
| Node.js (NodeSource) | استفاده از یک mirror NodeSource. |
| npm | استفاده از یک mirror رجیستری npm جایگزین. |
| Docker / خروجی عمومی | پیکربندی یک پراکسی HTTP/HTTPS برای shell یا دیمن Docker. |

اگر با [اسکریپت نصب](./Deployment-Script.md) نصب می‌کنید، پیش از نصب از منوی **Configure mirrors** آن برای تنظیم mirrorهای NodeSource، apt و npm استفاده کنید. آن صفحه همچنین نمونه‌های mirror قابل‌استفاده (از جمله مواردی که در محیط محدودشده ایران قابل‌استفاده هستند) را فهرست می‌کند. به [mirrorها برای شبکه‌های محدودشده](./Deployment-Script.md#mirrors-for-restricted-networks) مراجعه کنید.

برای نصب‌های دستی یا Docker، پیش از اجرای دستورهای نصب یک پراکسی را در shell خود تنظیم کنید:

```bash
export HTTP_PROXY="http://your-proxy:3128"
export HTTPS_PROXY="http://your-proxy:3128"
```

## مشکلات تفکیک DNS {#dns-resolution-problems}

اگر سرور شما نتواند نام‌های دامنه را تفکیک (resolve) کند، دانلود بسته‌ها، صدور گواهی‌نامه (Certbot/Let's Encrypt) و سرویس‌های خروجی (push، Telegram) همگی شکست خواهند خورد، حتی زمانی که شبکه در غیر این صورت قابل‌دسترس باشد.

آزمایش کنید که آیا سرور می‌تواند با پیکربندی DNS فعلی خود یک دامنه را تفکیک کند:

```bash
# Using dig:
dig +short github.com

# Or using nslookup:
nslookup github.com
```

اگر دستور یک یا چند نشانی IP بازگرداند، DNS کار می‌کند. اگر منجمد شود، تایم‌اوت کند یا هیچ پاسخی / یک خطا بازگرداند، DNS سرور پیکربندی نادرست دارد یا مسدود است.

برای رفع آن، سرور را به یک تفکیک‌گر DNS کارا اشاره دهید. روی بیشتر سرورهای Ubuntu که از `systemd-resolved` استفاده می‌کنند، خط `DNS=` را در `/etc/systemd/resolved.conf` تنظیم کرده و تفکیک‌گر را راه‌اندازی مجدد کنید:

```bash
sudo nano /etc/systemd/resolved.conf
# Set, for example:
#   DNS=1.1.1.1 8.8.8.8
sudo systemctl restart systemd-resolved
```

سپس دوباره با `dig +short github.com` آزمایش کنید. وقتی DNS به‌درستی تفکیک شد، نصب یا عملیات شکست‌خورده را دوباره امتحان کنید.

:::info

تفکیک‌گرهای DNS را انتخاب کنید که قابل‌دسترس باشند و از شبکه سرور شما مسدود نباشند. در محیط‌های محدودشده، یک تفکیک‌گر عمومی ممکن است خودش فیلتر شده باشد، که در آن صورت این را با راه‌حل‌های موقت mirror/پراکسی بالا ترکیب کنید.

:::

:::tip

می‌توانید از این تفکیک‌گرهای DNS در محیط محدودشده ایران استفاده کنید:
```
217.218.127.127
217.218.155.155
```

:::

---

## اپلیکیشن راه‌اندازی نمی‌شود / 502 Bad Gateway {#app-wont-start--502-bad-gateway}

یک `502` از Nginx تقریباً همیشه به این معناست که سرور Node روی پورت موردانتظار قابل‌دسترس نیست.

1. تأیید کنید که سرویس در حال اجراست:
   ```bash
   sudo systemctl status songbird
   sudo journalctl -u songbird -n 100 --no-pager
   ```
2. تأیید کنید که هدف پراکسی با `SERVER_PORT` مطابقت دارد. پورت `proxy_pass` در Nginx باید با `SERVER_PORT` در `.env` برابر باشد.
3. تأیید کنید که پورت listen با `CLIENT_PORT` مطابقت دارد.

| بررسی | کجا | باید مطابقت داشته باشد با |
|---|---|---|
| `proxy_pass http://127.0.0.1:<port>` | پیکربندی سایت Nginx | `SERVER_PORT` |
| `listen <port>` | پیکربندی سایت Nginx | `CLIENT_PORT` |
| `client_max_body_size` | پیکربندی سایت Nginx | `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` |

پس از هر تغییر در Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## به‌روزرسانی‌های بی‌درنگ نمی‌رسند {#real-time-updates-not-arriving}

Songbird برای پیام‌های زنده و حضور از Server-Sent Events (SSE) استفاده می‌کند. اگر پیام‌ها تنها پس از یک تازه‌سازی ظاهر می‌شوند، احتمالاً جریان SSE توسط Nginx بافر می‌شود.

- مطمئن شوید که بلوک location مربوط به `/api/events` وجود دارد و بافرینگ را غیرفعال می‌کند (`proxy_buffering off;`، `add_header X-Accel-Buffering no;`). به [پیکربندی Nginx](./Nginx-Configuration.md) مراجعه کنید.
- تأیید کنید که هیچ پراکسی بالادست یا CDN، اتصال را بافر یا تایم‌اوت نمی‌کند.
- بررسی کنید که `proxy_read_timeout` / `proxy_send_timeout` به‌اندازه کافی طولانی باشند (پیکربندی نمونه از `1h` استفاده می‌کند).

## Push notifications نمی‌رسند {#push-notifications-not-arriving}

| نیازمندی | جزئیات |
|---|---|
| HTTPS | push به HTTPS نیاز دارد، به‌جز روی `localhost`. نصب‌های HTTP ساده نمی‌توانند push را تحویل دهند. |
| کلیدهای VAPID | `VAPID_PUBLIC_KEY`، `VAPID_PRIVATE_KEY` و `VAPID_SUBJECT` باید تنظیم شوند (در اولین اجرا به‌طور خودکار تولید می‌شوند). |
| iOS | به یک PWA نصب‌شده روی iOS 16.4+ نیاز دارد. |
| قابلیت دسترسی شبکه | سرور باید به نقاط پایانی push (FCM، Mozilla، Apple) دسترسی داشته باشد. |

اگر لاگ‌ها `[push] delivery failed ... status=0 ... AggregateError` را نشان می‌دهند، سرور نمی‌تواند به سرویس‌های push دسترسی پیدا کند. دلایل رایج: مسدودکردن HTTPS خروجی توسط فایروال، شکست‌های DNS، یا شبکه‌ای که به پراکسی نیاز دارد. یک پراکسی را از طریق [پراکسی Push notification](./Push-Notification-Proxy.md) پیکربندی کنید و اتصال را آزمایش کنید:

```bash
curl -x http://your-proxy:3128 https://fcm.googleapis.com
```

## شکست در آپلود فایل‌ها {#file-uploads-failing}

| علت | راه‌حل |
|---|---|
| آپلود بزرگ‌تر از سقف هر فایل | `FILE_UPLOAD_MAX_SIZE_MB` را افزایش دهید. |
| مجموع پیام از سقف فراتر می‌رود | `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` را افزایش دهید و `client_max_body_size` در Nginx را همسو کنید. |
| فایل‌های بیش از حد در یک پیام | `FILE_UPLOAD_MAX_FILES` را افزایش دهید. |
| آپلودها غیرفعال هستند | `FILE_UPLOAD=true` را تنظیم کنید. |
| Nginx بدنه‌های بزرگ را رد می‌کند (`413`) | `client_max_body_size` را برابر با `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` تنظیم کنید. |
| دیسک پر است | فضای آزاد را با `npm run db:inspect` (استفاده از دیسک را گزارش می‌کند) یا `df -h` بررسی کنید. |

پس از تغییر `.env`، تغییرات را اعمال کنید (به [متغیرهای محیطی](./Environment-Variables.md#apply-changes) مراجعه کنید).

## مشکلات ترنسکد ویدیو {#video-transcoding-issues}

Songbird هنگامی که `FILE_UPLOAD_TRANSCODE_VIDEOS=true` باشد ویدیوهای آپلودشده را به H.264/AAC MP4 ترنسکد می‌کند، که به `ffmpeg` نیاز دارد.

- نصب‌بودن ffmpeg را تأیید کنید: `ffmpeg -version`.
- اگر پردازش ویدیوها شکست خورد، لاگ‌های سرویس را برای خطاهای ترنسکد بررسی کنید.
- `APP_DEBUG=true` را تنظیم کنید تا خطوط پرجزئیات `[app-debug]` پوشش‌دهنده رویدادهای آپلود/ترنسکد را دریافت کنید، سپس سرویس را راه‌اندازی مجدد کنید.

## مشکلات بیلد Docker {#docker-build-issues}

اگر `docker compose build` در `RUN npm ci` متوقف به‌نظر می‌رسد، معمولاً در حال دانلود وابستگی‌هاست. آن را با حالت progress ساده اجرا کنید تا ببینید چه اتفاقی می‌افتد:

```bash
docker compose -f docker-compose.yaml build --no-cache --progress=plain
```

بررسی‌های دیگر:

- سلامت کانتینر را تأیید کنید: `docker compose -f docker-compose.yaml ps`.
- لاگ‌های کانتینر را دنبال کنید: `docker compose -f docker-compose.yaml logs -f`.

## مشکلات TLS / گواهی‌نامه {#tls--certificate-problems}

| نشانه | بررسی |
|---|---|
| مرورگر درباره گواهی‌نامه نامعتبر هشدار می‌دهد | تأیید کنید که مسیرهای `ssl_certificate` / `ssl_certificate_key` در Nginx به فایل‌های معتبر اشاره می‌کنند. |
| تمدید Certbot شکست می‌خورد | `sudo certbot renew --dry-run` را اجرا کنید و قابلیت دسترسی DNS/پورت 80 را بررسی کنید. |
| گواهی‌نامه مبتنی بر IP منقضی شده | روند گواهی‌نامه IP از گواهی‌نامه‌های کوتاه‌مدت (۶ روزه) استفاده می‌کند که توسط یک تایمر به‌طور خودکار تمدید می‌شوند؛ فعال‌بودن تایمر `songbird-lego-renew` را تأیید کنید. |
| هشدار خودامضا (پیش‌فرض Docker) | با گواهی‌نامه خودامضای پیش‌فرض موردانتظار است. برای محیط تولید با گواهی‌نامه‌های واقعی جایگزین کنید. |

برای گزینه‌های کامل راه‌اندازی به [گواهی‌نامه‌های SSL](./SSL-Certificates.md) مراجعه کنید.

## کانال راه دور بازتاب نمی‌دهد {#remote-channel-not-mirroring}

| بررسی | جزئیات |
|---|---|
| فعال‌بودن قابلیت | `REMOTE_CHANNEL=true` باید روی این سرور تنظیم شده باشد. |
| اعتبارنامه‌های Telegram | API ID، API hash و رشته session باید پیکربندی شوند. `npm run remote:configure` را اجرا کنید. |
| عمومی‌بودن کانال | کانال راه دور برای کانال‌های خصوصی قفل است. |
| تاریخچه وارد نشده | در اولین فعال‌سازی، تنها پست‌های منتشرشده پس از آن نقطه بازتاب داده می‌شوند، نه تاریخچه. |
| صف متوقف شده | با `npm run db:chat:edit -- <channel> --resume-queue` از سر بگیرید. |
| نیاز به پراکسی | اگر سرور نمی‌تواند به Telegram دسترسی پیدا کند، یک پراکسی تنظیم کنید (`REMOTE_CHANNEL_TELEGRAM_PROXY_URL`). |

برای راهنمای کامل پیکربندی به [راه‌اندازی کانال راه دور](./Remote-Channel-Setup.md) مراجعه کنید.

---

## هنوز گیر کرده‌اید؟

اگر هیچ‌یک از موارد بالا مشکل را حل نکرد، خروجی لاگ مرتبط را جمع‌آوری کرده و یک issue در [مخزن پروژه](https://github.com/bllackbull/Songbird/issues) باز کنید.
