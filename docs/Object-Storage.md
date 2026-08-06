# Object Storage & Media Processing

Songbird supports a pluggable storage architecture that allows you to choose between local disk storage and S3-compatible remote object storage. When combined with background job queues, Songbird can process, convert, and serve media files seamlessly across single-node deployments or distributed cloud environments.

## Storage Drivers

Songbird uses the `STORAGE_DRIVER` environment variable to determine where uploaded chat files, media attachments, and avatars are stored.

| Driver | `STORAGE_DRIVER` | Description |
|---|---|---|
| **Local Disk** (Default) | `local` | Uploads are stored directly on the server's local file system in the `DATA_DIR` directory (`data/uploads/` and `data/avatars/`). Best for simple single-server deployments. |
| **Remote Object Storage** | `remote` | Uploads are stored in an S3-compatible object storage bucket (e.g., AWS S3, Cloudflare R2, MinIO, ArvanCloud, Wasabi). Uploads use presigned URLs directly from the client. |

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
| `STORAGE_REGION` | `string` | `auto` | Storage bucket region (defaults to `auto` for Cloudflare R2, MinIO, ArvanCloud, and S3-compatible providers out of the box; AWS S3 users can override this with their specific region, e.g. `us-east-1`, `eu-central-1`). |
| `STORAGE_ACCESS_KEY_ID` | `string` | `""` | Access Key ID for bucket authentication. |
| `STORAGE_SECRET_ACCESS_KEY` | `string` | `""` | Secret Access Key for bucket authentication. |
| `STORAGE_PUBLIC_URL` | `string` | `""` | Optional custom CDN domain URL prefix (e.g., `https://cdn.example.com`). If set, public download links use this prefix instead of presigned URLs. |
| `STORAGE_EXPIRES_IN` | `integer` | `3600` | Expiration time in seconds for presigned upload and download URLs. |
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | Enables path-style URL syntax (`endpoint/bucket/key`). Required for MinIO, Cloudflare R2, ArvanCloud, Wasabi, etc. |

### Provider Examples

#### AWS S3

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_FORCE_PATH_STYLE=false
```

#### Cloudflare R2

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
STORAGE_PUBLIC_URL=https://media.example.com
STORAGE_FORCE_PATH_STYLE=true
```

#### MinIO (Self-Hosted)

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=http://minio.internal:9000
STORAGE_BUCKET=songbird-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minioadmin
STORAGE_SECRET_ACCESS_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

#### ArvanCloud Object Storage

```
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=ir-thr-at1
STORAGE_ACCESS_KEY_ID=<ARVAN_ACCESS_KEY>
STORAGE_SECRET_ACCESS_KEY=<ARVAN_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
```

## Remote Media Processing & Fallback Settings

When uploading media files (such as videos or audio) with `STORAGE_DRIVER=remote`, Songbird handles processing asynchronously to ensure fast upload response times.

### Processing Modes (`STORAGE_PROCESSING_MODE`)

| Mode | Behavior |
|---|---|
| `auto` (Default) | **Hybrid Remote with Local Fallback.** Serves client presigned upload URLs. Expects an external remote worker / serverless compute to process media and hit the webhook callback (`/api/uploads/webhook/processed`). If the remote compute does not finish within `STORAGE_PROCESSING_TIMEOUT_MS`, the local worker automatically takes over processing. |
| `remote` | **Pure Remote Processing.** Remote workers or cloud webhooks handle processing exclusively. Disables local fallback timers. |
| `local` | **Pure Local Processing.** Forces local server media workers (FFmpeg / BullMQ) to process all uploaded files. |

### Configuration Variables

| Variable | Type | Default | Description |
|---|---|---:|---|
| `STORAGE_PROCESSING_MODE` | `string` | `auto` | Media processing strategy (`auto`, `remote`, or `local`). |
| `STORAGE_PROCESSING_TIMEOUT_MS` | `integer` | `30000` | Fallback timeout in milliseconds (default `30000` ms / 30 seconds) before local BullMQ worker takes over in `auto` mode. |
| `WEBHOOK_SECRET` | `string` | *(Auto-generated)* | Secret token to authenticate incoming webhook callback requests (`X-Songbird-Webhook-Secret`). Automatically generated on startup if missing and written to `.env` and `data/secrets.env`. |

### Webhook Callback Endpoint Setup

External compute services (such as AWS Lambda, Cloudflare Workers, or custom microservices) notify Songbird when remote media transcoding or processing completes.

#### How to Locate and Use the Webhook Secret:
1. On server startup, if `WEBHOOK_SECRET` is missing, Songbird automatically generates a secure secret token and writes it to both `.env` and `data/secrets.env`.

2. Administrators or cloud workers can inspect `.env` or `data/secrets.env` to locate the generated `WEBHOOK_SECRET`.

3. Configure your external cloud worker or serverless function to include this token in the `X-Songbird-Webhook-Secret` HTTP header when making callback requests to your Songbird server endpoint (`/api/uploads/webhook/processed`).

#### Webhook Endpoint Request:
```http
POST /api/uploads/webhook/processed
Header: x-songbird-webhook-secret: <WEBHOOK_SECRET>
Content-Type: application/json

{
  "fileId": 42,
  "status": "ready",
  "transcodedStorageKey": "transcoded/video_720p.mp4",
  "thumbStorageKey": "thumbs/video_thumb.jpg"
}
```

## Remote Encryption Modes (`STORAGE_ENCRYPTION_MODE`)

Songbird offers two encryption strategies when using remote object storage:

| Mode | `STORAGE_ENCRYPTION_MODE` | Description |
|---|---|---|
| **Remote Encryption** (Default) | `remote` | Uses provider-side encryption / default S3 bucket encryption (e.g., SSE-S3 / AES-256). Download requests return direct presigned 302 redirects to S3/CDN for maximum performance. |
| **Local Envelope Encryption** | `local` | Uses application-side envelope encryption (AES-256-GCM) with local encryption keys. The server fetches and decrypts files before streaming to the client. |

```
# Provider-side / bucket encryption (Recommended for Cloudflare R2 / AWS S3 with CDN)
STORAGE_ENCRYPTION_MODE=remote

# Application-side envelope encryption
STORAGE_ENCRYPTION_MODE=local
```

## Redis & Background Jobs (BullMQ)

Songbird uses **BullMQ** for managing background jobs, such as media processing, video transcoding, and cleanup timers.

### BullMQ Operation Modes

1. **Redis Enabled (`REDIS_HOST` or `REDIS_URL` configured):**
   - Songbird connects to Redis and initializes persistent BullMQ queues (`media-processing` queue) and background workers.
   - Tasks are distributed safely across multi-process server clusters or dedicated background worker nodes.
   - Enables Redis session storage and pub/sub event distribution across multiple server instances.

2. **In-Process Queue Fallback (Redis NOT configured):**
   - When no Redis host or URL is provided, Songbird seamlessly switches to an in-process, in-memory job queue with timer fallbacks.
   - Single-instance deployments run completely self-contained without requiring external Redis software or extra setup.

```
# Optional Redis setup for multi-instance scaling & BullMQ background queues
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# OR
REDIS_URL=redis://:password@redis-server:6379/0
```
