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

Optional: Verify Installation:

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

Create a self-signed cert in `certs/` directory if running the app on SSL:

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

## 3. Build container

```bash
cd /opt/songbird
docker compose -f docker-compose.yaml up -d --build
```

Optional: Verify container is built successfully:

```bash
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f
```

:::info

Docker automatically configures the nginx config to run on port 443 using the self-signed cert you previously generated.
To change and customize the nginx config, refer to the [Configure Nginx](./Nginx-Configuration.md) page.

:::
