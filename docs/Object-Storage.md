# Object Storage & Media Processing

Songbird supports a pluggable storage architecture that allows you to choose between local disk storage and S3-compatible remote object storage. When combined with the unified **Songbird Media Worker**, Songbird provides high-performance, asynchronous video transcoding, thumbnail extraction, and media optimization across single-server or distributed cloud environments.

## Storage Drivers

Songbird uses the `STORAGE_DRIVER` environment variable to determine where uploaded chat files, media attachments, and avatars are stored.

| Driver | `STORAGE_DRIVER` | Description |
|---|---|---|
| **Local Disk** (Default) | `local` | Uploads are stored directly on the server's local file system in the `DATA_DIR` directory (`data/uploads/` and `data/avatars/`). Ideal for single-server VPS or Docker deployments. |
| **Remote Object Storage** | `remote` | Uploads are stored in an S3-compatible object storage bucket (e.g., AWS S3, Cloudflare R2, MinIO, ArvanCloud, Wasabi). File uploads bypass the application server via direct client-to-bucket presigned URLs. |

```bash
# Example .env setting
STORAGE_DRIVER=remote
```

## Remote Object Storage Configuration

When `STORAGE_DRIVER=remote` is enabled, configure the following environment variables to connect Songbird to your object storage bucket:

| Variable | Type | Default | Description |
|---|---|---:|---|
| `STORAGE_DRIVER` | `string` | `local` | Set to `remote` to enable remote object storage. |
| `STORAGE_ENDPOINT` | `string` | `""` | Base URL of your S3-compatible service (e.g., AWS, Cloudflare R2, MinIO, ArvanCloud). |
| `STORAGE_BUCKET` | `string` | `""` | Name of your storage bucket. |
| `STORAGE_REGION` | `string` | `auto` | Storage bucket region (defaults to `auto` for Cloudflare R2, MinIO, and ArvanCloud; AWS S3 users can set their specific region like `us-east-1`). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | Access Key ID for bucket authentication. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | Secret Access Key for bucket authentication. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | Optional custom CDN domain URL prefix (e.g., `https://cdn.example.com`). If set, public download links use this prefix instead of presigned URLs. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | Expiration time in seconds for presigned upload and download URLs. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | Enables path-style URL syntax (`endpoint/bucket/key`). Required for MinIO, Cloudflare R2, ArvanCloud, Wasabi, etc. |

### Provider Configuration Examples

#### Cloudflare R2

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
STORAGE_PUBLIC_URL=https://media.example.com
STORAGE_FORCE_PATH_STYLE=true
```

#### AWS S3

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_FORCE_PATH_STYLE=false
```

#### MinIO (Self-Hosted)

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=http://minio.internal:9000
STORAGE_BUCKET=songbird-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

#### ArvanCloud Object Storage

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=ir-thr-at1
STORAGE_ACCESS_KEY_ID=<ARVAN_ACCESS_KEY>
STORAGE_SECRET_ACCESS_KEY=<ARVAN_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
```

---

## Unified Media Worker Architecture

Songbird features a dedicated, stateless HTTP push **Media Worker** (`worker/`) designed to offload video transcoding, thumbnail extraction, and media probing from the primary chat server.

:::tip Dedicated Media Worker Guide
For comprehensive instructions on standalone deployment, cloud platform setup (Render, Railway, Fly.io), concurrency tuning, and API reference, see the dedicated [Media Worker](./Media-Worker.md) guide.
:::

```
┌──────────────┐     1. Upload (Presigned/Multipart)     ┌──────────────────────┐
│  Web / App   │ ──────────────────────────────────────> │ S3 / R2 / Local Disk │
│    Client    │                                         └──────────────────────┘
└──────┬───────┘                                                     ▲
       │                                                             │
       │ 2. Notify Server                                            │ 4. Read raw /
       ▼                                                             │    Upload processed /
