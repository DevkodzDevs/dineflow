/*
 * DineFlow service worker.
 * Three strategies, chosen by what the thing is:
 *   pages      → network first, fall back to the last copy, then to /offline
 *   build files→ cache first (they are content-hashed, so they never go stale)
 *   everything else GET → stale-while-revalidate
 * Writes are never touched here; they go through the IndexedDB outbox so they survive a reload.
 */
const V = "dineflow-v20";   // v17 dropped redirected copies; v18 kept /login and the reconnect page; v19 adds the launch loader (boot); v20 serves a kept page only with its build (whole) and drops every older copy
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
  /* navigation preload off (v19): the launch loader holds a page's answer past its own event, and Safari's engine cancels
     a preload the moment the event is answered with something else — the held answer never landed and the loader
     spun. A plain fetch belongs to the worker and finishes. Preload saved only the worker's own wake-up. */
  try { if (self.registration.navigationPreload) await self.registration.navigationPreload.disable(); } catch { /* not supported */ }
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
/* A kept page is only as good as its build (v20, 2026-10-30 — the owner's iPhone showed Next's bare "Application error").
   Its scripts are named by the build that drew it; a deploy since then removes them from the server. A copy whose build
   files are not all in this cache would load scripts that answer 404 — no error boundary of the app's can run then. So the
   copy is served (no line at all) only when every /_next/static/ script and stylesheet it names is kept here too — then
   it runs offline whole; else the reconnect page, which opens the live page the moment the server answers. */
