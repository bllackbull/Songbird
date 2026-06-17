# Troubleshooting

This page collects common issues and how to diagnose them. Start by checking the relevant logs, then jump to the section that matches your symptom.

## Where to look first

| Source | Command | Use it for |
|---|---|---|
| Service logs (systemd) | `sudo journalctl -u songbird -f` | App crashes, startup errors, runtime exceptions. |
| Docker logs | `docker compose -f docker-compose.yaml logs -f` | Same as above, for Docker installs. |
| Nginx error log | `sudo tail -f /var/log/nginx/error.log` | 502/504 errors, proxy and TLS problems. |
| Nginx access log | `sudo tail -f /var/log/nginx/access.log` | Confirm requests reach the server and their status codes. |
| Deploy script log | `cat /opt/songbird/logs/install.log` | Failures during install/update via `songbird-deploy`. |

:::tip

The [deployment script](./Deployment-Script.md) has a built-in **View Logs** menu that opens all of these without typing paths.

:::

## Symptom quick reference

| Symptom | Likely area | Jump to |
|---|---|---|
| Install hangs downloading packages | Network restrictions | [Installation stuck downloading packages](#installation-stuck-downloading-packages) |
| Domain won't resolve / cert fails | DNS resolution | [DNS resolution problems](#dns-resolution-problems) |
| `502 Bad Gateway` | App not running or wrong proxy port | [App won't start / 502](#app-wont-start--502-bad-gateway) |
| Site loads but live updates stall | SSE/proxy buffering | [Real-time updates not arriving](#real-time-updates-not-arriving) |
| Push notifications never arrive | HTTPS or network/proxy | [Push notifications](#push-notifications-not-arriving) |
| Uploads rejected or fail | Size limits or disk | [File uploads failing](#file-uploads-failing) |
| Videos not playing | ffmpeg / transcoding | [Video transcoding](#video-transcoding-issues) |
| Docker build seems stuck | Dependency download | [Docker build issues](#docker-build-issues) |
| TLS/certificate errors | Cert paths or renewal | [TLS / certificate problems](#tls--certificate-problems) |
| Remote Channel not mirroring | Telegram creds / queue | [Remote Channel](#remote-channel-not-mirroring) |

---

## Installation stuck downloading packages

During installation Songbird needs to download system packages and dependencies: apt packages, Node.js (via NodeSource), npm packages, and, for Docker installs, Docker images and packages. On servers in highly restricted or filtered networks, these downloads can stall, time out, or fail outright.

Typical signs:

- The installer or `docker compose build` appears frozen at a download/`npm ci`/`apt-get install` step.
- Errors mentioning connection timeouts, TLS handshake failures, or unreachable hosts.

To work around the restriction, point the package tooling at reachable mirrors or route traffic through a proxy.

| Tool | Workaround |
|---|---|
| apt | Use a reachable apt mirror. |
| Node.js (NodeSource) | Use a NodeSource mirror. |
| npm | Use an alternate npm registry mirror. |
| Docker / general outbound | Configure an HTTP/HTTPS proxy for the shell or Docker daemon. |

If you install with the [Deployment Script](./Deployment-Script.md), use its **Configure mirrors** menu to set NodeSource, apt, and npm mirrors before installing. That page also lists working mirror examples (including ones usable inside Iran's restricted environment). See [Mirrors for restricted networks](./Deployment-Script.md#mirrors-for-restricted-networks).

For manual or Docker installs, set a proxy in your shell before running the install commands:

```bash
export HTTP_PROXY="http://your-proxy:3128"
export HTTPS_PROXY="http://your-proxy:3128"
```

## DNS resolution problems

If your server cannot resolve domain names, package downloads, certificate issuance (Certbot/Let's Encrypt), and outbound services (push, Telegram) will all fail even when the network is otherwise reachable.

Test whether the server can resolve a domain using its current DNS configuration:

```bash
# Using dig:
dig +short github.com

# Or using nslookup:
nslookup github.com
```

If the command returns one or more IP addresses, DNS is working. If it hangs, times out, or returns no answer / an error, the server's DNS is misconfigured or blocked.

To fix it, point the server at a working DNS resolver. On most Ubuntu servers using `systemd-resolved`, set the `DNS=` line in `/etc/systemd/resolved.conf` and restart the resolver:

```bash
sudo nano /etc/systemd/resolved.conf
# Set, for example:
#   DNS=1.1.1.1 8.8.8.8
sudo systemctl restart systemd-resolved
```

Then re-test with `dig +short github.com`. Once DNS resolves correctly, retry the installation or the failed operation.

:::info

Choose DNS resolvers that are reachable and not blocked from your server's network. In restricted environments a public resolver may itself be filtered, in which case combine this with the mirror/proxy workarounds above.

:::

:::tip

You can use these DNS resolvers in Iran's restricted environment:
```
217.218.127.127
217.218.155.155
```

:::

---

## App won't start / 502 Bad Gateway

A `502` from Nginx almost always means the Node server is not reachable on the expected port.

1. Confirm the service is running:
   ```bash
   sudo systemctl status songbird
   sudo journalctl -u songbird -n 100 --no-pager
   ```
2. Confirm the proxy target matches `SERVER_PORT`. Nginx's `proxy_pass` port must equal `SERVER_PORT` in `.env`.
3. Confirm the listen port matches `CLIENT_PORT`.

| Check | Where | Must match |
|---|---|---|
| `proxy_pass http://127.0.0.1:<port>` | Nginx site config | `SERVER_PORT` |
| `listen <port>` | Nginx site config | `CLIENT_PORT` |
| `client_max_body_size` | Nginx site config | `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` |

After any Nginx change:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Real-time updates not arriving

Songbird uses Server-Sent Events (SSE) for live messages and presence. If messages only appear after a refresh, the SSE stream is likely being buffered by Nginx.

- Ensure the `/api/events` location block is present and disables buffering (`proxy_buffering off;`, `add_header X-Accel-Buffering no;`). See [Configure Nginx](./Nginx-Configuration.md).
- Confirm any upstream proxy or CDN is not buffering or timing out the connection.
- Check `proxy_read_timeout` / `proxy_send_timeout` are long enough (the sample config uses `1h`).

## Push notifications not arriving

| Requirement | Detail |
|---|---|
| HTTPS | Push requires HTTPS, except on `localhost`. Plain HTTP installs cannot deliver push. |
| VAPID keys | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` must be set (auto-generated on first run). |
| iOS | Requires an installed PWA on iOS 16.4+. |
| Network reachability | The server must reach push endpoints (FCM, Mozilla, Apple). |

If logs show `[push] delivery failed ... status=0 ... AggregateError`, the server cannot reach the push services. Common causes: firewall blocking outbound HTTPS, DNS failures, or a network that requires a proxy. Configure a proxy via [Push Notification Proxy](./Push-Notification-Proxy.md) and test connectivity:

```bash
curl -x http://your-proxy:3128 https://fcm.googleapis.com
```

## File uploads failing

| Cause | Fix |
|---|---|
| Upload larger than per-file cap | Increase `FILE_UPLOAD_MAX_SIZE_MB`. |
| Message total exceeds cap | Increase `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` and align Nginx `client_max_body_size`. |
| Too many files in one message | Increase `FILE_UPLOAD_MAX_FILES`. |
| Uploads disabled | Set `FILE_UPLOAD=true`. |
| Nginx rejects large bodies (`413`) | Set `client_max_body_size` to match `FILE_UPLOAD_MAX_TOTAL_SIZE_MB`. |
| Disk full | Check free space with `npm run db:inspect` (reports disk usage) or `df -h`. |

After changing `.env`, apply the changes (see [Environment Variables](./Environment-Variables.md#apply-changes)).

## Video transcoding issues

Songbird transcodes uploaded videos to H.264/AAC MP4 when `FILE_UPLOAD_TRANSCODE_VIDEOS=true`, which requires `ffmpeg`.

- Verify ffmpeg is installed: `ffmpeg -version`.
- If videos fail to process, check the service logs for transcoding errors.
- Set `APP_DEBUG=true` to get verbose `[app-debug]` lines covering upload/transcode events, then restart the service.

## Docker build issues

If `docker compose build` appears stuck at `RUN npm ci`, it is usually downloading dependencies. Run with plain progress to see what is happening:

```bash
docker compose -f docker-compose.yaml build --no-cache --progress=plain
```

Other checks:

- Confirm the container is healthy: `docker compose -f docker-compose.yaml ps`.
- Tail container logs: `docker compose -f docker-compose.yaml logs -f`.

## TLS / certificate problems

| Symptom | Check |
|---|---|
| Browser warns about invalid cert | Confirm `ssl_certificate` / `ssl_certificate_key` paths in Nginx point to valid files. |
| Certbot renewal fails | Run `sudo certbot renew --dry-run` and check DNS/port 80 reachability. |
| IP-based cert expired | The IP certificate flow uses short-lived (6-day) certs auto-renewed by a timer; confirm the `songbird-lego-renew` timer is active. |
| Self-signed warning (Docker default) | Expected with the default self-signed cert. Replace with real certs for production. |

See [SSL Certificates](./SSL-Certificates.md) for the full setup options.

## Remote Channel not mirroring

| Check | Detail |
|---|---|
| Feature enabled | `REMOTE_CHANNEL=true` must be set on this server. |
| Telegram credentials | API ID, API hash, and session string must be configured. Run `npm run remote:configure`. |
| Channel is public | Remote Channel is locked for private channels. |
| History not imported | On first enable, only posts published after that point are mirrored, not history. |
| Queue paused | Resume with `npm run db:chat:edit -- <channel> --resume-queue`. |
| Proxy needed | If the server cannot reach Telegram, set a proxy (`REMOTE_CHANNEL_TELEGRAM_PROXY_URL`). |

See [Remote Channel Setup](./Remote-Channel-Setup.md) for the complete configuration guide.

---

## Still stuck?

If none of the above resolves the issue, gather the relevant log output and open an issue at the [project repository](https://github.com/bllackbull/Songbird/issues).
