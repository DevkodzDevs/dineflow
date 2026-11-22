/**
 * What is on this device and not yet on the server, drawn as if it were (2026-11-22, offline Step 2 — the owner: "the
 * application must work offline too").
 *
 * The outbox is the only record of an order taken with no line. Until now it was a count on a pill: the table it was taken
 * on still read Free, its dishes could not be added to, and it could not be billed until the line came back. These pure
 * functions turn the queued jobs into the same shape the floor already draws (`FloorOrder`), so the Orders screen, the till
 * and the offline bill (`/billing/local`) show one truth:
 *
 *   place_order            → an order with the id `local:<client_id>`, its dishes "ordered"
 *   place_order + add_to   → more dishes on the server order it names
 *   place_order + add_to_client → more dishes on an order that is itself still here
 *   bill_settle            → that order is paid: it leaves the floor and its table is free again
 *
 * Nothing here reads the network, the clock or the store — the callers pass the jobs in — so it is tested as arithmetic.
 */
import type { Job } from "./db";

/** One dish as the till queued it: what it was called and what it cost on the device at that moment. */
export type LocalLine = { name: string; qty: number; price: number; gstRate: number | null; note?: string | null; extras?: string[] | null };
/** `Job.show` of a place_order job. */
export type OrderShow = { type: string; table_id: string | null; where: string; customer?: string | null; lines: LocalLine[] };
/** `Job.show` of a bill_settle job. */
export type PaidShow = { where: string; total: number; payments: { method: string; amount: number }[]; lines: LocalLine[]; discount: number; service: number; cgst: number; sgst: number; roundOff: number; subtotal: number };

export type FloorItem = { id: string; name_snapshot: string; qty: number; price_snapshot: number; status: string; created_at?: string | null; gst_rate?: number | null; notes?: string | null };
export type FloorOrder = { id: string; order_no: number; type: string; table_id: string | null; customer_name: string | null; created_at: string; token_no?: number | null; order_items: FloorItem[]; bills?: { status: string }[] | null;
  /** an order that is only on this device: the till's own word for where it is, for a device with no copy of the floor */
  where?: string };
/** The floor as the Orders screen last had it from the server, kept on the device (`snap:floor` in the cache store). */
export type FloorSnap = { orders: FloorOrder[]; tables: { id: string; name: string }[] };
export const FLOOR_SNAP = "snap:floor";

export const LOCAL = "local:";
export const isLocal = (id: string) => id.startsWith(LOCAL);
export const cidOf = (id: string) => id.slice(LOCAL.length);

type Args = { add_to?: string; add_to_client?: string; client_id?: string; order_id?: string; order_client?: string };
const args = (j: Job) => j.args as Args;
const show = (j: Job) => (j.show ?? null) as (OrderShow & PaidShow) | null;
const iso = (at: number) => new Date(at).toISOString();
const items = (j: Job): FloorItem[] => (show(j)?.lines ?? []).map((l, i) => ({
  id: `${j.id}:${i}`, name_snapshot: l.name, qty: l.qty, price_snapshot: l.price, status: "pending", created_at: iso(j.at), gst_rate: l.gstRate, notes: l.note ?? null,
}));
const byTime = (a: Job, b: Job) => a.at - b.at;

/** The order a bill_settle job pays, as a floor id. */
const paidRef = (j: Job) => (args(j).order_id ? args(j).order_id! : LOCAL + args(j).order_client);
/** Every order with a payment waiting on this device, and what was taken. */
export function paidHere(jobs: Job[]): Map<string, { job: Job; show: PaidShow | null }> {
  const m = new Map<string, { job: Job; show: PaidShow | null }>();
  jobs.filter((j) => j.kind === "bill_settle").sort(byTime).forEach((j) => m.set(paidRef(j), { job: j, show: show(j) }));
  return m;
}

/** An order placed on this device that has not gone yet, with everything added to it since. */
export function localOrders(jobs: Job[]): FloorOrder[] {
  const sorted = [...jobs].sort(byTime);
  return sorted.filter((j) => j.kind === "place_order" && !args(j).add_to && !args(j).add_to_client && args(j).client_id && show(j)).map((j) => {
    const s = show(j)!; const cid = args(j).client_id!;
    const more = sorted.filter((x) => x.kind === "place_order" && args(x).add_to_client === cid).flatMap(items);
    return { id: LOCAL + cid, order_no: 0, type: s.type, table_id: s.table_id, customer_name: s.customer ?? null, created_at: iso(j.at), order_items: [...items(j), ...more], bills: [], where: s.where || undefined };
  });
}

/**
 * The floor with this device's work on it: the server's open orders with the dishes queued for them, then the orders that
 * exist only here — and none that has been paid here. A local order on a table the server already has an order on is kept
 * (both are real; the server joins or separates them when it lands).
 */
export function floorWith<O extends FloorOrder>(orders: O[], jobs: Job[]): (O | FloorOrder)[] {
  if (!jobs.length) return orders;
  const paid = paidHere(jobs); const sorted = [...jobs].sort(byTime);
  const server = orders.filter((o) => !paid.has(o.id)).map((o) => {
    const more = sorted.filter((j) => j.kind === "place_order" && args(j).add_to === o.id).flatMap(items);
    return more.length ? { ...o, order_items: [...o.order_items, ...more] } : o;
  });
  return [...server, ...localOrders(jobs).filter((o) => !paid.has(o.id))];
}

/**
 * One order for the offline bill: by server id from the device's copy of the floor, or by `local:<client_id>` from the outbox.
 * `gone` is a local order whose job is no longer here — it has reached the server, and the live screens have it now.
 */
export function orderFor(ref: string, snap: FloorSnap | null, jobs: Job[]): { order: FloorOrder | null; paid: PaidShow | null; paidAt: number | null; gone: boolean } {
  const p = paidHere(jobs).get(ref);
  const all = isLocal(ref) ? localOrders(jobs) : floorWith(snap?.orders ?? [], jobs.filter((j) => j.kind !== "bill_settle"));
  const order = all.find((o) => o.id === ref) ?? null;
  return { order, paid: p?.show ?? null, paidAt: p ? p.job.at : null, gone: isLocal(ref) && !order && !p };
}

/** Where an order is, in the words the floor uses: the table's name, or what kind of order it is. */
export const whereOf = (o: { type: string; table_id: string | null; where?: string }, tables: { id: string; name: string }[]) =>
  (o.table_id && (tables.find((t) => t.id === o.table_id)?.name || o.where)) || (o.type === "takeaway" ? "Takeaway" : o.type === "delivery" ? "Delivery" : o.type === "room_service" ? "Room service" : "Table");
