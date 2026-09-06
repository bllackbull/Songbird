# دستورات پایگاه داده

Songbird از هر دو موتور پایگاه داده SQLite (پیشفرض) و PostgreSQL پشتیبانی می کند و مجموعه ای از اسکریپته ای `npm` را برای مدیریت پایگاه داده، کاربران، چت ها، فایل ها و پشتیبان ها از خط فرمان ارائه می دهد. آنها را از پوشه `server/` اجرا کنید:

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

### مالکیت پوشه داده

دستورهای پشتیبانی شده پایگاه داده از یک اجراکننده پیش از Node استفاده میکنند و از حساب runtime ‏Songbird پیروی میکنند:

- **Docker:** دستور با UID/GID فعلی container اجرا میشود. Docker از `songbird.service` استفاده نمیکند.
- **systemd:** دستور از `User=` و `Group=` مؤثر در `songbird.service`، از جمله overrideهای systemd، پیروی میکند. نبودن `Group=` به primary group کاربر service تبدیل میشود. وقتی root یک دستور را برای حساب service غیر root اجرا میکند، اجراکننده فقط پوشه `data/` همین installation را اصلاح کرده و سپس به همان حساب پیکربندی شده تغییر میکند.
- **manual/no-systemd:** دستور از حساب فعلی فراخواننده استفاده میکند. هیچ حسابی ایجاد نمیکند و تلاشی برای اصلاح مالکیت ندارد.

اگر `User=` وجود نداشته باشد یا `User=root` باشد، دستور systemd با root باقی میماند: نه `chown` اجرا میکند و نه کاربر را تغییر میدهد. با این حال، `Group=` صریح حفظ میشود؛ برای نمونه، `User=root` و `Group=appgroup` دستور را با `root:appgroup` اجرا میکند. برای امنیت، مسیر اصلاح root/non-root-systemd فقط پوشه `data/` همان نصب را که کنار اجراکننده است میپذیرد (در نصب استاندارد: `/opt/songbird/data`)؛ به جای تغییر بازگشتی مالکیت یک مسیر دلخواه، `DATA_DIR` بازنویسی شده را رد میکند.

`DATA_DIR` شامل داده های SQLite مدیریت شده توسط برنامه، upload ها و backup ها است. داده های server ‏PostgreSQL به صورت خارجی توسط PostgreSQL مدیریت میشوند و در این پوشه قرار ندارند یا توسط آن تغییر نمیکنند.

:::warning

اسکریپت های مجزا را با `sudo node` یا `sudo npm` اجرا نکنید. این اجرای مستقیم اجراکننده را دور میزند و پشتیبانی نمیشود. به جای آن از دستورهای مستندشده `npm run db:*` استفاده کنید.

:::

## مرجع سریع

