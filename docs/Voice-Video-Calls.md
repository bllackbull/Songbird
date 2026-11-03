# 📞 Voice & Video Calls

Songbird supports real-time peer-to-peer 1-on-1 voice and video calling in direct messages using WebRTC with low-latency WebSocket signaling.

## Architecture Overview

WebRTC establishes an encrypted direct peer-to-peer connection between two participants for audio and video media streams. Signaling coordinates the handshake before media flows directly between peers:

1. **Signaling Transport:**
   - **Primary:** Low-latency signaling over the existing WebSocket connection.
   - **Fallback:** Automatic fallback to HTTP and SSE dispatch when WebSocket is disconnected or in SSE-only mode.
2. **Media Stream:**
   - Transmitted directly peer-to-peer via WebRTC.
   - Server does not transcode or store real-time voice/video data, preserving privacy and minimal server overhead.
3. **NAT Traversal (STUN / TURN):**
   - **STUN:** Resolves public IP and port mappings between peers across typical home routers and NATs.
   - **TURN:** Relays encrypted media traffic when both participants are behind restrictive symmetric firewalls or mobile carrier CGNAT.

## Configuration

Add the following environment variables to your `.env` file:

```txt
# WebRTC STUN server URL (default: Google public STUN)
TURN_STUN_URL="stun:stun.l.google.com:19302"

# Optional TURN server settings
TURN_URL="turn:your-turn-server.example.com:3478"
TURN_USERNAME="your-username"
TURN_CREDENTIAL="your-password"

# Optional managed TURN via Cloudflare Calls
TURN_TOKEN_ID="your-cloudflare-turn-key-id"
TURN_API_TOKEN="your-cloudflare-turn-api-token"
```

There are two ways to provide TURN relaying; pick **one** of them:

- **Cloudflare Calls TURN (managed, zero infrastructure):** Set `TURN_TOKEN_ID` and `TURN_API_TOKEN` from the Cloudflare dashboard (Calls → TURN). Short-lived credentials (24h TTL) are minted per session by the server from Cloudflare's API, and clients receive Cloudflare's STUN and TURN endpoints (UDP, TCP, and TLS). The static `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` values are ignored while these keys are set. This is the recommended option for hosted deployments on platforms like Render, which cannot run a TURN server themselves because they do not expose UDP ports.
- **Self-hosted TURN (e.g. Coturn on a VPS):** Set `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` to your own relay server's address and static credentials.

If neither is configured, calls use the default STUN server only.

:::tip Health check
When configured, you can verify your TURN server's health, latency, and reachability at any time from the **Services** tab in the Admin Panel.
:::

### Disabling calls

