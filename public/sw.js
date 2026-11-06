// EasyHouseHunt service worker: makes the app installable and fast on repeat visits.
// - Hashed build assets (/assets/*): cache-first (they never change).
// - Page loads: network-first, falling back to the cached app shell when offline.
// - Everything else (API, Supabase, map tiles, other origins): untouched.
const VERSION = "ehh-v1";
const SHELL = ["/", "/site.webmanifest", "/favicon.svg", "/android-chrome-192x192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/l/") || url.pathname.startsWith("/rent") ||
      url.pathname.startsWith("/s/") || url.pathname === "/sitemap.xml") return;

  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && url.pathname === "/") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); }
        return res;
      }).catch(() => caches.match("/").then((hit) => hit || Response.error())),
    );
  }
});
