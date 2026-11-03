/** The chip a channel order's ticket carries (0163, 2026-11-03): where it came from and its reference, short enough to read
 *  across the pass — "QR · 2fee", "Swiggy · 040011". The reference used to sit in `orders.notes` and showed as the amber
 *  cooking-request pill. The whole reference stays in the chip's title. */
export type ChannelOrder = {
  display_id: string | null;
  external_id: string;
  table_id?: string | null;
  room_id?: string | null;
  order_channels?: { kind: string; label: string } | null;
} | null | undefined;

export type ChannelChip = { source: string; ref: string; full: string; kind: "qr" | "web" | "app" };

const APP: Record<string, string> = { swiggy: "Swiggy", zomato: "Zomato", ondc: "ONDC" };

/** "TBL-…-2fee" / "0-2fee" → "2fee"; "TEST-040011" → "040011"; a long number keeps its last six */
export function shortRef(ref: string): string {
  const r = ref.trim();
  const dash = r.lastIndexOf("-");
  const tail = dash >= 0 && r.length - dash - 1 >= 3 ? r.slice(dash + 1) : r;
  return tail.length > 8 ? tail.slice(-6) : tail;
}

/** the source word: a guest's table order is QR, a room's (0170) Room, the property's own site is Web, an app by its name; any other channel by
 *  its label's first part ("Magicpin — manoooo" → "Magicpin") */
export function channelSource(kind: string | null | undefined, label: string | null | undefined, atTable: boolean, atRoom = false): { source: string; kind: ChannelChip["kind"] } {
  if (kind === "website" && atRoom) return { source: "Room", kind: "qr" };
  if (kind === "website") return atTable ? { source: "QR", kind: "qr" } : { source: "Web", kind: "web" };
  if (kind && APP[kind]) return { source: APP[kind], kind: "app" };
  const name = (label ?? "").split(/\s+[—–-]\s+/)[0].trim();
  return { source: name ? (name.length > 12 ? `${name.slice(0, 11)}…` : name) : "Online", kind: atTable ? "qr" : "app" };
}

export function channelChip(o: ChannelOrder): ChannelChip | null {
  const full = (o?.display_id ?? o?.external_id ?? "").trim();
  if (!o || !full) return null;
  const s = channelSource(o.order_channels?.kind, o.order_channels?.label, !!o.table_id, !!o.room_id);
  return { source: s.source, kind: s.kind, ref: shortRef(full), full };
}

/** A room-service ticket's heading: the room, short enough never to be cut (2026-11-03). The order's name is "Room 102 · Priya"
 *  (the till and the room's QR both write it so); the kitchen showed "Room · Room 102 · Priya", cut to "Room · Room 1…" — the
 *  number lost. The guest's name stays off the pass, as on the order board. A name not in that shape keeps "Room · name". */
export function roomLabel(customerName: string | null | undefined): string {
  const n = (customerName ?? "").trim();
  const m = /^Room\s+([^\s·]+)/i.exec(n);
  return m ? `Room ${m[1]}` : n ? `Room · ${n}` : "Room service";
}
