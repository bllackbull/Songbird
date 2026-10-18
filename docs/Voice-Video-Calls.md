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
```

### When is a TURN server required?

- **Local / Direct Network:** For most home networks and standard connections, the default STUN server (`stun:stun.l.google.com:19302`) is sufficient.
- **Mobile Networks / Restrictive Corporate Firewalls:** If participants are on mobile carrier connections with symmetric NAT or behind corporate firewalls, WebRTC peer-to-peer negotiation may fail without a TURN relay server (such as [Coturn](https://github.com/coturn/coturn)).

## Features

- **Voice Calls:** Crystal clear audio calling with microphone mute/unmute control.
- **Video Calls:** High-definition video calling with camera toggle and picture-in-picture local preview.
- **In-Call Controls:** Real-time call duration timer, mute button, camera toggle, and immediate call hangup.
- **Incoming Call Notifications:** In-app incoming call alerts with Accept and Decline buttons, plus a system push notification when the app is in the background.
