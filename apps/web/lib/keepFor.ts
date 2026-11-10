/**
 * Keep an answer that is the same for every visitor for a few seconds (2026-11-10, the speed check). The public menu
 * page asked the database for the whole menu on every visit; a link passed round a WhatsApp group is a hundred visits
 * in a minute for one answer. This keeps it in the server's memory with a HARD age limit: nothing older than `ms` is
 * ever served, visits that arrive together share one read, and an answer that should not be kept (a failed read, a
 * place that is not there) is dropped the moment it is known.
 *
 * Not `unstable_cache`: on a dynamic page it hands out the old answer first and refreshes behind it, so the first
 * visitor after a quiet day would read yesterday's menu — or a place that was unlisted since.
 * Only for answers with nothing of the visitor in them. Each server instance keeps its own; at most `max` keys.
 */
export function keepFor<T>(ms: number, max = 200, now: () => number = Date.now) {
  const kept = new Map<string, { at: number; v: Promise<T> }>();
  return (key: string, read: () => Promise<T>, keepable: (v: T) => boolean = () => true): Promise<T> => {
    const t = now(); const hit = kept.get(key);
    if (hit && t - hit.at < ms) return hit.v;
    const v = read();
    const drop = () => { if (kept.get(key)?.v === v) kept.delete(key); };
    kept.delete(key); kept.set(key, { at: t, v });
    if (kept.size > max) kept.delete(kept.keys().next().value as string);   // the oldest key goes
    v.then((x) => { if (!keepable(x)) drop(); }, drop);
    return v;
  };
}
