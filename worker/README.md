# Songbird Standalone Media Worker

A lightweight, stateless HTTP push worker for transcoding videos uploaded to Songbird object storage (Cloudflare R2 / AWS S3 / MinIO).

## Architecture

1. **Direct Upload**: The client uploads raw video directly to S3 / R2 using a presigned URL.
2. **HTTP Dispatch**: Songbird dispatches a `POST /transcode` request to this worker with file metadata.
3. **Asynchronous Transcode**: The worker downloads the raw video from S3/R2, transcodes it to universal H.264/AAC MP4 with `ffmpeg`, generates a thumbnail, and re-uploads the transcoded files to S3/R2.
4. **Callback Notification**: The worker posts the completed status and new S3 storage keys back to Songbird (`POST /api/uploads/webhook/processed`).

Because this worker uses HTTP dispatch and direct object storage access, it is **100% database agnostic** and works with both PostgreSQL and SQLite Songbird deployments.

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | HTTP port the worker listens on (default: `8080`) | `8080` |
| `WEBHOOK_SECRET` | Secret token to authenticate incoming requests from Songbird (`x-songbird-webhook-secret`). Must match Songbird's `WEBHOOK_SECRET`. | `your-secret-token` |
| `STORAGE_BUCKET` | S3 / R2 bucket name | `my-songbird-bucket` |
| `STORAGE_ENDPOINT` | S3 / R2 endpoint URL | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_REGION` | Storage region (default: `auto`) | `auto` |
| `STORAGE_ACCESS_KEY_ID` | Storage access key | `r2-access-key` |
| `STORAGE_SECRET_ACCESS_KEY` | Storage secret key | `r2-secret-key` |
| `STORAGE_FORCE_PATH_STYLE` | Set `true` for MinIO/S3 path style | `true` |
| `STORAGE_ENCRYPTION_KEY` | *(Optional)* Symmetric encryption key matching Songbird if envelope encryption is enabled | `generated-key` |

---

## Songbird Configuration

On the Songbird server, configure:

```env
STORAGE_DRIVER="remote"
STORAGE_PROCESSING_MODE="remote"    # or "auto"
WORKER_URL="https://your-media-worker.onrender.com"
WEBHOOK_URL="https://songbird.example.com/api/uploads/webhook/processed"
WEBHOOK_SECRET="your-secret-token"
```

---

## Deployment

### Deploy on Render (Web Service / Private Service)
- **Runtime**: Docker
- **Dockerfile Path**: `./worker/Dockerfile` (or build context `worker`)
- **Port**: `8080`

### Run with Docker locally
```bash
docker build -t songbird-media-worker -f worker/Dockerfile worker/
docker run -p 8080:8080 --env-file worker/.env songbird-media-worker
```
