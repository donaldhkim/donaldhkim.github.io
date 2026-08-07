/* Marginalia service worker — caches the app shell + pdf.js so the app
   loads with no network connection after the first visit. */
const CACHE = "marginalia-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
];
// EPUB reader libs — nice to have offline, but never block install on them
const OPTIONAL = [
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"
];
const CDN_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS).then(() =>
        Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => {})))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // The page itself is NETWORK-FIRST: a reload must always be able to pick up
  // a new deploy. Cache-first here means a stale app can never update itself.
  const isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((r) => r || caches.match("./"))
        )
    );
    return;
  }

  // Everything else (libraries, icons) stays cache-first for speed + offline.
  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const cacheable =
            res.ok &&
            (req.url.startsWith(self.location.origin) ||
             CDN_HOSTS.some((h) => req.url.indexOf(h) !== -1));
          if (cacheable) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
    })
  );
});
