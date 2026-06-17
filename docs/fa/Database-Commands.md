# دستورات پایگاه داده

Songbird مجموعه‌ای از اسکریپت‌های `npm` را برای مدیریت پایگاه داده، کاربران، چت‌ها، فایل‌ها و پشتیبان‌ها از خط فرمان ارائه می‌دهد. آن‌ها را از پوشه `server/` اجرا کنید:

```bash
cd /opt/songbird/server
```

:::tip

همچنین می‌توانید هر دستور پایگاه داده را به‌صورت تعاملی از طریق [اسکریپت نصب](./Deployment-Script.md) (`songbird-deploy`) اجرا کنید.

:::

## قراردادها

چند قاعده در همه دستورها اعمال می‌شوند:

| قرارداد | جزئیات |
|---|---|
| جداکننده `--` | هنگام اجرا از طریق npm، `--` را پیش از هر پرچم یا آرگومان قرار دهید تا npm آن‌ها را به اسکریپت ارسال کند (برای مثال `npm run db:backup -- --password "secret"`). |
| انتخاب‌گرها | دستورهایی که یک کاربر، چت یا فایل را هدف قرار می‌دهند، یا یک **id** عددی یا یک **name** (نام کاربری / نام کاربری گروه / نام فایل ذخیره‌شده) را می‌پذیرند. |
| پرچم‌های اجبار | دستورهای مخرب برای تأیید پرسش می‌کنند. برای رد شدن از پرسش در زمینه‌های غیرتعاملی، `-y` یا `--yes` را پاس دهید. |
| `--all` | دستورهای حذف انبوه بدون یک `--all` صریح زمانی که هیچ انتخاب‌گری داده نشده باشد، اجرا نمی‌شوند. |
| راهنمای داخلی | برای یک برگه راهنمای فشرده از هر دستور، `npm run db:help` را اجرا کنید. |

## مرجع سریع

| دستور | هدف |
|---|---|
| `npm run db:help` | چاپ راهنمای داخلی دستورها. |
| `npm run db:backup` | ایجاد یک فایل zip پشتیبان رمزنگاری‌شده از `.env` و `data/`. |
| `npm run db:restore` | بازیابی پایگاه داده و آپلودها از یک فایل zip پشتیبان. |
| `npm run db:vacuum` | فشرده‌سازی فایل پایگاه داده SQLite. |
| `npm run db:migrate` | اعمال migrationهای در انتظار پایگاه داده. |
| `npm run db:reset` | پاک‌کردن محتوای پایگاه داده و فایل‌های پیام آپلودشده. |
| `npm run db:delete` | حذف فایل پایگاه داده. |
| `npm run db:inspect` | چاپ یک خلاصه کامل (کاربران، چت‌ها، پیام‌ها، فایل‌ها، دیسک). |
| `npm run db:chat:inspect` | بازرسی فقط چت‌ها. |
| `npm run db:user:inspect` | بازرسی فقط کاربران. |
| `npm run db:file:inspect` | بازرسی فقط فایل‌ها. |
| `npm run db:user:create` | ایجاد یک کاربر منفرد. |
| `npm run db:user:generate` | تولید کاربران آزمایشی تصادفی. |
| `npm run db:user:edit` | ویرایش پروفایل یک کاربر. |
| `npm run db:user:ban` | تغییر وضعیت مسدودیت یک کاربر. |
| `npm run db:user:delete` | حذف یک، چند یا همه کاربران. |
| `npm run db:chat:create` | ایجاد یک گروه یا کانال (به‌صورت اختیاری یک کانال راه دور). |
| `npm run db:chat:add` | افزودن اعضا به یک گروه یا کانال. |
| `npm run db:chat:edit` | ویرایش پروفایل چت، مالکیت، یا پیکربندی کانال راه دور. |
| `npm run db:chat:delete` | حذف یک، چند یا همه چت‌ها. |
| `npm run db:file:delete` | حذف فایل‌های پیام آپلودشده و/یا آواتارها. |
| `npm run db:message:generate` | تولید پیام‌های تصادفی بین دو کاربر. |
| `npm run remote:configure` | پیکربندی اعتبارنامه‌های Telegram برای کانال راه دور. |

---

## پشتیبان‌گیری و بازیابی

### `db:backup`

فایل `data/backups/songbird-backup-<timestamp>.zip` را که شامل `.env` و پوشه `data/` است ایجاد می‌کند. آرشیو با رمز عبور محافظت می‌شود.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `--password <value>` | خیر | رمز عبور آرشیو. اگر حذف شود، به‌صورت تعاملی از شما پرسیده می‌شود. |

```bash
npm run db:backup -- --password "backup-password"
```

:::info

به باینری `zip` نیاز دارد. در صورت نیاز آن را با متغیر محیطی `ZIP_BIN` بازنویسی کنید.

