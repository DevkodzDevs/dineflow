export { formatINR } from "@dineflow/shared";
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
export const minsSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
/**
 * How long ago, the way a cook would say it. Raw minutes are right for a ticket that is minutes old
 * and meaningless for one that is not: a ticket left open over a weekend read "5656 min", a number
 * nobody can turn into a length of time without doing arithmetic. Past an hour this counts in hours,
 * past a day in days.
 */
export const fmtSince = (iso: string) => {
  const m = minsSince(iso);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
};
/** The same age split for a flip tile, which has room for a couple of characters and a caption. */
export const fmtAge = (iso: string): { value: string; label: string } => {
  const m = minsSince(iso);
  if (m < 60) return { value: String(m), label: "min" };
  const h = Math.floor(m / 60);
  return h < 24 ? { value: `${h}h`, label: "ago" } : { value: `${Math.floor(h / 24)}d`, label: "ago" };
};
export const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
export const n = (v: unknown) => Number(v ?? 0);
/** A pantry quantity the way a cook reads it: 0.15 kg is "150 g", 0.02 l is "20 ml", 2 pcs is "2 pcs". */
export const fmtQty = (q: number, unit: string) => {
  const v = Number(q) || 0;
  if (unit === "kg" && Math.abs(v) < 1) return `${Math.round(v * 1000)} g`;
  if (unit === "l" && Math.abs(v) < 1) return `${Math.round(v * 1000)} ml`;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  return `${s} ${unit}`;
};

export const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : 0);
