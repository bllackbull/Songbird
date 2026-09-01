# Cloud Deployment

This guide covers deploying Songbird on managed cloud infrastructure, including **Platform as a Service (PaaS)**, **Container as a Service (CaaS)**, and container orchestration platforms.

:::tip Looking for Self-Hosted VPS Deployment?
If you are deploying Songbird on a single Virtual Private Server (VPS) using Docker Compose or systemd, refer to the [Install via Docker](./Installation-Docker.md) or [Deployment Script](./Deployment-Script.md) guides.
:::

## Architecture Overview

Songbird can be deployed across various cloud paradigms depending on your operational and scaling requirements:

| Paradigm | Description | Suitable Platforms | Songbird Support |
|---|---|---|---|
| **IaaS** *(Infrastructure as a Service)* | Self-managed Virtual Machines running Docker or systemd | AWS EC2, DigitalOcean Droplets, Hetzner | Fully Supported |
| **PaaS** *(Platform as a Service)* | Deploy directly from source code repository | Render, Railway, Heroku, Fly.io | Fully Supported |
| **CaaS** *(Container as a Service)* | Deploy pre-built container images with managed orchestration | AWS ECS / Fargate, Google Cloud Run, Azure Container Apps, Kubernetes | Fully Supported |

## 1. Deploying on PaaS

PaaS providers let you deploy Songbird directly from your Git repository without managing server infrastructure.

### Build and Start Settings

Configure your PaaS deployment with the following runtime commands:

- **Build Command:**
  ```bash
  npm run build
  ```
- **Start Command:**
  ```bash
  npm --prefix server run start
  ```
- **Environment / Node Version:** Node.js `>=24.18.0`

### Persistence & Storage Strategy

PaaS instances are **ephemeral** by default — any files saved to local disk (such as SQLite databases or file uploads) will be erased whenever the application restarts or redeploys.

To run Songbird on PaaS, choose one of two storage strategies:

#### Strategy A: Single-Instance with Persistent Volume
If deploying a single app instance on platforms supporting volume mounts (e.g. Railway or Fly.io):
1. Attach a persistent disk volume to your app container (e.g., mounted at `/app/data`).
2. Set the data directory environment variable:
   ```txt
   DATA_DIR=/app/data
   ```

#### Strategy B: External Database + Object Storage (Recommended)
For stateless, zero-downtime PaaS deployments:
1. Provision a managed **PostgreSQL** database and configure database credentials:
   ```txt
   DB_CLIENT=postgres
   POSTGRES_URL=postgres://user:password@host:5432/songbird
   ```
2. Provision an **S3-compatible Object Storage** bucket (AWS S3, Cloudflare R2, MinIO, etc.) for attachments and avatars:
   ```txt
   STORAGE_DRIVER=remote
   STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_BUCKET=songbird-uploads
   STORAGE_ACCESS_KEY_ID=your_access_key
   STORAGE_SECRET_ACCESS_KEY=your_secret_key
   STORAGE_REGION=auto
   ```

## 2. Deploying on CaaS & Kubernetes

You can run Songbird in containerized environments using the official pre-built Docker images from Docker Hub:

- **Main Application (Frontend + Backend):** `bllackbull/songbird:latest`
- **Standalone Media Worker (FFmpeg Transcoder):** `bllackbull/songbird-worker:latest`

### Container Configuration

- **Exposed Port:** `5174` (or configure `SERVER_PORT`)
- **Health Check Path:** `http://localhost:5174/api/health`

### Horizontal Scaling & Multi-Instance Clusters

When running multiple container replicas (e.g., across AWS ECS tasks, Cloud Run revisions, or Kubernetes pods), instances must share database state, file storage, and real-time event messages.

To enable **multi-instance horizontal scaling**, configure the following trio of services:

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer / Ingress                  │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
        ┌──────▼──────┐                ┌──────▼──────┐
        │  Songbird   │                │  Songbird   │
        │ Instance 1  │                │ Instance 2  │
        └──────┬──────┘                └──────┬──────┘
               │                              │
     ┌─────────┴──────────────┬───────────────┴─────────┐
     │                        │                         │
