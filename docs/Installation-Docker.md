# Install via Docker

:::tip Infrastructure Note
This guide uses Docker Compose and is designed for **IaaS** (Infrastructure as a Service — self-hosted VPS or dedicated virtual machines running Docker Engine). If you are deploying to managed cloud platforms (PaaS / CaaS) like Render, Railway, AWS ECS, Google Cloud Run, or Kubernetes, see the [Cloud Deployment](./Cloud-Deployment.md) guide.
:::

**Prerequisites (tested on Ubuntu 22.04+):**

- An Ubuntu server with sudo access
- A domain name pointing to your server's public IP (recommended)

## 1. System Setup

Install these packages:

```bash
sudo apt install -y ca-certificates gnupg lsb-release
```

Add Docker official GPG key:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

Add Docker apt repository:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker Engine + Compose plugin:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Optional: run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Optional: Verify installation:

```bash
docker --version
docker compose version
docker run hello-world
```

## 2. Clone repository

```bash
sudo mkdir -p /opt/songbird
cd /opt/songbird
git clone https://github.com/bllackbull/Songbird.git .
```

## 3. Configure environment

Copy the example environment file and edit it:

```bash
cp .env.example .env
nano .env
```

:::info Using PostgreSQL with Docker
Songbird defaults to SQLite (`DB_CLIENT=sqlite3`). To use PostgreSQL instead, edit `.env` to set `DB_CLIENT=postgres` along with your `POSTGRES_*` environment variables, or uncomment the optional `postgres` service and `postgres-data` volume block in `docker-compose.yaml`.
:::

:::info Media Worker Container
Songbird automatically spawns and manages a local Media Worker child process inside the all-in-one container (`bllackbull/songbird:latest`) by default. For distributed or high-load setups, you can offload media processing to the dedicated standalone image (`bllackbull/songbird-worker:latest`) or uncomment the optional `media-worker` service in `docker-compose.yaml`. See [Media Worker](./Media-Worker.md) for details.
:::

## 4. Set up TLS certificates

The nginx container requires TLS certificate files before it can start. Place your certificate and private key at:

- `certs/cert.pem` — certificate (or full chain)
- `certs/key.pem` — private key

See [SSL Certificates](./SSL-Certificates.md) for the available options.

## 5. Build and start

Pull the pre-built image and start the containers:

```bash
cd /opt/songbird
docker compose up -d
```

The image is pulled automatically from Docker Hub on first run. If you prefer to build from source instead, edit `docker-compose.yaml` and swap the `image:` line for the `build:` block (instructions are in the comments).

The nginx container waits for the app to pass its health check before it starts accepting traffic. This prevents 502 errors during the brief startup window while migrations run.

Optional: verify the containers started successfully:

```bash
docker compose ps
docker compose logs -f
```

:::info Nginx configuration

The nginx container serves HTTPS on port 443 using the certificates from the `certs/` directory. To customise the nginx config, refer to [Configure Nginx](./Nginx-Configuration.md). After editing `nginx/nginx.conf`, restart the nginx container:

```bash
docker compose restart nginx
```

:::

## Runtime User and Persistent Data

Docker deployments do not use `songbird.service`. Songbird runs as the user configured for the container (root in the current image unless Compose `user:` overrides it), and database commands run as that same container UID/GID:

```bash
docker compose exec songbird npm --prefix /app/server run db:inspect
```

To run the container as a specific non-root UID/GID, configure `user:` in your Compose service:

```yaml
services:
  songbird:
    user: "songbird:songbird"
```

When using a bind mount instead of the default named volume, make the host directory writable by that same UID:GID before starting Songbird. Songbird does not change host bind-mount ownership automatically:

```bash
mkdir -p ./data
sudo chown -R songbird:songbird ./data
```

## Admin panel service control

The admin panel's **Restart service** and **Stop service** actions work in Docker deployments by calling the Docker Engine API through the mounted socket (`/var/run/docker.sock`). The compose file sets `SONGBIRD_CONTAINER_NAME=songbird` so the app knows which container to target.

If you rename the container or use a custom name, set the env var to match:

```yaml
# docker-compose.yaml
environment:
  SONGBIRD_CONTAINER_NAME: my-custom-name
```

If you do not need service control from the admin panel, you can remove the socket mount from `docker-compose.yaml`:

```yaml
# Remove or comment out this line under songbird volumes:
# - /var/run/docker.sock:/var/run/docker.sock
```

## Updating

Pull the latest image and restart:

```bash
cd /opt/songbird
docker compose pull
docker compose up -d
```

See the [Updating](./Updating.md) page for the full update procedure.
