# ذخیره سازی ابری و پردازش رسانه (Object Storage)

پلتفرم Songbird از یک معماری ذخیره سازی ماژولار (Pluggable Storage) پشتیبانی میکند که به شما امکان میدهد بین ذخیره سازی دیسک محلی و ذخیره سازی ابری سازگار با S3 انتخاب کنید. در ترکیب با **Media Worker یکپارچه Songbird**، امکان ترنسکد ویدیویی غیرهمگام با کارایی بالا، استخراج بندانگشتی (Thumbnail) و بهینهسازی مدیا در استقرارهای تکسروری یا محیطهای ابری توزیعشده فراهم شده است.

## درایورهای ذخیره سازی (Storage Drivers)

Songbird از متغیر محیطی `STORAGE_DRIVER` برای تعیین محل ذخیره سازی فایلهای آپلودشده چت، پیوستهای چندرسانهای و آواتارها استفاده میکند.

| درایور | `STORAGE_DRIVER` | توضیح |
|---|---|---|
| **دیسک محلی** (پیشفرض) | `local` | آپلودها مستقیماً روی فایل سیستم محلی سرور در مسیر پوشه `DATA_DIR` (پوشههای `data/uploads/` و `data/avatars/`) ذخیره میشوند. ایدهآل برای استقرارهای ساده روی یک سرور VPS یا Docker. |
| **ذخیره سازی ابری ریموت** | `remote` | آپلودها در یک باکت سازگار با S3 (مانند AWS S3، Cloudflare R2، MinIO، ArvanCloud، Wasabi) ذخیره میشوند. فرآیند آپلود با استفاده از Presigned URL مستقیماً بین کلاینت و باکت انجام شده و از سرور اصلی عبور نمیکند. |

```bash
# نمونه تنظیم در فایل .env
STORAGE_DRIVER=remote
```

## پیکربندی ذخیره سازی ابری ریموت

هنگامی که `STORAGE_DRIVER=remote` فعال است، متغیرهای محیطی زیر را برای اتصال Songbird به باکت ذخیره سازی ابری خود تنظیم کنید:

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `STORAGE_DRIVER` | `string` | `local` | برای فعالسازی ذخیره سازی ابری، روی `remote` تنظیم کنید. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی URL سرویس ذخیره سازی سازگار با S3 (مانند AWS، Cloudflare R2، MinIO، ArvanCloud). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت (Bucket) ذخیره سازی شما. |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت (پیشفرض `auto` برای سرویسهای Cloudflare R2، MinIO و ArvanCloud؛ کاربران AWS S3 میتوانند منطقه اختصاصی مانند `us-east-1` را وارد کنند). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | کلید دسترسی (Access Key ID) برای احراز هویت باکت. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید مخفی (Secret Access Key) برای احراز هویت باکت. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | پیشوند اختیاری دامنه CDN اختصاصی (مانند `https://cdn.example.com`). در صورت تنظیم، لینکهای دانلود عمومی به جای Presigned URL از این پیشوند استفاده میکنند. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | مدت زمان انقضای توکنهای Presigned URL برای آپلود و دانلود بر حسب ثانیه. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | فعالسازی فرمت آدرسدهی Path-Style (به صورت `endpoint/bucket/key`). برای Cloudflare R2، MinIO، ArvanCloud، Wasabi و غیره الزامی است. |

### نمونههای پیکربندی ارائه دهندگان

#### Cloudflare R2

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
STORAGE_PUBLIC_URL=https://media.example.com
STORAGE_FORCE_PATH_STYLE=true
```

#### AWS S3

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_FORCE_PATH_STYLE=false
```

#### MinIO (Self-Hosted)

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=http://minio.internal:9000
STORAGE_BUCKET=songbird-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

