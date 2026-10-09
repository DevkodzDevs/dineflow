/**
 * Which ready room an arrival should go to when the one booked for them is not ready yet.
 * Same room type only (the guest paid for it), free of other stays for those nights, ready by the
 * property's own rule — inspected when inspection is required, cleaned or inspected otherwise.
 * Inspected beats clean, the same floor beats another, then the lowest number.
 */
export type SRoom = { id: string; number: string; floor: number; status: string; condition?: string | null; room_type_id: string | null };
export type SStay = { id: string; room_id: string | null; status: string; check_in: string; check_out: string };

export const isReady = (condition: string | null | undefined, inspectRule: boolean) =>
  inspectRule ? condition === "inspected" : condition === "inspected" || condition === "clean";

export function suggestRoom(b: SStay, rooms: SRoom[], stays: SStay[], inspectRule: boolean): SRoom | null {
  if (b.status !== "reserved" || !b.room_id) return null;
  const cur = rooms.find((r) => r.id === b.room_id);
  if (!cur || isReady(cur.condition, inspectRule)) return null;
  const clash = (roomId: string) => stays.some((x) => x.id !== b.id && x.room_id === roomId && (x.status === "reserved" || x.status === "checked_in") && x.check_in < b.check_out && x.check_out > b.check_in);
  const rank = (r: SRoom) => (r.condition === "inspected" ? 0 : 2) + (r.floor === cur.floor ? 0 : 1);
  return rooms
    .filter((r) => r.id !== cur.id && r.room_type_id === cur.room_type_id && r.status === "available" && isReady(r.condition, inspectRule) && !clash(r.id))
    .sort((a, z) => rank(a) - rank(z) || a.number.localeCompare(z.number, undefined, { numeric: true }))[0] ?? null;
}
