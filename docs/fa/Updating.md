# به‌روزرسانی و دانگرید

نحوه به‌روزرسانی یا دانگرید (بازگشت به نسخه قبل) به این بستگی دارد که Songbird را چگونه نصب کرده اید.

| روش نصب | مسیر به‌روزرسانی / دانگرید |
|---|---|
| اسکریپت نصب | `songbird-deploy` را اجرا کنید و **Update Songbird** را انتخاب کنید (پشتیبان گیری از پایگاه داده، pull یا checkout در Git، بازسازی، مهاجرت ها و راه اندازی مجدد سرویس). |
| Docker | دریافت یا checkout تگ یا کامیت مورد نظر در Git و اجرای `docker compose up -d --build`. |
| دستی (systemd) | دریافت یا checkout تگ یا کامیت مورد نظر در Git، بازسازی کلاینت/سرور و راه اندازی مجدد سرویس. |

:::warning

همیشه پیش از به‌روزرسانی یا دانگرید از پایگاه داده خود پشتیبان بگیرید:

```bash
cd /opt/songbird/server
npm run db:backup
# Or use this for Docker:
docker compose exec songbird npm --prefix /app/server run db:backup
```

:::

:::tip

[اسکریپت نصب](./Deployment-Script.md) هم به‌روزرسانی و هم دانگرید را به صورت خودکار مدیریت میکند و ابتدا پیشنهاد پشتیبان گیری از پایگاه داده را به شما میدهد.

:::

## اسکریپت نصب (songbird-deploy)

اسکریپت تعاملی نصب، ساده ترین راه برای به‌روزرسانی یا دانگرید نمونه Songbird شما است.

ابزار را اجرا کنید:

```bash
songbird-deploy
```

گزینه **2** (**Update Songbird**) را انتخاب کنید.

### ۱. پشتیبان گیری پیش از به‌روزرسانی

اسکریپت از شما سؤال میپرسد:

```txt
Create a database backup before updating? [y/N]
```

انتخاب `yes` یک نسخه پشتیبان با برچسب زمانی پیش از هرگونه تغییر در کد ایجاد میکند.

### ۲. به‌روزرسانی (حالت GitHub)

زمانی که کامیت های جدیدتری روی شاخه `main` موجود باشد، اسکریپت به صورت خودکار:
۱. آخرین تغییرات را با `git pull --ff-only origin main` دریافت میکند.
۲. وابستگی های کلاینت و سرور را به‌روزرسانی میکند.
۳. از پیکربندی صحیح کلیدهای VAPID اطمینان حاصل میکند.
۴. مهاجرت های ساختار پایگاه داده را اجرا میکند (`npm run db:migrate`).
۵. دسترسی های فایل ها و فایل های سرویس systemd را تنظیم میکند.
۶. سرویس `songbird.service` (و `songbird-worker.service` در صورت وجود) را مجدداً راه اندازی کرده و Nginx را reload میکند.

### ۳. دانگرید (حالت GitHub)

اگر نمونه محلی شما از قبل با `origin/main` به روز باشد، اسکریپت به شما اطلاع میدهد:

```txt
Songbird is already up to date.
Do you want to downgrade? [y/N]
```

اگر `yes` را انتخاب کنید:
۱. اسکریپت میپرسد: `Enter version number to install: `.
۲. میتوانید موارد زیر را وارد کنید:
   - یک تگ نسخه معنایی (مانند `0.11.4` یا `v0.11.4`).
   - یک تگ سفارشی در Git (مانند `plain-0.10.0`).
   - نام یک شاخه در Git یا یک هش کامیت مشخص.
۳. اسکریپت مرجع را اعتبارسنجی میکند، نسخه مشخص شده را checkout میکند (`git checkout <ref>`)، وابستگی ها را مجدداً نصب میکند، مهاجرت ها را انجام میدهد و سرویس ها را مجدداً راه اندازی میکند.

### ۴. به‌روزرسانی و دانگرید در حالت آفلاین

هنگام انتخاب حالت **Offline** با استفاده از فایل فشرده zip محلی سورس کد:
- **به‌روزرسانی**: اگر مقدار `VERSION` درون فایل فشرده جدیدتر از `/opt/songbird/VERSION` باشد، اسکریپت اقدام به به‌روزرسانی میکند.
- **دانگرید**: اگر مقدار `VERSION` درون فایل فشرده قدیمی تر از نسخه نصب شده باشد، اسکریپت پیام زیر را نمایش میدهد:
  ```txt
  Local zip version (<source_ver>) is lower than installed version (<install_ver>). Do you want to downgrade to version <source_ver>? [y/N]
  ```
  در صورت تأیید، فایل های آرشیو را استخراج کرده، داده ها و نسخه های پشتیبان را حفظ میکند، وابستگی ها را نصب کرده، مهاجرت ها را اعمال میکند و سرویس ها را مجدداً راه اندازی می نماید.

### ۵. به‌روزرسانی منوی اسکریپت نصب

برای به‌روزرسانی خودِ دستور سراسری `songbird-deploy`:
۱. دستور `songbird-deploy` را اجرا کنید.
۲. گزینه **7** (**Update menu**) را انتخاب کنید.
۳. اسکریپت وجود نسخه جدیدتر در GitHub را بررسی کرده و دستور سراسری را به صورت خودکار به‌روزرسانی میکند (یا در صورت به روز بودن، امکان نصب مجدد را پیشنهاد میدهد).

---

## Docker + Compose

### به‌روزرسانی به آخرین نسخه

```bash
cd /opt/songbird
git pull origin main
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

### دانگرید به یک نسخه مشخص

```bash
cd /opt/songbird
git fetch --all --tags
git checkout v0.11.4 # با تگ یا هش کامیت مورد نظر جایگزین کنید
docker compose -f docker-compose.yaml up -d --build
sudo systemctl reload nginx
```

---

## دستی (systemd)

### به‌روزرسانی به آخرین نسخه

```bash
cd /opt/songbird
git pull origin main
cd client
npm install
npm run build
cd ../server
npm install
npm run db:migrate
sudo systemctl restart songbird
sudo systemctl reload nginx
```

### دانگرید به یک نسخه مشخص

```bash
cd /opt/songbird
git fetch --all --tags
git checkout v0.11.4 # با تگ یا هش کامیت مورد نظر جایگزین کنید
cd client
npm install
npm run build
cd ../server
npm install
npm run db:migrate
sudo systemctl restart songbird
sudo systemctl reload nginx
```

:::info

برای نصب های بدون زمان توقف (zero-downtime) در پروژه‌های بزرگ‌تر، نصب blue-green یا PM2 را در نظر بگیرید، اما برای بیشتر به‌روزرسانی‌ها روش راه‌اندازی مجدد بالا ساده و کافی است.

:::
