# ورکر مدیا (Media Worker)

پلتفرم Songbird شامل یک میکروسرویس اختصاصی، سبک، بدون حالت (Stateless) و مبتنی بر HTTP Push به نام **Media Worker** (در مسیر `worker/`) است که برای انتقال بار پردازشی سنگین ترنسکد ویدیو، بهینه سازی Faststart، استخراج تصویر thumbnail و استخراج متادیتای رسانه از سرور اصلی چت طراحی شده است.

چه این سرویس به عنوان یک پردازش پس زمینه داخلی اجرا شود و چه به عنوان یک میکروسرویس مستقل ابری روی سرورها یا کانتینرهای جداگانه مستقر گردد، Media Worker تضمین میکند که پردازش فایل های رسانه ای با سرعت و اطمینان بالا بدون افت کارایی سرور اصلی چت انجام پذیرد.

## بررسی اجمالی و قابلیت های کلیدی

- **بدون حالت و مستقل از پایگاه داده (Database-Agnostic)**: سرویس Media Worker هیچ اتصال مستقیمی به SQLite یا PostgreSQL ندارد. تمامی ارتباطات با سرور Songbird از طریق Endpointهای HTTP REST (مانند `POST /transcode`) و فراخوانی Webhook صورت میگیرد (`POST /api/uploads/webhook/processed`). بنابراین این ورکر در تمامی پیکربندی های دیتابیس به صورت یکسان کار میکند.
- **پشتیبانی از دو موتور ذخیره سازی**: پشتیبانی بومی هم از ذخیره سازی دیسک محلی (`STORAGE_DRIVER=local`) و هم از ذخیره سازی ابری سازگار با S3 (`STORAGE_DRIVER=remote` مانند Cloudflare R2، AWS S3، MinIO، ArvanCloud، Wasabi و غیره).
- **ترنسکد هوشمند ویدیو**:
  - بررسی و اندازه گیری خودکار فرمت ویدیو، کدک ها، ابعاد و مدت زمان با استفاده از `ffprobe`.
  - تبدیل فرمت های ناسازگار یا با بیتریت بالا (مانند MKV، AVI، WebM، HEVC، ProRes و غیره) به فرمت ویدیویی استاندارد وب H.264 همراه با صدای AAC (با پسوند `.mp4`).
  - **بهینه سازی هوشمند Faststart**: چنانچه ویدیوی آپلودشده از پیش سازگار با وب باشد (H.264/AAC با پیکسل فرمت `yuv420p` در کانتینر MP4)، فرآیند سنگین تبدیل مجدد کدک رد شده و تنها فلگ Faststart اعمال میشود (`-movflags +faststart`) تا ویدیو بلافاصله در مرورگر کاربران بدون نیاز به بافر کامل پخش شود.
- **استخراج تصویر thumbnail**: استخراج خودکار تصویر JPEG با کیفیت بالا (`<storageKey>-thumb.jpg`) از ثانیه های اولیه ویدیو برای نمایش پیش نمایش در چت.
- **استخراج متادیتا**: اندازه گیری ابعاد دقیق (عرض و ارتفاع) و مدت زمان بر حسب ثانیه و گزارش آن به سرور Songbird جهت رندر فوری کادر پیام در کلاینت ها.
- **پاکسازی فایل های زائد (Orphan Cleanup)**: پس از تکمیل موفقیت آمیز ترنسکد، ورکر فایل ویدیویی خام اولیه را از ذخیره سازی ابری حذف میکند تا از اشغال فضای تکراری جلوگیری شود.
- **رمزنگاری لایه اپلیکیشن (Envelope Encryption)**: در صورت فعال بودن رمزنگاری فایل ها در وضعیت سکون (`STORAGE_ENCRYPTION_MODE=local`)، ورکر فایل رمزگذاری شده را در حافظه با `STORAGE_ENCRYPTION_KEY` رمزگشایی کرده، عملیات پردازش را انجام داده و خروجی را پیش از ذخیره سازی مجدداً رمزنگاری میکند.
- **سیستم ارسال مطمئن Webhook با تلاش مجدد (Retry)**: ورکر پس از اتمام پردازش، نتیجه را با مکانیزم تلاش مجدد نمایی (Exponential Backoff تا ۵ مرتبه) به سرور Songbird گزارش میدهد تا در صورت قطعی موقت شبکه، هیچ پاسخی مفقود نشود.

