# متغیرهای محیطی

:::tip

می‌توانید به‌راحتی بیشتر این متغیرها را از طریق پنل مدیریت بدون دست زدن به فایل `.env` پیکربندی کنید. برای اطلاعات بیشتر به [پنل مدیریت](./Admin-Panel.md) مراجعه کنید.

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
| `BIND_ADDRESS` | `string` | `localhost` | رابط شبکه مورد اتصال. برای VPS / شبکه‌های خصوصی از `localhost` استفاده کنید تا هنگام غیرفعال بودن فایروال، بک‌اند قابل افشا نباشد؛ و برای کانتینرهای Docker از `0.0.0.0` استفاده کنید. |
| `DATA_DIR` | `string` | `<project_root>/data` | مسیر مطلق پوشه داده (پایگاه داده، آپلودها، پشتیبان‌ها). این مقدار را روی پلتفرم‌های ابری (Railway، Render، Fly.io) به مسیر mount شده volume پایدار پلتفرم تنظیم کنید. |
| `DB_CLIENT` | `string` | `sqlite3` | درایور پایگاه داده (`sqlite3` یا `postgres`). |
| `POSTGRES_HOST` | `string` | `127.0.0.1` | آدرس هاست پایگاه داده PostgreSQL. |
| `POSTGRES_PORT` | `integer` | `5432` | پورت پایگاه داده PostgreSQL. |
| `POSTGRES_USER` | `string` | `postgres` | نام کاربری پایگاه داده PostgreSQL. |
| `POSTGRES_PASSWORD` | `string` | `postgres` | رمز عبور پایگاه داده PostgreSQL. |
| `POSTGRES_DB` | `string` | `songbird` | نام پایگاه داده PostgreSQL. |
| `POSTGRES_URL` | `string` | `null` | رشته اتصال اختیاری کامل برای PostgreSQL. |
| `POSTGRES_SSL` | `boolean` | `false` | فعالسازی SSL برای اتصالات PostgreSQL. |
| `REDIS_HOST` | `string` | `""` | آدرس اختیاری هاست Redis. در صورت تنظیم، Songbird از Redis برای صف های پس زمینه BullMQ (پردازش رسانه)، مدیریت نشست ها و pub/sub به جای مکانیزم درون-فرآیندی استفاده میکند. |
| `REDIS_PORT` | `integer` | `6379` | پورت اختیاری Redis. |
| `REDIS_URL` | `string` | `""` | آدرس URL اختیاری اتصال به Redis (مانند `redis://user:pass@host:port`). |
| `APP_ENV` | `string` | `production` | حالت اجرای سرور (`production` توصیه‌شده/پیش‌فرض است). |
| `APP_DEBUG` | `boolean` | `false` | فعال‌کردن لاگ‌های پرجزئیات اشکال‌زدایی سرور در ترمینال/stdout (خطوط `[app-debug]` برای رویدادهای ارسال پیام/آپلود/ترنسکد/متادیتا). |
| `SIGN_UP` | `boolean` | `true` | اجازه ایجاد حساب‌های جدید از طریق وب‌سایت (`/signup`). (`ACCOUNT_CREATION` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `ADMIN_PANEL` | `boolean` | `true` | فعال‌کردن رابط پنل مدیریت. وقتی `false` باشد، پنل مدیریت کاملاً غیرفعال و غیرقابل‌دسترس است. |
| `FILE_UPLOAD` | `boolean` | `true` | فعال/غیرفعال‌کردن همه آپلودها به‌صورت سراسری (فایل‌های چت + آواتارها). |
| `FILE_UPLOAD_MAX_SIZE_MB` | `integer` | `25` | حداکثر اندازه آپلود هر فایل (مگابایت). (`FILE_UPLOAD_MAX_SIZE` به‌عنوان جایگزین قدیمی به بایت پشتیبانی می‌شود.) |
| `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` | `integer` | `75` | سقف اندازه کل آپلود برای هر پیام (مگابایت). (`FILE_UPLOAD_MAX_TOTAL_SIZE` به‌عنوان جایگزین قدیمی به بایت پشتیبانی می‌شود.) |
| `FILE_UPLOAD_MAX_FILES` | `integer` | `10` | حداکثر تعداد فایل‌های آپلودشده در یک پیام. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `boolean` | `true` | تبدیل ویدیوهای آپلودشده به H.264/AAC MP4 و نگه‌داشتن فقط فایل تبدیل‌شده. به `ffmpeg` نیاز دارد. |
| `STORAGE_DRIVER` | `string` | `local` | درایور ذخیره سازی قابل پیکربندی (`local` برای دیسک محلی، `remote` برای ذخیره سازی ابری ریموت). مستندات [ذخیره سازی ابری](./Object-Storage.md) را ببینید. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی URL سرویس ذخیره سازی ابری (مانند AWS S3، Cloudflare R2، MinIO، ArvanCloud، Wasabi). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت (Bucket) ذخیره سازی. |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت (مانند `us-east-1`، `eu-central-1`). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | کلید دسترسی Storage Access Key ID. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید محرمانه Storage Secret Access Key. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | پیشوند URL اختیاری دامنه CDN (مانند `https://cdn.example.com`). |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | زمان انقضا به ثانیه برای Presigned URLها. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | فعال سازی ساختار URL به روش path-style (مقدار `true` برای MinIO، R2، ArvanCloud توصیه میشود). |
| `WORKER_URL` | `string` | `""` | آدرس پایه worker خارجی پردازش رسانه برای ترنسکد با HTTP push (مانند `https://worker.example.com`). |
| `WORKER_PORT` | `integer` | `8080` | پورت سرویس Media Worker مستقل (`worker/`). در صورت خالی بودن `WORKER_URL`، پلتفرم Songbird از این مقدار برای ساخت آدرس پیشفرض ورکر محلی (`http://127.0.0.1:8080`) استفاده میکند. |
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | حالت گردش کار پردازش مدیا (`auto`، `local`، `remote`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `30000` | مهلت زمانی تلاش مجدد به میلی ثانیه برای ارسال کارهای ترنسکد به ورکر ریموت پیش از انتقال به ورکر محلی (در حالت `auto`) یا عدم موفقیت ارسال (در حالت `remote`). |
| `WEBHOOK_SECRET` | `string` | *(تولید خودکار)* | توکن امنیتی هدر `x-songbird-webhook-secret` برای احراز هویت ارتباطات میان Songbird و Media Worker. |
| `WEBHOOK_URL` | `string` | `""` | آدرس بازخوانی (Callback) عمومی Webhook سرور Songbird ارسالی به workerها (مانند `https://songbird.example.com/api/uploads/webhook/processed`). |
| `STORAGE_ENCRYPTION_MODE` | `string` | `remote` | استراتژی رمزنگاری ذخیره سازی (`remote` برای سمت ارائه دهنده، `local` برای رمزنگاری سمت اپلیکیشن). |
| `MESSAGE_FILE_RETENTION` | `integer` | `7` | حذف خودکار فایل‌های پیام آپلودشده پس از N روز (`0` غیرفعال می‌کند). |
| `MESSAGE_TEXT_RETENTION` | `integer` | `0` | حذف خودکار پیام‌های فقط‌متنی پس از N روز (`0` غیرفعال می‌کند). |
| `MESSAGE_MAX_CHARS` | `integer` | `4000` | حداکثر طول پیام. |
| `REMOTE_CHANNEL` | `boolean` | `false` | فعال‌کردن worker سمت‌سرور کانال ریموت. |
| `REMOTE_CHANNEL_UI` | `boolean` | `true` | اجازه به مالکان کانال برای فعال‌کردن کانال ریموت در رابط کاربری. وقتی `false` باشد، کلید کانال ریموت برای همه کانال‌ها غیرفعال و قفل می‌شود، و کانال‌های موجود که آن را فعال دارند به‌طور خودکار در رابط کاربری خاموش‌شدن آن را می‌بینند. |
| `REMOTE_CHANNEL_MEDIA_STREAM` | `boolean` | `true` | اجازه به مالکان کانال برای فعال‌کردن گزینه «Stream Media Files» در رابط کاربری. وقتی `false` باشد، این گزینه برای همه کانال‌ها غیرفعال و قفل می‌شود. |
| `REMOTE_CHANNEL_TELEGRAM_API_ID` | `integer` | `0` | API ID مربوط به Telegram. |
| `REMOTE_CHANNEL_TELEGRAM_API_HASH` | `string` | `""` | API hash مربوط به Telegram. |
| `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` | `string` | `""` | StringSession مربوط به Telegram. با آن مانند یک رمز عبور رفتار کنید. |
| `REMOTE_CHANNEL_TELEGRAM_PROXY_URL` | `string` | `""` | نشانی پراکسی MTProto مربوط به Telegram. (`REMOTE_CHANNEL_PROXY_URL` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `REMOTE_CHANNEL_SONGBIRD_PROXY_URL` | `string` | `""` | پراکسی HTTP/HTTPS برای درخواست‌های خروجی از این سرور به سرورهای ریموت Songbird. |
| `REMOTE_CHANNEL_POLL_INTERVAL_MS` | `integer` | `5000` | فاصله زمانی بررسی منابع فعال کانال ریموت توسط poller. |
| `REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT` | `integer` | `50` | حداکثر تعداد پست‌های Telegram دریافت‌شده در هر poll برای هر منبع (`1`-`100`). |
| `REMOTE_CHANNEL_QUEUE_INTERVAL_MS` | `integer` | `1000` | فاصله زمانی پردازش پست‌های ریموت در انتظار توسط worker صف بازتاب. |
| `REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS` | `integer` | `10` | حداکثر تعداد تلاش مجدد پیش از آنکه یک پست ریموت در صف به‌عنوان ناموفق علامت‌گذاری شود. |
| `REMOTE_CHANNEL_QUEUE_BATCH_SIZE` | `integer` | `10` | حداکثر تعداد پست‌های ریموت در صف که در هر تیک worker پردازش می‌شوند (`1`-`50`). |
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
| `CHAT_HEALTH_CHECK_INTERVAL` | `integer` | `10000` | فاصله زمانی بررسی سلامت اتصال (میلی‌ثانیه). |
| `CHAT_SSE_RECONNECT_DELAY` | `integer` | `2000` | تأخیر پیش از اتصال مجدد SSE پس از خطا (میلی‌ثانیه). |
| `WS_HEARTBEAT_INTERVAL_MS` | `integer` | `30000` | فرکانس ارسال فریم‌های پینگ heartbeat وب‌سوکت به کلاینت‌ها (میلی‌ثانیه). |
| `WS_HEARTBEAT_TIMEOUT_MS` | `integer` | `10000` | مهلت زمانی پیش از قطع اتصال کلاینت‌های غیرپاسخگو وب‌سوکت (میلی‌ثانیه). |
| `CHAT_SEARCH_MAX_RESULTS` | `integer` | `5` | حداکثر تعداد کاربران نمایش‌داده‌شده در نتایج جستجو. |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_MB` | `integer` | `5` | حداکثر اندازه فایل صوتی (مگابایت) مجاز برای رمزگشایی شکل‌موج سمت‌کلاینت. (`CHAT_VOICE_WAVEFORM_MAX_DECODE_BYTES` به‌عنوان جایگزین قدیمی به بایت پشتیبانی می‌شود.) |
| `CHAT_VOICE_WAVEFORM_MAX_DECODE_SECONDS` | `integer` | `480` | حداکثر مدت‌زمان صوت (ثانیه) مجاز برای رمزگشایی شکل‌موج سمت‌کلاینت. |
| `NICKNAME_MAX_CHARS` | `integer` | `24` | حداکثر طول نام مستعار برای کاربران و گروه‌ها. (`NICKNAME_MAX` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `USERNAME_MAX_CHARS` | `integer` | `16` | حداکثر طول نام کاربری برای کاربران و گروه‌ها. (`USERNAME_MAX` به‌عنوان جایگزین قدیمی پشتیبانی می‌شود.) |
| `STORAGE_ENCRYPTION_KEY` | `string` | *(تولید خودکار)* | کلید پایدار رمزنگاری در حالت سکون. تغییر این مقدار بدون رمزگشایی اولیه داده‌های قدیمی، محتوای قبلاً رمزنگاری‌شده را غیرقابل‌خواندن می‌کند. |
| `ADMIN_API_TOKEN` | `string` | *(تولید خودکار)* | توکن احراز هویت برای نقاط پایانی API مدیریت محلی. |
| `VAPID_PUBLIC_KEY` | `string` | *(تولید خودکار)* | کلید عمومی Web Push (برای Push notifications موردنیاز است). |
| `VAPID_PRIVATE_KEY` | `string` | *(تولید خودکار)* | کلید خصوصی Web Push (برای Push notifications موردنیاز است). |
| `VAPID_SUBJECT` | `string` | *(تولید خودکار)* | مخاطب برای VAPID (ایمیل یا URL). توسط ارائه‌دهندگان push استفاده می‌شود. |
| `PUSH_PROXY_URL` | `string` | `""` | نشانی پراکسی برای تحویل Push notification. زمانی استفاده کنید که سرور شما نمی‌تواند مستقیماً به نقاط پایانی سرویس‌های push دسترسی پیدا کند. |

:::info

**Push notifications به HTTPS نیاز دارند** (به‌جز `localhost` برای توسعه). iOS به یک PWA نصب‌شده نیاز دارد (iOS 16.4+).

:::

:::info

**رمزنگاری در حالت سکون:** Songbird در اولین اجرا `STORAGE_ENCRYPTION_KEY` را به‌صورت خودکار تولید کرده و آن را در `.env` ذخیره می‌کند. آن مقدار را پایدار نگه دارید. هنگام راه‌اندازی، سرور در صورت نیاز پیام‌های ذخیره‌شده موجود، فایل‌های آپلود پیام و فایل‌های آواتار را به شکل رمزنگاری‌شده درمی‌آورد.

:::

## اعمال تغییرات {#apply-changes}

:::tip

می‌توانید به‌راحتی فایل ‎.env‎ خود را از طریق [اسکریپت نصب](./Deployment-Script.md) ویرایش کنید و این کار به‌طور خودکار تغییرات را اعمال کرده و اپلیکیشن را برای شما بازسازی می‌کند!

:::

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
