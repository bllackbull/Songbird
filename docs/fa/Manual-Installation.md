# نصب دستی

**پیش‌نیازها (روی Ubuntu 22.04+ آزمایش شده):**

- یک سرور Ubuntu با دسترسی sudo
- یک نام دامنه که به IP عمومی سرور شما اشاره می‌کند (توصیه‌شده)

## ۱. راه‌اندازی سیستم

بسته‌های موردنیاز را به‌روزرسانی و نصب کنید:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

Node.js و npm را نصب کنید (یکی را انتخاب کنید):

| روش | بهترین برای | یادداشت |
|---|---|---|
| NodeSource | بیشتر نصب‌ها (توصیه‌شده) | نصب سراسری سیستم از طریق apt. |
| nvm | مدیریت نسخه Node برای هر کاربر | پس از کلون‌کردن به `nvm install` / `nvm use` نیاز دارد. |
| Volta | زنجیره ابزار پین‌شده برای هر پروژه | یک نسخه مشخص از Node/npm نصب می‌کند. |

**NodeSource (توصیه‌شده)**:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**nvm**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash
```

**Volta**:

```bash
curl https://get.volta.sh | bash
volta install node@24.11.1 npm@11.6.4
```

## ۲. کلون‌کردن مخزن

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

:::info

اگر Node.js را با استفاده از nvm نصب کرده‌اید:

```bash
nvm install
nvm use
```

:::

## ۳. نصب وابستگی‌ها

```bash
cd /opt/songbird/server
npm install

cd /opt/songbird/client
npm install
npm run build
```

## ۴. ایجاد سرویس systemd

فایل `/etc/systemd/system/songbird.service` را با محتوای زیر ایجاد کنید:

```ini
[Unit]
Description=Songbird server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/songbird/server
ExecStart=/usr/bin/env node /opt/songbird/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

:::info

- اگر Node.js را با استفاده از nvm نصب کرده‌اید، این مسیر Node را در `ExecStart` تنظیم کنید:

```ini
ExecStart=/root/.nvm/versions/node/v24.11.1/bin/node index.js
```

- اگر Node.js را با استفاده از volta نصب کرده‌اید، این مسیر Node را در `ExecStart` تنظیم کنید:

```ini
ExecStart=/root/.volta/bin/node index.js
```

:::

**توصیه‌شده: ایجاد یک کاربر اختصاصی:**

:::warning

اگر Node.js را با استفاده از nvm یا volta نصب کرده‌اید، از این مرحله صرف‌نظر کنید.

:::

به‌دلیل ملاحظات امنیتی، توصیه می‌شود یک کاربر سیستمی اختصاصی ایجاد کرده و مالکیت پوشه پروژه را تغییر دهید:

1. این خطوط را به فایل سرویس systemd اضافه کنید:

```ini
User=songbird
Group=songbird
```

2. یک کاربر سیستمی اختصاصی ایجاد کنید:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin songbird
```

3. مالکیت پوشه پروژه را تغییر دهید:

```bash
sudo chown -R songbird:songbird /opt/songbird
git config --global --add safe.directory /opt/songbird
```

4. به کاربر سرویس اجازه دهید واحد خودش را کنترل کرده و لاگ‌های سیستم را بخواند (لازم است برای دکمه‌های راه‌اندازی مجدد/توقف سرویس و تب Logs در پنل ادمین):

```bash
sudo tee /etc/sudoers.d/songbird > /dev/null <<'EOF'
# Songbird — allow the service user to control its own unit
# and read privileged logs without a password.
songbird ALL=(root) NOPASSWD: /usr/bin/systemctl restart songbird.service
songbird ALL=(root) NOPASSWD: /usr/bin/systemctl stop songbird.service
songbird ALL=(root) NOPASSWD: /usr/bin/journalctl -u songbird *
songbird ALL=(root) NOPASSWD: /usr/bin/cat /var/log/nginx/error.log
songbird ALL=(root) NOPASSWD: /usr/bin/cat /var/log/nginx/access.log
songbird ALL=(root) NOPASSWD: /usr/bin/nginx -t
songbird ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
EOF
sudo chmod 0440 /etc/sudoers.d/songbird
```

بدون این مرحله، دکمه‌های **راه‌اندازی مجدد سرویس** و **توقف سرویس** در پنل ادمین با خطای دسترسی مواجه می‌شوند و لاگ‌های سیستم (journal سرویس، nginx) در تب Logs نمایش داده نمی‌شوند.

**فعال‌سازی و راه‌اندازی سرویس:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird.service
```
