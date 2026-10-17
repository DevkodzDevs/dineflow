/**
 * Where a table is, in one word and one colour — the same answer on the floor, the till's order line
 * and Billing (globals.css SIMPLE SERVICE, `.st-*`). Read in the order a waiter cares: a printed bill
 * first (they are waiting to pay), then food waiting at the pass, then food on the fire, then a ticket
 * the kitchen has not started; everything served is a table eating.
 */
export type Svc = "free" | "hold" | "new" | "cook" | "ready" | "eat" | "bill";
export type SvcLine = { status: string; created_at?: string | null };

export function orderState(items: SvcLine[], billPrinted = false): Exclude<Svc, "free" | "hold"> {
  if (billPrinted) return "bill";
  const live = items.filter((i) => i.status !== "cancelled");
  if (live.some((i) => i.status === "ready")) return "ready";
  if (live.some((i) => i.status === "preparing")) return "cook";
  if (live.some((i) => i.status === "pending")) return "new";
  return live.length ? "eat" : "new";
}

/** Late: a dish still waiting or cooking past the kitchen's own target (Settings → Kitchen). */
export function isLate(items: SvcLine[], lateAtMin: number, fallbackFrom: string, now = Date.now()): boolean {
  return items.some((i) => (i.status === "pending" || i.status === "preparing")
    && now - new Date(i.created_at ?? fallbackFrom).getTime() >= lateAtMin * 60000);
}

/** The word each state is said with (lib/say.ts). */
export const SVC_WORD = { free: "free", hold: "reserved", new: "ordered", cook: "cooking", ready: "food_ready", eat: "eating", bill: "bill" } as const;
