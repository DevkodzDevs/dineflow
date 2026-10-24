/*
 * DineFlow service worker.
 * Three strategies, chosen by what the thing is:
 *   pages      → network first, fall back to the last copy, then to /offline
 *   build files→ cache first (they are content-hashed, so they never go stale)
 *   everything else GET → stale-while-revalidate
 * Writes are never touched here; they go through the IndexedDB outbox so they survive a reload.
 */
const V = "dineflow-v18";   // v17 dropped the redirected page copies v16 kept (see keep); v18 keeps /login and answers a failed page with the reconnect page
const SHELL = ["/", "/icon-192.png", "/dashboard", "/orders", "/orders/new", "/kitchen", "/billing", "/pulse", "/rooms", "/frontdesk", "/housekeeping", "/scan", "/tomorrow", "/inventory", "/menu", "/login", "/offline"];

/* Install and activate never fail on storage. When the browser cannot open its cache (low space,
   private mode, a damaged profile — Chrome reports "Failed to execute 'open' on 'CacheStorage'") the
   precache rejected, waitUntil rejected, and the whole worker was discarded: no offline copy, no
   notification taps, nothing. Now a failed precache only means nothing is cached yet; the worker
   still installs, and pages fill the cache as they are visited. */
/* A page is kept only when it answered itself. Signed out, /dashboard and the rest redirect to /login; addAll stored
   that login page under each name, marked redirected, and Safari's engine (every browser on an iPhone) refuses a
   redirected answer from a worker for a navigation — the first network blip then showed "This site can't be reached —
   ERR_FAILED" instead of the page or /offline (2026-10-24). */
const keep = async (c, path) => { try { const r = await fetch(path, { credentials: "same-origin" }); if (r.ok && !r.redirected) await c.put(path, r); } catch { /* offline or quota */ } };
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((p) => keep(c, p)))).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => {
  try { const keys = await caches.keys(); await Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))); } catch { /* storage unavailable */ }
  try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch { /* not supported */ }
  await self.clients.claim();
})()); });

/* Only a good response is worth keeping. The previous version stored whatever came back, so a 404
   for a build file that a deploy had just replaced was cached permanently, and that URL then failed
   for good — the browser reported it as a missing chunk and the screen went blank. */
const put = async (req, res) => {
  if (!res || !res.ok || res.status === 206 || res.redirected) return res;   // errors, redirects and partials are never cached
  try { const c = await caches.open(V); await c.put(req, res.clone()); } catch { /* quota */ }
  return res;
};
/* a navigation must never be answered with a redirected response (WebKit fails the whole load): rebuild it as a plain one */
const plain = async (res) => (res && res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res);
const copy = async (req) => { const m = await caches.match(req).catch(() => undefined); return m && !m.redirected ? m : undefined; };

/* The reconnect page: whole in this file, so it shows with no line and nothing cached. It asks /api/health (free —
   no database) after 2, 3, 5, 8, 13, then every 15 s, at once when the phone says it is back online or the app comes
   to the front, and reloads the page as soon as the server answers. A page that fails again straight after
   (a real fault, not the line) stops the loop after 4 tries in 2 minutes and offers Try again / Dashboard instead. */
