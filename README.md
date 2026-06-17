[English](/README.md) | [فارسی](/README.fa_IR.md)

<div align="center">

# <img src="./client/public/songbird-logo.svg"> Songbird

[![Version](https://img.shields.io/github/v/release/bllackbull/Songbird?label=version&color=blue)](https://github.com/bllackbull/Songbird/releases)
![Build](https://img.shields.io/github/actions/workflow/status/bllackbull/Songbird/build.yml)
[![Last commit](https://img.shields.io/github/last-commit/bllackbull/Songbird)](https://github.com/bllackbull/Songbird/commits/main/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

</div>

**Songbird is a secure and lightweight self-hosted chat platform designed to empower digital freedom worldwide.**

Songbird supports DMs, groups, channels, file uploads, voice messages, push notifications, and optional Remote Channels that mirror Telegram posts into Songbird channels. The server uses a file-backed SQLite database via sql.js and the client is built with React + Vite.

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
- [Manual Installation](https://docs.songbird.website/Manual-Installation)
- [Configure Nginx](https://docs.songbird.website/Nginx-Configuration)
- [SSL Certificates](https://docs.songbird.website/SSL-Certificates)
- [Environment Variables](https://docs.songbird.website/Environment-Variables)
- [Remote Channel Setup](https://docs.songbird.website/Remote-Channel-Setup)
- [Push Notification Proxy](https://docs.songbird.website/Push-Notification-Proxy)
- [Updating the deployed app](https://docs.songbird.website/Updating)
- [Database Commands](https://docs.songbird.website/Database-Commands)
- [Running behind a domain + subpath](https://docs.songbird.website/Subpath-Hosting)
- [Troubleshooting](https://docs.songbird.website/Troubleshooting)

## Author

- Maintainer: [@bllackbull](https://github.com/bllackbull)
- Contributors: [@nkhalili](https://github.com/nkhalili), [@modos](https://github.com/modos)

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