┌──────────────┐          3. POST /transcode             ┌───────────┴──────────┐
│   Songbird   │ ──────────────────────────────────────> │ Songbird Media Worker│
│   Backend    │ <────────────────────────────────────── │    (HTTP Push)       │
└──────────────┘       5. POST /api/uploads/webhook/     └──────────────────────┘
                              processed (with retries)
```

### Core Architecture Highlights

- **Database-Agnostic**: The media worker does not connect directly to SQLite or PostgreSQL. Communication with Songbird occurs entirely over HTTP (`POST /transcode` and webhook callbacks), allowing it to scale independently and work seamlessly across all deployment configurations.
- **Dual Storage Support**: The worker natively processes media for both S3-compatible remote object storage (Cloudflare R2, AWS S3, MinIO) and local filesystem storage.
- **Intelligent Transcoding & Faststart**:
  - Automatically probes video format and codecs (`ffprobe`).
  - Converts non-compliant or high-bitrate video formats (e.g. MKV, AVI, WebM, HEVC, ProRes) into universally supported web-compatible H.264 video with AAC audio (`.mp4`).
  - **Smart Web-Ready Skip**: If the uploaded video is already web-ready (H.264/AAC with `yuv420p` in an MP4 container), CPU-heavy re-encoding is bypassed, applying faststart stream copy (`-movflags +faststart`) to optimize instant playback.
- **Thumbnail Generation**: Automatically extracts high-quality JPEG thumbnails (`<storageKey>-thumb.jpg`) for video previews.
- **Metadata Extraction**: Measures dimensions (width, height) and duration, reporting them back to Songbird for instant client layout rendering.
- **Orphan File Cleanup**: Upon successful transcoding, the worker automatically deletes the original raw video file from remote object storage to prevent duplicate storage consumption.
- **End-to-End Envelope Encryption**: When Songbird's encryption-at-rest (`STORAGE_ENCRYPTION_MODE=local`) is enabled, the worker decrypts files in memory using `STORAGE_ENCRYPTION_KEY`, processes the video, and re-encrypts the output before saving.
- **Robust Retry Delivery**: The worker uses exponential backoff retries (up to 5 attempts) when notifying the Songbird server webhook, ensuring resilient operation during network hiccups or restarts.

---

## Media Processing Modes (`STORAGE_PROCESSING_MODE`)

Songbird configures media processing via `STORAGE_PROCESSING_MODE`:

| Mode | Behavior |
|---|---|
| `auto` (Default) | **Remote-First with Local Fallback.** Runs the local Media Worker service in the container. Dispatches transcode jobs to the remote worker (`WORKER_URL`), retrying failed requests until `STORAGE_PROCESSING_TIMEOUT_MS` expires before falling back to the local Media Worker (`http://127.0.0.1:WORKER_PORT`). If `WORKER_URL` is omitted, dispatches directly to the local worker. |
| `local` | **Direct Local Worker Processing.** Runs the local Media Worker in the container and dispatches directly and exclusively to the local worker (`http://127.0.0.1:WORKER_PORT`). Remote workers are never called. |
| `remote` | **Pure Remote Worker Processing.** Does not run any local worker in the container and dispatches only to the remote worker (`WORKER_URL`), retrying failed requests until `STORAGE_PROCESSING_TIMEOUT_MS` expires without local fallback. |

### Configuration Variables on Songbird Server

Add or edit these settings in your Songbird server `.env`:

| Variable | Type | Default | Description |
|---|---|---:|---|
| `WORKER_URL` | `string` | `""` | External media processing worker base URL for HTTP push transcoding (e.g. `https://worker.example.com`). Fallback: `MEDIA_WORKER_URL`. |
| `WORKER_PORT` | `integer` | `8080` | Port for the standalone Media Worker service (`worker/`). Songbird uses this as the default port when constructing the local Media Worker URL (`http://127.0.0.1:8080`). |
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | Media processing strategy (`auto`, `remote`, or `local`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `30000` | Total retry timeout in milliseconds when dispatching transcode jobs to the remote worker before falling back to local processing in `auto` mode or failing the dispatch in `remote` mode. |
| `WEBHOOK_URL` | `string` | `""` | Songbird public webhook callback URL sent to external workers (e.g. `https://songbird.example.com/api/uploads/webhook/processed`). Fallback: `WEBHOOK_CALLBACK_URL`. |
| `WEBHOOK_SECRET` | `string` | *(Auto-generated)* | Secret token to authenticate incoming webhook callback requests (`X-Songbird-Webhook-Secret`). Automatically generated on startup if missing and written to `.env` and in the database. |

---

## Deploying the Media Worker

The Media Worker lives in the `worker/` directory and can be deployed alongside Songbird or on a separate standalone server or container service.

### Worker Environment Variables

| Variable | Type | Default | Description |
|---|---|---:|---|
| `WORKER_PORT` | `integer` | `8080` | HTTP port the worker listens on. |
| `WORKER_CONCURRENCY` | `integer` | `2` | Number of simultaneous video transcode operations. |
| `WEBHOOK_SECRET` | `string` | `""` | Secret token to authenticate incoming dispatch requests from Songbird. Must match Songbird's `WEBHOOK_SECRET`. |
| `WEBHOOK_URL` | `string` | `""` | Default Songbird webhook callback URL. |
| `STORAGE_DRIVER` | `string` | `local` | Storage backend (`local` for local disk, `s3` / `remote` for object storage). |
| `STORAGE_BUCKET` | `string` | `""` | S3 / R2 bucket name. |
| `STORAGE_ENDPOINT` | `string` | `""` | S3 / R2 endpoint URL. |
| `STORAGE_REGION` | `string` | `auto` | S3 / R2 bucket region. |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | Storage Access Key ID. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | Storage Secret Access Key. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | Set `true` for Cloudflare R2, MinIO, and ArvanCloud. |
| `STORAGE_ENCRYPTION_KEY` | `string` | `""` | *(Optional)* Symmetric encryption key matching Songbird if envelope encryption is enabled. |
| `DATA_DIR` | `string` | `/opt/songbird/data` | Path to Songbird data directory (uploads accessed at `<DATA_DIR>/uploads`) when `STORAGE_DRIVER=local`. |

### Option 1: Standalone Docker Compose

You can run the worker using the provided `worker/docker-compose.yaml`:

```bash
cd worker
docker compose up -d
```

### Option 2: Deploying to Cloud Platforms (Render, Railway, Fly.io)

You can run the worker as an independent Docker service on any container hosting platform:

- **Build Context / Root**: `./worker`
- **Dockerfile**: `./worker/Dockerfile`
- **Port**: `8080`
- **Environment Variables**: Configure the storage credentials (`STORAGE_*`) and `WEBHOOK_SECRET` matching your Songbird backend.

### Option 3: Local Docker Build

```bash
# Build worker image
docker build -t songbird-media-worker -f worker/Dockerfile worker/

# Run worker container
docker run -d \
  -p 8080:8080 \
  --name songbird-media-worker \
  --env-file .env \
  songbird-media-worker
```

### Health Check

The Media Worker provides a `/health` endpoint reporting operational status, active jobs, and queued tasks:

```bash
curl http://localhost:8080/health
```

Example response:
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

---

## Remote Encryption Modes (`STORAGE_ENCRYPTION_MODE`)

Songbird offers two encryption strategies when using remote object storage:

| Mode | `STORAGE_ENCRYPTION_MODE` | Description |
|---|---|---|
| **Remote Encryption** (Default) | `remote` | Uses provider-side encryption / default S3 bucket encryption (e.g., SSE-S3 / AES-256). Download requests return direct presigned 302 redirects to S3/CDN for maximum performance. |
| **Local Envelope Encryption** | `local` | Uses application-side envelope encryption (AES-256-GCM) with local encryption keys (`STORAGE_ENCRYPTION_KEY`). Files are decrypted securely on the fly. |

```txt
# Provider-side / bucket encryption (Recommended for Cloudflare R2 / AWS S3 with CDN)
STORAGE_ENCRYPTION_MODE=remote

# Application-side envelope encryption
STORAGE_ENCRYPTION_MODE=local
```