:::

### `db:restore`

`.env`، `songbird.db` و `uploads/` را از یک فایل zip پشتیبان بازیابی می‌کند. هنگام اجرا به‌عنوان root روی یک نصب systemd، همچنین مالکیت را اصلاح کرده و `songbird.service` را راه‌اندازی مجدد می‌کند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `--file <path>` | خیر | مسیر فایل zip پشتیبان. اگر حذف شود، جدیدترین پشتیبان در `data/backups/` یا `/root` به‌طور خودکار شناسایی می‌شود، در غیر این صورت از شما پرسیده می‌شود. |
| `--password <value>` | خیر | رمز عبور آرشیو. در صورت نیاز به‌صورت تعاملی پرسیده می‌شود. |
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:restore -- -y
npm run db:restore -- --file /path/to/songbird-backup.zip --password "backup-password" -y
```

چیدمان آرشیو پشتیبان:

```text
songbird-backup-YYYY-MM-DDTHH-MM-SS-sssZ.zip
|- .env
`- data/
   |- songbird.db
   `- uploads/
```

:::info

پشتیبان‌های قدیمی که `songbird.db` و `uploads/` را در ریشه zip دارند نیز پذیرفته می‌شوند.

:::

---

## نگه‌داری

### `db:vacuum`

فایل پایگاه داده را برای بازپس‌گیری فضا فشرده می‌کند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:vacuum -- -y
```

### `db:migrate`

هر migration در انتظاری را اعمال می‌کند. migrationها همچنین هنگام راه‌اندازی سرور به‌طور خودکار اجرا می‌شوند.

```bash
npm run db:migrate
```

### `db:reset`

محتوای پایگاه داده و فایل‌های پیام آپلودشده را پاک می‌کند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |
| `--recreate` | خیر | ایجاد دوباره یک پایگاه داده تازه پس از پاک‌کردن (با `-y` به‌طور ضمنی اعمال می‌شود). |
| `--no-recreate` | خیر | پاک‌کردن بدون ایجاد دوباره پایگاه داده. |

```bash
npm run db:reset -- -y --recreate
npm run db:reset -- -y --no-recreate
```

### `db:delete`

فایل پایگاه داده را به‌کلی حذف می‌کند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:delete -- -y
```

---

## بازرسی

### `db:inspect` و دستورهای مرتبط

شمارش‌ها، استفاده از دیسک و ردیف‌های هر موجودیت را چاپ می‌کند. گونه‌های `db:chat:inspect`، `db:user:inspect` و `db:file:inspect` خروجی را به یک موجودیت محدود می‌کنند.

| آرگومان / پرچم | موردنیاز | پیش‌فرض | توضیح |
|---|---|---|---|
| `--limit <n>` | خیر | `25` | حداکثر ردیف‌های فهرست‌شده برای هر موجودیت (`1`-`1000`). به‌عنوان یک عدد موضعی نیز پذیرفته می‌شود. |

```bash
npm run db:inspect
npm run db:inspect -- --limit 50
npm run db:chat:inspect
npm run db:user:inspect
npm run db:file:inspect
```

---

## کاربران

### `db:user:create`

یک کاربر منفرد ایجاد می‌کند. پرچم‌های نام‌دار یا سه آرگومان موضعی (`nickname`، `username`، `password`) را می‌پذیرد.

| پرچم | موضعی | موردنیاز | توضیح |
|---|---|---|---|
| `--nickname <value>` | اول | بله | نام نمایشی. حداکثر طول از `NICKNAME_MAX_CHARS` پیروی می‌کند. |
| `--username <value>` | دوم | بله | حروف کوچک، اعداد، `.`، `_`. حداقل ۳ کاراکتر، حداکثر از `USERNAME_MAX_CHARS` پیروی می‌کند. |
| `--password <value>` | سوم | بله | رمز عبور حساب (هنگام ذخیره با bcrypt هش می‌شود). |

```bash
npm run db:user:create -- --nickname "Songbird Sage" --username songbird.sage --password "12345678"