#### ابر آروان (ArvanCloud Object Storage)

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=ir-thr-at1
STORAGE_ACCESS_KEY_ID=<ARVAN_ACCESS_KEY>
STORAGE_SECRET_ACCESS_KEY=<ARVAN_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
```

---

## معماری Media Worker یکپارچه

سرویس Songbird دارای یک **Media Worker** مستقل و بدون وضعیت (Stateless HTTP Push Worker) در پوشه `worker/` است که وظیفه انجام ترنسکد ویدیوها، استخراج تصاویر بندانگشتی و بررسی متادیتای فایلهای مدیا را خارج از سرور اصلی چت بر عهده دارد.

:::tip راهنمای اختصاصی ورکر مدیا
برای بررسی جامع استقرار مستقل، راه اندازی ابری (Render، Railway، Fly.io)، تنظیم همزمانی و مستندات API، به صفحه اختصاصی [ورکر مدیا](./Media-Worker.md) مراجعه کنید.
:::

```
┌──────────────┐     ۱. آپلود مستقیم (Presigned/Multipart)     ┌──────────────────────┐
│   کلاینت     │ ───────────────────────────────────────────> │ S3 / R2 / دیسک محلی  │
│ وب یا اپلیکیشن│                                             └──────────────────────┘
└──────┬───────┘                                                         ▲
       │                                                                 │
       │ ۲. اطلاع به سرور                                               │ ۴. خواندن فایل خام /
       ▼                                                                 │    آپلود پردازششده /
┌──────────────┐          ۳. POST /transcode                 ┌───────────┴──────────┐
│ سرور اصلی    │ ──────────────────────────────────────────> │ Songbird Media Worker│
│   Songbird   │ <────────────────────────────────────────── │    (HTTP Push)       │
└──────────────┘    ۵. POST /api/uploads/webhook/processed   └──────────────────────┘
                               (همراه با تلاش مجدد Retry)
```

### ویژگیهای کلیدی معماری

- **مستقل از دیتابیس (Database-Agnostic)**: سرویس Media Worker اتصالی به پایگاه داده SQLite یا PostgreSQL ندارد. تمام ارتباطات از طریق درخواستهای استاندارد HTTP (`POST /transcode` و فراخوانی Webhook) انجام میپذیرد؛ بنابراین میتوان آن را به صورت مجزا مقیاسدهی کرد و روی انواع دیتابیسها بدون وابستگی اجرا نمود.
- **پشتیبانی دوگانه از فضاهای ذخیره سازی**: ورکر توانایی خواندن و نوشتن مستقیم روی انواع فضای ذخیره سازی ابری S3 (مانند Cloudflare R2، AWS S3، MinIO) و همچنین فایل سیستم محلی (Local Disk) را دارد.
- **ترنسکد هوشمند و بهینهسازی Faststart**:
  - بررسی متادیتا و کدکهای ویدیو با استفاده از `ffprobe`.
  - تبدیل ویدیوهای ناسازگار یا با بیتریت بالا (مانند MKV، AVI، WebM، HEVC، ProRes) به فرمت سازگار وب یعنی H.264 با صدای AAC در کانتینر `.mp4`.
  - **تشخیص هوشمند ویدیوهای آماده وب (Smart Web-Ready Skip)**: اگر ویدیوی آپلودشده از قبل با استانداردهای وب سازگار باشد (H.264/AAC با `yuv420p` در کانتینر MP4)، فرآیند سنگین تبدیل مجدد (Re-encoding) نادیده گرفته شده و فقط قابلیت Faststart با کپی سریع استریم (`-movflags +faststart`) اعمال میشود تا پخش فوری ویدیو در مرورگر تضمین شود.
- **تولید خودکار بندانگشتی (Thumbnail)**: استخراج خودکار تصویر بندانگشتی باکیفیت JPEG (`<storageKey>-thumb.jpg`) برای پیشنمایش ویدیوها.
- **استخراج متادیتا**: اندازهگیری ابعاد دقیق (عرض و ارتفاع) و مدت زمان ویدیو و ارسال آن به سرور Songbird جهت رندر فوری کادر نمایش در کلاینتها.
- **پاکسازی فایلهای زائد (Orphan Cleanup)**: پس از تکمیل موفقیتآمیز ترنسکد، ورکر فایل ویدیویی خام اولیه را از فضای ابری حذف میکند تا از اشغال فضای تکراری و ایجاد فایلهای یتیم جلوگیری شود.
- **رمزنگاری سرتاسری لایه اپلیکیشن (Envelope Encryption)**: در صورت فعال بودن رمزنگاری فایلها در وضعیت سکون (`STORAGE_ENCRYPTION_MODE=local`)، ورکر فایل رمزگذاریشده را در حافظه با `STORAGE_ENCRYPTION_KEY` رمزگشایی کرده، عملیات ترنسکد را انجام داده و خروجی را پیش از ذخیره سازی مجدداً رمزنگاری میکند.
- **سیستم ارسال مطمئن Webhook همراه با Retry**: ورکر پس از اتمام پردازش، نتیجه را با مکانیزم تلاش مجدد نمایی (Exponential Backoff تا ۵ مرتبه) به سرور Songbird گزارش میدهد تا در صورت قطعی موقت شبکه یا بار پردازشی سرور، هیچ عملیاتی مفقود نشود.

---

## حالتهای پردازش مدیا (`STORAGE_PROCESSING_MODE`)

نحوه پردازش و مدیریت کارهای ترنسکد از طریق متغیر `STORAGE_PROCESSING_MODE` کنترل میشود:

| حالت | عملکرد |
|---|---|
| `auto` (پیشفرض) | **ارسال به ورکر ریموت با ۳ بار تلاش مجدد و بازگشت به ورکر محلی.** ورکر مدیا محلی در کانتینر اجرا میشود. ابتدا درخواست ترنسکد به ورکر ریموت (`MEDIA_WORKER_URL`) ارسال میشود و در صورت خطا تا ۳ بار تلاش مجدد صورت میگیرد؛ در صورت عدم موفقیت به ورکر محلی (`http://127.0.0.1:WORKER_PORT`) بازمیگردد. در صورت عدم تنظیم `MEDIA_WORKER_URL` مستقیماً به ورکر محلی ارسال میشود. |
| `local` | **پردازش انحصاری در ورکر محلی.** ورکر محلی در کانتینر اجرا شده و کارها فقط به ورکر محلی (`http://127.0.0.1:WORKER_PORT`) فرستاده میشوند. |
| `remote` | **پردازش انحصاری در ورکر ریموت.** ورکر محلی در کانتینر اجرا نمیشود و وظایف فقط به ورکر ریموت (`MEDIA_WORKER_URL`) ارسال میشوند بدون هیچ بازگشتی به ورکر محلی. |