## معماری و جریان کاری (Architecture & Workflow)

```
┌──────────────┐     1. Upload (Presigned / Multipart)    ┌──────────────────────┐
│  Web / App   │ ───────────────────────────────────────> │ S3 / R2 / Local Disk │
│    Client    │                                          └──────────────────────┘
└──────┬───────┘                                                     ▲
       │                                                             │
       │ 2. Notify Server                                            │ 4. Read raw /
       ▼                                                             │    Upload processed /
┌──────────────┐          3. POST /transcode              ┌──────────┴──────────┐
│   Songbird   │ ───────────────────────────────────────> │ Songbird Media Worker│
│   Backend    │ <─────────────────────────────────────── │    (HTTP Push)       │
└──────────────┘        5. POST /api/uploads/webhook/     └─────────────────────┘
                                processed (with retries)
```

### مراحل اجرا

1. **آپلود مدیا**: کلاینت فایل ویدیویی را به طور مستقیم یا با Presigned URL روی فضای ابری یا دیسک محلی بارگذاری میکند.
2. **ارسال کار به ورکر (Dispatch)**: سرور Songbird یک درخواست `POST /transcode` حاوی شناسه فایل، کلید ذخیره سازی، نوع رمزنگاری و نشانی های Callback به ورکر مدیا ارسال میکند.
3. **پذیرش و صف بندی**: ورکر فوراً پاسخ `202 Accepted` را برمیگرداند و کار را در صف پردازش غیرهمگام (`AsyncQueue`) با سقف همزمانی `WORKER_CONCURRENCY` قرار میدهد.
4. **پردازش**: ورکر فایل را دریافت کرده، در صورت لزوم رمزگشایی نموده، کدک ها را بررسی میکند، ترنسکد یا Faststart را از طریق FFmpeg انجام داده و تصویر thumbnail را تولید می نماید.
5. **ارسال گزارش با Webhook**: ورکر وضعیت `ready`، ابعاد، مدت زمان و کلیدهای فایل های جدید را به Endpoint سرور (`POST /api/uploads/webhook/processed`) گزارش میدهد.
6. **پخش زنده تغییرات**: سرور Songbird رکورد فایل را در پایگاه داده به روزرسانی کرده و رویداد را به صورت زنده از طریق SSE/WebSocket به تمامی کاربران چت ارسال میکند.

## حالت های پردازش مدیا (`STORAGE_PROCESSING_MODE`)

نحوه هدایت و پردازش فایل های رسانه ای از طریق متغیر `STORAGE_PROCESSING_MODE` تعیین میشود:

| حالت | عملکرد |
|---|---|
| `auto` (پیشفرض) | **ارسال به ورکر ریموت با تلاش مجدد و بازگشت به ورکر محلی.** در این حالت، Songbird ابتدا کار را به ورکر ریموت (`WORKER_URL`) میفرستد و در صورت بروز خطا تا سقف `STORAGE_PROCESSING_TIMEOUT_MS` تلاش مجدد میکند. در محیط های Docker و استاندارد، سرور Songbird ورکر محلی (`http://127.0.0.1:WORKER_PORT`) را نیز به عنوان پروسه فرزند مدیریت میکند تا در صورت عدم تنظیم یا اتمام مهلت زمانی ورکر ریموت، پردازش بدون وقفه به صورت محلی انجام گیرد. |
| `local` | **پردازش کاملاً محلی.** تمامی درخواست های ترنسکد فقط به ورکر محلی مستقر روی `http://127.0.0.1:WORKER_PORT` ارسال میشوند و هیچ ورکر ریموتی فراخوانی نمیشود. پروسه فرزند ورکر محلی در زمان شروع به طور خودکار اجرا میگردد. |
| `remote` | **پردازش کاملاً ریموت.** کارها فقط به ورکر ریموت (`WORKER_URL`) ارسال میشوند و تلاش مجدد تا سقف `STORAGE_PROCESSING_TIMEOUT_MS` بدون بازگشت به ورکر محلی انجام میگیرد. هیچ ورکر محلی در سرور اجرا یا مانیتور نمیگردد. این حالت برای استقرارهای ابری سبک (Serverless / PaaS) جهت کاهش بار سرور اصلی بسیار مناسب است. |

