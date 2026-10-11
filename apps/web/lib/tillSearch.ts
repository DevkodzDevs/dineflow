/**
 * How well a dish name answers what a waiter typed, for the till's search. 0 means no match.
 *
 * A waiter types the way they say it: the start of the name ("chick"), the start of any word ("biry"),
 * the first letters of the words ("cb" for Chicken Biryani, "pbm" for Paneer Butter Masala — the short
 * codes counter staff learn on every Indian POS), or a piece from the middle ("65"). Higher is a better
 * match, so the first result is the one Enter adds.
 */
export function dishMatch(name: string, typed: string): number {
  const q = typed.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return 0;
  const n = name.toLowerCase();
  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (n === q) return 100;
  if (n.startsWith(q)) return 90 - Math.min(20, n.length - q.length) / 10;
  // every typed word starts some word of the name, in order: "chi bir" → Chicken Biryani
  const parts = q.split(" ");
  if (parts.length > 1) {
    let at = 0;
    const ok = parts.every((p) => { const i = words.findIndex((w, k) => k >= at && w.startsWith(p)); if (i < 0) return false; at = i + 1; return true; });
    if (ok) return 80;
  }
  if (words.some((w) => w.startsWith(q))) return 70;
  // initials: "cb" → Chicken Biryani, "pbm" → Paneer Butter Masala (2+ letters, all letters)
  if (/^[a-z]{2,}$/.test(q)) {
    const initials = words.map((w) => w[0]).join("");
    if (initials === q) return 75;
    if (initials.startsWith(q)) return 60;
  }
  if (n.includes(q)) return 40;
  return 0;
}
