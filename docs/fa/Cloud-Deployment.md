# استقرار ابری

این راهنما شامل نحوه استقرار Songbird روی زیرساخت های مدیریت شده ابری از جمله **پلتفرم به عنوان سرویس (PaaS)**، **کانتینر به عنوان سرویس (CaaS)** و پلتفرم های ارکستراسیون کانتینر است.

:::tip به دنبال استقرار روی VPS سلف هاست هستید؟
اگر قصد دارید Songbird را روی یک سرور مجازی (VPS) با استفاده از Docker Compose یا systemd استقرار دهید، به راهنماهای [نصب از طریق Docker](./Installation-Docker.md) یا [اسکریپت نصب](./Deployment-Script.md) مراجعه کنید.
:::

## بررسی اجمالی معماری

بر اساس نیازهای عملیاتی و مقیاس پذیری خود میتوانید Songbird را روی مدل های مختلف ابری استقرار دهید:

| مدل معماری | توضیحات | پلتفرم های مناسب | پشتیبانی در Songbird |
|---|---|---|---|
| **IaaS** *(زیرساخت به عنوان سرویس)* | ماشینهای مجازی مدیریت کننده Docker یا systemd توسط کاربر | AWS EC2, DigitalOcean Droplets, Hetzner | پشتیبانی کامل |
| **PaaS** *(پلتفرم به عنوان سرویس)* | استقرار مستقیم از روی سورس کد مخزن Git | Render, Railway, Heroku, Fly.io | پشتیبانی کامل |
| **CaaS** *(کانتینر به عنوان سرویس)* | استقرار ایمیج های از پیش ساخته شده کانتینر با ارکستراسیون مدیریت شده | AWS ECS / Fargate, Google Cloud Run, Azure Container Apps, Kubernetes | پشتیبانی کامل |

## ۱. استقرار روی PaaS

ارائه دهندگان PaaS به شما اجازه میدهند Songbird را مستقیماً از مخزن Git خود بدون نیاز به مدیریت زیرساخت سرور استقرار دهید.

### تنظیمات ساخت و اجرا

استقرار PaaS خود را با دستورات اجرایی زیر پیکربندی کنید:

- **دستور ساخت (Build Command):**
  ```bash
  npm run build
  ```
- **دستور شروع (Start Command):**
  ```bash
  npm --prefix server run start
  ```
- **نسخه محیط اجرایی Node.js:** Node.js `>=24.18.0`

### استراتژی ذخیره سازی و پایداری داده ها

محیط های PaaS به صورت پیشفرض **موقت (Ephemeral)** هستند — یعنی هر فایلی که روی دیسک محلی ذخیره شود (مانند پایگاه داده SQLite یا فایل های آپلود شده) با هر بار ریستارت یا استقرار مجدد برنامه پاک خواهد شد.

برای اجرای Songbird روی PaaS، یکی از دو استراتژی ذخیره سازی زیر را انتخاب کنید:

#### استراتژی اول: تک نمونه با دیسک پایدار (Persistent Volume)
اگر برنامه را به صورت تک نمونه روی پلتفرم هایی که از volume پشتیبانی میکنند (مانند Railway یا Fly.io) استقرار میدهید:
1. یک دیسک پایدار به کانتینر برنامه متصل کنید (مثلاً در مسیر `/app/data`).
2. متغیر محیطی مسیر داده را تنظیم کنید:
   ```txt
   DATA_DIR=/app/data
   ```

