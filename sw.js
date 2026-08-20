/* Coffee Compass service worker.
   Makes the app and all its data available offline, so crew can view it airborne
   with no connection. The whole app (markup, styles, data and images) lives in
   index.html, so caching that one file plus the map library and fonts is enough.
   Map tiles are not cached (the world will not fit), so offline the map is blank
   but every airport, hotel and cafe card still opens. */
const CACHE = "coffee-compass-v0.4.1";
const CORE = ["./", "./index.html", "./content.json"];
const EXTERNAL = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
  "https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@500;600;700&family=Roboto:wght@400;500;700&display=swap"
];

self.addEventListener("install", function (ev) {
  ev.waitUntil((async function () {
    const c = await caches.open(CACHE);
    try { await c.addAll(CORE); } catch (e) {}
    // External assets are fetched with CORS so the cached Leaflet script keeps a
    // verifiable (non-opaque) response and its Subresource Integrity check passes offline.
    await Promise.all(EXTERNAL.map(async function (u) {
      try {
        let r = await fetch(u, { mode: "cors" });
        if (r && (r.ok || r.type === "opaque")) { await c.put(u, r.clone()); }
      } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (ev) {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // content.json: always try the network first so the auditor's latest edits show,
  // then fall back to the cached copy when offline.
  if (url.pathname.endsWith("/content.json") || url.pathname.endsWith("content.json")) {
    ev.respondWith((async function () {
      try {
        const net = await fetch(req, { cache: "no-store" });
        const c = await caches.open(CACHE); c.put("./content.json", net.clone());
        return net;
      } catch (e) {
        const cached = await caches.match("./content.json");
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }
  // Map tiles and font files: go to the network, fall back to any cache, never block.
  if (/arcgisonline|basemaps\.cartocdn|tile\.openstreetmap|fonts\.gstatic/.test(url.hostname)) {
    ev.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }
  // Everything else (the app shell, Leaflet, the fonts stylesheet): cache first.
  ev.respondWith((async function () {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === "navigate") {
        const idx = await caches.match("./index.html");
        if (idx) return idx;
      }
      throw e;
    }
  })());
});
