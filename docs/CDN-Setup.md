# Running behind a CDN

Running Songbird behind a CDN (Content Delivery Network) is strongly recommended, and in many cases required, for anyone self-hosting in a restricted network environment.

## Why you need a CDN

In countries with heavy internet restrictions — Iran being a key example — self-hosted servers face a consistent pattern: the server works fine initially, but after a certain amount of traffic passes through it, the IP address gets flagged and blocked by individual ISPs across different regions. The result is that users on one ISP can reach the server while users on another cannot, and the situation typically gets worse over time.

Routing your traffic through a CDN solves this at the infrastructure level:

- The CDN presents its own IP addresses to the public internet, not your server's IP.
- CDN edge nodes are geographically distributed and use IP ranges that are much harder to block wholesale.
- Your server's real IP stays hidden behind the CDN, so it cannot be directly targeted.
- Most CDN providers automatically handle DDoS mitigation, TLS termination, and caching on top of this.

## How it works

```
User → CDN edge (proxied IP) → your server (real IP, hidden)
```

The CDN receives the user's request, forwards it to your server, and returns the response. Your server only ever talks to the CDN, not directly to end users.

## Setting it up (Cloudflare example)

Cloudflare is the most widely used option for this and has a generous free tier. The same principles apply to other CDN providers.

### 1. Add your domain to Cloudflare

Sign up at [cloudflare.com](https://cloudflare.com), add your domain, and point your domain's nameservers to the ones Cloudflare provides. This hands DNS management over to Cloudflare.

### 2. Create an A record with proxy enabled

In the Cloudflare DNS dashboard, create an A record for your subdomain:

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | `chat` (or `@` for apex) | `your-server-IP` | ✅ Proxied (orange cloud) |

The key detail is **Proxy status must be ON** (the orange cloud icon in Cloudflare). This is what routes traffic through Cloudflare's edge instead of pointing directly at your server. If you set it to DNS-only (grey cloud), your server IP is exposed and you lose all the protection.

### 3. Match the port

This is where most people get stuck.

By default, Cloudflare only proxies a limited set of ports on the free plan. **Port 443 (HTTPS) is always proxied.** If your app's `CLIENT_PORT` is 443, no further configuration is needed.

If you are running on a non-standard port (e.g. `CLIENT_PORT=8443` or `CLIENT_PORT=2053`), you have two options:

**Option A — Use a Cloudflare-supported port**

Cloudflare proxies these HTTPS ports on the free plan: `443`, `2053`, `2083`, `2087`, `2096`, `8443`. Set `CLIENT_PORT` in your `.env` to one of these and align your Nginx `listen` directive to match.

**Option B — Use port 443**

The simplest path. Set `CLIENT_PORT=443` in `.env` and configure Nginx to listen on 443. This always works with any CDN proxy.

:::tip

When using the [Deployment Script](./Deployment-Script.md), you can change `CLIENT_PORT` from the **Edit Settings** menu and it will rebuild and apply automatically.

:::

### 4. Set SSL/TLS mode to Full (strict)

In Cloudflare: **SSL/TLS → Overview → Full (strict)**.

| Mode | What it does |
|---|---|
| Flexible | Cloudflare → your server over plain HTTP. Do not use this. |
| Full | Cloudflare → your server over HTTPS (accepts self-signed cert). |
| Full (strict) | Cloudflare → your server over HTTPS (requires valid cert). Recommended. |

Full (strict) means the connection between Cloudflare and your server is also encrypted and verified. This requires a valid SSL certificate on your server — either from Certbot or a Cloudflare Origin Certificate.

:::info

If you used the deployment script or Certbot for SSL, you already have a valid certificate and Full (strict) will work. If you used a self-signed certificate, use Full mode instead.

:::

### 5. Preserve real visitor IPs in Nginx (optional)

When traffic comes through Cloudflare, the IP your server sees at the Nginx layer is a Cloudflare edge IP, not the visitor's real IP. However, **Songbird's Node.js server already handles this correctly** — it has `app.set('trust proxy', 1)` configured, which tells Express to read the real client IP from the `X-Forwarded-For` header that Cloudflare always sends. This means rate limiting and all IP-aware logic in Songbird work correctly behind a CDN without any extra Nginx configuration.

The only thing you lose without this step is accurate IPs in your **Nginx access logs**. If that matters to you, add the following inside the `server {}` block in your Nginx config:

```nginx
# Trust Cloudflare's IP ranges and read the real client IP from the header.
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
```

Then reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

:::info

Cloudflare periodically updates its IP ranges. The canonical up-to-date list is at [cloudflare.com/ips](https://www.cloudflare.com/ips/).

:::

## Using a different CDN provider

The same pattern applies to other CDN providers (Arvan Cloud, Fastly, BunnyCDN, etc.):

| Step | What to do |
|---|---|
| DNS | Create an A record pointing to your server IP with proxying enabled. |
| Port | Use a port the CDN proxy supports, or configure port forwarding in the CDN dashboard. |
| TLS | Enable HTTPS between the CDN and your origin server. |
| Real IP | Configure Nginx to trust the CDN's IP ranges and read the real IP from the appropriate header (commonly `CF-Connecting-IP`, `X-Real-IP`, or `X-Forwarded-For` depending on the provider). |

:::tip

[Arvan Cloud](https://arvancloud.ir) (ابر آروان) is a popular Iranian CDN provider that works well for servers hosted in or accessible from Iran, and supports the same A record + proxy pattern described above.

:::

## SSE and long-lived connections

Songbird uses Server-Sent Events (SSE) for real-time updates. SSE requires a persistent HTTP connection that stays open. Some CDN configurations close idle or long-running connections.

If users experience messages only loading after a page refresh (a sign of broken SSE), check:

- **Cloudflare**: Enable **HTTP/2** in the Speed settings. Cloudflare supports SSE natively over HTTP/2. Also ensure the `/api/events` path is not cached — add a Cache Rule to bypass caching for that path.
- **Response buffering**: Ensure `proxy_buffering off` and `add_header X-Accel-Buffering no` remain in your Nginx `/api/events` location block. See [Configure Nginx](./Nginx-Configuration.md).
- **Timeout settings**: In Cloudflare, the proxy timeout is 100 seconds by default on the free plan. The Songbird client reconnects automatically, so this is acceptable, but upgrading to a paid plan allows longer timeouts.
