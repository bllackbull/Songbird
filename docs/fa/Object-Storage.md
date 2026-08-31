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

## پیکربندی ذخیره سازی ابری ریموت

هنگامی که `STORAGE_DRIVER=remote` فعال است، متغیرهای محیطی زیر را برای اتصال Songbird به باکت ذخیره سازی ابری خود تنظیم کنید:

| متغیر | نوع | پیشفرض | توضیح |
|---|---|---:|---|
| `STORAGE_DRIVER` | `string` | `local` | برای فعال سازی ذخیره سازی ابری، روی `remote` تنظیم کنید. |
| `STORAGE_ENDPOINT` | `string` | `""` | نشانی URL سرویس ذخیره سازی سازگار با S3 (مانند AWS، Cloudflare R2، MinIO، ArvanCloud). |
| `STORAGE_BUCKET` | `string` | `""` | نام باکت (Bucket) ذخیره سازی شما. |
| `STORAGE_REGION` | `string` | `auto` | منطقه جغرافیایی باکت (پیشفرض `auto` برای سرویس های Cloudflare R2، MinIO و ArvanCloud؛ کاربران AWS S3 میتوانند منطقه اختصاصی مانند `us-east-1` را وارد کنند). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | کلید دسترسی (Access Key ID) برای احراز هویت باکت. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | کلید مخفی (Secret Access Key) برای احراز هویت باکت. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | پیشوند اختیاری دامنه CDN اختصاصی (مانند `https://cdn.example.com`). در صورت تنظیم، لینک های دانلود عمومی به جای Presigned URL از این پیشوند استفاده میکنند. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | مدت زمان انقضای توکن های Presigned URL برای آپلود و دانلود بر حسب ثانیه. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | فعال سازی فرمت آدرس دهی Path-Style (به صورت `endpoint/bucket/key`). برای Cloudflare R2، MinIO، ArvanCloud، Wasabi و غیره الزامی است. |

### نمونه های پیکربندی ارائه دهندگان

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