# positional form:
npm run db:user:create -- "Songbird Sage" songbird.sage "12345678"
```

### `db:user:generate`

کاربران آزمایشی تصادفی ایجاد می‌کند.

| پرچم | موضعی | موردنیاز | پیش‌فرض | توضیح |
|---|---|---|---|---|
| `--count <n>` | اول | خیر | `10` | تعداد کاربران برای ایجاد (`1`-`5000`). |
| `--password <value>` | دوم | خیر | `Passw0rd!` | رمز عبور مشترک برای همه کاربران تولیدشده. |
| `--nickname-prefix <value>` | — | خیر | `User` | پیشوند برای نام‌های مستعار تولیدشده. |
| `--username-prefix <value>` | — | خیر | `user` | پیشوند برای نام‌های کاربری تولیدشده. |

```bash
npm run db:user:generate -- --count 50 --password "12345678"
npm run db:user:generate -- --count 50 --password "12345678" --nickname-prefix Member --username-prefix member
```

### `db:user:edit`

پروفایل یک کاربر را ویرایش می‌کند. اولین آرگومان موضعی، انتخاب‌گر کاربر است (id یا نام کاربری).

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<user-id-or-username>` | بله | کاربری که باید ویرایش شود. |
| `--username <value>` | خیر | نام کاربری جدید (همان قواعد ایجاد). |
| `--nickname <value>` | خیر | نام نمایشی جدید. |
| `--avatar-url <value>` | خیر | نشانی آواتار، برای مثال `/api/uploads/avatars/file.png`. |
| `--status <online\|invisible>` | خیر | وضعیت حضور. |
| `--color <#hex>` | خیر | رنگ پروفایل، برای مثال `#10b981`. |

```bash
npm run db:user:edit -- songbird.sage --nickname "Songbird Sage" --color "#ff6b6b"
npm run db:user:edit -- 1 --username songbird.admin --status invisible
```

### `db:user:ban`

وضعیت مسدودیت یک کاربر را تغییر می‌دهد. اجرای دوباره آن، رفع مسدودیت می‌کند. مسدودکردن همچنین همه نشست‌های کاربر را منقضی می‌کند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<user-id-or-username>` | بله | کاربری که باید مسدود یا رفع‌مسدود شود. |
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:user:ban -- songbird.sage
# run again to unban:
npm run db:user:ban -- songbird.sage
```

### `db:user:delete`

یک، چند یا همه کاربران را همراه با نشست‌ها و پیام‌هایشان حذف می‌کند. چت‌های متعلق به آن‌ها یا حذف می‌شوند (اگر عضوی باقی نماند) یا به یک عضو باقی‌مانده تصادفی منتقل می‌شوند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<user-id-or-username> [more...]` | مشروط | یک یا چند کاربر برای حذف. موردنیاز مگر آنکه `--all` داده شود. |
| `--all` | مشروط | حذف هر کاربر. هنگامی که هیچ انتخاب‌گری ارائه نشده باشد موردنیاز است. |
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:user:delete -- songbird.sage -y
npm run db:user:delete -- --all -y
```

---

## چت‌ها

### `db:chat:create`

یک گروه یا کانال ایجاد می‌کند. کانال‌ها می‌توانند به‌صورت اختیاری در زمان ایجاد به‌عنوان یک کانال راه دور پیکربندی شوند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `--type <group\|channel>` | بله | نوع چت. |
| `--name <value>` | بله | نام نمایشی. |
| `--owner <user>` | بله | کاربر مالک (id یا نام کاربری). |
| `--username <value>` | بله | شناسه عمومی برای چت. |
| `--visibility <public\|private>` | خیر | قابلیت دیده‌شدن (پیش‌فرض public). |
| `--users <a,b,c>` | خیر | اعضای اولیه جداشده با کاما. |
| `--remote-channel <source>` | خیر | منبع Telegram (`@name`، پیوند `t.me`، یا شناسه عددی). فقط کانال‌ها؛ به `REMOTE_CHANNEL=true` نیاز دارد. |
| `--sync-metadata` | خیر | کپی عنوان/آواتار منبع به کانال. |
| `--stream-media` | خیر | دانلود رسانه منبع به آپلودهای Songbird. |

```bash
npm run db:chat:create -- --type group --name "Core Team" --owner songbird.sage --username core.team --visibility private --users songbird.sage2,songbird.sage3

npm run db:chat:create -- --type channel --name "Announcements" --owner songbird.sage --username announcements

# Channel with a Remote Channel source:
npm run db:chat:create -- --type channel --name "My Channel" --owner alice --username my_channel --remote-channel @telegram_source --sync-metadata --stream-media
```

### `db:chat:add`

اعضا را به یک گروه یا کانال اضافه می‌کند. اولین آرگومان موضعی، انتخاب‌گر چت است. کاربرانی که پیش‌تر خارج شده‌اند نادیده گرفته می‌شوند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<chat-id-or-username>` | بله | چت هدف. |
| `<user> [more...]` | مشروط | یک یا چند کاربر برای افزودن. موردنیاز مگر آنکه `--all` داده شود. |
| `--all` | مشروط | افزودن هر کاربر در پایگاه داده. |

```bash
npm run db:chat:add -- core.team songbird.sage2 songbird.sage3
npm run db:chat:add -- 1 --all
```

### `db:chat:edit`

پروفایل یک چت را ویرایش می‌کند، مالکیت را منتقل می‌کند، یا کانال راه دور آن را مدیریت می‌کند. اولین آرگومان موضعی، انتخاب‌گر چت است.

**پرچم‌های پروفایل:**

| پرچم | توضیح |
|---|---|
| `--name <value>` | نام نمایشی جدید. |
| `--username <value>` | شناسه عمومی جدید. |
| `--visibility <public\|private>` | قابلیت دیده‌شدن جدید. |
| `--color <#hex>` | رنگ جدید چت. |
| `--owner <user>` | انتقال مالکیت به کاربر دیگر. |
| `--allow-member-invites` / `--disallow-member-invites` | تغییر دعوت‌های اعضا (فقط چت‌های خصوصی؛ چت‌های عمومی همیشه آن‌ها را مجاز می‌کنند). |

