[English](/README.md) | [فارسی](/README.fa_IR.md)

<div align="center">

# <img src="./client/public/songbird-logo.svg"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

</div>

**Songbird یک پلتفرم پیام‌رسان سبک و امن برای میزبانی شخصی است که با هدف حمایت از آزادی دیجیتال در سراسر جهان ساخته شده است.**

این ریپازیتوری شامل اپلیکیشن پیام‌رسان Songbird است. سرور از دیتابیس فایل‌محور SQLite از طریق `sql.js` استفاده می‌کند و کلاینت با React + Vite ساخته شده است.

Songbird از پیام مستقیم، گروه، کانال، آپلود فایل، پیام صوتی، push notification و قابلیت اختیاری Remote Channel برای آینه‌کردن پست‌های Telegram داخل کانال‌های Songbird پشتیبانی می‌کند.

## ساختار ریپو

- `client/` — فرانت‌اند React/Vite
- `server/` — API مبتنی بر Express و راه‌اندازی دیتابیس `sql.js`
- `data/` — مسیر داده‌های اپلیکیشن که در زمان اجرا به‌صورت خودکار ساخته می‌شود و فایل `songbird.db` داخل آن قرار می‌گیرد

## نصب و راه‌اندازی

برای نصب برنامه سه روش وجود دارد:

