# پراکسی Push notification

اگر سرور شما به‌دلیل محدودیت‌های فایروال یا سیاست‌های شبکه نمی‌تواند به نقاط پایانی سرویس‌های push (Google FCM، Mozilla Push Service، Apple Push) دسترسی پیدا کند، یک پراکسی پیکربندی کنید:

می‌توانید آن را از طریق [پنل مدیریت](#تنظیم-از-طریق-پنل-مدیریت) یا در [`.env`](#تنظیم-در-env) خود تنظیم کنید.

## تنظیم از طریق پنل مدیریت

در [پنل مدیریت](./Admin-Panel.md)، به تب تنظیمات بروید و «Push notification proxy» را فعال کنید و نشانی پراکسی خود را در فیلد «Proxy URL» وارد کنید:

```
http://your-proxy-server:3128
```

پس از ذخیره، به تب لاگ‌ها بروید و صفحه سرویس را بررسی کنید تا مطمئن شوید سرور شما با استفاده از پراکسی به نقاط پایانی سرویس‌های push دسترسی پیدا کرده است.

## تنظیم در `.env`

**۱. [متغیرهای محیطی](./Environment-Variables.md) خود را ویرایش کنید**

```bash
PUSH_PROXY_URL="http://your-proxy-server:3128"
```

**۲. راه‌اندازی مجدد سرویس**

```bash
sudo systemctl restart songbird
```

**۳. تأیید در لاگ‌ها**

```bash
journalctl -u songbird -f | grep push
# Should show: [push] Using proxy: http://your-proxy-server:3128
```

## قالب‌های نشانی پراکسی

| نوع | قالب |
|---|---|
| HTTP | `http://proxy.example.com:3128` |
| با احراز هویت | `http://username:password@proxy.example.com:8080` |
| SOCKS5 | `socks5://proxy.example.com:1080` |

**نقاط پایانی موردنیاز** (پراکسی باید HTTPS/443 را به این‌ها اجازه دهد):

| نقطه پایانی | مرورگر |
|---|---|
| `fcm.googleapis.com` | Chrome / Edge |
| `*.push.services.mozilla.com` | Firefox |
| `web.push.apple.com` | Safari |
| `*.notify.windows.com` | Edge |

## عیب‌یابی خطاهای تحویل Push notification

اگر در لاگ‌ها خطاهایی مانند `[push] delivery failed ... status=0 ... AggregateError` می‌بینید، این نشان‌دهنده مشکلات اتصال شبکه برای دسترسی به سرویس‌های push است. دلایل رایج:

- مسدودکردن اتصال‌های خروجی HTTPS توسط فایروال
- شکست در تفکیک DNS
- محدودیت‌های شبکه که نیازمند استفاده از پراکسی هستند

اتصال پراکسی را آزمایش کنید:

```bash
curl -x http://your-proxy:3128 https://fcm.googleapis.com
```