┌────▼───────────────┐  ┌─────▼──────────────┐  ┌───────▼─────────────┐
│ Managed PostgreSQL │  │ Shared S3 Storage  │  │ Redis (Pub/Sub &    │
│ (Shared Database)  │  │ (Media & Avatars)  │  │ Background Worker)  │
└────────────────────┘  └────────────────────┘  └─────────────────────┘
```

#### 1. Shared Database
Set `DB_CLIENT=postgres` pointing to a managed PostgreSQL cluster (such as AWS RDS or GCP Cloud SQL):
```txt
DB_CLIENT=postgres
POSTGRES_HOST=postgres.internal
POSTGRES_PORT=5432
POSTGRES_USER=songbird
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=songbird
```

#### 2. Shared File Storage
Set `STORAGE_DRIVER=remote` pointing to S3-compatible object storage so media uploads and user avatars are accessible across all nodes:
```txt
STORAGE_DRIVER=remote
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_BUCKET=my-songbird-bucket
STORAGE_ACCESS_KEY_ID=AWS_ACCESS_KEY
STORAGE_SECRET_ACCESS_KEY=AWS_SECRET_KEY
STORAGE_REGION=us-east-1
```

:::tip Media Transcoding with Remote Storage
Songbird offloads video transcoding and thumbnail extraction to the standalone HTTP push **Media Worker** (`worker/`), which can be deployed as an independent container service or alongside backend nodes. See [Media Worker](./Media-Worker.md) and [Object Storage](./Object-Storage.md) for architecture and deployment details.
:::

#### 3. Redis Event Synchronization (Pub/Sub)
Configure `REDIS_URL` or `REDIS_HOST`. When Redis is enabled, Songbird automatically uses Redis Pub/Sub (channel `songbird:events`) to synchronize real-time WebSocket and SSE events across all container nodes:
```txt
REDIS_URL=redis://:password@redis.internal:6379
```

:::tip Sticky Sessions
For optimal WebSocket connectivity through load balancers, enable **Sticky Sessions** (session affinity based on client IP or cookie) at your ingress or load balancer level.
:::

## 3. Serverless Compatibility

Understanding how Songbird interacts with serverless execution models is critical before deploying to serverless platforms.

### Function as a Service (FaaS) — Anti-Pattern

Platforms like **AWS Lambda**, **Vercel Serverless Functions**, or **Netlify Functions** execute code in response to individual HTTP requests and terminate execution contexts immediately after.

:::danger FaaS Runtimes Are Not Supported
Deploying Songbird as a FaaS application (e.g., on Vercel Functions or AWS Lambda) is **not supported**. FaaS is an architectural anti-pattern for real-time chat platforms like Songbird because:

1. **Persistent Connections:** Songbird relies on long-lived WebSocket and Server-Sent Events (SSE) connections for instant message delivery. FaaS runtimes enforce strict connection timeouts (typically 15s to 15m) and disconnect persistent clients.
2. **Background Processes:** Songbird uses in-memory background timers for heartbeats, SSE broadcast queues, and remote channel synchronization. FaaS freezes or kills process execution between requests, causing message delivery failures.
3. **State & Memory:** In-memory caching and connection registries are wiped when FaaS instances spin down.
:::

### Serverless Containers — Fully Supported

Do not confuse **Function as a Service (FaaS)** with **Serverless Containers**:

- **Serverless Containers** (such as **Google Cloud Run**, **AWS Fargate**, or **Azure Container Apps**) run full Docker containers without requiring you to manage underlying virtual machines.
- Unlike FaaS, Serverless Containers provide persistent execution, full WebSocket/SSE support, long-running processes, and background workers.
- Songbird is **fully compatible** with Serverless Container platforms.
