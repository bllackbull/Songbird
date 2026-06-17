# متغیرهای محیطی

:::tip

می‌توانید به‌راحتی فایل ‎.env‎ خود را از طریق [اسکریپت نصب](./Deployment-Script.md) ویرایش کنید و این کار به‌طور خودکار تغییرات را اعمال کرده و اپلیکیشن را برای شما بازسازی می‌کند!

:::

می‌توانید متغیرهای محیطی را برای سفارشی‌سازی رفتار اپلیکیشن پیکربندی کنید.

```bash
cd /opt/songbird
cp .env.example .env
nano .env
```

## مقادیر قابل پیکربندی

| متغیر | نوع | پیش‌فرض | توضیح |
|---|---|---:|---|
| `SERVER_PORT` | `integer` | `5174` | پورت سرور API. (`PORT` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `CLIENT_PORT` | `integer` | `80` | پورت listen مربوط به Nginx (همان چیزی که کاربران به آن متصل می‌شوند). |
| `APP_ENV` | `string` | `production` | حالت اجرای سرور (`production` توصیه‌شده/پیش‌فرض است). |
| `APP_DEBUG` | `boolean` | `false` | فعال‌کردن لاگ‌های پرجزئیات اشکال‌زدایی سرور در ترمینال/stdout (خطوط `[app-debug]` برای رویدادهای ارسال پیام/آپلود/ترنسکد/متادیتا). |
| `SIGN_UP` | `boolean` | `true` | اجازه ایجاد حساب‌های جدید از طریق وب‌سایت (`/signup`). (`ACCOUNT_CREATION` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `FILE_UPLOAD` | `boolean` | `true` | فعال/غیرفعال‌کردن همه آپلودها به‌صورت سراسری (فایل‌های چت + آواتارها). |
| `FILE_UPLOAD_MAX_SIZE_MB` | `integer` | `25` | حداکثر اندازه آپلود هر فایل (مگابایت). (`FILE_UPLOAD_MAX_SIZE` به‌عنوان جایگزین قدیمی به بایت پشتیبانی می‌شود.) |
| `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` | `integer` | `75` | سقف اندازه کل آپلود برای هر پیام (مگابایت). (`FILE_UPLOAD_MAX_TOTAL_SIZE` به‌عنوان جایگزین قدیمی به بایت پشتیبانی می‌شود.) |
| `FILE_UPLOAD_MAX_FILES` | `integer` | `10` | حداکثر تعداد فایل‌های آپلودشده در یک پیام. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `boolean` | `true` | تبدیل ویدیوهای آپلودشده به H.264/AAC MP4 و نگه‌داشتن فقط فایل تبدیل‌شده. به `ffmpeg` نیاز دارد. |
| `MESSAGE_FILE_RETENTION` | `integer` | `7` | حذف خودکار فایل‌های پیام آپلودشده پس از N روز (`0` غیرفعال می‌کند). |
| `MESSAGE_TEXT_RETENTION` | `integer` | `0` | حذف خودکار پیام‌های فقط‌متنی پس از N روز (`0` غیرفعال می‌کند). |
| `MESSAGE_MAX_CHARS` | `integer` | `4000` | حداکثر طول پیام. |
| `REMOTE_CHANNEL` | `boolean` | `false` | فعال‌کردن worker سمت‌سرور کانال راه دور. |
| `REMOTE_CHANNEL_UI` | `boolean` | `true` | اجازه به مالکان کانال برای فعال‌کردن کانال راه دور در رابط کاربری. وقتی `false` باشد، کلید کانال راه دور برای همه کانال‌ها غیرفعال و قفل می‌شود، و کانال‌های موجود که آن را فعال دارند به‌طور خودکار در رابط کاربری خاموش‌شدن آن را می‌بینند. |
| `REMOTE_CHANNEL_MEDIA_STREAM` | `boolean` | `true` | اجازه به مالکان کانال برای فعال‌کردن گزینه «Stream Media Files» در رابط کاربری. وقتی `false` باشد، این گزینه برای همه کانال‌ها غیرفعال و قفل می‌شود. |
| `REMOTE_CHANNEL_TELEGRAM_API_ID` | `integer` | `0` | API ID مربوط به Telegram. |
| `REMOTE_CHANNEL_TELEGRAM_API_HASH` | `string` | `""` | API hash مربوط به Telegram. |
| `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` | `string` | `""` | StringSession مربوط به Telegram. با آن مانند یک رمز عبور رفتار کنید. |
| `REMOTE_CHANNEL_TELEGRAM_PROXY_URL` | `string` | `""` | نشانی پراکسی MTProto مربوط به Telegram. (`REMOTE_CHANNEL_PROXY_URL` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `REMOTE_CHANNEL_SONGBIRD_PROXY_URL` | `string` | `""` | پراکسی HTTP/HTTPS برای درخواست‌های خروجی از این سرور به سرورهای راه دور Songbird. |
| `REMOTE_CHANNEL_POLL_INTERVAL_MS` | `integer` | `5000` | فاصله زمانی بررسی منابع فعال کانال راه دور توسط poller. |
| `REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT` | `integer` | `50` | حداکثر تعداد پست‌های Telegram دریافت‌شده در هر poll برای هر منبع (`1`-`100`). |
| `REMOTE_CHANNEL_QUEUE_INTERVAL_MS` | `integer` | `1000` | فاصله زمانی پردازش پست‌های راه دور در انتظار توسط worker صف بازتاب. |
| `REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS` | `integer` | `10` | حداکثر تعداد تلاش مجدد پیش از آنکه یک پست راه دور در صف به‌عنوان ناموفق علامت‌گذاری شود. |
| `REMOTE_CHANNEL_QUEUE_BATCH_SIZE` | `integer` | `10` | حداکثر تعداد پست‌های راه دور در صف که در هر تیک worker پردازش می‌شوند (`1`-`50`). |
| `REMOTE_CHANNEL_QUEUE_CONCURRENCY` | `integer` | `3` | تعداد آیتم‌های در صف که به‌صورت هم‌زمان در هر تیک worker پردازش می‌شوند. همچنین تعداد منابعی که به‌صورت موازی poll می‌شوند را کنترل می‌کند. |
| `REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS` | `integer` | `300000` | سنی که پس از آن یک قفل صف درحال‌پردازش کهنه تلقی شده و می‌تواند دوباره تلاش شود. |
| `CHAT_PENDING_TEXT_TIMEOUT` | `integer` | `300000` | علامت‌گذاری پیام متنی در انتظار به‌عنوان ناموفق پس از این مهلت (میلی‌ثانیه). |
| `CHAT_PENDING_FILE_TIMEOUT` | `integer` | `1200000` | علامت‌گذاری پیام فایل در انتظار به‌عنوان ناموفق / مهلت XHR برای آپلودها (میلی‌ثانیه). |
| `CHAT_PENDING_RETRY_INTERVAL` | `integer` | `4000` | آهنگ تلاش مجدد برای ارسال‌های در انتظار هنگام اتصال (میلی‌ثانیه). |
| `CHAT_PENDING_STATUS_CHECK_INTERVAL` | `integer` | `1000` | فاصله زمانی بررسی مهلت پیام‌های در انتظار (میلی‌ثانیه). |
| `CHAT_CACHE_TTL` | `integer` | `24` | زمان زنده‌بودن کش محلی برای فهرست چت‌ها و کش پیام‌ها (ساعت). |
| `CHAT_MESSAGE_FETCH_LIMIT` | `integer` | `60` | حداکثر تعداد پیام‌های درخواستی در هر دریافت چت (پنجره اولیه/جدیدترین). |
| `CHAT_MESSAGE_PAGE_SIZE` | `integer` | `60` | اندازه صفحه برای بارگذاری پیام‌های قدیمی‌تر هنگام اسکرول به بالا. |
| `CHAT_LIST_REFRESH_INTERVAL` | `integer` | `20000` | فاصله زمانی تازه‌سازی پس‌زمینه فهرست چت‌ها (میلی‌ثانیه). |
| `CHAT_PRESENCE_PING_INTERVAL` | `integer` | `5000` | فاصله زمانی heartbeat حضور (میلی‌ثانیه). |
| `CHAT_PEER_PRESENCE_POLL_INTERVAL` | `integer` | `3000` | فاصله زمانی poll حضور همتای فعال (میلی‌ثانیه). |
| `CHAT_HEALTH_CHECK_INTERVAL` | `integer` | `10000` | فاصله زمانی بررسی سلامت اتصال (میلی‌ثانیه). |
| `CHAT_SSE_RECONNECT_DELAY` | `integer` | `2000` | تأخیر پیش از اتصال مجدد SSE پس از خطا (میلی‌ثانیه). |
| `CHAT_SEARCH_MAX_RESULTS` | `integer` | `5` | حداکثر تعداد کاربران نمایش‌داده‌شده در نتایج جستجو. |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_MB` | `integer` | `5` | حداکثر اندازه فایل صوتی (مگابایت) مجاز برای رمزگشایی شکل‌موج سمت‌کلاینت. (`CHAT_VOICE_WAVEFORM_MAX_DECODE_BYTES` به‌عنوان جایگزین قدیمی به بایت پشتیبانی می‌شود.) |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS` | `integer` | `480` | حداکثر مدت‌زمان صوت (ثانیه) مجاز برای رمزگشایی شکل‌موج سمت‌کلاینت. |
| `NICKNAME_MAX_CHARS` | `integer` | `24` | حداکثر طول نام مستعار برای کاربران و گروه‌ها. (`NICKNAME_MAX` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `USERNAME_MAX_CHARS` | `integer` | `16` | حداکثر طول نام کاربری برای کاربران و گروه‌ها. (`USERNAME_MAX` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `STORAGE_ENCRYPTION_KEY` | `string` | تولیدشده خودکار | کلید پایدار رمزنگاری در حالت سکون. تغییر این مقدار بدون رمزگشایی اولیه داده‌های قدیمی، محتوای قبلاً رمزنگاری‌شده را غیرقابل‌خواندن می‌کند. |
| `VAPID_PUBLIC_KEY` | `string` | تولیدشده خودکار | کلید عمومی Web Push (برای Push notifications موردنیاز است). |
| `VAPID_PRIVATE_KEY` | `string` | تولیدشده خودکار | کلید خصوصی Web Push (برای Push notifications موردنیاز است). |
| `VAPID_SUBJECT` | `string` | تولیدشده خودکار | مخاطب برای VAPID (ایمیل یا URL). توسط ارائه‌دهندگان push استفاده می‌شود. |
| `PUSH_PROXY_URL` | `string` | `""` | نشانی پراکسی برای تحویل Push notification. زمانی استفاده کنید که سرور شما نمی‌تواند مستقیماً به نقاط پایانی سرویس‌های فشاری دسترسی پیدا کند. |

:::info

**Push notifications به HTTPS نیاز دارند** (به‌جز `localhost` برای توسعه). iOS به یک PWA نصب‌شده نیاز دارد (iOS 16.4+).

:::

:::info

**رمزنگاری در حالت سکون:** Songbird در اولین اجرا `STORAGE_ENCRYPTION_KEY` را به‌صورت خودکار تولید کرده و آن را در `.env` ذخیره می‌کند. آن مقدار را پایدار نگه دارید. هنگام راه‌اندازی، سرور در صورت نیاز پیام‌های ذخیره‌شده موجود، فایل‌های آپلود پیام و فایل‌های آواتار را به شکل رمزنگاری‌شده درمی‌آورد.

:::

## اعمال تغییرات {#apply-changes}

**۱. نصب با Docker:**

```bash
cd /opt/songbird
# Apply updated runtime env vars from .env
docker compose -f docker-compose.yaml up -d --force-recreate songbird
```

اگر تغییر شما روی مقادیر کلاینت در زمان بیلد تأثیر می‌گذارد، تصویر (image) را نیز دوباره بسازید:

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build --force-recreate songbird
```

**۲. نصب دستی (systemd):**

بازسازی کلاینت:

```bash
cd /opt/songbird/client
npm run build
```

راه‌اندازی مجدد سرویس systemd:

```bash
sudo systemctl restart songbird
```

**۳. بارگذاری مجدد Nginx:**

```bash
sudo systemctl reload nginx
```
