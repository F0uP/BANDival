/* Bandival service worker
 * - Hashed build assets: cache-first (immutable)
 * - Pages + selected API GETs: network-first, cached copy as offline fallback
 *   (lets the stage mode / lead sheets work without network at a gig)
 * - Everything else (uploads, mutations): straight to the network
 * - Web Push: shows notifications and focuses/opens the app on click
 */
const VERSION = "v4";
const STATIC_CACHE = `bandival-static-${VERSION}`;
const PAGE_CACHE = `bandival-pages-${VERSION}`;
const API_CACHE = `bandival-api-${VERSION}`;
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icon.svg"];

const API_CACHEABLE = [
  "/api/auth/me",
  "/api/songs",
  "/api/setlists",
  "/api/albums",
  "/api/events",
  "/api/calendar/overview",
  "/api/bands/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("bandival-") && ![STATIC_CACHE, PAGE_CACHE, API_CACHE].includes(key)).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CLEAR_DATA") {
    event.waitUntil(Promise.all([caches.delete(API_CACHE), caches.delete(PAGE_CACHE)]));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, PAGE_CACHE).catch(async () => (await caches.match("/offline.html")) ?? Response.error()),
    );
    return;
  }

  const isCacheableApi = API_CACHEABLE.some((prefix) => url.pathname.startsWith(prefix))
    && !url.pathname.includes("/backup")
    && !url.pathname.includes("/pdf");
  if (isCacheableApi) {
    event.respondWith(
      networkFirst(request, API_CACHE).catch(() => new Response(JSON.stringify({ error: "Offline – keine gespeicherten Daten verfügbar." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Bandival", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Bandival";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