Calls can be turned off per server via environment variables (or the admin panel's Calls settings group):

- `CALL` (default `true`): when off, calls are disabled entirely — the API rejects call starts and call buttons are shown as disabled in the UI.
- `CALL_VIDEO` (default `true`): when off, video calls are rejected while voice calls stay available.
- `CALL_MAX_DURATION` (default `0` = unlimited): automatically ends connected calls after this many minutes (1–1440).

### When is a TURN server required?

- **Local / Direct Network:** For most home networks and standard connections, the default STUN server (`stun:stun.l.google.com:19302`) is sufficient.
- **Mobile Networks / Restrictive Corporate Firewalls:** If participants are on mobile carrier connections with symmetric NAT or behind corporate firewalls, WebRTC peer-to-peer negotiation may fail without a TURN relay server (such as [Coturn](https://github.com/coturn/coturn)).

## Setting Up Coturn

If you choose self-hosted TURN over a managed provider like Cloudflare Calls, you can deploy [Coturn](https://github.com/coturn/coturn) on a Linux VPS with a public IP address.

:::tip
   It is recommended to use the [deployment script](./Deployment-Script.md) which could automatically install and configure Coturn for you!
:::

### 1. Firewall & Ports

Coturn requires listening ports for control traffic and a high-port UDP range for relayed media streams:

```bash
# STUN/TURN control traffic
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp

# Relay media port range
sudo ufw allow 49152:65535/udp
```

:::warning Cloud Security Groups
If your VPS is hosted on cloud providers like AWS EC2, GCP, DigitalOcean, or Hetzner, ensure these inbound firewall rules (especially `49152:65535/udp`) are also allowed in your cloud provider's network security group.
:::

### 2. Installation

#### Ubuntu / Debian (Native)

```bash
sudo apt update && sudo apt install -y coturn
```

Enable automatic service startup in `/etc/default/coturn` if present:
```bash
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

#### Docker

```bash
docker run -d --name coturn \
  --network=host \
  --restart=always \
  -v /etc/coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro \
  coturn/coturn
```

### 3. Configuration

Backup the default template and create `/etc/turnserver.conf`:

```bash
sudo mv /etc/turnserver.conf /etc/turnserver.conf.bak
sudo nano /etc/turnserver.conf
```

Paste the following minimal configuration:

```ini
# Listening ports
listening-port=3478
alt-listening-port=3479

# Relay media port range
min-port=49152
max-port=65535

# Enable Long-Term Credential mechanism (required for WebRTC)
fingerprint
lt-cred-mech

# Realm & static credentials
realm=your-domain.com
user=songbird:YourSecurePassword123

# Public IP binding
# If the server has a direct public IP:
external-ip=YOUR_SERVER_PUBLIC_IP
# If behind a NAT/VPC (AWS EC2, GCP, etc.), specify: external-ip=PUBLIC_IP/LOCAL_IP
# e.g.: external-ip=203.0.113.10/10.0.0.5

# Security & logging
no-cli
no-tls
no-dtls
log-file=/var/log/turnserver.log
simple-log
```

:::info WebRTC & Encryption
WebRTC media traffic is end-to-end encrypted via SRTP/DTLS by default. Plain `turn:...:3478` with UDP provides the lowest latency and optimal relay performance. If you require TLS encapsulation over port `5349` (`turns:`), obtain an SSL certificate (e.g. Let's Encrypt), open port `5349` (`tcp`/`udp`), and configure `cert` and `pkey` paths in `turnserver.conf`.
:::

### 4. Start the Service

```bash
sudo systemctl restart coturn
sudo systemctl enable coturn
sudo systemctl status coturn
```

Verify the listening socket:

```bash
sudo ss -ulpn | grep 3478
```

### 5. Songbird Integration

Set the environment variables in your Songbird `.env`:

```txt
TURN_STUN_URL="stun:your-domain.com:3478"
TURN_URL="turn:your-domain.com:3478"
TURN_USERNAME="songbird"
TURN_CREDENTIAL="YourSecurePassword123"
```

Restart your Songbird server to apply changes.

### 6. Verification

- **Songbird Admin Panel:** Open **Admin Panel** → **Services** to test connectivity, reachability, and latency against your TURN relay.
- **External ICE Test:** Test candidates via the [WebRTC Trickle ICE test](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/). A successful connection will output a candidate with type `relay`.


## Features

- **Voice Calls:** Crystal clear audio calling with microphone mute/unmute control.
- **Video Calls:** High-definition video calling with camera toggle and picture-in-picture local preview.
- **In-Call Controls:** Real-time call duration timer, mute button, camera toggle, screen share, and immediate call hangup.
- **Screen Sharing:** Share your entire screen, an application window, or (in browsers that support it) a browser tab during a voice or video call. Sharing starts and stops without interrupting the call; while you share, the screen takes the place of your camera, and the camera comes back when you stop. Both sides see a banner while a screen is being shared. You can stop from the call screen or from the browser's own "Stop sharing" control. The viewer can open the shared screen in fullscreen with the button on the video, and it closes by itself when the share stops.
- **Incoming Call Notifications:** In-app incoming call alerts with Accept and Decline buttons, plus a system push notification when the app is in the background.

:::info Screen sharing support
Screen sharing uses the browser's `getDisplayMedia` API, which desktop browsers (Chrome, Edge, Firefox, Safari) provide. Most mobile browsers (Chrome on Android, Safari on iOS) do not offer it yet, so the share button is hidden there. Mobile users can still watch a screen that someone else shares. Because screen sharing sends video, it is unavailable when `CALL_VIDEO` is off.
:::
