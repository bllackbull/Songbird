# ذخیره سازی ابری و پردازش رسانه (Object Storage)

پلتفرم Songbird از یک معماری ذخیره سازی ماژولار (Pluggable Storage) پشتیبانی میکند که به شما امکان می دهد بین ذخیره سازی دیسک محلی و ذخیره سازی ابری سازگار با S3 انتخاب کنید. در ترکیب با **Media Worker یکپارچه Songbird**، امکان ترنسکد ویدیویی غیرهمگام با کارایی بالا، استخراج thumbnail و بهینه سازی مدیا در استقرارهای تک سروری یا محیط های ابری توزیع شده فراهم شده است.

## درایورهای ذخیره سازی (Storage Drivers)

Songbird از متغیر محیطی `STORAGE_DRIVER` برای تعیین محل ذخیره سازی فایل های آپلودشده چت، پیوست های چندرسانه ای و آواتارها استفاده میکند.

| درایور | `STORAGE_DRIVER` | توضیح |
|---|---|---|
| **دیسک محلی** (پیشفرض) | `local` | آپلودها مستقیماً روی فایل سیستم محلی سرور در مسیر پوشه `DATA_DIR` (پوشه های `data/uploads/` و `data/avatars/`) ذخیره میشوند. ایده آل برای استقرارهای ساده روی یک سرور VPS یا Docker. |
| **ذخیره سازی ابری ریموت** | `remote` | آپلودها در یک باکت سازگار با S3 (مانند AWS S3، Cloudflare R2، MinIO، ArvanCloud، Wasabi) ذخیره میشوند. فرآیند آپلود با استفاده از Presigned URL مستقیماً بین کلاینت و باکت انجام شده و از سرور اصلی عبور نمیکند. |

```bash
# نمونه تنظیم در فایل .env
STORAGE_DRIVER=remote
```

## معماری آپلود مستقیم با Presigned URL

هنگامی که `STORAGE_DRIVER=remote` فعال است، Songbird از جریان کاری آپلود مستقیم کلاینت به باکت با Presigned URL استفاده میکند. محتوای فایل مستقیماً از مرورگر کاربر به Cloudflare R2 یا AWS S3 استریم میشود و سرور برنامه Node.js Songbird به طور کامل بایپاس میشود.

```
+--------+            1. POST /api/uploads/presign            +-----------------+
|        | -------------------------------------------------> |                 |
|        | <------------------------------------------------- |                 |
|        |      2. بازگرداندن URL آپلود Presigned PUT         |  سرور Songbird  |
|        |                                                    | (Node.js / API) |
| مرورگر |            4. POST /api/uploads/complete           |                 |
| کلاینت | -------------------------------------------------> |                 |
|        | <------------------------------------------------- |                 |
|        |           5. لینک شدن فایل در دیتابیس              +-----------------+
|        |                                                             
|        |          3. HTTP PUT (آپلود مستقیم فایل)           +-----------------+
|        | -------------------------------------------------> |  Cloudflare R2  |
|        | <------------------------------------------------- |   / S3 Bucket   |
+--------+                 پاسخ 200 OK                        +-----------------+
```

### جریان آپلود مستقیم
1. **درخواست Presign (`POST /api/uploads/presign`)**:
   - مرورگر کلاینت متادیتا فایل (`filename`، `mimeType`، `fileSize` و غیره) را به بکاند Songbird ارسال میکند.
   - سرور احراز هویت را اعتبارسنجی میکند، محدودیت حجم فایل (`FILE_UPLOAD_MAX_SIZE_MB`) را بررسی میکند، یک کلید ذخیره سازی یکتا (`uploads/<timestamp>_<hash>.<ext>`) میسازد و یک Presigned URL از نوع `PUT` توسط `@aws-sdk/s3-request-presigner` تولید میکند.
   - سرور یک رکورد آپلود معلق در جدول `pending_presigned_uploads` دیتابیس ثبت میکند.
2. **آپلود مستقیم مرورگر (`PUT <uploadUrl>`)**:
   - مرورگر کلاینت باره (payload) فایل را مستقیماً با استفاده از Presigned URL به اندپوینت ذخیره سازی Cloudflare R2 / S3 آپلود میکند.
