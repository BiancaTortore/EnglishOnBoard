/* English on Board · offline support
   Shell files are cached on install. Everything else (lessons, audio, images) is cached the
   first time it loads, so a lesson opened once with signal works later without signal.
   Bump VERSION whenever app.js / app.css / index.html change. */
const VERSION = "eob-v7";
const SHELL = ["./", "index.html", "app.js", "app.css", "course.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  /* audio uses range requests: let the network handle them, fall back to cache */
  const fresh = /\.(json|js|css|html)$/.test(url.pathname) || url.pathname.endsWith("/");
  if (fresh) {
    /* network first, so content updates show up; cache when offline */
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, {ignoreSearch: true})));
  } else {
    /* cache first for images, audio, fonts */
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(r => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    })));
  }
});