#### استراتژی دوم: پایگاه داده خارجی + ذخیره سازی ابری (پیشنهادی)
برای استقرارهای بدون حالت (Stateless) و بدون قطعی روی PaaS:
1. یک پایگاه داده مدیریت شده **PostgreSQL** راه اندازی کرده و مشخصات اتصال آن را تنظیم کنید:
   ```txt
   DB_CLIENT=postgres
   POSTGRES_URL=postgres://user:password@host:5432/songbird
   ```

   :::tip پایگاه داده مدیریت شده با SSL و CA سفارشی (Aiven, AWS RDS و غیره)
   ارائه دهندگان پایگاه داده ابری (مانند **Aiven**، **AWS RDS** یا **DigitalOcean**) نیاز به اتصالات امن SSL/TLS دارند و از گواهی های صادر شده توسط مرجع گواهی (CA) اختصاصی پروژه استفاده میکنند که در مخزن پیشفرض گواهی های معتبر Node.js وجود ندارد. اتصال به این دیتابیس ها بدون ارائه CA منجر به خطای `SELF_SIGNED_CERT_IN_CHAIN` در زمان راه اندازی میشود.

   **در Render:**
   1. در پنل Aiven یا ارائه دهنده خود، **CA Certificate** را دانلود یا کپی کنید.
   2. در داشبورد Render، به بخش **Environment** سرویس خود بروید.
   3. در بخش **Secret Files**، یک فایل جدید اضافه کنید:
      - **نام فایل:** `aiven-ca.pem` (یا `/etc/secrets/aiven-ca.pem`)
      - **محتوا:** کل متن گواهی PEM را قرار دهید (`-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----`).
   4. متغیر محیطی زیر را به سرویس اضافه کنید:
      ```txt
      NODE_EXTRA_CA_CERTS=/etc/secrets/aiven-ca.pem
      ```

   **در Docker / CaaS / VPS:**
   فایل `ca.pem` را درون کانتینر یا سرور کپی/mount کرده و متغیر محیطی را تنظیم کنید:
   ```txt
   NODE_EXTRA_CA_CERTS=/path/to/ca.pem
   ```
   :::

2. یک باکت **Object Storage سازگار با S3** (مانند AWS S3، Cloudflare R2، MinIO، ArvanCloud و...) برای فایل های پیوست و آواتارها راه اندازی کنید:
   ```txt
   STORAGE_DRIVER=remote
   STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_BUCKET=songbird-uploads
   STORAGE_ACCESS_KEY_ID=your_access_key
   STORAGE_SECRET_ACCESS_KEY=your_secret_key
   STORAGE_REGION=auto
   ```

### استقرار خودکار با Railway (زیرساخت به عنوان کد - IaC)