## متغیرهای محیطی

### تنظیمات ورکر مدیا (Media Worker)

این متغیرها در محیط اجرای ورکر (فایل `.env` در مسیر `worker/` یا متغیرهای کانتینر) تنظیم میشوند:

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `WORKER_PORT` | `integer` | `8080` | پورت HTTP که ورکر روی آن به درخواست ها گوش میدهد. |
| `WORKER_CONCURRENCY` | `integer` | `2` | حداکثر تعداد پردازش های ویدیویی همزمان FFmpeg. |
| `WEBHOOK_SECRET` | `string` | `""` | توکن امنیتی برای اعتبارسنجی درخواست های ورودی و فراخوانی Webhook خروجی (`x-songbird-webhook-secret`). باید با `WEBHOOK_SECRET` سرور Songbird یکسان باشد. |
| `STORAGE_DRIVER` | `string` | `local` | درایور ذخیره سازی (`local` برای دیسک محلی یا `remote` / `s3` برای ذخیره سازی ابری). |
| `DATA_DIR` | `string` | `/opt/songbird/data` | مسیر دایرکتوری داده محلی (هنگام استفاده از `STORAGE_DRIVER=local`). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت ذخیره سازی S3 / R2. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی URL سرویس ذخیره سازی ابری (مانند `https://<account-id>.r2.cloudflarestorage.com`). |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت (مانند `us-east-1` یا `auto`). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | کلید دسترسی (Access Key) باکت. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید مخفی (Secret Key) باکت. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | فعال سازی ساختار آدرس دهی Path-Style. برای Cloudflare R2، MinIO، ArvanCloud و Wasabi توصیه میشود. |
| `STORAGE_ENCRYPTION_KEY` | `string` | `""` | *(اختیاری)* کلید رمزنگاری متقارن لایه اپلیکیشن در صورت فعال بودن `STORAGE_ENCRYPTION_MODE=local`. |

### تنظیمات سرور Songbird

