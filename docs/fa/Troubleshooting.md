# عیب یابی

این صفحه مشکلات رایج و نحوه تشخیص آنها را گردآوری میکند. ابتدا لاگ های مرتبط را بررسی کنید، سپس به بخشی بروید که با نشانه شما مطابقت دارد.

## ابتدا کجا را بررسی کنیم

| منبع | دستور | برای چه چیزی |
|---|---|---|
| لاگ های سرویس (systemd) | `sudo journalctl -u songbird -f` | کرش اپلیکیشن، خطاهای راه اندازی، استثناهای زمان اجرا. |
| لاگ های Docker | `docker compose -f docker-compose.yaml logs -f` | همانند بالا، برای نصب های Docker. |
| لاگ خطای Nginx | `sudo tail -f /var/log/nginx/error.log` | خطاهای 502/504، مشکلات پراکسی و TLS. |
| لاگ دسترسی Nginx | `sudo tail -f /var/log/nginx/access.log` | تأیید رسیدن درخواست ها به سرور و کدهای وضعیت آنها. |
| لاگ اسکریپت نصب | `cat /opt/songbird/logs/install.log` | شکست ها در حین نصب/به روزرسانی از طریق `songbird-deploy`. |

:::tip

[اسکریپت نصب](./Deployment-Script.md) یک منوی داخلی **View Logs** دارد که همه اینها را بدون تایپ مسیرها باز میکند.

:::

## مرجع سریع نشانه ها

