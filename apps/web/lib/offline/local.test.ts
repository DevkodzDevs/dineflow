/**
 * Offline Step 2 (2026-11-22): an order taken, added to, billed and paid with no line — and what happens when the line
 * comes back. Two halves:
 *   - the picture (local.ts): the outbox drawn as the floor's own orders;
 *   - the sending (sync.ts): the order goes first, what hangs on it after, the bill is raised by the server (its number is
 *     the server's), and a payment is never settled short.
 * The store is a real (stand-in) IndexedDB; only the network at the bottom is replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "./db";
import { floorWith, localOrders, orderFor, paidHere, whereOf, LOCAL, type FloorOrder, type OrderShow, type PaidShow } from "./local";

/* ── the seam: Supabase as the jobs see it ── */
type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
const server = { orders: new Map<string, string>(), bills: [] as { id: string; order_id: string; total: number; status: string }[], failPlace: null as string | null, total: 0 };
const rpc = async (fn: string, args: Record<string, unknown>) => {
  calls.push({ fn, args });
  if (fn === "place_order") { if (server.failPlace) return { data: null, error: { message: server.failPlace } }; server.orders.set(args.p_client_id as string, "o-" + (args.p_client_id as string)); return { data: "o-" + args.p_client_id, error: null }; }
  if (fn === "order_add_items") return { data: null, error: null };
  if (fn === "generate_bill") { if (server.bills.some((b) => b.order_id === args.p_order_id)) return { data: null, error: { message: "bill already exists" } }; server.bills.push({ id: "b-" + args.p_order_id, order_id: args.p_order_id as string, total: server.total, status: "unpaid" }); return { data: "b-" + args.p_order_id, error: null }; }
  if (fn === "settle_bill") { const b = server.bills.find((x) => x.id === args.p_bill_id)!; b.status = "paid"; return { data: null, error: null }; }
  return { data: null, error: null };
};
/** just enough of the query builder for `orders by client_id` and `the order's last bill` */
const from = (table: string) => {
  const f: Record<string, unknown> = {};
  const q = { select: () => q, eq: (k: string, v: unknown) => { f[k] = v; return q; }, neq: () => q, order: () => q, limit: () => q,
    maybeSingle: async () => {
      if (table === "orders") { const id = server.orders.get(f.client_id as string); return { data: id ? { id } : null, error: null }; }
      if (table === "bills") { const b = server.bills.filter((x) => x.order_id === f.order_id).at(-1); return { data: b ?? null, error: null }; }
      return { data: null, error: null };
    } };
  return q;
};
vi.mock("@/lib/supabase/lazy", () => ({ getClient: async () => ({ rpc, from }) }));

const { flush, fitPayments, waitsOn } = await import("./sync");
const { allJobs, delJob, putJob } = await import("./db");

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const clear = async () => { for (const j of await allJobs()) await delJob(j.id); };
beforeEach(async () => { await tick(20); await clear(); calls.length = 0; server.orders.clear(); server.bills.length = 0; server.failPlace = null; server.total = 0; });

const T3 = "t-3";
const dishes = (n: [string, number, number, (number | null)?][]) => n.map(([name, qty, price, gstRate]) => ({ name, qty, price, gstRate: gstRate ?? null }));
let clock = 1_700_000_000_000;
const job = (kind: Job["kind"], args: Record<string, unknown>, show?: unknown): Job => ({ id: crypto.randomUUID(), kind, args, at: (clock += 1000), tries: 0, label: kind, ...(show ? { show } : {}) });
const placed = (cid: string, lines = dishes([["Dosa", 2, 80], ["Coffee", 1, 30]]), over: Partial<OrderShow> = {}) =>
  job("place_order", { table_id: T3, type: "dine_in", items: [], client_id: cid }, { type: "dine_in", table_id: T3, where: "T3", lines, ...over } satisfies OrderShow);
const added = (ref: { add_to?: string; add_to_client?: string }, lines = dishes([["Vada", 1, 40]])) =>
  job("place_order", { ...ref, items: [], client_id: crypto.randomUUID() }, { type: "dine_in", table_id: T3, where: "T3", lines } satisfies OrderShow);
const paidShow = (total: number): PaidShow => ({ where: "Table T3", total, payments: [{ method: "cash", amount: total }], lines: [], discount: 0, service: 0, cgst: 0, sgst: 0, roundOff: 0, subtotal: total });
const paid = (ref: { order_id?: string; order_client?: string }, total: number, payments = [{ method: "cash", amount: total }]) =>
  job("bill_settle", { ...ref, disc_pct: 0, disc_amt: 0, payments, total, client_id: crypto.randomUUID() }, paidShow(total));