const whole = async (res) => {
  try {
    const files = [...new Set((await res.clone().text()).match(/\/_next\/static\/[^"'\s<>()\\]+\.(?:js|css)/g) || [])];
    for (const f of files) if (!(await caches.match(f, { ignoreSearch: true }))) return false;   // a ?dpl= tail does not matter
    return true;
  } catch { return false; }
};

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

/* ── The launch loader (2026-10-24, the owner: "after the app is minimised it opens to a black screen — show the logo
   with a loading animation instead; never a black or blank screen, never a delay feeling"). A page the network has
   not answered in 0.9 s — a phone waking the app after the system closed it, a server waking from idle — is answered at
   once with this screen, whole in this file (nothing to fetch but the cached logo). The network keeps going: its answer
   is held here (`waiting`), the screen asks /__df/ready when it lands, and reloads into it — the held answer is served
   straight away, so nothing is fetched twice. A failure or a slow minute falls back to the copy / reconnect page as
   before. Brand emerald, never black; endless motion only on transform and opacity. */
const waiting = new Map();   // page URL → { p: Promise<Response>, at }
const BOOT_AFTER = 900;
const boot = () => new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b4a35"><meta name="robots" content="noindex"><title>DineFlow</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#0b4a35;color:#f2fbf6;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.sky{position:fixed;inset:0;background:linear-gradient(165deg,#13805a 0%,#0b4a35 48%,#052a1e 100%)}
.blob{position:fixed;width:80vmax;height:80vmax;border-radius:50%;opacity:.5;will-change:transform}
.b1{left:-30vmax;top:-34vmax;background:radial-gradient(closest-side,rgba(64,238,170,.55),rgba(64,238,170,0));animation:drift1 9s ease-in-out infinite alternate}
.b2{right:-34vmax;bottom:-36vmax;background:radial-gradient(closest-side,rgba(56,189,248,.42),rgba(56,189,248,0));animation:drift2 11s ease-in-out infinite alternate}
.b3{left:20vmax;bottom:-50vmax;width:60vmax;height:60vmax;background:radial-gradient(closest-side,rgba(250,204,21,.2),rgba(250,204,21,0));animation:drift1 13s ease-in-out infinite alternate-reverse}
main{position:relative;height:100%;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom))}
.c{display:flex;flex-direction:column;align-items:center;text-align:center}
.stage{position:relative;width:184px;height:184px;display:grid;place-items:center}
.spin{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(255,255,255,0) 0deg,rgba(64,238,170,.0) 40deg,#40eeaa 200deg,#d9fff0 300deg,rgba(255,255,255,0) 360deg);-webkit-mask:radial-gradient(closest-side,transparent 84%,#000 86%,#000 97%,transparent 99%);mask:radial-gradient(closest-side,transparent 84%,#000 86%,#000 97%,transparent 99%);animation:spin 1.15s linear infinite}
.spin2{position:absolute;inset:16px;border-radius:50%;border:1.5px dashed rgba(217,255,240,.35);animation:spin 6s linear infinite reverse}
.orbit{position:absolute;inset:-10px;animation:spin 2.6s cubic-bezier(.45,.05,.55,.95) infinite}
.orbit i{position:absolute;left:50%;top:0;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#d9fff0;box-shadow:0 0 14px 3px rgba(64,238,170,.8)}
.orbit i:nth-child(2){top:auto;bottom:0;width:6px;height:6px;margin-left:-3px;background:#7dd3fc;box-shadow:0 0 12px 2px rgba(56,189,248,.8)}
.glow{position:absolute;width:150px;height:150px;border-radius:50%;background:radial-gradient(closest-side,rgba(64,238,170,.45),rgba(64,238,170,0));animation:pulse 1.8s ease-in-out infinite}
.logo{position:relative;width:104px;height:104px;border-radius:28px;background:url(/icon-192.png) center/cover no-repeat;box-shadow:0 22px 50px -14px rgba(0,0,0,.55);animation:pop .8s cubic-bezier(.16,1,.3,1) both,float 3.2s ease-in-out .8s infinite}
.word{margin-top:26px;font-size:30px;font-weight:800;letter-spacing:.02em;animation:rise .7s cubic-bezier(.16,1,.3,1) .15s both}
.word b{font-weight:800;background:linear-gradient(90deg,#fff,#a7f3d0,#fff);-webkit-background-clip:text;background-clip:text;color:transparent}
.bar{position:relative;width:180px;height:5px;margin-top:20px;border-radius:999px;background:rgba(255,255,255,.16);overflow:hidden;animation:rise .7s cubic-bezier(.16,1,.3,1) .25s both}
.bar i{position:absolute;inset:0;width:45%;border-radius:999px;background:linear-gradient(90deg,rgba(64,238,170,0),#40eeaa,#e6fff5);animation:sweep 1.25s cubic-bezier(.45,.05,.55,.95) infinite}
.say{margin-top:14px;min-height:22px;font-size:14.5px;font-weight:600;color:rgba(230,255,244,.85);transition:opacity .35s ease,transform .35s ease}
.say.out{opacity:0;transform:translateY(6px)}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(.88);opacity:.55}50%{transform:scale(1.12);opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes rise{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes sweep{from{transform:translateX(-110%)}to{transform:translateX(230%)}}
@keyframes drift1{from{transform:translate(0,0) scale(1)}to{transform:translate(8vmax,6vmax) scale(1.15)}}
@keyframes drift2{from{transform:translate(0,0) scale(1.1)}to{transform:translate(-7vmax,-5vmax) scale(.95)}}
@media (prefers-reduced-motion:reduce){.blob,.spin2,.orbit,.glow,.logo{animation:none}.spin{animation-duration:2.4s}.bar i{animation-duration:2.4s}}
</style></head><body><div class="sky"></div><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
<main><div class="c" role="status" aria-live="polite"><div class="stage"><div class="glow"></div><div class="spin"></div><div class="spin2"></div><div class="orbit"><i></i><i></i></div><div class="logo" aria-hidden="true"></div></div>
<div class="word"><b>DineFlow</b></div><div class="bar" aria-hidden="true"><i></i></div><div class="say" id="say"></div></div></main>
<script>
(function(){
var ck=function(k){var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));return m?decodeURIComponent(m[1]):""};
var L={en:["Waking up DineFlow…","Syncing your day…","Bringing in the latest…","Almost ready…","Taking a little longer — hang on…"],
ta:["DineFlow தயாராகிறது…","இன்றைய தகவல்கள் ஒத்திசைகிறது…","சமீபத்தியவை வருகின்றன…","கிட்டத்தட்ட தயார்…","சற்று நேரம் ஆகிறது — காத்திருங்கள்…"],
hi:["DineFlow तैयार हो रहा है…","आपका दिन सिंक हो रहा है…","ताज़ा जानकारी आ रही है…","बस तैयार…","थोड़ा समय लग रहा है — रुकिए…"]};
var lg=ck("df-lang"),S=L[lg]||L.en;document.documentElement.lang=L[lg]?lg:"en";
var say=document.getElementById("say"),i=0;say.textContent=S[0];
var turn=setInterval(function(){i=Math.min(i+1,S.length-1);say.className="say out";setTimeout(function(){say.textContent=S[i];say.className="say"},350);if(i>=S.length-1)clearInterval(turn)},2200);
try{sessionStorage.setItem("df-splash","1")}catch(e){}
var go=function(){location.replace(location.href)};
var waits=0,ask=function(){fetch("/__df/ready?u="+encodeURIComponent(location.href),{cache:"no-store"}).then(function(r){return r.text()}).then(function(t){if(t==="wait"&&++waits<2)ask();else go()}).catch(function(){setTimeout(go,1500)})};
ask();
setTimeout(go,60000);
})();
</script></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

/* /__df/ready?u=<page>: the loader asks whether the held answer has landed — "ok", "fail", "wait" (still going after 20 s;
   it asks again) or "gone" (nothing held: reload and fetch as usual) */
const ready = async (u) => {
  const h = u && waiting.get(u);
  const say = (t) => new Response(t, { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  if (!h) return say("gone");
  return say(await Promise.race([h.p.then(() => "ok", () => "fail"), new Promise((ok) => setTimeout(() => ok("wait"), 20000))]));
};
/* the loader is for pages, not a file someone is downloading */
const bootable = (url) => !/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !url.pathname.startsWith("/get/") && !url.pathname.startsWith("/__df");
/* a page's answer as the browser gets it: the host's 502/503/504 become the reconnect page */
const finish = async (req, r) => (r.status === 502 || r.status === 503 || r.status === 504 ? reconnect("down") : plain(await put(req, r)));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;      // writes and third parties pass through
  if (url.pathname === "/__df/ready") { e.respondWith(ready(url.searchParams.get("u"))); return; }
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
       no line at all          → the last copy of this page if its build files are kept too (whole), else the reconnect page
       the host's 502/503/504  → the reconnect page (a copy would hide that the server is back in a moment)
       no answer in 25 s       → the reconnect page
     The reconnect page retries by itself and opens the page the moment the server answers. */
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      /* the loader's reload: take the answer held for this page (once) instead of asking the server again */
      const key = e.request.url, held = waiting.get(key);
      if (held) waiting.delete(key);
      /* nothing in 40 s: the server is not waking — the reconnect page takes over (it keeps asking, and opens the page) */
      if (held && !held.done && Date.now() - held.at > 40000) return reconnect("slow");
      const net = held && Date.now() - held.at < 90000 ? held.p : fetch(e.request);
      let timer, bootT;
      const late = new Promise((r) => { timer = setTimeout(() => r("late"), 25000); });
      const early = bootable(url) ? new Promise((r) => { bootT = setTimeout(() => r("boot"), BOOT_AFTER); }) : null;
      try {
        const r = await Promise.race(early ? [net, late, early] : [net, late]);
        if (r === "boot") {
          const h = held && held.p === net ? held : { p: net, at: Date.now(), done: false };   // a re-held answer keeps its first time
          if (h !== held) net.then(() => { h.done = true; }, () => { h.done = true; });
          waiting.set(key, h);
          e.waitUntil(net.catch(() => {}).then(() => new Promise((ok) => setTimeout(ok, 30000))));   // keep the held answer alive for the reload
          return boot();
        }
        if (r === "late") return reconnect("slow");
        return finish(e.request, r);
      } catch { const c = await copy(e.request); return c && (await whole(c)) ? c : reconnect("offline"); }
      finally { clearTimeout(timer); clearTimeout(bootT); }
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
