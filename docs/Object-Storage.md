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

## Direct-to-Storage Presigned Upload Architecture

When `STORAGE_DRIVER=remote` is active, Songbird uses a direct client-to-bucket presigned upload workflow. File content is streamed directly from the user's browser to Cloudflare R2 or AWS S3, completely bypassing the Songbird Node.js application server.

```
+--------+            1. POST /api/uploads/presign            +-----------------+
|        | -------------------------------------------------> |                 |
|        | <------------------------------------------------- |                 |
|        |         2. Return presigned PUT upload URL         |  Songbird App   |
|        |                                                    |     Server      |
| Client |            4. POST /api/uploads/complete           | (Node.js / API) |
| Browser| -------------------------------------------------> |                 |
|        | <------------------------------------------------- |                 |
|        |             5. File linked in database             +-----------------+
|        |                                                             
|        |            3. HTTP PUT (Direct file upload)        +-----------------+
|        | -------------------------------------------------> | Cloudflare R2 / |
|        | <------------------------------------------------- | S3 Storage      |
+--------+                 200 OK Response                    +-----------------+
```

### Direct Upload Flow

1. **Presign Request (`POST /api/uploads/presign`)**:
   - The client browser sends file metadata (`filename`, `mimeType`, `fileSize`, etc.) to the Songbird backend.
   - The server validates authentication, checks file size limits (`FILE_UPLOAD_MAX_SIZE_MB`), generates a unique storage key (`uploads/<timestamp>_<hash>.<ext>`), and generates a temporary S3 presigned `PUT` URL via `@aws-sdk/s3-request-presigner`.
   - The server records a pending upload record in the `pending_presigned_uploads` database table.
2. **Direct Browser Upload (`PUT <uploadUrl>`)**:
   - The client browser uploads the file payload directly to the Cloudflare R2 / S3 storage endpoint using the presigned URL.
3. **Upload Completion (`POST /api/uploads/complete` or Message Submit)**:
   - Once the HTTP `PUT` succeeds, the client notifies Songbird or attaches the file to a message request.
   - Songbird links the `storageKey` to the message file database (`chat_message_files`) and calls `removePendingPresignedUploads` to clean up the pending tracking record.

### Advantages of Direct Presigned Uploads

- **Zero Server Proxy Overhead**: Large file transfers consume no RAM or CPU on the Node.js server.
- **Bypasses Server & Reverse Proxy Limits**: Upload sizes are not constrained by Nginx or Express request body body-parser limits (`client_max_body_size`).
- **Higher Throughput**: Clients upload at full bandwidth directly to Cloudflare's global edge network or S3 infrastructure.

### Presigned Download Flow & CDN Fallback

For file downloads and media streaming:

- **`GET /api/uploads/presign-download`**: Generates a temporary presigned `GET` URL for private objects when queried.
- **`STORAGE_PUBLIC_URL` configured**: If a public CDN or custom domain is specified (e.g. `STORAGE_PUBLIC_URL=https://media.example.com`), Songbird generates direct public CDN URLs (`https://media.example.com/uploads/...`) instead of signing individual GET requests.
- **`STORAGE_PUBLIC_URL` unset**: Songbird generates signed S3 GET URLs that expire after `STORAGE_EXPIRES_IN` seconds (default: 3600s / 1 hour).

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
| `STORAGE_FORCE_PATH_STYLE` | `boolean` | `true` | Enables path-style URL syntax (`endpoint/bucket/key`). Set to `true` for Cloudflare R2, MinIO, ArvanCloud, Wasabi; set to `false` for AWS S3 virtual hosted style. |

## Cloudflare R2 & S3 CORS Configuration Requirements

Because client browsers upload files directly to Cloudflare R2 or S3 endpoints using presigned HTTP `PUT` requests, **Cross-Origin Resource Sharing (CORS) must be configured on your storage bucket**. Without proper CORS settings, browsers will block upload requests with origin/CORS preflight errors.

### Mandatory CORS JSON Configuration

Apply the following CORS configuration to your Cloudflare R2 or S3 bucket:

```json
[
  {
    "AllowedOrigins": [
      "https://chat.example.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD",
      "POST"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

> **Note**: Replace `https://chat.example.com` with your domain (or use `*` during initial testing). The `PUT` method, `*` allowed headers, and `ETag` exposed header are required for browser presigned uploads to function properly.