| نشانه | حوزه محتمل | پرش به |
|---|---|---|
| نصب هنگام دانلود بسته ها متوقف میشود | محدودیت های شبکه | [توقف نصب هنگام دانلود بسته ها](#installation-stuck-downloading-packages) |
| دامنه resolve نمیشود / گواهینامه شکست میخورد | تفکیک DNS | [مشکلات تفکیک DNS](#dns-resolution-problems) |
| `502 Bad Gateway` | اپلیکیشن در حال اجرا نیست یا پورت پراکسی نادرست است | [اپلیکیشن راه اندازی نمیشود / 502](#app-wont-start--502-bad-gateway) |
| سایت بارگذاری میشود اما به روزرسانی های زنده متوقف میشوند | بافرینگ SSE/پراکسی | [به روزرسانی های بیدرنگ نمیرسند](#real-time-updates-not-arriving) |
| Push notifications هرگز نمیرسند | HTTPS یا شبکه/پراکسی | [Push notifications](#push-notifications-not-arriving) |
| آپلودها رد میشوند یا شکست میخورند | محدودیت های اندازه یا دیسک | [شکست در آپلود فایل ها](#file-uploads-failing) |
| ویدیوها پخش نمیشوند | FFmpeg / ترنسکد / Worker | [مشکلات ترنسکد ویدیو](#video-transcoding-issues) |
| بیلد Docker متوقف به نظر میرسد | دانلود وابستگی ها | [مشکلات بیلد Docker](#docker-build-issues) |
| خطاهای TLS/گواهینامه | مسیرهای گواهینامه یا تمدید | [مشکلات TLS / گواهینامه](#tls--certificate-problems) |
| کانال ریموت بازتاب نمیدهد | اعتبارنامه های Telegram / صف | [کانال ریموت](#remote-channel-not-mirroring) |
| کنترل سرویس در پنل مدیریت شکست میخورد | مجوزها | [مشکلات پنل مدیریت](#مشکلات-پنل-مدیریت) |


## توقف نصب هنگام دانلود بسته ها {#installation-stuck-downloading-packages}

در حین نصب، Songbird نیاز به دانلود بسته های سیستمی و وابستگی ها دارد: بسته های apt، پکیج Node.js (از طریق NodeSource)، بسته های npm و برای نصب های Docker، ایمیج ها و بسته های Docker. در سرورهایی با شبکه های دارای محدودیت شدید یا فیلترشده، این دانلودها ممکن است متوقف شوند، با timeout مواجه گردند یا کاملاً شکست بخورند.

نشانه های معمول:

- نصب کننده یا `docker compose build` در مرحله دانلود/`npm ci`/`apt-get install` فریز به نظر میرسد.
- خطاهایی که به خطای مهلت زمانی اتصال (timeout)، خطای TLS handshake یا غیرقابل دسترس بودن هاست ها اشاره میکنند.

برای دور زدن محدودیت، ابزارهای مدیریت بسته را به سمت میرورهای دردسترس هدایت کنید یا ترافیک را از طریق یک پراکسی عبور دهید.

| ابزار | راهحل |
|---|---|
| apt | از یک میرور در دسترس apt استفاده کنید. |
| Node.js (NodeSource) | از یک میرور NodeSource استفاده کنید. |
| npm | از یک رجیستری میرور جایگزین npm استفاده کنید. |
| Docker / خروجی عمومی | یک پراکسی HTTP/HTTPS برای شل یا daemon داکر پیکربندی کنید. |

اگر با [اسکریپت نصب](./Deployment-Script.md) نصب میکنید، از منوی **Configure mirrors** آن برای تنظیم میرورهای NodeSource، apt و npm قبل از نصب استفاده کنید. آن صفحه همچنین نمونه های میرورهای فعال (از جمله نمونه های قابل استفاده در شبکه محدود ایران) و نحوه راه اندازی پراکسی را فهرست میکند.


## مشکلات تفکیک DNS {#dns-resolution-problems}

| بررسی | جزئیات |
|---|---|
| رکورد A اشاره میکند به IP | مطمئن شوید `yourdomain.com` به IP عمومی سرور اشاره میکند (`dig +short yourdomain.com` یا `nslookup yourdomain.com`). |
| انتشار DNS | رکوردهای جدید DNS ممکن است تا چند دقیقه (گاهی بیشتر بسته به TTL) زمان ببرند. |
| پورت های 80 و 443 باز هستند | فایروال ها (ufw، فایروال ابری، گروه های امنیتی) باید ترافیک ورودی روی پورت های 80 و 443 را مجاز کنند. |
| نام دامنه با `.env` مطابقت دارد | اگر از متغیرهای دامنه استفاده میکنید، مطمئن شوید بدون فاصله یا خطای تایپی هستند. |


## اپلیکیشن راه اندازی نمیشود / 502 Bad Gateway {#app-wont-start--502-bad-gateway}

خطای `502 Bad Gateway` از Nginx یعنی Nginx در حال اجراست اما نمیتواند به بکاند Songbird متصل شود.

```bash
# 1. وضعیت بکاند را بررسی کنید
# استقرار Systemd:
sudo systemctl status songbird
sudo journalctl -u songbird -n 50 --no-pager

# استقرار Docker:
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs --tail=50 songbird

# 2. بررسی کنید بکاند روی پورت مورد انتظار گوش میدهد (پیشفرض: 5174)
ss -tulpn | grep 5174

# 3. خطاهای Nginx را بررسی کنید
sudo tail -n 50 /var/log/nginx/error.log
```

علل رایج:

- **تداخل پورت**: سرویس دیگری از قبل روی پورت 5174 گوش میدهد. `SERVER_PORT` را در `.env` تغییر دهید و بلوک `proxy_pass` در Nginx را همسو کنید.
- **Node.js پشتیبانی نشده**: نسخه Node را تأیید کنید (`node -v` — به Node.js 24+ نیاز دارد).
- **مجوزهای دایرکتوری data**: مطمئن شوید کاربر سرویس مالک `data/` است (`sudo chown -R songbird:songbird /opt/songbird/data`).
- **فایل `.env` نامعتبر**: خطاهای نحوی، کاراکترهای نقل قول نامعتبر یا متغیرهای گمشده در `.env`.
- **کانفیگ Nginx به پورت اشتباه اشاره میکند**: پورت `proxy_pass` در کانفیگ Nginx را با `SERVER_PORT` مقایسه کنید.


### برطرف کردن خطای 502 در محیط های ابری (Render, Railway, Fly.io) {#fixing-502-bad-gateway-in-cloud-environments}

اگر هنگام استفاده از [استقرار ابری](./Cloud-Deployment.md) خطای ۵۰۲ دریافت میکنید:

1. **بررسی پورت**: مطمئن شوید پورت سرویس شما در پنل به درستی روی ۵۱۷۴ (یا مقدار `SERVER_PORT`) تنظیم شده است.
2. **بررسی Mount مسیر دیتا**: پلتفرم هایی مثل Render نیاز دارند متغیر `DATA_DIR` به مسیر Volume متصل شده اشاره کند (مانند `DATA_DIR=/data`). اگر دیتا دایرکتوری به اشتباه کانفیگ شده باشد، سرور بالا نمی آید.
3. **لاگ های Build و Deploy**: مطمئن شوید بیلد بدون خطا پایان یافته و وابستگی های دیتابیس مهیا هستند.


## تداخل پورت با Nginx {#port-conflict-with-nginx}

اگر وب سرور دیگری (مانند Apache یا نمونه Nginx دیگر) از قبل روی پورت 80 یا 443 اجرا میشود، Nginx شروع به کار نخواهد کرد:

```bash
# بررسی کنید چه چیزی روی پورت های 80 و 443 گوش میدهد
sudo ss -tulpn | grep -E ':(80|443)\b'
```

سرویس متداخل را متوقف یا بازپیکربندی کنید، سپس Nginx را راه اندازی مجدد کنید:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## به روزرسانی های بیدرنگ نمیرسند {#real-time-updates-not-arriving}

پلتفرم Songbird از یک اتصال دائمی WebSocket برای پیام های زنده، وضعیت آنلاین بودن و وضعیت در حال تایپ استفاده میکند و جریان Server-Sent Events (SSE) را به عنوان پشتیبان در نظر میگیرد. کاربر تا زمانی که هرگونه اتصال زنده برقرار باشد آنلاین نشان داده میشود و با بسته شدن آخرین اتصال آفلاین خواهد شد. اگر پیام ها فقط پس از رفرش صفحه ظاهر میشوند، احتمالاً جریان SSE توسط Nginx بافر میشود.

- مطمئن شوید بلوک location مربوط به `/api/events` وجود دارد و بافرینگ را غیرفعال میکند (`proxy_buffering off;`، `add_header X-Accel-Buffering no;`). به [کانفیگ Nginx](./Nginx-Configuration.md) مراجعه کنید.
- تأیید کنید هر پراکسی بالادستی یا CDN اتصال را بافر یا timeout نمیکند.
- بررسی کنید `proxy_read_timeout` / `proxy_send_timeout` به اندازه کافی طولانی هستند (کانفیگ نمونه از `1h` استفاده میکند).

## Push notifications نمیرسند {#push-notifications-not-arriving}

| نیازمندی | جزئیات |
|---|---|
| HTTPS | سرویس Push به HTTPS نیاز دارد، مگر در `localhost`. نصب های HTTP ساده نمیتوانند push ارسال کنند. |
| کلیدهای VAPID | مقادیر `VAPID_PUBLIC_KEY`، `VAPID_PRIVATE_KEY` و `VAPID_SUBJECT` باید تنظیم شوند (در اولین اجرا به طور خودکار تولید میشوند). |
| iOS | در iOS 16.4+ به یک PWA نصب شده نیاز دارد. |
| دسترسی به شبکه | سرور باید به اندپوینت های push (مانند FCM، Mozilla، Apple) دسترسی داشته باشد. |

اگر لاگ ها `[push] delivery failed ... status=0 ... AggregateError` را نشان میدهند، سرور نمیتواند به سرویس های push دسترسی پیدا کند. دلایل رایج: مسدودکردن HTTPS خروجی توسط فایروال، شکست های DNS، یا شبکه ای که به پراکسی نیاز دارد. یک پراکسی را از طریق [پراکسی Push notification](./Push-Notification-Proxy.md) پیکربندی کنید و اتصال را آزمایش کنید:

```bash
curl -x http://your-proxy:3128 https://fcm.googleapis.com
```

## شکست در آپلود فایل ها {#file-uploads-failing}

| علت | راهحل |
|---|---|
| آپلود بزرگتر از سقف هر فایل | `FILE_UPLOAD_MAX_SIZE_MB` را افزایش دهید. |
| مجموع پیام از سقف فراتر میرود | `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` را افزایش دهید و `client_max_body_size` در Nginx را همسو کنید. |
| فایل های بیش از حد در یک پیام | `FILE_UPLOAD_MAX_FILES` را افزایش دهید. |
| آپلودها غیرفعال هستند | `FILE_UPLOAD=true` را تنظیم کنید. |
| Nginx بدنه های بزرگ را رد میکند (`413`) | `client_max_body_size` را برابر با `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` تنظیم کنید. |
| دیسک پر است | فضای آزاد را با `npm run db:inspect` (استفاده از دیسک را گزارش میکند) یا `df -h` بررسی کنید. |

پس از تغییر `.env`، تغییرات را اعمال کنید (به [متغیرهای محیطی](./Environment-Variables.md#apply-changes) مراجعه کنید).

## مشکلات ترنسکد ویدیو {#video-transcoding-issues}

پلتفرم Songbird هنگام فعال بودن `FILE_UPLOAD_TRANSCODE_VIDEOS=true`، ویدیوهای آپلودشده را به فرمت سازگار وب H.264/AAC MP4 بهینه سازی و ترنسکد میکند.

- **بررسی سلامت Media Worker**: در صورت استفاده از Media Worker مستقل، وضعیت آن را با `curl http://localhost:8080/health` (یا استفاده از پورت تنظیم شده `WORKER_PORT` / نشانی `WORKER_URL/health`) بررسی کنید. پاسخ باید حاوی `{"status": "ok", ...}` باشد. برای راهنمای جامع به [ورکر مدیا](./Media-Worker.md) مراجعه کنید.
- **همگام بودن Webhook Secret**: مطمئن شوید مقدار `WEBHOOK_SECRET` در سرور Songbird با مقدار تنظیم شده در Media Worker یکسان است. در صورت عدم تطابق، درخواست ها با خطای `401 Unauthorized` رد میشوند.
- **دسترسی به Callback سرور**: ورکر باید بتواند به اندپوینت کالبک سرور Songbird (`POST /api/uploads/webhook/processed`) متصل شود. در صورتی که سرور پشت ریورس پروکسی قرار دارد، متغیر `WEBHOOK_URL` (یا نام جایگزین `WEBHOOK_CALLBACK_URL`) را تنظیم کنید یا از صحت ارتباط شبکه ای میان ورکر و سرور اطمینان حاصل نمایید.
- **بررسی نصب FFmpeg**: در صورت استفاده از حالت پردازش محلی (`local`) یا اجرای مستقیم ورکر از سورس، از نصب بودن `ffmpeg` و `ffprobe` روی سیستم اطمینان حاصل کنید (`ffmpeg -version`).
- **فضای دیسک موقت**: اطمینان حاصل کنید که گره ورکر یا سرور فضای دیسک موقت کافی (در دایرکتوری موقت سیستم) برای دانلود، پردازش، ترنسکد و تولید تصویر thumbnail در اختیار دارد.
- **بررسی لاگ های سرویس و ورکر**: لاگ های سرور و ورکر را برای پیام های `[worker]` یا `[app-debug]` بررسی کنید.
- **فعال سازی لاگ دیباگ**: مقدار `APP_DEBUG=true` را در فایل `.env` سرور Songbird فعال کنید تا جزئیات کامل فرآیند آپلود، ارسال به ورکر و به روزرسانی زنده رویدادها را در کنسول مشاهده نمایید.

## مشکلات بیلد Docker {#docker-build-issues}

اگر `docker compose build` در `RUN npm ci` متوقف به نظر میرسد، معمولاً در حال دانلود وابستگی هاست. آن را با حالت progress ساده اجرا کنید تا ببینید چه اتفاقی میافتد:

```bash
docker compose -f docker-compose.yaml build --no-cache --progress=plain
```

بررسی های دیگر:

- سلامت کانتینر را تأیید کنید: `docker compose -f docker-compose.yaml ps`.
- لاگ های کانتینر را دنبال کنید: `docker compose -f docker-compose.yaml logs -f`.

## مشکلات TLS / گواهینامه {#tls--certificate-problems}

| نشانه | بررسی |
|---|---|
| مرورگر درباره گواهینامه نامعتبر هشدار میدهد | تأیید کنید که مسیرهای `ssl_certificate` / `ssl_certificate_key` در Nginx به فایل های معتبر اشاره میکنند. |
| تمدید Certbot شکست میخورد | `sudo certbot renew --dry-run` را اجرا کنید و قابلیت دسترسی DNS/پورت 80 را بررسی کنید. |
| گواهینامه مبتنی بر IP منقضی شده | روند گواهینامه IP از گواهینامه های کوتاه مدت (۶ روزه) استفاده میکند که توسط یک تایمر به طور خودکار تمدید میشوند؛ فعال بودن تایمر `songbird-lego-renew` را تأیید کنید. |
| هشدار خودامضا (پیشفرض Docker) | با گواهینامه خودامضای پیشفرض موردانتظار است. برای محیط تولید با گواهینامه های واقعی جایگزین کنید. |

برای گزینه های کامل راه اندازی به [گواهینامه های SSL](./SSL-Certificates.md) مراجعه کنید.

## کانال ریموت بازتاب نمیدهد {#remote-channel-not-mirroring}

| بررسی | جزئیات |
|---|---|
| فعال بودن قابلیت | `REMOTE_CHANNEL=true` باید روی این سرور تنظیم شده باشد. |
| اعتبارنامه های Telegram | API ID، API hash و رشته session باید پیکربندی شوند. `npm run remote:configure` را اجرا کنید. |
| عمومی بودن کانال | کانال ریموت برای کانال های خصوصی قفل است. |
| تاریخچه وارد نشده | در اولین فعال سازی، تنها پست های منتشرشده پس از آن نقطه بازتاب داده میشوند، نه تاریخچه. |
| صف متوقف شده | با `npm run db:chat:edit -- <channel> --resume-queue` از سر بگیرید. |
| نیاز به پراکسی | اگر سرور نمیتواند به Telegram دسترسی پیدا کند، یک پراکسی تنظیم کنید (`REMOTE_CHANNEL_TELEGRAM_PROXY_URL`). |

برای راهنمای کامل پیکربندی به [راه اندازی کانال ریموت](./Remote-Channel-Setup.md) مراجعه کنید.


## مشکلات پنل مدیریت {#مشکلات-پنل-مدیریت}

قابلیت های کنترل سرویس (ریستارت/توقف) و مشاهده لاگ های سیستم در پنل مدیریت بسته به نحوه استقرار Songbird به مجوزهای خاصی نیاز دارند.

:::tip

اگر با هر یک از مشکلات ذکرشده در زیر مواجه شدید، نصب مجدد اپلیکیشن از طریق [اسکریپت نصب](./Deployment-Script.md) باید مشکل را حل کند.

:::

### کنترل سرویس کار نمیکند

**استقرارهای Systemd:**
- کاربر سرویس به مجوزهای `sudo` برای دستورات `systemctl` نیاز دارد
- یک فایل sudoers برای کاربر songbird ایجاد کنید:
  ```bash
  sudo visudo -f /etc/sudoers.d/songbird
  ```
- این خطوط را اضافه کنید (اگر از کاربر سرویس متفاوتی استفاده میکنید `songbird` را جایگزین کنید):
  ```
  songbird ALL=(ALL) NOPASSWD: /bin/systemctl restart songbird.service
  songbird ALL=(ALL) NOPASSWD: /bin/systemctl stop songbird.service
  songbird ALL=(ALL) NOPASSWD: /bin/systemctl status songbird.service
  ```
- ذخیره کنید و مطمئن شوید مجوزها صحیح هستند:
  ```bash
  sudo chmod 0440 /etc/sudoers.d/songbird
  ```

**استقرارهای PM2:**
- پروسه باید به runtime PM2 دسترسی داشته باشد
- اطمینان حاصل کنید PM2 با همان کاربری که Songbird را اجرا میکند، در حال اجراست
- کاربر باید مجوز اجرای `pm2 restart` و `pm2 stop` را داشته باشد

### لاگ های سیستم نمایش داده نمیشوند

**Systemd:**
- کاربر سرویس به مجوز خواندن لاگ های journal و لاگ های nginx نیاز دارد
- کاربر را به گروه `systemd-journal` اضافه کنید:
  ```bash
  sudo usermod -a -G systemd-journal songbird
  ```
- کاربر را به گروه `adm` اضافه کنید:
  ```bash
  sudo usermod -a -G adm songbird
  ```

- سرویس را راه اندازی مجدد کنید:
  ```bash
  sudo systemctl restart songbird
  ```

**Docker:**
- اطمینان حاصل کنید که سوکت Docker mount شده است (همانند کنترل سرویس بالا)
- کانتینر باید برای خواندن لاگ ها از طریق API Docker دسترسی داشته باشد

### خطاهای مجوز فایل لاگ

اگر پنل مدیریت نمیتواند لاگ های ممیزی را در `data/logs/` بنویسد:

```bash
# اطمینان حاصل کنید دایرکتوری data و زیردایرکتوری ها متعلق به کاربر سرویس هستند
sudo chown -R songbird:songbird /opt/songbird/data

# یا برای نصب های Docker، مالکیت مناسب را در volume اطمینان حاصل کنید
docker compose exec songbird chown -R node:node /app/data
```


## هنوز گیر کرده اید؟

اگر هیچ یک از موارد بالا مشکل را حل نکرد، خروجی لاگ مرتبط را جمع آوری کرده و یک issue در [مخزن پروژه](https://github.com/bllackbull/Songbird/issues) باز کنید.