const reconnect = (why) => new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>DineFlow</title>
<style>
:root{--bg:#15161b;--card:#1d1f26;--ink:#f3efe7;--steel:#a8a39a;--tint:#3fbe7c;--on:#0d1a12;color-scheme:dark}
html.light{--bg:#efece5;--card:#fffdf9;--ink:#1b1c22;--steel:#57575f;--tint:#17794a;--on:#fff;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{min-height:100dvh;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}
.box{width:100%;max-width:380px;text-align:center}.mark{font-weight:800;font-size:15px;letter-spacing:.02em;color:var(--steel)}
.ring{width:56px;height:56px;margin:28px auto 22px;border-radius:50%;border:4px solid color-mix(in srgb,var(--tint) 22%,transparent);border-top-color:var(--tint);animation:s 1s linear infinite}
.box.stuck .ring{animation:none;border-color:var(--steel)}@keyframes s{to{transform:rotate(360deg)}}
h1{font-size:26px;line-height:1.2;margin:0 0 8px}p{margin:0;color:var(--steel)}#n{margin-top:14px;font-size:14px;min-height:20px}
.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px}
button,a.b{min-height:44px;min-width:44px;padding:0 22px;border-radius:999px;border:0;font:700 15px system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}
button{background:var(--tint);color:var(--on)}a.b{background:var(--card);color:var(--ink)}a.b[hidden]{display:none}
@media (prefers-reduced-motion:reduce){.ring{animation-duration:3s}}
</style></head><body><main><div class="box" id="box"><div class="mark">DineFlow</div><div class="ring"></div><h1 id="t"></h1><p id="m"></p><p id="n"></p>
<div class="row"><button id="go" type="button"></button><a class="b" id="home" href="/dashboard" hidden></a></div></div></main>
<script>
(function(){
var why=${JSON.stringify(why)};
var ck=function(k){var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));return m?decodeURIComponent(m[1]):""};
var th=ck("df-theme");if(/^(paper|bright|royal)$/.test(th)||((th===""||th==="system")&&matchMedia("(prefers-color-scheme: light)").matches))document.documentElement.className="light";
var L={en:{t:"Reconnecting…",off:"No connection. DineFlow opens again by itself the moment it is back.",down:"The server is taking a moment. DineFlow opens again by itself.",go:"Try now",wait:"Trying again in {0} s",chk:"Checking…",st:"This screen is not answering",stm:"The connection is fine, but this screen did not open.",again:"Try again",home:"Dashboard"},
ta:{t:"மீண்டும் இணைக்கிறது…",off:"இணைப்பு இல்லை. இணைப்பு வந்ததும் DineFlow தானாகத் திறக்கும்.",down:"சர்வர் சற்று நேரம் எடுக்கிறது. DineFlow தானாகத் திறக்கும்.",go:"இப்போது முயல்",wait:"{0} வி-ல் மீண்டும் முயலும்",chk:"சரிபார்க்கிறது…",st:"இந்தத் திரை பதிலளிக்கவில்லை",stm:"இணைப்பு சரி, ஆனால் இந்தத் திரை திறக்கவில்லை.",again:"மீண்டும் முயல்",home:"டாஷ்போர்டு"},
hi:{t:"फिर से जुड़ रहा है…",off:"कनेक्शन नहीं है। कनेक्शन आते ही DineFlow अपने-आप खुल जाएगा।",down:"सर्वर थोड़ा समय ले रहा है। DineFlow अपने-आप खुल जाएगा।",go:"अभी आज़माएँ",wait:"{0} सेकंड में फिर कोशिश",chk:"जाँच रहा है…",st:"यह स्क्रीन जवाब नहीं दे रही",stm:"कनेक्शन ठीक है, पर यह स्क्रीन नहीं खुली।",again:"फिर कोशिश करें",home:"डैशबोर्ड"}};
var lg=ck("df-lang");var S=L[lg]||L.en;document.documentElement.lang=L[lg]?lg:"en";
var $=function(i){return document.getElementById(i)};
$("t").textContent=S.t;$("m").textContent=why==="offline"?S.off:S.down;$("go").textContent=S.go;$("home").textContent=S.home;
var KEY="df-reconnect:"+location.pathname,tries=[];try{tries=JSON.parse(sessionStorage.getItem(KEY)||"[]").filter(function(x){return Date.now()-x<120000})}catch(e){}
var reload=function(){try{tries.push(Date.now());sessionStorage.setItem(KEY,JSON.stringify(tries))}catch(e){}location.reload()};
var stuck=function(){$("box").className="box stuck";$("t").textContent=S.st;$("m").textContent=S.stm;$("n").textContent="";$("go").textContent=S.again;var h=$("home");h.hidden=location.pathname==="/dashboard";};
if(why!=="offline"&&tries.length>=4){stuck();$("go").onclick=function(){try{sessionStorage.removeItem(KEY)}catch(e){}location.reload()};return}
var steps=[2,3,5,8,13],k=0,left=0,tick=null,busy=false;
var check=function(){if(busy)return;busy=true;clearInterval(tick);$("n").textContent=S.chk;
var ac=window.AbortController?new AbortController():null;var to=setTimeout(function(){ac&&ac.abort()},6000);
fetch("/api/health?t="+Date.now(),{cache:"no-store",signal:ac?ac.signal:undefined}).then(function(r){clearTimeout(to);if(r.ok)reload();else wait()}).catch(function(){clearTimeout(to);wait()})};
var wait=function(){busy=false;left=k<steps.length?steps[k]:15;k++;var show=function(){$("n").textContent=S.wait.replace("{0}",left)};show();
tick=setInterval(function(){left--;if(left<=0){check()}else show()},1000)};
$("go").onclick=function(){k=0;check()};
addEventListener("online",function(){k=0;check()});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){k=0;check()}});
wait();
})();
</script></body></html>`, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "5" } });

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;      // writes and third parties pass through
  if (url.pathname.startsWith("/api/")) return;                                   // never cache an answer that must be current
  /* Next.js's own page data — a tap on a link, router.refresh() (every live screen does one every
     10–60 s), a prefetch — is a GET with ?_rsc= and an RSC header. It must always come from the
     network. Served stale-while-revalidate it showed the previous answer on a live screen, and after
     a deploy it handed the page data of the old build to the new one; Next.js answers that mismatch
     with a full page reload — the app "reloading itself" every minute or so after each update. */
  if (url.searchParams.has("_rsc") || e.request.headers.get("RSC") === "1" || e.request.headers.has("Next-Router-State-Tree")) return;

  // build output is content-hashed: cache first, forever
  // /i18n/: the Tamil and Hindi dictionaries — their names carry a content hash, so a cached one is never stale
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/i18n/")) {
    e.respondWith(caches.match(e.request).catch(() => undefined).then((m) => m || fetch(e.request).then((r) => put(e.request, r)).catch(() => new Response("", { status: 504 }))));
    return;
  }
  /* pages: the network first. A page never ends on the browser's own error ("This site can't be reached", a blank
     502 from the host, a load that spins forever — the owner, 2026-10-24: "never show that error or loading issue"):
       no line at all          → the last copy of this page, else the reconnect page
       the host's 502/503/504  → the reconnect page (a copy would hide that the server is back in a moment)
       no answer in 25 s       → the reconnect page
     The reconnect page retries by itself and opens the page the moment the server answers. */
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      let timer;
      const late = new Promise((r) => { timer = setTimeout(() => r("late"), 25000); });
      const net = (async () => { const pre = await e.preloadResponse; return pre || fetch(e.request); })();
      try {
        const r = await Promise.race([net, late]);
        if (r === "late") return reconnect("slow");
        if (r.status === 502 || r.status === 503 || r.status === 504) return reconnect("down");
        return plain(await put(e.request, r));
      } catch { return (await copy(e.request)) || reconnect("offline"); }
      finally { clearTimeout(timer); }
    })());
    return;
  }
  // everything else: show the copy now, refresh it behind the scenes
  e.respondWith((async () => {
    const cached = await caches.match(e.request).catch(() => undefined);
    const network = fetch(e.request).then((r) => put(e.request, r)).catch(() => null);
    return cached || (await network) || new Response("", { status: 504 });
  })());
});

// the app asks for a flush when the browser wakes the worker with a connection
self.addEventListener("sync", (e) => { if (e.tag === "dineflow-outbox") e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "flush" })))); });
// a tap on a DineFlow notification brings the app forward on the screen it is about
self.addEventListener("notificationclick", (e) => { e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "/dashboard"; e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => { const c = cs.find((x) => "focus" in x); if (c) { c.focus(); return c.navigate ? c.navigate(url) : undefined; } return self.clients.openWindow(url); })); });