پروژه Songbird دارای فایل پیکربندی رسمی **زیرساخت به عنوان کد (Infrastructure as Code - IaC)** در مسیر `.railway/railway.ts` است که امکان استقرار خودکار، قابل تکرار و چندسرویسی کامل را روی پلتفرم [Railway](https://railway.com) فراهم میسازد.

#### معماری و منابع ایجاد شده

پیکربندی IaC در Railway به صورت برنامه ریزی شده تمام اجزای کامل Songbird را در قالب یک گروه با نام `"songbird"` ایجاد و به یکدیگر متصل میکند:

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        Railway Project Canvas                          │
│                                                                        │
│   ┌─────────────────────────── "songbird" Group ──────────────────┐    │
│   │                                                               │    │
│   │   ┌──────────────────┐               ┌────────────────────┐   │    │
│   │   │  PostgreSQL      │◀──────────────│  Songbird App      │   │    │
│   │   │  (Managed DB)    │  DATABASE_URL │  (Web & API)       │   │    │
│   │   └──────────────────┘               └────────┬───────────┘   │    │
│   │                                               │               │    │
│   │                                  Private Mesh │ Webhook &     │    │
│   │                                       Network │ Worker URL    │    │
│   │                                               │               │    │
│   │   ┌──────────────────┐               ┌────────▼───────────┐   │    │
│   │   │  Uploads Bucket  │◀──────────────│  Songbird Worker   │   │    │
│   │   │  (S3 Storage)    │  S3 Driver    │  (Media Transcoder)│   │    │
│   │   └────────▲─────────┘               └────────────────────┘   │    │
│   │            │                                  │               │    │
│   │            └──────────────────────────────────┘               │    │
│   │                        S3 Driver                              │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                                                                        │
│                                    ▲                                   │
│                                    │ Public Ingress                    │
│                              Public Domain                             │
└────────────────────────────────────────────────────────────────────────┘
```

#### راهنمای گام به گام استقرار با Railway CLI

برای استقرار Songbird روی Railway با استفاده از ابزار Railway CLI مراحل زیر را دنبال کنید:

##### مرحله ۱: نصب Railway CLI

```bash
npm i -g @railway/cli
# یا در سیستم عامل macOS با Homebrew
brew install railway
```

##### مرحله ۲: ورود به حساب کاربری Railway

```bash
railway login
```

##### مرحله ۳: راه اندازی یا اتصال به پروژه

در ترمینال به دایرکتوری مخزن Songbird رفته و یک پروژه جدید ایجاد یا به پروژه موجود متصل شوید:

```bash
railway init
# یا برای اتصال به پروژه موجود:
railway link
```

##### مرحله ۴: استقرار پشته IaC

دستور استقرار را اجرا کنید. Railway به طور خودکار فایل `.railway/railway.ts` را تشخیص داده و دیتابیس، باکت ذخیره سازی، ورکر و برنامه اصلی را به شکل هماهنگ ایجاد میکند:

```bash
railway up
```

##### مرحله ۵: اختصاص دامنه عمومی برای برنامه Songbird

به صورت پیشفرض، سرویس های Railway روی شبکه خصوصی اجرا میشوند. برای دسترسی کاربران به رابط کاربری وب Songbird:

۱. در [داشبورد Railway](https://railway.com/dashboard) روی سرویس **songbird-server** کلیک کنید.

۲. به بخش **Settings** > **Networking** > **Public Networking** بروید.

۳. روی دکمه **Generate Domain** کلیک کنید (یا دامنه اختصاصی خود را متصل نمایید).

همچنین میتوانید از طریق CLI دامنه عمومی ایجاد کنید:

```bash
railway domain --service songbird-server
```

### استقرار روی Render (Blueprint)

پروژه Songbird شامل [Blueprint آماده Render](https://render.com/docs/blueprints) در فایل `render.yaml` است: یک وب سرویس Docker (`songbird`) به همراه PostgreSQL مدیریت شده. بر خلاف معماری Railway در اینجا سرویس ورکر جداگانه وجود ندارد — نقطه ورود کانتینر به صورت خودکار یک Media Worker داخلی (`WORKER_PORT=8080`) را در کنار برنامه اجرا میکند و خود برنامه روی `PORT` اختصاص یافته توسط Render گوش میدهد، پس این دو هرگز با هم تداخل ندارند.

#### چه چیزهایی ساخته میشود

- **وب سرویس `songbird`** — ساخته شده از `Dockerfile` اصلی (فرانت اند Vite و بک اند Express) با بررسی سلامت در مسیر `/api/health`.
- **PostgreSQL مدیریت شده** — با `POSTGRES_URL` متصل کنید (از connection string *داخلی* دیتابیس استفاده کنید) و `POSTGRES_SSL=true` باشد.

#### مراحل راه اندازی

۱. ریپو را به GitHub بفرستید، سپس در [داشبورد Render](https://dashboard.render.com) گزینه **New → Blueprint** را انتخاب و ریپو را مشخص کنید — فایل `render.yaml` به صورت خودکار شناسایی میشود.

۲. مقادیر محرمانه ای که Render درخواست میکند وارد کنید: `POSTGRES_URL` به همراه تنظیمات ذخیره سازی ابری (`STORAGE_ENDPOINT`، `STORAGE_BUCKET`، `STORAGE_ACCESS_KEY_ID`، `STORAGE_SECRET_ACCESS_KEY` و در صورت نیاز `STORAGE_PUBLIC_URL`).

۳. دیپلوی کنید. تنظیمات دیگری برای ذخیره سازی لازم نیست:

   - سیاست CORS باکت به صورت خودکار از روی `RENDER_EXTERNAL_URL` تنظیم میشود (`STORAGE_AUTO_CORS=true` از پیش در Blueprint آمده است).
   - آدرس کال بک ورکر به صورت خودکار روی URL عمومی سرویس تنظیم میشود — `WEBHOOK_URL` را خالی بگذارید.

#### نکات و محدودیت ها

- **فایل سیستم ناپایدار**: حتماً `STORAGE_DRIVER=remote` به همراه PostgreSQL خارجی داشته باشید (استراتژی دوم در بالا). هرگز روی دیسک محلی Render حساب نکنید.
- **خوابیدن پلن رایگان**: نمونه (و ورکر داخلی داخل آن) پس از بیکاری به خواب میرود، پس اولین درخواست یا آپلود بعد از بیکاری با تأخیر cold-start همراه است.
- **تک نمونه ای**: در پلن های رایگان و starter روی یک نمونه بمانید. مقیاس افقی نیازمند PostgreSQL و S3 مشترک و Redis است مطابق بخش *استقرار روی CaaS و Kubernetes* در ادامه.

## ۲. استقرار روی CaaS و Kubernetes

میتوانید Songbird را در محیط های کانتینری با استفاده از ایمیج های رسمی و از پیش ساخته شده از Docker Hub اجرا کنید:

- **برنامه اصلی (فرانت اند + بک اند):** `bllackbull/songbird:latest`
- **ورکر مدیا مجزا (تبدیل ویدیو و FFmpeg):** `bllackbull/songbird-worker:latest`

### پیکربندی کانتینر

- **پورت بازشده (Exposed Port):** `5174` (یا تنظیم `SERVER_PORT`)
- **مسیر بررسی سلامت (Health Check Path):** `http://localhost:5174/api/health`

### مقیاس پذیری افقی و خوشه های چندنمونه ای (Multi-Instance)

هنگام اجرای چند کانتینر همزمان (به عنوان مثال در چندین task در AWS ECS یا pod در Kubernetes)، نمونه ها باید وضعیت پایگاه داده، فایل ها و پیام های رویدادهای همزمان (Real-time) را با یکدیگر به اشتراک بگذارند.

برای فعالسازی **مقیاس پذیری افقی چندنمونه ای**، سه گانه سرویس های زیر را پیکربندی کنید:

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer / Ingress                  │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
        ┌──────▼──────┐                ┌──────▼──────┐
        │  Songbird   │                │  Songbird   │
        │ Instance 1  │                │ Instance 2  │
        └──────┬──────┘                └──────┬──────┘
               │                              │
     ┌─────────┴──────────────┬───────────────┴─────────┐
     │                        │                         │
┌────▼───────────────┐  ┌─────▼──────────────┐  ┌───────▼─────────────┐
│ Managed PostgreSQL │  │ Shared S3 Storage  │  │ Redis (Pub/Sub &    │
│ (Shared Database)  │  │ (Media & Avatars)  │  │ Background Worker)  │
└────────────────────┘  └────────────────────┘  └─────────────────────┘
```

#### ۱. پایگاه داده مشترک
مقدار `DB_CLIENT=postgres` را به همراه مشخصات اتصال به خوشه PostgreSQL مدیریت شده (مانند AWS RDS یا GCP Cloud SQL) تنظیم کنید:
```txt
DB_CLIENT=postgres
POSTGRES_HOST=postgres.internal
POSTGRES_PORT=5432
POSTGRES_USER=songbird
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=songbird
```

#### ۲. فضای ذخیره سازی فایل مشترک
مقدار `STORAGE_DRIVER=remote` را تنظیم کنید تا فایل های آپلود شده و آواتارهای کاربران روی Object Storage سازگار با S3 قرار گرفته و بین تمام گره ها قابل دسترسی باشند:
```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_ACCESS_KEY_ID=AWS_ACCESS_KEY
STORAGE_SECRET_ACCESS_KEY=AWS_SECRET_KEY
STORAGE_REGION=us-east-1
```

:::tip ترنسکد رسانه در ذخیره سازی ابری
Songbird ترنسکد ویدیو و استخراج thumbnail را به **Media Worker** مستقل (`worker/`) محول میکند که میتواند به عنوان یک سرویس کانتینری مجزا یا در کنار گره های سرور مستقر شود. برای جزئیات معماری و استقرار، مستندات [ورکر مدیا](./Media-Worker.md) و [ذخیره سازی ابری](./Object-Storage.md) را ببینید.
:::

#### ۳. همگام سازی رویدادها با Redis (Pub/Sub)
متغیر `REDIS_URL` یا `REDIS_HOST` را تنظیم کنید. با فعال شدن Redis، سرویس Songbird به طور خودکار از قابلیت Redis Pub/Sub (کانال `songbird:events`) برای همگام سازی همزمان رویدادهای WebSocket و SSE بین تمامی کانتینرها استفاده میکند:
```txt
REDIS_URL=redis://:password@redis.internal:6379
```

:::tip نشست های چسبنده (Sticky Sessions)
برای عملکرد بهینه اتصالات WebSocket در پشت Load Balancerها، قابلیت **Sticky Sessions** (ارتباط نشست بر اساس IP یا کوکی کاربر) را در سطح Ingress یا Load Balancer خود فعال کنید.
:::

## ۳. سازگاری با Serverless

درک نحوه تعامل Songbird با مدل های اجرای Serverless پیش از استقرار بسیار حائز اهمیت است.

### توابع به عنوان سرویس (FaaS) — ضد الگو (Anti-Pattern)

پلتفرم هایی مانند **AWS Lambda**، **Vercel Serverless Functions** یا **Netlify Functions** کد را در پاسخ به درخواست های مجزای HTTP اجرا کرده و بلافاصله پس از آن محیط اجرا را متوقف میکنند.

:::danger محیط های FaaS پشتیبانی نمیشوند
استقرار Songbird به عنوان یک برنامه FaaS (مثلاً روی Vercel Functions یا AWS Lambda) **پشتیبانی نمیشود**. FaaS یک ضد الگو (Anti-pattern) معماری برای پلتفرم های چت همزمان مانند Songbird است، زیرا:

۱. **اتصالات پایدار (Persistent Connections):** سرویس Songbird برای تحویل آنی پیام ها به اتصالات طولانی مدت WebSocket و Server-Sent Events (SSE) متکی است. محیط های FaaS تایم اوت های سختی روی اتصالات اعمال میکنند (معمولاً ۱۵ ثانیه تا ۱۵ دقیقه) و اتصالات کاربران را قطع میکنند.

۲. **فرآیندهای پس زمینه (Background Processes):** سرویس Songbird از تایمرهای پس زمینه حافظه برای heartbeatها، صف های پخش SSE و همگام سازی Remote Channel استفاده میکند. FaaS فرآیند برنامه را بین درخواست ها متوقف کرده یا میکشد که باعث اختلال در ارسال پیام ها میشود.

۳. **وضعیت و حافظه (State & Memory):** کش های درون حافظه و ثبت نام اتصالات با خاموش شدن نمونه های FaaS از بین میروند.
:::

### کانتینرهای Serverless — پشتیبانی کامل

نباید **توابع به عنوان سرویس (FaaS)** را با **کانتینرهای Serverless** اشتباه گرفت:

- **کانتینرهای Serverless** (مانند **Google Cloud Run**، **AWS Fargate** یا **Azure Container Apps**) کانتینرهای کامل Docker را بدون نیاز به مدیریت ماشین های مجازی اجرا میکنند.
- بر خلاف FaaS، کانتینرهای Serverless اجرای مداوم، پشتیبانی کامل از WebSocket/SSE، فرآیندهای طولانی مدت و کارگران پس زمینه را ارائه میدهند.
- سرویس Songbird **به طور کامل** با پلتفرم های کانتینری Serverless سازگار است.
