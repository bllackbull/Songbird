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

   :::tip Managed PostgreSQL with SSL & Custom CA (Aiven, AWS RDS, etc.)
   Managed database providers (such as **Aiven**, **AWS RDS**, or **DigitalOcean**) require SSL/TLS and use private project Certificate Authorities (CAs) that are not in the standard Node.js trust store. Connecting without providing the CA will cause a `SELF_SIGNED_CERT_IN_CHAIN` error during startup.

   **On Render:**
   1. In your Aiven/RDS dashboard, download or copy the **CA Certificate** (`ca.pem`).
   2. In your Render Dashboard, go to your service's **Environment** settings.
   3. Under **Secret Files**, add a new file:
      - **Filename:** `aiven-ca.pem` (or `/etc/secrets/aiven-ca.pem`)
      - **Contents:** Paste the full PEM certificate text (`-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----`).
   4. Add the environment variable to your service:
      ```txt
      NODE_EXTRA_CA_CERTS=/etc/secrets/aiven-ca.pem
      ```

   **On Docker / CaaS / VPS:**
   Mount or copy your `ca.pem` into the container or server, and set:
   ```txt
   NODE_EXTRA_CA_CERTS=/path/to/ca.pem
   ```
   :::

2. Provision an **S3-compatible Object Storage** bucket (AWS S3, Cloudflare R2, MinIO, etc.) for attachments and avatars:
   ```txt
   STORAGE_DRIVER=remote
   STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_BUCKET=songbird-uploads
   STORAGE_ACCESS_KEY_ID=your_access_key
   STORAGE_SECRET_ACCESS_KEY=your_secret_key
   STORAGE_REGION=auto
   ```

### Railway (Infrastructure as Code)

Songbird includes an automated **Infrastructure as Code (IaC)** configuration at `.railway/railway.ts` for one-click, reproducible multi-service deployment on [Railway](https://railway.com).

#### Architecture & Resources Provisioned

The Railway IaC configuration programmatically creates and interconnects a full-stack Songbird topology under a single `"songbird"` project group:

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        Railway Project Canvas                          │
│                                                                        │
│   ┌─────────────────────────── "songbird" Group ──────────────────┐    │
│   │                                                               │    │
│   │   ┌──────────────────┐               ┌────────────────────┐   │    │
│   │   │  PostgreSQL      │◀──────────────│  Songbird App      │   │    │
│   │   │  (Managed DB)    │  DATABASE_URL │  (Web & API)       │   │    │
│   │   └──────────────────┘               └────────┬───────────┘   │    │
│   │                                               │               │    │
│   │                                  Private Mesh │ Webhook &     │    │
│   │                                       Network │ Worker URL    │    │
│   │                                               │               │    │
│   │   ┌──────────────────┐               ┌────────▼───────────┐   │    │
│   │   │  Uploads Bucket  │◀──────────────│  Songbird Worker   │   │    │
│   │   │  (S3 Storage)    │  S3 Driver    │  (Media Transcoder)│   │    │
│   │   └────────▲─────────┘               └────────────────────┘   │    │
│   │            │                                  │               │    │
│   │            └──────────────────────────────────┘               │    │
│   │                        S3 Driver                              │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                                                                        │
│                                    ▲                                   │
│                                    │ Public Ingress                    │
│                              Public Domain                             │
└────────────────────────────────────────────────────────────────────────┘
```

#### Step-by-Step Deployment Guide

Follow these steps to deploy Songbird on Railway using the Railway CLI:

##### Step 1: Install Railway CLI

```bash
npm i -g @railway/cli
# or macOS Homebrew
brew install railway
```

##### Step 2: Authenticate with Railway

```bash
railway login
```

##### Step 3: Initialize or Link the Project

Navigate to your local clone of the Songbird repository and initialize a new project or link to an existing one:

```bash
railway init
# or to link an existing project:
railway link
```

##### Step 4: Deploy the IaC Stack

Deploy the code. Railway automatically recognizes `.railway/railway.ts` and provisions the database, object storage bucket, worker, and main application:

```bash
railway up
```

##### Step 5: Expose Public Domain for Songbird App

By default, Railway services run within private networking. To make Songbird accessible to users:

1. In the [Railway Dashboard](https://railway.com/dashboard), click on the **songbird-server** service.

2. Navigate to **Settings** > **Networking** > **Public Networking**.

3. Click **Generate Domain** (or attach your own custom domain).

Alternatively, generate a domain using the CLI:

```bash
railway domain --service songbird-server
```

### Render (Blueprint)

Songbird ships a [Render Blueprint](https://render.com/docs/blueprints) at `render.yaml`: a single Docker web service (`songbird`) backed by managed PostgreSQL. Unlike the Railway topology there is no separate worker service — the container entrypoint auto-starts an in-container Media Worker (`WORKER_PORT=8080`) next to the app, which itself listens on Render's `PORT`, so the two never collide.

#### What Gets Provisioned

- **`songbird` web service** — built from the root `Dockerfile` (Vite frontend + Express backend), health check at `/api/health`.
- **Managed PostgreSQL** — connect it via `POSTGRES_URL` (use the database's *internal* connection string) with `POSTGRES_SSL=true`.

#### Setup

1. Push the repository to GitHub, then in the [Render Dashboard](https://dashboard.render.com) choose **New → Blueprint** and select the repo — `render.yaml` is detected automatically.
2. Fill in the secrets Render prompts for: `POSTGRES_URL` plus the object-storage settings (`STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, optional `STORAGE_PUBLIC_URL`).
3. Deploy. No further storage wiring is needed:
   - Bucket CORS self-configures from `RENDER_EXTERNAL_URL` (`STORAGE_AUTO_CORS=true` is pre-set in the Blueprint).
   - The worker callback URL auto-derives to the service's public URL — `WEBHOOK_URL` can stay empty.

#### Notes & Limitations

- **Ephemeral filesystem**: keep `STORAGE_DRIVER=remote` with external PostgreSQL (Strategy B above). Never rely on local disk on Render.
- **Free-plan sleeping**: the instance (and the in-container worker with it) sleeps after inactivity, so the first request or upload after idle wakes it with a cold-start delay.
- **Single instance**: stay on one instance on free/starter plans. Horizontal scale-out needs shared PostgreSQL + object storage + Redis as described under *Deploying on CaaS & Kubernetes* below.

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
