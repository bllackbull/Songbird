# Install via Docker

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

## 4. Set up TLS certificates

The nginx container requires TLS certificate files before it can start. Place your certificate and private key at:

- `certs/cert.pem` — certificate (or full chain)
- `certs/key.pem` — private key

See [SSL Certificates](./SSL-Certificates.md) for the available options (Certbot, existing files, or the deploy script).

## 5. Build and start

```bash
cd /opt/songbird
docker compose up -d --build
```

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

Pull the latest code and rebuild:

```bash
cd /opt/songbird
git pull origin main
docker compose up -d --build
```

See the [Updating](./Updating.md) page for the full update procedure.
