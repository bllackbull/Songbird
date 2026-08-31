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
