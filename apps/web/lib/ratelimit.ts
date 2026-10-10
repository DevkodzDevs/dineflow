import "server-only";

/**
 * A small sliding-window limit, kept in this server instance's memory.
 *
 * It is a speed bump, not a quota: on Vercel each instance counts on its own and forgets on a cold
 * start, so a determined caller spread across instances gets a few times the limit. That is still
 * the difference between "a script hammering Claude all night on our key" and a bounded cost. A hard
 * quota needs a shared store (a table, or Redis) — note it if usage ever warrants one.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now); hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
