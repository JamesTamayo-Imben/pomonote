// Network-first with cache fallback: always fresh when online, still opens offline.
const V = "pn-v3";
addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(["./", "./style.css", "./app.js", "./lib.js", "./icon.svg", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"])).then(() => skipWaiting())));
addEventListener("activate", (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => clients.claim())));
addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ch) => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
