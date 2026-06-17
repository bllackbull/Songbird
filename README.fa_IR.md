[English](/README.md) | [فارسی](/README.fa_IR.md)

<div align="center">

# <img src="./client/public/songbird-logo.svg"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

</div>

**Songbird یک پلتفرم پیام‌رسان سبک و امن برای میزبانی شخصی است که با هدف حمایت از آزادی دیجیتال در سراسر جهان ساخته شده است.**

Songbird از پیام مستقیم، گروه، کانال، آپلود فایل، پیام صوتی، push notification و قابلیت اختیاری Remote Channel برای آینه‌کردن پست‌های Telegram داخل کانال‌های Songbird پشتیبانی می‌کند. سرور از دیتابیس فایل‌محور SQLite از طریق `sql.js` استفاده می‌کند و کلاینت با React + Vite ساخته شده است.

## نصب سریع

ساده‌ترین روش نصب Songbird، اسکریپت نصب آسان است. روی یک سرور Ubuntu (نسخه 22.04+) با دسترسی `sudo` این دستور را اجرا کنید:

```bash
curl -fsSL https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh | bash
```

این اسکریپت پیش‌نیازها را نصب می‌کند، برنامه را build می‌کند، Nginx را کانفیگ می‌کند و می‌تواند SSL را هم برایتان راه‌اندازی کند. بعد از نصب، هر زمان با این دستور دوباره به آن دسترسی دارید:

```bash
songbird-deploy
```

> [!TIP]
> داشتن یک دامنه که به IP عمومی سرور شما اشاره کند پیشنهاد می‌شود، و برای push notification به HTTPS نیاز دارید (به‌جز روی `localhost`).

## مستندات

مستندات کامل در [docs.songbird.website](https://docs.songbird.website/fa/) قرار دارد:

- [اسکریپت نصب](https://docs.songbird.website/fa/Deployment-Script)
- [نصب از طریق Docker](https://docs.songbird.website/fa/Installation-Docker)
- [نصب دستی](https://docs.songbird.website/fa/Manual-Installation)
- [کانفیگ Nginx](https://docs.songbird.website/fa/Nginx-Configuration)
- [گواهی‌های SSL](https://docs.songbird.website/fa/SSL-Certificates)
- [متغیرهای محیطی](https://docs.songbird.website/fa/Environment-Variables)
- [راه‌اندازی Remote Channel](https://docs.songbird.website/fa/Remote-Channel-Setup)
- [پراکسی Push Notification](https://docs.songbird.website/fa/Push-Notification-Proxy)
- [به‌روزرسانی برنامه](https://docs.songbird.website/fa/Updating)
- [دستورات دیتابیس](https://docs.songbird.website/fa/Database-Commands)
- [اجرا روی دامنه + subpath](https://docs.songbird.website/fa/Subpath-Hosting)
- [عیب‌یابی](https://docs.songbird.website/fa/Troubleshooting)

## نویسنده

- سازنده: [@bllackbull](https://github.com/bllackbull)
- مشارکت کنندگان: [@nkhalili](https://github.com/nkhalili), [@modos](https://github.com/modos)

## مشارکت

- از تقاضای مشارکت، استقبال میشود.
- اگر قصد مشارکت دارید، اول در این آدرس issue باز کنید: `https://github.com/bllackbull/Songbird/issues`
- برای هماهنگی مستقیم، قبل از باز کردن PR با [@bllackbull](https://github.com/bllackbull) در GitHub در ارتباط باشید.
- برای اطلاعات بیشتر، راهنمای [Contributing](/CONTRIBUTING.md) را ببینید.

## حمایت

اگر این پروژه را دوست دارید، می‌توانید از آن حمایت کنید:

<a href="https://nowpayments.io/donation?api_key=0b61dd3e-6508-4849-ad92-1dde65442937" target="_blank" rel="noreferrer noopener">
    <img src="https://nowpayments.io/images/embeds/donation-button-black.svg" alt="Crypto donation button by NOWPayments">
</a>

### TRX:

```
TPf1bEhipKpGkjo5N2Scj9nufNNh5TNrwX
```

### BTC:

```
bc1q9hupvcc39juhf0k7rgzn6phn8s8jez365kzmuj
```

### TON:

```
UQDzQ3xbWzKQvw8X8sWU82dksBeYqTHrT9sLzhBOyaESPjVy
```

## لایسنس

این پروژه تحت لایسنس MIT منتشر شده است. برای جزئیات بیشتر، فایل [LICENSE](LICENSE) را ببینید.
