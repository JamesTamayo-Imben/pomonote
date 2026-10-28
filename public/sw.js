// Stale-while-revalidate: serve cached content immediately and refresh it online.
const V = "pn-v4";
addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(["./", "./style.css", "./app.js", "./lib.js", "./icon.svg", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"])).then(() => skipWaiting())));
addEventListener("activate", (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => clients.claim())));
addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const update = fetch(e.request).then((r) => {
    if (r.ok) return caches.open(V).then((ch) => ch.put(e.request, r.clone())).then(() => r);
    return r;
  });
  e.respondWith(caches.match(e.request).then((cached) => cached || update));
  e.waitUntil(update.then(() => {}).catch(() => {}));
});