این متغیرها در فایل `.env` سرور اصلی Songbird پیکربندی میشوند:

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `WORKER_URL` | `string` | `""` | نشانی URL پایه ورکر ریموت برای ترنسکد با HTTP Push (مثلاً `https://media-worker.example.com`). نام جایگزین: `MEDIA_WORKER_URL`. |
| `WORKER_PORT` | `integer` | `8080` | پورت ورکر محلی. Songbird از این پورت برای ساخت نشانی `http://127.0.0.1:WORKER_PORT` استفاده میکند. |
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | استراتژی پردازش رسانه (`auto`، `local` یا `remote`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `120000` | مهلت زمانی تلاش مجدد به میلی ثانیه برای ارسال به ورکر ریموت پیش از انتقال به پردازش محلی در حالت `auto` یا عدم موفقیت در حالت `remote`. |
| `WEBHOOK_URL` | `string` | `""` | نشانی عمومی فراخوانی Webhook سرور Songbird که به ورکر ارسال میشود (مثلاً `https://songbird.example.com/api/uploads/webhook/processed`). نام جایگزین: `WEBHOOK_CALLBACK_URL`. |
| `WEBHOOK_SECRET` | `string` | *(تولید خودکار)* | توکن مشترک برای احراز هویت درخواست های Webhook. در صورت خالی بودن در اولین اجرا به طور خودکار تولید میشود. |
| `FILE_UPLOAD_TRANSCODE_VIDEOS` | `boolean` | `true` | در صورت تنظیم روی `false`، فرآیند ترنسکد ویدیو کاملاً غیرفعال شده، ارسال درخواست های ترنسکد (`POST /transcode`) به ورکرهای محلی و ریموت متوقف شده و از اجرای پروسه ورکر محلی جلوگیری میشود. |

## روش های استقرار و راه اندازی

### ۱. استقرار خودکار و یکپارچه (سرور تکی / Docker)

اگر Songbird را با استفاده از Docker Compose پیشفرض یا اسکریپت نصب استاندارد اجرا میکنید، نیازی به راه اندازی یا اجرای جداگانه Media Worker ندارید.

- در استقرارهای Docker، فایل `scripts/docker-entrypoint.sh` ورکر محلی را به صورت خودکار در پس زمینه اجرا میکند.
- در استقرارهای دستی/Node، ماژول `localWorkerManager` وضعیت پورت ورکر را بررسی کرده و در صورت نیاز پروسه `worker/index.js` را اجرا و مدیریت میکند.

:::tip غیرفعال کردن ترنسکد ویدیو و ورکر محلی
چنانچه به ترنسکد ویدیوها نیازی ندارید یا میخواهید در سرورهای با منابع محدود از مصرف پردازنده (CPU) و حافظه رم جلوگیری کنید، متغیر `FILE_UPLOAD_TRANSCODE_VIDEOS=false` را در `.env` (یا از طریق پنل مدیریت در بخش **تنظیمات > آپلود فایل**) تنظیم نمایید. در این وضعیت:

- فایل های ویدیویی آپلودشده بدون تبدیل مجدد در فرمت اصلی خود نگهداری میشوند.
- سرور Songbird ارسال هرگونه درخواست ترنسکد (`POST /transcode`) به ورکرهای محلی یا ریموت را متوقف میکند.
- پروسه ورکر محلی در پس زمینه توسط `scripts/docker-entrypoint.sh` یا مدیر ورکر داخلی (`localWorkerManager`) اجرا نخواهد شد.
:::

### ۲. کانتینر مجزا و Docker Compose

پروژه Songbird یک ایمیج رسمی و بسیار سبک از Media Worker را به صورت جداگانه در Docker Hub منتشر میکند:

```txt
bllackbull/songbird-worker:latest
```

این ایمیج اختصاصی مبتنی بر Alpine Linux (با حجم تقریبی ۱۲۰ مگابایت) شامل Node.js 24 و FFmpeg بوده و با تدابیر امنیتی (کاربر غیر ریشه و Healthcheck فعال) آماده به کار است.

#### شروع سریع با دستور `docker run`

```bash
docker run -d \
  --name songbird-media-worker \
  --restart unless-stopped \
  -p 8080:8080 \
  -e WORKER_PORT=8080 \
  -e WORKER_CONCURRENCY=2 \
  -e WEBHOOK_SECRET=your-secure-webhook-secret \
  -e STORAGE_DRIVER=remote \
  -e STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  -e STORAGE_BUCKET=my-songbird-bucket \
  -e STORAGE_REGION=auto \
  -e STORAGE_ACCESS_KEY_ID=your-access-key \
  -e STORAGE_SECRET_ACCESS_KEY=your-secret-key \
  -e STORAGE_FORCE_PATH_STYLE=true \
  bllackbull/songbird-worker:latest
```

#### اجرا با Docker Compose

برای اجرای Media Worker روی یک سرور مجزا با منابع CPU/RAM بالا:

**۱. ورود به مسیر `worker/`:**

```bash
cd /opt/songbird/worker
```

**۲. ساخت و تنظیم فایل `.env` برای ورکر:**

```txt
WORKER_PORT=8080
WORKER_CONCURRENCY=4
WEBHOOK_SECRET=your-secure-webhook-secret
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret-key
STORAGE_FORCE_PATH_STYLE=true
```

**۳. اجرا با Docker Compose:**

```bash
docker compose -f docker-compose.yaml up -d
```

ایمیج آماده `bllackbull/songbird-worker:latest` به صورت خودکار دریافت خواهد شد (چنانچه میخواهید ایمیج را از سورس کد بسازید، بخش `build:` را در `worker/docker-compose.yaml` از حالت کامنت خارج کنید).

### ۳. استقرار روی پلتفرم های ابری (Render, Railway, Fly.io, Koyeb)

میتوانید ورکر را به صورت یک سرویس کانتینری وب (Web Service) روی پلتفرم های PaaS اجرا کنید.

#### پلتفرم Render

۱. در پنل [Render](https://render.com) یک **Web Service** جدید ایجاد کنید.

۲. مخزن گیت Songbird خود را متصل نمایید.

۳. تنظیمات سرویس را به شکل زیر وارد کنید:
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `worker/Dockerfile`
   - **Docker Context**: `.`

۴. متغیرهای محیطی را اضافه کنید:
   - `WORKER_PORT`: `8080`
   - `WORKER_CONCURRENCY`: `2`
   - `WEBHOOK_SECRET`: *(مشابه سرور Songbird)*
   - `STORAGE_DRIVER`: `remote`
   - `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_FORCE_PATH_STYLE`

۵. در فایل `.env` سرور اصلی Songbird مقادیر زیر را قرار دهید:
   ```txt
   WORKER_URL=https://your-media-worker.onrender.com
   WEBHOOK_URL=https://songbird.example.com/api/uploads/webhook/processed
   WEBHOOK_SECRET=your-secure-webhook-secret
   STORAGE_PROCESSING_MODE=remote
   ```

#### پلتفرم های Railway / Fly.io

- **استقرار خودکار (Railway IaC)**: پروژه Songbird دارای پیکربندی آماده زیرساخت به عنوان کد در مسیر `.railway/railway.ts` است که سرویس `songbird-worker` را به صورت کاملاً خودکار در کنار برنامه اصلی، پایگاه داده PostgreSQL و باکت ذخیره سازی فایل مستقر و متصل میکند. برای جزئیات کامل به [راهنمای استقرار ابری](./Cloud-Deployment.md#استقرار-خودکار-با-railway-زیرساخت-به-عنوان-کد-iac) مراجعه کنید.
- **راهاندازی دستی (Railway / Fly.io)**: ساخت مستقیم از `worker/Dockerfile` با دایرکتوری ریشه `worker`. پورت تعریف شده در `WORKER_PORT` (`8080`) را در معرض دسترسی قرار دهید و مطمئن شوید ورکر امکان دسترسی به Endpoint باکت S3 و `WEBHOOK_URL` سرور چت را دارد.

### ۴. استقرار به عنوان سرویس Systemd (سرور VPS لینوکس)

در صورتی که Songbird را به صورت مستقیم و بدون داکر روی لینوکس اجرا میکنید:

**۱. نصب پیشنیازهای سیستمی:**

```bash
sudo apt update
sudo apt install -y ffmpeg nodejs
```

**۲. نصب وابستگی های ورکر:**

```bash
cd /opt/songbird/worker
npm ci --omit=dev
```

**۳. ایجاد فایل سرویس در مسیر `/etc/systemd/system/songbird-worker.service`:**

```ini
[Unit]
Description=Songbird Media Worker
After=network.target

[Service]
Type=simple
User=songbird
WorkingDirectory=/opt/songbird/worker
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/songbird/.env

[Install]
WantedBy=multi-user.target
```

**۴. فعال سازی و اجرای سرویس:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird-worker
sudo systemctl status songbird-worker
```

## مستندات API و Endpointها

### ۱. بررسی وضعیت سلامت (Health Check)

**Endpoint:** `GET /health` یا `GET /`

این Endpoint وضعیت سرویس و آمار صف پردازش را برمیگرداند.

```bash
curl http://localhost:8080/health
```

**پاسخ نمونه (`200 OK`):**

```json
{
  "status": "ok",
  "service": "songbird-media-worker",
  "queue": {
    "pending": 0,
    "queued": 0,
    "concurrency": 2
  }
}
```

### ۲. ارسال کار ترنسکد (Transcode Dispatch)

**Endpoint:** `POST /transcode`

فایل رسانه ای را برای پردازش غیرهمگام به ورکر تحویل میدهد.

**هدرها (Headers):**
- `Content-Type: application/json`
- `x-songbird-webhook-secret: <WEBHOOK_SECRET>`

**نمونه بدنه درخواست (Request Body):**

```json
{
  "fileId": "123",
  "storageKey": "uploads/video-abc1234.mp4",
  "storedName": "original-video.mov",
  "mimeType": "video/quicktime",
  "encryptionType": "none",
  "callbackUrl": "https://songbird.example.com/api/uploads/webhook/processed",
  "webhookSecret": "your-webhook-secret"
}
```

**پاسخ (`202 Accepted`):**

```json
{
  "success": true,
  "message": "Transcode job accepted",
  "fileId": "123",
  "queuePosition": 0
}
```

### ۳. فراخوانی Webhook سرور Songbird

**Endpoint روی سرور Songbird:** `POST /api/uploads/webhook/processed`

پس از اتمام عملیات، ورکر این درخواست را به سرور Songbird ارسال میکند.

**هدرها:**
- `Content-Type: application/json`
- `x-songbird-webhook-secret: <WEBHOOK_SECRET>`

**بدنه درخواست در صورت موفقیت (`status: "ready"`):**

```json
{
  "fileId": "123",
  "status": "ready",
  "transcodedStorageKey": "uploads/video-abc1234-h264-9f2d1e4a.mp4",
  "thumbStorageKey": "uploads/video-abc1234-thumb.jpg",
  "width": 1920,
  "height": 1080,
  "duration": 42.5
}
```

**بدنه درخواست در صورت خطا (`status: "failed"`):**

```json
{
  "fileId": "123",
  "status": "failed"
}
```

## نکات امنیتی و بهترین شیوه ها

۱. **همگام سازی `WEBHOOK_SECRET`**: همواره یک رشته امن و تصادفی یکسان را برای `WEBHOOK_SECRET` در سرور Songbird و Media Worker قرار دهید. درخواست های بدون هدر معتبر با خطای `401 Unauthorized` رد میشوند.

۲. **جداسازی شبکه (Network Isolation)**: در استقرارهای چندسروری، ورکر را روی IP خصوصی شبکه محلی قرار داده یا با فایروال (UFW یا Security Groups) دسترسی به `POST /transcode` را تنها به IP سرور Songbird محدود کنید.

۳. **تنظیم همزمانی و تخصیص منابع**:
   - پردازش ویدیو به شدت متکی بر CPU و RAM است.
   - توصیه همزمانی (`WORKER_CONCURRENCY`): اختصاص `1` پردازش همزمان به ازای هر ۱ تا ۲ هسته vCPU اختصاصی.
   - روی سرور ۴ هسته ای، مقدار `WORKER_CONCURRENCY=2` یا `3` انتخاب مناسبی برای جلوگیری از اشباع پردازنده است.

۴. **فضای دیسک موقت (Temp Storage)**: اطمینان حاصل کنید که فضای کافی روی دیسک در مسیر `/tmp` وجود دارد تا فایل های خام و تبدیل شده در حین پردازش بدون مشکل ذخیره شوند.

## عیب یابی (Troubleshooting)

### خطای `401 Unauthorized` از ورکر

- بررسی کنید که مقدار `WEBHOOK_SECRET` در فایل `.env` سرور Songbird با مقدار آن در ورکر کاملاً یکسان باشد.
- در صورت وجود کاراکترهای خاص در توکن، آن را داخل دابل کوتیشن (`"..."`) قرار دهید.

### عدم دریافت نتیجه Webhook در سرور Songbird

- اطمینان حاصل کنید که `WEBHOOK_URL` در سرور Songbird به یک آدرس عمومی و در دسترس ورکر اشاره دارد (مثلاً `https://songbird.example.com/api/uploads/webhook/processed`).
- اگر از آدرس های محلی (`localhost` یا `127.0.0.1`) استفاده میکنید، مطمئن شوید هر دو سرویس روی یک هاست و شبکه اجرا میشوند.
- لاگ های ورکر را برای مشاهده خطاهای تلاش مجدد بررسی کنید (`[worker] Callback webhook returned HTTP ...`).

### خطای FFmpeg در حین پردازش

- اطمینان حاصل کنید که بسته های FFmpeg و FFprobe به درستی نصب شده اند:
  ```bash
  ffmpeg -version
  ffprobe -version
  ```
- لاگ های دقیق خروجی را بررسی کنید:
  ```bash
  journalctl -u songbird-worker -f
  # یا برای Docker
  docker compose -f worker/docker-compose.yaml logs -f
  ```