const serverOrder = (id: string, table: string | null = "t-1"): FloorOrder => ({ id, order_no: 41, type: "dine_in", table_id: table, customer_name: null, created_at: new Date(clock).toISOString(), order_items: [{ id: "i1", name_snapshot: "Idli", qty: 2, price_snapshot: 50, status: "served" }], bills: [] });
const sum = (o: FloorOrder) => o.order_items.reduce((t, i) => t + i.qty * i.price_snapshot, 0);

describe("the floor draws what is on the device", () => {
  it("an order taken offline is an order on its table, with its dishes and their prices", () => {
    const [o] = localOrders([placed("c1")]);
    expect(o.id).toBe(LOCAL + "c1"); expect(o.table_id).toBe(T3); expect(o.order_no).toBe(0);
    expect(o.order_items.map((i) => [i.name_snapshot, i.qty, i.price_snapshot, i.status])).toEqual([["Dosa", 2, 80, "pending"], ["Coffee", 1, 30, "pending"]]);
    expect(sum(o)).toBe(190);
  });
  it("dishes added to it offline join the same order, in the order they were taken", () => {
    const first = placed("c1"); const more = added({ add_to_client: "c1" });
    const [o] = localOrders([more, first]);   // the store gives no order: time decides
    expect(o.order_items.map((i) => i.name_snapshot)).toEqual(["Dosa", "Coffee", "Vada"]); expect(sum(o)).toBe(230);
  });
  it("dishes queued for a server order show on that order — and only on it", () => {
    const floor = floorWith([serverOrder("o-9"), serverOrder("o-8", "t-2")], [added({ add_to: "o-9" })]);
    expect(sum(floor.find((o) => o.id === "o-9")!)).toBe(140); expect(sum(floor.find((o) => o.id === "o-8")!)).toBe(100);
  });
  it("an order paid on the device leaves the floor — a server order and a local one alike", () => {
    const jobs = [placed("c1"), paid({ order_client: "c1" }, 190), paid({ order_id: "o-9" }, 100)];
    expect(floorWith([serverOrder("o-9"), serverOrder("o-8", "t-2")], jobs).map((o) => o.id)).toEqual(["o-8"]);
    expect([...paidHere(jobs).keys()].sort()).toEqual([LOCAL + "c1", "o-9"].sort());
  });
  it("with nothing queued the floor is the server's, untouched (the same array)", () => {
    const orders = [serverOrder("o-9")]; expect(floorWith(orders, [])).toBe(orders);
  });
  it("a job queued before today (no `show`) draws nothing rather than a blank order", () => {
    expect(localOrders([job("place_order", { table_id: T3, client_id: "old" })])).toEqual([]);
  });
  it("the offline bill finds its order: local by client id, the server's from the device's copy, with what was queued on it", () => {
    const snap = { orders: [serverOrder("o-9")], tables: [{ id: "t-1", name: "T1" }, { id: T3, name: "T3" }] };
    const jobs = [placed("c1"), added({ add_to: "o-9" })];
    expect(sum(orderFor(LOCAL + "c1", snap, jobs).order!)).toBe(190);
    expect(sum(orderFor("o-9", snap, jobs).order!)).toBe(140);
    expect(orderFor("o-9", null, jobs).order).toBeNull();                       // no copy of the floor on this device
    expect(orderFor(LOCAL + "gone", snap, jobs).gone).toBe(true);               // its job has left: it reached the server
    const after = [...jobs, paid({ order_client: "c1" }, 190)];
    const f = orderFor(LOCAL + "c1", snap, after); expect(f.paid?.total).toBe(190); expect(f.gone).toBe(false);
    expect(whereOf(orderFor(LOCAL + "c1", snap, jobs).order!, snap.tables)).toBe("T3");
    expect(whereOf(orderFor(LOCAL + "c1", null, jobs).order!, [])).toBe("T3");  // no floor copy: the till's own word
    expect(whereOf({ type: "takeaway", table_id: null }, [])).toBe("Takeaway");
  });
});

describe("payments fitted to the bill the server raised", () => {
  it("exact stays exact", () => { expect(fitPayments([{ method: "upi", amount: 200 }], 200)).toEqual({ pays: [{ method: "upi", amount: 200 }], short: 0 }); });
  it("cash over the total is change: the cash row is cut, never the UPI", () => {
    expect(fitPayments([{ method: "upi", amount: 100 }, { method: "cash", amount: 150 }], 200).pays).toEqual([{ method: "upi", amount: 100 }, { method: "cash", amount: 100 }]);
  });
  it("a row cut to nothing is dropped", () => { expect(fitPayments([{ method: "upi", amount: 200 }, { method: "cash", amount: 50 }], 200).pays).toEqual([{ method: "upi", amount: 200 }]); });
  it("less than the bill is short by the difference, and nothing is changed", () => {
    const pays = [{ method: "cash", amount: 180 }]; const r = fitPayments(pays, 200); expect(r.short).toBe(20); expect(r.pays).toBe(pays);
  });
  it("a paisa of rounding is not short", () => { expect(fitPayments([{ method: "cash", amount: 199.995 }], 200).short).toBe(0); });
});