### متغیرهای پیکربندی در سرور Songbird

این مقادیر را در فایل `.env` سرور Songbird تنظیم کنید:

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `WORKER_URL` | `string` | `""` | آدرس پایه worker خارجی پردازش رسانه برای ترنسکد با HTTP push (مانند `https://worker.example.com`). نام جایگزین: `MEDIA_WORKER_URL`. |
| `WORKER_PORT` | `integer` | `8080` | پورت سرویس مستقل Media Worker (`worker/`). توسط Songbird برای ساخت آدرس پیشفرض ورکر محلی (`http://127.0.0.1:8080`) استفاده میشود. |
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | استراتژی پردازش رسانه (`auto` ، `remote` یا `local`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `30000` | مهلت زمانی Fallback بر حسب میلی ثانیه قبل از اجرای پردازش محلی در حالت `auto`. |
| `WEBHOOK_URL` | `string` | `""` | آدرس بازخوانی (Callback) عمومی Webhook سرور Songbird ارسالی به workerها (مانند `https://songbird.example.com/api/uploads/webhook/processed`). نام جایگزین: `WEBHOOK_CALLBACK_URL`. |
| `WEBHOOK_SECRET` | `string` | *(تولید خودکار)* | کلید محرمانه برای احراز هویت درخواست های Webhook دریافتی (`X-Songbird-Webhook-Secret`). در صورت عدم وجود، هنگام راه اندازی سرور به طور خودکار تولید شده، در دیتابیس ذخیره و در فایل `.env` قرار میگیرد. |

---

## راه اندازی و استقرار Media Worker

کدهای Media Worker در پوشه `worker/` قرار دارد و میتواند در کنار سرویس اصلی Songbird یا روی یک سرور و کانتینر مجزا مستقر شود.

### متغیرهای محیطی Media Worker

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `WORKER_PORT` | `integer` | `8080` | پورت HTTP که ورکر روی آن گوش میدهد. |
| `WORKER_CONCURRENCY` | `integer` | `2` | تعداد عملیات همزمان ترنسکد ویدیو. |
| `WEBHOOK_SECRET` | `string` | `""` | توکن احراز هویت درخواستهای ارسالی از سرور Songbird. باید با `WEBHOOK_SECRET` سرور اصلی یکسان باشد. |
| `WEBHOOK_URL` | `string` | `""` | نشانی پیشفرض فراخوانی Webhook در سرور Songbird. |
| `STORAGE_DRIVER` | `string` | `local` | درایور ذخیره سازی (`local` برای دیسک محلی یا `s3`/`remote` برای ذخیره سازی ابری). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت S3 / R2. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی Endpoint سرویس S3 / R2. |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت S3 / R2. |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | کلید دسترسی باکت. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید مخفی باکت. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | برای سرویسهای Cloudflare R2، MinIO و ArvanCloud روی `true` تنظیم شود. |
| `STORAGE_ENCRYPTION_KEY` | `string` | `""` | *(اختیاری)* کلید رمزنگاری متقارن در صورت فعال بودن رمزنگاری فایلها در سرور Songbird. |
| `DATA_DIR` | `string` | `/opt/songbird/data` | مسیر پوشه دادههای Songbird (فایلهای آپلود در `<DATA_DIR>/uploads` قابل دسترسی خواهند بود) هنگام استفاده از `STORAGE_DRIVER=local`. |

### روش اول: اجرا از طریق Docker Compose مستقل

میتوانید ورکر را با استفاده از فایل `worker/docker-compose.yaml` اجرا کنید:

```bash
cd worker
docker compose up -d
```

### روش دوم: استقرار روی پلتفرمهای ابری (Render، Railway، Fly.io)

ورکر را به عنوان یک سرویس Docker مستقل در پلتفرم ابری مورد نظر بسازید:

- **Build Context / Root**: `./worker`
- **مسیر Dockerfile**: `./worker/Dockerfile`
- **پورت**: `8080`
- **متغیرهای محیطی**: مقادیر اتصال به فضای ابری (`STORAGE_*`) و `WEBHOOK_SECRET` را برابر با سرور اصلی قرار دهید.

### روش سوم: بیلد و اجرای مستقیم با Docker

```bash
# بیلد ایمیج ورکر
docker build -t songbird-media-worker -f worker/Dockerfile worker/

# اجرای کانتینر ورکر
docker run -d \
  -p 8080:8080 \
  --name songbird-media-worker \
  --env-file .env \
  songbird-media-worker
```

### بررسی وضعیت سلامت (Health Check)

ورکر دارای اندپوینت `/health` است که وضعیت کاری، کارهای فعال و صف پردازش را گزارش میدهد:

```bash
curl http://localhost:8080/health
```

نمونه خروجی:
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

---

## حالتهای رمزنگاری ریموت (`STORAGE_ENCRYPTION_MODE`)

Songbird دو استراتژی مختلف برای رمزنگاری هنگام استفاده از ذخیره سازی ابری ارائه میدهد:

| حالت | `STORAGE_ENCRYPTION_MODE` | توضیح |
|---|---|---|
| **رمزنگاری سمت ارائه دهنده** (پیشفرض) | `remote` | از رمزنگاری پیشفرض باکت S3 (مانند SSE-S3 / AES-256) استفاده میکند. درخواستهای دانلود با ریدایرکت مستقیم 302 به باکت/CDN متصل میشوند که بالاترین سرعت را فراهم میکند. |
| **رمزنگاری Envelope سمت اپلیکیشن** | `local` | از رمزنگاری متقارن AES-256-GCM با کلید اختصاصی سرور (`STORAGE_ENCRYPTION_KEY`) استفاده میکند. فایلها پیش از ارسال به کلاینت رمزگشایی میشوند. |

```txt
# رمزنگاری سمت ارائه دهنده باکت (پیشنهادی برای Cloudflare R2 / AWS S3 همراه با CDN)
STORAGE_ENCRYPTION_MODE=remote

# رمزنگاری لایه اپلیکیشن
STORAGE_ENCRYPTION_MODE=local
```
