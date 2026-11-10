/**
 * Seating a party across tables (0180). A party of 8 at a place of 4-seaters is not "no table fits": it is two tables
 * joined. The database picks the same way (`_walkin_pick`); this is the screen's copy, for the Seat-now line and the
 * picker before the write comes back. Kept pure so it can be tested.
 *
 * Rules, in order: the smallest single table that seats them; else the pair in one zone whose seats together are the
 * fewest that fit (ties: nearest in the floor order, then by name); else a triple in one zone the same way. Never more
 * than three — a party past that is the host's call.
 */
export type SeatTable = { id: string; name: string; capacity: number; zone?: string | null; sort_order?: number | null };

const byFloor = (a: SeatTable, b: SeatTable) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
const spread = (ts: SeatTable[]) => Math.max(...ts.map((t) => t.sort_order ?? 0)) - Math.min(...ts.map((t) => t.sort_order ?? 0));

/** The tables to seat `party` from the free ones given, or an empty list when nothing fits in three. */
export function pickTables(free: SeatTable[], party: number): SeatTable[] {
  if (party < 1 || !free.length) return [];
  const single = free.filter((t) => t.capacity >= party).sort((a, b) => a.capacity - b.capacity || byFloor(a, b))[0];
  if (single) return [single];
  let best: SeatTable[] = []; let bestSeats = Infinity, bestSpread = Infinity;
  const consider = (ts: SeatTable[]) => {
    const seats = ts.reduce((n, t) => n + t.capacity, 0); if (seats < party) return;
    const sp = spread(ts);
    if (seats < bestSeats || (seats === bestSeats && sp < bestSpread)) { best = [...ts].sort(byFloor); bestSeats = seats; bestSpread = sp; }
  };
  const zones = new Map<string, SeatTable[]>();
  for (const t of free) { const z = t.zone ?? ""; zones.set(z, [...(zones.get(z) ?? []), t]); }
  for (const ts of zones.values()) for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) consider([ts[i], ts[j]]);
  if (best.length) return best;
  for (const ts of zones.values()) for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) for (let k = j + 1; k < ts.length; k++) consider([ts[i], ts[j], ts[k]]);
  return best;
}

/** "T4", "T4 + T5", "T4 + T5 + T6" — how joined tables are named everywhere (the same join the database uses). */
export const tablesLabel = (names: string[]) => names.join(" + ");

/** Seats across the tables given. */
export const seatsOf = (ts: SeatTable[]) => ts.reduce((n, t) => n + t.capacity, 0);
