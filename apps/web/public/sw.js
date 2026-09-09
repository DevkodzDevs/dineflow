/*
 * DineFlow service worker.
 * Three strategies, chosen by what the thing is:
 *   pages      → network first, fall back to the last copy, then to /offline
 *   build files→ cache first (they are content-hashed, so they never go stale)
 *   everything else GET → stale-while-revalidate
 * Writes are never touched here; they go through the IndexedDB outbox so they survive a reload.
 */
const V = "dineflow-v13";
const SHELL = ["/", "/dashboard", "/orders", "/orders/new", "/kitchen", "/billing", "/pulse", "/rooms", "/frontdesk", "/housekeeping", "/scan", "/tomorrow", "/inventory", "/menu", "/offline"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))); if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); await self.clients.claim(); })()); });

const put = async (req, res) => { try { const c = await caches.open(V); await c.put(req, res.clone()); } catch { /* quota */ } return res; };

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;      // writes and third parties pass through
  if (url.pathname.startsWith("/api/")) return;                                   // never cache an answer that must be current

  // build output is content-hashed: cache first, forever
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/")) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => put(e.request, r))));
    return;
  }
  // pages: try the network, fall back to what we had, then to the offline page
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      try { const pre = await e.preloadResponse; if (pre) return put(e.request, pre); const r = await fetch(e.request); return put(e.request, r); }
      catch { return (await caches.match(e.request)) || (await caches.match("/offline")) || new Response("Offline", { status: 503 }); }
    })());
    return;
  }
  // everything else: show the copy now, refresh it behind the scenes
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const network = fetch(e.request).then((r) => put(e.request, r)).catch(() => null);
    return cached || (await network) || new Response("", { status: 504 });
  })());
});

// the app asks for a flush when the browser wakes the worker with a connection
self.addEventListener("sync", (e) => { if (e.tag === "dineflow-outbox") e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "flush" })))); });