3. **تکمیل آپلود (`POST /api/uploads/complete` یا ثبت پیام)**:
   - پس از موفقیتآمیز بودن HTTP `PUT`، کلاینت به Songbird اطلاع میدهد یا فایل را به درخواست پیام متصل میکند.
   - سرویس Songbird کلید `storageKey` را به دیتابیس فایلهای پیام (`chat_message_files`) متصل کرده و تابع `removePendingPresignedUploads` را برای پاکسازی رکورد معلق فراخوانی میکند.

### مزایای آپلود مستقیم با Presigned URL
- **عدم مصرف منابع سرور (Zero Overhead)**: انتقال فایلهای سنگین هیچ مقدار از RAM یا CPU سرور Node.js را اشغال نمیکند.
- **بایپاس محدودیتهای سرور و پروکسی**: حجم آپلود محدود به محدودیتهای body-parser در Nginx یا Express (`client_max_body_size`) نمیشود.
- **پهنای باند و سرعت بالاتر**: کلاینتها با حداکثر پهنای باند شبکه به شبکه لبه جهانی Cloudflare یا زیرساخت S3 متصل میشوند.

### جریان دانلود Presigned و CDN Fallback
برای دانلود فایلها و استریم رسانه:
- **`GET /api/uploads/presign-download`**: یک Presigned URL موقت از نوع `GET` برای فایلهای خصوصی تولید میکند.
- **هنگام تنظیم `STORAGE_PUBLIC_URL`**: اگر یک CDN عمومی یا دامین اختصاصی تنظیم شده باشد (مانند `STORAGE_PUBLIC_URL=https://media.example.com`)، Songbird آدرسهای مستقیم CDN عمومی (`https://media.example.com/uploads/...`) را بدون نیاز به امضای دیجیتال تولید میکند.
- **عدم تنظیم `STORAGE_PUBLIC_URL`**: آدرسهای امضاشده S3 با مدت اعتبار `STORAGE_EXPIRES_IN` به ثانیه (پیش فرض: 3600 ثانیه / 1 ساعت) تولید میشوند.

## پیکربندی ذخیره سازی ابری ریموت

هنگامی که `STORAGE_DRIVER=remote` فعال است، متغیرهای محیطی زیر را برای اتصال Songbird به باکت ذخیره سازی ابری خود تنظیم کنید:

| متغیر | نوع | پیش فرض | توضیح |
|---|---|---:|---|
| `STORAGE_DRIVER` | `string` | `local` | برای فعالسازی ذخیره سازی ابری، روی `remote` تنظیم کنید. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی URL پایه API سرویس ذخیره سازی ابری (مانند `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` برای Cloudflare R2). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت (Bucket) ذخیره سازی شما (مانند `songbird-media`). |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت (پیش فرض `auto` برای Cloudflare R2، MinIO، ArvanCloud؛ کاربران AWS S3 منطقه خود مانند `us-east-1` را تنظیم کنند). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | کلید دسترسی (Access Key ID) برای احراز هویت باکت. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید سرّی (Secret Access Key) برای احراز هویت باکت. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | پیشوند URL اختیاری CDN یا دامین اختصاصی (مانند `https://media.example.com`). در صورت تنظیم، لینکهای دانلود به جای Presigned URL از این پیشوند استفاده میکنند. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | مدت زمان اعتبار لینکهای Presigned برای آپلود و دانلود به ثانیه. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | فعالسازی ساختار URL مبتنی بر مسیر (`endpoint/bucket/key`). برای Cloudflare R2، MinIO، ArvanCloud و Wasabi مقدار `true` و برای AWS S3 مقدار `false` قرار دهید. |

## الزامات پیکربندی CORS در Cloudflare R2 و S3

از آنجا که مرورگر کلاینت فایل ها را مستقیماً با استفاده از درخواست های HTTP `PUT` بر روی Presigned URL به اندپوینت Cloudflare R2 یا S3 آپلود میکند، **تنظیم CORS (Cross-Origin Resource Sharing) روی باکت الزامی است**. بدون تنظیم صحیح CORS، مرورگر درخواست های آپلود را به دلیل خطای Cross-Origin مسدود خواهد کرد.

### پیکربندی الزامی CORS JSON

