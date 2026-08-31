# Media Worker

Songbird includes a dedicated, lightweight, stateless HTTP push **Media Worker** microservice (`worker/`) designed to offload CPU-intensive video transcoding, faststart optimization, thumbnail generation, and metadata extraction from the primary chat server.

Whether deployed as a built-in background process or as a standalone cloud microservice across separate machines or container instances, the Media Worker ensures fast, reliable media processing without degrading real-time chat responsiveness.

## Overview & Key Capabilities

- **Stateless & Database-Agnostic**: The Media Worker does not connect directly to SQLite or PostgreSQL. All communication with Songbird occurs over HTTP REST endpoints (`POST /transcode`) and webhook callbacks (`POST /api/uploads/webhook/processed`). It operates identically across all database configurations.
- **Dual Storage Engine Support**: Native support for both local filesystem storage (`STORAGE_DRIVER=local`) and S3-compatible remote object storage (`STORAGE_DRIVER=remote` — Cloudflare R2, AWS S3, MinIO, ArvanCloud, Wasabi, etc.).
- **Intelligent Transcoding**:
  - Automatically probes video format, codecs, dimensions, and duration using `ffprobe`.
  - Converts incompatible or high-bitrate video formats (MKV, AVI, WebM, HEVC, ProRes, etc.) into universally supported web-compatible H.264 video with AAC audio (`.mp4`).
  - **Smart Faststart Optimization**: If the uploaded video is already web-ready (H.264/AAC with `yuv420p` in an MP4 container), CPU-heavy re-encoding is skipped, applying faststart stream copy (`-movflags +faststart`) so playback starts instantly in client browsers without buffering.
- **Thumbnail Extraction**: Automatically extracts high-quality JPEG thumbnails (`<storageKey>-thumb.jpg`) from the first seconds of video for fast message previews and placeholders.
- **Metadata Extraction**: Measures video dimensions (width and height) and duration in seconds, reporting them to the Songbird backend for instant client layout rendering.
- **Orphan File Cleanup**: Upon successful transcoding, the worker automatically deletes the original raw video from remote storage to prevent duplicate storage consumption.
- **Application Envelope Encryption**: When Songbird's encryption-at-rest (`STORAGE_ENCRYPTION_MODE=local`) is enabled, the worker decrypts files in memory using `STORAGE_ENCRYPTION_KEY`, processes the video, and re-encrypts the output before saving.
- **Resilient Webhook Callbacks**: Uses exponential backoff retries (up to 5 attempts) to notify the Songbird server when processing completes, ensuring reliable delivery even during brief network interruptions.

## Architecture & Workflow

```
┌──────────────┐     1. Upload (Presigned / Multipart)    ┌──────────────────────┐
│  Web / App   │ ───────────────────────────────────────> │ S3 / R2 / Local Disk │
│    Client    │                                          └──────────────────────┘
└──────┬───────┘                                                     ▲
       │                                                             │
       │ 2. Notify Server                                            │ 4. Read raw /
       ▼                                                             │    Upload processed /
┌──────────────┐          3. POST /transcode              ┌──────────┴──────────┐
│   Songbird   │ ───────────────────────────────────────> │ Songbird Media Worker│
│   Backend    │ <─────────────────────────────────────── │    (HTTP Push)       │
└──────────────┘        5. POST /api/uploads/webhook/     └─────────────────────┘
                                processed (with retries)
```

### Execution Steps

1. **Media Upload**: The client uploads media either directly to the local server or via a presigned URL to S3-compatible object storage.
2. **Dispatch**: Songbird dispatches a `POST /transcode` request to the Media Worker containing the file identifier, storage key, encryption settings, and optional callback URLs.
3. **Queueing**: The worker immediately acknowledges receipt with `202 Accepted` and enqueues the job in its asynchronous queue (`AsyncQueue`), strictly governed by `WORKER_CONCURRENCY`.
4. **Processing**: The worker retrieves the raw media, decrypts it in memory if envelope encryption is active, inspects codecs, performs transcoding/faststart copy with FFmpeg, and creates a JPEG thumbnail.
5. **Callback Notification**: The worker posts the completed status, dimensions, duration, and processed storage keys back to Songbird via `POST /api/uploads/webhook/processed` (authenticated via `x-songbird-webhook-secret`).
6. **Real-time Broadcast**: Songbird updates the database record to `ready` and broadcasts an SSE/WebSocket update to all participants in the chat.

