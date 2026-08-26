# ذخیره سازی ابری و پردازش رسانه (Object Storage)

Songbird از یک معماری ذخیره سازی قابل گسترش (Pluggable Storage) پشتیبانی میکند که به شما امکان میدهد بین ذخیره سازی دیسک محلی و ذخیره سازی ابری ریموت (Object Storage) انتخاب کنید. این معماری هنگام ترکیب با صف های کاری پس زمینه، پردازش، تبدیل و ارائه فایل های رسانه ای را در محیط های تک سروری یا سیستم های توزیع شده ابری به صورت روان مدیریت میکند.

## درایورهای ذخیره سازی (Storage Drivers)

Songbird از متغیر محیطی `STORAGE_DRIVER` برای تعیین محل ذخیره سازی فایل های آپلودشده چت، پیوست های رسانه ای و آواتارها استفاده میکند.

| درایور | `STORAGE_DRIVER` | توضیح |
|---|---|---|
| **دیسک محلی** (پیشفرض) | `local` | آپلودها مستقیماً روی فایل سیستم محلی سرور در پوشه `DATA_DIR` (پوشه های `data/uploads/` و `data/avatars/`) ذخیره میشوند. مناسب برای نصب های ساده تک سروری. |
| **ذخیره سازی ابری ریموت** | `remote` | آپلودها در یک باکت سازگار با S3 (مانند AWS S3، Cloudflare R2، MinIO، ArvanCloud، Wasabi) ذخیره میشوند. آپلودها با استفاده از Presigned URL مستقیماً از سمت کلاینت انجام میشوند. |

```bash
# نمونه تنظیم در فایل .env
STORAGE_DRIVER=remote
```

## پیکربندی ذخیره سازی ابری ریموت

هنگامی که `STORAGE_DRIVER=remote` فعال است، متغیرهای محیطی زیر را برای اتصال Songbird به باکت ذخیره سازی ابری خود پیکربندی کنید:

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `STORAGE_DRIVER` | `string` | `local` | برای فعال سازی ذخیره سازی ابری، روی `remote` تنظیم کنید. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی URL سرویس ذخیره سازی ابری (مانند AWS، Cloudflare R2، MinIO، ArvanCloud). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت (Bucket) ذخیره سازی شما. |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت (پیشفرض `auto` که سازگاری بدون نیاز به پیکربندی اضافه را با Cloudflare R2، MinIO، ArvanCloud و سایر سرویس های سازگار با S3 فراهم میکند؛ کاربران AWS S3 میتوانند آن را با کد منطقه خود مانند `us-east-1` یا `eu-central-1` جایگزین کنند). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | شناسه کلید دسترسی (Access Key ID) برای احراز هویت باکت. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید دسترسی محرمانه (Secret Access Key) برای احراز هویت باکت. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | پیشوند URL اختیاری دامنه CDN (مانند `https://cdn.example.com`). در صورت تنظیم، لینک های دانلود عمومی به جای Presigned URLها از این پیشوند استفاده میکنند. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | زمان انقضا به ثانیه برای Presigned URLهای آپلود و دانلود. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | فعال سازی ساختار URL به روش path-style (به صورت `endpoint/bucket/key`). برای MinIO، Cloudflare R2، ArvanCloud، Wasabi و غیره الزامی است. |

### نمونه پیکربندی ارائه دهندگان (Provider Examples)

#### AWS S3

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_FORCE_PATH_STYLE=false
```

#### Cloudflare R2

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
STORAGE_PUBLIC_URL=https://media.example.com
STORAGE_FORCE_PATH_STYLE=true
```

#### MinIO (میزبانی شخصی)

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=http://minio.internal:9000
STORAGE_BUCKET=songbird-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

