/**
 * What a stranger's phone sees at your address.
 *
 *   node scripts/check-live.mjs https://app.dineflow.in
 *
 * Opening your own site proves very little: your browser is signed in to Vercel, so a deployment
 * nobody else can reach looks perfectly healthy to you. This asks the questions from outside, with
 * no cookies and no account — the same request a waiter's phone makes — and answers the only one
 * that matters: can they install it, and does it open on DineFlow's sign-in rather than Vercel's?
 *
 * It changes nothing. Run it as often as you like.
 */
const raw = (process.argv[2] ?? "").trim().replace(/\/+$/, "");
if (!/^https?:\/\/[^\s/]+/.test(raw)) {
  console.error("Give the address people will actually use, for example:\n  node scripts/check-live.mjs https://app.dineflow.in");
  process.exit(2);
}
const base = raw;
const host = new URL(base).host;

const ok = (s) => `\x1b[32m✔\x1b[0m ${s}`;
const no = (s) => `\x1b[31m✖\x1b[0m ${s}`;
const meh = (s) => `\x1b[33m·\x1b[0m ${s}`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/** No cookies, no redirects followed — exactly what an unknown phone gets. */
async function raw_get(path, accept = "*/*") {
  try {
    const r = await fetch(base + path, { redirect: "manual", cache: "no-store", headers: { accept, "user-agent": "DineFlow-check/1 (a stranger's phone)" } });
    const body = r.status < 400 || r.headers.get("content-type")?.includes("json") || r.headers.get("content-type")?.includes("text")
      ? await r.text().catch(() => "") : "";
    return { status: r.status, location: r.headers.get("location"), type: r.headers.get("content-type") ?? "", body, headers: r.headers };
  } catch (e) {
    return { error: e.cause?.code ?? e.message };
  }
}

/** Vercel's protection announces itself clearly enough once you know what to look for. */
const isVercelWall = (r) =>
  !!r && !r.error && (
    (r.status === 401 && /vercel/i.test(r.body + (r.headers?.get("server") ?? ""))) ||
    /\/sso-api\?url=|_vercel_sso_nonce|Authentication Required/i.test(r.body ?? "") ||
    /vercel\.com\/sso|vercel\.com\/login/i.test(r.location ?? "")
  );

console.log(`\nChecking ${host} the way somebody who has never heard of your Vercel account would.\n`);
let fatal = 0, warn = 0;

/* ── 1. is it even reachable, and is it locked? ─────────────────────────────────────────── */
const health = await raw_get("/api/health");
if (health.error) {
  console.log(no(`Nothing answered at ${host} — ${health.error}`));
  console.log(dim("   Check the address, or that the deployment finished."));
  process.exit(1);
}
if (isVercelWall(health)) {
  console.log(no("Vercel's Deployment Protection is in front of this address."));
  console.log(dim("   Your own browser gets through because it is signed in to Vercel. Nobody else does:"));
  console.log(dim("   a waiter's phone is shown a Vercel sign-in screen instead of DineFlow — and if the"));
  console.log(dim("   app was installed from here, that screen is what it opens to, every time.\n"));
  console.log("   Turn it off:  Vercel → your project → Settings → Deployment Protection");
  console.log("                 → Vercel Authentication → Disabled  (Production)");
  console.log(dim("\n   Then run this again. Everything below is untestable until it passes.\n"));
  process.exit(1);
}
if (health.status !== 200 || health.body.trim() !== "ok") {
  console.log(no(`/api/health answered ${health.status}, not a plain "ok" — something else is in front of the app.`));
  fatal++;
} else {
  console.log(ok("Anybody can reach it — no Vercel wall, no password page."));
}

/* ── 2. https, or phones will refuse to install ─────────────────────────────────────────── */
const local = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(host);
if (base.startsWith("https://")) console.log(ok("Served over HTTPS."));
else if (local) console.log(meh(`Plain http, but ${host} is a local address — browsers make an exception, so this is fine for testing.`) ), warn++;
else { console.log(no("Plain http on a public address. No phone will install it, and sign-in cookies will not stick.")); fatal++; }

/* ── 3. does it open on DineFlow's sign-in? ─────────────────────────────────────────────── */
const root = await raw_get("/", "text/html");
const login = await raw_get("/login", "text/html");
const rootGoesToLogin = root.status >= 300 && root.status < 400 && /\/login/.test(root.location ?? "");
if (login.status === 200 && /sign in|password|log in/i.test(login.body)) {
  console.log(ok(`The sign-in page loads${rootGoesToLogin ? ", and the front door sends people to it" : ""}.`));
} else if (isVercelWall(login)) { console.log(no("The sign-in page is behind the Vercel wall.")); fatal++; }
else { console.log(no(`/login answered ${login.status} — a new person has nowhere to sign in.`)); fatal++; }

/* ── 4. can it be installed? ─────────────────────────────────────────────────────────────── */
const man = await raw_get("/manifest.json", "application/manifest+json");
let manifest = null;
try { manifest = JSON.parse(man.body); } catch { /* not json */ }
if (!manifest) { console.log(no(`/manifest.json did not come back as JSON (${man.status}) — nothing will offer to install.`)); fatal++; }
else {
  console.log(ok(`Installable as “${manifest.name}” — opens at ${manifest.start_url}, ${manifest.display}.`));
  const icons = manifest.icons ?? [];
  const missing = [];
  for (const i of icons) {
    const r = await raw_get(i.src.startsWith("/") ? i.src : "/" + i.src);
    if (r.error || r.status !== 200) missing.push(`${i.src} (${r.error ?? r.status})`);
  }
  if (missing.length) { console.log(no(`Icons that will not load: ${missing.join(", ")}`)); fatal++; }
  else console.log(ok(`All ${icons.length} icons load.`));
  if (!/^\//.test(manifest.start_url ?? "")) { console.log(meh(`start_url is “${manifest.start_url}” — an absolute path is safer.`)); warn++; }
}

/* ── 5. the offline layer ────────────────────────────────────────────────────────────────── */
const sw = await raw_get("/sw.js", "application/javascript");
if (sw.status === 200 && /javascript|text/i.test(sw.type)) console.log(ok("The service worker is served, so it keeps working when the line drops."));
else { console.log(meh(`No service worker at /sw.js (${sw.error ?? sw.status}) — it will install, but not work offline.`)); warn++; }

/* ── 6. the page you hand people ─────────────────────────────────────────────────────────── */
const get = await raw_get("/get", "text/html");
if (get.status === 200) console.log(ok(`The install page is public — hand out ${base}/get`));
else { console.log(no(`/get answered ${get.status} — the address you give people does not open.`)); fatal++; }

/* ── verdict ─────────────────────────────────────────────────────────────────────────────── */
console.log("");
if (fatal === 0 && warn === 0) console.log(`\x1b[32mA stranger's phone can install this and lands on your sign-in screen.\x1b[0m\n`);
else if (fatal === 0) console.log(`\x1b[33mInstallable, with ${warn} thing${warn === 1 ? "" : "s"} worth tidying.\x1b[0m\n`);
else console.log(`\x1b[31m${fatal} thing${fatal === 1 ? "" : "s"} would stop somebody installing or signing in.\x1b[0m\n`);
process.exit(fatal ? 1 : 0);