- [اسکریپت نصب آسان](#اسکریپت-نصب-آسان) (پیشنهادی)
- [نصب از طریق Docker](#نصب-از-طریق-docker)
- [نصب دستی](#نصب-دستی)

**پیش‌نیازها (تست‌شده روی Ubuntu 22.04+):**

- یک سرور Ubuntu با دسترسی `sudo`
- یک دامنه که به IP عمومی سرور شما اشاره کند (پیشنهادی)

## اسکریپت نصب آسان

اگر می‌خواهید از اسکریپت نصب آسان استفاده کنید:

```bash
curl -fsSL https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh | bash
```

بعدا هم می‌توانید به‌صورت سراسری با این دستور اجراش کنید:

```bash
songbird-deploy
```

## نصب از طریق Docker

### 1. آماده‌سازی سیستم

این پکیج‌ها را نصب کنید:

```bash
sudo apt install -y ca-certificates gnupg lsb-release
```

کلید رسمی GPG داکر را اضافه کنید:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

ریپازیتوری apt داکر را اضافه کنید:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

موتور Docker و پلاگین Compose را نصب کنید:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

اختیاری: اجرای Docker بدون `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

اختیاری: بررسی صحت نصب:

```bash
docker --version
docker compose version
docker run hello-world
```

### 2. کلون کردن ریپازیتوری

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

اگر برنامه را با SSL اجرا می‌کنید، یک گواهی self-signed داخل پوشه `certs/` بسازید:

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

### 3. ساخت کانتینر

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build
```

اختیاری: بررسی وضعیت کانتینر:

```bash
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f
```

> [!IMPORTANT]
> Docker به‌صورت خودکار کانفیگ Nginx را طوری تنظیم می‌کند که با استفاده از گواهی self-signed که قبلا ساخته‌اید روی پورت ۴۴۳ اجرا شود.  
> برای تغییر و شخصی‌سازی کانفیگ Nginx، به بخش [تنظیم Nginx](#تنظیم-nginx) مراجعه کنید.

## نصب دستی

### 1. آماده‌سازی سیستم

پکیج‌های لازم را نصب و سیستم را به‌روزرسانی کنید:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

Node.js و npm را با یکی از روش‌های زیر نصب کنید:

**NodeSource (پیشنهادی):**

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**nvm:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash
```

**Volta:**

```bash
curl https://get.volta.sh | bash
volta install node@24.11.1 npm@11.6.4
```

### 2. کلون کردن ریپازیتوری

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

> [!NOTE]
> اگر Node.js را با `nvm` نصب کرده‌اید، این دستورها را هم اجرا کنید:
>
> ```bash
> nvm install
> nvm use
> ```

### 3. نصب وابستگی‌ها

```bash
cd /opt/songbird/server
npm install

cd /opt/songbird/client
npm install
npm run build
```

### 4. ساخت سرویس `systemd`

فایل `/etc/systemd/system/songbird.service` را با این محتوا بسازید:

```ini
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/songbird/server
ExecStart=/usr/bin/env node /opt/songbird/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> [!IMPORTANT]
> - اگر Node.js را با `nvm` نصب کرده‌اید، مقدار `ExecStart` را این‌طور تنظیم کنید:
>
> ```ini
> ExecStart=/root/.nvm/versions/node/v24.11.1/bin/node index.js
> ```
>
> - اگر Node.js را با `volta` نصب کرده‌اید، مقدار `ExecStart` را این‌طور تنظیم کنید:
>
> ```ini
> ExecStart=/root/.volta/bin/node index.js
> ```

**پیشنهادی: ساخت کاربر اختصاصی**

> [!WARNING]
> اگر Node.js را با `nvm` یا `volta` نصب کرده‌اید، این بخش را رد کنید.

برای امنیت بهتر، پیشنهاد می‌شود یک کاربر سیستمی اختصاصی بسازید و مالکیت مسیر پروژه را به آن منتقل کنید:

1. این خطوط را به فایل سرویس اضافه کنید:

```ini
User=songbird
Group=songbird
```

2. کاربر اختصاصی را بسازید:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin songbird
```

3. مالکیت مسیر پروژه را تغییر دهید:

```bash
sudo chown -R songbird:songbird /opt/songbird
git config --global --add safe.directory /opt/songbird
```

**سرویس را فعال و اجرا کنید:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird.service
```

## تنظیم Nginx

Songbird هم فرانت‌اند build شده و هم API را از طریق سرور Node ارائه می‌کند، پس Nginx فقط باید یک upstream را پروکسی کند: `http://127.0.0.1:SERVER_PORT`.

فایل `/etc/nginx/sites-available/songbird` را بسازید:

> [!IMPORTANT]
> - مقدار `proxy_pass` را با `SERVER_PORT` هماهنگ نگه دارید.
> - مقدار `listen` در Nginx را با `CLIENT_PORT` هماهنگ نگه دارید.
> - مقدار `client_max_body_size` را با `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` هماهنگ نگه دارید.

### فقط HTTP

اگر فعلا نمی‌خواهید SSL فعال کنید، از این کانفیگ استفاده کنید:

```nginx
server {
  listen 80 default_server;
  server_name example.com www.example.com;
  client_max_body_size 75m;

  location /api/events {
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

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}
```

اگر می‌خواهید مستقیما از IP سرور استفاده کنید، این خط:

```nginx
server_name example.com www.example.com;
```

را با این جایگزین کنید:

```nginx
server_name _;
```

### HTTPS

بعد از اینکه فایل‌های گواهی را داشتید، به این کانفیگ سوییچ کنید:

```nginx
server {
  listen 443 ssl default_server;
  server_name example.com www.example.com;
  client_max_body_size 75m;

  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;

  location /api/events {
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

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}

server {
  listen 80;
  server_name example.com www.example.com;
  return 301 https://$host$request_uri;
}
```

سایت را فعال کنید:

```bash
sudo ln -sf /etc/nginx/sites-available/songbird /etc/nginx/sites-enabled/songbird
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## گواهی SSL

HTTPS پیشنهاد می‌شود، مخصوصا اگر می‌خواهید از push notification استفاده کنید.

### گزینه A: استفاده از Certbot برای دامنه

برای نصب مبتنی بر دامنه، Certbot ساده‌ترین روش است:

```bash
sudo certbot certonly --nginx --https-port 443 -d example.com -d www.example.com
sudo certbot install --nginx --https-port 443 --cert-name example.com -d example.com -d www.example.com
sudo certbot renew --dry-run
```

اگر از پورت دیگری برای HTTPS استفاده می‌کنید، مقدار `443` را با `CLIENT_PORT` جایگزین کنید.

### گزینه B: استفاده از فایل‌های گواهی موجود

اگر از قبل فایل‌های `fullchain.pem` و `privkey.pem` را دارید، Nginx را به آن‌ها اشاره دهید:

```nginx
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/privkey.pem;
```

این روش برای دامنه و IP قابل استفاده است، به شرطی که گواهی شما آن مقصد را پوشش دهد.

### گزینه C: استفاده از اسکریپت نصب آسان

اسکریپت [`songbird-deploy`](#اسکریپت-نصب-آسان) می‌تواند کانفیگ Nginx را برایتان بسازد و SSL را هم تنظیم کند. اگر نمی‌خواهید این مراحل را دستی انجام دهید، این ساده‌ترین راه است.

## مشکلات پرتکرار

لاگ‌های Docker:

```bash
docker compose -f docker-compose.yaml logs -f
```

لاگ‌های سرویس `systemd`:

```bash
sudo journalctl -u songbird -f
```

لاگ‌های خطای Nginx:

```bash
nano /var/log/nginx/error.log
```

اگر Docker build روی مرحله `RUN npm ci` گیر کرده، معمولا در حال دانلود وابستگی‌هاست. برای دید بهتر از این دستور استفاده کنید:

```bash
docker compose -f docker-compose.yaml build --no-cache --progress=plain
```

## تنظیم متغیرهای محیطی

می‌توانید با ویرایش متغیرهای محیطی، رفتار برنامه را شخصی‌سازی کنید.

```bash
cd /opt/songbird
cp .env.example .env
nano .env
```

### مقادیر قابل تنظیم

| متغیر | نوع | پیش‌فرض | توضیح |
|---|---|---:|---|
| `SERVER_PORT` | `عدد` | `5174` | پورت سرور API. (`PORT` هم به‌عنوان fallback قدیمی پشتیبانی می‌شود.) |
| `CLIENT_PORT` | `عدد` | `80` | پورتی که Nginx روی آن گوش می‌دهد و کاربر به آن وصل می‌شود. |
| `APP_ENV` | `رشته` | `production` | حالت اجرای سرور. (`production` پیشنهاد می‌شود.) |
| `APP_DEBUG` | `بولی` | `false` | فعال‌سازی لاگ‌های دیباگ دقیق سرور در ترمینال. |
| `SIGN_UP` | `بولی` | `true` | اجازه ساخت حساب جدید از طریق وب‌سایت (`/signup`). (`ACCOUNT_CREATION` به‌عنوان fallback قدیمی پشتیبانی می‌شود.) |
| `FILE_UPLOAD` | `بولی` | `true` | فعال یا غیرفعال کردن همه آپلودها (فایل چت و آواتار). |
| `FILE_UPLOAD_MAX_SIZE_MB` | `عدد` | `25` | حداکثر اندازه هر فایل آپلودی به مگابایت. (`FILE_UPLOAD_MAX_SIZE` به‌عنوان fallback قدیمی برحسب بایت پشتیبانی می‌شود.) |
| `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` | `عدد` | `75` | سقف مجموع حجم فایل‌های یک پیام به مگابایت. (`FILE_UPLOAD_MAX_TOTAL_SIZE` به‌عنوان fallback قدیمی برحسب بایت پشتیبانی می‌شود.) |
| `FILE_UPLOAD_MAX_FILES` | `عدد` | `10` | حداکثر تعداد فایل در یک پیام. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `بولی` | `true` | تبدیل ویدیوهای آپلودشده به MP4 با H.264/AAC. نیازمند `ffmpeg`. |
| `MESSAGE_FILE_RETENTION` | `عدد` | `7` | حذف خودکار فایل‌های پیام بعد از N روز. (`0` یعنی غیرفعال) |
| `MESSAGE_TEXT_RETENTION` | `عدد` | `0` | حذف خودکار پیام‌های فقط متنی بعد از N روز. (`0` یعنی غیرفعال) |
| `MESSAGE_MAX_CHARS` | `عدد` | `4000` | حداکثر طول پیام. |
| `REMOTE_CHANNEL` | `بولی` | `false` | فعال‌کردن worker سمت سرور و تنظیمات owner کانال برای Remote Channel. |
| `REMOTE_CHANNEL_TELEGRAM_API_ID` | `عدد` | `0` | API ID تلگرام. |
| `REMOTE_CHANNEL_TELEGRAM_API_HASH` | `رشته` | `""` | API hash تلگرام. |
| `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` | `رشته` | `""` | مقدار Telegram StringSession. مثل رمز عبور از آن محافظت کنید. |
| `REMOTE_CHANNEL_PROXY_URL` | `رشته` | `""` | آدرس proxy برای اتصال MTProto تلگرام. از |
| `REMOTE_CHANNEL_POLL_INTERVAL_MS` | `عدد` | `5000` | فاصله زمانی بررسی sourceهای فعال Remote Channel در Telegram. (میلی‌ثانیه) |
| `REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT` | `عدد` | `50` | حداکثر تعداد پست تلگرام که در هر poll برای هر source خوانده می‌شود. (`1` تا `100`) |
| `REMOTE_CHANNEL_QUEUE_INTERVAL_MS` | `عدد` | `1000` | فاصله زمانی پردازش صف پست‌های تلگرام. (میلی‌ثانیه) |
| `REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS` | `عدد` | `10` | حداکثر تلاش دوباره قبل از اینکه یک پست remote ناموفق علامت بخورد. |
| `REMOTE_CHANNEL_QUEUE_BATCH_SIZE` | `عدد` | `10` | حداکثر تعداد پست remote که در هر اجرای worker پردازش می‌شود. (`1` تا `50`) |
| `REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS` | `عدد` | `300000` | زمانی که بعد از آن lock در حال پردازش قدیمی محسوب می‌شود و دوباره قابل تلاش است. (میلی‌ثانیه) |
| `CHAT_PENDING_TEXT_TIMEOUT` | `عدد` | `300000` | مدت‌زمانی که بعد از آن پیام متنی pending ناموفق علامت می‌خورد. (میلی‌ثانیه) |
| `CHAT_PENDING_FILE_TIMEOUT` | `عدد` | `1200000` | مدت‌زمان timeout برای آپلود فایل یا پیام فایل pending. (میلی‌ثانیه) |
| `CHAT_PENDING_RETRY_INTERVAL` | `عدد` | `4000` | فاصله تلاش مجدد برای پیام‌های pending هنگام اتصال. (میلی‌ثانیه) |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL` | `عدد` | `1000` | فاصله بررسی timeout برای پیام‌های pending. (میلی‌ثانیه) |
| `CHAT_CACHE_TTL` | `عدد` | `24` | مدت اعتبار کش محلی لیست چت‌ها و پیام‌ها. (ساعت) |
| `CHAT_MESSAGE_FETCH_LIMIT` | `عدد` | `300` | حداکثر تعداد پیام در هر بار دریافت اولیه یا آخرین پنجره. |
| `CHAT_MESSAGE_PAGE_SIZE` | `عدد` | `60` | تعداد پیام هنگام بارگذاری پیام‌های قدیمی‌تر. |
| `CHAT_LIST_REFRESH_INTERVAL` | `عدد` | `20000` | فاصله رفرش پس‌زمینه لیست چت‌ها. (میلی‌ثانیه) |
| `CHAT_PRESENCE_PING_INTERVAL` | `عدد` | `5000` | فاصله heartbeat برای presence. (میلی‌ثانیه) |
| `CHAT_PEER_PRESENCE_POLL_INTERVAL` | `عدد` | `3000` | فاصله poll برای presence طرف مقابل. (میلی‌ثانیه) |
| `CHAT_HEALTH_CHECK_INTERVAL` | `عدد` | `10000` | فاصله health check اتصال. (میلی‌ثانیه) |
| `CHAT_SSE_RECONNECT_DELAY` | `عدد` | `2000` | تاخیر قبل از اتصال دوباره SSE بعد از خطا. (میلی‌ثانیه) |
| `CHAT_SEARCH_MAX_RESULTS` | `عدد` | `5` | حداکثر تعداد کاربر در نتایج جستجو. |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_MB` | `عدد` | `5` | حداکثر حجم فایل صوتی مجاز برای decode waveform در کلاینت به مگابایت. (`CHAT_VOICE_WAVEFORM_MAX_DECODE_BYTES` به‌عنوان fallback قدیمی برحسب بایت پشتیبانی می‌شود.) |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS` | `عدد` | `480` | حداکثر طول فایل صوتی مجاز برای decode waveform در کلاینت. |
| `NICKNAME_MAX_CHARS` | `عدد` | `24` | حداکثر طول nickname برای کاربران و گروه‌ها. (`NICKNAME_MAX` به‌عنوان fallback قدیمی پشتیبانی می‌شود.) |
| `USERNAME_MAX_CHARS` | `عدد` | `16` | حداکثر طول username برای کاربران و گروه‌ها. (`USERNAME_MAX` به‌عنوان fallback قدیمی پشتیبانی می‌شود.) |
| `STORAGE_ENCRYPTION_KEY` | `رشته` | خودکار تولید می‌شود | کلید ثابت برای رمزنگاری داده‌های ذخیره‌شده. تغییر این مقدار بدون رمزگشایی داده‌های قبلی باعث غیرقابل‌خواندن شدن آن‌ها می‌شود. |
| `VAPID_PUBLIC_KEY` | `رشته` | خودکار تولید می‌شود | کلید عمومی Web Push. |
| `VAPID_PRIVATE_KEY` | `رشته` | خودکار تولید می‌شود | کلید خصوصی Web Push. |
| `VAPID_SUBJECT` | `رشته` | خودکار تولید می‌شود | اطلاعات تماس VAPID (ایمیل یا URL) برای سرویس‌های push. |

> [!NOTE]
> **Push notification به HTTPS نیاز دارد**، به جز `localhost` در حالت توسعه. در iOS هم نیاز به PWA نصب‌شده دارید. (`iOS 16.4+`)

> [!IMPORTANT]
> **رمزنگاری در حالت ذخیره:** Songbird در اولین اجرا مقدار `STORAGE_ENCRYPTION_KEY` را به‌صورت خودکار تولید می‌کند و در `.env` ذخیره می‌کند. این مقدار باید ثابت بماند. در زمان startup، سرور پیام‌ها، فایل‌ها و avatarهای قبلی را در صورت نیاز به‌صورت رمزنگاری‌شده backfill می‌کند.

### اعمال تغییرات

**1. در حالت Docker:**

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --force-recreate songbird
```

اگر تغییر شما روی مقدارهای build-time کلاینت اثر می‌گذارد، ایمیج را هم rebuild کنید:

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build --force-recreate songbird
```

**2. در حالت دستی (`systemd`):**

کلاینت را دوباره build کنید:

```bash
cd /opt/songbird/client
npm run build
```

سپس سرویس را ری‌استارت کنید:

```bash
sudo systemctl restart songbird
```

**3. Nginx را reload کنید:**

```bash
sudo systemctl reload nginx
```

> [!TIP]
> می‌توانید فایل `.env` را از طریق اسکریپت [songbird-deploy](#اسکریپت-نصب-آسان) ویرایش کنید تا تغییرات به‌صورت خودکار اعمال و در صورت نیاز rebuild شوند.


## راه‌اندازی Remote Channel

Remote Channel به یک کانال عمومی Songbird اجازه می‌دهد پست‌های یک کانال Telegram را آینه کند. سرور Telegram را poll می‌کند، پست‌های جدید را وارد صف می‌کند، پیام‌های Songbird را با مالک کانال می‌سازد و وضعیت retry را در دیتابیس نگه می‌دارد. فقط مالک کانال می‌تواند source کانال را تنظیم کند.

در اولین فعال‌سازی، Songbird وضعیت source را از آخرین پست Telegram شروع می‌کند و تاریخچه قبلی کانال را import نمی‌کند. پست‌هایی که بعد از آن منتشر شوند آینه می‌شوند.

### 1. ساخت credential های Telegram

یک اپ [Telegram](https://my.telegram.org/apps) بسازید تا API ID و API hash آماده باشد. اگر سرور شما برای اتصال به Telegram به proxy نیاز دارد، URL آن را هم آماده کنید. schemeهای پشتیبانی‌شده شامل `http://`، `https://`، `socks4://`، `socks5://` و `mtproxy://` هستند.

> [!WARNING]
> من پیشنهاد میکنم که از اکانت اصلی و شخصی تلگرام بای این کار استفاده نکنید.

### 2. تنظیم Remote Channel

ابزار تنظیم را اجرا کنید و promptها را دنبال کنید. این ابزار API ID، API hash، proxy URL اختیاری و کد ورود Telegram را می‌گیرد، سپس تنظیمات Remote Channel را داخل `.env` می‌نویسد. در نصب‌های systemd، بعد از ذخیره‌سازی، `songbird.service` را هم ری‌استارت می‌کند.

```bash
cd /opt/songbird
npm run remote:configure
```

برای Docker:

```bash
cd /opt/songbird
touch .env
docker compose run --rm -v "$PWD/.env:/app/.env" songbird npm --prefix /app/server run remote:configure
```

session ساخته‌شده را خصوصی نگه دارید. این session به Songbird اجازه می‌دهد کانال‌های تلگرامی را که اکانت واردشده به آن‌ها دسترسی دارد بخواند.

### 3. اتصال کانال Songbird

در Songbird یک **کانال عمومی** بسازید یا ویرایش کنید، **Remote Channel** را فعال کنید، **Telegram** را انتخاب کنید و source را به شکل `@channelname` یا `https://t.me/channelname` وارد کنید. Remote Channel برای کانال‌های خصوصی قفل است.

تنظیمات اختیاری کانال:

- **Sync Channel Metadata** عنوان و avatar کانال Telegram را داخل کانال Songbird کپی می‌کند.
- **Stream Media Files** وقتی `FILE_UPLOAD=true` باشد mediaهای Telegram را داخل آپلودهای Songbird ذخیره می‌کند. این گزینه از محدودیت حجم/تعداد آپلود، retention فایل، رمزنگاری در حالت ذخیره و تنظیمات transcoding ویدیو پیروی می‌کند. پست‌های آینه‌شده فقط متنی از `MESSAGE_TEXT_RETENTION` پیروی می‌کنند.
- پست‌هایی که متن یا caption ندارند فقط وقتی آینه می‌شوند که stream media فعال باشد و حداقل یک فایل media پشتیبانی‌شده قابل ذخیره باشد.

## به‌روزرسانی نسخه نصب‌شده

> [!WARNING]
> قبل از آپدیت از دیتابیس بکاپ بگیرید:
>
> ```bash
> cd /opt/songbird/server
> npm run db:backup
> # یا در حالت Docker:
> docker compose exec songbird npm --prefix /app/server run db:backup
> ```

> [!TIP]
> اسکریپت [songbird-deploy](#اسکریپت-نصب-آسان) می‌تواند این فرایند را همراه با بکاپ و rebuild برایتان ساده‌تر کند.

### Docker + Compose

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

### نصب دستی (`systemd`)

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

> [!NOTE]
> برای پروژه‌های بزرگ‌تر می‌توانید از روش‌هایی مثل blue-green deployment یا PM2 استفاده کنید، اما برای بیشتر به‌روزرسانی‌ها همین روند ساده کافی است.

## دستورات دیتابیس

می‌توانید در مسیر `/opt/songbird/server` از این دستورات برای مدیریت دیتابیس استفاده کنید:

> [!TIP]
> این دستورات از طریق [songbird-deploy](#اسکریپت-نصب-آسان) هم در دسترس هستند.

- بکاپ از دیتابیس: `npm run db:backup`
- بازیابی بکاپ: `npm run db:restore`
- وکیوم دیتابیس: `npm run db:vacuum`
- راهنمای دستورات دیتابیس: `npm run db:help`
- اجرای migrationها: `npm run db:migrate`
- ریست دیتابیس: `npm run db:reset`
- حذف دیتابیس: `npm run db:delete`
- ساخت گروه یا کانال: `npm run db:chat:create`
- اضافه کردن کاربر به گروه یا کانال: `npm run db:chat:add`
- ویرایش گروه یا کانال یا انتقال مالکیت: `npm run db:chat:edit`
- حذف چت‌ها: `npm run db:chat:delete`
- حذف فایل‌ها: `npm run db:file:delete` (برای حذف همه نیاز به `--all` دارد)
- ویرایش کاربر: `npm run db:user:edit`
- بن یا آنبن کاربر: `npm run db:user:ban`
- حذف کاربران: `npm run db:user:delete`
- ساخت یک کاربر: `npm run db:user:create`
- ساخت کاربران تصادفی: `npm run db:user:generate`
- ساخت پیام‌های تصادفی برای یک چت: `npm run db:message:generate`
- مشاهده خلاصه کلی: `npm run db:inspect`
- مشاهده فقط چت‌ها: `npm run db:chat:inspect`
- مشاهده فقط کاربران: `npm run db:user:inspect`
- مشاهده فقط فایل‌ها: `npm run db:file:inspect`
- مسیر بکاپ‌ها: `data/backups/`

### تایید ایمنی و `-y`

دستورهای مخرب به‌صورت پیش‌فرض تایید ایمنی می‌خواهند.

- در حالت تعاملی: `y/yes` یا `n/no`
- در حالت غیرتعاملی: از فلگ force استفاده کنید
- فلگ‌های پشتیبانی‌شده: `-y` و `--yes`

مثال‌ها:

```bash
cd server
npm run db:help
npm run db:backup
npm run db:restore -- -y
npm run db:vacuum -- -y
npm run db:reset -y
npm run db:delete --yes
npm run db:chat:delete 12 -y
npm run db:chat:delete -- --all -y
npm run db:file:delete -- --all -y
npm run db:file:delete 42 -y
npm run db:file:delete FILE_NAME -y
npm run db:user:delete songbird.sage -y
npm run db:user:delete -- --all -y
```

### مثال استفاده از اسکریپت‌های ادمین

ساخت کاربر:

```bash
cd server
npm run db:user:create -- --nickname "Songbird Sage" --username songbird.sage --password "12345678"

# حالت positional:
npm run db:user:create -- "Songbird Sage" songbird.sage "12345678"
```

ساخت کاربران تصادفی:

```bash
cd server
# ممکن است npm بدون "--" هشدار بدهد.
# این فرم مطمئن‌تر است:
npm run db:user:generate -- --count=50 --password="12345678"

# فرم قدیمی هم در بعضی حالت‌ها کار می‌کند:
npm run db:user:generate -- --count 50 --password "12345678"
```

ساخت گروه یا کانال:

```bash
cd server
npm run db:chat:create -- --type group --name "Core Team" --owner songbird.sage --username core.team --visibility private --users songbird.sage2,songbird.sage3

npm run db:chat:create -- --type channel --name "Announcements" --owner songbird.sage --username announcements
```

اضافه کردن کاربرها به گروه یا کانال:

```bash
cd server
npm run db:chat:add -- core.team songbird.sage2 songbird.sage3

# می‌توانید از id چت هم استفاده کنید:
npm run db:chat:add -- 1 --all
```

ویرایش گروه یا کانال:

```bash
cd server
npm run db:chat:edit -- core.team --name "Core Team HQ" --visibility public --color "#14b8a6"

# می‌توانید از id چت هم استفاده کنید:
npm run db:chat:edit -- 1 --owner songbird.sage2
```

ویرایش کاربر:

```bash
cd server
npm run db:user:edit -- songbird.sage --nickname "Songbird Sage" --color "#ff6b6b"

# می‌توانید از id کاربر هم استفاده کنید:
npm run db:user:edit -- 1 --username songbird.admin --status invisible
```

بن یا آنبن کاربر:

```bash
cd server
npm run db:user:ban -- songbird.sage

# اجرای دوباره همین دستور وضعیت را برمی‌گرداند:
npm run db:user:ban -- songbird.sage
```

بازیابی بکاپ:

```bash
cd server
npm run db:restore -- -y
```

فرمت بکاپ:

```text
songbird-backup-YYYY-MM-DDTHH-MM-SS-sssZ.zip
|- .env
`- data/
   |- songbird.db
   `- uploads/
```

ساخت پیام‌های تصادفی در یک چت بین دو کاربر:

```bash
cd server
npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7

# می‌توانید از id کاربر هم استفاده کنید:
npm run db:message:generate -- 1 2 5 300 7

# فرم named args:
npm run db:message:generate -- --chatId 1 --userA songbird.sage --userB songbird.sage2 --count 300 --days 7
```

مشاهده خلاصه دیتابیس:

```bash
cd server
npm run db:inspect
npm run db:inspect -- 50
npm run db:chat:inspect
npm run db:user:inspect
npm run db:file:inspect
```

### استفاده از دستورات در Docker

می‌توانید اسکریپت‌های npm را داخل کانتینر اجرا کنید:

```bash
docker compose exec songbird npm --prefix /app/server run db:backup
docker compose exec songbird npm --prefix /app/server run db:migrate
docker compose exec songbird npm --prefix /app/server run db:inspect
```

## اجرا پشت دامنه و subpath

اگر می‌خواهید برنامه را روی subpath اجرا کنید، مثلا `example.com/songbird/`، باید کانفیگ Nginx و مقدار `base` در تنظیمات build کلاینت را متناسب با آن تغییر دهید.

## نویسنده

- سازنده: [@bllackbull](https://github.com/bllackbull)

## مشارکت

- از تقاضای مشارکت، استقبال میشود.
- اگر قصد مشارکت دارید، اول در این آدرس issue باز کنید: `https://github.com/bllackbull/Songbird/issues`
- برای هماهنگی مستقیم، قبل از باز کردن PR با [@bllackbull](https://github.com/bllackbull) در GitHub در ارتباط باشید.
- برای اطلاعات بیشتر، راهنمای [Contributing](/CONTRIBUTING.md) را ببینید.

## حمایت

اگر این پروژه را دوست دارید، می‌توانید از آن حمایت کنید:

<a href="https://nowpayments.io/donation?api_key=0b61dd3e-6508-4849-ad92-1dde65442937" target="_blank" rel="noreferrer noopener">
    <img src="https://nowpayments.io/images/embeds/donation-button-black.svg" alt="Crypto donation button by NOWPayments">
</a>

### TRX:

```
TPf1bEhipKpGkjo5N2Scj9nufNNh5TNrwX
```

### USDT (TRC20):

```
0x63313383611BbE11f4fEc139c14ad0b70281b822
```

### BTC:

```
bc1q9hupvcc39juhf0k7rgzn6phn8s8jez365kzmuj
```

### TON:

```
UQDzQ3xbWzKQvw8X8sWU82dksBeYqTHrT9sLzhBOyaESPjVy
```

## لایسنس

این پروژه تحت لایسنس MIT منتشر شده است. برای جزئیات بیشتر، فایل [LICENSE](LICENSE) را ببینید.
