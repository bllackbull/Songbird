[English](/README.md) | [فارسی](/README.fa_IR.md)

<div align="center">

# <img src="./client/public/songbird-logo.svg" alt="Songbird"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bllackbull/Songbird)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/songbird)

**Secure, lightweight and self-hosted chat platform**

</div>

## Key Features

- 💬 **Chat Types**: Direct messages, groups, and channels
- 📁 **Media Support**: File uploads, voice messages, video transcoding
- 🔔 **Push Notifications**: Web push with VAPID
- 📡 **Remote Channels**: Mirror Telegram or Songbird channels (v0.10.3+)
- 🛡️ **Admin Panel**: Full management interface with owner role (v0.11.0+)
- 🔒 **Security**: Encryption at rest, bcrypt hashing, rate limiting
- 📱 **PWA**: Installable progressive web app
- ☁️ **Cloud Deployment**: PaaS and CaaS deployment with object storage support
- 🌍 **i18n**: English and Persian/Farsi support

## Quick Start

The easiest way to install Songbird is the deployment script. On an Ubuntu server (22.04+) with sudo access, run:

```bash
curl -fsSL https://raw.githubusercontent.com/bllackbull/Songbird/main/scripts/install.sh | bash
```

The script handles dependencies, builds the app, configures Nginx, and can set up SSL for you. After installation, access it again anytime with:

```bash
songbird-deploy
```

> [!TIP]
> A domain name pointing to your server's public IP is recommended, and HTTPS is required for push notifications (except on `localhost`).

## Documentation

Full documentation lives at [docs.songbird.website](https://docs.songbird.website):

- [Deployment Script](https://docs.songbird.website/Deployment-Script)
- [Install via Docker](https://docs.songbird.website/Installation-Docker)
- [Cloud Deployment](https://docs.songbird.website/Cloud-Deployment)
- [Manual Installation](https://docs.songbird.website/Manual-Installation)
- [Configure Nginx](https://docs.songbird.website/Nginx-Configuration)
- [SSL Certificates](https://docs.songbird.website/SSL-Certificates)
- [Running behind a CDN](https://docs.songbird.website/CDN-Setup)
- [Running behind a domain + subpath](https://docs.songbird.website/Subpath-Hosting)
- [Environment Variables](https://docs.songbird.website/Environment-Variables)
- [Object Storage](https://docs.songbird.website/Object-Storage)
- [Media Worker](https://docs.songbird.website/Media-Worker)
- [Admin Panel](https://docs.songbird.website/Admin-Panel)
- [Remote Channel Setup](https://docs.songbird.website/Remote-Channel-Setup)
- [Push Notification Proxy](https://docs.songbird.website/Push-Notification-Proxy)
- [Updating the deployed app](https://docs.songbird.website/Updating)
- [Database Commands](https://docs.songbird.website/Database-Commands)
- [Troubleshooting](https://docs.songbird.website/Troubleshooting)

## Author

- Maintainer: [@bllackbull](https://github.com/bllackbull)
- Contributors: [@nkhalili](https://github.com/nkhalili), [@modos](https://github.com/modos), [@iPmartNetwork](https://github.com/iPmartNetwork)

## Contributing

- Contributions are welcome.
- If you want to contribute, contact the maintainer first by opening an issue at: `https://github.com/bllackbull/Songbird/issues`
- For direct coordination, reach out to [@bllackbull](https://github.com/bllackbull) on GitHub before opening a PR.
- Checkout [Contributing](/CONTRIBUTING.md) guideline for more information.

## Support

If you like this project which I hope you do, consider supporting your favorite project:

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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