**پرچم‌های پیکربندی کانال راه دور (فقط کانال‌ها):**

| پرچم | توضیح |
|---|---|
| `--remote-channel <source>` | تنظیم/جایگزینی منبع Telegram. |
| `--sync-metadata` / `--no-sync-metadata` | فعال/غیرفعال‌کردن همگام‌سازی متادیتا. |
| `--stream-media` / `--no-stream-media` | فعال/غیرفعال‌کردن استریم رسانه. |

**پرچم‌های کنترل کانال راه دور:**

| پرچم | توضیح |
|---|---|
| `--enable-remote` / `--disable-remote` | فعال یا غیرفعال‌کردن منبع پیکربندی‌شده. |
| `--pause-queue` / `--resume-queue` | توقف یا از‌سرگیری پردازش صف بازتاب. |
| `--skip-queue` | رد شدن از آیتم فعلی صف. |
| `--skip-all-queue` | رد شدن از همه آیتم‌های در انتظار/تلاش مجدد صف. |

```bash
npm run db:chat:edit -- core.team --name "Core Team HQ" --visibility public --color "#14b8a6"
npm run db:chat:edit -- 1 --owner songbird.sage2

# Remote Channel:
npm run db:chat:edit -- my_channel --remote-channel @new_telegram_source
npm run db:chat:edit -- my_channel --no-stream-media
npm run db:chat:edit -- my_channel --enable-remote
npm run db:chat:edit -- my_channel --pause-queue
npm run db:chat:edit -- my_channel --skip-all-queue
```

### `db:chat:delete`

یک، چند یا همه چت‌ها و داده‌های مرتبط با آن‌ها (پیام‌ها، اعضا، فایل‌ها) را حذف می‌کند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<chat-id-or-username> [more...]` | مشروط | یک یا چند چت برای حذف. موردنیاز مگر آنکه `--all` داده شود. |
| `--all` | مشروط | حذف هر چت. هنگامی که هیچ انتخاب‌گری ارائه نشده باشد موردنیاز است. |
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:chat:delete -- 12 -y
npm run db:chat:delete -- core.team -y
npm run db:chat:delete -- --all -y
```

---

## فایل‌ها

### `db:file:delete`

فایل‌های پیام آپلودشده و/یا فایل‌های آواتار را، هم از پایگاه داده و هم از دیسک، حذف می‌کند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<file-id-or-name> [more...]` | مشروط | شناسه‌های فایل یا نام‌های فایل ذخیره‌شده برای حذف. موردنیاز مگر آنکه `--all` داده شود. |
| `--all` | مشروط | حذف همه فایل‌های آپلودشده (فایل‌های پیام + آواتارها). |
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:file:delete -- 42 -y
npm run db:file:delete -- stored-file-name.ext -y
npm run db:file:delete -- --all -y
```

---

## پیام‌ها

### `db:message:generate`

پیام‌های تصادفی در یک چت بین دو کاربر تولید می‌کند. آرگومان‌های موضعی یا پرچم‌های نام‌دار را می‌پذیرد.

| آرگومان / پرچم | موضعی | موردنیاز | پیش‌فرض | توضیح |
|---|---|---|---|---|
| `--chatId <id>` | اول | بله | — | شناسه چت هدف. |
| `--userA <user>` | دوم | بله | — | شرکت‌کننده اول (id یا نام کاربری). |
| `--userB <user>` | سوم | بله | — | شرکت‌کننده دوم (id یا نام کاربری). |
| `--count <n>` | چهارم | خیر | `1` | تعداد پیام‌ها (`1`-`10000`). |
| `--days <n>` | پنجم | خیر | `7` | پخش پیام‌ها در N روز گذشته (`1`-`365`). |

```bash
npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7
npm run db:message:generate -- --chatId 1 --userA songbird.sage --userB songbird.sage2 --count 300 --days 7
```

---

## اجرای دستورها از طریق Docker

هر اسکریپت npm را داخل کانتینر درحال‌اجرا با پیشوند `--prefix /app/server` اجرا کنید:

```bash
docker compose exec songbird npm --prefix /app/server run db:backup
docker compose exec songbird npm --prefix /app/server run db:migrate
docker compose exec songbird npm --prefix /app/server run db:inspect
```