## Media Processing Modes (`STORAGE_PROCESSING_MODE`)

Songbird controls media processing dispatch using the `STORAGE_PROCESSING_MODE` environment variable:

| Mode | Description |
|---|---|
| `auto` (Default) | **Remote-First with Local Fallback.** Songbird attempts to dispatch transcoding tasks to the external worker (`WORKER_URL`), retrying failed requests until `STORAGE_PROCESSING_TIMEOUT_MS` expires. In Docker and standard environments, Songbird also automatically spawns and manages the local worker (`http://127.0.0.1:WORKER_PORT`) as a child process. If remote dispatch is unconfigured or times out, the local worker processes the file. |
| `local` | **Direct Local Worker Processing.** Forces all transcoding tasks to be handled directly by the local worker on `http://127.0.0.1:WORKER_PORT`. Remote workers are never contacted. Auto-spawns the local worker child process on startup. |
| `remote` | **Pure Remote Worker Processing.** Dispatches solely to the remote worker (`WORKER_URL`), retrying failed requests until `STORAGE_PROCESSING_TIMEOUT_MS` expires without falling back to local processing. No local worker processes are spawned or monitored on the Songbird server. Ideal for resource-constrained or serverless cloud instances. |

## Environment Variables Reference

### Media Worker Configuration

Configure these variables in the worker's environment (`.env` in `worker/` or container environment):

| Variable | Type | Default | Description |
|---|---|---:|---|
| `WORKER_PORT` | `integer` | `8080` | HTTP port the Media Worker listens on. |
| `WORKER_CONCURRENCY` | `integer` | `2` | Maximum number of concurrent FFmpeg transcode jobs. |
| `WEBHOOK_SECRET` | `string` | `""` | Secret token to authenticate incoming dispatch requests and outgoing webhook callbacks (`x-songbird-webhook-secret`). Must match Songbird's `WEBHOOK_SECRET`. |
| `STORAGE_DRIVER` | `string` | `local` | Storage driver (`local` for local disk or `remote` / `s3` for object storage). |
| `DATA_DIR` | `string` | `/opt/songbird/data` | Path to Songbird data directory (used when `STORAGE_DRIVER=local`). |
| `STORAGE_BUCKET` | `string` | `""` | S3 / R2 bucket name. |
| `STORAGE_ENDPOINT` | `string` | `""` | S3 / R2 endpoint URL (e.g., `https://<account-id>.r2.cloudflarestorage.com`). |
| `STORAGE_REGION` | `string` | `auto` | S3 / R2 region (e.g., `us-east-1` or `auto`). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | S3 / R2 Access Key ID. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | S3 / R2 Secret Access Key. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | Enables path-style URL syntax (`endpoint/bucket/key`). Recommended for Cloudflare R2, MinIO, ArvanCloud, Wasabi. |
| `STORAGE_ENCRYPTION_KEY` | `string` | `""` | *(Optional)* Symmetric encryption key matching Songbird if envelope encryption (`STORAGE_ENCRYPTION_MODE=local`) is enabled. |

### Songbird Server Configuration

Configure these variables in the Songbird backend `.env`:

