/**
 * A client's own web address (0185 `websites.domain`; ninth pass): www.anjappar.com shows that client's website.
 *
 * The domain is pointed at this app (the owner of DineFlow adds it to the Vercel project; the client sets a CNAME), so
 * a request for it arrives here like any other — only the Host says whose it is. middleware.ts asks `siteForHost`,
 * and where it answers a slug, `domainRewrite` says which page to serve. Only the front door is rewritten: every other
 * path (/dine/<slug>, /book/<slug>, the page's own files) is this app's as usual, so ordering and booking keep working
 * on the client's address without a second copy of anything.
 *
 * Kept apart from the middleware so the two decisions can be tested without a request (lib/siteDomain.test.ts).
 */
const OURS = /(^|\.)(dineflow\.cloud|dineflow\.in|vercel\.app|localhost)$/;

/** A bare host: lower case, no port. Anything that is not a plain host name is "". */
export const bareHost = (h: string | null | undefined): string => { const x = (h ?? "").trim().toLowerCase().replace(/:\d+$/, ""); return /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(x) ? x : ""; };

/** Is this one of the app's own addresses (so there is nothing to look up)? An IP address and the configured public address count. */
export function isOwnHost(host: string, cloudUrl: string | undefined = process.env.NEXT_PUBLIC_CLOUD_URL): boolean {
  const h = bareHost(host);
  if (!h || OURS.test(h) || /^[\d.]+$/.test(h) || !h.includes(".")) return true;
  try { if (cloudUrl && new URL(cloudUrl).hostname.toLowerCase() === h) return true; } catch { /* a malformed setting is not a reason to look every host up */ }
  return false;
}

/** On a client's domain, which path of this app answers `path`? null = serve the path as it is. */
export function domainRewrite(path: string, slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return null;
  if (path === "/" || path === "") return `/site/${slug}`;
  if (path === "/sitemap.xml" || path === "/robots.txt") return null;
  return null;
}

/* ── the lookup, kept for a minute per host on a server ── */
const kept = new Map<string, { slug: string | null; at: number }>();
const KEEP = 60_000, MOST = 500;

/** The slug of the website that answers on this host, or null. Never throws: a lookup that fails is "not a client's domain". */
export async function siteForHost(host: string, now: number = Date.now()): Promise<string | null> {
  const h = bareHost(host); if (!h || isOwnHost(h)) return null;
  const hit = kept.get(h); if (hit && now - hit.at < KEEP) return hit.slug;
  let slug: string | null = null;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const r = await fetch(`${url}/rest/v1/rpc/website_by_domain`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ p_host: h }), signal: AbortSignal.timeout(2500), cache: "no-store" });
      if (r.ok) { const v: unknown = await r.json(); if (typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v)) slug = v; }
    }
  } catch { /* the database did not answer in time: serve the app as usual */ }
  if (kept.size >= MOST) kept.clear();          // a flood of made-up hosts must not grow this without end
  kept.set(h, { slug, at: now });
  return slug;
}
