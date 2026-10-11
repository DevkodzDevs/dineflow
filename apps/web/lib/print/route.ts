import type { KotData } from "./escpos";

/**
 * Which printer gets which lines of a kitchen ticket.
 *
 * A printer with no station prints the whole ticket. A printer bound to a station prints only the lines
 * that station makes — a line's own station, else the ticket's — and gets nothing when none are its own.
 * Until 0087 no screen passed a station at all, so a station printer never received a ticket: the
 * grill's printer sat silent while the counter's printed everything. Pure, so it is tested on its own.
 */
export function ticketsFor<P extends { station?: string | null }>(printers: P[], d: KotData): { printer: P; ticket: KotData }[] {
  const out: { printer: P; ticket: KotData }[] = [];
  for (const p of printers) {
    const items = p.station ? d.items.filter((i) => (i.station ?? d.station ?? null) === p.station) : d.items;
    if (!items.length) continue;
    out.push({ printer: p, ticket: { ...d, items, station: p.station ?? d.station ?? null } });
  }
  return out;
}
