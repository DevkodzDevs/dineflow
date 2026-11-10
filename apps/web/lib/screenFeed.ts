/**
 * How a TV reads its feed (2026-11-10, the speed check). A screen left on asked this app's server every few seconds,
 * all day and all night: a door TV at 4 s is ~648,000 function calls a month and a counter TV at 8 s ~324,000 — three
 * restaurants' TVs would have used a whole plan's allowance for showing an empty list. Now:
 *
 *   • the browser asks the database's own API (`/rest/v1/rpc/screen_feed` | `screen_queue`, the anon key every guest
 *     page already carries; both functions are granted to anon and answer only for the right key) — no function of
 *     ours runs. A plain fetch, not the Supabase client: a TV has no use for 235 kB of auth and realtime;
 *   • the app's own GET route (`/api/screen/[key]`, `…/queue`) stays as the fallback — when the direct call fails it is
 *     used instead, and the direct call is left alone for five minutes so a blocked address is not tried twice a turn;
 *   • with nothing on the board (no token, nobody waiting or called) it asks every 15 s instead of every 4 or 8.
 */
export type FeedFn = "screen_feed" | "screen_queue";
/** `gone`: the key is wrong or rotated, or the place is closed — the screen says so. Otherwise it could not be reached. */
export type FeedAnswer<T> = { ok: true; feed: T } | { ok: false; gone: boolean };

export const IDLE_MS = 15000;                 // nothing on the board: a new number shows within this
export const DIRECT_REST_MS = 5 * 60 * 1000;  // after a failed direct call, the route answers for this long
export const RELOAD_MS = 12 * 3600e3;         // a TV left on reloads itself for the new build
const KEY_RE = /^[0-9a-f]{16,64}$/;

/** How long until the next ask: the screen's own pace while something is on it, 15 s while it is empty or unreachable. */
export const paceFor = (busy: boolean, fast: number) => (busy ? fast : Math.max(fast, IDLE_MS));

export type FeedEnv = { url?: string; key?: string; fetch: typeof fetch; now: () => number; state: { directOffUntil: number } };
const shared = { directOffUntil: 0 };
const env0 = (): FeedEnv => ({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, fetch: (...a) => fetch(...a), now: Date.now, state: shared });

/** The app's own route — the fallback, and the check that this app's server answers before a TV reloads itself. */
export async function viaRoute<T>(route: string, env: FeedEnv = env0()): Promise<FeedAnswer<T>> {
  try {
    const res = await env.fetch(route, { cache: "no-store" });
    if (!res.ok) return { ok: false, gone: res.status === 404 };
    const f = (await res.json()) as T | null;
    return f ? { ok: true, feed: f } : { ok: false, gone: true };
  } catch { return { ok: false, gone: false }; }
}

/** One read of a TV's feed: the database's API first, the app's route when that cannot be reached. */
export async function readFeed<T>(fn: FeedFn, k: string, route: string, env: FeedEnv = env0()): Promise<FeedAnswer<T>> {
  if (!KEY_RE.test(k)) return { ok: false, gone: true };
  if (env.url && env.key && env.now() >= env.state.directOffUntil) {
    try {
      const res = await env.fetch(`${env.url.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
        method: "POST", cache: "no-store",
        headers: { apikey: env.key, authorization: `Bearer ${env.key}`, "content-type": "application/json" },
        body: JSON.stringify({ p_key: k }),
      });
      if (res.ok) { const f = (await res.json()) as T | null; return f ? { ok: true, feed: f } : { ok: false, gone: true }; }
    } catch { /* the route below */ }
    env.state.directOffUntil = env.now() + DIRECT_REST_MS;
  }
  return viaRoute<T>(route, env);
}
