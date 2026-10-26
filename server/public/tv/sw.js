const SHELL = "tv-shell-v4";
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        cache.addAll(["./", "./index.html", "./player.js", "./poster.js", "./lottery.js", "./build.js", "./player.css"]),
      )
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    (async () => {
      if (url.pathname.startsWith("/uploads/")) {
        for (const name of (await caches.keys()).filter((n) =>
          n.startsWith("tv-content-"),
        )) {
          const cached = await (await caches.open(name)).match(request);
          if (cached) return cached;
        }
        return fetch(request);
      }
      try {
        return await fetch(request);
      } catch {
        const cached = await (await caches.open(SHELL)).match(request);
        return cached || Response.error();
      }
    })(),
  );
});
