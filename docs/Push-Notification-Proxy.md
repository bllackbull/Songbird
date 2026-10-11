# Push Notification Proxy

If your server cannot reach push service endpoints (Google FCM, Mozilla Push Service, Apple Push) due to firewall restrictions or network policies, configure a proxy:

You can either set it via [admin panel](#set-via-admin-panel) or in your [`.env`](#set-in-env) .

## Set via admin panel

In [admin panel](./Admin-Panel.md), navigate to settings tab and enable "Push notification proxy" and enter your proxy url in the "Proxy URL" field:

```
http://your-proxy-server:3128
```

After saving, navigate to logs tab and check service page to make sure your server have reached push service endpoints successfully using your proxy.

## Set in `.env`

**1. Edit your [environment variables](./Environment-Variables.md)**

```bash
PUSH_PROXY_URL="http://your-proxy-server:3128"
```

**2. Restart service**

```bash
sudo systemctl restart songbird
```

**3. Verify in logs**

```bash
journalctl -u songbird -f | grep push
# Should show: [push] Using proxy: http://your-proxy-server:3128
```

## Proxy URL formats

| Type | Format |
|---|---|
| HTTP | `http://proxy.example.com:3128` |
| With authentication | `http://username:password@proxy.example.com:8080` |
| SOCKS5 | `socks5://proxy.example.com:1080` |

**Required endpoints** (the proxy must allow HTTPS/443 to these):

| Endpoint | Browser |
|---|---|
| `fcm.googleapis.com` | Chrome / Edge |
| `*.push.services.mozilla.com` | Firefox |
| `web.push.apple.com` | Safari |
| `*.notify.windows.com` | Edge |

## Troubleshooting push delivery failures

If you see errors like `[push] delivery failed ... status=0 ... AggregateError` in logs, this indicates network connectivity issues reaching push services. Common causes:

- Firewall blocking outbound HTTPS connections
- DNS resolution failures
- Network restrictions requiring proxy usage

Test proxy connectivity:

```bash
curl -x http://your-proxy:3128 https://fcm.googleapis.com
```