#### ابر آروان (ArvanCloud Object Storage)

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=ir-thr-at1
STORAGE_ACCESS_KEY_ID=<ARVAN_ACCESS_KEY>
STORAGE_SECRET_ACCESS_KEY=<ARVAN_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
```

## تنظیمات پردازش رسانه ریموت و Fallback

هنگام آپلود فایل های رسانه ای با `STORAGE_DRIVER=remote`، Songbird پردازش فایل ها را به صورت ناهمگام (Asynchronous) انجام میدهد تا سرعت پاسخ دهی آپلود حفظ شود.

### حالت های پردازش (`STORAGE_PROCESSING_MODE`)

| حالت | رفتار |
|---|---|
| `auto` (پیشفرض) | **ترکیبی ریموت با Fallback محلی.** Presigned URLهای آپلود را ارائه میدهد و منتظر میماند تا worker ریموت / پردازش ابری، کار را انجام داده و فراخوانی Webhook (`/api/uploads/webhook/processed`) را انجام دهد. اگر پردازش ریموت ظرف زمان `STORAGE_PROCESSING_TIMEOUT_MS` کامل نشود، worker محلی به طور خودکار پردازش را از طریق ترنسکد محلی FFmpeg برعهده میگیرد. |
| `remote` | **پردازش کاملاً ریموت.** پردازش فایل ها منحصراً توسط workerهای ریموت یا Webhookهای ابری انجام میشود و تایمر Fallback محلی غیرفعال میگردد. |
| `local` | **پردازش کاملاً محلی.** workerهای رسانه ای سرور محلی (FFmpeg / BullMQ) را مجبور میکند تمام فایل های آپلودشده را به صورت محلی پردازش کنند. |

### متغیرهای پیکربندی

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | استراتژی پردازش رسانه (`auto` ، `remote` یا `local`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `30000` | مهلت زمان Fallback به میلی ثانیه (پیشفرض `30000` میلی ثانیه / ۳۰ ثانیه) قبل از آنکه worker محلی BullMQ در حالت `auto` پردازش را تحویل بگیرد. |
| `WEBHOOK_SECRET` | `string` | *(تولید خودکار)* | کلید محرمانه برای احراز هویت درخواست های Webhook دریافتی (`X-Songbird-Webhook-Secret`). در صورت عدم وجود، هنگام راه اندازی سرور به طور خودکار تولید شده، در دیتابیس ذخیره و در فایل `.env` قرار میگیرد. |

### ترنسکد محلی FFmpeg برای ذخیره سازی ابری (Remote Storage)

هنگامی که `STORAGE_DRIVER=remote` (مانند Cloudflare R2 یا AWS S3) همراه با `STORAGE_PROCESSING_MODE=local` یا `auto` فعال باشد، Songbird میتواند ویدیوهای آپلودشده را با استفاده از FFmpeg به صورت محلی روی سرور اصلی پردازش و ترنسکد کند، بدون اینکه نیازی به راه اندازی زیرساخت پردازش خارجی (Serverless) باشد.

#### نحوه عملکرد ترنسکد محلی:
۱. **آپلود مستقیم به ابری**: کلاینت ویدیوی خام اصلی را با استفاده از Presigned URL مستقیماً در ذخیره سازی ابری ریموت آپلود میکند.
۲. **زمانبندی Worker**: در حالت `local` (یا در حالت `auto` اگر Webhook ریموت ظرف زمان `STORAGE_PROCESSING_TIMEOUT_MS` کار را تمام نکند)، صف پسزمینه رسانه Songbird یک کار ترنسکد محلی را زمانبندی میکند.
۳. **دانلود موقت محلی**: Worker محلی فایل ویدیوی خام را موقتاً از ذخیره سازی ابری (Cloudflare R2 / S3) در یک پوشه کاری موقت دیسک محلی دانلود میکند.
۴. **تبدیل FFmpeg و استخراج متادیتا**:
   - ابزار `ffmpeg` ویدیو را به صورت محلی به فرمت H.264 (ویدیو) و AAC (صوت) با پسوند `.mp4` ترنسکد میکند.
   - متادیتای ویدیو (مدت زمان، عرض و ارتفاع) را استخراج میکند.
   - تصویر بندانگشتی (Thumbnail) پیشنمایش تولید میکند.
   - در صورت فعال بودن رمزنگاری محلی (`STORAGE_ENCRYPTION_MODE=local`)، رمزگشایی و رمزنگاری مجدد فایلها به طور خودکار مدیریت میشود.
۵. **آپلود مجدد به ذخیره سازی ابری**: Worker محلی فایل ویدیوی ترنسکدشده H.264 و تصویر Thumbnail تولیدشده را به باکت ذخیره سازی ابری (Cloudflare R2 / S3) آپلود میکند.
۶. **همگامسازی وضعیت و پاکسازی پوشه کاری**: کلیدهای ذخیره سازی ابری جدید در دیتابیس بهروزرسانی شده، رویدادهای همزمان SSE به کلاینتهای متصل ارسال میشوند و فایلهای موقت دیسک محلی بلافاصله حذف میگردند.

:::tip پیشنیازهای ترنسکد محلی
- **فایل اجرایی FFmpeg**: ابزار `ffmpeg` باید روی سرور یا کانتینر اجراکننده بکاند Songbird نصب شده باشد (با دستور `ffmpeg -version` بررسی کنید).
- **فضای دیسک موقت**: مطمئن شوید فضای دیسک موقت کافی روی سرور محلی برای دانلود، ترنسکد و آمادهسازی فایلهای ویدیویی بزرگ قبل از آپلود مجدد به ذخیره سازی ابری وجود دارد.
:::

### نحوه یافتن و استفاده از کلید محرمانه Webhook

سرویس های پردازش بیرونی (مانند AWS Lambda، Cloudflare Workers یا میکروسرویس های اختصاصی) میتوانند پس از اتمام ترنسکد یا پردازش ریموت، پایان کار را به Songbird اطلاع دهند:

۱. هنگام راه اندازی سرور، اگر `WEBHOOK_SECRET` تنظیم نشده باشد، Songbird به طور خودکار یک توکن محرمانه امن تولید کرده، آن را در دیتابیس ذخیره و در فایل `.env` ذخیره میکند.

۲. مدیران سیستم یا پردازنده های ابری میتوانند با مراجعه به فایل `.env` یا بررسی تنظیمات دیتابیس مقدار `WEBHOOK_SECRET` تولیدشده را دریافت کنند.

۳. تابع ابری / Lambda یا worker خارجی خود را طوری تنظیم کنید که هنگام ارسال درخواست های Webhook به نقطه پایانی `/api/uploads/webhook/processed` سرور Songbird، توکن را در هدر HTTP با عنوان `x-songbird-webhook-secret: <WEBHOOK_SECRET>` قرار دهد.

#### درخواست به نقطه پایانی Webhook:
```http
POST /api/uploads/webhook/processed
Header: x-songbird-webhook-secret: <WEBHOOK_SECRET>
Content-Type: application/json