describe("the line comes back", () => {
  it("order, then its extra dishes, then its bill and payment — in that order, against the order the server made", async () => {
    server.total = 230;
    // stored out of order on purpose: time decides, and the dependents wait for their order whatever the store returns
    const p = paid({ order_client: "c1" }, 230); const a = added({ add_to_client: "c1" }); const o = placed("c1");
    p.at = o.at + 2000; a.at = o.at + 1000;
    for (const j of [p, a, o]) await putJob(j);
    expect(await flush()).toBe(3);
    expect(calls.map((c) => c.fn)).toEqual(["place_order", "order_add_items", "generate_bill", "settle_bill"]);
    expect(calls[1].args.p_order_id).toBe("o-c1"); expect(calls[2].args.p_order_id).toBe("o-c1"); expect(calls[3].args.p_bill_id).toBe("b-o-c1");
    expect(server.bills[0].status).toBe("paid"); expect(await allJobs()).toEqual([]);
  });
  it("while the order itself cannot go, nothing that hangs on it is tried", async () => {
    server.failPlace = "something odd";
    const o = placed("c1"); await putJob(o); await putJob(added({ add_to_client: "c1" })); await putJob(paid({ order_client: "c1" }, 230));
    expect(await flush()).toBe(0);
    expect(calls.map((c) => c.fn)).toEqual(["place_order"]);
    const left = await allJobs(); expect(left).toHaveLength(3);
    expect(left.filter((j) => waitsOn(j)).every((j) => j.tries === 0 && !j.held)).toBe(true);   // they have not been tried, so not counted against
  });
  it("a server order billed offline: the server raises the bill (its number is the server's) and the payment settles it", async () => {
    server.total = 100; await putJob(paid({ order_id: "o-9" }, 100));
    expect(await flush()).toBe(1);
    expect(calls.map((c) => c.fn)).toEqual(["generate_bill", "settle_bill"]);
    expect(calls[0].args).toMatchObject({ p_order_id: "o-9", p_discount_pct: 0, p_discount_amount: 0 });
  });
  it("the discount and the service-charge switch chosen offline reach the server's bill", async () => {
    server.total = 90; const j = paid({ order_id: "o-9" }, 90); j.args = { ...j.args, disc_pct: 10, disc_amt: 5, service_on: false }; await putJob(j);
    await flush();
    expect(calls[0].args).toMatchObject({ p_discount_pct: 10, p_discount_amount: 5, p_service_charge: false });
  });
  it("if the bill comes to more than was taken, it is left unpaid and the job waits for a person — never settled short", async () => {
    server.total = 260; await putJob(paid({ order_id: "o-9" }, 230));
    expect(await flush()).toBe(0);
    expect(calls.map((c) => c.fn)).toEqual(["generate_bill"]);            // raised, not settled
    expect(server.bills[0].status).toBe("unpaid");
    const [j] = await allJobs(); expect(j.held).toBe(true); expect(j.error).toMatch(/short by 30\.00/);
  });
  it("if the bill comes to less, cash over it is change and the bill is settled for what it came to", async () => {
    server.total = 200; await putJob(paid({ order_id: "o-9" }, 230, [{ method: "cash", amount: 230 }]));
    expect(await flush()).toBe(1);
    expect(calls[1].args.p_payments).toEqual([{ method: "cash", amount: 200 }]);
  });
  it("sent twice, it bills once: a bill already there is used, a paid one ends the job", async () => {
    server.total = 100; server.bills.push({ id: "b-x", order_id: "o-9", total: 100, status: "unpaid" });
    await putJob(paid({ order_id: "o-9" }, 100)); await flush();
    expect(calls.map((c) => c.fn)).toEqual(["settle_bill"]); expect(calls[0].args.p_bill_id).toBe("b-x");
    calls.length = 0; await putJob(paid({ order_id: "o-9" }, 100)); expect(await flush()).toBe(1);
    expect(calls).toEqual([]);                                             // already paid: nothing sent, the job is done
  });
  it("a payment for an order that never reached the server is held, not dropped", async () => {
    await putJob(paid({ order_client: "nowhere" }, 100));
    expect(await flush()).toBe(0);
    const [j] = await allJobs(); expect(j.held).toBe(true); expect(j.error).toMatch(/order not found/);
  });
});
