const CACHE_VERSION = "v0.9.0";
const CACHE_NAME = `songbird-${CACHE_VERSION}`;
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => null),
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("songbird-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  const isNavigation = event.request.mode === "navigate";
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (isNavigation) {
        const cachedIndex = await cache.match("/index.html");
        const update = fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              cache.put("/index.html", response.clone());
              self.clients
                .matchAll({ type: "window", includeUncontrolled: true })
                .then((clientsArr) => {
                  clientsArr.forEach((client) =>
                    client.postMessage({ type: "APP_SHELL_UPDATED" }),
                  );
                })
                .catch(() => null);
            }
            return response;
          })
          .catch(() => null);
        event.waitUntil(update);
        if (cachedIndex) return cachedIndex;
        const network = await update;
        if (network) return network;
        return cachedIndex || Response.error();
      }
      const cached = await cache.match(event.request);
      const revalidate = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      event.waitUntil(revalidate);
      if (cached) return cached;
      const network = await revalidate;
      return network || cached || Response.error();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Songbird", body: event.data?.text?.() || "" };
  }
  const title = payload.title || "Songbird";
  const body = payload.body || "New message";
  const data = payload.data || {};
  const options = {
    body,
    data,
    badge: "/icons/icon-192.png",
    icon: "/icons/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        const existing = clientsArr.find((client) =>
          client.url.includes(self.location.origin),
        );
        if (existing) {
          existing.focus();
          existing.navigate(target);
          return;
        }
        self.clients.openWindow(target);
      }),
  );
});
