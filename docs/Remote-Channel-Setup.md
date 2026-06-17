# Remote Channel Setup

Remote Channel lets a public Songbird channel mirror posts from a Telegram channel or another public Songbird channel. Only channel owners can configure a channel source, and only one source can be active per channel at a time.

On first enable, Songbird initializes the source at the latest post and does not import history. Posts published after that point are mirrored.

## Source types at a glance

| | Songbird source | Telegram source |
|---|---|---|
| Credentials required | None | Telegram API ID, hash, session |
| Server flag | `REMOTE_CHANNEL=true` | `REMOTE_CHANNEL=true` |
| Source format | Public channel invite link | `@channelname`, `t.me` link, or numeric id |
| Target restriction | Target must be a public channel on a server with `SIGN_UP=true` | Source must be a Telegram channel |
| Optional proxy | `REMOTE_CHANNEL_SONGBIRD_PROXY_URL` | `REMOTE_CHANNEL_TELEGRAM_PROXY_URL` |

## Songbird source

To mirror from another Songbird server, create or edit a **public channel**, enable **Remote Channel**, choose **Songbird**, and paste the public channel invite link from the target server (e.g. `https://other.server/invite/channelname`).

**Requirements:**

- The target server must have `SIGN_UP=true` (public server).
- The target channel must be public.
- The target server must be running the same or a newer version of Songbird that includes the public channel polling endpoints.

No extra credentials are needed. Set `REMOTE_CHANNEL=true` on this server and optionally `REMOTE_CHANNEL_SONGBIRD_PROXY_URL` if your server needs a proxy to reach the target.

## Telegram source

To mirror from a Telegram channel, Telegram API credentials are required.

### 1. Create Telegram credentials

Create a [Telegram app](https://my.telegram.org/apps) so you have an API ID and API hash ready. If your server needs a proxy to reach Telegram, have that URL ready too. Supported schemes are `http://`, `https://`, `socks4://`, `socks5://`, and `mtproxy://`.

:::warning

It is recommended to not use your main personal Telegram account for this.

:::

### 2. Configure Remote Channel

Run the configuration helper and follow the prompts. It asks for the Telegram API ID, API hash, optional proxy URL, and Telegram login code, then writes the Remote Channel settings into `.env`. For systemd installs, it restarts `songbird.service` after saving.

```bash
cd /opt/songbird
npm run remote:configure
```

For Docker:

```bash
cd /opt/songbird
touch .env
docker compose run --rm -v "$PWD/.env:/app/.env" songbird npm --prefix /app/server run remote:configure
```

Keep the generated session value private. It authorizes Songbird to read Telegram channels that the logged-in Telegram account can access.

### 3. Connect a Songbird channel

In Songbird, create or edit a **public channel**, enable **Remote Channel**, choose **Telegram**, and enter a source such as `@channelname` or `https://t.me/channelname`. Remote Channel is locked for private channels.

Optional channel settings:

| Setting | Effect |
|---|---|
| Sync Channel Metadata | Copies the Telegram channel title/avatar into the Songbird channel. |
| Stream Media Files | Downloads Telegram media into Songbird uploads when `FILE_UPLOAD=true`. Follows the upload size/count limits, file retention, encryption-at-rest, and video transcoding settings. Text-only mirrored posts follow `MESSAGE_TEXT_RETENTION`. |

:::info

Posts with no text/caption are mirrored only when media streaming is enabled and at least one supported media file can be stored.

:::