{
  "fileId": 42,
  "status": "ready",
  "transcodedStorageKey": "transcoded/video_720p.mp4",
  "thumbStorageKey": "thumbs/video_thumb.jpg"
}
```

## حالتهای رمزنگاری ریموت (`STORAGE_ENCRYPTION_MODE`)

Songbird دو استراتژی رمزنگاری هنگام استفاده از ذخیره سازی ابری ریموت ارائه میدهد:

| حالت | `STORAGE_ENCRYPTION_MODE` | توضیح |
|---|---|---|
| **رمزنگاری ریموت** (پیشفرض) | `remote` | از رمزنگاری سمت ارائه دهنده / رمزنگاری پیشفرض باکت S3 (مانند SSE-S3 / AES-256) استفاده میکند. درخواست های دانلود ریدایرکت مستقیم 302 با لینک presigned برمی گردانند. |
| **رمزنگاری پاکتی محلی** | `local` | از رمزنگاری پاکتی سمت اپلیکیشن (envelope encryption با AES-256-GCM) همراه با کلیدهای رمزنگاری محلی استفاده میکند. سرور فایل را دریافت و رمزگشایی کرده و سپس به سمت کلاینت استریم میکند. |

```
# رمزنگاری سمت ارائه دهنده / باکت S3 (توصیه شده برای Cloudflare R2 / AWS S3 همراه با CDN)
STORAGE_ENCRYPTION_MODE=remote

# رمزنگاری پاکتی سمت اپلیکیشن
STORAGE_ENCRYPTION_MODE=local
```