## Cloudflare R2 Setup Guide

Cloudflare R2 is an S3-compatible object storage service with zero egress fees, making it an ideal choice for hosting Songbird media attachments and avatars.

### Step 1: Create an R2 Bucket

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **R2 Object Storage** in the sidebar.
3. Click **Create bucket**.
4. Enter a bucket name (e.g. `songbird-media`) and click **Create Bucket**.

### Step 2: Generate Credentials & API Tokens

1. On the R2 Overview page, click **Manage R2 API Tokens** (in the right panel).
2. Click **Create API Token**.
3. Under **Permissions**, select **Object Read & Write** (or Admin Read & Write).
4. Under **Apply to specific buckets**, select your bucket (`songbird-media`) or choose **Apply to all buckets**.
5. Click **Create API Token**.
6. Save the generated credentials securely:
   - **Access Key ID** &rarr; `STORAGE_ACCESS_KEY_ID`
   - **Secret Access Key** &rarr; `STORAGE_SECRET_ACCESS_KEY`
7. Copy your **Account ID** from the Cloudflare Dashboard URL or the R2 Overview page (e.g. `https://dash.cloudflare.com/<ACCOUNT_ID>/r2`).

### Step 3: Configure Bucket CORS Policy

1. Open your bucket in Cloudflare R2 and select the **Settings** tab.
2. Scroll to **CORS Policy** and click **Edit CORS Policy**.
3. Paste the [CORS JSON configuration](#mandatory-cors-json-configuration) above and click **Save**.

### Step 4: Configure Songbird `.env` Variables

Add the following configuration to your `.env` file:

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
STORAGE_BUCKET=songbird-media
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
STORAGE_FORCE_PATH_STYLE=true
STORAGE_EXPIRES_IN=3600
```

### Step 5: (Optional) Custom Public Domain or R2 Public URL

By default, Songbird generates secure presigned URLs for downloading files. If you enable **Public Access** or connect a **Custom Domain** (e.g., `media.example.com`) to your R2 bucket in Cloudflare Settings, configure `STORAGE_PUBLIC_URL`:

```txt
STORAGE_PUBLIC_URL=https://media.example.com
```

## Provider Configuration Examples

### AWS S3

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STORAGE_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STORAGE_FORCE_PATH_STYLE=false
```

### Cloudflare R2 Summary

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

### ArvanCloud Object Storage

```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
STORAGE_BUCKET=my-songbird-bucket
STORAGE_REGION=ir-thr-at1
STORAGE_ACCESS_KEY_ID=<ARVAN_ACCESS_KEY>
STORAGE_SECRET_ACCESS_KEY=<ARVAN_SECRET_KEY>
STORAGE_FORCE_PATH_STYLE=true
```

## Pending Upload Tracking & Orphan File Cleanup

To ensure abandoned uploads do not accumulate in remote storage buckets, Songbird includes built-in tracking and automatic periodic pruning:

### Pending Upload Tracking

- When a client requests a presigned URL (`POST /api/uploads/presign`), the server records an entry in the `pending_presigned_uploads` table containing the `storage_key`, `user_id`, and creation timestamp.
- When the upload completes successfully and the file is saved (or attached to a chat message), Songbird executes `removePendingPresignedUploads` to remove the pending record.

### Periodic Background Pruning

- The background maintenance service runs `pruneOrphanRemoteObjects` periodically.
- It queries `pending_presigned_uploads` for records older than 1 hour.
- For each expired entry, the system checks whether the `storage_key` exists in `chat_message_files`.
- If the file is not attached to any message, the orphan object is deleted directly from the remote storage bucket (via `DeleteObjectCommand`), and the pending record is cleared.

## Unified Media Worker Architecture

Songbird features a dedicated, stateless HTTP push **Media Worker** (`worker/`) designed to offload video transcoding, thumbnail extraction, and media probing from the primary chat server.

:::tip Dedicated Media Worker Guide
For comprehensive instructions on standalone deployment, cloud platform setup (Render, Railway, Fly.io), concurrency tuning, and API reference, see the dedicated [Media Worker](./Media-Worker.md) guide.
:::

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

```txt
# Optional Redis setup for multi-instance scaling & BullMQ background queues
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# OR
REDIS_URL=redis://:password@redis-server:6379/0
```
