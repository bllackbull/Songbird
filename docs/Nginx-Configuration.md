# Configure Nginx

Songbird serves both the built frontend and the API from the Node server, so Nginx only needs to proxy one upstream: `http://127.0.0.1:SERVER_PORT`.

Create `/etc/nginx/sites-available/songbird`:

:::info

- Keep `proxy_pass` aligned with `SERVER_PORT`.
- Keep the Nginx `listen` port aligned with `CLIENT_PORT`.
- Keep `client_max_body_size` aligned with `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` when using local storage (`STORAGE_DRIVER=local`). When `STORAGE_DRIVER=remote` is active, file uploads stream directly from the browser to Cloudflare R2 / S3 via presigned URLs and bypass Nginx request body limits.

:::

## HTTP only

Use this if you are not enabling SSL yet:

```nginx
server {
  listen 80 default_server;
  server_name example.com www.example.com;
  client_max_body_size 75m;

  location /api/events {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
  }

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}
```

If you are using the server IP directly, replace `server_name example.com www.example.com;` with:

```nginx
server_name _;
```

## HTTPS

After you have certificate files, switch to this:

```nginx
server {
  listen 443 ssl default_server;
  server_name example.com www.example.com;
  client_max_body_size 75m;

  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;

  location /api/events {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
  }

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}

server {
  listen 80;
  server_name example.com www.example.com;
  return 301 https://$host$request_uri;
}
```

Enable the site:

```bash
sudo ln -sf /etc/nginx/sites-available/songbird /etc/nginx/sites-enabled/songbird
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```
