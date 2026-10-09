"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { z } from "zod/v4";
import { askJson, aiEnabled, VOICE } from "@/lib/ai";
import { salesFacts, readyIdeas, inAudience, type Idea, type Facts } from "@/lib/marketing";

const ok = () => { revalidatePath("/customers"); return { ok: true as const }; };

/** A customer by phone: created on first sight, otherwise updated. Tags arrive comma-separated. */
export async function saveCustomer(fd: FormData) {
  const s = await createClient();
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const date = (k: string) => (str(k) ? str(k) : null);
  const tags = [...new Set(str("tags").split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const { data, error } = await s.rpc("customer_upsert", {
    p_phone: str("phone"), p_name: str("name") || null, p_email: str("email") || null,
    p_birthday: date("birthday"), p_anniversary: date("anniversary"), p_tags: tags, p_notes: str("notes") || null,
  });
  if (error) return { error: error.message };
  return { ...ok(), id: data as string };
}

/** Points given or taken by hand, with a reason. Returns the new balance. */
export async function adjustPoints(customerId: string, points: number, note: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("loyalty_adjust", { p_customer_id: customerId, p_points: points, p_note: note || null });
  if (error) return { error: error.message };
  return { ...ok(), balance: Number(data) };
}

export type HistoryRow = { id: string; bill_no: number; total: number; paid_at: string | null; points_earned: number; points_redeemed: number; coupon_code: string | null;
  orders: { order_no: number; type: string; order_items: { name_snapshot: string; qty: number; status: string }[] } | null };
/** What this guest has had with us: paid bills, newest first, with the dishes on each. */
export async function customerHistory(customerId: string) {
  const s = await createClient();
  const [{ data: bills, error }, { data: ledger }] = await Promise.all([
    s.from("bills").select("id, bill_no, total, paid_at, points_earned, points_redeemed, coupon_code, orders(order_no, type, order_items(name_snapshot, qty, status))")
      .eq("customer_id", customerId).eq("status", "paid").order("paid_at", { ascending: false }).limit(50),
    s.from("loyalty_ledger").select("points, kind, note, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(30),
  ]);
  if (error) return { error: error.message };
  return { ok: true as const, bills: (bills ?? []) as unknown as HistoryRow[], ledger: (ledger ?? []) as { points: number; kind: string; note: string | null; created_at: string }[] };
}

/* ── Marketing ideas from the last 30 days ──────────────────────────────────────────────────── */
const ideaSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().max(70),
    why: z.string().max(200).describe("The number from the facts that makes this worth doing"),
    audience: z.enum(["all", "regulars", "lapsed", "new", "points"]),
    offer: z.string().max(90),
    when: z.string().max(70),
    message: z.string().max(330).describe("The WhatsApp message to the guest. Starts 'Hi {name},'. Mentions the place by name."),
  })).min(1).max(4),
});

/**
 * Up to four campaigns built on this property's own numbers: what sells, what does not, the quiet
 * day and daypart, and who has lapsed, is new, is a regular or has points. With a key the model
 * writes them from those facts; without one, `readyIdeas` writes them from the same facts, so the
 * owner always gets something real. Nothing is sent from here — each idea is a list to message.
 */
export async function marketingIdeas(): Promise<{ ok: true; ideas: Idea[]; facts: Facts; ai: boolean } | { error: string }> {
  const s = await createClient(); const session = await requireSession(); const r = session.restaurant;
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: lines, error }, { data: people }] = await Promise.all([
    s.from("order_items").select("order_id, name_snapshot, qty, price_snapshot, created_at, orders!inner(status)").gte("created_at", since30).neq("orders.status", "cancelled").limit(20000),
    s.from("customers").select("visits, last_visit_at, first_visit_at, points").limit(5000),
  ]);
  if (error) return { error: error.message };
  const byOrder = new Map<string, { id: string; created_at: string; total: number }>();
  for (const l of lines ?? []) { const o = byOrder.get(l.order_id) ?? { id: l.order_id, created_at: l.created_at, total: 0 }; o.total += Number(l.qty) * Number(l.price_snapshot); byOrder.set(l.order_id, o); }
  const min = Number(r.loyalty_min_redeem ?? 50);
  const ppl = people ?? [];
  const facts = salesFacts([...byOrder.values()], (lines ?? []).map((l) => ({ name: l.name_snapshot, qty: Number(l.qty) })), {
    customers: ppl.length, lapsed: ppl.filter((c) => inAudience("lapsed", c, min)).length, new_30d: ppl.filter((c) => inAudience("new", c, min)).length,
    regulars: ppl.filter((c) => inAudience("regulars", c, min)).length, with_points: r.loyalty_enabled ? ppl.filter((c) => inAudience("points", c, min)).length : 0,
  });
  if (!aiEnabled()) return { ok: true, ideas: readyIdeas(facts, r.name), facts, ai: false };
  const ask = await askJson({ schema: ideaSchema, effort: "low", maxTokens: 3000,
    system: `You plan small, practical campaigns for an independent Indian ${r.property_type === "restaurant" ? "restaurant" : "hotel restaurant"} called ${r.name}. Use only the facts given; every idea must rest on one of them and say which in "why". Offers must be modest and affordable (10–15% off, a free dessert or drink, a combo) — never a deep discount. Pick an audience that has people in it. ${VOICE}`,
    user: `Last 30 days at ${r.name}: ${JSON.stringify(facts)}. Loyalty points are ${r.loyalty_enabled ? "on" : "off"}. Give up to four campaign ideas, the most valuable first.` });
  if (!ask.ok) return { ok: true, ideas: readyIdeas(facts, r.name), facts, ai: false };
  return { ok: true, ideas: ask.data.ideas.filter((i) => i.audience !== "points" || r.loyalty_enabled), facts, ai: true };
}
