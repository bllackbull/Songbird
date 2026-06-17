# پیکربندی Nginx

Songbird هم فرانت‌اند ساخته‌شده و هم API را از سرور Node ارائه می‌دهد، بنابراین Nginx تنها باید یک upstream را پراکسی کند: `http://127.0.0.1:SERVER_PORT`.

فایل `/etc/nginx/sites-available/songbird` را ایجاد کنید:

:::info

- مقدار `proxy_pass` را با `SERVER_PORT` همسو نگه دارید.
- پورت `listen` در Nginx را با `CLIENT_PORT` همسو نگه دارید.
- مقدار `client_max_body_size` را با `FILE_UPLOAD_MAX_TOTAL_SIZE_MB` همسو نگه دارید.

:::

## فقط HTTP

اگر هنوز SSL را فعال نمی‌کنید از این استفاده کنید:

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

اگر مستقیماً از IP سرور استفاده می‌کنید، `server_name example.com www.example.com;` را با این جایگزین کنید:

```nginx
server_name _;
```

## HTTPS

پس از اینکه فایل‌های گواهی‌نامه را تهیه کردید، به این تغییر دهید:

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

سایت را فعال کنید:

```bash
sudo ln -sf /etc/nginx/sites-available/songbird /etc/nginx/sites-enabled/songbird
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```
