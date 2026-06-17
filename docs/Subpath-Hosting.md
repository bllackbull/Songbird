# Running behind a domain + subpath

By default Songbird is served from the root of a domain (e.g. `https://chat.example.com/`). If you instead want to host it under a subpath (e.g. `https://example.com/songbird/`), you need to align three things: the Vite build `base`, the client asset references, and the Nginx location block.

:::info

Root-domain hosting is the supported default and needs none of the steps below. Only follow this page if you specifically need a subpath.

:::

## Overview

| Layer | What changes | Why |
|---|---|---|
| Vite build | Set `base` to the subpath | So built asset URLs are prefixed with the subpath. |
| `client/index.html` | Ensure icon/manifest links resolve under the subpath | Absolute `/...` paths break when served from a subpath. |
| Nginx | Add a `location` block for the subpath that proxies to the Node server | So requests under the subpath reach Songbird. |
| `.env` | Keep `SERVER_PORT` / `CLIENT_PORT` aligned with the proxy | Same as a normal install. |

## 1. Set the Vite `base`

In `client/vite.config.js`, add a `base` option matching your subpath (note the leading and trailing slashes):

```js
export default defineConfig(({ mode }) => {
  // ...
  return {
    base: "/songbird/",
    // ...plugins, build, server config unchanged
  };
});
```

Then rebuild the client:

```bash
cd /opt/songbird/client
npm run build
```

## 2. Check asset references in `index.html`

`client/index.html` references icons and the manifest with absolute paths such as `/favicon.ico` and `/manifest.webmanifest`. With a Vite `base` set, asset URLs emitted by the bundler are rewritten automatically, but hardcoded absolute paths in `index.html` are not. Confirm these resolve correctly under your subpath, and adjust them to be relative or subpath-prefixed if your icons or manifest 404 after deploying.

## 3. Add the Nginx location block

Proxy the subpath to the Node server. The SSE endpoint still needs its own buffering-disabled block. Adapt the [base Nginx config](./Nginx-Configuration.md) like this:

```nginx
location /songbird/api/events {
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

location /songbird/ {
  proxy_pass http://127.0.0.1:5174/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_cache_bypass $http_upgrade;
}
```

Reload Nginx after editing:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

:::info

The trailing slash on `proxy_pass http://127.0.0.1:5174/;` strips the `/songbird/` prefix before forwarding to the Node server. Keep the `base` in Vite and the `location` prefix in Nginx in sync; a mismatch is the most common cause of broken assets or blank pages on subpath setups.

:::