| Variable | Type | Default | Description |
|---|---|---:|---|
| `WORKER_URL` | `string` | `""` | Base URL of the remote Media Worker (e.g., `https://media-worker.example.com`). Fallback: `MEDIA_WORKER_URL`. |
| `WORKER_PORT` | `integer` | `8080` | Port for the local Media Worker service. Songbird uses this to construct `http://127.0.0.1:WORKER_PORT`. |
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | Media processing strategy (`auto`, `local`, or `remote`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `30000` | Total retry timeout in milliseconds when dispatching transcode jobs to the remote worker before falling back to local processing in `auto` mode or failing the dispatch in `remote` mode. |
| `WEBHOOK_URL` | `string` | `""` | Public Songbird webhook callback URL sent to external workers (e.g., `https://songbird.example.com/api/uploads/webhook/processed`). Fallback: `WEBHOOK_CALLBACK_URL`. |
| `WEBHOOK_SECRET` | `string` | *(Auto-generated)* | Shared secret token used to authenticate webhook communications. Generated automatically on startup if omitted. |

## Deployment Options

### 1. Built-in Automatic Management (Single Server / Docker)

If you run Songbird via standard Docker Compose or systemd, you do not need to configure or launch the Media Worker separately.

- In Docker deployments, `scripts/docker-entrypoint.sh` automatically launches the worker process in the background.
- In manual/Node deployments, Songbird's `localWorkerManager` automatically detects whether the worker is listening on `WORKER_PORT` and starts `worker/index.js` as a managed child process if needed.

### 2. Standalone Docker Compose (Separate Server or Container)

To run the Media Worker on a dedicated server optimized for media processing (e.g., CPU/GPU-heavy instances):

**1. Create or navigate to `worker/`:**

```bash
cd /opt/songbird/worker
```

**2. Configure the worker `.env`:**

```txt
WORKER_PORT=8080
WORKER_CONCURRENCY=4
WEBHOOK_SECRET=your-secure-webhook-secret
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret-key
STORAGE_FORCE_PATH_STYLE=true
```

**3. Start with Docker Compose:**

```bash
docker compose -f docker-compose.yaml up -d
```

### 3. Deploying on Cloud Platforms (Render, Railway, Fly.io, Koyeb)

You can deploy the Media Worker as a standalone Web Service on any cloud container platform.

#### Render

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your Songbird repository.
3. Configure the service settings:
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `worker/Dockerfile`
   - **Docker Context**: `.`
4. Add Environment Variables:
   - `WORKER_PORT`: `8080`
   - `WORKER_CONCURRENCY`: `2`
   - `WEBHOOK_SECRET`: *(Same as Songbird server)*
   - `STORAGE_DRIVER`: `remote`
   - `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_FORCE_PATH_STYLE`
5. On your Songbird server `.env`, configure:
   ```txt
   WORKER_URL=https://your-media-worker.onrender.com
   WEBHOOK_URL=https://songbird.example.com/api/uploads/webhook/processed
   WEBHOOK_SECRET=your-secure-webhook-secret
   STORAGE_PROCESSING_MODE=remote
   ```

#### Railway / Fly.io

- Build from `worker/Dockerfile` with root context.
- Expose the HTTP port defined in `WORKER_PORT` (`8080`).
- Ensure the worker service has outbound Internet access to reach your object storage endpoint and Songbird `WEBHOOK_URL`.

### 4. Manual Systemd Service (Linux VPS)

If you run Songbird natively with systemd and prefer to run the worker as a separate system service:

**1. Install system prerequisites:**

```bash
sudo apt update
sudo apt install -y ffmpeg nodejs
```

**2. Install worker dependencies:**

```bash
cd /opt/songbird/worker
npm ci --omit=dev
```

**3. Create systemd unit file `/etc/systemd/system/songbird-worker.service`:**

```ini
[Unit]
Description=Songbird Media Worker
After=network.target

[Service]
Type=simple
User=songbird
WorkingDirectory=/opt/songbird/worker
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/songbird/.env

[Install]
WantedBy=multi-user.target
```

**4. Start and enable service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songbird-worker
sudo systemctl status songbird-worker
```

## API Reference & Endpoints

### 1. Health Check

**Endpoint:** `GET /health` or `GET /`

Returns worker health, service identification, and current task queue metrics.

```bash
curl http://localhost:8080/health
```

**Response (`200 OK`):**

```json
{
  "status": "ok",
  "service": "songbird-media-worker",
  "queue": {
    "pending": 0,
    "queued": 0,
    "concurrency": 2
  }
}
```

### 2. Transcode Dispatch

**Endpoint:** `POST /transcode`

Dispatches a media file for asynchronous processing.

**Headers:**
- `Content-Type: application/json`
- `x-songbird-webhook-secret: <WEBHOOK_SECRET>`

**Request Body Schema:**

```json
{
  "fileId": "123",
  "storageKey": "uploads/video-abc1234.mp4",
  "storedName": "original-video.mov",
  "mimeType": "video/quicktime",
  "encryptionType": "none",
  "callbackUrl": "https://songbird.example.com/api/uploads/webhook/processed",
  "webhookSecret": "your-webhook-secret"
}
```

**Response (`202 Accepted`):**

```json
{
  "success": true,
  "message": "Transcode job accepted",
  "fileId": "123",
  "queuePosition": 0
}
```

### 3. Webhook Callback

**Endpoint on Songbird Server:** `POST /api/uploads/webhook/processed`

Sent by the worker to Songbird upon completion.

**Headers:**
- `Content-Type: application/json`
- `x-songbird-webhook-secret: <WEBHOOK_SECRET>`

**Payload on Success (`status: "ready"`):**

```json
{
  "fileId": "123",
  "status": "ready",
  "transcodedStorageKey": "uploads/video-abc1234-h264-9f2d1e4a.mp4",
  "thumbStorageKey": "uploads/video-abc1234-thumb.jpg",
  "width": 1920,
  "height": 1080,
  "duration": 42.5
}
```

**Payload on Failure (`status: "failed"`):**

```json
{
  "fileId": "123",
  "status": "failed"
}
```

## Security & Best Practices

1. **Synchronize `WEBHOOK_SECRET`**: Always set an identical, high-entropy `WEBHOOK_SECRET` string on both the Songbird server and Media Worker. Requests lacking a matching `x-songbird-webhook-secret` header are rejected with `401 Unauthorized`.
2. **Private Network Isolation**: When deploying across dedicated cloud instances or internal VPCs, bind the Media Worker to internal private IPs or protect it behind a firewall (e.g. UFW or security groups) so that only Songbird server nodes can access `POST /transcode`.
3. **Concurrency & Resource Allocation**:
   - Transcoding is CPU and RAM intensive.
   - Recommended `WORKER_CONCURRENCY`: Set to `1` transcode job per 1–2 dedicated vCPUs.
   - For a 4-vCPU worker node, set `WORKER_CONCURRENCY=2` or `3` to avoid CPU throttling.
4. **Temporary Disk Space**: Ensure the worker host has sufficient temporary disk storage in `/tmp` (or system temp directory) to hold raw and transcoded video files during active processing.

## Troubleshooting

### Worker returns `401 Unauthorized`

- Verify that `WEBHOOK_SECRET` in Songbird's `.env` matches `WEBHOOK_SECRET` in the worker's `.env`.
- Check if special characters in the secret require proper quoting in environment files.

### Songbird never receives webhook callbacks

- Confirm `WEBHOOK_URL` on Songbird points to an externally accessible URL reachable from the worker instance (e.g., `https://songbird.example.com/api/uploads/webhook/processed`).
- When using loopback or private hostnames (`localhost`, `127.0.0.1`), ensure the worker is running on the same host or network namespace.
- Inspect worker logs for retry attempts (`[worker] Callback webhook returned HTTP ...`).

### Transcoding fails with FFmpeg errors

- Verify FFmpeg and FFprobe are installed and available in `$PATH`:
  ```bash
  ffmpeg -version
  ffprobe -version
  ```
- Check worker logs for detailed FFmpeg error output:
  ```bash
  journalctl -u songbird-worker -f
  # or for Docker
  docker compose -f worker/docker-compose.yaml logs -f
  ```