| دستور | هدف |
|---|---|
| `npm run db:help` | چاپ راهنمای داخلی دستورها. |
| [`npm run db:backup`](#db-backup) | ایجاد پشتیبان سازگار با موتور پایگاه داده. |
| [`npm run db:restore`](#db-restore) | بازیابی پشتیبان سازگار با موتور پایگاه داده. |
| [`npm run db:vacuum`](#db-vacuum) | فشردهسازی SQLite یا اجرای `VACUUM ANALYZE` در PostgreSQL. |
| [`npm run db:migrate`](#db-migrate) | اعمال migrationهای در انتظار پایگاه داده. |
| [`npm run db:reset`](#db-reset) | پاککردن محتوای پایگاه داده و فایلهای پیام آپلودشده. |
| [`npm run db:delete`](#db-delete) | حذف فایل پایگاه داده. |
| [`npm run db:inspect`](#db-inspect-و-دستورهای-مرتبط) | چاپ یک خلاصه کامل (کاربران، چتها، پیامها، فایلها، دیسک). |
| [`npm run db:chat:inspect`](#db-inspect-و-دستورهای-مرتبط) | بازرسی فقط چتها. |
| [`npm run db:user:inspect`](#db-inspect-و-دستورهای-مرتبط) | بازرسی فقط کاربران. |
| [`npm run db:file:inspect`](#db-inspect-و-دستورهای-مرتبط) | بازرسی فقط فایلها. |
| [`npm run db:user:create`](#db-user-create) | ایجاد یک کاربر منفرد. |
| [`npm run db:user:generate`](#db-user-generate) | تولید کاربران آزمایشی تصادفی. |
| [`npm run db:user:edit`](#db-user-edit) | ویرایش پروفایل یک کاربر. |
| [`npm run db:user:ban`](#db-user-ban) | تغییر وضعیت مسدودیت یک کاربر. |
| [`npm run db:user:verify`](#db-user-verify) | تغییر وضعیت تأییدشدهبودن یک کاربر. |
| [`npm run db:user:delete`](#db-user-delete) | حذف یک، چند یا همه کاربران. |
| [`npm run db:chat:create`](#db-chat-create) | ایجاد یک گروه یا کانال (بهصورت اختیاری یک کانال ریموت). |
| [`npm run db:chat:add`](#db-chat-add) | افزودن اعضا به یک گروه یا کانال. |
| [`npm run db:chat:edit`](#db-chat-edit) | ویرایش پروفایل چت، مالکیت، یا پیکربندی کانال ریموت. |
| [`npm run db:chat:verify`](#db-chat-verify) | تغییر وضعیت تأییدشدهبودن یک چت. |
| [`npm run db:chat:delete`](#db-chat-delete) | حذف یک، چند یا همه چتها. |
| [`npm run db:file:delete`](#db-file-delete) | حذف فایلهای پیام آپلودشده و/یا آواتارها. |
| [`npm run db:message:generate`](#db-message-generate) | تولید پیامهای تصادفی بین دو کاربر. |
| [`npm run remote:configure`](#remote-configure) | پیکربندی اعتبارنامه های Telegram برای کانال ریموت. |

## پشتیبان‌گیری و بازیابی

### `db:backup`

یک پشتیبان زمان‌دار و سازگار با موتور را در `data/backups/` ایجاد می‌کند:

- **SQLite:** از `songbird.db` در `songbird-backup-<timestamp>.db` کپی می‌گیرد.
- **PostgreSQL:** با `pg_dump --format=custom` یک آرشیو `songbird-backup-<timestamp>.dump` ایجاد می‌کند.

```bash
# SQLite یا PostgreSQL؛ پسوند از DB_CLIENT انتخاب می‌شود
npm run db:backup
```

:::info

پشتیبان فقط محتوای پایگاه داده را دارد و شامل `.env`، آپلودهای محلی یا اشیای ذخیره‌سازی راه‌دور نیست؛ آن‌ها را جداگانه مدیریت کنید.

ابزارهای PostgreSQL شامل `pg_dump`، `pg_restore`، `vacuumdb`، `dropdb` و `createdb` باید در `PATH` باشند و کاربر پیکربندی‌شده پایگاه داده به مجوزهای متناظر PostgreSQL نیاز دارد.

:::

### `db:restore`

جدیدترین پشتیبان سازگار یا فایل انتخاب‌شده را بازیابی می‌کند. SQLite فایل‌های `.db` و PostgreSQL آرشیوهای بومی `.dump` را می‌پذیرند؛ PostgreSQL پیش از بازیابی فایل را با `pg_restore --list` اعتبارسنجی می‌کند.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `--file <path>` | خیر | مسیر پشتیبان `.db` در حالت SQLite یا آرشیو `.dump` در حالت PostgreSQL. |
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:restore -- -y --file /path/to/songbird-backup.db
npm run db:restore -- -y --file /path/to/songbird-backup.dump
```

:::warning PostgreSQL باید آفلاین باشد

پیش از اجرای `db:restore` برای PostgreSQL، Songbird را متوقف کنید. دستور بومی `pg_restore --clean` اشیای پایگاه داده را جایگزین می‌کند و نمی‌تواند با اطمینان از طریق فرآیند زنده Songbird اجرا شود. Songbird را فقط پس از موفقیت دستور شروع یا ریستارت کنید.

:::


## نگه‌داری

### `db:vacuum`

SQLite را با `VACUUM` فشرده می‌کند؛ در حالت PostgreSQL ابزار بومی `vacuumdb --analyze` (`VACUUM ANALYZE`) را اجرا می‌کند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:vacuum -- -y
```

### مهاجرت از SQLite به PostgreSQL

برای تبدیل دیتابیس SQLite به PostgreSQL، استفاده از ابزارهای استاندارد صنعتی مانند [**pgloader**](https://pgloader.readthedocs.io/) توصیه میشود که انتقال مطمئن داده ها، تبدیل خودکار انواع فیلدها و حفظ سازگاری sequenceها را به صورت امن فراهم میکنند.

#### ۱. آماده سازی پایگاه داده PostgreSQL مقصد

اطلاعات اتصال PostgreSQL را در فایل `.env` تنظیم کرده (`DB_CLIENT=postgres` و متغیرهای `POSTGRES_*`) و migrationها را اجرا کنید تا اسکیما ایجاد شود:

```bash
# اعمال migrationها برای ایجاد جداول در PostgreSQL
npm run db:migrate
```

#### ۲. نصب pgloader

```bash
# دبیان / اوبونتو
sudo apt-get install -y pgloader
```

#### ۳. اجرای انتقال با pgloader

```bash
pgloader ./data/songbird.db postgresql://songbird:password@localhost:5432/songbird
```

یا با استفاده از یک فایل پیکربندی `songbird.load`:

```lisp
LOAD DATABASE
     FROM sqlite://./data/songbird.db
     INTO postgresql://songbird:password@localhost:5432/songbird

 WITH include drop, create tables, create indexes, reset sequences

  SET work_mem to '16MB', maintenance_work_mem to '512MB';
```

```bash
pgloader songbird.load
```

### `db:migrate`

هر migration در انتظاری را اعمال می‌کند. migrationها همچنین هنگام راه‌اندازی سرور به‌طور خودکار اجرا می‌شوند.

```bash
npm run db:migrate
```

### `db:reset`

محتوای پایگاه داده و فایل‌های پیام آپلودشده محلی را پاک می‌کند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |
| `--recreate` | خیر | ایجاد دوباره یک پایگاه داده تازه پس از پاک‌کردن (با `-y` به‌طور ضمنی اعمال می‌شود). |
| `--no-recreate` | خیر | پاک‌کردن بدون ایجاد دوباره پایگاه داده. |

```bash
npm run db:reset -- -y --recreate
npm run db:reset -- -y --no-recreate
```

:::info رفتار آنلاین دربرابر آفلاین

وقتی Songbird در حال اجرا است، دستور به سرور محلی احرازشده واگذار می‌شود و بازنشانی حفظ‌کننده schema را انجام می‌دهد. وقتی Songbird متوقف است، SQLite فایل پایگاه داده را حذف می‌کند و PostgreSQL پایگاه داده را drop می‌کند؛ سپس هر موتور را می‌توان دوباره ایجاد و migrate کرد.


:::

### `db:delete`

فایل پایگاه داده SQLite را حذف می‌کند یا در حالت PostgreSQL با ابزار بومی `dropdb` پایگاه داده PostgreSQL را حذف می‌کند.

| پرچم | موردنیاز | توضیح |
|---|---|---|
| `-y`، `--yes` | خیر | رد شدن از پرسش تأیید. |

```bash
npm run db:delete -- -y
```

:::warning PostgreSQL باید آفلاین باشد

پیش از `db:delete` در PostgreSQL، Songbird را متوقف کنید؛ `dropdb --force` اتصال‌های فعال PostgreSQL را قطع می‌کند. آپلودهای محلی پیام نیز حذف می‌شوند، اما اگر storage راه‌دور پیکربندی شده باشد باید جداگانه پاک‌سازی شود.

:::


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

### `db:user:verify`

وضعیت تأییدشده‌بودن یک کاربر را تغییر می‌دهد. اجرای دوباره دستور برای همان کاربر، تأیید را حذف می‌کند.

| آرگومان | موردنیاز | توضیح |
|---|---|---|
| `<user-id-or-username>` | بله | کاربری که باید تأیید یا لغو تأیید شود. |

```bash
npm run db:user:verify -- songbird.sage
# اجرای دوباره برای لغو تأیید:
npm run db:user:verify -- songbird.sage
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


## چت‌ها

### `db:chat:create`

یک گروه یا کانال ایجاد می‌کند. کانال‌ها می‌توانند به‌صورت اختیاری در زمان ایجاد به‌عنوان یک کانال ریموت پیکربندی شوند.

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

اعضا را به یک گروه یا کانال اضافه می‌کند. اولین آرگومان موضعی، انتخاب‌گر چت است. کاربرانی که پیش‌تر خارج شده‌اند نادیده گرفته می‌شوند، مگر آنکه `--force` داده شود.

| آرگومان / پرچم | موردنیاز | توضیح |
|---|---|---|
| `<chat-id-or-username>` | بله | چت هدف. |
| `<user> [more...]` | مشروط | یک یا چند کاربر برای افزودن. موردنیاز مگر آنکه `--all` داده شود. |
| `--all` | مشروط | افزودن هر کاربر در پایگاه داده. |
| `--force` | خیر | افزودن مجدد کاربرانی که پیش‌تر از چت خارج شده‌اند. |

```bash
npm run db:chat:add -- core.team songbird.sage2 songbird.sage3
npm run db:chat:add -- 1 --all
npm run db:chat:add -- 1 --all --force
```

### `db:chat:edit`

پروفایل یک چت را ویرایش می‌کند، مالکیت را منتقل می‌کند، یا کانال ریموت آن را مدیریت می‌کند. اولین آرگومان موضعی، انتخاب‌گر چت است.

**پرچم‌های پروفایل:**

| پرچم | توضیح |
|---|---|
| `--name <value>` | نام نمایشی جدید. |
| `--username <value>` | شناسه عمومی جدید. |
| `--visibility <public\|private>` | قابلیت دیده‌شدن جدید. |
| `--color <#hex>` | رنگ جدید چت. |
| `--owner <user>` | انتقال مالکیت به کاربر دیگر. |
| `--allow-member-invites` / `--disallow-member-invites` | تغییر دعوت‌های اعضا (فقط چت‌های خصوصی؛ چت‌های عمومی همیشه آن‌ها را مجاز می‌کنند). |

**پرچم‌های پیکربندی کانال ریموت (فقط کانال‌ها):**

| پرچم | توضیح |
|---|---|
| `--remote-channel <source>` | تنظیم/جایگزینی منبع Telegram. |
| `--sync-metadata` / `--no-sync-metadata` | فعال/غیرفعال‌کردن همگام‌سازی متادیتا. |
| `--stream-media` / `--no-stream-media` | فعال/غیرفعال‌کردن استریم رسانه. |

**پرچم‌های کنترل کانال ریموت:**

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

### `db:chat:verify`

وضعیت تأییدشده‌بودن یک گروه یا کانال را تغییر می‌دهد. اجرای دوباره دستور برای همان چت، تأیید را حذف می‌کند.

| آرگومان | موردنیاز | توضیح |
|---|---|---|
| `<chat-id-or-username>` | بله | گروه یا کانالی که باید تأیید یا لغو تأیید شود. |

```bash
npm run db:chat:verify -- core.team
# اجرای دوباره برای لغو تأیید:
npm run db:chat:verify -- core.team
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


## پیکربندی کانال ریموت

### `remote:configure`

اعتبارنامه های Telegram را برای ویژگی کانال ریموت به صورت تعاملی پیکربندی می کند. این دستور متغیرهای `REMOTE_CHANNEL_TELEGRAM_API_ID`، `REMOTE_CHANNEL_TELEGRAM_API_HASH` و `REMOTE_CHANNEL_TELEGRAM_SESSION_STRING` را در فایل `.env` شما تنظیم می کند.

```bash
npm run remote:configure
```

برای راهنمای کامل، از جمله نحوه دریافت اعتبارنامه های API، به [راه اندازی Remote Channel](./Remote-Channel-Setup.md) مراجعه کنید.

## اجرای دستورها از طریق Docker

هر اسکریپت npm را داخل کانتینر درحال‌اجرا با پیشوند `--prefix /app/server` اجرا کنید:

```bash
docker compose exec songbird npm --prefix /app/server run db:backup
docker compose exec songbird npm --prefix /app/server run db:migrate
docker compose exec songbird npm --prefix /app/server run db:inspect
```