تنظیمات JSON زیر را در بخش CORS باکت Cloudflare R2 یا S3 خود اعمال کنید:

```json
[
  {
    "AllowedOrigins": [
      "https://chat.example.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD",
      "POST"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

> **نکته**: آدرس `https://chat.example.com` را با دامین واقعی خود جایگزین کنید (یا برای تست اولیه از `*` استفاده کنید). متد `PUT`، هدرهای مجاز `*` و هدر اکسپوز شده `ETag` برای کارکرد صحیح آپلود مستقیم مرورگر ضروری هستند.

## راهنمای راه اندازی Cloudflare R2

سرویس Cloudflare R2 یک ذخیره سازی ابری سازگار با S3 بدون هزینه پهنای باند خروجی (Egress) است که آن را به گزینه ای عالی برای میزبانی فایل های پیوست و آواتارهای Songbird تبدیل میکند.

### گام 1: ساخت باکت R2

1. وارد [داشبورد Cloudflare](https://dash.cloudflare.com/) شوید.
2. از منوی کناری به بخش **R2 Object Storage** بروید.
3. روی **Create bucket** کلیک کنید.
4. نام باکت (مانند `songbird-media`) را وارد کرده و روی **Create Bucket** کلیک کنید.

### گام 2: ساخت کلیدها و توکنهای API

1. در صفحه R2 Overview روی **Manage R2 API Tokens** کلیک کنید.
2. روی **Create API Token** کلیک کنید.
3. در بخش **Permissions** گزینه **Object Read & Write** را انتخاب کنید.
4. در بخش **Apply to specific buckets** باکت خود (`songbird-media`) را انتخاب کنید.
5. روی **Create API Token** کلیک کنید.
6. کلیدهای تولیدشده را در مکان امن ذخیره کنید:
   - **Access Key ID** &rarr; `STORAGE_ACCESS_KEY_ID`
   - **Secret Access Key** &rarr; `STORAGE_SECRET_ACCESS_KEY`
7. شناسه اکانت (**Account ID**) خود را از URL داشبورد کپی کنید (مانند `https://dash.cloudflare.com/<ACCOUNT_ID>/r2`).

### گام 3: پیکربندی قانون CORS باکت

1. باکت خود را در Cloudflare R2 باز کرده و تب **Settings** را انتخاب کنید.
2. به بخش **CORS Policy** بروید و روی **Edit CORS Policy** کلیک کنید.
3. کد [CORS JSON](#الزامات-پیکربندی-cors-در-cloudflare-r2-و-s3) بالا را پیست کرده و ذخیره کنید.

### گام 4: تنظیم متغیرهای محیطی `.env` در Songbird

تنظیمات زیر را به فایل `.env` خود اضافه کنید:

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_BUCKET=songbird-media
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
STORAGE_FORCE_PATH_STYLE=true
STORAGE_EXPIRES_IN=3600
```

### گام 5: (اختیاری) دامین اختصاصی یا URL عمومی R2

به صورت پیش فرض Songbird لینک های امن Presigned برای دانلود فایلها تولید میکند. اگر **Public Access** یا **Custom Domain** (مانند `media.example.com`) را در تنظیمات R2 فعال کرده اید، متغیر `STORAGE_PUBLIC_URL` را مقداردهی کنید:

```txt
STORAGE_PUBLIC_URL=https://media.example.com
```

## نمونه های پیکربندی سرویسدهندگان

### AWS S3

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_FORCE_PATH_STYLE=false
```

### خلاصه تنظیمات Cloudflare R2

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

### MinIO (سرویس شخصی)

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=http://minio.internal:9000
STORAGE_BUCKET=songbird-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

### ذخیره سازی ابری آروان کلاد (ArvanCloud)

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=ir-thr-at1
STORAGE_ACCESS_KEY_ID=<ARVAN_ACCESS_KEY>
STORAGE_SECRET_ACCESS_KEY=<ARVAN_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
```

## ردیابی آپلودهای معلق و پاکسازی فایل های رهاشده

برای جلوگیری از تجمع فایل های رهاشده در باکت های ابری (در صورت لغو آپلود یا بستن مرورگر توسط کاربر)، Songbird از مکانیزم ردیابی و پاکسازی دورهای خودکار استفاده میکند:

### ردیابی آپلودهای معلق (Pending Upload Tracking)

- هنگام درخواست Presigned URL توسط کلاینت (`POST /api/uploads/presign`)، یک رکورد شامل `storage_key`، `user_id` و زمان ساخت در جدول `pending_presigned_uploads` ثبت میشود.
- زمانی که آپلود با موفقیت انجام شد و فایل به پیام چت متصل گردید، Songbird با فراخوانی `removePendingPresignedUploads` این رکورد معلق را حذف میکند.

### پاکسازی دورهای پس زمینه (Periodic Background Pruning)

- سرویس نگهداشت پس زمینه به صورت دورهای تابع `pruneOrphanRemoteObjects` را اجرا میکند.
- رکوردهای قدیمی تر از 1 ساعت در جدول `pending_presigned_uploads` استعلام میشوند.
- برای هر رکورد منقضی شده، بررسی میشود که آیا `storage_key` در جدول `chat_message_files` وجود دارد یا خیر.
- در صورتی که فایل به هیچ پیامی متصل نشده باشد، فایل رهاشده مستقیماً از باکت ابری (توسط دستور `DeleteObjectCommand`) حذف شده و رکورد معلق پاکسازی میشود.

## معماری Media Worker یکپارچه

سرویس Songbird دارای یک **Media Worker** مستقل و بدون وضعیت (Stateless HTTP Push Worker) در پوشه `worker/` است که وظیفه انجام ترنسکد ویدیوها، استخراج تصاویر thumbnail و بررسی متادیتای فایل های مدیا را خارج از سرور اصلی چت بر عهده دارد.

:::tip راهنمای اختصاصی ورکر مدیا
برای بررسی جامع استقرار مستقل، راه اندازی ابری (Render، Railway، Fly.io)، تنظیم همزمانی و مستندات API، به صفحه اختصاصی [ورکر مدیا](./Media-Worker.md) مراجعه کنید.
:::

## حالت های رمزنگاری ریموت (`STORAGE_ENCRYPTION_MODE`)

Songbird دو استراتژی مختلف برای رمزنگاری هنگام استفاده از ذخیره سازی ابری ارائه میدهد:

| حالت | `STORAGE_ENCRYPTION_MODE` | توضیح |
|---|---|---|
| **رمزنگاری سمت ارائه دهنده** (پیشفرض) | `remote` | از رمزنگاری پیشفرض باکت S3 (مانند SSE-S3 / AES-256) استفاده میکند. درخواست های دانلود با ریدایرکت مستقیم 302 به باکت/CDN متصل میشوند که بالاترین سرعت را فراهم میکند. |
| **رمزنگاری Envelope سمت اپلیکیشن** | `local` | از رمزنگاری متقارن AES-256-GCM با کلید اختصاصی سرور (`STORAGE_ENCRYPTION_KEY`) استفاده میکند. فایل ها پیش از ارسال به کلاینت رمزگشایی میشوند. |

```txt
# رمزنگاری سمت ارائه دهنده باکت (پیشنهادی برای Cloudflare R2 / AWS S3 همراه با CDN)
STORAGE_ENCRYPTION_MODE=remote

# رمزنگاری لایه اپلیکیشن
STORAGE_ENCRYPTION_MODE=local
```

## استفاده از Redis و صفهای کاری (BullMQ)

Songbird از **BullMQ** برای مدیریت کارهای پس زمینه استفاده میکند.

### حالتهای کاری BullMQ

1. **فعال بودن Redis (`REDIS_HOST` یا `REDIS_URL` تنظیم شده):**
   - به Redis متصل شده و صفهای BullMQ و ورکرهای ماندگار را فعال میکند.
   - کارهای پردازش رسانه به صورت ایمن بین چند سرور توزیع میشوند.

2. **حالت Fallback بدون Redis:**
   - در صورت عدم تنظیم Redis، به صف درون برنامهای (In-Memory) سوییچ میکند و بدون نیاز به نصب هیچ نرمافزار اضافی کار میکند.

```txt
# تنظیمات اختیاری Redis برای توزیع بار در چند سرور
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# یا
REDIS_URL=redis://:password@redis-server:6379/0
```
