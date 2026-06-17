# نصب از طریق Docker

**پیش‌نیازها (روی Ubuntu 22.04+ آزمایش شده):**

- یک سرور Ubuntu با دسترسی sudo
- یک نام دامنه که به IP عمومی سرور شما اشاره می‌کند (توصیه‌شده)

## ۱. راه‌اندازی سیستم

این بسته‌ها را نصب کنید:

```bash
sudo apt install -y ca-certificates gnupg lsb-release
```

کلید رسمی GPG مربوط به Docker را اضافه کنید:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

مخزن apt مربوط به Docker را اضافه کنید:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Docker Engine + افزونه Compose را نصب کنید:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

اختیاری: اجرای Docker بدون `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

اختیاری: بررسی نصب:

```bash
docker --version
docker compose version
docker run hello-world
```

## ۲. کلون‌کردن مخزن

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

اگر اپلیکیشن را روی SSL اجرا می‌کنید، یک گواهی‌نامه خودامضا (self-signed) در پوشه `certs/` ایجاد کنید:

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

## ۳. ساخت کانتینر

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build
```

اختیاری: بررسی موفقیت‌آمیز بودن ساخت کانتینر:

```bash
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f
```

:::info

Docker به‌طور خودکار پیکربندی nginx را برای اجرا روی پورت 443 با استفاده از گواهی‌نامه خودامضایی که پیش‌تر تولید کرده‌اید تنظیم می‌کند.
برای تغییر و سفارشی‌سازی پیکربندی nginx، به صفحه [پیکربندی Nginx](./Nginx-Configuration.md) مراجعه کنید.

:::
