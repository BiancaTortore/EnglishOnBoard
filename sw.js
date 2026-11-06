/* English on Board · offline support
   - Shell files (app, styles, course) are cached on install, per VERSION.
   - Photos, drawings and the recorded voices live in a separate MEDIA cache that survives
     app updates. The app also downloads every open lesson's voices and pictures in the
     background (see saveForOffline in app.js), so lessons work later without signal.
   - Audio is requested in byte ranges; ranges are answered from the cached full file.
   Bump VERSION whenever app.js / app.css / index.html change. */
const VERSION = "eob-v27";
const MEDIA = "eob-media-v1";
const SHELL = ["./", "index.html", "app.js", "app.css", "course.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const IS_MEDIA = /\.(mp3|m4a|wav|ogg|jpe?g|png|webp|svg)$/i;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  /* the server parts are never cached */
  if (sameOrigin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin"))) return;
  if (sameOrigin && IS_MEDIA.test(url.pathname) && !url.pathname.includes("/icons/")) { e.respondWith(media(req, url)); return; }
  const fresh = /\.(json|js|css|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/") || url.pathname.includes("/icons/");
  if (fresh) {
    /* network first, so content updates show up; cache when offline */
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, {ignoreSearch: true})));
  } else {
    /* fonts and anything else: cache first */
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(r => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    })));
  }
});

/* A file replaced with the same name (a new photo, a re-recorded line) must reach phones that
   already have the old one: once per session, ask the server quietly whether it changed. */
const checked = new Set();
function revalidate(cache, key){
  if (checked.has(key)) return;
  checked.add(key);
  fetch(key, {cache: "no-cache"}).then(r => { if (r.ok && r.status === 200) return cache.put(key, r); }).catch(() => {});
}

/* Media: cache first. The full file is fetched once (without a Range header) and kept;
   a range request is then cut from it, so audio plays the same with or without signal. */
async function media(req, url){
  const key = url.origin + url.pathname;
  const cache = await caches.open(MEDIA);
  let hit = await cache.match(key);
  if (hit) revalidate(cache, key);
  if (!hit) {
    let r;
    try { r = await fetch(key); } catch (e) { return Response.error(); }
    if (!(r.ok && r.status === 200)) return r;
    await cache.put(key, r.clone());
    hit = r;
  }
  const range = req.headers.get("range");
  if (!range) return hit;
  const buf = await hit.clone().arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; }   /* suffix range: last N bytes */
  end = Math.min(end, size - 1);
  if (start >= size || start > end) return new Response(null, {status: 416, headers: {"Content-Range": `bytes */${size}`}});
  return new Response(buf.slice(start, end + 1), {status: 206, headers: {
    "Content-Type": hit.headers.get("Content-Type") || "audio/mpeg",
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes"
  }});
}
